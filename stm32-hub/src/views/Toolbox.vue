<template>
  <div class="tb">
    <header class="hdr">
      <div>
        <h2>嵌入式工具箱</h2>
        <span class="sub">常用换算与速查表，离线可用</span>
      </div>
    </header>

    <section class="scroll-y body">
      <div class="grid2">
        <!-- Number base converter -->
        <div class="panel">
          <div class="panel-hdr"><h3>🔢 进制换算</h3></div>
          <div class="conv">
            <label>DEC</label>
            <n-input v-model:value="dec" placeholder="10" @input="onConv('dec')" />
            <label>HEX</label>
            <n-input v-model:value="hex" placeholder="0x0A" @input="onConv('hex')" />
            <label>BIN</label>
            <n-input v-model:value="bin" placeholder="1010" @input="onConv('bin')" />
            <label>OCT</label>
            <n-input v-model:value="oct" placeholder="012" @input="onConv('oct')" />
          </div>
          <div v-if="convErr" class="err">{{ convErr }}</div>
          <div v-else class="hint">支持前缀 0x / 0b / 0o；32-bit 范围内。</div>
        </div>

        <!-- Byte / data size converter -->
        <div class="panel">
          <div class="panel-hdr"><h3>💾 数据容量换算</h3></div>
          <div class="conv">
            <label>Bytes</label>
            <n-input v-model:value="szBytes" @input="onSize('B')" />
            <label>KB</label>
            <n-input v-model:value="szKB" @input="onSize('K')" />
            <label>MB</label>
            <n-input v-model:value="szMB" @input="onSize('M')" />
            <label>Flash 页 (1KB)</label>
            <div class="readout">{{ fmtInt(Number(szBytes || 0) / 1024) }}</div>
          </div>
        </div>

        <!-- UART baud reference -->
        <div class="panel">
          <div class="panel-hdr"><h3>📡 UART 波特率参考</h3><span class="panel-sub">F_CLK = {{ uartClk }} MHz</span></div>
          <n-input-number v-model:value="uartClk" :min="1" :max="480" size="small" style="width:140px;margin-bottom:10px" />
          <table class="tbl">
            <thead>
              <tr><th>波特率</th><th>BRR (16×)</th><th>实际</th><th>误差</th></tr>
            </thead>
            <tbody>
              <tr v-for="b in baudTable" :key="b.baud">
                <td>{{ b.baud.toLocaleString() }}</td>
                <td>{{ b.brr }}</td>
                <td>{{ b.actual.toLocaleString() }}</td>
                <td :style="{ color: Math.abs(b.err) > 2 ? '#ef5350' : '#66bb6a' }">{{ b.err.toFixed(2) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Clock prescaler calculator -->
        <div class="panel">
          <div class="panel-hdr"><h3>⏱ 定时器周期计算</h3></div>
          <div class="conv">
            <label>TIM 频率 (Hz)</label>
            <n-input-number v-model:value="timClk" :min="1" />
            <label>预分频 PSC</label>
            <n-input-number v-model:value="timPsc" :min="0" :max="65535" />
            <label>重载 ARR</label>
            <n-input-number v-model:value="timArr" :min="0" :max="65535" />
            <label>→ 溢出频率</label>
            <div class="readout">{{ timFreq.toFixed(3) }} Hz</div>
            <label>→ 溢出周期</label>
            <div class="readout">{{ timPeriodStr }}</div>
          </div>
          <div class="hint">公式：f = F_TIM / ((PSC+1) × (ARR+1))</div>
        </div>

        <!-- Bit flag builder -->
        <div class="panel">
          <div class="panel-hdr"><h3>🧮 32-bit 位运算助手</h3></div>
          <div class="bits">
            <div v-for="row in [0,1,2,3]" :key="row" class="bit-row">
              <div
                v-for="col in 8"
                :key="col"
                class="bit"
                :class="{ on: bitSet((3-row)*8 + (8-col)) }"
                @click="toggleBit((3-row)*8 + (8-col))"
              >
                <div class="bit-idx">{{ (3-row)*8 + (8-col) }}</div>
                <div class="bit-v">{{ bitSet((3-row)*8 + (8-col)) ? 1 : 0 }}</div>
              </div>
            </div>
          </div>
          <div class="bit-out">
            <div><b>HEX</b> <span class="mono">0x{{ bitValue.toString(16).toUpperCase().padStart(8, '0') }}</span></div>
            <div><b>DEC</b> <span class="mono">{{ bitValue.toString(10) }}</span></div>
            <div><b>BIN</b> <span class="mono">{{ bitValue.toString(2).padStart(32, '0') }}</span></div>
          </div>
          <n-button size="small" quaternary @click="bitValue = 0">清零</n-button>
          <n-button size="small" quaternary @click="bitValue = 0xFFFFFFFF">全开</n-button>
        </div>

        <!-- STM32 pin mode cheatsheet -->
        <div class="panel">
          <div class="panel-hdr"><h3>📌 GPIO 模式速查</h3></div>
          <table class="tbl">
            <thead>
              <tr><th>模式</th><th>MODER</th><th>OTYPER</th><th>常用场景</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in pinModes" :key="r.name">
                <td><b>{{ r.name }}</b></td>
                <td class="mono">{{ r.moder }}</td>
                <td class="mono">{{ r.otyper }}</td>
                <td>{{ r.usage }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- NVIC priority encoder (interactive) -->
        <div class="panel">
          <div class="panel-hdr"><h3>⚡ NVIC 优先级编码器</h3></div>
          <div class="conv">
            <label>分组 (PRIGROUP)</label>
            <n-select
              v-model:value="nvicGroup"
              :options="nvicGroupOptions"
              size="small"
            />
            <label>抢占优先级</label>
            <n-input-number v-model:value="nvicPreempt" :min="0" :max="nvicMaxPreempt" size="small" />
            <label>响应优先级</label>
            <n-input-number v-model:value="nvicSub" :min="0" :max="nvicMaxSub" size="small" />
          </div>
          <table class="tbl" style="margin-top: 6px">
            <tbody>
              <tr><td>抢占位 / 响应位</td><td class="mono">{{ nvicPreemptBits }} / {{ nvicSubBits }}</td></tr>
              <tr><td>最大抢占级数</td><td class="mono">{{ Math.pow(2, nvicPreemptBits) }}</td></tr>
              <tr><td>4-bit 实际值</td><td class="mono accent">0x{{ nvicEncoded.toString(16).toUpperCase() }} ({{ nvicEncoded }})</td></tr>
              <tr><td>HAL 调用</td><td class="mono">HAL_NVIC_SetPriority(IRQn, {{ nvicPreempt }}, {{ nvicSub }})</td></tr>
            </tbody>
          </table>
          <div class="hint">HAL 默认 GROUP_4：16 级抢占、无响应。Cortex-M3/M4 实际只用高 4 bit。</div>
        </div>

        <!-- Clock Tree calculator -->
        <div class="panel">
          <div class="panel-hdr"><h3>🌳 时钟树计算器</h3><span class="panel-sub">{{ clkFamilyLabel }}</span></div>
          <div class="conv" style="grid-template-columns: 110px 1fr;">
            <label>家族</label>
            <n-select v-model:value="clkFamily" :options="clkFamilyOptions" size="small" />
            <label>HSE (MHz)</label>
            <n-input-number v-model:value="clkHse" :min="1" :max="50" :step="1" size="small" />
            <label v-if="clkFamily === 'F4'">PLLM (÷)</label>
            <n-input-number v-if="clkFamily === 'F4'" v-model:value="clkPllM" :min="2" :max="63" size="small" />
            <label v-if="clkFamily === 'F4'">PLLN (×)</label>
            <n-input-number v-if="clkFamily === 'F4'" v-model:value="clkPllN" :min="50" :max="432" size="small" />
            <label v-if="clkFamily === 'F4'">PLLP (÷)</label>
            <n-select v-if="clkFamily === 'F4'" v-model:value="clkPllP" :options="[{label:'2',value:2},{label:'4',value:4},{label:'6',value:6},{label:'8',value:8}]" size="small" />
            <label v-if="clkFamily === 'F1'">PLLMUL (×)</label>
            <n-input-number v-if="clkFamily === 'F1'" v-model:value="clkPllMul" :min="2" :max="16" size="small" />
            <label>AHB (÷)</label>
            <n-select v-model:value="clkAhb" :options="ahbDivOptions" size="small" />
            <label>APB1 (÷)</label>
            <n-select v-model:value="clkApb1" :options="apbDivOptions" size="small" />
            <label>APB2 (÷)</label>
            <n-select v-model:value="clkApb2" :options="apbDivOptions" size="small" />
          </div>
          <table class="tbl" style="margin-top: 6px">
            <tbody>
              <tr><td>VCO 频率</td><td class="mono">{{ fmtMHz(clkVco) }}</td></tr>
              <tr><td>SYSCLK</td>
                <td class="mono" :class="{ 'over': clkSysOver }">
                  {{ fmtMHz(clkSysclk) }}
                  <span v-if="clkSysOver" class="warn-mini">超出 {{ clkLimit }} MHz 上限</span>
                </td>
              </tr>
              <tr><td>HCLK (AHB)</td><td class="mono">{{ fmtMHz(clkHclk) }}</td></tr>
              <tr><td>APB1 / TIM</td><td class="mono">{{ fmtMHz(clkApb1Hz) }} / {{ fmtMHz(clkApb1TimHz) }}</td></tr>
              <tr><td>APB2 / TIM</td><td class="mono">{{ fmtMHz(clkApb2Hz) }} / {{ fmtMHz(clkApb2TimHz) }}</td></tr>
            </tbody>
          </table>
          <div class="hint">{{ clkFormulaHint }}</div>
        </div>

        <!-- IEEE-754 float viewer -->
        <div class="panel">
          <div class="panel-hdr"><h3>🧮 IEEE-754 浮点查看器</h3></div>
          <div class="conv" style="grid-template-columns: 110px 1fr;">
            <label>十进制值</label>
            <n-input v-model:value="fpDec" placeholder="例如 3.14159" @input="onFpDecInput" />
            <label>32-bit Hex</label>
            <n-input v-model:value="fpHex" placeholder="0x40490FDB" @input="onFpHexInput" />
          </div>
          <div class="fp-out">
            <div class="fp-bits">
              <div
                v-for="(b, idx) in fpBits"
                :key="idx"
                class="fp-bit"
                :class="fpBitClass(idx)"
                :title="fpBitTitle(idx)"
              >{{ b }}</div>
            </div>
            <div class="fp-legend">
              <span class="lg sign">符号 (1)</span>
              <span class="lg exp">指数 (8)</span>
              <span class="lg mant">尾数 (23)</span>
            </div>
            <table class="tbl">
              <tbody>
                <tr><td>符号位</td><td class="mono">{{ fpInfo.sign }} ({{ fpInfo.signLabel }})</td></tr>
                <tr><td>指数 (原始 / 偏移后)</td><td class="mono">{{ fpInfo.expRaw }} / {{ fpInfo.exp }}</td></tr>
                <tr><td>尾数 (M)</td><td class="mono">0x{{ fpInfo.mantHex }}</td></tr>
                <tr><td>解析回值</td><td class="mono accent">{{ fpInfo.value }}</td></tr>
                <tr><td>类型</td><td class="mono">{{ fpInfo.kind }}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="hint">浮点 = (-1)^符号 × (1.尾数) × 2^(指数-127)。常见坑：printf 用 %f 没开 -u _printf_float。</div>
        </div>

        <!-- Voltage divider -->
        <div class="panel">
          <div class="panel-hdr"><h3>🔋 电阻分压计算</h3></div>
          <div class="conv">
            <label>Vin (V)</label>
            <n-input-number v-model:value="vdVin" :min="0" :step="0.1" />
            <label>R1 (Ω)</label>
            <n-input-number v-model:value="vdR1" :min="0" />
            <label>R2 (Ω)</label>
            <n-input-number v-model:value="vdR2" :min="0" />
            <label>→ Vout</label>
            <div class="readout">{{ vdVout.toFixed(4) }} V</div>
            <label>→ I (mA)</label>
            <div class="readout">{{ vdCurrent.toFixed(3) }}</div>
            <label>→ R 功耗</label>
            <div class="readout">{{ vdPower.toFixed(2) }} mW</div>
          </div>
          <div class="hint">公式：Vout = Vin × R2 / (R1 + R2)；常用于 ADC 信号分压。</div>
        </div>

        <!-- CRC32 -->
        <div class="panel">
          <div class="panel-hdr"><h3>🔐 CRC32 校验</h3></div>
          <n-input
            v-model:value="crcInput"
            type="textarea"
            :rows="3"
            placeholder="输入字符串或 hex bytes（以 0x 起头会按 hex 解析，否则按 UTF-8）"
          />
          <div style="margin-top: 10px">
            <n-radio-group v-model:value="crcMode" size="small">
              <n-radio value="text">文本 (UTF-8)</n-radio>
              <n-radio value="hex">Hex bytes</n-radio>
            </n-radio-group>
          </div>
          <div style="margin-top: 12px">
            <div><b>CRC32:</b> <span class="mono accent">0x{{ crc32Result.toString(16).toUpperCase().padStart(8,'0') }}</span></div>
            <div><b>DEC:</b> <span class="mono">{{ crc32Result >>> 0 }}</span></div>
          </div>
          <div class="hint">多项式 0xEDB88320（IEEE 802.3，与 zlib/PNG 一致）。</div>
        </div>

        <!-- HAL status / HardFault decoder -->
        <div class="panel">
          <div class="panel-hdr"><h3>🩺 HAL & HardFault 解析</h3></div>
          <div class="conv" style="grid-template-columns: 110px 1fr 1fr;">
            <label>HAL_Status</label>
            <n-input v-model:value="halStatusInput" placeholder="0 / 1 / 2 / 3 或 0x..." />
            <div class="readout" :style="{ color: halStatusDecode.color }">{{ halStatusDecode.name }}</div>
          </div>
          <div class="hint" style="margin-bottom: 14px">{{ halStatusDecode.hint }}</div>

          <div class="conv" style="grid-template-columns: 110px 1fr;">
            <label>CFSR (32-bit)</label>
            <n-input v-model:value="cfsrInput" placeholder="0x... 来自 SCB->CFSR" />
          </div>
          <div v-if="cfsrFlags.length" class="cfsr-out">
            <div v-for="f in cfsrFlags" :key="f.bit" class="cfsr-row">
              <b class="mono">[bit {{ f.bit }}]</b>
              <span class="cfsr-name">{{ f.name }}</span>
              <span class="cfsr-desc">{{ f.desc }}</span>
            </div>
          </div>
          <div v-else-if="cfsrInput" class="hint">无置位 — 检查输入是否正确。</div>
          <div v-else class="hint">CFSR 寄存器位说明 — 排查 HardFault 必备。</div>
        </div>

        <!-- Code snippets library -->
        <div class="panel full">
          <div class="panel-hdr">
            <h3>📋 HAL 代码片段库</h3>
            <span class="panel-sub">{{ filteredSnippets.length }} / {{ snippets.length }} 个</span>
          </div>
          <div class="snip-tools">
            <n-input v-model:value="snippetSearch" placeholder="搜索 (USART / TIM / DMA...)" clearable size="small" style="width: 240px" />
            <n-select v-model:value="snippetCat" :options="snippetCategories" size="small" style="width: 160px" />
          </div>
          <div class="snip-grid">
            <div v-for="s in filteredSnippets" :key="s.id" class="snip-card">
              <div class="snip-hdr">
                <div>
                  <div class="snip-title">{{ s.title }}</div>
                  <div class="snip-tags">
                    <span class="snip-cat">{{ s.category }}</span>
                    <span v-if="s.note" class="snip-note">{{ s.note }}</span>
                  </div>
                </div>
                <n-button size="tiny" @click="copySnippet(s)">📋 复制</n-button>
              </div>
              <pre class="snip-code"><code>{{ s.code }}</code></pre>
            </div>
          </div>
        </div>

        <!-- ASCII table quick reference -->
        <div class="panel full">
          <div class="panel-hdr"><h3>🔡 ASCII 速查表</h3></div>
          <div class="ascii">
            <div v-for="code in asciiRange" :key="code" class="a-cell" :title="'Ctrl+' + String.fromCharCode(64 + code)">
              <div class="a-code">{{ code }}</div>
              <div class="a-char">{{ asciiLabel(code) }}</div>
              <div class="a-hex">0x{{ code.toString(16).toUpperCase().padStart(2, '0') }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NInput, NInputNumber, NButton, NRadio, NRadioGroup, NSelect, useMessage } from 'naive-ui'

const msg = useMessage()

// Number base
const dec = ref('')
const hex = ref('')
const bin = ref('')
const oct = ref('')
const convErr = ref('')

function onConv(from: 'dec' | 'hex' | 'bin' | 'oct') {
  convErr.value = ''
  try {
    let n = 0
    if (from === 'dec') {
      if (!dec.value.trim()) { hex.value = ''; bin.value = ''; oct.value = ''; return }
      n = parseInt(dec.value.trim(), 10)
    } else if (from === 'hex') {
      if (!hex.value.trim()) { dec.value = ''; bin.value = ''; oct.value = ''; return }
      const s = hex.value.trim().replace(/^0x/i, '')
      n = parseInt(s, 16)
    } else if (from === 'bin') {
      if (!bin.value.trim()) { dec.value = ''; hex.value = ''; oct.value = ''; return }
      const s = bin.value.trim().replace(/^0b/i, '')
      n = parseInt(s, 2)
    } else {
      if (!oct.value.trim()) { dec.value = ''; hex.value = ''; bin.value = ''; return }
      const s = oct.value.trim().replace(/^0o/i, '')
      n = parseInt(s, 8)
    }
    if (isNaN(n)) throw new Error('无效输入')
    if (n < 0 || n > 0xFFFFFFFF) throw new Error('超出 32 位范围')
    if (from !== 'dec') dec.value = n.toString(10)
    if (from !== 'hex') hex.value = '0x' + n.toString(16).toUpperCase()
    if (from !== 'bin') bin.value = n.toString(2)
    if (from !== 'oct') oct.value = '0o' + n.toString(8)
  } catch (e: any) {
    convErr.value = e.message
  }
}

// Size conversion
const szBytes = ref('1024')
const szKB = ref('1')
const szMB = ref('0.000977')
function onSize(from: 'B' | 'K' | 'M') {
  let b = 0
  if (from === 'B') b = Number(szBytes.value) || 0
  else if (from === 'K') b = (Number(szKB.value) || 0) * 1024
  else b = (Number(szMB.value) || 0) * 1024 * 1024
  if (from !== 'B') szBytes.value = String(b)
  if (from !== 'K') szKB.value = String(+(b / 1024).toFixed(3))
  if (from !== 'M') szMB.value = String(+(b / 1024 / 1024).toFixed(6))
}
function fmtInt(n: number) { return Math.floor(n).toString() }

// UART baud
const uartClk = ref(72)
const commonBauds = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const baudTable = computed(() => {
  const f = uartClk.value * 1_000_000
  return commonBauds.map(baud => {
    const brr = Math.round(f / baud)
    const actual = Math.round(f / brr)
    const err = ((actual - baud) / baud) * 100
    return { baud, brr, actual, err }
  })
})

// Timer
const timClk = ref(72_000_000)
const timPsc = ref(71)
const timArr = ref(999)
const timFreq = computed(() => {
  const denom = (timPsc.value + 1) * (timArr.value + 1)
  return denom > 0 ? timClk.value / denom : 0
})
const timPeriodStr = computed(() => {
  const f = timFreq.value
  if (f <= 0) return '—'
  const T = 1 / f
  if (T < 1e-6) return (T * 1e9).toFixed(2) + ' ns'
  if (T < 1e-3) return (T * 1e6).toFixed(2) + ' μs'
  if (T < 1) return (T * 1e3).toFixed(3) + ' ms'
  return T.toFixed(3) + ' s'
})

// Bit flags
const bitValue = ref(0)
function bitSet(i: number) { return (bitValue.value & (1 << i)) !== 0 }
function toggleBit(i: number) {
  bitValue.value = (bitValue.value ^ (1 << i)) >>> 0
}

// GPIO cheat
const pinModes = [
  { name: 'Input (Floating)',    moder: '00', otyper: '-',  usage: '读取外部电平' },
  { name: 'Input (PullUp)',       moder: '00', otyper: '-',  usage: '按键、开漏输入' },
  { name: 'Input (PullDown)',    moder: '00', otyper: '-',  usage: '避免悬空' },
  { name: 'Output PP',            moder: '01', otyper: '0',  usage: 'LED、控制信号' },
  { name: 'Output OD',            moder: '01', otyper: '1',  usage: 'I²C 外接上拉' },
  { name: 'AF PP (USART/SPI)',    moder: '10', otyper: '0',  usage: 'UART TX、SPI 主' },
  { name: 'AF OD (I²C)',          moder: '10', otyper: '1',  usage: 'I²C SDA/SCL' },
  { name: 'Analog',               moder: '11', otyper: '-',  usage: 'ADC / DAC 管脚' }
]

// ASCII 32..126
const asciiRange = Array.from({ length: 95 }, (_, i) => i + 32)
function asciiLabel(code: number) {
  if (code === 32) return '␣'
  return String.fromCharCode(code)
}

// ===== Voltage divider =====
const vdVin = ref(3.3)
const vdR1 = ref(10000)
const vdR2 = ref(10000)
const vdVout = computed(() => {
  const denom = vdR1.value + vdR2.value
  return denom > 0 ? (vdVin.value * vdR2.value / denom) : 0
})
const vdCurrent = computed(() => {
  const denom = vdR1.value + vdR2.value
  return denom > 0 ? (vdVin.value / denom) * 1000 : 0
})
const vdPower = computed(() => {
  const i = vdCurrent.value / 1000
  return i * vdVin.value * 1000  // mW
})

// ===== CRC32 =====
const crcInput = ref('Hello STM32')
const crcMode = ref<'text' | 'hex'>('text')
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()
function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
function parseHexBytes(s: string): Uint8Array {
  const cleaned = s.replace(/0x/gi, '').replace(/[\s,]+/g, '')
  if (cleaned.length === 0) return new Uint8Array()
  const padded = cleaned.length % 2 ? '0' + cleaned : cleaned
  const out = new Uint8Array(padded.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(padded.substr(i * 2, 2), 16) || 0
  }
  return out
}
const crc32Result = computed(() => {
  if (!crcInput.value) return 0
  const bytes = crcMode.value === 'hex'
    ? parseHexBytes(crcInput.value)
    : new TextEncoder().encode(crcInput.value)
  return crc32(bytes)
})

// ===== HAL status decoder =====
const HAL_STATUS = [
  { val: 0, name: 'HAL_OK', color: '#66bb6a', hint: '操作成功完成。' },
  { val: 1, name: 'HAL_ERROR', color: '#ef5350', hint: '通用错误 — 检查参数、外设是否初始化、时钟是否使能。' },
  { val: 2, name: 'HAL_BUSY', color: '#ffa726', hint: '外设忙 — 上次操作未完成；DMA / 中断模式中很常见。' },
  { val: 3, name: 'HAL_TIMEOUT', color: '#ab47bc', hint: '超时 — I²C/SPI 等同步操作没收到响应；检查从机/上拉/电平。' }
]
const halStatusInput = ref('1')
const halStatusDecode = computed(() => {
  const s = halStatusInput.value.trim()
  if (!s) return { name: '—', color: '#666', hint: '输入 0/1/2/3 或 0x00..0x03。' }
  const n = s.startsWith('0x') || s.startsWith('0X') ? parseInt(s, 16) : parseInt(s, 10)
  if (isNaN(n)) return { name: '⚠ 无效输入', color: '#ef5350', hint: '请输入数字。' }
  const m = HAL_STATUS.find(x => x.val === n)
  if (!m) return { name: '未知值', color: '#ef5350', hint: 'HAL_StatusTypeDef 只有 0..3。' }
  return m
})

// ===== CFSR decoder =====
// SCB->CFSR layout: bits 0..7 MMFSR | 8..15 BFSR | 16..31 UFSR
const CFSR_BITS: Array<{ bit: number; name: string; desc: string }> = [
  { bit: 0,  name: 'IACCVIOL',  desc: 'MemManage: 取指令访问违规（执行了不可执行区域）。' },
  { bit: 1,  name: 'DACCVIOL',  desc: 'MemManage: 数据访问违规。' },
  { bit: 3,  name: 'MUNSTKERR', desc: 'MemManage: 出栈时违规。检查栈是否被破坏。' },
  { bit: 4,  name: 'MSTKERR',   desc: 'MemManage: 入栈时违规。栈溢出常见。' },
  { bit: 5,  name: 'MLSPERR',   desc: 'MemManage: 浮点延迟入栈违规。' },
  { bit: 7,  name: 'MMARVALID', desc: 'MMFAR 寄存器内容有效，可读出错地址。' },
  { bit: 8,  name: 'IBUSERR',   desc: 'BusFault: 取指令总线错误。常见为 PC 跑飞到非法地址。' },
  { bit: 9,  name: 'PRECISERR', desc: 'BusFault: 精确数据总线错误。读 BFAR 看出错地址。' },
  { bit: 10, name: 'IMPRECISERR',desc: 'BusFault: 不精确总线错误（写缓冲）。常因为指针写到非法地址。' },
  { bit: 11, name: 'UNSTKERR',  desc: 'BusFault: 出栈错误。' },
  { bit: 12, name: 'STKERR',    desc: 'BusFault: 入栈错误。' },
  { bit: 13, name: 'LSPERR',    desc: 'BusFault: 浮点延迟入栈错误。' },
  { bit: 15, name: 'BFARVALID', desc: 'BFAR 寄存器内容有效。' },
  { bit: 16, name: 'UNDEFINSTR',desc: 'UsageFault: 未定义指令。常见为函数指针错误 / 内存被覆盖。' },
  { bit: 17, name: 'INVSTATE',  desc: 'UsageFault: 无效状态（EPSR.T=0 但跳到 Thumb 指令）。' },
  { bit: 18, name: 'INVPC',     desc: 'UsageFault: 异常返回时 EXC_RETURN 非法。' },
  { bit: 19, name: 'NOCP',      desc: 'UsageFault: 协处理器不存在 — 多半是没开 FPU 却用了浮点。' },
  { bit: 24, name: 'UNALIGNED', desc: 'UsageFault: 未对齐访问。检查 packed 结构体或 cast 后访问。' },
  { bit: 25, name: 'DIVBYZERO', desc: 'UsageFault: 除零（需 SCB->CCR.DIV_0_TRP=1 才会触发）。' }
]
const cfsrInput = ref('')
const cfsrFlags = computed(() => {
  const s = cfsrInput.value.trim()
  if (!s) return []
  const v = (s.startsWith('0x') || s.startsWith('0X'))
    ? parseInt(s, 16)
    : parseInt(s, 10)
  if (isNaN(v)) return []
  return CFSR_BITS.filter(b => (v & (1 << b.bit)) !== 0)
})

// ===== Code snippets =====
interface Snippet {
  id: string
  title: string
  category: string
  note?: string
  code: string
}
const snippets: Snippet[] = [
  {
    id: 'gpio-toggle',
    title: 'GPIO 翻转 LED',
    category: 'GPIO',
    note: '最基本的点灯',
    code: `// 在 while(1) 中
HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13);
HAL_Delay(500);`
  },
  {
    id: 'usart-printf',
    title: 'USART printf 重定向',
    category: 'USART',
    note: '加到 main.c 末尾，用 printf 即可串口输出',
    code: `#include <stdio.h>
extern UART_HandleTypeDef huart1;

int __io_putchar(int ch) {
  HAL_UART_Transmit(&huart1, (uint8_t*)&ch, 1, HAL_MAX_DELAY);
  return ch;
}

// 用 GCC：链接前加 _write
int _write(int fd, char *p, int len) {
  HAL_UART_Transmit(&huart1, (uint8_t*)p, len, HAL_MAX_DELAY);
  return len;
}`
  },
  {
    id: 'usart-it-rx',
    title: 'USART 中断接收单字节',
    category: 'USART',
    code: `uint8_t rx_byte;

// main 初始化后开启接收中断
HAL_UART_Receive_IT(&huart1, &rx_byte, 1);

// 回调（写在 main.c 或 stm32xxxx_it.c）
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
  if (huart->Instance == USART1) {
    // 处理 rx_byte ...
    HAL_UART_Receive_IT(&huart1, &rx_byte, 1);  // 重新开启
  }
}`
  },
  {
    id: 'dma-uart-idle',
    title: 'DMA + UART 空闲中断接不定长',
    category: 'DMA',
    note: '工业级常用方案，需在 CubeMX 开 DMA RX (Circular)',
    code: `#define RX_BUF_SIZE 256
uint8_t rx_buf[RX_BUF_SIZE];

// main 初始化
__HAL_UART_ENABLE_IT(&huart1, UART_IT_IDLE);
HAL_UART_Receive_DMA(&huart1, rx_buf, RX_BUF_SIZE);

// stm32xxxx_it.c 的 USART1_IRQHandler() 末尾：
void USART1_IRQHandler(void) {
  if (__HAL_UART_GET_FLAG(&huart1, UART_FLAG_IDLE)) {
    __HAL_UART_CLEAR_IDLEFLAG(&huart1);
    uint16_t len = RX_BUF_SIZE - __HAL_DMA_GET_COUNTER(huart1.hdmarx);
    // 处理 rx_buf[0..len)
    HAL_UART_DMAStop(&huart1);
    HAL_UART_Receive_DMA(&huart1, rx_buf, RX_BUF_SIZE);
  }
  HAL_UART_IRQHandler(&huart1);
}`
  },
  {
    id: 'tim-pe',
    title: 'TIM 定时器中断回调',
    category: 'TIM',
    code: `// CubeMX 中 TIM2 配 PSC=72-1, ARR=1000-1 → 1ms 周期
HAL_TIM_Base_Start_IT(&htim2);

void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {
  if (htim->Instance == TIM2) {
    // 1ms 任务
  }
}`
  },
  {
    id: 'pwm-output',
    title: 'PWM 输出（呼吸灯）',
    category: 'TIM',
    code: `HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);

// 改占空比 0..ARR
__HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, 500);`
  },
  {
    id: 'adc-poll',
    title: 'ADC 单次轮询采样',
    category: 'ADC',
    code: `uint32_t adc_value = 0;

HAL_ADC_Start(&hadc1);
if (HAL_ADC_PollForConversion(&hadc1, 10) == HAL_OK) {
  adc_value = HAL_ADC_GetValue(&hadc1);
}
HAL_ADC_Stop(&hadc1);

// 转电压（3.3V VREF, 12-bit）
float voltage = adc_value * 3.3f / 4096.0f;`
  },
  {
    id: 'i2c-mem',
    title: 'I²C 读写从机寄存器',
    category: 'I2C',
    code: `#define DEV_ADDR (0x68 << 1)   // 7-bit 地址左移

uint8_t reg = 0x75, who_am_i = 0;

HAL_I2C_Mem_Read(&hi2c1, DEV_ADDR, reg, 1, &who_am_i, 1, 100);
// 写：
uint8_t cfg = 0x01;
HAL_I2C_Mem_Write(&hi2c1, DEV_ADDR, 0x6B, 1, &cfg, 1, 100);`
  },
  {
    id: 'spi-tx-rx',
    title: 'SPI 全双工读写',
    category: 'SPI',
    code: `uint8_t tx[] = { 0x9F };
uint8_t rx[3] = { 0 };

HAL_GPIO_WritePin(CS_GPIO_Port, CS_Pin, GPIO_PIN_RESET);
HAL_SPI_Transmit(&hspi1, tx, 1, 100);
HAL_SPI_Receive(&hspi1, rx, 3, 100);
HAL_GPIO_WritePin(CS_GPIO_Port, CS_Pin, GPIO_PIN_SET);`
  },
  {
    id: 'dwt-us',
    title: 'DWT 微秒级延时（替代 HAL_Delay）',
    category: '工具',
    note: '需要 Cortex-M3 及以上',
    code: `void DWT_Init(void) {
  CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
  DWT->CYCCNT = 0;
  DWT->CTRL  |= DWT_CTRL_CYCCNTENA_Msk;
}

void delay_us(uint32_t us) {
  uint32_t start = DWT->CYCCNT;
  uint32_t cycles = us * (SystemCoreClock / 1000000);
  while ((DWT->CYCCNT - start) < cycles);
}`
  },
  {
    id: 'hardfault-handler',
    title: 'HardFault 寄存器输出（救命用）',
    category: '调试',
    note: '直接覆盖默认 HardFault_Handler',
    code: `void hard_fault_dump(uint32_t *sp) {
  printf("R0  = 0x%08lx\\r\\n", sp[0]);
  printf("R1  = 0x%08lx\\r\\n", sp[1]);
  printf("R2  = 0x%08lx\\r\\n", sp[2]);
  printf("R3  = 0x%08lx\\r\\n", sp[3]);
  printf("R12 = 0x%08lx\\r\\n", sp[4]);
  printf("LR  = 0x%08lx\\r\\n", sp[5]);
  printf("PC  = 0x%08lx\\r\\n", sp[6]);
  printf("PSR = 0x%08lx\\r\\n", sp[7]);
  printf("CFSR= 0x%08lx\\r\\n", SCB->CFSR);
  printf("HFSR= 0x%08lx\\r\\n", SCB->HFSR);
  while (1);
}

__attribute__((naked)) void HardFault_Handler(void) {
  __asm volatile (
    "tst lr, #4         \\n"
    "ite eq             \\n"
    "mrseq r0, msp      \\n"
    "mrsne r0, psp      \\n"
    "b hard_fault_dump  \\n"
  );
}`
  },
  {
    id: 'freertos-task',
    title: 'FreeRTOS 任务骨架',
    category: 'RTOS',
    code: `void Task_LED(void *arg) {
  for (;;) {
    HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_13);
    osDelay(500);   // 500ms
  }
}

// 在 MX_FREERTOS_Init() 中创建：
osThreadAttr_t led_attr = { .name = "LED", .stack_size = 256 * 4, .priority = osPriorityNormal };
osThreadNew(Task_LED, NULL, &led_attr);`
  }
]
const snippetSearch = ref('')
const snippetCat = ref('All')
const snippetCategories = computed(() => {
  const cats = new Set(snippets.map(s => s.category))
  return [{ label: '全部分类', value: 'All' }, ...Array.from(cats).map(c => ({ label: c, value: c }))]
})
const filteredSnippets = computed(() => {
  const q = snippetSearch.value.trim().toLowerCase()
  return snippets.filter(s => {
    if (snippetCat.value !== 'All' && s.category !== snippetCat.value) return false
    if (!q) return true
    return s.title.toLowerCase().includes(q)
      || s.category.toLowerCase().includes(q)
      || s.code.toLowerCase().includes(q)
      || (s.note ?? '').toLowerCase().includes(q)
  })
})
async function copySnippet(s: Snippet) {
  try {
    await navigator.clipboard.writeText(s.code)
    msg.success(`已复制：${s.title}`)
  } catch {
    msg.error('复制失败')
  }
}

// ===== NVIC priority encoder =====
const nvicGroup = ref(4)  // matches HAL default
const nvicPreempt = ref(0)
const nvicSub = ref(0)
const nvicGroupOptions = [
  { label: 'GROUP_0 — 0 抢占 / 4 响应', value: 0 },
  { label: 'GROUP_1 — 1 抢占 / 3 响应', value: 1 },
  { label: 'GROUP_2 — 2 抢占 / 2 响应', value: 2 },
  { label: 'GROUP_3 — 3 抢占 / 1 响应', value: 3 },
  { label: 'GROUP_4 — 4 抢占 / 0 响应  (HAL 默认)', value: 4 }
]
const nvicPreemptBits = computed(() => nvicGroup.value)
const nvicSubBits = computed(() => 4 - nvicGroup.value)
const nvicMaxPreempt = computed(() => Math.max(0, Math.pow(2, nvicPreemptBits.value) - 1))
const nvicMaxSub = computed(() => Math.max(0, Math.pow(2, nvicSubBits.value) - 1))
const nvicEncoded = computed(() => {
  const p = Math.min(nvicPreempt.value, nvicMaxPreempt.value) << nvicSubBits.value
  const s = Math.min(nvicSub.value, nvicMaxSub.value)
  return (p | s) & 0xF
})

// ===== Clock tree calculator =====
const clkFamily = ref<'F1' | 'F4'>('F1')
const clkFamilyOptions = [
  { label: 'STM32F1xx (max 72MHz)', value: 'F1' },
  { label: 'STM32F4xx (max 168MHz)', value: 'F4' }
]
const clkHse = ref(8)
const clkPllMul = ref(9)   // F1: HSE × PLLMUL
const clkPllM = ref(8)     // F4: HSE/M
const clkPllN = ref(336)   // F4: VCO = HSE/M*N
const clkPllP = ref(2)     // F4: SYSCLK = VCO/P
const clkAhb = ref(1)
const clkApb1 = ref(2)
const clkApb2 = ref(1)
const ahbDivOptions = [1, 2, 4, 8, 16, 64, 128, 256, 512].map(v => ({ label: '/' + v, value: v }))
const apbDivOptions = [1, 2, 4, 8, 16].map(v => ({ label: '/' + v, value: v }))
const clkFamilyLabel = computed(() => clkFamily.value === 'F4' ? '基于 HSE → /M × N / P 三阶段 PLL' : '基于 HSE × PLLMUL')
const clkLimit = computed(() => clkFamily.value === 'F4' ? 168 : 72)
const clkVco = computed(() => clkFamily.value === 'F4' ? clkHse.value * 1e6 / clkPllM.value * clkPllN.value : 0)
const clkSysclk = computed(() => clkFamily.value === 'F4'
  ? clkVco.value / clkPllP.value
  : clkHse.value * 1e6 * clkPllMul.value
)
const clkSysOver = computed(() => clkSysclk.value > clkLimit.value * 1e6)
const clkHclk = computed(() => clkSysclk.value / clkAhb.value)
const clkApb1Hz = computed(() => clkHclk.value / clkApb1.value)
const clkApb2Hz = computed(() => clkHclk.value / clkApb2.value)
const clkApb1TimHz = computed(() => clkApb1.value === 1 ? clkApb1Hz.value : clkApb1Hz.value * 2)
const clkApb2TimHz = computed(() => clkApb2.value === 1 ? clkApb2Hz.value : clkApb2Hz.value * 2)
const clkFormulaHint = computed(() =>
  clkFamily.value === 'F4'
    ? `公式：VCO = HSE × N / M = ${clkHse.value} × ${clkPllN.value} / ${clkPllM.value}；SYSCLK = VCO / ${clkPllP.value}`
    : `公式：SYSCLK = HSE × PLLMUL = ${clkHse.value} × ${clkPllMul.value}`
)
function fmtMHz(hz: number): string {
  if (!isFinite(hz) || hz <= 0) return '—'
  const mhz = hz / 1e6
  return mhz >= 1 ? mhz.toFixed(3) + ' MHz' : (hz / 1000).toFixed(2) + ' kHz'
}

// ===== IEEE-754 float viewer =====
const fpDec = ref('3.14159')
const fpHex = ref('')
const fpBuf = new ArrayBuffer(4)
const fpF32 = new Float32Array(fpBuf)
const fpU32 = new Uint32Array(fpBuf)

const fpRaw = ref(0)
function syncFromDec() {
  const v = parseFloat(fpDec.value)
  if (!isFinite(v) && fpDec.value !== 'Infinity' && fpDec.value !== '-Infinity' && fpDec.value !== 'NaN') {
    fpRaw.value = 0
    return
  }
  fpF32[0] = v
  fpRaw.value = fpU32[0] >>> 0
  fpHex.value = '0x' + fpRaw.value.toString(16).toUpperCase().padStart(8, '0')
}
function syncFromHex() {
  const s = fpHex.value.trim().replace(/^0x/i, '')
  if (!s) { fpRaw.value = 0; fpDec.value = ''; return }
  const n = parseInt(s, 16)
  if (isNaN(n)) return
  fpRaw.value = n >>> 0
  fpU32[0] = fpRaw.value
  const v = fpF32[0]
  fpDec.value = Number.isFinite(v)
    ? (v.toString().length > 12 ? v.toPrecision(8) : v.toString())
    : String(v)
}
function onFpDecInput() { syncFromDec() }
function onFpHexInput() { syncFromHex() }
syncFromDec()  // initial

const fpBits = computed(() => {
  const v = fpRaw.value
  const arr: string[] = []
  for (let i = 31; i >= 0; i--) arr.push(((v >>> i) & 1).toString())
  return arr
})
function fpBitClass(idx: number) {
  if (idx === 0) return 'sign'
  if (idx >= 1 && idx <= 8) return 'exp'
  return 'mant'
}
function fpBitTitle(idx: number) {
  if (idx === 0) return '符号位 (S)'
  if (idx <= 8) return `指数位 e${8 - idx}`
  return `尾数位 m${22 - (idx - 9)}`
}
const fpInfo = computed(() => {
  const v = fpRaw.value
  const sign = (v >>> 31) & 1
  const expRaw = (v >>> 23) & 0xFF
  const mant = v & 0x7FFFFF
  const mantHex = mant.toString(16).toUpperCase().padStart(6, '0')
  let kind = '规格化'
  if (expRaw === 0 && mant === 0) kind = sign ? '负零' : '零'
  else if (expRaw === 0) kind = '非规格化 (subnormal)'
  else if (expRaw === 0xFF && mant === 0) kind = sign ? '−Infinity' : '+Infinity'
  else if (expRaw === 0xFF) kind = 'NaN'
  fpU32[0] = v
  const value = fpF32[0]
  return {
    sign,
    signLabel: sign ? '负' : '正',
    expRaw,
    exp: expRaw === 0 ? '−126 (denormal)' : expRaw === 0xFF ? '∞/NaN' : (expRaw - 127).toString(),
    mantHex,
    value: Number.isFinite(value) ? (Math.abs(value) < 1e-4 || Math.abs(value) > 1e8 ? value.toExponential(7) : value.toString()) : String(value),
    kind
  }
})
</script>

<style scoped>
.tb { display: flex; flex-direction: column; height: 100%; }
.hdr {
  padding: 22px 28px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.hdr h2 { margin: 0; font-weight: 650; font-size: 20px; color: var(--text-strong); letter-spacing: -0.01em; }
.hdr .sub { color: var(--text-muted); font-size: 12.5px; margin-left: 10px; }
.body { padding: 18px 28px 28px; flex: 1; overflow-y: auto; }

.grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
}
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 16px 18px;
}
.panel.full { grid-column: 1 / -1; }
.panel-hdr { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
.panel-hdr h3 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--text-strong); letter-spacing: 0.01em; }
.panel-sub { color: var(--text-muted); font-size: 12px; }

.conv {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 10px 12px;
  align-items: center;
  margin-bottom: 10px;
}
.conv label { font-size: 12px; color: var(--text-muted); }
.readout {
  font-family: var(--font-mono);
  color: var(--accent);
  font-weight: 600;
  padding: 4px 0;
}
.hint { font-size: 11px; color: var(--text-dim); }
.err { color: var(--error); font-size: 12px; }

.tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.tbl th, .tbl td { padding: 7px 8px; text-align: left; border-bottom: 1px solid var(--border-soft); }
.tbl th { color: var(--text-muted); font-weight: 500; }
.tbl td { color: var(--text); }
.mono { font-family: var(--font-mono); }

.bits { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.bit-row { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; }
.bit {
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: 4px;
  text-align: center;
  padding: 4px 0;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.bit:hover { background: var(--bg-active); }
.bit.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.bit-idx { font-size: 9px; color: var(--text-dim); }
.bit.on .bit-idx { color: #bfdcf5; }
.bit-v { font-size: 12px; font-weight: 700; }
.bit-out { font-size: 12px; margin-bottom: 10px; }
.bit-out div { padding: 2px 0; }
.bit-out b { color: var(--text-muted); margin-right: 8px; font-size: 11px; }

.ascii {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
  gap: 4px;
}
.a-cell {
  background: var(--bg-panel-2);
  border: 1px solid var(--border-soft);
  border-radius: 4px;
  padding: 4px 2px;
  text-align: center;
  font-size: 11px;
}
.a-code { color: var(--text-dim); font-size: 10px; }
.a-char { color: var(--text-strong); font-weight: 600; font-size: 14px; font-family: var(--font-mono); }
.a-hex { color: var(--accent); font-size: 10px; font-family: var(--font-mono); }

.accent { color: var(--accent); font-weight: 700; }

.cfsr-out {
  margin-top: 12px;
  padding: 10px;
  background: rgba(239,83,80,.06);
  border: 1px solid rgba(239,83,80,.3);
  border-radius: 6px;
}
.cfsr-row {
  display: grid;
  grid-template-columns: 70px 110px 1fr;
  gap: 10px;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--border-soft);
}
.cfsr-row:last-child { border: none; }
.cfsr-row b { color: #ef9a9a; }
.cfsr-name { color: var(--text-strong); font-weight: 600; }
.cfsr-desc { color: var(--text-muted); }

.snip-tools { display: flex; gap: 10px; margin-bottom: 14px; }
.snip-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 12px;
}
.snip-card {
  background: var(--bg-panel-2, #1e1f27);
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  padding: 12px 14px;
}
.snip-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 10px; }
.snip-title { font-size: 13px; font-weight: 600; color: var(--text-strong); }
.snip-tags { display: flex; gap: 6px; align-items: center; margin-top: 3px; flex-wrap: wrap; }
.snip-cat {
  font-size: 10.5px;
  background: rgba(59,130,246,.15);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}
.snip-note { font-size: 11px; color: var(--text-muted); }
.snip-code {
  background: #0c0d12;
  border: 1px solid var(--border);
  padding: 10px 12px;
  border-radius: 5px;
  margin: 0;
  overflow-x: auto;
  max-height: 240px;
}
.snip-code code {
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 11.5px;
  color: #d6d8e0;
  line-height: 1.55;
  white-space: pre;
}

.warn-mini { color: #ef5350; font-size: 10.5px; margin-left: 8px; }
.over { color: #ef5350; }

/* IEEE-754 viewer */
.fp-out { margin-top: 12px; }
.fp-bits {
  display: grid;
  grid-template-columns: repeat(32, 1fr);
  gap: 2px;
  margin-bottom: 6px;
}
.fp-bit {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 0;
  border-radius: 3px;
  border: 1px solid var(--border-soft);
  background: var(--bg-panel-2, #1e1f27);
  cursor: help;
}
.fp-bit.sign { background: rgba(239,83,80,.18); border-color: rgba(239,83,80,.4); color: #ef9a9a; }
.fp-bit.exp { background: rgba(102,187,106,.16); border-color: rgba(102,187,106,.35); color: #a5d6a7; }
.fp-bit.mant { background: rgba(59,130,246,.14); border-color: rgba(59,130,246,.3); color: #90cdf4; }
.fp-legend {
  display: flex; gap: 12px; font-size: 10.5px; margin-bottom: 10px;
  color: var(--text-muted);
}
.lg::before {
  content: ''; display: inline-block; width: 8px; height: 8px;
  border-radius: 2px; margin-right: 4px; vertical-align: middle;
}
.lg.sign::before { background: rgba(239,83,80,.55); }
.lg.exp::before { background: rgba(102,187,106,.55); }
.lg.mant::before { background: rgba(59,130,246,.55); }
</style>
