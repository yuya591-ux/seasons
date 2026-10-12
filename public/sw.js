// 「季節と天気のアンビエント」オフライン対応サービスワーカー。
// 方針: 外部依存ゼロ・同一オリジンのみ。一度開けば、電波が無くても・将来サーバが消えても眺められる。
// 戦略:
//  ・ページ遷移＝ネット優先（失敗時は控え）
//  ・ハッシュ付きの JS/CSS（/assets/）＝控えを先に使う。名前に中身の指紋が入っているので、同じ名前なら中身も同じ＝取り直さない（S40）
//  ・音・画像など名前が変わらない物＝stale-while-revalidate（即表示→裏で更新）。ビルドをまたいで残す
// 版（BUILD）は手で上げない。ビルドのたびに vite の precacheManifest が中身の指紋で置き換える（S39）。
// 有効になった時、このビルドの控えと音・画像の控え以外（前のビルドの控え・手で上げていた版 seasons-v5 など）を消す
// ＝デプロイのたびに古いハッシュ付きの JS が積もり続けない／古い情景の登録簿と新しいチャンクが混ざらない。
const BUILD = '__SEASONS_BUILD__'
const SHELL_CACHE = `seasons-shell-${BUILD}` // このビルドの index.html とハッシュ付きの JS/CSS
const MEDIA_CACHE = 'seasons-media' // 音と画像（名前が変わらない・ビルドをまたいで残す）

// install: シェル（index.html/JS/CSS/manifest/icon）を事前キャッシュ＝一度も情景を開かずオフラインでも起動。
// precache-manifest.json はビルド時にVite pluginが生成（ハッシュ付き資産名を含む）。失敗しても起動は妨げない。
self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      try {
        const res = await fetch(new URL('precache-manifest.json', self.registration.scope).href, { cache: 'no-cache' })
        if (res.ok) {
          const urls = await res.json()
          const cache = await caches.open(SHELL_CACHE)
          // 一つの失敗で全体を諦めない（allSettled）。
          await Promise.allSettled(urls.map((u) => cache.add(u)))
        }
      } catch {
        /* オフライン初回等は無視＝取得時に追って埋まる */
      }
      self.skipWaiting() // 新版は即時有効化（静かな自動更新）
    })(),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      // このビルドのシェルと、音・画像の控え以外を消す（前のビルドのシェル・旧版 seasons-v5-assets など）
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== MEDIA_CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // 同一オリジンのみ（外部APIに触れない原則）

  // ページ遷移: ネット優先・失敗したらキャッシュ（オフラインでも起動）
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          // HTTPキャッシュを経由せず必ずネットに取りに行く＝GitHub Pages/ブラウザの古いindex.htmlを掴み続けて
          // 「古いアプリで起動→新チャンクと混在→メニュー破壊」を防ぐ。失敗時のみキャッシュへフォールバック。
          const fresh = await fetch(req, { cache: 'no-store' })
          const cache = await caches.open(SHELL_CACHE)
          cache.put(req, fresh.clone())
          return fresh
        } catch {
          const cache = await caches.open(SHELL_CACHE)
          return (
            (await cache.match(req)) ||
            (await cache.match(self.registration.scope)) ||
            (await cache.match(new URL('index.html', self.registration.scope).href)) ||
            Response.error()
          )
        }
      })(),
    )
    return
  }

  // ハッシュ付きの JS/CSS: 控えを先に使い、無い時だけネットから取って控える（中身が変わらないので裏で取り直さない＝通信と電池の節約）
  if (/\/assets\//.test(url.pathname)) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE)
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const res = await fetch(req)
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone())
          return res
        } catch {
          return Response.error()
        }
      })(),
    )
    return
  }

  // 音・画像など: stale-while-revalidate（控えを即返し、裏で取り直して控えを新しくする）
  e.respondWith(
    (async () => {
      const cache = await caches.open(MEDIA_CACHE)
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone())
          return res
        })
        .catch(() => null)
      return cached || (await network) || Response.error()
    })(),
  )
})
