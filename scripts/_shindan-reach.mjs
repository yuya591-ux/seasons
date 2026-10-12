// 使い捨て（shindan 2026-10-12）: 立体の街の全情景で、主役ボタン（窓をあける等）の中心に指が届くか（いちばん上の要素がボタンか）を当てる
import { chromium } from 'playwright'
import { SCENES } from '../src/data/scenes/index.js'
const ids = SCENES.filter((s) => s.status === 'ready' && s.public !== false && s.render === 'town3d').map((s) => s.id)
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage()
await p.goto('http://localhost:4951/seasons/?dev=1', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1200)
const check = () => p.evaluate(() => { const bt = document.querySelector('.iconbtn--stage'); if (!bt || !bt.offsetParent) return 'ボタン無し'; const r = bt.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return (t === bt || bt.contains(t) ? '届く' : '届かない(' + (t && t.tagName) + ')') + ' ' + bt.textContent })
for (const id of ids) {
  await p.evaluate((s) => window.__applyScene(s), id); await p.waitForTimeout(4500)
  await p.mouse.move(200, 500); await p.waitForTimeout(200)
  const a = await check()
  await p.locator('.iconbtn--stage').click({ timeout: 3000 }).catch((e) => {}); await p.waitForTimeout(2500)
  const b2 = await check()
  console.log(id, '|', a, '|', b2)
}
await b.close()
