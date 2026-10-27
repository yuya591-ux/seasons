// 便14 診断の使い捨て: 構造役 S25（町→町の連続切替で window の resize 受け口が積もるか）と S27（切替の直後の __town3dDraw）を当てる。本体は変えない
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => {
  window.__rz = { add: 0, rem: 0, up: 0, upRem: 0 }
  const a = window.addEventListener.bind(window), r = window.removeEventListener.bind(window)
  window.addEventListener = (t, f, o) => { if (t === 'resize') window.__rz.add++; if (t === 'pointerup') window.__rz.up++; return a(t, f, o) }
  window.removeEventListener = (t, f, o) => { if (t === 'resize') window.__rz.rem++; if (t === 'pointerup') window.__rz.upRem++; return r(t, f, o) }
})
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4951/seasons/?dev=1', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500); await page.locator('.gate').click().catch(() => {}); await page.waitForTimeout(1500)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d')); await page.waitForTimeout(8000)
const base = await page.evaluate(() => ({ ...window.__rz, stages: document.querySelectorAll('.town3d-stage').length }))
console.log('町A の後', JSON.stringify(base))
// 温めの間に替える: 町B を開いて 300ms で町C へ、を5回
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.__applyScene('kitaterao-window-3d-sunset')); await page.waitForTimeout(300)
  await page.evaluate(() => window.__applyScene('shishigaya-window-3d')); await page.waitForTimeout(300)
}
await page.waitForTimeout(9000)
console.log('連続切替の後', JSON.stringify(await page.evaluate(() => ({ ...window.__rz, stages: document.querySelectorAll('.town3d-stage').length }))))
// S27: 切替の直後に __town3dDraw を呼ぶ
await page.evaluate(() => window.__applyScene('autumn-dusk-corner-room'))
const seq = []
for (let i = 0; i < 12; i++) { await page.waitForTimeout(250); seq.push(await page.evaluate(() => { const s = window.__town3dStats && window.__town3dStats(); const d = window.__town3dDraw && window.__town3dDraw(); return { stats: s ? s.objs : null, draw: d ? d.calls : null } }).catch((e) => String(e).slice(0, 60))) }
console.log('角部屋へ替えた直後の口', JSON.stringify(seq))
console.log('errors', errs)
await b.close()
