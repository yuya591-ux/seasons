// 便19 の撮影: 鴨川の角部屋を本物の GPU（画面なしの Chromium・D3D11）で開き、手順を並べて動かしてから撮る。
// 使い方: node docs/qa/2026-11-03_便19/gate/shot19.mjs <端末> <情景ID> <名前> <手順> [追加のクエリ]
//   端末: pc（1920×1080）・ipad（1180×820@2）・iphone（402×874@3・縦）・iphoneL（874×402@3・横）
//   手順（「,」区切り・左から順に）:
//     open＝窓をあける／lean＝乗り出す／view:<横>:<縦>＝見回し（rad）／fly＝空へ／land＝地上へ／back＝窓へもどる
//     pose:<x>:<y>:<z>:<yaw>:<pitch>＝飛ぶ自分を置く（町の3Dの座標）／move:<横>:<縦>:<ミリ秒>＝歩く・進むの入力をかけて離す
//     walk:<x>:<z>:<yaw>[:<足の高さ>]＝地上の自分を置く／cruise＝巡航（すすむ）／zoom:<倍>
//     wait:<ミリ秒>／poke＝マウスを動かして操作の帯を出す（撮る直前に）
//   SAME=1 で動きを抑える（便18 の shot.mjs と同じ）。PORT で見る用のサーバー（既定 4971）
// 出る物: QA_OUT（既定 docs/qa/2026-11-03_便19/shots）/<名前>.png と、1行の結果（いる所・地面・段・エラー）
import { chromium } from 'playwright'
import fs from 'node:fs'
const [dev = 'pc', scene = 'autumn-dusk-corner-room', name = 'shot', steps = '', extra = ''] = process.argv.slice(2)
const OUT = process.env.QA_OUT || 'docs/qa/2026-11-03_便19/shots'
fs.mkdirSync(OUT, { recursive: true })
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  iphoneL: { viewport: { width: 874, height: 402 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}[dev]
const SAME = !!process.env.SAME
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const p = await (await b.newContext({ ...DEV, serviceWorkers: 'block', ...(SAME ? { reducedMotion: 'reduce' } : {}) })).newPage()
if (SAME) await p.addInitScript(() => { let s = 20261103; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } })
const errs = [], gl = []
p.on('pageerror', (e) => errs.push('PE ' + e.message))
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(r.status() + ' ' + r.url().split('/seasons/').pop()) })
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t.slice(0, 300)); if (/GL_INVALID|INVALID_OPERATION/.test(t)) gl.push(t.slice(0, 160)) })
const port = process.env.PORT || 4971
await p.goto(`http://localhost:${port}/seasons/?dev=1${extra ? '&' + extra : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
await p.evaluate((id) => window.__applyScene(id), scene)
await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).catch(() => {})
await p.waitForTimeout(1500)
let poke = false
for (const s of steps.split(',').filter(Boolean)) {
  const [k, ...a] = s.split(':')
  if (k === 'open') { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(1500) }
  else if (k === 'lean') { await p.evaluate(() => window.__town3dLean(true)); await p.waitForTimeout(1600) }
  else if (k === 'view') await p.evaluate(([y, q]) => window.__town3dSetView(+y, +q), a)
  else if (k === 'fly') { await p.evaluate(() => window.__town3dFly(true)); await p.waitForTimeout(2600) }
  else if (k === 'land') { await p.evaluate(() => window.__town3dLand(true)); await p.waitForTimeout(3200) }
  else if (k === 'back') { await p.evaluate(() => window.__town3dFly(false)); await p.waitForTimeout(2600) }
  else if (k === 'pose') { await p.evaluate((v) => window.__town3dFlyPose(...v.map(Number)), a); await p.waitForTimeout(1200) }
  else if (k === 'move') { await p.evaluate(([x, y]) => window.__town3dMove(+x, +y), a); await p.waitForTimeout(+a[2] || 1000); await p.evaluate(() => window.__town3dMove(0, 0)); await p.waitForTimeout(700) }
  else if (k === 'walk') { await p.evaluate((v) => window.__town3dWalkPose(+v[0], +v[1], +v[2], v[3] === undefined ? undefined : +v[3]), a); await p.waitForTimeout(1500) }
  else if (k === 'cruise') await p.evaluate(() => window.__town3dCruise(true))
  else if (k === 'zoom') await p.evaluate((v) => window.__town3dZoom(+v), a[0])
  else if (k === 'wait') await p.waitForTimeout(+a[0] || 1000)
  else if (k === 'poke') poke = true
}
await p.waitForTimeout(1500)
if (poke) { await p.mouse.move(DEV.viewport.width * 0.5, DEV.viewport.height * 0.5); await p.mouse.move(DEV.viewport.width * 0.52, DEV.viewport.height * 0.5); await p.waitForTimeout(900) }
const st = await p.evaluate(() => ({ nav: window.__town3dNav ? window.__town3dNav() : null, kamo: window.__town3dKamo ? window.__town3dKamo() : null, stats: window.__town3dStats ? window.__town3dStats() : null, stage: (document.querySelector('.iconbtn--stage') || {}).textContent || null, pill: (document.querySelector('.modepill') || {}).textContent || null, idle: document.body.classList.contains('idle') }))
await p.screenshot({ path: `${OUT}/${name}.png` })
const k = st.kamo
console.log(`${name} ${dev} ${scene} [${steps}] ${JSON.stringify({ nav: st.nav, kamo: k && { low: k.low, time: k.time, sky: k.sky, calls: k.calls, tris: k.tris }, flyable: st.stats && st.stats.flyable, stage: st.stage, pill: st.pill, idle: st.idle })} ${errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 4).join(' | ') : 'エラー無し'}${gl.length ? ' GL ' + gl.length : ''}`)
await b.close()
