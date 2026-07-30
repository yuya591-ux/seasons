// 歩行の操作感の実測(2026-07-30)。#4=ズーム別の目線の高さ・カメラ距離・画角／#5=入力の応答と酔いの元。
// アプリは変更しない。three の Object3D.prototype を包んでカメラ本体を捕まえ、位置・画角を直に読む。
// 使い方: PORT=4890 node scripts/qa-walkfeel.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30/walk'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } }) // 横持ち（歩行の主軸）
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(6000)

// three を包んで「根のScene」と「毎フレーム描画に使われるカメラ」を捕まえる
const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
await page.evaluate(async (list) => {
  for (const u of list) {
    try { const m = await import(/* @vite-ignore */ u); if (!m || !m.Object3D) continue
      const P = m.Object3D.prototype
      if (!P.__wfProbe) { const orig = P.updateMatrixWorld
        P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent
          if (r.isScene) globalThis.__wfScene = r
          if (r.isCamera && r.isPerspectiveCamera) globalThis.__wfCam = r
          return orig.call(this, f) }
        P.__wfProbe = true }
      return u } catch { /* 次 */ }
  }
  return null
}, urls)
await page.waitForTimeout(800)

// 街の中心付近へ飛んで着地する（現代homeの中央通り）
await page.evaluate(() => { window.__town3dWindow(true) })
await page.evaluate(() => { window.__town3dLean(true); window.__town3dFly(true) })
await page.waitForTimeout(1200)
await page.evaluate(() => window.__town3dFlyPose(0, 24, -30, 0, -0.2))
await page.waitForTimeout(1200)
await page.evaluate(() => window.__town3dLand(true))
await page.waitForTimeout(6000)
say(`■ 着地直後の状態: ${JSON.stringify(await page.evaluate(() => window.__town3dDbg()))}`)

const camInfo = () => page.evaluate(() => {
  const c = globalThis.__wfCam
  const d = window.__town3dDbg()
  if (!c || !d) return null
  const e = c.matrixWorld.elements
  const cx = e[12], cy = e[13], cz = e[14]
  const g = window.__town3dGroundAt(cx, cz)
  return {
    自機: { x: d.x, y: d.y, z: d.z }, mode: d.mode,
    カメラ: { x: +cx.toFixed(2), y: +cy.toFixed(2), z: +cz.toFixed(2) },
    目線の地上高: +(cy - g).toFixed(2),
    自機からの水平距離: +Math.hypot(cx - d.x, cz - d.z).toFixed(2),
    自機より上: +(cy - d.y).toFixed(2),
    画角: +c.fov.toFixed(1),
  }
})

