// 便22 の外し回し（便21 の mutate21.mjs を写した）: この便の直しを1つずつ外してビルドし、守る検査が落ちるか（落ちれば検査が効いている）を見る。終わったらファイルを元へ戻す
// 前に: 今のコードの vite preview を 4961 に立てる（dist を見る）。使い方: node docs/qa/2026-11-04_便22/gate/mutate22.mjs
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
const ONLY = process.argv.slice(2)
const M0 = [
  { id: 'M1', what: '秋の夕の虫の音の低音切りを外す', file: 'src/data/scenes/autumn-dusk-corner-room.js', a: "src: 'audio/autumn-dusk-corner-room/crickets.mp3', gain: 0.4, loop: true, hp: 420 }", b: "src: 'audio/autumn-dusk-corner-room/crickets.mp3', gain: 0.4, loop: true }", k: ['K33'] },
  { id: 'M2', what: '鴨川デルタの人の声を流さない', file: 'src/engine/kamoLife.js', a: 'amb.voice = VOICE_BASE * ', b: 'amb.voice = 0 * ', k: ['K33'] },
  { id: 'M3', what: '（K22 の書き換え）合成のざわめきを商店街で戻す', file: 'src/engine/kamoLife.js', a: 'amb.crowd = 0; amb.sta = 0; void md; void glow', b: 'amb.crowd = Math.max(0, 1 - md / 45) * glow; amb.sta = 0', k: ['K22'] },
  { id: 'M4', what: '外の町を読まない', file: 'src/engine/town3dViewer.js', a: "if (!/[?&]kamoouter=0/.test(location.search)) { const k0 = kamo;", b: "if (false) { const k0 = kamo;", k: ['K34'] },
  { id: 'M5', what: '外の町の名所を作らない', file: 'src/engine/kamoOuter.js', a: "if (!/[?&]outermeisho=0/.test(location.search)) {", b: "if (false) {", k: ['K34'] },
  { id: 'M6', what: '外の町の道案内（地面・水・建物・居場所）へ分けない', file: 'src/engine/kamoTown.js', a: "for (const [k, w] of Object.entries(W)) { const f0 = nav[k], wf = w(f0); nav[k] = (...a) => (ON ? wf(...a) : f0(...a)) }", b: "void W", k: ['K35'] },
  { id: 'M7', what: '鴨川の町に低く溜まる霧を戻す', file: 'src/engine/town3dViewer.js', a: "MIST_A[3] = kamo ? 0 : (mistPin.amount ?? MIST.amount)", b: "MIST_A[3] = mistPin.amount ?? MIST.amount", k: ['K34'] },
  { id: 'M8', what: '鴨川の町の網の外の崩れた水面を落とさない', file: 'src/engine/kamoTown.js', a: "waterCut = ix.length / 3 - keepI.length / 3; g.setIndex(keepI); g.computeBoundingSphere() }", b: "waterCut = 0 }", k: ['K34'] },
  { id: 'M10', what: '（K38）iPhone の段の外の町の地形を間引けない数で間引く（範囲の南北が 16m で割り切れなかった時と同じ NaN）', file: 'src/engine/kamoOuter.js', a: 'dec: low ? 2 : 1, tiles: [8, 8]', b: 'dec: low ? 3 : 1, tiles: [8, 8]', k: ['K38'] },
  { id: 'M11', what: '（K36 の書き換え）外の町の橋の床の高さを答えない', file: 'src/engine/kamoTown.js', a: 'deckAt: (X, Z) => { const k = cell(X, Z); return k < 0 ? NaN : build().deck[k] },', b: 'deckAt: () => NaN,', k: ['K36'] },
  { id: 'M12', what: '（K36 の書き換え・外の目 #1）鴨川の町の網の中の縁の帯も外の町の下げた網で答える', file: 'src/engine/kamoTown.js', a: 'const terr = (X, Z) => (inGrid(X, Z) ? terrK(X, Z) : terrO(X, Z))', b: 'const terr = (X, Z) => terrO(X, Z)', k: ['K36'] },
  { id: 'M15', what: '（K39）町を片付ける時に three の使い回しの図（DFG_LUT）を解放しない', file: 'src/engine/town3dViewer.js', a: '        if (lut) lut.dispose()', b: '        void lut', k: ['K39'] },
  { id: 'M16', what: '（K39）検証の口 __girlPNG2 を片付けで外さない', file: 'src/engine/town3dViewer.js', a: "if (!(k.startsWith('__town3d') || k === '__girlPNG2') || MAIN_HOOKS.has(k)) continue", b: "if (!k.startsWith('__town3d') || MAIN_HOOKS.has(k)) continue", k: ['K39'] },
  { id: 'M9', what: '外の町を読めない時の受けを外す', file: 'src/engine/town3dViewer.js', a: ".catch((e) => console.warn('外の町を読めなかったので、鴨川の町だけで開きます:', e && e.message)) }", b: " }", k: ['K37'] },
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
fs.appendFileSync('docs/qa/2026-11-04_便22/gate/mutate22.txt', out.join('\n') + '\n')
