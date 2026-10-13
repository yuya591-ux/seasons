// 使い捨て（便5）: 並べ画を報告に埋める大きさの JPEG にする（下の白い余白は切る）。使い方: node scripts/_bin5-jpg.mjs <元の画> <出力.jpg> <幅>
import { chromium } from 'playwright'
import fs from 'node:fs'
const [src, out, w] = process.argv.slice(2)
const W = Number(w)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: W, height: 300 } })
await p.setContent(`<body style="margin:0;background:#fff"><img id="i" style="display:block;width:${W}px" src="data:image/png;base64,${fs.readFileSync(src).toString('base64')}"></body>`)
await p.waitForTimeout(300)
// 下の白い余白（並べる台本の余り）を切る: 下から見て、白でない行が出る所まで
const h = await p.evaluate(() => { const i = document.getElementById('i'); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data
  let y = c.height - 1; for (; y > 0; y--) { let white = true; for (let xx = 0; xx < c.width; xx += 7) { const k = (y * c.width + xx) * 4; if (d[k] < 250 || d[k + 1] < 250 || d[k + 2] < 250) { white = false; break } } if (!white) break }
  return Math.ceil((y + 1) * i.clientWidth / c.width) })
await p.setViewportSize({ width: W, height: h })
await p.screenshot({ path: out, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: W, height: h } })
console.log(out, W + 'x' + h)
await b.close()
