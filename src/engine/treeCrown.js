// 木の樹冠の作り（2026-10-13・便6＝便5 #1=2「樹種の形と色の振れ＋葉の模様と縁の葉の板」）。
// 樹種（丸い広葉樹・傘形・杉檜）と木ごとの色の振れを、木の位置のハッシュで決める＝町を作る乱数 R() を回さない（町の配置を変えない）。
// 樹冠は、前の樹冠（主房＋房）が入る箱を元に作る（幹の位置・当たり判定は前と同じ）。杉檜は箱より上へ細く伸び、傘形は横へ広がる（便5 の案の画どおり）。
// 葉の模様と縁の葉の板は、1枚の小さな画（左半分＝樹冠の面に貼る詰んだ葉・右半分＝縁に挿す葉の房、葉の外は透明）を材の色で染めて描く。
// three は町の3Dが後から読み込む（読み込みを分けるため）ので、ここでは取り込まずに受け取る。

// 位置から決まる 0〜1 の値（k で別の値に）
export const posHash = (x, z, k = 0) => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s) }
// 種から決まる乱数（主の R() とは別の列）
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

// 葉の画（256×128）。白〜灰で描き、材の色で染める（色の空間は付けない＝白〜灰をそのまま掛け算の値に）
export function makeLeafAtlas(THREE) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d')
  const rnd = mkRand(0.37)
  // 左の不透明の所は 110px まで。右の葉の房（138px から）との間を透明にあけ、遠くの縮小画で左右がにじみ合わないようにする（便6 の外の目）
  x.save(); x.beginPath(); x.rect(0, 0, 110, 128); x.clip()
  x.fillStyle = 'rgb(205,205,205)'; x.fillRect(0, 0, 110, 128)
  const leaf = (cx, cy, l, w, a, v) => { x.save(); x.translate(cx, cy); x.rotate(a); x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.ellipse(0, 0, l, w, 0, 0, 6.283); x.fill(); x.restore() }
  for (let i = 0; i < 520; i++) leaf(rnd() * 128, rnd() * 128, 3 + rnd() * 3.5, 1.6 + rnd() * 1.6, rnd() * 6.283, (165 + rnd() * 90) | 0)
  x.restore()
  for (let i = 0; i < 150; i++) { const cx = 192 + (rnd() - 0.5) * 100, cy = 64 + (rnd() - 0.5) * 100; if (Math.hypot(cx - 192, cy - 64) > 54) continue; leaf(cx, cy, 4 + rnd() * 4, 2 + rnd() * 2, rnd() * 6.283, (160 + rnd() * 95) | 0) }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4
  return t
}

// 樹種: 桜（桃色の材）は傘形、ほかは位置のハッシュで 杉檜 24%・傘形 26%・丸い広葉樹 50%
export const crownSpecies = (x, z, pink) => { const h = posHash(x, z); return pink ? 'kasa' : h < 0.24 ? 'sugi' : h < 0.5 ? 'kasa' : 'maru' }

// 素朴に結ぶ（位置・法線・UV）。足した部品は捨てる
function mergeAll(THREE, list) {
  let n = 0; for (const g of list) n += g.attributes.position.count
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0
  for (const g of list) { const c = g.attributes.position.count; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) U.set(g.attributes.uv.array, o * 2); o += c; g.dispose() }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2))
  return out
}

