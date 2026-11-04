// 鴨川の町で人や電車や鳥が動く所と、時々の出来事（便20）。kamoTown.js が町を組んだ後に呼ぶ。
// 森見登美彦さんの作品の舞台になった場所（鴨川デルタと飛び石・糺の森・叡山電車の出町柳駅・出町桝形商店街・大文字）を、
// 「本物の場所の本物の風景」として置く。作品の人物・名前・作中の物（架空の店や乗り物）は出さない（CLAUDE.md「既存作品の固有の物を模倣しない」）。
//   ・いつも居る物（眺めると居る）: 河川敷に等間隔に座る人（夕方と夜）・水辺に立つアオサギ（昼）・デルタの上を回るトビ（昼）・出町桝形商店街のアーケード
//   ・時々の出来事: 叡山電車が出町柳駅に着いて、また出る／飛び石を渡る人／冬のユリカモメの群れ／夏の夜の大文字の送り火
//   ・音（素材なし・合成）: トビの声・叡山電車の音（音の部品 audio.js の playEvent が鳴らす）と、飛ぶ・歩く時の川の瀬音・まちの気配・駅の近さ
// 座標は鴨川の座標（原点＝鴨川デルタ・x 東・z 南）。乱数は町の R と分ける（R の回る数を変えると、町の木の形が変わる）。
import * as THREE from 'three'
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/**
 * ctx: { scene, camera, life（life.json）, terrK, farK, wetK, zoneK, WY, stones（x,y,z,向きの並び）, S, TK, sky, low, reduceMotion, onSound, keep }
 */
