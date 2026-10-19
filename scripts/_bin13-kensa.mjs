// 便13（2026-10-20・便12 #1=1 #2=2 #3=1 #4=1 で茶の間を作る便）の検査: 直しが1つずつ入っているかを、開発サーバー（既定 4982・_bin13-vite.config.mjs）の本物のページの部品の値で見る。
// 使い方: node scripts/_bin13-kensa.mjs [ID…|all]   出力: QA_OUT（既定 docs/qa/2026-10-20_便13/gate）/kensa.json
//   K1 猫の毛の材に段の画（gradientMap）が渡っていない（前は部屋の陰影を焼く関数が渡り、背が真っ黒＝V8）
//   K2 猫の毛の材が地の色の3割の自分の明るさ（emissive）を持つ（昼）
//   K3 三毛の黒のブチが真っ黒（明るさ 0.08 未満）でない（種 20261020 の北寺尾の昼は三毛）
//   K4 猫 0.28・毛糸玉 -0.32・膝掛け -0.42 の置き場（V44）
//   K5 ほこりが光の中だけ（昼＝窓→畳の帯の中・夜＝灯りの下の半径1の中）（V5）
//   K6 畳の絵が細かい目の 512 の絵（V7）／K7 カーテンのひだが頂点の陰影を持つ（V7）
//   K8 夜は大きな箱を細かく割って灯りを焼く（天井の灯りの近くは電球色・奥の壁は夜の色のまま）。昼は割らない（#1=1）
//   K9 風鈴が窓の右の外／K10 電灯の傘が上（2.94）で、iPhone の縦の画面の上の外（ボタンと重ならない＝V50）／K11 手すりが上の1本だけ（#2=2）
//   K12 窓をあけると錠が障子と一緒に左へ／K13 窓をあけると目が右へ寄る（#2=2）
//   K14 角部屋の最初の向き（縦 -1.12・横 -0.6）（#3=1）／K15 谷戸の目と部屋の高さ・窓をあけても目が前へ出ない（#4=1）
//   K16 撮影の台本でボタンを出して撮れる（_bin13-shot.mjs ui=1 が「ボタンあり」）
import { chromium } from 'playwright'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const PORT = process.env.B13K_PORT || 4982
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-20_便13/gate'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const seedRandom = (seed) => { let a = seed; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const probe = () => {
  const T = window.__b13T; if (!T) return { err: '検査の口（__b13T）が無い' }
  const a = T.getActive(), V = T.THREE, r = { kind: T.kind, night: T.isNight }
  const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
  const toon = []; T.winCat.g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshToonMaterial && !toon.includes(o.material)) toon.push(o.material) })
  r.toon = toon.map((m) => ({ grad: m.gradientMap == null ? 'none' : typeof m.gradientMap === 'function' ? 'function' : 'tex', lum: +lum(m.color).toFixed(4), emi: +(lum(m.emissive) / Math.max(1e-4, lum(m.color))).toFixed(3), rg: +(m.color.r / Math.max(1e-4, m.color.g)).toFixed(3) }))
  r.catX = +T.winCat.g.position.x.toFixed(3); r.toyHomeX = T.winCat.toyHome.x
  r.blanX = T.winRoom.children.filter((o) => o.isMesh && o.geometry.parameters && Math.abs(o.geometry.parameters.width - 0.46) < 1e-6 && Math.abs(o.geometry.parameters.height - 0.038) < 1e-6).map((o) => +o.position.x.toFixed(3))
  r.dust = T.winDust.base.map((p) => [+p.x0.toFixed(3), +p.y0.toFixed(3), +p.z0.toFixed(3)])
  const tat = T.winRoom.children.find((o) => o.isMesh && o.material.map && o.material.map.repeat.x === 3 && Math.abs(o.material.map.repeat.y - 2.4) < 0.01)
  r.tatW = tat ? tat.material.map.image.width : null
  r.curt = T.winCurtains.flatMap((cg) => cg.children.map((f) => !!f.geometry.attributes.color && !!f.material.vertexColors))
  r.bigSeg = 0; T.winRoom.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.widthSegments >= 10) r.bigSeg++ }) // 箱だけ数える（猫の球はもともと割りが細かい）
  const ceil = T.winRoom.children.find((o) => o.isMesh && o.geometry.parameters && o.geometry.parameters.width > 9 && Math.abs(o.position.y - 3.7) < 0.01)
  const back = T.winRoom.children.find((o) => o.isMesh && o.geometry.parameters && o.geometry.parameters.width > 9 && Math.abs(o.position.z - 7.4) < 0.01 && o.geometry.parameters.height > 3)
  const rb = (m, near) => { if (!m || !m.geometry.attributes.color) return null; const p = m.geometry.attributes.position, c = m.geometry.attributes.color; let best = 0; for (let i = 0; i < p.count; i++) { const x = m.position.x + p.getX(i), z = m.position.z + p.getZ(i); if (near(x, z)) best = Math.max(best, (c.getX(i) * m.material.color.r) / Math.max(1e-4, c.getZ(i) * m.material.color.b)) } return +best.toFixed(3) }
  r.ceilWarm = rb(ceil, (x, z) => Math.hypot(x, z - 2.65) < 1.0)
  r.backWarm = rb(back, (x, z) => Math.abs(x) > 3.5)
  r.chimeX = T.windChime ? +T.windChime.position.x.toFixed(3) : null
  const shade = T.winRoom.children.find((o) => o.isMesh && o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.radiusTop === 0.42)
  r.shadeY = shade ? +shade.position.y.toFixed(3) : null
  { // 電灯の部品（吊りコード・傘・天板・電球・引き紐・握り玉＝傘の真下の x 0.2 の内・高さ 1.5 より上・傘と同じ奥行き）の頂点のうち、画面に写る物の数
    // （カメラの前〈近くの面より奥〉にあり、画面の枠の内）。V50 で iPhone の右上の「写真」のボタンと重なっていたのは、傘の下の引き紐の握り玉（前の高さ 1.6）
    const lz = shade ? shade.position.z : 2.4, parts = T.winRoom.children.filter((o) => o.isMesh && o.visible && Math.abs(o.position.z - lz) < 0.01 && Math.abs(o.position.x) < 0.2 && o.position.y > 1.5)
    T.camera.updateMatrixWorld(true); let vis = 0, all = 0
    for (const m of parts) { m.updateMatrixWorld(true); const pa = m.geometry.attributes.position; for (let i = 0; i < pa.count; i++) { all++; const w = new V.Vector3().fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld), vz = w.clone().applyMatrix4(T.camera.matrixWorldInverse).z; if (-vz <= T.camera.near) continue; const n = w.project(T.camera); if (Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1) vis++ } }
    r.lampParts = parts.length; r.lampVis = vis; r.lampN = all }
  r.railsVis = T.winRoom.children.filter((o) => o.isMesh && Math.abs(o.position.z + 0.55) < 0.01 && o.visible).length
  r.eye = [T.eye.x, +T.eye.y.toFixed(3), +T.eye.z.toFixed(3)]; r.roomY = +T.winRoom.position.y.toFixed(3); r.roomZ = +T.winRoom.position.z.toFixed(3)
  r.yaw = +a.yaw.toFixed(3); r.yawTarget = +a.yawTarget.toFixed(3)
  return r
}
const afterOpen = () => { const T = window.__b13T; return { lockX: T.lock ? +T.lock.position.x.toFixed(3) : null, camX: +T.camera.position.x.toFixed(3), camZ: +T.camera.position.z.toFixed(3), eyeZ: +T.eye.z.toFixed(3), yaw: +T.getActive().yaw.toFixed(3) } }
const cache = {}
async function info(scene, vp = { width: 402, height: 874 }) {
  const key = scene + vp.width
  if (cache[key]) return cache[key]
  const ctx = await b.newContext(vp.width < vp.height ? { viewport: vp, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: vp, deviceScaleFactor: 1 }) // 縦は撮影の iPhone と同じ扱い（スマホの眺め）
  await ctx.addInitScript(seedRandom, 20261020)
  const p = await ctx.newPage(), errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && /shader|program|GLSL|compile|bin13/i.test(m.text())) errs.push(m.text().slice(0, 300)) })
  await p.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForTimeout(2500)
  await p.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {})
  await p.waitForTimeout(1200)
  await p.evaluate((s) => window.__applyScene(s), scene)
  await p.waitForTimeout(9000)
  const r = await p.evaluate(probe)
  await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(2600)
  r.open = await p.evaluate(afterOpen)
  await ctx.close()
  return (cache[key] = { ...r, errs })
}
const near = (a, b, e = 0.02) => a != null && Math.abs(a - b) <= e
const DAY = 'kitaterao-window-3d', NIGHT = 'kitaterao-window-3d-rain-night', CORNER = 'autumn-dusk-corner-room', YATO = 'shishigaya-window-3d'
const CHECKS = {
  K1: async () => { const d = await info(DAY), n = await info(NIGHT); const ok = [d, n].every((t) => t.toon.length >= 4 && t.toon.every((m) => m.grad === 'none')); return { pass: ok && !d.errs.length && !n.errs.length, day: d.toon.map((m) => m.grad), night: n.toon.map((m) => m.grad), errs: [...d.errs, ...n.errs] } },
  K2: async () => { const d = await info(DAY), n = await info(NIGHT); return { pass: d.toon.every((m) => m.emi >= 0.1) && d.toon.filter((m) => near(m.emi, 0.3)).length >= 3 && n.toon.every((m) => m.emi >= 0.25), day: d.toon.map((m) => m.emi), night: n.toon.map((m) => m.emi) } }, // 三毛のブチは明るくした後の色・夜は灯りの暖かみを掛けた後の色と比べるので、0.3・0.4 ちょうどにならない
  K3: async () => { const d = await info(DAY); const mike = d.toon[0].lum > 0.35 && d.toon.some((m) => m.rg > 1.3); const black = d.toon.filter((m) => m.lum < 0.08).length; return { pass: mike && black === 0, mike, black, lums: d.toon.map((m) => m.lum) } },
  K4: async () => { const d = await info(DAY); return { pass: near(d.catX, 0.28) && near(d.toyHomeX, -0.32) && d.blanX.length === 3 && d.blanX.every((x, i) => near(x, -0.42 + i * 0.012, 0.005)), catX: d.catX, toyHomeX: d.toyHomeX, blanX: d.blanX } },
  K5: async () => {
    const d = await info(DAY), n = await info(NIGHT)
    const dayOut = d.dust.filter(([x, y, z]) => !(Math.abs(x) <= 1.2 && z >= 0.35 && z <= 2.95 && y <= 1.9 && y >= -1.1)).length
    const nightOut = n.dust.filter(([x, y, z]) => !(Math.hypot(x, z - 2.4) <= 1.0 && y <= 1.9 && y >= 0.3)).length
    return { pass: d.dust.length > 30 && dayOut === 0 && nightOut === 0, n: d.dust.length, dayOut, nightOut }
  },
  K6: async () => { const d = await info(DAY); return { pass: d.tatW === 512, tatW: d.tatW } },
  K7: async () => { const d = await info(DAY), n = await info(NIGHT); return { pass: d.curt.length === 10 && d.curt.every(Boolean) && n.curt.every(Boolean), day: d.curt.filter(Boolean).length, night: n.curt.filter(Boolean).length } },
  K8: async () => { const d = await info(DAY), n = await info(NIGHT); return { pass: n.bigSeg >= 5 && n.ceilWarm > 1.4 && n.backWarm != null && n.backWarm < 1.2 && d.bigSeg === 0, nightBigSeg: n.bigSeg, ceilWarm: n.ceilWarm, backWarm: n.backWarm, dayBigSeg: d.bigSeg } },
  K9: async () => { const d = await info(DAY); return { pass: d.chimeX != null && d.chimeX > 1.2, chimeX: d.chimeX } },
  K10: async () => { const d = await info(DAY); return { pass: near(d.shadeY, 2.94) && d.lampParts >= 6 && d.lampVis === 0, shadeY: d.shadeY, lampParts: d.lampParts, lampVis: d.lampVis, lampN: d.lampN } },
  K11: async () => { const d = await info(DAY); return { pass: d.railsVis === 1, railsVis: d.railsVis } },
  K12: async () => { const d = await info(DAY); return { pass: d.open.lockX != null && d.open.lockX < -1.0, lockX: d.open.lockX } },
  K13: async () => { const d = await info(DAY); return { pass: d.open.camX > 0.4, camX: d.open.camX, yaw: d.open.yaw } },
  K14: async () => { const p = await info(CORNER), l = await info(CORNER, { width: 1280, height: 720 }); return { pass: near(p.yawTarget, -1.12) && near(l.yawTarget, -0.6) && !p.errs.length, portrait: p.yawTarget, landscape: l.yawTarget, errs: p.errs } },
  K15: async () => { const y = await info(YATO); return { pass: near(y.eye[1], 15.7) && near(y.eye[2], 17.1) && near(y.roomY, 14.5) && near(y.roomZ, 15.8) && Math.abs(y.open.camZ - y.open.eyeZ) < 0.2 && !y.errs.length, eye: y.eye, roomY: y.roomY, roomZ: y.roomZ, open: y.open, errs: y.errs } },
  K16: async () => {
    const r = spawnSync('node', ['scripts/_bin13-shot.mjs', 'iphone', DAY, 'still', 'kensa-ui', 'ui=1'], { env: { ...process.env, QA_OUT: OUT + '/k16', B13_PORT: String(PORT) }, encoding: 'utf8', shell: process.platform === 'win32' })
    const out = (r.stdout || '') + (r.stderr || '')
    return { pass: /ボタンあり/.test(out) && /エラー無し/.test(out), out: out.trim().slice(-160) }
  },
}
let ids = process.argv.slice(2)
if (!ids.length || ids.includes('all')) ids = Object.keys(CHECKS)
const res = {}
let fail = 0
for (const id of ids) {
  let r
  try { r = await CHECKS[id]() } catch (e) { r = { pass: false, threw: String(e).slice(0, 300) } }
  res[id] = r; if (!r.pass) fail++
  console.log(id, r.pass ? '合格' : '不合格', JSON.stringify(r).slice(0, 240))
}
await b.close()
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(`${OUT}/${process.env.KENSA_NAME || 'kensa'}.json`, JSON.stringify({ at: new Date().toISOString(), port: PORT, pass: !fail, ...res }, null, 1))
console.log(`検査の終わり: ${ids.length - fail}/${ids.length} 合格`)
process.exit(fail ? 1 : 0)
