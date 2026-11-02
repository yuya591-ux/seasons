// 情景レジストリ。新しい情景の追加は「データファイルを作って、ここに1行 import で足す」だけ。
// 既存は一切触らない（非破壊・疎結合）。
//
// 【整理・2026-07】表に出ていた25枚を「場所ごと」の二階層ギャラリーに集約した（src/ui/ui.js）のに合わせ、
// 長らく public:false で誰にも見えていなかった死蔵の情景（旧・実写の窓×8／旧・高台の下町×3／夏の晴れ真昼／
// 旧・屋上×2／旧・朝の谷戸／実証デモ×3＝計18）をレジストリごと撤去した。公開情景(25枚)は不変。
// これらの render 種別は runtime の文字列判定なので、データを消しても分岐が呼ばれなくなるだけ（非破壊）。
// もし将来これらを復活させたいときは、git 履歴からファイルを戻し、この配列に import を1行足せばよい。

import summerRainDusk from './summer-rain-dusk.js'
import summerRainMorning from './summer-rain-morning.js'
import summerRainNight from './summer-rain-night.js'
import autumnRainDusk from './autumn-rain-dusk.js'
import summerMorningMountains from './summer-morning-mountains.js'
import summerDuskSeaside from './summer-dusk-seaside.js'
import autumnDuskCornerRoom from './autumn-dusk-corner-room.js'
import autumnRainNightCornerRoom from './autumn-rain-night-corner-room.js'
import summerMorningCornerRoom from './summer-morning-corner-room.js'
import springDuskCornerRoom from './spring-dusk-corner-room.js'
import springMorningCornerRoom from './spring-morning-corner-room.js'
import winterSnowDuskCornerRoom from './winter-snow-dusk-corner-room.js'
import kitateraoWindow3d from './kitaterao-window-3d.js'
import kitateraoWindow3dSunset from './kitaterao-window-3d-sunset.js'
import kitateraoWindow3dRain from './kitaterao-window-3d-rain.js'
import kitateraoWindow3dRainNight from './kitaterao-window-3d-rain-night.js'
import kitateraoWindow3dNight from './kitaterao-window-3d-night.js'
import kitateraoWindow3dSnow from './kitaterao-window-3d-snow.js'
import kitateraoWindow3dSnowNight from './kitaterao-window-3d-snow-night.js'
import kitateraoWindow3dSpring from './kitaterao-window-3d-spring.js'
import kitateraoWindow3dAutumn from './kitaterao-window-3d-autumn.js'
import shishigayaWindow3d from './shishigaya-window-3d.js'
import shishigayaWindow3dAutumn from './shishigaya-window-3d-autumn.js'
import shishigayaWindow3dSnow from './shishigaya-window-3d-snow.js'
import shishigayaWindow3dSpring from './shishigaya-window-3d-spring.js'

export const SCENES = [
  // 本物の3Dの坂の街（四季）＝アプリの主役。ギャラリーの先頭に並べて第一印象にする。
  kitateraoWindow3d,
  kitateraoWindow3dSunset,
  kitateraoWindow3dRain,
  kitateraoWindow3dRainNight,
  kitateraoWindow3dNight,
  kitateraoWindow3dSpring,
  kitateraoWindow3dAutumn,
  kitateraoWindow3dSnow,
  kitateraoWindow3dSnowNight,
  shishigayaWindow3d,
  shishigayaWindow3dSpring,
  shishigayaWindow3dAutumn,
  shishigayaWindow3dSnow,
  // 角部屋シリーズ（立体の街エンジンへ載せ替え済み）
  autumnDuskCornerRoom,
  autumnRainNightCornerRoom,
  summerMorningCornerRoom,
  springDuskCornerRoom,
  springMorningCornerRoom,
  winterSnowDuskCornerRoom,
  // 雨の窓（旗艦rainGlass）と、旅先の窓（海辺・山あい）
  summerRainDusk,
  summerRainMorning,
  summerRainNight,
  autumnRainDusk,
  summerMorningMountains,
  summerDuskSeaside,
]

/** 軸の組み合わせから情景を引く。未登録なら undefined。 */
export function findScene({ season, weather, time }) {
  return SCENES.find(
    (s) => s.axes.season === season && s.axes.weather === weather && s.axes.time === time,
  )
}

/** その軸の組み合わせが「実装済み（選べる）」か。 */
export function isReady(axes) {
  const s = findScene(axes)
  return !!s && s.status === 'ready'
}

/** 最初に表示する既定の情景。本アプリの核「角部屋から見回す」を最初の顔にする。 */
export const DEFAULT_SCENE =
  SCENES.find((s) => s.id === 'autumn-dusk-corner-room') ||
  SCENES.find((s) => s.status === 'ready') ||
  SCENES[0]

/** 今の月・時刻から、季節と時間帯を求める。 */
export function nowAxes(date = new Date()) {
  const m = date.getMonth() + 1 // 1..12
  const h = date.getHours()
  const season = m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'
  const time =
    h >= 5 && h < 10 ? 'morning' : h >= 10 && h < 16 ? 'noon' : h >= 16 && h < 19 ? 'dusk' : 'night'
  return { season, time }
}

/** 「いま」に最も合う公開情景を選ぶ。季節＋時間帯を重視し、核の角部屋を少し優先する。 */
export function pickNowScene(date = new Date()) {
  const { season, time } = nowAxes(date)
  const candidates = SCENES.filter((s) => s.status === 'ready' && s.public !== false)
  // スコア＝季節＋時間帯の一致(最大+4)を主軸に、第一印象を旗艦の窓へ寄せる（評価 全員一致）。
  const score = (s) => {
    let v = 0
    if (s.axes.season === season) v += 2
    if (s.axes.time === time) v += 2
    if (s.render === 'rainGlass') v += 3 // 旗艦の窓（雨ガラス）
    else if (s.render === 'town3d') v += 2 // 本物の3Dの街（その季節の立体の街・角部屋）
    return v
  }
  // 「いま」の季節も時間帯も合う情景たちは“日替わりで巡回”＝同じ軸に複数あっても日が変われば別の一枚に
  // 出会える（評価プロデューサー: 同一軸で先頭の一枚だけが出て他が死蔵だった問題の解消）。
  // スコア降順→id で安定整列し、年内通算日でローテート（同じ日は決定的に同じ・日が替われば次の候補へ）。
  const fit = candidates.filter((s) => s.axes.season === season && s.axes.time === time)
  if (fit.length) {
    fit.sort((a, b) => score(b) - score(a) || (a.id < b.id ? -1 : 1))
    const dayIdx = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000)
    return fit[dayIdx % fit.length]
  }
  // 季節も時間帯も合う公開情景が無い時間帯は、最も近い一枚（従来どおりの最高スコア）。
  let best = DEFAULT_SCENE
  let bestScore = -1
  for (const s of candidates) { const v = score(s); if (v > bestScore) { bestScore = v; best = s } }
  return best
}
