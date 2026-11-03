// 鴨川の町（角部屋の窓の外）。便18 で便17 の試作（scripts/_bin17-kamo.js）を本体の部品にした。
// 形は地図のデータ（scripts/kamo/pack.mjs が詰めた public/kamo/・原点＝出町柳の合流からのメートル・経緯度なし）:
//   地形と山＝国土地理院の標高（5m・10m）を加工／建物＝PLATEAU 京都市 LOD2 を加工／川・道・橋・森＝© OpenStreetMap contributors
// 光は Blender で焼いた「空の光の回り方」（便17 #4=1）、地面・道・壁・屋根・木の皮は写真から作った CC0 の質感の素材（Poly Haven・便17 #3=1）。
//
// 町の3D（town3dViewer.js）とのつなぎ方:
//   ・この町は自分の舞台（scene）と目（camera）を持つ。部屋の目（町の3Dの camera）を、部屋の窓の位置と向きで写して鴨川の目にする（sync）
//   ・描く順は「鴨川の舞台 → 色の圧縮（ACES・この町の明るさ）→ その上に部屋」（makePass が作る後処理の1枚目）。部屋は自分の色の圧縮（Neutral）のまま
//   ・読めなかった時（古い端末・通信の失敗）は、町の3Dは今の角部屋（北寺尾の町）のまま開く
import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { Water } from 'three/examples/jsm/objects/Water.js'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import * as BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// ── 時刻（便17 の試作と同じ値。京都の向き: x 東・z 南。太陽の向きは three の角度で 0＝南） ──
const TIMES = {
  morning: { el: 7, az: 115, turb: 6, ray: 1.6, exp: 0.42, sun: 0xffe2c0, sunI: 2.4, hemi: [0xbfd2e6, 0x5a5040, 0.55], fog: 0xd2d6da, fogD: 0.00018 },
  noon: { el: 38, az: 0, turb: 3.5, ray: 1.0, exp: 0.32, sun: 0xfff6ea, sunI: 3.2, hemi: [0xcfe0f2, 0x6a6050, 0.7], fog: 0xc6d4e2, fogD: 0.00014 },
  dusk: { el: 4.5, az: 290, turb: 5.5, ray: 1.3, exp: 0.4, sun: 0xffa66a, sunI: 2.0, hemi: [0xa8a8c8, 0x403028, 0.45], fog: 0xc6b2a6, fogD: 0.00016 },
  night: { el: -12, az: 220, turb: 2, ray: 0.6, exp: 0.55, sun: 0x8ea6d0, sunI: 0.25, hemi: [0x2a3550, 0x0c0c12, 0.35], fog: 0x1c2232, fogD: 0.0002 },
}
const timeKey = (t) => (t === 'morning' ? 'morning' : t === 'dusk' || t === 'evening' ? 'dusk' : t === 'night' ? 'night' : 'noon')
// 空の模様（情景の axes.weather）。曇り・雨・雪は空をにごらせ、日差しを弱め、霞を濃くする
const SKIES = {
  clear: { turb: 0, ray: 1, sunK: 1, hemiK: 1, fogK: 1, expK: 1, shadow: true },
  cloudy: { turb: 3.5, ray: 0.85, sunK: 0.72, hemiK: 1.12, fogK: 1.35, expK: 1.04, shadow: true },
  rain: { turb: 9, ray: 0.5, sunK: 0.22, hemiK: 1.2, fogK: 2.6, expK: 1.1, shadow: false },
  snow: { turb: 9, ray: 0.6, sunK: 0.3, hemiK: 1.3, fogK: 2.2, expK: 1.0, shadow: false },
}
// 夜と夕の窓の灯り（便16 の決め: 試作の夜は灯りが強すぎた＝灯る割合と明るさを下げる）。朝と昼は灯さない
const LIT = { dusk: [0.12, 1.1], night: [0.32, 1.15] }

// ── データを読む（町の3Dが町を組んでいる間に、裏で取っておく） ──
async function gunzip(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`鴨川の町のデータが読めない: ${r.status} ${url}`)
  if (typeof DecompressionStream === 'undefined') throw new Error('この端末は鴨川の町のデータをほどけない')
  return await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}
const view = (buf, sec) => new globalThis[sec.type](buf, sec.off, sec.n)

/** 鴨川の町のデータと図を取ってくる。low＝iPhone の段（光の図 2048・素材の写真は縦横半分） */
export async function loadKamo(base, { low = false } = {}) {
  const meta = await (await fetch(base + 'kamo.json')).json()
  const F = meta.files
  const loader = new THREE.TextureLoader()
  const sfx = low ? '_s' : ''
  const img = (p) => loader.loadAsync(base + p)
  const [terrain, bldg, roads, misc, lmT, lmB, ...tex] = await Promise.all([
    gunzip(base + F.terrain.file), gunzip(base + F.bldg.file), gunzip(base + F.roads.file), gunzip(base + F.misc.file),
    img(`lm_terrain${sfx}.jpg`), img(`lm_bldg${sfx}.jpg`),
    ...meta.tex.flatMap((n) => [img(`tex/${n}_d${sfx}.jpg`), img(`tex/${n}_n${sfx}.jpg`)]),
  ])
  const texMap = {}
  meta.tex.forEach((n, i) => { texMap[n] = { d: tex[i * 2], n: tex[i * 2 + 1] } })
  return { meta, low, buf: { terrain, bldg, roads, misc }, lm: { terrain: lmT, bldg: lmB }, tex: texMap }
}

/**
 * 鴨川の町を組む。
 * data: loadKamo の返り値／toKamo: 町の3Dの座標 → 鴨川の座標（部屋の窓を鴨川の窓の位置と向きへ写す行列）
 * roomBox: 町の3Dの座標での部屋の箱（この中に入る建物は描かない＝部屋が建っている建物と、部屋に食い込む隣の建物）
 */
export function buildKamo(data, { renderer, toKamo, roomBox, season = 'autumn', time = null, sky = 'clear', shadowSize = 0 }) {
  const { meta, low } = data
  const TK = timeKey(time), SK = SKIES[sky] || SKIES.clear
  const T = { ...TIMES[TK] }
  T.turb += SK.turb; T.ray *= SK.ray; T.sunI *= SK.sunK; T.hemi = [T.hemi[0], T.hemi[1], T.hemi[2] * SK.hemiK]; T.fogD *= SK.fogK; T.exp *= SK.expK
  const SNOW = sky === 'snow', RAIN = sky === 'rain', NIGHT = TK === 'night'
  if (SNOW) T.fog = new THREE.Color(T.fog).lerp(new THREE.Color(NIGHT ? 0x39414e : 0xdfe3e8), 0.6).getHex()
  if (RAIN) T.fog = new THREE.Color(T.fog).lerp(new THREE.Color(NIGHT ? 0x161a22 : 0x9aa2aa), 0.5).getHex()
  const S = ['spring', 'summer', 'autumn', 'winter'].includes(season) ? season : 'autumn'
  const LEAF = { spring: [0xe8b8c8, 0x7fa05c], summer: [0x3f6a34, 0x5a8040], autumn: [0xb8622e, 0x6e7a3a], winter: [0x4a5a44, 0x55604a] }[S]
  const GRASS = { spring: 0x6f8f4a, summer: 0x557a34, autumn: 0x8a8048, winter: 0x8a8466 }[S]
  const WHITE = new THREE.Color(0xf2f4f6)
  let seed = 20261103
  const R = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const hash = (n) => { const s = Math.sin(n * 127.1 + 17.3) * 43758.5453; return s - Math.floor(s) }
  const disposables = []
  const keep = (x) => { disposables.push(x); return x }

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(T.fog, T.fogD)
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 26000)
  camera.matrixAutoUpdate = false

  // ── 空・空の光・太陽 ──
  // 晴れと曇りは three の Sky（物理の空）。雨・雪・夜は Sky では曇天や夜空にならない（便18 の1回目: 雪の夕の空の上が黒く、雨の夜は真っ黒だった）ので、
  // 霞の色から作るなだらかな空を張る（地平＝霞の色・天頂＝少し暗く青く）。夜は町の灯りが雲に映る明るさを地平に足す
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - T.el), THREE.MathUtils.degToRad(T.az))
  // 画面に出したい色（線形）から、この町の明るさで ACES をかける前の値を求める（夜は ACES の暗い所の沈みで黒く潰れるので、出したい色から逆に決める）
  const ACESfit = (x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081)
  const invTone = (r, g, b) => { const one = (y) => { let lo = 0, hi = 64; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (ACESfit(m) < y) lo = m; else hi = m } return (lo * 0.6) / T.exp }; return new THREE.Color(one(r), one(g), one(b)) }
  const DOME = RAIN || SNOW || NIGHT
  let skyMesh = null, su = null
  const domeMat = (top, hor, R0) => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: top }, uHor: { value: hor } },
    vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop, uHor; varying vec3 vD;
