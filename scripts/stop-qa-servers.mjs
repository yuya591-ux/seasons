// 便22（再発防止）: seasons の手元の確かめ用のサーバー（vite preview・vite の開発用）を止める。便の終わりに回す（CLAUDE.md の「便の回し方」）
//   止める物: node の処理のうち、vite の preview か開発用（--port 49xx・4970）で、この案件のフォルダか前の版を取り出した作業フォルダ（_tmp_binNN_mae・TEMP の bNNmae）の vite の物と、それを立てた npx
//   止めない物: ほかの案件（三日月など）の vite・firebase など。--keep 4961,4962 で残す番号を渡せる
//   使い方: node scripts/stop-qa-servers.mjs [--keep 4961,4962] [--dry]   （--dry は止めずに一覧だけ）
// 根拠: 2026-11-05 便22。便18〜21 で立てた preview が 8 組（約 900MB）残り、全テストがメモリ不足で止められた（裕也さん「seasons だけ裏の処理がずっと残る」）
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const args = process.argv.slice(2)
const keep = new Set((args[args.indexOf('--keep') + 1] && args.includes('--keep') ? args[args.indexOf('--keep') + 1] : '').split(',').filter(Boolean))
const dry = args.includes('--dry')
const repo = path.resolve('.').toLowerCase().replace(/\//g, '\\')
const ps = 'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'
let list = []
try { list = JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }) || '[]') } catch (e) { console.log('処理の一覧を取れなかった:', e.message); process.exit(1) }
if (!Array.isArray(list)) list = [list]
const mine = list.filter((p) => {
  const c = String(p.CommandLine || ''), lc = c.toLowerCase()
  if (!/vite/.test(lc) || p.ProcessId === process.pid) return false
  const m = c.match(/--port (\d+)/); const port = m ? m[1] : ''
  if (!/^(49\d\d|4970)$/.test(port) || keep.has(port)) return false
  const isMineVite = lc.includes(repo + '\\node_modules') || /_tmp_bin\d+_mae|\\temp\\b\d+mae\\|\\scratchpad\\b\d+mae\\/.test(lc)
  const isNpx = /npx-cli\.js"? vite( preview)? --port/.test(lc) // 立てた npx（場所を持たない＝番号で見る）
  return isMineVite || isNpx
})
for (const p of mine) {
  const port = (String(p.CommandLine).match(/--port (\d+)/) || [])[1]
  if (dry) { console.log(`止める候補: ${p.ProcessId}（番号 ${port}）`); continue }
  try { process.kill(p.ProcessId); console.log(`止めた: ${p.ProcessId}（番号 ${port}）`) } catch (e) { console.log(`止められなかった: ${p.ProcessId}（${e.code || e.message}）`) }
}
console.log(`${dry ? '候補' : '止めた'}の数: ${mine.length}${keep.size ? `（残した番号 ${[...keep].join('・')}）` : ''}`)
