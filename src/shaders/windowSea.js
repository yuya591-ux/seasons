// 窓辺シリーズ「海辺の夕暮れ」。水平線・夕陽・きらめく波・遠い島影を描く。
// 指スワイプで見回す（夕陽と島が視差で動く）。
// パレットの5色: 空(top/mid/horizon)・夕陽(sunGlow)・海の深み(dropTint)。

import { GLASS_GLSL } from './glass.js'
import { GRADE_GLSL } from './grade.js'
import { BIRDS_GLSL } from './birds.js'
import { GODRAYS_GLSL } from './godrays.js'
import { FRAME_GLSL } from './frame.js'

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
  uniform float uIntensity;  // 波のきらめきの強さ 0..1
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
  uniform vec3 uDropTint;     // 海の深み

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

  void main() {
    vec2 frag = gl_FragCoord.xy / uResolution.xy;
    float asp = uResolution.x / uResolution.y;
    float t = uTime;
    vec2 p = frag;
    // 一人称の視界（ヨー/ピッチ＋ゆるい湾曲）
    float yaw = uPan.x;
    float pitch = uPan.y;
    float ax = (p.x - 0.5) * asp;
    float curve = -0.08 * ax * ax;
    vec2 vp = vec2(p.x, p.y - pitch + curve);

    float horizon = 0.60; // 窓の横桟（0.52）より上＝夕日の円盤が桟の裏に隠れない（以前は 0.52 で桟と重なっていた・V33）
    float sunAz = -0.05;                  // 世界に固定した夕陽の方位
    float sunScreenX = sunAz - yaw * 0.55; // 見回すと夕陽も視界の中を移動する

    // ── 空（夕暮れ・水平線に沈む夕陽・層雲・地平の霞） ──
    vec3 sky = mix(uHorizon, uSkyMid, smoothstep(horizon, 0.82, vp.y));
    sky = mix(sky, uSkyTop, smoothstep(0.80, 1.0, vp.y));
    vec2 sunP = vec2(ax - sunScreenX, vp.y - (horizon + 0.02));
    float sunDist = length(sunP * vec2(1.0, 1.3));
    float sun = exp(-sunDist * 3.0);                        // 大きなグロー
    float sunDisc = smoothstep(0.058, 0.046, sunDist);     // 太陽円盤（水平線に半分沈む）
    sky += uSunGlow * sun * 0.58;
    sky = mix(sky, mix(uSunGlow, vec3(1.0, 0.96, 0.86), 0.45), sunDisc * 0.82); // 太陽の白飛びを抑え水平線を残す
    // 横に伸びる層雲（夕陽で底が染まる。見回すと流れる＝空も動く）
    float cl = fbm(vec2((ax + yaw * 0.45) * 1.2 + t * 0.006, vp.y * 3.0));
    float cloud = smoothstep(0.5, 0.75, cl) * smoothstep(horizon + 0.02, 0.96, vp.y);
    sky = mix(sky, mix(uHorizon, uSunGlow, 0.5), cloud * 0.35);
    // 地平の霞（海と空の境を柔らかく＝郷愁）
    float hazeB = exp(-abs(vp.y - horizon) * 24.0);
    sky = mix(sky, mix(uHorizon, uSunGlow, 0.3), hazeB * 0.4);
    // 高層の巻雲（薄く流れる筋。上空に奥行きを与える＝空の立体感）
    float cir = fbm(vec2((ax + yaw * 0.12) * 2.2 + t * 0.004, vp.y * 7.0 - 1.0));
    float cirrus = smoothstep(0.55, 0.78, cir) * smoothstep(0.66, 1.0, vp.y);
    sky = mix(sky, mix(uSkyMid, uSunGlow, 0.28 + 0.3 * sun), cirrus * 0.16);

    // ── 海面（寄せるうねり・フレネル・夕陽の道・波頭の泡）。穏やかで層を成す本物の海。 ──

  #if WIN_DETAIL == 0
    float depth = clamp((horizon - vp.y) / horizon, 0.0, 1.0); // 0=水平線, 1=手前
    // 遠近: 手前ほど波が大きく、水平線ほど詰まる（高周波になりすぎないよう抑える）
    float persp = 1.0 / (depth * 0.85 + 0.13);
    vec2 swuv = vec2((ax + yaw) * persp * 0.6, depth * persp);
    // うねり（数周期の重なり。岸へゆっくり寄せる）
    float swell = sin(swuv.y * 1.9 - t * 0.5) * 0.5
                + sin(swuv.y * 4.1 + swuv.x * 0.4 - t * 0.8) * 0.27
                + sin(swuv.y * 8.5 - t * 1.0) * 0.12;
    float ripple = (fbm(swuv * vec2(1.0, 1.7) + vec2(t * 0.04, -t * 0.24)) - 0.5);
    float fres = smoothstep(0.0, 0.45, depth);                 // 手前=深い藍, 水平線=反射
    vec3 reflC = mix(uHorizon, uSunGlow, sun * 0.5);
    vec3 water = mix(reflC, uDropTint, fres);
    water *= 0.87 + 0.16 * (swell * 0.6 + ripple);             // うねりの陰影（控えめ）
    // 夕陽の道（太陽の真下に伸びる、揺らめく光の柱）。明滅は穏やかに。
    float pathW = exp(-abs(ax - sunScreenX) * (2.4 + depth * 4.0));
    float glint = smoothstep(0.0, 0.55, ripple + swell * 0.25 + 0.5);
    float scint = 0.62 + 0.38 * sin(swuv.x * 13.0 + swuv.y * 8.0 - t * 4.0);
    water += uSunGlow * pathW * glint * scint * mix(0.5, 1.0, uIntensity);
    // 低い夕陽がさざ波の無数の面に当たり横へ広がるきらめき（一筋の道でなく面で煌めく＝評価 美術-M4）。
    float glitBand = smoothstep(0.0, 0.30, depth) * (1.0 - smoothstep(0.30, 0.66, depth)); // 水平線寄りの帯
    // 四角いセル(step+floor)＝ブロック状のきらめきを脱す。各セルに丸い輝点を散らし、点ごとに明滅。
    vec2 gcell = vec2(swuv.x * 78.0, swuv.y * 44.0 - t * 1.7);
    vec2 gid = floor(gcell);
    vec2 goff = (vec2(h21(gid), h21(gid + 3.1)) - 0.5) * 0.7;          // セル内の輝点位置をばらす
    float gd = length(fract(gcell) - 0.5 - goff);
    float gh = h21(gid + 1.7);
    float gtw = 0.45 + 0.55 * sin(t * 5.5 + gh * 40.0);               // 点ごとの明滅
    float glitPts = smoothstep(0.32, 0.0, gd) * step(0.72, gh) * max(gtw, 0.0); // 約3割のセルに丸い輝点
    float glitSun = 0.34 + 0.66 * exp(-abs(ax - sunScreenX) * 1.1);                         // 太陽側ほど密に・広く
    water += uSunGlow * glitPts * glitBand * glitSun * (0.55 + 0.45 * scint) * 0.7 * mix(0.5, 1.0, uIntensity);
    // 波頭の泡（手前の大きなうねりの頂に白く・横に寄せる筋）
    float crestLine = sin(swuv.y * 4.5 - t * 0.6) * 0.5 + 0.5;
    float foam = smoothstep(0.74, 0.96, crestLine + ripple * 0.4) * smoothstep(0.30, 0.85, depth);
    water = mix(water, vec3(0.84, 0.88, 0.91), foam * 0.18);
    // うねりの「面の傾き」で陰影と反射を変える＝平らな海でなく3Dに起伏して寄せる
    float swellSlope = cos(swuv.y * 1.9 - t * 0.5) * 0.5
                     + cos(swuv.y * 4.1 + swuv.x * 0.4 - t * 0.8) * 0.27;
    water *= 1.0 + swellSlope * 0.10;                       // 受光する面は明るく、谷は翳る
    // 水平線側へ立ち上がる面ほど空と夕陽を映す（フレネル×傾き）
    float skyFace = smoothstep(-0.1, 0.6, swellSlope) * (0.35 + 0.65 * fres);
    water = mix(water, mix(uHorizon, uSunGlow, sun * 0.5 + 0.15), skyFace * 0.12);

  #else
    // 窓の高さ（海面から約6m）から見下ろす海面。画面の1点ごとに視線と海面の交点を出し、そこで波の傾きを足し合わせる
    float dyH = max(horizon - vp.y, 0.0008);
    float Fz = 1.15;
    vec3 vdir = normalize(vec3(ax, -dyH, Fz));
    float Hc = 14.0;
    vec2 wp = vec2((ax + yaw * 0.9) * Hc / dyH, Fz * Hc / dyH); // 海面の上の位置（m）
    float far = wp.y;
    float fade = 1.0 / (1.0 + far * 0.012);                     // 遠くの細かい波は均して、ちらつかせない
    vec2 g = vec2(0.0);
    float hgt = 0.0;
    // うねりと風の波（向き・波長・速さの違う6本の和＝規則的に見えない）
    vec4 W0 = vec4(normalize(vec2(0.25, -1.0)), 0.21, 0.50);
    vec4 W1 = vec4(normalize(vec2(-0.55, -1.0)), 0.37, 0.30);
    vec4 W2 = vec4(normalize(vec2(0.9, -1.0)), 0.63, 0.16);
    vec4 W3 = vec4(normalize(vec2(-1.0, -0.35)), 1.05, 0.08);
    vec4 W4 = vec4(normalize(vec2(0.3, -0.7)), 1.7, 0.045);
    vec4 W5 = vec4(normalize(vec2(-0.8, -0.9)), 2.6, 0.025);
    float ph;
    ph = dot(W0.xy, wp) * W0.z + t * 0.9; hgt += sin(ph) * W0.w; g += W0.xy * W0.z * cos(ph) * W0.w;
    ph = dot(W1.xy, wp) * W1.z + t * 1.2; hgt += sin(ph) * W1.w; g += W1.xy * W1.z * cos(ph) * W1.w;
    ph = dot(W2.xy, wp) * W2.z + t * 1.6; hgt += sin(ph) * W2.w; g += W2.xy * W2.z * cos(ph) * W2.w;
    ph = dot(W3.xy, wp) * W3.z + t * 2.1; hgt += sin(ph) * W3.w; g += W3.xy * W3.z * cos(ph) * W3.w;
    ph = dot(W4.xy, wp) * W4.z + t * 2.7; g += W4.xy * W4.z * cos(ph) * W4.w * (1.0 - smoothstep(30.0, 140.0, far));
    g += (vec2(vnoise(wp * 2.7 + vec2(t * 0.7, -t * 0.9)), vnoise(wp * 2.7 + vec2(3.1 - t * 0.8, 7.7 + t * 0.5))) - 0.5) * 0.22 * (1.0 - smoothstep(18.0, 60.0, far)); // 手前のさざ波
    g *= fade * 0.9;
    vec3 nrm = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 rdir = reflect(vdir, nrm);
    rdir.y = abs(rdir.y);
    // 映る空（同じ空の色の並び。仰角を画面の高さに読み替える）
    float ry = horizon + rdir.y / max(rdir.z, 0.2) * 0.9;
    vec3 rsky = mix(uHorizon, uSkyMid, smoothstep(horizon, 0.82, ry));
    rsky = mix(rsky, uSkyTop, smoothstep(0.80, 1.0, ry));
    vec3 sdir = normalize(vec3(sunScreenX, 0.03, Fz));
    float sd2 = max(dot(rdir, sdir), 0.0);
    rsky += uSunGlow * pow(sd2, 12.0) * 0.45;
    float fr = 0.03 + 0.97 * pow(1.0 - max(dot(nrm, -vdir), 0.0), 5.0);
    // 水の地の色（深い藍。陽の側を向く波の腹はわずかに透けて明るい）
    vec3 body = uDropTint * (0.75 + 0.25 * smoothstep(-0.3, 0.6, hgt));
    body += mix(uDropTint, uSunGlow, 0.35) * smoothstep(0.1, 0.6, hgt) * 0.10 * (1.0 - smoothstep(30.0, 90.0, far));
    vec3 water = mix(body, rsky, clamp(fr, 0.0, 1.0));
    // 夕日の照り返し（波の面ごとの鏡の光＝光の道とまたたきは、ここから自然に出る）
    float spec = pow(sd2, 1400.0) * 7.0 + pow(sd2, 260.0) * 0.45;
    spec *= mix(0.55, 1.0, smoothstep(20.0, 80.0, far)); // 手前は照り返しを絞る（白い塊にしない）
    water += uSunGlow * spec * mix(0.6, 1.0, uIntensity);
    // 手前の砕けかけた波頭の泡
    float foam = smoothstep(0.62, 0.95, hgt + vnoise(wp * 1.6 + t * 0.2) * 0.3) * (1.0 - smoothstep(14.0, 40.0, far));
    water = mix(water, vec3(0.86, 0.88, 0.90) * mix(vec3(1.0), uSunGlow, 0.2), foam * 0.35);
    // 水平線は空の霞に溶かす
    water = mix(water, mix(uHorizon, uSunGlow, 0.3), (1.0 - smoothstep(0.0, 0.035, dyH)) * 0.6);
  #endif
    vec3 col = (vp.y > horizon) ? sky : water;
    // 薄明光線（god rays）: 夕陽から放射する光の筋＝空の立体的な大気。直線的な人工感を避け控えめに。
    col = godRays(col, vec2(ax, vp.y), vec2(sunScreenX, horizon + 0.02), uSunGlow * 0.085, t, smoothstep(horizon, horizon + 0.08, vp.y));

    // 遠い島影（世界に固定。空気遠近で淡く霞む。低くなだらかに。）
    float islX = 0.42 - yaw * 0.45;
    float islY = horizon + 0.012 + (fbm(vec2((ax + yaw) * 1.6 + 5.0, 0.0)) - 0.5) * 0.022;
    float isl = step(vp.y, islY) * step(horizon - 0.004, vp.y) *
                smoothstep(0.26, 0.10, abs(ax - islX));
    vec3 islCol = mix(mix(uDropTint, uHorizon, 0.5), uSkyMid, 0.35); // 空気遠近で空に寄せる
    col = mix(col, islCol, clamp(isl, 0.0, 1.0) * 0.5);

    // 灯台（遠くの岬に立つ。光がゆっくり明滅する）
    float lhX = 0.62 - yaw * 0.7;
    float lhTop = horizon + 0.055;

  #if WIN_DETAIL == 0
    float lhTower = step(abs(ax - lhX), 0.006) * step(vp.y, lhTop) * step(horizon + 0.002, vp.y);
    col = mix(col, vec3(0.04, 0.05, 0.07), lhTower);
  #else
    // 岬の岩（灯台の立つ低い陸。夕日の逆光で輪郭が光る）
    float capeTop = horizon + 0.004 + max(0.0, 0.02 - abs(ax - lhX - 0.03) * 0.12) + (vnoise(vec2(ax * 60.0, 2.0)) - 0.5) * 0.004;
    float cape = step(vp.y, capeTop) * step(horizon - 0.002, vp.y) * smoothstep(0.20, 0.12, abs(ax - lhX - 0.03));
    col = mix(col, mix(vec3(0.12, 0.10, 0.11), uHorizon * 0.5, 0.4), cape);
    // 白い灯台（上へ細る塔・陽の側は明るく裏は陰る・黒い灯室）
    float lhH = 0.07, lhY0 = capeTop - 0.004;
    float ty = clamp((vp.y - lhY0) / lhH, 0.0, 1.0);
    float tw = mix(0.0085, 0.0055, ty);
    float tx = (ax - lhX) / tw;
    float tower = step(abs(tx), 1.0) * step(lhY0, vp.y) * step(vp.y, lhY0 + lhH * 0.86);
    vec3 wall = mix(vec3(0.86, 0.82, 0.80), vec3(0.42, 0.38, 0.44), smoothstep(-0.6, 0.9, tx)); // 夕日は左＝左が明るい
    wall = mix(wall, wall * mix(vec3(1.0), uSunGlow, 0.5), 0.5);
    wall *= 1.0 - step(0.45, ty) * step(ty, 0.55) * 0.55; // 帯
    col = mix(col, wall, tower);
    float lantern = step(abs(ax - lhX), 0.0062) * step(lhY0 + lhH * 0.86, vp.y) * step(vp.y, lhY0 + lhH);
    col = mix(col, vec3(0.08, 0.07, 0.08), lantern);
    lhTop = lhY0 + lhH * 0.93;
  #endif

    float lhLight = exp(-length(vec2(ax - lhX, vp.y - lhTop) * vec2(1.0, 1.2)) * 55.0);
    float beam = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * 0.7), 4.0); // ゆっくり強く灯る
    col += vec3(1.0, 0.95, 0.8) * lhLight * beam * 0.85;

    // 漁火（遠くの漁船の灯り。水平線近くにぽつぽつ揺れる）
    for (int fi2 = 0; fi2 < 3; fi2++) {
      float ff = float(fi2);
      float fx2 = (h11(ff * 7.0 + 1.0) - 0.5) * 1.5 - yaw * 0.8;
      float fy2 = horizon - 0.012 - h11(ff * 3.0 + 2.0) * 0.014;
      float fd = length(vec2(ax - fx2, vp.y - fy2) * vec2(1.0, 2.6));
      float bob = 0.55 + 0.45 * sin(t * 0.5 + ff * 2.0);
      col += mix(vec3(1.0, 0.78, 0.5), vec3(0.8, 0.9, 1.0), h11(ff * 5.0)) * exp(-fd * 130.0) * bob * 0.6;
    }

    // 手前の防波堤（左手のテトラ/岩のシルエット）。海辺にいる手応え
    float bwTop = 0.115 + (fbm(vec2((ax + yaw * 1.1) * 5.0, 1.0)) - 0.5) * 0.035;
    float breakwater = step(vp.y, bwTop) * smoothstep(-0.15, -0.5, ax - 0.0);

  #if WIN_DETAIL == 0
    col = mix(col, vec3(0.03, 0.035, 0.045), clamp(breakwater, 0.0, 1.0));
  #else
    // 手前の岩（夕日を受ける面は暖かく、裏は青く陰る。輪郭に光）
    if (breakwater > 0.001) {
    float rk = fbm(vec2((ax + yaw * 1.1) * 14.0, vp.y * 14.0));
    float rkL = fbm(vec2((ax + yaw * 1.1) * 14.0 + 0.08, vp.y * 14.0 + 0.08));
    float rlit = clamp((rk - rkL) * 6.0 + 0.45, 0.0, 1.0);
    vec3 rock = mix(vec3(0.10, 0.10, 0.13), vec3(0.42, 0.30, 0.24), rlit);
    rock = mix(rock, rock * uSunGlow * 1.3, 0.35 * rlit);
    rock += uSunGlow * smoothstep(bwTop - 0.012, bwTop, vp.y) * 0.35;
    col = mix(col, rock, clamp(breakwater, 0.0, 1.0));
    }
  #endif


    // 海鳥（はばたきながら弧を描いて海の空を渡る）
    col = flyingBirds(col, vec2(ax + yaw * 0.5, vp.y), t, 1.0);

    // ガラス現象
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

// 便11（便10 #3=1）: 海面を窓の高さから見下ろす遠近つきの波の照り返しにし、岬の岩・白い灯台・手前の岩の陰影を描き込む（V34・V35）。0 で前の海に戻る
const WIN_DETAIL = '#define WIN_DETAIL 1\n'

export function buildFragment(quality) {
  const defines = QUALITY_DEFINES[quality] || QUALITY_DEFINES.standard
  const body = FRAGMENT_BODY.replace('void main()', GLASS_GLSL + '\n' + GRADE_GLSL + '\n' + BIRDS_GLSL + '\n' + GODRAYS_GLSL + '\n' + FRAME_GLSL + '\n  void main()')
  return defines + WIN_DETAIL + body
}
