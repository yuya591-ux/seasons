// 残った描画コールの正体を画面基準で数える(2026-07-30)。窓辺と歩行の2視点。
import { chromium } from 'playwright'
import fs from 'node:fs'
const port = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30'
fs.mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 393, height: 852 } })
page.on('pageerror', (e) => console.log('PAGE EXCEPTION:', e.message))
await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(700)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(4000)

const log = []
const say = (s) => { console.log(s); log.push(s) }
const dump = async (name) => {
  const d = await page.evaluate(() => window.__town3dDraw())
  const r = await page.evaluate((n) => window.__town3dCalls(n), 30)
  say(`\n■ ${name}  描画コール=${d.calls} / 三角形=${d.tris} / 画面に描かれる物=${r.画面に描かれる物}（種類 ${r.種類数}）`)
  say('   数   三角形  位置(x,y,z)      種類（形状|材質|色|性質）')
  for (const x of r.上位) say(`${String(x.数).padStart(5)} ${String(x.三角形).padStart(7)}  ${JSON.stringify(x.位置).padEnd(16)} ${x.種類}  親=${x.親}  材質数=${x.材}`)
}
await dump('窓辺（眺める・既定）')
await page.evaluate(() => window.__town3dWindow(true)); await page.waitForTimeout(1200)
await page.evaluate(() => { window.__town3dLean(true); window.__town3dFly(true) }); await page.waitForTimeout(1600)
await page.evaluate(() => window.__town3dCruise(false))
await page.evaluate(() => window.__town3dFlyPose(0, 14, 8, 0, 0)); await page.waitForTimeout(1400)
await dump('低空飛行（街の中心）')
await page.evaluate(() => window.__town3dLand(true)); await page.waitForTimeout(6000)
await dump('着地して歩く')
fs.writeFileSync(`${outDir}/calls.txt`, log.join('\n'))
console.log('WROTE ' + outDir + '/calls.txt')
await browser.close()
