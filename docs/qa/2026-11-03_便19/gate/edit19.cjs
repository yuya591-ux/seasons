// 便19: town3dViewer.js に鴨川の道案内（KN）をつなぐ置き換え。どの置き換えも「ちょうど1か所」に当たることを確かめてから書く
const fs = require('fs')
const F = 'src/engine/town3dViewer.js'
let s = fs.readFileSync(F, 'utf8')
const CRLF = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n') // 改行をそろえて読む（書く時に戻す）
const R = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`当たりが ${n} か所: ${a.slice(0, 90)}`); s = s.replace(a, () => b) }

// 飛べる箱は、鴨川の町が組めたら鴨川の物に替える（下の KN）
R("  const bound = kind === 'yato' ? FLY.yatoBound : FLY.bound //", "  let bound = kind === 'yato' ? FLY.yatoBound : FLY.bound // 便19: 鴨川の町が組めたら鴨川の飛べる箱に替える（下の KN）。")

// 便18 #1=1: 鴨川の角部屋を縦長で開いた時は、正面の窓（東＝鴨川）を正面にする（横長は今のまま）
R("  const cornerYaw0 = (w, h) => (w / h >= 1 ? -0.6 : -1.12)", "  // 便19（便18 #1=1）: 鴨川の角部屋の縦長は、正面の窓（東＝デルタ・飛び石・大文字山）を正面にする（前の角部屋と横長は今のまま）\n  const cornerYaw0 = (w, h) => (w / h >= 1 ? -0.6 : kamo ? 0 : -1.12)")

// 便18 で止めていた鴨川の飛ぶ・降りるを開ける（道案内が組めない時だけ止める）
R("  // 便18: 鴨川の町の角部屋は、飛ぶ・降りるが揃うまで（便16 の作る順＝便19）窓辺だけにする（今の飛ぶ仕組みは北寺尾の町の地面と当たり判定で動くため）\n  if (kamo) active.flyEnabled = false",
  "  // ~~便18: 鴨川の町の角部屋は、飛ぶ・降りるが揃うまで（便16 の作る順＝便19）窓辺だけにする~~（【便19】鴨川の道案内 kamo.nav で飛ぶ・降りるを載せた。道案内が無い時だけ止める）\n  if (kamo && !kamo.nav) active.flyEnabled = false")

// 歩く当たり・水際・着地を、鴨川の町では道案内から引く
R("  const wetAt = (x, z) => kind !== 'yato' &&",
  "  // 便19: 鴨川の町の道案内（地面・水・建物・木・橋・飛べる箱・名所・居場所）。北寺尾と谷戸は null＝今までの関数のまま\n" +
  "  const KN = kamo ? kamo.nav : null\n" +
  "  if (KN) bound = KN.bound\n" +
  "  const navGround = KN ? KN.ground : heightAt // 地面の高さ（着地・カメラの構図の見張り）\n" +
  "  const navBlocked = KN ? KN.blocked : blockedAt // 建物・幹（歩けない・カメラを置かない）\n" +
  "  const wetAt = (x, z) => KN ? KN.wet(x, z) : kind !== 'yato' &&")
R("    if (!blockedAt(nx, pos.z) && !wetAt(nx, pos.z)) pos.x = nx",
  "    if (KN) { const feet = pos.y - FLY.eye; if (KN.canStep(nx, pos.z, feet)) pos.x = nx; if (KN.canStep(pos.x, nz, feet)) pos.z = nz; return } // 鴨川: 橋の床の上なら水の上も渡れる\n" +
  "    if (!blockedAt(nx, pos.z) && !wetAt(nx, pos.z)) pos.x = nx")
R("    if (x < -b.x || x > (b.xMax || b.x) || z < b.zMin || z > b.zMax) return true // 箱の外には降りない",
  "    if (x < -b.x || x > (b.xMax || b.x) || z < b.zMin || z > b.zMax) return true // 箱の外には降りない\n" +
  "    if (KN) return KN.blocked(x, z) || KN.wet(x, z) || Math.abs(KN.ground(x, z + 0) - KN.floor(x, z)) > 0.01 // 鴨川: 建物・幹・水・水際には降りない")
R("let d = 1.0; for (; d < 24; d += 1.6) { if (blockedAt(", "let d = 1.0; for (; d < 24; d += 1.6) { if (navBlocked(")
R("      const h0 = heightAt(nx, nz); let maxRise = 0", "      const h0 = navGround(nx, nz); let maxRise = 0")
R("const dh = Math.abs(heightAt(nx + ox, nz + oz) - h0)", "const dh = Math.abs(navGround(nx + ox, nz + oz) - h0)")
R("  active.openYaw = (x, z) => {\n",
  "  active.openYaw = (x, z) => {\n" +
  "    if (KN) { // 鴨川: 抜けの距離（歩ける所が続く長さ）＋鴨川デルタを向く度合い＋水の方を向く度合い（川の眺め）\n" +
  "      const aim = KN.aim(x, z); let best = aim, bestScore = -1e9\n" +
  "      for (let a = 0; a < 16; a++) { const yaw = a / 16 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw); let d = 1.0, water = 0\n" +
  "        for (; d < 34; d += 1.2) { const px = x + hx * d, pz = z + hz * d; if (KN.blocked(px, pz)) break; if (KN.wet(px, pz)) { water = 1; break } }\n" +
  "        let dd = yaw - aim; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); const sc = d + water * 14 + (1 - Math.abs(dd) / Math.PI) * 9; if (sc > bestScore) { bestScore = sc; best = yaw } }\n" +
  "      return best\n" +
  "    }\n")
