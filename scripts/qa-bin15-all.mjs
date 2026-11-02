// 便15 の全テスト: ビルド・スモーク（出典の照らし・舞台の数・町→町・情景パネルを含む）・便15 の検査（A〜F の全部）・便13 K1〜K16・便11 K1〜K7・
// 町の乱数の順（復元地点と今）・重さ（物差しの確かめ＝同じコードどうし・復元地点 35a5cb6 と今の、昼と雨の夜の窓辺）を順に回す。
// 使い方: 開発サーバーを起動してから  node scripts/qa-bin15-all.mjs
//   4985 今のコード（scripts/_bin15-vite.config.mjs）／ 4982 今のコード・4984 復元地点の作業フォルダ（scripts/_bin13-vite.config.mjs・B13_PORT）／
//   4967 復元地点・4968 今のコード（scripts/_bin13r-vite.config.mjs・B11_PORT）
//   zentest で包む: node ~/.claude/skills/_shared/zentest.mjs --end "全テストの終わり" --count "全テストの終わり: (\d+)/" -- node scripts/qa-bin15-all.mjs
// 便13 の全テストにあった便6 の G0〜K5・G1 もそのまま入れる（前のコードのサーバーを使うのは KT だけで、便13 から KT・KG は外してある）。
// 重さは便13 と同じ台本（_bin12-measure3d.mjs）で、比べる相手を復元地点（35a5cb6）にした
import { spawnSync } from 'node:child_process'

const OUT = 'docs/qa/2026-11-02_便15/gate/final'
const NOW = 'http://localhost:4982/seasons/', BEFORE = 'http://localhost:4984/seasons/'
const gg = (name, scene) => ({ name: `重さ ${name}（復元地点と）`, cmd: 'node', args: ['scripts/_bin12-measure3d.mjs', 'GG'], env: { QA_OUT: `${OUT}/gg-${name}`, QA_SCENE: scene, QA_VIEWS: 'window', QA_BASE: NOW, QA_BASE_BEFORE: BEFORE } })
const steps = [
  { name: 'ビルド', cmd: 'npm', args: ['run', 'build'] },
  { name: 'スモーク', cmd: 'npm', args: ['run', 'smoke'] },
  ...['G0', 'T1', 'T2', 'T3', 'S1', 'S2', 'S3', 'S4', 'FL', 'K5'].map((id) => ({ name: `便6 ${id}`, cmd: 'node', args: ['scripts/qa-bin6.mjs', id], env: { QA_OUT: OUT, QA_BASE: NOW, QA_BASE_BEFORE: BEFORE } })),
  { name: '便6 G1（便13 の基準）', cmd: 'node', args: ['scripts/qa-bin6.mjs', 'G1'], env: { QA_OUT: OUT, QA_BASE: NOW, QA_BASE_BEFORE: BEFORE, QA_BEFORE: 'docs/qa/2026-10-20_便13/gate/g1-kijun' } },
  { name: '便15 の検査（A〜F）', cmd: 'node', args: ['scripts/_bin15-kensa.mjs', 'all'], env: { QA_OUT: OUT } },
  { name: '便13 K1〜K16', cmd: 'node', args: ['scripts/_bin13-kensa.mjs', 'all'], env: { QA_OUT: OUT } },
  { name: '便11 K1〜K7', cmd: 'node', args: ['scripts/_bin11-kensa.mjs', 'all'], env: { QA_OUT: OUT, B11_PORT: '4982' } },
  { name: '町の乱数の順（復元地点と今）', cmd: 'node', args: ['scripts/_bin11-rcheck.mjs', 'kitaterao-window-3d', 'kitaterao-window-3d-rain-night', 'autumn-dusk-corner-room', 'shishigaya-window-3d', 'shishigaya-window-3d-snow'], env: { QA_OUT: OUT } },
  { name: '重さの物差しの確かめ（雨の夜の窓辺・復元地点どうし）', cmd: 'node', args: ['scripts/_bin12-measure3d.mjs', 'GS'], env: { QA_OUT: `${OUT}/gs-night`, QA_SCENE: 'kitaterao-window-3d-rain-night', QA_VIEWS: 'window', QA_BASE: NOW, QA_BASE_BEFORE: BEFORE } },
  gg('昼の窓辺', 'kitaterao-window-3d'),
  gg('雨の夜の窓辺', 'kitaterao-window-3d-rain-night'),
]
let pass = 0
for (const s of steps) {
  const t0 = Date.now()
  const r = spawnSync(s.cmd, s.args, { env: { ...process.env, ...(s.env || {}) }, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 })
  const ok = r.status === 0
  if (ok) pass++
  const last = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').filter((l) => !/DEP0190|trace-deprecation/.test(l)).slice(-1)[0] || ''
  console.log(`${s.name} ${ok ? '合格' : '不合格'}（${((Date.now() - t0) / 1000).toFixed(0)}秒） ${last.slice(0, 220)}`)
}
console.log(`全テストの終わり: ${pass}/${steps.length} 合格`)
process.exit(pass === steps.length ? 0 : 1)
