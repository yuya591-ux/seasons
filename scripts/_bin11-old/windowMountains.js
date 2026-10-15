// 窓辺シリーズ「山あいの朝」。重なる山の稜線を多層パララックスで描く。
// 遠いほど霞み（空気遠近）、近いほど緑が濃い。谷に朝霧。指スワイプで見回す。
// パレットの5色: 空(top/mid/horizon)・朝陽(sunGlow)・近い山の緑(dropTint)。

import { GLASS_GLSL } from '/src/shaders/glass.js'
import { GRADE_GLSL } from '/src/shaders/grade.js'
import { BIRDS_GLSL } from '/src/shaders/birds.js'
import { FRAME_GLSL } from '/src/shaders/frame.js'

export const vertexSource = /* glsl */ `
  attribute vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`

const FRAGMENT_BODY = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uIntensity;  // 朝霧の濃さ 0..1
  uniform float uBright;
  uniform vec2 uPan;
  uniform vec2 uParallax;    // 身を乗り出す/覗き込む並進視差（近景ほど大きく）
  uniform float uWindowOpen;
  uniform float uLeanOut;
  uniform float uGlass;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyMid;
  uniform vec3 uHorizon;
  uniform vec3 uSunGlow;
  uniform vec3 uDropTint;     // 近い山の緑

  float h11(float n) { return fract(sin(n) * 43758.5453123); }
  float h21(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
  // 雑音の格子点の値。289 で割った余りの並べ替えで、途中の値がすべて誤差のない整数（2^24 未満）＝隣り合う区画で同じ格子点が必ず同じ値になる。
  // 以前の小数のハッシュは、同じ格子点でも計算の順（定数のまとめ方）が区画ごとに違うと別の値になり、区画の境で稜線が縦に途切れ・空に四角い継ぎ目が出た（V36・V38）。
  float permL(float x) { return mod((x * 34.0 + 1.0) * x, 289.0); }
  float hL(vec2 i) { i = mod(i, 289.0); return permL(permL(i.x) + i.y) / 289.0; }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hL(i); float b = hL(i + vec2(1.0, 0.0));
    float c = hL(i + vec2(0.0, 1.0)); float d = hL(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < OCTAVES; i++) { s += a * vnoise(p); p *= 2.0; a *= 0.5; }
    return s;
  }

  // 稜線の高さ
  float ridgeLine(float x, float seed, float baseY, float rough, float amp) {
    return baseY + (fbm(vec2(x * rough + seed, 1.7)) - 0.5) * amp;
  }

  // 1つの山レイヤー。斜面の陰陽・稜線のリムライト・森のテクスチャ・谷の朝霧で立体感を出す。
  // lit=朝陽のリム強さ, tex=森テクスチャの強さ（近い山ほど大）。
  vec3 ridge(vec3 col, vec2 p, float x, float seed, float baseY, float rough, float amp,
             vec3 mcol, float mist, float lit, float tex) {
    float r = ridgeLine(x, seed, baseY, rough, amp);
    float inside = step(p.y, r);
    if (inside < 0.5) {
      // 山の外: 稜線の上にたなびく霧だけ
      float band = smoothstep(r + 0.10, r, p.y) * smoothstep(r - 0.06, r, p.y);
      return mix(col, vec3(0.95, 0.96, 0.96), band * mist);
    }
    // 斜面シェーディングは近い層(tex>0)のみ。遠い霞んだ層は2つ目のfbmを省いて軽量化。
    float belowTop = smoothstep(r, r - 0.20, p.y);             // 0=稜線 1=谷
    float shade = 0.5;
    if (tex > 0.01) {
      float rR = ridgeLine(x + 0.03, seed, baseY, rough, amp);
      shade = clamp(0.55 - (rR - r) * 6.0, 0.25, 1.0);        // 朝陽(左)に面する斜面ほど明るい
    }
    vec3 mc = mcol * mix(1.12, 0.70, belowTop) * mix(0.82, 1.12, shade);
    // 森のテクスチャ（近い山ほど）＋流れる雲の影が斜面を渡る。明暗＋緑の濃淡の二周波で、
    // なめらかなグラデの斜面に針葉樹の塊の手触りを与える（のっぺりした緑の面を脱す）。
    if (tex > 0.01) {
      float f1 = fbm(vec2(x * 26.0 + seed, p.y * 18.0)) - 0.5;
      float f2 = fbm(vec2(x * 58.0 + seed, p.y * 42.0)) - 0.5; // 細かな木立の粒
      mc *= 1.0 + (f1 * 0.20 + f2 * 0.11) * tex;
      mc = mix(mc, mc * vec3(0.85, 1.0, 0.80), max(0.0, -f1) * 0.45 * tex); // 谷筋の木陰は緑が深く沈む
      float cloudSh = smoothstep(0.42, 0.74, fbm(vec2(x * 0.55 + uTime * 0.02, 4.0))); // 大きな雲影
      mc *= 1.0 - cloudSh * 0.15 * tex;                                                 // 朝の斜面をゆっくり渡る
    }
    // 朝陽の当たる稜線のリムライト（朝の山あいの主役＝少し強めて稜線を金色に光らせる）
    mc += uSunGlow * smoothstep(r - 0.02, r, p.y) * lit * 0.5;
    col = mix(col, mc, inside);
    // 谷にたまる朝霧（近い層のみ。遠い層はfbmを省く）
    if (tex > 0.01) {
      float valley = smoothstep(r - 0.04, r - 0.16, p.y) * smoothstep(r - 0.34, r - 0.16, p.y);
      float drift = 0.6 + 0.4 * fbm(vec2(x * 3.0 + uTime * 0.02, p.y * 4.0));
      col = mix(col, vec3(0.93, 0.95, 0.97), valley * mist * drift * 0.8);
    }
    return col;
  }

  void main() {
    vec2 frag = gl_FragCoord.xy / uResolution.xy;
    float asp = uResolution.x / uResolution.y;
    float t = uTime;
    vec2 p = frag;
    // 一人称の視界（ヨー/ピッチ＋広角の湾曲）
    float yaw = uPan.x;
    float pitch = uPan.y;
    float ax = (p.x - 0.5) * asp;
    float curve = -0.10 * ax * ax;
    vec2 vp = vec2(p.x, p.y - pitch + curve);

    // 朝の空
    vec3 col = mix(uHorizon, uSkyMid, smoothstep(0.3, 0.66, vp.y));
    col = mix(col, uSkyTop, smoothstep(0.62, 1.0, vp.y));
    // 高層の朝雲（見回すと流れる＝空も動く）。明るい霞んだ空には白い雲は溶けて見えないので、
    // 朝陽側は暖色に輝き／影側はごく淡い青灰で「浮く雲の立体」を出し、平らな上空に朝の情感を足す。
    float mcl = fbm(vec2((ax + yaw * 0.55) * 1.05 + uTime * 0.005, vp.y * 2.0));
    float cloudM = smoothstep(0.43, 0.64, mcl) * smoothstep(0.40, 0.74, vp.y);
    float warmSide = smoothstep(0.5, -0.45, ax);                                // 左(朝陽側)ほど暖色
    vec3 cloudC = mix(mix(uSkyMid, vec3(0.74, 0.79, 0.86), 0.5), vec3(1.0, 0.95, 0.86), warmSide); // 影側=淡青灰, 陽側=暖クリーム
    cloudC = mix(cloudC, uSunGlow, warmSide * 0.4);
    col = mix(col, cloudC, cloudM * 0.5);
    // 朝陽側の地平がほんのり燃える（霞に溶ける朝の温度差＝平らな空に奥行きと朝の情感）
    float glowH = smoothstep(0.58, 0.34, vp.y) * smoothstep(0.14, 0.40, vp.y);
    col = mix(col, mix(uHorizon, uSunGlow, 0.55), glowH * smoothstep(0.7, -0.6, ax) * 0.42);
    // 朝陽（世界に固定。首を振ると視界の中を移動する）。円盤＋薄明光線
    vec2 sunC = vec2(-0.25 - yaw * 0.6, 0.72);
    float sunDist = distance(vec2(ax, vp.y), sunC);
    float sun = exp(-sunDist * 3.0);
    col += uSunGlow * sun * 0.5;
    col = mix(col, vec3(1.0, 0.97, 0.9), smoothstep(0.05, 0.04, sunDist) * 0.7);
    vec2 sd = vec2(ax, vp.y) - sunC;
    float rays = (0.5 + 0.5 * sin(atan(sd.y, sd.x) * 16.0 + uTime * 0.08)) * exp(-length(sd) * 1.3);
    col += uSunGlow * rays * 0.05;

    float mistAmt = mix(0.25, 0.7, uIntensity);

    // 奥→手前（遠いほど空色に霞む）。回転はほぼ一律。lit=リム強, tex=森テクスチャ
    col = ridge(col, vp, ax + yaw * 0.22, 1.0, 0.60, 1.2, 0.16, mix(uSkyMid, uHorizon, 0.5), mistAmt, 0.10, 0.0);
    col = ridge(col, vp, ax + yaw * 0.40, 9.0, 0.52, 1.8, 0.20, mix(uDropTint, uSkyMid, 0.64), mistAmt * 0.85, 0.18, 0.25);

    // 雲海（谷を埋める朝霧の海。上面が起伏してゆっくり流れ、朝陽で縁が染まる。近い山が突き出る）
    float seaY = 0.47;
    float seaTop = (fbm(vec2((ax + yaw * 0.6) * 1.5 + uTime * 0.012, 3.0)) - 0.5) * 0.07; // うねる上面
    float seaBand = smoothstep(seaY + 0.11 + seaTop, seaY + 0.01 + seaTop, vp.y) * smoothstep(seaY - 0.15, seaY + 0.01 + seaTop, vp.y);
    float seaTex = fbm(vec2((ax + yaw * 0.6) * 2.2 + uTime * 0.015, vp.y * 6.0));
    vec3 seaCol = mix(vec3(0.90, 0.92, 0.95), mix(vec3(0.96, 0.94, 0.9), uSunGlow, 0.5),
                      smoothstep(0.02, -0.02, vp.y - (seaY + 0.01 + seaTop)) * 0.6); // 上面の縁が朝陽に染まる
    col = mix(col, seaCol, seaBand * (0.45 + 0.55 * smoothstep(0.32, 0.7, seaTex)) * mistAmt);

    col = ridge(col, vp, ax + yaw * 0.75, 21.0, 0.44, 2.6, 0.24, mix(uDropTint, uSkyMid, 0.28), mistAmt * 0.6, 0.26, 0.5);
    col = ridge(col, vp, ax + yaw * 1.10 + uParallax.x * 0.8, 37.0, 0.34, 3.4, 0.28, mix(uDropTint, vec3(0.10, 0.15, 0.10), 0.35), mistAmt * 0.35, 0.32, 0.8);
    col = ridge(col, vp, ax + yaw * 1.55 + uParallax.x * 1.4, 53.0, 0.20, 4.6, 0.30, vec3(0.08, 0.12, 0.08), 0.0, 0.38, 1.0);

    // 渡り鳥（はばたきながら弧を描いて山あいの空を渡る）
    col = flyingBirds(col, vec2(ax + yaw * 0.5, vp.y), t, 1.0);

    // ガラス現象（雪・雨）
    col = applyGlass(col, p, t, uGlass);

    vec3 preFrame = col; // 乗り出し用（枠前の景色）
    col = windowSash(col, p, preFrame, uLeanOut, asp); // 窓辺の額装（全情景で統一）

    col = applyGrade(col, frag); // 全情景共通の「記憶の風景」グレード＋水彩
    col *= uBright;
    col -= max(col - vec3(0.92), 0.0) * 0.5;
    col += (h21(frag * uResolution.xy + t) - 0.5) * 0.007;
    gl_FragColor = vec4(col, 1.0);
  }
`

const QUALITY_DEFINES = {
  soft: '#define OCTAVES 5\n',
  standard: '#define OCTAVES 4\n',
  light: '#define OCTAVES 3\n',
}

export function buildFragment(quality) {
  const defines = QUALITY_DEFINES[quality] || QUALITY_DEFINES.standard
  const body = FRAGMENT_BODY.replace('void main()', GLASS_GLSL + '\n' + GRADE_GLSL + '\n' + BIRDS_GLSL + '\n' + FRAME_GLSL + '\n  void main()')
  return defines + body
}
