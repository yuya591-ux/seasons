// 便11（2026-10-16・便10 #1=1 #2=2 #3=1 で作る便）の検査: 直しが1つずつ入っているかを、開発サーバー（既定 4963）の本物のページで見る。
// 使い方: node scripts/_bin11-kensa.mjs [ID…|all]   出力: QA_OUT（既定 docs/qa/2026-10-16_便11/gate）/kensa.json
//   K1 雲海: 雲海の入れ物に1枚の雲の面（材の鍵 cloudsea-sheet）があり、前の玉の重なり（頂点の色を持つ大きな形）が無い。
//      雲の面と同じ形の深さだけの面（cloudsea-sheet-depth・描く順 -1）があり、雲の面が夜と夕の琥珀色（uWarm）を持つ（便11 の外の目の見直しで足した）
//   K2 虹の輪: 雲海の上の虹の輪の描く順が、雲の面より後（雲の面の下に隠れない＝V24）
//   K3 遠山: 遠山が細かく割った山（周りの割り 48）で、前の六角錐（周りの割り 6）が残っていない
//   K4 煙: 銭湯・夕餉・臨海の煙の粒が縁のぼけた板（Sprite）で、前の白い球が残っていない
//   K5 雨の窓: 雨の窓の絵の計算が RAIN_LENS 1・RAIN_TRAIL 1 で組み立てられ、背景の画のぼけた写し（半分の大きさの canvas）が作られている
//   K6 海辺・K7 山あい: 絵の計算が WIN_DETAIL 1 で組み立てられている
import { chromium } from 'playwright'
import fs from 'node:fs'

