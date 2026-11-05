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
import { buildPeople } from './kamoPeople.js'
import { buildMarks } from './kamoMarks.js'
import { buildMachiyaFronts, buildYuka, buildOchayaFronts, GION as KGION, PONTO as KPONTO, frontsAt as kyoFrontsAt } from './kamoKyo.js' // 便24: 町家の表の細かい物と納涼床

// ── 時刻（便17 の試作と同じ値。京都の向き: x 東・z 南。太陽の向きは three の角度で 0＝南） ──
const TIMES = {
  morning: { el: 7, az: 115, turb: 6, ray: 1.6, exp: 0.42, sun: 0xffe2c0, sunI: 2.4, hemi: [0xbfd2e6, 0x5a5040, 0.55], fog: 0xd2d6da, fogD: 0.00018 },
  noon: { el: 38, az: 0, turb: 3.5, ray: 1.0, exp: 0.32, sun: 0xfff6ea, sunI: 3.2, hemi: [0xcfe0f2, 0x6a6050, 0.7], fog: 0xc6d4e2, fogD: 0.00014 },
  // 【便21】夕方の空の光 0.45 → 1.2（日の反対側の壁と町家の格子が真っ暗に沈んだ）
  dusk: { el: 4.5, az: 290, turb: 5.5, ray: 1.3, exp: 0.4, sun: 0xffa66a, sunI: 2.0, hemi: [0xa8a8c8, 0x403028, 1.2], fog: 0xc6b2a6, fogD: 0.00016 },
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
// 【便21・外の目】データの版の印。控え（service worker）が前の版の kamo.json と .bin を先に返すと、新しい本体と古いデータが混ざって崩れる（便21 で範囲の形を替えた）。版ごとに読み先を分ける
/* global __KAMO_V__ */
const KAMO_V = '?v=' + (typeof __KAMO_V__ !== 'undefined' ? __KAMO_V__ : '23') // ~~便23: '?v=23'（手で上げる印）~~【便24】public/kamo（outer を除く）の中身の指紋（vite.config.js）。上げ忘れで新しい本体と古いデータが混ざらない
export async function loadKamo(base, { low = false } = {}) {
  const meta = await (await fetch(base + 'kamo.json' + KAMO_V)).json()
  const F = meta.files
  const loader = new THREE.TextureLoader()
  const sfx = low ? '_s' : ''
  const img = (p) => loader.loadAsync(base + p + KAMO_V)
  // 便20: 人や電車が動く所と名所の位置（life.json・小さい）。読めなくても町は開く（動く物と時々の出来事が無いだけ）
  const lifeP = fetch(base + 'life.json' + KAMO_V).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const [terrain, bldg, roads, misc, lmT, lmB, ...tex] = await Promise.all([
    gunzip(base + F.terrain.file + KAMO_V), gunzip(base + F.bldg.file + KAMO_V), gunzip(base + F.roads.file + KAMO_V), gunzip(base + F.misc.file + KAMO_V),
    img(`lm_terrain${sfx}.jpg`), img(`lm_bldg${sfx}.jpg`),
    ...meta.tex.flatMap((n) => [img(`tex/${n}_d${sfx}.jpg`), img(`tex/${n}_n${sfx}.jpg`)]),
  ])
  const texMap = {}
  meta.tex.forEach((n, i) => { texMap[n] = { d: tex[i * 2], n: tex[i * 2 + 1] } })
  return { meta, low, base, buf: { terrain, bldg, roads, misc }, lm: { terrain: lmT, bldg: lmB }, tex: texMap, life: await lifeP }
}
/** 便23: 南の四角（河原町・木屋町・先斗町・祇園）のデータと焼いた図を取ってくる（窓辺が開いた後に裏で読む）。無い時は null */
async function loadSouthData(data) {
  const S = data.meta.south; if (!S) return null
  const loader = new THREE.TextureLoader(), sfx = data.low ? '_s' : ''
  const [buf, lmT, lmB] = await Promise.all([gunzip(data.base + S.file + KAMO_V), loader.loadAsync(data.base + `${S.lm.terrain}${sfx}.jpg` + KAMO_V), loader.loadAsync(data.base + `${S.lm.bldg}${sfx}.jpg` + KAMO_V)])
  return { buf, lmT, lmB }
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
  if (/[?&]dev=1/.test(location.search)) window.__kamoScene = scene // 検証用（便21・?dev=1 の時だけ）: 鴨川の舞台（光と材を切り分けて調べる）。片付ける時に外す
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
      float sh = ${low ? 'c * 0.8' : 'dens(uv + normalize(uSun.xz + vec2(1e-4)) * 0.18)'}; // 日の向きへずらした所の濃さ＝陰（【便21・外の目】iPhone の段は2回目の雲の雑音を省く）
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
    scene.environment = keep(pmrem.fromScene(envScene, 0, 1, 10000).texture); scene.environmentIntensity = NIGHT ? 0.25 : RAIN ? 0.6 : TK === 'dusk' ? 1.5 : 0.8 // 便21: 夕方は日の反対側の壁が真っ暗に沈んだので、空の映り込みの光を上げる
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
  // 便23: 網は北の四角（RGA＝前の範囲）と南の四角（RGB）に外接する四角。南の四角は addSouth で足すまで描かず、道案内も北の四角だけで答える（SOUTH_ON）
  const RGA = meta.near.regions ? meta.near.regions.A : { x0: NX0, x1: NX1, z0: NZ0, z1: NZ1 }, RGB = meta.near.regions ? meta.near.regions.B : null
  let SOUTH_ON = false
  const inRA = (x, z, m = 0) => x >= RGA.x0 + m && x <= RGA.x1 - m && z >= RGA.z0 + m && z <= RGA.z1 - m
  const inRB = (x, z, m = 0) => !!RGB && x >= RGB.x0 + m && x <= RGB.x1 - m && z >= RGB.z0 + m && z <= RGB.z1 - m
  // 鴨川の町（描いている四角の和）の内側か（縁から m 内側）。m の正方形の4つの角がどれも和の中なら中（継ぎ目をまたいでも中）。m が 0 以下は外へ広げた和
  const inK = (x, z, m = 0) => { if (!SOUTH_ON) return inRA(x, z, m); if (m <= 0) return inRA(x, z, m) || inRB(x, z, m); const c = (a, b) => inRA(a, b) || inRB(a, b); return c(x - m, z - m) && c(x + m, z - m) && c(x - m, z + m) && c(x + m, z + m) }
  // 焼いた地形の図の位置（四角ごとに u＝西の端 0・v＝南の端 0）。北の四角は前と同じ
  const uvOf = (rc) => (x, z) => [(x - rc.x0) / (rc.x1 - rc.x0), (-z + rc.z1) / (rc.z1 - rc.z0)]
  const uvA = uvOf(RGA), uvB = RGB ? uvOf(RGB) : null
  const lmU = (x) => uvA(x, 0)[0], lmV = (z) => uvA(0, z)[1]
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

  // 便22: 置いた所の座標と向き（箱を並べて描く時は instanceMatrix も掛ける。向きは拡大の逆を掛けてから回す＝three の法線と同じ）。並べない時は前と同じ式
  const INSTW = (P, N) => `#ifdef USE_INSTANCING
${P} = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; { mat3 kim = mat3(instanceMatrix); vec3 kn0 = objectNormal / vec3(dot(kim[0], kim[0]), dot(kim[1], kim[1]), dot(kim[2], kim[2])); ${N} = normalize(mat3(modelMatrix) * (kim * kn0)); }
#else
${P} = (modelMatrix * vec4(transformed, 1.0)).xyz; ${N} = normalize(mat3(modelMatrix) * objectNormal);
#endif`
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
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; varying vec3 vGN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + INSTW('vGW', 'vGN'))
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
  const kyoCount = [0, 0, 0, 0, 0, 0, 0, 0, 0] // 6 京大の赤茶・7 吉田神社の社・8 茂庵
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
            vec3 lat = mix(vec3(0.045, 0.026, 0.018), vec3(0.26, 0.11, 0.065) * (0.85 + 0.3 * fract(kR * 3.7)), max(max(bar, rail), frm)); // 紅殻（べんがら）の赤茶の格子
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
      } else if (kS == 6) { // 京大の本部構内: えんじ〜赤茶のタイル（目地が縦横に通る）と、明るいベージュの柱形と階の帯（調べ §1）
        float tl = max(step(0.93, fract(al / 0.6)), step(0.9, fract(hl / 0.3)));
        c = mix(vec3(0.25, 0.08, 0.05), vec3(0.17, 0.06, 0.04), tl) * kDet;
        c = mix(c, vec3(0.6, 0.53, 0.4) * kDet, min(1.0, step(fract(hl / 4.2), 0.07) + step(fract(al / 4.0 + kR), 0.06)));
      } else if (kS == 7) { // 吉田神社の社: 朱の柱と長押・白い壁（調べ §2）
        float pil = step(fract(al / 1.8), 0.1); c = mix(vec3(0.72, 0.7, 0.64) * kDet, vec3(0.5, 0.06, 0.025), min(1.0, max(pil, step(hl, 0.5) + step(2.6, hl)))); kWin = 0.0;
      } else if (kS == 9) { // 便22: ガラスの外壁（京都駅ビル・背の高い事務所と店）: 灰青のガラスに銀灰の方立（1.5m おき）と階の帯（3.6m おき）。夕と夜は内の灯りが透ける
        float mu = step(0.92, fract(al / 1.5)), fl = step(0.88, fract(hl / 3.6)); c = mix(vec3(0.13, 0.17, 0.2) * (0.85 + 0.3 * kR), vec3(0.42, 0.44, 0.45), max(mu, fl)) * kDet; kWin = 0.0;
        kGlowC += vec3(1.0, 0.86, 0.62) * 0.3 * (1.0 - max(mu, fl)) * step(1.0 - uLit * 1.4, fract(floor(hl / 3.6) * 0.37 + floor(al / 6.0) * 0.61 + kR));
      }
      if (c.x >= 0.0) diffuseColor.rgb = c;
    } else`
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vKB;')
        .replace('vec2 tuv = gmix > 0.5 ? tuvB : tuvA;', `vec2 tuv = gmix > 0.5 ? tuvB : tuvA;
  float kWin = 1.0; vec3 kGlowC = vec3(0.0);
  { int kS = int(vKB.z + 0.5); float hl = vGW.y - vKB.x, kR = vKB.w; vec2 fd = vec2(sin(vKB.y), cos(vKB.y)); vec3 kN = normalize(vGN);
    float kDet = mix(1.0, clamp(dot(mix(detA, detB, gmix), vec3(0.3333)), 0.65, 1.35), 0.45); // 壁の写真の模様のむらは半分に（土壁や漆喰がまだらに汚れて見えた）
    ${isWall ? wallCode : ''}
    if (kS == 1 || kS == 2 || kS == 5 || kS == 7 || (kS == 0 && kN.y < 0.985)) {
      vec2 sd = length(kN.xz) > 0.05 ? normalize(kN.xz) : fd, pd = vec2(sd.y, -sd.x);
      float v = dot(vGW.xz, sd) / max(0.3, kN.y), u = dot(vGW.xz, pd);
      float row = smoothstep(0.72, 0.97, fract(v / 0.26)), wave = 0.78 + 0.22 * sin(u / 0.29 * 6.2832);
      vec3 tile = kS == 7 ? vec3(0.075, 0.055, 0.042) : (kS == 0 && kR > 0.6) ? (kR > 0.82 ? vec3(0.05, 0.065, 0.09) : vec3(0.09, 0.06, 0.042)) : vec3(0.1, 0.108, 0.122) * (0.88 + kR * 0.25);
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
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW; varying vec3 vWN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n' + INSTW('vWW', 'vWN'))
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

  // 便21 の道の細かさ（白線・目地・真砂土の縁・橋の歩道）。aRd＝(左 -1・右 +1, 道の長さの位置 m, 幅 m, 種類)。便22 で外の町と分け合うため関数にした（中身は便21 のまま）
  function useRoad(m) {
    m.onBeforeCompile = chain(m.onBeforeCompile, (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRd; varying vec4 vRd;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRd = aRd;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vRd;').replace('vec2 tuv = gmix > 0.5 ? tuvB : tuvA;', `vec2 tuv = gmix > 0.5 ? tuvB : tuvA;
{ int rk = int(vRd.w + 0.5); float hw = vRd.z * 0.5, u = vRd.x * hw, e = hw - abs(u), al = vRd.y;
  float fwU = max(fwidth(u), 1e-4), fwA = max(fwidth(al), 1e-4);
  if (rk == 0) {
    float edge = smoothstep(0.3 - fwU, 0.3, e) * (1.0 - smoothstep(0.45, 0.45 + fwU, e));
    float cen = hw >= 4.5 ? (1.0 - smoothstep(0.07, 0.07 + fwU, abs(u))) * step(fract(al / 9.0), 0.66) : 0.0;
    float line = max(edge, cen) * (1.0 - smoothstep(0.4, 1.2, fwA * 0.2 + fwU * 2.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${SNOW ? '0.75, 0.76, 0.78' : '0.62, 0.62, 0.6'}), line * 0.85);
  } else if (rk == 1) {
    float jt = max(1.0 - smoothstep(0.0, 0.02 + fwU, abs(fract(u / 0.3 + 0.5) - 0.5) * 0.3), 1.0 - smoothstep(0.0, 0.02 + fwA, abs(fract(al / 0.3) - 0.5) * 0.3));
    diffuseColor.rgb *= 1.0 - 0.25 * jt * (1.0 - smoothstep(0.2, 0.6, fwA));
  } else if (rk == 5) {
    diffuseColor.rgb *= mix(0.72, 1.06, smoothstep(0.0, 0.7, e)) * (0.94 + 0.12 * smoothstep(0.4, 1.4, e));
  } else if (rk == 2 && hw > 3.0) {
    float walk = smoothstep(2.0 - fwU, 2.0, e) > 0.5 ? 0.0 : 1.0;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.41, 0.39) * (0.9 + 0.1 * step(0.5, fract(al / 0.6))), walk);
    diffuseColor.rgb *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.08 + fwU, abs(e - 2.0)));
  }
}`)
    })
    addKey(m, 'road21')
  }

  // ── 地形（近く＝5m の標高・遠く＝10m の標高）。色は高さと傾きと水面からの高さで計算 ──
  // 区画（4×4）に分けて描く＝窓の後ろ側の区画は画面の外として描かない（便18: 1つの塊だと後ろ側も毎回描いていた）。
  // iPhone の段は網を1つおきに間引く（近く 8m・遠く 100m 間隔）。法線は全体の網で求めてから分ける（区画の境に陰の継ぎ目を出さない）
  const terrain = view(data.buf.terrain, meta.files.terrain.secs.near), zone = view(data.buf.terrain, meta.files.terrain.secs.zone), farH = view(data.buf.terrain, meta.files.terrain.secs.far)
  // 便21: 東西 nx 点・南北 nz 点の四角の網（x0・z0 が北西の角）。tiles＝[東西の区画の数, 南北の区画の数]
  // 便23: sub＝描く所の点の範囲（間引く前の網の i0..i1・j0..j1）。法線はその外へ1つ広げた網で求める（継ぎ目に陰の段を出さない）。uvf＝焼いた図の位置（無い時は北の四角の図）。sub が無い時は前と同じ
  function gridTiles({ nx, nz, x0, z0, step, hs, hq, dec, tiles, paint, withUv1, sub = null, uvf = null }) {
    const M = (nx - 1) / dec + 1, MZ = (nz - 1) / dec + 1, st = step * dec
    const S0 = sub ? { i0: sub.i0 / dec, i1: sub.i1 / dec, j0: sub.j0 / dec, j1: sub.j1 / dec } : { i0: 0, i1: M - 1, j0: 0, j1: MZ - 1 }
    const E0 = { i0: Math.max(0, S0.i0 - (sub ? 1 : 0)), i1: Math.min(M - 1, S0.i1 + (sub ? 1 : 0)), j0: Math.max(0, S0.j0 - (sub ? 1 : 0)), j1: Math.min(MZ - 1, S0.j1 + (sub ? 1 : 0)) }
    const m = E0.i1 - E0.i0 + 1, mz = E0.j1 - E0.j0 + 1, gi = (i) => (E0.i0 + i) * dec, gj = (j) => (E0.j0 + j) * dec
    const pos = new Float32Array(m * mz * 3)
    for (let j = 0; j < mz; j++) for (let i = 0; i < m; i++) { const k = j * m + i; pos[k * 3] = x0 + gi(i) * step; pos[k * 3 + 1] = hs[gj(j) * nx + gi(i)] * hq; pos[k * 3 + 2] = z0 + gj(j) * step }
    const full = new THREE.BufferGeometry(); full.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const fi = new Uint32Array((m - 1) * (mz - 1) * 6); let q = 0
    for (let j = 0; j < mz - 1; j++) for (let i = 0; i < m - 1; i++) { const a = j * m + i, b = a + 1, c = a + m, d = c + 1; fi[q++] = a; fi[q++] = c; fi[q++] = b; fi[q++] = b; fi[q++] = c; fi[q++] = d }
    full.setIndex(new THREE.BufferAttribute(fi, 1)); full.computeVertexNormals()
    const nrm = full.attributes.normal.array; full.dispose()
    const col = new Float32Array(m * mz * 3), uv1 = withUv1 ? new Float32Array(m * mz * 2) : null, c = new THREE.Color()
    for (let j = 0; j < mz; j++) for (let i = 0; i < m; i++) {
      const k = j * m + i, x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2]
      paint(c, x, y, z, nrm[k * 3 + 1], gj(j) * nx + gi(i)); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b
      if (uv1) { if (uvf) { const u = uvf(x, z); uv1[k * 2] = u[0]; uv1[k * 2 + 1] = u[1] } else { uv1[k * 2] = lmU(x); uv1[k * 2 + 1] = lmV(z) } }
    }
    const oi = S0.i0 - E0.i0, oj = S0.j0 - E0.j0
    const out = [], [tX, tZ] = tiles, tq = Math.ceil((S0.i1 - S0.i0) / tX), tqz = Math.ceil((S0.j1 - S0.j0) / tZ)
    for (let tj = 0; tj < tZ; tj++) for (let ti = 0; ti < tX; ti++) {
      const i0 = oi + ti * tq, i1 = Math.min(oi + S0.i1 - S0.i0, i0 + tq), j0 = oj + tj * tqz, j1 = Math.min(oj + S0.j1 - S0.j0, j0 + tqz); if (i0 >= i1 || j0 >= j1) continue
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
  let addNearTerrain = null // 便23: 近くの地形を四角ごとに描く（北は組む時・南は addSouth）
  {
    const cGrass = new THREE.Color(GRASS), cGravel = new THREE.Color(0x8a8272), cWet = new THREE.Color(0x5e5a50), cWall = new THREE.Color(0x8c877c), cTown = new THREE.Color(0x8a867e)
    const cBed = new THREE.Color(0xa89e8a), cBed2 = new THREE.Color(0x7d8462), cBed3 = new THREE.Color(0xbdb4a0) // 便21: 川底の丸い礫（灰〜茶灰）・苔の緑・明るい礫
    let southPaint = false // 便23: 南の四角は川が南へ下るので、水際の砂利（北の水面の高さから測る）を塗らない
    const paint = (c, x, y, z, ny, k) => {
      const h = southPaint ? 99 : y - WY, nz = vn(x, z)
      if (zone[k] === 2) { if (wdepA) { const d = wdepA[k] * WDS; c.copy(cBed).lerp(cBed3, vn(x * 3.1, z * 2.7) * 0.6).lerp(cBed2, Math.min(1, d / 0.42) * 0.55 * vn(x * 1.3 + 7, z * 1.7)).multiplyScalar(0.92 - d * 0.35) } else c.copy(cWet).lerp(cGravel, 0.4) } // 水面の下（浅い所の川底の石）。便21: 浅瀬の川底は明るい礫、深い所ほど苔の緑がかる
      else if (zone[k] === 1) { if (ny < 0.8) c.copy(cWall); else c.copy(cGrass).offsetHSL(0, 0, (nz - 0.5) * 0.1).lerp(cGravel, Math.max(0, 1 - Math.abs(h - 0.4)) * 0.6) } // 河川敷の草・水際の砂利・護岸
      else if (ny < 0.8) c.copy(cWall)
      else c.copy(cTown).lerp(cGrass, nz * 0.12) // 町の地面（道と建物の間）
      if (SNOW && zone[k] !== 2 && ny > 0.6) c.lerp(WHITE, 0.62)
    }
    const makeMat = (lmTex) => {
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RAIN ? 0.6 : 0.95, metalness: 0 }))
    useBake(m, lmTex)
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
      ${low ? '' : `for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 o = vec2(float(i), float(j)), cc = ip + o; vec2 h = fract(sin(vec2(dot(cc, vec2(127.1, 311.7)), dot(cc, vec2(269.5, 183.3)))) * 43758.5453); vec2 r = o + h * 0.8 + 0.1 - fp; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; tone = h.x; } else if (d < d2) d2 = d; }`} // 【便21・外の目】iPhone の段は礫の網を省く
      ${low ? '' : `float near = 1.0 - smoothstep(0.25, 0.7, length(fwidth(g)));
      diffuseColor.rgb *= mix(1.0, mix(0.5, 1.0, smoothstep(0.0, 0.14, sqrt(d2) - sqrt(d1))) * (0.8 + 0.4 * tone), near * smoothstep(0.0, 0.03, kd));`} } }`)
      })
      addKey(m, 'caus')
    }
    return m
    }
    // 便23: 四角（rc）の所の点の範囲。網が北の四角だけ（前のデータ）の時は sub を渡さない＝前と同じ描き方
    const subOf = (rc) => ({ i0: Math.round((rc.x0 - NX0) / meta.near.step), i1: Math.round((rc.x1 - NX0) / meta.near.step), j0: Math.round((rc.z0 - NZ0) / meta.near.step), j1: Math.round((rc.z1 - NZ0) / meta.near.step) })
    addNearTerrain = (rc, lmTex, uvf, tiles, south) => {
      const m = makeMat(lmTex); southPaint = !!south
      for (const g of gridTiles({ nx: meta.near.nx, nz: meta.near.nz, x0: NX0, z0: NZ0, step: meta.near.step, hs: terrain, hq: meta.near.hStep, dec: low ? 2 : 1, tiles, paint, withUv1: true, sub: meta.near.regions ? subOf(rc) : null, uvf })) {
        const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = !south; mesh.userData.part = 'terrainNear'; scene.add(mesh)
      }
      southPaint = false
    }
    addNearTerrain(RGA, data.lm.terrain, null, [6, 4], false)
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

  const navSrc = { roadsL: [], bldgL: [], treesL: [] } // 便19: 飛ぶ・歩くの道案内（下の makeNav）が使う、建物と橋の形。便23: 北と南の物を並べる
  // ── 道・小道・橋・線路（地形の焼いた光をそのまま使う） ──
  // 便23: 北の道（組む時）と南の道（addSouth・南の四角の地形の図と図の位置）を同じ関数で描く
  function buildRoads({ p16, idx, kind, al, wd, ps, po, lmTex, uvf }) {
    const P = new Array(p16.length); for (let i = 0; i < p16.length; i++) P[i] = p16[i] * ps + po[i % 3]
    const I = Array.from(idx), K = Array.from(kind), pos = P.slice()
    navSrc.roadsL.push({ pos, idx, kind })
    for (let t = 0; t < idx.length; t += 6) { // 橋の床の両側に、下へ 1.5m の桁を足す
      const a = idx[t]; if (kind[a] !== 2) continue
      for (const [e0, e1] of [[a, a + 2], [a + 1, a + 3]]) { const b = P.length / 3; P.push(pos[e0 * 3], pos[e0 * 3 + 1], pos[e0 * 3 + 2], pos[e1 * 3], pos[e1 * 3 + 1], pos[e1 * 3 + 2], pos[e0 * 3], pos[e0 * 3 + 1] - 1.5, pos[e0 * 3 + 2], pos[e1 * 3], pos[e1 * 3 + 1] - 1.5, pos[e1 * 3 + 2]); K.push(4, 4, 4, 4); I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3) }
    }
    const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I)
    const col = new Float32Array(K.length * 3), uv1 = new Float32Array(K.length * 2), c = new THREE.Color()
    // 便21: 5＝河川敷の真砂土の道（明るいベージュ・少し緑に寄せた頂点の色で、写真の模様を砂利の素材に切り替える）
    const CK = [0x55575a, 0xb0a690, 0x8d8a84, 0x6a5e52, 0x7c7a76, 0xc0b490]
    for (let i = 0; i < K.length; i++) { c.setHex(CK[K[i]]); if (SNOW && K[i] !== 4) c.lerp(WHITE, K[i] === 0 ? 0.35 : 0.55); col.set([c.r, c.g, c.b], i * 3); uv1.set(uvf(P[i * 3], P[i * 3 + 2]), i * 2) }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); g.computeVertexNormals()
    // 便21: 道の細かさ（kamoroad=0 は外し回し用）: 車道の白い外側線（縁から 0.3m）と、幅 9m 以上の道の破線の中央線（6m 引いて 3m あける）／歩道の平板の目地／
    //   河川敷の真砂土の道は縁の草際を濃く・まん中を踏み固めた明るさに／橋の床は両側 2m を歩道（明るい平板と縁石の段の陰）。aRd＝(左 -1・右 +1, 道の長さの位置 m, 幅 m, 種類)
    const ra = al && !/[?&]kamoroad=0/.test(location.search) ? { al, wd } : null
    if (ra) {
      const rd = new Float32Array(K.length * 4)
      for (let i = 0; i < p16.length / 3; i++) rd.set([i % 2 ? -1 : 1, ra.al[i], ra.wd[i] / 10, K[i]], i * 4)
      g.setAttribute('aRd', new THREE.BufferAttribute(rd, 4))
    }
    const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: RAIN ? 0.42 : 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide }))
    useBake(m, lmTex)
    useTex(m, ra ? { a: 'asphalt_02', b: 'gravel_road', tile: 5, tileB: 2.2 } : { a: 'asphalt_02', tile: 5 })
    if (ra) useRoad(m)

    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true; mesh.userData.part = 'roads'; scene.add(mesh)
    return K.length
  }
  {
    const sec = meta.files.roads.secs // 便21: 範囲の中心を引いて詰めてある
    buildRoads({ p16: view(data.buf.roads, sec.pos), idx: view(data.buf.roads, sec.idx), kind: view(data.buf.roads, sec.kind), al: sec.along ? view(data.buf.roads, sec.along) : null, wd: sec.width ? view(data.buf.roads, sec.width) : null, ps: meta.roads.pStep, po: meta.roads.pOff || [0, 0, 0], lmTex: data.lm.terrain, uvf: uvA })
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
      const segs = [...((meta.stones && meta.stones.rows) || []), ...(meta.weirs || [])], NSEG = Math.min(32, segs.length / 4) // 【便21・外の目】飛び石の列を先に（堰が増えて 32 を超えても飛び石の下流の白い筋は消えない）
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
    // 便23: 映り込みの鏡の高さを動かせるようにする（鏡は物の位置で決まる＝物を上下へ動かし、頂点の側で同じだけ戻す。水面は動かない）。
    //   南の四角を足した時だけ、目の見ている所の川の水面へ鏡を合わせる（update）。北の四角の中は前と同じ（WY）
    water.material.uniforms.uShift = { value: 0 }
    water.material.vertexShader = water.material.vertexShader.replace('uniform float time;', 'uniform float time;\nuniform float uShift;').replace(/vec4\( position, 1\.0 \)/g, 'vec4( position - vec3( 0.0, 0.0, uShift ), 1.0 )')
    water.material.needsUpdate = true
    keep(water.material); water.userData.part = 'water'; scene.add(water)
  }
  // 便23: 南の四角の川の水面の高さ（南北 100m の帯ごとの中央値。addSouth が作る）と、その南北の位置での高さ（北の四角の中は WY・継ぎ目の北 200m で WY から寄せる）
  let waterProf = null
  const waterLevelAt = (z) => { if (!waterProf) return WY; const { z0, step, v } = waterProf; if (z <= z0 - 200) return WY; if (z <= z0) return WY + (v[0] - WY) * ((z - (z0 - 200)) / 200); const u = Math.min(v.length - 1.001, (z - z0) / step), i = Math.floor(u), f = u - i; return v[i] * (1 - f) + v[i + 1] * f }

  // ── 建物（PLATEAU LOD2）。壁と屋根で分け、建物ごとに色を変える。区画（400m）ごとに描く ──
  // 部屋のある建物: 窓を置いた建物（PLATEAU）は高さの記録が 24.8m なのに形が 5.6m しかなく、部屋がその屋根の 16m 上に浮いていた（便18 で見つけた）。
  //   部屋のあるマンションの外壁（窓の下と横・屋上）を足し、その中に入る PLATEAU の建物は描かない（重なる面のちらつきも出さない）
  const fromKamo = toKamo.clone().invert()
  const removed = []
  const ochayaSegs = [] // 便24: 描く時に町家（お茶屋）へ替えた家の表の壁の線（buildBldg が足す・使ったら空にする）
  let plug = null, plugForce = null // 便19: 部屋の窓の所を塞ぐ壁（部屋が隠れている間だけ出す）・検証で決め打ちする値
  // 部屋の原点（町の3Dの座標）と、部屋の箱の部屋の座標（窓の中心が原点・正面 -z・左 -x）での広がり
  const roomO = new THREE.Vector3().setFromMatrixPosition(fromKamo.clone().multiply(new THREE.Matrix4().makeTranslation(meta.view.x - 0.6, meta.view.y - 1.5, meta.view.z)))
  const rb = { x0: roomBox.min.x - roomO.x, x1: roomBox.max.x - roomO.x, y0: roomBox.min.y - roomO.y, y1: roomBox.max.y - roomO.y, z0: roomBox.min.z - roomO.z, z1: roomBox.max.z - roomO.z }
  const groundL = (meta.view.groundY - 0.3) - (meta.view.y - 1.5) // 地面（部屋の座標）
  const HOST = { x0: rb.x0, x1: rb.x1 + 16, y0: groundL, y1: rb.y1 + 0.3, z0: 0, z1: rb.z1 + 6 } // 部屋は北東の角（右＝南と奥＝西へ建物が続く）
  const toK = (x, y, z) => new THREE.Vector3(x, y, z).add(roomO).applyMatrix4(toKamo)
  const hostK = new THREE.Box3(); for (const x of [HOST.x0, HOST.x1]) for (const y of [HOST.y0, HOST.y1]) for (const z of [HOST.z0 - 0.3, HOST.z1]) hostK.expandByPoint(toK(x, y, z))
  // 便23: 北の建物（組む時）と南の建物（addSouth・南の建物の図）を同じ関数で描く。isA＝北（部屋のあるマンション・大元宮で外す建物を探す・家並みの有無を決める）。idOff＝色のゆらぎの番号をずらす
  function buildBldg({ bq, uv16, bidA, styleA, frontA, H, bStep, bOff, nv, lmTex, isA, idOff = 0 }) {
    // 便21: 位置は範囲の中心（pOff）を引いて詰めてあるので、ここでメートルに戻してから使う（以下の p16 はメートル・ps は 1）
    const ps = 1
    const p16 = new Float32Array(bq.length); for (let i = 0; i < bq.length; i++) p16[i] = bq[i] * bStep + bOff[i % 3]
    // 便21: 京都らしい家並み（build.mjs の形の種類と通りに面する向き）。古いデータ（無い時）と kamokyo=0（外し回し用）は前の描き方
    if (isA) KYO = !!(styleA && frontA) && !/[?&]kamokyo=0/.test(location.search)
    // 建物ごとの箱（鴨川の座標）。部屋のあるマンションの箱と重なる建物を外す
    const bb = new Map()
    for (let i = 0; i < nv; i++) { const b = bidA[i]; let e = bb.get(b); if (!e) { e = new THREE.Box3(); bb.set(b, e) } e.expandByPoint(new THREE.Vector3(p16[i * 3] * ps, p16[i * 3 + 1] * ps, p16[i * 3 + 2] * ps)) }
    const drop = new Set(); if (isA) for (const [b, e] of bb) if (e.intersectsBox(hostK)) drop.add(b)
    // 便21: 大元宮は名所の部品（kamoMarks.js）が八角の社を作るので、そこの PLATEAU の形は描かない（重なって暗い箱が二重に出た）
    const dgm = isA && meta.marks && meta.marks.daigengu; if (dgm && !/[?&]kamomarks=0/.test(location.search)) for (const [b, e] of bb) { const c = e.getCenter(new THREE.Vector3()); if (Math.hypot(c.x - dgm[0], c.z - dgm[2]) < 9) drop.add(b) }
    if (isA) for (const b of drop) removed.push(b)
    navSrc.bldgL.push({ p16, bidA, drop, ps, nv })
    const WALL = [0xddd6c8, 0xcfc6b4, 0xe8e4da, 0xbcae98, 0xc8ccd0, 0xd4c8b0, 0x9a8a78, 0xa8b0b4, 0xe2d8c0, 0x8a7a6a, 0xc4b8a0, 0xb8b4a8]
    const ROOF = [0x4a4f57, 0x5a6878, 0x4e463e, 0x6a5444, 0x3e444c, 0x7a6a5a, 0x2e3238]
    const KINDS = ['wallP', 'wallC', 'roofT', 'roofF'], CELL = 400
    const mats = {}
    for (const k of KINDS) {
      const m = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: k === 'roofT' ? (RAIN ? 0.45 : 0.7) : 0.88, metalness: 0, side: THREE.DoubleSide }))
      if (k.startsWith('wall')) useWindows(m, k === 'wallC')
      useBake(m, lmTex, { fill: !/[?&]kamofill=0/.test(location.search) }) // kamofill=0 は外し回し用（埋めを外す）
      useTex(m, { roofT: { a: 'grey_roof_tiles', tile: 3, mode: 'xz' }, roofF: { a: 'concrete_wall_004', tile: 6, mode: 'xz', ns: 0.4 }, wallP: { a: 'grey_plaster_02', tile: 3, mode: 'tri', ns: 0.5 }, wallC: { a: 'concrete_wall_004', tile: 4, mode: 'tri', ns: 0.5 } }[k])
      if (KYO) useKyo(m, k.startsWith('wall'))
      mats[k] = m
    }
    const groups = new Map()
    const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), nrm = new THREE.Vector3()
    // 便24: お茶屋の町（祇園・先斗町）の低い家（高さ 11.5m 以下の今の家と古民家）は、町家（お茶屋）として描く（データは「今の家」が多く、漆喰の壁と窓の並びで祇園らしくなかった）。
    //   その家の表の壁の線（通りに向く壁）をここで求め、庇・出格子・暖簾・行灯・2階の手すりを kamoKyo.js が足す。kamokyo2=0 は外し回し用（前のまま）
    const ovr = new Set()
    if (KYO && styleA && frontA && !/[?&]kamokyo2=0/.test(location.search)) for (const [b, e] of bb) { if (drop.has(b) || (styleA[b] !== 0 && styleA[b] !== 2)) continue; const cx = (e.min.x + e.max.x) / 2, cz = (e.min.z + e.max.z) / 2; if ((KGION(cx, cz) || KPONTO(cx, cz)) && e.max.y - e.min.y < 11.5 && e.max.x - e.min.x < 40 && e.max.z - e.min.z < 40) ovr.add(b) }
    const sty = (b) => (ovr.has(b) ? 1 : styleA[b])
    if (ovr.size) {
      const seg = new Map(), n0 = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3()
      for (let t = 0; t < nv; t += 3) {
        const b = bidA[t]; if (!ovr.has(b)) continue
        const ax = p16[t * 3], ay = p16[t * 3 + 1], az = p16[t * 3 + 2]
        u.set(p16[t * 3 + 3] - ax, p16[t * 3 + 4] - ay, p16[t * 3 + 5] - az); w.set(p16[t * 3 + 6] - ax, p16[t * 3 + 7] - ay, p16[t * 3 + 8] - az); n0.crossVectors(u, w).normalize()
        if (Math.abs(n0.y) > 0.3) continue
        const e = bb.get(b), cx = (e.min.x + e.max.x) / 2, cz = (e.min.z + e.max.z) / 2, mx = (ax * 3 + u.x + w.x) / 3 - cx, mz = (az * 3 + u.z + w.z) / 3 - cz
        if (n0.x * mx + n0.z * mz < 0) n0.negate()
        const fa = (frontA[b] / 255) * Math.PI * 2 - Math.PI, fx = Math.sin(fa), fz = Math.cos(fa)
        if (n0.x * fx + n0.z * fz < 0.8) continue
        let q = seg.get(b); if (!q) { q = { s0: 1e9, s1: -1e9, d0: -1e9, fx, fz, y0: e.min.y }; seg.set(b, q) }
        for (let k = 0; k < 3; k++) { const x = p16[(t + k) * 3], z = p16[(t + k) * 3 + 2], ss = x * fz - z * fx, dd = x * fx + z * fz; q.s0 = Math.min(q.s0, ss); q.s1 = Math.max(q.s1, ss); q.d0 = Math.max(q.d0, dd) }
      }
      for (const q of seg.values()) if (q.s1 - q.s0 > 2.5 && q.s1 - q.s0 < 30) { const P = (ss, dd) => [ss * q.fz + dd * q.fx, ss * -q.fx + dd * q.fz]; const [Ax, Az] = P(q.s0, q.d0), [Bx, Bz] = P(q.s1, q.d0); ochayaSegs.push({ A: [Ax, Az], B: [Bx, Bz], f: [q.fx, q.fz], base: q.y0 + 0.2 }) }
    }
    for (const [bid, e] of bb) if (styleA && styleA[bid] !== undefined) kyoCount[sty(bid)]++
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
        if (kb) { const e = bb.get(bid); kb[o * 4] = e ? e.min.y : 0; kb[o * 4 + 1] = (frontA[bid] / 255) * Math.PI * 2 - Math.PI; kb[o * 4 + 2] = sty(bid); kb[o * 4 + 3] = hash((bid + idOff) * 1.37 + 0.21) } // 便21: 建物の足もとの高さ・通りに面する向き・形の種類・建物ごとのゆらぎ
        uv1[o * 2] = uv16[s * 2] / 65535; uv1[o * 2 + 1] = uv16[s * 2 + 1] / 65535
        if (k.startsWith('roof')) { c.setHex(ROOF[Math.floor(hash(bid + idOff) * ROOF.length)]); if (SNOW) c.lerp(WHITE, 0.6) } else c.setHex(WALL[Math.floor(hash(bid + idOff + 0.5) * WALL.length)])
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b; o++
      }
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); if (kb) g.setAttribute('aKB', new THREE.BufferAttribute(kb, 4)); g.computeVertexNormals()
      const mesh = new THREE.Mesh(g, mats[k]); mesh.castShadow = isA; mesh.receiveShadow = true; mesh.userData.part = 'bldg'; scene.add(mesh)
    }
    return groups.size
  }
  {
    const sec = meta.files.bldg.secs
    buildBldg({ bq: view(data.buf.bldg, sec.pos), uv16: view(data.buf.bldg, sec.uv), bidA: view(data.buf.bldg, sec.bid), styleA: sec.style ? view(data.buf.bldg, sec.style) : null, frontA: sec.front ? view(data.buf.bldg, sec.front) : null, H: meta.bldg.heights, bStep: meta.bldg.pStep, bOff: meta.bldg.pOff || [0, 0, 0], nv: meta.bldg.nv, lmTex: data.lm.bldg, isA: true })
  }
  // 便24: 描く時に町家へ替えた家の庇と表の細かい物（北の四角には祇園・先斗町が無いので、ふつうは 0 軒）
  function addOchaya(seed) { if (!ochayaSegs.length) return; try { kyo2.ochaya.push(buildOchayaFronts({ scene, keep, NIGHT, DUSK: TK === 'dusk', SNOW, low }, ochayaSegs.splice(0), seed)) } catch (e) { console.warn('お茶屋の表を組めなかった:', e && e.message) } }
  // 便21: 町家の通り庇（いぶし銀の瓦）と、軒裏と庇の先（濃い木）、犬矢来（竹の囲い）。build.mjs が町家の表の壁から作った形
  let eaveN = 0
  function buildEaves(ep, ek) { // 便23: 北（組む時）と南（addSouth）を同じ関数で
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
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = 'eaves'; scene.add(mesh); eaveN += ek.length / 3
    // 便24: 町家の表の細かい物（出格子・暖簾・行灯・駒寄せ・2階の手すり）。庇のデータの表の壁の線から作る（町の乱数は回さない）
    try { const r = buildMachiyaFronts({ scene, keep, NIGHT, DUSK: TK === 'dusk', SNOW, low }, ep, ek, kyo2.fronts.length + 1); kyo2.fronts.push(r) } catch (e) { console.warn('町家の表の細かい物を組めなかった:', e && e.message) }
  }
  const kyo2 = { fronts: [], yuka: null, ochaya: [] } // 便24
  addOchaya(1)
  if (KYO && meta.files.misc.secs.eaves) buildEaves(view(data.buf.misc, meta.files.misc.secs.eaves), view(data.buf.misc, meta.files.misc.secs.eaveKind))
  // ── 便21: 橋の欄干と石灯籠・街灯（kamobridge=0 は外し回し用） ──
  //   賀茂大橋（今出川通）: 白っぽい石の高欄（1m おきの束と笠石）と、歩道の外側に 20m おきの石灯籠（台・竿・中台・火袋・六角の笠・宝珠）。夕方と夜は火袋が灯る（調べ §8「欄干の石灯籠が夜に灯る」）
  //   出町橋: 灰色のコンクリートの低い壁と薄緑の手すり（調べ §8 の写真）／ほかの橋: コンクリートの欄干 1.05m
  //   街灯: 幅 9m 以上の車道に 32m おき（左右を交互に）と、地図の街灯の点。夕方と夜は灯る（灯りの暈は点の光で描く）
  const lampsInfo = { rails: 0, lanterns: 0, lamps: 0 }
  function buildRails(bridgeEdges, lampList) { // 便23: 北（組む時）と南（addSouth）を同じ関数で
    const LITE = NIGHT || TK === 'dusk'
    const parts = { stone: [], conc: [], pipe: [], glowL: [], pole: [], head: [] }, glowL = [], glowS = []
    const box = (list, a, b, w, h, yb) => { const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz); if (L < 0.05) return; const g = new THREE.BoxGeometry(L + 0.02, h, w); g.translate(0, h / 2 + yb, 0); g.rotateY(-Math.atan2(dz, dx)); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); list.push(g) }
    const post = (list, p, s, h, yb = 0) => { const g = new THREE.BoxGeometry(s, h, s); g.translate(p[0], p[1] + yb + h / 2, p[2]); list.push(g) }
    const lerp3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t]
    const lantern = (p) => {
      post(parts.stone, p, 0.62, 0.22); post(parts.stone, p, 0.24, 0.85, 0.22); post(parts.stone, p, 0.5, 0.12, 1.07)
      const fb = new THREE.BoxGeometry(0.4, 0.38, 0.4); fb.translate(p[0], p[1] + 1.38, p[2]); parts.glowL.push(fb)
      const kasa = new THREE.ConeGeometry(0.52, 0.34, 6); kasa.translate(p[0], p[1] + 1.74, p[2]); parts.stone.push(kasa)
      const hoju = new THREE.SphereGeometry(0.1, 8, 6); hoju.translate(p[0], p[1] + 1.98, p[2]); parts.stone.push(hoju)
      glowL.push(p[0], p[1] + 1.38, p[2]); lampsInfo.lanterns++
    }
    const carK = bridgeEdges.filter((b) => b.style === 'kamo' && !b.foot).flatMap((b) => [...b.l, ...b.r])
    const dCar = (E) => E.reduce((s, p) => s + Math.min(...carK.map((q) => Math.hypot(q[0] - p[0], q[2] - p[2]))), 0) / E.length
    for (const b of bridgeEdges) {
      const outer = b.style === 'kamo' && b.foot && carK.length ? (dCar(b.l) > dCar(b.r) ? 'l' : 'r') : null
      for (const side of ['l', 'r']) {
        if (b[side + 'In']) continue
        const E = b[side], O = b[side === 'l' ? 'r' : 'l']
        const P = E.map((p, i) => { const dx = O[i][0] - p[0], dz = O[i][2] - p[2], l = Math.hypot(dx, dz) || 1; return [p[0] + (dx / l) * 0.15, p[1], p[2] + (dz / l) * 0.15] })
        lampsInfo.rails++
        let acc = 0, nextL = 4
        for (let i = 0; i < P.length - 1; i++) {
          const a = P[i], c = P[i + 1], L = Math.hypot(c[0] - a[0], c[2] - a[2])
          if (b.style === 'kamo') { box(parts.stone, a, c, 0.3, 0.16, 0.9); box(parts.stone, a, c, 0.24, 0.12, 0.04); const n = Math.max(1, Math.round(L / 1.0)); for (let k = 0; k < n; k++) post(parts.stone, lerp3(a, c, k / n), 0.13, 0.78, 0.12) }
          else if (b.style === 'demachi') { box(parts.conc, a, c, 0.22, 0.82, 0); box(parts.pipe, a, c, 0.08, 0.08, 1.02) }
          else box(parts.conc, a, c, 0.22, 1.05, 0)
          if (side === outer) while (acc + L >= nextL) { lantern(lerp3(a, c, (nextL - acc) / L)); nextL += 20 }
          acc += L
        }
      }
    }
    // 街灯: 柱・腕・灯具
    const lp = lampList || []
    for (let i = 0; i < lp.length; i += 4) {
      const x = lp[i], y = lp[i + 1], z = lp[i + 2], a = lp[i + 3], arm = a ? 1.3 : 0.35, hx = x + Math.sin(a) * arm, hz = z + Math.cos(a) * arm
      const pole = new THREE.CylinderGeometry(0.055, 0.08, 6.6, 6); pole.translate(x, y + 3.3, z); parts.pole.push(pole)
      box(parts.pole, [x, y + 6.45, z], [hx, y + 6.45, hz], 0.06, 0.06, 0)
      const hd = new THREE.BoxGeometry(0.5, 0.1, 0.24); hd.rotateY(a + Math.PI / 2); hd.translate(hx, y + 6.4, hz); parts.head.push(hd)
      glowS.push(hx, y + 6.25, hz); lampsInfo.lamps++
    }
    const mk = (list, mat, part, cast = true) => { if (!list.length) return; const g = keep(BGU.mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)))); list.forEach((x) => x.dispose()); const m = new THREE.Mesh(g, keep(mat)); m.castShadow = cast; m.receiveShadow = true; m.userData.part = part; scene.add(m) }
    const stoneM = new THREE.MeshStandardMaterial({ color: SNOW ? 0xdedcd6 : 0xc9c4b8, roughness: 0.9 }); useTex(stoneM, { a: 'concrete_wall_004', tile: 1.6, mode: 'tri', ns: 0.5 })
    const concM = new THREE.MeshStandardMaterial({ color: 0xb4b1aa, roughness: 0.9 }); useTex(concM, { a: 'concrete_wall_004', tile: 2.2, mode: 'tri', ns: 0.5 })
    mk(parts.stone, stoneM, 'bridgeRail'); mk(parts.conc, concM, 'bridgeRail')
    mk(parts.pipe, new THREE.MeshStandardMaterial({ color: 0x8fb39a, roughness: 0.5, metalness: 0.3 }), 'bridgeRail')
    mk(parts.glowL, new THREE.MeshStandardMaterial({ color: 0xd8d2c4, emissive: LITE ? 0xffb060 : 0x000000, emissiveIntensity: NIGHT ? 2.2 : 1.2, roughness: 0.9 }), 'lantern')
    mk(parts.pole, new THREE.MeshStandardMaterial({ color: 0x5c5f63, roughness: 0.6, metalness: 0.4 }), 'lamps', false)
    mk(parts.head, new THREE.MeshStandardMaterial({ color: 0xe8e8e4, emissive: LITE ? 0xfff0d8 : 0x000000, emissiveIntensity: NIGHT ? 2.5 : 1.3, roughness: 0.5 }), 'lamps', false)
    if (LITE) { // 灯りの暈（点の光・遠くでも小さく灯って見える）
      const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64)
      const tx = keep(new THREE.CanvasTexture(cv))
      for (const [arr, col, sz] of [[glowL, 0xffb868, 2.6], [glowS, 0xfff0d8, 3.2]]) {
        if (!arr.length) continue
        const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
        const pm = keep(new THREE.PointsMaterial({ map: tx, color: new THREE.Color(col).multiplyScalar(NIGHT ? 1.6 : 0.9), size: sz, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }))
        const pts = new THREE.Points(g, pm); pts.userData.part = 'glow'; pts.renderOrder = 2; scene.add(pts)
      }
    }
  }
  if (meta.bridgeEdges && !/[?&]kamobridge=0/.test(location.search)) buildRails(meta.bridgeEdges, meta.lamps)
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
  let placeTrees = null // 便23: 木を植える（北は組む時に町の乱数 R で・南は addSouth で別の乱数で）。葉の小片の形と材は北と南で同じ物
  {
    const tr = view(data.buf.misc, meta.files.misc.secs.trees)
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
    const TREE21 = !/[?&]kamotree=0/.test(location.search) // 便21: kamotree=0 は外し回し用（前の樹冠と幹）。幹の色を暗くした（明るい棒に見えた）。【便21・外の目】前はこの注を幹の材の行の途中に置き、後ろの模様の繰り返しと片付けが注に呑まれていた
    const trunkMat = keep(new THREE.MeshStandardMaterial({ color: TREE21 ? 0x6e6358 : 0xffffff, roughness: 1, map: bark.d.clone(), normalMap: bark.n.clone() })); trunkMat.map.repeat.set(1, 2); trunkMat.normalMap.repeat.set(1, 2); trunkMat.map.needsUpdate = trunkMat.normalMap.needsUpdate = true; keep(trunkMat.map); keep(trunkMat.normalMap)
    const trunkGeo = keep(new THREE.CylinderGeometry(0.1, 0.18, 1, low ? 5 : 8, 1, true).translate(0, 0.5, 0))
    placeTrees = (tr, R) => {
    const n = tr.length / 6; navSrc.treesL.push(tr)
    // 1本ずつの形と色を先に決める（乱数の順は木の並びのまま＝区画の分け方で木の形が変わらない）
    const CELL = 400, cells = new Map()
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), at = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      const tx = tr[i * 6], ty = tr[i * 6 + 1], tz = tr[i * 6 + 2], h = tr[i * 6 + 3], w = tr[i * 6 + 4], kind = tr[i * 6 + 5], sR = w * 0.5
      q.setFromAxisAngle(up, R() * 6.283)
      // 便21: 樹冠をもう一回り大きく低く（前は細い幹の上に丸い樹冠が乗った「棒付きの飴」に見えた）。川岸の桜と柳（種類 1）は横へ広く低い。乱数の回る数は前のまま
      const wide = TREE21 ? (kind === 1 ? 1.32 : 1.16) : 1
      sc.set(sR * (0.9 + R() * 0.25) * wide, Math.max(sR * 0.9, h * (TREE21 ? 0.44 : 0.36)) * (0.85 + R() * 0.25), sR * (0.9 + R() * 0.25) * wide) // 樹冠は低く大きく（幹が見えるのは下の 3〜4 割）
      if (TREE21) sc.y = Math.min(sc.y, h * 0.55) // 【便21・外の目】幅が高さに近い木（川岸の桜・クスノキ）は樹冠の下の端が地面の下へ出た
      const crownM = m4.compose(at.set(tx, ty + (TREE21 ? Math.max(h - sc.y * 0.98, sc.y * 0.95 + 1.0) : h - sc.y * 0.8), tz), q, sc).clone()
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
    placeTrees(tr, R)
  }

  // ── 飛び石（鴨川デルタの亀と千鳥の石。形は計算で丸めた平たい石） ──
  // 便21: 本物は明るい灰色のコンクリートの石で、角の丸い長方形が多く、ときどき亀（丸い甲羅と頭）と千鳥（鳥）の形（調べ §7）。
  //   水に浸かる下の方は濃い灰〜苔の緑。石の上は水面の 12cm 上（build.mjs）。形の種類が無い古いデータは、前の丸めた石
  const stoneKinds = { n: 0, byKind: [0, 0, 0, 0] }
  function buildStones(st, sk, stat) { // 便23: 北（組む時・数を数える）と南（addSouth）を同じ関数で
    const n = st.length / 4
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
      for (let i = 0; i < n; i++) { const k = sk[i] === 3 ? 0 : Math.min(2, sk[i]); lists[k].push(i); if (stat) stoneKinds.byKind[sk[i]]++ }
      if (stat) stoneKinds.n = n
      // 検査用（便21）: 渡る石が列の線から左右へずれた量（千鳥）の一番小さい所と大きい所（m）
      const rows = (meta.stones && meta.stones.rows) || []; let zmin = 1e9, zmax = 0
      for (let i = 0; i < n; i++) { if (sk[i] === 3) continue; let best = 1e9; for (let r = 0; r < rows.length; r += 4) { const ax = rows[r], az = rows[r + 1], bx = rows[r + 2], bz = rows[r + 3], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((st[i * 4] - ax) * dx + (st[i * 4 + 2] - az) * dz) / L2)); best = Math.min(best, Math.hypot(st[i * 4] - ax - dx * u, st[i * 4 + 2] - az - dz * u)) } zmin = Math.min(zmin, best); zmax = Math.max(zmax, best) }
      if (stat) stoneKinds.zig = [+zmin.toFixed(2), +zmax.toFixed(2)]
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
  buildStones(view(data.buf.misc, meta.files.misc.secs.stones), meta.files.misc.secs.stoneKind ? view(data.buf.misc, meta.files.misc.secs.stoneKind) : null, true)

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
  const SOUTH_PLACES = [{ name: '祇園', x0: 200, x1: 750, z0: 2750, z1: 3350 }, { name: '先斗町', x0: -170, x1: -90, z0: 2200, z1: 2930 }, { name: '木屋町', x0: -240, x1: -150, z0: 1950, z1: 3300 }, { name: '河原町', x0: -480, x1: -240, z0: 1300, z1: 3400 }, { name: '八坂の塔', x0: 520, x1: 720, z0: 3380, z1: 3600 }] // 便23: kamoOuter.js の OUTER_PLACES と同じ四角
  const outK = (X, Z) => !inK(X, Z, EDGE) // 便23: 鴨川の町の四角の和（南を足すまでは北の四角）の縁から EDGE より外
  // 便21: 表は東西 GN 升・南北 GNZ 升。便23: 南北は南を足すまで北の四角の分だけ（前と同じ大きさ）。addSouth で網の全部に広げて作り直す
  const GC = 2, GN = Math.ceil(NW / GC)
  let GNZ = Math.ceil((RGA.z1 - NZ0) / GC)
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
      const mark = (k, y, yMax) => { if (yMax > top[k]) top[k] = yMax; bld[k] = 1 }
      for (const { p16, bidA, drop, ps, nv } of navSrc.bldgL) for (let t = 0; t < nv; t += 3) { if (drop.has(bidA[t])) continue; const o = t * 3; tri(p16[o] * ps, p16[o + 1] * ps, p16[o + 2] * ps, p16[o + 3] * ps, p16[o + 4] * ps, p16[o + 5] * ps, p16[o + 6] * ps, p16[o + 7] * ps, p16[o + 8] * ps, mark) }
      for (let j = Math.max(0, cj(hostK.min.z)); j <= Math.min(GNZ - 1, cj(hostK.max.z)); j++) for (let i = Math.max(0, ci(hostK.min.x)); i <= Math.min(GN - 1, ci(hostK.max.x)); i++) { const k = j * GN + i; top[k] = Math.max(top[k], hostK.max.y); bld[k] = 1 }
      // 建物の升でも、地面から 1.8m より低い物（塀・段・屋根の無い小さな形）は歩ける
      for (let j = 0; j < GNZ; j++) for (let i = 0; i < GN; i++) { const k = j * GN + i; if (bld[k] && top[k] - terrK(NX0 + (i + 0.5) * GC, NZ0 + (j + 0.5) * GC) < 1.8) bld[k] = 0 }
    }
    { // 橋の床（歩いて渡れる・飛ぶ時は欄干の分だけ上を通る）
      const mark = (k, y) => { if (!(deck[k] >= y)) deck[k] = y; if (y + 1.2 > top[k]) top[k] = y + 1.2 }
      for (const { pos, idx, kind } of navSrc.roadsL) for (let q = 0; q < idx.length; q += 3) { const a = idx[q], b = idx[q + 1], c = idx[q + 2]; if (kind[a] !== 2) continue; tri(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2], pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2], mark) }
    }
    // 木: 樹冠の上の高さ（飛ぶ時）と幹（歩く時の当たり・8m 四方の箱に入れる）
    for (const tr of navSrc.treesL) for (let q = 0; q < tr.length; q += 6) {
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
  const bW = (RGA.x1 - RGA.x0) / 2 - EDGE, bD = (RGA.z1 - RGA.z0) / 2 - EDGE, bCX = TX((RGA.x0 + RGA.x1) / 2, (RGA.z0 + RGA.z1) / 2), bCZ = TZ((RGA.x0 + RGA.x1) / 2, (RGA.z0 + RGA.z1) / 2) // 便23: 北の四角（前の範囲）
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
      if (SOUTH_ON && !inRA(X, Z)) { // 便23: 南の四角（外の町の居場所の名と同じ四角＝kamoOuter.js の OUTER_PLACES）
        if (alt > 90) return '京都の上空'; if (wetK(X, Z) >= 0.5) return '鴨川の上'; if (zoneK(X, Z) === 1) return '鴨川の河川敷'
        for (const p of SOUTH_PLACES) if (X >= p.x0 && X <= p.x1 && Z >= p.z0 && Z <= p.z1) return p.name
        return '京のまちなか' }
      const river = Z < -20 ? (X < 0 ? '賀茂川' : '高野川') : '鴨川' // 【便19・外の目】合流（原点）より北は、西が賀茂川・東が高野川
      if (alt > 70) return '鴨川の上空'; if (wetK(X, Z) >= 0.5) return river + 'の上'; if (Math.hypot(X, Z) < 130) return '鴨川デルタ'; if (zoneK(X, Z) === 1) return river + 'の河川敷'; return 'まちなか' },
    gauge: (y) => Math.max(0, Math.min(1, (y + dY - meta.view.groundY) / 150)), // 高さのゲージ（地面から 150m で満ちる）
    deck: (x, z) => { const k = cellK(KX(x, z), KZ(x, z)), d = k >= 0 ? ensureNav().deck[k] : NaN; return d === d ? d - dY : null }, // 橋の床の高さ（無ければ null・検証用）
    info: () => (G ? { ms: G.ms, cells: GN * GNZ } : null),
  }

  // ── 便22: 外の町の道案内。addOuter で ON（外の町の表）が立つと、鴨川の町の網の外（縁から EDGE より外）は外の町の地面・水・建物・橋で答える。
  //   網の中でも、鴨川の町が描かない縁の 100m の帯の建物（外の町が描く）には当たる。町の3Dは関数を最初に受け取るので、関数の中で ON を見て分ける
  let ON = null, outer = null, outerMs = null, waterCut = null // waterCut＝網の外で落とした鴨川の町の水面の三角形の数
  {
    const inC = (X, Z) => !outK(X, Z)
    const W = {
      ground: (f) => (x, z) => { const X = KX(x, z), Z = KZ(x, z); return inC(X, Z) ? f(x, z) : ON.terr(X, Z) - dY },
      floor: (f) => (x, z) => { const X = KX(x, z), Z = KZ(x, z); return inC(X, Z) ? f(x, z) : ON.floor(X, Z) - dY },
      top: (f) => (x, z) => { const X = KX(x, z), Z = KZ(x, z), o = ON.top(X, Z) - dY; return inC(X, Z) ? Math.max(f(x, z), o) : Math.max(o, ON.floor(X, Z) - dY) },
      topSoft: (f) => (x, z) => { const X = KX(x, z), Z = KZ(x, z), o = ON.soft(X, Z) - dY; return inC(X, Z) ? Math.max(f(x, z), o) : o },
      wet: (f) => (x, z) => { const X = KX(x, z), Z = KZ(x, z); return inC(X, Z) ? f(x, z) : ON.zone(X, Z) === 2 },
      zone: (f) => (x, z) => { const X = KX(x, z), Z = KZ(x, z); if (inC(X, Z)) return f(x, z); const q = ON.zone(X, Z); return q === 2 ? 2 : q === 3 ? 1 : 0 },
      blocked: (f) => (x, z) => { const X = KX(x, z), Z = KZ(x, z); if (!ON.inside(X, Z)) return true; return (inC(X, Z) && f(x, z)) || ON.blocked(X, Z) },
      groundAt: (f) => (x, z, feetY) => { const X = KX(x, z), Z = KZ(x, z); if (inC(X, Z)) return f(x, z, feetY); const d = ON.deck(X, Z, feetY + dY); return (d === d ? d + 0.05 : ON.terr(X, Z)) - dY },
      canStep: (f) => (x, z, feetY) => { const X = KX(x, z), Z = KZ(x, z); if (!ON.inside(X, Z) || ON.blocked(X, Z)) return false; if (inC(X, Z)) return f(x, z, feetY); if (!Number.isNaN(ON.deck(X, Z, feetY + dY))) return true; return ON.zone(X, Z) !== 2 },
      deck: (f) => (x, z) => { const X = KX(x, z), Z = KZ(x, z); if (inC(X, Z)) return f(x, z); const d = ON.deckAt(X, Z); return d === d ? d - dY : null }, // 【便22・外の目 #2】橋の床の高さ（外の町の橋も）
      place: (f) => (x, z, y) => { const X = KX(x, z), Z = KZ(x, z); if (inC(X, Z)) return f(x, z, y); const alt = y + dY - ON.terr(X, Z); if (alt > 90) return '京都の上空'; const p = ON.placeOf(X, Z); if (p) return p; if (ON.zone(X, Z) === 2) return Z > 900 && Math.abs(X + 40) < 220 ? '鴨川の上' : '水の上'; if (ON.zone(X, Z) === 3) return '鴨川の河川敷'; return '京のまちなか' },
    }
    for (const [k, w] of Object.entries(W)) { const f0 = nav[k], wf = w(f0); nav[k] = (...a) => (ON ? wf(...a) : f0(...a)) }
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
  // ── 便21: 名所の形（時計塔・正門・鳥居・大元宮・茂庵・東屋・ベンチ・遊具＝kamoMarks.js・kamomarks=0 は外し回し用） ──
  let marksInfo = null
  try { if (meta.marks && !/[?&]kamomarks=0/.test(location.search)) marksInfo = buildMarks({ scene, marks: meta.marks, keep, NIGHT, DUSK: TK === 'dusk', SNOW }) } catch (e) { console.warn('鴨川の名所の形を組めなかった:', e && e.message) }
  // 便21: 河川敷を歩く人・走る人・自転車、浅瀬で遊ぶ子どもと飛び石に座る学生、夏の夜のデルタの手持ち花火（kamoPeople.js・kamopeople=0 は外し回し用）
  let people = null
  try {
    if (!/[?&]kamopeople=0/.test(location.search) && !/[?&]kamolife=0/.test(location.search)) people = buildPeople({ scene, paths: meta.riverPath || [], stones: hopStones(), terrK: terrFull, wetK, depthK: (X, Z) => (wdepA ? gridAt(X, Z, (k) => wdepA[k] * WDS) : 0), S, TK, sky, low, keep, reduceMotion })
  } catch (e) { console.warn('鴨川の河川敷の人を組めなかったので、人なしで開きます:', e && e.message); people = null }

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
    if (waterProf) { // 便23: 映り込みの鏡を、目の見ている所の川の水面の高さへ（北の四角の中は前のまま WY）
      const cp = camera.position, f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), h = Math.max(0, cp.y - WY), fl = Math.hypot(f.x, f.z), zl = cp.z + (fl > 1e-3 ? f.z / fl : 0) * Math.min(600, h * 1.5)
      const Y = waterLevelAt(zl); if (Math.abs(Y - water.position.y) > 0.01) { water.position.y = Y; water.material.uniforms.uShift.value = Y - WY; water.updateMatrixWorld(true) }
    }
    cloudU.value = tAcc // 便21: 雲の流れの時計
    if (people) { try { people.update(dt) } catch (e) { console.warn('鴨川の河川敷の人を止めました:', e && e.message); people = null; scene.traverse((o) => { if (o.userData && /^(people|fireworks)$/.test(o.userData.part)) o.visible = false }) } }
    if (outer) { try { outer.update(dt, camera) } catch (e) { console.warn('外の町の更新を止めました:', e && e.message); outer = null } }
    if (life) { try { life.update(dt) } catch (e) { console.warn('鴨川の町の動く物を止めました:', e && e.message); life = null; scene.traverse((o) => { if (o.userData && /^(people|birds|train|okuribi)$/.test(o.userData.part)) o.visible = false }) } } // 【便20・外の目】止めた時は、動く物をその場で固まらせずに隠す
  }

  // ── 便23: 南の四角（河原町・木屋町・先斗町・南座・祇園・建仁寺・南の鴨川の岸）を足す。窓辺が開いた後に裏で読んだ south.bin と焼いた図を渡す（外の町より先に足す）。
  //   北の四角と同じ作り（PLATEAU の形のまま・Blender で焼いた光の回り方・京町家の庇・道の白線・川の浅瀬の水）。影は落とさない（日の影の図は窓のまわりだけ＝前から）。kamosouth=0 は外し回し用（足さない）
  let south = null
  function addSouth(sd) {
    if (south || !meta.south || !RGB || !sd || outer) return south // 外の町を足した後には足さない（外の町の地形と遠くの網の下げ方が変わるため）
    const t0 = performance.now(), Sm = meta.south, sec = Sm.secs, v = (k) => view(sd.buf, sec[k])
    for (const t of [sd.lmT, sd.lmB]) { t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; t.flipY = true; t.needsUpdate = true; keep(t) }
    const info = { ms: 0 }
    sd.before = new Set(scene.children) // 南の四角で足した物を見分ける（映り込みの描き直しで描かない物・失敗した時に外す物）
    // 【便23・外の目 直すべき1】組み立て（地形・道・建物・庇・欄干・木・飛び石・ベンチ）を先に行い、途中で失敗したら足した物を外して北の四角だけに戻す（南が穴にならない）。
    //   水面の差し替え・映り込みの鏡・遠くの網の下げ・道案内の広げ・SOUTH_ON は、組み立てが全部通った後にだけ行う
    const nL = { r: navSrc.roadsL.length, b: navSrc.bldgL.length, t: navSrc.treesL.length }
    try {
      addNearTerrain(RGB, sd.lmT, uvB, [3, 6], true)
      info.roadPts = buildRoads({ p16: v('rpos'), idx: v('ridx'), kind: v('rkind'), al: v('ralong'), wd: v('rwidth'), ps: Sm.roads.pStep, po: Sm.roads.pOff, lmTex: sd.lmT, uvf: uvB })
        info.bldgGroups = buildBldg({ bq: v('bpos'), uv16: v('buv'), bidA: v('bid'), styleA: sec.style ? v('style') : null, frontA: sec.front ? v('front') : null, H: Sm.bldg.heights, bStep: Sm.bldg.pStep, bOff: Sm.bldg.pOff, nv: Sm.bldg.nv, lmTex: sd.lmB, isA: false, idOff: 50000 })
      info.bldgTris = Sm.bldg.nv / 3
      addOchaya(2)
      if (/[?&]dev=1/.test(location.search) && /[?&]kamosouthfail=1/.test(location.search)) throw new Error('検証用の失敗（kamosouthfail=1）') // K48 の検証用（?dev=1 の時だけ）
      if (KYO && sec.eaves) buildEaves(v('eaves'), v('eaveKind'))
      // 便24: 納涼床（鴨川の西岸の川に面した家から東へ張り出す木の床・夏と秋）。南の四角の建物の箱から決める
      try { const L = navSrc.bldgL[navSrc.bldgL.length - 1], boxes = new Map(); for (let i = 0; i < L.nv; i++) { const b = L.bidA[i]; if (L.drop.has(b)) continue; let e = boxes.get(b); if (!e) { e = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 }; boxes.set(b, e) } const x = L.p16[i * 3], y = L.p16[i * 3 + 1], z = L.p16[i * 3 + 2]; if (x < e.x0) e.x0 = x; if (x > e.x1) e.x1 = x; if (y < e.y0) e.y0 = y; if (y > e.y1) e.y1 = y; if (z < e.z0) e.z0 = z; if (z > e.z1) e.z1 = z }
        kyo2.yuka = buildYuka({ scene, keep, NIGHT, DUSK: TK === 'dusk', S, low }, [...boxes.values()], terrK, wetK) } catch (e) { console.warn('納涼床を組めなかった:', e && e.message) }
      if (!/[?&]kamobridge=0/.test(location.search)) buildRails(Sm.bridgeEdges || [], Sm.lamps || [])
      { let s = 230501; const RS = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }; placeTrees(v('trees'), RS) } // 南の木は別の乱数（町の R を回さない＝北の物の形を変えない）
      info.trees = v('trees').length / 6; info.canals = (Sm.canals || []).length // 細い水路（高瀬川など・帯の水面は水面の網に入っている）
      buildStones(v('stones'), sec.stoneKind ? v('stoneKind') : null, false)
      try { if (!/[?&]kamomarks=0/.test(location.search)) info.benches = buildMarks({ scene, marks: { benches: Sm.benches || [] }, keep, NIGHT, DUSK: TK === 'dusk', SNOW }).benches } catch (e) { console.warn('南の四角のベンチを組めなかった:', e && e.message) }
      } catch (e) {
      for (const o of scene.children.filter((o) => !sd.before.has(o))) scene.remove(o)
      navSrc.roadsL.length = nL.r; navSrc.bldgL.length = nL.b; navSrc.treesL.length = nL.t
      console.warn('南の四角を組めなかったので、北の四角だけで開きます:', e && e.message)
      return null
    }
    SOUTH_ON = true
    { // 水面: 北の水面の板に南の水面の網を足す（映り込みを描く Water は1つのまま＝映り込みの重さは変えない）
      const g0 = water.geometry, p0 = g0.attributes.position.array, i0 = g0.index.array, wp = v('wpos'), wi = v('widx'), n0 = p0.length / 3, n1 = wp.length / 3
      const P = new Float32Array((n0 + n1) * 3); P.set(p0); for (let i = 0; i < n1; i++) { P[(n0 + i) * 3] = wp[i * 3]; P[(n0 + i) * 3 + 1] = -wp[i * 3 + 2]; P[(n0 + i) * 3 + 2] = wp[i * 3 + 1] - WY }
      const I = new Uint32Array(i0.length + wi.length); I.set(i0); for (let k = 0; k < wi.length; k++) I[i0.length + k] = wi[k] + n0
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setIndex(new THREE.BufferAttribute(I, 1)); g.computeVertexNormals(); g.computeBoundingSphere()
      water.geometry = g; g0.dispose(); info.water = wi.length / 3
      // 映り込みの鏡の高さの表: 南の水面の点の高さの、南北 100m の帯ごとの中央値（水の無い帯は前の帯の値）
      const STP = 100, nb = Math.ceil((RGB.z1 - RGB.z0) / STP) + 1, bands = Array.from({ length: nb }, () => [])
      for (let i = 0; i < n1; i++) { const b = Math.round((wp[i * 3 + 2] - RGB.z0) / STP); if (b >= 0 && b < nb) bands[b].push(wp[i * 3 + 1]) }
      const lv = []; for (let b = 0; b < nb; b++) { const a = bands[b].sort((p, q) => p - q); lv.push(a.length ? a[Math.floor(a.length / 2)] : (lv.length ? lv[lv.length - 1] : WY)) }
      if (!/[?&]kamomirror=0/.test(location.search)) waterProf = { z0: RGB.z0, step: STP, v: lv } // kamomirror=0 は外し回し用（鏡を WY のまま）
      info.mirror = lv.map((y) => +y.toFixed(1))
    }
    // 映り込みの描き直し（Water がもう一度描く舞台）では、目が水面から 60m より高い時だけ、南の四角の建物・木・庇・欄干・灯り・ベンチ・飛び石を描かない（重さのため。高い所からの川の映り込みはほぼ空。川べりの低い目では今のまま映る）。kamomirrorS=0 は外し回し用
    { const before = sd.before, southObjs = scene.children.filter((o) => !before.has(o) && /^(bldg|crown|core|trunk|eaves|bridgeRail|lamps|lantern|glow|marks|stones|kyoFront|yuka)$/.test(o.userData.part || ''))
      info.mirrorSkip = southObjs.length
      if (!/[?&]kamomirrorS=0/.test(location.search)) { const ob = water.onBeforeRender
        water.onBeforeRender = function (...a) { const hi = camera.position.y - water.position.y > 60, vis = hi ? southObjs.map((o) => o.visible) : null; if (hi) for (const o of southObjs) o.visible = false; try { ob.apply(this, a) } finally { if (hi) southObjs.forEach((o, i) => { o.visible = vis[i] }) } } } }
    // 遠くの網を、南の四角の内側（縁から 10m）で 6m 下げる（近くの網の下に隠す。北の四角は前から下げてある）。外の町はこの後で残りを下げる
    scene.traverse((o) => { if (o.userData.part !== 'terrainFar') return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (inK(x, z, 10) && !inRA(x, z, 10)) p.setY(i, p.getY(i) - 6) } p.needsUpdate = true; o.geometry.computeBoundingSphere(); o.geometry.computeBoundingBox() })
    // 道案内の表を網の全部へ広げて、次に聞かれた時に作り直す。飛べる箱も網の全部へ（外の町を足すと外の町の四角へ広がる）
    GNZ = Math.ceil(ND / GC); G = null
    { const W2 = NW / 2 - EDGE, D2 = ND / 2 - EDGE, cx = TX((NX0 + NX1) / 2, (NZ0 + NZ1) / 2), cz = TZ((NX0 + NX1) / 2, (NZ0 + NZ1) / 2)
      let hx2 = (W2 * a10 - a8 * D2) / det, hz2 = (a0 * D2 - a2 * W2) / det
      if (!(hx2 > 0 && hz2 > 0)) { hx2 = hz2 = Math.min(W2, D2) / (a0 + a8 + a2 + a10) * 2 }
      Object.assign(nav.bound, { x: hx2 - cx, xMax: cx + hx2, zMin: cz - hz2, zMax: cz + hz2 }) }
    info.ms = Math.round(performance.now() - t0)
    south = info
    return info
  }
  // ── 便22: 外の町を足す（町の3Dが鴨川の町を組んだ後に、裏で読んだ外の町のデータを渡す） ──
  function addOuter(od, mod) {
    if (outer) return outer.info
    const t0 = performance.now()
    const OX = od.meta.OX
    outer = mod.buildOuter(od, { keep, useTex, useWindows, useKyo, useRoad, gridTiles, chain, addKey, S, TK, SNOW, RAIN, NIGHT, LEAF, WHITE, T, waterNormalTex: water.material.uniforms.normalSampler.value, low, sunDir, fogColor: scene.fog.color.getHex(), inSouth: SOUTH_ON ? (x, z, m) => inK(x, z, m) && !inRA(x, z, m) : null })
    scene.add(outer.group)
    // 遠くの網（50m 間隔）を、外の町の範囲で 6m 下げて外の町の網の下に隠す（鴨川の町の範囲の中は前から下げてある）
    const inN = (x, z, m) => inK(x, z, m) // 便23: 鴨川の町の四角の和（南を足した後は南の四角も下げてある）
    scene.traverse((o) => { if (o.userData.part !== 'terrainFar') return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (x > OX.x0 + 10 && x < OX.x1 - 10 && z > OX.z0 + 10 && z < OX.z1 - 10 && !inN(x, z, 10)) p.setY(i, p.getY(i) - 6) } p.needsUpdate = true; o.geometry.computeBoundingSphere(); o.geometry.computeBoundingBox() })
    // 鴨川の町の水面のうち、網の外（南の五条まで延びていた）の三角形を落とす。川の面の輪の三角形分けが崩れて、祇園や河原町の町の上に水の板がかかっていた（外の町を足すと白いもやに見えた）。
    //   網の外の川の水面は外の町が網から作る。外の町が無い時は前のまま（kamoouter=0）
    { const g = water.geometry, p = g.attributes.position, ix = g.index.array, keepI = []
      for (let t = 0; t < ix.length; t += 3) { const cx = (p.getX(ix[t]) + p.getX(ix[t + 1]) + p.getX(ix[t + 2])) / 3, cz = -(p.getY(ix[t]) + p.getY(ix[t + 1]) + p.getY(ix[t + 2])) / 3; if (inK(cx, cz, -0.5)) keepI.push(ix[t], ix[t + 1], ix[t + 2]) } // 便23: 鴨川の町の四角の和の中だけ（北の水面は北の四角で切ってある）
      waterCut = ix.length / 3 - keepI.length / 3; g.setIndex(keepI); g.computeBoundingSphere() }
    // 水の映り込み（Water がもう一度描く舞台）には外の町を描かない（重さのため・遠くて映り込みに小さい）
    const ob = water.onBeforeRender
    water.onBeforeRender = function (...a) { const v = outer && outer.group.visible; if (outer) outer.group.visible = false; try { ob.apply(this, a) } finally { if (outer) outer.group.visible = v } }
    ON = makeOuterNav(od, mod.OUTER_PLACES)
    // 飛べる箱を外の町の四角へ広げる（町の3Dは同じ箱の入れ物を見ている）
    { const W2 = (OX.x1 - OX.x0) / 2 - EDGE, D2 = (OX.z1 - OX.z0) / 2 - EDGE, cx = TX((OX.x0 + OX.x1) / 2, (OX.z0 + OX.z1) / 2), cz = TZ((OX.x0 + OX.x1) / 2, (OX.z0 + OX.z1) / 2)
      let hx2 = (W2 * a10 - a8 * D2) / det, hz2 = (a0 * D2 - a2 * W2) / det
      if (!(hx2 > 0 && hz2 > 0)) { hx2 = hz2 = Math.min(W2, D2) / (a0 + a8 + a2 + a10) * 2 }
      Object.assign(nav.bound, { x: hx2 - cx, xMax: cx + hx2, zMin: cz - hz2, zMax: cz + hz2 }) }
    outerMs = Math.round(performance.now() - t0)
    return outer.info
  }
  // 外の町の道案内の表（4m 四方・iPhone の段は 8m＝表の大きさを 4 分の 1 に）。建物（箱と外形）の上の高さ・建物の升・木の上・橋の床。最初に聞かれた時に作る
  function makeOuterNav(od, places) {
    const M = od.meta, OX = M.OX, st = M.step, nx = M.nx, nz = M.nz, hq = M.hStep
    const hs = view(od.buf.terrain, M.files.terrain.secs.h), zn = view(od.buf.terrain, M.files.terrain.secs.zone)
    // 【便22・外の目 #1】外の町の網は鴨川の町の範囲の内側を 6m 下げてある。鴨川の町の網の中（縁から EDGE の帯を含む）は、鴨川の町の地面・水・地面の種類で答える（前は縁から 4〜40m の帯で地面が 6m 下に沈んだ）
    const inGrid = (X, Z) => inK(X, Z, 0) // 便23: 鴨川の町の四角の和の中
    const terrO = (X, Z) => { const u = Math.min(nx - 1.001, Math.max(0, (X - OX.x0) / st)), v = Math.min(nz - 1.001, Math.max(0, (Z - OX.z0) / st)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * nx + i
      return ((hs[k] * (1 - fu) + hs[k + 1] * fu) * (1 - fv) + (hs[k + nx] * (1 - fu) + hs[k + nx + 1] * fu) * fv) * hq }
    const terr = (X, Z) => (inGrid(X, Z) ? terrK(X, Z) : terrO(X, Z))
    const zoneO = (X, Z) => zn[Math.round(Math.min(nz - 1, Math.max(0, (Z - OX.z0) / st))) * nx + Math.round(Math.min(nx - 1, Math.max(0, (X - OX.x0) / st)))]
    const zone = (X, Z) => { if (!inGrid(X, Z)) return zoneO(X, Z); const q = zoneK(X, Z); return q === 2 ? 2 : q === 1 ? 3 : 0 }
    const floor = (X, Z) => (inGrid(X, Z) ? floorK(X, Z) : terrO(X, Z) + (zoneO(X, Z) === 2 ? 1.0 : 0))
    const GCo = low ? 8 : 4, GX = Math.ceil((OX.x1 - OX.x0) / GCo), GZ = Math.ceil((OX.z1 - OX.z0) / GCo)
    let tb = null
    const build = () => {
      if (tb) return tb
      const t0 = performance.now(), top = new Float32Array(GX * GZ).fill(-1e9), bld = new Uint8Array(GX * GZ), deck = new Float32Array(GX * GZ).fill(NaN)
      const ci = (X) => Math.floor((X - OX.x0) / GCo), cj = (Z) => Math.floor((Z - OX.z0) / GCo)
      try {
        const B = od.boxes, q = B.q
        for (let i = 0; i < B.nB; i++) { // 箱: 升の中心が回した長方形の中か
          if (B.skip && B.skip[i]) continue // 便23: 南の四角で描かない箱
          const o = i * B.st, cx = B.bi[o] * q.xz, cz = B.bi[o + 1] * q.xz, w = B.bu[o + 2] * q.size, d = B.bu[o + 3] * q.size, hh = B.bu[o + 4] * q.size, base = B.bi[o + 5] * q.base, ang = (B.bu[o + 6] / 65535) * Math.PI, roof = (B.bu[o + 7] >> 4) & 3
          const c = Math.cos(ang), sn = Math.sin(ang), R0 = Math.hypot(w, d) / 2 + 1, yT = base + hh + (roof ? 0.5 * Math.min(w, d) / 2 + 0.5 : 0)
          for (let j = Math.max(0, cj(cz - R0)); j <= Math.min(GZ - 1, cj(cz + R0)); j++) for (let ii = Math.max(0, ci(cx - R0)); ii <= Math.min(GX - 1, ci(cx + R0)); ii++) {
            const px = OX.x0 + (ii + 0.5) * GCo - cx, pz = OX.z0 + (j + 0.5) * GCo - cz, u = px * c + pz * sn, v = -px * sn + pz * c
            if (Math.abs(u) <= w / 2 + 0.5 && Math.abs(v) <= d / 2 + 0.5) { const k = j * GX + ii; if (yT > top[k]) top[k] = yT; if (hh > 1.8) bld[k] = 1 }
          }
        }
        // 外形の建物（駅ビルなど）: 升の中心が外形の中か
        const pp = view(od.buf.bldg, M.files.bldg.secs.poly), pts = view(od.buf.bldg, M.files.bldg.secs.polyPts), PS = M.polyStride
        for (let i = 0; i < pp.length / PS; i++) {
          const base = pp[i * PS] * q.base, hh = pp[i * PS + 1] * q.size, n = pp[i * PS + 4], o = pp[i * PS + 5], R2 = []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9
          for (let k = 0; k < n; k++) { const x = pts[(o + k) * 2] * q.xz, z = pts[(o + k) * 2 + 1] * q.xz; R2.push([x, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
          for (let j = Math.max(0, cj(z0)); j <= Math.min(GZ - 1, cj(z1)); j++) for (let ii = Math.max(0, ci(x0)); ii <= Math.min(GX - 1, ci(x1)); ii++) { const px = OX.x0 + (ii + 0.5) * GCo, pz = OX.z0 + (j + 0.5) * GCo; let inside = false; for (let a = 0, b = n - 1; a < n; b = a++) { const [xa, za] = R2[a], [xb, zb] = R2[b]; if (za > pz !== zb > pz && px < ((xb - xa) * (pz - za)) / (zb - za) + xa) inside = !inside } if (inside) { const k = j * GX + ii; top[k] = Math.max(top[k], base + hh); bld[k] = 1 } }
        }
        // 名所の高さ（京都タワー 131m・八坂の塔 46m など）
        for (const [X, Z, r, yT] of od.meishoNav || []) for (let j = Math.max(0, cj(Z - r)); j <= Math.min(GZ - 1, cj(Z + r)); j++) for (let ii = Math.max(0, ci(X - r)); ii <= Math.min(GX - 1, ci(X + r)); ii++) { const px = OX.x0 + (ii + 0.5) * GCo, pz = OX.z0 + (j + 0.5) * GCo; if (Math.hypot(px - X, pz - Z) <= r) { const k = j * GX + ii; top[k] = Math.max(top[k], yT); bld[k] = 1 } }
        // 木の上（飛ぶ時）
        const t = od.trees; for (let i = 0; i < t.length; i += 6) { const X = t[i], Y = t[i + 1], Z = t[i + 2], hh = t[i + 3], r = t[i + 4] * 0.5; for (let j = Math.max(0, cj(Z - r)); j <= Math.min(GZ - 1, cj(Z + r)); j++) for (let ii = Math.max(0, ci(X - r)); ii <= Math.min(GX - 1, ci(X + r)); ii++) { const k = j * GX + ii; if (Y + hh > top[k]) top[k] = Y + hh } }
        // 橋の床（道の帯の種類 2）
        const rs = M.files.roads.secs, rq = M.roadQ, p16 = view(od.buf.roads, rs.pos), runs = view(od.buf.roads, rs.runs), kd = view(od.buf.roads, rs.kind)
        let base = 0
        for (const L of runs) {
          if (kd[base] === 2) for (let i = 0; i < L - 1; i++) { const a = base + i * 2, P = (v) => [p16[v * 3] * rq.xz, p16[v * 3 + 1] * rq.y, p16[v * 3 + 2] * rq.xz], A = P(a), Bq = P(a + 1), Cq = P(a + 2), Dq = P(a + 3)
            const x0 = Math.min(A[0], Bq[0], Cq[0], Dq[0]), x1 = Math.max(A[0], Bq[0], Cq[0], Dq[0]), z0 = Math.min(A[2], Bq[2], Cq[2], Dq[2]), z1 = Math.max(A[2], Bq[2], Cq[2], Dq[2]), y = (A[1] + Bq[1] + Cq[1] + Dq[1]) / 4
            const mx = (A[0] + Bq[0] + Cq[0] + Dq[0]) / 4, mz = (A[2] + Bq[2] + Cq[2] + Dq[2]) / 4, ax = (Cq[0] + Dq[0] - A[0] - Bq[0]) / 2, az = (Cq[2] + Dq[2] - A[2] - Bq[2]) / 2, al = Math.hypot(ax, az) || 1, hw = Math.hypot(Bq[0] - A[0], Bq[2] - A[2]) / 2
            for (let j = Math.max(0, cj(z0)); j <= Math.min(GZ - 1, cj(z1)); j++) for (let ii = Math.max(0, ci(x0)); ii <= Math.min(GX - 1, ci(x1)); ii++) { const px = OX.x0 + (ii + 0.5) * GCo - mx, pz = OX.z0 + (j + 0.5) * GCo - mz, u = (px * ax + pz * az) / al, v = (-px * az + pz * ax) / al; if (Math.abs(u) <= al / 2 + 1 && Math.abs(v) <= hw + 0.3) { const k = j * GX + ii; if (!(deck[k] >= y)) deck[k] = y; if (y + 1.2 > top[k]) top[k] = y + 1.2 } } }
          base += L * 2
        }
      } catch (e) { console.warn('外の町の道案内の表を組めなかったので、地面と水だけで飛ぶ・歩く:', e && e.message); top.fill(-1e9); bld.fill(0); deck.fill(NaN) }
      // 建物の升でも地面から 1.8m より低い物は歩ける。飛ぶ時の下限＝地面と上の高い方を 8m に広げてなだらかに
      const F = new Float32Array(GX * GZ)
      for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { const k = j * GX + i, X = OX.x0 + (i + 0.5) * GCo, Z = OX.z0 + (j + 0.5) * GCo, fl = floor(X, Z); if (bld[k] && top[k] - terr(X, Z) < 1.8) bld[k] = 0; F[k] = Math.max(top[k], fl) }
      const pass = (src, r, op) => { const tmp = new Float32Array(GX * GZ), out = new Float32Array(GX * GZ)
        for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { let m = op === 'max' ? -1e9 : 0, c = 0; for (let d = -r; d <= r; d++) { const v = src[j * GX + Math.min(GX - 1, Math.max(0, i + d))]; if (op === 'max') { if (v > m) m = v } else { m += v; c++ } } tmp[j * GX + i] = op === 'max' ? m : m / c }
        for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { let m = op === 'max' ? -1e9 : 0, c = 0; for (let d = -r; d <= r; d++) { const v = tmp[Math.min(GZ - 1, Math.max(0, j + d)) * GX + i]; if (op === 'max') { if (v > m) m = v } else { m += v; c++ } } out[j * GX + i] = op === 'max' ? m : m / c }
        return out }
      tb = { top: F, bld, deck, S: pass(pass(F, 2, 'max'), 2, 'avg'), ms: Math.round(performance.now() - t0) }
      return tb
    }
    const cell = (X, Z) => { const i = Math.floor((X - OX.x0) / GCo), j = Math.floor((Z - OX.z0) / GCo); return i < 0 || j < 0 || i >= GX || j >= GZ ? -1 : j * GX + i }
    return {
      terr, zone, floor,
      inside: (X, Z) => X > OX.x0 + EDGE && X < OX.x1 - EDGE && Z > OX.z0 + EDGE && Z < OX.z1 - EDGE,
      top: (X, Z) => { const k = cell(X, Z); return k >= 0 ? build().top[k] : -1e9 },
      soft: (X, Z) => { const g = build(), u = Math.min(GX - 1.001, Math.max(0, (X - OX.x0) / GCo - 0.5)), v = Math.min(GZ - 1.001, Math.max(0, (Z - OX.z0) / GCo - 0.5)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * GX + i; return (g.S[k] * (1 - fu) + g.S[k + 1] * fu) * (1 - fv) + (g.S[k + GX] * (1 - fu) + g.S[k + GX + 1] * fu) * fv },
      blocked: (X, Z) => { const k = cell(X, Z); return k >= 0 && build().bld[k] === 1 },
      deck: (X, Z, feetK) => { const k = cell(X, Z); if (k < 0) return NaN; const d = build().deck[k]; return d === d && Math.abs(d - feetK) < 1.3 ? d : NaN },
      deckAt: (X, Z) => { const k = cell(X, Z); return k < 0 ? NaN : build().deck[k] },
      placeOf: (X, Z) => { for (const p of places) if (X >= p.x0 && X <= p.x1 && Z >= p.z0 && Z <= p.z1) return p.name; return null },
      info: () => ({ ms: tb ? tb.ms : null, cells: GX * GZ }),
    }
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
    addOuter, // 便22: 外の町を足す（kamoOuter.js が読んだデータ）
    loadSouth: meta.south && !/[?&]kamosouth=0/.test(location.search) ? () => loadSouthData(data) : null, // 便23: 南の四角のデータを裏で読む（無い時・kamosouth=0 は null）
    addSouth, // 便23: 南の四角を足す（外の町より先に）
    setRoomShown(b) { if (plug) plug.visible = plugForce === null ? !b : plugForce }, // 便19: 部屋が見えている間は窓の所を空け、隠れている間（空・地上）は塞ぐ
    forcePlug(v) { plugForce = v === null || v === undefined ? null : !!v }, // 検証用（便19）: 塞ぐ壁を出す・出さないに決める（null で戻す）
    info() { return { calls, tris, removed: removed.length, low, time: TK, sky, shadow: sunL.castShadow, exposure: state.exposure, parts, nav: nav.info(), waveTop20, waterMs, waterRot, waterShallow, caus: CAUS, stones: stoneKinds, clouds: !!cloudMesh, bridges: lampsInfo, marks: marksInfo, people: people ? people.info() : null, kyo: KYO ? { count: kyoCount, eaves: eaveN, fronts: kyo2.fronts, yuka: kyo2.yuka, ochaya: kyo2.ochaya, ochayaAt: kyoFrontsAt } : null, navDec, plugShown: !!(plug && plug.visible), lifeMs, south, mirrorY: +water.position.y.toFixed(2), waterOut: (() => { const g = water.geometry, p = g.attributes.position, ix = g.index.array; let n = 0; for (let t = 0; t < ix.length; t += 3) { const cx = (p.getX(ix[t]) + p.getX(ix[t + 1]) + p.getX(ix[t + 2])) / 3, cz = -(p.getY(ix[t]) + p.getY(ix[t + 1]) + p.getY(ix[t + 2])) / 3; if (!inK(cx, cz, -0.5)) n++ } return n })(), outer: outer ? { ...outer.info, ms: outerMs, waterCut, nav: ON ? ON.info() : null, bound: { ...nav.bound } } : null } },
    countFrame(r) { calls = r.info.render.calls; tris = r.info.render.triangles },
    dispose() {
      try {
        const mrt = water.material.uniforms.mirrorSampler.value
        if (mrt && mrt.renderTarget) mrt.renderTarget.dispose()
        if (sunL.shadow && sunL.shadow.map) sunL.shadow.map.dispose()
        scene.traverse((o) => { if (o.isInstancedMesh) o.dispose() })
        for (const d of disposables) { try { d.dispose() } catch (e) { /* 無視 */ } }
        if (window.__kamoScene === scene) window.__kamoScene = null
      } catch (e) { /* 無視 */ }
    },
  }
}
