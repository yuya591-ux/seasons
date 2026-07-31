// 時代ごとの「配役」を全数集計する(2026-07-31)。#4（衣装・髪型・帽子・小物の実出現数）と #5（脚と手が無い個体の特定）。
// userData に衣装名は残らないので、three が保持する geometry.parameters（半径・高さ・分割数）で
// 帽子・髪型・小物・防具を1つずつ照合して個体を同定する。数値は town3dViewer.js の実装から直接取った。
// アプリ側は一切変更しない。
// 使い方: PORT=4890 node scripts/qa-charcast.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-31'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(8000)

const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
await page.evaluate(async (list) => {
  for (const u of list) { try { const m = await import(/* @vite-ignore */ u); if (m && m.Object3D) { globalThis.__T = m; const P = m.Object3D.prototype; if (!P.__figProbe) { const o = P.updateMatrixWorld; P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent; if (r.isScene) globalThis.__figScene = r; return o.call(this, f) }; P.__figProbe = true } return } } catch { /* 次 */ } }
}, urls)
say('■ #4/#5 時代ごとの配役の全数集計と、脚・手が無い個体の特定')
await page.waitForTimeout(1500)

const data = await page.evaluate(() => {
  const T = globalThis.__T, sc = globalThis.__figScene
  if (!sc) return { err: 'sceneを捕まえられなかった' }
  sc.updateMatrixWorld(true)
  const AREA = [{ name: '江戸', x: 640, z: -46, r: 200 }, { name: '大正', x: -640, z: -30, r: 190 }, { name: '戦国', x: 140, z: -640, r: 120 }]
  const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 0.003 : e)
  // town3dViewer.js の実装から取った寸法。CY(半径上,半径下,高さ,分割) / SP(半径,横分割,縦分割) / BX(幅,高さ,奥行)
  const MARK = (o) => {
    const g = o.geometry; if (!g || !g.parameters) return null
    const p = g.parameters, t = g.type
    if (t === 'CylinderGeometry') {
      if (near(p.radiusTop, 0.035) && near(p.radiusBottom, 0.28)) return '笠'                    // 6856行
      if (near(p.radiusTop, 0.045) && near(p.radiusBottom, 0.24)) return '陣笠'                  // 6857行
      if (near(p.radiusTop, 0.155) && near(p.radiusBottom, 0.155) && near(p.height, 0.018)) return '中折れ帽' // 6858行
      if (near(p.radiusTop, 0.026) && near(p.radiusBottom, 0.032) && near(p.height, 0.07)) return '髷'        // 6848行
      if (near(p.radiusTop, 0.013) && near(p.height, 0.56)) return '刀'                          // 6861行
      if (near(p.radiusTop, 0.013) && near(p.height, 0.86)) return '杖'                          // 6864行
      if (near(p.radiusTop, 0.018) && near(p.height, 1.9)) return '槍'                           // 6862行
      if (near(p.radiusTop, 0.148) && near(p.radiusBottom, 0.142)) return '帯(着物)'             // 6800行
      if (near(p.radiusTop, 0.15) && near(p.radiusBottom, 0.205)) return '帯(袴)'                // 6809行
      if (near(p.radiusTop, 0.124) && near(p.radiusBottom, 0.124) && near(p.height, 0.05)) return 'ウエスト(ワンピース)' // 6815行
    } else if (t === 'SphereGeometry') {
      if (near(p.radius, 0.052) && p.widthSegments === 14 && p.heightSegments === 12) return 'ボブの横髪'  // 6851行
      if (near(p.radius, 0.14) && p.widthSegments === 12 && p.heightSegments === 10) return '風呂敷'       // 6863行
      if (near(p.radius, 0.078) && p.widthSegments === 12 && p.heightSegments === 10) return '肩の防具'    // 6805行
      if (near(p.radius, 0.04) && p.widthSegments === 12 && p.heightSegments === 12) return '手'           // 6792行
      if (near(p.radius, 0.057)) return '着物の足(潰した球)'                                              // 6802/6810行
    } else if (t === 'BoxGeometry') {
      if (near(p.width, 0.17) && near(p.height, 0.022)) return '学生帽のつば'   // 6859行
      if (near(p.width, 0.17) && near(p.height, 0.2)) return '鞄'              // 6867行
      if (near(p.width, 0.024) && near(p.height, 0.32)) return '肩紐'          // 6821行
      if (near(p.width, 0.04) && near(p.height, 0.3)) return 'ネクタイ'        // 6827行
    }
    return null
  }
  const out = []
  const seen = new Set()
  sc.traverse((o) => {
    const u = o.userData
    if (!u || !u.headG || u.tailG || u.kind || seen.has(o)) return // 四足獣は除く
    seen.add(o)
    const wp = new T.Vector3(); o.getWorldPosition(wp)
    let area = '現代home'
    for (const a of AREA) { if (Math.hypot(wp.x - a.x, wp.z - a.z) < a.r) area = a.name }
    if (area === '現代home' && wp.y > 60) area = '雲海'
    if (area === '現代home' && Math.abs(wp.y - 0) > 0 && o.parent && o.parent !== sc && o.parent.type === 'Group' && o.parent.parent && o.parent.parent !== sc) area = '現代home' // 祭りの踊り手も home に含める
    const marks = {}
    o.traverse((m) => { if (!m.isMesh) return; const k = MARK(m); if (k) marks[k] = (marks[k] || 0) + 1 })
    // 手＝腕グループの中に SphereGeometry があるか（着物の袖は loft だけで手が無い）
    let hands = 0
    for (const a of (u.arms || [])) a.traverse((m) => { if (m.isMesh && m.geometry && m.geometry.type === 'SphereGeometry') hands++ })
    // 衣装の同定（帯・ウエスト・肩紐・ネクタイ・肩の防具＝各分岐に固有の部品で決まる）
    let outfit = '不明'
    const legs = u.legs ? u.legs.length : 0
    if (marks['肩の防具']) outfit = '甲冑(armor)'
    else if (marks['帯(袴)']) outfit = '袴(hakama)'
    else if (marks['帯(着物)']) outfit = '着物(kimono)'
    else if (marks['ウエスト(ワンピース)']) outfit = 'ワンピース(dress)'
    else if (marks['肩紐']) outfit = 'ブラウス(blouse)'
    else if (marks['ネクタイ']) outfit = '背広(suit)'
    else if (legs === 2) outfit = '普段着(modern)'
    let hat = 'なし'
    if (marks['笠']) hat = '笠'; else if (marks['陣笠']) hat = '陣笠'; else if (marks['中折れ帽']) hat = '中折れ帽'; else if (marks['学生帽のつば']) hat = '学生帽'
    let hair = 'その他'
    if (marks['髷']) hair = '髷'; else if (marks['ボブの横髪']) hair = 'ボブ'; else if (hat !== 'なし') hair = '（帽子の下）'
    let prop = 'なし'
    if (marks['刀']) prop = '刀'; else if (marks['槍']) prop = '槍'; else if (marks['杖']) prop = '杖'; else if (marks['風呂敷']) prop = '風呂敷'; else if (marks['鞄']) prop = '鞄'
    out.push({ エリア: area, 衣装: outfit, 髪型: hair, 帽子: hat, 小物: prop, 脚: legs, 手: hands, 頭の局所y: +u.headG.position.y.toFixed(2) })
  })
  // 参考: 他の層の脚・手の作り
  const others = { makePeep: 0, mkCrowdPerson: 0, cityWalker: 0 }
  sc.traverse((o) => { const u = o.userData; if (!u) return; if (u.armAmp !== undefined) others.makePeep++; else if (u.cswAmp !== undefined) others.mkCrowdPerson++; else if (u.walker === true && u.legs) others.cityWalker++ })
  return { 一覧: out, 他の層: others }
})

