// 便22（外の町）: 鴨川の町の外側（西は金閣寺・南は京都駅と京都タワー・木屋町・河原町・祇園）を、本体（src/engine/kamoTown.js の addOuter）が読む形に組んで詰める。
// 入る物: scripts/kamo/_data/（outer-fetch.mjs が取る・git に入れない）と、今の鴨川の町の public/kamo/kamo.json（範囲と水面の高さ）
// 出る物: public/kamo/outer/（公開のページに入る。どれも原点＝鴨川デルタからのメートルだけ・★経緯度なし）
//   outer.json … 範囲・刻み・数・名所の位置・各ファイルの中の並び
//   terrain.bin … 8m 間隔の地形の網（鴨川の町の範囲の内側は 6m 下げて鴨川の町の網の下に隠す）と、地面の種類（0 町・1 緑・2 水の底・3 河川敷）
//   bldg.bin   … 建物ごとの向きのある箱（凸包に外接する一番小さい長方形・高さ・足もと・形の種類・通りの向き・屋根）と、箱に収まらない大きな建物の外形
//   roads.bin  … 道・橋・線路の帯／water.bin … 池・堀・水路（鴨川の本流は鴨川の町が描く）／trees.bin … 木
// 建物の形の種類（kamoTown.js の useKyo と同じ）: 0 今の家・1 京町家・2 古民家・3 集合住宅とビル・4 大きな施設・5 寺社
// 使い方: node scripts/kamo/outer-build.mjs
import fs from 'node:fs'
import zlib from 'node:zlib'
import { ShapeUtils, Vector2 } from 'three'

const D = process.env.KAMO_DATA || 'scripts/kamo/_data', OD = D + '/outer', PUB = 'public/kamo/outer'
fs.mkdirSync(PUB, { recursive: true })
const LAT0 = 35.0300, LON0 = 135.7725, phi = (LAT0 * Math.PI) / 180
const MLAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), MLON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)
const toX = (lon) => (lon - LON0) * MLON, toZ = (lat) => -(lat - LAT0) * MLAT
const toLon = (x) => LON0 + x / MLON, toLat = (z) => LAT0 - z / MLAT
const core = JSON.parse(fs.readFileSync('public/kamo/kamo.json', 'utf8'))
const C = { x0: core.near.x0, x1: core.near.x1, z0: core.near.z0, z1: core.near.z1 }
const OX = { x0: -4400, x1: 2400, z0: -1600, z1: 5408 }, STEP = 8 // 8m の網（鴨川の町の 4m の網の縁と点がそろう）。【便22】幅と奥行きは 16m の倍数（iPhone の段は網を1つおきに間引く＝奥行き 7000m では間引けずに NaN が出た）
const inCore = (x, z, m = 0) => x >= C.x0 + m && x <= C.x1 - m && z >= C.z0 + m && z <= C.z1 - m
const inOX = (x, z, m = 0) => x >= OX.x0 + m && x <= OX.x1 - m && z >= OX.z0 + m && z <= OX.z1 - m
const log = []
let rs = 22011; const R = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296 }

// ── 標高（build.mjs と同じほどき方） ──
function decodePNG(buf) {
  let o = 8, w, h, ct, plte = null; const idat = []
  while (o < buf.length) { const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len); if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9] } else if (type === 'PLTE') plte = data; else if (type === 'IDAT') idat.push(data); o += 12 + len }
  const bpp = ct === 2 ? 3 : ct === 6 ? 4 : 1, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(w * h * 3), cur = Buffer.alloc(stride), prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = line[i]; if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c } cur[i] = v & 255 }
    for (let x = 0; x < w; x++) { const di = (y * w + x) * 3; if (ct === 3) { const k = cur[x] * 3; out[di] = plte[k]; out[di + 1] = plte[k + 1]; out[di + 2] = plte[k + 2] } else { out[di] = cur[x * bpp]; out[di + 1] = cur[x * bpp + 1]; out[di + 2] = cur[x * bpp + 2] } }
    cur.copy(prev)
  }
  return { w, h, rgb: out }
}
function mosaic(dir, t) {
  const nx = t.x1 - t.x0 + 1, ny = t.y1 - t.y0 + 1, W = nx * 256, H = ny * 256, a = new Float32Array(W * H).fill(NaN)
  for (let tx = t.x0; tx <= t.x1; tx++) for (let ty = t.y0; ty <= t.y1; ty++) {
    const f = `${D}/${dir}/${t.z}_${tx}_${ty}.png`; if (!fs.existsSync(f)) continue
    const p = decodePNG(fs.readFileSync(f))
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 3, v = p.rgb[i] * 65536 + p.rgb[i + 1] * 256 + p.rgb[i + 2]; a[((ty - t.y0) * 256 + y) * W + (tx - t.x0) * 256 + x] = v === 8388608 ? NaN : v < 8388608 ? v * 0.01 : (v - 16777216) * 0.01 }
  }
  const n = 2 ** t.z
  return (lat, lon) => {
    const px = ((lon + 180) / 360) * n * 256 - t.x0 * 256 - 0.5, py = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n * 256 - t.y0 * 256 - 0.5
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) return NaN
    const g = (x, y) => a[y * W + x], v = [g(x0, y0), g(x0 + 1, y0), g(x0, y0 + 1), g(x0 + 1, y0 + 1)]
    if (v.some(Number.isNaN)) { const c = v.filter((q) => !Number.isNaN(q)); return c.length ? c.reduce((s, q) => s + q, 0) / c.length : NaN }
    return (v[0] * (1 - fx) + v[1] * fx) * (1 - fy) + (v[2] * (1 - fx) + v[3] * fx) * fy
  }
}
const H5 = mosaic('dem5', JSON.parse(fs.readFileSync(`${OD}/dem-tiles.json`, 'utf8')).dem5), H10 = mosaic('dem10', JSON.parse(fs.readFileSync(`${D}/dem-tiles.json`, 'utf8')).dem10)
const Hraw = (x, z) => { const la = toLat(z), lo = toLon(x), v = H5(la, lo); return Number.isNaN(v) ? H10(la, lo) : v }
const H0 = Hraw(0, 0)
if (Math.abs(H0 - 53.5) > 0.02) throw new Error('基準の高さが鴨川の町と違う: ' + H0)
const ground = (x, z) => Hraw(x, z) - H0

