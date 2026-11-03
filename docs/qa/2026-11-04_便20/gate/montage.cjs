// 使い方: node montage.cjs <出力png> <列> <1枚の幅> <入力png…>（画の中央を切らずに縮めて並べ、下に名前を書く）
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path')
const [out, cols, w, ...ins] = process.argv.slice(2); const W = +w, H = Math.round(W * 9 / 16)
;(async () => { const b = await chromium.launch(); const rows = Math.ceil(ins.length / +cols); const p = await b.newPage({ viewport: { width: W * +cols, height: (H + 22) * rows } })
  const cells = ins.map((f) => `<div style="display:inline-block;width:${W}px;vertical-align:top"><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:${W}px;height:${H}px;display:block"><div style="font:13px sans-serif;color:#ddd;background:#222;height:22px">${path.basename(f)}</div></div>`).join('')
  await p.setContent(`<body style="margin:0;background:#222;font-size:0">${cells}</body>`); await p.waitForTimeout(300); await p.screenshot({ path: out }); await b.close() })()
