# 教程内容编辑指南

这个目录的所有文件都会被 **直接打包进安装包**（通过 `electron-builder.yml` 的 `extraResources`），最终用户在「新手教程」模块里看到的就是这里的内容。

> 📁 **章节结构由文件夹自动决定** — 不需要在任何中央文件里"注册"章节，新建文件夹就出现，删除文件夹就消失。

---

## 目录结构（多层级）

```
tutorials/
├─ index.json                    ← 仅放全局 title / subtitle（可选）
│
├─ 01-basics/                    ← 第一篇（分组节点）
│  ├─ meta.json                  ← 可选：分组的 title / summary
│  ├─ index.md                   ← 可选：分组本身也可以写"导言"正文
│  │
│  ├─ 01-getting-started/        ← 第 1 章
│  │  ├─ index.md                ← 章节正文
│  │  ├─ meta.json               ← 可选：title / summary / tags / estimatedMinutes
│  │  ├─ videos.json             ← 可选：配套视频
│  │  └─ pinout.png              ← 章节里引用的图片
│  │
│  └─ 02-gpio-led/
│     ├─ index.md
│     └─ meta.json
│
└─ 02-peripherals/                ← 第二篇
   └─ 01-uart-basics/
      ├─ index.md
      └─ videos.json
```

**层级随便嵌**。任何文件夹只要含 `index.md` 就是一个可阅读的章节；只有子文件夹、自己没有 `index.md` 的就是纯分组节点（点击只展开/收起）。

---

## 添加一章 / 一节（2 步）

### 1️⃣ 新建文件夹

按 `NN-slug` 命名，`NN` 是数字决定排序：

- 顶层：`tutorials/03-advanced/` — 一个新的篇章
- 嵌套：`tutorials/01-basics/03-uart-basics/` — 在「基础篇」下加一节
- 多层：`tutorials/02-peripherals/01-uart/03-dma-mode/` — 想嵌多深都行

### 2️⃣ 在文件夹里放正文 + 资源

**`index.md`** — 章节正文，使用 Markdown：

````markdown
# 第 3 章 · USART 串口收发

## 前置条件

- 完成第 1、2 章
- 准备 USB-TTL 模块

## 代码示例

```c
HAL_UART_Transmit(&huart1, (uint8_t*)"Hello\r\n", 7, 100);
```

> ⚠️ 注意：波特率两端要一致，否则收到乱码。

![PA9/PA10 引脚位置](pinout.png)
````

**`meta.json`**（可选）— 提供更精准的标题和元信息：

```json
{
  "title": "第 3 章 · USART 串口收发",
  "summary": "用 printf 打印 Hello World，理解波特率/数据位/停止位。",
  "tags": ["UART", "printf"],
  "estimatedMinutes": 25,
  "icon": "📡"
}
```

> 不写 `meta.json` 也能跑：标题会从 `index.md` 第一行 `# 标题` 提取，没有就用文件夹名。

**`icon` 字段（可选）** — 侧边栏章节前的图标，任意 emoji。不写就用默认（章节 📄 / 分组 📁）。建议挑一个能体现章节主题的 emoji，例如 💡 入门、⚡ GPIO、📡 串口、🔧 调试、🎛 PWM、⏱ 定时器、🌡 ADC、💾 存储……风格上和左侧主导航的图标保持一致即可。

**`videos.json`**（可选）— 配套视频链接：

```json
[
  { "title": "B 站 · 串口入门", "url": "https://www.bilibili.com/video/BV1xx", "duration": "12:34" },
  { "title": "YouTube · UART Protocol", "url": "https://youtu.be/xxx", "duration": "8:20" }
]
```

**图片** — 直接放在章节文件夹里，Markdown 用相对路径引用：

```markdown
![](pinout.png)
![时钟树](images/clock-tree.png)
```

软件会通过自定义 `tut://` 协议自动加载（支持任意嵌套层级）。

---

## 关于"分组"节点

**分组**指只有子文件夹、自己不一定有正文的节点。点开后行为：

| 情况 | 点击行为 |
| --- | --- |
| 文件夹有 `index.md` | 显示这篇正文（导言/总览） |
| 文件夹只有子文件夹，没 `index.md` | 仅展开/收起子节点 |
| 三角符 `▶` | 不论何种情况，点三角符只切换展开状态 |

> 想给一个篇章写"开篇语"？在它的目录里放一个 `index.md` 就行，子章节会同时显示在它下面。

---

## 排序规则

文件夹按名字开头的数字排序：`01-` 在 `02-` 前面，`10-` 在 `2-` 后面（建议都写两位）。没数字前缀的按字母序在数字后面。

修改排序 = 重命名文件夹。**注意：文件夹名一旦发布，不要再改**，改了等于换 id，用户的"最近浏览"会丢。

---

## 全局 title / subtitle

`tutorials/index.json` 现在只放全局信息，**章节列表不再写在这里**：

```json
{
  "title": "STM32 新手教程",
  "subtitle": "从零开始，循序渐进"
}
```

不存在或字段缺失也没事，会用默认值。

---

## Markdown 支持的语法

| 元素     | 写法                                         |
| -------- | -------------------------------------------- |
| 标题     | `# H1` `## H2` `### H3` `#### H4`            |
| 粗体     | `**粗体**`                                   |
| 斜体     | `*斜体*`                                     |
| 行内代码 | `` `code` ``                                 |
| 代码块   | ` ```c ... ``` ` （**支持语法高亮**）        |
| 引用     | `> 注意事项`                                 |
| 无序列表 | `- item` 或 `* item`                         |
| 有序列表 | `1. item`                                    |
| 链接     | `[文本](https://...)`（自动外部浏览器打开）  |
| 图片     | `![alt](relative.png)`（相对当前章节目录）   |
| 表格     | GFM `\| col \| col \|` 风格                  |
| 分割线   | `---`                                        |

### 代码块语法高亮

支持的语言：`c` / `cpp` / `bash` / `json` / `ini`。其它语言会显示为纯文本但仍带复制按钮。

````markdown
```c
HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13);
```

```bash
npm run dist
```

```json
{ "key": "value" }
```
````

代码块右上角自动出现「📋 复制」按钮（鼠标移上去才显示）。

---

## 重新打包

每次改完内容（无论加目录、改 md 还是图片），都要重新打包才会带进安装包：

```bash
npm run dist
```

生成 `release/STM32 Hub-x.y.z-x64.exe`（NSIS 安装包）和同名 `.zip`。

> 💡 开发时直接 `npm run dev` 可以热加载本目录，加新文件夹后点侧栏右上的「↻ 刷新」即可看到。

---

## 注意事项

- **图片建议压缩到 < 200KB**（推荐 [TinyPNG](https://tinypng.com)），否则安装包体积失控
- **视频不要放本地文件**，用 B 站 / YouTube 链接（视频体积是图片的几十倍）
- Markdown 渲染基于内置 parser，**不支持 HTML 标签**，请用纯 Markdown
- 章节文件夹名一旦发布，**不要再改**，改了用户的「最近浏览」就丢了
- 想插入数学公式或流程图，目前不支持 — 用图片（截图）代替
- 文件夹名以 `_`、`.` 开头会被忽略（可用作草稿目录）
