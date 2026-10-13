// 使い捨て（便5・案の画）: 開発サーバー 4957 のページへ差し込む。本体のファイルは変えず、撮影用の口（__shGet・__b5R）から
// 木・観葉植物・面の質感の見た目だけをその場で差し替える。_bin5-mock.mjs が addScriptTag で読む。
// 作る便で本体に入れる時は、樹種の振り分けを位置のハッシュで決める（主の乱数 R() を回さない＝町の配置を変えない）。
(() => {
  const S = (window.__bin5 = { cam: null, calls: [], ms: [], tris: [], measure: false })

  // 描画の直前にカメラを置く（飛行の自動の動きに上書きされないように）＋測る（便3 と同じ）
  S.setup = () => {
    if (S.ready) return true
    const g = window.__shGet(); if (!g || !g.composer) return false
    const { renderer, camera, composer } = g
    const orig = composer.render.bind(composer)
    renderer.info.autoReset = false
    composer.render = (...a) => {
      const c = S.cam
      if (c) { camera.position.set(...c.p); camera.lookAt(...c.l); if (c.fov && camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix() } camera.updateMatrixWorld() }
      renderer.info.reset()
      const t0 = performance.now()
      const r = orig(...a)
      if (S.measure) { renderer.getContext().finish(); S.ms.push(performance.now() - t0); S.calls.push(renderer.info.render.calls); S.tris.push(renderer.info.render.triangles) }
      return r
    }
    S.ready = true
    return true
  }
  S.measureNow = async (n = 60) => {
    S.ms = []; S.calls = []; S.tris = []; S.measure = true
    await new Promise((res) => { const t0 = performance.now(); const tick = () => (S.ms.length >= n || performance.now() - t0 > 15000 ? res() : requestAnimationFrame(tick)); tick() }) // 描画が止まった時に待ち続けない
    S.measure = false
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
    return { ms: +med(S.ms).toFixed(2), calls: med(S.calls), tris: med(S.tris), n: S.ms.length }
  }

  // 位置から決まる乱数（主の R() を回さない）
  const hash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s) }
  const mkRand = (seed) => { let h = (Math.floor(seed * 4294967296) >>> 0) || 1; return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296 } }
  // 3D の滑らかな値ノイズ（頂点を揺らして輪郭を凸凹に・葉の塊の濃淡に）
  const n3 = (x, y, z) => {
    const fl = Math.floor, ix = fl(x), iy = fl(y), iz = fl(z), fx = x - ix, fy = y - iy, fz = z - iz
    const h = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - fl(s) }
    const sm = (t) => t * t * (3 - 2 * t), u = sm(fx), v = sm(fy), w = sm(fz)
    const l = (a, b, t) => a + (b - a) * t
    return l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), u), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), u), v),
      l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), u), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), u), v), w)
  }

  // ── 木（#1）: 1＝樹種の形（丸い広葉樹・傘形・杉檜の段重ね）と木ごとの色の振れ／2＝1＋葉の模様と縁の葉の板 ──
  let leafAtlas = null
  const makeLeafAtlas = (THREE) => {
    // 左半分＝樹冠の面に貼る詰んだ葉（不透明）／右半分＝縁に挿す葉の房（葉の外は透明）。白〜灰で描き、材の色で染める
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d')
    const rnd = mkRand(0.37)
    x.fillStyle = 'rgb(205,205,205)'; x.fillRect(0, 0, 128, 128)
    const leaf = (cx, cy, l, w, a, v) => { x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.ellipse(0, 0, l, w, 0, 0, 6.283); x.fill(); x.restore() }
    for (let i = 0; i < 520; i++) leaf(rnd() * 128, rnd() * 128, 3 + rnd() * 3.5, 1.6 + rnd() * 1.6, rnd() * 6.283, (165 + rnd() * 90) | 0)
    for (let i = 0; i < 150; i++) { const cx = 128 + 64 + (rnd() - 0.5) * 2 * 50, cy = 64 + (rnd() - 0.5) * 2 * 50; if (Math.hypot(cx - 192, cy - 64) > 54) continue; leaf(cx, cy, 4 + rnd() * 4, 2 + rnd() * 2, rnd() * 6.283, (160 + rnd() * 95) | 0) }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4 // 色の空間は付けない（白〜灰をそのまま掛け算の値に）
    return t
  }
  const crownGeo = (THREE, sp, bb, rnd, withCards) => {
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, cy = (bb.min.y + bb.max.y) / 2
    const rx = (bb.max.x - bb.min.x) / 2, ry = (bb.max.y - bb.min.y) / 2
    const parts = [], clumps = []
    const ico = (r, det) => new THREE.IcosahedronGeometry(r, det)
    if (sp === 'sugi') { // 杉・檜: 細い段重ねの円錐（下ほど広い）。輪郭が尖って街の緑に縦の線が入る
      const n = 4, y0 = bb.min.y - ry * 0.15, top = bb.max.y + ry * 0.55, R0 = rx * 0.72
      for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1.25) / n, yb = y0 + (top - y0) * t0, yt = y0 + (top - y0) * Math.min(1, t1), rr = R0 * (1 - t0 * 0.78)
        const g = new THREE.ConeGeometry(rr, yt - yb, 10, 3); g.translate(cx, (yb + yt) / 2, cz); parts.push(g); clumps.push([cx, yb + (yt - yb) * 0.35, cz, rr * 0.8]) }
    } else if (sp === 'kasa') { // 傘形（欅・桜のような広がる樹冠）: 平たく広い房を輪に。幹が下に長く見える
      const yc = cy + ry * 0.3, n = 6 + ((rnd() * 3) | 0)
      { const g = ico(rx * 0.62, 2); g.scale(1.25, 0.55, 1.25); g.translate(cx, yc + ry * 0.12, cz); parts.push(g); clumps.push([cx, yc + ry * 0.12, cz, rx * 0.62]) }
      for (let k = 0; k < n; k++) { const a = k / n * 6.283 + rnd() * 0.6, d = rx * (0.72 + rnd() * 0.3), rr = rx * (0.36 + rnd() * 0.16)
        const g = ico(rr, 2); g.scale(1, 0.62, 1); const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d, py = yc - ry * 0.05 + rnd() * ry * 0.2
        g.translate(px, py, pz); parts.push(g); clumps.push([px, py, pz, rr]) }
    } else { // 丸い広葉樹: 小さな房を多く寄せ、頂点を揺らして輪郭を凸凹に
      { const g = ico(Math.min(rx, ry) * 0.72, 2); g.scale(rx / Math.min(rx, ry), ry / Math.min(rx, ry), rx / Math.min(rx, ry)); g.translate(cx, cy, cz); parts.push(g); clumps.push([cx, cy, cz, Math.min(rx, ry) * 0.72]) }
      const n = 7 + ((rnd() * 5) | 0)
      for (let k = 0; k < n; k++) { const a = rnd() * 6.283, e = -0.35 + rnd() * 1.25, rr = Math.min(rx, ry) * (0.34 + rnd() * 0.2)
        const px = cx + Math.cos(a) * Math.cos(e) * rx * 0.72, py = cy + Math.sin(e) * ry * 0.72, pz = cz + Math.sin(a) * Math.cos(e) * rx * 0.72
        const g = ico(rr, 2); g.translate(px, py, pz); parts.push(g); clumps.push([px, py, pz, rr]) }
    }
    // 頂点を揺らす（輪郭の凸凹）・樹冠の面の UV を葉の模様（アトラスの左半分）へ
    for (const g of parts) {
      const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv
      if (sp !== 'sugi') for (let i = 0; i < p.count; i++) { const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i), k = (n3(X * 1.6 + 7, Y * 1.6, Z * 1.6) - 0.5) * 0.55 * Math.min(rx, ry) * 0.35
        p.setXYZ(i, X + nn.getX(i) * k, Y + nn.getY(i) * k, Z + nn.getZ(i) * k) }
      if (uv) for (let i = 0; i < uv.count; i++) { const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i); uv.setXY(i, 0.01 + ((X + Z) * 0.35 % 1 + 1) % 1 * 0.47, ((Y * 0.35) % 1 + 1) % 1) }
    }
    // 縁の葉の板（2 だけ）: 房の表面に、外を向く小さな板を挿す。UV はアトラスの右半分（葉の外は透明）
    if (withCards) {
      for (const [px, py, pz, rr] of clumps) {
        const nC = Math.max(4, Math.round(rr * rr * (sp === 'sugi' ? 3 : 6)))
        for (let k = 0; k < nC; k++) {
          const a = rnd() * 6.283, e = (sp === 'sugi' ? -0.3 : -0.2) + rnd() * 1.4
          const d = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e))
          const s = rr * (0.85 + rnd() * 0.4)
          const q = new THREE.PlaneGeometry(s, s)
          const m4 = new THREE.Matrix4().lookAt(new THREE.Vector3(), d, Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0))
          q.rotateZ(rnd() * 6.283); q.applyMatrix4(m4)
          q.translate(px + d.x * rr * 1.0, py + d.y * rr * 1.0 * (sp === 'kasa' ? 0.62 : 1), pz + d.z * rr * 1.0)
          const uv = q.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 0.5, uv.getY(i))
          parts.push(q)
        }
      }
    }
    for (const g of parts) { if (g.index) { const ng = g.toNonIndexed(); g.copy(ng) } }
    const merged = window.__shGet().THREE && parts.length ? mergeAll(THREE, parts) : null
    return { geo: merged, cx, cy, cz, rx, ry }
  }
  const mergeAll = (THREE, list) => { // BufferGeometryUtils を持たないので素朴に結ぶ（位置・法線・UV）
    let n = 0; for (const g of list) n += g.attributes.position.count
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0
    for (const g of list) { const c = g.attributes.position.count; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2); o += c; g.dispose() }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2))
    return out
  }
  const bakeTreeColors = (geo, info, tint, sp) => {
    const p = geo.attributes.position, c = new Float32Array(p.count * 3)
    let minY = Infinity, maxY = -Infinity; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y }
    const span = Math.max(0.001, maxY - minY), rr = Math.max(info.rx, info.ry)
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i)
      const up = 0.8 + (Y - minY) / span * 0.42                                        // 今と同じ上下の陰陽
      const out = Math.min(1, Math.hypot((X - info.cx) / info.rx, (Y - info.cy) / Math.max(0.3, info.ry), (Z - info.cz) / info.rx)) // 樹冠の中ほど暗い（房の奥の陰）
      const ao = sp === 'sugi' ? 1 : 0.7 + 0.32 * out
      const nz = 0.86 + 0.28 * n3(X * 0.9 + 3, Y * 0.9, Z * 0.9)                       // 葉の塊の濃淡
      const v = up * ao * nz
      c[i * 3] = v * tint[0]; c[i * 3 + 1] = v * tint[1]; c[i * 3 + 2] = v * tint[2]
    }
    geo.setAttribute('color', new (window.__shGet().THREE).BufferAttribute(c, 3))
  }
  S.trees = (mode) => {
    const g = window.__shGet(); const { THREE } = g; const R = window.__b5R
    if (!R || !R.trees) return 0
    if (mode === 2 && !leafAtlas) leafAtlas = makeLeafAtlas(THREE)
    const mats = R.leafMats || []
    // 緑の材（樹種を杉檜にする時に使う＝桜の色の材を杉に当てない）
    const greenest = mats.slice().sort((a, b) => (b.color.g - b.color.r) - (a.color.g - a.color.r))[0]
    const cardMat = new Map()
    const cardOf = (m) => { if (!cardMat.has(m)) { const cm = new THREE.MeshToonMaterial({ color: m.color.clone().multiplyScalar(1.12), map: leafAtlas, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, gradientMap: m.gradientMap }); cardMat.set(m, cm) } return cardMat.get(m) }
    let n = 0
    for (const tg of R.trees) {
      const lm = tg.children.find((c) => c.isMesh); if (!lm) continue
      if (!lm.userData.b5o) lm.userData.b5o = { geo: lm.geometry, mat: lm.material }
      const o = lm.userData.b5o
      if (mode === 0) { if (lm.geometry !== o.geo) lm.geometry.dispose(); lm.geometry = o.geo; lm.material = o.mat; continue }
      o.geo.computeBoundingBox(); const bb = o.geo.boundingBox
      const x = tg.position.x, z = tg.position.z, h = hash(x, z)
      const pink = o.mat.color.r > o.mat.color.g * 1.08
      const sp = pink ? 'kasa' : h < 0.24 ? 'sugi' : h < 0.5 ? 'kasa' : 'maru'
      const rnd = mkRand(hash(x, z, 1))
      const info = crownGeo(THREE, sp, bb, rnd, mode === 2)
      const b = 0.82 + hash(x, z, 2) * 0.36, hy = hash(x, z, 3) - 0.5                 // 木ごとの明るさと色の振れ（黄み〜青み）
      const tint = sp === 'sugi' ? [0.74 * b, 0.86 * b, 0.84 * b] : [b * (1 + hy * 0.3), b * (1 + hy * 0.08), b * (1 - hy * 0.26)]
      bakeTreeColors(info.geo, info, tint, sp)
      if (lm.geometry !== o.geo) lm.geometry.dispose()
      lm.geometry = info.geo
      const baseM = sp === 'sugi' && greenest ? greenest : o.mat
      lm.material = mode === 2 ? cardOf(baseM) : baseM
      n++
    }
    return n
  }

  // ── 観葉植物（#1 に含める）: 20面の玉4つ → 弧を描いて広がる細長い葉の株 ──
  S.plant = (mode) => {
    const g = window.__shGet(); const { THREE, scene } = g
    if (!S.plantOld) {
      const olds = []
      scene.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.type === 'IcosahedronGeometry' && o.geometry.parameters.detail === 0 && o.renderOrder === 2 && [0.24, 0.18, 0.19, 0.16].some((r) => Math.abs(o.geometry.parameters.radius - r) < 1e-6)) olds.push(o) })
      S.plantOld = olds
    }
    const olds = S.plantOld; if (olds.length < 4) return 0
    if (S.plantNew) { S.plantNew.parent && S.plantNew.parent.remove(S.plantNew); S.plantNew.geometry.dispose(); S.plantNew = null }
    for (const o of olds) o.visible = mode === 0
    if (mode === 0) return olds.length
    const o0 = olds[0], base = new THREE.Vector3(o0.position.x, o0.position.y - 0.42, o0.position.z)
    const cAttr = o0.geometry.attributes.color
    let cr = 0, cg = 0, cb = 0; for (let i = 0; i < cAttr.count; i++) { cr += cAttr.getX(i); cg += cAttr.getY(i); cb += cAttr.getZ(i) } cr /= cAttr.count; cg /= cAttr.count; cb /= cAttr.count
    const rnd = mkRand(0.61), P = [], C = [], I = []
    const nL = 17
    for (let k = 0; k < nL; k++) {
      const a = k / nL * 6.283 * 1.618 + rnd() * 0.4, el = 0.55 + rnd() * 0.75, L = 0.3 + rnd() * 0.28, W = 0.05 + rnd() * 0.035, droop = 0.25 + rnd() * 0.3
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
      const shade = 0.75 + rnd() * 0.45, segs = 7, b0 = P.length / 3
      const sx = base.x + dir.x * 0.03, sz = base.z + dir.z * 0.03, sy = base.y + 0.02 + rnd() * 0.05
      for (let s = 0; s <= segs; s++) {
        const t = s / segs, w = W * Math.pow(Math.sin(Math.PI * Math.min(0.98, t * 0.92 + 0.06)), 0.7)
        const hx = Math.cos(el) * L * t, hy = Math.sin(el) * L * t - droop * L * t * t
        const cx = sx + dir.x * hx, cy = sy + hy, cz = sz + dir.z * hx
        const v = shade * (0.82 + 0.3 * t)
        P.push(cx - side.x * w, cy - w * 0.25, cz - side.z * w, cx, cy + w * 0.12, cz, cx + side.x * w, cy - w * 0.25, cz + side.z * w) // 中央の葉脈で少し折れる
        for (let j = 0; j < 3; j++) C.push(cr * v * (j === 1 ? 1.08 : 1), cg * v * (j === 1 ? 1.12 : 1), cb * v)
      }
      for (let s = 0; s < segs; s++) { const r0 = b0 + s * 3, r1 = b0 + (s + 1) * 3; I.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1, r0 + 1, r1 + 1, r0 + 2, r0 + 2, r1 + 1, r1 + 2) }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.setIndex(I); geo.computeVertexNormals()
    const mat = o0.material.clone(); mat.side = THREE.DoubleSide
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 2; o0.parent.add(mesh); S.plantNew = mesh
    return olds.length
  }

  // ── 面の質感（#2）: 1＝屋根（瓦・トタン・スレート）・家の壁（漆喰とモルタルのむら・雨だれ）・地面（草の濃淡と土の斑）・中央の通り（舗装の粒・補修の跡・轍）
  //    の模様を、世界の位置から材の中で描いて掛け合わせる（UV と画像に頼らない）／2＝1＋同じ模様から凹凸の陰（光の当たりで瓦の段や波板が立つ） ──
  const GLSL_COMMON = `
varying vec3 vB5W;
float b5h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float b5n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(b5h(i), b5h(i + vec2(1.0, 0.0)), u.x), mix(b5h(i + vec2(0.0, 1.0)), b5h(i + vec2(1.0, 1.0)), u.x), u.y); }
float b5fade(float c) { return 1.0 - smoothstep(0.35, 0.9, fwidth(c)); } // 遠くて細かすぎる模様はちらつくので消す
vec3 b5pat(vec3 w, vec3 N) {
  vec3 m = vec3(1.0);
  float hz = length(N.xz);
  vec3 e = hz > 0.05 ? normalize(vec3(N.z, 0.0, -N.x)) : vec3(1.0, 0.0, 0.0);
  float sl = w.y / max(hz, 0.25);                   // 斜面に沿った距離（屋根の段は等高線に沿う）
  float al = dot(w, e);                             // 軒に沿った距離
#if B5KIND == 1
  float row = sl / 0.3, col = al / 0.29 + floor(row) * 0.5;
  float fr = fract(row), fc = fract(col), fa = b5fade(row);
  m *= mix(1.0, mix(0.66, 1.06, smoothstep(0.0, 0.22, fr)) * (0.9 + 0.12 * sin(fc * 6.2832)) * (0.9 + 0.2 * b5h(vec2(floor(row), floor(col)))), fa);
  m *= 0.84 + 0.3 * b5n(w.xz * 0.45);
  m *= mix(vec3(1.0), vec3(0.86, 0.96, 0.82), smoothstep(0.62, 0.85, b5n(w.xz * 0.7 + 11.0)) * 0.6); // 苔
#elif B5KIND == 2
  float cr = al / 0.1, fa = b5fade(cr);
  m *= mix(1.0, 0.86 + 0.18 * (0.5 + 0.5 * sin(cr * 6.2832)), fa);
  float seam = fract(sl / 1.8); m *= mix(1.0, mix(0.7, 1.0, smoothstep(0.0, 0.04, seam)), b5fade(sl / 1.8 * 20.0));
  float rust = smoothstep(0.55, 0.85, b5n(vec2(al * 2.2, sl * 0.18)) * 0.7 + b5n(w.xz * 0.5) * 0.4);
  m *= mix(vec3(1.0), vec3(1.18, 0.86, 0.66), rust * 0.55);
  m *= 0.88 + 0.22 * b5n(w.xz * 0.35 + 5.0);
#elif B5KIND == 3
  float row = sl / 0.24, col = al / 0.4 + floor(row) * 0.5;
  float fr = fract(row), fc = fract(col), fa = b5fade(row);
  m *= mix(1.0, smoothstep(0.0, 0.06, fr) * smoothstep(0.0, 0.03, fc) * smoothstep(1.0, 0.97, fc) * 0.3 + 0.7, fa) * (0.92 + 0.14 * b5h(vec2(floor(row), floor(col))));
  m *= 0.86 + 0.26 * b5n(w.xz * 0.4);
#elif B5KIND == 4
  if (abs(N.y) < 0.6) {
    m *= 0.9 + 0.16 * b5n(vec2(al, w.y) * 0.7);                                   // 漆喰とモルタルの大きなむら
    m *= mix(1.0, 0.94 + 0.1 * b5n(vec2(al, w.y) * 9.0), b5fade(al * 9.0));         // 細かな粒
    float st = b5n(vec2(al * 3.5, 0.0)) * smoothstep(0.35, 1.0, b5n(vec2(al * 1.3, w.y * 0.22)));
    m *= 1.0 - 0.16 * smoothstep(0.55, 0.9, st);                                   // 雨だれの縦の筋
    m *= mix(vec3(1.0), vec3(0.93, 0.95, 0.9), smoothstep(0.6, 0.9, b5n(vec2(al, w.y) * 0.3 + 3.0)));
  }
#elif B5KIND == 5
  m *= 0.84 + 0.3 * b5n(w.xz * 0.9);
  m *= mix(1.0, 0.88 + 0.24 * b5n(w.xz * 4.5), b5fade(w.x * 4.5));
  m *= mix(1.0, 0.9 + 0.2 * b5h(floor(w.xz * 14.0)), b5fade(w.x * 14.0));           // 草の葉先の細かな明暗
  float soil = smoothstep(0.6, 0.8, b5n(w.xz * 0.16 + 7.0) * 0.75 + b5n(w.xz * 0.9) * 0.35);
  m *= mix(vec3(1.0), vec3(1.12, 0.98, 0.78), soil * 0.6);                           // 土の斑
  m *= mix(vec3(1.0), vec3(0.95, 1.04, 0.86), smoothstep(0.5, 0.8, b5n(w.xz * 0.3 + 2.0)) * 0.5); // 若草と枯れ草の色むら
#elif B5KIND == 6
  m *= mix(1.0, 0.9 + 0.18 * b5h(floor(w.xz * 30.0)), b5fade(w.x * 30.0));         // 舗装の粒
  vec2 pc = floor(w.xz * vec2(0.35, 0.12));
  m *= b5h(pc) > 0.72 ? 0.86 : 1.0;                                                 // 補修の跡（四角いつぎはぎ）
  float ck = abs(b5n(w.xz * 0.8) - 0.5); m *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.025, ck)) * b5fade(w.x * 0.8 * 20.0); // ひび
  m *= 1.0 - 0.08 * exp(-pow(abs(w.x) - 1.7, 2.0) / 0.12);                          // 轍
  m *= 0.9 + 0.16 * b5n(w.xz * 0.25);
#endif
  return m;
}
`
  const KIND_OF = (S.kindOf = { roof: [2, 1, 1, 3, 2, 1], wall: 4, ground: 5, road: 6 }) // 屋根の色ごと: スレート青＝トタン／テラコッタ＝瓦／紺＝瓦／灰＝スレート／苔色＝トタン／茶＝瓦
  const patch = (m, kind, mode) => {
    if (!m.userData.b5o) m.userData.b5o = { obc: m.onBeforeCompile, key: m.customProgramCacheKey }
    const o = m.userData.b5o
    if (mode === 0) { m.onBeforeCompile = o.obc; m.customProgramCacheKey = o.key; m.needsUpdate = true; return }
    m.onBeforeCompile = (sh, r) => {
      if (o.obc) o.obc(sh, r)
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vB5W;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vB5W = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n#define B5KIND ${kind}\n${GLSL_COMMON}`)
        .replace('#include <map_fragment>', '#include <map_fragment>\n  vec3 b5N = normalize(cross(dFdx(vB5W), dFdy(vB5W)));\n  vec3 b5M = b5pat(vB5W, b5N);\n  diffuseColor.rgb *= b5M;')
      if (mode === 2) {
        // 同じ模様の明るさを高さと見なして法線を傾ける（three の bump と同じ作り）。遠くは弱める
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float b5H = dot(b5M, vec3(0.333));
    vec2 dH = vec2(dFdx(b5H), dFdy(b5H)) * ${kind === 5 ? '1.2' : '2.6'} * (1.0 - smoothstep(25.0, 90.0, length(vViewPosition)));
    vec3 vSigmaX = normalize(dFdx(-vViewPosition)), vSigmaY = normalize(dFdy(-vViewPosition)), vN = normal;
    vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDirection;
    vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
    normal = normalize(abs(fDet) * vN - vGrad);
  }`)
      }
    }
    m.customProgramCacheKey = () => (o.key ? o.key.call(m) : '') + '-b5-' + kind + '-' + mode
    m.needsUpdate = true
  }
  S.surf = (mode) => {
    const R = window.__b5R; if (!R) return 0
    let n = 0
    if (R.roof) R.roof.forEach((m, i) => { patch(m, KIND_OF.roof[i % KIND_OF.roof.length], mode); n++ })
    for (const m of R.wall) { patch(m, KIND_OF.wall, mode); n++ }
    if (R.ground) { patch(R.ground, KIND_OF.ground, mode); n++ }
    if (R.road) { patch(R.road, KIND_OF.road, mode); n++ }
    return n
  }
})()
