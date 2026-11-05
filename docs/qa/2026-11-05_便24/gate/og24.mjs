// 便24: 共有用の画（public/og.jpg・2400×1260）を、今の鴨川の角部屋（秋の夕暮れ・窓をあけた眺め）と作品名「窓のむこう」で作り直す
//   前の og.jpg は前の作品名「窓辺 MADOBE」と、今のアプリに無い町の画のまま（2026-06-17）だった（便24 の隅々の点検で見つけた）
// 前に: vite preview --port 4961（?dev=1 の口が使える物）
import { chromium } from 'playwright'
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
await p.goto(`http://localhost:${process.env.PORT || 4961}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
await p.addStyleTag({ content: '.ui, .gate{display:none !important}' })
await p.evaluate(() => window.__applyScene('autumn-dusk-corner-room'))
for (let k = 0; k < 160; k++) { const ok = await p.evaluate(() => { const k2 = window.__town3dKamo && window.__town3dKamo(); return !!(k2 && k2.outer) }).catch(() => false); if (ok) break; await p.waitForTimeout(500) }
await p.evaluate(() => { window.__town3dWindow(true); window.__town3dZoom && window.__town3dZoom(0.4); window.__town3dSetView(-0.35, 0.42) })
await p.waitForTimeout(4500)
// 作品名（画面の文言と同じ静かな明朝の白・左下）
await p.evaluate(() => {
  const d = document.createElement('div')
  d.style.cssText = 'position:fixed;left:56px;bottom:46px;z-index:99999;color:#fff;font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;text-shadow:0 2px 14px rgba(0,0,0,.55);pointer-events:none'
  d.innerHTML = '<div style="font-size:64px;letter-spacing:.18em;font-weight:500">窓のむこう</div><div style="font-size:17px;letter-spacing:.42em;margin-top:6px;opacity:.9">BEYOND THE WINDOW</div>'
  document.body.appendChild(d)
})
await p.waitForTimeout(400)
await p.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 86 })
console.log('og.jpg を作った（2400×1260）')
await b.close()
