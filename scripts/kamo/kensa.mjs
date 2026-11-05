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
//   ~~K22 飛ぶ・歩く時の音の近さ: 水の上の低い所で川の瀬音、出町桝形商店街でまちの気配、出町柳駅で駅の音が満ち、高い空では川の音が消える（便20）~~（【便22】下の形に替えた。合成のざわめきと駅の唸りは車の走る音に聞こえたので鳴らさない＝裕也さんの頼み）
//   K22 飛ぶ・歩く時の音の近さ: 水の上の低い所で川の瀬音が満ち、出町桝形商店街と出町柳駅でも合成のざわめき・駅の唸りは 0 のまま（音の部品へ流す値も 0）、高い空では川の音が消える（便22）
//   K33 鴨川デルタの人の声: 夏の朝の窓辺でかすかに（0.05〜0.6）流し、デルタの上の低い所で満ち（0.6 以上）、東へ 1.2km で 0、雨の夜は 0。角部屋の情景の音の素材は自然の音だけで、虫・雨・川・ヒグラシ・風に低音切り（hp 150 以上）が付く（便22）
//   K23 鴨川の出来事の音（トビの声・叡山電車）を鳴らしてもエラーが無く、出来事を起こすと鳴らした数が増える（便20）
//   ~~K24 視差軽減（動きを減らす設定）では、送り火も時々の出来事も起きない（座る人と電車はいつもの景色として居る）（便20）~~（【便20・外の目】下の形に替えた）
//   K24 視差軽減（動きを減らす設定）では、時々の出来事の帯（飛び石を渡る人・トビの声・ユリカモメ）の時計が進まず、出来事が起きない。送り火（ゆっくり点く遠い火）は灯るまでの待ちが進む（便20）
//   K27 浅瀬の水: 川底が透ける水の差し替えが効き、夏の朝は川底の光の網があり、飛び石に亀（3 以上）・千鳥（2 以上）・すれ違いの石（2 以上）があって、渡る石が列の線から 0.1〜0.4m 左右へずれている（便21）
//   K28 空: 夏の朝と夏の夜と秋の雨の夜に雲の層がある（便21）
//   K29 家並み: 町家 1,000 棟以上・古民家 1,500 棟以上・通り庇と犬矢来 5,000 三角形以上・京大の赤茶の建物 50 棟以上・吉田神社の社 10 棟以上（便21）
//   K30 橋と灯り: 賀茂大橋の石灯籠がちょうど 14 基・欄干 10 本以上・街灯 500 以上（便21）
//   K31 河川敷の人: 夏の朝は歩く・走る・自転車が 15 人以上いて 2 秒で動き、浅瀬の子ども 4 人以上・飛び石に座る学生 3 人以上。夏の夜はデルタの花火の人 6 人以上で火花が出る。冬の雪の夕は水遊びも花火も無い（便21）
//   K32 名所: 時計塔・正門・大元宮・茂庵がある・鳥居 15 基以上・ベンチ 100 以上・遊具 3・東屋 1 以上（便21）
//   K34 外の町: 鴨川の角部屋を開くと外の町（金閣寺・京都駅・祇園まで）を裏で読んで組む（建物の箱 10 万以上・木 3 万以上・道 5,000 本以上・水面 1 万三角形以上・名所 6 つ）。鴨川の町の網の外の崩れた水面を落とし、低い霧が 0・エラーと GL 0（便22）
//   K35 外の町へ飛べる: 金閣寺・京都タワー・京都駅・祇園・八坂の塔・南の鴨川が飛べる箱の中で、居場所の名が合い、京都タワーの頂は地面から 125m 以上・金閣は建物の当たり・南の鴨川は水（便22）
//   K36 外の町の地面: 外の町の中の地面の高さが外の町の網と合い（祇園は原点より低い・金閣寺は 40m 以上高い）、四条大橋の床の上は水の上でも歩ける（便22）
//   K37 外の町を読めない時（データを止めた時・?kamoouter=0）は、鴨川の町だけで開き、飛べる箱は鴨川の町のまま・エラー 0（便22）
//   K38 iPhone の画面（402×874・指で触る＝軽い段）でも外の町を組めて、エラーと GL 0・木は PC の半分ほど（便22・iPhone の段の地形の間引きで NaN が出た）
//   K39 情景を替えても前の町がメモリに残らない: 鴨川の角部屋（外の町まで）→ 北寺尾 → 鴨川の角部屋 → 北寺尾 と替え、2回目の北寺尾の JS のメモリ（GC の後）が1回目より 200MB 以上増えない（便22・three の使い回しの図と検証の口が前の町を掴み、1回 約 250MB ずつ増えて全テストがメモリ不足で止められた）
//   K40 南の四角（便23）: 鴨川の角部屋を開くと、南の四角（河原町・木屋町・先斗町・祇園・南の鴨川の岸）を裏で読んで外の町より先に足す（建物の三角形 30 万以上・水面 1 万三角形以上・木 2,000 以上・道の点 5 万以上・ベンチ 100 以上・高瀬川などの細い水路 10 本以上）。外の町はその中の箱 1 万以上・木・道・水・地形を抜く。エラーと GL 0
//   K41 南の四角の焼いた光: 南の建物と地形は南の図（lm_bldg2・lm_terrain2）、北の建物は北の図（lm_bldg）を使う（便23）
//   K42 北と南の継ぎ目（z 904）: 継ぎ目の北 4m と南 20m（合わせる時に 16m でなめらかにつないだ所の外）の地面の高さの差が 1m 未満（東西 5 か所・東 −90 は鴨川の中。東 ±600 と 300 は元の地形の坂と窪み）・継ぎ目の上で道案内が網の縁と見なさない（便23）
//   K43 ?kamosouth=0 の時は南の四角を足さず、外の町は前と同じ（箱 15 万以上・抜いた箱 0）。エラー 0（便23）
//   K44 南の四角の居場所の名: 先斗町・木屋町・河原町・祇園・南の鴨川の上（水）（便23）
//   K45 映り込みの鏡（便23）: 南の鴨川（三条の南）の上で目を水面の 6m 上に置くと、映り込みの鏡の高さがその所の水面（−15〜−20m）に合う（北の四角の窓辺の時は前と同じ −4.56m）。前は北の水面の高さのままで、南の川の映り込みに地面が写った
//   K46 南の鴨川の水面に段が無い（便23）: 継ぎ目の南（東 −90・南北 860〜1000m）で、下流へ 20m ごとの水面の上がりが 1m 未満（標高の欠けで、下流が上流より 4m 高い所があった）
//   K47 ?kamoouter=0（外の町を読まない）でも南の四角を足し、継ぎ目の南（南北 924m）と先斗町を道案内が網の縁と見なさない＝歩いて入れる。エラー 0（便23）
//   K25 動く物の表（life.json）が読めない時も、鴨川の町はそのまま開く（動く物が無いだけ・エラー無し）（便20）
//   K26 鴨川のデータを読んでいる途中で別の情景へ替えても、舞台は1枚だけ（読み終わるまで前の舞台が残らない）（便20・GitHub のスモーク 41749226137）
// 町の3Dが組めずに検証の口が無い時も、落ちた理由を「×」の行で残す（外し回しの記録に理由が残るように）
import { chromium } from 'playwright'
const PORT = process.env.PORT || 4961, BASE = `http://localhost:${PORT}/seasons/`
const want = new Set(process.argv.slice(2))
const run = (k) => !want.size || want.has(k)
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const results = []
const kamoInfo = (p) => p.evaluate(() => (window.__town3dKamo ? window.__town3dKamo() : 'no-hook'))
async function open(scene, { q = '', block = false, view = null, win = null, dev = null, blockOuter = false } = {}) {
  const ctx = await b.newContext({ ...(dev || { viewport: { width: 1280, height: 720 } }), serviceWorkers: 'block' }) // service worker を止める（止めないと読み込みの網を通らずに取りに行く＝K3 が測れない）
  const p = await ctx.newPage()
  const errs = [], gl = []
  p.on('pageerror', (e) => errs.push('PE ' + e.message))
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t.slice(0, 200)); if (/GL_INVALID|INVALID_OPERATION/.test(t)) gl.push(t.slice(0, 160)) })
  if (block) await ctx.route('**/kamo/**', (r) => r.abort())
  if (blockOuter) await ctx.route('**/kamo/outer/**', (r) => r.abort()) // 【便22】外の町のデータだけ止める
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
    const w = await o.p.evaluate(() => { const d0 = window.__town3dKamoTown(0, 0), cx = d0.x, cz = d0.z /* 【便21】飛べる箱は東へ広げた範囲の中ほどになったので、デルタ（鴨川の原点）を町の3Dの座標で引く */, x0 = 0, z0 = 22, L = Math.hypot(cx - x0, cz - z0), ux = (cx - x0) / L, uz = (cz - z0) / L
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
    const w = await o.p.evaluate(() => { const A = window.__town3dNavAt, d0 = window.__town3dKamoTown(0, 0), cx = d0.x, cz = d0.z /* 【便21】デルタ（鴨川の原点）のまわりで探す */
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
  const sentOk22 = water.sent && water.sent[1] >= 0.3 && masu.sent && masu.sent[2] === 0 && sta.sent && sta.sent[4] === 0 && high.sent && high.sent[1] < 0.05 // 【便22】
  void sentOk
  check('K22', water.river >= 0.3 && masu.crowd === 0 && sta.sta === 0 && high.river < 0.05 && sentOk22, `水の上 川 ${water.river}（流した ${water.sent && water.sent[1]}）・商店街 気配 ${masu.crowd}（${masu.sent && masu.sent[2]}）・駅 駅 ${sta.sta}（${sta.sent && sta.sent[4]}）（川は 0.3 以上・気配と駅は 0）・高い空 川 ${high.river}（${high.sent && high.sent[1]}・0.05 未満）`)
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
if (run('K33')) { // 【便22】鴨川デルタの人の声と、角部屋の音の素材
  const o = await open('summer-morning-corner-room')
  const w = (await life(o.p)).amb, ws = await o.p.evaluate(() => window.__town3dAmb())
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600)
  const at = async (X, Y, Z) => { await o.p.evaluate(([X, Y, Z]) => { const e = window.__town3dKamoTown(X, Z, Y); window.__town3dFlyPose(e.x, e.y, e.z, 0, 0) }, [X, Y, Z]); await o.p.waitForTimeout(2500); return { ...(await life(o.p)).amb, sent: await o.p.evaluate(() => window.__town3dAmb()) } }
  const near = await at(-66, 6, 70), far = await at(1150, 20, 40)
  await o.ctx.close()
  const r = await open('autumn-rain-night-corner-room'), rw = (await life(r.p)).amb; await r.ctx.close()
  // 情景データの音の素材（角部屋＝鴨川の町）: 自然の音の素材だけで、低い唸りのある素材には低音切り
  const NAT = /crickets|suzumushi|stream|leaves|rain.mp3|thunder|higurashi|uguisu|wind.mp3/, RUMBLE = /crickets|suzumushi|stream|rain.mp3|higurashi|wind.mp3/
  const ids = ['autumn-dusk', 'autumn-rain-night', 'summer-morning', 'spring-dusk', 'spring-morning', 'winter-snow-dusk', 'summer-night'].map((n) => n + '-corner-room')
  const bad = []
  for (const id of ids) { const sc = (await import('../../src/data/scenes/' + id + '.js')).default; for (const d of sc.sounds) { if (!NAT.test(d.src)) bad.push(id + ':' + d.src); else if (RUMBLE.test(d.src) && !(d.hp >= 150)) bad.push(id + ':' + d.id + ' hp ' + d.hp) } if (!sc.sounds.some((d) => /leaves/.test(d.src))) bad.push(id + ':木々なし') }
  check('K33', w && w.voice >= 0.05 && w.voice <= 0.6 && ws && ws[7] >= 0.05 && near.voice >= 0.6 && near.sent && near.sent[7] >= 0.6 && far.voice === 0 && rw && rw.voice === 0 && !bad.length && !o.errs.length && !r.errs.length, `窓辺 ${w && w.voice}（流した ${ws && ws[7]}）・デルタの上 ${near.voice}（${near.sent && near.sent[7]}）・東へ 1.2km ${far.voice}・雨の夜 ${rw && rw.voice}・素材の外れ ${bad.length ? bad.join(' ') : 'なし'}・エラー ${o.errs.length + r.errs.length}`)
}
// 【便22】外の町
const outerWait = (p) => p.waitForFunction(() => window.__town3dKamo && window.__town3dKamo() && window.__town3dKamo().outer, null, { timeout: 90000 }).then(() => true).catch(() => false)
const navAt = (p, X, Y, Z) => p.evaluate(async ([X, Y, Z]) => { const e = window.__town3dKamoTown(X, Z, Y); window.__town3dFlyPose(e.x, e.y, e.z, 0, 0); await new Promise((r) => setTimeout(r, 700)); const n = window.__town3dNav(); return { place: n.place, ground: n.ground, top: n.top, wet: n.wet, blocked: n.blocked, inBound: e.x >= -n.bound.x && e.x <= (n.bound.xMax || n.bound.x) && e.z >= n.bound.zMin && e.z <= n.bound.zMax } }, [X, Y, Z])
if (run('K34') || run('K35') || run('K36')) {
  const o = await open('summer-morning-corner-room')
  const got = await outerWait(o.p), k = await kamoInfo(o.p), O = k && k.outer, mist = await o.p.evaluate(() => (window.__town3dMist ? window.__town3dMist().applied[3] : -1))
  if (run('K34')) check('K34', got && O && O.boxes >= 100000 && O.trees >= 30000 && O.roads >= 5000 && O.water >= 10000 && O.meisho && Object.values(O.meisho).every(Boolean) && Object.keys(O.meisho).length === 6 && k.waterOut === 0 && O.waterCut === 0 && mist === 0 && !o.errs.length && !o.gl.length, `組めた ${got}・箱 ${O && O.boxes}・木 ${O && O.trees}・道 ${O && O.roads}・水面 ${O && O.water}・名所 ${O && JSON.stringify(O.meisho)}・四角の和の外の水面 ${k && k.waterOut}（0＝五条まで延びた崩れた水面が無い。便23 で北の水面を北の四角で切った）・外の町を足す時に落とした水面 ${O && O.waterCut}（0＝北の水面に南の四角へ延びた三角形も無い）・低い霧 ${mist}・組む時間 ${O && O.ms}ms・エラー ${o.errs.length}・GL ${o.gl.length}`)
  if (run('K35') || run('K36')) {
    await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600)
    const kin = await navAt(o.p, -4022, 80, -1056), tow = await navAt(o.p, -1202, 60, 4709), sta = await navAt(o.p, -1280, 60, 4986), gion = await navAt(o.p, 459, 30, 2914), yas = await navAt(o.p, 616, 60, 3488), riv = await navAt(o.p, -60, 20, 2600)
    if (run('K35')) check('K35', [kin, tow, sta, gion, yas, riv].every((q) => q.inBound) && kin.place === '金閣寺' && sta.place === '京都駅' && gion.place === '祇園' && yas.place === '八坂の塔' && riv.place === '鴨川の上' && kin.blocked && riv.wet && !riv.blocked && tow.top - tow.ground >= 125, `箱の中 ${[kin, tow, sta, gion, yas, riv].map((q) => q.inBound ? 1 : 0).join('')}・居場所 ${[kin, sta, gion, yas, riv].map((q) => q.place).join('・')}・金閣の当たり ${kin.blocked}・南の鴨川 水 ${riv.wet} 当たり ${riv.blocked}・京都タワーの頂 ${(tow.top - tow.ground).toFixed(1)}m`)
    if (run('K36')) {
      // ~~四条大橋の床の上へ歩いて降りる（歩く形になったかだけを見ていた）~~（【便22・外の目 #2】床の高さを足の高さとして渡して歩かせ、足もとが床の高さか・川の地面より 3m 上かを見る）
      const water = await navAt(o.p, -60, 20, 2600)
      // 四条大橋（東 −88・南 2902）の西の端の近く（東 −112）の床の上に立たせ、東へ 5 秒歩く。水の上のこまで、足もと（目 − 1.6m）が床の高さから 0.6m 以内か
      const br = await o.p.evaluate(async () => { const e = window.__town3dKamoTown(-112, 2902, 0), t = window.__town3dKamoTown(-60, 2902, 0), d0 = window.__town3dNavAt(e.x, e.z).deck; if (d0 === null) return { mode: 'no-deck', on: 0, off: 0, wet: 0 }
        window.__town3dWalkPose(e.x, e.z, Math.atan2(t.x - e.x, -(t.z - e.z)), d0); await new Promise((r) => setTimeout(r, 900)); window.__town3dMove(0, 1)
        let on = 0, off = 0, wet = 0, mode = null; for (let i = 0; i < 25; i++) { await new Promise((r) => setTimeout(r, 200)); const n = window.__town3dNav(), q = window.__town3dNavAt(n.x, n.z); mode = n.mode; if (!q.wet) continue; wet++; if (q.deck !== null && Math.abs(n.y - 1.6 - q.deck) < 0.6) on++; else off++ }
        window.__town3dMove(0, 0); return { mode, on, off, wet } })
      // 【便22・外の目 #1】鴨川の町の範囲の縁の帯（縁から 14m・外の町の道案内で答える所）の地面が、50m 内側（鴨川の町の道案内）と続いている（前は 6m 下に沈んだ）
      const band = await navAt(o.p, -300, 30, 890), inner = await navAt(o.p, -300, 30, 850)
      check('K36', kin.ground - gion.ground > 40 && br.mode === 'walk' && br.wet >= 3 && br.off === 0 && Math.abs(band.ground - inner.ground) < 3, `金閣寺の地面 − 祇園の地面 ${(kin.ground - gion.ground).toFixed(1)}m（40 超）・四条大橋を東へ歩く ${br.mode}・水の上のこま ${br.wet}（3 以上）のうち床の上 ${br.on}・床から外れた ${br.off}（0）・川の地面 ${water.ground}・縁の帯の地面 ${band.ground} と内側 ${inner.ground}（差 3m 未満）`)
    }
  }
  await o.ctx.close()
}
if (run('K37')) {
  const a = await open('summer-morning-corner-room', { q: 'kamoouter=0' }); await a.p.waitForTimeout(6000); const ka = await kamoInfo(a.p); const ba = (await a.p.evaluate(() => { window.__town3dFly(true); return new Promise((r) => setTimeout(() => r(window.__town3dNav().bound), 2600)) })); await a.ctx.close()
  const c = await open('summer-morning-corner-room', { blockOuter: true }); await c.p.waitForTimeout(8000); const kc = await kamoInfo(c.p); await c.ctx.close()
  check('K37', ka && ka.outer === null && ba && ba.zMax - ba.zMin < 3000 && kc && kc.outer === null && !a.errs.length && !c.errs.filter((e) => !/kamo\/outer|Failed to load resource/.test(e)).length, `?kamoouter=0 の外の町 ${ka && ka.outer}・飛べる箱の奥行き ${ba && (ba.zMax - ba.zMin).toFixed(0)}m（3000 未満）・外の町のデータを止めた時 ${kc && kc.outer}・エラー ${a.errs.length + c.errs.length}`)
}
if (run('K38')) { // 【便22】
  const o = await open('summer-morning-corner-room', { dev: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } })
  const got = await outerWait(o.p), k = await kamoInfo(o.p), O = k && k.outer
  await o.p.waitForTimeout(1500)
  check('K38', got && k.low === true && O && O.boxes >= 100000 && O.trees > 10000 && O.trees < 35000 && !o.errs.length && !o.gl.length, `組めた ${got}・段 ${k && k.low ? '軽い' : '通常'}・箱 ${O && O.boxes}・木 ${O && O.trees}（1 万〜3.5 万）・エラー ${o.errs.length}${o.errs.length ? '（' + o.errs[0].slice(0, 80) + '）' : ''}・GL ${o.gl.length}`)
  await o.ctx.close()
}
if (run('K39')) { // 【便22】
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p), errs = []
  p.on('pageerror', (e) => errs.push('PE ' + e.message))
  await p.goto(`${BASE}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(800)
  const mem = async () => { await cdp.send('HeapProfiler.collectGarbage'); await p.waitForTimeout(400); await cdp.send('HeapProfiler.collectGarbage'); return p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6)) }
  const go = async (id) => { await p.evaluate((i) => window.__applyScene(i), id); await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).catch(() => {}); if (/corner/.test(id)) await outerWait(p); await p.waitForTimeout(1500); return mem() }
  const m = []; for (const id of ['autumn-dusk-corner-room', 'kitaterao-window-3d', 'summer-morning-corner-room', 'kitaterao-window-3d']) m.push(await go(id))
  check('K39', m[3] - m[1] < 200 && !errs.length, `JS のメモリ 角部屋 ${m[0]}MB → 北寺尾 ${m[1]}MB → 角部屋 ${m[2]}MB → 北寺尾 ${m[3]}MB（2回目の北寺尾の増え ${m[3] - m[1]}MB・200 未満）・エラー ${errs.length}`)
  await ctx.close()
}
// 【便23】南の四角
if (run('K40') || run('K41') || run('K42') || run('K44') || run('K45') || run('K46')) {
  const o = await open('summer-morning-corner-room')
  const got = await outerWait(o.p), k = await kamoInfo(o.p), Sx = k && k.south, O = k && k.outer, cut = O && O.southCut
  if (run('K40')) check('K40', got && Sx && Sx.bldgTris >= 300000 && Sx.water >= 10000 && Sx.trees >= 2000 && Sx.roadPts >= 50000 && Sx.benches >= 100 && Sx.canals >= 10 && cut && cut.boxes >= 10000 && cut.trees > 0 && cut.roads > 0 && cut.water > 0 && cut.terrain > 0 && !o.errs.length && !o.gl.length, `組めた ${got}・南の四角 ${Sx ? `建物の三角形 ${Sx.bldgTris}・水面 ${Sx.water}・木 ${Sx.trees}・道の点 ${Sx.roadPts}・ベンチ ${Sx.benches}・細い水路 ${Sx.canals}（10 以上）・組む時間 ${Sx.ms}ms` : '無し'}・外の町が抜いた ${cut ? JSON.stringify(cut) : '無し'}・エラー ${o.errs.length}・GL ${o.gl.length}`)
  if (run('K41')) {
    const lm = await o.p.evaluate(() => { const c = { bldg2: 0, terr2: 0, bldgA: 0, terrA: 0, uvBad: 0 }; window.__kamoScene.traverse((m) => { if (!m.isMesh || !m.material || !m.material.aoMap) return; const im = m.material.aoMap.image, src = (im && (im.currentSrc || im.src)) || ''; const p = m.userData.part; if (p === 'bldg') { if (/lm_bldg2/.test(src)) c.bldg2++; else if (/lm_bldg/.test(src)) c.bldgA++ } if (p === 'terrainNear') { if (/lm_terrain2/.test(src)) c.terr2++; else if (/lm_terrain/.test(src)) c.terrA++ } if (/lm_(bldg|terrain)2/.test(src) && (p === 'bldg' || p === 'terrainNear')) { const u = m.geometry.attributes.uv1; if (!u) c.uvBad++; else { let lo = 1, hi = 0; for (let i = 0, st = Math.max(1, Math.floor(u.count / 60)); i < u.count; i += st) { lo = Math.min(lo, u.getX(i)); hi = Math.max(hi, u.getX(i)) } if (!(lo >= 0 && hi <= 1 && hi > lo)) c.uvBad++ } } }); return c })
    check('K41', lm.bldg2 >= 10 && lm.terr2 >= 6 && lm.bldgA >= 10 && lm.terrA >= 6 && lm.uvBad === 0, `南の建物の図 ${lm.bldg2} 塊・南の地形の図 ${lm.terr2} 塊・北の建物の図 ${lm.bldgA} 塊・北の地形の図 ${lm.terrA} 塊・図の位置の崩れ ${lm.uvBad}`)
  }
  if (run('K42') || run('K44') || run('K45') || run('K46')) {
    if (run('K45')) o.winMirror = await o.p.evaluate(() => window.__town3dKamo().mirrorY)
    await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600)
    const at = (X, Z) => o.p.evaluate(([X, Z]) => { const e = window.__town3dKamoTown(X, Z); return window.__town3dNavAt(e.x, e.z) }, [X, Z])
    if (run('K42')) {
      const d = []; for (const X of [-500, -300, -90, 20, 500]) { const a = await at(X, 900), c = await at(X, 924); d.push({ X, dy: +Math.abs(a.ground - c.ground).toFixed(2), blocked: a.blocked && c.blocked && a.top - a.ground < 2 }) }
      check('K42', d.every((q) => q.dy < 1 && !q.blocked), `継ぎ目の両側の地面の差 ${d.map((q) => `東 ${q.X}: ${q.dy}m`).join('・')}（1m 未満）・縁と見なした所 ${d.filter((q) => q.blocked).length}`)
    }
    if (run('K46')) {
      const f = []; for (let Z = 860; Z <= 1000; Z += 20) { const q = await at(-90, Z); f.push(+q.floor.toFixed(2)) }
      let up = 0; for (let i = 1; i < f.length; i++) up = Math.max(up, f[i] - f[i - 1])
      check('K46', up < 1, `継ぎ目の南の鴨川の水面（南北 860〜1000m・20m ごと） ${f.join(' → ')}・下流へ上がった一番大きい所 ${up.toFixed(2)}m（1 未満）`)
    }
    if (run('K45')) {
      const win = o.winMirror
      await o.p.evaluate(() => { window.__kamoCam = { p: [-60, -14, 2200], l: [-110, -18, 2700], fov: 60 } }); await o.p.waitForTimeout(1500)
      const sw = await o.p.evaluate(() => window.__town3dKamo().mirrorY); await o.p.evaluate(() => { window.__kamoCam = null })
      check('K45', sw <= -15 && sw >= -21 && Math.abs(win - -4.56) < 0.01, `窓辺の鏡の高さ ${win}（−4.56）・南の鴨川の上の鏡の高さ ${sw}（−15〜−21）`)
    }
    if (run('K44')) {
      const P = await o.p.evaluate(() => { const q = (X, Z) => { const e = window.__town3dKamoTown(X, Z); return window.__town3dNavAt(e.x, e.z) }; return { ponto: q(-140, 2600).place, kiya: q(-190, 2500).place, kawa: q(-330, 2400).place, gion: q(250, 2800).place, ponto2: q(-150, 2650).place, riv: q(-60, 2600) } })
      check('K44', P.ponto === '先斗町' && P.ponto2 === '先斗町' && P.kiya === '木屋町' && P.kawa === '河原町' && P.gion === '祇園' && P.riv.place === '鴨川の上' && P.riv.wet, `先斗町 ${P.ponto}・${P.ponto2}・木屋町 ${P.kiya}・河原町 ${P.kawa}・祇園 ${P.gion}・南の鴨川 ${P.riv.place}（水 ${P.riv.wet}）`)
    }
  }
  await o.ctx.close()
}
if (run('K47')) {
  const o = await open('summer-morning-corner-room', { q: 'kamoouter=0' })
  const got = await o.p.waitForFunction(() => window.__town3dKamo && window.__town3dKamo() && window.__town3dKamo().south, null, { timeout: 90000 }).then(() => true).catch(() => false)
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600)
  const q = await o.p.evaluate(() => [[-300, 924], [20, 924], [-134, 2700]].map(([X, Z]) => { const e = window.__town3dKamoTown(X, Z), n = window.__town3dNavAt(e.x, e.z, e.y); return { X, Z, blocked: n.blocked, top: +(n.top - n.ground).toFixed(1) } }))
  const k = await kamoInfo(o.p)
  check('K47', got && k.outer === null && q.every((r) => !r.blocked || r.top >= 2) && !o.errs.length, `南の四角 ${got}・外の町 ${k && k.outer}・網の縁と見なした所 ${q.filter((r) => r.blocked && r.top < 2).map((r) => `東 ${r.X}・南 ${r.Z}`).join('・') || 'なし'}（建物の上 2m 以上の所は建物の当たりとして除く）・エラー ${o.errs.length}`)
  await o.ctx.close()
}
if (run('K43')) {
  const o = await open('summer-morning-corner-room', { q: 'kamosouth=0' })
  const got = await outerWait(o.p), k = await kamoInfo(o.p), O = k && k.outer
  check('K43', got && k.south === null && O && O.boxes >= 150000 && O.southCut && O.southCut.boxes === 0 && !o.errs.length, `?kamosouth=0 の南の四角 ${k && k.south}・外の町の箱 ${O && O.boxes}（15 万以上）・抜いた箱 ${O && O.southCut && O.southCut.boxes}（0）・エラー ${o.errs.length}`)
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
  await ctx.route('**/kamo/life.json*', (r) => r.abort()) // 【便21】読み先に版の印（?v=21）が付いたので、後ろに何が付いても塞ぐ
  await p.goto(`${BASE}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(800)
  await p.evaluate(() => window.__applyScene('summer-night-corner-room'))
  await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).catch(() => {})
  await p.waitForTimeout(1500)
  const k = await p.evaluate(() => window.__town3dKamo && window.__town3dKamo()), l = await p.evaluate(() => window.__town3dKamoLife && window.__town3dKamoLife())
  const real = errs.filter((e) => !/life.json|ERR_FAILED|net::/.test(e))
  check('K25', !!k && l === null && !real.length, `鴨川の町 ${k ? '有り' : '無し'}・動く物 ${JSON.stringify(l)}・エラー ${real.length}（読めなかった知らせ ${errs.length - real.length} は除く）`)
  await ctx.close()
}
if (run('K26')) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' }), p = await ctx.newPage(), errs = []
  p.on('pageerror', (e) => errs.push('PE ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  await ctx.addInitScript(() => { try { localStorage.setItem('seasons.state.v1', JSON.stringify({ version: 2, sceneId: 'autumn-dusk-corner-room', sceneAt: Date.now() })) } catch (e) { /* 無視 */ } })
  await ctx.route('**/kamo/kamo.json*', async (r) => /* 【便21】版の印 ?v=21 が付いても遅らせる */ { await new Promise((res) => setTimeout(res, 20000)); r.continue().catch(() => {}) }) // 鴨川のデータの読み込みを 20 秒遅らせる
  await p.goto(`${BASE}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(2500)
  await p.evaluate(() => window.__applyScene('kitaterao-window-3d'))
  await p.waitForFunction(() => window.__town3dDraw && window.__town3dDraw(), null, { timeout: 60000 }).catch(() => {})
  await p.waitForTimeout(1500)
  const n = await p.evaluate(() => document.querySelectorAll('.town3d-stage').length)
  await p.waitForTimeout(20000)
  const n2 = await p.evaluate(() => document.querySelectorAll('.town3d-stage').length)
  check('K26', n === 1 && n2 === 1 && !errs.filter((e) => !/net::|ERR_/.test(e)).length, `鴨川を読んでいる途中で北寺尾へ替えた後の舞台 ${n} 枚・読み終わる頃 ${n2} 枚（どちらも 1 で合格）・エラー ${errs.length}`)
  await ctx.close()
}
// ── 便21 ──
if (run('K27') || run('K28') || run('K29') || run('K30') || run('K31') || run('K32')) {
  const o = await open('summer-morning-corner-room'), k = await kamoInfo(o.p)
  if (run('K27')) { const st = k.stones || {}, bk = st.byKind || [], zg = st.zig || [0, 0]; check('K27', k.waterShallow === true && k.caus > 0 && bk[1] >= 3 && bk[2] >= 2 && bk[3] >= 2 && zg[0] >= 0.1 && zg[1] <= 0.4, `浅瀬の水の差し替え ${k.waterShallow}・川底の光の網 ${k.caus}・石の形 長方形 ${bk[0]}・亀 ${bk[1]}・千鳥 ${bk[2]}・すれ違い ${bk[3]}・列の線からのずれ ${zg[0]}〜${zg[1]}m（0.1〜0.4m で合格）`) }
  if (run('K28')) check('K28', k.clouds === true, `夏の朝の雲の層 ${k.clouds}`)
  if (run('K29')) { const c = (k.kyo && k.kyo.count) || []; check('K29', c[1] >= 1000 && c[2] >= 1500 && k.kyo.eaves >= 5000 && c[6] >= 50 && c[7] >= 10, `町家 ${c[1]}・古民家 ${c[2]}・通り庇と犬矢来 ${k.kyo && k.kyo.eaves}・京大の赤茶 ${c[6]}・吉田神社の社 ${c[7]}`) }
  if (run('K30')) { const br = k.bridges || {}; check('K30', br.lanterns === 14 && br.rails >= 10 && br.lamps >= 500, `賀茂大橋の石灯籠 ${br.lanterns}（14 で合格）・欄干 ${br.rails}・街灯 ${br.lamps}`) }
  if (run('K31')) { const p0 = k.people || {}; await o.p.waitForTimeout(2000); const p1 = (await kamoInfo(o.p)).people || {}; const moved = (p0.sample || []).some((s, i) => p1.sample && p1.sample[i] && (s[1] !== p1.sample[i][1] || s[2] !== p1.sample[i][2])); const n = (p0.walk || 0) + (p0.jog || 0) + (p0.bike || 0); o.k31 = { ok: n >= 15 && moved && p0.wade >= 4 && p0.stoneSit >= 3, msg: `夏の朝 歩く ${p0.walk}・走る ${p0.jog}・自転車 ${p0.bike}（15 以上）・2 秒で動いた ${moved}・浅瀬の子ども ${p0.wade}（4 以上）・飛び石に座る ${p0.stoneSit}（3 以上）` } }
  if (run('K32')) { const m = k.marks || {}; check('K32', m.tower && m.gate && m.daigengu && m.moan && m.torii >= 15 && m.benches >= 100 && m.play >= 3 && m.shelters >= 1, `時計塔 ${m.tower}・正門 ${m.gate}・大元宮 ${m.daigengu}・茂庵 ${m.moan}・鳥居 ${m.torii}・ベンチ ${m.benches}・遊具 ${m.play}・東屋 ${m.shelters}`) }
  if (run('K27')) check('K27', !o.errs.length && !o.gl.length, `夏の朝の角部屋のエラー ${o.errs.length}・GL の食い違い ${o.gl.length}（便21 のシェーダー〈浅瀬・川底・雲・家並み・道〉が組めない時に落ちる＝【便21・外の目】）${o.errs.slice(0, 2).join(' ／ ')}`)
  const k31 = o.k31; await o.ctx.close()
  if (run('K28') || run('K31')) {
    const o2 = await open('summer-night-corner-room'); await o2.p.waitForTimeout(3000); const n2 = await kamoInfo(o2.p); const e2 = o2.errs.length + o2.gl.length; await o2.ctx.close()
    const o3 = await open('winter-snow-dusk-corner-room'); const n3 = await kamoInfo(o3.p); await o3.ctx.close()
    const o4 = run('K28') ? await open('autumn-rain-night-corner-room') : null; const n4 = o4 ? await kamoInfo(o4.p) : null; if (o4) await o4.ctx.close()
    if (run('K28')) check('K28', n2.clouds === true && n4.clouds === true && e2 === 0, `夏の夜の雲 ${n2.clouds}・秋の雨の夜の雲 ${n4.clouds}・夏の夜のエラーと GL の食い違い ${e2}`)
    if (run('K31')) { const h = n2.people || {}, w = n3.people || {}; check('K31', k31 && k31.ok && h.hanabi >= 6 && h.sparks > 0 && w.wade === 0 && w.hanabi === 0, `${k31 ? k31.msg : '夏の朝を測れていない'}／夏の夜 花火の人 ${h.hanabi}（6 以上）・火花の出ている人 ${h.sparks}／冬の雪の夕 子ども ${w.wade}・花火 ${w.hanabi}（0）`) }
  }
}
await b.close()
const bad = results.filter((r) => !r.pass)
console.log(`検査 ${results.length} 本・外れ ${bad.length}`)
process.exit(bad.length ? 1 : 0)
