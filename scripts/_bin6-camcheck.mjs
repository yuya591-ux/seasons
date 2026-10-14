// 使い捨て（便6）: 低空飛行の眺めでカメラを固定した後、実際に描いたカメラの位置・向き・画角を、前のコード（4964）と後のコード（4963）で読み比べる。
import { chromium } from 'playwright'
const CAM = [9.8, 48, 38.8, -19.4, -15.9, -32.4, 73.6]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
for (const base of ['http://localhost:4964/seasons/', 'http://localhost:4963/seasons/']) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } })
  await ctx.addInitScript(() => { try { const k = 'seasons.state.v1'; const st = JSON.parse(localStorage.getItem(k) || '{}'); st.sceneId = 'kitaterao-window-3d'; st.sceneAt = Date.now(); localStorage.setItem(k, JSON.stringify(st)) } catch {} })
  const p = await ctx.newPage()
  await p.goto(base + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 120000 }); await wait(2500)
  await p.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {}); await wait(1500)
  await p.evaluate(() => window.__applyScene('kitaterao-window-3d')); await wait(11000)
  await p.evaluate(() => window.__town3dWindow(true)); await wait(3000)
  await p.evaluate(() => window.__town3dFlyToggle(true)); await wait(3000)
  const [x, y, z, lx, , lz] = CAM, dx = lx - x, dz = lz - z, d = Math.hypot(dx, dz)
  await p.evaluate((a) => window.__town3dFlyPose(...a), [x - dx / d * 5, y, z - dz / d * 5, Math.atan2(dx, -dz), 0]); await wait(1500)
  const r = await p.evaluate(async (c) => {
    const { camera, composer } = window.__shGet(); const orig = composer.render.bind(composer); const seen = []
    composer.render = (...a) => { camera.position.set(c[0], c[1], c[2]); camera.lookAt(c[3], c[4], c[5]); if (camera.fov !== c[6]) { camera.fov = c[6]; camera.updateProjectionMatrix() } camera.updateMatrixWorld(); const rp = composer.passes && composer.passes[0]; seen.push({ same: rp && rp.camera === camera, pos: camera.position.toArray().map((v) => +v.toFixed(2)), fov: camera.fov, zoom: camera.zoom, up: camera.up.toArray().map((v) => +v.toFixed(3)), rpPos: rp && rp.camera && rp.camera.position.toArray().map((v) => +v.toFixed(2)) }); return orig(...a) }
    await new Promise((res) => setTimeout(res, 3000))
    return seen.slice(-1)[0]
  }, CAM)
  console.log(base, JSON.stringify(r))
  await ctx.close()
}
await b.close()