if (data.err) { say(`   ${data.err}`); process.exit(1) }
const all = data.一覧
fs.writeFileSync(`${outDir}/charcast.json`, JSON.stringify(all, null, 1))
const AREAS = ['江戸', '大正', '戦国', '現代home', '雲海']
const pad = (s, n) => String(s).padEnd(n, ' ')
const padn = (s, n) => String(s).padStart(n)

say(`\n── #4 エリアごとの配役（高品質な住人 makeResident ${all.length}体の全数。衣装＋髪型＋帽子＋小物の組み合わせ）`)
for (const a of AREAS) {
  const g = all.filter((r) => r.エリア === a)
  if (!g.length) continue
  const key = (r) => `${r.衣装}／${r.髪型}／帽子:${r.帽子}／小物:${r.小物}`
  const h = {}
  for (const r of g) h[key(r)] = (h[key(r)] || 0) + 1
  say(`   ● ${a}（${g.length}体）`)
  for (const k of Object.keys(h).sort((x, y) => h[y] - h[x])) say(`      ${padn(h[k], 3)}体  ${k}`)
}

say(`\n── #4 全エリア合計: 衣装の内訳`)
{ const h = {}; for (const r of all) h[r.衣装] = (h[r.衣装] || 0) + 1
  for (const k of Object.keys(h).sort((x, y) => h[y] - h[x])) say(`   ${pad(k, 22)}${padn(h[k], 4)}体`) }
