// 便19 の全テスト（便18 の all18 を引き継ぐ）: ビルド・スモーク（33情景・出典の照らし）・鴨川の検査 K1〜K18・前後の画素の差
//   前後の差は、鴨川の時だけ分かれる直しが、ほかの情景（谷戸・北寺尾の窓辺・北寺尾の空・前の角部屋）を変えていないかを見る
// 前に: 今のコードの vite preview を 4971、復元地点 878d274 の作業フォルダの vite preview を 4972 に立てる
// zentest で包む: node ~/.claude/skills/_shared/zentest.mjs --end "全テストの終わり" --count "全テストの終わり: (\d+)/" -- node docs/qa/2026-11-03_便19/gate/all19.mjs
import { spawnSync } from 'node:child_process'
const OUT = 'docs/qa/2026-11-03_便19/shots/ma'
const sh = (scene, name, port, extra = '') => ({ name: `撮る ${name}`, cmd: 'node', args: ['scripts/kamo/shot.mjs', 'pc', scene, name, '', '', 'close', extra], env: { SAME: '1', PORT: String(port), QA_OUT: OUT } })
const shF = (scene, name, port, steps) => ({ name: `撮る ${name}`, cmd: 'node', args: ['docs/qa/2026-11-03_便19/gate/shot19.mjs', 'pc', scene, name, steps], env: { SAME: '1', PORT: String(port), QA_OUT: OUT } })
// 前後の差は、今のコードを2回撮った差（動く物の揺れの幅）と比べる: 前後の差 ≦ 揺れの幅×2＋0.1%（便18 と同じ決め）
const sa = (names) => ({
  name: `前後の画素の差 ${names.join('・')}（今どうしの揺れ×2＋0.1% 以内）`, cmd: 'node', args: ['docs/qa/2026-11-03_便19/gate/sa19.mjs', ...names.flatMap((n) => [n, n + '-x'])],
  check: (out) => { const v = {}; for (const m of out.matchAll(/^(\S+): 平均の差 [\d.]+\/255・差が 8 を超える画素 ([\d.]+)%/gm)) v[m[1]] = +m[2]; return names.every((n) => n in v && (n + '-x') in v && v[n] <= v[n + '-x'] * 2 + 0.1) },
})
const copyX = (n) => ({ name: `撮る ${n}-x（今どうしの組）`, cmd: 'node', args: ['-e', `const fs=require('fs');const D='${OUT}/';fs.copyFileSync(D+'${n}-ato.png',D+'${n}-x-mae.png');fs.copyFileSync(D+'${n}-ato2.png',D+'${n}-x-ato.png')`] })
const FLY = 'fly,pose:0:40:30:0:-0.2,wait:1500' // 北寺尾の空（町の上 40m・奥を向いて少し見下ろす）
const steps = [
  { name: 'ビルド', cmd: 'npm', args: ['run', 'build'] },
  { name: 'スモーク', cmd: 'npm', args: ['run', 'smoke'] },
  { name: '鴨川の検査 K1〜K18', cmd: 'node', args: ['scripts/kamo/kensa.mjs'], env: { PORT: '4971' } },
  sh('shishigaya-window-3d', 'all-yato-mae', 4972), sh('shishigaya-window-3d', 'all-yato-ato', 4971), sh('shishigaya-window-3d', 'all-yato-ato2', 4971), copyX('all-yato'),
  sh('kitaterao-window-3d', 'all-kita-mae', 4972), sh('kitaterao-window-3d', 'all-kita-ato', 4971), sh('kitaterao-window-3d', 'all-kita-ato2', 4971), copyX('all-kita'),
  shF('kitaterao-window-3d', 'all-kitafly-mae', 4972, FLY), shF('kitaterao-window-3d', 'all-kitafly-ato', 4971, FLY), shF('kitaterao-window-3d', 'all-kitafly-ato2', 4971, FLY), copyX('all-kitafly'),
  sh('autumn-dusk-corner-room', 'all-corner-mae', 4972, 'kamo=0'), sh('autumn-dusk-corner-room', 'all-corner-ato', 4971, 'kamo=0'), sh('autumn-dusk-corner-room', 'all-corner-ato2', 4971, 'kamo=0'), copyX('all-corner'),
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
  const last = out.trim().split('\n').filter((l) => !/DEP0190|trace-deprecation/.test(l)).slice(-(s.name.startsWith('前後') ? 8 : 2)).join(' ／ ')
  console.log(`${s.name} ${ok ? '合格' : '不合格'}（${((Date.now() - t0) / 1000).toFixed(0)}秒） ${last.slice(0, 900)}`)
}
console.log(`全テストの終わり: ${pass}/${n} 合格`)
process.exit(pass === n ? 0 : 1)
