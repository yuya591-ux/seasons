// 描き込みの段（軽やか・ふつう・こまやか）の中身を、端末の倍率と画面の大きさから決める表。
// 2D の情景（renderer.js）と町の3D（town3dViewer.js）が同じ表を読む（以前は上限の表が7か所に散らばり、
// 町の3Dは起動時と設定の変更時で2か所に同じ値を持っていた・S24）。段の名前（id）と並びは画面のまま変えない。
//
// 決め方（2026-10-12 便2・決めたこと）:
//  ・上限は「倍率」と「総画素数」の両方で持つ＝iPad 13型が iPhone の約4倍の画素を描かない（S23）
//  ・倍率の低い画面（PC・ノート＝倍率1〜1.25）の「こまやか」は、画面より細かく描いて縮める（最大2倍）＋影 4096（D1・U7）
//  ・倍率の低い画面の「ふつう」「こまやか」は、画面の素の細かさを下回らない（自動調整でも 1 未満に下げない・D2）
//  ・iPhone の「ふつう」は今のまま（町の3D 1.6倍・2D 1.75倍）＝重さの上限を変えない（K5）
//  ・飛んでいる間だけ天井を 0.75 倍に下げる（歩く時は下げない・D3）。iPhone のふつうで今の 1.2 と同じ

export const QUALITY_IDS = ['soft', 'standard', 'light']

const TABLE = {
  // 町の3D: cap＝倍率の上限・px＝総画素数の上限・min＝自動調整で下げられる下限・shadow＝静的影の解像度（焼くのは1回）
  '3d': {
    soft: { cap: 2.0, px: 8.3e6, min: 1.0, shadow: 4096, bloom: true },
    standard: { cap: 1.6, px: 2.4e6, min: 0.96, shadow: 2048, bloom: true },
    light: { cap: 1.2, px: 1.4e6, min: 0.8, shadow: 1024, bloom: false },
  },
  // 2D の情景（全画面の1枚のシェーダー）: 画素ごとの計算が重いので px を別に持つ。min は自動調整の倍率（renderScale）の下限
  '2d': {
    soft: { cap: 2.25, px: 8.3e6, min: 0.5 },
    standard: { cap: 1.75, px: 3.0e6, min: 0.5 },
    light: { cap: 1.4, px: 1.6e6, min: 0.5 },
  },
}
export const FLY_SCALE = 0.75 // 飛んでいる間の天井の倍率（景色が流れるので粗さが目立たない）

const LOW_DPR = 1.3 // これ以下の倍率は PC・ノートの画面とみなす（画面より細かく描くのは、ここだけ）

/** 段の id を表にある物へそろえる（保存済みの soft／standard／light はそのまま通る。知らない値は「ふつう」）。 */
export function normQuality(q) { return QUALITY_IDS.includes(q) ? q : 'standard' }

/**
 * その段・その画面での描く細かさ（倍率）の上限と下限を返す。
 * kind: '3d' | '2d'、dpr: 端末の倍率、cssW/cssH: 画面の大きさ（CSS の画素）
 */
export function qualityPlan(kind, q, { dpr = 1, cssW = 1, cssH = 1 } = {}) {
  q = normQuality(q)
  const t = TABLE[kind][q]
  const low = dpr <= LOW_DPR
  const css = Math.max(1, cssW * cssH)
  // 画面より細かく描くのは、倍率の低い画面の「こまやか」だけ。ほかは端末の倍率が上限
  let cap = low && q === 'soft' ? t.cap : Math.min(dpr, t.cap)
  cap = Math.min(cap, Math.sqrt(t.px / css)) // 総画素数の上限
  // 下限: 倍率の低い画面の「ふつう」「こまやか」は画面の素の細かさ（dpr）を下回らない。ほかは表の下限
  let floor = kind === '3d' && low && q !== 'light' ? Math.min(dpr, cap) : Math.min(t.min, cap)
  if (kind === '3d' && low && q !== 'light') cap = Math.max(cap, floor)
  const fly = Math.max(floor, Math.min(cap, cap * FLY_SCALE))
  return { q, cap: +cap.toFixed(3), floor: +floor.toFixed(3), fly: +fly.toFixed(3), shadow: t.shadow || null, bloom: t.bloom !== false }
}
