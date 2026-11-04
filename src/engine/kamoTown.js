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
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { buildLife } from './kamoLife.js'

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
  // 便20: 人や電車が動く所と名所の位置（life.json・小さい）。読めなくても町は開く（動く物と時々の出来事が無いだけ）
  const lifeP = fetch(base + 'life.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const [terrain, bldg, roads, misc, lmT, lmB, ...tex] = await Promise.all([
    gunzip(base + F.terrain.file), gunzip(base + F.bldg.file), gunzip(base + F.roads.file), gunzip(base + F.misc.file),
    img(`lm_terrain${sfx}.jpg`), img(`lm_bldg${sfx}.jpg`),
    ...meta.tex.flatMap((n) => [img(`tex/${n}_d${sfx}.jpg`), img(`tex/${n}_n${sfx}.jpg`)]),
  ])
  const texMap = {}
  meta.tex.forEach((n, i) => { texMap[n] = { d: tex[i * 2], n: tex[i * 2 + 1] } })
  return { meta, low, buf: { terrain, bldg, roads, misc }, lm: { terrain: lmT, bldg: lmB }, tex: texMap, life: await lifeP }
}

/**
 * 鴨川の町を組む。
 * data: loadKamo の返り値／toKamo: 町の3Dの座標 → 鴨川の座標（部屋の窓を鴨川の窓の位置と向きへ写す行列）
 * roomBox: 町の3Dの座標での部屋の箱（この中に入る建物は描かない＝部屋が建っている建物と、部屋に食い込む隣の建物）
 */
