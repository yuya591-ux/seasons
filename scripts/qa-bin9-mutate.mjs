// 便9 の外し回し: 案1（便8 #1=1）の直しを1件ずつ外して（ファイルの中の1か所を便6 の形へ書き換えて）、その行の検査が落ちるかを確かめる。qa-bin6-mutate.mjs の写し。
// 使い方: 開発サーバー 4963（_bin6-vite.config.mjs）と前のコードの 4964 を起動し、直しをコミットしてから  node scripts/qa-bin9-mutate.mjs [名前…]
// 記録: docs/qa/2026-10-14_便9/gate/mutate9.json（直しごとに { name, check, caught, out }）。外した後は git checkout HEAD -- <道> で戻す
import fs from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { assertCleanTree } from '../../../.claude/skills/_shared/clean-tree.mjs'

const V = 'src/engine/town3dViewer.js', P = 'src/engine/surfacePattern.js'
const B6 = 'scripts/qa-bin6.mjs', B7 = 'scripts/qa-bin7.mjs'
const CARDS_NOW = 'const leafCards = false //'
const M = [
  // 書き換えた T2 が守る物（§3 (5-書)）
  { name: 'T2-cards（縁の葉の板を便6 の形に戻す）', check: 'T2', script: B6, file: V, from: CARDS_NOW, to: 'const leafCards = !LIGHT //' },
  { name: 'T2-atlas（葉の画を外す）', check: 'T2', script: B6, file: V, from: 'map: leafAtlas, alphaTest', to: 'map: null, alphaTest' },
  // 書き換えた S3 が守る物（地面の模様）
  { name: 'S3-ground（地面の模様を外す）', check: 'S3', script: B6, file: V, from: '    applySurfacePattern(gm, SURF.ground)', to: '    void SURF.ground' },
  // この便の直しが守る重さ（GG）: 片方ずつ便6 の形へ戻すと線を越えるか
  { name: 'GG-fine（面の模様の細かい層を戻す）', check: 'GG', script: B7, file: P, from: '#define SF_FINE 0', to: '#define SF_FINE 1' },
  { name: 'GG-cards（縁の葉の板を戻す）', check: 'GG', script: B7, file: V, from: CARDS_NOW, to: 'const leafCards = !LIGHT //' },
]
const only = process.argv.slice(2)
const list = only.length ? M.filter((m) => only.some((o) => m.name.startsWith(o))) : M
const files = [...new Set(M.map((m) => m.file))]
assertCleanTree(process.cwd(), files)
const DIR = 'docs/qa/2026-10-14_便9/gate'
const OUTF = `${DIR}/mutate9.json`
const prev = only.length && fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, 'utf8')) : []
const out = prev.filter((p) => !list.some((m) => m.name === p.name))
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
// 開発サーバーが配るファイルの中身に、書き換えた文が入るまで待つ（便6 の G0 で、外す前のコードのまま検査が走った回があった）
const served = (file, text, want) => { for (let i = 0; i < 60; i++) { const r = spawnSync('curl', ['-s', `http://localhost:4963/seasons/${file}?t=${Date.now()}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if ((r.stdout || '').includes(text) === want) return true; sleep(1000) } return false }
for (const m of list) {
  const src = fs.readFileSync(m.file, 'utf8')
  const n = src.split(m.from).length - 1
  if (n !== 1) { out.push({ name: m.name, check: m.check, caught: null, note: `外す所が ${n} か所（1か所でない）` }); console.log(`${m.name}: 外す所が ${n} か所`); continue }
  fs.writeFileSync(m.file, src.replace(m.from, () => m.to))
  if (!served(m.file, m.to, true)) { execSync(`git checkout HEAD -- ${m.file}`); out.push({ name: m.name, check: m.check, caught: null, note: '開発サーバーが書き換えを配らなかった' }); console.log(`${m.name}: 配られなかった`); continue }
  sleep(2000)
  const r = spawnSync('node', [m.script, m.check], { env: { ...process.env, QA_OUT: `${DIR}/mutate-runs/${m.name.split('（')[0]}`, QA_SHOT: '' }, encoding: 'utf8' })
  execSync(`git checkout HEAD -- ${m.file}`)
  served(m.file, m.to, false)
  sleep(2000)
  const last = (r.stdout || '').trim().split('\n').slice(-2).join(' / ')
  out.push({ name: m.name, check: m.check, caught: r.status !== 0, out: last })
  console.log(`${m.name}（${m.check}）: ${r.status !== 0 ? '落ちた' : '落ちなかった'} — ${last}`)
}
fs.writeFileSync(OUTF, JSON.stringify(out, null, 1))
const diff = execSync(`git diff --stat -- ${files.join(' ')}`).toString().trim()
console.log(`外し回しの終わり: ${out.filter((o) => o.caught).length}/${out.length} 落ちた。戻した後の差: ${diff || 'なし'}`)
