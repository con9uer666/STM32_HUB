<template>
  <n-modal
    :show="show"
    preset="card"
    :style="{ width: '520px' }"
    :bordered="false"
    :mask-closable="true"
    @update:show="(v: boolean) => emit('update:show', v)"
    class="sh-modal"
  >
    <template #header>
      <div class="sh-hdr">⌨ 快捷键参考</div>
    </template>
    <div class="sh-body">
      <div v-for="group in groups" :key="group.name" class="sh-group">
        <div class="sh-group-name">{{ group.name }}</div>
        <div class="sh-row" v-for="item in group.items" :key="item.label">
          <div class="sh-label">{{ item.label }}</div>
          <div class="sh-keys">
            <kbd v-for="k in item.keys" :key="k">{{ k }}</kbd>
          </div>
        </div>
      </div>
      <div class="sh-tip">小提示：多数耗时操作（扫描、batch fetch）也可从命令面板触发，无需返回仪表盘。</div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { NModal } from 'naive-ui'

defineProps<{ show: boolean }>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>()

const groups = [
  {
    name: '全局',
    items: [
      { label: '打开命令面板', keys: ['Ctrl', 'Shift', 'P'] },
      { label: '打开命令面板（备用）', keys: ['F1'] },
      { label: '显示此帮助', keys: ['?'] }
    ]
  },
  {
    name: '仪表盘',
    items: [
      { label: '聚焦搜索框', keys: ['Ctrl', 'K'] },
      { label: '切换卡片 / 列表视图', keys: ['点击 ▦ / ☰'] }
    ]
  },
  {
    name: '命令面板',
    items: [
      { label: '切换项目 / 命令模式', keys: ['Tab'] },
      { label: '直接搜索命令', keys: ['>'] },
      { label: '上下选择', keys: ['↑', '↓'] },
      { label: '执行选中项', keys: ['Enter'] },
      { label: '关闭', keys: ['Esc'] }
    ]
  }
]
</script>

<style scoped>
.sh-hdr {
  font-size: 16px;
  font-weight: 650;
  color: var(--text-strong);
}
.sh-body {
  padding: 4px 2px 2px;
}
.sh-group {
  margin-bottom: 18px;
}
.sh-group-name {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.sh-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 2px;
  border-bottom: 1px solid var(--border-soft);
}
.sh-row:last-child { border-bottom: none; }
.sh-label {
  font-size: 13px;
  color: var(--text);
}
.sh-keys {
  display: flex;
  gap: 4px;
}
kbd {
  display: inline-block;
  padding: 2px 7px;
  background: var(--bg-panel);
  border: 1px solid var(--border-hi);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-strong);
  min-width: 16px;
  text-align: center;
}
.sh-tip {
  margin-top: 10px;
  padding: 10px 12px;
  background: rgba(59,130,246,.08);
  border-left: 3px solid var(--accent);
  border-radius: var(--r-sm);
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.55;
}
</style>
