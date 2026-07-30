// 着地した時に目の前を塞ぐ物の正体を特定する(2026-07-30)
import { chromium } from 'playwright'
const port = process.env.PORT || '4890'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message))
await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(700)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(3200)
await page.evaluate(() => window.__town3dWindow(true)); await page.waitForTimeout(1100)
await page.evaluate(() => { window.__town3dLean(true); window.__town3dFly(true) }); await page.waitForTimeout(1600)
await page.evaluate(() => window.__town3dCruise(false))
await page.evaluate(() => window.__town3dFlyPose(0, 14, 8, 0, 0)); await page.waitForTimeout(1200)
await page.evaluate(() => window.__town3dLand(true)); await page.waitForTimeout(6000)
console.log('着地の状態: ' + JSON.stringify(await page.evaluate(() => window.__town3dDbg())))
for (const [u, v, nm] of [[0.5, 0.62, '画面中央やや下'], [0.5, 0.8, '足元より少し先'], [0.32, 0.72, '左下'], [0.7, 0.72, '右下']]) {
  const hits = await page.evaluate(([a, b]) => window.__town3dPick(a, b), [u, v])
  console.log(`${nm}: ` + (hits || []).slice(0, 3).map((h) => `${h.type}@${h.d}m ${h.col} 親=${h.par} 名=${h.nm}`).join(' / '))
}
await browser.close()
