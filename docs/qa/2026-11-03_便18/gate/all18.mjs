// 便18 の全テスト: ビルド・スモーク（33情景・出典の照らし）・便18 の検査 K1〜K7・前後の画素の差（谷戸と前の角部屋＝鴨川の時だけ分かれる直しが、ほかの情景を変えていない）
// 前に: 今のコードの vite preview を 4961、復元地点 fce9a16 の作業フォルダの vite preview を 4986 に立てる
// zentest で包む: node ~/.claude/skills/_shared/zentest.mjs --end "全テストの終わり" --count "全テストの終わり: (\d+)/" -- node docs/qa/2026-11-03_便18/gate/all18.mjs
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
const OUT = 'docs/qa/2026-11-03_便18/shots/ma'
const sh = (scene, name, port, extra = []) => ({ name: `撮る ${name}`, cmd: 'node', args: ['scripts/kamo/shot.mjs', 'pc', scene, name, '', '', 'close', ...extra], env: { SAME: '1', PORT: String(port), QA_OUT: OUT } })
// 前後の差は、今のコードを2回撮った差（動く物の揺れの幅）と比べる: 前後の差 ≦ 揺れの幅×2＋0.1%
// （便18 の2回目の全テストで、谷戸は同じ撮り方でも 0.02〜0.86% 揺れた＝決め打ちの 0.3% では比べにならなかった）
const sa = (names) => ({
  name: `前後の画素の差 ${names.join('・')}（今どうしの揺れ×2＋0.1% 以内）`, cmd: 'node', args: ['docs/qa/2026-11-03_便18/gate/sa.mjs', ...names.flatMap((n) => [n, n + '-x'])],
  check: (out) => { const v = {}; for (const m of out.matchAll(/^(\S+): 平均の差 [\d.]+\/255・差が 8 を超える画素 ([\d.]+)%/gm)) v[m[1]] = +m[2]; return names.every((n) => n in v && (n + '-x') in v && v[n] <= v[n + '-x'] * 2 + 0.1) },
})
// 今どうしの比べの画（-x-mae＝後の1枚目・-x-ato＝後の2枚目）を写す
const copyX = (n) => ({ name: `撮る ${n}-x（今どうしの組）`, cmd: 'node', args: ['-e', `const fs=require('fs');const D='${OUT}/';fs.copyFileSync(D+'${n}-ato.png',D+'${n}-x-mae.png');fs.copyFileSync(D+'${n}-ato2.png',D+'${n}-x-ato.png')`] })
const steps = [
  { name: 'ビルド', cmd: 'npm', args: ['run', 'build'] },
  { name: 'スモーク', cmd: 'npm', args: ['run', 'smoke'] },
  { name: '便18 K1〜K7', cmd: 'node', args: ['scripts/kamo/kensa.mjs'] },
  sh('shishigaya-window-3d', 'all-yato-mae', 4986), sh('shishigaya-window-3d', 'all-yato-ato', 4961), sh('shishigaya-window-3d', 'all-yato-ato2', 4961), copyX('all-yato'),
  sh('autumn-dusk-corner-room', 'all-corner-mae', 4986), sh('autumn-dusk-corner-room', 'all-corner-ato', 4961, ['kamo=0']), sh('autumn-dusk-corner-room', 'all-corner-ato2', 4961, ['kamo=0']), copyX('all-corner'),
  sa(['all-yato', 'all-corner']),
]
let pass = 0, n = 0
for (const s of steps) {
  const t0 = Date.now()
  // node は shell を通さない（Windows で shell を通すと空の引数 '' が落ち、撮る段の窓と kamo=0 の引数がずれた＝便18 の1回目の全テスト）
  const r = spawnSync(s.cmd, s.args, { env: { ...process.env, ...(s.env || {}) }, encoding: 'utf8', shell: process.platform === 'win32' && s.cmd === 'npm', maxBuffer: 256 * 1024 * 1024 })
  const out = (r.stdout || '') + (r.stderr || '')
  const ok = r.status === 0 && (!s.check || s.check(out))
  if (!s.name.startsWith('撮る ')) { n++; if (ok) pass++ } else if (!ok) n++ // 撮るだけの段は、落ちた時だけ数える
  const last = out.trim().split('\n').filter((l) => !/DEP0190|trace-deprecation/.test(l)).slice(-2).join(' ／ ')
  console.log(`${s.name} ${ok ? '合格' : '不合格'}（${((Date.now() - t0) / 1000).toFixed(0)}秒） ${last.slice(0, 260)}`)
}
void fs
console.log(`全テストの終わり: ${pass}/${n} 合格`)
process.exit(pass === n ? 0 : 1)
