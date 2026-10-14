// 便8（2026-10-14・設計案の便・便7 #1=1）の案の画: 前のコード・今のコード・削り方の案を、同じ眺めで撮って並べる。
// 本体の src は変えない。案は別の作業フォルダ（今のコードに削り方を当てた物）を、_bin6-vite.config.mjs の撮影の口つきで別の番号に立てて撮る。
// 使い方: node scripts/qa-bin8-shots.mjs <札=URL …>   例: before=http://localhost:4964/seasons/ now=http://localhost:4963/seasons/ a=…
//   QA_OUT=…（既定 docs/qa/2026-10-14_便8/mocks）。眺めは 窓辺（iPhone・窓をあけた所）・低空飛行（PC と iPhone）・歩く目線（PC）
//   並べた画は scripts/qa-bin8-sheet.mjs で作る
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.env.QA_OUT || 'docs/qa/2026-10-14_便8/mocks'
fs.mkdirSync(OUT, { recursive: true })
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const DEVICES = {
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const FLYLOW = [9.8, 48, 38.8, -19.4, -15.9, -32.4, 73.6] // 便3〜便7 の低空飛行の眺め（qa-bin6.mjs の CAM.flylow と同じ）
const WALK = [2, -18, 2, -40] // 歩く目線（qa-bin6.mjs の WALK と同じ）
// 両方のページの Math.random の種をそろえる（開くたびに鳥や人の数が違うと、案どうしの画の差に入るため・qa-bin7.mjs と同じ）
const seedRandom = () => { let a = 20261014; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const pinStart = (sid) => { try { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.sceneId = sid; st.sceneAt = Date.now(); localStorage.setItem(k, JSON.stringify(st)) } catch { /* 無視 */ } }
const INJECT = () => {
  const g = window.__shGet && window.__shGet(); if (!g || !g.composer) return false
  const S = (window.__b8 = { cam: null })
  const { camera, composer } = g
  const orig = composer.render.bind(composer)
  composer.render = (...a) => { const c = S.cam; if (c) { camera.position.set(...c.p); camera.up.set(0, 1, 0); camera.lookAt(...c.l); if (c.fov && camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix() } camera.updateMatrixWorld() } return orig(...a) }
  return true
}

let browser = null
const getBrowser = async () => (browser ||= await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] }))

async function open(base, dev) {
  const ctx = await (await getBrowser()).newContext(DEVICES[dev])
  if (dev === 'iphone') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }) })
  await ctx.addInitScript(pinStart, 'kitaterao-window-3d')
  await ctx.addInitScript(seedRandom)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PE: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest|preload/i.test(m.text())) errs.push('CE: ' + m.text().slice(0, 200)) })
  await page.goto(base + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await wait(2500)
  await page.waitForSelector('.gate', { timeout: 15000 }).catch(() => {})
  await page.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {})
  await page.waitForSelector('.gate', { state: 'detached', timeout: 8000 }).catch(() => {})
  await wait(1200)
  await page.evaluate((s) => window.__applyScene(s), 'kitaterao-window-3d')
  await wait(11000)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .stagedots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"]{display:none !important}' })
  await page.evaluate(() => window.__town3dWindow(true)); await wait(3000)
  if (!(await page.evaluate(INJECT))) throw new Error('撮影の口（__shGet）が無い: ' + base)
  await page.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) }) // 日の傾きを頭に戻す（どのページも同じ時刻）
  return { ctx, page, errs }
}
async function fly(page, cam) {
  const [x, y, z, lx, ly, lz, fov] = cam
  await page.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
  const dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, -dz)
  await page.evaluate((a) => window.__town3dFlyPose(...a), [x - dx / d * 5, y, z - dz / d * 5, yaw, 0]); await wait(1500)
  await page.evaluate((c) => { window.__b8.cam = c }, { p: [x, y, z], l: [lx, ly, lz], fov }); await wait(7000)
}
// 描く細かさを段の天井にそろえて撮る（iPhone は本物が描く細かさ・PC は 1.0）
async function grab(page, name, { fly: isFly = false, pc = false } = {}) {
  const vp = page.viewportSize()
  await page.mouse.move(vp.width / 2, vp.height / 2); await page.mouse.move(vp.width / 2 + 1, vp.height / 2 + 1); await wait(1500)
  await page.evaluate(() => { for (const d of document.querySelectorAll('div')) if (d.style.zIndex === '7' && d.style.pointerEvents === 'none') d.style.display = 'none' })
  const pr = await page.evaluate(([f, p]) => { const q = window.__town3dQuality(); const v = p ? 1 : f ? Math.min(q.cap, q.fly) : q.cap; window.__shGet().setCurPR(v); return v }, [isFly, pc])
  await wait(1200)
  const f = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: f }) // 描画は止めずに撮る（止めると画が黒くなることがあった）
  return { f: f.replace(/\\/g, '/'), pr }
}

const targets = process.argv.slice(2).map((a) => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)] })
if (!targets.length) { console.error('使い方: node scripts/qa-bin8-shots.mjs <札=URL …>'); process.exit(2) }
const log = {}
for (const [tag, base] of targets) {
  const r = (log[tag] = { base, shots: {}, errs: [] })
  { const { ctx, page, errs } = await open(base, 'iphone')
    r.shots.window_iphone = await grab(page, `${tag}_window_iphone`)
    await fly(page, FLYLOW); r.shots.flylow_iphone = await grab(page, `${tag}_flylow_iphone`, { fly: true })
    r.errs.push(...errs); await ctx.close() }
  { const { ctx, page, errs } = await open(base, 'pc')
    await fly(page, FLYLOW); r.shots.flylow_pc = await grab(page, `${tag}_flylow_pc`, { pc: true })
    await page.evaluate((a) => window.__town3dFlyPose(...a), [WALK[0], 6, WALK[1] + 5, Math.PI, -0.05]); await wait(1500)
    const c = await page.evaluate(([x, z, lx, lz]) => { const g = window.__town3dGroundAt(x, z), gl = window.__town3dGroundAt(lx, lz); return [x, g + 1.6, z, lx, gl + 1.4, lz, 62] }, WALK)
    await page.evaluate((cc) => { window.__b8.cam = { p: cc.slice(0, 3), l: cc.slice(3, 6), fov: cc[6] } }, c); await wait(6000)
    r.shots.walk_pc = await grab(page, `${tag}_walk_pc`, { pc: true })
    r.errs.push(...errs); await ctx.close() }
  console.log(tag, Object.keys(r.shots).join(' '), 'エラー', r.errs.length)
}
fs.writeFileSync(path.join(OUT, '_shots.json'), JSON.stringify({ at: new Date().toISOString(), log }, null, 1))
await browser.close()
