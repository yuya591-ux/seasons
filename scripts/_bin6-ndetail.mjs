// 使い捨て（便6）: 切り抜きの細かな明暗を明るさの平均で割った数（模様は色に掛け算で乗るので、影の中と日向で比べられる）。使い方: node scripts/_bin6-ndetail.mjs <画> <x,y,w,h> …
import { chromium } from 'playwright'
import fs from 'node:fs'
const a = process.argv.slice(2); const b = await chromium.launch(); const p = await b.newPage()
for (let i = 0; i < a.length; i += 2) {
  const [x0, y0, w, h] = a[i + 1].split(',').map(Number)
  const r = await p.evaluate(async ([src, x0, y0, w, h]) => { const im = new Image(); await new Promise((res) => { im.onload = res; im.src = src }); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data, W = c.width
    const L = (xx, yy) => { const k = (yy * W + xx) * 4; return 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2] }
    let s = 0, m = 0, n = 0; for (let y = y0 + 1; y < y0 + h - 1; y++) for (let xx = x0 + 1; xx < x0 + w - 1; xx++) { s += Math.abs(L(xx, y) - (L(xx - 1, y) + L(xx + 1, y) + L(xx, y - 1) + L(xx, y + 1)) / 4); m += L(xx, y); n++ }
    return { detail: +(s / n).toFixed(3), mean: +(m / n).toFixed(1), nd: +(100 * s / m).toFixed(3) } }, ['data:image/png;base64,' + fs.readFileSync(a[i]).toString('base64'), x0, y0, w, h])
  console.log(a[i].split('/').slice(-2).join('/'), a[i + 1], JSON.stringify(r))
}
await b.close()
