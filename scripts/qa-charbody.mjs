// 街に実際に立っている人物の体格を全数実測する(2026-07-31)。#3。
// 設計値（コードに書かれた係数）ではなく、ワールド行列を掛けたあとの実寸を測る。
// アプリ側は一切変更しない。three の Object3D.prototype を包んで根の Scene を捕まえる。
//   身長 ＝ 接地影の板を除いたメッシュの外接箱の高さ
//   肩幅 ＝ userData.arms の左右の腕の付け根の距離（あるものだけ）
//   頭身 ＝ 身長 ÷ 頭部の高さ（userData.headG のワールド座標から算出。あるものだけ）
// 使い方: PORT=4890 node scripts/qa-charbody.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-31'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }

const stat = (a, d = 3) => {
  if (!a.length) return { n: 0 }
  const s = [...a].sort((x, y) => x - y)
  const avg = s.reduce((p, c) => p + c, 0) / s.length
  const sd = Math.sqrt(s.reduce((p, c) => p + (c - avg) ** 2, 0) / s.length)
  return { n: s.length, 最小: +s[0].toFixed(d), 中央: +s[(s.length / 2) | 0].toFixed(d), 最大: +s[s.length - 1].toFixed(d), 平均: +avg.toFixed(d), ばらつき率: +(sd / avg).toFixed(4) }
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
await page.waitForTimeout(8000)

const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
const threeUrl = await page.evaluate(async (list) => {
  for (const u of list) { try { const m = await import(/* @vite-ignore */ u); if (m && m.Object3D) { globalThis.__T = m; const P = m.Object3D.prototype; if (!P.__figProbe) { const o = P.updateMatrixWorld; P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent; if (r.isScene) globalThis.__figScene = r; return o.call(this, f) }; P.__figProbe = true } return u } } catch { /* 次 */ } }
  return null
}, urls)
say(`■ #3 街に立っている人物の体格を全数実測`)
say(`   three の実URL: ${threeUrl}`)
await page.waitForTimeout(1500)

