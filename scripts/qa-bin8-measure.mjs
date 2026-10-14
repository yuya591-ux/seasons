// 便8 の案の画の数: 決まった切り抜きの細かな明暗（明るさで割った・×100）と、今のコードの画との差（8段以上変わった画素の割合）
// 使い方: node scripts/qa-bin8-measure.mjs   QA_IN=…（既定 docs/qa/2026-10-14_便8/mocks）。結果は QA_IN/_measure.json
// 物差しは qa-bin6.mjs の __ndetail・__diff と同じ式。切り抜きは qa-bin6.mjs の CROP（PC 1920×1080）と、窓の外の木（iPhone の画の画素）
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const IN = process.env.QA_IN || 'docs/qa/2026-10-14_便8/mocks'
const TAGS = ['before', 'now', 'an1', 'an2']
const CROPS = {
  grass: ['flylow_pc', [560, 990, 180, 80]],      // 低空飛行: 通りの左下の芝（qa-bin6 CROP.grass）
  roofNear: ['flylow_pc', [60, 620, 460, 380]],   // 低空飛行: 左下の手前の屋根（qa-bin6 CROP.roofNear）
  wall: ['flylow_pc', [400, 820, 140, 120]],      // 低空飛行: 左下の窓のある家の壁（qa-bin6 CROP.wall）
  road: ['walk_pc', [450, 870, 620, 200]],        // 歩く目線: 手前の通り（qa-bin6 CROP.road）
  treeNear: ['flylow_pc', [590, 330, 370, 230]],  // 低空飛行: 中ほどの木立（qa-bin6 CROP.treeNear）
  treeCenter: ['flylow_pc', [1000, 560, 320, 400]], // 低空飛行: 通りの右の大きな木（並べた画 2_木 の切り抜き）
  walkTree: ['walk_pc', [0, 0, 900, 360]],        // 歩く目線: 頭の上の近くの木（qa-bin6 CROP.walkTree）
  windowTree: ['window_iphone', [643, 1336, 560, 180]], // 窓辺: 窓の外すぐの木（並べた画 3_窓辺 の下の段の右）
}
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')
const b = await chromium.launch()
const p = await b.newPage()
await p.evaluate(() => {
  window.__img = async (src) => { const i = new Image(); await new Promise((res) => { i.onload = res; i.src = src }); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height) }
  window.__L = (d, W, xx, yy) => { const k = (yy * W + xx) * 4; return 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2] }
  window.__ndetail = async (src, [x0, y0, w, h]) => { const im = await window.__img(src), d = im.data, W = im.width, L = window.__L; let s = 0, m = 0; for (let y = y0 + 1; y < y0 + h - 1; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) { s += Math.abs(L(d, W, x, y) - (L(d, W, x - 1, y) + L(d, W, x + 1, y) + L(d, W, x, y - 1) + L(d, W, x, y + 1)) / 4); m += L(d, W, x, y) } return +(100 * s / Math.max(1, m)).toFixed(3) }
  window.__diff = async (a, bb, [x0, y0, w, h]) => { const A = await window.__img(a), B = await window.__img(bb), W = A.width, L = window.__L; let s = 0, big = 0, n = 0; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const dd = Math.abs(L(A.data, W, x, y) - L(B.data, W, x, y)); s += dd; if (dd >= 8) big++; n++ } return { mean: +(s / n).toFixed(2), over8: +(big / n).toFixed(3) } }
})
const out = {}
for (const [k, [shot, crop]] of Object.entries(CROPS)) {
  out[k] = { shot, crop }
  for (const t of TAGS) {
    const f = path.join(IN, `${t}_${shot}.png`)
    out[k][t] = { nd: await p.evaluate(([s, c]) => window.__ndetail(s, c), [b64(f), crop]) }
    if (t !== 'now') out[k][t].vsNow = await p.evaluate(([a, bb, c]) => window.__diff(a, bb, c), [b64(f), b64(path.join(IN, `now_${shot}.png`)), crop])
  }
  console.log(k, TAGS.map((t) => `${t} 細かさ ${out[k][t].nd}${out[k][t].vsNow ? `・今と8段以上違う ${(out[k][t].vsNow.over8 * 100).toFixed(1)}%` : ''}`).join(' ／ '))
}
fs.writeFileSync(path.join(IN, '_measure.json'), JSON.stringify(out, null, 1))
await b.close()
