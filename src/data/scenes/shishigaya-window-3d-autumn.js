// 窓辺シリーズ「獅子ヶ谷の窓辺、秋の谷戸」。夏朝の谷戸（shishigaya-window-3d）の「秋」版。
// 稲を刈り取った黄金の刈田、天日に干す稲架掛け、紅葉に染まる里山。谷を縫うせせらぎ。
// 器（town3dKind:'yato'）は流用し、季節=autumn で刈田・稲架掛け・紅葉に変わる（中身を1枚作り込む方針）。
// 実在の商標・固有意匠は使わず、地形と佇まいのみ。窓をあけ、身を乗り出して秋夕の谷戸を見渡せる。

export default {
  id: 'shishigaya-window-3d-autumn',
  axes: { season: 'autumn', weather: 'clear', time: 'dusk' },
  label: '獅子ヶ谷の窓辺、秋の谷戸',
  desc: '刈り取った黄金の刈田と稲架掛け、紅葉の里山。秋夕の谷を窓から見下ろす立体の眺め。',
  status: 'ready',
  render: 'town3d', // Three.js ビューア（src/engine/town3dViewer.js）
  town3dKind: 'yato', // 谷戸（棚田・茅葺の屋敷・里山）。季節=autumn で刈田・稲架掛け・紅葉に
  bg3d: 'bg/town3d-yato.jpg', // 奥に敷く実写の里山（現状 town3d は手前の低ポリ遠山を使用＝任意層）

  palette: {
    early: {
      skyTop: '#8a9cc0', // 秋夕の澄んだ薄藍
      skyMid: '#cbb9b4', // 夕暮れの暖かい霞
      horizon: '#f0cc92', // 谷の向こうに沈む金色の夕陽
      sunGlow: '#ffd9a0',
      dropTint: '#6a4e2c', // 紅葉・刈田の暖かい影
    },
    late: {
      skyTop: '#74809e', // 陽が傾き藍が深まる
      skyMid: '#c0a69c',
      horizon: '#eab472', // 茜の地平
      sunGlow: '#ffc888',
      dropTint: '#5c4426',
    },
  },
  driftPeriod: 320,
  phenomena: {},

  // 秋夕の谷戸＝秋の虫の音（鈴虫/コオロギ）＋せせらぎ（既存の素材を再利用。出典とライセンスは CREDITS.md）。
  // 夏朝のウグイスでなく、秋夕に合う虫の音へ（情景に合うBGM）。出典は CREDITS.md に記録済み。
  sounds: [
    { id: 'crickets', label: '虫の音', src: 'audio/autumn-dusk-corner-room/crickets.mp3', gain: 0.4, loop: true },
    { id: 'stream', label: 'せせらぎ', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.26, loop: true },
  ],
}
