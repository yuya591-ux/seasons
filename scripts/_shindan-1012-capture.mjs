// shindan 2026-10-12 用の撮影（使い捨て）。iPhone・iPad・PC の幅で、入口・主要な情景・設定画面・飛行/歩行を撮り、
// 解像度・描画コール・主役ボタンの指の届き方を測って JSON に残す。本体は1行も変えない。
// 使い方: vite preview を 4951 で起動してから  node scripts/_shindan-1012-capture.mjs [端末名…]
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const PORT = process.env.PORT || 4951
const BASE = `http://localhost:${PORT}/seasons/?dev=1`
const OUT = 'docs/qa/2026-10-12_seasons/shots'
fs.mkdirSync(OUT, { recursive: true })

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const UA_IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const DEVICES = {
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD },
  ipadL: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD },
  ipad13: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_IPAD },
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 },
}
const SCENES = [
  'kitaterao-window-3d', 'kitaterao-window-3d-sunset', 'kitaterao-window-3d-rain-night', 'kitaterao-window-3d-snow',
  'shishigaya-window-3d', 'autumn-dusk-corner-room', 'summer-rain-dusk', 'summer-dusk-seaside', 'summer-morning-mountains',
]
const want = process.argv.slice(2)
const names = want.length ? want : Object.keys(DEVICES)

