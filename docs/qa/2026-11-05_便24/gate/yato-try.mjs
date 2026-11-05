import { chromium } from 'playwright'
const S = process.argv[2]
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 900, height: 600 } })
await p.goto('http://localhost:4961/seasons/?dev=1', { waitUntil: 'networkidle' })
await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(800)
await p.addStyleTag({ content: '.ui, .gate{display:none !important}' })
await p.evaluate(() => window.__applyScene('shishigaya-window-3d')); await p.waitForTimeout(3000)
for (let k = 0; k < 80; k++) { if (await p.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw())).catch(() => false)) break; await p.waitForTimeout(500) }
for (const [z, pit] of [[0.4, 0.45], [0.4, 0.15], [0.4, -0.05], [0.0, 0.15]]) {
  await p.evaluate(([z, pit]) => { window.__town3dWindow(true); window.__town3dZoom(z); window.__town3dSetView(0, pit) }, [z, pit]); await p.waitForTimeout(3500)
  await p.screenshot({ path: `${S}/yato_${z}_${pit}.jpg`, type: 'jpeg', clip: { x: 80, y: 55, width: 740, height: 490 } })
}
await b.close()
