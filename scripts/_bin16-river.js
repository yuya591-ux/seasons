// 便16 設計案の試作「大きな川の流れる町」（2026-11-03・裕也さんの気づき K7）。本体とは切り離した1枚のページ。
// 画像を使わず計算だけで、物理的な空（Sky）・水面の映り込み（Water）・材質の光り方（MeshStandard＋空の照り返し）・霞で「本物の風景」に寄せる。
// 使い方: /seasons/scripts/_bin16-river.html?v=A|B|C&t=morning|noon|dusk|night&s=spring|summer|autumn|winter&w=clear|rain|snow
import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const Q = new URLSearchParams(location.search)
const V = Q.get('v') || 'A', T = Q.get('t') || 'dusk', S = Q.get('s') || 'autumn', W = Q.get('w') || 'clear'
const LOW = Q.get('q') === 'low' // iPhone 向けの軽い段の見積もり
let seed = 20261103
const R = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const lerp = (a, b, k) => a + (b - a) * k, sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
// 値の雑音（格子の値をなめらかにつなぐ）
const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s) }
const vnoise = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf)
  return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v) }
const fbm = (x, z) => vnoise(x, z) * 0.5 + vnoise(x * 2.1, z * 2.1) * 0.25 + vnoise(x * 4.3, z * 4.3) * 0.125

// ── 川の形（案ごと）。cx(z)=川の中心の x、hw(z)=川の半分の幅。川は手前（z 大）から奥（z 小＝下流）へ流れる ──
const RIVER = {
  A: { cx: () => 0, hw: () => 62, sea: null }, // 真っすぐ奥へ（川を正面に見下ろす）
  B: { cx: (z) => 150 * Math.sin((z + 60) * 0.0032), hw: () => 54, sea: null }, // 大きく曲がって流れる
  C: { cx: (z) => -0.12 * (z + 200), hw: (z) => 60 + Math.max(0, -z - 250) * 0.22, sea: -1250 }, // 下流で広がり、河口と海へ
}[V]
const SEA_Z = RIVER.sea
const BANK = 34, LEVEE = 10, TOP = 6, TOWN_H = 3.2 // 河川敷の幅・堤防の斜面・天端・町の地面の高さ
function groundH(x, z) {
  const d = Math.abs(x - RIVER.cx(z)) - RIVER.hw(z)
  let h
  if (d < 0) h = -4 + sm(-12, 0, d) * 3.2
  else if (d < 5) h = lerp(-0.8, 0.9, d / 5) // 水際
  else if (d < BANK) h = 0.9 + fbm(x * 0.05, z * 0.05) * 0.5 // 河川敷（草地・グラウンド）
  else if (d < BANK + LEVEE) h = lerp(1.2, 7.2, sm(BANK, BANK + LEVEE, d)) // 堤防の川側の斜面
  else if (d < BANK + LEVEE + TOP) h = 7.2 // 天端の道
  else if (d < BANK + LEVEE * 1.6 + TOP) h = lerp(7.2, TOWN_H, sm(BANK + LEVEE + TOP, BANK + LEVEE * 1.6 + TOP, d))
  else h = TOWN_H + (fbm(x * 0.004, z * 0.004) - 0.45) * 10 * sm(300, 900, d) // 遠くはゆるい起伏
  if (SEA_Z != null && z < SEA_Z) h = lerp(h, -6, sm(SEA_Z, SEA_Z - 140, z)) // 河口の先は海
  return h
}
const zoneOf = (x, z) => { const d = Math.abs(x - RIVER.cx(z)) - RIVER.hw(z); return d < 0 ? 'river' : d < BANK ? 'bank' : d < BANK + LEVEE * 1.6 + TOP + 4 ? 'levee' : 'town' }

// ── 時刻と季節 ──
const TIME = {
  morning: { el: 7, az: 115, turb: 6, ray: 1.6, exp: 0.42, sun: 0xffe2c0, sunI: 2.4, hemi: [0xbfd2e6, 0x5a5040, 0.55], fog: 0xd2d6da, fogD: 0.0008, lit: 0.08 },
  noon: { el: 52, az: 160, turb: 3.5, ray: 1.0, exp: 0.32, sun: 0xfff6ea, sunI: 3.2, hemi: [0xcfe0f2, 0x6a6050, 0.7], fog: 0xc6d4e2, fogD: 0.0006, lit: 0 },
  dusk: { el: 4.5, az: 236, turb: 5.5, ray: 1.3, exp: 0.4, sun: 0xffa66a, sunI: 2.0, hemi: [0xa8a8c8, 0x403028, 0.45], fog: 0xc6b2a6, fogD: 0.0009, lit: 0.2 },
  night: { el: -12, az: 220, turb: 2, ray: 0.6, exp: 0.55, sun: 0x8ea6d0, sunI: 0.25, hemi: [0x2a3550, 0x0c0c12, 0.35], fog: 0x1c2232, fogD: 0.0012, lit: 0.85 },
}[T]
if (W === 'rain') { TIME.turb = 14; TIME.fogD *= 1.9; TIME.sunI *= 0.25; TIME.fog = new THREE.Color(TIME.fog).lerp(new THREE.Color(0x8a9096), 0.6).getHex() }
const LEAF = { spring: [0xe8b8c8, 0x7fa05c], summer: [0x3f6a34, 0x5a8040], autumn: [0xb8622e, 0x6e7a3a], winter: [0x4a5a44, 0x55604a] }[S]
const GRASS = { spring: 0x6f8f4a, summer: 0x557a34, autumn: 0x8a8048, winter: W === 'snow' ? 0xe8ecf0 : 0x8a8466 }[S]

