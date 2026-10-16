// 本番3（2026-10-16）の公開のページの確かめ: 公開と手元（dist）の precache-manifest と、画面のプログラム・見た目の CSS・町の部品の SHA-256 を照らし、
// 便11 の直しの印（雲海の深さだけの面・雨の窓の RAIN_LENS／RAIN_TRAIL・海辺と山あいの WIN_DETAIL）が公開の部品に入っているかを見る。
// 撮影は _bin11-shot.mjs と同じ型で、行き先を公開のアドレスにした（本物の GPU・iPhone の幅）。
// 使い方: node scripts/_honban3-live.mjs check   → docs/qa/2026-10-16_本番3/live-check.txt
//         node scripts/_honban3-live.mjs shot <情景ID> <眺め still|fly=x,y,z,yaw,pitch> <名前> [wait=ms]
import { chromium } from 'playwright'
import fs from 'node:fs'
import crypto from 'node:crypto'

const LIVE = 'https://yuya591-ux.github.io/seasons/'
const OUT = 'docs/qa/2026-10-16_本番3'
const [mode, ...args] = process.argv.slice(2)
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const get = async (p) => { const r = await fetch(LIVE + p + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(p + ' ' + r.status); return Buffer.from(await r.arrayBuffer()) }

if (mode === 'check') {
  const lines = []
  const liveMan = (await get('precache-manifest.json')).toString()
  const localMan = fs.readFileSync('dist/precache-manifest.json', 'utf8')
  lines.push(`公開と手元の precache-manifest が同じ: ${liveMan.trim() === localMan.trim()}`)
  const assets = [...new Set(liveMan.match(/assets\/[^"]+\.(?:js|css)/g) || [])]
  const main = assets.filter((a) => /assets\/index-/.test(a))
  lines.push(`公開の画面のプログラム: ${main.join('・')}`)
  const town = fs.readdirSync('dist/assets').filter((f) => /^town3dViewer-.*\.js$/.test(f)).map((f) => 'assets/' + f)
  const bodies = {}
  for (const a of [...main, ...town]) {
    const lb = await get(a)
    bodies[a] = lb.toString()
    const lh = sha(lb), dh = fs.existsSync('dist/' + a) ? sha(fs.readFileSync('dist/' + a)) : '(手元に無い)'
    lines.push(`SHA-256 ${a} 公開・手元 ${lh === dh ? '一致' : '違う'} ${lh}${lh === dh ? '' : ' / ' + dh}`)
  }
  const idx = main.filter((a) => a.endsWith('.js')).map((a) => bodies[a]).join('')
  const tw = town.map((a) => bodies[a]).join('')
  lines.push(`公開の部品に便11 の直しが入っている: 雲海の深さだけの面 ${tw.includes('cloudsea-sheet-depth')}・RAIN_LENS 1 ${idx.includes('#define RAIN_LENS 1')}・RAIN_TRAIL 1 ${idx.includes('#define RAIN_TRAIL 1')}・WIN_DETAIL 1 ${idx.includes('#define WIN_DETAIL 1')}`)
  fs.writeFileSync(`${OUT}/live-check.txt`, lines.join('\n') + '\n')
  console.log(lines.join('\n'))
  process.exit(lines.some((l) => /違う|false/.test(l)) ? 1 : 0)
}

if (mode === 'shot') {
  const [scene, view = 'still', name = 'shot', ...rest] = args
  const opt = Object.fromEntries(rest.map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)] }))
  const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
  const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|manifest|preload/i.test(m.text())) errs.push(m.text().slice(0, 300)) })
  await p.goto(`${LIVE}?dev=1`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.waitForTimeout(3000)
  await p.locator('.gate').click().catch(() => {})
  await p.waitForTimeout(1500)
  await p.evaluate((s) => window.__applyScene(s), scene)
  await p.waitForTimeout(+(opt.wait || 20000))
  await p.addStyleTag({ content: '.ui, .topbar, .hud, .lookhint, .toast, .stage-dots, .t3d-zoom, [class*="zoom"], [class*="gauge"], [class*="pad"], [class*="stick"], [class*="cruise"], [class*="town3d-low"], [class*="fly"], [class*="hint"], [class*="guide"], [class*="tip"], button{display:none !important}' })
  if (view.startsWith('fly=')) {
    const a = view.slice(4).split(',').map(Number)
    await p.evaluate(() => window.__town3dFlyToggle(true)); await p.waitForTimeout(3000)
    await p.evaluate((a) => window.__town3dFlyPose(...a), a); await p.waitForTimeout(8000)
  }
  const gpu = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : '' })
  const file = `${OUT}/${name}.png`
  const buf = await p.screenshot({ path: file })
  // 真ん中の帯（高さの20〜70%）の明るさの平均と振れ（黒い画面・白飛びでないかの目安）
  const band = await p.evaluate(async (b64) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode()
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0)
    const y0 = Math.floor(im.height * 0.2), y1 = Math.floor(im.height * 0.7), d = g.getImageData(0, y0, im.width, y1 - y0).data
    let s = 0, s2 = 0, n = 0
    for (let i = 0; i < d.length; i += 16) { const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += v; s2 += v * v; n++ }
    const m = s / n; return { mean: +m.toFixed(1), std: +Math.sqrt(s2 / n - m * m).toFixed(0) }
  }, buf.toString('base64'))
  const rec = { file, scene, view, gpu, middleBand: band, errs: [...new Set(errs)] }
  fs.appendFileSync(`${OUT}/live-shot.txt`, JSON.stringify(rec) + '\n')
  console.log(JSON.stringify(rec))
  await b.close()
}
