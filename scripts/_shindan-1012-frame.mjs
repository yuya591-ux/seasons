// 使い捨て（shindan 2026-10-12・案の画 #2）: 横長の画面で窓辺の画角を変えて撮る（開発サーバー 4952 の撮影用の口を使う。本体は変えない）
import { chromium } from 'playwright'
const [dev = 'pc'] = process.argv.slice(2)
const DEV = { pc: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }, ipadL: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, iphone: { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } }[dev]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext(DEV)).newPage()
await p.goto('http://localhost:4952/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 }); await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1500)
await p.evaluate(() => window.__applyScene('kitaterao-window-3d')); await p.waitForTimeout(9000)
await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots{display:none !important}' })
const base = await p.evaluate(() => { const g = window.__shGet(); return { fov: g.camera.fov, aspect: g.camera.aspect } })
console.log(dev, '今の縦の画角', base)
const hfov = (v, a) => +(2 * Math.atan(Math.tan(v * Math.PI / 360) * a) * 180 / Math.PI).toFixed(1)
for (const [tag, f, pit] of [['0-ima', base.fov, null], ['1-yoseru', base.fov * 0.72, 0.1], ['2-ippai', base.fov * 0.55, 0.16]]) {
  if (pit != null) { await p.evaluate((pt) => window.__town3dSetView(0, pt), pit); await p.waitForTimeout(1500) }
  await p.evaluate((fv) => { const g = window.__shGet(); g.camera.fov = fv; g.camera.updateProjectionMatrix() }, f)
  await p.mouse.move(300, 300); await p.mouse.move(302, 302); await p.waitForTimeout(500)
  await p.screenshot({ path: `docs/qa/2026-10-12_seasons/mocks/${dev}-frame-${tag}.png` })
  console.log(tag, '縦', f.toFixed(1), '横', hfov(f, base.aspect))
}
await b.close()
