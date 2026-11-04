// 便17（鴨川の質の見本）: 取ってきた地図のデータ（scripts/kamo/fetch.mjs）を、原点（鴨川デルタ）からのメートルだけの形に組む。
// 出る物（scripts/kamo/_data/geo/ ・git に入れない）:
//   near.bin  … 近くの地形の網（四角 EXT・NEAR_STEP m 間隔・5m の標高。無い所は 10m の標高）（便21: ±800m の正方形から、東へ広げた四角にした）
//   far.bin   … 遠くの山の網（±FAR_R m・FAR_STEP m 間隔・10m の標高）
//   bldg.bin  … PLATEAU の建物（LOD2）を1つにまとめた三角形（建物ごとの番号つき）
//   water.bin … 川の水面（OpenStreetMap の水面の形を三角形にした物）
//   roads.bin … 道・橋・線路・河川敷の小道の帯
//   trees.bin … 木（OpenStreetMap の森・公園・川岸に並べた位置と大きさ）
//   geo.json  … それぞれの数・長さ・目の位置の候補・地面の高さの基準（★経緯度は書かない）
// 座標: x＝東へ（m）・y＝上へ（m・基準の高さ H0 から）・z＝南へ（m）。three.js の向きのまま使える。
// 使い方: node scripts/kamo/build.mjs
import fs from 'node:fs'
import zlib from 'node:zlib'
import { ShapeUtils, Vector2 } from 'three'

const D = process.env.KAMO_DATA || 'scripts/kamo/_data', OUT = D + '/geo'
fs.mkdirSync(OUT, { recursive: true })
const LAT0 = 35.0300, LON0 = 135.7725
const phi = (LAT0 * Math.PI) / 180
const MLAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), MLON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)
const toX = (lon) => (lon - LON0) * MLON, toZ = (lat) => -(lat - LAT0) * MLAT
const toLon = (x) => LON0 + x / MLON, toLat = (z) => LAT0 - z / MLAT
const NEAR_STEP = 4, FAR_R = 11000, FAR_STEP = 50
// 便21: 近くの範囲は四角（原点からの m・x 東・z 南）。京都大学・吉田神社・吉田山・茂庵まで入れるため東へ広げた（fetch.mjs の EXT と同じ）
const EXT = { x0: -800, x1: 1904, z0: -800, z1: 904 } // 幅と奥行きは 8m の倍数（iPhone の段が網を1つおきに間引くため）
const inNear = (x, z, m = 0) => x >= EXT.x0 + m && x <= EXT.x1 - m && z >= EXT.z0 + m && z <= EXT.z1 - m
const BLDG_M = 100 // 建物は網の縁から 100m 内側まで（便20 までは ±640m＝縁から 160m）
const log = []

// ── PNG（地理院の標高タイル）をほどく ──
function decodePNG(buf) {
  let o = 8, w, h, ct, plte = null; const idat = []
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error('PNG の形が想定外') }
    else if (type === 'PLTE') plte = data
    else if (type === 'IDAT') idat.push(data)
    o += 12 + len
  }
  const bpp = ct === 2 ? 3 : ct === 6 ? 4 : ct === 3 ? 1 : (() => { throw new Error('PNG の色の形 ' + ct) })()
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(w * h * 3), cur = Buffer.alloc(stride), prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0
      let v = line[i]
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[i] = v & 255
    }
    for (let x = 0; x < w; x++) {
      const di = (y * w + x) * 3
      if (ct === 3) { const k = cur[x] * 3; out[di] = plte[k]; out[di + 1] = plte[k + 1]; out[di + 2] = plte[k + 2] }
      else { out[di] = cur[x * bpp]; out[di + 1] = cur[x * bpp + 1]; out[di + 2] = cur[x * bpp + 2] }
    }
    cur.copy(prev)
  }
  return { w, h, rgb: out }
}
// 標高タイルの数（地理院の決まり: x=R*65536+G*256+B・2^23 は無し・それより大きいと負）
function mosaic(dir, t) {
  const nx = t.x1 - t.x0 + 1, ny = t.y1 - t.y0 + 1, W = nx * 256, H = ny * 256, a = new Float32Array(W * H).fill(NaN)
  for (let tx = t.x0; tx <= t.x1; tx++) for (let ty = t.y0; ty <= t.y1; ty++) {
    const f = `${D}/${dir}/${t.z}_${tx}_${ty}.png`; if (!fs.existsSync(f)) continue
    const p = decodePNG(fs.readFileSync(f))
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 3, v = p.rgb[i] * 65536 + p.rgb[i + 1] * 256 + p.rgb[i + 2]
      a[((ty - t.y0) * 256 + y) * W + (tx - t.x0) * 256 + x] = v === 8388608 ? NaN : v < 8388608 ? v * 0.01 : (v - 16777216) * 0.01
    }
  }
  const n = 2 ** t.z
  const sample = (lat, lon) => { // 双一次の補間（無しを含む時は近い方）
    const px = ((lon + 180) / 360) * n * 256 - t.x0 * 256 - 0.5
    const py = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n * 256 - t.y0 * 256 - 0.5
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) return NaN
    const g = (x, y) => a[y * W + x], v00 = g(x0, y0), v10 = g(x0 + 1, y0), v01 = g(x0, y0 + 1), v11 = g(x0 + 1, y0 + 1)
    if ([v00, v10, v01, v11].some(Number.isNaN)) { const c = [v00, v10, v01, v11].filter((v) => !Number.isNaN(v)); return c.length ? c.reduce((s, v) => s + v, 0) / c.length : NaN }
    return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
  }
  return sample
}
const tiles = JSON.parse(fs.readFileSync(`${D}/dem-tiles.json`, 'utf8'))
const H5 = mosaic('dem5', tiles.dem5), H10 = mosaic('dem10', tiles.dem10)
const Hraw = (x, z) => { const la = toLat(z), lo = toLon(x); const v = H5(la, lo); return Number.isNaN(v) ? H10(la, lo) : v }
const H0 = Hraw(0, 0)
log.push(`基準の高さ H0（原点の標高）: ${H0.toFixed(2)} m`)
const ground = (x, z) => Hraw(x, z) - H0

