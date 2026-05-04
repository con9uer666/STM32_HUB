<template>
  <div class="tut">
    <header class="hdr">
      <div>
        <h2>{{ idxTitle }}</h2>
        <span class="sub">{{ idxSubtitle }}</span>
      </div>
      <n-space>
        <n-input v-model:value="search" placeholder="搜索章节..." clearable style="width: 220px">
          <template #prefix>🔍</template>
        </n-input>
        <n-button quaternary @click="refresh">↻ 刷新</n-button>
        <n-button
          :type="updateStatus === 'has-update' ? 'warning' : 'default'"
          :loading="updateStatus === 'checking' || updateStatus === 'downloading'"
          quaternary
          @click="onUpdateClick"
        >
          <template v-if="updateStatus === 'checking'">检查中...</template>
          <template v-else-if="updateStatus === 'has-update'">⬆ 有新版本</template>
          <template v-else-if="updateStatus === 'downloading'">下载中...</template>
          <template v-else-if="updateStatus === 'up-to-date'">✓ 已是最新</template>
          <template v-else-if="updateStatus === 'error'">⚠ 更新失败</template>
          <template v-else>检查更新</template>
        </n-button>
      </n-space>
    </header>

    <div class="layout">
      <!-- Chapter tree -->
      <aside class="sidebar scroll-y">
        <div v-if="loadErr" class="err-box">
          ⚠️ {{ loadErr }}
          <div class="err-hint">请确认 <code>tutorials/</code> 目录存在并包含至少一章。</div>
        </div>
        <ul v-else-if="filteredTree.length" class="ch-tree">
          <TreeItem
            v-for="node in filteredTree"
            :key="node.id"
            :node="node"
            :depth="0"
            :active-id="activeId"
            :expanded="expanded"
            :force-expand-all="!!search.trim()"
            @select="select"
            @toggle="toggleExpand"
          />
        </ul>
        <div v-else class="ch-empty">
          <div v-if="search">无匹配章节</div>
          <div v-else>还没有章节，往 <code>tutorials/</code> 文件夹添加内容</div>
        </div>
      </aside>

      <!-- Content -->
      <section class="content scroll-y">
        <div v-if="!current && !loadErr" class="placeholder">
          <div class="placeholder-icon">📖</div>
          <div class="placeholder-title">从左侧选择一章开始学习</div>
          <div class="placeholder-hint">所有教程内容来自安装包内的 <code>resources/tutorials</code> 目录。</div>
        </div>

        <article v-else-if="current" class="article">
          <header v-if="hasArticleMeta" class="article-meta">
            <n-tag
              v-for="t in (current.meta.tags || [])"
              :key="t"
              size="small"
              round
              :bordered="false"
              class="meta-tag"
            >{{ t }}</n-tag>
            <span v-if="current.meta.estimatedMinutes" class="meta-time">
              ⏱ {{ current.meta.estimatedMinutes }} 分钟
            </span>
          </header>

          <p v-if="current.meta.summary" class="article-summary">{{ current.meta.summary }}</p>

          <div v-if="current.videos.length" class="videos">
            <div class="videos-hdr">📺 配套视频</div>
            <div class="videos-list">
              <a
                v-for="v in current.videos"
                :key="v.url"
                href="#"
                class="video-card"
                @click.prevent="openExternal(v.url)"
              >
                <span class="video-icon" aria-hidden="true">▶</span>
                <div class="video-body">
                  <div class="video-title">{{ v.title }}</div>
                  <div v-if="v.duration && v.duration !== '—'" class="video-dur">⏱ {{ v.duration }}</div>
                </div>
                <span class="video-go" aria-hidden="true">↗</span>
              </a>
            </div>
          </div>

          <div class="md" @click="onArticleClick" v-html="renderedHtml"></div>
        </article>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NInput, NButton, NSpace, NTag, useMessage } from 'naive-ui'
import { api } from '@/api'
import { renderMarkdown } from '@/utils/markdown'
import TreeItem from './tutorials/TreeItem.vue'

interface ChapterNode {
  id: string
  title: string
  summary?: string
  tags?: string[]
  estimatedMinutes?: number
  hasContent: boolean
  children?: ChapterNode[]
}

interface ChapterContent {
  meta: { id: string; title: string; summary?: string; tags?: string[]; estimatedMinutes?: number }
  markdown: string
  images: string[]
  videos: Array<{ title: string; url: string; duration?: string }>
}

