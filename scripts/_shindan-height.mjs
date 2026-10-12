// 使い捨て（shindan 2026-10-12）: 高さを変えて飛び、画面の明るさの平均とばらつき（白飛びの目安 mean>235 かつ std<25）を測る
import { chromium } from 'playwright'
import zlib from 'node:zlib'
import fs from 'node:fs'
function pngLumaStat(buf) {
  let p = 8, width = 0, height = 0, colorType = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4
  const stride = width * ch
  const out = Buffer.alloc(height * stride)
  const paeth = (a, b, c) => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
  let rp = 0
  for (let y = 0; y < height; y++) {
    const f = raw[rp++]
    for (let x = 0; x < stride; x++) {
      const rv = raw[rp++]
      const a = x >= ch ? out[y * stride + x - ch] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= ch && y > 0 ? out[(y - 1) * stride + x - ch] : 0
      let v = rv
      if (f === 1) v = (rv + a) & 255
      else if (f === 2) v = (rv + b) & 255
      else if (f === 3) v = (rv + ((a + b) >> 1)) & 255
      else if (f === 4) v = (rv + paeth(a, b, c)) & 255
      out[y * stride + x] = v
    }
  }
  let n = 0, sum = 0, sum2 = 0, mn = 255, mx = 0
  for (let i = 0; i < width * height; i += 3) { // 3pxおきに間引いて集計（速度）
    const o = i * ch
    const L = 0.299 * out[o] + 0.587 * out[o + 1] + 0.114 * out[o + 2]
    sum += L; sum2 += L * L; n++; if (L < mn) mn = L; if (L > mx) mx = L
  }
  const mean = sum / n, variance = sum2 / n - mean * mean
  return { mean: +mean.toFixed(1), std: +Math.sqrt(Math.max(0, variance)).toFixed(1), min: +mn.toFixed(0), max: +mx.toFixed(0) }
}
const OUT = 'docs/qa/2026-10-12_seasons/height'; fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
await p.goto('http://localhost:4951/seasons/?dev=1', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1200)
await p.evaluate(() => window.__applyScene('kitaterao-window-3d')); await p.waitForTimeout(6000)
await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(1500)
await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
for (const [y, pitch] of [[60, -0.2], [80, -0.2], [90, -0.2], [100, -0.2], [110, -0.2], [120, -0.2], [130, -0.3], [130, 0], [150, -0.3], [180, -0.3]]) {
  await p.evaluate(([y, pt]) => window.__town3dFlyPose(0, y, 120, Math.PI, pt), [y, pitch]); await p.waitForTimeout(2500)
  await p.mouse.move(200, 400); await p.mouse.move(202, 402); await p.waitForTimeout(300)
  const buf = await p.screenshot({ path: `${OUT}/h${y}_p${pitch}.png` })
  const st = pngLumaStat(buf)
  const dbg = await p.evaluate(() => { const d = window.__town3dDbg && window.__town3dDbg(); return d ? { y: d.flyPos ? +d.flyPos.y.toFixed(1) : null, mode: d.mode } : null })
  console.log(`高さ${y} 向き${pitch}`, JSON.stringify(st), JSON.stringify(dbg), st.mean > 235 && st.std < 25 ? '← 白飛び' : '')
}
await b.close()
