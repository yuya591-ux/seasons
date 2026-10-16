// 便11（2026-10-16）の確かめ（外の目の疑い 2026-10-16）: 雲海の陰の傾きを「隣の画素との差（dFdx・dFdy）」で取る作りは、GPU が 2×2 画素の組で差を取るので、
// iPhone の描く細かさで 2×2 の塊やちらつきが出ないかを、雲のすぐ上の寄りの眺めで、前（4966）と後（4963）の同じ眺めの数で比べる。
//   塊: 横（縦）に隣り合う画素の明るさの差を、2×2 の組の中（0↔1）と組の境目（1↔2）に分けて平均し、境目÷中 の比を見る。
//       塊が出ると境目だけ差が大きくなり、比が 1 より大きくなる（なめらかな画はほぼ 1）
//   ちらつき: 続くこまの明るさの、前後のこまの平均からのずれ（時間の2階の差）の平均と、上位1%の値。なめらかに流れる雲は小さく、明滅は大きい
// 描く細かさは iPhone の飛行の天井（__town3dQuality の cap と fly の小さい方）。カメラは描く直前に毎こま同じ所へ置く（時間だけが進む）
// 使い方: node scripts/_bin11-kumo-check.mjs   出力: QA_OUT（既定 docs/qa/2026-10-16_便11/gate）/kumo-check.json と、各眺めの1こま目の画
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.env.QA_OUT || 'docs/qa/2026-10-16_便11/gate'
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const IPHONE = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE }
const VIEWS = {
  // 雲のすぐ上（雲の面の高さ 86 の 10m 上から斜めに見下ろす）と、真下寄りに見下ろす寄り
  // 雲の切れ間（町の上 15,-25 など4か所）から離れた所に置く（初めは切れ間にかかり、透けた町が多く写った）
  near: { pose: [-80, 96, 150, 3.14159, -0.3], cam: { p: [-80, 96, 150], l: [-80, 86, 115] } },
  down: { pose: [-60, 92, 70, 3.14159, -0.8], cam: { p: [-60, 92, 70], l: [-60, 84, 58] } },
}
const FRAMES = 12
// 比べる2つの開発サーバー（既定 前＝4966・後＝4963）。KUMO_PORTS=<前>,<後>,<名前> で替える（便11: 画素の差で傾きを取った 6b493d9 を 4969 で測った）
const [P_A, P_B, TAG] = (process.env.KUMO_PORTS || '4966,4963,').split(',')
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
async function measure(port, vname) {
  const v = VIEWS[vname]
  const ctx = await b.newContext(IPHONE)
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }) })
  await ctx.addInitScript(() => { let a = 20261016; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForTimeout(2500)
  await p.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {})
  await p.waitForTimeout(1200)
  await p.evaluate((s) => window.__applyScene(s), 'kitaterao-window-3d')
  await p.waitForTimeout(11000)
  await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(3000)
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
  await p.evaluate((a) => window.__town3dFlyPose(...a), v.pose); await p.waitForTimeout(6000)
  const pr = await p.evaluate(() => { const q = window.__town3dQuality(); const v = Math.min(q.cap, q.fly); window.__shGet().setCurPR(v); return v })
  await p.waitForTimeout(1500)
  // 描く直前にカメラを置き、描いた直後にこまを読み出す
  const r = await p.evaluate(async ([cam, N]) => {
    const g = window.__shGet(); const { renderer, camera, composer } = g; const gl = renderer.getContext()
    const frames = []
    const orig = composer.render.bind(composer)
    let want = 0
    composer.render = (...a) => {
      camera.position.set(...cam.p); camera.up.set(0, 1, 0); camera.lookAt(...cam.l); camera.updateMatrixWorld()
      orig(...a)
      if (want > 0) {
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4)
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
        const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]
        frames.push({ w, h, L, png: frames.length === 0 ? (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const id = x.createImageData(w, h); for (let yy = 0; yy < h; yy++) id.data.set(px.subarray((h - 1 - yy) * w * 4, (h - yy) * w * 4), yy * w * 4); x.putImageData(id, 0, 0); return c.toDataURL('image/png') })() : null })
        want--
      }
    }
    await new Promise((res) => setTimeout(res, 800))
    // アプリの描画の繰り返しを止め、雲海の時刻（前と後のどちらの雲海の材も同じ uTime を使う）を 1/60 秒ずつ等しく進めて自分で描く
    // （アプリの毎こまの刻みは不揃いで、流れる雲の模様の動きが明滅として数えられたため）
    window.__town3dPaused(true); await new Promise((res) => setTimeout(res, 300))
    let uT = null
    g.scene.traverse((o) => { const m = o.material; if (!uT && o.isMesh && m && m.customProgramCacheKey && /^cloudsea/.test(m.customProgramCacheKey())) { const pu = renderer.properties.get(m).uniforms; if (pu && pu.uTime) uT = pu.uTime } })
    const t0 = uT ? uT.value : 0
    want = N
    for (let k = 0; k < N; k++) { if (uT) uT.value = t0 + k / 60; composer.render() }
    composer.render = orig
    const { w, h } = frames[0]
    // 画の下 6割（雲の面）だけを見る。gl の行は下から上なので、行 0〜0.6h が画の下 6割
    const y0 = 1, y1 = Math.floor(h * 0.6) - 1
    const L = frames[0].L
    let inX = 0, nInX = 0, bdX = 0, nBdX = 0, inY = 0, nInY = 0, bdY = 0, nBdY = 0
    for (let y = y0; y < y1; y++) for (let x = 0; x < w - 1; x++) { const d = Math.abs(L[y * w + x + 1] - L[y * w + x]); if (x % 2 === 0) { inX += d; nInX++ } else { bdX += d; nBdX++ } }
    for (let y = y0; y < y1 - 1; y++) for (let x = 0; x < w; x++) { const d = Math.abs(L[(y + 1) * w + x] - L[y * w + x]); if (y % 2 === 0) { inY += d; nInY++ } else { bdY += d; nBdY++ } }
    // 時間の2階の差（こま t の、前後のこまの平均からのずれ）
    const t2 = []
    for (let k = 1; k < frames.length - 1; k++) { const A = frames[k - 1].L, B = frames[k].L, C = frames[k + 1].L; for (let y = y0; y < y1; y += 2) for (let x = 0; x < w; x += 2) { const i = y * w + x; t2.push(Math.abs(B[i] - (A[i] + C[i]) / 2)) } }
    t2.sort((p, q) => p - q)
    const mean = t2.reduce((s, v) => s + v, 0) / t2.length
    return { timeHooked: !!uT, w, h, frames: frames.length, quadX: +(bdX / nBdX / (inX / nInX)).toFixed(3), quadY: +(bdY / nBdY / (inY / nInY)).toFixed(3), gradX: +(inX / nInX).toFixed(3), gradY: +(inY / nInY).toFixed(3), flickMean: +mean.toFixed(3), flickP99: +t2[Math.floor(t2.length * 0.99)].toFixed(2), png: frames[0].png }
  }, [v.cam, FRAMES])
  await ctx.close()
  const file = `${OUT}/kumo-${TAG}${String(port) === P_A ? 'ima' : 'ato'}-${vname}.png`
  fs.writeFileSync(file, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png
  return { pr, ...r, file, errs }
}
const res = {}
for (const vname of Object.keys(VIEWS)) {
  const ima = await measure(+P_A, vname), ato = await measure(+P_B, vname)
  res[vname] = { ima, ato }
  console.log(vname, '今', JSON.stringify({ ...ima, errs: ima.errs.length }), '\n  後', JSON.stringify({ ...ato, errs: ato.errs.length }))
}
await b.close()
fs.writeFileSync(`${OUT}/kumo-check${TAG ? '-' + TAG : ''}.json`, JSON.stringify({ at: new Date().toISOString(), ...res }, null, 1))
