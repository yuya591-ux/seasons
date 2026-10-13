// 使い捨て（便3・設計案の案の画）: 開発サーバー 4953（_bin3-vite.config.mjs）で、同じ眺めを案ごとに撮り比べる。本体は変えない。
// 使い方: node scripts/_bin3-mock.mjs <water|fog|probe> <端末 pc|iphone> <情景ID> <眺めの名前> [cam=x,y,z,lx,ly,lz,fov] [plane=y] [fog=base,scale,density,amount] [measure]
//   眺めの名前が window なら窓辺（窓をあけた所）。cam を付けると飛行に切り替えて、描画の直前にカメラをその位置へ置く
import { chromium } from 'playwright'
import fs from 'node:fs'

const [q = 'water', dev = 'pc', scene = 'kitaterao-window-3d', view = 'window', ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((s) => { const i = s.indexOf('='); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)] }))
const OUT = 'docs/qa/2026-10-13_便3/mocks'
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
p.on('console', (m) => { if (m.type() === 'error' && /shader|program|GLSL|ERROR/i.test(m.text())) errs.push(m.text().slice(0, 300)) })
await p.goto('http://localhost:4953/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate((s) => window.__applyScene(s), scene)
await p.waitForTimeout(11000)
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"]{display:none !important}' })
await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(3000)
await p.addScriptTag({ content: fs.readFileSync('scripts/_bin3-inject.js', 'utf8') })
await p.evaluate(async () => { window.__bin3.mods = await window.__shMods() })
if (!(await p.evaluate(() => window.__bin3.setup()))) { console.log('撮影用の口が無い'); process.exit(1) }
if (opt.pose) {
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
  await p.evaluate((a) => window.__town3dFlyPose(...a), opt.pose.split(',').map(Number)); await p.waitForTimeout(3500)
  console.log('カメラ', JSON.stringify(await p.evaluate(() => { const c = window.__shGet().camera; const d = c.getWorldDirection(new (window.__shGet().THREE.Vector3)()); return { p: c.position.toArray().map((v) => +v.toFixed(1)), d: d.toArray().map((v) => +v.toFixed(3)), fov: c.fov } })))
}
if (opt.cam) {
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
  const [x, y, z, lx, ly, lz, fov] = opt.cam.split(',').map(Number)
  { const dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz) || 1; const yaw = Math.atan2(dx, -dz) // 自機はカメラのすぐ後ろ（写らない・上空の扱いに入らない）
    await p.evaluate((a) => window.__town3dFlyPose(...a), [x - dx / d * 5, y, z - dz / d * 5, yaw, 0]); await p.waitForTimeout(1500) }
  await p.evaluate((c) => { window.__bin3.cam = c }, { p: [x, y, z], l: [lx, ly, lz], fov: fov || undefined })
  await p.waitForTimeout(7000) // 飛行に入った直後の霧の移り変わりが落ち着くまで
}
// 時間の移ろいを止めて、案どうしの差を設定の差だけにする
await p.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
const shot = async (tag) => {
  await p.mouse.move(DEV.viewport.width / 2, DEV.viewport.height / 2); await p.mouse.move(DEV.viewport.width / 2 + 1, DEV.viewport.height / 2 + 1)
  await p.waitForTimeout(1200)
  await p.screenshot({ path: `${OUT}/${q}-${dev}-${view}-${tag}.png` })
}
const meas = {}
if (q === 'probe') {
  const info = await p.evaluate(() => {
    const g = window.__shGet(); const c = g.camera.position
    const hs = []; for (let x = -200; x <= 200; x += 25) for (let z = -200; z <= 200; z += 25) hs.push(window.__town3dGroundAt(x, z))
    hs.sort((a, b) => a - b)
    return { cam: [c.x, c.y, c.z].map((v) => +v.toFixed(1)), ground: { p10: +hs[Math.floor(hs.length * 0.1)].toFixed(1), p30: +hs[Math.floor(hs.length * 0.3)].toFixed(1), p50: +hs[Math.floor(hs.length * 0.5)].toFixed(1), p80: +hs[Math.floor(hs.length * 0.8)].toFixed(1) }, water: window.__bin3.waterBox(), fog: [g.scene.fog.near, g.scene.fog.far].map((v) => +v.toFixed(1)) }
  })
  console.log(JSON.stringify(info))
  await shot('probe')
} else if (q === 'map') {
  const [cx, cz, h] = (opt.at || '60,-60,420').split(',').map(Number)
  const url = await p.evaluate(([cx, cz, h]) => { const f = window.__shGet().scene.fog; const n0 = f.near, f0 = f.far; f.near = 1e5; f.far = 2e5; const u = window.__town3dShotAt(cx, h, cz, cx, 0, cz - 0.01, 50); f.near = n0; f.far = f0; return u }, [cx, cz, h])
  fs.writeFileSync(OUT + '/explore/map-' + view + '.png', Buffer.from(url.split(',')[1], 'base64'))
} else if (q === 'ground') {
  const pts = (opt.pts || '').split(';').map((t) => t.split(',').map(Number))
  console.log(JSON.stringify(await p.evaluate((pts) => pts.map(([x, z]) => [x, z, +window.__town3dGroundAt(x, z).toFixed(1)]), pts)))
} else if (q === 'dbg') {
  await p.evaluate((y) => { window.__bin3.dist = 0; window.__bin3.frOne = true; window.__bin3.water(2, y) }, Number(opt.plane)); await p.waitForTimeout(2000); await shot('dbg')
  const r = await p.evaluate(() => { const g = window.__shGet(); const rt = window.__bin3.reflector.getRenderTarget(); const w = rt.width, h = rt.height; const buf = new Uint16Array(4); const out = []
    const half = (u) => { const s = (u & 0x8000) ? -1 : 1, e = (u >> 10) & 0x1f, f = u & 0x3ff; return e === 0 ? s * Math.pow(2, -14) * f / 1024 : s * Math.pow(2, e - 15) * (1 + f / 1024) }
    for (const [fx, fy] of [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75], [0.5, 0.1], [0.5, 0.9]]) { g.renderer.readRenderTargetPixels(rt, Math.floor(w * fx), Math.floor(h * fy), 1, 1, buf); out.push([...buf].map(half).map((v) => +v.toFixed(3))) }
    return { w, h, out, tm: window.__bin3.reflector.material.uniforms.textureMatrix.value.elements.map((v) => +v.toFixed(3)) } })
  console.log(JSON.stringify(r))
} else if (q === 'water') {
  await shot('0-ima'); if (opt.measure) meas.ima = await p.evaluate(() => window.__bin3.measureNow())
  const n1 = await p.evaluate(() => window.__bin3.water(1)); await p.waitForTimeout(1500)
  await shot('1-sora'); if (opt.measure) meas.sora = await p.evaluate(() => window.__bin3.measureNow())
  if (opt.plane !== undefined) {
    await p.evaluate((y) => window.__bin3.water(2, y), Number(opt.plane)); await p.waitForTimeout(1500)
    await shot('2-utsuri'); if (opt.measure) meas.utsuri = await p.evaluate(() => window.__bin3.measureNow())
  }
  meas.waterMeshes = n1
} else if (q === 'fog') {
  const [base, scale, density, amount] = (opt.fog || '0,6,0.015,0.85').split(',').map(Number)
  await shot('0-ima'); if (opt.measure) meas.ima = await p.evaluate(() => window.__bin3.measureNow())
  await p.evaluate((prm) => window.__bin3.fog(1, prm), { base, scale, density, amount }); await p.waitForTimeout(2500)
  await shot('1-hau'); if (opt.measure) meas.hau = await p.evaluate(() => window.__bin3.measureNow())
  await p.evaluate((prm) => window.__bin3.fog(2, prm), { base, scale, density, amount }); await p.waitForTimeout(2500)
  await shot('2-nagare'); if (opt.measure) meas.nagare = await p.evaluate(() => window.__bin3.measureNow())
}
console.log(q, dev, scene, view, JSON.stringify(meas), errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
