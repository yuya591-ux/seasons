// 便23 の撮影（便22 の probe22.mjs を写した・便21 の probe21.mjs を写した）: 鴨川の角部屋を開き、決めた目の位置（v:<名>）や手順で撮る
// 使い方: node docs/qa/2026-11-04_便21/gate/probe21.mjs <情景ID> <名前> [端末 pc|iphone] [手順…]
//   手順: wait:ms ・ open（窓をあける）・ lean（乗り出す）・ view:yaw:pitch ・ zoom:n ・ ev:名前（出来事を今すぐ）・ shot:名前 ・ info ・ fly / walk（画面の釦で空へ・地上へ）
//         trainAt:mode:s0（電車をその所に置く・検証用）・ okuT:秒（送り火の時を進める）
import { chromium } from 'playwright'
import fs from 'node:fs'
const [scene = 'summer-night-corner-room', name = 'p', dev = 'pc', ...steps] = process.argv.slice(2)
const OUT = process.env.QA_OUT || 'docs/qa/2026-11-05_便23/shots'
fs.mkdirSync(OUT, { recursive: true })
const DEV = { pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } }[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const p = await (await b.newContext({ ...DEV, serviceWorkers: 'block' })).newPage()
const errs = [], warns = []
p.on('pageerror', (e) => errs.push('PE ' + e.message))
const kamoUrls = [] // 便21: 鴨川のデータの読み先（公開の照らし）
p.on('request', (r) => { if (/\/kamo\//.test(r.url())) kamoUrls.push(r.url().split('/seasons/')[1]) })
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t.slice(0, 300)); if (m.type() === 'warning' && /鴨川|GL_/.test(t)) warns.push(t.slice(0, 300)) })
const port = process.env.PORT || 4961
await p.goto(`${process.env.BASE || `http://localhost:${port}/seasons/`}?dev=1${process.env.Q ? '&' + process.env.Q : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
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
  kamobashi: [-60, 4, 175, -60, 0, 110, 55], // 賀茂大橋を南の河川敷の上から
  hanabi: [-57, 0.3, 54, -66, -1.8, 39, 50], // デルタの先の手持ち花火（南東の低い所から）
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
  clock: [763, 4.6, 536, 763, 17, 450, 55], // 京大の時計台（正門の外の東一条通から）
  clockSky: [700, 60, 600, 763, 18, 450, 50], // 京大の時計台を南西の上から
  daigengu: [1126, 42, 703, 1129, 34, 685, 60], // 吉田神社の大元宮
  honmiya: [1080, 22, 560, 1117, 18, 510, 55], // 吉田神社の本宮のあたり
  moan: [1320, 66, 420, 1332, 67.5, 410, 62], // 茂庵
  summit: [1376, 70.2, 312, 1366, 69.5, 302, 62], // 山頂休憩広場と東屋
  park: [1238, 51.6, 604, 1229, 50.5, 590, 62], // 吉田山公園
  sky: [0, 4, 220, 0, 300, -900, 75], // 空を見上げる
  // 便23: 南の四角（河原町・木屋町・先斗町・祇園・南の鴨川の岸）
  sOver: [150, 420, 4300, 0, -10, 2100, 50], // 南から高く見下ろす
  sPonto: [-20, 25, 3050, -160, -10, 2500, 55], // 四条から先斗町と木屋町の川べりを
  sShijo: [-160, 15, 3100, 20, -8, 2930, 55], // 四条大橋と南座
  sGion: [330, 40, 3050, 250, -8, 2700, 55], // 祇園（花見小路）を南の上から
  sKiya: [-300, 30, 2300, -190, -8, 2600, 55], // 木屋町（高瀬川）を北西から
  sSanjo: [80, 25, 2450, -40, -8, 2330, 55], // 三条大橋
  sSeam: [200, 120, 600, 0, -8, 1300, 55], // 北の四角と南の四角の継ぎ目を北から
  stPonto: [-134, -13.6, 2860, -134, -14.6, 2700, 60], // 先斗町通（目の高さ・地図の通りの線の上）
  stKiya: [-180, -11.9, 2200, -186, -13.6, 2330, 60], // 木屋町通と高瀬川（目の高さ）
  stHanami: [246, -12.9, 2770, 238, -13.6, 2870, 60], // 花見小路（目の高さ）
  stShira: [86, -13.3, 2726, 190, -14.2, 2696, 60], // 祇園白川（白川南通から東へ）
  stShijo: [-130, -17.6, 2985, -90, -16, 2905, 60], // 四条大橋を南の河川敷から
  stRiverA: [-55, -1.2, 280, -75, -6, 700, 60], // 北の川を同じ高さ（水面の 6m 上）から
  stRiver: [-60, -14, 2200, -110, -18, 2700, 60], // 三条の南から下流の鴨川（先斗町の川べり）
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
  else if (k === 'outer') { await p.waitForFunction(() => { const k = window.__town3dKamo && window.__town3dKamo(); return k && k.outer }, null, { timeout: 120000 }).catch(() => {}); console.log('外の町', JSON.stringify(await p.evaluate(() => { const k = window.__town3dKamo(); return k && k.outer ? { ms: k.outer.ms, boxes: k.outer.boxes, waterCut: k.outer.waterCut } : null }))); await p.waitForTimeout(+(a || 1500)) }
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
  else if (k === 'jsf') console.log('js', JSON.stringify(await p.evaluate(fs.readFileSync(a, 'utf8')))) // 便21: ファイルに書いた式を読んで回す（コロンを含む式のため）
}
console.log('鴨川のデータの読み先', kamoUrls.slice(0, 6).join(' '), '・数', kamoUrls.length, '・版の印つき', kamoUrls.filter((u) => u.includes('?v=')).length)
console.log('エラー', errs.length, errs.slice(0, 5).join(' ／ '), '注意', warns.slice(0, 5).join(' ／ '))
await b.close()
