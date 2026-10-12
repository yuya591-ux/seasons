// 使い捨て（shindan 2026-10-12）: 調べで見つかった手本のページを、PC と iPhone の幅で撮る（見比べの物差し。写さない）
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = 'docs/qa/2026-10-12_seasons/ref'; fs.mkdirSync(OUT, { recursive: true })
const URLS = { sakura: 'https://sakura.billpwchan.art/', valley: 'https://valley.mengto.here.now/' }
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const [k, u] of Object.entries(URLS)) {
  for (const [dn, d] of Object.entries({ pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } })) {
    const ctx = await b.newContext(d); const p = await ctx.newPage(); const errs = []
    p.on('pageerror', (e) => errs.push(e.message))
    try {
      await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await p.waitForTimeout(20000)
      await p.mouse.click(d.viewport.width / 2, d.viewport.height / 2).catch(() => {})
      await p.waitForTimeout(8000)
      await p.screenshot({ path: `${OUT}/${k}-${dn}.png` })
      const fps = await p.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(+(n / 3).toFixed(1)) }; requestAnimationFrame(f) }))
      console.log(k, dn, 'fps(この PC の内蔵GPU)=', fps, errs.length ? 'ERR ' + errs[0].slice(0, 80) : '')
    } catch (e) { console.log(k, dn, '撮れない', String(e).slice(0, 120)) }
    await ctx.close()
  }
}
await b.close()
