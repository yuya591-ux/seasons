// 便16 設計案の見本: 本物の写真から作った CC0 の質感の素材（Poly Haven・https://polyhaven.com/license ）を、
// 試作の建物と地面に貼る（?tex=1 の時だけ。公開のページには入れない）。
// 束ねて描く建物は1つずつ大きさが違うので、図の位置は建物の実寸（vFP）か世界の位置から決める（引き伸ばさない）。
export function makeTexKit(THREE, renderer) {
  const loader = new THREE.TextureLoader(), cache = new Map(), aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  function get(name) {
    if (cache.has(name)) return cache.get(name)
    const avg = new THREE.Vector3(0.5, 0.5, 0.5)
    const ld = (k, srgb) => { const t = loader.load(`./_bin16-tex/${name}_${k}.jpg`, (tx) => {
      if (k !== 'd') return
      const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(tx.image, 0, 0, 16, 16)
      const p = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0; for (let i = 0; i < p.length; i += 4) { r += (p[i] / 255) ** 2.2; g += (p[i + 1] / 255) ** 2.2; b += (p[i + 2] / 255) ** 2.2 }
      const n = p.length / 4; avg.set(r / n, g / n, b / n) // 図の平均の色（線形）＝建物の色を保ったまま模様だけを足す時に割る
    }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t }
    const kit = { d: ld('d', true), n: ld('n', false), r: ld('r', false), avg }
    cache.set(name, kit); return kit
  }
  // シェーダーに差し込む共通の部品（図を引く・凹凸を写真の法線の図から付ける）
  const PARS = `
uniform sampler2D uTD; uniform sampler2D uTN; uniform sampler2D uTR; uniform vec3 uTAvg; uniform float uTDirect; uniform float uTNS;
vec3 tSample(vec2 uv) { return texture2D(uTD, uv).rgb; }`
  const NORMAL = `
  { vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition); vec2 st0 = dFdx(tuv), st1 = dFdy(tuv);
    vec3 N0 = normal; vec3 q1p = cross(q1, N0), q0p = cross(N0, q0);
    vec3 T0 = q1p * st0.x + q0p * st1.x, B0 = q1p * st0.y + q0p * st1.y;
    float det = max(dot(T0, T0), dot(B0, B0)); float sc = det == 0.0 ? 0.0 : faceDirection * inversesqrt(det);
    vec3 mN = texture2D(uTN, tuv).xyz * 2.0 - 1.0; mN.xy *= uTNS;
    normal = normalize(T0 * (mN.x * sc) + B0 * (mN.y * sc) + N0 * mN.z); }`
  function uniforms(sh, name, direct, ns) { const k = get(name); Object.assign(sh.uniforms, { uTD: { value: k.d }, uTN: { value: k.n }, uTR: { value: k.r }, uTAvg: { value: k.avg }, uTDirect: { value: direct ? 1 : 0 }, uTNS: { value: ns } }) }
  // 色: direct＝写真の色そのもの（レンガ調タイルなど）／それ以外＝建物の色に写真の模様だけを足す
  const COLOR = `
  vec3 tc = tSample(tuv); diffuseColor.rgb = mix(diffuseColor.rgb * clamp(tc / max(uTAvg, vec3(0.02)), 0.0, 2.2), tc * 1.05, uTDirect);`
  const ROUGH = 'roughnessFactor = clamp(texture2D(uTR, tuv).g * 1.05, 0.05, 1.0);'
  // 地面と道（水平の面）: 世界の位置で図を引く。地面は草と舗装を頂点の色の緑みで混ぜる
  function ground(mat, opt) {
    mat.onBeforeCompile = (sh) => {
      const a = get(opt.a), b = opt.b ? get(opt.b) : null
      Object.assign(sh.uniforms, { uGA: { value: a.d }, uGAN: { value: a.n }, uGAavg: { value: a.avg }, uGB: { value: b ? b.d : a.d }, uGBN: { value: b ? b.n : a.n }, uGBavg: { value: b ? b.avg : a.avg }, uGTile: { value: opt.tile }, uGTileB: { value: opt.tileB || opt.tile }, uGDirect: { value: opt.direct ? 1 : 0 } })
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; uniform sampler2D uGA; uniform sampler2D uGAN; uniform vec3 uGAavg; uniform sampler2D uGB; uniform sampler2D uGBN; uniform vec3 uGBavg; uniform float uGTile; uniform float uGTileB; uniform float uGDirect;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 tuvA = vGW.xz / uGTile, tuvB = vGW.xz / uGTileB;
          ${opt.b ? 'float gmix = smoothstep(0.02, 0.08, diffuseColor.g - (diffuseColor.r + diffuseColor.b) * 0.5);' : 'float gmix = 0.0;'}
          vec3 ta = texture2D(uGA, tuvA).rgb, tb = texture2D(uGB, tuvB).rgb;
          vec3 detA = clamp(ta / max(uGAavg, vec3(0.02)), 0.0, 2.2), detB = clamp(tb / max(uGBavg, vec3(0.02)), 0.0, 2.2);
          vec3 det = mix(detA, detB, gmix);
          diffuseColor.rgb = mix(diffuseColor.rgb * det, ta, uGDirect);
          vec2 tuv = mix(tuvA, tuvB, step(0.5, gmix));`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition); vec2 st0 = dFdx(tuv), st1 = dFdy(tuv);
            vec3 N0 = normal; vec3 q1p = cross(q1, N0), q0p = cross(N0, q0);
            vec3 T0 = q1p * st0.x + q0p * st1.x, B0 = q1p * st0.y + q0p * st1.y;
            float det2 = max(dot(T0, T0), dot(B0, B0)); float sc = det2 == 0.0 ? 0.0 : faceDirection * inversesqrt(det2);
            vec3 mN = mix(texture2D(uGAN, tuv).xyz, texture2D(uGBN, tuv).xyz, gmix) * 2.0 - 1.0; mN.xy *= 0.8;
            normal = normalize(T0 * (mN.x * sc) + B0 * (mN.y * sc) + N0 * mN.z); }`)
    }
    mat.customProgramCacheKey = () => 'ground:' + opt.a + (opt.b || '')
    return mat
  }
  return { get, PARS, NORMAL, COLOR, ROUGH, uniforms, ground }
}
