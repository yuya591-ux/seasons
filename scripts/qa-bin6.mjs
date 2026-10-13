// 便6（2026-10-13・設計案から作る便・便5 #1=2 #2=1）の検査。計画表 docs/qa/2026-10-13_便6/計画表.md の行ごとに1つの検査を持つ。
// 使い方: 開発サーバーを npx vite --config scripts/_bin6-vite.config.mjs（4963）で起動してから  node scripts/qa-bin6.mjs <ID…|all>
//   QA_OUT=…（既定 docs/qa/2026-10-13_便6/gate。前は gate-before）／QA_BEFORE=…（前の記録の置き場・既定 docs/qa/2026-10-13_便6/gate-before）／QA_SHOT=前|後（画の札）
// 各検査は { pass, …測った数 } を返し、QA_OUT/<ID>.json に書く。1つでも不合格なら終わりの値 1。
// 眺めの画（PC 1920×1080）は QA_OUT/<眺め>.png に全体を残し、見た目の数は決まった切り抜き（CROP）で測る。前の数は QA_BEFORE の同じ名前の画から測る。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE = process.env.QA_BASE || 'http://localhost:4963/seasons/'
const BASE_BEFORE = process.env.QA_BASE_BEFORE || 'http://localhost:4964/seasons/' // KT が使う前のコード（復元地点 638da84 を別の作業フォルダに出し、_bin6-vite.config.mjs の番号を 4964 にして起動）
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-13_便6/gate'
const BEFORE = process.env.QA_BEFORE || 'docs/qa/2026-10-13_便6/gate-before'
const SHOT_TAG = process.env.QA_SHOT || ''
const SHOT_DIR = 'docs/確認用スクショ/seasons/2026-10-13_便6'
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
// 撮影用の口（_bin6-vite.config.mjs が差し込む __shGet・__b6R）から、描画の直前にカメラを置く・描画の時間を測る・木を調べる
const INJECT = () => {
  const S = (window.__b6 = { cam: null, ms: [], calls: [], measure: false })
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
    const tEnd = performance.now() + 8000 // 後処理を通らない描画では測れないので、8秒で打ち切る
    await new Promise((res) => { const tick = () => (S.ms.length >= n || performance.now() > tEnd ? res() : requestAnimationFrame(tick)); tick() })
    S.measure = false
    if (!S.ms.length) return { ms: null, calls: null, n: 0 }
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
    return { ms: +med(S.ms).toFixed(2), calls: med(S.calls), n: S.ms.length }
  }
  // 木を調べる: 位置の並び（町の配置）・樹種・木ごとの色の明るさ・葉の模様と葉の板の有無
  S.treeInfo = () => {
    const R = window.__b6R; if (!R || !R.trees) return null
    const pos = [], sp = {}, lum = [], lumMaru = [], pink = []
    let mapN = 0, alphaN = 0, cardTris = 0
    for (const tg of R.trees) {
      pos.push([+tg.position.x.toFixed(2), +tg.position.z.toFixed(2)])
      const lm = tg.children.find((c) => c.isMesh); if (!lm) continue
      const k = (lm.userData && lm.userData.sp) || 'なし'; sp[k] = (sp[k] || 0) + 1
      const m = (tg.userData && tg.userData.origMat) || lm.material
      if (m.map) mapN++
      if (m.alphaTest > 0) alphaN++
      cardTris += (lm.userData && lm.userData.cardTris) || 0
      const c = lm.geometry.attributes.color
      let s = 0; if (c) { for (let i = 0; i < c.count; i++) s += 0.299 * c.getX(i) + 0.587 * c.getY(i) + 0.114 * c.getZ(i); s /= c.count }
      lum.push(+s.toFixed(4)) // 頂点色だけの明るさ（材の色は入れない＝樹冠の色の種類の差ではなく、木ごとに足した振れを見る）
      if (k === 'maru' || k === 'なし') lumMaru.push(s) // 同じ樹種（丸い広葉樹。前は樹種が無いので全部）の中の振れ＝樹種ごとの陰の付け方の違いを入れない
      if (m.color.r > m.color.g * 1.08) pink.push(k)
    }
    const mean = lum.reduce((a, b) => a + b, 0) / Math.max(1, lum.length)
    const std = Math.sqrt(lum.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, lum.length))
    const mm = lumMaru.reduce((a, b) => a + b, 0) / Math.max(1, lumMaru.length)
    const stdMaru = Math.sqrt(lumMaru.reduce((a, b) => a + (b - mm) * (b - mm), 0) / Math.max(1, lumMaru.length))
    return { n: R.trees.length, pos, sp, lumStd: +std.toFixed(4), lumStdMaru: +stdMaru.toFixed(4), lumMean: +mean.toFixed(4), mapN, alphaN, cardTris, pinkN: pink.length, pinkSp: pink }
  }
  // 部屋の観葉植物: 前の20面の玉の葉（半径 0.24・0.18・0.19・0.16）と、作り替えた株（名前 potPlant）
  S.plantInfo = () => {
    let oldN = 0, blades = 0, found = false
    window.__shGet().scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return
      const p = o.geometry && o.geometry.parameters
      if (o.geometry.type === 'IcosahedronGeometry' && p && p.detail === 0 && o.renderOrder === 2 && [0.24, 0.18, 0.19, 0.16].some((r) => Math.abs(p.radius - r) < 1e-6)) oldN++
      if (o.name === 'potPlant') { found = true; blades = o.userData.blades || 0 }
    })
    return { oldN, found, blades }
  }
}