// ── 描画の器 ──
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = TIME.exp
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
renderer.info.autoReset = false
const scene = new THREE.Scene()
scene.fog = new THREE.FogExp2(TIME.fog, TIME.fogD)
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 1, 9000)

// 空（物理的な散乱の式）と、その空から作る照り返し（材質が空の色を映す）
const sky = new Sky(); sky.scale.setScalar(8000)
const su = sky.material.uniforms
su.turbidity.value = TIME.turb; su.rayleigh.value = TIME.ray; su.mieCoefficient.value = 0.0022; su.mieDirectionalG.value = 0.86
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - TIME.el), THREE.MathUtils.degToRad(TIME.az))
su.sunPosition.value.copy(sunDir)
scene.add(sky)
const pmrem = new THREE.PMREMGenerator(renderer)
{ const envScene = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(8000); Object.assign(s2.material.uniforms.sunPosition.value, sunDir); for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = su[k].value; envScene.add(s2)
  scene.environment = pmrem.fromScene(envScene, 0, 1, 10000).texture; scene.environmentIntensity = T === 'night' ? 0.25 : 0.8 }
if (T === 'night') { // 夜は散乱の空を暗い夜空に置き換え、星を少し
  sky.visible = false; scene.background = new THREE.Color(0x0d1220)
  const n = 1400, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, e = 0.08 + R() * 1.3; p.set([Math.cos(a) * Math.cos(e) * 6000, Math.sin(e) * 6000, Math.sin(a) * Math.cos(e) * 6000], i * 3) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc8d4ff, size: 1.6, sizeAttenuation: false, fog: false })))
}

const sunL = new THREE.DirectionalLight(TIME.sun, TIME.sunI)
sunL.position.copy(sunDir).multiplyScalar(600).add(new THREE.Vector3(0, T === 'night' ? 900 : 0, 0))
sunL.castShadow = !LOW && T !== 'night'
sunL.shadow.mapSize.set(4096, 4096)
Object.assign(sunL.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 10, far: 2400 })
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.6
scene.add(sunL); scene.add(sunL.target)
scene.add(new THREE.HemisphereLight(...TIME.hemi))

// ── 地面（高さの網＋頂点の色: 川底・水際・河川敷の草・堤防・天端の道・町の地面） ──
{
  const N = LOW ? 260 : 420, SZ = 4200
  const g = new THREE.PlaneGeometry(SZ, SZ, N, N); g.rotateX(-Math.PI / 2); g.translate(0, 0, -900)
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color()
  const cGrass = new THREE.Color(GRASS), cMud = new THREE.Color(0x6a6250), cPath = new THREE.Color(0xb4aa96), cTown = new THREE.Color(0x8a8780), cFar = new THREE.Color(0x6a7060)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = groundH(x, z); pos.setY(i, h)
    const d = Math.abs(x - RIVER.cx(z)) - RIVER.hw(z), n = fbm(x * 0.03, z * 0.03)
    if (d < 4) c.copy(cMud)
    else if (d < BANK + LEVEE) c.copy(cGrass).offsetHSL(0, 0, (n - 0.5) * 0.12)
    else if (d < BANK + LEVEE + TOP) c.copy(cPath)
    else if (d < 700) c.copy(cTown).lerp(cGrass, n * 0.35)
    else c.copy(cFar).lerp(cGrass, n * 0.5)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals()
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }))
  m.receiveShadow = true; scene.add(m)
}

// ── 水面（周期のある波を重ねた法線の図＝継ぎ目なしに並ぶ） ──
function waterNormals(n = 256) {
  const waves = []; for (let k = 0; k < 18; k++) waves.push([Math.round((R() - 0.5) * 2 * (2 + k)), Math.round((R() - 0.5) * 2 * (2 + k)), R() * 6.283, 1 / (1 + k * 0.6)])
  const H = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let h = 0; for (const [fx, fy, ph, a] of waves) h += a * Math.sin(6.2832 * (fx * i + fy * j) / n + ph); H[j * n + i] = h }
  const d = new Uint8Array(n * n * 4)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const hx = H[j * n + (i + 1) % n] - H[j * n + (i - 1 + n) % n], hy = H[((j + 1) % n) * n + i] - H[((j - 1 + n) % n) * n + i]
    const v = new THREE.Vector3(-hx * 0.9, -hy * 0.9, 1).normalize(); d.set([(v.x * 0.5 + 0.5) * 255, (v.y * 0.5 + 0.5) * 255, (v.z * 0.5 + 0.5) * 255, 255], (j * n + i) * 4)
  }
  const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t
}
const water = new Water(new THREE.PlaneGeometry(6000, 6000), {
  textureWidth: LOW ? 512 : 1024, textureHeight: LOW ? 512 : 1024, waterNormals: waterNormals(),
  sunDirection: sunDir.clone(), sunColor: T === 'night' ? 0x445066 : TIME.sun, waterColor: S === 'winter' ? 0x223238 : 0x26393a,
  distortionScale: W === 'rain' ? 1.6 : 2.6, fog: true, alpha: 1,
})
water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -900); water.material.uniforms.size.value = 3.2
scene.add(water)

