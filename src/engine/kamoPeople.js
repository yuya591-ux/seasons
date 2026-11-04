// 便21: 鴨川の河川敷と川の中の人（kamoTown.js が町を組んだ後に呼ぶ。動く物の部品 kamoLife.js とは乱数を分ける＝便20 の並びを変えない）
//   ・河川敷の真砂土の道を、歩く人・走る人・自転車が行き来する（build.mjs の riverPath＝河川敷の小道の折れ線）。夜の自転車は前の灯りがともる。雨と雪の日は傘をさして歩く人が少しだけ
//   ・浅瀬で遊ぶ子ども（すねまで水に入って、ときどき水を跳ね上げる）と、飛び石に腰かけて足を水につける学生（夏が多く、春と秋の朝と夕は少し。冬と夜と雨の日は居ない）
//   ・夏の夜、鴨川デルタの先で手持ち花火をする学生の輪と家族（火花の色は緑・桃・金。1本 25〜40 秒で次の1本へ）
//   調べ: 名所と鴨川の調べ §6（水深はくるぶし〜すね・写真で網を持った子どもが川を歩く）・§9（手持ち花火は鴨川条例の禁止の外・夏の盛りは大人も子どもも飛び石を渡る）
//   座標は鴨川の座標（原点＝鴨川デルタ・x 東・z 南）
import * as THREE from 'three'
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export function buildPeople(ctx) {
  const { scene, paths, stones, terrK, wetK, depthK, S, TK, sky, low, keep, reduceMotion } = ctx
  const NIGHT = TK === 'night', DUSK = TK === 'dusk', WET = sky === 'rain' || sky === 'snow'
  let rs = 21211104
  const rnd = () => { rs |= 0; rs = (rs + 0x6d2b79f5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const add = (o, part) => { o.userData.part = part; o.frustumCulled = false; scene.add(o); return o }
  const CLOTH = [0xe8e4da, 0x2c3446, 0xb8a888, 0x6a6e74, 0x5a6448, 0x8a3a34, 0x1e1e22, 0x9aa8b8, 0xc89a5a, 0x46586a, 0xd8c060, 0x5b7fa8]
  const KIDS = [0xe86a5a, 0x5aa0e8, 0xf0c040, 0x6cc070, 0xf0f0e8, 0xe890b8]
  const HAIR = [0x1a1614, 0x241c18, 0x3a2a20, 0x14120f, 0x5a4232]
  const info = { walk: 0, jog: 0, bike: 0, wade: 0, stoneSit: 0, hanabi: 0, sparks: 0, paths: paths ? paths.length : 0 }
  const merge = (gs) => { const g = BGU.mergeGeometries(gs.map((x) => (x.index ? x.toNonIndexed() : x))); gs.forEach((x) => x.dispose()); return keep(g) }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), xAx = new THREE.Vector3(1, 0, 0), col = new THREE.Color()
  const bodyMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }))
  const metalMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.5, metalness: 0.5 }))

  // ── 形（遠くと中くらいの近さで見る大きさ。胴と腕・脚 2 本（腰で振る）・頭） ──
  const torso = merge([new THREE.CylinderGeometry(0.17, 0.2, 0.62, 7).translate(0, 1.16, 0), new THREE.BoxGeometry(0.5, 0.11, 0.14).translate(0, 1.4, 0), new THREE.BoxGeometry(0.09, 0.55, 0.1).translate(0.25, 1.14, 0), new THREE.BoxGeometry(0.09, 0.55, 0.1).translate(-0.25, 1.14, 0)])
  const leg = merge([new THREE.BoxGeometry(0.13, 0.86, 0.15).translate(0, -0.43, 0)]) // 腰（原点）から下へ
  const head = keep(new THREE.SphereGeometry(0.115, 8, 6))
  const seat = merge([ // 座って足を前へ下ろす形（飛び石の上）
    new THREE.CylinderGeometry(0.16, 0.2, 0.56, 7).translate(0, 0.32, -0.04), new THREE.BoxGeometry(0.32, 0.14, 0.42).translate(0, 0.06, 0.18), new THREE.BoxGeometry(0.28, 0.5, 0.12).translate(0, -0.2, 0.4), new THREE.BoxGeometry(0.5, 0.11, 0.14).translate(0, 0.52, 0.02)])
  const rider = merge([ // 自転車に乗る人（前へかがむ）
    new THREE.CylinderGeometry(0.16, 0.19, 0.6, 7).rotateX(0.38).translate(0, 1.28, -0.05), new THREE.BoxGeometry(0.26, 0.62, 0.15).rotateX(-0.25).translate(0, 0.78, 0.04), new THREE.BoxGeometry(0.46, 0.09, 0.42).translate(0, 1.32, 0.3)])
  const bike = merge([new THREE.TorusGeometry(0.33, 0.025, 5, 16).rotateY(Math.PI / 2).translate(0, 0.33, 0.52), new THREE.TorusGeometry(0.33, 0.025, 5, 16).rotateY(Math.PI / 2).translate(0, 0.33, -0.52),
    new THREE.BoxGeometry(0.04, 0.04, 1.0).rotateX(-0.25).translate(0, 0.62, 0), new THREE.BoxGeometry(0.04, 0.5, 0.04).translate(0, 0.62, -0.18), new THREE.BoxGeometry(0.04, 0.55, 0.04).rotateX(0.3).translate(0, 0.72, 0.42), new THREE.BoxGeometry(0.5, 0.03, 0.03).translate(0, 1.0, 0.5), new THREE.BoxGeometry(0.12, 0.05, 0.24).translate(0, 0.92, -0.2)])
  const umbrella = keep(new THREE.ConeGeometry(0.55, 0.28, 10, 1, true).translate(0, 2.0, 0))

  // ── 河川敷の道を行き来する人 ──
  const P = (paths || []).map((p) => { const cum = [0]; for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return { p, cum, L: cum[cum.length - 1] } }).filter((x) => x.L > 40)
  const seasonK = { spring: 1, summer: 0.9, autumn: 1, winter: 0.6 }[S] || 1
  const half = low ? 0.5 : 1
  const want = WET ? { walk: 3, jog: 0, bike: 0 } : NIGHT ? { walk: 4, jog: 1, bike: 4 } : DUSK ? { walk: 12, jog: 5, bike: 8 } : { walk: 10, jog: 9, bike: 6 }
  const movers = []
  if (P.length) for (const [kind, n0] of Object.entries(want)) {
    const n = Math.max(kind === 'walk' && WET ? 1 : 0, Math.round(n0 * seasonK * half))
    for (let i = 0; i < n; i++) {
      const pth = P[Math.floor(rnd() * P.length)]
      movers.push({ kind, path: pth, s: rnd() * pth.L, dir: rnd() < 0.5 ? 1 : -1, v: kind === 'walk' ? 1.1 + rnd() * 0.4 : kind === 'jog' ? 2.4 + rnd() * 0.8 : 3.8 + rnd() * 1.6, lat: (rnd() - 0.5) * 2.0, ph: rnd() * 6.28, cloth: pick(CLOTH), hair: pick(HAIR), x: 0, y: 0, z: 0, yaw: 0 })
      info[kind]++
    }
  }
  const walkers = movers.filter((m) => m.kind !== 'bike'), riders = movers.filter((m) => m.kind === 'bike')
  const mk = (geo, mat, n, part) => { const im = add(new THREE.InstancedMesh(geo, mat, Math.max(1, n)), part); im.count = n; for (let i = 0; i < Math.max(1, n); i++) im.setColorAt(i, col.setHex(0xffffff)); return im }
  const W = { torso: mk(torso, bodyMat, walkers.length, 'people'), legL: mk(leg, bodyMat, walkers.length, 'people'), legR: mk(leg, bodyMat, walkers.length, 'people'), head: mk(head, bodyMat, walkers.length, 'people'), umb: WET ? mk(umbrella, keep(new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide })), walkers.length, 'people') : null }
  const B = { body: mk(rider, bodyMat, riders.length, 'people'), bike: mk(bike, metalMat, riders.length, 'people'), head: mk(head, bodyMat, riders.length, 'people') }
  walkers.forEach((m, i) => { W.torso.setColorAt(i, col.setHex(m.cloth)); W.legL.setColorAt(i, col.setHex(m.kind === 'jog' ? 0x2a2c30 : 0x3c3a3a)); W.legR.setColorAt(i, col.setHex(m.kind === 'jog' ? 0x2a2c30 : 0x3c3a3a)); W.head.setColorAt(i, col.setHex(m.hair)); if (W.umb) W.umb.setColorAt(i, col.setHex(pick([0x2c4a7a, 0x8a2a2a, 0xe8e4da, 0x3a6a4a, 0xd8b030]))) })
  riders.forEach((m, i) => { B.body.setColorAt(i, col.setHex(m.cloth)); B.head.setColorAt(i, col.setHex(m.hair)) })
  function placeMover(m, dt) {
    const pth = m.path
    m.s += m.dir * m.v * dt
    if (m.s < 0 || m.s > pth.L) { m.dir = -m.dir; m.s = Math.max(0, Math.min(pth.L, m.s)) }
    let i = 1; while (i < pth.cum.length - 1 && pth.cum[i] < m.s) i++
    const a = pth.p[i - 1], b = pth.p[i], u = (m.s - pth.cum[i - 1]) / Math.max(1e-3, pth.cum[i] - pth.cum[i - 1]), dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1
    const side = m.lat * (m.dir > 0 ? 1 : -1) * 0.7 // 行き違う人は左右に分かれる
    m.x = a[0] + dx * u + (-dz / l) * side; m.z = a[1] + dz * u + (dx / l) * side; m.y = terrK(m.x, m.z) + 0.1
    m.yaw = Math.atan2(dx * m.dir, dz * m.dir)
  }
  function stepMovers(dt, t) {
    walkers.forEach((m, i) => {
      placeMover(m, dt)
      const f = m.kind === 'jog' ? 2.6 : 1.7, sw = (m.kind === 'jog' ? 0.6 : 0.38) * Math.sin(t * f * Math.PI * 2 * (m.v / (m.kind === 'jog' ? 2.8 : 1.3)) * 0.5 + m.ph), bob = Math.abs(Math.sin(t * f * Math.PI * (m.v / 1.3) * 0.5 + m.ph)) * (m.kind === 'jog' ? 0.06 : 0.025)
      q.setFromAxisAngle(up, m.yaw)
      if (m.kind === 'jog') q.multiply(q2.setFromAxisAngle(xAx, 0.12))
      m4.compose(v3.set(m.x, m.y + bob, m.z), q, one); W.torso.setMatrixAt(i, m4)
      for (const [im, s] of [[W.legL, 1], [W.legR, -1]]) { const qq = q2.setFromAxisAngle(up, m.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(xAx, sw * s)); const off = new THREE.Vector3(0.08 * s, 0, 0).applyAxisAngle(up, m.yaw); m4.compose(v3.set(m.x + off.x, m.y + bob + 0.86, m.z + off.z), qq, one); im.setMatrixAt(i, m4) }
      m4.compose(v3.set(m.x, m.y + bob + 1.6, m.z), q, one); W.head.setMatrixAt(i, m4)
      if (W.umb) { m4.compose(v3.set(m.x, m.y + bob, m.z), q, one); W.umb.setMatrixAt(i, m4) }
    })
    riders.forEach((m, i) => {
      placeMover(m, dt)
      q.setFromAxisAngle(up, m.yaw)
      m4.compose(v3.set(m.x, m.y, m.z), q, one); B.bike.setMatrixAt(i, m4); B.body.setMatrixAt(i, m4)
      const hd = new THREE.Vector3(0, 0, 0.32).applyAxisAngle(up, m.yaw); m4.compose(v3.set(m.x + hd.x, m.y + 1.72, m.z + hd.z), q, one); B.head.setMatrixAt(i, m4)
      if (bikeGlow) { const fwd = new THREE.Vector3(0, 0, 0.62).applyAxisAngle(up, m.yaw); bikeGlow.geometry.attributes.position.setXYZ(i, m.x + fwd.x, m.y + 0.95, m.z + fwd.z) }
    })
    for (const im of [W.torso, W.legL, W.legR, W.head, W.umb, B.body, B.bike, B.head]) if (im) { im.instanceMatrix.needsUpdate = true }
    if (bikeGlow) bikeGlow.geometry.attributes.position.needsUpdate = true
  }

  // 灯りの暈（点の光）
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return keep(new THREE.CanvasTexture(cv)) })()
  let bikeGlow = null
  if ((NIGHT || DUSK) && riders.length) {
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(riders.length * 3), 3))
    bikeGlow = add(new THREE.Points(g, keep(new THREE.PointsMaterial({ map: glowTex, color: 0xfff4e0, size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))), 'people')
  }

  // ── 浅瀬で遊ぶ子どもと、飛び石に座って足を水につける学生 ──
  const playK = WET || NIGHT ? 0 : S === 'summer' ? 1 : S === 'winter' ? 0 : TK === 'noon' ? 0.6 : 0.4
  const waders = [], sitters = []
  if (playK > 0 && stones && stones.length) {
    const st = []; for (let i = 0; i < stones.length; i += 4) st.push([stones[i], stones[i + 1], stones[i + 2], stones[i + 3]])
    // 子ども: 飛び石の列の上流と下流 2〜9m の、深さ 8〜25cm の浅瀬
    const nW = Math.round(7 * playK * half)
    for (let tries = 0; tries < 400 && waders.length < nW; tries++) {
      const s = pick(st), r = 2 + rnd() * 7, an = rnd() * 6.283, x = s[0] + Math.cos(an) * r, z = s[2] + Math.sin(an) * r
      const d = depthK(x, z); if (wetK(x, z) < 0.6 || d < 0.08 || d > 0.25) continue
      if (waders.some((w) => Math.hypot(w.x - x, w.z - z) < 1.6)) continue
      waders.push({ x, z, y: terrK(x, z), yaw: rnd() * 6.283, ph: rnd() * 6.28, cloth: pick(KIDS), hair: pick(HAIR), kid: rnd() < 0.75, splash: 2 + rnd() * 6 })
    }
    // 学生: 飛び石の上に横向きに腰かけ、足を下流側の水へ
    const nS = Math.round(6 * playK * half)
    const used = new Set()
    for (let tries = 0; tries < 200 && sitters.length < nS; tries++) {
      const k = Math.floor(rnd() * st.length); if (used.has(k) || used.has(k - 1) || used.has(k + 1)) continue
      used.add(k); const s = st[k]
      sitters.push({ x: s[0], y: s[1], z: s[2], yaw: s[3] + (rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2), cloth: pick(CLOTH), hair: pick(HAIR) })
    }
  }
  info.wade = waders.length; info.stoneSit = sitters.length
  const WD = { torso: mk(torso, bodyMat, waders.length, 'people'), legL: mk(leg, bodyMat, waders.length, 'people'), legR: mk(leg, bodyMat, waders.length, 'people'), head: mk(head, bodyMat, waders.length, 'people') }
  waders.forEach((w, i) => { WD.torso.setColorAt(i, col.setHex(w.cloth)); WD.legL.setColorAt(i, col.setHex(0xd8b89a)); WD.legR.setColorAt(i, col.setHex(0xd8b89a)); WD.head.setColorAt(i, col.setHex(w.hair)) })
  const SD = { body: mk(seat, bodyMat, sitters.length, 'people'), head: mk(head, bodyMat, sitters.length, 'people') }
  sitters.forEach((s, i) => {
    SD.body.setColorAt(i, col.setHex(s.cloth)); SD.head.setColorAt(i, col.setHex(s.hair))
    q.setFromAxisAngle(up, s.yaw); m4.compose(v3.set(s.x, s.y, s.z), q, one); SD.body.setMatrixAt(i, m4)
    m4.compose(v3.set(s.x, s.y + 0.72, s.z), q, one); SD.head.setMatrixAt(i, m4)
  })
  // 水しぶき（子どもが跳ね上げる白い粒）
  const SPL = 160
  const splG = keep(new THREE.BufferGeometry()), splP = new Float32Array(SPL * 3).fill(-9999), splV = new Float32Array(SPL * 3), splL = new Float32Array(SPL)
  splG.setAttribute('position', new THREE.BufferAttribute(splP, 3))
  const splash = waders.length ? add(new THREE.Points(splG, keep(new THREE.PointsMaterial({ color: 0xf2f6f8, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }))), 'people') : null
  let splI = 0
  function stepWaders(dt, t) {
    waders.forEach((w, i) => {
      const s = (w.kid ? 0.72 : 1), bend = 0.25 + 0.25 * Math.sin(t * 0.9 + w.ph)
      sc.set(s, s, s)
      q.setFromAxisAngle(up, w.yaw + Math.sin(t * 0.3 + w.ph) * 0.6).multiply(q2.setFromAxisAngle(xAx, bend))
      m4.compose(v3.set(w.x, w.y, w.z), q, sc); WD.torso.setMatrixAt(i, m4)
      for (const [im, sd] of [[WD.legL, 1], [WD.legR, -1]]) { const off = new THREE.Vector3(0.08 * sd * s, 0, 0).applyAxisAngle(up, w.yaw); m4.compose(v3.set(w.x + off.x, w.y + 0.86 * s, w.z + off.z), q2.setFromAxisAngle(up, w.yaw), sc); im.setMatrixAt(i, m4) }
      const hp = new THREE.Vector3(0, 1.6 * s, 0).applyQuaternion(q); m4.compose(v3.set(w.x + hp.x, w.y + hp.y, w.z + hp.z), q, sc); WD.head.setMatrixAt(i, m4)
      if (!reduceMotion && splash) { w.splash -= dt; if (w.splash <= 0) { w.splash = 2.5 + rnd() * 6; for (let k = 0; k < 14; k++) { const j = splI++ % SPL, an = rnd() * 6.283, sp = 0.6 + rnd() * 1.4; splP.set([w.x + Math.cos(an) * 0.3, w.y + depthK(w.x, w.z) + 0.05, w.z + Math.sin(an) * 0.3], j * 3); splV.set([Math.cos(an) * sp, 1.6 + rnd() * 1.8, Math.sin(an) * sp], j * 3); splL[j] = 0.6 + rnd() * 0.4 } } }
    })
    for (const im of Object.values(WD)) im.instanceMatrix.needsUpdate = true
    if (splash) { for (let j = 0; j < SPL; j++) { if (splL[j] <= 0) continue; splL[j] -= dt; splV[j * 3 + 1] -= 9.8 * dt; for (let e = 0; e < 3; e++) splP[j * 3 + e] += splV[j * 3 + e] * dt; if (splL[j] <= 0) splP[j * 3 + 1] = -9999 } splG.attributes.position.needsUpdate = true }
  }

  // ── 夏の夜の鴨川デルタの手持ち花火 ──
  //   デルタの先（2 列の飛び石のあいだの陸の先・原点の南西）の平らな所に、学生の輪（4〜5 人）と家族（大人 2・子ども 2）。手元から火花が噴き出し、色は 1 本ごとに替わる
  const hanabi = []
  let sparks = null, hLight = null
  if (S === 'summer' && NIGHT && !WET && stones && stones.length) {
    // デルタの先: 2 列の飛び石の陸側の端どうしの間で、水でも建物でもない所
    let tip = null
    for (let r = 0; r < 40 && !tip; r += 2) for (let a = 0; a < 16 && !tip; a++) { const x = -70 + Math.cos(a * 0.3927) * r, z = 48 + Math.sin(a * 0.3927) * r - r * 0.3; if (wetK(x, z) < 0.05 && wetK(x, z + 3) > 0.3) tip = [x, z] }
    if (!tip) tip = [-70, 40]
    const groups = [{ c: [tip[0] - 2.5, tip[1] - 6], n: 5, kid: false }, { c: [tip[0] + 3.5, tip[1] - 11], n: 4, kid: true }]
    for (const g of groups) for (let i = 0; i < g.n; i++) {
      const an = (i / g.n) * 6.283 + rnd() * 0.3, r = 1.2 + rnd() * 0.3, x = g.c[0] + Math.cos(an) * r, z = g.c[1] + Math.sin(an) * r, kid = g.kid && i >= 2
      hanabi.push({ x, z, y: terrK(x, z), yaw: Math.atan2(g.c[0] - x, g.c[1] - z), kid, crouch: kid ? rnd() < 0.5 : rnd() < 0.3, cloth: kid ? pick(KIDS) : pick(CLOTH), hair: pick(HAIR), on: rnd() < 0.7, t: rnd() * 30, life: 25 + rnd() * 15, hue: Math.floor(rnd() * 3) })
    }
    info.hanabi = hanabi.length; info.tip = tip.map((v) => Math.round(v * 10) / 10)
    const N = low ? 500 : 1100
    const pg = keep(new THREE.BufferGeometry()), pp = new Float32Array(N * 3).fill(-9999), pc = new Float32Array(N * 3), pv = new Float32Array(N * 3), pl = new Float32Array(N)
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3))
    sparks = { pg, pp, pc, pv, pl, N, i: 0, pts: add(new THREE.Points(pg, keep(new THREE.PointsMaterial({ map: glowTex, size: low ? 0.26 : 0.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))), 'fireworks') }
    if (!low) { hLight = new THREE.PointLight(0xffc070, 0, 14, 1.6); hLight.position.set(tip[0], terrK(tip[0], tip[1] - 8) + 1.2, tip[1] - 8); hLight.userData.part = 'fireworks'; scene.add(hLight) }
  }
  const HF = { torso: mk(torso, bodyMat, hanabi.length, 'fireworks'), legL: mk(leg, bodyMat, hanabi.length, 'fireworks'), legR: mk(leg, bodyMat, hanabi.length, 'fireworks'), head: mk(head, bodyMat, hanabi.length, 'fireworks') }
  hanabi.forEach((h, i) => {
    const s = h.kid ? 0.7 : 1, dy = h.crouch ? -0.45 * s : 0
    sc.set(s, s, s); q.setFromAxisAngle(up, h.yaw)
    HF.torso.setColorAt(i, col.setHex(h.cloth)); HF.head.setColorAt(i, col.setHex(h.hair)); HF.legL.setColorAt(i, col.setHex(0x2a2a2e)); HF.legR.setColorAt(i, col.setHex(0x2a2a2e))
    m4.compose(v3.set(h.x, h.y + dy, h.z), q, sc); HF.torso.setMatrixAt(i, m4)
    for (const [im, sd] of [[HF.legL, 1], [HF.legR, -1]]) { const off = new THREE.Vector3(0.08 * sd * s, 0, 0).applyAxisAngle(up, h.yaw); m4.compose(v3.set(h.x + off.x, h.y + 0.86 * s + dy, h.z + off.z), h.crouch ? q2.setFromAxisAngle(up, h.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(xAx, -1.2)) : q, sc); im.setMatrixAt(i, m4) }
    m4.compose(v3.set(h.x, h.y + 1.6 * s + dy, h.z), q, sc); HF.head.setMatrixAt(i, m4)
  })
  const HUES = [[0.45, 1.0, 0.35], [1.0, 0.4, 0.75], [1.0, 0.78, 0.3]]
  function stepHanabi(dt) {
    if (!sparks) return
    let lit = 0
    for (const h of hanabi) {
      h.t += dt
      if (h.on && h.t > h.life) { h.on = false; h.t = 0; h.life = 3 + rnd() * 6 } else if (!h.on && h.t > h.life) { h.on = true; h.t = 0; h.life = 25 + rnd() * 15; h.hue = Math.floor(rnd() * 3) }
      if (!h.on) continue
      lit++
      const s = h.kid ? 0.7 : 1, hand = new THREE.Vector3(0.12, (h.crouch ? 0.55 : 1.0) * s, 0.42 * s).applyAxisAngle(up, h.yaw)
      const tipP = new THREE.Vector3(h.x + hand.x, h.y + hand.y + (h.crouch ? -0.2 : 0), h.z + hand.z), dir = new THREE.Vector3(0, 0.35, 1).applyAxisAngle(up, h.yaw).normalize()
      const nNew = Math.round((reduceMotion ? 40 : 110) * dt * (low ? 0.6 : 1))
      const hc = HUES[h.hue]
      for (let k = 0; k < nNew; k++) {
        const j = sparks.i++ % sparks.N, sp = 2.0 + rnd() * 3.6
        const d = new THREE.Vector3(dir.x + (rnd() - 0.5) * 0.9, dir.y + (rnd() - 0.3) * 0.9, dir.z + (rnd() - 0.5) * 0.9).normalize()
        sparks.pp.set([tipP.x, tipP.y, tipP.z], j * 3); sparks.pv.set([d.x * sp, d.y * sp, d.z * sp], j * 3); sparks.pl[j] = 0.35 + rnd() * 0.6
        const w = rnd() < 0.25 ? 1 : 0; sparks.pc.set([hc[0] * (1 - w) + w, hc[1] * (1 - w) + w * 0.95, hc[2] * (1 - w) + w * 0.85], j * 3)
      }
    }
    for (let j = 0; j < sparks.N; j++) {
      if (sparks.pl[j] <= 0) continue
      sparks.pl[j] -= dt; sparks.pv[j * 3 + 1] -= 6.5 * dt
      for (let e = 0; e < 3; e++) { sparks.pp[j * 3 + e] += sparks.pv[j * 3 + e] * dt; sparks.pv[j * 3 + e] *= 1 - 1.4 * dt }
      const f = Math.max(0, Math.min(1, sparks.pl[j] * 2.2)); sparks.pc[j * 3] *= 0.985; sparks.pc[j * 3 + 1] *= 0.975; sparks.pc[j * 3 + 2] *= 0.97
      if (sparks.pl[j] <= 0) sparks.pp[j * 3 + 1] = -9999
      else if (f < 0.3) for (let e = 0; e < 3; e++) sparks.pc[j * 3 + e] *= 0.92
    }
    sparks.pg.attributes.position.needsUpdate = true; sparks.pg.attributes.color.needsUpdate = true
    info.sparks = lit
    if (hLight) hLight.intensity = lit ? (1.4 + Math.random() * 0.6) * Math.min(1, lit / 3) * 6 : 0
  }

  let tAll = 0
  stepMovers(0, 0); stepWaders(0, 0)
  for (const im of [SD.body, SD.head]) im.instanceMatrix.needsUpdate = true
  return {
    update(dt) { if (!(dt > 0)) dt = 0; dt = Math.min(dt, 0.1); tAll += dt; stepMovers(dt, tAll); stepWaders(dt, tAll); stepHanabi(dt) },
    info: () => ({ ...info, sample: movers.slice(0, 3).map((m) => [m.kind, Math.round(m.x), Math.round(m.z)]) }),
  }
}
