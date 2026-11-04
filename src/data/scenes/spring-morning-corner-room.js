// 角部屋シリーズ「春の朝」。淡い桜色の朝空、窓の外を花びらが舞う。
// cornerRoom 器＋foliage(花びら)を再利用（データ追加のみ）。季節の偏り是正の春の一枚。

export default {
  id: 'spring-morning-corner-room',
  axes: { season: 'spring', weather: 'clear', time: 'morning' },
  label: '春の朝、鴨川デルタの角部屋',
  desc: '澄んだ朝の鴨川と、窓の外を舞う花びら。',
  status: 'ready',
  render: 'town3d',          // 立体の街エンジンへ載せ替え（見回しの正しさ・立体感）
  town3dKind: 'corner',
  town3dWeather: 'petals',   // 花びらが窓の外を舞う
  lowRise: true,
  foliage: 'petals',
  intensityLabel: '街あかり',

  palette: {
    early: {
      skyTop: '#6e88ba', // 朝空の青を少し深め＝白っぽい低コントラストを脱す（評価 美術-M1）
      skyMid: '#a4bcd4',
      horizon: '#eebcae', // 夜明けの桜色（白を抜き桜の彩度を上げる）
      sunGlow: '#ffe6d2',
      dropTint: '#6e7c8a', // 影色を深め中景のコントラストを回復
    },
    late: {
      skyTop: '#8fb0d8',
      skyMid: '#cadce8',
      horizon: '#ecdcd2',
      sunGlow: '#fff5ec',
      dropTint: '#a8b2bc',
    },
  },
  driftPeriod: 280,
  phenomena: {},

  // 春の朝の気配: うぐいすと渡る風をうっすら（既存の素材を再利用。CREDITS.md記録済み）
  // 便22: 音は自然の音だけ（木々のざわめき・川・雨・虫・鳥）。素材の低い唸り（車の走る音のように聞こえた）を hp で切る。人の声は鴨川デルタの近さで町の側が足す
  sounds: [
    { id: 'leaves', label: '木々のざわめき', src: 'audio/kamo/leaves.mp3', gain: 0.24, loop: true, hp: 160 },
    { id: 'kawa', label: '川の音', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.12, loop: true, pan: 0.15, hp: 260 },
    { id: 'uguisu', label: 'ウグイス', src: 'audio/shishigaya-morning-yato/uguisu.mp3', loop: false, interval: [6, 17], gain: 0.4, hp: 300 },
  ],
}
