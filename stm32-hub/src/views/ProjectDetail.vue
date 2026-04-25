<template>
  <div v-if="!project" class="not-found">工程不存在</div>
  <div v-else class="pd">
    <header class="pd-hdr">
      <div class="pd-head-left">
        <n-button quaternary circle @click="router.back()" class="back-btn">←</n-button>
        <div class="pd-title">
          <h2>
            {{ project.name }}
            <n-tag v-if="branchBadge" size="small" :bordered="false" class="h-tag">
              <span class="branch-icon">🌿</span> {{ branchBadge }}
            </n-tag>
            <n-tag v-if="dirty" size="small" type="warning" :bordered="false" class="h-tag">未提交</n-tag>
          </h2>
          <div class="pd-path mono" :title="project.path">{{ project.path }}</div>
        </div>
      </div>
      <div class="pd-head-right">
        <n-tooltip placement="bottom"><template #trigger>
          <n-button size="small" quaternary @click="openTerminal">▷_</n-button>
        </template>在终端中打开</n-tooltip>
        <n-tooltip placement="bottom"><template #trigger>
          <n-button size="small" quaternary @click="copyPath">📋</n-button>
        </template>复制路径</n-tooltip>
        <n-tooltip placement="bottom"><template #trigger>
          <n-button size="small" quaternary @click="revealInFolder">📁</n-button>
        </template>在资源管理器中显示</n-tooltip>
        <span class="head-divider" />
        <n-button v-if="project.tools?.keil" size="small" type="warning" @click="launch('keil')">🔧 Keil</n-button>
        <n-button v-if="project.tools?.vscode" size="small" type="info" @click="launch('vscode')">💻 VSCode</n-button>
        <n-button v-if="project.tools?.cubemx" size="small" type="success" @click="launch('cubemx')">⚙ CubeMX</n-button>
      </div>
    </header>

    <n-tabs type="line" animated class="pd-tabs" default-value="info">
      <n-tab-pane name="info" tab="概览">
        <div class="pane-grid">
          <section class="block">
            <div class="block-hdr">
              <h3>AI 描述</h3>
              <n-space size="small">
                <n-button size="small" quaternary v-if="project.aiDescription" @click="clearAi">清除</n-button>
                <n-button size="small" type="primary" :loading="aiLoading" @click="generateAi">
                  {{ project.aiDescription ? '重新生成' : '✨ 生成描述' }}
                </n-button>
              </n-space>
            </div>
            <AIDescription :description="project.aiDescription" />
            <n-alert v-if="aiError" type="error" :closable="true" @close="aiError = ''" style="margin-top: 10px">
              <pre class="err mono">{{ aiError }}</pre>
            </n-alert>
          </section>

          <section class="block">
            <div class="block-hdr"><h3>标签 / 备注</h3></div>
            <n-dynamic-tags :value="tagsLocal" @update:value="onTagsChange" />
            <n-input
              v-model:value="noteLocal"
              type="textarea"
              placeholder="备注（支持 Markdown 格式，仅本地展示）"
              :autosize="{ minRows: 3, maxRows: 8 }"
              style="margin-top: 12px"
              @update:value="scheduleSave"
            />
            <div class="inline-row">
              <n-checkbox v-model:checked="pinnedLocal" @update:checked="save">置顶</n-checkbox>
              <span class="color-label">卡片色标：</span>
              <div class="color-swatches">
                <button
                  v-for="c in swatches"
                  :key="c"
                  class="swatch"
                  :class="{ active: colorLocal === c }"
                  :style="{ background: c }"
                  @click="pickColor(c)"
                  :title="c"
                />
              </div>
            </div>
          </section>

          <section class="block" v-if="stats">
            <div class="block-hdr"><h3>工程统计</h3></div>
            <div class="stat-grid">
              <div><span class="label">源文件</span>{{ stats.sourceCount }}</div>
              <div><span class="label">代码行数 (LOC)</span>{{ stats.loc.toLocaleString() }}</div>
              <div><span class="label">最后修改</span>{{ formatDate(stats.lastModified) }}</div>
              <div><span class="label">总大小</span>{{ formatBytes(stats.totalBytes) }}</div>
            </div>
          </section>

          <section class="block" v-if="remote">
            <div class="block-hdr"><h3>GitHub 信息</h3></div>
            <div class="remote-line">
              <strong>远程：</strong>
              <a @click="openExternal(remote.url)" class="link">{{ remote.url }}</a>
            </div>
            <div v-if="githubMeta" class="meta-grid">
              <div><span class="label">⭐ Stars</span>{{ githubMeta.stars }}</div>
              <div><span class="label">🍴 Forks</span>{{ githubMeta.forks }}</div>
              <div><span class="label">⚠ Issues</span>{{ githubMeta.openIssues }}</div>
              <div><span class="label">🌿 默认分支</span>{{ githubMeta.defaultBranch }}</div>
            </div>
            <n-button v-if="settingsStore.settings?.githubAuthMode === 'pat' && !githubMeta" size="small" @click="fetchMeta" :loading="metaLoading">拉取元数据</n-button>
          </section>
        </div>
      </n-tab-pane>

      <n-tab-pane name="git" tab="Git / Push">
        <GitStatusBar :project="project" @pushed="reloadGit" @fetched="reloadGit" />
        <div class="git-body">
          <div class="git-col">
            <h4>文件树 / 变更</h4>
            <GitTree :project="project" :refreshKey="gitRefreshKey" />
          </div>
          <div class="git-col">
            <div class="commits-hdr">
              <h4>最近提交</h4>
              <n-button size="tiny" quaternary :loading="loadingMoreCommits" @click="loadMoreCommits" :disabled="!canLoadMore">
                {{ canLoadMore ? `加载更多 (已显示 ${commits.length})` : `已全部 (${commits.length})` }}
              </n-button>
            </div>
            <div v-if="commits.length" class="commit-list">
              <div v-for="c in commits" :key="c.hash" class="commit" :class="{ expanded: expandedCommit === c.hash }">
                <div class="commit-hdr" @click="toggleCommit(c.hash)">
                  <span class="hash mono">{{ c.hash }}</span>
                  <span class="author">{{ c.author }}</span>
                  <span class="date">{{ formatDate(c.date) }}</span>
                </div>
                <div class="msg" @click="toggleCommit(c.hash)">{{ c.message }}</div>
                <div v-if="expandedCommit === c.hash" class="commit-detail">
                  <div v-if="commitDetails[c.hash]?.loading" class="muted">加载中…</div>
                  <template v-else-if="commitDetails[c.hash]">
                    <div class="detail-stats">
                      <n-tag size="tiny" type="success">+{{ commitDetails[c.hash].additions }}</n-tag>
                      <n-tag size="tiny" type="error">-{{ commitDetails[c.hash].deletions }}</n-tag>
                      <span class="muted">{{ commitDetails[c.hash].files.length }} 文件</span>
                    </div>
                    <ul class="file-list">
                      <li v-for="f in commitDetails[c.hash].files" :key="f.path" class="file-item">
                        <span class="file-status" :class="'fs-' + f.status">{{ f.statusLabel }}</span>
                        <span class="mono">{{ f.path }}</span>
                        <span v-if="f.changes" class="file-changes">+{{ f.insertions }} / -{{ f.deletions }}</span>
                      </li>
                    </ul>
                  </template>
                </div>
              </div>
            </div>
            <div v-else class="muted">暂无提交或不是 git 仓库</div>
          </div>
        </div>
      </n-tab-pane>

      <n-tab-pane name="build" tab="构建">
        <BuildTerminal :project="project" />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton, NSpace, NTabs, NTabPane, NInput, NDynamicTags, NCheckbox, NTag, NAlert, NTooltip, useMessage
} from 'naive-ui'
import { useProjectsStore } from '@/stores/projects'
import { useSettingsStore } from '@/stores/settings'
import { api } from '@/api'
import GitTree from '@/components/GitTree.vue'
import GitStatusBar from '@/components/GitStatusBar.vue'
import BuildTerminal from '@/components/BuildTerminal.vue'
import AIDescription from '@/components/AIDescription.vue'

