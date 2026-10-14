// 便7（2026-10-14・直す便・便6 #1=2）の検査: iPhone の幅の GPU の時間を、同じコードどうしで 2% 以内にそろう測り方で測る。
// 使い方: 開発サーバー2つ（後＝今のコード 4963: npx vite --config scripts/_bin6-vite.config.mjs ／ 前＝復元地点 638da84 の作業フォルダで番号を 4964 にした同じ設定）を起動してから
//   node scripts/qa-bin7.mjs <ID…|all>   QA_OUT=…（既定 docs/qa/2026-10-14_便7/gate）
// 検査:
//   GS 同じコードどうし（前と前）を同じ測り方で比べ、窓辺と低空飛行の比が 0.98〜1.02 に入る（測り方の物差しの確かめ）
//   GG 前のコードと後のコードを比べ、窓辺と低空飛行のどちらも後が前の1.05倍以下（GS が合格した測り方で）
// 便6 の KG（scripts/qa-bin6.mjs）から変えた所:
//   1. 測る間はアプリの描画の繰り返しを止め（おやすみと同じ口）、止めた同じ状態を自分で描く＝鳥・雲・人の動きで描く量が回ごとに変わらない
//   2. 1こまごとに GPU の終わりを待たず、続けて描いてから時計の結果をまとめて読む＝GPU が空いて動作の速さが落ちない
//   3. 前と後を短い塊（20こま）で ABBA の順に交互に測り、塊の組ごとの比の中央値で判じる＝ゆっくりした速さの変化が比に入らない
//   4. 描く細かさは段の天井（飛行は飛行の天井）にそろえる＝本物の iPhone が描く細かさ
//   5. 専用の GPU（RTX 4050）で描かせ、両方のページの乱数の種をそろえる
//   6. 測るこまの前に、GPU だけが重い下ごしらえ（約30ms）を挟む。GPU がそれをこなす間に CPU がこまの指示（約14ms）を送り終えるので、
//      時計はこまの GPU の正味の仕事（窓辺 約0.86ms）だけを測る。下ごしらえは慣らしの塊ごとに、塊の中の時間で 30ms に合わせ直す
//      （合わせ直さないと、GPU が速くなった塊の中で 5〜6ms に縮み、CPU の待ちが数に入った・便7 の外の目）
//   ※便7 で試して採らなかった形（動く物を隠す QA_DYN=1・時刻を固める QA_FIXT・下ごしらえで割る QA_NORM=1・1つずつ開く GS1・2つの枠 GSP）は、切り分けの道具として残す
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE = process.env.QA_BASE || 'http://localhost:4963/seasons/'
const BASE_BEFORE = process.env.QA_BASE_BEFORE || 'http://localhost:4964/seasons/'
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-14_便7/gate'
fs.mkdirSync(OUT, { recursive: true })

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const IPHONE = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE }
const FLYLOW = [9.8, 48, 38.8, -19.4, -15.9, -32.4, 73.6] // 便3〜便6 の低空飛行の眺め（qa-bin6.mjs の CAM.flylow と同じ）
const ROUNDS = +(process.env.QA_ROUNDS || 12) // ABBA の組の数
const BATCH = +(process.env.QA_BATCH || 20) // 1つの塊のこま数
const GPU_HIGH = process.env.QA_GPU !== 'low' // 専用の GPU で描かせる（内蔵の GPU は CPU と電力を分け合い、同じ絵でも塊ごとに ±8% 揺れた・便7）
const SEED = process.env.QA_SEED !== '0' // 両方のページの Math.random の種をそろえる（開くたびに時々の出来事や鳥の数が違い、同じコードでも呼び出しが 1694 と 1720 に分かれた・便7）
const seedRandom = () => { let a = 20261014; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const FIX_T = +(process.env.QA_FIXT ?? 0) // 止める直前に両方のページの時刻をここ（ページを開いてからの ms）へ飛ばして固める。0 で使わない（固めても動く物の数はそろわなかった・便7。既定は使わない）
const HIDE = process.env.QA_HIDE || '' // 切り分け: cards・trees
const HIDE_DYN = process.env.QA_DYN === '1' // 動く物を隠して測る（QA_DYN=1 の時だけ）。木の入れ物が風で揺れて木まで隠れ、隠れる物が2ページで違って比が 1.239倍に片寄ったので、既定では隠さない（便7）
// 時刻の口: 止める直前に performance.now を決まった値に固める（町を歩く人などが時刻で動き、開いた時刻の違いで視野に入る人の数が違って、同じコードでも呼び出しが 1726 と 1673 に分かれた・便7）
const clockHook = () => { const real = performance.now.bind(performance); let fixed = null; performance.now = () => (fixed == null ? real() : fixed); window.__b7fix = (ms) => { fixed = Math.max(ms, real()); return fixed } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let browser = null
async function getBrowser() {
  if (!browser) browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', ...(GPU_HIGH ? ['--force_high_performance_gpu'] : []),
    // 2つの枠（番号の違う開発サーバー）を1つのページから描かせるため、検査用のブラウザだけ、よそのページの中を触れないようにする仕切りを外す
    '--disable-web-security', '--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process'] })
  return browser
}
const pinStart = (sid) => { try { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.sceneId = sid; st.sceneAt = Date.now(); localStorage.setItem(k, JSON.stringify(st)) } catch { /* 無視 */ } }

