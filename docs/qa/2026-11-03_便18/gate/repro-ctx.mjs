// 便18 の調べ: スモークの「情景パネル」で2Dの情景のシェーダーが組めなくなった（文脈が失われた）のを、GPU の無い画面なし（スモークと同じ）で再現する
// 角部屋（鴨川）を何回か開いてから2Dの情景（雨の窓）を開き、エラーの有無を出す
// 使い方: node docs/qa/2026-11-03_便18/gate/repro-ctx.mjs [回数=6] [追加のクエリ]
import { chromium } from 'playwright'
const N = +(process.argv[2] || 6), extra = process.argv[3] || ''
const BASE = `http://localhost:${process.env.PORT || 4961}/seasons/?dev=1${extra ? '&' + extra : ''}`
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 480, height: 720 } })
const errs = []; let cur = ''
p.on('console', (m) => { if (m.type() === 'error') errs.push(cur + ': ' + m.text().slice(0, 120)); if (/context lost|CONTEXT_LOST/i.test(m.text())) errs.push(cur + ': ' + m.text().slice(0, 120)) })
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(1200)
const ids = ['autumn-dusk-corner-room', 'autumn-rain-night-corner-room', 'spring-dusk-corner-room', 'spring-morning-corner-room', 'summer-morning-corner-room', 'winter-snow-dusk-corner-room']
for (let k = 0; k < N; k++) { cur = ids[k % 6]; await p.evaluate((i) => window.__applyScene(i), cur); for (let j = 0; j < 30; j++) { const ok = await p.evaluate(() => !!(window.__town3dDraw && window.__town3dDraw())).catch(() => false); if (ok) break; await p.waitForTimeout(500) } await p.waitForTimeout(500) }
cur = 'summer-rain-dusk'; await p.evaluate((i) => window.__applyScene(i), cur); await p.waitForTimeout(3000)
console.log(`角部屋 ${N} 回 → 雨の窓: エラー ${errs.length}${errs.length ? '（' + [...new Set(errs)].slice(0, 3).join(' | ') + '）' : ''}`)
await b.close()
