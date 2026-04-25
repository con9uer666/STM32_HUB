import { ipcMain } from 'electron'
import { simpleGit, type SimpleGit } from 'simple-git'
import fs from 'node:fs'
import path from 'node:path'
import { store } from '../utils/store'

function gitOf(repo: string): SimpleGit {
  return simpleGit(repo)
}

function parseRemote(url: string): { owner?: string; repo?: string; host?: string } {
  const m = url.match(/(?:https?:\/\/|git@)([^/:]+)[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!m) return {}
  return { host: m[1], owner: m[2], repo: m[3] }
}

function isGitRepo(repo: string): boolean {
  return fs.existsSync(path.join(repo, '.git'))
}

const STATUS_LABEL: Record<string, { label: string; key: 'A' | 'M' | 'D' | 'R' }> = {
  A: { label: '+', key: 'A' },
  M: { label: 'M', key: 'M' },
  D: { label: '-', key: 'D' },
  R: { label: '→', key: 'R' },
  C: { label: 'C', key: 'A' },
  T: { label: 'T', key: 'M' }
}

export function registerGitIpc() {
  ipcMain.handle('git:status', async (_e, repo: string) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    try {
      const g = gitOf(repo)
      const status = await g.status()
      const branch = status.current
      return {
        ok: true,
        branch,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        not_added: status.not_added,
        deleted: status.deleted,
        conflicted: status.conflicted,
        isClean: status.isClean()
      }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:log', async (_e, repo: string, limit = 30) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    try {
      const log = await gitOf(repo).log({ maxCount: limit })
      return {
        ok: true,
        commits: log.all.map(c => ({
          hash: c.hash.slice(0, 7),
          fullHash: c.hash,
          date: c.date,
          message: c.message,
          author: c.author_name
        }))
      }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:commit-detail', async (_e, repo: string, hash: string) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    try {
      const g = gitOf(repo)
      // show with numstat + name-status
      const numstatRaw = await g.raw(['show', '--numstat', '--name-status', '--format=%H%n%an%n%ae%n%aI%n%B%n---BODYEND---', hash])
      // Parse numstat+name-status combined with custom body format
      const lines = numstatRaw.split(/\r?\n/)
      // After ---BODYEND--- we get name-status lines then numstat lines (git emits both, interleaved by flag order)
      const bodyEndIdx = lines.findIndex(l => l === '---BODYEND---')
      const fileLines = bodyEndIdx >= 0 ? lines.slice(bodyEndIdx + 1) : []
      // Need to combine: name-status gives "M\tpath" or "R100\told\tnew"
      // numstat gives "10\t5\tpath" or "10\t5\told\t=>\tnew"
      const files: any[] = []
      const statusByPath: Record<string, 'A' | 'M' | 'D' | 'R'> = {}
      const numstatByPath: Record<string, { ins: number; del: number }> = {}
      for (const l of fileLines) {
        if (!l.trim()) continue
        if (/^[AMDRCTU](\d+)?\t/.test(l)) {
          const parts = l.split('\t')
          const tag = parts[0][0]
          const p = parts[parts.length - 1]
          statusByPath[p] = (STATUS_LABEL[tag]?.key ?? 'M') as any
        } else if (/^(\d+|-)\t(\d+|-)\t/.test(l)) {
          const parts = l.split('\t')
          const ins = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0
          const del = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0
          const p = parts[parts.length - 1]
          numstatByPath[p] = { ins, del }
        }
      }
      const allPaths = new Set([...Object.keys(statusByPath), ...Object.keys(numstatByPath)])
      let additions = 0
      let deletions = 0
      for (const p of allPaths) {
        const st = statusByPath[p] ?? 'M'
        const ns = numstatByPath[p] ?? { ins: 0, del: 0 }
        additions += ns.ins
        deletions += ns.del
        files.push({
          path: p,
          status: st,
          statusLabel: st === 'A' ? '+' : st === 'D' ? '-' : st === 'R' ? '→' : 'M',
          insertions: ns.ins,
          deletions: ns.del,
          changes: ns.ins + ns.del
        })
      }
      files.sort((a, b) => b.changes - a.changes)
      return { ok: true, detail: { files, additions, deletions, loading: false } }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:file-diff', async (_e, repo: string, filePath: string, ref?: string) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    try {
      const g = gitOf(repo)
      const args = ref ? ['show', `${ref}`, '--', filePath] : ['diff', 'HEAD', '--', filePath]
      const diff = await g.raw(args)
      return { ok: true, diff }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:tree', async (_e, repo: string) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    try {
      const g = gitOf(repo)
      const out = await g.raw(['ls-tree', '-r', '--name-only', 'HEAD'])
      const files = out.split(/\r?\n/).filter(Boolean)
      const root: any = { name: repo.split(/[\\/]/).pop() || 'root', children: {}, __dir: true }
      for (const f of files) {
        const parts = f.split('/')
        let cur = root
        for (let i = 0; i < parts.length; i++) {
          const name = parts[i]
          const isLeaf = i === parts.length - 1
          if (!cur.children[name]) {
            cur.children[name] = isLeaf ? { name, __dir: false } : { name, children: {}, __dir: true }
          }
          cur = cur.children[name]
        }
      }
      function toArray(node: any): any {
        if (!node.__dir) return { key: node.__key ?? node.name, label: node.name, isLeaf: true }
        const kids = Object.values(node.children).map((c: any) => {
          c.__key = (node.__key ? node.__key + '/' : '') + c.name
          return toArray(c)
        })
        return { key: node.__key ?? node.name, label: node.name, children: kids }
      }
      return { ok: true, tree: toArray(root) }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:remote-info', async (_e, repo: string) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    try {
      const remotes = await gitOf(repo).getRemotes(true)
      const origin = remotes.find(r => r.name === 'origin') || remotes[0]
      if (!origin) return { ok: true, remote: null }
      const url = origin.refs.push || origin.refs.fetch
      return { ok: true, remote: { name: origin.name, url, ...parseRemote(url) } }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:commit-push', async (_e, repo: string, message: string) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    if (!message?.trim()) return { ok: false, error: 'Commit message is empty' }
    try {
      const g = gitOf(repo)
      await g.add(['-A'])
      const status = await g.status()
      let committed = false
      if (!status.isClean()) {
        await g.commit(message)
        committed = true
      }
      const pushResult = await g.push()
      return {
        ok: true,
        committed,
        push: JSON.parse(JSON.stringify(pushResult ?? null))
      }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:fetch', async (_e, repo: string) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    try {
      const out = await gitOf(repo).raw(['fetch', '--all', '--prune'])
      return { ok: true, output: String(out ?? '') }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:pull', async (_e, repo: string) => {
    if (!isGitRepo(repo)) return { ok: false, error: 'Not a git repository' }
    try {
      const res = await gitOf(repo).pull()
      return {
        ok: true,
        summary: {
          insertions: res?.summary?.insertions ?? 0,
          deletions: res?.summary?.deletions ?? 0,
          changes: res?.summary?.changes ?? 0,
          files: Array.isArray(res?.files) ? [...res.files] : []
        }
      }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('git:batch-status', async (_e, repos: string[]) => {
    const results: Record<string, any> = {}
    if (!Array.isArray(repos)) return { ok: true, results }
    await Promise.all(repos.map(async (r) => {
      if (!r || typeof r !== 'string') { return }
      if (!isGitRepo(r)) { results[r] = null; return }
      try {
        const s = await gitOf(r).status()
        results[r] = {
          branch: s.current ?? '',
          ahead: s.ahead ?? 0,
          behind: s.behind ?? 0,
          dirty: !s.isClean(),
          changedCount:
            (s.modified?.length ?? 0) +
            (s.not_added?.length ?? 0) +
            (s.deleted?.length ?? 0) +
            (s.staged?.length ?? 0)
        }
      } catch {
        results[r] = null
      }
    }))
    return { ok: true, results }
  })

  ipcMain.handle('git:batch-fetch', async (_e, repos: string[]) => {
    const results: Record<string, { ok: boolean; error?: string }> = {}
    await Promise.all(repos.map(async (r) => {
      if (!isGitRepo(r)) { results[r] = { ok: false, error: 'Not a git repository' }; return }
      try {
        await gitOf(r).raw(['fetch', '--all', '--prune'])
        results[r] = { ok: true }
      } catch (e: any) {
        results[r] = { ok: false, error: e?.message ?? String(e) }
      }
    }))
    return { ok: true, results }
  })

  ipcMain.handle('git:github-meta', async (_e, owner: string, repoName: string) => {
    const settings = store.get('settings')
    if (settings.githubAuthMode !== 'pat' || !settings.githubPat) {
      return { ok: false, error: 'GitHub PAT not configured (switch to PAT mode in Settings).' }
    }
    try {
      const { Octokit } = await import('@octokit/rest')
      const octo = new Octokit({ auth: settings.githubPat })
      const { data } = await octo.repos.get({ owner, repo: repoName })
      let languages: Record<string, number> = {}
      try {
        const langResp = await octo.repos.listLanguages({ owner, repo: repoName })
        languages = langResp.data
      } catch { /* ignore */ }
      return {
        ok: true,
        meta: {
          stars: data.stargazers_count,
          forks: data.forks_count,
          openIssues: data.open_issues_count,
          defaultBranch: data.default_branch,
          description: data.description,
          homepage: data.homepage,
          visibility: data.visibility,
          updatedAt: data.updated_at,
          languages
        }
      }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
}
