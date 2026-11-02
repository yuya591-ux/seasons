// 窓辺シリーズ「北寺尾の窓辺、紅葉の立体の街」。本物の3D（Three.js）の坂の街に、
// 紅葉した木々と舞い落ちる落ち葉。秋の澄んだ夕暮れ、空は茜から紫紺へ。
// 観覧車は紅葉の向こうに佇む。窓をあけ、身を乗り出して秋の街を見渡せる。

export default {
  id: 'kitaterao-window-3d-autumn',
  axes: { season: 'autumn', weather: 'clear', time: 'dusk' },
  label: '北寺尾の窓辺、紅葉の立体の街',
  desc: '本物の3Dで組んだ坂の街に、紅葉と舞い落ちる落ち葉。澄んだ秋の夕暮れを窓から見下ろす眺め。',
  status: 'ready',
  render: 'town3d', // Three.js ビューア（src/engine/town3dViewer.js）
  town3dWeather: 'leaves', // 落ち葉を降らせる

  palette: {
    early: {
      skyTop: '#7d9cc0', // 澄んだ秋の夕方前の空
      skyMid: '#b8c8d4',
      horizon: '#f0d6b0', // 金色の地平
      sunGlow: '#ffe2b4',
      dropTint: '#9a6a3a', // 枯葉の影色
    },
    late: {
      skyTop: '#5a5e84', // 暮れてゆく紫紺
      skyMid: '#9a8ca4',
      horizon: '#f2b878', // 茜の残照
      sunGlow: '#ffcf96',
      dropTint: '#8a5a30',
    },
  },
  driftPeriod: 300,
  phenomena: {},

  // 秋の夕の虫の音＋やわらかな風（既存の素材を再利用。出典とライセンスは CREDITS.md）。
  sounds: [
    { id: 'mushi', label: '虫の音', src: 'audio/autumn-dusk-corner-room/crickets.mp3', gain: 0.42, loop: true },
    { id: 'suzumushi', label: '鈴虫', src: 'audio/kitaterao-window-3d-night/suzumushi.mp3', gain: 0.24, loop: true },
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.08, loop: true },
  ],
}
