// Curve fitting algorithms — pure TS, no deps.
// Polynomial degrees 1..6 via normal equations, exponential / logarithmic / power
// via linearising transforms, and single-peak Gaussian via Gauss-Newton.

export interface Pt { x: number; y: number }

export interface FitResult {
  id: string
  name: string
  ok: boolean
  reason?: string
  coefs: number[]
  formula: string
  formulaHtml: string
  r2: number
  predict: (x: number) => number
}

export interface ParseOutcome {
  points: Pt[]
  errors: { line: number; text: string }[]
}

// --------------------------- parser ---------------------------

export function parsePoints(text: string, xCol = 0, yCol = 1): ParseOutcome {
  const points: Pt[] = []
  const errors: { line: number; text: string }[] = []
  const lines = text.split(/\r?\n/)
  const maxCol = Math.max(xCol, yCol)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#') || line.startsWith('//')) continue
    const parts = line.split(/[\s,;\t]+/).filter(Boolean)
    if (parts.length <= maxCol) {
      // Skip header/label rows silently when nothing parses as a number.
      if (!parts.some(p => Number.isFinite(Number(p)))) continue
      errors.push({ line: i + 1, text: raw })
      continue
    }
    const x = Number(parts[xCol])
    const y = Number(parts[yCol])
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (!parts.some(p => Number.isFinite(Number(p)))) continue
      errors.push({ line: i + 1, text: raw })
      continue
    }
    points.push({ x, y })
  }
  return { points, errors }
}

// --------------------------- small matrix solver ---------------------------

// Gauss elimination with partial pivoting. A is n×n, b is n. In-place.
// Returns solution vector, or null if matrix is singular.
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M: number[][] = A.map(r => r.slice())
  const v = b.slice()
  for (let i = 0; i < n; i++) {
    // pivot
    let maxR = i
    let maxV = Math.abs(M[i][i])
    for (let r = i + 1; r < n; r++) {
      const a = Math.abs(M[r][i])
      if (a > maxV) { maxV = a; maxR = r }
    }
    if (maxV < 1e-14) return null
    if (maxR !== i) {
      const tmp = M[i]; M[i] = M[maxR]; M[maxR] = tmp
      const tv = v[i]; v[i] = v[maxR]; v[maxR] = tv
    }
    // eliminate below
    for (let r = i + 1; r < n; r++) {
      const f = M[r][i] / M[i][i]
      if (f === 0) continue
      for (let c = i; c < n; c++) M[r][c] -= f * M[i][c]
      v[r] -= f * v[i]
    }
  }
  // back substitution
  const x = new Array<number>(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = v[i]
    for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]
    x[i] = s / M[i][i]
  }
  return x
}

// --------------------------- shared ---------------------------

function rSquaredFromPairs(actual: number[], predicted: number[]): number {
  const n = actual.length
  if (n === 0) return 0
  let mean = 0
  for (let i = 0; i < n; i++) mean += actual[i]
  mean /= n
  let ssRes = 0, ssTot = 0
  for (let i = 0; i < n; i++) {
    ssRes += (actual[i] - predicted[i]) ** 2
    ssTot += (actual[i] - mean) ** 2
  }
  if (ssTot === 0) return ssRes === 0 ? 1 : 0
  return 1 - ssRes / ssTot
}

function rSquared(points: Pt[], predict: (x: number) => number): number {
  const actual = points.map(p => p.y)
  const predicted = points.map(p => predict(p.x))
  return rSquaredFromPairs(actual, predicted)
}

// --------------------------- polynomial ---------------------------

