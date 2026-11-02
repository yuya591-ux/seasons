// 窓辺シリーズ「北寺尾の窓辺、立体の街」。フラグメントの平面画でなく、本物の3D（Three.js）で
// 低ポリ＋トゥーンの坂の街を組み、窓から見下ろす。建物・電柱（強い遠近）・木・雲・アドバルーンが
// 実体として立体配置され、スワイプで見回すと視差で奥行きが動く。平成初期の郷愁の街並み。

export default {
  id: 'kitaterao-window-3d',
  // 昼の青空(bg=town3d-day/skyMid=#c0dcf0)＝実体は「霞む昼」。time:'dusk'は誤記で、本物の夕暮れ版
  // kitaterao-window-3d-sunset と軸が衝突し片方が死蔵だった。noonへ正し、昼=この一枚／夕=sunsetに分離（評価プロデューサー）。
  axes: { season: 'summer', weather: 'clear', time: 'noon' },
  label: '北寺尾の窓辺、立体の街',
  desc: '本物の3Dで組んだ坂の街を、窓から見下ろす。電柱が遠近に伸び、雲が流れる立体の眺め。',
  status: 'ready',
  render: 'town3d', // Three.js ビューア（src/engine/town3dViewer.js）
  bg3d: 'bg/town3d-day.jpg', // 奥に敷く実写背景（Flux生成・霞の里山住宅地）＝遠景を写真級に

  palette: {
    early: {
      skyTop: '#86b6e6', // 澄んだ昼の青空（高め・明るい）
      skyMid: '#c0dcf0',
      horizon: '#eef0e0', // 淡い地平（白茶け）
      sunGlow: '#fff6e2',
      dropTint: '#3c5c32', // 夏草の緑
    },
    late: {
      skyTop: '#6e9cd2', // やや傾いた午後
      skyMid: '#b4d0e8',
      horizon: '#f6dcae', // 金色の午後
      sunGlow: '#ffe8c2',
      dropTint: '#36542e',
    },
  },
  driftPeriod: 300,
  phenomena: {},

  // 夏の夕暮れの街。日が暮れていくにつれ、夕のヒグラシが退き、宵の鈴虫が満ちる＝同じ情景の中で時間が動く
  // （眺めるが「過ごす」へ）。日の傾き(dayFade)で交代。立体の街だけ実際にドリフトする（既存の素材を再利用。出典とライセンスは CREDITS.md）。
  sounds: [
    { id: 'higurashi', label: 'ヒグラシ', src: 'audio/summer-rain-dusk/higurashi.mp3', gain: 0.4, loop: true, dayFade: 'out' },
    { id: 'suzumushi', label: '鈴虫', src: 'audio/kitaterao-window-3d-night/suzumushi.mp3', gain: 0.26, loop: true, swell: true, dayFade: 'in' },
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.07, loop: true },
  ],
}
