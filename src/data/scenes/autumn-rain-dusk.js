// 「秋の雨、夕暮れ」。窓ガラスを流れる雨と、紅葉ににじむ夕焼け。
// シェーダーの雨（屈折・曇り・きらめき）は土台のまま、奥の「絵」を Flux 生成画像で底上げ（二層構成）。
// 背景は写真主役ではなく“雨ガラス越しの水彩寄りの絵”＝summer-rain-dusk と同じ画調（超解像はかけない）。

export default {
  id: 'autumn-rain-dusk',
  axes: { season: 'autumn', weather: 'rain', time: 'dusk' },
  label: '秋の雨、夕暮れ',
  desc: '窓ガラスを流れる雨と、紅葉ににじむ夕焼け。雨音・虫の音・遠雷',
  status: 'ready',
  render: 'rainGlass',
  intensityLabel: '雨脚',

  // ── 窓の外の背景画像（任意の格上げ層）──
  // 開発時に scripts/gen-photo-hd.mjs で生成して public/bg/ に保存。本番はAPIを叩かない。
  bgPrompt:
    'watercolor and soft realism blend, nostalgic Japanese countryside town in autumn at dusk, glowing amber and crimson sunset sky, distant blurred rooftops and red-orange autumn trees along the bottom, soft hazy rainy atmosphere, melancholic calm, muted dusty autumn colors, painterly bokeh, no people, no text',
  bg: 'bg/autumn-rain-dusk.jpg', // 窓の外の風景（Flux生成・紅葉の里の夕暮れ）。雨粒がこの絵を屈折させる

  // 色パレット（#rrggbb）。秋の雨夕は赤茶を含む沈んだ暖色。早→暮れの2キーフレーム。
  palette: {
    early: {
      skyTop: '#36323a',  // 天頂・鼠がかった紫
      skyMid: '#5c4a48',  // 中空・灰みの赤茶
      horizon: '#a47452', // 地平・紅葉の茜茶
      sunGlow: '#cc9866', // 光芒・暖かい残照
      dropTint: '#d4c4b0', // 水滴のハイライト
    },
    late: {
      skyTop: '#262430',
      skyMid: '#443836',
      horizon: '#7a5440',
      sunGlow: '#9a7050',
      dropTint: '#b8a890',
    },
  },
  driftPeriod: 300,

  phenomena: {
    rain: { intensity: 0.6 },
  },

  // 音セット（既存の素材を再利用）。出典・ライセンスは CREDITS.md に記録済み。遠雷はランダム間隔で時々。
  sounds: [
    { id: 'rain', label: '雨音', src: 'audio/summer-rain-dusk/rain.mp3', gain: 0.85, loop: true },
    { id: 'crickets', label: '虫の音', src: 'audio/autumn-dusk-corner-room/crickets.mp3', gain: 0.4, loop: true },
    { id: 'thunder', label: '遠雷', src: 'audio/summer-rain-dusk/thunder.mp3', gain: 0.5, loop: false, interval: [22, 55], cue: 'thunder' },
  ],
}
