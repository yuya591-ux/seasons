// 使い捨て（便6）: iPhone の幅の低空飛行の眺めで、同じページの中で切り替えを交互に繰り返し、GPU の時計の時間を比べる（時間帯のぶれを打ち消す）。
// 切り替え: そのまま（V0）・木を隠す（V1）・面の模様を外す（V2＝模様の材を素の写しに替える）・葉の切り抜きを止める（V3＝樹冠の材の alphaTest を 0）
// 使い方: node scripts/_bin6-gpuparts.mjs <開発サーバーの URL> [回数]
import { chromium } from 'playwright'
const BASE = process.argv[2] || 'http://localhost:4963/seasons/'
const N = Number(process.argv[3] || 8)
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const CAM = [9.8, 48, 38.8, -19.4, -15.9, -32.4, 73.6]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA })
await ctx.addInitScript(() => { try { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.sceneId = 'kitaterao-window-3d'; st.sceneAt = Date.now(); localStorage.setItem(k, JSON.stringify(st)) } catch {} })
const p = await ctx.newPage()
await p.goto(BASE + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 }); await wait(2500)
await p.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {}); await wait(1500)
await p.evaluate(() => window.__applyScene('kitaterao-window-3d')); await wait(11000)
await p.evaluate(() => window.__town3dWindow(true)); await wait(3000)
await p.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
{ const [x, y, z, lx, , lz] = CAM, dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz); await p.evaluate((a) => window.__town3dFlyPose(...a), [x - dx / d * 5, y, z - dz / d * 5, Math.atan2(dx, -dz), 0]); await wait(1500) }
const r = await p.evaluate(async ([c, N]) => {
  const { renderer, camera, composer, scene } = window.__shGet(); const gl = renderer.getContext(); const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const orig = composer.render.bind(composer)
  composer.render = (...a) => { camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); camera.updateMatrixWorld(); return orig(...a) }
  window.__shGet().setCurPR(1)
  await new Promise((res) => setTimeout(res, 5000))
  const run = async (n) => { const ts = []; for (let i = 0; i < n; i++) { await new Promise((res) => requestAnimationFrame(res)); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); composer.render(); gl.endQuery(ext.TIME_ELAPSED_EXT); await new Promise((res) => { const t = () => { if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) res(); else setTimeout(t, 2) }; t() }); if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) ts.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q) } ts.sort((a, b) => a - b); return ts[Math.floor(ts.length / 2)] }
  const trees = (window.__b6R && window.__b6R.trees) || []
  const patMeshes = []; scene.traverse((o) => { const m = o.material; if (o.isMesh && m && !Array.isArray(m) && m.onBeforeCompile && String(m.onBeforeCompile).includes('vSfW')) patMeshes.push(o) })
  const plain = new Map(); for (const o of patMeshes) { if (!plain.has(o.material)) plain.set(o.material, o.material.clone()) }
  const crownMats = new Set(); for (const t of trees) { const lm = t.children.find((x) => x.isMesh); if (lm && lm.material.alphaTest > 0) crownMats.add(lm.material) }
  const set = (v) => {
    for (const t of trees) t.visible = v !== 1
    for (const o of patMeshes) { if (!o.userData.__m0) o.userData.__m0 = o.material; o.material = v === 2 ? plain.get(o.userData.__m0) : o.userData.__m0 }
    for (const m of crownMats) { const want = v === 3 ? 0 : 0.5; if (m.alphaTest !== want) { m.alphaTest = want; m.needsUpdate = true } }
  }
  // 材の組み直しを先に済ませる（初めの1回は組み直しの時間が入るので捨てる）
  for (const v of [0, 1, 2, 3, 0]) { set(v); await run(5) }
  const res = { 0: [], 1: [], 2: [], 3: [] }
  for (let i = 0; i < N; i++) for (const v of [0, 1, 2, 3]) { set(v); await run(3); res[v].push(await run(20)) }
  set(0)
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(3) }
  return { patMeshes: patMeshes.length, crownMats: crownMats.size, trees: trees.length, V0: med(res[0]), V1noTrees: med(res[1]), V2noPattern: med(res[2]), V3noAlpha: med(res[3]) }
}, [CAM, N])
console.log(BASE, JSON.stringify(r))
await b.close()