async function open(dev, scene, { win = true, base = BASE } = {}) {
  const b = await getBrowser()
  const ctx = await b.newContext(DEVICES[dev])
  if (dev === 'iphone') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }) })
  await ctx.addInitScript(pinStart, scene)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PE: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest|preload/i.test(m.text())) errs.push('CE: ' + m.text().slice(0, 200)) })
  await page.goto(base + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
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
  const ok = await page.evaluate(() => window.__b6.setup())
  await page.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) }) // 日の傾きを頭に戻す（前と後で同じ時刻）
  return { ctx, page, errs, ok }
}
// 飛行に切り替えて、描画の直前にカメラを置く（便3〜便5 の撮り方と同じ。自機はカメラのすぐ後ろ）
async function placeCam(page, cam, settle = 7000) {
  const [x, y, z, lx, ly, lz, fov] = cam
  await page.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
  const dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, -dz)
  await page.evaluate((a) => window.__town3dFlyPose(...a), [x - dx / d * 5, y, z - dz / d * 5, yaw, 0]); await wait(1500)
  await page.evaluate((c) => { window.__b6.cam = c }, { p: [x, y, z], l: [lx, ly, lz], fov })
  await wait(settle) // 飛行に入った直後の霧の移り変わりが落ち着くまで
}
// 目の高さ（地面＋1.6m）のカメラ
const walkCam = (page, [x, z, lx, lz]) => page.evaluate(([x, z, lx, lz]) => { const g = window.__town3dGroundAt(x, z), gl = window.__town3dGroundAt(lx, lz); return [x, g + 1.6, z, lx, gl + 1.4, lz, 62] }, [x, z, lx, lz])
// 画面の全体を撮って QA_OUT/<名前>.png に残す。QA_SHOT があれば確認用スクショにも写す
async function grab(page, name) {
  const vp = page.viewportSize()
  await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.move(vp.width / 2 + 1, vp.height / 2 + 1); await wait(1500)
  // 飛行・歩行の操作の案内（名前の無い層・z-index 7）は出る時と出ない時があるので隠す
  await page.evaluate(() => { for (const d of document.querySelectorAll('div')) if (d.style.zIndex === '7' && d.style.pointerEvents === 'none') d.style.display = 'none' })
  const f = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: f })
  if (SHOT_TAG) fs.copyFileSync(f, path.join(SHOT_DIR, `${name}_${SHOT_TAG}.png`))
  return f.replace(/\\/g, '/')
}
const b64 = (f) => { try { return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') } catch { return null } }

// ── 画の数（切り抜きの細かな明暗・前との差）。便5 の _bin5-detail.mjs と同じ物差し ──
let mpage = null
async function metricsPage() { if (!mpage) { const b = await getBrowser(); mpage = await (await b.newContext()).newPage() } return mpage }
const IMG_FNS = () => {
  window.__img = async (src) => { const i = new Image(); await new Promise((res) => { i.onload = res; i.src = src }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height) }
  window.__L = (d, W, xx, yy) => { const k = (yy * W + xx) * 4; return 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2] }
  // 細かな明暗: 各画素と上下左右4つの平均との差の平均（大きいほど細かな模様が多い）
  // 明るさで割った細かな明暗（×100）: 模様は色に掛け算で乗るので、木の影の中と日向で比べられる（木の形が変わると影の落ち方も変わるため・便6）
  window.__ndetail = async (src, [x0, y0, w, h]) => { const im = await window.__img(src), d = im.data, W = im.width, L = window.__L; let s = 0, m = 0; for (let y = y0 + 1; y < y0 + h - 1; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) { s += Math.abs(L(d, W, x, y) - (L(d, W, x - 1, y) + L(d, W, x + 1, y) + L(d, W, x, y - 1) + L(d, W, x, y + 1)) / 4); m += L(d, W, x, y) } return +(100 * s / Math.max(1, m)).toFixed(3) }
  // 4×4画素ずつ平均してから測る、明るさで割った細かな明暗（×100）: 画面に重ねた紙の粒（1画素）を落として、数画素の大きさの模様（舗装の粒・ひび）を見る（便6）
  window.__bdetail = async (src, [x0, y0, w, h]) => { const im = await window.__img(src), d = im.data, W = im.width, L = window.__L, B = 4, bw = Math.floor(w / B), bh = Math.floor(h / B), m = new Float32Array(bw * bh); for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { let s = 0; for (let yy = 0; yy < B; yy++) for (let xx = 0; xx < B; xx++) s += L(d, W, x0 + bx * B + xx, y0 + by * B + yy); m[by * bw + bx] = s / (B * B) } let s = 0, t = 0; for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) { const v = m[y * bw + x]; s += Math.abs(v - (m[y * bw + x - 1] + m[y * bw + x + 1] + m[(y - 1) * bw + x] + m[(y + 1) * bw + x]) / 4); t += v } return +(100 * s / Math.max(1, t)).toFixed(3) }
  window.__detail = async (src, [x0, y0, w, h]) => { const im = await window.__img(src), d = im.data, W = im.width, L = window.__L; let s = 0, n = 0; for (let y = y0 + 1; y < y0 + h - 1; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) { s += Math.abs(L(d, W, x, y) - (L(d, W, x - 1, y) + L(d, W, x + 1, y) + L(d, W, x, y - 1) + L(d, W, x, y + 1)) / 4); n++ } return +(s / n).toFixed(3) }
  // 2枚の差: 明るさの差の平均と、8段以上変わった画素の割合
  window.__diff = async (a, b, [x0, y0, w, h]) => { const A = await window.__img(a), B = await window.__img(b), W = A.width, L = window.__L; let s = 0, big = 0, n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const dd = Math.abs(L(A.data, W, x, y) - L(B.data, W, x, y)); s += dd; if (dd >= 8) big++; n++ } return { mean: +(s / n).toFixed(2), over8: +(big / n).toFixed(3) } }
}
async function detail(file, crop) { const p = await metricsPage(); await p.evaluate(IMG_FNS); return p.evaluate(([s, c]) => window.__detail(s, c), [b64(file), crop]) }
async function ndetail(file, crop) { const p = await metricsPage(); await p.evaluate(IMG_FNS); return p.evaluate(([s, c]) => window.__ndetail(s, c), [b64(file), crop]) }
async function bdetail(file, crop) { const p = await metricsPage(); await p.evaluate(IMG_FNS); return p.evaluate(([s, c]) => window.__bdetail(s, c), [b64(file), crop]) }
async function diff(fa, fb, crop) { const p = await metricsPage(); await p.evaluate(IMG_FNS); return p.evaluate(([a, b, c]) => window.__diff(a, b, c), [b64(fa), b64(fb), crop]) }
const beforeImg = (name) => { const f = path.join(BEFORE, `${name}.png`); return fs.existsSync(f) ? f : null }
// 切り抜きの今の細かな明暗と、前の画の同じ切り抜きの細かな明暗・前との差
async function cropStats(name, file, crop) {
  const pre = beforeImg(name)
  const r = { crop, detail: await detail(file, crop), nd: await ndetail(file, crop), bd: await bdetail(file, crop) }
  if (pre) { r.detailBefore = await detail(pre, crop); r.ndBefore = await ndetail(pre, crop); r.bdBefore = await bdetail(pre, crop); r.diffBefore = await diff(file, pre, crop) }
  return r
}

