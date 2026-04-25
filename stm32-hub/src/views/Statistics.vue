<template>
  <div class="stats">
    <header class="hdr">
      <div>
        <h2>统计面板</h2>
        <span class="sub">{{ loading ? '计算中…' : `覆盖 ${perProject.length} 个工程 · 上次刷新 ${lastRefreshStr}` }}</span>
      </div>
      <n-space>
        <n-button :loading="loading" @click="refresh">🔄 刷新统计</n-button>
      </n-space>
    </header>

    <n-alert v-if="errMsg" type="error" closable @close="errMsg = ''" style="margin: 12px 28px 0">
      <pre class="err mono">{{ errMsg }}</pre>
    </n-alert>

    <section class="scroll-y body">
      <!-- Hero stat cards -->
      <div class="hero">
        <div class="stat-card" style="--c: #03a9f4">
          <div class="stat-icon">📦</div>
          <div class="stat-body">
            <div class="stat-value">{{ store.projects.length }}</div>
            <div class="stat-label">工程总数</div>
          </div>
        </div>
        <div class="stat-card" style="--c: #66bb6a">
          <div class="stat-icon">📝</div>
          <div class="stat-body">
            <div class="stat-value">{{ fmtN(totalLoc) }}</div>
            <div class="stat-label">总代码行数</div>
          </div>
        </div>
        <div class="stat-card" style="--c: #ab47bc">
          <div class="stat-icon">📄</div>
          <div class="stat-body">
            <div class="stat-value">{{ fmtN(totalFiles) }}</div>
            <div class="stat-label">源文件数</div>
          </div>
        </div>
        <div class="stat-card" style="--c: #ffa726">
          <div class="stat-icon">📍</div>
          <div class="stat-body">
            <div class="stat-value">{{ fmtN(totalCommits) }}</div>
            <div class="stat-label">总提交数</div>
          </div>
        </div>
        <div class="stat-card" style="--c: #ef5350">
          <div class="stat-icon">💾</div>
          <div class="stat-body">
            <div class="stat-value">{{ fmtBytes(totalBytes) }}</div>
            <div class="stat-label">源码占用</div>
          </div>
        </div>
        <div class="stat-card" style="--c: #26a69a">
          <div class="stat-icon">🏷️</div>
          <div class="stat-body">
            <div class="stat-value">{{ store.allTags.length }}</div>
            <div class="stat-label">使用中的标签</div>
          </div>
        </div>
        <div class="stat-card" style="--c: #ec407a">
          <div class="stat-icon">🌿</div>
          <div class="stat-body">
            <div class="stat-value">{{ gitStats.repos }}</div>
            <div class="stat-label">Git 仓库 · {{ gitStats.dirty }} 待提交</div>
          </div>
        </div>
        <div class="stat-card" style="--c: #7e57c2">
          <div class="stat-icon">⏱</div>
          <div class="stat-body">
            <div class="stat-value">{{ mostRecentAgo }}</div>
            <div class="stat-label">上次编辑 · {{ mostRecent?.name || '—' }}</div>
          </div>
        </div>
      </div>

      <!-- Commit activity heatmap -->
      <div class="panel">
        <div class="panel-hdr">
          <h3>🔥 近 90 天提交活动</h3>
          <span class="panel-sub">共 {{ heatmapTotal }} 次提交 · 平均 {{ (heatmapTotal / 90).toFixed(1) }}/天</span>
        </div>
        <div class="heatmap">
          <div
            v-for="(b, i) in commitBuckets"
            :key="i"
            class="hm-cell"
            :class="heatLevel(b.count)"
            :title="`${b.date}：${b.count} 次提交`"
          />
        </div>
        <div class="hm-legend">
          <span>少</span>
          <span class="hm-cell lv-0" />
          <span class="hm-cell lv-1" />
          <span class="hm-cell lv-2" />
          <span class="hm-cell lv-3" />
          <span class="hm-cell lv-4" />
          <span>多</span>
        </div>
      </div>

      <div class="two-col">
        <!-- Tool distribution -->
        <div class="panel">
          <div class="panel-hdr">
            <h3>🛠 工具链分布</h3>
          </div>
          <div class="bars">
            <div v-for="row in toolBars" :key="row.key" class="bar-row">
              <div class="bar-lbl">{{ row.label }}</div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: row.pct + '%', background: row.color }" />
              </div>
              <div class="bar-num">{{ row.count }} ({{ row.pct.toFixed(0) }}%)</div>
            </div>
          </div>
        </div>

        <!-- Language breakdown -->
        <div class="panel">
          <div class="panel-hdr">
            <h3>📚 文件类型分布</h3>
          </div>
          <div class="bars">
            <div v-for="row in langBars" :key="row.key" class="bar-row">
              <div class="bar-lbl">{{ row.label }}</div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: row.pct + '%', background: row.color }" />
              </div>
              <div class="bar-num">{{ fmtN(row.count) }} · {{ row.pct.toFixed(1) }}%</div>
            </div>
          </div>
        </div>
      </div>

      <div class="two-col">
        <!-- Top projects by LOC -->
        <div class="panel">
          <div class="panel-hdr">
            <h3>🏆 代码量榜</h3>
            <span class="panel-sub">Top 10</span>
          </div>
          <div class="topl">
            <div v-for="(row, i) in topByLoc" :key="row.path" class="topl-row" @click="openProject(row.path)">
              <div class="topl-rank">{{ i + 1 }}</div>
              <div class="topl-name">
                <div>{{ row.name }}</div>
                <div class="topl-path">{{ row.path }}</div>
              </div>
              <div class="topl-val">{{ fmtN(row.loc) }} 行</div>
            </div>
            <div v-if="!topByLoc.length" class="empty-s">暂无数据</div>
          </div>
        </div>

        <!-- Most active by commits -->
        <div class="panel">
          <div class="panel-hdr">
            <h3>🚀 活跃榜（提交数）</h3>
            <span class="panel-sub">Top 10</span>
          </div>
          <div class="topl">
            <div v-for="(row, i) in topByCommits" :key="row.path" class="topl-row" @click="openProject(row.path)">
              <div class="topl-rank">{{ i + 1 }}</div>
              <div class="topl-name">
                <div>{{ row.name }}</div>
                <div class="topl-path">🌿 {{ row.branch || 'detached' }} · {{ row.path }}</div>
              </div>
              <div class="topl-val">{{ fmtN(row.commits) }}</div>
            </div>
            <div v-if="!topByCommits.length" class="empty-s">暂无 Git 仓库</div>
          </div>
        </div>
      </div>

      <!-- Tag cloud -->
      <div class="panel">
        <div class="panel-hdr">
          <h3>🏷 热门标签</h3>
        </div>
        <div class="tagcloud">
          <n-tag
            v-for="t in tagFreq"
            :key="t.tag"
            :style="{ fontSize: (12 + Math.min(10, t.count * 2)) + 'px' }"
            round
            :bordered="false"
          >{{ t.tag }} · {{ t.count }}</n-tag>
          <div v-if="!tagFreq.length" class="empty-s">还没有给工程打标签</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NSpace, NButton, NTag, NAlert } from 'naive-ui'
