// 便19: 外の目（gate/sotonome19.md）の指摘の直し
const fs = require('fs')
const rw = (F, fn) => { let s = fs.readFileSync(F, 'utf8'); const CR = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n'); s = fn(s); fs.writeFileSync(F, CR ? s.replace(/\n/g, '\r\n') : s) }
const one = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`当たりが ${n} か所: ${a.slice(0, 80)}`); return s.replace(a, () => b) }
const all = (s, a, b, want) => { const n = s.split(a).length - 1; if (n !== want) throw new Error(`当たりが ${n} か所（${want} のはず）: ${a.slice(0, 80)}`); return s.split(a).join(b) }

rw('src/engine/kamoTown.js', (s) => {
  // 1 焼けていない所の埋め: 図は sRGB として読み、シェーダーの中では線形の値で比べる＝線形の値に直す
  s = one(s, '  //   本物の暗がり（路地・軒下）は 0.1 より上に焼けているので、0.04 より下だけを「焼けていない所」として並みの明るさ 0.55 で埋める（gate/probe-lm-mae.txt）\n',
    '  //   ~~本物の暗がり（路地・軒下）は 0.1 より上に焼けているので、0.04 より下だけを「焼けていない所」として並みの明るさ 0.55 で埋める（gate/probe-lm-mae.txt）~~\n' +
    '  //   （【便19・外の目】上の数は JPEG の画素を 0〜1 で読んだ値＝sRGB。図は SRGBColorSpace なのでシェーダーの中では線形に戻った値で比べる＝線形の 0.04 は sRGB の約 0.22、0.55 は約 0.77 で、\n' +
    '  //    本物の暗がりまで埋まり、埋めた面が並みの壁より明るく浮いた。線形の値に直した: sRGB 0.04 → 線形 0.0031 より下を、sRGB 0.55 → 線形 0.26 で埋める）\n')
  s = one(s, '( lmRaw < 0.04 ? 0.55 : lmRaw )', '( lmRaw < 0.0031 ? 0.26 : lmRaw )')
  // 2 iPhone の段は、歩く高さも描く地形と同じ間引きの網で読む
  s = one(s, '  const terrK = (X, Z) => gridAt(X, Z, (k) => terrain[k] * nQ) // 地面の高さ（鴨川の座標・水面の下は川底）',
    '  // 【便19・外の目】iPhone の段は地形の網を1つおき（8m）に間引いて描く（gridTiles の dec）。歩く高さとカメラの下限を 4m の網で引くと描いた地面とずれ、土手で目やカメラがめり込む＝同じ間引きの網で読む\n' +
    '  const navDec = low ? 2 : 1\n' +
    '  const terrK = (X, Z) => { // 地面の高さ（鴨川の座標・水面の下は川底）。描く網と同じ間引きで4点を混ぜる\n' +
    '    const st = nS * navDec, m = (nN - 1) / navDec + 1, u = Math.min(m - 1.001, Math.max(0, (X + NR) / st)), v = Math.min(m - 1.001, Math.max(0, (Z + NR) / st)), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j\n' +
    '    const h = (ii, jj) => terrain[jj * navDec * nN + ii * navDec] * nQ\n' +
    '    return (h(i, j) * (1 - fu) + h(i + 1, j) * fu) * (1 - fv) + (h(i, j + 1) * (1 - fu) + h(i + 1, j + 1) * fu) * fv\n' +
    '  }')
  // 3 表を組むのに失敗した時の受け（地面と水だけで飛ぶ・歩く）
  s = one(s, '    { // 建物（描かない建物は除く）と、部屋のあるマンション\n', '    const trunks = new Map()\n    try { // 【便19・外の目】建物・橋・木の表を組めなかった時は、地面と水だけで飛ぶ・歩く（窓辺に戻れなくならない）\n    { // 建物（描かない建物は除く）と、部屋のあるマンション\n')
  s = one(s, '    const trunks = new Map(), tr = view(data.buf.misc, meta.files.misc.secs.trees)', '    const tr = view(data.buf.misc, meta.files.misc.secs.trees)')
  s = one(s, '      const key = Math.floor(X / 8) * 100003 + Math.floor(Z / 8); let a = trunks.get(key); if (!a) { a = []; trunks.set(key, a) } a.push(X, Z)\n    }\n',
    '      const key = Math.floor(X / 8) * 100003 + Math.floor(Z / 8); let a = trunks.get(key); if (!a) { a = []; trunks.set(key, a) } a.push(X, Z)\n    }\n' +
    "    } catch (e) { console.warn('鴨川の道案内の表（建物・橋・木）を組めなかったので、地面と水だけで飛ぶ・歩く:', e && e.message); top.fill(-1e9); bld.fill(0); deck.fill(NaN); trunks.clear() }\n")
  // 4 canStep の読みやすさ
  s = one(s, 'if (deckOk(X, Z, feetY + dY) === deckOk(X, Z, feetY + dY)) return true;', 'if (!Number.isNaN(deckOk(X, Z, feetY + dY))) return true; // 足もとに近い橋の床の上')
  // 5 居場所の札: 合流より北は西が賀茂川・東が高野川（原点＝合流・z は南）。水と河川敷を先に見る（橋の上はデルタでなく川の名）
  s = one(s, "      if (alt > 70) return '鴨川の上空'; if (Math.hypot(X, Z) < 130) return '鴨川デルタ'; if (wetK(X, Z) >= 0.5) return '鴨川の上'; if (zoneK(X, Z) === 1) return '鴨川の河川敷'; return 'まちなか' },",
    "      const river = Z < -20 ? (X < 0 ? '賀茂川' : '高野川') : '鴨川' // 【便19・外の目】合流（原点）より北は、西が賀茂川・東が高野川\n" +
    "      if (alt > 70) return '鴨川の上空'; if (wetK(X, Z) >= 0.5) return river + 'の上'; if (Math.hypot(X, Z) < 130) return '鴨川デルタ'; if (zoneK(X, Z) === 1) return river + 'の河川敷'; return 'まちなか' },")
  // 6 水面の図を作る時間と、読む向きを回す差し替えが効いたかの印
  s = one(s, '  function waterNormals(n = 256) {\n    const OLD', '  function waterNormals(n = 256) {\n    const tW0 = performance.now()\n    const OLD')
  s = one(s, '    const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return keep(t)', '    const t = new THREE.DataTexture(d, n, n); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; waterMs = Math.round(performance.now() - tW0); return keep(t)')
  s = one(s, '  let water, waveTop20 = null\n', '  let water, waveTop20 = null, waterMs = null, waterRot = false // 便19: 水面の図を作った時間（ms）・読む向きを回す差し替えが効いたか（検査 K15）\n')
  s = one(s, '      water.material.needsUpdate = true\n', "      waterRot = water.material.fragmentShader.includes('mat2( 0.8253') // 差し替えの文が合わなくなると黙って元のままになるので、効いたかを残す\n      water.material.needsUpdate = true\n")
  s = one(s, 'waveTop20, plugShown: !!(plug && plug.visible) } },', 'waveTop20, waterMs, waterRot, navDec, plugShown: !!(plug && plug.visible) } },')
  return s
})

