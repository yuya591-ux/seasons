// 便19: 外し回しで落ちなかった K17・K18 を直す（K17＝状態で測る・K18＝霞の帯が一番濃い島の縁に置く）
const fs = require('fs')
const rw = (F, fn) => { let s = fs.readFileSync(F, 'utf8'); const CR = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n'); s = fn(s); fs.writeFileSync(F, CR ? s.replace(/\n/g, '\r\n') : s) }
const one = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`当たりが ${n} か所: ${a.slice(0, 80)}`); return s.replace(a, () => b) }

rw('src/engine/kamoTown.js', (s) => one(s, 'parts, nav: nav.info(), waveTop20 } },', 'parts, nav: nav.info(), waveTop20, plugShown: !!(plug && plug.visible) } },'))

rw('scripts/kamo/kensa.mjs', (s) => {
  const i = s.indexOf("if (run('K17')) {"), j = s.indexOf("if (run('K18')) {")
  if (i < 0 || j < 0) throw new Error('K17 か K18 が無い')
  const k17 = `if (run('K17')) { // 部屋の窓の所を塞ぐ壁が、窓辺では出ず、空と地上では出て、窓辺へもどると消える（塞ぐ壁の見える状態を読む）
  // 【便19】前は塞ぐ壁あり・なしの2枚の画の差で測ったが、2枚を別のこまで撮るので水と木の揺れだけで差が出て、塞がない形でも合格した（外し回し M10）。
  //   状態で測る形に替えた。塞いだ所の画は docs/qa/2026-11-03_便19/shots/c-facade.png と c-facade-noplug.png
  const o = await open('summer-morning-corner-room', { dev: { viewport: { width: 1280, height: 720 } } })
  const st = async () => { const k = await kamoInfo(o.p); return k && k !== 'no-hook' ? k.plugShown : null }
  const win = await st()
  await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(2600); const fly = await st()
  await o.p.evaluate(() => window.__town3dLand(true)); await o.p.waitForTimeout(2600); const walk = await st()
  await o.p.evaluate(() => window.__town3dFly(false)); await o.p.waitForTimeout(2600); const back = await st()
  check('K17', win === false && fly === true && walk === true && back === false, \`塞ぐ壁: 窓辺 \${win}（false）・空 \${fly}（true）・地上 \${walk}（true）・窓辺へもどった後 \${back}（false）\`)
  await o.ctx.close()
}
`
  s = s.slice(0, i) + k17 + s.slice(j)
  s = one(s, "  for (const [nm, x, z] of [['江戸', 640, -46], ['大正', -640, -30], ['戦国', 140, -640]]) {",
    "  // 【便19】霞の帯は島の中心から 230×(1−0.44)＝約 129m の縁で一番濃く出る（town3dViewer の pk）。前は中心に置いていて、帯を鴨川でも出す形でも合格した（外し回し M11）＝縁に置く形に替えた\n" +
    "  for (const [nm, x, z] of [['江戸', 640 - 129, -46], ['大正', -640 + 129, -30], ['戦国', 140, -640 + 129]]) {")
  s = one(s, '//   K17 空から部屋の建物を見ると、部屋の窓の所が外壁で塞がる（塞ぐ壁を止めた画と 0.2% 以上の画素が違う）（便19）',
    '//   ~~K17 空から部屋の建物を見ると、部屋の窓の所が外壁で塞がる（塞ぐ壁を止めた画と 0.2% 以上の画素が違う）~~（【便19】揺れだけで合格したので下の形に替えた）\n//   K17 部屋の窓の所を塞ぐ壁が、窓辺では出ず、空と地上では出て、窓辺へもどると消える（便19）')
  s = one(s, '//   K18 北寺尾の時代の島と同じ所を鴨川の町で飛んでも', '//   K18 北寺尾の時代の島の縁（霞の帯が一番濃い所）と同じ所を鴨川の町で飛んでも')
  return s
})
console.log('直した')
