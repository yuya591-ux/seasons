// 便20（鴨川の音と時々の出来事・森見登美彦作品の舞台）: 鴨川の町で人や電車が動く所と、遠くの名所の位置を、原点（鴨川デルタ）からのメートルにして書き出す。
// 元: scripts/kamo/_data/osm.json（scripts/kamo/fetch.mjs が取った © OpenStreetMap contributors・ODbL 1.0）と、
//     大文字の火床・叡電の出町柳駅の位置（2026-11-04 に Overpass API で OpenStreetMap に問うた点。下の SPOTS に写した）
// 出る物: public/kamo/life.json（★経緯度は書かない。build.mjs と同じ原点・同じ向き＝x 東・z 南）
// 使い方: node scripts/kamo/life.mjs
import fs from 'node:fs'

const D = process.env.KAMO_DATA || 'scripts/kamo/_data'
const LAT0 = 35.0300, LON0 = 135.7725 // build.mjs と同じ原点
const phi = (LAT0 * Math.PI) / 180
const MLAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi), MLON = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)
const toX = (lon) => (lon - LON0) * MLON, toZ = (lat) => -(lat - LAT0) * MLAT
const r1 = (v) => Math.round(v * 10) / 10
const LIM = 760 // 近くの地形の網（±800m）の内側

// OpenStreetMap の点（node の番号は出どころの控え）
const SPOTS = {
  daimonji: [35.0230647, 135.8043711], // node 6392004465「大文字」（如意ヶ嶽の西の大文字山の火床）
  myo: [35.0552, 135.7716], // 「妙」: node 5743446169「西山」の頂（35.0563022, 135.7708998）の南の斜面へ約 130m（火床は南を向く斜面）
  ho: [35.0547791, 135.7860293], // node 6392004466「松ヶ崎妙法」（東山の「法」の火床）
  funa: [35.0664872, 135.7345974], // node 6392004468「舟形万灯籠」（船山）
  hidari: [35.0431751, 135.7313215], // node 6392004469「左大文字」（大北山）
  torii: [35.0277537, 135.6678887], // node 6392004804「鳥居形松明」（曼荼羅山）
  eidenSta: [35.0304955, 135.7732355], // node 335671845「出町柳」（叡山電鉄の駅）
  kawai: [35.0347053, 135.7719364], // way 351136449「河合神社」（糺の森の南の端）
  tadasu: [35.0369731, 135.7727345], // relation 5646741「糺の森」の中心
  gosho: [35.0254, 135.7621], // 京都御所の中ほど（大文字の「大」が向く西の目安。OpenStreetMap の京都御苑の中ほどを丸めた点）
}

const osm = JSON.parse(fs.readFileSync(D + '/osm.json', 'utf8')).elements
const way = (id) => { const e = osm.find((x) => x.type === 'way' && x.id === id); if (!e || !e.geometry) throw new Error('地図データに way ' + id + ' が無い'); return e.geometry.map((g) => [toX(g.lon), toZ(g.lat)]) }
// 叡山電鉄の線路（2本）。駅の奥の端から北東へ。区間をつなぎ、4m ごとに置き直し、網の外で切る
function chain(parts) {
  const out = []
  for (const p of parts) { const s = out.length && Math.hypot(out[out.length - 1][0] - p[0][0], out[out.length - 1][1] - p[0][1]) < 0.5 ? p.slice(1) : p; out.push(...s) }
  return out
}
function resample(pts, step = 4) {
  const out = [pts[0]]
  let carry = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az)
    let d = step - carry
    while (d <= L) { out.push([ax + ((bx - ax) * d) / L, az + ((bz - az) * d) / L]); d += step }
    carry = L - (d - step)
  }
  return out
}
const clip = (pts) => { const o = []; for (const p of pts) { if (Math.abs(p[0]) > LIM || Math.abs(p[1]) > LIM) break; o.push(p) } return o }
const flat = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)])
// 上り（駅 → 北東）: 297202352（駅の端 → 北）→ 297202354 → 297202289（北東へ）
const trackA = clip(resample(chain([way(297202352), way(297202354), way(297202289)])))
// もう1本: 879172538 を逆に（駅の端 → 北）→ 879172532 を逆に → 30415972 を逆に（北東へ）
const rev = (a) => a.slice().reverse()
const trackB = clip(resample(chain([rev(way(879172538)), rev(way(879172532)), rev(way(30415972))])))
const len = (p) => p.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0), 0)
// 出町桝形商店街（歩く人の道・アーケード）
const masugata = way(151694612)

const [dLat, dLon] = SPOTS.daimonji, [gLat, gLon] = SPOTS.gosho
const dX = toX(dLon), dZ = toZ(dLat)
const faceDeg = (Math.atan2(toX(gLon) - dX, -(toZ(gLat) - dZ)) * 180) / Math.PI // 「大」の面が向く向き（0＝北・90＝東。three の yaw と同じ測り方）
const P = (k) => ({ x: r1(toX(SPOTS[k][1])), z: r1(toZ(SPOTS[k][0])) })
const out = {
  note: '原点（鴨川デルタ）からのメートル。x 東・z 南。経緯度は入れていない。元は © OpenStreetMap contributors（ODbL 1.0）',
  eiden: { a: flat(trackA), b: flat(trackB), lenA: r1(len(trackA)), lenB: r1(len(trackB)), sta: P('eidenSta') },
  masugata: flat(masugata),
  daimonji: { x: r1(dX), z: r1(dZ), faceDeg: r1(faceDeg) },
  kawai: P('kawai'), tadasu: P('tadasu'),
  // 五山の送り火（点く順・本物は 20:00 から5分おき＝大文字・妙法・船形・左大文字・鳥居形。火床の数は京都の案内の数）
  gozan: [['daimonji', 0, 75], ['myo', 5, 103], ['ho', 5, 63], ['funa', 10, 79], ['hidari', 15, 53], ['torii', 20, 108]].map(([k, min, beds]) => ({ k, min, beds, ...P(k) })),
}
fs.writeFileSync('public/kamo/life.json', JSON.stringify(out))
console.log(`叡電の線路 A ${trackA.length} 点 ${out.eiden.lenA}m・B ${trackB.length} 点 ${out.eiden.lenB}m・駅 ${JSON.stringify(out.eiden.sta)}`)
console.log(`出町桝形商店街 ${masugata.length} 点（x ${r1(masugata[0][0])}〜${r1(masugata[masugata.length - 1][0])}・z ${r1(masugata[0][1])}）`)
console.log(`大文字 x ${out.daimonji.x}・z ${out.daimonji.z}・面の向き ${out.daimonji.faceDeg}°・河合神社 ${JSON.stringify(out.kawai)}・糺の森 ${JSON.stringify(out.tadasu)}`)
console.log('五山', out.gozan.map((g) => g.k + ' ' + g.x + ',' + g.z).join(' ／ '))
console.log(`life.json ${fs.statSync('public/kamo/life.json').size} バイト`)
