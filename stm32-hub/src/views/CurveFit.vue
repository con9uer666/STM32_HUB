<template>
  <div class="cf">
    <header class="page-hdr">
      <div>
        <h2>📈 曲线拟合</h2>
        <span class="sub">粘贴离散点，自动用多种模型拟合并按 R² 排序</span>
      </div>
      <div class="actions">
        <n-button size="small" @click="openFileDialog">📂 打开文件</n-button>
        <input
          ref="fileInput"
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          style="display:none"
          @change="handleFileChange"
        />
        <span v-if="loadedFileName" class="file-chip" :title="loadedFileName">
          <span class="file-chip-name">{{ loadedFileName }}</span>
          <button class="chip-x" title="移除文件记录" @click="loadedFileName = ''">✕</button>
        </span>
        <n-button size="small" @click="loadSample">{{ mode3d ? '加载示例 (3D)' : '加载示例 (NTC)' }}</n-button>
        <n-button size="small" quaternary @click="clearAll">清空</n-button>
      </div>
    </header>

    <section class="body scroll-y">
      <div class="grid-top">
        <!-- Left: data input + algorithm toggles -->
        <aside class="panel input-panel">
          <div class="block-hdr">
            <h3>数据输入</h3>
            <label class="mode-toggle" :title="'切换 2D / 3D 双变量拟合'">
              <input type="checkbox" v-model="mode3d" />
              <span>3D 曲面</span>
            </label>
          </div>
          <n-input
            v-model:value="rawText"
            type="textarea"
            :rows="12"
            :placeholder="placeholder"
            class="ta mono"
          />
          <div class="col-select">
            <label class="col-lbl">X 列</label>
            <n-input-number
              v-model:value="xCol"
              :min="1" :max="32"
              size="tiny"
              :show-button="false"
              class="col-inp"
            />
            <label class="col-lbl">Y 列</label>
            <n-input-number
              v-model:value="yCol"
              :min="1" :max="32"
              size="tiny"
              :show-button="false"
              class="col-inp"
            />
            <template v-if="mode3d">
              <label class="col-lbl">Z 列</label>
              <n-input-number
                v-model:value="zCol"
                :min="1" :max="32"
                size="tiny"
                :show-button="false"
                class="col-inp"
              />
            </template>
            <span class="col-hint">Tab/逗号/空格分隔 · 表头自动跳过</span>
          </div>
          <div class="info-row">
            <div v-if="points.length" class="info ok">✓ 已识别 {{ points.length }} 点</div>
            <div v-else class="info dim">等待数据…</div>
            <div v-if="parseErrors.length" class="info err" :title="parseErrors.map(e => `line ${e.line}: ${e.text}`).join('\n')">
              ✗ {{ parseErrors.length }} 行无法解析
            </div>
          </div>

          <div class="block-hdr" style="margin-top:14px"><h3>启用模型</h3>
            <span class="toggle-group">
              <n-button size="tiny" quaternary @click="setAll(true)">全选</n-button>
              <n-button size="tiny" quaternary @click="setAll(false)">清空</n-button>
            </span>
          </div>
          <div class="model-grid">
            <label v-for="m in activeModels" :key="m.id" class="chk">
              <input type="checkbox" v-model="activeEnabled[m.id]" />
              <span>{{ m.label }}</span>
            </label>
          </div>
          <div class="hint">
            {{ mode3d
              ? '双变量多项式最高 4 次；公式按 R² 降序排列。'
              : '公式以 R² 降序排列；指数/对数/幂对数据正负有要求。' }}
          </div>
        </aside>

        <!-- Right: chart -->
        <div class="panel chart-panel">
          <div class="block-hdr">
            <h3>{{ mode3d ? '3D 曲面可视化' : '拟合可视化' }}</h3>
            <span class="panel-sub" v-if="best">
              最佳：<b>{{ best.name }}</b> · R² = {{ best.r2.toFixed(5) }}
            </span>
          </div>
          <div v-show="!points.length" class="empty">
            {{ mode3d
              ? '粘贴或导入 x, y, z 三列数据后，此处会显示散点与拟合曲面。'
              : '粘贴或加载数据后，此处会显示散点与拟合曲线。' }}
          </div>
          <v-chart
            v-show="points.length"
            :key="mode3d ? 'chart-3d' : 'chart-2d'"
            class="chart"
            :option="chartOption"
            :autoresize="true"
            :init-options="{ renderer: 'canvas' }"
          />
        </div>
      </div>

      <!-- Results table -->
      <div class="panel results" v-if="points.length">
        <div class="block-hdr">
          <h3>拟合结果 (点击公式可复制)</h3>
          <span class="panel-sub">{{ sortedResults.filter(r => r.ok).length }} 成功 / {{ sortedResults.length }} 模型</span>
        </div>
        <table class="tbl">
          <thead>
            <tr>
              <th style="width:48px">排名</th>
              <th style="width:200px">模型</th>
              <th style="width:110px">R²</th>
              <th>函数关系式 / 原因</th>
              <th style="width:110px">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(r, idx) in sortedResults"
              :key="r.id"
              :class="{ disabled: !r.ok, best: r.ok && idx === 0 }"
            >
              <td class="rank">
                <span v-if="r.ok && idx === 0" class="star">★★★</span>
                <span v-else-if="r.ok" class="num">#{{ idx + 1 }}</span>
                <span v-else class="dim">—</span>
              </td>
              <td>{{ r.name }}</td>
              <td class="mono">
                <span v-if="r.ok" :style="{ color: r.r2 > 0.95 ? 'var(--success)' : r.r2 > 0.8 ? 'var(--warning)' : 'var(--text-muted)' }">
                  {{ r.r2.toFixed(6) }}
                </span>
                <span v-else class="dim">—</span>
              </td>
              <td>
                <code
                  v-if="r.ok"
                  class="formula mono"
                  :class="{ 'formula-3d': mode3d }"
                  :title="'点击复制：' + r.formula"
                  @click="copyFormula(r)"
                  v-html="r.formulaHtml"
                ></code>
                <span v-else class="reason">{{ r.reason }}</span>
              </td>
              <td>
                <n-button
                  v-if="r.ok && !mode3d"
                  size="tiny"
                  :type="soloId === r.id ? 'primary' : 'default'"
                  @click="toggleSolo(r.id)"
                >{{ soloId === r.id ? '显示全部' : '仅此曲线' }}</n-button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, watchEffect } from 'vue'