// ── OpenStreetMap ──
const osm = JSON.parse(fs.readFileSync(`${OD}/osm.json`, 'utf8')).elements
const tag = (e, k) => (e.tags || {})[k]
const P = (g) => g.map((p) => [toX(p.lon), toZ(p.lat)])
function rings(el) {
  if (el.type === 'way') return el.geometry ? [P(el.geometry)] : []
  const segs = (el.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => P(m.geometry)), out = [], used = new Array(segs.length).fill(false)
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue; used[s] = true; let ring = segs[s].slice()
    for (let guard = 0; guard < segs.length && !same(ring[0], ring[ring.length - 1]); guard++) { let hit = false; for (let t = 0; t < segs.length; t++) { if (used[t]) continue; const g = segs[t]; if (same(ring[ring.length - 1], g[0])) { ring = ring.concat(g.slice(1)); used[t] = hit = true } else if (same(ring[ring.length - 1], g[g.length - 1])) { ring = ring.concat(g.slice(0, -1).reverse()); used[t] = hit = true } if (hit) break } if (!hit) break }
    out.push(ring)
  }
  return out
}
const pip = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c } return c }
const bboxOf = (r) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return { x0, x1, z0, z1 } }
// 面を升に入れて、点がどれかの面の中にあるかを速く引く
function polyIndex(polys, cell = 100) {
  const m = new Map(); polys.forEach((r, n) => { const b = bboxOf(r); r.b = b; for (let i = Math.floor(b.x0 / cell); i <= Math.floor(b.x1 / cell); i++) for (let j = Math.floor(b.z0 / cell); j <= Math.floor(b.z1 / cell); j++) { const k = i * 100003 + j; let a = m.get(k); if (!a) { a = []; m.set(k, a) } a.push(n) } })
  return (x, z) => { const a = m.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell)); if (!a) return -1; for (const n of a) { const r = polys[n], b = r.b; if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && pip([x, z], r)) return n } return -1 }
}

// ── 水: 池・堀・水路（面）と、面の無い細い水路（線＝帯）。鴨川の本流と高野川・賀茂川は鴨川の町が描いている（鴨川の町の範囲の 180m 内に点がある面は描かない） ──
const coreBox = (x, z) => x >= C.x0 - 180 && x <= C.x1 + 180 && z >= C.z0 - 180 && z <= C.z1 + 180
const waterPolys = [], waterAll = []
for (const e of osm) {
  if (!(tag(e, 'natural') === 'water' || tag(e, 'waterway') === 'riverbank')) continue
  for (const r of rings(e)) {
    if (r.length < 4) continue
    const b = bboxOf(r); if (b.x1 < OX.x0 || b.x0 > OX.x1 || b.z1 < OX.z0 || b.z0 > OX.z1) continue
    const river = /river|stream/.test(tag(e, 'water') || '') || tag(e, 'waterway') === 'riverbank'
    waterAll.push(r)
    if (river && r.some(([x, z]) => coreBox(x, z))) continue // 鴨川の町が描く川
    waterPolys.push({ r, river, name: tag(e, 'name') || '' })
  }
}
const inWater = polyIndex(waterAll.map((r) => r.slice()))
const waterAt = (x, z) => { let m = 1e9; for (let dz = -16; dz <= 16; dz += 4) for (let dx = -16; dx <= 16; dx += 4) { const g = ground(x + dx, z + dz); if (!Number.isNaN(g)) m = Math.min(m, g) } return m === 1e9 ? ground(x, z) : m + 0.2 }

// ── 地形の網（8m）。鴨川の町の範囲の内側（縁から 4m より内）は 6m 下げて隠す。水の中は水面の下へ ──
const nx = Math.round((OX.x1 - OX.x0) / STEP) + 1, nz = Math.round((OX.z1 - OX.z0) / STEP) + 1
const hs = new Float32Array(nx * nz), zone = new Uint8Array(nx * nz), polyW = new Uint8Array(nx * nz) // polyW＝水の面（川・池・堀）の中の点（水路の帯は入れない）
const greens = []; for (const e of osm) { const lu = tag(e, 'landuse'), le = tag(e, 'leisure'), na = tag(e, 'natural'); if (/^(forest|grass|recreation_ground|cemetery|meadow)$/.test(lu || '') || /^(park|garden|pitch|playground)$/.test(le || '') || /^(wood|scrub)$/.test(na || '')) for (const r of rings(e)) if (r.length > 3) greens.push(Object.assign(r, { kind: /^(forest)$/.test(lu || '') || /^(wood|scrub)$/.test(na || '') ? 'forest' : le === 'park' || le === 'garden' ? 'park' : 'grass' })) }
const inGreen = polyIndex(greens)
let nWet = 0
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const k = j * nx + i, x = OX.x0 + i * STEP, z = OX.z0 + j * STEP
  let y = ground(x, z); if (Number.isNaN(y)) y = 0
  if (inWater(x, z) >= 0) { y = waterAt(x, z) - 1.0; zone[k] = 2; polyW[k] = 1; nWet++ } else if (inGreen(x, z) >= 0) zone[k] = 1
  if (inCore(x, z, 4)) y -= 6
  hs[k] = y
}
// 河川敷: 水の点から、水面＋3.5m より低い所を 60m まで広げる（鴨川の南・白川・高瀬川の岸）
{ const q = [], wl = new Float32Array(nx * nz), dist = new Float32Array(nx * nz).fill(1e9)
  for (let k = 0; k < nx * nz; k++) if (zone[k] === 2) { q.push(k); dist[k] = 0; wl[k] = hs[k] + 1.0 }
  for (let h = 0; h < q.length; h++) { const k = q[h], i = k % nx, j = (k - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const kk = jj * nx + ii, d = dist[k] + STEP; if (zone[kk] === 2 || dist[kk] <= d || d > 60) continue; const x = OX.x0 + ii * STEP, z = OX.z0 + jj * STEP; if (inCore(x, z, 4) || hs[kk] > wl[k] + 3.5) continue; zone[kk] = 3; dist[kk] = d; wl[kk] = wl[k]; q.push(kk) } } }
