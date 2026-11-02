// 「北寺尾の窓辺、立体の街（夏の雨）」。本物の3D（Three.js）の坂の街に夏の雨が降る夕暮れ。
// SPEC原点の「夏・雨・夕方・ヒグラシ」を立体の街で。weather:'rain' で降る雨筋＋濡れた路面のきらめき＋
// 雨で霞む霧が効く（town3dViewer の weather==='rain' 分岐）。歩いて降りれば雨の路地、灯る窓・街灯が濡れて照り返す。
// 空は overcast の灰ラベンダー（夜判定を踏まない明るさ＝duskAmt 中庸で窓/街灯が灯りはじめる）。

export default {
  id: 'kitaterao-window-3d-rain',
  axes: { season: 'summer', weather: 'rain', time: 'dusk' },
  label: '北寺尾の窓辺、立体の街（夏の雨）',
  desc: '坂の街に夏の雨が降る夕暮れ。雨筋がけむり、濡れた路面が灯りを照り返す。歩いて降りれば雨の路地、ヒグラシが遠くで鳴く。',
  status: 'ready',
  render: 'town3d',
  town3dWeather: 'rain', // 雨を降らせる（降る雨筋＋濡れた路面＋波紋）。town3dはこのフィールドで天候を受け取る

  palette: {
    early: {
      // 注: THREE.Color はhexをリニアに変換しその輝度で isNight/duskAmt を判定。暗すぎると「夜」誤判定で
      // 雲海の夕染めが切れる→ overcast でも明るめの灰ラベンダーにして duskAmt 中庸・isNight=false を保つ。
      skyTop: '#8c8b9a', // 雨雲の灰ラベンダー（夜判定を踏まない明るさ）
      skyMid: '#9c9298',
      horizon: '#c2a492', // 雲の向こうに滲む夕の暖かみ（弱い）
      sunGlow: '#d6c2aa', // 雲ごしの拡散した陽（鋭い陽は出ない）
      dropTint: '#36422c', // 雨に濡れた夏草
    },
    late: {
      skyTop: '#4a4c66', // 暮れてゆく雨雲の藍
      skyMid: '#76707e',
      horizon: '#c08866', // 雲の隙間の残照
      sunGlow: '#e2b488',
      dropTint: '#2e3a26',
    },
  },
  driftPeriod: 300,
  phenomena: {},

  // 夏の雨の夕暮れ＝雨音（主）＋遠くのヒグラシ（夕方の蝉）。既存の素材（summer-rain-dusk）を再利用。
  sounds: [
    { id: 'rain', label: '雨', src: 'audio/summer-rain-dusk/rain.mp3', gain: 0.5, loop: true },
    { id: 'higurashi', label: 'ヒグラシ', src: 'audio/summer-rain-dusk/higurashi.mp3', gain: 0.28, loop: true },
  ],
}
