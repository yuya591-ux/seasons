// キャラの造形を厳格に採点する(2026-07-31)。#1（4方向の接写）と #2（真っ黒シルエット＋輪郭の数値）。
// アプリ側は一切変更しない。three の prototype を外から包み、
//   ・Object3D.prototype.onBeforeRender で「アプリのレンダラ」を捕まえる（2つ目のWebGLコンテキストを作らない）
//     ※ three r184 の WebGLRenderer は render をコンストラクタ内で this.render に代入するのでプロトタイプ包みが効かない。
//        描画のたびにメッシュへ渡ってくる onBeforeRender(renderer, …) の第1引数を借りるのが確実。
//   ・Object3D.prototype.add で、既存フック __town3dFigShot / __town3dCrowdShot が作った人物の実体を横取りする
//     （フックは描画後に dispose するが、three は CPU側の配列を残すので再描画で再アップロードされ、もう一度描ける）
//   ・updateMatrixWorld で根の Scene を捕まえる（cityWalker は街の中に居るので探して借りる→元に戻す）
// 撮影条件は既存フック __town3dFigShot と完全に同じ（環境光0.9・主光0.85・補助光0.25・背景0xc2ccce）。
// 使い方: PORT=4890 node scripts/qa-charshots.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-31/chars'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }

// 肌・髪・瞳は9体すべて同じ値に固定する（衣装と造形の差だけを見るため）
const SKIN = 0xf7d8bc, HAIR = 0x2a221c, IRIS = 0x5a86c2
const SAMPLES = [
  { key: 'kimono', label: '着物（江戸の町人・髷）', kind: 'res', cfg: { outfit: 'kimono', skin: SKIN, hair: HAIR, iris: IRIS, hairStyle: 'topknot', top: 0x3a4a5e, accent: 0x8a6a3a } },
  { key: 'armor', label: '甲冑（江戸の侍・二本差し）', kind: 'res', cfg: { outfit: 'armor', skin: SKIN, hair: HAIR, iris: IRIS, hairStyle: 'topknot', top: 0x3a3a44, bottom: 0x55504a, accent: 0x8a6a3a, prop: 'swords' } },
  { key: 'hakama', label: '袴（大正の書生・学生帽）', kind: 'res', cfg: { outfit: 'hakama', skin: SKIN, hair: HAIR, iris: IRIS, hairStyle: 'hat', hat: 'cap', top: 0x3a4250, bottom: 0x2e3038, accent: 0x2a2e30 } },
  { key: 'dress', label: 'ワンピース（大正のモダンガール・ボブ）', kind: 'res', cfg: { outfit: 'dress', skin: SKIN, hair: HAIR, iris: IRIS, hairStyle: 'bob', top: 0xb5677e, accent: 0xf0e6d2 } },
  { key: 'blouse', label: 'ブラウス（既定の少女・鞄）', kind: 'res', cfg: { outfit: 'blouse', skin: SKIN, hair: HAIR, iris: IRIS, hairStyle: 'bob', top: 0xf0ece2, bottom: 0x2e3a42, prop: 'bag', bagCol: 0x8a7256 } },
  { key: 'modern', label: '現代の普段着（home住人）', kind: 'res', cfg: { outfit: 'modern', skin: SKIN, hair: HAIR, iris: IRIS, hairStyle: 0, top: 0x5a78a0, bottom: 0x39414e } },
  { key: 'suit', label: '背広（大正の紳士・中折れ帽＋杖）', kind: 'res', cfg: { outfit: 'suit', skin: SKIN, hair: HAIR, iris: IRIS, hairStyle: 'hat', hat: 'fedora', top: 0x3a3a42, bottom: 0x3a3a42, accent: 0x7a3a32, prop: 'cane' } },
  { key: 'crowd', label: '群衆の一人（mkCrowdPerson・1メッシュ）', kind: 'crowd' },
  { key: 'walker', label: '城下を歩く旅人（cityWalker・脚が振れる）', kind: 'walker' },
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(7000)

// three の実URL（クエリ付きでないと別インスタンスになる）
const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
const threeUrl = await page.evaluate(async (list) => {
  for (const u of list) { try { const m = await import(/* @vite-ignore */ u); if (m && m.Object3D && m.WebGLRenderer) { globalThis.__T = m; return u } } catch { /* 次の候補 */ } }
  return null
}, urls)
say(`■ 準備`)
say(`   three の実URL: ${threeUrl}`)

// prototype を包む（アプリのコードは触らない）
const ready = await page.evaluate(() => {
  const T = globalThis.__T; if (!T) return { ok: false, 理由: 'threeを取れなかった' }
  const P = T.Object3D.prototype
  if (!P.__wfProbe) {
    const oU = P.updateMatrixWorld
    P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent; if (r.isScene && !r.__wfTemp) globalThis.__figScene = r; return oU.call(this, f) }
    const oA = P.add
    P.add = function (o) { const r = oA.apply(this, arguments); try { if (globalThis.__wfArm && this.isScene && this !== globalThis.__wfLive && o && o.isObject3D && !o.isLight) { globalThis.__wfFig = o; globalThis.__wfArm = false } } catch { /* 捕捉失敗は無視 */ } return r }
    const oB = P.onBeforeRender
    P.onBeforeRender = function (rd) { if (rd && rd.readRenderTargetPixels) globalThis.__wfR = rd; return oB.apply(this, arguments) }
    P.__wfProbe = true
  }
  return { ok: true }
})
say(`   prototype包み: ${JSON.stringify(ready)}`)
await page.waitForTimeout(1500)
// 生きている街のSceneを1回だけ確定させる（以後の一時シーンで上書きされないように）
const live = await page.evaluate(() => { globalThis.__wfLive = globalThis.__figScene; return { レンダラ捕捉: !!globalThis.__wfR, 生シーン: !!globalThis.__wfLive, 子の数: globalThis.__wfLive ? globalThis.__wfLive.children.length : 0 } })
say(`   捕まえたもの: ${JSON.stringify(live)}`)

