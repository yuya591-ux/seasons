// 便24: 外の目の直すべき 3・4・5 と様子見 3・7・10、A8 の検査（一度だけ回す編集の台本）
const fs = require('fs')
const ed = (f, pairs) => { let s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(f + ' 見つからない: ' + a.slice(0, 80)); s = s.replace(a, b) } fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s) }
ed('src/engine/kamoKyo.js', [
  ["  if (!(S === 'summer' || S === 'autumn') && !/[?&]yuka=1/.test(location.search)) return { n: 0, tris: 0, season: S } // 床が出るのは 5〜9 月（?yuka=1 で冬と春も出す・検証用）",
   "  // ~~夏と秋に出す~~（【便24・外の目 直すべき3】秋の情景は紅葉の頃で、本物の床〈5/1〜9/30〉と季節がずれた。春の情景は桜の頃〈4 月〉で床の前）＝夏だけ。?yuka=1 で夏のほかも出す（検証用）\n  if (S !== 'summer' && !/[?&]yuka=1/.test(location.search)) return { n: 0, tris: 0, season: S }"],
  ['export const frontsAt = [] // 検証用: お茶屋に替えた家の表の真ん中・外の向き・足もと・幅', 'export const frontsAt = [] // 検証用: お茶屋に替えた家の表の真ん中・外の向き・足もと・幅（kamoTown が組むたびに空にする）'],
])
ed('src/engine/kamoTown.js', [
  // 雪と雨の石畳
  ['    diffuseColor.rgb = mix(st, vec3(0.52, 0.5, 0.46), far * 0.6);', "    diffuseColor.rgb = mix(st, vec3(0.52, 0.5, 0.46), far * 0.6);\n    ${SNOW ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.86, 0.89), 0.6 * (1.0 - max(gA, gU) * 0.4));' : ''}${RAIN ? 'diffuseColor.rgb *= 0.62;' : ''} // 【便24・外の目 直すべき4】雪の日は雪を、雨の日は濡れた暗さを石畳にも"],
  // お茶屋は傾いた屋根の 2 階建てまで
  ["      for (const q of seg.values()) if (q.s1 - q.s0 > 2.5 && q.s1 - q.s0 < 30)", "      for (const [b, q] of seg) if (q.s1 - q.s0 > 2.5 && q.s1 - q.s0 < 30 && pitched.has(b))"],
  ["        if (Math.abs(n0.y) > 0.3) continue\n        const e = bb.get(b), cx", "        if (Math.abs(n0.y) > 0.3) { if (Math.abs(n0.y) < 0.97) pitched.add(b); continue } // 【便24・外の目 直すべき5】傾いた屋根の面がある家だけ\n        const e = bb.get(b), cx"],
  ["      const seg = new Map(), n0 = new THREE.Vector3()", "      const seg = new Map(), pitched = new Set(), n0 = new THREE.Vector3()"],
  ["e.max.y - e.min.y < 11.5 && e.max.x - e.min.x < 40", "e.max.y - e.min.y < 9.5 && e.max.x - e.min.x < 40"],
  ["    const sty = (b) => (ovr.has(b) ? 1 : styleA[b])", "    const sty = (b) => (ovrOk.has(b) ? 1 : styleA[b]) // 【便24・外の目 直すべき5】傾いた屋根の 2 階建て（高さ 9.5m 未満）だけを町家として描く（前は平らな屋根の箱に格子が付いた）\n    const ovrOk = new Set()"],
  ["      for (const [b, q] of seg) if (q.s1 - q.s0 > 2.5 && q.s1 - q.s0 < 30 && pitched.has(b))", "      for (const b of pitched) ovrOk.add(b)\n      for (const [b, q] of seg) if (q.s1 - q.s0 > 2.5 && q.s1 - q.s0 < 30 && pitched.has(b))"],
  // 夜の値の注の食い違い
  ['  //   月の光（青白く 0.25→0.6）と空の光（藍 0.35→0.95）を上げ、霞を藍の夜気に（遠くの山の形が浮く）。露出は 0.55→0.72（窓の灯りが白く飛ばない所まで）', '  //   月の光（青白く 0.25→0.7）と空の光（藍 0.35→1.05）を上げ、霞を藍の夜気に（遠くの山の形が浮く）。露出は 0.55→0.74（窓の灯りが白く飛ばない所まで）'],
  // 検証用の配列を組むたびに空に
  ['  const ochayaSegs = [] // 便24: 描く時に町家（お茶屋）へ替えた家の表の壁の線（buildBldg が足す・使ったら空にする）', '  const ochayaSegs = [] // 便24: 描く時に町家（お茶屋）へ替えた家の表の壁の線（buildBldg が足す・使ったら空にする）\n  kyoFrontsAt.length = 0 // 【便24・外の目 様子見10】検証用の配列を組むたびに空に'],
])
ed('index.html', [['content="https://yuya591-ux.github.io/seasons/og.jpg"', 'content="https://yuya591-ux.github.io/seasons/og.jpg?v=24"'], ['content="https://yuya591-ux.github.io/seasons/og.jpg"', 'content="https://yuya591-ux.github.io/seasons/og.jpg?v=24"']])
// 検査: K49 に秋＝0 を足す
ed('scripts/kamo/kensa.mjs', [
  ['//   K49 納涼床（便24）: 夏と秋は鴨川の西岸（二条〜四条の南）に 30 か所以上・冬と春は 0（?yuka=1 の時だけ出す）', '//   K49 納涼床（便24）: 夏は鴨川の西岸（二条〜四条の南）に 30 か所以上・秋と冬は 0（【便24・外の目】本物の床は 5〜9 月＝紅葉の秋は出さない）'],
  ["    const w = await open('winter-snow-dusk-corner-room'); await waitSouth(w.p); const kw = await kamoInfo(w.p); await w.ctx.close()\n    const yw = (kw.kyo && kw.kyo.yuka) || {}\n    check('K49', y.n >= 30 && y.season === 'summer' && (yw.n || 0) === 0, `夏の納涼床 ${y.n}（30 以上）・冬の納涼床 ${yw.n}（0）`)",
   "    const w = await open('winter-snow-dusk-corner-room'); await waitSouth(w.p); const kw = await kamoInfo(w.p); await w.ctx.close()\n    const a = await open('autumn-dusk-corner-room'); await waitSouth(a.p); const ka = await kamoInfo(a.p); await a.ctx.close()\n    const yw = (kw.kyo && kw.kyo.yuka) || {}, ya = (ka.kyo && ka.kyo.yuka) || {}\n    check('K49', y.n >= 30 && y.season === 'summer' && (yw.n || 0) === 0 && (ya.n || 0) === 0, `夏の納涼床 ${y.n}（30 以上）・秋 ${ya.n}・冬 ${yw.n}（どちらも 0）`)"],
])
// 音の確かめ A8
ed('docs/qa/2026-11-05_便24/gate/audio24.mjs', [
  ['//   A5 叡山電車の音を鳴らすと', '//   A8（便24・外の目 直すべき2）北寺尾の駅の電車の通過音は低い「ゴーッ」を持たない（作りの低音切り 400Hz 以上・帯の真ん中 800Hz 以上）\n//   A5 叡山電車の音を鳴らすと'],
  ["  await r.ctx.close(); await d.ctx.close()\n}", "  { const body8 = src.slice(src.indexOf('const trainPass'), src.indexOf('const tick', src.indexOf('const trainPass'))), hp8 = +((body8.match(/hp\.frequency\.value = (\d+)/) || [])[1] || 0), bp8 = +((body8.match(/bp\.frequency\.value = (\d+)/) || [])[1] || 0)\n    check('A8', hp8 >= 400 && bp8 >= 800, `駅の電車の通過音の低音切り ${hp8}Hz（400 以上）・帯の真ん中 ${bp8}Hz（800 以上）`) }\n  await r.ctx.close(); await d.ctx.close()\n}"],
])
console.log('ok')
