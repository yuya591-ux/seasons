// 低く溜まる霧（地面に近い低い所ほど濃い霧の層）の器。町の3Dが読む（2026-10-13・便3 #2=2「低く溜まる霧＋流れる濃淡」）。
// 濃さは 時間帯（axes.time）× 天気（axes.weather）× 場所（town3dKind）の既定から決まり、情景のデータに mist: { … } を書けば上書きできる。
// 新しい情景は、何も書かなければ既定のまま。濃くしたい・薄くしたい情景だけ mist を書く（例: mist: { k: 1.4 } で濃さ1.4倍）。
//   base   霧が溜まる高さの目安（m）。これより低い所ほど濃い
//   scale  層の厚み（m）。高さがこれだけ上がるごとに濃さが約3分の1になる
//   density 濃さ（1mあたり）
//   amount いちばん濃い所の混ざり方（0..1）。濃くしすぎると街全体が白く沈む（便1 で直した「白っぽい影絵」に戻る）ので、薄めに保つ
//   flow   濃淡が流れる速さ（m/秒）。0 で止まる
//   tint   霧の色を白へ寄せる割合（0..1）。残りは空気の霞の色。夜は低くして、白い帯が暗い街に浮かないようにする

export const MIST_BASE = { base: -4, scale: 4, density: 0.013, amount: 0.82, flow: 0.9, tint: 0.55 }

// 時間帯ごとの濃さの倍率。朝・夕は濃く、昼は薄く
export const MIST_TIME = { predawn: 1.2, dawn: 1.25, morning: 1.2, noon: 0.7, dusk: 1.15, night: 0.95 }

// 天気ごとの濃さの倍率。雪は空気の霞がもう濃く、霧を足すと白い街が沈むので薄く。雨はやや濃く
export const MIST_WEATHER = { clear: 1, cloudy: 1.1, rain: 1.2, snow: 0.5 }

// 場所ごとの溜まる高さ。谷戸は谷底の棚田（-4〜0m）の上に溜まる（厚みを5m にすると谷底が白く沈みかけたので、街と同じ4m）
export const MIST_KIND = { town: {}, yato: { base: -3 } }

// 夜と夜明け前は、霧の色を霞（暗い色）へ寄せる
const DARK_TIMES = { night: 1, predawn: 1 }

/** 情景のデータから、町の3Dへ渡す霧の値を決める（決まった値を返すだけ・乱数は使わない）。 */
export function mistFor(scene) {
  const ax = (scene && scene.axes) || {}
  const kind = (scene && scene.town3dKind) || 'town'
  const m = { ...MIST_BASE, ...(MIST_KIND[kind] || {}) }
  m.density *= (MIST_TIME[ax.time] ?? 1) * (MIST_WEATHER[ax.weather] ?? 1)
  if (DARK_TIMES[ax.time]) m.tint = 0.2
  const o = (scene && scene.mist) || {}
  if (typeof o.k === 'number') m.density *= o.k
  for (const key of ['base', 'scale', 'density', 'amount', 'flow', 'tint']) if (typeof o[key] === 'number') m[key] = o[key]
  return m
}