// 撮影用の口（__shGet）から: 描画の直前にカメラを置く・止めた状態を続けて描いて GPU の時計で測る
const INJECT = () => {
  const S = (window.__b7 = { cam: null })
  const g = window.__shGet && window.__shGet(); if (!g || !g.composer) return false
  const { renderer, camera, composer } = g
  const orig = composer.render.bind(composer)
  composer.render = (...a) => {
    const c = S.cam
    if (c) { camera.position.set(...c.p); camera.up.set(0, 1, 0); camera.lookAt(...c.l); if (c.fov && camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix() } camera.updateMatrixWorld() }
    return orig(...a)
  }
  const gl = renderer.getContext()
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  S.gpuName = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null
  S.hasTimer = !!ext
  // 下ごしらえの描画: CPU はほぼ使わず GPU だけが重い全面の描画を小さな描き先へ。測るこまの前に挟み、GPU がこれをこなす間に
  // CPU がこまの指示を送り終える＝時計がこまの GPU の正味の仕事だけを測る（挟まないと、描く指示を送る CPU の時間で GPU が待ち、それも数に入った・便7）
  const T = g.THREE
  const prert = new T.WebGLRenderTarget(1024, 1024, { depthBuffer: false }) // GPU が速い時でも 30ms 以上にできる大きさ（512 では最も重くして 5.6ms だった・便7）
  const preMat = new T.ShaderMaterial({ uniforms: { uN: { value: 600 } }, depthTest: false, depthWrite: false,
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform int uN; void main(){ vec2 p = gl_FragCoord.xy * 0.001; float a = 0.0; for (int i = 0; i < 16384; i++) { if (i >= uN) break; a += sin(p.x * float(i) + a) * cos(p.y + a * 0.5); } gl_FragColor = vec4(a * 1e-6, 0.0, 0.0, 1.0); }' })
  const preMesh = new T.Mesh(new T.PlaneGeometry(2, 2), preMat); preMesh.frustumCulled = false
  const preScene = new T.Scene(); preScene.add(preMesh)
  const preCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  S.pre = () => { const rt0 = renderer.getRenderTarget(); renderer.setRenderTarget(prert); renderer.render(preScene, preCam); renderer.setRenderTarget(rt0); gl.flush() }
  // 1こまを下ごしらえと一緒に描き、時計を控えに積む（2つの枠を1つの繰り返しで交互に描くため。結果は collect でまとめて読む）
  S.pend = []
  S.step = () => { const qp = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, qp); S.pre(); gl.endQuery(ext.TIME_ELAPSED_EXT); const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); composer.render(); gl.endQuery(ext.TIME_ELAPSED_EXT); gl.flush(); S.pend.push([qp, q]) }
  // 1こま描いて、その終わりを待つ（2つの枠の仕事が GPU の側で混ざらないように。待つ間は 1ms ほど）
  S.stepWait = async () => { S.step(); const q = S.pend[S.pend.length - 1][1], t0 = performance.now(); await new Promise((res) => { const t = () => { if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) || performance.now() - t0 > 5000) res(); else setTimeout(t, 0) }; t() }) }
  S.collect = async () => {
    const ps = S.pend; S.pend = []; if (!ps.length) return null
    const last = ps[ps.length - 1][1], t0 = performance.now()
    await new Promise((res) => { const t = () => { if (gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE) || performance.now() - t0 > 20000) res(); else setTimeout(t, 1) }; t() })
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    const rd = (q) => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : null)
    const out = { pre: ps.map((p) => rd(p[0])), ms: ps.map((p) => rd(p[1])), disjoint }
    ps.forEach((p) => { gl.deleteQuery(p[0]); gl.deleteQuery(p[1]) })
    return out
  }
  // 下ごしらえの GPU の時間がこまの CPU の時間より十分長くなるよう、くり返しの数を合わせる（目安 40ms）
  S.calibrate = async (target = 40) => {
    for (let k = 0; k < 6; k++) {
      const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); S.pre(); gl.endQuery(ext.TIME_ELAPSED_EXT)
      await new Promise((res) => { const t = () => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? res() : setTimeout(t, 1)); t() })
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q)
      if (k >= 1) preMat.uniforms.uN.value = Math.max(16, Math.min(16384, Math.round(preMat.uniforms.uN.value * target / Math.max(0.5, ms))))
      S.preMs = +ms.toFixed(2)
    }
    return { n: preMat.uniforms.uN.value, ms: S.preMs }
  }
  // n こまを続けて描き、こまごとの GPU の時間（ms）を返す。時計の結果は描き終えてからまとめて読む
  S.burst = async (n, PRE = true) => {
    if (!ext) return null
    gl.getParameter(ext.GPU_DISJOINT_EXT) // 読んで消す
    const qs = [], qsPre = []
    const cpu = []
    for (let i = 0; i < n; i++) { if (PRE) { const qp = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, qp); S.pre(); gl.endQuery(ext.TIME_ELAPSED_EXT); qsPre.push(qp) } const q = gl.createQuery(); const c0 = performance.now(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); composer.render(); gl.endQuery(ext.TIME_ELAPSED_EXT); cpu.push(performance.now() - c0); gl.flush(); qs.push(q) }
    const last = qs[qs.length - 1]
    const t0 = performance.now()
    await new Promise((res) => { const t = () => { if (gl.getQueryParameter(last, gl.QUERY_RESULT_AVAILABLE) || performance.now() - t0 > 10000) res(); else setTimeout(t, 1) }; t() })
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    const ms = qs.map((q) => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : null))
    const pre = qsPre.map((q) => (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6 : null))
    qs.forEach((q) => gl.deleteQuery(q)); qsPre.forEach((q) => gl.deleteQuery(q))
    const cv = renderer.domElement
    return disjoint ? null : { ms, pre, cpu, pr: +renderer.getPixelRatio().toFixed(3), w: cv.width, h: cv.height }
  }
  // 動く物を見つける: ms の間、決まった間隔で、位置・見え隠れ・並べた数の中身・頂点の中身が変わった物に印を付ける
  S.markDynamic = async (ms = 3000, step = 250) => {
    const snap = new Map()
    // 位置は、その物から町の入れ物（場面のすぐ下）の手前までの、親から見た位置を全部つないで見る（便7）。
    //   世界の中の位置では、町の入れ物ごと動くので木まで全部が動く物になった。親から見た位置だけでは、入れ物ごと動く人の手足を拾えなかった。
    //   世界の位置から町の入れ物の位置を逆算すると、小数の誤差で木まで拾った
    const key = (o) => { let v = 1, m = ''; for (let p = o; p.parent && p.parent !== g.scene; p = p.parent) { if (!p.visible) v = 0; p.updateMatrix(); m += p.matrix.elements.map((x) => x.toFixed(4)).join(',') + ';' } return m + '|' + v + '|' + (o.isInstancedMesh ? o.count + ':' + o.instanceMatrix.version : '') + '|' + (o.geometry && o.geometry.attributes && o.geometry.attributes.position ? o.geometry.attributes.position.version : '') }
    const dyn = new Set()
    const t0 = performance.now()
    let first = true
    while (performance.now() - t0 < ms) {
      // 途中で足された物（初めの一覧に無い物）も動く物に入れる
      g.scene.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; const k = key(o); const p = snap.get(o); if ((p != null && p !== k) || (p == null && !first)) dyn.add(o); snap.set(o, k) })
      first = false
      await new Promise((r) => setTimeout(r, step))
    }
    S.dyn = [...dyn]
    return S.dyn.length
  }
  // 塊の中で測った下ごしらえの時間（ms）から、次の塊で target ms になるよう重さを直す（合わせる時は GPU が遅く、塊の中では速くなって 5〜6ms に縮み、CPU の時間 約14ms を隠せていなかった・便7 の外の目）
  S.adapt = (preMs, target = 30) => { if (preMs > 0) preMat.uniforms.uN.value = Math.max(16, Math.min(16384, Math.round(preMat.uniforms.uN.value * target / preMs))); return preMat.uniforms.uN.value }
  S.hideDynamic = () => { let n = 0; for (const o of S.dyn || []) if (o.visible) { o.visible = false; n++ } return n }
  // 隠した物の内訳: 木（__b6R.trees の子）が入っていないか・親の名前ごとの数
  S.dynInfo = () => { const tr = new Set(); for (const t of (window.__b6R && window.__b6R.trees) || []) t.traverse((c) => tr.add(c)); const by = {}; let treeN = 0; for (const o of S.dyn || []) { if (tr.has(o)) treeN++; let p = o; while (p.parent && p.parent !== g.scene) p = p.parent; const k = (p.name || p.type) + (p === o ? '' : '>'); by[k] = (by[k] || 0) + 1 } return { treeN, by: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 12) } }
  return true
}

