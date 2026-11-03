// 便19 の調べ: 建物の焼いた光の図（lm_bldg）で、三角形ごとの値を数える（建物のすき間の黒の原因を切り分ける）
// 使い方: node docs/qa/2026-11-03_便19/gate/probe-lm.mjs [サフィックス ''|'_s']（PORT の見る用サーバーの public/kamo を読む）
import { chromium } from 'playwright'
const sfx = process.argv[2] || ''
const b = await chromium.launch({ channel: 'chromium' })
const p = await b.newPage()
await p.goto(`http://localhost:${process.env.PORT || 4971}/seasons/`, { waitUntil: 'domcontentloaded' })
const r = await p.evaluate(async (sfx) => {
  const base = '/seasons/kamo/'
  const meta = await (await fetch(base + 'kamo.json')).json()
  const gun = async (u) => new Response((await fetch(u)).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  const buf = await gun(base + meta.files.bldg.file)
  const S = meta.files.bldg.secs, v = (s) => new globalThis[s.type](buf, s.off, s.n)
  const pos = v(S.pos), uv = v(S.uv), bid = v(S.bid), ps = meta.bldg.pStep
  const img = new Image(); img.src = base + `lm_bldg${sfx}.jpg`; await img.decode()
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0)
  const d = x.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height
  const at = (u, vv) => { const i = Math.min(W - 1, Math.max(0, Math.floor(u * W))), j = Math.min(H - 1, Math.max(0, Math.floor((1 - vv) * H))); return d[(j * W + i) * 4] / 255 }
  const nv = meta.bldg.nv
  let wallA = 0, darkA = 0, roofA = 0, roofDark = 0, darkInSide = 0
  const hist = new Array(10).fill(0), ex = [], texelArea = []
  for (let t = 0; t < nv; t += 3) {
    const P = [0, 1, 2].map((q) => [pos[(t + q) * 3] * ps, pos[(t + q) * 3 + 1] * ps, pos[(t + q) * 3 + 2] * ps])
    const U = [0, 1, 2].map((q) => [uv[(t + q) * 2] / 65535, uv[(t + q) * 2 + 1] / 65535])
    const e1 = P[1].map((a, i) => a - P[0][i]), e2 = P[2].map((a, i) => a - P[0][i])
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const area = Math.hypot(...n) / 2; if (area < 1e-4) continue
    const ny = Math.abs(n[1]) / (2 * area)
    const uvA = Math.abs((U[1][0] - U[0][0]) * (U[2][1] - U[0][1]) - (U[2][0] - U[0][0]) * (U[1][1] - U[0][1])) / 2 * W * H // 図の上の画素の数
    const cu = (U[0][0] + U[1][0] + U[2][0]) / 3, cv = (U[0][1] + U[1][1] + U[2][1]) / 3
    const val = (at(cu, cv) + at(...U[0]) + at(...U[1]) + at(...U[2])) / 4
    if (ny > 0.45) { roofA += area; if (val < 0.04) roofDark += area; continue }
    wallA += area; hist[Math.min(9, Math.floor(val * 10))] += area
    if (val < 0.04) { darkA += area; if (uvA < 2) darkInSide += area; if (ex.length < 12 && area > 8) ex.push({ bid: bid[t], area: +area.toFixed(1), val: +val.toFixed(3), uvPx: +uvA.toFixed(2), c: P[0].map((a) => +a.toFixed(1)), n: n.map((a) => +(a / (2 * area)).toFixed(2)) }) }
    texelArea.push(uvA / area)
  }
  texelArea.sort((a, b) => a - b)
  return { W, H, wallA: Math.round(wallA), darkWallPct: +(darkA / wallA * 100).toFixed(2), darkWallTinyUvPct: +(darkInSide / Math.max(1, darkA) * 100).toFixed(1), roofDarkPct: +(roofDark / roofA * 100).toFixed(2), histPct: hist.map((h) => +(h / wallA * 100).toFixed(1)), texelPerM2: { p10: +texelArea[Math.floor(texelArea.length * 0.1)].toFixed(3), p50: +texelArea[Math.floor(texelArea.length * 0.5)].toFixed(3) }, ex }
}, sfx)
console.log(JSON.stringify(r, null, 1))
await b.close()
