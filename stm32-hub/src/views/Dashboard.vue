<template>
  <div class="dashboard">
    <header class="hdr">
      <div class="title">
        <h2>我的 STM32 工程</h2>
        <span class="count">{{ store.projects.length }} 个工程 · 显示 {{ store.filtered.length }}</span>
      </div>
      <n-space>
        <n-input
          ref="searchInput"
          v-model:value="store.searchQuery"
          placeholder="Ctrl+K 搜索名称/路径/标签/备注"
          clearable
          style="width: 300px"
        >
          <template #prefix>🔍</template>
        </n-input>
        <n-select
          v-model:value="store.activeTags"
          multiple
          :options="tagOptions"
          placeholder="标签过滤"
          clearable
          style="width: 180px"
        />
        <n-select
          v-model:value="store.sortMode"
          :options="sortOptions"
          style="width: 150px"
        />
        <n-button-group>
          <n-button :type="store.viewMode === 'grid' ? 'primary' : 'default'" size="medium" @click="store.viewMode = 'grid'">
            ▦
          </n-button>
          <n-button :type="store.viewMode === 'list' ? 'primary' : 'default'" size="medium" @click="store.viewMode = 'list'">
            ☰
          </n-button>
        </n-button-group>
        <n-dropdown :options="batchOptions" @select="onBatch" trigger="click">
          <n-button>⋯ 批量</n-button>
        </n-dropdown>
        <n-button type="primary" @click="onScan">📂 扫描</n-button>
        <n-dropdown :options="createOptions" @select="onCreate" trigger="click">
          <n-button>➕ 添加 / 新建</n-button>
        </n-dropdown>
      </n-space>
    </header>

    <!-- Create new / copy CubeMX modal -->
    <n-modal
      v-model:show="showCreate"
      preset="card"
      :title="createMode === 'new' ? '新建空工程' : '从 CubeMX .ioc 配置复制'"
      style="width: 560px"
    >
      <n-form label-placement="left" label-width="110" :show-feedback="false" size="small">
        <n-form-item v-if="createMode === 'copy'" label="源 .ioc">
          <n-input
            :value="createSrcIoc"
            readonly
            placeholder="未选择"
            style="flex: 1"
          >
            <template #suffix>
              <n-button size="tiny" quaternary @click="pickSrcIoc">选择…</n-button>
            </template>
          </n-input>
        </n-form-item>
        <n-form-item label="父目录">
          <n-input :value="createParent" readonly placeholder="未选择" style="flex: 1">
            <template #suffix>
              <n-button size="tiny" quaternary @click="pickCreateParent">选择…</n-button>
            </template>
          </n-input>
        </n-form-item>
        <n-form-item label="工程名">
          <n-input v-model:value="createName" placeholder="例如 my_stm32_proj" />
        </n-form-item>
        <n-form-item v-if="createMode === 'new'" label=".ioc 模板">
          <div class="tpl-wrap">
            <n-select
              v-model:value="createTemplateId"
              :options="templateOptions"
              placeholder="选择 MCU 模板（不选则不生成 .ioc）"
              clearable
            />
            <div v-if="currentTemplateSummary" class="tpl-hint-inline">
              <span class="tpl-icon">ⓘ</span>{{ currentTemplateSummary }}
            </div>
          </div>
        </n-form-item>
        <n-form-item v-if="createMode === 'new'" label="选项">
          <n-space>
            <n-checkbox v-model:checked="createInitGit">初始化 Git 仓库</n-checkbox>
            <n-checkbox v-model:checked="createWithReadme">写入 README</n-checkbox>
          </n-space>
        </n-form-item>
        <n-form-item v-if="createMode === 'copy'" label="选项">
          <n-checkbox v-model:checked="copySiblings">一并复制 .mxproject / 同名周边文件</n-checkbox>
        </n-form-item>
      </n-form>
      <div v-if="createPreview" class="create-preview">
        将创建目录：<code>{{ createPreview }}</code>
      </div>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreate = false">取消</n-button>
          <n-button type="primary" :disabled="!canCreate" :loading="creating" @click="doCreate">
            {{ createMode === 'new' ? '创建' : '复制' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <RecentActivity v-if="store.projects.length" :days="14" @pick="onActivityPick" />

    <!-- Grid view -->
    <section v-if="store.viewMode === 'grid' && store.filtered.length" class="grid scroll-y">
      <ProjectCard
        v-for="p in store.filtered"
        :key="p.id"
        :project="p"
        :git-info="store.gitInfo[p.path]"
        @open="onOpenDetail"
        @launch="onLaunch"
        @remove="onRemove"
        @togglePin="onTogglePin"
        @terminal="onOpenTerminal"
        @copyPath="onCopyPath"
      />
    </section>

    <!-- List view -->
    <section v-else-if="store.viewMode === 'list' && store.filtered.length" class="list-view scroll-y">
      <n-data-table
        :columns="listColumns"
        :data="store.filtered"
        :row-props="rowProps"
        size="small"
        :single-line="false"
      />
    </section>

    <div v-else-if="store.loading" class="empty">加载中…</div>
    <div v-else-if="store.projects.length > 0" class="empty">
      <div class="empty-icon">🔍</div>
      <div class="empty-title">无匹配工程</div>
      <div class="empty-hint">搜索或标签过滤没有命中任何项。{{ store.projects.length }} 个工程被隐藏。</div>
      <n-space style="margin-top: 16px">
        <n-button type="primary" @click="store.clearFilters()">清除筛选</n-button>
      </n-space>
    </div>
    <div v-else class="empty">
      <div class="empty-icon">📦</div>
      <div class="empty-title">还没有工程</div>
      <div class="empty-hint">点击「扫描」批量导入父目录，或「添加」选单个工程</div>
      <n-space style="margin-top: 16px">
        <n-button type="primary" @click="onScan">扫描目录</n-button>
        <n-button @click="onAddSingle">添加工程</n-button>
      </n-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  useMessage, useDialog, NInput, NSelect, NButton, NButtonGroup, NSpace, NDropdown, NDataTable, NTag,
  NModal, NForm, NFormItem, NCheckbox
} from 'naive-ui'
import { useProjectsStore } from '@/stores/projects'
import { api } from '@/api'
import type { Project } from '@/types'
import ProjectCard from '@/components/ProjectCard.vue'
import RecentActivity from '@/components/RecentActivity.vue'

const store = useProjectsStore()
const router = useRouter()
const msg = useMessage()
const dialog = useDialog()
const searchInput = ref<any>(null)

const tagOptions = computed(() => store.allTags.map(t => ({ label: t, value: t })))

const sortOptions = [
  { label: '添加时间↓', value: 'added-desc' },
  { label: '添加时间↑', value: 'added-asc' },
  { label: '名称 A→Z', value: 'name-asc' },
  { label: '名称 Z→A', value: 'name-desc' }
]

const batchOptions = [
  { label: '🔄 刷新所有 Git 状态', key: 'batch-status' },
  { label: '⬇️ 批量 fetch 所有仓库', key: 'batch-fetch' },
  { label: '✨ 重新扫描所有工程', key: 'rescan-all' },
  { type: 'divider', key: 'd1' },
  { label: '📤 导出工程列表 (JSON)', key: 'export' },
  { label: '📥 导入工程列表 (JSON)', key: 'import' }
]

const createOptions = [
  { label: '➕ 添加已有工程', key: 'add-existing' },
  { label: '🆕 新建空工程', key: 'new-empty' },
  { label: '📋 从现有 CubeMX 配置复制', key: 'copy-cubemx' }
]

// Create modal state
const showCreate = ref(false)
const creating = ref(false)
const createMode = ref<'new' | 'copy'>('new')
const createParent = ref('')
const createName = ref('')
const createInitGit = ref(false)
const createWithReadme = ref(true)
const createSrcIoc = ref('')
const copySiblings = ref(true)
const createTemplateId = ref<string | null>(null)
const templates = ref<Array<{ id: string; name: string; mcu: string; summary?: string }>>([])

const templateOptions = computed(() =>
  templates.value.map(t => ({ label: t.name, value: t.id }))
)
const currentTemplateSummary = computed(() => {
  const t = templates.value.find(x => x.id === createTemplateId.value)
  return t?.summary || ''
})

const createPreview = computed(() => {
  if (!createParent.value || !createName.value) return ''
  const sep = createParent.value.includes('\\') ? '\\' : '/'
  return createParent.value.replace(/[/\\]+$/, '') + sep + createName.value
})
const canCreate = computed(() => {
  if (!createParent.value || !createName.value.trim()) return false
  if (createMode.value === 'copy' && !createSrcIoc.value) return false
  return true
})

function onCreate(key: string) {
  if (key === 'add-existing') {
    onAddSingle()
  } else if (key === 'new-empty') {
    createMode.value = 'new'
    createSrcIoc.value = ''
    showCreate.value = true
  } else if (key === 'copy-cubemx') {
    createMode.value = 'copy'
    showCreate.value = true
  }
}

async function pickCreateParent() {
  const dir = await api.dialog.openDirectory()
  if (dir) createParent.value = dir
}
async function pickSrcIoc() {
  const f = await api.dialog.openFile([{ name: 'CubeMX 配置', extensions: ['ioc'] }])
  if (f) {
    createSrcIoc.value = f
    // auto-fill name from filename if empty
    if (!createName.value) {
      const base = f.split(/[/\\]/).pop() || ''
      createName.value = base.replace(/\.ioc$/i, '') + '_copy'
    }
  }
}

async function doCreate() {
  if (!canCreate.value) return
  creating.value = true
  try {
    if (createMode.value === 'new') {
      const r = await api.project.create({
        parent: createParent.value,
        name: createName.value.trim(),
        initGit: createInitGit.value,
        withReadme: createWithReadme.value,
        templateId: createTemplateId.value || undefined
      })
      if (!r.ok) { msg.error(r.error || '创建失败'); return }
      msg.success(`已创建：${r.project!.name}`)
      await store.load()
      store.refreshGitInfo()
      showCreate.value = false
      const ioc = r.ioc
      const proj = r.project
      resetCreateForm()
      // If a template was used, offer to launch CubeMX so the user can configure peripherals.
      if (ioc) {
        dialog.success({
          title: '已生成 .ioc',
          content: `是否立即在 CubeMX 中打开配置外设？\n\n${ioc}`,
          positiveText: '打开 CubeMX',
          negativeText: '稍后',
          onPositiveClick: async () => {
            const rr = await api.launcher.openInCubeMX(ioc)
            if (!rr.ok) msg.error(rr.error || '启动 CubeMX 失败')
          },
          onNegativeClick: () => {
            if (proj) router.push({ name: 'project', params: { id: proj.id } })
          }
        })
      } else if (proj) {
        router.push({ name: 'project', params: { id: proj.id } })
      }
    } else {
      const r = await api.project.copyCubemx({
        sourceIoc: createSrcIoc.value,
        parent: createParent.value,
        name: createName.value.trim(),
        copySiblings: copySiblings.value
      })
      if (!r.ok) { msg.error(r.error || '复制失败'); return }
      msg.success(`已复制到：${r.project!.name}`)
      await store.load()
      store.refreshGitInfo()
      showCreate.value = false
      resetCreateForm()
      // Offer to immediately open in CubeMX
      dialog.success({
        title: '已复制配置',
        content: `是否立即在 CubeMX 中打开并生成代码？\n\n${r.ioc}`,
        positiveText: '打开 CubeMX',
        negativeText: '稍后',
        onPositiveClick: async () => {
          if (!r.ioc) return
          const rr = await api.launcher.openInCubeMX(r.ioc)
          if (!rr.ok) msg.error(rr.error || '启动 CubeMX 失败')
        }
      })
    }
  } catch (e: any) {
    msg.error(e?.message ?? String(e))
  } finally {
    creating.value = false
  }
}

function resetCreateForm() {
  createName.value = ''
  createSrcIoc.value = ''
  createTemplateId.value = null
  // Keep parent so repeated creations are faster.
}

async function loadTemplates() {
  try {
    const r = await api.project.listTemplates()
    if (r.ok) templates.value = r.templates
  } catch {
    templates.value = []
  }
}

const listColumns = [
  { title: '名称', key: 'name', render: (row: Project) => h('strong', { style: { cursor: 'pointer' } }, [
    row.pinned ? '📌 ' : '',
    row.name
  ])},
  { title: '路径', key: 'path', ellipsis: { tooltip: true } },
  { title: '支持工具', key: 'tools', render: (row: Project) => h('div', { style: 'display:flex;gap:4px' }, [
    row.tools?.keil ? h(NTag, { size: 'small', type: 'warning' }, () => 'Keil') : null,
    row.tools?.vscode ? h(NTag, { size: 'small', type: 'info' }, () => 'CMake') : null,
    row.tools?.cubemx ? h(NTag, { size: 'small', type: 'success' }, () => 'CubeMX') : null
  ])},
  { title: '分支', key: 'branch', render: (row: Project) => {
    const info = store.gitInfo[row.path]
    if (!info) return h('span', { style: 'color:#55555f' }, '-')
    return h('div', { style: 'display:flex;gap:4px;align-items:center' }, [
      h('span', { style: 'color:#8a8a95;font-size:12px' }, `🌿 ${info.branch ?? 'detached'}`),
      info.dirty ? h(NTag, { size: 'tiny', type: 'warning' }, () => `${info.changedCount}△`) : null
    ])
  }},
  { title: '标签', key: 'tags', render: (row: Project) => h('div', { style: 'display:flex;gap:2px;flex-wrap:wrap' },
    (Array.isArray(row.tags) ? row.tags : []).map(t => h(NTag, { size: 'tiny', round: true, bordered: false }, () => t))
  )}
]

function rowProps(row: Project) {
  return {
    style: 'cursor: pointer',
    onClick: () => router.push({ name: 'project', params: { id: row.id } })
  }
}

async function onScan() {
  const dir = await api.dialog.openDirectory()
  if (!dir) return
  const loader = msg.loading('扫描中…', { duration: 0 })
  try {
    const result = await store.scanFolder(dir)
    loader.destroy()
    msg.success(`新增 ${result.added} 个，共 ${result.total} 个`)
    store.refreshGitInfo()
  } catch (e: any) {
    loader.destroy()
    msg.error('扫描失败：' + (e?.message ?? String(e)))
  }
}

async function onAddSingle() {
  const dir = await api.dialog.openDirectory()
  if (!dir) return
  const r = await store.addSingle(dir)
  if (!r.added) msg.warning(r.reason || '未识别')
  else {
    msg.success('已添加：' + r.project!.name)
    store.refreshGitInfo()
  }
}

function onOpenDetail(p: Project) {
  router.push({ name: 'project', params: { id: p.id } })
}

function onActivityPick(path: string) {
  const proj = store.projects.find(p => p.path === path)
  if (proj) router.push({ name: 'project', params: { id: proj.id } })
}

async function onLaunch(p: Project, which: 'keil' | 'vscode' | 'cubemx') {
  if (which === 'keil' && p.tools?.keil) {
    const r = await api.launcher.openInKeil(p.tools.keil.uvprojx)
    r.ok ? msg.success('已启动 Keil') : msg.error(r.error || '启动失败')
  } else if (which === 'vscode') {
    const r = await api.launcher.openInVSCode(p.path)
    r.ok ? msg.success('已启动 VSCode') : msg.error(r.error || '启动失败')
  } else if (which === 'cubemx' && p.tools?.cubemx) {
    const r = await api.launcher.openInCubeMX(p.tools.cubemx.ioc)
    r.ok ? msg.success('已启动 CubeMX') : msg.error(r.error || '启动失败')
  }
}

async function onOpenTerminal(p: Project) {
  const r = await api.shell.openTerminal(p.path)
  if (!r.ok) msg.error(r.error || '打开终端失败')
}

async function onCopyPath(p: Project) {
  try {
    await navigator.clipboard.writeText(p.path)
    msg.success('路径已复制')
  } catch {
    msg.error('复制失败')
  }
}

function onRemove(p: Project) {
  dialog.warning({
    title: '移除工程',
    content: `确定要从列表中移除 "${p.name}" 吗？（不会删除磁盘文件）`,
    positiveText: '移除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await store.remove(p.id)
      msg.success('已移除')
    }
  })
}

