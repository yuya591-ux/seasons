// 便19: scripts/kamo/kensa.mjs の K2 を書き換え、K9〜K15 を足す（足す中身は kensa19-add.mjs.txt）
const fs = require('fs')
const F = 'scripts/kamo/kensa.mjs'
let s = fs.readFileSync(F, 'utf8')
const CRLF = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n')
const R = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`当たりが ${n} か所: ${a.slice(0, 90)}`); s = s.replace(a, () => b) }
R('// 便18 の検査:', '// 便18・便19 の検査:')
R('//   K2 鴨川の角部屋は飛べない（飛ぶ・降りるが揃うまで窓辺だけ）\n',
  '//   ~~K2 鴨川の角部屋は飛べない（飛ぶ・降りるが揃うまで窓辺だけ）~~（【便19】下の K2 に書き換えた）\n' +
  '//   K2 鴨川の角部屋で、画面の釦を「窓をあける → 乗り出す → 空へ」と押すと空へ出て（釦が「地上へ」）、「地上へ」で歩く（便19）\n')
R('//   K8 iPhone の画面（402×874・指で触る）では軽い段で開き、PC の画面では通常の段で開く\n',
  '//   K8 iPhone の画面（402×874・指で触る）では軽い段で開き、PC の画面では通常の段で開く\n' +
  '//   K9 歩いて川へ向かうと水際で止まる（水に入らない・水際の 3m 手前より先まで進む）（便19）\n' +
  '//   K10 建物へ向かって歩くと壁の手前で止まる（建物の中に入らない）（便19）\n' +
  '//   K11 橋の床の上を歩くと、水の上を渡って向こうへ行ける（足が橋の床の高さのまま）（便19）\n' +
  '//   K12 背の高い建物へ低く飛んで向かうと、建物の上を越える（自分は建物・木の上 1m 以上・カメラは 0.5m 以上）（便19）\n' +
  '//   K13 iPhone の縦で開くと正面の窓（東＝鴨川）が正面（見回しの横 0）。PC は今のまま -0.6、?kamo=0 の iPhone は -1.12（便19・便18 #1=1）\n' +
  '//   K14 乗り出して見下ろした画の真っ黒（RGB の最大 3 以下）の画素が 0.5% 未満（建物の焼けていない面の黒・前は 3.4%）（便19）\n' +
  '//   K15 水面の凹凸の図で、上位 20 本の波に入る力が 40% 以下（前は 18 本だけ＝100%・格子の干渉）（便19）\n')
R("  if (run('K2')) { await o.p.evaluate(() => window.__town3dFly(true)); await o.p.waitForTimeout(1500); const st2 = await o.p.evaluate(() => window.__town3dStats()); check('K2', st2 && st2.flyable === false, `飛べる ${st2 && st2.flyable}`) }",
  "  if (run('K2')) { // 画面の釦で進む（検証の口でなく、人が押すのと同じ道）\n" +
  "    const btn = () => o.p.evaluate(() => (document.querySelector('.iconbtn--stage') || {}).textContent || null)\n" +
  "    const labels = []; for (let i = 0; i < 3; i++) { labels.push(await btn()); await o.p.locator('.iconbtn--stage').click({ force: true }).catch(() => {}); await o.p.waitForTimeout(i === 2 ? 3000 : 1800) }\n" +
  "    const m1 = await o.p.evaluate(() => window.__town3dNav()); labels.push(await btn())\n" +
  "    await o.p.locator('.iconbtn--stage').click({ force: true }).catch(() => {}); await o.p.waitForTimeout(3500)\n" +
  "    const m2 = await o.p.evaluate(() => window.__town3dNav())\n" +
  "    check('K2', labels.join('→') === '窓をあける→乗り出す→空へ→地上へ' && !!m1 && m1.mode === 'fly' && m1.kamoNav && !!m2 && m2.mode === 'walk' && !o.errs.length, `釦 ${labels.join('→')}・空へ後 ${m1 && m1.mode}・地上へ後 ${m2 && m2.mode}（${m2 && m2.place}）・エラー ${o.errs.length}`)\n" +
  "  }")
const add = fs.readFileSync('docs/qa/2026-11-03_便19/gate/kensa19-add.mjs.txt', 'utf8').replace(/\r\n/g, '\n')
R('await b.close()\nconst bad', add + 'await b.close()\nconst bad')
fs.writeFileSync(F, CRLF ? s.replace(/\n/g, '\r\n') : s)
console.log('書き換えた')
