import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Project } from './store'

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'build', 'Debug', 'Release', 'Objects', 'Listings',
  'RTE', 'DebugConfig', '.vscode', '.idea', 'dist', 'out', '__pycache__'
])

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

function findFilesByExt(dir: string, ext: string): string[] {
  const out: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
        out.push(path.join(dir, entry.name))
      }
    }
  } catch { /* ignore */ }
  return out
}

function hasKeilFiles(dir: string): string | undefined {
  const direct = findFilesByExt(dir, '.uvprojx')
  if (direct.length > 0) return direct[0]
  // check MDK-ARM subdir (common CubeMX-generated layout)
  const mdkDir = path.join(dir, 'MDK-ARM')
  if (fs.existsSync(mdkDir)) {
    const nested = findFilesByExt(mdkDir, '.uvprojx')
    if (nested.length > 0) return nested[0]
  }
  return undefined
}

function hasCMakeFiles(dir: string): boolean {
  const root = path.join(dir, 'CMakeLists.txt')
  if (!fs.existsSync(root)) return false
  try {
    const content = fs.readFileSync(root, 'utf-8').toLowerCase()
    if (content.includes('stm32') || content.includes('cortex-m') || content.includes('arm-none-eabi')) return true
  } catch { /* ignore */ }
  // heuristic: look for STM32 startup / HAL files near it
  const checks = ['Core/Src', 'Src', 'Drivers', 'cmake']
  for (const c of checks) {
    const full = path.join(dir, c)
    if (fs.existsSync(full)) return true
  }
  return false
}

function hasIoc(dir: string): string | undefined {
  const found = findFilesByExt(dir, '.ioc')
  return found[0]
}

function hasGit(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'))
}

export interface DetectedProject {
  path: string
  name: string
  tools: Project['tools']
  hasGit: boolean
}

export function inspectDirectory(dir: string): DetectedProject | null {
  const tools: Project['tools'] = {}
  const uvprojx = hasKeilFiles(dir)
  if (uvprojx) tools.keil = { uvprojx }
  if (hasCMakeFiles(dir)) tools.vscode = { hasCMake: true }
  const ioc = hasIoc(dir)
  if (ioc) tools.cubemx = { ioc }

  if (!tools.keil && !tools.vscode && !tools.cubemx) return null

  return {
    path: dir,
    name: path.basename(dir),
    tools,
    hasGit: hasGit(dir)
  }
}

export function scanDirectory(root: string, maxDepth = 3): DetectedProject[] {
  const results: DetectedProject[] = []
  const seen = new Set<string>()

  function walk(current: string, depth: number) {
    if (depth > maxDepth) return
    const norm = path.resolve(current)
    if (seen.has(norm)) return
    seen.add(norm)

    const detected = inspectDirectory(norm)
    if (detected) {
      results.push(detected)
      // Do not recurse into a detected project to avoid duplicate nested matches
      return
    }

    try {
      for (const entry of fs.readdirSync(norm, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (SKIP_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        walk(path.join(norm, entry.name), depth + 1)
      }
    } catch { /* permission denied etc */ }
  }

  walk(root, 0)
  return results
}

export function buildProjectFromDetected(detected: DetectedProject): Project {
  return {
    id: sha1(detected.path),
    name: detected.name,
    path: detected.path,
    addedAt: Date.now(),
    tools: detected.tools,
    tags: [],
    pinned: false,
    note: ''
  }
}