const route = useRoute()
const router = useRouter()
const msg = useMessage()
const store = useProjectsStore()
const settingsStore = useSettingsStore()

const id = computed(() => route.params.id as string)
const project = computed(() => store.getById(id.value))

const tagsLocal = ref<string[]>([])
const noteLocal = ref('')
const pinnedLocal = ref(false)
const colorLocal = ref('#03a9f4')
const swatches = ['#03a9f4', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#f44336', '#8a8a95']

const remote = ref<any>(null)
const githubMeta = ref<any>(null)
const metaLoading = ref(false)
const aiLoading = ref(false)
const aiError = ref('')
const commits = ref<any[]>([])
const commitLimit = ref(30)
const loadingMoreCommits = ref(false)
const canLoadMore = ref(true)
const gitRefreshKey = ref(0)
const branchBadge = ref('')
const dirty = ref(false)
const stats = ref<any>(null)
const expandedCommit = ref('')
const commitDetails = reactive<Record<string, any>>({})

let saveTimer: ReturnType<typeof setTimeout> | null = null
let suppressSave = false
let currentLoadedId = ''

function syncFromProject(p: any) {
  suppressSave = true
  tagsLocal.value = p ? [...p.tags] : []
  noteLocal.value = p?.note || ''
  pinnedLocal.value = !!p?.pinned
  colorLocal.value = p?.color || '#03a9f4'
  setTimeout(() => { suppressSave = false }, 30)
}

// Only sync local state when we switch to a different project,
// NOT every time the project object changes (which happens after every upsert).
watch(id, (newId) => {
  if (newId !== currentLoadedId) {
    currentLoadedId = newId
    syncFromProject(project.value)
  }
}, { immediate: true })

// Handle the case where project data arrives after mount (store.load hasn't finished).
watch(project, (p, oldP) => {
  if (!oldP && p && currentLoadedId === id.value) {
    syncFromProject(p)
  }
})

function scheduleSave() {
  if (suppressSave) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = null; save() }, 400)
}

