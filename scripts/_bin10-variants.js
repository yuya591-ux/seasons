import { SEA_VARIANTS } from './_bin10-variants-sea.js'
// 使い捨て（便10）: 案のシェーダーの文。キーは '<シェーダー名>:<案>'。値は (quality, { orig }) => 組み立てた文
// 本体の組み立て済みの文（orig）の main() から後ろを、案の main() に置き換える（hash21・vnoise・fbm・outside・applyGrade などはそのまま使う）

// ── ②雨の窓: レンズの水滴 ──
// 粒は小さな凸レンズ＝粒の中に、外の景色が上下左右逆さに縮んで映る（Codrops の雨の窓の観察）。
// 粒の外は結露したガラス越し＝景色をぼかして（12点の渦巻きの平均）白ませる。光る玉と縦の光の線は描かない。
const RAIN_COMMON = /* glsl */ `
  vec3 b10Blur(vec2 uv, float rad) {
    vec3 s = outside(uv);
    float asp = uResolution.y / uResolution.x;
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float a = fi * 2.39996;
      float r = sqrt((fi + 0.5) / 12.0) * rad;
      s += outside(uv + vec2(cos(a) * r * asp, sin(a) * r));
    }
    return s / 13.0;
  }
  // 1層の水滴。xy=粒の中心からのずれ（縦横をそろえた座標）・z=粒の形・w=半径
  vec4 b10Drops(vec2 ruv, float N, float seed, float t, float density, float rMin, float rMax) {
    vec2 g = ruv * N;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = hash21(id + seed);
    float exists = step(1.0 - density, hash21(id + seed + 4.1));
    vec2 c = (vec2(hash21(id + seed + 1.7), hash21(id + seed + 9.3)) - 0.5) * 0.45;
    float life = smoothstep(0.05, 0.45, sin(t * 0.09 + h * 40.0) * 0.5 + 0.5);
    float r = mix(rMin, rMax, h * h) * mix(0.55, 1.0, life) * exists;
    vec2 d = f - c;
    d.y *= d.y < 0.0 ? 0.86 : 1.06; // 下がわずかに膨らむ（重さ）
    float m = (1.0 - smoothstep(r * 0.86, r, length(d))) * exists * step(0.001, r);
    return vec4(d / N, m, r / N);
  }
  // 粒の中の景色（逆さに縮む）。off=中心からのずれ、r=半径（どちらも縦横をそろえた座標）
  vec3 b10Lens(vec2 ruv, vec2 off, float r, float asp) {
    vec2 cR = ruv - off;
    vec2 cF = vec2(cR.x / asp + 0.5, cR.y);
    vec2 n = off / max(r, 1e-4);
    float nd = clamp(length(n), 0.0, 1.0);
    vec2 v = n * (0.16 + 0.10 * nd * nd); // 縁ほど広く写す（魚眼）
    vec2 s = cF - vec2(v.x / asp, v.y) + vec2(0.0, 0.04); // 逆さ＝中心の反対側を読む。少し上の空を映す
    s = 1.0 - abs(1.0 - abs(s)); // 画の外は折り返して読む（端の色が縦縞に伸びない）
    vec3 c = vec3(outside(s - vec2(0.004, 0.0) * nd).r, outside(s).g, outside(s + vec2(0.004, 0.0) * nd).b);
    c *= 1.06;
    c *= 1.0 - smoothstep(0.62, 1.0, nd) * 0.5;                      // 縁の陰り（球の輪郭）
    c += uSunGlow * smoothstep(0.55, 1.0, nd) * smoothstep(0.1, -0.7, n.y) * 0.22; // 下の縁に集まる光
    float spec = 1.0 - smoothstep(0.0, 0.22, distance(n, vec2(-0.38, 0.42)));
    c += vec3(1.0) * spec * 0.22;                                     // 左上の小さな映り込み
    return c;
  }
  // 窓を伝い落ちる大粒。trail=通った跡（曇りが拭われた筋）
  vec4 b10Slider(vec2 ruv, float t, out float trail) {
    float W = 0.13;
    float cx = floor(ruv.x / W);
    float cr = hash21(vec2(cx, 5.0));
    float active = step(0.5, cr);
    float lx = (fract(ruv.x / W) - 0.5) * W * 0.6;
    lx += sin(ruv.y * 9.0 + cr * 6.28) * 0.010 + sin(ruv.y * 23.0 + cr * 11.0) * 0.004;
    float speed = mix(0.035, 0.08, hash21(vec2(cx, 9.0)));
    float ph = t * speed + cr * 10.0;
    float fr = fract(ph);
    float headY = 1.2 - (fr + 0.12 * sin(fr * 18.0) * 0.3) * 1.45; // 少し止まっては走る
    float r = 0.020 + 0.012 * hash21(vec2(cx, floor(ph)));
    vec2 d = vec2(lx, ruv.y - headY);
    d.y *= d.y > 0.0 ? 0.62 : 1.05; // 上へ尾を引く涙の形
    float m = (1.0 - smoothstep(r * 0.86, r, length(d))) * active;
    trail = active * (1.0 - smoothstep(r * 0.55, r * 1.0, abs(lx))) * step(headY, ruv.y) * (1.0 - smoothstep(headY, headY + 0.6, ruv.y));
    return vec4(d, m, r);
  }
`
const RAIN_MAIN = (withTrail) => /* glsl */ `
  void main() {
    vec2 frag = gl_FragCoord.xy / uResolution.xy;
    float asp = uResolution.x / uResolution.y;
    vec2 ruv = vec2((frag.x - 0.5) * asp, frag.y);
    float t = uTime;
    float rain = clamp(uIntensity, 0.0, 1.0);

    // 結露したガラス越しの景色（ぼけて白む）
    vec3 sharpBg = outside(frag);
    vec3 frost = b10Blur(frag, 0.017);
    float fl = dot(frost, vec3(0.299, 0.587, 0.114));
    frost = mix(frost, vec3(fl), 0.22) * 0.9 + uSkyMid * 0.05;

    float trail = 0.0;
    vec4 sl = b10Slider(ruv, t, trail);
    ${withTrail ? 'trail *= mix(0.6, 1.0, rain);' : 'trail = 0.0;'}
    // 拭われた跡は曇りが取れて景色がはっきり見える
    vec3 col = mix(frost, sharpBg * 0.97, trail * 0.85);

    // 粒（大・中・霧のような小）。跡の上の粒は拭われて無い
    float wipe = 1.0 - trail;
    vec4 L1 = b10Drops(ruv, 6.0, 0.0, t, 0.30 + 0.25 * rain, 0.10, 0.30);
    vec4 L2 = b10Drops(ruv, 15.0, 31.0, t, 0.40 + 0.30 * rain, 0.10, 0.32);
    vec4 L3 = b10Drops(ruv, 42.0, 71.0, t, 0.72, 0.14, 0.34);
    L1.z *= wipe; L2.z *= wipe; L3.z *= wipe;
    ${withTrail ? `
    // 跡に残る小さな粒（伝ったあとの名残）
    vec4 Lb = b10Drops(ruv, 70.0, 113.0, t, 0.75, 0.15, 0.30);
    Lb.z *= trail;
    if (Lb.z > 0.001) col = mix(col, b10Lens(ruv, Lb.xy, Lb.w, asp), Lb.z);` : ''}
    if (L3.z > 0.001) col = mix(col, b10Lens(ruv, L3.xy, L3.w, asp), L3.z * 0.9);
    if (L2.z > 0.001) col = mix(col, b10Lens(ruv, L2.xy, L2.w, asp), L2.z);
    if (L1.z > 0.001) col = mix(col, b10Lens(ruv, L1.xy, L1.w, asp), L1.z);
    if (sl.z > 0.001) col = mix(col, b10Lens(ruv, sl.xy, sl.w, asp), sl.z);

    col += uFlash * vec3(0.85, 0.9, 1.0) * 0.18;
    float vig = 1.0 - 0.28 * smoothstep(0.35, 1.15, distance(frag, vec2(0.5, 0.55)));
    col *= vig;
    col = applyGrade(col, frag);
    col *= uBright;
    col += (hash21(frag * uResolution.xy + t) - 0.5) * 0.007;
    gl_FragColor = vec4(col, 1.0);
  }
`
const swapMain = (orig, add) => { const i = orig.lastIndexOf('void main()'); if (i < 0) throw new Error('main が無い'); return orig.slice(0, i) + add }

const CACHED = (src) => src.replace('vec3 frost = b10Blur(frag, 0.017);', 'vec3 frost = outside(frag + vec2(0.0005)); // 測り用: 読み込み時に1回ぼかした画を1回読む形の重さ')
export const B10_VARIANTS = {
  'rainGlass:rain1c': (q, { orig }) => CACHED(swapMain(orig, RAIN_COMMON + RAIN_MAIN(false))),
  'rainGlass:rain2c': (q, { orig }) => CACHED(swapMain(orig, RAIN_COMMON + RAIN_MAIN(true))),
  'rainGlass:rain1': (q, { orig }) => swapMain(orig, RAIN_COMMON + RAIN_MAIN(false)),
  'rainGlass:rain2': (q, { orig }) => swapMain(orig, RAIN_COMMON + RAIN_MAIN(true)),
}

Object.assign(B10_VARIANTS, SEA_VARIANTS)
