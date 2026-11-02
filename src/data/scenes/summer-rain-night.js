// 情景「夏の雨の夜」。窓ガラスを流れる雨の向こうに、藍に沈む夜の街と、にじむ暖色の灯り。
// 雨粒が遠い街あかりを屈折させてきらめく――奥の「絵」は Flux 生成画像、手前の雨はシェーダーの現象。
// 見本「夏の雨、夕暮れ」と同じ rainGlass を使い、背景画像（bg）だけ差し替えた“時間帯違い”の量産例。

export default {
  id: 'summer-rain-night',
  axes: { season: 'summer', weather: 'rain', time: 'night' },
  label: '夏の雨の夜、にじむ街あかり',
  desc: '窓を流れる雨の向こう、藍に沈む街に灯りがにじむ。雨音と渡る風、時々の遠雷',
  status: 'ready',
  render: 'rainGlass',
  intensityLabel: '雨脚',

  // 窓の外の背景（Flux生成・夜の街）。雨粒がこの灯りを屈折させる。本番は保存画像を表示するだけ。
  bgPrompt:
    'dreamy painterly rainy night over a quiet Japanese town, deep indigo and navy sky, distant blurred rooftops, many small warm glowing window lights and street lamps scattered through the misty distance, soft rain haze, watercolor and gentle realism, calm melancholic healing mood, muted tones, atmospheric bokeh, no people, no text',
  bg: 'bg/summer-rain-night.jpg',

  // 色パレット。夜は藍を基調に、地平の灯りだけ暖色。時間で更にじわりと更けていく。
  palette: {
    // 宵の口（まだ藍が残る）
    early: {
      skyTop: '#171c30',
      skyMid: '#222a42',
      horizon: '#3c3848', // 地平のほのかな灯り
      sunGlow: '#c89a6a', // 窓・街灯の暖色
      dropTint: '#262b3c',
    },
    // 更けた夜（沈んで暗く湿る）
    late: {
      skyTop: '#10131f',
      skyMid: '#191e2e',
      horizon: '#302a38',
      sunGlow: '#ad8158',
      dropTint: '#1c2030',
    },
  },
  driftPeriod: 320,

  phenomena: {
    rain: { intensity: 0.6 },
  },

  // 音セット。すべて既存の素材を再利用（出典とライセンスは CREDITS.md）。
  sounds: [
    { id: 'rain', label: '雨音', src: 'audio/summer-rain-dusk/rain.mp3', gain: 0.85, loop: true },
    { id: 'wind', label: '風', src: 'audio/winter-snow-night/wind.mp3', gain: 0.08, loop: true },
    { id: 'thunder', label: '遠雷', src: 'audio/summer-rain-dusk/thunder.mp3', gain: 0.45, loop: false, interval: [28, 66], cue: 'thunder' },
  ],
}
