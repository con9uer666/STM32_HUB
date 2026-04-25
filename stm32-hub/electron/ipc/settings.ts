import { ipcMain } from 'electron'
import { store } from '../utils/store'
import { detectAllTools } from '../utils/tool-detect'

export function registerSettingsIpc() {
  ipcMain.handle('settings:get-all', () => store.get('settings'))

  ipcMain.handle('settings:set', (_e, key: string, value: unknown) => {
    const settings = store.get('settings')
    // support dot-path like "toolPaths.keil"
    const parts = key.split('.')
    let cur: any = settings
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}
      cur = cur[parts[i]]
    }
    cur[parts[parts.length - 1]] = value
    store.set('settings', settings)
    return settings
  })

  ipcMain.handle('settings:detect-tools', () => {
    const detected = detectAllTools()
    const settings = store.get('settings')
    // only fill if empty
    for (const [key, value] of Object.entries(detected)) {
      if (value && !settings.toolPaths[key as keyof typeof settings.toolPaths]) {
        (settings.toolPaths as any)[key] = value
      }
    }
    store.set('settings', settings)
    return { detected, settings }
  })
}
