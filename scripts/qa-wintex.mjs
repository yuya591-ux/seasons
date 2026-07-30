// 建物の窓テクスチャの実態を数える(2026-07-30)。次の一手「共有アトラス化」の判断材料。
// 見るもの: (a) GPUへ送られた絵の枚数と寸法 (b) 区画統合の内訳（何が統合され、何が取りこぼされたか）
//           (c) 画面に描かれる物のうち「絵つき」の割合
// アプリ側は一切変更しない。ブラウザのWebGLを外から包んで数える。
// 使い方: PORT=4890 node scripts/qa-wintex.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
// WebGLの絵の送り込み(texImage2D)を包んで、寸法と回数を記録する
await ctx.addInitScript(() => {
  window.__texLog = []
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const gl = orig.call(this, type, ...rest)
    if (gl && /webgl/i.test(type) && !gl.__wrapped) {
      gl.__wrapped = true
      const t2 = gl.texImage2D
      gl.texImage2D = function (...a) {
        const src = a[a.length - 1]
        let w = 0, h = 0, kind = '?'
        if (src && src.width !== undefined && typeof src !== 'number') { w = src.width; h = src.height; kind = src.tagName || src.constructor.name }
        else if (typeof a[3] === 'number' && typeof a[4] === 'number' && a.length >= 9) { w = a[3]; h = a[4]; kind = '生データ' }
        window.__texLog.push({ w, h, kind })
        return t2.apply(this, a)
      }
    }
    return gl
  }
})
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(800)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(5000)

const log = []
const say = (s) => { console.log(s); log.push(s) }

// (a) GPUへ送られた絵
const tex = await page.evaluate(() => {
  const by = new Map()
  for (const t of window.__texLog) {
    const k = `${t.w}x${t.h} (${t.kind})`
    by.set(k, (by.get(k) || 0) + 1)
  }
  return { 総回数: window.__texLog.length, 内訳: [...by.entries()].sort((a, b) => b[1] - a[1]) }
})
say(`■ GPUへ送り込まれた絵: ${tex.総回数}回`)
for (const [k, n] of tex.内訳.slice(0, 14)) say(`   ${String(n).padStart(4)}回  ${k}`)

// (b) 区画統合の内訳（取りこぼし＝統合できずに残った塊）
const mg = await page.evaluate(() => (window.__town3dMerge ? window.__town3dMerge() : null))
say('\n■ 区画統合の内訳（__town3dMerge）')
for (const [k, v] of Object.entries(mg || {})) say(`   ${k}: ${v}`)

// (c) 画面に描かれる物の内訳。建物の壁＝「Box|Toon|色|絵頂色」（窓テクスチャ＋壁の縦グラデ頂点色）で見分ける
const state = async (name) => {
  const calls = await page.evaluate(() => window.__town3dCalls(800))
  const d = await page.evaluate(() => window.__town3dDraw())
  let wall = 0, wallKinds = 0, otherMap = 0, noMap = 0
  for (const r of calls.上位) {
    if (/絵頂色/.test(r.種類) && /^Box|^Rounded/.test(r.種類)) { wall += r.数; wallKinds++ }
    else if (/絵/.test(r.種類)) otherMap += r.数
    else noMap += r.数
  }
  say(`\n■ ${name}: 画面に描かれる物=${calls.画面に描かれる物}（種類 ${calls.種類数}） 描画コール=${d.calls}`)
  say(`   建物の壁（窓テクスチャつき）: ${wall}個（${wallKinds}種類）← 共有化すれば区画統合に載る候補`)
  say(`   その他の絵つき: ${otherMap}個 / 絵なし: ${noMap}個`)
  const top = calls.上位.filter((x) => /絵頂色/.test(x.種類) && /^Box|^Rounded/.test(x.種類)).slice(0, 6)
  for (const r of top) say(`     ${String(r.数).padStart(4)}個  ${r.種類}  親=${r.親}  材質数=${r.材}`)
}
await state('窓辺（眺める・既定）')
await page.evaluate(() => window.__town3dWindow(true)); await page.waitForTimeout(1200)
await page.evaluate(() => { window.__town3dLean(true); window.__town3dFly(true) }); await page.waitForTimeout(1600)
await page.evaluate(() => window.__town3dCruise(false))
await page.evaluate(() => window.__town3dFlyPose(0, 14, 8, 0, 0)); await page.waitForTimeout(1400)
await state('低空飛行（街の中心）')
await page.evaluate(() => window.__town3dLand(true)); await page.waitForTimeout(6000)
await state('着地して歩く')

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/wintex.txt`, log.join('\n'))
console.log('WROTE ' + outDir + '/wintex.txt')
await browser.close()
