// 便2（2026-10-12・qa-gate 一括 #1:2 #2:1）の検査。計画表 docs/qa/2026-10-12_seasons_一括.md の行ごとに1つの検査を持つ。
// 使い方: 開発サーバーを 4960 で起動してから  node scripts/qa-bin2.mjs <ID…|all>
//   QA_BASE=…（既定 http://localhost:4960/seasons/）／QA_OUT=…（既定 docs/qa/2026-10-12_便2/gate）／QA_SHOT=前|後（画の札）
// 各検査は { pass, …測った数 } を返し、QA_OUT/<ID>.json に書く。1つでも不合格なら終わりの値 1。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { execSync } from 'node:child_process'
import { SCENES } from '../src/data/scenes/index.js'

const BASE = process.env.QA_BASE || 'http://localhost:4960/seasons/'
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-12_便2/gate'
const SHOT_TAG = process.env.QA_SHOT || ''
const SHOT_DIR = process.env.QA_SHOTDIR || 'docs/確認用スクショ/seasons/2026-10-12_便2'
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const UA_IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
export const DEVICES = {
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD },
  ipadL: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD },
  ipad13: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD },
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 },
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const soundsOf = (id) => ((SCENES.find((s) => s.id === id) || {}).sounds || [])

let browser = null
async function getBrowser() {
  if (!browser) browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
  return browser
}
// 端末の名乗り（iPad は Mac として名乗り、指の数で iPad と分かる）を撮影の台本と同じに再現する
async function open(dev = 'pc', { query = '?dev=1', init = null, base = BASE, ctxOpts = {} } = {}) {
  const b = await getBrowser()
  const ctx = await b.newContext({ ...DEVICES[dev], ...ctxOpts })
  if (dev.startsWith('ipad')) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }) })
  if (dev === 'iphone') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }) })
  if (init) await ctx.addInitScript(init.fn, init.arg)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PE: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CE: ' + m.text().slice(0, 200)) })
  await page.goto(base + query, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(2500)
  return { ctx, page, errs }
}
// 入口の画面を押して始める。Playwright の click は入口がふわっと現れる間に時間切れになることがあるので、要素へ直に click を送り、消えるまで待つ
// 起動の情景を、その検査の情景に固定する（「さっきの続き」として保存しておく）。起動の情景は時刻で替わる「いま」の情景なので、
// 開発の口で情景を当てる検査は、朝と夜で結果が変わることがあった（主ボタンは画面の側が起動の情景で出し入れする・2D は前の情景から色が移る途中を測る）。便2 の全テストで V54・V33・V10 が朝だけ落ちた
const pinStart = (id) => ({ fn: (sid) => { try { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.sceneId = sid; st.sceneAt = Date.now(); localStorage.setItem(k, JSON.stringify(st)) } catch { /* 無視 */ } }, arg: id })
async function gateStart(page) {
  await page.waitForSelector('.gate', { timeout: 15000 }).catch(() => {})
  await page.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {})
  await page.waitForSelector('.gate', { state: 'detached', timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1200)
}
async function apply(page, id, ms = 6000) {
  await page.evaluate((i) => window.__applyScene(i), id)
  await page.waitForTimeout(ms)
}
const ev = (page, fn, arg) => page.evaluate(fn, arg).catch((e) => ({ __err: String(e).slice(0, 200) }))
async function shot(page, name, opts = {}) {
  if (!SHOT_TAG) return null
  const f = path.join(SHOT_DIR, `${name}_${SHOT_TAG}.png`)
  await page.screenshot({ path: f, ...opts })
  // 記録にはリポジトリの中の相対の道で書く（PC のユーザー名入りの道を記録に残さない・便2 の外の目の見直し）
  return path.relative(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), f).replace(/\\/g, '/')
}
// 検査が意図して起こす例外（検査用）と、既知の無害な行は数えない
const realErrs = (errs) => errs.filter((e) => !/検査用|favicon|manifest|preload/i.test(e))

// ── 検査 ──────────────────────────────────────────────────────────────
const CHECKS = {}
const G = {} // 群 → ID の一覧
function def(group, id, fn) { CHECKS[id] = fn; (G[group] ||= []).push(id) }

