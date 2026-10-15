// 見本シーンの主役シェーダー「窓ガラスの雨」。
// 画像を使わず計算だけで、にじむ夕焼け → 曇りガラス → 屈折する水滴 を重ねる。
// 品質(quality)に応じて、ぼかしのタップ数とノイズのオクターブ数をコンパイル時に切り替える。

import { GRADE_GLSL } from './grade.js'

export const vertexSource = /* glsl */ `
  attribute vec2 aPosition;
  void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`

const FRAGMENT_BODY = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif

  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uIntensity;       // 雨脚 0..1
  uniform float uBright;     // 明るさ 0.7..1.3
  uniform vec3 uSkyTop;      // 天頂
  uniform vec3 uSkyMid;      // 中空
  uniform vec3 uHorizon;     // 地平
  uniform vec3 uSunGlow;     // 光芒
  uniform vec3 uDropTint;    // 水滴のハイライト
  uniform float uFlash;      // 遠雷フラッシュ 0..1
  uniform sampler2D uBg;     // 窓の外の風景（Flux生成画像。任意）
  uniform float uHasBg;      // 背景画像があるか 0/1
  uniform float uBgAspect;   // 背景画像の縦横比（横/縦）。画面を覆うように切り抜くのに使う
  uniform sampler2D uBgBlur; // 背景画像を読み込みの時に1回ぼかした写し（結露したガラス越しの景色・便11。renderer.js が作る）

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
      s += a * vnoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return s;
  }

  // 光の向き（左上）。水滴の鏡面ハイライトに使う。
  const vec2 LIGHT = vec2(-0.45, 0.62);

  // 夕焼けの下地（地平→中空→天頂のグラデ＋暖かい地平帯＋にじむ光芒）。高周波の雲を含まない
  // ので、これ自体が「すりガラスのぼけた背景」としてそのまま使える＝多重サンプル不要で軽い。
  vec3 skyBase(vec2 uv) {
    float y = clamp(uv.y, 0.0, 1.0);
    vec3 lower = mix(uHorizon, uSkyMid, smoothstep(0.0, 0.55, y));
    vec3 col = mix(lower, uSkyTop, smoothstep(0.40, 1.0, y));
    // 地平に残る暖かい帯
    float band = exp(-abs(y - 0.16) * 6.0);
    col = mix(col, uSunGlow, band * 0.16 * (1.0 - 0.4 * uIntensity));
    // 太陽の光芒（地平やや上、画面中央寄り）。雨で弱める。
    float glow = exp(-distance(uv, vec2(0.5, 0.18)) * 3.4);
    col += uSunGlow * glow * (0.9 - 0.35 * uIntensity);
    // ── 雨ににじむ夕暮れの下町（窓の外。すりガラス越しでぼんやりと） ──
    // 地平の家並みのシルエット（ゆるい起伏＝場所の気配）
    float roofY = 0.205 + sin(uv.x * 8.0 + 1.0) * 0.014 + sin(uv.x * 21.0) * 0.008;
    float roof = smoothstep(roofY + 0.006, roofY - 0.006, y);
    col = mix(col, mix(uHorizon, vec3(0.16, 0.12, 0.16), 0.62), roof * 0.78);
    // にじむ街あかり（暖色のボケ。雨で大きく柔らかく、ゆっくり瞬く）。水滴越しに屈折してきらめく。
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      vec2 lp = vec2(hash21(vec2(fi, 1.3)), 0.085 + 0.12 * hash21(vec2(fi, 2.7)));
      float d = distance(uv, lp);
      float tw = 0.75 + 0.25 * sin(uTime * 0.4 + fi * 2.1);
      vec3 lc = mix(uSunGlow, vec3(1.0, 0.78, 0.5), hash21(vec2(fi, 3.1)));
      lc = mix(lc, vec3(0.7, 0.85, 1.0), step(0.82, hash21(vec2(fi, 4.5))) * 0.7); // たまに白い灯り
      col += lc * exp(-d * 26.0) * 0.42 * tw;
    }
    return col;
  }

  // 窓の外（背景）。Flux生成画像があればそれを土台に、なければ手続きの夕焼けを描く。
  // どちらも同じ“屈折オフセット付き座標”で呼ばれるため、雨粒が背景を歪める核心の表現は共通で効く。
  // ＝シェーダーの現象（屈折・曇り・きらめき）は土台のまま、奥の「絵」だけ画像で格上げする二層構成。
  vec3 bgRead(sampler2D tex, vec2 uv) {
    // 画像は上端＝空（FLIP_Y無効で読み込み）。画面の上を空に合わせ、下端3%は窓の桟に隠れる帯として切る
    // （構図上もともと隠れる位置＝匿名生成の透かし対策も兼ねる）。
    // 画像の縦横比を保ったまま画面を覆う（はみ出す方を切り抜く）。以前は画面の 0〜1 をそのまま画像の 0〜1 に当てていて、
    // iPhone の縦画面（402×874）では横長の画（991×594）が縦に約3.6倍伸び、提灯が縦長の楕円になった（D6）。縦画面用の画は後の便（P8）。
    float sAsp = uResolution.x / uResolution.y;
    float bAsp = max(uBgAspect, 0.01);
    vec2 cover = vec2(min(1.0, sAsp / bAsp), min(1.0, bAsp / sAsp)); // 画像のうち画面に映す割合（横・縦）
    vec2 cuv = 0.5 + (clamp(uv, 0.0, 1.0) - 0.5) * cover;
    vec2 tuv = vec2(cuv.x, clamp((1.0 - cuv.y) * 0.97, 0.0, 1.0));
    vec3 t = texture2D(tex, tuv).rgb;
    // 時間帯の移ろい（夕→暮れ）を画像にもそっと乗せる。画像の質感は壊さず色みだけ寄せる。
    float y = clamp(uv.y, 0.0, 1.0);
    vec3 mood = 0.5 + mix(uHorizon, uSkyMid, smoothstep(0.0, 0.7, y));
    t = mix(t, t * mood, 0.18);
    // にじむ街あかり（暖色のボケ）を地平にごく薄く重ね、雨夕の温度感を深める（水滴越しに屈折してきらめく）
    float glow = exp(-distance(uv, vec2(0.5, 0.2)) * 3.0);
    t += uSunGlow * glow * 0.08 * (1.0 - 0.4 * uIntensity);
    return t;
  }
  vec3 outside(vec2 uv) {
    if (uHasBg < 0.5) return skyBase(uv); // 画像なしの情景は従来どおり（非破壊）
    return bgRead(uBg, uv);
  }
  // 結露したガラス越しの景色（ぼけた写しを読む。手続きの夕焼けは元からぼけているのでそのまま）
  vec3 outsideBlur(vec2 uv) {
    if (uHasBg < 0.5) return skyBase(uv);
    return bgRead(uBgBlur, uv);
  }

  // 一面の細かい水滴（生成と乾きをゆっくり繰り返す）。
  // 戻り: xy=中心からの相対方向, z=マスク, w=正規化距離(0:中心 .. 1:ふち)
  vec4 staticDroplets(vec2 uv, float t) {
    vec2 cells = vec2(19.0, 19.0);                 // さらに数を絞り、一粒ずつ確かなレンズに（散乱したボケ＝汚れ感を排す）
    vec2 g = uv * cells;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float n = hash21(id);
    float n2 = hash21(id + 13.7);
    float exists = step(0.56, hash21(id + 4.1));   // 約4割だけに付く（まばら＝本物の付き方・ノイズに見せない）
    vec2 c = (vec2(n, n2) - 0.5) * 0.55;
    vec2 dir = f - c;
    float dist = length(dir);
    float r = (0.17 + 0.10 * n) * exists;          // 大きさを揃える（バラバラの大小＝ゴミ感を排す）
    float drop = smoothstep(r, r * 0.32, dist) * exists;
    float life = sin(t * 0.25 + n * 30.0) * 0.5 + 0.5;
    drop *= smoothstep(0.12, 0.6, life);
    return vec4(dir, drop, clamp(dist / max(r, 0.001), 0.0, 1.0));
  }

  // 縦に走る大滴とトレイル（ガラスを伝い落ちる雨の筋）。複数列・蛇行・頭＋尾＋残り滴。
  // 戻り: xy=頭の中心からの相対, z=マスク, w=頭の強さ
  vec4 runningStreaks(vec2 uv, float t) {
    vec2 cells = vec2(11.0, 1.0);
    float colId = floor(uv.x * cells.x);
    float cr = hash21(vec2(colId, 5.0));
    float active = step(0.30, cr);                 // 多めの列が流れる
    float hero = step(0.84, hash21(vec2(colId, 21.0))); // 一部の列だけ「一気に走る大滴」＝見本の主役（SPEC）
    float lx = fract(uv.x * cells.x) - 0.5;
    lx += sin(uv.y * 6.5 + cr * 6.2831) * 0.11;    // 蛇行
    lx += sin(uv.y * 17.0 + cr * 12.0) * 0.025;    // 細かな揺らぎ
    float speed = mix(0.07, 0.18, hash21(vec2(colId, 9.0))) * mix(1.0, 1.85, hero); // 主役は速く一気に走る
    float headY = fract(cr * 10.0 + t * speed);    // 0(上)→1(下)
    float yy = 1.0 - uv.y;                          // 上を0に
    float dy = yy - headY;
    vec2 hd = vec2(lx * 1.3, dy);
    float head = smoothstep(mix(0.11, 0.165, hero), 0.0, length(hd)); // ふくらんだ頭（主役は大きい大滴）
    // 頭より上に伸びる濡れた筋（はっきり。主役は太い走り跡）
    float line = smoothstep(mix(0.030, 0.046, hero), 0.0, abs(lx)) * step(dy, 0.0) * smoothstep(-0.62, 0.0, dy);
    // 筋上に残る小さな滴（伝ったあとの名残）
    float beads = smoothstep(0.028, 0.0, abs(lx)) * step(dy, 0.0)
                * smoothstep(0.4, 1.0, sin(yy * 48.0 + cr * 20.0) * 0.5 + 0.5);
    float mask = max(head, max(line * 0.7, beads * 0.45)) * active;
    return vec4(hd, clamp(mask, 0.0, 1.0), head * active);
  }

  #if RAIN_LENS == 0
  // 前の雨（均一に散った光る玉と縦の光の線＝V32）。RAIN_LENS を 0 にすると戻る
  void main() {
    vec2 frag = gl_FragCoord.xy / uResolution.xy;
    float asp = uResolution.x / uResolution.y;
    vec2 ruv = vec2((frag.x - 0.5) * asp, frag.y); // 滴を丸くするアスペクト補正
    float t = uTime;
    float rain = clamp(uIntensity, 0.0, 1.0);

    vec4 sd = staticDroplets(ruv, t);
    vec4 rs = runningStreaks(frag, t);

    float sMask = sd.z * mix(0.35, 1.0, rain);
    float rMask = rs.z * mix(0.30, 1.0, rain);
    float mask = clamp(max(sMask, rMask), 0.0, 1.0);

    // 屈折オフセット（中心方向へ）。雨脚で強さが変わる。
    vec2 refr = (sd.xy * sMask + rs.xy * rMask * 1.3) * 0.064 * mix(0.6, 1.25, rain); // 屈折を少し強め＝粒の中に景色が縮んで映る

    // 曇りガラスの下地（結露でくもる。水のある所だけ晴れて景色が見える＝雨らしさの核）
    vec3 sky = outside(frag);
    float sl = dot(sky, vec3(0.299, 0.587, 0.114));
    // 背景画像があるときは“濡れガラスのくもり”をやや強め、写真が素通しに見えないようにする（手続き背景は従来のまま）
    vec3 frosted = mix(sky, vec3(sl), 0.28 + 0.10 * uHasBg) * (0.86 - 0.03 * uHasBg);

    // 水滴越しのシャープな景色。RGBで屈折量を僅かにずらして色収差（プレミアム感）を出す。
    // 雲のにじみは fbm 1回だけ（ここで一括計算してコストを抑える）。
    float clouds = fbm((frag + refr) * vec2(2.6, 2.2) + vec2(t * 0.011, t * 0.005));
    float shade = smoothstep(0.45, 0.85, clouds) * 0.5;
    vec3 baseC = vec3(
      outside(frag + refr * 1.06).r,
      outside(frag + refr).g,
      outside(frag + refr * 0.94).b
    );
    vec3 sharp = mix(baseC, baseC * 0.84, shade) * 1.06;

    vec3 col = mix(frosted, sharp, mask);

    // 鏡面ハイライト（濡れた立体感）: ふち寄りで、光の向きに面した側が光る
    vec2 sn = normalize(sd.xy + 1e-5);
    float sSpec = smoothstep(0.5, 0.96, dot(sn, normalize(LIGHT)))
                * smoothstep(0.35, 1.0, sd.w) * sMask;
    vec2 rn = normalize(rs.xy + 1e-5);
    float rSpec = smoothstep(0.4, 0.96, dot(rn, normalize(LIGHT))) * rs.w;
    // 鏡面ハイライトは控えめに（白く光る“オーブ”化を防ぎ、屈折で景色を映す“濡れたレンズ”に見せる）
    col += vec3(1.0) * (sSpec + rSpec) * (0.13 - 0.04 * uHasBg);
    // 光に面した縁の鋭いきらめき（水玉の立体感）。点ではなく縁の一点に絞って弱く。
    float sGlint = smoothstep(0.88, 0.99, dot(sn, normalize(LIGHT))) * smoothstep(0.6, 0.95, sd.w) * sMask;
    col += vec3(1.0) * sGlint * 0.24;

    // レンズの縁の陰り（球の輪郭を締める）
    float rimDark = smoothstep(0.68, 1.0, sd.w) * sMask;
    col *= 1.0 - rimDark * 0.18;

    // 全体の色味ハイライト
    col += uDropTint * mask * 0.05;

    // 遠雷フラッシュ: 空がほのかに白み、濡れたガラスの滴がきらりと反応する
    col += uFlash * vec3(0.85, 0.9, 1.0) * (0.10 + 0.18 * (1.0 - mask));
    col += uFlash * (sSpec + rSpec) * 0.5;

    // やわらかな周辺減光
    float vig = 1.0 - 0.28 * smoothstep(0.35, 1.15, distance(frag, vec2(0.5, 0.55)));
    col *= vig;

    col = applyGrade(col, frag); // 全情景共通の「記憶の風景」グレード＋水彩
    col *= uBright;
    // 微量グレインでバンディングを防ぐ
    col += (hash21(frag * uResolution.xy + t) - 0.5) * 0.007;

    gl_FragColor = vec4(col, 1.0);
  }
  #else
  // ── 便11（便10 #2）: レンズの水滴 ──
  // 粒は小さな凸レンズ＝粒の中に、外の景色が上下左右逆さに縮んで映る。粒は大・中・霧のような小の3段で大きさがばらつき、
  // 時々大きな粒が窓を伝い落ちる。粒の外は結露したガラス越しにぼけて白む。光る玉と縦の光の線は描かない。
  // RAIN_TRAIL 1 の時は、伝い落ちる粒が通った所の曇りと細かい粒を拭い、澄んだ筋が残る（U12）

  // 1層の水滴。xy=粒の中心からのずれ（縦横をそろえた座標）・z=粒の形・w=半径
  vec4 lensDrops(vec2 ruv, float N, float seed, float t, float density, float rMin, float rMax) {
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
  vec3 lensView(vec2 ruv, vec2 off, float r, float asp) {
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
  vec4 lensSlider(vec2 ruv, float t, out float trail) {
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
  void main() {
    vec2 frag = gl_FragCoord.xy / uResolution.xy;
    float asp = uResolution.x / uResolution.y;
    vec2 ruv = vec2((frag.x - 0.5) * asp, frag.y);
    float t = uTime;
    float rain = clamp(uIntensity, 0.0, 1.0);

    // 結露したガラス越しの景色（ぼけて白む。ぼかしは読み込みの時に1回作った写しを読む）
    vec3 sharpBg = outside(frag);
    vec3 frost = outsideBlur(frag);
    float fl = dot(frost, vec3(0.299, 0.587, 0.114));
    frost = mix(frost, vec3(fl), 0.22) * 0.9 + uSkyMid * 0.05;

    float trail = 0.0;
    vec4 sl = lensSlider(ruv, t, trail);
    #if RAIN_TRAIL == 1
    trail *= mix(0.6, 1.0, rain);
    #else
    trail = 0.0;
    #endif
    // 拭われた跡は曇りが取れて景色がはっきり見える
    vec3 col = mix(frost, sharpBg * 0.97, trail * 0.85);

    // 粒（大・中・霧のような小）。跡の上の粒は拭われて無い
    float wipe = 1.0 - trail;
    vec4 L1 = lensDrops(ruv, 6.0, 0.0, t, 0.30 + 0.25 * rain, 0.10, 0.30);
    vec4 L2 = lensDrops(ruv, 15.0, 31.0, t, 0.40 + 0.30 * rain, 0.10, 0.32);
    vec4 L3 = lensDrops(ruv, 42.0, 71.0, t, 0.72, 0.14, 0.34);
    L1.z *= wipe; L2.z *= wipe; L3.z *= wipe;
    #if RAIN_TRAIL == 1
    // 跡に残る小さな粒（伝ったあとの名残）
    vec4 Lb = lensDrops(ruv, 70.0, 113.0, t, 0.75, 0.15, 0.30);
    Lb.z *= trail;
    if (Lb.z > 0.001) col = mix(col, lensView(ruv, Lb.xy, Lb.w, asp), Lb.z);
    #endif
    if (L3.z > 0.001) col = mix(col, lensView(ruv, L3.xy, L3.w, asp), L3.z * 0.9);
    if (L2.z > 0.001) col = mix(col, lensView(ruv, L2.xy, L2.w, asp), L2.z);
    if (L1.z > 0.001) col = mix(col, lensView(ruv, L1.xy, L1.w, asp), L1.z);
    if (sl.z > 0.001) col = mix(col, lensView(ruv, sl.xy, sl.w, asp), sl.z);

    col += uFlash * vec3(0.85, 0.9, 1.0) * 0.18;
    float vig = 1.0 - 0.28 * smoothstep(0.35, 1.15, distance(frag, vec2(0.5, 0.55)));
    col *= vig;
    col = applyGrade(col, frag);
    col *= uBright;
    col += (hash21(frag * uResolution.xy + t) - 0.5) * 0.007;
    gl_FragColor = vec4(col, 1.0);
  }
  #endif
`

// 品質ごとのコンパイル時パラメータ（雲のfbmのオクターブ数）。
const QUALITY_DEFINES = {
  soft: '#define OCTAVES 5\n',
  standard: '#define OCTAVES 4\n',
  light: '#define OCTAVES 3\n',
}

// 便11（便10 #2=2）: 雨粒の描き方。RAIN_LENS 1＝レンズの水滴（0 で前の光る玉と縦の光の線に戻る）・RAIN_TRAIL 1＝伝い落ちた跡を残す（0 で案1）
const RAIN_DEFINES = '#define RAIN_LENS 1\n#define RAIN_TRAIL 1\n'

/** 品質に応じたフラグメントシェーダー文字列を組み立てる。 */
export function buildFragment(quality) {
  const defines = QUALITY_DEFINES[quality] || QUALITY_DEFINES.standard
  const body = FRAGMENT_BODY.replace('#if RAIN_LENS == 0', GRADE_GLSL + '\n  #if RAIN_LENS == 0') // 色の仕上げは2つの main の前に置く（便11）
  return defines + RAIN_DEFINES + body
}
