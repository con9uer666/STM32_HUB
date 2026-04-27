<template>
  <li class="tree-item">
    <div
      class="item"
      :class="{ active: isActive, group: isGroup, leaf: !hasChildren }"
      @click="handleClick"
    >
      <div
        class="row"
        :style="{ paddingLeft: depth * 14 + 10 + 'px' }"
        :title="node.summary || node.title"
      >
        <span
          class="caret"
          :class="{ open: isOpen, hidden: !hasChildren }"
          @click.stop="onCaretClick"
          aria-hidden="true"
        ></span>
        <span class="icon" aria-hidden="true">{{ displayIcon }}</span>
        <span class="title">{{ node.title }}</span>
        <span v-if="node.estimatedMinutes && node.hasContent" class="time">{{ node.estimatedMinutes }}m</span>
      </div>

      <div
        v-if="node.summary && node.hasContent"
        class="summary"
        :style="{ paddingLeft: depth * 14 + 50 + 'px' }"
      >{{ node.summary }}</div>
    </div>

    <ul v-if="hasChildren && isOpen" class="tree-children">
      <TreeItem
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :active-id="activeId"
        :expanded="expanded"
        :force-expand-all="forceExpandAll"
        @select="$emit('select', $event)"
        @toggle="$emit('toggle', $event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ChapterNode {
  id: string
  title: string
  summary?: string
  tags?: string[]
  estimatedMinutes?: number
  icon?: string
  hasContent: boolean
  children?: ChapterNode[]
}

const props = defineProps<{
  node: ChapterNode
  depth: number
  activeId: string
  expanded: Set<string>
  forceExpandAll: boolean
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'toggle', id: string): void
}>()

const hasChildren = computed(() => !!props.node.children?.length)
const isOpen = computed(() =>
  hasChildren.value && (props.forceExpandAll || props.expanded.has(props.node.id))
)
const isActive = computed(() => props.activeId === props.node.id)
const isGroup = computed(() => !props.node.hasContent && hasChildren.value)

// Display icon priority: meta.icon → 📁 for groups → 📄 for content leaves.
// Matches the left module nav (which also uses emoji glyphs) so the tree blends in.
const displayIcon = computed(() => {
  if (props.node.icon) return props.node.icon
  return isGroup.value ? '📁' : '📄'
})

function handleClick() {
  if (props.node.hasContent) {
    emit('select', props.node.id)
  } else if (hasChildren.value) {
    emit('toggle', props.node.id)
  }
}

function onCaretClick() {
  if (hasChildren.value) emit('toggle', props.node.id)
}
</script>

<style scoped>
.tree-item { list-style: none; }
.tree-children { list-style: none; margin: 0; padding: 0; }

/* Wraps row + summary so the active highlight covers both. */
.item {
  position: relative;
  border-radius: 6px;
  margin-bottom: 1px;
  cursor: pointer;
  transition: background 0.12s;
}
.item:hover { background: rgba(255, 255, 255, 0.04); }
.item.active { background: rgba(59, 130, 246, 0.12); }
.item.active:hover { background: rgba(59, 130, 246, 0.16); }
.item.active::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 2px;
  background: var(--accent);
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  user-select: none;
  font-size: 13px;
  color: var(--text);
  transition: color 0.12s;
}
.item.active .row { color: var(--text-strong); }

/* Caret — chevron, rotates when open */
.caret {
  position: relative;
  display: inline-block;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  opacity: 0.55;
  transition: transform 0.18s ease, opacity 0.12s;
}
.caret::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translate(-60%, -60%) rotate(-45deg);
}
.caret.open { transform: rotate(90deg); opacity: 0.9; }
.caret.hidden { visibility: hidden; }
.item:hover .caret:not(.hidden) { opacity: 0.95; }

/* Emoji-style icon — matches the left module nav glyphs (📖/🔌/🧰…) */
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
  text-align: center;
  filter: grayscale(0.2) saturate(0.9);
  opacity: 0.85;
  transition: filter 0.15s, opacity 0.15s, transform 0.15s;
}
.item:hover .icon { filter: none; opacity: 1; }
.item.active .icon { filter: none; opacity: 1; transform: scale(1.05); }

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  line-height: 1.2;
}
.item.active .title { font-weight: 600; }

/* Group node: section header — bigger icon + bolder title, no uppercase muted look */
.item.group {
  margin-top: 6px;
}
.item.group:first-child { margin-top: 0; }
.item.group .row {
  height: 34px;
}
.item.group .row .title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-strong);
  letter-spacing: 0;
  text-transform: none;
}
.item.group .icon {
  font-size: 16px;
  width: 22px;
  height: 22px;
  filter: none;
  opacity: 1;
}
.item.group.active .row .title { color: var(--accent); }

.time {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  padding-left: 6px;
  opacity: 0.7;
}
.item:hover .time, .item.active .time { opacity: 1; }

/* Summary — single-line, ellipsis when overflowing */
.summary {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-dim);
  padding-right: 12px;
  padding-bottom: 7px;
  margin-top: -3px;
  opacity: 0.65;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.15s, color 0.15s;
}
.item:hover .summary { opacity: 0.9; }
.item.active .summary { opacity: 1; color: var(--text-muted); }
</style>
