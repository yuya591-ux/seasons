// 便11（2026-10-16）の確かめ用: 町の乱数 R() の順が、遠山・煙・雲海の作り替えで崩れていないかを見る。
// 本体のファイルは変えず、開発サーバーが返す town3dViewer.js の決まった所に「その時の R() の値を1つ控える」読み口を差し込む。
// 前のコードと後のコードの両方に同じ所で差し込むので、控えた値の並びが同じなら、そこまでの R() の消費の順と回数が同じ。
// 起動: B11_PORT=<番号> npx vite --config <この台本の道>（前のコードの作業フォルダでも、この台本の道を渡して起動する）
import { defineConfig } from 'vite'

const probe = (name) => `;(window.__b11R = window.__b11R || []).push(['${name}', R()]);`
// [差し込む位置の文字列, 'before'＝その行の前／'after'＝その行の後, 名前]
const AT = [
  ['  // ── ふわふわの雲（白い球の塊', 'before', '遠山の後'],
  ['  let lastCloudHi = true', 'before', '煙の後'],
  ['scene.add(cloudSeaG); cloudSea = cloudSeaG', 'after', '雲海の後'],
  ['  } catch (e) { composer = null }', 'after', '町の終わり'],
]
export default defineConfig({
  base: '/seasons/',
  server: { port: +(process.env.B11_PORT || 4967), strictPort: true },
  plugins: [{
    name: 'bin11-rprobe',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('src/engine/town3dViewer.js')) return
      for (const [a, where, name] of AT) {
        const i = code.indexOf(a)
        if (i < 0 || code.indexOf(a, i + 1) >= 0) throw new Error('bin11-rprobe: 差し込み位置が1つに決まらない: ' + a)
        if (where === 'before') { const bol = code.lastIndexOf('\n', i) + 1; code = code.slice(0, bol) + '  ' + probe(name) + '\n' + code.slice(bol) }
        else { const eol = code.indexOf('\n', i); code = code.slice(0, eol + 1) + '    ' + probe(name) + '\n' + code.slice(eol + 1) }
      }
      return code
    },
  }],
})
