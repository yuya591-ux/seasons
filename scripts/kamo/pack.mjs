// 鴨川の町（角部屋の窓の外）を、本体（src/engine/kamoTown.js）が読む形に詰めて public/kamo/ へ出す。
// 入る物: scripts/kamo/_data/（fetch.mjs → build.mjs → bake.py が作る・git に入れない）
//   geo/*.bin・geo/geo.json … 原点（出町柳の合流）からのメートル。★経緯度は入っていない（測量法の申請不要の条件・便17）
//   bake/bldg_baked.bin・bake/lm_*.png … Blender で焼いた光の回り方（便17 #4=1）
//   tex/<名>_d.jpg・_n.jpg … Poly Haven の CC0 の質感の素材（便17 #3=1・fetch-tex.mjs が取る）
// 出る物: public/kamo/（公開のページに入る。どれも原点からのメートルだけ）
//   kamo.json … 数・刻み・目の位置・各ファイルの中の並び
//   *.bin     … 16 ビットの整数などに詰めて gzip した物（本体が DecompressionStream でほどく）
//   lm_*.jpg  … 焼いた光の図（灰色の JPEG。PC と iPad は 4096、iPhone は _s の 2048）
//   tex/*.jpg … 質感の素材（PC と iPad は今の 1024、iPhone は _s の 512）
// 使い方: node scripts/kamo/pack.mjs   （ffmpeg を使う）
import fs from 'node:fs'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'

const D = process.env.KAMO_DATA || 'scripts/kamo/_data', OUT = 'public/kamo'
fs.mkdirSync(OUT + '/tex', { recursive: true })
const geo = JSON.parse(fs.readFileSync(`${D}/geo/geo.json`, 'utf8'))
const f32 = (p) => { const b = fs.readFileSync(`${D}/${p}`); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) }
const log = []

// 型つきの配列をいくつか並べて1つのファイルにする（並びの始まりは4の倍数にそろえる）。並びは kamo.json に書く
function write(name, parts) {
  const secs = {}; let off = 0; const bufs = []
  for (const [k, arr] of Object.entries(parts)) {
    const pad = (4 - (off % 4)) % 4; if (pad) { bufs.push(Buffer.alloc(pad)); off += pad }
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bufs.push(b)
    secs[k] = { off, n: arr.length, type: arr.constructor.name }; off += b.length
  }
  const raw = Buffer.concat(bufs), gz = zlib.gzipSync(raw, { level: 9 })
  fs.writeFileSync(`${OUT}/${name}`, gz)
  log.push(`${name}: ${(raw.length / 1e6).toFixed(2)}MB → gzip ${(gz.length / 1e6).toFixed(2)}MB`)
  return { file: name, secs }
}
const q16 = (v, step) => { const r = Math.round(v / step); if (r < -32768 || r > 32767) throw new Error(`16 ビットに収まらない: ${v} / ${step}`); return r }

// ── 地形（高さだけ。x・z は網の並びから出す） ──
const NEAR_H = 0.02, FAR_H = 0.05
const nearP = f32('geo/near.bin'), farP = f32('geo/far.bin')
const nearH = new Int16Array(nearP.length / 3), farH = new Int16Array(farP.length / 3)
for (let i = 0; i < nearH.length; i++) nearH[i] = q16(nearP[i * 3 + 1], NEAR_H)
for (let i = 0; i < farH.length; i++) farH[i] = q16(farP[i * 3 + 1], FAR_H)
const zone = new Uint8Array(fs.readFileSync(`${D}/geo/near-zone.bin`))
const terrain = write('terrain.bin', { near: nearH, zone, far: farH })

// ── 建物（焼いた図の位置つき・三角形ごとに角3つ） ──
const BLDG_P = 0.025
const bl = f32('bake/bldg_baked.bin'), nv = bl.length / 6
const bp = new Int16Array(nv * 3), buv = new Uint16Array(nv * 2), bid = new Uint16Array(nv)
for (let i = 0; i < nv; i++) {
  for (let k = 0; k < 3; k++) bp[i * 3 + k] = q16(bl[i * 6 + k], BLDG_P)
  buv[i * 2] = Math.round(Math.min(1, Math.max(0, bl[i * 6 + 3])) * 65535); buv[i * 2 + 1] = Math.round(Math.min(1, Math.max(0, bl[i * 6 + 4])) * 65535)
  bid[i] = bl[i * 6 + 5]
}
const bldg = write('bldg.bin', { pos: bp, uv: buv, bid })

