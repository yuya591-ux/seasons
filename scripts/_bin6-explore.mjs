// 使い捨て（便6）: 検査で撮る眺めを決めるための下見。開発サーバー 4963（_bin6-vite.config.mjs）で撮る。
// 使い方: node scripts/_bin6-explore.mjs <端末 pc|iphone> <情景ID> <名前=x,y,z,lx,ly,lz,fov | 名前=window | 名前=walk:x,z,lx,lz> …
import { chromium } from 'playwright'
import fs from 'node:fs'

const [dev = 'pc', scene = 'kitaterao-window-3d', ...views] = process.argv.slice(2)
const OUT = 'docs/qa/2026-10-13_便6/explore'
fs.mkdirSync(OUT, { recursive: true })
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext(DEV)).newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:4963/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate((s) => window.__applyScene(s), scene)
await p.waitForTimeout(11000)
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"]{display:none !important}' })
await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(3000)
await p.evaluate(() => {
  const S = (window.__b6x = { cam: null })
  const { camera, composer } = window.__shGet(); const orig = composer.render.bind(composer)
  composer.render = (...a) => { const c = S.cam; if (c) { camera.position.set(...c.p); camera.lookAt(...c.l); if (c.fov && camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix() } camera.updateMatrixWorld() } return orig(...a) }
})
console.log('窓辺のカメラ', JSON.stringify(await p.evaluate(() => { const c = window.__shGet().camera; const d = c.getWorldDirection(new (window.__shGet().THREE.Vector3)()); return [c.position.x, c.position.y, c.position.z, c.position.x + d.x * 10, c.position.y + d.y * 10, c.position.z + d.z * 10, c.fov].map((v) => +v.toFixed(2)) })))
let flying = false
for (const v of views) {
  const [name, spec] = v.split('=')
  if (spec !== 'window') {
    if (!flying) { await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000); flying = true }
    let c
    if (spec.startsWith('walk:')) { const [x, z, lx, lz] = spec.slice(5).split(',').map(Number); c = await p.evaluate(([x, z, lx, lz]) => { const g = window.__town3dGroundAt(x, z), gl = window.__town3dGroundAt(lx, lz); return [x, g + 1.6, z, lx, gl + 1.4, lz, 62] }, [x, z, lx, lz]) }
    else c = spec.split(',').map(Number)
    const [x, y, z, lx, ly, lz, fov] = c
    const dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz) || 1
    await p.evaluate((a) => window.__town3dFlyPose(...a), [x - dx / d * 5, y, z - dz / d * 5, Math.atan2(dx, -dz), 0]); await p.waitForTimeout(1200)
    await p.evaluate((cc) => { window.__b6x.cam = { p: cc.slice(0, 3), l: cc.slice(3, 6), fov: cc[6] } }, c)
    await p.waitForTimeout(5000)
  }
  await p.screenshot({ path: `${OUT}/${dev}-${name}.png` })
  console.log(name, '撮った')
}
console.log(errs.length ? 'ERR ' + errs.slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
