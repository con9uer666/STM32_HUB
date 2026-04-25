<template>
  <div class="ai">
    <div v-if="!description" class="ai-empty">
      点击右侧「生成描述」让 DeepSeek 阅读项目源码与 README 后自动生成概要。
    </div>
    <template v-else>
      <p class="summary">{{ description.summary }}</p>
      <div class="meta">
        <div v-if="description.mcu"><span class="label">主控</span>{{ description.mcu }}</div>
      </div>
      <div v-if="description.peripherals?.length" class="chips">
        <span class="chips-label">外设：</span>
        <n-tag v-for="p in description.peripherals" :key="p" size="small" type="info">{{ p }}</n-tag>
      </div>
      <div v-if="description.features?.length" class="features">
        <div class="chips-label">功能：</div>
        <ul>
          <li v-for="f in description.features" :key="f">{{ f }}</li>
        </ul>
      </div>
      <div class="ts">生成于 {{ formatDate(description.generatedAt) }}</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { NTag } from 'naive-ui'

defineProps<{
  description?: {
    summary: string
    mcu?: string
    peripherals?: string[]
    features?: string[]
    generatedAt: number
  }
}>()

function formatDate(t: number) {
  try { return new Date(t).toLocaleString('zh-CN') } catch { return '' }
}
</script>

<style scoped>
.ai-empty { color: #8a8a95; font-size: 13px; }
.summary { font-size: 14px; line-height: 1.6; margin: 0 0 12px; color: #d5d5dc; }
.meta { display: flex; gap: 18px; margin-bottom: 10px; font-size: 13px; }
.label { display: block; color: #8a8a95; font-size: 11px; margin-bottom: 1px; }
.chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.chips-label { font-size: 12px; color: #8a8a95; margin-right: 6px; }
.features ul { margin: 6px 0 0 20px; padding: 0; }
.features li { font-size: 13px; line-height: 1.7; }
.ts { font-size: 10px; color: #55555f; margin-top: 10px; }
</style>
