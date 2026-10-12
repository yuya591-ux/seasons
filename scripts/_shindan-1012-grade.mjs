// 使い捨て（shindan 2026-10-12・案の画 #1）: 同じ眺めを「今（参考）／案1 水彩のまま／案2 水彩を薄く1枚に／案3 水彩を外す」で撮る。
// 案1〜3 は共通で「色の圧縮をフィルム風（Neutral）＋霞を遠くへ」。開発サーバー 4952 の撮影用の口を使う。本体は変えない。
// 使い方: node scripts/_shindan-1012-grade.mjs <iphone|pc> <window|fly>
import { chromium } from 'playwright'
const [dev = 'iphone', view = 'window'] = process.argv.slice(2)
const DEV = { pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } }[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext(DEV)).newPage()
await p.goto('http://localhost:4952/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1500)
await p.evaluate(() => window.__applyScene('kitaterao-window-3d-sunset')); await p.waitForTimeout(9000)
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="ctrl"]{display:none !important}' })
await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(3000)
if (view === 'fly') {
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3500)
  await p.evaluate(() => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.2)); await p.waitForTimeout(4000)
} else { await p.waitForTimeout(4000) }
const shot = async (tag) => { await p.mouse.move(100, 100); await p.mouse.move(101, 101); await p.waitForTimeout(350); await p.screenshot({ path: `docs/qa/2026-10-12_seasons/mocks/${dev}-grade-${view}-${tag}.png` }) }
await shot('0-ima')
await p.evaluate(() => {
  const { renderer, scene, THREE } = window.__shGet()
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure *= 1.15
  const fog = scene.fog; let n = fog.near, fa = fog.far
  Object.defineProperty(fog, 'near', { get: () => n * 1.6, set: (v) => { n = v }, configurable: true })
  Object.defineProperty(fog, 'far', { get: () => fa * 1.9, set: (v) => { fa = v }, configurable: true })
  window.__shStyle = document.createElement('style'); document.head.appendChild(window.__shStyle)
})
await p.waitForTimeout(600)
await shot('1-suisai-mama')
await p.evaluate(() => { window.__shStyle.textContent = '.town3d-wash{opacity:calc(var(--t3d-wash-a,0.18)*0.45) !important}.town3d-paper,.town3d-paper2{opacity:0.35 !important}' })
await p.waitForTimeout(300)
await shot('2-suisai-usuku')
await p.evaluate(() => { window.__shStyle.textContent = '.town3d-wash,.town3d-paper,.town3d-paper2,.town3d-bleed{display:none !important}.town3d-stage{filter:none !important}' })
await p.waitForTimeout(300)
await shot('3-suisai-nashi')
console.log(dev, view, 'ok')
await b.close()
