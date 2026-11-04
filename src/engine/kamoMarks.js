// 便21: 鴨川の町の名所の形（build.mjs の marks から作る・kamoTown.js が呼ぶ）。調べ: docs/qa/2026-11-04_便21/調べ/名所と鴨川の調べ.md
//   ・京都大学 百周年時計台記念館の時計塔（PLATEAU は 15m の箱で塔が無い）: 高さ 31m・赤茶のタイルの塔に、明るいベージュの帯と頂の白い帯、4 面の時計（白地・黒い縁と針・夜はほんのり赤みのある灯り）
//   ・京大の正門（明治の石造りの門柱 2 本・宝珠形の笠・弧を描く低い石塀）
//   ・吉田神社の鳥居（朱塗りの明神鳥居・笠木は黒）／斎場所大元宮（八角の社・朱の柱と白い壁・厚い茅葺の屋根・朱の千木と金の丸い飾り）
//   ・吉田山の茂庵（大正の木造二階・2階の窓が一面に並ぶ・夕方と夜は窓が灯る）・山頂休憩広場の東屋・吉田山公園の遊具・地図のベンチ
import * as THREE from 'three'
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export function buildMarks(ctx) {
  const { scene, marks, keep, NIGHT, DUSK, SNOW } = ctx
  const info = { tower: false, gate: false, torii: 0, daigengu: false, moan: false, shelters: 0, benches: 0, play: 0 }
  if (!marks) return info
  const LITE = NIGHT || DUSK
  const L = { red: [], beige: [], white: [], dark: [], verm: [], black: [], thatch: [], gold: [], wood: [], stone: [], iron: [], glass: [], tile: [], bench: [], clock: [] }
  const tr = (g, x, y, z, yaw = 0) => { g.rotateY(yaw); g.translate(x, y, z); return g }
  const box = (k, w, h, d, x, y, z, yaw = 0) => L[k].push(tr(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, y, z, yaw))
  const cyl = (k, r0, r1, h, x, y, z, seg = 10) => L[k].push(tr(new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, h / 2, 0), x, y, z))
  const local = (x, z, yaw, lx, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz] // 向き yaw（開きの向きが +z）での (lx, lz)

  // ── 時計塔 ──
  if (marks.tower) {
    const t = marks.tower, cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2, w = t.x1 - t.x0, H = t.top - t.base, y0 = t.base
    box('red', w, H - 1.2, w, cx, y0, cz)
    for (const hy of [t.roof - t.base - 0.4, H - 6.8, H - 1.2]) box('beige', w + 0.5, 0.55, w + 0.5, cx, y0 + hy, cz) // 屋上の線・時計の下・頂の帯
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) box('beige', 0.7, H - 1.2, 0.7, cx + sx * (w / 2 - 0.15), y0, cz + sz * (w / 2 - 0.15)) // 角の柱形
    box('white', w - 0.6, 0.8, w - 0.6, cx, y0 + H - 0.65, cz) // 頂の白い帯
    const fy = y0 + H - 4.2
    for (let k = 0; k < 4; k++) { // 4 面の時計
      const yaw = (k * Math.PI) / 2, [fx, fz] = local(cx, cz, yaw, 0, w / 2 + 0.06)
      L.clock.push(tr(new THREE.CircleGeometry(1.45, 28), fx, fy, fz, yaw))
      L.black.push(tr(new THREE.RingGeometry(1.45, 1.62, 28), fx, fy, fz + 0, yaw))
      const [hx, hz] = local(cx, cz, yaw, 0, w / 2 + 0.1)
      L.black.push(tr(new THREE.BoxGeometry(0.09, 1.05, 0.03).translate(0, 0.45, 0).rotateZ(-0.6), hx, fy, hz, yaw)) // 長い針
      L.black.push(tr(new THREE.BoxGeometry(0.12, 0.7, 0.03).translate(0, 0.3, 0).rotateZ(2.1), hx, fy, hz, yaw)) // 短い針
    }
    info.tower = true
  }
  // ── 正門 ──
  if (marks.gate) {
    const [x, y, z, yaw] = marks.gate
    for (const s of [-1, 1]) {
      const [px, pz] = local(x, z, yaw, s * 3.6, 0)
      box('stone', 0.95, 3.6, 0.95, px, y, pz, yaw); L.stone.push(tr(new THREE.ConeGeometry(0.72, 0.8, 4).rotateY(Math.PI / 4).translate(0, 4.0, 0), px, y, pz, yaw))
      for (let i = 0; i < 6; i++) { const a0 = 3.6 + i * 1.2, [qx, qz] = local(x, z, yaw, s * (a0 + 0.6), -0.18 * i * i * 0.15); box('stone', 1.25, 1.15, 0.45, qx, y, qz, yaw - s * i * 0.06) } // 弧を描く低い石塀
    }
    info.gate = true
  }
  // ── 鳥居（朱塗りの明神鳥居・笠木は黒） ──
  for (const [x, y, z, yaw, k] of marks.torii || []) {
    const s = k, half = 2.2 * s, H = 5.0 * s
    for (const d of [-1, 1]) { const [px, pz] = local(x, z, yaw, d * half, 0); cyl('verm', 0.2 * s, 0.25 * s, H, px, y, pz, 10); cyl('black', 0.3 * s, 0.3 * s, 0.35 * s, px, y, pz, 10) }
    box('verm', half * 2 + 0.9 * s, 0.32 * s, 0.32 * s, x, y + H - 1.2 * s, z, yaw) // 貫
    box('verm', half * 2 + 1.4 * s, 0.4 * s, 0.42 * s, x, y + H - 0.1 * s, z, yaw) // 島木
    box('black', half * 2 + 2.1 * s, 0.32 * s, 0.5 * s, x, y + H + 0.3 * s, z, yaw) // 笠木
    box('verm', 0.3 * s, 0.85 * s, 0.25 * s, x, y + H - 0.95 * s, z, yaw) // 額束
    info.torii++
  }
  // ── 大元宮（八角の社・茅葺） ──
  if (marks.daigengu) {
    const [x, y, z] = marks.daigengu, R = 4.6
    L.stone.push(tr(new THREE.CylinderGeometry(R + 1.2, R + 1.4, 0.6, 8).translate(0, 0.3, 0), x, y, z))
    L.white.push(tr(new THREE.CylinderGeometry(R - 0.2, R - 0.2, 3.2, 8).translate(0, 2.2, 0), x, y, z))
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; cyl('verm', 0.17, 0.17, 3.4, x + Math.cos(a) * R, y + 0.6, z + Math.sin(a) * R, 8) }
    L.verm.push(tr(new THREE.CylinderGeometry(R + 0.15, R + 0.15, 0.25, 8).translate(0, 3.9, 0), x, y, z)) // 長押
    L.thatch.push(tr(new THREE.CylinderGeometry(1.2, R + 2.4, 3.8, 8, 1).translate(0, 5.9, 0), x, y, z)) // 厚い茅葺
    L.thatch.push(tr(new THREE.CylinderGeometry(R + 2.4, R + 2.4, 0.45, 8).translate(0, 3.8, 0), x, y, z)) // 茅の軒の厚み
    for (const d of [-1, 1]) L.verm.push(tr(new THREE.BoxGeometry(0.16, 2.2, 0.5).rotateZ(d * 0.5).translate(d * 0.35, 8.4, 0), x, y, z)) // 千木
    L.gold.push(tr(new THREE.SphereGeometry(0.35, 12, 8).translate(0, 8.0, 0), x, y, z))
    info.daigengu = true
  }
  // ── 茂庵（大正の木造二階・西の町と山を望む窓） ──
  if (marks.moan) {
    const [x, y, z] = marks.moan, yaw = Math.PI / 2, W = 15, D = 6.2
    box('dark', W, 3.0, D, x, y, z, yaw)
    box('wood', W + 0.2, 0.25, D + 0.2, x, y + 3.0, z, yaw)
    box('white', W, 2.6, D, x, y + 3.25, z, yaw)
    for (const s of [-1, 1]) { const [gx, gz] = local(x, z, yaw, 0, s * (D / 2 + 0.03)); box('glass', W - 1.0, 1.4, 0.06, gx, y + 3.75, gz, yaw) } // 2階の窓が一面に並ぶ
    L.tile.push(tr(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4).scale((W + 2.0) / 1.414, 2.4, (D + 2.0) / 1.414).translate(0, 5.85 + 1.2, 0), x, y, z, yaw)) // 寄棟の瓦屋根
    info.moan = true
  }
  // ── 東屋 ──
  for (const [x, y, z] of marks.shelters || []) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) cyl('wood', 0.09, 0.09, 2.5, x + sx * 1.7, y, z + sz * 1.7, 6)
    L.tile.push(tr(new THREE.ConeGeometry(3.4, 1.4, 4).rotateY(Math.PI / 4).translate(0, 3.2, 0), x, y, z))
    box('wood', 2.6, 0.06, 0.4, x, y + 0.42, z - 1.2); box('wood', 2.6, 0.06, 0.4, x, y + 0.42, z + 1.2)
    info.shelters++
  }
  // ── ベンチ（地図の点）。石と木を半々 ──
  for (const [x, y, z, yaw] of marks.benches || []) {
    const k = (Math.abs(Math.round(x * 7 + z * 3)) % 2) ? 'stone' : 'bench'
    box(k, 1.7, 0.1, 0.42, x, y + 0.36, z, yaw); for (const s of [-1, 1]) { const [lx, lz] = local(x, z, yaw, s * 0.65, 0); box(k, 0.12, 0.36, 0.38, lx, y, lz, yaw) }
    info.benches++
  }
  // ── 遊具（すべり台・ブランコ・鉄棒） ──
  for (const [x, y, z, k] of marks.play || []) {
    if (k === 0) { box('iron', 0.7, 0.08, 0.7, x, y + 1.6, z); for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) cyl('iron', 0.04, 0.04, 1.6, x + sx * 0.32, y, z + sz * 0.32, 5); L.verm.push(tr(new THREE.BoxGeometry(0.6, 0.06, 2.6).rotateX(-0.62).translate(0, 0.85, 1.4), x, y, z)) }
    else if (k === 1) { for (const s of [-1, 1]) { L.iron.push(tr(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5).rotateX(0.25 * s).translate(0, 1.25, 0.3 * s), x - 1.4, y, z)); L.iron.push(tr(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5).rotateX(0.25 * s).translate(0, 1.25, 0.3 * s), x + 1.4, y, z)) } box('iron', 2.9, 0.07, 0.07, x, y + 2.45, z); for (const s of [-0.6, 0.6]) box('verm', 0.45, 0.05, 0.2, x + s, y + 0.45, z) }
    else { for (const [w, hh] of [[1.2, 0.9], [1.2, 1.2]]) { for (const s of [-1, 1]) cyl('iron', 0.04, 0.04, hh, x + s * w / 2, y, z + (hh > 1 ? 1 : 0), 5); L.iron.push(tr(new THREE.CylinderGeometry(0.025, 0.025, w, 5).rotateZ(Math.PI / 2).translate(0, hh, hh > 1 ? 1 : 0), x, y, z)) } }
    info.play++
  }

  const C = { red: 0x8a3e2c, beige: 0xd8cbb0, white: SNOW ? 0xf0f0ec : 0xeeece6, dark: 0x3a2a1e, verm: 0xc8402a, black: 0x222020, thatch: SNOW ? 0xd8d8d4 : 0x5a4a38, gold: 0xd8b048, wood: 0x6a4a30, stone: SNOW ? 0xe0e0dc : 0xbab6ae, iron: 0x48505a, glass: 0x2a3036, tile: SNOW ? 0xdcdcd8 : 0x5c626b, bench: 0x8a6a48, clock: 0xf2f0ea }
  for (const [k, list] of Object.entries(L)) {
    if (!list.length) continue
    const g = keep(BGU.mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)))); list.forEach((x) => x.dispose())
    const glow = (k === 'glass' || k === 'clock') && LITE
    const m = keep(new THREE.MeshStandardMaterial({ color: C[k], roughness: k === 'gold' ? 0.35 : k === 'glass' ? 0.2 : 0.85, metalness: k === 'gold' ? 0.7 : k === 'iron' ? 0.4 : 0, side: THREE.DoubleSide, emissive: glow ? (k === 'glass' ? 0xffb868 : 0xffd9b8) : 0x000000, emissiveIntensity: glow ? (NIGHT ? 0.9 : 0.4) * (k === 'clock' ? 0.5 : 1) : 0 }))
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = 'marks'; scene.add(mesh)
  }
  return info
}
