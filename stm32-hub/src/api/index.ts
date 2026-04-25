import type { Project, HubSettings, ToolPaths } from '@/types'

interface HubApi {
  dialog: {
    openDirectory: () => Promise<string | null>
    openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
    openPath: (p: string) => Promise<string>
    showInFolder: (p: string) => Promise<void>
    openTerminal: (cwd: string) => Promise<{ ok: boolean; error?: string }>
  }
  settings: {
    getAll: () => Promise<HubSettings>
    set: (key: string, value: unknown) => Promise<HubSettings>
    detectTools: () => Promise<{ detected: ToolPaths; settings: HubSettings }>
  }
  project: {
    scan: (root: string, depth?: number) => Promise<{ added: number; total: number; projects: Project[] }>
    inspect: (path: string) => Promise<any>
    list: () => Promise<Project[]>
    upsert: (project: Project) => Promise<Project[]>
    remove: (id: string) => Promise<Project[]>
    readReadme: (path: string) => Promise<string>
    summarizeFiles: (path: string) => Promise<{ files: string[]; iocInfo: string }>
    stats: (path: string) => Promise<{ ok: boolean; stats?: { sourceCount: number; loc: number; totalBytes: number; lastModified: number }; error?: string }>
    create: (args: { parent: string; name: string; initGit?: boolean; withReadme?: boolean; templateId?: string })
      => Promise<{ ok: boolean; error?: string; project?: Project; ioc?: string }>
    copyCubemx: (args: { sourceIoc: string; parent: string; name: string; copySiblings?: boolean })
      => Promise<{ ok: boolean; error?: string; project?: Project; ioc?: string }>
    listTemplates: () => Promise<{ ok: boolean; templates: Array<{
      id: string; name: string; mcu: string; package?: string; family?: string; summary?: string; file: string
    }>; root: string }>
  }
  tutorial: {
    list: () => Promise<{ ok: boolean; error?: string; index?: {
      title?: string
      subtitle?: string
      chapters: Array<{ id: string; title: string; summary?: string; tags?: string[]; estimatedMinutes?: number }>
    }; root?: string }>
    load: (chapterId: string) => Promise<{ ok: boolean; error?: string; chapter?: {
      meta: { id: string; title: string; summary?: string; tags?: string[]; estimatedMinutes?: number }
      markdown: string
      images: string[]
      videos: Array<{ title: string; url: string; duration?: string }>
    } }>
    root: () => Promise<string>
  }
  launcher: {
    openInKeil: (uvprojx: string) => Promise<{ ok: boolean; error?: string }>
    openInVSCode: (folder: string) => Promise<{ ok: boolean; error?: string }>
    openInCubeMX: (ioc: string) => Promise<{ ok: boolean; error?: string }>
  }
  git: {
    status: (repo: string) => Promise<any>
    log: (repo: string, limit?: number) => Promise<any>
    commitDetail: (repo: string, hash: string) => Promise<any>
    fileDiff: (repo: string, path: string, ref?: string) => Promise<any>
    tree: (repo: string) => Promise<any>
    remoteInfo: (repo: string) => Promise<any>
    commitAndPush: (repo: string, message: string) => Promise<any>
    fetch: (repo: string) => Promise<{ ok: boolean; output?: string; error?: string }>
    pull: (repo: string) => Promise<any>
    batchStatus: (repos: string[]) => Promise<{ ok: boolean; results: Record<string, any> }>
    batchFetch: (repos: string[]) => Promise<{ ok: boolean; results: Record<string, { ok: boolean; error?: string }> }>
    fetchRepoMeta: (owner: string, name: string) => Promise<any>
  }
  build: {
    cmake: (repo: string) => Promise<{ ok: boolean; error?: string; code?: number }>
    keil: (uvprojx: string) => Promise<{ ok: boolean; error?: string; code?: number }>
    cancel: () => Promise<{ ok: boolean; error?: string }>
  }
  ai: {
    generateDescription: (payload: { readme: string; fileList: string[]; iocInfo: string; projectName: string }) => Promise<any>
  }
  stats: {
    aggregate: (paths: string[]) => Promise<{
      ok: boolean
      error?: string
      perProject: Array<{
        path: string
        loc: number
        sourceCount: number
        totalBytes: number
        lastModified: number
        langBreakdown: { c: number; h: number; cpp: number; s: number; other: number }
        isGit: boolean
        commits: number
        branch: string
        dirty: boolean
        changedCount: number
        remoteUrl: string
      }>
    }>
    commitHistory: (paths: string[], days?: number) => Promise<{ ok: boolean; error?: string; buckets: Array<{ date: string; count: number }> }>
  }
  serial: {
    list: () => Promise<{
      ok: boolean
      error?: string
      ports: Array<{
        path: string
        manufacturer: string
        serialNumber: string
        pnpId: string
        vendorId: string
        productId: string
        friendlyName: string
      }>
    }>
    open: (cfg: {
      path: string
      baudRate: number
      dataBits?: 5 | 6 | 7 | 8
      stopBits?: 1 | 1.5 | 2
      parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
      rtscts?: boolean
      xon?: boolean
      xoff?: boolean
    }) => Promise<{ ok: boolean; error?: string; path?: string }>
    close: () => Promise<{ ok: boolean; error?: string }>
    write: (bytes: number[]) => Promise<{ ok: boolean; error?: string; written?: number }>
    status: () => Promise<{ isOpen: boolean; path: string | null; baudRate: number | null }>
    setSignals: (signals: { dtr?: boolean; rts?: boolean; brk?: boolean })
      => Promise<{ ok: boolean; error?: string }>
  }
  on: (channel: string, cb: (...args: any[]) => void) => () => void
}

declare global {
  interface Window {
    api: HubApi
  }
}

export const api = window.api
