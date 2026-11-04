import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } })
await page.goto('http://localhost:4790/seasons/', { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(500)
await page.locator('button:has-text("情景")').click()
await page.waitForTimeout(300)
await page.locator('.scene-card:has-text("秋の雨の夜、鴨川デルタの角部屋")').click()
// 数フレーム撮って点滅・車の動きを捉える
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(1100)
  await page.screenshot({ path: `scripts/_shots/night_${i}.png` })
}
await browser.close()
console.log('done')
