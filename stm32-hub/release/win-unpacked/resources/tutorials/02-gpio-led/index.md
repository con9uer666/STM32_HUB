# 第 2 章 · GPIO：让 LED 闪起来

> 本章目标：在 BluePill 上点亮 PC13 引脚的板载 LED，并实现 1Hz 闪烁。

## 2.1 硬件

BluePill 板载 LED 接在 **PC13**，低电平点亮（共阳极接法）。

## 2.2 用 CubeMX 配置

1. 在仪表盘点击 **➕ 新建空工程**，选择模板 `STM32F103C8T6`。
2. 软件会自动复制一份 `.ioc` 模板到目标目录。
3. 点 **打开 CubeMX**，把 **PC13** 设置为 `GPIO_Output`。
4. 点 **Generate Code**。

## 2.3 关键代码

在 `Core/Src/main.c` 的 `while(1)` 中：

```c
while (1)
{
  HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13);
  HAL_Delay(500);   // 500ms 翻转 → 1Hz 闪烁
}
```

## 2.4 编译与下载

- 在工程详情页点 **🔨 编译 (CMake)** 或 **🔨 编译 (Keil)**
- 用 ST-Link 烧录生成的 `.hex` / `.bin`

## 2.5 常见坑

| 现象 | 可能原因 |
| --- | --- |
| LED 一直亮 / 一直灭 | PC13 模式没设成输出 |
| 编译错误：未定义 `HAL_GPIO_TogglePin` | 没勾选 GPIO 库 / 重新生成代码 |
| 烧录失败 | ST-Link 驱动未装、SWD 接线错误 |

> **试一试**：把延时改成 100ms，会看到「呼吸感」更明显的闪烁。
