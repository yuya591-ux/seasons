// 使い捨て（便6）: iPhone の幅の夕方の窓辺（窓をあけない部屋の眺め）で、描画の呼び出しを種類ごとに数えて、前のコード（4964）と後のコード（4963）を比べる。
import { chromium } from 'playwright'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const base of ['http://localhost:4964/seasons/', 'http://localhost:4963/seasons/']) {
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA })
  await ctx.addInitScript(() => { try { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.sceneId = 'kitaterao-window-3d-sunset'; st.sceneAt = Date.now(); localStorage.setItem(k, JSON.stringify(st)) } catch {} })
  const p = await ctx.newPage()
  await p.goto(base + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 }); await wait(2500)
  await p.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {}); await wait(1500)
  await p.evaluate(() => window.__applyScene('kitaterao-window-3d-sunset')); await wait(12000)
  await p.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
  const r = await p.evaluate(() => ({ draw: window.__town3dDraw(), calls: window.__town3dCalls && window.__town3dCalls(25), sm: (() => { const { renderer } = window.__shGet(); return { auto: renderer.shadowMap.autoUpdate, needs: renderer.shadowMap.needsUpdate, enabled: renderer.shadowMap.enabled } })() }))
  console.log(base, JSON.stringify(r.draw), JSON.stringify(r.sm))
  console.log(JSON.stringify(r.calls).slice(0, 2500))
  await ctx.close()
}
await b.close()
