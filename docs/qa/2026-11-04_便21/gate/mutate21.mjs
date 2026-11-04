// 便21 の外し回し（便20 の mutate20.mjs を写した）: この便の直しを1つずつ外してビルドし、守る検査が落ちるか（落ちれば検査が効いている）を見る。終わったらファイルを元へ戻す
// 前に: 今のコードの vite preview を 4961 に立てる（dist を見る）。使い方: node docs/qa/2026-11-04_便21/gate/mutate21.mjs
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const ONLY = process.argv.slice(2)
const M0 = [
  { id: 'M1', what: '浅瀬の水（川底が透ける水・流れ・白い筋）の差し替えを外す', file: 'src/engine/kamoTown.js', a: "if (depthTex && !/[?&]kamoshallow=0/.test(location.search)) {", b: "if (false) {", k: ['K27'] },
  { id: 'M2', what: '雲の層を作らない', file: 'src/engine/kamoTown.js', a: "if (!/[?&]kamocloud=0/.test(location.search)) {", b: "if (false) {", k: ['K28'] },
  { id: 'M3', what: '京都らしい家並みの描き方と通り庇を外す', file: 'src/engine/kamoTown.js', a: "KYO = !!(styleA && frontA) && !/[?&]kamokyo=0/.test(location.search)", b: "KYO = false", k: ['K29'] },
  { id: 'M4', what: '賀茂大橋の石灯籠を置かない', file: 'src/engine/kamoTown.js', a: "if (side === outer) while (acc + L >= nextL) {", b: "if (false) while (acc + L >= nextL) {", k: ['K30'] },
  { id: 'M5', what: '河川敷を歩く人・走る人・自転車を置かない', file: 'src/engine/kamoPeople.js', a: "const n = Math.max(kind === 'walk' && WET ? 1 : 0, Math.round(n0 * seasonK * half))", b: "const n = 0", k: ['K31'] },
  { id: 'M6', what: '夏の夜のデルタの手持ち花火を外す', file: 'src/engine/kamoPeople.js', a: "if (S === 'summer' && NIGHT && !WET && stones && stones.length) {", b: "if (false) {", k: ['K31'] },
  { id: 'M7', what: '名所の形（時計塔・正門・鳥居・大元宮・茂庵…）を作らない', file: 'src/engine/kamoTown.js', a: "if (meta.marks && !/[?&]kamomarks=0/.test(location.search)) marksInfo = buildMarks(", b: "if (false) marksInfo = buildMarks(", k: ['K32'] },
  { id: 'M8', what: '飛び石の形（亀・千鳥・すれ違い）を前の丸めた石に戻す', file: 'src/engine/kamoTown.js', a: "    if (n && sk) {", b: "    if (false) {", k: ['K27'] },
  { id: 'M9', what: '（K11 の書き換え）橋の床に乗れない形にする', file: 'src/engine/kamoTown.js', a: "const deckOk = (X, Z, feetK) => { const k = cellK(X, Z); if (k < 0) return NaN;", b: "const deckOk = (X, Z, feetK) => { const k = cellK(X, Z); if (k >= -1) return NaN;", k: ['K11'] },
  { id: 'M11', what: '（K25 の書き換え＝版の印）動く物の表が読めない時の受けを外す', file: 'src/engine/kamoTown.js', a: "const lifeP = fetch(base + 'life.json' + KAMO_V).then((r) => (r.ok ? r.json() : null)).catch(() => null)", b: "const lifeP = fetch(base + 'life.json' + KAMO_V).then((r) => r.json())", k: ['K25'] },
  { id: 'M12', what: '（K26 の書き換え＝版の印）鴨川のデータを読み終えるまで片付けない（便20 の前の形）', file: 'src/engine/town3dViewer.js', a: "const got = await Promise.race([kamoP, gone])
      if (my !== token || got === '__gone') {", b: "const got = await kamoP
      if (got === '__gone') {", k: ['K26'] }, // 読み終わるのを待ち、替わっていても片付けずに続ける（便20 の前の形）
  { id: 'M10', what: '（K9 の書き換え）水の上へも歩いて入れる形にする', file: 'src/engine/kamoTown.js', a: "return wetK(X, Z) < 0.5 },", b: "return true },", k: ['K9'] },
]
const M = ONLY.length ? M0.filter((m) => ONLY.includes(m.id)) : M0
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, shell: process.platform === 'win32' && cmd === 'npm', maxBuffer: 64 * 1024 * 1024 })
const out = []
for (const m of M) {
  const raw = fs.readFileSync(m.file, 'utf8'), crlf = raw.includes('\r\n'), s = raw.replace(/\r\n/g, '\n')
  if (!s.includes(m.a)) { out.push(`${m.id} 外す所が見つからない（${m.what}）`); console.log(out[out.length - 1]); continue }
  fs.writeFileSync(m.file, (crlf ? s.replace(m.a, m.b).replace(/\n/g, '\r\n') : s.replace(m.a, m.b)))
  try {
    const bd = run('npm', ['run', 'build'])
    if (bd.status !== 0) { out.push(`${m.id} ビルドが通らない（${m.what}）`); console.log(out[out.length - 1]); continue }
    const r = run('node', ['scripts/kamo/kensa.mjs', ...m.k], { PORT: '4961' })
    const lines = ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /^[○×] K/.test(l))
    const fell = lines.some((l) => l.startsWith('×'))
    out.push(`${m.id} ${m.what} → ${m.k.join('・')} ${fell ? '落ちた（検査が効いている）' : '落ちなかった'}${m.note && !fell ? '・' + m.note : ''} ／ ${lines.join(' ／ ').slice(0, 500)}`)
    console.log(out[out.length - 1])
  } finally { fs.writeFileSync(m.file, raw) }
}
const bd = run('npm', ['run', 'build']); console.log(`元へ戻してビルド 終了コード ${bd.status}`)
fs.writeFileSync('docs/qa/2026-11-04_便21/gate/mutate21.txt', out.join('\n') + '\n')