import { NInput, NInputNumber, NButton, useMessage } from 'naive-ui'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { ScatterChart, LineChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, GridComponent, LegendComponent, VisualMapComponent } from 'echarts/components'
import VChart from 'vue-echarts'
// echarts-gl registers scatter3D / surface / grid3D / xAxis3D / yAxis3D / zAxis3D
// as module side-effects. Must be a top-level import so registrations happen
// on the same echarts instance that vue-echarts uses, BEFORE any setOption runs.
import 'echarts-gl'
import {
  fitAll, parsePoints, type FitResult, type Pt,
  fitAll3D, parsePoints3D, type FitResult3D, type Pt3
} from '@/utils/curveFit'

use([CanvasRenderer, ScatterChart, LineChart, TitleComponent, TooltipComponent, GridComponent, LegendComponent, VisualMapComponent])

type ModelId = 'poly1'|'poly2'|'poly3'|'poly4'|'poly5'|'poly6'|'exp'|'log'|'power'|'gaussian'
type SurfaceId = 'surf1'|'surf2'|'surf3'|'surf4'

const MODELS: { id: ModelId; label: string }[] = [
  { id: 'poly1', label: '一次 (线性)' },
  { id: 'poly2', label: '二次' },
  { id: 'poly3', label: '三次' },
  { id: 'poly4', label: '四次' },
  { id: 'poly5', label: '五次' },
  { id: 'poly6', label: '六次' },
  { id: 'exp',   label: '指数' },
  { id: 'log',   label: '对数' },
  { id: 'power', label: '幂函数' },
  { id: 'gaussian', label: '高斯' }
]

const MODELS_3D: { id: SurfaceId; label: string }[] = [
  { id: 'surf1', label: '双变量一次 (平面)' },
  { id: 'surf2', label: '双变量二次' },
  { id: 'surf3', label: '双变量三次' },
  { id: 'surf4', label: '双变量四次' }
]

const message = useMessage()