// ── 地形の網 ──
// 便21: 四角の網（x0..x1・z0..z1）。nx＝東西の点の数・nz＝南北の点の数
function grid(x0, x1, z0, z1, step, hf, sink) {
  const nx = Math.round((x1 - x0) / step) + 1, nz = Math.round((z1 - z0) / step) + 1, pos = new Float32Array(nx * nz * 3)
  let nan = 0
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step; let y = hf(x, z)
    if (Number.isNaN(y)) { nan++; y = 0 }
    if (sink && sink(x, z)) y -= 6
    pos.set([x, y, z], (j * nx + i) * 3)
  }
  return { nx, nz, n: nx, x0, z0, pos, nan }
}
const near = grid(EXT.x0, EXT.x1, EXT.z0, EXT.z1, NEAR_STEP, ground)
const far = grid(-FAR_R, FAR_R, -FAR_R, FAR_R, FAR_STEP, (x, z) => { const la = toLat(z), lo = toLon(x); return H10(la, lo) - H0 }, (x, z) => inNear(x, z, 10))
log.push(`近くの地形: ${near.nx}×${near.nz} 点（${NEAR_STEP}m 間隔・x ${EXT.x0}〜${EXT.x1}・z ${EXT.z0}〜${EXT.z1}・標高の無い点 ${near.nan}）`)
log.push(`遠くの地形: ${far.n}×${far.n} 点（${FAR_STEP}m 間隔・±${FAR_R}m・無い点 ${far.nan}）`)

// ── OpenStreetMap ──
const osm = JSON.parse(fs.readFileSync(`${D}/osm.json`, 'utf8')).elements
const P = (g) => g.map((p) => [toX(p.lon), toZ(p.lat)])
function rings(el) { // 道の形と、複数の道から成る面（multipolygon）の外側の輪
  if (el.type === 'way') return el.geometry ? [P(el.geometry)] : []
  const segs = (el.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => P(m.geometry))
  const out = []; const used = new Array(segs.length).fill(false)
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue; used[s] = true; let ring = segs[s].slice()
    for (let guard = 0; guard < segs.length && !same(ring[0], ring[ring.length - 1]); guard++) {
      let hit = false
      for (let t = 0; t < segs.length; t++) {
        if (used[t]) continue; const g = segs[t]
        if (same(ring[ring.length - 1], g[0])) { ring = ring.concat(g.slice(1)); used[t] = hit = true }
        else if (same(ring[ring.length - 1], g[g.length - 1])) { ring = ring.concat(g.slice(0, -1).reverse()); used[t] = hit = true }
        if (hit) break
      }
      if (!hit) break
    }
    out.push(ring)
  }
  return out
}
const tag = (e, k) => (e.tags || {})[k]
const pip = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if (zi > pt[1] !== zj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - zi)) / (zj - zi) + xi) c = !c } return c }

// 川の水面
const waterRings = []
for (const e of osm) if (tag(e, 'natural') === 'water' && /river|stream|canal/.test(tag(e, 'water') || 'river') || tag(e, 'waterway') === 'riverbank') for (const r of rings(e)) if (r.length > 3) waterRings.push(r)
const inWater = (x, z) => waterRings.some((r) => pip([x, z], r))
// 水面の高さ: 水面の内側の地面の低い方（2割の所）
const wy = []; for (let z = -800; z <= 800; z += 8) for (let x = -800; x <= 800; x += 8) if (inWater(x, z)) { const g = ground(x, z); if (!Number.isNaN(g)) wy.push(g) } // 原点のまわりの水面の内側の地面だけ
wy.sort((a, b) => a - b)
const WATER_Y = wy.length ? wy[Math.floor(wy.length * 0.3)] + 0.1 : 0
const wpos = [], widx = []
for (const r of waterRings) {
  const pts = r.slice(0, same2(r[0], r[r.length - 1]) ? -1 : undefined).map(([x, z]) => new Vector2(x, z))
  if (pts.length < 3) continue
  const base = wpos.length / 3
  for (const p of pts) wpos.push(p.x, waterAt(p.x, p.y), p.y)
  for (const t of ShapeUtils.triangulateShape(pts, [])) widx.push(base + t[0], base + t[1], base + t[2])
}
function same2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01 }
function waterAt(x, z) { let m = 1e9; for (let dz = -16; dz <= 16; dz += 4) for (let dx = -16; dx <= 16; dx += 4) { const g = ground(x + dx, z + dz); if (!Number.isNaN(g)) m = Math.min(m, g) } return Math.min(m === 1e9 ? WATER_Y : m + 0.2, WATER_Y + 4) } // 水面の縁はまわりの低い所＋0.2m（川は北の上流ほど少し高い）
log.push(`川の水面: 輪 ${waterRings.length}・三角形 ${widx.length / 3}・水面の高さの基準 ${WATER_Y.toFixed(2)} m`)
// 便21: 堰（落差工・帯工＝waterway=weir）。水の中の所だけを、3 本までの線分にして渡す（下流の白いさざ波に使う・調べ §6）
const weirs = []
for (const e of osm) {
  if (e.type !== 'way' || !e.geometry || tag(e, 'waterway') !== 'weir') continue
  const pts = P(e.geometry).filter(([x, z]) => inNear(x, z, 6) && (inWater(x, z) || inWater(x + 3, z) || inWater(x - 3, z) || inWater(x, z + 3) || inWater(x, z - 3)))
  if (pts.length < 2) continue
  const step = Math.max(1, Math.ceil((pts.length - 1) / 3))
  for (let i = 0; i < pts.length - 1; i += step) { const j = Math.min(pts.length - 1, i + step); weirs.push(+pts[i][0].toFixed(2), +pts[i][1].toFixed(2), +pts[j][0].toFixed(2), +pts[j][1].toFixed(2)) }
}
log.push(`堰: 線分 ${weirs.length / 4}`)

