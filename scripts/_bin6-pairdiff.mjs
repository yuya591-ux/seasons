// 使い捨て（便6）: 2枚の画の切り抜きの明るさの差の平均。使い方: node scripts/_bin6-pairdiff.mjs <画A> <画B> <x,y,w,h> …（A・B・切り抜きの3つずつ）
import { chromium } from 'playwright'
import fs from 'node:fs'
const a = process.argv.slice(2); const b = await chromium.launch(); const p = await b.newPage()
for (let i = 0; i < a.length; i += 3) {
  const r = await p.evaluate(async ([sa, sb, c]) => { const ld = async (s) => { const im = new Image(); await new Promise((res) => { im.onload = res; im.src = s }); const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, cv.width, cv.height) }
    const A = await ld(sa), B = await ld(sb), [x0, y0, w, h] = c, W = A.width, L = (d, k) => 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]; let s = 0, n = 0
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const k = (y * W + x) * 4; s += Math.abs(L(A.data, k) - L(B.data, k)); n++ } return +(s / n).toFixed(2) }, ['data:image/png;base64,' + fs.readFileSync(a[i]).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(a[i + 1]).toString('base64'), a[i + 2].split(',').map(Number)])
  console.log(a[i].split('/').slice(-2).join('/'), a[i + 2], r)
}
await b.close()
