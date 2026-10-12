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

// GitHub Pages はリポジトリ名のサブパス配下で公開されるため base を合わせる。
// 例: https://<ユーザー名>.github.io/seasons/
export default defineConfig({
  base: BASE,
  plugins: [precacheManifest()],
  // three.module は意図的に大きい（動的importで分割済み・PWAで事前キャッシュ）。
  // 既定500KBの警告が出続けて保守ノイズになるため許容上限を上げる（評価 技術-L6）。
  build: { chunkSizeWarningLimit: 900 },
})
