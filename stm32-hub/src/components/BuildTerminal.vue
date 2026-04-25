<template>
  <div class="bt">
    <div class="bt-toolbar">
      <n-button
        v-if="project.tools?.vscode"
        type="info"
        :disabled="building"
        @click="runCMake"
      >🛠 CMake 编译</n-button>
      <n-button
        v-if="project.tools?.keil"
        type="warning"
        :disabled="building"
        @click="runKeil"
      >🔧 Keil 编译</n-button>
      <n-button v-if="building" type="error" @click="cancel">✕ 取消</n-button>
      <n-button quaternary :disabled="building" @click="clear">清空</n-button>
      <div class="flex-spacer" />
      <n-tag v-if="lastExit !== null" :type="lastExit === 0 ? 'success' : 'error'" size="small">
        exit {{ lastExit }}
      </n-tag>
    </div>
    <pre ref="termEl" class="term mono">{{ buffer }}</pre>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { NButton, NTag, useMessage } from 'naive-ui'
import { api } from '@/api'
import type { Project } from '@/types'

const props = defineProps<{ project: Project }>()
const msg = useMessage()

const buffer = ref('')
const building = ref(false)
const lastExit = ref<number | null>(null)
const termEl = ref<HTMLElement | null>(null)

let offOutput: (() => void) | null = null
let offExit: (() => void) | null = null

function append(text: string) {
  buffer.value += text
  nextTick(() => {
    if (termEl.value) termEl.value.scrollTop = termEl.value.scrollHeight
  })
}

onMounted(() => {
  offOutput = api.on('build:output', (payload: any) => append(payload.text))
  offExit = api.on('build:exit', (payload: any) => {
    building.value = false
    lastExit.value = payload.code
  })
})

onUnmounted(() => {
  offOutput?.()
  offExit?.()
})

async function runCMake() {
  buffer.value = ''
  lastExit.value = null
  building.value = true
  const r = await api.build.cmake(props.project.path)
  if (!r.ok && r.error) {
    msg.error(r.error)
    building.value = false
  }
}

async function runKeil() {
  if (!props.project.tools?.keil) return
  buffer.value = ''
  lastExit.value = null
  building.value = true
  const r = await api.build.keil(props.project.tools.keil.uvprojx)
  if (!r.ok && r.error) {
    msg.error(r.error)
    building.value = false
  }
}

async function cancel() {
  await api.build.cancel()
}

function clear() {
  buffer.value = ''
  lastExit.value = null
}
</script>

<style scoped>
.bt { display: flex; flex-direction: column; padding-bottom: 24px; }
.bt-toolbar {
  display: flex;
  gap: 8px;
  margin: 12px 0;
  align-items: center;
}
.flex-spacer { flex: 1; }
.term {
  background: #0d0d10;
  color: #d5d5dc;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #2a2a30;
  font-size: 12px;
  line-height: 1.5;
  min-height: 320px;
  max-height: 540px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>
