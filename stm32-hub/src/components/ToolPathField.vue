<template>
  <div class="tpf">
    <label>
      {{ label }}
      <span v-if="hint" class="hint">{{ hint }}</span>
    </label>
    <div class="row">
      <n-input :value="value" placeholder="未设置" readonly class="mono" />
      <n-button size="small" @click="pick">选择…</n-button>
      <n-button v-if="value" size="small" quaternary @click="$emit('change', '')">清除</n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NInput, NButton } from 'naive-ui'
import { api } from '@/api'

const props = defineProps<{ label: string; value?: string; hint?: string }>()
const emit = defineEmits<{ (e: 'change', v: string): void }>()

async function pick() {
  const isExe = props.label.toLowerCase().includes('.exe') || /keil|cubemx|vscode|cmake|ninja/i.test(props.label)
  const file = await api.dialog.openFile(isExe ? [{ name: 'Executables', extensions: ['exe', 'cmd', 'bat'] }, { name: 'All', extensions: ['*'] }] : undefined)
  if (file) emit('change', file)
}
</script>

<style scoped>
.tpf { margin-bottom: 10px; }
.tpf label {
  display: block;
  font-size: 12px;
  color: #d0d0d8;
  margin-bottom: 4px;
}
.hint {
  display: block;
  font-size: 11px;
  color: #8a8a95;
  font-weight: normal;
}
.row { display: flex; gap: 6px; }
</style>
