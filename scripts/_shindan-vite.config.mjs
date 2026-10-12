// 使い捨て（shindan 2026-10-12・案の画用）: 本体のファイルは変えず、開発サーバーが返す town3dViewer.js にだけ
// 撮影用の口（__shGet・__shMods）を差し込む。起動: npx vite --config scripts/_shindan-vite.config.mjs
import { defineConfig } from 'vite'

const INJ = `
  window.__shGet = () => ({ renderer, scene, camera, composer, bloomPass, fxaaPass, sun, THREE, setCurPR: (v) => { curPR = v; qCap = v; applySize() } });
  window.__shMods = () => Promise.all([
    import('three/examples/jsm/postprocessing/GTAOPass.js'),
    import('three/examples/jsm/postprocessing/SMAAPass.js'),
    import('three/examples/jsm/postprocessing/SSAARenderPass.js'),
  ]);
`
export default defineConfig({
  base: '/seasons/',
  server: { port: 4952, strictPort: true },
  plugins: [{
    name: 'shindan-hook',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('src/engine/town3dViewer.js')) return
      const anchor = '  } catch (e) { composer = null }'
      const i = code.indexOf(anchor)
      if (i < 0) throw new Error('shindan-hook: 差し込み位置が見つからない')
      return code.slice(0, i + anchor.length) + '\n' + INJ + code.slice(i + anchor.length)
    },
  }],
})