export function buildKamo(data, { renderer, toKamo, roomBox, season = 'autumn', time = null, sky = 'clear', shadowSize = 0, onSound = null, reduceMotion = false }) {
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
  // ── 便21: 雲の層・星・月（kamocloud=0 は外し回し用＝前の雲の無い空） ──
  //   空の上の丸天井に、計算で作る雲（重ねた雑音・ゆっくり流れる）を張る。量は天気（晴れ 少し・曇り 多め・雨 一面）、色は時刻（朝 白く暖か・昼 白・夕 茜と紫・夜 町の灯りが下から映る暗い雲）。
  //   日の側は縁が明るく光り、日の反対へ影を落とす（日の向きへ1つずらした雲の濃さで陰を決める）。晴れた夜は星と月。iPhone の段は雑音の重ねを減らす
  const cloudU = { value: 0 }
  let cloudMesh = null
  if (!/[?&]kamocloud=0/.test(location.search)) {
    const COV = { clear: NIGHT ? 0.33 : 0.39, cloudy: 0.55, rain: 0.9, snow: 0.82 }[sky] ?? 0.39 // 雲の量（晴れ 1割強・曇り 4割ほど・雨と雪は一面）
    const disp = { // 画面に出したい雲の色（日の当たる所・陰）。invTone でこの町の明るさの前の値に戻す
      morning: [[0.84, 0.81, 0.76], [0.52, 0.56, 0.64]], noon: [[0.86, 0.86, 0.85], [0.56, 0.6, 0.68]], // 白（1.0）を指すと色の圧縮を戻した値が大きくなりすぎて桃色にずれた（便21 の1回目）＝0.9 より下に抑える
      dusk: [[0.88, 0.6, 0.44], [0.32, 0.27, 0.36]], night: [[0.075, 0.072, 0.08], [0.028, 0.03, 0.042]],
    }[TK]
    const wet = RAIN ? [[0.5, 0.52, 0.55], [0.3, 0.32, 0.36]] : SNOW ? [[0.74, 0.76, 0.79], [0.5, 0.52, 0.57]] : null
    const [lit, shd] = (wet && !NIGHT ? wet : disp).map((c) => invTone(...c))
    const stars = NIGHT && !RAIN && !SNOW && sky !== 'cloudy'
    const moonDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(150))
    const cm = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: true, transparent: true, fog: false,
      uniforms: { uT: cloudU, uCov: { value: COV }, uLit: { value: lit }, uShd: { value: shd }, uSun: { value: sunDir.clone() }, uSunK: { value: NIGHT ? 0 : SK.sunK }, uStar: { value: stars ? 1 : 0 }, uMoon: { value: moonDir }, uStarC: { value: invTone(0.85, 0.87, 0.95) }, uMoonC: { value: invTone(0.92, 0.9, 0.82) } },
      vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `uniform float uT, uCov, uSunK, uStar; uniform vec3 uLit, uShd, uSun, uMoon, uStarC, uMoonC; varying vec3 vD;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < ${low ? 4 : 6}; i++) { s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; } return s; }
float dens(vec2 uv) { float n = fbm(uv + vec2(uT * 0.004, uT * 0.0016)); float w = fbm(uv * 0.35 - vec2(uT * 0.001, 0.0)); return smoothstep(1.0 - uCov, 1.0 - uCov + 0.32, n * 0.75 + w * 0.45 - 0.1); }
void main() {
  vec3 d = normalize(vD); float hor = smoothstep(0.0, 0.14, d.y);
  vec3 col = vec3(0.0); float a = 0.0;
  if (uStar > 0.5 && d.y > 0.02) { // 星（方向の升ごとに1つ・またたく）と月
    vec2 sp = vec2(atan(d.z, d.x) * 180.0, d.y * 260.0); vec2 si = floor(sp); float r = h21(si);
    if (r > 0.978) { vec2 sf = fract(sp) - vec2(h21(si + 3.1), h21(si + 7.7)) * 0.6 - 0.2; float st = smoothstep(0.09, 0.0, length(sf)) * (0.5 + 0.5 * sin(uT * (1.5 + r * 3.0) + r * 40.0)); col += uStarC * st * (r - 0.978) * 45.0 * hor; a = max(a, st * hor); }
    float md = dot(d, normalize(uMoon)); col += uMoonC * (smoothstep(0.99986, 0.99992, md) * 3.0 + pow(max(md, 0.0), 1600.0) * 0.25); a = max(a, smoothstep(0.99984, 0.99992, md) + pow(max(md, 0.0), 1600.0) * 0.18);
  }
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.12) * 1.6;
    float c = dens(uv);
    if (c > 0.002) {
      float sh = dens(uv + normalize(uSun.xz + vec2(1e-4)) * 0.18); // 日の向きへずらした所の濃さ＝陰
      float sunSide = pow(max(dot(d, uSun), 0.0), 6.0) * uSunK;
      vec3 cc = mix(uLit, uShd, clamp(sh * 1.1 - c * 0.15, 0.0, 1.0) * 0.85 + c * 0.15);
      cc += uLit * sunSide * (1.0 - c) * 0.35; // 日の側の縁の光
      float ca = c * hor * 0.96;
      col = mix(col, cc, ca); a = max(a, ca);
    }
  }
  if (a < 0.003) discard;
  gl_FragColor = vec4(col / max(a, 1e-3), a);
}`,
    })
    cloudMesh = new THREE.Mesh(keep(new THREE.SphereGeometry(19000, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2)), keep(cm))
    cloudMesh.renderOrder = -1; cloudMesh.frustumCulled = false; cloudMesh.userData.part = 'clouds'; scene.add(cloudMesh)
  }
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

  // 便21: 近くの範囲は四角（x0..x1・z0..z1）。京都大学・吉田山まで東へ広げた。焼いた地形の図の位置は u＝西の端 0・v＝南の端 0
  const NX0 = meta.near.x0, NX1 = meta.near.x1, NZ0 = meta.near.z0, NZ1 = meta.near.z1, NW = NX1 - NX0, ND = NZ1 - NZ0, WY = meta.waterY
  const lmU = (x) => (x - NX0) / NW, lmV = (z) => (-z + NZ1) / ND
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
  //   ~~本物の暗がり（路地・軒下）は 0.1 より上に焼けているので、0.04 より下だけを「焼けていない所」として並みの明るさ 0.55 で埋める（gate/probe-lm-mae.txt）~~
  //   （【便19・外の目】上の数は JPEG の画素を 0〜1 で読んだ値＝sRGB。図は SRGBColorSpace なのでシェーダーの中では線形に戻った値で比べる＝線形の 0.04 は sRGB の約 0.22、0.55 は約 0.77 で、
  //    本物の暗がりまで埋まり、埋めた面が並みの壁より明るく浮いた。線形の値に直した: sRGB 0.04 → 線形 0.0031 より下を、sRGB 0.55 → 線形 0.26 で埋める）
  function useBake(mat, tex, { fill = false } = {}) {
    mat.aoMap = tex; mat.aoMapIntensity = 1
    const frag = fill ? AOFRAG.replace('float ambientOcclusion = clamp( texture2D( aoMap, vAoMapUv ).r * 1.25, 0.0, 1.25 );', 'float lmRaw = texture2D( aoMap, vAoMapUv ).r; float ambientOcclusion = clamp( ( lmRaw < 0.0031 ? 0.26 : lmRaw ) * 1.25, 0.0, 1.25 );') : AOFRAG
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

  // ── 便21: 京都らしい家並みの描き方（建物ごとの形の種類 aKB.z: 0 今の家・1 京町家・2 古民家・3 集合住宅とビル・4 大きな施設・5 寺社） ──
  //   町家の表（通りに面する壁）: 足もとの石・1階の縦格子（細い木の格子 7.5cm おき・中に横の桟）・通り庇の陰・2階（厨子二階）の土壁と虫籠窓（縦の格子の細い窓）。横と裏は腰板と土壁
  //   古民家: 腰板（下 0.9m）・土壁か白い漆喰・一間（1.82m）おきの柱・格子のガラス戸。寺社: 白壁と太い柱
  //   屋根（build.mjs が足した切妻と寄棟）: いぶし銀の桟瓦（瓦の段の陰と桟の波）。今の家の一部は黒や茶のスレート
  //   夕方と夜は、町家の格子と虫籠窓、古民家のガラス戸の一部に、内の灯りが温かく透ける
  let KYO = false
  const kyoCount = [0, 0, 0, 0, 0, 0]
  function useKyo(mat, isWall) {
    mat.onBeforeCompile = chain(mat.onBeforeCompile, (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aKB; varying vec4 vKB;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvKB = aKB;')
      const wallCode = `
    if (abs(kN.y) < 0.3) {
      vec2 wn = normalize(kN.xz + vec2(1e-5)); float isF = step(0.8, dot(wn, fd)); float al = dot(vGW.xz, vec2(wn.y, -wn.x));
      vec3 c = vec3(-1.0); float glowOK = step(1.0 - uLit * 1.1, fract(kR * 7.31)); // 夜は 3割ほどの家に内の灯り
      if (kS == 1) {
        if (isF > 0.5) {
          if (hl < 0.32) c = vec3(0.16, 0.16, 0.15) * kDet;
          else if (hl < 2.72) { // 間口を 1.8m ごとに分け、3つに1つは出入り口の戸（濃い木の板戸と上の明かり取り）、ほかは千本格子（4.5cm おき・遠くは平均の色にならす）
            float bay = floor(al / 1.82 + kR * 3.0), door = step(fract(bay * 0.37 + kR) , 0.3), fw = fwidth(al / 0.045);
            float bar = mix(smoothstep(0.38, 0.52, fract(al / 0.045)), 0.55, smoothstep(0.12, 0.45, fw)); float rail = max(step(abs(hl - 1.0), 0.025), step(abs(hl - 2.42), 0.035)); float frm = step(fract(al / 1.82 + kR * 3.0), 0.035);
            vec3 lat = mix(vec3(0.03, 0.021, 0.015), vec3(0.17, 0.104, 0.058), max(max(bar, rail), frm));
            vec3 dr = mix(vec3(0.07, 0.042, 0.024), vec3(0.11, 0.07, 0.04), step(0.5, fract(al / 0.3))) * (hl > 2.05 ? 0.5 : 1.0);
            c = mix(lat, max(dr, frm * vec3(0.13, 0.078, 0.043)), door); kGlowC += vec3(1.0, 0.62, 0.3) * 0.2 * (1.0 - max(bar, rail)) * glowOK * step(0.55, hl) * (1.0 - door); }
          else if (hl < 3.12) c = vec3(0.035, 0.03, 0.026);
          else { c = vec3(0.6, 0.54, 0.43) * kDet; float wy = step(3.55, hl) * step(hl, 4.2), wx = step(0.18, fract(al / 2.4)) * step(fract(al / 2.4), 0.62); if (wy * wx > 0.5) { float gp = step(0.5, fract(al / 0.11)); c = mix(vec3(0.03, 0.024, 0.02), c, gp); kGlowC += vec3(1.0, 0.66, 0.34) * 0.22 * (1.0 - gp) * glowOK; } }
        } else c = hl < 1.0 ? vec3(0.085, 0.052, 0.03) * (0.8 + 0.2 * step(0.1, fract(al / 0.2))) : vec3(0.64, 0.58, 0.48) * kDet;
        kWin = 0.0;
      } else if (kS == 2) {
        float pil = step(fract(al / 1.82), 0.07);
        if (hl < 0.9) c = vec3(0.08, 0.05, 0.03) * (0.8 + 0.2 * step(0.1, fract(al / 0.21)));
        else { c = (kR < 0.5 ? vec3(0.48, 0.38, 0.26) : vec3(0.66, 0.62, 0.54)) * kDet;
          float g = step(1.0, hl) * step(hl, 2.25) * step(0.2, fract(al / 3.64 + kR)) * step(fract(al / 3.64 + kR), 0.62);
          if (g > 0.5) { float lat = max(step(0.9, fract(al / 0.3)), step(0.88, fract(hl / 0.36))); c = mix(vec3(0.06, 0.065, 0.07), vec3(0.08, 0.05, 0.03), lat); kGlowC += vec3(1.0, 0.7, 0.4) * 0.3 * (1.0 - lat) * glowOK; } }
        c = mix(c, vec3(0.06, 0.035, 0.02), pil); kWin = 0.0;
      } else if (kS == 5) {
        float pil = step(fract(al / 2.5), 0.12); c = mix(vec3(0.7, 0.68, 0.62) * kDet, vec3(0.1, 0.06, 0.035), max(pil, step(hl, 0.6))); kWin = 0.0;
      }
      if (c.x >= 0.0) diffuseColor.rgb = c;
    } else`
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vKB;')
        .replace('vec2 tuv = gmix > 0.5 ? tuvB : tuvA;', `vec2 tuv = gmix > 0.5 ? tuvB : tuvA;
  float kWin = 1.0; vec3 kGlowC = vec3(0.0);
  { int kS = int(vKB.z + 0.5); float hl = vGW.y - vKB.x, kR = vKB.w; vec2 fd = vec2(sin(vKB.y), cos(vKB.y)); vec3 kN = normalize(vGN);
    float kDet = mix(1.0, clamp(dot(mix(detA, detB, gmix), vec3(0.3333)), 0.65, 1.35), 0.45); // 壁の写真の模様のむらは半分に（土壁や漆喰がまだらに汚れて見えた）
    ${isWall ? wallCode : ''}
    if (kS == 1 || kS == 2 || kS == 5 || (kS == 0 && kN.y < 0.985)) {
      vec2 sd = length(kN.xz) > 0.05 ? normalize(kN.xz) : fd, pd = vec2(sd.y, -sd.x);
      float v = dot(vGW.xz, sd) / max(0.3, kN.y), u = dot(vGW.xz, pd);
      float row = smoothstep(0.72, 0.97, fract(v / 0.26)), wave = 0.78 + 0.22 * sin(u / 0.29 * 6.2832);
      vec3 tile = (kS == 0 && kR > 0.6) ? (kR > 0.82 ? vec3(0.05, 0.065, 0.09) : vec3(0.09, 0.06, 0.042)) : vec3(0.1, 0.108, 0.122) * (0.88 + kR * 0.25);
      diffuseColor.rgb = tile * wave * mix(1.0, 0.42, row) * kDet;
      ${SNOW ? 'if (kN.y > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.9), 0.65);' : ''}
    } else if (kN.y >= 0.45) { // 平らな屋上（集合住宅・ビル・大きな施設・平屋根の家）: コンクリートや防水の灰色（前は瓦の模様と暗い色が当たり、夕方に真っ黒に沈んだ）
      diffuseColor.rgb = vec3(0.3, 0.29, 0.27) * (0.82 + 0.36 * kR) * kDet;
      ${SNOW ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.88, 0.9), 0.65);' : ''}
    }
  }`)
      if (isWall) sh.fragmentShader = sh.fragmentShader.replace('winMask *= step(0.25, wHash(wcell + floor(vWW.xz * 0.05)));', 'winMask *= step(0.25, wHash(wcell + floor(vWW.xz * 0.05))) * kWin;')
        .replace('totalEmissiveRadiance += winMask *', 'totalEmissiveRadiance += kGlowC * uLitI; totalEmissiveRadiance += winMask *')
    })
    addKey(mat, 'kyo' + (isWall ? 'W' : 'R'))
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
  // 便21: 東西 nx 点・南北 nz 点の四角の網（x0・z0 が北西の角）。tiles＝[東西の区画の数, 南北の区画の数]
  function gridTiles({ nx, nz, x0, z0, step, hs, hq, dec, tiles, paint, withUv1 }) {
    const m = (nx - 1) / dec + 1, mz = (nz - 1) / dec + 1, st = step * dec
    const pos = new Float32Array(m * mz * 3)
    for (let j = 0; j < mz; j++) for (let i = 0; i < m; i++) { const k = j * m + i; pos[k * 3] = x0 + i * st; pos[k * 3 + 1] = hs[j * dec * nx + i * dec] * hq; pos[k * 3 + 2] = z0 + j * st }
    const full = new THREE.BufferGeometry(); full.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const fi = new Uint32Array((m - 1) * (mz - 1) * 6); let q = 0
    for (let j = 0; j < mz - 1; j++) for (let i = 0; i < m - 1; i++) { const a = j * m + i, b = a + 1, c = a + m, d = c + 1; fi[q++] = a; fi[q++] = c; fi[q++] = b; fi[q++] = b; fi[q++] = c; fi[q++] = d }
    full.setIndex(new THREE.BufferAttribute(fi, 1)); full.computeVertexNormals()
    const nrm = full.attributes.normal.array; full.dispose()
    const col = new Float32Array(m * mz * 3), uv1 = withUv1 ? new Float32Array(m * mz * 2) : null, c = new THREE.Color()
    for (let j = 0; j < mz; j++) for (let i = 0; i < m; i++) {
      const k = j * m + i, x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2]
      paint(c, x, y, z, nrm[k * 3 + 1], j * dec * nx + i * dec); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b
      if (uv1) { uv1[k * 2] = lmU(x); uv1[k * 2 + 1] = lmV(z) }
    }
    const out = [], [tX, tZ] = tiles, tq = Math.ceil((m - 1) / tX), tqz = Math.ceil((mz - 1) / tZ)
    for (let tj = 0; tj < tZ; tj++) for (let ti = 0; ti < tX; ti++) {
      const i0 = ti * tq, i1 = Math.min(m - 1, i0 + tq), j0 = tj * tqz, j1 = Math.min(mz - 1, j0 + tqz); if (i0 >= i1 || j0 >= j1) continue
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
  // ── 便21: 水の深さの図（build.mjs の wdepth・0.25cm 刻み）。水面の透け方・川底の光の網・目の下限に使う。古いデータ（無い時）は前の作り ──
  const wdepA = meta.files.terrain.secs.wdepth ? view(data.buf.terrain, meta.files.terrain.secs.wdepth) : null, WDS = meta.wdepthStep || 0.0025
  let depthTex = null
  if (wdepA) { depthTex = keep(new THREE.DataTexture(wdepA, meta.near.nx, meta.near.nz, THREE.RedFormat, THREE.UnsignedByteType)); depthTex.unpackAlignment = 1; depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true }
  const f5 = (v) => (+v).toFixed(5)
  const KUV = `vec2 kUV(vec2 p) { return vec2(((p.x - (${f5(NX0)})) / ${f5(meta.near.step)} + 0.5) / ${f5(meta.near.nx)}, ((p.y - (${f5(NZ0)})) / ${f5(meta.near.step)} + 0.5) / ${f5(meta.near.nz)}); }`
  // 川底に揺れる光の網（日なたの浅い水の底）。強さは時刻と空で決める（朝と昼 1・夕 0.45・曇り 0.4 倍・雨と雪と夜 0）
  const CAUS = NIGHT || RAIN || SNOW ? 0 : (TK === 'dusk' ? 0.45 : 1) * (sky === 'cloudy' ? 0.4 : 1)
  const causU = { value: 0 } // 時計は update() で進める
  {
    const cGrass = new THREE.Color(GRASS), cGravel = new THREE.Color(0x8a8272), cWet = new THREE.Color(0x5e5a50), cWall = new THREE.Color(0x8c877c), cTown = new THREE.Color(0x8a867e)
    const cBed = new THREE.Color(0xa89e8a), cBed2 = new THREE.Color(0x7d8462), cBed3 = new THREE.Color(0xbdb4a0) // 便21: 川底の丸い礫（灰〜茶灰）・苔の緑・明るい礫
    const paint = (c, x, y, z, ny, k) => {
      const h = y - WY, nz = vn(x, z)
      if (zone[k] === 2) { if (wdepA) { const d = wdepA[k] * WDS; c.copy(cBed).lerp(cBed3, vn(x * 3.1, z * 2.7) * 0.6).lerp(cBed2, Math.min(1, d / 0.42) * 0.55 * vn(x * 1.3 + 7, z * 1.7)).multiplyScalar(0.92 - d * 0.35) } else c.copy(cWet).lerp(cGravel, 0.4) } // 水面の下（浅い所の川底の石）。便21: 浅瀬の川底は明るい礫、深い所ほど苔の緑がかる
      else if (zone[k] === 1) { if (ny < 0.8) c.copy(cWall); else c.copy(cGrass).offsetHSL(0, 0, (nz - 0.5) * 0.1).lerp(cGravel, Math.max(0, 1 - Math.abs(h - 0.4)) * 0.6) } // 河川敷の草・水際の砂利・護岸
      else if (ny < 0.8) c.copy(cWall)
      else c.copy(cTown).lerp(cGrass, nz * 0.12) // 町の地面（道と建物の間）
      if (SNOW && zone[k] !== 2 && ny > 0.6) c.lerp(WHITE, 0.62)
    }
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RAIN ? 0.6 : 0.95, metalness: 0 }))
    useBake(m, data.lm.terrain)
    useTex(m, { a: 'gravel_road', b: 'grass_path_2', tile: 3.2, tileB: 3.5 })
    if (depthTex) { // 便21: 川底のこぶし大の丸い礫（近くだけ）と、日なたの光の網（水の深さが 1cm 以上の所だけ・浅い所から深い所へ薄れる）
      m.onBeforeCompile = chain(m.onBeforeCompile, (sh) => {
        sh.uniforms.uDepth = { value: depthTex }; sh.uniforms.uCT = causU
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D uDepth; uniform float uCT;
${KUV}
float kCaus(vec2 p, float t) { vec2 q = p * 0.9; float c = 0.0;
  for (int i = 0; i < 3; i++) { q += vec2(sin(q.y * 1.7 + t * 0.9 + float(i)), cos(q.x * 1.3 - t * 0.7)) * 0.65; c += 1.0 / (1.0 + 9.0 * abs(sin(q.x) + sin(q.y))); }
  return c / 3.0; }`).replace('#include <color_fragment>', `#include <color_fragment>
  { float kd = texture2D(uDepth, kUV(vGW.xz)).r * ${f5(WDS * 255)};
    if (kd > 0.01) { float cs = kCaus(vGW.xz, uCT * 1.3) * kCaus(vGW.xz * 0.7 + 3.1, uCT * 1.1 + 2.0);
      diffuseColor.rgb *= 0.9 + cs * ${f5(4.0 * CAUS)} * smoothstep(0.01, 0.06, kd) * (1.0 - smoothstep(0.25, 0.5, kd) * 0.5);
      vec2 g = vGW.xz * 4.5, ip = floor(g), fp = fract(g); float d1 = 8.0, d2 = 8.0, tone = 0.5;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)), cc = ip + o; vec2 h = fract(sin(vec2(dot(cc, vec2(127.1, 311.7)), dot(cc, vec2(269.5, 183.3)))) * 43758.5453); vec2 r = o + h * 0.8 + 0.1 - fp; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; tone = h.x; } else if (d < d2) d2 = d; }
      float near = 1.0 - smoothstep(0.25, 0.7, length(fwidth(g)));
      diffuseColor.rgb *= mix(1.0, mix(0.5, 1.0, smoothstep(0.0, 0.14, sqrt(d2) - sqrt(d1))) * (0.8 + 0.4 * tone), near * smoothstep(0.0, 0.03, kd)); } }`)
      })
      addKey(m, 'caus')
    }
    for (const g of gridTiles({ nx: meta.near.nx, nz: meta.near.nz, x0: NX0, z0: NZ0, step: meta.near.step, hs: terrain, hq: meta.near.hStep, dec: low ? 2 : 1, tiles: [6, 4], paint, withUv1: true })) {
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
    for (const g of gridTiles({ nx: meta.far.n, nz: meta.far.n, x0: -meta.far.R, z0: -meta.far.R, step: meta.far.step, hs: farH, hq: meta.far.hStep, dec: low ? 2 : 1, tiles: [4, 4], paint, withUv1: false })) {
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.userData.part = 'terrainFar'; scene.add(mesh)
    }
  }

  const navSrc = {} // 便19: 飛ぶ・歩くの道案内（下の makeNav）が使う、建物と橋の形
  // ── 道・小道・橋・線路（地形の焼いた光をそのまま使う） ──
  {
    const sec = meta.files.roads.secs, ps = meta.roads.pStep, po = meta.roads.pOff || [0, 0, 0] // 便21: 範囲の中心を引いて詰めてある
    const p16 = view(data.buf.roads, sec.pos), idx = view(data.buf.roads, sec.idx), kind = view(data.buf.roads, sec.kind)
    const P = new Array(p16.length); for (let i = 0; i < p16.length; i++) P[i] = p16[i] * ps + po[i % 3]
    const I = Array.from(idx), K = Array.from(kind), pos = P.slice()
    navSrc.roads = { pos, idx, kind }
    for (let t = 0; t < idx.length; t += 6) { // 橋の床の両側に、下へ 1.5m の桁を足す
      const a = idx[t]; if (kind[a] !== 2) continue
      for (const [e0, e1] of [[a, a + 2], [a + 1, a + 3]]) { const b = P.length / 3; P.push(pos[e0 * 3], pos[e0 * 3 + 1], pos[e0 * 3 + 2], pos[e1 * 3], pos[e1 * 3 + 1], pos[e1 * 3 + 2], pos[e0 * 3], pos[e0 * 3 + 1] - 1.5, pos[e0 * 3 + 2], pos[e1 * 3], pos[e1 * 3 + 1] - 1.5, pos[e1 * 3 + 2]); K.push(4, 4, 4, 4); I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3) }
    }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I)
    const col = new Float32Array(K.length * 3), uv1 = new Float32Array(K.length * 2), c = new THREE.Color()
    const CK = [0x55575a, 0xb0a690, 0x8d8a84, 0x6a5e52, 0x7c7a76]
    for (let i = 0; i < K.length; i++) { c.setHex(CK[K[i]]); if (SNOW && K[i] !== 4) c.lerp(WHITE, K[i] === 0 ? 0.35 : 0.55); col.set([c.r, c.g, c.b], i * 3); uv1.set([lmU(P[i * 3]), lmV(P[i * 3 + 2])], i * 2) }
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
    const tW0 = performance.now()
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
    const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; waterMs = Math.round(performance.now() - tW0); return keep(t)
  }
  let water, waveTop20 = null, waterMs = null, waterRot = false, waterShallow = false // 便19: 水面の図を作った時間（ms）・読む向きを回す差し替えが効いたか（検査 K15）。便21: 浅瀬の水の差し替えが効いたか
  {
    const sec = meta.files.misc.secs, wp = view(data.buf.misc, sec.wpos), wi = view(data.buf.misc, sec.widx), nv = meta.water.nv
    const lp = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { lp[i * 3] = wp[i * 3]; lp[i * 3 + 1] = -wp[i * 3 + 2]; lp[i * 3 + 2] = wp[i * 3 + 1] - WY } // 水面の板の中の座標（回して y=WY に置く）
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(lp, 3)); g.setIndex(new THREE.BufferAttribute(Uint32Array.from(wi), 1)); g.computeVertexNormals()
    const tw = low ? 512 : 1024
    // 便21: 水の色は澄んだ浅瀬の緑がかった色（前の濃い紺 0x2a3b38 は深く見えて怖かった＝裁定記録 便21）。雨の日は濁った茶緑
    water = new Water(g, { textureWidth: tw, textureHeight: tw, waterNormals: waterNormals(), sunDirection: sunDir.clone(), sunColor: NIGHT ? 0x445066 : RAIN || SNOW ? 0x8a929c : T.sun, waterColor: SNOW ? 0x3a4a4c : RAIN ? 0x4a4c3c : NIGHT ? 0x1e2a2a : 0x4f6a5c, distortionScale: RAIN ? 3.2 : 2.2, fog: true, alpha: 1 })
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
      waterRot = water.material.fragmentShader.includes('mat2( 0.8253') // 差し替えの文が合わなくなると黙って元のままになるので、効いたかを残す
      water.material.needsUpdate = true
    }
    // 便21: 浅瀬の水（kamoshallow=0 は外し回し用＝前の不透明な水）。
    //   ・川底が透ける: 真上から見るほど透け、寝た角度ほど空と岸が映る。浅い所ほど透ける（水の深さの図）
    //   ・流れ: 賀茂川と高野川はデルタの先へ、合流の後は南へ。波の模様を流れの向きに運ぶ（2つの位相を交互に混ぜて、模様が伸びない形）
    //   ・白いさざ波: 堰（落差工・帯工）と飛び石の列の下流 7m に、流れに沿った白い筋（調べ §6「滝のような白い帯ではなく、さざ波の白い筋」）
    if (depthTex && !/[?&]kamoshallow=0/.test(location.search)) {
      const segs = [...(meta.weirs || []), ...((meta.stones && meta.stones.rows) || [])], NSEG = Math.min(32, segs.length / 4)
      const segU = []; for (let i = 0; i < 32; i++) segU.push(i < NSEG ? new THREE.Vector4(segs[i * 4], segs[i * 4 + 1], segs[i * 4 + 2], segs[i * 4 + 3]) : new THREE.Vector4())
      const clar = NIGHT ? 0.9 : RAIN ? 0.72 : SNOW ? 0.62 : TK === 'dusk' ? 0.42 : 0.3
      const foamLit = NIGHT ? new THREE.Color(0.05, 0.055, 0.065) : new THREE.Color(T.sun).multiplyScalar(0.55 * SK.sunK).add(new THREE.Color(T.hemi[0]).multiplyScalar(0.35))
      Object.assign(water.material.uniforms, { uDepth: { value: depthTex }, uSeg: { value: segU }, uNSeg: { value: NSEG }, uClar: { value: clar }, uFoamLit: { value: foamLit } })
      let fs = water.material.fragmentShader
      fs = fs.replace('void main() {', `uniform sampler2D uDepth; uniform vec4 uSeg[32]; uniform float uNSeg; uniform float uClar; uniform vec3 uFoamLit;
