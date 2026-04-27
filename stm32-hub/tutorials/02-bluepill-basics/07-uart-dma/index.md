# 第 7 节 · 把搬运交给硬件：串口 DMA（不定长接收）

> 本节目标：理解为什么高速或不定长串口数据更适合 DMA，并完成一次基于空闲中断的接收流程。

## DMA 解决了什么问题

DMA 的核心作用是：数据搬运不再由 CPU 一字节一字节地管，而是由硬件在内存和外设之间直接搬。

这样做的好处是：

- CPU 开销更低。
- 接收更稳，不容易丢数据。
- 更适合连续数据流。

## 为什么不定长接收要配合空闲中断

如果你事先不知道一帧数据有多长，只靠“收满固定长度”是不够的。常见做法是：

- DMA 持续接收到缓冲区。
- 串口线路一段时间没有新数据，触发 IDLE。
- 在回调里统计本次收到的长度，再处理这一帧。

## 常见 HAL 写法

```c
HAL_UARTEx_ReceiveToIdle_DMA(&huart1, rx_buf, sizeof(rx_buf));
__HAL_DMA_DISABLE_IT(&hdma_usart1_rx, DMA_IT_HT);

void HAL_UARTEx_RxEventCallback(UART_HandleTypeDef *huart, uint16_t size)
{
  if (huart->Instance == USART1)
  {
    process_frame(rx_buf, size);
    HAL_UARTEx_ReceiveToIdle_DMA(&huart1, rx_buf, sizeof(rx_buf));
  }
}
```

## 你必须注意的事

- 缓冲区长度要根据协议上限合理设置。
- 回调里不要做特别耗时的解析，可以先置位标志，在主循环里处理。
- 如果 HAL 版本不支持上述接口，就要用 DMA + IDLE 自己拼接逻辑。

## 适合什么场景

- 上位机发送不定长指令帧。
- 传感器持续输出文本或二进制流。
- 需要高波特率、连续收包的系统。

## 常见问题

| 现象 | 可能原因 |
| --- | --- |
| 回调不触发 | IDLE 中断没开，或 HAL 版本不支持相关接口 |
| 数据偶尔截断 | 缓冲区太小、处理太慢或重启 DMA 时机不对 |
| 收到旧数据 | 缓冲区复用前没有明确处理长度 |

## 本节小结

DMA 不是“更高级的串口”，而是更适合处理连续数据流的搬运机制。把它和空闲中断结合起来，你就能稳定处理大量不定长数据。