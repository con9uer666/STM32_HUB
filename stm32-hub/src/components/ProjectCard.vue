<template>
  <n-card
    class="pc"
    :style="borderStyle"
    hoverable
    @click="$emit('open', project)"
  >
    <template #header>
      <div class="pc-hdr">
        <span class="pc-title">{{ project.name }}</span>
        <span v-if="project.pinned" class="pin" title="已置顶">📌</span>
      </div>
    </template>

    <template #header-extra>
      <n-dropdown :options="menuOpts" @select="onMenu" trigger="click">
        <n-button text size="small" @click.stop class="pc-more">⋯</n-button>
      </n-dropdown>
    </template>

    <div class="pc-body">
      <div class="pc-path mono" :title="project.path">{{ project.path }}</div>

      <div class="pc-badges">
        <n-tag v-if="project.tools?.keil" type="warning" size="small" :bordered="false">Keil</n-tag>
        <n-tag v-if="project.tools?.vscode" type="info" size="small" :bordered="false">CMake</n-tag>
        <n-tag v-if="project.tools?.cubemx" type="success" size="small" :bordered="false">CubeMX</n-tag>
        <n-tag v-if="gitInfo?.branch" size="small" :bordered="false" class="git-tag">
          🌿 {{ gitInfo.branch }}
        </n-tag>
        <n-tag v-if="gitInfo?.dirty" size="small" type="warning" :bordered="false">
          {{ gitInfo.changedCount }} △
        </n-tag>
        <n-tag v-if="gitInfo && (gitInfo.ahead || gitInfo.behind)" size="small" type="info" :bordered="false">
          <span v-if="gitInfo.ahead">↑{{ gitInfo.ahead }}</span>
          <span v-if="gitInfo.behind">↓{{ gitInfo.behind }}</span>
        </n-tag>
      </div>

      <div v-if="project.aiDescription?.summary" class="pc-summary">
        {{ project.aiDescription.summary }}
      </div>
      <div v-else class="pc-summary-placeholder">
        暂无 AI 描述
      </div>

      <div v-if="project.tags?.length" class="pc-tags">
        <n-tag v-for="t in project.tags" :key="t" size="small" round :bordered="false">{{ t }}</n-tag>
      </div>

      <div class="pc-actions" @click.stop>
        <div class="pc-tools">
          <n-button v-if="project.tools?.keil" size="small" type="warning" secondary @click="$emit('launch', project, 'keil')">Keil</n-button>
          <n-button v-if="project.tools?.vscode" size="small" type="info" secondary @click="$emit('launch', project, 'vscode')">VSCode</n-button>
          <n-button v-if="project.tools?.cubemx" size="small" type="success" secondary @click="$emit('launch', project, 'cubemx')">CubeMX</n-button>
        </div>
        <div class="pc-quick">
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-button size="small" quaternary circle @click="$emit('terminal', project)">
                <span class="qa-icon">▷_</span>
              </n-button>
            </template>
            在终端中打开
          </n-tooltip>
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-button size="small" quaternary circle @click="$emit('copyPath', project)">
                <span class="qa-icon">📋</span>
              </n-button>
            </template>
            复制路径
          </n-tooltip>
        </div>
      </div>
    </div>
  </n-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NTag, NButton, NDropdown, NTooltip } from 'naive-ui'
import type { Project } from '@/types'
import { api } from '@/api'

interface GitInfo {
  branch?: string
  ahead: number
  behind: number
  dirty: boolean
  changedCount: number
}

const props = defineProps<{
  project: Project
  gitInfo?: GitInfo | null
}>()

const emit = defineEmits<{
  (e: 'open', p: Project): void
  (e: 'launch', p: Project, which: 'keil' | 'vscode' | 'cubemx'): void
  (e: 'remove', p: Project): void
  (e: 'togglePin', p: Project): void
  (e: 'terminal', p: Project): void
  (e: 'copyPath', p: Project): void
}>()

const borderStyle = computed(() => ({
  borderLeft: `3px solid ${props.project.color || 'var(--accent)'}`
}))

const menuOpts = computed(() => [
  { label: props.project.pinned ? '取消置顶' : '置顶', key: 'pin' },
  { label: '在终端中打开', key: 'terminal' },
  { label: '复制路径', key: 'copy' },
  { label: '在资源管理器中显示', key: 'reveal' },
  { type: 'divider', key: 'd1' },
  { label: '移除', key: 'remove' }
])

function onMenu(key: string) {
  if (key === 'pin') emit('togglePin', props.project)
  else if (key === 'reveal') api.shell.showInFolder(props.project.path)
  else if (key === 'terminal') emit('terminal', props.project)
  else if (key === 'copy') emit('copyPath', props.project)
  else if (key === 'remove') emit('remove', props.project)
}
</script>

<style scoped>
.pc {
  cursor: pointer;
  height: 100%;
  background: var(--bg-panel) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--r) !important;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.pc:hover {
  transform: translateY(-2px);
  border-color: var(--border-hi) !important;
  box-shadow: var(--shadow);
}

/* Naive card internal structure → stretch content, align actions to bottom */
.pc :deep(.n-card__content) {
  display: flex;
  flex-direction: column;
  padding: 14px 18px 16px !important;
}
.pc-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 8px;
}

.pc-hdr { display: flex; align-items: center; gap: 6px; min-width: 0; width: 100%; }
.pc-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
  letter-spacing: -0.005em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pin { font-size: 13px; flex-shrink: 0; }

/* Ensure Naive UI's card header slot lets our .pc-hdr fill it and truncate. */
.pc :deep(.n-card-header) { padding: 14px 18px 6px !important; }
.pc :deep(.n-card-header__main) { min-width: 0; flex: 1 1 auto; overflow: hidden; }
.pc :deep(.n-card-header__extra) { flex-shrink: 0; }
.pc-more {
  color: var(--text-muted) !important;
  font-size: 18px !important;
}
.pc-more:hover { color: var(--text-strong) !important; }

.pc-path {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.85;
}
.pc-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  min-height: 22px;
}
.git-tag { background: rgba(59,130,246,.15) !important; color: #93c5fd !important; }

.pc-summary {
  font-size: 12.5px;
  color: var(--text);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 58px;
}
.pc-summary-placeholder {
  font-size: 12px;
  color: var(--text-dim);
  font-style: italic;
  min-height: 58px;
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.pc-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  min-height: 20px;
}

.pc-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed var(--border-soft);
  flex-wrap: wrap;
}
.pc-tools {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}
.pc-quick {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.qa-icon { font-size: 11px; }
</style>
