// 便15 の作業用: 行末を LF にそろえて、渡した台本（s を受けて s を返す関数の本体）を当て、CRLF で書き戻す
// 使い方: node scripts/_bin15-ed.mjs <ファイル> <台本.js>   台本の中では one(前, 後)（1回だけ現れること）と all(前, 後) が使える
import fs from 'node:fs'
const [f, j] = process.argv.slice(2)
let s = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const one = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${f}: 1つでない（${n}回）: ${a.slice(0, 70)}`); s = s.replace(a, () => b) }
const all = (a, b) => { s = s.split(a).join(b) }
new Function('one', 'all', fs.readFileSync(j, 'utf8'))(one, all)
fs.writeFileSync(f, s.replace(/\n/g, '\r\n'))
console.log(`${f}: 当てた`)
