// 便15（2026-11-02）の検査と撮影の開発サーバー: 本体のファイルは変えず、開発サーバーが返す town3dViewer.js にだけ検査用の口を差し込む（便13 と同じ型）。
//   __b15T: 町の3Dの中身（scripts/_bin15-kensa.mjs が読む）。差し込む位置が無い時は何も足さない（前のコードでも起動できる）
//   猫の毛色: window.__b13Coat で名指しできる（便13 と同じ）
// 起動: B15_PORT=<番号> npx vite --config scripts/_bin15-vite.config.mjs
import { defineConfig } from 'vite'

const PORT = +(process.env.B15_PORT || 4985)
const EXPOSE = 'window.__b15T = { scene, camera, THREE, kind, eye, winRoom, lock: (typeof winSashLock !== "undefined") ? winSashLock : null, sun: () => ({ glow: sunGlow, disk: sunDisk }), getActive: () => active };'
export default defineConfig({
  base: '/seasons/',
  server: { port: PORT, strictPort: true },
  plugins: [{
    name: 'bin15-hook',
    enforce: 'pre',
    transform(code, id) {
      const idn = id.split(String.fromCharCode(92)).join('/')
      // 2D の描画の時刻を外から決める口（E10: かもめが桟に重なる時刻を描く）。本体の renderer.js は変えない
      if (idn.endsWith('src/engine/renderer.js')) {
        const a = 'gl.uniform1f(loc.uTime, seconds)'
        if (code.split(a).length !== 2) throw new Error('bin15-hook: 時刻の行が1つに決まらない')
        return 'window.__b15SetTime = (t) => { window.__b15T0 = t }; ' + code.replace(a, 'gl.uniform1f(loc.uTime, window.__b15T0 != null ? window.__b15T0 : seconds)')
      }
      if (!idn.endsWith('src/engine/town3dViewer.js')) return
      for (const [a, add] of [
        ['    scene.add(winRoom)', EXPOSE],
      ]) {
        const i = code.indexOf(a)
        if (i < 0) continue
        if (code.indexOf(a, i + 1) >= 0) throw new Error('bin15-hook: 差し込み位置が1つに決まらない: ' + a)
        const eol = code.indexOf('\n', i)
        code = code.slice(0, eol + 1) + '    ' + add + '\n' + code.slice(eol + 1)
      }
      const coatA = 'const coat = COATS[(Math.random() * COATS.length) | 0]'
      if (code.split(coatA).length === 2) code = code.replace(coatA, 'const coat = COATS[window.__b13Coat != null ? window.__b13Coat : ((Math.random() * COATS.length) | 0)]')
      return code
    },
  }],
})
