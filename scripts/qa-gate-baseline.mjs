// qa-gate 検収ベースライン(2026-07-28): iPhone相当条件で実操作し、描画間隔のばらつき(カクつき)・解像度・描画コールを採る
// 条件: 393x852 / deviceScaleFactor 3 / CPU 4倍スロットル(CDP) = iPhone Safari の重さを机上で模擬
import { chromium } from 'playwright'
import fs from 'node:fs'
const port = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-28'
fs.mkdirSync(outDir, { recursive: true })

// HEADED=1 で実ウィンドウ(本物のGPU)＝fps/カクつきが実態に近い値になる。既定のヘッドレスはソフトウェア描画のため描画コール等の相対比較用
const browser = await chromium.launch({ headless: !process.env.HEADED })
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(800)
await page.evaluate(() => window.__applyScene && window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(3500)

// 描画間隔(ddt)を実測 → 中央値・p95・最悪値・「中央値の2倍超」の割合(=カクつき率)
const pacing = async (ms) => {
  const raw = await page.evaluate(
    (dur) =>
      new Promise((res) => {
        const out = []
        const t0 = performance.now()
        const tick = () => {
          const s = window.__town3dStats && window.__town3dStats()
          if (s) out.push(s.ddt)
          if (performance.now() - t0 < dur) requestAnimationFrame(tick)
          else res(out)
        }
        requestAnimationFrame(tick)
      }),
    ms,
  )
  const d = []
  for (let i = 1; i < raw.length; i++) if (raw[i] !== raw[i - 1]) d.push(raw[i])
  const v = d.filter((x) => x > 0 && x < 1).sort((a, b) => a - b)
  if (!v.length) return null
  const med = v[(v.length / 2) | 0]
  return {
    n: v.length,
    fps: +(1 / med).toFixed(1),
    med: +(med * 1000).toFixed(1),
    p95: +(v[(v.length * 0.95) | 0] * 1000).toFixed(1),
    max: +(v[v.length - 1] * 1000).toFixed(1),
    hitch: +((100 * v.filter((x) => x > med * 2).length) / v.length).toFixed(1),
  }
}

const rows = []
const probe = async (name, shot) => {
  await page.waitForTimeout(1200)
  const st = await page.evaluate(() => ({ ...window.__town3dDraw(), pr: window.__town3dStats().pr })) // calls は __town3dDraw が正（__town3dStatsは常に1を返す罠）
  const p = await pacing(5000)
  rows.push({ name, calls: st.calls, tris: st.tris, pr: st.pr, ...(p || {}) })
  console.log(
    `${name}: calls=${st.calls} pr=${st.pr} 描画fps=${p ? p.fps : '?'} 間隔中央=${p ? p.med : '?'}ms p95=${p ? p.p95 : '?'}ms 最悪=${p ? p.max : '?'}ms カクつき率=${p ? p.hitch : '?'}%`,
  )
  if (shot) await page.screenshot({ path: `${outDir}/${shot}` })
}

await probe('窓辺(眺める・既定)', '01_窓辺.png')
await page.evaluate(() => window.__town3dWindow(true))
await page.waitForTimeout(1400)
await probe('窓をあける', '02_窓をあける.png')
await page.evaluate(() => window.__town3dLean(true))
await page.waitForTimeout(1500)
await page.evaluate(() => window.__town3dFly(true))
await page.waitForTimeout(1200)
await page.evaluate(() => window.__town3dCruise(false))
await page.evaluate(() => window.__town3dFlyPose(0, 14, 8, 0, 0))
await probe('低空飛行(街の中心)', '03_低空飛行.png')
await page.evaluate(() => window.__town3dFlyPose(0, 100, -150, 0, 0))
await probe('雲海(y100)', '04_雲海.png')
await page.evaluate(() => window.__town3dFlyPose(0, 14, 8, 0, 0))
await page.waitForTimeout(1200)
await page.evaluate(() => window.__town3dLand(true))
await page.waitForTimeout(3000)
await probe('着地して歩く', '05_歩行.png')

// 無操作を続けて省電力(16fps)へ落ちるかを確認
await page.waitForTimeout(5000)
const idle = await pacing(6000)
console.log(`無操作4秒以降(省電力): 描画fps=${idle ? idle.fps : '?'} 間隔中央=${idle ? idle.med : '?'}ms`)
rows.push({ name: '無操作(省電力)', ...(idle || {}) })

console.log('errors=' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 5).join(' | ') : ''))
fs.writeFileSync(`${outDir}/baseline.json`, JSON.stringify({ rows, errs }, null, 1))
console.log('WROTE ' + outDir + '/baseline.json')
await browser.close()
