<template>
  <div class="sa">
    <!-- Top bar: connection -->
    <header class="sa-hdr">
      <div class="title">
        <h2>串口助手</h2>
        <span class="sub">{{ isOpen ? `已连接 ${openInfo?.path} @ ${openInfo?.baud}` : '未连接' }}</span>
        <n-button
          size="tiny" quaternary
          class="help-btn"
          @click="showHelp = true"
          title="打开使用教程"
        >❓ 帮助</n-button>
      </div>
      <div class="sa-stats">
        <span>📥 RX <b>{{ fmt(stats.rx) }}</b></span>
        <span>📤 TX <b>{{ fmt(stats.tx) }}</b></span>
        <span>📦 Frames <b>{{ stats.frames }}</b></span>
        <span class="err-stat">⚠ Err <b>{{ stats.errors }}</b></span>
        <span>⏱ {{ stats.rate.toFixed(0) }} B/s</span>
      </div>
    </header>

    <!-- Connection bar -->
    <div class="sa-conn">
      <n-select
        v-model:value="portPath"
        :options="portOptions"
        placeholder="选择串口"
        size="small"
        style="width: 220px"
      />
      <n-button size="small" quaternary @click="refreshPorts" title="刷新端口">🔄</n-button>
      <n-select v-model:value="baudRate" :options="baudOptions" size="small" style="width: 104px" title="常用波特率" />
      <n-input-number
        v-model:value="baudRate"
        size="small"
        :min="110"
        :max="12000000"
        :show-button="false"
        style="width: 104px"
        placeholder="自定义"
        title="自定义波特率"
      />
      <n-select v-model:value="dataBits" :options="dataBitsOptions" size="small" style="width: 72px" />
      <n-select v-model:value="parity" :options="parityOptions" size="small" style="width: 86px" />
      <n-select v-model:value="stopBits" :options="stopBitsOptions" size="small" style="width: 72px" />
      <n-checkbox v-model:checked="rtscts" size="small" :disabled="isOpen" title="硬件流控 RTS/CTS">RTS/CTS</n-checkbox>
      <n-button
        size="small"
        :type="isOpen ? 'error' : 'primary'"
        :loading="connecting"
        @click="toggleConn"
      >{{ isOpen ? '断开' : '打开' }}</n-button>

      <template v-if="isOpen">
        <n-divider vertical />
        <n-button
          size="tiny" :type="dtrOn ? 'primary' : 'default'" quaternary
          @click="toggleDTR" title="切换 DTR"
        >DTR {{ dtrOn ? '●' : '○' }}</n-button>
        <n-button
          size="tiny" :type="rtsOn ? 'primary' : 'default'" quaternary
          @click="toggleRTS" title="切换 RTS"
        >RTS {{ rtsOn ? '●' : '○' }}</n-button>
        <n-button size="tiny" quaternary @click="sendBreak" title="发送 BREAK 信号 (150ms)">BREAK</n-button>
      </template>
    </div>

    <!-- Body -->
    <div class="sa-body">
      <!-- Left: protocol editor -->
      <aside class="sa-side scroll-y">
        <div class="side-hdr">
          <div class="side-title">
            协议定义
            <n-popover trigger="click" placement="bottom-start" style="max-width: 360px">
              <template #trigger>
                <span class="help-dot" title="什么是协议？">❓</span>
              </template>
              <div class="help-pop">
                <p><b>协议</b> = 单片机通过串口发的二进制帧格式。本模块按协议自动解析每一帧并绘制波形。</p>
                <p>填好下面的 <b>帧头</b>、<b>帧长度</b>、<b>校验</b>、<b>字段定义</b>，在「📈 示波器」看到曲线就说明协议配好了。</p>
                <p><n-button size="tiny" quaternary @click="showHelp = true">打开完整教程 →</n-button></p>
              </div>
            </n-popover>
          </div>
          <n-space size="small">
            <n-button size="tiny" @click="store.addProtocol()">➕</n-button>
            <n-button size="tiny" quaternary @click="exportActive">导出</n-button>
            <n-button size="tiny" quaternary @click="showImport = true">导入</n-button>
          </n-space>
        </div>

        <n-select
          v-model:value="store.activeProtocolId"
          :options="protocolOptions"
          size="small"
          style="margin-bottom: 10px"
        />

        <div v-if="active" class="proto-edit">
          <div class="row">
            <label>名称</label>
            <n-input v-model:value="active.name" size="small" />
          </div>
          <div class="row">
            <label>启用</label>
            <n-switch v-model:value="active.enabled" size="small" />
          </div>

          <div class="sec-title">帧头 / 帧尾</div>
          <div class="row">
            <label title="HEX bytes 用空格分隔">帧头</label>
            <n-input :value="hexArr(active.header)" @update:value="v => active!.header = parseHex(v)" size="small" placeholder="AA 55" />
          </div>
          <div class="row">
            <label>帧尾</label>
            <n-input :value="hexArr(active.footer)" @update:value="v => active!.footer = parseHex(v)" size="small" placeholder="(可选) 0D 0A" />
          </div>

          <div class="sec-title">帧长度</div>
          <div class="row">
            <label>模式</label>
            <n-select
              v-model:value="active.lengthMode"
              :options="[{label:'固定长度',value:'fixed'},{label:'长度字段',value:'field'}]"
              size="small"
            />
          </div>
          <div class="row" v-if="active.lengthMode === 'fixed'">
            <label>总字节数</label>
            <n-input-number v-model:value="active.fixedLength" :min="1" :max="4096" size="small" />
          </div>
          <template v-else>
            <div class="row">
              <label>长度字段偏移</label>
              <n-input-number v-model:value="active.lengthFieldOffset" :min="0" :max="128" size="small" />
            </div>
            <div class="row">
              <label>长度字段大小</label>
              <n-select
                v-model:value="active.lengthFieldSize"
                :options="[{label:'1 字节',value:1},{label:'2 字节',value:2}]"
                size="small"
              />
            </div>
            <div class="row">
              <label>长度包含帧头</label>
              <n-switch v-model:value="active.lengthIncludesHeader" size="small" />
            </div>
            <div class="row">
              <label>长度包含自身</label>
              <n-switch v-model:value="active.lengthIncludesSelf" size="small" />
            </div>
          </template>

          <div class="sec-title">校验</div>
          <div class="row">
            <label>模式</label>
            <n-select
              v-model:value="active.checksumMode"
              :options="[
                {label:'无',value:'none'},
                {label:'SUM (累加和)',value:'sum'},
                {label:'XOR',value:'xor'},
                {label:'CRC-16 Modbus',value:'crc16-modbus'}
              ]"
              size="small"
            />
          </div>
          <template v-if="active.checksumMode !== 'none'">
            <div class="row">
              <label>校验字节偏移</label>
              <n-input-number v-model:value="active.checksumOffset" :min="0" size="small" />
            </div>
            <div class="row">
              <label>校验字节大小</label>
              <n-select
                v-model:value="active.checksumSize"
                :options="[{label:'1 字节',value:1},{label:'2 字节',value:2}]"
                size="small"
              />
            </div>
            <div class="row">
              <label>计算范围起</label>
              <n-input-number v-model:value="active.checksumRangeFrom" :min="0" size="small" />
            </div>
            <div class="row">
              <label title="负数表示距离帧尾的偏移；-1 表示校验字节之前">计算范围止</label>
              <n-input-number v-model:value="active.checksumRangeTo" size="small" />
            </div>
          </template>

          <div class="sec-title">
            <span class="sec-title-left">
              字段定义
              <n-popover trigger="click" placement="bottom-start" style="max-width: 380px">
                <template #trigger>
                  <span class="help-dot" title="每个输入框是做什么用的？">❓</span>
                </template>
                <div class="help-pop">
                  <p>一帧数据里的每个数值是一个 <b>字段</b>。下面每个卡片从上到下依次：</p>
                  <ul class="help-ul">
                    <li><b>色块 · 名称 · 👁 · ✕</b>：示波器颜色、显示名、是否画线、删除</li>
                    <li><b>offset</b>：此字段在帧里从第几个字节开始（0 = 第一个字节，通常跳过帧头）</li>
                    <li><b>uint8 / int16 / float32 …</b>：数据类型，决定占多少字节、怎么解读正负浮点</li>
                    <li><b>LE / BE</b>：多字节时的字节序；STM32 默认 <b>LE</b></li>
                    <li><b>scale · bias</b>：物理量换算 → 实际值 = 原值 × scale + bias（如 ×0.01 转 °C）</li>
                    <li><b>unit</b>：单位字符串，仅显示用</li>
                    <li><b>仅显示 Y 偏移 / 仅显示倍率</b>：在示波器上把这条曲线临时平移或放大，不改数值、不影响 CSV</li>
                  </ul>
                  <p><n-button size="tiny" quaternary @click="showHelp = true">查看完整示例 →</n-button></p>
                </div>
              </n-popover>
            </span>
            <n-button size="tiny" quaternary @click="addField">➕ 添加</n-button>
          </div>
          <div v-for="(f, i) in active.fields" :key="f.id" class="field-card">
            <div class="field-row">
              <input type="color" v-model="f.color" class="color-dot" title="示波器颜色" />
              <n-input v-model:value="f.name" size="small" placeholder="名称" style="flex:1" title="字段名（仅显示用）" />
              <n-switch v-model:value="f.visible" size="small" title="是否在示波器绘制这条曲线" />
              <n-button size="tiny" quaternary @click="active!.fields.splice(i,1)" title="删除此字段">✕</n-button>
            </div>
            <div class="field-grid">
              <n-input-number v-model:value="f.offset" :min="0" size="tiny" placeholder="offset"
                title="字节偏移：此字段从帧的第几个字节开始（0 = 帧首）" />
              <n-select v-model:value="f.type" :options="typeOptions" size="tiny"
                title="数据类型，决定占几个字节及正负/浮点解读" />
              <n-select
                v-model:value="f.endian"
                :options="[{label:'LE',value:'little'},{label:'BE',value:'big'}]"
                size="tiny"
                title="字节序：LE = 低字节在前（STM32 默认），BE = 高字节在前"
              />
              <n-input-number v-model:value="f.scale" size="tiny" placeholder="scale"
                title="缩放系数：实际值 = 原值 × scale + bias" />
              <n-input-number v-model:value="f.bias" size="tiny" placeholder="bias"
                title="偏置：实际值 = 原值 × scale + bias" />
              <n-input v-model:value="f.unit" size="tiny" placeholder="unit"
                title="单位字符串（如 °C / rpm），仅显示用" />
            </div>
            <div class="field-grid field-grid-plot">
              <n-input-number v-model:value="f.plotOffset" size="tiny" placeholder="仅显示 Y 偏移"
                title="把这条曲线在示波器上上下平移（仅显示，不改数值）" />
              <n-input-number v-model:value="f.plotGain" size="tiny" placeholder="仅显示倍率"
                title="把这条曲线在示波器上放大/缩小（仅显示，不改数值）" />
              <div class="plot-hint">仅影响示波器显示</div>
            </div>
          </div>
          <div v-if="!active.fields.length" class="hint-empty">点击 ➕ 添加字段</div>

          <div class="proto-foot">
            <n-button size="small" quaternary @click="store.duplicateProtocol(active.id)">📄 复制</n-button>
            <n-button size="small" type="error" quaternary @click="onRemoveActive">🗑 删除</n-button>
          </div>
        </div>
      </aside>

      <!-- Right: tabs -->
      <section class="sa-main">
        <n-tabs type="line" animated default-value="scope" v-model:value="activeTab" class="sa-tabs">
          <n-tab-pane name="scope" tab="📈 示波器">
            <div class="scope-toolbar">
              <n-button size="small" quaternary @click="store.scope.paused = !store.scope.paused">
                {{ store.scope.paused ? '▶ 继续' : '⏸ 暂停' }}
              </n-button>
              <n-button size="small" quaternary @click="clearScope">🧹 清空</n-button>
              <n-button size="small" quaternary @click="exportScopeCsv">⬇ CSV</n-button>
              <n-divider vertical />
              <label class="lbl">时间窗</label>
              <n-select
                v-model:value="store.scope.windowMs"
                :options="[
                  {label:'2s',value:2000},
                  {label:'5s',value:5000},
                  {label:'10s',value:10000},
                  {label:'30s',value:30000},
                  {label:'60s',value:60000}
                ]"
                size="small"
                style="width: 90px"
              />
              <n-divider vertical />
              <n-checkbox v-model:checked="store.scope.autoScale" size="small">自动量程</n-checkbox>
              <template v-if="!store.scope.autoScale">
                <n-input-number v-model:value="store.scope.yMin" size="small" style="width: 90px" />
                <n-input-number v-model:value="store.scope.yMax" size="small" style="width: 90px" />
              </template>
              <n-checkbox v-model:checked="store.scope.showStats" size="small">统计</n-checkbox>
              <div class="flex-spacer"></div>
            </div>
            <div class="legend-row">
              <span v-for="f in visibleFields" :key="f.id" class="leg">
                <span class="dot" :style="{ background: f.color }"></span>
                <b>{{ f.name }}</b><span v-if="f.unit" class="unit">（{{ f.unit }}）</span>
                <template v-if="store.scope.showStats">
                  <span class="leg-stat" :title="`last/min/max/avg, n=${getStats(f.id).n}`">
                    last <i>{{ fmtStat(getStats(f.id).last) }}</i>
                    · min <i>{{ fmtStat(getStats(f.id).min) }}</i>
                    · max <i>{{ fmtStat(getStats(f.id).max) }}</i>
                    · avg <i>{{ fmtStat(getStats(f.id).avg) }}</i>
                  </span>
                </template>
                <span v-if="(f.plotOffset ?? 0) || (f.plotGain ?? 1) !== 1" class="leg-transform">
                  [{{ ((f.plotGain ?? 1) !== 1 ? '×' + (f.plotGain ?? 1) : '') }}{{ (f.plotOffset ?? 0) ? ((f.plotOffset! >= 0 ? '+' : '') + f.plotOffset) : '' }}]
                </span>
              </span>
            </div>
            <div ref="scopeEl" class="scope-canvas"></div>
          </n-tab-pane>

          <n-tab-pane name="raw" tab="📜 原始数据">
            <div class="raw-toolbar">
              <n-radio-group v-model:value="rawView" size="small">
                <n-radio-button value="hex">HEX</n-radio-button>
                <n-radio-button value="text">ASCII</n-radio-button>
                <n-radio-button value="both">HEX+ASCII</n-radio-button>
              </n-radio-group>
              <n-select
                v-model:value="rawEncoding"
                :options="encodingOptions"
                size="small"
                style="width: 100px"
                :disabled="rawView === 'hex'"
              />
              <n-checkbox v-model:checked="rawShowTs" size="small">时间戳</n-checkbox>
              <n-checkbox v-model:checked="rawAutoScroll" size="small">自动滚动</n-checkbox>
              <n-button size="small" quaternary @click="pauseRaw = !pauseRaw">
                {{ pauseRaw ? '▶ 继续' : '⏸ 暂停' }}
              </n-button>
              <n-button size="small" quaternary @click="clearRaw">🧹 清空</n-button>
              <n-button size="small" quaternary @click="saveRaw">⬇ 保存</n-button>
              <n-input
                v-model:value="rawFilter"
                size="small"
                placeholder="🔎 过滤..."
                clearable
                style="width: 180px; margin-left: auto"
              />
            </div>
            <pre ref="rawEl" class="raw-view mono">{{ rawText }}</pre>
          </n-tab-pane>

          <n-tab-pane name="frames" tab="🧩 解析帧">
            <div class="frames-toolbar">
              <n-button size="small" quaternary @click="clearFrames">🧹 清空</n-button>
              <span class="hint">最近 {{ framesLen }} 帧（最多保留 {{ MAX_FRAMES }} 帧）</span>
            </div>
            <div class="frames-list scroll-y">
              <table class="ftbl">
                <thead>
                  <tr>
                    <th style="width:110px">时间</th>
                    <th>Raw</th>
                    <th>解析字段</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(fr, i) in framesReversed" :key="fr.id">
                    <td class="mono t">{{ fmtTs(fr.ts) }}</td>
                    <td class="mono raw-cell">{{ bytesToHex(fr.bytes) }}</td>
                    <td>
                      <div class="fields-inline">
                        <span v-for="fv in fr.values" :key="fv.name" class="fv">
                          <b :style="{ color: fv.color }">{{ fv.name }}</b>=<span class="mono">{{ fmtValue(fv.value) }}</span><span v-if="fv.unit" class="unit">{{ fv.unit }}</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr v-if="!framesLen"><td colspan="3" class="empty-cell">尚无已解析帧</td></tr>
                </tbody>
              </table>
            </div>
          </n-tab-pane>

          <n-tab-pane name="send" tab="✉ 发送">
            <div class="send-box">
              <n-radio-group v-model:value="sendMode" size="small">
                <n-radio-button value="text">文本</n-radio-button>
                <n-radio-button value="hex">HEX</n-radio-button>
              </n-radio-group>
              <div class="send-opts">
                <n-checkbox v-model:checked="sendAppendCR" size="small" :disabled="sendMode==='hex'">附加 \r</n-checkbox>
                <n-checkbox v-model:checked="sendAppendLF" size="small" :disabled="sendMode==='hex'">附加 \n</n-checkbox>
                <n-checkbox v-model:checked="periodicEnable" size="small">定时发送</n-checkbox>
                <n-input-number
                  v-if="periodicEnable"
                  v-model:value="periodicMs"
                  :min="10"
                  :max="60000"
                  size="small"
                  style="width: 110px"
                />
                <span v-if="periodicEnable" class="hint">ms</span>
                <div class="flex-spacer"></div>
                <n-button size="small" quaternary @click="sendText = ''">清空</n-button>
                <n-button size="small" quaternary @click="loadFromFile">📄 从文件…</n-button>
              </div>
              <n-input
                v-model:value="sendText"
                type="textarea"
                :autosize="{ minRows: 4, maxRows: 8 }"
                :placeholder="sendMode==='hex' ? '例如: AA 55 01 02 FF' : '要发送的文本'"
                @keydown.enter.ctrl="sendNow"
              />
              <div class="send-actions">
                <n-button type="primary" :disabled="!isOpen" @click="sendNow">发送 (Ctrl+Enter)</n-button>
                <n-button quaternary @click="showHistory = true">历史 ({{ sendHistory.length }})</n-button>
                <n-button
                  quaternary
                  @click="saveCurrentAsMacro"
                  :disabled="!sendText"
                  title="保存当前内容为宏"
                >★ 保存为宏</n-button>
              </div>

              <div class="macro-panel">
                <div class="macro-hdr">
                  <span class="macro-title">宏发送（{{ store.macros.length }}）</span>
                  <n-button size="tiny" quaternary @click="store.addMacro()">➕ 新增</n-button>
                </div>
                <div v-if="!store.macros.length" class="hint-empty">尚无宏，点击发送 ➕ 新增</div>
                <div v-else class="macro-grid">
                  <div v-for="m in store.macros" :key="m.id" class="macro-card">
                    <div class="macro-row">
                      <n-input v-model:value="m.name" size="small" placeholder="名称" style="flex:1" />
                      <n-radio-group v-model:value="m.mode" size="small">
                        <n-radio-button value="text">T</n-radio-button>
                        <n-radio-button value="hex">H</n-radio-button>
                      </n-radio-group>
                      <n-button size="tiny" quaternary @click="store.removeMacro(m.id)" title="删除">✕</n-button>
                    </div>
                    <n-input
                      v-model:value="m.content"
                      size="small"
                      type="textarea"
                      :autosize="{ minRows: 1, maxRows: 4 }"
                      :placeholder="m.mode === 'hex' ? 'AA 55 ...' : '内容'"
                    />
                    <div class="macro-row">
                      <n-checkbox v-model:checked="m.appendCR" size="small" :disabled="m.mode==='hex'">\r</n-checkbox>
                      <n-checkbox v-model:checked="m.appendLF" size="small" :disabled="m.mode==='hex'">\n</n-checkbox>
                      <div class="flex-spacer"></div>
                      <n-button size="tiny" quaternary @click="loadMacro(m)">⬅ 载入</n-button>
                      <n-button size="tiny" type="primary" :disabled="!isOpen" @click="sendMacro(m)">▶ 发送</n-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>
      </section>
    </div>

    <!-- Import modal -->
    <n-modal v-model:show="showImport" preset="card" title="导入协议 (JSON)" style="width: 520px">
      <n-input v-model:value="importText" type="textarea" :autosize="{ minRows: 10, maxRows: 18 }" placeholder='粘贴 JSON，例如 { "name":"...", "fields":[...] }' />
      <template #footer>
        <n-space justify="end">
          <n-button @click="showImport = false">取消</n-button>
          <n-button type="primary" @click="doImport">导入</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Send history modal -->
    <n-modal v-model:show="showHistory" preset="card" title="发送历史" style="width: 560px">
      <div v-if="!sendHistory.length" class="hint">暂无历史</div>
      <div v-else class="hist-list">
        <div v-for="(h, i) in sendHistory" :key="i" class="hist-item" @click="sendText = h; showHistory = false">
          <span class="mono">{{ h.length > 120 ? h.slice(0,120) + '…' : h }}</span>
        </div>
      </div>
    </n-modal>

    <!-- Help / tutorial modal -->
    <n-modal
      v-model:show="showHelp"
      preset="card"
      title="串口助手 · 使用教程"
      style="width: 780px; max-height: 86vh"
      :bordered="false"
      class="help-modal"
    >
      <n-tabs type="line" default-value="quickstart" animated>
        <n-tab-pane name="quickstart" tab="快速入门">
          <div class="help-body scroll-y">
            <h3>1. 接串口</h3>
            <p>顶部连接栏从左到右：<b>端口 · 🔄 刷新 · 波特率下拉 · 自定义波特率 · 数据位 · 校验 · 停止位 · RTS/CTS · 打开</b>。</p>
            <p>选好端口和波特率，点「打开」，状态栏出现 <code>已连接 COMx @ 波特率</code> 即成功。</p>

            <h3>2. 看数据</h3>
            <ul>
              <li><b>📈 示波器</b>：按「协议」解析出的每个字段画曲线。需要你先在左侧配好协议。</li>
              <li><b>📜 原始数据</b>：直接看收到的 HEX / ASCII 字节流，不需要协议也能看。</li>
              <li><b>🧩 解析帧</b>：成功解析的每一帧的时间戳、原始字节、字段值。</li>
            </ul>
            <p class="tip">💡 <b>如果协议还没配好</b>，先到「📜 原始数据」看到字节流，再按字节布局回左侧填协议。</p>

            <h3>3. 发数据</h3>
            <p>「✉ 发送」页：选 <b>文本 / HEX</b>、是否加 <code>\r \n</code>、点发送。常用内容可 <b>「★ 保存为宏」</b>，下次一键发。</p>

            <h3>4. 控制复位 / BOOT0</h3>
            <p>连接后，头部出现 <b>DTR / RTS / BREAK</b> 按钮。很多 USB-UART 用 DTR 控制 STM32 的 NRST、RTS 控制 BOOT0，可以直接点按钮切换。</p>
          </div>
        </n-tab-pane>

        <n-tab-pane name="protocol" tab="协议定义">
          <div class="help-body scroll-y">
            <p>「协议」= 单片机通过串口发的 <b>二进制帧格式</b>。定义完协议，本模块会自动从字节流里切出每一帧、做校验、拆出每个字段的数值。</p>

            <h3>帧头 / 帧尾</h3>
            <p>用空格分隔的 HEX，例如 <code>AA 55</code>。解析器从字节流里找到这串标志字节作为一帧的起点。帧尾可选（例如 <code>0D 0A</code>），填了就会额外做尾部校验。</p>

            <h3>帧长度模式</h3>
            <ul>
              <li><b>固定长度</b>：每一帧总字节数都相同（含帧头帧尾），填总字节数即可。</li>
              <li><b>长度字段</b>：帧里有一个字节（或 2 字节）写着本帧有多长。
                <ul>
                  <li><b>偏移</b>：长度字段在帧里的字节位置（0 = 第一个字节）</li>
                  <li><b>大小</b>：1 字节或 2 字节</li>
                  <li><b>长度包含帧头 / 自身</b>：告诉解析器你写的这个数字到底代表啥，不包含就自动补齐</li>
                </ul>
              </li>
            </ul>

            <h3>校验</h3>
            <p>保护数据不被干扰。勾了模式后：</p>
            <ul>
              <li><b>校验字节偏移</b>：校验和存放在帧里的位置</li>
              <li><b>校验字节大小</b>：1 或 2 字节</li>
              <li><b>计算范围起 / 止</b>：参与计算的字节范围。止可以写 <b>负数</b>：<code>-1</code> 表示到校验字节之前（最常用）。</li>
            </ul>

            <h3>典型例子</h3>
            <pre class="code-block">AA 55 | gyro_x_hi gyro_x_lo | gyro_y_hi gyro_y_lo | gyro_z_hi gyro_z_lo | SUM</pre>
            <ul>
              <li>帧头 <code>AA 55</code></li>
              <li>帧长度 = 固定 9 字节</li>
              <li>校验 = SUM，偏移 8，范围 0 → -1</li>
              <li>字段：gyro_x offset=2 int16 BE，gyro_y offset=4，gyro_z offset=6</li>
            </ul>
          </div>
        </n-tab-pane>

        <n-tab-pane name="fields" tab="字段定义">
          <div class="help-body scroll-y">
            <p>每个「字段」= 一帧里的 <b>一个数值</b>（一个传感器通道）。一帧可以有多个字段，按字节偏移排列。</p>

            <h3>第一行（名称行）</h3>
            <ul>
              <li><b>🎨 色块</b>：示波器上区分通道用</li>
              <li><b>名称</b>：字段名，仅显示用，例如 <code>gyro_x</code> / <code>温度</code></li>
              <li><b>开关</b>：是否在示波器上绘制这条曲线（关掉依然会解析，只是不画）</li>
              <li><b>✕</b>：删除本字段</li>
            </ul>

            <h3>第二行（数据解读）</h3>
            <ul>
              <li><b>offset</b>：此字段在帧里从第几个字节开始（<b>0 = 帧首</b>）。<br/>
                <span class="sub-hint">例如帧头 2 字节，第一个数据字段通常 offset=2。</span></li>
              <li><b>类型</b>：
                <ul>
                  <li><code>uint8 / int8</code>：1 字节，0~255 / -128~127</li>
                  <li><code>uint16 / int16</code>：2 字节</li>
                  <li><code>uint32 / int32</code>：4 字节</li>
                  <li><code>float32</code>：4 字节 IEEE 754 单精度浮点</li>
                  <li><code>float64</code>：8 字节双精度</li>
                </ul>
              </li>
              <li><b>LE / BE</b>：多字节时的字节序。
                <ul>
                  <li><b>LE</b>（little-endian，小端）：低字节在前，STM32 默认</li>
                  <li><b>BE</b>（big-endian，大端）：高字节在前，网络协议常用</li>
                </ul>
              </li>
              <li><b>scale · bias</b>：物理量换算。<br/>
                <span class="sub-hint">实际值 = 原值 × scale + bias。例：<code>raw=2500, scale=0.01</code> → <code>25.00</code>。</span></li>
              <li><b>unit</b>：单位字符串，图例和帧表显示用，例如 <code>°C / rpm / m/s</code>。</li>
            </ul>

            <h3>第三行（仅影响示波器显示）</h3>
            <p>这两个字段 <b>只改示波器视觉效果</b>，不影响真实数值、不影响 CSV 导出、不影响解析帧页。</p>
            <ul>
              <li><b>仅显示 Y 偏移</b>：把这条曲线上下平移。<br/>
                <span class="sub-hint">例：同时画温度 25 和压力 1013，压力数值太大盖住温度，给压力填 <code>-1000</code> 就能让两条曲线看着在同一区间。</span></li>
              <li><b>仅显示倍率</b>：把这条曲线整体放大/缩小。<br/>
                <span class="sub-hint">例：加速度 0.01 m/s² 这种小值在图上几乎看不见，填 <code>1000</code> 就能看清楚波形。</span></li>
            </ul>
            <p class="tip">💡 这就是屏幕上「0 − +」「0 − +」两个 0 的作用：<b>偏移、倍率</b>，默认 0 和 1 就是关闭。</p>
          </div>
        </n-tab-pane>

        <n-tab-pane name="scope" tab="示波器 / 原始 / 发送">
          <div class="help-body scroll-y">
            <h3>📈 示波器工具栏</h3>
            <ul>
              <li><b>⏸ 暂停 / ▶ 继续</b>：冻结绘制，但数据仍在后台接收</li>
              <li><b>🧹 清空</b>：清掉示波器上的历史点</li>
              <li><b>⬇ CSV</b>：导出当前时间窗内的数据（原值、不含 plot 偏移/倍率）</li>
              <li><b>时间窗</b>：显示最近几秒的数据</li>
              <li><b>自动量程</b>：Y 轴自动贴合数据；取消后手动填 yMin / yMax</li>
              <li><b>统计</b>：图例下方显示每通道 last / min / max / avg</li>
            </ul>

            <h3>📜 原始数据</h3>
            <ul>
              <li><b>HEX / ASCII / HEX+ASCII</b>：显示模式。不会 ASCII 显示不出来时试试 HEX。</li>
              <li><b>编码</b>：UTF-8 / GBK / Latin-1 / ASCII。国产开发板 printf 汉字常用 GBK。</li>
              <li><b>过滤</b>：只显示含关键字的行，不改变接收。</li>
              <li><b>⏸ 暂停</b>：冻结页面，后台仍接收。</li>
              <li><b>⬇ 保存</b>：导出当前缓冲到 <code>.txt</code>。</li>
            </ul>

            <h3>✉ 发送</h3>
            <ul>
              <li><b>文本 / HEX</b>：文本按字符发送（多字节会自动 UTF-8）；HEX 用空格分隔的 HEX。</li>
              <li><b>\r \n</b>：自动附加回车 / 换行（HEX 模式下失效）。</li>
              <li><b>定时发送</b>：按固定周期重复发送同一内容。</li>
              <li><b>Ctrl+Enter</b>：快捷发送。</li>
              <li><b>★ 保存为宏</b>：把当前内容存成宏，以后一键发送。</li>
              <li><b>宏面板</b>：每个宏可独立选 T/H、附加 \r\n、立刻发送或载入编辑框。</li>
            </ul>

            <h3>🔌 信号线（连接后显示）</h3>
            <ul>
              <li><b>DTR / RTS</b>：切换硬件信号电平。
                <span class="sub-hint">ESP32 / 很多 STM32 板用 DTR 控制 NRST、RTS 控制 BOOT0，做进入 ISP / 复位。</span></li>
              <li><b>BREAK</b>：发送 150ms 的 Break 信号（强制 TX 拉低），少数协议用来打断接收方。</li>
            </ul>
          </div>
        </n-tab-pane>
      </n-tabs>
      <template #footer>
        <n-space justify="end">
          <n-button type="primary" @click="showHelp = false">我知道了</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch, nextTick } from 'vue'