void main() { float h = normalize(vD).y; gl_FragColor = vec4(mix(uHor, uTop, smoothstep(-0.02, 0.55, h)), 1.0); }`,
  })
  let domeTop = null, domeHor = null
  if (DOME) {
    if (NIGHT) {
      domeHor = invTone(RAIN ? 0.07 : 0.05, RAIN ? 0.062 : 0.05, RAIN ? 0.06 : 0.062) // 町の灯りが雲の底に映る地平
      domeTop = invTone(0.007, 0.009, 0.018)
      scene.fog.color.copy(domeHor) // 遠くは地平の色へ溶ける
    } else {
      domeHor = scene.fog.color.clone()
      domeTop = domeHor.clone().multiply(new THREE.Color(RAIN ? 0.74 : 0.84, RAIN ? 0.78 : 0.88, RAIN ? 0.86 : 0.96))
    }
    skyMesh = new THREE.Mesh(keep(new THREE.SphereGeometry(20000, 32, 16)), keep(domeMat(domeTop, domeHor)))
  } else {
    skyMesh = new Sky(); skyMesh.scale.setScalar(24000)
    su = skyMesh.material.uniforms
    su.turbidity.value = T.turb; su.rayleigh.value = T.ray; su.mieCoefficient.value = 0.0022; su.mieDirectionalG.value = 0.86
    su.sunPosition.value.copy(sunDir)
    keep(skyMesh.geometry); keep(skyMesh.material)
  }
  skyMesh.userData.part = 'sky'; scene.add(skyMesh)
  const pmrem = new THREE.PMREMGenerator(renderer)
  {
    const envScene = new THREE.Scene()
    let s2
    if (DOME) s2 = new THREE.Mesh(new THREE.SphereGeometry(8000, 32, 16), domeMat(domeTop, domeHor))
    else { s2 = new Sky(); s2.scale.setScalar(8000); s2.material.uniforms.sunPosition.value.copy(sunDir); for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) s2.material.uniforms[k].value = su[k].value }
    envScene.add(s2)
    scene.environment = keep(pmrem.fromScene(envScene, 0, 1, 10000).texture); scene.environmentIntensity = NIGHT ? 0.25 : RAIN ? 0.6 : 0.8
    s2.geometry.dispose(); s2.material.dispose(); pmrem.dispose()
  }

  const sunL = new THREE.DirectionalLight(T.sun, T.sunI)
  sunL.castShadow = !!shadowSize && !NIGHT && SK.shadow
  if (sunL.castShadow) {
    sunL.shadow.mapSize.set(shadowSize, shadowSize)
    Object.assign(sunL.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 10, far: 3200 })
    sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.6
  }
  scene.add(sunL, sunL.target)
  scene.add(new THREE.HemisphereLight(...T.hemi))

  const NR = meta.near.R, WY = meta.waterY
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  // 焼いた光（空の光の届き方＋照り返し）を、空と照り返しの光（間接の光）にだけ掛ける。開けた所＝1.0
  for (const t of [data.lm.terrain, data.lm.bldg]) { t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; t.flipY = true; t.needsUpdate = true; keep(t) }
  const chain = (prev, next) => (sh, r) => { if (prev) prev(sh, r); next(sh, r) }
  // 差し込みを重ねた材質は、シェーダーの見分けの鍵を足していく（同じ形の関数の文字で、別の材質のシェーダーが使い回されないように）
  const addKey = (mat, k) => { mat.userData.key = (mat.userData.key || 'kamo') + '|' + k; mat.customProgramCacheKey = () => mat.userData.key }
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
  // fill＝建物の図: 図の上で1画素に満たない小さな面は焼いた値が 0 のまま残り、真っ黒に写った（便19 の調べ＝壁の面積の 6.5% が 0・その 98.7% が 2 画素未満の島）。
  //   本物の暗がり（路地・軒下）は 0.1 より上に焼けているので、0.04 より下だけを「焼けていない所」として並みの明るさ 0.55 で埋める（gate/probe-lm-mae.txt）
  function useBake(mat, tex, { fill = false } = {}) {
    mat.aoMap = tex; mat.aoMapIntensity = 1
    const frag = fill ? AOFRAG.replace('float ambientOcclusion = clamp( texture2D( aoMap, vAoMapUv ).r * 1.25, 0.0, 1.25 );', 'float lmRaw = texture2D( aoMap, vAoMapUv ).r; float ambientOcclusion = clamp( ( lmRaw < 0.04 ? 0.55 : lmRaw ) * 1.25, 0.0, 1.25 );') : AOFRAG
    mat.onBeforeCompile = chain(mat.onBeforeCompile, (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', frag) })
    addKey(mat, fill ? 'bakeF' : 'bake')
  }

  // 写真から作った CC0 の質感の素材。色は頂点の色を保ち、写真の模様だけを足す（便16 の見本と同じ考え）
  const kits = new Map()
  function texKit(name) {
    if (kits.has(name)) return kits.get(name)
    const t = data.tex[name], avg = new THREE.Vector3(0.5, 0.5, 0.5)
    { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(t.d.image, 0, 0, 16, 16)
      const p = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0
      for (let i = 0; i < p.length; i += 4) { r += (p[i] / 255) ** 2.2; g += (p[i + 1] / 255) ** 2.2; b += (p[i + 2] / 255) ** 2.2 }
      const n = p.length / 4; avg.set(r / n, g / n, b / n) }
    for (const [k, tx] of Object.entries(t)) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = aniso; if (k === 'd') tx.colorSpace = THREE.SRGBColorSpace; tx.needsUpdate = true; keep(tx) }
    const kit = { d: t.d, n: t.n, avg }; kits.set(name, kit); return kit
  }
  // mode: 'xz'＝真上から（地面・屋根） 'tri'＝3方向から（壁）。b を渡すと、頂点の色の緑みで a と b を混ぜる（草と砂利）
  function useTex(mat, { a, b = null, tile = 4, tileB = 0, mode = 'xz', ns = 0.8 }) {
    const A = texKit(a), B = b ? texKit(b) : A, key = `${a}|${b}|${mode}|${ns}`
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

  // 壁の窓（計算で描く）: 階は 3.0m・柱の間は 3.2m（住宅は 4.0m）。夕方と夜は一部が灯る
  const lit = LIT[TK] || [0, 0]
  function useWindows(mat, tall) {
    mat.onBeforeCompile = chain(mat.onBeforeCompile, (sh) => {
      sh.uniforms.uLit = { value: lit[0] }; sh.uniforms.uLitI = { value: lit[1] }
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW; varying vec3 vWN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWW; varying vec3 vWN; uniform float uLit, uLitI;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  float winMask = 0.0; vec2 wcell = vec2(0.0);
  if (abs(vWN.y) < 0.3) {
    float hz = abs(vWN.x) > abs(vWN.z) ? vWW.z : vWW.x;
    vec2 g = vec2(hz / ${tall ? '3.2' : '4.0'}, (vWW.y + 0.4) / 3.0); wcell = floor(g); vec2 f = fract(g);
    winMask = step(${tall ? '0.16' : '0.28'}, f.x) * step(f.x, ${tall ? '0.84' : '0.72'}) * step(0.32, f.y) * step(f.y, ${tall ? '0.8' : '0.72'});
    winMask *= step(0.25, wHash(wcell + floor(vWW.xz * 0.05)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.075), winMask * 0.9);
  }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.12, winMask);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += winMask * step(1.0 - uLit, wHash(wcell * 1.7 + 3.1)) * vec3(1.0, 0.72, 0.42) * uLitI;`)
    })
    addKey(mat, 'win' + (tall ? 'C' : 'P'))
  }

  // ── 地形（近く＝5m の標高・遠く＝10m の標高）。色は高さと傾きと水面からの高さで計算 ──
  // 区画（4×4）に分けて描く＝窓の後ろ側の区画は画面の外として描かない（便18: 1つの塊だと後ろ側も毎回描いていた）。
  // iPhone の段は網を1つおきに間引く（近く 8m・遠く 100m 間隔）。法線は全体の網で求めてから分ける（区画の境に陰の継ぎ目を出さない）
  const terrain = view(data.buf.terrain, meta.files.terrain.secs.near), zone = view(data.buf.terrain, meta.files.terrain.secs.zone), farH = view(data.buf.terrain, meta.files.terrain.secs.far)
  function gridTiles({ n, R0, step, hs, hq, dec, tiles, paint, withUv1 }) {
    const m = (n - 1) / dec + 1, st = step * dec
    const pos = new Float32Array(m * m * 3)
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const k = j * m + i; pos[k * 3] = -R0 + i * st; pos[k * 3 + 1] = hs[j * dec * n + i * dec] * hq; pos[k * 3 + 2] = -R0 + j * st }
    const full = new THREE.BufferGeometry(); full.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const fi = new Uint32Array((m - 1) * (m - 1) * 6); let q = 0
    for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) { const a = j * m + i, b = a + 1, c = a + m, d = c + 1; fi[q++] = a; fi[q++] = c; fi[q++] = b; fi[q++] = b; fi[q++] = c; fi[q++] = d }
    full.setIndex(new THREE.BufferAttribute(fi, 1)); full.computeVertexNormals()
    const nrm = full.attributes.normal.array; full.dispose()
    const col = new Float32Array(m * m * 3), uv1 = withUv1 ? new Float32Array(m * m * 2) : null, c = new THREE.Color()
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const k = j * m + i, x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2]
      paint(c, x, y, z, nrm[k * 3 + 1], j * dec * n + i * dec); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b
      if (uv1) { uv1[k * 2] = (x + NR) / (2 * NR); uv1[k * 2 + 1] = (-z + NR) / (2 * NR) }
    }
    const out = [], tq = Math.ceil((m - 1) / tiles)
    for (let tj = 0; tj < tiles; tj++) for (let ti = 0; ti < tiles; ti++) {
      const i0 = ti * tq, i1 = Math.min(m - 1, i0 + tq), j0 = tj * tq, j1 = Math.min(m - 1, j0 + tq); if (i0 >= i1 || j0 >= j1) continue
      const w = i1 - i0 + 1, h = j1 - j0 + 1, P = new Float32Array(w * h * 3), N = new Float32Array(w * h * 3), C = new Float32Array(w * h * 3), U = uv1 ? new Float32Array(w * h * 2) : null
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const s = (j0 + j) * m + i0 + i, d = j * w + i; for (let e = 0; e < 3; e++) { P[d * 3 + e] = pos[s * 3 + e]; N[d * 3 + e] = nrm[s * 3 + e]; C[d * 3 + e] = col[s * 3 + e] } if (U) { U[d * 2] = uv1[s * 2]; U[d * 2 + 1] = uv1[s * 2 + 1] } }
      const I = new Uint16Array((w - 1) * (h - 1) * 6); let r = 0
      for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i, b = a + 1, cc = a + w, dd = cc + 1; I[r++] = a; I[r++] = cc; I[r++] = b; I[r++] = b; I[r++] = cc; I[r++] = dd }
      const g = keep(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3)); if (U) g.setAttribute('uv1', new THREE.BufferAttribute(U, 2))
      g.setIndex(new THREE.BufferAttribute(I, 1)); out.push(g)
    }
    return out
  }
  const vn = (x, z) => { const s = Math.sin(x * 0.071 + z * 0.113) * 0.5 + Math.sin(x * 0.023 - z * 0.041) * 0.5; return s * 0.5 + 0.5 }
  {
    const cGrass = new THREE.Color(GRASS), cGravel = new THREE.Color(0x8a8272), cWet = new THREE.Color(0x5e5a50), cWall = new THREE.Color(0x8c877c), cTown = new THREE.Color(0x8a867e)
    const paint = (c, x, y, z, ny, k) => {
      const h = y - WY, nz = vn(x, z)
      if (zone[k] === 2) c.copy(cWet).lerp(cGravel, 0.4) // 水面の下（浅い所の川底の石）
      else if (zone[k] === 1) { if (ny < 0.8) c.copy(cWall); else c.copy(cGrass).offsetHSL(0, 0, (nz - 0.5) * 0.1).lerp(cGravel, Math.max(0, 1 - Math.abs(h - 0.4)) * 0.6) } // 河川敷の草・水際の砂利・護岸
      else if (ny < 0.8) c.copy(cWall)
      else c.copy(cTown).lerp(cGrass, nz * 0.12) // 町の地面（道と建物の間）
      if (SNOW && zone[k] !== 2 && ny > 0.6) c.lerp(WHITE, 0.62)
    }
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RAIN ? 0.6 : 0.95, metalness: 0 }))
    useBake(m, data.lm.terrain)
    useTex(m, { a: 'gravel_road', b: 'grass_path_2', tile: 3.2, tileB: 3.5 })
    for (const g of gridTiles({ n: meta.near.n, R0: NR, step: meta.near.step, hs: terrain, hq: meta.near.hStep, dec: low ? 2 : 1, tiles: 4, paint, withUv1: true })) {
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true; mesh.userData.part = 'terrainNear'; scene.add(mesh)
    }
  }
  {
    // 近くの地形の範囲は 6m 下げてある（build.mjs）。遠くの網は近くの網の下に隠れる
    const cCity = new THREE.Color(0x8a867f), cForest = new THREE.Color(S === 'autumn' ? 0x4e5a34 : S === 'winter' ? 0x3e4a3a : 0x34502e), cForest2 = new THREE.Color(S === 'autumn' ? 0x7a5a30 : 0x405e34)
    const paint = (c, x, y, z, ny) => {
      const forest = Math.min(1, Math.max(0, (y - 18) / 30) + Math.max(0, (0.97 - ny) * 8))
      c.copy(cCity).lerp(cForest, forest).lerp(cForest2, forest * vn(x * 0.3, z * 0.3) * 0.5)
      if (SNOW) c.lerp(WHITE, ny > 0.85 ? 0.55 : 0.3)
    }
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }))
    for (const g of gridTiles({ n: meta.far.n, R0: meta.far.R, step: meta.far.step, hs: farH, hq: meta.far.hStep, dec: low ? 2 : 1, tiles: 4, paint, withUv1: false })) {
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.userData.part = 'terrainFar'; scene.add(mesh)
    }
  }

  const navSrc = {} // 便19: 飛ぶ・歩くの道案内（下の makeNav）が使う、建物と橋の形
  // ── 道・小道・橋・線路（地形の焼いた光をそのまま使う） ──
  {
    const sec = meta.files.roads.secs, ps = meta.roads.pStep
    const p16 = view(data.buf.roads, sec.pos), idx = view(data.buf.roads, sec.idx), kind = view(data.buf.roads, sec.kind)
    const P = new Array(p16.length); for (let i = 0; i < p16.length; i++) P[i] = p16[i] * ps
    const I = Array.from(idx), K = Array.from(kind), pos = P.slice()
    navSrc.roads = { pos, idx, kind }
    for (let t = 0; t < idx.length; t += 6) { // 橋の床の両側に、下へ 1.5m の桁を足す
      const a = idx[t]; if (kind[a] !== 2) continue
      for (const [e0, e1] of [[a, a + 2], [a + 1, a + 3]]) { const b = P.length / 3; P.push(pos[e0 * 3], pos[e0 * 3 + 1], pos[e0 * 3 + 2], pos[e1 * 3], pos[e1 * 3 + 1], pos[e1 * 3 + 2], pos[e0 * 3], pos[e0 * 3 + 1] - 1.5, pos[e0 * 3 + 2], pos[e1 * 3], pos[e1 * 3 + 1] - 1.5, pos[e1 * 3 + 2]); K.push(4, 4, 4, 4); I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3) }
    }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I)
    const col = new Float32Array(K.length * 3), uv1 = new Float32Array(K.length * 2), c = new THREE.Color()
    const CK = [0x55575a, 0xb0a690, 0x8d8a84, 0x6a5e52, 0x7c7a76]
    for (let i = 0; i < K.length; i++) { c.setHex(CK[K[i]]); if (SNOW && K[i] !== 4) c.lerp(WHITE, K[i] === 0 ? 0.35 : 0.55); col.set([c.r, c.g, c.b], i * 3); uv1.set([(P[i * 3] + NR) / (2 * NR), (-P[i * 3 + 2] + NR) / (2 * NR)], i * 2) }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); g.computeVertexNormals()
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RAIN ? 0.42 : 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }))
    useBake(m, data.lm.terrain)
    useTex(m, { a: 'asphalt_02', tile: 5 })
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true; mesh.userData.part = 'roads'; scene.add(mesh)
  }

  // ── 川の水面（OpenStreetMap の水面の形・映り込みは three の Water） ──
  // 便19: 前は整数の周波数の波 18 本だけで作り、波どうしの干渉が四角い格子に見えた（便18 の範囲外・夏の朝・雪の夕）。
  //   向きも長さもばらばらな波 140 本（周期 4〜48 に1つ）を、長い波ほど高く重ねる（傾きの強さは前と同じ 0.15 前後・上位 20 本の波に入る力は前 100% → 25%）。乱数は町の R と分ける（R の回る数を変えると、後で組む木の形が変わる）。
  //   kamowave=0 は外し回し用（前の 18 本の作り）
  function waterNormals(n = 256) {
    const OLD = /[?&]kamowave=0/.test(location.search)
    let ws = 777; const RW = () => { ws = (ws * 1664525 + 1013904223) >>> 0; return ws / 4294967296 }
    const waves = []
    if (OLD) for (let k = 0; k < 18; k++) waves.push([Math.round((R() - 0.5) * 2 * (2 + k)), Math.round((R() - 0.5) * 2 * (2 + k)), R() * 6.283, 1 / (1 + k * 0.6)])
    else while (waves.length < 140) { const fx = Math.round((RW() - 0.5) * 96), fy = Math.round((RW() - 0.5) * 96), f = Math.hypot(fx, fy); if (f < 4 || f > 48) continue; waves.push([fx, fy, RW() * 6.283, Math.pow(f, -1.35) * 1.8]) }
    if (!OLD) for (let k = 0; k < 18; k++) { R(); R(); R() } // 町の R の回る数は前のまま（後で組む木の形と色を変えない）
    { const pw = waves.map(([fx, fy, , a]) => (a * Math.hypot(fx, fy)) ** 2).sort((x, y) => y - x), tot = pw.reduce((x, y) => x + y, 0); waveTop20 = +(pw.slice(0, 20).reduce((x, y) => x + y, 0) / tot * 100).toFixed(1) } // 上位 20 本の波に入る傾きの力の割合（格子の出やすさ・検査 K15）
    const H = new Float32Array(n * n)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let h = 0; for (const [fx, fy, ph, a] of waves) h += a * Math.sin(6.2832 * (fx * i + fy * j) / n + ph); H[j * n + i] = h }
    const d = new Uint8Array(n * n * 4), v = new THREE.Vector3()
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const hx = H[j * n + (i + 1) % n] - H[j * n + (i - 1 + n) % n], hy = H[((j + 1) % n) * n + i] - H[((j - 1 + n) % n) * n + i]; v.set(-hx * 0.9, -hy * 0.9, 1).normalize(); d.set([(v.x * 0.5 + 0.5) * 255, (v.y * 0.5 + 0.5) * 255, (v.z * 0.5 + 0.5) * 255, 255], (j * n + i) * 4) }
    const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return keep(t)
  }
  let water, waveTop20 = null
  {
    const sec = meta.files.misc.secs, wp = view(data.buf.misc, sec.wpos), wi = view(data.buf.misc, sec.widx), nv = meta.water.nv
    const lp = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { lp[i * 3] = wp[i * 3]; lp[i * 3 + 1] = -wp[i * 3 + 2]; lp[i * 3 + 2] = wp[i * 3 + 1] - WY } // 水面の板の中の座標（回して y=WY に置く）
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(lp, 3)); g.setIndex(new THREE.BufferAttribute(Uint32Array.from(wi), 1)); g.computeVertexNormals()
    const tw = low ? 512 : 1024
    water = new Water(g, { textureWidth: tw, textureHeight: tw, waterNormals: waterNormals(), sunDirection: sunDir.clone(), sunColor: NIGHT ? 0x445066 : RAIN || SNOW ? 0x8a929c : T.sun, waterColor: SNOW ? 0x223238 : RAIN ? 0x262f30 : 0x2a3b38, distortionScale: RAIN ? 3.2 : 2.2, fog: true, alpha: 1 })
    water.material.side = THREE.DoubleSide
    // 便19: 凹凸の図の4つの重ねを、向きと大きさを変えて読む（前は 1/103 と 1/107 の2つが同じ向きで重なり、格子のうなりが出た）
    if (!/[?&]kamowave=0/.test(location.search)) {
      water.material.fragmentShader = water.material.fragmentShader.replace(/vec4 getNoise\( vec2 uv \) \{[\s\S]*?return noise \* 0\.5 - 1\.0;\s*\}/, `vec4 getNoise( vec2 uv ) {
					vec2 uv0 = mat2( 0.8253, -0.5646, 0.5646, 0.8253 ) * uv / 61.0 + vec2( time / 17.0, time / 29.0 );
					vec2 uv1 = mat2( -0.4161, -0.9093, 0.9093, -0.4161 ) * uv / 37.0 - vec2( time / -19.0, time / 31.0 );
					vec2 uv2 = mat2( 0.2675, 0.9636, -0.9636, 0.2675 ) * uv / 113.0 + vec2( time / 101.0, time / 97.0 );
					vec2 uv3 = mat2( -0.9900, 0.1411, -0.1411, -0.9900 ) * uv / 19.0 - vec2( time / 109.0, time / -113.0 );
					vec4 noise = texture2D( normalSampler, uv0 ) * 1.1 + texture2D( normalSampler, uv1 ) + texture2D( normalSampler, uv2 ) * 1.2 + texture2D( normalSampler, uv3 ) * 0.7;
					return noise * 0.5 - 1.0;
				}`)
      water.material.needsUpdate = true
    }
    water.rotation.x = -Math.PI / 2; water.position.y = WY; water.material.uniforms.size.value = 2.2
    keep(water.material); water.userData.part = 'water'; scene.add(water)
  }

  // ── 建物（PLATEAU LOD2）。壁と屋根で分け、建物ごとに色を変える。区画（400m）ごとに描く ──
  // 部屋のある建物: 窓を置いた建物（PLATEAU）は高さの記録が 24.8m なのに形が 5.6m しかなく、部屋がその屋根の 16m 上に浮いていた（便18 で見つけた）。
  //   部屋のあるマンションの外壁（窓の下と横・屋上）を足し、その中に入る PLATEAU の建物は描かない（重なる面のちらつきも出さない）
  const fromKamo = toKamo.clone().invert()
  const removed = []
  let plug = null // 便19: 部屋の窓の所を塞ぐ壁（部屋が隠れている間だけ出す）
  // 部屋の原点（町の3Dの座標）と、部屋の箱の部屋の座標（窓の中心が原点・正面 -z・左 -x）での広がり
  const roomO = new THREE.Vector3().setFromMatrixPosition(fromKamo.clone().multiply(new THREE.Matrix4().makeTranslation(meta.view.x - 0.6, meta.view.y - 1.5, meta.view.z)))
  const rb = { x0: roomBox.min.x - roomO.x, x1: roomBox.max.x - roomO.x, y0: roomBox.min.y - roomO.y, y1: roomBox.max.y - roomO.y, z0: roomBox.min.z - roomO.z, z1: roomBox.max.z - roomO.z }
  const groundL = (meta.view.groundY - 0.3) - (meta.view.y - 1.5) // 地面（部屋の座標）
  const HOST = { x0: rb.x0, x1: rb.x1 + 16, y0: groundL, y1: rb.y1 + 0.3, z0: 0, z1: rb.z1 + 6 } // 部屋は北東の角（右＝南と奥＝西へ建物が続く）
  const toK = (x, y, z) => new THREE.Vector3(x, y, z).add(roomO).applyMatrix4(toKamo)
  const hostK = new THREE.Box3(); for (const x of [HOST.x0, HOST.x1]) for (const y of [HOST.y0, HOST.y1]) for (const z of [HOST.z0 - 0.3, HOST.z1]) hostK.expandByPoint(toK(x, y, z))
  {
    const sec = meta.files.bldg.secs, ps = meta.bldg.pStep
    const p16 = view(data.buf.bldg, sec.pos), uv16 = view(data.buf.bldg, sec.uv), bidA = view(data.buf.bldg, sec.bid), nv = meta.bldg.nv
    const H = meta.bldg.heights
    // 建物ごとの箱（鴨川の座標）。部屋のあるマンションの箱と重なる建物を外す
    const bb = new Map()
    for (let i = 0; i < nv; i++) { const b = bidA[i]; let e = bb.get(b); if (!e) { e = new THREE.Box3(); bb.set(b, e) } e.expandByPoint(new THREE.Vector3(p16[i * 3] * ps, p16[i * 3 + 1] * ps, p16[i * 3 + 2] * ps)) }
    const drop = new Set(); for (const [b, e] of bb) if (e.intersectsBox(hostK)) drop.add(b)
    for (const b of drop) removed.push(b)
    navSrc.bldg = { p16, bidA, drop, ps, nv }
    const WALL = [0xddd6c8, 0xcfc6b4, 0xe8e4da, 0xbcae98, 0xc8ccd0, 0xd4c8b0, 0x9a8a78, 0xa8b0b4, 0xe2d8c0, 0x8a7a6a, 0xc4b8a0, 0xb8b4a8]
    const ROOF = [0x4a4f57, 0x5a6878, 0x4e463e, 0x6a5444, 0x3e444c, 0x7a6a5a, 0x2e3238]
    const KINDS = ['wallP', 'wallC', 'roofT', 'roofF'], CELL = 400
    const mats = {}
    for (const k of KINDS) {
      const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: k === 'roofT' ? (RAIN ? 0.45 : 0.7) : 0.88, metalness: 0, side: THREE.DoubleSide }))
      if (k.startsWith('wall')) useWindows(m, k === 'wallC')
      useBake(m, data.lm.bldg, { fill: !/[?&]kamofill=0/.test(location.search) }) // kamofill=0 は外し回し用（埋めを外す）
      useTex(m, { roofT: { a: 'grey_roof_tiles', tile: 3, mode: 'xz' }, roofF: { a: 'concrete_wall_004', tile: 6, mode: 'xz', ns: 0.4 }, wallP: { a: 'grey_plaster_02', tile: 3, mode: 'tri', ns: 0.5 }, wallC: { a: 'concrete_wall_004', tile: 4, mode: 'tri', ns: 0.5 } }[k])
      mats[k] = m
    }
    const groups = new Map()
    const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), nrm = new THREE.Vector3()
    for (let t = 0; t < nv; t += 3) {
      const bid = bidA[t]; if (drop.has(bid)) continue
      a.set(p16[t * 3], p16[t * 3 + 1], p16[t * 3 + 2]); b.set(p16[t * 3 + 3], p16[t * 3 + 4], p16[t * 3 + 5]); cc.set(p16[t * 3 + 6], p16[t * 3 + 7], p16[t * 3 + 8])
      const cx = (a.x + b.x + cc.x) * ps / 3, cz = (a.z + b.z + cc.z) * ps / 3
      nrm.subVectors(b, a).cross(cc.sub(a)).normalize()
      const h = H[bid] ?? 8, roof = Math.abs(nrm.y) > 0.45, tall = h > 12
      const key = (roof ? (tall ? 'roofF' : 'roofT') : tall ? 'wallC' : 'wallP') + '|' + Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL)
      let g = groups.get(key); if (!g) { g = []; groups.set(key, g) } g.push(t)
    }
    const c = new THREE.Color()
    for (const [key, tris] of groups) {
      const k = key.split('|')[0]
      const cnt = tris.length * 3, pos = new Float32Array(cnt * 3), uv1 = new Float32Array(cnt * 2), col = new Float32Array(cnt * 3)
      let o = 0
      for (const t of tris) for (let q = 0; q < 3; q++) {
        const s = t + q, bid = bidA[s]
        pos[o * 3] = p16[s * 3] * ps; pos[o * 3 + 1] = p16[s * 3 + 1] * ps; pos[o * 3 + 2] = p16[s * 3 + 2] * ps
        uv1[o * 2] = uv16[s * 2] / 65535; uv1[o * 2 + 1] = uv16[s * 2 + 1] / 65535
        if (k.startsWith('roof')) { c.setHex(ROOF[Math.floor(hash(bid) * ROOF.length)]); if (SNOW) c.lerp(WHITE, 0.6) } else c.setHex(WALL[Math.floor(hash(bid + 0.5) * WALL.length)])
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b; o++
      }
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals()
      const mesh = new THREE.Mesh(g, mats[k]); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = 'bldg'; scene.add(mesh)
    }
  }
  // 部屋のあるマンションの外壁。部屋の座標で板を並べ、部屋の前（窓の面）と左（左の窓の面）は部屋の所だけ空ける（窓の外を塞がない）
  {
    const P = [], add = (a, b, c, d) => { for (const v of [a, b, c, a, c, d]) { const k = toK(...v); P.push(k.x, k.y, k.z) } }
    const { x0, x1, y0, y1, z0, z1 } = HOST, ry0 = rb.y0, rx1 = rb.x1, rz1 = rb.z1
    add([x0, y0, z0], [x1, y0, z0], [x1, ry0, z0], [x0, ry0, z0]) // 正面: 部屋の下
    add([rx1, ry0, z0], [x1, ry0, z0], [x1, y1, z0], [rx1, y1, z0]) // 正面: 部屋の右（南）
    add([x0, y0, z1], [x0, y0, z0], [x0, ry0, z0], [x0, ry0, z1]) // 左（北）: 部屋の下
    add([x0, ry0, z1], [x0, ry0, rz1], [x0, y1, rz1], [x0, y1, z1]) // 左（北）: 部屋の奥（西）
    add([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]) // 右（南）の壁
    add([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]) // 奥（西）の壁
    add([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]) // 屋上
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals()
    const m = keep(new THREE.MeshStandardMaterial({ color: SNOW ? 0xd4d0c8 : 0xd8d2c6, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }))
    useWindows(m, true)
    useTex(m, { a: 'concrete_wall_004', tile: 4, mode: 'tri', ns: 0.5 })
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = 'home'; scene.add(mesh)
    // 便19: 部屋の窓の所の空き（正面と左）を塞ぐ壁。部屋は空・地上で隠れる（町の3Dの作り）ので、外から見るとその所が穴になる。部屋が隠れている間だけ出す（setRoomShown）
    const PP = [], addP = (a, b, c, d) => { for (const v of [a, b, c, a, c, d]) { const k = toK(...v); PP.push(k.x, k.y, k.z) } }
    addP([x0, ry0, z0], [rx1, ry0, z0], [rx1, y1, z0], [x0, y1, z0]) // 正面の窓の所
    addP([x0, ry0, rz1], [x0, ry0, z0], [x0, y1, z0], [x0, y1, rz1]) // 左の窓の所
    const gp = keep(new THREE.BufferGeometry()); gp.setAttribute('position', new THREE.Float32BufferAttribute(PP, 3)); gp.computeVertexNormals()
    plug = new THREE.Mesh(gp, m); plug.castShadow = false; plug.receiveShadow = true; plug.userData.part = 'home'; plug.visible = false; scene.add(plug)
  }

  // ── 木（OpenStreetMap の森・公園・木の点と、川岸の並木）。樹冠は「葉の小片＋奥の暗い芯＋幹・風で揺れる」 ──
  // 区画（400m）ごとに描く（窓の後ろ側の区画は描かない）。窓から 260m より遠い木は葉の小片を減らす（描く三角形の大半が樹冠のため）。
  // iPhone の段は芯の球と幹の面も減らす
  const windU = []
  const view0 = new THREE.Vector3(meta.view.x, meta.view.y, meta.view.z)
  {
    const tr = view(data.buf.misc, meta.files.misc.secs.trees), n = tr.length / 6
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d')
    for (let k = 0; k < 26; k++) { const px = 10 + R() * 108, py = 10 + R() * 108, a = R() * 6.283, l = 7 + R() * 9
      x.save(); x.translate(px, py); x.rotate(a); x.fillStyle = 'rgb(' + (200 + R() * 55 | 0) + ',' + (200 + R() * 55 | 0) + ',' + (190 + R() * 40 | 0) + ')'; x.beginPath(); x.ellipse(0, 0, l, l * 0.42, 0, 0, 6.283); x.fill()
      x.strokeStyle = 'rgba(120,120,110,0.5)'; x.lineWidth = 1; x.beginPath(); x.moveTo(-l, 0); x.lineTo(l, 0); x.stroke(); x.restore() }
    const leafTex = keep(new THREE.CanvasTexture(cv)); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4
    const lobes = []; for (let k = 0; k < 5; k++) lobes.push([(R() - 0.5) * 0.9, (R() - 0.3) * 0.6, (R() - 0.5) * 0.9, 0.5 + R() * 0.3])
    const cards = (count) => {
      const quads = []
      for (let k = 0; k < count; k++) {
        const [lx, ly, lz, lr] = lobes[k % lobes.length], u = R() * 2 - 1, th = R() * 6.283, rr = lr * Math.cbrt(R())
        const p = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), u * 0.8, Math.sqrt(1 - u * u) * Math.sin(th)).multiplyScalar(rr).add(new THREE.Vector3(lx, ly, lz))
        const sz = count < 100 ? 0.95 : 0.7 // 小片を減らした遠い木は、1枚を大きくして同じ茂りに見せる
        const g = new THREE.PlaneGeometry(sz, sz); g.rotateX(R() * 6.283); g.rotateY(R() * 6.283); g.translate(p.x, p.y, p.z)
        const nn = p.clone().normalize(), na = g.attributes.normal; for (let i = 0; i < na.count; i++) na.setXYZ(i, nn.x, nn.y, nn.z)
        quads.push(g)
      }
      const m = keep(BGU.mergeGeometries(quads)); quads.forEach((g) => g.dispose()); return m
    }
    const nearGeo = cards(low ? 140 : 240), farGeo = cards(low ? 40 : 64)
    const leafMat = keep(new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }))
    leafMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = { value: 0 }; windU.push(sh.uniforms.uTime)
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = instanceMatrix[3].xyz; float hh = clamp(position.y + 0.9, 0.0, 2.0);
        float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.013 + ip.z * 0.011);
        float sway = (sin(uTime * 1.25 + ip.x * 0.05 + ip.z * 0.04) * 0.07 + sin(uTime * 2.3 + ip.x * 0.11) * 0.03) * gust;
        transformed.x += sway * hh; transformed.z += sway * 0.55 * hh;
        float ph = dot(position, vec3(12.9, 78.2, 37.7));
        transformed += normal * sin(uTime * 8.0 + ph) * 0.035 * gust;`)
    }
    addKey(leafMat, 'leaf')
    const coreGeo = keep(new THREE.IcosahedronGeometry(0.55, low ? 0 : 1)), coreMat = keep(new THREE.MeshStandardMaterial({ roughness: 1 }))
    const bark = texKit('japanese_zelkova_bark')
    const trunkMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, map: bark.d.clone(), normalMap: bark.n.clone() })); trunkMat.map.repeat.set(1, 2); trunkMat.normalMap.repeat.set(1, 2); trunkMat.map.needsUpdate = trunkMat.normalMap.needsUpdate = true; keep(trunkMat.map); keep(trunkMat.normalMap)
    const trunkGeo = keep(new THREE.CylinderGeometry(0.1, 0.18, 1, low ? 5 : 8, 1, true).translate(0, 0.5, 0))
    // 1本ずつの形と色を先に決める（乱数の順は木の並びのまま＝区画の分け方で木の形が変わらない）
    const CELL = 400, cells = new Map()
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), at = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const tx = tr[i * 6], ty = tr[i * 6 + 1], tz = tr[i * 6 + 2], h = tr[i * 6 + 3], w = tr[i * 6 + 4], kind = tr[i * 6 + 5], sR = w * 0.5
      q.setFromAxisAngle(up, R() * 6.283)
      sc.set(sR * (0.9 + R() * 0.25), Math.max(sR * 0.9, h * 0.36) * (0.85 + R() * 0.25), sR * (0.9 + R() * 0.25)) // 樹冠は低く大きく（幹が見えるのは下の 3〜4 割）
      const crownM = m4.compose(at.set(tx, ty + h - sc.y * 0.8, tz), q, sc).clone()
      const base = kind === 1 && S === 'spring' ? LEAF[0] : R() < (S === 'autumn' ? 0.55 : 0.3) ? LEAF[0] : LEAF[1]
      c.setHex(base).offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.1, (R() - 0.5) * 0.08)
      if (SNOW) c.lerp(WHITE, 0.35)
      const trunkM = m4.compose(at.set(tx, ty, tz), q, sc.set(sR * 0.7, h - sc.y * 0.9, sR * 0.7)).clone()
      const key = Math.floor(tx / CELL) + ',' + Math.floor(tz / CELL)
      let cell = cells.get(key); if (!cell) { cell = { near: [], far: [], all: [] }; cells.set(key, cell) }
      const t = { crownM, trunkM, col: c.clone() }
      cell.all.push(t); (Math.hypot(tx - view0.x, tz - view0.z) < 260 ? cell.near : cell.far).push(t)
    }
    const coreCol = new THREE.Color()
    for (const cell of cells.values()) {
      for (const [list, geo] of [[cell.near, nearGeo], [cell.far, farGeo]]) {
        if (!list.length) continue
        const im = new THREE.InstancedMesh(geo, leafMat, list.length)
        list.forEach((t, k) => { im.setMatrixAt(k, t.crownM); im.setColorAt(k, t.col) })
        im.castShadow = im.receiveShadow = true; im.userData.part = 'crown'; im.computeBoundingSphere(); scene.add(im)
      }
      const core = new THREE.InstancedMesh(coreGeo, coreMat, cell.all.length), trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, cell.all.length)
      cell.all.forEach((t, k) => { core.setMatrixAt(k, t.crownM); core.setColorAt(k, coreCol.copy(t.col).multiplyScalar(0.28)); trunk.setMatrixAt(k, t.trunkM) })
      core.castShadow = true; trunk.castShadow = true; core.userData.part = 'core'; trunk.userData.part = 'trunk'
      core.computeBoundingSphere(); trunk.computeBoundingSphere(); scene.add(core, trunk)
    }
  }

  // ── 飛び石（鴨川デルタの亀と千鳥の石。形は計算で丸めた平たい石） ──
  {
    const st = view(data.buf.misc, meta.files.misc.secs.stones), n = st.length / 4
    if (n) {
      const g = keep(new THREE.IcosahedronGeometry(1, 2)), p = g.attributes.position
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * 0.62, Math.max(-0.2, y) * 0.32, z * 0.48) }
      g.computeVertexNormals()
      const m = keep(new THREE.MeshStandardMaterial({ color: SNOW ? 0xc8ccd0 : 0x9a968c, roughness: RAIN ? 0.5 : 0.85 }))
      useTex(m, { a: 'concrete_wall_004', tile: 1.2, mode: 'tri', ns: 0.6 })
      const im = new THREE.InstancedMesh(g, m, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3()
      for (let i = 0; i < n; i++) { q.setFromAxisAngle(up, st[i * 4 + 3]); m4.compose(at.set(st[i * 4], st[i * 4 + 1], st[i * 4 + 2]), q, one); im.setMatrixAt(i, m4) }
      im.castShadow = im.receiveShadow = true; im.userData.part = 'stones'; scene.add(im)
    }
  }

  // 影を焼く範囲: 窓のまわり（窓の正面へ 300m 寄せた所を中心に ±620m）。太陽は動かないので、影は最初に1回だけ焼く
  {
    const yaw = THREE.MathUtils.degToRad(meta.view.yawDeg), fwd = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw))
    sunL.target.position.copy(view0).addScaledVector(fwd, 300).setY(0); sunL.position.copy(sunL.target.position).addScaledVector(sunDir, 1500)
    sunL.target.updateMatrixWorld(); sunL.updateMatrixWorld()
  }

  // ── 便19: 飛ぶ・歩くの道案内。町の3Dの飛ぶ・歩くの仕組み（地面の高さ・当たり・水際・着地）に、鴨川の地形の網・建物・川・木・橋を渡す ──
  //   問いも答えも町の3Dの座標（toKamo は y 軸の回りの回転と移動だけなので、高さは足し引きだけ）。
  //   建物・木・橋の高さの表（2m 四方）は最初に聞かれた時に作る＝窓辺だけで眺める時は作らない
  const navM = toKamo.elements, invM = fromKamo.elements, dY = navM[13]
  const KX = (x, z) => navM[0] * x + navM[8] * z + navM[12], KZ = (x, z) => navM[2] * x + navM[10] * z + navM[14]
  const TX = (X, Z) => invM[0] * X + invM[8] * Z + invM[12], TZ = (X, Z) => invM[2] * X + invM[10] * Z + invM[14]
  const nN = meta.near.n, nS = meta.near.step, nQ = meta.near.hStep
  const gridAt = (X, Z, f) => { // 近くの地形の網を4点で混ぜて読む（網の外は端の値）
    const u = Math.min(nN - 1.001, Math.max(0, (X + NR) / nS)), v = Math.min(nN - 1.001, Math.max(0, (Z + NR) / nS)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * nN + i
    return (f(k) * (1 - fu) + f(k + 1) * fu) * (1 - fv) + (f(k + nN) * (1 - fu) + f(k + nN + 1) * fu) * fv
  }
  const terrK = (X, Z) => gridAt(X, Z, (k) => terrain[k] * nQ) // 地面の高さ（鴨川の座標・水面の下は川底）
  const wetK = (X, Z) => gridAt(X, Z, (k) => (zone[k] === 2 ? 1 : 0)) // 水面の度合い（0.5 以上を水とする）
  const zoneK = (X, Z) => zone[Math.round(Math.min(nN - 1, Math.max(0, (Z + NR) / nS))) * nN + Math.round(Math.min(nN - 1, Math.max(0, (X + NR) / nS)))]
  const floorK = (X, Z) => terrK(X, Z) + Math.min(1, wetK(X, Z) * 2) * 0.6 // 目の下限の元（水の上は水面＝川底の 0.6m 上・build.mjs）
  const EDGE = NR - 40 // 近くの地形の網の縁から 40m 内側まで（網の縁は遠くの網との継ぎ目）
  const GC = 2, GN = Math.ceil((2 * NR) / GC)
  let G = null
  function ensureNav() {
    if (G) return G
    const t0 = performance.now()
    const top = new Float32Array(GN * GN).fill(-1e9), bld = new Uint8Array(GN * GN), deck = new Float32Array(GN * GN).fill(NaN)
    const ci = (X) => Math.floor((X + NR) / GC)
    // 三角形を真上から見て、覆う升に fn(升, その所の高さ, 三角形の一番高い所) を渡す（壁のように真上から線に潰れる面は、頂点の升だけ）
    const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, fn) => {
      const yMax = Math.max(ay, by, cy)
      for (const [vx, vy, vz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) { const i = ci(vx), j = ci(vz); if (i >= 0 && j >= 0 && i < GN && j < GN) fn(j * GN + i, vy, yMax) }
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-6) return
      const i0 = Math.max(0, ci(Math.min(ax, bx, cx))), i1 = Math.min(GN - 1, ci(Math.max(ax, bx, cx))), j0 = Math.max(0, ci(Math.min(az, bz, cz))), j1 = Math.min(GN - 1, ci(Math.max(az, bz, cz)))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = -NR + (i + 0.5) * GC, pz = -NR + (j + 0.5) * GC
        const w1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den, w2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den, w3 = 1 - w1 - w2
        if (w1 >= -0.02 && w2 >= -0.02 && w3 >= -0.02) fn(j * GN + i, w1 * ay + w2 * by + w3 * cy, yMax)
      }
    }
    { // 建物（描かない建物は除く）と、部屋のあるマンション
      const { p16, bidA, drop, ps, nv } = navSrc.bldg
      const mark = (k, y, yMax) => { if (yMax > top[k]) top[k] = yMax; bld[k] = 1 }
      for (let t = 0; t < nv; t += 3) { if (drop.has(bidA[t])) continue; const o = t * 3; tri(p16[o] * ps, p16[o + 1] * ps, p16[o + 2] * ps, p16[o + 3] * ps, p16[o + 4] * ps, p16[o + 5] * ps, p16[o + 6] * ps, p16[o + 7] * ps, p16[o + 8] * ps, mark) }
      for (let j = Math.max(0, ci(hostK.min.z)); j <= Math.min(GN - 1, ci(hostK.max.z)); j++) for (let i = Math.max(0, ci(hostK.min.x)); i <= Math.min(GN - 1, ci(hostK.max.x)); i++) { const k = j * GN + i; top[k] = Math.max(top[k], hostK.max.y); bld[k] = 1 }
      // 建物の升でも、地面から 1.8m より低い物（塀・段・屋根の無い小さな形）は歩ける
      for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const k = j * GN + i; if (bld[k] && top[k] - terrK(-NR + (i + 0.5) * GC, -NR + (j + 0.5) * GC) < 1.8) bld[k] = 0 }
    }
    { // 橋の床（歩いて渡れる・飛ぶ時は欄干の分だけ上を通る）
      const { pos, idx, kind } = navSrc.roads
      const mark = (k, y) => { if (!(deck[k] >= y)) deck[k] = y; if (y + 1.2 > top[k]) top[k] = y + 1.2 }
      for (let q = 0; q < idx.length; q += 3) { const a = idx[q], b = idx[q + 1], c = idx[q + 2]; if (kind[a] !== 2) continue; tri(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2], pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2], mark) }
    }
    // 木: 樹冠の上の高さ（飛ぶ時）と幹（歩く時の当たり・8m 四方の箱に入れる）
    const trunks = new Map(), tr = view(data.buf.misc, meta.files.misc.secs.trees)
    for (let q = 0; q < tr.length; q += 6) {
      const X = tr[q], Y = tr[q + 1], Z = tr[q + 2], h = tr[q + 3], r = tr[q + 4] * 0.5
      for (let j = Math.max(0, ci(Z - r)); j <= Math.min(GN - 1, ci(Z + r)); j++) for (let i = Math.max(0, ci(X - r)); i <= Math.min(GN - 1, ci(X + r)); i++) { const k = j * GN + i; if (Y + h > top[k]) top[k] = Y + h }
      const key = Math.floor(X / 8) * 100003 + Math.floor(Z / 8); let a = trunks.get(key); if (!a) { a = []; trunks.set(key, a) } a.push(X, Z)
    }
    // 飛ぶ時の下限: 地面（水面）と建物・木・橋の上の高い方を、まわり 8m の一番高い所へ広げてからなだらかにする（建物の手前で先に浮き上がり、急に持ち上がらない）
    const F = new Float32Array(GN * GN)
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const k = j * GN + i; F[k] = Math.max(top[k], floorK(-NR + (i + 0.5) * GC, -NR + (j + 0.5) * GC)) }
    const pass = (src, r, op) => { // 横と縦に分けて、まわり r 升の一番高い所（op='max'）か平均（op='avg'）をとる
      const tmp = new Float32Array(GN * GN), out = new Float32Array(GN * GN)
      for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { let m = op === 'max' ? -1e9 : 0, c = 0; for (let d = -r; d <= r; d++) { const ii = Math.min(GN - 1, Math.max(0, i + d)), v = src[j * GN + ii]; if (op === 'max') { if (v > m) m = v } else { m += v; c++ } } tmp[j * GN + i] = op === 'max' ? m : m / c }
      for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { let m = op === 'max' ? -1e9 : 0, c = 0; for (let d = -r; d <= r; d++) { const jj = Math.min(GN - 1, Math.max(0, j + d)), v = tmp[jj * GN + i]; if (op === 'max') { if (v > m) m = v } else { m += v; c++ } } out[j * GN + i] = op === 'max' ? m : m / c }
      return out
    }
    const S = pass(pass(F, 4, 'max'), 3, 'avg')
    G = { top: F, bld, deck, S, trunks, ms: Math.round(performance.now() - t0) }
    return G
  }
  const cellK = (X, Z) => { const i = Math.floor((X + NR) / GC), j = Math.floor((Z + NR) / GC); return i < 0 || j < 0 || i >= GN || j >= GN ? -1 : j * GN + i }
  const softK = (X, Z) => { const g = ensureNav(), u = Math.min(GN - 1.001, Math.max(0, (X + NR) / GC - 0.5)), v = Math.min(GN - 1.001, Math.max(0, (Z + NR) / GC - 0.5)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * GN + i
    return (g.S[k] * (1 - fu) + g.S[k + 1] * fu) * (1 - fv) + (g.S[k + GN] * (1 - fu) + g.S[k + GN + 1] * fu) * fv }
  const trunkK = (X, Z) => { const g = ensureNav(); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = g.trunks.get((Math.floor(X / 8) + a) * 100003 + Math.floor(Z / 8) + b); if (!arr) continue; for (let q = 0; q < arr.length; q += 2) { const dx = X - arr[q], dz = Z - arr[q + 1]; if (dx * dx + dz * dz < 0.36) return true } } return false }
  const blockedK = (X, Z) => { if (Math.abs(X) > EDGE || Math.abs(Z) > EDGE) return true; const k = cellK(X, Z); return (k >= 0 && ensureNav().bld[k] === 1) || trunkK(X, Z) }
  const deckOk = (X, Z, feetK) => { const k = cellK(X, Z); if (k < 0) return NaN; const d = ensureNav().deck[k]; return d === d && Math.abs(d - feetK) < 1.3 ? d : NaN } // 足の高さに近い橋の床だけ（河川敷を歩いていて頭の上の橋に吸い上げられない）
  const half = EDGE / (Math.abs(Math.cos(THREE.MathUtils.degToRad(meta.view.yawDeg))) + Math.abs(Math.sin(THREE.MathUtils.degToRad(meta.view.yawDeg))))
  const cX = TX(0, 0), cZ = TZ(0, 0) // 鴨川デルタ（原点）の町の3Dの座標
  const nav = {
    // 飛べる箱（町の3Dの座標の軸に沿った箱＝近くの地形の網の内側に入る一番大きい四角）。yFloor＝建物・木の上に空ける高さ
    bound: { x: half - cX, xMax: cX + half, zMin: cZ - half, zMax: cZ + half, yMax: 240 - dY, yFloor: 3.5 },
    lms: [{ x: cX, z: cZ }], // 眺めて止まっている時に、ゆっくり回る名所（鴨川デルタ）
    ground: (x, z) => terrK(KX(x, z), KZ(x, z)) - dY, // 地面の高さ
    floor: (x, z) => floorK(KX(x, z), KZ(x, z)) - dY, // 目の下限の元（水の上は水面）
    top: (x, z) => { const X = KX(x, z), Z = KZ(x, z), k = cellK(X, Z); return (k >= 0 ? ensureNav().top[k] : floorK(X, Z)) - dY }, // 建物・木・橋の上（その升）
    topSoft: (x, z) => softK(KX(x, z), KZ(x, z)) - dY, // 飛ぶ時の下限の元（広げてなだらかにした物）
    wet: (x, z) => wetK(KX(x, z), KZ(x, z)) >= 0.5,
    zone: (x, z) => zoneK(KX(x, z), KZ(x, z)), // 0 町・1 河川敷・2 水面
    blocked: (x, z) => blockedK(KX(x, z), KZ(x, z)), // 建物・幹・網の縁（歩けない・カメラを置かない）
    // 足の高さ feetY（町の3Dの座標）から見た地面: 足もとに近い橋の床があればその上、無ければ地面
    groundAt: (x, z, feetY) => { const X = KX(x, z), Z = KZ(x, z), d = deckOk(X, Z, feetY + dY); return (d === d ? d + 0.05 : terrK(X, Z)) - dY },
    // 一歩進めるか: 網の縁・建物・幹でなく、水でない（足もとに近い橋の床の上なら水の上も渡れる）
    canStep: (x, z, feetY) => { const X = KX(x, z), Z = KZ(x, z); if (blockedK(X, Z)) return false; if (deckOk(X, Z, feetY + dY) === deckOk(X, Z, feetY + dY)) return true; return wetK(X, Z) < 0.5 },
    aim: (x, z) => Math.atan2(cX - x, -(cZ - z)), // その所から鴨川デルタを向く向き（町の3Dの向き: 0＝-z）
    place: (x, z, y) => { const X = KX(x, z), Z = KZ(x, z), alt = y + dY - terrK(X, Z)
      if (alt > 70) return '鴨川の上空'; if (Math.hypot(X, Z) < 130) return '鴨川デルタ'; if (wetK(X, Z) >= 0.5) return '鴨川の上'; if (zoneK(X, Z) === 1) return '鴨川の河川敷'; return 'まちなか' },
    gauge: (y) => Math.max(0, Math.min(1, (y + dY - meta.view.groundY) / 150)), // 高さのゲージ（地面から 150m で満ちる）
    deck: (x, z) => { const k = cellK(KX(x, z), KZ(x, z)), d = k >= 0 ? ensureNav().deck[k] : NaN; return d === d ? d - dY : null }, // 橋の床の高さ（無ければ null・検証用）
    info: () => (G ? { ms: G.ms, cells: GN * GN } : null),
  }

  // ── 目: 部屋の目（町の3Dの camera）を鴨川の座標へ写す ──
  const tmp = new THREE.Matrix4()
  let lastFov = -1, lastAspect = -1, lastZoom = -1
  function sync(main) {
    if (main.fov !== lastFov || main.aspect !== lastAspect || main.zoom !== lastZoom) {
      lastFov = camera.fov = main.fov; lastAspect = camera.aspect = main.aspect; lastZoom = camera.zoom = main.zoom; camera.updateProjectionMatrix()
    }
    main.updateMatrixWorld()
    tmp.multiplyMatrices(toKamo, main.matrixWorld)
    camera.matrix.copy(tmp); camera.matrix.decompose(camera.position, camera.quaternion, camera.scale); camera.matrixWorld.copy(tmp); camera.matrixWorldInverse.copy(tmp).invert()
  }
  let tAcc = 0
  function update(dt) {
    tAcc += dt
    water.material.uniforms.time.value += dt * 0.35
    for (const u of windU) u.value = tAcc
  }

  // ── 後処理の1枚目: 鴨川の舞台を描き、この町の明るさで ACES の色の圧縮をかけて書く（部屋はこの上に重ねる） ──
  const state = { exposure: T.exp, bright: 1, shadowDirty: sunL.castShadow }
  function makePass(mainCamera) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: /[?&]kamohf=0/.test(location.search) ? THREE.UnsignedByteType : THREE.HalfFloatType, samples: 0 })
    const quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uKExp: { value: T.exp } },
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `#define toneMappingExposure uKExp
#include <common>
#include <tonemapping_pars_fragment>
uniform sampler2D tDiffuse; varying vec2 vUv;
void main() { gl_FragColor = vec4(ACESFilmicToneMapping(texture2D(tDiffuse, vUv).rgb), 1.0); }`,
    }))
    class KamoPass extends Pass {
      constructor() { super(); this.needsSwap = true }
      setSize(w, h) { rt.setSize(w, h) }
      render(r, writeBuffer) {
        sync(mainCamera)
        // 影は静的（町の3Dが「焼け」の合図 needsUpdate を出した時だけ焼く）。鴨川がその合図を使い切ると、後に描く部屋の影の図が作られず、
        // 影を受ける材（部屋の猫）が描けない（GL の型の食い違い）。鴨川を描いた後に合図を戻し、部屋の影も同じこまで焼く
        const want = r.shadowMap.needsUpdate
        if (state.shadowDirty) { r.shadowMap.needsUpdate = true; state.shadowDirty = false }
        const ac = r.autoClear; r.autoClear = true
        r.setRenderTarget(rt); r.render(scene, camera)
        calls = r.info.render.calls; tris = r.info.render.triangles
        r.autoClear = ac
        if (want) r.shadowMap.needsUpdate = true
        quad.material.uniforms.tDiffuse.value = rt.texture; quad.material.uniforms.uKExp.value = state.exposure * state.bright
        r.setRenderTarget(this.renderToScreen ? null : writeBuffer); quad.render(r)
      }
      dispose() { rt.dispose(); quad.material.dispose(); quad.dispose() }
    }
    return new KamoPass()
  }

  // 後処理が使えない時（例外が続いた時）の直描き: 鴨川を画面へ描いてから、部屋を重ねる
  function renderDirect(r, mainCamera, drawRoom) {
    sync(mainCamera)
    const want = r.shadowMap.needsUpdate
    if (state.shadowDirty) { r.shadowMap.needsUpdate = true; state.shadowDirty = false }
    const tm = r.toneMapping, te = r.toneMappingExposure, ac = r.autoClear
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = state.exposure * state.bright
    r.setRenderTarget(null); r.autoClear = true; r.render(scene, camera)
    if (want) r.shadowMap.needsUpdate = true
    r.toneMapping = tm; r.toneMappingExposure = te; r.autoClear = false; r.clearDepth(); drawRoom(); r.autoClear = ac
  }

  // 測る用（?dev=1 の時だけ）: ?kamohide=water,crown,… でその部品を描かない（どこが重いかを切り分ける）
  if (/[?&]dev=1/.test(location.search)) { const m = location.search.match(/[?&]kamohide=([w,]+)/); if (m) { const hide = new Set(m[1].split(',')); scene.traverse((o) => { if (o.userData && hide.has(o.userData.part)) o.visible = false }) } }
  let calls = 0, tris = 0
  // 描く三角形の内訳（調べ用・1回だけ数える）。名前は部品の種類
  const parts = {}
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    const g = o.geometry, n = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1)
    const k = o.userData.part || (o.isInstancedMesh ? 'inst' : 'mesh'); parts[k] = (parts[k] || 0) + Math.round(n)
  })
  return {
    scene, camera, sync, update, makePass, renderDirect, removed, nav,
    setBright(b) { state.bright = b || 1 },
    setRoomShown(b) { if (plug) plug.visible = !b }, // 便19: 部屋が見えている間は窓の所を空け、隠れている間（空・地上）は塞ぐ
    info() { return { calls, tris, removed: removed.length, low, time: TK, sky, shadow: sunL.castShadow, exposure: state.exposure, parts, nav: nav.info(), waveTop20 } },
    countFrame(r) { calls = r.info.render.calls; tris = r.info.render.triangles },
    dispose() {
      try {
        const mrt = water.material.uniforms.mirrorSampler.value
        if (mrt && mrt.renderTarget) mrt.renderTarget.dispose()
        if (sunL.shadow && sunL.shadow.map) sunL.shadow.map.dispose()
        scene.traverse((o) => { if (o.isInstancedMesh) o.dispose() })
        for (const d of disposables) { try { d.dispose() } catch (e) { /* 無視 */ } }
      } catch (e) { /* 無視 */ }
    },
  }
}