// ── 家並み（切妻の家・平屋根の家・集合住宅。並びは道の格子に沿う） ──
const roofGeo = (() => { // 単位の切妻屋根（棟は z 方向・底は y=0）
  const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, 0.5]
  const idx = [0, 2, 1, 3, 5, 4, 0, 3, 4, 0, 4, 2, 1, 2, 4, 1, 4, 5]
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); return g.toNonIndexed().computeVertexNormals() || g })()
roofGeo.computeVertexNormals()
const bodyGeo = new THREE.BoxGeometry(1, 1, 1); bodyGeo.translate(0, 0.5, 0)
function facadeTex(cols, rows, lit) { // 集合住宅の窓・ベランダの面の図（lit=夜に灯る窓の図）
  const cv = document.createElement('canvas'); cv.width = cols * 16; cv.height = rows * 24; const x = cv.getContext('2d')
  x.fillStyle = lit ? '#000' : '#d8d2c6'; x.fillRect(0, 0, cv.width, cv.height)
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (lit) { if (R() < 0.42) { x.fillStyle = R() < 0.7 ? '#ffd9a0' : '#e8f0ff'; x.fillRect(c * 16 + 3, r * 24 + 5, 10, 11) } continue }
    x.fillStyle = '#5a6470'; x.fillRect(c * 16 + 3, r * 24 + 5, 10, 11) // 窓
    x.fillStyle = '#bdb6a8'; x.fillRect(c * 16, r * 24 + 16, 16, 3) // ベランダの手すり
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(c * 16, r * 24 + 19, 16, 5)
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = lit ? THREE.SRGBColorSpace : THREE.SRGBColorSpace; t.anisotropy = 8; return t
}
const houses = [], flats = [], trees = []
const camZ = 90, camX = RIVER.cx(camZ) + RIVER.hw(camZ) + 120
const BZ = V === 'B' ? -420 : -330 // 鉄橋の位置（駅は鉄橋のたもと）
const LEVEE_D = BANK + LEVEE * 1.6 + TOP + 4
// 道の線: 間隔をばらす（48〜118m）。太い道は2割
const roadXs = [], roadZs = []
for (let x = -980; x <= 980;) { roadXs.push({ v: x, wide: R() < 0.22 }); x += 48 + R() * 70 }
for (let z = -2150; z <= 300;) { roadZs.push({ v: z, wide: R() < 0.2 }); z += 42 + R() * 66 }
const rw = (r) => (r.wide ? 11 : 6.5)
const stX = RIVER.cx(BZ) + RIVER.hw(BZ) + LEVEE_D + 140, stZ = BZ + 30 // 駅前（高い建物が集まる）
const isTown = (x, z, m = 0) => zoneOf(x, z) === 'town' && zoneOf(x + m, z) === 'town' && zoneOf(x - m, z) === 'town' && zoneOf(x, z + m) === 'town' && zoneOf(x, z - m) === 'town' && !(SEA_Z != null && z < SEA_Z + 40)
const nearLevee = (x, z) => Math.abs(x - RIVER.cx(z)) - RIVER.hw(z) < LEVEE_D + 50
for (let i = 0; i < roadXs.length - 1; i++) for (let j = 0; j < roadZs.length - 1; j++) {
  const x0 = roadXs[i].v + rw(roadXs[i]) / 2 + 0.8, x1 = roadXs[i + 1].v - rw(roadXs[i + 1]) / 2 - 0.8
  const z0 = roadZs[j].v + rw(roadZs[j]) / 2 + 0.8, z1 = roadZs[j + 1].v - rw(roadZs[j + 1]) / 2 - 0.8, mid = (z0 + z1) / 2
  if (!isTown((x0 + x1) / 2, mid) && !isTown(x0, z0) && !isTown(x1, z1)) continue
  for (const [rz0, rz1, front] of [[z0, mid, z0], [mid, z1, z1]]) { // 背中合わせの2列。道に面する側へ建てる
    let x = x0
    while (x < x1 - 6) {
      const dist = Math.hypot(x - stX, front - stZ), tall = Math.exp(-dist / 380), lv = nearLevee(x, (rz0 + rz1) / 2)
      const r = R(), pM = 0.04 + tall * 0.35 + (lv ? 0.2 : 0)
      if (r < pM && x1 - x > 22) { // マンション（レンガ調タイル・ベージュ・白／階段状／駅前のタワー）
        const w = Math.min(x1 - x, 20 + R() * 32), d = Math.max(9, Math.min(rz1 - rz0 - 2, 10 + R() * 5)), xc = x + w / 2, zc = (rz0 + rz1) / 2
        if (isTown(xc, zc, w / 2) && Math.hypot(xc - camX, zc - camZ) > 45) {
          const sr = R(), style = sr < 0.4 ? 'brick' : sr < 0.72 ? 'beige' : 'white'
          let fl = 4 + Math.floor(R() * 8 + tall * 10)
          if (tall > 0.5 && R() < 0.3) fl = 20 + Math.floor(R() * 14)
          flats.push({ x: xc, z: zc, w, d, fl, style, step: fl < 18 && R() < 0.45, back: front === z0 ? 1 : -1, rot: (R() - 0.5) * 0.04 })
        }
        x += w + 2 + R() * 3; continue
      }
      if (r < pM + 0.1 && x1 - x > 16) { // 外階段のアパート（2〜3階）
        const w = 14 + R() * 6, d = Math.max(7, Math.min(rz1 - rz0 - 2, 8 + R() * 2)), xc = x + w / 2, zc = (rz0 + rz1) / 2
        if (isTown(xc, zc, w / 2) && Math.hypot(xc - camX, zc - camZ) > 30) flats.push({ x: xc, z: zc, w, d, fl: 2 + (R() < 0.4 ? 1 : 0), style: 'apa', step: false, back: 1, rot: 0 })
        x += w + 1.5; continue
      }
      const lw = 7.5 + R() * 5.5
      if (r > 0.93) { if (isTown(x + lw / 2, (rz0 + rz1) / 2)) trees.push({ x: x + lw / 2, z: (rz0 + rz1) / 2, s: 2.6 + R() * 2.2 }); x += lw; continue } // 庭・空き地
      const dmax = rz1 - rz0 - 1.5, hd = Math.min(dmax, 7 + R() * 4), sb = 1 + R() * Math.max(0.2, dmax - hd - 1)
      const zc = front === z0 ? rz0 + sb + hd / 2 : rz1 - sb - hd / 2, xc = x + lw / 2
      if (isTown(xc, zc, 4) && Math.hypot(xc - camX, zc - camZ) > 26) {
        const k = R(), three = k < 0.16 // 3階建ての細い家（2000年代の建売）
        houses.push({ x: xc, z: zc, w: lw - 1.2 - R() * 1.2, d: hd, h: three ? 8.6 : k < 0.3 ? 3.2 : 5.8 + R() * 0.8, rot: (R() - 0.5) * 0.05, flat: three ? R() < 0.7 : R() < 0.15, ridgeX: R() < 0.5 })
        if (R() < 0.3) trees.push({ x: xc + (R() - 0.5) * lw * 0.6, z: front === z0 ? rz0 + 0.8 : rz1 - 0.8, s: 1.5 + R() * 1.4 })
      }
      x += lw
    }
  }
}
// 堤防の上の並木（春は桜）
for (let z = -1800; z <= 240; z += 9 + R() * 4) for (const sgn of [-1, 1]) {
  if (SEA_Z != null && z < SEA_Z) continue
  const x = RIVER.cx(z) + sgn * (RIVER.hw(z) + BANK + LEVEE + TOP + 3)
  if (Math.hypot(x - camX, z - camZ) < 30) continue
  trees.push({ x, z, s: 4.2 + R() * 1.8, sakura: S === 'spring' })
}
// 壁の窓・屋根の瓦・マンションのベランダとタイルを、束ねた建物の1つずつの大きさから計算で描く（図を引き伸ばさない）
const windU = []
function facadeShader(mat, mode, opt = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLit = { value: TIME.lit }; sh.uniforms.uBrick = { value: opt.brick ? 1 : 0 }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP; varying vec3 vFN; varying vec3 vFS; varying float vFId;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 fsc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vFP = position * fsc; vFN = normal; vFS = fsc; vFId = fract(instanceMatrix[3].x * 0.1307 + instanceMatrix[3].z * 0.7113);`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP; varying vec3 vFN; varying vec3 vFS; varying float vFId; uniform float uLit; uniform float uBrick;\nfloat fh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }')
    let body = ''
    if (mode === 'wall') body = `
        float side = step(abs(vFN.y), 0.5);
        float u = abs(vFN.x) > 0.5 ? vFP.z : vFP.x, row = vFP.y;
        float span = 2.6 + vFId * 0.8, cu = fract(u / span + vFId * 3.1), fl = floor(row / 2.8), fr = fract(row / 2.8);
        float bWin = side * step(0.22, cu) * step(cu, 0.74) * step(0.34, fr) * step(fr, 0.8) * step(0.5, row) * step(row, vFS.y - 0.4);
        float sill = side * step(0.18, cu) * step(cu, 0.78) * step(0.3, fr) * step(fr, 0.34) * step(0.5, row) * step(row, vFS.y - 0.4);
        diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 1.4, row) * side + (1.0 - side));
        diffuseColor.rgb *= 0.93 + 0.07 * fh(floor(vec2(u * 2.0, row * 6.0)) + vFId);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.14, 0.16), bWin * 0.88);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85), sill * 0.6);
        float bLit = bWin * step(0.5, fh(vec2(fl, floor(u / span)) + vFId * 7.0)) * uLit;`
    else if (mode === 'flat') body = `
        float side = step(abs(vFN.y), 0.5), longF = step(0.5, abs(vFN.z));
        float u = abs(vFN.x) > 0.5 ? vFP.z : vFP.x, row = vFP.y;
        float fl = floor(row / 2.95), fr = fract(row / 2.95), unit = mix(3.4, 6.4, longF), cu = fract(u / unit + 0.5);
        float up = side * step(2.95, row) * step(row, vFS.y - 0.6);
        float bWin = up * step(0.38, fr) * step(fr, 0.93) * step(0.07, cu) * step(cu, mix(0.5, 0.9, longF));
        float balc = up * longF * step(fr, 0.34);
        float slab = up * longF * step(0.34, fr) * step(fr, 0.38);
        if (uBrick > 0.5) { float br = fract(row / 0.075), bc = fract(u / 0.23 + step(0.5, fract(row / 0.15)) * 0.5);
          diffuseColor.rgb *= mix(1.0, 0.78, max(step(br, 0.14), step(bc, 0.07)));
          diffuseColor.rgb *= 0.88 + 0.22 * fh(floor(vec2(u / 0.23, row / 0.075)) + vFId); }
        else diffuseColor.rgb *= 0.95 + 0.05 * fh(floor(vec2(u * 1.5, row * 1.5)) + vFId);
        diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 2.0, row) * side + (1.0 - side));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.12, 0.14), bWin * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.66, 0.7), balc * 0.75);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.8), slab * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.5, 0.5), 1.0 - side);
        float bLit = bWin * step(0.48, fh(vec2(fl, floor(u / unit)) + vFId * 7.0)) * uLit;`
    else body = `
        float t1 = fract(vFP.y / 0.32); diffuseColor.rgb *= 0.72 + 0.28 * smoothstep(0.0, 0.18, t1);
        diffuseColor.rgb *= 0.9 + 0.1 * fh(floor(vec2(vFP.z / 0.3, vFP.y / 0.32)) + vFId); float bWin = 0.0, bLit = 0.0;`
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>' + body)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, bWin);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bLit * vec3(1.0, 0.74, 0.46) * 1.8;')
  }
  return mat
}
const WALL = [0xddd6c8, 0xcfc6b4, 0xe8e4da, 0xbcae98, 0xc8ccd0, 0xd4c8b0, 0x9a8a78, 0xa8b0b4, 0xe2d8c0, 0x8a7a6a, 0xc4b8a0, 0xb8b4a8]
const ROOF = [0x4a4f57, 0x5a6878, 0x4e463e, 0x6a5444, 0x3e444c, 0x7a6a5a, 0x2e3238]
{
  const body = new THREE.InstancedMesh(bodyGeo, facadeShader(new THREE.MeshStandardMaterial({ roughness: 0.9 }), 'wall'), houses.length)
  const roof = new THREE.InstancedMesh(roofGeo, facadeShader(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }), 'roof'), houses.length)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0)
  houses.forEach((hs, i) => {
    const y = groundH(hs.x, hs.z) - 0.3; q.setFromAxisAngle(up, hs.rot)
    const bh = hs.flat ? hs.h + 0.6 : hs.h
    m.compose(new THREE.Vector3(hs.x, y, hs.z), q, new THREE.Vector3(hs.w, bh + 0.3, hs.d)); body.setMatrixAt(i, m)
    body.setColorAt(i, c.setHex(WALL[Math.floor(R() * WALL.length)]).offsetHSL(0, 0, (R() - 0.5) * 0.06))
    const rq = new THREE.Quaternion().setFromAxisAngle(up, hs.rot + (hs.ridgeX ? Math.PI / 2 : 0))
    if (hs.flat) m.compose(new THREE.Vector3(hs.x, y + bh + 0.3, hs.z), rq, new THREE.Vector3(0.001, 0.001, 0.001))
    else m.compose(new THREE.Vector3(hs.x, y + bh + 0.3, hs.z), rq, hs.ridgeX ? new THREE.Vector3(hs.d * 1.12, 2.2 + R() * 0.8, hs.w * 1.08) : new THREE.Vector3(hs.w * 1.12, 2.2 + R() * 0.8, hs.d * 1.08))
    roof.setMatrixAt(i, m); roof.setColorAt(i, c.setHex(W === 'snow' ? 0xf0f2f4 : ROOF[Math.floor(R() * ROOF.length)]).offsetHSL(0, 0, (R() - 0.5) * 0.05))
  })
  for (const o of [body, roof]) { o.castShadow = o.receiveShadow = true; scene.add(o) }
}
{ // マンション: 段（階段状は3段で上ほど奥へ引っ込む）を1つずつの箱にし、レンガ調と無地で束を分ける
  const tiers = { brick: [], plain: [] }, tops = []
  const COL = { brick: [0x9a5a44, 0x8a5240, 0xa86a50, 0x7e4a3a], beige: [0xd8c8a8, 0xcbb894, 0xe0d4bc], white: [0xe8e6e0, 0xdcdcd8], apa: [0xd0cabc, 0xc4c8c8, 0xd8d0c0] }
  for (const f of flats) {
    const y0 = groundH(f.x, f.z) - 0.3, col = COL[f.style][Math.floor(R() * COL[f.style].length)], list = f.style === 'brick' ? tiers.brick : tiers.plain
    const parts = f.step ? [[0, Math.ceil(f.fl * 0.5), 1], [Math.ceil(f.fl * 0.5), Math.ceil(f.fl * 0.8), 0.74], [Math.ceil(f.fl * 0.8), f.fl, 0.5]] : [[0, f.fl, 1]]
    for (const [a, b, k] of parts) { if (b <= a) continue
      const d = f.d * k, zc = f.z - f.back * (f.d - d) / 2
      list.push({ x: f.x, y: y0 + a * 2.95, z: zc, w: f.w, h: (b - a) * 2.95 + 0.6, d, rot: f.rot, col }) }
    if (f.fl > 3) tops.push({ x: f.x + (R() - 0.5) * f.w * 0.5, y: y0 + f.fl * 2.95 + 0.6, z: f.z - f.back * f.d * (f.step ? 0.25 : 0) })
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color()
  for (const [key, list] of Object.entries(tiers)) {
    if (!list.length) continue
    const im = new THREE.InstancedMesh(bodyGeo, facadeShader(new THREE.MeshStandardMaterial({ roughness: 0.82 }), 'flat', { brick: key === 'brick' }), list.length)
    list.forEach((t, i) => { q.setFromAxisAngle(up, t.rot); m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.w, t.h, t.d)); im.setMatrixAt(i, m); im.setColorAt(i, c.setHex(t.col)) })
    im.castShadow = im.receiveShadow = true; scene.add(im)
  }
  const tm = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.9 }), Math.max(1, tops.length))
  tops.forEach((t, i) => { m.compose(new THREE.Vector3(t.x, t.y, t.z), q.identity(), new THREE.Vector3(4 + R() * 3, 3, 4)); tm.setMatrixAt(i, m) })
  tm.count = tops.length; tm.castShadow = true; scene.add(tm)
}
{ // 木: 葉の小片を150枚重ねた樹冠（葉の図は計算で描く）＋奥の暗い芯＋幹。風で枝ごとに揺れ、葉先がそよぐ
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d')
  for (let k = 0; k < 26; k++) { const px = 10 + R() * 108, py = 10 + R() * 108, a = R() * 6.283, l = 7 + R() * 9
    x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = 'rgb(' + (200 + R() * 55 | 0) + ',' + (200 + R() * 55 | 0) + ',' + (190 + R() * 40 | 0) + ')'; x.beginPath(); x.ellipse(0, 0, l, l * 0.42, 0, 0, 6.283); x.fill()
    x.strokeStyle = 'rgba(120,120,110,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-l, 0); x.lineTo(l, 0); x.stroke(); x.restore() }
  const leafTex = new THREE.CanvasTexture(cv); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4
  const quads = [], lobes = []; for (let k = 0; k < 5; k++) lobes.push([(R() - 0.5) * 0.9, (R() - 0.3) * 0.6, (R() - 0.5) * 0.9, 0.5 + R() * 0.3])
  for (let k = 0; k < 150; k++) {
    const [lx, ly, lz, lr] = lobes[k % lobes.length], u = R() * 2 - 1, th = R() * 6.283, rr = lr * Math.cbrt(R())
    const p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), u * 0.8, Math.sqrt(1 - u * u) * Math.sin(th)).multiplyScalar(rr).add(new THREE.Vector3(lx, ly, lz))
    const g = new THREE.PlaneGeometry(0.62, 0.62); g.rotateX(R() * 6.283); g.rotateY(R() * 6.283); g.translate(p.x, p.y, p.z)
    const n = p.clone().normalize(), na = g.attributes.normal; for (let i = 0; i < na.count; i++) na.setXYZ(i, n.x, n.y, n.z)
    quads.push(g)
  }
  const cardGeo = BGU.mergeGeometries(quads)
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 })
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; sh.uniforms.uWind = { value: W === 'rain' ? 1.6 : 1.0 }; windU.push(sh.uniforms.uTime)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz; float hh = clamp(position.y + 0.9, 0.0, 2.0);
        float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.013 + ip.z * 0.011);
        float sway = (sin(uTime * 1.25 + ip.x * 0.05 + ip.z * 0.04) * 0.07 + sin(uTime * 2.3 + ip.x * 0.11) * 0.03) * gust;
        transformed.x += sway * hh * uWind; transformed.z += sway * 0.55 * hh * uWind;
        float ph = dot(position, vec3(12.9, 78.2, 37.7));
        transformed += normal * sin(uTime * 8.0 + ph) * 0.035 * gust * uWind;`)
  }
  const crown = new THREE.InstancedMesh(cardGeo, leafMat, trees.length)
  const core = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.72, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), trees.length)
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.18, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 }), trees.length)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0)
  trees.forEach((t, i) => {
    const y = groundH(t.x, t.z); q.setFromAxisAngle(up, R() * 6.283)
    const s = new THREE.Vector3(t.s * (0.9 + R() * 0.25), t.s * (0.8 + R() * 0.3), t.s * (0.9 + R() * 0.25))
    m.compose(new THREE.Vector3(t.x, y + t.s * 1.15, t.z), q, s); crown.setMatrixAt(i, m); core.setMatrixAt(i, m)
    const base = t.sakura ? LEAF[0] : (R() < 0.7 ? LEAF[0] : LEAF[1])
    c.setHex(W === 'snow' && !t.sakura ? 0xdfe4e6 : base).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.1, (R() - 0.5) * 0.08)
    crown.setColorAt(i, c); core.setColorAt(i, c.clone().multiplyScalar(0.42))
    m.compose(new THREE.Vector3(t.x, y, t.z), q, new THREE.Vector3(t.s * 0.9, t.s * 1.3, t.s * 0.9)); trunk.setMatrixAt(i, m)
  })
  crown.castShadow = crown.receiveShadow = true; core.castShadow = true; trunk.castShadow = true; scene.add(crown, core, trunk)
}

