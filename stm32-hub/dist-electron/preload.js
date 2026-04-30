"use strict";
const electron = require("electron");
const api = {
  dialog: {
    openDirectory: () => electron.ipcRenderer.invoke("dialog:open-directory"),
    openFile: (filters) => electron.ipcRenderer.invoke("dialog:open-file", filters)
  },
  shell: {
    openExternal: (url) => electron.ipcRenderer.invoke("shell:open-external", url),
    openPath: (p) => electron.ipcRenderer.invoke("shell:open-path", p),
    showInFolder: (p) => electron.ipcRenderer.invoke("shell:show-in-folder", p),
    openTerminal: (cwd) => electron.ipcRenderer.invoke("shell:open-terminal", cwd)
  },
  settings: {
    getAll: () => electron.ipcRenderer.invoke("settings:get-all"),
    set: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value),
    detectTools: () => electron.ipcRenderer.invoke("settings:detect-tools")
  },
  project: {
    scan: (root, depth) => electron.ipcRenderer.invoke("project:scan", root, depth),
    inspect: (path) => electron.ipcRenderer.invoke("project:inspect", path),
    list: () => electron.ipcRenderer.invoke("project:list"),
    upsert: (project) => electron.ipcRenderer.invoke("project:upsert", project),
    remove: (id) => electron.ipcRenderer.invoke("project:remove", id),
    readReadme: (path) => electron.ipcRenderer.invoke("project:read-readme", path),
    summarizeFiles: (path) => electron.ipcRenderer.invoke("project:summarize-files", path),
    stats: (path) => electron.ipcRenderer.invoke("project:stats", path),
    create: (args) => electron.ipcRenderer.invoke("project:create", args),
    copyCubemx: (args) => electron.ipcRenderer.invoke("project:copy-cubemx", args),
    listTemplates: () => electron.ipcRenderer.invoke("project:list-templates")
  },
  tutorial: {
    list: () => electron.ipcRenderer.invoke("tutorial:list"),
    load: (chapterId) => electron.ipcRenderer.invoke("tutorial:load", chapterId),
    root: () => electron.ipcRenderer.invoke("tutorial:root")
  },
  launcher: {
    openInKeil: (uvprojx) => electron.ipcRenderer.invoke("launcher:keil", uvprojx),
    openInVSCode: (folder) => electron.ipcRenderer.invoke("launcher:vscode", folder),
    openInCubeMX: (ioc) => electron.ipcRenderer.invoke("launcher:cubemx", ioc)
  },
  git: {
    status: (repo) => electron.ipcRenderer.invoke("git:status", repo),
    log: (repo, limit) => electron.ipcRenderer.invoke("git:log", repo, limit),
    commitDetail: (repo, hash) => electron.ipcRenderer.invoke("git:commit-detail", repo, hash),
    fileDiff: (repo, path, ref) => electron.ipcRenderer.invoke("git:file-diff", repo, path, ref),
    tree: (repo) => electron.ipcRenderer.invoke("git:tree", repo),
    remoteInfo: (repo) => electron.ipcRenderer.invoke("git:remote-info", repo),
    commitAndPush: (repo, message) => electron.ipcRenderer.invoke("git:commit-push", repo, message),
    fetch: (repo) => electron.ipcRenderer.invoke("git:fetch", repo),
    pull: (repo) => electron.ipcRenderer.invoke("git:pull", repo),
    batchStatus: (repos) => electron.ipcRenderer.invoke("git:batch-status", repos),
    batchFetch: (repos) => electron.ipcRenderer.invoke("git:batch-fetch", repos),
    fetchRepoMeta: (owner, name) => electron.ipcRenderer.invoke("git:github-meta", owner, name)
  },
  build: {
    cmake: (repo) => electron.ipcRenderer.invoke("build:cmake", repo),
    keil: (uvprojx) => electron.ipcRenderer.invoke("build:keil", uvprojx),
    cancel: () => electron.ipcRenderer.invoke("build:cancel")
  },
  ai: {
    generateDescription: (payload) => electron.ipcRenderer.invoke("ai:generate", payload)
  },
  stats: {
    aggregate: (paths) => electron.ipcRenderer.invoke("stats:aggregate", paths),
    commitHistory: (paths, days) => electron.ipcRenderer.invoke("stats:commit-history", paths, days)
  },
  serial: {
    list: () => electron.ipcRenderer.invoke("serial:list"),
    open: (cfg) => electron.ipcRenderer.invoke("serial:open", cfg),
    close: () => electron.ipcRenderer.invoke("serial:close"),
    write: (bytes) => electron.ipcRenderer.invoke("serial:write", { bytes }),
    status: () => electron.ipcRenderer.invoke("serial:status"),
    setSignals: (signals) => electron.ipcRenderer.invoke("serial:set-signals", signals)
  },
  on: (channel, cb) => {
    const allowed = ["build:output", "build:exit", "serial:data", "serial:error", "serial:closed"];
    if (!allowed.includes(channel)) return () => {
    };
    const wrapped = (_e, ...args) => cb(...args);
    electron.ipcRenderer.on(channel, wrapped);
    return () => electron.ipcRenderer.removeListener(channel, wrapped);
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
