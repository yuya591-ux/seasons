// 使い捨て（便10）: ③海辺と山あいの案（描き込む）。_bin10-variants.js が読み込んで B10_VARIANTS に足す
const rep = (s, a, b) => { if (!s.includes(a)) throw new Error('置き換え元が無い: ' + a.slice(0, 60)); return s.replace(a, b) }

// ── 海辺: 遠近のある波の面 ──
const SEA_WATER_FROM = '    float depth = clamp((horizon - vp.y) / horizon, 0.0, 1.0); // 0=水平線, 1=手前'
const SEA_WATER_TO = '    vec3 col = (vp.y > horizon) ? sky : water;'
const SEA_WATER = /* glsl */ `
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
`
const SEA_LH_FROM = '    float lhTower = step(abs(ax - lhX), 0.006) * step(vp.y, lhTop) * step(horizon + 0.002, vp.y);\n    col = mix(col, vec3(0.04, 0.05, 0.07), lhTower);'
const SEA_LH = /* glsl */ `
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
    lhTop = lhY0 + lhH * 0.93;`
const SEA_BW_FROM = '    col = mix(col, vec3(0.03, 0.035, 0.045), clamp(breakwater, 0.0, 1.0));'
const SEA_BW = /* glsl */ `
    // 手前の岩（夕日を受ける面は暖かく、裏は青く陰る。輪郭に光）
    if (breakwater > 0.001) {
    float rk = fbm(vec2((ax + yaw * 1.1) * 14.0, vp.y * 14.0));
    float rkL = fbm(vec2((ax + yaw * 1.1) * 14.0 + 0.08, vp.y * 14.0 + 0.08));
    float rlit = clamp((rk - rkL) * 6.0 + 0.45, 0.0, 1.0);
    vec3 rock = mix(vec3(0.10, 0.10, 0.13), vec3(0.42, 0.30, 0.24), rlit);
    rock = mix(rock, rock * uSunGlow * 1.3, 0.35 * rlit);
    rock += uSunGlow * smoothstep(bwTop - 0.012, bwTop, vp.y) * 0.35;
    col = mix(col, rock, clamp(breakwater, 0.0, 1.0));
    }`

// ── 山あい: 上ほど青い空と薄雲・山肌の起伏と木立 ──
const MT_SKY_FROM = '    vec3 col = mix(uHorizon, uSkyMid, smoothstep(0.3, 0.66, vp.y));\n    col = mix(col, uSkyTop, smoothstep(0.62, 1.0, vp.y));'
const MT_SKY = /* glsl */ `
    vec3 col = mix(uHorizon, uSkyMid, smoothstep(0.3, 0.55, vp.y));
    col = mix(col, uSkyTop, smoothstep(0.50, 0.86, vp.y));
    col = mix(col, uSkyTop * vec3(0.78, 0.86, 1.0), smoothstep(0.80, 1.05, vp.y)); // 天頂ほど深い青
`
const MT_SUN_FROM = '    col += uSunGlow * sun * 0.5;'
const MT_SUN = '    col += uSunGlow * sun * 0.28;'
const MT_TEX_FROM = '    if (tex > 0.01) {\n      float f1 = fbm(vec2(x * 26.0 + seed, p.y * 18.0)) - 0.5;'
const MT_TEX = /* glsl */ `
    float b10hC = 0.5;
    if (tex > 0.45) {
      // 山肌の起伏: 稜線から谷へ下る尾根と沢（横に細かく・縦に長い雑音の高さ）に、左上の朝日で陰を付ける
      float dX = 0.010;
      mat2 b10R = mat2(0.8, 0.6, -0.6, 0.8); // 雑音を斜めに回して読む（升目を陰に出さない）
      float hC = fbm(b10R * vec2(x * 7.0 + seed, p.y * 9.0 + seed)); b10hC = hC;
      float hR = fbm(b10R * vec2((x + dX) * 7.0 + seed, p.y * 9.0 + seed));
      vec3 nn = normalize(vec3((hC - hR), 0.35 * dX, dX * 2.2)); // 朝日は左＝横の傾きだけで陰を付ける
      float relief = clamp(dot(nn, normalize(vec3(-0.6, 0.5, 0.65))), 0.0, 1.0);
      mc *= mix(1.0, mix(0.80, 1.14, relief), tex * smoothstep(0.3, 0.6, tex));
      // 木立の点描（樹冠の丸い粒。上が明るく下が陰る）
      vec2 tc = vec2(x * 70.0 + floor(p.y * 58.0) * 0.5, p.y * 58.0); // 段ごとに半分ずらす（四角い並びにしない）
      vec2 ti = floor(tc);
      vec2 tf = fract(tc) - 0.5 - (vec2(h21(ti + seed), h21(ti + seed + 3.3)) - 0.5) * 0.7;
      float crown = smoothstep(0.42, 0.10, length(tf)) * step(0.25, h21(ti + seed + 7.7));
      mc *= mix(1.0, mix(0.93, 1.0 + 0.10 * smoothstep(-0.1, 0.4, tf.y), crown), tex * 0.8 * smoothstep(0.4, 0.8, tex));
    }
    if (tex > 0.01) {
      float f1 = (tex > 0.45 ? b10hC : fbm(vec2(x * 26.0 + seed, p.y * 18.0))) - 0.5; // 近い層は起伏の雑音を使い回す`

export const SEA_VARIANTS = {
  'windowSea:egaku': (q, { orig }) => {
    let s = orig
    const a = s.indexOf(SEA_WATER_FROM), b = s.indexOf(SEA_WATER_TO)
    if (a < 0 || b < 0) throw new Error('海の置き換え位置が無い')
    s = s.slice(0, a) + SEA_WATER + s.slice(b)
    s = rep(s, SEA_LH_FROM, SEA_LH)
    s = rep(s, SEA_BW_FROM, SEA_BW)
    return s
  },
  'windowMountains:egaku': (q, { orig }) => {
    let s = orig
    s = rep(s, MT_SKY_FROM, MT_SKY)
    s = rep(s, MT_SUN_FROM, MT_SUN)
    s = rep(s, '    col = mix(col, cloudC, cloudM * 0.5);', `    col = mix(col, cloudC, cloudM * 0.5);
    // 高い空の薄い雲（前からある雲の雑音を使い回し、上の空ほどはっきり白く見せる）
    col = mix(col, mix(vec3(0.97, 0.97, 0.96), uSkyMid, 0.2), smoothstep(0.50, 0.70, mcl) * smoothstep(0.62, 0.86, vp.y) * 0.5);`)
    s = rep(s, MT_TEX_FROM, MT_TEX)
    s = rep(s, 'float f2 = fbm(vec2(x * 58.0 + seed, p.y * 42.0)) - 0.5;', 'float f2 = tex > 0.45 ? 0.0 : fbm(vec2(x * 58.0 + seed, p.y * 42.0)) - 0.5; // 近い層の細かな粒は木立の点描が受け持つ')
    return s
  },
}