// 河川敷の範囲: 近くの地形の網の点のうち、水面の内側から、水面の高さ＋3.5m より低い所を 70m まで広げた所（堤の壁で止まる）
const zone = new Uint8Array(near.nx * near.nz) // 0 町・1 河川敷・2 水面
const wyAt = new Float32Array(near.nx * near.nz) // 便21: 網の点ごとの水面の高さ（水面と河川敷の点だけ）。川底の深さを決めるのに使う
const wdepth = new Uint8Array(near.nx * near.nz) // 便21: 水面の点の水の深さ（0.25cm 刻み・水でない所は 0）
{
  const n = near.nx, nz = near.nz, q = [], dist = new Float32Array(n * nz).fill(1e9)
  for (let j = 0; j < nz; j++) for (let i = 0; i < n; i++) { const k = j * n + i, x = EXT.x0 + i * NEAR_STEP, z = EXT.z0 + j * NEAR_STEP; if (inWater(x, z)) { zone[k] = 2; wyAt[k] = waterAt(x, z); dist[k] = 0; q.push(k) } }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % n, j = (k - i) / n
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= nz) continue
      const kk = jj * n + ii, d = dist[k] + NEAR_STEP; if (zone[kk] || d > 70) continue
      if (near.pos[kk * 3 + 1] > wyAt[k] + 3.5) continue
      zone[kk] = 1; wyAt[kk] = wyAt[k]; dist[kk] = d; q.push(kk)
    }
  }
  // ~~水面の内側の地面は、水面の 0.6m 下へ下げる（10m の粗い標高で埋めた所が水面より高く、川が隠れるため）~~（【便21】下の浅瀬の形にした）
  // 便21: 鴨川はふだん くるぶし〜すね の浅瀬（調べ §6・写真で 10〜30cm）。川底は水際から離れるほど深く（水際の次の点 12cm → 中ほど 42cm まで）、
  //   瀬と淵のゆるいうねり（0.75〜1.25 倍）を掛ける。深さ（wdepth・0.25cm 刻み）は本体へ渡し、水の透け方・川底の光の網・目の下限に使う
  const dEdge = new Float32Array(n * nz).fill(1e9), q2 = []
  for (let k = 0; k < n * nz; k++) if (zone[k] !== 2) { dEdge[k] = 0; q2.push(k) }
  for (let h = 0; h < q2.length; h++) {
    const k = q2[h], i = k % n, j = (k - i) / n
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= nz) continue; const kk = jj * n + ii; if (dEdge[kk] <= dEdge[k] + NEAR_STEP) continue; dEdge[kk] = dEdge[k] + NEAR_STEP; q2.push(kk) }
  }
  for (let k = 0; k < n * nz; k++) if (zone[k] === 2) {
    const x = EXT.x0 + (k % n) * NEAR_STEP, z = EXT.z0 + Math.floor(k / n) * NEAR_STEP
    const swell = 1 + 0.25 * Math.sin(x * 0.043 + z * 0.061) * Math.sin(x * 0.017 - z * 0.029 + 1.3)
    const deep = Math.min(0.42, 0.02 + dEdge[k] * 0.025) * swell
    near.pos[k * 3 + 1] = wyAt[k] - deep; wdepth[k] = Math.min(255, Math.round(deep * 400))
  }
  let c1 = 0, c2 = 0; for (const z of zone) { if (z === 1) c1++; if (z === 2) c2++ }
  log.push(`河川敷の範囲: 水面 ${c2} 点・河川敷 ${c1} 点（${NEAR_STEP}m 間隔）`)
}

// 道・橋・線路・小道（帯）
const ROADW = { trunk: 14, primary: 13, secondary: 11, tertiary: 9, unclassified: 6, residential: 5.5, living_street: 4.5, service: 3.5, pedestrian: 5, footway: 2.2, path: 2.2, cycleway: 2.5, track: 3, steps: 2 }
const rpos = [], ridx = [], rkind = [] // kind: 0 車道 1 小道 2 橋の床 3 線路（便21: 5 河川敷の真砂土の道）
const ralong = [], rwidth = [], riverPath = [] // 便21
let nRoad = 0, nBridge = 0
const roadPts = [] // 便21: 車道と小道の中心の点（x, z, 種類）
const stones = [] // 飛び石（ford=stepping_stones）: x, y, z, 向き
const stoneKind = [] // 便21: 石の形 0 角の丸い長方形・1 亀・2 千鳥・3 すれ違いの石（渡る列に入れない）
const stoneRows = [] // 便21: 飛び石の列の両端（水の中の所）[ax, az, bx, bz]。下流の白いさざ波に使う
for (const e of osm) {
  if (e.type !== 'way' || !e.geometry) continue
  const hw = tag(e, 'highway'), rw = tag(e, 'railway')
  if (!(hw in ROADW) && !(rw === 'rail' || rw === 'light_rail')) continue
  if (tag(e, 'tunnel') === 'yes' || tag(e, 'layer') && +tag(e, 'layer') < 0) continue
  if (tag(e, 'ford') === 'stepping_stones') {
    // ~~帯にせず、水面の少し上に 1.7m ごとに石を並べる（水の外は小道と同じ扱いにしない）~~（【便21】下の形にした）
    // 便21: 鴨川デルタの飛び石は2列・計83基・約90m（調べ §7）＝石の中心は約 1.1m おき。まっすぐでなく、左右へ 0.15〜0.3m ずつ千鳥にずらし（人の歩幅で渡れる＝石と石の間は 0.6m 以内）、
    //   ところどころに下流側へ並べた「すれ違いの石」を置く。形は長方形が多く、ときどき亀（甲羅と頭）と千鳥（鳥）。石の上は水面の 12cm 上
    const pts = P(e.geometry).filter(([x, z]) => inNear(x, z, 6))
    if (pts.length < 2) continue
    const dense = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.ceil(L / 0.25)); for (let k = 0; k < m; k++) dense.push([ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m]) }
    dense.push(pts[pts.length - 1])
    const wet = dense.filter(([x, z]) => inWater(x, z)); if (wet.length < 2) continue
    stoneRows.push(+wet[0][0].toFixed(2), +wet[0][1].toFixed(2), +wet[wet.length - 1][0].toFixed(2), +wet[wet.length - 1][1].toFixed(2))
    let acc = 0, idx = 0
    for (let i = 1; i < wet.length; i++) {
      acc += Math.hypot(wet[i][0] - wet[i - 1][0], wet[i][1] - wet[i - 1][1]); if (acc < 1.1 && i !== 1) continue
      acc = 0; idx++
      const [x0, z0] = wet[i], [xp, zp] = wet[i - 1], tx = x0 - xp, tz = z0 - zp, tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl, rot = Math.atan2(tx, tz)
      const side = (idx % 2 ? 1 : -1) * (0.15 + 0.15 * Math.abs(Math.sin(idx * 2.31))), kind = idx % 7 === 3 ? 1 : idx % 11 === 6 ? 2 : 0
      const x = x0 + nx * side, z = z0 + nz * side
      stones.push(x, waterAt(x, z) + 0.12, z, rot + (Math.sin(idx * 1.7) * 0.12)); stoneKind.push(kind)
      if (idx % 9 === 5) { const fx = tx / tl, fz = tz / tl, bxx = x - nx * side * 2.6 + fx * 0.1, bzz = z - nz * side * 2.6 + fz * 0.1; stones.push(bxx, waterAt(bxx, bzz) + 0.12, bzz, rot); stoneKind.push(3) } // すれ違いの石（列の反対側）
    }
    continue
  }
  let w = rw ? 4 : ROADW[hw], kind = rw ? 3 : tag(e, 'bridge') === 'yes' ? 2 : /footway|path|cycleway|track|steps|pedestrian/.test(hw) ? 1 : 0
  const pts = P(e.geometry)
  // 便21: 河川敷の小道（点の 6 割以上が河川敷の範囲）は、幅 3.4m の真砂土の道（種類 5）。歩く人・走る人・自転車が通る（調べ §6）
  if (kind === 1 && hw !== 'steps') { let zr = 0, zn = 0; for (const [x, z] of pts) { if (!inNear(x, z)) continue; zn++; const i = Math.round((x - EXT.x0) / NEAR_STEP), j = Math.round((z - EXT.z0) / NEAR_STEP); if (zone[j * near.nx + i] === 1) zr++ } if (zn && zr / zn >= 0.6) { kind = 5; w = 3.4 } }
  // 4m ごとに点を足して地面に沿わせる。橋は両端の高さを結ぶ
  const dense = []
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 4)); for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]) }
  dense.push(pts[pts.length - 1])
  // 近くの範囲（地形の網）の外の点は落とす（外へはみ出して宙に浮かないように）。途中で切れた所は別の帯にする
  if (dense.every(([x, z]) => !inNear(x, z, 6))) continue
  while (dense.length && !inNear(dense[0][0], dense[0][1], 6)) dense.shift()
  while (dense.length && !inNear(dense[dense.length - 1][0], dense[dense.length - 1][1], 6)) dense.pop()
  if (dense.length < 2) continue
  if (kind === 0 || kind === 1) for (let i = 0; i < dense.length; i += 1) roadPts.push(dense[i][0], dense[i][1], kind) // 便21: 建物の表（通りに面する向き）を決める道の点
  if (kind === 5 && dense.length > 3) riverPath.push(dense.map(([x, z]) => [+x.toFixed(1), +z.toFixed(1)])) // 便21: 河川敷の小道（歩く人・走る人・自転車の道筋・1本ずつの折れ線）
  const ys = dense.map(([x, z]) => ground(x, z))
  if (kind === 2) { const y0 = ys[0], y1 = ys[ys.length - 1]; for (let i = 0; i < ys.length; i++) ys[i] = Math.max(y0 + ((y1 - y0) * i) / (ys.length - 1), WATER_Y + 3) + 0.6; nBridge++ } else nRoad++
  const base = rpos.length / 3
  let acc = 0
  for (let i = 0; i < dense.length; i++) {
    const a = dense[Math.max(0, i - 1)], b = dense[Math.min(dense.length - 1, i + 1)]
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l
    const nx = -dz * w * 0.5, nz = dx * w * 0.5, [x, z] = dense[i], lift = kind === 2 ? 0 : kind === 1 || kind === 5 ? 0.12 : 0.18
    if (i) acc += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]); ralong.push(acc, acc); rwidth.push(Math.round(w * 10), Math.round(w * 10)) // 便21: 道の長さの位置と幅（白線と目地に使う）
    const yl = kind === 2 ? ys[i] : ground(x + nx, z + nz) + lift, yr = kind === 2 ? ys[i] : ground(x - nx, z - nz) + lift
    rpos.push(x + nx, Number.isNaN(yl) ? ys[i] : yl, z + nz, x - nx, Number.isNaN(yr) ? ys[i] : yr, z - nz); rkind.push(kind, kind)
  }
  for (let i = 0; i < dense.length - 1; i++) { const a = base + i * 2; ridx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
}
log.push(`道の帯: 道 ${nRoad}・橋 ${nBridge}・点 ${rpos.length / 3}・飛び石 ${stones.length / 4} 個`)