import {
  NSelect, NInput, NInputNumber, NButton, NSwitch, NCheckbox, NTabs, NTabPane,
  NRadioGroup, NRadioButton, NSpace, NDivider, NModal, NPopover, useMessage
} from 'naive-ui'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { api } from '@/api'
import { useSerialStore, type Protocol, type ProtocolField, type FieldType, type SendMacro } from '@/stores/serial'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer])

const msg = useMessage()
const store = useSerialStore()

// Low-frequency UI refresh tick. High-rate data mutates plain arrays; UI reads
// via computeds that depend on this ref, so we drive a single paint per 200ms
// instead of re-rendering on every byte.
const uiTick = shallowRef(0)

// ---------------- Connection ----------------
const portPath = ref<string | null>(store.lastPort)
const baudRate = ref<number>(store.lastBaud)
const dataBits = ref<5 | 6 | 7 | 8>(8)
const stopBits = ref<1 | 1.5 | 2>(1)
const parity = ref<'none' | 'even' | 'odd' | 'mark' | 'space'>('none')
const rtscts = ref(false)
const isOpen = ref(false)
const connecting = ref(false)
const openInfo = ref<{ path: string; baud: number } | null>(null)
const dtrOn = ref(true)   // most adapters default-asserted
const rtsOn = ref(true)

