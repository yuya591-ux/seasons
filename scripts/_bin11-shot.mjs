// 便11（2026-10-16）の撮影: 便10 の _bin10-shot.mjs の写し。案の切り替え（?b10）と案の差し込みを外し、撮る開発サーバーの番号を B11_PORT で選ぶ
// （前＝今のコード f69e716 の 4966・後＝この作業ツリーの 4963。どちらも scripts/_bin11-vite.config.mjs）。
// 使い方: B11_PORT=<番号> node scripts/_bin11-shot.mjs <端末 pc|iphone> <情景ID> <眺め> <名前> [wait=ms] [settle=ms] [t=秒] [js=後で走らせる式]
//   眺め: still＝情景を開いたまま／open＝窓をあける（3Dの街）／lean＝窓から乗り出す（2D の窓）／fly=x,y,z,yaw,pitch＝飛行の位置と向き（__town3dFlyPose）
import { chromium } from 'playwright'
import fs from 'node:fs'

const [dev = 'pc', scene = 'summer-rain-dusk', view = 'still', name = 'shot', ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((s) => { const i = s.indexOf('='); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)] }))
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-16_便11/shots'
fs.mkdirSync(OUT, { recursive: true })
const PORT = process.env.B11_PORT || 4963
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const ctx = await b.newContext(DEV)
// 両方のページの Math.random の種をそろえる（時々の出来事や鳥の数を前と後でそろえる・便7 の測りと同じ）
await ctx.addInitScript(() => { let a = 20261016; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => { if (m.type() === 'error' && /shader|program|GLSL|ERROR|compile|例外/i.test(m.text())) errs.push(m.text().slice(0, 600)) })
await p.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate((s) => window.__applyScene(s), scene)
await p.waitForTimeout(+(opt.wait || 9000))
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"], [class*="fly"], [class*="hint"], [class*="guide"], [class*="tip"], button{display:none !important}' })
if (view === 'open') { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(3000) }
if (view === 'lean') { await p.evaluate(() => window.__renderer.setLeanOut(true)); await p.waitForTimeout(2000) }
if (view.startsWith('fly=')) {
  const a = view.slice(4).split(',').map(Number)
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
  await p.evaluate((a) => window.__town3dFlyPose(...a), a); await p.waitForTimeout(+(opt.settle || 6000))
}
if (opt.js) { console.log('js:', JSON.stringify(await p.evaluate(opt.js))); await p.waitForTimeout(1500) }
if (opt.t) await p.waitForTimeout(+opt.t * 1000)
const file = `${OUT}/${name}.png`
await p.screenshot({ path: file })
console.log(file, errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