const data = await page.evaluate(() => {
  const T = globalThis.__T, sc = globalThis.__figScene
  if (!sc) return { err: 'sceneを捕まえられなかった' }
  sc.updateMatrixWorld(true)
  const AREA = [
    { name: '江戸', x: 640, z: -46, r: 200 },
    { name: '大正', x: -640, z: -30, r: 190 },
    { name: '戦国', x: 140, z: -640, r: 120 },
  ]
  // 層の判別。mkQuad（犬猫馬）も userData.headG を持つので tailG / kind で先に除く（前回検収はここを取り違えていた）
  const tierOf = (u) => {
    if (!u) return null
    if (u.tailG || u.kind) return '四足獣(mkQuad)'
    if (u.headG) return 'makeResident'
    if (u.armAmp !== undefined) return 'makePeep'
    if (u.cswAmp !== undefined) return 'mkCrowdPerson'
    if (u.walker === true && u.legs) return 'cityWalker'
    return null
  }
  // 接地影の板（PlaneGeometry）を除いた外接箱を自前で作る
  const bboxOf = (root) => {
    const b = new T.Box3(); b.makeEmpty()
    const v = new T.Vector3()
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return
      const t = o.geometry.type || ''
      if (/Plane/.test(t)) return // 足元の影デカール・立ち絵の板は身体ではない
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const gb = o.geometry.boundingBox; if (!gb) return
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z)
        v.applyMatrix4(o.matrixWorld); b.expandByPoint(v)
      }
    })
    return b
  }
  const out = []
  const seen = new Set()
  sc.traverse((o) => {
    const t = tierOf(o.userData)
    if (!t || seen.has(o)) return
    seen.add(o)
    const b = bboxOf(o)
    if (!isFinite(b.min.y) || b.isEmpty()) return
    const wp = new T.Vector3(); o.getWorldPosition(wp)
    const ws = new T.Vector3(); o.getWorldScale(ws)
    let area = '現代home'
    for (const a of AREA) { if (Math.hypot(wp.x - a.x, wp.z - a.z) < a.r) area = a.name }
    if (area === '現代home' && wp.y > 60) area = '雲海'
    const h = b.max.y - b.min.y
    const rec = { 層: t, エリア: area, 身長: +h.toFixed(3), 横幅: +(b.max.x - b.min.x).toFixed(3), 奥行: +(b.max.z - b.min.z).toFixed(3), scale: +ws.x.toFixed(3), x: +wp.x.toFixed(1), y: +wp.y.toFixed(1), z: +wp.z.toFixed(1), 見えている: o.visible }
    const u = o.userData
    if (u.arms && u.arms.length === 2) { const p = new T.Vector3(), q = new T.Vector3(); u.arms[0].getWorldPosition(p); u.arms[1].getWorldPosition(q); rec.肩幅 = +p.distanceTo(q).toFixed(3) }
    if (u.headG) { const p = new T.Vector3(); u.headG.getWorldPosition(p); const hh = Math.max(0.01, (b.max.y - p.y) * 2); rec.頭部高 = +hh.toFixed(3); rec.頭身 = +(h / hh).toFixed(2); rec.頭の局所y = +u.headG.position.y.toFixed(3); rec.首から下の圧縮 = o.children.length > 1 && o.children[1].isGroup ? +o.children[1].scale.y.toFixed(3) : null }
    rec.脚の数 = u.legs ? u.legs.length : (u.legs === undefined ? -1 : 0)
    rec.__o = o
    out.push(rec)
  })
  // 背が極端に高い／低い個体の正体を、メッシュごとの上端・下端で突き止める
  const detail = (rec) => {
    const parts = []
    const v = new T.Vector3()
    rec.__o.traverse((o) => {
      if (!o.isMesh || !o.geometry) return
      const t = o.geometry.type || ''
      if (/Plane/.test(t)) return
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const gb = o.geometry.boundingBox; if (!gb) return
      let lo = 1e9, hi = -1e9
      for (let i = 0; i < 8; i++) { v.set(i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z); v.applyMatrix4(o.matrixWorld); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y) }
      parts.push({ 形: t.replace('Geometry', ''), 上端: +hi.toFixed(3), 下端: +lo.toFixed(3) })
    })
    parts.sort((a, b) => b.上端 - a.上端)
    const o = rec.__o
    const ws = new T.Vector3(); o.getWorldScale(ws)
    const chain = []
    for (let p = o, i = 0; p && i < 5; p = p.parent, i++) chain.push(`${p.name || p.type}[${p.scale.x.toFixed(2)},${p.scale.y.toFixed(2)},${p.scale.z.toFixed(2)}]`)
    const hg = o.userData.headG
    let head = null
    if (hg) { const v = new T.Vector3(); hg.getWorldPosition(v); head = { 頭の局所y: +hg.position.y.toFixed(3), 頭の局所scale: +hg.scale.y.toFixed(3), 頭のワールドy: +v.y.toFixed(3) } }
    return { 身長: rec.身長, エリア: rec.エリア, 脚: rec.脚の数, メッシュ数: parts.length, ワールドscale: +ws.y.toFixed(3), 親のつながり: chain.join(' ← '), userDataの鍵: Object.keys(o.userData).join(','), 直下の子: o.children.map((c) => `${c.type}(${c.children.length})`).join(','), 頭: head, 上端: parts[0] && parts[0].上端, 下端: parts[parts.length - 1] && parts[parts.length - 1].下端 }
  }
  const people = out.filter((r) => r.層 !== '四足獣(mkQuad)' && r.層 === 'makeResident').sort((a, b) => a.身長 - b.身長)
  const 内訳 = { 最も低い2体: people.slice(0, 2).map(detail), 最も高い2体: people.slice(-2).map(detail) }
  for (const r of out) delete r.__o
  return { 全数: out.length, 一覧: out, 内訳 }
})

if (data.err) { say(`   ${data.err}`); process.exit(1) }
say(`   捕まえた人物: ${data.全数} 体`)
fs.writeFileSync(`${outDir}/charbody.json`, JSON.stringify(data.一覧, null, 1))

const all = data.一覧
const tiers = [...new Set(all.map((r) => r.層))]
const areas = ['現代home', '江戸', '大正', '戦国', '雲海']
const pad = (s, n) => String(s).padEnd(n, ' ').slice(0, n)
const padn = (s, n) => String(s).padStart(n)

say(`\n── 層ごとの身長（メートル。実寸）`)
say(`   ${pad('層', 16)}${padn('人数', 5)}${padn('最小', 8)}${padn('中央', 8)}${padn('最大', 8)}${padn('平均', 8)}${padn('ばらつき率', 11)}`)
for (const t of tiers) { const s = stat(all.filter((r) => r.層 === t).map((r) => r.身長)); say(`   ${pad(t, 16)}${padn(s.n, 5)}${padn(s.最小, 8)}${padn(s.中央, 8)}${padn(s.最大, 8)}${padn(s.平均, 8)}${padn(s.ばらつき率, 11)}`) }
{ const s = stat(all.map((r) => r.身長)); say(`   ${pad('全体', 16)}${padn(s.n, 5)}${padn(s.最小, 8)}${padn(s.中央, 8)}${padn(s.最大, 8)}${padn(s.平均, 8)}${padn(s.ばらつき率, 11)}`) }

