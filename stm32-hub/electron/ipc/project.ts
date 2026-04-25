import { ipcMain, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import { store, type Project } from '../utils/store'
import { scanDirectory, inspectDirectory, buildProjectFromDetected } from '../utils/project-scanner'

interface IocTemplate {
  id: string
  name: string
  mcu: string
  package?: string
  family?: string
  summary?: string
  file: string
}

function templatesRoot(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'templates')
  return path.join(process.env.APP_ROOT!, 'templates')
}

function readTemplateManifest(): IocTemplate[] {
  try {
    const p = path.join(templatesRoot(), 'templates.json')
    if (!fs.existsSync(p)) return []
    const j = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return Array.isArray(j?.templates) ? j.templates : []
  } catch { return [] }
}

// Rewrite ProjectName/ProjectFileName fields in a CubeMX .ioc file.
function rewriteIocProjectName(srcPath: string, destPath: string, projectName: string): void {
  const raw = fs.readFileSync(srcPath, 'utf-8')
  const lines = raw.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith('ProjectManager.ProjectFileName=')) {
      lines[i] = `ProjectManager.ProjectFileName=${projectName}.ioc`
    } else if (l.startsWith('ProjectManager.ProjectName=')) {
      lines[i] = `ProjectManager.ProjectName=${projectName}`
    }
  }
  fs.writeFileSync(destPath, lines.join('\n'), 'utf-8')
}

function sha1(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

function parseRemote(remoteUrl: string | undefined): { owner?: string; repo?: string } {
  if (!remoteUrl) return {}
  // https://github.com/owner/repo.git  or  git@github.com:owner/repo.git
  const m = remoteUrl.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/)
  if (!m) return {}
  return { owner: m[1], repo: m[2] }
}

