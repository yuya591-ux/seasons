// 角部屋(kind:'corner')の見回し検証。前窓/左窓(二面採光)/右の眺め（隣室の壁は 2026-11-03 K6 で外した） を見回し、3Dで破綻しないか目視＋エラー検知。
import { chromium } from 'playwright'
const port = process.env.PORT || '5070'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 480, height: 760 }, deviceScaleFactor: 2 })
const errs = []
page.on('pageerror', (e) => errs.push('PE:' + e.message))
await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(500)
await page.addStyleTag({ content: '.ui{display:none !important}' })
await page.evaluate(() => window.__applyScene('spring-dusk-corner-room'))
await page.waitForTimeout(3000)
async function view(label, yaw, pitch) {
  await page.evaluate(([y, p]) => window.__town3dSetView(y, p), [yaw, pitch])
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `scripts/_shots/cornerlook-${label}.png` })
  console.log(label, 'done')
}
await view('front', 0, -0.05)     // 正面の前窓
await view('left', -0.75, -0.04)  // 左へ＝二つ目の窓（開けた街の眺め）
await view('right', 0.7, -0.02)   // 右へ＝隣の町並み（隣室の壁は外した）
await view('down', 0, -0.5)       // 足元（室内の床/調度）
console.log('errs:', errs.length ? JSON.stringify(errs.slice(0, 4)) : 'none')
await browser.close()
console.log('check done')