// 樹冠の面の UV（三角ごと）: 三角の向きにいちばん合う面（上下・東西・南北）から葉の画を貼り、三角の中で貼り位置が 1→0 へ飛ばないように
// 三角ごとに貼り始めをずらす（座標の剰余で貼ると、飛んだ三角に画全体が詰め込まれて Z 字の縞になった・便6）。葉の模様は散らばった葉なので、三角の境目は目立たない
const UVS = 0.35
function crownUV(p, uv) {
  const a = [0, 0, 0], b = [0, 0, 0]
  for (let t = 0; t + 2 < p.count; t += 3) {
    const ax = p.getX(t + 1) - p.getX(t), ay = p.getY(t + 1) - p.getY(t), az = p.getZ(t + 1) - p.getZ(t)
    const bx = p.getX(t + 2) - p.getX(t), by = p.getY(t + 2) - p.getY(t), bz = p.getZ(t + 2) - p.getZ(t)
    const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx)
    for (let k = 0; k < 3; k++) {
      const X = p.getX(t + k), Y = p.getY(t + k), Z = p.getZ(t + k)
      if (ny >= nx && ny >= nz) { a[k] = X; b[k] = Z } else if (nx >= nz) { a[k] = Z; b[k] = Y } else { a[k] = X; b[k] = Y }
      a[k] *= UVS; b[k] *= UVS
    }
    const amin = Math.min(...a), bmin = Math.min(...b), sa = Math.max(...a) - amin, sb = Math.max(...b) - bmin
    const s = Math.min(1, 0.95 / Math.max(sa, sb, 1e-6)) // 大きな三角は縮めて画の1枚に収める
    const oa = (amin - Math.floor(amin)) * Math.max(0, 1 - sa * s), ob = (bmin - Math.floor(bmin)) * Math.max(0, 1 - sb * s)
    for (let k = 0; k < 3; k++) uv.setXY(t + k, 0.02 + (oa + (a[k] - amin) * s) * 0.38, ob + (b[k] - bmin) * s) // 画の左の 0.02〜0.40（不透明の所の内側）
  }
}

// 樹冠を作る。bb ={ min: [x,y,z], max: [x,y,z] }（木の中の座標）。withCards で縁の葉の板を挿す。
// 返す物: { geo, cardTris（葉の板の三角の数） }
export function buildCrown(THREE, sp, bb, seed, withCards) {
  const rnd = mkRand(seed)
  const cx = (bb.min[0] + bb.max[0]) / 2, cz = (bb.min[2] + bb.max[2]) / 2, cy = (bb.min[1] + bb.max[1]) / 2
  const rx = (bb.max[0] - bb.min[0]) / 2, ry = (bb.max[1] - bb.min[1]) / 2, rm = Math.min(rx, ry)
  const parts = [], clumps = []
  const ico = (r) => new THREE.IcosahedronGeometry(r, 2)
  if (sp === 'sugi') { // 杉・檜: 細い段重ねの円錐（下ほど広い）。輪郭が尖って街の緑に縦の線が入る。底は開く（歩く目線で見上げた時に平らな円板が見えないように）
    const n = 4, y0 = bb.min[1] - ry * 0.15, top = bb.max[1] + ry * 0.55, R0 = rx * 0.72
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1.25) / n, yb = y0 + (top - y0) * t0, yt = y0 + (top - y0) * Math.min(1, t1), rr = R0 * (1 - t0 * 0.78)
      const g = new THREE.ConeGeometry(rr, yt - yb, 10, 3, true); g.translate(cx, (yb + yt) / 2, cz); parts.push(g); clumps.push([cx, yb + (yt - yb) * 0.35, cz, rr * 0.8])
    }
  } else if (sp === 'kasa') { // 傘形（欅・桜のような広がる樹冠）: 平たく広い房を輪に。幹が下に長く見える
    const yc = cy + ry * 0.3, n = 6 + ((rnd() * 3) | 0)
    { const g = ico(rx * 0.62); g.scale(1.25, 0.55, 1.25); g.translate(cx, yc + ry * 0.12, cz); parts.push(g); clumps.push([cx, yc + ry * 0.12, cz, rx * 0.62]) }
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.283 + rnd() * 0.6, d = rx * (0.72 + rnd() * 0.3), rr = rx * (0.36 + rnd() * 0.16)
      const g = ico(rr); g.scale(1, 0.62, 1); const px = cx + Math.cos(a) * d, pz = cz + Math.sin(a) * d, py = yc - ry * 0.05 + rnd() * ry * 0.2
      g.translate(px, py, pz); parts.push(g); clumps.push([px, py, pz, rr])
    }
  } else { // 丸い広葉樹: 小さな房を多く寄せ、頂点を揺らして輪郭を凸凹に
    { const g = ico(rm * 0.72); g.scale(rx / rm, ry / rm, rx / rm); g.translate(cx, cy, cz); parts.push(g); clumps.push([cx, cy, cz, rm * 0.72]) }
    const n = 7 + ((rnd() * 5) | 0)
    for (let k = 0; k < n; k++) {
      const a = rnd() * 6.283, e = -0.35 + rnd() * 1.25, rr = rm * (0.34 + rnd() * 0.2)
      const px = cx + Math.cos(a) * Math.cos(e) * rx * 0.72, py = cy + Math.sin(e) * ry * 0.72, pz = cz + Math.sin(a) * Math.cos(e) * rx * 0.72
      const g = ico(rr); g.translate(px, py, pz); parts.push(g); clumps.push([px, py, pz, rr])
    }
  }
  // 頂点を揺らす（輪郭の凸凹）・樹冠の面の UV を葉の模様（画の左半分）へ
  for (const g of parts) {
    if (g.index) { const ng = g.toNonIndexed(); g.copy(ng); ng.dispose() }
    const p = g.attributes.position, nn = g.attributes.normal, uv = g.attributes.uv
    if (sp !== 'sugi') for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i), k = (n3(X * 1.6 + 7, Y * 1.6, Z * 1.6) - 0.5) * 0.55 * rm * 0.35
      p.setXYZ(i, X + nn.getX(i) * k, Y + nn.getY(i) * k, Z + nn.getZ(i) * k)
    }
    if (uv) crownUV(p, uv)
  }
  // 縁の葉の板: 房の表面に、外を向く小さな板を挿す。UV は画の右半分（葉の外は透明）
  let cardTris = 0
  if (withCards) {
    const o = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0), d = new THREE.Vector3(), m4 = new THREE.Matrix4()
    for (const [px, py, pz, rr] of clumps) {
      const nC = Math.max(4, Math.round(rr * rr * (sp === 'sugi' ? 3 : 6)))
      for (let k = 0; k < nC; k++) {
        const a = rnd() * 6.283, e = sp === 'sugi' ? -0.35 + rnd() * 0.6 : -0.2 + rnd() * 1.4 // 杉檜は段の裾まわりだけ（上の細った所で円錐から離れて空に浮かないように・便6 の外の目）
        d.set(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e))
        const s = rr * (0.85 + rnd() * 0.4)
        const q = new THREE.PlaneGeometry(s, s)
        m4.lookAt(o, d, Math.abs(d.y) > 0.95 ? side : up)
        q.rotateZ(rnd() * 6.283); q.applyMatrix4(m4)
        const off = sp === 'sugi' ? rr * 0.95 : rr
        q.translate(px + d.x * off, py + d.y * rr * (sp === 'kasa' ? 0.62 : 1), pz + d.z * off)
        const uv = q.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 0.5, uv.getY(i))
        parts.push(q); cardTris += 2
      }
    }
  }
  for (const g of parts) { if (g.index) { const ng = g.toNonIndexed(); g.copy(ng); ng.dispose() } }
  return { geo: mergeAll(THREE, parts), cardTris, cx, cy, cz, rx, ry }
}

