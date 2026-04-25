import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type FieldType =
  | 'uint8' | 'int8'
  | 'uint16' | 'int16'
  | 'uint32' | 'int32'
  | 'float32' | 'float64'

export interface ProtocolField {
  id: string
  name: string
  offset: number
  type: FieldType
  endian: 'little' | 'big'
  scale: number
  bias: number
  unit: string
  color: string
  visible: boolean
  /** Display-only vertical offset added on the scope; does not affect raw value or CSV export. */
  plotOffset?: number
  /** Display-only gain multiplier applied on the scope. */
  plotGain?: number
}

export type LengthMode = 'fixed' | 'field'
export type ChecksumMode = 'none' | 'sum' | 'xor' | 'crc16-modbus'

export interface Protocol {
  id: string
  name: string
  enabled: boolean
  header: number[]            // e.g. [0xAA, 0x55], may be empty
  footer: number[]            // optional
  lengthMode: LengthMode
  fixedLength: number         // total bytes including header/footer when fixed
  lengthFieldOffset: number   // byte offset of length field
  lengthFieldSize: 1 | 2      // size of length field
  lengthIncludesHeader: boolean
  lengthIncludesSelf: boolean
  checksumMode: ChecksumMode
  checksumOffset: number      // offset where checksum bytes live (from frame start)
  checksumSize: 1 | 2
  checksumRangeFrom: number   // inclusive
  checksumRangeTo: number     // exclusive; negative means "from end"
  fields: ProtocolField[]
}

export interface ScopeConfig {
  windowMs: number       // sliding time window
  maxPoints: number      // cap per series
  paused: boolean
  autoScale: boolean
  yMin: number
  yMax: number
  showStats: boolean
}

export interface SendMacro {
  id: string
  name: string
  mode: 'text' | 'hex'
  content: string
  appendCR: boolean
  appendLF: boolean
}

const STORAGE_KEY = 'stm32hub.serial'

interface Persisted {
  protocols: Protocol[]
  activeProtocolId: string | null
  lastPort: string | null
  lastBaud: number
  scope: ScopeConfig
  macros: SendMacro[]
}

function defaultProtocol(): Protocol {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: '新协议',
    enabled: true,
    header: [0xAA, 0x55],
    footer: [],
    lengthMode: 'fixed',
    fixedLength: 20,
    lengthFieldOffset: 2,
    lengthFieldSize: 1,
    lengthIncludesHeader: true,
    lengthIncludesSelf: true,
    checksumMode: 'sum',
    checksumOffset: 18,
    checksumSize: 1,
    checksumRangeFrom: 0,
    checksumRangeTo: -1,
    fields: [
      {
        id: Math.random().toString(36).slice(2, 10),
        name: 'ch1',
        offset: 2,
        type: 'int16',
        endian: 'little',
        scale: 1,
        bias: 0,
        unit: '',
        color: '#4fc3f7',
        visible: true,
        plotOffset: 0,
        plotGain: 1
      }
    ]
  }
}

function defaultScope(): ScopeConfig {
  return {
    windowMs: 10_000, maxPoints: 2000, paused: false,
    autoScale: true, yMin: -100, yMax: 100, showStats: true
  }
}

function defaultMacros(): SendMacro[] {
  return [
    { id: 'm1', name: '查询', mode: 'text', content: 'AT', appendCR: true, appendLF: true },
    { id: 'm2', name: '版本', mode: 'text', content: 'AT+VER?', appendCR: true, appendLF: true },
    { id: 'm3', name: '示例HEX', mode: 'hex', content: 'AA 55 01 02 FF', appendCR: false, appendLF: false }
  ]
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) throw new Error('none')
    const v = JSON.parse(raw) as Partial<Persisted>
    return {
      protocols: Array.isArray(v.protocols) && v.protocols.length ? v.protocols as Protocol[] : [defaultProtocol()],
      activeProtocolId: v.activeProtocolId ?? null,
      lastPort: v.lastPort ?? null,
      lastBaud: v.lastBaud ?? 115200,
      scope: { ...defaultScope(), ...(v.scope ?? {}) },
      macros: Array.isArray(v.macros) ? v.macros as SendMacro[] : defaultMacros()
    }
  } catch {
    return {
      protocols: [defaultProtocol()],
      activeProtocolId: null,
      lastPort: null,
      lastBaud: 115200,
      scope: defaultScope(),
      macros: defaultMacros()
    }
  }
}

export const useSerialStore = defineStore('serial', () => {
  const initial = load()
  const protocols = ref<Protocol[]>(initial.protocols)
  const activeProtocolId = ref<string | null>(
    initial.activeProtocolId && initial.protocols.some(p => p.id === initial.activeProtocolId)
      ? initial.activeProtocolId
      : (initial.protocols[0]?.id ?? null)
  )
  const lastPort = ref<string | null>(initial.lastPort)
  const lastBaud = ref<number>(initial.lastBaud)
  const scope = ref<ScopeConfig>(initial.scope)
  const macros = ref<SendMacro[]>(initial.macros)

  function save() {
    const payload: Persisted = {
      protocols: protocols.value,
      activeProtocolId: activeProtocolId.value,
      lastPort: lastPort.value,
      lastBaud: lastBaud.value,
      scope: scope.value,
      macros: macros.value
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {}
  }

  watch([protocols, activeProtocolId, lastPort, lastBaud, scope, macros], save, { deep: true })

  function addProtocol() {
    const p = defaultProtocol()
    p.name = `协议 ${protocols.value.length + 1}`
    protocols.value.push(p)
    activeProtocolId.value = p.id
  }

  function removeProtocol(id: string) {
    protocols.value = protocols.value.filter(p => p.id !== id)
    if (activeProtocolId.value === id) {
      activeProtocolId.value = protocols.value[0]?.id ?? null
    }
    if (!protocols.value.length) addProtocol()
  }

  function duplicateProtocol(id: string) {
    const p = protocols.value.find(x => x.id === id)
    if (!p) return
    const copy: Protocol = JSON.parse(JSON.stringify(p))
    copy.id = Math.random().toString(36).slice(2, 10)
    copy.name = p.name + ' (副本)'
    copy.fields = copy.fields.map(f => ({ ...f, id: Math.random().toString(36).slice(2, 10) }))
    protocols.value.push(copy)
    activeProtocolId.value = copy.id
  }

  function importProtocolsFromJson(json: string) {
    const v = JSON.parse(json)
    const arr = Array.isArray(v) ? v : [v]
    for (const p of arr) {
      if (!p || typeof p !== 'object' || !Array.isArray(p.fields)) continue
      const np: Protocol = {
        ...defaultProtocol(),
        ...p,
        id: Math.random().toString(36).slice(2, 10),
        fields: p.fields.map((f: any) => ({
          ...f,
          id: Math.random().toString(36).slice(2, 10)
        }))
      }
      protocols.value.push(np)
    }
  }

  function addMacro() {
    macros.value.push({
      id: Math.random().toString(36).slice(2, 10),
      name: `宏 ${macros.value.length + 1}`,
      mode: 'text',
      content: '',
      appendCR: false,
      appendLF: true
    })
  }
  function removeMacro(id: string) {
    macros.value = macros.value.filter(m => m.id !== id)
  }

  return {
    protocols, activeProtocolId, lastPort, lastBaud, scope, macros,
    addProtocol, removeProtocol, duplicateProtocol, importProtocolsFromJson,
    addMacro, removeMacro
  }
})
