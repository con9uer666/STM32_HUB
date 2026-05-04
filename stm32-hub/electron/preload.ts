import { contextBridge, ipcRenderer } from 'electron'

const api = {
  dialog: {
    openDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:open-directory'),
    openFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
      ipcRenderer.invoke('dialog:open-file', filters)
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    openPath: (p: string) => ipcRenderer.invoke('shell:open-path', p),
    showInFolder: (p: string) => ipcRenderer.invoke('shell:show-in-folder', p),
    openTerminal: (cwd: string) => ipcRenderer.invoke('shell:open-terminal', cwd)
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    set: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    detectTools: () => ipcRenderer.invoke('settings:detect-tools')
  },
  project: {
    scan: (root: string, depth?: number) => ipcRenderer.invoke('project:scan', root, depth),
    inspect: (path: string) => ipcRenderer.invoke('project:inspect', path),
    list: () => ipcRenderer.invoke('project:list'),
    upsert: (project: any) => ipcRenderer.invoke('project:upsert', project),
    remove: (id: string) => ipcRenderer.invoke('project:remove', id),
    readReadme: (path: string) => ipcRenderer.invoke('project:read-readme', path),
    summarizeFiles: (path: string) => ipcRenderer.invoke('project:summarize-files', path),
    stats: (path: string) => ipcRenderer.invoke('project:stats', path),
    create: (args: { parent: string; name: string; initGit?: boolean; withReadme?: boolean; templateId?: string }) =>
      ipcRenderer.invoke('project:create', args),
    copyCubemx: (args: { sourceIoc: string; parent: string; name: string; copySiblings?: boolean }) =>
      ipcRenderer.invoke('project:copy-cubemx', args),
    listTemplates: () => ipcRenderer.invoke('project:list-templates')
  },
  tutorial: {
    list: () => ipcRenderer.invoke('tutorial:list'),
    load: (chapterId: string) => ipcRenderer.invoke('tutorial:load', chapterId),
    root: () => ipcRenderer.invoke('tutorial:root'),
    checkUpdate: () => ipcRenderer.invoke('tutorial:check-update'),
    doUpdate: () => ipcRenderer.invoke('tutorial:do-update')
  },
  launcher: {
    openInKeil: (uvprojx: string) => ipcRenderer.invoke('launcher:keil', uvprojx),
    openInVSCode: (folder: string) => ipcRenderer.invoke('launcher:vscode', folder),
    openInCubeMX: (ioc: string) => ipcRenderer.invoke('launcher:cubemx', ioc)
  },
  git: {
    status: (repo: string) => ipcRenderer.invoke('git:status', repo),
    log: (repo: string, limit?: number) => ipcRenderer.invoke('git:log', repo, limit),
    commitDetail: (repo: string, hash: string) => ipcRenderer.invoke('git:commit-detail', repo, hash),
    fileDiff: (repo: string, path: string, ref?: string) => ipcRenderer.invoke('git:file-diff', repo, path, ref),
    tree: (repo: string) => ipcRenderer.invoke('git:tree', repo),
    remoteInfo: (repo: string) => ipcRenderer.invoke('git:remote-info', repo),
    commitAndPush: (repo: string, message: string) => ipcRenderer.invoke('git:commit-push', repo, message),
    fetch: (repo: string) => ipcRenderer.invoke('git:fetch', repo),
    pull: (repo: string) => ipcRenderer.invoke('git:pull', repo),
    batchStatus: (repos: string[]) => ipcRenderer.invoke('git:batch-status', repos),
    batchFetch: (repos: string[]) => ipcRenderer.invoke('git:batch-fetch', repos),
    fetchRepoMeta: (owner: string, name: string) => ipcRenderer.invoke('git:github-meta', owner, name)
  },
  build: {
    cmake: (repo: string) => ipcRenderer.invoke('build:cmake', repo),
    keil: (uvprojx: string) => ipcRenderer.invoke('build:keil', uvprojx),
    cancel: () => ipcRenderer.invoke('build:cancel')
  },
  ai: {
    generateDescription: (payload: { readme: string; fileList: string[]; iocInfo: string; projectName: string }) =>
      ipcRenderer.invoke('ai:generate', payload)
  },
  stats: {
    aggregate: (paths: string[]) => ipcRenderer.invoke('stats:aggregate', paths),
    commitHistory: (paths: string[], days?: number) => ipcRenderer.invoke('stats:commit-history', paths, days)
  },
  serial: {
    list: () => ipcRenderer.invoke('serial:list'),
    open: (cfg: {
      path: string
      baudRate: number
      dataBits?: 5 | 6 | 7 | 8
      stopBits?: 1 | 1.5 | 2
      parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
      rtscts?: boolean
      xon?: boolean
      xoff?: boolean
    }) => ipcRenderer.invoke('serial:open', cfg),
    close: () => ipcRenderer.invoke('serial:close'),
    write: (bytes: number[]) => ipcRenderer.invoke('serial:write', { bytes }),
    status: () => ipcRenderer.invoke('serial:status'),
    setSignals: (signals: { dtr?: boolean; rts?: boolean; brk?: boolean }) =>
      ipcRenderer.invoke('serial:set-signals', signals)
  },
  on: (channel: string, cb: (...args: any[]) => void) => {
    const allowed = ['build:output', 'build:exit', 'serial:data', 'serial:error', 'serial:closed']
    if (!allowed.includes(channel)) return () => {}
    const wrapped = (_e: any, ...args: any[]) => cb(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type HubApi = typeof api