async function save() {
  if (suppressSave || !project.value) return
  await store.upsert({
    ...project.value,
    tags: [...tagsLocal.value],
    note: noteLocal.value,
    pinned: pinnedLocal.value,
    color: colorLocal.value
  })
}

function onTagsChange(v: string[]) {
  tagsLocal.value = v
  save()
}

function pickColor(c: string) {
  colorLocal.value = c
  save()
}

onBeforeUnmount(() => {
  if (saveTimer) { clearTimeout(saveTimer); save() }
})

async function launch(which: 'keil' | 'vscode' | 'cubemx') {
  if (!project.value) return
  const p = project.value
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

async function openTerminal() {
  if (!project.value) return
  const r = await api.shell.openTerminal(project.value.path)
  if (!r.ok) msg.error(r.error || '打开终端失败')
}

async function copyPath() {
  if (!project.value) return
  try {
    await navigator.clipboard.writeText(project.value.path)
    msg.success('路径已复制')
  } catch {
    msg.error('复制失败')
  }
}

function revealInFolder() {
  if (project.value) api.shell.showInFolder(project.value.path)
}

async function loadRemote() {
  if (!project.value) return
  const r = await api.git.remoteInfo(project.value.path)
  if (r.ok) remote.value = r.remote
}

async function loadStatus() {
  if (!project.value) return
  const r = await api.git.status(project.value.path)
  if (r && r.ok) {
    branchBadge.value = r.branch || ''
    dirty.value = !r.isClean
  } else {
    branchBadge.value = ''
    dirty.value = false
  }
}

async function reloadGit() {
  if (!project.value) return
  gitRefreshKey.value++
  commitLimit.value = 30
  canLoadMore.value = true
  const r = await api.git.log(project.value.path, commitLimit.value)
  if (r.ok) {
    commits.value = r.commits
    canLoadMore.value = r.commits.length >= commitLimit.value
  } else commits.value = []
  await loadStatus()
}

async function loadMoreCommits() {
  if (!project.value || loadingMoreCommits.value) return
  loadingMoreCommits.value = true
  try {
    commitLimit.value += 30
    const r = await api.git.log(project.value.path, commitLimit.value)
    if (r.ok) {
      const before = commits.value.length
      commits.value = r.commits
      if (r.commits.length === before) canLoadMore.value = false
    }
  } finally {
    loadingMoreCommits.value = false
  }
}

async function toggleCommit(hash: string) {
  if (expandedCommit.value === hash) {
    expandedCommit.value = ''
    return
  }
  expandedCommit.value = hash
  if (!commitDetails[hash] && project.value) {
    commitDetails[hash] = { loading: true }
    const r = await api.git.commitDetail(project.value.path, hash)
    if (r.ok) commitDetails[hash] = r.detail
    else commitDetails[hash] = { loading: false, files: [], additions: 0, deletions: 0, error: r.error }
  }
}

async function fetchMeta() {
  if (!remote.value?.owner || !remote.value?.repo) return
  metaLoading.value = true
  try {
    const r = await api.git.fetchRepoMeta(remote.value.owner, remote.value.repo)
    if (r.ok) githubMeta.value = r.meta
    else msg.error(r.error || '拉取失败')
  } finally {
    metaLoading.value = false
  }
}

async function loadStats() {
  if (!project.value) return
  const r = await api.project.stats(project.value.path)
  if (r.ok) stats.value = r.stats
}

async function generateAi() {
  if (!project.value) return
  const settings = settingsStore.settings
  if (!settings?.aiKey) {
    msg.error('请先在「设置」中填入 DeepSeek API Key')
    return
  }
  aiLoading.value = true
  aiError.value = ''
  try {
    const readme = await api.project.readReadme(project.value.path)
    const summary = await api.project.summarizeFiles(project.value.path)
    // JSON round-trip to guarantee a plain object for IPC structured-clone
    const payload = JSON.parse(JSON.stringify({
      readme: String(readme || ''),
      fileList: Array.isArray(summary?.files) ? summary.files.map(String) : [],
      iocInfo: String(summary?.iocInfo || ''),
      projectName: String(project.value.name || '')
    }))
    const r = await api.ai.generateDescription(payload)
    if (r.ok) {
      await store.upsert({ ...project.value, aiDescription: r.result })
      msg.success('描述已生成')
    } else {
      aiError.value = (r.error || '生成失败') + (r.raw ? '\n\n原始响应:\n' + String(r.raw).slice(0, 500) : '')
      msg.error('生成失败：见下方详情')
    }
  } catch (e: any) {
    aiError.value = e?.message ?? String(e)
    msg.error('生成异常：' + aiError.value)
  } finally {
    aiLoading.value = false
  }
}

async function clearAi() {
  if (!project.value) return
  const { aiDescription, ...rest } = project.value
  await store.upsert(rest as any)
}

function openExternal(url: string) {
  api.shell.openExternal(url)
}

function formatDate(s: string | number) {
  if (!s) return '-'
  try { return new Date(s).toLocaleString('zh-CN') } catch { return String(s) }
}

function formatBytes(n: number) {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0; let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return v.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

async function loadAll() {
  // Fire remote + git log + status in parallel; delay the expensive stats walk
  // until the next animation frame so the first paint stays snappy.
  await Promise.all([loadRemote(), reloadGit()])
  requestAnimationFrame(() => { loadStats() })
}

onMounted(loadAll)

watch(id, (newId, oldId) => {
  if (newId !== oldId) {
    stats.value = null
    loadAll()
  }
})
</script>

<style scoped>
.not-found { padding: 40px; color: var(--text-muted); }
.pd { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.pd-hdr {
  padding: 16px 28px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  row-gap: 10px;
}
.pd-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 320px;
  min-width: 0;
}
.pd-head-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.back-btn { flex-shrink: 0; }
.head-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 4px;
}

.pd-title { flex: 1; min-width: 0; }
.pd-title h2 {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 18px;
  font-weight: 650;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}
.h-tag { margin-left: 2px; }
.pd-path {
  color: var(--text-muted);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 3px;
}
.branch-icon { margin-right: 3px; }

.pd-tabs { flex: 1; padding: 0 28px; overflow: hidden; display: flex; flex-direction: column; }
.pd-tabs :deep(.n-tab-pane) {
  overflow: auto;
  padding-right: 4px;
}
.pane-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
  padding: 16px 0 28px;
}
.block {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 18px 20px;
}
.block-hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.block-hdr h3 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--text-strong); letter-spacing: 0.01em; }

