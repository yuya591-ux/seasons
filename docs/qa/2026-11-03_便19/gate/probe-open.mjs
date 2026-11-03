// 便19 の調べ: 着地の候補の「8方位の抜け」を測る（町の3Dの座標）
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })).newPage()
await p.goto(`http://localhost:${process.env.PORT || 4971}/seasons/?dev=1`, { waitUntil: 'domcontentloaded' })
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
await p.evaluate(() => window.__applyScene('autumn-dusk-corner-room'))
await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 })
const r = await p.evaluate(() => { const A = window.__town3dNavAt
  const open = (x, z) => { const ds = []; for (let a = 0; a < 8; a++) { const yaw = a / 8 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw); let d = 1.0; for (; d < 24; d += 1.6) { const q = A(x + hx * d, z + hz * d); if (q.blocked || q.wet) break } ds.push(+d.toFixed(1)) } return { ds, avg: +(ds.reduce((a, b) => a + b, 0) / 8).toFixed(1) } }
  return { here: open(-4.5, 22), win: open(0, 22), bank: open(-18.8, -33.4), mid: open(-10, -10) } })
console.log(JSON.stringify(r))
await b.close()