const PORT = process.env.B11_PORT || 4963
const OUT = process.env.QA_OUT || 'docs/qa/2026-10-16_便11/gate'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
// 絵の計算の文と、canvas から作った画を控える口（ページを開く前に差し込む）
const hook = () => {
  const S = (window.__b11k = { frags: [], canvasTex: [] })
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const ss = P.shaderSource; P.shaderSource = function (sh, src) { if (/gl_FragColor|out vec4/.test(src)) S.frags.push(src); return ss.call(this, sh, src) }
    const ti = P.texImage2D; P.texImage2D = function (...a) { const src = a[a.length - 1]; if (src instanceof HTMLCanvasElement) S.canvasTex.push([src.width, src.height]); return ti.apply(this, a) }
  }
}
async function open(scene, wait = 9000) {
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(hook)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && /shader|program|GLSL|compile|リンク|例外/i.test(m.text())) errs.push(m.text().slice(0, 300)) })
  await p.goto(`http://localhost:${PORT}/seasons/?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForTimeout(2500)
  await p.evaluate(() => { const g = document.querySelector('.gate'); if (g) g.click() }).catch(() => {})
  await p.waitForTimeout(1200)
  await p.evaluate((s) => window.__applyScene(s), scene) // 控えは空にしない（アプリが最初から同じ絵の計算で始まると、組み立て直さないため）
  await p.waitForTimeout(wait)
  return { ctx, p, errs }
}
const CHECKS = {}
const def = (id, fn) => { CHECKS[id] = fn }
// 立体の街の検査は1つのページで済ませる
let town = null
async function townInfo() {
  if (town) return town
  const { ctx, p, errs } = await open('kitaterao-window-3d', 12000)
  const r = await p.evaluate(() => {
    const g = window.__shGet && window.__shGet(); if (!g) return { err: '撮影の口（__shGet）が無い' }
    const out = { sheet: 0, sheetWarm: false, depth: 0, sheetOrder: null, blobs: 0, glory: null, cone48: 0, cone6big: 0, sprites: 0, smokeSpheres: 0 }
    g.scene.traverse((o) => {
      const m = o.material, geo = o.geometry
      if (o.isMesh && m && m.customProgramCacheKey && m.customProgramCacheKey() === 'cloudsea-sheet') { out.sheet++; out.sheetOrder = o.renderOrder; out.sheetWarm = String(m.onBeforeCompile).includes('c = mix(c, uWarm, uWarmAmt') }
      if (o.isMesh && m && m.customProgramCacheKey && m.customProgramCacheKey() === 'cloudsea-sheet-depth' && o.renderOrder === -1 && m.depthWrite && !m.colorWrite) out.depth++
      if (o.isMesh && m && m.customProgramCacheKey && m.customProgramCacheKey() === 'cloudsea' && geo.attributes.color && geo.attributes.position.count > 1000) out.blobs++
      if (o.isMesh && geo && geo.type === 'CircleGeometry' && geo.parameters.radius === 16 && m.map) out.glory = o.renderOrder
      if (o.isMesh && geo && geo.type === 'ConeGeometry') { const q = geo.parameters; if (q.radialSegments === 48 && q.heightSegments === 12) out.cone48++; if (q.radialSegments === 6 && q.radius >= 56) out.cone6big++ }
      if (o.isSprite && m.map && m.map.image && m.map.image.width === 64 && m.depthWrite === false && [0xe8e4dc, 0xd8dde2].includes(m.color.getHex())) out.sprites++
      if (o.isMesh && geo && geo.type === 'SphereGeometry' && m.transparent && m.depthWrite === false && [0xe8e4dc, 0xd8dde2].includes(m.color.getHex())) out.smokeSpheres++
    })
    return out
  })
  await ctx.close()
  town = { ...r, errs }
  return town
}
def('K1', async () => { const t = await townInfo(); return { pass: t.sheet === 1 && t.blobs === 0 && t.depth === 1 && t.sheetWarm && !t.errs.length, sheet: t.sheet, blobs: t.blobs, depth: t.depth, sheetWarm: t.sheetWarm, errs: t.errs } })
def('K2', async () => { const t = await townInfo(); return { pass: t.glory != null && t.sheetOrder != null && t.glory > t.sheetOrder, glory: t.glory, sheetOrder: t.sheetOrder } })
def('K3', async () => { const t = await townInfo(); return { pass: t.cone48 >= 30 && t.cone6big === 0, cone48: t.cone48, cone6big: t.cone6big } })
def('K4', async () => { const t = await townInfo(); return { pass: t.sprites >= 6 && t.smokeSpheres === 0, sprites: t.sprites, smokeSpheres: t.smokeSpheres } })
async function fragOf(scene, needle) {
  const { ctx, p, errs } = await open(scene)
  const r = await p.evaluate((nd) => { const f = window.__b11k.frags.filter((s) => s.includes(nd)); return { n: f.length, last: f.length ? f[f.length - 1] : '', canvasTex: window.__b11k.canvasTex } }, needle)
  await ctx.close()
  return { ...r, errs }
}
def('K5', async () => {
  const r = await fragOf('summer-rain-dusk', 'staticDroplets')
  const lens = /#define RAIN_LENS 1\b/.test(r.last), trail = /#define RAIN_TRAIL 1\b/.test(r.last), blurTex = r.canvasTex.some(([w, h]) => Math.abs(w - 496) <= 1 && Math.abs(h - 297) <= 1)
  return { pass: r.n > 0 && lens && trail && blurTex && !r.errs.length, frags: r.n, lens, trail, blurTex, canvasTex: r.canvasTex, errs: r.errs }
})
def('K6', async () => { const r = await fragOf('summer-dusk-seaside', 'lhTop'); const ok = /#define WIN_DETAIL 1\b/.test(r.last); return { pass: r.n > 0 && ok && !r.errs.length, detail: ok, errs: r.errs } })
def('K7', async () => { const r = await fragOf('summer-morning-mountains', 'mcl'); const ok = /#define WIN_DETAIL 1\b/.test(r.last); return { pass: r.n > 0 && ok && !r.errs.length, detail: ok, errs: r.errs } })

let ids = process.argv.slice(2)
if (!ids.length || ids.includes('all')) ids = Object.keys(CHECKS)
const res = {}
let fail = 0
for (const id of ids) {
  let r
  try { r = await CHECKS[id]() } catch (e) { r = { pass: false, threw: String(e).slice(0, 300) } }
  res[id] = r; if (!r.pass) fail++
  console.log(id, r.pass ? '合格' : '不合格', JSON.stringify(r).slice(0, 220))
}
await b.close()
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(`${OUT}/${process.env.KENSA_NAME || 'kensa'}.json`, JSON.stringify({ at: new Date().toISOString(), port: PORT, pass: !fail, ...res }, null, 1))
console.log(`検査の終わり: ${ids.length - fail}/${ids.length} 合格`)
process.exit(fail ? 1 : 0)
