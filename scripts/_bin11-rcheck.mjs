// 便11（2026-10-16）の確かめ: 前のコード（4967）と後のコード（4968）を _bin11r-vite.config.mjs で起動し、立体の街の情景ごとに、
// 遠山・煙・雲海の後と町の終わりで控えた R() の値の並びが同じかを見る（同じ＝町の配置が変わっていない）。
// 使い方: node scripts/_bin11-rcheck.mjs [情景ID…]   出力: QA_OUT（既定 docs/qa/2026-10-16_便11/gate）/rcheck.json
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.env.QA_OUT || 'docs/qa/2026-10-16_便11/gate'
const scenes = process.argv.slice(2).length ? process.argv.slice(2) : ['kitaterao-window-3d', 'shishigaya-window-3d', 'shishigaya-window-3d-snow', 'shishigaya-yato-3d']
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const read = async (port, sid) => {
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForTimeout(2500)
  await p.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {})
  await p.waitForTimeout(1200)
  await p.evaluate(() => { window.__b11R = [] })
  await p.evaluate((s) => window.__applyScene(s), sid)
  await p.waitForFunction(() => (window.__b11R || []).some((r) => r[0] === '町の終わり'), null, { timeout: 60000 }).catch(() => {})
  const r = await p.evaluate(() => window.__b11R || [])
  await ctx.close()
  return { r, errs }
}
const res = {}
let same = true
for (const sid of scenes) {
  const a = await read(4967, sid), c = await read(4968, sid)
  const eq = a.r.length > 0 && JSON.stringify(a.r) === JSON.stringify(c.r)
  if (!eq) same = false
  res[sid] = { same: eq, before: a.r, after: c.r, errs: [...a.errs, ...c.errs] }
  console.log(sid, eq ? '同じ' : '違う', JSON.stringify(a.r), JSON.stringify(c.r), a.errs.length + c.errs.length ? 'エラー ' + [...a.errs, ...c.errs].slice(0, 2).join(' | ') : '')
}
await b.close()
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(`${OUT}/rcheck.json`, JSON.stringify({ at: new Date().toISOString(), pass: same, ...res }, null, 1))
console.log(same ? 'R() の並び: 全部同じ' : 'R() の並び: 違う情景がある')
process.exit(same ? 0 : 1)
