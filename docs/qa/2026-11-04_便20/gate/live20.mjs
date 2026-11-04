// 便20 の本番の確かめ（本番5 の scripts/_honban5-live.mjs と同じ型）: 公開と手元（dist）の precache-manifest・画面のプログラム・町の部品・鴨川の部品・life.json の SHA-256 を照らし、
// 公開のページを本物の GPU で開いて、夏の夜の角部屋で五山の送り火を起こして撮る（PC の幅と iPhone の幅）
// 使い方: node docs/qa/2026-11-04_便20/gate/live20.mjs check  → honban/live-check.txt
//         node docs/qa/2026-11-04_便20/gate/live20.mjs shot   → honban/*.png と live-shot.txt
import { chromium } from 'playwright'
import fs from 'node:fs'
import crypto from 'node:crypto'
const LIVE = 'https://yuya591-ux.github.io/seasons/'
const OUT = 'docs/qa/2026-11-04_便20/honban'
fs.mkdirSync(OUT, { recursive: true })
const mode = process.argv[2]
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const get = async (p) => { const r = await fetch(LIVE + p + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error(p + ' ' + r.status); return Buffer.from(await r.arrayBuffer()) }
if (mode === 'check') {
  const lines = []
  const liveMan = (await get('precache-manifest.json')).toString(), localMan = fs.readFileSync('dist/precache-manifest.json', 'utf8')
  lines.push(`公開と手元の precache-manifest が同じ: ${liveMan.trim() === localMan.trim()}`)
  const files = fs.readdirSync('dist/assets').filter((f) => /^(index|town3dViewer|kamoTown)-.*\.js$/.test(f)).map((f) => 'assets/' + f)
  files.push('kamo/life.json', 'thumbs/summer-night-corner-room.jpg')
  for (const a of files) { try { const lb = await get(a), lh = sha(lb), dh = sha(fs.readFileSync('dist/' + a)); lines.push(`SHA-256 ${a} 公開・手元 ${lh === dh ? '一致' : '違う'} ${lh.slice(0, 16)}`) } catch (e) { lines.push(`× ${a} ${e.message}`) } }
  fs.writeFileSync(OUT + '/live-check.txt', lines.join('\n') + '\n'); console.log(lines.join('\n'))
} else if (mode === 'shot') {
  const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
  const lines = []
  for (const [dev, ctxOpt] of [['pc', { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }], ['iphone', { viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext({ ...ctxOpt, serviceWorkers: 'block' })
    await ctx.addInitScript(() => { try { localStorage.setItem('seasons.state.v1', JSON.stringify({ version: 2, sceneId: 'summer-night-corner-room', sceneAt: Date.now() })) } catch (e) { /* 無視 */ } })
    const p = await ctx.newPage(), errs = []
    p.on('pageerror', (e) => errs.push('PE ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
    await p.goto(LIVE + '?dev=1', { waitUntil: 'domcontentloaded', timeout: 90000 })
    await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(800)
    await p.evaluate(() => window.__applyScene('summer-night-corner-room'))
    await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 150000 }).catch(() => {})
    await p.waitForTimeout(1500)
    const ev = await p.evaluate(() => window.__town3dKamoEv ? window.__town3dKamoEv('okuribi') : 'no-hook')
    await p.waitForFunction(() => { const x = window.__town3dKamoLife && window.__town3dKamoLife(); return x && x.okuribi && x.okuribi.t >= 60 }, null, { timeout: 240000 }).catch(() => {})
    const l = await p.evaluate(() => window.__town3dKamoLife && window.__town3dKamoLife())
    await p.screenshot({ path: `${OUT}/${dev}-window.png` })
    lines.push(`${dev}: 出来事 ${ev}・送り火 t ${l && l.okuribi && l.okuribi.t}・灯り ${l && l.okuribi && JSON.stringify(l.okuribi.litBy)}・座る人 ${l && l.sitters}・電車 ${l && l.train && l.train.mode}・段 ${JSON.stringify(await p.evaluate(() => { const k = window.__town3dKamo(); return k && { low: k.low, time: k.time } }))}・エラー ${errs.length}${errs.length ? '（' + errs.slice(0, 3).join(' ／ ') + '）' : ''}`)
    console.log(lines[lines.length - 1])
    await ctx.close()
  }
  fs.writeFileSync(OUT + '/live-shot.txt', lines.join('\n') + '\n')
  await b.close()
}
