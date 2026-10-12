// 便2 の外し回し: 直しを1件ずつ外し（直す前の書き方へ戻し）、その行の検査が落ちるかを確かめる（qa-gate §3 (5-後)・§10-4 の4）。
// 本体の作業ツリーは触らない。コミット済みの状態を別の作業ツリー（../seasons-mut）に出し、そこで外して戻す。
// 使い方: node scripts/qa-bin2-mutate.mjs <群…|名前…|all>
//   前提: ../seasons-mut がこのリポジトリの HEAD を指す作業ツリーで、開発サーバーを 4958 で動かしている（下の ensure が用意する）
// 記録: docs/qa/2026-10-12_便2/gate/mutate2.json（1件ごとに { name, check, caught, failed }）
import fs from 'node:fs'
import path from 'node:path'
import { execSync, spawnSync } from 'node:child_process'
import { MUTANTS } from './qa-bin2-mutants.mjs'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
const { assertCleanTree } = await import(pathToFileURL(path.join(os.homedir(), '.claude/skills/_shared/clean-tree.mjs')).href)

const MAIN = process.cwd()
const WT = path.resolve(MAIN, '../seasons-mut')
const PORT = 4958
const OUT = path.join(MAIN, 'docs/qa/2026-10-12_便2/gate')
const REC = path.join(OUT, 'mutate2.json')
const sh = (cmd, cwd = MAIN) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()

// 外し回しの前に、本体の作業ツリーの外し回しで使う道に変更が無いことを確かめる（コミットしてから外す・Syncover 便54 の教訓・qa-gate §10-4 の4）
try { assertCleanTree(MAIN, ['src', 'public', 'vite.config.js', 'scripts/qa-bin2.mjs', 'scripts/qa-bin2-mutants.mjs', 'docs/qa/2026-07-31_残タスク台帳.md']) } catch (e) { console.error('止めた: ' + e.message); process.exit(2) }
const head = sh('git rev-parse HEAD')
if (!fs.existsSync(WT)) { sh(`git worktree add -q "${WT}" ${head}`); spawnSync('cmd', ['/c', 'mklink', '/J', path.join(WT, 'node_modules'), path.join(MAIN, 'node_modules')]) }
sh(`git checkout -q --detach ${head}`, WT)
if (sh('git status --porcelain', WT).replace(/^\?\? node_modules\/?$/m, '').trim()) { console.error('外し回しの作業ツリーが汚れている'); process.exit(2) }
// 開発サーバー（4958）が動いているか
async function up() { try { const r = await fetch(`http://localhost:${PORT}/seasons/`); return r.ok } catch { return false } }
if (!(await up())) { console.error(`外し回しの作業ツリーで開発サーバーを動かす: cd ../seasons-mut && npx vite --port ${PORT} --strictPort`); process.exit(2) }

const want = process.argv.slice(2)
const list = MUTANTS.filter((m) => !want.length || want.includes('all') || want.includes(m.group) || want.includes(m.name))
const rec = fs.existsSync(REC) ? JSON.parse(fs.readFileSync(REC, 'utf8')) : { runs: [] }
const results = []
for (const m of list) {
  // 外す（直す前の書き方へ戻す）。一致がちょうど1件でなければ、外し方の書き違いとして記録する
  let bad = null
  for (const e of m.edits) {
    const f = path.join(WT, e.file)
    const raw = fs.readFileSync(f, 'utf8'); const crlf = /\r\n/.test(raw); let s = crlf ? raw.replace(/\r\n/g, '\n') : raw
    const n = s.split(e.find).length - 1
    if (n !== 1) { bad = `${e.file} で一致が ${n} 件: ${e.find.slice(0, 60)}`; break }
    s = s.replace(e.find, () => e.to)
    fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s)
  }
  let caught = null, failed = [], out = ''
  if (!bad) {
    if (m.build) spawnSync('npx', ['vite', 'build'], { cwd: WT, shell: true, stdio: 'ignore' })
    await new Promise((r) => setTimeout(r, 1500)) // 開発サーバーが書き換えを拾う間
    const r = spawnSync('node', [path.join(MAIN, 'scripts/qa-bin2.mjs'), ...m.checks], { cwd: WT, shell: false, env: { ...process.env, QA_BASE: `http://localhost:${PORT}/seasons/`, QA_OUT: path.join(OUT, 'mutate-runs', m.name) }, encoding: 'utf8', timeout: 900000 })
    out = (r.stdout || '') + (r.stderr || '')
    failed = out.split('\n').filter((l) => / 不合格/.test(l)).map((l) => l.trim())
    caught = failed.length > 0
  }
  // 戻す（作業ツリーを HEAD へ）
  sh('git checkout -q -- .', WT)
  if (m.build) spawnSync('npx', ['vite', 'build'], { cwd: WT, shell: true, stdio: 'ignore' })
  const left = sh('git diff --stat', WT)
  const row = { name: m.name, group: m.group, what: m.what, checks: m.checks, caught, failed, bad, restored: left === '' }
  results.push(row)
  console.log(`${m.name}: ${bad ? '外し方の書き違い ' + bad : caught ? '落ちた（結び付いている）' : '落ちなかった'} ${failed.join(' / ')}`)
}
rec.runs.push({ at: new Date().toISOString(), commit: head.slice(0, 7), results })
fs.writeFileSync(REC, JSON.stringify(rec, null, 1))
const c = results.filter((r) => r.caught === true).length, nc = results.filter((r) => r.caught === false).length, b = results.filter((r) => r.bad).length
console.log(`外し回しの終わり: 落ちた ${c}／落ちなかった ${nc}／書き違い ${b}（${results.length}件）`)
process.exit(nc || b ? 1 : 0)
