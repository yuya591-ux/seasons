// 便9 の全テスト: ビルド・スモーク・便6 の検査（KT・KG を除く11本。GPU の時間は便7 から GS・GG で測る）・便7 の GS GG を順に回す。
// 使い方: 開発サーバー 4963（今のコード）と 4964（前のコード 638da84）を起動してから  node scripts/qa-bin9-all.mjs
//   zentest で包む: node ~/.claude/skills/_shared/zentest.mjs --end "全テストの終わり" --count "全テストの終わり: (\d+)/" -- node scripts/qa-bin9-all.mjs
import { spawnSync } from 'node:child_process'

const OUT = 'docs/qa/2026-10-14_便9/gate/final'
const steps = [
  { name: 'ビルド', cmd: 'npm', args: ['run', 'build'] },
  { name: 'スモーク', cmd: 'npm', args: ['run', 'smoke'] },
  ...['G0', 'T1', 'T2', 'T3', 'S1', 'S2', 'S3', 'S4', 'FL', 'G1', 'K5'].map((id) => ({ name: `便6 ${id}`, cmd: 'node', args: ['scripts/qa-bin6.mjs', id], env: { QA_OUT: OUT } })),
  ...['GS', 'GG'].map((id) => ({ name: `便7 ${id}`, cmd: 'node', args: ['scripts/qa-bin7.mjs', id], env: { QA_OUT: OUT } })),
]
let pass = 0
for (const s of steps) {
  const t0 = Date.now()
  const r = spawnSync(s.cmd, s.args, { env: { ...process.env, ...(s.env || {}) }, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 })
  const ok = r.status === 0
  if (ok) pass++
  const last = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-1)[0] || ''
  console.log(`${s.name} ${ok ? '合格' : '不合格'}（${((Date.now() - t0) / 1000).toFixed(0)}秒） ${last.slice(0, 200)}`)
}
console.log(`全テストの終わり: ${pass}/${steps.length} 合格`)
process.exit(pass === steps.length ? 0 : 1)
