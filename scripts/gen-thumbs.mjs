// 各公開情景の実描画から、ギャラリー用サムネを生成して public/thumbs/<id>.jpg に保存する。
// 使い方: プレビュー(4790, dev hooks入りビルド)起動中に node scripts/gen-thumbs.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('public/thumbs', { recursive: true })

const port = process.env.PORT || '4790'
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }) // GPU で描く（ソフトの描画では町の3Dの色と霧が本物と違う）
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })
await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(400)
// UIを隠してから撮る（サムネに操作UIを写さない）
await page.addStyleTag({ content: '.ui{display:none !important}' })

const ids = await page.evaluate(() => window.__sceneIds || [])
console.log('情景:', ids.join(', '))
for (const id of ids) {
  await page.evaluate((sid) => window.__applyScene(sid), id)
  await page.waitForTimeout(3200) // 描画が安定するまで（town3dは遅延import＋シーン構築があるので長め）
  // 町の3Dは組み立てに10秒以上かかることがある。組み終わる（__town3dDraw が値を返す）まで最大40秒待ち、窓の開きが落ち着くまで少し置く（3.2秒だけでは組み立て中が写る恐れがあった・便2 V56）
  if (await page.evaluate(() => !!document.querySelector('.town3d-stage')).catch(() => false)) {
    for (let k = 0; k < 80; k++) { const ok = await page.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw())).catch(() => false); if (ok) break; await page.waitForTimeout(500) }
    // 窓辺の構図のままだと横長の枠では畳と猫が主になり、窓の外の街が上の端に小さく写る。窓をあけ、いちばん寄せ、視線を上げて外の景色を写す。
    // 一覧のカードは画の真ん中を横長に切り出すので、真ん中に外の景色が来る高さ（0.45）にする。0.7 まで上げると谷戸は天井が写る（便2 V56）
    await page.evaluate(() => { window.__town3dWindow && window.__town3dWindow(true); window.__town3dZoom && window.__town3dZoom(0.4); window.__town3dSetView && window.__town3dSetView(0, 0.45) })
    await page.waitForTimeout(3500)
  }
  // 中央を切り出してサムネに（窓枠の外周を避け、景色の核を見せる）
  await page.screenshot({ path: `public/thumbs/${id}.jpg`, type: 'jpeg', quality: 82,
    clip: { x: 80, y: 55, width: 740, height: 490 } })
  console.log('撮影:', id)
}
await browser.close()
console.log('完了')
