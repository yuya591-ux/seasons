// 便11（2026-10-16・便10 #1=1 #2=2 #3=1 で作る便）の測りと撮影用。便6 の _bin6-vite.config.mjs の写しで、番号だけ B11_PORT で替えられる。便5 の _bin5-vite.config.mjs の写し: 本体のファイルは変えず、
// 開発サーバーが返す town3dViewer.js にだけ撮影用の口（__shGet）と木の控え（__b6R.trees）を差し込む。起動: B11_PORT=<番号> npx vite --config <この台本の道>（前のコードの作業フォルダでも、この台本の道を渡して起動する）
import { defineConfig } from 'vite'

const INJ = `
  window.__shGet = () => ({ renderer, scene, camera, composer, bloomPass, fxaaPass, sun, THREE, setCurPR: (v) => { curPR = v; qCap = v; applySize() } });
`
// [差し込む位置の文字列, その行の終わりの後ろに足す文]（行の途中に // の注記がある行があるので、必ず行の終わりの後ろに足す）
const AFTER_LINE = [
  ['const treesArr = []', 'window.__b6R = { trees: treesArr }'],
]
export default defineConfig({
  base: '/seasons/',
  server: { port: +(process.env.B11_PORT || 4963), strictPort: true },
  plugins: [{
    name: 'bin6-hook',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('src/engine/town3dViewer.js')) return
      for (const [a, add] of AFTER_LINE) {
        const i = code.indexOf(a)
        if (i < 0 || code.indexOf(a, i + 1) >= 0) throw new Error('bin6-hook: 差し込み位置が1つに決まらない: ' + a)
        const eol = code.indexOf('\n', i)
        code = code.slice(0, eol + 1) + '    ' + add + '\n' + code.slice(eol + 1)
      }
      const anchor = '  } catch (e) { composer = null }'
      const i = code.indexOf(anchor)
      if (i < 0) throw new Error('bin6-hook: 差し込み位置が見つからない')
      return code.slice(0, i + anchor.length) + '\n' + INJ + code.slice(i + anchor.length)
    },
  }],
})
