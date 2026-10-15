// 使い捨て（便10）: 2D の窓の重さ（_bin10-m2d.html を開発サーバー 4970 で開いて測る）。使い方: node scripts/_bin10-m2d.mjs [組の数]
import { chromium } from 'playwright'
import fs from 'node:fs'
const rounds = +(process.argv[2] || 10)
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--enable-webgl-draft-extensions'] })
const p = await (await b.newContext({ viewport: { width: 800, height: 800 } })).newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)) })
await p.goto('http://localhost:4970/seasons/scripts/_bin10-m2d.html', { waitUntil: 'load', timeout: 120000 })
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })
const ONLY = process.env.M2D_ONLY ? new RegExp(process.env.M2D_ONLY) : null
const jobs0 = [
  ['雨の窓 案1', 'RG', 'rain1', 'rainDusk', 0.65],
  ['雨の窓 案2', 'RG', 'rain2', 'rainDusk', 0.65],
  ['雨の窓 案1（ぼかしを1回作る形）', 'RG', 'rain1c', 'rainDusk', 0.65],
  ['雨の窓 案2（ぼかしを1回作る形）', 'RG', 'rain2c', 'rainDusk', 0.65],
  ['海辺 描き込む', 'WS', 'egaku', 'seaside', 0.6],
  ['山あい 描き込む', 'WM', 'egaku', 'mountains', 0.5],
]
const jobs = ONLY ? jobs0.filter((j) => ONLY.test(j[0])) : jobs0
const r = await p.evaluate(([j, n]) => window.__run(j, n), [jobs, rounds])
const out = { at: new Date().toISOString(), rounds, ...r, errs }
fs.writeFileSync(process.env.M2D_OUT || 'docs/qa/2026-10-15_便10/gate/m2d.json', JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
await b.close()
