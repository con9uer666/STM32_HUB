"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
const electron = require("electron");
const path = require("node:path");
const node_url = require("node:url");
const fs = require("node:fs");
const crypto = require("node:crypto");
const node_child_process = require("node:child_process");
const Store = require("electron-store");
const simpleGit = require("simple-git");
const serialport = require("serialport");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const defaults = {
  projects: [],
  settings: {
    toolPaths: {},
    aiEndpoint: "https://api.deepseek.com/chat/completions",
    aiModel: "deepseek-chat",
    githubAuthMode: "local",
    theme: "dark",
    scanDepth: 3
  }
};
const store = new Store({ defaults, name: "stm32-hub" });
const SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "build",
  "Debug",
  "Release",
  "Objects",
  "Listings",
  "RTE",
  "DebugConfig",
  ".vscode",
  ".idea",
  "dist",
  "out",
  "__pycache__"
]);
function sha1$1(s) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}
function findFilesByExt(dir, ext) {
  const out = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
        out.push(path.join(dir, entry.name));
      }
    }
  } catch {
  }
  return out;
}
function hasKeilFiles(dir) {
  const direct = findFilesByExt(dir, ".uvprojx");
  if (direct.length > 0) return direct[0];
  const mdkDir = path.join(dir, "MDK-ARM");
  if (fs.existsSync(mdkDir)) {
    const nested = findFilesByExt(mdkDir, ".uvprojx");
    if (nested.length > 0) return nested[0];
  }
  return void 0;
}
function hasCMakeFiles(dir) {
  const root = path.join(dir, "CMakeLists.txt");
  if (!fs.existsSync(root)) return false;
  try {
    const content = fs.readFileSync(root, "utf-8").toLowerCase();
    if (content.includes("stm32") || content.includes("cortex-m") || content.includes("arm-none-eabi")) return true;
  } catch {
  }
  const checks = ["Core/Src", "Src", "Drivers", "cmake"];
  for (const c of checks) {
    const full = path.join(dir, c);
    if (fs.existsSync(full)) return true;
  }
  return false;
}
function hasIoc(dir) {
  const found = findFilesByExt(dir, ".ioc");
  return found[0];
}
function hasGit(dir) {
  return fs.existsSync(path.join(dir, ".git"));
}
function inspectDirectory(dir) {
  const tools = {};
  const uvprojx = hasKeilFiles(dir);
  if (uvprojx) tools.keil = { uvprojx };
  if (hasCMakeFiles(dir)) tools.vscode = { hasCMake: true };
  const ioc = hasIoc(dir);
  if (ioc) tools.cubemx = { ioc };
  if (!tools.keil && !tools.vscode && !tools.cubemx) return null;
  return {
    path: dir,
    name: path.basename(dir),
    tools,
    hasGit: hasGit(dir)
  };
}
function scanDirectory(root, maxDepth = 3) {
  const results = [];
  const seen = /* @__PURE__ */ new Set();
  function walk(current2, depth) {
    if (depth > maxDepth) return;
    const norm = path.resolve(current2);
    if (seen.has(norm)) return;
    seen.add(norm);
    const detected = inspectDirectory(norm);
    if (detected) {
      results.push(detected);
      return;
    }
    try {
      for (const entry of fs.readdirSync(norm, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (SKIP_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".")) continue;
        walk(path.join(norm, entry.name), depth + 1);
      }
    } catch {
    }
  }
  walk(root, 0);
  return results;
}
function buildProjectFromDetected(detected) {
  return {
    id: sha1$1(detected.path),
    name: detected.name,
    path: detected.path,
    addedAt: Date.now(),
    tools: detected.tools,
    tags: [],
    pinned: false,
    note: ""
  };
}
function templatesRoot() {
  if (electron.app.isPackaged) return path.join(process.resourcesPath, "templates");
  return path.join(process.env.APP_ROOT, "templates");
}
function readTemplateManifest() {
  try {
    const p = path.join(templatesRoot(), "templates.json");
    if (!fs.existsSync(p)) return [];
    const j = JSON.parse(fs.readFileSync(p, "utf-8"));
    return Array.isArray(j == null ? void 0 : j.templates) ? j.templates : [];
  } catch {
    return [];
  }
}
function rewriteIocProjectName(srcPath, destPath, projectName) {
  const raw = fs.readFileSync(srcPath, "utf-8");
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("ProjectManager.ProjectFileName=")) {
      lines[i] = `ProjectManager.ProjectFileName=${projectName}.ioc`;
    } else if (l.startsWith("ProjectManager.ProjectName=")) {
      lines[i] = `ProjectManager.ProjectName=${projectName}`;
    }
  }
  fs.writeFileSync(destPath, lines.join("\n"), "utf-8");
}
function sha1(s) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}
function parseRemote$1(remoteUrl) {
  if (!remoteUrl) return {};
  const m = remoteUrl.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) return {};
  return { owner: m[1], repo: m[2] };
}
function registerProjectIpc() {
  electron.ipcMain.handle("project:scan", async (_e, root, depth) => {
    const settings = store.get("settings");
    const d = depth ?? settings.scanDepth ?? 3;
    const detected = scanDirectory(root, d);
    const existing = store.get("projects");
    const existingIds = new Set(existing.map((p) => p.id));
    const newProjects = [];
    for (const det of detected) {
      const proj = buildProjectFromDetected(det);
      if (!existingIds.has(proj.id)) newProjects.push(proj);
    }
    const merged = [...existing, ...newProjects];
    store.set("projects", merged);
    return { added: newProjects.length, total: merged.length, projects: merged };
  });
  electron.ipcMain.handle("project:inspect", (_e, dir) => {
    const detected = inspectDirectory(dir);
    return detected;
  });
  electron.ipcMain.handle("project:list", () => store.get("projects"));
  electron.ipcMain.handle("project:upsert", (_e, project) => {
    const all = store.get("projects");
    const idx = all.findIndex((p) => p.id === project.id);
    if (idx >= 0) all[idx] = project;
    else all.push(project);
    store.set("projects", all);
    return all;
  });
  electron.ipcMain.handle("project:remove", (_e, id) => {
    const all = store.get("projects").filter((p) => p.id !== id);
    store.set("projects", all);
    return all;
  });
  electron.ipcMain.handle("project:read-readme", (_e, projectPath) => {
    const candidates = ["README.md", "Readme.md", "readme.md", "README.MD"];
    for (const c of candidates) {
      const full = path.join(projectPath, c);
      if (fs.existsSync(full)) {
        try {
          return fs.readFileSync(full, "utf-8").slice(0, 4e3);
        } catch {
        }
      }
    }
    return "";
  });
  electron.ipcMain.handle("project:summarize-files", (_e, projectPath) => {
    const sourceDirs = ["Core/Src", "Core/Inc", "Src", "Inc", "src", "include", "User", "HARDWARE", "App", "app"];
    const files = [];
    for (const d of sourceDirs) {
      const full = path.join(projectPath, d);
      if (!fs.existsSync(full)) continue;
      try {
        for (const entry of fs.readdirSync(full)) {
          if (/\.(c|h|cpp|hpp)$/i.test(entry)) files.push(`${d}/${entry}`);
        }
      } catch {
      }
    }
    let iocInfo = "";
    try {
      const rootEntries = fs.readdirSync(projectPath);
      const ioc = rootEntries.find((e) => e.toLowerCase().endsWith(".ioc"));
      if (ioc) {
        const content = fs.readFileSync(path.join(projectPath, ioc), "utf-8");
        const keys = ["Mcu.Family", "Mcu.Name", "Mcu.Package", "ProjectManager.ProjectName"];
        const lines = content.split(/\r?\n/).filter((l) => keys.some((k) => l.startsWith(k + "=")));
        iocInfo = lines.join("\n");
      }
    } catch {
    }
    return { files: files.slice(0, 80), iocInfo };
  });
  electron.ipcMain.handle("project:parse-remote", (_e, url) => parseRemote$1(url));
  electron.ipcMain.handle("project:list-templates", () => {
    const templates = readTemplateManifest();
    const ok = templates.filter((t) => {
      const p = path.join(templatesRoot(), t.file);
      return fs.existsSync(p);
    });
    return { ok: true, templates: ok, root: templatesRoot() };
  });
  electron.ipcMain.handle("project:create", (_e, args) => {
    try {
      if (!args || !args.parent || !args.name) {
        return { ok: false, error: "参数不完整" };
      }
      const safeName = args.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
      if (!safeName) return { ok: false, error: "工程名称非法" };
      if (!fs.existsSync(args.parent) || !fs.statSync(args.parent).isDirectory()) {
        return { ok: false, error: `父目录不存在：${args.parent}` };
      }
      const target = path.join(args.parent, safeName);
      if (fs.existsSync(target)) {
        return { ok: false, error: `目标已存在：${target}` };
      }
      let templateSrc = "";
      if (args.templateId) {
        const tpl = readTemplateManifest().find((t) => t.id === args.templateId);
        if (!tpl) return { ok: false, error: `未找到模板：${args.templateId}` };
        templateSrc = path.join(templatesRoot(), tpl.file);
        if (!fs.existsSync(templateSrc)) {
          return { ok: false, error: `模板文件缺失：${tpl.file}` };
        }
      }
      fs.mkdirSync(target, { recursive: true });
      let iocPath = "";
      if (templateSrc) {
        iocPath = path.join(target, `${safeName}.ioc`);
        rewriteIocProjectName(templateSrc, iocPath, safeName);
      }
      if (args.withReadme !== false) {
        const next = templateSrc ? `下一步：
- 在 CubeMX 中打开 ${safeName}.ioc，按需勾选外设、配置时钟，点击 Generate Code
` : `下一步：
- 在 CubeMX 中打开此目录，新建 .ioc 并选择 MCU、外设、生成代码
- 或将已有 .uvprojx / CMakeLists.txt 拷入此目录
`;
        const body = `# ${safeName}

> STM32 project scaffold created by STM32-Hub.

` + next;
        fs.writeFileSync(path.join(target, "README.md"), body, "utf-8");
      }
      if (args.initGit) {
        try {
          node_child_process.execSync("git init", { cwd: target, stdio: "ignore" });
          const gitignore = `# Build artifacts
build/
Debug/
Release/
Objects/
Listings/
DebugConfig/
RTE/
*.o
*.obj
*.map
*.elf
*.hex
*.bin
*.axf

# IDE
.vscode/
.idea/
`;
          fs.writeFileSync(path.join(target, ".gitignore"), gitignore, "utf-8");
        } catch {
        }
      }
      const all = store.get("projects");
      const detected = inspectDirectory(target);
      const proj = detected ? buildProjectFromDetected(detected) : {
        id: sha1(target),
        name: safeName,
        path: target,
        addedAt: Date.now(),
        tools: iocPath ? { cubemx: { ioc: iocPath } } : {},
        tags: templateSrc ? ["new", "from-template"] : ["new"],
        pinned: false,
        note: templateSrc ? `从模板创建：${args.templateId}` : "新建的空工程"
      };
      const exists2 = all.findIndex((p) => p.id === proj.id);
      if (exists2 >= 0) all[exists2] = proj;
      else all.push(proj);
      store.set("projects", all);
      return { ok: true, project: proj, ioc: iocPath || void 0 };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("project:copy-cubemx", (_e, args) => {
    try {
      if (!args || !args.sourceIoc || !args.parent || !args.name) {
        return { ok: false, error: "参数不完整" };
      }
      if (!fs.existsSync(args.sourceIoc)) {
        return { ok: false, error: `源 .ioc 文件不存在：${args.sourceIoc}` };
      }
      if (!args.sourceIoc.toLowerCase().endsWith(".ioc")) {
        return { ok: false, error: "源文件必须是 .ioc" };
      }
      const safeName = args.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
      if (!safeName) return { ok: false, error: "工程名称非法" };
      if (!fs.existsSync(args.parent) || !fs.statSync(args.parent).isDirectory()) {
        return { ok: false, error: `父目录不存在：${args.parent}` };
      }
      const target = path.join(args.parent, safeName);
      if (fs.existsSync(target)) {
        return { ok: false, error: `目标已存在：${target}` };
      }
      const srcDir = path.dirname(args.sourceIoc);
      const srcBase = path.basename(args.sourceIoc, ".ioc");
      fs.mkdirSync(target, { recursive: true });
      const raw = fs.readFileSync(args.sourceIoc, "utf-8");
      const lines = raw.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (l.startsWith("ProjectManager.ProjectFileName=")) {
          lines[i] = `ProjectManager.ProjectFileName=${safeName}.ioc`;
        } else if (l.startsWith("ProjectManager.ProjectName=")) {
          lines[i] = `ProjectManager.ProjectName=${safeName}`;
        }
      }
      fs.writeFileSync(path.join(target, `${safeName}.ioc`), lines.join("\n"), "utf-8");
      if (args.copySiblings !== false) {
        try {
          for (const entry of fs.readdirSync(srcDir)) {
            const full = path.join(srcDir, entry);
            if (!fs.statSync(full).isFile()) continue;
            const low = entry.toLowerCase();
            if (entry === `${srcBase}.ioc`) continue;
            if (low === ".mxproject") {
              fs.copyFileSync(full, path.join(target, ".mxproject"));
            } else if (entry.startsWith(srcBase + ".")) {
              const suffix = entry.slice(srcBase.length);
              fs.copyFileSync(full, path.join(target, safeName + suffix));
            }
          }
        } catch {
        }
      }
      const all = store.get("projects");
      const id = sha1(target);
      const iocPath = path.join(target, `${safeName}.ioc`);
      const proj = {
        id,
        name: safeName,
        path: target,
        addedAt: Date.now(),
        tools: { cubemx: { ioc: iocPath } },
        tags: ["copied-cubemx"],
        pinned: false,
        note: `复制自 ${args.sourceIoc}`
      };
      const idx = all.findIndex((p) => p.id === id);
      if (idx >= 0) all[idx] = proj;
      else all.push(proj);
      store.set("projects", all);
      return { ok: true, project: proj, ioc: iocPath };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
}
function launchDetached(exe, args) {
  const child = node_child_process.spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}
function registerLauncherIpc() {
  electron.ipcMain.handle("launcher:keil", (_e, uvprojx) => {
    const settings = store.get("settings");
    const keil = settings.toolPaths.keil;
    if (!keil || !fs.existsSync(keil)) {
      return { ok: false, error: "Keil UV4.exe path not configured. Set it in Settings." };
    }
    if (!fs.existsSync(uvprojx)) return { ok: false, error: `File not found: ${uvprojx}` };
    try {
      launchDetached(keil, [uvprojx]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("launcher:vscode", (_e, folder) => {
    const settings = store.get("settings");
    let code = settings.toolPaths.vscode || "";
    if (!fs.existsSync(folder)) return { ok: false, error: `Folder not found: ${folder}` };
    try {
      if (process.platform === "win32") {
        if (!code) {
          const child = node_child_process.spawn("cmd.exe", ["/c", "start", '""', "/B", "code", folder], {
            detached: true,
            stdio: "ignore",
            windowsHide: true
          });
          child.unref();
        } else {
          let exe = code;
          if (code.toLowerCase().endsWith(".cmd") || code.toLowerCase().endsWith(".bat")) {
            const dir = path.dirname(code);
            const guessed = path.join(dir, "..", "Code.exe");
            if (fs.existsSync(guessed)) exe = guessed;
          }
          if (exe.toLowerCase().endsWith(".exe")) {
            launchDetached(exe, [folder]);
          } else {
            const child = node_child_process.spawn("cmd.exe", ["/c", "start", '""', "/B", `"${code}"`, `"${folder}"`], {
              detached: true,
              stdio: "ignore",
              windowsHide: true,
              shell: false
            });
            child.unref();
          }
        }
      } else {
        const child = node_child_process.spawn(code || "code", [folder], { detached: true, stdio: "ignore" });
        child.unref();
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("launcher:cubemx", (_e, iocOrFolder) => {
    const settings = store.get("settings");
    const cubemx = settings.toolPaths.cubemx;
    if (!cubemx || !fs.existsSync(cubemx)) {
      return { ok: false, error: "CubeMX path not configured. Set it in Settings." };
    }
    try {
      launchDetached(cubemx, [iocOrFolder]);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
}
function gitOf(repo) {
  return simpleGit.simpleGit(repo);
}
function parseRemote(url) {
  const m = url.match(/(?:https?:\/\/|git@)([^/:]+)[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) return {};
  return { host: m[1], owner: m[2], repo: m[3] };
}
function isGitRepo(repo) {
  return fs.existsSync(path.join(repo, ".git"));
}
const STATUS_LABEL = {
  A: { label: "+", key: "A" },
  M: { label: "M", key: "M" },
  D: { label: "-", key: "D" },
  R: { label: "→", key: "R" },
  C: { label: "C", key: "A" },
  T: { label: "T", key: "M" }
};
function registerGitIpc() {
  electron.ipcMain.handle("git:status", async (_e, repo) => {
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    try {
      const g = gitOf(repo);
      const status = await g.status();
      const branch = status.current;
      return {
        ok: true,
        branch,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        not_added: status.not_added,
        deleted: status.deleted,
        conflicted: status.conflicted,
        isClean: status.isClean()
      };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:log", async (_e, repo, limit = 30) => {
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    try {
      const log = await gitOf(repo).log({ maxCount: limit });
      return {
        ok: true,
        commits: log.all.map((c) => ({
          hash: c.hash.slice(0, 7),
          fullHash: c.hash,
          date: c.date,
          message: c.message,
          author: c.author_name
        }))
      };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:commit-detail", async (_e, repo, hash) => {
    var _a;
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    try {
      const g = gitOf(repo);
      const numstatRaw = await g.raw(["show", "--numstat", "--name-status", "--format=%H%n%an%n%ae%n%aI%n%B%n---BODYEND---", hash]);
      const lines = numstatRaw.split(/\r?\n/);
      const bodyEndIdx = lines.findIndex((l) => l === "---BODYEND---");
      const fileLines = bodyEndIdx >= 0 ? lines.slice(bodyEndIdx + 1) : [];
      const files = [];
      const statusByPath = {};
      const numstatByPath = {};
      for (const l of fileLines) {
        if (!l.trim()) continue;
        if (/^[AMDRCTU](\d+)?\t/.test(l)) {
          const parts = l.split("	");
          const tag = parts[0][0];
          const p = parts[parts.length - 1];
          statusByPath[p] = ((_a = STATUS_LABEL[tag]) == null ? void 0 : _a.key) ?? "M";
        } else if (/^(\d+|-)\t(\d+|-)\t/.test(l)) {
          const parts = l.split("	");
          const ins = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
          const del = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
          const p = parts[parts.length - 1];
          numstatByPath[p] = { ins, del };
        }
      }
      const allPaths = /* @__PURE__ */ new Set([...Object.keys(statusByPath), ...Object.keys(numstatByPath)]);
      let additions = 0;
      let deletions = 0;
      for (const p of allPaths) {
        const st = statusByPath[p] ?? "M";
        const ns = numstatByPath[p] ?? { ins: 0, del: 0 };
        additions += ns.ins;
        deletions += ns.del;
        files.push({
          path: p,
          status: st,
          statusLabel: st === "A" ? "+" : st === "D" ? "-" : st === "R" ? "→" : "M",
          insertions: ns.ins,
          deletions: ns.del,
          changes: ns.ins + ns.del
        });
      }
      files.sort((a, b) => b.changes - a.changes);
      return { ok: true, detail: { files, additions, deletions, loading: false } };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:file-diff", async (_e, repo, filePath, ref) => {
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    try {
      const g = gitOf(repo);
      const args = ref ? ["show", `${ref}`, "--", filePath] : ["diff", "HEAD", "--", filePath];
      const diff = await g.raw(args);
      return { ok: true, diff };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:tree", async (_e, repo) => {
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    try {
      let toArray = function(node) {
        if (!node.__dir) return { key: node.__key ?? node.name, label: node.name, isLeaf: true };
        const kids = Object.values(node.children).map((c) => {
          c.__key = (node.__key ? node.__key + "/" : "") + c.name;
          return toArray(c);
        });
        return { key: node.__key ?? node.name, label: node.name, children: kids };
      };
      const g = gitOf(repo);
      const out = await g.raw(["ls-tree", "-r", "--name-only", "HEAD"]);
      const files = out.split(/\r?\n/).filter(Boolean);
      const root = { name: repo.split(/[\\/]/).pop() || "root", children: {}, __dir: true };
      for (const f of files) {
        const parts = f.split("/");
        let cur = root;
        for (let i = 0; i < parts.length; i++) {
          const name = parts[i];
          const isLeaf = i === parts.length - 1;
          if (!cur.children[name]) {
            cur.children[name] = isLeaf ? { name, __dir: false } : { name, children: {}, __dir: true };
          }
          cur = cur.children[name];
        }
      }
      return { ok: true, tree: toArray(root) };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:remote-info", async (_e, repo) => {
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    try {
      const remotes = await gitOf(repo).getRemotes(true);
      const origin = remotes.find((r) => r.name === "origin") || remotes[0];
      if (!origin) return { ok: true, remote: null };
      const url = origin.refs.push || origin.refs.fetch;
      return { ok: true, remote: { name: origin.name, url, ...parseRemote(url) } };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:commit-push", async (_e, repo, message) => {
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    if (!(message == null ? void 0 : message.trim())) return { ok: false, error: "Commit message is empty" };
    try {
      const g = gitOf(repo);
      await g.add(["-A"]);
      const status = await g.status();
      let committed = false;
      if (!status.isClean()) {
        await g.commit(message);
        committed = true;
      }
      const pushResult = await g.push();
      return {
        ok: true,
        committed,
        push: JSON.parse(JSON.stringify(pushResult ?? null))
      };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:fetch", async (_e, repo) => {
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    try {
      const out = await gitOf(repo).raw(["fetch", "--all", "--prune"]);
      return { ok: true, output: String(out ?? "") };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:pull", async (_e, repo) => {
    var _a, _b, _c;
    if (!isGitRepo(repo)) return { ok: false, error: "Not a git repository" };
    try {
      const res = await gitOf(repo).pull();
      return {
        ok: true,
        summary: {
          insertions: ((_a = res == null ? void 0 : res.summary) == null ? void 0 : _a.insertions) ?? 0,
          deletions: ((_b = res == null ? void 0 : res.summary) == null ? void 0 : _b.deletions) ?? 0,
          changes: ((_c = res == null ? void 0 : res.summary) == null ? void 0 : _c.changes) ?? 0,
          files: Array.isArray(res == null ? void 0 : res.files) ? [...res.files] : []
        }
      };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("git:batch-status", async (_e, repos) => {
    const results = {};
    if (!Array.isArray(repos)) return { ok: true, results };
    await Promise.all(repos.map(async (r) => {
      var _a, _b, _c, _d;
      if (!r || typeof r !== "string") {
        return;
      }
      if (!isGitRepo(r)) {
        results[r] = null;
        return;
      }
      try {
        const s = await gitOf(r).status();
        results[r] = {
          branch: s.current ?? "",
          ahead: s.ahead ?? 0,
          behind: s.behind ?? 0,
          dirty: !s.isClean(),
          changedCount: (((_a = s.modified) == null ? void 0 : _a.length) ?? 0) + (((_b = s.not_added) == null ? void 0 : _b.length) ?? 0) + (((_c = s.deleted) == null ? void 0 : _c.length) ?? 0) + (((_d = s.staged) == null ? void 0 : _d.length) ?? 0)
        };
      } catch {
        results[r] = null;
      }
    }));
    return { ok: true, results };
  });
  electron.ipcMain.handle("git:batch-fetch", async (_e, repos) => {
    const results = {};
    await Promise.all(repos.map(async (r) => {
      if (!isGitRepo(r)) {
        results[r] = { ok: false, error: "Not a git repository" };
        return;
      }
      try {
        await gitOf(r).raw(["fetch", "--all", "--prune"]);
        results[r] = { ok: true };
      } catch (e) {
        results[r] = { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
      }
    }));
    return { ok: true, results };
  });
  electron.ipcMain.handle("git:github-meta", async (_e, owner, repoName) => {
    const settings = store.get("settings");
    if (settings.githubAuthMode !== "pat" || !settings.githubPat) {
      return { ok: false, error: "GitHub PAT not configured (switch to PAT mode in Settings)." };
    }
    try {
      const { Octokit } = await import("@octokit/rest");
      const octo = new Octokit({ auth: settings.githubPat });
      const { data } = await octo.repos.get({ owner, repo: repoName });
      let languages = {};
      try {
        const langResp = await octo.repos.listLanguages({ owner, repo: repoName });
        languages = langResp.data;
      } catch {
      }
      return {
        ok: true,
        meta: {
          stars: data.stargazers_count,
          forks: data.forks_count,
          openIssues: data.open_issues_count,
          defaultBranch: data.default_branch,
          description: data.description,
          homepage: data.homepage,
          visibility: data.visibility,
          updatedAt: data.updated_at,
          languages
        }
      };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
}
let current = null;
function emit(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function runStreaming(cmd, args, cwd, win, opts = {}) {
  return new Promise((resolve) => {
    var _a, _b;
    emit(win, "build:output", { kind: "info", text: `$ ${cmd} ${args.join(" ")}
` });
    const child = node_child_process.spawn(cmd, args, { cwd, shell: opts.shell, windowsHide: true });
    current = child;
    (_a = child.stdout) == null ? void 0 : _a.on("data", (d) => emit(win, "build:output", { kind: "stdout", text: d.toString() }));
    (_b = child.stderr) == null ? void 0 : _b.on("data", (d) => emit(win, "build:output", { kind: "stderr", text: d.toString() }));
    child.on("close", (code) => {
      current = null;
      emit(win, "build:output", { kind: "info", text: `
[exit ${code ?? 0}]
` });
      resolve({ code: code ?? 0 });
    });
    child.on("error", (err) => {
      current = null;
      emit(win, "build:output", { kind: "stderr", text: `
[spawn error] ${err.message}
` });
      resolve({ code: -1 });
    });
  });
}
function registerBuildIpc(getWindow) {
  electron.ipcMain.handle("build:cmake", async (_e, repo) => {
    if (!fs.existsSync(path.join(repo, "CMakeLists.txt"))) {
      return { ok: false, error: "No CMakeLists.txt in project root" };
    }
    const settings = store.get("settings");
    const cmake = settings.toolPaths.cmake || "cmake";
    const win = getWindow();
    const buildDir = path.join(repo, "build");
    const firstRun = !fs.existsSync(buildDir);
    emit(win, "build:output", { kind: "info", text: `=== CMake build for ${repo} ===
` });
    if (firstRun) {
      const args = ["-B", "build"];
      if (settings.toolPaths.ninja) args.push("-G", "Ninja");
      const cfg = await runStreaming(cmake, args, repo, win);
      if (cfg.code !== 0) {
        emit(win, "build:exit", { code: cfg.code });
        return { ok: false, error: "configure failed" };
      }
    }
    const b = await runStreaming(cmake, ["--build", "build"], repo, win);
    emit(win, "build:exit", { code: b.code });
    return { ok: b.code === 0, code: b.code };
  });
  electron.ipcMain.handle("build:keil", async (_e, uvprojx) => {
    const settings = store.get("settings");
    const keil = settings.toolPaths.keil;
    const win = getWindow();
    if (!keil) return { ok: false, error: "Keil UV4.exe not configured" };
    if (!fs.existsSync(uvprojx)) return { ok: false, error: `Project file not found: ${uvprojx}` };
    const logFile = path.join(path.dirname(uvprojx), "stm32hub_build.log");
    emit(win, "build:output", { kind: "info", text: `=== Keil build for ${uvprojx} ===
` });
    const result = await runStreaming(keil, ["-b", uvprojx, "-j0", "-o", logFile], path.dirname(uvprojx), win);
    if (fs.existsSync(logFile)) {
      try {
        const content = fs.readFileSync(logFile, "utf-8");
        emit(win, "build:output", { kind: "stdout", text: "\n--- build log ---\n" + content });
      } catch {
      }
    }
    emit(win, "build:exit", { code: result.code });
    return { ok: result.code < 2, code: result.code };
  });
  electron.ipcMain.handle("build:cancel", () => {
    if (current && !current.killed) {
      current.kill();
      return { ok: true };
    }
    return { ok: false, error: "No build running" };
  });
}
function buildPrompt(p) {
  return `You are analysing an STM32 embedded firmware project called "${p.projectName}".
Respond with a strict JSON object, no markdown fences, matching this schema:
{
  "summary": string (<=120 Chinese characters, describing what the firmware does),
  "mcu": string (e.g. "STM32F103C8T6" or "unknown"),
  "peripherals": string[] (e.g. ["UART", "SPI", "TIM"]; dedupe; <=8 items),
  "features": string[] (<=6 short bullet phrases describing concrete functionality)
}

Context:

--- README.md (truncated) ---
${p.readme || "(none)"}

--- .ioc key fields ---
${p.iocInfo || "(none)"}

--- source files (sample) ---
${p.fileList.slice(0, 60).join("\n") || "(none)"}
`;
}
const REQUEST_TIMEOUT_MS = 12e4;
function safe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}
function registerAiIpc() {
  electron.ipcMain.handle("ai:generate", async (_e, payload) => {
    var _a, _b, _c;
    try {
      const settings = store.get("settings");
      if (!settings.aiKey) return { ok: false, error: "DeepSeek API Key 未设置，请在「设置」中填入" };
      const endpoint = settings.aiEndpoint || "https://api.deepseek.com/chat/completions";
      const model = settings.aiModel || "deepseek-chat";
      const prompt = buildPrompt(payload);
      const body = {
        model,
        messages: [
          { role: "system", content: "You are a concise firmware documentation assistant. Output strict JSON only, no markdown fences." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        stream: false,
        response_format: { type: "json_object" }
      };
      console.log("[ai:generate] endpoint=%s model=%s bodyBytes=%d", endpoint, model, JSON.stringify(body).length);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let resp;
      try {
        resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${settings.aiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } catch (e) {
        clearTimeout(timer);
        const msg = (e == null ? void 0 : e.name) === "AbortError" ? `请求超时 (>${REQUEST_TIMEOUT_MS / 1e3}s)` : "网络错误：" + String((e == null ? void 0 : e.message) ?? e);
        return { ok: false, error: msg };
      }
      clearTimeout(timer);
      const raw = await resp.text();
      console.log("[ai:generate] status=%d bytes=%d", resp.status, raw.length);
      if (!resp.ok) {
        return { ok: false, error: `HTTP ${resp.status}`, raw: raw.slice(0, 600) };
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return { ok: false, error: "外层 JSON 解析失败：" + ((e == null ? void 0 : e.message) ?? String(e)), raw: raw.slice(0, 600) };
      }
      const content = ((_c = (_b = (_a = data == null ? void 0 : data.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content) ?? "";
      if (!content) {
        return { ok: false, error: "响应中没有 choices[0].message.content", raw: raw.slice(0, 600) };
      }
      const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        return { ok: false, error: "模型返回不是合法 JSON：" + ((e == null ? void 0 : e.message) ?? String(e)), raw: cleaned.slice(0, 600) };
      }
      return safe({
        ok: true,
        result: {
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
          mcu: typeof parsed.mcu === "string" ? parsed.mcu : "",
          peripherals: Array.isArray(parsed.peripherals) ? parsed.peripherals.map(String) : [],
          features: Array.isArray(parsed.features) ? parsed.features.map(String) : [],
          generatedAt: Date.now()
        },
        usage: (data == null ? void 0 : data.usage) ?? null
      });
    } catch (e) {
      console.error("[ai:generate] unexpected error", e);
      return { ok: false, error: "未预期错误：" + String((e == null ? void 0 : e.message) ?? e) };
    }
  });
}
function exists(p) {
  return !!p && fs.existsSync(p);
}
function whichWin(cmd) {
  try {
    const out = node_child_process.execSync(`where ${cmd}`, { encoding: "utf-8", windowsHide: true });
    const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    return first;
  } catch {
    return void 0;
  }
}
function detectKeil() {
  try {
    const out = node_child_process.execSync(
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Keil\\Products\\MDK" /v Path 2>nul || reg query "HKLM\\SOFTWARE\\Keil\\Products\\MDK" /v Path',
      { encoding: "utf-8", windowsHide: true }
    );
    const m = out.match(/Path\s+REG_SZ\s+(.+)/i);
    if (m) {
      const root = m[1].trim();
      const candidate = path.join(root.replace(/[\\/]?ARM[\\/]?$/i, ""), "UV4", "UV4.exe");
      if (exists(candidate)) return candidate;
      const candidate2 = path.join(root, "..", "UV4", "UV4.exe");
      if (exists(candidate2)) return candidate2;
    }
  } catch {
  }
  const commonPaths = [
    "C:\\Keil_v5\\UV4\\UV4.exe",
    "C:\\Keil\\UV4\\UV4.exe",
    "D:\\Keil_v5\\UV4\\UV4.exe",
    "E:\\Keil_v5\\UV4\\UV4.exe"
  ];
  return commonPaths.find(exists);
}
function detectCubeMX() {
  const candidates = [
    "C:\\Program Files\\STMicroelectronics\\STM32Cube\\STM32CubeMX\\STM32CubeMX.exe",
    "C:\\Program Files (x86)\\STMicroelectronics\\STM32Cube\\STM32CubeMX\\STM32CubeMX.exe",
    "C:\\ST\\STM32CubeMX\\STM32CubeMX.exe",
    "D:\\ST\\STM32CubeMX\\STM32CubeMX.exe"
  ];
  return candidates.find(exists);
}
function detectAllTools() {
  return {
    keil: detectKeil(),
    cubemx: detectCubeMX(),
    vscode: whichWin("code.cmd") || whichWin("code"),
    cmake: whichWin("cmake"),
    ninja: whichWin("ninja")
  };
}
function registerSettingsIpc() {
  electron.ipcMain.handle("settings:get-all", () => store.get("settings"));
  electron.ipcMain.handle("settings:set", (_e, key, value) => {
    const settings = store.get("settings");
    const parts = key.split(".");
    let cur = settings;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    store.set("settings", settings);
    return settings;
  });
  electron.ipcMain.handle("settings:detect-tools", () => {
    const detected = detectAllTools();
    const settings = store.get("settings");
    for (const [key, value] of Object.entries(detected)) {
      if (value && !settings.toolPaths[key]) {
        settings.toolPaths[key] = value;
      }
    }
    store.set("settings", settings);
    return { detected, settings };
  });
}
function registerShellExtraIpc() {
  electron.ipcMain.handle("shell:open-terminal", (_e, cwd) => {
    if (!fs.existsSync(cwd)) return { ok: false, error: `目录不存在: ${cwd}` };
    try {
      if (process.platform === "win32") {
        const wt = node_child_process.spawn("wt.exe", ["-d", cwd], { detached: true, stdio: "ignore", shell: false });
        wt.on("error", () => {
          const ps = node_child_process.spawn("powershell.exe", ["-NoExit", "-Command", `Set-Location -LiteralPath '${cwd.replace(/'/g, "''")}'`], { detached: true, stdio: "ignore" });
          ps.on("error", () => {
            node_child_process.spawn("cmd.exe", ["/K", `cd /d "${cwd}"`], { detached: true, stdio: "ignore" }).unref();
          });
          ps.unref();
        });
        wt.unref();
      } else if (process.platform === "darwin") {
        node_child_process.spawn("open", ["-a", "Terminal", cwd], { detached: true, stdio: "ignore" }).unref();
      } else {
        node_child_process.spawn("x-terminal-emulator", [], { cwd, detached: true, stdio: "ignore" }).unref();
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e) };
    }
  });
  electron.ipcMain.handle("project:stats", async (_e, projectPath) => {
    if (!fs.existsSync(projectPath)) return { ok: false, error: "目录不存在" };
    const exts = /* @__PURE__ */ new Set([".c", ".h", ".cpp", ".hpp", ".cc", ".s"]);
    const skip = /* @__PURE__ */ new Set([
      "node_modules",
      ".git",
      "build",
      "Debug",
      "Release",
      "Objects",
      "Listings",
      "RTE",
      "DebugConfig",
      ".vscode",
      ".idea",
      "dist",
      "out",
      "__pycache__"
    ]);
    let sourceCount = 0;
    let loc = 0;
    let totalBytes = 0;
    let lastModified = 0;
    const fsp = fs.promises;
    async function walk(dir, depth) {
      if (depth > 5) return;
      let entries = [];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      const tasks = [];
      for (const ent of entries) {
        if (skip.has(ent.name)) continue;
        if (ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          tasks.push(walk(full, depth + 1));
        } else if (ent.isFile()) {
          const ext = path.extname(ent.name).toLowerCase();
          if (!exts.has(ext)) continue;
          tasks.push((async () => {
            try {
              const st = await fsp.stat(full);
              sourceCount++;
              totalBytes += st.size;
              if (st.mtimeMs > lastModified) lastModified = st.mtimeMs;
              if (st.size < 2e6) {
                const buf = await fsp.readFile(full);
                let lines = 0;
                for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
                loc += lines + (buf.length > 0 && buf[buf.length - 1] !== 10 ? 1 : 0);
              }
            } catch {
            }
          })());
        }
      }
      await Promise.all(tasks);
    }
    await walk(projectPath, 0);
    return { ok: true, stats: { sourceCount, loc, totalBytes, lastModified } };
  });
  electron.ipcMain.handle("stats:aggregate", async (_e, projectPaths) => {
    if (!Array.isArray(projectPaths)) return { ok: false, error: "paths must be array", perProject: [] };
    console.log("[stats:aggregate] start paths=%d", projectPaths.length);
    let simpleGit2;
    try {
      const mod = await import("simple-git");
      simpleGit2 = mod.simpleGit;
    } catch (e) {
      console.error("[stats:aggregate] simple-git import failed", e);
      return { ok: false, error: "simple-git 模块加载失败：" + ((e == null ? void 0 : e.message) ?? String(e)), perProject: [] };
    }
    const fsp = fs.promises;
    const exts = /* @__PURE__ */ new Set([".c", ".h", ".cpp", ".hpp", ".cc", ".s", ".S", ".asm"]);
    const skip = /* @__PURE__ */ new Set([
      "node_modules",
      ".git",
      "build",
      "Debug",
      "Release",
      "Objects",
      "Listings",
      "RTE",
      "DebugConfig",
      ".vscode",
      ".idea",
      "dist",
      "out",
      "__pycache__"
    ]);
    async function statProject(projectPath) {
      const result = {
        path: projectPath,
        loc: 0,
        sourceCount: 0,
        totalBytes: 0,
        lastModified: 0,
        langBreakdown: { c: 0, h: 0, cpp: 0, s: 0, other: 0 },
        isGit: false,
        commits: 0,
        branch: "",
        dirty: false,
        changedCount: 0,
        remoteUrl: ""
      };
      if (!fs.existsSync(projectPath)) return result;
      async function walk(dir, depth) {
        if (depth > 5) return;
        let entries = [];
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        const tasks2 = [];
        for (const ent of entries) {
          if (skip.has(ent.name)) continue;
          if (ent.name.startsWith(".")) continue;
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) {
            tasks2.push(walk(full, depth + 1));
          } else if (ent.isFile()) {
            const ext = path.extname(ent.name).toLowerCase();
            if (!exts.has(ext)) continue;
            tasks2.push((async () => {
              try {
                const st = await fsp.stat(full);
                result.sourceCount++;
                result.totalBytes += st.size;
                if (st.mtimeMs > result.lastModified) result.lastModified = st.mtimeMs;
                if (ext === ".c") result.langBreakdown.c++;
                else if (ext === ".h" || ext === ".hpp") result.langBreakdown.h++;
                else if (ext === ".cpp" || ext === ".cc") result.langBreakdown.cpp++;
                else if (ext === ".s" || ext === ".asm") result.langBreakdown.s++;
                else result.langBreakdown.other++;
                if (st.size < 2e6) {
                  const buf = await fsp.readFile(full);
                  let lines = 0;
                  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
                  result.loc += lines + (buf.length > 0 && buf[buf.length - 1] !== 10 ? 1 : 0);
                }
              } catch {
              }
            })());
          }
        }
        await Promise.all(tasks2);
      }
      const tasks = [walk(projectPath, 0)];
      if (fs.existsSync(path.join(projectPath, ".git"))) {
        result.isGit = true;
        tasks.push((async () => {
          var _a, _b, _c, _d, _e2, _f;
          try {
            const g = simpleGit2(projectPath);
            const [countStr, st, remotes] = await Promise.all([
              g.raw(["rev-list", "--count", "HEAD"]).catch(() => "0"),
              g.status().catch(() => null),
              g.getRemotes(true).catch(() => [])
            ]);
            result.commits = parseInt(String(countStr).trim(), 10) || 0;
            if (st) {
              result.branch = st.current ?? "";
              result.dirty = !st.isClean();
              result.changedCount = (((_a = st.modified) == null ? void 0 : _a.length) ?? 0) + (((_b = st.not_added) == null ? void 0 : _b.length) ?? 0) + (((_c = st.deleted) == null ? void 0 : _c.length) ?? 0) + (((_d = st.staged) == null ? void 0 : _d.length) ?? 0);
            }
            const origin = remotes.find((r) => r.name === "origin") || remotes[0];
            if (origin) result.remoteUrl = ((_e2 = origin.refs) == null ? void 0 : _e2.push) || ((_f = origin.refs) == null ? void 0 : _f.fetch) || "";
          } catch {
          }
        })());
      }
      await Promise.all(tasks);
      return result;
    }
    try {
      const perProject = await Promise.all(projectPaths.map(statProject));
      console.log(
        "[stats:aggregate] done projects=%d, totalLoc=%d",
        perProject.length,
        perProject.reduce((s, p) => s + p.loc, 0)
      );
      return { ok: true, perProject };
    } catch (e) {
      console.error("[stats:aggregate] failed", e);
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e), perProject: [] };
    }
  });
  electron.ipcMain.handle("stats:commit-history", async (_e, projectPaths, days = 90) => {
    if (!Array.isArray(projectPaths)) return { ok: false, error: "paths must be array", buckets: [] };
    console.log("[stats:commit-history] start paths=%d days=%d", projectPaths.length, days);
    let simpleGit2;
    try {
      const mod = await import("simple-git");
      simpleGit2 = mod.simpleGit;
    } catch (e) {
      console.error("[stats:commit-history] simple-git import failed", e);
      return { ok: false, error: "simple-git 模块加载失败：" + ((e == null ? void 0 : e.message) ?? String(e)), buckets: [] };
    }
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
    const buckets = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1e3);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = 0;
    }
    await Promise.all(projectPaths.map(async (p) => {
      if (!fs.existsSync(path.join(p, ".git"))) return;
      try {
        const g = simpleGit2(p);
        const out = await g.raw(["log", `--since=${since.toISOString()}`, "--pretty=format:%aI"]);
        const lines = out.split(/\r?\n/).filter(Boolean);
        for (const iso of lines) {
          const key = iso.slice(0, 10);
          if (key in buckets) buckets[key]++;
        }
      } catch {
      }
    }));
    const ordered = Object.entries(buckets).map(([date, count]) => ({ date, count }));
    const total = ordered.reduce((s, b) => s + b.count, 0);
    console.log("[stats:commit-history] done buckets=%d total=%d", ordered.length, total);
    return { ok: true, buckets: ordered };
  });
}
let port = null;
let mainWin = () => null;
function send(channel, payload) {
  const w = mainWin();
  if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
}
function closeCurrent(reason) {
  if (!port) return;
  const p = port;
  port = null;
  try {
    if (p.isOpen) p.close(() => {
    });
  } catch {
  }
  send("serial:closed", { reason });
}
function registerSerialIpc(getWin) {
  mainWin = getWin;
  electron.ipcMain.handle("serial:list", async () => {
    try {
      const ports = await serialport.SerialPort.list();
      return {
        ok: true,
        ports: ports.map((p) => ({
          path: p.path,
          manufacturer: p.manufacturer || "",
          serialNumber: p.serialNumber || "",
          pnpId: p.pnpId || "",
          vendorId: p.vendorId || "",
          productId: p.productId || "",
          friendlyName: p.friendlyName || ""
        }))
      };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? String(e), ports: [] };
    }
  });
  electron.ipcMain.handle("serial:open", async (_e, cfg) => {
    if (port && port.isOpen) {
      return { ok: false, error: "已有串口打开，请先关闭" };
    }
    return await new Promise((resolve) => {
      try {
        const sp = new serialport.SerialPort({
          path: cfg.path,
          baudRate: cfg.baudRate,
          dataBits: cfg.dataBits ?? 8,
          stopBits: cfg.stopBits ?? 1,
          parity: cfg.parity ?? "none",
          rtscts: !!cfg.rtscts,
          xon: !!cfg.xon,
          xoff: !!cfg.xoff,
          autoOpen: false
        });
        sp.open((err) => {
          if (err) {
            resolve({ ok: false, error: err.message });
            return;
          }
          port = sp;
          sp.on("data", (buf) => {
            send("serial:data", {
              bytes: Array.from(buf),
              ts: Date.now()
            });
          });
          sp.on("error", (e) => {
            send("serial:error", { message: e.message });
          });
          sp.on("close", () => {
            if (port === sp) {
              port = null;
              send("serial:closed", { reason: "device-closed" });
            }
          });
          resolve({ ok: true, path: cfg.path });
        });
      } catch (e) {
        resolve({ ok: false, error: (e == null ? void 0 : e.message) ?? String(e) });
      }
    });
  });
  electron.ipcMain.handle("serial:close", async () => {
    if (!port) return { ok: true };
    return await new Promise((resolve) => {
      const p = port;
      port = null;
      try {
        p.close((err) => {
          if (err) resolve({ ok: false, error: err.message });
          else resolve({ ok: true });
        });
      } catch (e) {
        resolve({ ok: false, error: (e == null ? void 0 : e.message) ?? String(e) });
      }
    });
  });
  electron.ipcMain.handle("serial:write", async (_e, payload) => {
    if (!port || !port.isOpen) return { ok: false, error: "串口未打开" };
    const buf = Buffer.from(payload.bytes);
    return await new Promise((resolve) => {
      port.write(buf, (err) => {
        if (err) resolve({ ok: false, error: err.message });
        else {
          port.drain((err2) => {
            if (err2) resolve({ ok: false, error: err2.message });
            else resolve({ ok: true, written: buf.length });
          });
        }
      });
    });
  });
  electron.ipcMain.handle("serial:status", async () => {
    return {
      isOpen: !!(port && port.isOpen),
      path: (port == null ? void 0 : port.path) ?? null,
      baudRate: (port == null ? void 0 : port.baudRate) ?? null
    };
  });
  electron.ipcMain.handle("serial:set-signals", async (_e, signals) => {
    if (!port || !port.isOpen) return { ok: false, error: "串口未打开" };
    return await new Promise((resolve) => {
      try {
        port.set(signals, (err) => {
          if (err) resolve({ ok: false, error: err.message });
          else resolve({ ok: true });
        });
      } catch (e) {
        resolve({ ok: false, error: (e == null ? void 0 : e.message) ?? String(e) });
      }
    });
  });
}
function teardownSerial() {
  closeCurrent("app-exit");
}
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const HIDDEN_RE = /^[._]/;
const SKIP_NAMES = /* @__PURE__ */ new Set(["node_modules", "dist", ".git"]);
function tutorialsRoot() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "tutorials");
  }
  return path.join(process.env.APP_ROOT, "tutorials");
}
function safeRead(p) {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}
function readJson(p) {
  const txt = safeRead(p);
  if (txt == null) return null;
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
function extractFirstH1(md) {
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*#\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
    if (/^\s*[^\s#-]/.test(line) && line.trim().length > 0) break;
  }
  return null;
}
function prettifyFolderName(name) {
  return name.replace(/^\d+[._\-\s]+/, "").replace(/[-_]+/g, " ").trim() || name;
}
function compareFolderNames(a, b) {
  const ma = /^(\d+)/.exec(a);
  const mb = /^(\d+)/.exec(b);
  if (ma && mb) {
    const da = parseInt(ma[1], 10);
    const db = parseInt(mb[1], 10);
    if (da !== db) return da - db;
  } else if (ma) {
    return -1;
  } else if (mb) {
    return 1;
  }
  return a.localeCompare(b);
}
function listSubdirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).filter((n) => !HIDDEN_RE.test(n) && !SKIP_NAMES.has(n)).sort(compareFolderNames);
}
function buildTree(dir, relPath) {
  const subdirs = listSubdirs(dir);
  const nodes = [];
  for (const name of subdirs) {
    const childDir = path.join(dir, name);
    const childRel = relPath ? `${relPath}/${name}` : name;
    const meta = readJson(path.join(childDir, "meta.json")) ?? {};
    const mdPath = path.join(childDir, "index.md");
    const md = safeRead(mdPath);
    const hasContent = md != null;
    const children = buildTree(childDir, childRel);
    if (!hasContent && !children.some(hasAnyContent)) continue;
    const titleFromMd = md ? extractFirstH1(md) : null;
    const node = {
      id: childRel,
      title: meta.title || titleFromMd || prettifyFolderName(name),
      summary: meta.summary,
      tags: meta.tags,
      estimatedMinutes: meta.estimatedMinutes,
      icon: meta.icon,
      hasContent
    };
    if (children.length) node.children = children;
    nodes.push(node);
  }
  return nodes;
}
function hasAnyContent(n) {
  var _a;
  if (n.hasContent) return true;
  return !!((_a = n.children) == null ? void 0 : _a.some(hasAnyContent));
}
function readRootIndex() {
  const root = tutorialsRoot();
  const meta = readJson(path.join(root, "meta.json"));
  if (meta) return meta;
  const idx = readJson(path.join(root, "index.json"));
  return idx ?? {};
}
function readIndex() {
  const root = tutorialsRoot();
  const head = readRootIndex();
  return {
    title: head.title,
    subtitle: head.subtitle,
    tree: buildTree(root, "")
  };
}
function resolveNodeDir(id) {
  if (!id || id.includes("..")) return null;
  const root = tutorialsRoot();
  const target = path.resolve(root, id.split("/").join(path.sep));
  const rootResolved = path.resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) return null;
  try {
    if (!fs.statSync(target).isDirectory()) return null;
  } catch {
    return null;
  }
  return target;
}
function readChapter(id) {
  const dir = resolveNodeDir(id);
  if (!dir) return null;
  const md = safeRead(path.join(dir, "index.md"));
  if (md == null) return null;
  const metaJson = readJson(path.join(dir, "meta.json")) ?? {};
  const titleFromMd = extractFirstH1(md);
  const folderName = path.basename(dir);
  const title = metaJson.title || titleFromMd || prettifyFolderName(folderName);
  let videos = [];
  const v = safeRead(path.join(dir, "videos.json"));
  if (v) {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) videos = arr;
    } catch {
    }
  }
  let images = [];
  try {
    images = fs.readdirSync(dir).filter((f) => IMAGE_RE.test(f));
  } catch {
  }
  return {
    meta: {
      id,
      title,
      summary: metaJson.summary,
      tags: metaJson.tags,
      estimatedMinutes: metaJson.estimatedMinutes
    },
    markdown: md,
    images,
    videos
  };
}
function registerTutorialIpc() {
  try {
    electron.protocol.handle("tut", (req) => {
      try {
        const url = new URL(req.url);
        const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
        if (rel.includes("..")) return new Response("forbidden", { status: 403 });
        const target = path.join(tutorialsRoot(), rel);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
          return new Response("not found", { status: 404 });
        }
        return electron.net.fetch(node_url.pathToFileURL(target).toString());
      } catch (e) {
        return new Response(`error: ${(e == null ? void 0 : e.message) ?? e}`, { status: 500 });
      }
    });
  } catch {
  }
  electron.ipcMain.handle("tutorial:list", () => {
    try {
      const idx = readIndex();
      return { ok: true, index: idx, root: tutorialsRoot() };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) ?? "加载教程目录失败", index: null };
    }
  });
  electron.ipcMain.handle("tutorial:load", (_e, chapterId) => {
    const c = readChapter(chapterId);
    if (!c) return { ok: false, error: `章节未找到或没有正文：${chapterId}` };
    return { ok: true, chapter: c };
  });
  electron.ipcMain.handle("tutorial:root", () => tutorialsRoot());
}
electron.protocol.registerSchemesAsPrivileged([
  { scheme: "tut", privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);
const __dirname$1 = path.dirname(node_url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("main.js", document.baseURI).href));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "STM32 Hub",
    backgroundColor: "#18181c",
    autoHideMenuBar: true,
    icon: path.join(process.env.APP_ROOT, "resources", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
function registerCommonIpc() {
  electron.ipcMain.handle("dialog:open-directory", async () => {
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  electron.ipcMain.handle("dialog:open-file", async (_e, filters) => {
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      properties: ["openFile"],
      filters: filters ?? []
    });
    return result.canceled ? null : result.filePaths[0];
  });
  electron.ipcMain.handle("shell:open-external", (_e, url) => electron.shell.openExternal(url));
  electron.ipcMain.handle("shell:open-path", (_e, p) => electron.shell.openPath(p));
  electron.ipcMain.handle("shell:show-in-folder", (_e, p) => electron.shell.showItemInFolder(p));
}
electron.app.whenReady().then(() => {
  registerCommonIpc();
  registerSettingsIpc();
  registerProjectIpc();
  registerLauncherIpc();
  registerGitIpc();
  registerBuildIpc(() => mainWindow);
  registerAiIpc();
  registerShellExtraIpc();
  registerSerialIpc(() => mainWindow);
  registerTutorialIpc();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  teardownSerial();
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => {
  teardownSerial();
});
