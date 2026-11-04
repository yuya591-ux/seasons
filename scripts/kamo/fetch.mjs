// 便17（鴨川の質の見本）: 地図のデータを取ってくる。置き場は scripts/kamo/_data/（git に入れない・.gitignore）。
// 取る物（どれも登録なし・無料）:
//   1. 国土地理院の標高タイル（dem5a_png＝5m の細かさ・z15 を出町柳のまわり／dem_png＝10m の細かさ・z13 を遠くの山まで）
//      出典: 国土地理院 地理院タイル（標高タイル（基盤地図情報数値標高モデル））https://maps.gsi.go.jp/development/ichiran.html
//   2. PLATEAU 京都市 建築物モデル LOD2（模様なし・2025年度・3D Tiles）の、範囲に掛かるタイルだけ（左京区・上京区・北区）
//      出典: 国土交通省 Project PLATEAU（https://www.mlit.go.jp/plateau/）・データ目録 https://api.plateau.reearth.io/datacatalog/plateau-datasets
//   3. OpenStreetMap（川の水面・道・線路・橋・森）を Overpass API で範囲だけ。© OpenStreetMap contributors（ODbL）
// 使い方: node scripts/kamo/fetch.mjs
// ★経緯度はこの台本と作る台本（scripts/kamo/build.mjs）の中だけに置く。アプリへ渡す形は原点からのメートルだけ（測量法の申請不要の条件・裁定記録）。
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.env.KAMO_DATA || 'scripts/kamo/_data'
const LAT0 = 35.0300, LON0 = 135.7725 // 鴨川デルタ（賀茂川と高野川の合流）の南の先のあたり
const NEAR = 900 // 5m の標高と建物と OSM を取る半径の目安（m）・便17〜20
// 便21: 京都大学・吉田神社・吉田山・茂庵まで入れるため、東へ広げた四角（原点からの m・x 東・z 南）。build.mjs の範囲（EXT）と同じ
const EXT = { x0: -800, x1: 1904, z0: -800, z1: 904 } // 幅と奥行きは 8m の倍数（iPhone の段が網を1つおきに間引くため）
const FAR = 11000 // 遠くの山（比叡山・大文字山・北山・東山）まで
fs.mkdirSync(OUT + '/dem5', { recursive: true }); fs.mkdirSync(OUT + '/dem10', { recursive: true }); fs.mkdirSync(OUT + '/bldg', { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function dl(url, file, tries = 3) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return 'have'
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'seasons-prototype/1.0 (personal hobby project)' } })
      if (r.status === 404) return 404
      if (!r.ok) throw new Error(r.status)
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return 'ok'
    } catch (e) { if (i === tries - 1) throw new Error(url + ' ' + e.message); await sleep(1500) }
  }
}
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z
const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z
const mPerDegLat = 110940, mPerDegLon = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const bbox = (r) => ({ s: LAT0 - r / mPerDegLat, n: LAT0 + r / mPerDegLat, w: LON0 - r / mPerDegLon, e: LON0 + r / mPerDegLon })
const rect = (m) => ({ s: LAT0 - (EXT.z1 + m) / mPerDegLat, n: LAT0 - (EXT.z0 - m) / mPerDegLat, w: LON0 + (EXT.x0 - m) / mPerDegLon, e: LON0 + (EXT.x1 + m) / mPerDegLon }) // 便21

const log = []
// 1. 標高タイル
async function demTiles(kind, z, r, dir) {
  const b = typeof r === 'object' ? r : bbox(r), x0 = Math.floor(lon2x(b.w, z)), x1 = Math.floor(lon2x(b.e, z)), y0 = Math.floor(lat2y(b.n, z)), y1 = Math.floor(lat2y(b.s, z))
  let n = 0, miss = 0
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const s = await dl(`https://cyberjapandata.gsi.go.jp/xyz/${kind}/${z}/${x}/${y}.png`, `${OUT}/${dir}/${z}_${x}_${y}.png`)
    if (s === 404) miss++; else n++
  }
  log.push(`${kind} z${z}: x ${x0}〜${x1}・y ${y0}〜${y1}（${n} 枚・無し ${miss}）`)
  return { z, x0, x1, y0, y1 }
}
const dem5 = await demTiles('dem5a_png', 15, rect(100), 'dem5')
const dem10 = await demTiles('dem_png', 13, FAR, 'dem10')
fs.writeFileSync(`${OUT}/dem-tiles.json`, JSON.stringify({ dem5, dem10 }))

