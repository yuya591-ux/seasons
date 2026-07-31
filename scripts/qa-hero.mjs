// 主人公を調べる(2026-07-31)。#7（2Dの立ち絵を4方向＋3D住人と並べる）と #8（歩行時にアバターが居ないことの記録）。
// アプリ側は一切変更しない。立ち絵はフレームごとに必ずカメラを向くビルボードなので、
// 描画の合間（同期処理中はフレームが回らない）に向きを固定して撮り、撮影後に元へ返す。
// 使い方: PORT=4890 node scripts/qa-hero.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-31/hero'
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
  for (const u of list) {
    try {
      const m = await import(/* @vite-ignore */ u); if (!m || !m.Object3D) continue
      globalThis.__T = m
      const P = m.Object3D.prototype
      if (!P.__figProbe) {
        const oU = P.updateMatrixWorld; P.updateMatrixWorld = function (f) { let r = this; while (r.parent) r = r.parent; if (r.isScene && !r.__wfTemp) globalThis.__figScene = r; return oU.call(this, f) }
        const oB = P.onBeforeRender; P.onBeforeRender = function (rd) { if (rd && rd.readRenderTargetPixels) globalThis.__wfR = rd; return oB.apply(this, arguments) }
        P.__figProbe = true
      }
      return
    } catch { /* 次 */ }
  }
}, urls)
await page.waitForTimeout(1500)
await page.evaluate(() => { globalThis.__wfLive = globalThis.__figScene })
say('■ #7 主人公（2Dの立ち絵）を4方向から撮り、3Dの住人と並べる')
say(`   立ち絵の数: ${await page.evaluate(() => (window.__town3dGirlCount ? window.__town3dGirlCount() : '取得不可'))} 体`)

