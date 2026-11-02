// 全数デバッグ巡回ハーネス。全公開情景を headless で「一通り操作」し、客観的な不具合を自動でフラグする安全網。
// 拾えるもの: JS/WebGLエラー・pageerror・黒画面/白飛び(輝度の分散で判定)・配置違反(家に食い込む木/道上の家)・
//             住民の建物食い込み・描画コール(town3d)の記録。全情景のスクショと report.md/json も出す。
// 拾えないもの: 「操作感の気持ちよさ」「没入の良し悪し」等の主観、iOS実機固有の描画差・発熱(このPCでは断定不可)。
//
// 使い方:
//   node scripts/qa-debug-walk.mjs            … 全情景の既定ビューを巡回（速い・基本の一通り点検）
//   QA_DEEP=1 node scripts/qa-debug-walk.mjs  … 加えて town3d の「時間帯の移ろい」掃引と飛行/歩行モード掃引
//   PORT=4955 node scripts/qa-debug-walk.mjs  … ポート上書き
// 出力: .qa-shots/debug-walk/ に NN-<id>.png と report.md / report.json（.gitignore済み）
// 異常(エラー/黒画面/白飛び/配置違反/住民食い込み)が1件でもあれば exit 1。
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { SCENES } from '../src/data/scenes/index.js'

const PORT = process.env.PORT || 4955
const DEEP = process.env.QA_DEEP === '1'
const BASE = `http://localhost:${PORT}/seasons/`
const __dir = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dir, '..', '.qa-shots', 'debug-walk')
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const scenes = SCENES.filter((s) => s.status === 'ready' && s.public !== false)
const is3dScene = (s) => s.render === 'town3d'

// ── PNGを解いて輝度の平均・標準偏差を出す（黒画面=分散ほぼ0／白飛び=平均が高い、で識別）。qa-imgdiffと同じ手書きデコーダ。
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