const portList = ref<{ path: string; manufacturer: string; friendlyName: string }[]>([])
const portOptions = computed(() => {
  if (!portList.value.length) {
    return [{ label: '无可用端口，点 🔄 刷新', value: null as any, disabled: true }]
  }
  return portList.value.map(p => ({
    label: `${p.path}${p.friendlyName ? '  ·  ' + p.friendlyName : (p.manufacturer ? '  ·  ' + p.manufacturer : '')}`,
    value: p.path
  }))
})

const baudOptions = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1500000, 3000000]
  .map(v => ({ label: String(v), value: v }))
const dataBitsOptions = [5, 6, 7, 8].map(v => ({ label: String(v), value: v }))
const stopBitsOptions = [
  { label: '1', value: 1 }, { label: '1.5', value: 1.5 }, { label: '2', value: 2 }
]
const parityOptions = [
  { label: 'None', value: 'none' },
  { label: 'Even', value: 'even' },
  { label: 'Odd', value: 'odd' },
  { label: 'Mark', value: 'mark' },
  { label: 'Space', value: 'space' }
]

async function refreshPorts() {
  const r = await api.serial.list()
  if (r.ok) {
    portList.value = r.ports
    if (!portPath.value && r.ports.length) portPath.value = r.ports[0].path
  } else {
    msg.error('枚举端口失败：' + (r.error || '未知'))
  }
}

