// 便7: 試しごとの「同じコードどうしの比」を1枚の図にする（報告の目視項目の画）。
// 使い方: node scripts/qa-bin7-zu.mjs   → docs/確認用スクショ/seasons/2026-10-14_便7/01_同じコードどうしの比.png と 02_GPUの動作の速さ.png
import { chromium } from 'playwright'
import fs from 'node:fs'

const D = 'docs/qa/2026-10-14_便7/gate/試し'
const OUT = 'docs/確認用スクショ/seasons/2026-10-14_便7'
fs.mkdirSync(OUT, { recursive: true })
const NAME = {
  1: '内蔵の GPU・止めて続けて描く・ABBA', 2: '専用の GPU・乱数の種をそろえる', 3: '＋止める前に置き直す', 4: '＋描く面の大きさを記録',
  5: '＋CPU の時間を記録', 6: '＋下ごしらえで CPU の時間を外す', 7: '＋動く物を隠す（世界の位置）', 8: '動く物＝親から見た位置',
  9: '動く物＝町の入れ物から見た位置', 10: '動く物＝親の位置のつなぎ', 11: '時刻を固める（隠さない）', 12: '1つずつ開く（動く物を隠したまま）',
  13: '下ごしらえの時間で割る', 14: '同上（GPU の速さを記録）', 15: '2つの枠で1こまずつ交互', 16: '＋1こまごとに終わりを待つ',
}
const rows = []
for (const f of fs.readdirSync(D).filter((f) => /^try\d+_(GS|GS1|GSP)\.json$/.test(f))) {
  const n = parseInt(f.slice(3)); const r = JSON.parse(fs.readFileSync(`${D}/${f}`, 'utf8'))
  rows.push({ n, name: NAME[n] || '', w: r.window && r.window.ratio, f: r.fly && r.fly.ratio })
}
rows.sort((a, b) => a.n - b.n)