// ── vite preview を自前起動（CI・ローカル自己完結）
const srv = spawn(`npx vite preview --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' })
const cleanup = () => { try { srv.kill() } catch { /* 無視 */ } }
process.on('exit', cleanup)
async function waitServer(ms = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(BASE); if (r.ok) return true } catch { /* まだ */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}
if (!(await waitServer())) { console.error('WALK: preview server did not start'); cleanup(); process.exit(1) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 480, height: 720 } })

// ── エラー捕捉（情景ごとにバケツを差し替える）
let errBucket = []
const isErr = (m) => !/favicon|manifest|Download the React|preload/i.test(m) // 無害ノイズ除外
page.on('pageerror', (e) => errBucket.push('PE:' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && isErr(m.text())) errBucket.push('CE:' + m.text().slice(0, 160)) })

await page.goto(`${BASE}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(1200)
if (!(await page.evaluate(() => typeof window.__applyScene === 'function'))) {
  console.error('WALK: __applyScene hook missing (app init failed?)'); await browser.close(); cleanup(); process.exit(1)
}

// idle間引きで page.screenshot が黒くなるのを防ぐ: 撮る直前にマウスを微動させ活動を起こして1枚描かせる
async function liveShot(file) {
  await page.mouse.move(240, 360); await page.mouse.move(242, 362)
  await page.waitForTimeout(280)
  const buf = await page.screenshot({ path: path.join(OUT, file) })
  return pngLumaStat(buf)
}
const probe = async (fn, fallback = null) => {
  try { return await page.evaluate(fn) } catch { return fallback }
}

const rows = []      // 1情景=1行のレポート
const flags = []     // { id, label, kind, detail } 異常のみ
function checkFrame(id, label, tag, stat) {
  // 黒画面/崩れ: 分散がほぼ無い＝一様な塗り（正常な夜景でも星や窓灯りで分散は出る）
  if (stat.std < 3.0) flags.push({ id, label, kind: 'blank', detail: `${tag} 一様面 std=${stat.std} mean=${stat.mean}（黒画面/描画欠落の疑い）` })
  // 白飛び: 画面全体が高輝度に張り付く
  else if (stat.mean > 244 && stat.min > 230) flags.push({ id, label, kind: 'whiteout', detail: `${tag} 白飛び mean=${stat.mean} min=${stat.min}` })
}

let idx = 0
for (const s of scenes) {
  idx++
  const nn = String(idx).padStart(2, '0')
  const id = s.id, label = s.label || id
  errBucket = []
  await page.evaluate((i) => window.__applyScene(i), id)
  await page.waitForTimeout(700)
  await page.evaluate((i) => window.__applyScene(i), id) // 二度当て＝確実に切替
  await page.waitForTimeout(1500)

  const stat = await liveShot(`${nn}-${id}.png`)
  checkFrame(id, label, '既定', stat)

  const row = { nn, id, label, render: s.render, axes: s.axes, errors: errBucket.length, stat }

  if (is3dScene(s)) {
    // 描画コールは __town3dDraw（実シーンを直接描画した本当の値）。__town3dStats.calls は composer最終パスの1枚なので使わない。
    row.draw = await probe(() => (window.__town3dDraw ? window.__town3dDraw() : null))
    row.stats = await probe(() => (window.__town3dStats ? window.__town3dStats() : null))
    row.pal = await probe(() => (window.__town3dPalProbe ? window.__town3dPalProbe() : null))
    const audit = await probe(() => (window.__town3dTownAudit ? window.__town3dTownAudit() : null))
    const clip = await probe(() => (window.__town3dResClip ? window.__town3dResClip() : null))
    row.audit = audit; row.clip = clip
    if (audit && (audit.treeLeft > 0 || audit.houseOnRoad > 0 || audit.houseOnRail > 0))
      flags.push({ id, label, kind: 'placement', detail: `配置違反 木${audit.treeLeft}/道上の家${audit.houseOnRoad}/線路上${audit.houseOnRail}` })
    if (clip && (clip.resIn > 0 || clip.peepIn > 0))
      flags.push({ id, label, kind: 'clip', detail: `住民食い込み res${clip.resIn}/peep${clip.peepIn}` })
    // 描画コールは絶対閾値でなく記録（窓辺の既知2101が目安。極端に多ければ後で目視）
    if (row.draw && row.draw.calls > 3000)
      flags.push({ id, label, kind: 'drawcall', detail: `描画コール多め calls=${row.draw.calls}（要目視）` })
  }

  if (errBucket.length) for (const m of errBucket) flags.push({ id, label, kind: 'error', detail: m })

  // ── DEEP: town3dは「時間帯の移ろい」を掃引（夕焼け固有の崩れ等を拾う）
  if (DEEP && is3dScene(s)) {
    row.drift = []
    for (const f of [0.0, 0.5, 1.0]) {
      await page.evaluate((ff) => { if (window.__town3dDrift) window.__town3dDrift(ff) }, f)
      await page.waitForTimeout(650)
      const st = await liveShot(`${nn}-${id}-drift${Math.round(f * 10)}.png`)
      const pal = await probe(() => (window.__town3dPalProbe ? window.__town3dPalProbe() : null))
      checkFrame(id, label, `drift${f}`, st)
      row.drift.push({ f, stat: st, pal })
    }
    await page.evaluate(() => { if (window.__town3dDrift) window.__town3dDrift(0) })
  }

  rows.push(row)
  process.stdout.write(`  ${nn} ${id} …err${row.errors}${row.draw ? ` calls${row.draw.calls}` : ''}\n`)
}

// ── DEEP: 代表のtown3d情景で 飛行→歩行 モードを掃引（白飛び・地面めり込み・食い込みを拾う）
const modeReport = []
if (DEEP) {
  const rep = scenes.filter(is3dScene).slice(0, 2) // 坂の街・谷戸の代表2枚（実行時間を抑える）
  for (const s of rep) {
    await page.evaluate((i) => window.__applyScene(i), s.id)
    await page.waitForTimeout(1800)
    // 飛行
    errBucket = []
    await page.evaluate(() => { if (window.__town3dFly) window.__town3dFly(true) })
    await page.evaluate(() => { if (window.__town3dCruise) window.__town3dCruise(true) })
    await page.waitForTimeout(2600)
    const flyStat = await liveShot(`mode-${s.id}-fly.png`)
    const flyStats = await probe(() => (window.__town3dDraw ? window.__town3dDraw() : null))
    checkFrame(s.id, s.label, 'fly', flyStat)
    if (errBucket.length) for (const m of errBucket) flags.push({ id: s.id, label: s.label, kind: 'error', detail: 'fly ' + m })
    // 歩行
    errBucket = []
    await page.evaluate(() => { if (window.__town3dLand) window.__town3dLand(true) })
    await page.waitForTimeout(2400)
    const walkStat = await liveShot(`mode-${s.id}-walk.png`)
    const walkStats = await probe(() => (window.__town3dDraw ? window.__town3dDraw() : null))
    const walkClip = await probe(() => (window.__town3dResClip ? window.__town3dResClip() : null))
    checkFrame(s.id, s.label, 'walk', walkStat)
    if (errBucket.length) for (const m of errBucket) flags.push({ id: s.id, label: s.label, kind: 'error', detail: 'walk ' + m })
    // 窓辺へ戻す
    await page.evaluate(() => { if (window.__town3dLand) window.__town3dLand(false); if (window.__town3dFly) window.__town3dFly(false) })
    await page.waitForTimeout(600)
    modeReport.push({ id: s.id, label: s.label, fly: { stat: flyStat, stats: flyStats }, walk: { stat: walkStat, stats: walkStats, clip: walkClip } })
    process.stdout.write(`  mode ${s.id} fly/walk …fly calls${flyStats?.calls} walk calls${walkStats?.calls}\n`)
  }
}

await browser.close()
cleanup()

// ── レポート出力
const report = { when: new Date().toISOString(), deep: DEEP, scanned: rows.length, flagged: flags.length, flags, rows, modeReport }
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))

