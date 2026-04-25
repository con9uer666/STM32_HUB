# STM32 Hub

轻量化的 STM32 工程管理器，统一调度 **Keil / VSCode+CMake / CubeMX / Git / DeepSeek AI**。

## 功能

- 📂 **工程聚合**：扫描或手动添加工程文件夹，自动识别 Keil / CMake / CubeMX 支持
- 🚀 **一键启动**：点一下卡片上的徽章，直接打开对应 IDE 并加载工程
- 🌲 **Git 面板**：文件树 + 状态 + 最近提交 + 一键 Commit & Push
- ✨ **AI 描述**：DeepSeek 读取 README + 源码列表 + `.ioc` 自动生成项目摘要
- 🛠 **命令行构建**：CMake `cmake --build` / Keil `UV4 -b` 直接在软件内跑，流式输出
- 🏷 **卡片定制**：标签、置顶、颜色、备注，标签多选过滤 + 搜索
- ⚙ **GitHub 元数据**：可选配置 PAT 拉取 stars / issues / 语言占比

## 安装

从 `release/` 目录拿：

- **安装版**：`STM32 Hub-0.1.0-x64.exe`（NSIS 安装包，可自选安装目录、创建桌面快捷方式）
- **便携版**：`STM32 Hub-0.1.0-x64.zip`（解压即用，配置写入 `%APPDATA%/stm32-hub`）

拷到任意 Windows 10/11 x64 电脑上运行即可。首次启动会自动探测 Keil / CubeMX / VSCode / CMake / Ninja 路径，未命中的在「设置」中手动指定。

## 首次使用

1. 打开软件 → 右上角「🔍 自动探测」→ 填上 DeepSeek API Key（可选）
2. Dashboard → 「📂 扫描目录」选一个含 STM32 工程的父目录 → 递归 3 层自动入库
3. 点击任意卡片进入详情 → 标签、备注、Git push、AI 描述、编译全部在一个页面

## 开发

```bash
npm install         # 首次
npm run dev         # 开发态：Vite HMR + Electron 热重载
npm run build       # 生成 unpacked 目录（release/win-unpacked）
npm run dist        # 生成 NSIS 安装包 + 便携 zip
```

## 技术栈

Electron 32 + Vue 3 + Vite 5 + Naive UI + Pinia + simple-git + @octokit/rest

## 配置位置

- **用户数据**：`%APPDATA%/stm32-hub/` （工程列表、设置、AI key）
- **工具探测**：首次启动读注册表 `HKLM\SOFTWARE\Keil\Products\MDK` + 常见安装路径

## 已知限制

- 需要本机已装 git 并在 PATH（push 功能）
- Keil 命令行编译要求 `UV4.exe` 路径已配置
- AI 描述当前使用 DeepSeek 兼容 OpenAI 接口；切换其他厂商只需在「设置」改 endpoint + model
