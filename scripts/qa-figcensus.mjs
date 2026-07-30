// 人物の全数調査(2026-07-30)。何人が・どの作りで・どこに居るかを層別×エリア別に数える。
// アプリ側は一切変更しない。three の Object3D.prototype を外から包んで根のSceneを捕まえ、userDataの鍵で層を判別する。
//   headG あり            → makeResident（顔・手足・髪までの高品質。時代住人/home住人/祭り/雲海）
//   armAmp あり           → makePeep    （現代homeの歩く人・佇む人）
//   cswAmp あり           → mkCrowdPerson（1メッシュに焼いた簡易版。遠景の群衆）
//   walker かつ legs あり → cityWalker  （脚が振れる旅人）
// 使い方: PORT=4890 node scripts/qa-figcensus.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30'
fs.mkdirSync(outDir, { recursive: true })

const log = []
const say = (s) => { console.log(s); log.push(s) }

// 数値の並びから代表値を出す
const stat = (a) => {
  if (!a.length) return { n: 0 }
  const s = [...a].sort((x, y) => x - y)
  return { n: s.length, 最小: +s[0].toFixed(1), 中央: +s[(s.length / 2) | 0].toFixed(1), 最大: +s[s.length - 1].toFixed(1) }
}

const SCENES = [
  { id: 'kitaterao-window-3d', label: '立体の街（現代home＋時代3エリア＋雲海）' },
  { id: 'shishigaya-window-3d', label: '谷戸（獅子ヶ谷）' },
]

const browser = await chromium.launch()

