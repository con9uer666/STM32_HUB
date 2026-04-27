# 第 3 节 · 现代 STM32 工具链：CMake + VS Code

> 本节目标：搭一套更适合长期维护的开发环境，让编辑、构建、调试和项目管理更灵活。

## 这套组合的优势是什么

和传统 IDE 相比，CMake + VS Code 更像“可自由组合的零件箱”：

- CMake 负责构建描述。
- ARM GCC 负责实际编译。
- VS Code 负责编辑、跳转、搜索和插件生态。
- 调试通常交给 Cortex-Debug、OpenOCD 或 ST-Link GDB Server。

## 一套最小可用组合

- ARM GCC 工具链
- CMake
- Ninja（推荐）
- VS Code
- C/C++、CMake Tools、Cortex-Debug 等扩展

## 一个常见工作流

1. 用 CubeMX 准备好 `.ioc` 和基础代码。
2. 用模板或已有工程整理出 `CMakeLists.txt`。
3. 在 VS Code 中执行配置与构建。
4. 生成 `.elf`、`.hex` 或 `.bin`。
5. 通过下载器烧录并调试。

## 你至少要看懂的几个概念

### 构建目录

建议把编译输出放在单独的 `build` 目录，不要和源码混在一起。这样清理、重配和切换配置都更方便。

### Toolchain File

这是告诉 CMake “我要给 ARM 目标交叉编译”的关键配置。如果它不对，后面很多报错都只是表象。

### 编译数据库

许多 VS Code 的代码补全、跳转和静态分析能力，依赖 `compile_commands.json`。如果编辑器提示不准，先检查这个文件有没有生成。

## 一个最小构建命令示例

```bash
cmake -S . -B build -G Ninja
cmake --build build
```

## 什么时候这套方案更值

- 你的工程会持续迭代，不只是一次性实验。
- 你希望和 Git、脚本、CI 配合得更自然。
- 你已经不满足于“能编译就行”，还想要更好的工程组织能力。

## 常见问题

- 找不到编译器：检查 ARM GCC 是否加入环境变量。
- CMake 配置失败：先看工具链文件和生成器是否正确。
- 能编译但补全不准：检查 `compile_commands.json`。
- 调试起不来：分别验证 GDB、OpenOCD/ST-Link Server 和固件路径。

## 本节小结

Keil 更像一台“开箱即用的整机”，CMake + VS Code 更像“可长期升级的工作台”。如果你准备认真做项目，这套环境值得尽早熟悉。