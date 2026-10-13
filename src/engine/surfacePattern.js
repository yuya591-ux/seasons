// 面の質感の模様（2026-10-13・便6＝便5 #2=1「位置から描く模様」）。
// 屋根（瓦・トタン・スレート）・家の壁（漆喰とモルタルのむら・雨だれ）・地面（草の濃淡と土の斑）・中央の通り（舗装の粒・補修の跡・ひび・轍）の模様を、
// 画像を足さずに材の中で世界の位置から描き、今の色に掛け合わせる（光の当たり方は今と同じ。凹凸の陰〈案2〉は入れない）。
// 遠くて細かすぎる模様は消す（動いた時のちらつき止め）。屋根の段は等高線に沿うので、家の向きにかかわらず軒と平行になる。
// 前からある onBeforeCompile（雪の積もり）とプログラムの鍵は消さずに重ねる。

export const SURF = { tile: 1, tin: 2, slate: 3, wall: 4, ground: 5, road: 6 }
// 家の屋根の6色（town3dViewer.js の roofCols の順: スレート青／テラコッタ／紺／灰／苔色／茶）ごとの模様
export const ROOF_SURF = [SURF.tin, SURF.tile, SURF.tile, SURF.slate, SURF.tin, SURF.tile]

const GLSL = `
varying vec3 vSfW;
float sfH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sfN(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sfH(i), sfH(i + vec2(1.0, 0.0)), u.x), mix(sfH(i + vec2(0.0, 1.0)), sfH(i + vec2(1.0, 1.0)), u.x), u.y); }
float sfFade(float c) { return 1.0 - smoothstep(0.35, 0.9, fwidth(c)); } // 遠くて細かすぎる模様はちらつくので消す
vec3 sfPat(vec3 w, vec3 N) {
  vec3 m = vec3(1.0);
  float hz = length(N.xz);
  vec3 e = hz > 0.05 ? normalize(vec3(N.z, 0.0, -N.x)) : vec3(1.0, 0.0, 0.0);
  float sl = w.y / max(hz, 0.25);                   // 斜面に沿った距離（屋根の段は等高線に沿う）
  float al = dot(w, e);                             // 軒に沿った距離
#if SF_KIND == 1
  float row = sl / 0.3, col = al / 0.29 + floor(row) * 0.5;
  float fr = fract(row), fc = fract(col), fa = sfFade(row);
  m *= mix(1.0, mix(0.66, 1.06, smoothstep(0.0, 0.22, fr)) * (0.9 + 0.12 * sin(fc * 6.2832)) * (0.9 + 0.2 * sfH(vec2(floor(row), floor(col)))), fa);
  m *= 0.84 + 0.3 * sfN(w.xz * 0.45);
  m *= mix(vec3(1.0), vec3(0.86, 0.96, 0.82), smoothstep(0.62, 0.85, sfN(w.xz * 0.7 + 11.0)) * 0.6); // 苔
#elif SF_KIND == 2
  float cr = al / 0.1, fa = sfFade(cr);
  m *= mix(1.0, 0.86 + 0.18 * (0.5 + 0.5 * sin(cr * 6.2832)), fa);                // 波板の筋
  float seam = fract(sl / 1.8); m *= mix(1.0, mix(0.7, 1.0, smoothstep(0.0, 0.04, seam)), sfFade(sl / 1.8 * 20.0)); // 板の継ぎ目
  float rust = smoothstep(0.55, 0.85, sfN(vec2(al * 2.2, sl * 0.18)) * 0.7 + sfN(w.xz * 0.5) * 0.4);
  m *= mix(vec3(1.0), vec3(1.18, 0.86, 0.66), rust * 0.55);                          // 錆
  m *= 0.88 + 0.22 * sfN(w.xz * 0.35 + 5.0);
#elif SF_KIND == 3
  float row = sl / 0.24, col = al / 0.4 + floor(row) * 0.5;
  float fr = fract(row), fc = fract(col), fa = sfFade(row);
  m *= mix(1.0, smoothstep(0.0, 0.06, fr) * smoothstep(0.0, 0.03, fc) * smoothstep(1.0, 0.97, fc) * 0.3 + 0.7, fa) * (0.92 + 0.14 * sfH(vec2(floor(row), floor(col))));
  m *= 0.86 + 0.26 * sfN(w.xz * 0.4);
#elif SF_KIND == 4
  float wf = sfFade(al * 9.0); // 微分（fwidth）は分岐の外で取る（分岐の中では値が決まらない）
  if (abs(N.y) < 0.6) {
    m *= 0.9 + 0.16 * sfN(vec2(al, w.y) * 0.7);                                   // 漆喰とモルタルの大きなむら
    m *= mix(1.0, 0.94 + 0.1 * sfN(vec2(al, w.y) * 9.0), wf);                       // 細かな粒
    float st = sfN(vec2(al * 3.5, 0.0)) * smoothstep(0.35, 1.0, sfN(vec2(al * 1.3, w.y * 0.22)));
    m *= 1.0 - 0.16 * smoothstep(0.55, 0.9, st);                                   // 雨だれの縦の筋
    m *= mix(vec3(1.0), vec3(0.93, 0.95, 0.9), smoothstep(0.6, 0.9, sfN(vec2(al, w.y) * 0.3 + 3.0)));
  }
#elif SF_KIND == 5
  m *= 0.84 + 0.3 * sfN(w.xz * 0.9);
  m *= mix(1.0, 0.88 + 0.24 * sfN(w.xz * 4.5), sfFade(w.x * 4.5));
  m *= mix(1.0, 0.9 + 0.2 * sfH(floor(w.xz * 14.0)), sfFade(w.x * 14.0));           // 草の葉先の細かな明暗
  float soil = smoothstep(0.6, 0.8, sfN(w.xz * 0.16 + 7.0) * 0.75 + sfN(w.xz * 0.9) * 0.35);
  m *= mix(vec3(1.0), vec3(1.12, 0.98, 0.78), soil * 0.6);                           // 土の斑
  m *= mix(vec3(1.0), vec3(0.95, 1.04, 0.86), smoothstep(0.5, 0.8, sfN(w.xz * 0.3 + 2.0)) * 0.5); // 若草と枯れ草の色むら
#elif SF_KIND == 6
  m *= mix(1.0, 0.9 + 0.18 * sfH(floor(w.xz * 30.0)), sfFade(w.x * 30.0));         // 舗装の粒
  vec2 pc = floor(w.xz * vec2(0.35, 0.12));
  m *= sfH(pc) > 0.72 ? 0.86 : 1.0;                                                 // 補修の跡（四角いつぎはぎ）
  float ck = abs(sfN(w.xz * 0.8) - 0.5); m *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.025, ck)) * sfFade(w.x * 0.8 * 20.0); // ひび
  float rd = abs(w.x) - 1.7; m *= 1.0 - 0.08 * exp(-rd * rd / 0.12);              // 轍（負の数の pow は GPU によって値が決まらないので掛け算で）
  m *= 0.9 + 0.16 * sfN(w.xz * 0.25);
#endif
  return m;
}
`

// 材に模様を重ねる（同じ kind の材は1つのプログラムを共有する）
export function applySurfacePattern(m, kind) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSfW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vSfW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n#define SF_KIND ${kind}\n${GLSL}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= sfPat(vSfW, normalize(cross(dFdx(vSfW), dFdy(vSfW))));')
  }
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '-surf' + kind
  m.needsUpdate = true
  return m
}
