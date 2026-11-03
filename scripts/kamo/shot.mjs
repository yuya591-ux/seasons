// 鴨川の町の角部屋を、本物の GPU（画面なしの Chromium・D3D11）で開いて撮り、描いたこま数と数を記録する（便18）。
// 前に: npm run build のあと npx vite preview --port 4961 --strictPort（dist を見る）
// 使い方: node scripts/kamo/shot.mjs <端末> <情景ID> <名前> [見回しの横 rad] [縦 rad] [窓 close|open|lean] [追加のクエリ]
//   端末: pc（1920×1080）・ipad（1180×820@2）・iphone（402×874@3・縦）・iphoneL（874×402@3・横）
//   FPS=1 を付けると画面の同期を切って9秒待ち、最後の3秒に描いたこま数を測る
// 出る物: QA_OUT（既定 docs/qa/2026-11-03_便18/shots）/<名前>.png と、1行の結果（こま数・段・エラー）
import { chromium } from 'playwright'
import fs from 'node:fs'
const [dev = 'pc', scene = 'autumn-dusk-corner-room', name = 'shot', yaw = '', pitch = '', win = 'close', extra = ''] = process.argv.slice(2)
const OUT = process.env.QA_OUT || 'docs/qa/2026-11-03_便18/shots'
fs.mkdirSync(OUT, { recursive: true })
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  iphoneL: { viewport: { width: 874, height: 402 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}[dev]
const FPS = !!process.env.FPS
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', ...(FPS ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] })
const p = await (await b.newContext(DEV)).newPage()
const errs = [], warns = []
p.on('pageerror', (e) => errs.push('PE ' + e.message))
p.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(r.status() + ' ' + r.url().split('/seasons/').pop()) })
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); if (m.type() === 'warning' && /鴨川/.test(m.text())) warns.push(m.text().slice(0, 300)) })
const port = process.env.PORT || 4961
await p.goto(`http://localhost:${port}/seasons/?dev=1${extra ? '&' + extra : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
const t0 = Date.now()
await p.evaluate((id) => window.__applyScene(id), scene)
await p.waitForFunction(() => window.__town3dDraw && window.__town3dDraw() && window.__town3dFrame && window.__town3dFrame() > 3, null, { timeout: 120000 }).catch(() => {})
const mountMs = Date.now() - t0
if (yaw !== '' || pitch !== '') await p.evaluate(([y, q]) => window.__town3dSetView(+y, +q), [yaw || '0', pitch || '0'])
if (win === 'open' || win === 'lean') { await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(1500) }
if (win === 'lean') { await p.evaluate(() => window.__town3dLean(true)); await p.waitForTimeout(1500) }
await p.waitForTimeout(FPS ? 6000 : 3500)
let fps = null
// こま数は町の3Dが数える「描いたこまの数」（__town3dStats().frames）で測る。__town3dFrame は描画の呼び出しの回数で、鴨川の形は1こまに呼び出しが多いので比べられない（便18 で取り違えた）
if (FPS) { const fr = () => p.evaluate(() => window.__town3dStats().frames); const f0 = await fr(); await p.waitForTimeout(3000); const f1 = await fr(); fps = Math.round((f1 - f0) / 3) }
// 1こまの時間（同じこまを60回続けて描き、GPU を待った平均）を5回測り、中央の値を使う。出せるこま数＝1000÷これ
let benchMs = null
if (FPS) { const ms = []; for (let k = 0; k < 5; k++) { ms.push(await p.evaluate(() => window.__town3dBench(60))); await p.waitForTimeout(300) } ms.sort((x, y) => x - y); benchMs = ms[2] }
const st = await p.evaluate(() => ({ kamo: window.__town3dKamo ? window.__town3dKamo() : null, q: window.__town3dQuality ? window.__town3dQuality() : null, stats: window.__town3dStats ? window.__town3dStats() : null, fly: !!document.querySelector('.fly-btn:not([hidden])') }))
await p.screenshot({ path: `${OUT}/${name}.png` })
const line = `${name} ${dev} ${scene} 組むまで ${mountMs}ms${fps !== null ? ' fps ' + fps + ' 1こま ' + benchMs + 'ms（出せるこま数 ' + Math.round(1000 / benchMs) + '）' : ''} ${JSON.stringify({ kamo: st.kamo, pr: st.q && st.q.pr, q: st.q && st.q.q, stats: st.stats, auto: st.q && { p75: st.q.p75, changes: st.q.changes, failedCap: st.q.failedCap } })} ${errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 4).join(' | ') : 'エラー無し'}${warns.length ? ' WARN ' + warns.join(' | ') : ''}`
console.log(line)
await b.close()