say(`\n── #4 全エリア合計: 髪型・帽子・小物の内訳`)
for (const f of ['髪型', '帽子', '小物']) {
  const h = {}; for (const r of all) h[r[f]] = (h[r[f]] || 0) + 1
  say(`   ${f}: ${Object.keys(h).sort((x, y) => h[y] - h[x]).map((k) => `${k} ${h[k]}体`).join(' / ')}`)
}

say(`\n── #5 脚と手が無い個体（makeResident）`)
say(`   ${pad('エリア', 10)}${padn('人数', 5)}${padn('脚が振れない', 13)}${padn('手が無い', 11)}${padn('脚も手も無い', 13)}`)
for (const a of AREAS) {
  const g = all.filter((r) => r.エリア === a); if (!g.length) continue
  const nl = g.filter((r) => r.脚 === 0).length, nh = g.filter((r) => r.手 === 0).length, nb = g.filter((r) => r.脚 === 0 && r.手 === 0).length
  say(`   ${pad(a, 10)}${padn(g.length, 5)}${padn(`${nl}体 (${Math.round(nl / g.length * 100)}%)`, 13)}${padn(`${nh}体 (${Math.round(nh / g.length * 100)}%)`, 11)}${padn(`${nb}体 (${Math.round(nb / g.length * 100)}%)`, 13)}`)
}
{ const nl = all.filter((r) => r.脚 === 0).length, nh = all.filter((r) => r.手 === 0).length, nb = all.filter((r) => r.脚 === 0 && r.手 === 0).length
  say(`   ${pad('合計', 10)}${padn(all.length, 5)}${padn(`${nl}体 (${Math.round(nl / all.length * 100)}%)`, 13)}${padn(`${nh}体 (${Math.round(nh / all.length * 100)}%)`, 11)}${padn(`${nb}体 (${Math.round(nb / all.length * 100)}%)`, 13)}`) }

say(`\n── #5 衣装ごとの脚・手`)
say(`   ${pad('衣装', 22)}${padn('人数', 5)}${padn('脚', 5)}${padn('手', 5)}`)
{ const h = {}
  for (const r of all) { const k = r.衣装; if (!h[k]) h[k] = { n: 0, 脚: new Set(), 手: new Set() }; h[k].n++; h[k].脚.add(r.脚); h[k].手.add(r.手) }
  for (const k of Object.keys(h).sort((x, y) => h[y].n - h[x].n)) say(`   ${pad(k, 22)}${padn(h[k].n, 5)}${padn([...h[k].脚].join('/'), 5)}${padn([...h[k].手].join('/'), 5)}`) }

say(`\n── 参考: ほかの層の作り（実装を読んで確認済み）`)
say(`   makePeep ${data.他の層.makePeep}体      : 脚2本・手あり（袖と手を1メッシュに焼き込み。6580行）`)
say(`   mkCrowdPerson ${data.他の層.mkCrowdPerson}体 : 脚は胴と一体で振れない（1メッシュに焼き込み。1476行）・手あり`)
say(`   cityWalker ${data.他の層.cityWalker}体    : 脚2本が股支点で振れる・手あり（1521行）`)

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/charcast.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/charcast.txt')
await browser.close()
