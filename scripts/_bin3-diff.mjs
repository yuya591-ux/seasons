// 使い捨て（便3）: 案の画を「今」と画素で比べる（差の平均・8段以上変わった画素の割合・指定した帯の明るさとコントラスト）。
// 使い方: node scripts/_bin3-diff.mjs <今の画> <案の画> [帯=y0,y1（0..1）]
import { chromium } from 'playwright'
import fs from 'node:fs'
const [a, bimg, band = '0,1'] = process.argv.slice(2)
const [y0, y1] = band.split(',').map(Number)
const br = await chromium.launch()
const p = await br.newPage()
const im = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')
const r = await p.evaluate(async ([A, B, y0, y1]) => {
  const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = s })
  const [ia, ib] = await Promise.all([load(A), load(B)])
  const W = ia.width, H = ia.height
  const get = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, W, H).data }
  const da = get(ia), db = get(ib)
  let sum = 0, n = 0, ch = 0
  const st = (d) => { let s = 0, s2 = 0, k = 0; for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l; k++ } const m = s / k; return { mean: +m.toFixed(1), std: +Math.sqrt(s2 / k - m * m).toFixed(1) } }
  for (let y = Math.floor(H * y0); y < Math.floor(H * y1); y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3; sum += d; n++; if (d >= 8) ch++ }
  return { size: [W, H], band: [y0, y1], diffMean: +(sum / n).toFixed(2), changedPct: +(100 * ch / n).toFixed(1), ima: st(da), an: st(db) }
}, [im(a), im(bimg), y0, y1])
console.log(JSON.stringify({ ima: a.split('/').pop(), an: bimg.split('/').pop(), ...r }))
await br.close()
