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
// 便23: KAMO_GEO=geo-u・KAMO_BAKE=bake-u で、北と南を合わせた網（merge.mjs）と焼いた図（bake.py）を詰める
const GEO = process.env.KAMO_GEO || 'geo', BAKE = process.env.KAMO_BAKE || 'bake'
fs.mkdirSync(OUT + '/tex', { recursive: true })
const geo = JSON.parse(fs.readFileSync(`${D}/${GEO}/geo.json`, 'utf8'))
const REG = geo.near.regions || null // 便23: 北の四角（A）と南の四角（B）
const at = (p) => `${D}/${p.replace(/^geo[/]/, GEO + '/').replace(/^bake[/]/, BAKE + '/')}`
const f32 = (p) => { const b = fs.readFileSync(at(p)); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)) }
const rdD = (p) => fs.readFileSync(at(p))
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
const zone = new Uint8Array(rdD('geo/near-zone.bin'))
const wdepth = new Uint8Array(rdD('geo/near-wdepth.bin')) // 便21: 水の深さ（0.25cm 刻み）
const terrain = write('terrain.bin', { near: nearH, zone, far: farH, wdepth })

/// ── 建物（焼いた図の位置つき・三角形ごとに角3つ） ──
// 便21: 範囲を東へ広げて ±819m（0.025m 刻み）に収まらなくなったので、範囲の中心（POFF）を引いてから 0.045m 刻みで詰める
// 便23: 南の四角の建物は south.bin に分けて、南の四角の中心（POFFB）を引いて詰める。北の物（bldg.bin・roads.bin・misc.bin）は北の便の物だけ＝前と同じ並び
//   南の物は窓辺が開いた後に裏で読む（本体の addSouth・開くまでの時間を変えない）
const RA = REG ? REG.A : geo.near, RB = REG ? REG.B : null
const BLDG_P = 0.045, POFF = [(RA.x0 + RA.x1) / 2, 0, (RA.z0 + RA.z1) / 2], POFFB = RB ? [(RB.x0 + RB.x1) / 2, 0, (RB.z0 + RB.z1) / 2] : null
const bl = f32('bake/bldg_baked.bin'), nvAll = bl.length / 6
const NBA = geo.bldg.nA ?? 1e9 // 南の建物の番号はここから
let nv = 0; while (nv < nvAll && bl[nv * 6 + 5] < NBA) nv++
for (let i = nv; i < nvAll; i++) if (bl[i * 6 + 5] < NBA) throw new Error('焼いた建物の並びが北・南の順でない')
const packB = (i0, i1, po, idOff) => { const n = i1 - i0, bp = new Int16Array(n * 3), buv = new Uint16Array(n * 2), bid = new Uint16Array(n)
  for (let j = 0; j < n; j++) { const i = i0 + j
    for (let k = 0; k < 3; k++) bp[j * 3 + k] = q16(bl[i * 6 + k] - po[k], BLDG_P)
    buv[j * 2] = Math.round(Math.min(1, Math.max(0, bl[i * 6 + 3])) * 65535); buv[j * 2 + 1] = Math.round(Math.min(1, Math.max(0, bl[i * 6 + 4])) * 65535)
    bid[j] = bl[i * 6 + 5] - idOff }
  return { bp, buv, bid } }
const kyo = rdD('geo/bldg-kyo.bin'), nB = geo.bldg.count, nBA = Math.min(nB, NBA) // 便21: 建物ごとの形の種類と通りに面する向き（便23: 北の数・南の数の順に、形の種類の並び→向きの並び）
const BA = packB(0, nv, POFF, 0)
const bldg = write('bldg.bin', { pos: BA.bp, uv: BA.buv, bid: BA.bid, style: new Uint8Array(kyo.subarray(0, nBA)), front: new Uint8Array(kyo.subarray(nB, nB + nBA)) })

