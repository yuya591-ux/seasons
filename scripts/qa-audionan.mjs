// 音の設定値に非有限値(NaN/Infinity)が混入する件の発生源を特定する(2026-07-30)
// AudioParam の設定関数を先回りで包み、非有限値が来た瞬間の呼び出し元を記録する。
import { chromium } from 'playwright'
const port = process.env.PORT || '4890'
const browser = await chromium.launch({ headless: !process.env.HEADED })
const page = await browser.newPage({ viewport: { width: 393, height: 852 } })
let perr=0; page.on('pageerror',()=>perr++)
await page.addInitScript(() => {
  window.__nanHits = []
  const wrap = (name) => {
    const orig = AudioParam.prototype[name]
    if (!orig) return
    AudioParam.prototype[name] = function (...args) {
      if (args.some((a) => !Number.isFinite(Number(a)))) { // undefined/null も数値化するとNaN＝ここで捕まえる
        const st = (new Error().stack || '').split('\n').slice(1, 5).join(' | ')
        if (window.__nanHits.length < 40) window.__nanHits.push({ fn: name, args: args.map(String), st })
        return this // 例外を出さずに黙って捨てる（記録用）
      }
      return orig.apply(this, args)
    }
  }
  ;['setTargetAtTime', 'setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime'].forEach(wrap)
})
await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(800)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(3500)
await page.evaluate(() => window.__town3dWindow(true)); await page.waitForTimeout(1300)
await page.evaluate(() => { window.__town3dLean(true); window.__town3dFly(true) }); await page.waitForTimeout(1800)
await page.evaluate(() => window.__town3dCruise(false))
await page.evaluate(() => window.__town3dFlyPose(0, 14, 8, 0, 0)); await page.waitForTimeout(2000)
await page.evaluate(() => window.__town3dFlyPose(0, 100, -150, 0, 0)); await page.waitForTimeout(2500)
await page.evaluate(() => window.__town3dFlyPose(0, 14, 8, 0, 0)); await page.waitForTimeout(1500)
await page.evaluate(() => window.__town3dLand(true)); await page.waitForTimeout(6000)
await page.evaluate(() => window.__town3dMove(0, -1)); await page.waitForTimeout(2500)
await page.evaluate(() => window.__town3dMove(0, 0)); await page.waitForTimeout(1500)
await page.evaluate(() => window.__town3dFly(true)); await page.waitForTimeout(1800)
for (const p of [[0, 100, -150, 0, 0], [0, 92, -60, 0, -0.25], [40, 108, -200, 0.6, 0]]) {
  await page.evaluate((q) => window.__town3dFlyPose(...q), p); await page.waitForTimeout(2000)
}
console.log('未捕捉の例外(pageerror): '+perr+'件')
const hits = await page.evaluate(() => window.__nanHits)
console.log('非有限値の混入: ' + hits.length + '件（先頭40件まで記録）')
const seen = new Set()
for (const h of hits) {
  const key = h.fn + h.st
  if (seen.has(key)) continue
  seen.add(key)
  console.log(`\n[${h.fn}] 引数=${JSON.stringify(h.args)}\n  呼び出し元: ${h.st}`)
}
await browser.close()
