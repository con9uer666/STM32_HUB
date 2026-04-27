# 第 1 节 · 先限制变化速度：斜坡算法

> 本节目标：理解为什么很多控制量不能一步跳到目标值，而要平滑逼近。

## 斜坡算法解决什么问题

它限制输出变化率，避免指令一下子跳太大，导致执行器、电源或机械结构承受冲击。

## 一个常见写法

```c
float ramp_update(float current, float target, float step)
{
  if (target > current + step) return current + step;
  if (target < current - step) return current - step;
  return target;
}
```

## 适合什么场景

- 电机速度给定
- 舵机角度切换
- 底盘速度启动和刹车

## 调参建议

步长太小会显得迟钝，太大又失去平滑作用。先按控制周期算出“每次允许变化多少”，再结合实际现象调。