${KUV}
vec2 kFlow(vec2 p) {
  vec2 tip = vec2(-62.0, 60.0), toTip = tip - p; float L = length(toTip);
  vec2 up = L > 0.5 ? toTip / L : vec2(0.0, 1.0), dn = normalize(vec2(-0.06, 1.0));
  return normalize(mix(up, dn, smoothstep(tip.y - 30.0, tip.y + 10.0, p.y)));
}
vec4 kFlowNoise(vec2 p) {
  vec2 f = kFlow(p) * 3.5; float ph = time * 0.45, t0 = fract(ph), t1 = fract(ph + 0.5), w = abs(t0 * 2.0 - 1.0);
  return mix(getNoise((p - f * t0) * size), getNoise((p - f * t1 + vec2(19.3, 7.7)) * size), w);
}
float kSegFoam(vec2 p, vec2 fl) {
  float best = 0.0;
  for (int i = 0; i < 32; i++) { if (float(i) >= uNSeg) break;
    vec4 s = uSeg[i]; vec2 ab = s.zw - s.xy; float t = clamp(dot(p - s.xy, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    vec2 q = p - (s.xy + ab * t); float along = dot(q, fl); float across = length(q - fl * along);
    best = max(best, (1.0 - smoothstep(0.0, 7.0, along)) * smoothstep(-0.6, 0.3, along) * (1.0 - smoothstep(0.6, 1.6, across)));
  }
  return best;
}
void main() {`)
      fs = fs.replace('vec4 noise = getNoise( worldPosition.xz * size );', 'vec4 noise = kFlowNoise( worldPosition.xz );')
      fs = fs.replace(/float theta = max\( dot\( eyeDirection, surfaceNormal \), 0\.0 \);[\s\S]*?gl_FragColor = vec4\( outgoingLight, alpha \);/, `float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
					float reflectance = 0.02 + 0.98 * pow( ( 1.0 - theta ), 5.0 );
					vec2 kp = worldPosition.xz; float dep = texture2D( uDepth, kUV( kp ) ).r * ${f5(WDS * 255)};
					vec2 fl = kFlow( kp ), pr = vec2( fl.y, -fl.x );
					float n1 = texture2D( normalSampler, vec2( dot( kp, pr ) * 0.35, dot( kp, fl ) * 0.06 - time * 0.9 ) ).r - 0.5;
					float n2 = texture2D( normalSampler, vec2( dot( kp, pr ) * 0.9 + 0.3, dot( kp, fl ) * 0.15 - time * 1.4 ) ).g - 0.5;
					float streak = smoothstep( -0.02, 0.22, n1 + n2 );
					float foam = kSegFoam( kp, fl ) * streak + ( 1.0 - smoothstep( 0.03, 0.11, dep ) ) * 0.22 * streak;
					vec3 body = waterColor * ( 0.6 + 0.4 * getShadowMask() ) * ( sunColor * 0.25 + vec3( 0.55 ) );
					float aBody = mix( uClar * 0.45, uClar, smoothstep( 0.04, 0.4, dep ) );
					vec3 outgoingLight = mix( body, reflectionSample, reflectance ) + specularLight;
					float a = clamp( aBody + reflectance * ( 1.0 - aBody ) + dot( specularLight, vec3( 0.25 ) ), 0.0, 1.0 );
					outgoingLight = mix( outgoingLight, uFoamLit, foam ); a = mix( a, 1.0, foam * 0.85 );
					gl_FragColor = vec4( outgoingLight, a );`)
      waterShallow = fs.includes('kSegFoam( kp, fl )') && fs.includes('kFlowNoise( worldPosition.xz )') // 差し替えが効いたか（検査）
      water.material.fragmentShader = fs; water.material.transparent = true; water.material.needsUpdate = true
    }
    water.rotation.x = -Math.PI / 2; water.position.y = WY; water.material.uniforms.size.value = 2.2
    keep(water.material); water.userData.part = 'water'; scene.add(water)
  }

  // ── 建物（PLATEAU LOD2）。壁と屋根で分け、建物ごとに色を変える。区画（400m）ごとに描く ──
  // 部屋のある建物: 窓を置いた建物（PLATEAU）は高さの記録が 24.8m なのに形が 5.6m しかなく、部屋がその屋根の 16m 上に浮いていた（便18 で見つけた）。
  //   部屋のあるマンションの外壁（窓の下と横・屋上）を足し、その中に入る PLATEAU の建物は描かない（重なる面のちらつきも出さない）
  const fromKamo = toKamo.clone().invert()
  const removed = []
  let plug = null, plugForce = null // 便19: 部屋の窓の所を塞ぐ壁（部屋が隠れている間だけ出す）・検証で決め打ちする値
  // 部屋の原点（町の3Dの座標）と、部屋の箱の部屋の座標（窓の中心が原点・正面 -z・左 -x）での広がり
  const roomO = new THREE.Vector3().setFromMatrixPosition(fromKamo.clone().multiply(new THREE.Matrix4().makeTranslation(meta.view.x - 0.6, meta.view.y - 1.5, meta.view.z)))
  const rb = { x0: roomBox.min.x - roomO.x, x1: roomBox.max.x - roomO.x, y0: roomBox.min.y - roomO.y, y1: roomBox.max.y - roomO.y, z0: roomBox.min.z - roomO.z, z1: roomBox.max.z - roomO.z }
  const groundL = (meta.view.groundY - 0.3) - (meta.view.y - 1.5) // 地面（部屋の座標）
  const HOST = { x0: rb.x0, x1: rb.x1 + 16, y0: groundL, y1: rb.y1 + 0.3, z0: 0, z1: rb.z1 + 6 } // 部屋は北東の角（右＝南と奥＝西へ建物が続く）
  const toK = (x, y, z) => new THREE.Vector3(x, y, z).add(roomO).applyMatrix4(toKamo)
  const hostK = new THREE.Box3(); for (const x of [HOST.x0, HOST.x1]) for (const y of [HOST.y0, HOST.y1]) for (const z of [HOST.z0 - 0.3, HOST.z1]) hostK.expandByPoint(toK(x, y, z))
  {
    // 便21: 位置は範囲の中心（pOff）を引いて詰めてあるので、ここでメートルに戻してから使う（以下の p16 はメートル・ps は 1）
    const sec = meta.files.bldg.secs, ps = 1, bq = view(data.buf.bldg, sec.pos), bStep = meta.bldg.pStep, bOff = meta.bldg.pOff || [0, 0, 0]
    const p16 = new Float32Array(bq.length); for (let i = 0; i < bq.length; i++) p16[i] = bq[i] * bStep + bOff[i % 3]
    const uv16 = view(data.buf.bldg, sec.uv), bidA = view(data.buf.bldg, sec.bid), nv = meta.bldg.nv
    // 便21: 京都らしい家並み（build.mjs の形の種類と通りに面する向き）。古いデータ（無い時）と kamokyo=0（外し回し用）は前の描き方
    const styleA = sec.style ? view(data.buf.bldg, sec.style) : null, frontA = sec.front ? view(data.buf.bldg, sec.front) : null
    KYO = !!(styleA && frontA) && !/[?&]kamokyo=0/.test(location.search)
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
      if (KYO) useKyo(m, k.startsWith('wall'))
      mats[k] = m
    }
    const groups = new Map()
    const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), nrm = new THREE.Vector3()
    for (const [bid, e] of bb) if (styleA && styleA[bid] !== undefined) kyoCount[styleA[bid]]++
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
      const cnt = tris.length * 3, pos = new Float32Array(cnt * 3), uv1 = new Float32Array(cnt * 2), col = new Float32Array(cnt * 3), kb = KYO ? new Float32Array(cnt * 4) : null
      let o = 0
      for (const t of tris) for (let q = 0; q < 3; q++) {
        const s = t + q, bid = bidA[s]
        pos[o * 3] = p16[s * 3] * ps; pos[o * 3 + 1] = p16[s * 3 + 1] * ps; pos[o * 3 + 2] = p16[s * 3 + 2] * ps
        if (kb) { const e = bb.get(bid); kb[o * 4] = e ? e.min.y : 0; kb[o * 4 + 1] = (frontA[bid] / 255) * Math.PI * 2 - Math.PI; kb[o * 4 + 2] = styleA[bid]; kb[o * 4 + 3] = hash(bid * 1.37 + 0.21) } // 便21: 建物の足もとの高さ・通りに面する向き・形の種類・建物ごとのゆらぎ
        uv1[o * 2] = uv16[s * 2] / 65535; uv1[o * 2 + 1] = uv16[s * 2 + 1] / 65535
        if (k.startsWith('roof')) { c.setHex(ROOF[Math.floor(hash(bid) * ROOF.length)]); if (SNOW) c.lerp(WHITE, 0.6) } else c.setHex(WALL[Math.floor(hash(bid + 0.5) * WALL.length)])
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b; o++
      }
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (kb) g.setAttribute('aKB', new THREE.BufferAttribute(kb, 4)); g.computeVertexNormals()
      const mesh = new THREE.Mesh(g, mats[k]); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = 'bldg'; scene.add(mesh)
    }
  }
  // 便21: 町家の通り庇（いぶし銀の瓦）と、軒裏と庇の先（濃い木）、犬矢来（竹の囲い）。build.mjs が町家の表の壁から作った形
  let eaveN = 0
  if (KYO && meta.files.misc.secs.eaves) {
    const ep = view(data.buf.misc, meta.files.misc.secs.eaves), ek = view(data.buf.misc, meta.files.misc.secs.eaveKind)
    const col = new Float32Array(ek.length * 3), c = new THREE.Color(), CK = [0x5c626b, 0x2a2018, 0x4a3a28]
    for (let i = 0; i < ek.length; i++) { c.setHex(CK[ek[i]]); if (SNOW && ek[i] === 0) c.lerp(WHITE, 0.6); col.set([c.r, c.g, c.b], i * 3) }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(ep), 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals()
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }))
    m.onBeforeCompile = (sh) => { // 庇の瓦の段と、犬矢来の竹の縦すじ（頂点の色の暗さで見分ける）
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvEW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEW;').replace('#include <color_fragment>', `#include <color_fragment>
  if (diffuseColor.r > 0.08 && diffuseColor.b > 0.1) diffuseColor.rgb *= (0.78 + 0.22 * sin((vEW.x + vEW.z) / 0.29 * 6.2832)) * (0.6 + 0.4 * step(0.25, fract(vEW.y / 0.07)));
  else if (diffuseColor.r > 0.05 && diffuseColor.b < 0.03) diffuseColor.rgb *= 0.7 + 0.3 * step(0.3, fract((vEW.x - vEW.z) / 0.045));`)
    }
    addKey(m, 'eaves')
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = 'eaves'; scene.add(mesh); eaveN = ek.length / 3
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
  // 便21: 本物は明るい灰色のコンクリートの石で、角の丸い長方形が多く、ときどき亀（丸い甲羅と頭）と千鳥（鳥）の形（調べ §7）。
  //   水に浸かる下の方は濃い灰〜苔の緑。石の上は水面の 12cm 上（build.mjs）。形の種類が無い古いデータは、前の丸めた石
  const stoneKinds = { n: 0, byKind: [0, 0, 0, 0] }
  {
    const st = view(data.buf.misc, meta.files.misc.secs.stones), n = st.length / 4
    const sk = meta.files.misc.secs.stoneKind ? view(data.buf.misc, meta.files.misc.secs.stoneKind) : null
    if (n && sk) {
      const shade = (g) => { // 水に浸かる下の方を濃く・苔の色に（頂点の色）
        const p = g.attributes.position, col = new Float32Array(p.count * 3), lo = new THREE.Color(0x5a6152), hi = new THREE.Color(SNOW ? 0xd8dadc : 0xc4c1b8), c = new THREE.Color()
        for (let i = 0; i < p.count; i++) { c.copy(lo).lerp(hi, THREE.MathUtils.smoothstep(p.getY(i), -0.26, -0.06)); col.set([c.r, c.g, c.b], i * 3) }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g
      }
      const rect = () => { const g = new RoundedBoxGeometry(1.0, 0.55, 0.58, 2, 0.09); g.translate(0, -0.275, 0); return shade(g) }
      const turtle = () => {
        const parts = []
        const base = new RoundedBoxGeometry(0.95, 0.42, 1.2, 2, 0.12); base.translate(0, -0.42, 0); parts.push(base)
        const shell = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); shell.scale(0.5, 0.24, 0.62); shell.translate(0, -0.24, -0.02); parts.push(shell)
        const head = new THREE.SphereGeometry(0.15, 12, 8); head.scale(1, 0.8, 1.25); head.translate(0, -0.16, 0.74); parts.push(head)
        for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const f = new THREE.SphereGeometry(1, 10, 6); f.scale(0.2, 0.06, 0.12); f.rotateY(sx * sz * 0.5); f.translate(sx * 0.5, -0.2, sz * 0.36); parts.push(f) }
        const tail = new THREE.ConeGeometry(0.07, 0.2, 8); tail.rotateX(-Math.PI / 2); tail.translate(0, -0.2, -0.7); parts.push(tail)
        const g = BGU.mergeGeometries(parts.map((x) => x.toNonIndexed())); parts.forEach((x) => x.dispose()); g.computeVertexNormals(); return shade(g)
      }
      const plover = () => { // 上から見た千鳥（丸い胴・丸い頭・短いくちばし・とがった尾）を、平たく押し出した石
        const s = new THREE.Shape()
        s.moveTo(0, -0.62); s.lineTo(0.16, -0.36); s.quadraticCurveTo(0.42, -0.1, 0.36, 0.18); s.quadraticCurveTo(0.3, 0.36, 0.17, 0.42)
        s.absarc(0, 0.52, 0.2, -0.55, Math.PI + 0.55, false); s.quadraticCurveTo(-0.3, 0.36, -0.36, 0.18); s.quadraticCurveTo(-0.42, -0.1, -0.16, -0.36); s.lineTo(0, -0.62)
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 })
        g.rotateX(Math.PI / 2); g.translate(0, -0.05, 0)
        const beak = new THREE.ConeGeometry(0.06, 0.16, 8); beak.rotateX(Math.PI / 2); beak.translate(0, -0.12, 0.78)
        const m = BGU.mergeGeometries([g.toNonIndexed(), beak.toNonIndexed()]); g.dispose(); beak.dispose(); m.computeVertexNormals(); return shade(m)
      }
      const geos = [keep(rect()), keep(turtle()), keep(plover())]
      const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RAIN ? 0.45 : 0.82 }))
      useTex(m, { a: 'concrete_wall_004', tile: 1.2, mode: 'tri', ns: 0.6 })
      const lists = [[], [], []]
      for (let i = 0; i < n; i++) { const k = sk[i] === 3 ? 0 : Math.min(2, sk[i]); lists[k].push(i); stoneKinds.byKind[sk[i]]++ }
      stoneKinds.n = n
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3()
      lists.forEach((L, k) => {
        if (!L.length) return
        const im = new THREE.InstancedMesh(geos[k], m, L.length)
        L.forEach((i, j) => { q.setFromAxisAngle(up, st[i * 4 + 3]); m4.compose(at.set(st[i * 4], st[i * 4 + 1], st[i * 4 + 2]), q, one); im.setMatrixAt(j, m4) })
        im.castShadow = im.receiveShadow = true; im.userData.part = 'stones'; im.computeBoundingSphere(); scene.add(im)
      })
    } else if (n) {
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
  const nN = meta.near.nx, nNZ = meta.near.nz, nS = meta.near.step, nQ = meta.near.hStep // 便21: 四角の網（東西 nN 点・南北 nNZ 点）
  const gridAt = (X, Z, f) => { // 近くの地形の網を4点で混ぜて読む（網の外は端の値）
    const u = Math.min(nN - 1.001, Math.max(0, (X - NX0) / nS)), v = Math.min(nNZ - 1.001, Math.max(0, (Z - NZ0) / nS)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * nN + i
    return (f(k) * (1 - fu) + f(k + 1) * fu) * (1 - fv) + (f(k + nN) * (1 - fu) + f(k + nN + 1) * fu) * fv
  }
  // 【便19・外の目】iPhone の段は地形の網を1つおき（8m）に間引いて描く（gridTiles の dec）。歩く高さとカメラの下限を 4m の網で引くと描いた地面とずれ、土手で目やカメラがめり込む＝同じ間引きの網で読む
  const navDec = low ? 2 : 1
  const terrK = (X, Z) => { // 地面の高さ（鴨川の座標・水面の下は川底）。描く網と同じ間引きで4点を混ぜる
    const st = nS * navDec, m = (nN - 1) / navDec + 1, mz = (nNZ - 1) / navDec + 1, u = Math.min(m - 1.001, Math.max(0, (X - NX0) / st)), v = Math.min(mz - 1.001, Math.max(0, (Z - NZ0) / st)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
    const h = (ii, jj) => terrain[jj * navDec * nN + ii * navDec] * nQ
    return (h(i, j) * (1 - fu) + h(i + 1, j) * fu) * (1 - fv) + (h(i, j + 1) * (1 - fu) + h(i + 1, j + 1) * fu) * fv
  }
  const wetK = (X, Z) => gridAt(X, Z, (k) => (zone[k] === 2 ? 1 : 0)) // 水面の度合い（0.5 以上を水とする）
  const zoneK = (X, Z) => zone[Math.round(Math.min(nNZ - 1, Math.max(0, (Z - NZ0) / nS))) * nN + Math.round(Math.min(nN - 1, Math.max(0, (X - NX0) / nS)))]
  // ~~目の下限の元（水の上は水面＝川底の 0.6m 上・build.mjs）~~（【便21】川底は水の深さの図のとおり＝水面は川底＋その深さ）
  const floorK = wdepA ? (X, Z) => terrK(X, Z) + gridAt(X, Z, (k) => wdepA[k] * WDS) : (X, Z) => terrK(X, Z) + Math.min(1, wetK(X, Z) * 2) * 0.6
  const EDGE = 40 // 近くの地形の網の縁から 40m 内側まで（網の縁は遠くの網との継ぎ目）
  const outK = (X, Z) => X < NX0 + EDGE || X > NX1 - EDGE || Z < NZ0 + EDGE || Z > NZ1 - EDGE
  const GC = 2, GN = Math.ceil(NW / GC), GNZ = Math.ceil(ND / GC) // 便21: 表は東西 GN 升・南北 GNZ 升
  let G = null
  function ensureNav() {
    if (G) return G
    const t0 = performance.now()
    const top = new Float32Array(GN * GNZ).fill(-1e9), bld = new Uint8Array(GN * GNZ), deck = new Float32Array(GN * GNZ).fill(NaN)
    const ci = (X) => Math.floor((X - NX0) / GC), cj = (Z) => Math.floor((Z - NZ0) / GC)
    // 三角形を真上から見て、覆う升に fn(升, その所の高さ, 三角形の一番高い所) を渡す（壁のように真上から線に潰れる面は、頂点の升だけ）
    const tri = (ax, ay, az, bx, by, bz, cx, cy, cz, fn) => {
      const yMax = Math.max(ay, by, cy)
      for (const [vx, vy, vz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) { const i = ci(vx), j = cj(vz); if (i >= 0 && j >= 0 && i < GN && j < GNZ) fn(j * GN + i, vy, yMax) }
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-6) return
      const i0 = Math.max(0, ci(Math.min(ax, bx, cx))), i1 = Math.min(GN - 1, ci(Math.max(ax, bx, cx))), j0 = Math.max(0, cj(Math.min(az, bz, cz))), j1 = Math.min(GNZ - 1, cj(Math.max(az, bz, cz)))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = NX0 + (i + 0.5) * GC, pz = NZ0 + (j + 0.5) * GC
        const w1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den, w2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den, w3 = 1 - w1 - w2
        if (w1 >= -0.02 && w2 >= -0.02 && w3 >= -0.02) fn(j * GN + i, w1 * ay + w2 * by + w3 * cy, yMax)
      }
    }
    const trunks = new Map()
    try { // 【便19・外の目】建物・橋・木の表を組めなかった時は、地面と水だけで飛ぶ・歩く（窓辺に戻れなくならない）
    { // 建物（描かない建物は除く）と、部屋のあるマンション
      const { p16, bidA, drop, ps, nv } = navSrc.bldg
      const mark = (k, y, yMax) => { if (yMax > top[k]) top[k] = yMax; bld[k] = 1 }
      for (let t = 0; t < nv; t += 3) { if (drop.has(bidA[t])) continue; const o = t * 3; tri(p16[o] * ps, p16[o + 1] * ps, p16[o + 2] * ps, p16[o + 3] * ps, p16[o + 4] * ps, p16[o + 5] * ps, p16[o + 6] * ps, p16[o + 7] * ps, p16[o + 8] * ps, mark) }
      for (let j = Math.max(0, cj(hostK.min.z)); j <= Math.min(GNZ - 1, cj(hostK.max.z)); j++) for (let i = Math.max(0, ci(hostK.min.x)); i <= Math.min(GN - 1, ci(hostK.max.x)); i++) { const k = j * GN + i; top[k] = Math.max(top[k], hostK.max.y); bld[k] = 1 }
      // 建物の升でも、地面から 1.8m より低い物（塀・段・屋根の無い小さな形）は歩ける
      for (let j = 0; j < GNZ; j++) for (let i = 0; i < GN; i++) { const k = j * GN + i; if (bld[k] && top[k] - terrK(NX0 + (i + 0.5) * GC, NZ0 + (j + 0.5) * GC) < 1.8) bld[k] = 0 }
    }
    { // 橋の床（歩いて渡れる・飛ぶ時は欄干の分だけ上を通る）
      const { pos, idx, kind } = navSrc.roads
      const mark = (k, y) => { if (!(deck[k] >= y)) deck[k] = y; if (y + 1.2 > top[k]) top[k] = y + 1.2 }
      for (let q = 0; q < idx.length; q += 3) { const a = idx[q], b = idx[q + 1], c = idx[q + 2]; if (kind[a] !== 2) continue; tri(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2], pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2], mark) }
    }
    // 木: 樹冠の上の高さ（飛ぶ時）と幹（歩く時の当たり・8m 四方の箱に入れる）
    const tr = view(data.buf.misc, meta.files.misc.secs.trees)
    for (let q = 0; q < tr.length; q += 6) {
      const X = tr[q], Y = tr[q + 1], Z = tr[q + 2], h = tr[q + 3], r = tr[q + 4] * 0.5
      for (let j = Math.max(0, cj(Z - r)); j <= Math.min(GNZ - 1, cj(Z + r)); j++) for (let i = Math.max(0, ci(X - r)); i <= Math.min(GN - 1, ci(X + r)); i++) { const k = j * GN + i; if (Y + h > top[k]) top[k] = Y + h }
      const key = Math.floor(X / 8) * 100003 + Math.floor(Z / 8); let a = trunks.get(key); if (!a) { a = []; trunks.set(key, a) } a.push(X, Z)
    }
    } catch (e) { console.warn('鴨川の道案内の表（建物・橋・木）を組めなかったので、地面と水だけで飛ぶ・歩く:', e && e.message); top.fill(-1e9); bld.fill(0); deck.fill(NaN); trunks.clear() }
    // 飛ぶ時の下限: 地面（水面）と建物・木・橋の上の高い方を、まわり 8m の一番高い所へ広げてからなだらかにする（建物の手前で先に浮き上がり、急に持ち上がらない）
    const F = new Float32Array(GN * GNZ)
    for (let j = 0; j < GNZ; j++) for (let i = 0; i < GN; i++) { const k = j * GN + i; F[k] = Math.max(top[k], floorK(NX0 + (i + 0.5) * GC, NZ0 + (j + 0.5) * GC)) }
    const pass = (src, r, op) => { // 横と縦に分けて、まわり r 升の一番高い所（op='max'）か平均（op='avg'）をとる
      const tmp = new Float32Array(GN * GNZ), out = new Float32Array(GN * GNZ)
      for (let j = 0; j < GNZ; j++) for (let i = 0; i < GN; i++) { let m = op === 'max' ? -1e9 : 0, c = 0; for (let d = -r; d <= r; d++) { const ii = Math.min(GN - 1, Math.max(0, i + d)), v = src[j * GN + ii]; if (op === 'max') { if (v > m) m = v } else { m += v; c++ } } tmp[j * GN + i] = op === 'max' ? m : m / c }
      for (let j = 0; j < GNZ; j++) for (let i = 0; i < GN; i++) { let m = op === 'max' ? -1e9 : 0, c = 0; for (let d = -r; d <= r; d++) { const jj = Math.min(GNZ - 1, Math.max(0, j + d)), v = tmp[jj * GN + i]; if (op === 'max') { if (v > m) m = v } else { m += v; c++ } } out[j * GN + i] = op === 'max' ? m : m / c }
      return out
    }
    const S = pass(pass(F, 4, 'max'), 3, 'avg')
    G = { top: F, bld, deck, S, trunks, ms: Math.round(performance.now() - t0) }
    return G
  }
  const cellK = (X, Z) => { const i = Math.floor((X - NX0) / GC), j = Math.floor((Z - NZ0) / GC); return i < 0 || j < 0 || i >= GN || j >= GNZ ? -1 : j * GN + i }
  const softK = (X, Z) => { const g = ensureNav(), u = Math.min(GN - 1.001, Math.max(0, (X - NX0) / GC - 0.5)), v = Math.min(GNZ - 1.001, Math.max(0, (Z - NZ0) / GC - 0.5)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * GN + i
    return (g.S[k] * (1 - fu) + g.S[k + 1] * fu) * (1 - fv) + (g.S[k + GN] * (1 - fu) + g.S[k + GN + 1] * fu) * fv }
  const trunkK = (X, Z) => { const g = ensureNav(); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = g.trunks.get((Math.floor(X / 8) + a) * 100003 + Math.floor(Z / 8) + b); if (!arr) continue; for (let q = 0; q < arr.length; q += 2) { const dx = X - arr[q], dz = Z - arr[q + 1]; if (dx * dx + dz * dz < 0.36) return true } } return false }
  const blockedK = (X, Z) => { if (outK(X, Z)) return true; const k = cellK(X, Z); return (k >= 0 && ensureNav().bld[k] === 1) || trunkK(X, Z) }
  const deckOk = (X, Z, feetK) => { const k = cellK(X, Z); if (k < 0) return NaN; const d = ensureNav().deck[k]; return d === d && Math.abs(d - feetK) < 1.3 ? d : NaN } // 足の高さに近い橋の床だけ（河川敷を歩いていて頭の上の橋に吸い上げられない）
  // 便21: 飛べる箱＝鴨川の四角（縁から EDGE 内側）に入る、町の3Dの軸に沿った一番大きい箱。町の3Dの (dx, dz) は鴨川の (m0 dx + m8 dz, m2 dx + m10 dz) へ写る
  //   |m0| hx + |m8| hz ≤ 幅/2・|m2| hx + |m10| hz ≤ 奥行き/2 を等しく置いて解く（解が負なら、細い方に合わせた正方形）
  const cX = TX(0, 0), cZ = TZ(0, 0) // 鴨川デルタ（原点）の町の3Dの座標
  const bW = NW / 2 - EDGE, bD = ND / 2 - EDGE, bCX = TX((NX0 + NX1) / 2, (NZ0 + NZ1) / 2), bCZ = TZ((NX0 + NX1) / 2, (NZ0 + NZ1) / 2)
  const a0 = Math.abs(navM[0]), a8 = Math.abs(navM[8]), a2 = Math.abs(navM[2]), a10 = Math.abs(navM[10]), det = a0 * a10 - a8 * a2
  let hx = (bW * a10 - a8 * bD) / det, hz = (a0 * bD - a2 * bW) / det
  if (!(hx > 0 && hz > 0)) { hx = hz = Math.min(bW, bD) / (a0 + a8 + a2 + a10) * 2 }
  const nav = {
    // 飛べる箱（町の3Dの座標の軸に沿った箱＝近くの地形の網の内側に入る一番大きい四角）。yFloor＝建物・木の上に空ける高さ
    bound: { x: hx - bCX, xMax: bCX + hx, zMin: bCZ - hz, zMax: bCZ + hz, yMax: 240 - dY, yFloor: 3.5 },
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
    canStep: (x, z, feetY) => { const X = KX(x, z), Z = KZ(x, z); if (blockedK(X, Z)) return false; if (!Number.isNaN(deckOk(X, Z, feetY + dY))) return true; return wetK(X, Z) < 0.5 },
    aim: (x, z) => Math.atan2(cX - x, -(cZ - z)), // その所から鴨川デルタを向く向き（町の3Dの向き: 0＝-z）
    place: (x, z, y) => { const X = KX(x, z), Z = KZ(x, z), alt = y + dY - terrK(X, Z)
      const river = Z < -20 ? (X < 0 ? '賀茂川' : '高野川') : '鴨川' // 【便19・外の目】合流（原点）より北は、西が賀茂川・東が高野川
      if (alt > 70) return '鴨川の上空'; if (wetK(X, Z) >= 0.5) return river + 'の上'; if (Math.hypot(X, Z) < 130) return '鴨川デルタ'; if (zoneK(X, Z) === 1) return river + 'の河川敷'; return 'まちなか' },
    gauge: (y) => Math.max(0, Math.min(1, (y + dY - meta.view.groundY) / 150)), // 高さのゲージ（地面から 150m で満ちる）
    deck: (x, z) => { const k = cellK(KX(x, z), KZ(x, z)), d = k >= 0 ? ensureNav().deck[k] : NaN; return d === d ? d - dY : null }, // 橋の床の高さ（無ければ null・検証用）
    info: () => (G ? { ms: G.ms, cells: GN * GNZ } : null),
  }

  // ── 便20: 人や電車や鳥が動く所と、時々の出来事（kamoLife.js）。置く高さは間引かない網で読む（iPhone の段でも人が地面に埋まらない） ──
  const terrFull = (X, Z) => gridAt(X, Z, (k) => terrain[k] * nQ)
  const fN = meta.far.n, fR = meta.far.R, fS = meta.far.step, fQ = meta.far.hStep
  const farK = (X, Z) => { const u = Math.min(fN - 1.001, Math.max(0, (X + fR) / fS)), v = Math.min(fN - 1.001, Math.max(0, (Z + fR) / fS)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * fN + i
    return ((farH[k] * (1 - fu) + farH[k + 1] * fu) * (1 - fv) + (farH[k + fN] * (1 - fu) + farH[k + fN + 1] * fu) * fv) * fQ }
  let life = null, lifeMs = null
  // 便21: 渡る人が跳ぶ石（すれ違いの石＝形 3 は渡る列に入れない）
  function hopStones() {
    const st = view(data.buf.misc, meta.files.misc.secs.stones), sk = meta.files.misc.secs.stoneKind ? view(data.buf.misc, meta.files.misc.secs.stoneKind) : null
    if (!sk) return st
    const out = []; for (let i = 0; i < st.length / 4; i++) if (sk[i] !== 3) out.push(st[i * 4], st[i * 4 + 1], st[i * 4 + 2], st[i * 4 + 3])
    return new Float32Array(out)
  }
  try {
    const tL0 = performance.now()
    if (data.life && !/[?&]kamolife=0/.test(location.search)) life = buildLife({ scene, camera, renderer, life: data.life, terrK: terrFull, farK, wetK, zoneK, WY, stones: hopStones(), S, TK, sky, low, reduceMotion, onSound, keep })
    lifeMs = Math.round(performance.now() - tL0)
  } catch (e) { console.warn('鴨川の町の動く物を組めなかったので、動く物なしで開きます:', e && e.message); life = null }

  // ── 目: 部屋の目（町の3Dの camera）を鴨川の座標へ写す ──
  const tmp = new THREE.Matrix4()
  let lastFov = -1, lastAspect = -1, lastZoom = -1
  const DEVCAM = /[?&]dev=1/.test(location.search)
  function sync(main) {
    // 検証用（便20・?dev=1 の時だけ）: window.__kamoCam = { p:[x,y,z], l:[x,y,z], fov } で鴨川の目を決め打ちする（鴨川の座標）。空・地上で部屋が隠れている時に使う
    if (DEVCAM && window.__kamoCam) { const c = window.__kamoCam; camera.fov = c.fov || 30; camera.aspect = main.aspect; camera.zoom = 1; camera.updateProjectionMatrix(); camera.position.set(...c.p); camera.up.set(0, 1, 0); camera.lookAt(...c.l); camera.updateMatrix(); camera.updateMatrixWorld(true); lastFov = -1; return }
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
    causU.value = tAcc // 便21: 川底の光の網の時計
    cloudU.value = tAcc // 便21: 雲の流れの時計
    if (life) { try { life.update(dt) } catch (e) { console.warn('鴨川の町の動く物を止めました:', e && e.message); life = null; scene.traverse((o) => { if (o.userData && /^(people|birds|train|okuribi)$/.test(o.userData.part)) o.visible = false }) } } // 【便20・外の目】止めた時は、動く物をその場で固まらせずに隠す
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
    get life() { return life }, // 便20: 動く物と時々の出来事（組めなかった時は null）
    townOf: (X, Z, Y = 0) => ({ x: TX(X, Z), y: Y - dY, z: TZ(X, Z) }), // 検証用（便20）: 鴨川の座標 → 町の3Dの座標
    setBright(b) { state.bright = b || 1 },
    setRoomShown(b) { if (plug) plug.visible = plugForce === null ? !b : plugForce }, // 便19: 部屋が見えている間は窓の所を空け、隠れている間（空・地上）は塞ぐ
    forcePlug(v) { plugForce = v === null || v === undefined ? null : !!v }, // 検証用（便19）: 塞ぐ壁を出す・出さないに決める（null で戻す）
    info() { return { calls, tris, removed: removed.length, low, time: TK, sky, shadow: sunL.castShadow, exposure: state.exposure, parts, nav: nav.info(), waveTop20, waterMs, waterRot, waterShallow, caus: CAUS, stones: stoneKinds, clouds: !!cloudMesh, kyo: KYO ? { count: kyoCount, eaves: eaveN } : null, navDec, plugShown: !!(plug && plug.visible), lifeMs } },
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
