// 便15 の切り分け用: 開発サーバー 4985 で情景を開き、式を評価して結果を出す（本体は変えない）
// 使い方: node scripts/_bin15-probe.mjs <端末 iphone|pc> <情景ID> "<式>" [撮る画のパス]
import { chromium } from 'playwright'
const [dev, scene, expr, shot] = process.argv.slice(2)
const DEV = { iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 } }[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext(DEV); const p = await ctx.newPage()
await p.goto(`http://localhost:${process.env.B15_PORT || 4985}/seasons/?dev=1`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1000)
await p.evaluate((s) => window.__applyScene(s), scene)
for (let i = 0; i < 80; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw())).catch(() => false)) break }
await p.waitForTimeout(2500)
console.log(JSON.stringify(await p.evaluate(expr), null, 0))
if (shot) { await p.addStyleTag({ content: '.ui,.topbar,.hud,.lookhint,.toast,.stagedots,button{display:none !important}' }); await p.waitForTimeout(500); await p.screenshot({ path: shot }) }
await b.close()
