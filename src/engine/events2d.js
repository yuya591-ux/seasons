// 2D（シェーダー）情景の静かな定期イベント。レンダラ非依存のDOMオーバーレイ層。
// 澄んだ夜・夕暮れの空に、ふと流れ星がすっと流れて消える（音＝きらめき）。
// 雨/雪の情景には既存の遠雷フラッシュ（onCue→renderer.triggerFlash）があるのでここでは扱わない。
// town3d は自分の現象系（evRain/evShootingStar 等）を持つため、シェーダー2D情景専用。

let styleInjected = false
function injectStyle() {
  if (styleInjected) return
  styleInjected = true
  const st = document.createElement('style')
  st.textContent = `
.evt2d{position:fixed;inset:0;pointer-events:none;z-index:6;overflow:hidden}
.evt2d__star{position:absolute;width:132px;height:2px;border-radius:2px;
  background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.9) 72%,#fff 100%);
  box-shadow:0 0 7px 1px rgba(255,255,255,.6);opacity:0;transform-origin:right center;
  will-change:transform,opacity}
@keyframes evt2dStar{0%{opacity:0;transform:translate(0,0) scaleX(.18)}
  12%{opacity:.95}68%{opacity:.85}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scaleX(1)}}
@media (prefers-reduced-motion: reduce){.evt2d{display:none}}
`
  document.head.appendChild(st)
}

// onStar: 流れ星が流れた瞬間に呼ぶ（音＝きらめき）。isLive: 今イベントを出してよいか（おやすみ/非表示で false）。
export function createEvents2d({ onStar, isLive, reduceMotion } = {}) {
  injectStyle()
  const layer = document.createElement('div')
  layer.className = 'evt2d'
  layer.setAttribute('aria-hidden', 'true')
  document.body.appendChild(layer)

  let starEnabled = false
  let starTimer = null
  const live = () => (isLive ? isLive() : true)

  function fireStar() {
    if (live()) {
      const el = document.createElement('div')
      el.className = 'evt2d__star'
      const sx = 28 + Math.random() * 48, sy = 5 + Math.random() * 26 // 空の上のほうから
      const len = 130 + Math.random() * 130, ang = 0.30 + Math.random() * 0.30 // 右下へ斜めに（下りる角度）
      el.style.left = sx + '%'; el.style.top = sy + '%'
      el.style.transform = `rotate(${(ang * 57.3 + 180).toFixed(1)}deg)` // 進む向きへ傾ける（尾は後ろへ流れる）
      el.style.setProperty('--dx', `${(-(Math.cos(ang) * len)).toFixed(1)}px`)
      el.style.setProperty('--dy', `${(Math.sin(ang) * len).toFixed(1)}px`)
      const dur = 0.9 + Math.random() * 0.55
      el.style.animation = `evt2dStar ${dur.toFixed(2)}s ease-in forwards`
      el.addEventListener('animationend', () => el.remove())
      layer.appendChild(el)
      if (onStar) onStar()
    }
    schedule()
  }

  function schedule() {
    clearTimeout(starTimer)
    if (!starEnabled) return
    starTimer = setTimeout(fireStar, (28 + Math.random() * 44) * 1000) // 28〜72秒おき（待つほど、ふと流れる）
  }

  function setScene(scene) {
    clearTimeout(starTimer); starTimer = null
    if (reduceMotion || !scene || scene.render === 'town3d') { starEnabled = false; return }
    const ax = scene.axes || {}
    const nightish = ax.time === 'night' || ax.time === 'dusk'
    const clearSky = !ax.weather || ax.weather === 'clear' // 流れ星は澄んだ空のときだけ（曇/雨/雪は出さない）
    starEnabled = nightish && clearSky
    schedule()
  }

  function destroy() { clearTimeout(starTimer); layer.remove() }

  // dev検証用: スケジュールに依らず即座に流れ星を一度流す（?dev=1 のとき main から window へ公開）
  function testStar() { const was = starEnabled; starEnabled = true; const tmr = starTimer; fireStar(); clearTimeout(starTimer); starTimer = tmr; starEnabled = was }

  return { setScene, destroy, testStar }
}
