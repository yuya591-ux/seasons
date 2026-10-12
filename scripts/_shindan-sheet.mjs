// 使い捨て: 撮った画を縦横に並べた一覧画を作る（確認用）。node scripts/_shindan-sheet.mjs 出力.png 列数 幅px 画1 画2 …
import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
const [out, cols, w, ...files] = process.argv.slice(2)
const imgs = files.map((f) => `<figure><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${path.basename(f)}</figcaption></figure>`).join('')
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +w, height: 400 } })
await p.setContent(`<style>body{margin:0;background:#222;color:#ddd;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px}figure{margin:0}img{width:100%;display:block}figcaption{padding:2px}</style>${imgs}`)
await p.waitForTimeout(300)
await p.screenshot({ path: out, fullPage: true })
await b.close()
