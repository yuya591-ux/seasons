// 便4: 霧の層の重さの切り分け（記録だけ）。iPhone の幅で、同じページの同じ眺めを、霧の層あり・なし（混ざり方0＝計算を飛ばす）で交互に3回ずつ測る。
// 使い方: 開発サーバー 4961（_bin4-vite.config.mjs）を起動してから node scripts/_bin4-mistcost.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
const src = fs.readFileSync('scripts/qa-bin4.mjs', 'utf8')
const inj = src.slice(src.indexOf('const INJECT = () => {'), src.indexOf('\nasync function open('))
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
await p.goto('http://localhost:4961/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForTimeout(3000)
await p.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }); await p.waitForTimeout(1500)
await p.evaluate(() => window.__applyScene('kitaterao-window-3d')); await p.waitForTimeout(11000)
await p.evaluate(inj + '; INJECT()'); await p.evaluate(() => window.__b4.setup())
const run = async (tag) => { const out = []; for (let i = 0; i < 3; i++) { await p.evaluate(() => window.__town3dMist(null)); out.push(['あり', (await p.evaluate(() => window.__b4.measureNow(60))).ms]); await p.evaluate(() => window.__town3dMist({ amount: 0 })); out.push(['なし', (await p.evaluate(() => window.__b4.measureNow(60))).ms]) } await p.evaluate(() => window.__town3dMist(null)); console.log(tag, JSON.stringify(out)) }
await run('窓辺')
await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(2200)
await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
await p.evaluate(() => window.__town3dFlyPose(0, 40, 40, Math.PI, -0.2)); await p.waitForTimeout(3000)
await run('飛行')
await b.close()
