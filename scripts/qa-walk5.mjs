// 5エリアで着地して歩く(2026-07-30)。詰まり（進めない）と視界を塞ぐ近接物を自動で拾う。
// アプリは変更しない。__town3dFlyPose→__town3dLand で各エリアへ降り、60歩ぶん前進しながら
// 進んだ距離・画面中央のレイキャスト距離を測る。詰まった地点はその場でスクショに残す。
// 使い方: PORT=4890 node scripts/qa-walk5.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30/walk'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }

const AREAS = [
  { key: 'edo', label: '江戸', x: 640, z: -46, alt: 40 },
  { key: 'taisho', label: '大正', x: -640, z: -30, alt: 40 },
  { key: 'sengoku', label: '戦国', x: 140, z: -640, alt: 40 },
  { key: 'home', label: '現代home', x: 0, z: -30, alt: 26 },
  { key: 'cloud', label: '雲海', x: 56, z: -312, alt: 100 },
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(6000)

const table = []
for (const a of AREAS) {
  await page.evaluate(() => { window.__town3dWindow(true) }).catch(() => {})
  await page.evaluate(() => { window.__town3dLean(true); window.__town3dFly(true) }).catch(() => {})
  await page.waitForTimeout(700)
  await page.evaluate(([x, y, z]) => window.__town3dFlyPose(x, y, z, 0, -0.2), [a.x, a.alt, a.z])
  await page.waitForTimeout(2200)
  await page.evaluate(() => window.__town3dLand(true))
  await page.waitForTimeout(6500)
  const d0 = await page.evaluate(() => window.__town3dDbg())
  say(`\n■ ${a.label}  着地の状態: ${JSON.stringify(d0)}`)
  if (!d0 || d0.mode !== 'walk') { say('   × 着地できなかった（歩行モードに入らない）'); table.push({ ...a, ok: false }); continue }

  // 60歩ぶん歩く。8歩ごとに向きを変えて街の中を巡る
  const walk = await page.evaluate(() => new Promise((res) => {
    const rec = []
    let i = 0
    const tick = () => {
      if (i % 48 === 0) window.__town3dFaceWalk((i / 48) * 1.05) // 8歩ごとに向きを変える（48フレーム≒0.8秒）
      window.__town3dMove(0, 1)
      const d = window.__town3dDbg()
      let front = -1
      if (i % 6 === 0 && window.__town3dPick) { // 画面中央のレイキャスト＝目の前を塞ぐ物までの距離
        try { const h = window.__town3dPick(0.5, 0.5); if (h && h.length) front = h[0].d !== undefined ? h[0].d : (h[0].dist !== undefined ? h[0].dist : -1) } catch { /* 無視 */ }
      }
      rec.push({ i, x: d.x, y: d.y, z: d.z, yaw: d.yaw, vel: d.vel, front })
      if (++i < 360) requestAnimationFrame(tick); else { window.__town3dMove(0, 0); res(rec) }
    }
    requestAnimationFrame(tick)
  }))

  // 詰まり判定: 入力があるのに10フレームで0.15m未満しか進まない区間
  let stuck = 0, stuckAt = null
  for (let i = 10; i < walk.length; i++) {
    const dm = Math.hypot(walk[i].x - walk[i - 10].x, walk[i].z - walk[i - 10].z)
    if (dm < 0.15) { stuck++; if (!stuckAt) stuckAt = walk[i] }
  }
  const fronts = walk.filter((w) => w.front >= 0).map((w) => w.front)
  const near = fronts.filter((f) => f < 2.0).length
  const total = Math.hypot(walk[walk.length - 1].x - walk[0].x, walk[walk.length - 1].z - walk[0].z)
  let path = 0
  for (let i = 1; i < walk.length; i++) path += Math.hypot(walk[i].x - walk[i - 1].x, walk[i].z - walk[i - 1].z)
  const clear = await page.evaluate(([x, z]) => window.__town3dClear(x, z), [walk[walk.length - 1].x, walk[walk.length - 1].z])
  say(`   歩いた道のり ${path.toFixed(1)}m ／ 直線の移動 ${total.toFixed(1)}m ／ 詰まったフレーム ${stuck}/${walk.length}（${(stuck / walk.length * 100).toFixed(0)}%）`)
  say(`   目の前2m以内に物があったフレーム ${near}/${fronts.length}   レイキャストの距離の中央値 ${fronts.length ? fronts.sort((p, q) => p - q)[(fronts.length / 2) | 0].toFixed(1) : '-'}m`)
  say(`   終着点の16方位の通行可能距離(m): ${JSON.stringify(clear)}`)
  await page.screenshot({ path: `${outDir}/walk_${a.key}_終着.png` })
  say(`   → walk_${a.key}_終着.png`)
  if (stuckAt) {
    await page.evaluate(([x, z]) => { window.__town3dFaceWalk(0) }, [stuckAt.x, stuckAt.z])
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${outDir}/walk_${a.key}_詰まり.png` })
    say(`   最初に詰まった地点 (${stuckAt.x}, ${stuckAt.z}) → walk_${a.key}_詰まり.png`)
  }
  table.push({ ...a, ok: true, 道のり: +path.toFixed(1), 直線: +total.toFixed(1), 詰まり率: +(stuck / walk.length * 100).toFixed(0), 近接率: fronts.length ? +(near / fronts.length * 100).toFixed(0) : -1 })
}

say('\n■ まとめ')
say('   エリア      歩いた道のり  直線の移動  詰まり率  目の前2m以内')
for (const t of table) {
  if (!t.ok) { say(`   ${t.label.padEnd(10)} 着地できず`); continue }
  say(`   ${t.label.padEnd(10)} ${String(t.道のり).padStart(9)}m ${String(t.直線).padStart(10)}m ${String(t.詰まり率).padStart(8)}% ${String(t.近接率).padStart(12)}%`)
}
say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/walk5.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/walk5.txt')
await browser.close()
