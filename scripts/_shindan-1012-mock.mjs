// 使い捨て（shindan 2026-10-12・案の画）: 開発サーバー 4952（_shindan-vite.config.mjs）で、同じ眺めを
// 「今のまま／光と陰を整える／＋PC向けの高精細」で撮り比べる。本体のファイルは変えない。
// 使い方: node scripts/_shindan-1012-mock.mjs <端末 pc|iphone> <眺め window|fly|walk>
import { chromium } from 'playwright'
import fs from 'node:fs'

const [dev = 'pc', view = 'window'] = process.argv.slice(2)
const OUT = 'docs/qa/2026-10-12_seasons/mocks'
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
await p.goto('http://localhost:4952/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await p.waitForTimeout(9000)
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"]{display:none !important}' })
if (view === 'window') { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(3000) }
if (view === 'fly' || view === 'walk') {
  await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(1500)
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
  await p.evaluate(() => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.2)); await p.waitForTimeout(3000)
}
if (view === 'walk') {
  await p.evaluate(() => window.__town3dFlyPose(-14, 6, 24, Math.PI * 0.85, -0.02)); await p.waitForTimeout(800)
  await p.evaluate(() => window.__town3dLandToggle(true)); await p.waitForTimeout(4000)
}
// 時間の移ろいを止めて、案どうしの差を設定の差だけにする
await p.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
const shot = async (tag) => {
  await p.mouse.move(DEV.viewport.width / 2, DEV.viewport.height / 2); await p.mouse.move(DEV.viewport.width / 2 + 1, DEV.viewport.height / 2 + 1)
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${OUT}/${dev}-${view}-${tag}.png` })
}
const ok = await p.evaluate(() => typeof window.__shGet === 'function')
if (!ok) { console.log('撮影用の口が無い'); process.exit(1) }
await shot('0-ima')
const info = await p.evaluate(() => {
  const g = window.__shGet(); const { renderer, scene } = g
  // 案1: 画風はそのまま、精細に（内部で2倍の細かさで描いて縮める・影を4096に）＝PC向けの段の見本
  g.setCurPR(Math.min(2, window.devicePixelRatio * 2))
  g.sun.shadow.mapSize.set(4096, 4096); if (g.sun.shadow.map) { g.sun.shadow.map.dispose(); g.sun.shadow.map = null }
  renderer.shadowMap.needsUpdate = true
  return { pr: renderer.getPixelRatio() }
})
await p.waitForTimeout(2500)
await shot('1-seisai')
await p.evaluate(() => {
  const g = window.__shGet(); const { renderer, scene, THREE } = g
  // 案2: 背景を写実寄りへ一段（色の圧縮をフィルム風に・霞を遠くへ・水彩の層を薄く）
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure *= 1.15
  const fog = scene.fog; let n = fog.near, fa = fog.far
  Object.defineProperty(fog, 'near', { get: () => n * 1.6, set: (v) => { n = v }, configurable: true })
  Object.defineProperty(fog, 'far', { get: () => fa * 1.9, set: (v) => { fa = v }, configurable: true })
  const st = document.createElement('style'); st.textContent = '.town3d-wash{opacity:calc(var(--t3d-wash-a,0.18)*0.45) !important}.town3d-paper,.town3d-paper2{opacity:0.35 !important}'; document.head.appendChild(st)
})
await p.waitForTimeout(2500)
await shot('2-shajitsu')
console.log(dev, view, JSON.stringify(info), errs.length ? 'ERR ' + errs.slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