function fitPoly(points: Pt[], degree: number): FitResult {
  const id = `poly${degree}`
  const name = polyName(degree)
  if (points.length < degree + 1) {
    return emptyResult(id, name, `至少需要 ${degree + 1} 个数据点`)
  }
  // Normal equations: (XᵀX) c = Xᵀy  where X[i][j] = x_i^j, j=0..degree
  const k = degree + 1
  const A: number[][] = Array.from({ length: k }, () => new Array(k).fill(0))
  const b: number[] = new Array(k).fill(0)
  // S[i] = sum(x^i) for i=0..2*degree
  const S: number[] = new Array(2 * degree + 1).fill(0)
  const T: number[] = new Array(k).fill(0) // T[i] = sum(y * x^i)
  for (const p of points) {
    let xi = 1
    for (let i = 0; i <= 2 * degree; i++) { S[i] += xi; xi *= p.x }
    xi = 1
    for (let i = 0; i < k; i++) { T[i] += p.y * xi; xi *= p.x }
  }
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) A[i][j] = S[i + j]
    b[i] = T[i]
  }
  const c = solveLinear(A, b)
  if (!c) return emptyResult(id, name, '矩阵奇异，数据过于退化')
  const predict = (x: number) => {
    let s = 0, xi = 1
    for (let i = 0; i < k; i++) { s += c[i] * xi; xi *= x }
    return s
  }
  return {
    id, name, ok: true,
    coefs: c.slice(),
    formula: polyFormula(c, false),
    formulaHtml: polyFormula(c, true),
    r2: rSquared(points, predict),
    predict
  }
}

function polyName(d: number): string {
  if (d === 1) return '一次多项式（线性）'
  if (d === 2) return '二次多项式'
  if (d === 3) return '三次多项式'
  if (d === 4) return '四次多项式'
  if (d === 5) return '五次多项式'
  if (d === 6) return '六次多项式'
  return `${d} 次多项式`
}

const SUP_UNICODE: Record<number, string> = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }

function polyFormula(c: number[], html: boolean): string {
  // c[0] + c[1]*x + c[2]*x^2 + ...
  // print highest degree first for readability
  const terms: string[] = []
  for (let i = c.length - 1; i >= 0; i--) {
    const v = c[i]
    if (Math.abs(v) < 1e-10) continue
    const sign = v < 0 ? '-' : (terms.length === 0 ? '' : '+')
    const abs = Math.abs(v)
    const num = formatNum(abs)
    let x: string
    if (i === 0) x = ''
    else if (i === 1) x = 'x'
    else x = html ? `x<sup>${i}</sup>` : `x${SUP_UNICODE[i] ?? '^' + i}`
    const body = (i > 0 && abs === 1) ? x : (i === 0 ? num : `${num}${x}`)
    terms.push(sign ? (sign === '-' ? `${terms.length === 0 ? '-' : ' - '}${body}` : ` + ${body}`) : body)
  }
  const rhs = terms.length ? terms.join('') : '0'
  return `y = ${rhs}`
}

// --------------------------- linearised fits ---------------------------

// Simple linear regression on (u, v): returns [intercept, slope]
function linReg(u: number[], v: number[]): [number, number] | null {
  const n = u.length
  if (n < 2) return null
  let su = 0, sv = 0, suu = 0, suv = 0
  for (let i = 0; i < n; i++) {
    su += u[i]; sv += v[i]; suu += u[i] * u[i]; suv += u[i] * v[i]
  }
  const den = n * suu - su * su
  if (Math.abs(den) < 1e-14) return null
  const slope = (n * suv - su * sv) / den
  const intercept = (sv - slope * su) / n
  return [intercept, slope]
}

function fitExp(points: Pt[]): FitResult {
  const id = 'exp', name = '指数 y = a·e^(bx)'
  if (points.length < 2) return emptyResult(id, name, '至少需要 2 个数据点')
  if (!points.every(p => p.y > 0)) return emptyResult(id, name, '需要 y 全为正')
  const u = points.map(p => p.x)
  const v = points.map(p => Math.log(p.y))
  const r = linReg(u, v)
  if (!r) return emptyResult(id, name, '线性化求解失败')
  const [lnA, b] = r
  const a = Math.exp(lnA)
  const predict = (x: number) => a * Math.exp(b * x)
  const formula = `y = ${formatNum(a)}·e^(${formatNum(b)}x)`
  const formulaHtml = `y = ${formatNum(a)}·e<sup>${formatNum(b)}x</sup>`
  return { id, name, ok: true, coefs: [a, b], formula, formulaHtml, r2: rSquared(points, predict), predict }
}

