// 便14 診断の使い捨て: 窓をあけるボタンの状態と、段を替えた後の検証の口を調べる。本体は変えない
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errs = []; page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4951/seasons/?dev=1', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(1500)
const st = () => page.evaluate(() => { const s = document.querySelector('.iconbtn--stage'); const cs = s && getComputedStyle(s); return { inline: s && s.style.display, disp: cs && cs.display, vis: cs && cs.visibility, text: s && s.textContent, scene: JSON.parse(localStorage.getItem('seasons.state.v1') || '{}').sceneId, back: document.querySelector('.iconbtn--back')?.style.display } })
console.log('起動直後', JSON.stringify(await st()))
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(6000)
console.log('__applyScene後', JSON.stringify(await st()))
// ギャラリーから選んだ時
await page.locator('.topbar .iconbtn', { hasText: '情景' }).click({ force: true }); await page.waitForTimeout(1200)
console.log('情景のパネル', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.panel button, .panel [role=button]')].slice(0, 12).map((e) => e.textContent.trim().slice(0, 20)))))
await page.keyboard.press('Escape')
console.log('stats', JSON.stringify(await page.evaluate(() => window.__town3dStats && window.__town3dStats())))
await page.locator('.topbar .iconbtn', { hasText: '設定' }).click({ force: true }); await page.waitForTimeout(900)
await page.locator('.chip', { hasText: 'こまやか' }).first().click({ force: true }); 
for (const t of [500, 1500, 4000, 8000]) { await page.waitForTimeout(t); console.log('こまやか後', t, JSON.stringify(await page.evaluate(() => { const s = window.__town3dStats && window.__town3dStats(); const c = document.querySelector('.town3d-stage canvas'); return { pr: s && s.pr, c: c && [c.width, c.height] } }))) }
console.log('errors', errs)
await b.close()