R("  active.cloudWalk = cloudWalkInfo", "  active.cloudWalk = KN ? null : cloudWalkInfo // 便19: 鴨川の町には雲上の島が無い")

// 飛ぶ案内の文（鴨川には雲海と遠い季節の街が無い）
s = s.split('高く昇れば雲海へ　海の向こうには、遠い季節の街が').join("${kamo ? '川に沿ってデルタへ　飛び石と大文字山が見えてきます' : '高く昇れば雲海へ　海の向こうには、遠い季節の街が'}")
if ((s.match(/川に沿ってデルタへ/g) || []).length !== 2) throw new Error('案内の文の置き換えが2か所でない')

// 飛行中の別世界の空気・時代の粒子と霞の帯・海の鳥は北寺尾の地理の物＝鴨川では出さない（画面に重ねる層が鴨川の上に出ないように）
R("    if (flyAmt > 0.02) {\n      active.fogTouched = true", "    if (flyAmt > 0.02 && !kamo) { // 便19: 鴨川の町では別世界の空気（霧と色の膜）を掛けない\n      active.fogTouched = true")
const i2 = s.indexOf('    // 別世界の気配: 時代の粒子'); const j2 = s.indexOf('    if (flyAmt > 0.02) {', i2)
if (i2 < 0 || j2 < 0 || j2 - i2 > 400) throw new Error('別世界の気配の塊が見つからない')
s = s.slice(0, j2) + '    if (flyAmt > 0.02 && !kamo) { // 便19: 鴨川の町では時代の粒子・霞の帯・海の鳥・島の鳥を出さない' + s.slice(j2 + '    if (flyAmt > 0.02) {'.length)

// 居場所の札
R("        if (kind === 'yato') loc = '獅子ヶ谷の谷戸'", "        if (kind === 'yato') loc = '獅子ヶ谷の谷戸'\n        else if (KN) loc = KN.place(active.flyPos.x, active.flyPos.z, active.flyPos.y) // 便19: 鴨川の町の居場所")

// 名所の周回・上昇気流
s = s.split('for (const lm of CINEMA_LM)').join('for (const lm of (KN ? KN.lms : CINEMA_LM))')
R("        let best = CINEMA_LM[0], bd = 1e9", "        let best = (KN ? KN.lms : CINEMA_LM)[0], bd = 1e9")
R("for (const th of THERMALS)", "for (const th of (KN ? [] : THERMALS))")

// 歩く: 地面（橋の床）と足音
R("        const groundY = onCl ? (cloudSurfaceY(active.flyPos.x, active.flyPos.z) ?? active.flyPos.y - FLY.eye) : heightAt(active.flyPos.x, active.flyPos.z)",
  "        const groundY = onCl ? (cloudSurfaceY(active.flyPos.x, active.flyPos.z) ?? active.flyPos.y - FLY.eye) : KN ? KN.groundAt(active.flyPos.x, active.flyPos.z, active.flyPos.y - FLY.eye) : heightAt(active.flyPos.x, active.flyPos.z)")
R("          else if (kind === 'yato') surf = 'grass'", "          else if (kind === 'yato') surf = 'grass'\n          else if (KN) surf = KN.zone(active.flyPos.x, active.flyPos.z) === 1 ? 'grass' : 'hard' // 便19: 鴨川の河川敷は草")

// 飛ぶ: 下限は建物・木・橋の上（広げてなだらかにした物）
R("        const terr = heightAt(active.flyPos.x, active.flyPos.z), floor = terr + b.yFloor",
  "        const terr = KN ? KN.topSoft(active.flyPos.x, active.flyPos.z) : heightAt(active.flyPos.x, active.flyPos.z), floor = KN ? Math.max(terr + b.yFloor, KN.top(active.flyPos.x, active.flyPos.z) + 1.2) : terr + b.yFloor // 便19: 鴨川は建物・木・橋の上を通る")

