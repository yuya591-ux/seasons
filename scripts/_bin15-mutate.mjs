// 便15 の外し回し（qa-gate §3 (5-後)・§10-4 の4）: 直しを1つずつ外し（前の形へ書き戻し）、それを見る検査が落ちるかを確かめる。
// 先に全部コミットしてから回す。1つ外す → 検査 → git checkout HEAD -- <ファイル> で戻す → 次へ。終わりに git diff --stat が空であることを確かめる。
// 使い方: node scripts/_bin15-mutate.mjs [名…]   出力: docs/qa/2026-11-02_便15/gate/mutate15.json（{ name, file, check, caught, failed }）
// 開発サーバー 4985（_bin15-vite.config.mjs）が今の作業フォルダを読むこと（書き戻した物がそのまま検査に効く）
import fs from 'node:fs'
import { spawnSync, execSync } from 'node:child_process'
import { assertCleanTree } from '../../../.claude/skills/_shared/clean-tree.mjs'

const T = 'src/engine/town3dViewer.js', UI = 'src/ui/ui.js', MAIN = 'src/main.js', CSS = 'src/style.css'
// [名, ファイル, 今の文字列, 前の形, 検査の ID]
const M = [
  ['S1 鈴虫の出典', 'src/data/credits.js', "  { file: 'kitaterao-window-3d-night/suzumushi.mp3',", "  { file: 'x-removed/suzumushi.mp3',", 'A1'],
  ['S2 ウグイスの出典', 'src/data/credits.js', "url: 'https://freesound.org/people/warukunai/sounds/524526/', note: 'ウグイス'", "url: 'https://commons.wikimedia.org/wiki/File:Uguisu5707.ogg', note: 'ウグイス'", 'A2'],
  ['S3 使っていない出典の行', 'src/data/credits.js', "export const CREDIT_IMAGES = [", "export const CREDIT_IMAGES = [\n  { title: 'Basel Martinsgasse Panorama（実証用）', by: 'DerMische', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Basel_Martinsgasse_Panorama.jpg', note: '立体パノラマの実証用' },", 'A3'],
  ['S4 CREDITS の見出し', 'CREDITS.md', '### 風 — `public/audio/winter-snow-night/`', '### 情景「冬の雪の夜／夏の朝（山）」 — `public/audio/winter-snow-night/`', 'A4'],
  ['S5 情景データの権利のコメント', 'src/data/scenes/summer-rain-morning.js', '出典・ライセンスは CREDITS.md に全数記録', '出典・ライセンスは CREDITS.md に全数記録（すべてCC0流用）', 'A5'],
  ['S55 README', 'README.md', '組み合わせを 25 収録', '組み合わせを 30 あまり収録', 'A6'],
  ['S72 古い色の説明', T, '  // 色の圧縮はフィルム風（Neutral）', '  // フィルミックなトーンマッピング（ACES）\n  // 色の圧縮はフィルム風（Neutral）', 'A7'],
  ['S31 今の段を押しても組み直さない', UI, "if (settings.quality === q.id) { poke(); return }", '', 'B1'],
  ['S19・U4 段の組み直しで引き継ぐ', MAIN, 'const keep = rebuild && ui && ui.getStage ? ui.getStage() : null', 'const keep = null', 'B2'],
  ['S32 傾きの拒否で札を消す', MAIN, "if (!ok) { updateSettings({ tilt: false }); if (ui && ui.setTilt) ui.setTilt(false) } // 許可拒否なら設定を戻し、札も消す", "if (!ok) { updateSettings({ tilt: false }) } // 許可拒否なら設定を戻し、札も消す", 'B3'],
  ['V67 音の線の左端', UI, "    audioCtrls.appendChild(vol) // 便15 V67", "    audioCtrls.prepend(muteBtn); audioCtrls.appendChild(vol) // 便15 V67", 'B4'],
  ['V68 設定の間は＋−を隠す', CSS, 'body:has(.panel--open) .town3d-zoom,', 'body.never-b15 .town3d-zoom,', 'B5'],
  ['V73 右上のボタンを1段に', CSS, '@media (max-width: 480px) {\r\n  .topbar {\r\n    gap: 0.32rem;', '@media (max-width: 1px) {\r\n  .topbar {\r\n    gap: 0.32rem;', 'B6'],
  ['S23 見回しの口の上書き', T, 'window.__town3dLookState = () => { if (active !== me) return null; let lit = 0', 'window.__town3dLook = () => { if (active !== me) return null; let lit = 0', 'C1'],
  ['S24 打ち切りの片付け', T, "if (my !== token) { try { renderer.dispose() } catch (e) { /* 無視 */ } if (stage.parentNode) stage.parentNode.removeChild(stage); return }", 'if (my !== token) return', 'C2'],
  ['S25 受け口を外す', T, "      try { window.removeEventListener('resize', resize) } catch (e) { /* 無視 */ }\r\n      try { window.removeEventListener('pointerup', winClimbUp) } catch (e) { /* 無視 */ }\r\n", '', 'C3'],
  ['S26 本番で口を置かない', T, "  if (/[?&]dev=1/.test(location.search)) window.__town3dMerge = () => ({ ...mergeInfo,", '  window.__town3dMerge = () => ({ ...mergeInfo,', 'C4'],
  ['S27・U2 今の町だけで動く包み', T, '  guardDevHooks() // 便15 U2・S27', '  // guardDevHooks() // 便15 U2・S27', 'C5'],
  ['S36・U5 軽やかで描く数を減らす', T, 'const lightDraw = (geo, nLight, perItem = 1) => { if (LIGHT) geo.setDrawRange', 'const lightDraw = (geo, nLight, perItem = 1) => { if (false) geo.setDrawRange', 'D1'],
  ['D1 起動時の情景で季節を先に', 'src/data/scenes/index.js', "const v = score(s) + (s.axes.season === season ? 10 : 0)", 'const v = score(s)', 'E1'],
  ['D4 回したら向きを決め直す', T, "if (cornerYawSet !== null && active && active.mode === 'window'", "if (false && cornerYawSet !== null && active && active.mode === 'window'", 'E2'],
  ['V10・V17 錠を下げる', T, 'box(0.14, 0.06, 0.08, 0.1, WINCY - 0.18, 0.31, alMat)', 'box(0.14, 0.06, 0.08, 0.1, WINCY - 0.06, 0.31, alMat)', 'E3'],
  ['W2 降る物を丸い粒へ', T, "    const mat = new THREE.PointsMaterial({\r\n      map: fallDot,\r\n", "    const mat = new THREE.PointsMaterial({\r\n", 'E4'],
  ['V20 雪の茅葺', T, 'const thatchMat = snowify(new THREE.MeshLambertMaterial({ color: 0xffffff, map: thatchTex, vertexColors: true }))', 'const thatchMat = (new THREE.MeshLambertMaterial({ color: 0xffffff, map: thatchTex, vertexColors: true }))', 'E5'],
  ['V25 左右の長押の長さ', T, 'box(0.06, 0.1, BZ - 0.3, -SX + 0.04, ngY, BZ / 2, postMat)', 'box(0.06, 0.1, RD, -SX + 0.04, ngY, BZ / 2, postMat)', 'E6'],
  ['V29 朝は窓を灯さない', T, 'const winLitDusk = duskAmt > 0.25 && !MORNING', 'const winLitDusk = duskAmt > 0.25', 'E7'],
  ['V39 雨の日の太陽', T, "const overcast = weather === 'snow' || weather === 'rain'", "const overcast = weather === 'snow'", 'E8'],
  ['V58 海辺の夕日を桟から外す', 'src/shaders/windowSea.js', 'float sunAz = -0.24 * min(asp, 1.0);', 'float sunAz = -0.05;', 'E9'],
  ['V61 かもめを桟から外す', 'src/shaders/windowSea.js', 'col = flyingBirdsAvoid(col, vec2(ax + yaw * 0.5, vp.y), t, 1.0, yaw * 0.5, 0.011 * asp / max(asp, 1.0) + 0.03);', 'col = flyingBirds(col, vec2(ax + yaw * 0.5, vp.y), t, 1.0);', 'E10'],
  ['V63 山あいの太陽に筋を重ねない', 'src/shaders/windowMountains.js', '    rays *= smoothstep(0.05, 0.085, length(sd));', '    rays *= 1.0;', 'E11'],
  ['V79 入口の四辺の縁', CSS, '  inset: -8px;', '  inset: 0;', 'E12'],
]
const want = process.argv.slice(2)
const out = 'docs/qa/2026-11-02_便15/gate/mutate15.json'
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : []
const res = prev.filter((r) => !want.length || !want.includes(r.name.split(' ')[0]))
assertCleanTree(process.cwd(), [...new Set(M.map((m) => m[1]))])
for (const [name, file, now, old, check] of M) {
  if (want.length && !want.includes(name.split(' ')[0])) continue
  const src = fs.readFileSync(file, 'utf8')
  const n = src.split(now).length - 1
  if (n !== 1) { res.push({ name, file, check, caught: false, failed: [`外す前の文字列が ${n} 回（1回のはず）`] }); console.log(name, '外せなかった'); continue }
  fs.writeFileSync(file, src.replace(now, () => old))
  if (file === 'src/data/credits.js' || file === 'src/data/scenes/index.js' || file === 'CREDITS.md' || file === 'README.md' || file.startsWith('src/data/scenes/')) { /* ファイルを読む検査 */ } else spawnSync('node', ['-e', 'setTimeout(()=>{},2500)']) // 開発サーバーが書き換えを拾うのを待つ
  const r = spawnSync('node', ['scripts/_bin15-kensa.mjs', check], { env: { ...process.env, QA_OUT: 'docs/qa/2026-11-02_便15/gate/mutate' }, encoding: 'utf8', shell: process.platform === 'win32' })
  execSync(`git checkout HEAD -- "${file}"`)
  const lines = (r.stdout || '').split('\n').filter((l) => l.startsWith(check + ' '))
  const caught = r.status !== 0
  res.push({ name, file, check, caught, failed: lines })
  console.log(`${name}: ${caught ? '検査が落ちた' : '落ちなかった'} ${lines.join(' ').slice(0, 200)}`)
}
const diff = execSync('git diff --stat -- src CREDITS.md README.md').toString().trim()
fs.writeFileSync(out, JSON.stringify(res, null, 1))
console.log(`外し回しの終わり: ${res.filter((r) => r.caught).length}/${res.length} で検査が落ちた・作業ツリーの差 ${diff ? 'あり' : 'なし'}`)
process.exit(res.every((r) => r.caught) && !diff ? 0 : 1)
