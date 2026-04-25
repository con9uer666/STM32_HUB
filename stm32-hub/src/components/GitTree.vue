<template>
  <div class="gt">
    <div v-if="!status" class="muted">加载中…</div>
    <template v-else-if="status.error">
      <div class="muted">{{ status.error }}</div>
    </template>
    <template v-else>
      <div class="status-summary">
        <n-tag size="small">分支 {{ status.branch }}</n-tag>
        <n-tag v-if="status.ahead" type="success" size="small">↑ {{ status.ahead }}</n-tag>
        <n-tag v-if="status.behind" type="warning" size="small">↓ {{ status.behind }}</n-tag>
        <n-tag v-if="status.isClean" type="success" size="small">clean</n-tag>
      </div>
      <div v-if="changedFiles.length" class="changed-list">
        <div
          v-for="f in changedFiles"
          :key="f.path"
          class="changed"
          :class="{ active: diffFor === f.path }"
          @click="showDiff(f.path)"
        >
          <span class="badge" :class="'badge-' + f.kind">{{ f.kindLabel }}</span>
          <span class="mono file-path">{{ f.path }}</span>
        </div>
      </div>

      <n-modal
        v-model:show="diffVisible"
        preset="card"
        :style="{ width: '80vw', maxWidth: '1100px' }"
        :title="'Diff: ' + diffFor"
      >
        <div v-if="diffLoading" class="muted">加载 diff…</div>
        <pre v-else-if="diffContent" class="diff-view mono"><span
          v-for="(line, i) in diffLines"
          :key="i"
          :class="line.cls"
        >{{ line.text }}
</span></pre>
        <div v-else class="muted">无差异</div>
      </n-modal>

      <n-tree
        :data="tree"
        block-line
        virtual-scroll
        :default-expand-all="false"
        :default-expanded-keys="['HEAD']"
        style="max-height: 360px; margin-top: 12px"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { NTree, NTag, NModal } from 'naive-ui'
import { api } from '@/api'
import type { Project } from '@/types'

const props = defineProps<{ project: Project; refreshKey?: number }>()

const status = ref<any>(null)
const tree = ref<any[]>([])
const diffVisible = ref(false)
const diffFor = ref('')
const diffContent = ref('')
const diffLoading = ref(false)

const diffLines = computed(() => {
  if (!diffContent.value) return []
  return diffContent.value.split(/\r?\n/).map(text => {
    let cls = 'diff-ctx'
    if (text.startsWith('+++') || text.startsWith('---')) cls = 'diff-file'
    else if (text.startsWith('+')) cls = 'diff-add'
    else if (text.startsWith('-')) cls = 'diff-del'
    else if (text.startsWith('@@')) cls = 'diff-hunk'
    else if (text.startsWith('diff ')) cls = 'diff-file'
    return { text, cls }
  })
})

const changedFiles = computed(() => {
  if (!status.value || !status.value.ok) return []
  const out: any[] = []
  for (const f of status.value.not_added || []) out.push({ path: f, kind: 'added', kindLabel: 'U' })
  for (const f of status.value.modified || []) out.push({ path: f, kind: 'modified', kindLabel: 'M' })
  for (const f of status.value.staged || []) out.push({ path: f, kind: 'staged', kindLabel: 'S' })
  for (const f of status.value.deleted || []) out.push({ path: f, kind: 'deleted', kindLabel: 'D' })
  return out
})

async function load() {
  status.value = await api.git.status(props.project.path)
  if (status.value.ok) {
    const t = await api.git.tree(props.project.path)
    if (t.ok) tree.value = [t.tree]
    else tree.value = []
  }
}

async function showDiff(filePath: string) {
  diffFor.value = filePath
  diffContent.value = ''
  diffLoading.value = true
  diffVisible.value = true
  try {
    const r = await api.git.fileDiff(props.project.path, filePath)
    if (r.ok) diffContent.value = r.diff || ''
    else diffContent.value = '错误: ' + (r.error ?? '')
  } finally {
    diffLoading.value = false
  }
}

onMounted(load)
watch(() => props.refreshKey, load)
watch(() => props.project.id, load)
</script>

<style scoped>
.muted { color: #8a8a95; font-size: 13px; }
.status-summary { display: flex; gap: 6px; margin-bottom: 10px; }
.changed-list {
  max-height: 180px;
  overflow: auto;
  margin-bottom: 8px;
  border: 1px solid #2a2a30;
  border-radius: 4px;
  padding: 2px;
}
.changed {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 3px 6px;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.12s;
}
.changed:hover { background: #2a2a30; }
.changed.active { background: #2a2a30; }
.file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  display: inline-block;
  width: 18px;
  text-align: center;
  font-weight: 700;
  font-size: 10px;
  padding: 1px 2px;
  border-radius: 3px;
  font-family: 'Fira Code', monospace;
  flex-shrink: 0;
}
.badge-added { background: #2e7d32; color: white; }
.badge-modified { background: #f57c00; color: white; }
.badge-staged { background: #1976d2; color: white; }
.badge-deleted { background: #c62828; color: white; }
.diff-view {
  background: #0d0d10;
  color: #d5d5dc;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  max-height: 70vh;
  overflow: auto;
  white-space: pre;
  margin: 0;
}
.diff-view .diff-file { color: #ffb74d; font-weight: 600; }
.diff-view .diff-hunk { color: #80cbc4; }
.diff-view .diff-add { color: #81c784; background: rgba(46,125,50,0.12); display: block; }
.diff-view .diff-del { color: #e57373; background: rgba(198,40,40,0.12); display: block; }
.diff-view .diff-ctx { color: #a0a0a8; }
</style>
