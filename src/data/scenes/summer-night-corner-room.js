// 角部屋シリーズ「夏の夜」（便20）。窓の外は鴨川（出町柳の合流・鴨川デルタ）。川べりに涼む人が等間隔に座り、
// 叡山電車の灯りが出町柳の駅に着いては出ていく。夜が更けると、五山の送り火が本物の順に灯る（大文字から鳥居形まで・夏の夜だけ。開いて30秒ほどで1回目、その後は10〜16分おき）。
// cornerRoom 器を再利用（データ追加のみ）。音は今ある素材の組み合わせ（虫の音・鈴虫・遠いせせらぎ・夜風）。

export default {
  id: 'summer-night-corner-room',
  axes: { season: 'summer', weather: 'clear', time: 'night' },
  label: '夏の夜、川べりの角部屋',
  desc: '川風の夜。川べりに涼む人の影と、駅に着く電車の灯り。夜が更けると、五山の送り火が順に灯る。',
  status: 'ready',
  render: 'town3d',
  town3dKind: 'corner',
  lowRise: true,
  intensityLabel: '街あかり',

  palette: {
    early: {
      skyTop: '#0d1228',
      skyMid: '#1c2444',
      horizon: '#33283f',
      sunGlow: '#ffd79a',
      dropTint: '#141d18',
    },
    late: {
      skyTop: '#090d20',
      skyMid: '#161c38',
      horizon: '#2a2236',
      sunGlow: '#ffdca6',
      dropTint: '#0f1612',
    },
  },
  driftPeriod: 300,
  phenomena: {},

  sounds: [
    { id: 'mushi', label: '虫の音', src: 'audio/autumn-dusk-corner-room/crickets.mp3', gain: 0.26, loop: true, swell: true, pan: -0.22 },
    { id: 'suzumushi', label: '鈴虫', src: 'audio/kitaterao-window-3d-night/suzumushi.mp3', gain: 0.2, loop: true, swell: true, pan: 0.28 },
    { id: 'kawa', label: '川の音', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.16, loop: true, pan: 0.15 },
    { id: 'wind', label: '夜風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.08, loop: true },
  ],
}
