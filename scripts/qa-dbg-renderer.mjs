// 一時的な切り分け用。WebGLRenderer の render がプロトタイプに在るかを見る。
import { chromium } from 'playwright'
const PORT = process.env.PORT || '4890'
const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 393, height: 852 } })).newPage()
page.on('pageerror', (e) => console.log('PAGEERR ' + e.message))
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(7000)
const urls = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /three/i.test(n)))
const info = await page.evaluate(async (list) => {
  for (const u of list) { try { const m = await import(/* @vite-ignore */ u); if (m && m.Object3D && m.WebGLRenderer) { globalThis.__T = m; break } } catch { /* 次 */ } }
  const T = globalThis.__T
  if (!T) return { err: 'threeが無い' }
  const RP = T.WebGLRenderer.prototype
  const own = Object.getOwnPropertyNames(RP)
  return { protoRenderの型: typeof RP.render, プロトタイプの鍵数: own.length, 先頭20: own.slice(0, 20), コンストラクタ冒頭: String(T.WebGLRenderer).slice(0, 160).replace(/\n/g, ' ') }
}, urls)
console.log(JSON.stringify(info, null, 1))
await browser.close()