let POSE = null
async function open(base, view) {
  const b = await getBrowser()
  const ctx = await b.newContext(IPHONE)
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }) })
  await ctx.addInitScript(pinStart, 'kitaterao-window-3d')
  if (SEED) await ctx.addInitScript(seedRandom)
  if (FIX_T) await ctx.addInitScript(clockHook)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PE: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest|preload/i.test(m.text())) errs.push('CE: ' + m.text().slice(0, 200)) })
  await page.goto(base + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
  const r = await setupTarget(page, base, view)
  return { ctx, page, errs, ...r }
}
// ページか枠（Frame）を、測る眺めに整えて止める（ページでも枠でも同じ手順）
async function setupTarget(page, base, view) {
  await page.waitForTimeout(2500)
  await page.waitForSelector('.gate', { timeout: 15000 }).catch(() => {})
  await page.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {})
  await page.waitForSelector('.gate', { state: 'detached', timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await page.evaluate((s) => window.__applyScene(s), 'kitaterao-window-3d')
  await page.waitForTimeout(11000)
  if (!(await page.evaluate(INJECT))) throw new Error('撮影の口（__shGet）が無い: ' + base)
  await page.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) }) // 日の傾きを頭に戻す（前と後で同じ時刻）
  if (view === 'fly') {
    await page.evaluate(() => window.__town3dWindow(true)); await wait(3000)
    const [x, y, z, lx, ly, lz, fov] = FLYLOW
    await page.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
    const dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, -dz)
    POSE = [x - dx / d * 5, y, z - dz / d * 5, yaw, 0]
    await page.evaluate((a) => window.__town3dFlyPose(...a), POSE); await wait(1500)
    await page.evaluate((c) => { window.__b7.cam = c }, { p: [x, y, z], l: [lx, ly, lz], fov }); await wait(6000)
  } else await wait(1500)
  // 描く細かさを段の天井（飛行は飛行の天井）にそろえ、少し描かせてから止める
  const pr = await page.evaluate((fly) => { const q = window.__town3dQuality(); const v = fly ? Math.min(q.cap, q.fly) : q.cap; window.__shGet().setCurPR(v); return v }, view === 'fly')
  await wait(1500)
  // 飛行は止める直前に自機を置き直す（置いた後も自機が進み、止めた時の位置で近くの物の出し入れが変わって、同じコードでも呼び出しが 1718 と 1694 に分かれた・便7）
  if (view === 'fly') { await page.evaluate((a) => window.__town3dFlyPose(...a), POSE); await wait(120) }
  const dynN = HIDE_DYN ? await page.evaluate(() => window.__b7.markDynamic(3000)) : 0
  const fixedAt = FIX_T ? await page.evaluate((ms) => window.__b7fix(ms), FIX_T) : null
  if (FIX_T) await wait(400) // 固めた時刻で数こま描かせる（町の動く物が固めた時刻の位置へ移る）
  await page.evaluate(() => window.__town3dPaused(true)); await wait(300)
  // 切り分け: QA_HIDE=cards（葉の板）・trees（木を全部）を前と後の両方で隠して測る（便6 の直しのどこが重いかを見る・便7）
  if (HIDE) await page.evaluate((h) => { for (const t of (window.__b6R && window.__b6R.trees) || []) { if (h.includes('trees')) t.visible = false; else if (h.includes('cards')) for (const c of t.children) if (c.userData && c.userData.cards) c.visible = false }
    // plant: 部屋の観葉植物（前の20面の玉4つ・後の株 potPlant）
    if (h.includes('plant')) window.__shGet().scene.traverse((o) => { const p = o.geometry && o.geometry.parameters; if (o.name === 'potPlant' || (o.isMesh && o.geometry.type === 'IcosahedronGeometry' && p && p.detail === 0 && o.renderOrder === 2 && [0.24, 0.18, 0.19, 0.16].some((r) => Math.abs(p.radius - r) < 1e-6))) o.visible = false })
  }, HIDE)
  const hidN = HIDE_DYN ? await page.evaluate(() => window.__b7.hideDynamic()) : 0
  const pre = await page.evaluate(() => window.__b7.calibrate(40))
  const info = await page.evaluate(() => ({ pre: window.__b7.preMs, gpu: window.__b7.gpuName, timer: window.__b7.hasTimer, calls: window.__town3dDraw && window.__town3dDraw().calls, pr: window.__town3dQuality().pr }))
  return { pr, info: { ...info, pre, fixedAt, dynN, hidN, dyn: HIDE_DYN ? await page.evaluate(() => window.__b7.dynInfo()) : null } }
}