log.push(`外の町の地形: ${nx}×${nz} 点（${STEP}m 間隔・x ${OX.x0}〜${OX.x1}・z ${OX.z0}〜${OX.z1}）・水の点 ${nWet}・緑の面 ${greens.length}`)

// 水面の三角形（面）。鴨川の町の範囲の中に入る三角形は落とす（池は面の全体が外なら全部）
const wpos = [], widx = [], wkind = []
let nWaterPoly = 0
for (const w of (process.env.OUTER_POLYWATER ? waterPolys : [])) { // 【便22】川の面の輪は三角形分けで崩れ（町の上に水の板がかかった）、網から作る形にした（下の「水面の網」）
  let pts = w.r.slice(0, Math.hypot(w.r[0][0] - w.r[w.r.length - 1][0], w.r[0][1] - w.r[w.r.length - 1][1]) < 0.01 ? -1 : undefined)
  if (pts.length < 3) continue
  const ys = pts.map(([x, z]) => waterAt(x, z)), flat = !w.river
  let lvl = 0; if (flat) { const s = ys.slice().sort((a, b) => a - b); lvl = s[Math.floor(s.length / 2)] }
  const base = wpos.length / 3
  pts.forEach(([x, z], n) => { wpos.push(x, flat ? lvl : ys[n], z) })
  for (const t of ShapeUtils.triangulateShape(pts.map(([x, z]) => new Vector2(x, z)), [])) {
    const cx = (pts[t[0]][0] + pts[t[1]][0] + pts[t[2]][0]) / 3, cz = (pts[t[0]][1] + pts[t[1]][1] + pts[t[2]][1]) / 3
    if (inCore(cx, cz)) continue
    widx.push(base + t[0], base + t[1], base + t[2])
  }
  for (let n = 0; n < pts.length; n++) wkind.push(flat ? 1 : 0)
  nWaterPoly++
}
// 細い水路（線）: 高瀬川・白川・琵琶湖疏水の分線など。面の中に無い所だけ帯にする（幅は tag の width か 既定 高瀬川 7m・ほか 4m）
let nCanal = 0
for (const e of osm) {
  if (e.type !== 'way' || !e.geometry) continue
  const ww = tag(e, 'waterway'); if (!/^(canal|stream|river|ditch|drain)$/.test(ww || '')) continue
  if (tag(e, 'tunnel') || tag(e, 'layer') && +tag(e, 'layer') < 0 || tag(e, 'covered') === 'yes') continue
  const nm = tag(e, 'name') || '', W = +(tag(e, 'width') || 0) || (/高瀬川/.test(nm) ? 7 : /白川/.test(nm) ? 5 : ww === 'river' ? 8 : ww === 'canal' ? 5 : 3)
  const pts = P(e.geometry), dense = []
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 6)); for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]) }
  dense.push(pts[pts.length - 1])
  let run = []
  const flush = () => {
    if (run.length >= 2) {
      const base = wpos.length / 3
      for (let i = 0; i < run.length; i++) { const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; const [x, z] = run[i], y = waterAt(x, z) - 0.6; wpos.push(x - dz * W / 2, y, z + dx * W / 2, x + dz * W / 2, y, z - dx * W / 2); wkind.push(2, 2) }
      for (let i = 0; i < run.length - 1; i++) { const a = base + i * 2; widx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
      // 水路の底を下げる（網の点で、帯の中の点）
      for (const [x, z] of run) { const i = Math.round((x - OX.x0) / STEP), j = Math.round((z - OX.z0) / STEP); for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) { const ii = i + a, jj = j + c; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const px = OX.x0 + ii * STEP, pz = OX.z0 + jj * STEP; if (Math.hypot(px - x, pz - z) > W / 2 + 2 || inCore(px, pz, 4)) continue; const k = jj * nx + ii; hs[k] = Math.min(hs[k], waterAt(x, z) - 1.6); zone[k] = 2 } }
      nCanal++
    }
    run = []
  }
  for (const p of dense) { if (!inOX(p[0], p[1], 8) || inCore(p[0], p[1], -6) || inWater(p[0], p[1]) >= 0) flush(); else run.push(p) }
  flush()
}
// 水面の網: 8m の升の角の 2 つ以上が水の面の中なら、その升に水面を張る。高さは水の点の川底＋1.0m（＝まわりの低い所＋0.2m）。鴨川の町の範囲の中の升は張らない
{ const vid = new Int32Array(nx * nz).fill(-1)
  const lvl = (k) => hs[k] + 1.0
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const ks = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1], w = ks.filter((k) => polyW[k])
    if (w.length < 2) continue
    const cx = OX.x0 + (i + 0.5) * STEP, cz = OX.z0 + (j + 0.5) * STEP; if (inCore(cx, cz)) continue
    const avg = w.reduce((a, k) => a + lvl(k), 0) / w.length
    const id = ks.map((k) => { if (polyW[k] && vid[k] >= 0) return vid[k]; const kk = k, ii = kk % nx, jj = (kk - ii) / nx; wpos.push(OX.x0 + ii * STEP, polyW[kk] ? lvl(kk) : avg, OX.z0 + jj * STEP); wkind.push(0); const n = wpos.length / 3 - 1; if (polyW[kk]) vid[kk] = n; return n })
    widx.push(id[0], id[2], id[1], id[1], id[2], id[3])
  }
}
log.push(`外の町の水: 池・堀の面 ${nWaterPoly}・水路の帯 ${nCanal}・三角形 ${widx.length / 3}`)

