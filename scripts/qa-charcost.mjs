// キャラの性能コストを実測する(2026-07-31)。#9（1体あたりのコスト）／#10（状態別の占有率）／#11（品質を上げたときの予算線）。
// アプリ側は一切変更しない。既存フック __town3dDraw（実シーンを直接描いて本当の描画コール/三角形を返す）で測り、
// 「人物を全部消して測る → 戻して測る」の差分で、キャラが占めている量を厳密に取り出す（推定ではなく実測の引き算）。
// #11 は実行時にキャラのメッシュを複製して 1体あたりのメッシュ数を2〜4倍相当にし、増分を測る（測り終えたら必ず取り除く）。
// 使い方: PORT=4890 node scripts/qa-charcost.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-31'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }
const pad = (s, n) => String(s).padEnd(n, ' ')
const padn = (s, n) => String(s).padStart(n)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1200)
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(3500)
// 本物の情景メニューから「北寺尾の坂の街 → 立体の街」を選ぶ（UI状態も正しく進める）
await page.locator('.topbar .iconbtn', { hasText: '情景' }).first().click()
await page.waitForTimeout(1200)
{ const place = page.locator('.gallery button', { hasText: '北寺尾の坂の街' }).first()
  if (await place.count()) { await place.click(); await page.waitForTimeout(1200) }
  const scene = page.locator('.gallery button:not(.gallery__back)').first()
  if (await scene.count()) await scene.click()
  await page.waitForTimeout(11000) }

const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
await page.evaluate(async (list) => {
  for (const u of list) { try { const m = await import(/* @vite-ignore */ u); if (m && m.Object3D) { globalThis.__T = m; const P = m.Object3D.prototype; if (!P.__figProbe) { const o = P.updateMatrixWorld; P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent; if (r.isScene) globalThis.__figScene = r; return o.call(this, f) }; P.__figProbe = true } return } } catch { /* 次 */ } }
}, urls)
await page.waitForTimeout(1500)
say('■ #9/#10/#11 キャラの性能コストの実測')

