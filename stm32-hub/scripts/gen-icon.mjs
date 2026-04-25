// Generates resources/icon.ico with a simple STM32-themed square.
// Pure Node, no deps. Produces a 256x256 BMP-in-ICO file with blue background + white "STM32" mark.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.join(__dirname, '..', 'resources', 'icon.ico')

const SIZE = 256
const BPP = 32

// Create raw BGRA buffer
function makeCanvas() {
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  const bg = [0x14, 0x14, 0x18, 0xff]      // dark background
  const accent = [0xf4, 0xa9, 0x03, 0xff]  // #03A9F4 reversed = BGR
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      buf[i] = bg[0]; buf[i + 1] = bg[1]; buf[i + 2] = bg[2]; buf[i + 3] = bg[3]
    }
  }
  // Draw a stylized chip outline: rounded rectangle-ish frame
  const margin = 32
  const thickness = 10
  for (let y = margin; y < SIZE - margin; y++) {
    for (let x = margin; x < SIZE - margin; x++) {
      const onEdge =
        y < margin + thickness || y >= SIZE - margin - thickness ||
        x < margin + thickness || x >= SIZE - margin - thickness
      if (onEdge) {
        const i = (y * SIZE + x) * 4
        buf[i] = accent[0]; buf[i + 1] = accent[1]; buf[i + 2] = accent[2]; buf[i + 3] = accent[3]
      }
    }
  }
  // Small pins
  const pinLen = 18
  for (let p = 0; p < 6; p++) {
    const yBase = 60 + p * 28
    // left pins
    for (let y = yBase; y < yBase + 6; y++) {
      for (let x = margin - pinLen; x < margin; x++) {
        const i = (y * SIZE + x) * 4
        if (i < 0 || i >= buf.length) continue
        buf[i] = accent[0]; buf[i + 1] = accent[1]; buf[i + 2] = accent[2]; buf[i + 3] = accent[3]
      }
    }
    // right pins
    for (let y = yBase; y < yBase + 6; y++) {
      for (let x = SIZE - margin; x < SIZE - margin + pinLen; x++) {
        const i = (y * SIZE + x) * 4
        if (i < 0 || i >= buf.length) continue
        buf[i] = accent[0]; buf[i + 1] = accent[1]; buf[i + 2] = accent[2]; buf[i + 3] = accent[3]
      }
    }
  }
  // Center dot
  const cx = SIZE / 2, cy = SIZE / 2
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy < 30 * 30) {
        const i = (y * SIZE + x) * 4
        buf[i] = accent[0]; buf[i + 1] = accent[1]; buf[i + 2] = accent[2]; buf[i + 3] = accent[3]
      }
    }
  }
  return buf
}

function makeIco(bgra) {
  // ICO: ICONDIR (6) + ICONDIRENTRY (16) + BITMAPINFOHEADER (40) + XOR mask (BGRA bottom-up) + AND mask
  const w = SIZE, h = SIZE
  const rowSize = w * 4
  const xorSize = rowSize * h
  // AND mask: 1 bit per pixel, padded to 4 bytes per row
  const andRow = Math.ceil(w / 32) * 4
  const andSize = andRow * h
  const dibSize = 40 + xorSize + andSize

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)   // reserved
  header.writeUInt16LE(1, 2)   // type 1 = icon
  header.writeUInt16LE(1, 4)   // count

  const entry = Buffer.alloc(16)
  entry.writeUInt8(0, 0)       // width 0 = 256
  entry.writeUInt8(0, 1)       // height
  entry.writeUInt8(0, 2)       // colors
  entry.writeUInt8(0, 3)       // reserved
  entry.writeUInt16LE(1, 4)    // planes
  entry.writeUInt16LE(BPP, 6)  // bpp
  entry.writeUInt32LE(dibSize, 8)
  entry.writeUInt32LE(22, 12)  // offset

  const bih = Buffer.alloc(40)
  bih.writeUInt32LE(40, 0)
  bih.writeInt32LE(w, 4)
  bih.writeInt32LE(h * 2, 8)   // height doubled for ICO
  bih.writeUInt16LE(1, 12)
  bih.writeUInt16LE(BPP, 14)
  bih.writeUInt32LE(0, 16)     // no compression
  bih.writeUInt32LE(xorSize, 20)

  // XOR mask: bottom-up
  const xor = Buffer.alloc(xorSize)
  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * rowSize
    bgra.copy(xor, y * rowSize, srcRow, srcRow + rowSize)
  }
  const and = Buffer.alloc(andSize) // all zeros = opaque

  return Buffer.concat([header, entry, bih, xor, and])
}

const bgra = makeCanvas()
const ico = makeIco(bgra)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, ico)
console.log('Wrote', outPath, ico.length, 'bytes')