// ── 道・橋・線路（帯）。鴨川の町の範囲の中は描かない ──
const ROADW = { trunk: 16, primary: 15, secondary: 12, tertiary: 9, unclassified: 6, residential: 5, living_street: 4, pedestrian: 5, service: 3.5 }
const rpos = [], ridx = [], rkind = [], ralong = [], rwidth = [], roadPts = [], rruns = [] // rruns＝帯ごとの点の数（三角形の並びは本体が組み直す）
let nRoad = 0, nBr = 0
for (const e of osm) {
  if (e.type !== 'way' || !e.geometry) continue
  const hw = tag(e, 'highway'), rw = tag(e, 'railway')
  if (!(hw in ROADW) && !/^(rail|light_rail|tram)$/.test(rw || '')) continue
  if (tag(e, 'tunnel') || (tag(e, 'layer') && +tag(e, 'layer') < 0) || tag(e, 'location') === 'underground') continue
  if (hw === 'service' && !/alley|driveway/.test(tag(e, 'service') || '') && !tag(e, 'name')) continue // 名の無い駐車場の中の道などは描かない
  if (hw === 'service' && /driveway|parking_aisle/.test(tag(e, 'service') || '')) continue
  const bridge = tag(e, 'bridge') === 'yes'
  const w = rw ? 4.2 : +(tag(e, 'width') || 0) || ROADW[hw] * (tag(e, 'lanes') && +tag(e, 'lanes') >= 4 ? 1.25 : 1), kind = rw ? 3 : bridge ? 2 : hw === 'pedestrian' ? 1 : 0
  const pts = P(e.geometry), dense = []
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 6)); for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]) }
  dense.push(pts[pts.length - 1])
  let run = []
  const flush = () => {
    if (run.length >= 2) {
      const ys = run.map(([x, z]) => ground(x, z))
      if (kind === 2) { const y0 = ys[0], y1 = ys[ys.length - 1]; for (let i = 0; i < ys.length; i++) { const lin = y0 + ((y1 - y0) * i) / (ys.length - 1); ys[i] = Math.max(lin, inWater(run[i][0], run[i][1]) >= 0 ? waterAt(run[i][0], run[i][1]) + 3 : lin) + 0.5 } nBr++ } else nRoad++
      const base = rpos.length / 3; let acc = 0
      for (let i = 0; i < run.length; i++) {
        const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l
        const nxx = -dz * w * 0.5, nzz = dx * w * 0.5, [x, z] = run[i], lift = kind === 2 ? 0 : 0.3
        if (i) acc += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1])
        const yl = kind === 2 ? ys[i] : ground(x + nxx, z + nzz) + lift, yr = kind === 2 ? ys[i] : ground(x - nxx, z - nzz) + lift
        rpos.push(x + nxx, Number.isNaN(yl) ? ys[i] : yl, z + nzz, x - nxx, Number.isNaN(yr) ? ys[i] : yr, z - nzz); rkind.push(kind, kind); ralong.push(acc, acc); rwidth.push(Math.min(255, Math.round(w * 10)), Math.min(255, Math.round(w * 10)))
        if (kind === 0 || kind === 1) roadPts.push(x, z)
      }
      for (let i = 0; i < run.length - 1; i++) { const a = base + i * 2; ridx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
      rruns.push(run.length)
    }
    run = []
  }
  for (const p of dense) { if (!inOX(p[0], p[1], 6) || inCore(p[0], p[1], -3)) flush(); else run.push(p) }
  flush()
}
log.push(`外の町の道: 道 ${nRoad}・橋 ${nBr}・点 ${rpos.length / 3}`)
const RC = 12, rcell = new Map(); for (let i = 0; i < roadPts.length; i += 2) { const k = Math.floor(roadPts[i] / RC) * 100003 + Math.floor(roadPts[i + 1] / RC); let a = rcell.get(k); if (!a) { a = []; rcell.set(k, a) } a.push(roadPts[i], roadPts[i + 1]) }
const nearRoad = (x, z) => { let best = null, bd = 1e9; const ci = Math.floor(x / RC), cj = Math.floor(z / RC); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const arr = rcell.get((ci + a) * 100003 + cj + b); if (!arr) continue; for (let q = 0; q < arr.length; q += 2) { const d = Math.hypot(arr[q] - x, arr[q + 1] - z); if (d < bd) { bd = d; best = [arr[q], arr[q + 1]] } } } return best ? { d: bd, x: best[0], z: best[1] } : null }

