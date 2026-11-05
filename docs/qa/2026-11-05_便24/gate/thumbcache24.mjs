// 便24: サムネが前の画のまま出る症状の再現と確かめ（裕也さん「サムネ画像もトップの１つだけでそのあとの季節選択画面は前のままでした」）
//   1) 夏の朝の角部屋のサムネを赤一色に差し替えた版をビルドして開き、情景 → 京都・鴨川デルタの角部屋 を開いて控え（service worker）に入れる
//   2) 本物のサムネの版に差し替えたサーバーで開き直し（同じ所・同じブラウザ）、同じ画面を開いた最初の1回目で、夏の朝のカードの色を測る
//   赤（r が g・b より 80 以上大きい）のままなら「前の画が出た」。作業フォルダ（前＝6e3e5a4・後＝今）ごとに回す
// 使い方: node thumbcache24.mjs <作業フォルダ> <名前>   出力の最後の行: 「サムネの控えの確かめ: <名前> 1回目のカード rgb=… → 赤のまま|本物」
import { chromium } from 'playwright'
import { spawn, spawnSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const WT = path.resolve(process.argv[2]), NAME = process.argv[3] || 'x', PORT = Number(process.env.TC_PORT || 4991)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tc24-'))
const THUMB = path.join(WT, 'public/thumbs/summer-morning-corner-room.jpg'), KEEP = path.join(TMP, 'keep.jpg')
fs.copyFileSync(THUMB, KEEP)
const red = path.join(TMP, 'red.jpg')
spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=740x490', '-frames:v', '1', red])
const build = (out) => { const r = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { cwd: WT, shell: true, encoding: 'utf8' }); if (r.status !== 0) throw new Error('ビルドが落ちた ' + (r.stderr || '').slice(-400)) }
try { fs.copyFileSync(red, THUMB); build(path.join(TMP, 'red')) } finally { fs.copyFileSync(KEEP, THUMB) }
build(path.join(TMP, 'real'))

let srv = null
const kill = () => { if (srv) { try { if (process.platform === 'win32') execSync(`taskkill /PID ${srv.pid} /T /F`, { stdio: 'ignore' }); else srv.kill() } catch { /* 無視 */ } srv = null } }
const up = async () => { try { return (await fetch(`http://localhost:${PORT}/seasons/`)).ok } catch { return false } }
async function serve(dir) {
  kill(); for (let i = 0; i < 20 && (await up()); i++) await new Promise((r) => setTimeout(r, 300))
  srv = spawn(`npx vite preview --outDir "${dir}" --port ${PORT} --strictPort`, { cwd: WT, shell: true, stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
process.on('exit', kill)

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 900, height: 700 } }) // service worker を使う（控えの振る舞いを見る）
const p = await ctx.newPage()
async function openCorner() {
  await p.locator('.gate').click({ timeout: 8000 }).catch(() => {})
  await p.waitForTimeout(800)
  await p.getByRole('button', { name: '情景' }).first().click()
  await p.waitForTimeout(500)
  await p.locator('.panel--scene .scene-card', { hasText: '鴨川デルタ' }).first().click()
  await p.waitForTimeout(2500)
}
async function cardRgb() {
  const card = p.locator('.panel--scene .scene-card', { hasText: '夏の朝、鴨川デルタ' }).first().locator('.scene-card__swatch')
  await card.scrollIntoViewIfNeeded()
  await p.waitForTimeout(800)
  const png = await card.screenshot()
  const out = path.join(TMP, 'card.png'); fs.writeFileSync(out, png)
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', 'scale=1:1:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1024 })
  const [R, G, B] = [...r.stdout]
  const url = await card.evaluate((e) => getComputedStyle(e).backgroundImage.slice(0, 160))
  return { rgb: [R, G, B], url, png }
}
await serve(path.join(TMP, 'red'))
await p.goto(`http://localhost:${PORT}/seasons/`, { waitUntil: 'load' })
await p.waitForTimeout(3000) // service worker が入るのを待つ
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1500)
await openCorner()
const before = await cardRgb()
await serve(path.join(TMP, 'real'))
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2500)
await openCorner()
const first = await cardRgb()
fs.mkdirSync('docs/qa/2026-11-05_便24/shots', { recursive: true })
fs.writeFileSync(`docs/qa/2026-11-05_便24/shots/thumbcache-${NAME}.png`, first.png)
const isRed = (c) => c[0] - Math.max(c[1], c[2]) > 80
console.log(`赤い版で控えに入れたカード rgb=${before.rgb.join(',')}（${isRed(before.rgb) ? '赤' : '赤でない'}）・読み先 ${before.url}`)
console.log(`本物の版に替えて開き直した 1回目の読み先 ${first.url}`)
console.log(`サムネの控えの確かめ: ${NAME} 1回目のカード rgb=${first.rgb.join(',')} → ${isRed(first.rgb) ? '赤のまま（前の画が出た）' : '本物'}`)
await b.close(); kill()
fs.rmSync(TMP, { recursive: true, force: true })
process.exit(isRed(before.rgb) && !isRed(first.rgb) ? 0 : 1)
