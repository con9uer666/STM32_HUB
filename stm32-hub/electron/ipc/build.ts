import { ipcMain, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { store } from '../utils/store'

let current: ChildProcess | null = null

function emit(win: BrowserWindow | null, channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function runStreaming(cmd: string, args: string[], cwd: string, win: BrowserWindow | null, opts: { shell?: boolean } = {}) {
  return new Promise<{ code: number }>((resolve) => {
    emit(win, 'build:output', { kind: 'info', text: `$ ${cmd} ${args.join(' ')}\n` })
    const child = spawn(cmd, args, { cwd, shell: opts.shell, windowsHide: true })
    current = child
    child.stdout?.on('data', d => emit(win, 'build:output', { kind: 'stdout', text: d.toString() }))
    child.stderr?.on('data', d => emit(win, 'build:output', { kind: 'stderr', text: d.toString() }))
    child.on('close', code => {
      current = null
      emit(win, 'build:output', { kind: 'info', text: `\n[exit ${code ?? 0}]\n` })
      resolve({ code: code ?? 0 })
    })
    child.on('error', err => {
      current = null
      emit(win, 'build:output', { kind: 'stderr', text: `\n[spawn error] ${err.message}\n` })
      resolve({ code: -1 })
    })
  })
}

export function registerBuildIpc(getWindow: () => BrowserWindow | null) {
  ipcMain.handle('build:cmake', async (_e, repo: string) => {
    if (!fs.existsSync(path.join(repo, 'CMakeLists.txt'))) {
      return { ok: false, error: 'No CMakeLists.txt in project root' }
    }
    const settings = store.get('settings')
    const cmake = settings.toolPaths.cmake || 'cmake'
    const win = getWindow()

    const buildDir = path.join(repo, 'build')
    const firstRun = !fs.existsSync(buildDir)
    emit(win, 'build:output', { kind: 'info', text: `=== CMake build for ${repo} ===\n` })

    if (firstRun) {
      const args = ['-B', 'build']
      if (settings.toolPaths.ninja) args.push('-G', 'Ninja')
      const cfg = await runStreaming(cmake, args, repo, win)
      if (cfg.code !== 0) {
        emit(win, 'build:exit', { code: cfg.code })
        return { ok: false, error: 'configure failed' }
      }
    }

    const b = await runStreaming(cmake, ['--build', 'build'], repo, win)
    emit(win, 'build:exit', { code: b.code })
    return { ok: b.code === 0, code: b.code }
  })

  ipcMain.handle('build:keil', async (_e, uvprojx: string) => {
    const settings = store.get('settings')
    const keil = settings.toolPaths.keil
    const win = getWindow()
    if (!keil) return { ok: false, error: 'Keil UV4.exe not configured' }
    if (!fs.existsSync(uvprojx)) return { ok: false, error: `Project file not found: ${uvprojx}` }

    const logFile = path.join(path.dirname(uvprojx), 'stm32hub_build.log')
    emit(win, 'build:output', { kind: 'info', text: `=== Keil build for ${uvprojx} ===\n` })

    const result = await runStreaming(keil, ['-b', uvprojx, '-j0', '-o', logFile], path.dirname(uvprojx), win)

    // UV4 writes its output to log file; stream it to the UI
    if (fs.existsSync(logFile)) {
      try {
        const content = fs.readFileSync(logFile, 'utf-8')
        emit(win, 'build:output', { kind: 'stdout', text: '\n--- build log ---\n' + content })
      } catch { /* ignore */ }
    }
    emit(win, 'build:exit', { code: result.code })
    // UV4 returns 0 = no warnings/errors, 1 = warnings, 2 = errors, 3 = fatal
    return { ok: result.code < 2, code: result.code }
  })

  ipcMain.handle('build:cancel', () => {
    if (current && !current.killed) {
      current.kill()
      return { ok: true }
    }
    return { ok: false, error: 'No build running' }
  })
}