// ── 名所の位置（本体の名所の部品が形を作る）。OSM の名で探し、見つからない時は調べの経緯度の値（原点からの m） ──
const named = (re, pred = () => true) => osm.filter((e) => (re.test(tag(e, 'name') || '') || re.test(tag(e, 'name:ja') || '')) && pred(e))
const center = (e) => { if (e.type === 'node') return [toX(e.lon), toZ(e.lat)]; const r = rings(e).find((q) => q.length > 2); if (!r) return null; let x = 0, z = 0; const n = r.length - (Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 0.01 ? 1 : 0); for (let i = 0; i < n; i++) { x += r[i][0]; z += r[i][1] } return [x / n, z / n] }
// 外形の向き（一番長い辺の向き）と大きさ
const obbRing = (r) => obb(r.map(([x, z]) => [x, z]))
function hull(pts) { const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) } for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) } up.pop(); lo.pop(); return lo.concat(up) }
function obb(pts) { // 凸包に外接する一番小さい長方形（辺の向きを1つずつ試す）
  const h = hull(pts); if (h.length < 3) { const b = bboxOf(pts); return { cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2, w: Math.max(1, b.x1 - b.x0), d: Math.max(1, b.z1 - b.z0), ang: 0, area: 1, hullArea: 1 } }
  let best = null
  for (let i = 0; i < h.length; i++) { const [ax, az] = h[i], [bx, bz] = h[(i + 1) % h.length], ang = Math.atan2(bz - az, bx - ax), c = Math.cos(ang), s = Math.sin(ang); let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const [x, z] of h) { const u = x * c + z * s, v = -x * s + z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v) } const area = (u1 - u0) * (v1 - v0); if (!best || area < best.area) { const um = (u0 + u1) / 2, vm = (v0 + v1) / 2; best = { cx: um * c - vm * s, cz: um * s + vm * c, w: u1 - u0, d: v1 - v0, ang, area } } }
  let ha = 0; for (let i = 0; i < h.length; i++) { const [ax, az] = h[i], [bx, bz] = h[(i + 1) % h.length]; ha += ax * bz - bx * az } best.hullArea = Math.abs(ha) / 2
  if (best.w < best.d) { const t = best.w; best.w = best.d; best.d = t; best.ang += Math.PI / 2 } // w を長い辺に
  best.ang = ((best.ang % Math.PI) + Math.PI) % Math.PI
  return best
}
const pick = (list) => list.map((e) => ({ e, c: center(e) })).filter((q) => q.c && inOX(q.c[0], q.c[1]))
const marks = {}
const setMark = (k, list, fb, extra = {}) => { const q = pick(list)[0]; const c = q ? q.c : fb; if (!c) return; const r = q && q.e.type !== 'node' ? rings(q.e).find((x) => x.length > 3) : null, o = r ? obbRing(r) : null; marks[k] = { x: +c[0].toFixed(1), y: +ground(c[0], c[1]).toFixed(2), z: +c[1].toFixed(1), ang: o ? +o.ang.toFixed(3) : 0, w: o ? +o.w.toFixed(1) : 0, d: o ? +o.d.toFixed(1) : 0, src: q ? `osm ${q.e.type}/${q.e.id}` : '調べの経緯度', ...extra } }
const ll = (lat, lon) => [toX(lon), toZ(lat)]
setMark('kinkaku', named(/^(金閣|舎利殿|金閣（舎利殿）|鹿苑寺金閣)$/), ll(35.03937, 135.72924))
setMark('kyokochi', named(/^鏡湖池$/), ll(35.03917, 135.72905))
setMark('tower', named(/^京都タワー$/, (e) => e.type !== 'node' || true), ll(34.98756, 135.75939))
setMark('station', named(/^(京都駅ビル|京都駅)$/, (e) => !!tag(e, 'building')), ll(34.98589, 135.75878))
setMark('romon', named(/西楼門/), ll(35.00369, 135.77757))
setMark('yasakaTo', named(/八坂の塔|法観寺/, (e) => e.type !== 'node' || true), ll(34.99862, 135.77924))
setMark('minamiza', named(/^南座$/), ll(35.00377, 135.77245))
setMark('heianTorii', named(/平安神宮.*大鳥居|^大鳥居$/), ll(35.01417, 135.78258))
setMark('otenmon', named(/^応天門$/), ll(35.01487, 135.78296))
log.push(`名所: ${Object.entries(marks).map(([k, v]) => `${k}（x ${v.x}・z ${v.z}・${v.src}）`).join('・')}`)
// 名所の近くの建物の箱は描かない（名所の部品が形を作る）。半径 m
const MARK_CLEAR = { kinkaku: 14, tower: 22, romon: 12, yasakaTo: 9, heianTorii: 6, otenmon: 18, minamiza: 0, station: 0 }

