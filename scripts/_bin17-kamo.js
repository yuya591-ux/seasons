// 便17（鴨川の質の見本）の試作。本体（src）とは切り離した1枚のページ。作りは便16 の試作（_bin16-river.js）と同じ（空・霞・水面・太陽・後処理）。
// 形は地図のデータ（_bin17-build.mjs が作った原点からのメートル・経緯度なし）:
//   地形と山＝国土地理院の標高（5m・10m）を加工／建物＝PLATEAU 京都市 LOD2（2025年度）を加工／川・道・橋・森＝OpenStreetMap
// 使い方: /seasons/scripts/_bin17-kamo.html?v=2|3&view=window|bank|walk&t=morning|noon|dusk|night&s=spring|summer|autumn|winter[&q=low]
//   v=2 … 地図の形＋計算だけ（陰りは画面の後処理で計算）
//   v=3 … 地図の形＋Blender で焼いた光の回り方（_bin17-bake.py）＋写真から作った CC0 の質感の素材（_bin16-tex・手元だけ）
import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const Q = new URLSearchParams(location.search)
const V = Q.get('v') || '3', VIEW = Q.get('view') || 'bank', T = Q.get('t') || 'dusk', S = Q.get('s') || 'autumn'
const LOW = Q.get('q') === 'low'
const BAKE = V === '3' && !Q.has('nobake'), TEX = V === '3' && !Q.has('notex')
let seed = 20261103
const R = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const hash = (n) => { const s = Math.sin(n * 127.1 + 17.3) * 43758.5453; return s - Math.floor(s) }

// ── 時刻と季節（便16 の試作と同じ値。太陽の向きだけ京都の夕方に合わせて西南西） ──
const TIME = {
  morning: { el: 7, az: 115, turb: 6, ray: 1.6, exp: 0.42, sun: 0xffe2c0, sunI: 2.4, hemi: [0xbfd2e6, 0x5a5040, 0.55], fog: 0xd2d6da, fogD: 0.00018 },
  noon: { el: 38, az: 0, turb: 3.5, ray: 1.0, exp: 0.32, sun: 0xfff6ea, sunI: 3.2, hemi: [0xcfe0f2, 0x6a6050, 0.7], fog: 0xc6d4e2, fogD: 0.00014 },
  dusk: { el: 4.5, az: 290, turb: 5.5, ray: 1.3, exp: 0.4, sun: 0xffa66a, sunI: 2.0, hemi: [0xa8a8c8, 0x403028, 0.45], fog: 0xc6b2a6, fogD: 0.00016 },
  night: { el: -12, az: 220, turb: 2, ray: 0.6, exp: 0.55, sun: 0x8ea6d0, sunI: 0.25, hemi: [0x2a3550, 0x0c0c12, 0.35], fog: 0x1c2232, fogD: 0.0002 },
}[T]
if (Q.has('saz')) TIME.az = +Q.get('saz')
// 太陽の向き: 京都の秋の昼は南（three の向きの角度で 0）・日の入りは西南西（290）。x 東・z 南
const LEAF = { spring: [0xe8b8c8, 0x7fa05c], summer: [0x3f6a34, 0x5a8040], autumn: [0xb8622e, 0x6e7a3a], winter: [0x4a5a44, 0x55604a] }[S]
const GRASS = { spring: 0x6f8f4a, summer: 0x557a34, autumn: 0x8a8048, winter: 0x8a8466 }[S]

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
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 1, 26000)

const sky = new Sky(); sky.scale.setScalar(24000)
const su = sky.material.uniforms
su.turbidity.value = TIME.turb; su.rayleigh.value = TIME.ray; su.mieCoefficient.value = 0.0022; su.mieDirectionalG.value = 0.86
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - TIME.el), THREE.MathUtils.degToRad(TIME.az))
su.sunPosition.value.copy(sunDir)
scene.add(sky)
const pmrem = new THREE.PMREMGenerator(renderer)
{ const envScene = new THREE.Scene(); const s2 = new Sky(); s2.scale.setScalar(8000); s2.material.uniforms.sunPosition.value.copy(sunDir); for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = su[k].value; envScene.add(s2)
  scene.environment = pmrem.fromScene(envScene, 0, 1, 10000).texture; scene.environmentIntensity = T === 'night' ? 0.25 : 0.8 }
