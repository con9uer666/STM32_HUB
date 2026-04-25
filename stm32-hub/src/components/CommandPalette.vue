<template>
  <teleport to="body">
    <transition name="cp-fade">
      <div v-if="visible" class="cp-backdrop" @click="close" @mousedown.self>
        <div class="cp-panel" @click.stop>
          <div class="cp-input-wrap">
            <span class="cp-prompt">{{ mode === 'cmd' ? '>' : '❯' }}</span>
            <input
              ref="inputRef"
              v-model="query"
              class="cp-input"
              :placeholder="placeholder"
              @keydown="onKey"
              @input="onInput"
              spellcheck="false"
              autocomplete="off"
            />
            <span class="cp-hint">Esc 关闭</span>
          </div>

          <div class="cp-meta">
            <span class="chip" :class="{ active: mode === 'project' }" @click="switchMode('project')">项目</span>
            <span class="chip" :class="{ active: mode === 'cmd' }" @click="switchMode('cmd')">命令 &gt;</span>
            <span class="cp-count">{{ results.length }} 项结果</span>
          </div>

          <ul v-if="results.length" class="cp-list" ref="listRef">
            <li
              v-for="(r, i) in results"
              :key="r.key"
              class="cp-item"
              :class="{ selected: i === selected }"
              @mouseenter="selected = i"
              @click="runAt(i)"
            >
              <span class="cp-icon">{{ r.icon }}</span>
              <div class="cp-body">
                <div class="cp-title">{{ r.title }}</div>
                <div v-if="r.subtitle" class="cp-sub">{{ r.subtitle }}</div>
              </div>
              <span v-if="r.hint" class="cp-kbd">{{ r.hint }}</span>
            </li>
          </ul>
          <div v-else class="cp-empty">
            <span>{{ query ? '没有匹配项' : '开始输入以过滤…' }}</span>
          </div>

          <div class="cp-footer">
            <span><b>↑↓</b> 选择</span>
            <span><b>⏎</b> 执行</span>
            <span><b>&gt;</b> 切换命令</span>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useProjectsStore } from '@/stores/projects'
import { api } from '@/api'
import type { Project } from '@/types'

interface Result {
  key: string
  icon: string
  title: string
  subtitle?: string
  hint?: string
  run: () => unknown | Promise<unknown>
}

const router = useRouter()
const msg = useMessage()
const store = useProjectsStore()

const visible = ref(false)
const query = ref('')
const selected = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

type Mode = 'project' | 'cmd'
const mode = ref<Mode>('project')

const placeholder = computed(() =>
  mode.value === 'cmd'
    ? '输入命令，例如 "扫描"、"刷新"、"设置"'
    : '搜索工程名、路径或标签，或输入 > 切换到命令'
)

function open(initial = '') {
  query.value = initial
  mode.value = initial.startsWith('>') ? 'cmd' : 'project'
  if (mode.value === 'cmd') query.value = initial.slice(1).trimStart()
  selected.value = 0
  visible.value = true
  nextTick(() => inputRef.value?.focus())
}

function close() {
  visible.value = false
  query.value = ''
  selected.value = 0
}

defineExpose({ open, close })

function switchMode(m: Mode) {
  mode.value = m
  query.value = ''
  selected.value = 0
  inputRef.value?.focus()
}

function onInput() {
  if (query.value.startsWith('>')) {
    mode.value = 'cmd'
    query.value = query.value.slice(1).trimStart()
  }
  selected.value = 0
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); close(); return }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!results.value.length) return
    selected.value = (selected.value + 1) % results.value.length
    scrollSelected()
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!results.value.length) return
    selected.value = (selected.value - 1 + results.value.length) % results.value.length
    scrollSelected()
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (results.value[selected.value]) runAt(selected.value)
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    mode.value = mode.value === 'cmd' ? 'project' : 'cmd'
    query.value = ''
    selected.value = 0
    return
  }
}

function scrollSelected() {
  nextTick(() => {
    const list = listRef.value
    if (!list) return
    const el = list.children[selected.value] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  })
}

async function runAt(i: number) {
  const r = results.value[i]
  if (!r) return
  close()
  await r.run()
}

