// 便15 の作業用: ファイルの中の「始まりの文字列を含む行」から「終わりの文字列を含む行」までを1か所だけ消す（どちらも1回だけ現れること）
// 使い方: node scripts/_bin15-cut.mjs <ファイル> <始まり> <終わり>
import fs from 'node:fs'
const [f, a, z] = process.argv.slice(2)
const lines = fs.readFileSync(f, 'utf8').split('\n')
const ia = lines.map((l, i) => (l.includes(a) ? i : -1)).filter((i) => i >= 0)
if (ia.length !== 1) { console.error('始まりが1つに決まらない', ia.length); process.exit(1) }
const iz = lines.map((l, i) => (i >= ia[0] && l.includes(z) ? i : -1)).filter((i) => i >= 0)
if (!iz.length) { console.error('終わりが無い'); process.exit(1) }
const n = iz[0] - ia[0] + 1
lines.splice(ia[0], n)
fs.writeFileSync(f, lines.join('\n'))
console.log(`${f}: ${ia[0] + 1} 行目から ${n} 行を消した`)
