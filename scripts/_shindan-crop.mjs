// 使い捨て: 画の一部を切り出して拡大する。node scripts/_shindan-crop.mjs 入力 出力 x y w h 倍率
import { chromium } from 'playwright'
import fs from 'node:fs'
const [inp, out, x, y, w, h, s = 1] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: Math.round(w * s), height: Math.round(h * s) } })
await p.setContent(`<body style="margin:0;overflow:hidden"><div style="width:${w * s}px;height:${h * s}px;overflow:hidden;position:relative"><img style="position:absolute;left:${-x * s}px;top:${-y * s}px;transform-origin:0 0;transform:scale(${s})" src="data:image/png;base64,${fs.readFileSync(inp).toString('base64')}"></div></body>`)
await p.waitForTimeout(200); await p.screenshot({ path: out }); await b.close()
