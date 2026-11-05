// 便24: 京都らしさの細かい物（裕也さん「まだまだ京都感が足りないです。古民家とか、鴨川沿いの古民家（納涼床）、京都らしい建物、施設が簡略化されているので、
//   しっかりと建物とか木とか道とか道路とかの細かいオブジェクトの品質を繰り返し向上してほしいです」2026-11-05）
//   ・町家の表（buildMachiyaFronts）: 町家の通り庇のデータ（build.mjs の eaves・種類 0＝庇の上の面。1枚目の三角形の 2 点が表の壁の線、3 点目が外向き）から、
//       1階の出格子（壁から 0.3m 張り出す格子の箱・千本格子は縞の図）・出入り口の暖簾・駒寄せ（足もとの低い木の柵）・2階の手すり（お茶屋の欄干）・軒の行灯（夕と夜に灯る）を足す
//   ・納涼床（buildYuka）: 鴨川の西岸（二条〜四条の南）で、川に面した家の川側の壁から東へ張り出す木の床（脚・高欄・提灯・座卓と座布団）。床が出るのは夏と秋（5〜9月）
//   形はすべて計算で作る（写真を使わない）。町の乱数 R は使わない（北の家並みと木の乱数の並びを変えない）。kamokyo2=0 は外し回し用（足さない）
import * as THREE from 'three'

// 自分の乱数（決まった種から）
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }
// 祇園（花見小路・新橋・白川）と先斗町（kamoTown の SOUTH_PLACES と同じ範囲）＝お茶屋の多い所
export const GION = (x, z) => x > 200 && x < 750 && z > 2750 && z < 3350
export const PONTO = (x, z) => x > -175 && x < -85 && z > 2200 && z < 2940

// 面を足していく箱（位置・法線・UV〈メートル〉・色）
function Sink() {
  const P = [], N = [], U = [], C = []
  const quad = (a, b, c, d, n, uw, vh, col, u0 = 0, v0 = 0) => { // a→b が u、a→d が v（メートル）
    // 表は反時計回り（法線の向きから見て）
    for (const [p, uv] of [[a, [u0, v0]], [c, [u0 + uw, v0 + vh]], [b, [u0 + uw, v0]], [a, [u0, v0]], [d, [u0, v0 + vh]], [c, [u0 + uw, v0 + vh]]]) { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); U.push(uv[0], uv[1]); C.push(col[0], col[1], col[2]) }
  }
  // 向きのある箱: 原点 o・横の向き s（単位）・外の向き f（単位）・横 s0..s1・外 f0..f1・高さ y0..y1。下の面は作らない
  const box = (o, s, f, s0, s1, f0, f1, y0, y1, col, { top = true, back = false } = {}) => {
    if (s[2] * f[0] - s[0] * f[2] < 0) { s = [-s[0], 0, -s[2]]; const t = s0; s0 = -s1; s1 = -t } // 横×外が上向きになるようにそろえる（面の表と裏を取り違えない）
    const W = (ss, ff, y) => [o[0] + s[0] * ss + f[0] * ff, y, o[2] + s[2] * ss + f[2] * ff]
    const ws = s1 - s0, wf = f1 - f0, h = y1 - y0
    quad(W(s0, f1, y0), W(s1, f1, y0), W(s1, f1, y1), W(s0, f1, y1), [f[0], 0, f[2]], ws, h, col) // 表（外向き）
    if (back) quad(W(s1, f0, y0), W(s0, f0, y0), W(s0, f0, y1), W(s1, f0, y1), [-f[0], 0, -f[2]], ws, h, col)
    quad(W(s1, f1, y0), W(s1, f0, y0), W(s1, f0, y1), W(s1, f1, y1), [s[0], 0, s[2]], wf, h, col) // 横
    quad(W(s0, f0, y0), W(s0, f1, y0), W(s0, f1, y1), W(s0, f0, y1), [-s[0], 0, -s[2]], wf, h, col)
    if (top) quad(W(s0, f1, y1), W(s1, f1, y1), W(s1, f0, y1), W(s0, f0, y1), [0, 1, 0], ws, wf, col)
  }
  const geo = () => {
    if (!P.length) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3))
    g.computeBoundingSphere(); return g
  }
  return { quad, box, geo, tris: () => P.length / 9 }
}