// 2. PLATEAU の建物（3区の LOD2 模様なし）。範囲に掛かるタイルを全部の段で取り、作る台本で建物の ID の重なりを除く
const cat = JSON.parse(fs.existsSync(`${OUT}/plateau-catalog.json`) ? fs.readFileSync(`${OUT}/plateau-catalog.json`, 'utf8') : await (async () => { const t = await (await fetch('https://api.plateau.reearth.io/datacatalog/plateau-datasets')).text(); fs.writeFileSync(`${OUT}/plateau-catalog.json`, t); return t })())
const wards = ['北区', '上京区', '左京区']
const bb = rect(-60), rad = (d) => (d * Math.PI) / 180
const inter = (reg) => !(reg[2] < rad(bb.w) || reg[0] > rad(bb.e) || reg[3] < rad(bb.s) || reg[1] > rad(bb.n))
const bldgList = []
for (const w of wards) {
  const d = (cat.datasets || cat).find((d) => d.type_en === 'bldg' && String(d.year) === '2025' && d.name === `建築物モデル（${w}）` && String(d.lod) === '2' && String(d.texture) === 'false')
  if (!d) { log.push(`PLATEAU ${w}: 見つからない`); continue }
  const base = d.url.replace(/tileset\.json$/, ''), tsFile = `${OUT}/bldg/${d.ward_code}-tileset.json`
  await dl(d.url, tsFile)
  const ts = JSON.parse(fs.readFileSync(tsFile, 'utf8'))
  const picks = []
  ;(function walk(t, depth) {
    if (!inter(t.boundingVolume.region)) return
    if (t.content) picks.push({ uri: t.content.uri || t.content.url, depth, leaf: !(t.children && t.children.length) })
    for (const c of t.children || []) walk(c, depth + 1)
  })(ts.root, 0)
  let bytes = 0
  for (const p of picks) {
    const f = `${OUT}/bldg/${d.ward_code}-${p.uri.replace(/[\/]/g, '_')}`
    await dl(base + p.uri, f); bytes += fs.statSync(f).size; p.file = f
  }
  bldgList.push({ ward: w, code: d.ward_code, url: d.url, tiles: picks })
  log.push(`PLATEAU ${w}（${d.ward_code}・LOD2 模様なし・2025）: 範囲に掛かるタイル ${picks.length}（末端 ${picks.filter((p) => p.leaf).length}）・${(bytes / 1e6).toFixed(1)}MB`)
}
fs.writeFileSync(`${OUT}/bldg-list.json`, JSON.stringify(bldgList, null, 1))

// 3. OpenStreetMap（Overpass）
const ob = rect(180)
const q = `[out:json][timeout:90];(
way["natural"="water"](${ob.s},${ob.w},${ob.n},${ob.e});relation["natural"="water"](${ob.s},${ob.w},${ob.n},${ob.e});
way["waterway"](${ob.s},${ob.w},${ob.n},${ob.e});
way["highway"](${ob.s},${ob.w},${ob.n},${ob.e});
way["railway"](${ob.s},${ob.w},${ob.n},${ob.e});
way["landuse"](${ob.s},${ob.w},${ob.n},${ob.e});way["natural"="wood"](${ob.s},${ob.w},${ob.n},${ob.e});relation["landuse"](${ob.s},${ob.w},${ob.n},${ob.e});
way["leisure"](${ob.s},${ob.w},${ob.n},${ob.e});way["natural"="tree"](${ob.s},${ob.w},${ob.n},${ob.e});node["natural"="tree"](${ob.s},${ob.w},${ob.n},${ob.e});
nwr["amenity"](${ob.s},${ob.w},${ob.n},${ob.e});nwr["tourism"](${ob.s},${ob.w},${ob.n},${ob.e});nwr["historic"](${ob.s},${ob.w},${ob.n},${ob.e});
nwr["man_made"](${ob.s},${ob.w},${ob.n},${ob.e});way["building"]["name"](${ob.s},${ob.w},${ob.n},${ob.e});way["natural"](${ob.s},${ob.w},${ob.n},${ob.e});
node["natural"="peak"](${ob.s},${ob.w},${ob.n},${ob.e});node["highway"="street_lamp"](${ob.s},${ob.w},${ob.n},${ob.e});way["barrier"](${ob.s},${ob.w},${ob.n},${ob.e});
);out body geom;` // 便21: 名所（寺社・大学・カフェ・公園）・堰・灯り・塀を足した
if (!fs.existsSync(`${OUT}/osm.json`)) {
  // 混んでいると 504 が返るので、配り口を順に回す（2026-11-03 の1回目は overpass-api.de が 504、2回目で返った）
  let got = null
  for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'seasons-prototype/1.0 (personal hobby project)' } }).catch((e) => ({ ok: false, status: e.message }))
    if (r.ok) { got = await r.text(); break }
    log.push(`Overpass ${ep}: ${r.status}`)
  }
  if (!got) throw new Error('Overpass のどの配り口も返らない')
  fs.writeFileSync(`${OUT}/osm.json`, got)
}
const osm = JSON.parse(fs.readFileSync(`${OUT}/osm.json`, 'utf8'))
log.push(`OpenStreetMap（Overpass・${new Date().toISOString().slice(0, 10)}）: 要素 ${osm.elements.length}・${(fs.statSync(`${OUT}/osm.json`).size / 1e6).toFixed(1)}MB`)
fs.writeFileSync(`${OUT}/fetch-log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