// ── PLATEAU の建物 → 向きのある箱（と、箱に収まらない大きな建物の外形） ──
const src = fs.readFileSync('node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js', 'utf8')
const mod = { exports: {} }; new Function('module', 'exports', 'require', '__dirname', src)(mod, mod.exports, () => ({}), process.cwd())
const draco = await mod.exports()
const A = 6378137, E2 = 6.69437999014e-3
function ecef2geo(x, y, z) { const p = Math.hypot(x, y), lon = Math.atan2(y, x); let lat = Math.atan2(z, p * (1 - E2)), h = 0; for (let i = 0; i < 5; i++) { const N = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2); h = p / Math.cos(lat) - N; lat = Math.atan2(z, p * (1 - (E2 * N) / (N + h))) } return [(lat * 180) / Math.PI, (lon * 180) / Math.PI, h] }
const list = JSON.parse(fs.readFileSync(`${OD}/bldg-list.json`, 'utf8'))
const seen = new Set(), blds = []
for (const w of list) for (const t of [...w.tiles].sort((a, b) => b.depth - a.depth)) {
  const b = fs.readFileSync(t.file), ftj = b.readUInt32LE(12), ftb = b.readUInt32LE(16), btj = b.readUInt32LE(20), btb = b.readUInt32LE(24)
  const bt = JSON.parse(b.toString('utf8', 28 + ftj + ftb, 28 + ftj + ftb + btj))
  const g = b.subarray(28 + ftj + ftb + btj + btb), jl = g.readUInt32LE(12), gj = JSON.parse(g.toString('utf8', 20, 20 + jl)), bin = g.subarray(20 + jl + 8)
  const rtc = gj.extensions.CESIUM_RTC.center
  for (const mesh of gj.meshes) for (const pr of mesh.primitives) {
    const ext = pr.extensions.KHR_draco_mesh_compression, bv = gj.bufferViews[ext.bufferView]
    const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)
    const dec = new draco.Decoder(), buf = new draco.DecoderBuffer(); buf.Init(new Int8Array(data), data.length)
    const m = new draco.Mesh(); const st = dec.DecodeBufferToMesh(buf, m); if (!st.ok()) throw new Error('draco ' + st.error_msg())
    const nv = m.num_points(), nf = m.num_faces()
    const getAttr = (id, comps) => { const at = dec.GetAttributeByUniqueId(m, id), arr = new draco.DracoFloat32Array(); dec.GetAttributeFloatForAllPoints(m, at, arr); const o = new Float32Array(nv * comps); for (let i = 0; i < nv * comps; i++) o[i] = arr.GetValue(i); draco.destroy(arr); return o }
    const pos = getAttr(ext.attributes.POSITION, 3), bid = getAttr(ext.attributes._BATCHID, 1)
    draco.destroy(m); draco.destroy(buf); draco.destroy(dec)
    const byB = new Map()
    for (let i = 0; i < nv; i++) { const k = Math.round(bid[i]); let a = byB.get(k); if (!a) { a = []; byB.set(k, a) } a.push(i) }
    for (const [k, vs] of byB) {
      const id = bt.gml_id[k]; if (seen.has(id)) continue
      const pts = [], hy = []
      for (const v of vs) { const [la, lo, h] = ecef2geo(rtc[0] + pos[v * 3], rtc[1] - pos[v * 3 + 2], rtc[2] + pos[v * 3 + 1]); pts.push([toX(lo), toZ(la)]); hy.push(h) }
      let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z } cx /= pts.length; cz /= pts.length
      seen.add(id)
      if (!inOX(cx, cz, 10) || inCore(cx, cz, 100)) continue // 鴨川の町が描く建物（範囲の縁から 100m 内側＝build.mjs の BLDG_M）は除く
      let y0 = 1e9, y1 = -1e9; for (const h of hy) { y0 = Math.min(y0, h); y1 = Math.max(y1, h) }
      blds.push({ pts, cx, cz, ht: y1 - y0, h: bt['bldg:measuredHeight'] ? bt['bldg:measuredHeight'][k] : null, usage: bt['bldg:usage'] ? bt['bldg:usage'][k] : null })
    }
  }
}
log.push(`PLATEAU の建物（外の町）: ${blds.length} 棟`)
// 形の種類と通りの向き（build.mjs の便21 の決めを写した。乱数は別）
const worship = []; for (const e of osm) if (tag(e, 'amenity') === 'place_of_worship' || tag(e, 'landuse') === 'religious') for (const r of rings(e)) if (r.length > 3) worship.push(r)
const inWorship = polyIndex(worship)
const BC = 20, bcell = new Map()
const O = blds.map((b, n) => { const o = obb(b.pts); for (let a = Math.floor((o.cx - o.w / 2) / BC); a <= Math.floor((o.cx + o.w / 2) / BC); a++) for (let c = Math.floor((o.cz - o.w / 2) / BC); c <= Math.floor((o.cz + o.w / 2) / BC); c++) { const k = a * 100003 + c; let l = bcell.get(k); if (!l) { l = []; bcell.set(k, l) } l.push(n) } return o })
const GION = (x, z) => x > 250 && x < 1000 && z > 2700 && z < 3700 // 祇園（花見小路・新橋・八坂のあたり）＝町家が多い
const PONTO = (x, z) => x > -260 && x < -40 && z > 2050 && z < 3150 // 木屋町と先斗町のあいだ＝町家とお茶屋が多い
const style = new Uint8Array(blds.length), front = new Uint8Array(blds.length), roof = new Uint8Array(blds.length)
const cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], cntR = [0, 0, 0]
let nPoly = 0, nDrop = 0
const keepB = new Uint8Array(blds.length).fill(1)
blds.forEach((b, n) => {
  const o = O[n], h = b.h ?? b.ht, u = b.usage || '', fp = o.hullArea
  for (const [k, rr] of Object.entries(MARK_CLEAR)) { const m = marks[k]; if (m && rr && Math.hypot(o.cx - m.x, o.cz - m.z) < rr) { keepB[n] = 0; nDrop++; return } }
  const r = nearRoad(o.cx, o.cz)
  front[n] = r ? Math.round(((Math.atan2(r.x - o.cx, r.z - o.cz) + Math.PI) / (2 * Math.PI)) * 255) : 0
  let attached = 0
  for (let a = Math.floor((o.cx - o.w / 2) / BC); a <= Math.floor((o.cx + o.w / 2) / BC); a++) for (let c = Math.floor((o.cz - o.w / 2) / BC); c <= Math.floor((o.cz + o.w / 2) / BC); c++) for (const m of bcell.get(a * 100003 + c) || []) { if (m === n) continue; const q = O[m]; if (Math.hypot(q.cx - o.cx, q.cz - o.cz) < (q.w + o.w) / 2 + 0.9) { attached++; break } }
  const holy = inWorship(o.cx, o.cz) >= 0
  let s = 0
  if (holy && fp > 60 && fp < 2500 && h < 20) s = 5
  else if (h > 12 || /共同住宅/.test(u) && h > 8) s = 3
  else if (fp > 700 || /文教|官公庁|業務|商業施設|運輸|工場|供給/.test(u)) s = 4
  if (s === 0 && h <= 10.5 && fp > 12 && fp < 260 && /住宅|不明|その他|店舗/.test(u || '不明')) {
    const west = o.cx < -60, row = attached >= 1 && r && r.d < 9, p = GION(o.cx, o.cz) || PONTO(o.cx, o.cz) ? 0.85 : west ? 0.55 : 0.35
    if (row && R() < p + (/店舗/.test(u) ? 0.1 : 0)) s = 1
    else if (R() < 0.25) s = 2
  }
  // 便22: ガラスの外壁（形の種類 9）: 京都駅ビル（駅の輪郭の中）と、高さ 30m 以上の事務所・店の半分
  if (marks.station && Math.hypot(o.cx - marks.station.x, o.cz - marks.station.z) < 250 && h > 25) s = 9
  else if (s === 3 && h >= 30 && /業務|商業/.test(u) && R() < 0.6) s = 9
  style[n] = s; cnt[s] = (cnt[s] || 0) + 1
  // 屋根: 家と町家と古民家と寺社は切妻か寄棟（1 切妻・2 寄棟）。町家は通りに平行な棟。ほかは平ら
  if (s === 1) roof[n] = 1; else if (s === 2 || s === 5) roof[n] = 2; else if (s === 0) roof[n] = R() < 0.45 ? 2 : 1; else roof[n] = 0
  cntR[roof[n]]++
})
log.push(`外の町の家並み: 今の家 ${cnt[0]}・町家 ${cnt[1]}・古民家 ${cnt[2]}・集合住宅とビル ${cnt[3]}・大きな施設 ${cnt[4]}・寺社 ${cnt[5]}・ガラスの外壁 ${cnt[9]}・屋根 平ら ${cntR[0]}・切妻 ${cntR[1]}・寄棟 ${cntR[2]}・名所の所で除いた ${nDrop}`)

