// 便11（2026-10-16）の外し回し: 直しを1つずつ外し（値1つを前に戻す）、その直しを見る検査が落ちるかを確かめる（qa-gate §3 (5-後)）。
// 外した後は git checkout HEAD -- <ファイル> で戻し、git diff --stat が0行かを見る。始める前に作業ツリーに変更が無いかを確かめる（clean-tree）。
// 使い方: 開発サーバー 4963（scripts/_bin11-vite.config.mjs）・4967 と 4968（scripts/_bin11r-vite.config.mjs）を起動してから  node scripts/_bin11-mutate.mjs
//   出力: docs/qa/2026-10-16_便11/gate/mutate11.json（直し1件ごとに { name, file, caught, failed }）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const { assertCleanTree } = await import(pathToFileURL(path.join(os.homedir(), '.claude/skills/_shared/clean-tree.mjs')).href)
assertCleanTree()

const OUT = 'docs/qa/2026-10-16_便11/gate'
const M = [
  { name: '雲海の1枚の面を外す（CLOUD_SEA_SHEET=false）', file: 'src/engine/town3dViewer.js', a: 'const CLOUD_SEA_SHEET = true', b: 'const CLOUD_SEA_SHEET = false', check: ['_bin11-kensa.mjs', 'K1'] },
  { name: '虹の輪の描く順を外す（renderOrder 1 の行）', file: 'src/engine/town3dViewer.js', a: '    glory.renderOrder = 1 //', b: '    // glory.renderOrder = 1 //', check: ['_bin11-kensa.mjs', 'K2'] },
  { name: '遠山の作り替えを外す（MTN_RIDGED=false）', file: 'src/engine/town3dViewer.js', a: 'const MTN_RIDGED = true', b: 'const MTN_RIDGED = false', check: ['_bin11-kensa.mjs', 'K3'] },
  { name: '煙の板を外す（SMOKE_SPRITES=false）', file: 'src/engine/town3dViewer.js', a: 'const SMOKE_SPRITES = true', b: 'const SMOKE_SPRITES = false', check: ['_bin11-kensa.mjs', 'K4'] },
  { name: 'レンズの水滴を外す（RAIN_LENS 0）', file: 'src/shaders/rainGlass.js', a: '#define RAIN_LENS 1', b: '#define RAIN_LENS 0', check: ['_bin11-kensa.mjs', 'K5'] },
  { name: '伝い落ちた跡を外す（RAIN_TRAIL 0）', file: 'src/shaders/rainGlass.js', a: '#define RAIN_TRAIL 1', b: '#define RAIN_TRAIL 0', check: ['_bin11-kensa.mjs', 'K5'] },
  { name: 'ぼかした写しを外す（作らない）', file: 'src/engine/renderer.js', a: "const cv = makeBlurredCanvas(img); if (cv) bgBlurTex = uploadTexture(cv)", b: 'const cv = null', check: ['_bin11-kensa.mjs', 'K5'] },
  { name: '海辺の描き込みを外す（WIN_DETAIL 0）', file: 'src/shaders/windowSea.js', a: "const WIN_DETAIL = '#define WIN_DETAIL 1", b: "const WIN_DETAIL = '#define WIN_DETAIL 0", check: ['_bin11-kensa.mjs', 'K6'] },
  { name: '山あいの描き込みを外す（WIN_DETAIL 0）', file: 'src/shaders/windowMountains.js', a: "const WIN_DETAIL = '#define WIN_DETAIL 1", b: "const WIN_DETAIL = '#define WIN_DETAIL 0", check: ['_bin11-kensa.mjs', 'K7'] },
  { name: '雲海の乱数の消費を1つ減らす（頂の明度の散らし）', file: 'src/engine/town3dViewer.js', a: '.lerp(new THREE.Color(seaLowC), R() * 0.3).getHex()', b: '.lerp(new THREE.Color(seaLowC), 0.15).getHex()', check: ['_bin11-rcheck.mjs', 'kitaterao-window-3d'] },
]
const res = []
for (const m of M) {
  const src = fs.readFileSync(m.file, 'utf8')
  if (src.split(m.a).length !== 2) throw new Error('外す所が1つに決まらない: ' + m.name)
  fs.writeFileSync(m.file, src.replace(m.a, () => m.b))
  await new Promise((r) => setTimeout(r, 2500)) // 開発サーバーが書き換えを拾うのを待つ
  const r = spawnSync('node', ['scripts/' + m.check[0], m.check[1]], { env: { ...process.env, QA_OUT: `${OUT}/mutate`, KENSA_NAME: 'kensa-mutate' }, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 })
  execSync(`git checkout HEAD -- "${m.file}"`)
  const diff = execSync('git diff --stat').toString().trim()
  if (diff) throw new Error('戻した後に差分が残った: ' + diff)
  const lines = ((r.stdout || '') + (r.stderr || '')).split('\n').filter((l) => /不合格|違う/.test(l)).map((l) => l.slice(0, 200))
  const caught = r.status !== 0
  res.push({ name: m.name, file: m.file, check: m.check.join(' '), caught, failed: lines })
  console.log(`${caught ? '落ちた' : '落ちなかった'} ${m.name} → ${m.check.join(' ')} ${lines[0] || ''}`)
  await new Promise((r) => setTimeout(r, 2500))
}
fs.writeFileSync(`${OUT}/mutate11.json`, JSON.stringify({ at: new Date().toISOString(), commit: execSync('git rev-parse --short HEAD').toString().trim(), all: res.every((x) => x.caught), res }, null, 1))
console.log(`外し回しの終わり: ${res.filter((x) => x.caught).length}/${res.length} で検査が落ちた`)