// ---- Projects ----
function scoreProject(p: Project, q: string) {
  const name = (p?.name ?? '').toLowerCase()
  const path = (p?.path ?? '').toLowerCase()
  const tags = Array.isArray(p?.tags) ? p.tags.join(' ').toLowerCase() : ''
  const note = (p?.note ?? '').toLowerCase()
  const hay = `${name} ${path} ${tags} ${note}`
  if (!q) return 1
  const ql = q.toLowerCase()
  if (name.includes(ql)) return 3
  if (path.includes(ql)) return 2
  if (hay.includes(ql)) return 1
  return 0
}

const projectResults = computed<Result[]>(() => {
  const q = query.value.trim()
  return store.projects
    .map(p => ({ p, s: scoreProject(p, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s
      if (!!b.p.pinned !== !!a.p.pinned) return a.p.pinned ? -1 : 1
      return (b.p.addedAt || 0) - (a.p.addedAt || 0)
    })
    .slice(0, 50)
    .map(({ p }) => {
      const tools: string[] = []
      if (p.tools?.keil) tools.push('Keil')
      if (p.tools?.vscode) tools.push('CMake')
      if (p.tools?.cubemx) tools.push('CubeMX')
      return {
        key: 'proj:' + p.id,
        icon: p.pinned ? '📌' : '📁',
        title: p.name ?? '(未命名)',
        subtitle: `${tools.join(' · ') || '—'}  ·  ${p.path ?? ''}`,
        run: () => router.push({ name: 'project', params: { id: p.id } })
      }
    })
})

// ---- Commands ----
const allCommands = computed<Result[]>(() => {
  const list: Result[] = [
    { key: 'nav:dashboard', icon: '🗂', title: '转到：仪表盘', hint: 'Ctrl+1', run: () => router.push('/') },
    { key: 'nav:stats', icon: '📊', title: '转到：统计面板', hint: 'Ctrl+2', run: () => router.push('/stats') },
    { key: 'nav:serial', icon: '🔌', title: '转到：串口助手', run: () => router.push('/serial') },
    { key: 'nav:toolbox', icon: '🧰', title: '转到：工具箱', hint: 'Ctrl+3', run: () => router.push('/toolbox') },
    { key: 'nav:settings', icon: '⚙', title: '转到：设置', hint: 'Ctrl+,', run: () => router.push('/settings') },
    { key: 'act:scan', icon: '📂', title: '扫描目录以批量添加工程', run: async () => {
        const dir = await api.dialog.openDirectory()
        if (!dir) return
        const loader = msg.loading('扫描中…', { duration: 0 })
        try {
          const r = await store.scanFolder(dir)
          loader.destroy()
          msg.success(`新增 ${r.added} 个，共 ${r.total} 个`)
          store.refreshGitInfo()
        } catch (e: any) { loader.destroy(); msg.error(e?.message ?? String(e)) }
      }
    },
    { key: 'act:addone', icon: '➕', title: '添加单个工程', run: async () => {
        const dir = await api.dialog.openDirectory()
        if (!dir) return
        const r = await store.addSingle(dir)
        if (!r.added) msg.warning(r.reason || '未识别')
        else { msg.success('已添加：' + r.project!.name); store.refreshGitInfo() }
      }
    },
    { key: 'act:refreshgit', icon: '🔄', title: '刷新所有 Git 状态', run: async () => {
        const loader = msg.loading('刷新 Git 状态…', { duration: 0 })
        try { await store.refreshGitInfo(); loader.destroy(); msg.success('状态已刷新') }
        catch (e: any) { loader.destroy(); msg.error(e?.message ?? String(e)) }
      }
    },
    { key: 'act:fetchall', icon: '⬇️', title: '批量 fetch 所有 Git 仓库', run: async () => {
        const repos = store.projects.map(p => p.path)
        if (!repos.length) return msg.warning('尚无工程')
        const loader = msg.loading(`fetch ${repos.length} 个仓库…`, { duration: 0 })
        try {
          const r = await api.git.batchFetch(repos)
          loader.destroy()
          const failed = Object.entries(r.results).filter(([, v]) => !v.ok)
          if (failed.length) msg.warning(`${repos.length - failed.length}/${repos.length} 成功`)
          else msg.success(`全部 ${repos.length} 个仓库已 fetch`)
          await store.refreshGitInfo()
        } catch (e: any) { loader.destroy(); msg.error(e?.message ?? String(e)) }
      }
    },
    { key: 'act:export', icon: '📤', title: '导出工程列表（JSON 到剪贴板）', run: async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(store.projects, null, 2))
          msg.success('已复制到剪贴板')
        } catch { msg.error('复制失败') }
      }
    },
    { key: 'act:rescan', icon: '✨', title: '重新扫描所有工程（刷新工具支持）', run: async () => {
        let n = 0
        for (const p of store.projects) {
          const det = await api.project.inspect(p.path)
          if (det) { await store.upsert({ ...p, tools: det.tools }); n++ }
        }
        msg.success(`已刷新 ${n} 个工程`)
      }
    },
    { key: 'act:clearfilter', icon: '🧹', title: '清除仪表盘筛选 / 搜索', run: () => {
        store.clearFilters()
        router.push('/')
      }
    },
    { key: 'view:grid', icon: '▦', title: '切换：卡片视图', run: () => { store.viewMode = 'grid'; router.push('/') } },
    { key: 'view:list', icon: '☰', title: '切换：列表视图', run: () => { store.viewMode = 'list'; router.push('/') } }
  ]
  return list
})