// 木: 森・公園の中に散らす＋木の点＋川岸（水面の輪の外側 6〜14m）に並べる
let seed = 1103; const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const trees = [] // x, y, z, 高さ, 幅, 種類（0 広葉 1 桜・柳の川岸 2 森の大木）
const woods = []; for (const e of osm) if (/forest|wood/.test(tag(e, 'landuse') || '') || tag(e, 'natural') === 'wood' || tag(e, 'leisure') === 'park' || tag(e, 'leisure') === 'garden') for (const r of rings(e)) woods.push({ r, park: !!tag(e, 'leisure') })
for (const { r, park } of woods) {
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9; for (const [x, z] of r) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z) }
  if (maxx < EXT.x0 || minx > EXT.x1 || maxz < EXT.z0 || minz > EXT.z1) continue
  const area = (maxx - minx) * (maxz - minz), n = Math.min(4000, Math.round(area / (park ? 160 : 55)))
  for (let i = 0; i < n; i++) { const x = minx + R() * (maxx - minx), z = minz + R() * (maxz - minz); if (!inNear(x, z) || !pip([x, z], r) || inWater(x, z)) continue; const big = !park; trees.push([x, ground(x, z), z, big ? 13 + R() * 12 : 7 + R() * 6, big ? 7 + R() * 6 : 5 + R() * 4, big ? 2 : 0]) }
}
for (const e of osm) if (e.type === 'node' && tag(e, 'natural') === 'tree') { const x = toX(e.lon), z = toZ(e.lat); if (inNear(x, z)) trees.push([x, ground(x, z), z, 7 + R() * 5, 5 + R() * 3, 0]) }
for (const r of waterRings) for (let i = 0; i < r.length - 1; i++) { // 川岸の並木（12m ごと・外へ 9m）
  const [ax, az] = r[i], [bx, bz] = r[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 12)
  for (let k = 0; k < n; k++) {
    const t = (k + R()) / Math.max(1, n), x0 = ax + (bx - ax) * t, z0 = az + (bz - az) * t, nx = -(bz - az) / L, nz = (bx - ax) / L
    for (const s of [1, -1]) { const x = x0 + nx * 9 * s, z = z0 + nz * 9 * s; if (!inNear(x, z) || inWater(x, z) || R() < 0.35) continue; const g = ground(x, z); if (g - WATER_Y > 5) continue; trees.push([x, g, z, 6 + R() * 4, 6 + R() * 3, 1]); break }
  }
}
log.push(`木: ${trees.length} 本（森と公園 ${woods.length} か所・川岸の並木）`)

