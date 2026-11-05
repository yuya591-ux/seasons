// 便24: 検査 K49〜K53 と、木の形の通りの数の報せ口（一度だけ回す編集の台本）
const fs = require('fs')
let f = 'src/engine/kamoTown.js', s = fs.readFileSync(f, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n')
const rep = (a, b) => { if (!s.includes(a)) throw new Error('見つからない: ' + a.slice(0, 80)); s = s.replace(a, b) }
rep("      const t = { crownM, trunkM, col: c.clone(), vi }\n", "      const t = { crownM, trunkM, col: c.clone(), vi }; treeV[vi === 'w' ? 'w' : 'v' + vi]++ // 便24: 形の通りの数（検査 K51）\n")
rep("  let placeTrees = null", "  const treeV = { w: 0, v0: 0, v1: 0, v2: 0, v3: 0 } // 便24: 木の形の通りの数（柳・前の形・ばらつき 3 通り）\n  let placeTrees = null")
rep("kyo: KYO ? {", "trees2: treeV, kyo: KYO ? {")
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s)
f = 'scripts/kamo/kensa.mjs'; s = fs.readFileSync(f, 'utf8'); const c2 = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n')
s = s.replace("//   K48 南の四角を組む途中で失敗した時", `//   K49 納涼床（便24）: 夏と秋は鴨川の西岸（二条〜四条の南）に 30 か所以上・冬と春は 0（?yuka=1 の時だけ出す）
//   K50 町家の表（便24）: 町家の庇から出格子・暖簾などを足した家が 2,000 軒以上・祇園と先斗町で町家（お茶屋）へ替えた家が 300 軒以上
//   K51 木（便24）: 柳が 100 本以上・形のばらつき（1〜3 の通り）がそれぞれ 500 本以上（PC の段）。?kamotree2=0 で柳 0
//   K52 石畳（便24）: 祇園の通りを目の高さで見た道の所の縁の量（edgedetect の明るさの平均）が 5 以上で、?kamostone=0 の 2 倍以上
//   K53 晴れた夏の夜（便24）: 四条の上の空から先斗町の川岸を見た画の下 55% の明るさ（YAVG）が 26〜70・色の濃さ（SATAVG）が 3 以上（前は 22・0.8 で、町が灰色の暗がりに沈んだ）
//   K48 南の四角を組む途中で失敗した時`)
const tests = `
// ── 便24 ──
async function edges(p, crop) { const fsx = await import('node:fs'), os = await import('node:os'), path = await import('node:path'), cp = await import('node:child_process'); const t = path.join(os.tmpdir(), 'k24-' + Date.now() + '.png'); fsx.writeFileSync(t, await p.screenshot()); const r = cp.spawnSync('ffmpeg', ['-v', 'info', '-i', t, '-vf', crop + ',signalstats,metadata=mode=print', '-f', 'null', '-'], { encoding: 'utf8' }); fsx.unlinkSync(t); const g = (k) => +(((r.stderr || '').match(new RegExp(k + '=([0-9.]+)')) || [])[1] || -1); return { y: g('YAVG'), sat: g('SATAVG') } }
const waitSouth = (p) => p.waitForFunction(() => { const k = window.__town3dKamo && window.__town3dKamo(); return k && k.south && k.outer }, null, { timeout: 150000 }).catch(() => {})
const camAt = async (p, v) => { await p.evaluate(() => window.__town3dFly(true)); await p.waitForTimeout(2600); await p.evaluate((v) => { window.__kamoCam = { p: v.slice(0, 3), l: v.slice(3, 6), fov: v[6] } }, v); await p.waitForTimeout(2500) }
if (run('K49') || run('K50') || run('K51') || run('K52')) {
  const o = await open('summer-morning-corner-room'); await waitSouth(o.p); const k = await kamoInfo(o.p)
  const y = (k.kyo && k.kyo.yuka) || {}, fr = (k.kyo && k.kyo.fronts) || [], oc = (k.kyo && k.kyo.ochaya) || [], tv = k.trees2 || {}
  const nF = fr.reduce((a, r) => a + (r.n || 0), 0), nO = oc.reduce((a, r) => a + (r.n || 0), 0)
  if (run('K50')) check('K50', nF >= 2000 && nO >= 300, \`町家の表を足した家 \${nF}（2000 以上）・お茶屋へ替えた家 \${nO}（300 以上）\`)
  if (run('K51')) check('K51', tv.w >= 100 && tv.v1 >= 500 && tv.v2 >= 500 && tv.v3 >= 500, \`柳 \${tv.w}（100 以上）・形 1〜3 \${tv.v1}・\${tv.v2}・\${tv.v3}（各 500 以上）・前の形 \${tv.v0}\`)
  let e1 = null
  if (run('K52')) { await camAt(o.p, [366, -10.5, 3060, 366, -12.5, 3100, 60]); e1 = await edges(o.p, 'crop=iw*0.3:ih*0.25:iw*0.2:ih*0.72,edgedetect=low=0.05:high=0.15') }
  await o.ctx.close()
  if (run('K49')) {
    const w = await open('winter-snow-dusk-corner-room'); await waitSouth(w.p); const kw = await kamoInfo(w.p); await w.ctx.close()
    const yw = (kw.kyo && kw.kyo.yuka) || {}
    check('K49', y.n >= 30 && y.season === 'summer' && (yw.n || 0) === 0, \`夏の納涼床 \${y.n}（30 以上）・冬の納涼床 \${yw.n}（0）\`)
  }
  if (run('K52')) { const o2 = await open('summer-morning-corner-room', { q: 'kamostone=0' }); await waitSouth(o2.p); await camAt(o2.p, [366, -10.5, 3060, 366, -12.5, 3100, 60]); const e0 = await edges(o2.p, 'crop=iw*0.3:ih*0.25:iw*0.2:ih*0.72,edgedetect=low=0.05:high=0.15'); await o2.ctx.close()
    check('K52', e1.y >= 5 && e1.y >= e0.y * 2, \`祇園の通りの道の縁の量 \${e1.y}（5 以上）・石畳なし \${e0.y}（その 2 倍以上で合格）\`) }
}
if (run('K51')) { const o = await open('summer-morning-corner-room', { q: 'kamotree2=0' }); await waitSouth(o.p); const k = await kamoInfo(o.p); await o.ctx.close(); check('K51', (k.trees2 || {}).w === 0, \`?kamotree2=0 の柳 \${(k.trees2 || {}).w}（0）\`) }
if (run('K53')) {
  const o = await open('summer-night-corner-room'); await waitSouth(o.p); await camAt(o.p, [-20, 28, 2990, -112, -8, 2680, 55]); const e = await edges(o.p, 'crop=iw:ih*0.55:0:ih*0.45'); await o.ctx.close()
  check('K53', e.y >= 26 && e.y <= 70 && e.sat >= 3, \`晴れた夏の夜の下 55% の明るさ \${e.y}（26〜70）・色の濃さ \${e.sat}（3 以上）\`)
}
`
s = s.replace("\nawait b.close()\nconst bad = results.filter", tests + "await b.close()\nconst bad = results.filter")
fs.writeFileSync(f, c2 ? s.replace(/\n/g, '\r\n') : s)
console.log('ok')