const med = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null }
const r3 = (x) => (x == null ? null : +x.toFixed(3))
const q25 = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)).sort((p, q) => p - q); return v.length ? v[Math.floor((v.length - 1) / 4)] : null }
// 塊の値は、割らない時（既定）は下側の4分の1の値（遅いこまに引っぱられない）。QA_NORM=1 の時は、こまごとに下ごしらえの時間で割った値の中央値（便7）
const NORM = process.env.QA_NORM === '1' // 下ごしらえの時間で割る（QA_NORM=1 の時だけ）。割ると、ページごとの下ごしらえの時間の違い（約4%）が比に入ったので、既定では割らない（便7）
const PREIN = new WeakMap(), LASTPRE = new WeakMap(), LASTCPU = new WeakMap() // ページごとに、塊の中の下ごしらえの時間
const RAW = new WeakMap() // ページごとに、塊ごとの割る前の GPU の時間
const CPU = new WeakMap() // ページごとに、塊ごとの描く指示を送る時間（CPU 側）
const SIZES = new WeakMap() // ページごとに、塊を測った時の描く面の大きさ（途中で変わったら分かるように）
const burst = async (page) => { const r = await page.evaluate((n) => window.__b7.burst(n), BATCH); if (!r) return null; const k = `${r.pr}:${r.w}x${r.h}`; const m = SIZES.get(page) || new Set(); m.add(k); SIZES.set(page, m); const c = CPU.get(page) || []; c.push(q25(r.cpu)); CPU.set(page, c); const w = RAW.get(page) || []; w.push(q25(r.ms)); RAW.set(page, w); const pp = PREIN.get(page) || []; pp.push(med(r.pre)); PREIN.set(page, pp); LASTPRE.set(page, med(r.pre)); LASTCPU.set(page, med(r.cpu))
  if (!NORM) return q25(r.ms)
  // こまごとに、直前の下ごしらえの時間で割る（GPU の動作の速さが上下しても、同じ仕事の下ごしらえも同じ割合で変わるので比に残らない・便7）。値は「下ごしらえ 40ms あたり」の ms
  const rs = r.ms.map((m, i) => (m != null && r.pre[i] ? m / r.pre[i] * 40 : null)); return med(rs) }

