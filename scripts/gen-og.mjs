// OGPカード(1200x630)を実シーン(実写の窓・夕暮れ)から生成し、隅に上品な作品名の印を焼く。
import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://localhost:4875/seasons/?dev=1', { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.addStyleTag({ content: '.ui{display:none !important}' })
await page.evaluate(() => window.__applyScene && window.__applyScene('summer-rain-dusk'))
await page.waitForTimeout(4000) // Flux写真の読み込み待ち
// 上品な作品名の印（左下・明朝・暖色の白・控えめ）
await page.evaluate(() => {
  const d = document.createElement('div')
  d.style.cssText = [
    'position:fixed','left:46px','bottom:40px','z-index:99999','pointer-events:none',
    "font-family:'Hiragino Mincho ProN','Yu Mincho',serif",
    'color:rgba(255,248,238,0.96)','text-shadow:0 2px 14px rgba(0,0,0,0.65)'
  ].join(';')
  d.innerHTML = "<div style='font-size:50px;letter-spacing:0.14em;font-weight:600;line-height:1'>窓辺</div>"
    + "<div style='font-size:18px;letter-spacing:0.42em;margin-top:10px;opacity:0.92'>MADOBE</div>"
  document.body.appendChild(d)
})
await page.waitForTimeout(200)
await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 90 })
console.log(errs.length ? 'エラー: ' + JSON.stringify(errs.slice(0,4)) : 'エラー無し: public/og.jpg 生成')
await browser.close()
