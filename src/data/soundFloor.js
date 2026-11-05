// 便24: 素材ごとの低音切りの下限（Hz）。情景のデータの hp より高い時はこちらを使う（どの情景で使っても効く）。
//   裕也さん「BGMにて、途中「ぶおーん」といったエンジン音のような音が頻繁に鳴って非常にストレスです」（2026-11-05）。
//   野外の録音には、風がマイクに当たる唸りや遠くの車の音が 120〜600Hz に入っていて、窓を閉じた時のこもり（900Hz より上を落とす）で
//   その帯だけが残り「ぶおーん」と聞こえた。測りは scripts/qa-hum.mjs（低い帯 120〜600Hz の盛り上がりを数える）。
//   ・木々のざわめき（leaves）: 40 秒前後ごとに 300〜600Hz の風の唸りが 2〜3 秒盛り上がる（葉のざわめきは 1kHz より上）
//   ・ヒグラシ: 鳴き声は 2〜3.5kHz。60〜450Hz に風の唸りの塊が何度も入る
//   ・雨音: 雨粒の音は 1kHz より上が芯。下の帯に低い唸りが短く入る
//   ・風: 低い唸りの盛り上がり（風の「ひゅー」は 500Hz より上）
//   波（waves）は寄せ返しそのものが低い音の満ち引きなので切らない（qa-hum.mjs も数えない）
export const SOUND_FLOOR = {
  'audio/kamo/leaves.mp3': 750,
  'audio/summer-rain-dusk/higurashi.mp3': 1100,
  'audio/summer-rain-dusk/rain.mp3': 560,
  'audio/winter-snow-night/wind.mp3': 500,
  'audio/spring-dusk-corner-room/frogs.mp3': 300,
}

// 窓を閉じた時のこもり（この Hz より上を落とす lowpass）。便23 までは 900Hz で、閉じた部屋では低い帯だけが残って雨音や風まで「ぼー」という唸りになった（便24）
export const WINDOW_CLOSED_LP = 1600

/** 素材 src と情景の hp から、使う低音切りの高さを決める（0 なら切らない）。 */
export function floorHp(src, hp) {
  return Math.max(hp > 0 ? hp : 0, SOUND_FLOOR[src] || 0)
}
