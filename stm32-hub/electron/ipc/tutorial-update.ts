import { ipcMain, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import AdmZip from 'adm-zip'
import { store } from '../utils/store'

const REPO_OWNER = 'con9uer666'
const REPO_NAME = 'STM32_HUB'
const TUTORIALS_PATH_IN_REPO = 'stm32-hub/tutorials'
const BRANCH = 'main'

function getGithubApiBase(): string {
  const settings = store.get('settings')
  const proxy = (settings as any).githubProxy as string | undefined
  if (proxy) return proxy.replace(/\/+$/, '')
  return 'https://api.github.com'
}

function userDataTutorials(): string {
  return path.join(app.getPath('userData'), 'tutorials')
}

function fetch(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get
    get(url, { headers: { 'User-Agent': 'STM32Hub', Accept: 'application/vnd.github.v3+json' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetch(res.headers.location).then(resolve, reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function getRemoteSha(): Promise<string> {
  const base = getGithubApiBase()
  const url = `${base}/repos/${REPO_OWNER}/${REPO_NAME}/commits?path=${encodeURIComponent(TUTORIALS_PATH_IN_REPO)}&sha=${BRANCH}&per_page=1`
  const buf = await fetch(url)
  const json = JSON.parse(buf.toString('utf-8'))
  if (!Array.isArray(json) || !json.length) throw new Error('无法获取远程提交信息')
  return json[0].sha as string
}

function getLocalSha(): string | null {
  return (store.get('settings') as any).tutorialUpdateSha ?? null
}

function setLocalSha(sha: string) {
  const settings = store.get('settings') as any
  settings.tutorialUpdateSha = sha
  settings.tutorialUpdateTime = Date.now()
  store.set('settings', settings)
}

async function downloadAndExtract(): Promise<void> {
  const base = getGithubApiBase()
  const url = `${base}/repos/${REPO_OWNER}/${REPO_NAME}/zipball/${BRANCH}`
  const buf = await fetch(url)

  const zip = new AdmZip(buf)
  const entries = zip.getEntries()

  const dest = userDataTutorials()
  // Clean old tutorials
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })

  // GitHub zip has a root folder like "owner-repo-sha/"
  // We need entries under "<root>/stm32-hub/tutorials/"
  const prefix = TUTORIALS_PATH_IN_REPO + '/'
  for (const entry of entries) {
    const full = entry.entryName
    // Find the part after the root dir
    const slashIdx = full.indexOf('/')
    if (slashIdx < 0) continue
    const rel = full.slice(slashIdx + 1)
    if (!rel.startsWith(prefix)) continue
    const localRel = rel.slice(prefix.length)
    if (!localRel) continue

    const target = path.join(dest, localRel)
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, entry.getData())
    }
  }
}

export function registerTutorialUpdateIpc() {
  ipcMain.handle('tutorial:check-update', async () => {
    try {
      const remoteSha = await getRemoteSha()
      const localSha = getLocalSha()
      return { ok: true, hasUpdate: remoteSha !== localSha, remoteSha, localSha }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? '检查更新失败', hasUpdate: false }
    }
  })

  ipcMain.handle('tutorial:do-update', async () => {
    try {
      const remoteSha = await getRemoteSha()
      await downloadAndExtract()
      setLocalSha(remoteSha)
      return { ok: true, sha: remoteSha }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? '更新失败' }
    }
  })
}

export async function silentCheckUpdate(): Promise<void> {
  try {
    const remoteSha = await getRemoteSha()
    const localSha = getLocalSha()
    if (remoteSha !== localSha) {
      console.log('[tutorial-update] 发现新版本教程:', remoteSha.slice(0, 8))
    }
  } catch {
    // silent — don't bother user on startup failures
  }
}
