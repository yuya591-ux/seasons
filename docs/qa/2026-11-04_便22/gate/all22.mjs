// 便22 の全テスト（便21 の all21 を写した）: ビルド・スモーク（34情景・出典の照らし）・鴨川の検査 K1〜K37・音の確かめ A1〜A5（開発用のサーバー）・前後の画素の差
//   前後の差は、鴨川の時だけ分かれる直しが、ほかの情景（谷戸・北寺尾の窓辺・北寺尾の空・前の角部屋）を変えていないかを見る
//   【便20】便19 の範囲外「今どうしの揺れが回ごとに大きく違う（2枚だけの揺れの幅では比べにならない）」を受けて、揺れを2組（ato と ato2・ato と ato3）でとり、大きい方の揺れで比べる
// 前に: 今のコードの vite preview を 4961、復元地点 e6c4347（便21 の終わり）の作業フォルダ（../_tmp_bin22_mae）の vite preview を 4962、（開発用のサーバーは音の確かめの段が自分で立てて止める）
// zentest で包む: node ~/.claude/skills/_shared/zentest.mjs --end "全テストの終わり" --count "全テストの終わり: (\d+)/" -- node docs/qa/2026-11-04_便22/gate/all22.mjs
import { spawnSync } from 'node:child_process'
const OUT = 'docs/qa/2026-11-04_便22/shots/ma'
const sh = (scene, name, port, extra = '') => ({ name: `撮る ${name}`, cmd: 'node', args: ['scripts/kamo/shot.mjs', 'pc', scene, name, '', '', 'close', extra], env: { SAME: '1', PORT: String(port), QA_OUT: OUT } })
const shF = (scene, name, port, steps) => ({ name: `撮る ${name}`, cmd: 'node', args: ['docs/qa/2026-11-03_便19/gate/shot19.mjs', 'pc', scene, name, steps], env: { SAME: '1', PORT: String(port), QA_OUT: OUT } })
// 前後の差 ≦ 今どうしの揺れ（2組の大きい方）×2＋0.1%（便18 と同じ決め・揺れの組を1つ足した）
const sa = (names) => ({
  name: `前後の画素の差 ${names.join('・')}（今どうしの揺れ 2 組の大きい方×2＋0.1% 以内）`, cmd: 'node', args: ['docs/qa/2026-11-04_便20/gate/sa20.mjs', ...names.flatMap((n) => [n, n + '-x', n + '-y'])],
  check: (out) => { const v = {}; for (const m of out.matchAll(/^(\S+): 平均の差 [\d.]+\/255・差が 8 を超える画素 ([\d.]+)%/gm)) v[m[1]] = +m[2]; return names.every((n) => n in v && (n + '-x') in v && (n + '-y') in v && v[n] <= Math.max(v[n + '-x'], v[n + '-y']) * 2 + 0.1) },
})
const copyX = (n) => ({ name: `撮る ${n}-x・${n}-y（今どうしの2組）`, cmd: 'node', args: ['-e', `const fs=require('fs');const D='${OUT}/';fs.copyFileSync(D+'${n}-ato.png',D+'${n}-x-mae.png');fs.copyFileSync(D+'${n}-ato2.png',D+'${n}-x-ato.png');fs.copyFileSync(D+'${n}-ato.png',D+'${n}-y-mae.png');fs.copyFileSync(D+'${n}-ato3.png',D+'${n}-y-ato.png')`] })
const FLY = 'fly,pose:0:40:30:0:-0.2,wait:1500' // 北寺尾の空（町の上 40m・奥を向いて少し見下ろす）
const four = (f, scene, n, extra) => [f(scene, n + '-mae', 4962, extra), f(scene, n + '-ato', 4961, extra), f(scene, n + '-ato2', 4961, extra), f(scene, n + '-ato3', 4961, extra), copyX(n)]
const steps = [
  { name: 'ビルド', cmd: 'npm', args: ['run', 'build'] },
  { name: 'スモーク', cmd: 'npm', args: ['run', 'smoke'] },
  { name: '鴨川の検査 K1〜K37', cmd: 'node', args: ['scripts/kamo/kensa.mjs'], env: { PORT: '4961' } },
  { name: '音の確かめ A1〜A5', cmd: 'node', args: ['docs/qa/2026-11-04_便22/gate/audio22-run.mjs'], env: { AUDIO_PORT: '4970' } }, // 開発用のサーバーはこの段の間だけ立てる
  ...four(sh, 'shishigaya-window-3d', 'all-yato', ''),
  ...four(sh, 'kitaterao-window-3d', 'all-kita', ''),
  ...four(shF, 'kitaterao-window-3d', 'all-kitafly', FLY),
  ...four(sh, 'autumn-dusk-corner-room', 'all-corner', 'kamo=0'),
  sa(['all-yato', 'all-kita', 'all-kitafly', 'all-corner']),
]
let pass = 0, n = 0
for (const s of steps) {
  const t0 = Date.now()
  // node は shell を通さない（Windows で shell を通すと空の引数 '' が落ちる＝便18 の1回目の全テスト）
  const r = spawnSync(s.cmd, s.args, { env: { ...process.env, ...(s.env || {}) }, encoding: 'utf8', shell: process.platform === 'win32' && s.cmd === 'npm', maxBuffer: 256 * 1024 * 1024 })
  const out = (r.stdout || '') + (r.stderr || '')
  const ok = r.status === 0 && (!s.check || s.check(out))
  if (!s.name.startsWith('撮る ')) { n++; if (ok) pass++ } else if (!ok) n++ // 撮るだけの段は、落ちた時だけ数える
  const last = out.trim().split('\n').filter((l) => !/DEP0190|trace-deprecation/.test(l)).slice(-(s.name.startsWith('前後') ? 12 : s.name.startsWith('鴨川') ? 40 : s.name.startsWith('音') ? 7 : 2)).join(' ／ ')
  console.log(`${s.name} ${ok ? '合格' : '不合格'}（${((Date.now() - t0) / 1000).toFixed(0)}秒） ${last.slice(0, 4000)}`)
}
console.log(`全テストの終わり: ${pass}/${n} 合格`)
process.exit(pass === n ? 0 : 1)