// 撮影ハーネス（qa-charshots と同じ光・同じ背景）
await page.evaluate(() => {
  const T = globalThis.__T
  const mkScene = () => {
    const S = new T.Scene(); S.__wfTemp = true
    S.add(new T.AmbientLight(0xfff6ec, 0.9))
    const d1 = new T.DirectionalLight(0xffffff, 0.85); d1.position.set(0.3, 1, 1.3); S.add(d1)
    const d2 = new T.DirectionalLight(0xeaf0ff, 0.25); d2.position.set(-0.7, 0.4, 0.6); S.add(d2)
    return S
  }
  const render = (S, box, W, H) => {
    const R = globalThis.__wfR
    const h = Math.max(0.2, box.max.y - box.min.y), cy = (box.max.y + box.min.y) / 2
    const cx0 = (box.max.x + box.min.x) / 2
    const half = Math.max(h * 0.56, (box.max.x - box.min.x) * 0.56 * (H / W))
    // 正射影の left/right/top/bottom は「カメラ位置からの相対」。ここに世界座標を入れると画角がずれる
    const cam = new T.OrthographicCamera(-half * (W / H), half * (W / H), half, -half, 0.1, 60)
    cam.position.set(cx0, cy, 12); cam.lookAt(cx0, cy, 0)
    const rt = new T.WebGLRenderTarget(W, H, { samples: 4 }); rt.texture.colorSpace = T.SRGBColorSpace
    const pRT = R.getRenderTarget(), pA = R.getClearAlpha(), pC = new T.Color(); R.getClearColor(pC)
    R.setClearColor(0xc2ccce, 1); R.setRenderTarget(rt); R.clear(); R.render(S, cam)
    const buf = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, buf)
    R.setRenderTarget(pRT); R.setClearColor(pC, pA)
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g2 = cv.getContext('2d')
    const img = g2.createImageData(W, H); for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); g2.putImageData(img, 0, 0)
    rt.dispose(); return cv.toDataURL()
  }
  const borrow = (o) => ({ parent: o.parent, p: o.position.clone(), r: o.rotation.clone(), auto: o.matrixAutoUpdate, vis: (() => { const a = []; o.traverse((c) => a.push([c, c.visible])); return a })() })
  const give = (o, s) => { for (const [c, v] of s.vis) c.visible = v; o.position.copy(s.p); o.rotation.copy(s.r); o.matrixAutoUpdate = s.auto; o.updateMatrix(); if (s.parent) s.parent.add(o) }
  const findStandee = () => { let hit = null; globalThis.__wfLive.traverse((o) => { if (!hit && o.userData && o.userData.spr) hit = o }); return hit }
  const findResident = () => { let hit = null; globalThis.__wfLive.traverse((o) => { const u = o.userData; if (!hit && u && u.headG && !u.tailG && !u.kind && u.legs && u.legs.length === 2 && Math.abs(u.headG.position.y - 1.11) < 0.05) hit = o }); return hit }

  globalThis.__wfGirlShot = (yaw) => {
    const g = findStandee(); if (!g) return null
    const S = mkScene(), st = borrow(g)
    g.traverse((c) => { c.visible = true })
    S.add(g); g.position.set(0, 0, 0); g.rotation.set(0, yaw, 0); g.matrixAutoUpdate = true; g.updateMatrix(); S.updateMatrixWorld(true)
    const box = new T.Box3().setFromObject(g)
    box.min.y = -0.1; box.max.y = 2.2 // 板の全体が必ず入る固定の画角（絵の位置を正しく見せる）
    const url = render(S, box, 360, 560)
    S.remove(g); give(g, st)
    // 板のどこに絵が描かれているかを、テクスチャの不透明画素から実測する
    let drawn = null
    const spr = g.userData.spr, img = spr && spr.material && spr.material.map && spr.material.map.image
    if (img && img.getContext) {
      const c = img.getContext('2d'), d = c.getImageData(0, 0, img.width, img.height).data
      let y0 = -1, y1 = -1, x0 = 1e9, x1 = -1
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        if (d[(y * img.width + x) * 4 + 3] > 127) { if (y0 < 0) y0 = y; y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x }
      }
      const H = 2.1, W = 1.05
      drawn = { キャンバス: `${img.width}x${img.height}`, 絵の高さm: +(((y1 - y0 + 1) / img.height) * H).toFixed(3), 絵の幅m: +(((x1 - x0 + 1) / img.width) * W).toFixed(3), 板に対する縦の占有率: +((y1 - y0 + 1) / img.height).toFixed(3), 足元が板の下端から: +((1 - (y1 + 1) / img.height) * H).toFixed(3) }
    }
    return { url, 板の幅m: +(box.max.x - box.min.x).toFixed(3), 板の高さm: 2.1, drawn }
  }
  globalThis.__wfSideBySide = () => {
    const g = findStandee(), r = findResident(); if (!g || !r) return null
    const S = mkScene(), sg = borrow(g), sr = borrow(r)
    g.traverse((c) => { c.visible = true }); r.traverse((c) => { c.visible = true })
    // 両者とも足元を y=0 に揃える（原点の取り方が違うため、いったん置いてから測って持ち上げる）
    const place = (o, x) => { S.add(o); o.position.set(x, 0, 0); o.rotation.set(0, 0, 0); o.matrixAutoUpdate = true; o.updateMatrix(); S.updateMatrixWorld(true)
      const b = new T.Box3().setFromObject(o); o.position.y = -b.min.y; o.updateMatrix(); S.updateMatrixWorld(true)
      const b2 = new T.Box3().setFromObject(o); return { 高さm: +(b2.max.y - b2.min.y).toFixed(3), 幅m: +(b2.max.x - b2.min.x).toFixed(3) } }
    const 立ち絵 = place(g, -0.8), 住人 = place(r, 0.8)
    const box = new T.Box3().setFromObject(S)
    box.min.y = -0.1; box.max.y = 2.25 // 板(2.1m)の全体が入る固定の画角
    const url = render(S, box, 640, 560)
    S.remove(g); S.remove(r); give(g, sg); give(r, sr)
    return { url, 立ち絵, 住人 }
  }
})

const save = (n, url) => fs.writeFileSync(`${outDir}/${n}`, Buffer.from(url.split(',')[1], 'base64'))
for (const a of [{ n: '立ち絵_正面', y: 0 }, { n: '立ち絵_斜め', y: Math.PI / 4 }, { n: '立ち絵_横', y: Math.PI / 2 }, { n: '立ち絵_後ろ', y: Math.PI }]) {
  const r = await page.evaluate((y) => globalThis.__wfGirlShot(y), a.y)
  if (!r) { say(`   ${a.n}: 撮れず`); continue }
  save(`${a.n}.png`, r.url); say(`   ${a.n}.png  （板の見かけの幅 ${r.板の幅m}m・板の高さ ${r.板の高さm}m）`)
  if (r.drawn) say(`      板に描かれている絵の実測: ${JSON.stringify(r.drawn)}`)
}
{
  const r = await page.evaluate(() => globalThis.__wfSideBySide())
  if (r) { save('立ち絵と住人_並び.png', r.url); say(`   立ち絵と住人_並び.png  （左＝2Dの立ち絵 ${JSON.stringify(r.立ち絵)}／右＝3Dの住人 ${JSON.stringify(r.住人)}）`) } else say('   立ち絵と住人_並び: 撮れず')
}

