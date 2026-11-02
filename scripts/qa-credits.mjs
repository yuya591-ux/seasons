// 出典の照らし（便15 U1・S1〜S3 の守り）: アプリ内の出典（src/data/credits.js）を、情景データの sounds[].src と CREDITS.md から照らす。
//   1. 情景で鳴らす音の素材が、アプリ内の出典に全部ある（S1 鈴虫の表示漏れ）
//   2. アプリ内の出典に、どの情景も鳴らさない音が無い（S3 使っていない油蝉・カラス）
//   3. アプリ内の出典の各行の出典URLが、CREDITS.md のそのファイルの行の出典URLと同じ（S2 差し替え前のウグイス）
//   4. 情景で使う背景の画像（bg）が CREDITS.md にあり、CREDITS.md に載る public/ のファイルが実在する
// 使い方: node scripts/qa-credits.mjs   （npm run smoke の頭でも回る）。1つでも外れたら exit 1
import fs from 'node:fs'
import { SCENES } from '../src/data/scenes/index.js'
import { CREDIT_SOUNDS } from '../src/data/credits.js'

const md = fs.readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8')
const bad = []
const used = new Set()
const usedBg = new Set()
for (const s of SCENES) {
  if (s.status !== 'ready') continue
  for (const snd of s.sounds || []) if (snd.src) used.add(snd.src.replace(/^audio\//, ''))
  if (s.bg) usedBg.add(s.bg)
}
const credited = new Set(CREDIT_SOUNDS.map((c) => c.file))
for (const f of used) if (!credited.has(f)) bad.push(`アプリ内の出典に無い音: ${f}`)
for (const c of CREDIT_SOUNDS) if (!used.has(c.file)) bad.push(`どの情景も鳴らさない音がアプリ内の出典にある: ${c.file}`)
// CREDITS.md の表の行: | レイヤー | `file.mp3` | 作品 | ライセンス | 出典 |。節の見出しの public/audio/<dir>/ と組にして読む
let dir = ''
const mdRows = new Map()
for (const line of md.split('\n')) {
  const h = line.match(/`public\/audio\/([^`/]+)\/`/)
  if (h) dir = h[1]
  const r = line.match(/^\|[^|]*\|\s*`([^`]+\.mp3)`\s*\|(.*)\|\s*(\S+)\s*\|\s*$/)
  if (r && dir) mdRows.set(`${dir}/${r[1]}`, r[3])
}
for (const c of CREDIT_SOUNDS) {
  const u = mdRows.get(c.file)
  if (!u) bad.push(`CREDITS.md に行が無い: ${c.file}`)
  else if (u !== c.url) bad.push(`出典URLが CREDITS.md と違う: ${c.file}（アプリ内 ${c.url} ／ CREDITS.md ${u}）`)
}
for (const b of usedBg) if (!md.includes('`public/' + b + '`')) bad.push(`CREDITS.md に無い背景の画像: ${b}`)
for (const m of md.matchAll(/`public\/((?:bg|audio)\/[^`]+\.(?:jpg|png|mp3))`/g)) {
  if (!fs.existsSync(new URL('../public/' + m[1], import.meta.url))) bad.push(`CREDITS.md に載るのに無いファイル: public/${m[1]}`)
}
for (const [k] of mdRows) if (!fs.existsSync(new URL('../public/audio/' + k, import.meta.url))) bad.push(`CREDITS.md に載るのに無い音: public/audio/${k}`)

if (bad.length) {
  console.error(`出典の照らし: 外れ ${bad.length} 件`)
  for (const b of bad) console.error('  ' + b)
  process.exit(1)
}
console.log(`出典の照らし OK: 鳴らす音 ${used.size}・アプリ内の出典 ${credited.size}・CREDITS.md の音の行 ${mdRows.size}・背景の画像 ${usedBg.size}`)
