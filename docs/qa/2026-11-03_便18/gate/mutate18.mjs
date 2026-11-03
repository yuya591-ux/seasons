// 便18 の外し回し: この便の直しを1つずつ外してビルドし、守る検査が落ちるかを確かめる。終わるたびに git checkout で戻す
// 使い方: node docs/qa/2026-11-03_便18/gate/mutate18.mjs   （前に vite preview --port 4961 を立てておく。作業ツリーに変更があると始めない）
// 出る物: docs/qa/2026-11-03_便18/gate/mutate18.json（{ name, file, caught, failed: [落ちた検査の行] }）
import fs from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
const { assertCleanTree } = await import(pathToFileURL(os.homedir() + '/.claude/skills/_shared/clean-tree.mjs').href)

const M = [
  { name: 'M1 鴨川を描いた後に影の「焼け」の合図を戻す（部屋の猫が描けない）', file: 'src/engine/kamoTown.js', from: '        if (want) r.shadowMap.needsUpdate = true\n        quad.material', to: '        quad.material', test: ['node', 'scripts/kamo/kensa.mjs', 'K1'] },
  { name: 'M2 町の3Dの舞台は部屋と降る物だけを描く（層 2）', file: 'src/engine/town3dViewer.js', from: '    camera.layers.set(KL)\n', to: '', test: ['node', 'scripts/kamo/kensa.mjs', 'K6'] },
  { name: 'M3 鴨川の角部屋は飛べない', file: 'src/engine/town3dViewer.js', from: '  if (kamo) active.flyEnabled = false\n', to: '', test: ['node', 'scripts/kamo/kensa.mjs', 'K2'] },
  { name: 'M4 鴨川の町が読めない時は前の角部屋で開く', file: 'src/engine/town3dViewer.js', from: "      .catch((e) => { console.warn('鴨川の町を読めなかったので、前の角部屋で開きます:', e && e.message); return null })\n", to: '', test: ['node', 'scripts/kamo/kensa.mjs', 'K3'] },
  { name: 'M5 雨・雪の空は霞の色から作る（物理の空にしない）', file: 'src/engine/kamoTown.js', from: '  const DOME = RAIN || SNOW || NIGHT', to: '  const DOME = NIGHT', test: ['node', 'scripts/kamo/kensa.mjs', 'K7'] },
  { name: 'M6 鴨川の町は角部屋の時だけ', file: 'src/engine/town3dViewer.js', from: "  const KAMO_WANT = kind === 'corner' && !", to: "  const KAMO_WANT = !", test: ['node', 'scripts/kamo/kensa.mjs', 'K5'] },
  { name: 'M8 iPhone の画面では軽い段で開く', file: 'src/engine/town3dViewer.js', from: "  const KAMO_LOW = /[?&]kamoq=low/.test(location.search) || (", to: "  const KAMO_LOW = /[?&]kamoq=low/.test(location.search) && (", test: ['node', 'scripts/kamo/kensa.mjs', 'K8'] },
  { name: 'M7 出典: public/kamo の全ファイルが CREDITS.md にある', file: 'CREDITS.md', from: '`public/kamo/terrain.bin`', to: '`public/kamo/terrain`', test: ['node', 'scripts/qa-credits.mjs'], noBuild: true },
]
// 名前の頭（M1 など）を渡すと、その外し回しだけを回し、記録の同じ名前の行を差し替える
const only = process.argv.slice(2)
const prev = only.length && fs.existsSync('docs/qa/2026-11-03_便18/gate/mutate18.json') ? JSON.parse(fs.readFileSync('docs/qa/2026-11-03_便18/gate/mutate18.json', 'utf8')) : []
const out = []
for (const m of M) {
  if (only.length && !only.some((o) => m.name.startsWith(o + ' '))) { const p = prev.find((x) => x.name === m.name); if (p) out.push(p); continue }
  assertCleanTree(process.cwd(), [m.file]) // 書き換えるファイルに変更が無いこと（戻す手 git checkout で直しが消えないように）
  const src = fs.readFileSync(m.file, 'utf8'), crlf = src.includes('\r\n')
  const from = crlf ? m.from.replace(/\n/g, '\r\n') : m.from, to = crlf ? m.to.replace(/\n/g, '\r\n') : m.to
  if (src.split(from).length !== 2) throw new Error('外す所が1つでない: ' + m.name)
  fs.writeFileSync(m.file, src.replace(from, to))
  try {
    if (!m.noBuild) execSync('npm run build', { stdio: 'ignore' })
    const r = spawnSync(m.test[0], m.test.slice(1), { encoding: 'utf8' })
    const lines = (r.stdout + r.stderr).split('\n').filter((l) => /^×|外れ/.test(l))
    out.push({ name: m.name, file: m.file, caught: r.status !== 0, failed: lines })
    console.log(`${r.status !== 0 ? '落ちた' : '落ちない'} ${m.name} ${lines.join(' / ')}`)
  } finally {
    execSync(`git checkout HEAD -- "${m.file}"`)
  }
}
execSync('npm run build', { stdio: 'ignore' }) // 戻した後のビルド（検査の土台を元へ）
const diff = execSync('git diff --stat').toString().trim()
fs.writeFileSync('docs/qa/2026-11-03_便18/gate/mutate18.json', JSON.stringify(out, null, 1))
console.log(`外し回し ${out.length} 通り・落ちた ${out.filter((o) => o.caught).length}・戻した後の作業ツリーの差 ${diff ? diff : '0 行'}`)
