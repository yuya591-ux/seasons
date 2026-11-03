// 便19 の調べ: 窓の目のまわりの建物の上の高さを並べる（部屋のマンションがどこにあるか）
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })).newPage()
await p.goto(`http://localhost:${process.env.PORT || 4971}/seasons/?dev=1`, { waitUntil: 'domcontentloaded' })
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
await p.evaluate(() => window.__applyScene('summer-morning-corner-room'))
await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 })
const r = await p.evaluate(() => { const A = window.__town3dNavAt, rows = []
  for (let z = 60; z >= -20; z -= 4) { let line = ''; for (let x = -24; x <= 24; x += 4) { const q = A(x, z); line += q.wet ? '  ~~' : q.blocked ? String(Math.round(q.top)).padStart(4) : '   .' } rows.push(String(z).padStart(4) + line) }
  return rows.join('\n') })
console.log('   z  x=-24 … +24（4m おき・数＝建物の上の高さ・.＝歩ける・~~＝水）\n' + r)
await b.close()
