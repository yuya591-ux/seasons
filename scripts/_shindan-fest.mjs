// 使い捨て（shindan 2026-10-12）: 夏の夕方の町を「今日のまま」と「祭りを必ず開く（?fest=1）」で組み、祭り以外の配置（木の数・埋まった木・住人の位置）が変わるかを比べる
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const q of ['?dev=1', '?dev=1&fest=1']) {
  const p = await (await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1 })).newPage()
  await p.goto('http://localhost:4951/seasons/' + q, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1200)
  await p.evaluate(() => window.__applyScene('kitaterao-window-3d-sunset')); await p.waitForTimeout(7000)
  const a = await p.evaluate(() => { const t = window.__town3dTownAudit(); const r = window.__town3dResInfo ? window.__town3dResInfo() : null; return { trees: t.trees, buried: t.buriedTrees, treeLeft: t.treeLeft, res: r ? JSON.stringify(r).slice(0, 160) : null } })
  console.log(q, JSON.stringify(a))
  await p.context().close()
}
await b.close()