// 群1 音と状態 ─────────────────────────────────────────────────────────
def('g1', 'D7', async () => {
  const { page, errs } = await open('pc')
  await gateStart(page)
  await apply(page, 'summer-rain-dusk', 6000)
  const a = await ev(page, () => window.__audio._dbg())
  await apply(page, 'kitaterao-window-3d-sunset', 8000)
  await ev(page, () => window.__town3dDrift && window.__town3dDrift(1))
  await ev(page, () => window.__town3dWindow(true)); await wait(2500)
  await ev(page, () => window.__town3dFlyToggle(true)); await wait(3000)
  await ev(page, () => window.__town3dFlyPose(0, 150, 120, Math.PI, -0.1)); await wait(5000)
  const hi = await ev(page, () => window.__audio._dbg())
  await apply(page, 'summer-rain-dusk', 6000)
  const b = await ev(page, () => window.__audio._dbg())
  const sum = (x) => (x && x.loops ? x.loops.reduce((p, q) => p + q, 0) : 0)
  const ratio = sum(a) > 0 ? +(sum(b) / sum(a)).toFixed(3) : null
  const pass = !!(hi && hi.altDuck > 0.5 && b && b.altDuck === 0 && ratio !== null && ratio > 0.7 && ratio < 1.3 &&
    typeof b.duskShelf === 'number' && b.duskShelf > -0.3 && b.flyWind === 0 && hi.duskShelf !== undefined && hi.duskShelf < -0.5)
  return { pass, first: a, high: hi, after: b, loopRatio: ratio, errs: realErrs(errs) }
})
def('g1', 'S2', async () => {
  const { page, errs } = await open('pc')
  await gateStart(page)
  await wait(1500)
  const d = await ev(page, () => window.__audio._dbg())
  const c = d && d.chime
  return { pass: !!(c && c.bus === 'direct' && c.when === 'before-scene' && c.gain > 0.05), chime: c || null, errs: realErrs(errs) }
})
def('g1', 'S4', async () => {
  const { page, errs } = await open('pc')
  await gateStart(page)
  const seq = ['summer-rain-dusk', 'summer-dusk-seaside', 'summer-morning-mountains', 'autumn-rain-dusk']
  for (const id of seq) await apply(page, id, 6000)
  const d = await ev(page, () => window.__audio._dbg())
  const keep = new Set([...soundsOf('autumn-rain-dusk'), ...soundsOf('summer-morning-mountains')].map((s) => s.src))
  const cache = (d && d.cache) || null
  const extra = cache ? cache.filter((k) => !keep.has(k)) : null
  return { pass: !!(cache && cache.length > 0 && extra.length === 0), cache, keep: [...keep], extra, errs: realErrs(errs) }
})
def('g1', 'S16', async () => {
  const init = {
    fn: () => {
      window.__failResume = 1; window.__forceSusp = true
      const AC = window.AudioContext
      const desc = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state')
      Object.defineProperty(AC.prototype, 'state', { configurable: true, get() { return window.__forceSusp ? 'suspended' : desc.get.call(this) } })
      const orig = AC.prototype.resume
      AC.prototype.resume = function () { if (window.__failResume > 0) { window.__failResume--; return Promise.reject(new Error('検査用: resume を1回失敗させる')) } window.__forceSusp = false; return orig.call(this) }
    },
  }
  const { page, errs } = await open('iphone', { init })
  await gateStart(page)
  const s1 = await ev(page, () => window.__audio.isStarted())
  await page.touchscreen.tap(200, 600); await wait(2500)
  const s2 = await ev(page, () => window.__audio.isStarted())
  return { pass: s1 === false && s2 === true, startedAfterGate: s1, startedAfterTap: s2, errs: realErrs(errs) }
})
def('g1', 'S18', async () => {
  const { page, errs } = await open('pc')
  await gateStart(page)
  await apply(page, 'shishigaya-window-3d', 30000)
  const d = await ev(page, () => window.__audio._dbg())
  const snd = soundsOf('shishigaya-window-3d')
  const bound = snd.filter((s) => s.loop !== false).length + snd.filter((s) => s.loop === false && s.interval).length + 1
  const n = d && typeof d.timers === 'number' ? d.timers : null
  return { pass: n !== null && n <= bound && (d.timersFired || 0) > 0, timers: n, fired: d && d.timersFired, bound, errs: realErrs(errs) }
})
def('g1', 'D8', async () => {
  const { ctx, page, errs } = await open('pc')
  await gateStart(page)
  const chipOn = async () => ev(page, () => { const row = [...document.querySelectorAll('.setrow')].find((r) => /おやすみ/.test(r.textContent)); const on = row && row.querySelector('.chip--on'); return on ? on.textContent : null })
  const openSet = async () => { await page.locator('.topbar .iconbtn', { hasText: '設定' }).click({ force: true }).catch(() => {}); await wait(900) }
  await openSet()
  await page.locator('.chip', { hasText: '30分' }).first().click({ force: true }).catch(() => {}); await wait(600)
  const picked = await chipOn()
  // 症状の道: 選んだ後に、ほかの保存（情景を替えた記録など）が走ってから開き直す
  await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(5, 1075); await wait(300)
  await apply(page, 'summer-rain-dusk', 1500)
  // 20秒ごとの保存と同じ道（眺めた時間の保存）に乗せてから開き直す
  await ev(page, () => { const s = JSON.parse(localStorage.getItem('seasons.state.v1') || '{}'); return s.settings && s.settings.sleep })
  await page.reload({ waitUntil: 'domcontentloaded' }); await wait(2500)
  await gateStart(page); await openSet()
  const afterReload = await chipOn()
  const saved = await ev(page, () => { const s = JSON.parse(localStorage.getItem('seasons.state.v1') || '{}'); return s.settings ? (s.settings.sleep ?? null) : null })
  // 暗転が終わった後の点灯
  await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(5, 1075); await wait(500)
  await openSet(); await page.locator('.chip', { hasText: '15分' }).first().click({ force: true }).catch(() => {}); await wait(400)
  await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(5, 1075); await wait(300)
  await ev(page, () => window.__sleepNow(400)); await wait(1500)
  await page.mouse.click(960, 540); await wait(800)
  await openSet()
  const afterSleep = await chipOn()
  await ctx.close()
  return { pass: picked === '30分' && afterReload === 'なし' && afterSleep === 'なし', picked, afterReload, savedSleep: saved, afterSleep, errs: realErrs(errs) }
})
def('g1', 'S50', async () => {
  const init = { fn: () => { try { const k = 'seasons.state.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.settings = { ...(s.settings || {}), tilt: true }; localStorage.setItem(k, JSON.stringify(s)) } catch { /* 無視 */ } } }
  const { page, errs } = await open('iphone', { init })
  await gateStart(page)
  const st = await ev(page, () => window.__tiltState && window.__tiltState())
  await apply(page, 'kitaterao-window-3d', 7000)
  await ev(page, () => { const f = (g, b) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { gamma: g, beta: b, alpha: 0 })); f(0, 40); f(10, 40) })
  await wait(400)
  const t3 = await ev(page, () => window.__town3dTilt && window.__town3dTilt())
  const ax = await ev(page, () => window.__tiltAxes && [window.__tiltAxes(10, 30, 0), window.__tiltAxes(10, 30, 90), window.__tiltAxes(10, 30, 270)])
  const axOk = Array.isArray(ax) && ax[0][0] === 10 && ax[0][1] === 30 && ax[1][0] === 30 && ax[1][1] === -10 && ax[2][0] === -30 && ax[2][1] === 10
  return { pass: !!(st && st.enabled === true && t3 && Math.abs(t3.x - 0.4) < 0.05 && t3.yaw > 0.03 && axOk), tilt: st, town3d: t3, axes: ax, errs: realErrs(errs) }
})
def('g1', 'S34', async () => {
  const { page, errs } = await open('pc')
  await gateStart(page)
  await apply(page, 'summer-rain-dusk', 4000)
  await ev(page, () => window.__sleepNow(300)); await wait(1500)
  const paused = await ev(page, () => window.__renderer.isRunning && window.__renderer.isRunning())
  await ev(page, () => { document.dispatchEvent(new Event('visibilitychange')) }); await wait(600)
  const afterVis = await ev(page, () => window.__renderer.isRunning && window.__renderer.isRunning())
  await page.mouse.click(960, 540); await wait(800) // 触れて戻る
  const back2d = await ev(page, () => window.__renderer.isRunning && window.__renderer.isRunning())
  await apply(page, 'kitaterao-window-3d', 7000)
  await ev(page, () => window.__sleepNow(300)); await wait(1500)
  await page.mouse.click(960, 540); await wait(800)
  const in3d = await ev(page, () => window.__renderer.isRunning && window.__renderer.isRunning())
  return { pass: paused === false && afterVis === false && back2d === true && in3d === false, pausedAfterSleep: paused, afterVisibility: afterVis, after2dTouch: back2d, rendererIn3dAfterTouch: in3d, errs: realErrs(errs) }
})
def('g1', 'S53', async () => {
  const b = await getBrowser()
  const ctx = await b.newContext(DEVICES.pc)
  await ctx.route('**/bg/summer-rain-dusk-b.jpg', async (route) => { await wait(2500); await route.continue() })
  const page = await ctx.newPage(); const errs = []
  page.on('pageerror', (e) => errs.push('PE: ' + e.message))
  await page.goto(BASE + '?dev=1', { waitUntil: 'domcontentloaded' }); await wait(2500)
  await gateStart(page)
  await ev(page, () => window.__applyScene('summer-rain-dusk')); await wait(60)
  await ev(page, () => window.__applyScene('autumn-rain-dusk')); await wait(5000)
  const info = await ev(page, () => window.__renderer.bgInfo && window.__renderer.bgInfo())
  await ctx.close()
  return { pass: !!(info && info.key === 'bg/autumn-rain-dusk.jpg' && info.texKey === info.key), info, errs: realErrs(errs) }
})
def('g1', 'S38', async () => {
  const { page, errs } = await open('pc')
  await gateStart(page)
  await apply(page, 'kitaterao-window-3d', 8000)
  const f0 = await ev(page, () => window.__town3dStats().frames)
  await ev(page, () => window.__town3dThrowFrames(60)); await wait(1500)
  const f1 = await ev(page, () => window.__town3dStats().frames)
  await ev(page, () => window.__town3dComposerThrow()); await wait(800)
  const mid = await ev(page, () => window.__town3dStats().composer)
  await wait(6500)
  const end = await ev(page, () => window.__town3dStats().composer)
  const drew = typeof f0 === 'number' && typeof f1 === 'number' ? f1 - f0 : null
  return { pass: drew !== null && drew >= 10 && end === true, framesDuringThrow: drew, composerJustAfter: mid, composerAfter7s: end, errs: realErrs(errs) }
})
def('g1', 'D9', async () => {
  const { page, errs } = await open('pc')
  await gateStart(page)
  await apply(page, 'kitaterao-window-3d', 7000)
  const in3d = await ev(page, () => window.__town3dStats && window.__town3dStats())
  await apply(page, 'summer-rain-dusk', 3000)
  const out = await ev(page, () => ({ stats: typeof window.__town3dStats === 'function' ? window.__town3dStats() : null, draw: typeof window.__town3dDraw === 'function' ? window.__town3dDraw() : null }))
  return { pass: !!(in3d && in3d.calls >= 0 && out && out.stats === null && out.draw === null), in3d, after2d: out, errs: realErrs(errs) }
})
def('g1', 'S41', async () => {
  const { page, errs } = await open('pc', { query: '?nodev=1' })
  const r = await ev(page, () => ({ events2d: typeof window.__events2d, audio: typeof window.__audio, apply: typeof window.__applyScene }))
  return { pass: r.events2d === 'undefined' && r.audio === 'undefined' && r.apply === 'undefined', hooks: r, errs: realErrs(errs) }
})
def('g1', 'S52', async () => {
  const s = fs.readFileSync('src/state.js', 'utf8')
  const ok = /'soft'\(こまやか\)/.test(s) && /'standard'\(ふつう\)/.test(s) && /'light'\(軽やか\)/.test(s)
  return { pass: ok, line: (s.split('\n').find((l) => /quality:/.test(l)) || '').trim() }
})
// 本番のビルド（dist）を自前の小さな配信台で出し、取りに来た回数を数える（SW の控えの効き方を測る）
function serveDist(port) {
  const hits = []
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0])
    hits.push(u)
    let p = u.replace(/^\/seasons\//, '')
    if (!p || p.endsWith('/')) p += 'index.html'
    const f = path.join('dist', p)
    if (!f.startsWith('dist') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    fs.createReadStream(f).pipe(res)
  })
  return new Promise((r) => srv.listen(port, () => r({ srv, hits })))
}
def('g1', 'S39', async () => {
  if (!fs.existsSync('dist/sw.js')) return { pass: false, why: 'dist が無い（npm run build を先に）' }
  const sw = fs.readFileSync('dist/sw.js', 'utf8')
  const ver = (sw.match(/const BUILD = '([^']+)'/) || [])[1] || (sw.match(/const VERSION = '([^']+)'/) || [])[1] || null
  const { srv } = await serveDist(4971)
  const b = await getBrowser()
  const ctx = await b.newContext(DEVICES.pc)
  const page = await ctx.newPage()
  await page.goto('http://localhost:4971/seasons/', { waitUntil: 'load' }); await wait(4000)
  // 前の版の控え（手で上げていた版の名前）を置いてから SW を入れ直し、掃除されるかを見る
  await ev(page, async () => { const c = await caches.open('seasons-v5-assets'); await c.put('/seasons/assets/old-chunk.js', new Response('old')); const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister() })
  await page.reload({ waitUntil: 'load' }); await wait(5000)
  const keys = await ev(page, () => caches.keys())
  await ctx.close(); srv.close()
  const placeholder = /__SEASONS_BUILD__/.test(sw)
  return { pass: !!(ver && ver !== 'seasons-v5' && !placeholder && Array.isArray(keys) && !keys.includes('seasons-v5-assets') && keys.some((k) => k.includes(ver))), version: ver, cacheKeys: keys }
})
def('g1', 'S40', async () => {
  if (!fs.existsSync('dist/sw.js')) return { pass: false, why: 'dist が無い（npm run build を先に）' }
  const { srv, hits } = await serveDist(4972)
  const b = await getBrowser()
  const ctx = await b.newContext(DEVICES.pc)
  const page = await ctx.newPage()
  await page.goto('http://localhost:4972/seasons/?dev=1', { waitUntil: 'load' }); await wait(4000)
  await page.locator('.gate').click().catch(() => {}); await wait(1200)
  await ev(page, () => window.__applyScene('kitaterao-window-3d')); await wait(9000)
  await page.reload({ waitUntil: 'load' }); await wait(1500)
  const mark = hits.length
  await page.locator('.gate').click().catch(() => {}); await wait(1200)
  await ev(page, () => window.__applyScene('kitaterao-window-3d')); await wait(9000)
  const second = hits.slice(mark).filter((u) => /\/seasons\/assets\//.test(u))
  const controlled = await ev(page, () => !!navigator.serviceWorker.controller)
  await ctx.close(); srv.close()
  return { pass: controlled === true && second.length === 0, controlled, assetFetchesOnSecondLoad: second.length, sample: second.slice(0, 6) }
})
def('g1', 'S26', async () => {
  const run = async (q) => { const { ctx, page } = await open('pc', { query: '?dev=1&fest=' + q }); await gateStart(page); await apply(page, 'kitaterao-window-3d-sunset', 9000); const r = await ev(page, () => window.__town3dLayout && window.__town3dLayout()); await ctx.close(); return r }
  const on = await run('1'), off = await run('0')
  return { pass: !!(on && off && on.fest > 0 && off.fest === 0 && on.rngEnd === off.rngEnd), festOn: on, festOff: off }
})
def('g1', 'L1', async () => {
  const s = fs.readFileSync('docs/qa/2026-07-31_残タスク台帳.md', 'utf8')
  const row = s.split('\n').find((l) => /^\| 1 \|/.test(l)) || ''
  return { pass: /再現せず（2026-10-12/.test(row), row }
})

// ── 画の測り（撮った PNG を別の空ページの canvas で読み、範囲の画素を数える）────────────────
// fn はページの中で (data: Uint8ClampedArray, w, h) を受け取って数を返す（文字列で渡す）
async function measurePng(buf, fnSrc, rect = null) {
  const b = await getBrowser()
  const ctx = await b.newContext()
  const p = await ctx.newPage()
  const r = await p.evaluate(async ({ b64, fnSrc, rect }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0)
    const R = rect || [0, 0, img.width, img.height]
    const d = x.getImageData(R[0], R[1], R[2], R[3])
    // eslint-disable-next-line no-new-func
    const fn = new Function('data', 'w', 'h', fnSrc)
    return fn(d.data, R[2], R[3])
  }, { b64: buf.toString('base64'), fnSrc, rect })
  await ctx.close()
  return r
}
// 明るさの分布（平均・散らばり・暗い側1%点・明るい側1%点・平均の色）
const LUMA_STATS = `
  const n = w * h; let s = 0, s2 = 0, r = 0, g = 0, b = 0; const hist = new Array(256).fill(0)
  for (let i = 0; i < data.length; i += 4) { const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; s += L; s2 += L * L; r += data[i]; g += data[i + 1]; b += data[i + 2]; hist[Math.min(255, Math.round(L))]++ }
  const pct = (q) => { let acc = 0; for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= q * n) return k } return 255 }
  const mean = s / n
  return { mean: +mean.toFixed(1), std: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(1), p1: pct(0.01), p99: pct(0.99), rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] }`