// 縞の図（千本格子・欄干の子・簾）。cv の横 64 で 1 枚＝ u 方向の 1 周期
function stripeTex(keep, { period = 0.24, bars = 4, bar = 0.45, alpha = false, horiz = 0 }) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = horiz ? 64 : 4
  const x = cv.getContext('2d')
  x.clearRect(0, 0, cv.width, cv.height)
  if (!alpha) { x.fillStyle = 'rgb(40,24,16)'; x.fillRect(0, 0, cv.width, cv.height) } // 格子の奥（暗い内）
  x.fillStyle = 'rgb(255,255,255)'
  const w = 64 / bars
  for (let i = 0; i < bars; i++) x.fillRect(i * w + w * (1 - bar) / 2, 0, w * bar, cv.height)
  if (horiz) for (let j = 0; j < horiz; j++) x.fillRect(0, j * (64 / horiz), 64, 64 / horiz * 0.18)
  const t = keep(new THREE.CanvasTexture(cv)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  t.repeat.set(1 / period, horiz ? 1 / period : 1)
  return t
}
// 板の図（床の板・木の面の木目）
function plankTex(keep) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const x = cv.getContext('2d'); const R = rng(7)
  for (let i = 0; i < 8; i++) { const l = 150 + R() * 50; x.fillStyle = `rgb(${l | 0},${(l * 0.82) | 0},${(l * 0.62) | 0})`; x.fillRect(0, i * 16, 128, 15); x.fillStyle = 'rgba(40,25,15,0.9)'; x.fillRect(0, i * 16 + 15, 128, 1)
    for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(80,55,35,${0.15 + R() * 0.2})`; x.fillRect(0, i * 16 + R() * 14, 128, 1) } }
  const t = keep(new THREE.CanvasTexture(cv)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(1 / 1.6, 1 / 1.6)
  return t
}

// 灯りだまりの図（中心が明るく外へ薄れる・加算で重ねる）
function poolTex(keep) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d')
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  const t = keep(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; return t
}
function addMeshes(ctx, groups, part) {
  const { scene, keep } = ctx
  let tris = 0
  for (const { sink, mat, shadow } of groups) {
    const g = sink.geo(); if (!g) continue
    keep(g); tris += sink.tris()
    const m = new THREE.Mesh(g, mat); m.castShadow = !!shadow; m.receiveShadow = true; m.userData.part = part; scene.add(m)
  }
  return tris
}

/** 町家の表の細かい物。ep＝庇の三角形の頂点（x,y,z）・ek＝三角形ごとの種類（頂点ごとに同じ値が 3 つ）。庇の上の面（種類 0）から表の壁の線を読む */
export function buildMachiyaFronts(ctx, ep, ek, seed = 1) {
  if (/[?&]kamokyo2=0/.test(location.search)) return { n: 0, tris: 0 }
  const segs = [], nT = ek.length / 3
  for (let t = 0; t < nT; t++) {
    if (ek[t * 3] !== 0) continue
    // 庇の面は quad＝三角形 2 枚（a,b,c）（a,c,d）。1枚目だけを見る（a＝表の壁の線の始め・b＝終わり・c＝外の先）
    const o = t * 9, A = [ep[o], ep[o + 1], ep[o + 2]], B = [ep[o + 3], ep[o + 4], ep[o + 5]], Cc = [ep[o + 6], ep[o + 7], ep[o + 8]]
    if (Math.abs(A[1] - B[1]) > 0.01) continue // 2枚目（a,c,d）は a と c の高さが違う
    t++ // 2枚目を飛ばす
    let fx = Cc[0] - B[0], fz = Cc[2] - B[2]; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl
    // 庇は壁から 2cm 外・幅は両端 8cm ずつ広い（build.mjs）
    segs.push({ A: [A[0] - fx * 0.02, A[2] - fz * 0.02], B: [B[0] - fx * 0.02, B[2] - fz * 0.02], f: [fx, fz], base: A[1] - 2.75, inset: 0.08 })
  }
  return frontsFromSegs(ctx, segs, seed, false)
}
/** 描く時に町家（お茶屋）へ替えた家の表（庇も足す）。segs＝{ A:[x,z], B:[x,z], f:[x,z], base } */
export function buildOchayaFronts(ctx, segs, seed = 1) {
  if (/[?&]kamokyo2=0/.test(location.search)) return { n: 0, tris: 0 }
  return frontsFromSegs(ctx, segs.map((q) => ({ ...q, inset: 0 })), 100 + seed, true)
}
export const frontsAt = [] // 検証用: お茶屋に替えた家の表の真ん中・外の向き・足もと・幅（kamoTown が組むたびに空にする）
function frontsFromSegs(ctx, segs, seed, withEave) {
  const { keep, NIGHT, DUSK, SNOW, low } = ctx
  const LITE = NIGHT || DUSK
  const R = rng(24000 + seed)
  const lat = Sink(), wood = Sink(), noren = Sink(), lamp = Sink(), rail = Sink(), tile = Sink(), pool = Sink()
  let n = 0
  for (const q of segs) {
    let sx = q.B[0] - q.A[0], sz = q.B[1] - q.A[1]; const L = Math.hypot(sx, sz); if (L < 2.4) continue; sx /= L; sz /= L
    const s = [sx, 0, sz], f = [q.f[0], 0, q.f[1]], base = q.base
    const O = [q.A[0], 0, q.A[1]], s0 = q.inset, s1 = L - q.inset
    const cx = (q.A[0] + q.B[0]) / 2, cz = (q.A[1] + q.B[1]) / 2, ochaya = GION(cx, cz) || PONTO(cx, cz)
    n++; if (withEave && (frontsAt.length < 400)) frontsAt.push([+cx.toFixed(1), +cz.toFixed(1), +q.f[0].toFixed(2), +q.f[1].toFixed(2), +base.toFixed(1), +L.toFixed(1)])
    if (withEave) tile.box(O, s, f, s0 - 0.08, s1 + 0.08, 0, 0.85, base + 2.55, base + 2.72, SNOW ? [0.82, 0.84, 0.86] : [0.32, 0.34, 0.37]) // 通り庇（いぶし銀の瓦・外へ 0.85m）
    // 出入り口（1.6m）: 左か右の端
    const doorL = R() < 0.5, dw = Math.min(1.7, L * 0.3), d0 = doorL ? s0 + 0.15 : s1 - 0.15 - dw, d1 = d0 + dw
    const la0 = doorL ? d1 + 0.12 : s0 + 0.15, la1 = doorL ? s1 - 0.15 : d0 - 0.12
    const bengara = ochaya ? [0.22, 0.075, 0.05] : R() < 0.5 ? [0.2, 0.09, 0.055] : [0.12, 0.08, 0.05] // 紅殻（べんがら）の深い赤茶と、焦げ茶
    if (la1 - la0 > 0.8) {
      // 出格子: 格子の箱（足もと 0.45m から 2.15m・壁から 0.32m）と、上の笠木・下の台
      lat.box(O, s, f, la0, la1, 0.02, 0.32, base + 0.45, base + 2.15, bengara, { top: false })
      wood.box(O, s, f, la0 - 0.06, la1 + 0.06, 0, 0.4, base + 2.15, base + 2.24, [0.1, 0.065, 0.04]) // 笠木
      wood.box(O, s, f, la0 - 0.04, la1 + 0.04, 0, 0.36, base + 0.3, base + 0.45, [0.1, 0.08, 0.06]) // 台（腰）
    }
    // 出入り口の戸の枠と、暖簾（6割）
    wood.box(O, s, f, d0 - 0.06, d0, 0, 0.08, base, base + 2.2, [0.08, 0.055, 0.035]); wood.box(O, s, f, d1, d1 + 0.06, 0, 0.08, base, base + 2.2, [0.08, 0.055, 0.035])
    wood.box(O, s, f, d0 - 0.06, d1 + 0.06, 0, 0.1, base + 2.2, base + 2.32, [0.08, 0.055, 0.035])
    if (R() < 0.6) {
      const nc = [[0.05, 0.07, 0.17], [0.06, 0.08, 0.2], [0.42, 0.38, 0.32], [0.24, 0.07, 0.06], [0.14, 0.13, 0.11]][Math.floor(R() * 5)] // 藍・生成り・えんじ・墨
      const nw = (d1 - d0) / 3
      for (let k = 0; k < 3; k++) noren.box(O, s, f, d0 + k * nw + 0.02, d0 + (k + 1) * nw - 0.02, 0.12, 0.13, base + 1.5, base + 2.18, nc, { top: false, back: true })
    }
    // 軒の行灯（お茶屋の所は 9 割・ほかは 2 割）: 戸の横の壁に小さな箱。夕と夜は灯る
    if (R() < (ochaya ? 0.9 : 0.2)) {
      const lsP = doorL ? d1 + 0.25 : d0 - 0.55
      lamp.box(O, s, f, lsP, lsP + 0.3, 0.1, 0.36, base + 1.75, base + 2.1, [1, 0.93, 0.8])
      if (LITE && !/[?&]kamopool=0/.test(location.search)) { // kamopool=0 は外し回し用。【便24・外の目 直すべき6】夜の通りの目線が真っ黒だった＝行灯の足もとの道と壁に、温かい灯りだまり（加算・軒下の壁に 2.4m 四方）
        const W = (ss, ff, y) => [O[0] + s[0] * ss + f[0] * ff, y, O[2] + s[2] * ss + f[2] * ff], c0 = lsP + 0.15, k = NIGHT ? 1 : 0.55
        // ~~道の灯りだまり（外へ 2.6m）~~（【便24】道の面の高さが家ごとに違い、道の下に隠れたり離れた所に欠けて浮いたりした＝外した。軒下の壁の灯りだまりだけ）
        pool.quad(W(c0 - 1.2, 0.03, base + 0.75), W(c0 + 1.2, 0.03, base + 0.75), W(c0 + 1.2, 0.03, base + 3.15), W(c0 - 1.2, 0.03, base + 3.15), [f[0], 0, f[2]], 1, 1, [1.4 * k, 0.75 * k, 0.28 * k]) // 便24: 1.5 倍（通りの目線で軒下の灯りが分かる所まで）
      }
      wood.box(O, s, f, lsP - 0.02, lsP + 0.32, 0.08, 0.38, base + 2.1, base + 2.14, [0.07, 0.05, 0.035])
    }
    // 駒寄せ（2割・お茶屋の所は無し）: 足もとの低い木の柵（高さ 0.75m・外へ 0.5m）
    if (!ochaya && R() < 0.2 && la1 - la0 > 1) { rail.box(O, s, f, la0, la1, 0.48, 0.52, base, base + 0.75, [0.12, 0.08, 0.05], { top: true, back: true }); wood.box(O, s, f, la0, la1, 0.42, 0.56, base + 0.75, base + 0.82, [0.09, 0.06, 0.04]) }
    // 2階の手すり（お茶屋の所は 6 割・ほか 1 割）: 虫籠窓の前に低い欄干（高さ 0.6m・外へ 0.45m）
    if (R() < (ochaya ? 0.6 : 0.1) && !low) {
      const y2 = base + 3.25
      rail.box(O, s, f, s0 + 0.3, s1 - 0.3, 0.42, 0.46, y2, y2 + 0.62, [0.13, 0.07, 0.045], { top: false, back: true })
      wood.box(O, s, f, s0 + 0.25, s1 - 0.25, 0.38, 0.5, y2 + 0.62, y2 + 0.69, [0.1, 0.06, 0.035]) // 笠木
      wood.box(O, s, f, s0 + 0.25, s1 - 0.25, 0, 0.5, y2 - 0.08, y2, [0.09, 0.06, 0.04]) // 縁の板
    }
  }
  const mk = (o) => keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o }))
  const latMat = mk({ map: stripeTex(keep, { period: 0.24, bars: 4, bar: 0.42 }) }), railMat = mk({ map: stripeTex(keep, { period: 0.3, bars: 3, bar: 0.35, alpha: true }), alphaTest: 0.5, side: THREE.DoubleSide })
  const lampMat = mk({ emissive: new THREE.Color(1, 0.5, 0.2), emissiveIntensity: LITE ? (NIGHT ? 1.05 : 0.7) : 0, roughness: 0.6 }) // 便24: 白く飛ばない温かい橙
  const groups = [{ sink: lat, mat: latMat, shadow: true }, { sink: wood, mat: mk({}), shadow: true }, { sink: noren, mat: mk({ side: THREE.DoubleSide, roughness: 0.95 }) }, { sink: lamp, mat: lampMat }, { sink: rail, mat: railMat, shadow: true }]
  if (withEave) groups.push({ sink: tile, mat: mk({ roughness: 0.6 }), shadow: true })
  if (LITE) groups.push({ sink: pool, mat: keep(new THREE.MeshBasicMaterial({ map: poolTex(keep), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: true, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })) })
  const tris = addMeshes(ctx, groups, 'kyoFront')
  return { n, tris }
}

/** 納涼床。bl＝建物の箱の一覧 { x0, x1, z0, z1, y0, y1 }（鴨川の座標）。terrK(x,z)＝地面の高さ・wetK(x,z)＝水の度合い */
export function buildYuka(ctx, bl, terrK, wetK) {
  if (/[?&]kamokyo2=0/.test(location.search)) return { n: 0, tris: 0 }
  const { keep, NIGHT, DUSK, S, low } = ctx
  // ~~夏と秋に出す~~（【便24・外の目 直すべき3】秋の情景は紅葉の頃で、本物の床〈5/1〜9/30〉と季節がずれた。春の情景は桜の頃〈4 月〉で床の前）＝夏だけ。?yuka=1 で夏のほかも出す（検証用）
  if (S !== 'summer' && !/[?&]yuka=1/.test(location.search)) return { n: 0, tris: 0, season: S }
  const LITE = NIGHT || DUSK
  const R = rng(5101)
  // 鴨川の西岸の川に面した家: 二条（z 1950）〜南の四角の南の端（z 3600）。橋の所（三条 z≈2330・四条 z≈2950）は空ける
  const Z0 = 1950, Z1 = 3580, BIN = 4
  const front = new Map() // 4m の帯ごとの、川側でいちばん東の家の壁
  const cand = bl.filter((b) => b.z1 > Z0 && b.z0 < Z1 && b.x1 > -190 && b.x1 < -60 && b.y1 - b.y0 > 3 && b.x1 - b.x0 < 60)
  for (const b of cand) for (let z = Math.ceil(b.z0 / BIN) * BIN; z < b.z1; z += BIN) { const k = z / BIN; if (!front.has(k) || front.get(k) < b.x1) front.set(k, b.x1) }
  const deck = Sink(), wood = Sink(), rail = Sink(), lamp = Sink(), cloth = Sink()
  const sx = [0, 0, 1], fx = [1, 0, 0] // 横＝南北・外＝東
  let n = 0
  const why = { cand: cand.length, bridge: 0, notFront: 0, narrow: 0, notLower: 0, wet: 0, short: 0 } // 検証用: 外れた理由ごとの数
  for (const b of cand) {
    const zc = (b.z0 + b.z1) / 2
    if (Math.abs(zc - 2330) < 26 || Math.abs(zc - 2955) < 34) { why.bridge++; continue } // 橋の所
    // この家が帯の中で川側（いちばん東）か
    let ok = 0, all = 0
    for (let z = Math.ceil(b.z0 / BIN) * BIN; z < b.z1; z += BIN) { all++; if (front.get(z / BIN) - b.x1 < 1.5) ok++ }
    if (!all || ok / all < 0.6) { why.notFront++; continue }
    const w0 = b.z0 + 0.3, w1 = b.z1 - 0.3; if (w1 - w0 < 3) { why.narrow++; continue }
    // 本流の岸: 家の壁から東へ 1m おきに見て、水が 6m 以上続く所（みそそぎ川などの細い水路は床の下に入ってよい）
    let edge = null, run = 0
    for (let d = 1; d <= 40; d++) { if (wetK(b.x1 + d, zc) > 0.35) { if (++run >= 6) { edge = d - 5; break } } else run = 0 }
    if (edge === null || edge < 7) { why.wet++; continue }
    const dep = Math.min(5.4, edge - 4) // 床の先から本流まで 4m 以上（河川敷の道を空ける）
    if (dep < 2.8) { why.short++; continue }
    // 床の下の地面（いちばん低い所）。家の足もとが河川敷より低い所（土手の内側）は出さない
    let gmin = 1e9; for (let d = 0.5; d <= dep; d += 0.7) gmin = Math.min(gmin, terrK(b.x1 + d, zc), terrK(b.x1 + d, b.z0 + 0.5), terrK(b.x1 + d, b.z1 - 0.5))
    if (b.y0 - gmin < -0.3) { why.notLower++; (why.dy = why.dy || []).length < 12 && why.dy.push(+(b.y0 - gmin).toFixed(1)); continue }
    n++; if (why.at = why.at || [], why.at.length < 60) why.at.push([+b.x1.toFixed(0), +((b.z0 + b.z1) / 2).toFixed(0), +b.y0.toFixed(1), +dep.toFixed(1)])
    const O = [b.x1, 0, 0], yD = Math.min(b.y0 + 2.4, Math.max(b.y0 + 0.35, gmin + 2.0)) // 床の高さ: 家の 1 階にそろえ、河川敷から 2m より低くならない（1 階の天井より上へは上げない）
    // 床の板と、床の下の梁
    deck.box(O, sx, fx, w0, w1, 0, dep, yD - 0.12, yD, [1, 1, 1])
    wood.box(O, sx, fx, w0, w1, dep - 0.12, dep, yD - 0.38, yD - 0.12, [0.32, 0.22, 0.14])
    // 脚: 外の縁と中ほどに 1.8m おき（地面まで）
    for (let z = w0 + 0.1; z <= w1 - 0.1 + 1e-6; z += Math.max(1.6, (w1 - w0 - 0.2) / Math.max(1, Math.round((w1 - w0 - 0.2) / 1.8)))) for (const d of [dep - 0.1, dep * 0.5]) {
      const gy = terrK(b.x1 + d, z); if (yD - gy < 0.3) continue
      wood.box([b.x1 + d, 0, z], [0, 0, 1], [1, 0, 0], -0.07, 0.07, -0.07, 0.07, gy - 0.2, yD - 0.12, [0.3, 0.21, 0.14])
      if (d > dep * 0.7) wood.box([b.x1 + d - dep * 0.25, 0, z], [0, 0, 1], [1, 0, 0], -0.04, 0.04, -dep * 0.25, dep * 0.25, Math.max(gy, yD - 1.4), Math.max(gy, yD - 1.4) + 0.08, [0.28, 0.2, 0.13]) // 筋交いの代わりの貫
    }
    // 高欄（外の縁と南北の縁・高さ 0.7m）: 子は縞の図・笠木と束は箱
    rail.box(O, sx, fx, w0, w1, dep - 0.08, dep - 0.04, yD, yD + 0.62, [0.42, 0.28, 0.17], { top: false, back: true })
    for (const z of [w0, w1]) rail.box([b.x1, 0, z], [1, 0, 0], [0, 0, z === w0 ? -1 : 1], 0, dep, -0.04, 0, yD, yD + 0.62, [0.42, 0.28, 0.17], { top: false, back: true })
    wood.box(O, sx, fx, w0 - 0.04, w1 + 0.04, dep - 0.1, dep - 0.02, yD + 0.62, yD + 0.7, [0.36, 0.24, 0.15])
    for (const z of [w0, w1]) wood.box([b.x1, 0, z], [1, 0, 0], [0, 0, 1], 0, dep, -0.04, 0.04, yD + 0.62, yD + 0.7, [0.36, 0.24, 0.15])
    for (let z = w0; z <= w1 + 1e-6; z += (w1 - w0) / Math.max(1, Math.round((w1 - w0) / 1.8))) wood.box([b.x1 + dep - 0.06, 0, z], [0, 0, 1], [1, 0, 0], -0.05, 0.05, -0.05, 0.05, yD, yD + 0.72, [0.3, 0.2, 0.12])
    // 座卓と座布団（2.2m おきに 1 組・床の奥行きの真ん中）
    for (let z = w0 + 1.1; z < w1 - 0.8; z += 2.2) {
      const tx = b.x1 + dep * 0.55
      wood.box([tx, 0, z], [0, 0, 1], [1, 0, 0], -0.55, 0.55, -0.4, 0.4, yD + 0.3, yD + 0.36, [0.2, 0.1, 0.06]) // 天板
      wood.box([tx, 0, z], [0, 0, 1], [1, 0, 0], -0.45, 0.45, -0.3, 0.3, yD, yD + 0.3, [0.14, 0.07, 0.04])
      const cc = R() < 0.5 ? [0.55, 0.16, 0.14] : [0.16, 0.2, 0.4]
      for (const [dz, dx] of [[-0.75, 0], [0.75, 0], [0, -0.75], [0, 0.75]]) if (R() < 0.85) cloth.box([tx + dx, 0, z + dz], [0, 0, 1], [1, 0, 0], -0.27, 0.27, -0.27, 0.27, yD, yD + 0.08, cc)
    }
    // 提灯（外の縁の上に 1.5m おき・赤白）と、家の壁ぎわの行灯（夕と夜に灯る）
    for (let z = w0 + 0.6; z < w1 - 0.3; z += 1.5) {
      const red = R() < 0.55
      lamp.box([b.x1 + dep - 0.06, 0, z], [0, 0, 1], [1, 0, 0], -0.13, 0.13, -0.13, 0.13, yD + 1.5, yD + 1.86, red ? [1, 0.42, 0.28] : [1, 0.94, 0.82])
      wood.box([b.x1 + dep - 0.06, 0, z], [0, 0, 1], [1, 0, 0], -0.015, 0.015, -0.015, 0.015, yD + 1.86, yD + 2.3, [0.1, 0.08, 0.06])
    }
    wood.box(O, sx, fx, w0, w1, dep - 0.08, dep - 0.04, yD + 2.3, yD + 2.36, [0.12, 0.09, 0.06]) // 提灯を吊る竿
    for (const z of [w0, w1]) wood.box([b.x1 + dep - 0.06, 0, z], [0, 0, 1], [1, 0, 0], -0.05, 0.05, -0.05, 0.05, yD + 0.7, yD + 2.36, [0.24, 0.16, 0.1]) // 竿の柱
    if (R() < 0.5) lamp.box(O, sx, fx, (w0 + w1) / 2 - 0.2, (w0 + w1) / 2 + 0.2, 0.05, 0.35, yD + 0.05, yD + 0.75, [1, 0.92, 0.78]) // 置き行灯
  }
  const mk = (o) => keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o }))
  const deckMat = mk({ map: plankTex(keep), color: 0x8a6a4e })
  const railMat = mk({ map: stripeTex(keep, { period: 0.16, bars: 2, bar: 0.4, alpha: true, horiz: 0 }), alphaTest: 0.5, side: THREE.DoubleSide })
  const lampMat = mk({ emissive: new THREE.Color(1, 0.42, 0.16), emissiveIntensity: LITE ? (NIGHT ? 1.25 : 0.8) : 0.05, roughness: 0.6 }) // 便24: 提灯は赤みの橙（白く飛ばない）
  const tris = addMeshes(ctx, [{ sink: deck, mat: deckMat, shadow: true }, { sink: wood, mat: mk({}), shadow: true }, { sink: rail, mat: railMat }, { sink: lamp, mat: lampMat }, { sink: cloth, mat: mk({ roughness: 1 }) }], 'yuka')
  return { n, tris, season: S, why }
}
