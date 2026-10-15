// 雨の窓の「結露したガラス越しの景色」用に、窓の外の背景の画を、読み込みの時に1回だけぼかした画を作る（便11・便10 #2）。
// 毎こま12点を読んでぼかす形は、iPhone の「ふつう」の大きさで今の 1.57〜1.78倍の重さだった（便10）。背景の画は動かないので、
// 1回作ったぼけた画を毎こま1回読むだけにする（便10 の測りで 案2 1.04倍）。
// 作り方: 半分の大きさに縮め、横と縦の箱ぼかしを3回ずつ重ねる（ほぼガウスのぼけ）。半径2・3回で、元の画の画素でぼけの広がり
// （標準偏差）がおよそ5＝便10 の案の「画面の高さの 0.017 の円に散らした12点」と同じ広がり。端は端の色を伸ばして読む

function boxPass(src, dst, w, h, r, horizontal) {
  const n = 2 * r + 1
  const len = horizontal ? w : h, lines = horizontal ? h : w
  for (let L = 0; L < lines; L++) {
    for (let c = 0; c < 3; c++) {
      const at = (i) => { const k = Math.min(len - 1, Math.max(0, i)); return (horizontal ? (L * w + k) : (k * w + L)) * 3 + c }
      let s = 0
      for (let i = -r; i <= r; i++) s += src[at(i)]
      for (let i = 0; i < len; i++) {
        dst[at(i)] = s / n
        s += src[at(i + r + 1)] - src[at(i - r)]
      }
    }
  }
}

/** 画（読み込み済みの Image）を半分の大きさでぼかした canvas を返す。作れなければ null */
export function makeBlurredCanvas(img, radius = 2, passes = 3) {
  try {
    const w = Math.max(1, Math.round((img.naturalWidth || img.width) / 2))
    const h = Math.max(1, Math.round((img.naturalHeight || img.height) / 2))
    const cv = document.createElement('canvas')
    cv.width = w; cv.height = h
    const x = cv.getContext('2d', { willReadFrequently: true })
    if (!x) return null
    x.drawImage(img, 0, 0, w, h)
    const id = x.getImageData(0, 0, w, h)
    const d = id.data
    let a = new Float32Array(w * h * 3), b = new Float32Array(w * h * 3)
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { a[j] = d[i]; a[j + 1] = d[i + 1]; a[j + 2] = d[i + 2] }
    for (let p = 0; p < passes; p++) {
      boxPass(a, b, w, h, radius, true); [a, b] = [b, a]
      boxPass(a, b, w, h, radius, false); [a, b] = [b, a]
    }
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { d[i] = a[j]; d[i + 1] = a[j + 1]; d[i + 2] = a[j + 2]; d[i + 3] = 255 }
    x.putImageData(id, 0, 0)
    return cv
  } catch (e) {
    return null
  }
}
