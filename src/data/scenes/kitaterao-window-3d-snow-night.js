// 「北寺尾の窓辺、立体の街（雪の夜）」。本物の3D（Three.js）の坂の街に冬の夜雪が降る。
// 暗い palette で夜モード（灯る窓・街灯）になり、weather:'snow' で降る雪＋積雪の雪冠が乗る。
// 雪あかりで夜空はわずかに紫がかり、暖かい窓灯りが舞う雪ごしに滲む＝最も静かで穏やかな冬の夜。
// 歩いて降りれば、雪を踏みしめる音だけが響く雪夜の路地。

export default {
  id: 'kitaterao-window-3d-snow-night',
  axes: { season: 'winter', weather: 'snow', time: 'night' },
  label: '北寺尾の窓辺、立体の街（雪の夜）',
  desc: '坂の街に夜の雪が降る。雪あかりに夜空が淡く滲み、灯る窓が舞う雪ごしに揺れる。歩いて降りれば、雪を踏む音だけの静かな路地。',
  status: 'ready',
  render: 'town3d',
  town3dWeather: 'snow', // 雪を降らせる（降雪＋積雪の雪冠）。town3dはこのフィールドで天候を受け取る

  palette: {
    early: {
      skyTop: '#1a1e30', // 雪の夜空（夜判定＝暗い。雪あかりでわずかに青紫）
      skyMid: '#272a40',
      horizon: '#37313f', // 街灯りが雪雲に滲む紫
      sunGlow: '#ffe0b0', // 窓・灯りの暖色（雪に映える）
      dropTint: '#1a2220',
    },
    late: {
      skyTop: '#141828',
      skyMid: '#202439',
      horizon: '#2c2638',
      sunGlow: '#ffd8a2',
      dropTint: '#141a18',
    },
  },
  driftPeriod: 330,
  phenomena: {},

  // 冬の夜＝雪が音を吸う静けさ＝ごく淡い夜風だけ。既存の素材を再利用。
  sounds: [
    { id: 'wind', label: '夜風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.13, loop: true },
  ],
}
