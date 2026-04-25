import { ipcMain, protocol, app, net } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

interface ChapterMeta {
  id: string
  title: string
  summary?: string
  tags?: string[]
  estimatedMinutes?: number
}

interface TutorialIndex {
  title?: string
  subtitle?: string
  chapters: ChapterMeta[]
}

interface VideoEntry {
  title: string
  url: string
  duration?: string
}

interface ChapterContent {
  meta: ChapterMeta
  markdown: string
  images: string[]
  videos: VideoEntry[]
}

function tutorialsRoot(): string {
  // In dev: <project>/tutorials. In packaged: <resources>/tutorials.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tutorials')
  }
  return path.join(process.env.APP_ROOT!, 'tutorials')
}

function safeRead(p: string): string | null {
  try { return fs.readFileSync(p, 'utf-8') } catch { return null }
}

function readIndex(): TutorialIndex | null {
  const root = tutorialsRoot()
  const txt = safeRead(path.join(root, 'index.json'))
  if (!txt) return null
  try { return JSON.parse(txt) } catch { return null }
}

function readChapter(id: string): ChapterContent | null {
  const idx = readIndex()
  if (!idx) return null
  const meta = idx.chapters.find(c => c.id === id)
  if (!meta) return null
  const dir = path.join(tutorialsRoot(), id)
  const md = safeRead(path.join(dir, 'index.md')) ?? ''
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
    images = fs.readdirSync(dir)
      .filter(f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f))
  } catch { /* ignore */ }
  return { meta, markdown: md, images, videos }
}

export function registerTutorialIpc() {
  // Custom protocol that maps tut:///<chapter-id>/<file> to the on-disk asset.
  // Lets <img src="tut:///01-getting-started/pinout.png"> just work.
  try {
    protocol.handle('tut', (req) => {
      try {
        const url = new URL(req.url)
        // url.pathname starts with /
        const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
        // Block path traversal
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
    const idx = readIndex()
    if (!idx) return { ok: false, error: '未找到 tutorials/index.json', index: null as any }
    return { ok: true, index: idx, root: tutorialsRoot() }
  })

  ipcMain.handle('tutorial:load', (_e, chapterId: string) => {
    const c = readChapter(chapterId)
    if (!c) return { ok: false, error: `章节未找到：${chapterId}` }
    return { ok: true, chapter: c }
  })

  ipcMain.handle('tutorial:root', () => tutorialsRoot())
}