const rawText = ref('')
const enabled = reactive<Record<ModelId, boolean>>({
  poly1: true, poly2: true, poly3: true, poly4: false, poly5: false, poly6: false,
  exp: true, log: true, power: true, gaussian: true
})
const enabled3d = reactive<Record<SurfaceId, boolean>>({
  surf1: true, surf2: true, surf3: true, surf4: false
})
const soloId = ref<string | null>(null)
const xCol = ref(1)
const yCol = ref(2)
const zCol = ref(3)
const mode3d = ref(false)
const loadedFileName = ref('')

const fileInput = ref<HTMLInputElement | null>(null)

const activeModels = computed<{ id: string; label: string }[]>(() =>
  mode3d.value ? (MODELS_3D as any) : (MODELS as any)
)
const activeEnabled = computed<Record<string, boolean>>(() =>
  (mode3d.value ? enabled3d : enabled) as any
)

const placeholder = computed(() =>
  mode3d.value
    ? '# 每行 x, y, z（支持 Excel / CSV 粘贴）\n0, 0, 2.0\n1, 0, 2.5\n0, 1, 2.3\n...'
    : '# 每行一对 x, y（支持 Excel / CSV 粘贴）\n1, 2.1\n2  3.9\n3\t6.2\n...'
)

// --- persistence (survives panel navigation + app restart) ---
const STORE_KEY = 'stm32-hub:curve-fit:v2'
try {
  const raw = localStorage.getItem(STORE_KEY)
  if (raw) {
    const saved = JSON.parse(raw)
    if (typeof saved.rawText === 'string') rawText.value = saved.rawText
    if (saved.enabled && typeof saved.enabled === 'object') {
      for (const m of MODELS) {
        if (typeof saved.enabled[m.id] === 'boolean') enabled[m.id] = saved.enabled[m.id]
      }
    }
    if (saved.enabled3d && typeof saved.enabled3d === 'object') {
      for (const m of MODELS_3D) {
        if (typeof saved.enabled3d[m.id] === 'boolean') enabled3d[m.id] = saved.enabled3d[m.id]
      }
    }
    if (saved.soloId === null || typeof saved.soloId === 'string') soloId.value = saved.soloId
    if (typeof saved.xCol === 'number' && saved.xCol >= 1) xCol.value = saved.xCol
    if (typeof saved.yCol === 'number' && saved.yCol >= 1) yCol.value = saved.yCol
    if (typeof saved.zCol === 'number' && saved.zCol >= 1) zCol.value = saved.zCol
    if (typeof saved.mode3d === 'boolean') mode3d.value = saved.mode3d
    if (typeof saved.loadedFileName === 'string') loadedFileName.value = saved.loadedFileName
  }
} catch {
  // ignore corrupt storage
}
watchEffect(() => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      rawText: rawText.value,
      enabled: { ...enabled },
      enabled3d: { ...enabled3d },
      soloId: soloId.value,
      xCol: xCol.value,
      yCol: yCol.value,
      zCol: zCol.value,
      mode3d: mode3d.value,
      loadedFileName: loadedFileName.value
    }))
  } catch {
    // storage full / unavailable: drop silently
  }
})

// --- parsing ---
const parsed2d = computed(() => parsePoints(rawText.value, xCol.value - 1, yCol.value - 1))
const parsed3d = computed(() => parsePoints3D(rawText.value, xCol.value - 1, yCol.value - 1, zCol.value - 1))
const points2d = computed<Pt[]>(() => parsed2d.value.points)
const points3d = computed<Pt3[]>(() => parsed3d.value.points)
const points = computed(() => (mode3d.value ? points3d.value : points2d.value) as unknown as { length: number }[])
const parseErrors = computed(() => (mode3d.value ? parsed3d.value.errors : parsed2d.value.errors))

// --- fitting ---
const allResults = computed<(FitResult | FitResult3D)[]>(() => {
  if (mode3d.value) {
    if (points3d.value.length < 3) return []
    return fitAll3D(points3d.value)
  }
  if (points2d.value.length < 2) return []
  return fitAll(points2d.value)
})

const sortedResults = computed<(FitResult | FitResult3D)[]>(() => {
  const list = allResults.value.slice()
  list.sort((a, b) => {
    if (a.ok && !b.ok) return -1
    if (!a.ok && b.ok) return 1
    if (!a.ok && !b.ok) return 0
    return (b.r2 ?? -Infinity) - (a.r2 ?? -Infinity)
  })
  return list
})

