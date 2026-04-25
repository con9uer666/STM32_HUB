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
      </n-space>
    </header>

    <div class="layout">
      <!-- Chapter list -->
      <aside class="sidebar scroll-y">
        <div v-if="loadErr" class="err-box">
          ⚠️ {{ loadErr }}
          <div class="err-hint">请确认 <code>tutorials/index.json</code> 存在。</div>
        </div>
        <ul v-else class="ch-list">
          <li
            v-for="ch in filteredChapters"
            :key="ch.id"
            :class="{ active: ch.id === activeId }"
            @click="select(ch.id)"
          >
            <div class="ch-title">{{ ch.title }}</div>
            <div v-if="ch.summary" class="ch-summary">{{ ch.summary }}</div>
            <div class="ch-meta">
              <n-tag v-for="t in (ch.tags || [])" :key="t" size="tiny" round>{{ t }}</n-tag>
              <span v-if="ch.estimatedMinutes" class="ch-time">⏱ {{ ch.estimatedMinutes }}min</span>
            </div>
          </li>
          <li v-if="!filteredChapters.length" class="ch-empty">
            <div v-if="search">无匹配章节</div>
            <div v-else>还没有章节，往 <code>tutorials/</code> 文件夹添加内容</div>
          </li>
        </ul>
      </aside>

      <!-- Content -->
      <section class="content scroll-y">
        <div v-if="!current && !loadErr" class="placeholder">
          <div class="placeholder-icon">📖</div>
          <div class="placeholder-title">从左侧选择一章开始学习</div>
          <div class="placeholder-hint">所有教程内容来自安装包内的 <code>resources/tutorials</code> 目录。</div>
        </div>

        <article v-else-if="current" class="article">
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
                <div class="video-title">{{ v.title }}</div>
                <div class="video-url">{{ v.url }}</div>
                <div v-if="v.duration && v.duration !== '—'" class="video-dur">⏱ {{ v.duration }}</div>
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

interface ChapterMeta {
  id: string
  title: string
  summary?: string
  tags?: string[]
  estimatedMinutes?: number
}
interface ChapterContent {
  meta: ChapterMeta
  markdown: string
  images: string[]
  videos: Array<{ title: string; url: string; duration?: string }>
}

const msg = useMessage()
const idxTitle = ref('STM32 新手教程')
const idxSubtitle = ref('')
const chapters = ref<ChapterMeta[]>([])
const loadErr = ref('')
const activeId = ref('')
const current = ref<ChapterContent | null>(null)
const search = ref('')

const filteredChapters = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return chapters.value
  return chapters.value.filter(c =>
    c.title.toLowerCase().includes(q) ||
    (c.summary || '').toLowerCase().includes(q) ||
    (c.tags || []).some(t => t.toLowerCase().includes(q))
  )
})

const renderedHtml = computed(() => {
  if (!current.value) return ''
  return renderMarkdown(current.value.markdown, current.value.meta.id)
})

async function refresh() {
  loadErr.value = ''
  const r = await api.tutorial.list()
  if (!r.ok || !r.index) {
    loadErr.value = r.error || '加载教程目录失败'
    chapters.value = []
    return
  }
  idxTitle.value = r.index.title || 'STM32 新手教程'
  idxSubtitle.value = r.index.subtitle || ''
  chapters.value = r.index.chapters || []
  // Auto-select first chapter if nothing selected
  if (!activeId.value && chapters.value.length) {
    select(chapters.value[0].id)
  }
}

async function select(id: string) {
  activeId.value = id
  const r = await api.tutorial.load(id)
  if (!r.ok || !r.chapter) {
    msg.error(r.error || '加载章节失败')
    current.value = null
    return
  }
  current.value = r.chapter
  // Scroll content area to top
  requestAnimationFrame(() => {
    const el = document.querySelector('.content.scroll-y')
    if (el) el.scrollTop = 0
  })
}

function openExternal(url: string) {
  api.shell.openExternal(url)
}

// Intercept anchor clicks inside rendered markdown — open externally.
// Also handle copy buttons attached to code blocks.
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

watch(search, () => { /* trigger re-render via computed */ })

onMounted(() => {
  refresh()
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
  padding: 12px;
  flex-shrink: 0;
  background: var(--bg-side, #14151a);
}
.ch-list { list-style: none; margin: 0; padding: 0; }
.ch-list li {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;
  border: 1px solid transparent;
  transition: all 0.12s;
}
.ch-list li:hover { background: rgba(59,130,246,.06); border-color: var(--border-soft, #262832); }
.ch-list li.active {
  background: rgba(59,130,246,.14);
  border-color: rgba(59,130,246,.4);
}
.ch-title { font-size: 13px; font-weight: 600; color: var(--text-strong); margin-bottom: 4px; }
.ch-summary { font-size: 11.5px; color: var(--text-muted); margin-bottom: 6px; line-height: 1.4; }
.ch-meta { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
.ch-time { font-size: 10.5px; color: var(--text-dim); margin-left: auto; }
.ch-empty { color: var(--text-muted); font-size: 12.5px; padding: 20px 12px; }
.ch-empty code { background: var(--bg-panel-2, #1e1f27); padding: 1px 5px; border-radius: 3px; }

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

.videos { margin-bottom: 24px; }
.videos-hdr { font-size: 12.5px; color: var(--text-muted); margin-bottom: 8px; font-weight: 600; }
.videos-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.video-card {
  display: block;
  padding: 12px 14px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 6px;
  text-decoration: none;
  color: var(--text);
  transition: all 0.15s;
}
.video-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.video-title { font-size: 13px; font-weight: 600; color: var(--text-strong); margin-bottom: 4px; }
.video-url { font-size: 11px; color: var(--text-muted); word-break: break-all; }
.video-dur { font-size: 11px; color: var(--accent); margin-top: 4px; }

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
