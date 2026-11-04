// 角部屋シリーズ「夏の朝」。やわらかな朝靄の光、眼下に目覚めはじめる街。
// ヒグラシは明け方にも鳴く。cornerRoom 器を再利用（データ追加のみ）。

export default {
  id: 'summer-morning-corner-room',
  axes: { season: 'summer', weather: 'cloudy', time: 'morning' },
  label: '夏の朝、鴨川デルタの角部屋',
  desc: '朝の鴨川。浅瀬で遊ぶ子どもと、飛び石を渡る人。指や傾きで見回す。',
  status: 'ready',
  render: 'town3d',          // 立体の街エンジンへ載せ替え（見回しの正しさ・立体感）
  town3dKind: 'corner',
  lowRise: true,
  intensityLabel: '街あかり',

  palette: {
    early: {
      skyTop: '#8aa0ba', // 明け方の青を深め＝ミルク色の低コントラストを脱す（評価 美術-M1）
      skyMid: '#aeb9c2',
      horizon: '#e6c79a', // 朝焼けの暖かみ（彩度を上げ白っぽさを抜く）
      sunGlow: '#ffeccc',
      dropTint: '#62616a',
    },
    late: {
      skyTop: '#a8bcd0',
      skyMid: '#d6cfc6',
      horizon: '#f0dcb8',
      sunGlow: '#fff6e6',
      dropTint: '#7a7880',
    },
  },
  driftPeriod: 280,
  phenomena: {},

  // 便22: 音は自然の音だけ（木々のざわめき・川・雨・虫・鳥）。素材の低い唸り（車の走る音のように聞こえた）を hp で切る。人の声は鴨川デルタの近さで町の側が足す
  sounds: [
    { id: 'higurashi', label: 'ヒグラシ', src: 'audio/summer-rain-dusk/higurashi.mp3', gain: 0.3, loop: true, hp: 320 },
    { id: 'leaves', label: '木々のざわめき', src: 'audio/kamo/leaves.mp3', gain: 0.24, loop: true, hp: 160 },
    { id: 'kawa', label: '川の音', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.12, loop: true, pan: 0.15, hp: 260 },
  ],
}
