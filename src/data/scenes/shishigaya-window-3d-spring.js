// 窓辺シリーズ「獅子ヶ谷の窓辺、春の谷戸」。谷戸の器（town3dKind:'yato'）を流用した「春」版。
// 田植えの頃、水を張ったばかりの棚田が朝空を一面に映す水鏡。畦には菜の花、里山は桜と新緑。
// 季節=spring で、葉色が桜＋新緑に変わり、棚田は水鏡主体に、畦に菜の花が咲く（中身を1枚作り込む方針）。
// 実在の商標・固有意匠は使わず、地形と佇まいのみ。窓をあけ、身を乗り出して春の谷戸を見渡せる。

export default {
  id: 'shishigaya-window-3d-spring',
  axes: { season: 'spring', weather: 'clear', time: 'morning' },
  label: '獅子ヶ谷の窓辺、春の谷戸',
  desc: '田植えの水を張った棚田が朝空を映す水鏡。畦の菜の花、桜と新緑の里山。春朝の谷を窓から見下ろす。',
  status: 'ready',
  render: 'town3d', // Three.js ビューア（src/engine/town3dViewer.js）
  town3dKind: 'yato', // 谷戸（棚田・茅葺の屋敷・里山）。季節=spring で水鏡＋菜の花＋桜に
  bg3d: 'bg/town3d-yato.jpg', // 奥に敷く実写の里山（現状 town3d は手前の低ポリ遠山を使用＝任意層）

  palette: {
    early: {
      skyTop: '#86aed8', // 澄んだ春の朝の青空
      skyMid: '#bcd6e6',
      horizon: '#f0e6cc', // 春霞の淡い地平（暖かみ）
      sunGlow: '#fff2da',
      dropTint: '#5e7c40', // 谷の新緑の影
    },
    late: {
      skyTop: '#9cc0de',
      skyMid: '#cee0ec',
      horizon: '#f4ecd6',
      sunGlow: '#fff6e6',
      dropTint: '#56723a',
    },
  },
  driftPeriod: 320,
  phenomena: {},

  // 春の朝の谷戸＝ウグイス＋谷を縫うせせらぎ＋渡る風（既存の素材を再利用。出典とライセンスは CREDITS.md。CREDITS.md記録済み）。
  sounds: [
    { id: 'uguisu', label: '鶯', src: 'audio/shishigaya-morning-yato/uguisu.mp3', gain: 0.5, loop: false, interval: [6, 16] },
    { id: 'stream', label: 'せせらぎ', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.3, loop: true },
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.07, loop: true },
  ],
}
