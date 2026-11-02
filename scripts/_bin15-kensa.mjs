// 便15（2026-11-02・便14 の T1＋#1=1 の直す便）の検査: 直しが1つずつ入っているかを、本物のページ（開発サーバー 4985・_bin15-vite.config.mjs）と
// ファイルの中身で見る。1つの ID が1つの所見の直しを見る（外すと落ちることは scripts/_bin15-mutate.mjs で確かめる）。
// 使い方: node scripts/_bin15-kensa.mjs [ID…|all]   出力: QA_OUT（既定 docs/qa/2026-11-02_便15/gate）/kensa.json と、ID ごとの1行
import { chromium } from 'playwright'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const PORT = process.env.B15_PORT || 4985
const BASE = `http://localhost:${PORT}/seasons/`
const OUT = process.env.QA_OUT || 'docs/qa/2026-11-02_便15/gate'
const SHOTS = process.env.QA_SHOTS || 'docs/qa/2026-11-02_便15/shots'
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true })
const read = (f) => fs.readFileSync(f, 'utf8')
const DEVS = {
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
}
let browser = null
const launch = async () => (browser ||= await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] }))
const seed = (s) => { let a = s; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
// 情景を開いたページ。dev=1 で検証の口・ui=1 でボタンを隠さない
async function open(scene, { dev = 'iphone', q = '?dev=1', init = null, settings = null } = {}) {
  const b = await launch()
  const ctx = await b.newContext(DEVS[dev])
  await ctx.addInitScript(seed, 20261102)
  if (settings) await ctx.addInitScript((s) => { try { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.settings = { ...(st.settings || {}), ...s }; localStorage.setItem(k, JSON.stringify(st)) } catch { /* 無視 */ } }, settings)
  if (init) await ctx.addInitScript(init)
  const p = await ctx.newPage()
  p.errs = []
  p.on('pageerror', (e) => p.errs.push(e.message))
  await p.goto(BASE + q, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForTimeout(2500)
  await p.locator('.gate').click().catch(() => {})
  await p.waitForTimeout(1200)
  if (scene && q.includes('dev=1')) { await p.evaluate((s) => window.__applyScene(s), scene); await settle(p) }
  return { p, ctx }
}
async function settle(p, ms = 40000) {
  const t0 = Date.now()
  await p.waitForTimeout(800)
  if (!(await p.evaluate(() => !!document.querySelector('.town3d-stage')))) { await p.waitForTimeout(2500); return }
  while (Date.now() - t0 < ms) { if (await p.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw())).catch(() => false)) break; await p.waitForTimeout(400) }
  await p.waitForTimeout(1500)
}
// 情景パネル経由で場所→情景を選ぶ（本物の操作）
async function pickViaPanel(p, label, sceneLabel) {
  await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })))
  await p.locator('.topbar .iconbtn', { hasText: '情景' }).first().click()
  await p.waitForTimeout(600)
  await p.locator('.scene-card', { hasText: label }).first().click()
  await p.waitForTimeout(500)
  if (sceneLabel) { await p.locator('.scene-card', { hasText: sceneLabel }).first().click() }
  await p.waitForTimeout(800)
}
async function openSettings(p) {
  await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })))
  await p.locator('.topbar .iconbtn', { hasText: '設定' }).first().click()
  await p.waitForTimeout(700)
}
const lumStats = async (p, file, rect, fn) => p.evaluate(async ([d, rect, fn]) => {
  const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + d })
  const c = new OffscreenCanvas(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0)
  const [x, y, w, h] = rect; const px = g.getImageData(x, y, w, h).data
  return (new Function('px', 'w', 'h', fn))(px, w, h)
}, [fs.readFileSync(file).toString('base64'), rect, fn])

