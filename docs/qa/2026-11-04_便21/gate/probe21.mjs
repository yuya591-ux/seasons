// 便21 の撮影（便20 の probe20.mjs を写した）: 鴨川の角部屋を開き、決めた目の位置（v:<名>）や手順で撮る
// 使い方: node docs/qa/2026-11-04_便21/gate/probe21.mjs <情景ID> <名前> [端末 pc|iphone] [手順…]
//   手順: wait:ms ・ open（窓をあける）・ lean（乗り出す）・ view:yaw:pitch ・ zoom:n ・ ev:名前（出来事を今すぐ）・ shot:名前 ・ info ・ fly / walk（画面の釦で空へ・地上へ）
//         trainAt:mode:s0（電車をその所に置く・検証用）・ okuT:秒（送り火の時を進める）
import { chromium } from 'playwright'
import fs from 'node:fs'
const [scene = 'summer-night-corner-room', name = 'p', dev = 'pc', ...steps] = process.argv.slice(2)
const OUT = process.env.QA_OUT || 'docs/qa/2026-11-04_便21/shots'
fs.mkdirSync(OUT, { recursive: true })
const DEV = { pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } }[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const p = await (await b.newContext({ ...DEV, serviceWorkers: 'block' })).newPage()
const errs = [], warns = []
p.on('pageerror', (e) => errs.push('PE ' + e.message))
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t.slice(0, 300)); if (m.type() === 'warning' && /鴨川|GL_/.test(t)) warns.push(t.slice(0, 300)) })
const port = process.env.PORT || 4961
await p.goto(`http://localhost:${port}/seasons/?dev=1${process.env.Q ? '&' + process.env.Q : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
const t0 = Date.now()
await p.evaluate((id) => window.__applyScene(id), scene)
await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).catch(() => {})
console.log('組むまで', Date.now() - t0, 'ms・鴨川', JSON.stringify(await p.evaluate(() => { const k = window.__town3dKamo && window.__town3dKamo(); return k ? { lifeMs: k.lifeMs, calls: k.calls, tris: k.tris, low: k.low, time: k.time } : null })))
// 鴨川の座標の点から点を見る形で、空の自分を置く: aimK:<目のX>:<目の高さ（鴨川の座標）>:<目のZ>:<見るX>:<見る高さ>:<見るZ>
async function aimK(ex, ey, ez, tx, ty, tz) {
  return p.evaluate(([ex, ey, ez, tx, ty, tz]) => { const e = window.__town3dKamoTown(ex, ez, ey), t = window.__town3dKamoTown(tx, tz, ty); const yaw = Math.atan2(-(t.x - e.x), -(t.z - e.z)), pitch = Math.atan2(t.y - e.y, Math.hypot(t.x - e.x, t.z - e.z)); window.__town3dFlyPose(e.x, e.y, e.z, yaw, pitch); return { e, yaw, pitch } }, [ex, ey, ez, tx, ty, tz].map(Number))
}
// 便21: 決めた目の位置（鴨川の座標・[目のx,高さ,z, 見るx,高さ,z, 画角]）。水面は高さ約 -4.6
const V = {
  delta: [-70, 14, 150, -72, -4.6, 30, 55], // 鴨川デルタを南の上から（デルタの先は x -70・z 55 のあたり）
  stones: [-104, -2.6, 79, -88, -4.8, 60, 60], // 賀茂川側の飛び石の近く（目の高さ・下流から）
  bankW: [-122, -1.6, 160, -110, -2.2, 0, 60], // 西の河川敷の道から北を見る
  water: [-60, 2, 150, -35, -4.6, 320, 55], // 川面（下流）
  shallow: [-96, 3.5, 82, -90, -4.8, 58, 55], // 飛び石のあたりを斜め上から見下ろす
  stoneClose: [-99, -1.5, 70, -98, -4.8, 60, 55], // 飛び石の下流を近くから見下ろす
  town: [-330, 28, 260, -170, 0, 60, 55], // 西岸の家並みを低く
  town2: [-262, 9, 175, -215, 2, 110, 55], // 西岸の家並みをもっと低く
  machiya: [436.5, 0.2, 440.3, 421, 1.2, 451, 62], // 町家の並ぶ通り（東の吉田の西・データで町家が一番多く固まる所）
  east: [250, 70, 120, 1250, 30, 380, 45], // 東の京都大学と吉田山の方へ
  yoshida: [1000, 110, 640, 1460, 40, 260, 50], // 吉田山を南西の上から
  clock: [760, 30, 520, 755, 12, 405, 50], // 京大の時計台（正門の前から）
  sky: [0, 4, 220, 0, 300, -900, 75], // 空を見上げる
}
for (const s of steps) {
  const [k, a, c, ...r] = s.split(':')
  if (k === 'v') { const v = V[a]; await p.evaluate((v) => { window.__kamoCam = { p: v.slice(0, 3), l: v.slice(3, 6), fov: v[6] } }, v); await p.waitForTimeout(+(c || 1200)); continue }
  if (k === 'cam') { await p.evaluate((v) => { window.__kamoCam = { p: v.slice(0, 3), l: v.slice(3, 6), fov: v[6] || 30 } }, [a, c, ...r].map(Number)); await p.waitForTimeout(700) }
  else if (k === 'camoff') { await p.evaluate(() => { window.__kamoCam = null }); await p.waitForTimeout(500) }
  else if (k === 'fly2') { await p.evaluate(() => window.__town3dFly(true)); await p.waitForTimeout(2600) }
  else if (k === 'land') { await p.evaluate(() => window.__town3dLand(true)); await p.waitForTimeout(3200) }
  else if (k === 'aimK') { console.log('置いた', JSON.stringify(await aimK(a, c, ...r))); await p.waitForTimeout(1500) }
  else if (k === 'walkK') { await p.evaluate(([X, Z, tx, tz]) => { const e = window.__town3dKamoTown(X, Z), t = window.__town3dKamoTown(tx, tz); window.__town3dWalkPose(e.x, e.z, Math.atan2(t.x - e.x, -(t.z - e.z))) }, [a, c, ...r].map(Number)); await p.waitForTimeout(1800) }
  else
  if (k === 'wait') await p.waitForTimeout(+a)
  else if (k === 'open') { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(1500) }
  else if (k === 'lean') { await p.evaluate(() => window.__town3dLean(true)); await p.waitForTimeout(1500) }
  else if (k === 'view') await p.evaluate(([y, q]) => window.__town3dSetView(+y, +q), [a, c])
  else if (k === 'zoom') await p.evaluate((z) => window.__town3dZoom && window.__town3dZoom(+z), a)
  else if (k === 'ev') console.log('出来事', a, await p.evaluate((n) => window.__town3dKamoEv(n), a))
  else if (k === 'shot') { await p.screenshot({ path: `${OUT}/${name}-${a}.png` }); console.log('撮った', `${OUT}/${name}-${a}.png`) }
  else if (k === 'info') console.log('動く物', JSON.stringify(await p.evaluate(() => window.__town3dKamoLife())))
  else if (k === 'nav') console.log('居場所', JSON.stringify(await p.evaluate(() => window.__town3dNav && window.__town3dNav())))
  else if (k === 'audio') console.log('音', JSON.stringify(await p.evaluate(() => window.__audioDebug ? window.__audioDebug() : null)))
  else if (k === 'fly' || k === 'walk') { await p.locator('.iconbtn--stage').click({ force: true }).catch(() => {}); await p.waitForTimeout(3500) }
  else if (k === 'eval') console.log('eval', JSON.stringify(await p.evaluate(a)))
}
console.log('エラー', errs.length, errs.slice(0, 5).join(' ／ '), '注意', warns.slice(0, 5).join(' ／ '))
await b.close()