const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const result = {}
for (const name of names) {
  const ctx = await browser.newContext(DEVICES[name])
  // iPad の Safari は「Mac として」名乗り、指の数で iPad と分かる。そこを再現する
  if (name.startsWith('ipad')) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }) })
  if (name === 'iphone') await ctx.addInitScript(() => { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }); Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' }) })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  const vw = DEVICES[name].viewport.width, vh = DEVICES[name].viewport.height
  const live = async (file) => {
    await page.mouse.move(vw / 2, vh / 2); await page.mouse.move(vw / 2 + 2, vh / 2 + 2)
    await page.waitForTimeout(300)
    await page.screenshot({ path: path.join(OUT, `${name}-${file}.png`) })
  }
  const probe = (fn, arg) => page.evaluate(fn, arg).catch((e) => ({ err: String(e).slice(0, 120) }))
  const r = { device: DEVICES[name], errors: errs }
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(OUT, `${name}-01-gate.png`) })
  await page.locator('.gate').click().catch(() => {})
  await page.waitForTimeout(1500)
  await probe(() => window.__applyScene('kitaterao-window-3d'))
  await page.waitForTimeout(6000)
  await live('02-window-ui')
  // 主役ボタン（窓をあける）に指が届くか: ボタンの中心で一番上にある要素を調べる
  r.stageBtn = await probe(() => {
    const b = document.querySelector('.iconbtn--stage'); if (!b) return { found: false }
    const rc = b.getBoundingClientRect(); const x = rc.left + rc.width / 2, y = rc.top + rc.height / 2
    const top = document.elementFromPoint(x, y)
    return { found: true, text: b.textContent, rect: [Math.round(rc.left), Math.round(rc.top), Math.round(rc.width), Math.round(rc.height)], topIs: top ? (top.tagName + '.' + (top.className || '')) : null, reachable: top === b || b.contains(top) }
  })
  r.topbarRow = await probe(() => [...document.querySelectorAll('.topbar > *')].filter((e) => e.offsetParent).map((e) => { const rc = e.getBoundingClientRect(); return { t: e.textContent.trim(), x: Math.round(rc.left), y: Math.round(rc.top), w: Math.round(rc.width), h: Math.round(rc.height) } }))
  r.window = {
    stats: await probe(() => window.__town3dStats && window.__town3dStats()),
    draw: await probe(() => window.__town3dDraw && window.__town3dDraw()),
    load: await probe(() => window.__town3dLoad && window.__town3dLoad()),
    canvas: await probe(() => { const c = document.querySelector('.town3d-stage canvas'); return c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null }),
    layers: await probe(() => [...document.querySelectorAll('.town3d-stage *, body > *')].filter((e) => { const s = getComputedStyle(e); return s.mixBlendMode !== 'normal' && s.display !== 'none' && s.visibility !== 'hidden' }).map((e) => (e.className || e.tagName) + ':' + getComputedStyle(e).mixBlendMode)),
    dpr: await probe(() => window.devicePixelRatio),
    quality: await probe(() => { try { return JSON.parse(localStorage.getItem('seasons.state.v1') || '{}').settings?.quality || null } catch { return null } }),
  }
  // 設定パネル
  await page.locator('.topbar .iconbtn', { hasText: '設定' }).click({ force: true }).catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(OUT, `${name}-03-settings.png`) })
  // 描き込みの段ごとの解像度（PCで「こまやか」が効くか）
  r.qualitySteps = {}
  for (const q of ['こまやか', 'ふつう', '軽やか']) {
    await page.locator('.chip', { hasText: q }).first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(1200)
    r.qualitySteps[q] = await probe(() => { const c = document.querySelector('.town3d-stage canvas'); const s = window.__town3dStats ? window.__town3dStats() : {}; return { pr: s.pr, canvasW: c && c.width, canvasH: c && c.height, layersLight: document.querySelector('.town3d-stage--light') ? 1 : 0 } })
  }
  await page.locator('.chip', { hasText: 'ふつう' }).first().click({ force: true }).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(5, vh - 5).catch(() => {})
  await page.waitForTimeout(800)
  // 情景の一覧
  await page.locator('.topbar .iconbtn', { hasText: '情景' }).click({ force: true }).catch(() => {})
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(OUT, `${name}-04-gallery.png`) })
  await page.keyboard.press('Escape').catch(() => {})
  await page.mouse.click(5, vh - 5).catch(() => {})
  await page.waitForTimeout(600)
  // UI を隠して情景だけを撮る
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots{display:none !important}' })
  r.scenes = {}
  for (const id of SCENES) {
    await probe((sid) => window.__applyScene(sid), id)
    await page.waitForTimeout(5500)
    await live(`10-${id}`)
    r.scenes[id] = { stats: await probe(() => window.__town3dStats && window.__town3dStats()), draw: await probe(() => window.__town3dDraw && window.__town3dDraw()) }
  }
  // 窓をあける → 空へ → 地上へ
  await probe(() => window.__applyScene('kitaterao-window-3d'))
  await page.waitForTimeout(5500)
  await probe(() => window.__town3dWindow(true)); await page.waitForTimeout(2500)
  await live('20-window-open')
  await probe(() => window.__town3dFlyToggle(true)); await page.waitForTimeout(3000)
  await probe(() => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.2)); await page.waitForTimeout(2500)
  await live('21-fly-low')
  r.flyLow = { stats: await probe(() => window.__town3dStats()), draw: await probe(() => window.__town3dDraw()) }
  await probe(() => window.__town3dFlyPose(0, 130, 120, Math.PI, -0.3)); await page.waitForTimeout(2500)
  await live('22-fly-high')
  await probe(() => window.__town3dFlyPose(2, 6, -18, Math.PI, -0.05)); await page.waitForTimeout(800)
  await probe(() => window.__town3dLandToggle(true)); await page.waitForTimeout(3500)
  await live('23-walk')
  r.walk = { stats: await probe(() => window.__town3dStats()), draw: await probe(() => window.__town3dDraw()) }
  result[name] = r
  console.log(name, 'ok', 'errors=', errs.length, 'stageBtn=', JSON.stringify(r.stageBtn), 'pr=', r.window.stats && r.window.stats.pr, 'calls=', r.window.draw && r.window.draw.calls)
  await ctx.close()
}
const file = `docs/qa/2026-10-12_seasons/capture-${names.join('_')}.json`
fs.writeFileSync(file, JSON.stringify(result, null, 1))
console.log('書いた:', file)
await browser.close()