// ── 見る所 ──
const CAM = {
  flylow: [9.8, 48, 38.8, -19.4, -15.9, -32.4, 73.6], // 便3〜便5 の低空飛行の眺め（手前に屋根・中ほどに木立・通り）
  lawn: [8, 7, -18, 14, 0, -26, 60], // 公園の上 7m から芝を見下ろす（高さ 50m では芝の細かな模様が遠くて消えるため・便6）
}
const WALK = [2, -18, 2, -40] // 歩く目線: 中央の通りを北へ（左に近くの木・右に店先）
// 切り抜き（PC 1920×1080 の画の上の [x, y, 幅, 高さ]）
const CROP = {
  roofNear: [60, 620, 460, 380],   // 低空飛行: 左下の手前の屋根
  treeNear: [590, 330, 370, 230],  // 低空飛行: 中ほどの木立
  treeRound: [1090, 770, 200, 160], // 低空飛行: 通りの右の丸い木
  grass: [560, 990, 180, 80],      // 低空飛行: 通りの左下の芝（ちらつきの測りだけ）
  lawn: [760, 450, 130, 50],       // 公園の上: 日の当たる芝
  wall: [400, 820, 140, 120],      // 低空飛行: 左下の窓のある家の壁
  road: [450, 870, 620, 200],      // 歩く目線: 手前の通り
  walkTree: [0, 0, 900, 360],      // 歩く目線: 頭の上の近くの木の樹冠
  plant: [1300, 610, 200, 250],    // 部屋（窓を閉じた所）: 右の観葉植物
}