// A と B のページ（同じ眺め）を ABBA の順に交互に測り、組ごとの比 B/A の中央値を返す
async function compare(baseA, baseB, view) {
  const A = await open(baseA, view), B = await open(baseB, view)
  // 慣らし: 記録せずに両方を4塊ずつ（GPU の動作の速さを上げ、材の組み立ての残りを済ませる）
  for (let k = 0; k < 6; k++) { for (const P of [A, B]) { await burst(P.page); await P.page.evaluate(([m, t]) => window.__b7.adapt(m, t), [LASTPRE.get(P.page), Math.max(30, 1.6 * (LASTCPU.get(P.page) || 0))]) } } // 下ごしらえは CPU の時間の 1.6倍以上（最低 30ms）。GG の低空飛行で CPU の時間が 33ms に伸び、30ms では隠せなかった（便7）
  PREIN.set(A.page, []); PREIN.set(B.page, []); CPU.set(A.page, []); CPU.set(B.page, [])
  const ratios = [], aRuns = [], bRuns = []
  for (let k = 0; k < ROUNDS; k++) {
    const a1 = await burst(A.page), b1 = await burst(B.page), b2 = await burst(B.page), a2 = await burst(A.page)
    const avg = (x, y) => (x != null && y != null ? (x + y) / 2 : (x ?? y))
    const a = avg(a1, a2), b = avg(b1, b2)
    aRuns.push(r3(a)); bRuns.push(r3(b)); if (a && b) ratios.push(b / a)
  }
  const out = { view, prA: A.pr, prB: B.pr, sizeA: [...(SIZES.get(A.page) || [])], sizeB: [...(SIZES.get(B.page) || [])], preInA: (PREIN.get(A.page) || []).map(r3), preInB: (PREIN.get(B.page) || []).map(r3), rawA: r3(med(RAW.get(A.page) || [])), rawB: r3(med(RAW.get(B.page) || [])), cpuA: r3(med(CPU.get(A.page) || [])), cpuB: r3(med(CPU.get(B.page) || [])), infoA: A.info, infoB: B.info, gpu: A.info.gpu, callsA: A.info.calls, callsB: B.info.calls, a: r3(med(aRuns)), b: r3(med(bRuns)), ratio: r3(med(ratios)), ratioMin: r3(Math.min(...ratios)), ratioMax: r3(Math.max(...ratios)), ratios: ratios.map(r3), aRuns, bRuns, errs: [...A.errs, ...B.errs] }
  await A.ctx.close(); await B.ctx.close()
  return out
}