// 計測ハーネス
await page.evaluate(() => {
  const T = globalThis.__T
  const tierOf = (u) => {
    if (!u) return null
    if (u.tailG || u.kind) return null // 四足獣は人物でない
    if (u.headG) return 'makeResident'
    if (u.armAmp !== undefined) return 'makePeep'
    if (u.cswAmp !== undefined) return 'mkCrowdPerson'
    if (u.walker === true && u.legs) return 'cityWalker'
    if (u.spr) return '立ち絵(2D)'
    return null
  }
  globalThis.__wfFigs = () => {
    const sc = globalThis.__figScene, out = []
    const seen = new Set()
    sc.traverse((o) => { const t = tierOf(o.userData); if (t && !seen.has(o)) { seen.add(o); out.push({ o, tier: t }) } })
    return out
  }
  const triOf = (g) => { if (!g) return 0; const i = g.index; return i ? i.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0) }
  globalThis.__wfCost = () => {
    const rows = {}
    for (const { o, tier } of globalThis.__wfFigs()) {
      const r = rows[tier] || (rows[tier] = { 体数: 0, メッシュ: 0, 三角形: 0, 材質: new Set(), ジオメトリ: new Set() })
      r.体数++
      o.traverse((m) => { if (!m.isMesh) return; r.メッシュ++; r.三角形 += triOf(m.geometry); r.ジオメトリ.add(m.geometry.uuid); if (Array.isArray(m.material)) m.material.forEach((x) => r.材質.add(x.uuid)); else if (m.material) r.材質.add(m.material.uuid) })
    }
    const out = {}
    for (const k of Object.keys(rows)) { const r = rows[k]
      out[k] = { 体数: r.体数, 総メッシュ: r.メッシュ, '1体あたりメッシュ': +(r.メッシュ / r.体数).toFixed(1), 総三角形: Math.round(r.三角形), '1体あたり三角形': Math.round(r.三角形 / r.体数), 共有材質の種類: r.材質.size, 共有ジオメトリの種類: r.ジオメトリ.size }
    }
    return out
  }
  // 人物ぶんの描画コールを引き算で厳密に取り出す。
  // 【重要】visible=false はアプリの距離カリングが毎フレーム書き戻すので、フレームをまたぐと効かない。
  // ここでは「隠す → 測る → 戻す」を1つの同期処理の中で完結させる（間にフレームが入らない＝アプリに気づかれない）。
  globalThis.__wfSubtract = () => {
    const one = () => { const d = window.__town3dDraw(); return d ? { calls: d.calls, tris: d.triangles !== undefined ? d.triangles : d.tris } : null }
    const all = one()
    const figs = globalThis.__wfFigs()
    const saved = figs.map(({ o }) => [o, o.visible])
    for (const [o] of saved) o.visible = false
    const none = one()
    for (const [o, v] of saved) o.visible = v
    const back = one()
    return { all, none, back, 隠した数: saved.length }
  }
  // 実際に「いま描かれている」人物の数（親までさかのぼって可視・不透明度>0.01）
  globalThis.__wfVisibleFigs = () => {
    const out = {}
    for (const { o, tier } of globalThis.__wfFigs()) {
      let vis = true
      for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break }
      if (vis) { let anyOpaque = false; o.traverse((m) => { if (m.isMesh && m.material && (m.material.opacity === undefined || m.material.opacity > 0.01)) anyOpaque = true }); vis = anyOpaque }
      out[tier] = out[tier] || { 全体: 0, 描かれている: 0 }
      out[tier].全体++; if (vis) out[tier].描かれている++
    }
    return out
  }
  // #11: 1体あたりのメッシュ数を k 倍相当にする（元のメッシュを複製して同じ場所に足す）
  globalThis.__wfInflate = (k, onlyTier) => {
    const added = []
    for (const { o, tier } of globalThis.__wfFigs()) {
      if (onlyTier && tier !== onlyTier) continue
      const src = []
      o.traverse((m) => { if (m.isMesh) src.push(m) })
      for (let i = 1; i < k; i++) for (const m of src) { const c = new T.Mesh(m.geometry, m.material); c.position.copy(m.position); c.quaternion.copy(m.quaternion); c.scale.copy(m.scale); c.renderOrder = m.renderOrder; c.castShadow = false; c.receiveShadow = false; m.parent.add(c); added.push(c) }
    }
    globalThis.__wfAdded = (globalThis.__wfAdded || []).concat(added)
    return added.length
  }
  // 層を指定して「1体につき n 個のメッシュを足す」（造形を足したときの実費を層ごとに測る）
  globalThis.__wfAddN = (n, onlyTier) => {
    const added = []
    for (const { o, tier } of globalThis.__wfFigs()) {
      if (onlyTier && tier !== onlyTier) continue
      let src = null
      o.traverse((m) => { if (!src && m.isMesh) src = m })
      if (!src) continue
      for (let i = 0; i < n; i++) { const c = new T.Mesh(src.geometry, src.material); c.position.copy(src.position); c.quaternion.copy(src.quaternion); c.scale.copy(src.scale); c.castShadow = false; c.receiveShadow = false; src.parent.add(c); added.push(c) }
    }
    globalThis.__wfAdded = (globalThis.__wfAdded || []).concat(added)
    return added.length
  }
  globalThis.__wfDeflate = () => { const a = globalThis.__wfAdded || []; for (const c of a) if (c.parent) c.parent.remove(c); globalThis.__wfAdded = []; return a.length }
})

// 描画コール/三角形を数フレーム平均で取る
const draw = async () => await page.evaluate(async () => {
  const one = () => { const d = window.__town3dDraw(); return d ? { calls: d.calls, tris: d.triangles !== undefined ? d.triangles : d.tris, programs: d.programs } : null }
  const a = []
  for (let i = 0; i < 4; i++) { a.push(one()); await new Promise((r) => requestAnimationFrame(r)) }
  const ok = a.filter(Boolean); if (!ok.length) return null
  const med = (f) => { const s = ok.map(f).sort((x, y) => x - y); return s[(s.length / 2) | 0] }
  return { calls: med((x) => x.calls), tris: med((x) => x.tris), programs: ok[0].programs }
})
// フレーム間隔（この開発機の絶対値は実機と比較できない。同一セッション内の増分だけを見る）
const frameMs = async (n = 50) => await page.evaluate(async (N) => {
  const t = []
  let prev = performance.now()
  for (let i = 0; i < N; i++) { await new Promise((r) => requestAnimationFrame(r)); const now = performance.now(); t.push(now - prev); prev = now }
  const s = t.slice(5).sort((a, b) => a - b)
  return { 中央ms: +s[(s.length / 2) | 0].toFixed(1), 最小ms: +s[0].toFixed(1), 最大ms: +s[s.length - 1].toFixed(1) }
}, n)

