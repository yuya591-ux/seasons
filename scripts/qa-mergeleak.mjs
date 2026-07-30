// 情景を行き来したときの解放漏れを見る(2026-07-30)。統合メッシュは新しく作った物なので、捨て漏れると積み上がる。
// 立体の街(統合あり) ⇄ 谷戸(統合なし) を10往復し、毎回ジオメトリ数・テクスチャ数・シェーダー数・JSヒープ・canvas数を採る。
// 使い方: PORT=4890 node scripts/qa-mergeleak.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.PORT || '4890'
const LAPS = +(process.env.LAPS || 10)
const outDir = process.env.OUT || 'docs/qa/2026-07-30'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 393, height: 852 } })
const errs = []
page.on('pageerror', (e) => errs.push('PE:' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest|preload/i.test(m.text())) errs.push('CE:' + m.text().slice(0, 160)) })
const cdp = await page.context().newCDPSession(page)

await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(1000)

const snap = async () => {
  await cdp.send('HeapProfiler.collectGarbage') // ゴミを回収してから測る＝一時的な増分を数えない
  await page.waitForTimeout(400)
  return await page.evaluate(() => {
    const d = window.__town3dDraw ? window.__town3dDraw() : null
    return {
      geo: d ? d.geoMem : -1,
      tex: d ? d.texMem : -1,
      prog: d ? d.progs : -1,
      calls: d ? d.calls : -1,
      canvas: document.querySelectorAll('canvas').length,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    }
  })
}
const go = async (id, ms) => { await page.evaluate((i) => window.__applyScene(i), id); await page.waitForTimeout(ms) }

await go('kitaterao-window-3d', 5000)
const base = await snap()
const log = []
const say = (s) => { console.log(s); log.push(s) }
say(`基準（立体の街を1回表示した直後）: ジオメトリ=${base.geo} テクスチャ=${base.tex} シェーダー=${base.prog} 描画コール=${base.calls} canvas=${base.canvas} JSヒープ=${base.heap}MB`)
say('周回  ジオメトリ  テクスチャ  シェーダー  描画コール  canvas  JSヒープ(MB)  エラー累計')

const rows = []
for (let i = 1; i <= LAPS; i++) {
  await go('shishigaya-window-3d', 3800) // 谷戸＝統合コードが空振りする経路
  await go('kitaterao-window-3d', 4200) // 立体の街＝統合が働く経路
  const s = await snap()
  rows.push(s)
  say(
    `${String(i).padStart(3)}   ${String(s.geo).padStart(8)}  ${String(s.tex).padStart(9)}  ${String(s.prog).padStart(9)}  ${String(s.calls).padStart(9)}  ${String(s.canvas).padStart(6)}  ${String(s.heap).padStart(11)}  ${String(errs.length).padStart(8)}`,
  )
}

const last = rows[rows.length - 1]
const d = (k) => last[k] - base[k]
say(`\n10往復後の増分: ジオメトリ ${d('geo') >= 0 ? '+' : ''}${d('geo')} / テクスチャ ${d('tex') >= 0 ? '+' : ''}${d('tex')} / シェーダー ${d('prog') >= 0 ? '+' : ''}${d('prog')} / canvas ${d('canvas') >= 0 ? '+' : ''}${d('canvas')} / JSヒープ ${d('heap') >= 0 ? '+' : ''}${d('heap')}MB`)
// 1往復あたりの伸び（後半5往復の傾き）＝積み上がっているかどうかの判定
const mid = rows[Math.max(0, rows.length - 6)]
say(`後半5往復の伸び: ジオメトリ ${((last.geo - mid.geo) / 5).toFixed(1)}/往復  テクスチャ ${((last.tex - mid.tex) / 5).toFixed(1)}/往復  JSヒープ ${((last.heap - mid.heap) / 5).toFixed(1)}MB/往復`)
say(`エラー: ${errs.length}件${errs.length ? ' :: ' + errs.slice(0, 5).join(' | ') : ''}`)
const leak = (last.geo - mid.geo) / 5 > 5 || (last.tex - mid.tex) / 5 > 2 || last.canvas > base.canvas || errs.length
say(`判定: ${leak ? '⚠ 積み上がりの疑い' : '✅ 解放漏れなし（後半で増えていない）'}`)
fs.writeFileSync(`${outDir}/mergeleak.txt`, log.join('\n'))
console.log('WROTE ' + outDir + '/mergeleak.txt')
await browser.close()
process.exit(leak ? 1 : 0)
