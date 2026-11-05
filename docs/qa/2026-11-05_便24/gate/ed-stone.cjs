// 便24: 祇園と先斗町の細い道を石畳に・灯りを温かい橙に（一度だけ回す編集の台本）
const fs = require('fs')
let f = 'src/engine/kamoTown.js', s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n')
const a = "  float fwU = max(fwidth(u), 1e-4), fwA = max(fwidth(al), 1e-4);\n  if (rk == 0) {"
if (!s.includes(a)) throw new Error('道の所が見つからない')
s = s.replace(a, `  float fwU = max(fwidth(u), 1e-4), fwA = max(fwidth(al), 1e-4);
  // 便24: 祇園（花見小路・新橋・白川）と先斗町の細い道（幅 6.4m 未満）は御影石の石畳（30cm の段・段ごとに半分ずらした 55cm の石・目地・石ごとの色むら）。kamostone=0 は外し回し用
  bool kyoSt = ${'/[?&]kamostone=0/.test(location.search)'.length ? '${STONE}' : ''} hw < 3.2 && ((vGW.x > 200.0 && vGW.x < 750.0 && vGW.z > 2750.0 && vGW.z < 3350.0) || (vGW.x > -175.0 && vGW.x < -85.0 && vGW.z > 2200.0 && vGW.z < 2940.0));
  if (kyoSt) {
    float row = floor(al / 0.32), cu = (u + hw) / 0.55 + 0.5 * mod(row, 2.0), col = floor(cu);
    float sh = fract(sin(dot(vec2(row, col), vec2(12.99, 78.23))) * 43758.55);
    float gA = 1.0 - smoothstep(0.0, 0.02 + fwA, abs(fract(al / 0.32) - 0.5) * 0.32 - 0.145), gU = 1.0 - smoothstep(0.0, 0.02 + fwU, abs(fract(cu) - 0.5) * 0.55 - 0.255);
    float far = smoothstep(0.15, 0.6, fwA);
    vec3 st = vec3(${'SNOW'} ? 0.0 : 0.0) + mix(vec3(0.36, 0.345, 0.32), vec3(0.5, 0.48, 0.44), sh) * (0.85 + 0.3 * dot(diffuseColor.rgb, vec3(0.333)));
    st = mix(st, vec3(0.16, 0.15, 0.14), max(gA, gU) * (1.0 - far) * 0.85);
    diffuseColor.rgb = mix(st, vec3(0.42, 0.405, 0.375), far * 0.6);
  } else
  if (rk == 0) {`)
// 前の行の札を正しい JS の式に置き換える（STONE は外し回しの印で false の時は石畳を描かない）
s = s.replace("bool kyoSt = ${STONE} hw < 3.2", "bool kyoSt = ${/[?&]kamostone=0/.test(location.search) ? 'false &&' : ''} hw < 3.2").replace("vec3 st = vec3(SNOW ? 0.0 : 0.0) + mix(", "vec3 st = mix(")
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s)
f = 'src/engine/kamoKyo.js'; s = fs.readFileSync(f, 'utf8')
// 灯り: 白く飛ばない温かい橙（行灯は和紙の淡い橙・提灯は赤みの橙）
s = s.replace("const lampMat = mk({ emissive: new THREE.Color(1, 0.72, 0.4), emissiveIntensity: LITE ? (NIGHT ? 1.6 : 0.9) : 0, roughness: 0.6 })", "const lampMat = mk({ emissive: new THREE.Color(1, 0.5, 0.2), emissiveIntensity: LITE ? (NIGHT ? 1.05 : 0.7) : 0, roughness: 0.6 }) // 便24: 白く飛ばない温かい橙")
s = s.replace("const lampMat = mk({ emissive: new THREE.Color(1, 0.6, 0.32), emissiveIntensity: LITE ? (NIGHT ? 1.9 : 1.1) : 0.05, roughness: 0.6 })", "const lampMat = mk({ emissive: new THREE.Color(1, 0.42, 0.16), emissiveIntensity: LITE ? (NIGHT ? 1.25 : 0.8) : 0.05, roughness: 0.6 }) // 便24: 提灯は赤みの橙（白く飛ばない）")
fs.writeFileSync(f, s)
console.log('ok', (s.match(/温かい橙|赤みの橙/g) || []).length)
