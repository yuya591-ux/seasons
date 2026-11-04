// 便22（外の町）: 鴨川の町の外側（西は金閣寺・南は京都駅と京都タワーまで）の地図のデータを取ってくる。置き場は scripts/kamo/_data/（git に入れない）
// 取る物（どれも登録なし・無料。出どころは fetch.mjs と同じ）:
//   1. 国土地理院の標高タイル（dem5a_png・z15）を外の町の四角だけ（置き場は鴨川の町と同じ dem5/・取ってある物は取らない）
//   2. PLATEAU 京都市 建築物モデル LOD2（模様なし・2025年度・3D Tiles）の、外の町に掛かるタイル（8 区）
//   3. OpenStreetMap（Overpass）を外の町の四角だけ（道・線路・川と水・緑・寺社・名所）→ _data/outer/osm.json
// 使い方: node scripts/kamo/outer-fetch.mjs
// ★経緯度はこの台本と作る台本（outer-build.mjs）の中だけに置く。アプリへ渡す形は原点からのメートルだけ
import fs from 'node:fs'
const D = process.env.KAMO_DATA || 'scripts/kamo/_data', OUT = D + '/outer'
const LAT0 = 35.0300, LON0 = 135.7725
export const OX = { x0: -4400, x1: 2400, z0: -1600, z1: 5408 } // 外の町の四角（原点からの m・x 東・z 南）。金閣寺は西 3.9km・京都駅は南 4.9km
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(D + '/dem5', { recursive: true }); fs.mkdirSync(D + '/bldg', { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function dl(url, file, tries = 4) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return 'have'
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'seasons-prototype/1.0 (personal hobby project)' } })
      if (r.status === 404) return 404
      if (!r.ok) throw new Error(r.status)
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return 'ok'
    } catch (e) { if (i === tries - 1) throw new Error(url + ' ' + e.message); await sleep(2000) }
  }
}
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z
const lat2y = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z
const mPerDegLat = 110940, mPerDegLon = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const rect = (m) => ({ s: LAT0 - (OX.z1 + m) / mPerDegLat, n: LAT0 - (OX.z0 - m) / mPerDegLat, w: LON0 + (OX.x0 - m) / mPerDegLon, e: LON0 + (OX.x1 + m) / mPerDegLon })
const log = []
// 1. 標高
{ const b = rect(120), z = 15, x0 = Math.floor(lon2x(b.w, z)), x1 = Math.floor(lon2x(b.e, z)), y0 = Math.floor(lat2y(b.n, z)), y1 = Math.floor(lat2y(b.s, z))
  let n = 0, miss = 0
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const s = await dl(`https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/${z}/${x}/${y}.png`, `${D}/dem5/${z}_${x}_${y}.png`); if (s === 404) miss++; else n++ }
  fs.writeFileSync(`${OUT}/dem-tiles.json`, JSON.stringify({ dem5: { z, x0, x1, y0, y1 } }))
  log.push(`dem5a_png z15（外の町）: x ${x0}〜${x1}・y ${y0}〜${y1}（${n} 枚・無し ${miss}）`) }
// 2. PLATEAU
const cat = JSON.parse(fs.readFileSync(`${D}/plateau-catalog.json`, 'utf8'))
const bb = rect(0), rad = (d) => (d * Math.PI) / 180
const inter = (reg) => !(reg[2] < rad(bb.w) || reg[0] > rad(bb.e) || reg[3] < rad(bb.s) || reg[1] > rad(bb.n))
const list = []
for (const w of ['北区', '上京区', '左京区', '中京区', '東山区', '下京区', '南区', '右京区']) {
  const d = (cat.datasets || cat).find((d) => d.type_en === 'bldg' && String(d.year) === '2025' && d.ward === w && String(d.ward_code || '').startsWith('261') && String(d.lod) === '2' && String(d.texture) === 'false')
  if (!d) { log.push(`PLATEAU ${w}: 見つからない`); continue }
  const base = d.url.replace(/tileset\.json$/, ''), tsFile = `${D}/bldg/${d.ward_code}-tileset.json`
  await dl(d.url, tsFile)
  const ts = JSON.parse(fs.readFileSync(tsFile, 'utf8')), picks = []
  ;(function walk(t, depth) { if (!inter(t.boundingVolume.region)) return; if (t.content) picks.push({ uri: t.content.uri || t.content.url, depth, leaf: !(t.children && t.children.length) }); for (const c of t.children || []) walk(c, depth + 1) })(ts.root, 0)
  let bytes = 0
  for (const p of picks) { const f = `${D}/bldg/${d.ward_code}-${p.uri.replace(/[\/]/g, '_')}`; await dl(base + p.uri, f); bytes += fs.statSync(f).size; p.file = f }
  list.push({ ward: w, code: d.ward_code, url: d.url, tiles: picks })
  log.push(`PLATEAU ${w}（${d.ward_code}）: 外の町に掛かるタイル ${picks.length}（末端 ${picks.filter((p) => p.leaf).length}）・${(bytes / 1e6).toFixed(1)}MB`)
}
fs.writeFileSync(`${OUT}/bldg-list.json`, JSON.stringify(list, null, 1))
// 3. OpenStreetMap（外の町）
const ob = rect(150), B = `(${ob.s},${ob.w},${ob.n},${ob.e})`
const q = `[out:json][timeout:180];(
way["natural"="water"]${B};relation["natural"="water"]${B};way["waterway"]${B};
way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|footway|path|cycleway|steps)$"]${B};
way["railway"~"^(rail|light_rail|tram|subway)$"]${B};
way["landuse"~"^(forest|grass|recreation_ground|cemetery|meadow|religious)$"]${B};relation["landuse"="forest"]${B};way["natural"~"^(wood|scrub|water)$"]${B};relation["natural"="wood"]${B};
way["leisure"~"^(park|garden|pitch|playground)$"]${B};relation["leisure"~"^(park|garden)$"]${B};node["natural"="tree"]${B};way["natural"="tree_row"]${B};
nwr["amenity"="place_of_worship"]${B};nwr["tourism"~"^(attraction|museum|viewpoint)$"]${B};nwr["historic"]${B};way["building"]["name"]${B};relation["building"]["name"]${B};
way["man_made"="tower"]${B};node["man_made"="tower"]${B};way["bridge"="yes"]${B};
);out body geom;`
if (!fs.existsSync(`${OUT}/osm.json`)) {
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
log.push(`OpenStreetMap（外の町・Overpass・${new Date().toISOString().slice(0, 10)}）: 要素 ${osm.elements.length}・${(fs.statSync(`${OUT}/osm.json`).size / 1e6).toFixed(1)}MB`)
fs.writeFileSync(`${OUT}/fetch-log.txt`, log.join('\n') + '\n')
console.log(log.join('\n'))
