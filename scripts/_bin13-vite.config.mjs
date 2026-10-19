// 便13（2026-10-20）の検査と測りの開発サーバー: 本体のファイルは変えず、開発サーバーが返す town3dViewer.js にだけ検査用の口を差し込む（便11・便12 と同じ型）。
//   __b13T: 茶の間の部品（winRoom・猫・風鈴・ほこり・カーテン・障子と錠）・目の位置・カメラ・情景の種類（scripts/_bin13-kensa.mjs が読む）
//   __shGet・__b6R: 重さの測り（scripts/_bin12-measure3d.mjs）が使う口（便11 と同じ）
// 起動: B13_PORT=<番号> npx vite --config <この台本の道>（前のコードの作業フォルダでも、この台本の道を渡して起動する。前のコードに無い名前は undefined で返す）
import { defineConfig } from 'vite'

const PORT = +(process.env.B13_PORT || 4982)
const EXPOSE = 'window.__b13T = { winRoom, winCat, windChime, winDust, winCurtains, winSashR, eye, camera, scene, THREE, kind, isNight, getActive: () => active, lock: (typeof winSashLock !== "undefined") ? winSashLock : null };'
export default defineConfig({
  base: '/seasons/',
  server: { port: PORT, strictPort: true },
  plugins: [{
    name: 'bin13-hook',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split(String.fromCharCode(92)).join('/').endsWith('src/engine/town3dViewer.js')) return
      // [差し込む位置の文字列, その行の終わりの後ろに足す文]（本体は CRLF の行末なので、行末までを探して後ろへ足す）
      for (const [a, add] of [
        ['    scene.add(winRoom)', EXPOSE],
        ['const treesArr = []', 'window.__b6R = { trees: treesArr }'],
        ['  } catch (e) { composer = null }', 'window.__shGet = () => ({ renderer, scene, camera, composer, bloomPass, fxaaPass, sun, THREE, setCurPR: (v) => { curPR = v; qCap = v; applySize() } });'],
      ]) {
        const i = code.indexOf(a)
        if (i < 0 || code.indexOf(a, i + 1) >= 0) throw new Error('bin13-hook: 差し込み位置が1つに決まらない: ' + a)
        const eol = code.indexOf('\n', i)
        code = code.slice(0, eol + 1) + '    ' + add + '\n' + code.slice(eol + 1)
      }
      return code
    },
  }],
})
