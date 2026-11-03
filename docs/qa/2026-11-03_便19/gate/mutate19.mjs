// 便19 の外し回し: 直しを1つずつ外してビルドし、それを守る検査が落ちるかを確かめる。終わったら git checkout で戻す
// 前に: 作業ツリーに変更が無いこと（clean-tree）・vite preview を 4971 に立てる（dist を見る）
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assertCleanTree } from '../../../../../../.claude/skills/_shared/clean-tree.mjs'
assertCleanTree(process.cwd(), ['src/engine/town3dViewer.js', 'src/engine/kamoTown.js', 'scripts/kamo/kensa.mjs']) // 外し回しで書き換えるファイルと検査の台本だけを見る（記録の書き出しは数えない）
const V = 'src/engine/town3dViewer.js', K = 'src/engine/kamoTown.js'
const M = [
  { name: 'M1 鴨川の飛ぶ・降りるを止めたまま（便18 の形）', file: V, a: '  if (kamo && !kamo.nav) active.flyEnabled = false', b: '  if (kamo) active.flyEnabled = false', test: 'K2' },
  { name: 'M2 水でも一歩進める（水際で止めない）', file: K, a: 'return wetK(X, Z) < 0.5 },', b: 'return true },', test: 'K9' },
  { name: 'M3 建物の升を歩ける（幹だけ止める）', file: K, a: 'return (k >= 0 && ensureNav().bld[k] === 1) || trunkK(X, Z) }', b: 'return trunkK(X, Z) }', test: 'K10' },
  { name: 'M4 橋の床を使わない', file: K, a: 'return d === d && Math.abs(d - feetK) < 1.3 ? d : NaN }', b: 'return NaN }', test: 'K11' },
  { name: 'M5 飛ぶ下限を地面だけにする（建物・木・橋を見ない）', file: V, a: 'const terr = KN ? KN.topSoft(active.flyPos.x, active.flyPos.z) : heightAt(active.flyPos.x, active.flyPos.z), floor = KN ? Math.max(terr + b.yFloor, KN.top(active.flyPos.x, active.flyPos.z) + 1.2) : terr + b.yFloor', b: 'const terr = KN ? KN.ground(active.flyPos.x, active.flyPos.z) : heightAt(active.flyPos.x, active.flyPos.z), floor = terr + b.yFloor', test: 'K12' },
  { name: 'M6 縦の最初の向きを前のまま（左の窓）', file: V, a: 'kamo ? 0 : -1.12', b: '-1.12', test: 'K13' },
  { name: 'M7 焼けていない面を埋めない', file: K, a: 'fill: !/[?&]kamofill=0/.test(location.search)', b: 'fill: false', test: 'K14' },
  { name: 'M8 水面の凹凸の図を前の 18 本に戻す', file: K, a: 'const OLD = /[?&]kamowave=0/.test(location.search)', b: 'const OLD = true', test: 'K15' },
  { name: 'M9 着地の抜けの線を 6m に下げる（路地に降りる）', file: V, a: 'return avg >= 15 && maxRise < 4.5', b: 'return avg >= 6 && maxRise < 4.5', test: 'K16' },
  { name: 'M10 部屋の窓の所を塞がない', file: K, a: 'setRoomShown(b) { if (plug) plug.visible = plugForce === null ? !b : plugForce },', b: 'setRoomShown(b) { },', test: 'K17' },
  { name: 'M12 別世界の空気（霧と色の膜）を鴨川でも掛ける', file: V, a: '    if (flyAmt > 0.02 && !kamo) { // 便19: 鴨川の町では別世界の空気', b: '    if (flyAmt > 0.02) { // 便19: 鴨川の町では別世界の空気', test: 'K18' },
  { name: 'M13 iPhone の段でも歩く高さを 4m の網で読む', file: K, a: '  const navDec = low ? 2 : 1\n', b: '  const navDec = 1\n', test: 'K8' },
  { name: 'M14 iPhone でも通常の段で開く', file: V, a: 'const KAMO_LOW = /[?&]kamoq=low/.test(location.search) ||', b: 'const KAMO_LOW = /[?&]kamoq=low/.test(location.search) || false &&', test: 'K8' },
  { name: 'M15 水面の図を読む向きを回さない', file: K, a: "    if (!/[?&]kamowave=0/.test(location.search)) {\n      water.material.fragmentShader", b: "    if (false) {\n      water.material.fragmentShader", test: 'K15' },
  { name: 'M11 時代の粒子と霞の帯を鴨川でも出す', file: V, a: '    if (flyAmt > 0.02 && !kamo) { // 便19: 鴨川の町では時代の粒子', b: '    if (flyAmt > 0.02) { // 便19: 鴨川の町では時代の粒子', test: 'K18' },
]
const out = []
const only = process.argv.slice(2) // 名前の頭（例 M10 M11）を渡すと、その外し方だけを回す（記録は mutate19-<名前>.json）
for (const m of M.filter((x) => !only.length || only.some((o) => x.name.startsWith(o + ' ')))) {
  const src = fs.readFileSync(m.file, 'utf8'), n = src.split(m.a).length - 1
  if (n !== 1) { out.push({ name: m.name, caught: false, failed: [`外す所が ${n} か所（外せなかった）`] }); console.log(`× ${m.name}: 外す所が ${n} か所`); continue }
  fs.writeFileSync(m.file, src.replace(m.a, () => m.b))
  const bd = spawnSync('npm', ['run', 'build'], { shell: true, encoding: 'utf8' })
  let lines = []
  if (bd.status !== 0) lines = ['ビルドが落ちた']
  else { const r = spawnSync('node', ['scripts/kamo/kensa.mjs', m.test], { encoding: 'utf8', env: { ...process.env, PORT: '4971' }, maxBuffer: 64 * 1024 * 1024 }); lines = (r.stdout + r.stderr).split('\n').filter((l) => /^[○×] K/.test(l)) }
  spawnSync('git', ['checkout', 'HEAD', '--', m.file])
  const failed = lines.filter((l) => l.startsWith('×'))
  out.push({ name: m.name, test: m.test, caught: failed.length > 0, failed: failed.length ? failed : lines })
  console.log(`${failed.length ? '落ちた' : '落ちない'} ${m.name}: ${(failed[0] || lines[0] || '').slice(0, 200)}`)
}
const bd = spawnSync('npm', ['run', 'build'], { shell: true, encoding: 'utf8' }) // 戻した形でビルドし直す
fs.writeFileSync(only.length ? `docs/qa/2026-11-03_便19/gate/mutate19-${only.join('-')}.json` : 'docs/qa/2026-11-03_便19/gate/mutate19.json', JSON.stringify(out, null, 1))
const diff = spawnSync('git', ['diff', '--stat'], { encoding: 'utf8' }).stdout.trim()
console.log(`外し回し ${out.length} 通り・落ちた ${out.filter((o) => o.caught).length}・戻した後の差 ${diff ? diff : '0 行'}・戻した形のビルド ${bd.status === 0 ? '通った' : '落ちた'}`)
