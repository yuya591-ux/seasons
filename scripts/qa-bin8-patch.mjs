// 便8 の試し: 案ごとの作業フォルダの src に、削り方を当てる（本体の src は変えない）
// node patch8.mjs <作業フォルダ> <cardR> <pat: full|lite|mid>
import fs from 'node:fs'
import path from 'node:path'
const [, , wt, cardR, pat] = process.argv
const NL = /\n/g
const rep = (f, a, b) => {
  const p = path.join(wt, f); const s = fs.readFileSync(p, 'utf8')
  if (s.includes('\r\n')) { a = a.replace(NL, '\r\n'); b = b.replace(NL, '\r\n') }
  if (s.split(a).length !== 2) throw new Error('一つに決まらない: ' + a.slice(0, 60))
  fs.writeFileSync(p, s.replace(a, b))
}

rep('src/engine/town3dViewer.js', 'const CARD_R = 40 ', `const CARD_R = ${+cardR} `)

if (pat !== 'full') {
  const F = 'src/engine/surfacePattern.js'
  // 屋根（瓦）: 苔の層を外す
  rep(F, "  m *= mix(vec3(1.0), vec3(0.86, 0.96, 0.82), smoothstep(0.62, 0.85, sfN(w.xz * 0.7 + 11.0)) * 0.6); // 苔\n", '')
  // トタン: 最後の大きなむらを外す
  rep(F, '  m *= 0.88 + 0.22 * sfN(w.xz * 0.35 + 5.0);\n', '')
  // 壁: 細かな粒と色むらを外す（大きなむらと雨だれは残す）
  rep(F, '    m *= mix(1.0, 0.94 + 0.1 * sfN(vec2(al, w.y) * 9.0), wf);                       // 細かな粒\n', '')
  rep(F, '    m *= mix(vec3(1.0), vec3(0.93, 0.95, 0.9), smoothstep(0.6, 0.9, sfN(vec2(al, w.y) * 0.3 + 3.0)));\n', '')
  // 地面: 大きな濃淡を土の斑と分け合い、葉先の明暗を外す（lite は中くらいの層と色むらも外す）
  rep(F, `  m *= 0.84 + 0.3 * sfN(w.xz * 0.9);
  m *= mix(1.0, 0.88 + 0.24 * sfN(w.xz * 4.5), sfFade(w.x * 4.5));
  m *= mix(1.0, 0.9 + 0.2 * sfH(floor(w.xz * 14.0)), sfFade(w.x * 14.0));           // 草の葉先の細かな明暗
  float soil = smoothstep(0.6, 0.8, sfN(w.xz * 0.16 + 7.0) * 0.75 + sfN(w.xz * 0.9) * 0.35);`,
  pat === 'mid'
    ? `  float gn = sfN(w.xz * 0.9);
  m *= 0.84 + 0.3 * gn;
  m *= mix(1.0, 0.88 + 0.24 * sfN(w.xz * 4.5), sfFade(w.x * 4.5));
  float soil = smoothstep(0.6, 0.8, sfN(w.xz * 0.16 + 7.0) * 0.75 + gn * 0.35);`
    : `  float gn = sfN(w.xz * 0.9);
  m *= 0.84 + 0.3 * gn;
  float soil = smoothstep(0.6, 0.8, sfN(w.xz * 0.16 + 7.0) * 0.75 + gn * 0.35);`)
  if (pat === 'lite' || pat === 'min') rep(F, '  m *= mix(vec3(1.0), vec3(0.95, 1.04, 0.86), smoothstep(0.5, 0.8, sfN(w.xz * 0.3 + 2.0)) * 0.5); // 若草と枯れ草の色むら\n', '')
}
if (pat === 'min') rep('src/engine/town3dViewer.js', '    applySurfacePattern(gm, SURF.ground)', '    // applySurfacePattern(gm, SURF.ground)')
console.log('当てた:', wt, 'CARD_R', cardR, '模様', pat)
