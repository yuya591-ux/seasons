// 便13 の全テスト: ビルド・スモーク・便6 の検査（KT・KG を除く11本）・便11 の検査（K1〜K7）・町の乱数の順の確かめ（茶の間の後を足した控え）・
// 便13 の検査（K1〜K16）・重さ（物差しの確かめ＝同じコードどうし・元の形 638da84 と、昼・雨の夜・谷戸・角部屋の窓辺）を順に回す。
// 使い方: 開発サーバー 4982（今のコード・scripts/_bin13-vite.config.mjs）・4984（元の形 638da84・同じ設定）と、
//   4967（便13 の前 a87b747）・4968（今のコード）を scripts/_bin13r-vite.config.mjs で起動してから  node scripts/qa-bin13-all.mjs
//   zentest で包む: node ~/.claude/skills/_shared/zentest.mjs --end "全テストの終わり" --count "全テストの終わり: (\d+)/" -- node scripts/qa-bin13-all.mjs
import { spawnSync } from 'node:child_process'

const OUT = 'docs/qa/2026-10-20_便13/gate/final'
const NOW = 'http://localhost:4982/seasons/', ORIG = 'http://localhost:4984/seasons/'
const gg = (name, scene) => ({ name: `重さ ${name}（元の形と）`, cmd: 'node', args: ['scripts/_bin12-measure3d.mjs', 'GG'], env: { QA_OUT: `${OUT}/gg-${name}`, QA_SCENE: scene, QA_VIEWS: 'window', QA_BASE: NOW, QA_BASE_BEFORE: ORIG } })
const steps = [
  { name: 'ビルド', cmd: 'npm', args: ['run', 'build'] },
  { name: 'スモーク', cmd: 'npm', args: ['run', 'smoke'] },
  ...['G0', 'T1', 'T2', 'T3', 'S1', 'S2', 'S3', 'S4', 'FL', 'G1', 'K5'].map((id) => ({ name: `便6 ${id}`, cmd: 'node', args: ['scripts/qa-bin6.mjs', id], env: { QA_OUT: OUT, QA_BASE: NOW, QA_BASE_BEFORE: ORIG } })),
  { name: '便11 K1〜K7', cmd: 'node', args: ['scripts/_bin11-kensa.mjs', 'all'], env: { QA_OUT: OUT, B11_PORT: '4982' } },
  { name: '町の乱数の順（茶の間の後まで）', cmd: 'node', args: ['scripts/_bin11-rcheck.mjs', 'kitaterao-window-3d', 'kitaterao-window-3d-rain-night', 'autumn-dusk-corner-room', 'shishigaya-window-3d', 'shishigaya-window-3d-snow'], env: { QA_OUT: OUT } },
  { name: '便13 K1〜K16', cmd: 'node', args: ['scripts/_bin13-kensa.mjs', 'all'], env: { QA_OUT: OUT } },
  { name: '重さの物差しの確かめ（雨の夜の窓辺・元の形どうし）', cmd: 'node', args: ['scripts/_bin12-measure3d.mjs', 'GS'], env: { QA_OUT: `${OUT}/gs-night`, QA_SCENE: 'kitaterao-window-3d-rain-night', QA_VIEWS: 'window', QA_BASE: NOW, QA_BASE_BEFORE: ORIG } },
  gg('昼の窓辺', 'kitaterao-window-3d'),
  gg('雨の夜の窓辺', 'kitaterao-window-3d-rain-night'),
  gg('谷戸の窓辺', 'shishigaya-window-3d'),
  gg('角部屋の窓辺', 'autumn-dusk-corner-room'),
]
let pass = 0
for (const s of steps) {
  const t0 = Date.now()
  const r = spawnSync(s.cmd, s.args, { env: { ...process.env, ...(s.env || {}) }, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 })
  const ok = r.status === 0
  if (ok) pass++
  const last = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').filter((l) => !/DEP0190|trace-deprecation/.test(l)).slice(-1)[0] || ''
  console.log(`${s.name} ${ok ? '合格' : '不合格'}（${((Date.now() - t0) / 1000).toFixed(0)}秒） ${last.slice(0, 200)}`)
}
console.log(`全テストの終わり: ${pass}/${steps.length} 合格`)
process.exit(pass === steps.length ? 0 : 1)