// 木ごとの色の振れ（明るさ ±18%・黄み〜青み）。杉檜は濃い青緑
export function crownTint(x, z, sp) {
  const b = 0.82 + posHash(x, z, 2) * 0.36, hy = posHash(x, z, 3) - 0.5
  return sp === 'sugi' ? [0.74 * b, 0.86 * b, 0.84 * b] : [b * (1 + hy * 0.3), b * (1 + hy * 0.08), b * (1 - hy * 0.26)]
}

// 樹冠の頂点色: 上下の陰陽（前と同じ 0.8→1.22）× 樹冠の中ほどの陰 × 葉の塊の濃淡 × 木ごとの色
export function bakeCrownColors(THREE, crown, tint, sp) {
  const geo = crown.geo, p = geo.attributes.position, c = new Float32Array(p.count * 3)
  let minY = Infinity, maxY = -Infinity; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y }
  const span = Math.max(0.001, maxY - minY)
  for (let i = 0; i < p.count; i++) {
    const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i)
    const up = 0.8 + (Y - minY) / span * 0.42
    const out = Math.min(1, Math.hypot((X - crown.cx) / crown.rx, (Y - crown.cy) / Math.max(0.3, crown.ry), (Z - crown.cz) / crown.rx))
    const ao = sp === 'sugi' ? 1 : 0.7 + 0.32 * out
    const nz = 0.86 + 0.28 * n3(X * 0.9 + 3, Y * 0.9, Z * 0.9)
    const v = up * ao * nz
    c[i * 3] = v * tint[0]; c[i * 3 + 1] = v * tint[1]; c[i * 3 + 2] = v * tint[2]
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3))
}
