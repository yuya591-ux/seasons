// 便24 の外し回し: 直しを 1 つずつ外して、それを守る検査が落ちるかを見る（落ちれば caught: true）。外したら git checkout で戻す
// 前に: 作業ツリーに変更が無いこと（clean-tree）・vite preview 4961（dist を見る）。音の確かめは開発用のサーバーを自分で立てる
// 使い方: node docs/qa/2026-11-05_便24/gate/mutate24.mjs   出る物: gate/mutate24-final.json
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { assertCleanTree } from '../../../../../../.claude/skills/_shared/clean-tree.mjs'
assertCleanTree()
const sh = (cmd, args, env = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, shell: process.platform === 'win32' && cmd === 'npm', maxBuffer: 256 * 1024 * 1024 })
const KT = 'src/engine/kamoTown.js', KK = 'src/engine/kamoKyo.js', AU = 'src/audio/audio.js', SF = 'src/data/soundFloor.js', MV = 'src/util/mediaV.js'
const M = [
  { name: 'M1 木々のざわめきの低音切りの下限（750Hz）を外す', file: SF, a: "  'audio/kamo/leaves.mp3': 750,", b: '', build: false, tests: [['hum'], ['audio', 'A4']] },
  { name: 'M2 窓を閉じた時のこもりを 900Hz に戻す', file: SF, a: 'export const WINDOW_CLOSED_LP = 1600', b: 'export const WINDOW_CLOSED_LP = 900', build: false, tests: [['audio', 'A6']] },
  { name: 'M3 叡山電車の上がり下がりするモーター音を戻す', file: AU, a: '    // 便24: モーター（320→820Hz・800→300Hz と上がり下がりする正弦）は外した。', b: "    if (ctx.createOscillator) { const m = ctx.createOscillator(); m.type = 'sine'; m.frequency.setValueAtTime(320, at + 0.5); m.frequency.linearRampToValueAtTime(820, at + 7.5); const mg = ctx.createGain(); mg.gain.setValueAtTime(0.0001, at + 0.5); mg.gain.linearRampToValueAtTime(0.0055 * A, at + 2); mg.gain.linearRampToValueAtTime(0.0001, at + 8.5); m.connect(mg).connect(out); m.start(at + 0.5); m.stop(at + 8.6) }\n    // 便24: モーター（320→820Hz・800→300Hz と上がり下がりする正弦）は外した。", build: false, tests: [['audio', 'A7']] },
  { name: 'M4 サムネの読み先の中身の指紋の印を外す', file: MV, a: '  return v ? `${p}?v=${v}` : p', b: '  return p', build: true, tests: [['sweep']] },
  { name: 'M5 納涼床を組まない', file: KK, a: "  if (!(S === 'summer' || S === 'autumn')", b: "  if (true || !(S === 'summer' || S === 'autumn')", build: true, tests: [['kensa', 'K49']] },
  { name: 'M6 町家の庇から表の細かい物を足さない', file: KK, a: '  return frontsFromSegs(ctx, segs, seed, false)', b: '  return { n: 0, tris: 0 }', build: true, tests: [['kensa', 'K50']] },
  { name: 'M7 祇園と先斗町の低い家を町家（お茶屋）へ替えない', file: KT, a: '    if (KYO && styleA && frontA && !/[?&]kamokyo2=0/.test(location.search)) for (const [b, e] of bb)', b: '    if (false && KYO && styleA && frontA) for (const [b, e] of bb)', build: true, tests: [['kensa', 'K50']] },
  { name: 'M8 柳を植えない', file: KT, a: "kind === 1 && tz > 1900 && hv < 0.6 ? 'w'", b: "false ? 'w'", build: true, tests: [['kensa', 'K51']] },
  { name: 'M9 木の形のばらつきを外す', file: KT, a: ": low ? 0 : Math.floor(hash(tx * 1.913 + tz * 0.277 + 0.7) * 4)", b: ': 0', build: true, tests: [['kensa', 'K51']] },
  { name: 'M10 祇園と先斗町の石畳を外す', file: KT, a: "bool kyoSt = ${", b: "bool kyoSt = false && ${", build: true, tests: [['kensa', 'K52']] },
  { name: 'M11 鴨川の夜を前の値に戻す', file: KT, a: 'exp: 0.74, sun: 0xaec2f2, sunI: 0.7, hemi: [0x3f5cab, 0x201c2c, 1.05], fog: 0x24366a', b: 'exp: 0.55, sun: 0x8ea6d0, sunI: 0.25, hemi: [0x2a3550, 0x0c0c12, 0.35], fog: 0x1c2232', build: true, tests: [['kensa', 'K53']] },
  { name: 'M12 晴れた夜の空の 3 段（地平の町あかり→藍→深い紺）と藍の霞を外す', file: KT, a: "      if (!RAIN && !SNOW && !/[?&]kamonight=0/.test(location.search)) { domeHor", b: "      if (false) { domeHor", build: true, tests: [['kensa', 'K53']] },
  // 【便24・外の目の後】足した直しと書き換えた検査（MUT=M13,M14… で選んで回す）
  { name: 'M13 夜の通りの行灯の灯りだまりを外す', file: KK, a: '      if (LITE && !/[?&]kamopool=0/', b: '      if (false && !/[?&]kamopool=0/', build: true, tests: [['kensa', 'K53']] },
  { name: 'M14 納涼床を秋にも出す', file: KK, a: "  if (S !== 'summer' && !/[?&]yuka=1/.test(location.search))", b: "  if (S !== 'summer' && S !== 'autumn' && !/[?&]yuka=1/.test(location.search))", build: true, tests: [['kensa', 'K49']] },
  { name: 'M15 雨の素材の低い塊を前の素材に戻す', file: 'public/audio/summer-rain-dusk/rain.mp3', copyFrom: '6e3e5a4', build: false, tests: [['hum']] },
  { name: 'M16 北寺尾の駅の電車の通過音を前の低い帯に戻す', file: AU, a: "hp.frequency.value = 480 // 【便24・外の目 直すべき2】", b: "hp.frequency.value = 130 // 【便24・外の目 直すべき2】", build: false, tests: [['audio', 'A8']] },
  { name: 'M17 雨の低音切りの下限 560Hz を戻す（雨の情景が痩せる）', file: SF, a: "  'audio/winter-snow-night/wind.mp3'", b: "  'audio/summer-rain-dusk/rain.mp3': 560, 'audio/winter-snow-night/wind.mp3'", build: false, tests: [['hum']] },
]
const runTest = ([kind, k]) => {
  if (kind === 'hum') { const r = sh('node', ['scripts/qa-hum.mjs']); return { ok: r.status === 0, line: (r.stdout || '').trim().split('\n').pop() } }
  if (kind === 'audio') { const r = sh('node', ['docs/qa/2026-11-05_便24/gate/audio24-run.mjs']); const l = (r.stdout || '').split('\n').find((x) => x.includes(' ' + k + ' ')) || ''; return { ok: l.startsWith('○'), line: l.trim() } }
  if (kind === 'sweep') { const r = sh('node', ['docs/qa/2026-11-05_便24/gate/sweep24.mjs', 'mut']); return { ok: r.status === 0, line: (r.stdout || '').trim().split('\n').pop() } }
  const r = sh('node', ['scripts/kamo/kensa.mjs', k], { PORT: '4961' }); const ls = (r.stdout || '').split('\n').filter((x) => x.includes(' ' + k + ' ')); return { ok: ls.length > 0 && ls.every((x) => x.startsWith('○')), line: ls.join(' ／ ').trim() }
}
const out = []
const pickM = process.env.MUT ? process.env.MUT.split(',') : null
for (const m of M) {
  if (pickM && !pickM.some((k) => m.name.startsWith(k + ' '))) continue
  if (m.copyFrom) { // 素材のファイルを前のコミットの物に替える
    const r0 = spawnSync('git', ['show', `${m.copyFrom}:${m.file}`], { maxBuffer: 64 * 1024 * 1024 }); fs.writeFileSync(m.file, r0.stdout)
    try { const failed = []; for (const t of m.tests) { const r = runTest(t); if (!r.ok) failed.push(`${t.join(' ')}: ${r.line}`) } out.push({ name: m.name, caught: failed.length > 0, failed }); console.log(m.name, failed.length ? '落ちた' : '落ちなかった', failed.join(' ／ ').slice(0, 300)) } finally { sh('git', ['checkout', 'HEAD', '--', m.file]) }
    continue
  }
  const src = fs.readFileSync(m.file, 'utf8')
  if (!src.includes(m.a)) { out.push({ name: m.name, caught: false, failed: [], note: '外す文が見つからない' }); console.log(m.name, '外す文が見つからない'); continue }
  fs.writeFileSync(m.file, src.replace(m.a, m.b))
  try {
    if (m.build) { const r = sh('npm', ['run', 'build']); if (r.status !== 0) { out.push({ name: m.name, caught: true, failed: ['ビルドが落ちた'] }); continue } }
    const failed = []
    for (const t of m.tests) { const r = runTest(t); if (!r.ok) failed.push(`${t.join(' ')}: ${r.line}`) }
    out.push({ name: m.name, caught: failed.length > 0, failed })
    console.log(m.name, failed.length ? '落ちた' : '落ちなかった', failed.join(' ／ ').slice(0, 300))
  } finally { sh('git', ['checkout', 'HEAD', '--', m.file]) }
}
sh('npm', ['run', 'build']) // 戻した版で dist を作り直す
const OUTF = process.env.MUT ? 'docs/qa/2026-11-05_便24/gate/mutate24b.json' : 'docs/qa/2026-11-05_便24/gate/mutate24-final.json'
fs.writeFileSync(OUTF, JSON.stringify(out, null, 1))
const diff = sh('git', ['diff', '--stat']).stdout.trim()
console.log(`外し回しの終わり: ${out.filter((o) => o.caught).length}/${out.length} 通りで検査が落ちた・作業ツリーの変更 ${diff ? diff : 'なし'}`)
