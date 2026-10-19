// 使い捨て（便12 2026-10-20・室内の設計案の画用。便10 の _bin10-vite.config.mjs と同じ型）: 本体のファイルは変えず、
// 開発サーバーが返す town3dViewer.js にだけ撮影用の口を差し込む。案は URL の ?b12=<案> か、起動時の環境変数 B12 で選ぶ（測りで前と後のサーバーを分けるため）
//   __b12T: 茶の間の部品（winRoom・猫・風鈴・ほこり・カーテン・障子）と、カメラの目の位置・情景の時刻
//   案があれば scripts/_bin12-inject.js を読み込み、茶の間ができた直後に当てる
// 起動: npx vite --config scripts/_bin12-vite.config.mjs（番号は B12_PORT・既定 4972）
import { defineConfig } from 'vite'

const PORT = +(process.env.B12_PORT || 4972)
const B12 = process.env.B12 || ''
const EXPOSE = 'window.__b12T = { winRoom, winCat, windChime, winDust, winCurtains, winSashR, winRefl, eye, camera, scene, renderer, THREE, kind, isNight, duskAmt, season, weather, sunCol, getActive: () => active };' +
  ' if (window.__B12) { window.__b12auto = "loading"; const s = document.createElement("script"); s.src = "/seasons/scripts/_bin12-inject.js?" + Date.now(); s.onload = () => { try { window.__b12auto = window.__bin12.apply(window.__B12) } catch (e) { window.__b12auto = "ERR " + e.message } }; document.head.appendChild(s) }'
export default defineConfig({
  base: '/seasons/',
  server: { port: PORT, strictPort: true },
  plugins: [{
    name: 'bin12-hook',
    enforce: 'pre',
    transform(code, id) {
      const f = id.split(String.fromCharCode(92)).join('/')
      if (!f.endsWith('src/engine/town3dViewer.js')) return
      code = `window.__B12 = new URLSearchParams(location.search).get('b12') || ${JSON.stringify(B12)};\n` + code
      // [差し込む位置の文字列, その行の終わりの後ろに足す文]（本体は CRLF の行末なので、行末までを探して後ろへ足す）
      // 測りの口（__shGet・__b6R）は便11 の _bin11-vite.config.mjs と同じ（scripts/_bin12-measure3d.mjs が使う）
      for (const [a, add] of [
        ['    scene.add(winRoom)', EXPOSE],
        ['const treesArr = []', 'window.__b6R = { trees: treesArr }'],
        ['  } catch (e) { composer = null }', 'window.__shGet = () => ({ renderer, scene, camera, composer, bloomPass, fxaaPass, sun, THREE, setCurPR: (v) => { curPR = v; qCap = v; applySize() } });'],
      ]) {
        const i = code.indexOf(a)
        if (i < 0 || code.indexOf(a, i + 1) >= 0) throw new Error('bin12-hook: 差し込み位置が1つに決まらない: ' + a)
        const eol = code.indexOf('\n', i)
        code = code.slice(0, eol + 1) + '    ' + add + '\n' + code.slice(eol + 1)
      }
      return code
    },
  }],
})
