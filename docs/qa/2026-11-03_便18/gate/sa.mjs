// 便18: 前（復元地点 fce9a16）と後（今）の同じ撮り方の画の、画素の差を測る（平均の差と、差が 8/255 を超える画素の割合）
// 使い方: node docs/qa/2026-11-03_便18/gate/sa.mjs <名前…>   （docs/qa/2026-11-03_便18/shots/ma/<名前>-mae.png と -ato.png）
import { chromium } from 'playwright'
import fs from 'node:fs'
const D = 'docs/qa/2026-11-03_便18/shots/ma/'
const b = await chromium.launch(); const p = await b.newPage()
for (const n of process.argv.slice(2)) {
  const a = fs.readFileSync(D + n + '-mae.png').toString('base64'), c = fs.readFileSync(D + n + '-ato.png').toString('base64')
  const r = await p.evaluate(async ([a, c]) => {
    const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const cv = document.createElement('canvas'); cv.width = i.width; cv.height = i.height; const x = cv.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data }
    const A = await load(a), C = await load(c); let sum = 0, over = 0, n = 0
    for (let k = 0; k < A.length; k += 4) { const d = (Math.abs(A[k] - C[k]) + Math.abs(A[k + 1] - C[k + 1]) + Math.abs(A[k + 2] - C[k + 2])) / 3; sum += d; if (d > 8) over++; n++ }
    return { mean: +(sum / n).toFixed(3), over: +((over / n) * 100).toFixed(3) }
  }, [a, c])
  console.log(`${n}: 平均の差 ${r.mean}/255・差が 8 を超える画素 ${r.over}%`)
}
await b.close()