// 字と地のコントラスト比（範囲の中で明るい側5%を字、暗い側30%点を地とみなす。WCAG の相対輝度で比を出す）
const TEXT_CONTRAST = `
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const Ls = []
  for (let i = 0; i < data.length; i += 4) Ls.push(0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]))
  Ls.sort((a, b) => a - b)
  const hi = Ls.slice(Math.floor(Ls.length * 0.95)); const tL = hi.reduce((a, b) => a + b, 0) / hi.length
  const bg = Ls[Math.floor(Ls.length * 0.3)]
  return { text: +tL.toFixed(4), bg: +bg.toFixed(4), ratio: +((Math.max(tL, bg) + 0.05) / (Math.min(tL, bg) + 0.05)).toFixed(2) }`
const rectOf = (page, sel) => ev(page, (s) => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }, sel)
const inter = (a, b) => { if (!a || !b) return 0; const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return Math.round(x * y) }
async function poke(page) { await page.mouse.move(120, 300); await page.mouse.move(124, 304); await wait(500) }
async function openGallery(page) { await page.locator('.topbar .iconbtn', { hasText: '情景' }).click({ force: true }).catch(() => {}); await wait(1300) }
async function openSettings(page) { await page.locator('.topbar .iconbtn', { hasText: '設定' }).click({ force: true }).catch(() => {}); await wait(1100) }
// 窓辺 → 窓をあける → 空へ → 地上へ（歩く）。撮影の台本と同じ手順
async function goWalk(page) {
  await ev(page, () => window.__town3dWindow(true)); await wait(2200)
  await ev(page, () => window.__town3dFlyToggle(true)); await wait(3000)
  await ev(page, () => window.__town3dFlyPose(2, 6, -18, Math.PI, -0.05)); await wait(800)
  await ev(page, () => window.__town3dLandToggle(true)); await wait(1800)
}