const msg = useMessage()
const idxTitle = ref('STM32 新手教程')
const idxSubtitle = ref('')
const tree = ref<ChapterNode[]>([])
const loadErr = ref('')
const activeId = ref('')
const current = ref<ChapterContent | null>(null)
const search = ref('')
const expanded = ref<Set<string>>(new Set())

type UpdateStatus = 'idle' | 'checking' | 'has-update' | 'downloading' | 'up-to-date' | 'error'
const updateStatus = ref<UpdateStatus>('idle')
const updateError = ref('')

function nodeMatches(n: ChapterNode, q: string): boolean {
  return (
    n.title.toLowerCase().includes(q) ||
    (n.summary || '').toLowerCase().includes(q) ||
    (n.tags || []).some(t => t.toLowerCase().includes(q))
  )
}

// Returns a copy of the subtree pruned to nodes matching the query (or having
// matching descendants). Returns null if nothing under this branch matches.
function filterNode(n: ChapterNode, q: string): ChapterNode | null {
  const selfHit = nodeMatches(n, q)
  const kept: ChapterNode[] = []
  for (const c of n.children || []) {
    const f = filterNode(c, q)
    if (f) kept.push(f)
  }
  if (!selfHit && !kept.length) return null
  return { ...n, children: kept.length ? kept : undefined }
}

const filteredTree = computed<ChapterNode[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return tree.value
  const out: ChapterNode[] = []
  for (const n of tree.value) {
    const f = filterNode(n, q)
    if (f) out.push(f)
  }
  return out
})

const renderedHtml = computed(() => {
  if (!current.value) return ''
  return renderMarkdown(current.value.markdown, current.value.meta.id)
})

const hasArticleMeta = computed(() => {
  const m = current.value?.meta
  if (!m) return false
  return !!((m.tags && m.tags.length) || m.estimatedMinutes)
})

// Find the first content-bearing node in DFS order — used as the default selection.
function findFirstContent(nodes: ChapterNode[]): ChapterNode | null {
  for (const n of nodes) {
    if (n.hasContent) return n
    if (n.children) {
      const sub = findFirstContent(n.children)
      if (sub) return sub
    }
  }
  return null
}

// Expand every ancestor along the path "a/b/c" so the active node is visible.
function expandAncestorsOf(id: string) {
  const parts = id.split('/')
  for (let i = 1; i < parts.length; i++) {
    expanded.value.add(parts.slice(0, i).join('/'))
  }
  // trigger reactivity (Set mutation in Vue 3)
  expanded.value = new Set(expanded.value)
}

function toggleExpand(id: string) {
  if (expanded.value.has(id)) expanded.value.delete(id)
  else expanded.value.add(id)
  expanded.value = new Set(expanded.value)
}

async function refresh() {
  loadErr.value = ''
  const r = await api.tutorial.list()
  if (!r.ok || !r.index) {
    loadErr.value = r.error || '加载教程目录失败'
    tree.value = []
    return
  }
  idxTitle.value = r.index.title || 'STM32 新手教程'
  idxSubtitle.value = r.index.subtitle || ''
  tree.value = r.index.tree || []

  // Auto-expand top-level branches once on first load
  if (!activeId.value) {
    for (const n of tree.value) {
      if (n.children?.length) expanded.value.add(n.id)
    }
    expanded.value = new Set(expanded.value)
    const first = findFirstContent(tree.value)
    if (first) select(first.id)
  }
}

async function select(id: string) {
  activeId.value = id
  expandAncestorsOf(id)
  const r = await api.tutorial.load(id)
  if (!r.ok || !r.chapter) {
    msg.error(r.error || '加载章节失败')
    current.value = null
    return
  }
  current.value = r.chapter
  requestAnimationFrame(() => {
    const el = document.querySelector('.content.scroll-y')
    if (el) el.scrollTop = 0
  })
}

function openExternal(url: string) {
  api.shell.openExternal(url)
}

function onArticleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const copyBtn = target.closest('.md-copy') as HTMLButtonElement | null
  if (copyBtn) {
    e.preventDefault()
    const wrap = copyBtn.closest('.md-codeblock') as HTMLElement | null
    const code = wrap?.getAttribute('data-code') ?? wrap?.querySelector('code')?.textContent ?? ''
    navigator.clipboard.writeText(code).then(
      () => {
        const original = copyBtn.textContent
        copyBtn.textContent = '✓ 已复制'
        copyBtn.classList.add('copied')
        setTimeout(() => {
          copyBtn.textContent = original ?? '📋 复制'
          copyBtn.classList.remove('copied')
        }, 1500)
      },
      () => msg.error('复制失败')
    )
    return
  }
  const a = target.closest('a') as HTMLAnchorElement | null
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (/^https?:/i.test(href)) {
    e.preventDefault()
    openExternal(href)
  }
}