for (const sc of SCENES) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.locator('.gate').click().catch(() => {})
  await page.waitForTimeout(600)
  await page.evaluate((id) => window.__applyScene(id), sc.id)
  await page.waitForTimeout(6000)

  // three の Object3D.prototype を包んで根のSceneを捕まえる（描画のたびに updateMatrixWorld が呼ばれる）
  const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
  const patched = await page.evaluate(async (list) => {
    for (const u of list) {
      try {
        const m = await import(/* @vite-ignore */ u)
        if (!m || !m.Object3D) continue
        const P = m.Object3D.prototype
        if (!P.__figProbe) {
          const orig = P.updateMatrixWorld
          P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent; if (r.isScene) globalThis.__figScene = r; return orig.call(this, f) }
          P.__figProbe = true
        }
        return u
      } catch { /* 次の候補を試す */ }
    }
    return null
  }, urls)
  await page.waitForTimeout(1200)

  const data = await page.evaluate(() => {
    const s = globalThis.__figScene
    if (!s) return { ok: false }
    const EDO = { x: 640, z: -46, r: 124 }, SENGOKU = { x: 140, z: -640, r: 54 }, TAISHO = { x: -640, z: -30, r: 112 }
    const out = []
    let nodes = 0
    s.traverse((o) => {
      nodes++
      const u = o.userData || {}
      let 層 = null
      if (u.headG) 層 = 'makeResident'
      else if (u.armAmp !== undefined) 層 = 'makePeep'
      else if (u.cswAmp !== undefined) 層 = 'mkCrowdPerson'
      else if (u.walker === true && u.legs) 層 = 'cityWalker'
      if (!層) return
      const p = new (o.constructor.prototype.getWorldPosition ? Object : Object)() // 位置は行列から直接読む（Vector3を作らない）
      o.updateWorldMatrix(true, false)
      const e = o.matrixWorld.elements
      const x = e[12], y = e[13], z = e[14]
      // エリアの割り当て: 高い所は雲海、時代の中心に近ければその時代、それ以外はhome/谷戸
      let エリア = 'home/谷戸'
      const d = (c) => Math.hypot(x - c.x, z - c.z)
      if (y > 45) エリア = '雲海'
      else if (d(EDO) < 200) エリア = '江戸'
      else if (d(TAISHO) < 200) エリア = '大正'
      else if (d(SENGOKU) < 200) エリア = '戦国'
      const c = エリア === '江戸' ? EDO : エリア === '大正' ? TAISHO : エリア === '戦国' ? SENGOKU : { x: 0, z: 0 }
      let 見える = o.visible
      for (let q = o.parent; q; q = q.parent) if (!q.visible) { 見える = false; break }
      let メッシュ数 = 0
      o.traverse((k) => { if (k.isMesh || k.isPoints) メッシュ数++ })
      out.push({ 層, エリア, x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), r: +Math.hypot(x - c.x, z - c.z).toFixed(1), 見える, メッシュ数, 動く: u.walker === true || u.moving !== undefined || u.dir !== undefined })
      void p
    })
    return { ok: true, nodes, out }
  })

  say(`\n${'='.repeat(78)}\n■ ${sc.label}  [${sc.id}]`)
  say(`   threeモジュール: ${patched || '(捕まえられず)'}   走査ノード: ${data.ok ? data.nodes : '-'}`)
  if (!data.ok) { say('   × シーングラフを捕まえられなかった'); await ctx.close(); continue }

  const rows = data.out
  say(`   人物 合計: ${rows.length}体`)

  // 層 × エリア の人数表
  const 層一覧 = ['makeResident', 'makePeep', 'mkCrowdPerson', 'cityWalker']
  const エリア一覧 = [...new Set(rows.map((r) => r.エリア))]
  say('\n  ── 層 × エリア の人数 ──')
  say('  ' + '層'.padEnd(16) + エリア一覧.map((a) => a.padStart(10)).join('') + '     計')
  for (const t of 層一覧) {
    const cells = エリア一覧.map((a) => String(rows.filter((r) => r.層 === t && r.エリア === a).length).padStart(10))
    const sum = rows.filter((r) => r.層 === t).length
    say('  ' + t.padEnd(16) + cells.join('') + String(sum).padStart(8))
  }
  say('  ' + '計'.padEnd(16) + エリア一覧.map((a) => String(rows.filter((r) => r.エリア === a).length).padStart(10)).join('') + String(rows.length).padStart(8))

  // エリアごとの分布半径と半径帯ヒストグラム
  say('\n  ── エリアごとの中心からの距離（m）と半径帯の人数 ──')
  const bands = [[0, 30], [30, 60], [60, 90], [90, 120], [120, 1e9]]
  for (const a of エリア一覧) {
    const rs = rows.filter((r) => r.エリア === a)
    const st = stat(rs.map((r) => r.r))
    const hist = bands.map(([lo, hi]) => rs.filter((r) => r.r >= lo && r.r < hi).length)
    say(`   ${a.padEnd(8)} n=${String(st.n).padStart(3)}  最小${String(st.最小).padStart(6)} 中央${String(st.中央).padStart(6)} 最大${String(st.最大).padStart(6)}   帯[0-30:${hist[0]} 30-60:${hist[1]} 60-90:${hist[2]} 90-120:${hist[3]} 120+:${hist[4]}]`)
  }

  // 造形の重さ（層ごとのメッシュ数）＝近づいたときの作りの差
  say('\n  ── 層ごとの1体あたりメッシュ数（造形の細かさ）と可視状態 ──')
  for (const t of 層一覧) {
    const rs = rows.filter((r) => r.層 === t)
    if (!rs.length) { say(`   ${t.padEnd(16)} 0体`); continue }
    const st = stat(rs.map((r) => r.メッシュ数))
    say(`   ${t.padEnd(16)} ${String(rs.length).padStart(3)}体  メッシュ数 最小${st.最小} 中央${st.中央} 最大${st.最大}  いま見えている:${rs.filter((r) => r.見える).length}体`)
  }

  // 人と人の間隔（最も近い人までの距離）＝疎密の実感
  say('\n  ── 最も近い人までの距離（m・エリア別）──')
  for (const a of エリア一覧) {
    const rs = rows.filter((r) => r.エリア === a)
    if (rs.length < 2) { say(`   ${a.padEnd(8)} 1体以下`); continue }
    const nn = rs.map((r) => {
      let b = 1e9
      for (const q of rs) { if (q === r) continue; const d = Math.hypot(q.x - r.x, q.z - r.z); if (d < b) b = d }
      return b
    })
    const st = stat(nn)
    say(`   ${a.padEnd(8)} 最小${String(st.最小).padStart(6)} 中央${String(st.中央).padStart(6)} 最大${String(st.最大).padStart(6)}`)
  }

  // 外縁の無人ぶり（時代エリアは r112/r124 まで広げてある）
  say('\n  ── 時代エリアの外側に人が居るか（設計上の広さと、人が居る最外縁）──')
  for (const [a, R] of [['江戸', 124], ['大正', 112], ['戦国', 54]]) {
    const rs = rows.filter((r) => r.エリア === a)
    if (!rs.length) { say(`   ${a} : 人が1体も居ない`); continue }
    const max = Math.max(...rs.map((r) => r.r))
    say(`   ${a} : 設計半径 ${R}m / 人が居る最外縁 ${max.toFixed(1)}m → 外側 ${(R - max).toFixed(1)}m は無人（面積比で ${((1 - (max / R) ** 2) * 100).toFixed(0)}% が無人）`)
  }

  say(`\n   エラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
  fs.writeFileSync(`${outDir}/figcensus_${sc.id}.json`, JSON.stringify(rows, null, 1))
  await ctx.close()
}

fs.writeFileSync(`${outDir}/figcensus.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/figcensus.txt')
await browser.close()
