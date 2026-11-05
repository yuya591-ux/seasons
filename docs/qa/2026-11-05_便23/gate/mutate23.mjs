// 便23 の外し回し（便22 の mutate22.mjs を写した）: この便の直しを1つずつ外してビルドし、守る検査が落ちるか（落ちれば検査が効いている）を見る。終わったら元へ戻す
//   コードの直し（M）は、ファイルの文を差し替えてビルド → 検査 → 元の文へ戻す。
//   データの直し（D）は、外し回し用の目印（KAMO_MUT）を付けて組み直し・合わせ直し・詰め直し → ビルド → 検査 → 目印なしで組み直して元へ戻す（焼いた図はそのまま使う＝検査は図を見ない）
// 前に: 今のコードの vite preview を 4961 に立てる（dist を見る）。使い方: node docs/qa/2026-11-05_便23/gate/mutate23.mjs [M1 D1 …]
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { assertCleanTree } from '../../../../../../.claude/skills/_shared/clean-tree.mjs'
const ONLY = process.argv.slice(2)
const M0 = [
  { id: 'M1', what: '南の四角を足さない', file: 'src/engine/town3dViewer.js', a: 'if (sd) { try { k0.addSouth(sd) }', b: 'if (false) { try { k0.addSouth(sd) }', k: ['K40'] },
  { id: 'M2', what: '南の建物に北の焼いた図を使う', file: 'src/engine/kamoTown.js', a: 'lmTex: sd.lmB, isA: false', b: 'lmTex: data.lm.bldg, isA: false', k: ['K41'] },
  { id: 'M3', what: '南の地形に北の焼いた図を使う', file: 'src/engine/kamoTown.js', a: 'addNearTerrain(RGB, sd.lmT, uvB, [3, 6], true)', b: 'addNearTerrain(RGB, data.lm.terrain, uvB, [3, 6], true)', k: ['K41'] },
  { id: 'M4', what: '道案内の網の縁を北の四角のままにする', file: 'src/engine/kamoTown.js', a: 'const outK = (X, Z) => !inK(X, Z, EDGE)', b: 'const outK = (X, Z) => !inRA(X, Z, EDGE)', k: ['K42', 'K47'] },
  { id: 'M5', what: '?kamosouth=0 を見ない', file: 'src/engine/kamoTown.js', a: 'loadSouth: meta.south && !/[?&]kamosouth=0/.test(location.search) ?', b: 'loadSouth: meta.south ?', k: ['K43'] },
  { id: 'M6', what: '南の四角の居場所の名を外す', file: 'src/engine/kamoTown.js', a: 'for (const p of SOUTH_PLACES) if (X >= p.x0 && X <= p.x1 && Z >= p.z0 && Z <= p.z1) return p.name', b: 'void SOUTH_PLACES', k: ['K44'] },
  { id: 'M7', what: '外の町が南の四角を抜かない', file: 'src/engine/kamoTown.js', a: 'inSouth: SOUTH_ON ? (x, z, m) => inK(x, z, m) && !inRA(x, z, m) : null', b: 'inSouth: null', k: ['K40'] },
  { id: 'M8', what: '映り込みの鏡を動かさない', file: 'src/engine/kamoTown.js', a: 'if (!/[?&]kamomirror=0/.test(location.search)) waterProf = { z0: RGB.z0, step: STP, v: lv }', b: 'void lv', k: ['K45'] },
  { id: 'D1', what: '（K34 の書き換え）北の水面の三角形を北の四角で切らない（五条まで延びた崩れた水面が戻る）', data: { merge: 'noclip' }, k: ['K34'] },
  { id: 'D2', what: '南の便の水面の基準を1つに戻し、横の一番低い水面にそろえない（継ぎ目の南の鴨川の水面が 4m 高く出る）', data: { build: 'wy' }, k: ['K46'] },
]
const M = ONLY.length ? M0.filter((m) => ONLY.includes(m.id)) : M0
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, shell: process.platform === 'win32' && cmd === 'npm', maxBuffer: 64 * 1024 * 1024 })
const data = (mut) => { // 組み直し・合わせ直し・詰め直し（mut＝{ build, merge } の目印。無ければ元の形）
  const a = run('node', ['scripts/kamo/build.mjs'], { KAMO_REGION: 's', KAMO_MUT: mut.build || '' }); if (a.status !== 0) return '南の便を組めない'
  const b = run('node', ['scripts/kamo/merge.mjs'], { KAMO_MUT: mut.merge || '' }); if (b.status !== 0) return '合わせられない'
  const c = run('node', ['scripts/kamo/pack.mjs'], { KAMO_GEO: 'geo-u', KAMO_BAKE: 'bake-u' }); if (c.status !== 0) return '詰められない'
  return null
}
assertCleanTree(process.cwd(), ['src', 'scripts', 'public']) // 【整備便11・12】作業ツリーに変更があれば始めない（外し回しの戻す手で直しが消えないように）
const out = []
for (const m of M) {
  let raw = null
  if (m.file) { raw = fs.readFileSync(m.file, 'utf8'); const crlf = raw.includes('\r\n'), s = raw.replace(/\r\n/g, '\n'); if (!s.includes(m.a)) { out.push(`${m.id} 外す所が見つからない（${m.what}）`); console.log(out[out.length - 1]); continue } fs.writeFileSync(m.file, crlf ? s.replace(m.a, m.b).replace(/\n/g, '\r\n') : s.replace(m.a, m.b)) }
  try {
    if (m.data) { const e = data(m.data); if (e) { out.push(`${m.id} ${e}（${m.what}）`); console.log(out[out.length - 1]); continue } }
    const bd = run('npm', ['run', 'build'])
    if (bd.status !== 0) { out.push(`${m.id} ビルドが通らない（${m.what}）`); console.log(out[out.length - 1]); continue }
    const r = run('node', ['scripts/kamo/kensa.mjs', ...m.k], { PORT: '4961' })
    const lines = ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /^[○×] K/.test(l))
    const fell = lines.some((l) => l.startsWith('×'))
    out.push(`${m.id} ${m.what} → ${m.k.join('・')} ${fell ? '落ちた（検査が効いている）' : '落ちなかった'} ／ ${lines.join(' ／ ').slice(0, 500)}`)
    console.log(out[out.length - 1])
  } finally {
    if (raw !== null) fs.writeFileSync(m.file, raw)
    if (m.data) { const e = data({}); if (e) console.log(`元へ戻せない: ${e}`) }
  }
}
const bd = run('npm', ['run', 'build']); console.log(`元へ戻してビルド 終了コード ${bd.status}`)
const st = run('git', ['status', '--porcelain', '--', 'src', 'scripts', 'public']); console.log(`戻した後の作業ツリーの変更: ${(st.stdout || '').trim() || 'なし'}`)
fs.appendFileSync('docs/qa/2026-11-05_便23/gate/mutate23.txt', out.join('\n') + '\n')
fs.writeFileSync('docs/qa/2026-11-05_便23/gate/mutate23.json', JSON.stringify(out.map((l) => ({ name: l.split(' → ')[0], caught: /落ちた（検査が効いている）/.test(l), failed: (l.split(' ／ ').slice(1).filter((x) => x.startsWith('×'))) })), null, 1))