// 撮影ハーネスを注入（既存フックと同じ光・同じ背景色）
await page.evaluate(() => {
  const T = globalThis.__T
  // 人物を隔離シーンへ一時的に借り、指定の向き・画角で描いて等倍PNGにする
  globalThis.__wfShot = (fig, opt) => {
    const R = globalThis.__wfR; if (!R || !fig) return null
    const S = new T.Scene(); S.__wfTemp = true
    S.add(new T.AmbientLight(0xfff6ec, 0.9))
    const d1 = new T.DirectionalLight(0xffffff, 0.85); d1.position.set(0.3, 1, 1.3); S.add(d1)
    const d2 = new T.DirectionalLight(0xeaf0ff, 0.25); d2.position.set(-0.7, 0.4, 0.6); S.add(d2)
    // 元の居場所を覚えておく（街から借りる場合があるので必ず返す）
    const prev = { parent: fig.parent, p: fig.position.clone(), r: fig.rotation.clone(), auto: fig.matrixAutoUpdate, vis: [] }
    fig.traverse((o) => { prev.vis.push([o, o.visible]); o.visible = true })
    const swapped = []
    if (opt.silhouette) { // 真っ黒に塗る（輪郭線メッシュも含めて外形だけを見る）
      const blk = new T.MeshBasicMaterial({ color: 0x000000, side: T.DoubleSide, fog: false })
      fig.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) { swapped.push([o, o.material]); o.material = blk } })
      S.userData.blk = blk
    }
    S.add(fig); fig.position.set(0, 0, 0); fig.rotation.set(0, opt.yaw || 0, 0); fig.matrixAutoUpdate = true; fig.updateMatrix()
    S.updateMatrixWorld(true)
    const box = new T.Box3().setFromObject(fig)
    const h = Math.max(0.2, box.max.y - box.min.y)
    let cy, half, W, H
    if (opt.face) { // 顔寄り＝頭の中心を正方形で
      let hy = box.max.y - h * 0.12
      if (fig.userData && fig.userData.headG) { const v = new T.Vector3(); fig.userData.headG.getWorldPosition(v); hy = v.y }
      cy = hy; half = h * 0.20; W = 440; H = 440
    } else { cy = (box.max.y + box.min.y) / 2; half = h * 0.56; W = 360; H = 560 }
    const cam = new T.OrthographicCamera(-half * (W / H), half * (W / H), half, -half, 0.1, 40)
    cam.position.set(0, cy, 8); cam.lookAt(0, cy, 0)
    const rt = new T.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = T.SRGBColorSpace
    const pRT = R.getRenderTarget(), pA = R.getClearAlpha(), pC = new T.Color(); R.getClearColor(pC)
    R.setClearColor(opt.silhouette ? 0xffffff : 0xc2ccce, 1); R.setRenderTarget(rt); R.clear(); R.render(S, cam)
    const buf = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, buf)
    R.setRenderTarget(pRT); R.setClearColor(pC, pA)
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d')
    const img = cx.createImageData(W, H)
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
    cx.putImageData(img, 0, 0)
    // 後片付け＝借りたものを完全に返す
    S.remove(fig)
    for (const [o, m] of swapped) o.material = m
    if (S.userData.blk) S.userData.blk.dispose()
    for (const [o, v] of prev.vis) o.visible = v
    fig.position.copy(prev.p); fig.rotation.copy(prev.r); fig.matrixAutoUpdate = prev.auto; fig.updateMatrix()
    if (prev.parent) prev.parent.add(fig)
    rt.dispose()
    // 輪郭の数値（シルエットのときだけ）
    let met = null
    if (opt.silhouette) {
      const d = img.data, rows = []
      let x0 = 1e9, x1 = -1e9, y0 = -1, y1 = -1, black = 0
      for (let y = 0; y < H; y++) {
        let lo = -1, hi = -1, runs = 0, on = false, cnt = 0
        for (let x = 0; x < W; x++) {
          const dark = d[(y * W + x) * 4] < 128
          if (dark) { cnt++; if (lo < 0) lo = x; hi = x; if (!on) { runs++; on = true } } else on = false
        }
        black += cnt
        if (lo >= 0) { if (y0 < 0) y0 = y; y1 = y; if (lo < x0) x0 = lo; if (hi > x1) x1 = hi }
        rows.push({ y, w: lo >= 0 ? hi - lo + 1 : 0, runs, cnt })
      }
      const bh = Math.max(1, y1 - y0 + 1), bw = Math.max(1, x1 - x0 + 1)
      const band = (a, b) => rows.filter((r) => r.y >= y0 + bh * a && r.y < y0 + bh * b && r.w > 0)
      const mx = (a) => a.length ? Math.max(...a.map((r) => r.w)) : 0
      const mn = (a) => a.length ? Math.min(...a.map((r) => r.w)) : 0
      const 頭幅 = mx(band(0, 0.13)), 肩幅 = mx(band(0.13, 0.30)), 胴幅 = mn(band(0.36, 0.55)), 尻幅 = mx(band(0.55, 0.72))
      const 脚割れ = band(0.72, 1.0).filter((r) => r.runs >= 2).length, 脚行数 = band(0.72, 1.0).length
      const 腕離れ = band(0.25, 0.55).filter((r) => r.runs >= 2).length, 腕行数 = band(0.25, 0.55).length
      met = {
        高さpx: bh, 幅px: bw, 縦横比: +(bh / bw).toFixed(2), 充填率: +(black / (bw * bh)).toFixed(3),
        頭幅: 頭幅, 肩幅: 肩幅, 胴幅: 胴幅, 尻幅: 尻幅,
        くびれ: 肩幅 ? +(胴幅 / 肩幅).toFixed(2) : 0, 頭肩比: 肩幅 ? +(頭幅 / 肩幅).toFixed(2) : 0,
        脚が割れている行: `${脚割れ}/${脚行数}`, 腕が胴から離れている行: `${腕離れ}/${腕行数}`,
      }
    }
    return { url: cv.toDataURL(), w: W, h: H, met, 高さm: +h.toFixed(3) }
  }
  // 既存フックを一度だけ呼んで、その中で作られた人物の実体を横取りする
  globalThis.__wfGrab = (kind, cfgJson) => {
    globalThis.__wfFig = null; globalThis.__wfArm = true
    try { if (kind === 'res') window.__town3dFigShot(0, cfgJson); else window.__town3dCrowdShot(0xb0432e, 0.7, 0) } catch (e) { globalThis.__wfArm = false; return String(e.message || e) }
    globalThis.__wfArm = false
    return globalThis.__wfFig ? 'ok' : '捕まえられなかった'
  }
  // 街の中から cityWalker を1体探す（借りるだけ。撮影後に元へ返す）
  globalThis.__wfFindWalker = () => {
    const sc = globalThis.__wfLive; if (!sc) return 'sceneが無い'
    let hit = null
    sc.traverse((o) => { if (!hit && o.userData && o.userData.walker === true && o.userData.legs) hit = o })
    globalThis.__wfFig = hit
    return hit ? `見つけた（親=${hit.parent ? hit.parent.name || hit.parent.type : 'なし'}・scale=${hit.scale.x.toFixed(2)}）` : '見つからない'
  }
})

