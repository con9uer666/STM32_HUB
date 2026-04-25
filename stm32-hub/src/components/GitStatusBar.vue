<template>
  <div class="gsb">
    <n-input v-model:value="message" placeholder="Commit message (Enter 提交)" :disabled="pushing" @keydown.enter="onPush" />
    <n-button type="primary" :loading="pushing" @click="onPush">
      🚀 Commit & Push
    </n-button>
    <n-button :loading="fetching" @click="onFetch" title="fetch --all --prune">⬇️ Fetch</n-button>
    <n-button :loading="pulling" @click="onPull" title="pull">⇣ Pull</n-button>
  </div>
  <n-alert v-if="lastError" type="error" :closable="true" @close="lastError = ''" style="margin-top: 8px">
    <pre class="err mono">{{ lastError }}</pre>
  </n-alert>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, NAlert, useMessage } from 'naive-ui'
import { api } from '@/api'
import type { Project } from '@/types'

const props = defineProps<{ project: Project }>()
const emit = defineEmits<{
  (e: 'pushed'): void
  (e: 'fetched'): void
}>()
const msg = useMessage()

const message = ref('')
const pushing = ref(false)
const fetching = ref(false)
const pulling = ref(false)
const lastError = ref('')

async function onPush() {
  if (!message.value.trim()) {
    msg.warning('请填写 commit 信息')
    return
  }
  pushing.value = true
  lastError.value = ''
  try {
    const r = await api.git.commitAndPush(props.project.path, message.value)
    if (r.ok) {
      msg.success(r.committed ? '提交并推送成功' : '无改动，已推送')
      message.value = ''
      emit('pushed')
    } else {
      lastError.value = r.error
      msg.error('推送失败，见下方详情')
    }
  } finally {
    pushing.value = false
  }
}

async function onFetch() {
  fetching.value = true
  lastError.value = ''
  try {
    const r = await api.git.fetch(props.project.path)
    if (r.ok) {
      msg.success('Fetch 成功')
      emit('fetched')
    } else {
      lastError.value = r.error ?? ''
      msg.error('Fetch 失败')
    }
  } finally {
    fetching.value = false
  }
}

async function onPull() {
  pulling.value = true
  lastError.value = ''
  try {
    const r = await api.git.pull(props.project.path)
    if (r.ok) {
      const s = r.summary
      const changes = (s?.insertions ?? 0) + (s?.deletions ?? 0)
      msg.success(changes ? `Pull 完成 (+${s.insertions ?? 0}/-${s.deletions ?? 0})` : 'Pull 完成 (无变更)')
      emit('fetched')
    } else {
      lastError.value = r.error ?? ''
      msg.error('Pull 失败')
    }
  } finally {
    pulling.value = false
  }
}
</script>

<style scoped>
.gsb { display: flex; gap: 8px; margin-top: 16px; }
.err { white-space: pre-wrap; margin: 0; font-size: 12px; }
</style>
