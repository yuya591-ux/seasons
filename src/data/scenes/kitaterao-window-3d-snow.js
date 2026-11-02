// 窓辺シリーズ「北寺尾の窓辺、雪の立体の街」。本物の3D（Three.js）の坂の街に、
// 雪が静かに舞い降りる冬の夕暮れ。地面は淡く白み、常緑は暗く沈み、霞は冷たく濃い。
// 観覧車は雪の向こうにぼんやり灯る。窓をあけ、身を乗り出して雪の街を見渡せる。

export default {
  id: 'kitaterao-window-3d-snow',
  axes: { season: 'winter', weather: 'snow', time: 'dusk' },
  label: '北寺尾の窓辺、雪の立体の街',
  desc: '本物の3Dで組んだ坂の街に、粉雪が舞う冬の夕暮れ。白んだ街を窓から見下ろす立体の眺め。',
  status: 'ready',
  render: 'town3d', // Three.js ビューア（src/engine/town3dViewer.js）
  town3dWeather: 'snow', // 雪を降らせる
  // bg3d は敢えて置かない: 明るい雪景色の実写を奥に敷くと、街が霧で白い写真に溶けて全体が白飛びした。
  // 雨シーン同様に空ドームのみにし、雪雲の鈍色の地平に街の階調を残す（眺める対象の街を見えるように）。

  palette: {
    early: {
      skyTop: '#7a8ca4', // 雪雲の鈍色（やや沈めて街が白に溶けるのを防ぐ＝冬夕の階調）
      skyMid: '#9eabbd',
      horizon: '#c4cace', // 雪明かりの地平（明るすぎる灰だと中景の街が白飛びする→一段落とす）
      sunGlow: '#ecdfc6',
      dropTint: '#525c68', // 冷たい影色
    },
    late: {
      skyTop: '#7c8aa0', // 暮れてゆく鈍色
      skyMid: '#aab2c0',
      horizon: '#e2cdb4', // ほのかな残照
      sunGlow: '#f0dcc0',
      dropTint: '#4e5664',
    },
  },
  driftPeriod: 320,
  phenomena: {},

  // 冬の窓辺の風（既存の素材を再利用。出典とライセンスは CREDITS.md）。
  sounds: [
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.16, loop: true },
  ],
}
