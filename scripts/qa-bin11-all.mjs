// 便11 の全テスト: ビルド・スモーク・便6 の検査（KT・KG を除く11本）・便7 の GS GG（窓辺・低空飛行を元の形 638da84 と比べる）・
// 便11 の検査（K1〜K7）・雲の 2×2 の塊・町の乱数の順の確かめ・2D の窓の GS GG・高く飛ぶ眺めの GS と元の形との GG を順に回す。
// 使い方: 開発サーバー 4963（今のコード）・4964（元の形 638da84）・4966（便11 の前 f69e716）を scripts/_bin11-vite.config.mjs で、
//   4967（f69e716）・4968（今のコード）を scripts/_bin11r-vite.config.mjs で起動してから  node scripts/qa-bin11-all.mjs
//   zentest で包む: node ~/.claude/skills/_shared/zentest.mjs --end "全テストの終わり" --count "全テストの終わり: (\d+)/" -- node scripts/qa-bin11-all.mjs
import { spawnSync } from 'node:child_process'

const OUT = 'docs/qa/2026-10-16_便11/gate/final'
const HIGH = '0,130,120,0,95,-10,73.6' // 高く飛ぶ眺め（便10 と同じ）
const steps = [
  { name: 'ビルド', cmd: 'npm', args: ['run', 'build'] },
  { name: 'スモーク', cmd: 'npm', args: ['run', 'smoke'] },
  ...['G0', 'T1', 'T2', 'T3', 'S1', 'S2', 'S3', 'S4', 'FL', 'G1', 'K5'].map((id) => ({ name: `便6 ${id}`, cmd: 'node', args: ['scripts/qa-bin6.mjs', id], env: { QA_OUT: OUT } })),
  ...['GS', 'GG'].map((id) => ({ name: `便7 ${id}`, cmd: 'node', args: ['scripts/qa-bin7.mjs', id], env: { QA_OUT: OUT } })),
  { name: '便11 K1〜K7', cmd: 'node', args: ['scripts/_bin11-kensa.mjs', 'all'], env: { QA_OUT: OUT } },
  { name: '便11 雲の 2×2 の塊', cmd: 'node', args: ['scripts/_bin11-kumo-check.mjs'], env: { QA_OUT: OUT } },
  { name: '便11 乱数の順', cmd: 'node', args: ['scripts/_bin11-rcheck.mjs', 'kitaterao-window-3d', 'kitaterao-window-3d-night', 'kitaterao-window-3d-snow', 'shishigaya-window-3d', 'shishigaya-window-3d-snow'], env: { QA_OUT: OUT } },
  { name: '便11 2D の窓 GS', cmd: 'node', args: ['scripts/_bin11-m2d.mjs', 'GS', '20'], env: { M2D_OUT: `${OUT}/m2d_GS.json` } },
  { name: '便11 2D の窓 GG', cmd: 'node', args: ['scripts/_bin11-m2d.mjs', 'GG', '20'], env: { M2D_OUT: `${OUT}/m2d_GG.json` } },
  { name: '便11 高く飛ぶ GS', cmd: 'node', args: ['scripts/_bin10-measure3d.mjs', 'GS'], env: { QA_OUT: `${OUT}/high`, QA_FLYCAM: HIGH, QA_BASE_BEFORE: 'http://localhost:4964/seasons/' } },
  { name: '便11 高く飛ぶ GG（元の形と）', cmd: 'node', args: ['scripts/_bin10-measure3d.mjs', 'GG'], env: { QA_OUT: `${OUT}/high`, QA_VIEWS: 'fly', QA_FLYCAM: HIGH, QA_BASE: 'http://localhost:4963/seasons/', QA_BASE_BEFORE: 'http://localhost:4964/seasons/' } },
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
