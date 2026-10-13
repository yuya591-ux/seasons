// 使い捨て（便5）: 画の細かな明暗の量（各画素と上下左右4つの平均との差の平均。大きいほど細かな模様が多い）を測る。使い方: node scripts/_bin5-detail.mjs <画>...
import { chromium } from 'playwright'
import fs from 'node:fs'
const b = await chromium.launch(); const p = await b.newPage()
for (const f of process.argv.slice(2)) {
  const r = await p.evaluate(async (src) => { const i = new Image(); await new Promise((res) => { i.onload = res; i.src = src }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height
    const L = (xx, yy) => { const k = (yy * W + xx) * 4; return 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2] }
    let s = 0, n = 0; for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) { s += Math.abs(L(xx, y) - (L(xx - 1, y) + L(xx + 1, y) + L(xx, y - 1) + L(xx, y + 1)) / 4); n++ }
    return +(s / n).toFixed(2) }, 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'))
  console.log(JSON.stringify({ img: f.split('/').pop(), detail: r }))
}
await b.close()
