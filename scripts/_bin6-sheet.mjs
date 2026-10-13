// 使い捨て（便6）: 前と後の画を並べた1枚（JPEG）を作る。画に文字は焼かない（並びの順は報告の文に書く）。
// 使い方: node scripts/_bin6-sheet.mjs <出力.jpg> <幅> <v|h> <画[@x,y,w,h]> …   （v＝縦に積む・h＝横に並べる。@ の後は切り抜き）
import { chromium } from 'playwright'
import fs from 'node:fs'
const [out, w, dir, ...imgs] = process.argv.slice(2)
const W = Number(w), GAP = 8
const items = imgs.map((s) => { const [f, c] = s.split('@'); return { f, c: c ? c.split(',').map(Number) : null } })
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: W, height: 400 } })
const cell = (it, cw) => {
  const src = 'data:image/png;base64,' + fs.readFileSync(it.f).toString('base64')
  if (!it.c) return `<img style="display:block;width:${cw}px" src="${src}">`
  const [x, y, cw0, ch0] = it.c, k = cw / cw0
  return `<div style="width:${cw}px;height:${Math.round(ch0 * k)}px;overflow:hidden;position:relative"><img style="position:absolute;left:${-x * k}px;top:${-y * k}px;transform-origin:0 0" data-k="${k}" src="${src}" onload="this.style.width=(this.naturalWidth*${k})+'px'"></div>`
}
const n = items.length, cw = dir === 'h' ? Math.floor((W - GAP * (n - 1)) / n) : W
await p.setContent(`<body style="margin:0;background:#fff"><div id="s" style="display:flex;flex-direction:${dir === 'h' ? 'row' : 'column'};gap:${GAP}px;width:${W}px">${items.map((it) => cell(it, cw)).join('')}</div></body>`)
await p.waitForTimeout(800)
const h = await p.evaluate(() => Math.ceil(document.getElementById('s').getBoundingClientRect().height))
await p.setViewportSize({ width: W, height: h })
await p.screenshot({ path: out, type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: W, height: h } })
console.log(out, W + 'x' + h)
await b.close()
