// 窓辺シリーズ「北寺尾の窓辺、花の立体の街」。本物の3D（Three.js）の坂の街に、
// 桜の花びらが舞う春の夕暮れ。木々は桜と新緑が混じり、地面は若草色。遠くにうぐいすの声。
// 観覧車は霞む茜の空に佇む。窓をあけ、身を乗り出して花の街を見渡せる。

export default {
  id: 'kitaterao-window-3d-spring',
  axes: { season: 'spring', weather: 'clear', time: 'dusk' },
  label: '北寺尾の窓辺、花の立体の街',
  desc: '本物の3Dで組んだ坂の街に、桜の花びらが舞う春の夕暮れ。若草と茜の街を窓から見下ろす眺め。',
  status: 'ready',
  render: 'town3d', // Three.js ビューア（src/engine/town3dViewer.js）
  town3dWeather: 'petals', // 桜の花びらを降らせる
  bg3d: 'bg/town3d-spring.jpg', // 奥に敷く実写の春の里山（桜・若草／遠景を写真級に）

  palette: {
    early: {
      skyTop: '#b6cfe0', // 春の霞んだ水色
      skyMid: '#d8e0e2',
      horizon: '#f3dcc8', // 淡い夕方前の地平
      sunGlow: '#ffe8d2',
      dropTint: '#7a8a5a', // 若草の影
    },
    late: {
      skyTop: '#d9b8c4', // 桜色に染まる夕空
      skyMid: '#ecd0cc',
      horizon: '#f6d2b0', // 茜の残照
      sunGlow: '#ffe0c4',
      dropTint: '#6e7e50',
    },
  },
  driftPeriod: 300,
  phenomena: {},

  // 春のうぐいす＋やわらかな風（既存の素材を再利用。出典とライセンスは CREDITS.md）。蛙のゲコゲコは街の情景に合わず不快なため差し替え。
  sounds: [
    { id: 'uguisu', label: 'うぐいす', src: 'audio/shishigaya-morning-yato/uguisu.mp3', loop: false, interval: [7, 19], gain: 0.34 },
    { id: 'frogs', label: '遠くの蛙', src: 'audio/spring-dusk-corner-room/frogs.mp3', gain: 0.13, loop: true },
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.1, loop: true },
  ],
}
