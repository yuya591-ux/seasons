// 使い捨て（便3・設計案の下見）: 開発サーバー 4952（_shindan-vite.config.mjs）で、水面と霧がよく見える眺めを探す。本体は変えない。
// 使い方: node scripts/_bin3-explore.mjs <情景ID> <名前:x,y,z,yaw,pitch> ...（名前 window は窓辺）
import { chromium } from 'playwright'
import fs from 'node:fs'

const [scene = 'kitaterao-window-3d', ...poses] = process.argv.slice(2)
const OUT = 'docs/qa/2026-10-13_便3/mocks/explore'
fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:4952/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate((s) => window.__applyScene(s), scene)
await p.waitForTimeout(10000)
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="low"]{display:none !important}' })
await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(2500)
await p.evaluate(() => { const s = window.__town3dDrift; if (s) s(0) })
let flying = false
for (const ps of poses) {
  const [name, v] = ps.split(':')
  if (name !== 'window') {
    if (!flying) { await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(2500); flying = true }
    const [x, y, z, yaw, pitch] = v.split(',').map(Number)
    await p.evaluate(([x, y, z, yaw, pitch]) => window.__town3dFlyPose(x, y, z, yaw, pitch), [x, y, z, yaw, pitch])
    await p.waitForTimeout(3500)
  }
  await p.mouse.move(640, 360); await p.mouse.move(641, 361); await p.waitForTimeout(500)
  await p.screenshot({ path: `${OUT}/${scene}-${name}.png` })
}
console.log(errs.length ? 'ERR ' + errs.slice(0, 3).join(' | ') : 'エラー無し')
await b.close()