// ページを1つずつ開いて測って閉じる形: A B B A の順に PAGES 回開き、ページごとの値（慣らしの後の塊の中央値）を、A の組と B の組の中央値で比べる
//   2つのページを同時に開くと、絵がほぼ同じでも片方だけ 5〜17% 遅い片寄りが出た（専用の GPU のメモリから追い出された疑い・便7）
const PAGES = +(process.env.QA_PAGES || 8)
async function compareSeq(baseA, baseB, view) {
  const order = []; for (let k = 0; k < PAGES / 4; k++) order.push('A', 'B', 'B', 'A')
  const vals = { A: [], B: [] }, info = { A: [], B: [] }, errs = []
  for (const w of order) {
    const P = await open(w === 'A' ? baseA : baseB, view)
    for (let k = 0; k < 4; k++) await burst(P.page) // 慣らし
    const xs = []; for (let k = 0; k < SEQ_BURSTS; k++) xs.push(await burst(P.page))
    vals[w].push(r3(med(xs))); info[w].push({ calls: P.info.calls, cpu: r3(med(CPU.get(P.page) || [])), pre: P.info.pre })
    errs.push(...P.errs)
    await P.ctx.close()
  }
  const a = med(vals.A), b = med(vals.B)
  return { view, gpu: null, a: r3(a), b: r3(b), ratio: a && b ? r3(b / a) : null, ratioMin: r3(Math.min(...vals.B) / Math.max(...vals.A)), ratioMax: r3(Math.max(...vals.B) / Math.min(...vals.A)), aRuns: vals.A, bRuns: vals.B, infoA: info.A, infoB: info.B, errs }
}
const SEQ_BURSTS = +(process.env.QA_SEQB || 10)

// 1枚のページに2つの枠（A・B）を並べ、1つの繰り返しの中で A の1こま・B の1こまを休みなく交互に描いて測る（便7）
//   2つのページを塊で切り替える形では、合間に GPU が空き、ドライバーが動作の速さを落として（計算 210〜1560MHz・メモリ 405〜8000MHz を行き来）、
//   同じコードでも比が 0.93〜1.17倍に片寄った。交互に休みなく描けば、A と B は同じ速さの時に描かれる
const PAIR_N = +(process.env.QA_PAIRN || 24) // 1回の繰り返しのこまの組の数
async function comparePair(baseA, baseB, view) {
  const b = await getBrowser()
  const ctx = await b.newContext({ ...IPHONE, viewport: { width: 804, height: 874 } })
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }) })
  await ctx.addInitScript(pinStart, 'kitaterao-window-3d')
  if (SEED) await ctx.addInitScript(seedRandom)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PE: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest|preload/i.test(m.text())) errs.push('CE: ' + m.text().slice(0, 200)) })
  await page.setContent('<style>body{margin:0;display:flex;background:#000}iframe{width:402px;height:874px;border:0;display:block}</style><iframe id="a"></iframe><iframe id="b"></iframe>')
  const frameOf = async (id, base) => {
    await page.evaluate(([id, u]) => { document.getElementById(id).src = u }, [id, base + '?dev=1'])
    await page.waitForFunction((id) => { try { const w = document.getElementById(id).contentWindow; return w.location.href !== 'about:blank' && w.document.readyState !== 'loading' } catch { return false } }, id, { timeout: 120000 })
    return (await page.$('#' + id)).contentFrame()
  }
  // 1つずつ整える（同時に組み立てると CPU を取り合い、整える手順の時刻がずれる）
  const A = await setupTarget(await frameOf('a', baseA), baseA, view)
  const B = await setupTarget(await frameOf('b', baseB), baseB, view)
  const run = (order) => page.evaluate(async ([n, order]) => {
    const A = document.getElementById('a').contentWindow.__b7, B = document.getElementById('b').contentWindow.__b7
    for (let i = 0; i < n; i++) { if (order) { await A.stepWait(); await B.stepWait() } else { await B.stepWait(); await A.stepWait() } }
    const ra = await A.collect(), rb = await B.collect()
    return { a: ra, b: rb }
  }, [PAIR_N, order])
  for (let k = 0; k < 3; k++) await run(k % 2 === 0) // 慣らし
  // 慣らしの後（GPU が速くなった時）に、下ごしらえを 30ms へ合わせ直す（こまの指示を送る CPU の時間 約14ms より十分長く）
  const calA = await page.evaluate(() => document.getElementById('a').contentWindow.__b7.calibrate(30)), calB = await page.evaluate(() => document.getElementById('b').contentWindow.__b7.calibrate(30))
  await run(true)
  const ratios = [], aRuns = [], bRuns = [], aPre = [], bPre = []
  for (let k = 0; k < ROUNDS; k++) {
    const r = await run(k % 2 === 0) // 前後の順も組ごとに入れ替える
    if (!r.a || !r.b || r.a.disjoint || r.b.disjoint) continue
    const ma = med(r.a.ms), mb = med(r.b.ms)
    aRuns.push(r3(ma)); bRuns.push(r3(mb)); aPre.push(r3(med(r.a.pre))); bPre.push(r3(med(r.b.pre)))
    // 組の中のこまごとの比の中央値（同じ瞬間の A と B）
    const pr = r.a.ms.map((x, i) => (x && r.b.ms[i] ? r.b.ms[i] / x : null))
    ratios.push(med(pr))
  }
  const out = { view, mode: 'pair', calA, calB, gpu: A.info.gpu, prA: A.pr, prB: B.pr, callsA: A.info.calls, callsB: B.info.calls, a: r3(med(aRuns)), b: r3(med(bRuns)), preA: r3(med(aPre)), preB: r3(med(bPre)), ratio: r3(med(ratios)), ratioMin: r3(Math.min(...ratios)), ratioMax: r3(Math.max(...ratios)), ratios: ratios.map(r3), aRuns, bRuns, errs }
  await ctx.close()
  return out
}