const sunL = new THREE.DirectionalLight(TIME.sun, TIME.sunI)
sunL.castShadow = !LOW && T !== 'night'
sunL.shadow.mapSize.set(4096, 4096)
Object.assign(sunL.shadow.camera, { left: -520, right: 520, top: 520, bottom: -520, near: 10, far: 3000 })
sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.6
scene.add(sunL); scene.add(sunL.target)
scene.add(new THREE.HemisphereLight(...TIME.hemi))

// ── 地図のデータを読む ──
const geo = await (await fetch('./kamo/_data/geo/geo.json')).json()
const ab = async (p) => (await fetch(p)).arrayBuffer()
const [nearB, farB, roadsB, treesB, waterB, bldgB, zoneB, stonesB] = await Promise.all(['geo/near.bin', 'geo/far.bin', 'geo/roads.bin', 'geo/trees.bin', 'geo/water.bin', 'bake/bldg_baked.bin', 'geo/near-zone.bin', 'geo/stones.bin'].map((p) => ab('./kamo/_data/' + p)))
const WY = geo.waterY, NR = geo.near.R
const texLoader = new THREE.TextureLoader()
const loadLM = (p) => { const t = texLoader.load(p); t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; t.flipY = true; return t }
const LM_T = BAKE ? loadLM('./kamo/_data/bake/lm_terrain.png') : null
const LM_B = BAKE ? loadLM('./kamo/_data/bake/lm_bldg.png') : null