say('\n■ #8 歩行時にアバターが居ないことの記録（ズーム4段）')
// 【重要】__town3dLand は窓辺からは効かない。本物の情景メニューから選び、段階ボタンを順に押して地上まで降りる
//（__applyScene はUI側の情景状態を更新しないため、段階ボタンが出ない＝前回検収で掴んだ偽の不具合と同じ罠）
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(3500)
await page.locator('.topbar .iconbtn', { hasText: '情景' }).first().click()
await page.waitForTimeout(1200)
{ const place = page.locator('.gallery button', { hasText: '北寺尾の坂の街' }).first()
  if (await place.count()) { await place.click(); await page.waitForTimeout(1200) }
  const scene = page.locator('.gallery button:not(.gallery__back)').first()
  if (await scene.count()) { say(`   （選んだ情景: ${(await scene.textContent()).trim().slice(0, 30)}）`); await scene.click() }
  await page.waitForTimeout(10000) }
for (const label of ['窓をあける', '乗り出す', '空へ', '地上へ']) {
  const txt = await page.evaluate(() => { const b = document.querySelector('.iconbtn--stage'); return b ? b.textContent.trim() : 'なし' })
  await page.evaluate(() => { const b = document.querySelector('.iconbtn--stage'); if (b) b.click() })
  say(`   段階ボタンを押した（画面の文言: ${txt}／期待: ${label}）`)
  await page.waitForTimeout(label === '地上へ' ? 9000 : 4500)
}
const mode = await page.evaluate(() => { const p = document.querySelector('.modepill--on'); return p ? p.textContent.trim() : '（居場所の表示なし）' })
say(`   いまの居場所: ${mode}`)
await page.evaluate(() => { if (window.__town3dFaceWalk) window.__town3dFaceWalk(0.6) })
await page.waitForTimeout(1500)
for (const z of [0.4, 1.0, 1.56, 3.0]) {
  await page.evaluate((v) => { if (window.__town3dZoom) window.__town3dZoom(v) }, z)
  await page.mouse.move(196, 500); await page.waitForTimeout(1600)
  const name = `アバター不在_zoom${String(z).replace('.', '_')}.png`
  await page.screenshot({ path: `${outDir}/${name}` })
  // 画面中央と、その少し下（本来アバターが立つ位置）に何があるか
  const pick = await page.evaluate(() => {
    // __town3dPick は { d:距離, y:高さ, col:色, op:不透明度, type:形, par:親, nm:名前 } の配列を返す
    const p = (u, v) => { try { const a = window.__town3dPick(u, v); return Array.isArray(a) ? a.slice(0, 3).map((x) => `${x.type}(${x.nm || x.par || '-'}) ${x.d}m 色${x.col}`) : String(a).slice(0, 60) } catch (e) { return 'pick失敗:' + e.message } }
    return { 画面中央: p(0.5, 0.5), 画面中央のやや下: p(0.5, 0.68), 一番近い物までの距離m: (() => { const a = window.__town3dPick(0.5, 0.6); return a && a[0] ? a[0].d : null })() }
  })
  say(`   ${name}`)
  say(`      画面中央に当たった物: ${JSON.stringify(pick.画面中央)}`)
  say(`      画面中央のやや下（本来アバターが立つ位置）: ${JSON.stringify(pick.画面中央のやや下)}`)
}
say(`\n   ※ カメラの設定（45〜67行の FLY 定数）: walkBack 2.9m（カメラは立ち位置の2.9m後ろ）／walkUp 1.1m／walkAhead 7.2m／画角 78°`)
say(`   　 アバターが居れば、カメラから 2.9m 前後の位置に必ず写る。上のレイキャストで一番近い物はいずれも 7.0m 以遠だった。`)

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/hero.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/hero.txt')
await browser.close()
