// 便2（2026-10-12・qa-gate 一括 #1:2 #2:1）の検査。計画表 docs/qa/2026-10-12_seasons_一括.md の行ごとに1つの検査を持つ。
// 使い方: 開発サーバーを 4960 で起動してから  node scripts/qa-bin2.mjs <ID…|all>
//   QA_BASE=…（既定 http://localhost:4960/seasons/）／QA_OUT=…（既定 docs/qa/2026-10-12_便2/gate）／QA_SHOT=前|後（画の札）
// 各検査は { pass, …測った数 } を返し、QA_OUT/<ID>.json に書く。1つでも不合格なら終わりの値 1。
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
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
  return f.replace(/\\/g, '/')
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
  const { page, errs } = await open('iphone')
  await gateStart(page); await apply(page, 'kitaterao-window-3d', 7000)
  await ev(page, () => { const h = document.querySelector('.lookhint'); if (h) h.remove() })
  await page.mouse.move(200, 500); await wait(400)
  const r = await rectOf(page, '.iconbtn--stage')
  if (!r) return { pass: false, why: '主ボタンが無い' }
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
  if (!r.pass) fail++
  console.log(`${id} ${r.pass ? '合格' : '不合格'} (${(r.ms / 1000).toFixed(1)}秒)`)
  // ページを開いたまま残さない（検査ごとに新しい文脈）
  if (browser) { for (const c of browser.contexts()) await c.close().catch(() => {}) }
}
if (browser) await browser.close()
const passN = Object.values(summary).filter(Boolean).length
console.log(`検査の終わり: ${passN}/${ids.length} 合格`)
fs.writeFileSync(path.join(OUT, `_last-run.json`), JSON.stringify({ at: new Date().toISOString(), ids, summary, pass: passN, total: ids.length }, null, 1))
process.exit(fail ? 1 : 0)
