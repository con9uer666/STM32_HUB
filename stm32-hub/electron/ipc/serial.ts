import { ipcMain, BrowserWindow } from 'electron'
import { SerialPort } from 'serialport'

let port: SerialPort | null = null
let mainWin: () => BrowserWindow | null = () => null

function send(channel: string, payload: unknown) {
  const w = mainWin()
  if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
}

function closeCurrent(reason?: string) {
  if (!port) return
  const p = port
  port = null
  try {
    if (p.isOpen) p.close(() => {})
  } catch {}
  send('serial:closed', { reason: reason ?? 'manual' })
}

export interface OpenConfig {
  path: string
  baudRate: number
  dataBits?: 5 | 6 | 7 | 8
  stopBits?: 1 | 1.5 | 2
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space'
  rtscts?: boolean
  xon?: boolean
  xoff?: boolean
}

export function registerSerialIpc(getWin: () => BrowserWindow | null) {
  mainWin = getWin

  ipcMain.handle('serial:list', async () => {
    try {
      const ports = await SerialPort.list()
      return {
        ok: true,
        ports: ports.map(p => ({
          path: p.path,
          manufacturer: p.manufacturer || '',
          serialNumber: p.serialNumber || '',
          pnpId: p.pnpId || '',
          vendorId: p.vendorId || '',
          productId: p.productId || '',
          friendlyName: (p as any).friendlyName || ''
        }))
      }
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e), ports: [] }
    }
  })

  ipcMain.handle('serial:open', async (_e, cfg: OpenConfig) => {
    if (port && port.isOpen) {
      return { ok: false, error: '已有串口打开，请先关闭' }
    }
    return await new Promise(resolve => {
      try {
        const sp = new SerialPort({
          path: cfg.path,
          baudRate: cfg.baudRate,
          dataBits: cfg.dataBits ?? 8,
          stopBits: cfg.stopBits ?? 1,
          parity: cfg.parity ?? 'none',
          rtscts: !!cfg.rtscts,
          xon: !!cfg.xon,
          xoff: !!cfg.xoff,
          autoOpen: false
        })

        sp.open(err => {
          if (err) {
            resolve({ ok: false, error: err.message })
            return
          }
          port = sp

          sp.on('data', (buf: Buffer) => {
            // Transfer as array for JSON serialization safety across IPC
            send('serial:data', {
              bytes: Array.from(buf),
              ts: Date.now()
            })
          })

          sp.on('error', (e: Error) => {
            send('serial:error', { message: e.message })
          })

          sp.on('close', () => {
            if (port === sp) {
              port = null
              send('serial:closed', { reason: 'device-closed' })
            }
          })

          resolve({ ok: true, path: cfg.path })
        })
      } catch (e: any) {
        resolve({ ok: false, error: e?.message ?? String(e) })
      }
    })
  })

  ipcMain.handle('serial:close', async () => {
    if (!port) return { ok: true }
    return await new Promise(resolve => {
      const p = port!
      port = null
      try {
        p.close(err => {
          if (err) resolve({ ok: false, error: err.message })
          else resolve({ ok: true })
        })
      } catch (e: any) {
        resolve({ ok: false, error: e?.message ?? String(e) })
      }
    })
  })

  ipcMain.handle('serial:write', async (_e, payload: { bytes: number[] }) => {
    if (!port || !port.isOpen) return { ok: false, error: '串口未打开' }
    const buf = Buffer.from(payload.bytes)
    return await new Promise(resolve => {
      port!.write(buf, err => {
        if (err) resolve({ ok: false, error: err.message })
        else {
          port!.drain(err2 => {
            if (err2) resolve({ ok: false, error: err2.message })
            else resolve({ ok: true, written: buf.length })
          })
        }
      })
    })
  })

  ipcMain.handle('serial:status', async () => {
    return {
      isOpen: !!(port && port.isOpen),
      path: port?.path ?? null,
      baudRate: port?.baudRate ?? null
    }
  })

  ipcMain.handle('serial:set-signals', async (_e, signals: { dtr?: boolean; rts?: boolean; brk?: boolean }) => {
    if (!port || !port.isOpen) return { ok: false, error: '串口未打开' }
    return await new Promise(resolve => {
      try {
        port!.set(signals, err => {
          if (err) resolve({ ok: false, error: err.message })
          else resolve({ ok: true })
        })
      } catch (e: any) {
        resolve({ ok: false, error: e?.message ?? String(e) })
      }
    })
  })
}

export function teardownSerial() {
  closeCurrent('app-exit')
}
