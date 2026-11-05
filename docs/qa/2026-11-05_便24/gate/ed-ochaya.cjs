// 便24: お茶屋の表を足す直し（一度だけ回す編集の台本）
const fs = require('fs')
let f = 'src/engine/kamoTown.js', s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('見つからない: ' + a.slice(0, 90)); s = s.replace(a, b) }
rep("  const ochayaSegs = [] // 便24: 描く時に町家（お茶屋）へ替えた家の表の壁の線（buildBldg が足す）\n", '')
rep('  const removed = []\n', '  const removed = []\n  const ochayaSegs = [] // 便24: 描く時に町家（お茶屋）へ替えた家の表の壁の線（buildBldg が足す・使ったら空にする）\n')
rep("lmTex: data.lm.bldg, isA: true })\n  }", "lmTex: data.lm.bldg, isA: true })\n  }\n  // 便24: 描く時に町家へ替えた家の庇と表の細かい物（北の四角には祇園・先斗町が無いので、ふつうは 0 軒）\n  function addOchaya(seed) { if (!ochayaSegs.length) return; try { kyo2.ochaya.push(buildOchayaFronts({ scene, keep, NIGHT, DUSK: TK === 'dusk', SNOW, low }, ochayaSegs.splice(0), seed)) } catch (e) { console.warn('お茶屋の表を組めなかった:', e && e.message) } }")
rep('  const kyo2 = { fronts: [], yuka: null } // 便24', '  const kyo2 = { fronts: [], yuka: null, ochaya: [] } // 便24\n  addOchaya(1)')
rep('      info.bldgTris = Sm.bldg.nv / 3\n', '      info.bldgTris = Sm.bldg.nv / 3\n      addOchaya(2)\n')
rep('kyo: KYO ? { count: kyoCount, eaves: eaveN, fronts: kyo2.fronts, yuka: kyo2.yuka } : null,', 'kyo: KYO ? { count: kyoCount, eaves: eaveN, fronts: kyo2.fronts, yuka: kyo2.yuka, ochaya: kyo2.ochaya } : null,')
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s)

f = 'src/engine/kamoKyo.js'; s = fs.readFileSync(f, 'utf8')
const a = s.indexOf('/** 町家の表の細かい物。'), b = s.indexOf('/** 納涼床。')
s = s.slice(0, a) + fs.readFileSync('docs/qa/2026-11-05_便24/gate/ed-ochaya-front.js.txt', 'utf8') + '\n' + s.slice(b)
fs.writeFileSync(f, s)
console.log('ok')