rw('src/engine/town3dViewer.js', (s) => {
  // 7 跳んでいる間の足の高さ（跳んだ分を足に入れると、橋の床を外れて川底へ落ちる）
  s = one(s, 'KN.groundAt(active.flyPos.x, active.flyPos.z, active.flyPos.y - FLY.eye)', 'KN.groundAt(active.flyPos.x, active.flyPos.z, active.flyPos.y - FLY.eye - (active.jumpY || 0))')
  s = one(s, '    if (KN) { const feet = pos.y - FLY.eye;', '    if (KN) { const feet = pos.y - FLY.eye - ((active && active.jumpY) || 0);')
  // 8 案内の文（飛び石も大文字山も窓から見えているので「見えてきます」と言わない）
  s = all(s, "'川に沿ってデルタへ　飛び石と大文字山が見えてきます'", "'川に沿って、デルタの飛び石の上へ'", 2)
  return s
})

rw('scripts/kamo/kensa.mjs', (s) => {
  // K8: 段に加え、歩く高さを読む網の間引き（iPhone 2・PC 1）
  s = one(s, "const o = await open('autumn-dusk-corner-room', { dev }); const k = await kamoInfo(o.p); r[name] = k && k !== 'no-hook' ? k.low : null; await o.ctx.close()",
    "const o = await open('autumn-dusk-corner-room', { dev }); const k = await kamoInfo(o.p); r[name] = k && k !== 'no-hook' ? (k.low ? 'low' : 'normal') + '/' + k.navDec : null; await o.ctx.close()")
  s = one(s, "check('K8', r.iphone === true && r.pc === false, `軽い段: iPhone ${r.iphone}・PC ${r.pc}`)",
    "check('K8', r.iphone === 'low/2' && r.pc === 'normal/1', `段／歩く高さの網の間引き: iPhone ${r.iphone}（low/2）・PC ${r.pc}（normal/1）`) // 【便19】網の間引きを足した")
  s = one(s, '//   K8 iPhone の画面（402×874・指で触る）では軽い段で開き、PC の画面では通常の段で開く\n',
    '//   K8 iPhone の画面（402×874・指で触る）では軽い段で開き、PC の画面では通常の段で開く（【便19】歩く高さを読む地形の網も、描く網と同じ間引き＝iPhone 2・PC 1）\n')
  // K15: 読む向きを回す差し替えが効いたか
  s = one(s, "check('K15', !!k && k !== 'no-hook' && k.waveTop20 !== null && k.waveTop20 <= 40, `水面の凹凸の図の上位 20 本の波の力 ${k && k.waveTop20}%（40% 以下で合格・前は 100%）`)",
    "check('K15', !!k && k !== 'no-hook' && k.waveTop20 !== null && k.waveTop20 <= 40 && k.waterRot === true, `水面の凹凸の図の上位 20 本の波の力 ${k && k.waveTop20}%（40% 以下で合格・前は 100%）・読む向きを回す差し替え ${k && k.waterRot}（true）・図を作った時間 ${k && k.waterMs}ms`)")
  s = one(s, '//   K15 水面の凹凸の図で、上位 20 本の波に入る力が 40% 以下（前は 18 本だけ＝100%・格子の干渉）（便19）\n',
    '//   K15 水面の凹凸の図で、上位 20 本の波に入る力が 40% 以下（前は 18 本だけ＝100%・格子の干渉）で、読む向きを回す差し替えが効いている（便19）\n')
  return s
})

