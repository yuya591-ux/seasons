// 人物の接写(2026-07-30)。#2=3層を同じ条件で隔離接写／#3=歩行目線でエリア別に近接3m・中距離12m。
// アプリは変更しない。隔離接写は既存フック(__town3dFigShot/__town3dCrowdShot)、
// 世界内の接写は __town3dFlyPose で近くまで飛んでから __town3dShotAt で撮る（遠い時代エリアは距離カリングで消えるため）。
// 使い方: PORT=4890 node scripts/qa-figshots.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30/figures'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }
const save = (name, dataUrl) => {
  if (!dataUrl) { say(`   × ${name}: 撮影できず`); return false }
  fs.writeFileSync(`${outDir}/${name}`, Buffer.from(dataUrl.split(',')[1], 'base64'))
  say(`   ○ ${name}  ${(fs.statSync(`${outDir}/${name}`).size / 1024).toFixed(0)}KB`)
  return true
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(6000)

// three の Object3D.prototype を包んで根のSceneを捕まえる（生きた人物の位置を読むため）
const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
await page.evaluate(async (list) => {
  for (const u of list) {
    try { const m = await import(/* @vite-ignore */ u); if (!m || !m.Object3D) continue
      const P = m.Object3D.prototype
      if (!P.__figProbe) { const orig = P.updateMatrixWorld
        P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent; if (r.isScene) globalThis.__figScene = r; return orig.call(this, f) }
        P.__figProbe = true }
      return u } catch { /* 次の候補 */ }
  }
  return null
}, urls)
await page.waitForTimeout(1000)

// ───────────────────────────────────────── #2 隔離接写（同じ光・同じ画角）
say('■ #2 3層を同じ条件で接写（隔離シーン・同一の光と正射投影）')
const EDO_CFG = JSON.stringify({ outfit: 'kimono', skin: 0xe6c6a4, hair: 0x2a1f18, iris: 0x4a3a2c, hairStyle: 'topknot', top: 0x3a4a5e, accent: 0x8a6a3a })
for (const [name, yaw, zoom] of [['01_makeResident_正面.png', 0, false], ['01_makeResident_斜め.png', 0.9, false], ['01_makeResident_顔寄り.png', 0, true]]) {
  save(name, await page.evaluate(([y, c, z]) => window.__town3dFigShot(y, c, z), [yaw, EDO_CFG, zoom]))
}
for (const [name, yaw] of [['02_mkCrowdPerson_正面.png', 0], ['02_mkCrowdPerson_斜め.png', 0.9]]) {
  save(name, await page.evaluate(([y]) => window.__town3dCrowdShot(0x3a4a5e, 0.7, y), [yaw]))
}
say('   （mkCrowdPersonの隔離フックには顔寄りの引数が無いため、顔の比較は世界内の近接3mで行う）')

// ───────────────────────────────────────── 世界内の接写ヘルパー
// 指定エリアの近くへ飛び、距離カリングを解いてから、生きている人物の位置を読んで撮る
const AREAS = [
  { key: 'edo', label: '江戸', x: 640, z: -46, alt: 40 },
  { key: 'taisho', label: '大正', x: -640, z: -30, alt: 40 },
  { key: 'sengoku', label: '戦国', x: 140, z: -640, alt: 40 },
  { key: 'home', label: '現代home', x: 0, z: -30, alt: 30 },
  { key: 'cloud', label: '雲海', x: 300, z: -180, alt: 96 },
]

const nearFigs = async (cx, cz, rad, minY) => page.evaluate(([x, z, r, my]) => {
  const s = globalThis.__figScene
  if (!s) return []
  const out = []
  s.traverse((o) => {
    const u = o.userData || {}
    let 層 = null
    if (u.headG) 層 = 'makeResident'
    else if (u.armAmp !== undefined) 層 = 'makePeep'
    else if (u.cswAmp !== undefined) 層 = 'mkCrowdPerson'
    else if (u.walker === true && u.legs) 層 = 'cityWalker'
    if (!層) return
    o.updateWorldMatrix(true, false)
    const e = o.matrixWorld.elements, px = e[12], py = e[13], pz = e[14]
    if (my !== null && py < my) return
    const d = Math.hypot(px - x, pz - z)
    if (d > r) return
    let vis = o.visible
    for (let q = o.parent; q; q = q.parent) if (!q.visible) { vis = false; break }
    out.push({ 層, x: +px.toFixed(2), y: +py.toFixed(2), z: +pz.toFixed(2), d: +d.toFixed(1), vis })
  })
  out.sort((a, b) => a.d - b.d)
  return out.slice(0, 40)
}, [cx, cz, rad, minY === undefined ? null : minY])

