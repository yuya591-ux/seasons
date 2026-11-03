// 撮った画を並べて1枚にする（見出しつき・便17 の _bin17-compose.mjs を作る道具にした）。置き場は QA_OUT（既定 docs/qa/2026-11-03_便18/shots）
// 使い方: node scripts/kamo/compose.mjs <出す名前> <列の見出し,…> <行の見出し>:<画1>,<画2>,… [<行の見出し>:…]
//   画は QA_OUT の下の名前（.png 省く）。名前#XxYxWxH で、元の画の一部を切り抜いて拡げる
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const DIR = process.env.QA_OUT || 'docs/qa/2026-11-03_便18/shots'
const [out, cols, ...rows] = process.argv.slice(2)
const colNames = cols.split(',')
const R = rows.map((r) => { const i = r.indexOf(':'); return { name: r.slice(0, i), imgs: r.slice(i + 1).split(',') } })
const W = +(process.env.COMPOSE_W || 640) // 1枚の幅
const b64 = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, n + '.png')).toString('base64')
const html = `<html><body style="margin:0;background:#111;color:#eee;font:15px 'Yu Gothic UI','Meiryo',sans-serif">
<table style="border-collapse:collapse"><tr><td></td>${colNames.map((c) => `<td style="padding:6px 4px;font-weight:bold">${c}</td>`).join('')}</tr>
${R.map((r) => `<tr><td style="padding:4px 8px;writing-mode:vertical-rl;font-weight:bold">${r.name}</td>${r.imgs.map((n) => { const [nm, crop] = n.split('#'); if (!crop) return `<td style="padding:3px"><img src="${b64(nm)}" style="width:${W}px;display:block"></td>`; const [x, y, w, h] = crop.split('x').map(Number), k = W / w; return `<td style="padding:3px"><div style="width:${W}px;height:${Math.round(h * k)}px;background:url(${b64(nm)}) ${-x * k}px ${-y * k}px / ${1920 * k}px ${1080 * k}px no-repeat"></div></td>` }).join('')}</tr>`).join('')}
</table></body></html>`
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 130 + colNames.length * (W + 8), height: 200 } })
await p.setContent(html)
await p.screenshot({ path: path.join(DIR, out + '.png'), fullPage: true })
await b.close()
console.log(path.join(DIR, out + '.png'))