// ── 鉄橋（トラスの橋と、渡る電車）と、道路の橋 ──
const train = new THREE.Group()
{
  const bz = BZ, cx = RIVER.cx(bz), span = (RIVER.hw(bz) + BANK + LEVEE + TOP + 6) * 2, deckY = 11
  const steel = new THREE.MeshStandardMaterial({ color: V === 'A' ? 0x7a3a2a : 0x4a5a5e, roughness: 0.55, metalness: 0.6 })
  const parts = []
  const add = (w, h, d, x, y, z, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); g.translate(x, y, z); parts.push(g) }
  add(span, 0.9, 9, 0, deckY, 0) // 床
  const panel = 12
  for (const sz of [-4.3, 4.3]) {
    add(span, 0.6, 0.6, 0, deckY + 7, sz) // 上弦
    for (let x = -span / 2; x <= span / 2 + 0.1; x += panel) { add(0.5, 7, 0.5, x, deckY + 3.5, sz); if (x + panel <= span / 2 + 0.1) add(0.4, Math.hypot(panel, 7), 0.4, x + panel / 2, deckY + 3.5, sz, Math.atan2(7, panel) * ((Math.round(x / panel) % 2) ? 1 : -1) + Math.PI / 2) }
  }
  for (let x = -span / 2 + panel; x < span / 2; x += panel * 2) add(0.5, 0.5, 8.6, x, deckY + 7, 0)
  for (let x = -span / 2 + 30; x < span / 2 - 10; x += 34) add(4, deckY + 6, 7, x, (deckY - 6) / 2, 0) // 橋脚
  const g = BGU.mergeGeometries(parts); const br = new THREE.Mesh(g, steel); br.position.set(cx, 0, bz); br.castShadow = br.receiveShadow = true; scene.add(br)
  const carMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.5 }), band = new THREE.MeshStandardMaterial({ color: 0x2a7a4a, roughness: 0.5 })
  for (let k = 0; k < 8; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(19.5, 3.4, 2.9), carMat); c.position.set(k * 20.2, deckY + 2.3, 0); c.castShadow = true; train.add(c); const b = new THREE.Mesh(new THREE.BoxGeometry(19.6, 0.4, 3.0), band); b.position.set(k * 20.2, deckY + 1.6, 0); train.add(b)
    if (TIME.lit > 0.3) { const w = new THREE.Mesh(new THREE.BoxGeometry(17, 1.0, 3.05), new THREE.MeshBasicMaterial({ color: 0xfff0d0 })); w.position.set(k * 20.2, deckY + 2.8, 0); train.add(w) } }
  train.position.set(cx, 0, bz); train.userData = { cx, span }; scene.add(train)
  // 手前の道路の橋（低い桁橋）
  const rz = 40, rcx = RIVER.cx(rz), rspan = (RIVER.hw(rz) + BANK + 4) * 2
  const rb = new THREE.Mesh(new THREE.BoxGeometry(rspan, 1.6, 14), new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 0.8 })); rb.position.set(rcx, 7.4, rz); rb.castShadow = rb.receiveShadow = true; scene.add(rb)
  for (let x = -rspan / 2 + 20; x < rspan / 2 - 10; x += 30) { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 8, 10), rb.material); p.position.set(rcx + x, 3, rz); scene.add(p) }
}