// 人物の頭のあたりを見る。dist=カメラまでの水平距離、fovは歩行と同じ78°
const shotFig = async (f, dist) => {
  const yaw = 0.6 // 斜め前から（正面すぎると影が消える）
  const cx = f.x + Math.sin(yaw) * dist, cz = f.z + Math.cos(yaw) * dist
  const cy = f.y + 1.15 + dist * 0.06 // 目線をやや上に置く（歩行の目線 up≈1.4 に近い高さ）
  return page.evaluate(([a, b, c, d, e, g]) => window.__town3dShotAt(a, b, c, d, e, g, 78), [cx, cy, cz, f.x, f.y + 1.0, f.z])
}

say('\n■ #3 歩行目線での人物の見え方（エリア別・近接3m／中距離12m）')
const found = []
for (const a of AREAS) {
  await page.evaluate(() => { window.__town3dWindow(true) }).catch(() => {})
  await page.evaluate(() => { window.__town3dLean(true); window.__town3dFly(true) }).catch(() => {})
  await page.waitForTimeout(600)
  await page.evaluate(([x, y, z]) => window.__town3dFlyPose(x, y, z, 0, -0.2), [a.x, a.alt, a.z + 40])
  await page.waitForTimeout(2500) // 距離カリングのフェードが解けるのを待つ
  const cull = await page.evaluate(() => (window.__town3dEraCull ? window.__town3dEraCull() : null))
  const figs = await nearFigs(a.x, a.z, a.key === 'cloud' ? 400 : 150, a.key === 'cloud' ? 45 : undefined)
  const visible = figs.filter((f) => f.vis)
  say(`\n   ${a.label}（${a.x}, ${a.z}）: 半径内の人物 ${figs.length}体／うち今見えている ${visible.length}体   時代群の捕捉=${JSON.stringify(cull)}`)
  const pick = visible[0] || figs[0]
  if (!pick) { say('   × この地点の近くに人物が居ない'); found.push({ ...a, ok: false }); continue }
  say(`     撮影対象: ${pick.層} at (${pick.x}, ${pick.y}, ${pick.z})  中心からの距離 ${pick.d}m`)
  save(`近接_${a.key}.png`, await shotFig(pick, 3))
  save(`中距離_${a.key}.png`, await shotFig(pick, 12))
  const tiers = {}
  for (const f of figs) tiers[f.層] = (tiers[f.層] || 0) + 1
  say(`     半径内の層の内訳: ${JSON.stringify(tiers)}`)
  found.push({ ...a, ok: true, 層: pick.層, 半径内: figs.length, 見えている: visible.length })
}

// cityWalker / makePeep も世界内で1枚ずつ（#2の3層目・4層目）
say('\n■ #2 の続き: 隔離フックの無い層は世界内で接写（cityWalker / makePeep）')
for (const [key, label, area] of [['03_cityWalker', 'cityWalker', AREAS[0]], ['04_makePeep', 'makePeep', AREAS[3]]]) {
  await page.evaluate(([x, y, z]) => window.__town3dFlyPose(x, y, z, 0, -0.2), [area.x, area.alt, area.z + 40])
  await page.waitForTimeout(2200)
  const figs = await nearFigs(area.x, area.z, 200)
  const t = figs.filter((f) => f.層 === label && f.vis)[0] || figs.filter((f) => f.層 === label)[0]
  if (!t) { say(`   × ${label} が見つからない`); continue }
  say(`   ${label} at (${t.x}, ${t.y}, ${t.z}) 見えている=${t.vis}`)
  save(`${key}_世界内.png`, await shotFig(t, 2.4))
}

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/figshots.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/figshots.txt')
await browser.close()
