# 教程内容编辑指南

这个目录的所有文件都会被 **直接打包进安装包**（通过 `electron-builder.yml` 的 `extraResources`），最终用户在「新手教程」模块里看到的就是这里的内容。

---

## 目录结构

```
tutorials/
├─ index.json              ← 章节总目录（顺序由数组顺序决定）
├─ 01-getting-started/
│  ├─ index.md             ← 章节正文（必须叫这个名字）
│  ├─ videos.json          ← 视频链接（可选，不存在等同空数组）
│  ├─ pinout.png           ← 章节里引用的图片
│  └─ board.jpg
└─ 02-gpio-led/
   ├─ index.md
   └─ videos.json
```

---

## 添加一章（3 步）

### 1️⃣ 新建章节目录

按 `NN-slug` 命名，`NN` 是 2 位数字决定排序：

```
tutorials/03-uart-basics/
```

### 2️⃣ 在目录里放正文 + 资源

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

**`videos.json`** — 配套视频链接（可选）：

```json
[
  { "title": "B 站 · 串口入门", "url": "https://www.bilibili.com/video/BV1xx", "duration": "12:34" },
  { "title": "YouTube · UART Protocol", "url": "https://youtu.be/xxx", "duration": "8:20" }
]
```

**图片** — 直接放在章节目录里，Markdown 用相对路径引用即可：

```markdown
![](pinout.png)
![时钟树](images/clock-tree.png)
```

软件会自动通过自定义 `tut://` 协议加载。

### 3️⃣ 在 `index.json` 注册

打开 `tutorials/index.json`，往 `chapters` 数组追加一项（**`id` 必须等于目录名**）：

```json
{
  "id": "03-uart-basics",
  "title": "第 3 章 · USART 串口收发",
  "summary": "用 printf 打印 Hello World，理解波特率/数据位/停止位。",
  "tags": ["UART", "printf"],
  "estimatedMinutes": 25
}
```

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

每次改完内容（无论改了 `index.json`、md 还是图片），都要重新打包才会带进安装包：

```bash
npm run dist
```

生成 `release/STM32 Hub-x.y.z-x64.exe`（NSIS 安装包）和同名 `.zip`。

> 💡 开发时直接 `npm run dev` 可以热加载本目录，不用每次都打包。

---

## 注意事项

- **图片建议压缩到 < 200KB**（推荐 [TinyPNG](https://tinypng.com)），否则安装包体积失控
- **视频不要放本地文件**，用 B 站 / YouTube 链接（视频体积是图片的几十倍）
- Markdown 渲染基于内置 parser，**不支持 HTML 标签**，请用纯 Markdown
- 章节 `id` 一旦发布，**不要再改**，改了用户的「最近浏览」就丢了
- 想插入数学公式或流程图，目前不支持 — 用图片（截图）代替