.inline-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.color-label { font-size: 12px; color: var(--text-muted); }
.color-swatches { display: flex; gap: 6px; }
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s;
}
.swatch:hover { transform: scale(1.15); }
.swatch.active { border-color: #fff; box-shadow: 0 0 0 2px var(--accent); }

.remote-line { margin-bottom: 12px; font-size: 13px; word-break: break-all; }
.link { color: var(--accent); cursor: pointer; text-decoration: none; border-bottom: 1px dashed var(--accent); }
.link:hover { color: var(--accent-hover); }

.meta-grid,
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 14px;
  margin-top: 10px;
}
.meta-grid > div,
.stat-grid > div {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}
.meta-grid .label,
.stat-grid .label {
  display: block;
  color: var(--text-muted);
  font-size: 11px;
  margin-bottom: 3px;
  font-weight: 400;
}

.git-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 16px;
  padding-bottom: 24px;
}
@media (max-width: 1050px) {
  .git-body { grid-template-columns: 1fr; }
}
.git-col h4 {
  margin: 0 0 12px;
  font-weight: 600;
  font-size: 13px;
  color: var(--text-strong);
}
.commits-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.commits-hdr h4 { margin: 0; }

.commit-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 4px;
}
.commit {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-left: 2px solid var(--accent);
  padding: 9px 12px;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.commit:hover { background: var(--bg-hover); border-color: var(--border-hi); border-left-color: var(--accent); }
.commit.expanded { background: var(--bg-active); border-color: var(--border-hi); border-left-color: var(--accent); }
.commit-hdr { display: flex; gap: 10px; font-size: 11px; color: var(--text-muted); }
.hash { color: var(--accent); }
.msg { font-size: 13px; margin-top: 3px; word-break: break-word; color: var(--text); }
.commit-detail { margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border); }
.detail-stats { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 11px; }
.file-list { list-style: none; padding: 0; margin: 4px 0 0; max-height: 180px; overflow-y: auto; }
.file-item { font-size: 11px; display: flex; align-items: center; gap: 6px; padding: 1px 0; }
.file-status {
  display: inline-block;
  width: 18px;
  text-align: center;
  font-weight: 700;
  font-size: 9px;
  padding: 1px 2px;
  border-radius: 3px;
}
.fs-A { background: #2e7d32; color: white; }
.fs-M { background: #f57c00; color: white; }
.fs-D { background: #c62828; color: white; }
.fs-R { background: #1976d2; color: white; }
.file-changes { font-size: 10px; color: var(--text-muted); margin-left: auto; }
.muted { color: var(--text-muted); font-size: 13px; }
.err { white-space: pre-wrap; margin: 0; font-size: 11px; }
</style>
