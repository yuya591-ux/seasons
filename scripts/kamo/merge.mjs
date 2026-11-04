// 便23: 北の四角（geo/＝build.mjs）と南の四角（geo-s/＝KAMO_REGION=s node build.mjs）を、1つの網（2つの四角に外接する四角）に合わせる。
// 出る物: scripts/kamo/_data/geo-u/（bake.py と pack.mjs が KAMO_GEO=geo-u で読む・git に入れない）。★経緯度は入っていない（原点からのメートルだけ）
//   網（near.bin・near-zone.bin・near-wdepth.bin）: 北の四角は北の便・南の四角は南の便の値。2つの四角の外の点は描かない（本体と焼く台本が和の中の升だけを描く）。高さは遠くの網から補う
//   遠くの網（far.bin）: 北の便の物のまま（南の四角の内側を 6m 下げるのは、本体が南の四角を足す時＝足さない時は前と同じ見え方）
//   建物・道・木・飛び石・町家の庇: 北の便の後ろに南の便を足す（建物の番号・点の番号は北の数だけずらす）。北の数（nA・nvA）を書く
//   水面: 北の便の川の輪の三角形は北の四角の中だけに切り（継ぎ目で南の水面の網と重ねない・五条まで延びていた三角形も落ちる）、南の便の水面の網を足す
//   河川敷の人の道（riverPath）は北の便のまま（人の数は道の数で割り振るので、南の道を足すと窓の前の人が減る）。南の道は riverPathB に置く
// 使い方: node scripts/kamo/merge.mjs
import fs from 'node:fs'

