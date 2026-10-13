// 使い捨て（便5・設計案の案の画）: 開発サーバー 4957（_bin5-vite.config.mjs）で、同じ眺めを案ごとに撮り比べる。本体は変えない。便3 の _bin3-mock.mjs の写し。
// 使い方: node scripts/_bin5-mock.mjs <tree|surf|probe> <端末 pc|iphone> <情景ID> <眺めの名前> [cam=x,y,z,lx,ly,lz,fov] [measure]
//   眺めの名前が window なら窓辺（窓をあけた所）。cam を付けると飛行に切り替えて、描画の直前にカメラをその位置へ置く
import { chromium } from 'playwright'
import fs from 'node:fs'

const [q = 'tree', dev = 'pc', scene = 'kitaterao-window-3d', view = 'window', ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((s) => { const i = s.indexOf('='); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)] }))
const OUT = 'docs/qa/2026-10-13_便5/mocks'
fs.mkdirSync(OUT, { recursive: true })
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext(DEV)
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => { if (m.type() === 'error' && /shader|program|GLSL|ERROR/i.test(m.text())) errs.push(m.text().slice(0, 400)) })
await p.goto('http://localhost:4957/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate((s) => window.__applyScene(s), scene)
await p.waitForTimeout(11000)
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"]{display:none !important}' })
if (!opt.closed) { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(3000) }
await p.addScriptTag({ content: fs.readFileSync('scripts/_bin5-inject.js', 'utf8') })
if (!(await p.evaluate(() => window.__bin5.setup()))) { console.log('撮影用の口が無い'); process.exit(1) }
if (opt.cam) {
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
  const [x, y, z, lx, ly, lz, fov] = opt.cam.split(',').map(Number)
  { const dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz) || 1; const yaw = Math.atan2(dx, -dz) // 自機はカメラのすぐ後ろ（写らない）
    await p.evaluate((a) => window.__town3dFlyPose(...a), [x - dx / d * 5, y, z - dz / d * 5, yaw, 0]); await p.waitForTimeout(1500) }
  await p.evaluate((c) => { window.__bin5.cam = c }, { p: [x, y, z], l: [lx, ly, lz], fov: fov || undefined })
  await p.waitForTimeout(7000) // 飛行に入った直後の霧の移り変わりが落ち着くまで
}
if (opt.walk) { // 目の高さ（地面＋1.6m）にカメラを置く。walk=x,z,lx,lz[,目の高さ,見る所の高さ]
  const [x, z, lx, lz, eh = 1.6, lh = 1.4] = opt.walk.split(',').map(Number)
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
  await p.evaluate((a) => window.__town3dFlyPose(...a), [x, 6, z + 5, Math.PI, -0.05]); await p.waitForTimeout(1500)
  await p.evaluate(([x, z, lx, lz, eh, lh]) => { const g = window.__town3dGroundAt(x, z), gl = window.__town3dGroundAt(lx, lz); window.__bin5.cam = { p: [x, g + eh, z], l: [lx, gl + lh, lz], fov: 62 } }, [x, z, lx, lz, eh, lh])
  await p.waitForTimeout(6000)
}
// 時間の移ろいを止めて、案どうしの差を設定の差だけにする
await p.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
const shot = async (tag) => {
  await p.mouse.move(DEV.viewport.width / 2, DEV.viewport.height / 2); await p.mouse.move(DEV.viewport.width / 2 + 1, DEV.viewport.height / 2 + 1)
  await p.waitForTimeout(1500)
  await p.screenshot({ path: `${OUT}/${q}-${dev}-${view}-${tag}.png` })
}
const meas = {}
const M = async (k) => { if (opt.measure) meas[k] = await p.evaluate(() => window.__bin5.measureNow()) }
if (q === 'probe') {
  const info = await p.evaluate(() => { const R = window.__b5R; return { trees: R && R.trees && R.trees.length, leafMats: R && R.leafMats && R.leafMats.length, roof: R && R.roof && R.roof.length, wall: R && R.wall.length, ground: !!(R && R.ground), road: !!(R && R.road) } })
  console.log(JSON.stringify(info))
  await shot('probe')
} else if (q === 'tree') {
  await shot('0-ima'); await M('ima')
  meas.n1 = await p.evaluate(() => [window.__bin5.trees(1), window.__bin5.plant(1)]); await p.waitForTimeout(2500)
  await shot('1-katachi'); await M('katachi')
  meas.n2 = await p.evaluate(() => [window.__bin5.trees(2), window.__bin5.plant(1)]); await p.waitForTimeout(2500)
  await shot('2-ha'); await M('ha')
  await p.evaluate(() => [window.__bin5.trees(0), window.__bin5.plant(0)]); await p.waitForTimeout(2500); await M('ima2')
} else if (q === 'surf') {
  await shot('0-ima'); await M('ima')
  meas.n1 = await p.evaluate(() => window.__bin5.surf(1)); await p.waitForTimeout(3000)
  await shot('1-moyou'); await M('moyou')
  meas.n2 = await p.evaluate(() => window.__bin5.surf(2)); await p.waitForTimeout(3000)
  await shot('2-outotsu'); await M('outotsu')
  await p.evaluate(() => window.__bin5.surf(0)); await p.waitForTimeout(3000); await M('ima2')
}
console.log(q, dev, scene, view, JSON.stringify(meas), errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
