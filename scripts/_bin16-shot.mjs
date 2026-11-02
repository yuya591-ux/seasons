// 便16 設計案の試作（_bin16-river.html）を撮る。本物の GPU で撮り、毎秒のこま数と数を記録する。
// 使い方: node scripts/_bin16-shot.mjs <端末 pc|ipad|iphone> <クエリ（v=A&t=dusk…）> <名前>
import { chromium } from 'playwright'
import fs from 'node:fs'
const [dev = 'pc', qs = 'v=A&t=dusk', name = 'shot'] = process.argv.slice(2)
const OUT = process.env.QA_OUT || 'docs/qa/2026-11-03_便16/an'
fs.mkdirSync(OUT, { recursive: true })
const DEV = {
  pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  ipad: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  iphone: { viewport: { width: 874, height: 402 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const p = await (await b.newContext(DEV)).newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 400)) })
await p.goto(`http://localhost:${process.env.B15_PORT || 4985}/seasons/scripts/_bin16-river.html?${qs}`, { waitUntil: 'load', timeout: 120000 })
await p.waitForFunction(() => window.__b16 && window.__b16.ready, null, { timeout: 120000 }).catch(() => {})
await p.waitForTimeout(4500)
const st = await p.evaluate(() => window.__b16 ? { fps: window.__b16.fps, counts: window.__b16.counts, calls: window.__b16.renderer.info.render.calls, tris: window.__b16.renderer.info.render.triangles } : null)
await p.screenshot({ path: `${OUT}/${name}.png` })
console.log(name, JSON.stringify(st), errs.length ? 'ERR ' + [...new Set(errs)].slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
