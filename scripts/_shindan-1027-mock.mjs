// 便14 診断の使い捨て: 谷戸の向かいの斜面の色の候補の画（本体は変えない。開発サーバー 4953 の __shGet で地面の頂点色だけ塗り直す）
import { chromium } from 'playwright'
import fs from 'node:fs'
const OUT = 'docs/qa/2026-10-27_seasons/mocks'; fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
for (const scene of ['shishigaya-window-3d', 'shishigaya-window-3d-autumn']) {
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message))
  await page.goto('http://localhost:4953/seasons/?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(4000); await page.locator('.gate').click().catch(() => {}); await page.waitForTimeout(1500)
  await page.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stagedots, .zoomctl{display:none !important}' })
  await page.evaluate((s) => window.__applyScene(s), scene); await page.waitForTimeout(9000)
  const tag = scene.endsWith('autumn') ? 'autumn' : 'summer'
  await page.screenshot({ path: `${OUT}/yato-${tag}-1-imanomama.png` })
  for (const [key, forest, keep] of [['2-shitakusa', 0x4f5e36, 0.0], ['3-shitakusa-tsuchi', 0x5a6238, 0.35]]) {
    const n = await page.evaluate(([forest, keep, autumn]) => {
      const { scene, THREE } = window.__shGet(); let hit = 0
      scene.traverse((o) => {
        const g = o.geometry; if (!o.isMesh || !g || !g.parameters || g.parameters.width !== 470) return
        if (!g.userData.orig) g.userData.orig = g.attributes.color.array.slice()
        const col = g.attributes.color, nrm = g.attributes.normal, orig = g.userData.orig
        const cF = new THREE.Color(autumn ? 0x6a5a34 : forest), cE = new THREE.Color(0x8a7550), t = new THREE.Color()
        for (let i = 0; i < col.count; i++) {
          const slope = Math.max(0, Math.min(1, (1 - nrm.getY(i)) * 3.0))
          t.setRGB(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2])
          // 前の土の寄せ（slope*0.82）を、下草の色へ置き換える（土を keep だけ残す）
          const tgt = cF.clone().lerp(cE, keep)
          t.lerp(tgt, slope * 0.82)
          col.setXYZ(i, t.r, t.g, t.b)
        }
        col.needsUpdate = true; hit++
      })
      return hit
    }, [forest, keep, tag === 'autumn'])
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/yato-${tag}-${key}.png` })
    console.log(scene, key, 'ground meshes', n)
  }
  console.log(scene, 'errors', errs)
  await ctx.close()
}
await b.close()