rw('docs/qa/2026-11-03_便19/gate/mutate19.mjs', (s) => one(s, "  { name: 'M11 時代の粒子と霞の帯を鴨川でも出す',",
  "  { name: 'M12 別世界の空気（霧と色の膜）を鴨川でも掛ける', file: V, a: '    if (flyAmt > 0.02 && !kamo) { // 便19: 鴨川の町では別世界の空気', b: '    if (flyAmt > 0.02) { // 便19: 鴨川の町では別世界の空気', test: 'K18' },\n" +
  "  { name: 'M13 iPhone の段でも歩く高さを 4m の網で読む', file: K, a: '  const navDec = low ? 2 : 1\\n', b: '  const navDec = 1\\n', test: 'K8' },\n" +
  "  { name: 'M14 iPhone でも通常の段で開く', file: V, a: 'const KAMO_LOW = /[?&]kamoq=low/.test(location.search) ||', b: 'const KAMO_LOW = /[?&]kamoq=low/.test(location.search) || false &&', test: 'K8' },\n" +
  "  { name: 'M15 水面の図を読む向きを回さない', file: K, a: \"    if (!/[?&]kamowave=0/.test(location.search)) {\\n      water.material.fragmentShader\", b: \"    if (false) {\\n      water.material.fragmentShader\", test: 'K15' },\n" +
  "  { name: 'M11 時代の粒子と霞の帯を鴨川でも出す',"))
console.log('直した')
