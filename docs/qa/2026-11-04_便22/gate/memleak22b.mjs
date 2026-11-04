// 便22: 情景を替えた後に、three の舞台（Scene）と描く物（Mesh）がいくつ生きているかを数える（GC の後・CDP の queryObjects）
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p)
await p.goto(`http://localhost:${process.env.PORT || 4961}/seasons/?dev=1${process.env.Q ? '&' + process.env.Q : ''}`, { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 4; i++) { try { await p.waitForFunction(() => !!window.__applyScene, null, { timeout: 60000 }); await p.locator('.gate').click({ timeout: 5000 }).catch(() => {}); break } catch (e) { await p.waitForTimeout(3000) } } await p.waitForTimeout(800)
const count = async () => {
  await cdp.send('HeapProfiler.collectGarbage')
  const res = {}
  for (const [k, expr] of [['Scene', 'Object.getPrototypeOf(window.__kamoProtoScene)'], ['Mesh', 'window.__kamoProtoMesh'], ['Renderer', 'window.__kamoProtoRenderer']]) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: expr }); if (!result.objectId) { res[k] = '?'; continue }
    const q = await cdp.send('Runtime.queryObjects', { prototypeObjectId: result.objectId }); const { result: n } = await cdp.send('Runtime.callFunctionOn', { objectId: q.objects.objectId, functionDeclaration: 'function(){return this.length}', returnByValue: true }); res[k] = n.value
  }
  res.MB = await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6)); return res
}
const seq = ['autumn-dusk-corner-room', 'kitaterao-window-3d', 'summer-morning-corner-room', 'kitaterao-window-3d', 'spring-dusk-corner-room', 'kitaterao-window-3d']
for (const id of seq) {
  await p.evaluate((i) => window.__applyScene(i), id)
  await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }).catch(() => {})
  if (/corner/.test(id)) { await p.waitForFunction(() => window.__town3dKamo && window.__town3dKamo() && window.__town3dKamo().outer, null, { timeout: 60000 }).catch(() => {}); await p.evaluate(() => { if (window.__kamoScene) { window.__kamoProtoScene = window.__kamoScene; window.__kamoProtoMesh = Object.getPrototypeOf(window.__kamoScene.children.find((c) => c.isMesh)) } }) }
  await p.waitForTimeout(1500)
  console.log(id.replace('-corner-room', '').replace('-window-3d', ''), JSON.stringify(await count()))
}
await b.close()
