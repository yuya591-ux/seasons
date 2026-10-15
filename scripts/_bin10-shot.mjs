// 使い捨て（便10・設計案の画）: 開発サーバー 4970（_bin10-vite.config.mjs）で、同じ眺めを案ごとに撮る。本体は変えない。
// 使い方: node scripts/_bin10-shot.mjs <端末 pc|iphone> <情景ID> <眺め> <案（今は ima）> [名前] [t=秒] [js=後で走らせる式]
//   眺め: still＝情景を開いたまま／open＝窓をあける（3Dの街）／fly=x,y,z,yaw,pitch＝飛行の位置と向き（__town3dFlyPose）
import { chromium } from 'playwright'
import fs from 'node:fs'

const [dev = 'pc', scene = 'summer-rain-dusk', view = 'still', an = 'ima', name, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((s) => { const i = s.indexOf('='); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)] }))
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-15_便10/mocks'
fs.mkdirSync(OUT, { recursive: true })
const PORT = process.env.B10_PORT || 4970
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const ctx = await b.newContext(DEV)
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => { if (m.type() === 'error' && /shader|program|GLSL|ERROR|compile/i.test(m.text())) errs.push(m.text().slice(0, 600)) })
await p.goto(`http://localhost:${PORT}/seasons/?dev=1&b10=${an === 'ima' ? '' : an}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate((s) => window.__applyScene(s), scene)
await p.waitForTimeout(+(opt.wait || 9000))
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"], [class*="fly"], [class*="hint"], [class*="guide"], [class*="tip"], button{display:none !important}' })
if (opt.inj) { if (opt.inj === 'none') { await p.waitForTimeout(3000) } else { await p.addScriptTag({ content: fs.readFileSync('' + (process.env.B10_INJ || 'scripts/_bin10-inject.js') + '', 'utf8') }); console.log('inj:', JSON.stringify(await p.evaluate((a) => window.__bin10.apply(a), opt.inj))); await p.waitForTimeout(3000) } }
if (view === 'open') { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(3000) }
if (view.startsWith('fly=')) {
  const a = view.slice(4).split(',').map(Number)
  await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
  await p.evaluate((a) => window.__town3dFlyPose(...a), a); await p.waitForTimeout(+(opt.settle || 6000))
}
if (opt.injlate) { const __i = opt.injlate; if (__i === 'none') { await p.waitForTimeout(3000) } else { await p.addScriptTag({ content: fs.readFileSync('' + (process.env.B10_INJ || 'scripts/_bin10-inject.js') + '', 'utf8') }); console.log('inj:', JSON.stringify(await p.evaluate((a) => window.__bin10.apply(a), __i))); await p.waitForTimeout(3000) } }
if (opt.js) { console.log('js:', JSON.stringify(await p.evaluate(opt.js))); await p.waitForTimeout(1500) }
if (opt.t) await p.waitForTimeout(+opt.t * 1000)
const file = `${OUT}/${name || `${an}-${dev}-${scene}-${view.replace(/[=,]/g, '_')}`}.png`
await p.screenshot({ path: file })
console.log(file, errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
