// 角部屋シリーズ「春の夕暮れ」。淡い桜色の空、窓の外を花びらが舞う。
// cornerRoom 器＋foliage(花びら)を再利用（データ追加のみ）。

export default {
  id: 'spring-dusk-corner-room',
  axes: { season: 'spring', weather: 'clear', time: 'dusk' },
  label: '春の夕暮れ、鴨川デルタの角部屋',
  desc: '桜色の夕空と、川風に舞う花びら。デルタの向こうに東山。',
  status: 'ready',
  render: 'town3d',          // 立体の街エンジンへ載せ替え（見回しの正しさ・立体感）
  town3dKind: 'corner',
  town3dWeather: 'petals',   // 花びらが窓の外を舞う
  lowRise: true,
  foliage: 'petals',
  intensityLabel: '街あかり',

  palette: {
    early: {
      skyTop: '#3a3550',
      skyMid: '#7d6478',
      horizon: '#e8a8a0', // 桜色の夕暮れ
      sunGlow: '#ffd8d0',
      dropTint: '#4a4048',
    },
    late: {
      skyTop: '#2a2640',
      skyMid: '#5a4a5c',
      horizon: '#c87878',
      sunGlow: '#f0b8b0',
      dropTint: '#383038',
    },
  },
  driftPeriod: 280,
  phenomena: {},

  // 春の宵の気配: うぐいす＋渡る風（春の郷愁）。カエルの合唱は街の窓辺に合わず不快なため差し替え。CREDITS.md に全数記録。
  // 便22: 音は自然の音だけ（木々のざわめき・川・雨・虫・鳥）。素材の低い唸り（車の走る音のように聞こえた）を hp で切る。人の声は鴨川デルタの近さで町の側が足す
  sounds: [
    { id: 'uguisu', label: 'うぐいす', src: 'audio/shishigaya-morning-yato/uguisu.mp3', loop: false, interval: [9, 22], gain: 0.3, hp: 300 },
    { id: 'leaves', label: '木々のざわめき', src: 'audio/kamo/leaves.mp3', gain: 0.26, loop: true, hp: 160 },
    { id: 'kawa', label: '川の音', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.1, loop: true, pan: 0.15, hp: 260 },
  ],
}
