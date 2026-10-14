// 便8 の並べた画: qa-bin8-shots.mjs が撮った画から、同じ切り抜きを札の順に縦に積んで1枚にする（どれが何かは画に焼かず、報告の文に書く）
// 使い方: node scripts/qa-bin8-sheet.mjs <札,札,…>   QA_IN=…（既定 docs/qa/2026-10-14_便8/mocks）・QA_OUT=…（既定 docs/qa/2026-10-14_便8/sheets）
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const IN = process.env.QA_IN || 'docs/qa/2026-10-14_便8/mocks'
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-14_便8/sheets'
fs.mkdirSync(OUT, { recursive: true })
const tags = (process.argv[2] || '').split(',').filter(Boolean)
// 1枚ごとの元の眺めと切り抜き [x, y, 幅, 高さ]（元の画の画素）と、積む時の幅
const SHEETS = JSON.parse(process.env.QA_SHEETS || 'null') || [
  { name: '1_屋根と地面', shot: 'flylow_pc', crop: [0, 560, 1000, 520], w: 1000 },
  { name: '2_木', shot: 'walk_pc', crop: [0, 0, 1100, 440], w: 1000 },
  { name: '3_窓辺', shot: 'window_iphone', crop: [0, 600, 1206, 1300], w: 600 },
]
const GAP = 14

const b = await chromium.launch()
const page = await b.newPage()
for (const s of SHEETS) {
  const srcs = tags.map((t) => 'data:image/png;base64,' + fs.readFileSync(path.join(IN, `${t}_${s.shot}.png`)).toString('base64'))
  const url = await page.evaluate(async ({ srcs, crop, w, gap }) => {
    const imgs = await Promise.all(srcs.map((src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src })))
    const [x, y, cw, ch] = crop, h = Math.round(ch * w / cw)
    const c = document.createElement('canvas'); c.width = w; c.height = imgs.length * h + (imgs.length - 1) * gap
    const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height)
    imgs.forEach((im, k) => g.drawImage(im, x, y, cw, ch, 0, k * (h + gap), w, h))
    return c.toDataURL('image/png')
  }, { srcs, crop: s.crop, w: s.w, gap: GAP })
  const f = path.join(OUT, `${s.name}.png`)
  fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'))
  console.log(f.replace(/\\/g, '/'), tags.join(' → '))
}
await b.close()
