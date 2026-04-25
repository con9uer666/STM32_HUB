import { ipcMain } from 'electron'
import { store } from '../utils/store'

interface GeneratePayload {
  readme: string
  fileList: string[]
  iocInfo: string
  projectName: string
}

function buildPrompt(p: GeneratePayload): string {
  return `You are analysing an STM32 embedded firmware project called "${p.projectName}".
Respond with a strict JSON object, no markdown fences, matching this schema:
{
  "summary": string (<=120 Chinese characters, describing what the firmware does),
  "mcu": string (e.g. "STM32F103C8T6" or "unknown"),
  "peripherals": string[] (e.g. ["UART", "SPI", "TIM"]; dedupe; <=8 items),
  "features": string[] (<=6 short bullet phrases describing concrete functionality)
}

Context:

--- README.md (truncated) ---
${p.readme || '(none)'}

--- .ioc key fields ---
${p.iocInfo || '(none)'}

--- source files (sample) ---
${p.fileList.slice(0, 60).join('\n') || '(none)'}
`
}

const REQUEST_TIMEOUT_MS = 120_000

function safe(value: any): any {
  // Strip anything that can't survive structured-clone across IPC.
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

export function registerAiIpc() {
  ipcMain.handle('ai:generate', async (_e, payload: GeneratePayload) => {
    try {
      const settings = store.get('settings')
      if (!settings.aiKey) return { ok: false, error: 'DeepSeek API Key 未设置，请在「设置」中填入' }

      const endpoint = settings.aiEndpoint || 'https://api.deepseek.com/chat/completions'
      const model = settings.aiModel || 'deepseek-chat'

      const prompt = buildPrompt(payload)
      const body = {
        model,
        messages: [
          { role: 'system', content: 'You are a concise firmware documentation assistant. Output strict JSON only, no markdown fences.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        stream: false,
        response_format: { type: 'json_object' }
      }

      console.log('[ai:generate] endpoint=%s model=%s bodyBytes=%d', endpoint, model, JSON.stringify(body).length)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      let resp: Response
      try {
        resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${settings.aiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        })
      } catch (e: any) {
        clearTimeout(timer)
        const msg = e?.name === 'AbortError'
          ? `请求超时 (>${REQUEST_TIMEOUT_MS / 1000}s)`
          : '网络错误：' + String(e?.message ?? e)
        return { ok: false, error: msg }
      }
      clearTimeout(timer)

      const raw = await resp.text()
      console.log('[ai:generate] status=%d bytes=%d', resp.status, raw.length)

      if (!resp.ok) {
        return { ok: false, error: `HTTP ${resp.status}`, raw: raw.slice(0, 600) }
      }

      let data: any
      try {
        data = JSON.parse(raw)
      } catch (e: any) {
        return { ok: false, error: '外层 JSON 解析失败：' + (e?.message ?? String(e)), raw: raw.slice(0, 600) }
      }

      const content: string = data?.choices?.[0]?.message?.content ?? ''
      if (!content) {
        return { ok: false, error: '响应中没有 choices[0].message.content', raw: raw.slice(0, 600) }
      }

      const cleaned = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
      let parsed: any
      try {
        parsed = JSON.parse(cleaned)
      } catch (e: any) {
        return { ok: false, error: '模型返回不是合法 JSON：' + (e?.message ?? String(e)), raw: cleaned.slice(0, 600) }
      }

      return safe({
        ok: true,
        result: {
          summary: typeof parsed.summary === 'string' ? parsed.summary : '',
          mcu: typeof parsed.mcu === 'string' ? parsed.mcu : '',
          peripherals: Array.isArray(parsed.peripherals) ? parsed.peripherals.map(String) : [],
          features: Array.isArray(parsed.features) ? parsed.features.map(String) : [],
          generatedAt: Date.now()
        },
        usage: data?.usage ?? null
      })
    } catch (e: any) {
      // Last-resort catch; never let an un-cloneable error propagate to the renderer.
      console.error('[ai:generate] unexpected error', e)
      return { ok: false, error: '未预期错误：' + String(e?.message ?? e) }
    }
  })
}