const best = computed(() => sortedResults.value.find(r => r.ok) ?? null)

// --- chart ---
const COLORS = ['#3b82f6', '#f59e0b', '#a855f7', '#22c55e', '#ec4899', '#38bdf8', '#f97316', '#eab308', '#14b8a6', '#ef4444']

function buildSurfaceGrid(
  fit: FitResult3D,
  xmin: number, xmax: number,
  ymin: number, ymax: number,
  n: number
): [number, number, number][] {
  const data: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    const x = xmin + ((xmax - xmin) * i) / (n - 1)
    for (let j = 0; j < n; j++) {
      const y = ymin + ((ymax - ymin) * j) / (n - 1)
      const z = fit.predict(x, y)
      if (Number.isFinite(z)) data.push([x, y, z])
    }
  }
  return data
}

const chartOption = computed(() => {
  if (mode3d.value) return build3DOption()
  return build2DOption()
})

function build2DOption() {
  const pts = points2d.value
  if (!pts.length) return {}
  let xmin = Infinity, xmax = -Infinity
  for (const p of pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x }
  const span = xmax - xmin
  const pad = span > 0 ? span * 0.05 : Math.abs(xmax) * 0.05 + 1
  const x0 = xmin - pad, x1 = xmax + pad
  const N = 200
  const xs: number[] = []
  for (let i = 0; i < N; i++) xs.push(x0 + ((x1 - x0) * i) / (N - 1))

  const series: any[] = [{
    name: '原始点',
    type: 'scatter',
    data: pts.map(p => [p.x, p.y]),
    symbolSize: 9,
    itemStyle: { color: '#f5f6fa', borderColor: '#0f1014', borderWidth: 1.5 },
    z: 10
  }]

  const visible = (sortedResults.value as FitResult[])
    .filter(r => r.ok && enabled[r.id as ModelId] && (!soloId.value || soloId.value === r.id))
  visible.forEach((r, i) => {
    const color = i === 0 && !soloId.value ? COLORS[0] : COLORS[(i + 1) % COLORS.length]
    const data: [number, number][] = []
    for (const x of xs) {
      const y = (r as FitResult).predict(x)
      if (Number.isFinite(y)) data.push([x, y])
    }
    series.push({
      name: r.name,
      type: 'line',
      data,
      smooth: true,
      showSymbol: false,
      sampling: 'lttb',
      lineStyle: { width: i === 0 && !soloId.value ? 2.4 : 1.5, color, opacity: 0.95 },
      z: 5
    })
  })

  return {
    backgroundColor: 'transparent',
    grid: { left: 60, right: 24, top: 40, bottom: 44 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#181920',
      borderColor: '#262832',
      textStyle: { color: '#e7e8ef' },
      valueFormatter: (v: any) => Number.isFinite(v) ? (+v).toPrecision(6) : '—'
    },
    legend: {
      textStyle: { color: '#9395a2' },
      top: 4, right: 24, type: 'scroll',
      inactiveColor: '#5c5e6a'
    },
    xAxis: {
      type: 'value', name: 'x', nameTextStyle: { color: '#9395a2' },
      axisLine: { lineStyle: { color: '#3a3c48' } },
      axisLabel: { color: '#9395a2' },
      splitLine: { lineStyle: { color: '#1f2029' } },
      scale: true
    },
    yAxis: {
      type: 'value', name: 'y', nameTextStyle: { color: '#9395a2' },
      axisLine: { lineStyle: { color: '#3a3c48' } },
      axisLabel: { color: '#9395a2' },
      splitLine: { lineStyle: { color: '#1f2029' } },
      scale: true
    },
    series
  }
}

const GRID_N_3D = 30