// ── PLATEAU の建物 ──
const src = fs.readFileSync('node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js', 'utf8')
const mod = { exports: {} }; new Function('module', 'exports', 'require', '__dirname', src)(mod, mod.exports, () => ({}), process.cwd())
const draco = await mod.exports()
const A = 6378137, E2 = 6.69437999014e-3
function ecef2geo(x, y, z) { const p = Math.hypot(x, y), lon = Math.atan2(y, x); let lat = Math.atan2(z, p * (1 - E2)), h = 0; for (let i = 0; i < 5; i++) { const N = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2); h = p / Math.cos(lat) - N; lat = Math.atan2(z, p * (1 - (E2 * N) / (N + h))) } return [(lat * 180) / Math.PI, (lon * 180) / Math.PI, h] }
const list = JSON.parse(fs.readFileSync(`${D}/bldg-list.json`, 'utf8'))
const seen = new Set(), blds = [] // { pos: Float32Array（local）, idx, h, usage }
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
    const fa = new draco.DracoInt32Array(), faces = new Uint32Array(nf * 3)
    for (let f = 0; f < nf; f++) { dec.GetFaceFromMesh(m, f, fa); faces[f * 3] = fa.GetValue(0); faces[f * 3 + 1] = fa.GetValue(1); faces[f * 3 + 2] = fa.GetValue(2) }
    draco.destroy(fa); draco.destroy(m); draco.destroy(buf); draco.destroy(dec)
    // 頂点を地面の座標へ（glTF の上向き Y → 3D Tiles の上向き Z: (x,y,z)→(x,-z,y)、RTC を足す、経緯度と高さ、ここの x・z）
    const lp = new Float32Array(nv * 3)
    for (let i = 0; i < nv; i++) { const [la, lo, h] = ecef2geo(rtc[0] + pos[i * 3], rtc[1] - pos[i * 3 + 2], rtc[2] + pos[i * 3 + 1]); lp[i * 3] = toX(lo); lp[i * 3 + 1] = h; lp[i * 3 + 2] = toZ(la) }
    // 建物ごとに分ける
    const byB = new Map()
    for (let f = 0; f < nf; f++) { const k = Math.round(bid[faces[f * 3]]); if (!byB.has(k)) byB.set(k, []); byB.get(k).push(f) }
    for (const [k, fs_] of byB) {
      const id = bt.gml_id[k]; if (seen.has(id)) continue
      const vmap = new Map(), P3 = [], I = []
      for (const f of fs_) for (let c = 0; c < 3; c++) { const v = faces[f * 3 + c]; if (!vmap.has(v)) { vmap.set(v, P3.length / 3); P3.push(lp[v * 3], lp[v * 3 + 1], lp[v * 3 + 2]) } I.push(vmap.get(v)) }
      let cx = 0, cz = 0; for (let i = 0; i < P3.length; i += 3) { cx += P3[i]; cz += P3[i + 2] } cx /= P3.length / 3; cz /= P3.length / 3
      if (!inNear(cx, cz, BLDG_M)) continue
      seen.add(id)
      blds.push({ pos: P3, idx: I, cx, cz, h: bt['bldg:measuredHeight'][k], usage: bt['bldg:usage'][k], cls: bt['bldg:class'][k] })
    }
  }
}
// 高さの基準をそろえる（PLATEAU は楕円体の高さ・地理院は標高。建物ごとに、壁の下の端を地面の高さ−0.2m に合わせる）
const offs = []
for (const b of blds) {
  let miny = 1e9; for (let i = 1; i < b.pos.length; i += 3) miny = Math.min(miny, b.pos[i])
  let gmin = 1e9; for (let i = 0; i < b.pos.length; i += 3) if (b.pos[i + 1] < miny + 0.6) { const g = ground(b.pos[i], b.pos[i + 2]); if (!Number.isNaN(g)) gmin = Math.min(gmin, g) }
  if (gmin === 1e9) gmin = ground(b.cx, b.cz)
  const sh = gmin - 0.2 - miny; offs.push(sh + H0); for (let i = 1; i < b.pos.length; i += 3) b.pos[i] += sh
}
offs.sort((a, b) => a - b)
log.push(`PLATEAU の建物: ${blds.length} 棟（網の縁から ${BLDG_M}m 内側・段の重なりを除いた）・楕円体の高さと標高の差の中央値 ${(-offs[Math.floor(offs.length / 2)]).toFixed(2)} m（ジオイドの高さの目安）`)

