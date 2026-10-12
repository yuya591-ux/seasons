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
  return { pass: !!(st && st.enabled === true && t3 && Math.abs(t3.x - 0.4) < 0.05 && axOk), tilt: st, town3d: t3, axes: ax, errs: realErrs(errs) }
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
