// 角部屋シリーズ「冬の雪の夕暮れ」。雪が舞い、窓の桟と窓台に積もる。眼下に冷たい街あかり。
// cornerRoom 器＋glass(雪)を再利用（データ追加のみ）。

export default {
  id: 'winter-snow-dusk-corner-room',
  axes: { season: 'winter', weather: 'snow', time: 'dusk' },
  label: '冬の雪の夕暮れ、鴨川デルタの角部屋',
  desc: '舞う雪と、白く染まる河川敷。比叡の山並みに冷たい夕あかり。',
  status: 'ready',
  render: 'town3d',          // 立体の街エンジンへ載せ替え（見回しの正しさ・立体感）
  town3dKind: 'corner',
  town3dWeather: 'snow',     // 雪が舞う
  lowRise: true,
  glass: 'snow',
  intensityLabel: '街あかり',

  palette: {
    early: {
      skyTop: '#3a4358', // 冷たい青灰の夕
      skyMid: '#6b7488',
      horizon: '#b0a8a8',
      sunGlow: '#ffe8d0', // 雪ごしの暖かい窓あかり
      dropTint: '#3e424e',
    },
    late: {
      skyTop: '#2a3346',
      skyMid: '#525a6e',
      horizon: '#8f8a92',
      sunGlow: '#ffe0c8',
      dropTint: '#2e323c',
    },
  },
  driftPeriod: 300,
  phenomena: { snow: { intensity: 0.6 } },

  // 便22: 音は自然の音だけ（木々のざわめき・川・雨・虫・鳥）。素材の低い唸り（車の走る音のように聞こえた）を hp で切る。人の声は鴨川デルタの近さで町の側が足す
  sounds: [
    { id: 'leaves', label: '木々のざわめき', src: 'audio/kamo/leaves.mp3', gain: 0.22, loop: true, hp: 160 },
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.12, loop: true, hp: 450 },
  ],
}