const CHECKS = {
  // ── 群A: 出典と文書 ──
  async A1() { // S1: 情景で鳴らす音が全部アプリ内の出典にある（鈴虫）
    const { SCENES } = await import('../src/data/scenes/index.js'); const { CREDIT_SOUNDS } = await import('../src/data/credits.js?' + Date.now())
    const used = new Set(SCENES.flatMap((s) => (s.sounds || []).map((x) => x.src.replace(/^audio\//, ''))))
    const have = new Set(CREDIT_SOUNDS.map((c) => c.file))
    const miss = [...used].filter((f) => !have.has(f))
    return { pass: miss.length === 0 && have.has('kitaterao-window-3d-night/suzumushi.mp3'), detail: `鳴らす音 ${used.size}・出典に無い ${miss.length}${miss.length ? '（' + miss.join(' ') + '）' : ''}` }
  },
  async A2() { // S2: ウグイスの出典が CREDITS.md の uguisu.mp3 の行と同じ
    const { CREDIT_SOUNDS } = await import('../src/data/credits.js?' + Date.now())
    const u = CREDIT_SOUNDS.find((c) => /ウグイス/.test(c.note || ''))
    const row = read('CREDITS.md').split('\n').find((l) => l.includes('`uguisu.mp3`'))
    const ok = !!u && !!row && row.includes(u.url) && !/Uguisu5707/.test(u.title)
    return { pass: ok, detail: `アプリ内 ${u ? u.title + ' ' + u.url : 'なし'}` }
  },
  async A3() { // S3（#1）: どの情景も鳴らさない音・使わなくなった画と道具が出典に無い
    const { SCENES } = await import('../src/data/scenes/index.js'); const C = await import('../src/data/credits.js?' + Date.now())
    const used = new Set(SCENES.flatMap((s) => (s.sounds || []).map((x) => x.src.replace(/^audio\//, ''))))
    const extra = C.CREDIT_SOUNDS.filter((c) => !used.has(c.file)).map((c) => c.note)
    const old = [...C.CREDIT_IMAGES, ...C.CREDIT_TOOLS].filter((c) => /実写の窓|パノラマ|スプラット|splat|Real-ESRGAN|Basel/i.test(c.title + c.note)).map((c) => c.title)
    return { pass: extra.length === 0 && old.length === 0, detail: `使わない音 ${extra.length}${extra.length ? '（' + extra.join(' ') + '）' : ''}・使わない画と道具 ${old.length}` }
  },
  async A4() { // S4: CREDITS.md の節の見出しに撤去した情景の名が無い・形式の文が実物どおり
    const md = read('CREDITS.md')
    const heads = md.split('\n').filter((l) => /^###/.test(l))
    const bad = heads.filter((h) => /夏の晴れ|高台の下町|冬の雪の夜|夏の朝（山）|情景「/.test(h))
    const ogg = /すべて元は Ogg Vorbis/.test(md)
    return { pass: bad.length === 0 && !ogg, detail: `見出し ${heads.length}・撤去した情景の名の見出し ${bad.length}・「すべて元は Ogg」${ogg ? 'あり' : 'なし'}` }
  },
  async A5() { // S5: 情景データの権利のコメントが実物と違わない
    const files = fs.readdirSync('src/data/scenes').map((f) => 'src/data/scenes/' + f)
    const bad = files.filter((f) => /CC0流用|既存のCC0|既存CC0|CC0系|CC0\/既存|CC0\/CC-BY|既存のCC素材/.test(read(f)))
    return { pass: bad.length === 0, detail: `食い違う書き方のファイル ${bad.length}` }
  },
  async A6() { // S55: README が今の形
    const md = read('README.md')
    const need = ['25', 'src/data/quality.js', 'src/data/mist.js', 'src/engine/heightFog.js', 'src/engine/treeCrown.js', 'src/engine/surfacePattern.js', 'src/engine/bgBlur.js', 'こまやか']
    const ng = ['30 あまり', '油蝉', 'カラス', 'photoWindow', 'clearSky', '屋上', 'gen-thumbs']
    const miss = need.filter((s) => !md.includes(s)), bad = ng.filter((s) => md.includes(s))
    return { pass: miss.length === 0 && bad.length === 0, detail: `足りない ${miss.join(' ') || 'なし'}・古い ${bad.join(' ') || 'なし'}` }
  },
  async A7() { // S72: 色の圧縮の説明が1つ（ACES・NoToneMapping の古い説明が無い）・軽やかの説明が実物どおり
    const s = read('src/engine/town3dViewer.js')
    const aces = (s.match(/ACES/g) || []).length, nt = (s.match(/NoToneMapping/g) || []).length, oldLight = /粒の数で軽くする/.test(s)
    return { pass: aces === 0 && nt === 0 && !oldLight, detail: `ACES ${aces}・NoToneMapping ${nt}・古い軽やかの説明 ${oldLight ? 'あり' : 'なし'}` }
  },

  // ── 群B: 設定と画面の部品 ──
  async B1() { // S31: 今点いている段を押しても町を組み直さない
    const { p, ctx } = await open('kitaterao-window-3d')
    await openSettings(p)
    const before = await p.evaluate(() => { const s = document.querySelector('.town3d-stage'); s.__b15mark = 1; return !!s })
    const on = p.locator('.panel--set .chip.chip--on').first()
    const label = await on.textContent()
    await on.click()
    let nullSeen = 0
    for (let i = 0; i < 20; i++) { await p.waitForTimeout(150); if (!(await p.evaluate(() => !!(window.__town3dStats && window.__town3dStats())))) nullSeen++ }
    const same = await p.evaluate(() => { const s = document.querySelector('.town3d-stage'); return !!(s && s.__b15mark) })
    await ctx.close()
    return { pass: before && same && nullSeen === 0, detail: `押した札「${label}」・舞台が同じ ${same}・組み直し中（測りが空）の回 ${nullSeen}/20` }
  },
  async B2() { // S19・U4: 段を替えて組み直しても、音を鳴らし直さず、窓をあけた状態を引き継ぐ
    const { p, ctx } = await open('kitaterao-window-3d')
    await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })))
    await p.locator('.iconbtn--stage').click(); await p.waitForTimeout(2500)
    const lab0 = await p.locator('.iconbtn--stage').textContent()
    await p.evaluate(() => { window.__b15setScene = 0; const a = window.__audio; const o = a.setScene.bind(a); a.setScene = (...x) => { window.__b15setScene++; return o(...x) }; document.querySelector('.town3d-stage').__b15mark = 1 })
    await openSettings(p)
    const off = p.locator('.panel--set .axis__chips .chip:not(.chip--on)', { hasText: /こまやか|ふつう|軽やか/ }).first()
    const to = await off.textContent(); await off.click()
    await p.waitForTimeout(1000); await settle(p); await p.waitForTimeout(2500)
    const r = await p.evaluate(() => ({ rebuilt: !document.querySelector('.town3d-stage').__b15mark, q: window.__town3dQuality && window.__town3dQuality() ? window.__town3dQuality().q : null, calls: window.__b15setScene, open: window.__b15T && window.__b15T.getActive() ? +(window.__b15T.getActive().winOpen || 0).toFixed(2) : null }))
    const lab1 = await p.locator('.iconbtn--stage').textContent()
    await ctx.close()
    const want = { こまやか: 'soft', ふつう: 'standard', 軽やか: 'light' }[to.trim()]
    return { pass: r.rebuilt && r.q === want && r.calls === 0 && lab1 === lab0 && r.open > 0.9, detail: `段を「${to}」へ・組み直し ${r.rebuilt ? 'あり' : 'なし'}・組み直した町の段 ${r.q}（${want} のはず）・音の鳴らし直し ${r.calls}・ボタン「${lab0}」→「${lab1}」・窓のあき ${r.open}` }
  },
  async B3() { // S32: 傾きの許可を断ったら札を消す
    const { p, ctx } = await open('summer-rain-dusk', { init: () => { window.DeviceOrientationEvent = window.DeviceOrientationEvent || function () {}; window.DeviceOrientationEvent.requestPermission = async () => 'denied' } })
    await openSettings(p)
    const chip = p.locator('.panel--set .chip', { hasText: '傾きで見回す' })
    await chip.click(); await p.waitForTimeout(800)
    const on = await chip.evaluate((e) => e.classList.contains('chip--on'))
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('seasons.state.v1') || '{}').settings?.tilt)
    await ctx.close()
    return { pass: !on && saved === false, detail: `断った後の札 ${on ? '点いたまま' : '消えた'}・保存の値 ${saved}` }
  },
  async B4() { // V67: 設定の「音」の線の左端と長さが「明るさ」の線とそろう
    const { p, ctx } = await open('summer-rain-dusk')
    await openSettings(p)
    const r = await p.evaluate(() => { const rows = [...document.querySelectorAll('.panel--set .setrow')]; const rect = (lab) => { const row = rows.find((x) => x.querySelector('.setrow__label')?.textContent === lab); const s = row && row.querySelector('input[type=range]'); return s ? s.getBoundingClientRect().toJSON() : null }; return { vol: rect('音'), br: rect('明るさ') } })
    await p.screenshot({ path: `${SHOTS}/b4-settings-iphone.png` })
    await ctx.close()
    const dl = Math.abs(r.vol.left - r.br.left), dw = Math.abs(r.vol.width - r.br.width)
    return { pass: dl <= 1 && dw <= 1, detail: `左端の差 ${dl.toFixed(1)}px・長さの差 ${dw.toFixed(1)}px（音 ${r.vol.left.toFixed(1)}〜 ／ 明るさ ${r.br.left.toFixed(1)}〜）` }
  },
  async B5() { // V68: iPhone で設定を開いている間、＋−がパネルの外に覗かない
    const { p, ctx } = await open('kitaterao-window-3d')
    await openSettings(p)
    const r = await p.evaluate(() => { const pr = document.querySelector('.panel--set').getBoundingClientRect(); const bs = [...document.querySelectorAll('.town3d-zoom__btn, .town3d-pad button')]; let peek = 0; for (const b of bs) { const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || +cs.opacity === 0) continue; let el = b, vis = true; while (el) { const c = getComputedStyle(el); if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity === 0) { vis = false; break } el = el.parentElement } if (!vis) continue; const inside = r.left >= pr.left && r.right <= pr.right && r.top >= pr.top && r.bottom <= pr.bottom; if (!inside && r.bottom > 0 && r.top < innerHeight) peek++ } return { n: bs.length, peek } })
    await ctx.close()
    return { pass: r.peek === 0, detail: `操作のボタン ${r.n}・パネルの外に見える ${r.peek}` }
  },
  async B6() { // V73: iPhone で空を飛ぶ時、右上のボタンが1段に並ぶ
    const { p, ctx } = await open('kitaterao-window-3d')
    const stage = p.locator('.iconbtn--stage')
    for (const want of ['窓をあける', '乗り出す', '空へ']) { await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))); const t = await stage.textContent(); if (t !== want) break; await stage.click(); await p.waitForTimeout(3500) }
    await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))); await p.waitForTimeout(1300)
    const r = await p.evaluate(() => { const bs = [...document.querySelectorAll('.topbar > *')].filter((b) => { const cs = getComputedStyle(b); return cs.display !== 'none' && b.getBoundingClientRect().width > 0 }); return bs.map((b) => ({ t: b.textContent.trim(), top: Math.round(b.getBoundingClientRect().top), right: Math.round(b.getBoundingClientRect().right) })) })
    await p.screenshot({ path: `${SHOTS}/b6-fly-iphone.png` })
    await ctx.close()
    const rows = new Set(r.map((x) => x.top)).size
    return { pass: r.length >= 5 && rows === 1 && Math.max(...r.map((x) => x.right)) <= 402, detail: `ボタン ${r.length}（${r.map((x) => x.t).join('・')}）・段の数 ${rows}` }
  },

  // ── 群C: 町の3Dの片付けと検証の口 ──
  async C1() { // S23: __town3dLook(dx, dy) で見回しが動く
    const { p, ctx } = await open('kitaterao-window-3d')
    const r = await p.evaluate(() => { const a = window.__b15T.getActive(); const y0 = a.yawTarget; const ret = window.__town3dLook(0.4, 0); return { y0, y1: a.yawTarget, ret: typeof ret, st: typeof window.__town3dLookState } })
    await ctx.close()
    return { pass: Math.abs(r.y1 - r.y0) > 0.05 && r.st === 'function', detail: `見回しの目標 ${r.y0.toFixed(3)}→${r.y1.toFixed(3)}・色と空気の口 __town3dLookState ${r.st}` }
  },
  async C2() { // S24: 後処理の部品を読む間に町の組み立てが打ち切られても、舞台と描画器を残さない
    const b = await launch(); const ctx = await b.newContext(DEVS.iphone); const p = await ctx.newPage()
    await p.route(/postprocessing|FXAAShader/, async (route) => { await new Promise((r) => setTimeout(r, 6000)); await route.continue() })
    await p.goto(BASE + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForTimeout(2500)
    await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1000)
    await p.evaluate(() => window.__applyScene('kitaterao-window-3d'))
    let mid = 0; for (let i = 0; i < 60; i++) { await p.waitForTimeout(250); mid = await p.evaluate(() => document.querySelectorAll('.town3d-stage').length); if (mid) break }
    await p.waitForTimeout(1500)
    await p.evaluate(() => window.__applyScene('summer-rain-dusk'))
    await p.waitForTimeout(12000)
    const r = await p.evaluate(() => ({ stages: document.querySelectorAll('.town3d-stage').length, canv: document.querySelectorAll('canvas').length }))
    await ctx.close()
    return { pass: mid >= 1 && r.stages === 0, detail: `組み立て中の舞台 ${mid}・打ち切った後に残る舞台 ${r.stages}・canvas ${r.canv}` }
  },
  async C3() { // S25: 温めの間に町→町と替えても、window の resize と pointerup の受け口が積もらない
    // 速い GPU では温め（シェーダーの組み立て待ち・最大2秒）が一瞬で終わり、その最中に替える隙が無い。検査の中だけ、組み立てが遅い端末を真似て
    // （KHR_parallel_shader_compile の完了を __b15slow の間は「まだ」と返す）温めを2秒にし、町が昇降の保険の受け口（pointerup）を足し終えた直後＝温めの最中に次の町へ替える
    const init = () => {
      const add = window.addEventListener, rm = window.removeEventListener, live = new Map(); window.__b15L = live
      const key = (t, f) => t + '|' + (f && (f.__id || (f.__id = Math.random())))
      window.__b15adds = 0
      window.addEventListener = function (t, f, o) { if (t === 'resize' || t === 'pointerup') { live.set(key(t, f), t + ':' + String(f).slice(0, 50)); if (t === 'pointerup') window.__b15adds++ } return add.call(this, t, f, o) }
      window.removeEventListener = function (t, f, o) { live.delete(key(t, f)); return rm.call(this, t, f, o) }
      for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
        if (!C) continue
        const ge = C.prototype.getExtension, gp = C.prototype.getProgramParameter
        C.prototype.getExtension = function (n) { if (n === 'KHR_parallel_shader_compile') return { COMPLETION_STATUS_KHR: 0x91B1 }; return ge.call(this, n) }
        C.prototype.getProgramParameter = function (p, n) { if (n === 0x91B1) return !window.__b15slow; return gp.call(this, p, n) }
      }
    }
    const { p, ctx } = await open('kitaterao-window-3d', { init })
    const TOWN = 'applySize|active && e && e\\.|pointers\\.delete' // 町が足す受け口だけを数える（resize の applySize・昇降の保険・指の受け口。外から差し込まれた道具の受け口は数えない）
    const n0 = await p.evaluate((src) => [...window.__b15L.values()].filter((x) => new RegExp(src).test(x)).length, TOWN)
    const left0 = await p.evaluate(() => [...window.__b15L.values()].map((x) => x.split(String.fromCharCode(10)).join(' ').slice(0, 40)))
    console.log('はじめの受け口:', left0.join(' ／ '))
    await p.evaluate(() => { window.__b15slow = true })
    let hit = 0
    for (const s of ['kitaterao-window-3d-rain', 'kitaterao-window-3d-night', 'kitaterao-window-3d-snow', 'kitaterao-window-3d']) {
      const before = await p.evaluate(() => window.__b15adds)
      await p.evaluate((x) => window.__applyScene(x), s)
      // 町が受け口を足し終えるのを待つ（pointerup が1つ増えた所）。そこから温め（遅くした組み立て待ち）に入る
      const ok = await p.waitForFunction((b) => window.__b15adds > b, before, { polling: 20, timeout: 60000 }).then(() => true).catch(() => false)
      if (ok) hit++
      await p.waitForTimeout(300) // 温めの最中（2秒の内）
    }
    await p.evaluate(() => { window.__b15slow = false })
    await settle(p); await p.waitForTimeout(3000)
    const n1 = await p.evaluate((src) => [...window.__b15L.values()].filter((x) => new RegExp(src).test(x)).length, TOWN)
    const left = await p.evaluate(() => [...window.__b15L.values()])
    await ctx.close()
    return { pass: hit === 4 && n1 <= n0, detail: `1つ目の町の後の受け口 ${n0}・温めの最中に替えた回 ${hit}/4・替え終えた後の受け口 ${n1}（${left.map((x) => x.split(':')[0] + ':' + x.split(':').slice(1).join(':').split(String.fromCharCode(10)).join(' ').slice(0, 30)).join(' ／ ')}）` }
  },
  async C4() { // S26: 本番（dev なし）で、前の町を掴む口（__town3dMerge・__town3dFrozen）を window に置かない
    const { p, ctx } = await open(null, { q: '' })
    await pickViaPanel(p, '北寺尾の坂の街', null)
    await p.waitForTimeout(500)
    for (let i = 0; i < 80; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => document.querySelector('.town3d-stage--in'))) break }
    await p.waitForTimeout(3000)
    const r = await p.evaluate(() => ({ stage: !!document.querySelector('.town3d-stage'), keys: Object.keys(window).filter((k) => k.startsWith('__town3d')) }))
    await ctx.close()
    return { pass: r.stage && r.keys.length === 0, detail: `町を開いた・window の __town3d の口 ${r.keys.length}${r.keys.length ? '（' + r.keys.join(' ') + '）' : ''}` }
  },
  async C5() { // S27・U2: 前の町の検証の口は、次の町では null を返す・2D へ移ると町の口が消える
    const { p, ctx } = await open('kitaterao-window-3d')
    await p.evaluate(() => { window.__b15old = { draw: window.__town3dDraw, attr: window.__town3dAttribute, pick: window.__town3dPick, dbg: window.__town3dDbg } })
    await p.evaluate(() => window.__applyScene('kitaterao-window-3d-night')); await settle(p)
    const r = await p.evaluate(() => { const o = window.__b15old; return { draw: o.draw(), attr: o.attr ? o.attr() : null, pick: o.pick ? o.pick(0.5, 0.5) : null, dbg: o.dbg ? o.dbg() : null, now: !!window.__town3dDraw() } })
    await p.evaluate(() => window.__applyScene('summer-rain-dusk')); await p.waitForTimeout(4000)
    const MAIN = ['__town3dWindow', '__town3dLean', '__town3dFlyToggle', '__town3dLandToggle']
    const left = await p.evaluate((M) => Object.keys(window).filter((k) => k.startsWith('__town3d') && !M.includes(k)), MAIN)
    await ctx.close()
    const stale = ['draw', 'attr', 'pick', 'dbg'].filter((k) => r[k] != null)
    return { pass: stale.length === 0 && r.now && left.length === 0, detail: `前の町の口が値を返した ${stale.length}${stale.length ? '（' + stale.join(' ') + '）' : ''}・今の町の口 ${r.now}・2Dへ移った後に残る町の口 ${left.length}${left.length ? '（' + left.slice(0, 6).join(' ') + '）' : ''}` }
  },

  // ── 群D: 軽やか ──
  async D1() { // S36・U5: 軽やかでは雨筋・降る粒の描く数を減らす（作る数は同じ）
    const r = {}
    for (const q of ['light', 'standard']) {
      const { p, ctx } = await open('kitaterao-window-3d-rain', { settings: { quality: q } })
      r[q] = await p.evaluate(() => { const out = []; window.__b15T.scene.traverse((o) => { if ((o.isLineSegments || o.isPoints) && o.geometry.attributes.position) { const n = o.geometry.attributes.position.count, dr = o.geometry.drawRange.count; out.push([o.type, n, dr === Infinity ? n : Math.min(n, dr)]) } }); return out })
      await ctx.close()
    }
    const rain = (x) => x.find((e) => e[0] === 'LineSegments' && e[1] === 1120)
    const L = rain(r.light), S = rain(r.standard)
    return { pass: !!L && !!S && L[2] <= 700 && S[2] === 1120, detail: `雨筋の頂点（作る数・描く数）: 軽やか ${L ? L[1] + '・' + L[2] : 'なし'} ／ ふつう ${S ? S[1] + '・' + S[2] : 'なし'}` }
  },
  async D2() { // S60: LIGHT_GEN の三項を畳んだ
    const n = (read('src/engine/town3dViewer.js').match(/LIGHT_GEN/g) || []).length
    return { pass: n === 0, detail: `LIGHT_GEN ${n}` }
  },

  // ── 群E: 見た目 ──
  async E1() { // D1: 起動時の情景で、季節が合う情景があれば季節の違う情景を選ばない
    const { pickNowScene, SCENES } = await import('../src/data/scenes/index.js?' + Date.now())
    const pub = SCENES.filter((s) => s.status === 'ready' && s.public !== false)
    let bad = 0; const ex = []
    for (let m = 1; m <= 12; m++) for (const h of [7, 12, 17, 21]) { const s = pickNowScene(new Date(2026, m - 1, 15, h)); const season = m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'; if (pub.some((x) => x.axes.season === season) && s.axes.season !== season) { bad++; if (ex.length < 3) ex.push(`${m}月${h}時=${s.id}`) } }
    return { pass: bad === 0, detail: `48通りのうち季節の違う情景 ${bad}${ex.length ? '（' + ex.join(' ') + '）' : ''}` }
  },
  async E2() { // D4・V32・S53: 角部屋を縦で開いてから横へ回すと、横の最初の向き（-0.6）に決め直す
    const { p, ctx } = await open('autumn-dusk-corner-room')
    const y0 = await p.evaluate(() => window.__b15T.getActive().yawTarget)
    await p.setViewportSize({ width: 874, height: 402 }); await p.waitForTimeout(2500)
    const y1 = await p.evaluate(() => window.__b15T.getActive().yawTarget)
    await p.evaluate(() => window.dispatchEvent(new Event('resize'))); await p.waitForTimeout(1500)
    await p.screenshot({ path: `${SHOTS}/e2-corner-rotated.png` })
    // 見回した後に回しても、向きは変えない（人が決めた向きを奪わない）
    await p.evaluate(() => window.__town3dSetView(-0.9, 0)); await p.setViewportSize({ width: 402, height: 874 }); await p.waitForTimeout(2000)
    const y2 = await p.evaluate(() => window.__b15T.getActive().yawTarget)
    await ctx.close()
    return { pass: Math.abs(y0 + 1.12) < 0.01 && Math.abs(y1 + 0.6) < 0.01 && Math.abs(y2 + 0.9) < 0.01, detail: `縦で開いた向き ${y0.toFixed(2)}・横へ回した後 ${y1.toFixed(2)}・見回してから縦へ戻した後 ${y2.toFixed(2)}` }
  },
  async E3() { // V10・V17: 窓辺の錠と外の手すりが画面で重ならない（北寺尾と谷戸・iPhone と PC）
    const out = []
    for (const [scene, dev] of [['kitaterao-window-3d', 'iphone'], ['shishigaya-window-3d', 'iphone'], ['shishigaya-window-3d', 'pc'], ['kitaterao-window-3d', 'pc']]) {
      const { p, ctx } = await open(scene, { dev })
      const r = await p.evaluate(() => {
        const T = window.__b15T, V = T.THREE, cam = T.getActive().camera || T.camera
        cam.updateMatrixWorld(true)
        const box2 = (m) => { m.updateMatrixWorld(true); const bb = new V.Box3().setFromObject(m); const ys = []; for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const v = new V.Vector3(x, y, z).project(cam); ys.push([v.x, v.y]) } return { x0: Math.min(...ys.map((a) => a[0])), x1: Math.max(...ys.map((a) => a[0])), y0: Math.min(...ys.map((a) => a[1])), y1: Math.max(...ys.map((a) => a[1])) } }
        const lock = box2(T.lock)
        const rail = T.winRoom.children.find((o) => o.isMesh && o.visible && Math.abs(o.position.z + 0.55) < 0.01 && o.geometry.parameters && o.geometry.parameters.width > 2)
        const rb = box2(rail)
        const H = innerHeight
        const gapPx = Math.max(rb.y0 - lock.y1, lock.y0 - rb.y1) * H / 2 // 縦の離れ（負は重なり）
        return { gapPx: +gapPx.toFixed(1), lockH: +((lock.y1 - lock.y0) * H / 2).toFixed(1) }
      })
      out.push({ scene, dev, ...r }); await ctx.close()
    }
    return { pass: out.every((o) => o.gapPx >= 4), detail: out.map((o) => `${o.scene.replace('-window-3d', '')}/${o.dev} 錠と手すりの縦の離れ ${o.gapPx}px`).join('・') }
  },
  async E4() { // W2（V14・V21）: 降る物（雪・花びら・落ち葉・公園の舞い）の粒に丸いぼけた絵が付く
    const out = []
    for (const scene of ['kitaterao-window-3d-spring', 'shishigaya-window-3d-snow', 'kitaterao-window-3d-autumn']) {
      const { p, ctx } = await open(scene)
      out.push({ scene, ...(await p.evaluate(() => { let n = 0, square = 0; window.__b15T.scene.traverse((o) => { if (o.isPoints && o.material && o.material.isPointsMaterial) { n++; if (!o.material.map) square++ } }); return { n, square } })) })
      await ctx.close()
    }
    return { pass: out.every((o) => o.n > 0 && o.square === 0), detail: out.map((o) => `${o.scene.replace('-window-3d', '')} 粒の群 ${o.n}・四角のまま ${o.square}`).join('・') }
  },
  async E5() { // V20: 雪の谷戸の茅葺の屋根に雪が載る（雪冠の材）
    const { p, ctx } = await open('shishigaya-window-3d-snow')
    const r = await p.evaluate(() => { let n = 0, snow = 0; window.__b15T.scene.traverse((o) => { const m = o.material; if (o.isMesh && m && m.isMeshLambertMaterial && m.map && m.map.repeat && m.map.repeat.x === 3 && m.map.repeat.y === 2 && m.map.image && m.map.image.width === 64) { n++; if (m.customProgramCacheKey && /snowcap/.test(m.customProgramCacheKey())) snow++ } }); return { n, snow } })
    await ctx.close()
    return { pass: r.n >= 2 && r.snow === r.n, detail: `茅葺の屋根 ${r.n}・雪の載る材 ${r.snow}` }
  },
  async E7() { // V29: 朝の角部屋ではビルの窓が灯らない（夕の窓辺は灯る＝消し過ぎない）
    const r = {}
    for (const s of ['summer-morning-corner-room', 'spring-morning-corner-room', 'autumn-dusk-corner-room']) { const { p, ctx } = await open(s); r[s] = await p.evaluate(() => window.__town3dLookState ? window.__town3dLookState().litWinMats : window.__town3dLook().litWinMats); await ctx.close() }
    return { pass: r['summer-morning-corner-room'] === 0 && r['spring-morning-corner-room'] === 0 && r['autumn-dusk-corner-room'] > 0, detail: `光る窓の材: 夏の朝 ${r['summer-morning-corner-room']}・春の朝 ${r['spring-morning-corner-room']}・秋の夕 ${r['autumn-dusk-corner-room']}` }
  },
  async E8() { // V39: 雨の日は太陽の円盤を出さず、光輪も雪と同じく弱い（晴れの日は今のまま）
    const r = {}
    for (const s of ['kitaterao-window-3d-rain', 'kitaterao-window-3d']) { const { p, ctx } = await open(s); r[s] = await p.evaluate(() => { const { glow, disk } = window.__b15T.sun(); return { disk: disk ? (disk.visible ? +disk.material.opacity.toFixed(2) : 0) : 0, glow: glow ? +glow.material.opacity.toFixed(2) : 0 } }); await ctx.close() }
    const R = r['kitaterao-window-3d-rain'], S = r['kitaterao-window-3d']
    return { pass: R.disk === 0 && R.glow <= 0.2 && S.disk >= 0.9, detail: `雨: 円盤 ${R.disk}・光輪 ${R.glow} ／ 晴れ: 円盤 ${S.disk}・光輪 ${S.glow}` }
  },
  async E9() { // V58: 海辺の夕日の円盤が桟から外れて、まわりより明るい円として見える（iPhone・PC）
    const out = []
    for (const dev of ['iphone', 'pc']) {
      const { p, ctx } = await open('summer-dusk-seaside', { dev })
      await p.addStyleTag({ content: '.ui,.topbar,.hud,.lookhint,.toast,.stagedots,button{display:none !important}' }); await p.waitForTimeout(800)
      const f = `${SHOTS}/e9-seaside-${dev}.png`; await p.screenshot({ path: f })
      const { width: W, height: H } = DEVS[dev].viewport, k = DEVS[dev].deviceScaleFactor
      // 空（横桟より上・外の枠の内）で、いちばん明るい点と、その点から円盤の半径の 1.8 倍離れた輪の明るさ
      const r = await lumStats(p, f, [0, 0, W * k, Math.round(H * k * 0.46)], `
        let bx = 0, by = 0, bl = -1; const L = (i) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
        for (let y = Math.round(h * 0.15); y < h; y += 2) for (let x = Math.round(w * 0.06); x < w * 0.94; x += 2) { const s = L((y * w + x) * 4); if (s > bl) { bl = s; bx = x; by = y } }
        return { bx, by, bl, w, h }`)
      // 円盤の半径（画素）: 縦の画面の高さの 0.035 前後。輪は 2 倍の所の8点の平均
      const rad = Math.round(H * k * 0.045)
      const ring = await lumStats(p, f, [0, 0, W * k, Math.round(H * k * 0.46)], `
        const L = (x, y) => { x = Math.max(0, Math.min(w - 1, Math.round(x))); y = Math.max(0, Math.min(h - 1, Math.round(y))); const i = (y * w + x) * 4; return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] }
        let s = 0; for (let a = 0; a < 8; a++) s += L(${r.bx} + Math.cos(a * 0.785) * ${rad * 2}, ${r.by} + Math.sin(a * 0.785) * ${rad * 2}); return s / 8`)
      const barDist = Math.abs(r.bx - W * k / 2) / k
      out.push({ dev, barDist: +barDist.toFixed(0), contrast: +(r.bl - ring).toFixed(1) }); await ctx.close()
    }
    return { pass: out.every((o) => o.barDist >= 40 && o.contrast >= 25), detail: out.map((o) => `${o.dev} 縦の桟から ${o.barDist}px・円盤とまわりの明るさの差 ${o.contrast}`).join('・') }
  },
  async E10() { // V61: 海辺のかもめは縦の桟にかからない（桟の手前で消え、過ぎてから現れる）。鳥の通り道の式を描画で確かめる
    const { p, ctx } = await open('summer-dusk-seaside', { dev: 'pc' })
    await p.addStyleTag({ content: '.ui,.topbar,.hud,.lookhint,.toast,.stagedots,button{display:none !important}' })
    // 1羽目が桟に重なる時刻（prog=0.5 → t = 0.5/0.017）を、見回し0のまま描く。時刻は __b15Time で上書き
    const has = await p.evaluate(() => typeof window.__b15SetTime === 'function')
    let r = null
    if (has) {
      const shot = async (t, name) => { await p.evaluate((t) => window.__b15SetTime(t), t); await p.waitForTimeout(500); const f = `${SHOTS}/e10-${name}.png`; await p.screenshot({ path: f }); return f }
      const fOn = await shot((0.5 + 0.03 / 3.2) / 0.017, 'gull-on-bar'), fOff = await shot(0.5 / 0.017 + 9, 'gull-off-bar') // 鳥の真ん中が桟の右脇（翼が桟に半分かかる所）にいる時刻
      const W = 1920, H = 1080
      const dark = async (f) => lumStats(p, f, [W / 2 - 60, Math.round(H * 0.20), 120, Math.round(H * 0.20)], `let n = 0; for (let i = 0; i < px.length; i += 4) { const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; if (l < 120) n++ } return n`)
      r = { on: await dark(fOn), off: await dark(fOff) }
    }
    await ctx.close()
    return { pass: !!r && Math.abs(r.on - r.off) <= 10, detail: r ? `桟のまわりの暗い画素: 鳥が桟の所にいる時刻 ${r.on}・いない時刻 ${r.off}` : '時刻を上書きする口が無い（_bin15-vite.config.mjs）' }
  },
  async E11() { // V63: 山あいの太陽の円盤の中に光の筋が透けない（円盤の中の明るさのむらが小さい）
    const { p, ctx } = await open('summer-morning-mountains', { dev: 'pc' })
    await p.addStyleTag({ content: '.ui,.topbar,.hud,.lookhint,.toast,.stagedots,button{display:none !important}' }); await p.waitForTimeout(800)
    const f = `${SHOTS}/e11-mountain-pc.png`; await p.screenshot({ path: f })
    // 太陽の中心は ax=-0.25・vp.y=0.72（見回し0）→ 画面の x = 0.5 + (-0.25)/asp、y = 1-0.72
    // 円盤の半径は画面の高さの約 0.045。円盤の中の2つの輪（半径の 0.5・0.8 倍）に沿って 96 点の明るさを読み、輪に沿った揺れ（放射の筋の縞）を測る
    // 円盤の中心と半径は画から求める（いちばん明るい所から 4 以内の明るさの画素の重心と面積）。見回しの揺れで中心が数画素ずれても測れる
    const W = 1920, H = 1080, cx = Math.round(W * (0.5 - 0.25 / (W / H))), cy = Math.round(H * (1 - 0.72)), rr = Math.round(H * 0.08)
    const r = await lumStats(p, f, [cx - rr, cy - rr, rr * 2, rr * 2], `const L = (x, y) => { const i = (Math.round(y) * w + Math.round(x)) * 4; return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] }
      let mx = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mx = Math.max(mx, L(x, y))
      let sx = 0, sy = 0, n0 = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (L(x, y) >= mx - 4) { sx += x; sy += y; n0++ }
      // 円盤の芯（半径は画面の高さの 0.04＝${Math.round(H * 0.04)}px より内）の2つの輪に沿って 128 点を読み、隣どうしとの差（細かい縞＝16本の放射の筋）の平均を測る。空の上下のゆるやかな明るさの差は拾わない
      const X = sx / n0, Y = sy / n0, R = ${Math.round(H * 0.04)}, out = [+Math.sqrt(n0 / Math.PI).toFixed(1)]
      // 放射の筋は角度の 16 倍の縞（windowMountains.js の sin(atan(..)*16)）。輪に沿った明るさの 16 周期の成分の振幅を測る（画の細かいノイズは打ち消し合う）
      for (const k of [0.5, 0.85]) { const n = 256; let re = 0, im = 0; for (let a = 0; a < n; a++) { const th = a / n * 6.2832, l = L(X + Math.cos(th) * R * k, Y + Math.sin(th) * R * k); re += l * Math.cos(16 * th); im += l * Math.sin(16 * th) } out.push(+(2 * Math.hypot(re, im) / n).toFixed(3)) } return out`)
    await ctx.close()
    return { pass: r[0] > 15 && Math.max(r[1], r[2]) <= 0.25, detail: `円盤の明るい芯の半径 ${r[0]}px・円盤の中の輪に沿った 16 本の筋の縞の強さ（明るさの振幅）: 半径の 0.5 倍 ${r[1]}・0.85 倍 ${r[2]}` }
  },
  async E12() { // V79: 入口の四辺に明るい細い縁が出ない（端の2画素と内側の明るさの差）
    const out = []
    for (const dev of ['pc', 'iphone']) {
      const b = await launch(); const ctx = await b.newContext(DEVS[dev]); const p = await ctx.newPage()
      await p.goto(BASE + '?dev=1', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
      const f = `${SHOTS}/e12-gate-${dev}.png`; await p.screenshot({ path: f })
      const { width: W, height: H } = DEVS[dev].viewport, k = DEVS[dev].deviceScaleFactor
      const r = await lumStats(p, f, [0, 0, W * k, H * k], `const L = (x, y) => { const i = (y * w + x) * 4; return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2] }
        let e = 0, ne = 0, s = 0, ns = 0; for (let y = 4; y < h - 4; y += 3) { e += L(0, y) + L(1, y) + L(w - 1, y) + L(w - 2, y); ne += 4; s += L(12, y) + L(w - 13, y); ns += 2 } for (let x = 4; x < w - 4; x += 3) { e += L(x, 0) + L(x, 1) + L(x, h - 1) + L(x, h - 2); ne += 4; s += L(x, 12) + L(x, h - 13); ns += 2 } return +(e / ne - s / ns).toFixed(2)`)
      out.push({ dev, d: r }); await ctx.close()
    }
    return { pass: out.every((o) => o.d <= 3), detail: out.map((o) => `${o.dev} 端と内側の明るさの差 ${o.d}`).join('・') }
  },
  async E13() { // V70・W7: 角部屋のサムネを今の角部屋で撮り直した・撮り直しの台本がある
    const has = fs.existsSync('scripts/make-thumbs.mjs')
    let changed = false
    try { const old = execSync('git show 35a5cb6:public/thumbs/autumn-dusk-corner-room.jpg', { maxBuffer: 1 << 24 }); changed = !old.equals(fs.readFileSync('public/thumbs/autumn-dusk-corner-room.jpg')) } catch { changed = false }
    return { pass: has && changed, detail: `撮り直しの台本 ${has ? 'あり' : 'なし'}・角部屋のサムネ ${changed ? '撮り直した' : '前のまま'}` }
  },

  // ── 群F: 使っていない素材とコードを消す（#1=1） ──
  async F1() { // S17: 生成BGM（下地の和音）と onScene の計算
    const a = read('src/audio/audio.js'), m = read('src/main.js'), t = read('src/engine/town3dViewer.js')
    const left = [/startMusicBed|setMusicBed|bedNodes|VOICE\s*=/.test(a) && 'audio.js', /setMusicBed|onScene/.test(m) && 'main.js', /onScene\(/.test(t) && 'town3dViewer.js'].filter(Boolean)
    return { pass: left.length === 0, detail: `残る所 ${left.join(' ') || 'なし'}` }
  },
  async F2() { // S61: 奥の写真の遠景
    const scenes = fs.readdirSync('src/data/scenes').filter((f) => /bg3d/.test(read('src/data/scenes/' + f)))
    const imgs = fs.readdirSync('public/bg').filter((f) => /^town3d-/.test(f))
    const code = /USE_PHOTO_BACKDROP|bg3d/.test(read('src/engine/town3dViewer.js') + read('src/main.js'))
    return { pass: scenes.length === 0 && imgs.length === 0 && !code && !/town3d-day\.jpg/.test(read('CREDITS.md')), detail: `bg3d の情景 ${scenes.length}・画像 ${imgs.length}・コード ${code ? 'あり' : 'なし'}` }
  },
  async F3() { // S62・S63: 承認済みの「前の形へ戻す」印13個・?fullcss の道・--light
    const t = read('src/engine/town3dViewer.js'), css = read('src/style.css')
    const marks = ['YATO_SEAT', 'RAIL_ONE', 'LAMP_UP', 'LAMP_BACK', 'CURT_SHADE', 'CHIME_OUT', 'DUST_IN_LIGHT', 'NIGHT_LAMP', 'CORNER_YAW', 'winSide', 'SMOKE_SPRITES', 'MTN_RIDGED', 'CLOUD_SEA_SHEET', 'USE_PHOTO_BACKDROP', 'FULLCSS', 'fullcss', 'town3d-stage--light']
    const left = marks.filter((k) => new RegExp('\\b' + k.replace(/-/g, '\\-') + '\\b').test(t))
    const cssLeft = ['town3d-stage--light', 'town3d-atmo', 'town3d-wash', 'town3d-paper', 'town3d-bleed'].filter((k) => css.includes(k))
    return { pass: left.length === 0 && cssLeft.length === 0, detail: `残る印 ${left.join(' ') || 'なし'}・残る CSS ${cssLeft.join(' ') || 'なし'}` }
  },
  async F4() { // S64〜S67: 呼ばれない段の枝・旧の定数と口・撤去した描画の種類の名・2Dシェーダー6本
    const t = read('src/engine/town3dViewer.js'), ui = read('src/ui/ui.js'), idx = read('src/data/scenes/index.js'), sh = read('src/shaders/index.js')
    const left = []
    if (/setQuality/.test(t)) left.push('setQuality'); if (/if \(s\.quality/.test(t)) left.push('quality の枝')
    if (/turnRate|turnEase|__town3dClimb/.test(t)) left.push('旧の定数と口')
    const arr = (name) => { const i = ui.indexOf('const ' + name + ' = ['); return i < 0 ? '' : ui.slice(i, ui.indexOf(']', i)) }
    for (const k of ['cornerRoom', 'windowTown', 'kitateraoRooftop', 'photoWindow', 'windowPano', 'shishigaya']) if (arr('WINDOW_SCENES').includes(k) || arr('LOOKABLE').includes(k) || idx.includes("'" + k + "'")) left.push(k)
    for (const k of ['かすみを払う', '実写の窓', 'photoWindow']) if (ui.includes(k)) left.push(k)
    const shaders = ['clearSky', 'windowTown', 'windowPano', 'shishigaya', 'kitateraoRooftop', 'photoWindow']
    for (const s of shaders) if (sh.includes(s) || fs.existsSync(`src/shaders/${s}.js`)) left.push('shaders/' + s)
    return { pass: left.length === 0, detail: `残る物 ${left.join(' ') || 'なし'}` }
  },
  async F5() { // S68・S69: スプラット・引退した素材
    const ex = (f) => fs.existsSync(f)
    const left = ['public/splat', 'public/pano', 'src/engine/splatViewer.js', 'public/audio/summer-clear-noon', 'public/audio/summer-dusk-downtown'].filter(ex)
    const pk = JSON.parse(read('package.json')); if (pk.dependencies['@mkkellogg/gaussian-splats-3d']) left.push('package.json のスプラット')
    if (/gaussian-splats/.test(read('package-lock.json'))) left.push('package-lock.json のスプラット')
    const photos = fs.readdirSync('public/bg').filter((f) => /^photo-window-/.test(f)); if (photos.length) left.push(`写真の窓の背景 ${photos.length}`)
    const { SCENES } = await import('../src/data/scenes/index.js'); const ids = new Set(SCENES.map((s) => s.id))
    const thumbs = fs.readdirSync('public/thumbs').filter((f) => !ids.has(f.replace(/\.jpg$/, ''))); if (thumbs.length) left.push(`引退したサムネ ${thumbs.length}`)
    if (/splat/i.test(read('src/main.js'))) left.push('main.js のスプラット')
    return { pass: left.length === 0, detail: `残る物 ${left.join('・') || 'なし'}` }
  },
  async F6() { // S70: 引退した情景や素材の名を参照する検査の台本
    const re = /photo-window|photoWindow|kitaterao-rooftop|kitateraoRooftop|summer-clear-noon|summer-dusk-downtown|summer-rain-night-downtown|winter-snow-night-downtown|shishigaya-morning-yato['"]|splat|\/pano\/|fullcss|cornerRoom|windowTown|clearSky|windowPano/
    const left = fs.readdirSync('scripts').filter((f) => /\.(mjs|js)$/.test(f) && !/^_bin15-/.test(f) && f !== 'qa-backlog.mjs' && re.test(read('scripts/' + f)))
    return { pass: left.length === 0, detail: `引退した名を参照する台本 ${left.length}${left.length ? '（' + left.slice(0, 5).join(' ') + '…）' : ''}` }
  },
  async F7() { // S71: 音の検証の口（_dbg・getDebug・getLookPan）を本番のビルドに入れない
    const dir = 'dist/assets'; if (!fs.existsSync(dir)) return { pass: false, detail: 'dist が無い（npm run build の後に回す）' }
    const hit = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && /getLookPan|getDebug|_dbg\(\)/.test(read(dir + '/' + f)))
    return { pass: hit.length === 0, detail: `本番のビルドで口が残るファイル ${hit.length}` }
  },
  async F8() { // #1 の約束: 消す前（35a5cb6）と後（f6e5693）の代表の眺めの差が、同じコードを2回撮った差の内（撮影は済み・docs/qa/2026-11-02_便15/gate/F8.txt の経緯）
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync('node', ['scripts/_bin15-same.mjs', 'judge', 'before1r', 'before2r', 'afterr2'], { encoding: 'utf8', shell: process.platform === 'win32' })
    const last = (r.stdout || '').trim().split('\n').slice(-1)[0]
    return { pass: r.status === 0, detail: `${last}（9眺め）` }
  },
}

const ids = process.argv.slice(2)
const run = ids.length === 0 || ids.includes('all') ? Object.keys(CHECKS) : ids
const res = {}
const file = `${OUT}/kensa.json`
const prev = fs.existsSync(file) ? JSON.parse(read(file)) : {}
let fail = 0
for (const id of run) {
  const t0 = Date.now()
  try { res[id] = await CHECKS[id]() } catch (e) { res[id] = { pass: false, detail: '例外: ' + String(e && e.message || e).slice(0, 300) } }
  res[id].sec = Math.round((Date.now() - t0) / 1000)
  if (!res[id].pass) fail++
  console.log(`${id} ${res[id].pass ? '合格' : '不合格'}: ${res[id].detail}`)
}
if (browser) await browser.close()
fs.writeFileSync(file, JSON.stringify({ ...prev, ...res, _at: new Date().toISOString() }, null, 1))
console.log(`検査の終わり: ${run.length - fail}/${run.length} 合格`)
process.exit(fail ? 1 : 0)