async function toggleConn() {
  if (isOpen.value) {
    const r = await api.serial.close()
    if (!r.ok) msg.error(r.error || '关闭失败')
    return
  }
  if (!portPath.value) { msg.warning('请选择串口'); return }
  if (!Number.isFinite(baudRate.value) || baudRate.value <= 0) {
    msg.warning('波特率无效'); return
  }
  connecting.value = true
  const r = await api.serial.open({
    path: portPath.value,
    baudRate: baudRate.value,
    dataBits: dataBits.value,
    stopBits: stopBits.value,
    parity: parity.value,
    rtscts: rtscts.value
  })
  connecting.value = false
  if (!r.ok) { msg.error(r.error || '打开失败'); return }
  isOpen.value = true
  openInfo.value = { path: portPath.value, baud: baudRate.value }
  store.lastPort = portPath.value
  store.lastBaud = baudRate.value
  msg.success(`已连接 ${portPath.value}`)
  // Push stored signal state down to hardware so indicators match reality.
  api.serial.setSignals({ dtr: dtrOn.value, rts: rtsOn.value }).catch(() => {})
}

async function toggleDTR() {
  dtrOn.value = !dtrOn.value
  const r = await api.serial.setSignals({ dtr: dtrOn.value })
  if (!r.ok) { msg.error(r.error || 'DTR 失败'); dtrOn.value = !dtrOn.value }
}
async function toggleRTS() {
  rtsOn.value = !rtsOn.value
  const r = await api.serial.setSignals({ rts: rtsOn.value })
  if (!r.ok) { msg.error(r.error || 'RTS 失败'); rtsOn.value = !rtsOn.value }
}
async function sendBreak() {
  const r1 = await api.serial.setSignals({ brk: true })
  if (!r1.ok) { msg.error(r1.error || 'BREAK 失败'); return }
  setTimeout(() => { api.serial.setSignals({ brk: false }).catch(() => {}) }, 150)
}

