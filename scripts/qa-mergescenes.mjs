// 統合(建物の区画/電線/電柱/太鼓橋)が「まだ確かめていない情景」を壊していないかを見る(2026-07-30)。
// 対象: 谷戸・角部屋・雨。統合あり(既定)と統合なし(?nomerge=1)を別々に読み込んで、
//       エラー件数・描画コール・画面の輝度・画素差を並べる。
// 使い方: PORT=4890 node scripts/qa-mergescenes.mjs
//         PORT=4890 QUAL=light node scripts/qa-mergescenes.mjs   （軽量品質で同じ検査）
import { chromium } from 'playwright'
import fs from 'node:fs'
import zlib from 'node:zlib'

const PORT = process.env.PORT || '4890'
const QUAL = process.env.QUAL || '' // 'light' で軽量品質を保存状態に仕込む
const outDir = process.env.OUT || `docs/qa/2026-07-30/merge${QUAL ? '-' + QUAL : ''}`
fs.mkdirSync(outDir, { recursive: true })

// 谷戸2・角部屋2・雨2。雨は「立体の街の雨」と「2Dシェーダーの雨」の両方を見る
const SCENES = [
  { id: 'shishigaya-window-3d', label: '谷戸（獅子ヶ谷・既定）' },
  { id: 'shishigaya-window-3d-snow', label: '谷戸（雪）' },
  { id: 'summer-morning-corner-room', label: '角部屋（夏の朝）' },
  { id: 'autumn-rain-night-corner-room', label: '角部屋（秋の雨の夜）' },
  { id: 'kitaterao-window-3d-rain', label: '立体の街（雨）' },
  { id: 'summer-rain-dusk', label: '2D シェーダーの雨（夏の夕）' },
]

// ── PNGを解いて輝度の平均・標準偏差を出す（黒画面=分散ほぼ0）。qa-debug-walk と同じ手書きデコーダ。
function pngRead(buf) {
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
  return { width, height, ch, data: out }
}
function luma(img) {
  let n = 0, sum = 0, sum2 = 0
  for (let i = 0; i < img.width * img.height; i += 3) {
    const o = i * img.ch
    const L = 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2]
    sum += L; sum2 += L * L; n++
  }
  const mean = sum / n
  return { mean: +mean.toFixed(1), std: +Math.sqrt(Math.max(0, sum2 / n - mean * mean)).toFixed(1) }
}
function diff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return null
  let sum = 0, max = 0, over = 0, cnt = 0
  for (let i = 0; i < a.width * a.height; i++) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i * a.ch + c] - b.data[i * b.ch + c])
      sum += d; if (d > max) max = d; if (d > 4) over++; cnt++
    }
  }
  return { avg: +(sum / cnt).toFixed(2), max, over: +((over / cnt) * 100).toFixed(2) }
}

const browser = await chromium.launch()
const runs = {} // { 統合あり: {id: {...}}, 統合なし: {...} }

// FLOOR=1 は両方とも「統合あり」で読み込む＝差はアニメの揺れだけ。これが画素差の床値になる（統合の差はこれと比べて判断する）
const CONDS = process.env.FLOOR ? [['統合あり', ''], ['統合なし', '']] : [['統合あり', ''], ['統合なし', '&nomerge=1']]
for (const [cond, q] of CONDS) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
  if (QUAL) await ctx.addInitScript((v) => { try { localStorage.setItem('seasons.state.v1', JSON.stringify({ settings: { quality: v } })) } catch { /* 無視 */ } }, QUAL)
  const page = await ctx.newPage()
  let cur = '(起動)'
  const errs = {}
  const noise = (m) => /favicon|manifest|preload|Download the React/i.test(m)
  const add = (m) => { (errs[cur] = errs[cur] || []).push(m.slice(0, 200)) }
  page.on('pageerror', (e) => add('PE:' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !noise(m.text())) add('CE:' + m.text()) })

  await page.goto(`http://localhost:${PORT}/seasons/?dev=1${q}`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('.gate').click().catch(() => {})
  await page.waitForTimeout(1000)
  const qNow = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('seasons.state.v1')).settings.quality } catch { return '?' } })
  console.log(`\n=== ${cond}（品質=${qNow}）===`)

  runs[cond] = {}
  for (const s of SCENES) {
    cur = s.id
    await page.evaluate((i) => window.__applyScene(i), s.id)
    await page.waitForTimeout(800)
    await page.evaluate((i) => window.__applyScene(i), s.id) // 二度当て＝確実に切替（qa-smokeと同方式）
    await page.waitForTimeout(4200)
    const d = await page.evaluate(() => (window.__town3dDraw ? window.__town3dDraw() : null))
    const mg = await page.evaluate(() => (window.__town3dMerge ? window.__town3dMerge() : null))
    const shot = `${outDir}/${cond === '統合あり' ? 'on' : 'off'}-${s.id}.png`
    await page.screenshot({ path: shot })
    const img = pngRead(fs.readFileSync(shot))
    const lu = luma(img)
    runs[cond][s.id] = { d, mg, lu, img, err: (errs[s.id] || []).length, errs: errs[s.id] || [] }
    console.log(
      `${s.label.padEnd(22, '　')} エラー=${(errs[s.id] || []).length} 描画コール=${d ? d.calls : '—(2D情景)'} 三角形=${d ? d.tris : '—'} 輝度=${lu.mean}/分散${lu.std}` +
        (mg ? ` 区画統合[区画=${mg.区画} 元=${mg.元メッシュ} 削減=${mg.削減}]` : ''),
    )
    for (const e of errs[s.id] || []) console.log('    ' + e)
  }
  const boot = errs['(起動)'] || []
  if (boot.length) { console.log(`  起動時のエラー ${boot.length}件`); for (const e of boot) console.log('    ' + e) }
  runs[cond].__boot = boot
  await ctx.close()
}

console.log('\n=== 統合あり vs 統合なし（絵の差）===')
console.log('情景                      コール(あり→なし)  画素の平均差 最大差 差>4の割合')
let ng = 0
for (const s of SCENES) {
  const A = runs['統合あり'][s.id], B = runs['統合なし'][s.id]
  const dd = diff(A.img, B.img)
  const on = A.d ? A.d.calls : '—', off = B.d ? B.d.calls : '—'
  console.log(`${s.label.padEnd(22, '　')} ${String(on).padStart(6)}→${String(off).padStart(6)}   ${dd ? String(dd.avg).padStart(7) : '  寸法違い'} ${dd ? String(dd.max).padStart(5) : ''} ${dd ? String(dd.over).padStart(7) + '%' : ''}`)
  if (A.err || B.err) ng++
  if (A.lu.std < 3) { console.log(`    ⚠ 一様面（黒画面の疑い）: 統合あり std=${A.lu.std}`); ng++ }
}
const bootNg = runs['統合あり'].__boot.length + runs['統合なし'].__boot.length
console.log(`\n判定: 情景のエラー ${ng ? 'あり(' + ng + ')' : '0件'} / 起動時エラー ${bootNg}件 / スクショ ${outDir}`)
await browser.close()
process.exit(ng + bootNg ? 1 : 0)
