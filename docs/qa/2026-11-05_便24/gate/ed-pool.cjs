// 便24: 夜の通りの行灯の灯りだまり（外の目 直すべき6）（一度だけ回す編集の台本）
const fs = require('fs')
const f = 'src/engine/kamoKyo.js'; let s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('見つからない: ' + a.slice(0, 80)); s = s.replace(a, b) }
rep('function addMeshes(ctx, groups, part) {', `// 灯りだまりの図（中心が明るく外へ薄れる・加算で重ねる）
function poolTex(keep) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d')
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)')
  x.fillStyle = g; x.fillRect(0, 0, 64, 64)
  const t = keep(new THREE.CanvasTexture(cv)); t.colorSpace = THREE.SRGBColorSpace; return t
}
function addMeshes(ctx, groups, part) {`)
rep('  const lat = Sink(), wood = Sink(), noren = Sink(), lamp = Sink(), rail = Sink(), tile = Sink()\n  let n = 0\n  for (const q of segs) {', '  const lat = Sink(), wood = Sink(), noren = Sink(), lamp = Sink(), rail = Sink(), tile = Sink(), pool = Sink()\n  let n = 0\n  for (const q of segs) {')
rep("      lamp.box(O, s, f, lsP, lsP + 0.3, 0.1, 0.36, base + 1.75, base + 2.1, [1, 0.93, 0.8])\n", `      lamp.box(O, s, f, lsP, lsP + 0.3, 0.1, 0.36, base + 1.75, base + 2.1, [1, 0.93, 0.8])
      if (LITE) { // 【便24・外の目 直すべき6】夜の通りの目線が真っ黒だった＝行灯の足もとの道と壁に、温かい灯りだまり（加算・道は外へ 2.6m・壁は 2.4m 四方）
        const W = (ss, ff, y) => [O[0] + s[0] * ss + f[0] * ff, y, O[2] + s[2] * ss + f[2] * ff], c0 = lsP + 0.15, k = NIGHT ? 1 : 0.55
        pool.quad(W(c0 - 1.6, 0.05, base - 0.17), W(c0 + 1.6, 0.05, base - 0.17), W(c0 + 1.6, 2.65, base - 0.17), W(c0 - 1.6, 2.65, base - 0.17), [0, 1, 0], 1, 1, [0.55 * k, 0.3 * k, 0.12 * k])
        pool.quad(W(c0 - 1.2, 0.03, base + 0.75), W(c0 + 1.2, 0.03, base + 0.75), W(c0 + 1.2, 0.03, base + 3.15), W(c0 - 1.2, 0.03, base + 3.15), [f[0], 0, f[2]], 1, 1, [0.32 * k, 0.17 * k, 0.07 * k])
      }
`)
rep("  if (withEave) groups.push({ sink: tile, mat: mk({ roughness: 0.6 }), shadow: true })\n  const tris = addMeshes(ctx, groups, 'kyoFront')",
`  if (withEave) groups.push({ sink: tile, mat: mk({ roughness: 0.6 }), shadow: true })
  if (LITE) groups.push({ sink: pool, mat: keep(new THREE.MeshBasicMaterial({ map: poolTex(keep), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: true, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })) })
  const tris = addMeshes(ctx, groups, 'kyoFront')`)
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('ok')
