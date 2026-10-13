// 便4（2026-10-13・設計案から作る便・便3 #1=1 #2=2）の検査。計画表 docs/qa/2026-10-13_便4/計画表.md の行ごとに1つの検査を持つ。
// 使い方: 開発サーバーを npx vite --config scripts/_bin4-vite.config.mjs（4961）で起動してから  node scripts/qa-bin4.mjs <ID…|all>
//   QA_OUT=…（既定 docs/qa/2026-10-13_便4/gate。前は gate-before）／QA_BEFORE=…（前の記録の置き場・既定 docs/qa/2026-10-13_便4/gate-before）／QA_SHOT=前|後（画の札）
// 各検査は { pass, …測った数 } を返し、QA_OUT/<ID>.json に書く。1つでも不合格なら終わりの値 1。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { SCENES } from '../src/data/scenes/index.js'

const BASE = process.env.QA_BASE || 'http://localhost:4961/seasons/'
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-13_便4/gate'
const BEFORE = process.env.QA_BEFORE || 'docs/qa/2026-10-13_便4/gate-before'
const SHOT_TAG = process.env.QA_SHOT || ''
const SHOT_DIR = 'docs/確認用スクショ/seasons/2026-10-13_便4'
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const DEVICES = {
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const beforeOf = (id) => { try { return JSON.parse(fs.readFileSync(path.join(BEFORE, `${id}.json`), 'utf8')) } catch { return null } }

let browser = null
async function getBrowser() {
  if (!browser) browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
  return browser
}
// 起動の情景を検査の情景に固定する（起動の情景は時刻で替わるため・便2 の pinStart と同じ）
const pinStart = (sid) => { try { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.sceneId = sid; st.sceneAt = Date.now(); localStorage.setItem(k, JSON.stringify(st)) } catch { /* 無視 */ } }
// 撮影用の口（_bin4-vite.config.mjs が差し込む __shGet）から、描画の直前にカメラを置く・描画の時間を測る・水の面を切り出す
const INJECT = () => {
  const S = (window.__b4 = { cam: null, ms: [], calls: [], measure: false })
  S.setup = () => {
    const g = window.__shGet && window.__shGet(); if (!g || !g.composer) return false
    if (S.ready === g.composer) return true // 情景を替えると後処理の部品が作り直されるので、新しい物をつかみ直す
    const { renderer, camera, composer } = g
    const orig = composer.render.bind(composer)
    composer.render = (...a) => {
      const c = S.cam
      if (c) { camera.position.set(...c.p); camera.lookAt(...c.l); if (c.fov && camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix() } camera.updateMatrixWorld() }
      const t0 = performance.now()
      const ar = renderer.info.autoReset; renderer.info.autoReset = false; renderer.info.reset()
      const r = orig(...a)
      if (S.measure) { renderer.getContext().finish(); S.ms.push(performance.now() - t0); S.calls.push(renderer.info.render.calls) }
      renderer.info.autoReset = ar
      return r
    }
    S.ready = composer
    return true
  }
  S.measureNow = async (n = 60) => {
    S.ms = []; S.calls = []; S.measure = true
    const tEnd = performance.now() + 8000 // 後処理を通らない描画（iPhone の段など）では測れないので、8秒で打ち切る
    await new Promise((res) => { const tick = () => (S.ms.length >= n || performance.now() > tEnd ? res() : requestAnimationFrame(tick)); tick() })
    S.measure = false
    if (!S.ms.length) return { ms: null, calls: null, n: 0 }
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
    return { ms: +med(S.ms).toFixed(2), calls: med(S.calls), n: S.ms.length }
  }
  // 水の面（川・池・棚田・堀の共有の材と、海の材）
  S.waterMeshes = () => {
    const out = []
    window.__shGet().scene.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return
      const k = o.material.customProgramCacheKey && o.material.customProgramCacheKey()
      if (k === 'freshWater') out.push(o)
      else if (o.geometry && o.geometry.parameters && o.geometry.parameters.width === 1760) out.push(o)
    })
    return out
  }
  const toImg = (url) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); res(x.getImageData(0, 0, im.width, im.height)) }; im.src = url })
  const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  // 水の面を隠した1枚との差で水の画素を決め、その中の明るさの平均・ばらつきを返す（前の画があれば差も）
  S.waterStats = async (cam, beforeUrl) => {
    const [x, y, z, lx, ly, lz, fov] = cam
    const url = window.__town3dShotAt(x, y, z, lx, ly, lz, fov)
    const ws = S.waterMeshes(); for (const o of ws) o.userData.__b4v = o.visible, o.visible = false
    const urlNo = window.__town3dShotAt(x, y, z, lx, ly, lz, fov)
    for (const o of ws) o.visible = o.userData.__b4v
    const a = await toImg(url), b = await toImg(urlNo), pre = beforeUrl ? await toImg(beforeUrl) : null
    let n = 0, s = 0, s2 = 0, dPre = 0
    const mask = []
    for (let i = 0; i < a.data.length; i += 4) {
      if (Math.abs(lum(a.data, i) - lum(b.data, i)) > 6) { const L = lum(a.data, i); n++; s += L; s2 += L * L; mask.push(i); if (pre) dPre += Math.abs(L - lum(pre.data, i)) }
    }
    const mean = n ? s / n : 0
    return { url, waterPx: n, waterFrac: +(n / (a.width * a.height)).toFixed(3), mean: +mean.toFixed(1), std: +(n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : 0).toFixed(1), diffBefore: pre && n ? +(dPre / n).toFixed(1) : null, meshes: ws.length }
  }
  // 同じ瞬間に2枚撮って差を測る（動く物の差を入れない）。fnA・fnB は撮る前に呼ぶ
  S.pairDiff = async (cam, setA, setB) => {
    const [x, y, z, lx, ly, lz, fov] = cam
    setA(); const ua = window.__town3dShotAt(x, y, z, lx, ly, lz, fov)
    setB(); const ub = window.__town3dShotAt(x, y, z, lx, ly, lz, fov)
    const a = await toImg(ua), b = await toImg(ub)
    let s = 0, big = 0; const N = a.width * a.height
    for (let i = 0; i < a.data.length; i += 4) { const d = Math.abs(lum(a.data, i) - lum(b.data, i)); s += d; if (d >= 8) big++ }
    return { ua, ub, meanDiff: +(s / N).toFixed(2), over8: +(big / N).toFixed(3) }
  }
  // 画面の帯（上からの割合 y0..y1）の明るさの平均と、ほぼ白（235以上）の割合
  S.bandLum = async (url, y0, y1) => {
    const a = await toImg(url); let s = 0, n = 0, w = 0
    for (let y = Math.floor(a.height * y0); y < Math.floor(a.height * y1); y++) for (let x = 0; x < a.width; x++) { const i = (y * a.width + x) * 4; const L = lum(a.data, i); s += L; n++; if (L >= 235) w++ }
    return { mean: +(s / n).toFixed(1), white: +(w / n).toFixed(3) }
  }
}

