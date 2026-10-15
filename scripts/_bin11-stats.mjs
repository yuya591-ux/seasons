// 便11（2026-10-16）: 前と後の画の数（便10 の _bin10-stats.mjs の写し・書き出す所だけ STATS_OUT で替える）。使い方: node scripts/_bin11-stats.mjs <前.png> <後.png> [x,y,w,h]
//   差の平均＝画素ごとの明るさの差の平均（0〜255）・変わった画素＝明るさが8段以上違う画素の割合
//   細かな明暗＝各画素と上下左右の平均との差の平均（大きいほど細かな模様が多い）・明るさの平均
import { chromium } from 'playwright'
import fs from 'node:fs'
const [a, b, crop] = process.argv.slice(2)
const br = await chromium.launch()
const p = await br.newPage()
const r = await p.evaluate(async ({ A, B, crop }) => {
  const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src })
  const [ia, ib] = await Promise.all([load(A), load(B)])
  const [x, y, w, h] = crop || [0, 0, ia.naturalWidth, ia.naturalHeight]
  const lum = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, x, y, w, h, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data; const L = new Float32Array(w * h); for (let i = 0; i < w * h; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; return L }
  const La = lum(ia), Lb = lum(ib)
  let diff = 0, changed = 0
  for (let i = 0; i < La.length; i++) { const dd = Math.abs(La[i] - Lb[i]); diff += dd; if (dd >= 8) changed++ }
  const detail = (L) => { let s = 0, n = 0; for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) { const k = yy * w + xx; s += Math.abs(L[k] - (L[k - 1] + L[k + 1] + L[k - w] + L[k + w]) / 4); n++ } return s / n }
  const mean = (L) => L.reduce((s, v) => s + v, 0) / L.length
  return { diff: +(diff / La.length).toFixed(1), changedPct: Math.round(changed / La.length * 100), detail: [+detail(La).toFixed(2), +detail(Lb).toFixed(2)], mean: [+mean(La).toFixed(1), +mean(Lb).toFixed(1)] }
}, { A: 'data:image/png;base64,' + fs.readFileSync(a).toString('base64'), B: 'data:image/png;base64,' + fs.readFileSync(b).toString('base64'), crop: crop ? crop.split(',').map(Number) : null })
const line = JSON.stringify({ a, b, crop: crop || null, ...r })
fs.appendFileSync(process.env.STATS_OUT || 'docs/qa/2026-10-16_便11/stats.jsonl', line + '\n')
console.log(line)
await br.close()
