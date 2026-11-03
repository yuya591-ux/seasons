// 便18・便19 の検査: 角部屋の窓の外の鴨川の町を、本物の GPU（画面なしの Chromium・D3D11）で開いて確かめる。
// 前に: npm run build のあと npx vite preview --port 4961 --strictPort（PORT で替えられる）
// 使い方: node scripts/kamo/kensa.mjs [検査の名前…]   （名前を省くと全部。1つでも外れたら exit 1）
//   K1 鴨川の角部屋が開き、鴨川の町が組めて、エラーと GL の型の食い違い（影の図の作り忘れ）が無い
//   ~~K2 鴨川の角部屋は飛べない（飛ぶ・降りるが揃うまで窓辺だけ）~~（【便19】下の K2 に書き換えた）
//   K2 鴨川の角部屋で、画面の釦を「窓をあける → 乗り出す → 空へ」と押すと空へ出て（釦が「地上へ」）、「地上へ」で歩く（便19）
//   K3 鴨川の町のデータが読めない時は、前の角部屋（北寺尾の町）のまま開く（エラー無し）
//   K4 ?kamo=0 で前の角部屋に戻る
//   K5 角部屋でない情景（北寺尾・谷戸）は鴨川の町を組まない（エラー無し）
//   K6 鴨川の角部屋の町の3Dの舞台は、部屋と降る物だけを描く（北寺尾の町を描かない＝描く呼び出し 600 未満）
//   K7 雪の夕の空は曇天の灰（乗り出して見上げた空の明るさが 0.25 以上・物理の空だと空の上が黒くなった）
//   K8 iPhone の画面（402×874・指で触る）では軽い段で開き、PC の画面では通常の段で開く（【便19】歩く高さを読む地形の網も、描く網と同じ間引き＝iPhone 2・PC 1）
//   K9 歩いて川へ向かうと水際で止まる（水に入らない・水際の 3m 手前より先まで進む）（便19）
//   K10 建物へ向かって歩くと壁の手前で止まる（建物の中に入らない）（便19）
//   K11 橋の床の上を歩くと、水の上を渡って向こうへ行ける（足が橋の床の高さのまま）（便19）
//   K12 背の高い建物へ低く飛んで向かうと、建物の上を越える（自分は建物・木の上 1m 以上・カメラは 0.5m 以上）（便19）
//   K13 iPhone の縦で開くと正面の窓（東＝鴨川）が正面（見回しの横 0）。PC は今のまま -0.6、?kamo=0 の iPhone は -1.12（便19・便18 #1=1）
//   K14 乗り出して見下ろした画の真っ黒（RGB の最大 3 以下）の画素が 0.5% 未満（建物の焼けていない面の黒・前は 3.4%）（便19）
//   K15 水面の凹凸の図で、上位 20 本の波に入る力が 40% 以下（前は 18 本だけ＝100%・格子の干渉）で、読む向きを回す差し替えが効いている（便19）
//   K16 窓から空へ出てすぐ地上へ降りると、開けた所（8方位の抜けの平均 15m 以上・水と建物でない）に降りる（便19）
//   ~~K17 空から部屋の建物を見ると、部屋の窓の所が外壁で塞がる（塞ぐ壁を止めた画と 0.2% 以上の画素が違う）~~（【便19】揺れだけで合格したので下の形に替えた）
//   K17 部屋の窓の所を塞ぐ壁が、窓辺では出ず、空と地上では出て、窓辺へもどると消える（便19）
//   K18 北寺尾の時代の島の縁（霞の帯が一番濃い所）と同じ所を鴨川の町で飛んでも、霞の帯・色の膜・雲の白い包み・虹の層が出ず、居場所が鴨川の名（便19）
//   K19 春の夕の鴨川に、座る人（20 人以上）・飛び石の列（5 石以上が 2 列以上）・叡山電車・トビ 2 羽・アオサギが居て、?kamolife=0 では動く物を組まない（便20）
//   K20 夏の夜の角部屋の五山の送り火: 並びが 大文字→妙→法→船形→左大文字→鳥居形、火床が 75・103・63・79・53・108、点く時刻が本物の順（5分＝25秒おき）で、点けて 12 秒の所で大文字だけが灯る（便20）
//   K21 夏の夜でない角部屋（秋の夕）には送り火を組まない（便20）
//   K22 飛ぶ・歩く時の音の近さ: 水の上の低い所で川の瀬音、出町桝形商店街でまちの気配、出町柳駅で駅の音が満ち、高い空では川の音が消える（便20）
//   K23 鴨川の出来事の音（トビの声・叡山電車）を鳴らしてもエラーが無く、出来事を起こすと鳴らした数が増える（便20）
//   ~~K24 視差軽減（動きを減らす設定）では、送り火も時々の出来事も起きない（座る人と電車はいつもの景色として居る）（便20）~~（【便20・外の目】下の形に替えた）
//   K24 視差軽減（動きを減らす設定）では、時々の出来事の帯（飛び石を渡る人・トビの声・ユリカモメ）の時計が進まず、出来事が起きない。送り火（ゆっくり点く遠い火）は灯るまでの待ちが進む（便20）
//   K25 動く物の表（life.json）が読めない時も、鴨川の町はそのまま開く（動く物が無いだけ・エラー無し）（便20）
// 町の3Dが組めずに検証の口が無い時も、落ちた理由を「×」の行で残す（外し回しの記録に理由が残るように）
import { chromium } from 'playwright'
const PORT = process.env.PORT || 4961, BASE = `http://localhost:${PORT}/seasons/`
const want = new Set(process.argv.slice(2))
const run = (k) => !want.size || want.has(k)
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const results = []
const kamoInfo = (p) => p.evaluate(() => (window.__town3dKamo ? window.__town3dKamo() : 'no-hook'))
async function open(scene, { q = '', block = false, view = null, win = null, dev = null } = {}) {
  const ctx = await b.newContext({ ...(dev || { viewport: { width: 1280, height: 720 } }), serviceWorkers: 'block' }) // service worker を止める（止めないと読み込みの網を通らずに取りに行く＝K3 が測れない）
  const p = await ctx.newPage()
  const errs = [], gl = []
  p.on('pageerror', (e) => errs.push('PE ' + e.message))
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t.slice(0, 200)); if (/GL_INVALID|INVALID_OPERATION/.test(t)) gl.push(t.slice(0, 160)) })
  if (block) await ctx.route('**/kamo/**', (r) => r.abort())
  // 【便20】起動時の情景を、開く情景にそろえる（3時間以内に居た情景から開く作り＝main.js の start）。画面の釦（窓をあける・空へ）は起動時の情景で出し分けるので、
  //   検証の口（__applyScene）だけで替えると、起動時の情景が「今の季節と時刻」で窓の無い情景になった日（2026-11-04 の朝）に釦が隠れ、K2 が前の版でも外れた
  await ctx.addInitScript((id) => { try { if (!localStorage.getItem('seasons.state.v1')) localStorage.setItem('seasons.state.v1', JSON.stringify({ version: 2, sceneId: id, sceneAt: Date.now() })) } catch (e) { /* 無視 */ } }, scene)
  await p.goto(`${BASE}?dev=1${q ? '&' + q : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.locator('.gate').click().catch(() => {})
  await p.waitForTimeout(800)
  await p.evaluate((id) => window.__applyScene(id), scene)
  const ok = await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).then(() => true).catch(() => false)
  if (view) await p.evaluate(([y, q2]) => window.__town3dSetView(y, q2), view)
  if (win) { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(1200); if (win === 'lean') { await p.evaluate(() => window.__town3dLean(true)); await p.waitForTimeout(1500) } }
  await p.waitForTimeout(1500)
  return { p, ctx, errs, gl, ok }
}
const check = (k, pass, detail) => { results.push({ k, pass, detail }); console.log(`${pass ? '○' : '×'} ${k} ${detail}`) }

if (run('K1') || run('K2') || run('K6')) {
  const o = await open('autumn-dusk-corner-room')
  const k = await o.p.evaluate(() => window.__town3dKamo())
  const st = await o.p.evaluate(() => window.__town3dStats())
  if (run('K1')) check('K1', o.ok && !!k && !o.errs.length && !o.gl.length, `組めた ${o.ok}・鴨川 ${k ? '有り' : '無し'}・外した建物 ${k && k.removed}・エラー ${o.errs.length}・GL ${o.gl.length}${o.gl.length ? '（' + o.gl[0] + '）' : ''}`)
  if (run('K2')) { // 画面の釦で進む（検証の口でなく、人が押すのと同じ道）
    const btn = () => o.p.evaluate(() => (document.querySelector('.iconbtn--stage') || {}).textContent || null)
    const labels = []; for (let i = 0; i < 3; i++) { labels.push(await btn()); await o.p.locator('.iconbtn--stage').click({ force: true }).catch(() => {}); await o.p.waitForTimeout(i === 2 ? 3000 : 1800) }
    const m1 = await o.p.evaluate(() => window.__town3dNav()); labels.push(await btn())
    await o.p.locator('.iconbtn--stage').click({ force: true }).catch(() => {}); await o.p.waitForTimeout(3500)
    const m2 = await o.p.evaluate(() => window.__town3dNav())
    check('K2', labels.join('→') === '窓をあける→乗り出す→空へ→地上へ' && !!m1 && m1.mode === 'fly' && m1.kamoNav && !!m2 && m2.mode === 'walk' && !o.errs.length, `釦 ${labels.join('→')}・空へ後 ${m1 && m1.mode}・地上へ後 ${m2 && m2.mode}（${m2 && m2.place}）・エラー ${o.errs.length}`)
  }
  if (run('K6')) { const d = await o.p.evaluate(() => window.__town3dDraw()); check('K6', d && d.calls < 600, `町の3Dの舞台の描く呼び出し ${d && d.calls}（600 未満で合格）`) }
  void st; await o.ctx.close()
}
if (run('K3')) {
  const o = await open('autumn-dusk-corner-room', { block: true })
  const k = await kamoInfo(o.p)
  check('K3', o.ok && !k && !o.errs.filter((e) => !/kamo\/|Failed to load resource/.test(e)).length, `組めた ${o.ok}・鴨川 ${k === 'no-hook' ? '検証の口が無い（町の3Dが組めなかった）' : k ? '有り' : '無し'}・エラー ${o.errs.length}${o.errs.length ? '（' + o.errs[0] + '）' : ''}`)
  await o.ctx.close()
}
if (run('K4')) {
  const o = await open('autumn-dusk-corner-room', { q: 'kamo=0' })
  const k = await o.p.evaluate(() => window.__town3dKamo())
  check('K4', o.ok && !k && !o.errs.length, `組めた ${o.ok}・鴨川 ${k ? '有り' : '無し'}・エラー ${o.errs.length}`)
  await o.ctx.close()
}
if (run('K5')) {
  for (const id of ['kitaterao-window-3d', 'shishigaya-window-3d']) {
    const o = await open(id)
    const k = await o.p.evaluate(() => window.__town3dKamo())
    const st = await o.p.evaluate(() => window.__town3dStats())
    check('K5', o.ok && !k && !o.errs.length && st.flyable === true, `${id}: 組めた ${o.ok}・鴨川 ${k ? '有り' : '無し'}・飛べる ${st && st.flyable}・エラー ${o.errs.length}`)
    await o.ctx.close()
  }
}
if (run('K7')) {
  const o = await open('winter-snow-dusk-corner-room', { view: [0, 0.45], win: 'lean' })
  const png = await o.p.screenshot({ clip: { x: 560, y: 20, width: 160, height: 60 } })
  const lum = await o.p.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; return s / (d.length / 4) }, png.toString('base64'))
  check('K7', lum >= 0.25, `雪の夕の見上げた空の明るさ ${lum.toFixed(3)}（0.25 以上で合格）`)
  await o.ctx.close()
}
if (run('K8')) {
  const r = {}
  for (const [name, dev] of [['iphone', { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['pc', { viewport: { width: 1280, height: 720 } }]]) {
    const o = await open('autumn-dusk-corner-room', { dev }); const k = await kamoInfo(o.p); r[name] = k && k !== 'no-hook' ? (k.low ? 'low' : 'normal') + '/' + k.navDec : null; await o.ctx.close()
  }
  check('K8', r.iphone === 'low/2' && r.pc === 'normal/1', `段／歩く高さの網の間引き: iPhone ${r.iphone}（low/2）・PC ${r.pc}（normal/1）`) // 【便19】網の間引きを足した
}
// ── 便19: 飛ぶ・歩く ──
const sampleWhile = async (p, ms, fn) => { const out = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { out.push(await p.evaluate(fn)); await p.waitForTimeout(150) } return out }
if (run('K9') || run('K10') || run('K11') || run('K12')) {
  const o = await open('autumn-dusk-corner-room')
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2500) // 飛ぶと道案内の表が組まれる
  const S = (x, z, yaw, feet) => o.p.evaluate(([a, b2, c, d]) => window.__town3dWalkPose(a, b2, c, d), [x, z, yaw, feet])
  if (run('K9')) { // 窓の真下からデルタへ向かう線で、最初の水の 12m 手前から、水へ向かって 6 秒歩く
    const w = await o.p.evaluate(() => { const b0 = window.__town3dNav().bound, cx = (b0.xMax - b0.x) / 2, cz = (b0.zMin + b0.zMax) / 2, x0 = 0, z0 = 22, L = Math.hypot(cx - x0, cz - z0), ux = (cx - x0) / L, uz = (cz - z0) / L
      for (let d = 0; d < L; d += 0.5) if (window.__town3dNavAt(x0 + ux * d, z0 + uz * d).wet) return { x: x0 + ux * d, z: z0 + uz * d, ux, uz }; return null })
    if (!w) check('K9', false, '水が見つからない')
    else {
      const sx = w.x - w.ux * 12, sz = w.z - w.uz * 12, yaw = Math.atan2(w.ux, -w.uz)
      await S(sx, sz, yaw); await o.p.waitForTimeout(600)
      await o.p.evaluate(() => window.__town3dMove(0, 1))
      const tr = await sampleWhile(o.p, 6000, () => { const n = window.__town3dNav(); return { x: n.x, z: n.z, wet: n.wet } })
      await o.p.evaluate(() => window.__town3dMove(0, 0))
      const last = tr[tr.length - 1], wetN = tr.filter((q) => q.wet).length, gone = Math.hypot(last.x - sx, last.z - sz)
      const toEdge = await o.p.evaluate(([x, z]) => { for (let r = 0.25; r <= 8; r += 0.25) for (let a = 0; a < 48; a++) if (window.__town3dNavAt(x + Math.cos(a / 48 * 6.2832) * r, z + Math.sin(a / 48 * 6.2832) * r).wet) return r; return 99 }, [last.x, last.z]) // 止まった所から一番近い水まで（壁に沿って横へ滑っても測れる）
      check('K9', wetN === 0 && gone > 9 && toEdge < 3, `水の上にいたこま ${wetN}・進んだ ${gone.toFixed(1)}m（9m より先で合格）・止まった所から一番近い水まで ${toEdge.toFixed(1)}m（3m 未満で合格）`)
    }
  }
  if (run('K10')) { // 窓の真下から、6〜14m 先に壁がある方位へ 4 秒歩く
    const w = await o.p.evaluate(() => { for (let a = 0; a < 16; a++) { const yaw = a / 16 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw); for (let d = 0; d < 30; d += 0.25) { const q = window.__town3dNavAt(0 + hx * d, 22 + hz * d); if (q.blocked) { if (d >= 6 && d <= 14) return { yaw, d, hx, hz }; break } } } return null })
    if (!w) check('K10', false, '壁の方位が見つからない')
    else {
      await S(0, 22, w.yaw); await o.p.waitForTimeout(600); await o.p.evaluate(() => window.__town3dMove(0, 1))
      const tr = await sampleWhile(o.p, 4000, () => { const n = window.__town3dNav(); return { x: n.x, z: n.z, blocked: n.blocked } })
      await o.p.evaluate(() => window.__town3dMove(0, 0))
      const last = tr[tr.length - 1], inN = tr.filter((q) => q.blocked).length, along = (last.x - 0) * w.hx + (last.z - 22) * w.hz
      check('K10', inN === 0 && along > w.d - 2.5 && along < w.d, `建物の中にいたこま ${inN}・壁まで ${w.d}m の方位へ ${along.toFixed(1)}m 進んで止まった（${(w.d - 2.5).toFixed(1)}〜${w.d}m で合格）`)
    }
  }
  if (run('K11')) { // 水の上にある橋の床の所から、床の続く向きを探し、床の手前の端から向こうへ 8 秒歩く
    const w = await o.p.evaluate(() => { const A = window.__town3dNavAt, b0 = window.__town3dNav().bound, cx = (b0.xMax - b0.x) / 2, cz = (b0.zMin + b0.zMax) / 2
      for (let x = cx - 300; x <= cx + 300; x += 4) for (let z = cz - 300; z <= cz + 300; z += 4) { const q = A(x, z); if (q.deck === null || !q.wet) continue
        let best = null; for (let a = 0; a < 16; a++) { const yaw = a / 16 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw); let f = 0, bk = 0; while (f < 200 && A(x + hx * (f + 1), z + hz * (f + 1)).deck !== null) f++; while (bk < 200 && A(x - hx * (bk + 1), z - hz * (bk + 1)).deck !== null) bk++; if (!best || f + bk > best.len) best = { yaw, hx, hz, f, bk, len: f + bk } }
        if (best && best.len > 25) { const sx = x - best.hx * (best.bk - 2), sz = z - best.hz * (best.bk - 2); return { sx, sz, yaw: best.yaw, len: best.len, deck: A(sx, sz).deck } } }
      return null })
    if (!w) check('K11', false, '橋が見つからない')
    else {
      await S(w.sx, w.sz, w.yaw, w.deck); await o.p.waitForTimeout(600); await o.p.evaluate(() => window.__town3dMove(0, 1))
      const tr = await sampleWhile(o.p, 8000, () => { const n = window.__town3dNav(); const q = window.__town3dNavAt(n.x, n.z); return { x: n.x, y: n.y, z: n.z, wet: q.wet, deck: q.deck } })
      await o.p.evaluate(() => window.__town3dMove(0, 0))
      const wetOn = tr.filter((q) => q.wet), offDeck = wetOn.filter((q) => q.deck === null || Math.abs(q.y - 1.6 - q.deck) > 0.6), last = tr[tr.length - 1], gone = Math.hypot(last.x - w.sx, last.z - w.sz)
      check('K11', wetOn.length >= 3 && offDeck.length === 0 && gone > 20, `橋の長さ ${w.len}m・水の上を渡ったこま ${wetOn.length}（3 以上）・床の高さから外れたこま ${offDeck.length}（0）・進んだ ${gone.toFixed(1)}m（20m より先）`)
    }
  }
  if (run('K12')) { // 背の高い建物（地面から 15m 以上）を探し、その 40m 手前・地面から 6m の高さに置いて、建物へ向けて巡航で 12 秒飛ぶ
    const w = await o.p.evaluate(() => { const A = window.__town3dNavAt; for (let x = -150; x <= 150; x += 6) for (let z = -150; z <= 150; z += 6) { const q = A(x, z); if (q.blocked && q.top - q.ground > 15) { const yaw = Math.atan2(x - 0, -(z - 22)); const hx = Math.sin(yaw), hz = -Math.cos(yaw); return { x, z, h: q.top - q.ground, sx: x - hx * 40, sz: z - hz * 40, yaw, g: A(x - hx * 40, z - hz * 40).ground } } } return null })
    if (!w) check('K12', false, '背の高い建物が見つからない')
    else {
      await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(800) // 歩く形から空へ戻す（飛ぶ姿勢の口は窓辺の時だけ飛ぶ形へ替える）
      await o.p.evaluate(([x, y, z, yaw]) => { window.__town3dFlyPose(x, y, z, yaw, 0); window.__town3dCruise(true) }, [w.sx, w.g + 6, w.sz, w.yaw])
      const tr = await sampleWhile(o.p, 12000, () => { const n = window.__town3dNav(); const q = window.__town3dNavAt(n.x, n.z), c = window.__town3dNavAt(n.cam[0], n.cam[2]); return { y: n.y, top: q.top, cy: n.cam[1], ctop: c.top, x: n.x, z: n.z } })
      const minSelf = Math.min(...tr.map((q) => q.y - q.top)), minCam = Math.min(...tr.map((q) => q.cy - q.ctop)), last = tr[tr.length - 1], gone = Math.hypot(last.x - w.sx, last.z - w.sz)
      check('K12', minSelf >= 1 && minCam >= 0.5 && gone > 40, `建物の高さ ${w.h.toFixed(1)}m・自分と下の物の間 最小 ${minSelf.toFixed(2)}m（1m 以上）・カメラと下の物の間 最小 ${minCam.toFixed(2)}m（0.5m 以上）・進んだ ${gone.toFixed(1)}m（40m より先＝建物を越えた）`)
    }
  }
  await o.ctx.close()
}
if (run('K13')) {
  const r = {}
  const IPH = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
  for (const [name, dev, q] of [['iphone', IPH, ''], ['pc', { viewport: { width: 1280, height: 720 } }, ''], ['iphone-kamo0', IPH, 'kamo=0']]) {
    const o = await open('autumn-dusk-corner-room', { dev, q }); const n = await o.p.evaluate(() => window.__town3dNav()); r[name] = n ? n.yaw : null; await o.ctx.close()
  }
  check('K13', r.iphone === 0 && r.pc === -0.6 && r['iphone-kamo0'] === -1.12, `最初の見回しの横: iPhone の縦 ${r.iphone}（0）・PC ${r.pc}（-0.6）・?kamo=0 の iPhone ${r['iphone-kamo0']}（-1.12）`)
}
if (run('K14')) {
  const o = await open('autumn-dusk-corner-room', { dev: { viewport: { width: 1920, height: 1080 } }, view: [0, -1.1], win: 'lean' })
  const png = await o.p.screenshot()
  const pct = await o.p.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const y0 = Math.floor(img.height / 3), d = x.getImageData(0, y0, img.width, img.height - y0).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) <= 3) k++; return k / (d.length / 4) * 100 }, png.toString('base64'))
  check('K14', pct < 0.5, `乗り出して見下ろした画の真っ黒の画素 ${pct.toFixed(3)}%（0.5% 未満で合格・前は 3.442%）`)
  await o.ctx.close()
}
if (run('K15')) {
  const o = await open('summer-morning-corner-room')
  const k = await kamoInfo(o.p)
  check('K15', !!k && k !== 'no-hook' && k.waveTop20 !== null && k.waveTop20 <= 40 && k.waterRot === true, `水面の凹凸の図の上位 20 本の波の力 ${k && k.waveTop20}%（40% 以下で合格・前は 100%）・読む向きを回す差し替え ${k && k.waterRot}（true）・図を作った時間 ${k && k.waterMs}ms`)
  await o.ctx.close()
}
if (run('K16')) { // 窓から空へ出てすぐ地上へ降りる（今の真下に降りる）
  const o = await open('autumn-dusk-corner-room')
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600)
  await o.p.evaluate(() => window.__town3dLand(true)); await o.p.waitForTimeout(2500)
  const r = await o.p.evaluate(() => { const n = window.__town3dNav(), A = window.__town3dNavAt; let sum = 0; for (let a = 0; a < 8; a++) { const yaw = a / 8 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw); let d = 1.0; for (; d < 24; d += 1.6) { const q = A(n.x + hx * d, n.z + hz * d); if (q.blocked || q.wet) break } sum += d } const q = A(n.x, n.z); return { mode: n.mode, avg: sum / 8, wet: q.wet, blocked: q.blocked, x: n.x, z: n.z } })
  check('K16', r.mode === 'walk' && r.avg >= 15 && !r.wet && !r.blocked, `降りた所 (${r.x}, ${r.z})・8方位の抜けの平均 ${r.avg.toFixed(1)}m（15m 以上で合格・前は窓の真下の路地 6.8〜11m）・水 ${r.wet}・建物 ${r.blocked}`)
  await o.ctx.close()
}
if (run('K17')) { // 部屋の窓の所を塞ぐ壁が、窓辺では出ず、空と地上では出て、窓辺へもどると消える（塞ぐ壁の見える状態を読む）
  // 【便19】前は塞ぐ壁あり・なしの2枚の画の差で測ったが、2枚を別のこまで撮るので水と木の揺れだけで差が出て、塞がない形でも合格した（外し回し M10）。
  //   状態で測る形に替えた。塞いだ所の画は docs/qa/2026-11-03_便19/shots/c-facade.png と c-facade-noplug.png
  const o = await open('summer-morning-corner-room', { dev: { viewport: { width: 1280, height: 720 } } })
  const st = async () => { const k = await kamoInfo(o.p); return k && k !== 'no-hook' ? k.plugShown : null }
  const win = await st()
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600); const fly = await st()
  await o.p.evaluate(() => window.__town3dLand(true)); await o.p.waitForTimeout(2600); const walk = await st()
  await o.p.evaluate(() => window.__town3dFly(false)); await o.p.waitForTimeout(2600); const back = await st()
  check('K17', win === false && fly === true && walk === true && back === false, `塞ぐ壁: 窓辺 ${win}（false）・空 ${fly}（true）・地上 ${walk}（true）・窓辺へもどった後 ${back}（false）`)
  await o.ctx.close()
}
if (run('K18')) { // 北寺尾の時代の島（江戸・大正・戦国）と同じ所を鴨川の町で飛ぶ
  const o = await open('autumn-dusk-corner-room')
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600)
  const res = []
  // 【便19】霞の帯は島の中心から 230×(1−0.44)＝約 129m の縁で一番濃く出る（town3dViewer の pk）。前は中心に置いていて、帯を鴨川でも出す形でも合格した（外し回し M11）＝縁に置く形に替えた
  for (const [nm, x, z] of [['江戸', 640 - 129, -46], ['大正', -640 + 129, -30], ['戦国', 140, -640 + 129]]) {
    await o.p.evaluate(([px, pz]) => window.__town3dFlyPose(px, 60, pz, 0, 0), [x, z]); await o.p.waitForTimeout(3000)
    res.push(await o.p.evaluate((nm2) => { const op = (c) => { const e = document.querySelector('.' + c); return e ? +(+getComputedStyle(e).opacity).toFixed(3) : 0 }; return { nm: nm2, veil: op('town3d-veil'), era: op('town3d-era'), haze: op('town3d-cloudhaze'), rainbow: op('town3d-rainbow'), pill: (document.querySelector('.modepill') || {}).textContent || '', place: window.__town3dNav().place } }, nm))
  }
  const bad = res.filter((r) => Math.max(r.veil, r.era, r.haze, r.rainbow) > 0.01 || /城下町|港町|雲海|海の上/.test(r.place + r.pill))
  check('K18', bad.length === 0, res.map((r) => `${r.nm}の所: 層 ${Math.max(r.veil, r.era, r.haze, r.rainbow)}・居場所 ${r.place}`).join('／') + '（層 0.01 以下・居場所が鴨川の名で合格）')
  await o.ctx.close()
}
// ── 便20 ──
const life = (p) => p.evaluate(() => (window.__town3dKamoLife ? window.__town3dKamoLife() : 'no-hook'))
if (run('K19')) {
  const o = await open('spring-dusk-corner-room')
  const l = await life(o.p), k = await kamoInfo(o.p)
  const o2 = await open('spring-dusk-corner-room', { q: 'kamolife=0' }), l2 = await life(o2.p), k2 = await kamoInfo(o2.p)
  const chains = l && l.chains ? l.chains.filter((n) => n >= 5).length : 0
  check('K19', !!l && l !== 'no-hook' && l.sitters >= 20 && chains >= 2 && !!l.train && l.kites === 2 && l.herons >= 1 && !!k2 && k2 !== 'no-hook' && l2 === null && (k.lifeMs || 0) <= 200 && !o.errs.length && !o2.errs.length, `座る人 ${l && l.sitters}・飛び石の列 ${l && JSON.stringify(l.chains)}・電車 ${l && l.train ? l.train.mode : '無し'}・トビ ${l && l.kites}・アオサギ ${l && l.herons}・組むまで ${k && k.lifeMs}ms・描く呼び出し ${k && k.calls}（kamolife=0 は ${k2 && k2.calls}・動く物 ${JSON.stringify(l2)}）・エラー ${o.errs.length + o2.errs.length}`)
  await o.ctx.close(); await o2.ctx.close()
}
if (run('K20') || run('K21')) {
  if (run('K20')) {
    const o = await open('summer-night-corner-room')
    const l0 = await life(o.p), ok = l0 && l0.okuribi
    const names = ok ? ok.names.join(',') : '', beds = ok ? ok.orderBy.map((r) => r[2]).join(',') : '', mins = ok ? ok.orderBy.map((r) => r[0]) : []
    const seq = mins.length === 6 && mins[0] < 5 && mins[1] >= 25 && mins[2] >= 25 && mins[3] >= 50 && mins[4] >= 75 && mins[5] >= 100 && mins[3] > Math.max(mins[1], mins[2]) && mins[4] > mins[3] && mins[5] > mins[4]
    await o.p.evaluate(() => window.__town3dKamoEv('okuribi'))
    await o.p.waitForFunction(() => { const x = window.__town3dKamoLife(); return x && x.okuribi && x.okuribi.t >= 12 }, null, { timeout: 90000 }).catch(() => {})
    const l1 = await life(o.p), lb = l1 && l1.okuribi ? l1.okuribi.litBy : []
    check('K20', names === 'daimonji,myo,ho,funa,hidari,torii' && beds === '75,103,63,79,53,108' && seq && lb[0] > 10 && lb.slice(1).every((v) => v === 0) && !o.errs.length, `並び ${names}・火床 ${beds}・点く時刻の早い所 ${mins.join(',')} 秒・点けて ${l1 && l1.okuribi && l1.okuribi.t} 秒の灯り ${JSON.stringify(lb)}・エラー ${o.errs.length}`)
    await o.ctx.close()
  }
  if (run('K21')) { const o = await open('autumn-dusk-corner-room'); const l = await life(o.p); check('K21', !!l && l !== 'no-hook' && l.okuribi === null, `秋の夕の送り火 ${l && JSON.stringify(l.okuribi)}（null で合格）`); await o.ctx.close() }
}
if (run('K22')) {
  const o = await open('summer-night-corner-room')
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600)
  const at = async (X, Y, Z) => { try { return await at0(X, Y, Z) } catch (e) { return { river: -1, crowd: -1, sta: -1, sent: null, err: e.message } } } // 【便20・外の目】口が無い時も「×」の行を残す
  const at0 = async (X, Y, Z) => { await o.p.evaluate(([X, Y, Z]) => { const e = window.__town3dKamoTown(X, Z, Y); window.__town3dFlyPose(e.x, e.y, e.z, 0, 0) }, [X, Y, Z]); await o.p.waitForTimeout(2500); const a = (await life(o.p)).amb, s = await o.p.evaluate(() => window.__town3dAmb()); return { ...a, sent: s } }
  const L = await o.p.evaluate(() => fetch('kamo/life.json').then((r) => r.json()))
  const water = await at(-60, -2, 40), masu = await at(L.masugata[4], 1.5, L.masugata[5]), sta = await at(L.eiden.sta.x, 2, L.eiden.sta.z), high = await at(-60, 160, 40)
  // 音の部品へ流した値（海・川・人だまり・祭り・駅…）も同じ所で見る（動く物の側で測れていても、町の3Dが流していなければ鳴らない）
  const sentOk = water.sent && water.sent[1] >= 0.3 && masu.sent && masu.sent[2] >= 0.3 && sta.sent && sta.sent[4] >= 0.3 && high.sent && high.sent[1] < 0.05
  check('K22', water.river >= 0.3 && masu.crowd >= 0.3 && sta.sta >= 0.3 && high.river < 0.05 && sentOk, `水の上 川 ${water.river}（流した ${water.sent && water.sent[1]}）・商店街 気配 ${masu.crowd}（${masu.sent && masu.sent[2]}）・駅 駅 ${sta.sta}（${sta.sent && sta.sent[4]}）（それぞれ 0.3 以上）・高い空 川 ${high.river}（${high.sent && high.sent[1]}・0.05 未満）`)
  await o.ctx.close()
}
if (run('K23')) {
  const o = await open('spring-dusk-corner-room')
  const before = (await life(o.p)).sounds || 0, sent0 = await o.p.evaluate(() => (window.__town3dKamoSounds ? window.__town3dKamoSounds().tobi || 0 : -1))
  const r = await o.p.evaluate(() => { const out = []; try { window.__audio.playEvent('tobi', { amt: 1, pan: 0.4 }); window.__audio.playEvent('eiden', { amt: 1, pan: -0.3, dep: true }); window.__audio.playEvent('eiden', { amt: 0.2 }); out.push('ok') } catch (e) { out.push('ERR ' + e.message) } out.push(window.__town3dKamoEv('tobi')); return out })
  await o.p.waitForTimeout(1500)
  const after = (await life(o.p)).sounds || 0, sent1 = await o.p.evaluate(() => (window.__town3dKamoSounds ? window.__town3dKamoSounds().tobi || 0 : -1))
  // 【便20・外の目】動く物の側で数えた数だけでなく、町の3Dが音の部品の口（onEvent）へ流した数も見る
  check('K23', r[0] === 'ok' && r[1] === 'ok' && after > before && sent0 >= 0 && sent1 > sent0 && !o.errs.length, `音を鳴らす ${r[0]}・トビを起こす ${r[1]}・鳴らした数 ${before} → ${after}・音の部品へ流した数 ${sent0} → ${sent1}・エラー ${o.errs.length}`)
  await o.ctx.close()
}
if (run('K24')) {
  // 【便20・外の目】夏の夜は帯の出来事がもともと起きない（昼の物・冬の物）ので、帯の時計が進まないことを春の夕で見る。送り火の待ちが進むことは夏の夜で見る
  const o = await open('spring-dusk-corner-room', { dev: { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' } })
  const n1 = await o.p.evaluate(() => { const x = window.__town3dKamoLife(); return x ? x.bandNext : null })
  await o.p.waitForFunction(() => { const s = window.__town3dStats && window.__town3dStats(); return s && s.frames > 600 }, null, { timeout: 120000 }).catch(() => {})
  const l = await life(o.p)
  const o2 = await open('summer-night-corner-room', { dev: { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' } })
  const w1 = await o2.p.evaluate(() => { const x = window.__town3dKamoLife(); return x && x.okuribi ? x.okuribi.wait : null }); await o2.p.waitForTimeout(4000)
  const w2 = await o2.p.evaluate(() => { const x = window.__town3dKamoLife(); return x && x.okuribi ? x.okuribi.wait : null })
  const same = !!n1 && !!l && l !== 'no-hook' && JSON.stringify(l.bandNext) === JSON.stringify(n1)
  check('K24', same && Object.keys(l.ev).filter((k2) => k2 !== 'eiden').length === 0 && l.sitters > 0 && w1 !== null && w2 < w1, `動きを減らす: 帯の時計 ${JSON.stringify(n1)} → ${l && JSON.stringify(l.bandNext)}（進まない）・起きた出来事 ${l && JSON.stringify(l.ev)}・座る人 ${l && l.sitters}・夏の夜の送り火の待ち ${w1} → ${w2}（進む）`)
  await o.ctx.close(); await o2.ctx.close()
}
if (run('K25')) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' }), p = await ctx.newPage(), errs = []
  p.on('pageerror', (e) => errs.push('PE ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  await ctx.route('**/kamo/life.json', (r) => r.abort())
  await p.goto(`${BASE}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(800)
  await p.evaluate(() => window.__applyScene('summer-night-corner-room'))
  await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).catch(() => {})
  await p.waitForTimeout(1500)
  const k = await p.evaluate(() => window.__town3dKamo && window.__town3dKamo()), l = await p.evaluate(() => window.__town3dKamoLife && window.__town3dKamoLife())
  const real = errs.filter((e) => !/life.json|ERR_FAILED|net::/.test(e))
  check('K25', !!k && l === null && !real.length, `鴨川の町 ${k ? '有り' : '無し'}・動く物 ${JSON.stringify(l)}・エラー ${real.length}（読めなかった知らせ ${errs.length - real.length} は除く）`)
  await ctx.close()
}
await b.close()
const bad = results.filter((r) => !r.pass)
console.log(`検査 ${results.length} 本・外れ ${bad.length}`)
process.exit(bad.length ? 1 : 0)