// 図1: 試しごとの比（窓辺＝丸・低空飛行＝三角）。灰色の帯が 0.98〜1.02（目指した幅）、点線が 0.95・1.05
const W = 900, H = 64 + rows.length * 46 + 70, x0 = 380, x1 = 860, lo = 0.9, hi = 1.35
const X = (v) => x0 + (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo) * (x1 - x0)
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="'Yu Gothic UI','Meiryo',sans-serif">
<rect width="100%" height="100%" fill="#fff"/>
<text x="20" y="32" font-size="22" font-weight="700" fill="#222">同じコードどうしの比（1.00 が正しい答え）</text>
<rect x="${X(0.98)}" y="48" width="${X(1.02) - X(0.98)}" height="${rows.length * 46 + 8}" fill="#dfe8df"/>
<line x1="${X(0.95)}" x2="${X(0.95)}" y1="48" y2="${56 + rows.length * 46}" stroke="#999" stroke-dasharray="4 4"/>
<line x1="${X(1.05)}" x2="${X(1.05)}" y1="48" y2="${56 + rows.length * 46}" stroke="#999" stroke-dasharray="4 4"/>
<line x1="${X(1)}" x2="${X(1)}" y1="48" y2="${56 + rows.length * 46}" stroke="#555"/>`
rows.forEach((r, i) => {
  const y = 76 + i * 46
  svg += `<text x="20" y="${y + 6}" font-size="17" fill="#222">${r.n}. ${r.name}</text>`
  if (r.w != null) svg += `<circle cx="${X(r.w)}" cy="${y}" r="8" fill="#2c6fb7"/><text x="${X(r.w) + 12}" y="${y - 8}" font-size="13" fill="#2c6fb7">${r.w.toFixed(3)}</text>`
  if (r.f != null) { const fx = X(r.f); svg += `<path d="M${fx} ${y - 9} L${fx + 9} ${y + 7} L${fx - 9} ${y + 7}Z" fill="#c4512b"/><text x="${fx + 12}" y="${y + 16}" font-size="13" fill="#c4512b">${r.f.toFixed(3)}</text>` }
})
const yb = 70 + rows.length * 46
for (const v of [0.9, 0.95, 1, 1.05, 1.1, 1.2, 1.3]) svg += `<text x="${X(v)}" y="${yb + 18}" font-size="14" text-anchor="middle" fill="#444">${v.toFixed(2)}</text>`
svg += `<circle cx="30" cy="${yb + 46}" r="8" fill="#2c6fb7"/><text x="44" y="${yb + 51}" font-size="15">窓辺</text>
<path d="M120 ${yb + 37} L129 ${yb + 53} L111 ${yb + 53}Z" fill="#c4512b"/><text x="136" y="${yb + 51}" font-size="15">低空飛行</text>
<rect x="230" y="${yb + 38}" width="22" height="16" fill="#dfe8df"/><text x="258" y="${yb + 51}" font-size="15">目指した幅 0.98〜1.02（点線は 0.95・1.05）</text></svg>`

// 図2: 試し14 の間の GPU の動作の速さ（0.5秒おき・nvidia-smi）
const L = fs.readFileSync(`${D}/try14_nvidia-smi.csv`, 'utf8').trim().split(/\r?\n/).map((l) => l.split(', '))
const gr = L.map((x) => parseInt(x[2])), mem = L.map((x) => parseInt(x[3]))
const W2 = 900, H2 = 420, px0 = 70, px1 = 870, py0 = 70, py1 = 350
const PX = (i) => px0 + i / Math.max(1, L.length - 1) * (px1 - px0)
const PY = (v, m) => py1 - v / m * (py1 - py0)
const pl = (a, m) => a.map((v, i) => `${PX(i).toFixed(1)},${PY(v, m).toFixed(1)}`).join(' ')
const svg2 = `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" font-family="'Yu Gothic UI','Meiryo',sans-serif">
<rect width="100%" height="100%" fill="#fff"/>
<text x="20" y="32" font-size="22" font-weight="700" fill="#222">測っている間の GPU の動作の速さ（試し14・0.5秒おき）</text>
<text x="20" y="56" font-size="15" fill="#2c6fb7">計算の速さ（MHz・左の目盛り 0〜3105）</text><text x="420" y="56" font-size="15" fill="#c4512b">メモリの速さ（MHz・0〜8000）</text>
<polyline points="${pl(gr, 3105)}" fill="none" stroke="#2c6fb7" stroke-width="2"/>
<polyline points="${pl(mem, 8000)}" fill="none" stroke="#c4512b" stroke-width="1.5" opacity="0.8"/>
<line x1="${px0}" x2="${px1}" y1="${py1}" y2="${py1}" stroke="#555"/>
${[0, 1000, 2000, 3000].map((v) => `<text x="${px0 - 8}" y="${PY(v, 3105) + 5}" font-size="13" text-anchor="end" fill="#2c6fb7">${v}</text>`).join('')}
<text x="${px0}" y="${py1 + 26}" font-size="14" fill="#444">0秒</text><text x="${px1}" y="${py1 + 26}" font-size="14" text-anchor="end" fill="#444">${(L.length / 2).toFixed(0)}秒</text>
<text x="${px0}" y="${py1 + 52}" font-size="15" fill="#222">計算の速さ ${Math.min(...gr)}〜${Math.max(...gr)}MHz・メモリの速さ ${Math.min(...mem)}〜${Math.max(...mem)}MHz を行き来した</text></svg>`

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: W, height: H } })
for (const [s, w, h, name] of [[svg, W, H, '01_同じコードどうしの比.png'], [svg2, W2, H2, '02_GPUの動作の速さ.png']]) {
  await p.setViewportSize({ width: w, height: h })
  await p.setContent(`<body style="margin:0">${s}</body>`)
  await p.screenshot({ path: `${OUT}/${name}` })
  console.log(`${OUT}/${name}`)
}
await b.close()