const CHECKS = {}
const def = (id, fn) => { CHECKS[id] = fn }

// 眺めの画を撮る（T1・T2・S1〜S4・FL が使う。同じ実行の中では1回だけ撮る）
const views = {}
async function viewFlylow() {
  if (views.flylow) return views.flylow
  const { page, errs } = await open('pc', 'kitaterao-window-3d')
  await placeCam(page, CAM.flylow)
  const f = await grab(page, 'flylow')
  // ちらつき（FL）: 同じ所からカメラを 0.4m だけ前へ進めた1枚（模様が細かすぎると、少し動いただけで画素が大きく変わる）
  const c2 = [...CAM.flylow]; const dx = c2[3] - c2[0], dy = c2[4] - c2[1], dz = c2[5] - c2[2], dd = Math.hypot(dx, dy, dz)
  for (const k of [0, 1, 2]) { c2[k] += [dx, dy, dz][k] / dd * 0.4; c2[k + 3] += [dx, dy, dz][k] / dd * 0.4 }
  await page.evaluate((c) => { window.__b6.cam = { p: c.slice(0, 3), l: c.slice(3, 6), fov: c[6] } }, c2); await wait(1500)
  const f2 = await grab(page, 'flylow_step')
  views.flylow = { f, f2, errs, page }
  return views.flylow
}
// 歩く目線の通りを、木を隠して影を描き直してから撮る（新しい木の縁の葉の板が通りにまだらな影を落とし、通りの模様と混ざるため・便6）
async function viewWalkNoTree() {
  if (views.walkNoTree) return views.walkNoTree
  const w = await viewWalk()
  await w.page.evaluate(() => { for (const t of window.__b6R.trees) t.visible = false; window.__shGet().renderer.shadowMap.needsUpdate = true }); await wait(2000)
  const f = await grab(w.page, 'walk_notree')
  views.walkNoTree = { f, errs: w.errs }
  return views.walkNoTree
}
async function viewLawn() {
  if (views.lawn) return views.lawn
  const { page, errs } = await open('pc', 'kitaterao-window-3d')
  await placeCam(page, CAM.lawn)
  const f = await grab(page, 'lawn')
  views.lawn = { f, errs, page }
  return views.lawn
}
async function viewWalk() {
  if (views.walk) return views.walk
  const { page, errs } = await open('pc', 'kitaterao-window-3d')
  await page.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
  await page.evaluate((a) => window.__town3dFlyPose(...a), [WALK[0], 6, WALK[1] + 5, Math.PI, -0.05]); await wait(1500)
  const c = await walkCam(page, WALK)
  await page.evaluate((cc) => { window.__b6.cam = { p: cc.slice(0, 3), l: cc.slice(3, 6), fov: cc[6] } }, c); await wait(6000)
  const f = await grab(page, 'walk')
  views.walk = { f, errs, page }
  return views.walk
}

