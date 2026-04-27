import { ipcMain, protocol, app, net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

interface NodeMeta {
  title?: string
  summary?: string
  tags?: string[]
  estimatedMinutes?: number
  icon?: string             // optional emoji shown in the sidebar (e.g. "📖", "💡")
}

interface TreeNode {
  id: string                // path relative to tutorials root, POSIX separators ("01-basics/01-intro")
  title: string
  summary?: string
  tags?: string[]
  estimatedMinutes?: number
  icon?: string
  hasContent: boolean       // index.md exists in this folder
  children?: TreeNode[]
}

interface TutorialIndex {
  title?: string
  subtitle?: string
  tree: TreeNode[]
}

interface VideoEntry {
  title: string
  url: string
  duration?: string
}

interface ChapterContent {
  meta: { id: string; title: string; summary?: string; tags?: string[]; estimatedMinutes?: number }
  markdown: string
  images: string[]
  videos: VideoEntry[]
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i
const HIDDEN_RE = /^[._]/
// Folders/files we never treat as tutorial nodes
const SKIP_NAMES = new Set(['node_modules', 'dist', '.git'])

function tutorialsRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tutorials')
  }
  return path.join(process.env.APP_ROOT!, 'tutorials')
}

function safeRead(p: string): string | null {
  try { return fs.readFileSync(p, 'utf-8') } catch { return null }
}

function readJson<T>(p: string): T | null {
  const txt = safeRead(p)
  if (txt == null) return null
  try { return JSON.parse(txt) as T } catch { return null }
}

// Pull the first H1 line from a markdown source (e.g. "# 第 1 章 · ...")
function extractFirstH1(md: string): string | null {
  const lines = md.split(/\r?\n/)
  for (const line of lines) {
    const m = /^\s*#\s+(.+?)\s*$/.exec(line)
    if (m) return m[1]
    // Stop on first non-empty / non-frontmatter line that isn't an H1 — keep simple
    if (/^\s*[^\s#-]/.test(line) && line.trim().length > 0) break
  }
  return null
}

// Strip leading "01-" / "1." order prefixes for fallback titles
function prettifyFolderName(name: string): string {
  return name
    .replace(/^\d+[._\-\s]+/, '')
    .replace(/[-_]+/g, ' ')
    .trim() || name
}

// Sort folder names by leading numeric prefix, then by lexical order. Stable.
function compareFolderNames(a: string, b: string): number {
  const ma = /^(\d+)/.exec(a)
  const mb = /^(\d+)/.exec(b)
  if (ma && mb) {
    const da = parseInt(ma[1], 10)
    const db = parseInt(mb[1], 10)
    if (da !== db) return da - db
  } else if (ma) {
    return -1
  } else if (mb) {
    return 1
  }
  return a.localeCompare(b)
}

function listSubdirs(dir: string): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(n => !HIDDEN_RE.test(n) && !SKIP_NAMES.has(n))
    .sort(compareFolderNames)
}

// Build a tree starting from `dir`. `relPath` is the slash-joined relative path
// from tutorials root (empty string means we are at the root and emit children only).
function buildTree(dir: string, relPath: string): TreeNode[] {
  const subdirs = listSubdirs(dir)
  const nodes: TreeNode[] = []
  for (const name of subdirs) {
    const childDir = path.join(dir, name)
    const childRel = relPath ? `${relPath}/${name}` : name
    const meta = readJson<NodeMeta>(path.join(childDir, 'meta.json')) ?? {}
    const mdPath = path.join(childDir, 'index.md')
    const md = safeRead(mdPath)
    const hasContent = md != null
    const children = buildTree(childDir, childRel)

    // Skip empty folders (no index.md AND no descendant content)
    if (!hasContent && !children.some(hasAnyContent)) continue

    const titleFromMd = md ? extractFirstH1(md) : null
    const node: TreeNode = {
      id: childRel,
      title: meta.title || titleFromMd || prettifyFolderName(name),
      summary: meta.summary,
      tags: meta.tags,
      estimatedMinutes: meta.estimatedMinutes,
      icon: meta.icon,
      hasContent
    }
    if (children.length) node.children = children
    nodes.push(node)
  }
  return nodes
}

function hasAnyContent(n: TreeNode): boolean {
  if (n.hasContent) return true
  return !!n.children?.some(hasAnyContent)
}

function readRootIndex(): { title?: string; subtitle?: string } {
  const root = tutorialsRoot()
  // Prefer modern meta.json at root, fall back to legacy index.json
  const meta = readJson<{ title?: string; subtitle?: string }>(path.join(root, 'meta.json'))
  if (meta) return meta
  const idx = readJson<{ title?: string; subtitle?: string }>(path.join(root, 'index.json'))
  return idx ?? {}
}

function readIndex(): TutorialIndex {
  const root = tutorialsRoot()
  const head = readRootIndex()
  return {
    title: head.title,
    subtitle: head.subtitle,
    tree: buildTree(root, '')
  }
}

// Resolve a node id (relative path) into an absolute folder path safely.
// Returns null if the path escapes tutorials root or doesn't exist.
function resolveNodeDir(id: string): string | null {
  if (!id || id.includes('..')) return null
  const root = tutorialsRoot()
  const target = path.resolve(root, id.split('/').join(path.sep))
  // path.resolve normalizes; verify still inside root
  const rootResolved = path.resolve(root)
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) return null
  try {
    if (!fs.statSync(target).isDirectory()) return null
  } catch {
    return null
  }
  return target
}

