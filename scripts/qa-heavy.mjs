// 項目#1(2026-07-28): 窓辺で描画コールを食っている「重い建物」の正体を出す
// 出力: 上位childのメッシュ数・材質の内訳・位置 → どの材質でまとめれば描画コールが減るかの当てどころ
import { chromium } from 'playwright'
import fs from 'node:fs'
const port = process.env.PORT || '4890'
const outDir = process.env.OUT || 'docs/qa/2026-07-28'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 393, height: 852 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${port}/seasons/?dev=1`, { waitUntil: 'networkidle' })
await page.locator('.gate').click().catch(() => {})
await page.waitForTimeout(600)
await page.evaluate(() => window.__applyScene && window.__applyScene('kitaterao-window-3d'))
await page.waitForTimeout(4000)

const log = []
const say = (s) => { console.log(s); log.push(s) }

const draw = await page.evaluate(() => window.__town3dDraw())
say(`窓辺の描画コール: ${draw.calls} / 三角形: ${draw.tris}`)
say('建物統合: '+JSON.stringify(await page.evaluate(()=>window.__town3dMerge())))
const heavy = await page.evaluate((n) => window.__town3dHeavy(n), +(process.env.TOP || 20))
say(`town直下のchild: ${heavy.townChildren} / 10メッシュ以上の「重いchild」: ${heavy.heavyN}件・合計 ${heavy.heavyMeshSum}メッシュ`)
say('')
say('順位 メッシュ数 材質数 位置(x,z)  内訳(材質ごとのメッシュ数: 種別/色/透過/絵柄/頂点色/形状)')
heavy.rows.forEach((r, i) => {
  const t = r.top.map((m) => `${m.n}:${m.type.replace('Mesh', '').replace('Material', '')}/${m.col}${m.tr ? '/透' : ''}${m.map ? '/絵' : ''}${m.vc ? '/頂色' : ''}/${(m.geo || '').replace('Geometry', '')}`).join('  ')
  say(`${String(i + 1).padStart(2)}  ${String(r.n).padStart(4)}  ${String(r.mats).padStart(4)}  (${r.x},${r.z})  ${t}`)
})

say('')
say(`静的メッシュ ${heavy.静的メッシュ} / 動くメッシュ ${heavy.動くメッシュ} / 材質の種類 ${heavy.材質の種類}`)
say('棟をまたぐ統合の伸びしろ: ' + JSON.stringify(heavy.統合の伸びしろ))
say('材質上位20（同じ材質を使う静的メッシュの数）')
heavy.材質上位.forEach((m, i) => say(`${String(i + 1).padStart(3)}  ${String(m.n).padStart(5)}  ${m.type.replace('Mesh', '').replace('Material', '')}/${m.col}${m.tr ? '/透' : ''}${m.vc ? '/頂色' : ''}`))

// 材質をまたいだ全体像: カテゴリ別の描画コール寄与
const attr = await page.evaluate(() => window.__town3dAttribute())
say('')
say('カテゴリ別の描画コール寄与: ' + JSON.stringify(attr))

say('errors=' + errs.length + (errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''))
fs.writeFileSync(`${outDir}/heavy.txt`, log.join('\n'))
console.log('WROTE ' + outDir + '/heavy.txt')
await browser.close()
