// 初見の導線を通しで撮る(2026-07-30・撮り直し版)。#9。
// 前版は __applyScene（検証用フック）で情景を替えたため、UI側の情景状態が更新されず「窓をあける」が最後まで出なかった。
// ここでは本物の情景メニューから「北寺尾の坂の街」を選ぶ＝初見の人がたどる道のりそのものを再現する。
// 使い方: PORT=4890 node scripts/qa-flow.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-30/ui'
fs.mkdirSync(outDir, { recursive: true })
const log = []
const say = (s) => { console.log(s); log.push(s) }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${PORT}/seasons/`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1500)

// 画面に「実際に見えている」案内文とボタンだけを拾う
const guide = () => page.evaluate(() => {
  const vis = (e) => { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < 0.05) return false
    for (let p = e.parentElement; p; p = p.parentElement) { const pc = getComputedStyle(p); if (pc.display === 'none' || pc.visibility === 'hidden' || parseFloat(pc.opacity) < 0.05) return false } return true }
  const pick = (s) => [...document.querySelectorAll(s)].filter(vis).map((e) => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 70)).filter(Boolean)
  return { 案内: pick('.lookhint'), 情景名: pick('.hud--show .hud__scene'), 居場所: pick('.modepill--on'), ボタン: pick('.topbar .iconbtn'), 段階: document.querySelector('.stagedots--on') ? '表示中' : '非表示' }
})
// そのボタンの真ん中を指で突いたとき、実際に何が受け取るか
const hit = () => page.evaluate(() => {
  const b = document.querySelector('.iconbtn--stage')
  if (!b) return { 有無: '無し' }
  const r = b.getBoundingClientRect()
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  const st = document.querySelector('.town3d-stage')
  return {
    文言: b.textContent.trim(), 見えている: getComputedStyle(b).opacity, 位置: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    指が当たる物: top ? (top.className || top.tagName).toString().slice(0, 40) : 'なし',
    ボタン自身か: !!(top && (top === b || b.contains(top))),
    stageのpointerEvents: st ? getComputedStyle(st).pointerEvents : '-', stageのzIndex: st ? getComputedStyle(st).zIndex : '-',
    topbarのzIndex: getComputedStyle(document.querySelector('.topbar')).zIndex,
  }
})
const press = async () => { const h = await hit(); say(`      stageBtn: ${JSON.stringify(h)}`); await page.evaluate(() => { const b = document.querySelector('.iconbtn--stage'); if (b) b.click() }) }
const step = async (n, label, act) => {
  if (act) await act()
  await page.mouse.move(195, 500)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${outDir}/flow_${String(n).padStart(2, '0')}.png` })
  const g = await guide()
  say(`   flow_${String(n).padStart(2, '0')}.png  ${label}`)
  say(`      見えている案内: ${JSON.stringify(g.案内)}   情景名: ${JSON.stringify(g.情景名)}   居場所: ${JSON.stringify(g.居場所)}`)
  say(`      押せるボタン: ${JSON.stringify(g.ボタン)}   段階表示: ${g.段階}`)
}

say('■ #9 初見の導線（390×844・本物の情景メニューから選ぶ）')
await step(1, '起動の間（gate）')
await step(2, '画面にふれて始めた（既定の情景）', async () => { await page.locator('.gate').click(); await page.waitForTimeout(4000) })
await step(3, '「情景」を開いた', async () => { await page.locator('.topbar .iconbtn', { hasText: '情景' }).first().click(); await page.waitForTimeout(1200) })
await step(4, '「北寺尾の坂の街」を選んだ（＝立体の街の窓辺）', async () => {
  const place = page.locator('.gallery button', { hasText: '北寺尾の坂の街' }).first()
  if (await place.count()) { await place.click(); await page.waitForTimeout(1200) }
  const scene = page.locator('.gallery button:not(.gallery__back)').first() // 先頭は「とじる」なので除く
  if (await scene.count()) { say(`      （選んだ情景: ${(await scene.textContent()).trim().slice(0, 30)}）`); await scene.click() }
  await page.waitForTimeout(9000)
})
await step(5, '「窓をあける」を押した', async () => { await press(); await page.waitForTimeout(3000) })
await step(6, '次の一歩を押した', async () => { await press(); await page.waitForTimeout(3500) })
await step(7, '次の一歩を押した（空へ）', async () => { await press(); await page.waitForTimeout(6000) })
await step(8, '次の一歩を押した（おりる／地上）', async () => { await press(); await page.waitForTimeout(8000) })

say(`\nエラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''}`)
fs.writeFileSync(`${outDir}/flow.txt`, log.join('\n'))
console.log('\nWROTE ' + outDir + '/flow.txt')
await browser.close()
