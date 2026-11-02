// 空を舞う鳥の群れ。窓辺シリーズ共通の GLSL 片（GRADE_GLSL と同じ作法で main 直前に注入）。
// 以前の静止した「V字」が不自然（浮いた文字のよう）だったため、はばたき・滑空・隊列・弧を描く
// 飛翔で本物の鳥のように振る舞わせる。h21 等は注入先で定義済みの前提。

export const BIRDS_GLSL = /* glsl */ `
  // 遠くを舞う鳥の群れ。q=見回し込みの視界座標(x≈ax+yaw寄与, y≈vp.y), t=uTime, mo=動き(0で静止)。
  vec3 flyingBirds(vec3 col, vec2 q, float t, float mo) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float spd = 0.017 * (1.0 + 0.22 * fi);
      float prog = fract(t * spd * mo + fi * 0.37);            // 0→1 で空を横切る
      float bx = prog * 3.2 - 1.6;
      // 隊列（先頭の少し後ろ上に続く）＋緩い弧＋わずかな上下動
      float by = 0.75 - fi * 0.035 - sin(prog * 3.14159) * 0.05 + sin(t * 0.6 * mo + fi * 1.3) * 0.006;
      vec2 d = q - vec2(bx, by);
      float ad = abs(d.x);
      // はばたき: 翼の角度が上下し、たまに滑空（はばたきが弱まる）＝自然なリズム
      float glide = 0.5 + 0.5 * sin(t * 0.25 * mo + fi * 2.0);
      float flap = sin(t * (8.0 + fi * 1.5) * mo + fi * 2.0) * mix(0.22, 0.8, glide);
      float span = 0.026;
      float wingY = ad * flap - (ad * ad / span) * 0.55;       // 翼の角度＋翼先のたわみ（弧）
      float wing = smoothstep(0.0055, 0.0, abs(d.y - wingY)) * smoothstep(span, span * 0.8, ad);
      float body = smoothstep(0.0075, 0.0, length(d * vec2(1.0, 1.8))); // 小さな胴
      float bird = clamp(max(wing, body), 0.0, 1.0);
      float vis = smoothstep(0.0, 0.06, prog) * smoothstep(1.0, 0.92, prog); // 端でフェード
      col = mix(col, col * 0.5, bird * 0.55 * vis);
    }
    return col;
  }
  // 便15 V61: 窓の縦の桟（q の x が gapX）にかからない鳥。桟の手前で消え、過ぎてから現れる（gapHalf＝桟の半分の幅＋翼の幅・q の x の単位）
  vec3 flyingBirdsAvoid(vec3 col, vec2 q, float t, float mo, float gapX, float gapHalf) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float spd = 0.017 * (1.0 + 0.22 * fi);
      float prog = fract(t * spd * mo + fi * 0.37);
      float bx = prog * 3.2 - 1.6;
      float by = 0.75 - fi * 0.035 - sin(prog * 3.14159) * 0.05 + sin(t * 0.6 * mo + fi * 1.3) * 0.006;
      vec2 d = q - vec2(bx, by);
      float ad = abs(d.x);
      float glide = 0.5 + 0.5 * sin(t * 0.25 * mo + fi * 2.0);
      float flap = sin(t * (8.0 + fi * 1.5) * mo + fi * 2.0) * mix(0.22, 0.8, glide);
      float span = 0.026;
      float wingY = ad * flap - (ad * ad / span) * 0.55;
      float wing = smoothstep(0.0055, 0.0, abs(d.y - wingY)) * smoothstep(span, span * 0.8, ad);
      float body = smoothstep(0.0075, 0.0, length(d * vec2(1.0, 1.8)));
      float bird = clamp(max(wing, body), 0.0, 1.0);
      float vis = smoothstep(0.0, 0.06, prog) * smoothstep(1.0, 0.92, prog);
      vis *= smoothstep(gapHalf, gapHalf + 0.03, abs(bx - gapX)); // 桟の手前で消える
      col = mix(col, col * 0.5, bird * 0.55 * vis);
    }
    return col;
  }
`