// ── 道路（ばらした間隔の道のアスファルトと白線）・電柱と電線・岸の葦 ──
{
  const roads = [], lines = [], poles = [], wires = []
  const near = (x, z) => Math.hypot(x - camX, z - camZ) < 1100
  roadXs.forEach((r, ix) => { for (let z = -2150; z <= 300; z += 12) { if (!isTown(r.v, z)) continue; const y = groundH(r.v, z) + 0.06
    const g = new THREE.PlaneGeometry(rw(r), 12.2); g.rotateX(-Math.PI / 2); g.translate(r.v, y, z); roads.push(g)
    if (r.wide) { const l = new THREE.PlaneGeometry(0.18, 6); l.rotateX(-Math.PI / 2); l.translate(r.v, y + 0.02, z); lines.push(l) }
    if (near(r.v, z) && Math.round(z / 12) % 3 === 0) poles.push([r.v + rw(r) / 2 + 0.6, y, z, 'x', ix]) } })
  roadZs.forEach((r, iz) => { for (let x = -980; x <= 980; x += 12) { if (!isTown(x, r.v)) continue; const y = groundH(x, r.v) + 0.07
    const g = new THREE.PlaneGeometry(12.2, rw(r)); g.rotateX(-Math.PI / 2); g.translate(x, y, r.v); roads.push(g)
    if (r.wide) { const l = new THREE.PlaneGeometry(6, 0.18); l.rotateX(-Math.PI / 2); l.translate(x, y + 0.02, r.v); lines.push(l) }
    if (near(x, r.v) && Math.round(x / 12) % 3 === 0) poles.push([x, y, r.v + rw(r) / 2 + 0.6, 'z', iz]) } })
  if (roads.length) { const m = new THREE.Mesh(BGU.mergeGeometries(roads), new THREE.MeshStandardMaterial({ color: W === 'rain' ? 0x3a3c40 : 0x5a5a5c, roughness: W === 'rain' ? 0.25 : 0.92, metalness: 0 })); m.receiveShadow = true; scene.add(m) }
  if (lines.length) scene.add(new THREE.Mesh(BGU.mergeGeometries(lines), new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.8 })))
  // 電柱（コンクリートの柱＋腕木）と、隣の柱へ垂れる電線3本
  const pg = new THREE.CylinderGeometry(0.16, 0.22, 11, 6).translate(0, 5.5, 0), ag = new THREE.BoxGeometry(1.8, 0.12, 0.12).translate(0, 9.6, 0)
  const pm = new THREE.InstancedMesh(BGU.mergeGeometries([pg, ag]), new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.85 }), poles.length)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
  poles.forEach((p, i) => { q.setFromAxisAngle(up, p[3] === 'x' ? Math.PI / 2 : 0); m4.compose(new THREE.Vector3(p[0], p[1], p[2]), q, new THREE.Vector3(1, 1, 1)); pm.setMatrixAt(i, m4) })
  pm.castShadow = true; scene.add(pm)
  const key = (p) => p[3] + ':' + p[4], groups = new Map(); poles.forEach((p) => { if (!groups.has(key(p))) groups.set(key(p), []); groups.get(key(p)).push(p) })
  for (const list of groups.values()) {
    list.sort((a, b) => (a[3] === 'x' ? a[2] - b[2] : a[0] - b[0]))
    for (let i = 0; i < list.length - 1; i++) { const a = list[i], b = list[i + 1]; if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 40) continue
      for (const off of [-0.8, 0, 0.8]) { const ox = a[3] === 'x' ? off : 0, oz = a[3] === 'x' ? 0 : off
        for (let k = 0; k < 8; k++) { const t0 = k / 8, t1 = (k + 1) / 8, sag = (t) => -1.1 * 4 * t * (1 - t)
          wires.push(lerp(a[0], b[0], t0) + ox, lerp(a[1], b[1], t0) + 9.6 + sag(t0), lerp(a[2], b[2], t0) + oz, lerp(a[0], b[0], t1) + ox, lerp(a[1], b[1], t1) + 9.6 + sag(t1), lerp(a[2], b[2], t1) + oz) } } }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3))
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2a2c, transparent: true, opacity: 0.7 })))
  // 岸の葦（水際に沿って細い葉の束）
  const reeds = []
  for (let z = -1500; z <= 220; z += 1.4) for (const sgn of [-1, 1]) {
    if (SEA_Z != null && z < SEA_Z) continue
    if (fbm(z * 0.02, sgn * 3) < 0.42) continue
    const x = RIVER.cx(z) + sgn * (RIVER.hw(z) + 1.5 + R() * 3.5); reeds.push([x, groundH(x, z), z + (R() - 0.5), 1.2 + R() * 1.4])
  }
  const rg = new THREE.ConeGeometry(0.35, 1, 4).translate(0, 0.5, 0)
  const rm = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ roughness: 1 }), reeds.length), c = new THREE.Color()
  const RC = { spring: 0x7a9a50, summer: 0x5f8a3a, autumn: 0xb09a5a, winter: 0x9a8a6a }[S]
  reeds.forEach((r, i) => { m4.compose(new THREE.Vector3(r[0], r[1] - 0.2, r[2]), q.identity(), new THREE.Vector3(1, r[3], 1)); rm.setMatrixAt(i, m4); rm.setColorAt(i, c.setHex(RC).offsetHSL(0, 0, (R() - 0.5) * 0.12)) })
  rm.receiveShadow = true; scene.add(rm)
}

