# 第 6 节 · 不再轮询等待：串口中断

> 本节目标：理解串口三种接收方式（阻塞、中断、DMA）的差别，掌握中断接收的"挂起 -> 回调 -> 重新挂起"链路，能够实现一个不阻塞主循环的字节级 echo。

> 如有对应的推荐教程，将在上方出现跳转按钮，可以按需选择观看

## 了解串口中断是什么

上一节我们用 `HAL_UART_Receive` 接收数据，那个函数是**阻塞式**的——CPU 会一直卡在那等，直到收到指定字节数或超时。这种方式在主循环里基本没法用，因为只要这一行没返回，主循环里其他所有事情都停摆。

串口中断的思路是：**先告诉 HAL"我要收 N 个字节，收完叫我"，然后 CPU 就该干嘛干嘛去。等数据真的收齐了，硬件触发中断，HAL 自动调用一个固定名字的回调函数，你在回调里处理数据**。

通俗地讲，阻塞式是"打电话一直占着线等对方说话"，中断式是"留个手机号，对方有事打过来"。

那么这里有个问题，既然中断这么好，为什么不一开始就用，还要先讲阻塞？

答案是阻塞式有它的用武之地——发送日志、单次确认性的请求，用阻塞式代码最短最直观，没必要上中断。中断是用来解决"接收时机不可预测"的问题的：电脑什么时候发命令过来你不知道，按键中断什么时候按下你不知道，这时候才需要中断。

### 串口接收的三种方式对比

| 方式 | API | 特点 | 适用场景 |
| --- | --- | --- | --- |
| 阻塞 | `HAL_UART_Receive` | CPU 等到收齐才返回 | 简单测试、单次握手 |
| 中断 | `HAL_UART_Receive_IT` | 收齐后回调通知 | 字节协议、命令行、按帧接收 |
| DMA | `HAL_UART_Receive_DMA` | 硬件搬运，CPU 完全不参与 | 大数据量、连续流、不定长（下一节讲） |

### HAL 库的回调机制

HAL 库提供了一系列**弱定义的回调函数**（前缀 `__weak`），每种事件对应一个：

- `HAL_UART_TxCpltCallback`：发送完成回调
- `HAL_UART_RxCpltCallback`：**接收完成回调**（本节重点）
- `HAL_UART_ErrorCallback`：出错回调

你只要在自己的代码里**重新定义同名函数**，就会覆盖掉默认的空实现。HAL 内部的中断处理函数会在合适时机自动调用这些回调，你不用关心 NVIC 入口、不用关心寄存器位，只管在回调里写业务逻辑。

### 中断接收的核心三步

中断接收的标准模式是个无限循环：

1. **挂起**：调用 `HAL_UART_Receive_IT` 告诉 HAL"接下来要收 N 字节"
2. **触发**：硬件收到 N 字节后自动产生中断，HAL 调用 `HAL_UART_RxCpltCallback`
3. **重挂**：在回调里**必须再次调用 `HAL_UART_Receive_IT`**，否则下次收不到了

第三步是初学最容易忘的——只挂起一次，导致只能收一次。

## 如何配置串口中断

1. 串口本身的配置和上一节完全一样（`Asynchronous`、115200 8N1）
2. 切到 `NVIC Settings` 选项卡，勾选 `USART1 global interrupt`![alt text](image.png)
3. `Generate Code` 重新生成代码即可，CubeMX 会自动帮你写好中断入口和 NVIC 使能

## 关键代码

1. 配置好后用 CubeMX 生成代码
2. 打开 Keil 工程，按下面的模式写：在 `main` 里挂起第一次接收，然后在回调里处理数据并重新挂起
3. 关键代码

