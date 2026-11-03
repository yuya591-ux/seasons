// 便19: 鴨川の角部屋の 窓辺・空・地上 の1こまの時間（このPC・RTX 4050。画面の大きさだけを真似る。同じこまを 60 回描いた平均の、5回の中央）と、描く三角形・呼び出し
// 使い方: node docs/qa/2026-11-03_便19/gate/perf19.mjs <pc|iphone> [PORT]
import { chromium } from 'playwright'
const dev = process.argv[2] || 'pc'
const DEV = { pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } }[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'] })
const p = await (await b.newContext({ ...DEV, serviceWorkers: 'block' })).newPage()
await p.goto(`http://localhost:${process.env.PORT || 4971}/seasons/?dev=1`, { waitUntil: 'domcontentloaded' })
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
await p.evaluate(() => window.__applyScene('autumn-dusk-corner-room'))
await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 })
await p.waitForTimeout(3000)
const bench = async () => { const ms = []; for (let k = 0; k < 5; k++) { ms.push(await p.evaluate(() => window.__town3dBench(60))); await p.waitForTimeout(300) } ms.sort((x, y) => x - y); const k = await p.evaluate(() => window.__town3dKamo()); return { ms: +ms[2].toFixed(2), tris: k.tris, calls: k.calls, low: k.low } }
const out = {}
out.window = await bench()
await p.evaluate(() => window.__town3dFly(true)); await p.waitForTimeout(2500)
await p.evaluate(() => window.__town3dFlyPose(-40, 60, -90, -0.33, -0.15)); await p.waitForTimeout(2000)
out.fly = await bench()
await p.evaluate(() => window.__town3dWalkPose(-18.8, -33.4, -0.326)); await p.waitForTimeout(2000)
out.walk = await bench()
await p.evaluate(() => window.__town3dWalkPose(14.3, 13.9, 0)); await p.waitForTimeout(2000)
out.walkTown = await bench()
out.navMs = (await p.evaluate(() => window.__town3dNav())).navMs
console.log(`${dev} ${JSON.stringify(out)}`)
await b.close()