say(`\n── エリアごとの身長`)
say(`   ${pad('エリア', 12)}${padn('人数', 5)}${padn('最小', 8)}${padn('中央', 8)}${padn('最大', 8)}${padn('ばらつき率', 11)}`)
for (const a of areas) { const s = stat(all.filter((r) => r.エリア === a).map((r) => r.身長)); if (s.n) say(`   ${pad(a, 12)}${padn(s.n, 5)}${padn(s.最小, 8)}${padn(s.中央, 8)}${padn(s.最大, 8)}${padn(s.ばらつき率, 11)}`) }

say(`\n── 体型の指標（横幅÷身長。太っている人・痩せている人が居れば散らばる）`)
say(`   ${pad('層', 16)}${padn('最小', 8)}${padn('中央', 8)}${padn('最大', 8)}${padn('ばらつき率', 11)}`)
for (const t of tiers) { const s = stat(all.filter((r) => r.層 === t).map((r) => r.横幅 / r.身長), 3); if (s.n) say(`   ${pad(t, 16)}${padn(s.最小, 8)}${padn(s.中央, 8)}${padn(s.最大, 8)}${padn(s.ばらつき率, 11)}`) }

say(`\n── 肩幅（腕の付け根の左右の距離。userData.arms を持つ層のみ）`)
for (const t of ['makeResident', 'makePeep']) {
  const sh = all.filter((r) => r.層 === t && r.肩幅 !== undefined)
  if (!sh.length) continue
  say(`   ${t}  肩幅: ${JSON.stringify(stat(sh.map((r) => r.肩幅)))}`)
  say(`   ${t}  肩幅÷身長: ${JSON.stringify(stat(sh.map((r) => r.肩幅 / r.身長)))}`)
}
say(`\n── 頭身（身長 ÷ 頭部の高さ。makeResident のみ。四足獣は除外）`)
{
  const hd = all.filter((r) => r.層 === 'makeResident' && r.頭身 !== undefined)
  say(`   全体: ${JSON.stringify(stat(hd.map((r) => r.頭身), 2))}`)
  const ok = hd.filter((r) => r.頭の局所y < 1.3)
  say(`   頭が正しく載っている個体のみ: ${JSON.stringify(stat(ok.map((r) => r.頭身), 2))}`)
}

say(`\n── 身長のちがいは何段階あるか（1cm刻みで数える。多いほど個体差がある）`)
for (const t of tiers) {
  const v = all.filter((r) => r.層 === t).map((r) => Math.round(r.身長 * 100))
  const u = [...new Set(v)].sort((a, b) => a - b)
  say(`   ${pad(t, 16)} ${v.length}体 → ${u.length}段階（${u[0]}cm 〜 ${u[u.length - 1]}cm・幅 ${u[u.length - 1] - u[0]}cm）`)
}

say(`\n── 脚の数（userData.legs の長さ。0 ＝ 振れる脚が無い／-1 ＝ legs を持たない層）`)
const legCount = {}
for (const r of all) { const k = `${r.層}／脚${r.脚の数}`; legCount[k] = (legCount[k] || 0) + 1 }
for (const k of Object.keys(legCount).sort()) say(`   ${pad(k, 26)} ${legCount[k]} 体`)

say(`\n── 頭の取り付け高さ（makeResident の局所y。6873行の等身是正が効いていれば 1.11、効いていなければ 1.6）`)
{
  const res = all.filter((r) => r.層 === 'makeResident')
  const hist = {}
  for (const r of res) { const k = `頭y=${r.頭の局所y}／胴の縦圧縮=${r.首から下の圧縮}` ; hist[k] = (hist[k] || 0) + 1 }
  for (const k of Object.keys(hist).sort()) say(`   ${pad(k, 34)} ${hist[k]} 体`)
  for (const k of Object.keys(hist).sort()) {
    const y = +k.match(/頭y=([\d.]+)/)[1]
    const g = res.filter((r) => r.頭の局所y === y)
    const byArea = g.reduce((p, c) => { p[c.エリア] = (p[c.エリア] || 0) + 1; return p }, {})
    const byLeg = g.reduce((p, c) => { p['脚' + c.脚の数] = (p['脚' + c.脚の数] || 0) + 1; return p }, {})
    say(`     頭y=${y}: エリア ${JSON.stringify(byArea)}  脚 ${JSON.stringify(byLeg)}  身長 ${JSON.stringify(stat(g.map((r) => r.身長)))}`)
  }
}