// G0 町の配置が変わらない（樹種や色を位置のハッシュで決め、町を作る乱数 R() の消費の順と数を変えない）:
//   町を組み終えた時の乱数の状態（__town3dLayout の rngEnd）・祭りの数・木の位置の並びが、3つの情景で前と同じ
def('G0', async () => {
  const b = beforeOf('G0')
  const res = {}
  for (const id of ['kitaterao-window-3d', 'shishigaya-window-3d', 'kitaterao-window-3d-spring']) {
    const { page, ctx, errs } = await open('pc', id, { win: false })
    const lay = await page.evaluate(() => window.__town3dLayout && window.__town3dLayout())
    const ti = await page.evaluate(() => window.__b6.treeInfo())
    const posKey = ti ? JSON.stringify(ti.pos) : null
    const pb = b && b[id]
    res[id] = { rngEnd: lay && lay.rngEnd, fest: lay && lay.fest, trees: ti && ti.n, posHash: posKey && posKey.length + ':' + [...posKey].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7), errs }
    res[id].pass = !!pb && JSON.stringify(res[id].rngEnd) === JSON.stringify(pb.rngEnd) && res[id].fest === pb.fest && res[id].trees === pb.trees && res[id].posHash === pb.posHash && errs.length === 0
    await ctx.close()
  }
  return { pass: Object.values(res).every((r) => r.pass), ...res }
})
// T1 樹種の形と色の振れ: 木が3つの樹種（丸い広葉樹 maru・傘形 kasa・杉檜 sugi）に分かれ、どれも全体の1割以上。丸い広葉樹の中の木ごとの頂点色の明るさの振れ（標準偏差）が前（樹種が無い全部の木）の3倍以上。
//   初めは材の色まで含めた明るさの振れで測ったが、前からある6色の差に埋もれて 0.040→0.042 しか動かなかった。次に全部の木の頂点色の振れ（前の1.5倍）にしたが、
//   色の振れを外しても樹種ごとの陰の付け方の違いで線を越えた（外し回しで落ちなかった・便6 の決めたこと）。
//   春の桜（桃色の材）は傘形にする。画: 低空飛行の中ほどの木立と丸い木の切り抜きが前と変わる（差の平均 ≥ 5）
def('T1', async () => {
  const { page, errs } = await open('pc', 'kitaterao-window-3d', { win: false })
  const ti = await page.evaluate(() => window.__b6.treeInfo())
  const o2 = await open('pc', 'kitaterao-window-3d-spring', { win: false })
  const sp = await o2.page.evaluate(() => window.__b6.treeInfo())
  const b = beforeOf('T1')
  const v = await viewFlylow()
  const near = await cropStats('flylow', v.f, CROP.treeNear), round = await cropStats('flylow', v.f, CROP.treeRound)
  const n = ti ? ti.n : 0, frac = (k) => ti && ti.sp[k] ? ti.sp[k] / n : 0
  const spOk = ['maru', 'kasa', 'sugi'].every((k) => frac(k) >= 0.1)
  const lumOk = !!b && ti && ti.lumStdMaru >= b.lumStdMaru * 3
  const pinkOk = !!sp && sp.pinkN > 0 && sp.pinkSp.every((k) => k === 'kasa')
  const imgOk = !!near.diffBefore && near.diffBefore.mean >= 5 && round.diffBefore.mean >= 5
  return { pass: spOk && lumOk && pinkOk && imgOk && errs.length === 0 && o2.errs.length === 0, sp: ti && ti.sp, n, lumStd: ti && ti.lumStd, lumStdMaru: ti && ti.lumStdMaru, lumStdMaruBefore: b && b.lumStdMaru, springPink: sp && { n: sp.pinkN, sp: [...new Set(sp.pinkSp)] }, near, round, spOk, lumOk, pinkOk, imgOk, errs: [...errs, ...o2.errs] }
})
// T2 葉の模様と縁の葉の板: 樹冠の材が葉の模様（画）と切り抜き（alphaTest）を持ち、葉の板の三角がある。
//   画: 歩く目線の頭の上の樹冠と、低空飛行の中ほどの木立の細かな明暗が前より増える（歩く目線 ≥ 前＋0.15・木立 ≥ 前＋0.08）
def('T2', async () => {
  const { page, errs } = await open('pc', 'kitaterao-window-3d', { win: false })
  const ti = await page.evaluate(() => window.__b6.treeInfo())
  const w = await viewWalk(), v = await viewFlylow()
  const walkTree = await cropStats('walk', w.f, CROP.walkTree), near = await cropStats('flylow', v.f, CROP.treeNear)
  const matOk = !!ti && ti.mapN === ti.n && ti.alphaN === ti.n && ti.cardTris > 0
  const imgOk = walkTree.detailBefore != null && walkTree.detail >= walkTree.detailBefore + 0.15 && near.detail >= near.detailBefore + 0.08
  return { pass: matOk && imgOk && errs.length === 0, mapN: ti && ti.mapN, alphaN: ti && ti.alphaN, cardTris: ti && ti.cardTris, n: ti && ti.n, walkTree, near, matOk, imgOk, errs }
})
// T3 観葉植物: 部屋の20面の玉4つが無く、細長い葉17枚の株（potPlant）がある。画: 部屋の観葉植物の切り抜きが前と変わる（差の平均 ≥ 6）
def('T3', async () => {
  const { page, errs } = await open('pc', 'kitaterao-window-3d', { win: false })
  const pi = await page.evaluate(() => window.__b6.plantInfo())
  const f = await grab(page, 'room')
  const st = await cropStats('room', f, CROP.plant)
  return { pass: pi.oldN === 0 && pi.found && pi.blades === 17 && !!st.diffBefore && st.diffBefore.mean >= 6 && errs.length === 0, ...pi, plant: st, errs }
})
// S1 屋根の模様（瓦・トタン・スレート）: 低空飛行の手前の屋根の細かな明暗 ≥ 前＋0.4（便5 の案の画 1.37→2.07）
def('S1', async () => { const v = await viewFlylow(); const st = await cropStats('flylow', v.f, CROP.roofNear); return { pass: st.detailBefore != null && st.detail >= st.detailBefore + 0.4 && v.errs.length === 0, ...st, errs: v.errs } })
// S2 家の壁の模様（漆喰とモルタルのむら・雨だれ）: 低空飛行の左下の窓のある家の壁の細かな明暗 ≥ 前＋0.2
def('S2', async () => { const v = await viewFlylow(); const st = await cropStats('flylow', v.f, CROP.wall); return { pass: st.detailBefore != null && st.detail >= st.detailBefore + 0.2 && v.errs.length === 0, ...st, errs: v.errs } })
// S3 地面の模様（草の濃淡と土の斑）: 公園の上 7m から見下ろした芝の、明るさで割った細かな明暗 ≥ 前の1.1倍。
//   初めは低空飛行（高さ 50m）の芝で「細かな明暗 ≥ 前＋0.15」としたが、細かな模様は遠いと消える作りで +0.07 だった（便6 の決めたこと）
def('S3', async () => { const v = await viewLawn(); const st = await cropStats('lawn', v.f, CROP.lawn); return { pass: st.ndBefore != null && st.nd >= st.ndBefore * 1.1 && v.errs.length === 0, ...st, errs: v.errs } })
// S4 中央の通りの模様（舗装の粒・補修の跡・ひび・轍）: 歩く目線で木を隠して影を描き直した手前の通りの、4×4画素にまとめて測る明るさで割った細かな明暗 ≥ 前の2倍。
//   初めは「細かな明暗 ≥ 前＋0.1」としたが、木の形が変わって通りに落ちる木の影も変わり、前より暗い所どうしを比べていた。明るさで割っても、
//   縁の葉の板のまだらな影で通りの模様を外しても線を越えた（外し回し）ので、前も後も木を隠して影を描き直してから撮る。
//   1画素ごとの差は画面に重ねた紙の粒を拾って 1.197→1.235 しか動かず、数画素の大きさの舗装の粒とひびは4×4にまとめると見える（0.34→1.43・便6 の決めたこと）
def('S4', async () => { const w = await viewWalkNoTree(); const st = await cropStats('walk_notree', w.f, CROP.road); return { pass: st.bdBefore != null && st.bd >= st.bdBefore * 2 && w.errs.length === 0, ...st, errs: w.errs } })
// FL 動いた時のちらつき: 低空飛行の眺めを、開発の口 __town3dShotAt（決まった大きさ 640×560 で1枚描く）でカメラを 0.4m 進めた2枚を同じ瞬間に描き、
//   遠くの町の帯（画の上から 25〜55%）の差の平均が、前の同じ2枚の差の1.3倍以下（遠くて細かすぎる模様を消さないと、少し動いただけで画素がちらつく）。
//   初めは画面の撮影を1.5秒あけた2枚で比べたが、その間の画質の自動調整と動く物の差が入り、模様を消す所を外しても落ちなかった（便6 の決めたこと）
def('FL', async () => {
  const { page, errs } = await open('pc', 'kitaterao-window-3d')
  await placeCam(page, CAM.flylow, 4000)
  const r = await page.evaluate(async (c) => {
    const [x, y, z, lx, ly, lz, fov] = c, dx = lx - x, dy = ly - y, dz = lz - z, d = Math.hypot(dx, dy, dz), s = 0.4 / d
    const ua = window.__town3dShotAt(x, y, z, lx, ly, lz, fov), ub = window.__town3dShotAt(x + dx * s, y + dy * s, z + dz * s, lx + dx * s, ly + dy * s, lz + dz * s, fov)
    const ld = async (u) => { const im = new Image(); await new Promise((res) => { im.onload = res; im.src = u }); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, cv.width, cv.height) }
    const A = await ld(ua), B = await ld(ub), L = (q, k) => 0.2126 * q[k] + 0.7152 * q[k + 1] + 0.0722 * q[k + 2]
    let sm = 0, n = 0; for (let yy = Math.floor(A.height * 0.25); yy < Math.floor(A.height * 0.55); yy++) for (let xx = 0; xx < A.width; xx++) { const k = (yy * A.width + xx) * 4; sm += Math.abs(L(A.data, k) - L(B.data, k)); n++ }
    return { ua, ub, far: +(sm / n).toFixed(3) }
  }, CAM.flylow)
  fs.writeFileSync(path.join(OUT, 'FL_a.png'), Buffer.from(r.ua.split(',')[1], 'base64')); fs.writeFileSync(path.join(OUT, 'FL_b.png'), Buffer.from(r.ub.split(',')[1], 'base64'))
  const b = beforeOf('FL')
  return { pass: !!b && b.far != null && r.far <= b.far * 1.3 && errs.length === 0, far: r.far, farBefore: b && b.far, errs }
})
// G1 雪の窓・夜の窓・夕方の窓（PC・iPhone）と春の窓が沈まない: 窓の外の帯の明るさの平均が前±8 以内・ほぼ白の割合が前＋0.02 以内（守り）
def('G1', async () => {
  const b = beforeOf('G1')
  const res = {}
  for (const [id, dev] of [['kitaterao-window-3d-snow', 'pc'], ['kitaterao-window-3d-night', 'pc'], ['kitaterao-window-3d-sunset', 'pc'], ['kitaterao-window-3d-sunset', 'iphone'], ['kitaterao-window-3d-spring', 'pc'], ['shishigaya-window-3d', 'pc']]) {
    const { page, ctx, errs } = await open(dev, id)
    await wait(1500)
    const f = await grab(page, `G1_${id}_${dev}`)
    const p = await metricsPage(); await p.evaluate(IMG_FNS)
    const st = await p.evaluate(async (src) => { const im = await window.__img(src); let s = 0, n = 0, w = 0; for (let y = Math.floor(im.height * 0.15); y < Math.floor(im.height * 0.85); y++) for (let x = 0; x < im.width; x++) { const L = window.__L(im.data, im.width, x, y); s += L; n++; if (L >= 235) w++ } return { mean: +(s / n).toFixed(1), white: +(w / n).toFixed(3) } }, b64(f))
    const k = `${id}_${dev}`, pb = b && b[k]
    res[k] = { ...st, before: pb ? { mean: pb.mean, white: pb.white } : null, pass: !!pb && Math.abs(st.mean - pb.mean) <= 8 && st.white <= pb.white + 0.02 && errs.length === 0, errs }
    await ctx.close()
  }
  return { pass: Object.values(res).every((r) => r.pass), ...res }
})
// K5 iPhone の重さ: 窓辺・夕方・飛行・歩行の描画の呼び出しと描く画素数が前の1.05倍以下（便2 の K5 と同じ物差し）。窓辺の描画の時間は記録だけ（判定は KT）。
//   初めは窓辺の時間も「前の1.05倍以下」にしたが、別々の時刻に1回ずつ測ると同じコードでも 30.2〜32.3ms・前のコードでも 40.3 と 30.6 にぶれた（便6 の決めたこと）
//   呼び出しは1秒おきに5回測った中央値。飛行は8秒待つ・歩行は目の高さのカメラを決まった位置に置く（便4 で固めた測り方）
def('K5', async () => {
  const b = beforeOf('K5')
  const { page, errs } = await open('iphone', 'kitaterao-window-3d', { win: false })
  const draw = async () => { const rs = []; for (let i = 0; i < 5; i++) { rs.push(await page.evaluate(() => window.__town3dDraw && window.__town3dDraw())); await wait(1000) } const c = rs.map((r) => r.calls).sort((x, y) => x - y); return { ...rs[0], calls: c[2], callsAll: rs.map((r) => r.calls) } }
  const ms3 = async () => { const a = []; for (let i = 0; i < 3; i++) { const r = await page.evaluate(() => window.__b6.measureNow(60)); if (r.ms != null) a.push(r.ms); await wait(500) } a.sort((x, y) => x - y); return a.length ? { ms: a[Math.floor(a.length / 2)], all: a } : { ms: null, all: [] } }
  const after = {}
  after.window = { ...(await draw()), time: await ms3() }
  await page.evaluate((s) => window.__applyScene(s), 'kitaterao-window-3d-sunset'); await wait(11000)
  await page.evaluate(() => window.__b6.setup()); await page.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
  after.sunset = { ...(await draw()) }
  await page.evaluate((s) => window.__applyScene(s), 'kitaterao-window-3d'); await wait(11000)
  await page.evaluate(() => window.__b6.setup()); await page.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
  await page.evaluate(() => window.__town3dWindow(true)); await wait(2200)
  await page.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
  await page.evaluate(() => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.2)); await wait(8000)
  after.fly = { ...(await draw()) }
  await page.evaluate(() => window.__town3dFlyPose(2, 6, -18, Math.PI, -0.05)); await wait(800)
  await page.evaluate(() => window.__town3dLandToggle(true)); await wait(8000)
  await page.evaluate(() => window.__town3dFaceWalk(Math.PI)); await wait(1500)
  await page.evaluate(() => { const g = window.__town3dGroundAt(2, -18); window.__b6.cam = { p: [2, g + 1.6, -18], l: [2, g + 1.6, -40], fov: 60 } }); await wait(1500)
  after.walk = { ...(await draw()) }
  const keep = (v) => v && { calls: v.calls, callsAll: v.callsAll, px: v.px, tris: v.tris, ms: v.time && v.time.ms, msAll: v.time && v.time.all }
  const ok = (k) => !!b && after[k] && after[k].calls <= b.after[k].calls * 1.05 && after[k].px <= b.after[k].px * 1.05
  return { pass: ['window', 'sunset', 'fly', 'walk'].every(ok) && errs.length === 0, before: b && b.after, after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, keep(v)])), errs }
})