// 詰める: 箱（大多数）と外形（箱に 7 割しか埋まらない大きな建物＝駅ビルなど・頂点 48 まで）
const q16 = (v, s) => { const r = Math.round(v / s); if (r < -32768 || r > 32767) throw new Error(`16 ビットに収まらない ${v}/${s}`); return r }
const boxes = [], polys = [], polyPts = []
blds.forEach((b, n) => {
  if (!keepB[n]) return
  const o = O[n], h = Math.max(2.5, b.h ?? b.ht), base = (() => { let m = 1e9; for (const [x, z] of [[o.cx, o.cz], ...hull(b.pts).slice(0, 8)]) { const g = ground(x, z); if (!Number.isNaN(g)) m = Math.min(m, g) } return m === 1e9 ? 0 : m - 0.2 })()
  const fill = o.hullArea / Math.max(1, o.w * o.d)
  if (o.w * o.d > 1500 && fill < 0.7) { // 外形のまま（凸包を 48 点までに間引く）
    let hp = hull(b.pts); while (hp.length > 48) hp = hp.filter((_, i) => i % 2 === 0)
    polys.push(q16(base, 0.05), Math.min(65535, Math.round(h / 0.05)), style[n], front[n], hp.length, polyPts.length / 2); for (const [x, z] of hp) polyPts.push(q16(x, 0.25), q16(z, 0.25)); nPoly++
    return
  }
  boxes.push(q16(o.cx, 0.25), q16(o.cz, 0.25), Math.min(65535, Math.round(o.w / 0.05)), Math.min(65535, Math.round(o.d / 0.05)), Math.min(65535, Math.round(h / 0.05)), q16(base, 0.05), Math.round((o.ang / Math.PI) * 65535) & 65535, style[n] | (roof[n] << 4), front[n])
})
log.push(`外の町の建物を詰めた: 箱 ${boxes.length / 9}・外形 ${nPoly}`)