const CHECKS = {}
const def = (id, fn) => { CHECKS[id] = fn }
// GS 物差しの確かめ: 同じ前のコードを2つ開いて比べる。比が 0.98〜1.02 なら、この測り方は 2% の差を判じられる
def('GS', async () => {
  const res = {}
  for (const view of ['window', 'fly']) res[view] = await compare(BASE_BEFORE, BASE_BEFORE, view)
  const ok = (v) => res[v].ratio != null && Math.abs(res[v].ratio - 1) <= 0.02 && res[v].errs.length === 0
  return { pass: ok('window') && ok('fly'), rounds: ROUNDS, batch: BATCH, ...res }
})
// GS1 物差しの確かめ（1つずつ開く形）: 同じ前のコードを A と B として compareSeq で比べる
def('GS1', async () => {
  const res = {}
  for (const view of (process.env.QA_VIEWS || 'window,fly').split(',')) res[view] = await compareSeq(BASE_BEFORE, BASE_BEFORE, view)
  const ok = (v) => res[v].ratio != null && Math.abs(res[v].ratio - 1) <= 0.02 && res[v].errs.length === 0
  return { pass: Object.keys(res).every(ok), pages: PAGES, bursts: SEQ_BURSTS, batch: BATCH, ...res }
})
// GSP 物差しの確かめ（2つの枠を交互に描く形）: 同じ前のコードを2つの枠に開いて比べる。比が 0.98〜1.02 なら 2% の差を判じられる
def('GSP', async () => {
  const res = {}
  for (const view of (process.env.QA_VIEWS || 'window,fly').split(',')) res[view] = await comparePair(BASE_BEFORE, BASE_BEFORE, view)
  const ok = (v) => res[v].ratio != null && Math.abs(res[v].ratio - 1) <= 0.02 && res[v].errs.length === 0
  return { pass: Object.keys(res).every(ok), rounds: ROUNDS, pairN: PAIR_N, ...res }
})
// GG 前のコードと後のコード: 窓辺と低空飛行のどちらも後が前の1.05倍以下
def('GG', async () => {
  const res = {}
  for (const view of (process.env.QA_VIEWS || 'window,fly').split(',')) res[view] = await compare(BASE_BEFORE, BASE, view)
  const ok = (v) => res[v].ratio != null && res[v].ratio <= 1.05 && res[v].errs.length === 0
  return { pass: Object.keys(res).every(ok), rounds: ROUNDS, batch: BATCH, ...res }
})

// GD 切り分け（記録だけ）: 同じコードの2ページを止めた後に1こまずつ描いて画を取り、画素の差の平均を見る（2ページの絵が同じかどうか）
const snap = (page) => page.evaluate(() => { const g = window.__shGet(); g.composer.render(); return g.renderer.domElement.toDataURL('image/png') })
def('GD', async () => {
  const res = {}
  for (const view of ['window', 'fly']) {
    const A = await open(BASE_BEFORE, view), B = await open(BASE_BEFORE, view)
    const a = await snap(A.page), b = await snap(B.page), a2 = await snap(A.page)
    const d = await A.page.evaluate(async ([a, b, a2]) => {
      const load = (s) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = s })
      const [ia, ib, ia2] = await Promise.all([load(a), load(b), load(a2)])
      const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data }
      const pa = px(ia), pb = px(ib), pa2 = px(ia2)
      const md = (p, q) => { let s = 0, n = 0; for (let i = 0; i < p.length; i += 4) { s += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]); n += 3 } return +(s / n).toFixed(3) }
      // 縦に8つの帯ごとの差（どこが違うか）
      const bands = []; const W = ia.width, H = ia.height
      for (let k = 0; k < 8; k++) { let s = 0, n = 0; for (let y = Math.floor(H * k / 8); y < Math.floor(H * (k + 1) / 8); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; s += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]); n += 3 } bands.push(+(s / n).toFixed(2)) }
      return { w: W, h: H, ab: md(pa, pb), aa: md(pa, pa2), bands }
    }, [a, b, a2])
    res[view] = d
    await A.ctx.close(); await B.ctx.close()
  }
  return { pass: true, recordOnly: true, ...res }
})