async function onTogglePin(p: Project) {
  await store.upsert({ ...p, pinned: !p.pinned })
}

async function onBatch(key: string) {
  if (key === 'batch-status') {
    const loader = msg.loading('刷新 Git 状态中…', { duration: 0 })
    try {
      await store.refreshGitInfo()
      loader.destroy()
      msg.success('状态已刷新')
    } catch (e: any) {
      loader.destroy()
      msg.error(e?.message ?? String(e))
    }
  } else if (key === 'batch-fetch') {
    const repos = store.projects.map(p => p.path)
    const loader = msg.loading(`批量 fetch ${repos.length} 个仓库…`, { duration: 0 })
    try {
      const r = await api.git.batchFetch(repos)
      loader.destroy()
      const failed = Object.entries(r.results).filter(([, v]) => !v.ok)
      if (failed.length) msg.warning(`${repos.length - failed.length}/${repos.length} 成功；${failed.length} 失败`)
      else msg.success(`全部 ${repos.length} 个仓库已 fetch`)
      await store.refreshGitInfo()
    } catch (e: any) {
      loader.destroy()
      msg.error(e?.message ?? String(e))
    }
  } else if (key === 'rescan-all') {
    dialog.warning({
      title: '重新扫描',
      content: '将为每个已有工程重新探测工具支持（不会从磁盘删除任何东西）。继续？',
      positiveText: '继续',
      negativeText: '取消',
      onPositiveClick: async () => {
        let updated = 0
        for (const p of store.projects) {
          const det = await api.project.inspect(p.path)
          if (det) {
            await store.upsert({ ...p, tools: det.tools })
            updated++
          }
        }
        msg.success(`已刷新 ${updated} 个工程`)
      }
    })
  } else if (key === 'export') {
    const data = JSON.stringify(store.projects, null, 2)
    try {
      await navigator.clipboard.writeText(data)
      msg.success('已复制到剪贴板（JSON 格式）')
    } catch {
      msg.error('复制失败')
    }
  } else if (key === 'import') {
    dialog.info({
      title: '导入工程列表',
      content: '此功能待实现：从剪贴板 JSON 读入工程。当前可通过扫描目录代替。',
      positiveText: '好的'
    })
  }
}

