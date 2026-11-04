// 角部屋シリーズ「秋の雨の夜」。窓ガラスを雨が流れ、眼下に夜の街あかりがにじむ。
// 時おり遠雷が空をほのかに照らす。右を向くと隣の建物の壁。cornerRoom 器を再利用（データ追加のみ）。

export default {
  id: 'autumn-rain-night-corner-room',
  axes: { season: 'autumn', weather: 'rain', time: 'night' },
  label: '秋の雨の夜、鴨川デルタの角部屋',
  desc: '窓を流れる雨と、川向こうににじむ京の町あかり。時おり遠雷。',
  status: 'ready',
  render: 'town3d',          // 立体の街エンジンへ載せ替え（見回しの正しさ・立体感）
  town3dKind: 'corner',
  town3dWeather: 'rain',     // 常時の雨筋＋濡れた路面の反射
  lowRise: true,
  glass: 'rain',
  foliage: 'leaves',
  intensityLabel: '街あかり',

  palette: {
    early: {
      skyTop: '#0c0e22',
      skyMid: '#1a1830',
      horizon: '#3a2c3a', // 雲に映る街明かり
      sunGlow: '#ffd089', // 窓・街灯のあかり
      dropTint: '#100e18',
    },
    late: {
      skyTop: '#080a1a',
      skyMid: '#15131f',
      horizon: '#2e2330',
      sunGlow: '#ffd9a0',
      dropTint: '#0c0a12',
    },
  },
  driftPeriod: 300,
  phenomena: { rain: { intensity: 0.7 } },

  // 便22: 音は自然の音だけ（木々のざわめき・川・雨・虫・鳥）。素材の低い唸り（車の走る音のように聞こえた）を hp で切る。人の声は鴨川デルタの近さで町の側が足す
  sounds: [
    { id: 'rain', label: '雨音', src: 'audio/summer-rain-dusk/rain.mp3', gain: 0.8, loop: true, hp: 230 },
    { id: 'thunder', label: '遠雷', src: 'audio/summer-rain-dusk/thunder.mp3', gain: 0.4, loop: false, interval: [30, 70], cue: 'thunder' },
    { id: 'leaves', label: '木々のざわめき', src: 'audio/kamo/leaves.mp3', gain: 0.16, loop: true, hp: 160 },
  ],
}
