// Tiny syntax highlighter for tutorial code blocks.
// Targets the languages STM32 beginners encounter: C / C++, bash, json, ini, plaintext.
// Outputs HTML with <span class="hl-XXX"> tokens; CSS lives in Tutorials.vue.

type Lang = 'c' | 'cpp' | 'bash' | 'json' | 'ini' | ''

const C_KEYWORDS = new Set([
  'auto', 'break', 'case', 'const', 'continue', 'default', 'do', 'else',
  'enum', 'extern', 'for', 'goto', 'if', 'inline', 'register', 'return',
  'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'volatile',
  'while', 'restrict', '_Bool', '_Atomic', '_Static_assert',
  // common C++ extras
  'class', 'public', 'private', 'protected', 'namespace', 'template',
  'this', 'new', 'delete', 'using', 'try', 'catch', 'throw', 'nullptr'
])

const C_TYPES = new Set([
  'void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned',
  'bool', 'size_t', 'ssize_t', 'ptrdiff_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
  'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'HAL_StatusTypeDef', 'GPIO_TypeDef', 'TIM_HandleTypeDef', 'UART_HandleTypeDef',
  'I2C_HandleTypeDef', 'SPI_HandleTypeDef', 'ADC_HandleTypeDef', 'DMA_HandleTypeDef',
  'CAN_HandleTypeDef', 'USB_HandleTypeDef', 'RTC_HandleTypeDef', 'IWDG_HandleTypeDef',
  'GPIO_InitTypeDef', 'TIM_OC_InitTypeDef', 'NVIC_TypeDef', 'SCB_Type',
  'osThreadAttr_t', 'osThreadId_t', 'osStatus_t'
])

const C_CONSTS = new Set([
  'NULL', 'true', 'false', 'TRUE', 'FALSE',
  'HAL_OK', 'HAL_ERROR', 'HAL_BUSY', 'HAL_TIMEOUT',
  'GPIO_PIN_RESET', 'GPIO_PIN_SET', 'HAL_MAX_DELAY'
])

const BASH_BUILTINS = new Set([
  'cd', 'echo', 'export', 'pwd', 'set', 'unset', 'source', 'alias',
  'if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'do', 'done', 'while',
  'case', 'esac', 'function', 'return', 'exit', 'read', 'test'
])

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeLang(lang: string): Lang {
  const l = (lang || '').toLowerCase()
  if (l === 'c' || l === 'h') return 'c'
  if (l === 'cpp' || l === 'cxx' || l === 'c++' || l === 'hpp') return 'cpp'
  if (l === 'sh' || l === 'bash' || l === 'shell' || l === 'zsh') return 'bash'
  if (l === 'json') return 'json'
  if (l === 'ini' || l === 'toml' || l === 'conf') return 'ini'
  return ''
}

// Generic regex-based tokenizer. The order of `patterns` matters — earlier wins.
// Each match becomes a colored span; unmatched text is escaped and emitted as-is.
function tokenize(
  code: string,
  patterns: Array<{ re: RegExp; cls: string }>
): string {
  let out = ''
  let i = 0
  outer: while (i < code.length) {
    for (const { re, cls } of patterns) {
      re.lastIndex = i
      const m = re.exec(code)
      if (m && m.index === i) {
        out += `<span class="hl-${cls}">${escapeHtml(m[0])}</span>`
        i += m[0].length
        continue outer
      }
    }
    out += escapeHtml(code[i])
    i++
  }
  return out
}

