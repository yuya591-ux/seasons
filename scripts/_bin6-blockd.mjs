// 使い捨て（便6）: 4×4画素ずつ平均してから、上下左右との差の平均を明るさの平均で割った数（×100）。紙の粒（1画素）を落として、数画素の模様を見る。使い方: node scripts/_bin6-blockd.mjs <画> <x,y,w,h> …
import { chromium } from 'playwright'
import fs from 'node:fs'
const a = process.argv.slice(2); const b = await chromium.launch(); const p = await b.newPage()
for (let i = 0; i < a.length; i += 2) {
  const r = await p.evaluate(async ([src, c]) => { const im = new Image(); await new Promise((res) => { im.onload = res; im.src = src }); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, cv.width, cv.height).data, W = cv.width
    const [x0, y0, w, h] = c, B = 4, bw = Math.floor(w / B), bh = Math.floor(h / B), m = new Float32Array(bw * bh)
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { let s = 0; for (let yy = 0; yy < B; yy++) for (let xx = 0; xx < B; xx++) { const k = ((y0 + by * B + yy) * W + x0 + bx * B + xx) * 4; s += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2] } m[by * bw + bx] = s / (B * B) }
    let s = 0, t = 0; for (let y = 1; y < bh - 1; y++) for (let xx = 1; xx < bw - 1; xx++) { const v = m[y * bw + xx]; s += Math.abs(v - (m[y * bw + xx - 1] + m[y * bw + xx + 1] + m[(y - 1) * bw + xx] + m[(y + 1) * bw + xx]) / 4); t += v } return +(100 * s / t).toFixed(3) }, ['data:image/png;base64,' + fs.readFileSync(a[i]).toString('base64'), a[i + 1].split(',').map(Number)])
  console.log(a[i].split('/').slice(-2).join('/'), a[i + 1], r)
}
await b.close()