// 焼いた光（空の光の届き方＋照り返し）を、空と照り返しの光（間接の光）にだけ掛ける。開けた所＝1.0
function useBake(mat, tex) {
  mat.aoMap = tex; mat.aoMapIntensity = 1
  mat.onBeforeCompile = chain(mat.onBeforeCompile, (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', AOFRAG) })
  addKey(mat, 'bake')
}
// 差し込みを重ねた材質は、シェーダーの見分けの鍵を足していく（同じ形の関数の文字で、別の材質のシェーダーが使い回されないように）
function addKey(mat, k) { mat.userData.key = (mat.userData.key || '') + '|' + k; mat.customProgramCacheKey = () => mat.userData.key }
const AOFRAG = `#ifdef USE_AOMAP
  float ambientOcclusion = clamp( texture2D( aoMap, vAoMapUv ).r * 1.25, 0.0, 1.25 );
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, min( ambientOcclusion, 1.0 ), material.roughness );
  #endif
#endif`
function chain(prev, next) { return (sh, r) => { if (prev) prev(sh, r); next(sh, r) } }

// 写真から作った CC0 の質感の素材（Poly Haven）。色は頂点の色を保ち、写真の模様だけを足す（便16 の見本と同じ考え）
const texCache = new Map(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
function texKit(name) {
  if (texCache.has(name)) return texCache.get(name)
  const avg = new THREE.Vector3(0.5, 0.5, 0.5)
  const ld = (k, srgb) => { const t = texLoader.load(`./_bin16-tex/${name}_${k}.jpg`, (tx) => { if (k !== 'd') return; const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(tx.image, 0, 0, 16, 16); const p = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0; for (let i = 0; i < p.length; i += 4) { r += (p[i] / 255) ** 2.2; g += (p[i + 1] / 255) ** 2.2; b += (p[i + 2] / 255) ** 2.2 } const n = p.length / 4; avg.set(r / n, g / n, b / n) }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t }
  const k = { d: ld('d', true), n: ld('n', false), avg }; texCache.set(name, k); return k
}
// mode: 'xz'＝真上から（地面・屋根） 'tri'＝3方向から（壁）。b を渡すと、頂点の色の緑みで a と b を混ぜる（草と砂利）
function useTex(mat, { a, b = null, tile = 4, tileB = 0, mode = 'xz', ns = 0.8 }) {
  const A = texKit(a), B = b ? texKit(b) : A, key = `${a}|${b}|${mode}`
  mat.onBeforeCompile = chain(mat.onBeforeCompile, (sh) => {
    Object.assign(sh.uniforms, { uTA: { value: A.d }, uTAN: { value: A.n }, uTAavg: { value: A.avg }, uTB: { value: B.d }, uTBN: { value: B.n }, uTBavg: { value: B.avg }, uTile: { value: tile }, uTileB: { value: tileB || tile } })
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; varying vec3 vGN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz; vGN = normalize(mat3(modelMatrix) * objectNormal);')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGW; varying vec3 vGN; uniform sampler2D uTA, uTAN, uTB, uTBN; uniform vec3 uTAavg, uTBavg; uniform float uTile, uTileB;
vec2 tUV(float tl) { ${mode === 'tri' ? 'vec3 an = abs(vGN); return an.x > an.z ? vec2(vGW.z, vGW.y) / tl : vec2(vGW.x, vGW.y) / tl;' : 'return vGW.xz / tl;'} }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  ${b ? 'float gmix = smoothstep(0.015, 0.06, diffuseColor.g - (diffuseColor.r + diffuseColor.b) * 0.5);' : 'float gmix = 0.0;'}
  vec2 tuvA = tUV(uTile), tuvB = tUV(uTileB);
  vec3 detA = clamp(texture2D(uTA, tuvA).rgb / max(uTAavg, vec3(0.02)), 0.0, 2.2), detB = clamp(texture2D(uTB, tuvB).rgb / max(uTBavg, vec3(0.02)), 0.0, 2.2);
  diffuseColor.rgb *= mix(detA, detB, gmix);
  vec2 tuv = gmix > 0.5 ? tuvB : tuvA;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition); vec2 st0 = dFdx(tuv), st1 = dFdy(tuv);
    vec3 N0 = normal; vec3 q1p = cross(q1, N0), q0p = cross(N0, q0);
    vec3 T0 = q1p * st0.x + q0p * st1.x, B0 = q1p * st0.y + q0p * st1.y;
    float dt = max(dot(T0, T0), dot(B0, B0)); float sc = dt == 0.0 ? 0.0 : faceDirection * inversesqrt(dt);
    vec3 mN = (gmix > 0.5 ? texture2D(uTBN, tuv).xyz : texture2D(uTAN, tuv).xyz) * 2.0 - 1.0; mN.xy *= ${ns.toFixed(2)};
    normal = normalize(T0 * (mN.x * sc) + B0 * (mN.y * sc) + N0 * mN.z); }`)
  })
  addKey(mat, 'tex:' + key)
}

// 壁の窓（計算で描く・①の試作の窓と同じ考え）: 階は 3.0m・柱の間は 3.2m（住宅は 4.0m）。夕方と夜は一部が灯る
function useWindows(mat, tall) {
  mat.onBeforeCompile = chain(mat.onBeforeCompile, (sh) => {
    sh.uniforms.uLit = { value: { dusk: 0.22, night: 0.6 }[T] || 0 }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
varying vec3 vWW; varying vec3 vWN;`).replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWW; varying vec3 vWN; uniform float uLit;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  float winMask = 0.0; vec2 wcell = vec2(0.0);
  if (abs(vWN.y) < 0.3) {
    float hz = abs(vWN.x) > abs(vWN.z) ? vWW.z : vWW.x;
    vec2 g = vec2(hz / ${tall ? '3.2' : '4.0'}, (vWW.y + 0.4) / 3.0); wcell = floor(g); vec2 f = fract(g);
    winMask = step(${tall ? '0.16' : '0.28'}, f.x) * step(f.x, ${tall ? '0.84' : '0.72'}) * step(0.32, f.y) * step(f.y, ${tall ? '0.8' : '0.72'});
    winMask *= step(0.25, wHash(wcell + floor(vWW.xz * 0.05))); // 窓の無い所も混ぜる
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.075), winMask * 0.9);
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.12, winMask);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += winMask * step(1.0 - uLit, wHash(wcell * 1.7 + 3.1)) * vec3(1.0, 0.72, 0.42) * 1.6;`)
  })
  addKey(mat, 'win' + (tall ? 'C' : 'P'))
}

// ── 地形（近く＝5m の標高・遠く＝10m の標高）。色は高さと傾きと水面からの高さで計算 ──
function gridGeo(pos, n) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const idx = new Uint32Array((n - 1) * (n - 1) * 6); let k = 0
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.set([a, c, b, b, c, d], k); k += 6 }
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals(); return g
}
const vn = (x, z) => { const s = Math.sin(x * 0.071 + z * 0.113) * 0.5 + Math.sin(x * 0.023 - z * 0.041) * 0.5; return s * 0.5 + 0.5 }
{
  const n = geo.near.n, g = gridGeo(new Float32Array(nearB), n), p = g.attributes.position, nr = g.attributes.normal, zone = new Uint8Array(zoneB)
  const col = new Float32Array(p.count * 3), uv1 = new Float32Array(p.count * 2), c = new THREE.Color()
  const cGrass = new THREE.Color(GRASS), cGravel = new THREE.Color(0x8a8272), cWet = new THREE.Color(0x5e5a50), cWall = new THREE.Color(0x8c877c), cTown = new THREE.Color(0x8a867e)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nr.getY(i), h = y - WY, nz = vn(x, z)
    if (zone[i] === 2) c.copy(cWet).lerp(cGravel, 0.4) // 水面の下（浅い所の川底の石）
    else if (zone[i] === 1) { if (ny < 0.8) c.copy(cWall); else c.copy(cGrass).offsetHSL(0, 0, (nz - 0.5) * 0.1).lerp(cGravel, Math.max(0, 1 - Math.abs(h - 0.4)) * 0.6) } // 河川敷の草・水際の砂利・護岸
    else if (ny < 0.8) c.copy(cWall)
    else c.copy(cTown).lerp(cGrass, nz * 0.12) // 町の地面（道と建物の間）
    col.set([c.r, c.g, c.b], i * 3); uv1.set([(x + NR) / (2 * NR), (-z + NR) / (2 * NR)], i * 2)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2))
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  if (BAKE) useBake(m, LM_T)
  if (TEX) useTex(m, { a: 'gravel_road', b: 'grass_path_2', tile: 3.2, tileB: 3.5 })
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true; scene.add(mesh)
}
{
  const n = geo.far.n, g = gridGeo(new Float32Array(farB), n), p = g.attributes.position, nr = g.attributes.normal
  const col = new Float32Array(p.count * 3), c = new THREE.Color(), cCity = new THREE.Color(0x8a867f), cForest = new THREE.Color(S === 'autumn' ? 0x4e5a34 : S === 'winter' ? 0x3e4a3a : 0x34502e), cForest2 = new THREE.Color(S === 'autumn' ? 0x7a5a30 : 0x405e34)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nr.getY(i), forest = Math.min(1, Math.max(0, (y - 18) / 30) + Math.max(0, (0.97 - ny) * 8))
    c.copy(cCity).lerp(cForest, forest).lerp(cForest2, forest * vn(x * 0.3, z * 0.3) * 0.5); col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })); mesh.receiveShadow = true; scene.add(mesh)
}

// ── 道・小道・橋・線路（地形の焼いた光をそのまま使う） ──
{
  const nv = geo.roads.nv, ni = geo.roads.ni
  const pos = new Float32Array(roadsB, 0, nv * 3), idx = new Uint32Array(roadsB, nv * 12, ni), kind = new Uint8Array(roadsB, nv * 12 + ni * 4, nv)
  const P = Array.from(pos), I = Array.from(idx), K = Array.from(kind)
  for (let t = 0; t < ni; t += 6) { // 橋の床の両側に、下へ 1.5m の桁を足す
    const a = idx[t]; if (kind[a] !== 2) continue
    for (const [e0, e1] of [[a, a + 2], [a + 1, a + 3]]) { const b = P.length / 3; P.push(pos[e0 * 3], pos[e0 * 3 + 1], pos[e0 * 3 + 2], pos[e1 * 3], pos[e1 * 3 + 1], pos[e1 * 3 + 2], pos[e0 * 3], pos[e0 * 3 + 1] - 1.5, pos[e0 * 3 + 2], pos[e1 * 3], pos[e1 * 3 + 1] - 1.5, pos[e1 * 3 + 2]); K.push(4, 4, 4, 4); I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3) }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I)
  const col = new Float32Array(K.length * 3), uv1 = new Float32Array(K.length * 2), c = new THREE.Color()
  const CK = [0x55575a, 0xb0a690, 0x8d8a84, 0x6a5e52, 0x7c7a76]
  for (let i = 0; i < K.length; i++) { c.setHex(CK[K[i]]); col.set([c.r, c.g, c.b], i * 3); uv1.set([(P[i * 3] + NR) / (2 * NR), (-P[i * 3 + 2] + NR) / (2 * NR)], i * 2) }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); g.computeVertexNormals()
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide })
  if (BAKE) useBake(m, LM_T)
  if (TEX) useTex(m, { a: 'asphalt_02', tile: 5 })
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true; scene.add(mesh)
}

// ── 川の水面（OpenStreetMap の水面の形・映り込みは便16 と同じ Water） ──
function waterNormals(n = 256) {
  const waves = []; for (let k = 0; k < 18; k++) waves.push([Math.round((R() - 0.5) * 2 * (2 + k)), Math.round((R() - 0.5) * 2 * (2 + k)), R() * 6.283, 1 / (1 + k * 0.6)])
  const H = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let h = 0; for (const [fx, fy, ph, a] of waves) h += a * Math.sin(6.2832 * (fx * i + fy * j) / n + ph); H[j * n + i] = h }
  const d = new Uint8Array(n * n * 4)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const hx = H[j * n + (i + 1) % n] - H[j * n + (i - 1 + n) % n], hy = H[((j + 1) % n) * n + i] - H[((j - 1 + n) % n) * n + i]; const v = new THREE.Vector3(-hx * 0.9, -hy * 0.9, 1).normalize(); d.set([(v.x * 0.5 + 0.5) * 255, (v.y * 0.5 + 0.5) * 255, (v.z * 0.5 + 0.5) * 255, 255], (j * n + i) * 4) }
  const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t
}
let water
{
  const nv = geo.water.nv, ni = geo.water.ni, wp = new Float32Array(waterB, 0, nv * 3), wi = new Uint32Array(waterB, nv * 12, ni)
  const lp = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { lp[i * 3] = wp[i * 3]; lp[i * 3 + 1] = -wp[i * 3 + 2]; lp[i * 3 + 2] = wp[i * 3 + 1] - WY } // 水面の板の中の座標（回して y=WY に置く）
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(lp, 3)); g.setIndex(new THREE.BufferAttribute(wi, 1)); g.computeVertexNormals()
  water = new Water(g, { textureWidth: LOW ? 512 : 1024, textureHeight: LOW ? 512 : 1024, waterNormals: waterNormals(), sunDirection: sunDir.clone(), sunColor: T === 'night' ? 0x445066 : TIME.sun, waterColor: S === 'winter' ? 0x223238 : 0x2a3b38, distortionScale: 2.2, fog: true, alpha: 1 })
  water.material.side = THREE.DoubleSide
  water.rotation.x = -Math.PI / 2; water.position.y = WY; water.material.uniforms.size.value = 2.2
  scene.add(water)
}

// ── 建物（PLATEAU LOD2）。壁と屋根で分け、建物ごとに色を変える ──
{
  const f = new Float32Array(bldgB), n = f.length / 6
  const WALL = [0xddd6c8, 0xcfc6b4, 0xe8e4da, 0xbcae98, 0xc8ccd0, 0xd4c8b0, 0x9a8a78, 0xa8b0b4, 0xe2d8c0, 0x8a7a6a, 0xc4b8a0, 0xb8b4a8]
  const ROOF = [0x4a4f57, 0x5a6878, 0x4e463e, 0x6a5444, 0x3e444c, 0x7a6a5a, 0x2e3238]
  const groups = { wallP: [], wallC: [], roofT: [], roofF: [] }
  const H = geo.bldg.heights
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3()
  for (let t = 0; t < n; t += 3) {
    a.set(f[t * 6], f[t * 6 + 1], f[t * 6 + 2]); b.set(f[t * 6 + 6], f[t * 6 + 7], f[t * 6 + 8]); cc.set(f[t * 6 + 12], f[t * 6 + 13], f[t * 6 + 14])
    const nrm = b.clone().sub(a).cross(cc.clone().sub(a)).normalize(), bid = f[t * 6 + 5], h = H[bid] ?? 8
    const roof = Math.abs(nrm.y) > 0.45, tall = h > 12
    groups[roof ? (tall ? 'roofF' : 'roofT') : tall ? 'wallC' : 'wallP'].push(t)
  }
  const c = new THREE.Color()
  for (const [k, tris] of Object.entries(groups)) {
    const cnt = tris.length * 3, pos = new Float32Array(cnt * 3), uv1 = new Float32Array(cnt * 2), col = new Float32Array(cnt * 3)
    let o = 0
    for (const t of tris) for (let v = 0; v < 3; v++) {
      const s = (t + v) * 6, bid = f[s + 5]
      pos.set([f[s], f[s + 1], f[s + 2]], o * 3); uv1.set([f[s + 3], f[s + 4]], o * 2)
      if (k.startsWith('roof')) c.setHex(ROOF[Math.floor(hash(bid) * ROOF.length)]); else c.setHex(WALL[Math.floor(hash(bid + 0.5) * WALL.length)])
      col.set([c.r, c.g, c.b], o * 3); o++
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals()
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: k === 'roofT' ? 0.7 : 0.88, metalness: 0, side: THREE.DoubleSide })
    if (k.startsWith('wall')) useWindows(m, k === 'wallC')
    if (BAKE) useBake(m, LM_B)
    if (TEX) useTex(m, { roofT: { a: 'grey_roof_tiles', tile: 3, mode: 'xz' }, roofF: { a: 'concrete_wall_004', tile: 6, mode: 'xz', ns: 0.4 }, wallP: { a: 'grey_plaster_02', tile: 3, mode: 'tri', ns: 0.5 }, wallC: { a: 'concrete_wall_004', tile: 4, mode: 'tri', ns: 0.5 } }[k])
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh)
  }
}

// ── 木（OpenStreetMap の森・公園・木の点と、川岸の並木）。樹冠は便16 の試作と同じ「葉の小片150枚＋奥の暗い芯＋幹・風で揺れる」 ──
const windU = []
{
  const tr = new Float32Array(treesB), n = tr.length / 6
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d')
  for (let k = 0; k < 26; k++) { const px = 10 + R() * 108, py = 10 + R() * 108, a = R() * 6.283, l = 7 + R() * 9
    x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = 'rgb(' + (200 + R() * 55 | 0) + ',' + (200 + R() * 55 | 0) + ',' + (190 + R() * 40 | 0) + ')'; x.beginPath(); x.ellipse(0, 0, l, l * 0.42, 0, 0, 6.283); x.fill()
    x.strokeStyle = 'rgba(120,120,110,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-l, 0); x.lineTo(l, 0); x.stroke(); x.restore() }
  const leafTex = new THREE.CanvasTexture(cv); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4
  const quads = [], lobes = []; for (let k = 0; k < 5; k++) lobes.push([(R() - 0.5) * 0.9, (R() - 0.3) * 0.6, (R() - 0.5) * 0.9, 0.5 + R() * 0.3])
  for (let k = 0; k < (LOW ? 140 : 240); k++) {
    const [lx, ly, lz, lr] = lobes[k % lobes.length], u = R() * 2 - 1, th = R() * 6.283, rr = lr * Math.cbrt(R())
    const p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), u * 0.8, Math.sqrt(1 - u * u) * Math.sin(th)).multiplyScalar(rr).add(new THREE.Vector3(lx, ly, lz))
    const g = new THREE.PlaneGeometry(0.7, 0.7); g.rotateX(R() * 6.283); g.rotateY(R() * 6.283); g.translate(p.x, p.y, p.z)
    const nn = p.clone().normalize(), na = g.attributes.normal; for (let i = 0; i < na.count; i++) na.setXYZ(i, nn.x, nn.y, nn.z)
    quads.push(g)
  }
  const cardGeo = BGU.mergeGeometries(quads)
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 })
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; sh.uniforms.uWind = { value: 1.0 }; windU.push(sh.uniforms.uTime)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz; float hh = clamp(position.y + 0.9, 0.0, 2.0);
        float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.013 + ip.z * 0.011);
        float sway = (sin(uTime * 1.25 + ip.x * 0.05 + ip.z * 0.04) * 0.07 + sin(uTime * 2.3 + ip.x * 0.11) * 0.03) * gust;
        transformed.x += sway * hh * uWind; transformed.z += sway * 0.55 * hh * uWind;
        float ph = dot(position, vec3(12.9, 78.2, 37.7));
        transformed += normal * sin(uTime * 8.0 + ph) * 0.035 * gust * uWind;`)
  }
  const crown = new THREE.InstancedMesh(cardGeo, leafMat, n)
  const core = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), n)
  const trunkMat = new THREE.MeshStandardMaterial({ color: TEX ? 0xffffff : 0x4a3a2c, roughness: 1 }); if (TEX) { const k = texKit('japanese_zelkova_bark'); trunkMat.map = k.d; trunkMat.normalMap = k.n; k.d.repeat.set(1, 2); k.n.repeat.set(1, 2) }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.18, 1, 8).translate(0, 0.5, 0), trunkMat, n)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < n; i++) {
    const [tx, ty, tz, h, w, kind] = tr.subarray(i * 6, i * 6 + 6), sR = w * 0.5
    q.setFromAxisAngle(up, R() * 6.283)
    const sc = new THREE.Vector3(sR * (0.9 + R() * 0.25), Math.max(sR * 0.9, h * 0.36) * (0.85 + R() * 0.25), sR * (0.9 + R() * 0.25)) // 樹冠は低く大きく（幹が見えるのは下の 3〜4 割）
    m.compose(new THREE.Vector3(tx, ty + h - sc.y * 0.8, tz), q, sc); crown.setMatrixAt(i, m); core.setMatrixAt(i, m)
    const base = kind === 1 && S === 'spring' ? LEAF[0] : R() < (S === 'autumn' ? 0.55 : 0.3) ? LEAF[0] : LEAF[1]
    c.setHex(base).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.1, (R() - 0.5) * 0.08)
    crown.setColorAt(i, c); core.setColorAt(i, c.clone().multiplyScalar(0.28))
    m.compose(new THREE.Vector3(tx, ty, tz), q, new THREE.Vector3(sR * 0.7, h - sc.y * 0.9, sR * 0.7)); trunk.setMatrixAt(i, m)
  }
  crown.castShadow = crown.receiveShadow = true; core.castShadow = true; trunk.castShadow = true; scene.add(crown, core, trunk)
}