function fitLog(points: Pt[]): FitResult {
  const id = 'log', name = '对数 y = a + b·ln(x)'
  if (points.length < 2) return emptyResult(id, name, '至少需要 2 个数据点')
  if (!points.every(p => p.x > 0)) return emptyResult(id, name, '需要 x 全为正')
  const u = points.map(p => Math.log(p.x))
  const v = points.map(p => p.y)
  const r = linReg(u, v)
  if (!r) return emptyResult(id, name, '线性化求解失败')
  const [a, b] = r
  const predict = (x: number) => a + b * Math.log(x)
  const formula = `y = ${formatNum(a)} + ${formatNum(b)}·ln(x)`
  const formulaHtml = formula
  return { id, name, ok: true, coefs: [a, b], formula, formulaHtml, r2: rSquared(points, predict), predict }
}

function fitPower(points: Pt[]): FitResult {
  const id = 'power', name = '幂函数 y = a·x^b'
  if (points.length < 2) return emptyResult(id, name, '至少需要 2 个数据点')
  if (!points.every(p => p.x > 0 && p.y > 0)) return emptyResult(id, name, '需要 x、y 全为正')
  const u = points.map(p => Math.log(p.x))
  const v = points.map(p => Math.log(p.y))
  const r = linReg(u, v)
  if (!r) return emptyResult(id, name, '线性化求解失败')
  const [lnA, b] = r
  const a = Math.exp(lnA)
  const predict = (x: number) => a * Math.pow(x, b)
  const formula = `y = ${formatNum(a)}·x^(${formatNum(b)})`
  const formulaHtml = `y = ${formatNum(a)}·x<sup>${formatNum(b)}</sup>`
  return { id, name, ok: true, coefs: [a, b], formula, formulaHtml, r2: rSquared(points, predict), predict }
}

// --------------------------- gaussian ---------------------------

function fitGaussian(points: Pt[]): FitResult {
  const id = 'gaussian', name = '高斯 y = a·exp(-((x-b)/c)²)'
  if (points.length < 4) return emptyResult(id, name, '至少需要 4 个数据点')

  // initial guess
  let aMax = -Infinity, bGuess = points[0].x
  for (const p of points) if (p.y > aMax) { aMax = p.y; bGuess = p.x }
  if (!(aMax > 0)) return emptyResult(id, name, '需要存在正峰值')
  let xmin = Infinity, xmax = -Infinity
  for (const p of points) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x }
  let a = aMax, b = bGuess, c = Math.max((xmax - xmin) / 4, 1e-6)

  // Gauss-Newton: minimize sum (y - f)^2
  // partials: df/da = g, df/db = f * 2(x-b)/c^2, df/dc = f * 2(x-b)^2/c^3  (with g = exp(-((x-b)/c)^2))
  for (let iter = 0; iter < 40; iter++) {
    const JTJ: number[][] = [[0,0,0],[0,0,0],[0,0,0]]
    const JTr: number[] = [0,0,0]
    for (const p of points) {
      const t = (p.x - b) / c
      const g = Math.exp(-t * t)
      const f = a * g
      const dfa = g
      const dfb = a * g * 2 * (p.x - b) / (c * c)
      const dfc = a * g * 2 * (p.x - b) * (p.x - b) / (c * c * c)
      const r = p.y - f
      const J = [dfa, dfb, dfc]
      for (let i = 0; i < 3; i++) {
        JTr[i] += J[i] * r
        for (let j = 0; j < 3; j++) JTJ[i][j] += J[i] * J[j]
      }
    }
    // damp slightly for stability (Levenberg-ish)
    for (let i = 0; i < 3; i++) JTJ[i][i] += 1e-8
    const delta = solveLinear(JTJ, JTr)
    if (!delta) return emptyResult(id, name, '矩阵奇异，未能收敛')
    a += delta[0]; b += delta[1]; c += delta[2]
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      return emptyResult(id, name, '数值发散，未能收敛')
    }
    if (Math.abs(c) < 1e-9) return emptyResult(id, name, '宽度退化，未能收敛')
    const step = Math.abs(delta[0]) + Math.abs(delta[1]) + Math.abs(delta[2])
    if (step < 1e-9) break
  }

  const predict = (x: number) => a * Math.exp(-((x - b) / c) * ((x - b) / c))
  const r2 = rSquared(points, predict)
  if (!Number.isFinite(r2)) return emptyResult(id, name, '拟合结果无效')
  const formula = `y = ${formatNum(a)}·exp(-((x - ${formatNum(b)}) / ${formatNum(Math.abs(c))})²)`
  const formulaHtml = `y = ${formatNum(a)}·exp(-((x − ${formatNum(b)}) / ${formatNum(Math.abs(c))})<sup>2</sup>)`
  return { id, name, ok: true, coefs: [a, b, c], formula, formulaHtml, r2, predict }
}

