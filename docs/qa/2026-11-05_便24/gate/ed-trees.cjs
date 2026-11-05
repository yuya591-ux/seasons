// 便24: 木の形のばらつきと柳（一度だけ回す編集の台本）
const fs = require('fs')
const f = 'src/engine/kamoTown.js'; let s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('見つからない: ' + a.slice(0, 90)); s = s.replace(a, b) }
rep('    const nearGeo = cards(low ? 140 : 240), farGeo = cards(low ? 40 : 64)\n', `    const nearGeo = cards(low ? 140 : 240), farGeo = cards(low ? 40 : 64)
    // 便24: 樹冠の形のばらつき（前はすべての木が同じ 5 つの塊の並びで、どの木も同じ丸い塊に見えた）と、川岸と高瀬川・白川の柳（枝垂れ）。
    //   形は自分の乱数で作る（町の乱数 R を回さない＝北の木の並びと色は前のまま）。kamotree2=0 は外し回し用（前の 1 つの形だけ）
    const TV = !/[?&]kamotree2=0/.test(location.search)
    const VR = (() => { let s2 = 91024; return () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296 } })()
    const cardsL = (count, lb, sz0) => {
      const quads = []
      for (let k = 0; k < count; k++) {
        const [lx, ly, lz, lr] = lb[k % lb.length], u = VR() * 2 - 1, th = VR() * 6.283, rr = lr * Math.cbrt(VR())
        const p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), u * 0.8, Math.sqrt(1 - u * u) * Math.sin(th)).multiplyScalar(rr).add(new THREE.Vector3(lx, ly, lz))
        const g = new THREE.PlaneGeometry(sz0, sz0); g.rotateX(VR() * 6.283); g.rotateY(VR() * 6.283); g.translate(p.x, p.y, p.z)
        const nn = p.clone().normalize(), na = g.attributes.normal; for (let i = 0; i < na.count; i++) na.setXYZ(i, nn.x, nn.y, nn.z)
        quads.push(g)
      }
      const m = keep(BGU.mergeGeometries(quads)); quads.forEach((g) => g.dispose()); return m
    }
    // 形の 3 通り: 塊が 3〜6 つ・高さと横の広がりの違う樹冠
    const variants = TV ? [0, 1, 2].map((v) => { const lb = [], nl = 3 + v + Math.floor(VR() * 2); for (let k = 0; k < nl; k++) lb.push([(VR() - 0.5) * (0.9 + v * 0.2), (VR() - 0.35) * (0.5 + v * 0.2), (VR() - 0.5) * (0.9 + v * 0.2), 0.4 + VR() * 0.35]); return { near: cardsL(low ? 140 : 240, lb, 0.7), far: cardsL(low ? 40 : 64, lb, 0.95) } }) : []
    // 柳: 上の小さな傘から細い枝が地面近くまで垂れる（枝ごとに細長い葉の小片を縦に連ねる）
    const willowCards = (count) => {
      const quads = [], NS = 30, per = Math.max(3, Math.round(count / NS))
      for (let k = 0; k < NS; k++) {
        const th = (k / NS) * 6.283 + VR() * 0.3, r0 = 0.35 + VR() * 0.55, y0 = 0.55 - r0 * 0.35, y1 = -1.15 - VR() * 0.2
        for (let j = 0; j < per; j++) {
          const t2 = j / (per - 1), y = y0 + (y1 - y0) * t2, r = r0 + 0.18 * Math.sin(t2 * 1.4)
          const g = new THREE.PlaneGeometry(0.2, 0.46); g.rotateZ((VR() - 0.5) * 0.3); g.rotateY(th + (VR() - 0.5) * 0.8); g.translate(Math.cos(th) * r, y, Math.sin(th) * r)
          const na = g.attributes.normal; for (let i = 0; i < na.count; i++) na.setXYZ(i, Math.cos(th) * 0.8, 0.6, Math.sin(th) * 0.8)
          quads.push(g)
        }
      }
      for (let k = 0; k < count * 0.25; k++) { const th = VR() * 6.283, r = Math.sqrt(VR()) * 0.75; const g = new THREE.PlaneGeometry(0.4, 0.4); g.rotateX(VR() * 6.283); g.rotateY(VR() * 6.283); g.translate(Math.cos(th) * r, 0.5 + VR() * 0.25 - r * 0.3, Math.sin(th) * r); const na = g.attributes.normal; for (let i = 0; i < na.count; i++) na.setXYZ(i, Math.cos(th) * 0.5, 0.85, Math.sin(th) * 0.5); quads.push(g) }
      const m = keep(BGU.mergeGeometries(quads)); quads.forEach((g) => g.dispose()); return m
    }
    const willow = TV ? { near: willowCards(low ? 160 : 300), far: willowCards(low ? 60 : 90) } : null
    const WILLOW = { spring: 0x9cbc5e, summer: 0x7fa04a, autumn: 0xa6a050, winter: 0x7a8456 }[S]
    const crownGeo = (vi, near) => (vi === 'w' ? (near ? willow.near : willow.far) : vi > 0 ? (near ? variants[vi - 1].near : variants[vi - 1].far) : near ? nearGeo : farGeo)
`)
rep('      const t = { crownM, trunkM, col: c.clone() }\n', `      // 便24: 形の通り（0 前の形・1〜3 のばらつき・w 柳）。柳は川岸の木（種類 1）のうち二条より南（木屋町・先斗町・高瀬川・白川のあたり）の 6 割。乱数 R は回さない（位置の hash）
      const hv = hash(tx * 0.371 + tz * 0.713)
      const vi = !TV ? 0 : kind === 1 && tz > 1900 && hv < 0.6 ? 'w' : Math.floor(hash(tx * 1.913 + tz * 0.277 + 0.7) * 4)
      if (vi === 'w') { c.setHex(WILLOW).offsetHSL(0, 0, (hv - 0.3) * 0.08); if (SNOW) c.lerp(WHITE, 0.25) }
      const t = { crownM, trunkM, col: c.clone(), vi }
`)
rep(`      for (const [list, geo] of [[cell.near, nearGeo], [cell.far, farGeo]]) {
        if (!list.length) continue
        const im = new THREE.InstancedMesh(geo, leafMat, list.length)
        list.forEach((t, k) => { im.setMatrixAt(k, t.crownM); im.setColorAt(k, t.col) })
        im.castShadow = im.receiveShadow = true; im.userData.part = 'crown'; im.computeBoundingSphere(); scene.add(im)
      }`, `      for (const [list0, isNear] of [[cell.near, true], [cell.far, false]]) {
        const byV = new Map(); for (const t of list0) { const k = t.vi; if (!byV.has(k)) byV.set(k, []); byV.get(k).push(t) } // 便24: 形の通りごとに並べる
        for (const [vi, list] of byV) {
          const im = new THREE.InstancedMesh(crownGeo(vi, isNear), leafMat, list.length)
          list.forEach((t, k) => { im.setMatrixAt(k, t.crownM); im.setColorAt(k, t.col) })
          im.castShadow = im.receiveShadow = true; im.userData.part = 'crown'; im.computeBoundingSphere(); scene.add(im)
        }
      }`)
// 柳の芯（暗い球）は上の傘の中だけに小さく
rep("      cell.all.forEach((t, k) => { core.setMatrixAt(k, t.crownM);", "      const wm = new THREE.Matrix4().makeScale(0.55, 0.4, 0.55).setPosition(0, 0.42, 0) // 便24: 柳の芯は上の傘の中だけ\n      cell.all.forEach((t, k) => { core.setMatrixAt(k, t.vi === 'w' ? t.crownM.clone().multiply(wm) : t.crownM);")
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('ok')
