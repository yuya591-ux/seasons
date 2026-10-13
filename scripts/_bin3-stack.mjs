// 使い捨て（便3）: 撮った画を縦に積んで1枚にする（下見・案の並べ画）。使い方: node scripts/_bin3-stack.mjs <出力> <幅> <画1> <画2> ...（幅を row:<1枚の幅> にすると横に並べる）
import { chromium } from 'playwright'
import fs from 'node:fs'
const [out, w, ...files] = process.argv.slice(2)
const b = await chromium.launch()
const row = w.startsWith('row:'), cw = Number(row ? w.slice(4) : w)
const p = await b.newPage({ viewport: { width: row ? cw * files.length + 6 * (files.length - 1) : cw, height: 400 } })
const im = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')
await p.setContent('<body style="margin:0;background:#fff">' + (row ? '<div style="display:flex;gap:6px">' : '') + files.map((f) => `<img style="display:block;width:${cw}px;margin:0 0 ${row ? 0 : 6}px 0" src="${im(f)}">`).join('') + (row ? '</div>' : '') + '</body>')
await p.waitForTimeout(300)
await p.screenshot({ path: out, fullPage: true })
await b.close()