// --------------------------- dispatcher ---------------------------

export function fitAll(points: Pt[]): FitResult[] {
  const out: FitResult[] = []
  for (let d = 1; d <= 6; d++) out.push(fitPoly(points, d))
  out.push(fitExp(points))
  out.push(fitLog(points))
  out.push(fitPower(points))
  out.push(fitGaussian(points))
  return out
}

// --------------------------- helpers ---------------------------

function emptyResult(id: string, name: string, reason: string): FitResult {
  return {
    id, name, ok: false, reason,
    coefs: [], formula: '—', formulaHtml: '—', r2: NaN,
    predict: () => NaN
  }
}

function formatNum(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 1e5 || abs < 1e-3) return v.toExponential(4).replace(/e([+-])0*(\d)/, 'e$1$2')
  // choose significant digits
  const digits = abs >= 100 ? 3 : abs >= 1 ? 4 : 5
  const s = v.toPrecision(digits)
  // drop trailing zeros (but keep scientific)
  if (!/e/i.test(s) && s.includes('.')) return s.replace(/\.?0+$/, '')
  return s
}

// =========================================================================
// Bivariate (3D) polynomial fitting: z = f(x, y)
// =========================================================================

export interface Pt3 { x: number; y: number; z: number }

export interface FitResult3D {
  id: string
  name: string
  degree: number
  ok: boolean
  reason?: string
  coefs: number[]
  terms: { i: number; j: number }[]
  formula: string
  formulaHtml: string
  r2: number
  predict: (x: number, y: number) => number
}

export interface ParseOutcome3D {
  points: Pt3[]
  errors: { line: number; text: string }[]
}

export function parsePoints3D(
  text: string,
  xCol = 0,
  yCol = 1,
  zCol = 2
): ParseOutcome3D {
  const points: Pt3[] = []
  const errors: { line: number; text: string }[] = []
  const lines = text.split(/\r?\n/)
  const maxCol = Math.max(xCol, yCol, zCol)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#') || line.startsWith('//')) continue
    const parts = line.split(/[\s,;\t]+/).filter(Boolean)
    if (parts.length <= maxCol) {
      if (!parts.some(p => Number.isFinite(Number(p)))) continue
      errors.push({ line: i + 1, text: raw })
      continue
    }
    const x = Number(parts[xCol])
    const y = Number(parts[yCol])
    const z = Number(parts[zCol])
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      if (!parts.some(p => Number.isFinite(Number(p)))) continue
      errors.push({ line: i + 1, text: raw })
      continue
    }
    points.push({ x, y, z })
  }
  return { points, errors }
}

// Enumerate bivariate monomial terms up to total degree d.
// Order: total degree ascending; within a total degree, i descending (x-first).
function buildTerms(d: number): { i: number; j: number }[] {
  const terms: { i: number; j: number }[] = []
  for (let total = 0; total <= d; total++) {
    for (let i = total; i >= 0; i--) {
      const j = total - i
      terms.push({ i, j })
    }
  }
  return terms
}

