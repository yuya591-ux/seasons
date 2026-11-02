// 便15: 画の一部を切り抜いて拡大する（見比べの画・真因の切り分け用）。本体は変えない
// 使い方: node scripts/_bin15-crop.mjs <入力.png> <x> <y> <w> <h> <倍率> <出力.png>
//         node scripts/_bin15-crop.mjs --sheet <出力.png> <幅> <入力1.png> <入力2.png> …  … 縦に積んだ1枚（各画を幅にそろえる）
import { chromium } from 'playwright'
import fs from 'node:fs'

const a = process.argv.slice(2)
const br = await chromium.launch()
const p = await br.newPage()
if (a[0] === '--sheet') {
  const [, out, W, ...ins] = a
  const datas = ins.map((f) => fs.readFileSync(f).toString('base64'))
  const b64 = await p.evaluate(async ([datas, W]) => {
    const ims = await Promise.all(datas.map((d) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + d })))
    const hs = ims.map((im) => Math.round(im.height * W / im.width)), gap = 8
    const c = document.createElement('canvas'); c.width = W; c.height = hs.reduce((s, h) => s + h + gap, 0) - gap
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    let y = 0; ims.forEach((im, i) => { g.drawImage(im, 0, y, W, hs[i]); y += hs[i] + gap })
    return c.toDataURL('image/png').split(',')[1]
  }, [datas, +W])
  fs.writeFileSync(out, Buffer.from(b64, 'base64'))
} else {
  const [inp, x, y, w, h, s, out] = a
  const d = fs.readFileSync(inp).toString('base64')
  const b64 = await p.evaluate(async ([d, x, y, w, h, s]) => {
    const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + d })
    const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s)
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, x, y, w, h, 0, 0, c.width, c.height)
    return c.toDataURL('image/png').split(',')[1]
  }, [d, +x, +y, +w, +h, +s])
  fs.writeFileSync(out, Buffer.from(b64, 'base64'))
}
await br.close()
console.log('書いた:', a[0] === '--sheet' ? a[1] : a[6])
