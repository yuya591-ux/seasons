// 便24 の音の確かめ（便22 の audio22.mjs を写した。A4 を書き換え、A6・A7 を足した）
// 便22 の音の確かめ（開発用のサーバーで開く＝音の部品の検証の口 getDebug・_dbg は開発の時だけある）
// 前に: npx vite --port 4970 --strictPort（AUDIO_PORT で替えられる）
// 使い方: node docs/qa/2026-11-04_便22/gate/audio22.mjs   （1つでも外れたら exit 1）
//   A1 夏の朝の角部屋（窓辺）: 鴨川デルタの人の声がかすかに流れ（0.05〜0.6）、素材が読めて鳴る。合成のざわめき・駅の唸りは 0
//   A2 夏の朝に空からデルタの上の低い所へ寄ると人の声が満ち（0.6 以上）、東へ 1.2km 離れると 0、高い空でも 0.1 未満
//   A3 秋の雨の夜は人の声 0。秋の夕暮れは 0 より大きい
//   A4 角部屋の情景のループの素材は、虫・雨・川・ヒグラシ・風に低音切り（hp 150Hz 以上）が掛かって鳴っている
//   A4（便24 で書き換え）角部屋のループの低音切りは、素材ごとの下限（src/data/soundFloor.js）が効いている: 秋の夕 [虫 420・ヒグラシ 1100・木々 750・川 260]・秋の雨の夜 [雨 560・木々 750]
//   A6（便24）窓を閉じた時のこもりは 1600Hz（便23 まで 900Hz）、開けると 20000Hz
//   A7（便24）叡山電車の音を鳴らしても、0.5 秒より長く鳴る正弦（上がり下がりするモーター）が無い（鳴った正弦の長さを数える）
//   A5 叡山電車の音を鳴らすと、鳴らした数が増えてエラーが無い（作りは低い雑音の帯を持たない）
import { chromium } from 'playwright'
import fs from 'node:fs'
const PORT = process.env.AUDIO_PORT || 4970, BASE = `http://localhost:${PORT}/seasons/`
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--autoplay-policy=no-user-gesture-required'] })
const results = []
const check = (k, pass, detail) => { results.push({ k, pass }); console.log(`${pass ? '○' : '×'} ${k} ${detail}`) }
async function open(scene) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })
  const p = await ctx.newPage(); const errs = []
  p.on('pageerror', (e) => errs.push('PE ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  await ctx.addInitScript((id) => { try { localStorage.setItem('seasons.state.v1', JSON.stringify({ version: 2, sceneId: id, sceneAt: Date.now() })) } catch (e) { /* 無視 */ } }, scene)
  await p.goto(`${BASE}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  // 開発用のサーバーは初めて開いた時に部品をまとめ直してページを読み直すことがある＝読み直しが収まるまで待ってからやり直す
  for (let i = 0; i < 4; i++) { try { await p.waitForFunction(() => !!window.__applyScene, null, { timeout: 60000 }); await p.locator('.gate').click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(800); await p.evaluate((id) => window.__applyScene(id), scene); break } catch (e) { await p.waitForTimeout(3000) } }
  await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3 && window.__town3dKamo && window.__town3dKamo(), null, { timeout: 180000 }).catch(() => {})
  await p.waitForTimeout(4500)
  return { p, ctx, errs }
}
const dbg = (p) => p.evaluate(() => ({ a: window.__audio && window.__audio.getDebug ? window.__audio.getDebug() : null, sent: window.__town3dAmb ? window.__town3dAmb() : null, life: window.__town3dKamoLife ? window.__town3dKamoLife().amb : null }))
const flyTo = async (p, X, Y, Z) => { await p.evaluate(([X, Y, Z]) => { const e = window.__town3dKamoTown(X, Z, Y); window.__town3dFlyPose(e.x, e.y, e.z, 0, 0) }, [X, Y, Z]); await p.waitForTimeout(3200); return dbg(p) }
{
  const o = await open('summer-morning-corner-room')
  const w = await dbg(o.p)
  check('A1', !!w.a && w.life && w.life.voice >= 0.05 && w.life.voice <= 0.6 && w.a.voice >= 0.05 && w.a.voiceOn && w.a.crowd === 0 && w.a.sta === 0 && !o.errs.length, `窓辺 人の声 ${w.life && w.life.voice}（音の部品 ${w.a && w.a.voice}・素材 ${w.a && w.a.voiceOn}・こもり ${w.a && w.a.voiceLp}Hz）・ざわめき ${w.a && w.a.crowd}・駅 ${w.a && w.a.sta}・エラー ${o.errs.length}`)
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600)
  const near = await flyTo(o.p, -66, 6, 70), far = await flyTo(o.p, 1150, 20, 40), high = await flyTo(o.p, -66, 240, 60)
  check('A2', near.life.voice >= 0.6 && near.a.voice >= 0.6 && far.life.voice === 0 && far.a.voice === 0 && high.life.voice < 0.1, `デルタの上 ${near.life.voice}（${near.a.voice}・${near.a.voiceLp}Hz）・東へ 1.2km ${far.life.voice}（${far.a.voice}）・高い空 ${high.life.voice}`)
  fs.writeFileSync('docs/qa/2026-11-05_便24/gate/audio24-loops.json', JSON.stringify({ morning: w.a }, null, 1))
  await o.ctx.close()
}
{
  const r = await open('autumn-rain-night-corner-room'), rd = await dbg(r.p)
  const d = await open('autumn-dusk-corner-room'), dd = await dbg(d.p)
  check('A3', rd.life && rd.life.voice === 0 && rd.a.voice === 0 && dd.life && dd.life.voice > 0 && dd.a.voice > 0, `秋の雨の夜 ${rd.life && rd.life.voice}（${rd.a && rd.a.voice}）・秋の夕暮れ ${dd.life && dd.life.voice}（${dd.a && dd.a.voice}）`)
  // A4: 生きているループの低音切り（情景データの順）。秋の夕＝虫・ヒグラシ・木々・川／秋の雨の夜＝雨・木々
  const hpD = dd.a.loopHp, hpR = rd.a.loopHp
  check('A4', JSON.stringify(hpD) === JSON.stringify([420, 1100, 750, 260]) && JSON.stringify(hpR) === JSON.stringify([560, 750]), `秋の夕のループの低音切り ${JSON.stringify(hpD)}（[420,1100,750,260]）・秋の雨の夜 ${JSON.stringify(hpR)}（[560,750]）`)
  const e0 = dd.a.ev.eiden
  const r5 = await d.p.evaluate(() => { try { window.__audio.playEvent('eiden', { amt: 1, pan: 0.2, dep: true }); window.__audio.playEvent('eiden', { amt: 0.3 }); return 'ok' } catch (e) { return 'ERR ' + e.message } })
  await d.p.waitForTimeout(1200)
  const e1 = (await dbg(d.p)).a.ev.eiden
  const src = fs.readFileSync('src/audio/audio.js', 'utf8'), body = src.slice(src.indexOf('function eidenPass'), src.indexOf('function playEvent'))
  check('A5', r5 === 'ok' && e1 === e0 + 2 && !/bp\.frequency\.value = 240|createBufferSource\(\); src\.buffer = evNoise; src\.loop = true/.test(body) && !d.errs.length, `叡山電車 ${r5}・鳴らした数 ${e0} → ${e1}・低い雑音の帯 ${/bp\.frequency\.value = 240/.test(body) ? 'あり' : 'なし'}・エラー ${d.errs.length}`)
  // A6: 窓のこもり（閉じた時と開けた時）
  const lpC = (await dbg(d.p)).a.winLp
  await d.p.evaluate(() => window.__audio.setWindowOpen(true)); await d.p.waitForTimeout(1500)
  const lpO = (await dbg(d.p)).a.winLp
  await d.p.evaluate(() => window.__audio.setWindowOpen(false)); await d.p.waitForTimeout(1500)
  const lpC2 = (await dbg(d.p)).a.winLp
  check('A6', Math.abs(lpC2 - 1600) <= 2 && lpO >= 19000, `窓を閉じた時のこもり ${lpC}Hz → 開けた時 ${lpO}Hz → 閉じ直した時 ${lpC2}Hz（1600 と 20000）`)
  // A7: 叡山電車の音の正弦の長さ（start〜stop）を数える
  const r7 = await d.p.evaluate(async () => {
    const P = OscillatorNode.prototype, st = P.start, sp = P.stop, rec = []
    P.start = function (t) { this.__t0 = t || 0; rec.push(this); return st.apply(this, arguments) }
    P.stop = function (t) { this.__t1 = t || 0; return sp.apply(this, arguments) }
    try { window.__audio.playEvent('eiden', { amt: 1, pan: 0, dep: true }); window.__audio.playEvent('eiden', { amt: 1, pan: 0, dep: false }) } finally { P.start = st; P.stop = sp }
    const durs = rec.map((o) => (o.__t1 || 0) - (o.__t0 || 0))
    return { n: rec.length, max: durs.length ? Math.max(...durs) : 0 }
  })
  check('A7', r7.n > 0 && r7.max <= 0.5, `叡山電車の正弦 ${r7.n} 本・いちばん長いもの ${r7.max.toFixed(2)} 秒（0.5 秒以下）`)
  await r.ctx.close(); await d.ctx.close()
}
await b.close()
const ng = results.filter((r) => !r.pass)
console.log(`音の確かめの終わり: ${results.length - ng.length}/${results.length} 合格`)
process.exit(ng.length ? 1 : 0)
