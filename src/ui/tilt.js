// 端末の傾き（ジャイロ）で見回す。既定はオフ。iOS 13+ は許可が要る（ユーザー操作内で要求）。
// 有効化した瞬間の姿勢を基準にし、そこからの傾きを見回し量にする。

// 画面の向き（0/90/180/270）に合わせて、左右(gamma)と前後(beta)の軸を入れ替える。
// 横向きでは端末の左右の傾きが画面の前後になるので、向きを見ないと「右に傾けたら上を向く」ずれになる（S50）。
export function tiltAxes(gamma, beta, angle) {
  const a = ((Math.round(angle || 0) % 360) + 360) % 360
  if (a === 90) return [beta, -gamma]
  if (a === 270) return [-beta, gamma]
  if (a === 180) return [-gamma, -beta]
  return [gamma, beta]
}
const screenAngle = () => (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0))

export function createTilt({ onTilt, onDisable }) {
  let enabled = false
  let base = null

  function handle(e) {
    if (!enabled) return
    const [gx, gy] = tiltAxes(e.gamma || 0, e.beta || 0, screenAngle()) // 画面の左右・前後の傾き
    if (base === null) base = { gx, gy }
    // 基準姿勢からの傾きを -1..1 に。約25°で端。
    const nx = (gx - base.gx) / 25
    const ny = -(gy - base.gy) / 25
    onTilt(nx, ny)
  }
  window.addEventListener('deviceorientation', handle)
  // 画面を回したら基準を取り直す（回した瞬間の姿勢を正面にする）
  if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => { base = null })

  return {
    async enable() {
      const DOE = window.DeviceOrientationEvent
      if (DOE && typeof DOE.requestPermission === 'function') {
        try {
          const res = await DOE.requestPermission()
          if (res !== 'granted') return false
        } catch {
          return false
        }
      }
      base = null
      enabled = true
      return true
    },
    disable() {
      enabled = false
      base = null
      if (onDisable) onDisable()
    },
    isEnabled() { return enabled },
  }
}
