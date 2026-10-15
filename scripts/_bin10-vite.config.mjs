// 使い捨て（便10 2026-10-15・空と雲・雨の窓の設計案の画用。便5 の _bin5-vite.config.mjs と同じ型）: 本体のファイルは変えず、
// 開発サーバーが返すファイルにだけ撮影用の口を差し込む。案は URL の ?b10=<案> か、起動時の環境変数 B10 で選ぶ（測りで前と後のサーバーを分けるため）
//   town3dViewer.js: __shGet（描画の口）と __b10T（雲・雲海・遠山・煙の控え）
//   rainGlass.js・windowSea.js・windowMountains.js: buildFragment を包み、scripts/_bin10-variants.js の案の文に差し替える
// 起動: npx vite --config scripts/_bin10-vite.config.mjs（番号は B10_PORT・既定 4970）
import { defineConfig } from 'vite'

const PORT = +(process.env.B10_PORT || 4970)
const B10 = process.env.B10 || ''
const INJ = `
  window.__shGet = () => ({ renderer, scene, camera, composer, bloomPass, fxaaPass, sun, THREE, setCurPR: (v) => { curPR = v; qCap = v; applySize() } });
  if (/kumo/.test(window.__B10 || '')) setTimeout(() => { window.__b10auto = 'loading'; const s = document.createElement('script'); s.src = '/seasons/scripts/_bin10-inject.js'; s.onload = () => { window.__b10auto = window.__bin10.apply(window.__B10) }; document.head.appendChild(s) }, 0);
`
const AFTER_LINE = [
  ['const mtns = []', 'window.__b10T = { mtns }'],
  ['const townSmoke = []', 'window.__b10T.smoke = townSmoke'],
  ['scene.add(cloudSeaG); cloudSea = cloudSeaG', 'window.__b10T.sea = cloudSeaG; window.__b10T.seaMats = seaMats; window.__b10T.seaInfo = { seaLowC, seaHighC, seaSunDir, seaSunCol, seaR, gaps, seaUni }'],
]
const SHADERS = ['rainGlass', 'windowSea', 'windowMountains']
export default defineConfig({
  base: '/seasons/',
  server: { port: PORT, strictPort: true },
  plugins: [{
    name: 'bin10-hook',
    enforce: 'pre',
    transform(code, id) {
      const f = id.split(String.fromCharCode(92)).join('/')
      const sh = SHADERS.find((s) => f.endsWith(`src/shaders/${s}.js`))
      if (sh) {
        if (!code.includes('export function buildFragment(quality) {')) throw new Error('bin10-hook: buildFragment が無い: ' + sh)
        code = code.replace('export function buildFragment(quality) {', 'function __origBuild(quality) {')
        return `import { B10_VARIANTS } from '/scripts/_bin10-variants.js'\n` + code + `
export function buildFragment(quality) {
  const v = new URLSearchParams(location.search).get('b10') || ${JSON.stringify(B10)}
  const fn = B10_VARIANTS['${sh}:' + v]
  return fn ? fn(quality, { orig: __origBuild(quality), FRAGMENT_BODY: typeof FRAGMENT_BODY !== 'undefined' ? FRAGMENT_BODY : null }) : __origBuild(quality)
}
`
      }
      if (!f.endsWith('src/engine/town3dViewer.js')) return
      code = `window.__B10 = new URLSearchParams(location.search).get('b10') || ${JSON.stringify(B10)};\n` + code
      for (const [a, add] of AFTER_LINE) {
        const i = code.indexOf(a)
        if (i < 0 || code.indexOf(a, i + 1) >= 0) throw new Error('bin10-hook: 差し込み位置が1つに決まらない: ' + a)
        const eol = code.indexOf('\n', i)
        code = code.slice(0, eol + 1) + '    ' + add + '\n' + code.slice(eol + 1)
      }
      const anchor = '  } catch (e) { composer = null }'
      const i = code.indexOf(anchor)
      if (i < 0) throw new Error('bin10-hook: 差し込み位置が見つからない')
      return code.slice(0, i + anchor.length) + '\n' + INJ + code.slice(i + anchor.length)
    },
  }],
})
