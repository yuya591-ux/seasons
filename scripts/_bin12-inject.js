// 使い捨て（便12・室内の設計案）: 撮影用の口（__b12T）から、茶の間の部品をページの中で差し替える。本体は変えない。
// window.__bin12.apply('fix+yoru1+temae2') のように「+」でつないで当てる。
//   fix    決めた事の直し（V8 猫の陰影・V5 ほこりを光の中だけ・V7 畳の目とカーテンのひだの陰影・V44 猫と卓を少し内側へ）
//   yoru1  #1 案1 夜の灯りが部屋をほのかに照らす（灯りの近くの壁・天井・カーテン・家具に電球色の当たりを焼く）
//   yoru2  #1 案2 夜の灯りが部屋をしっかり照らす（当たりを広く強く・部屋全体が電球色に満ちる）
//   temae1 #2 案1 風鈴と電灯を窓の縁の外へ
//   temae2 #2 案2 案1＋ベランダの手すりを上の1本だけに＋窓をあけると錠が障子と動き、開いた側へ少し寄る
//   yato1  #4 案1 谷戸の窓を高くして見下ろす（茅葺きの屋敷と棚田が窓に入る）
// 部屋の寸法は town3dViewer.js の茶の間と同じ（原点=窓の中心・カメラは局所 (0,1.5,3.2)）
(() => {
  const OWW = 2.4, FY = -1.1, CY = 3.7, BZ = 7.4, WINCY = 1.0, OT = 1.85
  const LAMP = [0, 2.1, 2.4]
  const T = () => window.__b12T
  const log = []

  // 茶の間の局所座標での頂点の位置
  function eachVertexLocal(mesh, fn) {
    const { THREE, winRoom } = T()
    winRoom.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(winRoom.matrixWorld).invert()
    const m = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)
    const p = mesh.geometry.attributes.position, v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); fn(i, v) }
  }
  // 本体の grad（窓からの採光の陰影）と同じ式
  function gradCol(lz, ly) {
    const { isNight, duskAmt } = T()
    const near = Math.max(0, 1 - lz / (BZ + 0.4))
    const lo = Math.min(1, Math.max(0, (ly - FY) / (CY - FY + 0.6)))
    const b = Math.max(0.4, Math.min(1.36, (0.6 + near * 0.74) * (0.86 + lo * 0.2)))
    const warm = near * (isNight ? 0.25 : (0.34 + duskAmt * 0.36))
    return [Math.min(1.5, b * (1 + warm * 0.14)), b, b * (1 - warm * 0.16)]
  }
  const inCat = (o) => { const c = T().winCat; let x = o; while (x) { if (c && x === c.g) return true; x = x.parent } return false }
  const solidMeshes = () => { const out = []; T().winRoom.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent && o.material.visible !== false && !inCat(o)) out.push(o) }); return out }

  // ── fix: 決めた事の直し ──
  function fix() {
    const { THREE, winCat, winDust, isNight, winRoom } = T()
    // V8: 猫の毛の材（陰影付き）に、陰影の段の画の代わりに部屋の陰影を焼く関数が渡っていた＝日の光の当たりが消え、白は灰に、黒のブチは真っ黒に沈んだ。段の画を外して既定の2段の陰影にする
    let n = 0
    winCat.g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshToonMaterial && typeof o.material.gradientMap === 'function') { o.material.gradientMap = null; o.material.needsUpdate = true; n++ } })
    log.push('猫の材 ' + n)
    // 部屋は光を受けない材で明るく焼いてあるのに、猫だけ場面の光を受ける＝夕方と夜は猫だけ黒い塊に沈む。地の色の3割を自分の明るさとして足す
    winCat.g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshToonMaterial && !o.material.userData.b12em) { o.material.userData.b12em = 1; o.material.emissive.copy(o.material.color).multiplyScalar(isNight ? 0.4 : 0.3) } })
    // 三毛の黒のブチ（背の明るみの材に黒が入る）は、陰影が乗る明るさまで上げる（地が白い時だけ。黒猫の背の明るみは元から明るい）
    const toon = []; winCat.g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshToonMaterial && !toon.includes(o.material)) toon.push(o.material) })
    const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
    if (toon.length && lum(toon[0].color) > 0.35) for (const m of toon) if (lum(m.color) < 0.08) { m.color.lerp(new THREE.Color(0x6a5c52), 0.75); log.push('三毛のブチ') }
    // V44: 猫と卓を少し内側へ（iPhone の縦で右端・左下で切れない）
    const dx = -0.22
    for (const k of ['homeX', 'x0', 'x1']) winCat[k] += dx
    winCat.g.position.x += dx; winCat.catShadow.position.x += dx
    winCat.toyHome.x -= 0.32; winCat.toyG.position.x -= 0.32; winCat.toyHit.position.x -= 0.32; winCat.toyShadow.position.x -= 0.32 // 毛糸玉も猫の手前左へ
    winRoom.children.forEach((o) => { if (Math.hypot(o.position.x + 0.72, o.position.z - 2.25) < 0.75 && o.position.y < 0.2) o.position.x += 0.2 })
    // V5: ほこりを光の中だけに。昼は窓から畳へ斜めに差す光の帯の中、夜は灯りのまわりに置き直す（毎こまの揺れは元の位置のまわり）
    let h = 7 >>> 0; const rnd = () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296 }
    for (const b of winDust.base) {
      if (isNight) { const a = rnd() * 6.283, r = 0.25 + rnd() * 0.75; b.x0 = LAMP[0] + Math.cos(a) * r; b.z0 = LAMP[2] + Math.sin(a) * r; b.y0 = LAMP[1] - 0.2 - rnd() * 1.6 }
      else { const s = rnd(); b.x0 = (rnd() - 0.5) * (OWW - 0.3) - 0.15 * s; b.y0 = (0.25 + rnd() * 1.5) * (1 - s) + FY * s + 0.15; b.z0 = 0.35 + s * 2.6 }
    }
    // V7: 畳の目（い草の細い目と、畳ごとの日焼けのむら）
    const tat = solidMeshes().find((o) => o.material.map && o.material.map.image && o.material.map.repeat.x === 3 && Math.abs(o.material.map.repeat.y - 2.4) < 0.01)
    if (tat) {
      const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d')
      const tints = isNight ? ['#3a3c2c', '#3c3d2b', '#37392b', '#3b3c2a'] : ['#a8a866', '#9fa35f', '#b1aa68', '#a2a660']
      const cell = (cx, cy, vert, k) => {
        x.fillStyle = tints[k]; x.fillRect(cx, cy, 256, 256)
        for (let i = 0; i < 64; i++) { const t = i * 4 + 2, a = 0.05 + (i % 2) * 0.05; x.fillStyle = `rgba(${isNight ? '10,12,6' : '70,72,30'},${a})`; if (vert) x.fillRect(cx + t, cy, 2, 256); else x.fillRect(cx, cy + t, 256, 2) }
        for (let i = 0; i < 9; i++) { x.fillStyle = `rgba(${isNight ? '0,0,0' : '60,62,24'},0.05)`; if (vert) x.fillRect(cx, cy + i * 28 + 14, 256, 1.5); else x.fillRect(cx + i * 28 + 14, cy, 1.5, 256) } // 織りの縦糸
        const g = x.createRadialGradient(cx + 128, cy + 128, 20, cx + 128, cy + 128, 190); g.addColorStop(0, 'rgba(255,240,190,0.06)'); g.addColorStop(1, 'rgba(90,80,30,0.08)'); x.fillStyle = g; x.fillRect(cx, cy, 256, 256) // 日焼けのむら
      }
      cell(0, 0, false, 0); cell(256, 0, true, 1); cell(0, 256, true, 2); cell(256, 256, false, 3)
      x.fillStyle = isNight ? '#181a10' : '#3e472a'; for (const g of [0, 256, 512]) { x.fillRect(g - 6, 0, 12, 512); x.fillRect(0, g - 6, 512, 12) } // 畳縁
      x.fillStyle = isNight ? 'rgba(80,70,40,0.25)' : 'rgba(150,130,80,0.35)'; for (const g of [0, 256, 512]) { x.fillRect(g - 2, 0, 1.5, 512); x.fillRect(0, g - 2, 512, 1.5) } // 縁の織りの光
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 2.4); tex.anisotropy = tat.material.map.anisotropy
      tat.material.map = tex; tat.material.needsUpdate = true; log.push('畳')
    }
    // V7: カーテンのひだ（ひだごとに丸く陰影＝中が明るく脇が沈む）と、窓側の縁の光の透け（昼）
    for (const cg of T().winCurtains) {
      const cs = cg.userData.cs
      cg.children.forEach((fold) => {
        const g = fold.geometry.clone(), p = g.attributes.position, nrm = g.attributes.normal, col = new Float32Array(p.count * 3)
        for (let i = 0; i < p.count; i++) {
          const nz = nrm.getZ(i), nx = nrm.getX(i), y = p.getY(i)
          let v = 0.72 + 0.38 * Math.max(0, nz) - 0.12 * Math.max(0, -nz)
          if (!isNight) v += 0.18 * Math.max(0, -nx * cs) // 窓側の脇が透けて明るい
          v *= 0.92 + 0.08 * Math.min(1, (y + 1) / 2) // 裾ほどわずかに沈む
          col[i * 3] = v * (isNight ? 1 : 1.03); col[i * 3 + 1] = v; col[i * 3 + 2] = v * (isNight ? 1 : 0.94)
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3)); fold.geometry = g
        if (!fold.material.vertexColors) { fold.material.vertexColors = true; fold.material.needsUpdate = true }
      })
    }
    log.push('カーテン')
  }

  // ── #1 夜の灯り: 灯りからの距離で電球色の当たりを頂点色に焼く。大きな面は細かく割ってから焼く（面の上で光がなめらかに落ちる） ──
  function yoru(level) {
    const { THREE, isNight, winCat } = T()
    if (!isNight) { log.push('夜でないので灯りは焼かない'); return }
    const A = level === 2 ? 1.5 : 1.3, R0 = level === 2 ? 2.9 : 1.8, AMB = level === 2 ? 0.2 : 0
    const WARM = [1.5, 1.0, 0.55] // 電球色の色合い（明るさ1あたり）
    // 夜の材の色（紫寄り）を、明るさだけの灰へ置き換え、色合いは頂点の色で持つ＝遠くは夜の青紫のまま、灯りの近くは電球色になる
    const hue = new Map()
    for (const o of solidMeshes()) {
      const m = o.material; if (hue.has(m) || !m.color) continue
      const c = m.color, L = Math.max(0.02, 0.299 * c.r + 0.587 * c.g + 0.114 * c.b)
      hue.set(m, [c.r / L, c.g / L, c.b / L]); m.color.setRGB(L, L, L)
    }
    let big = 0, all = 0
    for (const o of solidMeshes()) {
      if (!o.geometry.attributes.position) continue
      o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox, sz = new THREE.Vector3(); bb.getSize(sz)
      const hasCol = !!o.geometry.attributes.color
      if (hasCol && Math.max(sz.x, sz.y, sz.z) > 1.2 && o.parent === T().winRoom && o.rotation.x === 0 && o.rotation.y === 0 && o.rotation.z === 0) {
        // 大きな箱（壁・天井・畳・腰壁）: 細かく割り直して、本体の採光の陰影を同じ式で焼き直す
        const seg = (v) => Math.max(1, Math.min(40, Math.ceil(v / 0.22)))
        const g = new THREE.BoxGeometry(sz.x, sz.y, sz.z, seg(sz.x), seg(sz.y), seg(sz.z))
        const c = new Float32Array(g.attributes.position.count * 3)
        const p = g.attributes.position
        for (let i = 0; i < p.count; i++) { const gc = gradCol(o.position.z + p.getZ(i), o.position.y + p.getY(i)); c[i * 3] = gc[0]; c[i * 3 + 1] = gc[1]; c[i * 3 + 2] = gc[2] }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3)); o.geometry = g; big++
      } else if (!hasCol) {
        const c = new Float32Array(o.geometry.attributes.position.count * 3).fill(1); o.geometry = o.geometry.clone(); o.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3))
        if (!o.material.vertexColors) { o.material.vertexColors = true; o.material.needsUpdate = true }
      }
      const col = o.geometry.attributes.color, h0 = hue.get(o.material) || [1, 1, 1]
      eachVertexLocal(o, (i, v) => {
        const d = Math.hypot(v.x - LAMP[0], v.y - LAMP[1], v.z - LAMP[2])
        let f = 1 / (1 + (d / R0) * (d / R0))
        if (v.y > 2.5 && Math.hypot(v.x - LAMP[0], v.z - LAMP[2]) < 0.45) f *= 0.5 // 傘の天板の真上は少し陰る
        const k = A * f + AMB, w = Math.min(1, k * 1.1) // w=電球色の混ざる量
        const g = 1 + k * 1.6 // 明るさ
        // 物の地の色＝夜の色合いを半分ほど中立へ寄せた物。光の色＝遠くは今の夜の色合いになる物・灯りの近くは電球色
        for (let ch = 0; ch < 3; ch++) { const alb = h0[ch] * 0.45 + 0.55, lt = (h0[ch] / alb) * (1 - w) + WARM[ch] * w; col.setComponent(i, ch, col.getComponent(i, ch) * g * alb * lt) }
      })
      col.needsUpdate = true; all++
    }
    // 猫は陰影付きの材（場面の光を受ける）なので、色に灯りの暖かみを掛ける
    const kc = (level === 2 ? 0.9 : 0.55)
    winCat.g.traverse((o) => { if (o.isMesh && o.material && o.material.color && !o.material.userData.b12lit) { o.material.userData.b12lit = 1; o.material.color.multiply(new THREE.Color(1 + kc * 0.62, 1 + kc * 0.42, 1 + kc * 0.2)) } })
    log.push(`灯り${level}: 大きな面 ${big}・焼いた物 ${all}`)
  }

  // ── #2 窓の手前の物 ──
  function temae(level) {
    const { winRoom, windChime, THREE } = T()
    // 風鈴を窓の開口の右の外（カーテンの前）へ。紐を短く
    if (windChime) { windChime.position.x = OWW / 2 + 0.62; windChime.position.y = OT + 0.12; log.push('風鈴') }
    // 電灯: 吊りコードを短くして傘を上へ・少し部屋の奥へ（窓の上の縁にかからない）
    const lampParts = winRoom.children.filter((o) => Math.abs(o.position.z - 2.4) < 0.01 && Math.abs(o.position.x) < 0.2 && o.position.y > 1.5)
    const up = 0.62, back = 0.25
    for (const o of lampParts) {
      if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.position.y > 2.9) { o.scale.y = Math.max(0.05, (CY - 2.5 - up) / (CY - 2.5)); o.position.y = CY - (CY - 2.5 - up) / 2; o.position.z += back; continue } // 吊りコード
      o.position.y += up; o.position.z += back
    }
    log.push('電灯の部品 ' + lampParts.length)
    if (level < 2) return
    // ベランダの手すりを上の1本だけに（下の桟と縦の子を外す）・上の1本は細く
    let hid = 0
    winRoom.children.forEach((o) => { if (o.isMesh && Math.abs(o.position.z + 0.55) < 0.01) { if (o.position.y > 0.7 && o.geometry.parameters && o.geometry.parameters.width > 2) { o.scale.set(1, 0.6, 0.6) } else { o.visible = false; hid++ } } })
    log.push('手すりを外した ' + hid)
    // 窓をあけると、クレセント錠が右の障子と一緒にすべり、カメラが開いた右の側へ少し寄る
    const lock = winRoom.children.find((o) => o.isMesh && Math.abs(o.position.x - 0.1) < 0.01 && Math.abs(o.position.y - (WINCY - 0.06)) < 0.01 && Math.abs(o.position.z - 0.31) < 0.01)
    const sash = T().winSashR, sx0 = sash.position.x
    const scene = T().scene, prev = scene.onBeforeRender
    scene.onBeforeRender = function (r, s, cam, ...rest) {
      const a = T().getActive(); const wo = a ? (a.winOpen || 0) : 0
      if (lock) lock.position.x = 0.1 + (sash.position.x - sx0)
      if (cam === T().camera && wo > 0.001 && (!a || !a.flyP)) { cam.position.x += 0.55 * wo * (1 - (a.lean || 0)); cam.updateMatrixWorld() }
      if (prev) prev.call(this, r, s, cam, ...rest)
    }
    log.push('錠 ' + (lock ? 'あり' : '無し'))
  }

  // ── #4 谷戸: 窓（と部屋）を高くし、見下ろす向きにする ──
  let POS = null // yato@x_y_z で窓の目の位置を選ぶ（無ければ既定）
  function yato() {
    const { eye, winRoom, kind } = T()
    if (kind !== 'yato') { log.push('谷戸でない'); return }
    // 窓から見下ろせるのは窓の下の縁まで（約23度）。高い所から見下ろすと屋敷と棚田が縁の下に隠れるので、窓を谷へ寄せて低くし、谷を横から見渡す
    const to = POS || [0, 16, 19]
    const dy = to[1] - eye.y, dz = to[2] - eye.z
    eye.y += dy; eye.z += dz; winRoom.position.y += dy; winRoom.position.z += dz
    if (to[3]) { eye.z -= to[3]; eye.y -= to[4] || 0 } // 4つ目＝目だけ窓へ寄せる量（部屋は動かさない＝窓辺に寄って座る）。寄るほど窓の下の縁から深く見下ろせる
    log.push('谷戸の窓 ' + to.join(','))
  }

  window.__bin12 = {
    apply(names) {
      log.length = 0
      const ns = String(names).split(/[+ ,]/) // URL の ?b12= では「+」が空白に読まれる
      if (ns.includes('fix')) fix()
      if (ns.includes('yoru1')) yoru(1)
      if (ns.includes('yoru2')) yoru(2)
      if (ns.includes('temae1')) temae(1)
      if (ns.includes('temae2')) temae(2)
      const yp = ns.find((n) => n.startsWith('yato')); if (yp) { const m = yp.match(/@(.+)$/); POS = m ? m[1].split('_').map(Number) : null; yato() }
      return log.slice()
    },
  }
})()
