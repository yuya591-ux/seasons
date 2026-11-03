// 便17: 鴨川の町を本体に組んだ時の荷物（読み込む量）の見積もり。
// 今の試作のファイル（float32 のまま）と、本体に組む時の形（高さを 16 ビットの整数・建物の点を整数にして番号で共有・gzip）を比べる。
// 光の図（4096 の PNG）は JPEG にした時と、iPhone 向けに 2048 へ縮めた時を、ブラウザの書き出しで実際に作って量る。
// 使い方: node scripts/_bin17-size.mjs → docs/qa/2026-11-03_便17/nimotsu.txt
import fs from 'node:fs'
import zlib from 'node:zlib'
import { chromium } from 'playwright'
const D = 'scripts/kamo/_data', geo = JSON.parse(fs.readFileSync(`${D}/geo/geo.json`, 'utf8'))
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length
const MB = (n) => (n / 1e6).toFixed(2) + 'MB'
const rows = []
const add = (name, raw, packed, note) => rows.push({ name, raw, packed, note })

// 地形: 高さだけを 1cm の 16 ビット整数にする（x・z は網の並びで決まる）
for (const k of ['near', 'far']) {
  const f = new Float32Array(fs.readFileSync(`${D}/geo/${k}.bin`).buffer.slice(0)), n = f.length / 3, h = new Int16Array(n)
  for (let i = 0; i < n; i++) h[i] = Math.round(f[i * 3 + 1] * (k === 'near' ? 100 : 10)) // 近く 1cm・遠く 10cm
  add(k === 'near' ? '近くの地形（5m の標高・4m 間隔）' : '遠くの山（10m の標高・50m 間隔）', fs.statSync(`${D}/geo/${k}.bin`).size, gz(Buffer.from(h.buffer)), '高さだけ 16 ビット＋gzip')
}
// 建物: 角ごとの (位置・図の位置・番号) を、同じ角をまとめて番号で共有し、位置は 2cm・図の位置は 16 ビットに
{
  const f = new Float32Array(fs.readFileSync(`${D}/bake/bldg_baked.bin`).buffer.slice(0)), n = f.length / 6, map = new Map(), V = [], I = new Uint32Array(n)
  for (let i = 0; i < n; i++) { const k = [0, 1, 2, 3, 4].map((j) => Math.round(f[i * 6 + j] * (j < 3 ? 50 : 65535))).join(','); if (!map.has(k)) { map.set(k, V.length / 6); V.push(...k.split(',').map(Number), f[i * 6 + 5]) } I[i] = map.get(k) }
  const nv = V.length / 6, pos = new Int16Array(nv * 3), uv = new Uint16Array(nv * 2), bid = new Uint16Array(nv)
  for (let i = 0; i < nv; i++) { pos.set([V[i * 6], V[i * 6 + 1], V[i * 6 + 2]], i * 3); uv.set([V[i * 6 + 3], V[i * 6 + 4]], i * 2); bid[i] = V[i * 6 + 5] }
  add(`建物（PLATEAU LOD2・${geo.bldg.count} 棟）`, fs.statSync(`${D}/bake/bldg_baked.bin`).size, gz(Buffer.concat([Buffer.from(pos.buffer), Buffer.from(uv.buffer), Buffer.from(bid.buffer), Buffer.from(I.buffer)])), `角をまとめて ${nv} 点・2cm の整数＋gzip`)
}
for (const [k, name] of [['roads', '道・橋・小道'], ['water', '川の水面'], ['trees', `木（${geo.trees.n} 本の位置と大きさ）`], ['stones', `飛び石（${geo.stones.n} 個）`], ['near-zone', '河川敷の範囲']]) { const b = fs.readFileSync(`${D}/geo/${k}.bin`); add(name, b.length, gz(b), 'gzip') }

// 光の図・質感の素材（ブラウザで JPEG に書き出して量る）
const b = await chromium.launch(); const p = await b.newPage()
async function jpg(file, size, q) {
  const s = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64')
  return p.evaluate(async ([s, size, q]) => { const i = new Image(); i.src = s; await i.decode(); const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(i, 0, 0, size, size); const bl = await new Promise((r) => c.toBlob(r, 'image/jpeg', q)); return bl.size }, [s, size, q])
}
for (const [f, name] of [['lm_terrain', '光の図（地形）'], ['lm_bldg', '光の図（建物）']]) {
  const file = `${D}/bake/${f}.png`
  add(name + '・PC と iPad（4096）', fs.statSync(file).size, await jpg(file, 4096, 0.85), 'JPEG 85')
  add(name + '・iPhone（2048）', fs.statSync(file).size, await jpg(file, 2048, 0.85), '2048 に縮めて JPEG 85')
}
await b.close()
const used = ['gravel_road', 'grass_path_2', 'asphalt_02', 'grey_roof_tiles', 'concrete_wall_004', 'grey_plaster_02', 'japanese_zelkova_bark']
let tex = 0; for (const u of used) for (const k of ['d', 'n']) tex += fs.statSync(`scripts/_bin16-tex/${u}_${k}.jpg`).size
add(`写真から作った CC0 の質感の素材（${used.length} 種・色と凹凸の2枚ずつ）・PC と iPad`, tex, tex, '今の大きさのまま（JPEG）')
add(`写真から作った CC0 の質感の素材・iPhone（縦横を半分）`, tex, Math.round(tex / 3.6), '縦横半分で約 1/3.6 の見積もり（JPEG は面積に比例しないので幅を持たせた数）')

const sum = (pred) => rows.filter(pred).reduce((s, r) => s + r.packed, 0)
const base = (r) => !/光の図|質感/.test(r.name)
const out = [
  '便17 鴨川の町の荷物の見積もり（2026-11-03・node scripts/_bin17-size.mjs）',
  ...rows.map((r) => `${r.name}: 今の試作 ${MB(r.raw)} → 本体に組む形 ${MB(r.packed)}（${r.note}）`),
  '',
  `② 地図の形＋計算だけ（形だけ）: ${MB(sum(base))}`,
  `③ 地図の形＋光＋写真の素材・PC と iPad: ${MB(sum(base) + sum((r) => /光の図/.test(r.name) && /4096/.test(r.name)) + sum((r) => /質感/.test(r.name) && !/iPhone/.test(r.name)))}`,
  `③ 地図の形＋光＋写真の素材・iPhone: ${MB(sum(base) + sum((r) => /光の図/.test(r.name) && /2048/.test(r.name)) + sum((r) => /質感/.test(r.name) && /iPhone/.test(r.name)))}`,
]
fs.writeFileSync('docs/qa/2026-11-03_便17/nimotsu.txt', out.join('\n') + '\n')
console.log(out.join('\n'))
