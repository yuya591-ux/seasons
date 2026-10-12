// 使い捨て: 手本の描画の倍率・方式を測り、Sakura Fantasy は「舟を出す」の後を撮る
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const probe = () => [...document.querySelectorAll('canvas')].map((c) => ({ w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, gl2: !!c.getContext && (() => { try { return !!(c.__ctx) } catch { return null } })() }))
for (const dn of ['pc', 'iphone']) {
  const d = dn === 'pc' ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 } : { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  const ctx = await b.newContext(d)
  await ctx.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { const r = o.call(this, t, a); if (r && !this.__kind) this.__kind = t; return r } })
  for (const [k, u] of [['sakura', 'https://sakura.billpwchan.art/'], ['valley', 'https://valley.mengto.here.now/']]) {
    const p = await ctx.newPage()
    await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(15000)
    if (k === 'sakura') { await p.getByText('舟を出す').first().click({ force: true }).catch(() => {}); await p.waitForTimeout(25000); await p.screenshot({ path: `docs/qa/2026-10-12_seasons/ref/sakura-${dn}-2.png` }) }
    const info = await p.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => ({ kind: c.__kind || null, w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight })))
    console.log(k, dn, JSON.stringify(info))
    await p.close()
  }
  await ctx.close()
}
await b.close()
