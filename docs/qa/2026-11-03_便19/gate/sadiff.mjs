// 2枚の画の差を赤で塗った画を作る（どこが違うかを見る）
import { chromium } from 'playwright'
import fs from 'node:fs'
const [a, c, out] = process.argv.slice(2)
const b = await chromium.launch(); const p = await b.newPage()
const r = await p.evaluate(async ([A, C]) => { const load = async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const cv = document.createElement('canvas'); cv.width = i.width; cv.height = i.height; const x = cv.getContext('2d'); x.drawImage(i, 0, 0); return { d: x.getImageData(0, 0, i.width, i.height), w: i.width, h: i.height } }
  const P = await load(A), Q = await load(C), cv = document.createElement('canvas'); cv.width = P.w; cv.height = P.h; const x = cv.getContext('2d'); const o = x.createImageData(P.w, P.h)
  for (let k = 0; k < P.d.data.length; k += 4) { const d = (Math.abs(P.d.data[k] - Q.d.data[k]) + Math.abs(P.d.data[k + 1] - Q.d.data[k + 1]) + Math.abs(P.d.data[k + 2] - Q.d.data[k + 2])) / 3; const g = (P.d.data[k] + P.d.data[k + 1] + P.d.data[k + 2]) / 9; o.data[k] = d > 8 ? 255 : g; o.data[k + 1] = d > 8 ? 0 : g; o.data[k + 2] = d > 8 ? 0 : g; o.data[k + 3] = 255 }
  x.putImageData(o, 0, 0); return cv.toDataURL('image/png').split(',')[1] }, [fs.readFileSync(a).toString('base64'), fs.readFileSync(c).toString('base64')])
fs.writeFileSync(out, Buffer.from(r, 'base64')); await b.close()