say('\n── #9 キャラ1体あたりの実コスト（層別。街に居る全個体から算出）')
const cost = await page.evaluate(() => globalThis.__wfCost())
say(`   ${pad('層', 16)}${padn('体数', 5)}${padn('総メッシュ', 10)}${padn('1体メッシュ', 12)}${padn('総三角形', 10)}${padn('1体三角形', 11)}${padn('材質の種類', 11)}${padn('形の種類', 10)}`)
for (const k of Object.keys(cost)) { const c = cost[k]; say(`   ${pad(k, 16)}${padn(c.体数, 5)}${padn(c.総メッシュ, 10)}${padn(c['1体あたりメッシュ'], 12)}${padn(c.総三角形, 10)}${padn(c['1体あたり三角形'], 11)}${padn(c.共有材質の種類, 11)}${padn(c.共有ジオメトリの種類, 10)}`) }
fs.writeFileSync(`${outDir}/charcost.json`, JSON.stringify(cost, null, 1))

// 状態を進めるためのボタン押し
const stage = async (times, waits) => { for (let i = 0; i < times; i++) { await page.evaluate(() => { const b = document.querySelector('.iconbtn--stage'); if (b) b.click() }); await page.waitForTimeout(waits[i] || 4500) } }

say('\n── #10 状態別: キャラが描画コールと三角形の何%を占めるか（人物を全部消して測る引き算）')
say(`   ${pad('状態', 14)}${padn('総コール', 9)}${padn('人無しコール', 13)}${padn('キャラ分', 9)}${padn('占有率', 8)}${padn('総三角形', 10)}${padn('キャラ三角形', 13)}${padn('占有率', 8)}`)
const STATES = [
  { name: '窓辺（眺める）', press: 0 },
  { name: '窓から乗り出す', press: 1, waits: [4500] },
  { name: '低空を飛ぶ', press: 2, waits: [4500, 7000] },
  { name: '地上を歩く', press: 1, waits: [10000] },
]
const stateRows = []
for (const st of STATES) {
  if (st.press) await stage(st.press, st.waits || [])
  await page.mouse.move(196, 500); await page.waitForTimeout(1500)
  const sub = await page.evaluate(() => globalThis.__wfSubtract())
  const vis = await page.evaluate(() => globalThis.__wfVisibleFigs())
  if (!sub || !sub.all || !sub.none) { say(`   ${st.name}: 測れず`); continue }
  const all = sub.all, none = sub.none, hidden = sub.隠した数
  const dc = all.calls - none.calls, dt = all.tris - none.tris
  if (Math.abs(sub.back.calls - all.calls) > 4) say(`      （注意: 戻した後のコール ${sub.back.calls} が元 ${all.calls} と一致していない）`)
  stateRows.push({ 状態: st.name, 総コール: all.calls, 人無し: none.calls, キャラ分: dc, 占有率: +(dc / all.calls * 100).toFixed(1), 総三角形: all.tris, キャラ三角形: dt, 三角占有率: +(dt / all.tris * 100).toFixed(1), 見えている: vis })
  say(`   ${pad(st.name, 14)}${padn(all.calls, 9)}${padn(none.calls, 13)}${padn(dc, 9)}${padn(`${(dc / all.calls * 100).toFixed(1)}%`, 8)}${padn(all.tris, 10)}${padn(dt, 13)}${padn(`${(dt / all.tris * 100).toFixed(1)}%`, 8)}`)
  say(`      隠した人物: ${hidden}体 ／ 距離カリングを抜けて実際に描かれている: ${Object.keys(vis).map((k) => `${k} ${vis[k].描かれている}/${vis[k].全体}`).join(' ／ ')}`)
}

