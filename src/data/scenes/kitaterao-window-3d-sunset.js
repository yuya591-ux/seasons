// 「北寺尾の窓辺、立体の街（夕焼け）」。本物の3D（Three.js）の坂の街を、窓から見下ろす夕焼け。
// 深い茜のパレットで duskAmt が高くなり、窓・商店・ネオンが灯り始め、雲海が夕陽に染まる（飛んで雲海に出ると茜金の海）。
// 既存の昼情景（time:'dusk' だが実際は霞む昼）とは別の、本物の夕暮れ。茜の空ドームを活かす。

export default {
  id: 'kitaterao-window-3d-sunset',
  axes: { season: 'summer', weather: 'clear', time: 'dusk' },
  label: '北寺尾の窓辺、立体の街（夕焼け）',
  desc: '坂の街が夕陽に染まる立体の眺め。窓や商店が灯りはじめ、高く飛べば雲海が茜金に燃える。',
  status: 'ready',
  render: 'town3d',

  palette: {
    early: {
      // 注: THREE.Color はhexをリニア色空間に変換し、その輝度で isNight(夜)/duskAmt を判定する。
      // 暗い青紫だとリニア輝度が低く「夜」と誤判定され雲海の夕染めが切れる→明るめの夕ラベンダーにして
      // duskAmt≈0.55・isNight=false を保つ（茜の地平・金の陽が夕暮れ感を担う）。
      skyTop: '#8e86b8', // 夕のラベンダーの天頂（夜判定を踏まない明るさ）
      skyMid: '#bb95a4',
      horizon: '#f2a368', // 茜の地平
      sunGlow: '#ffcf8a', // 沈みゆく金の陽
      dropTint: '#3a4a30', // 夏草（夕影）
    },
    late: {
      skyTop: '#3a4072', // 暮れてゆく深い青紫
      skyMid: '#7e6690',
      horizon: '#e8895a', // 燃える橙
      sunGlow: '#ffba6a',
      dropTint: '#32402a',
    },
  },
  driftPeriod: 300,
  phenomena: {},

  // 夏の夕暮れ。日が暮れていくにつれ夕のヒグラシが退き、宵の鈴虫が満ちる＝同じ情景の中で時間が動く（dayFade）。
  sounds: [
    { id: 'higurashi', label: 'ヒグラシ', src: 'audio/summer-rain-dusk/higurashi.mp3', gain: 0.4, loop: true, dayFade: 'out' },
    { id: 'suzumushi', label: '鈴虫', src: 'audio/kitaterao-window-3d-night/suzumushi.mp3', gain: 0.26, loop: true, swell: true, dayFade: 'in' },
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.07, loop: true },
  ],
}