function build3DOption() {
  const pts = points3d.value
  if (!pts.length) return {}
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
  for (const p of pts) {
    if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x
    if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y
  }
  const padX = (xmax - xmin) * 0.05 || 1
  const padY = (ymax - ymin) * 0.05 || 1

  const series: any[] = [{
    name: '原始点',
    type: 'scatter3D',
    data: pts.map(p => [p.x, p.y, p.z]),
    symbolSize: 6,
    itemStyle: { color: '#f5f6fa', borderColor: '#0f1014', borderWidth: 1, opacity: 1 }
  }]

  const visible = (sortedResults.value as FitResult3D[])
    .filter(r => r.ok && enabled3d[r.id as SurfaceId])
  visible.forEach((r, i) => {
    const color = i === 0 ? COLORS[0] : COLORS[(i + 1) % COLORS.length]
    const data = buildSurfaceGrid(r, xmin - padX, xmax + padX, ymin - padY, ymax + padY, GRID_N_3D)
    // Surface chart auto-detects a regular grid; skip if any predicted z is non-finite.
    if (data.length !== GRID_N_3D * GRID_N_3D) return
    series.push({
      name: r.name,
      type: 'surface',
      data,
      wireframe: { show: true, lineStyle: { color: '#ffffff', opacity: 0.15, width: 1 } },
      itemStyle: { opacity: 0.55, color }
    })
  })

  return {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: '#181920',
      borderColor: '#262832',
      textStyle: { color: '#e7e8ef' }
    },
    legend: {
      textStyle: { color: '#9395a2' },
      top: 4, right: 24, type: 'scroll',
      inactiveColor: '#5c5e6a'
    },
    grid3D: {
      viewControl: { projection: 'perspective', autoRotate: false, distance: 220 },
      axisLine: { lineStyle: { color: '#3a3c48' } },
      axisLabel: { color: '#9395a2' },
      axisPointer: { lineStyle: { color: '#4b4e5a' } },
      splitLine: { lineStyle: { color: '#1f2029' } },
      boxWidth: 140, boxDepth: 140, boxHeight: 100
    },
    xAxis3D: { name: 'x', type: 'value', nameTextStyle: { color: '#9395a2' }, axisLabel: { color: '#9395a2' } },
    yAxis3D: { name: 'y', type: 'value', nameTextStyle: { color: '#9395a2' }, axisLabel: { color: '#9395a2' } },
    zAxis3D: { name: 'z', type: 'value', nameTextStyle: { color: '#9395a2' }, axisLabel: { color: '#9395a2' } },
    series
  }
}

// Auto-clear solo when the target becomes disabled or invalid (2D only).
watch([soloId, enabled, sortedResults], () => {
  if (!soloId.value) return
  const r = sortedResults.value.find(x => x.id === soloId.value)
  if (!r || !r.ok) soloId.value = null
})
// Clear solo whenever we switch to 3D (it doesn't apply there).
watch(mode3d, v => { if (v) soloId.value = null })

// --- file import ---

function openFileDialog() {
  fileInput.value?.click()
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''  // allow re-selecting same file
  if (!file) return
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  try {
    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const firstName = wb.SheetNames[0]
      const first = firstName ? wb.Sheets[firstName] : null
      if (!first) throw new Error('工作簿为空')
      rawText.value = XLSX.utils.sheet_to_csv(first, { FS: '\t' })
    } else {
      rawText.value = await file.text()
    }
    loadedFileName.value = file.name
    message.success(`已导入 ${file.name}`)
  } catch (err: any) {
    message.error('读取失败: ' + (err?.message ?? err))
  }
}

// --- actions ---

function loadSample() {
  if (mode3d.value) {
    loadSample3D()
    return
  }
  // NTC 10kΩ @ 25°C — T(°C), R(kΩ)  monotone-decreasing exponential-like curve
  rawText.value = [
    '# NTC 10k B=3950 温度-电阻',
    '# T(°C), R(kΩ)',
    '-20, 97.1',
    '-10, 55.3',
    '0,   32.65',
    '10,  19.90',
    '20,  12.49',
    '25,  10.00',
    '30,  8.057',
    '40,  5.327',
    '50,  3.603',
    '60,  2.488',
    '70,  1.752',
    '80,  1.258',
    '90,  0.9173',
    '100, 0.6795'
  ].join('\n')
  loadedFileName.value = ''
}

function loadSample3D() {
  // Synthetic surface: z = 2 + 0.5x + 0.3y + 0.1xy over a 5x5 grid, small noise
  // Models a 2-input sensor cross-compensation scenario.
  const lines: string[] = ['# 双变量示例: z ≈ 2 + 0.5x + 0.3y + 0.1xy', '# x, y, z']
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const noise = (Math.sin(i * 7 + j * 13) * 0.05)
      const z = 2 + 0.5 * i + 0.3 * j + 0.1 * i * j + noise
      lines.push(`${i}, ${j}, ${z.toFixed(4)}`)
    }
  }
  rawText.value = lines.join('\n')
  xCol.value = 1; yCol.value = 2; zCol.value = 3
  loadedFileName.value = ''
}