// ── 飛び石（鴨川デルタの亀と千鳥の石。形は計算で丸めた平たい石） ──
{
  const st = new Float32Array(stonesB), n = st.length / 4
  if (n) {
    const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * 0.62, Math.max(-0.2, y) * 0.32, z * 0.48) }
    g.computeVertexNormals()
    const m = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.85 })
    if (TEX) useTex(m, { a: 'concrete_wall_004', tile: 1.2, mode: 'tri', ns: 0.6 })
    const im = new THREE.InstancedMesh(g, m, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < n; i++) { q.setFromAxisAngle(up, st[i * 4 + 3]); m4.compose(new THREE.Vector3(st[i * 4], st[i * 4 + 1], st[i * 4 + 2]), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4) }
    im.castShadow = im.receiveShadow = true; scene.add(im)
  }
}

// ── 目（窓・土手・歩く）。向きは大文字山の少し左（デルタの先と高野川・左の端に比叡山） ──
const vw = geo.views[VIEW] || geo.views.bank
const yaw = THREE.MathUtils.degToRad(+(Q.get('yaw') ?? vw.yawDeg)), pitch = THREE.MathUtils.degToRad(+(Q.get('pitch') ?? { window: -7, bank: -3, walk: 1 }[VIEW] ?? -3))
camera.position.set(vw.x, vw.y, vw.z)
camera.lookAt(vw.x + Math.sin(yaw) * Math.cos(pitch), vw.y + Math.sin(pitch), vw.z - Math.cos(yaw) * Math.cos(pitch))
if (VIEW === 'top') { const r = +(Q.get('r') || 900); camera.position.set(+(Q.get('cx') || 0), r * 1.9, +(Q.get('cz') || 0) + 0.01); camera.lookAt(+(Q.get('cx') || 0), 0, +(Q.get('cz') || 0)) } // 調べ用: 真上から
const fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw))
sunL.target.position.copy(camera.position).addScaledVector(fwd, 380).setY(0); sunL.position.copy(sunL.target.position).add(sunDir.clone().multiplyScalar(1400))

// ── 後処理（②＝画面の陰りを計算する／③＝陰りは焼いた光にまかせる） ──
const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
if (!LOW && V === '2' && !Q.has('noao')) { const ao = new GTAOPass(scene, camera, innerWidth, innerHeight); ao.blendIntensity = 0.85; ao.updateGtaoMaterial({ radius: 2.5, distanceExponent: 1.5, scale: 1.2 }); composer.addPass(ao) }
composer.addPass(new OutputPass())
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight) })

let last = performance.now(), frames = 0, t0 = performance.now()
window.__b16 = { renderer, scene, camera, ready: false, fps: 0, counts: { bldgTris: geo.bldg.ni / 3, trees: geo.trees.n, view: VIEW, v: V } }
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  water.material.uniforms.time.value += dt * 0.35
  for (const u of windU) u.value = now / 1000
  renderer.info.reset(); composer.render()
  frames++; if (now - t0 > 2000) { window.__b16.fps = Math.round(frames * 1000 / (now - t0)); frames = 0; t0 = now; window.__b16.ready = true }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
