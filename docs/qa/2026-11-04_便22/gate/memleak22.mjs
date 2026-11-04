// 便22: 情景を替えた時に鴨川の町と外の町のメモリが残るか（全テストのスモークがメモリ不足で3回止められたため）
//   角部屋（外の町まで組む）→ 北寺尾 → 角部屋 → 北寺尾 … と替え、そのたびにページの JS のメモリ（GC の後）と GPU の物の数を測る
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })).newPage()
await p.goto(`http://localhost:${process.env.PORT || 4961}/seasons/?dev=1${process.env.Q ? '&' + process.env.Q : ''}`, { waitUntil: 'domcontentloaded' })
await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(800)
const mem = async () => { await p.evaluate(() => window.gc && window.gc()); await p.waitForTimeout(500); return p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6)) }
const seq = ['autumn-dusk-corner-room', 'kitaterao-window-3d', 'summer-morning-corner-room', 'kitaterao-window-3d', 'spring-dusk-corner-room', 'kitaterao-window-3d']
const out = []
for (const id of seq) {
  await p.evaluate((i) => window.__applyScene(i), id)
  await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).catch(() => {})
  if (/corner/.test(id)) await p.waitForFunction(() => window.__town3dKamo && window.__town3dKamo() && window.__town3dKamo().outer, null, { timeout: 60000 }).catch(() => {})
  await p.waitForTimeout(2000)
  out.push(`${id.replace('-corner-room', '').replace('-window-3d', '')} ${await mem()}MB`)
  console.log(out[out.length - 1])
}
await b.close()