// ── 夜と夕方の灯り（街灯と窓の灯りの粒） ──
if (TIME.lit > 0.3) {
  const pts = []
  for (let z = -1700; z <= 220; z += 18) for (const sgn of [-1, 1]) { const x = RIVER.cx(z) + sgn * (RIVER.hw(z) + BANK + LEVEE + TOP / 2); pts.push(x, groundH(x, z) + 6, z) }
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(0.2, 'rgba(255,210,150,0.6)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: TIME.lit })))
}

// ── 遠くの山並み（霞に溶ける） ──
{
  const pts = []; for (let i = 0; i <= 160; i++) { const a = Math.PI * (0.05 + i / 160 * 0.9), r = 3800; const h = 60 + fbm(i * 0.08, 3) * 260; pts.push([Math.cos(a) * r, h, -Math.sin(a) * r - 600]) }
  const pos = []; for (let i = 0; i < pts.length - 1; i++) { const [x0, h0, z0] = pts[i], [x1, h1, z1] = pts[i + 1]; pos.push(x0, -10, z0, x1, -10, z1, x1, h1, z1, x0, -10, z0, x1, h1, z1, x0, h0, z0) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals()
  if (SEA_Z == null || V !== 'C') scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(TIME.fog).lerp(new THREE.Color(0x6a7a88), 0.28), side: THREE.DoubleSide, fog: false })))
}

