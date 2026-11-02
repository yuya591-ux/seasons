// 便15: 2枚の画の差（8/255 を超える画素）を赤で塗った画と、差のある所を 100px の升目で数えた上位を出す
// 使い方: node scripts/_bin15-diffmap.mjs <前.png> <後.png> <出力.png>
import { chromium } from 'playwright'
import fs from 'node:fs'
const [a, b, out] = process.argv.slice(2)
const br = await chromium.launch(); const p = await br.newPage()
const r = await p.evaluate(async ([da, db]) => {
  const load = (d) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + d })
  const [ia, ib] = await Promise.all([load(da), load(db)]); const w = ia.width, h = ia.height
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')
  g.drawImage(ia, 0, 0); const A = g.getImageData(0, 0, w, h); g.drawImage(ib, 0, 0); const B = g.getImageData(0, 0, w, h)
  const cells = {}; const o = g.createImageData(w, h)
  for (let i = 0; i < A.data.length; i += 4) { const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])); const px = (i / 4) % w, py = Math.floor(i / 4 / w); const v = (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 6; o.data[i] = d > 8 ? 255 : v; o.data[i + 1] = d > 8 ? 0 : v; o.data[i + 2] = d > 8 ? 0 : v; o.data[i + 3] = 255; if (d > 8) { const k = Math.floor(px / 100) + ',' + Math.floor(py / 100); cells[k] = (cells[k] || 0) + 1 } }
  g.putImageData(o, 0, 0)
  return { url: c.toDataURL('image/png').split(',')[1], top: Object.entries(cells).sort((x, y) => y[1] - x[1]).slice(0, 8) }
}, [fs.readFileSync(a).toString('base64'), fs.readFileSync(b).toString('base64')])
fs.writeFileSync(out, Buffer.from(r.url, 'base64')); console.log('差の多い升目（x,y は100px単位）:', JSON.stringify(r.top)); await br.close()
