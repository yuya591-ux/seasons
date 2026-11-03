// 使い方: node crop.cjs <入力png> <出力png> <x> <y> <幅> <高さ> <倍>
const { chromium } = require('playwright'); const fs = require('fs')
const [inp, out, x, y, w, h, s] = process.argv.slice(2).map((v, i) => (i < 2 ? v : +v))
;(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: w * s, height: h * s } })
  const d = fs.readFileSync(inp).toString('base64')
  await p.setContent(`<body style="margin:0;overflow:hidden"><img id=i src="data:image/png;base64,${d}" style="position:absolute;left:${-x * s}px;top:${-y * s}px;image-rendering:pixelated"></body>`)
  await p.evaluate((s) => new Promise((r) => { const i = document.getElementById('i'); const f = () => { i.style.width = i.naturalWidth * s + 'px'; r() }; i.complete ? f() : (i.onload = f) }), s)
  await p.screenshot({ path: out }); await b.close() })()