const save = (name, url) => { fs.writeFileSync(`${outDir}/${name}`, Buffer.from(url.split(',')[1], 'base64')) }
const ANG = [{ n: '正面', yaw: 0 }, { n: '横', yaw: Math.PI / 2 }, { n: '後ろ', yaw: Math.PI }]
const mets = []

say(`\n■ #1 全9衣装 × 4方向（正面・横・後ろ・顔寄り）／ #2 真っ黒シルエット × 2方向`)
for (const s of SAMPLES) {
  const grab = s.kind === 'walker'
    ? await page.evaluate(() => globalThis.__wfFindWalker())
    : await page.evaluate(([k, c]) => globalThis.__wfGrab(k, c), [s.kind, s.cfg ? JSON.stringify(s.cfg) : null])
  say(`\n   ● ${s.key}  ${s.label}   捕捉: ${grab}`)
  if (!/ok|見つけた/.test(grab)) { say(`      → 撮影できず`); continue }
  for (const a of ANG) {
    const r = await page.evaluate((y) => { const o = globalThis.__wfShot(globalThis.__wfFig, { yaw: y }); return o ? { url: o.url, 高さm: o.高さm } : null }, a.yaw)
    if (!r) { say(`      ${a.n}: 失敗`); continue }
    save(`${s.key}_${a.n}.png`, r.url); say(`      ${s.key}_${a.n}.png  （実寸の高さ ${r.高さm} m）`)
  }
  const f = await page.evaluate(() => { const o = globalThis.__wfShot(globalThis.__wfFig, { yaw: 0, face: true }); return o ? o.url : null })
  if (f) { save(`${s.key}_顔.png`, f); say(`      ${s.key}_顔.png`) }
  for (const a of [{ n: '正面', yaw: 0 }, { n: '横', yaw: Math.PI / 2 }]) {
    const r = await page.evaluate((y) => { const o = globalThis.__wfShot(globalThis.__wfFig, { yaw: y, silhouette: true }); return o ? { url: o.url, met: o.met } : null }, a.yaw)
    if (!r) { say(`      影_${a.n}: 失敗`); continue }
    save(`影_${s.key}_${a.n}.png`, r.url)
    mets.push({ key: s.key, 向き: a.n, ...r.met })
    say(`      影_${s.key}_${a.n}.png  ${JSON.stringify(r.met)}`)
  }
}