// ---------------- Stats ----------------
const stats = ref({ rx: 0, tx: 0, frames: 0, errors: 0, rate: 0 })
let bytesWindow: { ts: number; n: number }[] = []

function fmt(n: number) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}

// ---------------- Protocol Editor ----------------
const active = computed<Protocol | null>(() =>
  store.protocols.find(p => p.id === store.activeProtocolId) ?? null
)
const protocolOptions = computed(() =>
  store.protocols.map(p => ({ label: p.name + (p.enabled ? '' : ' (禁用)'), value: p.id }))
)
const typeOptions: { label: string; value: FieldType }[] = [
  { label: 'uint8', value: 'uint8' }, { label: 'int8', value: 'int8' },
  { label: 'uint16', value: 'uint16' }, { label: 'int16', value: 'int16' },
  { label: 'uint32', value: 'uint32' }, { label: 'int32', value: 'int32' },
  { label: 'float32', value: 'float32' }, { label: 'float64', value: 'float64' }
]

const COLORS = ['#4fc3f7', '#ff7043', '#81c784', '#ba68c8', '#ffd54f', '#4db6ac', '#f06292', '#9fa8da']

function addField() {
  if (!active.value) return
  const color = COLORS[active.value.fields.length % COLORS.length]
  active.value.fields.push({
    id: Math.random().toString(36).slice(2, 10),
    name: `ch${active.value.fields.length + 1}`,
    offset: active.value.fields.length ? active.value.fields[active.value.fields.length - 1].offset + 2 : 2,
    type: 'int16',
    endian: 'little',
    scale: 1,
    bias: 0,
    unit: '',
    color,
    visible: true
  })
}

function onRemoveActive() {
  if (!active.value) return
  if (!confirm(`删除协议 "${active.value.name}"？`)) return
  store.removeProtocol(active.value.id)
}

const showImport = ref(false)
const importText = ref('')
const showHelp = ref(false)
function exportActive() {
  if (!active.value) return
  try {
    navigator.clipboard.writeText(JSON.stringify(active.value, null, 2))
    msg.success('已复制到剪贴板')
  } catch { msg.error('复制失败') }
}
function doImport() {
  try {
    store.importProtocolsFromJson(importText.value)
    showImport.value = false
    importText.value = ''
    msg.success('已导入')
  } catch (e: any) { msg.error('解析失败：' + (e?.message || '')) }
}

const visibleFields = computed(() => active.value?.fields.filter(f => f.visible) ?? [])

// ---------------- Hex helpers ----------------
function hexArr(arr: number[]) {
  return arr.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}
function parseHex(s: string): number[] {
  return s.trim().split(/[\s,]+/).filter(Boolean).map(tok => {
    const n = parseInt(tok, 16)
    return isNaN(n) ? 0 : (n & 0xff)
  })
}
function bytesToHex(arr: number[]) {
  return arr.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}
function bytesToAscii(arr: number[]) {
  return arr.map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('')
}

// ---------------- Parser ----------------
interface Frame {
  id: number
  ts: number
  bytes: number[]
  values: { name: string; value: number; unit: string; color: string }[]
}

const MAX_FRAMES = 500
// Plain non-reactive array; high-rate pushes would thrash Vue's deep proxy.
// UI reads via a uiTick-gated computed so we repaint at most ~5 Hz.
const framesRaw: Frame[] = []
const framesReversed = computed<Frame[]>(() => {
  void uiTick.value
  return framesRaw.slice(-80).reverse()
})
const framesLen = computed(() => { void uiTick.value; return framesRaw.length })
let frameIdSeq = 0

let rxBuf: number[] = []

function decodeField(bytes: number[], f: ProtocolField): number | null {
  const size = (() => {
    switch (f.type) {
      case 'uint8': case 'int8': return 1
      case 'uint16': case 'int16': return 2
      case 'uint32': case 'int32': case 'float32': return 4
      case 'float64': return 8
    }
  })()
  if (f.offset + size > bytes.length) return null
  const ab = new ArrayBuffer(size)
  const u8 = new Uint8Array(ab)
  for (let i = 0; i < size; i++) u8[i] = bytes[f.offset + i]
  const dv = new DataView(ab)
  const le = f.endian === 'little'
  let raw = 0
  switch (f.type) {
    case 'uint8': raw = dv.getUint8(0); break
    case 'int8': raw = dv.getInt8(0); break
    case 'uint16': raw = dv.getUint16(0, le); break
    case 'int16': raw = dv.getInt16(0, le); break
    case 'uint32': raw = dv.getUint32(0, le); break
    case 'int32': raw = dv.getInt32(0, le); break
    case 'float32': raw = dv.getFloat32(0, le); break
    case 'float64': raw = dv.getFloat64(0, le); break
  }
  const scale = Number.isFinite(f.scale) && f.scale !== 0 ? f.scale : 1
  const bias = Number.isFinite(f.bias) ? f.bias : 0
  return raw * scale + bias
}

function computeChecksum(bytes: number[], mode: string, from: number, to: number): number {
  const lo = Math.max(0, from)
  const hi = to < 0 ? bytes.length + to : Math.min(bytes.length, to)
  if (hi <= lo) return 0
  if (mode === 'sum') {
    let s = 0
    for (let i = lo; i < hi; i++) s = (s + bytes[i]) & 0xffff
    return s
  }
  if (mode === 'xor') {
    let s = 0
    for (let i = lo; i < hi; i++) s ^= bytes[i]
    return s & 0xff
  }
  if (mode === 'crc16-modbus') {
    let crc = 0xffff
    for (let i = lo; i < hi; i++) {
      crc ^= bytes[i]
      for (let b = 0; b < 8; b++) {
        crc = (crc & 1) ? ((crc >>> 1) ^ 0xa001) : (crc >>> 1)
      }
    }
    return crc & 0xffff
  }
  return 0
}

function findHeader(start: number, header: number[]): number {
  if (!header.length) return start
  outer: for (let i = start; i <= rxBuf.length - header.length; i++) {
    for (let j = 0; j < header.length; j++) {
      if (rxBuf[i + j] !== header[j]) continue outer
    }
    return i
  }
  return -1
}