const md = []
md.push(`# デバッグ巡回レポート（${DEEP ? '深い(DEEP)' : '基本'}）`)
md.push(`- 実施: ${report.when}`)
md.push(`- 走査: ${rows.length} 情景 / 異常フラグ: **${flags.length} 件**`)
md.push('')
if (flags.length) {
  md.push('## ⚠ 異常フラグ（要対応・目視）')
  for (const f of flags) md.push(`- **[${f.kind}] ${f.label}**（${f.id}）: ${f.detail}`)
} else {
  md.push('## ✅ 客観的な異常フラグは0件（エラー/黒画面/白飛び/配置違反/住民食い込み）')
}
md.push('')
md.push('## 全情景の記録')
md.push('| # | 情景 | 種別 | 輝度(平均/分散) | err | 描画コール | 配置(木/道/線) | 食込(res/peep) |')
md.push('|---|------|------|----------------|-----|-----------|----------------|----------------|')
for (const r of rows) {
  const a = r.audit ? `${r.audit.treeLeft}/${r.audit.houseOnRoad}/${r.audit.houseOnRail}` : '—'
  const c = r.clip ? `${r.clip.resIn}/${r.clip.peepIn}` : '—'
  const calls = r.draw ? r.draw.calls : '—'
  md.push(`| ${r.nn} | ${r.label} | ${r.render} | ${r.stat.mean}/${r.stat.std} | ${r.errors} | ${calls} | ${a} | ${c} |`)
}
if (modeReport.length) {
  md.push('')
  md.push('## モード掃引（代表town3d）')
  md.push('| 情景 | 飛行 描画コール | 飛行 輝度 | 歩行 描画コール | 歩行 輝度 | 歩行 食込 |')
  md.push('|------|----------------|-----------|----------------|-----------|-----------|')
  for (const m of modeReport) md.push(`| ${m.label} | ${m.fly.stats?.calls ?? '—'} | ${m.fly.stat.mean}/${m.fly.stat.std} | ${m.walk.stats?.calls ?? '—'} | ${m.walk.stat.mean}/${m.walk.stat.std} | ${m.walk.clip ? `${m.walk.clip.resIn}/${m.walk.clip.peepIn}` : '—'} |`)
}
md.push('')
md.push('※ スクショは同ディレクトリの NN-<id>.png。輝度の分散(std)が極端に低い=黒画面/描画欠落の疑い、平均が高すぎ=白飛び。')
md.push('※ この巡回で拾えるのは客観的な不具合まで。操作感・没入・iOS実機の発熱/描画差は人の目と実機が要る。')
fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n'))

console.log(`\nWALK ${flags.length ? 'FLAGGED' : 'CLEAN'}: ${rows.length}情景 / 異常${flags.length}件`)
console.log(`出力: ${path.relative(path.join(__dir, '..'), OUT)}/report.md (+ NN-<id>.png)`)
process.exit(flags.length ? 1 : 0)