// ── 雨（細い線の粒） ──
let rain = null
if (W === 'rain') {
  const n = LOW ? 3000 : 9000, p = new Float32Array(n * 6)
  for (let i = 0; i < n; i++) { const x = (R() - 0.5) * 160, y = R() * 90, z = -R() * 160; p.set([x, y, z, x - 0.2, y - 2.2, z], i * 6) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d2dc, transparent: true, opacity: 0.32, fog: false })); scene.add(rain)
}

// ── 目（角部屋の窓。川の右岸の高い建物の上から、下流を見下ろす） ──
const look = { yaw: +(Q.get('yaw') || 0), pitch: +(Q.get('pitch') || 0) }
const eye = new THREE.Vector3(camX - (Q.has('eh') ? 70 : 0), +(Q.get('eh') || 54), camZ - (Q.has('eh') ? 60 : 0))
const tgt0 = new THREE.Vector3(RIVER.cx(-260) - (V === 'B' ? 40 : 20), 4, -260)
camera.position.copy(eye)
function aim() { const dir = tgt0.clone().sub(eye).normalize(); const yaw0 = Math.atan2(dir.x, -dir.z), pitch0 = Math.asin(dir.y)
  const y = yaw0 + look.yaw, p = pitch0 + look.pitch; camera.lookAt(eye.x + Math.sin(y) * Math.cos(p), eye.y + Math.sin(p), eye.z - Math.cos(y) * Math.cos(p)) }
aim()
sunL.target.position.set(eye.x - 100, 0, eye.z - 250); sunL.position.copy(sunL.target.position).add(sunDir.clone().multiplyScalar(900))

// ── 後処理（明るい所のにじみを少し・最後に色の出力） ──
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
if (!LOW && T === 'night' && !Q.has('nb')) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), T === 'night' ? 0.55 : 0.14, 0.5, T === 'night' ? 0.6 : 0.97))
composer.addPass(new OutputPass())

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight) })
let last = performance.now(), frames = 0, t0 = performance.now()
window.__b16 = { renderer, scene, camera, ready: false, fps: 0, counts: { houses: houses.length, flats: flats.length, trees: trees.length } }
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  water.material.uniforms.time.value += dt * 0.35
  for (const u of windU) u.value = now / 1000
  const { cx, span } = train.userData; const tt = ((now / 1000) * 14) % (span * 2.6) - span * 1.3 - 160; train.position.x = cx + tt
  if (rain) { rain.position.copy(camera.position).add(new THREE.Vector3(0, -40, 0)); rain.position.y -= ((now / 1000) * 60) % 4 }
  renderer.info.reset(); composer.render()
  frames++; if (now - t0 > 2000) { window.__b16.fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now; window.__b16.ready = true }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