async function open(dev, scene, { win = true } = {}) {
  const b = await getBrowser()
  const ctx = await b.newContext(DEVICES[dev])
  if (dev === 'iphone') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }) })
  await ctx.addInitScript(pinStart, scene)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PE: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest|preload/i.test(m.text())) errs.push('CE: ' + m.text().slice(0, 200)) })
  await page.goto(BASE + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(2500)
  await page.waitForSelector('.gate', { timeout: 15000 }).catch(() => {})
  await page.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {})
  await page.waitForSelector('.gate', { state: 'detached', timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await page.evaluate((s) => window.__applyScene(s), scene)
  await page.waitForTimeout(11000)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .stagedots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"]{display:none !important}' })
  if (win) { await page.evaluate(() => window.__town3dWindow(true)); await page.waitForTimeout(3000) }
  await page.evaluate(INJECT)
  const ok = await page.evaluate(() => window.__b4.setup())
  await page.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) }) // 日の傾きを頭に戻す（前と後で同じ時刻）
  return { ctx, page, errs, ok }
}
// 飛行に切り替えて、描画の直前にカメラを置く（便3 の撮り方と同じ。自機はカメラのすぐ後ろ）
async function placeCam(page, cam) {
  const [x, y, z, lx, ly, lz, fov] = cam
  await page.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
  const dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, -dz)
  await page.evaluate((a) => window.__town3dFlyPose(...a), [x - dx / d * 5, y, z - dz / d * 5, yaw, 0]); await wait(1500)
  await page.evaluate((c) => { window.__b4.cam = c }, { p: [x, y, z], l: [lx, ly, lz], fov })
  await wait(7000) // 飛行に入った直後の霧の移り変わりが落ち着くまで
}
async function shot(page, name) {
  if (!SHOT_TAG) return null
  const f = path.join(SHOT_DIR, `${name}_${SHOT_TAG}.png`)
  const vp = page.viewportSize()
  await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.move(vp.width / 2 + 1, vp.height / 2 + 1); await wait(1200)
  await page.screenshot({ path: f })
  return f.replace(/\\/g, '/')
}
const saveUrl = (url, name) => { const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); return f.replace(/\\/g, '/') }
const readUrl = (f) => { try { return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') } catch { return null } }
const hasMist = (page) => page.evaluate(() => typeof window.__town3dMist === 'function')

// ── 見る所（カメラの位置・注視点・画角）。池・川・低空飛行は便3 の案の画と同じ ──
const CAM = {
  pond: [16, 0, -40, 16, -4.4, -22, 60],
  river: [-50, 16, 34, -52, -8, -25, 60],
  sea: [-240, 12, -20, -330, -10, -120, 60], // 西の海岸から沖を見る（東の海は岩の島が多い）
  flylow: [9.8, 48, 38.8, -19.4, -15.9, -32.4, 73.6],
}

const CHECKS = {}
const def = (id, fn) => { CHECKS[id] = fn }

// W1 川・池・棚田・堀の水（共有の材 freshWater）が空と雲を映す: 池と川の水の画素が前と変わり（差の平均 ≥ 6）、空の色が映って前より明るい（平均 ≥ 前＋5）。
//   初めは「ばらつきが前＋2 以上」を線にしたが、案1（便3 の画）は水が一様な空の色になり、前の暗い影の濃淡が消えてばらつきは下がる（池 28.6→9.5）ので、狙いと逆向きだった（便4 の決めたこと）
def('W1', async () => {
  const { page, errs } = await open('pc', 'kitaterao-window-3d')
  const res = {}
  for (const v of ['pond', 'river']) {
    const pre = readUrl(path.join(BEFORE, `W1_${v}.png`))
    const r = await page.evaluate(([c, p]) => window.__b4.waterStats(c, p), [CAM[v], pre])
    r.file = saveUrl(r.url, `W1_${v}.png`); delete r.url
    const b = beforeOf('W1'); const bs = b && b[v]
    r.stdBefore = bs ? bs.std : null; r.meanBefore = bs ? bs.mean : null
    r.pass = !!bs && r.waterPx > 2000 && r.diffBefore >= 6 && r.mean >= bs.mean + 5
    res[v] = r
  }
  res.shot_pond = await (async () => { if (!SHOT_TAG) return null; await placeCam(page, CAM.pond); return shot(page, 'W1_池_pc') })()
  res.shot_river = await (async () => { if (!SHOT_TAG) return null; await page.evaluate((c) => { window.__b4.cam = { p: c.slice(0, 3), l: c.slice(3, 6), fov: c[6] } }, CAM.river); await wait(2500); return shot(page, 'W1_川_pc') })()
  return { pass: res.pond.pass && res.river.pass && errs.length === 0, ...res, errs }
})
// W2 海の材が空と雲を映す: 海の画素が前と変わり（差の平均 ≥ 6）、前より明るい（平均 ≥ 前＋3。海は地の色がもう明るいので池より小さい）
def('W2', async () => {
  const { page, errs } = await open('pc', 'kitaterao-window-3d')
  const pre = readUrl(path.join(BEFORE, 'W2_sea.png'))
  const r = await page.evaluate(([c, p]) => window.__b4.waterStats(c, p), [CAM.sea, pre])
  r.file = saveUrl(r.url, 'W2_sea.png'); delete r.url
  const b = beforeOf('W2')
  r.stdBefore = b ? b.std : null; r.meanBefore = b ? b.mean : null
  let sh = null
  if (SHOT_TAG) { await placeCam(page, CAM.sea); sh = await shot(page, 'W2_海_pc') }
  return { ...r, pass: !!b && r.waterPx > 5000 && r.diffBefore >= 6 && r.mean >= b.mean + 3 && errs.length === 0, shot: sh, errs }
})
// F1 低く溜まる霧の層: 同じ瞬間に、霧の層あり・なし（強さ0）を撮った差が、低空飛行の眺め（昼）で平均 ≥ 0.5・8段以上変わる画素 ≥ 0.5%。
//   初めの線（平均 ≥ 2）は昼の薄さ（時間帯の決め＝昼は薄く）を考えていなかった。層を外すと差は 0 になる
def('F1', async () => {
  const { page, errs } = await open('pc', 'kitaterao-window-3d')
  if (!(await hasMist(page))) return { pass: false, note: '霧の層の口（__town3dMist）が無い', errs }
  const r = await page.evaluate(async (c) => { const o = await window.__b4.pairDiff(c, () => window.__town3dMist(null), () => window.__town3dMist({ amount: 0 })); window.__town3dMist(null); return o }, CAM.flylow)
  const fa = saveUrl(r.ua, 'F1_on.png'), fb = saveUrl(r.ub, 'F1_off.png'); delete r.ua; delete r.ub
  let sh = null
  if (SHOT_TAG) { await placeCam(page, CAM.flylow); sh = await shot(page, 'F1_低空_pc') }
  return { pass: r.meanDiff >= 0.5 && r.over8 >= 0.005 && errs.length === 0, ...r, on: fa, off: fb, shot: sh, errs }
})
// F2 霧の濃淡が流れる: 夕方（霧が濃い時間帯）の低空飛行で、同じ瞬間に流れの位置だけを60m ずらした2枚の差の平均 ≥ 0.3（流れを外すと 0）・流れの位置が1秒ごとに進む
def('F2', async () => {
  const { page, errs } = await open('pc', 'kitaterao-window-3d-sunset')
  if (!(await hasMist(page))) return { pass: false, note: '霧の層の口（__town3dMist）が無い', errs }
  const r = await page.evaluate(async (c) => { const o = await window.__b4.pairDiff(c, () => window.__town3dMist({ off: 0 }), () => window.__town3dMist({ off: 60 })); window.__town3dMist(null); return o }, CAM.flylow)
  const fa = saveUrl(r.ua, 'F2_off0.png'), fb = saveUrl(r.ub, 'F2_off60.png'); delete r.ua; delete r.ub
  // 流れの速さ（1秒あたりに流れの位置が進む距離）も記録する
  const sp = await page.evaluate(async () => { const a = window.__town3dMist().off; await new Promise((r) => setTimeout(r, 3000)); const b = window.__town3dMist().off; return +((b - a) / 3).toFixed(3) })
  return { pass: r.meanDiff >= 0.3 && sp > 0 && errs.length === 0, ...r, flowPerSec: sp, a: fa, b: fb, errs }
})
// F3 時間帯と情景ごとの濃さをデータで持つ: 町が使う値がデータ（src/data/mist.js の mistFor）と一致し、昼は夕方・朝より薄い
def('F3', async () => {
  let mistFor = null
  try { mistFor = (await import('../src/data/mist.js')).mistFor } catch { return { pass: false, note: 'src/data/mist.js が無い' } }
  const ids = ['kitaterao-window-3d', 'kitaterao-window-3d-sunset', 'shishigaya-window-3d', 'kitaterao-window-3d-snow', 'kitaterao-window-3d-night']
  const rows = {}
  for (const id of ids) {
    const { page, ctx, errs } = await open('pc', id, { win: false })
    const got = (await hasMist(page)) ? await page.evaluate(() => window.__town3dMist()) : null
    const want = mistFor(SCENES.find((s) => s.id === id))
    const same = !!got && ['base', 'scale', 'density', 'amount', 'flow'].every((k) => Math.abs(got[k] - want[k]) < 1e-6)
    rows[id] = { got: got && { base: got.base, scale: got.scale, density: got.density, amount: got.amount, flow: got.flow }, want, same, errs }
    await ctx.close()
  }
  const d = (id) => rows[id].want.density
  const order = d('kitaterao-window-3d') < d('kitaterao-window-3d-sunset') && d('kitaterao-window-3d') < d('shishigaya-window-3d')
  return { pass: Object.values(rows).every((r) => r.same && r.errs.length === 0) && order, order, rows }
})
// G1 雪の窓・夜の窓・夕方の窓が白く沈まない: 窓の外の帯の明るさの平均が前±8 以内・ほぼ白の割合が前＋0.02 以内（守り。直しに結び付けない）
def('G1', async () => {
  const b = beforeOf('G1')
  const res = {}
  for (const [id, dev] of [['kitaterao-window-3d-snow', 'pc'], ['kitaterao-window-3d-night', 'pc'], ['kitaterao-window-3d-sunset', 'pc'], ['kitaterao-window-3d-sunset', 'iphone']]) {
    const { page, ctx, errs } = await open(dev, id)
    await wait(1500)
    const f = path.join(OUT, `G1_${id}_${dev}.png`); await page.screenshot({ path: f })
    const url = readUrl(f)
    const st = await page.evaluate((u) => window.__b4.bandLum(u, 0.15, 0.85), url)
    const k = `${id}_${dev}`, pb = b && b[k]
    let sh = null; if (SHOT_TAG) { const s = path.join(SHOT_DIR, `G1_${id}_${dev}_${SHOT_TAG}.png`); fs.copyFileSync(f, s); sh = s.replace(/\\/g, '/') }
    res[k] = { ...st, before: pb ? { mean: pb.mean, white: pb.white } : null, pass: !!pb && Math.abs(st.mean - pb.mean) <= 8 && st.white <= pb.white + 0.02 && errs.length === 0, shot: sh, errs }
    await ctx.close()
  }
  return { pass: Object.values(res).every((r) => r.pass), ...res }
})
// K5 iPhone の重さ: 窓辺・夕方・飛行・歩行の描画の呼び出しと描く画素数が前の1.05倍以下（便2 の K5 と同じ物差し）。描画の時間は記録だけ
def('K5', async () => {
  const b = beforeOf('K5')
  const { page, errs } = await open('iphone', 'kitaterao-window-3d', { win: false })
  const draw = () => page.evaluate(() => window.__town3dDraw && window.__town3dDraw())
  const ms = () => page.evaluate(() => window.__b4.measureNow(60))
  const after = {}
  after.window = { ...(await draw()), time: await ms() }
  await page.evaluate((s) => window.__applyScene(s), 'kitaterao-window-3d-sunset'); await wait(11000)
  await page.evaluate(() => window.__b4.setup()); await page.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
  after.sunset = { ...(await draw()), time: await ms() }
  await page.evaluate((s) => window.__applyScene(s), 'kitaterao-window-3d'); await wait(11000)
  await page.evaluate(() => window.__b4.setup()); await page.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
  await page.evaluate(() => window.__town3dWindow(true)); await wait(2200)
  await page.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
  await page.evaluate(() => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.2)); await wait(3000)
  after.fly = { ...(await draw()), time: await ms() }
  await page.evaluate(() => window.__town3dFlyPose(2, 6, -18, Math.PI, -0.05)); await wait(800)
  await page.evaluate(() => window.__town3dLandToggle(true)); await wait(3500)
  after.walk = { ...(await draw()), time: await ms() }
  const keep = (v) => v && { calls: v.calls, px: v.px, ms: v.time && v.time.ms }
  const ok = (k) => !!b && after[k] && after[k].calls <= b.after[k].calls * 1.05 && after[k].px <= b.after[k].px * 1.05
  return { pass: ['window', 'sunset', 'fly', 'walk'].every(ok) && errs.length === 0, before: b && b.after, after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, keep(v)])), errs }
})