function tryParse(proto: Protocol) {
  if (!proto.enabled) { rxBuf = []; return }

  // limit buffer growth
  if (rxBuf.length > 64 * 1024) rxBuf.splice(0, rxBuf.length - 8192)

  while (true) {
    // 1. sync to header
    let start = 0
    if (proto.header.length) {
      start = findHeader(0, proto.header)
      if (start < 0) {
        // keep last (header.length - 1) bytes to allow partial match
        if (rxBuf.length > proto.header.length) rxBuf.splice(0, rxBuf.length - (proto.header.length - 1))
        return
      }
      if (start > 0) { rxBuf.splice(0, start); start = 0 }
    }

    // 2. determine length
    let total = 0
    if (proto.lengthMode === 'fixed') {
      total = Math.max(1, proto.fixedLength)
    } else {
      const off = proto.lengthFieldOffset
      if (rxBuf.length < off + proto.lengthFieldSize) return
      let lenVal = 0
      if (proto.lengthFieldSize === 1) lenVal = rxBuf[off] & 0xff
      else lenVal = (rxBuf[off] | (rxBuf[off + 1] << 8)) & 0xffff
      total = lenVal
      if (!proto.lengthIncludesHeader) total += proto.header.length
      if (!proto.lengthIncludesSelf) total += proto.lengthFieldSize
      // also add footer if not included
      if (proto.footer.length && total < off + proto.lengthFieldSize + proto.footer.length) {
        total += proto.footer.length
      }
    }
    if (total <= 0 || total > 4096) { rxBuf.shift(); stats.value.errors++; continue }
    if (rxBuf.length < total) return

    const frame = rxBuf.slice(0, total)

    // 3. footer check
    if (proto.footer.length) {
      let ok = true
      for (let i = 0; i < proto.footer.length; i++) {
        if (frame[frame.length - proto.footer.length + i] !== proto.footer[i]) { ok = false; break }
      }
      if (!ok) { rxBuf.shift(); stats.value.errors++; continue }
    }

    // 4. checksum check
    if (proto.checksumMode !== 'none') {
      const expected = computeChecksum(frame, proto.checksumMode, proto.checksumRangeFrom, proto.checksumRangeTo)
      let got = 0
      if (proto.checksumSize === 1) {
        got = frame[proto.checksumOffset] & 0xff
      } else {
        got = (frame[proto.checksumOffset] | (frame[proto.checksumOffset + 1] << 8)) & 0xffff
      }
      if (expected !== got) { rxBuf.shift(); stats.value.errors++; continue }
    }

    // 5. decode fields
    const values: Frame['values'] = []
    for (const f of proto.fields) {
      const v = decodeField(frame, f)
      if (v === null) continue
      values.push({ name: f.name, value: v, unit: f.unit, color: f.color })
    }

    const fr: Frame = { id: ++frameIdSeq, ts: Date.now(), bytes: frame, values }
    framesRaw.push(fr)
    if (framesRaw.length > MAX_FRAMES) framesRaw.splice(0, framesRaw.length - MAX_FRAMES)
    stats.value.frames++

    // feed scope series
    if (!store.scope.paused) {
      for (const fv of values) {
        const field = proto.fields.find(ff => ff.name === fv.name)
        if (!field || !field.visible) continue
        appendPoint(field.id, fr.ts, fv.value)
      }
    }

    rxBuf.splice(0, total)
  }
}

// ---------------- Scope ----------------
const scopeEl = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let scopeResizeObs: ResizeObserver | null = null
// Plain ring-ish buffers. Kept non-reactive (large high-frequency writes
// would wreck Vue's proxy) and sliced into ECharts on render tick.
const series = new Map<string, { ts: number[]; v: number[] }>()
// Field-order signature last pushed to echarts, so we only rebuild the
// series skeleton (expensive) when channels come/go, not every tick.
let lastSeriesSig = ''

interface ChStat { last: number; min: number; max: number; avg: number; n: number }
const statsByField = new Map<string, ChStat>()

function appendPoint(fieldId: string, ts: number, v: number) {
  let s = series.get(fieldId)
  if (!s) { s = { ts: [], v: [] }; series.set(fieldId, s) }
  s.ts.push(ts)
  s.v.push(v)
  const cap = store.scope.maxPoints
  if (s.ts.length > cap) { s.ts.splice(0, s.ts.length - cap); s.v.splice(0, s.v.length - cap) }
}

function clearScope() {
  series.clear()
  statsByField.clear()
  lastSeriesSig = ''
  renderScope(true)
  triggerRef(uiTick)
}

// First index where ts[i] >= target. ts is monotonic non-decreasing.
function firstIdxAtOrAfter(tsArr: number[], target: number): number {
  let lo = 0, hi = tsArr.length
  while (lo < hi) {
    const m = (lo + hi) >>> 1
    if (tsArr[m] < target) lo = m + 1
    else hi = m
  }
  return lo
}

function setupScope() {
  if (!scopeEl.value) return
  chart = echarts.init(scopeEl.value, undefined, { renderer: 'canvas' })
  chart.setOption({
    animation: false,
    backgroundColor: 'transparent',
    grid: { left: 60, right: 30, top: 16, bottom: 36, containLabel: false },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      valueFormatter: (v: any) => typeof v === 'number' ? v.toFixed(3) : String(v),
      backgroundColor: '#181920',
      borderColor: '#262832',
      textStyle: { color: '#e7e8ef', fontSize: 11 }
    },
    xAxis: {
      type: 'time',
      axisLabel: { color: '#9395a2', fontSize: 10 },
      axisLine: { lineStyle: { color: '#262832' } },
      splitLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.04)' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#9395a2', fontSize: 10 },
      axisLine: { lineStyle: { color: '#262832' } },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      scale: true
    },
    series: []
  })
  scopeResizeObs = new ResizeObserver(() => chart?.resize())
  scopeResizeObs.observe(scopeEl.value)
}

function renderScope(_force = false) {
  if (!chart || !active.value) return
  const now = Date.now()
  const win = store.scope.windowMs
  const from = now - win
  const showStats = store.scope.showStats

  const visible = active.value.fields.filter(f => f.visible)
  const sig = visible.map(f => f.id + ':' + f.color + ':' + f.name).join('|')
  const skeletonChanged = sig !== lastSeriesSig

  const dataArr: any[] = []

  for (const f of visible) {
    const s = series.get(f.id)
    const off = f.plotOffset ?? 0
    const gain = f.plotGain ?? 1
    const points: [number, number][] = []
    let last = NaN, min = Infinity, max = -Infinity, sum = 0, n = 0
    if (s && s.ts.length) {
      // window slice
      const i0 = firstIdxAtOrAfter(s.ts, from)
      for (let i = i0; i < s.ts.length; i++) {
        const raw = s.v[i]
        const disp = raw * gain + off
        points.push([s.ts[i], disp])
        if (raw < min) min = raw
        if (raw > max) max = raw
        sum += raw
        n++
        last = raw
      }
    }
    dataArr.push(points)
    if (showStats) {
      if (!n) { statsByField.set(f.id, { last: NaN, min: NaN, max: NaN, avg: NaN, n: 0 }) }
      else statsByField.set(f.id, { last, min, max, avg: sum / n, n })
    }
  }

  if (skeletonChanged) {
    const seriesDef = visible.map((f, i) => ({
      name: f.name,
      type: 'line',
      showSymbol: false,
      smooth: false,
      sampling: 'lttb',
      animation: false,
      progressive: 0,
      lineStyle: { width: 1.5, color: f.color },
      itemStyle: { color: f.color },
      data: dataArr[i]
    }))
    const opt: any = {
      xAxis: { min: from, max: now },
      series: seriesDef
    }
    if (!store.scope.autoScale) {
      opt.yAxis = { min: store.scope.yMin, max: store.scope.yMax }
    } else {
      opt.yAxis = { min: null, max: null, scale: true }
    }
    chart.setOption(opt, { replaceMerge: ['series'] })
    lastSeriesSig = sig
  } else {
    // Hot path: only axis window + per-series data, no merge thrash.
    const opt: any = {
      xAxis: { min: from, max: now },
      series: visible.map((_f, i) => ({ data: dataArr[i] }))
    }
    if (!store.scope.autoScale) {
      opt.yAxis = { min: store.scope.yMin, max: store.scope.yMax }
    } else {
      opt.yAxis = { min: null, max: null, scale: true }
    }
    chart.setOption(opt)
  }
}

function getStats(fieldId: string): ChStat {
  return statsByField.get(fieldId) ?? { last: NaN, min: NaN, max: NaN, avg: NaN, n: 0 }
}
function fmtStat(v: number) {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.01)) return v.toExponential(2)
  return v.toFixed(3)
}

let renderTimer: number | null = null
let uiTimer: number | null = null
function startRenderLoop() {
  if (renderTimer === null) {
    renderTimer = window.setInterval(() => {
      if (!store.scope.paused) renderScope()
      const now = Date.now()
      bytesWindow = bytesWindow.filter(w => now - w.ts < 1000)
      let totalInWindow = 0
      for (const w of bytesWindow) totalInWindow += w.n
      stats.value.rate = totalInWindow
    }, 100)
  }
  // Repaint frames / raw tabs / legend stats at 4 Hz regardless of chart tab;
  // this is what frees us from reactive deep-tracking on framesRaw/rawLinesRaw.
  if (uiTimer === null) {
    uiTimer = window.setInterval(() => {
      triggerRef(uiTick)
      if (activeTab.value === 'raw' && rawAutoScroll.value && rawEl.value) {
        rawEl.value.scrollTop = rawEl.value.scrollHeight
      }
    }, 250)
  }
}
function stopRenderLoop() {
  if (renderTimer !== null) { clearInterval(renderTimer); renderTimer = null }
  if (uiTimer !== null) { clearInterval(uiTimer); uiTimer = null }
}

