// 使い捨て（便12・構図の下調べ）: 1つのページで情景を開き、__town3dShotAt で決めた位置と向きから何枚も撮る（色の仕上げ無しの生の画）。
// 使い方: node scripts/_bin12-probe.mjs <情景ID> <出力の頭> "cx,cy,cz,lx,ly,lz,fov" …
import { chromium } from 'playwright'
import fs from 'node:fs'

const [scene, head, ...views] = process.argv.slice(2)
const PORT = process.env.B12_PORT || 4972
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage()
await p.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(3000)
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(1500)
await p.evaluate((s) => window.__applyScene(s), scene)
await p.waitForTimeout(9000)
for (let k = 0; k < views.length; k++) {
  const v = views[k].split(',').map(Number)
  const url = await p.evaluate((v) => window.__town3dShotAt(...v), v)
  const f = `${head}-${k}.png`
  fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'))
  console.log(f, views[k])
}
await b.close()