function readChapter(id: string): ChapterContent | null {
  const dir = resolveNodeDir(id)
  if (!dir) return null
  const md = safeRead(path.join(dir, 'index.md'))
  if (md == null) return null  // group node without its own intro — caller decides what to show

  const metaJson = readJson<NodeMeta>(path.join(dir, 'meta.json')) ?? {}
  const titleFromMd = extractFirstH1(md)
  const folderName = path.basename(dir)
  const title = metaJson.title || titleFromMd || prettifyFolderName(folderName)

  let videos: VideoEntry[] = []
  const v = safeRead(path.join(dir, 'videos.json'))
  if (v) {
    try {
      const arr = JSON.parse(v)
      if (Array.isArray(arr)) videos = arr
    } catch { /* ignore */ }
  }
  let images: string[] = []
  try {
    images = fs.readdirSync(dir).filter(f => IMAGE_RE.test(f))
  } catch { /* ignore */ }

  return {
    meta: {
      id,
      title,
      summary: metaJson.summary,
      tags: metaJson.tags,
      estimatedMinutes: metaJson.estimatedMinutes
    },
    markdown: md,
    images,
    videos
  }
}

export function registerTutorialIpc() {
  // Custom protocol that maps tut:///<rel-path>/<file> to the on-disk asset.
  // <img src="tut:///01-basics/02-gpio-led/pinout.png"> just works at any depth.
  try {
    protocol.handle('tut', (req) => {
      try {
        const url = new URL(req.url)
        const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
        if (rel.includes('..')) return new Response('forbidden', { status: 403 })
        const target = path.join(tutorialsRoot(), rel)
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          return new Response('not found', { status: 404 })
        }
        return net.fetch(pathToFileURL(target).toString())
      } catch (e: any) {
        return new Response(`error: ${e?.message ?? e}`, { status: 500 })
      }
    })
  } catch { /* protocol may already be registered on hot-reload */ }

  ipcMain.handle('tutorial:list', () => {
    try {
      const idx = readIndex()
      return { ok: true, index: idx, root: tutorialsRoot() }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? '加载教程目录失败', index: null as any }
    }
  })

  ipcMain.handle('tutorial:load', (_e, chapterId: string) => {
    const c = readChapter(chapterId)
    if (!c) return { ok: false, error: `章节未找到或没有正文：${chapterId}` }
    return { ok: true, chapter: c }
  })

  ipcMain.handle('tutorial:root', () => tutorialsRoot())
}
