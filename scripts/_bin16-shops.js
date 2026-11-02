// 便16 設計案の試作: 平成の町の活気（駅前の大型スーパー・家電量販店のアドバルーンと垂れ幕・パチンコ店・商店街の個人商店・駄菓子屋・コンビニ風の店・道の車）。
// 実在の店の名前・看板・意匠は使わない（店の名はすべて架空・一般の言葉）。看板の字も計算で描く（画像を使わない）。
export function planShops(ctx) {
  const { THREE, BGU, scene, groundH, R, stX, stZ, TIME, W, isTown } = ctx
  const night = TIME.lit > 0.3
  const rects = []
  const want = [
    { k: 'super', x: stX + 40, z: stZ + 150, w: 112, d: 72 },
    { k: 'denki', x: stX + 175, z: stZ - 30, w: 72, d: 46 },
    { k: 'pachi', x: stX + 30, z: stZ - 135, w: 46, d: 32, name: 'パーラー ミナト' },
    { k: 'pachi', x: stX + 260, z: stZ + 120, w: 40, d: 30, name: 'パーラー ギンガ' },
    { k: 'gai', x: stX - 40, z: stZ + 20, w: 22, d: 230 }, // 商店街（z の向きに伸びる）
    { k: 'conv', x: stX + 110, z: stZ + 40, w: 18, d: 14 },
    { k: 'conv', x: stX + 330, z: stZ - 120, w: 18, d: 14 },
  ]
  for (const r of want) if (isTown(r.x, r.z) && isTown(r.x - r.w / 2, r.z - r.d / 2) && isTown(r.x + r.w / 2, r.z + r.d / 2)) rects.push(r)
  const inRect = (x, z, m = 3) => rects.some((r) => Math.abs(x - r.x) < r.w / 2 + m && Math.abs(z - r.z) < r.d / 2 + m)

  // ── 看板の字（キャンバスに描く） ──
  const font = '"Yu Gothic","Hiragino Sans","Meiryo",sans-serif'
  function signTex(text, { w = 512, h = 128, bg = '#c82a2a', fg = '#fff', vertical = false, sub = null, edge = null, weight = 800 } = {}) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d')
    x.fillStyle = bg; x.fillRect(0, 0, w, h)
    if (edge) { x.strokeStyle = edge; x.lineWidth = Math.max(4, h * 0.05); x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth) }
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'
    if (vertical) {
      const ch = [...text], fs = Math.min(w * 0.78, (h * 0.92) / ch.length)
      x.font = `${weight} ${fs}px ${font}`; ch.forEach((c, i) => x.fillText(c, w / 2, h * 0.04 + fs * (i + 0.5)))
    } else {
      let fs = h * (sub ? 0.5 : 0.66); x.font = `${weight} ${fs}px ${font}`
      while (x.measureText(text).width > w * 0.92 && fs > 8) { fs -= 2; x.font = `${weight} ${fs}px ${font}` }
      x.fillText(text, w / 2, sub ? h * 0.38 : h * 0.53)
      if (sub) { x.font = `600 ${h * 0.22}px ${font}`; x.fillText(sub, w / 2, h * 0.8) }
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t
  }
  const signMat = (tex, glow = 0.9) => { const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }); if (night || TIME.lit > 0.15) { m.emissiveMap = tex; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = night ? glow : glow * 0.35 } return m }
  const box = (w, h, d, mat, x, y, z, parent = scene, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m }
  const plane = (w, h, mat, x, y, z, ry = 0, parent = scene) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m }
  const std = (c, r = 0.85, mt = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt })
  const cars = [], swing = []

  // 車（1台＝車体＋屋根の2つの箱。色は白・銀・黒・赤・紺など）
  const CAR = [0xf2f2f0, 0xbfc3c6, 0x26282c, 0xa8282a, 0x24345a, 0xd8d0c0, 0x5a6a5a, 0xe8e0a0]
  const addCar = (x, y, z, rot) => cars.push({ x, y, z, rot, c: CAR[Math.floor(R() * CAR.length)] })

  for (const r of rects) {
    const y0 = groundH(r.x, r.z) - 0.2
    if (r.k === 'super') { // 大型スーパー: 3階＋屋上駐車場・斜路・屋上の大看板・塔の看板・正面の帯の看板
      const H = 13.5, g = new THREE.Group(); g.position.set(r.x, y0, r.z); scene.add(g)
      box(r.w, H, r.d, std(0xe6e0d2, 0.9), 0, H / 2, 0, g)
      box(r.w + 0.4, 1.4, 0.6, std(0xd23a2a, 0.6), 0, H - 3.2, r.d / 2 + 0.3, g) // 正面の赤い帯
      const nameT = signTex('ショッピングプラザ カワベ', { w: 1024, h: 128, bg: '#ffffff', fg: '#c8202a' })
      plane(46, 5.6, signMat(nameT), 0, H - 6.6, r.d / 2 + 0.06, 0, g)
      for (let k = -2; k <= 2; k++) plane(14, 3.6, signMat(signTex(['食品', '衣料', '暮らしの品', '専門店街', '銀行・ATM'][k + 2], { w: 384, h: 96, bg: '#2a5a9a' })), k * 20, 3.4, r.d / 2 + 0.06, 0, g) // 入口の上の売り場の札
      box(r.w * 0.7, 4.6, 0.4, std(0x2a2a2e, 0.3, 0.2), 0, 2.3, r.d / 2 + 0.2, g) // 入口のガラス
      // 屋上: 床・白線・手すり壁・車
      const lines = document.createElement('canvas'); lines.width = 256; lines.height = 256; const lx = lines.getContext('2d'); lx.fillStyle = '#6e6e6c'; lx.fillRect(0, 0, 256, 256); lx.strokeStyle = '#e8e8e2'; lx.lineWidth = 3
      for (let i = 0; i <= 8; i++) { lx.beginPath(); lx.moveTo(i * 32, 0); lx.lineTo(i * 32, 96); lx.moveTo(i * 32, 160); lx.lineTo(i * 32, 256); lx.stroke() }
      const lt = new THREE.CanvasTexture(lines); lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.repeat.set(r.w / 21, r.d / 21); lt.colorSpace = THREE.SRGBColorSpace
      const deck = plane(r.w - 1, r.d - 1, new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 }), 0, H + 0.05, 0, 0, g); deck.rotation.x = -Math.PI / 2; deck.receiveShadow = true
      for (const s of [-1, 1]) { box(r.w, 1.1, 0.3, std(0xd8d4c8), 0, H + 0.55, s * r.d / 2, g); box(0.3, 1.1, r.d, std(0xd8d4c8), s * r.w / 2, H + 0.55, 0, g) }
      for (let i = 0; i < 70; i++) { if (R() < 0.3) continue; const row = i % 4, col = Math.floor(i / 4); const cx = -r.w / 2 + 5 + col * 6.1, cz = [-r.d / 2 + 6, -r.d / 2 + 18, r.d / 2 - 18, r.d / 2 - 6][row]; if (cx > r.w / 2 - 4) continue; addCar(r.x + cx, y0 + H + 0.05, r.z + cz, Math.PI / 2) }
      const ramp = box(8, 0.6, Math.hypot(r.d * 0.9, H), std(0xb8b4aa), r.w / 2 + 5, H / 2, 0, g); ramp.rotation.x = Math.atan2(H, r.d * 0.9) // 斜路
      box(0.3, 1.2, Math.hypot(r.d * 0.9, H), std(0xd8d4c8), r.w / 2 + 9, H / 2 + 0.8, 0, g).rotation.x = ramp.rotation.x
      // 屋上の大看板（鉄の枠に載る）
      const bb = new THREE.Group(); bb.position.set(-r.w * 0.18, H, -r.d / 2 + 4); g.add(bb)
      for (const s of [-1, 1]) for (const t of [-1, 1]) box(0.3, 7, 0.3, std(0x6a6a6a, 0.5, 0.6), s * 14, 3.5, t * 1.2, bb)
      plane(32, 7.5, signMat(signTex('毎日がお買い得', { w: 1024, h: 240, bg: '#f4d020', fg: '#c8202a', sub: 'ショッピングプラザ カワベ' })), 0, 9.5, -1.3, Math.PI, bb)
      plane(32, 7.5, signMat(signTex('毎日がお買い得', { w: 1024, h: 240, bg: '#f4d020', fg: '#c8202a', sub: 'ショッピングプラザ カワベ' })), 0, 9.5, 1.3, 0, bb)
      // 塔の看板（駐車場の入口）
      const tw = new THREE.Group(); tw.position.set(r.x + r.w / 2 + 12, y0, r.z + r.d / 2 + 4); scene.add(tw)
      box(0.8, 16, 0.8, std(0x8a8a8a, 0.5, 0.5), 0, 8, 0, tw)
      box(5.4, 9, 1.2, std(0xffffff), 0, 19, 0, tw)
      for (const s of [-1, 1]) plane(5.2, 8.8, signMat(signTex('P', { w: 128, h: 220, bg: '#1e4a9a', vertical: true })), 0, 19, s * 0.62, s > 0 ? 0 : Math.PI, tw)
      // 地上の平面駐車場の車
      for (let i = 0; i < 26; i++) addCar(r.x - r.w / 2 + 4 + (i % 13) * 6, y0 + 0.05, r.z + r.d / 2 + 10 + Math.floor(i / 13) * 7, Math.PI / 2)
    }
    if (r.k === 'denki') { // 家電量販店: 箱の店＋大きな帯看板＋屋上のアドバルーン（垂れ幕つき）＋のぼり
      const H = 11, g = new THREE.Group(); g.position.set(r.x, y0, r.z); scene.add(g)
      box(r.w, H, r.d, std(0xf0ece0, 0.85), 0, H / 2, 0, g)
      box(r.w + 0.4, 4.2, 0.6, std(0xe8c020, 0.6), 0, H - 2.2, r.d / 2 + 0.3, g)
      plane(r.w * 0.9, 3.8, signMat(signTex('デンキのオオゾラ', { w: 1024, h: 128, bg: '#e01a20', fg: '#ffffff', edge: '#ffd200' }), 1.1), 0, H - 2.2, r.d / 2 + 0.62, 0, g)
      plane(r.w * 0.6, 2.6, signMat(signTex('テレビ・パソコン・ケータイ・白物家電', { w: 1024, h: 96, bg: '#1a3a8a' })), 0, 5.4, r.d / 2 + 0.06, 0, g)
      box(r.w * 0.8, 3.6, 0.3, std(0x2a2c30, 0.25, 0.3), 0, 1.8, r.d / 2 + 0.16, g)
      const tags = ['祝 新装開店', '大決算セール', 'ポイント10倍']
      for (let k = 0; k < 3; k++) { // アドバルーン（球）＋綱＋垂れ幕
        const bx = -r.w * 0.3 + k * r.w * 0.3, top = H + 26 + k * 3, bg = new THREE.Group(); bg.position.set(r.x + bx, y0 + top, r.z - r.d * 0.15); scene.add(bg)
        const ball = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshStandardMaterial({ color: [0xd8282a, 0xf0f0ea, 0xe8b020][k], roughness: 0.35 })); ball.castShadow = true; bg.add(ball)
        const ban = plane(1.9, 14, new THREE.MeshStandardMaterial({ map: signTex(tags[k], { w: 96, h: 700, bg: '#ffffff', fg: '#c81a1a', vertical: true, edge: '#c81a1a' }), side: THREE.DoubleSide, roughness: 0.8 }), 0, -10.2, 0, 0, bg)
        ban.castShadow = true
        const rope = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -2.6, 0), new THREE.Vector3(-bx * 0.15, -top + H, r.d * 0.15)])
        bg.add(new THREE.Line(rope, new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.6 })))
        swing.push({ o: bg, ph: k * 1.7, base: bg.position.clone() })
      }
      for (let k = 0; k < 10; k++) { // のぼり（店先に並ぶ縦長の旗）
        const px = r.x - r.w / 2 + 4 + k * (r.w - 8) / 9, pz = r.z + r.d / 2 + 2.2
        box(0.06, 3.6, 0.06, std(0x888888, 0.5, 0.5), px, y0 + 1.8, pz)
        const fl = plane(0.6, 2.4, new THREE.MeshStandardMaterial({ map: signTex(['特価', '新生活', '大安売', '開店', '下取り'][k % 5], { w: 64, h: 256, bg: ['#d81e1e', '#1e5ad8', '#f0c020'][k % 3], vertical: true }), side: THREE.DoubleSide }), px + 0.32, y0 + 2.4, pz)
        swing.push({ o: fl, ph: k, flag: true })
      }
      for (let i = 0; i < 30; i++) addCar(r.x - r.w / 2 + 3 + (i % 12) * 5.8, y0 + 0.05, r.z + r.d / 2 + 9 + Math.floor(i / 12) * 7, Math.PI / 2)
    }
    if (r.k === 'pachi') { // パチンコ店: 派手な正面・高い塔の看板・夜は光の帯
      const H = 9, g = new THREE.Group(); g.position.set(r.x, y0, r.z); scene.add(g)
      box(r.w, H, r.d, std(0xe8e0f0, 0.7), 0, H / 2, 0, g)
      const glow = new THREE.MeshStandardMaterial({ color: 0xff3aa0, emissive: 0xff2a90, emissiveIntensity: night ? 1.6 : 0.3, roughness: 0.4 })
      box(r.w + 0.6, 0.5, 0.5, glow, 0, H + 0.25, r.d / 2 + 0.25, g); box(r.w + 0.6, 0.5, 0.5, new THREE.MeshStandardMaterial({ color: 0x3ad0ff, emissive: 0x20b0ff, emissiveIntensity: night ? 1.6 : 0.3 }), 0, H - 1.0, r.d / 2 + 0.25, g)
      plane(r.w * 0.85, 3.6, signMat(signTex(r.name, { w: 1024, h: 128, bg: '#1a0a40', fg: '#ffe040', edge: '#ff40a0' }), 1.4), 0, H - 3.4, r.d / 2 + 0.06, 0, g)
      plane(r.w * 0.5, 2, signMat(signTex('新台入替', { w: 512, h: 96, bg: '#ff2020', fg: '#ffff60' }), 1.2), 0, 2.9, r.d / 2 + 0.06, 0, g)
      const tw = new THREE.Group(); tw.position.set(r.x + r.w / 2 + 4, y0, r.z + r.d / 2 + 2); scene.add(tw)
      box(0.9, 22, 0.9, std(0x9a9a9a, 0.4, 0.6), 0, 11, 0, tw)
      for (const s of [-1, 1]) plane(4.4, 12, signMat(signTex(r.name.replace('パーラー ', ''), { w: 128, h: 360, bg: '#ff2a8a', fg: '#ffffff', vertical: true, edge: '#ffe040' }), 1.5), 0, 22, s * 0.7, s > 0 ? 0 : Math.PI, tw)
      box(4.6, 12.2, 1.3, std(0xffffff), 0, 22, 0, tw)
      for (let i = 0; i < 24; i++) addCar(r.x - r.w / 2 + 3 + (i % 8) * 5.6, y0 + 0.05, r.z - r.d / 2 - 8 - Math.floor(i / 8) * 6.5, Math.PI / 2)
    }
    if (r.k === 'conv') { // コンビニ風（架空の名）: 平屋＋屋根の帯の看板＋明るい店内
      const H = 4.6, g = new THREE.Group(); g.position.set(r.x, y0, r.z); scene.add(g)
      box(r.w, H, r.d, std(0xf4f4f0), 0, H / 2, 0, g)
      box(r.w + 0.3, 1.2, r.d + 0.3, std(0x2a8a4a, 0.5), 0, H - 0.4, 0, g)
      plane(r.w * 0.7, 1.0, signMat(signTex('24h まちかどマート', { w: 512, h: 64, bg: '#ffffff', fg: '#2a8a4a' }), 1.2), 0, H - 0.4, r.d / 2 + 0.17, 0, g)
      box(r.w * 0.8, 2.8, 0.2, new THREE.MeshStandardMaterial({ color: 0xfff8e8, emissive: 0xfff4d8, emissiveIntensity: TIME.lit > 0.1 ? 1.2 : 0.25 }), 0, 1.5, r.d / 2 + 0.05, g)
      for (let i = 0; i < 5; i++) addCar(r.x - 8 + i * 4, y0 + 0.05, r.z + r.d / 2 + 6, 0)
    }
    if (r.k === 'gai') { // 商店街: 入口のアーチ＋両側に個人商店（テントの軒と袖看板）。z の向きに並ぶ
      const SHOP = [['八百屋', '#2a7a3a'], ['鮮魚', '#1a4a8a'], ['精肉', '#a8282a'], ['米穀店', '#8a6a2a'], ['酒店', '#5a2a1a'], ['たばこ', '#c84a1a'], ['本屋', '#2a4a6a'], ['クリーニング', '#2a8aa8'], ['理容', '#c82a2a'], ['くすり', '#1a8a4a'], ['時計・メガネ', '#4a4a7a'], ['和菓子', '#7a3a5a'], ['ふとん', '#6a5a2a'], ['電器店', '#d84a1a'], ['写真', '#3a6a8a'], ['喫茶 ルナ', '#4a2a1a'], ['ラーメン', '#c81a1a'], ['定食', '#3a3a3a'], ['だがし', '#e86a1a'], ['おもちゃ', '#d8a020'], ['文具', '#2a6aa8'], ['化粧品', '#c84a8a'], ['金物', '#5a5a5a'], ['花', '#3a8a3a']]
      const ax = r.x, z0 = r.z - r.d / 2
      const gate = new THREE.Group(); gate.position.set(ax, groundH(ax, z0), z0); scene.add(gate)
      for (const s of [-1, 1]) box(0.6, 7, 0.6, std(0xb8b8b8, 0.4, 0.7), s * 6, 3.5, 0, gate)
      plane(12.6, 1.8, signMat(signTex('かわべ銀座商店街', { w: 768, h: 110, bg: '#1a3a8a', fg: '#ffffff', edge: '#e8c020' }), 1.1), 0, 7.2, 0.35, 0, gate)
      plane(12.6, 1.8, signMat(signTex('かわべ銀座商店街', { w: 768, h: 110, bg: '#1a3a8a', fg: '#ffffff', edge: '#e8c020' }), 1.1), 0, 7.2, -0.35, Math.PI, gate)
      let k = 0
      for (const s of [-1, 1]) {
        let z = z0 + 2
        while (z < r.z + r.d / 2 - 6) {
          const sw = 5 + R() * 3.5, sd = 9 + R() * 2, fl = R() < 0.6 ? 2 : 3, H = fl * 3.0, [nm, col] = SHOP[k++ % SHOP.length]
          const sx = ax + s * (4 + sd / 2), sy = groundH(sx, z + sw / 2) - 0.2
          const g = new THREE.Group(); g.position.set(sx, sy, z + sw / 2); g.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(g) // 正面（+z）を通りへ向ける
          box(sw - 0.3, H, sd, std([0xd8d0c0, 0xc8bca8, 0xe0dcd0, 0xb8a890, 0xd0c8b8][Math.floor(R() * 5)], 0.9), 0, H / 2, 0, g)
          box(sw - 0.5, 2.6, 0.2, new THREE.MeshStandardMaterial({ color: 0x2a2622, emissive: 0xffd8a0, emissiveIntensity: TIME.lit > 0.1 ? 0.22 : 0.03, roughness: 0.6 }), 0, 1.3, sd / 2 + 0.05, g) // 店の間口（奥の明かり）
          for (let q = 0; q < 3; q++) { const tw = (sw - 1.2) / 3; box(tw - 0.2, 0.8, 1.0, std(0x6a5a48, 0.9), -sw / 2 + 0.6 + tw * (q + 0.5), 0.4, sd / 2 + 0.7, g); for (let p = 0; p < 5; p++) box(tw * 0.17, 0.22 + R() * 0.25, 0.32, std([0xd84a2a, 0x3a8a3a, 0xe8c040, 0xf0f0e8, 0x8a3a8a, 0x2a6ab8][Math.floor(R() * 6)], 0.8), -sw / 2 + 0.6 + tw * q + 0.15 + p * tw * 0.19, 0.9, sd / 2 + 0.5 + R() * 0.4, g) } // 店先の台と品物
          const awn = box(sw - 0.4, 0.12, 1.6, std(new THREE.Color(col).getHex(), 0.8), 0, 2.95, sd / 2 + 0.75, g); awn.rotation.x = 0.28 // テントの軒
          plane(sw - 0.8, 0.9, signMat(signTex(nm, { w: 384, h: 80, bg: '#f4efe4', fg: col })), 0, 3.7, sd / 2 + 0.03, 0, g) // 店の名の板
          if (R() < 0.7) { const sb = plane(0.7, 2.2, signMat(signTex(nm, { w: 64, h: 220, bg: col, vertical: true })), sw / 2 - 0.5, H - 1.6, sd / 2 + 0.5, Math.PI / 2, g); sb.material.side = THREE.DoubleSide } // 袖看板
          if (nm === '理容') { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 12), new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); for (let i = -2; i < 6; i++) { x.fillStyle = ['#d81e1e', '#ffffff', '#1e3ad8', '#ffffff'][(i + 8) % 4]; x.beginPath(); x.moveTo(0, i * 16); x.lineTo(64, i * 16 - 24); x.lineTo(64, i * 16 - 8); x.lineTo(0, i * 16 + 16); x.fill() } return new THREE.CanvasTexture(c) })() })); p.position.set(-sw / 2 + 0.4, 1.4, sd / 2 + 0.3); g.add(p); swing.push({ o: p, spin: true }) }
          if (nm === 'だがし' || R() < 0.15) box(0.9, 1.8, 0.7, std([0xd82020, 0xf0f0f0, 0x2050c0][Math.floor(R() * 3)], 0.4, 0.2), sw / 2 - 0.6, 0.9, sd / 2 + 0.6, g) // 自販機
          z += sw
        }
      }
      for (let i = 0; i < 6; i++) addCar(ax + (R() - 0.5) * 3, groundH(ax, z0) + 0.05, z0 + 10 + i * 34, 0)
    }
  }
  // 駄菓子屋（住宅地の角に点々と）
  function dagashi(x, z) {
    const y = groundH(x, z) - 0.2, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = R() < 0.5 ? 0 : Math.PI; scene.add(g)
    box(6.5, 5.6, 7, std(0xb8a888, 0.95), 0, 2.8, 0, g)
    const rf = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2, 4), std(0x5a6068, 0.7)); rf.rotation.y = Math.PI / 4; rf.scale.set(1.1, 1, 1.15); rf.position.y = 6.6; g.add(rf)
    const awn = box(6.4, 0.1, 1.5, std(0xe0782a, 0.8), 0, 2.7, 4.2, g); awn.rotation.x = 0.3
    plane(5.2, 0.9, signMat(signTex('だがし・アイス', { w: 384, h: 72, bg: '#fff6e0', fg: '#c84a1a' })), 0, 3.6, 3.52, 0, g)
    box(1.2, 0.8, 0.7, std(0xf0f0f0, 0.5), -2, 0.4, 4.1, g); box(0.9, 1.8, 0.7, std(0xd82020, 0.4, 0.2), 2.4, 0.9, 4.1, g) // アイスの冷凍箱・自販機
    box(5.6, 2.3, 0.2, new THREE.MeshStandardMaterial({ color: 0x3a3430, emissive: 0xffe0b0, emissiveIntensity: TIME.lit > 0.1 ? 0.6 : 0.06 }), 0, 1.25, 3.55, g)
  }
  // 道の車（太い道に並ぶ）＝後で roads から呼ぶ
  function streetCars(list) { for (const [x, y, z, rot] of list) addCar(x, y, z, rot) }
  function build() {
    if (!cars.length) return
    const body = new THREE.BoxGeometry(1.75, 0.75, 4.3).translate(0, 0.62, 0), cab = new THREE.BoxGeometry(1.55, 0.62, 2.2).translate(0, 1.3, -0.2)
    const bm = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.5 }), cars.length)
    const cm = new THREE.InstancedMesh(cab, new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.12, metalness: 0.6 }), cars.length)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color(), one = new THREE.Vector3(1, 1, 1)
    cars.forEach((k, i) => { q.setFromAxisAngle(up, k.rot); m.compose(new THREE.Vector3(k.x, k.y, k.z), q, one); bm.setMatrixAt(i, m); cm.setMatrixAt(i, m); bm.setColorAt(i, c.setHex(k.c)) })
    bm.castShadow = cm.castShadow = true; bm.receiveShadow = true; scene.add(bm, cm)
  }
  function update(t) {
    for (const s of swing) {
      if (s.spin) { s.o.rotation.y = t * 1.5; continue }
      if (s.flag) { s.o.rotation.y = Math.sin(t * 2.2 + s.ph) * 0.35; continue }
      s.o.position.x = s.base.x + Math.sin(t * 0.5 + s.ph) * 0.8; s.o.position.y = s.base.y + Math.sin(t * 0.7 + s.ph) * 0.4
      s.o.rotation.z = Math.sin(t * 0.6 + s.ph) * 0.05
    }
  }
  return { rects, inRect, dagashi, streetCars, build, update }
}