import { useProjectsStore } from '@/stores/projects'
import { api } from '@/api'

const store = useProjectsStore()
const router = useRouter()

const loading = ref(false)
const errMsg = ref('')
const perProject = ref<any[]>([])
const commitBuckets = ref<Array<{ date: string; count: number }>>([])
const lastRefresh = ref(0)

const lastRefreshStr = computed(() => {
  if (!lastRefresh.value) return '—'
  const d = new Date(lastRefresh.value)
  return d.toLocaleTimeString()
})

const totalLoc = computed(() => perProject.value.reduce((s, p) => s + (p.loc || 0), 0))
const totalFiles = computed(() => perProject.value.reduce((s, p) => s + (p.sourceCount || 0), 0))
const totalBytes = computed(() => perProject.value.reduce((s, p) => s + (p.totalBytes || 0), 0))
const totalCommits = computed(() => perProject.value.reduce((s, p) => s + (p.commits || 0), 0))

const gitStats = computed(() => {
  const repos = perProject.value.filter(p => p.isGit).length
  const dirty = perProject.value.filter(p => p.isGit && p.dirty).length
  return { repos, dirty }
})

const heatmapTotal = computed(() => commitBuckets.value.reduce((s, b) => s + b.count, 0))

const mostRecent = computed(() => {
  let best: any = null
  let bestMtime = 0
  for (const p of perProject.value) {
    if (p.lastModified > bestMtime) {
      bestMtime = p.lastModified
      const match = store.projects.find(x => x.path === p.path)
      best = { ...p, name: match?.name ?? p.path.split(/[\\/]/).pop() }
    }
  }
  return best
})

