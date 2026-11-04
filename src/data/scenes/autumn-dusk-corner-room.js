// 窓辺シリーズの本命「高台の角部屋」。室内に立ち、窓から夕暮れの下町を見下ろす。
// 右へ見回すと、隣のマンションの壁が迫って街を遮る＝角部屋にいる手応え。
// 色5値は他情景と共通の名前で受け取り、ここでは空・残照・建物・窓あかりとして解釈する。

export default {
  id: 'autumn-dusk-corner-room',
  axes: { season: 'autumn', weather: 'cloudy', time: 'dusk' },
  label: '秋の夕暮れ、鴨川デルタの角部屋',
  desc: '夕日に染まる鴨川デルタと飛び石。川向こうに京の家並み。指や傾きで見回す。',
  status: 'ready',
  render: 'town3d',          // 角部屋を立体の街エンジンへ載せ替え（2D視差の見回し破綻を構造から解消・立体感のため）
  town3dKind: 'corner',      // 室内から窓越しに下町を見下ろす角部屋（townの建物・地形・車・人・イベントを流用）
  town3dWeather: 'leaves',   // 紅葉が窓の外を舞う
  lowRise: true,
  foliage: 'leaves',
  intensityLabel: '街あかり', // 灯る窓の多さ

  palette: {
    early: {
      skyTop: '#2a2740',
      skyMid: '#6b5168',
      horizon: '#c87a52',
      sunGlow: '#f2b878',
      dropTint: '#4a3f4a',
    },
    late: {
      skyTop: '#1a1828',
      skyMid: '#43354a',
      horizon: '#8f4f3e',
      sunGlow: '#d99258',
      dropTint: '#332b36',
    },
  },
  driftPeriod: 280,
  phenomena: {},

  // 秋の夕暮れの気配: 草むらの虫の音（鈴を振るような秋の夜長の始まり）＋名残のヒグラシ＋渡る風。
  // すべてライセンス明確な素材（CREDITS.md に全数記録）。
  // 便22: 音は自然の音だけ（木々のざわめき・川・雨・虫・鳥）。素材の低い唸り（車の走る音のように聞こえた）を hp で切る。人の声は鴨川デルタの近さで町の側が足す
  sounds: [
    { id: 'crickets', label: '虫の音', src: 'audio/autumn-dusk-corner-room/crickets.mp3', gain: 0.4, loop: true, hp: 420 },
    { id: 'higurashi', label: 'ヒグラシ', src: 'audio/summer-rain-dusk/higurashi.mp3', gain: 0.14, loop: true, hp: 320 },
    { id: 'leaves', label: '木々のざわめき', src: 'audio/kamo/leaves.mp3', gain: 0.26, loop: true, hp: 160 },
    { id: 'kawa', label: '川の音', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.1, loop: true, pan: 0.15, hp: 260 },
  ],
}
