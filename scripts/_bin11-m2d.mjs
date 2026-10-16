// 便11（2026-10-16）: 2D の窓の重さ（_bin11-m2d.html を開発サーバー 4963 で開いて測る）。便10 の _bin10-m2d.mjs の写し。
// 使い方: node scripts/_bin11-m2d.mjs <GS|GG> [組の数]   出力: M2D_OUT（既定 docs/qa/2026-10-16_便11/gate/m2d_<GS|GG>.json）
//   GS 物差しの確かめ: 同じ前のコードどうし（雨の窓・海辺・山あい）の比が 0.98〜1.02 に入るか
//   GG 前と後: 雨の窓（案2＝伝い落ちた跡あり・案1＝なし）・海辺・山あいの比が 1.05倍以下か（2D の窓は便6 から変わっていないので、前＝今との比で見る＝裁定記録 2026-10-16）
import { chromium } from 'playwright'
import fs from 'node:fs'
const kind = process.argv[2] || 'GS'
const rounds = +(process.argv[3] || 10)
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--enable-webgl-draft-extensions'] })
const p = await (await b.newContext({ viewport: { width: 800, height: 800 } })).newPage()
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)) }) // 部品の読み込みの 404（GPU の旗を付けた時だけ出る・絵の計算のエラーではない）は数えない
await p.goto('http://localhost:4963/seasons/scripts/_bin11-m2d.html', { waitUntil: 'load', timeout: 120000 })
await p.waitForFunction(() => window.__ready, null, { timeout: 60000 })
const JOBS = {
  GS: [
    ['雨の窓 同じコードどうし', 'RG0', 'RG0', 'rainDusk', 0.65],
    ['海辺 同じコードどうし', 'WS0', 'WS0', 'seaside', 0.6],
    ['山あい 同じコードどうし', 'WM0', 'WM0', 'mountains', 0.5],
  ],
  GG: [
    ['雨の窓 案2（伝い落ちた跡あり）', 'RG0', 'RG', 'rainDusk', 0.65],
    ['雨の窓 案1（跡なし・下げる時の形）', 'RG0', 'RG', 'rainDusk', 0.65, 'trail0'],
    ['海辺 描き込む', 'WS0', 'WS', 'seaside', 0.6],
    ['山あい 描き込む', 'WM0', 'WM', 'mountains', 0.5],
  ],
}[kind]
const r = await p.evaluate(([j, n]) => window.__run(j, n), [JOBS, rounds])
const lim = kind === 'GS' ? (v) => Math.abs(v.ratio - 1) <= 0.02 : (v) => v.ratio <= 1.05
const names = JOBS.map((j) => j[0])
const pass = errs.length === 0 && names.every((k) => r[k] && lim(r[k]))
const out = { kind, at: new Date().toISOString(), rounds, pass, ...r, errs }
fs.writeFileSync(process.env.M2D_OUT || `docs/qa/2026-10-16_便11/gate/m2d_${kind}.json`, JSON.stringify(out, null, 1))
for (const k of names) console.log(`${k}: ${r[k].a}→${r[k].b}ms（${r[k].ratio}倍・組ごと ${r[k].rmin}〜${r[k].rmax}）`)
console.log(`${kind} ${pass ? '合格' : '不合格'}`, errs.length ? 'エラー ' + errs.slice(0, 2).join(' | ') : '')
await b.close()
process.exit(pass ? 0 : 1)