const D = process.env.KAMO_DATA || 'scripts/kamo/_data', GA = D + '/geo', GB = D + '/geo-s', OUT = D + '/geo-u'
fs.mkdirSync(OUT, { recursive: true })
const A = JSON.parse(fs.readFileSync(`${GA}/geo.json`, 'utf8')), B = JSON.parse(fs.readFileSync(`${GB}/geo.json`, 'utf8'))
const log = []
const rd = (dir, name) => { const b = fs.readFileSync(`${dir}/${name}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }
const wr = (name, parts) => { const bufs = parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)); fs.writeFileSync(`${OUT}/${name}`, Buffer.concat(bufs)); return bufs.map((b) => b.length) }
const cat = (T, a, b) => { const o = new T(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o }

const EA = { x0: A.near.x0, x1: A.near.x1, z0: A.near.z0, z1: A.near.z1 }, EB = { x0: B.near.x0, x1: B.near.x1, z0: B.near.z0, z1: B.near.z1 }
if (A.near.step !== B.near.step || EB.z0 !== EA.z1 || (EB.x0 - EA.x0) % A.near.step) throw new Error('北と南の網がそろっていない')
if (Math.abs(A.H0 - B.H0) > 1e-6) throw new Error(`基準の高さが違う: ${A.H0} ${B.H0}`)
const ST = A.near.step
const U = { x0: Math.min(EA.x0, EB.x0), x1: Math.max(EA.x1, EB.x1), z0: Math.min(EA.z0, EB.z0), z1: Math.max(EA.z1, EB.z1) }
const nx = Math.round((U.x1 - U.x0) / ST) + 1, nz = Math.round((U.z1 - U.z0) / ST) + 1
const inA = (x, z, m = 0) => x >= EA.x0 + m && x <= EA.x1 - m && z >= EA.z0 + m && z <= EA.z1 - m
const inB = (x, z, m = 0) => x >= EB.x0 + m && x <= EB.x1 - m && z >= EB.z0 + m && z <= EB.z1 - m
const inU = (x, z, m = 0) => { if (m <= 0) return inA(x, z, m) || inB(x, z, m); const c = (a, b) => inA(a, b) || inB(a, b); return c(x - m, z - m) && c(x + m, z - m) && c(x - m, z + m) && c(x + m, z + m) }

// ── 遠くの網（高さを補うのにも使う） ──
const farP = new Float32Array(rd(GA, 'far.bin')), fn = A.far.n, fR = A.far.R, fS = A.far.step
const farAt = (x, z) => { const u = Math.min(fn - 1.001, Math.max(0, (x + fR) / fS)), v = Math.min(fn - 1.001, Math.max(0, (z + fR) / fS)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * fn + i, h = (q) => farP[q * 3 + 1]
  return (h(k) * (1 - fu) + h(k + 1) * fu) * (1 - fv) + (h(k + fn) * (1 - fu) + h(k + fn + 1) * fu) * fv }
// ── 網 ──
const pA = new Float32Array(rd(GA, 'near.bin')), pB = new Float32Array(rd(GB, 'near.bin'))
const zA = new Uint8Array(rd(GA, 'near-zone.bin')), zB = new Uint8Array(rd(GB, 'near-zone.bin')), dA = new Uint8Array(rd(GA, 'near-wdepth.bin')), dB = new Uint8Array(rd(GB, 'near-wdepth.bin'))
const pBk = fs.existsSync(`${GB}/near-bake.bin`) ? new Float32Array(rd(GB, 'near-bake.bin')) : pB // 南の便の焼く用の網（水路で下げる前）
const pos = new Float32Array(nx * nz * 3), posBake = new Float32Array(nx * nz * 3), zone = new Uint8Array(nx * nz), wdep = new Uint8Array(nx * nz)
let nFromA = 0, nFromB = 0, nFill = 0
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const k = j * nx + i, x = U.x0 + i * ST, z = U.z0 + j * ST
  let y, yb
  if (inA(x, z)) { const ia = Math.round((x - EA.x0) / ST), ja = Math.round((z - EA.z0) / ST), ka = ja * A.near.nx + ia; y = yb = pA[ka * 3 + 1]; zone[k] = zA[ka]; wdep[k] = dA[ka]; nFromA++ }
  else if (inB(x, z)) { const ib = Math.round((x - EB.x0) / ST), jb = Math.round((z - EB.z0) / ST), kb = jb * B.near.nx + ib; y = pB[kb * 3 + 1]; yb = pBk[kb * 3 + 1]; zone[k] = zB[kb]; wdep[k] = dB[kb]; nFromB++ }
  else { y = yb = farAt(x, z); nFill++ }
  pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; posBake[k * 3] = x; posBake[k * 3 + 1] = yb; posBake[k * 3 + 2] = z
}
// 継ぎ目の段（北の便の最後の行と、南の便の最初の行は同じ所＝北の値を使った）。南の便の最初の行との差を数え、南の 4 行（16m）で北の値へなめらかにつなぐ
const JS = Math.round((EA.z1 - U.z0) / ST), IB0 = Math.round((EB.x0 - U.x0) / ST)
let seamMax = 0, seamAfter = 0; { const ja = Math.round((EA.z1 - EA.z0) / ST); for (let ib = 0; ib < B.near.nx; ib++) { const x = EB.x0 + ib * ST, ia = Math.round((x - EA.x0) / ST); const d = pA[(ja * A.near.nx + ia) * 3 + 1] - pB[ib * 3 + 1]; seamMax = Math.max(seamMax, Math.abs(d))
  // 継ぎ目が鴨川の水の点の所は、北の四角の縁の 4 行を南の値へ寄せる（北の便の縁の行に、下流が上流より高い誤りが入っていた・南の便で直した）。ほかは南の 4 行を北の値へ寄せる
  if (zA[ja * A.near.nx + ia] === 2 && zB[ib] === 2) { const q5 = ((JS - 5) * nx + IB0 + ib) * 3 + 1, y5 = pos[q5], b5 = posBake[q5], ys = pB[ib * 3 + 1], ysb = pBk[ib * 3 + 1]; for (let r = 0; r <= 4; r++) { const q = ((JS - r) * nx + IB0 + ib) * 3 + 1; pos[q] = ys + (y5 - ys) * (r / 5); posBake[q] = ysb + (b5 - ysb) * (r / 5) } } // 北の縁の 5 行目から南の値へ線でつなぐ
  else for (let r = 1; r <= 4; r++) { pos[((JS + r) * nx + IB0 + ib) * 3 + 1] += d * (1 - r / 5); posBake[((JS + r) * nx + IB0 + ib) * 3 + 1] += d * (1 - r / 5) } } }
log.push(`網: ${nx}×${nz} 点（x ${U.x0}〜${U.x1}・z ${U.z0}〜${U.z1}）・北の便 ${nFromA}・南の便 ${nFromB}・和の外（遠くの網で補った・描かない）${nFill}・継ぎ目の高さの差の一番大きい所 ${seamMax.toFixed(3)} m`)

// ── 建物 ──
const bufBA = fs.readFileSync(`${GA}/bldg.bin`), bufBB = fs.readFileSync(`${GB}/bldg.bin`)
const splitB = (buf, m) => { const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length); return { pos: new Float32Array(ab, 0, m.nv * 3), idx: new Uint32Array(ab, m.nv * 12, m.ni), bid: new Uint16Array(ab.slice(m.nv * 12 + m.ni * 4, m.nv * 12 + m.ni * 4 + m.nv * 2)) } }
const ba = splitB(bufBA, A.bldg), bb = splitB(bufBB, B.bldg)
const nBA = A.bldg.count, nBB = B.bldg.count
if (nBA + nBB > 65535) throw new Error('建物が 16 ビットの番号に収まらない')
const bidx = cat(Uint32Array, ba.idx, bb.idx.map((v) => v + A.bldg.nv)), bbid = cat(Uint16Array, ba.bid, bb.bid.map((v) => v + nBA))
const kA = fs.readFileSync(`${GA}/bldg-kyo.bin`), kB = fs.readFileSync(`${GB}/bldg-kyo.bin`)
const kyo = Buffer.concat([kA.subarray(0, nBA), kB.subarray(0, nBB), kA.subarray(nBA, nBA * 2), kB.subarray(nBB, nBB * 2)])
log.push(`建物: 北 ${nBA} 棟（点 ${A.bldg.nv}）・南 ${nBB} 棟（点 ${B.bldg.nv}）`)
// ── 町家の庇 ──
const eaveOf = (dir, n) => { const b = fs.readFileSync(`${dir}/eaves.bin`); return { p: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + n * 12)), k: new Uint8Array(b.subarray(n * 12, n * 13)) } }
const eA = eaveOf(GA, A.eaves.n), eB = eaveOf(GB, B.eaves.n)
// ── 水面: 北の便の三角形を北の四角の中に切る（4つの縁で順に切る） ──
const wOf = (dir, m) => { const b = fs.readFileSync(`${dir}/water.bin`), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length); return { p: new Float32Array(ab, 0, m.nv * 3), i: new Uint32Array(ab, m.nv * 12, m.ni) } }
const wA = wOf(GA, A.water), wB = wOf(GB, B.water)
const wpos = [], widx = []
let nCut = 0, nClip = 0
{
  const planes = [[(p) => p[0] - EA.x0], [(p) => EA.x1 - p[0]], [(p) => p[2] - EA.z0], [(p) => EA.z1 - p[2]]]
  for (let t = 0; t < wA.i.length; t += 3) {
    let poly = [0, 1, 2].map((q) => { const v = wA.i[t + q]; return [wA.p[v * 3], wA.p[v * 3 + 1], wA.p[v * 3 + 2]] })
    const allIn = process.env.KAMO_MUT === 'noclip' || poly.every((p) => inA(p[0], p[2])) // KAMO_MUT=noclip は外し回し用（便23・切らない）
    if (!allIn) {
      nClip++
      for (const [f] of planes) { const out = []; for (let q = 0; q < poly.length; q++) { const a = poly[q], b = poly[(q + 1) % poly.length], fa = f(a), fb = f(b); if (fa >= 0) out.push(a); if ((fa >= 0) !== (fb >= 0)) { const s = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]) } } poly = out; if (poly.length < 3) break }
      if (poly.length < 3) { nCut++; continue }
    }
    const base = wpos.length / 3; for (const p of poly) wpos.push(...p)
    for (let q = 1; q < poly.length - 1; q++) widx.push(base, base + q, base + q + 1)
  }
  const base = wpos.length / 3; for (const v of wB.p) wpos.push(v); for (const v of wB.i) widx.push(v + base)
}
log.push(`水面: 北の便の三角形 ${wA.i.length / 3}（北の四角の縁で切った ${nClip}・まるごと外で落とした ${nCut}）＋南の便の水面の網 ${wB.i.length / 3}＝${widx.length / 3}`)
// ── 道 ──
const rOf = (dir, m) => { const b = fs.readFileSync(`${dir}/roads.bin`), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length), x = fs.readFileSync(`${dir}/roads-aux.bin`), xb = x.buffer.slice(x.byteOffset, x.byteOffset + x.length)
  return { p: new Float32Array(ab, 0, m.nv * 3), i: new Uint32Array(ab, m.nv * 12, m.ni), k: new Uint8Array(ab, m.nv * 12 + m.ni * 4, m.nv), al: new Float32Array(xb, 0, m.nv), w: new Uint8Array(xb, m.nv * 4, m.nv) } }
const rA = rOf(GA, A.roads), rB = rOf(GB, B.roads)
// ── 木・飛び石 ──
const f32 = (dir, n) => new Float32Array(rd(dir, n))
const trees = cat(Float32Array, f32(GA, 'trees.bin'), f32(GB, 'trees.bin'))
const stones = cat(Float32Array, f32(GA, 'stones.bin'), f32(GB, 'stones.bin')), stoneKind = Buffer.concat([fs.readFileSync(`${GA}/stones-kind.bin`), fs.readFileSync(`${GB}/stones-kind.bin`)])
log.push(`木: 北 ${A.trees.n}・南 ${B.trees.n}／飛び石: 北 ${A.stones.n}・南 ${B.stones.n}／道の点: 北 ${A.roads.nv}・南 ${B.roads.nv}／町家の庇の三角形: 北 ${A.eaves.n / 3}・南 ${B.eaves.n / 3}`)

// ── 書き出し（★経緯度は書かない） ──
const meta = {
  note: '原点（鴨川デルタ）からのメートル。x 東・y 上・z 南。経緯度は入れていない（便23: 北の四角と南の四角を合わせた網）',
  H0: A.H0, waterY: A.waterY,
  near: { n: nx, nx, nz, x0: U.x0, x1: U.x1, z0: U.z0, z1: U.z1, step: ST, regions: { A: EA, B: EB }, bytes: wr('near.bin', [pos]), zoneBytes: wr('near-zone.bin', [zone]), bakeBytes: wr('near-bake.bin', [posBake]) }, // near-bake.bin＝焼く用（南の水路で下げる前）
  far: { ...A.far, bytes: wr('far.bin', [farP]) },
  bldg: { nv: A.bldg.nv + B.bldg.nv, ni: A.bldg.ni + B.bldg.ni, count: nBA + nBB, nA: nBA, nvA: A.bldg.nv, bytes: wr('bldg.bin', [cat(Float32Array, ba.pos, bb.pos), bidx, bbid]), heights: [...A.bldg.heights, ...B.bldg.heights], usage: [...A.bldg.usage, ...B.bldg.usage], kyoBytes: wr('bldg-kyo.bin', [kyo]) },
  eaves: { n: A.eaves.n + B.eaves.n, nA: A.eaves.n, bytes: wr('eaves.bin', [cat(Float32Array, eA.p, eB.p), cat(Uint8Array, eA.k, eB.k)]) },
  water: { nv: wpos.length / 3, ni: widx.length, nvA: wpos.length / 3 - wB.p.length / 3, niA: widx.length - wB.i.length, bytes: wr('water.bin', [new Float32Array(wpos), new Uint32Array(widx)]) },
  roads: { nv: A.roads.nv + B.roads.nv, ni: A.roads.ni + B.roads.ni, nvA: A.roads.nv, bytes: wr('roads.bin', [cat(Float32Array, rA.p, rB.p), cat(Uint32Array, rA.i, rB.i.map((v) => v + A.roads.nv)), cat(Uint8Array, rA.k, rB.k)]), auxBytes: wr('roads-aux.bin', [cat(Float32Array, rA.al, rB.al), cat(Uint8Array, rA.w, rB.w)]) },
  riverPath: A.riverPath,
  bridgeEdges: A.bridgeEdges, lamps: A.lamps, marks: A.marks,
  // 南の四角の一覧（本体が南の四角を足す時に使う）
  south: { canals: B.canals || [], riverPath: B.riverPath, bridgeEdges: B.bridgeEdges, lamps: B.lamps, benches: B.marks.benches, weirs: [...B.stones.rows, ...B.weirs] },
  trees: { n: A.trees.n + B.trees.n, nA: A.trees.n, bytes: wr('trees.bin', [trees]) },
  stones: { n: A.stones.n + B.stones.n, nA: A.stones.n, bytes: wr('stones.bin', [stones]), kindBytes: wr('stones-kind.bin', [new Uint8Array(stoneKind)]), rows: A.stones.rows },
  wdepthBytes: wr('near-wdepth.bin', [wdep]),
  weirs: A.weirs,
  views: A.views,
}
fs.writeFileSync(`${OUT}/geo.json`, JSON.stringify(meta))
fs.writeFileSync(`${D}/merge-log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