// ── 道・橋・小道・線路 ──
const ROAD_P = 0.045 // 便21: 中心（POFF）を引いてから詰める
const rb = rdD('geo/roads.bin'), rnvAll = geo.roads.nv, rniAll = geo.roads.ni, rnv = geo.roads.nvA ?? rnvAll
const rposAll = new Float32Array(rb.buffer.slice(rb.byteOffset, rb.byteOffset + rnvAll * 12)), ridxAll = new Uint32Array(rb.buffer.slice(rb.byteOffset + rnvAll * 12, rb.byteOffset + rnvAll * 12 + rniAll * 4)), rkindAll = new Uint8Array(rb.buffer.slice(rb.byteOffset + rnvAll * 12 + rniAll * 4, rb.byteOffset + rnvAll * 12 + rniAll * 4 + rnvAll))
let rni = 0; while (rni < rniAll && ridxAll[rni] < rnv) rni += 6 // 北の道の三角形（北の点だけを指す）が先
for (let i = rni; i < rniAll; i++) if (ridxAll[i] < rnv) throw new Error('道の並びが北・南の順でない')
const raux = rdD('geo/roads-aux.bin') // 便21: 道の長さの位置（float32）と幅（0.1m 刻み）
const ralAll = new Float32Array(raux.buffer.slice(raux.byteOffset, raux.byteOffset + rnvAll * 4)), rwdAll = new Uint8Array(raux.subarray(rnvAll * 4, rnvAll * 5))
const packR = (v0, v1, i0, i1, po) => { const rp16 = new Int16Array((v1 - v0) * 3); for (let i = 0; i < rp16.length; i++) rp16[i] = q16(rposAll[v0 * 3 + i] - po[i % 3], ROAD_P); const idx = ridxAll.subarray(i0, i1).map((v) => v - v0); return { pos: rp16, idx: v1 - v0 > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), kind: rkindAll.slice(v0, v1), along: ralAll.slice(v0, v1), width: rwdAll.slice(v0, v1) } } // 便21: 道の点が 65535 を超えたら並びを 32 ビットに
const roads = write('roads.bin', packR(0, rnv, 0, rni, POFF))

// ── 川の水面・木・飛び石・町家の庇（小さいので素の数のまま） ──
const wb = rdD('geo/water.bin'), wnvAll = geo.water.nv, wniAll = geo.water.ni, wnv = geo.water.nvA ?? wnvAll, wni = geo.water.niA ?? wniAll
const wposAll = new Float32Array(wb.buffer.slice(wb.byteOffset, wb.byteOffset + wnvAll * 12)), widxAll = new Uint32Array(wb.buffer.slice(wb.byteOffset + wnvAll * 12, wb.byteOffset + wnvAll * 12 + wniAll * 4))
const trAll = f32('geo/trees.bin'), stAll = f32('geo/stones.bin'), skAll = new Uint8Array(rdD('geo/stones-kind.bin')), eb = rdD('geo/eaves.bin'), enAll = geo.eaves.n
const eposAll = new Float32Array(eb.buffer.slice(eb.byteOffset, eb.byteOffset + enAll * 12)), ekAll = new Uint8Array(eb.subarray(enAll * 12, enAll * 13))
const tnA = geo.trees.nA ?? geo.trees.n, snA = geo.stones.nA ?? geo.stones.n, enA = geo.eaves.nA ?? enAll
const misc = write('misc.bin', {
  wpos: wposAll.slice(0, wnv * 3),
  widx: Uint16Array.from(widxAll.subarray(0, wni)),
  trees: trAll.slice(0, tnA * 6),
  stones: stAll.slice(0, snA * 4),
  stoneKind: skAll.slice(0, snA), // 便21: 石の形
  eaves: eposAll.slice(0, enA * 3), eaveKind: ekAll.slice(0, enA), // 便21: 町家の通り庇と犬矢来
})
// ── 便23: 南の四角（建物・道・水面・木・飛び石・町家の庇）を1つのファイルに ──
let south = null
if (RB) {
  const BB = packB(nv, nvAll, POFFB, NBA), RR = packR(rnv, rnvAll, rni, rniAll, POFFB)
  south = write('south.bin', {
    bpos: BB.bp, buv: BB.buv, bid: BB.bid, style: new Uint8Array(kyo.subarray(nBA, nB)), front: new Uint8Array(kyo.subarray(nB + nBA, nB * 2)),
    rpos: RR.pos, ridx: RR.idx, rkind: RR.kind, ralong: RR.along, rwidth: RR.width,
    wpos: wposAll.slice(wnv * 3), widx: Uint32Array.from(widxAll.subarray(wni), (v) => v - wnv),
    trees: trAll.slice(tnA * 6), stones: stAll.slice(snA * 4), stoneKind: skAll.slice(snA),
    eaves: eposAll.slice(enA * 3), eaveKind: ekAll.slice(enA),
  })
  log.push(`南の四角: 建物の角 ${nvAll - nv}・道の点 ${rnvAll - rnv}・水面の三角形 ${(wniAll - wni) / 3}・木 ${(trAll.length / 6) - tnA}・飛び石 ${(stAll.length / 4) - snA}・町家の庇の三角形 ${(enAll - enA) / 3}`)
}

