// 第3部の事実確認(2026-07-28): 実操作で見つかった3点が「一瞬か常時か」「本当に起きているか」を切り分ける
// 条件は qa-gate-baseline と同じ iPhone相当(393x852 / DSF3)。HEADED=1 で実GPU（既定のヘッドレスは絵が甘くなる）
import { chromium } from 'playwright'
import fs from 'node:fs'
const port = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-28'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: !process.env.HEADED })
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(800)
await page.evaluate(() => window.__applyScene && window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(3500)

const log = []
const say = (s) => { console.log(s); log.push(s) }

// ── #11 窓辺のほこり: 画面中央上部を切り出して粒の形（丸いか四角いか）を見る ──
await page.screenshot({ path: `${outDir}/11_窓辺_ほこり拡大.png`, clip: { x: 60, y: 190, width: 270, height: 270 } })
const dustInfo = await page.evaluate(() => window.__town3dPoints())
say('#11 粒(Points)の材質一覧: ' + JSON.stringify(dustInfo))

// ── #9 着地: 「直後」と「安定後」を撮り分ける ──
await page.evaluate(() => window.__town3dWindow(true))
await page.waitForTimeout(1200)
await page.evaluate(() => window.__town3dLean(true))
await page.waitForTimeout(1400)
await page.evaluate(() => window.__town3dFly(true))
await page.waitForTimeout(1500)
await page.evaluate(() => window.__town3dCruise(false))
await page.evaluate(() => window.__town3dFlyPose(0, 14, 8, 0, 0))
await page.waitForTimeout(1200)
await page.evaluate(() => window.__town3dLand(true))
await page.waitForTimeout(400)
await page.screenshot({ path: `${outDir}/09_着地_直後.png` })
const p9a = await page.evaluate(() => (window.__town3dFlyPose ? window.__town3dFlyPose() : null))
await page.waitForTimeout(6000)
await page.screenshot({ path: `${outDir}/09_着地_安定後.png` })
const p9b = await page.evaluate(() => (window.__town3dFlyPose ? window.__town3dFlyPose() : null))
say('#9 着地直後の姿勢: ' + JSON.stringify(p9a))
say('#9 着地6秒後の姿勢: ' + JSON.stringify(p9b))
// さらに一歩前進して構図が変わるかを見る
await page.evaluate(() => window.__town3dMove && window.__town3dMove(0, -1))
await page.waitForTimeout(2500)
await page.evaluate(() => window.__town3dMove && window.__town3dMove(0, 0))
await page.waitForTimeout(1200)
await page.screenshot({ path: `${outDir}/09_着地_歩いた後.png` })

// ── #10 雲海の近接雲: 3地点で撮り、白飛び度合い(画素の明るさ)を数値で出す ──
await page.evaluate(() => window.__town3dFly(true))
await page.waitForTimeout(1500)
const spots = [
  { n: 'a', p: [0, 100, -150, 0, 0] },
  { n: 'b', p: [0, 92, -60, 0, -0.25] },
  { n: 'c', p: [40, 108, -200, 0.6, 0] },
]
for (const s of spots) {
  await page.evaluate((p) => window.__town3dFlyPose(...p), s.p)
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${outDir}/10_雲海_近接_${s.n}.png` })
  const lum = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    const g = document.createElement('canvas'); g.width = 96; g.height = 208
    const x = g.getContext('2d'); x.drawImage(c, 0, 0, g.width, g.height)
    const d = x.getImageData(0, 0, g.width, g.height).data
    let s = 0, hi = 0, n = g.width * g.height
    for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; s += v; if (v > 240) hi++ }
    return { 平均輝度: +(s / n).toFixed(1), 白飛び画素率: +((100 * hi) / n).toFixed(1) }
  })
  say(`#10 雲海地点${s.n} ${JSON.stringify(s.p)} → ${JSON.stringify(lum)}`)
}

say('errors=' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 5).join(' | ') : ''))
fs.writeFileSync(`${outDir}/fact3.txt`, log.join('\n'))
console.log('WROTE ' + outDir + '/fact3.txt')
await browser.close()