const commandResults = computed<Result[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return allCommands.value
  return allCommands.value.filter(c =>
    c.title.toLowerCase().includes(q) ||
    c.key.toLowerCase().includes(q)
  )
})

const results = computed<Result[]>(() =>
  mode.value === 'cmd' ? commandResults.value : projectResults.value
)

watch(query, () => { selected.value = 0 })
</script>

<style scoped>
.cp-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.55);
  backdrop-filter: blur(4px);
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 14vh;
}
.cp-panel {
  width: min(640px, 92vw);
  background: var(--bg-panel-2);
  border: 1px solid var(--border-hi);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 68vh;
}
.cp-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}
.cp-prompt {
  color: var(--accent);
  font-size: 18px;
  font-weight: 700;
  font-family: var(--font-mono);
}
.cp-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  color: var(--text-strong);
  font-family: inherit;
}
.cp-input::placeholder { color: var(--text-dim); }
.cp-hint {
  color: var(--text-muted);
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  font-family: var(--font-mono);
}

.cp-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  border-bottom: 1px solid var(--border-soft);
  background: var(--bg-panel);
}
.chip {
  font-size: 11px;
  color: var(--text-muted);
  padding: 3px 9px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}
.chip:hover { border-color: var(--border-hi); color: var(--text); }
.chip.active {
  background: rgba(59,130,246,.15);
  border-color: var(--accent);
  color: var(--accent-hover);
}
.cp-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-dim);
}

.cp-list {
  list-style: none;
  padding: 6px;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}
.cp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.1s;
}
.cp-item.selected {
  background: rgba(59,130,246,.14);
}
.cp-icon { font-size: 15px; width: 20px; text-align: center; }
.cp-body { flex: 1; min-width: 0; }
.cp-title {
  font-size: 13.5px;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cp-kbd {
  font-size: 10px;
  color: var(--text-dim);
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.cp-empty {
  padding: 32px 18px;
  text-align: center;
  color: var(--text-dim);
  font-size: 13px;
}

.cp-footer {
  display: flex;
  gap: 16px;
  padding: 9px 18px;
  border-top: 1px solid var(--border);
  background: var(--bg-panel);
  font-size: 11px;
  color: var(--text-muted);
}
.cp-footer b {
  display: inline-block;
  padding: 1px 5px;
  background: var(--bg-app);
  border: 1px solid var(--border);
  border-radius: 3px;
  font-weight: 600;
  margin-right: 4px;
  font-family: var(--font-mono);
  color: var(--text);
}

.cp-fade-enter-active, .cp-fade-leave-active { transition: opacity 0.15s; }
.cp-fade-enter-from, .cp-fade-leave-to { opacity: 0; }
.cp-fade-enter-active .cp-panel, .cp-fade-leave-active .cp-panel {
  transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.cp-fade-enter-from .cp-panel { transform: translateY(-12px); }
.cp-fade-leave-to .cp-panel { transform: translateY(-8px); }
</style>
