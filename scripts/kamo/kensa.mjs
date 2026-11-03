// 便18 の検査: 角部屋の窓の外の鴨川の町を、本物の GPU（画面なしの Chromium・D3D11）で開いて確かめる。
// 前に: npm run build のあと npx vite preview --port 4961 --strictPort（PORT で替えられる）
// 使い方: node scripts/kamo/kensa.mjs [検査の名前…]   （名前を省くと全部。1つでも外れたら exit 1）
//   K1 鴨川の角部屋が開き、鴨川の町が組めて、エラーと GL の型の食い違い（影の図の作り忘れ）が無い
//   K2 鴨川の角部屋は飛べない（飛ぶ・降りるが揃うまで窓辺だけ）
//   K3 鴨川の町のデータが読めない時は、前の角部屋（北寺尾の町）のまま開く（エラー無し）
//   K4 ?kamo=0 で前の角部屋に戻る
//   K5 角部屋でない情景（北寺尾・谷戸）は鴨川の町を組まない（エラー無し）
//   K6 鴨川の角部屋の町の3Dの舞台は、部屋と降る物だけを描く（北寺尾の町を描かない＝描く呼び出し 600 未満）
//   K7 雪の夕の空は曇天の灰（乗り出して見上げた空の明るさが 0.25 以上・物理の空だと空の上が黒くなった）
import { chromium } from 'playwright'
const PORT = process.env.PORT || 4961, BASE = `http://localhost:${PORT}/seasons/`
const want = new Set(process.argv.slice(2))
const run = (k) => !want.size || want.has(k)
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const results = []
async function open(scene, { q = '', block = false, view = null, win = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' }) // service worker を止める（止めないと読み込みの網を通らずに取りに行く＝K3 が測れない）
  const p = await ctx.newPage()
  const errs = [], gl = []
  p.on('pageerror', (e) => errs.push('PE ' + e.message))
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t.slice(0, 200)); if (/GL_INVALID|INVALID_OPERATION/.test(t)) gl.push(t.slice(0, 160)) })
  if (block) await ctx.route('**/kamo/**', (r) => r.abort())
  await p.goto(`${BASE}?dev=1${q ? '&' + q : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.locator('.gate').click().catch(() => {})
  await p.waitForTimeout(800)
  await p.evaluate((id) => window.__applyScene(id), scene)
  const ok = await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).then(() => true).catch(() => false)
  if (view) await p.evaluate(([y, q2]) => window.__town3dSetView(y, q2), view)
  if (win) { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(1200); if (win === 'lean') { await p.evaluate(() => window.__town3dLean(true)); await p.waitForTimeout(1500) } }
  await p.waitForTimeout(1500)
  return { p, ctx, errs, gl, ok }
}
const check = (k, pass, detail) => { results.push({ k, pass, detail }); console.log(`${pass ? '○' : '×'} ${k} ${detail}`) }

if (run('K1') || run('K2') || run('K6')) {
  const o = await open('autumn-dusk-corner-room')
  const k = await o.p.evaluate(() => window.__town3dKamo())
  const st = await o.p.evaluate(() => window.__town3dStats())
  if (run('K1')) check('K1', o.ok && !!k && !o.errs.length && !o.gl.length, `組めた ${o.ok}・鴨川 ${k ? '有り' : '無し'}・外した建物 ${k && k.removed}・エラー ${o.errs.length}・GL ${o.gl.length}${o.gl.length ? '（' + o.gl[0] + '）' : ''}`)
  if (run('K2')) { await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(1500); const st2 = await o.p.evaluate(() => window.__town3dStats()); check('K2', st2 && st2.flyable === false, `飛べる ${st2 && st2.flyable}`) }
  if (run('K6')) { const d = await o.p.evaluate(() => window.__town3dDraw()); check('K6', d && d.calls < 600, `町の3Dの舞台の描く呼び出し ${d && d.calls}（600 未満で合格）`) }
  void st; await o.ctx.close()
}
if (run('K3')) {
  const o = await open('autumn-dusk-corner-room', { block: true })
  const k = await o.p.evaluate(() => window.__town3dKamo())
  check('K3', o.ok && !k && !o.errs.filter((e) => !/kamo\/|Failed to load resource/.test(e)).length, `組めた ${o.ok}・鴨川 ${k ? '有り' : '無し'}・エラー ${o.errs.length}${o.errs.length ? '（' + o.errs[0] + '）' : ''}`)
  await o.ctx.close()
}
if (run('K4')) {
  const o = await open('autumn-dusk-corner-room', { q: 'kamo=0' })
  const k = await o.p.evaluate(() => window.__town3dKamo())
  check('K4', o.ok && !k && !o.errs.length, `組めた ${o.ok}・鴨川 ${k ? '有り' : '無し'}・エラー ${o.errs.length}`)
  await o.ctx.close()
}
if (run('K5')) {
  for (const id of ['kitaterao-window-3d', 'shishigaya-window-3d']) {
    const o = await open(id)
    const k = await o.p.evaluate(() => window.__town3dKamo())
    const st = await o.p.evaluate(() => window.__town3dStats())
    check('K5', o.ok && !k && !o.errs.length && st.flyable === true, `${id}: 組めた ${o.ok}・鴨川 ${k ? '有り' : '無し'}・飛べる ${st && st.flyable}・エラー ${o.errs.length}`)
    await o.ctx.close()
  }
}
if (run('K7')) {
  const o = await open('winter-snow-dusk-corner-room', { view: [0, 0.45], win: 'lean' })
  const png = await o.p.screenshot({ clip: { x: 560, y: 20, width: 160, height: 60 } })
  const lum = await o.p.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; return s / (d.length / 4) }, png.toString('base64'))
  check('K7', lum >= 0.25, `雪の夕の見上げた空の明るさ ${lum.toFixed(3)}（0.25 以上で合格）`)
  await o.ctx.close()
}
await b.close()
const bad = results.filter((r) => !r.pass)
console.log(`検査 ${results.length} 本・外れ ${bad.length}`)
process.exit(bad.length ? 1 : 0)