function surfaceName(d: number): string {
  if (d === 1) return '双变量一次（平面）'
  if (d === 2) return '双变量二次'
  if (d === 3) return '双变量三次'
  if (d === 4) return '双变量四次'
  return `双变量 ${d} 次`
}

function monomialLabel(i: number, j: number, html: boolean): string {
  if (i === 0 && j === 0) return ''
  const xPart = i === 0 ? '' : i === 1 ? 'x' : html ? `x<sup>${i}</sup>` : `x${SUP_UNICODE[i] ?? '^' + i}`
  const yPart = j === 0 ? '' : j === 1 ? 'y' : html ? `y<sup>${j}</sup>` : `y${SUP_UNICODE[j] ?? '^' + j}`
  return xPart + yPart
}

function surfaceFormula(coefs: number[], terms: { i: number; j: number }[], html: boolean): string {
  const parts: string[] = []
  for (let k = 0; k < terms.length; k++) {
    const v = coefs[k]
    if (Math.abs(v) < 1e-10) continue
    const { i, j } = terms[k]
    const abs = Math.abs(v)
    const mono = monomialLabel(i, j, html)
    const isConst = (i === 0 && j === 0)
    const body = isConst
      ? formatNum(abs)
      : (abs === 1 ? mono : `${formatNum(abs)}${mono}`)
    if (parts.length === 0) {
      parts.push(v < 0 ? `-${body}` : body)
    } else {
      parts.push(v < 0 ? ` - ${body}` : ` + ${body}`)
    }
  }
  const rhs = parts.length ? parts.join('') : '0'
  return `z = ${rhs}`
}

export function fitPolyBivariate(points: Pt3[], degree: number): FitResult3D {
  const id = `surf${degree}`
  const name = surfaceName(degree)
  const terms = buildTerms(degree)
  const T = terms.length
  if (points.length < T) {
    return emptyResult3D(id, name, degree, terms, `至少需要 ${T} 个数据点`)
  }

  // Design matrix X (n × T) with X[k][t] = x_k^i * y_k^j for terms[t] = (i,j).
  // Normal equations: (X^T X) c = X^T z. Build directly to stay O(n * T^2).
  const A: number[][] = Array.from({ length: T }, () => new Array(T).fill(0))
  const b: number[] = new Array(T).fill(0)
  for (const p of points) {
    const row = new Array<number>(T)
    for (let t = 0; t < T; t++) {
      row[t] = Math.pow(p.x, terms[t].i) * Math.pow(p.y, terms[t].j)
    }
    for (let r = 0; r < T; r++) {
      b[r] += row[r] * p.z
      for (let c = 0; c < T; c++) A[r][c] += row[r] * row[c]
    }
  }

  const c = solveLinear(A, b)
  if (!c) return emptyResult3D(id, name, degree, terms, '矩阵奇异，数据过于退化')

  const predict = (x: number, y: number) => {
    let s = 0
    for (let t = 0; t < T; t++) {
      s += c[t] * Math.pow(x, terms[t].i) * Math.pow(y, terms[t].j)
    }
    return s
  }

  const actual = points.map(p => p.z)
  const predicted = points.map(p => predict(p.x, p.y))
  const r2 = rSquaredFromPairs(actual, predicted)
  if (!Number.isFinite(r2)) {
    return emptyResult3D(id, name, degree, terms, '拟合结果无效')
  }

  return {
    id, name, degree, ok: true,
    coefs: c.slice(),
    terms: terms.slice(),
    formula: surfaceFormula(c, terms, false),
    formulaHtml: surfaceFormula(c, terms, true),
    r2,
    predict
  }
}

export function fitAll3D(points: Pt3[]): FitResult3D[] {
  const out: FitResult3D[] = []
  for (let d = 1; d <= 4; d++) out.push(fitPolyBivariate(points, d))
  return out
}

function emptyResult3D(id: string, name: string, degree: number, terms: { i: number; j: number }[], reason: string): FitResult3D {
  return {
    id, name, degree, ok: false, reason,
    coefs: [], terms: terms.slice(),
    formula: '—', formulaHtml: '—', r2: NaN,
    predict: () => NaN
  }
}
