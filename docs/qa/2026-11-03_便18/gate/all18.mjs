// 便18 の全テスト: ビルド・スモーク（33情景・出典の照らし）・便18 の検査 K1〜K7・前後の画素の差（谷戸と前の角部屋＝鴨川の時だけ分かれる直しが、ほかの情景を変えていない）
// 前に: 今のコードの vite preview を 4961、復元地点 fce9a16 の作業フォルダの vite preview を 4986 に立てる
// zentest で包む: node ~/.claude/skills/_shared/zentest.mjs --end "全テストの終わり" --count "全テストの終わり: (\d+)/" -- node docs/qa/2026-11-03_便18/gate/all18.mjs
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
const OUT = 'docs/qa/2026-11-03_便18/shots/ma'
const sh = (scene, name, port, extra = []) => ({ name: `撮る ${name}`, cmd: 'node', args: ['scripts/kamo/shot.mjs', 'pc', scene, name, '', '', 'close', ...extra], env: { SAME: '1', PORT: String(port), QA_OUT: OUT } })
const sa = (names, limit) => ({ name: `前後の画素の差 ${names.join('・')}（${limit}% 未満）`, cmd: 'node', args: ['docs/qa/2026-11-03_便18/gate/sa.mjs', ...names], check: (out) => [...out.matchAll(/差が 8 を超える画素 ([\d.]+)%/g)].every((m) => +m[1] < limit) })
const steps = [
  { name: 'ビルド', cmd: 'npm', args: ['run', 'build'] },
  { name: 'スモーク', cmd: 'npm', args: ['run', 'smoke'] },
  { name: '便18 K1〜K7', cmd: 'node', args: ['scripts/kamo/kensa.mjs'] },
  sh('shishigaya-window-3d', 'all-yato-mae', 4986), sh('shishigaya-window-3d', 'all-yato-ato', 4961),
  sh('autumn-dusk-corner-room', 'all-corner-mae', 4986), sh('autumn-dusk-corner-room', 'all-corner-ato', 4961, ['kamo=0']),
  sa(['all-yato', 'all-corner'], 0.3),
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
