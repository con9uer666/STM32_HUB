# IOC 模板编辑指南

这个目录里的 `.ioc` 文件会被 **打包进安装包**，作为「新建空工程」时可选的 MCU 模板。用户选中模板后，软件会把对应 `.ioc` 复制到新工程目录，并改写其中的 `ProjectName` / `ProjectFileName` 字段，然后调起 CubeMX 让用户自己配置外设。

---

## 目录结构

```
templates/
├─ templates.json          ← 模板清单（决定下拉框选项）
├─ stm32f103c8t6.ioc       ← BluePill 模板
├─ stm32f411ceu6.ioc       ← BlackPill 模板
└─ stm32f407zgt6.ioc       ← 探索者 F4 模板
```

---

## 添加一个新模板（3 步）

### 1️⃣ 用 CubeMX 生成最小 `.ioc`

1. 打开 **STM32CubeMX**，「新建工程」选目标 MCU
2. **只配 HSE + PLL（时钟树）**，不要勾任何外设（让用户自己选）
3. 在「Project Manager」里：
   - Project Name 随便填，待会会被覆盖
   - Toolchain / IDE 选 **STM32CubeIDE**（其它也可以，最通用是它）
4. 点 「GENERATE CODE」生成一次（顺便检查无报错），然后从工程目录里 **只把 `.ioc` 拷出来**

### 2️⃣ 放到本目录并改名

按 MCU 型号小写命名，例如：

```
templates/stm32g431cbu6.ioc
```

> ⚠️ 不要带版本号、不要带空格，因为 `id` 会用到这个文件名（去掉 `.ioc` 后缀）。

### 3️⃣ 注册到 `templates.json`

打开 `templates/templates.json`，往 `templates` 数组追加一项：

```json
{
  "id": "stm32g431cbu6",
  "name": "STM32G431CBU6 (G4 Nucleo)",
  "mcu": "STM32G431CBUx",
  "package": "UFQFPN48",
  "family": "STM32G4",
  "summary": "G4 主流入门，HSI 16MHz → PLL → 170MHz，集成 FDCAN",
  "file": "stm32g431cbu6.ioc"
}
```

字段说明：

| 字段        | 必填 | 用途                                             |
| ----------- | ---- | ------------------------------------------------ |
| `id`        | ✅   | 唯一 ID，建议和文件名（去后缀）一致              |
| `name`      | ✅   | 下拉框显示的标签                                 |
| `mcu`       | ✅   | CubeMX 内部 MCU 名（写错也不影响，只用于展示）   |
| `package`   |      | 封装，仅展示                                     |
| `family`    |      | 系列分组，仅展示                                 |
| `summary`   |      | 选中后显示在下方的一行说明（有则显示）           |
| `file`      | ✅   | 模板 `.ioc` 文件名（必须和本目录里一致）         |

---

## 模板的「最小化原则」

模板应该 **只做时钟设置，不勾任何外设**。理由：

- 用户加 LED 时不会被预设的 USART 干扰
- 文件越小，复制越快，错误率越低
- 用户从空白配起反而更容易学到东西

✅ 推荐保留：
- HSE / HSI / LSE 时钟源
- PLL 配置（让 SYSCLK 跑到推荐频率）
- SYS → SysTick / Debug 选 SWD（不然会丢调试口）
- NVIC 优先级分组（默认 GROUP_4 即可）

❌ **不要**预设：
- USART / I2C / SPI / 任何外设
- GPIO 上下拉
- DMA / 中断使能

---

## 重新打包

```bash
npm run dist
```

打包后的 `release/win-unpacked/resources/templates/` 应该能看到新模板。

---

## 模板复制时发生了什么

软件在「新建空工程」时执行：

1. 用户选模板 → 拿到 `file` 字段
2. 读取 `templates/<file>` 完整文本
3. 替换两行：
   ```
   ProjectManager.ProjectName=<新工程名>
   ProjectManager.ProjectFileName=<新工程名>.ioc
   ```
4. 写到 `<目标目录>/<新工程名>.ioc`
5. 弹「打开 CubeMX？」，用户确认就调起 CubeMX 生成代码

所以你的模板里 **不需要操心工程名**，软件会自动改写。其它字段（MCU、时钟、Pinout）保持不动。

---

## 故障排查

| 现象                         | 原因                                   |
| ---------------------------- | -------------------------------------- |
| 下拉框看不到新模板           | 没在 `templates.json` 注册             |
| 选中后报「读取模板失败」     | `file` 字段写错了文件名                |
| 创建后 CubeMX 打不开 .ioc    | 模板文件本身有损坏，重新从 CubeMX 导   |
| 工程名没改对                 | 你的 .ioc 缺了 `ProjectManager.*` 行   |