// ── 便21: 京都らしい家並み。建物ごとに「形の種類」と「通りに面する向き」を決める（描き方は本体の kamoTown.js） ──
//   種類: 0 今の家（モルタルや板の壁・瓦かスレートの屋根）／1 京町家（通りに面して隣と接し、1階に格子・2階に虫籠窓・通り庇・いぶし銀の桟瓦）／
//         2 古民家（離れて建つ古い木造・腰板と土壁・柱・瓦）／3 集合住宅・ビル（今のまま）／4 大きな施設（学校・大学・病院など）／5 寺社（木の柱と白壁・大きな瓦屋根）
//   2000年頃は今より町家と古い木造が多かった（京都市の町家の調べ: 1998年度に都心4区で約28,000軒・その後は年に約2%ずつ減った＝調べ §10）。
//   町家は上京区側（鴨川の西）と出町の商店街のまわりに多く、左京区の吉田や京大の北は戦後の家が多い（調べ §10 の推測）＝西 60%・東 35%（隣と接し、通りに近い2階建ての家のうち）。
//   乱数は町の R と分ける（木の形を変えない）
let ks = 777001; const RK = () => { ks = (ks * 1664525 + 1013904223) >>> 0; return ks / 4294967296 }
const worship = []; for (const e of osm) if (tag(e, 'amenity') === 'place_of_worship') for (const r of rings(e)) if (r.length > 3) worship.push(r)
const RC = 12, rcell = new Map() // 道の点を 12m 升に入れる
for (let i = 0; i < roadPts.length; i += 3) { const k = Math.floor(roadPts[i] / RC) * 100003 + Math.floor(roadPts[i + 1] / RC); let a = rcell.get(k); if (!a) { a = []; rcell.set(k, a) } a.push(roadPts[i], roadPts[i + 1]) }
const nearRoad = (x, z) => { let best = null, bd = 1e9; const ci = Math.floor(x / RC), cj = Math.floor(z / RC); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const arr = rcell.get((ci + a) * 100003 + cj + b); if (!arr) continue; for (let q = 0; q < arr.length; q += 2) { const d = Math.hypot(arr[q] - x, arr[q + 1] - z); if (d < bd) { bd = d; best = [arr[q], arr[q + 1]] } } } return best ? { d: bd, x: best[0], z: best[1] } : null }
const BC = 20, bcell = new Map() // 建物の箱を 20m 升に入れて、隣と接するかを見る
const bbox = blds.map((b, n) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < b.pos.length; i += 3) { x0 = Math.min(x0, b.pos[i]); x1 = Math.max(x1, b.pos[i]); y0 = Math.min(y0, b.pos[i + 1]); y1 = Math.max(y1, b.pos[i + 1]); z0 = Math.min(z0, b.pos[i + 2]); z1 = Math.max(z1, b.pos[i + 2]) } for (let a = Math.floor(x0 / BC); a <= Math.floor(x1 / BC); a++) for (let c = Math.floor(z0 / BC); c <= Math.floor(z1 / BC); c++) { const k = a * 100003 + c; let l = bcell.get(k); if (!l) { l = []; bcell.set(k, l) } l.push(n) } return { x0, x1, z0, z1, y0, y1 } })
const style = new Uint8Array(blds.length), front = new Uint8Array(blds.length), cnt = [0, 0, 0, 0, 0, 0]
let nRoof = 0
// 屋根を足す: 町家＝通りに平行な棟の切妻（平入り）・古民家＝寄棟・今の家＝切妻か寄棟・寺社＝深い軒の寄棟。軒は壁の上の端（平らな屋上）から始める
function addRoof(b, bb, s, r) {
  const top = []; for (let i = 0; i < b.pos.length; i += 3) if (b.pos[i + 1] > bb.y1 - 0.4) top.push(b.pos[i], b.pos[i + 2])
  if (top.length < 6) return
  const fa = r ? Math.atan2(r.x - b.cx, r.z - b.cz) : 0
  let ax = Math.cos(fa), az = -Math.sin(fa) // 棟の向き（通りに平行）
  const ext = (ux, uz) => { let a0 = 1e9, a1 = -1e9; for (let i = 0; i < top.length; i += 2) { const v = top[i] * ux + top[i + 1] * uz; a0 = Math.min(a0, v); a1 = Math.max(a1, v) } return [a0, a1] }
  let [s0, s1] = ext(ax, az), [d0, d1] = ext(-az, ax)
  if (s !== 1 && d1 - d0 > s1 - s0) { const t = ax; ax = -az; az = t; [s0, s1] = ext(ax, az); [d0, d1] = ext(-az, ax) } // 町家でなければ長い方に棟を通す
  const cx_ = -az, cz_ = ax
  const os = s === 1 ? 0.08 : s === 5 ? 1.4 : 0.45, od = s === 1 ? 0.55 : s === 5 ? 1.4 : 0.45
  s0 -= os; s1 += os; d0 -= od; d1 += od
  const pitch = s === 5 ? 0.62 : s === 2 ? 0.5 : s === 1 ? 0.45 : 0.4 + RK() * 0.12
  const hip = s === 2 || s === 5 || (s === 0 && RK() < 0.4)
  const yE = bb.y1 + 0.03, half = (d1 - d0) / 2, dm = (d0 + d1) / 2, yR = yE + pitch * half
  const W = (sv, dv, y) => [sv * ax + dv * cx_, y, sv * az + dv * cz_]
  const add = (A, B, C) => { // 上か外を向くように回りをそろえて足す
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, mx = (A[0] + B[0] + C[0]) / 3 - b.cx, mz = (A[2] + B[2] + C[2]) / 3 - b.cz
    const out = Math.abs(ny) > 0.3 ? ny > 0 : nx * mx + nz * mz > 0
    const base = b.pos.length / 3; b.pos.push(...A, ...(out ? B : C), ...(out ? C : B)); b.idx.push(base, base + 1, base + 2)
  }
  if (!hip) {
    add(W(s0, d0, yE), W(s1, d0, yE), W(s1, dm, yR)); add(W(s0, d0, yE), W(s1, dm, yR), W(s0, dm, yR))
    add(W(s0, d1, yE), W(s1, dm, yR), W(s1, d1, yE)); add(W(s0, d1, yE), W(s0, dm, yR), W(s1, dm, yR))
    add(W(s0 + os, d0 + od, yE), W(s0 + os, dm, yR - pitch * od), W(s0 + os, d1 - od, yE)); add(W(s1 - os, d0 + od, yE), W(s1 - os, d1 - od, yE), W(s1 - os, dm, yR - pitch * od)) // 妻の壁
  } else {
    const r0 = Math.min(s0 + half, (s0 + s1) / 2), r1 = Math.max(s1 - half, (s0 + s1) / 2)
    add(W(s0, d0, yE), W(s1, d0, yE), W(r1, dm, yR)); add(W(s0, d0, yE), W(r1, dm, yR), W(r0, dm, yR))
    add(W(s0, d1, yE), W(r1, dm, yR), W(s1, d1, yE)); add(W(s0, d1, yE), W(r0, dm, yR), W(r1, dm, yR))
    add(W(s0, d0, yE), W(r0, dm, yR), W(s0, d1, yE)); add(W(s1, d0, yE), W(s1, d1, yE), W(r1, dm, yR))
  }
}
const eaves = [] // 町家の通り庇と犬矢来の三角形（x, y, z と 種類 0 庇の上・1 庇の下と縁・2 犬矢来）
const ekind = []
const tri3 = (a, b, c, k) => { eaves.push(...a, ...b, ...c); ekind.push(k, k, k) }
const quad = (a, b, c, d, k) => { tri3(a, b, c, k); tri3(a, c, d, k) }
blds.forEach((b, n) => {
  const bb = bbox[n], h = b.h ?? bb.y1 - bb.y0, ht = bb.y1 - bb.y0, cx = b.cx, cz = b.cz
  let roofA = 0, pitchA = 0
  for (let t = 0; t < b.idx.length; t += 3) { const A = b.idx[t] * 3, B = b.idx[t + 1] * 3, C = b.idx[t + 2] * 3, ux = b.pos[B] - b.pos[A], uy = b.pos[B + 1] - b.pos[A + 1], uz = b.pos[B + 2] - b.pos[A + 2], vx = b.pos[C] - b.pos[A], vy = b.pos[C + 1] - b.pos[A + 1], vz = b.pos[C + 2] - b.pos[A + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, L = Math.hypot(nx, ny, nz) || 1, ay = Math.abs(ny / L), area = L / 2
    if (ay > 0.3) { roofA += area * ay; if (ay < 0.97) pitchA += area * ay } }
  // PLATEAU の京都の建物は家も含めて屋根が平らな箱（傾いた屋根の面が無い＝便21 で数えた）。低い家には下の addRoof で屋根を足す
  const r = nearRoad(cx, cz), u = b.usage || ''
  front[n] = r ? Math.round(((Math.atan2(r.x - cx, r.z - cz) + Math.PI) / (2 * Math.PI)) * 255) : 0
  let attached = 0
  for (let a = Math.floor(bb.x0 / BC); a <= Math.floor(bb.x1 / BC); a++) for (let c = Math.floor(bb.z0 / BC); c <= Math.floor(bb.z1 / BC); c++) for (const m of bcell.get(a * 100003 + c) || []) { if (m === n) continue; const o = bbox[m]; const gx = Math.max(o.x0 - bb.x1, bb.x0 - o.x1), gz = Math.max(o.z0 - bb.z1, bb.z0 - o.z1); if (Math.max(gx, gz) < 0.9) attached++ }
  const holy = worship.some((w) => pip([cx, cz], w))
  let s = 0
  if (holy && roofA > 60 && roofA < 2500 && h < 20) s = 5
  else if (h > 12 || ht > 13 || /共同住宅/.test(u) && h > 8) s = 3
  else if (roofA > 700 || /文教|官公庁|業務|商業施設|運輸|工場|供給/.test(u)) s = 4
  let house = false
  if (s === 0 && h <= 10.5 && ht <= 11 && roofA > 12 && roofA < 260 && /住宅|不明|その他/.test(u)) {
    house = true
    const west = cx < -30, rowHouse = attached >= 1 && r && r.d < 9
    if (rowHouse && RK() < (west ? 0.6 : 0.35) + (/店舗/.test(u) ? 0.15 : 0)) s = 1
    else if (RK() < 0.3) s = 2
  }
  style[n] = s; cnt[s]++
  if (house || s === 5) { addRoof(b, bb, s, r); nRoof++ }
  if (s !== 1 || !r) return
  // 通り庇（1階の上 2.7m・外へ 0.85m・先が 0.22m 下がる）と、半分の町家に犬矢来（足もとの竹の囲い・外へ 0.45m・高さ 0.9m）。表の壁＝外向きの法線が通りの向きに近い壁
  const fa = Math.atan2(r.x - cx, r.z - cz), fx = Math.sin(fa), fz = Math.cos(fa), px = fz, pz = -fx
  let s0 = 1e9, s1 = -1e9, d0 = -1e9
  for (let t = 0; t < b.idx.length; t += 3) {
    const A = b.idx[t] * 3, B = b.idx[t + 1] * 3, C = b.idx[t + 2] * 3, ux = b.pos[B] - b.pos[A], uy = b.pos[B + 1] - b.pos[A + 1], uz = b.pos[B + 2] - b.pos[A + 2], vx = b.pos[C] - b.pos[A], vy = b.pos[C + 1] - b.pos[A + 1], vz = b.pos[C + 2] - b.pos[A + 2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L
    if (Math.abs(ny) > 0.3) continue
    const mx = (b.pos[A] + b.pos[B] + b.pos[C]) / 3 - cx, mz = (b.pos[A + 2] + b.pos[B + 2] + b.pos[C + 2]) / 3 - cz; if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz }
    if (nx * fx + nz * fz < 0.8) continue
    for (const V of [A, B, C]) { const sx = b.pos[V] * px + b.pos[V + 2] * pz, dd = b.pos[V] * fx + b.pos[V + 2] * fz; s0 = Math.min(s0, sx); s1 = Math.max(s1, sx); d0 = Math.max(d0, dd) }
  }
  if (!(s1 - s0 > 2.5 && s1 - s0 < 30)) return
  const base = bb.y0 + 0.2, P2 = (s, d, y) => [s * px + d * fx, y, s * pz + d * fz]
  const e0 = d0 + 0.02, e1 = d0 + 0.85, y0 = base + 2.75, y1 = base + 2.53
  quad(P2(s0 - 0.08, e0, y0), P2(s1 + 0.08, e0, y0), P2(s1 + 0.08, e1, y1), P2(s0 - 0.08, e1, y1), 0) // 庇の瓦の面
  quad(P2(s0 - 0.08, e1, y1), P2(s1 + 0.08, e1, y1), P2(s1 + 0.08, e1, y1 - 0.1), P2(s0 - 0.08, e1, y1 - 0.1), 1) // 庇の先の縁
  quad(P2(s1 + 0.08, e0, y0 - 0.12), P2(s0 - 0.08, e0, y0 - 0.12), P2(s0 - 0.08, e1, y1 - 0.1), P2(s1 + 0.08, e1, y1 - 0.1), 1) // 庇の下（軒裏）
  if (RK() < 0.5) { // 犬矢来: 4 枚の帯で丸い反りを作る
    const prof = [[0, 0.9], [0.18, 0.55], [0.36, 0.25], [0.45, 0.0]]
    for (let i = 0; i < 3; i++) { const [a0, h0] = prof[i], [a1, h1] = prof[i + 1]; quad(P2(s0 + 0.2, e0 + a0, base + h0), P2(s1 - 0.2, e0 + a0, base + h0), P2(s1 - 0.2, e0 + a1, base + h1), P2(s0 + 0.2, e0 + a1, base + h1), 2) }
  }
})
log.push(`家並みの種類: 今の家 ${cnt[0]}・町家 ${cnt[1]}・古民家 ${cnt[2]}・集合住宅とビル ${cnt[3]}・大きな施設 ${cnt[4]}・寺社 ${cnt[5]}・屋根を足した ${nRoof} 棟・通り庇と犬矢来の三角形 ${eaves.length / 9}`)
let bv = 0, bi = 0; for (const b of blds) { bv += b.pos.length / 3; bi += b.idx.length }
const bpos = new Float32Array(bv * 3), bidx = new Uint32Array(bi), bbid = new Uint16Array(bv)
{ let vo = 0, io = 0; blds.forEach((b, n) => { bpos.set(b.pos, vo * 3); for (let i = 0; i < b.idx.length; i++) bidx[io + i] = b.idx[i] + vo; bbid.fill(n, vo, vo + b.pos.length / 3); vo += b.pos.length / 3; io += b.idx.length }) }
log.push(`建物の三角形: ${bi / 3}・点 ${bv}`)

// ── 目の位置（窓・土手・歩く）。建物と地面から決める ──
// 西岸（上京区側）から、東南東（デルタの先・高野川・大文字山）を向く。比叡山は左の端
const bearing = (x0, z0, x1, z1) => (Math.atan2(x1 - x0, -(z1 - z0)) * 180) / Math.PI
const DAIMONJI = [toX(135.7966), toZ(35.0237)], HIEI = [toX(135.8346), toZ(35.0670)]
// 土手: 西の土手の天端（地面の高い所）を、原点の西 40〜140m の帯で探す
// 土手: 西から東へ進み、地面が −1.5m より下がる手前（西の土手の縁）
function findLevee(z) { for (let x = -320; x < 0; x += 1) if (ground(x, z) < -1.5) return { x: x - 3, g: ground(x - 3, z) }; return { x: -180, g: ground(-180, z) } }
// 出町橋（z≈−46）と賀茂大橋（z≈+100）の間で、土手の縁が家から一番離れた所（西岸は家が縁まで迫っている）
const bpts = []; for (const b of blds) for (let i = 0; i < b.pos.length; i += 9) bpts.push(b.pos[i], b.pos[i + 2])
const clear = (x, z) => { let m = 1e9; for (let i = 0; i < bpts.length; i += 2) m = Math.min(m, Math.hypot(bpts[i] - x, bpts[i + 1] - z)); return m }
let VZ = 30, best = -1
for (let z = 6; z <= 76; z += 4) { const e = findLevee(z), c = clear(e.x + 1, z); if (c > best) { best = c; VZ = z } }
log.push(`土手の目の z: ${VZ}（土手の縁から家まで ${best.toFixed(1)}m）`)
const lv0 = findLevee(VZ), lv = { x: lv0.x + 1, g: ground(lv0.x + 1, VZ) }
const bank = { x: lv.x, y: lv.g + 1.6, z: VZ }
// 歩く: 土手から川の方へ下りた河川敷（水面の 1.0〜2.5m 上で、水から 8m 以上離れた所）
let walk = null
for (let x = lv.x + 3; x < 40 && !walk; x += 1) { const g = ground(x, VZ); if (inWater(x, VZ)) break; if (g - WATER_Y < 2.2) walk = { x: x + 3, y: ground(x + 3, VZ) + 1.6, z: VZ } }
if (!walk) walk = { x: lv.x + 18, y: ground(lv.x + 18, VZ) + 1.6, z: VZ }
// 窓: 土手の西 60〜200m の高めの建物の上の方の階（地面から 16〜24m）
let win = null
// 窓: 西岸の土手に面した（東の壁が土手の縁から 45m 以内の）高さ 12m 以上の建物の、東の壁の上の方の階（隣の建物の間に目が入らないように）
for (const b of blds) {
  if (Math.abs(b.cz - VZ) > 150 || !(b.h >= 12)) continue
  let mx = -1e9; for (let i = 0; i < b.pos.length; i += 3) mx = Math.max(mx, b.pos[i])
  if (mx > lv.x - 2 || mx < lv.x - 45) continue
  const sc = b.h - Math.abs(b.cz - VZ) * 0.02
  if (!win || sc > win.sc) win = { x: mx + 0.6, y: ground(b.cx, b.cz) + Math.min(b.h - 1.5, 22), z: b.cz, h: b.h, sc }
}
if (!win) win = { x: lv.x - 90, y: ground(lv.x - 90, VZ) + 18, z: VZ }
// 目のまわり 10m の木は除く（幹が目の前をふさがないように）
for (let i = trees.length - 1; i >= 0; i--) if ([win, bank, walk].some((v) => Math.hypot(trees[i][0] - v.x, trees[i][2] - v.z) < 10)) trees.splice(i, 1)
const views = {}
for (const [k, v] of Object.entries({ window: win, bank, walk })) { const yaw = bearing(v.x, v.z, DAIMONJI[0], DAIMONJI[1]) - 18; views[k] = { x: +v.x.toFixed(1), y: +v.y.toFixed(1), z: +v.z.toFixed(1), yawDeg: +yaw.toFixed(1), groundY: +ground(v.x, v.z).toFixed(2) } }
log.push(`目の位置: ${Object.entries(views).map(([k, v]) => `${k}（x ${v.x}・高さ ${v.y}・z ${v.z}・向き ${v.yawDeg}°）`).join('・')}`)
log.push(`遠くの山（ここからの向き）: 大文字山 ${bearing(0, 0, ...DAIMONJI).toFixed(0)}°・${(Math.hypot(...DAIMONJI) / 1000).toFixed(1)}km／比叡山 ${bearing(0, 0, ...HIEI).toFixed(0)}°・${(Math.hypot(...HIEI) / 1000).toFixed(1)}km`)

// ── 書き出し（★経緯度は書かない） ──
const wr = (name, parts) => { const bufs = parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)); fs.writeFileSync(`${OUT}/${name}`, Buffer.concat(bufs)); return bufs.map((b) => b.length) }
const meta = {
  note: '原点（鴨川デルタ）からのメートル。x 東・y 上・z 南。経緯度は入れていない',
  H0: +H0.toFixed(2), waterY: +WATER_Y.toFixed(2),
  near: { n: near.nx, nx: near.nx, nz: near.nz, x0: EXT.x0, x1: EXT.x1, z0: EXT.z0, z1: EXT.z1, step: NEAR_STEP, bytes: wr('near.bin', [near.pos]), zoneBytes: wr('near-zone.bin', [zone]) },
  far: { n: far.n, R: FAR_R, step: FAR_STEP, bytes: wr('far.bin', [far.pos]) },
  bldg: { nv: bv, ni: bi, count: blds.length, bytes: wr('bldg.bin', [bpos, bidx, bbid]), heights: blds.map((b) => b.h ?? null), usage: blds.map((b) => b.usage ?? null), kyoBytes: wr('bldg-kyo.bin', [style, front]) }, // 便21: 形の種類・通りに面する向き（0〜255＝一周）
  eaves: { n: eaves.length / 3, bytes: wr('eaves.bin', [new Float32Array(eaves), new Uint8Array(ekind)]) }, // 便21: 町家の通り庇と犬矢来
  water: { nv: wpos.length / 3, ni: widx.length, bytes: wr('water.bin', [new Float32Array(wpos), new Uint32Array(widx)]) },
  roads: { nv: rpos.length / 3, ni: ridx.length, bytes: wr('roads.bin', [new Float32Array(rpos), new Uint32Array(ridx), new Uint8Array(rkind)]), auxBytes: wr('roads-aux.bin', [new Float32Array(ralong), new Uint8Array(rwidth)]) }, // 便21: 道の長さの位置・幅（0.1m 刻み）
  riverPath, // 便21: 河川敷の小道の折れ線
  trees: { n: trees.length, bytes: wr('trees.bin', [new Float32Array(trees.flat())]) },
  stones: { n: stones.length / 4, bytes: wr('stones.bin', [new Float32Array(stones)]), kindBytes: wr('stones-kind.bin', [new Uint8Array(stoneKind)]), rows: stoneRows },
  wdepthBytes: wr('near-wdepth.bin', [wdepth]), // 便21: 水の深さ（0.25cm 刻み）
  weirs, // 便21: 堰（落差工・帯工）の線分 [ax, az, bx, bz]
  views,
}
fs.writeFileSync(`${OUT}/geo.json`, JSON.stringify(meta))
fs.writeFileSync(`${D}/build-log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