function exportScopeCsv() {
  if (!active.value) return
  const visible = active.value.fields.filter(f => f.visible)
  if (!visible.length) return msg.warning('无可见字段')
  const now = Date.now()
  const from = now - store.scope.windowMs
  const tsSet = new Set<number>()
  for (const f of visible) {
    const s = series.get(f.id)
    if (!s) continue
    for (const t of s.ts) if (t >= from) tsSet.add(t)
  }
  const tsArr = Array.from(tsSet).sort()
  const header = ['timestamp_ms', ...visible.map(f => `${f.name}${f.unit ? '(' + f.unit + ')' : ''}`)]
  const lines = [header.join(',')]
  for (const t of tsArr) {
    const row: (string | number)[] = [t]
    for (const f of visible) {
      const s = series.get(f.id)
      if (!s) { row.push(''); continue }
      const idx = s.ts.indexOf(t)
      row.push(idx >= 0 ? s.v[idx] : '')
    }
    lines.push(row.join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `scope-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------- Raw view ----------------
const rawView = ref<'hex' | 'text' | 'both'>('both')
const rawShowTs = ref(true)
const rawAutoScroll = ref(true)
const pauseRaw = ref(false)
const rawFilter = ref('')
const rawEncoding = ref<'utf-8' | 'gbk' | 'latin1' | 'ascii'>('utf-8')
const encodingOptions = [
  { label: 'UTF-8', value: 'utf-8' },
  { label: 'GBK',   value: 'gbk' },
  { label: 'Latin-1', value: 'latin1' },
  { label: 'ASCII(7bit)', value: 'ascii' }
]

// Non-reactive buffer; UI reads via uiTick-gated computed to throttle repaints.
const rawLinesRaw: string[] = []
const MAX_RAW_LINES = 500
const rawEl = ref<HTMLElement | null>(null)
const rawText = computed(() => {
  void uiTick.value
  const q = rawFilter.value.trim().toLowerCase()
  if (!q) return rawLinesRaw.join('\n')
  const out: string[] = []
  for (const l of rawLinesRaw) if (l.toLowerCase().includes(q)) out.push(l)
  return out.join('\n')
})

function decodeBytesToString(bytes: number[]): string {
  try {
    if (rawEncoding.value === 'ascii') return bytesToAscii(bytes)
    if (rawEncoding.value === 'latin1') {
      let s = ''
      for (const b of bytes) s += String.fromCharCode(b & 0xff)
      return s
    }
    const u8 = new Uint8Array(bytes)
    const dec = new TextDecoder(rawEncoding.value, { fatal: false })
    return dec.decode(u8).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '·')
  } catch { return bytesToAscii(bytes) }
}

function fmtTs(ts: number) {
  const d = new Date(ts)
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

function appendRaw(bytes: number[], ts: number) {
  if (pauseRaw.value) return
  const tsStr = rawShowTs.value ? `[${fmtTs(ts)}] ` : ''
  let body = ''
  if (rawView.value === 'hex') body = bytesToHex(bytes)
  else if (rawView.value === 'text') body = decodeBytesToString(bytes)
  else body = `${bytesToHex(bytes)}   |   ${decodeBytesToString(bytes)}`
  rawLinesRaw.push(tsStr + body)
  if (rawLinesRaw.length > MAX_RAW_LINES) rawLinesRaw.splice(0, rawLinesRaw.length - MAX_RAW_LINES)
}

function clearRaw() { rawLinesRaw.length = 0; triggerRef(uiTick) }
function clearFrames() { framesRaw.length = 0; triggerRef(uiTick) }
function saveRaw() {
  const blob = new Blob([rawLinesRaw.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `serial-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------- Send ----------------
const sendMode = ref<'text' | 'hex'>('text')
const sendText = ref('')
const sendAppendCR = ref(false)
const sendAppendLF = ref(true)
const periodicEnable = ref(false)
const periodicMs = ref(1000)
const sendHistory = ref<string[]>([])
const showHistory = ref(false)
let periodicTimer: number | null = null

function buildPayload(): number[] {
  if (sendMode.value === 'hex') return parseHex(sendText.value)
  const text = sendText.value
  const out: number[] = []
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code < 256) out.push(code)
    else {
      // encode multi-byte as UTF-8
      const u8 = new TextEncoder().encode(ch)
      for (const b of u8) out.push(b)
    }
  }
  if (sendAppendCR.value) out.push(0x0d)
  if (sendAppendLF.value) out.push(0x0a)
  return out
}

async function sendNow() {
  if (!isOpen.value) { msg.warning('请先打开串口'); return }
  const bytes = buildPayload()
  if (!bytes.length) return
  const r = await api.serial.write(bytes)
  if (!r.ok) { msg.error(r.error || '发送失败'); return }
  stats.value.tx += bytes.length
  if (sendText.value && !sendHistory.value.includes(sendText.value)) {
    sendHistory.value.unshift(sendText.value)
    if (sendHistory.value.length > 30) sendHistory.value.length = 30
  }
}

function buildMacroPayload(m: SendMacro): number[] {
  if (m.mode === 'hex') return parseHex(m.content)
  const out: number[] = []
  for (const ch of m.content) {
    const code = ch.charCodeAt(0)
    if (code < 256) out.push(code)
    else {
      const u8 = new TextEncoder().encode(ch)
      for (const b of u8) out.push(b)
    }
  }
  if (m.appendCR) out.push(0x0d)
  if (m.appendLF) out.push(0x0a)
  return out
}

async function sendMacro(m: SendMacro) {
  if (!isOpen.value) { msg.warning('请先打开串口'); return }
  const bytes = buildMacroPayload(m)
  if (!bytes.length) return
  const r = await api.serial.write(bytes)
  if (!r.ok) { msg.error(r.error || '发送失败'); return }
  stats.value.tx += bytes.length
}
function loadMacro(m: SendMacro) {
  sendMode.value = m.mode
  sendText.value = m.content
  sendAppendCR.value = m.appendCR
  sendAppendLF.value = m.appendLF
}
function saveCurrentAsMacro() {
  if (!sendText.value.trim()) return
  store.macros.push({
    id: Math.random().toString(36).slice(2, 10),
    name: sendText.value.slice(0, 12) || '宏',
    mode: sendMode.value,
    content: sendText.value,
    appendCR: sendAppendCR.value,
    appendLF: sendAppendLF.value
  })
  msg.success('已保存为宏')
}

watch(periodicEnable, on => {
  if (periodicTimer !== null) { clearInterval(periodicTimer); periodicTimer = null }
  if (on) {
    periodicTimer = window.setInterval(() => {
      if (isOpen.value) sendNow()
    }, Math.max(10, periodicMs.value))
  }
})
watch(periodicMs, () => {
  if (periodicEnable.value) {
    if (periodicTimer !== null) clearInterval(periodicTimer)
    periodicTimer = window.setInterval(() => {
      if (isOpen.value) sendNow()
    }, Math.max(10, periodicMs.value))
  }
})

async function loadFromFile() {
  // Pick a file via browser; read as text (for hex) or binary
  const input = document.createElement('input')
  input.type = 'file'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    if (sendMode.value === 'hex') {
      sendText.value = await file.text()
    } else {
      sendText.value = await file.text()
    }
  }
  input.click()
}

function fmtValue(v: number) {
  if (!Number.isFinite(v)) return String(v)
  if (Number.isInteger(v)) return v.toString()
  return v.toFixed(4)
}

// ---------------- Wiring ----------------
const activeTab = ref('scope')
let offData: (() => void) | null = null
let offError: (() => void) | null = null
let offClosed: (() => void) | null = null

function handleData(payload: { bytes: number[]; ts: number }) {
  const { bytes, ts } = payload
  const n = bytes.length
  stats.value.rx += n
  bytesWindow.push({ ts: Date.now(), n })

  appendRaw(bytes, ts)

  if (active.value && active.value.enabled) {
    // Manual loop is faster than a spread-push for large chunks.
    for (let i = 0; i < n; i++) rxBuf.push(bytes[i])
    tryParse(active.value)
  } else {
    rxBuf.length = 0
  }
}

