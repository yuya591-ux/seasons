// UI・UXの点検(2026-07-30)。#7=3幅×7状態のスクショ／#8=タップ領域44px未満・重なり・はみ出しの機械監査／#9=初見の導線を通しで撮る。
// アプリは変更しない。実際のボタンを押して状態を作る（クラスを直接付けない＝導線そのものを確かめる）。
// 使い方: PORT=4890 node scripts/qa-uiaudit.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30/ui'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }

const WIDTHS = [{ w: 390, h: 844, key: '390' }, { w: 900, h: 500, key: '900' }, { w: 1600, h: 900, key: '1600' }]

// 画面上の操作要素をすべて測る（見えているものだけ）
const AUDIT = `(() => {
  const sel = 'button, input, select, textarea, a[href], [role="button"], [tabindex]:not([tabindex="-1"])'
  const els = [...document.querySelectorAll(sel)]
  const vw = innerWidth, vh = innerHeight
  const rows = []
  for (const e of els) {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    // 親がidle等で消えていれば除外
    let hidden = false
    for (let p = e.parentElement; p; p = p.parentElement) { const pc = getComputedStyle(p); if (pc.display === 'none' || pc.visibility === 'hidden' || parseFloat(pc.opacity) < 0.05) { hidden = true; break } }
    if (hidden) continue
    rows.push({
      名: (e.getAttribute('aria-label') || e.textContent || e.className || e.tagName).trim().slice(0, 24),
      cls: e.className.toString().slice(0, 40),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    })
  }
  const 小さい = rows.filter((r) => r.w < 44 || r.h < 44)
  const はみ出し = rows.filter((r) => r.x < -1 || r.y < -1 || r.x + r.w > vw + 1 || r.y + r.h > vh + 1)
  const 重なり = []
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j]
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    if (ox > 2 && oy > 2) 重なり.push({ a: a.名, b: b.名, 面積: ox * oy })
  }
  // 押せるか（真ん中を指で突いたとき、実際にその要素が受け取るか）＝別の物に覆われていないか
  const 覆われている = []
  for (const e of els) {
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    if (cx < 0 || cy < 0 || cx > vw || cy > vh) continue
    const top = document.elementFromPoint(cx, cy)
    if (!top) continue
    if (top === e || e.contains(top) || top.contains(e)) continue
    覆われている.push({ 名: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 20), 覆う物: (top.className || top.tagName).toString().slice(0, 34) })
  }
  return { 画面: [vw, vh], 操作要素: rows.length, 小さい, はみ出し, 重なり, 覆われている, 一覧: rows }
})()`

const browser = await chromium.launch()
const errs = []

// ───────────────────────────────── #7 + #8: 3幅 × 7状態
for (const v of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errs.push(`${v.key}: ${e.message}`))
  await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1200)
  say(`\n${'='.repeat(74)}\n■ 画面幅 ${v.w}×${v.h}`)

  const shot = async (name) => {
    await page.mouse.move(v.w / 2, v.h / 2) // idleでUIが消えるので小突く
    await page.waitForTimeout(700)
    await page.screenshot({ path: `${outDir}/${v.key}_${name}.png` })
    const a = await page.evaluate(AUDIT)
    say(`\n   ── ${name} ── 操作要素 ${a.操作要素}個`)
    say(`      44px未満: ${a.小さい.length}個` + (a.小さい.length ? '  ' + a.小さい.map((r) => `${r.名}(${r.w}×${r.h})`).join(' / ') : ''))
    say(`      はみ出し: ${a.はみ出し.length}個` + (a.はみ出し.length ? '  ' + a.はみ出し.map((r) => `${r.名}@${r.x},${r.y} ${r.w}×${r.h}`).join(' / ') : ''))
    say(`      重なり  : ${a.重なり.length}組` + (a.重なり.length ? '  ' + a.重なり.slice(0, 6).map((o) => `${o.a}×${o.b}(${o.面積}px²)`).join(' / ') : ''))
    say(`      押せない: ${a.覆われている.length}個` + (a.覆われている.length ? '  ' + a.覆われている.map((o) => `${o.名}←${o.覆う物}`).join(' / ') : ''))
    return a
  }

  await shot('gate')
  await page.locator('.gate').click()
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
  await page.waitForTimeout(6500)
  await shot('窓辺')

  // 情景メニュー
  await page.evaluate(() => [...document.querySelectorAll('.topbar .iconbtn')].find((b) => b.textContent.includes('情景')).click())
  await page.waitForTimeout(900)
  await shot('情景メニュー')
  // ふりかえり（通い帳）
  const j = page.locator('[aria-label="これまでの窓辺の記録（通い帳）"]')
  if (await j.count()) { await page.evaluate(() => document.querySelector('[aria-label="これまでの窓辺の記録（通い帳）"]').click()); await page.waitForTimeout(900); await shot('ふりかえり') } else say('   × 通い帳の入口が見つからない')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await page.evaluate(() => document.querySelectorAll('.panel--open').forEach((p) => p.classList.remove('panel--open')))
  await page.waitForTimeout(400)

  // 設定
  await page.evaluate(() => [...document.querySelectorAll('.topbar .iconbtn')].find((b) => b.textContent.includes('設定')).click())
  await page.waitForTimeout(900)
  await shot('設定')
  await page.evaluate(() => document.querySelectorAll('.panel--open').forEach((p) => p.classList.remove('panel--open')))
  await page.waitForTimeout(500)

  // 飛行
  await page.evaluate(() => { window.__town3dWindow(true) })
  await page.waitForTimeout(900)
  await page.evaluate(() => { window.__town3dLean(true); window.__town3dFly(true) })
  await page.waitForTimeout(3500)
  await shot('飛行')
  // 歩行
  await page.evaluate(() => window.__town3dFlyPose(0, 26, -30, 0, -0.2))
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.__town3dLand(true))
  await page.waitForTimeout(6500)
  await shot('歩行')
  await ctx.close()
}