```c
uint8_t rx_byte;  // 接收一个字节用的缓冲区，必须是全局或 static


// main 函数里、while(1) 之前，挂起第一次接收
HAL_UART_Receive_IT(&huart1, &rx_byte, 1);
// &huart1：串口句柄
// &rx_byte：接收缓冲区指针。注意：HAL 接收期间这块内存不能动！
// 1：本次要接收多少字节


// 接收完成回调：每收齐 1 字节就被自动调用一次
// 函数名固定，参数固定，写在 main.c 的 USER CODE 区域
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  // 多个串口都会进这个回调，必须先判断是哪个串口
  if (huart->Instance == USART1)
  {
    // 1) 处理收到的字节（这里实现 echo：原样发回去）
    HAL_UART_Transmit(&huart1, &rx_byte, 1, 100);

    // 2) 重新挂起下一次接收（千万不能漏）
    HAL_UART_Receive_IT(&huart1, &rx_byte, 1);
  }
}
```

## 实现一个简单的命令解析

逐字节中断很适合做**行命令解析**——每次收一个字节，攒到换行符就当一帧处理：

```c
#define CMD_BUF_SIZE 64
static uint8_t cmd_buf[CMD_BUF_SIZE];
static uint8_t cmd_len = 0;
static volatile uint8_t cmd_ready = 0;  // volatile 因为中断里要改

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
  if (huart->Instance == USART1)
  {
    if (rx_byte == '\n' || cmd_len >= CMD_BUF_SIZE - 1)
    {
      cmd_buf[cmd_len] = '\0';
      cmd_ready = 1;        // 通知主循环：一帧到了
      cmd_len = 0;
    }
    else if (rx_byte != '\r')  // 过滤掉 \r
    {
      cmd_buf[cmd_len++] = rx_byte;
    }
    HAL_UART_Receive_IT(&huart1, &rx_byte, 1);
  }
}

// 主循环里检查标志位再处理
while (1)
{
  if (cmd_ready)
  {
    cmd_ready = 0;
    // 在这里解析 cmd_buf
    if (strcmp((char*)cmd_buf, "led on") == 0) {
      HAL_GPIO_WritePin(GPIOC, GPIO_PIN_13, GPIO_PIN_RESET);
    }
    // ...
  }
}
```

注意 `cmd_ready` 必须加 `volatile`，原因和定时器那节一样——它会在中断里被改，编译器可能误以为它从来不变把代码优化掉。

## 中断接收的两条铁律

中断里不要做耗时操作：和外部中断那节一样，回调函数要短。串口中断里不要打印日志、不要解析复杂协议，置标志位扔回主循环就行。

接收缓冲区生命周期要够：传给 `HAL_UART_Receive_IT` 的指针必须指向**全局变量、静态变量或一直不释放的内存**，绝对不能传栈上的局部变量。否则 HAL 还在等数据时，函数已经返回、栈上变量被覆盖，你会收到一堆乱码。

## 常见问题排查

| 现象 | 原因 |
| --- | --- |
| 完全进不了回调 | NVIC 没使能；忘了调用 `HAL_UART_Receive_IT`；句柄不匹配 |
| 只收到第一个字节 | 回调里忘了重新挂起接收 |
| 收到的全是 0 或重复字符 | 接收缓冲区是局部变量，已被栈覆盖 |
| 偶尔丢字节 | 主循环或别的中断里做了太久的阻塞，错过了中断时机 |
| 高速时数据错乱 | 该上 DMA 了，逐字节中断扛不住高波特率连续流 |

## 本章任务

用你手里的小蓝板和 USB-TTL 实现：

1. 用串口中断实现字节级 echo：电脑发什么字符过来，板子立刻原样发回，主循环里同时让 LED 以 500ms 周期闪烁，验证中断不会阻塞主循环
2. 在 1 的基础上做行命令解析：电脑发 `led on\n` 板载 LED 亮，发 `led off\n` 板载 LED 灭
3. （进阶）想想看：如果对方一次性发 1KB 数据过来，逐字节中断会不会撑不住？这是下一节 DMA 要解决的问题
