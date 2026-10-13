// 使い捨て（便5 2026-10-13・木と面の質感の案の画用。便3 の _bin3-vite.config.mjs の写しに、材と木の控えの口を足した）: 本体のファイルは変えず、
// 開発サーバーが返す town3dViewer.js にだけ撮影用の口（__shGet・__shMods・__b5R）を差し込む。起動: npx vite --config scripts/_bin5-vite.config.mjs
import { defineConfig } from 'vite'

const INJ = `
  window.__shGet = () => ({ renderer, scene, camera, composer, bloomPass, fxaaPass, sun, THREE, setCurPR: (v) => { curPR = v; qCap = v; applySize() } });
  window.__shMods = () => Promise.all([
    import('three/examples/jsm/postprocessing/GTAOPass.js'),
  ]);
`
// [差し込む位置の文字列, その行の終わりの後ろに足す文]（行の途中に // の注記がある行があるので、必ず行の終わりの後ろに足す）
const AFTER_LINE = [
  ['const grad = makeGradient(THREE)', 'window.__b5R = { roof: null, wall: [], ground: null, road: null, trees: null, leafMats: null }'],
  ['const roofMats = roofCols.map', 'window.__b5R.roof = roofMats'],
  ['wm.vertexColors = true', 'window.__b5R.wall.push(wm)'],
  ['const gm = mottleMat(0xffffff, 150, 0.1, [42, 46]); gm.vertexColors = true', 'window.__b5R.ground = gm'],
  ['road.position.z = -35; road.receiveShadow = true; town.add(road)', 'window.__b5R.road = road.material'],
  ['const treesArr = []', 'window.__b5R.trees = treesArr'],
  ['const leafBaseMats = leafBase.map', 'window.__b5R.leafMats = leafBaseMats'],
]
export default defineConfig({
  base: '/seasons/',
  server: { port: 4957, strictPort: true },
  plugins: [{
    name: 'bin5-hook',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('src/engine/town3dViewer.js')) return
      for (const [a, add] of AFTER_LINE) {
        const i = code.indexOf(a)
        if (i < 0 || code.indexOf(a, i + 1) >= 0) throw new Error('bin5-hook: 差し込み位置が1つに決まらない: ' + a)
        const eol = code.indexOf('\n', i)
        code = code.slice(0, eol + 1) + '    ' + add + '\n' + code.slice(eol + 1)
      }
      const anchor = '  } catch (e) { composer = null }'
      const i = code.indexOf(anchor)
      if (i < 0) throw new Error('bin5-hook: 差し込み位置が見つからない')
      return code.slice(0, i + anchor.length) + '\n' + INJ + code.slice(i + anchor.length)
    },
  }],
})
