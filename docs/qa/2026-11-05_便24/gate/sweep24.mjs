// 便24: 画面の隅々の点検（iPhone の幅 402×874）。入口・最初の画面・情景（場所の一覧と場所ごとの画面）・設定・この作品について・通い帳を、
//   実際のボタンを押して開いて撮り、見えている文字をすべて書き出す（古い名前や前の町の言葉が残っていないかを照らす）。
//   カードのサムネは、読み先（?v=…）と、画像が読めたか（naturalWidth）を数える。
// 前に: npx vite preview --port 4961（PORT で替えられる）
// 使い方: node docs/qa/2026-11-05_便24/gate/sweep24.mjs [名前]   出力の最後の行: 「隅々の点検の終わり: 撮った画 N 枚・読めないサムネ M・古い言葉 K」
import { chromium } from 'playwright'
import fs from 'node:fs'
const PORT = process.env.PORT || 4961, BASE = `http://localhost:${PORT}/seasons/`, NAME = process.argv[2] || 'ato'
const OUT = `docs/qa/2026-11-05_便24/shots/sweep-${NAME}`
fs.mkdirSync(OUT, { recursive: true })
const OLD = [/窓辺\s*\/\s*Madobe/i, /MADOBE/, /高台の角部屋/, /高台の窓/, /\(仮\)|（仮）|TODO|undefined|NaN|null/]
// 【便24・全テスト4回目】GPU を使わない開き方では、最初の画面（日付と時刻で替わる＝夜は秋の夜の情景など）を描ききれず、撮影が 30 秒で時間切れになった（前の版 4962 でも同じ）。probe24・鴨川の検査と同じ GPU を使う開き方にする
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu'] })
const ctx = await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, serviceWorkers: 'block' })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
let n = 0, badThumb = 0
const wake = async () => { await p.mouse.move(200 + Math.random() * 10, 300 + Math.random() * 10); await p.mouse.move(210, 320); await p.waitForTimeout(500) } // 眺めている間は UI が消える＝動かして出す
const texts = []
async function shot(name) { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}_${name}.png`, timeout: 90000 }); const t = await p.evaluate(() => document.body.innerText); texts.push(`## ${name}\n${t}`) }
async function thumbs(name) {
  const r = await p.evaluate(async () => {
    const cards = [...document.querySelectorAll('.panel--scene .scene-card')].filter((c) => c.offsetParent)
    const out = []
    for (const c of cards) {
      const sw = c.querySelector('.scene-card__swatch'), m = /url\("([^"]+)"\)/.exec(getComputedStyle(sw).backgroundImage)
      const ok = m ? await new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res(0); i.src = m[1] }) : 0
      out.push({ label: c.querySelector('.scene-card__label').textContent, url: m ? m[1].replace(location.origin, '') : '', w: ok })
    }
    return out
  })
  for (const t of r) { if (!t.w || !/\?v=[0-9a-f]{10}$/.test(t.url)) badThumb++ }
  texts.push(`### ${name} のサムネ\n` + r.map((t) => `${t.w ? '○' : '×'} ${t.label} ${t.url} ${t.w}px`).join('\n'))
  return r
}
await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
await p.waitForTimeout(2500); await shot('入口')
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(9000); await shot('最初の画面')
await wake(); await p.getByRole('button', { name: '情景' }).first().click(); await shot('情景_場所の一覧'); await thumbs('場所の一覧')
const places = await p.locator('.panel--scene .scene-card__label').allInnerTexts()
for (let i = 0; i < places.length; i++) {
  await p.locator('.panel--scene .scene-card').nth(i).click(); await p.waitForTimeout(600)
  await thumbs(places[i]); await shot(`情景_${places[i]}`)
  const gal = p.locator('.panel--scene .gallery')
  const sh = await gal.evaluate((e) => e.scrollHeight - e.clientHeight).catch(() => 0)
  if (sh > 20) { await gal.evaluate((e) => { e.scrollTop = e.scrollHeight }); await shot(`情景_${places[i]}_下`) }
  await p.locator('.panel--scene .gallery__back').click(); await p.waitForTimeout(400)
}
await p.locator('.panel--scene [aria-label="閉じる"]').first().click().catch(() => {}); await p.waitForTimeout(500)
await wake(); await p.getByRole('button', { name: '設定' }).first().click(); await shot('設定')
const sp = p.locator('.panel--open').first(); const sh2 = await sp.evaluate((e) => { const s = e.querySelector('.panel__body') || e; return s.scrollHeight - s.clientHeight }).catch(() => 0)
if (sh2 > 20) { await sp.evaluate((e) => { const s = e.querySelector('.panel__body') || e; s.scrollTop = s.scrollHeight }); await shot('設定_下') }
await p.getByRole('button', { name: 'この作品について' }).first().click().catch(() => {}); await shot('この作品について')
const ab = await p.evaluate(() => { const e = [...document.querySelectorAll('.panel--open, .modal, [role="dialog"]')].pop(); if (!e) return 0; const s = e.querySelector('.panel__body') || e; return s.scrollHeight - s.clientHeight })
if (ab > 20) { await p.evaluate(() => { const e = [...document.querySelectorAll('.panel--open, .modal, [role="dialog"]')].pop(); const s = e.querySelector('.panel__body') || e; s.scrollTop = s.scrollHeight }); await shot('この作品について_下') }
await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(400)
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000); await p.locator('.gate').click().catch(() => {}); await p.waitForTimeout(3000)
await wake(); await p.getByRole('button', { name: '設定' }).first().click(); await p.getByRole('button', { name: '通い帳をひらく' }).first().click().catch(() => {}); await shot('通い帳')
const all = texts.join('\n\n')
fs.writeFileSync(`${OUT}/文字.txt`, all)
const hits = []
for (const re of OLD) for (const line of all.split('\n')) if (re.test(line)) hits.push(`${re} → ${line.slice(0, 120)}`)
console.log(hits.length ? '古い言葉:\n' + hits.join('\n') : '古い言葉: なし')
console.log(`エラー ${errs.length}${errs.length ? ' ' + JSON.stringify(errs.slice(0, 3)) : ''}`)
console.log(`隅々の点検の終わり: 撮った画 ${n} 枚・読めないサムネ ${badThumb}・古い言葉 ${hits.length}・エラー ${errs.length}`)
await b.close()
process.exit(badThumb || hits.length || errs.length ? 1 : 0)