// ── 実行 ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
let ids = []
for (const a of argv) { if (a === 'all') ids.push(...Object.keys(CHECKS)); else ids.push(a) }
ids = [...new Set(ids)]
if (!ids.length) { console.log('使い方: node scripts/qa-bin4.mjs <ID…|all>  検査:', Object.keys(CHECKS).join(' ')); process.exit(2) }
let fail = 0
const summary = {}
for (const id of ids) {
  const fn = CHECKS[id]
  if (!fn) { console.log(`${id} 検査なし`); fail++; continue }
  const t0 = Date.now()
  let r
  try { r = await fn() } catch (e) { r = { pass: false, threw: String(e && e.stack || e).slice(0, 400) } }
  r.id = id; r.ms = Date.now() - t0; r.at = new Date().toISOString()
  try { r.commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* 無視 */ }
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(r, null, 1))
  summary[id] = r.pass
  if (!r.pass) fail++
  console.log(`${id} ${r.pass ? '合格' : '不合格'} (${(r.ms / 1000).toFixed(1)}秒)`)
  if (browser) { for (const c of browser.contexts()) await c.close().catch(() => {}) }
}
if (browser) await browser.close()
const passN = Object.values(summary).filter(Boolean).length
console.log(`検査の終わり: ${passN}/${ids.length} 合格`)
fs.writeFileSync(path.join(OUT, '_last-run.json'), JSON.stringify({ at: new Date().toISOString(), ids, summary, pass: passN, total: ids.length }, null, 1))
process.exit(fail ? 1 : 0)
