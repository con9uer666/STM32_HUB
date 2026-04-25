import { ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function registerShellExtraIpc() {
  ipcMain.handle('shell:open-terminal', (_e, cwd: string) => {
    if (!fs.existsSync(cwd)) return { ok: false, error: `目录不存在: ${cwd}` }
    try {
      if (process.platform === 'win32') {
        // Prefer Windows Terminal (wt.exe), fall back to PowerShell, then cmd
        const wt = spawn('wt.exe', ['-d', cwd], { detached: true, stdio: 'ignore', shell: false })
        wt.on('error', () => {
          const ps = spawn('powershell.exe', ['-NoExit', '-Command', `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'`], { detached: true, stdio: 'ignore' })
          ps.on('error', () => {
            spawn('cmd.exe', ['/K', `cd /d "${cwd}"`], { detached: true, stdio: 'ignore' }).unref()
          })
          ps.unref()
        })
        wt.unref()
      } else if (process.platform === 'darwin') {
        spawn('open', ['-a', 'Terminal', cwd], { detached: true, stdio: 'ignore' }).unref()
      } else {
        spawn('x-terminal-emulator', [], { cwd, detached: true, stdio: 'ignore' }).unref()
      }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('project:stats', async (_e, projectPath: string) => {
    if (!fs.existsSync(projectPath)) return { ok: false, error: '目录不存在' }
    const exts = new Set(['.c', '.h', '.cpp', '.hpp', '.cc', '.s'])
    const skip = new Set([
      'node_modules', '.git', 'build', 'Debug', 'Release', 'Objects', 'Listings',
      'RTE', 'DebugConfig', '.vscode', '.idea', 'dist', 'out', '__pycache__'
    ])
    let sourceCount = 0
    let loc = 0
    let totalBytes = 0
    let lastModified = 0

    const fsp = fs.promises

    async function walk(dir: string, depth: number) {
      if (depth > 5) return
      let entries: fs.Dirent[] = []
      try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
      const tasks: Promise<void>[] = []
      for (const ent of entries) {
        if (skip.has(ent.name)) continue
        if (ent.name.startsWith('.')) continue
        const full = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          tasks.push(walk(full, depth + 1))
        } else if (ent.isFile()) {
          const ext = path.extname(ent.name).toLowerCase()
          if (!exts.has(ext)) continue
          tasks.push((async () => {
            try {
              const st = await fsp.stat(full)
              sourceCount++
              totalBytes += st.size
              if (st.mtimeMs > lastModified) lastModified = st.mtimeMs
              if (st.size < 2_000_000) {
                const buf = await fsp.readFile(full)
                let lines = 0
                for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) lines++
                loc += lines + (buf.length > 0 && buf[buf.length - 1] !== 0x0a ? 1 : 0)
              }
            } catch { /* ignore */ }
          })())
        }
      }
      await Promise.all(tasks)
    }
    await walk(projectPath, 0)
    return { ok: true, stats: { sourceCount, loc, totalBytes, lastModified } }
  })

  ipcMain.handle('stats:aggregate', async (_e, projectPaths: string[]) => {
    if (!Array.isArray(projectPaths)) return { ok: false, error: 'paths must be array', perProject: [] }
    console.log('[stats:aggregate] start paths=%d', projectPaths.length)
    let simpleGit: any
    try {
      const mod = await import('simple-git')
      simpleGit = mod.simpleGit
    } catch (e: any) {
      console.error('[stats:aggregate] simple-git import failed', e)
      return { ok: false, error: 'simple-git 模块加载失败：' + (e?.message ?? String(e)), perProject: [] }
    }
    const fsp = fs.promises
    const exts = new Set(['.c', '.h', '.cpp', '.hpp', '.cc', '.s', '.S', '.asm'])
    const skip = new Set([
      'node_modules', '.git', 'build', 'Debug', 'Release', 'Objects', 'Listings',
      'RTE', 'DebugConfig', '.vscode', '.idea', 'dist', 'out', '__pycache__'
    ])

    async function statProject(projectPath: string) {
      const result = {
        path: projectPath,
        loc: 0,
        sourceCount: 0,
        totalBytes: 0,
        lastModified: 0,
        langBreakdown: { c: 0, h: 0, cpp: 0, s: 0, other: 0 } as Record<string, number>,
        isGit: false,
        commits: 0,
        branch: '',
        dirty: false,
        changedCount: 0,
        remoteUrl: ''
      }
      if (!fs.existsSync(projectPath)) return result

      async function walk(dir: string, depth: number): Promise<void> {
        if (depth > 5) return
        let entries: fs.Dirent[] = []
        try { entries = await fsp.readdir(dir, { withFileTypes: true }) } catch { return }
        const tasks: Promise<void>[] = []
        for (const ent of entries) {
          if (skip.has(ent.name)) continue
          if (ent.name.startsWith('.')) continue
          const full = path.join(dir, ent.name)
          if (ent.isDirectory()) {
            tasks.push(walk(full, depth + 1))
          } else if (ent.isFile()) {
            const ext = path.extname(ent.name).toLowerCase()
            if (!exts.has(ext)) continue
            tasks.push((async () => {
              try {
                const st = await fsp.stat(full)
                result.sourceCount++
                result.totalBytes += st.size
                if (st.mtimeMs > result.lastModified) result.lastModified = st.mtimeMs
                if (ext === '.c') result.langBreakdown.c++
                else if (ext === '.h' || ext === '.hpp') result.langBreakdown.h++
                else if (ext === '.cpp' || ext === '.cc') result.langBreakdown.cpp++
                else if (ext === '.s' || ext === '.asm') result.langBreakdown.s++
                else result.langBreakdown.other++
                if (st.size < 2_000_000) {
                  const buf = await fsp.readFile(full)
                  let lines = 0
                  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) lines++
                  result.loc += lines + (buf.length > 0 && buf[buf.length - 1] !== 0x0a ? 1 : 0)
                }
              } catch { /* ignore */ }
            })())
          }
        }
        await Promise.all(tasks)
      }

      const tasks: Promise<void>[] = [walk(projectPath, 0)]

      if (fs.existsSync(path.join(projectPath, '.git'))) {
        result.isGit = true
        tasks.push((async () => {
          try {
            const g = simpleGit(projectPath)
            const [countStr, st, remotes] = await Promise.all([
              g.raw(['rev-list', '--count', 'HEAD']).catch(() => '0'),
              g.status().catch(() => null),
              g.getRemotes(true).catch(() => [])
            ])
            result.commits = parseInt(String(countStr).trim(), 10) || 0
            if (st) {
              result.branch = st.current ?? ''
              result.dirty = !st.isClean()
              result.changedCount =
                (st.modified?.length ?? 0) +
                (st.not_added?.length ?? 0) +
                (st.deleted?.length ?? 0) +
                (st.staged?.length ?? 0)
            }
            const origin = remotes.find((r: any) => r.name === 'origin') || remotes[0]
            if (origin) result.remoteUrl = origin.refs?.push || origin.refs?.fetch || ''
          } catch { /* ignore */ }
        })())
      }

      await Promise.all(tasks)
      return result
    }

    try {
      const perProject = await Promise.all(projectPaths.map(statProject))
      console.log('[stats:aggregate] done projects=%d, totalLoc=%d', perProject.length,
        perProject.reduce((s, p) => s + p.loc, 0))
      return { ok: true, perProject }
    } catch (e: any) {
      console.error('[stats:aggregate] failed', e)
      return { ok: false, error: e?.message ?? String(e), perProject: [] }
    }
  })

  ipcMain.handle('stats:commit-history', async (_e, projectPaths: string[], days: number = 90) => {
    if (!Array.isArray(projectPaths)) return { ok: false, error: 'paths must be array', buckets: [] }
    console.log('[stats:commit-history] start paths=%d days=%d', projectPaths.length, days)
    let simpleGit: any
    try {
      const mod = await import('simple-git')
      simpleGit = mod.simpleGit
    } catch (e: any) {
      console.error('[stats:commit-history] simple-git import failed', e)
      return { ok: false, error: 'simple-git 模块加载失败：' + (e?.message ?? String(e)), buckets: [] }
    }
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const buckets: Record<string, number> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      buckets[key] = 0
    }

    await Promise.all(projectPaths.map(async (p) => {
      if (!fs.existsSync(path.join(p, '.git'))) return
      try {
        const g = simpleGit(p)
        const out = await g.raw(['log', `--since=${since.toISOString()}`, '--pretty=format:%aI'])
        const lines = out.split(/\r?\n/).filter(Boolean)
        for (const iso of lines) {
          const key = iso.slice(0, 10)
          if (key in buckets) buckets[key]++
        }
      } catch { /* ignore */ }
    }))

    const ordered = Object.entries(buckets).map(([date, count]) => ({ date, count }))
    const total = ordered.reduce((s, b) => s + b.count, 0)
    console.log('[stats:commit-history] done buckets=%d total=%d', ordered.length, total)
    return { ok: true, buckets: ordered }
  })
}
