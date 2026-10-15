// 使い捨て（便10）: 画を横に並べた縮小の JPEG を作る（見比べ用。どれが何かは画に焼かない）
// 使い方: node scripts/_bin10-montage.mjs <出力.jpg> <高さ> <画…>（VERT=1 なら <高さ> を幅として縦に積む）   画は「file」か「file@x,y,w,h」（切り抜き）
import { chromium } from 'playwright'
import fs from 'node:fs'
const [out, h, ...ins] = process.argv.slice(2)
const H = Number(h)
const items = ins.map((s) => { const [f, c] = s.split('@'); return { src: 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'), crop: c ? c.split(',').map(Number) : null } })
const b = await chromium.launch()
const p = await b.newPage()
const url = await p.evaluate(async ({ items, H, VERT }) => {
  const imgs = await Promise.all(items.map((it) => new Promise((res) => { const i = new Image(); i.onload = () => res({ i, crop: it.crop || [0, 0, i.naturalWidth, i.naturalHeight] }); i.src = it.src })))
  const c = document.createElement('canvas'); const g0 = () => { const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); return g }
  if (VERT) {
    const hs = imgs.map(({ crop }) => Math.round(crop[3] * H / crop[2]))
    c.width = H; c.height = hs.reduce((a, h) => a + h, 0) + (imgs.length - 1) * 14
    const g = g0(); let y = 0; imgs.forEach(({ i, crop }, k) => { g.drawImage(i, crop[0], crop[1], crop[2], crop[3], 0, y, H, hs[k]); y += hs[k] + 14 })
  } else {
    const ws = imgs.map(({ crop }) => Math.round(crop[2] * H / crop[3]))
    c.width = ws.reduce((a, w) => a + w, 0) + (imgs.length - 1) * 10; c.height = H
    const g = g0(); let x = 0; imgs.forEach(({ i, crop }, k) => { g.drawImage(i, crop[0], crop[1], crop[2], crop[3], x, 0, ws[k], H); x += ws[k] + 10 })
  }
  return c.toDataURL('image/jpeg', 0.85)
}, { items, H, VERT: !!process.env.VERT })
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'))
console.log(out)
await b.close()
