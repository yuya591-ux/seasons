// 便24: 名前が変わらない画像と音の読み先に、中身の指紋の印（?v=…）を付ける（印の表は vite.config.js がビルドの時に作る）。
//   控え（service worker）が前の中身を先に返すと、同じ名前で中身を替えたサムネが前の画のまま出た。印が替われば別の物として取り直す
/* global __MEDIA_V__ */
const MAP = typeof __MEDIA_V__ !== 'undefined' ? __MEDIA_V__ : {}
/** public からの道（例 'thumbs/x.jpg'）に印を付けて返す。表に無い物はそのまま */
export function withV(p) {
  const v = MAP[p]
  return v ? `${p}?v=${v}` : p
}