// ───────────────────────────────── #9 初見の導線（390幅で通しで撮る）
say(`\n${'='.repeat(74)}\n■ #9 初見の導線（390×844・実際のボタンだけを押す）`)
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => errs.push(`flow: ${e.message}`))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1500)

// 画面に出ている案内文（何が読めるか）を拾う
const guide = () => page.evaluate(() => {
  const pick = (s) => [...document.querySelectorAll(s)].filter((e) => { const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && parseFloat(c.opacity) > 0.05 }).map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)).filter(Boolean)
  return { 案内: pick('.lookhint, .hud__scene, .modepill'), ボタン: pick('.topbar .iconbtn'), 段階: document.querySelectorAll('.stagedots--on').length ? '表示中' : '非表示' }
})
const step = async (n, label, act) => {
  if (act) await act()
  await page.mouse.move(195, 400)
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${outDir}/flow_${String(n).padStart(2, '0')}.png` })
  const g = await guide()
  say(`   flow_${String(n).padStart(2, '0')}.png  ${label}`)
  say(`      画面の案内: ${JSON.stringify(g.案内)}`)
  say(`      押せるボタン: ${JSON.stringify(g.ボタン)}   段階表示: ${g.段階}`)
}
await step(1, '起動の間（gate）')
await step(2, '窓辺に着いた直後', async () => { await page.locator('.gate').click(); await page.waitForTimeout(1200); await page.evaluate(() => window.__applyScene('kitaterao-window-3d')); await page.waitForTimeout(7000) })
await step(3, '「窓をあける」を押した', async () => { await page.evaluate(() => document.querySelector('.iconbtn--stage').click()); await page.waitForTimeout(2500) })
await step(4, '次の一歩（乗り出す）を押した', async () => { await page.evaluate(() => document.querySelector('.iconbtn--stage').click()); await page.waitForTimeout(2500) })
await step(5, '次の一歩（空へ）を押した', async () => { await page.evaluate(() => document.querySelector('.iconbtn--stage').click()); await page.waitForTimeout(5000) })
await step(6, '空を飛んでいる（少し進んだ）', async () => { await page.evaluate(() => window.__town3dCruise(true)); await page.waitForTimeout(4000) })
await step(7, '次の一歩（おりる）を押した', async () => { await page.evaluate(() => { const b = document.querySelector('.iconbtn--stage'); if (b) b.click() }); await page.waitForTimeout(7000) })
await step(8, '地上を歩いている', async () => { await page.evaluate(() => window.__town3dMove(0, 1)); await page.waitForTimeout(2500); await page.evaluate(() => window.__town3dMove(0, 0)) })

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 4).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/uiaudit.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/uiaudit.txt')
await browser.close()