onMounted(async () => {
  setupScope()
  startRenderLoop()
  await refreshPorts()
  const st = await api.serial.status()
  isOpen.value = st.isOpen
  if (st.isOpen && st.path) {
    openInfo.value = { path: st.path, baud: st.baudRate ?? 0 }
  }

  offData = api.on('serial:data', (p: any) => handleData(p))
  offError = api.on('serial:error', (p: any) => msg.error('串口错误：' + (p?.message || '')))
  offClosed = api.on('serial:closed', () => {
    isOpen.value = false
    openInfo.value = null
    msg.info('串口已断开')
  })
})

onBeforeUnmount(() => {
  offData?.(); offError?.(); offClosed?.()
  stopRenderLoop()
  if (periodicTimer !== null) clearInterval(periodicTimer)
  scopeResizeObs?.disconnect()
  scopeResizeObs = null
  chart?.dispose()
  chart = null
})

// resize chart when switching to scope tab
watch(activeTab, v => {
  if (v === 'scope') nextTick(() => chart?.resize())
})

// reset parser buffer & re-layout chart skeleton when active protocol changes
watch(() => store.activeProtocolId, () => { rxBuf = []; lastSeriesSig = '' })
// field add/remove/visibility/color rename -> rebuild skeleton on next tick
watch(
  () => active.value?.fields.map(f => f.id + ':' + f.visible + ':' + f.color + ':' + f.name).join('|'),
  () => { lastSeriesSig = '' }
)
</script>

<style scoped>
.sa { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.sa-hdr {
  padding: 18px 24px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 12px;
}
.sa-hdr h2 { margin: 0; font-weight: 650; font-size: 20px; color: var(--text-strong); }
.sa-hdr .sub { color: var(--text-muted); font-size: 12.5px; margin-left: 10px; }
.sa-stats {
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.sa-stats b { color: var(--text-strong); font-weight: 600; }
.err-stat b { color: #ef5350 !important; }

.sa-conn {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-panel);
  flex-wrap: wrap;
}

.sa-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.sa-side {
  width: 300px;
  border-right: 1px solid var(--border);
  padding: 14px 14px 20px;
  overflow-y: auto;
  flex-shrink: 0;
  background: var(--bg-panel);
}
.side-hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.side-title { font-size: 13px; font-weight: 600; color: var(--text-strong); }
.proto-edit { display: flex; flex-direction: column; gap: 8px; }
.proto-edit .row {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px;
  align-items: center;
}
.proto-edit .row label { font-size: 11.5px; color: var(--text-muted); }
.sec-title {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-soft);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.field-card {
  background: var(--bg-panel-2, #1e1f27);
  border: 1px solid var(--border-soft, #262832);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-row { display: flex; gap: 6px; align-items: center; }
.field-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}
.color-dot {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  padding: 0;
}
.hint-empty { color: var(--text-dim); font-size: 11.5px; font-style: italic; text-align: center; padding: 8px; }
.proto-foot { display: flex; justify-content: space-between; margin-top: 10px; }

.sa-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.sa-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.sa-tabs :deep(.n-tabs-nav) { padding: 0 18px; }
.sa-tabs :deep(.n-tabs-content) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sa-tabs :deep(.n-tab-pane) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 !important;
  min-height: 0;
}

.scope-toolbar, .raw-toolbar, .frames-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 18px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  font-size: 12px;
}
.flex-spacer { flex: 1; }
.lbl { font-size: 11.5px; color: var(--text-muted); }
.legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; }
.leg { color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.unit { color: var(--text-dim); font-size: 10.5px; margin-left: 2px; }
.scope-canvas { flex: 1; min-height: 280px; }

.raw-view {
  flex: 1;
  background: #0d0d10;
  color: #d5d5dc;
  padding: 12px 16px;
  font-size: 12px;
  line-height: 1.55;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  border-radius: 0;
}
.mono { font-family: var(--font-mono, 'Fira Code', Consolas, monospace); }

.frames-list { flex: 1; overflow-y: auto; padding: 0 18px 18px; }
.ftbl { width: 100%; border-collapse: collapse; font-size: 12px; }
.ftbl th, .ftbl td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
.ftbl th { color: var(--text-muted); font-weight: 500; position: sticky; top: 0; background: var(--bg-app, #0f1014); }
.ftbl td.t { color: var(--text-dim); font-size: 11px; white-space: nowrap; }
.raw-cell { color: var(--text-muted); font-size: 11.5px; word-break: break-all; }
.empty-cell { text-align: center; color: var(--text-dim); padding: 24px; }
.fields-inline { display: flex; flex-wrap: wrap; gap: 10px; }
.fv { font-size: 11.5px; color: var(--text); }
.fv b { font-weight: 600; margin-right: 2px; }

.send-box { display: flex; flex-direction: column; gap: 10px; padding: 14px 18px 18px; flex: 1; }
.send-opts { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.send-actions { display: flex; gap: 8px; }
.hint { font-size: 11.5px; color: var(--text-dim); }

.hist-list { max-height: 420px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.hist-item {
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--bg-panel-2, #1e1f27);
  font-size: 12px;
  border: 1px solid var(--border-soft);
}
.hist-item:hover { border-color: var(--accent); }

/* --- new: legend row, per-channel stats --- */
.legend-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 4px 18px 10px;
  font-size: 11.5px;
  border-bottom: 1px solid var(--border-soft, #262832);
  background: transparent;
}
.leg {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.leg b { color: var(--text-strong); font-weight: 600; }
.leg-stat { color: var(--text-dim); margin-left: 4px; font-size: 11px; }
.leg-stat i { color: var(--text); font-style: normal; }
.leg-transform { color: #ba68c8; font-size: 10.5px; margin-left: 2px; }

/* --- new: field plot controls grid --- */
.field-grid-plot {
  grid-template-columns: 1fr 1fr auto;
  align-items: center;
  padding-top: 4px;
  border-top: 1px dashed var(--border-soft, #262832);
}
.plot-hint { color: var(--text-dim); font-size: 10px; letter-spacing: 0.02em; }

/* --- new: send macros --- */
.macro-panel {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-soft, #262832);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.macro-hdr { display: flex; justify-content: space-between; align-items: center; }
.macro-title { font-size: 12px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.macro-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.macro-card {
  background: var(--bg-panel-2, #1e1f27);
  border: 1px solid var(--border-soft, #262832);
  border-radius: 6px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.macro-row { display: flex; align-items: center; gap: 6px; }

/* --- new: inline help / tutorial --- */
.help-btn {
  margin-left: 12px !important;
  color: var(--text-muted) !important;
  border: 1px solid var(--border-soft, #262832) !important;
  border-radius: 6px !important;
}
.help-btn:hover { color: var(--accent) !important; border-color: var(--accent) !important; }
.help-dot {
  cursor: pointer;
  margin-left: 6px;
  font-size: 12px;
  opacity: 0.7;
  user-select: none;
  transition: opacity 0.15s;
}
.help-dot:hover { opacity: 1; }
.sec-title-left { display: flex; align-items: center; gap: 2px; }
.help-pop {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text);
}
.help-pop p { margin: 0 0 8px; }
.help-pop b { color: var(--text-strong); }
.help-ul {
  margin: 4px 0 8px;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
}
.help-ul li { margin-bottom: 2px; }

.help-modal :deep(.n-card__content) { padding: 4px 12px 12px !important; }
.help-body {
  max-height: calc(86vh - 180px);
  padding: 4px 12px 10px 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text);
}
.help-body h3 {
  font-size: 13.5px;
  color: var(--text-strong);
  margin: 14px 0 6px;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--border-soft, #262832);
}
.help-body h3:first-child { margin-top: 4px; }
.help-body p { margin: 0 0 8px; }
.help-body ul { margin: 0 0 10px; padding-left: 20px; }
.help-body li { margin-bottom: 3px; }
.help-body b { color: var(--text-strong); font-weight: 600; }
.help-body code {
  background: var(--bg-panel-2, #1e1f27);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--font-mono, 'Fira Code', Consolas, monospace);
  font-size: 12px;
  color: #e0a0ff;
}
.help-body .sub-hint {
  display: block;
  color: var(--text-muted);
  font-size: 11.5px;
  margin-top: 2px;
}
.help-body .tip {
  background: rgba(79, 195, 247, 0.08);
  border-left: 3px solid var(--accent);
  padding: 8px 12px;
  margin: 10px 0;
  border-radius: 4px;
  font-size: 12.5px;
}
.help-body .code-block {
  background: #0d0d10;
  color: #d5d5dc;
  padding: 10px 14px;
  border-radius: 6px;
  font-family: var(--font-mono, 'Fira Code', Consolas, monospace);
  font-size: 12px;
  margin: 8px 0;
  overflow-x: auto;
}
</style>
