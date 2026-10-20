// 便13（2026-10-20）の外し回し（外の目の見直しの後に6通り足して24通り）: 直しを1つずつ外し（値1つを前に戻す）、その直しを見る検査が落ちるかを確かめる（qa-gate §3 (5-後)）。便11 の _bin11-mutate.mjs の写し。
// 外した後は git checkout HEAD -- <ファイル> で戻し、git diff --stat が0行かを見る。始める前に作業ツリーに変更が無いかを確かめる（clean-tree）。
// 使い方: 開発サーバー 4982（scripts/_bin13-vite.config.mjs・今のコード）を起動してから  node scripts/_bin13-mutate.mjs
//   出力: docs/qa/2026-10-20_便13/gate/mutate13.json（直し1件ごとに { name, file, check, caught, failed }）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const { assertCleanTree } = await import(pathToFileURL(path.join(os.homedir(), '.claude/skills/_shared/clean-tree.mjs')).href)
assertCleanTree()

const OUT = 'docs/qa/2026-10-20_便13/gate'
const V = 'src/engine/town3dViewer.js'
const M = [
  { name: '猫の毛の材に部屋の陰影の関数を段の画として渡す（前の形・V8）', file: V, a: 'new THREE.MeshToonMaterial({ color: tint(h), fog: false })', b: 'new THREE.MeshToonMaterial({ color: tint(h), gradientMap: grad, fog: false })', check: 'K1' },
  { name: '猫の自分の明るさを外す', file: V, a: ' m.emissive.copy(m.color).multiplyScalar(CAT_EMI);', b: '', check: 'K2' },
  { name: '三毛の黒のブチを上げる直しを外す', file: V, a: 'if (coat.n) furL.color.lerp(', b: 'if (false) furL.color.lerp(', check: 'K3' },
  { name: '猫の置き場を前の 0.5 に戻す（V44）', file: V, a: 'const CAT_X = 0.28', b: 'const CAT_X = 0.5', check: 'K4' },
  { name: '毛糸玉の置き場を前の 0 に戻す（V44）', file: V, a: 'const toyHome = { x: -0.32, z: 1.42 }', b: 'const toyHome = { x: 0.0, z: 1.42 }', check: 'K4' },
  { name: 'ちゃぶ台の一式の置き場を前の -0.72 に戻す（V44）', file: V, a: 'const CHABU_X = -0.52', b: 'const CHABU_X = -0.72', check: 'K4' },
  { name: '三毛のブチの自分の明るさを、明るくする前の色のままにする（外の目の12）', file: V, a: ' furL.emissive.copy(furL.color).multiplyScalar(CAT_EMI) }', b: ' }', check: 'K2' },
  { name: '夜のほこりの輪を窓側の半分に限らない（外の目の13）', file: V, a: 'b.z0 = LZ - LAMP_BACK - Math.abs(Math.sin(a)) * r;', b: 'b.z0 = LZ - LAMP_BACK + Math.sin(a) * r;', check: 'K5' },
  { name: '夜の床の光だまりを前の z 2.4 に戻す（外の目の13）', file: V, a: 'pool.position.set(0, FY + 0.04, LZ);', b: 'pool.position.set(0, FY + 0.04, 2.4);', check: 'K8' },
  { name: '風鈴を吊る腕木を外す（外の目の3）', file: V, a: '      if (CHIME_OUT) { box(0.03, 0.03, 0.3,', b: '      if (false) { box(0.03, 0.03, 0.3,', check: 'K9' },
  { name: '猫が場所を移る時の左の端を前の -0.35 に戻す（ちゃぶ台を動かした分）', file: V, a: 'c.x1 = Math.max(-0.15, Math.min(1.35, c.x0 + Math.cos(ang) * d));', b: 'c.x1 = Math.max(-0.35, Math.min(1.35, c.x0 + Math.cos(ang) * d));', check: 'K17' },
  { name: 'ほこりを光の中だけに置く直しを外す（V5）', file: V, a: 'const DUST_IN_LIGHT = true', b: 'const DUST_IN_LIGHT = false', check: 'K5' },
  { name: '畳の絵を前の 256 に戻す（V7）', file: V, a: 'const tatTex = cv(512, 512,', b: 'const tatTex = cv(256, 256,', check: 'K6' },
  { name: 'カーテンのひだの陰影を外す（V7）', file: V, a: 'const CURT_SHADE = true', b: 'const CURT_SHADE = false', check: 'K7' },
  { name: '夜の灯りの焼き込みを外す（#1=1）', file: V, a: 'const NIGHT_LAMP = 1', b: 'const NIGHT_LAMP = 0', check: 'K8' },
  { name: '風鈴を窓の中の前の置き場に戻す（#2=2）', file: V, a: 'const CHIME_OUT = true', b: 'const CHIME_OUT = false', check: 'K9' },
  { name: '電灯を上げる直しを外す（#2=2・V50）', file: V, a: 'const LAMP_UP = 0.62, LAMP_BACK = 0.25', b: 'const LAMP_UP = 0, LAMP_BACK = 0.25', check: 'K10' },
  { name: '手すりを1本にする直しを外す（#2=2）', file: V, a: 'const RAIL_ONE = true', b: 'const RAIL_ONE = false', check: 'K11' },
  { name: '錠が障子と一緒にすべる行を外す（#2=2）', file: V, a: 'if (winRoom.visible && winSashLock) winSashLock.position.x', b: 'if (false && winSashLock) winSashLock.position.x', check: 'K12' },
  { name: '窓をあけた時の目の寄りを 0 にする（#2=2）', file: V, a: '  winSide: 0.55,', b: '  winSide: 0,', check: 'K13' },
  { name: '角部屋の最初の向きを外す（#3=1）', file: V, a: 'const CORNER_YAW = true', b: 'const CORNER_YAW = false', check: 'K14' },
  { name: '谷戸の窓と目の置き場を前に戻す（#4=1）', file: V, a: 'const YATO_SEAT = true', b: 'const YATO_SEAT = false', check: 'K15' },
  { name: '谷戸で窓をあけた時の前への出を減らさない（#4=1）', file: V, a: 'const winFwdK = Math.max(0, CAM.winFwd - SEAT.z)', b: 'const winFwdK = CAM.winFwd', check: 'K15' },
  { name: '撮影の台本の、撮る直前にボタンを出す手を外す', file: 'scripts/_bin13-shot.mjs', a: "  await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })))\n", b: '', check: 'K16' },
]
const res = []
for (const m of M) {
  let src = fs.readFileSync(m.file, 'utf8')
  const a = src.includes('\r\n') ? m.a.replace(/\n/g, '\r\n') : m.a
  if (src.split(a).length !== 2) throw new Error('外す所が1つに決まらない: ' + m.name)
  fs.writeFileSync(m.file, src.replace(a, () => m.b))
  await new Promise((r) => setTimeout(r, 2500)) // 開発サーバーが書き換えを拾うのを待つ
  const r = spawnSync('node', ['scripts/_bin13-kensa.mjs', m.check], { env: { ...process.env, QA_OUT: `${OUT}/mutate`, KENSA_NAME: 'kensa-mutate' }, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 })
  execSync(`git checkout HEAD -- "${m.file}"`)
  const diff = execSync(`git diff --stat -- . ":(exclude)${OUT}"`).toString().trim() // 外し回し自身が書く記録（gate）は数えない
  if (diff) throw new Error('戻した後に差分が残った: ' + diff)
  const lines = ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /不合格/.test(l)).map((l) => l.slice(0, 200))
  const caught = r.status !== 0
  res.push({ name: m.name, file: m.file, check: m.check, caught, failed: lines })
  console.log(`${caught ? '落ちた' : '落ちなかった'} ${m.name} → ${m.check} ${lines[0] || ''}`)
  await new Promise((r) => setTimeout(r, 2500))
}
fs.writeFileSync(`${OUT}/mutate13.json`, JSON.stringify({ at: new Date().toISOString(), commit: execSync('git rev-parse --short HEAD').toString().trim(), all: res.every((x) => x.caught), res }, null, 1))
console.log(`外し回しの終わり: ${res.filter((x) => x.caught).length}/${res.length} で検査が落ちた`)