function highlightC(code: string): string {
  // Identifier coloring (kw/type/const/fn-call) is split into a post-pass after
  // simpler tokens (comments, strings, numbers, preproc) are handled.
  const patterns = [
    { re: /\/\/[^\n]*/y, cls: 'cmt' },
    { re: /\/\*[\s\S]*?\*\//y, cls: 'cmt' },
    { re: /"(?:\\.|[^"\\])*"/y, cls: 'str' },
    { re: /'(?:\\.|[^'\\])'/y, cls: 'str' },
    { re: /^[ \t]*#[a-zA-Z_]+(?:[^\n\\]|\\\n)*/my, cls: 'pre' },
    { re: /\b0[xX][0-9a-fA-F]+[uUlL]*\b/y, cls: 'num' },
    { re: /\b0[bB][01]+[uUlL]*\b/y, cls: 'num' },
    { re: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[fFlLuU]*\b/y, cls: 'num' },
    { re: /[a-zA-Z_][a-zA-Z_0-9]*/y, cls: '__id' }
  ]

  let out = ''
  let i = 0
  outer: while (i < code.length) {
    for (const { re, cls } of patterns) {
      re.lastIndex = i
      const m = re.exec(code)
      if (m && m.index === i) {
        const text = m[0]
        if (cls === '__id') {
          let kind: string
          if (C_KEYWORDS.has(text)) kind = 'kw'
          else if (C_TYPES.has(text) || /^[A-Z][A-Z0-9_]+_(t|TypeDef|Handle|Init|Cfg|Conf)$/.test(text)) kind = 'type'
          else if (C_CONSTS.has(text) || /^[A-Z][A-Z0-9_]{2,}$/.test(text)) kind = 'const'
          else if (code[i + text.length] === '(') kind = 'fn'
          else kind = 'id'
          out += kind === 'id'
            ? escapeHtml(text)
            : `<span class="hl-${kind}">${escapeHtml(text)}</span>`
        } else {
          out += `<span class="hl-${cls}">${escapeHtml(text)}</span>`
        }
        i += text.length
        continue outer
      }
    }
    out += escapeHtml(code[i])
    i++
  }
  return out
}

function highlightBash(code: string): string {
  const patterns = [
    { re: /#[^\n]*/y, cls: 'cmt' },
    { re: /"(?:\\.|[^"\\])*"/y, cls: 'str' },
    { re: /'(?:\\.|[^'\\])*'/y, cls: 'str' },
    { re: /\$\{[^}]+\}/y, cls: 'var' },
    { re: /\$[a-zA-Z_][a-zA-Z_0-9]*/y, cls: 'var' },
    { re: /\b\d+\b/y, cls: 'num' },
    { re: /-{1,2}[a-zA-Z][\w-]*/y, cls: 'flag' },
    { re: /[a-zA-Z_][a-zA-Z_0-9-]*/y, cls: '__id' }
  ]

  let out = ''
  let i = 0
  let atStart = true
  outer: while (i < code.length) {
    for (const { re, cls } of patterns) {
      re.lastIndex = i
      const m = re.exec(code)
      if (m && m.index === i) {
        const text = m[0]
        if (cls === '__id') {
          if (BASH_BUILTINS.has(text)) {
            out += `<span class="hl-kw">${escapeHtml(text)}</span>`
          } else if (atStart) {
            out += `<span class="hl-fn">${escapeHtml(text)}</span>`
          } else {
            out += escapeHtml(text)
          }
        } else {
          out += `<span class="hl-${cls}">${escapeHtml(text)}</span>`
        }
        i += text.length
        atStart = false
        continue outer
      }
    }
    const ch = code[i]
    if (ch === '\n' || ch === ';' || ch === '|' || ch === '&') atStart = true
    else if (ch !== ' ' && ch !== '\t') atStart = false
    out += escapeHtml(ch)
    i++
  }
  return out
}

function highlightJson(code: string): string {
  return tokenize(code, [
    { re: /"(?:\\.|[^"\\])*"\s*:/y, cls: 'key' },
    { re: /"(?:\\.|[^"\\])*"/y, cls: 'str' },
    { re: /\b(?:true|false|null)\b/y, cls: 'const' },
    { re: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, cls: 'num' }
  ])
}

function highlightIni(code: string): string {
  return tokenize(code, [
    { re: /[#;][^\n]*/y, cls: 'cmt' },
    { re: /^\[[^\]\n]+\]/my, cls: 'kw' },
    { re: /^[^=\n#;]+(?==)/my, cls: 'key' },
    { re: /\b\d+(?:\.\d+)?\b/y, cls: 'num' },
    { re: /"(?:\\.|[^"\\])*"/y, cls: 'str' }
  ])
}

export function highlight(code: string, lang: string): string {
  const l = normalizeLang(lang)
  if (l === 'c' || l === 'cpp') return highlightC(code)
  if (l === 'bash') return highlightBash(code)
  if (l === 'json') return highlightJson(code)
  if (l === 'ini') return highlightIni(code)
  return escapeHtml(code)
}
