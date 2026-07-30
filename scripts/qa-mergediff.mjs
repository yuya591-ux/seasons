// 項目#3(2026-07-28): 建物の区画統合の前後で「絵が変わっていないか」を画素差で証明する
// 手順: 同じ情景・同じ時刻で ①統合あり(既定) ②統合なし(?nomerge=1) を撮り、
//       さらに①を2回撮って「アニメだけで生じる差＝床値」を出す。統合の差が床値以下なら絵は変わっていない。
import { chromium } from 'playwright'
import fs from 'node:fs'
const port = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-28/merge'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const shot = async (query, file, drift) => {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 })
  await page.goto(`http://localhost:${port}/seasons/?dev=1${query}`, { waitUntil: 'networkidle' })
  await page.locator('.gate').click().catch(() => {})
  await page.waitForTimeout(600)
  await page.evaluate(() => window.__applyScene && window.__applyScene('kitaterao-window-3d'))
  await page.waitForTimeout(4000)
  await page.evaluate((d) => window.__town3dDrift && window.__town3dDrift(d), drift) // 日の傾きを同じ位置に固定
  await page.waitForTimeout(1200)
  const calls = await page.evaluate(() => window.__town3dDraw().calls)
  await page.screenshot({ path: `${outDir}/${file}` })
  await page.close()
  return calls
}

const rows = []
for (const [name, d] of [['昼', 0.1], ['夕', 0.62], ['夜', 0.92], ['朝', 0.02]]) {
  const a = await shot('', `${name}_統合あり.png`, d)
  const a2 = await shot('', `${name}_統合あり2.png`, d)
  const b = await shot('&nomerge=1', `${name}_統合なし.png`, d)
  rows.push({ name, 統合あり: a, 統合なし: b, 二度撮り: a2 })
  console.log(`${name}: 描画コール 統合あり=${a} 統合なし=${b}`)
}
fs.writeFileSync(`${outDir}/calls.json`, JSON.stringify(rows, null, 1))
console.log('WROTE ' + outDir)
await browser.close()