const mostRecentAgo = computed(() => {
  if (!mostRecent.value?.lastModified) return '—'
  const diffMs = Date.now() - mostRecent.value.lastModified
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  const days = Math.floor(hrs / 24)
  return `${days} 天前`
})

const toolBars = computed(() => {
  const n = store.projects.length || 1
  const keil = store.projects.filter(p => !!p.tools?.keil).length
  const vscode = store.projects.filter(p => !!p.tools?.vscode).length
  const cubemx = store.projects.filter(p => !!p.tools?.cubemx).length
  const bars = [
    { key: 'keil', label: 'Keil MDK', count: keil, pct: (keil / n) * 100, color: '#f0a020' },
    { key: 'vscode', label: 'VSCode + CMake', count: vscode, pct: (vscode / n) * 100, color: '#2080f0' },
    { key: 'cubemx', label: 'STM32CubeMX', count: cubemx, pct: (cubemx / n) * 100, color: '#18a058' }
  ]
  return bars
})

const langBars = computed(() => {
  const total = { c: 0, h: 0, cpp: 0, s: 0, other: 0 }
  for (const p of perProject.value) {
    const lb = p.langBreakdown || {}
    total.c += lb.c || 0
    total.h += lb.h || 0
    total.cpp += lb.cpp || 0
    total.s += lb.s || 0
    total.other += lb.other || 0
  }
  const sum = Math.max(1, total.c + total.h + total.cpp + total.s + total.other)
  return [
    { key: 'c', label: '.c 源文件', count: total.c, pct: (total.c / sum) * 100, color: '#03a9f4' },
    { key: 'h', label: '.h/.hpp 头文件', count: total.h, pct: (total.h / sum) * 100, color: '#66bb6a' },
    { key: 'cpp', label: '.cpp/.cc C++', count: total.cpp, pct: (total.cpp / sum) * 100, color: '#ab47bc' },
    { key: 's', label: '.s/.asm 汇编', count: total.s, pct: (total.s / sum) * 100, color: '#ef5350' },
    { key: 'other', label: '其他', count: total.other, pct: (total.other / sum) * 100, color: '#757575' }
  ]
})

const topByLoc = computed(() => {
  return perProject.value
    .map(p => {
      const proj = store.projects.find(x => x.path === p.path)
      return { ...p, name: proj?.name ?? p.path.split(/[\\/]/).pop() }
    })
    .sort((a, b) => b.loc - a.loc)
    .slice(0, 10)
})

const topByCommits = computed(() => {
  return perProject.value
    .filter(p => p.isGit)
    .map(p => {
      const proj = store.projects.find(x => x.path === p.path)
      return { ...p, name: proj?.name ?? p.path.split(/[\\/]/).pop() }
    })
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 10)
})

