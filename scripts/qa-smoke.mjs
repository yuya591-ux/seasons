// CI/ローカルの安全網: 全公開情景を headless で開き、コンソールエラー/pageerror/GLSLコンパイル失敗が
// 無いこと・情景が落ちずにマウントできることを確認する。1つでも異常があれば exit 1（回帰をビルド後に自動検知）。
// 使い方: node scripts/qa-smoke.mjs  （vite preview を自前で起動→検査→停止。PORT 環境変数で上書き可）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { SCENES } from '../src/data/scenes/index.js'

// 便15 U1: 出典の照らし（アプリ内の出典と情景データ・CREDITS.md）を最初に回す。外れたら開かずに止める
{ const { spawnSync } = await import('node:child_process'); const r = spawnSync(process.execPath, ['scripts/qa-credits.mjs'], { encoding: 'utf8' }); process.stdout.write(r.stdout || ''); if (r.status !== 0) { process.stderr.write(r.stderr || ''); console.error('SMOKE FAIL: 出典の照らしが外れた'); process.exit(1) } }

const PORT = process.env.PORT || 4938
const BASE = `http://localhost:${PORT}/seasons/`
const ids = SCENES.filter((s) => s.status === 'ready' && s.public !== false).map((s) => s.id)

// vite preview を子プロセスで起動（CIでもローカルでも自己完結）。shell:true には引数を文字列で渡す（args配列だと非推奨警告）。
const srv = spawn(`npx vite preview --port ${PORT} --strictPort`, { shell: true, stdio: 'ignore' })
const cleanup = () => { try { srv.kill() } catch { /* 無視 */ } }
process.on('exit', cleanup)

async function waitServer(ms = 30000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(BASE); if (r.ok) return true } catch { /* まだ */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

const ok = await waitServer()
if (!ok) { console.error('SMOKE: preview server did not start'); cleanup(); process.exit(1) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 480, height: 720 } })
const bad = [] // { id, msg }
let curId = '(start)'
const isErr = (m) => !/favicon|manifest|Download the React|preload/i.test(m) // ノイズ除外
page.on('pageerror', (e) => bad.push({ id: curId, msg: 'PE:' + e.message }))
page.on('console', (m) => { if (m.type() === 'error' && isErr(m.text())) bad.push({ id: curId, msg: 'CE:' + m.text().slice(0, 160) }) })