// 頭が浮いた個体と正常な個体を、同じ条件で撮って見比べる（qa-charshots と同じ隔離撮影）
const shotDir = `${outDir}/chars`
fs.mkdirSync(shotDir, { recursive: true })
await page.evaluate(() => {
  const T = globalThis.__T
  const P = T.Object3D.prototype
  if (!P.__wfRen) { const oB = P.onBeforeRender; P.onBeforeRender = function (rd) { if (rd && rd.readRenderTargetPixels) globalThis.__wfR = rd; return oB.apply(this, arguments) }; P.__wfRen = true }
  globalThis.__wfShotHead = (headY, yaw) => {
    const sc = globalThis.__figScene, R = globalThis.__wfR
    if (!sc || !R) return null
    let fig = null
    sc.traverse((o) => { const u = o.userData; if (!fig && u && u.headG && !u.tailG && !u.kind && Math.abs(u.headG.position.y - headY) < 0.05) fig = o })
    if (!fig) return null
    const S = new T.Scene(); S.__wfTemp = true
    S.add(new T.AmbientLight(0xfff6ec, 0.9))
    const d1 = new T.DirectionalLight(0xffffff, 0.85); d1.position.set(0.3, 1, 1.3); S.add(d1)
    const d2 = new T.DirectionalLight(0xeaf0ff, 0.25); d2.position.set(-0.7, 0.4, 0.6); S.add(d2)
    const prev = { parent: fig.parent, p: fig.position.clone(), r: fig.rotation.clone(), auto: fig.matrixAutoUpdate, vis: [] }
    fig.traverse((o) => { prev.vis.push([o, o.visible]); o.visible = true })
    S.add(fig); fig.position.set(0, 0, 0); fig.rotation.set(0, yaw || 0, 0); fig.matrixAutoUpdate = true; fig.updateMatrix(); S.updateMatrixWorld(true)
    const b = new T.Box3().setFromObject(fig)
    const h = Math.max(0.2, b.max.y - b.min.y), cy = (b.max.y + b.min.y) / 2, half = h * 0.56, W = 360, H = 560
    const cam = new T.OrthographicCamera(-half * (W / H), half * (W / H), half, -half, 0.1, 40)
    cam.position.set(0, cy, 8); cam.lookAt(0, cy, 0)
    const rt = new T.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = T.SRGBColorSpace
    const pRT = R.getRenderTarget(), pA = R.getClearAlpha(), pC = new T.Color(); R.getClearColor(pC)
    R.setClearColor(0xc2ccce, 1); R.setRenderTarget(rt); R.clear(); R.render(S, cam)
    const buf = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, buf)
    R.setRenderTarget(pRT); R.setClearColor(pC, pA)
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d')
    const img = cx.createImageData(W, H); for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); cx.putImageData(img, 0, 0)
    S.remove(fig)
    for (const [o, v] of prev.vis) o.visible = v
    fig.position.copy(prev.p); fig.rotation.copy(prev.r); fig.matrixAutoUpdate = prev.auto; fig.updateMatrix()
    if (prev.parent) prev.parent.add(fig)
    rt.dispose()
    return { url: cv.toDataURL(), 高さm: +h.toFixed(3) }
  }
})
say(`\n── 頭が浮いた個体と正常な個体の見比べ（同じ隔離条件で撮影）`)
for (const c of [{ y: 1.6, n: '頭が浮いた住人_正面', yaw: 0 }, { y: 1.6, n: '頭が浮いた住人_横', yaw: Math.PI / 2 }, { y: 1.11, n: '正常な住人_正面', yaw: 0 }]) {
  const r = await page.evaluate(([y, w]) => globalThis.__wfShotHead(y, w), [c.y, c.yaw])
  if (!r) { say(`   ${c.n}: 見つからず`); continue }
  fs.writeFileSync(`${shotDir}/${c.n}.png`, Buffer.from(r.url.split(',')[1], 'base64'))
  say(`   ${c.n}.png  （実寸の高さ ${r.高さm} m・頭の取り付けy ${c.y}）`)
}

say(`\n── 背が極端な個体の正体（メッシュごとの上端・下端。単位はメートル）`)
say(`   ${JSON.stringify(data.内訳, null, 1)}`)

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/charbody.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/charbody.txt')
await browser.close()
