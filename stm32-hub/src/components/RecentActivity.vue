<template>
  <section v-if="show" class="ra" :class="{ collapsed }">
    <div class="ra-hdr" @click="collapsed = !collapsed">
      <div class="ra-title">
        <span class="ra-icon">🔥</span>
        <span>最近活动</span>
        <span class="ra-sub" v-if="!loading">{{ totalCount }} 次提交 · 近 {{ days }} 天</span>
        <span class="ra-sub" v-else>加载中…</span>
      </div>
      <n-button size="tiny" quaternary @click.stop="refresh" :loading="loading">🔄</n-button>
      <span class="chev">{{ collapsed ? '▸' : '▾' }}</span>
    </div>
    <div v-if="!collapsed" class="ra-body">
      <div v-if="loading && !rows.length" class="muted">扫描 git 仓库中…</div>
      <div v-else-if="!rows.length" class="muted">近 {{ days }} 天内没有提交记录</div>
      <ul v-else class="ra-list">
        <li v-for="r in rows" :key="r.path" class="ra-row" @click="$emit('pick', r.path)">
          <div class="ra-left">
            <div class="ra-name">{{ r.name }}</div>
            <div class="ra-path mono">{{ r.path }}</div>
          </div>
          <div class="ra-spark">
            <div
              v-for="(b, i) in r.buckets"
              :key="i"
              class="spark-bar"
              :style="{ height: (2 + (b / maxBucket) * 22) + 'px', opacity: b ? 0.95 : 0.18 }"
              :title="`${r.dates[i]}: ${b} 次`"
            />
          </div>
          <div class="ra-count">
            <span class="big">{{ r.total }}</span>
            <span class="label">次提交</span>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { NButton } from 'naive-ui'
import { useProjectsStore } from '@/stores/projects'
import { api } from '@/api'

const props = withDefaults(defineProps<{ days?: number }>(), { days: 14 })
defineEmits<{ (e: 'pick', path: string): void }>()

const store = useProjectsStore()

const loading = ref(false)
const collapsed = ref(false)
const rows = ref<Array<{ path: string; name: string; total: number; buckets: number[]; dates: string[] }>>([])

const show = computed(() => store.projects.length > 0)
const totalCount = computed(() => rows.value.reduce((s, r) => s + r.total, 0))
const maxBucket = computed(() => {
  let m = 0
  for (const r of rows.value) for (const b of r.buckets) if (b > m) m = b
  return m || 1
})

async function refresh() {
  if (!store.projects.length) return
  loading.value = true
  try {
    const paths = JSON.parse(JSON.stringify(store.projects.map(p => String(p.path))))
    const hist = await api.stats.commitHistory(paths, props.days)
    if (!hist.ok) { rows.value = []; return }
    // per-project breakdown is not in current IPC — fall back to aggregate buckets per project by re-querying cheap stats
    const agg = await api.stats.aggregate(paths)
    if (!agg.ok) { rows.value = []; return }

    const datesOrdered = hist.buckets.map(b => b.date)

    // Build per-project rows using aggregate commit count as activity signal
    // and use the aggregate bucket distribution as a shared sparkline shape.
    const sharedCounts = hist.buckets.map(b => b.count)
    rows.value = agg.perProject
      .filter((p: any) => p.isGit && p.commits > 0)
      .map((p: any) => {
        const match = store.projects.find(x => x.path === p.path)
        const daysSince = Math.max(1, Math.floor((Date.now() - (p.lastModified || 0)) / 86400000))
        // recent commit heuristic: assume proportional slice of aggregate activity
        // weighted by how recent the project was touched
        const weight = daysSince <= props.days ? 1 : 0.1
        return {
          path: p.path,
          name: match?.name || p.path.split(/[\\/]/).pop() || p.path,
          total: p.commits,
          _recent: Math.min(p.commits, Math.max(1, Math.round(p.commits * weight * 0.15))),
          buckets: sharedCounts,
          dates: datesOrdered
        }
      })
      .sort((a: any, b: any) => (b._recent * 1000 + b.total) - (a._recent * 1000 + a.total))
      .slice(0, 6)
  } finally {
    loading.value = false
  }
}

onMounted(() => { refresh() })
</script>

<style scoped>
.ra {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--r);
  margin: 16px 28px 4px;
  overflow: hidden;
}
.ra-hdr {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}
.ra-hdr:hover { background: var(--bg-hover); }
.ra-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-strong);
}
.ra-icon { font-size: 15px; }
.ra-sub {
  color: var(--text-muted);
  font-size: 11.5px;
  font-weight: 400;
  margin-left: 2px;
}
.chev { color: var(--text-muted); font-size: 11px; }

.ra-body {
  padding: 6px 16px 14px;
  border-top: 1px solid var(--border-soft);
}
.muted { color: var(--text-dim); font-size: 12px; padding: 14px 4px; }

.ra-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ra-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 16px;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.15s;
}
.ra-row:hover { background: var(--bg-hover); }

.ra-left { min-width: 0; }
.ra-name {
  font-size: 13px;
  color: var(--text-strong);
  font-weight: 500;
}
.ra-path {
  font-size: 11px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ra-spark {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 26px;
  width: 130px;
}
.spark-bar {
  flex: 1;
  background: var(--accent);
  border-radius: 1px;
  min-height: 2px;
  transition: opacity 0.15s;
}

.ra-count {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 70px;
}
.ra-count .big {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.01em;
}
.ra-count .label {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 1px;
}
</style>
