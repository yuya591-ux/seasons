// 便22: 外の町の名所の形（outer-build.mjs の marks から作る・kamoOuter.js が呼ぶ）。調べ: docs/qa/2026-11-04_便22/調べ/京都の名所の調べ.md
//   ・金閣（鹿苑寺の舎利殿）: 基壇・1 層は白木と白壁（金ではない）・2 層と 3 層は金箔・2 層の上に大きく張り出す宝形の屋根（16.5×13.3m）・頂の宝形屋根と鳳凰。高さ 12.5m（調べ §1）
//   ・京都タワー: 京都タワービル（31m・53×44m）の上に、下が太く（直径 10m）上が細い（5.5m）白い塔。地上 100m に楕円の展望室（赤い帯）、頂は 131m で赤白（調べ §2）
//   ・八坂神社の西楼門: 幅 7.9m・軒先 11.7×9.1m・二層の朱の楼門・切妻の屋根（高さは推測 11m・調べ §4）
//   ・八坂の塔（法観寺の五重塔）: 46m・軒先 13.3m・5 層の本瓦葺きの屋根・相輪（層ごとの大きさは推測・調べ §5）
//   ・平安神宮の大鳥居: 高さ 24.4m・柱の外どうし 18.18m・柱の直径 3.63m・笠木 32.4m・朱（調べ §10）
//   ・平安神宮の応天門: 26×14.6m・二層・朱の柱と白壁・緑釉瓦（高さは推測 15m・調べ §10）
//   色の 16 進は調べの【推測】の目安（出典に数値なし）。看板・商標・店の名は作らない
import * as THREE from 'three'
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export function buildMeisho(ctx) {
  const { marks, keep, NIGHT, DUSK, SNOW } = ctx
  const group = new THREE.Group(); group.userData.part = 'meisho'
  const info = { kinkaku: false, tower: false, romon: false, yasakaTo: false, heianTorii: false, otenmon: false }
  if (!marks) return { group, info }
  const LITE = NIGHT || DUSK
  const L = { gold: [], white: [], wood: [], roof: [], verm: [], tile: [], green: [], tower: [], red: [], bronze: [], stone: [], glow: [], plaster: [], dark: [] }
  const tr = (g, x, y, z, yaw = 0) => { g.rotateY(yaw); g.translate(x, y, z); return g }
  const local = (x, z, yaw, lx, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz]
  const box = (k, w, h, d, x, y, z, yaw = 0) => L[k].push(tr(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), x, y, z, yaw))
  const cyl = (k, r0, r1, h, x, y, z, seg = 12, yaw = 0) => L[k].push(tr(new THREE.CylinderGeometry(r0, r1, h, seg).translate(0, h / 2, 0), x, y, z, yaw))
  // 宝形・寄棟の屋根（軒の反りを少し・底は軒先の四角 w×d・高さ h・頂の四角 tw×td）
  const hipRoof = (k, w, d, h, tw, td, x, y, z, yaw = 0, flare = 0.25) => {
    const P = [], q = (a, b, c) => P.push(...a, ...b, ...c)
    const c0 = [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]], m = [[-w / 2 * 0.82, h * flare, -d / 2 * 0.82], [w / 2 * 0.82, h * flare, -d / 2 * 0.82], [w / 2 * 0.82, h * flare, d / 2 * 0.82], [-w / 2 * 0.82, h * flare, d / 2 * 0.82]], t = [[-tw / 2, h, -td / 2], [tw / 2, h, -td / 2], [tw / 2, h, td / 2], [-tw / 2, h, td / 2]]
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; q(c0[i], m[j], c0[j]); q(c0[i], m[i], m[j]); q(m[i], t[j], m[j]); q(m[i], t[i], t[j]) }
    if (tw > 0.01) q(t[0], t[2], t[1]), q(t[0], t[3], t[2])
    q(c0[0], c0[1], c0[2]); q(c0[0], c0[2], c0[3]) // 軒裏
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); L[k].push(tr(g, x, y, z, yaw))
  }
  const gableRoof = (k, w, d, h, x, y, z, yaw = 0) => { // 切妻（棟は w の向き）
    const P = [], q = (a, b, c) => P.push(...a, ...b, ...c), A = [-w / 2, 0, -d / 2], B = [w / 2, 0, -d / 2], Cc = [w / 2, 0, d / 2], D = [-w / 2, 0, d / 2], E = [-w / 2, h, 0], F = [w / 2, h, 0]
    q(A, E, F); q(A, F, B); q(D, Cc, F); q(D, F, E); q(A, D, E); q(B, F, Cc); q(A, B, Cc); q(A, Cc, D)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); L[k].push(tr(g, x, y, z, yaw))
  }

  // ── 金閣 ──
  if (marks.kinkaku) {
    const { x, y, z } = marks.kinkaku, yaw = 0 // 正面は南（池の側）。間口（東西）5 間・奥行 4 間
    box('stone', 12.6, 0.7, 11.2, x, y, z, yaw) // 基壇
    box('wood', 12.0, 0.4, 10.4, x, y + 0.7, z, yaw) // 縁
    box('white', 10.6, 1.9, 8.8, x, y + 1.1, z, yaw) // 1 層（法水院・白木と白壁）
    for (let i = -2; i <= 2; i++) for (const s of [-1, 1]) cyl('wood', 0.16, 0.16, 1.9, ...local(x, z, yaw, i * 2.55, s * 4.45), y + 1.1, 8) // 1 層の柱（間口 5 間）
    for (let i = -1; i <= 1; i++) for (const s of [-1, 1]) cyl('wood', 0.16, 0.16, 1.9, ...local(x, z, yaw, s * 5.3, i * 2.95), y + 1.1, 8)
    hipRoof('roof', 13.0, 11.2, 0.45, 10.8, 9.0, x, y + 3.0, z, yaw, 0.6) // 1 層の上の薄い庇
    box('gold', 10.2, 2.5, 8.4, x, y + 3.35, z, yaw) // 2 層（潮音洞・金箔）
    box('gold', 11.2, 0.12, 9.4, x, y + 3.4, z, yaw); for (const lz of [-4.6, 4.6]) box('gold', 11.2, 0.75, 0.08, ...local(x, z, yaw, 0, lz), y + 3.45, yaw); for (const lx of [-5.55, 5.55]) box('gold', 0.08, 0.75, 9.3, ...local(x, z, yaw, lx, 0), y + 3.45, yaw) // 2 層の縁と高欄
    hipRoof('roof', 16.5, 13.3, 1.65, 7.0, 7.0, x, y + 5.85, z, yaw, 0.32) // 2 層の上の大きな屋根（軒先 16.5×13.3）
    box('gold', 6.9, 2.1, 6.9, x, y + 7.5, z, yaw) // 3 層（究竟頂・金箔）
    box('gold', 7.6, 0.6, 7.6, x, y + 7.45, z, yaw)
    hipRoof('roof', 10.0, 9.9, 2.1, 0.01, 0.01, x, y + 9.6, z, yaw, 0.3) // 頂の宝形
    box('gold', 0.5, 0.6, 0.5, x, y + 11.7, z, yaw); box('gold', 0.25, 0.4, 0.7, x, y + 12.2, z, yaw) // 露盤と鳳凰
    info.kinkaku = true
  }
  // ── 京都タワー ──
  if (marks.tower) {
    const { x, y, z } = marks.tower, yaw = marks.tower.ang || 0
    box('plaster', 53.1, 31, 44.1, x, y, z, yaw) // 京都タワービル
    box('dark', 53.4, 3.2, 44.4, x, y + 3.2, z, yaw); box('dark', 53.4, 1.0, 44.4, x, y + 30, z, yaw) // 下の階のガラスと屋上の縁
    const base = y + 31
    // 塔: 下の直径 10m → 上の直径 5.5m（なめらかに細る）。旋盤の形
    const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12, h = t * 62, r = 5.0 - (5.0 - 2.75) * Math.pow(t, 0.8); prof.push(new THREE.Vector2(r, h)) }
    L.tower.push(tr(new THREE.LatheGeometry(prof, 24), x, base, z))
    cyl('tower', 2.75, 3.4, 6, x, base + 62, z, 24) // 展望室の下のくびれから広がる
    // 展望室（地上 100m＝ビルの上 69m）: 楕円の円盤 2 層
    const deck = (r1, r2, h, yy, k) => L[k].push(tr(new THREE.CylinderGeometry(1, 1, h, 32).scale(r1, 1, r2).translate(0, h / 2, 0), x, yy, z, yaw))
    deck(6.4, 5.6, 3.0, base + 68, 'tower'); deck(6.6, 5.8, 2.2, base + 71, 'glow'); deck(6.2, 5.4, 1.2, base + 73.2, 'red'); deck(5.0, 4.4, 2.2, base + 74.4, 'tower')
    cyl('tower', 2.4, 1.8, 10, x, base + 76.6, z, 18); cyl('red', 1.8, 1.4, 5, x, base + 86.6, z, 16); cyl('tower', 1.4, 0.9, 5, x, base + 91.6, z, 14); cyl('red', 0.9, 0.35, 3.4, x, base + 96.6, z, 12) // 頂（赤白・131m）
    info.tower = true
  }
  // ── 八坂神社の西楼門（二層の朱の楼門・切妻） ──
  if (marks.romon) {
    const { x, y, z } = marks.romon, yaw = (marks.romon.ang || 0) + Math.PI / 2 // 輪郭の長い辺に棟。正面は西（四条通）
    box('stone', 9.4, 0.5, 6.8, x, y, z, yaw)
    for (const lx of [-3.95, -1.32, 1.32, 3.95]) for (const lz of [-2.3, 0, 2.3]) cyl('verm', 0.24, 0.26, 4.6, ...local(x, z, yaw, lx, lz), y + 0.5, 10) // 下層の柱（3 間）
    for (const lx of [-3.95, 3.95]) box('plaster', 0.2, 3.6, 4.4, ...local(x, z, yaw, lx * 0.82, 0), y + 0.5, yaw) // 左右の柵の奥の白壁（随身の間）
    box('verm', 8.6, 0.5, 5.4, x, y + 5.1, z, yaw) // 腰組
    hipRoof('roof', 10.4, 7.6, 0.6, 8.8, 6.0, x, y + 5.0, z, yaw, 0.7) // 下層の上の縁の屋根
    box('verm', 7.6, 3.0, 4.6, x, y + 5.6, z, yaw) // 上層
    for (const lx of [-1.3, 1.3]) box('plaster', 1.6, 1.8, 0.1, ...local(x, z, yaw, lx, 2.35), y + 6.2, yaw) // 上層の白壁
    gableRoof('roof', 11.7, 9.1, 3.2, x, y + 8.6, z, yaw) // 切妻の屋根（軒先 11.7×9.1）
    info.romon = true
  }
  // ── 八坂の塔（五重塔） ──
  if (marks.yasakaTo) {
    const { x, y, z } = marks.yasakaTo, yaw = marks.yasakaTo.ang || 0
    box('stone', 9.0, 1.0, 9.0, x, y, z, yaw)
    let yy = y + 1.0
    for (let k = 0; k < 5; k++) { // 層ごとに少しずつ細く（初重の柱の外 6.6m → 5 重 4.4m・軒先 13.3m → 9.6m）
      const bw = 6.6 - k * 0.55, rw = 13.3 - k * 0.92, hh = k ? 3.4 : 4.4
      box('wood', bw, hh, bw, x, yy, z, yaw); box('plaster', bw * 0.5, hh * 0.6, bw + 0.04, x, yy + hh * 0.2, z, yaw); box('plaster', bw + 0.04, hh * 0.6, bw * 0.5, x, yy + hh * 0.2, z, yaw)
      hipRoof('tile', rw, rw, 1.25, bw * 0.75, bw * 0.75, x, yy + hh, z, yaw, 0.35)
      yy += hh + 1.25
    }
    cyl('bronze', 0.5, 0.6, 1.0, x, yy, z, 8); cyl('bronze', 0.12, 0.16, 46 - (yy - y) - 0.2, x, yy + 1.0, z, 8) // 相輪
    for (let r = 0; r < 9; r++) cyl('bronze', 0.75 - r * 0.03, 0.75 - r * 0.03, 0.12, x, yy + 2.2 + r * 0.8, z, 12) // 九輪
    info.yasakaTo = true
  }
  // ── 平安神宮の大鳥居 ──
  if (marks.heianTorii) {
    const { x, y, z } = marks.heianTorii, yaw = marks.heianTorii.ang || 0 // 輪郭（笠木）の長い辺の向き＝横木の向き
    const ax = (lx) => local(x, z, -yaw, lx, 0)
    for (const s of [-1, 1]) { const [px, pz] = ax(s * (18.18 / 2 - 1.8)); cyl('verm', 1.65, 1.82, 24.4 - 1.6, px, y, pz, 20); cyl('dark', 2.2, 2.3, 2.2, px, y, pz, 20) } // 柱（直径 3.63m）と根巻き
    box('verm', 25.0, 2.0, 2.0, x, y + 15.5, z, -yaw) // 貫
    box('verm', 30.2, 1.8, 2.6, x, y + 21.4, z, -yaw) // 島木
    { const P = []; const seg = 16; for (let i = 0; i < seg; i++) { const t0 = i / seg - 0.5, t1 = (i + 1) / seg - 0.5, lift = (t) => Math.pow(Math.abs(t) * 2, 3) * 1.1; const g = new THREE.BoxGeometry(32.4 / seg + 0.02, 1.7, 3.0).translate((t0 + t1) / 2 * 32.4, 23.2 + (lift(t0) + lift(t1)) / 2, 0); P.push(g) } L.dark.push(tr(BGU.mergeGeometries(P.map((g) => g.toNonIndexed())), x, y, z, -yaw)) } // 笠木（両端が反り上がる・黒）
    box('verm', 1.6, 4.6, 1.6, x, y + 17.4, z, -yaw); box('dark', 3.2, 3.8, 0.5, x, y + 17.8, z, -yaw) // 額束と額
    info.heianTorii = true
  }
  // ── 応天門（二層・朱の柱と白壁・緑釉瓦） ──
  if (marks.otenmon) {
    const { x, y, z } = marks.otenmon, yaw = -(marks.otenmon.ang || 0), w = Math.max(20, marks.otenmon.w || 26) * 0.92, d = Math.max(10, marks.otenmon.d || 14.6) * 0.62
    box('stone', w + 1.5, 0.8, d + 3, x, y, z, yaw)
    for (let i = 0; i <= 5; i++) for (const lz of [-d / 2, 0, d / 2]) cyl('verm', 0.35, 0.38, 5.4, ...local(x, z, yaw, -w / 2 + (i * w) / 5, lz), y + 0.8, 10)
    for (const lx of [-w / 2 + w / 10, w / 2 - w / 10]) box('plaster', w / 5 - 0.6, 4.4, 0.2, ...local(x, z, yaw, lx, 0), y + 0.8, yaw)
    hipRoof('green', w + 4, d + 4.5, 1.2, w + 1, d + 1.2, x, y + 6.2, z, yaw, 0.6)
    box('verm', w * 0.9, 3.4, d * 0.9, x, y + 7.4, z, yaw); for (let i = 0; i <= 5; i++) box('plaster', w * 0.9 / 5 - 0.5, 2.0, d * 0.9 + 0.06, ...local(x, z, yaw, -w * 0.45 + w * 0.9 / 10 + (i * w * 0.9) / 5, 0), y + 8.0, yaw)
    hipRoof('green', w + 5, d + 6, 4.2, w * 0.55, 0.6, x, y + 10.8, z, yaw, 0.3)
    info.otenmon = true
  }

  const C = { gold: 0xd4af37, white: SNOW ? 0xf0efe8 : 0xefebe0, wood: 0x5a3f2c, roof: SNOW ? 0xdcdcd8 : 0x3b3029, verm: 0xd3442a, tile: SNOW ? 0xdcdcd8 : 0x5b5e62, green: SNOW ? 0xd6dcd6 : 0x3e7a63, tower: 0xf3f0e8, red: 0xd23a2a, bronze: 0x5e6b4e, stone: SNOW ? 0xe0e0dc : 0xb4b0a8, glow: 0x20262c, plaster: SNOW ? 0xf0efe8 : 0xeeeae0, dark: 0x24221f }
  for (const [k, list] of Object.entries(L)) {
    if (!list.length) continue
    const g = keep(BGU.mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)))); list.forEach((x) => x.dispose())
    const glow = k === 'glow' && LITE
    const m = keep(new THREE.MeshStandardMaterial({ color: C[k], roughness: k === 'gold' ? 0.32 : k === 'glow' ? 0.15 : k === 'tower' || k === 'red' ? 0.6 : 0.85, metalness: k === 'gold' ? 0.55 : k === 'bronze' ? 0.4 : 0, side: THREE.DoubleSide, emissive: glow ? 0xffcf8a : k === 'gold' ? 0x3a2a00 : 0x000000, emissiveIntensity: glow ? (NIGHT ? 1.2 : 0.5) : k === 'gold' ? 0.35 : 0 }))
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.part = 'meisho'; group.add(mesh)
  }
  // 夜: 京都タワーの頂の赤い灯り（航空障害灯・推測）
  if (NIGHT && marks.tower) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); s.position.set(marks.tower.x, marks.tower.y + 131.2, marks.tower.z); keep(s.geometry); keep(s.material); group.add(s) }
  return { group, info }
}