function clearAll() {
  rawText.value = ''
  soloId.value = null
  xCol.value = 1
  yCol.value = 2
  zCol.value = 3
  loadedFileName.value = ''
}

function setAll(v: boolean) {
  if (mode3d.value) {
    for (const m of MODELS_3D) enabled3d[m.id] = v
  } else {
    for (const m of MODELS) enabled[m.id] = v
  }
}

function toggleSolo(id: string) {
  soloId.value = soloId.value === id ? null : id
}

async function copyFormula(r: FitResult | FitResult3D) {
  try {
    await navigator.clipboard.writeText(r.formula)
    message.success('已复制：' + r.formula)
  } catch {
    message.warning('无法写入剪贴板，请手动复制')
  }
}
</script>

<style scoped>
.cf { display: flex; flex-direction: column; height: 100%; }
.actions { display: flex; gap: 8px; }
.body { padding: 18px 28px 28px; flex: 1; overflow-y: auto; }

.grid-top {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 16px 18px;
}

.block-hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
.block-hdr h3 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--text-strong); letter-spacing: 0.01em; }
.panel-sub { color: var(--text-muted); font-size: 12px; }
.toggle-group { display: inline-flex; gap: 4px; }

.input-panel { display: flex; flex-direction: column; }
.ta :deep(textarea) { font-family: var(--font-mono); font-size: 12.5px; line-height: 1.5; }

.col-select {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
  flex-wrap: wrap;
}
.col-lbl { font-size: 12px; color: var(--text-muted); }
.col-inp { width: 48px !important; }
.col-inp :deep(input) { text-align: center; }
.col-hint { color: var(--text-dim); font-size: 11px; margin-left: auto; }

.info-row { display: flex; gap: 12px; margin-top: 6px; flex-wrap: wrap; font-size: 12px; }
.info.ok { color: var(--success); }
.info.err { color: var(--error); cursor: help; }
.info.dim { color: var(--text-dim); }

.model-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 10px;
  margin-top: 4px;
}
.chk { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text); user-select: none; cursor: pointer; }
.chk input[type="checkbox"] { accent-color: var(--accent); width: 13px; height: 13px; }
.hint { font-size: 11px; color: var(--text-dim); margin-top: 10px; }

.chart-panel { display: flex; flex-direction: column; min-height: 420px; }
.chart { flex: 1; width: 100%; min-height: 360px; }
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-dim);
  font-size: 13px;
  min-height: 300px;
}

.results { }
.tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.tbl th, .tbl td { padding: 9px 10px; text-align: left; border-bottom: 1px solid var(--border-soft); vertical-align: middle; }
.tbl th { color: var(--text-muted); font-weight: 500; font-size: 12px; }
.tbl td { color: var(--text); }
.tbl tr.best td { background: rgba(59,130,246,.06); }
.tbl tr.disabled td { color: var(--text-dim); }
.rank .star { color: var(--accent); font-weight: 700; letter-spacing: 0.5px; }
.rank .num { color: var(--text-muted); }
.dim { color: var(--text-dim); }
.reason { color: var(--text-dim); font-size: 12px; font-style: italic; }

.formula {
  display: inline-block;
  background: var(--bg-panel-2);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.12s;
  color: var(--text-strong);
  font-size: 12.5px;
}
.formula:hover {
  border-color: var(--accent);
  background: rgba(59,130,246,.08);
  color: var(--accent-hover);
}
.formula-3d {
  white-space: normal;
  word-break: break-word;
  max-width: 100%;
  line-height: 1.55;
}

.mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  user-select: none;
  cursor: pointer;
}
.mode-toggle input[type="checkbox"] {
  accent-color: var(--accent);
  width: 13px;
  height: 13px;
}

.file-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  padding: 3px 4px 3px 10px;
  background: var(--bg-panel-2);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  font-size: 11.5px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.file-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.chip-x {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
  line-height: 1;
}
.chip-x:hover { color: var(--error); }

@media (max-width: 900px) {
  .grid-top { grid-template-columns: 1fr; }
}
</style>