async function checkUpdate() {
  updateStatus.value = 'checking'
  const r = await api.tutorial.checkUpdate()
  if (!r.ok) {
    updateStatus.value = 'error'
    updateError.value = r.error || '检查失败'
    msg.error(updateError.value)
    return
  }
  updateStatus.value = r.hasUpdate ? 'has-update' : 'up-to-date'
  if (r.hasUpdate) msg.info('发现新版本教程，点击按钮更新')
  if (!r.hasUpdate) setTimeout(() => { updateStatus.value = 'idle' }, 3000)
}

async function doUpdate() {
  updateStatus.value = 'downloading'
  const r = await api.tutorial.doUpdate()
  if (!r.ok) {
    updateStatus.value = 'error'
    updateError.value = r.error || '下载失败'
    msg.error(updateError.value)
    return
  }
  msg.success('教程已更新到最新版本')
  updateStatus.value = 'up-to-date'
  await refresh()
  setTimeout(() => { updateStatus.value = 'idle' }, 3000)
}

async function onUpdateClick() {
  if (updateStatus.value === 'has-update') {
    await doUpdate()
  } else if (updateStatus.value !== 'checking' && updateStatus.value !== 'downloading') {
    await checkUpdate()
  }
}

watch(search, () => { /* trigger re-render via computed */ })

onMounted(() => {
  refresh()
  checkUpdate()
})
</script>

<style scoped>
.tut { display: flex; flex-direction: column; height: 100%; }
.hdr {
  padding: 22px 28px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}
.hdr h2 { margin: 0; font-weight: 650; font-size: 20px; color: var(--text-strong); letter-spacing: -0.01em; }
.hdr .sub { color: var(--text-muted); font-size: 12.5px; margin-left: 10px; }

.layout { flex: 1; display: flex; min-height: 0; }
.sidebar {
  width: 280px;
  border-right: 1px solid var(--border);
  padding: 14px 8px 24px;
  flex-shrink: 0;
  background: var(--bg-side, #14151a);
}
.ch-tree { list-style: none; margin: 0; padding: 0; }
.ch-empty { color: var(--text-muted); font-size: 12.5px; padding: 20px 12px; }
.ch-empty code { background: var(--bg-panel-2, #1e1f27); padding: 1px 5px; border-radius: 3px; }

/* Article meta strip — tags + estimated time, shown above videos / markdown */
.article-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px dashed var(--border);
}
.article-meta .meta-tag {
  background: rgba(59,130,246,.14) !important;
  color: var(--accent) !important;
  font-size: 11.5px !important;
  font-weight: 500;
}
.article-meta .meta-time {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.content { flex: 1; padding: 28px 36px 60px; min-width: 0; }
.placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 100%; color: var(--text-muted);
}
.placeholder-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.85; }
.placeholder-title { font-size: 17px; color: var(--text-strong); font-weight: 600; margin-bottom: 6px; }
.placeholder-hint { font-size: 12.5px; }
.placeholder code { background: var(--bg-panel-2, #1e1f27); padding: 1px 5px; border-radius: 3px; }

.article { max-width: 860px; margin: 0 auto; }

/* Lead summary — shown above videos and article body */
.article-summary {
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--text-muted);
  background: rgba(59,130,246,.05);
  border-left: 3px solid var(--accent);
  padding: 12px 16px;
  border-radius: 0 6px 6px 0;
  margin: 0 0 22px;
}

.videos { margin-bottom: 24px; }
.videos-hdr { font-size: 12.5px; color: var(--text-muted); margin-bottom: 8px; font-weight: 600; }
.videos-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.video-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text);
  transition: all 0.15s;
}
.video-card:hover {
  border-color: var(--accent);
  background: rgba(59,130,246,.06);
  transform: translateY(-1px);
}
.video-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: rgba(59,130,246,.14);
  color: var(--accent);
  border-radius: 6px;
  font-size: 11px;
  transition: background 0.15s, color 0.15s;
}
.video-card:hover .video-icon {
  background: var(--accent);
  color: #fff;
}
.video-body { flex: 1; min-width: 0; }
.video-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.video-dur { font-size: 11px; color: var(--text-muted); margin-top: 2px; font-variant-numeric: tabular-nums; }
.video-go {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-dim);
  transition: color 0.15s, transform 0.15s;
}
.video-card:hover .video-go {
  color: var(--accent);
  transform: translate(2px, -2px);
}

