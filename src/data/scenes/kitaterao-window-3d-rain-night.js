// 「北寺尾の窓辺、立体の街（雨の夜）」。本物の3D（Three.js）の坂の街に夏の夜雨が降る。
// 暗い palette で town3dViewer が夜モード（灯る窓・街灯・車のライト）になり、weather:'rain' で降る雨筋＋
// 自機追従の濡れた路面のきらめき＋雨の波紋が効く。曇天なので星は出さず、雲ごしの淡い月。
// 暖かい窓灯りが雨に滲み、濡れた路面に照り返す＝最も静かでエモい夜の雨。歩いて降りれば雨の路地。

export default {
  id: 'kitaterao-window-3d-rain-night',
  axes: { season: 'summer', weather: 'rain', time: 'night' },
  label: '北寺尾の窓辺、立体の街（雨の夜）',
  desc: '坂の街に夜の雨が降る。灯る窓が雨に滲み、濡れた路面が灯りを照り返す。遠くで雷が光り、歩いて降りれば静かな雨の路地。',
  status: 'ready',
  render: 'town3d',
  town3dWeather: 'rain', // 雨を降らせる（降る雨筋＋濡れた路面＋波紋）。town3dはこのフィールドで天候を受け取る

  palette: {
    early: {
      skyTop: '#141a2e', // 雨雲の夜空（夜判定＝暗い）
      skyMid: '#23293f',
      horizon: '#352d3e', // 街灯りが雨雲に滲む紫
      sunGlow: '#ffd79a', // 窓・灯りの暖色
      dropTint: '#131c17',
    },
    late: {
      skyTop: '#0e1322',
      skyMid: '#1b2238',
      horizon: '#2a2336',
      sunGlow: '#ffcf90',
      dropTint: '#101610',
    },
  },
  driftPeriod: 320,
  phenomena: {},

  // 夏の夜雨＝雨音（主）＋遠雷（時々ピカッと光る・cue:thunder）＋ごく淡い夜風。既存の素材を再利用。
  sounds: [
    { id: 'rain', label: '雨音', src: 'audio/summer-rain-dusk/rain.mp3', gain: 0.6, loop: true },
    { id: 'thunder', label: '遠雷', src: 'audio/summer-rain-dusk/thunder.mp3', gain: 0.4, loop: false, interval: [26, 60], cue: 'thunder' },
    { id: 'wind', label: '夜風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.08, loop: true },
  ],
}
