// 便19: 画の中の「ほぼ真っ黒（RGB の最大が 3 以下）」の画素の割合を数える（建物の焼けていない面の黒）。空を外すため画の下 3 分の 2 だけを見る
// 使い方: node docs/qa/2026-11-03_便19/gate/kuro.mjs <png>…
import { chromium } from 'playwright'
import fs from 'node:fs'
const b = await chromium.launch({ channel: 'chromium' })
const p = await b.newPage()
for (const f of process.argv.slice(2)) {
  const r = await p.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const y0 = Math.floor(img.height / 3), d = x.getImageData(0, y0, img.width, img.height - y0).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) <= 3) k++; return +(k / (d.length / 4) * 100).toFixed(3) }, fs.readFileSync(f).toString('base64'))
  console.log(`${f.split('/').pop()}: 真っ黒の画素 ${r}%`)
}
await b.close()