export function registerProjectIpc() {
  ipcMain.handle('project:scan', async (_e, root: string, depth?: number) => {
    const settings = store.get('settings')
    const d = depth ?? settings.scanDepth ?? 3
    const detected = scanDirectory(root, d)
    const existing = store.get('projects')
    const existingIds = new Set(existing.map(p => p.id))
    const newProjects: Project[] = []
    for (const det of detected) {
      const proj = buildProjectFromDetected(det)
      if (!existingIds.has(proj.id)) newProjects.push(proj)
    }
    const merged = [...existing, ...newProjects]
    store.set('projects', merged)
    return { added: newProjects.length, total: merged.length, projects: merged }
  })

  ipcMain.handle('project:inspect', (_e, dir: string) => {
    const detected = inspectDirectory(dir)
    return detected
  })

  ipcMain.handle('project:list', () => store.get('projects'))

  ipcMain.handle('project:upsert', (_e, project: Project) => {
    const all = store.get('projects')
    const idx = all.findIndex(p => p.id === project.id)
    if (idx >= 0) all[idx] = project
    else all.push(project)
    store.set('projects', all)
    return all
  })

  ipcMain.handle('project:remove', (_e, id: string) => {
    const all = store.get('projects').filter(p => p.id !== id)
    store.set('projects', all)
    return all
  })

  ipcMain.handle('project:read-readme', (_e, projectPath: string) => {
    const candidates = ['README.md', 'Readme.md', 'readme.md', 'README.MD']
    for (const c of candidates) {
      const full = path.join(projectPath, c)
      if (fs.existsSync(full)) {
        try {
          return fs.readFileSync(full, 'utf-8').slice(0, 4000)
        } catch { /* ignore */ }
      }
    }
    return ''
  })

  ipcMain.handle('project:summarize-files', (_e, projectPath: string) => {
    // Collect a compact summary for AI prompting
    const sourceDirs = ['Core/Src', 'Core/Inc', 'Src', 'Inc', 'src', 'include', 'User', 'HARDWARE', 'App', 'app']
    const files: string[] = []
    for (const d of sourceDirs) {
      const full = path.join(projectPath, d)
      if (!fs.existsSync(full)) continue
      try {
        for (const entry of fs.readdirSync(full)) {
          if (/\.(c|h|cpp|hpp)$/i.test(entry)) files.push(`${d}/${entry}`)
        }
      } catch { /* ignore */ }
    }

    let iocInfo = ''
    try {
      const rootEntries = fs.readdirSync(projectPath)
      const ioc = rootEntries.find(e => e.toLowerCase().endsWith('.ioc'))
      if (ioc) {
        const content = fs.readFileSync(path.join(projectPath, ioc), 'utf-8')
        const keys = ['Mcu.Family', 'Mcu.Name', 'Mcu.Package', 'ProjectManager.ProjectName']
        const lines = content.split(/\r?\n/).filter(l => keys.some(k => l.startsWith(k + '=')))
        iocInfo = lines.join('\n')
      }
    } catch { /* ignore */ }

    return { files: files.slice(0, 80), iocInfo }
  })

  // helper exposed internally
  ipcMain.handle('project:parse-remote', (_e, url: string) => parseRemote(url))

  // ---- List bundled .ioc templates ----
  ipcMain.handle('project:list-templates', () => {
    const templates = readTemplateManifest()
    // Verify each file exists; drop ones that don't.
    const ok = templates.filter(t => {
      const p = path.join(templatesRoot(), t.file)
      return fs.existsSync(p)
    })
    return { ok: true, templates: ok, root: templatesRoot() }
  })

  // ---- Create a new empty project scaffold ----
  // Makes a new directory under `parent`, optionally initializes git and a README.
  // If `templateId` is given, also copies the bundled .ioc template into the project,
  // rewriting ProjectName/ProjectFileName so CubeMX picks up the new name.
  // Returns the built Project record (inserted into store).
  ipcMain.handle('project:create', (_e, args: {
    parent: string
    name: string
    initGit?: boolean
    withReadme?: boolean
    templateId?: string
  }): { ok: boolean; error?: string; project?: Project; ioc?: string } => {
    try {
      if (!args || !args.parent || !args.name) {
        return { ok: false, error: '参数不完整' }
      }
      const safeName = args.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim()
      if (!safeName) return { ok: false, error: '工程名称非法' }
      if (!fs.existsSync(args.parent) || !fs.statSync(args.parent).isDirectory()) {
        return { ok: false, error: `父目录不存在：${args.parent}` }
      }
      const target = path.join(args.parent, safeName)
      if (fs.existsSync(target)) {
        return { ok: false, error: `目标已存在：${target}` }
      }

      // Resolve template upfront — fail before mkdir if user picked a bad id.
      let templateSrc = ''
      if (args.templateId) {
        const tpl = readTemplateManifest().find(t => t.id === args.templateId)
        if (!tpl) return { ok: false, error: `未找到模板：${args.templateId}` }
        templateSrc = path.join(templatesRoot(), tpl.file)
        if (!fs.existsSync(templateSrc)) {
          return { ok: false, error: `模板文件缺失：${tpl.file}` }
        }
      }

      fs.mkdirSync(target, { recursive: true })

      let iocPath = ''
      if (templateSrc) {
        iocPath = path.join(target, `${safeName}.ioc`)
        rewriteIocProjectName(templateSrc, iocPath, safeName)
      }

      if (args.withReadme !== false) {
        const next = templateSrc
          ? `下一步：\n` +
            `- 在 CubeMX 中打开 ${safeName}.ioc，按需勾选外设、配置时钟，点击 Generate Code\n`
          : `下一步：\n` +
            `- 在 CubeMX 中打开此目录，新建 .ioc 并选择 MCU、外设、生成代码\n` +
            `- 或将已有 .uvprojx / CMakeLists.txt 拷入此目录\n`
        const body = `# ${safeName}\n\n> STM32 project scaffold created by STM32-Hub.\n\n` + next
        fs.writeFileSync(path.join(target, 'README.md'), body, 'utf-8')
      }

      if (args.initGit) {
        try {
          execSync('git init', { cwd: target, stdio: 'ignore' })
          const gitignore = `# Build artifacts\nbuild/\nDebug/\nRelease/\nObjects/\nListings/\nDebugConfig/\nRTE/\n*.o\n*.obj\n*.map\n*.elf\n*.hex\n*.bin\n*.axf\n\n# IDE\n.vscode/\n.idea/\n`
          fs.writeFileSync(path.join(target, '.gitignore'), gitignore, 'utf-8')
        } catch { /* git missing — skip */ }
      }

      const all = store.get('projects')
      const detected = inspectDirectory(target)
      const proj: Project = detected
        ? buildProjectFromDetected(detected)
        : {
            id: sha1(target),
            name: safeName,
            path: target,
            addedAt: Date.now(),
            tools: iocPath ? { cubemx: { ioc: iocPath } } : {},
            tags: templateSrc ? ['new', 'from-template'] : ['new'],
            pinned: false,
            note: templateSrc ? `从模板创建：${args.templateId}` : '新建的空工程'
          }
      const exists = all.findIndex(p => p.id === proj.id)
      if (exists >= 0) all[exists] = proj
      else all.push(proj)
      store.set('projects', all)
      return { ok: true, project: proj, ioc: iocPath || undefined }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })

  // ---- Duplicate an existing CubeMX .ioc configuration into a new project ----
  // Copies the source .ioc to a fresh directory, rewrites ProjectName/ProjectFileName
  // fields so CubeMX "Generate Code" will lay the new project under the new name.
  ipcMain.handle('project:copy-cubemx', (_e, args: {
    sourceIoc: string
    parent: string
    name: string
    copySiblings?: boolean   // also copy .mxproject / same-base-name files if present
  }): { ok: boolean; error?: string; project?: Project; ioc?: string } => {
    try {
      if (!args || !args.sourceIoc || !args.parent || !args.name) {
        return { ok: false, error: '参数不完整' }
      }
      if (!fs.existsSync(args.sourceIoc)) {
        return { ok: false, error: `源 .ioc 文件不存在：${args.sourceIoc}` }
      }
      if (!args.sourceIoc.toLowerCase().endsWith('.ioc')) {
        return { ok: false, error: '源文件必须是 .ioc' }
      }
      const safeName = args.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim()
      if (!safeName) return { ok: false, error: '工程名称非法' }
      if (!fs.existsSync(args.parent) || !fs.statSync(args.parent).isDirectory()) {
        return { ok: false, error: `父目录不存在：${args.parent}` }
      }
      const target = path.join(args.parent, safeName)
      if (fs.existsSync(target)) {
        return { ok: false, error: `目标已存在：${target}` }
      }

      const srcDir = path.dirname(args.sourceIoc)
      const srcBase = path.basename(args.sourceIoc, '.ioc')

      fs.mkdirSync(target, { recursive: true })

      // Read, rewrite, write new .ioc
      const raw = fs.readFileSync(args.sourceIoc, 'utf-8')
      const lines = raw.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]
        if (l.startsWith('ProjectManager.ProjectFileName=')) {
          lines[i] = `ProjectManager.ProjectFileName=${safeName}.ioc`
        } else if (l.startsWith('ProjectManager.ProjectName=')) {
          lines[i] = `ProjectManager.ProjectName=${safeName}`
        }
      }
      fs.writeFileSync(path.join(target, `${safeName}.ioc`), lines.join('\n'), 'utf-8')

      // Copy optional siblings: .mxproject and any file starting with <srcBase>.
      if (args.copySiblings !== false) {
        try {
          for (const entry of fs.readdirSync(srcDir)) {
            const full = path.join(srcDir, entry)
            if (!fs.statSync(full).isFile()) continue
            const low = entry.toLowerCase()
            if (entry === `${srcBase}.ioc`) continue  // handled above
            if (low === '.mxproject') {
              fs.copyFileSync(full, path.join(target, '.mxproject'))
            } else if (entry.startsWith(srcBase + '.')) {
              // e.g. OldName.ld, OldName.yaml → rename
              const suffix = entry.slice(srcBase.length)
              fs.copyFileSync(full, path.join(target, safeName + suffix))
            }
          }
        } catch { /* best-effort */ }
      }

      // Insert project record
      const all = store.get('projects')
      const id = sha1(target)
      const iocPath = path.join(target, `${safeName}.ioc`)
      const proj: Project = {
        id,
        name: safeName,
        path: target,
        addedAt: Date.now(),
        tools: { cubemx: { ioc: iocPath } },
        tags: ['copied-cubemx'],
        pinned: false,
        note: `复制自 ${args.sourceIoc}`
      }
      const idx = all.findIndex(p => p.id === id)
      if (idx >= 0) all[idx] = proj
      else all.push(proj)
      store.set('projects', all)
      return { ok: true, project: proj, ioc: iocPath }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  })
}