// ── 焼いた光の図（灰色の JPEG）・質感の素材 ──
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args])
const size = (p) => (fs.statSync(p).size / 1e6).toFixed(2) + 'MB'
for (const k of ['terrain', 'bldg', ...(RB ? ['terrain2', 'bldg2'] : [])]) { // 便23: 南の四角の図（terrain2・bldg2）
  const src = `${D}/${BAKE}/lm_${k}.png`
  ff(['-i', src, '-pix_fmt', 'gray', '-q:v', '3', `${OUT}/lm_${k}.jpg`])
  ff(['-i', src, '-vf', 'scale=iw/2:ih/2:flags=area', '-pix_fmt', 'gray', '-q:v', '3', `${OUT}/lm_${k}_s.jpg`]) // 便21: 地形の図は横長なので縦横とも半分
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
  near: { nx: geo.near.nx, nz: geo.near.nz, x0: geo.near.x0, x1: geo.near.x1, z0: geo.near.z0, z1: geo.near.z1, step: geo.near.step, hStep: NEAR_H, ...(REG ? { regions: REG } : {}) }, // 便21: 四角の範囲。便23: regions＝北の四角（A）と南の四角（B）。網はその外接の四角で、和の外の升は描かない（南の四角は南を足した時だけ描く）
  far: { n: geo.far.n, R: geo.far.R, step: geo.far.step, hStep: FAR_H },
  bldg: { nv, pStep: BLDG_P, pOff: POFF, heights: geo.bldg.heights.slice(0, nBA) },
  roads: { nv: rnv, ni: rni, pStep: ROAD_P, pOff: POFF },
  water: { nv: wnv, ni: wni },
  trees: { n: tnA },
  stones: { n: snA, rows: geo.stones.rows }, // 便21: rows＝飛び石の列の両端
  weirs: geo.weirs, // 便21: 堰の線分
  riverPath: geo.riverPath, // 便21: 河川敷の小道の折れ線（歩く人・走る人・自転車）
  bridgeEdges: geo.bridgeEdges, lamps: geo.lamps, // 便21: 橋の欄干の線・街灯（x, y, z, 向き）
  marks: geo.marks, // 便21: 名所
  wdepthStep: 0.0025, // 便21: 水の深さの刻み（m）
  view: geo.views.window, // 角部屋の窓（西岸の建物の東の壁の上の階）。yawDeg＝窓の向き（北から東回りの度・便17 #5=1 の東）
  files: { terrain, bldg, roads, misc },
  tex: TEX,
  // 便23: 南の四角（本体の loadSouth が裏で読み、addSouth が足す）。建物の番号は南の中で 0 から・高さは heights
  ...(south ? { south: { file: south.file, secs: south.secs, region: RB, bldg: { nv: nvAll - nv, pStep: BLDG_P, pOff: POFFB, heights: geo.bldg.heights.slice(nBA) }, roads: { nv: rnvAll - rnv, ni: rniAll - rni, pStep: ROAD_P, pOff: POFFB }, water: { nv: wnvAll - wnv, ni: wniAll - wni }, trees: { n: trAll.length / 6 - tnA }, stones: { n: stAll.length / 4 - snA }, lm: { terrain: 'lm_terrain2', bldg: 'lm_bldg2' }, ...geo.south } } : {}),
}
fs.writeFileSync(`${OUT}/kamo.json`, JSON.stringify(meta))
let total = 0; for (const f of fs.readdirSync(OUT)) if (f !== 'tex') total += fs.statSync(`${OUT}/${f}`).size
log.push(`public/kamo（素材を除く）: ${(total / 1e6).toFixed(2)}MB`)
console.log(log.join('\n'))
