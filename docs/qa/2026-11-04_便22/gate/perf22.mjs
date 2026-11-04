// 便22: 鴨川の角部屋の1こまの時間（このPC・RTX 4050。画面の大きさだけを真似る。同じこまを 60 回描いた平均の、5回の中央）。便21 と同じ測り方
//   窓辺＝秋の夕の角部屋・窓をあけた／空＝デルタの上 400m から南（京都駅の方）を見下ろす／外の町の中＝祇園の上 60m
// 使い方: PORT=4961 [Q=kamoouter=0] node docs/qa/2026-11-04_便22/gate/perf22.mjs <pc|iphone>
import { chromium } from 'playwright'
const dev = process.argv[2] || 'pc'
const DEV = { pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } }[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'] })
const p = await (await b.newContext({ ...DEV, serviceWorkers: 'block' })).newPage()
await p.goto(`http://localhost:${process.env.PORT || 4961}/seasons/?dev=1${process.env.Q ? '&' + process.env.Q : ''}`, { waitUntil: 'domcontentloaded' })
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
await p.evaluate(() => window.__applyScene('autumn-dusk-corner-room'))
await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 })
await p.waitForTimeout(12000) // 外の町を裏で読み終えるまで
const bench = async () => { const ms = []; for (let k = 0; k < 5; k++) { ms.push(await p.evaluate(() => window.__town3dBench(60))); await p.waitForTimeout(300) } ms.sort((x, y) => x - y); const k = await p.evaluate(() => window.__town3dKamo()); return { ms: ms[2], calls: k && k.calls, tris: k && k.tris } }
const out = { outer: !!(await p.evaluate(() => window.__town3dKamo() && window.__town3dKamo().outer)) }
await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(2000)
out.window = await bench()
await p.evaluate(() => window.__town3dFly(true)); await p.waitForTimeout(2600)
await p.evaluate(() => { window.__kamoCam = { p: [-60, 400, 600], l: [-300, 0, 3500], fov: 55 } }); await p.waitForTimeout(1500)
out.skySouth = await bench()
await p.evaluate(() => { window.__kamoCam = { p: [250, 60, 2950], l: [459, 5, 2914], fov: 55 } }); await p.waitForTimeout(1500)
out.gion = await bench()
const mem = await p.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null))
out.jsHeapMB = mem
console.log(`${dev}${process.env.Q ? ' ' + process.env.Q : ''} ${JSON.stringify(out)}`)
await b.close()
