// 外の町（便22）: 鴨川の町（デルタから京大・吉田山まで・光を焼いた細かい作り）の外側を、軽い作りで足す。
// 西は金閣寺と衣笠山・南は京都駅と京都タワー・木屋町・河原町・先斗町・祇園・岡崎まで（原点からの東西 -4400〜2400m・南北 -1600〜5400m）。
// 形は地図のデータ（scripts/kamo/outer-build.mjs が詰めた public/kamo/outer/・原点からのメートル・経緯度なし）:
//   地形＝国土地理院の標高（5m）を 8m の網に／建物＝PLATEAU 京都市 LOD2 の形から、向きのある箱（凸包の最小の長方形）と屋根／道・水・緑・木＝© OpenStreetMap contributors
// 描き方: 建物は箱を並べて描く（InstancedMesh）。壁の模様・窓・京町家の格子・瓦は鴨川の町と同じ描き方（kamoTown.js の useTex・useWindows・useKyo）。
//   焼いた光は無いので、空の光の届き方は「壁の足もとほど暗い」計算で代える（useSkyAO）。影は落とさない（日の影の図は鴨川の町の範囲だけ）
//   水の映り込み（鴨川の町の Water）には外の町を描かない（重さのため）
import * as THREE from 'three'
import { ShapeUtils, Vector2 } from 'three'
import { buildMeisho } from './kamoMeisho.js'
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const OV = '?v=22' // データの版の印（控えが前の版を返して混ざらないように）

async function gunzip(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`外の町のデータが読めない: ${r.status} ${url}`)
  if (typeof DecompressionStream === 'undefined') throw new Error('この端末は外の町のデータをほどけない')
  return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}
const view = (buf, sec) => new globalThis[sec.type](buf, sec.off, sec.n)

/** 外の町のデータを取ってくる（鴨川の町が開いた後に裏で読む） */
export async function loadOuter(base) {
  const meta = await (await fetch(base + 'outer.json' + OV)).json()
  const F = meta.files
  const [terrain, bldg, roads, water, trees] = await Promise.all(['terrain', 'bldg', 'roads', 'water', 'trees'].map((k) => gunzip(base + F[k].file + OV)))
  return { meta, buf: { terrain, bldg, roads, water, trees } }
}

/**
 * 外の町を組む。h＝kamoTown.js の手（同じ描き方を使うため）:
 *   { scene, keep, useTex, useWindows, useKyo, useRoad, gridTiles, chain, addKey, S, TK, SNOW, RAIN, NIGHT, GRASS, LEAF, WHITE, T, waterNormalTex, low, sunDir, fogColor }
 */