say(`\n■ #2 輪郭の数値まとめ（黒く塗ったシルエットの画素から算出）`)
say(`   ※ 充填率＝黒画素÷外接矩形。低いほど手足が開いて人体らしい。くびれ＝胴幅÷肩幅（1.0に近いほど寸胴）`)
const pad = (s, n) => String(s).padEnd(n, '　').slice(0, n)
const padn = (s, n) => String(s).padStart(n)
say(`   ${pad('衣装', 8)}${pad('向き', 4)}${padn('縦横比', 7)}${padn('充填率', 7)}${padn('頭幅', 5)}${padn('肩幅', 5)}${padn('胴幅', 5)}${padn('尻幅', 5)}${padn('くびれ', 7)}${padn('頭肩比', 7)}  ${'脚割れ'}  ${'腕離れ'}`)
for (const m of mets) say(`   ${pad(m.key, 8)}${pad(m.向き, 4)}${padn(m.縦横比, 7)}${padn(m.充填率, 7)}${padn(m.頭幅, 5)}${padn(m.肩幅, 5)}${padn(m.胴幅, 5)}${padn(m.尻幅, 5)}${padn(m.くびれ, 7)}${padn(m.頭肩比, 7)}  ${padn(m.脚が割れている行, 7)}  ${padn(m.腕が胴から離れている行, 7)}`)

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/charshots.txt`, log.join('\n'))
fs.writeFileSync(`${outDir}/charshots.json`, JSON.stringify(mets, null, 1))
console.log('\nWROTE ' + outDir + '/charshots.txt')
await browser.close()