.err-box { padding: 16px; background: rgba(239,83,80,.08); border: 1px solid rgba(239,83,80,.3); border-radius: 6px; color: #ef9a9a; font-size: 12.5px; }
.err-hint { color: var(--text-muted); font-size: 11.5px; margin-top: 6px; }
.err-box code { background: var(--bg-panel-2, #1e1f27); padding: 1px 5px; border-radius: 3px; }

/* Markdown body */
.md :deep(h1) { font-size: 26px; margin: 0 0 18px; color: var(--text-strong); border-bottom: 1px solid var(--border); padding-bottom: 10px; }
.md :deep(h2) { font-size: 20px; margin: 28px 0 14px; color: var(--text-strong); }
.md :deep(h3) { font-size: 16px; margin: 22px 0 10px; color: var(--text-strong); }
.md :deep(h4) { font-size: 14px; margin: 18px 0 8px; color: var(--text-strong); }
.md :deep(p) { line-height: 1.75; color: var(--text); margin: 0 0 14px; font-size: 14px; }
.md :deep(blockquote) {
  border-left: 3px solid var(--accent);
  padding: 8px 14px;
  margin: 14px 0;
  background: rgba(59,130,246,.05);
  color: var(--text-muted);
  border-radius: 0 4px 4px 0;
  font-size: 13.5px;
}
.md :deep(ul), .md :deep(ol) { padding-left: 26px; margin: 10px 0 16px; line-height: 1.8; }
.md :deep(li) { margin-bottom: 4px; color: var(--text); }
.md :deep(code) {
  background: var(--bg-panel-2, #1e1f27);
  padding: 1px 6px;
  border-radius: 3px;
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 12.5px;
  color: #f0a674;
}
.md :deep(pre) {
  background: #0c0d12;
  border: 1px solid var(--border);
  padding: 14px 16px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
}
.md :deep(pre code) { background: transparent; padding: 0; color: #d6d8e0; font-size: 13px; line-height: 1.65; font-family: var(--font-mono, Consolas, 'Fira Code', monospace); }

/* Code block container — wraps <pre> with a header bar (lang label + copy button) */
.md :deep(.md-codeblock) {
  position: relative;
  margin: 14px 0;
}
.md :deep(.md-codeblock .md-lang) {
  position: absolute;
  top: 6px;
  left: 12px;
  font-size: 10.5px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-dim);
  font-weight: 600;
  pointer-events: none;
  z-index: 1;
}
.md :deep(.md-codeblock .md-copy) {
  position: absolute;
  top: 6px;
  right: 8px;
  background: rgba(255,255,255,.04);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  opacity: 0;
  transition: all 0.15s;
  z-index: 1;
}
.md :deep(.md-codeblock:hover .md-copy) { opacity: 1; }
.md :deep(.md-codeblock .md-copy:hover) {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(59,130,246,.1);
}
.md :deep(.md-codeblock .md-copy.copied) {
  border-color: #66bb6a;
  color: #66bb6a;
  opacity: 1;
}
.md :deep(.md-codeblock pre) {
  padding-top: 28px;
}

/* Syntax highlight tokens */
.md :deep(.hl-cmt)   { color: #6a7079; font-style: italic; }
.md :deep(.hl-str)   { color: #98c379; }
.md :deep(.hl-num)   { color: #d19a66; }
.md :deep(.hl-pre)   { color: #c678dd; }
.md :deep(.hl-kw)    { color: #c678dd; font-weight: 500; }
.md :deep(.hl-type)  { color: #56b6c2; }
.md :deep(.hl-const) { color: #d19a66; }
.md :deep(.hl-fn)    { color: #61afef; }
.md :deep(.hl-key)   { color: #e06c75; }
.md :deep(.hl-var)   { color: #e06c75; }
.md :deep(.hl-flag)  { color: #d19a66; }
.md :deep(table) { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
.md :deep(table th), .md :deep(table td) { padding: 8px 12px; border: 1px solid var(--border); text-align: left; }
.md :deep(table th) { background: var(--bg-panel-2, #1e1f27); font-weight: 600; color: var(--text-strong); }
.md :deep(a) { color: var(--accent); text-decoration: none; border-bottom: 1px dotted var(--accent); }
.md :deep(a:hover) { color: var(--accent-hover, #60a5fa); }
.md :deep(img) { max-width: 100%; border-radius: 6px; margin: 12px 0; border: 1px solid var(--border); }
.md :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
.md :deep(strong) { color: var(--text-strong); font-weight: 700; }
</style>
