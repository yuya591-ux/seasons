// 使い捨て（便5）: 画の一部を切り抜いて保存する。使い方: node scripts/_bin5-crop.mjs <元の画> <出力> <x,y,w,h>
import { chromium } from 'playwright'
import fs from 'node:fs'
const [src, out, rect] = process.argv.slice(2)
const [x, y, w, h] = rect.split(',').map(Number)
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: w, height: h } })
await p.setContent(`<body style="margin:0;overflow:hidden"><div style="width:${w}px;height:${h}px;overflow:hidden;position:relative"><img style="position:absolute;left:${-x}px;top:${-y}px" src="data:image/png;base64,${fs.readFileSync(src).toString('base64')}"></div></body>`)
await p.waitForTimeout(200)
await p.screenshot({ path: out })
await b.close()
