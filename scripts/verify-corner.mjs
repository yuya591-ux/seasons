// 角部屋シェーダーの確認: 正面・右を向く（隣の壁が迫る）・見下ろす を撮影。
import { chromium } from 'playwright'
const BASE = 'http://localhost:4790/seasons/'
import { mkdirSync } from 'node:fs'
mkdirSync('scripts/_shots', { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 960, height: 600 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(500)
await page.locator('button:has-text("情景")').click()
await page.waitForTimeout(300)
await page.locator('.scene-card:has-text("秋の夕暮れ、鴨川デルタの角部屋")').click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'scripts/_shots/corner_front.png' })
const cvEl = page.locator('#scene')
const box0 = await cvEl.boundingBox()

// 画面中央をつかんで左へドラッグ＝右を向く（隣の壁が迫る）
const cv = page.locator('#scene')
const box = await cv.boundingBox()
const cy = box.y + box.height / 2
async function dragBy(dx, dy, steps = 12) {
  await page.mouse.move(box.x + box.width * 0.7, cy)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(box.x + box.width * 0.7 + (dx * i) / steps, cy + (dy * i) / steps)
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
}
// 下を向く＝見下ろす商店街
await dragBy(0, box.height * 0.6)
await page.waitForTimeout(800)
await page.screenshot({ path: 'scripts/_shots/corner_down.png' })
await dragBy(0, -box.height * 0.6) // 正面へ戻す
await page.waitForTimeout(400)
// 上を向く＝上空
await dragBy(0, -box.height * 0.6)
await page.waitForTimeout(800)
await page.screenshot({ path: 'scripts/_shots/corner_up.png' })
await dragBy(0, box.height * 0.6) // 正面へ戻す
await page.waitForTimeout(500)
// 少しだけ右を向く＝建物の角が見える「角部屋」の見せ場
await dragBy(-box.width * 0.5, 0)
await page.waitForTimeout(900)
await page.screenshot({ path: 'scripts/_shots/corner_corner.png' })
// さらに右を向く＝壁で街が遮られる
for (let k = 0; k < 3; k++) await dragBy(-box.width * 0.6, 0)
await page.waitForTimeout(1000)
await page.screenshot({ path: 'scripts/_shots/corner_right.png' })

await browser.close()
if (errors.length) { console.log('ERR:'); errors.forEach((e) => console.log('  ' + e)); process.exit(1) }
console.log('コンソールエラー無し ✓')
