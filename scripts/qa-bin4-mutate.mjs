// 便4 の外し回し: 直しを1件ずつ外して（ファイルの中の1か所を前の形へ書き換えて）、その行の検査が落ちるかを確かめる。
// 使い方: 開発サーバー 4961（_bin4-vite.config.mjs）を起動し、直しをコミットしてから  node scripts/qa-bin4-mutate.mjs
// 記録: docs/qa/2026-10-13_便4/gate/mutate4.json（直しごとに { name, check, caught, out }）。外した後は git checkout HEAD -- <道> で戻す
import fs from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { assertCleanTree } from '../../../.claude/skills/_shared/clean-tree.mjs'

const M = [
  { name: 'W1-freshMirror', check: 'W1', file: 'src/engine/town3dViewer.js', from: "        .replace('#include <opaque_fragment>', skyMirrorGLSL('vWPosF', 'uSkyF', 'uSky2F', '0.10', false))\r\n", to: '' },
  { name: 'W2-seaMirror', check: 'W2', file: 'src/engine/town3dViewer.js', from: "          .replace('#include <opaque_fragment>', skyMirrorGLSL('vWPos', 'uSky', 'uSky2', '0.16', true))\r\n", to: '' },
  { name: 'F1-mistLayer', check: 'F1', file: 'src/engine/heightFog.js', from: 'if ( uMistA.w > 0.0 && uMistA.y > 0.0 ) {', to: 'if ( false ) {' },
  { name: 'F2-flow', check: 'F2', file: 'src/engine/heightFog.js', from: 'vec2 mQ = mP.xz + vec2( uMistB.w, uMistB.w * 0.35 );', to: 'vec2 mQ = mP.xz;' },
  { name: 'F3-passData', check: 'F3', file: 'src/main.js', from: 'mist: mistFor(next),', to: 'mist: null,' },
  { name: 'F3-timeTable', check: 'F3', file: 'src/data/mist.js', from: 'noon: 0.7,', to: 'noon: 1.15,' },
]
const files = [...new Set(M.map((m) => m.file))]
assertCleanTree(process.cwd(), files)
const out = []
for (const m of M) {
  const src = fs.readFileSync(m.file, 'utf8')
  const n = src.split(m.from).length - 1
  if (n !== 1) { out.push({ name: m.name, check: m.check, caught: null, note: `外す所が ${n} か所（1か所でない）` }); continue }
  fs.writeFileSync(m.file, src.replace(m.from, m.to))
  const r = spawnSync('node', ['scripts/qa-bin4.mjs', m.check], { env: { ...process.env, QA_OUT: `docs/qa/2026-10-13_便4/gate/mutate-runs/${m.name}` }, encoding: 'utf8' })
  execSync(`git checkout HEAD -- ${m.file}`)
  const last = (r.stdout || '').trim().split('\n').slice(-2).join(' / ')
  out.push({ name: m.name, check: m.check, caught: r.status !== 0, out: last })
  console.log(`${m.name}（${m.check}）: ${r.status !== 0 ? '落ちた' : '落ちなかった'} — ${last}`)
}
fs.writeFileSync('docs/qa/2026-10-13_便4/gate/mutate4.json', JSON.stringify(out, null, 1))
const diff = execSync(`git diff --stat -- ${files.join(' ')}`).toString().trim()
console.log(`外し回しの終わり: ${out.filter((o) => o.caught).length}/${out.length} 落ちた。戻した後の差: ${diff || 'なし'}`)