export function buildOuter(od, h) {
  const { meta } = od, OX = meta.OX, C = meta.core
  const { keep, useTex, useWindows, useKyo, useRoad, gridTiles, chain, addKey, S, SNOW, RAIN, NIGHT, low } = h
  const group = new THREE.Group(); group.userData.part = 'outer'; group.name = 'kamoOuter'
  const info = { boxes: 0, polys: 0, trees: 0, roads: 0, water: 0, chunks: 0, styles: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], roofs: [0, 0, 0] }
  const inCore = (x, z, m = 0) => x >= C.x0 + m && x <= C.x1 - m && z >= C.z0 + m && z <= C.z1 - m
  // 便23: 鴨川の町の南の四角（河原町・木屋町・先斗町・祇園）を足した時だけ、その中（データで抜いてある北の四角の外の分）を描かない・地形を下げる。足していない時は前のまま
  const inS = h.inSouth || (() => false)
  info.southCut = { boxes: 0, polys: 0, roads: 0, water: 0, trees: 0, terrain: 0 }
  let rs = 2205; const R = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296 }

  // ── 空の光の届き方の代わり: 壁は足もとほど暗く（路地と軒下）、屋根と屋上はほぼ開けた空。夜は弱く ──
  function useSkyAO(mat) {
    mat.onBeforeCompile = chain(mat.onBeforeCompile, (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', `{ float kh = vGW.y - vKB.x; float kao = abs(vGN.y) > 0.45 ? 0.95 : mix(0.42, 1.0, smoothstep(0.0, 9.0, kh)) * mix(0.85, 1.0, smoothstep(9.0, 30.0, kh));
    reflectedLight.indirectDiffuse *= kao; reflectedLight.directDiffuse *= mix(0.75, 1.0, smoothstep(0.0, 4.0, kh)); }`)
    })
    addKey(mat, 'skyAO')
  }

  // ── 地形（8m の網・鴨川の町の範囲の内側は 6m 下げてある）。地面の種類で色: 0 町・1 緑・2 水の底・3 河川敷 ──
  {
    const hs0 = view(od.buf.terrain, meta.files.terrain.secs.h), zone = view(od.buf.terrain, meta.files.terrain.secs.zone)
    let hs = hs0 // 便23: 南の四角の内側（縁から 4m）を 6m 下げて鴨川の町の網の下に隠す（北の四角はデータで下げてある）
    if (h.inSouth) { hs = Int16Array.from(hs0); const d = Math.round(6 / meta.hStep); for (let j = 0; j < meta.nz; j++) for (let i = 0; i < meta.nx; i++) if (inS(OX.x0 + i * meta.step, OX.z0 + j * meta.step, 4)) { hs[j * meta.nx + i] -= d; info.southCut.terrain++ } }
    const cTown = new THREE.Color(0x8a867e), cGrass = new THREE.Color(GRASS(S)), cForest = new THREE.Color(S === 'autumn' ? 0x4e5a34 : S === 'winter' ? 0x3e4a3a : 0x34502e), cBed = new THREE.Color(0x7d7a68), cBank = new THREE.Color(GRASS(S)).lerp(new THREE.Color(0x8a8272), 0.35), cWall = new THREE.Color(0x8c877c), WHITE = new THREE.Color(0xf2f4f6)
    const vn = (x, z) => { const s = Math.sin(x * 0.071 + z * 0.113) * 0.5 + Math.sin(x * 0.023 - z * 0.041) * 0.5; return s * 0.5 + 0.5 }
    const paint = (c, x, y, z, ny, k) => {
      const zz = zone[k]
      if (zz === 2) c.copy(cBed)
      else if (zz === 3) c.copy(cBank).offsetHSL(0, 0, (vn(x, z) - 0.5) * 0.08)
      else if (zz === 1) c.copy(y > 25 || ny < 0.9 ? cForest : cGrass).offsetHSL(0, 0, (vn(x, z) - 0.5) * 0.08)
      else if (ny < 0.8) c.copy(cWall)
      else c.copy(cTown).lerp(cForest, Math.min(1, Math.max(0, (y - 30) / 40))) // 山の裾（東山・衣笠山）は森の色へ
      if (SNOW && zz !== 2 && ny > 0.6) c.lerp(WHITE, 0.62)
    }
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RAIN ? 0.6 : 0.96, metalness: 0 }))
    useTex(m, { a: 'gravel_road', b: 'grass_path_2', tile: 3.2, tileB: 3.5 })
    for (const g of gridTiles({ nx: meta.nx, nz: meta.nz, x0: OX.x0, z0: OX.z0, step: meta.step, hs, hq: meta.hStep, dec: low ? 2 : 1, tiles: [8, 8], paint, withUv1: false })) {
      const mesh = new THREE.Mesh(g, m); mesh.userData.part = 'outerTerrain'; mesh.receiveShadow = false; group.add(mesh)
    }
    info.terrainPts = meta.nx * meta.nz
  }

  // ── 道・橋・線路（鴨川の町の道と同じ描き方。焼いた光は無い） ──
  {
    const sec = meta.files.roads.secs, q = meta.roadQ
    const p16 = view(od.buf.roads, sec.pos), runs = view(od.buf.roads, sec.runs), kind = view(od.buf.roads, sec.kind), al = view(od.buf.roads, sec.along), wd = view(od.buf.roads, sec.width)
    const n = p16.length / 3, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), rd = new Float32Array(n * 4), c = new THREE.Color()
    const CK = [0x55575a, 0x9a948a, 0x8d8a84, 0x6a5e52]
    for (let i = 0; i < n; i++) {
      pos[i * 3] = p16[i * 3] * q.xz; pos[i * 3 + 1] = p16[i * 3 + 1] * q.y; pos[i * 3 + 2] = p16[i * 3 + 2] * q.xz
      c.setHex(CK[kind[i]] ?? CK[0]); if (SNOW && kind[i] !== 3) c.lerp(new THREE.Color(0xf2f4f6), kind[i] === 0 ? 0.35 : 0.55); col.set([c.r, c.g, c.b], i * 3)
      rd.set([i % 2 ? -1 : 1, al[i] * q.along, wd[i] / 10, kind[i] === 3 ? 4 : kind[i]], i * 4)
    }
    const idx = []; let base = 0
    for (const L of runs) { for (let i = 0; i < L - 1; i++) { const a = base + i * 2; if (h.inSouth) { const mx = (pos[a * 3] + pos[a * 3 + 3] + pos[a * 3 + 6] + pos[a * 3 + 9]) / 4, mz = (pos[a * 3 + 2] + pos[a * 3 + 5] + pos[a * 3 + 8] + pos[a * 3 + 11]) / 4; if (inS(mx, mz, -3)) { info.southCut.roads++; continue } } idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) } base += L * 2 }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aRd', new THREE.BufferAttribute(rd, 4)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1)); g.computeVertexNormals()
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RAIN ? 0.42 : 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }))
    useTex(m, { a: 'asphalt_02', b: 'gravel_road', tile: 5, tileB: 2.2 }); useRoad(m)
    const mesh = new THREE.Mesh(g, m); mesh.userData.part = 'outerRoads'; group.add(mesh)
    info.roads = runs.length
  }

  let waterU = null
  // ── 水（池・堀・水路）。空の色を映す軽い水（鴨川の本流は鴨川の町の Water が描く） ──
  {
    const sec = meta.files.water.secs, wp = view(od.buf.water, sec.pos), wi0 = view(od.buf.water, sec.idx)
    const wi = h.inSouth ? (() => { const o = []; for (let t = 0; t < wi0.length; t += 3) { const cx = (wp[wi0[t] * 3] + wp[wi0[t + 1] * 3] + wp[wi0[t + 2] * 3]) / 3, cz = (wp[wi0[t] * 3 + 2] + wp[wi0[t + 1] * 3 + 2] + wp[wi0[t + 2] * 3 + 2]) / 3; if (inS(cx, cz, 0)) { info.southCut.water++; continue } o.push(wi0[t], wi0[t + 1], wi0[t + 2]) } return o })() : wi0
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(wp), 3)); g.setIndex(new THREE.BufferAttribute(Uint32Array.from(wi), 1))
    const sky = new THREE.Color(h.fogColor).lerp(new THREE.Color(h.T.hemi[0]), NIGHT ? 0.2 : 0.45)
    const m = keep(new THREE.ShaderMaterial({
      fog: true, transparent: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSky: { value: sky }, uBody: { value: new THREE.Color(RAIN ? 0x3c4034 : NIGHT ? 0x0e1414 : 0x31453c) }, uSun: { value: new THREE.Color(h.T.sun).multiplyScalar(NIGHT || RAIN ? 0.1 : 1) }, uSunDir: { value: h.sunDir.clone() }, uT: { value: 0 }, uN: { value: h.waterNormalTex } }]),
      vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
      fragmentShader: `uniform vec3 uSky, uBody, uSun, uSunDir; uniform float uT; uniform sampler2D uN; varying vec3 vW;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec3 n1 = texture2D(uN, vW.xz / 31.0 + vec2(uT * 0.011, uT * 0.007)).rgb * 2.0 - 1.0, n2 = texture2D(uN, vW.xz / 13.0 - vec2(uT * 0.013, -uT * 0.009)).rgb * 2.0 - 1.0;
  vec3 nn = normalize(vec3((n1.x + n2.x) * 0.12, 1.0, (n1.y + n2.y) * 0.12));
  vec3 V = normalize(cameraPosition - vW); float fr = 0.03 + 0.97 * pow(1.0 - max(dot(V, nn), 0.0), 5.0);
  vec3 Rf = reflect(-V, nn); float sp = pow(max(dot(Rf, normalize(uSunDir)), 0.0), 220.0);
  gl_FragColor = vec4(mix(uBody, uSky, fr) + uSun * sp * 1.2, 1.0);
#include <fog_fragment>
}`,
    }))
    const mesh = new THREE.Mesh(g, m); mesh.userData.part = 'outerWater'; group.add(mesh)
    info.water = wi.length / 3; waterU = m.uniforms.uT
  }

  // ── 建物: 向きのある箱（壁と屋上）＋屋根（切妻・寄棟）。区画（1400m）ごと・背の高さ（12m）で窓の刻みを分ける ──
  const wallLo = keep(new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.88, metalness: 0 })), wallHi = keep(new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 })), roofM = keep(new THREE.MeshStandardMaterial({ roughness: RAIN ? 0.45 : 0.7, metalness: 0 }))
  for (const [m, tall] of [[wallLo, false], [wallHi, true]]) { useWindows(m, tall); useTex(m, tall ? { a: 'concrete_wall_004', tile: 4, mode: 'tri', ns: 0.5 } : { a: 'grey_plaster_02', tile: 3, mode: 'tri', ns: 0.5 }); useKyo(m, true); useSkyAO(m) }
  useTex(roofM, { a: 'grey_roof_tiles', tile: 3, mode: 'xz' }); useKyo(roofM, false); useSkyAO(roofM)
  // 箱の形（底は無し・足もとが 0・上が 1）と屋根の形（底は無し・棟は x の向き）
  const boxGeo = keep((() => { const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); const idx = g.index.array, keepI = []; for (let t = 0; t < idx.length; t += 3) { const y = (g.attributes.position.getY(idx[t]) + g.attributes.position.getY(idx[t + 1]) + g.attributes.position.getY(idx[t + 2])) / 3; if (y > 0.01) keepI.push(idx[t], idx[t + 1], idx[t + 2]) } g.setIndex(keepI); return g })())
  const prism = (hip) => { // 単位の屋根（x −0.5〜0.5・z −0.5〜0.5・高さ 0〜1）。寄棟は棟の長さを 0.4
    const r0 = hip ? -0.2 : -0.5, r1 = hip ? 0.2 : 0.5, P = [], add = (a, b, c) => P.push(...a, ...b, ...c)
    const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], Cc = [0.5, 0, 0.5], Dd = [-0.5, 0, 0.5], E = [r0, 1, 0], F = [r1, 1, 0]
    add(A, E, F); add(A, F, B) // 北の面
    add(Dd, Cc, F); add(Dd, F, E) // 南の面
    add(A, Dd, E); add(B, F, Cc) // 妻の三角（寄棟は屋根の面）
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g
  }
  const gableGeo = keep(prism(false)), hipGeo = keep(prism(true))
  const WALL = [0xddd6c8, 0xcfc6b4, 0xe8e4da, 0xbcae98, 0xc8ccd0, 0xd4c8b0, 0x9a8a78, 0xa8b0b4, 0xe2d8c0, 0x8a7a6a, 0xc4b8a0, 0xb8b4a8], ROOF = [0x4a4f57, 0x5a6878, 0x4e463e, 0x6a5444, 0x3e444c, 0x7a6a5a, 0x2e3238]
  {
    const sec = meta.files.bldg.secs, q = meta.boxQ, st = meta.boxStride
    const bi = view(od.buf.bldg, sec.box), bu = new Uint16Array(bi.buffer, bi.byteOffset, bi.length), nB = bi.length / st
    const CELL = 1400, cells = new Map(), skip = new Uint8Array(nB) // 便23: 南の四角で描かない箱（道案内の表でも当たらない）
    const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3()
    for (let i = 0; i < nB; i++) {
      if (h.inSouth && inS(bi[i * st] * q.xz, bi[i * st + 1] * q.xz, 100)) { skip[i] = 1; info.southCut.boxes++; continue } // 鴨川の町が描く建物（和の縁から 100m 内側＝build.mjs の BLDG_M）
      const o = i * st, cx = bi[o] * q.xz, cz = bi[o + 1] * q.xz, w = bu[o + 2] * q.size, d = bu[o + 3] * q.size, hh = bu[o + 4] * q.size, base = bi[o + 5] * q.base, ang = (bu[o + 6] / 65535) * Math.PI, sr = bu[o + 7], style = sr & 15, roof = (sr >> 4) & 3, front = (bu[o + 8] / 255) * Math.PI * 2 - Math.PI
      if (low && hh < 4 && w * d < 30) continue // iPhone の段: 物置ほどの小さな建物は描かない
      const key = Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL)
      let cell = cells.get(key); if (!cell) { cell = { lo: [], hi: [], gable: [], hip: [] }; cells.set(key, cell) }
      const rnd = Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1), kb = [base, front, style, rnd]
      const wc = WALL[Math.floor(rnd * 997) % WALL.length], rc = SNOW ? 0xd8dce0 : ROOF[Math.floor(rnd * 541) % ROOF.length] // 鴨川の町と同じ壁と屋根の色の並び（建物ごと）
      qt.setFromAxisAngle(up, -ang)
      const body = m4.compose(v.set(cx, base, cz), qt, sc.set(w, hh, d)).clone(); (hh > 12 ? cell.hi : cell.lo).push({ m: body, kb, c: wc })
      info.styles[style]++; info.roofs[roof]++
      if (roof) { // 屋根: 町家は棟を通りに平行に（通りの向きが箱の奥行きの向きに近いなら棟は長さの向き＝x のまま。そうでなければ 90° 回す）。ほかは長い辺に棟
        let rw = w, rdp = d, ra = -ang
        if (style === 1) { const fx = Math.sin(front), fz = Math.cos(front), ux = Math.cos(ang), uz = Math.sin(ang); if (Math.abs(fx * ux + fz * uz) > 0.7) { rw = d; rdp = w; ra = -ang + Math.PI / 2 } }
        const ov = style === 5 ? 1.2 : 0.45, pitch = style === 5 ? 0.6 : style === 1 ? 0.45 : style === 2 ? 0.5 : 0.42
        qt.setFromAxisAngle(up, ra)
        const rm = m4.compose(v.set(cx, base + hh + 0.02, cz), qt, sc.set(rw + ov * 2, pitch * (rdp / 2 + ov), rdp + ov * 2)).clone()
        ;(roof === 1 ? cell.gable : cell.hip).push({ m: rm, kb, c: rc })
      }
      info.boxes++
    }
    const mk = (geo, mat, list, part) => {
      if (!list.length) return
      const im = new THREE.InstancedMesh(geo, mat, list.length), kb = new Float32Array(list.length * 4)
      const cc = new THREE.Color(); list.forEach((t, k) => { im.setMatrixAt(k, t.m); kb.set(t.kb, k * 4); im.setColorAt(k, cc.setHex(t.c)) })
      im.geometry = geo.clone(); im.geometry.setAttribute('aKB', new THREE.InstancedBufferAttribute(kb, 4)); keep(im.geometry)
      im.castShadow = false; im.receiveShadow = false; im.userData.part = part; im.computeBoundingSphere(); group.add(im)
    }
    for (const cell of cells.values()) { mk(boxGeo, wallLo, cell.lo, 'outerBldg'); mk(boxGeo, wallHi, cell.hi, 'outerBldg'); mk(gableGeo, roofM, cell.gable, 'outerRoof'); mk(hipGeo, roofM, cell.hip, 'outerRoof'); info.chunks++ }
    // 箱に収まらない大きな建物（駅ビルなど）は外形のまま立てる（壁と平らな屋上）
    const pp = view(od.buf.bldg, sec.poly), pts = view(od.buf.bldg, sec.polyPts), PS = meta.polyStride
    const P = [], KB = [], I = []
    for (let i = 0; i < pp.length / PS; i++) {
      const base = pp[i * PS] * q.base, hh = pp[i * PS + 1] * q.size, style = pp[i * PS + 2], front = (pp[i * PS + 3] / 255) * Math.PI * 2 - Math.PI, n = pp[i * PS + 4], o = pp[i * PS + 5]
      const ring = []; for (let k = 0; k < n; k++) ring.push(new Vector2(pts[(o + k) * 2] * q.xz, pts[(o + k) * 2 + 1] * q.xz))
      if (h.inSouth) { let mx = 0, mz = 0; for (const r of ring) { mx += r.x; mz += r.y } if (inS(mx / n, mz / n, 100)) { info.southCut.polys++; continue } }
      if (ShapeUtils.isClockWise(ring)) ring.reverse()
      const kb = [base, front, style, (i * 0.618) % 1]
      for (let k = 0; k < n; k++) { const a = ring[k], b = ring[(k + 1) % n], v0 = P.length / 3; P.push(a.x, base, a.y, b.x, base, b.y, b.x, base + hh, b.y, a.x, base + hh, a.y); for (let r = 0; r < 4; r++) KB.push(...kb); I.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2) }
      const v0 = P.length / 3; for (const a of ring) { P.push(a.x, base + hh, a.y); KB.push(...kb) }
      for (const t of ShapeUtils.triangulateShape(ring, [])) I.push(v0 + t[0], v0 + t[2], v0 + t[1])
      info.polys++
    }
    if (P.length) {
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aKB', new THREE.Float32BufferAttribute(KB, 4)); g.setIndex(I); g.computeVertexNormals()
      const mesh = new THREE.Mesh(g, wallHi); mesh.userData.part = 'outerBldg'; group.add(mesh)
    }
    od.boxes = { bi, bu, nB, st, q, skip } // 道案内の表（建物の上の高さ）に使う
  }

  // ── 名所（金閣・京都タワー・西楼門・八坂の塔・大鳥居・応天門＝kamoMeisho.js）。outermeisho=0 は外し回し用 ──
  if (!/[?&]outermeisho=0/.test(location.search)) {
    try { const mei = buildMeisho({ marks: meta.marks, keep, NIGHT, DUSK: h.TK === 'dusk', SNOW }); group.add(mei.group); info.meisho = mei.info } catch (e) { console.warn('外の町の名所を組めなかった:', e && e.message) }
  }
  // 名所の高さ（飛ぶ時の当たり）: [x, z, 半径, 上の高さ]
  { const M = meta.marks, n = []; const p = (k, r, hh) => { if (M[k] && info.meisho && info.meisho[k]) n.push([M[k].x, M[k].z, r, M[k].y + hh]) }
    p('kinkaku', 8.5, 12.6); p('tower', 6.5, 131); p('romon', 6.5, 12); p('yasakaTo', 7, 46); p('heianTorii', 17, 26); p('otenmon', 16, 16)
    if (M.tower && info.meisho && info.meisho.tower) n.push([M.tower.x, M.tower.z, 28, M.tower.y + 31])
    od.meishoNav = n }

  // ── 木（森・公園・庭・並木）。樹冠は丸い塊（近い区画は細かく・遠い区画は粗く）と幹 ──
  const treeCells = []
  {
    const t = view(od.buf.trees, meta.files.trees.secs.t), n = t.length / 6
    const LEAFS = h.LEAF
    // 樹冠: 近い区画は丸い塊を 4 つ寄せた形（輪郭がでこぼこ）、遠い区画は 1 つ。向きは塊の中心から外へ（なめらかな陰）、下ほど暗く（葉の茂りの奥の陰）
    const lobeGeo = (lobes) => { const parts = lobes.map(([lx, ly, lz, lr]) => { const g = new THREE.IcosahedronGeometry(lr, 0); const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const nx = p.getX(i), ny = p.getY(i), nz = p.getZ(i), l = Math.hypot(nx, ny, nz) || 1; n.setXYZ(i, nx / l, ny / l, nz / l); p.setXYZ(i, nx + lx, ny + ly, nz + lz); const sh = 0.5 + 0.5 * Math.max(0, Math.min(1, (ny + ly + 1) / 1.9)); col.set([sh, sh, sh], i * 3) } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g }); const m = BGU.mergeGeometries(parts); parts.forEach((g) => g.dispose()); return m }
    const crownHi = keep(lobeGeo([[0, 0.15, 0, 0.72], [0.42, -0.12, 0.18, 0.58], [-0.36, -0.1, -0.28, 0.6], [-0.08, -0.05, 0.45, 0.55]])), crownLo = keep(lobeGeo([[0, 0, 0, 1]])), trunkGeo = keep(new THREE.CylinderGeometry(0.1, 0.18, 1, 5, 1, true).translate(0, 0.5, 0))
    const crownMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, vertexColors: true })), trunkMat = keep(new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 1 }))
    const CELL = 700, cells = new Map(), m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      if (low && i % 2) continue
      const x = t[i * 6], y = t[i * 6 + 1], z = t[i * 6 + 2], hh = t[i * 6 + 3], w = t[i * 6 + 4], kind = t[i * 6 + 5], r = w * 0.5 * (kind === 1 ? 1.25 : 1.1)
      const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); let cell = cells.get(key); if (!cell) { cell = { cx: (Math.floor(x / CELL) + 0.5) * CELL, cz: (Math.floor(z / CELL) + 0.5) * CELL, list: [] }; cells.set(key, cell) }
      qt.setFromAxisAngle(up, R() * 6.283)
      const rw = r * (kind === 2 ? 1.25 : 1.1), cy = Math.min(hh * 0.42, rw * 0.95) // 樹冠を低く広く（幹が見えるのは下の 3 割ほど）
      const crown = m4.compose(v.set(x, y + Math.max(hh - cy, cy + 0.6), z), qt, sc.set(rw * (0.9 + R() * 0.2), cy, rw * (0.9 + R() * 0.2))).clone()
      const trunk = m4.compose(v.set(x, y, z), qt, sc.set(r * 0.75, Math.max(1, hh - cy * 1.5), r * 0.75)).clone()
      c.setHex(kind === 1 && S === 'spring' ? LEAFS[0] : R() < (S === 'autumn' ? 0.55 : 0.25) ? LEAFS[0] : LEAFS[1]).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.1, (R() - 0.5) * 0.1).multiplyScalar(0.8)
      if (SNOW) c.lerp(new THREE.Color(0xf2f4f6), 0.35)
      if (h.inSouth && inS(x, z, -2)) { info.southCut.trees++; continue } // 便23: 南の四角の中の木は鴨川の町が植える（乱数は回してから抜く＝ほかの木の形を変えない）
      cell.list.push({ crown, trunk, col: c.clone() })
    }
    for (const cell of cells.values()) {
      const L = cell.list.length; if (!L) continue
      const hi = new THREE.InstancedMesh(crownHi, crownMat, L), lo = new THREE.InstancedMesh(crownLo, crownMat, L), tr = new THREE.InstancedMesh(trunkGeo, trunkMat, L)
      cell.list.forEach((q2, k) => { hi.setMatrixAt(k, q2.crown); lo.setMatrixAt(k, q2.crown); hi.setColorAt(k, q2.col); lo.setColorAt(k, q2.col); tr.setMatrixAt(k, q2.trunk) })
      for (const im of [hi, lo, tr]) { im.userData.part = 'outerTree'; im.castShadow = false; im.computeBoundingSphere(); group.add(im) }
      treeCells.push({ cx: cell.cx, cz: cell.cz, hi, lo, tr })
      info.trees += L
    }
    od.trees = t
  }

  let near = -1
  return {
    group, info,
    /** 毎こま: 水の時計・近い区画の木だけ細かく（目から 900m） */
    update(dt, cam) {
      if (waterU) waterU.value += dt
      const cx = cam.position.x, cz = cam.position.z
      for (const c of treeCells) { const d = Math.hypot(c.cx - cx, c.cz - cz), nr = d < 900; c.hi.visible = nr; c.tr.visible = nr && d < 700; c.lo.visible = !nr }
      near = cx
    },
  }
}

// 区画のことば（居場所の名）: 原点からの m の大まかな四角
export const OUTER_PLACES = [
  { name: '金閣寺', x0: -4250, x1: -3800, z0: -1300, z1: -800 },
  { name: '京都駅', x0: -1700, x1: -900, z0: 4850, z1: 5150 },
  { name: '京都タワー', x0: -1300, x1: -1100, z0: 4620, z1: 4800 },
  { name: '祇園', x0: 200, x1: 750, z0: 2750, z1: 3350 },
  { name: '先斗町', x0: -170, x1: -90, z0: 2200, z1: 2930 },
  { name: '木屋町', x0: -240, x1: -150, z0: 1950, z1: 3300 },
  { name: '河原町', x0: -480, x1: -240, z0: 1300, z1: 3400 },
  { name: '八坂の塔', x0: 520, x1: 720, z0: 3380, z1: 3600 },
  { name: '岡崎', x0: 600, x1: 1400, z0: 1300, z1: 2100 },
  { name: '京都御所', x0: -900, x1: -300, z0: -300, z1: 1700 },
  { name: '二条城', x0: -2700, x1: -2000, z0: 1500, z1: 2100 },
]
const GRASS = (S) => ({ spring: 0x6f8f4a, summer: 0x557a34, autumn: 0x8a8048, winter: 0x8a8466 }[S] || 0x6f8f4a)
