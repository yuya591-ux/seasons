// 便20 の外し回し: この便の直しを1つずつ外してビルドし、守る検査が落ちるか（落ちれば検査が効いている）を見る。終わったらファイルを元へ戻す
// 前に: 今のコードの vite preview を 4981 に立てる（dist を見る）。使い方: node docs/qa/2026-11-04_便20/gate/mutate20.mjs
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const ONLY = process.argv.slice(2)
const M0 = [
  { id: 'M1', what: '五山の点く順を逆にする（鳥居形から）', file: 'src/engine/kamoLife.js', a: 'order: G.min * 5 +', b: 'order: (20 - G.min) * 5 +', k: ['K20'] },
  { id: 'M2', what: '飛ぶ・歩く時の鴨川の音の近さを流さない（便19 の形に戻す）', file: 'src/engine/town3dViewer.js', a: 'if (a) onAmbience(0, a.river * outAmt, a.crowd * outAmt, 0, a.sta * outAmt, 0, a.staPan); else', b: 'if (false) onAmbience(0, 0, 0, 0, 0, 0, 0); else', k: ['K22'] },
  { id: 'M3', what: '視差軽減でも時々の出来事の帯を回す（【便20・外の目】送り火は視差軽減でも灯す形に改めたので、外すのは帯の止め）', file: 'src/engine/kamoLife.js', a: 'if (!reduceMotion) for (const b of bands) {', b: 'if (true) for (const b of bands) {', k: ['K24'] },
  { id: 'M7', what: '鴨川の町に音の口をつながない（町の3Dが出来事の音を音の部品へ流さない）', file: 'src/engine/town3dViewer.js', a: "reduceMotion, onSound: (k, o) => {", b: "reduceMotion, onSound0: (k, o) => {", k: ['K23'] },
  { id: 'M4', what: '河川敷に座る人を置かない', file: 'src/engine/kamoLife.js', a: "const want = Math.round((low ? 36 : 72)", b: "const want = 0 * Math.round((low ? 36 : 72)", k: ['K19'] },
  { id: 'M5', what: '動く物の表が読めない時に止まる形にする（読めなかった時の受けを外す）', file: 'src/engine/kamoTown.js', a: "const lifeP = fetch(base + 'life.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)", b: "const lifeP = fetch(base + 'life.json').then((r) => r.json())", k: ['K25'] },
  { id: 'M6', what: '鴨川の出来事の音（トビ）を鳴らさない', file: 'src/engine/kamoLife.js', a: "tobi: { ok: () => kites.length > 0, run: () => { const k = pick(kites); sound('tobi', [k.x, k.z]);", b: "tobi: { ok: () => kites.length > 0, run: () => { const k = pick(kites);", k: ['K23'] },
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
    const r = run('node', ['scripts/kamo/kensa.mjs', ...m.k], { PORT: '4981' })
    const lines = ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /^[○×] K/.test(l))
    const fell = lines.some((l) => l.startsWith('×'))
    out.push(`${m.id} ${m.what} → ${m.k.join('・')} ${fell ? '落ちた（検査が効いている）' : '落ちなかった'}${m.note && !fell ? '・' + m.note : ''} ／ ${lines.join(' ／ ').slice(0, 500)}`)
    console.log(out[out.length - 1])
  } finally { fs.writeFileSync(m.file, raw) }
}
const bd = run('npm', ['run', 'build']); console.log(`元へ戻してビルド 終了コード ${bd.status}`)
fs.writeFileSync('docs/qa/2026-11-04_便20/gate/mutate20.txt', out.join('\n') + '\n')