await page.goto(`${BASE}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(1200)
const hasHook = await page.evaluate(() => typeof window.__applyScene === 'function')
if (!hasHook) { console.error('SMOKE: __applyScene hook missing (app init failed?)'); await browser.close(); cleanup(); process.exit(1) }

// 町の3Dは組み立てに時間がかかる（CI は GPU なし）。組み終わる（__town3dDraw が値を返す）まで最大8秒待つ＝遅れて出たエラーを次の情景の名前で記録しない（S45）
async function settle(id) {
  const scene = SCENES.find((s) => s.id === id)
  if (scene && scene.render === 'town3d') {
    for (let k = 0; k < 16; k++) { const ok = await page.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw())).catch(() => false); if (ok) break; await page.waitForTimeout(500) }
  }
}
let scanned = 0
const stageCount = () => page.evaluate(() => document.querySelectorAll('.town3d-stage').length)
let stageBad = 0
for (const id of ids) {
  curId = id
  await page.evaluate((i) => window.__applyScene(i), id)
  await page.waitForTimeout(700)
  await page.evaluate((i) => window.__applyScene(i), id) // 二度当て＝確実に切替（verify-sceneと同方式）
  await page.waitForTimeout(1500)
  await settle(id)
  // 便15 U3: 町の3Dは舞台が1枚だけ・2D は舞台が0枚（組み立ての打ち切りや片付けの漏れで舞台が残らない）
  const scene = SCENES.find((s) => s.id === id), want = scene && scene.render === 'town3d' ? 1 : 0, got = await stageCount()
  if (got !== want) { stageBad++; bad.push({ id, msg: `舞台の数 ${got}（${want} のはず）` }) }
  scanned++
}
console.log(`舞台の数: ${ids.length} 情景で外れ ${stageBad}`)
// 便15 U3: 町→町を組み終わる前に続けて替え（温めの最中を含む）、最後の町で舞台が1枚・検証の口が今の町を返す
{
  const towns = ids.filter((i) => (SCENES.find((s) => s.id === i) || {}).render === 'town3d').slice(0, 4)
  curId = '町→町の連続切替'
  for (const id of towns) { await page.evaluate((i) => window.__applyScene(i), id); await page.waitForTimeout(900) }
  await settle(towns[towns.length - 1])
  const n = await stageCount(), ok = await page.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw()))
  if (n !== 1 || !ok) bad.push({ id: curId, msg: `舞台 ${n}・今の町の口 ${ok}` })
  console.log(`町→町の連続切替: ${towns.length} 町・最後の舞台 ${n}・今の町の口 ${ok}`)
  scanned++
}
// 便15 S28: 情景パネル経由の本物の操作（場所→その場所の先頭の情景）で、町→雨の窓→町と替え、画面の部品（窓をあけるボタン・強さの行）が情景に合う
{
  curId = '情景パネル'
  const pickPlace = async (place) => {
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })))
    await page.locator('.topbar .iconbtn', { hasText: '情景' }).first().click(); await page.waitForTimeout(600)
    await page.locator('.panel--open .scene-card', { hasText: place }).first().click(); await page.waitForTimeout(600)
    await page.locator('.panel--open .scene-card').first().click(); await page.waitForTimeout(1800)
  }
  const state = () => page.evaluate(() => { const st = document.querySelector('.iconbtn--stage'); const row = [...document.querySelectorAll('.panel--set .setrow')].find((r) => r.querySelector('input[type=range]') && !/音|明るさ/.test(r.querySelector('.setrow__label')?.textContent || '')); return { stage: !!st && getComputedStyle(st).display !== 'none', inten: !!row && row.style.display !== 'none' } })
  await pickPlace('雨の窓'); await page.waitForTimeout(2000)
  const rain = await state()
  await pickPlace('北寺尾の坂の街'); await settle('kitaterao-window-3d')
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))); await page.waitForTimeout(600)
  const town = await state()
  if (rain.stage || !rain.inten || !town.stage || town.inten) bad.push({ id: curId, msg: `雨の窓 ボタン ${rain.stage}・強さの行 ${rain.inten} ／ 町 ボタン ${town.stage}・強さの行 ${town.inten}` })
  console.log(`情景パネル: 雨の窓（窓をあける ${rain.stage ? 'あり' : 'なし'}・強さの行 ${rain.inten ? 'あり' : 'なし'}）→ 町（窓をあける ${town.stage ? 'あり' : 'なし'}・強さの行 ${town.inten ? 'あり' : 'なし'}）`)
  scanned++
}
// 横長の画面（iPad 横の大きさ）と「軽やか」の段でも、代表の情景を開いてエラーが無いか（以前は縦長・既定の段だけだった・S44）
const REP = ['kitaterao-window-3d', 'summer-rain-dusk', 'summer-dusk-seaside']
await page.setViewportSize({ width: 1180, height: 820 })
for (const id of REP) { curId = '横長:' + id; await page.evaluate((i) => window.__applyScene(i), id); await page.waitForTimeout(1500); await settle(id); scanned++ }
console.log('横長（1180×820）: ' + REP.length + ' 情景を開いた')
await page.evaluate(() => { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.settings = { ...(st.settings || {}), quality: 'light' }; localStorage.setItem(k, JSON.stringify(st)) })
curId = '軽やか:(開き直し)'
await page.reload({ waitUntil: 'domcontentloaded' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(1200)
for (const id of REP) { curId = '軽やか:' + id; await page.evaluate((i) => window.__applyScene(i), id); await page.waitForTimeout(1500); await settle(id); scanned++ }
console.log('軽やか: ' + REP.length + ' 情景を開いた')
curId = '(終わりの待ち)'
await page.waitForTimeout(3000) // 最後の情景の遅れて出るエラーも拾う（以前は1.5秒で閉じていた・S45）
await browser.close()
cleanup()

if (bad.length) {
  console.error(`SMOKE FAIL: ${bad.length} 件の異常（情景 ${scanned}枚を走査）`)
  for (const b of bad.slice(0, 20)) console.error(`  [${b.id}] ${b.msg}`)
  process.exit(1)
}
console.log(`SMOKE OK: ${scanned} 情景すべてエラー無し`)
process.exit(0)
