import { ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { store } from '../utils/store'

function launchDetached(exe: string, args: string[]) {
  const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false })
  child.unref()
}

export function registerLauncherIpc() {
  ipcMain.handle('launcher:keil', (_e, uvprojx: string) => {
    const settings = store.get('settings')
    const keil = settings.toolPaths.keil
    if (!keil || !fs.existsSync(keil)) {
      return { ok: false, error: 'Keil UV4.exe path not configured. Set it in Settings.' }
    }
    if (!fs.existsSync(uvprojx)) return { ok: false, error: `File not found: ${uvprojx}` }
    try {
      launchDetached(keil, [uvprojx])
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('launcher:vscode', (_e, folder: string) => {
    const settings = store.get('settings')
    let code = settings.toolPaths.vscode || ''
    if (!fs.existsSync(folder)) return { ok: false, error: `Folder not found: ${folder}` }

    try {
      if (process.platform === 'win32') {
        // On Windows, `code` is actually `code.cmd`. spawn + detached + .cmd hangs
        // reliably, so invoke it via cmd.exe /c which exits immediately after dispatch.
        if (!code) {
          // fall back to relying on PATH
          const child = spawn('cmd.exe', ['/c', 'start', '""', '/B', 'code', folder], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
          })
          child.unref()
        } else {
          // Resolve directory containing Code.exe from the .cmd path if possible
          let exe = code
          if (code.toLowerCase().endsWith('.cmd') || code.toLowerCase().endsWith('.bat')) {
            const dir = path.dirname(code)
            // `bin\code.cmd` → `..\Code.exe`
            const guessed = path.join(dir, '..', 'Code.exe')
            if (fs.existsSync(guessed)) exe = guessed
          }
          if (exe.toLowerCase().endsWith('.exe')) {
            launchDetached(exe, [folder])
          } else {
            // still a .cmd — use cmd /c start
            const child = spawn('cmd.exe', ['/c', 'start', '""', '/B', `"${code}"`, `"${folder}"`], {
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
              shell: false
            })
            child.unref()
          }
        }
      } else {
        const child = spawn(code || 'code', [folder], { detached: true, stdio: 'ignore' })
        child.unref()
      }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('launcher:cubemx', (_e, iocOrFolder: string) => {
    const settings = store.get('settings')
    const cubemx = settings.toolPaths.cubemx
    if (!cubemx || !fs.existsSync(cubemx)) {
      return { ok: false, error: 'CubeMX path not configured. Set it in Settings.' }
    }
    try {
      launchDetached(cubemx, [iocOrFolder])
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
}