// ── 木（森・公園・庭・木の点・並木）。外の町の範囲で、鴨川の町の範囲の外だけ ──
const trees = []
for (const r of greens) {
  const b = r.b || bboxOf(r); if (b.x1 < OX.x0 || b.x0 > OX.x1 || b.z1 < OX.z0 || b.z0 > OX.z1) continue
  const area = (b.x1 - b.x0) * (b.z1 - b.z0), per = r.kind === 'forest' ? 110 : r.kind === 'park' ? 240 : 900, n = Math.min(r.kind === 'forest' ? 9000 : 3000, Math.round(area / per))
  for (let i = 0; i < n; i++) { const x = b.x0 + R() * (b.x1 - b.x0), z = b.z0 + R() * (b.z1 - b.z0); if (!inOX(x, z, 4) || inCore(x, z, -2) || !pip([x, z], r) || inWater(x, z) >= 0) continue; const big = r.kind === 'forest'; trees.push(x, ground(x, z), z, big ? 12 + R() * 12 : 7 + R() * 7, big ? 7 + R() * 6 : 5 + R() * 5, big ? 2 : 0) }
}
for (const e of osm) {
  if (e.type === 'node' && tag(e, 'natural') === 'tree') { const x = toX(e.lon), z = toZ(e.lat); if (inOX(x, z, 4) && !inCore(x, z, -2)) trees.push(x, ground(x, z), z, 6 + R() * 5, 5 + R() * 3, /Salix|柳/.test(tag(e, 'species') || tag(e, 'species:ja') || '') ? 1 : 0) }
  if (e.type === 'way' && tag(e, 'natural') === 'tree_row' && e.geometry) { const pts = P(e.geometry); for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 9); for (let k = 0; k <= n; k++) { const x = ax + ((bx - ax) * k) / Math.max(1, n), z = az + ((bz - az) * k) / Math.max(1, n); if (inOX(x, z, 4) && !inCore(x, z, -2)) trees.push(x, ground(x, z), z, 6 + R() * 4, 6 + R() * 3, 1) } } }
}
// 高瀬川（木屋町）の並木: 柳と桜を 9m おきに（地図に並木の線が無くても）
for (const e of osm) if (e.type === 'way' && /高瀬川/.test(tag(e, 'name') || '') && /canal|river|stream/.test(tag(e, 'waterway') || '') && e.geometry) { const pts = P(e.geometry); let acc = 0; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az); for (let s = 0; s < L; s += 1) { acc += 1; if (acc < 9) continue; acc = 0; const t = s / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t, nxx = -(bz - az) / L, nzz = (bx - ax) / L, side = R() < 0.5 ? 1 : -1, px = x + nxx * 5.2 * side, pz = z + nzz * 5.2 * side; if (inOX(px, pz, 4) && !inCore(px, pz, -2)) trees.push(px, ground(px, pz), pz, 6 + R() * 2.5, 6 + R() * 2, 1) } } }
// 便22: 名所のまわりは木を空ける（裕也さん「金閣寺隠れちゃってるね」＝森の木が金閣の手前と両脇を覆った）。金閣寺の庭（金閣から 160m 以内）は、庭の松くらいの高さ（6〜11m）に抑える
{ const CLEAR = { kinkaku: 28, romon: 12, yasakaTo: 12, heianTorii: 20, otenmon: 22, tower: 30 }, out = []; let nCut = 0, nLow = 0
  for (let i = 0; i < trees.length; i += 6) {
    const x = trees[i], z = trees[i + 2]
    if (Object.entries(CLEAR).some(([k, r]) => marks[k] && Math.hypot(x - marks[k].x, z - marks[k].z) < r)) { nCut++; continue }
    const t = trees.slice(i, i + 6)
    if (marks.kinkaku && Math.hypot(x - marks.kinkaku.x, z - marks.kinkaku.z) < 160) { t[3] = 6 + R() * 5; t[4] = 4 + R() * 3; t[5] = 0; nLow++ }
    for (const v of t) out.push(v)
  }
  trees.length = 0; for (const v of out) trees.push(v)
  log.push(`名所のまわりで除いた木 ${nCut}・金閣寺の庭で低くした木 ${nLow}`) }
const nTree = trees.length / 6
log.push(`外の町の木: ${nTree} 本`)

// ── 書き出し ──
const secsOf = {}
function write(name, parts) {
  const secs = {}; let off = 0; const bufs = []
  for (const [k, arr] of Object.entries(parts)) { const pad = (4 - (off % 4)) % 4; if (pad) { bufs.push(Buffer.alloc(pad)); off += pad } const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); bufs.push(b); secs[k] = { off, n: arr.length, type: arr.constructor.name }; off += b.length }
  const raw = Buffer.concat(bufs), gz = zlib.gzipSync(raw, { level: 9 }); fs.writeFileSync(`${PUB}/${name}`, gz)
  log.push(`${name}: ${(raw.length / 1e6).toFixed(2)}MB → gzip ${(gz.length / 1e6).toFixed(2)}MB`); secsOf[name] = secs
  return { file: name, secs }
}
const HSTEP = 0.05
const files = {
  terrain: write('terrain.bin', { h: Int16Array.from(hs, (v) => q16(v, HSTEP)), zone }),
  bldg: write('bldg.bin', { box: Int16Array.from(boxes.map((v, i) => (i % 9 === 2 || i % 9 === 3 || i % 9 === 4 || i % 9 === 6 ? (v > 32767 ? v - 65536 : v) : v))), poly: Int32Array.from(polys), polyPts: Int16Array.from(polyPts) }),
  roads: write('roads.bin', { pos: Int16Array.from(rpos, (v, i) => q16(v, i % 3 === 1 ? 0.05 : 0.25)), runs: Uint32Array.from(rruns), kind: Uint8Array.from(rkind), along: Uint16Array.from(ralong, (v) => Math.round(v / 0.25) & 65535), width: Uint8Array.from(rwidth) }), // 位置は x・z 0.25m・高さ 0.05m 刻み、道の長さの位置は 0.25m 刻み（16384m で一回り）
  water: write('water.bin', { pos: Float32Array.from(wpos), idx: Uint32Array.from(widx), kind: Uint8Array.from(wkind) }),
  trees: write('trees.bin', { t: Float32Array.from(trees) }),
}
const meta = { note: '原点（鴨川デルタ）からのメートル。x 東・y 上・z 南。経緯度は入れていない（便22 外の町）', OX, core: C, step: STEP, nx, nz, hStep: HSTEP, boxStride: 9, boxQ: { xz: 0.25, size: 0.05, base: 0.05 }, roadQ: { xz: 0.25, y: 0.05, along: 0.25 }, polyStride: 6, counts: { boxes: boxes.length / 9, polys: nPoly, trees: nTree, roadPts: rpos.length / 3, water: widx.length / 3 }, marks, files }
fs.writeFileSync(`${PUB}/outer.json`, JSON.stringify(meta))
fs.writeFileSync(`${OD}/build-log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
