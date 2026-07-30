// 街の賑わいの計測(2026-07-30)。#10=エリアごとの人口密度と空白域／#11=各エリアを中心・中間・外縁の3地点で歩行目線から撮る／
// #12=時代ごとの描き分けを同一構図で比べる。
// アプリは変更しない。人物の位置はシーングラフから直に読み、撮影は __town3dShotAt。
// 近接の被写体が壁に隠れないよう、__town3dClear で「最も開けた方位」を選んでカメラを置く。
// 使い方: PORT=4890 node scripts/qa-liveliness.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30/areas'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }
const save = (name, d) => { if (!d) { say(`   × ${name}: 撮影できず`); return } fs.writeFileSync(`${outDir}/${name}`, Buffer.from(d.split(',')[1], 'base64')); say(`   ○ ${name} ${(fs.statSync(`${outDir}/${name}`).size / 1024).toFixed(0)}KB`) }

// 設計上の広さは area-expansion の記録どおり
const AREAS = [
  { key: 'edo', label: '江戸', x: 640, z: -46, R: 124, alt: 46 },
  { key: 'taisho', label: '大正', x: -640, z: -30, R: 112, alt: 46 },
  { key: 'sengoku', label: '戦国', x: 140, z: -640, R: 54, alt: 46 },
  { key: 'home', label: '現代home', x: 0, z: -30, R: 120, alt: 34 },
  { key: 'cloud', label: '雲海', x: 56, z: -312, R: 60, alt: 104 },
]

const browser = await chromium.launch()

const openScene = async (page, id) => {
  await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('.gate').click().catch(() => {})
  await page.waitForTimeout(600)
  await page.evaluate((s) => window.__applyScene(s), id)
  await page.waitForTimeout(6500)
  const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
  await page.evaluate(async (list) => {
    for (const u of list) {
      try { const m = await import(/* @vite-ignore */ u); if (!m || !m.Object3D) continue
        const P = m.Object3D.prototype
        if (!P.__lvProbe) { const orig = P.updateMatrixWorld
          P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent; if (r.isScene) globalThis.__lvScene = r; return orig.call(this, f) }
          P.__lvProbe = true }
        return u } catch { /* 次 */ }
    }
  }, urls)
  await page.waitForTimeout(1000)
}

