import { chromium } from 'playwright'
import fs from 'node:fs'
const out = process.argv[2]
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 800, height: 600 }, serviceWorkers: 'block' }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p)
await p.goto('http://localhost:4970/seasons/?dev=1&kamoouter=0', { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 4; i++) { try { await p.waitForFunction(() => !!window.__applyScene, null, { timeout: 60000 }); await p.locator('.gate').click({ timeout: 5000 }).catch(() => {}); break } catch (e) { await p.waitForTimeout(3000) } }
await p.waitForTimeout(800)
await p.evaluate(() => window.__applyScene('autumn-dusk-corner-room')); await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }); await p.waitForFunction(() => window.__town3dKamo && window.__town3dKamo(), null, { timeout: 120000 }); await p.waitForTimeout(3000); await p.evaluate(() => window.__applyScene('kitaterao-window-3d')); await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 }); await p.waitForTimeout(3000)
await cdp.send('HeapProfiler.collectGarbage'); await p.waitForTimeout(500); await cdp.send('HeapProfiler.collectGarbage')
const ws = fs.createWriteStream(out); cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => ws.write(e.chunk))
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false }); ws.end(); await new Promise((r) => ws.on('finish', r))
console.log('写し', (fs.statSync(out).size / 1e6).toFixed(0), 'MB')
await b.close()