function handleShortcut(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    searchInput.value?.focus?.()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  store.refreshGitInfo()
  loadTemplates()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.hdr {
  padding: 22px 28px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;
}
.title h2 {
  margin: 0;
  font-weight: 650;
  font-size: 20px;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}
.title .count {
  color: var(--text-muted);
  font-size: 12.5px;
  margin-left: 10px;
}
.grid {
  flex: 1;
  padding: 16px 28px 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  align-content: start;
  align-items: stretch;
}
.list-view {
  flex: 1;
  padding: 16px 28px 24px;
}
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.9; }
.empty-title { font-size: 18px; margin-bottom: 6px; color: var(--text-strong); font-weight: 600; }
.empty-hint { max-width: 400px; text-align: center; font-size: 13px; line-height: 1.55; }
.create-preview {
  margin-top: 10px;
  padding: 8px 12px;
  background: var(--bg-panel-2, #1e1f27);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.create-preview code {
  color: var(--text-strong);
  font-family: var(--font-mono, 'Fira Code', Consolas, monospace);
}
.tpl-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tpl-hint-inline {
  padding: 6px 10px;
  background: rgba(59,130,246,.07);
  border-left: 2px solid var(--accent);
  color: var(--text-muted);
  font-size: 11.5px;
  border-radius: 0 4px 4px 0;
  line-height: 1.5;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.tpl-icon { color: var(--accent); flex-shrink: 0; }
</style>