// カメラ: 壁際の寄せ・構図の見張り・目の下限
R("          if (!blockedAt(tx, tz)) break", "          if (!navBlocked(tx, tz)) break")
R("          const gh = Math.max(heightAt(sx, sz), SEA.level) + (isWalk ? 1.0 : 1.4)",
  "          const gh = (KN ? (isWalk ? KN.floor(sx, sz) : KN.top(sx, sz)) : Math.max(heightAt(sx, sz), SEA.level)) + (isWalk ? 1.0 : 1.4) // 便19: 鴨川の空では建物・木の上も避ける")
R("      const camFloor = Math.max(heightAt(dcx, dcz), SEA.level)", "      const camFloor = (KN ? (isWalk ? KN.floor(dcx, dcz) : KN.top(dcx, dcz)) : Math.max(heightAt(dcx, dcz), SEA.level))")
R("ly = heightAt(lx, lz) + 15", "ly = navGround(lx, lz) + 15")
R("      const gY = active.onCloud ? (cloudSurfaceY(active.flyPos.x, active.flyPos.z) ?? active.flyPos.y - FLY.eye) : heightAt(active.flyPos.x, active.flyPos.z)",
  "      const gY = active.onCloud ? (cloudSurfaceY(active.flyPos.x, active.flyPos.z) ?? active.flyPos.y - FLY.eye) : navGround(active.flyPos.x, active.flyPos.z)")

// 雲・雲海・入道雲・虹・虹輪の白い包み（画面に重ねる層）は鴨川では出さない
R("      const cloudFadeOn = !isWalk && flyAmt > 0.3", "      const cloudFadeOn = !isWalk && flyAmt > 0.3 && !kamo // 便19: 鴨川の町には北寺尾の雲が描かれない")
R("      if (cloudSea) { const dY = Math.abs", "      if (cloudSea && !kamo) { const dY = Math.abs")
R("      for (const tc of towerCenters) { const dh", "      if (!kamo) for (const tc of towerCenters) { const dh")
R("        const op = (!isNight && !SNOWY ? 1 : 0) * ab * flyAmt * 0.6", "        const op = (!isNight && !SNOWY && !kamo ? 1 : 0) * ab * flyAmt * 0.6")
R("        const gOp = (!isNight && !SNOWY ? 1 : 0) * ab * flyAmt * 0.8", "        const gOp = (!isNight && !SNOWY && !kamo ? 1 : 0) * ab * flyAmt * 0.8")
R("      const overSeaT = isWalk ? 0 :", "      const overSeaT = isWalk || KN ? 0 :")
R("      const dHomeT = isWalk ? 0 :", "      const dHomeT = isWalk || KN ? 0 :")

// 部屋が隠れている間は、鴨川の外壁の窓の所を塞ぐ
R("    if (winRoom.visible !== wrVis) {", "    if (kamo) kamo.setRoomShown(flyAmt < 0.6) // 便19: 空・地上では部屋の窓の所を外壁で塞ぐ（乗り出しでは塞がない）\n    if (winRoom.visible !== wrVis) {")

// 高さのゲージ
R("    altGauge.set((active.flyPos.y - bound.yFloor) / (90 - bound.yFloor))", "    altGauge.set(KN ? KN.gauge(active.flyPos.y) : (active.flyPos.y - bound.yFloor) / (90 - bound.yFloor))")

// 検証の口
R("    window.__town3dKamo = () => (kamo ? kamo.info() : null)",
  "    window.__town3dNav = () => { if (!active) return null; const p = active.flyPos; return { mode: active.mode, flyP: +active.flyP.toFixed(2), x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1), yaw: +active.yaw.toFixed(3), flyYaw: +active.flyYaw.toFixed(3), ground: KN ? +KN.ground(p.x, p.z).toFixed(2) : +heightAt(p.x, p.z).toFixed(2), top: KN ? +KN.top(p.x, p.z).toFixed(2) : null, wet: KN ? KN.wet(p.x, p.z) : null, blocked: KN ? KN.blocked(p.x, p.z) : null, place: KN ? KN.place(p.x, p.z, p.y) : null, bound: bound, kamoNav: !!KN, navMs: KN && KN.info() ? KN.info().ms : null, cam: camera.position.toArray().map((v) => +v.toFixed(1)) } } // 検証用（便19）: いる所・地面・建物の上・水か・居場所・飛べる箱\n" +
  "    window.__town3dNavAt = (x, z, feet) => (KN ? { ground: KN.ground(x, z), floor: KN.floor(x, z), top: KN.top(x, z), soft: KN.topSoft(x, z), wet: KN.wet(x, z), zone: KN.zone(x, z), blocked: KN.blocked(x, z), step: feet === undefined ? null : KN.canStep(x, z, feet), at: feet === undefined ? null : KN.groundAt(x, z, feet), place: KN.place(x, z, KN.ground(x, z) + 1.6) } : null) // 検証用（便19）: 道案内に任意の所を聞く\n" +
  "    window.__town3dKamo = () => (kamo ? kamo.info() : null)")

fs.writeFileSync(F, CRLF ? s.replace(/\n/g, '\r\n') : s)
console.log('置き換えた')
