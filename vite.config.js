import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const BASE = '/seasons/'

// ビルド成果物（ハッシュ付きJS/CSS＋index.html＋PWAの核）の一覧を precache-manifest.json に書き出す。
// service worker が install 時にこれを読んでシェルを事前キャッシュ＝「一度も情景を開かずオフラインでも起動」
// （外部API非依存・自分がいなくなっても動く原則）。音/背景画像は大きいので事前キャッシュせず再生時に取得。
function precacheManifest() {
  let outDir = 'dist'
  let buildId = ''
  return {
    name: 'precache-manifest',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir) },
    generateBundle(_, bundle) {
      // ビルドの指紋＝出力ファイル名（中身の指紋入り）の一覧から作る。sw.js の版に埋める（手で上げる版をやめる・S39）
      buildId = createHash('sha256').update(Object.keys(bundle).sort().join("|")).digest('hex').slice(0, 12)
      const urls = [
        BASE + 'index.html',
        BASE + 'manifest.webmanifest',
        BASE + 'icon-192.png',
        BASE + 'icon-512.png',
      ]
      // シェル＝メインの入口チャンク(index-*.js)＋全CSS のみ事前キャッシュ。
      // three / town3dViewer / splatViewer / 後処理パス等の「遅延import」チャンクは事前キャッシュしない＝
      // 初回訪問で重いJS(計1.4MB+)を前倒しダウンロードしない（④-cの動的importの意図を尊重・初回表示を軽く）。
      // 3D/スプラット情景に入った時にSWの stale-while-revalidate が取得・キャッシュ＝以後はオフラインでも動く
      // （未取得の状態で3Dをオフラインで開いた場合は main.js の try/catch が2D情景へ穏やかにフォールバック）。
      for (const f of Object.keys(bundle)) {
        if (/\.css$/.test(f)) urls.push(BASE + f)
        else if (/(^|\/)index-[\w-]+\.js$/.test(f)) urls.push(BASE + f) // 入口チャンクのみ（遅延チャンクは除外）
      }
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify(urls) })
    },
    // public から写された sw.js の版の札（__SEASONS_BUILD__）を、このビルドの指紋に置き換える（写しが済んだ後に行う）
    closeBundle() {
      const f = path.join(outDir, 'sw.js')
      if (!buildId || !fs.existsSync(f)) return
      const src = fs.readFileSync(f, 'utf8')
      if (src.includes('__SEASONS_BUILD__')) fs.writeFileSync(f, src.replace(/__SEASONS_BUILD__/g, buildId))
    },
  }
}

// 便24: 名前が変わらない画像・音・鴨川のデータに、中身の指紋の印（?v=…）を付ける。
//   控え（service worker）は画像と音を「控えを先に返し、裏で取り直す」ので、同じ名前で中身を替えると、初めて開いた時に前の画が出た
//   （裕也さん「サムネ画像もトップの１つだけでそのあとの季節選択画面は前のままでした」2026-11-05）。印が変われば別の物として取り直す。
//   鴨川の町のデータは手で上げる印（?v=23）だったので、上げ忘れると新しい本体と古いデータが混ざる＝これも中身の指紋にした
function walk(d) { const out = []; if (!fs.existsSync(d)) return out; for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(d, e.name); if (e.isDirectory()) out.push(...walk(p)); else out.push(p) } return out }
const hashOf = (files) => { const h = createHash('sha1'); for (const f of files) { h.update(path.basename(f)); h.update(fs.readFileSync(f)) } return h.digest('hex').slice(0, 10) }
function mediaVersions() {
  const pub = path.resolve('public'), map = {}
  for (const sub of ['thumbs', 'audio', 'bg']) for (const f of walk(path.join(pub, sub))) map[path.relative(pub, f).split(path.sep).join('/')] = hashOf([f])
  const kamo = path.join(pub, 'kamo'), outer = path.join(kamo, 'outer')
  return { map, kamo: hashOf(walk(kamo).filter((f) => !f.startsWith(outer + path.sep))), outer: hashOf(walk(outer)) }
}
const MV = mediaVersions()

// GitHub Pages はリポジトリ名のサブパス配下で公開されるため base を合わせる。
// 例: https://<ユーザー名>.github.io/seasons/
export default defineConfig({
  base: BASE,
  plugins: [precacheManifest()],
  define: { __MEDIA_V__: JSON.stringify(MV.map), __KAMO_V__: JSON.stringify(MV.kamo), __OUTER_V__: JSON.stringify(MV.outer) }, // 便24: 中身の指紋の印
  // three.module は意図的に大きい（動的importで分割済み・PWAで事前キャッシュ）。
  // 既定500KBの警告が出続けて保守ノイズになるため許容上限を上げる（評価 技術-L6）。
  build: { chunkSizeWarningLimit: 900 },
})