const tagFreq = computed(() => {
  const map = new Map<string, number>()
  for (const p of store.projects) {
    if (!Array.isArray(p.tags)) continue
    for (const t of p.tags) map.set(t, (map.get(t) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([tag, count]) => ({ tag, count }))
})

function heatLevel(n: number) {
  if (n === 0) return 'lv-0'
  if (n <= 2) return 'lv-1'
  if (n <= 5) return 'lv-2'
  if (n <= 10) return 'lv-3'
  return 'lv-4'
}

function fmtN(n: number) {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(1) + 'K'
  return (n / 1_000_000).toFixed(2) + 'M'
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

function openProject(pathStr: string) {
  const proj = store.projects.find(x => x.path === pathStr)
  if (proj) router.push({ name: 'project', params: { id: proj.id } })
}

async function refresh() {
  if (!store.projects.length) return
  loading.value = true
  errMsg.value = ''
  try {
    // Plain string[] — avoids IPC structured-clone issues with reactive proxies.
    const paths = JSON.parse(JSON.stringify(store.projects.map(p => String(p.path))))
    const [agg, hist] = await Promise.all([
      api.stats.aggregate(paths).catch((e: any) => ({ ok: false, error: 'aggregate 调用失败：' + (e?.message ?? String(e)), perProject: [] })),
      api.stats.commitHistory(paths, 90).catch((e: any) => ({ ok: false, error: 'commitHistory 调用失败：' + (e?.message ?? String(e)), buckets: [] }))
    ])
    if (agg.ok) perProject.value = agg.perProject
    else errMsg.value = (errMsg.value ? errMsg.value + '\n' : '') + (agg.error || '聚合统计失败')
    if (hist.ok) commitBuckets.value = hist.buckets
    else errMsg.value = (errMsg.value ? errMsg.value + '\n' : '') + (hist.error || '提交历史失败')
    lastRefresh.value = Date.now()
  } catch (e: any) {
    errMsg.value = '刷新异常：' + (e?.message ?? String(e))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!store.projects.length) store.load().then(() => refresh())
  else refresh()
})
</script>

<style scoped>
.stats {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.hdr {
  padding: 22px 28px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 10px;
}
.hdr h2 { margin: 0; font-weight: 650; font-size: 20px; color: var(--text-strong); letter-spacing: -0.01em; }
.hdr .sub { color: var(--text-muted); font-size: 12.5px; margin-left: 10px; }
.body { padding: 18px 28px 28px; flex: 1; overflow-y: auto; }

.hero {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}
.stat-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-left: 3px solid var(--c, var(--accent));
  border-radius: var(--r);
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  transition: transform 0.15s ease, border-color 0.15s, box-shadow 0.15s;
}
.stat-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-hi);
  box-shadow: var(--shadow-sm);
}
.stat-icon { font-size: 28px; opacity: 0.95; }
.stat-body { flex: 1; min-width: 0; }
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--c, var(--text-strong));
  line-height: 1.1;
  letter-spacing: -0.01em;
}
.stat-label {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 16px 18px;
  margin-bottom: 16px;
}
.panel-hdr {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 14px;
}
.panel-hdr h3 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--text-strong); letter-spacing: 0.01em; }
.panel-sub { color: var(--text-muted); font-size: 12px; }

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 1000px) {
  .two-col { grid-template-columns: 1fr; }
}

.heatmap {
  display: grid;
  grid-template-columns: repeat(30, 1fr);
  gap: 3px;
  margin-bottom: 10px;
}
.hm-cell {
  aspect-ratio: 1;
  border-radius: 2px;
  min-height: 12px;
}
.lv-0 { background: #1c1d25; }
.lv-1 { background: #0d3f22; }
.lv-2 { background: #186033; }
.lv-3 { background: #2ea04b; }
.lv-4 { background: #4ade80; }
.hm-legend { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); }
.hm-legend .hm-cell { width: 12px; height: 12px; display: inline-block; }

.bars { display: flex; flex-direction: column; gap: 10px; }
.bar-row { display: grid; grid-template-columns: 140px 1fr 110px; gap: 10px; align-items: center; }
.bar-lbl { font-size: 12px; color: var(--text); }
.bar-track { height: 10px; background: var(--bg-hover); border-radius: 5px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 5px; transition: width 0.3s; }
.bar-num { font-size: 11px; color: var(--text-muted); text-align: right; }

.topl { display: flex; flex-direction: column; gap: 2px; }
.topl-row {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background 0.1s;
}
.topl-row:hover { background: var(--bg-hover); }
.topl-rank { font-size: 13px; font-weight: 700; color: var(--text-muted); text-align: center; }
.topl-row:nth-child(1) .topl-rank { color: #ffd700; }
.topl-row:nth-child(2) .topl-rank { color: #c0c0c0; }
.topl-row:nth-child(3) .topl-rank { color: #cd7f32; }
.topl-name > div:first-child { font-size: 13px; color: var(--text-strong); font-weight: 500; }
.topl-path { font-size: 11px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 340px; }
.topl-val { font-size: 12px; color: var(--accent); font-weight: 600; }
.empty-s { color: var(--text-dim); font-size: 12px; text-align: center; padding: 16px; }

.tagcloud { display: flex; flex-wrap: wrap; gap: 8px; }
.err { white-space: pre-wrap; margin: 0; font-size: 12px; }
.mono { font-family: var(--font-mono); }
</style>