// GV 切り分け（記録だけ）: 同じコードの2ページを止めた後、視野に入る見えている物の一覧（親の名前・名前・形の種類・頂点の数）を突き合わせ、違う物を出す
const visList = (page) => page.evaluate(() => {
  const g = window.__shGet(), cam = g.camera, T = g.THREE
  g.composer.render(); cam.updateMatrixWorld()
  const fr = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
  const m = {}
  const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true }
  g.scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !vis(o)) return
    if (o.frustumCulled && o.geometry && !fr.intersectsObject(o)) return
    const k = `${o.parent && o.parent.name || '-'}/${o.name || '-'}/${o.geometry && o.geometry.type}/${o.geometry && o.geometry.attributes && o.geometry.attributes.position ? o.geometry.attributes.position.count : 0}/${o.isInstancedMesh ? 'inst' + o.count : ''}`
    m[k] = (m[k] || 0) + 1
  })
  return m
})
def('GV', async () => {
  const res = {}
  for (const view of (process.env.QA_VIEWS || 'fly').split(',')) {
    const A = await open(BASE_BEFORE, view), B = await open(BASE_BEFORE, view)
    const a = await visList(A.page), b = await visList(B.page)
    const diff = []
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if ((a[k] || 0) !== (b[k] || 0)) diff.push([k, a[k] || 0, b[k] || 0])
    res[view] = { nA: Object.values(a).reduce((x, y) => x + y, 0), nB: Object.values(b).reduce((x, y) => x + y, 0), callsA: A.info.calls, callsB: B.info.calls, diff: diff.slice(0, 80) }
    await A.ctx.close(); await B.ctx.close()
  }
  return { pass: true, recordOnly: true, ...res }
})

// GM 切り分け（記録だけ）: 3秒の間に親から見た位置が変わる入れ物と、木の先祖の道
def('GM', async () => {
  const A = await open(BASE_BEFORE, 'window')
  await A.page.evaluate(() => window.__town3dPaused(false))
  const r = await A.page.evaluate(async () => {
    const g = window.__shGet(); const snap = new Map(); const moved = new Map()
    const path = (o) => { const a = []; for (let p = o; p && p !== g.scene; p = p.parent) a.unshift((p.name || p.type) + '#' + (p.parent ? p.parent.children.indexOf(p) : 0)); return a.join('/') }
    for (let k = 0; k < 12; k++) {
      g.scene.traverse((o) => { if (o.isMesh || o === g.scene) return; o.updateMatrix(); const key = o.matrix.elements.map((x) => x.toFixed(3)).join(','); const p = snap.get(o); if (p != null && p !== key) moved.set(o, path(o)); snap.set(o, key) })
      await new Promise((res) => setTimeout(res, 250))
    }
    const out = []; for (const [o, p] of moved) { let n = 0; o.traverse((c) => { if (c.isMesh) n++ }); out.push([p, n]) }
    return { moved: out.sort((a, b) => b[1] - a[1]).slice(0, 20), treePath: path(window.__b6R.trees[0]) }
  })
  await A.ctx.close()
  return { pass: true, recordOnly: true, ...r }
})

// ── 実行 ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
let ids = []
for (const a of argv) { if (a === 'all') ids.push(...Object.keys(CHECKS)); else ids.push(a) }
ids = [...new Set(ids)]
if (!ids.length) { console.log('使い方: node scripts/qa-bin7.mjs <ID…|all>  検査:', Object.keys(CHECKS).join(' ')); process.exit(2) }
let fail = 0
const summary = {}
for (const id of ids) {
  const fn = CHECKS[id]
  if (!fn) { console.log(`${id} 検査なし`); fail++; continue }
  const t0 = Date.now()
  let r
  try { r = await fn() } catch (e) { r = { pass: false, threw: String(e && e.stack || e).slice(0, 400) } }
  r.id = id; r.ms = Date.now() - t0; r.at = new Date().toISOString()
  r.settings = { HIDE, GPU_HIGH, SEED, FIX_T, HIDE_DYN, NORM, ROUNDS, BATCH, PAIR_N, PAGES, SEQ_BURSTS } // その回の設定（記録から測り方が分かるように・便7 の外の目）
  try { r.commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* 無視 */ }
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(r, null, 1))
  summary[id] = r.pass
  if (!r.pass) fail++
  const line = ['window', 'fly'].filter((v) => r[v]).map((v) => `${v === 'window' ? '窓辺' : '低空飛行'} ${r[v].a}→${r[v].b}ms（${r[v].ratio}倍・組ごと ${r[v].ratioMin}〜${r[v].ratioMax}）`).join('・')
  console.log(`${id} ${r.pass ? '合格' : '不合格'} (${(r.ms / 1000).toFixed(1)}秒) ${line}${r.threw ? ' ' + r.threw : ''}`)
}
if (browser) await browser.close()
const passN = Object.values(summary).filter(Boolean).length
console.log(`検査の終わり: ${passN}/${ids.length} 合格`)
fs.writeFileSync(path.join(OUT, '_last-run.json'), JSON.stringify({ at: new Date().toISOString(), ids, summary, pass: passN, total: ids.length }, null, 1))
process.exit(fail ? 1 : 0)