const ctx = await browser.newContext({ viewport: { width: 852, height: 393 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await openScene(page, 'kitaterao-window-3d')

const allFigs = () => page.evaluate(() => {
  const s = globalThis.__lvScene
  if (!s) return []
  const out = []
  s.traverse((o) => {
    const u = o.userData || {}
    let t = null
    if (u.headG) t = 'makeResident'
    else if (u.armAmp !== undefined) t = 'makePeep'
    else if (u.cswAmp !== undefined) t = 'mkCrowdPerson'
    else if (u.walker === true && u.legs) t = 'cityWalker'
    if (!t) return
    o.updateWorldMatrix(true, false)
    const e = o.matrixWorld.elements
    out.push({ t, x: +e[12].toFixed(1), y: +e[13].toFixed(1), z: +e[14].toFixed(1) })
  })
  return out
})

// ───────────────────────────────── #10 人口密度と空白域
say('■ #10 エリアごとの人口密度と空白域')
const figs = await allFigs()
say(`   全人物 ${figs.length}体（立体の街）`)
say('\n   エリア      設計半径  居る人数  人が居る最外縁  1万m²あたり  半径帯ごとの人数(30m刻み)')
const dens = []
for (const a of AREAS) {
  const inArea = figs.filter((f) => Math.hypot(f.x - a.x, f.z - a.z) <= a.R && (a.key === 'cloud' ? f.y > 45 : f.y < 45))
  const rs = inArea.map((f) => Math.hypot(f.x - a.x, f.z - a.z))
  const maxR = rs.length ? Math.max(...rs) : 0
  const bands = []
  for (let lo = 0; lo < a.R; lo += 30) bands.push(inArea.filter((f) => { const d = Math.hypot(f.x - a.x, f.z - a.z); return d >= lo && d < lo + 30 }).length)
  const d10k = inArea.length / (Math.PI * a.R * a.R / 10000)
  dens.push({ ...a, n: inArea.length, maxR, d10k })
  say(`   ${a.label.padEnd(10)} ${String(a.R).padStart(7)}m ${String(inArea.length).padStart(9)}人 ${maxR.toFixed(1).padStart(13)}m ${d10k.toFixed(1).padStart(11)}人 [${bands.join(', ')}]`)
}
say('\n   ── 半径帯ごとの「面積あたりの密度」（1万m²あたり何人）＝外へ行くほど薄くなるかを見る ──')
for (const a of AREAS) {
  const cells = []
  for (let lo = 0; lo < a.R; lo += 30) {
    const hi = Math.min(lo + 30, a.R)
    const n = figs.filter((f) => { const d = Math.hypot(f.x - a.x, f.z - a.z); return d >= lo && d < hi && (a.key === 'cloud' ? f.y > 45 : f.y < 45) }).length
    const area = Math.PI * (hi * hi - lo * lo) / 10000
    cells.push(`${lo}-${hi}m:${(n / area).toFixed(1)}`)
  }
  say(`   ${a.label.padEnd(10)} ${cells.join('  ')}`)
}

// ───────────────────────────────── #11 中心・中間・外縁の3地点
// 最も開けた方位を選び、その方向を見る（壁に貼りつかない構図）
const shotAtSpot = async (name, x, z, alt) => {
  await page.evaluate(([px, py, pz]) => window.__town3dFlyPose(px, py, pz, 0, -0.2), [x, alt, z])
  await page.waitForTimeout(2400) // 距離カリングのフェードが解けるのを待つ
  const g = await page.evaluate(([px, pz]) => window.__town3dGroundAt(px, pz), [x, z])
  const clear = await page.evaluate(([px, pz]) => window.__town3dClear(px, pz), [x, z])
  let best = 0
  for (let i = 1; i < clear.length; i++) if (clear[i] > clear[best]) best = i
  const yaw = best / 16 * 6.2832
  const cy = g + 1.7 // 歩行の目線の高さ（#4の実測 1.67〜1.73m）
  const tx = x + Math.sin(yaw) * 30, tz = z - Math.cos(yaw) * 30
  const d = await page.evaluate(([a, b, c, e, f, h]) => window.__town3dShotAt(a, b, c, e, f, h, 78), [x, cy, z, tx, cy - 2, tz])
  save(name, d)
  say(`      地面高 ${g.toFixed(1)}m / 最も開けた方位 ${(yaw * 180 / Math.PI).toFixed(0)}° に ${clear[best]}m`)
  return { g, clear: clear[best] }
}

say('\n■ #11 各エリアを中心・中間・外縁の3地点で歩行目線から撮る')
for (const a of AREAS) {
  say(`\n   ${a.label}（設計半径 ${a.R}m）`)
  for (const [tag, frac] of [['中心', 0], ['中間', 0.5], ['外縁', 0.85]]) {
    const ang = 0.9 // どのエリアも同じ方位で測る（比べられるように）
    const x = a.x + Math.sin(ang) * a.R * frac, z = a.z - Math.cos(ang) * a.R * frac
    say(`    ・${tag}（中心から ${(a.R * frac).toFixed(0)}m）`)
    await shotAtSpot(`${a.key}_${tag}.png`, x, z, a.alt)
    const near = figs.filter((f) => Math.hypot(f.x - x, f.z - z) < 25 && (a.key === 'cloud' ? f.y > 45 : f.y < 45)).length
    const nearest = figs.filter((f) => (a.key === 'cloud' ? f.y > 45 : f.y < 45)).reduce((b, f) => Math.min(b, Math.hypot(f.x - x, f.z - z)), 1e9)
    say(`      半径25m以内の人 ${near}人 ／ 最も近い人まで ${nearest.toFixed(1)}m`)
  }
}

// ───────────────────────────────── #12 時代の描き分けを同一構図で
say('\n■ #12 時代ごとの描き分けを同一構図で比べる（同じ画角・同じ距離・同じ高さ）')
const ERAS = [AREAS[0], AREAS[1], AREAS[2], AREAS[3]]
for (const a of ERAS) {
  // 目線: 中心から40m離れた地点から中心を見る（どの時代も同条件）
  const ex = a.x + 40, ez = a.z + 40
  await page.evaluate(([px, py, pz]) => window.__town3dFlyPose(px, py, pz, 0, -0.2), [ex, a.alt, ez])
  await page.waitForTimeout(2400)
  const g = await page.evaluate(([px, pz]) => window.__town3dGroundAt(px, pz), [ex, ez])
  save(`比較_目線_${a.key}.png`, await page.evaluate(([x, y, z, lx, ly, lz]) => window.__town3dShotAt(x, y, z, lx, ly, lz, 60), [ex, g + 1.7, ez, a.x, g + 1.0, a.z]))
  // 俯瞰: 中心の真上から斜めに（高さ70m・距離120m）
  save(`比較_俯瞰_${a.key}.png`, await page.evaluate(([x, y, z, lx, ly, lz]) => window.__town3dShotAt(x, y, z, lx, ly, lz, 50), [a.x + 85, 70, a.z + 85, a.x, 4, a.z]))
}

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/liveliness.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/liveliness.txt')
await browser.close()
