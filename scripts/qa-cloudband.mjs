// 雲海の高度帯で画面が白い霞に覆われる件の切り分け(2026-07-30)
// 高度を変えながら「目線の先に何があるか(__town3dPick)」を出す。
// 手前(数十m以内)に雲/デッキが居れば物のせい、何も無いのに白いなら霧のせい。
import { chromium } from 'playwright'
import fs from 'node:fs'
const port = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-28/band'
fs.mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: !process.env.HEADED })
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message))
await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(700)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(3000)
await page.evaluate(() => window.__town3dWindow(true)); await page.waitForTimeout(1200)
await page.evaluate(() => window.__town3dLean(true)); await page.waitForTimeout(1400)
await page.evaluate(() => window.__town3dFly(true)); await page.waitForTimeout(1400)
await page.evaluate(() => window.__town3dCruise(false))
await page.addStyleTag({ content: '.ui{display:none !important}' })

const log = []
const say = (s) => { console.log(s); log.push(s) }
for (const y of [70, 84, 92, 100, 112]) {
  await page.evaluate((yy) => window.__town3dFlyPose(0, yy, -60, 0, -0.15), y)
  await page.waitForTimeout(1700)
  const hits = await page.evaluate(() => ({ 中央: window.__town3dPick(0.5, 0.5), 下: window.__town3dPick(0.5, 0.8) }))
  await page.screenshot({ path: `${outDir}/y${y}.png` })
  const brief = (a) => (a || []).slice(0, 3).map((h) => `${h.type}@${h.d}m ${h.col} 不透明${h.op}`).join(' / ') || '（何も当たらない）'
  say(`y=${y} 中央: ${brief(hits.中央)}`)
  say(`y=${y} 下:   ${brief(hits.下)}`)
}
fs.writeFileSync(`${outDir}/band.txt`, log.join('\n'))
console.log('WROTE ' + outDir)
await browser.close()
