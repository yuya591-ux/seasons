// 便19: 操作の帯の釦（情景・設定・写真・PC 1920×1080 の右上）の、地と字の明るさの比（WCAG の比・4.5 以上で読みやすい）を測る
// 地＝釦の内側の明るさの中央、字＝明るい方から 3% の明るさ
import { chromium } from 'playwright'
import fs from 'node:fs'
const BTN = { 情景: [1668, 30, 56, 30], 設定: [1752, 30, 52, 30], 写真: [1836, 30, 52, 30] }
const b = await chromium.launch({ channel: 'chromium' })
const p = await b.newPage()
for (const f of process.argv.slice(2)) {
  const r = await p.evaluate(async ([b64, BTN]) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }, out = {}
    for (const [k, [bx, by, bw, bh]] of Object.entries(BTN)) { const d = x.getImageData(bx, by, bw, bh).data, L = []; for (let i = 0; i < d.length; i += 4) L.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2])); L.sort((a, b2) => a - b2); const bg = L[Math.floor(L.length / 2)], tx = L[Math.floor(L.length * 0.97)]; out[k] = +((tx + 0.05) / (bg + 0.05)).toFixed(2) }
    return out }, [fs.readFileSync(f).toString('base64'), BTN])
  console.log(`${f.split('/').pop()}: ${Object.entries(r).map(([k, v]) => k + ' ' + v).join('・')}（最小 ${Math.min(...Object.values(r))}）`)
}
await b.close()
