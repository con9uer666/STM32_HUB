import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerProjectIpc } from './ipc/project'
import { registerLauncherIpc } from './ipc/launcher'
import { registerGitIpc } from './ipc/git'
import { registerBuildIpc } from './ipc/build'
import { registerAiIpc } from './ipc/ai'
import { registerSettingsIpc } from './ipc/settings'
import { registerShellExtraIpc } from './ipc/shell-extra'
import { registerSerialIpc, teardownSerial } from './ipc/serial'
import { registerTutorialIpc } from './ipc/tutorial'
import { registerTutorialUpdateIpc, silentCheckUpdate } from './ipc/tutorial-update'

// Privileged scheme registration must happen BEFORE app is ready,
// so the renderer can <img src="tut:///...">.
protocol.registerSchemesAsPrivileged([
  { scheme: 'tut', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
])

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'STM32 Hub',
    backgroundColor: '#18181c',
    autoHideMenuBar: true,
    icon: path.join(process.env.APP_ROOT!, 'resources', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function registerCommonIpc() {
  ipcMain.handle('dialog:open-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:open-file', async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: filters ?? []
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('shell:open-external', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('shell:open-path', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('shell:show-in-folder', (_e, p: string) => shell.showItemInFolder(p))
}

app.whenReady().then(() => {
  registerCommonIpc()
  registerSettingsIpc()
  registerProjectIpc()
  registerLauncherIpc()
  registerGitIpc()
  registerBuildIpc(() => mainWindow)
  registerAiIpc()
  registerShellExtraIpc()
  registerSerialIpc(() => mainWindow)
  registerTutorialIpc()
  registerTutorialUpdateIpc()
  createWindow()

  // Check for tutorial updates silently after startup
  silentCheckUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  teardownSerial()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  teardownSerial()
})
