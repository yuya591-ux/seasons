// 窓辺シリーズ「獅子ヶ谷の窓辺、谷戸の立体」。出身地（横浜市鶴見区獅子ヶ谷）の谷戸を、
// 本物の3D（Three.js）で再現する。谷底の棚田（水田・青田）、茅葺の寄棟主屋＋長屋門（横溝屋敷を想起）、
// それを抱く屋敷林、谷を縫うせせらぎ、左右に立ち上がる里山。実在の商標・固有意匠は使わず地形と佇まいのみ。
// 窓をあけ、身を乗り出して朝の谷戸を見渡せる。

export default {
  id: 'shishigaya-window-3d',
  axes: { season: 'summer', weather: 'clear', time: 'morning' },
  label: '獅子ヶ谷の窓辺、谷戸の立体',
  desc: '本物の3Dで組んだ谷戸の棚田と茅葺の屋敷、里山。朝の谷を窓から見下ろす立体の眺め。',
  status: 'ready',
  render: 'town3d', // Three.js ビューア（src/engine/town3dViewer.js）
  town3dKind: 'yato', // 谷戸（棚田・茅葺の屋敷・里山）として組む
  bg3d: 'bg/town3d-yato.jpg', // 奥に敷く実写の里山の谷（棚田・茅葺／遠景を写真級に）
  mist: { k: 1.3 }, // 低く溜まる霧を朝の既定の1.3倍に（谷底の棚田に朝靄が溜まる＝src/data/mist.js）

  palette: {
    early: {
      skyTop: '#86aed4', // 澄んだ朝の青空
      skyMid: '#b6cedc',
      horizon: '#dce4d0', // 朝靄の淡い地平（白すぎないよう少し緑を残す）
      sunGlow: '#fff2d2',
      dropTint: '#536c34', // 谷の青葉の影
    },
    late: {
      skyTop: '#9cbdd6', // 朝が進み陽が高く
      skyMid: '#c4d6dc',
      horizon: '#e6dcc2',
      sunGlow: '#ffeec6',
      dropTint: '#4c6230',
    },
  },
  driftPeriod: 320,
  phenomena: {},

  // 朝の谷戸＝ウグイスとせせらぎ（出身地の既存CC0素材を再利用）。
  sounds: [
    { id: 'uguisu', label: '鶯', src: 'audio/shishigaya-morning-yato/uguisu.mp3', gain: 0.5, loop: false, interval: [6, 16] },
    { id: 'stream', label: 'せせらぎ', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.3, loop: true },
    { id: 'frogs', label: '田の蛙', src: 'audio/spring-dusk-corner-room/frogs.mp3', gain: 0.16, loop: true },
  ],
}
