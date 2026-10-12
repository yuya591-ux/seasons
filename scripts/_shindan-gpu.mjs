import { chromium } from 'playwright'
for (const args of [[], ['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']]) {
  for (const ch of [undefined, 'chromium']) {
    try {
      const b = await chromium.launch({ channel: ch, args })
      const p = await b.newPage()
      const r = await p.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); if (!g) return 'no webgl2'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'masked' })
      console.log(ch || 'default', args.join(' ') || '(no args)', '=>', r)
      await b.close()
    } catch (e) { console.log(ch, 'ERR', e.message.slice(0, 100)) }
  }
}
