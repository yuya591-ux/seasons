// 使い捨て（shindan 2026-10-12・報告PDF用）: 画を縦（または横）に積み、角に番号ラベルだけを付けて JPEG で出す。
// node scripts/_shindan-stack.mjs 出力.jpg 幅px 向き(v|h) 画1[@ラベル][#切り出しy0:y1割合] 画2…
// 例: a.png@今#0:0.55  → a.png の上から0〜55%を切り出し、左上に「今」
import { chromium } from 'playwright'
import fs from 'node:fs'
const [out, width, dir, ...items] = process.argv.slice(2)
const parts = items.map((it) => {
  const [fileLabel, crop] = it.split('#'); const [file, label] = fileLabel.split('@')
  const [c0, c1] = crop ? crop.split(':').map(Number) : [0, 1]
  return { src: `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`, label: label || '', c0, c1 }
})
const cols = dir === 'h' ? parts.length : 1
const html = `<style>body{margin:0;background:#1b1b1f;width:${width}px;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px}
.c{position:relative;overflow:hidden}.c img{display:block;width:100%}
.l{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.72);color:#fff;font:bold 22px sans-serif;padding:3px 10px;border-radius:6px}</style>` +
  parts.map((p, i) => `<div class="c" id="c${i}"><img src="${p.src}"><span class="l" ${p.label ? '' : 'style="display:none"'}>${p.label}</span></div>`).join('')
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: +width, height: 50 } })
await pg.setContent(html); await pg.waitForTimeout(300)
// 切り出し: 画の高さのうち c0〜c1 の割合だけを見せる
await pg.evaluate((ps) => ps.forEach((p, i) => { const c = document.getElementById('c' + i); const img = c.querySelector('img'); const h = img.getBoundingClientRect().height; c.style.height = (h * (p.c1 - p.c0)) + 'px'; img.style.marginTop = (-h * p.c0) + 'px' }), parts.map(({ c0, c1 }) => ({ c0, c1 })))
await pg.waitForTimeout(200)
await pg.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 82 })
await b.close()
console.log('書いた', out, (fs.statSync(out).size / 1024).toFixed(0) + 'KB')
