// 便19: 報告の画を JPEG（幅 1100・質 0.78）に縮めた写しを作り、写しの報告の元を書く（送るための小さい PDF 用。検品箱の本物は触らない）
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const [src, outDir] = process.argv.slice(2)
const r = JSON.parse(fs.readFileSync(src, 'utf8'))
const b = await chromium.launch(); const p = await b.newPage()
for (const c of r.checks) {
  const f = path.join(r.baseDir, c.image), o = path.join(outDir, path.basename(c.image).replace(/\.png$/, '.jpg'))
  const j = await p.evaluate(async (b64) => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode(); const w = Math.min(1100, i.width), h = Math.round(i.height * w / i.width); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(i, 0, 0, w, h); return cv.toDataURL('image/jpeg', 0.78).split(',')[1] }, fs.readFileSync(f).toString('base64'))
  fs.writeFileSync(o, Buffer.from(j, 'base64')); c.image = o
}
await b.close()
fs.writeFileSync(path.join(outDir, 'report-small.json'), JSON.stringify(r, null, 1))
console.log('縮めた', r.checks.length)