// ───────────────────────────────── #4 ズーム別
say('\n■ #4 ズーム別の目線の高さ・カメラ距離・画角（歩行・静止時）')
say('   ズーム   目線の地上高   自機からの水平距離   自機より上   画角')
for (const z of [0.4, 1.0, 1.56, 3.0]) {
  await page.evaluate((v) => window.__town3dZoom(v), z)
  await page.waitForTimeout(2000) // カメラの追従(walkCamLag)が落ち着くまで
  const c = await camInfo()
  say(`   ${String(z).padEnd(6)} ${String(c.目線の地上高).padStart(10)}m ${String(c.自機からの水平距離).padStart(16)}m ${String(c.自機より上).padStart(11)}m ${String(c.画角).padStart(7)}°`)
  // 画面そのまま（水彩グレードが乗った本当の見え方）を撮る
  await page.evaluate(() => { window.__town3dLook(0.001, 0) }) // 停止判定に落ちないよう小突く
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/zoom_${String(z).replace('.', '_')}.png` })
  say(`      → zoom_${String(z).replace('.', '_')}.png`)
}
await page.evaluate(() => window.__town3dZoom(1.56))
await page.waitForTimeout(1500)

// ───────────────────────────────── #5 応答と酔い
// 毎フレームの状態を取りながら入力を当て、入力の始まり／終わりに対するカメラの追従を測る
const trial = async (name, applyJs, frames = 110, applyFrom = 10, applyTo = 60) => {
  const s = await page.evaluate(({ js, n, a, b }) => new Promise((res) => {
    const out = []
    let i = 0
    const fn = new Function('on', js)
    const tick = () => {
      const on = i >= a && i < b
      fn(on)
      const d = window.__town3dDbg()
      const c = globalThis.__wfCam
      const e = c ? c.matrixWorld.elements : null
      out.push({ i, t: performance.now(), yaw: d.yaw, camYaw: d.camYaw, x: d.x, z: d.z, vel: d.vel, cx: e ? +e[12].toFixed(3) : 0, cz: e ? +e[14].toFixed(3) : 0, cy: e ? +e[13].toFixed(3) : 0 })
      if (++i < n) requestAnimationFrame(tick); else { window.__town3dMove(0, 0); res(out) }
    }
    requestAnimationFrame(tick)
  }), { js: applyJs, n: frames, a: applyFrom, b: applyTo })
  await page.evaluate(() => window.__town3dMove(0, 0))
  await page.waitForTimeout(1200)
  return { name, s }
}

const deg = (r) => r * 180 / Math.PI
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const analyze = (r, applyFrom = 10, applyTo = 60) => {
  const s = r.s
  const dt = (s[s.length - 1].t - s[0].t) / (s.length - 1)
  // カメラの向きの角速度（度/秒）＝画面が振られる速さ＝酔いの元
  let maxW = 0, sumW = 0
  for (let i = 1; i < s.length; i++) { const w = Math.abs(deg(wrap(s[i].camYaw - s[i - 1].camYaw))) / (dt / 1000); sumW += w; if (w > maxW) maxW = w }
  // 入力開始からカメラが1°動くまで／入力終了から止まるまで（0.5°/フレーム未満になるまで）
  const base = s[applyFrom].camYaw
  let react = -1
  for (let i = applyFrom; i < s.length; i++) if (Math.abs(deg(wrap(s[i].camYaw - base))) > 1) { react = i - applyFrom; break }
  let settle = -1
  for (let i = applyTo + 1; i < s.length; i++) { if (Math.abs(deg(wrap(s[i].camYaw - s[i - 1].camYaw))) < 0.5) { settle = i - applyTo; break } }
  const over = deg(wrap(s[s.length - 1].camYaw - s[applyTo].camYaw))
  const swing = deg(wrap(s[applyTo].camYaw - base))
  const moved = Math.hypot(s[s.length - 1].x - s[applyFrom].x, s[s.length - 1].z - s[applyFrom].z)
  return { フレーム間隔ms: +dt.toFixed(1), カメラ最大角速度: +maxW.toFixed(0), カメラ平均角速度: +(sumW / (s.length - 1)).toFixed(0), 反応フレーム: react, 入力中の振れ角: +swing.toFixed(1), 入力終了後の惰性角: +over.toFixed(1), 静止までのフレーム: settle, 移動距離m: +moved.toFixed(1) }
}

say('\n■ #5 入力の応答と酔いの元（横持ち852×393・既定ズーム1.56）')
const tests = [
  ['見回し（右へドラッグ）', 'if (on) window.__town3dLook(0.02, 0); else window.__town3dLook(0, 0)'],
  ['前進（左スティック上）', 'window.__town3dMove(0, on ? 1 : 0)'],
  ['横移動（左スティック右）', 'window.__town3dMove(on ? 1 : 0, 0)'],
  ['斜め前（前進＋横）', 'window.__town3dMove(on ? 0.7 : 0, on ? 0.7 : 0)'],
]
for (const [name, js] of tests) {
  const r = await trial(name, js)
  const a = analyze(r)
  say(`   ${name}`)
  say(`      ${JSON.stringify(a)}`)
}

// 立ち止まったときの微動（腰をおろす・呼吸の揺れ）＝静止画で酔うか
await page.evaluate(() => window.__town3dMove(0, 0))
await page.waitForTimeout(4000)
const still = await page.evaluate(() => new Promise((res) => {
  const out = []; let i = 0
  const tick = () => { const c = globalThis.__wfCam, e = c.matrixWorld.elements
    out.push([+e[12].toFixed(4), +e[13].toFixed(4), +e[14].toFixed(4)])
    if (++i < 90) requestAnimationFrame(tick); else res(out) }
  requestAnimationFrame(tick)
}))
let amp = 0
for (let i = 1; i < still.length; i++) amp = Math.max(amp, Math.hypot(still[i][0] - still[0][0], still[i][1] - still[0][1], still[i][2] - still[0][2]))
say(`   立ち止まって90フレームのカメラの揺れ幅: ${amp.toFixed(4)}m  （腰をおろす量 sitAmt=${await page.evaluate(() => window.__town3dSit())}）`)

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/walkfeel.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/walkfeel.txt')
await browser.close()
