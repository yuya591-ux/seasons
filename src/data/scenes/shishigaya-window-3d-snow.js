// 窓辺シリーズ「獅子ヶ谷の窓辺、雪の谷戸」。谷戸の器（town3dKind:'yato'）を流用した「冬」版。
// 雪をかぶった段々の棚田、白く積もる茅葺の横溝屋敷、葉を落とした里山に粉雪が舞う。谷を縫う凍てたせせらぎ。
// 季節=winter・天気=snow で、雪化粧（snowify）と冬の棚田（雪原・凍った水面）に変わる（中身を1枚作り込む方針）。
// 実在の商標・固有意匠は使わず、地形と佇まいのみ。窓をあけ、身を乗り出して雪の谷戸を見渡せる。

export default {
  id: 'shishigaya-window-3d-snow',
  axes: { season: 'winter', weather: 'snow', time: 'dusk' },
  label: '獅子ヶ谷の窓辺、雪の谷戸',
  desc: '雪をかぶった段々の棚田と茅葺の屋敷、粉雪の舞う里山。冬夕の谷を窓から見下ろす立体の眺め。',
  status: 'ready',
  render: 'town3d', // Three.js ビューア（src/engine/town3dViewer.js）
  town3dKind: 'yato', // 谷戸（棚田・茅葺の屋敷・里山）。季節=winter・天気=snowで雪景色に
  town3dWeather: 'snow', // 粉雪を降らせる＋全トゥーン材に雪冠（snowify）

  palette: {
    early: {
      skyTop: '#8ba1bb', // 雪雲の鈍色（上端は青灰を残し白飛びを防ぐ）
      skyMid: '#b6c2cf',
      horizon: '#dcdcd8', // 雪明かりの淡い地平（純白でなく僅かに灰を残す）
      sunGlow: '#f0e6d6',
      dropTint: '#54606e', // 冷たい影色
    },
    late: {
      skyTop: '#76849c', // 暮れてゆく鈍色
      skyMid: '#a6b0be',
      horizon: '#e0cdb6', // ほのかな残照
      sunGlow: '#eed8bc',
      dropTint: '#48505e',
    },
  },
  driftPeriod: 320,
  phenomena: {},

  // 冬の谷戸の気配＝渡る風（既存の素材を再利用。出典とライセンスは CREDITS.md）。せせらぎは凍てて控えめに。CREDITS.md記録済み。
  sounds: [
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.17, loop: true },
    { id: 'stream', label: 'せせらぎ', src: 'audio/shishigaya-morning-yato/stream.mp3', gain: 0.12, loop: true },
  ],
}
