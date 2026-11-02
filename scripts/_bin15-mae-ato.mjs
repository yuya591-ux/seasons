// 便15 群E: 見た目の直しの前（4986＝群F の後・群E の前のコード）と後（4985＝今のコード）を、同じ撮り方で撮る
// 使い方: node scripts/_bin15-mae-ato.mjs   出力: docs/qa/2026-11-02_便15/shots/ma/<名>-{mae,ato}.png
import { spawnSync } from 'node:child_process'
const OUT = 'docs/qa/2026-11-02_便15/shots/ma'
const V = [
  ['e3-kita', 'iphone', 'kitaterao-window-3d', 'still'],
  ['e3-yato', 'iphone', 'shishigaya-window-3d', 'still'],
  ['e4-spring', 'iphone', 'kitaterao-window-3d-spring', 'still'],
  ['e5-yatosnow', 'iphone', 'shishigaya-window-3d-snow', 'still'],
  ['e6-corner', 'iphone', 'autumn-dusk-corner-room', 'still'],
  ['e7-morning', 'iphone', 'summer-morning-corner-room', 'still'],
  ['e8-rainfly', 'iphone', 'kitaterao-window-3d-rain', 'still', 'js=window.__town3dFlyToggle(true)', 't=7'],
  ['e9-seaside', 'pc', 'summer-dusk-seaside', 'still'],
  ['e11-mount', 'pc', 'summer-morning-mountains', 'still'],
]
for (const [name, dev, scene, view, ...rest] of V) for (const [tag, port] of [['mae', 4986], ['ato', 4985]]) {
  const r = spawnSync('node', ['scripts/_bin15-shot.mjs', dev, scene, view, `${name}-${tag}`, 'rm=1', 'coat=6', 'wait=9000', ...rest], { env: { ...process.env, QA_OUT: OUT, B15_PORT: String(port) }, encoding: 'utf8', shell: process.platform === 'win32' })
  console.log((r.stdout || '').trim().split('\n').slice(-1)[0], r.status === 0 ? '' : 'ERR ' + (r.stderr || '').slice(-200))
}
