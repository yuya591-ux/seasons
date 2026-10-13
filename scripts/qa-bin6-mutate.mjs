// 便6 の外し回し: 直しを1件ずつ外して（ファイルの中の1か所を前の形へ書き換えて）、その行の検査が落ちるかを確かめる。便4 の qa-bin4-mutate.mjs の写し。
// 使い方: 開発サーバー 4963（_bin6-vite.config.mjs）を起動し、直しをコミットしてから  node scripts/qa-bin6-mutate.mjs [名前…]
// 記録: docs/qa/2026-10-13_便6/gate/mutate6.json（直しごとに { name, check, caught, out }）。外した後は git checkout HEAD -- <道> で戻す
import fs from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { assertCleanTree } from '../../../.claude/skills/_shared/clean-tree.mjs'

const V = 'src/engine/town3dViewer.js', T = 'src/engine/treeCrown.js', P = 'src/engine/surfacePattern.js'
const M = [
  { name: 'G0-rngGuard（守りの確かめ: 木の揺れの R() を1つ減らす）', check: 'G0', file: V, from: 'g.userData = { ph: R() * 6.28, amp: 0.02 + R() * 0.02, tilt }', to: 'g.userData = { ph: R() * 6.28, amp: 0.03, tilt }' },
  { name: 'T1-species（樹種を丸い広葉樹だけに）', check: 'T1', file: T, from: "return pink ? 'kasa' : h < 0.24 ? 'sugi' : h < 0.5 ? 'kasa' : 'maru' }", to: "return 'maru' }" },
  { name: 'T1-tint（木ごとの色の振れを外す）', check: 'T1', file: T, from: 'export function crownTint(x, z, sp) {', to: 'export function crownTint(x, z, sp) { return [1, 1, 1]' },
  { name: 'T2-atlas（葉の画を外す）', check: 'T2', file: V, from: 'map: leafAtlas, alphaTest', to: 'map: null, alphaTest' },
  { name: 'T2-cards（縁の葉の板を外す）', check: 'T2', file: V, from: 'const leafCards = !LIGHT', to: 'const leafCards = false' },
  { name: 'T3-plant（細長い葉の株を部屋に置かない）', check: 'T3', file: V, from: 'plant.renderOrder = 2; winRoom.add(plant) }', to: 'plant.renderOrder = 2 }' },
  { name: 'S1-roof（屋根の模様を外す）', check: 'S1', file: V, from: 'applySurfacePattern(mottleMat(c, 60, 0.13, [3, 2]), ROOF_SURF[i])', to: 'mottleMat(c, 60, 0.13, [3, 2])' },
  { name: 'S2-wall（壁の模様を外す）', check: 'S2', file: V, from: '    applySurfacePattern(wm, SURF.wall)', to: '    void SURF.wall' },
  { name: 'S3-ground（地面の模様を外す）', check: 'S3', file: V, from: '    applySurfacePattern(gm, SURF.ground)', to: '    void SURF.ground' },
  { name: 'S4-road（通りの模様を外す）', check: 'S4', file: V, from: 'applySurfacePattern(snowify(new THREE.MeshToonMaterial({ map: roadTex, gradientMap: grad, vertexColors: true })), SURF.road)', to: 'snowify(new THREE.MeshToonMaterial({ map: roadTex, gradientMap: grad, vertexColors: true }))' },
  { name: 'FL-fade（遠くの細かすぎる模様を消すのを外す）', check: 'FL', file: P, from: 'float sfFade(float c) { return 1.0 - smoothstep(0.35, 0.9, fwidth(c)); }', to: 'float sfFade(float c) { return 1.0; }' },
]
const only = process.argv.slice(2)
const list = only.length ? M.filter((m) => only.some((o) => m.name.startsWith(o))) : M
const files = [...new Set(M.map((m) => m.file))]
assertCleanTree(process.cwd(), files)
const OUTF = 'docs/qa/2026-10-13_便6/gate/mutate6.json'
const prev = only.length && fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, 'utf8')) : []
const out = prev.filter((p) => !list.some((m) => m.name === p.name))
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
// 開発サーバーが配るファイルの中身に、書き換えた文が入るまで待つ（4秒待ちだけでは、外す前のコードのまま検査が走った回があった・便6 の G0）
const served = (file, text, want) => { for (let i = 0; i < 60; i++) { const r = spawnSync('curl', ['-s', `http://localhost:4963/seasons/${file}?t=${Date.now()}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); if ((r.stdout || '').includes(text) === want) return true; sleep(1000) } return false }
for (const m of list) {
  const src = fs.readFileSync(m.file, 'utf8')
  const n = src.split(m.from).length - 1
  if (n !== 1) { out.push({ name: m.name, check: m.check, caught: null, note: `外す所が ${n} か所（1か所でない）` }); console.log(`${m.name}: 外す所が ${n} か所`); continue }
  fs.writeFileSync(m.file, src.replace(m.from, () => m.to))
  const mark = m.to.includes(m.from) ? [m.to, true] : [m.from, false] // 書き換えた文に元の文が含まれる時は、書き換えた文が入ったかで見る
  if (!served(m.file, mark[0], mark[1])) { execSync(`git checkout HEAD -- ${m.file}`); out.push({ name: m.name, check: m.check, caught: null, note: '開発サーバーが書き換えを配らなかった' }); console.log(`${m.name}: 配られなかった`); continue }
  sleep(2000)
  const r = spawnSync('node', ['scripts/qa-bin6.mjs', m.check], { env: { ...process.env, QA_OUT: `docs/qa/2026-10-13_便6/gate/mutate-runs/${m.name.split('（')[0]}`, QA_SHOT: '' }, encoding: 'utf8' })
  execSync(`git checkout HEAD -- ${m.file}`)
  served(m.file, mark[0], !mark[1])
  sleep(2000)
  const last = (r.stdout || '').trim().split('\n').slice(-2).join(' / ')
  out.push({ name: m.name, check: m.check, caught: r.status !== 0, out: last })
  console.log(`${m.name}（${m.check}）: ${r.status !== 0 ? '落ちた' : '落ちなかった'} — ${last}`)
}
fs.writeFileSync(OUTF, JSON.stringify(out, null, 1))
const diff = execSync(`git diff --stat -- ${files.join(' ')}`).toString().trim()
console.log(`外し回しの終わり: ${out.filter((o) => o.caught).length}/${out.length} 落ちた。戻した後の差: ${diff || 'なし'}`)
