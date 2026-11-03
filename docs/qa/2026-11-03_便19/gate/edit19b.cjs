// 便19: 鴨川の着地の場所選び（まわりの抜けの平均）と、地上の自分を置く検証の口
const fs = require('fs')
const F = 'src/engine/town3dViewer.js'
let s = fs.readFileSync(F, 'utf8')
const CRLF = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n')
const R = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`当たりが ${n} か所: ${a.slice(0, 90)}`); s = s.replace(a, () => b) }
R("      const score = Math.min(c, 24) - maxRise * 2.2",
  "      if (KN) { // 便19: 鴨川の町は路地が狭く、1方位だけ抜けた路地に降りた（窓の真下＝7方位が 1.5〜9m で壁）。8方位の抜けの平均で開けた所を選ぶ\n" +
  "        let sum = 0; for (let a = 0; a < 8; a++) { const yaw = a / 8 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw); let d = 1.0; for (; d < 24; d += 1.6) { if (KN.blocked(nx + hx * d, nz + hz * d) || KN.wet(nx + hx * d, nz + hz * d)) break } sum += d }\n" +
  "        const avg = sum / 8, sc = avg - maxRise * 2.2; if (sc > bestScore) { bestScore = sc; best = [nx, nz] } return avg >= 10 && maxRise < 4.5\n" +
  "      }\n" +
  "      const score = Math.min(c, 24) - maxRise * 2.2")
R("    window.__town3dNavAt = (x, z, feet) =>",
  "    window.__town3dWalkPose = (x, z, yaw, feetY) => { if (!active || !active.flyEnabled) return; const g = feetY === undefined ? navGround(x, z) : feetY; active.flyPos.set(x, g + FLY.eye, z); active.flyYaw = active.flyYawTarget = active.walkCamYaw = yaw || 0; active.flyPitch = active.flyPitchTarget = 0; active.vel.set(0, 0, 0); active.moveX = active.moveY = 0; active.camReady = false; active.landedFired = true; active.mode = 'walk'; active.flyP = 1; active.flyTarget = 1 } // 検証用（便19）: 地上の自分を任意の所・向き・足の高さに置く\n" +
  "    window.__town3dNavAt = (x, z, feet) =>")
fs.writeFileSync(F, CRLF ? s.replace(/\n/g, '\r\n') : s)
console.log('置き換えた')
