// 「梅雨の朝、あじさい」。rainGlass（雨ガラス）にFlux水彩の背景を重ねる。
// 窓ガラスを流れる雨が、あじさいの咲く小径の水彩を屈折させる。雨音・蛙・うぐいす。

export default {
  id: 'summer-rain-morning',
  axes: { season: 'summer', weather: 'rain', time: 'morning' },
  label: '梅雨の朝、あじさい',
  desc: '窓ガラスを流れる雨と、あじさいの咲く小径。雨音・蛙の声・遠くのうぐいす',
  status: 'ready',
  render: 'rainGlass',
  intensityLabel: '雨脚',

  // 窓の外の背景（Flux水彩生成）。雨粒がこの絵を屈折させる。雨で和らぐ画調を活かし超解像はかけない。
  bgPrompt:
    'watercolor and soft realism blend, nostalgic Japanese residential lane on a rainy early-summer morning during the plum-rain season, lush blue purple and pink hydrangea flowers in full bloom lining a wet stone path, low tiled-roof houses softly blurred behind, overcast soft grey-green rainy light, fresh wet green foliage, gentle misty atmosphere, calm and serene, muted cool tones, painterly bokeh, vertical composition, no people, no text',
  bg: 'bg/summer-rain-morning.jpg',

  // 色パレット（#rrggbb）。雨の朝＝くすんだ灰青〜灰緑のやわらかな曇り光。
  palette: {
    // 朝の入り（雨雲がまだ濃い）
    early: {
      skyTop: '#5e6a72', // 天頂・雨雲の灰青
      skyMid: '#7c8a80', // 中空・灰みの緑
      horizon: '#9aa28e', // 地平・濡れた緑灰
      sunGlow: '#c6ccba', // 曇りのやわらかな光
      dropTint: '#b4beb6', // 水滴のハイライト（淡い灰白）
    },
    // 朝が進む（少し明るむが、なお湿る）
    late: {
      skyTop: '#6a767c',
      skyMid: '#8a978b',
      horizon: '#a8ae9a',
      sunGlow: '#d6dac8',
      dropTint: '#c2cabf',
    },
  },

  driftPeriod: 300,

  phenomena: {
    rain: { intensity: 0.5 }, // 梅雨のしとしと（旗艦の夕立より控えめ）
  },

  // 音セット。出典・ライセンスは CREDITS.md に全数記録。
  sounds: [
    { id: 'rain', label: '雨音', src: 'audio/summer-rain-dusk/rain.mp3', gain: 0.8, loop: true },
    { id: 'frogs', label: '蛙', src: 'audio/spring-dusk-corner-room/frogs.mp3', gain: 0.3, loop: true },
    // 遠くのうぐいすが時折そっと（梅雨の朝の郷愁）。
    { id: 'uguisu', label: 'うぐいす', src: 'audio/shishigaya-morning-yato/uguisu.mp3', loop: false, interval: [18, 40], gain: 0.34 },
  ],
}
