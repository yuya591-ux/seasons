// 便17 の試作（_bin17-kamo.html・または _bin16-river.html）を撮る。本物の GPU で撮り、毎秒のこま数と数を記録する。
// 使い方: node scripts/_bin17-shot.mjs <端末 pc|ipad|iphone> <クエリ> <名前> [ページ _bin17-kamo|_bin16-river]
import { chromium } from 'playwright'
import fs from 'node:fs'
const [dev = 'pc', qs = 'v=3&view=bank', name = 'shot', page = '_bin17-kamo'] = process.argv.slice(2)
const OUT = process.env.QA_OUT || 'docs/qa/2026-11-03_便17/mihon'
fs.mkdirSync(OUT, { recursive: true })
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  iphone: { viewport: { width: 874, height: 402 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', ...(process.env.FPS ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])] })
const p = await (await b.newContext(DEV)).newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().split('/seasons/').pop()) })
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)) })
await p.goto(`http://localhost:${process.env.B15_PORT || 4985}/seasons/scripts/${page}.html?${qs}`, { waitUntil: 'load', timeout: 120000 })
await p.waitForFunction(() => window.__b16 && window.__b16.ready, null, { timeout: 120000 }).catch(() => {})
await p.waitForTimeout(process.env.FPS ? 9000 : 4500) // こま数を測る回は長めに待つ（温まった後の2秒の数）
const st = await p.evaluate(() => window.__b16 ? { fps: window.__b16.fps, counts: window.__b16.counts, calls: window.__b16.renderer.info.render.calls, tris: window.__b16.renderer.info.render.triangles } : null)
await p.screenshot({ path: `${OUT}/${name}.png` })
console.log(name, JSON.stringify(st), errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