say('\n── #11 品質を上げたときの予算線（実行時にメッシュを複製して1体あたりを k 倍相当にする）')
say('   ※ 増える分はすべて「材質もジオメトリも共有した追加メッシュ」＝描画コールだけが純粋に増える条件。')
say('   ※ フレーム間隔はこの開発機の値。実機の絶対値としては使えない。同一セッション内の増分だけを見る。')
say(`   ${pad('倍率', 8)}${padn('追加メッシュ', 13)}${padn('総コール', 9)}${padn('現行比', 8)}${padn('総三角形', 10)}${padn('フレーム中央ms', 15)}`)
const base = await draw()
const baseMs = await frameMs()
say(`   ${pad('1倍(現行)', 8)}${padn(0, 13)}${padn(base.calls, 9)}${padn('—', 8)}${padn(base.tris, 10)}${padn(baseMs.中央ms, 15)}`)
const infl = []
for (const k of [2, 3, 4]) {
  await page.evaluate(() => globalThis.__wfDeflate())
  const added = await page.evaluate((v) => globalThis.__wfInflate(v), k)
  await page.waitForTimeout(900)
  const d = await draw()
  const ms = await frameMs()
  infl.push({ 倍率: k, 追加: added, calls: d.calls, tris: d.tris, ms: ms.中央ms })
  say(`   ${pad(k + '倍', 8)}${padn(added, 13)}${padn(d.calls, 9)}${padn(`+${d.calls - base.calls}`, 8)}${padn(d.tris, 10)}${padn(ms.中央ms, 15)}`)
}
const removed = await page.evaluate(() => globalThis.__wfDeflate())
await page.waitForTimeout(600)
const back = await draw()
say(`   複製を取り除いた: ${removed}メッシュ → 総コール ${back.calls}（現行 ${base.calls} に戻ったか: ${Math.abs(back.calls - base.calls) <= 12 ? 'はい' : 'いいえ'}）`)

say('\n── #11-b 層ごとの実費: その層だけ「1体につき +6メッシュ」足したときの描画コール増')
say('   ※ どの層まで作り直すかを決めるための核心の数字。足す数に比例するので、1メッシュあたりの単価も併記する。')
say(`   ${pad('層', 16)}${padn('体数', 5)}${padn('追加メッシュ', 13)}${padn('コール増', 10)}${padn('1メッシュ単価', 14)}${padn('総コール', 9)}`)
const perTier = []
for (const t of ['makeResident', 'makePeep', 'mkCrowdPerson', 'cityWalker', '立ち絵(2D)']) {
  await page.evaluate(() => globalThis.__wfDeflate())
  await page.waitForTimeout(500)
  const b0 = await draw()
  const added = await page.evaluate((tt) => globalThis.__wfAddN(6, tt), t)
  await page.waitForTimeout(800)
  const d = await draw()
  const inc = d.calls - b0.calls
  const n体 = cost[t] ? cost[t].体数 : 0
  perTier.push({ 層: t, 体数: n体, 追加: added, コール増: inc, 単価: n体 ? +(inc / 6).toFixed(1) : 0 })
  say(`   ${pad(t, 16)}${padn(n体, 5)}${padn(added, 13)}${padn(`+${inc}`, 10)}${padn(`+${(inc / 6).toFixed(1)}コール`, 14)}${padn(d.calls, 9)}`)
}
await page.evaluate(() => globalThis.__wfDeflate())
await page.waitForTimeout(600)
const back2 = await draw()
say(`   すべて取り除いた → 総コール ${back2.calls}（現行 ${base.calls} に戻ったか: ${Math.abs(back2.calls - base.calls) <= 14 ? 'はい' : 'いいえ'}）`)

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/charcost.txt`, log.join('\n'))
fs.writeFileSync(`${outDir}/charcost_states.json`, JSON.stringify({ 状態: stateRows, 予算線: { 現行: { calls: base.calls, tris: base.tris, ms: baseMs }, 倍率: infl, 層ごと: perTier } }, null, 1))
console.log('\nWROTE ' + outDir + '/charcost.txt')
await browser.close()
