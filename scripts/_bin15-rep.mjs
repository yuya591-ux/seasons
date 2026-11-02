// 便15 の作業用: 行末（CRLF）をそろえてから、置き換えの組を1か所ずつ当てる。各「前」はちょうど1回だけ現れること
// 使い方: node scripts/_bin15-rep.mjs <ファイル> <組の JSON ファイル>  （JSON は [[前, 後], …]。前の中の \n は行末として読む）
import fs from 'node:fs'
const [f, j] = process.argv.slice(2)
const raw = fs.readFileSync(f, 'utf8'), crlf = raw.includes('\r\n')
let s = raw.replace(/\r\n/g, '\n')
for (const [a, b] of JSON.parse(fs.readFileSync(j, 'utf8'))) {
  const n = s.split(a).length - 1
  if (n !== 1) { console.error(`${f}: 1つに決まらない（${n}回）: ${a.slice(0, 80)}`); process.exit(1) }
  s = s.replace(a, () => b)
}
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log(`${f}: ${JSON.parse(fs.readFileSync(j, 'utf8')).length} 組を当てた`)
