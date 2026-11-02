import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
const p = await ctx.newPage()
await p.goto('http://localhost:4985/seasons/?dev=1', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1000)
await p.evaluate(() => window.__applyScene('kitaterao-window-3d'))
for (let i = 0; i < 80; i++) { await p.waitForTimeout(400); if (await p.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw()))) break }
await p.addStyleTag({ content: '.ui,.topbar,.hud,.lookhint,.toast,.stagedots,button{display:none !important}' })
await p.evaluate(() => window.__town3dWindow(true)); await p.waitForTimeout(4000)
const O = 'docs/qa/2026-11-02_便15/crop'
await p.screenshot({ path: `${O}/v38-a-both.png`, clip: { x: 150, y: 0, width: 200, height: 120 } })
await p.evaluate(() => { window.__b15T.sun().glow.visible = false }); await p.waitForTimeout(600)
await p.screenshot({ path: `${O}/v38-b-noglow.png`, clip: { x: 150, y: 0, width: 200, height: 120 } })
await p.evaluate(() => { window.__b15T.sun().glow.visible = true; window.__b15T.sun().disk.visible = false }); await p.waitForTimeout(600)
await p.screenshot({ path: `${O}/v38-c-nodisk.png`, clip: { x: 150, y: 0, width: 200, height: 120 } })
const info = await p.evaluate(() => { const T = window.__b15T, V = T.THREE, cam = T.getActive().camera; const s = T.sun(); const pr = (o) => { const v = o.position.clone().project(cam); return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)] }; const sprites = []; T.scene.traverse((o) => { if (o.isSprite && o.visible) { const v = o.getWorldPosition(new V.Vector3()).project(cam); if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) sprites.push([Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight), +o.scale.x.toFixed(1), +o.material.opacity.toFixed(2)]) } }); return { glow: pr(s.glow), disk: pr(s.disk), sprites: sprites.filter((q) => q[1] < 150) } })
console.log(JSON.stringify(info))
await b.close()
