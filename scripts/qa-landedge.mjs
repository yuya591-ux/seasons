// 陸の縁を測る(2026-07-30)。#10の「外側が無人」が、本当に無人なのか「そこはもう海」なのかを分ける。
// 各エリアの中心から8方位に地面の高さを刻み、海面(-10)より上が続く最遠の距離＝陸の縁を出す。
// 使い方: PORT=4890 node scripts/qa-landedge.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'
const PORT = process.env.PORT || '4890'
const out = process.env.OUT || 'docs/qa/2026-07-30'
const log = []
const say = (s) => { console.log(s); log.push(s) }

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 393, height: 852 } })
await page.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(6000)

const AREAS = [
  { key: '江戸', x: 640, z: -46, R: 124, 人の最外縁: 65.1 },
  { key: '大正', x: -640, z: -30, R: 112, 人の最外縁: 44.8 },
  { key: '戦国', x: 140, z: -640, R: 54, 人の最外縁: 29.8 },
  { key: '現代home', x: 0, z: -30, R: 120, 人の最外縁: 119.3 },
]
say('■ 陸の縁（中心から8方位・海面-10mより上が続く最遠の距離）')
say('   エリア      方位ごとの陸の縁(m)                                 平均  人が居る最外縁  無人の陸')
for (const a of AREAS) {
  const edges = await page.evaluate(([cx, cz, R]) => {
    const res = []
    for (let k = 0; k < 8; k++) {
      const ang = k / 8 * 6.2832
      let last = 0
      for (let d = 2; d <= R; d += 2) {
        const h = window.__town3dGroundAt(cx + Math.sin(ang) * d, cz - Math.cos(ang) * d)
        if (h > -9.5) last = d; else break
      }
      res.push(last)
    }
    return res
  }, [a.x, a.z, a.R])
  const avg = edges.reduce((s, v) => s + v, 0) / edges.length
  say(`   ${a.key.padEnd(10)} [${edges.map((e) => String(e).padStart(3)).join(',')}]  ${avg.toFixed(1).padStart(5)}m ${String(a.人の最外縁).padStart(12)}m ${(avg - a.人の最外縁).toFixed(1).padStart(8)}m`)
}
fs.writeFileSync(`${out}/landedge.txt`, log.join('\n'))
console.log('WROTE ' + out + '/landedge.txt')
await browser.close()