// KT iPhone の幅の窓辺の描画の時間: 前のコード（BASE_BEFORE）と後のコードを交互に3回ずつ開いて、60こまの中央値を3回ずつ測り、後の中央値が前の中央値の1.05倍以下。
//   交互に測るのは、同じコードでも開く回ごとに時間が 7% ほどぶれるため（便6 の決めたこと）
def('KT', async () => {
  const one = async (base) => { const { page, ctx, errs } = await open('iphone', 'kitaterao-window-3d', { win: false, base }); await wait(2000); const a = []; for (let i = 0; i < 3; i++) { const r = await page.evaluate(() => window.__b6.measureNow(60)); if (r.ms != null) a.push(r.ms); await wait(500) } await ctx.close(); a.sort((x, y) => x - y); return { ms: a.length ? a[1] : null, all: a, errs } }
  const pre = [], now = []
  for (let k = 0; k < 3; k++) { pre.push(await one(BASE_BEFORE)); now.push(await one(BASE)) }
  const med = (xs) => { const v = xs.map((x) => x.ms).filter((x) => x != null).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null }
  const mb = med(pre), ma = med(now)
  return { pass: mb != null && ma != null && ma <= mb * 1.05 && now.every((x) => x.errs.length === 0), before: mb, after: ma, ratio: mb && ma ? +(ma / mb).toFixed(3) : null, beforeRuns: pre.map((x) => x.all), afterRuns: now.map((x) => x.all) }
})

// ── 実行 ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
let ids = []
for (const a of argv) { if (a === 'all') ids.push(...Object.keys(CHECKS)); else ids.push(a) }
ids = [...new Set(ids)]
if (!ids.length) { console.log('使い方: node scripts/qa-bin6.mjs <ID…|all>  検査:', Object.keys(CHECKS).join(' ')); process.exit(2) }
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
}
if (browser) await browser.close()
const passN = Object.values(summary).filter(Boolean).length
console.log(`検査の終わり: ${passN}/${ids.length} 合格`)
fs.writeFileSync(path.join(OUT, '_last-run.json'), JSON.stringify({ at: new Date().toISOString(), ids, summary, pass: passN, total: ids.length }, null, 1))
process.exit(fail ? 1 : 0)