export function buildLife(ctx) {
  const { scene, camera, renderer, life, terrK, farK, wetK, zoneK, WY, S, TK, sky, low, keep } = ctx
  const onSound = typeof ctx.onSound === 'function' ? ctx.onSound : () => {}
  const reduceMotion = !!ctx.reduceMotion
  const NIGHT = TK === 'night', DUSK = TK === 'dusk', DAY = !NIGHT, WET = sky === 'rain' || sky === 'snow'
  let rs = 20261104
  const rnd = () => { rs |= 0; rs = (rs + 0x6d2b79f5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const add = (o, part) => { o.userData.part = part; scene.add(o); return o }
  const info = { sitters: 0, herons: 0, kites: 0, ev: {}, last: null }
  const CLOTH = [0xe8e4da, 0x2c3446, 0xb8a888, 0x6a6e74, 0x5a6448, 0x8a3a34, 0x1e1e22, 0x9aa8b8, 0xc89a5a, 0x46586a]
  const HAIR = [0x1a1614, 0x241c18, 0x3a2a20, 0x14120f, 0x5a4232]
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color()

  // ── 人の形（遠くから見る大きさなので、胴・脚・頭の簡単な形。座る形と立つ形） ──
  const merge = (gs) => { const g = BGU.mergeGeometries(gs.map((x) => x.toNonIndexed())); gs.forEach((x) => x.dispose()); return keep(g) }
  const seatBody = merge([
    new THREE.CylinderGeometry(0.16, 0.2, 0.56, 7).translate(0, 0.58, -0.02), // 胴
    new THREE.BoxGeometry(0.34, 0.15, 0.44).translate(0, 0.32, 0.2), // 腿（前＝+z）
    new THREE.BoxGeometry(0.3, 0.36, 0.13).translate(0, 0.16, 0.42), // すね
    new THREE.BoxGeometry(0.5, 0.12, 0.14).translate(0, 0.78, 0.04), // 肩と腕
  ])
  const standBody = merge([
    new THREE.CylinderGeometry(0.17, 0.2, 0.62, 7).translate(0, 1.16, 0), // 胴
    new THREE.BoxGeometry(0.3, 0.84, 0.17).translate(0, 0.43, 0), // 脚
    new THREE.BoxGeometry(0.52, 0.12, 0.15).translate(0, 1.4, 0), // 肩と腕
  ])
  const headGeo = keep(new THREE.SphereGeometry(0.115, 8, 6))
  const bodyMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }))
  const headMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 }))

  // ── 河川敷に等間隔に座る人（夕方・夜・昼の一部。雨と雪の日は居ない） ──
  // 水際から 3〜9m の河川敷の平らな所を、乱数の順に、まわり 7.5m に人が居ない所だけ選ぶ＝自然に等間隔になる（鴨川の「等間隔の法則」）。2割は二人連れ
  const seatCand = []
  if (!WET) {
    const want = Math.round((low ? 36 : 72) * ({ spring: 0.9, summer: 1, autumn: 0.75, winter: 0.25 }[S] || 0.7) * ({ dusk: 1, night: 0.7, noon: 0.5, morning: 0.2 }[TK] || 0.5) * (sky === 'cloudy' ? 0.7 : 1))
    if (want > 0) {
      const tS0 = performance.now()
      const STEP = low ? 4.5 : 3 // 【便20・外の目】軽い段（iPhone）は候補探しの刻みを粗くする（開く時に主の糸を止めない）
      for (let Z = -260; Z <= 520; Z += STEP) for (let X = -260; X <= 260; X += STEP) {
        if (zoneK(X, Z) !== 1 || wetK(X, Z) > 0.05) continue
        const h = terrK(X, Z); if (h - WY < 0.35 || h - WY > 3.2) continue
        if (Math.abs(terrK(X + 2, Z) - h) > 0.35 || Math.abs(terrK(X, Z + 2) - h) > 0.35) continue // 平らな所だけ（護岸の斜面に座らせない）
        let best = 1e9, bx = 0, bz = 0
        for (let a = 0; a < 12; a++) { const an = (a / 12) * 6.2832; for (const r of [3, 5, 7, 9]) { const x = X + Math.cos(an) * r, z = Z + Math.sin(an) * r; if (wetK(x, z) >= 0.5) { if (r < best) { best = r; bx = x - X; bz = z - Z } break } } }
        if (best < 3 || best > 9) continue
        seatCand.push([X + (rnd() - 0.5) * 1.6, Z + (rnd() - 0.5) * 1.6, Math.atan2(bx, bz)])
      }
      for (let i = seatCand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = seatCand[i]; seatCand[i] = seatCand[j]; seatCand[j] = t }
      const chosen = []
      for (const c of seatCand) {
        if (chosen.length >= want) break
        if (chosen.some((d) => Math.hypot(d[0] - c[0], d[1] - c[1]) < 7.5)) continue
        chosen.push(c)
      }
      const seats = []
      for (const [x, z, yaw] of chosen) {
        seats.push([x, z, yaw])
        if (rnd() < 0.22) { const s = rnd() < 0.5 ? 0.72 : -0.72; seats.push([x + Math.cos(yaw) * s, z - Math.sin(yaw) * s, yaw + (rnd() - 0.5) * 0.3]) } // 二人連れ（横に並ぶ）
      }
      if (seats.length) {
        const bodies = new THREE.InstancedMesh(seatBody, bodyMat, seats.length), heads = new THREE.InstancedMesh(headGeo, headMat, seats.length)
        seats.forEach(([x, z, yaw], k) => {
          const y = terrK(x, z) - 0.04
          q.setFromAxisAngle(up, yaw + (rnd() - 0.5) * 0.5); m4.compose(v3.set(x, y, z), q, one); bodies.setMatrixAt(k, m4)
          m4.compose(v3.set(x, y + 1.0, z).add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.03)), q, one); heads.setMatrixAt(k, m4)
          bodies.setColorAt(k, col.setHex(pick(CLOTH))); heads.setColorAt(k, col.setHex(pick(HAIR)))
        })
        bodies.computeBoundingSphere(); heads.computeBoundingSphere()
        add(bodies, 'people'); add(heads, 'people')
        info.sitters = seats.length
        info.seat0 = seats.slice(0, 4).map(([x, z]) => [Math.round(x), Math.round(terrK(x, z) * 10) / 10, Math.round(z)])
      }
      info.seatMs = Math.round(performance.now() - tS0)
    }
  }

  // ── 飛び石の並び（亀と千鳥の石）。近い石どうしをつないで、渡る順の列にする ──
  const chains = []
  {
    const st = ctx.stones, n = st ? st.length / 4 : 0, used = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      const grp = [i]; used[i] = 1
      for (let g = 0; g < grp.length; g++) for (let j = 0; j < n; j++) if (!used[j] && Math.hypot(st[grp[g] * 4] - st[j * 4], st[grp[g] * 4 + 2] - st[j * 4 + 2]) < 2.9) { used[j] = 1; grp.push(j) }
      if (grp.length < 5) continue
      // 一番離れた2つを両端にし、端からの距離の順に並べる
      let a = grp[0], far = -1; for (const j of grp) { const d = Math.hypot(st[j * 4] - st[a * 4], st[j * 4 + 2] - st[a * 4 + 2]); if (d > far) { far = d; a = j } }
      const ax = st[a * 4], az = st[a * 4 + 2]
      grp.sort((p, r) => Math.hypot(st[p * 4] - ax, st[p * 4 + 2] - az) - Math.hypot(st[r * 4] - ax, st[r * 4 + 2] - az))
      chains.push(grp.map((j) => [st[j * 4], st[j * 4 + 1], st[j * 4 + 2]]))
    }
  }

  // ── アオサギ（昼・水際の浅い所に立つ。ときどき首の向きを変える） ──
  const herons = []
  if (DAY) {
    const g = merge([
      new THREE.SphereGeometry(1, 8, 6).scale(0.17, 0.15, 0.36).translate(0, 0.78, 0), // 胴
      new THREE.CylinderGeometry(0.035, 0.05, 0.42, 5).rotateX(-0.35).translate(0, 1.02, 0.2), // 首
      new THREE.SphereGeometry(0.06, 6, 4).translate(0, 1.22, 0.28), // 頭
      new THREE.ConeGeometry(0.022, 0.16, 4).rotateX(Math.PI / 2).translate(0, 1.22, 0.4), // くちばし
      new THREE.CylinderGeometry(0.012, 0.012, 0.66, 3).translate(0.05, 0.33, 0), new THREE.CylinderGeometry(0.012, 0.012, 0.66, 3).translate(-0.05, 0.33, 0), // 脚
    ])
    const mat = keep(new THREE.MeshStandardMaterial({ color: 0x8c949c, roughness: 0.85 }))
    const spots = []
    for (let k = 0; k < 400 && spots.length < (low ? 2 : 3); k++) {
      const X = (rnd() - 0.5) * 360, Z = -200 + rnd() * 560
      if (wetK(X, Z) < 0.6) continue
      let edge = false; for (let a = 0; a < 8 && !edge; a++) if (wetK(X + Math.cos(a * 0.785) * 4, Z + Math.sin(a * 0.785) * 4) < 0.3) edge = true
      if (!edge || spots.some((s) => Math.hypot(s[0] - X, s[1] - Z) < 60)) continue
      spots.push([X, Z])
    }
    if (spots.length) {
      const im = new THREE.InstancedMesh(g, mat, spots.length)
      spots.forEach(([x, z], k) => herons.push({ x, z, y: WY - 0.12, yaw: rnd() * 6.283, want: 0, t: rnd() * 20 }))
      add(im, 'birds'); herons.mesh = im; info.herons = spots.length
    }
  }

  // ── 鳥（トビ・ユリカモメ）。胴と左右の翼を別の形にして、翼だけを羽ばたかせる ──
  const birdBody = keep(new THREE.ConeGeometry(0.09, 0.62, 5).rotateX(Math.PI / 2))
  const wingGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.14, 0.82, 0, -0.06, 0, 0, -0.16, 0.82, 0, -0.06, 0.6, 0, -0.2, 0, 0, -0.16], 3)); g.computeVertexNormals(); return keep(g) })()
  const MAXB = 2 + (low ? 10 : 16)
  const birdMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }))
  const bBody = add(new THREE.InstancedMesh(birdBody, birdMat, MAXB), 'birds'), bWing = add(new THREE.InstancedMesh(wingGeo, birdMat, MAXB * 2), 'birds')
  bBody.frustumCulled = bWing.frustumCulled = false
  const birds = [] // { x,y,z, yaw, bank, flap（0..1 の羽ばたきの強さ）, ph, sc, color, kind }
  const kites = []
  if (DAY && !WET) {
    for (let k = 0; k < 2; k++) {
      const b = { kind: 'tobi', cx: -20 + k * 50, cz: -60 + k * 90, r: 45 + rnd() * 30, h: WY + 38 + rnd() * 30, a: rnd() * 6.283, w: (rnd() < 0.5 ? -1 : 1) * (0.12 + rnd() * 0.05), ph: rnd() * 10, flap: 0, sc: 1.55, color: 0x4a3a2c, x: 0, y: 0, z: 0, yaw: 0, bank: 0 }
      kites.push(b); birds.push(b)
    }
    info.kites = kites.length
  }
  const gulls = [] // ユリカモメの群れ（冬の出来事）
  const bE = new THREE.Euler(0, 0, 0, 'YXZ'), wE = new THREE.Euler(), wq = new THREE.Quaternion(), qq = new THREE.Quaternion(), bS = new THREE.Vector3() // 【便20・外の目】毎こまの割り当てを使い回す
  function drawBirds(t) {
    let n = 0
    for (const b of birds) {
      if (b.hidden || n >= MAXB) continue
      q.setFromEuler(bE.set(0, b.yaw, b.bank, 'YXZ'))
      m4.compose(v3.set(b.x, b.y, b.z), q, bS.set(b.sc, b.sc, b.sc)); bBody.setMatrixAt(n, m4); bBody.setColorAt(n, col.setHex(b.color))
      const fl = b.flap * Math.sin(t * (b.kind === 'gull' ? 15 : 7) + b.ph) * 0.75 + (b.kind === 'tobi' ? 0.08 : 0.15) // 翼の上げ下げ（トビは浅い上反角で滑る）
      for (const s of [1, -1]) {
        wq.setFromEuler(wE.set(0, 0, s * fl)); qq.copy(q).multiply(wq)
        m4.compose(v3.set(b.x, b.y, b.z), qq, bS.set(s * b.sc, b.sc, b.sc)); bWing.setMatrixAt(n * 2 + (s > 0 ? 0 : 1), m4); bWing.setColorAt(n * 2 + (s > 0 ? 0 : 1), col.setHex(b.wing || b.color))
      }
      n++
    }
    bBody.count = n; bWing.count = n * 2
    bBody.visible = bWing.visible = n > 0; if (!n) return // 居ない時は描かない（夜は鳥が居ない）
    bBody.instanceMatrix.needsUpdate = bWing.instanceMatrix.needsUpdate = true
    if (bBody.instanceColor) bBody.instanceColor.needsUpdate = true
    if (bWing.instanceColor) bWing.instanceColor.needsUpdate = true
  }
  // 色の入れ物を先に作る（count が 0 の時に setColorAt が無いと、後で色の無い材として組まれる）
  for (let i = 0; i < MAXB; i++) { bBody.setColorAt(i, col.setHex(0x4a3a2c)); bWing.setColorAt(i * 2, col); bWing.setColorAt(i * 2 + 1, col) }
  bBody.count = 0; bWing.count = 0

  // ── 立って歩く人（飛び石を渡る人）。2人まで ──
  const walkers = []
  const wBody = add(new THREE.InstancedMesh(standBody, bodyMat, 2), 'people'), wHead = add(new THREE.InstancedMesh(headGeo, headMat, 2), 'people')
  wBody.frustumCulled = wHead.frustumCulled = false
  for (let i = 0; i < 2; i++) { wBody.setColorAt(i, col.setHex(0xe8e4da)); wHead.setColorAt(i, col.setHex(0x1a1614)) }
  wBody.count = wHead.count = 0
  function startHop() {
    if (!chains.length || walkers.length) return false
    const ch = pick(chains), fwd = rnd() < 0.5, stones = fwd ? ch : ch.slice().reverse()
    const s0 = stones[0], s1 = stones[1], sN = stones[stones.length - 1], sM = stones[stones.length - 2]
    const dIn = new THREE.Vector2(s0[0] - s1[0], s0[2] - s1[2]).normalize(), dOut = new THREE.Vector2(sN[0] - sM[0], sN[2] - sM[2]).normalize()
    const land = (p, d) => { for (let r = 1.5; r < 12; r += 0.5) { const x = p[0] + d.x * r, z = p[2] + d.y * r; if (wetK(x, z) < 0.3) return [x, z] } return [p[0] + d.x * 2, p[2] + d.y * 2] }
    const a = land(s0, dIn), b = land(sN, dOut)
    // 道のり: 岸を 7m 歩く → 石を跳ぶ → 向こう岸を 8m 歩いて消える
    const path = [{ x: a[0] + dIn.x * 7, z: a[1] + dIn.y * 7, mode: 'walk' }, { x: a[0], z: a[1], mode: 'walk' }]
    for (const s of stones) path.push({ x: s[0], z: s[2], y: s[1] + 0.01, mode: 'hop' }) // 【便21・外の目】便21 の石は上の面が置き場の高さ（前の丸めた石は 0.32 上）＝足を石の上に
    path.push({ x: b[0], z: b[1], mode: 'hop' }, { x: b[0] + dOut.x * 8, z: b[1] + dOut.y * 8, mode: 'walk' })
    const n = rnd() < 0.35 ? 2 : 1
    for (let i = 0; i < n; i++) walkers.push({ path, seg: 0, u: 0, delay: i * 1.3, color: pick(CLOTH), hair: pick(HAIR), x: path[0].x, z: path[0].z, y: terrK(path[0].x, path[0].z), yaw: 0, done: false })
    return true
  }
  function stepWalkers(dt) {
    let n = 0
    for (const w of walkers) {
      if (w.delay > 0) { w.delay -= dt; continue }
      const A = w.path[w.seg], B = w.path[w.seg + 1]
      if (!B) { w.done = true; continue }
      const L = Math.hypot(B.x - A.x, B.z - A.z), hop = B.mode === 'hop'
      const dur = hop ? 0.5 : Math.max(0.2, L / 1.25)
      w.u += dt / (hop ? dur + 0.18 : dur) // 跳ぶ前に一呼吸
      const u = Math.min(1, hop ? Math.max(0, (w.u * (dur + 0.18) - 0.18) / dur) : w.u)
      const yA = A.y ?? terrK(A.x, A.z), yB = B.y ?? terrK(B.x, B.z)
      w.x = A.x + (B.x - A.x) * u; w.z = A.z + (B.z - A.z) * u
      w.y = yA + (yB - yA) * u + (hop ? Math.sin(u * Math.PI) * 0.38 : Math.abs(Math.sin(u * L * 2.6)) * 0.03)
      if (L > 0.05) w.yaw = Math.atan2(B.x - A.x, B.z - A.z)
      if (w.u >= 1) { w.seg++; w.u = 0 }
      q.setFromAxisAngle(up, w.yaw)
      m4.compose(v3.set(w.x, w.y, w.z), q, one); wBody.setMatrixAt(n, m4); wBody.setColorAt(n, col.setHex(w.color))
      m4.compose(v3.set(w.x, w.y + 1.6, w.z), q, one); wHead.setMatrixAt(n, m4); wHead.setColorAt(n, col.setHex(w.hair))
      n++
    }
    for (let i = walkers.length - 1; i >= 0; i--) if (walkers[i].done) walkers.splice(i, 1)
    wBody.count = wHead.count = n
    wBody.visible = wHead.visible = n > 0; if (!n) return
    wBody.instanceMatrix.needsUpdate = wHead.instanceMatrix.needsUpdate = true
    if (wBody.instanceColor) wBody.instanceColor.needsUpdate = true
    if (wHead.instanceColor) wHead.instanceColor.needsUpdate = true
  }

  // ── 叡山電車（2両・出町柳駅に着いて、しばらく停まって、また出る）。線路は OpenStreetMap の叡山電鉄の2本 ──
  // 車体は特定の車両の塗り分けにせず、アイボリーに深緑の帯（どの車両の写しでもない色）
  let train = null
  const CAR0 = 15.6, LONG = 6 + 2 * CAR0 + 0.7 + 4 // 【便20・外の目】2両が駅の所で重ならず、線路の上に全部載る長さ
  const trackOk = (arr) => { if (!Array.isArray(arr) || arr.length < 4) return false; let L = 0; for (let i = 2; i < arr.length; i += 2) L += Math.hypot(arr[i] - arr[i - 2], arr[i + 1] - arr[i - 1]); return L > LONG + 40 }
  if (life && life.eiden && trackOk(life.eiden.a)) {
    const mk = (arr) => { const p = []; for (let i = 0; i < arr.length; i += 2) p.push([arr[i], arr[i + 1]]); const s = [0]; for (let i = 1; i < p.length; i++) s.push(s[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return { p, s, L: s[s.length - 1] } }
    const tracks = [mk(life.eiden.a), mk(trackOk(life.eiden.b) ? life.eiden.b : life.eiden.a)] // b が短い・無い時は a で代える
    const at = (tr, s) => { s = Math.max(0, Math.min(tr.L, s)); let i = 1; while (i < tr.s.length - 1 && tr.s[i] < s) i++; const u = (s - tr.s[i - 1]) / Math.max(1e-6, tr.s[i] - tr.s[i - 1]), a = tr.p[i - 1], b = tr.p[i]; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u] }
    const CAR = CAR0, GAP = 0.7
    const carGeo = (() => {
      const pc = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g }
      const gs = [
        pc(new THREE.BoxGeometry(2.42, 0.5, CAR - 1.2).translate(0, 0.62, 0), 0x2a2c2e), // 床下と台車
        pc(new THREE.BoxGeometry(2.6, 2.5, CAR).translate(0, 2.12, 0), 0xe6e0d0), // 車体（アイボリー）
        pc(new THREE.BoxGeometry(2.62, 0.26, CAR + 0.02).translate(0, 1.32, 0), 0x2e5a44), // 帯（深緑）
        pc(new THREE.BoxGeometry(2.3, 0.22, CAR - 0.4).translate(0, 3.46, 0), 0x8a8e92), // 屋根
        pc(new THREE.BoxGeometry(1.2, 0.3, 2.2).translate(0, 3.7, 1.5), 0x6a6e72), // 冷房の箱
      ]
      return merge(gs)
    })()
    const winGeo = merge([
      new THREE.BoxGeometry(2.64, 0.86, CAR - 2.2).translate(0, 2.42, 0), // 横の窓の帯（両側）
      new THREE.BoxGeometry(1.9, 0.9, CAR + 0.04).translate(0, 2.42, 0), // 前と後ろの窓（幅 1.9m の箱を車体の長さよりわずかに長く＝端の面だけが車体の外に出る）
    ])
    const carMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 }))
    const winMat = NIGHT || DUSK ? keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.86, 0.62).multiplyScalar(NIGHT ? 2.2 : 1.3) })) : keep(new THREE.MeshStandardMaterial({ color: 0x1a2228, roughness: 0.12, metalness: 0.2 }))
    const cars = add(new THREE.InstancedMesh(carGeo, carMat, 2), 'train'), wins = add(new THREE.InstancedMesh(winGeo, winMat, 2), 'train')
    cars.frustumCulled = wins.frustumCulled = false
    const lampGeo = keep(new THREE.PlaneGeometry(0.34, 0.2)), lampMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.86).multiplyScalar(NIGHT ? 6 : DUSK ? 3 : 1.4), side: THREE.DoubleSide }))
    const lamps = add(new THREE.InstancedMesh(lampGeo, lampMat, 2), 'train'); lamps.frustumCulled = false
    const STOP = 6 // 駅の奥の端から 6m の所に前の端を停める
    train = { tracks, at, tr: 0, s0: 1e9, v: 0, mode: 'away', wait: 18 + rnd() * 30, cars, wins, lamps, CAR, GAP, STOP, sound: false }
    cars.visible = wins.visible = lamps.visible = false
  }
  const tY = (x, z) => terrK(x, z) + 0.22
  function placeTrain() {
    const T = train, tr = T.tracks[T.tr]
    const show = T.mode !== 'away' && T.s0 <= tr.L - (2 * T.CAR + T.GAP) // 【便20・外の目】2両とも線路の上にある時だけ（端で2両目が潰れて立たない）
    T.cars.visible = T.wins.visible = T.lamps.visible = show
    if (!show) return
    for (let k = 0; k < 2; k++) {
      const sa = T.s0 + k * (T.CAR + T.GAP), sb = sa + T.CAR, A = T.at(tr, sa), B = T.at(tr, sb)
      const cx = (A[0] + B[0]) / 2, cz = (A[1] + B[1]) / 2, yaw = Math.atan2(B[0] - A[0], B[1] - A[1])
      q.setFromAxisAngle(up, yaw); m4.compose(v3.set(cx, (tY(A[0], A[1]) + tY(B[0], B[1])) / 2, cz), q, one)
      T.cars.setMatrixAt(k, m4); T.wins.setMatrixAt(k, m4)
    }
    // 前照灯: 進む向きの先頭の端（着く時は駅側＝s0 の端・出る時は北東側の端）
    const front = T.mode === 'depart' ? T.s0 + 2 * T.CAR + T.GAP : T.s0, back = T.mode === 'depart' ? front - 1 : front + 1
    const F = T.at(tr, front), Bk = T.at(tr, back), yaw = Math.atan2(F[0] - Bk[0], F[1] - Bk[1])
    q.setFromAxisAngle(up, yaw)
    for (const [k, s] of [[0, 0.75], [1, -0.75]]) { const ox = Math.cos(yaw) * s, oz = -Math.sin(yaw) * s; m4.compose(v3.set(F[0] + ox + Math.sin(yaw) * 0.03, tY(F[0], F[1]) + 1.25, F[1] + oz + Math.cos(yaw) * 0.03), q, one); T.lamps.setMatrixAt(k, m4) }
    T.cars.instanceMatrix.needsUpdate = T.wins.instanceMatrix.needsUpdate = T.lamps.instanceMatrix.needsUpdate = true
  }
  function stepTrain(dt) {
    const T = train; if (!T) return
    const tr = T.tracks[T.tr], VMAX = 11, DEC = 0.55, ACC = 0.6
    if (T.mode === 'away') {
      T.wait -= dt
      if (T.wait <= 0) { T.tr = rnd() < 0.5 ? 0 : 1; T.mode = 'arrive'; T.s0 = T.tracks[T.tr].L - (2 * T.CAR + T.GAP); T.v = VMAX; T.sound = false; info.ev.eiden = (info.ev.eiden || 0) + 1; info.last = 'eiden' }
    } else if (T.mode === 'arrive') {
      const left = T.s0 - T.STOP
      const vWant = Math.min(VMAX, Math.sqrt(Math.max(0, 2 * DEC * left)) + 0.15)
      T.v = Math.min(vWant, T.v); T.s0 -= T.v * dt
      if (!T.sound && left < 320) { T.sound = true; sound('eiden', T.at(tr, T.s0), { dep: false }) }
      if (left <= 0.05) { T.s0 = T.STOP; T.mode = 'dwell'; T.wait = 40 + rnd() * 35 }
    } else if (T.mode === 'dwell') {
      T.wait -= dt
      if (T.wait <= 0) { T.mode = 'depart'; T.v = 0; sound('eiden', T.at(tr, T.s0), { dep: true }) }
    } else if (T.mode === 'depart') {
      T.v = Math.min(VMAX, T.v + ACC * dt); T.s0 += T.v * dt
      if (T.s0 >= tr.L - (2 * T.CAR + T.GAP)) { T.mode = 'away'; T.wait = 150 + rnd() * 110 }
    }
    placeTrain()
  }

  // ── 出町桝形商店街のアーケード（屋根と骨・提灯。夕方と夜は灯る） ──
  if (life && life.masugata && life.masugata.length >= 4) {
    const pts = []; for (let i = 0; i < life.masugata.length; i += 2) pts.push([life.masugata[i], life.masugata[i + 1]])
    const roof = [], ribs = [], lant = []
    const W = 2.6, H = 6.2
    let acc = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx
      for (let d = 0; d < L; d += 2) {
        const e = Math.min(L, d + 2), x0 = ax + dx * d, z0 = az + dz * d, x1 = ax + dx * e, z1 = az + dz * e
        const y0 = terrK(x0, z0) + H, y1 = terrK(x1, z1) + H
        // 切妻の屋根（両側から棟へ 0.9m 上がる）
        for (const s of [1, -1]) roof.push(x0 + nx * W * s, y0, z0 + nz * W * s, x1 + nx * W * s, y1, z1 + nz * W * s, x1, y1 + 0.9, z1, x0 + nx * W * s, y0, z0 + nz * W * s, x1, y1 + 0.9, z1, x0, y0 + 0.9, z0)
        acc += e - d
        if (acc >= 4) { acc = 0; ribs.push([x0, y0, z0, Math.atan2(dx, dz)]) }
        if (Math.round(d) % 8 === 0) lant.push([x0 + nx * 1.6, y0 - 0.9, z0 + nz * 1.6], [x0 - nx * 1.6, y0 - 0.9, z0 - nz * 1.6])
      }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(roof, 3)); rg.computeVertexNormals(); keep(rg)
    const rm = keep(new THREE.MeshStandardMaterial({ color: 0xdfe4e2, roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, emissive: new THREE.Color(1, 0.84, 0.6), emissiveIntensity: NIGHT ? 0.55 : DUSK ? 0.3 : 0 }))
    add(new THREE.Mesh(rg, rm), 'arcade')
    const ribG = keep(new THREE.BoxGeometry(2 * W + 0.3, 0.16, 0.16).translate(0, 0.25, 0)), ribM = keep(new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.6, metalness: 0.4 }))
    const ri = new THREE.InstancedMesh(ribG, ribM, ribs.length)
    ribs.forEach(([x, y, z, yaw], k) => { q.setFromAxisAngle(up, yaw + Math.PI / 2); m4.compose(v3.set(x, y, z), q, one); ri.setMatrixAt(k, m4) })
    add(ri, 'arcade')
    // 【便20・外の目】前は emissive が白で、夜は赤と白の提灯がどちらも白く光った＝夕と夜は灯った色（インスタンスの色×明るさ）で描く
    const lg = keep(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8)), lm = keep(NIGHT || DUSK ? new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(NIGHT ? 1.6 : 1.1) }) : new THREE.MeshStandardMaterial({ roughness: 0.7 }))
    const li = new THREE.InstancedMesh(lg, lm, lant.length)
    lant.forEach(([x, y, z], k) => { m4.compose(v3.set(x, y, z), q.identity(), one); li.setMatrixAt(k, m4); const red = k % 4 < 2; li.setColorAt(k, col.setHex(red ? 0xc8382c : 0xf0e8d8)) })
    add(li, 'arcade')
  }

  // ── 五山の送り火（夏の夜。開いて 22〜36 秒で1回目・その後は 10〜16 分おき）。本物と同じ順に、大文字 → 妙法 → 船形 → 左大文字 → 鳥居形 と一つずつ灯り、点いた順に消えていく ──
  // 本物は 20時から5分おき・それぞれ30分ほど。眺める長さに合わせて、5分を 25 秒に縮め、燃える長さを約2分半にした。
  // 位置は OpenStreetMap の五山の点（life.json の gozan）。字の寸法と火床の数は京都の案内の数（大文字 一画 80m・二画 160m・三画 120m・75 床／妙 100m 弱・103 床／
  // 法 80m 弱・63 床／船形 縦 130m・横 200m・79 床／左大文字 一画 48m・二画 68m・三画 59m・53 床／鳥居形 縦 76m・横 72m・108 床）。
  // 字の面は鴨川デルタから見た向きに合わせる（デルタから山へ向かう水平の向きを「奥」、その直角を「右」）。斜面に寝かせた字は下から見ると縦が縮むので、縦を 1.45 倍に置く。
  // 高さは斜面の平均の面に揃え、地面より 1.5m 下には沈めない（地形のでこぼこのままだと一画が傾いて見えた＝便20 の調べ）。
  // 大文字は、OpenStreetMap の点より東（上）が肩のように平らで、下から見ると字の上が尾根に隠れた（便20 の1回目）ので、字の中心を斜面の下へ 75m ずらす
  const SHAPES = {
    daimonji: { s: 1, st: [[19, [[-40, 40], [40, 40]]], [29, [[0, 88], [0, 40], [-8, 10], [-30, -35], [-62, -78]]], [27, [[-6, 14], [24, -22], [64, -78]]]], down: 75 },
    hidari: { s: 0.42, st: [[13, [[-40, 40], [40, 40]]], [21, [[0, 88], [0, 40], [-8, 10], [-30, -35], [-62, -78]]], [19, [[-6, 14], [24, -22], [64, -78]]]] },
    myo: { s: 1, st: [ // 妙＝女＋少（100m 弱の四角に）
      [14, [[-28, 45], [-44, 6], [-8, -36]]], [14, [[-14, 45], [-24, 0], [-44, -40]]], [12, [[-50, 16], [-4, 16]]],
      [10, [[24, 48], [24, 6]]], [5, [[10, 36], [4, 22]]], [5, [[38, 36], [46, 22]]], [18, [[42, 2], [22, -24], [-2, -46]]]], vk: 2.1 }, // 低い南向きの山を遠くから見るので、縦をさらに伸ばす
    ho: { s: 1, st: [ // 法＝氵＋去（80m 弱の四角に）
      [5, [[-34, 34], [-27, 28]]], [5, [[-38, 14], [-30, 9]]], [8, [[-38, -32], [-25, -8]]],
      [10, [[-10, 24], [32, 24]]], [7, [[11, 38], [11, 6]]], [11, [[-16, 6], [36, 6]]], [12, [[10, 6], [-6, -26], [30, -24]]], [5, [[22, -12], [32, -22]]]], vk: 1.9 },
    funa: { s: 1, st: [[38, [[-100, -6], [-72, -50], [74, -50], [100, -2]]], [26, [[-100, -6], [100, -2]]], [15, [[-4, -6], [-4, 80]]]] }, // 船＝船体と帆柱
    torii: { s: 1, st: [[30, [[-40, 34], [-14, 38], [14, 38], [40, 34]]], [20, [[-30, 20], [30, 20]]], [29, [[-20, 36], [-22, -38]]], [29, [[20, 36], [22, -38]]]], vk: 2.2, down: 20 }, // 鳥居＝笠木・貫・二本の柱（9km 先の低い山なので縦を伸ばす）
  }
  let okuribi = null
  if (life && Array.isArray(life.gozan) && S === 'summer' && NIGHT && !WET) {
    const beds = []
    life.gozan.forEach((G, gi) => {
      const sh = SHAPES[G.k]; if (!sh) return
      const fw = new THREE.Vector2(G.x, G.z).normalize(), rt = new THREE.Vector2(-fw.y, fw.x) // 奥（デルタから山へ）と右
      const cx = G.x - fw.x * (sh.down || 0), cz = G.z - fw.y * (sh.down || 0)
      const mine = []
      // 火床の数を、画の長さに合わせて画ごとに割り振る（最後の画で合計を案内の数にそろえる）
      const lens = sh.st.map(([, pl]) => { let L = 0; for (let i = 1; i < pl.length; i++) L += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]); return L })
      const tot = lens.reduce((a, b) => a + b, 0) || 1
      let left = G.beds
      sh.st.forEach(([, pl], si) => {
        const n = si === sh.st.length - 1 ? Math.max(2, left) : Math.max(2, Math.round((G.beds * lens[si]) / tot)); left -= n
        const seg = [0]; for (let i = 1; i < pl.length; i++) seg.push(seg[i - 1] + Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]))
        const L = seg[seg.length - 1]
        for (let k = 0; k < n; k++) {
          const s = (k / (n - 1)) * L
          let i = 1; while (i < seg.length - 1 && seg[i] < s) i++
          const a = pl[i - 1], b = pl[i], u = seg[i] > seg[i - 1] ? (s - seg[i - 1]) / (seg[i] - seg[i - 1]) : 0
          const iu = (a[0] + (b[0] - a[0]) * u) * sh.s, iv = (a[1] + (b[1] - a[1]) * u) * sh.s
          const x = cx + rt.x * iu + fw.x * iv * (sh.vk || 1.45), z = cz + rt.y * iu + fw.y * iv * (sh.vk || 1.45)
          mine.push({ x, z, iv, y: farK(x, z) + 3, g: gi, order: G.min * 5 + (si / sh.st.length) * 9 + (k / n) * 5 + rnd() * 3 }) // 点く時刻（秒）＝5分を25秒に縮めた順＋画の順
        }
      })
      { let sv = 0, sy = 0, svv = 0, svy = 0; for (const b of mine) { sv += b.iv; sy += b.y; svv += b.iv * b.iv; svy += b.iv * b.y } const N = mine.length, k1 = (N * svy - sv * sy) / Math.max(1e-6, N * svv - sv * sv), k0 = (sy - k1 * sv) / N
        for (const b of mine) b.y = Math.max(k0 + k1 * b.iv, farK(b.x, b.z) + 1.5) }
      beds.push(...mine)
    })
    const n = beds.length, pos = new Float32Array(n * 3), lit = new Float32Array(n), ph = new Float32Array(n)
    beds.forEach((b, i) => { pos.set([b.x, b.y, b.z], i * 3); ph[i] = rnd() * 50 })
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aLit', new THREE.BufferAttribute(lit, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 200, 0), 12000)
    const mk = (size, gain, soft) => keep(new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uScale: { value: 600 }, uSize: { value: size }, uGain: { value: gain } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float aLit; attribute float aPh; uniform float uT, uScale, uSize; varying float vL;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); float fl = 0.78 + 0.14 * sin(uT * 7.3 + aPh) + 0.08 * sin(uT * 13.1 + aPh * 1.7);
  vL = aLit * fl * mix(1.0, 0.75, smoothstep(3000.0, 9000.0, -mv.z)); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, uSize * uScale / -mv.z) * (0.6 + 0.4 * aLit); }`,
      fragmentShader: `uniform float uGain; varying float vL; void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = ${soft ? 'exp(-r * r * 3.2)' : 'smoothstep(1.0, 0.15, r)'};
  if (a * vL < 0.002) discard; gl_FragColor = vec4(vec3(1.0, 0.56, 0.22) * uGain * vL * a, 1.0); }`,
    }))
    const core = new THREE.Points(g, mk(9, 4.2, false)), halo = new THREE.Points(g, mk(30, 0.55, true))
    core.frustumCulled = halo.frustumCulled = false
    add(core, 'okuribi'); add(halo, 'okuribi')
    const lastOn = Math.max(...beds.map((b) => b.order))
    okuribi = { beds, lit, attr: g.attributes.aLit, mats: [core.material, halo.material], t: -1, wait: 22 + rnd() * 14, dur: lastOn + 7 + 150 + 75, names: life.gozan.map((G) => G.k), lastOn }
  }
  function startOkuribi() { if (!okuribi || okuribi.t >= 0) return false; okuribi.t = 0; info.ev.okuribi = (info.ev.okuribi || 0) + 1; info.last = 'okuribi'; onSound('okuribi', { amt: 0, pan: 0 }); return true }
  function stepOkuribi(dt, t) {
    const O = okuribi; if (!O) return
    for (const m of O.mats) { m.uniforms.uT.value = t; m.uniforms.uScale.value = ((renderer && renderer.domElement.height) || 800) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov || 60) / 2)) * (camera.zoom || 1) }
    // ~~視差軽減では点かない~~（【便20・外の目】ゆっくり点く遠い火で大きな動きは無く、この情景の見どころなので、視差軽減でも灯す。止めるのは帯の突発だけ）
    if (O.t < 0) { O.wait -= dt; if (O.wait <= 0) startOkuribi(); return }
    O.t += dt
    const T = O.t
    O.beds.forEach((b, i) => { // 点く（7秒で燃え上がる）→ 燃える（約2分半）→ 点いた順に、火床ごとに少しずつずれて消えていく
      const on = smooth(b.order, b.order + 7, T), endA = b.order + 150 + (i % 7) * 5, off = 1 - smooth(endA, endA + 45, T)
      O.lit[i] = on * off * (T > b.order + 150 ? 0.92 : 1)
    })
    O.attr.needsUpdate = true
    if (T > O.dur) { O.t = -1; O.wait = 600 + rnd() * 360; O.lit.fill(0); O.attr.needsUpdate = true }
  }

  // ── 音: 近さ（0..1）と左右（-1..1・目の右が +）。目は鴨川の目（部屋の目を写した物） ──
  const camR = new THREE.Vector3()
  function panAmt(x, z, far = 600) {
    const cp = camera.position, dx = x - cp.x, dz = z - cp.z, d = Math.hypot(dx, dz)
    camR.setFromMatrixColumn(camera.matrixWorld, 0); camR.y = 0; camR.normalize()
    const pan = d > 0.1 ? Math.max(-0.9, Math.min(0.9, (dx * camR.x + dz * camR.z) / d)) : 0
    return { amt: Math.max(0.06, Math.min(1, 1 - d / far)), pan: Number.isFinite(pan) ? pan : 0, d }
  }
  function sound(kind, at, extra) { const o = panAmt(at[0], at[1]); info.sounds = (info.sounds || 0) + 1; onSound(kind, { amt: o.amt, pan: o.pan, ...(extra || {}) }) }

  // ── 時々の出来事の器（町の3Dの帯の考えと同じ: 頻繁・中くらい・まれ。3割は何も起きない余白） ──
  const bands = [
    { next: 12 + rnd() * 14, min: 40, max: 95, quiet: 0.3, pool: ['hop', 'tobi'] },
    { next: 60 + rnd() * 60, min: 160, max: 320, pool: ['gulls', 'hop'] },
  ]
  const EV = {
    hop: { ok: () => DAY && !WET && chains.length > 0, run: () => { const r = startHop(); if (r) { info.ev.hop = (info.ev.hop || 0) + 1; info.last = 'hop' } return r } },
    tobi: { ok: () => kites.length > 0, run: () => { const k = pick(kites); sound('tobi', [k.x, k.z]); info.ev.tobi = (info.ev.tobi || 0) + 1; info.last = 'tobi'; return true } },
    gulls: { ok: () => S === 'winter' && DAY && sky !== 'rain' && !gulls.length, run: () => startGulls() },
    okuribi: { ok: () => !!okuribi, run: () => startOkuribi() },
    eiden: { ok: () => !!train, run: () => { if (train.mode !== 'away') return false; train.wait = 0; return true } },
  }
  function startGulls() {
    const n = low ? 10 : 16, north = rnd() < 0.5, x0 = -30 + rnd() * 20
    for (let i = 0; i < n; i++) {
      const b = { kind: 'gull', x: x0 + (rnd() - 0.5) * 18, y: WY + 3 + rnd() * 5, z: (north ? 520 : -300) + (rnd() - 0.5) * 30, vz: (north ? -1 : 1) * (8 + rnd() * 2), wob: rnd() * 6, flap: 1, ph: rnd() * 6, sc: 0.85, color: 0xf2f2ee, wing: 0xc8ccd0, yaw: north ? Math.PI : 0, bank: 0 }
      gulls.push(b); birds.push(b)
    }
    info.ev.gulls = (info.ev.gulls || 0) + 1; info.last = 'gulls'
    return true
  }
  function stepBirds(dt, t) {
    for (const b of kites) {
      b.a += b.w * dt
      b.x = b.cx + Math.cos(b.a) * b.r; b.z = b.cz + Math.sin(b.a) * b.r; b.y = b.h + Math.sin(t * 0.21 + b.ph) * 4
      b.yaw = Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w)); b.bank = -Math.sign(b.w) * 0.32
      b.flap = Math.max(0, Math.sin(t * 0.13 + b.ph) - 0.93) * 6 // ほとんど滑空・たまに数回だけ羽ばたく
    }
    for (let i = gulls.length - 1; i >= 0; i--) {
      const b = gulls[i]; b.z += b.vz * dt; b.x += Math.sin(t * 0.7 + b.wob) * 0.6 * dt; b.y += Math.sin(t * 1.1 + b.wob) * 0.4 * dt
      if (b.z < -560 || b.z > 600) { gulls.splice(i, 1); birds.splice(birds.indexOf(b), 1) }
    }
    drawBirds(t)
    if (herons.mesh) {
      herons.forEach((h, k) => { h.t -= dt; if (h.t <= 0) { h.want = h.yaw + (rnd() - 0.5) * 1.6; h.t = 8 + rnd() * 18 } h.yaw += (h.want - h.yaw) * Math.min(1, dt * 0.8); q.setFromAxisAngle(up, h.yaw); m4.compose(v3.set(h.x, h.y, h.z), q, one); herons.mesh.setMatrixAt(k, m4) })
      herons.mesh.instanceMatrix.needsUpdate = true
    }
  }

  // ── 飛ぶ・歩く時の音の近さ（鴨川の目の位置から）。0.25 秒ごとに測る ──
  const amb = { river: 0, crowd: 0, sta: 0, staPan: 0, voice: 0, voicePan: 0 }
  // 便22: 鴨川デルタの人の声（子どもの遊ぶ声・笑い声）の多さ。昼の晴れと曇りだけ（雨と雪は居ない）。夏が一番多く、冬は少ない。夕方は少し減る。
  //   夜は夏の夜だけ（デルタの手持ち花火の学生と家族）。窓辺（約 120m 先）でもかすかに届き、近づくほど澄む
  const VOICE_BASE = WET ? 0 : NIGHT ? (S === 'summer' ? 0.5 : 0) : ({ summer: 1, spring: 0.75, autumn: 0.65, winter: 0.3 }[S] ?? 0.6) * (DUSK ? 0.7 : 1)
  const DELTA = [-66, 40] // 鴨川デルタ（三角州の先と飛び石のあたり）
  let ambT = 0
  const masu = []; if (life && life.masugata) for (let i = 0; i < life.masugata.length; i += 2) masu.push([life.masugata[i], life.masugata[i + 1]])
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u) }
  function measureAmb() {
    const cp = camera.position, alt = cp.y - terrK(cp.x, cp.z)
    let d = 999
    if (wetK(cp.x, cp.z) >= 0.5) d = 0
    else for (const r of [4, 8, 14, 22, 32, 45]) { let hit = false; for (let a = 0; a < 12; a++) if (wetK(cp.x + Math.cos(a * 0.5236) * r, cp.z + Math.sin(a * 0.5236) * r) >= 0.5) { hit = true; break } if (hit) { d = r; break } }
    let sd = 999; for (const c of chains) for (const s of c) sd = Math.min(sd, Math.hypot(s[0] - cp.x, s[2] - cp.z))
    const low2 = Math.max(0, Math.min(1, (40 - alt) / 35))
    amb.river = Math.pow(Math.max(0, Math.min(1, (48 - d) / 48)), 1.3) * low2 * (1 + 0.6 * Math.max(0, 1 - sd / 28)) // 飛び石の近くは瀬音が強い
    amb.river = Math.min(1, amb.river)
    let md = 999; for (let i = 0; i < masu.length - 1; i++) md = Math.min(md, segD(cp.x, cp.z, masu[i], masu[i + 1]))
    const sta = life && life.eiden ? life.eiden.sta : null, sdist = sta ? Math.hypot(sta.x - cp.x, sta.z - cp.z) : 999
    const glow = Math.max(0, Math.min(1, (30 - alt) / 24))
    // ~~amb.crowd（商店街と駅のまわりの合成のざわめき）・amb.sta（駅の電車の合成の唸り）~~（【便22】鳴らさない。合成の雑音の唸りが車の走る音に聞こえた＝裕也さん「車のような音とかそういうのいらない」。人の声はデルタだけ＝下の amb.voice）
    amb.crowd = 0; amb.sta = 0; void md; void glow
    { const dd = Math.hypot(DELTA[0] - cp.x, DELTA[1] - cp.z), up = Math.max(0, Math.min(1, (90 - alt) / 70)) // 高く飛ぶほど遠のく
      amb.voice = VOICE_BASE * Math.pow(Math.max(0, Math.min(1, 1 - dd / 280)), 1.4) * up
      amb.voicePan = panAmt(DELTA[0], DELTA[1]).pan }
    amb.staPan = sta ? panAmt(sta.x, sta.z).pan : 0
  }

  let tAll = 0
  return {
    update(dt) {
      if (!(dt > 0)) dt = 0
      tAll += dt
      if (!reduceMotion) for (const b of bands) { // 視差軽減では突発の出来事を起こさない（電車・鳥・座る人はいつもの景色として動く）
        b.next -= dt; if (b.next > 0) continue
        b.next = b.min + rnd() * (b.max - b.min)
        if (b.quiet && rnd() < b.quiet) continue
        const ok = b.pool.filter((k) => EV[k].ok()); if (ok.length) EV[pick(ok)].run()
      }
      stepTrain(dt); stepWalkers(dt); stepBirds(dt, tAll); stepOkuribi(dt, tAll)
      ambT -= dt; if (ambT <= 0) { ambT = 0.25; measureAmb() }
    },
    ambience: () => amb,
    trigger(name) { const e = EV[name]; if (!e) return 'no-event'; if (!e.ok()) return 'not-now'; return e.run() ? 'ok' : 'busy' }, // 検証用（?dev=1）: 出来事を今すぐ起こす
    info() {
      return {
        ...info, chains: chains.map((c) => c.length), train: train ? { mode: train.mode, s0: +Math.min(train.s0, 9999).toFixed(1), v: +train.v.toFixed(2), track: train.tr, wait: +train.wait.toFixed(1), shown: train.cars.visible } : null,
        okuribi: okuribi ? { orderBy: okuribi.names.map((_, gi) => { const o = okuribi.beds.filter((b) => b.g === gi).map((b) => b.order); return [+Math.min(...o).toFixed(1), +Math.max(...o).toFixed(1), o.length] }), names: okuribi.names, lastOn: +okuribi.lastOn.toFixed(1), dur: +okuribi.dur.toFixed(0), litBy: okuribi.names.map((_, gi) => +okuribi.beds.reduce((a, b, i) => a + (b.g === gi ? okuribi.lit[i] : 0), 0).toFixed(1)), t: +okuribi.t.toFixed(1), wait: +okuribi.wait.toFixed(1), lit: +(okuribi.lit.reduce((a, b) => a + b, 0)).toFixed(1), beds: okuribi.beds.length, y: [Math.round(Math.min(...okuribi.beds.map((b) => b.y))), Math.round(Math.max(...okuribi.beds.map((b) => b.y)))] } : null,
        walkers: walkers.length, gulls: gulls.length, amb: { river: +amb.river.toFixed(2), crowd: +amb.crowd.toFixed(2), sta: +amb.sta.toFixed(2), staPan: +amb.staPan.toFixed(2), voice: +amb.voice.toFixed(3), voicePan: +amb.voicePan.toFixed(2) }, bandNext: bands.map((b) => +b.next.toFixed(2)),
      }
    },
  }
}