// ── 道・橋・小道・線路 ──
const ROAD_P = 0.03
const rb = fs.readFileSync(`${D}/geo/roads.bin`), rnv = geo.roads.nv, rni = geo.roads.ni
const rpos = new Float32Array(rb.buffer.slice(rb.byteOffset, rb.byteOffset + rnv * 12)), ridx = new Uint32Array(rb.buffer.slice(rb.byteOffset + rnv * 12, rb.byteOffset + rnv * 12 + rni * 4)), rkind = new Uint8Array(rb.buffer.slice(rb.byteOffset + rnv * 12 + rni * 4, rb.byteOffset + rnv * 12 + rni * 4 + rnv))
if (rnv > 65535) throw new Error('道の点が 65535 を超えた（並びを 32 ビットにする）')
const rp16 = new Int16Array(rnv * 3); for (let i = 0; i < rp16.length; i++) rp16[i] = q16(rpos[i], ROAD_P)
const roads = write('roads.bin', { pos: rp16, idx: Uint16Array.from(ridx), kind: rkind })

// ── 川の水面・木・飛び石（小さいので素の数のまま） ──
const wb = fs.readFileSync(`${D}/geo/water.bin`), wnv = geo.water.nv, wni = geo.water.ni
const misc = write('misc.bin', {
  wpos: new Float32Array(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wnv * 12)),
  widx: Uint16Array.from(new Uint32Array(wb.buffer.slice(wb.byteOffset + wnv * 12, wb.byteOffset + wnv * 12 + wni * 4))),
  trees: f32('geo/trees.bin'),
  stones: f32('geo/stones.bin'),
})

// ── 焼いた光の図（灰色の JPEG）・質感の素材 ──
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
const size = (p) => (fs.statSync(p).size / 1e6).toFixed(2) + 'MB'
for (const k of ['terrain', 'bldg']) {
  const src = `${D}/bake/lm_${k}.png`
  ff(['-i', src, '-pix_fmt', 'gray', '-q:v', '3', `${OUT}/lm_${k}.jpg`])
  ff(['-i', src, '-vf', 'scale=2048:2048:flags=area', '-pix_fmt', 'gray', '-q:v', '3', `${OUT}/lm_${k}_s.jpg`])
  log.push(`lm_${k}.jpg: ${size(`${OUT}/lm_${k}.jpg`)}・lm_${k}_s.jpg: ${size(`${OUT}/lm_${k}_s.jpg`)}`)
}
export const TEX = ['gravel_road', 'grass_path_2', 'asphalt_02', 'grey_roof_tiles', 'concrete_wall_004', 'grey_plaster_02', 'japanese_zelkova_bark']
let texL = 0, texS = 0
for (const n of TEX) for (const c of ['d', 'n']) {
  const src = `${D}/tex/${n}_${c}.jpg`
  fs.copyFileSync(src, `${OUT}/tex/${n}_${c}.jpg`)
  ff(['-i', src, '-vf', 'scale=iw/2:ih/2:flags=area', '-q:v', '3', `${OUT}/tex/${n}_${c}_s.jpg`])
  texL += fs.statSync(`${OUT}/tex/${n}_${c}.jpg`).size; texS += fs.statSync(`${OUT}/tex/${n}_${c}_s.jpg`).size
}
log.push(`質感の素材 ${TEX.length} 種: PC と iPad ${(texL / 1e6).toFixed(2)}MB・iPhone ${(texS / 1e6).toFixed(2)}MB`)

// ── 数と並び（★経緯度は書かない） ──
const meta = {
  note: '原点（鴨川デルタ）からのメートル。x 東・y 上・z 南。経緯度は入れていない',
  waterY: geo.waterY,
  near: { n: geo.near.n, R: geo.near.R, step: geo.near.step, hStep: NEAR_H },
  far: { n: geo.far.n, R: geo.far.R, step: geo.far.step, hStep: FAR_H },
  bldg: { nv, pStep: BLDG_P, heights: geo.bldg.heights },
  roads: { nv: rnv, ni: rni, pStep: ROAD_P },
  water: { nv: wnv, ni: wni },
  trees: { n: geo.trees.n },
  stones: { n: geo.stones.n },
  view: geo.views.window, // 角部屋の窓（西岸の建物の東の壁の上の階）。yawDeg＝窓の向き（北から東回りの度・便17 #5=1 の東）
  files: { terrain, bldg, roads, misc },
  tex: TEX,
}
fs.writeFileSync(`${OUT}/kamo.json`, JSON.stringify(meta))
let total = 0; for (const f of fs.readdirSync(OUT)) if (f !== 'tex') total += fs.statSync(`${OUT}/${f}`).size
log.push(`public/kamo（素材を除く）: ${(total / 1e6).toFixed(2)}MB`)
console.log(log.join('\n'))
