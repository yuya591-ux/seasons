// 便15 外の目 #18: 幅の狭い iPhone（375・320）でも、飛ぶ時の右上のボタンが1段に並ぶか（B6 の幅違い）
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const w of [375, 320]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  await p.goto('http://localhost:4985/seasons/?dev=1', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1000)
  await p.evaluate(() => window.__applyScene('kitaterao-window-3d'))
  for (let i = 0; i < 80; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw()))) break }
  await p.waitForTimeout(1500)
  const stage = p.locator('.iconbtn--stage')
  for (const want of ['窓をあける', '乗り出す', '空へ']) { await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))); if ((await stage.textContent()) !== want) break; await stage.click(); await p.waitForTimeout(3500) }
  await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))); await p.waitForTimeout(1300)
  const r = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].filter((x) => getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0).map((x) => ({ t: x.textContent.trim(), top: Math.round(x.getBoundingClientRect().top), l: Math.round(x.getBoundingClientRect().left) })))
  await p.screenshot({ path: `docs/qa/2026-11-02_便15/shots/b6-fly-${w}.png` })
  console.log(`幅 ${w}: ボタン ${r.length}・段の数 ${new Set(r.map((x) => x.top)).size}・いちばん左 ${Math.min(...r.map((x) => x.l))}px（${r.map((x) => x.t).join('・')}）`)
  await ctx.close()
}
await b.close()
