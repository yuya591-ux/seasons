// 便13（2026-10-20・便12 #1=1 #2=2 #3=1 #4=1 で茶の間を作る便）の撮影: 開発サーバー（既定 4981・素の vite）で、同じ眺めを前と後で撮る。
// 便12 の _bin12-shot.mjs の写し。案の差し替え（b12）は持たない（本体に入れたので）。
// 使い方: node scripts/_bin13-shot.mjs <端末 pc|iphone|ipad> <情景ID> <眺め> <名前> [seed=数] [wait=ms] [ui=1] [js=式]
//   眺め: still＝情景を開いたまま／open＝窓をあける／view=yaw,pitch＝見回しの向き（__town3dSetView）／openview=yaw,pitch＝窓をあけてから向く
//   seed: Math.random の種（猫の毛色・時々の出来事をそろえる。既定 20261020＝便12 と同じ）
//   coat=N: 猫の毛色を名指しする（_bin13-vite.config.mjs の口 __b13Coat。三毛＝6。素の vite では効かない）。前と後で同じ毛色にそろえる時に使う
//   ui=1: 画面のボタンを隠さずに撮る。ボタンは 3.5 秒触らないと消える（ui.js の poke）ので、撮る直前に指の動きを1回送り、
//         出てくる移ろい（1.2 秒）の後に撮る（便12 の台本は ui=1 でもボタンが消えたまま撮れていた＝便13 で直した欠け）
import { chromium } from 'playwright'
import fs from 'node:fs'

const [dev = 'pc', scene = 'kitaterao-window-3d', view = 'still', name, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((s) => { const i = s.indexOf('='); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)] }))
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-20_便13/shots'
fs.mkdirSync(OUT, { recursive: true })
const PORT = process.env.B13_PORT || 4981
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const ctx = await b.newContext(DEV)
await ctx.addInitScript((seed) => { let a = seed; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }, +(opt.seed || 20261020))
if (opt.coat != null) await ctx.addInitScript((c) => { window.__b13Coat = c }, +opt.coat)
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => { if (m.type() === 'error' && /shader|program|GLSL|ERROR|compile/i.test(m.text())) errs.push(m.text().slice(0, 600)) })
await p.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate((s) => window.__applyScene(s), scene)
await p.waitForTimeout(+(opt.wait || 9000))
if (!opt.ui) await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"], [class*="fly"], [class*="hint"], [class*="guide"], [class*="tip"], button{display:none !important}' })
if (view === 'open' || view.startsWith('openview=')) { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(2500) }
if (view.startsWith('view=') || view.startsWith('openview=')) {
  const [y, pt] = view.split('=')[1].split(',').map(Number)
  await p.evaluate(([y, pt]) => window.__town3dSetView(y, pt), [y, pt || 0]); await p.waitForTimeout(1500)
}
if (opt.js) { console.log('js:', JSON.stringify(await p.evaluate(opt.js))); await p.waitForTimeout(1500) }
if (opt.t) await p.waitForTimeout(+opt.t * 1000)
let uiOn = null
if (opt.ui) { // ボタンを出してから撮る（窓や見回しを動かさない合成の指の動き＝window への pointermove だけ）
  await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })))
  await p.waitForTimeout(1500)
  uiOn = await p.evaluate(() => !document.body.classList.contains('idle'))
}
const file = `${OUT}/${name || `${dev}-${scene}-${view.replace(/[=,]/g, '_')}`}.png`
await p.screenshot({ path: file })
console.log(file, uiOn === null ? '' : uiOn ? 'ボタンあり' : 'ボタン無し（idle）', errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