// 群2 画面の部品 ──────────────────────────────────────────────────────
def('g2', 'D4', async () => {
  const out = {}
  for (const dev of ['iphone', 'ipadL']) {
    const { ctx, page, errs } = await open(dev)
    await gateStart(page); await apply(page, 'kitaterao-window-3d', 6500)
    const res = {}
    // 段の点は指を受けない（pointer-events: none）ので「いちばん上の要素」では測れない。3Dを止めた静止画で、
    // 点を消す前と後の画を撮り、点の場所の画素の差を数える（パネルが点を覆っていれば差は0）
    await ev(page, () => window.__town3dPaused && window.__town3dPaused(true)); await wait(400)
    for (const which of ['情景', '設定']) {
      if (which === '情景') await openGallery(page); else await openSettings(page)
      await wait(500)
      const dr = await ev(page, () => { const d = document.querySelector('.stagedots'); if (!d) return null; const r = d.getBoundingClientRect(); const p = document.querySelector('.panel--open'); const pr = p ? p.getBoundingClientRect() : null; return { x: r.left, y: r.top, w: r.width, h: r.height, op: +getComputedStyle(d).opacity, panelOver: !!(pr && pr.top < r.bottom && pr.bottom > r.top && pr.left < r.right && pr.right > r.left) } })
      if (!dr) { res[which] = { dots: false }; continue }
      const clip = { x: Math.max(0, dr.x - 8), y: Math.max(0, dr.y - 8), width: dr.w + 16, height: dr.h + 16 }
      const a = await page.screenshot({ clip })
      await ev(page, () => { document.querySelector('.stagedots').style.visibility = 'hidden' }); await wait(150)
      const b = await page.screenshot({ clip })
      await ev(page, () => { document.querySelector('.stagedots').style.visibility = '' })
      const pa = await measurePng(a, 'return Array.from(data)'), pb = await measurePng(b, 'return Array.from(data)')
      let diff = 0; for (let i = 0; i < pa.length; i += 4) if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 24) diff++
      res[which] = { dots: true, dotsOpacity: dr.op, panelOverDots: dr.panelOver, diffPx: diff }
      if (which === '情景') out[dev + '_shot'] = await shot(page, `D4_${dev}`, { clip: { x: 0, y: 0, width: DEVICES[dev].viewport.width, height: Math.round(DEVICES[dev].viewport.height * 0.45) } })
      await page.keyboard.press('Escape').catch(() => {}); await page.locator('.panel--open .iconbtn', { hasText: '×' }).first().click({ force: true }).catch(() => {}); await wait(700)
    }
    out[dev] = res; out[dev + '_errs'] = realErrs(errs)
    await ctx.close()
  }
  // 点がパネルの範囲にある時、点が見えていたら（画素の差が出たら）不合格
  const ok = (r) => r && r.dots && (!r.panelOverDots || r.diffPx <= 4)
  const covered = ['iphone', 'ipadL'].some((d) => out[d]['情景'] && out[d]['情景'].panelOverDots)
  return { pass: covered && ['iphone', 'ipadL'].every((d) => ok(out[d]['情景']) && ok(out[d]['設定'])), ...out }
})
def('g2', 'V46', async () => {
  const out = {}
  for (const dev of ['iphone', 'ipad']) {
    const { ctx, page } = await open(dev)
    await gateStart(page); await openSettings(page)
    out[dev] = await ev(page, () => { const l = [...document.querySelectorAll('.setrow__label')].find((e) => e.textContent === '描き込み'); if (!l) return null; const st = getComputedStyle(l); const lh = parseFloat(st.lineHeight) || parseFloat(st.fontSize) * 1.5; return { h: +l.getBoundingClientRect().height.toFixed(1), lineH: +lh.toFixed(1), fs: st.fontSize } })
    if (dev === 'iphone') out.shot = await shot(page, 'V46_iphone')
    await ctx.close()
  }
  return { pass: ['iphone', 'ipad'].every((d) => out[d] && out[d].h <= out[d].lineH * 1.3), ...out }
})
def('g2', 'V47', async () => {
  const { page, errs } = await open('iphone')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 6500)
  await goWalk(page); await wait(1500); await poke(page)
  const stick = await rectOf(page, '.town3d-stick__base')
  const btns = await ev(page, () => [...document.querySelectorAll('.town3d-pad button, .town3d-pad [class*="__btn"]')].filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); let o = 1; for (let p = e; p; p = p.parentElement) o *= +getComputedStyle(p).opacity; return r.width > 0 && s.visibility !== 'hidden' && s.display !== 'none' && o > 0.05 }).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: r.left, y: r.top, w: r.width, h: r.height } }))
  const restOn = await ev(page, () => { const w = document.querySelector('.town3d-stick'); return w ? w.className : null })
  const overlap = Array.isArray(btns) ? btns.reduce((s, b) => s + inter(stick, b), 0) : null
  const sh = await shot(page, 'V47_iphone')
  return { pass: !!(stick && /stick--rest/.test(restOn || '') && overlap === 0 && btns.length > 0), stick, buttons: btns, overlapPx2: overlap, stickClass: restOn, shot: sh, errs: realErrs(errs) }
})
def('g2', 'V48', async () => {
  const out = {}
  for (const dev of ['pc', 'ipadL']) {
    const { ctx, page } = await open(dev)
    await gateStart(page); await apply(page, 'kitaterao-window-3d', 6500)
    await goWalk(page); await wait(600)
    const stick = await rectOf(page, '.town3d-stick__base')
    const hint = await ev(page, () => { const el = [...document.querySelectorAll('.town3d-stage div')].find((e) => /左で歩く/.test(e.textContent) && e.children.length <= 3 && e.getBoundingClientRect().width < 400); if (!el) return null; const r = el.getBoundingClientRect(); let o = 1; for (let p = el; p; p = p.parentElement) o *= +getComputedStyle(p).opacity; return { x: r.left, y: r.top, w: r.width, h: r.height, op: +o.toFixed(2) } })
    const d = stick && hint ? Math.hypot((hint.x + hint.w / 2) - (stick.x + stick.w / 2), (hint.y + hint.h / 2) - (stick.y + stick.h / 2)) : null
    out[dev] = { stick, hint, dist: d === null ? null : Math.round(d) }
    await ctx.close()
  }
  return { pass: ['pc', 'ipadL'].every((k) => out[k].dist !== null && out[k].dist <= 124 && out[k].hint.op > 0.3), ...out }
})
def('g2', 'V54', async () => {
  const { page, errs } = await open('iphone', { init: pinStart('kitaterao-window-3d') })
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 7000)
  await ev(page, () => { const h = document.querySelector('.lookhint'); if (h) h.remove() })
  await page.mouse.move(200, 500); await wait(400)
  // 主ボタンは画面の側が町の3Dの情景を受け取ってから出る。読み込みが遅い時は7秒では出ていないので、見えるまで最大30秒待つ（便2 の全テストで、出る前に測って比 1.1 になった回があった）
  await page.waitForSelector('.iconbtn--stage', { state: 'visible', timeout: 30000 }).catch(() => {})
  const r = await rectOf(page, '.iconbtn--stage')
  if (!r || !r.w) return { pass: false, why: '主ボタンが見えない', rect: r }
  const dpr = DEVICES.iphone.deviceScaleFactor
  // ボタンの丸い端と上下の縁（後ろの天井が透ける所）を外し、字のある内側だけを測る
  const buf = await page.screenshot({ clip: { x: r.x + r.h / 2, y: r.y + 6, width: Math.max(4, r.w - r.h), height: Math.max(4, r.h - 12) } })
  const c = await measurePng(buf, TEXT_CONTRAST)
  const sh = await shot(page, 'V54_iphone', { clip: { x: 0, y: 0, width: 402, height: 140 } })
  const style = await ev(page, () => { const s = getComputedStyle(document.querySelector('.iconbtn--stage')); return { bg: s.backgroundColor, color: s.color, shadow: s.textShadow } })
  return { pass: !!(c && c.ratio >= 4.5), contrast: c, rect: r, dpr, style, shot: sh, errs: realErrs(errs) }
})
def('g2', 'V55', async () => {
  const { page } = await open('iphone')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 5000)
  await openGallery(page)
  const cards = await ev(page, () => [...document.querySelectorAll('.gallery .scene-card')].map((c) => { const n = c.querySelector('.scene-card__count'); if (!n) return { count: null, label: c.querySelector('.scene-card__label')?.textContent }; const r = n.getBoundingClientRect(); return { label: c.querySelector('.scene-card__label')?.textContent, count: n.textContent, cut: n.scrollWidth > n.clientWidth + 1 || r.height < 4, h: Math.round(r.height) } }))
  const sh = await shot(page, 'V55_iphone')
  return { pass: Array.isArray(cards) && cards.length >= 4 && cards.every((c) => c.count && /\d+つの眺め/.test(c.count) && !c.cut), cards, shot: sh }
})
def('g2', 'V61', async () => {
  const { page, errs } = await open('iphone')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 6500)
  await ev(page, () => window.__town3dWindow(true)); await wait(2200)
  await ev(page, () => window.__town3dFlyToggle(true)); await wait(1800); await poke(page)
  // 案内の文を持つ要素のうち、いちばん内側（面積の小さい物）を取る
  const hint = await ev(page, () => { const els = [...document.querySelectorAll('.town3d-stage div')].filter((e) => /空をすすむ/.test(e.textContent)).sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.width * ra.height - rb.width * rb.height }); const el = els[0]; if (!el) return null; const r = el.getBoundingClientRect(); const bg = getComputedStyle(el).backgroundColor; const m = bg.match(/rgba?\(([^)]+)\)/); const a = m ? (m[1].split(',')[3] !== undefined ? +m[1].split(',')[3] : 1) : 0; return { y: r.top, bottom: r.bottom, h: r.height, bgAlpha: bg === 'rgba(0, 0, 0, 0)' ? 0 : a } })
  const padTop = await ev(page, () => { const bs = [...document.querySelectorAll('.town3d-pad button')].filter((e) => { let o = 1; for (let p = e; p; p = p.parentElement) o *= +getComputedStyle(p).opacity; return o > 0.05 && e.getBoundingClientRect().width > 0 }); return bs.length ? Math.min(...bs.map((b) => b.getBoundingClientRect().top)) : null })
  const gap = hint && padTop !== null ? Math.round(padTop - hint.bottom) : null
  const sh = await shot(page, 'V61_iphone')
  return { pass: !!(hint && hint.bgAlpha > 0 && gap !== null && gap >= 12), hint, padTop, gap, shot: sh, errs: realErrs(errs) }
})
def('g2', 'V49', async () => {
  const out = {}
  for (const dev of ['pc', 'iphone']) {
    const { ctx, page } = await open(dev)
    await gateStart(page); await apply(page, 'kitaterao-window-3d', 5000)
    await openGallery(page)
    out[dev] = await ev(page, () => { const p = document.querySelector('.panel--open'); const d = document.querySelector('.gallery .scene-card__desc'); return { panelW: p ? Math.round(p.getBoundingClientRect().width) : null, descPx: d ? parseFloat(getComputedStyle(d).fontSize) : null, rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize) } })
    if (dev === 'pc') out.shot = await shot(page, 'V49_pc')
    await ctx.close()
  }
  // iPhone は前の値（パネル幅 370px・説明 10.88px・基準 16px）から変えない
  return { pass: !!(out.pc.panelW > 480 && out.pc.descPx >= 13 && out.iphone.panelW === 370 && Math.abs(out.iphone.descPx - 10.88) < 0.05 && out.iphone.rootPx === 16), ...out }
})
def('g2', 'V56', async () => {
  const pub = SCENES.filter((s) => s.status === 'ready' && s.public !== false).map((s) => s.id)
  const blobAt = (rev, p) => { try { return execSync(`git rev-parse ${rev}:${p}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }
  const rows = pub.map((id) => { const f = `public/thumbs/${id}.jpg`; if (!fs.existsSync(f)) return { id, exists: false }; const now = execSync(`git hash-object "${f}"`).toString().trim(); const old = blobAt('0676315', f); return { id, exists: true, kb: Math.round(fs.statSync(f).size / 1024), changed: now !== old } })
  const { page } = await open('iphone')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 5000)
  await openGallery(page)
  const sh = await shot(page, 'V56_iphone')
  return { pass: rows.every((r) => r.exists && r.changed), scenes: rows, shot: sh }
})

// 群3 絵の不具合 ──────────────────────────────────────────────────────
// 茶色の画素の割合（雲の陰が茶色い帯・下から見たベージュの塊。赤が青より18以上強い、陰の明るさ＝90以上200未満。太陽の光輪や明るい空は数えない）
const BROWN_FRAC = `
  let n = 0, br = 0
  for (let i = 0; i < data.length; i += 4) { const r = data[i], g = data[i + 1], b = data[i + 2]; const L = 0.2126 * r + 0.7152 * g + 0.0722 * b; if (L < 90) continue; n++; if (L < 200 && r - b > 18 && r > 110 && r - g > 4) br++ }
  return { frac: n ? +(br / n).toFixed(4) : 0, counted: n }`
def('g3', 'D5', async () => {
  const { page, errs } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 9000)
  const heads = await ev(page, () => window.__town3dResHeads && window.__town3dResHeads())
  return { pass: Array.isArray(heads) && heads.length > 3 && heads.every((y) => y > 1.08 && y < 1.14), heads, errs: realErrs(errs) }
})
// V28 太陽が2つ（便1 の歩く眺め）。真因を特定できず直していない＝合否を付けない「記録」。便1 で写った眺めに近い所（坂の街の窓辺から飛んで降りた所・南向き）で、
// 画面の上半分の白く光る円盤（明るさ245以上の画素がつながった塊・面積60画素以上）を数えて残す
const BRIGHT_BLOBS = `
  const seen = new Uint8Array(w * h); const sizes = []
  const lit = (i) => { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 245 }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (seen[i] || !lit(i)) continue
    let n = 0; const st = [i]; seen[i] = 1
    while (st.length) { const k = st.pop(); n++; const kx = k % w, ky = (k - kx) / w
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = kx + dx, ny = ky + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const j = ny * w + nx; if (!seen[j] && lit(j)) { seen[j] = 1; st.push(j) } } }
    if (n >= 60) sizes.push(n) }
  return { blobs: sizes.length, sizes: sizes.sort((a, b) => b - a).slice(0, 6) }`
def('g3', 'V28', async () => {
  const out = {}
  for (const id of ['kitaterao-window-3d', 'kitaterao-window-3d-sunset']) {
    const { page, errs } = await open('pc')
    await gateStart(page); await apply(page, id, 9000)
    await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' })
    await ev(page, () => window.__town3dWindow(true)); await wait(2200)
    await ev(page, () => window.__town3dFlyToggle(true)); await wait(3000)
    await ev(page, () => window.__town3dFlyPose(2, 6, -18, Math.PI, -0.05)); await wait(800)
    await ev(page, () => window.__town3dLandToggle && window.__town3dLandToggle(true)); await wait(3500)
    const m = await measurePng(await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 486 } }), BRIGHT_BLOBS)
    out[id] = { ...m, errs: realErrs(errs) }
    if (id === 'kitaterao-window-3d') out[id].shot = await shot(page, 'V28_pc')
    await page.context().close().catch(() => {})
  }
  // 便2 の調べ: この眺めは復元地点のコードで再現した（白い塊3つ・2つめの点は太陽の右下）。候補は「地平の光の帯の板」（世界の (0,16,-190) に固定した加算の板＝窓辺から見る用。
  // 歩くと太陽と別の所に写る）。隠すと点のそばの明るさが 253→241 に下がったが、着地の位置が毎回ずれて同じ眺めを3回取れず、確定できなかった
  return { pass: null, kiroku: '真因未特定（候補は地平の光の帯の板・直していない）', views: out }
})

async function stripePng() {
  const b = await getBrowser(); const ctx = await b.newContext(); const p = await ctx.newPage()
  const b64 = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 990; c.height = 594; const g = c.getContext('2d'); for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? 'rgb(40,40,230)' : 'rgb(230,40,40)'; g.fillRect(i * 49.5, 0, 49.5, 594) } return c.toDataURL('image/png').split(',')[1] })
  await ctx.close(); return Buffer.from(b64, 'base64')
}
def('g3', 'D6', async () => {
  // 縦じま20本の試験画像に差し替え、雨を弱めて、iPhone の幅（横の8〜92%）で見えるしまの境の数を数える（切り抜きなら5・縦横比を渡し忘れると7・引き伸ばしなら17）
  const png = await stripePng()
  const init = { fn: () => { try { const k = 'seasons.state.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.settings = { ...(s.settings || {}), rain: 0 }; localStorage.setItem(k, JSON.stringify(s)) } catch { /* 無視 */ } } }
  const b = await getBrowser()
  const ctx = await b.newContext(DEVICES.iphone); await ctx.addInitScript(init.fn)
  await ctx.route('**/bg/summer-rain-dusk-b.jpg', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }))
  const page = await ctx.newPage()
  await page.goto(BASE + '?dev=1', { waitUntil: 'domcontentloaded' }); await wait(2500)
  await gateStart(page); await apply(page, 'summer-rain-dusk', 5000)
  await ev(page, () => window.__renderer.pause('sleep')); await wait(400)
  const buf = await page.screenshot()
  const info = await ev(page, () => window.__renderer.bgInfo && window.__renderer.bgInfo())
  await ctx.close()
  const res = await measurePng(buf, `
    const rows = []; const out = []
    for (let k = 0; k < 9; k++) rows.push(Math.floor(h * (0.30 + k * 0.035)))
    for (const y of rows) { let last = null, run = 0, tr = 0
      for (let x = Math.floor(w * 0.08); x < Math.floor(w * 0.92); x++) { const i = (y * w + x) * 4; const r = data[i], b = data[i + 2]; const c = r > b + 30 ? 'R' : b > r + 30 ? 'B' : null; if (!c) continue
        if (c === last) run++; else { if (last && run >= 6) tr++; last = c; run = 1 } }
      out.push(tr) }
    out.sort((a, b) => a - b); return { perRow: out, median: out[Math.floor(out.length / 2)] }`)
  // 本物の画で前後の画を撮る（切り抜きの見え方）
  const o = await open('iphone'); await gateStart(o.page); await apply(o.page, 'summer-rain-dusk', 5000)
  await ev(o.page, () => window.__renderer.pause('sleep')); await wait(400)
  const sh = await shot(o.page, 'D6_iphone'); await o.ctx.close()
  return { pass: !!(res && res.median <= 5), stripeTransitions: res, bg: info, shot: sh }
})
def('g3', 'V10', async () => {
  const { page, errs } = await open('pc', { init: pinStart('kitaterao-window-3d-snow') })
  await gateStart(page); await apply(page, 'kitaterao-window-3d-snow', 9000); await poke(page)
  // 所見は「空と雪の街の境目が無くなる」。窓の中（x720〜1200・y140〜290）の列ごとに、上から下へ8画素あけた明るさの差の最大（空→雪の丘の段）を取り、
  // 段がはっきり見える列（差12以上）の割合を出す。地平に白い光の塊がかかると、空も丘も白く塗られて段が消える
  const buf = await page.screenshot({ clip: { x: 720, y: 140, width: 480, height: 150 } })
  const st = await measurePng(buf, LUMA_STATS)
  const edge = await measurePng(buf, `let vis = 0, cols = 0; const L = (x, y) => { const i = (y * w + x) * 4; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] }
    for (let x = 0; x < w; x += 2) { if (Math.abs(x - 240) < 14) continue; cols++; let m = 0; for (let y = 0; y + 8 < h; y++) { const d = L(x, y + 8) - L(x, y); if (d > m) m = d } if (m >= 12) vis++ }
    return +(vis / cols).toFixed(3)`)
  const sh = await shot(page, 'V10_pc', { clip: { x: 560, y: 60, width: 800, height: 500 } })
  return { pass: edge >= 0.9, boundaryVisibleCols: edge, stats: st, shot: sh, errs: realErrs(errs) }
})
def('g3', 'V14', async () => {
  const { page, errs } = await open('iphone')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 8000)
  await ev(page, () => window.__town3dWindow(true)); await wait(3000)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' }); await wait(300)
  // 窓の中央の柱（ベージュ・x 180〜218）を外し、左右の空だけを測る
  const bl = await measurePng(await page.screenshot({ clip: { x: 0, y: 0, width: 176, height: 140 } }), BROWN_FRAC)
  const brr = await measurePng(await page.screenshot({ clip: { x: 222, y: 0, width: 180, height: 140 } }), BROWN_FRAC)
  const br = { frac: +(((bl.frac * bl.counted) + (brr.frac * brr.counted)) / Math.max(1, bl.counted + brr.counted)).toFixed(4), counted: bl.counted + brr.counted }
  const sh = await shot(page, 'V14_iphone', { clip: { x: 0, y: 0, width: 402, height: 300 } })
  return { pass: br.frac < 0.01, brown: br, shot: sh, errs: realErrs(errs) }
})
def('g3', 'V27', async () => {
  // 低く飛んで空を見上げ、雲の下面がベージュの塊に見えないか（茶色の画素の割合）
  const { page, errs } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 8000)
  await ev(page, () => window.__town3dWindow(true)); await wait(2200)
  await ev(page, () => window.__town3dFlyToggle(true)); await wait(3000)
  await ev(page, () => window.__town3dCruise && window.__town3dCruise(false))
  await ev(page, () => window.__town3dFlyPose(0, 40, 40, Math.PI, 0.55)); await wait(3500)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' }); await wait(300)
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 180 } }) // 空の上の方（町と気球が入らない）
  const br = await measurePng(buf, BROWN_FRAC)
  const sh = await shot(page, 'V27_pc', { clip: { x: 0, y: 0, width: 1920, height: 540 } })
  return { pass: br.frac < 0.01 && br.counted > 100000, brown: br, shot: sh, errs: realErrs(errs) }
})
def('g3', 'V33', async () => {
  const out = {}
  for (const dev of ['pc', 'iphone']) {
    const { ctx, page } = await open(dev, { init: pinStart('summer-dusk-seaside') })
    await gateStart(page)
    await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' })
    await apply(page, 'summer-dusk-seaside', 5000)
    await ev(page, () => window.__renderer.pause('sleep')); await wait(400)
    const buf = await page.screenshot()
    const W = DEVICES[dev].viewport.width * (DEVICES[dev].deviceScaleFactor || 1), H = DEVICES[dev].viewport.height * (DEVICES[dev].deviceScaleFactor || 1)
    // 夕日の円盤＝明るさ 240 以上の画素（夕日の方角 sunScreenX=-0.05 のまわり、横 ±15% だけを見る）。高さは上側20%点（top）で見る。
    // 重心（cy）は止めた瞬間の海のきらめきで下へ引っぱられ、同じコードで 453〜494 とぶれた（便2 の全テスト）
    const asp = W / H, sx = Math.round((0.5 - 0.05 / asp) * W)
    const sun = await measurePng(buf, `let n = 0, sy = 0; const ys = []; const x0 = Math.max(0, ${sx} - Math.round(w * 0.15)), x1 = Math.min(w, ${sx} + Math.round(w * 0.15))
      for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] >= 240) { n++; sy += y; ys.push(y) } }
      return { n, cy: n ? Math.round(sy / n) : null, top: n ? ys[Math.floor(n * 0.2)] : null }`)
    const barY = Math.round((1 - 0.52) * H), need = Math.round((0.046 + 0.011) * H)
    out[dev] = { sun, barY, need, gap: sun.top === null || sun.top === undefined ? null : Math.abs(sun.top - barY) }
    out[dev + '_shot'] = await shot(page, `V33_${dev}`)
    await ctx.close()
  }
  return { pass: ['pc', 'iphone'].every((d) => out[d].sun.n > 30 && out[d].gap !== null && out[d].gap >= out[d].need), ...out }
})
def('g3', 'V36', async () => {
  const { page } = await open('pc')
  await gateStart(page)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' })
  await apply(page, 'summer-morning-mountains', 5000)
  await ev(page, () => window.__renderer.pause('sleep')); await wait(400)
  const buf = await page.screenshot({ clip: { x: 150, y: 250, width: 760, height: 600 } })
  // 列ごとに、上から見て空（青みが緑より強い明るい灰）から山（緑が青より強い）へ変わる高さ＝いちばん奥の稜線
  const r = await measurePng(buf, `const ys = []
    for (let x = 0; x < w; x++) { let found = null; for (let y = 290; y < h; y++) { const i = (y * w + x) * 4; const r = data[i], g = data[i + 1], b = data[i + 2]; const L = 0.2126 * r + 0.7152 * g + 0.0722 * b; if (g - b > 6 && L < 200) { found = y; break } } ys.push(found) } // 窓の横桟（y 255〜275）より下から探す
    let maxJump = 0, cnt = 0; for (let x = 1; x < ys.length; x++) { if (ys[x] === null || ys[x - 1] === null) continue; const j = Math.abs(ys[x] - ys[x - 1]); if (j > maxJump) maxJump = j; if (j >= 6) cnt++ }
    return { maxJump, steps6: cnt, missing: ys.filter((y) => y === null).length }`)
  const sh = await shot(page, 'V36_pc', { clip: { x: 150, y: 250, width: 760, height: 600 } })
  return { pass: r.missing < 40 && r.steps6 <= 1, ridge: r, shot: sh }
})
def('g3', 'V38', async () => {
  const out = {}
  // 便1 の所見の座標（海辺 x1380〜1500・y60〜130／山あい x1550〜1700・y400〜500）を含む範囲を測る
  const CLIP = { 'summer-dusk-seaside': { x: 1100, y: 58, width: 700, height: 160 }, 'summer-morning-mountains': { x: 1300, y: 340, width: 500, height: 150 } }
  for (const id of ['summer-dusk-seaside', 'summer-morning-mountains']) {
    const { ctx, page } = await open('pc')
    await gateStart(page)
    await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' })
    await apply(page, id, 5000)
    await ev(page, () => window.__renderer.pause('sleep')); await wait(400)
    const buf = await page.screenshot({ clip: CLIP[id] })
    // 列ごとに、横の隣との差（行をまたいで平均）。区画の継ぎ目は同じ向きの段が縦にそろう
    // 20行ずつの帯ごとに、列の横の差を平均する（継ぎ目は帯の中で同じ向きの段が縦にそろう。画素ごとの粒は平均で消える）
    out[id] = await measurePng(buf, `const B = 20; const seamCols = new Set(); let maxAbs = 0
      for (let y0 = 0; y0 + B <= h; y0 += B) { for (let x = 0; x < w - 1; x++) { let m = 0; for (let y = y0; y < y0 + B; y++) { const i = (y * w + x) * 4, j = i + 4; m += ((data[j] + data[j + 1] + data[j + 2]) - (data[i] + data[i + 1] + data[i + 2])) / 3 } const v = Math.abs(m / B); if (v > maxAbs) maxAbs = v; if (v >= 1.5) seamCols.add(x) } }
      return { seams: seamCols.size, maxAbs: +maxAbs.toFixed(2) }`)
    await ctx.close()
  }
  return { pass: Object.values(out).every((r) => r.maxAbs < 2.0), ...out } // 合否は空の帯の段差の最大（継ぎ目の列の数は参考。斜めの稜線の縁も数に入るため）
})

// 群4 端末ごとの画質の段（T2）──────────────────────────────────────────
const setQualityLS = (q) => ({ fn: (qq) => { try { const k = 'seasons.state.v1'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.settings = { ...(s.settings || {}), quality: qq }; localStorage.setItem(k, JSON.stringify(s)) } catch { /* 無視 */ } }, arg: q })
def('g4', 'S24', async () => {
  const has = fs.existsSync('src/data/quality.js')
  const t3 = fs.readFileSync('src/engine/town3dViewer.js', 'utf8'), r2 = fs.readFileSync('src/engine/renderer.js', 'utf8')
  const reads = /from '\.\.\/data\/quality\.js'/.test(t3) && /from '\.\.\/data\/quality\.js'/.test(r2)
  const strays = { t3: (t3.match(/q === 'soft' \? 2 : 1\.6|LIGHT \? 1\.2 : QUAL/g) || []).length, r2: (r2.match(/DPR_BY_QUALITY\s*=/g) || []).length }
  // 知らない段の名前を渡しても、表の「ふつう」へそろう
  const m = has ? await import(path.resolve('src/data/quality.js').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:')) : null
  const odd = m ? m.qualityPlan('3d', 'ultra', { dpr: 3, cssW: 402, cssH: 874 }).q : null
  return { pass: has && reads && strays.t3 === 0 && strays.r2 === 0 && odd === 'standard', has, reads, strays, unknownTier: odd }
})
async function tierRun(dev, q, scene = 'kitaterao-window-3d') {
  const { ctx, page } = await open(dev, { init: setQualityLS(q) })
  await gateStart(page); await apply(page, scene, 3500)
  const r = await ev(page, () => ({ quality: window.__town3dQuality && window.__town3dQuality(), canvas: (() => { const c = document.querySelector('.town3d-stage canvas'); return c ? [c.width, c.height] : null })() }))
  await ctx.close(); return r
}
def('g4', 'D1', async () => {
  const out = {}
  for (const dev of ['pc', 'laptop']) { out[dev] = {}; for (const q of ['soft', 'standard', 'light']) out[dev][q] = await tierRun(dev, q) }
  const cap = (d, q) => out[d][q] && out[d][q].quality ? out[d][q].quality.cap : null
  const pcOk = cap('pc', 'soft') > cap('pc', 'standard') && cap('pc', 'standard') >= 1 && cap('pc', 'standard') > cap('pc', 'light')
  const lapOk = cap('laptop', 'soft') > cap('laptop', 'standard') && cap('laptop', 'standard') > cap('laptop', 'light')
  const shadow = out.pc.soft && out.pc.soft.quality ? out.pc.soft.quality.shadow : null
  const pxOk = out.pc.soft.canvas && out.pc.standard.canvas && out.pc.soft.canvas[0] > out.pc.standard.canvas[0] && out.pc.standard.canvas[0] > out.pc.light.canvas[0]
  return { pass: !!(pcOk && lapOk && shadow === 4096 && pxOk), ...out }
})
async function loadRun(dev, fn, ms) {
  const { ctx, page } = await open(dev)
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 6000)
  const before = await ev(page, () => window.__town3dQuality())
  await page.evaluate((src) => { window.__town3dSimLoad(new Function('pr', src)) }, fn)
  const t0 = Date.now(); let minPr = 9, maxPr = 0
  while (Date.now() - t0 < ms) { await wait(1000); const q = await ev(page, () => window.__town3dQuality()); if (q && typeof q.pr === 'number') { minPr = Math.min(minPr, q.pr); maxPr = Math.max(maxPr, q.pr) } }
  const after = await ev(page, () => window.__town3dQuality())
  await ev(page, () => window.__town3dSimLoad(null))
  await ctx.close(); return { before, after, minPr, maxPr }
}
def('g4', 'D2', async () => {
  // 重い状態（毎フレーム60ミリ秒足す）と軽い状態で、倍率が段の上限と画面の素の細かさの間に留まるか
  const pcHeavy = await loadRun('pc', 'return 60', 12000)
  const pcLight = await loadRun('pc', 'return 0', 12000)
  const lapLight = await loadRun('laptop', 'return 0', 12000)
  const lapHeavy = await loadRun('laptop', 'return 60', 12000)
  return { pass: pcHeavy.minPr >= 1 && pcLight.maxPr <= 1 && lapLight.maxPr <= 1.25 && lapHeavy.minPr >= 1.25, pcHeavy, pcLight, lapLight, lapHeavy }
})
def('g4', 'U1', async () => {
  // (a) 1回だけ 300ミリ秒の詰まり → 下げない／(b) 重さが続く → 下げる／(c) 上げると重く・下げると軽い重さを60秒 → 上げ下げ ≤ 2回
  const once = await loadRun('iphone', 'if (!window.__stalled) { window.__stalled = 1; return 300 } return 0', 8000)
  const heavy = await loadRun('iphone', 'return 45', 10000)
  const osc = await loadRun('iphone', 'return pr > 1.5 ? 40 : 0', 60000)
  return { pass: once.minPr >= 1.6 && heavy.minPr < 1.6 && osc.after && osc.after.changes <= 2, once: { minPr: once.minPr, after: once.after }, heavy: { minPr: heavy.minPr, after: heavy.after }, oscillation: { changes: osc.after && osc.after.changes, minPr: osc.minPr, maxPr: osc.maxPr, after: osc.after } }
})
def('g4', 'D3', async () => {
  const out = {}
  for (const dev of ['pc', 'iphone']) {
    const { ctx, page } = await open(dev)
    await gateStart(page); await apply(page, 'kitaterao-window-3d', 6000)
    const win = await ev(page, () => window.__town3dQuality())
    await ev(page, () => window.__town3dWindow(true)); await wait(2200)
    await ev(page, () => window.__town3dFlyToggle(true)); await wait(3500)
    const fly = await ev(page, () => window.__town3dQuality())
    await ev(page, () => window.__town3dFlyPose(2, 6, -18, Math.PI, -0.05)); await wait(800)
    await ev(page, () => window.__town3dLandToggle(true)); await wait(3500)
    const walk = await ev(page, () => window.__town3dQuality())
    const walkDraw = await ev(page, () => window.__town3dDraw && window.__town3dDraw())
    out[dev] = { window: win && win.pr, fly: fly && fly.pr, walk: walk && walk.pr, flyCap: fly && fly.fly, walkCalls: walkDraw && walkDraw.calls }
    await ctx.close()
  }
  return { pass: out.pc.walk === out.pc.window && out.iphone.walk === 1.6 && out.iphone.fly <= out.iphone.flyCap + 0.001, ...out }
})
def('g4', 'S23', async () => {
  const out = {}
  for (const dev of ['iphone', 'ipad', 'ipad13']) {
    const { ctx, page } = await open(dev)
    await gateStart(page); await apply(page, 'kitaterao-window-3d', 6000)
    const d = await ev(page, () => window.__town3dDraw && window.__town3dDraw())
    out[dev] = { px: d && d.px, calls: d && d.calls }
    await ctx.close()
  }
  return { pass: Object.values(out).every((r) => r.px && r.px <= 2.4e6 * 1.05) && out.ipad13.px <= out.iphone.px * 3, ...out }
})
def('g4', 'S25', async () => {
  const out = {}
  for (const scene of ['kitaterao-window-3d', 'shishigaya-window-3d', 'kitaterao-window-3d-sunset']) {
    out[scene] = {}
    for (const q of ['standard', 'light']) {
      const { ctx, page } = await open('pc', { init: setQualityLS(q) }); await gateStart(page); await apply(page, scene, 8000)
      out[scene][q] = await ev(page, () => window.__town3dLayout && window.__town3dLayout())
      if (scene === 'kitaterao-window-3d') { // 軽やかの重さ: 窓辺の描画の呼び出し（組み上がりを待ってから）
        for (let k = 0; k < 60; k++) { if (await ev(page, () => !!(window.__town3dDraw && window.__town3dDraw()))) break; await wait(500) }
        await wait(2500)
        const d = await ev(page, () => window.__town3dDraw && window.__town3dDraw())
        const at = await ev(page, () => { const a = window.__town3dAttribute && window.__town3dAttribute(); return a && { trees: a.trees, clouds: a.clouds, ferris: a.ferris, residents: a.residents } })
        out[scene][q] = { ...(out[scene][q] || {}), calls: d && d.calls, tris: d && d.tris, attr: at }
      }
      await ctx.close()
    }
  }
  // 合否: 軽やかとふつうで町の乱数の回る数が同じ（配置が同じ）＋軽やかは作ってから隠す（窓辺で木の描画の寄与がふつうの0.85倍以下・雲がふつうより少ない）。
  // 窓辺の描画の呼び出しの総数（calls）は記録だけ（霞を遠くへ〈V1〉した分、霧より遠い建物も描くようになり、ふつうも軽やかも増えたため）
  const kn = out['kitaterao-window-3d']; const al = kn.light && kn.light.attr, as = kn.standard && kn.standard.attr
  const hideOk = !!(al && as && al.trees <= as.trees * 0.85 && al.clouds < as.clouds)
  return { pass: Object.values(out).every((r) => r.standard && r.light && r.standard.rngEnd === r.light.rngEnd) && hideOk, ...out }
})
def('g4', 'S27', async () => {
  // 段を変えると同じ情景を組み直す。町の3Dは組み直しにシェーダーの組み立て込みで数秒〜十数秒かかるので、新しい段の値が読めるまで最大30秒待つ
  const { page } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 6000)
  const q0 = await ev(page, () => window.__town3dQuality())
  const visits = () => ev(page, () => { try { const st = JSON.parse(localStorage.getItem('seasons.state.v1') || '{}'); return (st.journal && st.journal.visits && st.journal.visits['kitaterao-window-3d']) || 0 } catch { return null } })
  const v0 = await visits()
  await openSettings(page)
  const pick = async (label, id) => {
    const t0 = Date.now()
    await page.locator('.chip', { hasText: label }).first().click({ force: true }).catch(() => {})
    for (let k = 0; k < 60; k++) { await wait(500); const q = await ev(page, () => window.__town3dQuality && window.__town3dQuality()); if (q && q.q === id) return { ...q, rebuildMs: Date.now() - t0 } }
    return null
  }
  const q1 = await pick('こまやか', 'soft'), q2 = await pick('軽やか', 'light'), q3 = await pick('ふつう', 'standard')
  const v1 = await visits() // 段を3回変えても通い帳の訪問数は増えない（組み直しは座り直しではない）
  return { pass: !!(q0 && q1 && q2 && q3 && q1.shadow === 4096 && q2.shadow === 1024 && q3.shadow === 2048) && typeof v0 === 'number' && v0 >= 1 && v1 === v0, standard0: q0, soft: q1, light: q2, standard: q3, visitsBefore: v0, visitsAfter: v1 }
})
def('g4', 'S20', async () => {
  const { page } = await open('pc')
  await gateStart(page); await apply(page, 'summer-morning-mountains', 4000)
  // 眺めているだけ（4秒操作なし）の間は自動調整を止める作り（鮮明さ優先）なので、操作が続いている状態で測る
  const keep = setInterval(() => { page.evaluate(() => window.__renderer.poke && window.__renderer.poke()).catch(() => {}) }, 700)
  const s0 = await ev(page, () => window.__renderer.scale && window.__renderer.scale())
  // 組み直した直後の待ち（adaptCooldown）が終わってから詰まりを入れる（待ちの間は判定しない作りのため）
  for (let k = 0; k < 40; k++) { const a = await ev(page, () => window.__renderer.adapt && window.__renderer.adapt()); if (a && a.cooldown === 0 && a.ema > 25) break; await wait(500) }
  const a0 = await ev(page, () => window.__renderer.adapt && window.__renderer.adapt())
  await ev(page, () => window.__renderer.simStall && window.__renderer.simStall(250)); await wait(1500)
  const s1 = await ev(page, () => window.__renderer.scale && window.__renderer.scale())
  await ev(page, () => window.__renderer.simLoad && window.__renderer.simLoad(60)); await wait(5000)
  const s2 = await ev(page, () => window.__renderer.scale && window.__renderer.scale())
  await ev(page, () => window.__renderer.simLoad && window.__renderer.simLoad(0)); await wait(25000)
  const s3 = await ev(page, () => window.__renderer.scale && window.__renderer.scale())
  // 毎回160ミリ秒かかるほど重い端末（120ミリ秒以上が続く）でも下げる（1回だけの詰まりと見分ける）
  await ev(page, () => window.__renderer.simLoad && window.__renderer.simLoad(160)); await wait(10000)
  const s4 = await ev(page, () => window.__renderer.scale && window.__renderer.scale())
  await ev(page, () => window.__renderer.simLoad && window.__renderer.simLoad(0))
  clearInterval(keep)
  return { pass: s0 === 1 && s1 === 1 && typeof s2 === 'number' && s2 < 1 && s3 === 1 && typeof s4 === 'number' && s4 < 1 && !!(a0 && a0.cooldown === 0), start: s0, adaptBeforeStall: a0, afterOneStall: s1, underLoad: s2, after25s: s3, veryHeavy: s4 }
})
def('g4', 'S43', async () => {
  const { page } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d-sunset', 7000)
  const d = await ev(page, () => window.__town3dDraw && window.__town3dDraw())
  return { pass: !!(d && typeof d.passes === 'number' && d.passes >= 2 && typeof d.px === 'number' && d.px > 1e5), draw: d }
})
def('g4', 'U13', async () => {
  const { page } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 6000)
  const q = await ev(page, () => window.__town3dQuality && window.__town3dQuality())
  return { pass: !!(q && q.compiled === 'async'), compiled: q && q.compiled }
})

// 群5 色と空気（T3）────────────────────────────────────────────────────
// 「前」の記録の置き場は台本の場所から決める（以前は出力先の隣を見ていたので、外し回しの出力先では前が読めず、外さなくても落ちる形になっていた）
const BEFORE_DIR = process.env.QA_BEFORE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'qa', '2026-10-12_便2', 'gate-before')
const beforeOf = (id) => { try { return JSON.parse(fs.readFileSync(path.join(BEFORE_DIR, id + '.json'), 'utf8')) } catch { return null } }
const look = (page) => ev(page, () => window.__town3dLook && window.__town3dLook())
def('g5', 'U9', async () => {
  // 雨の夜の窓辺（PC）の窓の中の暗い側1%点の明るさ＝黒の締まり。前の値（gate-before）より下がり、色の圧縮が Neutral（7）であること
  const { page, errs } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d-rain-night', 9000); await poke(page)
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 } })
  const st = await measurePng(buf, LUMA_STATS)
  const lk = await look(page)
  const sh = await shot(page, 'U9_pc')
  const b = beforeOf('U9')
  const p1Before = b && b.stats ? b.stats.p1 : null
  return { pass: !!(lk && lk.toneMapping === 7 && p1Before !== null && st.p1 <= p1Before - 3), stats: st, p1Before, look: lk, shot: sh, errs: realErrs(errs) }
})
def('g5', 'V1', async () => {
  const { page, errs } = await open('iphone')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 9000)
  const lk = await look(page)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' }); await wait(300)
  const st = await measurePng(await page.screenshot({ clip: { x: 0, y: 110, width: 402, height: 290 } }), LUMA_STATS) // 窓の中（閉めたまま）
  const sh = await shot(page, 'V1_iphone')
  const b = beforeOf('V1'); const stdBefore = b && b.stats ? b.stats.std : null
  return { pass: !!(lk && Math.abs(lk.fogNear - 48) < 0.01 && Math.abs(lk.fogFar - 250.8) < 0.01 && stdBefore !== null && st.std > stdBefore), look: lk, stats: st, stdBefore, shot: sh, errs: realErrs(errs) }
})
// 細かいざらつき（紙の粒）: 明るさから 5×5 の平均を引いた残りの散らばり。平らな所（空・壁）で測る
const GRAIN = `
  const L = (i) => 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]
  let s = 0, s2 = 0, n = 0
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) { let m = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m += L((y + dy) * w + x + dx); m /= 25; const v = L(y * w + x) - m; s += v; s2 += v * v; n++ }
  return +Math.sqrt(s2 / n - (s / n) ** 2).toFixed(2)`
def('g5', 'U2', async () => {
  const { page, errs } = await open('iphone')
  await gateStart(page); await apply(page, 'kitaterao-window-3d-sunset', 9000)
  const layers = await ev(page, () => [...document.querySelectorAll('.town3d-stage *')].filter((e) => { const s = getComputedStyle(e); return s.mixBlendMode !== 'normal' && s.display !== 'none' && s.visibility !== 'hidden' }).map((e) => (e.className || e.tagName) + ':' + getComputedStyle(e).mixBlendMode))
  const filt = await ev(page, () => getComputedStyle(document.querySelector('.town3d-stage')).filter)
  const l0 = await look(page)
  await openSettings(page)
  await ev(page, () => { const r = [...document.querySelectorAll('.setrow')].find((x) => /明るさ/.test(x.textContent)); const i = r && r.querySelector('input'); if (i) { i.value = '1.2'; i.dispatchEvent(new Event('input', { bubbles: true })) } }); await wait(800)
  const l1 = await look(page)
  await ev(page, () => { const r = [...document.querySelectorAll('.setrow')].find((x) => /明るさ/.test(x.textContent)); const i = r && r.querySelector('input'); if (i) { i.value = '1'; i.dispatchEvent(new Event('input', { bubbles: true })) } })
  await page.keyboard.press('Escape').catch(() => {}); await page.mouse.click(5, 860); await wait(800)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' }); await wait(300)
  const sh = await shot(page, 'U2_iphone')
  // 水彩を「薄く」: 窓の中の空（夕焼け）と上の壁の細かいざらつきが、前（CSS の紙目）以下か（便2 で描画の中の粒が前の約2.5倍に出ていたのを見つけた）
  const png = await page.screenshot()
  const grain = { sky: await measurePng(png, GRAIN, [150, 350, 300, 150]), wall: await measurePng(png, GRAIN, [100, 60, 400, 150]) }
  const gb = beforeOf('U2'); const gBefore = gb && gb.grain
  const thin = !!(gBefore && grain.sky <= gBefore.sky && grain.wall <= gBefore.wall)
  return { pass: Array.isArray(layers) && layers.length === 0 && filt === 'none' && !!(l0 && l0.grade && l1 && l1.gBright > l0.gBright) && thin, blendLayers: layers, stageFilter: filt, brightBefore: l0 && l0.gBright, brightAfter: l1 && l1.gBright, grain, grainBefore: gBefore || null, shot: sh, errs: realErrs(errs) }
})
def('g5', 'S31', async () => {
  const { page } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d-sunset', 7000)
  const lk = await look(page)
  const ps = (lk && lk.passes) || []
  const iOut = ps.findIndex((p) => /^OutputPass/.test(p)), iFx = ps.lastIndexOf('ShaderPass')
  return { pass: iOut >= 0 && iFx > iOut, passes: ps }
})
def('g5', 'S32', async () => {
  const { page } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 7000)
  const r = await ev(page, () => ['.town3d-flash', '.town3d-open'].map((s) => { const e = document.querySelector(s); return e ? { s, display: getComputedStyle(e).display, op: getComputedStyle(e).opacity } : { s, missing: true } }))
  return { pass: Array.isArray(r) && r.every((x) => x.display === 'none'), layers: r }
})
def('g5', 'V15', async () => {
  const run = async (scene, shotName) => { const { ctx, page } = await open('pc'); await gateStart(page); await apply(page, scene, 8000); const lk = await look(page)
    let sh = null
    if (shotName) { await ev(page, () => window.__town3dWindow(true)); await wait(2200); await ev(page, () => window.__town3dFlyToggle(true)); await wait(3000); await ev(page, () => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.2)); await wait(3000); await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' }); await wait(300); sh = await shot(page, shotName) }
    await ctx.close(); return { look: lk, shot: sh } }
  const noon = await run('kitaterao-window-3d', 'V15_pc'), dusk = await run('kitaterao-window-3d-sunset')
  return { pass: !!(noon.look && dusk.look && noon.look.litWinMats === 0 && dusk.look.litWinMats > 0), noonLit: noon.look && noon.look.litWinMats, duskLit: dusk.look && dusk.look.litWinMats, duskMax: dusk.look && dusk.look.maxEmissive, shot: noon.shot }
})
def('g5', 'V22', async () => {
  // 所見は「飛んでいる時の昼の空が黄土色で、窓辺から見た淡い青空と色が揃わない」。窓をあけた窓辺の空（上の帯）と、低く飛んだ時の空（上の帯）の色の向き（青−赤）を比べる
  const { page, errs } = await open('pc')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 8000)
  await ev(page, () => window.__town3dWindow(true)); await wait(2500)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' }); await wait(300)
  const win = await measurePng(await page.screenshot({ clip: { x: 760, y: 150, width: 400, height: 60 } }), LUMA_STATS) // 窓の中の空（上の帯・桟を避ける）
  await ev(page, () => window.__town3dFlyToggle(true)); await wait(3000)
  await ev(page, () => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.05)); await wait(4000)
  const fly = await measurePng(await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 110 } }), LUMA_STATS)
  const sh = await shot(page, 'V22_pc')
  const tint = (st) => st.rgb[2] - st.rgb[0] // 青−赤（正なら青寄り・負なら黄土寄り）
  // 飛行の帯は水平に近い高さの空を写すので、地平の暖色（情景の色の地平）が窓辺より少し入る。合否は「前の飛行の空（gate-before）より青へ8以上戻る」
  const b = beforeOf('V22'); const flyBefore = b && typeof b.flyTint === 'number' ? b.flyTint : null
  return { pass: flyBefore !== null && tint(fly) >= flyBefore + 8, windowSkyRgb: win.rgb, flySkyRgb: fly.rgb, windowTint: tint(win), flyTint: tint(fly), flyTintBefore: flyBefore, shot: sh, errs: realErrs(errs) }
})
def('g5', 'V3', async () => {
  const run = async (scene, shotName) => { const { ctx, page } = await open('pc'); await gateStart(page); await apply(page, scene, 8000); const lk = await look(page); let sh = null; if (shotName) { await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' }); await wait(300); sh = await shot(page, shotName, { clip: { x: 560, y: 60, width: 800, height: 520 } }) } await ctx.close(); return { look: lk, shot: sh } }
  const night = await run('kitaterao-window-3d-rain-night', 'V3_pc'), noon = await run('kitaterao-window-3d')
  const on = night.look && night.look.glassOpacity, od = noon.look && noon.look.glassOpacity
  return { pass: typeof on === 'number' && typeof od === 'number' && on <= od * 0.5, rainNightGlass: on, noonGlass: od, shot: night.shot }
})
def('g5', 'K5', async () => {
  // iPhone の重さ: 窓辺・夕・飛行・歩行の描画の呼び出しと描く画素数を、便1 の撮影の値（capture-iphone.json）と比べる。
  // 歩く時の画素数は、決めたこと（D3: 歩行は窓辺より軽いので天井を下げない）に合わせ、窓辺の画素数を上限にする
  const cap = JSON.parse(fs.readFileSync('docs/qa/2026-10-12_seasons/capture-iphone.json', 'utf8')).iphone
  const pxOf = (c) => c ? c.w * c.h : null
  const before = { window: { calls: cap.window.draw.calls, px: pxOf(cap.window.canvas) }, sunset: { calls: cap.scenes['kitaterao-window-3d-sunset'].draw.calls, px: pxOf(cap.window.canvas) }, fly: { calls: cap.flyLow.draw.calls, px: Math.round(402 * cap.flyLow.stats.pr) * Math.round(874 * cap.flyLow.stats.pr) }, walk: { calls: cap.walk.draw.calls, px: pxOf(cap.window.canvas) } }
  const { page, errs } = await open('iphone')
  await gateStart(page)
  const draw = () => ev(page, () => window.__town3dDraw && window.__town3dDraw())
  await apply(page, 'kitaterao-window-3d', 8000); const win = await draw()
  const layers = await ev(page, () => [...document.querySelectorAll('.town3d-stage *')].filter((e) => { const s = getComputedStyle(e); return s.mixBlendMode !== 'normal' && s.display !== 'none' }).length)
  await apply(page, 'kitaterao-window-3d-sunset', 8000); const sun = await draw()
  await apply(page, 'kitaterao-window-3d', 8000)
  await ev(page, () => window.__town3dWindow(true)); await wait(2200)
  await ev(page, () => window.__town3dFlyToggle(true)); await wait(3000)
  await ev(page, () => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.2)); await wait(3000); const fly = await draw()
  await ev(page, () => window.__town3dFlyPose(2, 6, -18, Math.PI, -0.05)); await wait(800)
  await ev(page, () => window.__town3dLandToggle(true)); await wait(3500); const walk = await draw()
  const after = { window: win, sunset: sun, fly, walk }
  const ok = (k) => after[k] && after[k].calls <= before[k].calls * 1.05 && after[k].px <= before[k].px * 1.05
  return { pass: ['window', 'sunset', 'fly', 'walk'].every(ok) && layers === 0, before, after: Object.fromEntries(Object.entries(after).map(([k, v]) => [k, v && { calls: v.calls, px: v.px, passes: v.passes }])), blendLayers: layers, errs: realErrs(errs) }
})

// ── 実行 ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
let ids = []
for (const a of argv) { if (a === 'all') ids.push(...Object.keys(CHECKS)); else if (G[a]) ids.push(...G[a]); else ids.push(a) }
ids = [...new Set(ids)]
if (!ids.length) { console.log('使い方: node scripts/qa-bin2.mjs <ID…|g1…|all>  検査:', Object.keys(CHECKS).join(' ')); process.exit(2) }
let fail = 0
const summary = {}
for (const id of ids) {
  const fn = CHECKS[id]
  if (!fn) { console.log(`${id} 検査なし`); fail++; continue }
  const t0 = Date.now()
  let r
  try { r = await fn() } catch (e) { r = { pass: false, threw: String(e && e.stack || e).slice(0, 400) } }
  r.id = id; r.ms = Date.now() - t0; r.at = new Date().toISOString(); r.base = BASE
  try { r.commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* 無視 */ }
  fs.writeFileSync(path.join(OUT, `${id}.json`), JSON.stringify(r, null, 1))
  summary[id] = r.pass
  if (r.kiroku) { console.log(`${id} 記録（合否なし: ${r.kiroku}） (${(r.ms / 1000).toFixed(1)}秒)`) } else { // 記録だけの行は合否に数えない（V28）
    if (!r.pass) fail++
    console.log(`${id} ${r.pass ? '合格' : '不合格'} (${(r.ms / 1000).toFixed(1)}秒)`)
  }
  // ページを開いたまま残さない（検査ごとに新しい文脈）
  if (browser) { for (const c of browser.contexts()) await c.close().catch(() => {}) }
}
if (browser) await browser.close()
const passN = Object.values(summary).filter(Boolean).length
const recN = ids.filter((i) => summary[i] === null).length
console.log(`検査の終わり: ${passN}/${ids.length - recN} 合格${recN ? `（ほかに記録 ${recN}）` : ''}`)
fs.writeFileSync(path.join(OUT, `_last-run.json`), JSON.stringify({ at: new Date().toISOString(), ids, summary, pass: passN, total: ids.length - recN, kiroku: recN }, null, 1))
process.exit(fail ? 1 : 0)
