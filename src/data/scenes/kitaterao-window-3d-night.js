// 「北寺尾の窓辺、立体の街（夜）」。本物の3D（Three.js）の坂の街を、窓から見下ろす夜景。
// 暗い palette で town3dViewer が自動的に夜モード（月明かり・灯る窓・ネオン・車のライト・月と星）になる。

export default {
  id: 'kitaterao-window-3d-night',
  axes: { season: 'summer', weather: 'clear', time: 'night' },
  label: '北寺尾の窓辺、立体の街（夜）',
  desc: '本物の3Dの坂の街を窓から見下ろす夜景。灯る窓・ネオン・車のライトが闇に瞬く。',
  status: 'ready',
  render: 'town3d',

  palette: {
    early: {
      skyTop: '#0d1228', // 深い藍の夜空
      skyMid: '#1c2444',
      horizon: '#33283f', // 地平に滲む街灯りの紫
      sunGlow: '#ffd79a', // 窓・灯りの暖色
      dropTint: '#141d18',
    },
    late: {
      skyTop: '#090d20',
      skyMid: '#161d3a',
      horizon: '#2a2236',
      sunGlow: '#ffcf90',
      dropTint: '#101610',
    },
  },
  driftPeriod: 320,
  phenomena: {},

  // 夏の夜の街＝虫が鳴き交わす夜（コオロギ＋鈴虫）＋ごく淡い夜風。
  // 2種の虫は swell で独立にゆっくり満ち引きし、左右に振り分ける＝鳴き交わし・静かになる間が生まれ、
  // 「一種がずっと同じ音量で鳴り続ける」違和感を解消（自然な夜の移ろい）。鈴虫は CC BY-SA 3.0 の素材（CREDITS.md）。
  sounds: [
    { id: 'mushi', label: '虫の音', src: 'audio/autumn-dusk-corner-room/crickets.mp3', gain: 0.34, loop: true, swell: true, pan: -0.26 },
    { id: 'suzumushi', label: '鈴虫', src: 'audio/kitaterao-window-3d-night/suzumushi.mp3', gain: 0.26, loop: true, swell: true, pan: 0.3 },
    { id: 'wind', label: '夜風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.08, loop: true },
  ],
}
