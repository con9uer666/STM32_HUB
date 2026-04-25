import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import type { ToolPaths } from './store'

function exists(p: string | undefined): p is string {
  return !!p && fs.existsSync(p)
}

function whichWin(cmd: string): string | undefined {
  try {
    const out = execSync(`where ${cmd}`, { encoding: 'utf-8', windowsHide: true })
    const first = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0]
    return first
  } catch {
    return undefined
  }
}

function detectKeil(): string | undefined {
  try {
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Keil\\Products\\MDK" /v Path 2>nul || reg query "HKLM\\SOFTWARE\\Keil\\Products\\MDK" /v Path',
      { encoding: 'utf-8', windowsHide: true }
    )
    const m = out.match(/Path\s+REG_SZ\s+(.+)/i)
    if (m) {
      const root = m[1].trim()
      const candidate = path.join(root.replace(/[\\/]?ARM[\\/]?$/i, ''), 'UV4', 'UV4.exe')
      if (exists(candidate)) return candidate
      const candidate2 = path.join(root, '..', 'UV4', 'UV4.exe')
      if (exists(candidate2)) return candidate2
    }
  } catch { /* ignore */ }

  const commonPaths = [
    'C:\\Keil_v5\\UV4\\UV4.exe',
    'C:\\Keil\\UV4\\UV4.exe',
    'D:\\Keil_v5\\UV4\\UV4.exe',
    'E:\\Keil_v5\\UV4\\UV4.exe'
  ]
  return commonPaths.find(exists)
}

function detectCubeMX(): string | undefined {
  const candidates = [
    'C:\\Program Files\\STMicroelectronics\\STM32Cube\\STM32CubeMX\\STM32CubeMX.exe',
    'C:\\Program Files (x86)\\STMicroelectronics\\STM32Cube\\STM32CubeMX\\STM32CubeMX.exe',
    'C:\\ST\\STM32CubeMX\\STM32CubeMX.exe',
    'D:\\ST\\STM32CubeMX\\STM32CubeMX.exe'
  ]
  return candidates.find(exists)
}

export function detectAllTools(): ToolPaths {
  return {
    keil: detectKeil(),
    cubemx: detectCubeMX(),
    vscode: whichWin('code.cmd') || whichWin('code'),
    cmake: whichWin('cmake'),
    ninja: whichWin('ninja')
  }
}
