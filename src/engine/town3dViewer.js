// 本物の3Dで「窓から見下ろす坂の街」を描くビューア（Three.js・低ポリ＋トゥーン）。
// フラグメントの平面画でなく、実体のある建物・電柱・木・雲・アドバルーンを立体配置し、
// スワイプで見回す。窓辺シリーズの“立体的に覗き込む”手応えを本物の3Dで出す。
// 連打切替に耐えるよう世代トークンで mount をキャンセル可能にする。

let token = 0
let active = null // { renderer, scene, camera, raf, dispose, stage }
let flashV = 0 // 遠雷の稲光（0..1）。frameで減衰し、白いオーバーレイの不透明度に使う

// 遠雷の稲光を立体の街でも光らせる（cue:'thunder' から呼ぶ）。シェーダー情景は別途 renderer.triggerFlash。
export function triggerTown3dFlash(amt) { flashV = Math.max(flashV, amt || 0.6) }

const lerp = (a, b, t) => a + (b - a) * t

// ease-in-out（smoothstep）。0→1の線形進行を、出だしも止まりもやわらかい曲線へ変換する。
// 線形やexp追従(=ease-out)と違い、動き始めと止まり際の両方がそっと加減速する＝酔わない上質なカメラ運び。
const easeInOut = (p) => p * p * (3 - 2 * p)

// 線形進行 p を、目標へ毎フレーム一定速度(step)で近づける（overshoot無しでぴったり止まる）。
// 一定速度で進めた p に easeInOut をかけることで、開く時も戻る時も両端がやわらかい往復になる。
const approach = (p, target, step) => p + Math.sign(target - p) * Math.min(step, Math.abs(target - p))

// ── 窓辺カメラ演出の微調整パラメータ（この数値だけで動きの量・速さ・角度を後から調整できる） ──
// 一人称・カメラのみの移動。控えめな移動量/画角変化で3D酔いを避けつつ「窓から顔を出す」手応えを出す。
const CAM = {
  winOpenDur: 1.15, // 窓をあける所要時間(秒)。大きいほどゆっくり開く
  leanDur: 1.5,     // 身を乗り出す／もどる所要時間(秒)
  winFwd: 1.8,      // 窓あけでカメラが前へ進む量（控えめ＝視界がふっと開ける程度）
  winDown: 0.4,     // 窓あけでカメラが下がる量
  winFov: 3.5,      // 窓あけで画角が広がる量(度)
  leanFwd: 6.5,     // 乗り出しでカメラが前へ出る量（枠の手前で“引き気味”に顔を出す＝のめり込み過ぎず街を見渡す）
  leanDown: 0.9,    // 乗り出しでカメラが下がる量（落とし過ぎると窓の下・ベランダ手すりを貫通＝なるべく高い位置で手すりの上から乗り出す）
  leanFov: 7.0,     // 乗り出しで画角が広がる量(度)
  leanLook: 3.2,    // 乗り出しで視線が下を覗き込む量（手前の木立へ落ち込み過ぎない程度に抑制＝評価UX-H2）
  leanPitchUp: 1.10, // 乗り出し時に上を見上げられる範囲（空・ビル上層まで仰げる）。大きいほど上が見える
  leanPitchDn: 0.55, // 乗り出し時に下を見下ろせる範囲の拡張（ユーザー要望でさらに下＝足下の街まで覗ける）
  lookPitch: 18,    // 見上げ/見下ろしの効き（pitch→視線の縦移動量）。大きいほど少しのスワイプで大きく振れる
  fov0: 62,         // 基準画角(度)
  roomParallaxX: 1.2, // 室内視差(横): 見回すと頭がわずかに左右へ（覗き込む手応え）。3Dの室内壁を突き抜けないよう控えめに
  roomParallaxY: 0.8, // 室内視差(縦): 見上げ/見下ろしで頭が上下にわずかにずれる量
}

// ── 浮遊（空を飛ぶ）／散策（歩く）モードの調整パラメータ ──
// 白猫の“ぷにコン”式スティック（左=移動／右=見回し）で操る。離すと慣性で減速しホバリング。
// 視点の少し後ろ上から街を広く望む“浮遊カメラ”（アバター無し）。旋回でバンク・慣性・風で飛翔感を出す。
const FLY = {
  // 速度・慣性（鳥/グライダーの“重さ”）
  speed: 12.5,      // 飛行の最大速度(u/s)。御しやすさ優先で少し控えめに（全倒しで到達）
  walkSpeed: 5.5,   // 歩行の最大速度(u/s)
  walkAccel: 8,     // 歩行の加減速(1/s)。飛行の浮いた慣性(moveEase)を流用せず接地した手応えに＝即歩き出し・すっと止まる
  climbSpeed: 6.5,  // （旧）上昇/下降の速さ。スキームAでは未使用
  moveEase: 2.8,    // 速度の追従(1/s)。小さいほど重い加速／離すと惰性で滑空して停止
  // ── スキームA: オート巡航＋ドラッグ操舵（一本指） ──
  cruiseSpeed: 7.5, // 自動巡航の速さ(u/s)。ゆっくり前進
  cinemaSpeed: 5.0, // オートシネマ周回の速さ(u/s)。超低速で名所を巡る
  steerEase: 0.13,  // ドラッグで操った進路(向き)へ機首が向く滑らかさ
  steerYaw: 2.4,    // 横ドラッグ→旋回の効き（画面幅いっぱいのドラッグでこのrad）
  steerPitch: 2.2,  // 縦ドラッグ→上昇下降(機首上下)の効き
  // 画角
  fov: 72, walkFov: 78,   // 歩行の画角を広げる（横持ち主軸＝広い視野で街を望む。狭い一人称の窮屈さを断つ）
  fovSpeedGain: 7,  // 高速時に画角が広がる量(度)＝速度の高揚
  // 出入り・見回し
  enterDur: 1.7, pitchMax: 1.2, landDur: 1.4,
  lookEase: 0.18,   // 見回し（右ドラッグ）の追従
  // 引いた三人称“浮遊カメラ”（後方上から望む）
  camBack: 11.5, camUp: 3.6, camAhead: 9,     // 飛行: 後方/上/注視先（既定をやや引き気味＝街を広く望む。±ズームで前後可変）
  walkBack: 2.9, walkUp: 1.1, walkAhead: 7.2, // 歩行: 引いた三人称の「空気感」（飛行の気持ちよさに寄せる＝実機FB）。既定zoom1.56で実効back≈4.5/up≈1.4＝頭ひとつ上の肩越しから街を広く望む（見下ろし過ぎず接地感を残す）。ズーム−で一人称の親密さ、＋で広い眺めへ。壁際では自動で寄る(checkBlock)。アバター無し
  camLag: 0.12,     // 飛行カメラ位置の遅れ追従（わずかな揺らぎ＝空気の流れ）
  walkCamLag: 0.18, // 歩行カメラの追従（飛行(0.12)に寄せた空気感＝ゆるやかに遅れて追う浮遊の手触り。密着しすぎる一人称の硬さを脱す）
  // 旋回バンク（飛行の没入の要）
  bankMax: 0.32,    // 最大ロール(rad≈18°)。穏当に（酔い配慮）
  bankGain: 2.2,    // 旋回・横移動入力→バンク量
  bankEase: 0.07,   // バンクの追従（ゆっくり傾く）
  // 目線・スティック
  eye: 1.62,        // 立ったときの目線の高さ（地形+この高さ）
  jumpForce: 6.4,   // ジャンプの初速(u/s)。重力と合わせて小気味よい一段ジャンプに
  gravity: 19,      // 落下の重力(u/s^2)。jumpForce6.4/gravity19＝跳び上がり~1.08u・滞空~0.67s
  stickRadius: 62,  // スティックの最大振れ(px)。これで全速
  stickDead: 0.14,  // 不感帯（微小な震えを無視）
  turnRate: 1.7,    // （旧・白猫式）横へ倒すほど速く向き直る旋回速度(rad/s)
  turnEase: 0.16,   // （旧）旋回入力のスムージング
  // 歩行（カメラ基準ポイント＆ゴー）: 倒した“画面の向き”へキビキビ向き直り、カメラは進行方向へ緩く後ろから追従。
  walkFace: 10,     // 進行方向へ向き直る速さ(1/s)。大きいほど即座にその向きへ歩き出す＝御しやすい
  walkCamFollow: 0.9, // カメラが進む向きへ後ろから戻る速さ(1/s)。前進中のみ・前倒し成分の二乗で効く（横移動では0＝視界が振り回されない。実機FB「左スティックで視点が思いっきり変わって酔う」）
  walkLookSens: 2.6, // 右ドラッグでカメラを回す感度（画面幅いっぱいのドラッグでこのrad＝360°近く向ける）
  // 飛べる箱（街を包む範囲）。これを越えない＝手描きの街の縁・未生成の余白を見せない。ランドマーク追加に合わせ広げた。
  // xMax=東の海まで飛び出せる（左右非対称。西は-x、東は海上の島・大橋を越えるxMaxまで）。
  bound: { x: 790, xMax: 790, zMin: -810, zMax: 120, yMax: 132, yFloor: 4.5 }, // Phase0で時代の島を~640へ遠ざけた汀まで飛べる（東=江戸764/西=大正-752/北=戦国-740）。zMaxはhome南の拡張ぶん
  // 谷戸（棚田の谷）用の箱。左右の里山に分け入りすぎない狭めの幅・谷筋に沿う前後＝谷を流すように飛ぶ。
  yatoBound: { x: 22, zMin: -52, zMax: 24, yMax: 74, yFloor: 4.0 },
}

// 乗り出し量(0..1)に応じた見上げ/見下ろしの可動範囲。乗り出すほど上も下も大きく振れる。
// applyTown3dLook(スワイプ時)とframeループ(戻り時の追従)の両方で使い、範囲を一元管理する。
const pitchLimits = (lean) => ({ up: 1.15 + lean * (CAM.leanPitchUp - 0.65), dn: 0.95 + lean * (CAM.leanPitchDn - 0.5) }) // 部屋の中でも天井(照明)・床まで見回せる。乗り出すと従来どおり空/足下へ
const yawLimit = (lean) => 1.65 - lean * 0.35 // 見回しの横幅。部屋の中は±94°(側壁・家具が見える)。乗り出すと壁と窓枠に遮られ±74°(合計約150°)＝実FB「乗り出すと360°近く見えるのは不自然、壁があるので外側~180°のはず」

// トゥーンの段階を作る勾配テクスチャ。陰影がはっきり出るセル（暗部まで落とし、形が読める手描き調）。
// 浅い明るい段階だと拡散と同じ＝プラスチックに見えるため、影側をしっかり暗くし明確な帯にする。
function makeGradient(THREE) {
  // やわらかな水彩調の階調（低ポリ脱却＝曲面が丸く読める）。陰→陽を5段で、Linear補間でセルの
  // 硬い境界をほぐし、曲面（樹冠・地形・人・車）を丸く見せる。輪郭線＋紙目グレードが手描きの趣は保つ。
  const data = new Uint8Array([80, 122, 164, 204, 242]) // 影0.31 / 0.48 / 0.64 / 0.80 / 陽0.95
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat)
  tex.needsUpdate = true
  tex.magFilter = THREE.LinearFilter // 面の切り替わりをやわらげ曲面を丸く（プラスチックにしない範囲で）
  tex.minFilter = THREE.LinearFilter
  return tex
}

export function isTown3dActive() {
  return !!active
}

// 見回し（スワイプ）。nx,ny は累積の相対量。乗り出すと見回せる幅が広がる。
export function applyTown3dLook(dx, dy) {
  if (!active) return
  // 歩行の右ドラッグ＝カメラを回す（横は360°持続的に回せる＝振り向ける／縦は見上げ見下ろし）。飛行はapplyTown3dSteerを使う。
  if (active.flyTarget) {
    if (active.mode === 'walk') {
      active.walkCamYaw += dx * FLY.walkLookSens // カメラの向きを直接回す（クランプ/減衰なし＝後ろも向ける）
      active.flyPitchTarget = Math.max(-0.7, Math.min(0.95, active.flyPitchTarget + dy * 0.9)) // 上下の見回し（足元〜空）
    } else {
      active.flyPitchTarget = Math.max(-FLY.pitchMax, Math.min(FLY.pitchMax, active.flyPitchTarget + dy * 0.9))
      active.lookYawOffTarget = Math.max(-1.3, Math.min(1.3, active.lookYawOffTarget + dx * 1.6))
    }
    return
  }
  const l = active.lean || 0
  const yawMax = yawLimit(l)     // 部屋の中を左右に見渡せる。乗り出すと壁・窓枠に遮られて狭まる（旧: 乗り出すと広がる＝壁の遮蔽と逆で不自然だった）
  const lim = pitchLimits(l)     // 上（天井・照明）も下（床・街）も見られる
  // 目標値を動かし、frame loop でイージング追従（指を離しても余韻＝ヌルヌル）。感度UP。
  active.yawTarget = Math.max(-yawMax, Math.min(yawMax, active.yawTarget + dx * 2.4))
  active.pitchTarget = Math.max(-lim.dn, Math.min(lim.up, active.pitchTarget + dy * 1.2)) // 縦の感度を下げ、手前の木立へ視線が落ち込み過ぎないように（評価UX-H2）
}

// 飛行（スキームA）のドラッグ操舵: 進む向き(flyYaw)と機首の上下(flyPitch)を動かす。dx/dy は画面比の移動量
// （右ドラッグ=dx+ / 下ドラッグ=dy+）。横で旋回、上で上昇・下で下降。離しても巡航は続く。
export function applyTown3dSteer(dx, dy) {
  if (!active) return
  active.flyYawTarget += dx * FLY.steerYaw // 右ドラッグ＝右へ旋回（窓辺の見回しと同じ素直な横）
  // 縦は窓辺の見回しと統一（マリオ式）: 下ドラッグ＝機首上げ＝見上げて上昇／上ドラッグ＝見下ろして下降。
  active.flyPitchTarget = Math.max(-FLY.pitchMax, Math.min(FLY.pitchMax, active.flyPitchTarget + dy * FLY.steerPitch))
}

// とまる／すすむ（スキームA）。とまる中はその場でホバリング、すすむで自動巡航を再開。
export function setTown3dCruise(on) {
  if (active) active.cruise = !!on
}

// 窓をあける／しめる（ガラスが横にすべって外気が澄む）。
export function setTown3dWindowOpen(open) {
  if (active) active.winOpenTarget = open ? 1 : 0
}

// 身を乗り出す／もどる（枠を越えて前へ＝視界が広がる）。乗り出すには窓をあける。
export function setTown3dLean(lean) {
  if (!active) return
  active.leanTarget = lean ? 1 : 0
  if (lean) active.winOpenTarget = 1
}

// 空へ飛び立つ／窓へもどる（浮遊モード）。飛び立つ瞬間にいまの窓の視点・視線を引き継ぎ、
// 景色がワープせず地続きに浮かび上がる。frame loop が flyP を 0↔1 にイージングして滑らかに出入りする。
export function setTown3dFly(on) {
  if (!active || !active.flyEnabled) return
  if (on) {
    if (active.mode === 'window') {
      // 窓の景色から地続きに飛び立つ（いまの視点・視線を引き継ぐ）
      const cp = active.camera.position, wl = active.winLook
      active.flyPos.copy(cp)
      let dx = wl.x - cp.x, dy = wl.y - cp.y, dz = wl.z - cp.z
      const len = Math.hypot(dx, dy, dz) || 1
      dx /= len; dy /= len; dz /= len
      active.flyYaw = active.flyYawTarget = Math.atan2(dx, -dz)      // 0=奥(-z)を向く
      active.flyPitch = Math.asin(Math.max(-1, Math.min(1, dy))); active.flyPitchTarget = 0 // 飛び立ちは見下ろしから滑らかに水平へ。以後はドラッグで向けた角度を保持（固定）
      active.camReady = false // 引いたカメラ位置を次フレームでスナップ初期化
    } else if (active.mode === 'walk') {
      active.flyPitchTarget = 0.18 // 歩きから飛び立つ＝視線を少し上げてふわりと
    }
    active.vel.set(0, 0, 0); active.moveX = 0; active.moveY = 0; active.bankCur = 0; active.turnSmooth = 0
    active.onCloud = false // 雲上のくつろぎ場所から飛び立ったら以後は通常の空
    // 初めての飛び立ちだけ「とまる」(浮かんだまま)で始める＝初見がいきなり街へ突進せず、まず眺めてから動ける（UX監督A2）。以後は従来の自動巡航。
    let firstFly = false; try { firstFly = !localStorage.getItem('seasons_flew_once'); if (firstFly) localStorage.setItem('seasons_flew_once', '1') } catch (_) { /* localStorage不可でも従来動作 */ }
    active.cruise = !firstFly
    active.mode = 'fly'
    active.flyTarget = 1
    if (!active.flyHintDone) { active.flyHintDone = true; active.pendingHint = 'fly' } // 初めて空へ飛ぶ時だけ操舵ヒントをそっと出す
  } else {
    active.mode = 'window'
    active.flyTarget = 0
    active.moveX = 0; active.moveY = 0
    active.justReturned = true // 帰還の儀式「ただいま」: 窓辺に戻りきった所で鈴＋猫が顔を上げる（frameで発火）
  }
}

// いまのモードの操作ヒントをもう一度そっと出す（一過性で消えた案内を再表示＝初見が詰まらない・評価UX-U1）。
export function setTown3dHint() {
  if (!active) return
  if (active.mode === 'walk') active.pendingHint = 'walk'
  else if (active.mode === 'fly') active.pendingHint = 'fly'
}

// 飛び降りて着地して歩く／また飛び立つ（一人称散策）。land=true で現在地の真下へなめらかに下りる。
export function setTown3dLand(land) {
  if (!active || !active.flyEnabled) return
  if (land) {
    if (active.mode === 'window') return // 窓辺から直接は歩けない（空を経由）
    // 雲海の上で、回遊群島のいずれかの島が近いなら、地上でなく“雲上の浮島”へ降り立つ
    const cw = active.cloudWalk
    if (cw && active.flyPos.y > cw.minY) {
      let best = null, bestD = 1e9
      for (const n of cw.nodes) { const d = Math.hypot(active.flyPos.x - n.x, active.flyPos.z - n.z); if (d < bestD) { bestD = d; best = n } }
      if (best && bestD < 110) {
        const dx = active.flyPos.x - best.x, dz = active.flyPos.z - best.z, d = Math.hypot(dx, dz)
        if (d > best.r - 3) { const k = (best.r - 4) / Math.max(d, 0.001); active.flyPos.x = best.x + dx * k; active.flyPos.z = best.z + dz * k } // 島の縁の内側へ寄せる
        active.onCloud = true
        const ox = active.flyPos.x - best.x, oz = active.flyPos.z - best.z // 外（雲海の眺め）を向いて立つ
        active.flyYaw = active.flyYawTarget = (Math.abs(ox) + Math.abs(oz) > 1) ? Math.atan2(ox, -oz) : 0
        active.walkCamYaw = active.flyYaw // カメラも進む向きの後ろから始める
        active.flyPitchTarget = -0.02; active.vel.set(0, 0, 0); active.moveX = 0; active.moveY = 0; active.bankCur = 0; active.turnSmooth = 0; active.camReady = false
        active.landedFired = false; active.mode = 'walk'; active.flyTarget = 1; active.pendingHint = 'walk'
        return
      }
    }
    active.onCloud = false
    // いまの真下の安全な地点へ着地（建物/樹冠に埋もれないよう退避）し、街路の抜ける方を向く
    const [sx, sz] = active.resolveSpawn(active.flyPos.x, active.flyPos.z)
    active.flyPos.x = sx; active.flyPos.z = sz
    active.flyYaw = active.flyYawTarget = active.openYaw(sx, sz) // 壁や木を正面にせず、抜けのある方へ向き直る
    active.walkCamYaw = active.flyYaw // カメラも進む向きの後ろから始める（着地直後に背後の抜けを望む）
    active.flyPitchTarget = 0 // 立って街路を水平に見渡す（見下ろさない＝街の中にいる眼差し）
    active.vel.set(0, 0, 0); active.moveX = 0; active.moveY = 0; active.bankCur = 0; active.turnSmooth = 0; active.camReady = false
    active.landedFired = false // 接地した瞬間に砂ぼこり＋沈み込みを起こす
    active.mode = 'walk'
    active.flyTarget = 1
    active.pendingHint = 'walk' // 初見の操作ヒント（左で歩く/右で見まわす）をそっと出す
  } else {
    setTown3dFly(true) // 歩きから空へ（飛び立つ）
  }
}

// この情景が浮遊/散策できるか（立体の街エンジンのときだけ）。UIのボタン表示判定に使う。
export function isTown3dFlyable() {
  return !!(active && active.flyEnabled)
}

// 設定（明るさ・描き込み品質）を3Dの街にも効かせる（従来は設定が3Dに無反応だった）。
export function setTown3dSettings(s) {
  if (!active || !s) return
  if (s.brightness != null && active.setBrightness) active.setBrightness(s.brightness)
  if (s.quality && active.setQuality) active.setQuality(s.quality)
  if (s.timeStay != null && active.setStay) active.setStay(s.timeStay) // 「時間をとどめる」で日の傾きを凍結
}

// おやすみの暗転が終わったら描画を止める／触れて戻ったら再開する（発熱・電池配慮）。
// 2Dレンダラは renderer.pause() で止まるが、3Dの街には停止経路が無く、真っ暗な暗転の裏で16fps×約2100コールを朝まで描き続けていた（純損失）。
export function setTown3dPaused(on) {
  if (active) active.paused = !!on
}

export async function unmountTown3d() {
  token++
  const a = active
  active = null
  if (a) {
    cancelAnimationFrame(a.raf)
    try { a.dispose() } catch (e) { /* 無視 */ }
    if (a.stage && a.stage.parentNode) a.stage.parentNode.removeChild(a.stage)
  }
}

export async function mountTown3d(parent, opts = {}) {
  await unmountTown3d() // 既存を片付け（token をインクリメント）。この後で自分の世代を確定する。
  const my = ++token
  const THREE = await import('three')
  if (my !== token) return
  // 近景の建物の角を丸める面取り用（低ポリの箱の角を脱す）。近景の数棟だけに使い性能は据え置く。
  const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js')
  if (my !== token) return
  // 全建物の基礎（接地のコンクリ土台）を1メッシュに統合するためのジオメトリ結合ユーティリティ。
  const _bgu = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
  if (my !== token) return
  // 安全弁: mergeGeometries が欠落/例外でも null を返すラッパに包む。全呼び出し元が if(m) で分岐するので、
  // 一箇所の統合失敗で throw して街全体が組み上がらず黒画面になるのを防ぐ（評価エンジニア: 統合フォールバックの安全弁）。
  const BufferGeometryUtils = {
    mergeGeometries: (geos, useGroups) => {
      try { return typeof _bgu.mergeGeometries === 'function' ? _bgu.mergeGeometries(geos, useGroups) : null }
      catch (e) { return null }
    },
  }

  const stage = document.createElement('div')
  stage.className = 'town3d-stage'
  parent.appendChild(stage)

  const W = stage.clientWidth || window.innerWidth
  const H = stage.clientHeight || window.innerHeight
  // 描き込み品質（設定/自動品質）でtown3dも重さを調整＝低性能端末の発熱・カクつきを抑える（従来は品質設定を無視していた）。
  const QUAL = opts.quality || 'standard'
  const LIGHT = QUAL === 'light'
  // 解像度(DPR)の上限。方針=鮮明さ優先: 主力3Dの「額縁外(飛行/歩行)が窓辺より粗い」を解消するため、
  // 旧 standard 1.4 を 1.6 へ引き上げ素のシェーダ情景(1.75)へ寄せる。発熱はピクセル塗りの二乗で効くが、
  // 重い時は自動品質(curPR↓・下のadQ)が実測で天井から下げる安全網に任せる（先回りで眠くしない）。
  // ※起動時(ここ)と setQuality(設定変更時)で上限が食い違うと「設定を触ると急に鮮明化」する＝両者を同値に統一。
  const PR_CAP = LIGHT ? 1.2 : QUAL === 'soft' ? 2 : 1.6
  const PR_FLOOR = LIGHT ? 0.82 : 0.96 // 自動品質調整で下げられる解像度の下限（これ以上は下げない＝鮮やかさを保つ）。高DPR端末で「荒すぎる」のを防ぐため一段引き上げ
  const SHADOW_SIZE = LIGHT ? 1024 : 2048
  // アンビエント用途＝省電力GPUを選ばせ発熱/電池を抑える（perf監督C6）。眺める時間が長いので high-performance より low-power が適切。
  // antialias:false＝AAは常用のcomposer(MSAA付き中間RT＋FXAA)が担うため、デフォルトFBのMSAAは最終ブリット(全画面三角形)にしか効かず純粋な無駄（GPUメモリ帯域の浪費・three公式見解）。
  // composer読込失敗時のフォールバック(直描き)のみAA無しになるが、発生は例外時だけ＝許容（2026-07 発熱対策）。
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' })
  let curPR = Math.min(window.devicePixelRatio || 1, PR_CAP)
  let qCap = PR_CAP // 現在の画質上限（setQualityで変わる）。自動品質調整はこれを天井に戻す
  let curQual = QUAL // 現在の描き込み（setQualityで変わる）。'light'では灯りのブルームも切る＝解像度に加え後処理も軽くする
  let bloomWanted = false // この情景でブルームを焚きたいか（夜/はっきりした夕）。light品質ではこれが真でも切る
  let adQLow = 0, adQOk = 0 // 自動品質調整: 重いフレーム/快適フレームの連続カウント（ヒステリシス）
  let lastDDT = 0 // 直近の描画間隔（検証用）
  let lastJsMs = 0 // 毎フレームのJS処理時間ms（検証用・CPU負荷）
  let bcFrame = 0 // フレーム数（初回の影焼き後にhome建物の霧カリングを始める）
  let prFly = false // 上空で解像度をひと段下げているか（離陸/着地でのみ切替＝毎フレームのsetSizeを避ける）
  let lastStageW = 0, lastStageH = 0 // ステージ実寸の追跡（飛行で枠が変わる等の再レイアウトを毎フレーム検知してaspectを直す）
  let composer = null, fxaaPass = null, bloomPass = null // FXAA（輪郭をなめらかに）＋夕夜の灯りのブルーム。読み込み失敗時はnullで通常描画にフォールバック
  renderer.setPixelRatio(curPR)
  renderer.setSize(W, H)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // PCFSoftShadowMapは非推奨で実際は自動でPCFに落ちる→明示してThree.jsの警告を消す（静的影なので見た目は同一）
  // 影を「一度だけ焼く」静的影に（太陽は固定＝建物/木の影は不変）。毎フレームの影パス（数百の投影体の再ラスタライズ）を撤廃して発熱を大きく下げる。動く車/人の影は捨てる（小さく目立たない）。
  renderer.shadowMap.autoUpdate = false
  stage.appendChild(renderer.domElement)
  // WebGLコンテキスト喪失への備え（評価 技術-致命3）。preventDefault しないと二度と復帰できず黒画面が固定化する。
  // 立体の街は全構築物をmount時に生成するため、その場での再構築は非現実的→復帰時は同じ情景を「組み直す」(onContextRestore)。
  let contextLost = false
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true }, false)
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false
    if (opts.onContextRestore) { try { opts.onContextRestore() } catch (_) { /* 無視 */ } } // 親(main)が情景を組み直す＝GPU資源を新コンテキストで作り直す
    else { try { renderer.shadowMap.needsUpdate = true; applySize() } catch (_) { /* 無視 */ } } // フォールバック（最低限の描画継続）
  }, false)

  const scene = new THREE.Scene()
  const pal = opts.palette || {}
  const season = opts.season || 'summer' // 季節で地面・木の色を替える
  const weather = opts.weather || null    // 'snow' | 'petals' | 'leaves' | null（降るもの）
  const kind = opts.kind || 'town'        // 'town'（坂の街）| 'yato'（谷戸＝棚田と茅葺の屋敷）
  const bound = kind === 'yato' ? FLY.yatoBound : FLY.bound // 飛べる箱は情景ごと（谷戸は谷筋に沿う狭め）
  const onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : () => {} // 定期イベント発火を外へ伝える（音の結線）
  const onSpeed = typeof opts.onSpeed === 'function' ? opts.onSpeed : () => {} // 飛行速度(0..1)を外へ伝える（風音の膨らみ）
  const onFoot = typeof opts.onFoot === 'function' ? opts.onFoot : () => {} // 歩行で一歩ごとに伝える（足音）
  const onLand = typeof opts.onLand === 'function' ? opts.onLand : () => {} // 飛行/ジャンプから降り立つ瞬間（着地音）
  const landSurf = () => weather === 'snow' ? 'snow' : kind === 'yato' ? 'grass' : 'hard' // 着地音の素材（足音と同方針の粗い判定）
  const onBirdFlush = typeof opts.onBirdFlush === 'function' ? opts.onBirdFlush : () => {} // 鳥が驚いて飛び立つ（羽音）
  const onAltitude = typeof opts.onAltitude === 'function' ? opts.onAltitude : () => {} // 飛行高度(0..1)を外へ伝える（高空で環境音をしぼる）
  const onScene = typeof opts.onScene === 'function' ? opts.onScene : () => {} // 場面（部屋/窓/飛行/歩行・速度・高度・地形・時代の近さ）を外へ伝える（BGMの下地）
  const onSeaBird = typeof opts.onSeaBird === 'function' ? opts.onSeaBird : () => {} // 海の上で時々かもめが鳴く（海らしさ＋渡りの退屈しのぎ）
  const onAmbience = typeof opts.onAmbience === 'function' ? opts.onAmbience : () => {} // 場所に応じた水の音(海=波/川=せせらぎ)の近さ(0..1)を外へ伝える
  const onPurr = typeof opts.onPurr === 'function' ? opts.onPurr : () => {} // 窓辺の猫を撫でるとゴロゴロ鳴る（0..1）
  const onMeow = typeof opts.onMeow === 'function' ? opts.onMeow : () => {} // 窓辺の猫がタップ反応で鳴く（pitch, kind）
  const onFlockWing = typeof opts.onFlockWing === 'function' ? opts.onFlockWing : () => {} // 渡りの群れに近づいて飛ぶと羽音
  const onLocation = typeof opts.onLocation === 'function' ? opts.onLocation : () => {} // いまの居場所の名(現代の街/江戸の城下町/雲海 等)を外へ伝える＝飛行中に迷子にならない
  let lastLoc = '' // 直近に伝えた居場所（変化時だけ通知）
  const onDayPhase = typeof opts.onDayPhase === 'function' ? opts.onDayPhase : () => {} // 日の傾き(0..1)を外へ伝える＝音も時刻に連れ添う（夕方は外音がやわらぐ）
  let lastDayPhase = -1 // 直近に伝えた日の傾き（変化時だけ通知）
  const onChime = typeof opts.onChime === 'function' ? opts.onChime : () => {} // 静かな瞬間（雲上で休む/止空で佇む）にふと澄んだ鈴が満ちる
  const onEveningChime = typeof opts.onEveningChime === 'function' ? opts.onEveningChime : () => {} // 夕暮れの街に流れるチャイム（夕方の合図）
  let eveChimeT = -1 // 夕方チャイムの次回時刻（-1=未初期化。初回に夕夜の街かを判定して仕込む）
  const reduceMotion = !!opts.reduceMotion // 視差軽減: 突発・大きな動き（花火/気球/飛行機雲/流れ星等）の定期イベントを止める
  const skyTop = new THREE.Color(pal.skyTop || '#7fb0d8')
  const skyHorizon = new THREE.Color(pal.horizon || '#f2dcc0')
  const sunCol = new THREE.Color(pal.sunGlow || '#ffe6c2')
  // 空気遠近の霞（遠景を空色へやわらかく溶かす＝絵画的な奥行き。手前は鮮明）。雪は濃く冷たく。
  const isNight0 = (skyTop.r + skyTop.g + skyTop.b) < 0.7 // 夜判定（isNightは後で定義されるためfog色用にここで先に算出）
  const fogCol = weather === 'snow'
    ? skyHorizon.clone().lerp(new THREE.Color(isNight0 ? 0x333c49 : 0x8c98aa), isNight0 ? 0.5 : 0.62).getHex() // 雪霞は明るい灰だと白い雪の街が霧に溶けて白飛びする→一段濃い青灰へ寄せ、白い街並みが霞に対して読めるようにする（評価 美術-M5 改訂）。夜は暗い青墨へ
    : skyHorizon.clone().lerp(skyTop, 0.52).getHex() // 空色へ溶かす空気の層（俯瞰の霞）
  // 空気遠近の霞（調整可）: near=ここから霞み始める, far=ここで空に溶ける。手前へ寄せて遠景〜中景を
  // やわらかな大気に溶かし、「高台から街を眺める」水彩調の奥行きを出す（手前は鮮明に保つ）。
  // 雪は near を手前にし過ぎると街が真っ白に潰れる→少し奥へ（中景の階調を残す）。
  // 谷戸は谷筋が奥へ深く退く構図＝主役の棚田まで霞んで灰に沈むため、霞を一段奥へ送って手前〜中景の
  // 水鏡・青田の色を残す（遠い里山だけ空気に溶ける）。密集した街は従来どおり手前から霞ませて水彩の奥行きに。
  const FOG = kind === 'yato'
    ? { near: weather === 'snow' ? 54 : 48, far: weather === 'snow' ? 176 : 168 }
    : { near: weather === 'snow' ? 40 : 30, far: weather === 'snow' ? 146 : 132 } // 大気遠近を一段深め、中景から空気に溶け始める水彩の奥行きへ（手前は鮮明に保つ）
  scene.fog = new THREE.Fog(fogCol, FOG.near, FOG.far)

  // 空ドーム（上=空色, 下=地平の暖色のグラデ）。飛行中は uniform を暖色へ寄せて懐かしい黄昏の空にする。
  const skyUniTop = { value: skyTop.clone() }
  const skyUniBot = { value: skyHorizon.clone() }
  const skyTop0 = skyTop.clone(), skyHor0 = skyHorizon.clone() // 窓辺に戻った時に復元する基準
  let skyDome = null
  {
    // ドームをカメラ全軸に追従させる（毎フレ camera位置へ移動）＝拡大世界(拠点は原点から約500)の
    // どこへ飛んでも空が常に周囲を覆う。半径はカメラのfar(600)内に収め頂部がクリップされないようにする
    // （以前は半径400・原点中心で、戦国/大正へ飛ぶとカメラがドーム外/far外に出て空が無く「黒い虚空」になっていた）。
    const skyGeo = new THREE.SphereGeometry(560, 24, 16)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { top: skyUniTop, bot: skyUniBot },
      vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      // 3色グラデ＋ディザ。2色の直線ぼかしだと中空がのっぺりし8bitのバンディング(縞)が出る。
      // 地平=淡く暖、中空=いちばん青が濃い帯、天頂=やや締まる ＝本物の空の層。最後に微小ディザで縞を散らす。
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bot;
        void main(){
          float h = clamp(vP.y/560.0*1.7+0.2, 0.0, 1.0);
          vec3 base = mix(bot, top, 0.5);
          float lum = dot(base, vec3(0.299, 0.587, 0.114));
          vec3 mid = clamp(mix(vec3(lum), base, 1.18), 0.0, 1.0); // 中空の帯を少し彩度上げ＝青の伸び
          vec3 col = mix(bot, mid, smoothstep(0.0, 0.55, h));
          col = mix(col, top, smoothstep(0.45, 1.0, h));
          float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          col += (d - 0.5) / 255.0; // ディザ＝階調の縞を画素ノイズで散らす
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
    skyDome = new THREE.Mesh(skyGeo, skyMat); skyDome.frustumCulled = false; skyDome.renderOrder = -1; scene.add(skyDome)
  }

  // 奥の実写背景（任意・Flux生成の遠景）。近景の立体の奥に、写真級の遠望を円筒状に敷いて写真的な奥行きを出す。
  // 近景の建物・木が手前を覆い、霞(fog)が中景を溶かして、遠景の実写へ自然につながる二層構成。
  // 堅牢化: 低ポリ遠山(mtns)は常に作り、実写背景が「読めた時だけ」山を消す＝画像が無ければ山が残る安全フォールバック。
  // セル/アニメ調の3D街モードでは実写の写真遠景は画風が衝突し、手前の低ポリ街と「二重像」になり
  // 境界にz-fightingの点ノイズも出るため無効化（低ポリのセル遠山を遠景に使う）。実写の窓モード(photoWindow)とは別物。
  const USE_PHOTO_BACKDROP = false // ←再有効化する場合は true
  const mtns = []
  if (USE_PHOTO_BACKDROP && opts.bg3d) {
    const BASE = import.meta.env.BASE_URL || '/'
    new THREE.TextureLoader().load(BASE + opts.bg3d, (tex) => {
      if (my !== token) return
      tex.colorSpace = THREE.SRGBColorSpace
      const geo = new THREE.CylinderGeometry(232, 232, 156, 64, 1, true)
      const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        map: tex, side: THREE.BackSide, fog: false, depthWrite: true,
      }))
      back.position.y = 36 // 実写の里山が近景の低ポリ街の上にちょうど座る高さ
      back.rotation.y = Math.PI // 画像の中心を初期視線(-z)へ
      back.renderOrder = -1 // 近景より先に描く（遠景の最背面）
      scene.add(back)
      mtns.forEach((m) => scene.remove(m)) // 実写が読めたので低ポリ遠山を消す（実写が代替）
    })
  }

  const isNight = (skyTop.r + skyTop.g + skyTop.b) < 0.7 // 暗い palette = 夜
  // フィルミックなトーンマッピング（ACES）＝写真的なハイライトのころび・階調。実写風へ寄せる核。
  // Lambert 拡散シェーディングと合わせ、トゥーンの平面感を脱して実物に近い光の乗りにする。
  // CG的な締まりを出さない線形トーン（NoToneMapping）＝フィルミックな圧縮を排し、平坦な手描き/セル調に。
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = isNight ? 1.25 : 1.0
  // 別世界感の演出の基準値＋時代ごとの空気の色（江戸=金茶／戦国=青墨）。飛行時に近さで混ぜる。
  const baseFogCol = scene.fog.color.clone(), baseExposure = renderer.toneMappingExposure
  const EDO_FOGC = new THREE.Color(isNight ? 0x5a4c34 : 0xc6a064), SEN_FOGC = new THREE.Color(isNight ? 0x2a323e : 0x707075), TAISHO_FOGC = new THREE.Color(isNight ? 0x4a3640 : 0xc69270), TMP_FOGC = new THREE.Color() // 江戸=金茶/戦国=昼は中立の霧灰(青みを抜き水っぽさ解消)・夜は青墨/大正=暖かなセピア(淡すぎると昼が乳白ピンクに白む＝一段落とす・評価3)
  // 渡りの空気: 飛行中は霧を「冷たい白」から「懐かしい琥珀色の夕景」へ寄せる＝白いモヤの圧迫感を脱しエモい/ノスタルジックに（実機FB）
  const FLIGHT_WARM = new THREE.Color(isNight ? 0x3a3446 : 0xe0c49a)
  // 飛行中の空ドームの暖色（昼=黄昏の琥珀、夜=ぶどう色の宵）。霧の FLIGHT_WARM と揃えて世界全体を懐かしい色へ。
  const SKY_WARM_TOP = new THREE.Color(isNight ? 0x2c2740 : 0x9fb0c0)
  const SKY_WARM_BOT = new THREE.Color(isNight ? 0x3a2f3e : 0xf0cda0)
  // 天上界の光（雲海＝下界の街とは別世界）。情景の時刻に関係なく、雲海では常に幻想的な金桃の magic hour に寄せる＝街との明確な差別化。
  const CEL_FOG = new THREE.Color(isNight ? 0x4a3a55 : 0xf3c69e) // 雲海の空気＝夜は菫の宵/昼夕は金桃の暁
  const CEL_SKY_TOP = new THREE.Color(isNight ? 0x352f4c : 0xc3aec6) // 天頂＝淡い菫
  const CEL_SKY_BOT = new THREE.Color(isNight ? 0x4e3a50 : 0xf7cf9a) // 地平＝暖かな金桃
  // 大気オーバーレイ(CSS)を「その情景の光」に同調させる。固定の暖色グローでなく、各情景の
  // 太陽/地平の色で空がにじみ、隅は空色を深く沈めた冷色で翳る＝どの時間帯でも“一つの光に
  // 包まれた一枚の絵”へ局所色をまとめる（水彩の最高到達点が持つ色の調和を低ポリ3Dにも与える）。
  {
    const rgbStr = (c) => `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`
    const shadeCol = skyTop.clone().lerp(new THREE.Color(0x0e0b14), 0.62) // 隅の翳り＝空色を深く沈めた冷色の影
    stage.style.setProperty('--t3d-glow', rgbStr(sunCol))
    stage.style.setProperty('--t3d-shade', rgbStr(shadeCol))
    // 統一ウォッシュの濃さ＝昼は控えめに暖色で空気を一枚に、夜/雪は弱める（白飛び・寒色の濁りを避ける）
    stage.style.setProperty('--t3d-wash-a', isNight ? '0.10' : weather === 'snow' ? '0.07' : '0.20') // 雪は暖色ウォッシュを更に弱める＝高反射の白に暖色が乗って白飛び・乳白化するのを防ぐ（雪は寒色で澄ませる）
  }
  // 光（やわらかなトゥーン陰影。夜は月明かりへ）
  const sun = new THREE.DirectionalLight(isNight ? 0xa8bbe4 : sunCol.getHex(), isNight ? 0.62 : weather === 'snow' ? 0.86 : 1.02) // 方向光を主役に＝セルの明部/影部をはっきり（線形トーン用に白飛び防止／雪は高反射で白飛びしやすいので一段抑える）
  sun.position.set(isNight ? 24 : -30, 42, isNight ? -16 : 20)
  sun.castShadow = true
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE) // 影は一度だけ焼く静的影なので高精細化してもコスト増ゼロ。light端末は1024に落として焼き負荷とメモリを抑える
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 160
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60
  scene.add(sun)
  // 空からの回り込み光（影側を黒く沈めない＝くすみ防止）。地面側は暖色で泥にしない。
  // 回り込み光を抑えて平坦フィルを脱す（影側が残る＝セルの陰影と形が出る）。地面側は暖色。
  scene.add(new THREE.HemisphereLight(skyTop.clone().lerp(new THREE.Color(0xffffff), 0.4).getHex(), 0x9a8a6e, isNight ? 0.34 : 0.34))
  scene.add(new THREE.AmbientLight(0xfff2e0, isNight ? 0.12 : 0.10)) // 夜の近景が真っ黒に沈まない程度に底上げ
  // 時間の移ろい（日が傾く）：ぼーっと眺める十数分で「昼→黄金色の夕方」へそっと寄せる（評価エモ「世界が時間とともに移ろわない」が最大の情緒欠落）。
  // 夜は据え置き（夜は夜）。golden hour止まりで night までは行かない＝焼いた建物色/AOと破綻させず、陽が低くなる気配(空/霧/陽の暖かさと翳り)だけを足す。
  // 毎フレーム「原色→金色」をdd(0..1)で補間し直す＝累積しない。空の色base(skyTop0/skyHor0)・霧base(baseFogCol)・方向光を一括で動かすので窓辺も飛行も歩行も連動する。
  const drift = { t: 0, on: !isNight, stay: !!opts.timeStay }
  const SKY_TOP_O = skyTop0.clone(), SKY_HOR_O = skyHor0.clone(), FOG_O = baseFogCol.clone(), SUN_INT_O = sun.intensity, SUN_COL_O = sun.color.clone()
  const GOLD_TOP = skyTop0.clone().multiplyScalar(0.82), GOLD_HOR = skyHor0.clone().lerp(new THREE.Color(0xf2b878), 0.5), GOLD_FOG = baseFogCol.clone().lerp(new THREE.Color(0xe8c79a), 0.42), GOLD_SUN = SUN_COL_O.clone().lerp(new THREE.Color(0xffca96), 0.45)
  const DRIFT_SECS = 1080 // 約18分かけて夕方へ（ごくゆっくり＝眺めるうちにいつの間にか）
  let sunGlow = null // 昼/夕の空の太陽の光輪（彩雲リング付き）。カメラへ追従させて空に置く
  let sunDisk = null // 太陽の本体（くっきりした円盤＝空の主役。Bloomで芯が発光。光輪の中心に重ね、夕は橙金に大きく）
  let firstStar = null // 一番星: 日の傾き(dd)が深まると空にひとつだけ薄く灯る＝18分の移ろいの「暮れきった一拍」（評価エモ）
  const sunDir = new THREE.Vector3()
  let starMat = null // 夜の星（per-starできらめく）。frameで uT を進める
  // 夜は月と星
  if (isNight) {
    // ベタ白の円を脱す（評価 美術-M3）: わずかに暖色のクリーム＋柔らかなハロー（加算スプライト）で月らしく。
    const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 16), new THREE.MeshBasicMaterial({ color: 0xf6f1e2, fog: false }))
    moon.position.set(70, 90, -120); scene.add(moon)
    const mhc = document.createElement('canvas'); mhc.width = mhc.height = 64
    const mhx = mhc.getContext('2d'); const mhg = mhx.createRadialGradient(32, 32, 0, 32, 32, 32)
    mhg.addColorStop(0, 'rgba(244,242,232,0.62)'); mhg.addColorStop(0.4, 'rgba(214,224,240,0.26)'); mhg.addColorStop(1, 'rgba(214,224,240,0)')
    mhx.fillStyle = mhg; mhx.fillRect(0, 0, 64, 64)
    const cloudyNight = weather === 'rain' || weather === 'snow' // 雨/雪の夜は曇天＝月は雲ごしに淡く
    const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mhc), transparent: true, opacity: cloudyNight ? 0.3 : 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
    moonHalo.position.copy(moon.position); moonHalo.scale.set(cloudyNight ? 30 : 42, cloudyNight ? 30 : 42, 1); scene.add(moonHalo)
    // 満天の星（雲の上は光害が無い）。per-starできらめく（twinkle）＝生きた夜空。雨/雪の夜は曇天なので星を出さない。
    if (weather !== 'rain' && weather !== 'snow') {
    const spos = [], sph = [], ssz = [], tmp = new THREE.Vector3()
    const R0 = 360, addStar = (d, sz) => { spos.push(d.x * R0, d.y * R0 * 0.92 + 22, d.z * R0 - 18); sph.push(Math.random() * 6.2832); ssz.push(sz) }
    for (let i = 0; i < (LIGHT ? 420 : 720); i++) { const th = Math.random() * 6.2832, ph = Math.acos(Math.random()); addStar(tmp.set(Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)), 1.5 + Math.random() * Math.random() * 3.6) } // 一様（大小ばら）
    const mwNormal = new THREE.Vector3(0.42, 0.62, 0.66).normalize() // 天の川の帯の法線（傾いた大円）
    let placed = 0, guard = 0
    while (placed < (LIGHT ? 380 : 640) && guard < 60000) { guard++; const th = Math.random() * 6.2832, ph = Math.acos(Math.random()); tmp.set(Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph)); if (Math.abs(tmp.dot(mwNormal)) > 0.12) continue; addStar(tmp, 0.8 + Math.random() * 1.4); placed++ } // 帯の中だけ密に置く＝天の川
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3))
    starGeo.setAttribute('aph', new THREE.Float32BufferAttribute(sph, 1)); starGeo.setAttribute('asz', new THREE.Float32BufferAttribute(ssz, 1))
    starMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'attribute float aph; attribute float asz; varying float vph; void main(){ vph=aph; gl_PointSize=asz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform float uT; varying float vph; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; float tw=0.62+0.38*sin(uT*2.2+vph*7.0); gl_FragColor=vec4(0.94,0.96,1.0,(1.0-d*1.7)*tw); }',
    })
    scene.add(new THREE.Points(starGeo, starMat))
    } // ← 星（雨以外）
  } else {
    // 昼/夕＝空に柔らかな太陽の光輪＋淡い彩雲のリング（光輪の外に分光がにじむ実在の現象）。太陽の向きに置きカメラへ追従。
    const scv = document.createElement('canvas'); scv.width = scv.height = 128
    const sgx = scv.getContext('2d'), sgr = sgx.createRadialGradient(64, 64, 0, 64, 64, 64)
    sgr.addColorStop(0.00, 'rgba(255,250,236,0.95)'); sgr.addColorStop(0.09, 'rgba(255,243,214,0.6)') // 太陽の芯（暖白）
    sgr.addColorStop(0.20, 'rgba(255,228,182,0)'); sgr.addColorStop(0.42, 'rgba(255,210,160,0)')
    sgr.addColorStop(0.47, 'rgba(176,198,255,0.10)'); sgr.addColorStop(0.53, 'rgba(188,236,200,0.11)') // 彩雲リング（青→緑）
    sgr.addColorStop(0.59, 'rgba(255,226,168,0.12)'); sgr.addColorStop(0.65, 'rgba(255,184,172,0.10)') // 黄→赤
    sgr.addColorStop(0.76, 'rgba(255,184,172,0)'); sgx.fillStyle = sgr; sgx.fillRect(0, 0, 128, 128)
    sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(scv), transparent: true, opacity: weather === 'snow' ? 0.58 : 0.92, depthWrite: false, fog: false })) // 雪は窓ごしに白飛びしやすい＝光輪を弱め小さく（暖かいにじみは残す）
    { const sgS = weather === 'snow' ? 124 : 155; sunGlow.scale.set(sgS, sgS, 1); scene.add(sunGlow) }
    // 太陽の本体（円盤）は duskAmt 定義後（L667付近）でまとめて作る＝TDZ回避。下の「太陽の本体」ブロック参照。
    // 一番星のスプライト（昼ドリフトが深まると上空にひとつ灯る）。夜情景では既存の星空があるので作らない。
    if (!isNight) { const stc = document.createElement('canvas'); stc.width = stc.height = 32; const stx = stc.getContext('2d'); const stg = stx.createRadialGradient(16, 16, 0.4, 16, 16, 10); stg.addColorStop(0, 'rgba(255,255,250,1)'); stg.addColorStop(0.3, 'rgba(232,240,255,0.45)'); stg.addColorStop(1, 'rgba(232,240,255,0)'); stx.fillStyle = stg; stx.fillRect(0, 0, 32, 32)
      firstStar = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(stc), transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); firstStar.scale.set(7, 7, 1); firstStar.visible = false; scene.add(firstStar) }
    // 見える太陽は主視界(街=-z)の上・低めに置く（陽が街の向こうにある絵。夕焼け情景では茜の空に沈む）。影は様式化で微差を許容。
    sunDir.set(0.06, 0.26, -1).normalize()
  }

  // 地平のやわらかな光のにじみ（夕陽/街あかりのグロー）。重いポスト処理を使わず、加算スプライト1枚で
  // 大気のグローを出す（モバイル配慮）。空に光源のにじみがあるだけで“様式化された高品質”に近づく。
  {
    const gc = document.createElement('canvas'); gc.width = gc.height = 128
    const gx = gc.getContext('2d')
    const grd2 = gx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd2.addColorStop(0, 'rgba(255,255,255,0.85)')
    grd2.addColorStop(0.3, 'rgba(255,255,255,0.40)')
    grd2.addColorStop(1, 'rgba(255,255,255,0)')
    gx.fillStyle = grd2; gx.fillRect(0, 0, 128, 128)
    const glowTex = new THREE.CanvasTexture(gc)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: isNight ? new THREE.Color(0xffb273) : sunCol.clone().lerp(new THREE.Color(0xffffff), 0.35),
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: isNight ? 0.4 : (season === 'autumn' ? 0.42 : 0.55), // 秋は逆光グローを弱め上空の白飛びを抑える
    }))
    glow.position.set(0, 16, -190) // 遠い地平。手前の街に隠れて“街の向こうのにじみ”になる
    glow.scale.set(220, 120, 1)    // 横長＝地平の光の帯
    scene.add(glow)
  }

  // 軽いトゥーン（やわらかな水彩調のセル影）。プラスチックな拡散を脱し手描き調へ（3Dの街モード専用）。
  const grad = makeGradient(THREE)
  // 雪の積もり: 上を向いた面（屋根・地面・樹冠の上面）だけ白を被せる＝「雪が乗っている」表現。
  // 壁など縦面(normal.y≈0)は白くならない。weather==='snow' の全トゥーン材に共有適用。
  const SNOW = weather === 'snow'
  // 雪冠の色＝昼夕は陽を受けた明るい白／夜は夜空を映した暗い青灰（固定の明るい白だと遠景の雪屋根が
  // 暗い夜空に白く光りブルームで白飛びする＝雪夜だけ眩しい不具合の真因）。混ぜ量も夜は控えめに。
  const SNOW_RGB = isNight ? '0.42, 0.46, 0.58' : '0.88, 0.90, 0.95'
  const SNOW_MIX = isNight ? 0.56 : 0.7
  const snowify = (m) => {
    if (!SNOW) return m
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWNSnow;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vWNSnow = mat3(modelMatrix) * objectNormal;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWNSnow;')
        .replace('#include <dithering_fragment>', `  float snowK = smoothstep(0.34, 0.74, normalize(vWNSnow).y);\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${SNOW_RGB}), snowK * ${SNOW_MIX});\n#include <dithering_fragment>`)
    }
    m.customProgramCacheKey = () => isNight ? 'snowcap-n' : 'snowcap'
    return m
  }
  const toon = (hex) => snowify(new THREE.MeshToonMaterial({ color: hex, gradientMap: grad }))
  // 手描き調の輪郭線（反転ハル）。背面を黒で少し大きく描き、シルエットに線を出す。共有・軽量・霞で遠景は淡く。
  // OUTLINE=線の太さ（後から調整可）。fog:true で遠景の線も空気遠近で淡くなる。
  const OUTLINE = 1.022 // 線の太さ（背面ハルの拡大率。太いと箱の角で剥離して浮くため細めに。調整可）
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x16120b, side: THREE.BackSide, fog: true })
  function addOutline(mesh) {
    const o = new THREE.Mesh(mesh.geometry, outlineMat)
    o.position.copy(mesh.position); o.rotation.copy(mesh.rotation)
    o.scale.copy(mesh.scale).multiplyScalar(OUTLINE) // 中心から一様にふくらませて背面を出す＝シルエットの線
    o.castShadow = false; o.receiveShadow = false; o.renderOrder = -1
    return o
  }

  // 壁＋窓のテクスチャ（乗算マップ）。壁はベタ白を避け、コンクリの微細なムラ＋雨だれの経年汚れを描いて
  // 実写の建物の質感に近づける。窓は灰（通常）／暖色emissive（灯り）。64pxで滑らかに。
  function makeWinTex(lit, seed, opt = {}) {
    const litRatio = opt.litRatio ?? 0.45 // 灯る窓の割合（夜は増やして街を瞬かせる）
    const litCol = opt.litCol ?? '#ffd089' // 灯りの色
    // 128pxへ拡張＝歩行・低空で近づいても窓が崩れない。サッシ枠・十字桟・窓台を描き、ベタ硝子の板を脱す。
    const S = 128
    const c = document.createElement('canvas'); c.width = c.height = S
    const g = c.getContext('2d')
    let s = seed * 2654435761
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    if (lit) { g.fillStyle = '#000000'; g.fillRect(0, 0, S, S) }
    else {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S)
      // コンクリ/モルタルの微細なムラ（乗算なので暗いほど陰る＝のっぺり白を避ける）
      for (let i = 0; i < 360; i++) {
        const v = 206 + (rnd() * 49 | 0)
        g.fillStyle = `rgba(${v},${v},${v - 8},0.20)`
        g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 5, 1 + rnd() * 5)
      }
      // 縦の雨だれ筋（窓下から伸びる経年の汚れ＝建物のリアルさ）
      for (let k = 0; k < 13; k++) {
        const sx = rnd() * S
        g.fillStyle = `rgba(118,120,128,${0.05 + rnd() * 0.06})`
        g.fillRect(sx, rnd() * S * 0.4, 1.2 + rnd() * 1.4, S * (0.3 + rnd() * 0.5))
      }
      // 各階の見切り（横のスラブ境界＝コンクリの階の継ぎ目）。見上げ角(grazing)では縦の窓が潰れるが、
      // 横の目地は残って壁に構造が出る＝近接で平らに見えるのを脱す。テクスチャのみ＝描画コール/発熱の増なし。
      const fr = opt.rows ?? 4, pY = (S - 8) / fr // 窓の段ピッチに合わせ、階の継ぎ目（窓段の境）に目地を置く
      for (let yy = 1; yy < fr; yy++) {
        const ly = Math.round(6 + yy * pY)
        g.fillStyle = 'rgba(146,144,138,0.18)'; g.fillRect(0, ly - 1, S, 2)            // 目地の影
        g.fillStyle = 'rgba(250,249,246,0.28)'; g.fillRect(0, ly + 1, S, 1)            // すぐ下の見切りの照り（立体の継ぎ目）
      }
    }
    // 窓の格子（列数×段数は建物ごとに変える＝全建物が同じ窓割りで量産クローンに見えるのを脱す）。各窓にサッシ枠＋十字桟＋窓台。
    const cols = opt.cols ?? 3, rows = opt.rows ?? 4
    const pitchX = S / cols, pitchY = (S - 8) / rows, pw = Math.round(pitchX * 0.64), ph = Math.round(pitchY * 0.66)
    for (let yy = 0; yy < rows; yy++) for (let xx = 0; xx < cols; xx++) {
      const px = Math.round(xx * pitchX + (pitchX - pw) / 2), py = Math.round(6 + yy * pitchY + (pitchY - ph) / 2)
      if (lit) {
        const on = rnd() < litRatio
        g.fillStyle = on ? litCol : '#0a0a0a'
        g.fillRect(px, py, pw, ph)
        if (on) { // 灯った窓は十字桟が影で抜ける＝障子/サッシのシルエット
          g.fillStyle = 'rgba(40,28,12,0.55)'
          g.fillRect(px, py + ph * 0.5 - 0.7, pw, 1.4)
          g.fillRect(px + pw * 0.5 - 0.7, py, 1.4, ph)
        }
      } else {
        // サッシ枠（窓周りの一段明るい縁＝コンクリの窓台/見切り）
        g.fillStyle = 'rgba(238,236,232,0.9)'
        g.fillRect(px - 2, py - 2, pw + 4, ph + 4)
        // ガラス：上ほど空を映してやや明るく→下ほど室内で翳る縦グラデ＝硝子。窓ごとに寒暖を振る。
        const cool = rnd() < 0.5
        const grad = g.createLinearGradient(0, py, 0, py + ph)
        if (cool) { grad.addColorStop(0, '#90a0b2'); grad.addColorStop(1, '#586068') }
        else { grad.addColorStop(0, '#867f78'); grad.addColorStop(1, '#574f49') }
        g.fillStyle = grad
        g.fillRect(px, py, pw, ph)
        // 窓が壁の奥にへこんで付く内側の陰（上・左の縁＝庇/方立の落とす影）。奥行きを強めて平らな板を脱す。
        g.fillStyle = 'rgba(30,27,33,0.26)'; g.fillRect(px, py + 1.3, pw, 2.0); g.fillRect(px, py, 1.9, ph) // 上(ハイライトの下)・左の内側の陰
        // 十字桟（上下・左右に割れて見える立体の窓）
        g.fillStyle = 'rgba(214,214,220,0.5)'
        g.fillRect(px, py + ph * 0.5 - 0.6, pw, 1.2)
        g.fillRect(px + pw * 0.5 - 0.6, py, 1.2, ph)
        // 上辺の空映りのハイライト＋窓台の影（下）＝窓がへこんで付いて見える
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(px, py, pw, 1.4)
        g.fillStyle = 'rgba(54,52,58,0.42)'; g.fillRect(px - 2, py + ph + 1.2, pw + 4, 2.4) // 窓台の影を濃く＝へこみを強調
      }
    }
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.magFilter = THREE.LinearFilter // 微細な壁質感を滑らかに（Nearestのブロック感を脱す）
    t.anisotropy = LIGHT ? 1 : 4 // 斜め見の壁面でも窓がにじまない（歩行・低空で効く）
    return t
  }
  // 昼の窓を窓割り違いの4種に＝全建物が同一の窓模様で量産クローンに見えるのを脱す（建物ごとに位置ハッシュで選ぶ）
  const winGrids = [{ cols: 3, rows: 4 }, { cols: 2, rows: 3 }, { cols: 4, rows: 4 }, { cols: 3, rows: 3 }]
  const winMapBases = winGrids.map((gd, i) => makeWinTex(false, 1 + i * 22, gd))
  const winMapBase = winMapBases[0]
  // 夜は灯る窓を増やし（街が瞬く）、色をわずかに濃い暖色へ。夕は控えめ。灯る窓も窓割りを昼と揃える（昼夜でズレない）＝種類ごとに1枚。
  const winEmis = winGrids.map((gd, i) => makeWinTex(true, 3 + i * 13, { litRatio: isNight ? 0.7 : 0.46, litCol: isNight ? '#ffdca0' : '#ffd089', cols: gd.cols, rows: gd.rows }))
  // 灯り度（空の明るさで決める。明るい昼=窓は灯らない／夕暮れ=ほのか／夜=煌々と）
  const skyBright = (skyTop.r + skyTop.g + skyTop.b) / 3
  const duskAmt = Math.min(1, Math.max(0, (0.56 - skyBright) * 2.4))
  // 太陽の本体＝くっきりした円盤（空の主役）。加算で芯が明るく、Bloomで発光する。夕は橙金に大きく（地平に近い夕陽）。
  // 光輪 sunGlow は上で作成済み。ここで夕の暖色・拡大を足し、本体の円盤を中心に重ねる（duskAmt 定義後＝TDZ回避）。
  if (!isNight && sunGlow) {
    sunGlow.scale.multiplyScalar(1 + duskAmt * 0.32); sunGlow.material.color = new THREE.Color(0xffffff).lerp(new THREE.Color(0xffc070), duskAmt * 0.7) // 夕は光輪が大きく暖色に
    const dcv = document.createElement('canvas'); dcv.width = dcv.height = 64
    const ddx = dcv.getContext('2d'); const ddg = ddx.createRadialGradient(32, 32, 0, 32, 32, 32)
    ddg.addColorStop(0.0, 'rgba(255,253,245,1)'); ddg.addColorStop(0.55, 'rgba(255,248,230,0.97)'); ddg.addColorStop(0.74, 'rgba(255,233,193,0.82)'); ddg.addColorStop(0.93, 'rgba(255,214,150,0)'); ddx.fillStyle = ddg; ddx.fillRect(0, 0, 64, 64)
    const diskCol = new THREE.Color(0xfffaf0).lerp(new THREE.Color(0xffaa55), duskAmt) // 夕は橙金へ
    sunDisk = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(dcv), color: diskCol, transparent: true, opacity: weather === 'snow' ? 0.7 : 0.95, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))
    const dS = (weather === 'snow' ? 15 : 19) + duskAmt * 17; sunDisk.scale.set(dS, dS, 1); scene.add(sunDisk)
  }
  const rng = (seed) => { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 } }
  const R = rng(7)

  const town = new THREE.Group()
  scene.add(town)
  // 街専用の動くもの（谷戸では作らない）。描画ループから参照するので関数スコープで宣言。
  let adBalloons = []
  let cars = []
  let peeps = []
  let residents = [] // 作り込んだ住人（顔つき・アニメ調）。近くで見える要所に少数配置＝量産は階層分けで
  let standees = [] // 港町の少女＝一枚絵の立ち絵（常にこちらを向くビルボード）
  let ferris = null
  let carousel = null // 遊園地のメリーゴーラウンド（ゆっくり回る）
  let teacups = null // 遊園地のコーヒーカップ（回る）
  let steamPuffs = [] // 夏祭りの屋台の湯気（立ちのぼる）
  let koinobori = [] // 春の鯉のぼり（風になびく）
  let swanBoats = [] // 遊園地のスワンボート（池を漂う）
  let boats = [] // 海に浮かぶ小舟（ゆるく揺れる）
  let edoFx = null, senFx = null, taiFx = null, veilEl = null // 別世界の演出（時代の舞う粒子＋霞の帯の白いベール）
  let cityWalkers = [] // 城下を行き交う人（大通り/山道をゆっくり往復＝動く生気）
  const senMist = [] // 戦国の谷にたなびく霧の帯（ゆっくり漂う）
  const trams = [] // 大正の港町を走る路面電車（大通りを往復）
  let crossFlock = null, crossT = 99, crossNext = 5 // 渡りの海で時々カメラの近くを横切る鳥の群れ（退屈しのぎ）
  let islandFlocks = [] // 道中の小島で羽を休める鳥（飛行で近づくと一斉に舞い立つ）
  let critters = [] // 舞う蝶/蜻蛉（frameでふわふわ）＝街/季節ごとの生きもの
  let seaTex = null // 海面テクスチャ（さざ波をスクロールさせ動く水面に）
  let seaUniforms = null // 海面シェーダーの時間（うねり・きらめき）
  // 水面の太陽きらめき（向き・色）。波の法線が太陽を眼へ反射する所だけ細かく輝く「きらめきの道」に使う。静的＝frame負荷ゼロ。
  const glintDir = sun.position.clone().normalize()
  const glintCol = new THREE.Color(isNight ? 0x5a6e92 : (weather === 'snow' ? 0xe8eef6 : 0xfff0d2)).lerp(new THREE.Color(0xffc888), (isNight || weather === 'snow') ? 0 : duskAmt) // 昼=暖白／夕=金／夜=淡い月明かり
  // 川・池・水路のきらめき（淡い真水の水面のゆらぎ＝歩いて水辺で映える。海より細かく穏やか）。共有uniformをframeで進める。
  const freshUniforms = { uTime: { value: 0 }, uSky: { value: skyHorizon.clone() }, uSky2: { value: skyTop.clone() } } // uSky=地平の色/uSky2=天頂の色。映り込みを縦グラデにする(地平=暖/天頂=空)＝単色の板を脱す。frameで日の傾きに追従
  const freshWater = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = freshUniforms.uTime
      sh.uniforms.uSkyF = freshUniforms.uSky; sh.uniforms.uSky2F = freshUniforms.uSky2 // 共有＝frameで日の傾きに追従（静的な空グラデに動く反射＋時刻で水も染まる）
      sh.uniforms.uGlintDir = { value: glintDir }; sh.uniforms.uGlintCol = { value: glintCol } // 太陽きらめきの道（静的）
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPosF;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWPosF = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uSkyF;\nuniform vec3 uSky2F;\nuniform vec3 uGlintDir;\nuniform vec3 uGlintCol;\nvarying vec3 vWPosF;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float phf = uTime;
          float rp = sin(vWPosF.x * 0.85 + phf * 0.8) * 0.5 + sin(vWPosF.z * 0.7 - phf * 0.55) * 0.5 + 0.4 * sin((vWPosF.x + vWPosF.z) * 1.25 + phf * 1.15);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.82, smoothstep(0.55, 1.5, -rp) * 0.30); // 谷はほのかに沈む（沈め過ぎない）
          diffuseColor.rgb += vec3(1.0, 0.98, 0.9) * smoothstep(0.74, 1.4, rp) * 0.08; // 細かな陽のきらめき（控えめ＝下の鏡面きらめきと二重にしない）
          // 空の映り込み（フレネル）＝視線が浅い水面ほど空を映す。さざ波で映りの境を揺らす（ベタ塗りの板を脱す）。
          vec3 vDirF = normalize(cameraPosition - vWPosF);
          float grazeF = 1.0 - clamp(vDirF.y + rp * 0.05, 0.0, 1.0);
          float fresF = pow(grazeF, 4.0);
          vec3 reflF = mix(uSky2F, uSkyF, grazeF); // 視線が浅い(遠い水面)ほど地平の暖色、見下ろすほど天頂の空色＝縦グラデの映り込み
          diffuseColor.rgb = mix(diffuseColor.rgb, reflF, fresF * 0.34);
          // 太陽へ向かう鏡面のきらめき＝波の法線が太陽を眼へ反射する所だけ細かくちらつく「きらめきの道」（小さな高輝度点＝Bloomが映え白飛びしない）。
          float dRxF = 0.85 * cos(vWPosF.x * 0.85 + phf * 0.8) * 0.5 + 0.5 * cos((vWPosF.x + vWPosF.z) * 1.25 + phf * 1.15);
          float dRzF = 0.7 * cos(vWPosF.z * 0.7 - phf * 0.55) * 0.5 + 0.5 * cos((vWPosF.x + vWPosF.z) * 1.25 + phf * 1.15);
          vec3 nWF = normalize(vec3(-dRxF * 0.14, 1.0, -dRzF * 0.14));
          float specF = pow(max(dot(nWF, normalize(vDirF + uGlintDir)), 0.0), 80.0);
          float twF = 0.5 + 0.5 * sin(vWPosF.x * 5.3 + vWPosF.z * 4.7 + phf * 5.5);
          diffuseColor.rgb += uGlintCol * specF * twF;
        `)
    }
    mat.customProgramCacheKey = () => 'freshWater'
    return mat
  }
  let lightBeam = null // 灯台の光芒（夜に回る）
  let train = null // 線路を走る電車
  let train2 = null // もう一本の電車（色違い・半周ずらして走る）
  let crossing = null // 踏切（電車が近づくと遮断機が下り警報灯が点滅）
  let gulls = [] // 海鳥（湾の上を旋回する）
  const sparrows = [] // 電線にとまるスズメ（窓辺の微小イベント＝時々ぴょこっと跳ね、尾を振る＝静止した影でなく生きた小鳥）
  const clothSway = [] // 風にそよぐ布（干し物・布団・暖簾）＝焼き込みで静止した街に「呼吸」を足す。frameで竿の根元を軸にゆらす
  const tvGlow = [] // 夜の窓のテレビの青い明滅（在宅の気配＝誰かが茶の間でテレビを観ている）。frameで明るさをちらつかせる
  let crane = null // ガントリークレーンの動く部分（トロリー＋フック）
  let tug = null // 湾を行き来するタグボート
  let ferry = null // 湾を渡る連絡船
  let balloons = [] // 空を漂う熱気球
  const homeBldgs = [] // 現代homeの建物本体（frameで fog.farより遠い建物を描画カリング＝見た目不変で描画コール減）。house()が積み外側frameが読むのでmount冒頭=外側スコープで宣言
  let fishJumps = [] // 海面で時々跳ねる魚＋波紋
  let seasonFall = null // 季節の降りもの（春=花びら／秋=落ち葉。公園のあたりに舞う）
  let nearFall = null   // 歩く人に追従する近景の舞い散り（降り立つとどこでも桜吹雪/落ち葉の中へ）
  let crowdCenters = [] // 人だまりの中心（駅前/商店街/副都心/競技場/祭り等）＝近づくとざわめきが満ちる（音）
  const nightGlows = [] // 夜の灯り（篝火/松明/提灯/ガス灯）のグロー材＝frameでそっと揺らす（炎の息づき）
  const litFlicker = (mat, amp, sp) => { if (mat) nightGlows.push({ m: mat, base: mat.opacity, amp, sp, ph: R() * 6.28 }) } // 灯りのグローを揺らぎに登録（base=元の濃さ・amp=揺れ幅・sp=速さ）
  // 歩行時の当たり判定（円で近似）。建物の敷地＋木の幹を積む＝散策で建物を貫通せず、幹も避けて歩く。
  const colliders = []
  // 空間グリッド（8mセル）: 時代エリアの町家まで全戸登録すると数千件になるため、全件線形走査をやめ
  // 「その地点のセルに重なるコライダーだけ」を見る。登録数が変わったら次の判定時に自動で作り直す。
  const COL_CELL = 8
  let colGrid = null, colGridN = 0
  const rebuildColGrid = () => {
    colGrid = new Map(); colGridN = colliders.length
    for (const c of colliders) {
      const r = c.hw !== undefined ? Math.hypot(c.hw, c.hd) : c.r
      const x0 = Math.floor((c.x - r) / COL_CELL), x1 = Math.floor((c.x + r) / COL_CELL)
      const z0 = Math.floor((c.z - r) / COL_CELL), z1 = Math.floor((c.z + r) / COL_CELL)
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = ix * 100003 + iz; let arr = colGrid.get(k); if (!arr) { arr = []; colGrid.set(k, arr) } arr.push(c)
      }
    }
  }
  // 建物フットプリント(円/向き付き矩形)に入るか。住民配置・徘徊・歩行で共用するので関数本体スコープの早い位置で定義（配置時はcollidersが既に積まれている）。
  const blockedAt = (x, z) => {
    if (!colGrid || colGridN !== colliders.length) rebuildColGrid() // 未構築/登録数変化で作り直し（0件で呼ばれてもnull参照しない）
    const cell = colGrid.get(Math.floor(x / COL_CELL) * 100003 + Math.floor(z / COL_CELL))
    if (!cell) return false
    for (const c of cell) { const dx = x - c.x, dz = z - c.z
      if (c.hw !== undefined) { // 向き付き矩形（建物の敷地）＝局所座標へ回して矩形内か判定
        const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos
        if (lx > -c.hw && lx < c.hw && lz > -c.hd && lz < c.hd) return true
      } else if (dx * dx + dz * dz < c.r * c.r) return true // 円（木・池・塔など）
    }
    return false
  }
  // 建物の敷地（向き付き矩形コライダー）の中か＝「家に木が食い込む」等の配置違反の検査用（円=木・塔は含めない）。
  const rectAt = (x, z) => {
    if (!colGrid || colGridN !== colliders.length) rebuildColGrid()
    const cell = colGrid.get(Math.floor(x / COL_CELL) * 100003 + Math.floor(z / COL_CELL))
    if (!cell) return false
    for (const c of cell) { if (c.hw === undefined) continue
      const dx = x - c.x, dz = z - c.z, lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos
      if (lx > -c.hw && lx < c.hw && lz > -c.hd && lz < c.hd) return true }
    return false
  }
  let buriedTrees = 0, buriedEraTrees = 0; const buriedSamples = [] // 監査: 家に食い込むため取り下げた木の数と場所（dev検証用）
  // 着地で避ける場所（建物＋木の樹冠）。樹冠は大きめ＝木に埋もれて降りない・壁ぎわで降りない。
  const spawnAvoid = []
  // 鎮守の森の神社（飛んでいく目的地のランドマーク）。街の左手の一角を空けて建てる。建物/木の生成で共用するので関数本体スコープに。
  const SHRINE = { x: -32, z: -18, r: 11 }
  // 川（街の左手の谷筋をz方向に流れる）。地形を掘って河床を作る＝飛んで川沿いを渡れる水辺のランドマーク。
  const RIVER = { x: -52, halfW: 2.6, bankW: 5.5, depth: 4 }
  // 駅（街の右手の一角）。商店街は中央の道沿い。人の集まる目的地。
  const STATION = { x: 34, z: -44, r: 10 }
  // 線路（駅のホーム外側を通り、街を横切る一直線）。電車が走る。z は駅の線路に合わせる。
  const RAIL = { z: STATION.z - 7.4, x0: -6, x1: 60 }
  // 公園（街の中ほどの広場）。浅い池に空を映し、太鼓橋・桜・石灯籠・ベンチで憩う。飛んで降りる目的地。
  const PARK = { x: 16, z: -27, r: 12, pondR: 5.4, pondDepth: 2.4 }
  // 師岡町公園（実在・港北/鶴見境の丘の上の児童公園）。小高い丘＋周囲の樹林＋複合すべり台・ブランコ・砂場・ベンチ＋UFO型ジャングルジムの目印。
  const MOROOKA = { x: -20, z: -20, r: 15 }
  // 展望塔（谷を見はるかす街の塔）。高く昇って並ぶ目印・飛んで上がる目的地。谷の中ほどに立てる。
  const TOWER = { x: -7, z: -48, r: 6 }
  // 寺（五重塔のある仏閣）。谷の右奥の中腹に。観覧車と対をなす高い目印・飛んでいく目的地。
  const TEMPLE = { x: 40, z: -74, r: 14 }
  // 学校（校舎と校庭）。街の右手の一角。時計塔・トラック・桜並木＝町の馴染みの場所。
  const SCHOOL = { x: 54, z: -18, r: 13 }
  // やまゆりホーム（地域の福祉施設）。公園と学校の間の馴染みの場所。前庭の広場で夏は「サマフェス」（模擬店＋ステージ）。
  const YAMAYURI = { x: 36, z: -37, r: 14 }
  // ホームの目の前の広場＆街への入口（商店街ゲート手前）の広場。馴染みの広場。夏は日替わりでどちらか一方が盆踊りに。
  const PLAZA_HOME = { x: 0, z: 6, r: 6 }   // 窓のすぐ前の広場
  const PLAZA_GATE = { x: 0, z: -6, r: 6 }  // 入口が広くなった広場（ゲートの手前）
  // 夏祭りの会場（やぐら/提灯/屋台）。木立が会場に食い込まないよう、ここを空ける（公園と学校の校庭。やまゆり/広場は各々の用地で既に空く）。
  const FEST_ZONES = [{ x: PARK.x, z: PARK.z - 9, r: 11.5 }, { x: SCHOOL.x, z: SCHOOL.z + 4, r: 6.8 }]
  const inFestZone = (x, z) => FEST_ZONES.some((f) => Math.hypot(x - f.x, z - f.z) < f.r)
  // 遊園地（既存の観覧車を中心に）。メリーゴーラウンド・遊具・ゲート＝明るい賑わいの目的地。
  const FUN = { x: -26, z: -66, r: 13 }
  // 副都心（拡張した西の一角＝ガラスの高層ビル街）。旗艦homeの現代的な核＝街のスカイライン。飛んでいく目的地。
  const DOWNTOWN = { x: -118, z: -56, r: 27 }
  // 競技場（拡張した西奥の大きなスタジアム）。楕円のスタンド＋照明塔＝旗艦homeの大型施設。飛んでいく目的地。
  // padY=造成地の平らな盤の高さ（坂を均してスタンドが埋もれないように）。
  const STADIUM = { x: -150, z: -116, r: 22, padY: 4 }
  // 海（街の東の縁が湾へ下る）。x>coast で地形を海底へ下げ、shore より沖は水面。飛んで海まで行ける。
  // 海面は谷底より低く取る＝谷を水没させず、東の縁だけが汀へ落ちる（丘が海へ落ちる入江状の海岸線）。
  const SEA = { coast: 64, shore: 82, level: -10, floor: -13.5, westCoast: -205, westShore: -232 } // 東岸(x>64)＋西岸(x<-205)を海へ落とす。Phase1で西岸を外へ広げ旗艦homeを西へ拡大（大正は遠いので渡りは十分長い）
  // 臨海の港（埋立地の平らな工業の岸）。倉庫・煙突・クレーン・ガスタンク＝鶴見の臨海らしさ。
  const HARBOR = { x: 74, z: -64, r: 11, padY: SEA.level + 2 }
  // 湾に浮かぶ小島（大橋の対岸）。地形を海面上へ盛り上げる。橋でつながる目的地。
  const ISLAND = { x: 98, z: -40, r: 8 }
  // Phase0(2026-06-21): home を旗艦＝最大にするため、時代の島を home からさらに遠ざけ(~640)余地をつくる。海の渡りが長くなる＝旅情UP。共視界は据置で保てる（縁の霧で隠れる）。
  const EDO = { x: 640, z: -46, r: 124 } // 東の海の向こうの江戸の城下町。homeから遠ざけ拡大の余地
  const SENGOKU = { x: 140, z: -640, r: 54 } // 北の海の果ての戦国の山城（霧の谷あいの城下町）。homeから遠ざけ
  const TAISHO = { x: -640, z: -30, r: 112 } // 西の海の向こうの大正の港町。homeから遠ざけ
  const CINEMA_LM = [{ x: 0, z: 0 }, { x: EDO.x, z: EDO.z }, { x: SENGOKU.x, z: SENGOKU.z }, { x: TAISHO.x, z: TAISHO.z }] // オートシネマで周回する名所（現代の街/江戸/戦国/大正の中心）
  // ── 島の形を「円」から解放する道具。複数の形（細長い楕円・角丸の陸塊）を重ね（max=和集合）て不定形の島に＝まっすぐな海岸線・突き出た半島・切れ込む入り江。
  //    各関数は「内側距離」(正=内陸／0=汀／負=海、world単位)を返す。決定的（R()不使用）。heightAt・建物/道の除外・汀の配置で共用。
  const ellipseIn = (x, z, cx, cz, a, b, rot) => { const dx = x - cx, dz = z - cz, c = Math.cos(rot), s = Math.sin(rot); const u = (dx * c + dz * s) / a, v = (-dx * s + dz * c) / b; return (1 - Math.hypot(u, v)) * Math.min(a, b) } // 楕円（細長い陸塊）
  const rboxIn = (x, z, cx, cz, hw, hh, r, rot) => { const dx = x - cx, dz = z - cz, c = Math.cos(rot), s = Math.sin(rot); const u = Math.abs(dx * c + dz * s) - (hw - r), v = Math.abs(-dx * s + dz * c) - (hh - r); return r - (Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0)) } // 角丸の箱（まっすぐな海岸線を作る）
  const coastR = (landFn, cx, cz, a, maxR = 220) => { let lo = 4, hi = maxR; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (landFn(cx + Math.cos(a) * m, cz + Math.sin(a) * m) > 0) lo = m; else hi = m } return lo } // 中心から角度aへマーチし汀半径を返す（磯/縁の配置用）
  // 江戸の島を蛇行する小川の川筋。中心線からの横距離を返す（小さいほど川。堀の内/島の外は川なし）。heightAtの掘り込みと建物除外で共用。
  const edoStream = (x, z) => { const dx = x - EDO.x, dz = z - EDO.z, edd = Math.hypot(dx, dz); if (edd < 23 || edd > EDO.r - 6) return 999; let da = Math.atan2(dz, dx) - (1.15 + Math.sin(edd * 0.085) * 0.34); da = Math.atan2(Math.sin(da), Math.cos(da)); return Math.abs(da) * edd }
  // 江戸の島＝城・堀・寺社を載せる角丸の主部（東西の海岸が長くまっすぐ）＋はっきり突き出る半島3つ＋切れ込む入り江。円を脱し、home側(西)と反対の東へ伸ばして面積UP。内側距離を返す（決定的・R()不使用）。heightAtと町家/道/磯で共用。
  const edoLand = (x, z) => {
    let L = rboxIn(x, z, EDO.x + 6, EDO.z - 2, 70, 102, 18, -0.16)         // 主部＝角丸を浅くした細長い陸塊（東西の海岸が長くまっすぐ）
    L = Math.max(L, ellipseIn(x, z, EDO.x - 14, EDO.z - 96, 24, 40, 0.16))  // 北へ細く突き出す半島
    L = Math.max(L, ellipseIn(x, z, EDO.x + 94, EDO.z + 10, 46, 26, -0.32)) // 東へ長く突き出す半島（homeと反対側＝面積を稼ぐ）
    L = Math.max(L, ellipseIn(x, z, EDO.x - 66, EDO.z + 58, 32, 24, 0.5))   // 南西のなだらかな砂嘴
    L = Math.min(L, -ellipseIn(x, z, EDO.x + 50, EDO.z - 86, 26, 36, 0.15)) // 北東に深く切れ込む入り江（湾）
    L = Math.min(L, -ellipseIn(x, z, EDO.x + 30, EDO.z + 98, 28, 24, 0))    // 南に切れ込む入り江（川の河口）
    return L
  }
  // 大正の島の運河（港から内陸へまっすぐ引かれた水路）。中心線(z=tz+18)からの距離。
  const taishoCanal = (x, z) => { const dx = x - TAISHO.x; if (dx < -TAISHO.r + 6 || dx > 30) return 999; return Math.abs(z - (TAISHO.z + 17)) }
  // 大正の島＝角丸の細長い主部（長辺=まっすぐな海岸）＋はっきり突き出る半島3つ＋切れ込む入り江。円を脱し、home側(東)から離して南北へ伸ばし面積UP。内側距離を返す。
  const taishoLand = (x, z) => {
    let L = rboxIn(x, z, TAISHO.x - 8, TAISHO.z + 4, 56, 92, 24, 0.22)            // 主部＝角丸の細長い陸塊（長辺がまっすぐな海岸線）
    L = Math.max(L, ellipseIn(x, z, TAISHO.x + 20, TAISHO.z - 92, 28, 38, -0.1))  // 北へ突き出す半島
    L = Math.max(L, ellipseIn(x, z, TAISHO.x - 56, TAISHO.z + 26, 28, 42, 0.5))   // 西へ突き出す半島
    L = Math.max(L, ellipseIn(x, z, TAISHO.x + 44, TAISHO.z + 62, 34, 26, -0.35))  // 南東の岬
    L = Math.min(L, -ellipseIn(x, z, TAISHO.x + 60, TAISHO.z - 6, 28, 22, 0.2))   // 東に切れ込む入り江（湾）を彫る
    return L
  }
  // ── 島の汀の作り込み（homeの南海岸の渚を、島の閉じた海岸線へ流用）。エリア中心ローカルで焼き＋position=中心＝距離カリングに乗る。
  //    ①寄せ返しの白波リボン（海と同じuTimeのシェーダー＝フレーム追加負荷ゼロ）②乾いた砂の流木・寄り石・浜草。R()不使用＝配置シード不変。
  let _coastFoamMat = null
  const coastFoamMat = () => {
    if (_coastFoamMat) return _coastFoamMat
    const nc = document.createElement('canvas'); nc.width = nc.height = 64; const ncx = nc.getContext('2d') // 泡のレース（柔らかい白斑）
    ncx.fillStyle = '#000'; ncx.fillRect(0, 0, 64, 64)
    for (let q = 0; q < 260; q++) { ncx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; ncx.beginPath(); ncx.arc(Math.random() * 64, Math.random() * 64, 0.6 + Math.random() * 2.2, 0, 6.2832); ncx.fill() } // Math.random＝種付きR()を消費しない
    const ntex = new THREE.CanvasTexture(nc); ntex.wrapS = ntex.wrapT = THREE.RepeatWrapping
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, fog: true, side: THREE.DoubleSide }) // 両面＝リボンの法線向きに関係なく見える（片面だと裏面カリングで消える）
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = seaUniforms.uTime; sh.uniforms.uNoise = { value: ntex }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vUvF;\nvarying vec3 vWPf;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUvF = uv;\n  vWPf = (modelMatrix * vec4(transformed,1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform sampler2D uNoise;\nvarying vec2 vUvF;\nvarying vec3 vWPf;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
          float aw = vUvF.x;                                          // 0=陸(砂) .. 1=海
          float wf = 0.50 + 0.32 * sin(uTime * 0.42 - vWPf.z * 0.045 - vWPf.x * 0.02); // 寄せ返しの先端（汀沿いに位相がずれ斜めに寄せる）
          float band = smoothstep(0.16, 0.0, abs(aw - wf));           // 先端の白いレース
          float behind = smoothstep(wf - 0.02, 1.0, aw) * 0.5;        // 先端より海側の残り泡
          float lace = texture2D(uNoise, vUvF * vec2(2.5, 8.0) + vec2(uTime * 0.03, uTime * 0.07)).r;
          float foam = clamp(band + behind, 0.0, 1.0) * (0.55 + 0.45 * lace);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.98, 1.0), 0.9);
          gl_FragColor.a *= clamp(foam, 0.0, 1.0) * 0.92;
        `)
    }
    _coastFoamMat = m; return m
  }
  const addCoastDetail = (cx, cz, landFn) => {
    if (kind === 'yato') return
    // ① 寄せ返しの白波リボン（角度で島の海岸線を一周＝閉じた渚）
    const N = 140, fpos = [], fuv = []; let prev = null
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 6.2832, ca = Math.cos(a), sa = Math.sin(a), rc = coastR(landFn, cx, cz, a)
      const lx = ca * (rc - 3.4), lz = sa * (rc - 3.4), ly = heightAt(cx + lx, cz + lz) + 0.06 // 陸側(砂)は地面へ
      const sx = ca * (rc + 2.6), sz = sa * (rc + 2.6), sy = SEA.level + 0.05                  // 海側は海面へ
      const cur = { L: [lx, ly, lz], S: [sx, sy, sz], al: i / N }
      if (prev) { const pv = (v, ax, al) => { fpos.push(v[0], v[1], v[2]); fuv.push(ax, al) } // uv=(across:0陸..1海, along:0..1)
        pv(prev.L, 0, prev.al); pv(prev.S, 1, prev.al); pv(cur.S, 1, cur.al)
        pv(prev.L, 0, prev.al); pv(cur.S, 1, cur.al); pv(cur.L, 0, cur.al) }
      prev = cur
    }
    if (fpos.length) {
      const fg = new THREE.BufferGeometry()
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2)); fg.computeVertexNormals()
      const foam = new THREE.Mesh(fg, coastFoamMat()); foam.position.set(cx, 0, cz); foam.renderOrder = 2; foam.frustumCulled = false; town.add(foam)
    }
    // ② 乾いた砂の流木・寄り石・浜草（iで決定的に散らす＝R()を消費せず後段の配置を乱さない）
    const driftG = [], stoneG = [], grassG = [], dM = new THREE.Matrix4()
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * 6.2832, ca = Math.cos(a), sa = Math.sin(a), rc = coastR(landFn, cx, cz, a)
      const br = rc - 5.0 - (i % 3) * 1.4, bx = ca * br, bz = sa * br, by = heightAt(cx + bx, cz + bz) // 汀の少し上＝乾いた砂
      if (by < SEA.level + 0.2 || by > SEA.level + 5.0) continue // 砂の帯だけ（内陸/海は除外）
      const sel = i % 4
      if (sel === 0) { const len = 2.0 + (i % 4) * 0.5, dg = new THREE.BoxGeometry(len, 0.28, 0.34); dM.makeRotationY(a + 0.6 + i * 0.4).setPosition(bx, by + 0.12, bz); dg.applyMatrix4(dM); driftG.push(dg) } // 流木（寝かせた材）
      else if (sel === 1) { for (let s = 0; s < 3; s++) { const sg = new THREE.IcosahedronGeometry(0.26 + (s % 2) * 0.12, 0); sg.scale(1.3, 0.6, 1.1); dM.makeTranslation(bx + (s - 1) * 0.5, by + 0.1, bz + (s % 2 ? 0.4 : -0.3)); sg.applyMatrix4(dM); stoneG.push(sg) } } // 寄り石
      else { for (let s = 0; s < 4; s++) { const h = 0.42 + (s % 3) * 0.16, gg = new THREE.ConeGeometry(0.05, h, 4); dM.makeRotationZ((s - 1.5) * 0.16).setPosition(bx + (s - 1.5) * 0.16, by + h / 2, bz + (i % 2 ? 0.2 : -0.2)); gg.applyMatrix4(dM); grassG.push(gg) } } // 浜草（砂丘の草株）
    }
    const addMerged = (geos, mat, shadow) => { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const me = new THREE.Mesh(m, mat); me.castShadow = shadow; me.position.set(cx, 0, cz); town.add(me) } geos.forEach((g) => g.dispose()) } }
    addMerged(driftG, toon(season === 'winter' ? 0x8a8278 : 0x9a8a72), true)
    addMerged(stoneG, toon(0x9a958c), true)
    addMerged(grassG, toon(season === 'winter' ? 0xb8c0b4 : season === 'autumn' ? 0xa89a5a : 0x7a9455), false)
  }
  // 戦国＝「霧の谷あいの城下町」の地形（単一の急な円錐を脱し、川の谷＋両側のなだらかな尾根＋背後の山並みへ作り替え）。
  // 南(+z=現代/海の側)に河口が開き、川が谷を南北に蛇行。谷底に城下町、東の尾根の中腹の平場(bluff)に城。
  // 起伏は意図配置のガウス丘の和＝放射対称でなく自然。海(SEA.level)へ向け裾が落ちる。メッシュ/配置/heightAt が共有。
  const senR = 96 // 島を広げ町の周りに緑の陸地の余白を作る（町のすぐ外に海が見えて「水の上の町」に見えるのを防ぐ）
  const senValley = (dz) => Math.sin((dz + 10) * 0.02) * 9 + Math.sin(dz * 0.05) * 4 // 川筋の蛇行（中心xのオフセット）
  const senBluff = { dx: 28, dz: -8 } // 城の建つ東尾根の中腹の平場（中央でなく片側）
  // 尾根・峰のガウス丘 [dx, dz, 高さ, σx, σz]。等間隔を避け、東西の尾根＋背後(北)の高い山並み。
  const SEN_HILLS = [[38, -40, 15, 18, 28], [senBluff.dx, senBluff.dz, 13, 30, 36], [-44, -28, 15, 26, 32], [-28, 16, 9, 28, 28], [6, -66, 21, 40, 22], [50, -64, 16, 24, 20], [-46, -58, 15, 28, 22]]
  const senH = (x, z) => {
    const dx = x - SENGOKU.x, dz = z - SENGOKU.z
    const ex = dx / 82, ez = (dz - 4) / 108, env = ex * ex + ez * ez // 南北に長い島の輪郭（広げて町の外に緑の余白＝海を遠ざける）
    if (env > 1.3) return -999 // 島の外＝海（呼び元で無視）
    const coast = Math.pow(Math.max(0, 1 - env), 0.72) // 縁で海へ落ちる（平場ぎみ→汀で急落）
    let land = 3 // 谷底の低い土地（海面より少し上）
    for (const [hx, hz, hh, sgx, sgz] of SEN_HILLS) land += hh * Math.exp(-((dx - hx) ** 2 / (2 * sgx * sgx) + (dz - hz) ** 2 / (2 * sgz * sgz))) // 尾根と峰
    const cl = senValley(dz), vd = Math.abs(dx - cl) // 川筋からの横距離
    const valley = Math.max(0, 1 - vd / 26); land -= valley * valley * 9 // 谷底をなだらかに下げる（城下町が収まる）
    const channel = Math.max(0, 1 - vd / 5); land -= channel * channel * 3 // 川そのものはもう少し深く
    land += Math.sin(dz * 0.12 + dx * 0.05) * 1.2 * Math.min(1, vd / 20) // 斜面のゆるい起伏（尾根筋）
    return land * coast - 0.5
  }
  // 戦国の「汀(みぎわ)でない陸地か」判定＝海に接する浅い縁に物を置くと水に浮いて見えるのを根絶する。
  // senH が minH 以上で、かつ前後左右の近傍が海面近くまで落ちていない（＝汀に接していない内陸）こと。
  // 島の汀の地形は海面(-10)まで下がらず約-0.5〜+2の浅い棚＝相対閾値では効かないので「絶対高」で判定する。
  const senInland = (x, z, minH = 1.6) => {
    if (senH(x, z) < minH) return false
    for (const [ox, oz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [5, 5], [-5, -5], [5, -5], [-5, 5]]) if (senH(x + ox, z + oz) < 0.4) return false // 近傍が汀/海(低い棚/島の穴)＝縁なので置かない
    return true
  }
  // 全建物の基礎（接地のコンクリ土台）。house() が積み、最後に1メッシュへ統合＝接地感を出しつつ1ドローコール。
  const plinthGeos = []
  // 接地階の入口（玄関/店先の戸）。前面に暗い戸口を差し、まとめて1メッシュへ＝歩くと“住んでいる街”に。
  const doorGeos = []
  const doorFrameGeos = [] // 戸枠・玄関庇（暖色の木）。戸を引き締め、庇の影で入口が立体に＝目線の生活感
  const fixtureGeos = []   // 雨樋・メーター箱（灰の金属/樹脂）。建物正面の生活設備＝目線で「昭和の建物」の年季
  const potGeos = [], plantGeos = [], crateGeos = [] // 玄関脇の鉢植え（素焼き鉢＋緑）・積んだケース＝路地の生活の散らかり（エモい）。小さく低い＝俯瞰で棒にならない
  const eaveGeos = [] // 軒（のき）の張り出し（瓦屋根の家）。深い軒の陰影＝箱を脱す作り込み。統合で描画コール不変
  const bandGeos = [] // 中層ビルの中間スラブの見切り（各階の境の水平段差）＝のっぺりの高い箱に階層感。統合で描画コール不変

  // 谷のプロファイル: 手前(z>0)=自分の急な丘で高い → 谷底(z≈-30)で低い → 奥(z<-55)で向かいの丘・山が上がる。
  // 坂を7割登った高台から、谷へ下って広がる街を見下ろす立体感。
  // 棚田の段境界のうねり（x方向）。heightAt と畦の擁壁で共用＝段が等高線に沿って湾曲して整合する。
  const undX = (x) => Math.sin(x * 0.16) * 2.0 + Math.sin(x * 0.075 - 1.0) * 1.3
  const heightAt = (x, z) => {
    if (kind === 'yato') {
      // 谷戸の地形: 中央(|x|<13)が平らな谷底（棚田）、左右の里山が|x|で立ち上がり、奥で向かいの斜面が上がる。
      let base
      if (z > 6) base = (z - 6) * 0.6 + 1.5                       // 手前=自分の丘（カメラ側ほど高い）
      // 谷底＝手前から奥へ段々に下る棚田。段の境界を x でうねらせ「等高線に沿う有機的な段」へ（剛体の横縞を脱す＝評価指摘）。
      else if (z > -46) base = -1.6 - Math.floor(((4 - z) + undX(x)) / 5.6) * 0.42 + Math.sin(z * 0.08) * 0.1
      else base = -4.96 + (-46 - z) * 0.42                        // 奥の向かいの斜面が立ち上がる（段々の終端から連続）
      const sx = Math.max(0, Math.abs(x) - 13)
      const hill = sx * 0.9 + Math.pow(sx * 0.12, 1.6) * 7.0       // 左右の里山（谷の縁から立ち上がる）
      const bump = Math.sin(x * 0.08 + 1.3) * 0.7 + Math.cos(z * 0.07) * 0.6 + Math.sin((x + z) * 0.12) * 0.4
      return base + hill + bump
    }
    let vy
    if (z > 0) vy = z * 0.38 + 1.0                               // 手前の丘の肩（カメラ側ほど高い）
    else if (z > -52) vy = z * 0.17                              // 谷へ下る斜面（街が駆け下る）
    else vy = -52 * 0.17 + (-52 - z) * 0.16                       // 向かいの丘がゆるやかに立ち上がる（空を塞がない）
    const bump = Math.sin(x * 0.06 + 1.0) * 1.5 + Math.cos(z * 0.05) * 1.7 + Math.sin((x + z) * 0.13) * 0.9
    // 川の谷を掘る（x=RIVER.x を中心になだらかに沈める＝河床）。護岸が水際の段を作るので地面は緩やかでよい。
    const rd = Math.max(0, 1 - Math.abs(x - RIVER.x) / RIVER.bankW)
    const dip = Math.pow(rd, 1.5) * RIVER.depth
    // 公園の池を掘る（PARK中心の浅い円い窪み）。石組みの縁で水際の段を作る。
    const pd = Math.max(0, 1 - Math.hypot(x - PARK.x, z - PARK.z) / PARK.pondR)
    const pondDip = Math.pow(pd, 1.6) * PARK.pondDepth
    let h = vy + bump - dip - pondDip
    // 海への傾斜（東の縁 x>coast で海底へ向けて下げる＝丘が汀へ落ちる）。
    const sb = Math.min(1, Math.max(0, (x - SEA.coast) / (SEA.shore - SEA.coast)))
    if (sb > 0) h += (SEA.floor - h) * (sb * sb)
    // 西の海への傾斜（西の縁 x<westCoast で海底へ。西の海の向こうの大正の港町への渡り）
    const wb = Math.min(1, Math.max(0, (SEA.westCoast - x) / (SEA.westCoast - SEA.westShore)))
    if (wb > 0) h += (SEA.floor - h) * (wb * wb)
    // 臨海の港の埋立地＝平らな岸（海面より少し上の盤）。縁はなだらかに均す。
    const hd = Math.hypot(x - HARBOR.x, z - HARBOR.z)
    if (hd < HARBOR.r) h += (HARBOR.padY - h) * Math.min(1, (HARBOR.r - hd) / 4)
    // 競技場の造成地＝坂の斜面を平らに均した盤（これが無いとスタンドが斜面に埋もれる）。縁を5mで擦り付け。
    const std = Math.hypot(x - STADIUM.x, z - STADIUM.z)
    if (std < STADIUM.r + 5) h += (STADIUM.padY - h) * Math.min(1, (STADIUM.r + 5 - std) / 5)
    // 湾の小島＝海面から盛り上がるドーム（橋の対岸）。海より高い所だけ採用（島が海から覗く）。
    const isd = Math.hypot(x - ISLAND.x, z - ISLAND.z)
    if (isd < ISLAND.r) { const ia = Math.atan2(z - ISLAND.z, x - ISLAND.x); const wob = 1 + Math.sin(ia * 2 - 0.4) * 0.2 + Math.sin(ia * 3 + 1.2) * 0.14 + Math.sin(ia * 5 + 0.3) * 0.08; h = Math.max(h, 2.6 - Math.pow(isd / (ISLAND.r * wob), 2) * 15) } // 小さな岩島＝真円の饅頭を崩して岩島らしいゴツゴツした輪郭に（縁は海へ・R()不使用）
    // 海の向こうの島（城下町）。円のドームを脱し、複数の陸塊を重ねた不定形の島（まっすぐな海岸・半島・入り江）＋なだらかな渚で海へ。中央(edd<18)は天守の平場を保つ。
    const edd = Math.hypot(x - EDO.x, z - EDO.z)
    if (edd < 170) {
      const dxe = x - EDO.x, dze = z - EDO.z
      const d = edoLand(x, z)                                                                // 陸地マスクの内側距離（+=内陸／0=汀／−=海）
      const H0 = 5.5, shoreW = 24
      let base
      if (d <= 0) base = SEA.level + d * 0.6                                                 // 汀の外＝なだらかに海底へ
      else if (d < shoreW) { const u = d / shoreW; base = SEA.level + (H0 - SEA.level) * (u * u * (3 - 2 * u)) } // 渚＝S字でなだらかに
      else base = H0                                                                         // 城下の台地
      const flat = Math.min(1, Math.max(0, (edd - 18) / 30)), inl = Math.min(1, Math.max(0, (d - 4) / 22)) // 城の平場は平ら／渚も平ら＝丘はその間だけ
      base += (Math.sin(dxe * 0.058) * 2.7 + Math.cos(dze * 0.05) * 2.3 + Math.sin((x + z) * 0.038) * 1.6) * flat * inl // 丘の起伏
      const hdx = x - (EDO.x + 42), hdz = z - (EDO.z - 40); base += 12 * Math.exp(-(hdx * hdx + hdz * hdz) / 700) * inl // 寺の高台（鎮守の社）
      const h2x = x - (EDO.x - 48), h2z = z - (EDO.z - 20); base += 8.5 * Math.exp(-(h2x * h2x + h2z * h2z) / 760) * inl // 西の丘
      const h3x = x - (EDO.x + 12), h3z = z - (EDO.z + 66); base += 7 * Math.exp(-(h3x * h3x + h3z * h3z) / 680) * inl // 南の丘（町が駆け上がる）
      const sd = edoStream(x, z); base -= Math.min(1, Math.max(0, (7.0 - sd) / 3.0)) * 2.6 * inl // 蛇行する小川（内陸のみ掘る）
      h = Math.max(h, base)
    }
    // 北の海に立つ戦国の山城＝海から高く立ち上がる非対称の峰（senH が単一の真実の面）
    const sh = senH(x, z)
    if (sh > -990) h = Math.max(h, sh) // うねる稜線＝飛行/歩行の接地もメッシュと完全一致
    // 西の海に浮かぶ大正の港町。円を脱し、複数の陸塊を重ねた不定形の島（まっすぐな海岸・南北の半島・入り江）＋なだらかな渚で海へつなぐ。
    const tsd = Math.hypot(x - TAISHO.x, z - TAISHO.z)
    if (tsd < 165) {
      const dtx = x - TAISHO.x, dtz = z - TAISHO.z
      const d = taishoLand(x, z)                                                            // 陸地マスクの内側距離（+=内陸／0=汀／−=海）
      const H0 = 4.2, shoreW = 24                                                           // 内陸の台地高／渚の帯の幅
      let base
      if (d <= 0) base = SEA.level + d * 0.6                                                // 汀の外＝なだらかに海底へ（海底にクランプされる）
      else if (d < shoreW) { const u = d / shoreW; base = SEA.level + (H0 - SEA.level) * (u * u * (3 - 2 * u)) } // 渚＝S字でなだらかに立ち上がる（汀ぎわは浅い）
      else base = H0                                                                        // 内陸の台地
      const inl = Math.max(0, Math.min(1, (d - 4) / 22))                                    // 起伏・丘は内陸だけ（渚には出さない）。海側ほど0へ
      base += (Math.sin(dtx * 0.05) * 1.5 + Math.cos(dtz * 0.045) * 1.3 + Math.sin((dtx + dtz) * 0.03) * 1.0) * inl // 台地の起伏（平らな盤を脱す）
      base += (15 * Math.exp(-((dtx + 44) ** 2 / 560 + (dtz - 42) ** 2 / 620))              // 港を見下ろす洋館の丘
             + 12 * Math.exp(-((dtx - 52) ** 2 / 640 + (dtz + 44) ** 2 / 700))              // 異人館街の丘（東の高台）
             + 7 * Math.exp(-((dtx - 18) ** 2 / 900 + (dtz + 24) ** 2 / 1000))) * inl        // 商業地のゆるい高まり
      const quay = Math.max(0, (-46 - dtx) / 20); base -= quay * quay * 3.5                 // 西の波止場は低く平らに（海へ開く埠頭）
      const cd = taishoCanal(x, z); base -= Math.min(1, Math.max(0, (6.8 - cd) / 3.0)) * 2.8 * inl // 運河（内陸のみ平底に掘る）
      h = Math.max(h, base)
    }
    return h
  }
  // 地面・道のベタ塗りを避ける、水彩のような淡いムラのテクスチャ（手描きの手触り＝のっぺり感の解消）。
  // 2層構成: 低周波の大きな色斑（草地・土・陰りの“面”の多様さ＝絵画的な地面）＋高周波の細かなムラ（手触り）。
  function makeMottle(baseHex, n, lightSpread) {
    const S = 320
    const c = document.createElement('canvas'); c.width = c.height = S
    const x = c.getContext('2d')
    const base = new THREE.Color(baseHex)
    x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, S, S)
    // 大きな色斑（面の変化）: 色相・明度を広めに振り、草地に土や陰りの“地帯”を作る。タイル感を避けるため大半径。
    const big = Math.max(7, Math.round(n * 0.14))
    for (let i = 0; i < big; i++) {
      const col = base.clone().offsetHSL((R() - 0.5) * 0.05, (R() - 0.5) * 0.13, (R() - 0.5) * lightSpread * 1.9)
      x.globalAlpha = 0.06 + R() * 0.11
      x.fillStyle = '#' + col.getHexString()
      x.beginPath(); x.arc(R() * S, R() * S, 70 + R() * 110, 0, 6.283); x.fill()
    }
    // 細かなムラ（手描きの手触り）
    for (let i = 0; i < n; i++) {
      const col = base.clone().offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * 0.06, (R() - 0.5) * lightSpread)
      x.globalAlpha = 0.05 + R() * 0.10
      x.fillStyle = '#' + col.getHexString()
      x.beginPath(); x.arc(R() * S, R() * S, 15 + R() * 58, 0, 6.283); x.fill()
    }
    // 細かい粒子＝近接(主観視点)で読める手触り。遠目では反復が密でサブピクセル化し不変、近づくと土/舗装のザラつきが出る（実機FB: 近接で地面が平滑）。
    for (let i = 0; i < n * 7; i++) { const dk = R() < 0.5; x.globalAlpha = 0.07 + R() * 0.12; x.fillStyle = dk ? '#000000' : '#ffffff'; const sp = 1 + R() * 2.2; x.fillRect(R() * S, R() * S, sp, sp) }
    // ごく短いかすれ筋（ひび/轍の気配）をまばらに＝のっぺりした面に方向と用いられた跡
    for (let i = 0; i < Math.round(n * 0.4); i++) { x.globalAlpha = 0.04 + R() * 0.05; x.strokeStyle = '#000000'; x.lineWidth = 0.6 + R() * 0.6; const sx2 = R() * S, sy2 = R() * S, an = R() * 6.283, ln = 6 + R() * 22; x.beginPath(); x.moveTo(sx2, sy2); x.lineTo(sx2 + Math.cos(an) * ln, sy2 + Math.sin(an) * ln); x.stroke() }
    x.globalAlpha = 1
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 4
    return t
  }
  const mottleMat = (baseHex, n, spread, rep) => {
    const m = new THREE.MeshToonMaterial({ color: 0xffffff, map: makeMottle(baseHex, n, spread), gradientMap: grad })
    m.map.repeat.set(rep[0], rep[1])
    return snowify(m)
  }
  // 地面メッシュに頂点色で大スケールの土/草のムラ＋傾斜で土が覗くを焼く＝のっぺりを脱す（homeと同手法を各時代の地形へ）。
  // geo は heightAt 適用済み＋computeVertexNormals 済みのこと。ox/oz はメッシュのワールド原点。位置ノイズで主R()非消費。
  const bakeGroundVColors = (geo, ox, oz, cGrass, cDry, cEarth, grassBias = 0.66) => {
    const pos = geo.attributes.position, nrm = geo.attributes.normal, col = [], tc = new THREE.Color()
    const cG = new THREE.Color(cGrass), cD = new THREE.Color(cDry), cE = new THREE.Color(cEarth)
    for (let i = 0; i < pos.count; i++) {
      const x = ox + pos.getX(i), z = oz + pos.getZ(i), ny = nrm ? nrm.getY(i) : 1
      const slope = Math.max(0, Math.min(1, (1 - ny) * 3.0))
      const zone = 0.5 + 0.5 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.037 - 0.4) + 0.16 * Math.sin(x * 0.11 - z * 0.09)
      const dry = Math.max(0, Math.min(1, zone))
      tc.copy(cG).lerp(cD, dry * grassBias); tc.lerp(cE, slope * 0.82)
      const v = 0.95 + 0.1 * Math.sin(x * 0.7 + z * 0.55)
      col.push(tc.r * v, tc.g * v, tc.b * v)
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  }
  // 汀の砂浜: bakeGroundVColors の後段で、海面近くの低い頂点だけ砂色へ寄せる（水際ほど強い）＝草の斜面が直に青へ落ちるのを脱し「海へ自然につながる渚」に。
  // baseY=メッシュのworld-y基準（頂点のworld高= baseY + local-y）。R()不使用・描画コール不変・共有関数は無改変。
  const beachTint = (geo, baseY, sand = 0xd8c9a2) => {
    const pos = geo.attributes.position, col = geo.attributes.color; if (!col) return
    const cs = new THREE.Color(sand), tc = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const wy = baseY + pos.getY(i)                                   // 頂点の海抜
      const t = Math.max(0, Math.min(1, (SEA.level + 6 - wy) / 6))     // 汀(-10)〜約-4の帯で1→0（渚を広めに）
      if (t <= 0) continue
      tc.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(cs, t * 0.9) // 水際ほど砂へ（線形＝帯全体でしっかり読める）
      col.setXYZ(i, tc.r, tc.g, tc.b)
    }
    col.needsUpdate = true
  }
  // ── 時代の建物の正面テクスチャ（格子窓/連子窓/洋風窓）＝近づいても「窓のある建物」に。最初の街の質感へ統一する。 ──
  const makeFacade = (kind, baseHex) => {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), base = new THREE.Color(baseHex)
    g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, S, S)
    for (let i = 0; i < 110; i++) { const v = base.clone().offsetHSL(0, 0, (R() - 0.5) * 0.06); g.globalAlpha = 0.1; g.fillStyle = '#' + v.getHexString(); g.fillRect(R() * S, R() * S, 2 + R() * 9, 2 + R() * 9) }
    g.globalAlpha = 1
    if (kind === 'machiya') { // 江戸の町家: 上段=障子の細かい組子／下段=格子戸・腰板（大きな多窓＝現代ガラスに見えるのを脱す）
      const wx = 22, wy = 18, ww = 84, wh = 42
      g.fillStyle = '#ddd2b8'; g.fillRect(wx, wy, ww, wh) // 障子紙＝白すぎない温かい生成り
      g.strokeStyle = 'rgba(70,52,34,0.62)'; g.lineWidth = 1
      for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(wx + ww * i / 10, wy); g.lineTo(wx + ww * i / 10, wy + wh); g.stroke() } // 縦の組子（細かく）
      for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(wx, wy + wh * i / 5); g.lineTo(wx + ww, wy + wh * i / 5); g.stroke() } // 横の組子（細かく＝障子に）
      g.strokeStyle = '#4a3826'; g.lineWidth = 2.4; g.strokeRect(wx, wy, ww, wh)                                  // 障子の框（外枠）
      g.strokeStyle = '#4a3826'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke() // 中央の召し合わせ（引き違い＝二枚障子）
      g.fillStyle = '#5a4632'; g.fillRect(20, 78, 88, 40); g.strokeStyle = 'rgba(28,20,12,0.55)'; g.lineWidth = 1.4
      for (let i = 0; i <= 11; i++) { g.beginPath(); g.moveTo(20 + 88 * i / 11, 78); g.lineTo(20 + 88 * i / 11, 118); g.stroke() }
    } else if (kind === 'sama') { // 戦国の侍屋敷: 連子窓（縦格子）＋板壁の横目地
      g.fillStyle = '#2c241e'; g.fillRect(30, 28, 68, 40)
      g.strokeStyle = '#6a5640'; g.lineWidth = 2.6
      for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(30 + 68 * i / 8, 28); g.lineTo(30 + 68 * i / 8, 68); g.stroke() }
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1
      for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, S * i / 6); g.lineTo(S, S * i / 6); g.stroke() }
    } else { // 大正の洋風窓＋1階の店構え（看板建築）: 上2層は上げ下げ窓、1階は店の硝子＋庇＝平らな一枚板を脱す
      for (const [wx, wy] of [[18, 12], [72, 12], [18, 50], [72, 50]]) {
        const gr = g.createLinearGradient(0, wy, 0, wy + 32); gr.addColorStop(0, '#7a8a92'); gr.addColorStop(1, '#4a5660'); g.fillStyle = gr; g.fillRect(wx, wy, 38, 32)
        g.strokeStyle = '#ece4d4'; g.lineWidth = 3.0; g.strokeRect(wx, wy, 38, 32)
        g.fillStyle = '#ece4d4'; g.fillRect(wx, wy + 14, 38, 2.2); g.fillRect(wx + 17.8, wy, 2.2, 32)
      }
      g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, 46, S, 2); g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 90, S, 3) // 階の帯（層境の繰形）
      g.fillStyle = '#' + base.clone().offsetHSL(0, 0, -0.09).getHexString(); g.fillRect(0, 94, S, 34) // 1階の腰壁（少し暗く）
      g.fillStyle = '#9a4a3a'; g.fillRect(6, 93, S - 12, 5) // 庇（awning）の帯
      for (const [sx2, sw] of [[14, 46], [70, 30]]) { g.fillStyle = '#cfe0e4'; g.fillRect(sx2, 101, sw, 21); g.strokeStyle = '#5a4a3a'; g.lineWidth = 2.4; g.strokeRect(sx2, 101, sw, 21); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(sx2 + 2, 103, sw - 4, 4) } // 店の大きな硝子＋上端の映り込み
    }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.anisotropy = LIGHT ? 1 : 4; t.wrapS = t.wrapT = THREE.RepeatWrapping
    return t
  }
  const facadeMat = (kind, baseHex) => snowify(new THREE.MeshToonMaterial({ color: 0xffffff, map: makeFacade(kind, baseHex), gradientMap: grad }))
  // 町家の夜の灯り（障子の奥の行灯）。障子の面を暖色に＋組子を影で抜く emissiveMap。R()不使用＝生成乱数列を不変に保つ。
  let machiyaGlowTex = null
  const getMachiyaGlow = () => { if (machiyaGlowTex) return machiyaGlowTex
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S)
    const wx = 22, wy = 18, ww = 84, wh = 42
    g.fillStyle = '#ffd596'; g.fillRect(wx, wy, ww, wh) // 障子が行灯で温かく光る
    g.strokeStyle = 'rgba(60,40,18,0.5)'; g.lineWidth = 1
    for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(wx + ww * i / 10, wy); g.lineTo(wx + ww * i / 10, wy + wh); g.stroke() }
    for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(wx, wy + wh * i / 5); g.lineTo(wx + ww, wy + wh * i / 5); g.stroke() }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; machiyaGlowTex = t; return t }
  // 町家の壁材（夕夜は障子が行灯で灯る＝城下町の夜が生きる）。
  const machiyaMat = (baseHex) => { const m = facadeMat('machiya', baseHex); if (duskAmt > 0.12) { m.emissiveMap = getMachiyaGlow(); m.emissive = new THREE.Color(isNight ? 0xffb45a : 0xffc684); m.emissiveIntensity = 0.22 + duskAmt * (isNight ? 0.6 : 0.34) } return m }
  // 侍屋敷の連子窓の夜の灯り（格子の奥の行灯）。連子の面を暖色＋縦格子を影で抜く emissiveMap。R()不使用。
  let samaGlowTex = null
  const getSamaGlow = () => { if (samaGlowTex) return samaGlowTex
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S)
    g.fillStyle = '#ffcf86'; g.fillRect(30, 28, 68, 40) // 連子窓が行灯で温かく光る
    g.strokeStyle = 'rgba(40,26,10,0.7)'; g.lineWidth = 2.4
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(30 + 68 * i / 8, 28); g.lineTo(30 + 68 * i / 8, 68); g.stroke() } // 縦格子の影
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; samaGlowTex = t; return t }
  const samaMat = (baseHex) => { const m = facadeMat('sama', baseHex); if (duskAmt > 0.12) { m.emissiveMap = getSamaGlow(); m.emissive = new THREE.Color(isNight ? 0xffac52 : 0xffc079); m.emissiveIntensity = 0.2 + duskAmt * (isNight ? 0.56 : 0.3) } return m }
  // 大正の洋風窓の夜の灯り（上げ下げ窓＋1階の店の硝子が灯る＝ハイカラな港町の夜景）。R()不使用。
  let yofuGlowTex = null
  const getYofuGlow = () => { if (yofuGlowTex) return yofuGlowTex
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')
    g.fillStyle = '#000000'; g.fillRect(0, 0, S, S)
    g.fillStyle = '#ffe1ad'; for (const [wx, wy] of [[18, 12], [72, 12], [18, 50], [72, 50]]) { g.fillRect(wx, wy, 38, 32); g.fillStyle = 'rgba(50,34,14,0.5)'; g.fillRect(wx, wy + 14, 38, 2.2); g.fillRect(wx + 17.8, wy, 2.2, 32); g.fillStyle = '#ffe1ad' } // 上げ下げ窓（十字桟を影で）
    g.fillStyle = '#ffe6bc'; for (const [sx2, sw] of [[14, 46], [70, 30]]) g.fillRect(sx2, 101, sw, 21) // 1階の店の硝子
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; yofuGlowTex = t; return t }
  // 壁の接地AO（頂点色で底=翳り→上=空の光）。時代の建物の箱に焼いて、平らな箱面の一様さを破り接地感を出す。
  const bakeAO = (geo, hh) => { const pos = geo.attributes.position, col = new Float32Array(pos.count * 3); for (let i = 0; i < pos.count; i++) { const tt = Math.min(1, Math.max(0, (pos.getY(i) + hh / 2) / Math.max(0.001, hh))), ao = Math.min(1, tt / 0.26), v = 0.72 + 0.28 * ao + 0.06 * tt; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v } geo.setAttribute('color', new THREE.BufferAttribute(col, 3)) }
  // 瓦の屋根テクスチャ（横列の瓦＋軒の重なりの影＋縦の丸瓦の筋）＝単色の屋根を脱し俯瞰の質感を上げる。
  const makeTileTex = (baseHex) => {
    const W = 64, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d'), base = new THREE.Color(baseHex)
    x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, W, W)
    for (let r = 0; r < 6; r++) { const y0 = W * r / 6, rh = W / 6
      x.fillStyle = '#' + base.clone().offsetHSL(0, 0, (R() - 0.5) * 0.05).getHexString(); x.fillRect(0, y0, W, rh)
      x.fillStyle = 'rgba(0,0,0,0.24)'; x.fillRect(0, y0 + rh - 2, W, 2)        // 軒の重なりの影
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(0, y0 + 0.5, W, 1) }    // 上端のハイライト
    for (let cc = 0; cc <= 7; cc++) { const xx = W * cc / 7; x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(xx - 0.5, 0, 1, W); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(xx + 1, 0, 1, W) } // 縦の丸瓦の筋
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.anisotropy = LIGHT ? 1 : 4
    return t
  }
  const tileMat = (hex, repU, repV, dbl) => { const m = snowify(new THREE.MeshToonMaterial({ color: 0xffffff, map: makeTileTex(hex), gradientMap: grad })); m.map.repeat.set(repU, repV); if (dbl) m.side = THREE.DoubleSide; return m }
  // ── 石垣（野面積み）のテクスチャ。城の裾広がりの石垣は瓦テクスチャの流用だと「滑らかな横縞」に見える＝近接で安っぽい。
  //    段ごとに半石ずらした不揃いの石（布積み）＋暗い目地＋上下のコバの陰影で、間近でも本物の石積みに。──
  const makeStoneTex = (baseHex) => {
    const W = 128, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d'), base = new THREE.Color(baseHex)
    x.fillStyle = '#' + base.clone().offsetHSL(0, 0, -0.08).getHexString(); x.fillRect(0, 0, W, W) // 目地（暗い下地）
    const rows = 7, rh = W / rows
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh, off = (r % 2) * (W / 9) // 段ごとに半石ずらす（布積み）
      let xx = -off
      while (xx < W) {
        const sw = (W / 6) * (0.7 + R() * 0.8), m = 1.5 + R() * 1.2 // 石幅をばらつかせ（野面積み）＋目地の隙間
        const px = xx + m, py = y0 + m, pw = sw - m * 2, ph = rh - m * 2
        if (pw > 1 && ph > 1) {
          x.fillStyle = '#' + base.clone().offsetHSL((R() - 0.5) * 0.02, (R() - 0.5) * 0.05, (R() - 0.5) * 0.13).getHexString(); x.fillRect(px, py, pw, ph) // 石ごとに色味をゆらす
          x.fillStyle = 'rgba(255,255,255,0.09)'; x.fillRect(px, py, pw, 1)            // 上端の光
          x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(px, py + ph - 1, pw, 1)         // 下端の影
        }
        xx += sw
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.anisotropy = LIGHT ? 1 : 4
    return t
  }
  const stoneMat = (hex, repU, repV) => { const m = snowify(new THREE.MeshToonMaterial({ color: 0xffffff, map: makeStoneTex(hex), gradientMap: grad })); m.map.repeat.set(repU, repV); return m }
  // ── 赤煉瓦（イギリス積み風）のテクスチャ。大正の赤レンガ倉庫・時計塔は色ムラだけだと近接で滑らかな赤一色＝安っぽい。
  //    段ごとに半煉瓦ずらした規則的な煉瓦＋明るいモルタル目地＋一枚ごとの色ゆらぎで、間近でも本物の煉瓦壁に。──
  const makeBrickTex = (baseHex) => {
    const W = 128, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d'), base = new THREE.Color(baseHex)
    x.fillStyle = '#' + base.clone().offsetHSL(0.02, -0.28, 0.34).getHexString(); x.fillRect(0, 0, W, W) // 明るいモルタルの下地
    const rows = 9, rh = W / rows, bw = W / 5 // 煉瓦の段と一枚の幅
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh, off = (r % 2) * (bw / 2) // 段ごとに半煉瓦ずらす（イギリス積み風）
      for (let bx = -off; bx < W; bx += bw) {
        const m = 1.3, px = bx + m, py = y0 + m, pw = bw - m * 2, ph = rh - m * 2
        if (pw > 1 && ph > 1) {
          x.fillStyle = '#' + base.clone().offsetHSL((R() - 0.5) * 0.02, (R() - 0.5) * 0.05, (R() - 0.5) * 0.1).getHexString(); x.fillRect(px, py, pw, ph) // 一枚ごとに色をゆらす
          x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(px, py, pw, 1)      // 上端のかすかな光
          x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(px, py + ph - 1, pw, 1)   // 下端のかすかな影
        }
      }
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.anisotropy = LIGHT ? 1 : 4
    return t
  }
  const brickMat = (hex, repU, repV) => { const m = snowify(new THREE.MeshToonMaterial({ color: 0xffffff, map: makeBrickTex(hex), gradientMap: grad })); m.map.repeat.set(repU, repV); return m }
  // ── 看板（canvasで店名を描く＝オフラインで鮮明・時代ごとの字体。看板/のれん/ホーロー看板を立てる） ──
  const signCache = {}
  const signMat = (text, bg, fg, vertical, fontPx) => {
    const key = text + '|' + bg + '|' + fg + '|' + (vertical ? 'v' : 'h')
    if (signCache[key]) return signCache[key]
    const chars = [...text], c = document.createElement('canvas'), x = c.getContext('2d')
    if (vertical) { c.width = 44; c.height = 40 * Math.max(1, chars.length) + 8; x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold ${fontPx || 30}px "Yu Mincho","Hiragino Mincho ProN",serif`; chars.forEach((ch, i) => x.fillText(ch, c.width / 2, 40 * i + 24)) }
    else { c.width = 132; c.height = 52; x.fillStyle = bg; x.fillRect(0, 0, 132, 52); x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold ${fontPx || 28}px "Yu Gothic","Hiragino Sans",sans-serif`; x.fillText(text, 66, 28) }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4
    // 昼夕は陰影付き(MeshToon)で景色の光になじませる／夜だけ発光(MeshBasic)で看板が灯る。MeshBasicは無影＝昼に原色がネオンのように浮く（評価指摘）のを断つ。
    const m = isNight ? new THREE.MeshBasicMaterial({ map: t, fog: true }) : new THREE.MeshToonMaterial({ map: t, gradientMap: grad, fog: true }); signCache[key] = m; return m
  }
  // 縦看板（江戸/戦国の木の掛看板）: 板＋縦書きの屋号。x,zの位置・ry向き・高さ・板色。
  const mkSignV = (px, py, pz, ry, text, board = 0xe6d8b8, ink = 0x3a2a1a) => {
    const g = new THREE.Group(); g.position.set(px, py, pz); g.rotation.y = ry
    const h = 0.5 * [...text].length + 0.5, panel = new THREE.Mesh(new THREE.PlaneGeometry(0.7, h), signMat(text, '#' + new THREE.Color(board).getHexString(), '#' + new THREE.Color(ink).getHexString(), true)); panel.position.y = h / 2; g.add(panel)
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, h + 0.1, 0.08), toon(board)); back.position.set(0, h / 2, -0.05); g.add(back)
    town.add(g); return g
  }
  // 横看板（大正/現代のホーロー/木の横看板）: 板＋横書きの店名。
  const mkSignH = (px, py, pz, ry, text, board = 0xdfe4e2, ink = 0x2a3a44) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.86), signMat(text, '#' + new THREE.Color(board).getHexString(), '#' + new THREE.Color(ink).getHexString(), false)); panel.position.set(px, py, pz); panel.rotation.y = ry
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.96, 0.08), toon(board)); back.position.set(px, py, pz); back.rotation.y = ry; back.position.x -= Math.sin(ry) * 0.05; back.position.z -= Math.cos(ry) * 0.05
    town.add(back); town.add(panel); return panel
  }
  // ── 生きもの（街/時代/季節で最適化・水彩のやさしい色）──
  const mkButterfly = (cx, cy, cz, col) => { const g = new THREE.Group(); g.position.set(cx, cy, cz); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.2, 7), new THREE.MeshToonMaterial({ color: col, gradientMap: grad, side: THREE.DoubleSide, transparent: true, opacity: 0.82, fog: true })); w.position.x = s * 0.1; w.userData.side = s; g.add(w) } town.add(g); critters.push({ g, cx, cy, cz, ph: R() * 6.28, type: 'fly', rad: 1.4 + R() * 2.2 }) } // 羽は陰影付き(toon)＋わずかに透過＝霧/夕の中で煌々と浮かない
  const mkDragonfly = (cx, cy, cz, bodyCol = 0x46665a) => { const g = new THREE.Group(); g.position.set(cx, cy, cz); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.0, 5), toon(bodyCol)); body.rotation.z = Math.PI / 2; g.add(body); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.1), new THREE.MeshBasicMaterial({ color: 0xcfe0e6, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: true })); w.position.set(0, 0.05, s * 0.16); g.add(w) } town.add(g); critters.push({ g, cx, cy, cz, ph: R() * 6.28, type: 'dart', rad: 2 + R() * 3 }) } // 羽は薄く小さく＝遠目に「浮いた四角」に見えない（実機FBの白箱対策）
  // 四つ足の動物（猫/犬/馬）。種ごとの専用造形＝「色違いの同一ブロック」を脱し、それぞれの生き物のシルエットに（セルルック・デフォルメ歓迎）。
  // アニメ契約は従来どおり: userData.headG(rotation.y=見回し)/tailG(rotation.y=尾振り)/legs[](rotation.x=歩様・股支点)。
  // パーツは頂点色ベイクで 胴1＋頭1＋脚4＋尾1＋接地影1 ＝8メッシュに統合（旧13より軽く、形は種別に）。
  const quads = []
  const quadMat = toon(0xffffff); quadMat.vertexColors = true // 動物の共有トゥーン材（頂点色）
  const mkQuad = (x, y, z, ry, col, sc, kind) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry
    kind = kind || (sc >= 0.9 ? 'horse' : 'cat') // 旧呼び出し互換（明示なしは大きさで馬/猫）
    const s = sc
    const dark = new THREE.Color(col).multiplyScalar(0.42).getHex() // 縞/たてがみ/蹄の濃色
    const lite = new THREE.Color(col).lerp(new THREE.Color(0xfff2dc), 0.5).getHex() // 胸元/鼻面の淡色
    const qM = new THREE.Matrix4(), qE = new THREE.Euler()
    const part = (arr, geo, hex, px, py, pz, rx = 0, ryy = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      geo = geo.toNonIndexed(); geo.scale(sx, sy, sz)
      qM.makeRotationFromEuler(qE.set(rx, ryy, rz)).setPosition(px, py, pz); geo.applyMatrix4(qM)
      const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3)
      for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b }
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); arr.push(geo)
    }
    const merge = (arr, parent, cast) => { if (!BufferGeometryUtils.mergeGeometries) return null; const m = BufferGeometryUtils.mergeGeometries(arr, false); arr.forEach((ge) => ge.dispose()); if (!m) return null; const mesh = new THREE.Mesh(m, quadMat); mesh.castShadow = !!cast; parent.add(mesh); return mesh }
    const headG = new THREE.Group(), tailG = new THREE.Group(), legs = []
    const mkLeg = (lx, ly, lz, r0, r1, len, hoofHex, hoofH) => { // 股支点グループ＋(脚＋足先)1メッシュ
      const lp = new THREE.Group(); lp.position.set(lx, ly, lz); g.add(lp)
      const arr = []
      part(arr, new THREE.CylinderGeometry(r0, r1, len, 6), col, 0, -len / 2, 0)
      if (hoofHex !== undefined) part(arr, new THREE.CylinderGeometry(r1 * 1.2, r1 * 1.28, hoofH, 6), hoofHex, 0, -len - hoofH / 2 + 0.01, 0) // 蹄
      else part(arr, new THREE.SphereGeometry(r1 * 1.18, 6, 5), col, 0, -len + r1 * 0.2, r1 * 0.45, 0, 0, 0, 1, 0.72, 1.25) // 肉球の足先（前へ・皿状に広げない）
      merge(arr, lp); legs.push(lp)
    }
    const bodyG = [], headP = [], tailP = []
    if (kind === 'cat') { // 猫＝丸い頭・短い脚・上へ曲がる尾・背の縞（winCatの意匠を歩く体へ）
      part(bodyG, new THREE.CapsuleGeometry(0.20 * s, 0.46 * s, 4, 10), col, 0, 0.44 * s, 0, 0, 0, Math.PI / 2)
      part(bodyG, new THREE.SphereGeometry(0.175 * s, 8, 7), lite, 0.22 * s, 0.40 * s, 0, 0, 0, 0, 0.9, 0.85, 0.9) // 胸元の淡い毛
      headG.position.set(0.40 * s, 0.60 * s, 0)
      part(headP, new THREE.SphereGeometry(0.20 * s, 10, 8), col, 0.04 * s, 0.02 * s, 0, 0, 0, 0, 0.95, 0.88, 0.92) // 丸い頭
      part(headP, new THREE.SphereGeometry(0.095 * s, 7, 6), lite, 0.17 * s, -0.05 * s, 0, 0, 0, 0, 0.9, 0.68, 0.95) // マズル
      part(headP, new THREE.SphereGeometry(0.024 * s, 5, 4), 0xc97878, 0.245 * s, -0.025 * s, 0) // 桃色の鼻
      for (const es of [-1, 1]) {
        part(headP, new THREE.ConeGeometry(0.075 * s, 0.15 * s, 4), col, -0.02 * s, 0.185 * s, es * 0.10 * s, es * -0.16, 0, 0)
        part(headP, new THREE.ConeGeometry(0.038 * s, 0.08 * s, 4), 0xd8a4a0, -0.005 * s, 0.175 * s, es * 0.10 * s, es * -0.16, 0, 0) // 内耳
        part(headP, new THREE.SphereGeometry(0.030 * s, 6, 5), 0x1c1612, 0.155 * s, 0.045 * s, es * 0.085 * s) // 目
      }
      tailG.position.set(-0.42 * s, 0.52 * s, 0)
      part(tailP, new THREE.TorusGeometry(0.155 * s, 0.026 * s, 5, 10, 2.4), col, -0.024 * s, 0.153 * s, 0, 0, 0, -Math.PI * 0.45) // 上へ曲がる尾（弧の始点を付け根に接地＝浮いた輪にしない）
      for (const [lx, lz] of [[0.20, 0.10], [0.20, -0.10], [-0.20, 0.10], [-0.20, -0.10]]) mkLeg(lx * s, 0.42 * s, lz * s, 0.046 * s, 0.036 * s, 0.40 * s)
    } else if (kind === 'dog') { // 犬＝立ち耳・突き出た鼻面・背に巻く尾（柴のシルエット）
      part(bodyG, new THREE.CapsuleGeometry(0.21 * s, 0.50 * s, 4, 10), col, 0, 0.50 * s, 0, 0, 0, Math.PI / 2)
      part(bodyG, new THREE.SphereGeometry(0.185 * s, 8, 7), lite, 0.24 * s, 0.44 * s, 0, 0, 0, 0, 0.9, 0.9, 0.92) // 胸元
      headG.position.set(0.42 * s, 0.66 * s, 0)
      part(headP, new THREE.SphereGeometry(0.20 * s, 10, 8), col, 0.02 * s, 0.02 * s, 0, 0, 0, 0, 1, 0.92, 0.92)
      part(headP, new THREE.CylinderGeometry(0.075 * s, 0.098 * s, 0.20 * s, 7), lite, 0.21 * s, -0.045 * s, 0, 0, 0, Math.PI / 2) // 鼻面
      part(headP, new THREE.SphereGeometry(0.036 * s, 6, 5), 0x241c16, 0.315 * s, -0.03 * s, 0) // 黒い鼻先
      for (const es of [-1, 1]) {
        part(headP, new THREE.ConeGeometry(0.08 * s, 0.17 * s, 4), col, -0.015 * s, 0.20 * s, es * 0.105 * s, es * -0.14, 0, -0.1)
        part(headP, new THREE.SphereGeometry(0.032 * s, 6, 5), 0x1c1612, 0.16 * s, 0.05 * s, es * 0.09 * s) // 目
      }
      tailG.position.set(-0.40 * s, 0.66 * s, 0)
      part(tailP, new THREE.TorusGeometry(0.10 * s, 0.032 * s, 5, 10, 4.4), col, -0.036 * s, 0.093 * s, 0, 0, 0, -1.2) // 背に巻く尾（弧の始点を付け根に接地＝柴の巻き尾）
      for (const [lx, lz] of [[0.22, 0.11], [0.22, -0.11], [-0.22, 0.11], [-0.22, -0.11]]) mkLeg(lx * s, 0.48 * s, lz * s, 0.052 * s, 0.040 * s, 0.46 * s)
    } else { // 馬＝長い脚・起き上がる首・面長の頭・たてがみ・垂れる尾＋蹄
      part(bodyG, new THREE.CapsuleGeometry(0.30 * s, 0.72 * s, 4, 10), col, 0, 1.05 * s, 0, 0, 0, Math.PI / 2)
      part(bodyG, new THREE.CylinderGeometry(0.115 * s, 0.165 * s, 0.55 * s, 8), col, 0.45 * s, 1.30 * s, 0, 0, 0, -0.72) // 首（前上がり）
      part(bodyG, new THREE.BoxGeometry(0.34 * s, 0.55 * s, 0.055 * s), dark, 0.335 * s, 1.38 * s, 0, 0, 0, -0.72, 0.16, 1, 1) // たてがみ（首の背）
      headG.position.set(0.62 * s, 1.55 * s, 0)
      part(headP, new THREE.SphereGeometry(0.135 * s, 9, 7), col, 0, 0.01 * s, 0, 0, 0, 0, 1, 0.95, 0.9) // 額
      part(headP, new THREE.CylinderGeometry(0.128 * s, 0.082 * s, 0.40 * s, 8), col, 0.17 * s, -0.065 * s, 0, 0, 0, Math.PI / 2 - 0.35) // 面長の頭（先細り・やや下向き）
      part(headP, new THREE.CylinderGeometry(0.085 * s, 0.088 * s, 0.09 * s, 8), lite, 0.335 * s, -0.125 * s, 0, 0, 0, Math.PI / 2 - 0.35) // 鼻先の淡色
      part(headP, new THREE.BoxGeometry(0.10 * s, 0.14 * s, 0.05 * s), dark, -0.045 * s, 0.115 * s, 0, 0, 0, -0.5) // 前髪
      for (const es of [-1, 1]) {
        part(headP, new THREE.ConeGeometry(0.05 * s, 0.14 * s, 4), col, -0.05 * s, 0.16 * s, es * 0.07 * s, es * -0.12, 0, 0)
        part(headP, new THREE.SphereGeometry(0.034 * s, 6, 5), 0x1c1612, 0.075 * s, 0.03 * s, es * 0.105 * s) // 目（側頭）
      }
      tailG.position.set(-0.48 * s, 1.18 * s, 0)
      part(tailP, new THREE.CylinderGeometry(0.055 * s, 0.018 * s, 0.62 * s, 6), dark, -0.09 * s, -0.28 * s, 0, 0, 0, 0.32) // 垂れる尾
      for (const [lx, lz] of [[0.30, 0.14], [0.30, -0.14], [-0.30, 0.14], [-0.30, -0.14]]) mkLeg(lx * s, 0.95 * s, lz * s, 0.075 * s, 0.050 * s, 0.88 * s, 0x2a2119, 0.07 * s)
    }
    merge(bodyG, g, true); g.add(headG); merge(headP, headG, true); g.add(tailG); merge(tailP, tailG)
    const sh = new THREE.Mesh(dynShadowGeo, contactShadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.04
    sh.scale.set((kind === 'horse' ? 1.6 : 1.2) * s, (kind === 'horse' ? 2.6 : 1.8) * s, 1); sh.renderOrder = 1; g.add(sh) // 足元の接地影
    g.userData = { headG, tailG, legs, sc, kind, hx: x, hz: z, face: ry, ph: Math.random() * 6.28, moving: false, tx: x, tz: z, moveT: 2 + Math.random() * 6, speed: (kind === 'horse' ? 0.8 : 0.5) + Math.random() * 0.4 }
    town.add(g); quads.push(g); return g }
  // 屋台/床店（市の賑わい＝着地の散歩で出会う活気）。柱＋差し掛け屋根＋商品台＋籠＋色とりどりの品＋暖簾。
  const makeStall = (x, gy, z, rot, opts = {}) => {
    const g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = rot
    const w = opts.w || 2.2, d = opts.d || 1.4, ph = 1.85
    const postMat = toon(opts.postCol || 0x6a4f38)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, ph, 5), postMat); p.position.set(sx * w / 2, ph / 2, sz * d / 2); p.castShadow = true; g.add(p) } // 4本の柱
    const rk = opts.roof || 'cloth'
    const roofMat = rk === 'reed' ? toon(0x8a7340) : rk === 'wood' ? toon(0x5a4a38) : toon(opts.roofCol || 0xb84a3e) // 布=朱/葦簀=茶/板=濃茶
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.08, d + 0.7), roofMat); roof.position.set(0, ph + 0.06, -0.12); roof.rotation.x = -0.16; roof.castShadow = true; g.add(roof) // 差し掛けの屋根（前へ傾く）
    const counter = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d * 0.62), toon(0x7a5e44)); counter.position.set(0, 0.82, d * 0.16); counter.castShadow = true; g.add(counter) // 商品台
    const goods = opts.goods || [0xc8702e, 0x7a8a3a, 0xb04030, 0xd0a850, 0x9a5a3a]
    for (let i = 0; i < 6; i++) { const c = goods[(R() * goods.length) | 0]; const it = new THREE.Mesh(new THREE.SphereGeometry(0.06 + R() * 0.05, 7, 6), toon(c)); it.position.set((R() - 0.5) * w * 0.82, 0.92, d * 0.16 + (R() - 0.5) * d * 0.32); it.scale.y = 0.8 + R() * 0.4; g.add(it) } // 色とりどりの品（野菜/魚/陶器/反物）
    for (const bx of [-w * 0.3, w * 0.32]) { const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.13, 8), toon(0x9a7a4a)); bk.position.set(bx, 0.93, d * 0.16); g.add(bk) } // 籠
    if (opts.noren !== undefined) { const nr = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.42, 0.03), toon(opts.noren)); nr.position.set(0, ph - 0.32, d / 2 + 0.18); g.add(nr) } // 軒先の暖簾
    town.add(g); return g
  }
  // 積み荷（俵＋樽＋籠）＝城下/市の店先の荷。降り立った時の生活感。
  const makeCargo = (x, gy, z, rot) => {
    const g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = rot
    const straw = toon(0xc9b67e), wood = toon(0x8a6a44), band = toon(0x4a3a28)
    const nb = 3 + ((R() * 3) | 0) // 俵を積む
    for (let i = 0; i < nb; i++) { const col = i % 2, row = (i / 2) | 0; const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.66, 8), straw); tb.rotation.z = Math.PI / 2; tb.position.set(col * 0.44 - 0.1, 0.21 + row * 0.4, 0); tb.castShadow = true; g.add(tb)
      for (const bz of [-0.17, 0.17]) { const bd = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.018, 4, 8), band); bd.rotation.y = Math.PI / 2; bd.position.set(col * 0.44 - 0.1 + bz, 0.21 + row * 0.4, 0); g.add(bd) } } // 縄
    for (let i = 0; i < 1 + (R() < 0.5 ? 1 : 0); i++) { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.48, 10), wood); br.position.set(0.5 + i * 0.4, 0.24, 0.42); br.castShadow = true; g.add(br); for (const by of [0.11, -0.11]) { const bd = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 4, 10), band); bd.rotation.x = Math.PI / 2; bd.position.set(0.5 + i * 0.4, 0.24 + by, 0.42); g.add(bd) } } // 樽
    town.add(g); return g
  }
  // 車（面取り車体＋濃色キャビン＋4輪を1メッシュに統合）。街路/駐車場で再利用＝脱ローポリ(箱に車輪が付き「車」と分かる)しつつ描画コールは車体+窓+輪の3。
  // cy=接地面の高さ（内部で車体を持ち上げ、車輪の下端がcyに来る）。len=全長（軽トラ/セダンで可変）。
  const carGlassMat = toon(0x2a2e34), carWheelMat = toon(0x17171b)
  const mkCar = (cx, cy, cz, ry, col, len = 3.4) => {
    const g = new THREE.Group(); g.position.set(cx, cy, cz); g.rotation.y = ry
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.96, len, 2, 0.26), toon(col)); body.position.y = 0.62; body.castShadow = true; g.add(body) // 車体（車輪の上に乗る）
    const cab = new THREE.Mesh(new RoundedBoxGeometry(1.46, 0.62, len * 0.5, 2, 0.2), carGlassMat); cab.position.set(0, 1.28, -0.08); g.add(cab) // 濃色のキャビン（窓）
    const wg = []
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10); w.rotateZ(Math.PI / 2); w.translate(sx * 0.82, 0.3, sz * (len / 2 - 0.72)); wg.push(w) } // 4輪
    const wm = BufferGeometryUtils.mergeGeometries ? (BufferGeometryUtils.mergeGeometries(wg, false) || wg[0]) : wg[0]; g.add(new THREE.Mesh(wm, carWheelMat)) // 4輪を1メッシュへ
    const sh = new THREE.Mesh(dynShadowGeo, contactShadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.04; sh.scale.set(2.0, len + 0.5, 1); sh.renderOrder = 1; g.add(sh) // 足元の接地影（俯瞰で浮かない）
    return g
  }
  // 灯りの地明かり（提灯/ガス灯の足元の暖かい光だまり）。夕夜に道を照らす＝降り立った夜の情緒。
  const poolCv = document.createElement('canvas'); poolCv.width = poolCv.height = 64; const pcx = poolCv.getContext('2d'); const pgr = pcx.createRadialGradient(32, 32, 1, 32, 32, 32); pgr.addColorStop(0, 'rgba(255,200,130,0.9)'); pgr.addColorStop(0.55, 'rgba(255,180,100,0.32)'); pgr.addColorStop(1, 'rgba(255,170,90,0)'); pcx.fillStyle = pgr; pcx.fillRect(0, 0, 64, 64); const poolTex = new THREE.CanvasTexture(poolCv)
  const lightPool = (x, gy, z, r, op) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffba66, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: true })); m.rotation.x = -Math.PI / 2; m.position.set(x, gy + 0.06, z); town.add(m); return m }
  // 接地影デカール（足元の柔らかい暗い円）。静的影は原点周り±60しか焼かないので、遠い時代/雲のプロップは影が無く宙に浮いて見える。
  // 足元に薄い影の円を敷いて接地させる＝浮き感を消す（評価アート「接地影は最強のコスパ」）。多数を1メッシュへ統合＝描画コール+1。
  const csCv = document.createElement('canvas'); csCv.width = csCv.height = 64; const csx = csCv.getContext('2d'); const csGr = csx.createRadialGradient(32, 32, 1, 32, 32, 32); csGr.addColorStop(0, 'rgba(0,0,0,0.85)'); csGr.addColorStop(0.55, 'rgba(0,0,0,0.4)'); csGr.addColorStop(1, 'rgba(0,0,0,0)'); csx.fillStyle = csGr; csx.fillRect(0, 0, 64, 64); const contactShadowTex = new THREE.CanvasTexture(csCv)
  const contactShadowMat = new THREE.MeshBasicMaterial({ map: contactShadowTex, transparent: true, opacity: 0.5, depthWrite: false, fog: true, color: 0x000000 })
  const crowdShadowGeo = new THREE.PlaneGeometry(1.5, 1.5) // 群衆(mkCrowdPerson)の足元影＝メッシュの子に付けて移動/回転に追従（円なので回転不問）
  const dynShadowGeo = new THREE.PlaneGeometry(1, 1) // 動く物(車/犬猫)の足元影＝子に付け各自scaleで足形に（共有ジオメトリ・接地影は最強のコスパ。アート監督E1）
  const addContactShadows = (specs) => { // specs: [[x, groundY, z, radius], ...] を1メッシュへ
    if (!specs.length || !BufferGeometryUtils.mergeGeometries) return
    const geos = []
    for (const [x, y, z, r] of specs) { const q = new THREE.PlaneGeometry(r * 2, r * 2); q.rotateX(-Math.PI / 2); q.translate(x, y + 0.05, z); geos.push(q) }
    const m = BufferGeometryUtils.mergeGeometries(geos, false); geos.forEach((g) => g.dispose()); if (!m) return
    const mesh = new THREE.Mesh(m, contactShadowMat); mesh.renderOrder = 1; town.add(mesh)
  }
  const homeTreeShadows = [] // 静的影の範囲(原点±60)の外に立つhome/谷戸の木の接地影を集めて1メッシュに（tree()が遠い木の足元をここへ積む）
  // ── 夏祭り（獅子ヶ谷の夏の夜祭り。やぐら＋放射状の提灯＋屋台＋盆踊りの輪）。会場へ配置できる再利用関数。──
  // 日替わりで開催/非開催（実カレンダーの日付で決定＝同じ日は同じ・日が変わると変わる）。夏の夕夜のみ。
  const festDay = Math.floor(Date.now() / 864e5) // 今日(エポックからの日数)
  const FORCE_FEST = /[?&]fest=1/.test(location.search) // 検証/プレビュー用: 日替わりを無視して必ず開催
  const festOn = (id) => season === 'summer' && weather !== 'rain' && weather !== 'snow' && (isNight || duskAmt > 0.2) && (FORCE_FEST || ((((festDay * 2654435761) ^ (id * 40503) ^ 0x5bd1e995) >>> 0) % 100) < 50) // 各会場50%で開催（夏の夕夜）。雨/雪は現実通り中止（実機FB）
  const festivalSpots = []  // 開催中の祭りの中心（音の距離計算用）＝遠くから囃子が聞こえ近づくと大きくなる
  const festDancers = []    // 盆踊りの踊り手（frameで腕を上げ下げ・体を揺らす）
  // 祭り・雲海の人物を「住人(makeResident)」と同じ高品質（顔・手足・小物・輪郭）で作る。makeResidentは別ブロック(時代住人の生成所)で後方定義のため、ここでは配置データだけ溜め、そのブロック内で実体化する（評価FB「全エリアの全キャラを添付画像級の品質へ」）。
  const folkSpecs = []
  const FOLK_OBI = [0x8a6a3a, 0x7a3a32, 0x55603a, 0x3a4250, 0x9a7a44, 0x6a4a8a] // 浴衣の帯/差し色
  // 雲海の島に立つ人＝高度フェード(cloudRevealMats)で滲み出させる。reveal=trueは材を複製して共有材(RES_OUTLINE/接地影)を汚さぬよう実体化時に処理。reveal=falseは渡し舟(skyDriftersで一括表示制御)用。
  const queueCloudFolk = (parent, x, y, z, ry, top, scale = 0.82, reveal = true) => folkSpecs.push({ cloud: true, parent, x, y, z, ry, top, scale, reveal })
  // 祭りの立ち姿（浴衣の人影）。壺/こけしを避け、肩から裾へ広がる胴＋首＋小さめの頭＋髪＝人らしく（実機FB「ポットみたいなもの」の解消）。
  const folkBody = (parent, bodyMat, skinMat, hairMat) => {
    // 胴＋脚×2＋足先を1メッシュに統合（描画コールを増やさず脚を足す）。下半身を二本に分け人のシルエットを明確化（瓶/こけしを脱す）
    const geos = [new THREE.CylinderGeometry(0.19, 0.16, 0.62, 9).translate(0, 0.85, 0)] // 胴（腰→肩。肩を少し張らせ上半身と分かる）
    for (const s of [-1, 1]) { geos.push(new THREE.CylinderGeometry(0.075, 0.058, 0.56, 6).translate(s * 0.095, 0.28, 0)); geos.push(new THREE.BoxGeometry(0.1, 0.05, 0.18).translate(s * 0.095, 0.025, 0.035)) }
    const bodyGeo = BufferGeometryUtils.mergeGeometries ? (BufferGeometryUtils.mergeGeometries(geos, false) || geos[0]) : geos[0]
    const body = new THREE.Mesh(bodyGeo, bodyMat); body.castShadow = true; parent.add(body) // 浴衣（胴＋二本の脚）
    parent.add(new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.052, 0.1, 6), skinMat).translateY(1.21)) // 首
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skinMat); h.position.y = 1.33; h.scale.set(0.95, 1.07, 0.96); parent.add(h) // 頭は小さめ＝頭身を伸ばす
    parent.add(new THREE.Mesh(new THREE.SphereGeometry(0.163, 9, 8, 0, 6.2832, 0, Math.PI * 0.62), hairMat).translateY(1.35).translateZ(-0.012)) // 髪（後頭部）
    return body
  }
  // 群衆の一人＝人らしい体（裾広がりの胴＋首＋小頭＋髪）を頂点色で1メッシュに焼く。こけし人形(円柱＋球)を脱しつつ描画コールは1（市の人々で多用するので軽量化も兼ねる）。
  const crowdMat = toon(0xffffff); crowdMat.vertexColors = true
  const crowdAnim = [] // 静的な群衆(mkCrowdPerson)＝近くに立つと「蝋人形」に見える。frameで近くの者だけ微かに揺らす（蠢く）。cityWalkerは除外
  const mkCrowdPerson = (px, py, pz, bodyCol, sc = 0.7) => {
    const skinHex = 0xe6c6a4, hairHex = 0x2a1f18, geos = []
    const legHex = new THREE.Color(bodyCol).multiplyScalar(0.62).getHex() // 下衣（袴/ズボン）＝胴より一段暗い二色で「服を着た人」と分かる
    const bake = (geo, hex, y, x = 0, z = 0) => { geo.translate(x, y, z); const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geos.push(geo) }
    // 脚×2＋足先＝下半身を二本に分け、人のシルエットを明確化（瓶/こけしを脱す）。同じ統合メッシュに焼くので描画コールは1のまま
    for (const s of [-1, 1]) { bake(new THREE.CylinderGeometry(0.075, 0.058, 0.56, 6).toNonIndexed(), legHex, 0.28, s * 0.095); bake(new THREE.BoxGeometry(0.1, 0.05, 0.18).toNonIndexed(), legHex, 0.025, s * 0.095, 0.035) }
    // 胴は「胸(上衣)＋腰(下衣)」の二段＝くびれた腰と二色の服で、のっぺりした円柱(=瓶/こけし)を脱す（評価アート①-d）。統合メッシュなので描画コール不変。
    bake(new THREE.CylinderGeometry(0.2, 0.165, 0.34, 9).toNonIndexed(), bodyCol, 1.0) // 胸（肩0.2を張り→腰0.165へ細る上衣）
    bake(new THREE.CylinderGeometry(0.165, 0.2, 0.34, 9).toNonIndexed(), legHex, 0.69) // 腰（くびれ0.165→腰0.2へ広がる下衣＝袴/スカートの裾）
    { const sh = new THREE.SphereGeometry(0.205, 9, 6).toNonIndexed(); sh.scale(1.0, 0.4, 0.62); bake(sh, bodyCol, 1.16) } // 肩（横に張る稜線＝円柱の天面でなく「肩のある人型」。瓶/こけしを明確に脱す）
    bake(new THREE.CylinderGeometry(0.044, 0.052, 0.13, 6).toNonIndexed(), skinHex, 1.225) // 首（短すぎて頭が肩に埋まるのを解消）
    const hd = new THREE.SphereGeometry(0.15, 10, 8).toNonIndexed(); hd.scale(0.95, 1.07, 0.96); bake(hd, skinHex, 1.36) // 小さめの頭＝頭身を伸ばす
    bake(new THREE.SphereGeometry(0.163, 9, 7, 0, 6.2832, 0, Math.PI * 0.62).toNonIndexed(), hairHex, 1.395, 0, -0.04) // 髪（後上へ＝前髪が顔を覆わない）
    for (const s of [-1, 1]) bake(new THREE.SphereGeometry(0.023, 5, 4).toNonIndexed(), hairHex, 1.362, s * 0.05, 0.132) // 目（頭の中心高さ）
    bake(new THREE.SphereGeometry(0.021, 5, 4).toNonIndexed(), 0xd8b493, 1.33, 0, 0.15) // 鼻（横顔に立体＝「点2つの顔」を脱す）
    bake(new THREE.BoxGeometry(0.05, 0.012, 0.012).toNonIndexed(), 0x9a6a58, 1.298, 0, 0.138) // 口
    for (const s of [-1, 1]) bake(new THREE.SphereGeometry(0.026, 5, 4).toNonIndexed(), skinHex, 1.34, s * 0.142, -0.005) // 耳
    const aM = new THREE.Matrix4() // 腕＝上腕＋前腕（肘で前へ曲がる二節）＋手先。棒の一本腕を脱す。同じ統合メッシュに焼くので描画コール不変
    for (const s of [-1, 1]) {
      const arm = new THREE.CylinderGeometry(0.032, 0.036, 0.34, 5).toNonIndexed(); aM.makeRotationZ(s * 0.08).setPosition(s * 0.205, 0.95, 0.01); arm.applyMatrix4(aM) // 上腕（体側へ）
      const c = new THREE.Color(bodyCol), a = new Float32Array(arm.attributes.position.count * 3); for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b } arm.setAttribute('color', new THREE.BufferAttribute(a, 3)); geos.push(arm)
      const fore = new THREE.CylinderGeometry(0.027, 0.032, 0.30, 5).toNonIndexed(); aM.makeRotationX(-0.30).setPosition(s * 0.215, 0.66, 0.055); fore.applyMatrix4(aM) // 前腕（肘からやや前へ）
      const a2 = new Float32Array(fore.attributes.position.count * 3); for (let q = 0; q < a2.length; q += 3) { a2[q] = c.r; a2[q + 1] = c.g; a2[q + 2] = c.b } fore.setAttribute('color', new THREE.BufferAttribute(a2, 3)); geos.push(fore)
      bake(new THREE.SphereGeometry(0.043, 6, 5).toNonIndexed(), skinHex, 0.52, s * 0.218, 0.10) // 手先
    }
    if (!BufferGeometryUtils.mergeGeometries) return
    const m = BufferGeometryUtils.mergeGeometries(geos, false); geos.forEach((g) => g.dispose()); if (!m) return
    const mesh = new THREE.Mesh(m, crowdMat); mesh.position.set(px, py, pz); mesh.rotation.y = R() * 6.28; mesh.scale.setScalar(sc); mesh.castShadow = true; town.add(mesh)
    // 接地影: 静的影は原点±60しか焼かない＝時代エリア(遠い)の群衆は影が無く宙に浮く。足元に柔らかい影の円を「メッシュの子」で付け、
    // 移動(cityWalkers)にも追従させる(円なので回転は不問)。原点近く(home)は実影があるので付けない＝二重で濃くならない・描画コールも増やさない。
    if (Math.hypot(px, pz) > 58) { const csh = new THREE.Mesh(crowdShadowGeo, contactShadowMat); csh.rotation.x = -Math.PI / 2; csh.position.y = 0.05; csh.renderOrder = 3; mesh.add(csh) }
    // 近接の微揺れ用（cityWalkerになった個体はwalkerフラグで除外）。統合メッシュ＝手足は動かせないので、
    // 見回し(rotation.y)・弾み(y)・片足重心の傾き(rotation.z)に個体差を持たせ「同期した蝋人形」を脱す。
    // 個体差は既存の cph から導出＝新たな R() を消費しない（時代エリアの配置カスケードを起こさない）。
    const cph = R() * 6.28
    mesh.userData.cph = cph; mesh.userData.cy0 = py; mesh.userData.crot = mesh.rotation.y
    mesh.userData.cswAmp = 0.09 + (0.5 + 0.5 * Math.sin(cph * 3.1)) * 0.30 // 見回しの振れ幅（じっと/よく見回す）
    mesh.userData.cswSpd = 0.26 + (0.5 + 0.5 * Math.cos(cph * 2.3)) * 0.36 // 見回しの速さの癖
    mesh.userData.cLean = Math.sin(cph * 5.7) * 0.06                       // 片足に体重を預ける傾きの癖（rotation.z）
    mesh.userData.cbobSpd = 1.0 + (0.5 + 0.5 * Math.sin(cph * 1.7)) * 0.9  // 弾みの速さの個体差
    crowdAnim.push(mesh)
    return mesh // 動く旅人(cityWalkers)等が参照して動かせるよう返す
  }
  // ── 城下を歩く旅人（cityWalkers専用）＝mkCrowdPersonを「脚が振れる」版に。胴＋腕＋頭は1メッシュにbake（腕は静止）、
  //    脚だけ左右2グループで股支点に振る＝歩みで脚を交互に運び「滑る蝋人形」を脱す。動く人は各城下で十数体＝描画コール増は限定的。──
  const mkWalkerFig = (px, py, pz, bodyCol, sc = 0.7) => {
    const skinHex = 0xe6c6a4, hairHex = 0x2a1f18
    const legHex = new THREE.Color(bodyCol).multiplyScalar(0.62).getHex()
    const g = new THREE.Group(); g.position.set(px, py, pz); g.rotation.y = R() * 6.28; g.scale.setScalar(sc)
    const paint = (geo, hex) => { const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo }
    // 胴＋首＋頭＋髪＋目＋腕（静止）＝1メッシュ。座標は mkCrowdPerson に合わせる。
    const bg = []
    bg.push(paint(new THREE.CylinderGeometry(0.2, 0.165, 0.34, 9).toNonIndexed().translate(0, 1.0, 0), bodyCol)) // 胸
    bg.push(paint(new THREE.CylinderGeometry(0.165, 0.2, 0.34, 9).toNonIndexed().translate(0, 0.69, 0), legHex)) // 腰
    { const sh = new THREE.SphereGeometry(0.205, 9, 6).toNonIndexed(); sh.scale(1.0, 0.4, 0.62); sh.translate(0, 1.16, 0); bg.push(paint(sh, bodyCol)) } // 肩
    bg.push(paint(new THREE.CylinderGeometry(0.044, 0.052, 0.13, 6).toNonIndexed().translate(0, 1.225, 0), skinHex)) // 首（高く）
    { const hd = new THREE.SphereGeometry(0.15, 10, 8).toNonIndexed(); hd.scale(0.95, 1.07, 0.96); hd.translate(0, 1.36, 0); bg.push(paint(hd, skinHex)) } // 頭
    bg.push(paint(new THREE.SphereGeometry(0.163, 9, 7, 0, 6.2832, 0, Math.PI * 0.62).toNonIndexed().translate(0, 1.395, -0.04), hairHex)) // 髪（後上へ）
    for (const s of [-1, 1]) bg.push(paint(new THREE.SphereGeometry(0.023, 5, 4).toNonIndexed().translate(s * 0.05, 1.362, 0.132), hairHex)) // 目
    bg.push(paint(new THREE.SphereGeometry(0.021, 5, 4).toNonIndexed().translate(0, 1.33, 0.15), 0xd8b493)) // 鼻
    bg.push(paint(new THREE.BoxGeometry(0.05, 0.012, 0.012).toNonIndexed().translate(0, 1.298, 0.138), 0x9a6a58)) // 口
    for (const s of [-1, 1]) bg.push(paint(new THREE.SphereGeometry(0.026, 5, 4).toNonIndexed().translate(s * 0.142, 1.34, -0.005), skinHex)) // 耳
    const aM = new THREE.Matrix4()
    for (const s of [-1, 1]) { // 腕＝上腕＋前腕（肘で前へ）＋手先。mkCrowdPersonと同じ座標
      const arm = new THREE.CylinderGeometry(0.032, 0.036, 0.34, 5).toNonIndexed(); aM.makeRotationZ(s * 0.08).setPosition(s * 0.205, 0.95, 0.01); arm.applyMatrix4(aM); bg.push(paint(arm, bodyCol))
      const fore = new THREE.CylinderGeometry(0.027, 0.032, 0.30, 5).toNonIndexed(); aM.makeRotationX(-0.30).setPosition(s * 0.215, 0.66, 0.055); fore.applyMatrix4(aM); bg.push(paint(fore, bodyCol))
      bg.push(paint(new THREE.SphereGeometry(0.043, 6, 5).toNonIndexed().translate(s * 0.218, 0.52, 0.10), skinHex)) }
    if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(bg, false); if (m) { const body = new THREE.Mesh(m, crowdMat); body.castShadow = true; g.add(body) } bg.forEach((q) => q.dispose()) }
    // 脚×2（股支点＝y0.56で振れる）。すね＋足を1メッシュに。
    const legs = []
    for (const s of [-1, 1]) { const lg = new THREE.Group(); lg.position.set(s * 0.095, 0.56, 0)
      const lgeo = [paint(new THREE.CylinderGeometry(0.075, 0.058, 0.5, 6).toNonIndexed().translate(0, -0.25, 0), legHex), paint(new THREE.BoxGeometry(0.1, 0.05, 0.18).toNonIndexed().translate(0, -0.5, 0.055), legHex)]
      const lm = BufferGeometryUtils.mergeGeometries ? BufferGeometryUtils.mergeGeometries(lgeo, false) : lgeo[0]
      const leg = new THREE.Mesh(lm || lgeo[0], crowdMat); leg.castShadow = true; lgeo.forEach((q) => { if (q !== leg.geometry) q.dispose() }); lg.add(leg); g.add(lg); legs.push(lg) }
    if (Math.hypot(px, pz) > 58) { const csh = new THREE.Mesh(crowdShadowGeo, contactShadowMat); csh.rotation.x = -Math.PI / 2; csh.position.y = 0.05; csh.renderOrder = 3; g.add(csh) } // 足元の柔らかい影（時代エリアは静的焼き影の外）
    g.userData = { legs, walker: true } // walker=true＝crowdAnimの近接微揺れ対象外（cityWalkerが自前で動かす）
    town.add(g)
    return g
  }
  // 祭りの会場を「平らに造成した土の広場」の上に据える。斜面/坂でも水平な地面を一枚敷き、その上に会場と人を乗せる
  // （道や坂のど真ん中でやぐらが傾く・周回する踊り手が浮き沈みする、を根絶。下手側の側面は土留めの擁壁に見える＝造成地らしさ）。
  const festPad = (fx, fz, padR) => {
    const padY = heightAt(fx, fz) // 中心の地面高さを会場の水平面とする
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(padR, padR, 9, 36), toon(0xcdbd96)) // 突き固めた土の広場（校庭/境内の地面色）。十分に深い円柱＝下手側でも地面の隙間が出ない
    pad.position.set(fx, padY - 4.5 + 0.05, fz); pad.receiveShadow = true; pad.renderOrder = -0.2; town.add(pad)
    return padY + 0.05 // 会場の全要素はこの水平面の上に置く
  }
  const makeFestival = (fx, fz, sc = 1, compact = false) => { // sc=会場の広さに合わせた縮尺（狭い校庭は小さめ）。compact=狭い広場用に屋台を省き広場内に収める
    const padR = compact ? (9.5 * sc + 3.5) : (12 * sc + 4) // 会場の外側に開けた土の余白を取る＝「広い祭り会場」の見え（屋台/提灯の外まで地面が続く）
    const fgy = festPad(fx, fz, padR), woodMat = toon(0x9a7048), redMat = toon(0xc0392b)
    const yag = new THREE.Group(); yag.position.set(fx, fgy, fz); town.add(yag) // やぐら（二段の木の櫓＋紅白幕＋太鼓＋宝形屋根）
    for (const lx of [-1.8, 1.8]) for (const lz of [-1.8, 1.8]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.6, 0.25), woodMat); leg.position.set(lx, 2.3, lz); leg.castShadow = true; yag.add(leg) }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.3, 4.4), woodMat); deck.position.y = 3.3; deck.castShadow = true; yag.add(deck)
    const mc = document.createElement('canvas'); mc.width = 48; mc.height = 8; const mcx = mc.getContext('2d'); for (let i = 0; i < 6; i++) { mcx.fillStyle = i % 2 ? '#c0392b' : '#f0ece0'; mcx.fillRect(i * 8, 0, 8, 8) }
    const mtex = new THREE.CanvasTexture(mc); mtex.wrapS = THREE.RepeatWrapping; mtex.repeat.set(8, 1)
    const maku = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.8, 4, 1, true), new THREE.MeshToonMaterial({ map: mtex, gradientMap: grad, side: THREE.DoubleSide })); maku.rotation.y = Math.PI / 4; maku.position.y = 4.6; yag.add(maku) // 紅白幕
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.0, 12), redMat); drum.rotation.z = Math.PI / 2; drum.position.y = 4.1; yag.add(drum) // 太鼓
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.6, 4), toon(0x55585e)); roof.rotation.y = Math.PI / 4; roof.position.y = 5.8; roof.castShadow = true; yag.add(roof)
    // 放射状の提灯（やぐら頂上→周囲のポールへ。黄/赤/青。夜は灯る）
    const lantCols = [toon(0xe8a838), redMat, toon(0x3a8ac0)], lantLit = [0xffd27a, 0xff8a6a, 0x8ac0e8], NP = LIGHT ? 5 : 8, poleR = 9.5 * sc, lit = isNight || duskAmt > 0.3
    const poleGeos = [], lanGeos = [[], [], []]
    for (let i = 0; i < NP; i++) {
      const a = i / NP * 6.283, ppx = fx + Math.cos(a) * poleR, ppz = fz + Math.sin(a) * poleR, pgy = fgy // 平場の上＝提灯ポールも水平に揃う
      const pg2 = new THREE.CylinderGeometry(0.08, 0.1, 5, 6); pg2.translate(ppx, pgy + 2.5, ppz); poleGeos.push(pg2)
      for (let k = 1; k <= 4; k++) { const tt = k / 5, lx2 = fx + (ppx - fx) * tt, lz2 = fz + (ppz - fz) * tt, ly2 = (fgy + 5.8) + ((pgy + 5) - (fgy + 5.8)) * tt - 0.2; const lg = new THREE.CylinderGeometry(0.18, 0.18, 0.34, 8); lg.scale(1, 1.2, 1); lg.translate(lx2, ly2, lz2); lanGeos[k % 3].push(lg) }
    }
    // 外周をぐるりと連ねる提灯の輪（隣り合うポールの間に垂れる列＝夏祭りの華やぎ。夜は灯る。既存のlanGeosへ統合＝描画コール不変）
    for (let i = 0; i < NP; i++) {
      const a0 = i / NP * 6.283, a1 = (i + 1) / NP * 6.283, x0 = fx + Math.cos(a0) * poleR, z0 = fz + Math.sin(a0) * poleR, x1 = fx + Math.cos(a1) * poleR, z1 = fz + Math.sin(a1) * poleR
      for (let k = 0; k < 5; k++) { const tt = (k + 0.5) / 5, lx2 = x0 + (x1 - x0) * tt, lz2 = z0 + (z1 - z0) * tt, ly2 = fgy + 4.9 - Math.sin(tt * Math.PI) * 0.7 // 中央ほど垂れる
        const lg = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8); lg.scale(1, 1.2, 1); lg.translate(lx2, ly2, lz2); lanGeos[(i + k) % 3].push(lg) }
    }
    if (BufferGeometryUtils.mergeGeometries) {
      const pm = BufferGeometryUtils.mergeGeometries(poleGeos, false); if (pm) town.add(new THREE.Mesh(pm, woodMat)); poleGeos.forEach((g) => g.dispose())
      for (let c = 0; c < 3; c++) { if (lanGeos[c].length) { const lm = BufferGeometryUtils.mergeGeometries(lanGeos[c], false); if (lm) town.add(new THREE.Mesh(lm, lit ? new THREE.MeshBasicMaterial({ color: lantLit[c], fog: true }) : lantCols[c])); lanGeos[c].forEach((g) => g.dispose()) } } // 夜は提灯が灯る
    }
    // 屋台×4（暖簾の品書き。夜は灯る）。compact会場(狭い広場)は屋台を省き広場内に収める＝密集地/大通りへはみ出さない
    if (!compact) {
    const stallWords = ['たこやき', 'わたあめ', 'かきごおり', 'やきとり'], stallPos = [[-9, 4], [9, 2], [-4, 11], [6, 10]]
    for (let s = 0; s < 4; s++) {
      const sx = fx + stallPos[s][0] * sc, sz = fz + stallPos[s][1] * sc, sgy = fgy, g = new THREE.Group(); g.position.set(sx, sgy, sz); town.add(g) // 屋台も平場の上
      g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 1.4), toon(0xcdb185)), { castShadow: true }).translateY(0.55))
      g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 1.7), toon([0xc0453a, 0x3a7a5e, 0x3a6a8a, 0xc89030][s])), { castShadow: true }).translateY(2.1))
      for (const bx of [-1.2, 1.2]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 6), toon(0x8a6a48)); post.position.set(bx, 1.05, 0); g.add(post) }
      const scv = document.createElement('canvas'); scv.width = 64; scv.height = 24; const scx = scv.getContext('2d'); scx.fillStyle = '#f0ece0'; scx.fillRect(0, 0, 64, 24); scx.fillStyle = '#c0392b'; scx.font = 'bold 15px sans-serif'; scx.textAlign = 'center'; scx.textBaseline = 'middle'; scx.fillText(stallWords[s], 32, 12)
      const signTex2 = new THREE.CanvasTexture(scv); const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 0.06), lit ? new THREE.MeshBasicMaterial({ map: signTex2, fog: true }) : new THREE.MeshToonMaterial({ map: signTex2, gradientMap: grad, fog: true })); sign.position.set(0, 1.55, 0.75); g.add(sign)
      const stallLan = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 8), lit ? new THREE.MeshBasicMaterial({ color: 0xff9a4a, fog: true }) : redMat); stallLan.scale.y = 1.2; stallLan.position.set(-1.2, 1.8, 0.7); g.add(stallLan)
      if ((s === 0 || s === 3) && !LIGHT) for (let p = 0; p < 3; p++) { const puff = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 6), new THREE.MeshBasicMaterial({ color: 0xf2f0ea, transparent: true, opacity: 0, depthWrite: false, fog: true })); puff.position.set(0.4, 1.4, 0.1); g.add(puff); steamPuffs.push({ mesh: puff, base: 1.4, ph: p * 0.8 + R() * 0.6 }) }
      colliders.push({ x: sx, z: sz, r: 1.6 })
    }
    }
    // 盆踊りの輪（やぐらを囲む人。中心を向き、frameで腕を上げ下げ・体を揺らす）。広い会場を埋めるよう増員＋輪を広げる。
    const yukataCols = [0x3a6a8a, 0xc0453a, 0x6a8a5a, 0xd0b090, 0x8a6aa0], nD = LIGHT ? 10 : 16, dR = 6.6 * sc
    for (let i = 0; i < nD; i++) {
      const a = i / nD * 6.283, dx2 = fx + Math.cos(a) * dR, dz2 = fz + Math.sin(a) * dR, dgy = fgy // 踊り手は平場の上で周回＝浮き沈みしない（人数ぶん均等に並ぶ）
      const d = new THREE.Group(); d.position.set(dx2, dgy, dz2); d.rotation.y = Math.atan2(fx - dx2, fz - dz2); d.scale.setScalar(0.9 + R() * 0.2); town.add(d)
      const yk = yukataCols[i % yukataCols.length], ph = i * 0.5, dy = dgy
      folkSpecs.push({ d, top: yk, ph, y0: dy, cx: fx, cz: fz, rad: dR, ang: a, amp: 0.5 }) // 浴衣の踊り手（makeResident品質＝顔・手足・髪）。frameで両腕を上げ下げし輪になって周回
    }
    // 外周の見物客（踊りの輪と屋台の間に点々と立ち、広い会場をにぎわす。周回せず控えめに揺れる）
    const nW = LIGHT ? 5 : 9
    for (let i = 0; i < nW; i++) {
      const a = (i / nW) * 6.283 + 0.35, wr = (9.6 + R() * 2.6) * sc, wx = fx + Math.cos(a) * wr, wz = fz + Math.sin(a) * wr
      const wd = new THREE.Group(); wd.position.set(wx, fgy, wz); wd.rotation.y = Math.atan2(fx - wx, fz - wz); wd.scale.setScalar(0.92 + R() * 0.18); town.add(wd)
      folkSpecs.push({ d: wd, top: yukataCols[(i + 2) % yukataCols.length], ph: R() * 6.28, y0: fgy, amp: 0.14 }) // 見物客（その場で控えめに揺れる）
    }
    colliders.push({ x: fx, z: fz, r: 2.6 }); spawnAvoid.push({ x: fx, z: fz, r: 7 })
    festivalSpots.push({ x: fx, z: fz, r: 13 }) // 音: この祭りに近づくと囃子が満ちる
  }
  // ── やまゆりホームの「サマフェス」（前庭の広場で。ステージ＋模擬店＋見物の人＝盆踊りと別の地域の催し）。──
  const makeSummerFes = (fx, fz) => {
    const lit = isNight || duskAmt > 0.3, woodMat = toon(0x9a7048)
    const fgy = festPad(fx, fz, 10) // サマフェスも平らな造成広場の上に据える（斜面の傾き・見物客の浮きを防ぐ）
    // ステージ（低い木の台＋背幕＋袖の柱／スピーカー）。広場の奥(-z)に据える。
    const stz = fz - 4.5, stY = fgy
    const stage = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.6, 3), woodMat); stage.position.set(fx, stY + 0.3, stz); stage.castShadow = true; town.add(stage)
    const bc = document.createElement('canvas'); bc.width = 160; bc.height = 48; const bx = bc.getContext('2d')
    const bgr = bx.createLinearGradient(0, 0, 0, 48); bgr.addColorStop(0, '#2b4a6e'); bgr.addColorStop(1, '#1c3350'); bx.fillStyle = bgr; bx.fillRect(0, 0, 160, 48)
    bx.fillStyle = '#e8d9a0'; bx.font = 'bold 26px serif'; bx.textAlign = 'center'; bx.textBaseline = 'middle'; bx.fillText('夏まつり', 80, 25) // 一般的な幕（固有意匠は模さない）
    const btex = new THREE.CanvasTexture(bc); const banner = new THREE.Mesh(new THREE.BoxGeometry(6.6, 2.5, 0.12), lit ? new THREE.MeshBasicMaterial({ map: btex, fog: true }) : new THREE.MeshToonMaterial({ map: btex, gradientMap: grad, fog: true })); banner.position.set(fx, stY + 1.95, stz - 1.4); banner.castShadow = true; town.add(banner)
    for (const sx of [-3.5, 3.5]) { const g = new THREE.Group(); g.position.set(fx + sx, stY, stz - 0.2); town.add(g); g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3, 6), toon(0x4a4640)).translateY(1.5)); const sp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.4), toon(0x2a2724)); sp.position.y = 2.5; g.add(sp) } // 袖のスピーカー
    // ステージの演者×2（手を振る。frameで腕が動く）
    const yukataCols = [0x3a6a8a, 0xc0453a, 0x6a8a5a, 0xd0b090, 0x8a6aa0]
    for (let i = 0; i < 2; i++) { const px = fx + (i ? 1.4 : -1.4), pz = stz + 0.3, d = new THREE.Group(); d.position.set(px, stY + 0.6, pz); d.rotation.y = Math.PI; town.add(d) // 客席(+z)を向く
      const yk = yukataCols[i], ph = i * 1.4, dy = stY + 0.6
      folkSpecs.push({ d, top: yk, ph, y0: dy, amp: 0.6 }) } // ステージの演者（makeResident品質。手を振る）
    // 提灯の列（広場を囲むポール間に渡す。色ごとに統合）
    const lanLit = [0xffd27a, 0xff8a6a, 0x8ac0e8], lanCols = [toon(0xe8a838), toon(0xc0392b), toon(0x3a8ac0)], lanGeos = [[], [], []], poleGeos = []
    const ring = [[-8, 4], [-8, -3], [8, -3], [8, 4], [0, 7]]
    for (let i = 0; i < ring.length; i++) { const px = fx + ring[i][0], pz = fz + ring[i][1], py = fgy; const pg = new THREE.CylinderGeometry(0.07, 0.09, 4, 6); pg.translate(px, py + 2, pz); poleGeos.push(pg)
      const n = (i + 1) % ring.length, nx = fx + ring[n][0], nz = fz + ring[n][1], ny = fgy
      for (let k = 1; k <= 4; k++) { const tt = k / 5, lx = px + (nx - px) * tt, lz = pz + (nz - pz) * tt, ly = (py + 4) + ((ny + 4) - (py + 4)) * tt - 0.5 - Math.sin(tt * Math.PI) * 0.4; const lg = new THREE.CylinderGeometry(0.17, 0.17, 0.32, 8); lg.scale(1, 1.15, 1); lg.translate(lx, ly, lz); lanGeos[k % 3].push(lg) } }
    if (BufferGeometryUtils.mergeGeometries) { const pm = BufferGeometryUtils.mergeGeometries(poleGeos, false); if (pm) town.add(new THREE.Mesh(pm, toon(0x6a5a48))); poleGeos.forEach((g) => g.dispose())
      for (let c = 0; c < 3; c++) if (lanGeos[c].length) { const lm = BufferGeometryUtils.mergeGeometries(lanGeos[c], false); if (lm) town.add(new THREE.Mesh(lm, lit ? new THREE.MeshBasicMaterial({ color: lanLit[c], fog: true }) : lanCols[c])); lanGeos[c].forEach((g) => g.dispose()) } }
    // 模擬店×3（野菜販売・ゲーム・わたあめ＝地域のサマフェスらしく）
    const fesWords = ['やさい', 'ゲーム', 'わたあめ'], fesPos = [[-7, 2], [7, 1], [-4, 7]], awnCols = [0x3a7a5e, 0xc0453a, 0xc89030]
    for (let s = 0; s < 3; s++) { const sx = fx + fesPos[s][0], sz = fz + fesPos[s][1], sgy = fgy, g = new THREE.Group(); g.position.set(sx, sgy, sz); g.rotation.y = Math.atan2(fx - sx, fz - sz); town.add(g)
      g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.3), toon(0xcdb185)), { castShadow: true }).translateY(0.5))
      g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 1.6), toon(awnCols[s])), { castShadow: true }).translateY(2.0))
      for (const bxp of [-1.2, 1.2]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), toon(0x8a6a48)); post.position.set(bxp, 1.0, 0); g.add(post) }
      const scv = document.createElement('canvas'); scv.width = 64; scv.height = 24; const scx = scv.getContext('2d'); scx.fillStyle = '#f0ece0'; scx.fillRect(0, 0, 64, 24); scx.fillStyle = '#1f6e4a'; scx.font = 'bold 15px sans-serif'; scx.textAlign = 'center'; scx.textBaseline = 'middle'; scx.fillText(fesWords[s], 32, 12)
      const stex = new THREE.CanvasTexture(scv); const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.68, 0.06), lit ? new THREE.MeshBasicMaterial({ map: stex, fog: true }) : new THREE.MeshToonMaterial({ map: stex, gradientMap: grad, fog: true })); sign.position.set(0, 1.5, 0.72); g.add(sign)
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8), lit ? new THREE.MeshBasicMaterial({ color: 0xff9a4a, fog: true }) : toon(0xc0392b)); lan.position.set(-1.2, 1.7, 0.66); g.add(lan)
      colliders.push({ x: sx, z: sz, r: 1.5 }) }
    // 見物の人（ステージを向いて集まる）
    for (let i = 0; i < (LIGHT ? 6 : 9); i++) { const ang = (R() - 0.5) * 2.2, rad = 2.6 + R() * 4.2, cx2 = fx + Math.sin(ang) * rad, cz2 = fz + 1.5 + Math.cos(ang) * rad * 0.6, cgy = fgy
      const d = new THREE.Group(); d.position.set(cx2, cgy, cz2); d.rotation.y = Math.atan2(fx - cx2, stz - cz2); d.scale.setScalar(0.9 + R() * 0.2); town.add(d) // ステージを向く
      const yk = yukataCols[i % yukataCols.length], ph = R() * 6.28, dy = cgy
      folkSpecs.push({ d, top: yk, ph, y0: dy, amp: 0.16 }) } // 浴衣の見物客（makeResident品質。控えめに揺れて生気）
    colliders.push({ x: fx, z: stz, r: 3.6 }); spawnAvoid.push({ x: fx, z: fz, r: 8 })
    festivalSpots.push({ x: fx, z: fz, r: 13 }) // 音: サマフェスにも近づくと囃子が満ちる
  }

  // ── 起伏する地面（谷へ下る坂の街の地面） ──
  {
    const g = new THREE.PlaneGeometry(470, 540, 124, 142) // 旗艦homeの広い地面（分割は性能優先で抑える＝三角形を減らす。谷/川は十分滑らか）
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      pos.setY(i, heightAt(x, z))
    }
    g.computeVertexNormals()
    // 地面に頂点色で「大きな草地のムラ」を焼く＝タイル反復を断ち、平地は緑・斜面や乾き地は土が覗く自然な地面へ
    // （実機FB: 広いベタ土＋ランダムな暗い染みが殺風景でテクスチャがずれて見える、への対応）。位置ベースの滑らかノイズで主R()は消費しない。
    const snow = weather === 'snow'
    const cGrass = new THREE.Color(snow ? 0xe8eef0 : season === 'spring' ? 0x8fb05a : season === 'autumn' ? 0xa6924c : 0x7f9a50) // 平地の草（くすませつつ少し豊かな緑）
    const cDry = new THREE.Color(snow ? 0xdde4e7 : season === 'spring' ? 0xa9ab69 : season === 'autumn' ? 0x9c7f42 : 0x9b9560) // 乾いた草地
    const cEarth = new THREE.Color(snow ? 0xd2d9dc : season === 'winter' ? 0x9c968c : 0x8a7550) // 斜面に覗く土
    const cSand = new THREE.Color(snow ? 0xd9d8d1 : 0xccbd98) // 渚の砂（東岸の汀ほど強い＝草地の斜面でなく本物の浜に）
    const cWet = new THREE.Color(snow ? 0xb9c0bf : 0x8f8467) // 波打ち際の濡れ砂（水際だけ一段暗く湿る＝乾いた砂と海の境目に本物の汀の帯）
    const nrm = g.attributes.normal, gcol = [], tmpG = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), ny = nrm.getY(i)
      const slope = Math.max(0, Math.min(1, (1 - ny) * 3.0)) // 法線から傾斜（0平地〜1急）
      const zone = 0.5 + 0.5 * Math.sin(x * 0.045 + 0.7) * Math.cos(z * 0.037 - 0.4) + 0.16 * Math.sin(x * 0.11 - z * 0.09) // 草むら/乾き地のゆらぎ（大スケール）
      const dry = Math.max(0, Math.min(1, zone))
      tmpG.copy(cGrass).lerp(cDry, dry * 0.66) // 草地→乾いた草地
      tmpG.lerp(cEarth, slope * 0.82) // 斜面ほど土が覗く
      if (x > SEA.coast) { const beach = Math.max(0, Math.min(1, 1 - (pos.getY(i) - SEA.level) / 9)); if (beach > 0.01) { tmpG.lerp(cSand, beach * 0.82); const wet = Math.max(0, Math.min(1, 1 - (pos.getY(i) - SEA.level) / 2.4)); if (wet > 0.01) tmpG.lerp(cWet, wet * 0.7) } } // 東岸の渚＝汀ほど砂色＋水際は濡れ砂で一段暗く（乾砂と海の境に汀の帯）
      const v = 0.95 + 0.1 * Math.sin(x * 0.7 + z * 0.55) // 細かな明暗（水彩の手触り）
      gcol.push(tmpG.r * v, tmpG.g * v, tmpG.b * v)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3))
    // テクスチャは「細かい草目」を高反復で（大スケールは頂点色が担うのでタイル感が出ない）。grazing角を綺麗にする異方性も付与。
    const gm = mottleMat(0xffffff, 150, 0.1, [42, 46]); gm.vertexColors = true // 反復を上げ近接(主観視点)で地面の細部が出る（粗い反復は1タイル超拡大で平滑にボケる）
    if (gm.map) { gm.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); gm.map.needsUpdate = true }
    const ground = new THREE.Mesh(g, gm)
    ground.receiveShadow = true
    town.add(ground)
  }
  // 中央の通り（舗装。電柱が沿い、車・人が行き交う）。地形に沿うリボン。街のみ。
  if (kind !== 'yato') {
    const rg = new THREE.PlaneGeometry(7.5, 130, 4, 56); rg.rotateX(-Math.PI / 2) // 幅方向も4分割して地形に沿わせる（1分割だと横断勾配で路面中央に地面が最大28cm突き抜けていた）
    const rp = rg.attributes.position
    const rcol = []
    for (let i = 0; i < rp.count; i++) {
      const lx = rp.getX(i), lz = rp.getZ(i)
      rp.setY(i, heightAt(lx, lz - 35) + 0.07)
      // 低周波の路面の濃淡（補修跡・日焼け・轍の汚れ）。テクスチャの反復に乗らない地形ベースの長い
      // うねりで、のっぺり灰の平面を脱して「使い込まれた路面」に（俯瞰で効く）。
      const m = Math.min(1, 0.9 + 0.15 * Math.sin(lz * 0.16 + 1.3) + 0.08 * Math.sin(lz * 0.43 + lx)) // 1.0で頭打ち＝明部が白飛びしない（暗い補修跡だけ残す）
      rcol.push(m, m, m)
    }
    rg.setAttribute('color', new THREE.Float32BufferAttribute(rcol, 3))
    rg.computeVertexNormals()
    // 舗装テクスチャ: アスファルトのムラ＋黄色のセンターライン（破線）＋路肩線（実写の路面標示。メッシュ増なし）
    const rtc = document.createElement('canvas'); rtc.width = 64; rtc.height = 256
    const rtx = rtc.getContext('2d')
    rtx.fillStyle = '#474750'; rtx.fillRect(0, 0, 64, 256)
    for (let i = 0; i < 70; i++) { const v = 58 + ((R() * 34) | 0); rtx.fillStyle = `rgba(${v},${v},${v + 5},0.16)`; rtx.fillRect(R() * 64, R() * 256, 2 + R() * 7, 2 + R() * 12) }
    rtx.fillStyle = 'rgba(206,196,150,0.55)'; for (let y = 0; y < 256; y += 44) rtx.fillRect(31, y + 8, 3, 22) // 黄色のセンターライン（破線）
    rtx.fillStyle = 'rgba(198,198,198,0.26)'; rtx.fillRect(6, 0, 2, 256); rtx.fillRect(56, 0, 2, 256) // 路肩線
    const roadTex = new THREE.CanvasTexture(rtc); roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping; roadTex.repeat.set(1, 8)
    // トゥーン材＝周りの舗装(mottleMat)と同じ平坦な光の乗り。Lambertは陽光を全受けして路面だけ白飛び/夕方に金色へ浮いていた（評価アート）。
    const road = new THREE.Mesh(rg, snowify(new THREE.MeshToonMaterial({ map: roadTex, gradientMap: grad, vertexColors: true })))
    road.position.z = -35; road.receiveShadow = true; town.add(road)
    // 縁石（道の両肩）。短い箱を地形に沿って並べ1メッシュへ統合＝歩くと路肩が立ち、街路が地に着く。
    {
      const curbGeos = []
      for (const sideC of [-1, 1]) {
        for (let z = 28; z > -98; z -= 2.4) {
          const cx = sideC * 3.95, y0 = heightAt(cx, z - 1.25), y1 = heightAt(cx, z + 1.25) // 両端の高さで傾ける（segAlleyと同じ作法）＝坂で縁石の端が浮かない
          const seg = new THREE.BoxGeometry(0.34, 0.22, 2.5)
          const cm4 = new THREE.Matrix4().makeRotationX(-Math.atan2(y1 - y0, 2.5))
          cm4.setPosition(cx, (y0 + y1) / 2 + 0.11, z)
          seg.applyMatrix4(cm4)
          curbGeos.push(seg)
        }
      }
      if (BufferGeometryUtils.mergeGeometries) {
        const cm = BufferGeometryUtils.mergeGeometries(curbGeos, false)
        if (cm) { const curb = new THREE.Mesh(cm, mottleMat(season === 'winter' ? 0xc4c0b6 : 0xb6b0a4, 70, 0.08, [3, 1])); curb.receiveShadow = true; town.add(curb) } // 縁石に淡いコンクリのムラ＝近接で使い込まれた路肩の質感
      }
      curbGeos.forEach((g) => g.dispose())
    }
    // カーブミラー（曲がり角の凸面鏡）＝日本の生活道路の象徴。ポール＋橙の枠＋淡い鏡面。
    {
      const mPole = toon(0x8f8f8f), mRing = toon(0xcf7a2e), mGlass = toon(0xc2ccd2)
      for (const [mx, mz] of [[4.8, 7], [-4.8, -13], [5.3, -31], [-5.1, -49], [4.9, -67], [-5.0, 19]]) {
        const gym = heightAt(mx, mz), grp = new THREE.Group()
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 2.7, 6), mPole); pole.position.y = 1.35; grp.add(pole)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 16), mRing); ring.position.y = 2.55; grp.add(ring)
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.37, 16), mGlass); disc.position.set(0, 2.55, 0.03); grp.add(disc)
        grp.position.set(mx, gym, mz); grp.rotation.y = mx > 0 ? -0.6 : 0.6; town.add(grp)
      }
    }
    // 横の通り（数本）。アスファルトのムラ材を共有＝ベタ灰の平面を脱す（俯瞰で映える路面の質感）。
    const crossMat = mottleMat(0x474750, 80, 0.12, [6, 2])
    for (const cz of [-6, -28, -50]) {
      const cg = new THREE.PlaneGeometry(120, 6, 48, 1); cg.rotateX(-Math.PI / 2)
      const cp = cg.attributes.position
      for (let i = 0; i < cp.count; i++) { const lx = cp.getX(i), lz = cp.getZ(i); cp.setY(i, heightAt(lx, lz + cz) + 0.06) }
      cg.computeVertexNormals()
      const cr = new THREE.Mesh(cg, crossMat); cr.position.z = cz; cr.receiveShadow = true; town.add(cr)
    }
    // 横断歩道（手前の交差点に白い縞＝近景の路面標示・生活感。路面のすぐ上に薄板で）
    const cwMat = new THREE.MeshLambertMaterial({ color: 0xc8c4ba })
    for (let i = 0; i < 5; i++) {
      const bz = -3.4 - i * 0.62
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.03, 0.34), cwMat)
      stripe.position.set(0, heightAt(0, bz) + 0.085, bz); town.add(stripe)
    }
    // マンホール（路面の轍に沿って点々と＝近景の生活痕。鉄蓋の濃灰）
    const mhMat = toon(0x47474c)
    for (const [mx, mz] of [[-1.4, 3], [1.5, -9], [-1.6, -23], [1.3, -37], [-1.4, -51], [1.5, -67]]) {
      const mh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), mhMat)
      mh.position.set(mx, heightAt(mx, mz) + 0.06, mz); town.add(mh)
    }
    // 停止線（横断歩道の手前の白い太線＝交差点の標示）
    const stopMat = new THREE.MeshLambertMaterial({ color: 0xd2cec4 })
    for (const sz of [-7.4, -29.4, -51.4]) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.03, 0.42), stopMat)
      sl.position.set(0, heightAt(0, sz) + 0.085, sz); town.add(sl)
    }
    // 側溝（縁石の内側の暗いコンクリ溝＝路肩の締まり）。地形に沿わせ1メッシュへ統合。
    {
      const gutGeos = []
      for (const sideU of [-1, 1]) {
        for (let z = 28; z > -98; z -= 2.4) {
          const gx = sideU * 3.55, gy3 = heightAt(gx, z)
          const seg = new THREE.BoxGeometry(0.42, 0.05, 2.5)
          seg.applyMatrix4(new THREE.Matrix4().makeTranslation(gx, gy3 + 0.065, z))
          gutGeos.push(seg)
        }
      }
      if (BufferGeometryUtils.mergeGeometries) {
        const gum = BufferGeometryUtils.mergeGeometries(gutGeos, false)
        if (gum) { const gutter = new THREE.Mesh(gum, toon(0x6e6c68)); gutter.receiveShadow = true; town.add(gutter) }
      }
      gutGeos.forEach((g) => g.dispose())
    }
  }

  // ── 建物・ランドマーク（低ポリの箱＋切妻屋根）。街のみ（谷戸では作らない）。 ──
  if (kind !== 'yato') {
  // 壁色は全て淡い同系ベージュだと俯瞰で街が「均一な箱の群れ」に見える（屋根は色幅があるのに壁が単調）。
  // 色相（青灰・セージ・くすんだテラコッタ）と明度（暗めのアンカー数棟＋オフ白）に幅を出す。
  // 全て低彩度に抑え、共通グレードで街全体が一つの空気にまとまる前提（彩度はグレードが整える）。
  const wallCols = [
    0xd8cfbf, // 温かい白灰
    0xcec0af, // ベージュ
    0xc2b4a4, // 温かいトープ
    0xbcc0b6, // 灰緑
    0xaab2b8, // 淡い青灰（寒色の変化＝日本家屋のサイディング/瓦）
    0xb6a892, // 深いトープ（やや暗く＝明度の幅で街を締める）
    0xcabb9f, // クリームタン
    0xa9a094, // 中明度の灰褐（暗部のアンカー）
    0xc7a695, // くすんだテラコッタ（暖色の差し色・ごく控えめ）
    0xa7b09c, // くすんだセージ（緑がかった壁）
    0xe2ddd0, // オフホワイト（明るい壁＝明度の上側）
  ]
  const roofCols = [0x59636e, 0x7a5e50, 0x4e5660, 0x6a6258, 0x5e6a5c, 0x86766a] // くすんだ瓦（スレート青/テラコッタ/紺/灰/苔/茶）
  // 屋根は色ごとに質感テクスチャ（瓦の濃淡・苔・経年のムラ）を1枚ずつ共有＝見下ろしの屋根のベタ塗りを解消
  const roofMats = roofCols.map((c) => mottleMat(c, 60, 0.13, [3, 2]))
  // 屋上・壁の雑多な設備（室外機/水タンク/塔屋/アンテナ）の共有マテリアル＝見下ろしの密度＝実写の生活感。
  const acMat = toon(0xd8d4c6), tankMat = toon(0x6e6a64), phMat = toon(0x8a8478), antMat = toon(0x46464c)
  // 屋上に干す布団の色（くすんだ生活色・上から見下ろす窓に映える彩り）。
  const futonCols = [0x9fb0c4, 0xc9a6b0, 0xc4bca0, 0xd8c8a0, 0xb0b8a8, 0xd0cabc]
  // 屋上のささやかな緑（プランター菜園・鉢＝俯瞰で映える生活の緑）。
  const gardenCols = [0x6a8a4a, 0x7e9850, 0x5c7c42]
  // 屋上設備は色を頂点色で焼いて1棟あたり1メッシュへ統合＝描画コール削減（実機の重さ対策）。混在材質を束ねる共有トゥーン材。
  const clutterMat = toon(0xffffff); clutterMat.vertexColors = true
  const colGeo = (geo, hex) => { const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b }; geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo }
  const bakeColGeo = (arr, geo, hex, lx, ly, lz) => { geo.translate(lx, ly, lz); arr.push(colGeo(geo, hex)) }
  const acGeos = [] // 全建物の壁の室外機＋太陽熱温水器を1メッシュへ統合（頂点色で焼く）＝描画コール削減
  const bldgOutlineGeos = [] // 現代homeの建物の輪郭線を1メッシュへ統合（523本→数本＝最大の描画コール削減。時代の輪郭は群に残す）
  const roofGeosByMat = roofMats.map(() => []) // 家の瓦屋根を材質ごとに統合（~250メッシュ→材質数個）＝描画コール削減
  // 陸屋根の屋上に雑多な設備を載せる（1棟＝1メッシュに統合して描画数を抑える）。
  function addRoofClutter(g, w, d, h) {
    const cg = [] // 屋上設備を1メッシュへ統合（色は頂点色で焼く）＝1棟あたり多数→1の描画コール
    // パラペット（陸屋根の立ち上がり縁）＝天面に縁取りの段差を付け「のっぺりした箱の天面」を脱す。統合メッシュに焼くので描画コール不変（アート監督C1）。
    const pw = 0.18, pph = 0.46
    for (const [ox, oz, sw, sd] of [[0, d * 0.5, w + pw, pw], [0, -d * 0.5, w + pw, pw], [w * 0.5, 0, pw, d + pw], [-w * 0.5, 0, pw, d + pw]]) bakeColGeo(cg, new THREE.BoxGeometry(sw, pph, sd), 0x827e78, ox, h + 0.14, oz)
    bakeColGeo(cg, new THREE.BoxGeometry(w * 0.3, 1.6, d * 0.3), 0x8a8478, (R() - 0.5) * w * 0.4, h + 0.8, (R() - 0.5) * d * 0.4) // 塔屋（階段室）
    bakeColGeo(cg, new THREE.CylinderGeometry(d * 0.15, d * 0.15, 1.3, 8), 0x6e6a64, w * 0.28, h + 0.9, -d * 0.2) // 水タンク
    const nAc = 1 + ((R() * 2) | 0) // 室外機 1〜2
    for (let i = 0; i < nAc; i++) bakeColGeo(cg, new THREE.BoxGeometry(0.9, 0.6, 0.5), 0xd8d4c6, (R() - 0.5) * w * 0.6, h + 0.55, (R() - 0.5) * d * 0.6)
    if (R() < 0.55) bakeColGeo(cg, new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4), 0x46464c, -w * 0.3, h + 1.5, d * 0.25) // アンテナ
    // 屋上に布団を干す（窓から見下ろすと映える生活の彩り）。晴天の昼夕のみ・雪は除く。
    if (!SNOW && R() < 0.5) { const nf = 1 + ((R() * 3) | 0); for (let i = 0; i < nf; i++) { const fw = w * 0.26 + R() * w * 0.16, fd = d * 0.34 + R() * d * 0.12; bakeColGeo(cg, new THREE.BoxGeometry(fw, 0.09, fd), futonCols[(R() * futonCols.length) | 0], (R() - 0.5) * w * 0.5, h + 0.07, (R() - 0.5) * d * 0.45) } }
    // 屋上のささやかな菜園（プランターの緑が点々）。雪は除く・一部の屋上に。
    if (!SNOW && R() < 0.24) { const ng = 2 + ((R() * 2) | 0), bx = (R() - 0.5) * w * 0.4, bz = (R() - 0.5) * d * 0.4; for (let i = 0; i < ng; i++) bakeColGeo(cg, new THREE.BoxGeometry(0.5 + R() * 0.28, 0.17, 0.32), gardenCols[(R() * gardenCols.length) | 0], bx + (R() - 0.5) * 0.5, h + 0.1, bz + i * 0.42 - 0.2) }
    if (cg.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(cg, false); if (m) { const me = new THREE.Mesh(m, clutterMat); me.castShadow = true; g.add(me) } cg.forEach((x) => x.dispose()) }
  }
  // 壁面の縦グラデを頂点色で（足元=接地のAOで翳り→上=空の光で明るい）。平らな箱面の一様さを破り、
  // 接地感と大気の奥行きを足して「低ポリの箱」感を脱す。頂点色なので描画コストは増えない。
  function wallAO(geo, hh) {
    const pos = geo.attributes.position
    const col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, (pos.getY(i) + hh / 2) / Math.max(0.001, hh))) // 0=底 1=上
      const ao = Math.min(1, t / 0.26)                 // 下26%で接地の翳り
      const v = 0.72 + 0.28 * ao + 0.06 * t            // 底0.72→中1.0→上1.06(空の光)
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  }
  function house(x, z, w, d, h, type) {
    const gy = heightAt(x, z)
    const g = new THREE.Group()
    const propL = [] // 室外機/太陽熱温水器の建物-local素片（回転確定後にグローバル統合）
    const roofL = [] // 瓦屋根の建物-local素片（回転確定後に材質ごとへグローバル統合）
    const wm = toon(wallCols[(R() * wallCols.length) | 0]) // 壁は軽量な拡散材（多数あるため性能優先）
    wm.vertexColors = true // 壁面の縦グラデ（接地AO＋空の光）を頂点色で乗せる
    const rep = Math.max(1, Math.round(w / 2.6)), repV = Math.max(1, Math.round(h / 2.4))
    const wvi = (((Math.floor(x) * 73856093) ^ (Math.floor(z) * 19349663)) >>> 0) % winMapBases.length // 建物ごとに窓の種類を変える（位置ハッシュ＝主R()非消費）
    const m = winMapBases[wvi].clone(); m.repeat.set(rep, repV); m.needsUpdate = true
    wm.map = m
    if (duskAmt > 0.12) { // 夕方は窓が灯る（昼と同じ窓割りの灯り＝wviで揃える）
      R() // 旧来ここで窓種をR()で選んでいた＝乱数列を保ち街の生成（建物分布/描画コール）を不変に保つ
      const e = winEmis[wvi].clone(); e.repeat.set(rep, repV); e.needsUpdate = true
      wm.emissiveMap = e; wm.emissive = new THREE.Color(isNight ? 0xffbe82 : 0xffcaa0); wm.emissiveIntensity = 0.3 + duskAmt * (isNight ? 0.95 : 0.62) // 夜は窓灯りを強めて瞬かせる（夕は控えめで貼り絵感を防ぐ）
    }
    // 近景の建物だけ角を面取りして「低ポリの箱」の鋭い角を脱す（奥は霞むので箱のまま＝軽量）。
    const near = z > -12
    const bodyGeo = near
      ? new RoundedBoxGeometry(w, h, d, 1, Math.min(0.2, Math.min(w, d) * 0.09))
      : new THREE.BoxGeometry(w, h, d)
    wallAO(bodyGeo, h) // 壁の足元を翳らせ上を明るく＝接地と大気の縦グラデ
    const body = new THREE.Mesh(bodyGeo, wm)
    body.position.y = h / 2
    body.castShadow = true; body.receiveShadow = true
    g.add(body)
    const wantOutline = h > 4.6 || type !== 'house' // 大きめの建物のみ輪郭（小さな家は省く）。輪郭は回転確定後にグローバル統合（描画コール削減）
    if (type === 'house') {
      // 切妻 or 寄棟の瓦屋根（色ごとの質感テクスチャを共有）。建物-local空間で焼き、回転確定後に材質ごとへグローバル統合。
      const ri = (R() * roofMats.length) | 0
      if (R() < 0.6) {
        const rg = new THREE.CylinderGeometry(d * 0.72, d * 0.72, w + 0.7, 3, 1) // 軒を深く張り出す（庇の陰影＝箱を脱す）。妻側も少し出す
        rg.rotateZ(Math.PI / 2); rg.rotateY(Math.PI / 2); rg.scale(1, 0.66, 1); rg.translate(0, h + d * 0.30, 0)
        roofL.push({ geo: rg, ri })
      } else {
        const mx = Math.max(w, d), rg = new THREE.ConeGeometry(mx * 0.84, d * 0.62, 4); rg.rotateY(Math.PI / 4) // 寄棟の四方の軒を深く
        rg.scale(w / mx, 1, d / mx); rg.translate(0, h + d * 0.30, 0)
        roofL.push({ geo: rg, ri })
      }
      // 太陽熱温水器（昭和の屋根の象徴）＋壁際の室外機。建物-local空間の素片を溜め、回転確定後にグローバル統合する
      // （R()の順序は従来どおり＝街の見た目は不変。描画コールだけ減らす）。
      if (R() < 0.28) {
        const sx2 = (R() - 0.5) * w * 0.28, sy2 = h + d * 0.3, sz2 = (R() - 0.5) * d * 0.15, tiltM = new THREE.Matrix4().makeRotationX(-0.5), sgM = new THREE.Matrix4().makeTranslation(sx2, sy2, sz2)
        const panel = new THREE.BoxGeometry(w * 0.5, 0.08, d * 0.42); panel.applyMatrix4(tiltM); panel.applyMatrix4(sgM); propL.push({ geo: colGeo(panel, 0x2a3848) }) // 集熱パネル(濃紺)
        const tank = new THREE.CylinderGeometry(0.17, 0.17, w * 0.48, 8); tank.rotateZ(Math.PI / 2); tank.translate(0, 0.22, -d * 0.18); tank.applyMatrix4(tiltM); tank.applyMatrix4(sgM); propL.push({ geo: colGeo(tank, 0xc8c4ba) }) // 貯湯タンク
      }
      if (R() < 0.85) { const ac = new THREE.BoxGeometry(0.8, 0.55, 0.45); ac.translate(w * 0.5 + 0.22, 0.5, (R() - 0.5) * d * 0.5); propL.push({ geo: colGeo(ac, 0xd8d4c6) }) } // 壁際の室外機
      // 玄関（前面=-z局面に。引き戸＋庇＋踏み石＝家が草地に箱で建つ印象を脱す）。propLに溜め、回転後にグローバル統合（1ドロー）。
      { const dx2 = (R() - 0.5) * w * 0.42, df = -d / 2
        const door = new THREE.BoxGeometry(1.04, 1.84, 0.14); door.translate(dx2, 0.92, df - 0.05); propL.push({ geo: colGeo(door, R() < 0.5 ? 0x6a5644 : 0x46545e) }) // 木の引き戸／ガラスの玄関戸
        const canopy = new THREE.BoxGeometry(1.5, 0.12, 0.62); canopy.translate(dx2, 1.96, df - 0.26); propL.push({ geo: colGeo(canopy, 0x8a7e70) }) // 玄関の庇
        const step = new THREE.BoxGeometry(1.3, 0.18, 0.5); step.translate(dx2, 0.09, df - 0.3); propL.push({ geo: colGeo(step, 0xb4ab9c) }) // 踏み石
        // 前庭の低い生垣＋門柱（道に面した家の佇まい）。門の所(玄関の正面)は空ける。
        const fw = df - 0.95, gap = 0.95, hcol = season === 'autumn' ? 0x7a7440 : season === 'winter' ? 0x586a54 : 0x4e7038
        const lw = (dx2 - gap) - (-w / 2 - 0.2), rw = (w / 2 + 0.2) - (dx2 + gap)
        if (lw > 0.5) { const hl = new THREE.BoxGeometry(lw, 0.66, 0.46); hl.translate((-w / 2 - 0.2 + dx2 - gap) / 2, 0.33, fw); propL.push({ geo: colGeo(hl, hcol) }) } // 左の生垣
        if (rw > 0.5) { const hr = new THREE.BoxGeometry(rw, 0.66, 0.46); hr.translate((dx2 + gap + w / 2 + 0.2) / 2, 0.33, fw); propL.push({ geo: colGeo(hr, hcol) }) } // 右の生垣
        for (const gp of [dx2 - gap, dx2 + gap]) { const post = new THREE.BoxGeometry(0.2, 1.05, 0.2); post.translate(gp, 0.52, fw); propL.push({ geo: colGeo(post, 0xb6ab98) }) } // 門柱
        // 出窓・物干しは位置ハッシュ hr() で決定＝主R()列をずらさず街の生成・描画コールを不変に保つ（統合済みのジオメトリだけ足す）。
        let hs = ((Math.round(Math.abs(x) * 8) * 73856093) ^ (Math.round(Math.abs(z) * 8) * 19349663) ^ 0x9e3779b9) >>> 0
        const hr = () => { hs = (hs * 1664525 + 1013904223) >>> 0; return hs / 4294967296 }
        // 出窓（前面から張り出す窓＝フラットな壁を脱し、近接でも凹凸の佇まい）。2階に。
        if (h > 4.2 && hr() < 0.42) { const by = h * 0.64, bx = (hr() < 0.5 ? -1 : 1) * w * 0.26, bz = df - 0.32
          const bay = new THREE.BoxGeometry(1.4, 1.15, 0.64); bay.translate(bx, by, bz); propL.push({ geo: colGeo(bay, 0xe6ddc8) }) // 出窓の箱
          const bayLit = isNight || duskAmt > 0.36, bayTv = bayLit && hr() < 0.22 // 一部はテレビの青（部屋ごとに違う暮らし）
          const bglass = new THREE.BoxGeometry(1.16, 0.84, 0.06); bglass.translate(bx, by, bz - 0.33); propL.push({ geo: colGeo(bglass, bayLit ? (bayTv ? 0x9fbfe0 : 0xffcaa0) : 0x46545e) }) // ガラス（夕暮れ〜夜は灯る色＝在宅の気配。青=テレビ）
          const broof = new THREE.BoxGeometry(1.6, 0.12, 0.82); broof.translate(bx, by + 0.62, bz + 0.04); propL.push({ geo: colGeo(broof, 0x8a7e70) }) } // 出窓の小屋根
        // 夕暮れに一部の家の窓が暖かく灯る＝在宅の気配（「無人のジオラマ」を脱す最大の合図）。暗い窓と混ぜる。頂点色で焼いて統合（描画コール不変）。
        { const homeLit = (isNight || duskAmt > 0.36) && hr() < 0.62, wy = h > 4.2 ? h * 0.66 : h * 0.5, wx = dx2 + (hr() < 0.5 ? -1 : 1) * w * 0.3
          const wr2 = hr(), winCol = homeLit ? (wr2 < 0.2 ? 0x9fbfe0 : wr2 < 0.34 ? 0xffb464 : 0xffcb8e) : 0x39454f // 灯る窓（青=テレビ/濃い橙=台所/淡い暖色=居間）or 暗い窓
          const win = new THREE.BoxGeometry(0.82, 0.66, 0.05); win.translate(wx, wy, df - 0.05); propL.push({ geo: colGeo(win, winCol) }) // 灯る窓 or 暗い窓
          const sash = new THREE.BoxGeometry(0.9, 0.06, 0.06); sash.translate(wx, wy - 0.34, df - 0.06); propL.push({ geo: colGeo(sash, 0xe8e0ce) }) } // 窓の下桟
        // 玄関先の植木鉢（手入れされている気配）。素焼きの鉢＋緑の株。
        if (hr() < 0.5) { const px2 = dx2 + (hr() < 0.5 ? 0.78 : -0.78), pz2 = df - 0.42
          const pot = new THREE.CylinderGeometry(0.15, 0.12, 0.26, 7); pot.translate(px2, 0.13, pz2); propL.push({ geo: colGeo(pot, 0xb07a52) })
          const grn = new THREE.SphereGeometry(0.2, 7, 6); grn.scale(1, 1.2, 1); grn.translate(px2, 0.4, pz2); propL.push({ geo: colGeo(grn, season === 'autumn' ? 0x9a8a3a : 0x5f8a44) }) }
        // 物干し竿＋洗濯物（2階の前＝昭和平成の生活感・前面の奥行き）
        if (h > 4.2 && !SNOW && hr() < 0.4) { const py = h - 0.85, pz = df - 0.55
          for (const px of [-w * 0.3, w * 0.3]) { const pole = new THREE.BoxGeometry(0.05, 0.72, 0.05); pole.translate(px, py + 0.36, pz); propL.push({ geo: colGeo(pole, 0x9a958c) }) }
          const bar = new THREE.BoxGeometry(w * 0.64, 0.04, 0.04); bar.translate(0, py + 0.7, pz); propL.push({ geo: colGeo(bar, 0xb0aaa0) }) // 竿
          const nL = 1 + ((hr() * 3) | 0); for (let k = 0; k < nL; k++) { const lw = 0.28 + hr() * 0.3, laundry = new THREE.BoxGeometry(lw, 0.46, 0.04); laundry.translate(-w * 0.26 + k * 0.5, py + 0.42, pz); propL.push({ geo: colGeo(laundry, futonCols[(hr() * futonCols.length) | 0]) }) } } } // 洗濯物（と玄関ブロックを閉じる）
    } else if (type === 'apt') {
      // 団地・アパート：陸屋根＋前面のベランダ（手すり付き＝平成の集合住宅）
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.5, d * 1.04), toon(0x8a8478)); cap.position.y = h + 0.25; cap.castShadow = true; g.add(cap)
      addRoofClutter(g, w, d, h + 0.5) // 屋上に階段室・水タンク・室外機・アンテナ＝生活感
      const floors = Math.max(2, Math.round(h / 2.8))
      const balMat = toon(0xbcb6a8), railMat = toon(0x68686c)
      const futCols = [0x9fb0c4, 0xc9a6b0, 0xc4bca0, 0xb0b8a8, 0xd8c8a0] // 布団・洗濯物のくすんだ色
      // 各階のベランダ床/手すり/布団は同材質なので1棟ごとに統合＝集合住宅1棟あたり描画コールを十数→3に（性能：実機の重さ対策）。
      const slabGeos = [], railGeos = [], futGeos = [], divGeos = [], acGeos = []
      const units = Math.max(2, Math.round(w / 3.2)) // 1フロアあたりの住戸数＝隔て板で割る
      let ahs = ((Math.floor(x) * 73856093) ^ (Math.floor(z) * 19349663)) >>> 0; const ahr = () => { ahs = (ahs * 1664525 + 1013904223) >>> 0; return ahs / 4294967296 } // 位置ハッシュ（室外機の有無＝主R()列を消費しない）
      for (let f = 1; f < floors; f++) {
        const yy = f * (h / floors)
        const sg2 = new THREE.BoxGeometry(w * 0.96, 0.18, 0.9); sg2.translate(0, yy, d / 2 + 0.4); slabGeos.push(sg2)
        const rg2 = new THREE.BoxGeometry(w * 0.96, 0.5, 0.1); rg2.translate(0, yy + 0.32, d / 2 + 0.82); railGeos.push(rg2)
        const rg3 = new THREE.BoxGeometry(w * 0.96, 0.06, 0.14); rg3.translate(0, yy + 0.57, d / 2 + 0.82); railGeos.push(rg3) // 手すりの笠木（上端の水平材）＝のっぺり板を脱す
        // 住戸の隔て板（各戸の境のすりガラス風パネル＝日本のアパートの象徴）。ベランダ幅を units で割る。
        for (let u = 1; u < units; u++) { const dx = -w * 0.48 + (u / units) * w * 0.96; const dv = new THREE.BoxGeometry(0.05, 0.5, 0.82); dv.translate(dx, yy + 0.3, d / 2 + 0.42); divGeos.push(dv) }
        // 室外機（一部の住戸のベランダに＝灰の小箱）
        for (let u = 0; u < units; u++) if (ahr() < 0.32) { const ax = -w * 0.48 + (u + 0.5) / units * w * 0.96; const ac = new THREE.BoxGeometry(0.6, 0.42, 0.32); ac.translate(ax, yy + 0.23, d / 2 + 0.3); acGeos.push(ac) }
        if (R() < 0.4) { // 手すりに布団／洗濯物を干す（生活感）。色は頂点色で焼いて統合
          const fw = w * 0.28 + R() * w * 0.32, fg2 = new THREE.BoxGeometry(fw, 0.66, 0.12); fg2.translate((R() - 0.5) * (w * 0.55), yy + 0.12, d / 2 + 0.88)
          const fcol = new THREE.Color(futCols[(R() * futCols.length) | 0]); const fa = new Float32Array(fg2.attributes.position.count * 3); for (let i = 0; i < fa.length; i += 3) { fa[i] = fcol.r; fa[i + 1] = fcol.g; fa[i + 2] = fcol.b }; fg2.setAttribute('color', new THREE.BufferAttribute(fa, 3)); futGeos.push(fg2)
        }
      }
      if (BufferGeometryUtils.mergeGeometries) {
        if (slabGeos.length) { const m = BufferGeometryUtils.mergeGeometries(slabGeos, false); if (m) { const me = new THREE.Mesh(m, balMat); me.castShadow = true; g.add(me) } slabGeos.forEach((x) => x.dispose()) }
        if (railGeos.length) { const m = BufferGeometryUtils.mergeGeometries(railGeos, false); if (m) g.add(new THREE.Mesh(m, railMat)); railGeos.forEach((x) => x.dispose()) }
        const dacGeos = divGeos.concat(acGeos) // 隔て板＋室外機は1メッシュへ統合（描画コール節約）。淡い灰で兼ねる
        if (dacGeos.length) { const m = BufferGeometryUtils.mergeGeometries(dacGeos, false); if (m) { const me = new THREE.Mesh(m, toon(0xccc9c2)); me.castShadow = true; g.add(me) } dacGeos.forEach((x) => x.dispose()) } // すりガラス風の隔て板＋ベランダの室外機
        if (futGeos.length) { const m = BufferGeometryUtils.mergeGeometries(futGeos, false); if (m) { const fm = toon(0xffffff); fm.vertexColors = true; g.add(new THREE.Mesh(m, fm)) } futGeos.forEach((x) => x.dispose()) }
      }
    } else { // mid: 陸屋根＋屋上設備（塔屋・水タンク・室外機・アンテナ）
      const capCol = [0x9a9488, 0x8e8a82, 0xa39a8c, 0x86827c, 0x938c80][(R() * 5) | 0] // 屋上の色に幅＝一様な灰の陸屋根が連なる「箱の海」を脱す
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.03, 0.4, d * 1.03), toon(capCol)); cap.position.y = h + 0.2; cap.castShadow = true; g.add(cap)
      addRoofClutter(g, w, d, h + 0.4)
    }
    // 1階を店舗に（時々・中層/集合住宅）＝混在用途のにぎわい。庇＋店先のくすんだ色帯
    if ((type === 'mid' || type === 'apt') && h > 6 && R() < 0.34) {
      const sh = 1.9
      const shop = new THREE.Mesh(new THREE.BoxGeometry(w * 1.012, sh, d * 1.012), toon([0xb8a890, 0xa89878, 0xc2b2a0, 0xa8a0a8][(R() * 4) | 0]))
      shop.position.y = sh / 2 + 0.02; g.add(shop)
      const awn = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.12, 0.72), toon([0xb0604a, 0x5e7a5e, 0x4a6a8a, 0xb09a58][(R() * 4) | 0]))
      awn.position.set(0, sh, d / 2 + 0.36); awn.castShadow = true; g.add(awn)
    }
    g.position.set(x, gy, z)
    homeBldgs.push(g) // 霧の彼方の描画カリング対象
    // 屋根の向きを散らす（碁盤の同一方向を崩す）。多くは街路にゆるく沿い、時々大きく振れて棟の向きが変わる。
    g.rotation.y = R() < 0.26 ? (R() - 0.5) * 1.5 : (R() - 0.5) * 0.5
    // 溜めた室外機/太陽熱温水器を建物の回転・位置で焼き込み、グローバル統合用の acGeos へ（1棟ごとの別メッシュを廃す）。
    if (propL.length) { const rM = new THREE.Matrix4().makeRotationY(g.rotation.y), wM = new THREE.Matrix4().makeTranslation(x, gy, z); for (const pr of propL) { pr.geo.applyMatrix4(rM); pr.geo.applyMatrix4(wM); acGeos.push(pr.geo) } }
    // 建物の輪郭線を本体ジオメトリから焼き込み統合（背面ハルを OUTLINE 倍に膨らませる）。属性を position/normal に揃えて混在ジオメトリでも統合可に。
    if (wantOutline) { const og = bodyGeo.clone().toNonIndexed(); if (og.getAttribute('uv')) og.deleteAttribute('uv'); if (og.getAttribute('color')) og.deleteAttribute('color'); og.scale(OUTLINE, OUTLINE, OUTLINE); og.translate(0, h / 2, 0); og.applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y)); og.applyMatrix4(new THREE.Matrix4().makeTranslation(x, gy, z)); bldgOutlineGeos.push(og) }
    // 瓦屋根を建物の回転・位置で焼き込み、材質ごとのグローバル配列へ（1棟ごとの別メッシュを廃す）。
    if (roofL.length) { const rM = new THREE.Matrix4().makeRotationY(g.rotation.y), wM = new THREE.Matrix4().makeTranslation(x, gy, z); for (const r of roofL) { r.geo.applyMatrix4(rM); r.geo.applyMatrix4(wM); roofGeosByMat[r.ri].push(r.geo) } }
    town.add(g)
    const foot = (w + d) * 0.25 + 0.5
    // 歩行の当たり判定＝敷地を“向き付きの矩形”で正確に。円だと近接ビル間の細い路地に円がはみ出し透明の壁になる（横長の建物で顕著）。矩形なら矩形どうしの隙間（路地）を歩ける。
    const rot = g.rotation.y, cm = 0.42
    colliders.push({ x, z, cos: Math.cos(rot), sin: Math.sin(rot), hw: w / 2 + cm, hd: d / 2 + cm })
    spawnAvoid.push({ x, z, r: foot + 1.0 }) // 着地は壁ぎわを避けて少し離れて降りる
    // 基礎（接地のコンクリ土台）。壁より一回り広く低い帯を建物の足元に。回転・位置を焼き込んで後で統合。
    const plH = 0.45
    const pg = new THREE.BoxGeometry(w * 1.06, plH, d * 1.06)
    pg.applyMatrix4(new THREE.Matrix4().makeTranslation(0, plH / 2, 0))
    pg.applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y))
    pg.applyMatrix4(new THREE.Matrix4().makeTranslation(x, gy, z))
    plinthGeos.push(pg)
    // 軒裏（のきうら）の陰影板＝壁の上端に張り出す暗い板。深い軒の陰影で「箱＋屋根」を作り込んだ家並みに。瓦屋根の家のみ。
    if (type === 'house') {
      const eg = new THREE.BoxGeometry(w + 0.7, 0.12, d + 0.7)
      eg.applyMatrix4(new THREE.Matrix4().makeTranslation(0, h - 0.04, 0))
      eg.applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y))
      eg.applyMatrix4(new THREE.Matrix4().makeTranslation(x, gy, z))
      eaveGeos.push(eg)
    }
    // 中間スラブの見切り（各階の境の水平段差）＝のっぺりした高い箱に階層感。中層ビルのみ（集合住宅は前面にベランダの段差が既にある）。
    if (type === 'mid' && h > 5) {
      const nfl = Math.max(2, Math.round(h / 2.8))
      for (let f = 1; f < nfl; f++) {
        const bgm = new THREE.BoxGeometry(w + 0.16, 0.13, d + 0.16)
        bgm.applyMatrix4(new THREE.Matrix4().makeTranslation(0, f * (h / nfl), 0))
        bgm.applyMatrix4(new THREE.Matrix4().makeRotationY(g.rotation.y))
        bgm.applyMatrix4(new THREE.Matrix4().makeTranslation(x, gy, z))
        bandGeos.push(bgm)
      }
    }
    // 接地階の玄関（前面 +z 面）＝戸＋戸枠＋小庇＋上がり段。歩いて通り過ぎると「住んでいる家」に。回転・位置を焼き込み統合。
    if (h > 2.6) {
      const isHouse = type === 'house'
      const dw = isHouse ? 0.95 : 1.35, dh = isHouse ? 1.95 : 2.2
      const ox = (R() - 0.5) * w * 0.40, fz = d / 2 // 前面の戸口の横位置
      const rotY = g.rotation.y
      const bakeG = (geos, geo, lx, ly, lz) => { geo.applyMatrix4(new THREE.Matrix4().makeTranslation(lx, ly, lz)); geo.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY)); geo.applyMatrix4(new THREE.Matrix4().makeTranslation(x, gy, z)); geos.push(geo) }
      const bake = (geos, sx, sy, sz, lx, ly, lz) => bakeG(geos, new THREE.BoxGeometry(sx, sy, sz), lx, ly, lz)
      bake(doorGeos, dw, dh, 0.09, ox, dh / 2 + 0.02, fz + 0.02) // 暗い引き戸/扉
      bake(doorFrameGeos, 0.12, dh + 0.16, 0.14, ox - dw / 2 - 0.06, (dh + 0.16) / 2, fz + 0.05) // 左の方立
      bake(doorFrameGeos, 0.12, dh + 0.16, 0.14, ox + dw / 2 + 0.06, (dh + 0.16) / 2, fz + 0.05) // 右の方立
      bake(doorFrameGeos, dw + 0.32, 0.17, 0.14, ox, dh + 0.11, fz + 0.05) // 上の楣（まぐさ）
      if (isHouse) bake(doorFrameGeos, dw + 0.52, 0.1, 0.62, ox, dh + 0.28, fz + 0.3) // 玄関の小庇（前へ張り出し＝雨除け・影で入口が立体に）
      bake(plinthGeos, dw + 0.22, 0.22, 0.44, ox, 0.11, fz + 0.2) // 上がり段（式台＝コンクリの低い段）
      // 雨樋（建物正面の角を縦に流れる樋＝日本の建物の象徴）。前面の角に縦の細い樋＋足元の横引き。
      const ppH = h + (type === 'house' ? d * 0.3 : 0.2) // 軒/陸屋根の高さまで
      const pcx = w / 2 - 0.12 // 右角
      bake(fixtureGeos, 0.1, ppH, 0.1, pcx, ppH / 2, fz + 0.04) // 右の縦樋
      bake(fixtureGeos, 0.1, 0.1, 0.5, pcx, 0.12, fz + 0.22)    // 足元の横引き（前へ）
      if (R() < 0.5) bake(fixtureGeos, 0.1, ppH, 0.1, -pcx, ppH / 2, fz + 0.04) // 左の縦樋（時々）
      // メーター箱（電気/ガス＝玄関脇の小箱）
      bake(fixtureGeos, 0.24, 0.32, 0.16, ox + (dw / 2 + 0.34) * (ox > 0 ? -1 : 1), 1.25, fz + 0.06)
      // 室外機（集合住宅/中層の壁際にも＝家は別途。前面の窓下に張り出す灰の箱）
      if (!isHouse) bake(fixtureGeos, 0.78, 0.5, 0.42, (R() - 0.5) * w * 0.5, 1.15, fz + 0.24)
      // 玄関脇の鉢植えの並び（昭和の路地の象徴＝住人が軒先に並べる素焼き鉢。エモい生活感）。家の一部に。
      if (isHouse && R() < 0.5) {
        const sgn = ox > 0 ? -1 : 1, n = 2 + ((R() * 3) | 0) // 戸口と反対の軒先に2〜4鉢
        for (let pp = 0; pp < n; pp++) {
          const pr = 0.12 + R() * 0.06, ph2 = 0.18 + R() * 0.12
          const lx = ox + sgn * (dw / 2 + 0.45 + pp * (pr * 2 + 0.12)), lz = fz + 0.2 + (R() - 0.5) * 0.12
          if (Math.abs(lx) > w / 2 - 0.1) break // 壁面からはみ出さない
          bakeG(potGeos, new THREE.CylinderGeometry(pr * 0.84, pr, ph2, 7), lx, ph2 / 2, lz)
          const fr = pr + 0.05 + R() * 0.1, fol = new THREE.IcosahedronGeometry(fr, 0); fol.scale(1, 0.92, 1)
          bakeG(plantGeos, fol, lx, ph2 + fr * 0.55, lz)
        }
      }
      // 積んだケース（酒屋/商店の軒先のビールケース＝路地の雑多さ）。中層/集合住宅の一部に。
      if (!isHouse && R() < 0.3) {
        const cw = 0.7, cx = (R() < 0.5 ? -1 : 1) * (w / 2 - 0.6), st = 1 + ((R() * 3) | 0)
        for (let cc = 0; cc < st; cc++) bake(crateGeos, cw, 0.34, cw, cx + (R() - 0.5) * 0.1, 0.17 + cc * 0.34, fz + 0.42)
      }
    }
  }

  // 街区をばらまく（奥へ広がる坂の街。手前中央は道＝視界が抜ける）。等間隔の碁盤に見えないよう、
  // 格子からの揺らぎを大きめに取り、区画の大きさも独立に振って、見下ろしの「市松の屋根」を崩す。
  for (let zi = -21; zi <= 7; zi++) {
    for (let xi = -22; xi <= 9; xi++) {
      if (Math.abs(xi) < 1.6 && zi > -3 && zi <= 4) continue // 手前中央は道（街を見通す抜け）
      if (zi > 4 && heightAt(xi * 9, zi * 9) > 30) continue // 手前の丘の天端より上(急斜面)は空ける＝住宅街は丘の中腹まで
      if (R() < 0.12) continue // 空地・駐車場・庭で時々抜く（碁盤の規則性を崩す）
      if (zi < -13 && R() < 0.42) continue // 奥の列は疎に（遠景の点描・性能の余裕を残す）
      if ((zi < -16 || xi < -16) && R() < 0.5) continue // 拡張した最外周(奥/西の端)はさらに疎に＝旗艦の広がりを出しつつ性能を守る
      const x = xi * 9 + (R() - 0.5) * 5.4 // 格子からの揺らぎを大きく（隣と不揃いに寄る＝密集の自然さ）
      const z = zi * 9 + (R() - 0.5) * 5.4
      if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < SHRINE.r) continue // 神社の境内は空ける
      if (Math.abs(x - RIVER.x) < RIVER.bankW + 2) continue // 川筋は空ける
      if (Math.hypot(x - STATION.x, z - STATION.z) < STATION.r) continue // 駅前は空ける
      if (Math.hypot(x - PARK.x, z - PARK.z) < PARK.r) continue // 公園の広場は空ける
      if (Math.hypot(x - MOROOKA.x, z - MOROOKA.z) < MOROOKA.r) continue // 師岡町公園（丘の児童公園）も空ける
      if (Math.hypot(x - TOWER.x, z - TOWER.z) < TOWER.r) continue // 展望塔の足元は空ける
      if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < TEMPLE.r) continue // 寺の境内は空ける
      if (Math.hypot(x - SCHOOL.x, z - SCHOOL.z) < SCHOOL.r) continue // 学校の敷地は空ける
      if (Math.hypot(x - YAMAYURI.x, z - YAMAYURI.z) < YAMAYURI.r) continue // やまゆりホームの敷地は空ける
      if (Math.hypot(x - FUN.x, z - FUN.z) < FUN.r) continue // 遊園地は空ける
      if (Math.hypot(x - DOWNTOWN.x, z - DOWNTOWN.z) < DOWNTOWN.r) continue // 副都心（高層ビル街）は専用に建てる
      if (Math.hypot(x - STADIUM.x, z - STADIUM.z) < STADIUM.r) continue // 競技場は専用に建てる
      if (x > SEA.coast && heightAt(x, z) < SEA.level + 1.2) continue // 海・汀のセルは建てない（水没を防ぐ）
      if (Math.hypot(x - HARBOR.x, z - HARBOR.z) < HARBOR.r) continue // 臨海の港（工業地帯）は専用に建てる
      if (Math.abs(z - RAIL.z) < 2.7 && x > RAIL.x0 - 1 && x < RAIL.x1 + 1) continue // 線路の通り道は空ける
      const far = (zi + 13) / 15 // 0=奥 1=手前
      // 敷地の大小を独立に・広めに振る（同寸の屋根が並ぶ均質感を崩す。時々大きな町工場/団地の塊）
      const big = R() < 0.12 ? 1.7 : 1.0
      const w = (lerp(3.0, 5.2, far) + R() * 2.4) * big
      const d = (lerp(3.0, 5.2, far) + R() * 2.4) * (big > 1.0 ? 0.7 + R() * 0.6 : 1.0)
      // 高さの分布を広げ、均質な高層の壁を避ける（低い家が主役・たまに中層/団地）
      const tall = R() < 0.12
      const h = tall ? lerp(8, 18, R() * R()) : lerp(2.6, 5.5, far) + R() * 2.2
      const type = h > 8.5 ? (R() < 0.55 ? 'apt' : 'mid') : (R() < 0.22 ? 'apt' : 'house')
      // 中央通りの回廊に壁が深く食い込むセルは「建ててから成果物だけ巻き戻す」＝道の上に家が建つ違和感の根絶（実機FB）。
      // house()のR()消費は完全に同一のまま走らせるので、他の全配置は不変（skip方式だとR()順が全域でズレて街が丸ごと変わる）。
      // 巻き戻し対象= house() が書き込む全共有配列（取りこぼすと屋根や小物だけ浮いて残るので全数列挙）＋town.addの1群。
      const onAve = Math.abs(x) - w / 2 < 2.2 && z > -99 && z < 29
      const hSnapArrs = onAve ? [acGeos, bldgOutlineGeos, plinthGeos, eaveGeos, bandGeos, fixtureGeos, doorFrameGeos, doorGeos, crateGeos, potGeos, plantGeos, homeBldgs, colliders, spawnAvoid, ...roofGeosByMat] : null // slab/rail/div/fut等はhouse()内ローカル＝家グループごと消えるので対象外
      const hSnapLens = hSnapArrs ? hSnapArrs.map((a) => a.length) : null
      const hSnapTown = onAve ? town.children.length : 0
      house(x, z, w, d, h, type)
      if (hSnapArrs) {
        for (let ai = 0; ai < hSnapArrs.length; ai++) { const arr = hSnapArrs[ai]
          for (let k = hSnapLens[ai]; k < arr.length; k++) { const e = arr[k]; if (e && e.dispose) e.dispose(); else if (e && e.geo && e.geo.dispose) e.geo.dispose() }
          arr.length = hSnapLens[ai] }
        while (town.children.length > hSnapTown) town.remove(town.children[town.children.length - 1])
      }
    }
  }

  // ── 路地網（住宅街の建物の間を縫う細い道＝本物の街並み・路地裏。9uの街区格子の境界線に沿って細い道を敷く） ──
  // 格子の間が素の地面だと「空き地に家がぽつぽつ」に見える→境界線を路地で結ぶと「街区＝家並み＋その間の路地」になる。
  if (kind !== 'yato') {
    const alleyMat = mottleMat(season === 'winter' ? 0xbfc2bd : 0x8a8478, 90, 0.1, [3, 3]) // 使い込まれた土/舗装の路地（俯瞰で路面の質感）
    const alleyGeos = [], gutterGeos = [], manholeGeos = [], aM = new THREE.Matrix4(), aRot = new THREE.Matrix4(), aM2 = new THREE.Matrix4()
    const areas = [SHRINE, STATION, PARK, MOROOKA, TOWER, TEMPLE, SCHOOL, FUN, DOWNTOWN, STADIUM, HARBOR]
    const skipAlley = (x, z) => {
      if (x > SEA.coast && heightAt(x, z) < SEA.level + 1.2) return true // 海・汀
      if (Math.abs(x - RIVER.x) < RIVER.bankW + 1) return true // 川筋
      if (Math.abs(z - RAIL.z) < 2.6 && x > RAIL.x0 - 1 && x < RAIL.x1 + 1) return true // 線路
      if (Math.abs(x) < 4.2 && z > -98 && z < 28) return true // 中央通り（別の広い舗装）
      for (const a of areas) if (Math.hypot(x - a.x, z - a.z) < a.r + 1) return true // 神社/駅/公園/寺/学校 等
      return false
    }
    // 斜面に沿わせた1区間の路地（端の高さで傾ける）。短く割って統合＝坂でも地に着く。
    const segAlley = (x0, z0, x1, z1, w) => {
      const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1); if (Math.max(y0, y1) < SEA.level + 0.9) return
      const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), pitch = Math.atan2(y1 - y0, len)
      aRot.makeRotationY(Math.atan2(dx, dz))
      const seg = new THREE.BoxGeometry(w, 0.12, len + 0.3)
      // セグメント毎にUVを位置ハッシュでずらす＝同じmottleパターンが全路地で揃って斜めに反復するのを断つ（主R()非消費）。
      const uv = seg.attributes.uv, ou = ((x0 * 0.37 + z0 * 0.19) % 1 + 1) % 1, ov = ((x0 * 0.13 - z0 * 0.29) % 1 + 1) % 1
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ou, uv.getY(i) + ov)
      aM.makeRotationX(-pitch).premultiply(aRot); aM.setPosition((x0 + x1) / 2, (y0 + y1) / 2 + 0.07, (z0 + z1) / 2); seg.applyMatrix4(aM); alleyGeos.push(seg)
      // 側溝（路地の片側のコンクリ蓋＝U字溝。歩く道が「街路」に締まる＝目線の生活感）
      const nx = -dz / len, nz = dx / len, goff = w / 2 + 0.17
      const gseg = new THREE.BoxGeometry(0.34, 0.13, len + 0.3)
      aM2.makeRotationX(-pitch).premultiply(aRot); aM2.setPosition((x0 + x1) / 2 + nx * goff, (y0 + y1) / 2 + 0.075, (z0 + z1) / 2 + nz * goff); gseg.applyMatrix4(aM2); gutterGeos.push(gseg)
      // マンホール（時々・路地に鉄蓋の濃灰）
      if (R() < 0.16) { const mh = new THREE.CircleGeometry(0.42, 12); mh.rotateX(-Math.PI / 2); mh.translate((x0 + x1) / 2, (y0 + y1) / 2 + 0.14, (z0 + z1) / 2); manholeGeos.push(mh) }
    }
    for (let zi = -21; zi <= 7; zi++) { const lz = (zi + 0.5) * 9 // x方向（東西）の路地
      for (let xi = -22; xi <= 9; xi++) { const mx = (xi + 0.5) * 9; if (R() < 0.14 || skipAlley(mx, lz)) continue; for (let s = 0; s < 3; s++) segAlley(xi * 9 + s * 3, lz, xi * 9 + (s + 1) * 3, lz, 1.8) } }
    for (let xi = -22; xi <= 9; xi++) { const lx = (xi + 0.5) * 9 // z方向（南北）の路地
      for (let zi = -21; zi <= 7; zi++) { const mz = (zi + 0.5) * 9; if (R() < 0.14 || skipAlley(lx, mz)) continue; for (let s = 0; s < 3; s++) segAlley(lx, zi * 9 + s * 3, lx, zi * 9 + (s + 1) * 3, 1.8) } }
    if (BufferGeometryUtils.mergeGeometries && alleyGeos.length) {
      const m = BufferGeometryUtils.mergeGeometries(alleyGeos, false); if (m) { const mesh = new THREE.Mesh(m, alleyMat); mesh.receiveShadow = true; town.add(mesh) } alleyGeos.forEach((g) => g.dispose())
      const gm = gutterGeos.length && BufferGeometryUtils.mergeGeometries(gutterGeos, false); if (gm) { const gmesh = new THREE.Mesh(gm, toon(season === 'winter' ? 0xc2bdb2 : 0xada79a)); gmesh.receiveShadow = true; town.add(gmesh) } gutterGeos.forEach((g) => g.dispose()) // 側溝の蓋（明るいコンクリ）
      const mm = manholeGeos.length && BufferGeometryUtils.mergeGeometries(manholeGeos, false); if (mm) { const mmesh = new THREE.Mesh(mm, toon(0x5a5854)); mmesh.receiveShadow = true; town.add(mmesh) } manholeGeos.forEach((g) => g.dispose()) // マンホール（濃灰の鉄蓋）
    }
  }

  // ── 副都心（拡張した西の高層ビル街）＝旗艦homeのスカイライン。house()のガラス窓の高層を中心ほど高く密集させる。 ──
  {
    const dcx = DOWNTOWN.x, dcz = DOWNTOWN.z
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.2832 + R() * 0.5, rr = (i % 4) * 5.4 + R() * 3.4 // 中心から渦巻状に密集
      const px = dcx + Math.cos(a) * rr, pz = dcz + Math.sin(a) * rr, py = heightAt(px, pz)
      if (py < SEA.level + 1) continue
      const central = Math.max(0, 1 - rr / 22) // 中心ほど高い
      const h = 13 + central * 23 + R() * 7, w = 4.6 + R() * 3.2, d = 4.6 + R() * 3.2 // 最大~43mの摩天楼
      house(px, pz, w, d, h, R() < 0.5 ? 'apt' : 'mid')
    }
    // 駅前広場/大通りの石畳（副都心の足元を均す）と街路樹
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(DOWNTOWN.r - 4, 28), mottleMat(season === 'winter' ? 0xc6cac6 : 0x8e8a84, 110, 0.13, [13, 13])); plaza.rotation.x = -Math.PI / 2; plaza.position.set(dcx, heightAt(dcx, dcz) + 0.05, dcz); plaza.receiveShadow = true; town.add(plaza) // 反復を上げ近接で舗装の質感（5→13）
    const dgC = season === 'spring' ? 0x7faa56 : season === 'autumn' ? 0xc88a3c : season === 'winter' ? 0xcdd6d2 : 0x5e7e46
    for (let k = 0; k < 12; k++) { const a = R() * 6.28, rr = 14 + R() * 12, px = dcx + Math.cos(a) * rr, pz = dcz + Math.sin(a) * rr, py = heightAt(px, pz); if (py < SEA.level + 1) continue; const s = 0.8 + R() * 0.4; const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.22 * s, 1.6 * s, 6), toon(0x6a4f38)); tr.position.set(px, py + 0.8 * s, pz); town.add(tr); const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 * s, 1), toon(dgC)); fo.position.set(px, py + 2.0 * s, pz); fo.castShadow = true; town.add(fo) } // 街路樹
  }
  // ── 競技場（楕円のスタジアム）＝旗艦homeの大型施設。擂鉢のスタンド＋緑のフィールド＋トラック＋白い庇＋照明塔×4 ──
  {
    const scx = STADIUM.x, scz = STADIUM.z, scy = STADIUM.padY, ex2 = 18, ez2 = 14
    // 明るい緑のフィールド（大きく＝上空から「競技場の芝」とすぐ読める）＋赤のトラック＋白線
    const field = new THREE.Mesh(new THREE.CircleGeometry(1, 44), toon(season === 'winter' ? 0xd6dcd2 : 0x4f8f3e)); field.scale.set(ex2 * 0.6, ez2 * 0.6, 1); field.rotation.x = -Math.PI / 2; field.position.set(scx, scy + 0.32, scz); field.receiveShadow = true; town.add(field)
    const track = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.74, 44), toon(season === 'winter' ? 0xc8b0a4 : 0xb0563a)); track.scale.set(ex2, ez2, 1); track.rotation.x = -Math.PI / 2; track.position.set(scx, scy + 0.3, scz); town.add(track)
    // スタンド＝低く開いた擂鉢（短くして上空からフィールドが見える）。客席色を明るく＋段のリングをはっきり。
    const seatC = season === 'winter' ? 0xcfd4d8 : 0xaeb6c2
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.76, 2.6, 48, 1, true), toon(seatC)); bowl.scale.set(ex2, 1, ez2); bowl.position.set(scx, scy + 1.3, scz); bowl.castShadow = true; bowl.receiveShadow = true; town.add(bowl); town.add(addOutline(bowl)) // 内に傾く客席の面
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.04, 1.04, 2.9, 48, 1, true), toon(season === 'winter' ? 0xc2c6c8 : 0x9aa0a6)); wall.scale.set(ex2, 1, ez2); wall.position.set(scx, scy + 1.45, scz); wall.castShadow = true; town.add(wall); town.add(addOutline(wall)) // 外周の壁（垂直の外観）
    for (let ti = 0; ti < 4; ti++) { const r = 0.8 + ti * 0.05; const tier = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 4, 48), toon(season === 'winter' ? 0x9aa0a4 : 0x7c828c)); tier.scale.set(ex2 * r, ez2 * r, 1); tier.rotation.x = -Math.PI / 2; tier.position.set(scx, scy + 0.8 + ti * 0.5, scz); town.add(tier) } // 客席の段（はっきり）
    const canopy = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 4, 48), toon(0xeae6dc)); canopy.scale.set(ex2 * 0.98, ez2 * 0.98, 1); canopy.rotation.x = -Math.PI / 2; canopy.position.set(scx, scy + 2.9, scz); town.add(canopy); town.add(addOutline(canopy)) // 白い屋根の庇（張り出し）
    for (const [ox, oz] of [[ex2 * 0.82, ez2 * 0.82], [-ex2 * 0.82, ez2 * 0.82], [ex2 * 0.82, -ez2 * 0.82], [-ex2 * 0.82, -ez2 * 0.82]]) { const lx = scx + ox, lz = scz + oz, ly = heightAt(lx, lz)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 9, 6), toon(0x8a8e90)); pole.position.set(lx, ly + 4.5, lz); pole.castShadow = true; town.add(pole)
      const rack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 0.4), toon(0x6a6e72)); rack.position.set(lx + (scx - lx) * 0.08, ly + 9.2, lz + (scz - lz) * 0.08); town.add(rack)
      if (isNight || duskAmt > 0.3) { const gl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.12), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: true })); gl.position.set(lx + (scx - lx) * 0.12, ly + 9.2, lz + (scz - lz) * 0.12); town.add(gl) } } // 照明塔×4（夜は灯る）
  }
  // ── 湾のヨット（旗艦homeの海辺の憩い）。沖に係留のヨット＋防波堤＋海辺の遊歩道。狭い湾でも破綻しないよう桟橋は置かず水面に浮かべる。 ──
  {
    const mhx = 80, mhz = -14, deckMat = toon(0x8a6a48) // 湾の沖（水面の上）
    const bw = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 2.6), mottleMat(season === 'winter' ? 0xc6cac4 : 0x9a948a, 120, 0.12, [4, 1])); bw.position.set(mhx + 8, SEA.level + 0.7, mhz - 11); bw.castShadow = true; town.add(bw); town.add(addOutline(bw)) // 防波堤
    const hullMat = toon(season === 'winter' ? 0xe2dccf : 0xdcd6c8), mastMat = toon(0x8a8278), sailMat = toon(0xeae4d6)
    for (let i = 0; i < 6; i++) { const yz = mhz - 7 + i * 2.8 + (R() - 0.5), yx = mhx + 3 + (R() - 0.5) * 3.2
      const yacht = new THREE.Group(); yacht.position.set(yx, SEA.level + 0.2, yz); yacht.rotation.y = Math.PI / 2 + (R() - 0.5) * 0.3; yacht.userData = { ph: R() * 6.28 }
      const hull = new THREE.Mesh(new RoundedBoxGeometry(3.2, 0.7, 1.1, 1, 0.3), hullMat); hull.position.y = 0.4; hull.castShadow = true; yacht.add(hull)
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5), mastMat); mast.position.set(0, 2.0, 0); yacht.add(mast)
      const sail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.5, 1.5), sailMat); sail.position.set(0, 1.85, 0.55); yacht.add(sail)
      if (duskAmt > 0.12) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffd089, fog: true })); lamp.position.set(0, 1.3, -0.5); yacht.add(lamp) } // 船尾の灯り（夕夜）
      town.add(yacht); boats.push(yacht) } // 係留のヨット（白い船体＋マスト＋帆）＝波にゆれる
    // 海辺の遊歩道（岸の上）＝ベンチ＋街路樹＋人
    const promY = (px, pz) => heightAt(px, pz)
    for (let i = 0; i < 5; i++) { const pz = mhz - 10 + i * 5.5, px = 69, py = promY(px, pz); if (py < SEA.level + 0.5) continue
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.6), deckMat); bench.position.set(px, py + 0.3, pz); bench.rotation.y = Math.PI / 2; town.add(bench)
      if (i % 2 === 0) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.8, 6), toon(0x6a4f38)); tr.position.set(px - 2, py + 0.9, pz); town.add(tr); const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 2), toon(season === 'autumn' ? 0xc88a3c : season === 'winter' ? 0xd2dad6 : 0x5e8a52)); fo.position.set(px - 2, py + 2.3, pz); fo.castShadow = true; town.add(fo) } }
  }

  // ── 沖を行く帆船（home↔時代エリアの開けた海を渡る飛行に、穏やかな見どころの焦点を置く）。静的＋波にゆれるだけ＝発熱/リーク無し。R()不使用で生成列を保つ。──
  if (kind !== 'yato') {
    const hullMatS = toon(season === 'winter' ? 0xdcd6c8 : 0xcfc8ba), mastMatS = toon(0x7a7268), sailMatS = toon(0xeae4d6)
    const wakeMatS = new THREE.MeshBasicMaterial({ color: season === 'winter' ? 0xdfe6ea : 0xdfeaef, transparent: true, opacity: 0.3, depthWrite: false, fog: true })
    for (const [bx, bz, brot] of [[330, -210, 0.7], [455, -380, 2.3], [-250, -255, 1.2], [150, -335, -0.6], [-360, -430, 1.9]]) {
      if (heightAt(bx, bz) > SEA.level - 1) continue // 念のため水上のみ（陸/島には置かない）
      const boat = new THREE.Group(); boat.position.set(bx, SEA.level + 0.2, bz); boat.rotation.y = brot; boat.userData = { ph: Math.abs(bx + bz) % 6.28 }
      const hull = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.9, 1.5, 1, 0.4), hullMatS); hull.position.y = 0.5; hull.castShadow = true; boat.add(hull)
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 5), mastMatS); mast.position.set(0.3, 2.6, 0); boat.add(mast)
      const sail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.2, 1.9), sailMatS); sail.position.set(0.3, 2.3, 0.6); boat.add(sail)
      const jib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.0, 1.1), sailMatS); jib.position.set(0.3, 1.9, -0.7); boat.add(jib) // 前帆
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.6), toon([0xc06a5a, 0x6a8db5, 0x82a878][Math.abs(Math.round(bx)) % 3])); flag.position.set(0.3, 4.55, -0.28); boat.add(flag) // マスト頂の三角旗（海を行く帆船らしさ）
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 13), wakeMatS); wake.rotation.x = -Math.PI / 2; wake.position.set(0, 0.02, -7.5); boat.add(wake) // 引き波
      if (duskAmt > 0.12) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffd089, fog: true })); lamp.position.set(0.3, 1.7, -1.6); boat.add(lamp) } // 船尾の灯り（夕夜の海に温かい点）
      town.add(boat); boats.push(boat)
    }
  }
  // ── 自分の丘の近所（手前の両脇の家。緑だけの近景を埋め、自分も坂の街に居る感じに） ──
  for (const c of [[-13, 24], [13, 25], [-19, 19], [20, 20], [-10, 28], [11, 29]]) {
    house(c[0], c[1], 5 + R() * 1.5, 5 + R() * 1.5, 4 + R() * 2, R() < 0.7 ? 'house' : 'apt')
  }

  // ── 全建物の基礎（接地のコンクリ土台）を1メッシュに統合＝足元が地に着く（俯瞰では薄く・歩行で効く）。──
  if (plinthGeos.length && BufferGeometryUtils.mergeGeometries) {
    const merged = BufferGeometryUtils.mergeGeometries(plinthGeos, false)
    if (merged) {
      const plinth = new THREE.Mesh(merged, toon(season === 'winter' ? 0x9a978f : 0x8a8278)) // くすんだコンクリ色
      plinth.receiveShadow = true; plinth.castShadow = false; town.add(plinth)
    }
    plinthGeos.forEach((g) => g.dispose()) // 統合済みの素片は解放
    const dmerged = doorGeos.length && BufferGeometryUtils.mergeGeometries(doorGeos, false)
    if (dmerged) { const doors = new THREE.Mesh(dmerged, toon(0x40382f)); doors.receiveShadow = true; town.add(doors) } // 暗い戸口（玄関/店先）
    doorGeos.forEach((g) => g.dispose())
    const fmerged = doorFrameGeos.length && BufferGeometryUtils.mergeGeometries(doorFrameGeos, false)
    if (fmerged) { const frames = new THREE.Mesh(fmerged, toon(0x7c6647)); frames.castShadow = true; frames.receiveShadow = true; town.add(frames) } // 戸枠・玄関庇（暖色の木）
    doorFrameGeos.forEach((g) => g.dispose())
    const xmerged = fixtureGeos.length && BufferGeometryUtils.mergeGeometries(fixtureGeos, false)
    if (xmerged) { const fixtures = new THREE.Mesh(xmerged, toon(0x6e6a64)); fixtures.castShadow = true; fixtures.receiveShadow = true; town.add(fixtures) } // 雨樋・メーター（灰）
    fixtureGeos.forEach((g) => g.dispose())
    const potm = potGeos.length && BufferGeometryUtils.mergeGeometries(potGeos, false)
    if (potm) { const pots = new THREE.Mesh(potm, toon(0x9c6244)); pots.castShadow = true; pots.receiveShadow = true; town.add(pots) } // 素焼きの鉢
    potGeos.forEach((g) => g.dispose())
    const plm = plantGeos.length && BufferGeometryUtils.mergeGeometries(plantGeos, false)
    if (plm) { const plants = new THREE.Mesh(plm, toon(season === 'autumn' ? 0x8a7a3a : 0x5c7a44)); plants.castShadow = true; town.add(plants) } // 鉢の緑
    plantGeos.forEach((g) => g.dispose())
    const crm = crateGeos.length && BufferGeometryUtils.mergeGeometries(crateGeos, false)
    if (crm) { const crates = new THREE.Mesh(crm, toon(0x6a7a86)); crates.castShadow = true; crates.receiveShadow = true; town.add(crates) } // 積んだケース（くすんだ青灰）
    crateGeos.forEach((g) => g.dispose())
    const evm = eaveGeos.length && BufferGeometryUtils.mergeGeometries(eaveGeos, false)
    if (evm) { const eaves = new THREE.Mesh(evm, toon(0x44392c)); eaves.castShadow = true; eaves.receiveShadow = true; town.add(eaves) } // 軒裏の陰影（暗い木）
    eaveGeos.forEach((g) => g.dispose())
    const bdm = bandGeos.length && BufferGeometryUtils.mergeGeometries(bandGeos, false)
    if (bdm) { const bands = new THREE.Mesh(bdm, toon(season === 'winter' ? 0xb4b0a6 : 0x9a948a)); bands.castShadow = true; bands.receiveShadow = true; town.add(bands) } // 中間スラブの見切り（コンクリ色）
    bandGeos.forEach((g) => g.dispose())
    const acm = acGeos.length && BufferGeometryUtils.mergeGeometries(acGeos, false)
    if (acm) { const acs = new THREE.Mesh(acm, clutterMat); acs.castShadow = true; acs.receiveShadow = true; town.add(acs) } // 室外機・太陽熱温水器（頂点色で焼いた統合メッシュ）
    acGeos.forEach((g) => g.dispose())
    const olm = bldgOutlineGeos.length && BufferGeometryUtils.mergeGeometries(bldgOutlineGeos, false)
    if (olm) { const outs = new THREE.Mesh(olm, outlineMat); outs.renderOrder = -1; outs.castShadow = false; outs.receiveShadow = false; outs.frustumCulled = false; town.add(outs) } // 現代homeの建物輪郭（523本→1メッシュ）
    bldgOutlineGeos.forEach((g) => g.dispose())
    for (let i = 0; i < roofGeosByMat.length; i++) { const arr = roofGeosByMat[i]; if (!arr.length) continue; const rm = BufferGeometryUtils.mergeGeometries(arr, false); if (rm) { const roofs = new THREE.Mesh(rm, roofMats[i]); roofs.castShadow = true; roofs.receiveShadow = true; town.add(roofs) } arr.forEach((g) => g.dispose()) } // 家の瓦屋根（材質ごとに統合）
  }

  // ── 川（街の左手の谷筋）。空を映す水面＋護岸＋橋＝飛んで川沿いを渡れる水辺のランドマーク。──
  {
    const rx = RIVER.x
    const waterLevel = (z) => heightAt(rx, z) + RIVER.depth - 1.2 // 河床(掘った底)から少し上＝水位
    // 水面（空を映す水鏡。MeshToonの空グラデで白飛びを防ぐ）。zに沿って河床のうねりに合わせる。
    const wc = document.createElement('canvas'); wc.width = wc.height = 64; const wcx = wc.getContext('2d')
    const wg = wcx.createLinearGradient(0, 0, 0, 64)
    wg.addColorStop(0, '#' + new THREE.Color(0x6ea2c4).lerp(skyTop, 0.34).getHexString())
    wg.addColorStop(1, '#' + new THREE.Color(0x46708e).lerp(skyHorizon, 0.18).getHexString())
    wcx.fillStyle = wg; wcx.fillRect(0, 0, 64, 64)
    const wsg = wcx.createLinearGradient(20, 64, 44, 0)
    wsg.addColorStop(0, 'rgba(255,255,255,0)'); wsg.addColorStop(0.5, '#' + sunCol.clone().lerp(new THREE.Color(0xffffff), 0.2).getHexString()); wsg.addColorStop(1, 'rgba(255,255,255,0)')
    wcx.globalAlpha = 0.4; wcx.fillStyle = wsg; wcx.fillRect(0, 0, 64, 64); wcx.globalAlpha = 1
    for (let i = 0; i < 40; i++) { wcx.fillStyle = `rgba(255,255,255,${0.05 + R() * 0.05})`; wcx.fillRect(R() * 64, R() * 64, 1 + R() * 2, 1) } // さざ波
    const wtex = new THREE.CanvasTexture(wc); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set(1, 10)
    const wgeo = new THREE.PlaneGeometry(RIVER.halfW * 2, 130, 1, 80); wgeo.rotateX(-Math.PI / 2)
    const wp = wgeo.attributes.position
    for (let i = 0; i < wp.count; i++) wp.setY(i, waterLevel(wp.getZ(i) - 36)) // mesh は z=-36 中心
    wgeo.computeVertexNormals()
    const water = new THREE.Mesh(wgeo, freshWater(new THREE.MeshToonMaterial({ color: 0xffffff, map: wtex, gradientMap: grad, fog: true })))
    water.position.set(rx, 0, -36); water.receiveShadow = true; town.add(water)
    // 護岸（水際の左右のコンクリ壁。天端は堤の肩＝grade、底は水面下。地形に沿わせ1メッシュへ）
    const bankGeos = []
    for (const side of [-1, 1]) {
      for (let z = 28; z > -98; z -= 2.4) {
        const bx = rx + side * (RIVER.halfW + 0.2)
        const top = heightAt(rx + side * (RIVER.bankW + 0.8), z), bottom = waterLevel(z) - 1.0
        const hgt = Math.max(0.8, top - bottom)
        const seg = new THREE.BoxGeometry(0.5, hgt, 2.5)
        seg.applyMatrix4(new THREE.Matrix4().makeTranslation(bx, bottom + hgt / 2, z))
        bankGeos.push(seg)
      }
    }
    if (BufferGeometryUtils.mergeGeometries) { const bm = BufferGeometryUtils.mergeGeometries(bankGeos, false); if (bm) { const banks = new THREE.Mesh(bm, mottleMat(0x908c84, 110, 0.1, [2, 3])); banks.receiveShadow = true; banks.castShadow = true; town.add(banks) } } // 川辺の遊歩道で見るコンクリ護岸にムラ＝近接で使い込まれた質感
    bankGeos.forEach((g) => g.dispose())
    // ── 紫陽花（夏＝川辺の遊歩道に咲く。梅雨〜夏の水辺の彩り）。決定的配置＋色ごとに統合で軽量。──
    if (season === 'summer') {
      const ajiCols = [0x6f8ad0, 0x9a7ec8, 0xc77aa8, 0x7ab0c0], bk = ajiCols.map(() => []), lf2 = [], aM = new THREE.Matrix4()
      for (let z = 22; z > -90; z -= 7.5) { const fx = rx + 3.9, fy = heightAt(fx, z); if (fy < waterLevel(z) + 0.5) continue // 堤の上のみ（水際は避ける）
        const lg = new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(); lg.scale(1.25, 0.5, 1.25); aM.makeTranslation(fx, fy + 0.18, z); lg.applyMatrix4(aM); lf2.push(lg) // 葉
        const ci = ((z | 0) % 4 + 4) % 4
        for (const [ox, oy, oz, s] of [[0, 0.5, 0, 0.32], [-0.26, 0.42, 0.1, 0.22], [0.24, 0.44, -0.1, 0.23]]) { const h = new THREE.IcosahedronGeometry(s, 1); aM.makeTranslation(fx + ox, fy + oy, z + oz); h.applyMatrix4(aM); bk[(ci + (ox < 0 ? 1 : 0)) % 4].push(h) } // 花房
      }
      if (BufferGeometryUtils.mergeGeometries) { const lm = lf2.length && BufferGeometryUtils.mergeGeometries(lf2, false); if (lm) { const me = new THREE.Mesh(lm, toon(0x4e6e3a)); me.castShadow = true; town.add(me) } bk.forEach((b2, i) => { if (b2.length) { const m = BufferGeometryUtils.mergeGeometries(b2, false); if (m) { const me2 = new THREE.Mesh(m, toon(ajiCols[i])); me2.castShadow = true; town.add(me2) } } }); lf2.concat(...bk).forEach((g) => g.dispose()) }
    }
    // 橋（川を渡る一本）。デッキ＋欄干＋橋脚。橋面は grade（堤の肩）に合わせる。
    const bz = -16, bTop = heightAt(rx, bz) + RIVER.depth
    const deck = new THREE.Mesh(new THREE.BoxGeometry(RIVER.halfW * 2 + 4.4, 0.4, 4), toon(0x9a958c)); deck.position.set(rx, bTop, bz); deck.castShadow = true; deck.receiveShadow = true; town.add(deck)
    for (const rs of [-1.8, 1.8]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(RIVER.halfW * 2 + 4.4, 0.5, 0.16), toon(0xb0a48a)); rail.position.set(rx, bTop + 0.45, bz + rs); town.add(rail) }
    for (const ps of [-RIVER.halfW, RIVER.halfW]) { const pier = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), toon(0x7a766e)); pier.position.set(rx + ps, bTop - 2, bz); pier.castShadow = true; town.add(pier) }
  }

  // ── 商店街ゲート（中央の道の入口に架かるアーチ看板）＋提灯。人の集まる通りの象徴。──
  {
    const gz = -12, gy = heightAt(0, gz)
    const gateMat = toon(0x4a7a5e), lightMat = new THREE.MeshBasicMaterial({ color: 0xffce86 })
    const grp = new THREE.Group(); grp.position.set(0, gy, gz); town.add(grp)
    for (const gx of [-4.3, 4.3]) { const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5.2, 0.5), gateMat); pil.position.set(gx, 2.6, 0); pil.castShadow = true; grp.add(pil) }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.6, 0.7), gateMat); beam.position.set(0, 5.3, 0); beam.castShadow = true; grp.add(beam)
    // 看板（商店街名のバナー）
    const bc = document.createElement('canvas'); bc.width = 256; bc.height = 64
    const bx2 = bc.getContext('2d'); bx2.fillStyle = '#3c6650'; bx2.fillRect(0, 0, 256, 64); bx2.strokeStyle = '#e8e0c8'; bx2.lineWidth = 4; bx2.strokeRect(3, 3, 250, 58)
    bx2.fillStyle = '#f4efe0'; bx2.font = 'bold 34px sans-serif'; bx2.textAlign = 'center'; bx2.textBaseline = 'middle'; bx2.fillText('しょうてんがい', 128, 36)
    const banner = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.1, 0.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc) })); banner.position.set(0, 4.35, 0.22); grp.add(banner)
    for (let i = -3; i <= 3; i++) { const lt = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), lightMat); lt.position.set(i * 1.3, 5.75, 0); grp.add(lt) } // アーチ上の灯り
    // 提灯（赤い提灯を通り沿いに連ねる）
    const lantMat = toon(0xc23a2e), capMat = toon(0x2a2622)
    const lanBodies = [], lanCaps = [] // 提灯の胴/笠を1メッシュずつへ統合（ドローコール削減）
    for (const lx of [-2.9, 2.9]) for (let z = -15; z > -40; z -= 3.0) {
      const ly = heightAt(lx, z) + 3.8
      const bg = new THREE.CylinderGeometry(0.32, 0.32, 0.5, 10); bg.scale(1, 1.15, 1); bg.translate(lx, ly, z); lanBodies.push(bg)
      const cg = new THREE.CylinderGeometry(0.15, 0.21, 0.1, 8); cg.translate(lx, ly + 0.33, z); lanCaps.push(cg)
    }
    if (BufferGeometryUtils.mergeGeometries) {
      const bm = BufferGeometryUtils.mergeGeometries(lanBodies, false); if (bm) town.add(new THREE.Mesh(bm, lantMat)); lanBodies.forEach((g) => g.dispose())
      const cm = BufferGeometryUtils.mergeGeometries(lanCaps, false); if (cm) town.add(new THREE.Mesh(cm, capMat)); lanCaps.forEach((g) => g.dispose())
    }
    // 店先（通りの両側に小さな店＝庇のテント・暖簾・看板・夕夜は灯る店窓）。通りを「商店街」に。
    const shopCols = [0xd8c8a8, 0xcfa886, 0xc8bfa8, 0xd0b090, 0xc6c0b0], awnCols = [0xc0453a, 0x3a7a5e, 0x3a6a8a, 0xc89030]
    const shopLit = duskAmt > 0.2, norenWords = ['しょくどう', 'やおや', 'さかなや', 'とこや', 'パンや', 'せん']
    for (const side of [-1, 1]) {
      for (let z = -14.5; z > -39; z -= 4.2) {
        const fx = side * 3.8, fd = -side, gy = heightAt(fx, z) // fd=道側(+x for left)
        const g = new THREE.Group(); g.position.set(fx, gy, z); town.add(g)
        const h = 3.0 + R() * 1.3
        const store = new THREE.Mesh(new THREE.BoxGeometry(1.7, h, 3.4), toon(shopCols[(R() * shopCols.length) | 0])); store.position.set(-fd * 0.45, h / 2, 0); store.castShadow = true; store.receiveShadow = true; g.add(store)
        const awn = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 3.2), toon(awnCols[(R() * awnCols.length) | 0])); awn.position.set(fd * 0.95, 2.15, 0); awn.rotation.z = fd * 0.2; awn.castShadow = true; g.add(awn)
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 2.6), shopLit ? new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true }) : toon(0x40484e)); win.position.set(fd * 0.48, 1.0, 0); g.add(win)
        const nc = document.createElement('canvas'); nc.width = 64; nc.height = 24; const ncx = nc.getContext('2d'); ncx.fillStyle = '#' + new THREE.Color(awnCols[(R() * awnCols.length) | 0]).getHexString(); ncx.fillRect(0, 0, 64, 24); ncx.fillStyle = '#f0ece0'; ncx.font = 'bold 15px sans-serif'; ncx.textAlign = 'center'; ncx.textBaseline = 'middle'; ncx.fillText(norenWords[(R() * norenWords.length) | 0], 32, 12)
        const norenTex = new THREE.CanvasTexture(nc); const noren = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 2.3), shopLit ? new THREE.MeshBasicMaterial({ map: norenTex, fog: true }) : new THREE.MeshToonMaterial({ map: norenTex, gradientMap: grad, fog: true })); noren.position.set(fd * 0.52, 1.85, 0); g.add(noren) // 昼夕=陰影付き/夜=灯る（無影で昼に浮くのを断つ）
        colliders.push({ x: fx, z, r: 1.5 })
      }
    }
    // 街路灯（中央の街道沿いに左右互い違いに並ぶ。夕夜に暖色で灯る＝夜景の足元の灯り）。
    {
      const litHead = duskAmt > 0.2
      const headMat = litHead ? new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true }) : toon(0xb8b4a0)
      const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.22, depthWrite: false, fog: true })
      const poleMat = toon(0x44464a)
      for (const side of [-1, 1]) {
        for (let z = 16 + (side > 0 ? 4.5 : 0); z > -52; z -= (LIGHT ? 18 : 9)) {
          const gx = side * 4.7, gz = z, gy = heightAt(gx, gz)
          const g = new THREE.Group(); g.position.set(gx, gy, gz); town.add(g)
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 4.2, 6), poleMat); pole.position.y = 2.1; pole.castShadow = true; g.add(pole)
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), poleMat); arm.position.set(-side * 0.35, 4.1, 0); g.add(arm)
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), headMat); head.position.set(-side * 0.65, 4.0, 0); g.add(head)
          if (litHead && !LIGHT) { const halo = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 8), haloMat); halo.position.copy(head.position); g.add(halo) }
        }
      }
    }
  }

  // ── 駅（街の右手。人の集まる目的地。駅舎＋ホーム＋駅名標＋短い線路）。──
  {
    const stx = STATION.x, stz = STATION.z, sy = heightAt(stx, stz)
    const grp = new THREE.Group(); grp.position.set(stx, sy, stz); town.add(grp)
    const wallMat = toon(0xd8d0be), roofMat = toon(0x6a4e44), platMat = toon(0xb8b2a6), railMat = toon(0x55555c)
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 5), wallMat); body.position.set(0, 1.7, 0); body.castShadow = true; body.receiveShadow = true; grp.add(body); grp.add(addOutline(body))
    const rg = new THREE.CylinderGeometry(2.9, 2.9, 7.4, 3, 1); rg.rotateZ(Math.PI / 2); rg.rotateY(Math.PI / 2)
    const roof = new THREE.Mesh(rg, roofMat); roof.position.set(0, 3.7, 0); roof.scale.set(1, 0.7, 1.15); roof.castShadow = true; grp.add(roof)
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16), new THREE.MeshBasicMaterial({ color: 0xf0ead8 })); clock.rotation.x = Math.PI / 2; clock.position.set(0, 2.9, 2.55); grp.add(clock) // 駅の時計
    const plat = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 3), platMat); plat.position.set(0, 0.3, -5.2); plat.receiveShadow = true; grp.add(plat) // ホーム
    for (const px of [-5, 0, 5]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), toon(0x8a8680)); post.position.set(px, 1.9, -5.2); grp.add(post) } // ホーム上屋の柱
    const proof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.16, 3.2), toon(0x9a9690)); proof.position.set(0, 3.2, -5.2); proof.castShadow = true; grp.add(proof)
    // 駅名標（ホームの看板）
    const nc = document.createElement('canvas'); nc.width = 128; nc.height = 48
    const ncx = nc.getContext('2d'); ncx.fillStyle = '#f4efe4'; ncx.fillRect(0, 0, 128, 48); ncx.fillStyle = '#3a6a4a'; ncx.fillRect(0, 38, 128, 10)
    ncx.fillStyle = '#2a3a4a'; ncx.font = 'bold 26px sans-serif'; ncx.textAlign = 'center'; ncx.textBaseline = 'middle'; ncx.fillText('みなみ', 64, 20)
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nc) })); sign.position.set(-2, 2.1, -3.9); grp.add(sign)
    for (const sp of [-3, -1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 6), toon(0x8a8680)); post.position.set(sp, 0.85, -3.9); grp.add(post) }
    // ホームのベンチ×2（電車を待つ駅の情景）＋時刻表
    for (const bx of [-3.8, 3.6]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.5), toon(0x8a6a48)); seat.position.set(bx, 1.06, -4.6); seat.castShadow = true; grp.add(seat)
      const bk = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.42, 0.1), toon(0x8a6a48)); bk.position.set(bx, 1.32, -4.84); grp.add(bk)
      for (const lx of [-0.7, 0.7]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.42), toon(0x6a5238)); lg.position.set(bx + lx, 0.83, -4.6); grp.add(lg) }
    }
    { const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.08), toon(0xe8e2d2)); board.position.set(4.6, 2.0, -3.95); grp.add(board); const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), toon(0x8a8680)); bp.position.set(4.6, 1.0, -3.95); grp.add(bp) } // 時刻表の掲示
    // 線路（枕木＋2本のレール。ホームの外側に短く）
    const sleepGeos = [], railGeos = []
    for (let t = -6.5; t <= 6.5; t += 0.9) { const sl = new THREE.BoxGeometry(2.6, 0.12, 0.4); sl.applyMatrix4(new THREE.Matrix4().makeTranslation(t, 0.06, -7.4)); sleepGeos.push(sl) }
    for (const rr of [-0.8, 0.8]) { const ra = new THREE.BoxGeometry(13, 0.1, 0.12); ra.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0.16, -7.4 + rr)); railGeos.push(ra) }
    if (BufferGeometryUtils.mergeGeometries) {
      const sm = BufferGeometryUtils.mergeGeometries(sleepGeos, false); if (sm) grp.add(new THREE.Mesh(sm, toon(0x5e554a)))
      const rm = BufferGeometryUtils.mergeGeometries(railGeos, false); if (rm) grp.add(new THREE.Mesh(rm, railMat))
    }
    sleepGeos.concat(railGeos).forEach((g) => g.dispose())
    colliders.push({ x: stx, z: stz, r: 4 }) // 歩行: 駅舎には入らない
  }

  // ── 線路と走る電車（駅のホーム外側を通り、街を横切る一直線）。 ──
  {
    const railTopY = (x) => heightAt(x, RAIL.z) + 0.18
    const ballGeos = [], sleepGeos = [], railGeos = []
    for (let x = RAIL.x0; x <= RAIL.x1; x += 0.95) { const gy = heightAt(x, RAIL.z); const sl = new THREE.BoxGeometry(2.7, 0.12, 0.42); sl.applyMatrix4(new THREE.Matrix4().makeTranslation(x, gy + 0.12, RAIL.z)); sleepGeos.push(sl); const bl = new THREE.BoxGeometry(0.95, 0.18, 3.4); bl.applyMatrix4(new THREE.Matrix4().makeTranslation(x, gy + 0.04, RAIL.z)); ballGeos.push(bl) } // 砂利の路盤＋枕木
    for (const rr of [-0.78, 0.78]) for (let x = RAIL.x0; x < RAIL.x1; x += 2.6) { const ra = new THREE.BoxGeometry(2.7, 0.1, 0.12); ra.applyMatrix4(new THREE.Matrix4().makeTranslation(x + 1.3, heightAt(x + 1.3, RAIL.z) + 0.2, RAIL.z + rr)); railGeos.push(ra) }
    if (BufferGeometryUtils.mergeGeometries) {
      const bm = BufferGeometryUtils.mergeGeometries(ballGeos, false); if (bm) { const ball = new THREE.Mesh(bm, toon(0x7c766c)); ball.receiveShadow = true; town.add(ball) }
      const sm = BufferGeometryUtils.mergeGeometries(sleepGeos, false); if (sm) town.add(new THREE.Mesh(sm, toon(0x5e554a)))
      const rm = BufferGeometryUtils.mergeGeometries(railGeos, false); if (rm) { const rmesh = new THREE.Mesh(rm, toon(0x55555c)); town.add(rmesh) }
    }
    ballGeos.concat(sleepGeos, railGeos).forEach((g) => g.dispose())
    // 電車（3両編成。車体・窓帯・床下・台車。夜は窓が灯る）。色違いを2本、半周ずらして走らせる。
    const NCAR = 3, carLen = 5.4, gap = 0.7
    const glassMat = duskAmt > 0.2 ? new THREE.MeshBasicMaterial({ color: 0xffe6b0, fog: true }) : toon(0x36404a)
    const makeTrain = (bodyCol, beltCol) => {
      const tr = new THREE.Group(); town.add(tr)
      for (let i = 0; i < NCAR; i++) {
        const car = new THREE.Group(); car.position.x = i * (carLen + gap); car.userData = { ox: i * (carLen + gap) }; tr.add(car)
        const body = new THREE.Mesh(new RoundedBoxGeometry(carLen, 2.3, 1.95, 2, 0.32), toon(bodyCol)); body.position.y = 1.55; body.castShadow = true; car.add(body)
        const belt = new THREE.Mesh(new THREE.BoxGeometry(carLen + 0.02, 0.2, 1.97), toon(beltCol)); belt.position.y = 2.05; car.add(belt)
        const win = new THREE.Mesh(new THREE.BoxGeometry(carLen * 0.82, 0.72, 1.99), glassMat); win.position.y = 1.95; car.add(win)
        const skirt = new THREE.Mesh(new THREE.BoxGeometry(carLen, 0.6, 1.8), toon(0x4a4640)); skirt.position.y = 0.55; car.add(skirt)
        for (const bx of [-carLen * 0.3, carLen * 0.3]) { const bogie = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.7), toon(0x2a2a2e)); bogie.position.set(bx, 0.32, 0); car.add(bogie) }
      }
      return tr
    }
    const trainLen = NCAR * (carLen + gap)
    train = makeTrain(0xd98a3c, 0xeae2d2); train.userData = { x: RAIL.x0, speed: 9, len: trainLen, stops: true } // 朱橙＝各駅停車（駅で停まる）
    train2 = makeTrain(0x4a7ab0, 0xe0e6ea); train2.userData = { x: RAIL.x0 + (RAIL.x1 - RAIL.x0 + 8) * 0.5, speed: 11, len: trainLen, stops: false } // 青＝通過（速い）
    // 郊外の小さな停留所（無人駅。低いホーム＋上屋＋駅名標＋ベンチ）。線路の東寄り。
    {
      const sxx = 52, szz = RAIL.z + 1.5, syy = heightAt(sxx, szz)
      const g = new THREE.Group(); g.position.set(sxx, syy, szz); town.add(g)
      const plat = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 2.4), toon(0xb8b2a6)); plat.position.y = 0.25; plat.receiveShadow = true; g.add(plat)
      for (const px of [-3.6, 3.6]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.3, 6), toon(0x8a8680)); post.position.set(px, 1.4, 0.6); g.add(post) }
      const proof = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 2.0), toon(0x9a9690)); proof.position.set(0, 2.5, 0.5); proof.castShadow = true; g.add(proof)
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.4), toon(0x8a6a48)); bench.position.set(0, 0.7, 0.7); g.add(bench)
      const nc = document.createElement('canvas'); nc.width = 128; nc.height = 40; const ncx = nc.getContext('2d'); ncx.fillStyle = '#f4efe4'; ncx.fillRect(0, 0, 128, 40); ncx.fillStyle = '#3a6a4a'; ncx.fillRect(0, 31, 128, 9); ncx.fillStyle = '#2a3a4a'; ncx.font = 'bold 22px sans-serif'; ncx.textAlign = 'center'; ncx.textBaseline = 'middle'; ncx.fillText('にしの', 64, 17)
      const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.08), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nc) })); sign.position.set(-2.6, 1.5, -0.3); g.add(sign)
      for (const sp of [-3.6, -1.6]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), toon(0x8a8680)); post.position.set(sp, 0.85, -0.3); g.add(post) }
    }

    // ── 踏切（道が線路と交わる所。電車が近づくと遮断機が下り、警報灯が点滅する）。──
    // 中央通り(x=0)と線路は必ず平面交差するため、踏切はその交点に置く（以前のx=6は幹線とズレて「無踏切で電車が道路を横切る」見えになっていた）
    const crossX = 0
    crossing = { gates: [], lamps: [], cx: crossX }
    // 紅白の遮断桿テクスチャ
    const sc = document.createElement('canvas'); sc.width = 64; sc.height = 8; const scx = sc.getContext('2d')
    for (let i = 0; i < 8; i++) { scx.fillStyle = i % 2 ? '#c0392b' : '#f0ece0'; scx.fillRect(i * 8, 0, 8, 8) }
    const barTex = new THREE.CanvasTexture(sc); barTex.wrapS = THREE.RepeatWrapping; barTex.repeat.set(4, 1)
    const barMat = new THREE.MeshToonMaterial({ map: barTex, gradientMap: grad })
    // 道の舗装（踏切を渡る短い道。z方向に通す）
    const roadGeos = []
    for (let z = RAIL.z - 6; z <= RAIL.z + 6; z += 1.2) { const seg = new THREE.BoxGeometry(4.6, 0.1, 1.3); seg.applyMatrix4(new THREE.Matrix4().makeTranslation(crossX, heightAt(crossX, z) + 0.07, z)); roadGeos.push(seg) }
    if (BufferGeometryUtils.mergeGeometries) { const rmesh = BufferGeometryUtils.mergeGeometries(roadGeos, false); if (rmesh) { const road = new THREE.Mesh(rmesh, toon(0x6e6a64)); road.receiveShadow = true; town.add(road) } }
    roadGeos.forEach((g) => g.dispose())
    // 警報機×2（対角の隅）＋遮断桿。柱は車道(半幅3.75)の外＝路肩に立てる
    for (const gp of [[crossX - 3.4, RAIL.z - 3, 1], [crossX + 3.4, RAIL.z + 3, -1]]) {
      const px = gp[0], pz = gp[1], barDir = gp[2]
      const g = new THREE.Group(); g.position.set(px, heightAt(px, pz), pz); town.add(g)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3.3, 6), toon(0x2a2a2e)); post.position.y = 1.65; post.castShadow = true; g.add(post)
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.34, 0.18), toon(0x2a2a2e)); head.position.y = 3.05; head.rotation.y = barDir > 0 ? -0.5 : 0.5 + Math.PI; g.add(head) // 警報灯の箱（道へ向ける）
      const lampLocal = []
      for (const lx of [-0.22, 0.22]) { const lm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ color: 0x4a1410, fog: true })); lm.position.set(lx, 0, 0.12); head.add(lm); lampLocal.push(lm) }
      const xsign = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 4, 4), toon(0xf0d030)); xsign.position.set(0, 3.05, -0.12); xsign.rotation.z = Math.PI / 4; g.add(xsign) // 警標（黄の×印を菱形で近似）
      const pivot = new THREE.Group(); pivot.position.set(0, 2.5, 0.16); pivot.rotation.z = barDir * 1.45; g.add(pivot) // 起立時=上向き
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 0.16), barMat); bar.position.x = barDir * 1.8; pivot.add(bar)
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), toon(0xf0ece0)); tip.position.x = barDir * 3.5; pivot.add(tip)
      pivot.userData = { barDir }
      crossing.gates.push(pivot); crossing.lamps.push(lampLocal)
    }
  }

  // ── 自販機（路傍にぽつぽつ＝日本の街の象徴。夕/夜は前面が光って灯りになる） ──
  {
    const vendCols = [0xb24a44, 0x4a6692, 0xd6cebe, 0xbe9050] // くすんだ郷愁色（原色を抑える）
    for (let i = 0; i < 8; i++) {
      const side = R() < 0.5 ? -1 : 1
      const vx = side * (4.4 + R() * 1.6)
      const vz = -9 - R() * 64
      const col = vendCols[(R() * vendCols.length) | 0]
      const vm = toon(col)
      if (duskAmt > 0.1) { vm.emissive = new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.35); vm.emissiveIntensity = 0.3 + duskAmt * 0.7 }
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.72), vm)
      box.position.set(vx, heightAt(vx, vz) + 0.95, vz); box.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2
      box.castShadow = true; town.add(box)
    }
  }

  // ── 路傍の低木（植栽）と駐車中の車＝街路の密度・生活感 ──
  {
    const bushHex = season === 'spring' ? 0x7a9a4e : season === 'autumn' ? 0x977a3e : season === 'winter' ? 0x8a9488 : 0x5e7a44
    const bushMat = toon(bushHex)
    const carCols = [0xb0564a, 0xe8e2d4, 0x3a5a7a, 0x9a9488, 0x4a6a4a, 0x2a2a30]
    for (let i = 0; i < 14; i++) {
      const side = R() < 0.5 ? -1 : 1
      const bx = side * (5.2 + R() * 3.6)
      const bz = -6 - R() * 70
      const r = 0.6 + R() * 0.7
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), bushMat)
      bush.position.set(bx, heightAt(bx, bz) + r * 0.7, bz); bush.scale.y = 0.8; bush.castShadow = true; town.add(bush)
    }
    for (let i = 0; i < 6; i++) {
      const side = R() < 0.5 ? -1 : 1
      const cx = side * (3.3 + R() * 0.9)
      const cz = -12 - R() * 54
      const cy = heightAt(cx, cz)
      town.add(mkCar(cx, cy, cz, side > 0 ? 0.05 : -0.05, carCols[(R() * carCols.length) | 0])) // 車体＋窓＋4輪
      // 車は「すり抜けられる」「真上に降りられる」物ではない。歩きの当たり判定と、着地地点の回避に登録する
      // （実機で降り立った時に車の中へ着地し、白い車体が画面の下半分を塞いだ＝2026-07-28の検収で判明）。
      colliders.push({ x: cx, z: cz, r: 1.5 })      // 車体1.7×3.4mを包む当たり
      spawnAvoid.push({ x: cx, z: cz, r: 4.2 })     // 降り立つ時は車1台ぶん離れる
    }
  }

  // ── 風にそよぐ干し物（街が呼吸する＝焼き込みで静止した洗濯物に「動く生気」を足す。煙だけだった動きに仲間を増やす）。──
  // 骨組み(竿・柱)は静止トゥーンで軽量、布だけ各々を個別メッシュにして竿の根元を軸にそよがせる（frameで更新）。歩く目線に入る通り・home付近へ点在。
  if (kind !== 'yato' && weather !== 'snow') {
    const clothCols = [0x9fb0c4, 0xc9a6b0, 0xc4bca0, 0xb0b8a8, 0xd8c8a0, 0xa8c0cc, 0xd0b0a0] // くすんだ生活色（布団・シャツ・タオル）
    const rackFrame = toon(0xb0aaa0) // 物干し竿・柱（淡い灰）
    // 決定的配置(R()非消費＝生成列を乱さない)。home広場のそば＋中央通り沿いの開けた所。
    const racks = [[3.4, 2, 0.2], [-3.6, 9, -0.3], [6.5, -14, 1.4], [-6.2, -26, -1.2], [7.2, -40, 1.5], [-7.0, -54, -1.4], [5.8, -68, 1.3]]
    for (const [rx, rz, ra] of racks) {
      const gy = heightAt(rx, rz); if (gy < SEA.level + 0.6 || blockedAt(rx, rz)) continue
      const grp = new THREE.Group(); grp.position.set(rx, gy, rz); grp.rotation.y = ra; town.add(grp)
      const barY = 1.46, span = 1.9
      for (const px of [-span / 2, span / 2]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, barY, 6), rackFrame); pole.position.set(px, barY / 2, 0); grp.add(pole) } // 二本柱
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, span + 0.16, 6), rackFrame); bar.rotation.z = Math.PI / 2; bar.position.y = barY; grp.add(bar) // 竿
      const nC = 3, cols2 = clothCols
      for (let k = 0; k < nC; k++) {
        const isFut = k === 1 // 真ん中は布団（幅広）
        const cw = isFut ? 1.1 : 0.5 + (k * 0.13), ch = isFut ? 0.78 : 0.62
        const sw = new THREE.Group(); sw.position.set(-span / 2 + 0.34 + k * 0.6, barY - 0.02, 0); grp.add(sw) // 竿の上＝そよぐ支点
        const cm = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, 0.03), toon(cols2[(k + Math.abs((rx * 7 + rz) | 0)) % cols2.length]))
        cm.position.y = -ch / 2; cm.castShadow = true; sw.add(cm) // 布（支点からぶら下げる）
        clothSway.push({ g: sw, ph: (rx * 1.7 + rz * 0.6 + k) % 6.28, ax: 0.5 }) // 洗濯物=よく揺れる
      }
    }
    // 軒先の布団（ベランダ手すりに掛けて干す＝昼の生活感。手すり越しに大きく一枚）。
    for (const [fx, fz, fa] of [[-4.2, -8, 0.2], [4.6, -34, -0.4], [-5.4, -60, 0.3]]) {
      const gy = heightAt(fx, fz); if (gy < SEA.level + 0.6) continue
      const grp = new THREE.Group(); grp.position.set(fx, gy + 1.7, fz); grp.rotation.y = fa; town.add(grp)
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), rackFrame); rail.rotation.z = Math.PI / 2; grp.add(rail)
      const sw = new THREE.Group(); grp.add(sw)
      const fut = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.92, 0.06), toon(clothCols[(Math.abs((fx * 5 + fz) | 0) + 3) % clothCols.length]))
      fut.position.y = -0.46; fut.castShadow = true; sw.add(fut)
      clothSway.push({ g: sw, ph: (fx + fz) % 6.28, ax: 0.22 }) // 布団=重い＝揺れ控えめ
    }
  }

  // ── ゴミ集積所（青ネットを掛けた袋の山＋小さな札＝日本の路傍の象徴。収集日の生活リズムを感じさせる「人の暮らし」の痕跡）。──
  if (kind !== 'yato') {
    const bagCol = 0xe6e2d4 // 乳白のゴミ袋
    for (const [gx, gz, ga] of [[5.4, -10, 0.3], [-6.0, -38, -0.4], [6.6, -64, 1.2]]) {
      const gy = heightAt(gx, gz); if (gy < SEA.level + 0.6 || blockedAt(gx, gz)) continue
      const grp = new THREE.Group(); grp.position.set(gx, gy, gz); grp.rotation.y = ga; town.add(grp)
      const bm = toon(bagCol) // 丸めたゴミ袋の山（乳白）。共有材で軽量。
      for (const [bx, by, bz, br] of [[-0.35, 0.26, 0, 0.3], [0.3, 0.24, 0.1, 0.28], [0, 0.44, -0.05, 0.26], [-0.1, 0.22, 0.3, 0.24]]) {
        const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 1), bm); bag.position.set(bx, by, bz); bag.scale.y = 0.85; bag.castShadow = true; grp.add(bag)
      }
      const net = new THREE.Mesh(new THREE.SphereGeometry(0.66, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: 0x3f6f86, gradientMap: grad, transparent: true, opacity: 0.55, fog: true })) // 青ネット（袋を覆う低いドーム・半透明）
      net.position.y = 0.16; net.scale.set(1.15, 0.95, 0.92); grp.add(net)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), toon(0x9a958c)); post.position.set(0.72, 0.5, 0.42); grp.add(post) // 札の支柱
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.04), toon(0xe8e4d6)); plate.position.set(0.72, 0.92, 0.42); plate.rotation.y = -0.3; grp.add(plate) // 札（役割の気配。文字は出さず色面で静かに）
      colliders.push({ x: gx, z: gz, r: 0.8 })
    }
  }

  // ── 縁台（軒先の木の腰掛け＝夕涼みに腰掛けて街を眺める。「眺めて整う」の足場）。決定的配置(R()非消費)＋統合で軽量。 ──
  { const benG = [], legG = [], potG = [], plG = []
    for (const [bx, bz] of [[7.2, -16], [-6.8, -34], [8.2, -52], [-7.2, -64]]) {
      const by = heightAt(bx, bz); if (by < SEA.level + 0.6) continue
      const top = new THREE.BoxGeometry(1.5, 0.1, 0.46); top.translate(bx, by + 0.42, bz); benG.push(top) // 座面の板
      for (const lx of [-0.6, 0.6]) { const leg = new THREE.BoxGeometry(0.1, 0.42, 0.4); leg.translate(bx + lx, by + 0.21, bz); legG.push(leg) } // 脚
      const pot = new THREE.CylinderGeometry(0.13, 0.1, 0.22, 7); pot.translate(bx + 0.86, by + 0.11, bz); potG.push(pot) // 端の素焼き鉢
      const pl = new THREE.IcosahedronGeometry(0.17, 0); pl.scale(1, 0.9, 1); pl.translate(bx + 0.86, by + 0.32, bz); plG.push(pl) // 鉢の緑
      colliders.push({ x: bx, z: bz, r: 0.9 })
    }
    if (BufferGeometryUtils.mergeGeometries) {
      for (const [arr, hex] of [[benG, 0x9a7e58], [legG, 0x6a5640], [potG, 0xa8694a], [plG, season === 'autumn' ? 0x9a7a3e : 0x5e7a44]]) {
        if (arr.length) { const m = BufferGeometryUtils.mergeGeometries(arr, false); if (m) { const me = new THREE.Mesh(m, toon(hex)); me.castShadow = true; town.add(me) } arr.forEach((gg) => gg.dispose()) }
      }
    }
  }

  // ── 足元の野花（草地に咲く近景＝降り立った時の季節感）。茎＋花を頂点色で1メッシュへ統合＝軽量。 ──
  if (!SNOW) {
    const flowerGeos = []
    const flCols = season === 'spring' ? [0xf0a8c4, 0xf6e07a, 0xf6f1ea, 0xc6a8e0, 0xf2b86a]      // 春＝菜の花/れんげ/桜草
      : season === 'autumn' ? [0xe07aa0, 0xf2f0ea, 0xd0688a, 0xe8a24e, 0xc8506e]                 // 秋＝コスモス/小菊
      : [0xf7f1e4, 0xf6e07a, 0xf3f3ef, 0xeec25e, 0xf0d2da]                                       // 夏＝白詰草/たんぽぽ
    const stemCol = season === 'autumn' ? 0x6a7444 : 0x5e7a44, baseCol = season === 'autumn' ? 0x6e7440 : 0x4e7038
    const oneFlower = (fx, fz) => { // 一本のロリポップでなく、緑の株＋短い茎の小花を数輪＝自然な花株
      const fy = heightAt(fx, fz); if (fy < SEA.level + 0.6) return // 水際は避ける
      const base = new THREE.IcosahedronGeometry(0.12 + R() * 0.06, 0).toNonIndexed(); base.scale(1.3, 0.5, 1.3)
      bakeColGeo(flowerGeos, base, baseCol, fx, fy + 0.05, fz) // 葉の株（足元のボリューム）
      const n = 2 + ((R() * 3) | 0)
      for (let k = 0; k < n; k++) { const ox = (R() - 0.5) * 0.36, oz = (R() - 0.5) * 0.36, h = 0.13 + R() * 0.2
        bakeColGeo(flowerGeos, new THREE.CylinderGeometry(0.012, 0.018, h, 3).toNonIndexed(), stemCol, fx + ox, fy + 0.05 + h / 2, fz + oz) // 短い茎
        const head = new THREE.IcosahedronGeometry(0.05 + R() * 0.035, 0).toNonIndexed(); head.scale(1, 0.72, 1)
        bakeColGeo(flowerGeos, head, flCols[(R() * flCols.length) | 0], fx + ox, fy + 0.05 + h, fz + oz) } // 小花
    }
    for (let i = 0; i < 42; i++) { const a = R() * 6.28, r = 7.5 + R() * 6.5, fx = PARK.x + Math.cos(a) * r, fz = PARK.z + Math.sin(a) * r; oneFlower(fx, fz) } // 公園のまわりの花野
    for (let i = 0; i < 24; i++) { const side = R() < 0.5 ? -1 : 1, fx = side * (5 + R() * 4), fz = -6 - R() * 70; oneFlower(fx, fz) }                          // 街路の植え込みの足元
    if (flowerGeos.length && BufferGeometryUtils.mergeGeometries) { const fm = BufferGeometryUtils.mergeGeometries(flowerGeos, false); if (fm) town.add(new THREE.Mesh(fm, clutterMat)); flowerGeos.forEach((x) => x.dispose()) }
  }

  // ── 路沿いの小さな商店（庇＋袖看板。夕/夜は看板が灯る＝商店街の生活感） ──
  for (const sc of [[-5.6, -16, 0xcabfa6, 0xb0704a], [6, -30, 0xc0baa8, 0x5e7a5e], [-6, -48, 0xc6bdac, 0xa65a68], [5.6, -60, 0xc4bca8, 0xb09a58]]) { // 庇/看板はくすんだ郷愁色（原色のデバッグ感を排す）
    const sx = sc[0], sz = sc[1], gy = heightAt(sx, sz), facing = sx < 0 ? 1 : -1
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.3, 4), toon(sc[2])); b.position.set(sx, gy + 1.65, sz); b.castShadow = true; b.receiveShadow = true; town.add(b)
    const awn = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.4, 1.7), toon(sc[3])); awn.position.set(sx + facing * 1.1, gy + 2.45, sz); awn.rotation.z = facing * 0.12; awn.castShadow = true; town.add(awn)
    const lit = duskAmt > 0.2
    const sg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.0, 1.0), lit ? new THREE.MeshBasicMaterial({ color: sc[3], fog: true }) : toon(sc[3]))
    sg.position.set(sx + facing * 2.25, gy + 2.9, sz + 1.5); town.add(sg)
    // 2階の窓（店主の住まい＝夕夜に灯る。半分は茶の間のテレビの青が明滅＝「誰かが暮らしている」）。店の実体の前面に貼る。
    if (lit) {
      const tvHere = ((sx * 3 + sz) | 0) % 2 === 0
      const base = new THREE.Color(tvHere ? 0x9fbfe0 : 0xffd2a0)
      const wmat = new THREE.MeshBasicMaterial({ color: base.clone(), fog: true })
      const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 1.3), wmat); win2.position.set(sx + facing * 2.22, gy + 2.5, sz - 0.4); town.add(win2)
      const sashH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 1.36), toon(0xcfc6b6)); sashH.position.set(sx + facing * 2.22, gy + 2.5, sz - 0.4); town.add(sashH) // 中桟
      if (tvHere) tvGlow.push({ mat: wmat, base, ph: (sx + sz) % 6.28 })
    }
  }

  // ── 大きなランドマーク（大型スーパー）。歩行目線でも商品化レベルの店構え＝ガラスの店先＋自動ドア＋庇＋外壁の継ぎ目＋屋上設備＋駐車場。 ──
  {
    const x = 24, z = -20, gy = heightAt(x, z), lit = duskAmt > 0.25
    const g = new THREE.Group()
    const wallMat = mottleMat(0xdcd4c6, 90, 0.06, [4, 2]), trimMat = toon(0xcfc6b6), glassMat = toon(0x3b4a55)
    const body = new THREE.Mesh(new THREE.BoxGeometry(20, 9, 14), wallMat); body.position.y = 4.5; body.castShadow = true; body.receiveShadow = true; g.add(body)
    for (const yy of [3.0, 6.2]) { const seam = new THREE.Mesh(new THREE.BoxGeometry(20.1, 0.16, 14.1), trimMat); seam.position.y = yy; g.add(seam) } // 外壁パネルの継ぎ目（大面ののっぺり解消）
    const para = new THREE.Mesh(new THREE.BoxGeometry(20.5, 0.6, 14.5), trimMat); para.position.y = 9.2; g.add(para) // 屋上のパラペット
    // 1階の店先（+z面＝駐車場側）。ガラスのカーテンウォール＋柱割り＋自動ドア＋庇。夜は店内が灯る。
    const fz = 7.05
    const glass = new THREE.Mesh(new THREE.BoxGeometry(18, 3.4, 0.25), lit ? new THREE.MeshBasicMaterial({ color: 0xffe7ad, fog: true }) : glassMat); glass.position.set(0, 2.0, fz); g.add(glass)
    for (let i = 0; i <= 6; i++) { const mul = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.6, 0.34), trimMat); mul.position.set(-9 + i * 3, 2.0, fz + 0.05); g.add(mul) } // 方立（柱割り）
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 0.22), toon(0x2b3640)); door.position.set(0, 1.5, fz - 0.12); g.add(door) // 自動ドア
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 2.0), trimMat); canopy.position.set(0, 3.55, fz + 0.9); canopy.castShadow = true; g.add(canopy) // 玄関の庇
    const sign = new THREE.Mesh(new THREE.BoxGeometry(16, 2.2, 0.6), toon(0xc23a2c)); sign.position.set(0, 7.5, fz + 0.1); g.add(sign) // 店名の赤帯
    const tower = new THREE.Mesh(new THREE.BoxGeometry(12, 3.2, 0.8), toon(0xd23a4a)); tower.position.set(0, 11.4, 0); tower.castShadow = true; g.add(tower) // 屋上の看板塔
    for (const sx of [-10.06, 10.06]) { const sw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 9), glassMat); sw.position.set(sx, 6.2, 0); g.add(sw) } // 側面の窓の帯
    for (let i = 0; i < 3; i++) { const ac = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 2.0), toon(0xbfc2c0)); ac.position.set(-5 + i * 5, 9.8, -3); ac.castShadow = true; g.add(ac) } // 屋上の空調
    // 駐車場（舗装＋白線）＋車＋カート置き場
    const lot = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 13), mottleMat(0x65656d, 80, 0.05, [4, 3])); lot.position.set(0, 0.15, 15); lot.receiveShadow = true; g.add(lot)
    const lineGeos = []
    for (let i = 0; i <= 6; i++) { const lg = new THREE.BoxGeometry(0.16, 0.04, 3.6); lg.translate(-9 + i * 3, 0.32, 12.6); lineGeos.push(lg) }
    if (BufferGeometryUtils.mergeGeometries) { const lm = BufferGeometryUtils.mergeGeometries(lineGeos, false); if (lm) g.add(new THREE.Mesh(lm, toon(0xe6e2d8))); lineGeos.forEach((q) => q.dispose()) } // 駐車枠の白線（統合）
    const pcols = [0xb0564a, 0xe8e2d4, 0x3a5a7a, 0x9a9488, 0x4a6a4a]
    for (let i = 0; i < (LIGHT ? 7 : 11); i++) { g.add(mkCar(-9 + (i % 6) * 3, 0.3, 12.6 + ((i / 6) | 0) * 4.6, 0, pcols[i % pcols.length], 3.2)) } // 車体＋窓＋4輪
    { const corral = new THREE.Group(); corral.position.set(8.5, 0, 19.5); g.add(corral) // カート置き場（屋根＋支柱＋カートの列）
      const croof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 4), trimMat); croof.position.y = 2.2; corral.add(croof)
      for (const cx2 of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), trimMat); post.position.set(cx2, 1.1, 0); corral.add(post) }
      for (let k = 0; k < 4; k++) { const cart = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.9), toon(0x9aa0a4)); cart.position.set(0, 0.5, -1.2 + k * 0.45); corral.add(cart) } }
    g.position.set(x, gy, z); g.rotation.y = -0.3; town.add(g)
    // 駐車場は車がぎっしり並ぶ場所。ここへ降り立つと車の中に着地してしまうので、区画ごと着地の対象外にする。
    // 並んだ車にも当たり判定を入れる（すり抜けて歩けてしまうのを防ぐ）。局所座標を建物の向き(-0.3)で回して世界座標へ。
    { const s = Math.sin(-0.3), c = Math.cos(-0.3)
      const toWorld = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]
      const [lotX, lotZ] = toWorld(0, 15); spawnAvoid.push({ x: lotX, z: lotZ, r: 12 })
      for (let i = 0; i < (LIGHT ? 7 : 11); i++) { const [wx, wz] = toWorld(-9 + (i % 6) * 3, 12.6 + ((i / 6) | 0) * 4.6); colliders.push({ x: wx, z: wz, r: 1.4 }) } }
  }
  // ── パチンコ屋（建物＋縦長の袖看板。夜/夕にだけネオンが煌々と灯る。昼は派手にしない） ──
  {
    const x = -22, z = -28, gy = heightAt(x, z)
    const b = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 7), toon(0xa07888))
    b.position.set(x, gy + 3, z); b.castShadow = true; b.receiveShadow = true; town.add(b)
    const neonOn = duskAmt > 0.25
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 0.4), neonOn ? new THREE.MeshBasicMaterial({ color: 0xff5a7a, fog: true }) : toon(0xcc6a7a))
    sign.position.set(x + 4.3, gy + 9, z); town.add(sign)
    if (neonOn) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(2.7, 9.4, 0.18), new THREE.MeshBasicMaterial({ color: 0x6ad0ff, fog: true }))
      edge.position.set(x + 4.3, gy + 9, z - 0.16); town.add(edge)
    }
    // 1階の店構え（前面+z）。ガラス＋方立＋看板帯。夜は店内が煌々と灯る＝歩行目線の無地箱を脱す。
    const pfz = z + 3.55
    const pglass = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 0.2), neonOn ? new THREE.MeshBasicMaterial({ color: 0xffd6a6, fog: true }) : toon(0x3b4a55)); pglass.position.set(x, gy + 1.7, pfz); town.add(pglass)
    for (let i = 0; i <= 4; i++) { const ml = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.1, 0.3), toon(0x8a7e70)); ml.position.set(x - 3.5 + i * 1.75, gy + 1.7, pfz + 0.04); town.add(ml) } // 方立
    const pband = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.9, 0.34), neonOn ? new THREE.MeshBasicMaterial({ color: 0xffe07a, fog: true }) : toon(0xd0a040)); pband.position.set(x, gy + 3.75, pfz); town.add(pband) // 看板帯（夜は灯る）
  }
  // ── 新装開店の電気屋（バルーンの真下。カラフルな庇＋幟） ──
  {
    const x = 12, z = -14, gy = heightAt(x, z)
    const b = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 6), toon(0xc8ccd0))
    b.position.set(x, gy + 2.5, z); b.castShadow = true; town.add(b)
    const awn = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.5, 2.2), toon(0xd23a4a))
    awn.position.set(x, gy + 3.4, z + 3.4); town.add(awn)
    // 1階の陳列のガラス窓＋入口＋方立（前面+z）＝歩行目線の無地箱を脱す。夕夜は店内が灯る。
    const efz = z + 3.05, eLit = duskAmt > 0.2
    const eglass = new THREE.Mesh(new THREE.BoxGeometry(8, 2.6, 0.2), eLit ? new THREE.MeshBasicMaterial({ color: 0xe3edf2, fog: true }) : toon(0x46545e)); eglass.position.set(x, gy + 1.5, efz); town.add(eglass)
    const edoor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.3, 0.22), toon(0x2b3640)); edoor.position.set(x - 2.7, gy + 1.15, efz - 0.05); town.add(edoor) // 入口
    for (const mx of [-4, 0, 4]) { const ml = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.28), toon(0xcfc6b6)); ml.position.set(x + mx, gy + 1.5, efz + 0.04); town.add(ml) } // 方立
    // 店先の幟（赤白の細い旗）
    for (let k = -2; k <= 2; k++) {
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.7), toon(k % 2 ? 0xffffff : 0xd23a4a))
      flag.position.set(x + k * 1.8, gy + 1.2, z + 4.4); town.add(flag)
    }
  }

  // ── 鳥居（神社の入口。赤い門＝郷愁の目印） ──
  {
    const x = -14, z = -42, gy = heightAt(x, z)
    const red = toon(0xc0392b)
    for (const sx of [-2.6, 2.6]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 7.5, 8), red)
      p.position.set(x + sx, gy + 3.75, z); p.castShadow = true; town.add(p)
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(8, 0.7, 1.1), red); top.position.set(x, gy + 7.4, z); top.castShadow = true; town.add(top)
    const top2 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.45, 0.8), red); top2.position.set(x, gy + 6.3, z); town.add(top2)
  }
  // ── 商店街（小さな店が並ぶ一角＋色とりどりの庇＋店名の看板） ──
  const shopNames = ['八百屋', '魚屋', '酒店', '喫茶', '薬局', '花屋', '本屋'], shopBg = [0x4a8a5a, 0x3a6a9a, 0xb24a3a, 0x6a4a3a, 0x3a8a7a, 0xc04a7a, 0x6a5a3a]
  for (let i = 0; i < 7; i++) {
    const x = -34 + i * 5.2, z = -10, gy = heightAt(x, z)
    const b = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.6, 4.4), toon(wallCols[i % wallCols.length]))
    b.position.set(x, gy + 1.8, z); b.castShadow = true; b.receiveShadow = true; town.add(b)
    const aw = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.35, 1.5), toon([0xc23a2c, 0x3a6a9a, 0x3e8a4a, 0xd8a030][i % 4]))
    aw.position.set(x, gy + 2.5, z + 2.4); town.add(aw)
    mkSignH(x, gy + 3.4, z + 2.3, 0, shopNames[i], shopBg[i % shopBg.length], 0xf4efe2) // 店名の看板
  }

  // ── 自動販売機（街角に灯る。昼夜とも光る前面＝平成の郷愁） ──
  const vmCols = [0xc83838, 0x3a64c8, 0xe0a420]
  // 前面に商品サンプルの列＋購入ボタン＋取り出し口を描いた1枚のテクスチャ＝メッシュを増やさず細部を出す。R()不使用。
  const vendTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96; const x = c.getContext('2d')
    x.fillStyle = '#26262c'; x.fillRect(0, 0, 64, 96) // 庫内の暗がり
    const cans = ['#d83a3a', '#e0a420', '#3a8cc8', '#5aa84a', '#e87a30', '#c84a8a', '#7a5ad8', '#d0c040', '#3aa0a0', '#e2e2e6']
    for (let row = 0; row < 4; row++) for (let col = 0; col < 5; col++) { const cx = 4 + col * 12, cy = 5 + row * 13 // 商品サンプルの列
      x.fillStyle = cans[(row * 7 + col * 3) % cans.length]; x.fillRect(cx, cy, 9, 11) // 缶/ボトル
      x.fillStyle = 'rgba(255,255,255,0.28)'; x.fillRect(cx + 1, cy + 1, 2, 9) // 缶の縦のハイライト
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(cx, cy + 10, 9, 1) } // 棚の影
    x.fillStyle = '#15151a'; x.fillRect(0, 60, 64, 6) // 商品列の下の見切り
    for (let b = 0; b < 5; b++) { x.fillStyle = '#eee8d8'; x.fillRect(5 + b * 12, 62, 9, 4); x.fillStyle = '#c23a3a'; x.fillRect(6 + b * 12, 63, 3, 2) } // 購入ボタンの列（赤ランプ）
    x.fillStyle = '#0b0b0f'; x.fillRect(8, 74, 48, 15); x.fillStyle = 'rgba(255,255,255,0.1)'; x.fillRect(8, 74, 48, 2) // 取り出し口
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.LinearFilter; return t
  })()
  for (const spot of [[-30, -7, 3], [11, -5, 2], [-7, -31, 2], [26, -8, 2]]) {
    for (let k = 0; k < spot[2]; k++) {
      const x = spot[0] + k * 1.3, z = spot[1], gy = heightAt(x, z)
      const vm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 0.8), toon(vmCols[k % 3])); vm.position.set(x, gy + 1.0, z); vm.castShadow = true; town.add(vm)
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.5, 0.06), new THREE.MeshBasicMaterial({ map: vendTex, fog: true })); panel.position.set(x, gy + 1.18, z + 0.44); town.add(panel) // 商品サンプル＋ボタン＋取り出し口の灯る前面
    }
  }
  // ── 電話ボックス（平成の街角の公衆電話。銀枠＋硝子＋赤い天井・夜は中が灯る）。通り沿いに1つ。R()不使用。──
  {
    const px = 5.6, pz = -6, py = heightAt(px, pz)
    if (py > SEA.level + 0.5) {
      const g = new THREE.Group(); g.position.set(px, py, pz)
      const frame = toon(0xb0b4b8), glassM = new THREE.MeshBasicMaterial({ color: 0xbcd2dc, transparent: true, opacity: 0.5, depthWrite: false, fog: true, side: THREE.DoubleSide }), red = toon(0xc23a2e)
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 1.0), frame); base.position.y = 0.1; g.add(base)
      for (const [cx, cz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), frame); post.position.set(cx, 1.25, cz); post.castShadow = true; g.add(post) }
      for (const [gx, gz, rot] of [[0, -0.48, 0], [0, 0.48, 0], [-0.48, 0, Math.PI / 2], [0.48, 0, Math.PI / 2]]) { const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.0), glassM); pane.position.set(gx, 1.3, gz); pane.rotation.y = rot; g.add(pane) }
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.32, 1.08), red); top.position.y = 2.56; top.castShadow = true; g.add(top); g.add(addOutline(top)) // 赤い天井
      const ph = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.12), toon(0x4a6a44)); ph.position.set(0, 1.2, -0.36); g.add(ph) // 中の電話機
      if (isNight || duskAmt > 0.3) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.72), new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: true })); lamp.position.y = 2.36; g.add(lamp) } // 夜は中が灯る
      town.add(g)
      colliders.push({ x: px, z: pz, r: 0.8 }); spawnAvoid.push({ x: px, z: pz, r: 1.6 })
    }
  }
  // 師岡町公園は tree() 定義後にまとめて作る（丘＋樹林で囲むため）。下の「師岡町公園」ブロックを参照。
  // 銭湯（煙突＋立ちのぼる煙）は、frameループと同じスコープ（雲海の宣言の近く）でまとめて作る。下の townSmoke ブロックを参照。

  // ── 電柱・電線（手前から奥へ一列＝強い遠近＝立体感の決め手） ──
  const poleMat = toon(0x6a5c4a)
  const transMat = toon(0x8f8f93), insMat = toon(0xcfcabf) // 柱上変圧器・碍子（共有）
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x2a2a30, fog: true }) // 電線（共有・軽量）
  // スズメ（夕暮れの電線に集まる小鳥）の共有部材＝体・尾・頭。近い数スパンに数羽だけ＝郷愁の決め手。
  const sparrowMat = toon(0x554a3c), sparrowBody = new THREE.SphereGeometry(0.1, 6, 5), sparrowTail = new THREE.BoxGeometry(0.045, 0.03, 0.17)
  const sparrowBeakMat = toon(0x3a3026), sparrowBeak = new THREE.ConeGeometry(0.02, 0.07, 4) // くちばし（球の塊→小鳥らしく）
  let prevAnchors = null
  for (let i = 0; i < 12; i++) {
    const z = 6 - i * 7
    const x = -3 + Math.sin(i * 0.5) * 0.6
    const gy = heightAt(x, z)
    const ph = 9
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, ph, 12), poleMat) // 近景の縦線＝丸く（低ポリの六角柱を脱す）
    pole.position.set(x, gy + ph / 2, z); pole.castShadow = true; town.add(pole)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.18), poleMat)
    arm.position.set(x, gy + ph - 1.0, z); town.add(arm)
    // 街灯（夜のみ・一部の電柱に）。暖色の灯り＋足元の淡い光だまりで、近景の坂を照らし暗黒を救う。
    if (isNight && i % 2 === 0) {
      const lampX = x + 0.9
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd79a, fog: true }))
      lamp.position.set(lampX, gy + ph - 1.6, z); town.add(lamp)
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))
      glow.position.copy(lamp.position); town.add(glow)
      const pool = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16), new THREE.MeshBasicMaterial({ color: 0xffcc88, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }))
      pool.rotation.x = -Math.PI / 2; pool.position.set(lampX, gy + 0.12, z); town.add(pool) // 路面の光だまり
    }
    // 柱上変圧器（半分の電柱に＝街の象徴）
    if (R() < 0.5) {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 10), transMat)
      tr.position.set(x + 0.55, gy + ph - 2.3, z); tr.castShadow = true; town.add(tr)
    }
    // 碍子（腕の両端の小さな白い碍子）
    for (const ex of [-1.05, 1.05]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 6), insMat)
      ins.position.set(x + ex, gy + ph - 0.82, z); town.add(ins)
    }
    // 支線（電柱を支える斜めのワイヤー＝日本の電柱の細部。一部の柱に）
    if (R() < 0.4) {
      const ax = x + (R() < 0.5 ? 2.3 : -2.3)
      const topG = new THREE.Vector3(x, gy + ph - 1.4, z), anc = new THREE.Vector3(ax, gy + 0.1, z + 0.3)
      const guy = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, topG.distanceTo(anc), 4), wireMat)
      guy.position.copy(topG).lerp(anc, 0.5); guy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anc.clone().sub(topG).normalize()); town.add(guy)
    }
    // 引き込み線（電柱から家の軒へ＝細い斜めの線。一部の柱に。本物の街は電柱から各戸へ線が伸びる）
    if (R() < 0.5) {
      const sgn = R() < 0.5 ? 1 : -1
      const top2 = new THREE.Vector3(x + sgn * 0.9, gy + ph - 1.2, z)
      const eave = new THREE.Vector3(x + sgn * (5.0 + R() * 2.5), gy + 3.0 + R() * 1.6, z + (R() - 0.5) * 3)
      const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, top2.distanceTo(eave), 4), wireMat)
      drop.position.copy(top2).lerp(eave, 0.5); drop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eave.clone().sub(top2).normalize()); town.add(drop)
    }
    // 電線を複数本に（碍子の両端＋下段の通信ケーブル＝日本の街の“電線の多さ”が本物感の決め手）
    const anchors = [
      new THREE.Vector3(x - 1.05, gy + ph - 0.7, z),
      new THREE.Vector3(x + 1.05, gy + ph - 0.7, z),
      new THREE.Vector3(x - 0.35, gy + ph - 2.7, z), // 下段（通信ケーブル）
      new THREE.Vector3(x + 0.35, gy + ph - 3.0, z),
    ]
    if (prevAnchors) {
      for (let k = 0; k < anchors.length; k++) {
        const a = prevAnchors[k], bn = anchors[k]
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, a.distanceTo(bn), 4), wireMat)
        wire.position.copy(a).lerp(bn, 0.5)
        wire.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bn.clone().sub(a).normalize())
        town.add(wire)
      }
      // スズメが上段の線にとまる（夜は塒へ帰り不在）。最も近いスパンは並んで一列＝郷愁の決め手、
      // 奥のスパンは時々まばらに。頭を上げ尾を跳ね上げた小さな影。
      if (!isNight && (i === 1 || (i <= 3 && R() < 0.6))) {
        const a = prevAnchors[0], bn = anchors[0] // 上段の線
        const row = i === 1 // 最寄りは確実に一列
        const n = row ? 4 : 1 + ((R() * 2) | 0)
        for (let s = 0; s < n; s++) {
          const t = row ? 0.16 + s * 0.20 + (R() - 0.5) * 0.04 : 0.2 + R() * 0.6
          const p = a.clone().lerp(bn, t)
          const bird = new THREE.Group()
          const body = new THREE.Mesh(sparrowBody, sparrowMat); body.scale.set(1, 1.05, 1.35); bird.add(body)
          const head = new THREE.Mesh(sparrowBody, sparrowMat); head.scale.setScalar(0.6); head.position.set(0, 0.08, 0.12); bird.add(head)
          const tail = new THREE.Mesh(sparrowTail, sparrowMat); tail.position.set(0, 0.03, -0.16); tail.rotation.x = 0.55; bird.add(tail)
          const beak = new THREE.Mesh(sparrowBeak, sparrowBeakMat); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.075, 0.19); bird.add(beak) // くちばし
          bird.position.set(p.x, p.y + 0.12, p.z); bird.rotation.y = (row ? -0.3 : 0) + (R() - 0.5) * 1.4 // ほぼ同じ向き＋少しばらす
          town.add(bird)
          sparrows.push({ g: bird, py: p.y + 0.12, ry: bird.rotation.y, tail, ph: R() * 6.28, hop: 0, hopT: 3 + R() * 10 }) // フレームでぴょこっと跳ねさせる
        }
      }
    }
    prevAnchors = anchors
  }
  // ── 路地裏の電線網（住宅街の上に二次的な電柱と電線を張り巡らす＝日本の街並みの象徴・郷愁の決め手）。垂れる電線が交差する空。 ──
  if (kind !== 'yato') { const secPoleGeos = [], secWireGeos = [], secLampGeos = [], secGlowGeos = [], wM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0)
    const lampNight = isNight || duskAmt > 0.16 // 夕暮れ以降は裏通りに灯りが点る
    const areas2 = [SHRINE, STATION, PARK, MOROOKA, TOWER, TEMPLE, SCHOOL, FUN, DOWNTOWN, STADIUM, HARBOR]
    const skipP = (x, z) => { if (x > SEA.coast && heightAt(x, z) < SEA.level + 1.2) return true; if (Math.abs(x - RIVER.x) < RIVER.bankW + 1) return true; if (Math.abs(x) < 4.5 && z > -98 && z < 28) return true; for (const a of areas2) if (Math.hypot(x - a.x, z - a.z) < a.r + 1) return true; return false }
    const wireSeg = (v1, v2) => { const len = v1.distanceTo(v2); if (len < 0.2) return; const wg = new THREE.CylinderGeometry(0.05, 0.05, len, 4); tmpQ.setFromUnitVectors(UP, v2.clone().sub(v1).normalize()); wM.makeRotationFromQuaternion(tmpQ).setPosition((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, (v1.z + v2.z) / 2); wg.applyMatrix4(wM); secWireGeos.push(wg) }
    const poleLine = (x0, z0, x1, z1, n) => { const perpA = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2, cx = Math.cos(perpA), cz = Math.sin(perpA); let prev = null, pc = 0
      for (let i = 0; i <= n; i++) { const f = i / n, px = x0 + (x1 - x0) * f, pz = z0 + (z1 - z0) * f, py = heightAt(px, pz)
        if (py < SEA.level + 0.8 || skipP(px, pz)) { prev = null; continue }
        const ph = 8.5
        const pg = new THREE.CylinderGeometry(0.15, 0.19, ph, 6); wM.makeTranslation(px, py + ph / 2, pz); pg.applyMatrix4(wM); secPoleGeos.push(pg)
        const ag = new THREE.BoxGeometry(1.7, 0.13, 0.13); wM.makeRotationY(perpA).setPosition(px, py + ph - 0.85, pz); ag.applyMatrix4(wM); secPoleGeos.push(ag)
        const topY = py + ph - 0.7
        if (prev) for (const off of [-0.78, 0.78]) { const v1 = new THREE.Vector3(prev.x + cx * off, prev.y, prev.z + cz * off), v2 = new THREE.Vector3(px + cx * off, topY, pz + cz * off), mid = v1.clone().lerp(v2, 0.5); mid.y -= 0.45; wireSeg(v1, mid); wireSeg(mid, v2) } // 2本の電線（少し垂れる）
        if (lampNight && pc % 3 === 0) { // 三本に一本の電柱に街灯（点在する灯りが裏通りを描く＝郷愁）
          const lx = px + cx * 0.95, lz = pz + cz * 0.95, ly = py + ph - 1.5
          const lg = new THREE.SphereGeometry(0.2, 7, 5); wM.makeTranslation(lx, ly, lz); lg.applyMatrix4(wM); secLampGeos.push(lg)
          const gg = new THREE.SphereGeometry(0.62, 9, 7); wM.makeTranslation(lx, ly, lz); gg.applyMatrix4(wM); secGlowGeos.push(gg)
        }
        pc++
        prev = { x: px, y: topY, z: pz }
      }
    }
    poleLine(-50, 24, -50, -118, 16); poleLine(-104, 20, -104, -118, 15) // 南北の電線
    poleLine(-185, -28, 58, -28, 26); poleLine(-185, -76, 58, -76, 26); poleLine(-185, 14, 58, 14, 24) // 東西の電線（南北の線と交差して網に）
    if (BufferGeometryUtils.mergeGeometries) {
      const pm = BufferGeometryUtils.mergeGeometries(secPoleGeos, false); if (pm) { const mesh = new THREE.Mesh(pm, poleMat); mesh.castShadow = true; town.add(mesh) } secPoleGeos.forEach((g) => g.dispose())
      const wm2 = BufferGeometryUtils.mergeGeometries(secWireGeos, false); if (wm2) town.add(new THREE.Mesh(wm2, wireMat)); secWireGeos.forEach((g) => g.dispose())
      if (secLampGeos.length) {
        const lm = BufferGeometryUtils.mergeGeometries(secLampGeos, false); if (lm) town.add(new THREE.Mesh(lm, new THREE.MeshBasicMaterial({ color: 0xffd79a, fog: true })))
        const gm = BufferGeometryUtils.mergeGeometries(secGlowGeos, false); if (gm) town.add(new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })))
        secLampGeos.forEach((g) => g.dispose()); secGlowGeos.forEach((g) => g.dispose())
      }
    }
  }
  // ── カーブミラー（坂の角の凸面鏡。日本の生活道路の象徴＝本物感） ──
  for (const [mx, mz, face] of [[4.3, -20, -1], [-4.6, -50, 1]]) {
    const gy = heightAt(mx, mz)
    const g = new THREE.Group(); g.position.set(mx, gy, mz)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.1, 6), toon(0xd9913f)); post.position.y = 1.55; post.castShadow = true; g.add(post)
    const head = new THREE.Group(); head.position.set(face * 0.45, 3.05, 0); head.rotation.y = face * 0.5
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16), toon(0xd9913f)); frame.rotation.x = Math.PI / 2; head.add(frame)
    const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 16), toon(0xaebcc8)); mirror.rotation.x = Math.PI / 2; mirror.position.z = 0.06; head.add(mirror)
    g.add(head); town.add(g)
  }
  // ── 道沿いの生垣（低い緑の連なりが通りを縁取る＝住宅街の生活感。門口で時々途切れる） ──
  const hedgeCol = season === 'autumn' ? 0x867c46 : weather === 'snow' ? 0x6e7a64 : season === 'spring' ? 0x6f8a4a : 0x577142 // 季節で色味
  const hMat = mottleMat(hedgeCol, 72, 0.26, [3, 1]) // 葉の塊の濃淡ムラ＝刈り込んだ生垣の葉表（近景でベタ緑の板を脱す。描画数は不変・材1枚）
  // 生垣の季節の彩り（春＝ツツジの紅桃白、秋＝色づき/実の紅橙、冬＝雪に映える山茶花の紅。夏は青々と無し）。
  const bloomCols =
    season === 'spring' ? [0xe884a4, 0xf0a8be, 0xf6ecf0]
      : season === 'autumn' ? [0xc24a38, 0xcf7a36]
        : weather === 'snow' ? [0xc83a44]
          : null
  const bloomMats = bloomCols && bloomCols.map(toon)
  const bloomGeo = bloomMats && new THREE.IcosahedronGeometry(0.2, 0) // 花房の共有玉（低ポリ・乗算で柔らかく）
  for (const side of [-1, 1]) {
    for (let z = 8; z > -60; z -= 4.0) {
      if (R() < 0.42) continue // 門・駐車場の切れ目
      const hx = side * (4.1 + R() * 0.5)
      const hy = heightAt(hx, z)
      const hw = 3.4 + R() * 0.6
      const seg = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.9 + R() * 0.3, 0.85), hMat)
      seg.position.set(hx, hy + 0.5, z); seg.castShadow = true; seg.receiveShadow = true; town.add(seg)
      // 生垣の上面に季節の花房を（春のツツジは咲き満ちて密に＝面で覆う・秋冬は実がまばらに）
      const spr = season === 'spring'
      if (bloomMats && R() < (spr ? 0.9 : 0.4)) {
        const nb = spr ? 3 + ((R() * 3) | 0) : 1 + ((R() * 2) | 0)
        for (let b = 0; b < nb; b++) {
          const fb = new THREE.Mesh(bloomGeo, bloomMats[(R() * bloomMats.length) | 0])
          fb.position.set(hx + (R() - 0.5) * (hw - 0.3), hy + 0.96 + R() * 0.12, z + (R() - 0.4) * 0.6)
          const s = spr ? 1.0 + R() * 0.7 : 0.6 + R() * 0.4
          fb.scale.set(s, s * 0.65, s); town.add(fb)
        }
      }
    }
  }
  // ── 玄関先の植木鉢（通り沿いにぽつぽつ＝日本の住宅街の生活感。鉢＋小さな緑） ──
  const potMat = toon(0x9a6a4e), potGreens = [toon(0x6a8a4a), toon(0x7e9850), toon(0x8aa055), toon(0xb08a64)]
  for (let i = 0; i < 12; i++) {
    const px = (R() < 0.5 ? -1 : 1) * (3.85 + R() * 0.7)
    const pz = 6 - R() * 44
    const py = heightAt(px, pz)
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.32, 8), potMat); pot.position.set(px, py + 0.16, pz); pot.castShadow = true; town.add(pot)
    const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25 + R() * 0.1, 0), potGreens[(R() * potGreens.length) | 0]); pl.position.set(px, py + 0.48, pz); pl.scale.y = 1.2; pl.castShadow = true; town.add(pl)
  }
  // ── 赤い丸ポスト（日本の街の象徴。通り沿いに1本） ──
  {
    const px = 4.0, pz = -8, py = heightAt(px, pz)
    const g = new THREE.Group(); g.position.set(px, py, pz)
    const red = toon(0xb83128)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8), red); leg.position.y = 0.2; g.add(leg)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 1.5, 12), red); body.position.y = 0.95; body.castShadow = true; g.add(body)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), red); dome.position.y = 1.7; g.add(dome)
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.05), toon(0x201a18)); slot.position.set(0, 1.36, 0.33); g.add(slot) // 投函口
    town.add(g)
  }
  // ── 停止線（横断歩道の手前・白い太線＝近景の路面標示） ──
  {
    const sz = -1.3
    const line = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.03, 0.42), new THREE.MeshLambertMaterial({ color: 0xc8c4ba }))
    line.position.set(-1.6, heightAt(-1.6, sz) + 0.085, sz); town.add(line)
  }
  // ── 横断歩道（停止線の先・白い縞＝近景の路面標示。窓から見下ろす中央の道に現実感を）。縞は道幅いっぱいの横長を奥行きに数本。道の勾配に沿わせ1メッシュへ統合。──
  {
    const geos = []
    for (let i = 0; i < 4; i++) { const zc = -2.3 - i * 0.72, sy = heightAt(0, zc) + 0.085; const g2 = new THREE.BoxGeometry(5.4, 0.03, 0.46); g2.translate(0, sy, zc); geos.push(g2) } // 白い縞4本（道幅いっぱい・奥行きに並ぶ）
    if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const cw = new THREE.Mesh(m, new THREE.MeshLambertMaterial({ color: 0xcac6bc })); cw.receiveShadow = true; town.add(cw) } geos.forEach((g2) => g2.dispose()) }
  }
  // ── バス停の標識（細い支柱＋丸看板＝通りの生活感） ──
  {
    const px = -4.2, pz = -26, py = heightAt(px, pz)
    const g = new THREE.Group(); g.position.set(px, py, pz)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), toon(0x9a9488)); pole.position.y = 1.3; pole.castShadow = true; g.add(pole)
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 16), toon(0xe8e2d0)); sign.rotation.x = Math.PI / 2; sign.position.set(0, 2.5, 0.1); g.add(sign)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 20), toon(0x3a6a4a)); ring.position.set(0, 2.5, 0.16); g.add(ring)
    town.add(g)
  }
  } // ← 建物・ランドマーク（街のみ）ここまで

  // ── 隣室の壁（角部屋の右手の高層マンションの壁面）。右へ見回すと迫り出して街を遮る＝角部屋にいる手応え。kind:'corner'のみ。 ──
  if (kind === 'corner') {
    const nwMat = toon(0xb4b0a6)
    const rep = 7
    const nm = winMapBase.clone(); nm.repeat.set(rep, rep * 1.5); nm.needsUpdate = true; nwMat.map = nm
    if (duskAmt > 0.12) { // 夕/夜は隣室の窓も灯る（窓割りはwinMapBase=種類0に揃える）
      const ne = winEmis[0].clone(); ne.repeat.set(rep, rep * 1.5); ne.needsUpdate = true
      nwMat.emissiveMap = ne; nwMat.emissive = new THREE.Color(0xffcaa0); nwMat.emissiveIntensity = 0.3 + duskAmt * 0.6
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.5, 58, 44), nwMat)
    wall.position.set(15.5, 18, 9); wall.castShadow = true; wall.receiveShadow = true; scene.add(wall)
    const gap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 58, 44), toon(0x2a2722)); gap.position.set(13.55, 18, 9); scene.add(gap) // 壁との間の暗い路地＝奥行き
  }

  // ── 木立（トゥーンの丸い樹冠＋幹。そよ風に揺れる） ──
  const trunkMat = toon(0x6b4a2e)
  // 季節で葉色を「下＝陰の濃い色／上＝陽の当たる淡い色」の対で持つ＝樹冠に陰影の立体（綿玉のベタ球を脱す）。
  // 同じ添字どうしが対（春の桜/新緑、秋の紅葉/常緑…「種」が揃う）。春=桜と新緑、秋=紅葉＋常緑、冬=暗い常緑、夏=緑。
  const [leafBase, leafHi] =
    season === 'spring'
      ? [[0xd99cb8, 0xcf90ad, 0x7fa05c, 0xd29ab4], [0xf3d4e2, 0xf7e6ee, 0x9ec078, 0xedccdc]] // 桜（陰の薔薇色→陽の白桜）＋新緑
      : season === 'autumn'
        ? [[0xb86a32, 0xa85a36, 0x9a6a30, 0x4e6048, 0x586a50], [0xe0a858, 0xd89a4a, 0xc98a40, 0x687a54, 0x70845a]] // 紅葉＋常緑(杉松)
        : weather === 'snow'
          ? [[0x44543e, 0x4e6048, 0x42503c], [0x586a50, 0x627458, 0x54664e]]
          : [[0x46673a, 0x547a40, 0x648a48, 0x748f4c, 0x52784a, 0x5e8444], [0x689050, 0x7ea05c, 0x92b066, 0xa2b66e, 0x86a868, 0x90ac5c]] // 夏の樹冠に色幅（深緑〜若葉〜黄緑〜青緑）＝同色の綿玉畑を脱す
  const leafBaseMats = leafBase.map((c) => { const m = toon(c); m.vertexColors = true; return m }) // 樹冠に頂点色の上下グラデ（陰陽）を効かせる
  const leafHiMats = leafHi.map(toon)
  const treesArr = []
  const trunkGeos = [] // 全ての幹を1メッシュへ統合（静止＝ドローコール大幅削減）
  function tree(x, z, scale) {
    const gy = heightAt(x, z)
    if (Math.hypot(x, z) > 58) homeTreeShadows.push([x, gy, z, 1.5 + scale * 0.5]) // 静的影の外(遠い)木は足元に接地影を敷いて浮きを消す（範囲内の木は焼き影があるので不要）
    const g = new THREE.Group()
    const r = 1.6 + R() * 1.4
    const ci = (R() * leafBaseMats.length) | 0
    const det = scale > 0.85 ? 3 : 2 // 樹冠の分割を上げて輪郭を丸く＝低ポリの塊を脱す。木ごとに1メッシュ統合なので三角形増のみ・描画コール不変（鮮明さ優先で中〜大の木をdet3へ広げ近景の面段差を緩和。極小の茂みのみdet2）
    // 樹形のばらつき＝同形のロリポップ畑を脱す。縦長(杉檜風)/横広(落葉樹の傘)/標準を振る。
    const form = R()
    const tall = form > 0.68, broad = form < 0.28
    const trunkH = tall ? 3.1 : broad ? 2.1 : 2.5 // 幹を少し高く＝目線で樹冠の下が抜ける（街路を歩いて見通せる・俯瞰はほぼ不変）
    const ax = broad ? 1.32 : tall ? 0.72 : 1.06           // 樹冠の横倍率
    const ay = tall ? 1.5 : broad ? 0.74 : 0.9 + R() * 0.16 // 樹冠の縦倍率
    const tilt = (R() - 0.5) * 0.12 // わずかな基準傾き
    // 幹: 木ごとの world 変換を焼き込んで trunkGeos へ（後でまとめて1メッシュ・静止）。
    const tg = new THREE.CylinderGeometry(0.2, 0.36, trunkH, det > 1 ? 9 : 6)
    tg.applyMatrix4(new THREE.Matrix4().makeTranslation(0, trunkH / 2, 0))
    tg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, gy, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt)), new THREE.Vector3(scale, scale, scale)))
    trunkGeos.push(tg)
    // 葉: 主房＋房をローカルで作り1つへ統合（木ごとに1メッシュ。陰色で統一＝トゥーンの陰影で立体感）。
    const leafGeos = []
    const main = new THREE.IcosahedronGeometry(r, det)
    main.applyMatrix4(new THREE.Matrix4().makeScale(ax, ay, ax)); main.applyMatrix4(new THREE.Matrix4().makeTranslation(0, trunkH + r * ay * 0.5, 0))
    leafGeos.push(main)
    const nC = scale > 1.4 ? 3 + ((R() * 2) | 0) : 1 + (R() < 0.5 ? 1 : 0) // 房数は元に戻す（性能優先）。輪郭の不揃いは色幅と樹形(tall/broad)で出す
    for (let k = 0; k < nC; k++) {
      const cr = r * (0.44 + R() * 0.42), s = 0.85 + R() * 0.3
      const cg = new THREE.IcosahedronGeometry(cr, det)
      cg.applyMatrix4(new THREE.Matrix4().makeScale(s, s, s))
      cg.applyMatrix4(new THREE.Matrix4().makeTranslation((R() - 0.5) * r * ax * 1.5, trunkH + r * ay * (0.42 + (k + 1) / (nC + 1) * 0.95), (R() - 0.4) * r * ax * 1.1))
      leafGeos.push(cg)
    }
    const merged = BufferGeometryUtils.mergeGeometries ? BufferGeometryUtils.mergeGeometries(leafGeos, false) : leafGeos[0]
    leafGeos.forEach((lg) => { if (lg !== merged) lg.dispose() })
    // 樹冠の上下に陰影（下=陰り0.8 / 上=陽の当たり1.22）を頂点色で焼く＝統合で失った陰陽の立体感を無コストで回復。
    { const mp = merged.attributes.position, cols = new Float32Array(mp.count * 3); let minY = Infinity, maxY = -Infinity
      for (let i = 0; i < mp.count; i++) { const y = mp.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y }
      const span = Math.max(0.001, maxY - minY)
      for (let i = 0; i < mp.count; i++) { const v = 0.8 + (mp.getY(i) - minY) / span * 0.42; cols[i * 3] = v; cols[i * 3 + 1] = v; cols[i * 3 + 2] = v }
      merged.setAttribute('color', new THREE.BufferAttribute(cols, 3)) }
    const leafMesh = new THREE.Mesh(merged, leafBaseMats[ci]); leafMesh.castShadow = true; g.add(leafMesh)
    g.position.set(x, gy, z); g.scale.setScalar(scale); g.rotation.z = tilt; town.add(g)
    g.userData = { ph: R() * 6.28, amp: 0.02 + R() * 0.02, tilt }
    colliders.push({ x, z, r: scale * 0.35 + 0.3 })   // 歩行: 幹だけ避ける（樹冠の下はくぐれる）
    spawnAvoid.push({ x, z, r: scale * 1.7 + 0.5 })   // 着地: 樹冠に埋もれて降りない
    treesArr.push(g)
  }
  if (kind === 'yato') {
    // 里山（谷の左右と奥の斜面）を木々で覆う。谷底の棚田には木を置かない。
    for (let i = 0; i < 155; i++) {
      const x = (R() - 0.5) * 150, z = -92 + R() * 120
      if (Math.abs(x) < 14 && z > -46 && z < 8) continue   // 谷底（棚田）は空ける
      tree(x, z, 0.7 + R() * 0.9)
    }
    for (const c of [[-16, 19], [17, 20], [-21, 14], [21, 16]]) tree(c[0], c[1], 1.7 + R() * 0.5) // 手前の額装木立
  } else {
    for (let i = 0; i < (LIGHT ? 150 : 232); i++) { // 非力端末は散在木を間引く。拡張した旗艦home全域に緑を行き渡らせる
      const x = -200 + R() * 335, z = -189 + R() * 223 // 拡張した西/北まで覆う
      if (Math.abs(x) < 4.5 && z > -2) continue          // 手前中央の道は空ける
      if (Math.hypot(x - DOWNTOWN.x, z - DOWNTOWN.z) < DOWNTOWN.r - 5) continue // 副都心は街路樹で別途
      if (Math.hypot(x - STADIUM.x, z - STADIUM.z) < STADIUM.r) continue // 競技場は空ける
      if (Math.hypot(x - SHRINE.x, z - SHRINE.z) < SHRINE.r) continue // 神社の境内は専用の木立で囲む
      if (Math.abs(x - RIVER.x) < RIVER.bankW + 1) continue // 川筋は空ける（水際の木は別途）
      if (Math.hypot(x - STATION.x, z - STATION.z) < STATION.r - 2) continue // 駅前は空ける
      if (Math.hypot(x - PARK.x, z - PARK.z) < PARK.r - 1) continue // 公園は専用の木立で囲む
      if (Math.hypot(x - MOROOKA.x, z - MOROOKA.z) < MOROOKA.r - 1) continue // 師岡町公園も専用の樹林で囲む
      if (Math.hypot(x - TOWER.x, z - TOWER.z) < TOWER.r) continue // 展望塔の足元は空ける
      if (Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < TEMPLE.r - 2) continue // 寺は専用の木立で囲む
      if (Math.hypot(x - SCHOOL.x, z - SCHOOL.z) < SCHOOL.r - 1) continue // 学校は校庭を空ける
      if (Math.hypot(x - YAMAYURI.x, z - YAMAYURI.z) < YAMAYURI.r - 1) continue // やまゆりホームの前庭は専用に
      if (inFestZone(x, z)) continue // 祭り会場（やぐら/提灯/屋台が木に食い込まないよう空ける）
      if (Math.hypot(x - PLAZA_HOME.x, z - PLAZA_HOME.z) < PLAZA_HOME.r) continue // 目の前の広場は空ける
      if (Math.hypot(x - PLAZA_GATE.x, z - PLAZA_GATE.z) < PLAZA_GATE.r) continue // 入口の広場は空ける
      if (Math.hypot(x - FUN.x, z - FUN.z) < FUN.r - 1) continue // 遊園地は空ける
      if (x > SEA.coast && heightAt(x, z) < SEA.level + 1.5) continue // 海・汀には木を生やさない
      if (Math.hypot(x - HARBOR.x, z - HARBOR.z) < HARBOR.r) continue // 工業地帯には木を生やさない
      if (Math.abs(z - RAIL.z) < 2.7 && x > RAIL.x0 - 1 && x < RAIL.x1 + 1) continue // 線路の通り道は空ける
      tree(x, z, 0.7 + R() * 0.8)
    }
    // 手前の縁の大きな木立（窓の下辺を額装する近景＝奥行きの起点）
    for (const c of [[-12, 20], [13, 21], [-18, 16], [18, 18]]) tree(c[0], c[1], 1.7 + R() * 0.5)
    // ── 路傍の什器（脱ローポリ＝歩いて回る目線の生活感）。建物・木に被らない通りの隙間へ。頂点色で焼いて数drawへ統合。──
    if (kind !== 'yato') {
      const occupied = (x, z, pad) => { for (const s of spawnAvoid) if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return true; return false }
      const col = (geo, hex) => { const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b }; geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo }
      const bake = (arr, geo, hex, lx, ly, lz) => { geo.translate(lx, ly, lz); arr.push(col(geo, hex)) }
      const lit = duskAmt > 0.2, furn = [], glow = []  // furn=トゥーン(頂点色)へ統合／glow=自販機の夜灯り(MeshBasic)
      const vendBody = [0xc0392b, 0x2a6a9a, 0x3a8a5a, 0xd8a838]
      let nVend = 0, nBike = 0, nWall = 0
      for (let i = 0; i < (LIGHT ? 120 : 230); i++) {
        const x = -78 + R() * 168, z = -84 + R() * 80
        if (z > -3) continue                                                      // 窓のすぐ前は空けて景色を抜く
        if (heightAt(x, z) < SEA.level + 1.3 || x > SEA.coast - 2) continue        // 海・汀は不可
        if (Math.abs(x - RIVER.x) < RIVER.bankW + 1 && z > -130 && z < 46) continue // 川筋は不可
        if (occupied(x, z, 0.9)) continue                                          // 建物・木に被らない
        const gy = heightAt(x, z), r = R()
        if (r < 0.16 && nVend < (LIGHT ? 6 : 12)) {                                // 自販機（夜は灯る・1〜2台並ぶ）＝日本の通りの象徴
          const a = R() * 6.283, n2 = R() < 0.5 ? 2 : 1
          for (let k = 0; k < n2; k++) { const vx = x + Math.cos(a) * 0.5 * k, vz = z + Math.sin(a) * 0.5 * k
            bake(furn, new THREE.BoxGeometry(0.92, 1.85, 0.7), vendBody[(R() * 4) | 0], vx, gy + 0.93, vz)
            const panel = new THREE.BoxGeometry(0.76, 1.2, 0.06); panel.translate(vx, gy + 1.05, vz + 0.36)
            if (lit) glow.push(col(panel, 0xfff0c0)); else furn.push(col(panel, 0xe8eef0))
            colliders.push({ x: vx, z: vz, r: 0.6 }) }
          nVend++
        } else if (r < 0.6 && nWall < (LIGHT ? 34 : 64)) {                         // ブロック塀の一節（通りを縁取る）
          const horiz = R() < 0.5, L = 2.4 + R() * 2.2, hh = 1.0 + R() * 0.5
          bake(furn, new THREE.BoxGeometry(horiz ? L : 0.22, hh, horiz ? 0.22 : L), 0xc3bdae, x, gy + hh / 2, z)
          bake(furn, new THREE.BoxGeometry(horiz ? L + 0.1 : 0.32, 0.12, horiz ? 0.32 : L + 0.1), 0x9a958c, x, gy + hh + 0.06, z) // 笠木
          nWall++
        } else if (r < 0.82) {                                                     // プランター（鉢＋植栽）
          bake(furn, new THREE.BoxGeometry(0.7, 0.4, 0.5), 0xb5764a, x, gy + 0.2, z)
          bake(furn, new THREE.BoxGeometry(0.62, 0.34, 0.42), season === 'autumn' ? 0x9a7a3a : season === 'winter' ? 0x6e7a64 : 0x5e7a44, x, gy + 0.55, z)
        } else if (nBike < (LIGHT ? 6 : 14)) {                                     // 停めた自転車（簡略：車輪×2＋フレーム＋サドル）
          const a = R() * 6.283, fc = [0x3a5a7a, 0x6a6a6e, 0x7a5a4a, 0x3a6a5a][(R() * 4) | 0]
          for (const wz of [-0.5, 0.5]) { const wheel = new THREE.TorusGeometry(0.32, 0.05, 6, 10); wheel.rotateY(a); wheel.translate(x + Math.cos(a) * wz, gy + 0.32, z + Math.sin(a) * wz); bake(furn, wheel, 0x2a2a2e, 0, 0, 0) }
          const frame = new THREE.BoxGeometry(0.06, 0.5, 0.9); frame.rotateY(a); frame.translate(x, gy + 0.55, z); bake(furn, frame, fc, 0, 0, 0)
          const seat = new THREE.BoxGeometry(0.13, 0.08, 0.28); seat.rotateY(a); seat.translate(x - Math.cos(a) * 0.3, gy + 0.82, z - Math.sin(a) * 0.3); bake(furn, seat, 0x2a2a2e, 0, 0, 0)
          nBike++
        }
      }
      if (BufferGeometryUtils.mergeGeometries) {
        if (furn.length) { const m = BufferGeometryUtils.mergeGeometries(furn, false); if (m) { const fm = toon(0xffffff); fm.vertexColors = true; const me = new THREE.Mesh(m, fm); me.castShadow = true; me.receiveShadow = true; town.add(me) } furn.forEach((q) => q.dispose()) }
        if (glow.length) { const m = BufferGeometryUtils.mergeGeometries(glow, false); if (m) town.add(new THREE.Mesh(m, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }))); glow.forEach((q) => q.dispose()) }
      }
    }

    // ── 鎮守の森の神社（飛んでいく目的地のランドマーク）。鳥居・社・石段・灯籠＋囲む木立。──
    {
      const sx = SHRINE.x, sz = SHRINE.z, baseY = heightAt(sx, sz)
      const woodMat = toon(0x8a6a48), vermilion = toon(0xc1442e), stoneMat = mottleMat(0x9a958c, 80, 0.1, [2, 2]), roofMat = toon(0x55585e)
      const grp = new THREE.Group(); grp.position.set(sx, baseY, sz); grp.rotation.y = Math.atan2(-sx, -sz) // 参道(+z)を街の中心へ向ける
      const baseStoneGeos = [] // 基壇＋石段（静止・石材）を1メッシュへ統合（描画コール削減・見た目は完全同一）
      { const g0 = new THREE.CylinderGeometry(8.5, 9, 1.4, 24); g0.translate(0, 0.2, 0); baseStoneGeos.push(g0) } // 石の基壇
      const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 3.8), woodMat); body.position.set(0, 2.2, -3.5); body.castShadow = true; grp.add(body) // 拝殿
      const rg = new THREE.CylinderGeometry(2.5, 2.5, 6, 3, 1); rg.rotateZ(Math.PI / 2); rg.rotateY(Math.PI / 2)
      const roof = new THREE.Mesh(rg, roofMat); roof.position.set(0, 3.9, -3.5); roof.scale.set(1, 0.78, 1.15); roof.castShadow = true; grp.add(roof); grp.add(addOutline(roof)) // 切妻屋根
      { const vermGeos = [], vM = new THREE.Matrix4() // 鳥居（柱2＋笠木＋貫＝静止・朱）を1メッシュへ統合（見た目は完全同一）
        for (const px of [-2.3, 2.3]) { const pil = new THREE.CylinderGeometry(0.26, 0.3, 5.2, 10); vM.makeTranslation(px, 3.5, 5.2); pil.applyMatrix4(vM); vermGeos.push(pil) } // 鳥居の柱
        const kasagi = new THREE.BoxGeometry(6.4, 0.55, 0.8); kasagi.translate(0, 6.0, 5.2); vermGeos.push(kasagi)
        const nuki = new THREE.BoxGeometry(5.6, 0.34, 0.42); nuki.translate(0, 5.0, 5.2); vermGeos.push(nuki)
        if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(vermGeos, false); if (m) { const me = new THREE.Mesh(m, vermilion); me.castShadow = true; grp.add(me) } vermGeos.forEach((g) => g.dispose()) } }
      for (let s = 0; s < 4; s++) { const st = new THREE.BoxGeometry(3.4, 0.22, 0.7); st.translate(0, 0.78 - s * 0.16, 6.6 + s * 0.7); baseStoneGeos.push(st) } // 石段
      if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(baseStoneGeos, false); if (m) { const me = new THREE.Mesh(m, stoneMat); me.receiveShadow = true; grp.add(me) } baseStoneGeos.forEach((g) => g.dispose()) } // 基壇＋石段を1メッシュに
      for (const lx of [-2.7, 2.7]) { // 灯籠×2
        const lan = new THREE.Group(); lan.position.set(lx, 0.9, 2.2)
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.5, 8), stoneMat)
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.2, 8), stoneMat); post.position.y = 0.85
        const fire = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), duskAmt > 0.2 ? new THREE.MeshBasicMaterial({ color: 0xffce86 }) : toon(0xb0a890)); fire.position.y = 1.7 // 火袋（夕夜はほのかに灯る）
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.42, 4), stoneMat); cap.rotation.y = Math.PI / 4; cap.position.y = 2.12
        for (const m of [foot, post, fire, cap]) { m.castShadow = true; lan.add(m) }
        grp.add(lan)
      }
      // ── 狛犬×2（参道を守る阿吽の対）。石の台座＋うずくまる体＋頭＝神社の風格。R()不使用で生成列を保つ。──
      for (const kx of [-2.7, 2.7]) {
        const kd = new THREE.Group(); kd.position.set(kx, 0.9, 3.9)
        const ped = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.0, 0.86), stoneMat); ped.position.y = 0.5; ped.castShadow = true; kd.add(ped) // 台座
        const bodyK = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 0.86), stoneMat); bodyK.position.set(0, 1.32, -0.04); bodyK.castShadow = true; kd.add(bodyK) // 座した体
        const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.62, 8), stoneMat); chest.position.set(0, 1.1, 0.34); chest.castShadow = true; kd.add(chest) // 前脚
        const headK = new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 1), stoneMat); headK.position.set(0, 1.78, 0.28); headK.castShadow = true; kd.add(headK) // 頭
        kd.rotation.y = kx > 0 ? -0.22 : 0.22 // 参道側へ少し向く
        grp.add(kd)
      }
      // ── 賽銭箱＋鈴＋鈴緒（拝殿の正面＝お参りの中心）。──
      const saisen = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.95), toon(0x6a5236)); saisen.position.set(0, 1.0, -1.6); saisen.castShadow = true; grp.add(saisen) // 賽銭箱
      const saiTop = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.14, 1.06), toon(0x463726)); saiTop.position.set(0, 1.43, -1.6); grp.add(saiTop) // 格子の天板
      const suzu = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), toon(0xc9a544)); suzu.position.set(0, 2.95, -1.85); suzu.castShadow = true; grp.add(suzu) // 鈴（真鍮）
      const suzuo = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.25, 6), toon(0xc4473a)); suzuo.position.set(0, 2.28, -1.82); grp.add(suzuo) // 鈴緒（紅白の綱・簡略）
      // ── 注連縄＋紙垂（鳥居に渡す＝結界の気配）。──
      const shime = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 5.0, 7), toon(0xcfc09a)); shime.rotation.z = Math.PI / 2; shime.position.set(0, 5.42, 5.2); grp.add(shime) // 注連縄
      for (const sd of [-1.5, 0, 1.5]) { const shide = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.04), toon(0xf2f0e8)); shide.position.set(sd, 5.08, 5.2); grp.add(shide) } // 紙垂（白い紙の稲妻）
      // ── 絵馬掛け（願いの木札がずらり＝彩りと祈りの気配）。──
      { const ema = new THREE.Group(); ema.position.set(4.2, 0.0, 2.0); ema.rotation.y = -0.6
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.12), woodMat); bar.position.y = 1.42; ema.add(bar)
        for (const lx2 of [-1.15, 1.15]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.5, 6), woodMat); leg.position.set(lx2, 0.75, 0); leg.castShadow = true; ema.add(leg) }
        const emaCols = [0xd8a24a, 0xc06a48, 0xdcc27a, 0xb6884a, 0xcf9a52]
        for (let i = 0; i < 8; i++) { const board = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.21, 0.03), toon(emaCols[i % 5])); board.position.set(-1.08 + i * 0.31, 1.22, 0.05); board.rotation.z = (i % 2 ? 0.06 : -0.05); ema.add(board) } // 絵馬の木札
        grp.add(ema)
      }
      // ── 手水舎（参道脇の清めの水場）。石の水盤＋四本柱＋宝形の小屋根＋柄杓。絵馬の反対側に。──
      { const cho = new THREE.Group(); cho.position.set(-4.0, 0, 4.2); cho.rotation.y = 0.5
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.78, 0.7, 8), stoneMat); basin.position.y = 0.75; basin.castShadow = true; cho.add(basin) // 石の水盤
        const water = new THREE.Mesh(new THREE.CircleGeometry(0.58, 14), new THREE.MeshBasicMaterial({ color: isNight ? 0x4a5a64 : 0x9fc0cc, fog: true })); water.rotation.x = -Math.PI / 2; water.position.y = 1.07; cho.add(water) // 水面
        for (const [px2, pz2] of [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.3, 6), woodMat); post.position.set(px2, 1.15, pz2); post.castShadow = true; cho.add(post) } // 四本柱
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.85, 4), roofMat); roof.rotation.y = Math.PI / 4; roof.position.y = 2.7; roof.castShadow = true; cho.add(roof); cho.add(addOutline(roof)) // 宝形屋根
        const ladle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.66, 5), woodMat); ladle.rotation.z = Math.PI / 2; ladle.position.set(0.1, 1.16, 0.45); cho.add(ladle); const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.09, 8), woodMat); cup.position.set(0.42, 1.16, 0.45); cho.add(cup) // 柄杓（柄＋椀）
        grp.add(cho)
      }
      town.add(grp)
      const sandoAng = Math.atan2(-sz, -sx) // 参道（街の中心）へ向く角度＝この方角は木を寄せて社殿/鳥居の正面を開ける
      for (let i = 0; i < 12; i++) { let a = i / 12 * 6.283; const da = Math.atan2(Math.sin(a - sandoAng), Math.cos(a - sandoAng)); if (Math.abs(da) < 0.55) a = sandoAng + (da < 0 ? -0.6 : 0.6); const rr = 8.5 + R() * 3.5; tree(sx + Math.cos(a) * rr, sz + Math.sin(a) * rr, 1.5 + R() * 0.8) } // 鎮守の森（参道の正面は開ける・少し外周へ）
      colliders.push({ x: sx, z: sz - 3.5, r: 3.2 }) // 歩行: 社殿には入らない
    }

    // ── 公園（街の中ほどの広場）。空を映す池＋太鼓橋＋桜・石灯籠・ベンチ＝飛んで降りて憩う水辺の広場。──
    {
      const px0 = PARK.x, pz0 = PARK.z, pondR = PARK.pondR
      const pondGround = heightAt(px0, pz0) + PARK.pondDepth // 掘る前の中心地面
      const waterY = pondGround - 0.7
      const stoneMat = mottleMat(0x9a958c, 90, 0.1, [2, 2]), woodMat = toon(0x8a6a48) // 池の縁石・灯籠に石のムラ質感（近接で映える）
      // 水面（空を映す水鏡。MeshToonの空グラデで白飛びを防ぐ）。冬は氷の張った淡い面に。
      const iced = season === 'winter'
      const pc = document.createElement('canvas'); pc.width = pc.height = 64; const pcx = pc.getContext('2d')
      const pg = pcx.createLinearGradient(0, 0, 0, 64)
      pg.addColorStop(0, iced ? '#dce8ee' : '#' + new THREE.Color(0x7aa6c4).lerp(skyTop, 0.4).getHexString())
      pg.addColorStop(1, iced ? '#c4d6de' : '#' + new THREE.Color(0x4f748e).lerp(skyHorizon, 0.22).getHexString())
      pcx.fillStyle = pg; pcx.fillRect(0, 0, 64, 64)
      if (iced) { for (let i = 0; i < 7; i++) { pcx.strokeStyle = `rgba(255,255,255,${0.3 + R() * 0.3})`; pcx.lineWidth = 0.6; pcx.beginPath(); pcx.moveTo(R() * 64, R() * 64); pcx.lineTo(R() * 64, R() * 64); pcx.lineTo(R() * 64, R() * 64); pcx.stroke() } } // 氷のひび
      else for (let i = 0; i < 30; i++) { pcx.fillStyle = `rgba(255,255,255,${0.04 + R() * 0.05})`; pcx.fillRect(R() * 64, R() * 64, 1 + R() * 2, 1) } // さざ波
      const ptex = new THREE.CanvasTexture(pc)
      const pondGeo = new THREE.CircleGeometry(pondR + 0.1, 36); pondGeo.rotateX(-Math.PI / 2)
      const pond = new THREE.Mesh(pondGeo, freshWater(new THREE.MeshToonMaterial({ color: 0xffffff, map: ptex, gradientMap: grad, fog: true })))
      pond.position.set(px0, waterY, pz0); pond.receiveShadow = true; town.add(pond)
      // 石組みの縁（地形に沿って水際に段を作る＝池の輪郭がはっきりする。不揃いの石を1メッシュへ）。
      const rimGeos = []
      for (let i = 0; i < 42; i++) {
        const a = i / 42 * 6.283 + R() * 0.05
        const rr = pondR + 0.25 + (R() - 0.5) * 0.5
        const rx2 = px0 + Math.cos(a) * rr, rz2 = pz0 + Math.sin(a) * rr
        const top = heightAt(rx2, rz2), bottom = waterY - 0.8
        const h = Math.max(0.5, top - bottom), s = 0.7 + R() * 0.5
        const seg = new THREE.BoxGeometry(s, h, s); seg.rotateY(R())
        seg.applyMatrix4(new THREE.Matrix4().makeTranslation(rx2, bottom + h / 2, rz2))
        rimGeos.push(seg)
      }
      if (BufferGeometryUtils.mergeGeometries) { const rm = BufferGeometryUtils.mergeGeometries(rimGeos, false); if (rm) { const rim = new THREE.Mesh(rm, stoneMat); rim.castShadow = true; rim.receiveShadow = true; town.add(rim) } }
      rimGeos.forEach((g) => g.dispose())
      // 太鼓橋（池に架かる朱の反り橋）。円弧に沿う板＋欄干。span を池より少し長く取り両岸に乗せる。
      {
        const deckMat = toon(0xc24a33), span = pondR * 2 + 2.8, archH = 1.6, baseLift = 0.7, N = 13, width = 2.2
        const grp = new THREE.Group(); grp.position.set(px0, 0, pz0); town.add(grp)
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1)
          const lx = (t - 0.5) * span
          const ly = waterY + baseLift + archH * Math.sin(Math.PI * t)
          const ang = Math.atan2(archH * Math.PI * Math.cos(Math.PI * t), span) // 円弧の接線の傾き
          const plank = new THREE.Mesh(new THREE.BoxGeometry(span / (N - 1) * 1.25, 0.28, width), deckMat)
          plank.position.set(lx, ly, 0); plank.rotation.z = -ang; plank.castShadow = true; plank.receiveShadow = true; grp.add(plank)
          if (i % 2 === 0) for (const rs of [-1, 1]) { // 欄干の親柱
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), deckMat); post.position.set(lx, ly + 0.35, rs * (width / 2 - 0.12)); grp.add(post)
          }
        }
        for (const rs of [-1, 1]) for (let i = 0; i < N - 1; i++) { // 欄干の手すり（弧に沿う）
          const t = (i + 0.5) / (N - 1), lx = (t - 0.5) * span
          const ly = waterY + baseLift + archH * Math.sin(Math.PI * t) + 0.58
          const ang = Math.atan2(archH * Math.PI * Math.cos(Math.PI * t), span)
          const rail = new THREE.Mesh(new THREE.BoxGeometry(span / (N - 1) * 1.2, 0.12, 0.12), deckMat)
          rail.position.set(lx, ly, rs * (width / 2 - 0.12)); rail.rotation.z = -ang; grp.add(rail)
        }
      }
      // 桜（季節で姿が変わる）。春=淡紅の満開・夏=新緑・秋=紅葉・冬=雪をかぶった裸枝。
      const blossomHex = season === 'spring' ? 0xf0bcce : season === 'autumn' ? 0xd6743a : season === 'winter' ? 0xe4eaf0 : 0x6f9a52
      for (const c of [[px0 - 6.5, pz0 + 5.5], [px0 + 6, pz0 - 6], [px0 - 5, pz0 - 6.5], [px0 + 5.5, pz0 + 6]]) {
        const gy = heightAt(c[0], c[1]); const sg = new THREE.Group(); sg.position.set(c[0], gy, c[1]); town.add(sg)
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.4, 7), woodMat); tr.position.y = 1.2; tr.castShadow = true; sg.add(tr)
        const sakuraMat = toon(blossomHex)
        const blobs = season === 'winter' ? [[0, 2.7, 0, 0.7], [-0.8, 2.4, 0.4, 0.5], [0.7, 2.5, -0.4, 0.52], [0.2, 3.2, 0.3, 0.46]] : [[0, 2.9, 0, 1.5], [-0.9, 2.5, 0.4, 1.0], [0.8, 2.6, -0.5, 1.05], [0.2, 3.4, 0.3, 0.9]]
        for (const bl of blobs) {
          const bs = new THREE.Mesh(new THREE.SphereGeometry(bl[3], 8, 7), sakuraMat); bs.position.set(bl[0], bl[1], bl[2]); bs.castShadow = true; sg.add(bs)
        }
        colliders.push({ x: c[0], z: c[1], r: 0.6 }); spawnAvoid.push({ x: c[0], z: c[1], r: 2.0 })
      }
      // 石灯籠×2（池のほとりに。夕夜はほのかに灯る）
      for (const lp of [[px0 - pondR - 1.2, pz0 + 2.5], [px0 + pondR + 1.2, pz0 - 2.5]]) {
        const gy = heightAt(lp[0], lp[1]); const lan = new THREE.Group(); lan.position.set(lp[0], gy, lp[1]); town.add(lan)
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 8), stoneMat); foot.position.y = 0.25
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 1.1, 8), stoneMat); post.position.y = 1.05
        const fire = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.46, 0.58), duskAmt > 0.2 ? new THREE.MeshBasicMaterial({ color: 0xffce86 }) : toon(0xb0a890)); fire.position.y = 1.85
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.4, 4), stoneMat); cap.rotation.y = Math.PI / 4; cap.position.y = 2.25
        for (const m of [foot, post, fire, cap]) { m.castShadow = true; lan.add(m) }
        colliders.push({ x: lp[0], z: lp[1], r: 0.5 })
      }
      // ── 紫陽花（夏＝池のほとりに咲く。青/紫/桃の毬。梅雨〜夏の水辺の癒し）。決定的配置＋色ごとに統合で軽量。──
      if (season === 'summer') {
        const ajiCols = [0x6f8ad0, 0x9a7ec8, 0xc77aa8, 0x7ab0c0], buckets = ajiCols.map(() => []), leafG = [], ajiM = new THREE.Matrix4()
        for (let i = 0; i < 11; i++) {
          const a = i / 11 * 6.2832 + 0.35, rr = pondR + 1.2 + (i % 3) * 0.55
          const fx = px0 + Math.cos(a) * rr, fz = pz0 + Math.sin(a) * rr, fy = heightAt(fx, fz)
          if (Math.hypot(fx - px0, fz - pz0) < pondR + 0.3) continue // 池の中は避ける
          const lf = new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(); lf.scale(1.25, 0.5, 1.25); ajiM.makeTranslation(fx, fy + 0.18, fz); lf.applyMatrix4(ajiM); leafG.push(lf) // 葉の茂み
          for (const [ox, oy, oz, s] of [[0, 0.5, 0, 0.34], [-0.28, 0.42, 0.12, 0.24], [0.26, 0.44, -0.1, 0.25]]) { const h = new THREE.IcosahedronGeometry(s, 1); ajiM.makeTranslation(fx + ox, fy + oy, fz + oz); h.applyMatrix4(ajiM); buckets[i % 4].push(h) } // 花房（毬）
        }
        if (BufferGeometryUtils.mergeGeometries) {
          const lm = leafG.length && BufferGeometryUtils.mergeGeometries(leafG, false); if (lm) { const lme = new THREE.Mesh(lm, toon(0x4e6e3a)); lme.castShadow = true; town.add(lme) }
          buckets.forEach((bk, ci) => { if (bk.length) { const m = BufferGeometryUtils.mergeGeometries(bk, false); if (m) { const me = new THREE.Mesh(m, toon(ajiCols[ci])); me.castShadow = true; town.add(me) } } })
          leafG.concat(...buckets).forEach((g) => g.dispose())
        }
      }
      // ── 蓮の葉（夏＝池に浮く緑の葉＋数輪の蓮の花。水面の彩り）。決定的配置＋統合で軽量。──
      if (season === 'summer') {
        const padG = [], flG = [], lotM = new THREE.Matrix4()
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * 6.2832 + 0.5, rr = 1.0 + (i % 4) * 1.05, lx = px0 + Math.cos(a) * rr, lz = pz0 + Math.sin(a) * rr
          const pad = new THREE.CircleGeometry(0.42 + (i % 3) * 0.12, 7); pad.rotateX(-Math.PI / 2); lotM.makeTranslation(lx, waterY + 0.06, lz); pad.applyMatrix4(lotM); padG.push(pad)
          if (i % 4 === 0) { const fl = new THREE.IcosahedronGeometry(0.15, 0); fl.scale(1, 1.3, 1); lotM.makeTranslation(lx + 0.12, waterY + 0.2, lz); fl.applyMatrix4(lotM); flG.push(fl) } // 蓮の花（蕾）
        }
        if (BufferGeometryUtils.mergeGeometries) { const pm = padG.length && BufferGeometryUtils.mergeGeometries(padG, false); if (pm) town.add(new THREE.Mesh(pm, toon(0x5a8a4a))); const fm = flG.length && BufferGeometryUtils.mergeGeometries(flG, false); if (fm) town.add(new THREE.Mesh(fm, toon(0xe2aac6))); padG.concat(flG).forEach((g) => g.dispose()) }
      }
      // ベンチ×3（広場に。池の方を向く）
      for (const bp of [[px0 - 8, pz0 - 1, 1.4], [px0 + 8.5, pz0 + 1, -1.4], [px0 - 1, pz0 + 8.5, 3.0]]) {
        const gy = heightAt(bp[0], bp[1]); const bg = new THREE.Group(); bg.position.set(bp[0], gy, bp[1]); bg.rotation.y = bp[2]; town.add(bg)
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.5), woodMat); seat.position.y = 0.5; seat.castShadow = true; bg.add(seat)
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.1), woodMat); back.position.set(0, 0.78, -0.22); bg.add(back)
        for (const sx2 of [-0.8, 0.8]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.46), toon(0x6a5a48)); leg.position.set(sx2, 0.25, 0); bg.add(leg) }
      }
      // 公園の縁を低めの木立で囲む（広場の輪郭。中央の池・橋・桜は開けておく＝水面が見える）
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283 + 0.3, rr = PARK.r - 0.4 + R() * 0.8, tx = px0 + Math.cos(a) * rr, tz = pz0 + Math.sin(a) * rr; if (inFestZone(tx, tz)) continue; tree(tx, tz, 0.8 + R() * 0.4) } // 祭り会場（北）には木立を置かない
      colliders.push({ x: px0, z: pz0, r: pondR * 0.85 }) // 歩行: 池には入らない
      spawnAvoid.push({ x: px0, z: pz0, r: pondR + 1.5 }) // 着地: 池に降りない
      // ── 夏祭り（公園の南の開けた所を会場に）。夏の夕夜・日替わりで開催。狭い公園に収まるようコンパクトに。id=0 ──
      if (festOn(0)) makeFestival(px0, pz0 - 10, 0.62) // 池の南（屋台が池/木立に食い込まないよう縮小＋南へ）
    }

    // ── 展望塔（谷を見はるかす街の塔）。高く昇って並ぶ目印・飛んで上がる目的地。──
    {
      const tx = TOWER.x, tz = TOWER.z, baseY = heightAt(tx, tz)
      const concrete = toon(0xcfcabf), deckMat = toon(0xbcb6aa), railMat = toon(0x877f72), roofMat = toon(0x586a6c), bandMat = toon(0xa9a395)
      const grp = new THREE.Group(); grp.position.set(tx, baseY, tz); town.add(grp)
      const shaftH = 24
      // 基壇（足元のコンクリ台）
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, 2.0, 14), concrete); base.position.y = 1.0; base.castShadow = true; base.receiveShadow = true; grp.add(base)
      // シャフト（先細りの塔身）
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.7, shaftH, 14), concrete); shaft.position.y = 2 + shaftH / 2; shaft.castShadow = true; shaft.receiveShadow = true; grp.add(shaft); grp.add(addOutline(shaft))
      // 横帯（塔身に細いリング＝スケール感と手描きの陰影の起伏）
      for (const fy of [0.34, 0.64]) { const ringR = 2.7 - (2.7 - 1.7) * fy; const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR + 0.06, 0.12, 6, 18), bandMat); ring.rotation.x = Math.PI / 2; ring.position.y = 2 + shaftH * fy; grp.add(ring) }
      const deckY = 2 + shaftH - 1.2
      // 展望台（張り出す円盤）
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 3.6, 0.6, 18), deckMat); deck.position.y = deckY; deck.castShadow = true; deck.receiveShadow = true; grp.add(deck)
      // 手すり（リングの上桟＋細い縦桟）
      const rail = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.07, 6, 26), railMat); rail.rotation.x = Math.PI / 2; rail.position.y = deckY + 1.0; grp.add(rail)
      { const postGeos = []; for (let i = 0; i < 20; i++) { const a = i / 20 * 6.283; const pg = new THREE.BoxGeometry(0.07, 1.0, 0.07); pg.translate(Math.cos(a) * 3.9, deckY + 0.5, Math.sin(a) * 3.9); postGeos.push(pg) } if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(postGeos, false); if (m) grp.add(new THREE.Mesh(m, railMat)); postGeos.forEach((x) => x.dispose()) } } // 手すり縦桟を1メッシュへ統合
      // 展望室（ガラスの小部屋）と窓帯
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 3.0, 18), concrete); cab.position.y = deckY + 0.3 + 1.6; cab.castShadow = true; grp.add(cab)
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.73, 2.82, 1.7, 18), duskAmt > 0.2 ? new THREE.MeshBasicMaterial({ color: 0xffce86 }) : toon(0x444c52)); glass.position.y = deckY + 0.3 + 1.9; grp.add(glass) // 夕夜は灯る展望室
      // 屋根（円錐）＋天辺のアンテナ・赤い灯り
      const roofY = deckY + 0.3 + 3.1
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 18), roofMat); roof.position.y = roofY + 1.2; roof.castShadow = true; grp.add(roof); grp.add(addOutline(roof))
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 3.2, 6), railMat); spire.position.y = roofY + 2.4 + 1.6; grp.add(spire)
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5a4a })); beacon.position.y = roofY + 2.4 + 3.2; grp.add(beacon) // 航空障害灯（夜も街に灯る赤）
      colliders.push({ x: tx, z: tz, r: 4.4 }) // 歩行: 塔身には入らない
      spawnAvoid.push({ x: tx, z: tz, r: 5.5 }) // 着地: 塔の真下には降りない
    }

    // ── 寺（五重塔のある仏閣）。谷の右奥の中腹に。観覧車と対をなす高い目印・飛んでいく目的地。──
    {
      const tx = TEMPLE.x, tz = TEMPLE.z, baseY = heightAt(tx, tz)
      const wood = toon(0x8a5a3c), beam = toon(0xb5503f), roofMat = toon(0x4a4e52), stoneMat = mottleMat(0x9a958c, 80, 0.1, [2, 2]), gold = toon(0xc9a84a)
      const grp = new THREE.Group(); grp.position.set(tx, baseY, tz); town.add(grp) // 参道(+z)を街の中心へ向ける（回転なし）
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(12, 12.6, 0.9, 10), stoneMat); plat.position.y = 0.15; plat.receiveShadow = true; grp.add(plat) // 寺地の石の基壇
      // 五重塔（積み上がる五つの屋根＋相輪）。塔のかたわらに立てる。
      {
        const pag = new THREE.Group(); pag.position.set(-5.5, 0.5, -2); pag.scale.setScalar(1.12); grp.add(pag)
        let y = 0
        const bodyGeos = [], bandGeos = [] // 各層の身（杉材）と朱の見切り（梁色）は静止＝層ごとに材ごとへ1メッシュへ統合（描画コール削減・見た目は完全同一）
        for (let i = 0; i < 5; i++) {
          const s = 1 - i * 0.12, bw = 3.4 * s, bh = 2.1
          const bodyG = new THREE.BoxGeometry(bw, bh, bw); bodyG.translate(0, y + bh / 2, 0); bodyGeos.push(bodyG)
          const bandG = new THREE.BoxGeometry(bw + 0.05, 0.2, bw + 0.05); bandG.translate(0, y + bh - 0.12, 0); bandGeos.push(bandG) // 各層の朱の見切り
          const roofR = bw * 0.96 + 0.75
          const roof = new THREE.Mesh(new THREE.ConeGeometry(roofR, 1.2, 4), roofMat); roof.rotation.y = Math.PI / 4; roof.position.y = y + bh + 0.5; roof.castShadow = true; pag.add(roof); pag.add(addOutline(roof)) // 四注の深い軒（輪郭付き＝個別のまま）
          y += bh + 1.0
        }
        if (BufferGeometryUtils.mergeGeometries) {
          const bm = BufferGeometryUtils.mergeGeometries(bodyGeos, false); if (bm) { const me = new THREE.Mesh(bm, wood); me.castShadow = true; pag.add(me) } bodyGeos.forEach((g) => g.dispose())
          const am = BufferGeometryUtils.mergeGeometries(bandGeos, false); if (am) pag.add(new THREE.Mesh(am, beam)); bandGeos.forEach((g) => g.dispose())
        }
        const sorin = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), gold); sorin.position.y = y + 1.6; pag.add(sorin) // 相輪の心柱
        for (let r = 0; r < 6; r++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3 - r * 0.025, 0.05, 5, 12), gold); ring.rotation.x = Math.PI / 2; ring.position.y = y + 0.5 + r * 0.36; pag.add(ring) } // 九輪
        const houju = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), gold); houju.position.y = y + 3.5; pag.add(houju) // 宝珠
        colliders.push({ x: tx - 5.5, z: tz - 2, r: 2.8 })
      }
      // 本堂（大きな入母屋の御堂）
      {
        const hall = new THREE.Group(); hall.position.set(4.5, 0.5, -1); grp.add(hall)
        const body = new THREE.Mesh(new THREE.BoxGeometry(8.5, 3.4, 6), wood); body.position.y = 1.7; body.castShadow = true; hall.add(body)
        { const pilGeos = []; for (const px of [-4, -1.3, 1.3, 4]) { const g = new THREE.BoxGeometry(0.35, 3.2, 0.35); g.translate(px, 1.6, 3.1); pilGeos.push(g) }; if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(pilGeos, false); if (m) hall.add(new THREE.Mesh(m, beam)); pilGeos.forEach((g) => g.dispose()) } } // 縁の朱柱4本を1メッシュへ統合（見た目同一）
        const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 3.0, 4), roofMat); roof.rotation.y = Math.PI / 4; roof.scale.set(1.0, 1, 0.8); roof.position.y = 4.4; roof.castShadow = true; hall.add(roof); hall.add(addOutline(roof))
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 0.7), roofMat); ridge.position.y = 5.55; hall.add(ridge)
        colliders.push({ x: tx + 4.5, z: tz - 1, r: 4.0 })
      }
      // 山門（参道の入口の二本柱の門）
      {
        const mon = new THREE.Group(); mon.position.set(0, 0.5, 8); grp.add(mon)
        for (const px of [-2.2, 2.2]) { const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 4.2, 8), beam); pil.position.set(px, 2.1, 0); pil.castShadow = true; mon.add(pil) }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 0.6), beam); lintel.position.y = 3.8; mon.add(lintel)
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.4, 4), roofMat); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.55); roof.position.y = 4.5; roof.castShadow = true; mon.add(roof)
      }
      // 鐘楼（梵鐘を吊る小さな袴腰）
      {
        const bell = new THREE.Group(); bell.position.set(-1, 0.5, 4.5); grp.add(bell)
        for (const px of [-1, 1]) for (const pz of [-1, 1]) { const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.0, 6), wood); pil.position.set(px, 1.5, pz); bell.add(pil) }
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.2, 4), roofMat); roof.rotation.y = Math.PI / 4; roof.position.y = 3.5; roof.castShadow = true; bell.add(roof)
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.2, 10), toon(0x6a6256)); b.position.y = 1.9; bell.add(b)
        colliders.push({ x: tx - 1, z: tz + 4.5, r: 1.4 })
      }
      // 石灯籠×2（参道の左右。夕夜は灯る）
      for (const lp of [[-2.6, 6], [2.6, 6]]) {
        const gy = heightAt(tx + lp[0], tz + lp[1]); const lan = new THREE.Group(); lan.position.set(tx + lp[0], gy, tz + lp[1]); town.add(lan)
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.3, 8), stoneMat); post.position.y = 0.95
        const fire = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), duskAmt > 0.2 ? new THREE.MeshBasicMaterial({ color: 0xffce86 }) : toon(0xb0a890)); fire.position.y = 1.8
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 4), stoneMat); cap.rotation.y = Math.PI / 4; cap.position.y = 2.2
        for (const m of [post, fire, cap]) { m.castShadow = true; lan.add(m) }
      }
      // 寺を背後と側面から抱く木立（街向き＝参道の前(+z)は開けて、塔と御堂を見せる）
      for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; if (Math.sin(a) > 0.2) continue; const rr = 11.5 + R() * 3; tree(tx + Math.cos(a) * rr, tz + Math.sin(a) * rr, 1.0 + R() * 0.6) }
      spawnAvoid.push({ x: tx, z: tz, r: 8 }) // 寺の境内に降りない
    }

    // ── 師岡町公園（実在・港北/鶴見境の丘の上の児童公園）。樹林に囲まれた広場＋複合すべり台・ブランコ・砂場・ベンチ＋UFO型ジャングルジムの目印。──
    {
      const mx = MOROOKA.x, mz = MOROOKA.z, gy = heightAt(mx, mz)
      const woodM = toon(0x9a7048), barM = toon(0x6a8aa0), redM = toon(0xcc4a4a), sandM = toon(0xdccba0), benchM = toon(0x8a6a48), edgeM = toon(0x7a5a38), grassM = toon(0x789a4e)
      // 芝の小山（截頭円錐＝平らな頂上で遊具が水平に乗る／斜面は樹林＝「丘の上の公園」）
      const hill = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 12, 3.0, 32), grassM); hill.position.set(mx, gy + 0.2, mz); hill.castShadow = true; hill.receiveShadow = true; town.add(hill)
      const topY = gy + 1.7 // 頂上の高さ（ここに遊具を水平に置く）
      const lawn = new THREE.Mesh(new THREE.CircleGeometry(8.0, 28), grassM); lawn.rotation.x = -Math.PI / 2; lawn.position.set(mx, topY + 0.02, mz); lawn.receiveShadow = true; town.add(lawn)
      // 丘へ上がる階段（南側）
      for (let s = 0; s < 5; s++) { const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.34, 0.7), edgeM); st.position.set(mx, gy + 0.3 + s * 0.34, mz + 10 - s * 0.9); st.castShadow = true; town.add(st) }
      // 複合遊具（柱＋デッキ＋手すり＋宝形屋根＋すべり台＋はしご）
      const pg = new THREE.Group(); pg.position.set(mx - 1.5, topY, mz + 1.5); town.add(pg)
      for (const lx of [-1, 1]) for (const lz of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.16), woodM); leg.position.set(lx * 0.85, 1.05, lz * 0.85); leg.castShadow = true; pg.add(leg) }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 2.0), woodM); deck.position.y = 2.1; deck.castShadow = true; pg.add(deck)
      for (const rz of [-1, 1]) { const rr = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.08), barM); rr.position.set(0, 2.55, rz * 0.9); pg.add(rr) }
      { const rr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 2.0), barM); rr.position.set(-0.9, 2.55, 0); pg.add(rr) }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.95, 4), redM); roof.position.y = 3.25; roof.rotation.y = Math.PI / 4; roof.castShadow = true; pg.add(roof)
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 3.2), redM); slide.position.set(0, 1.2, 2.1); slide.rotation.x = 0.62; slide.castShadow = true; pg.add(slide)
      for (const ex of [-0.42, 0.42]) { const se = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 3.2), redM); se.position.set(ex, 1.32, 2.1); se.rotation.x = 0.62; pg.add(se) }
      const ladder = new THREE.Group(); ladder.position.set(-1.05, 1.05, 0); ladder.rotation.z = 0.22; pg.add(ladder)
      for (const lz of [-0.34, 0.34]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.1, 0.07), barM); rail.position.set(0, 0, lz); ladder.add(rail) }
      for (let r = 0; r < 4; r++) { const rung = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.66), barM); rung.position.set(0, -0.7 + r * 0.5, 0); ladder.add(rung) }
      // ブランコ（A字脚×2＋上桁＋座2＋鎖）
      const swx = mx + 3.8, swz = mz - 1; const sw = new THREE.Group(); sw.position.set(swx, topY, swz); town.add(sw)
      for (const sz of [-1.3, 1.3]) for (const sgn of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.7, 0.1), barM); leg.position.set(sgn * 0.55, 1.3, sz); leg.rotation.z = -sgn * 0.2; leg.castShadow = true; sw.add(leg) }
      { const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.9, 8), barM); tb.rotation.x = Math.PI / 2; tb.position.set(0, 2.45, 0); sw.add(tb) }
      for (const sz of [-0.7, 0.7]) { for (const cx of [-0.22, 0.22]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.35, 0.03), barM); ch.position.set(cx, 1.75, sz); sw.add(ch) } const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.24), woodM); seat.position.set(0, 1.08, sz); seat.castShadow = true; sw.add(seat) }
      // 砂場（木枠＋砂）
      const sax = mx - 3.5, saz = mz - 3, say = topY
      const sand = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 3.0), sandM); sand.position.set(sax, say + 0.11, saz); sand.receiveShadow = true; town.add(sand)
      for (const [ox, oz, w, d] of [[0, 1.55, 3.3, 0.25], [0, -1.55, 3.3, 0.25], [1.55, 0, 0.25, 3.3], [-1.55, 0, 0.25, 3.3]]) { const fr = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), edgeM); fr.position.set(sax + ox, say + 0.15, saz + oz); fr.castShadow = true; town.add(fr) }
      // UFO型ジャングルジム（目印＝色違いの半円アーチを回して交差させたドーム＋天辺の円盤）
      const ufx = mx + 1, ufz = mz - 4; const ufo = new THREE.Group(); ufo.position.set(ufx, topY, ufz); town.add(ufo)
      const ufoCols = [0xd8643c, 0x4a8ab0, 0xe0b040, 0x6aa860]
      for (let k = 0; k < 4; k++) { const arc = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 6, 20, Math.PI), toon(ufoCols[k])); arc.rotation.y = k * (Math.PI / 4); arc.castShadow = true; ufo.add(arc) }
      { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), toon(0xcfc8bc)); cap.position.y = 1.55; ufo.add(cap) }
      // ベンチ×4（広場の縁）
      for (const [bx, bz, ry] of [[mx - 5.5, mz + 2, 0.4], [mx + 5.5, mz + 1.5, -0.5], [mx + 2, mz + 5.5, Math.PI - 0.2], [mx - 3, mz + 5, Math.PI + 0.3]]) {
        const bg = new THREE.Group(); bg.position.set(bx, topY, bz); bg.rotation.y = ry; town.add(bg)
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), benchM); seat.position.y = 0.5; seat.castShadow = true; bg.add(seat)
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1), benchM); back.position.set(0, 0.75, -0.2); bg.add(back)
        for (const lx of [-0.65, 0.65]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.45), benchM); lg.position.set(lx, 0.25, 0); bg.add(lg) }
      }
      // 周囲の斜面林（師岡の特徴＝樹林に囲まれた丘）。丘の裾（截頭円錐の外）に疎らに環状に＝頂上の広場を塞がない背景の木立。
      for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + 0.3, rr = 12.5 + R() * 2.2; tree(mx + Math.cos(a) * rr, mz + Math.sin(a) * rr, 0.48 + R() * 0.16) }
      colliders.push({ x: mx, z: mz, r: 8.5 }); spawnAvoid.push({ x: mx, z: mz, r: 9 })
    }

    // ── 学校（校舎と校庭）。街の右手の馴染みの場所。時計・トラック・桜並木・プール・遊具。──
    {
      const cx = SCHOOL.x, cz = SCHOOL.z, baseY = heightAt(cx, cz)
      const wallMat = toon(0xe4dac4), roofMat = toon(0x8a7e70), winMat = toon(0x39474f), trimMat = toon(0xbcae94)
      const grp = new THREE.Group(); grp.position.set(cx, baseY, cz); town.add(grp) // 校庭(+z)を街の中心へ向ける
      const makeWing = (w, d, px, pz) => {
        const wing = new THREE.Group(); wing.position.set(px, 0, pz); grp.add(wing)
        const found = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 1.6, d + 0.3), trimMat); found.position.y = -0.5; wing.add(found) // 基礎（傾斜のすき間を隠す）
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, 8.4, d), wallMat); body.position.y = 4.2; body.castShadow = true; body.receiveShadow = true; wing.add(body)
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), roofMat); roof.position.y = 8.6; wing.add(roof)
        for (let fl = 0; fl < 3; fl++) { // 窓の帯（3階）。前面(+z)に暗いガラスの帯＋窓台。
          const band = new THREE.Mesh(new THREE.BoxGeometry(w - 1.0, 1.5, 0.12), winMat); band.position.set(0, 2.2 + fl * 2.5, d / 2 + 0.02); wing.add(band)
          const sill = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 0.16, 0.22), trimMat); sill.position.set(0, 1.4 + fl * 2.5, d / 2 + 0.04); wing.add(sill)
        }
        return wing
      }
      makeWing(17, 5.5, 0, -7)     // 主棟（東西に長い・校庭の奥）
      makeWing(5.5, 10, -8.5, -1)  // 翼（南北に伸びてL字）
      const cfz = -7 + 2.78 // 主棟の前面
      const clockBg = new THREE.Mesh(new THREE.CircleGeometry(0.95, 22), toon(0xf4efe2)); clockBg.position.set(0, 7.2, cfz); grp.add(clockBg)
      const clkRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 6, 22), trimMat); clkRing.position.set(0, 7.2, cfz + 0.01); grp.add(clkRing)
      const hh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.04), toon(0x33312c)); hh.position.set(0, 7.35, cfz + 0.02); grp.add(hh)
      const mh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.04), toon(0x33312c)); mh.position.set(0.18, 7.25, cfz + 0.02); mh.rotation.z = -0.9; grp.add(mh)
      // 校庭のトラック（白線の楕円。地面に沿わせ段差なく敷く）。48本を1メッシュへ統合（描画コール削減）。
      { const trackGeos = []
        for (let i = 0; i < 48; i++) {
          const a = i / 48 * 6.283, lx = Math.cos(a) * 7, lz = 4 + Math.sin(a) * 5
          const gy = heightAt(cx + lx, cz + lz) - baseY
          const sgg = new THREE.BoxGeometry(1.0, 0.06, 0.34); sgg.rotateY(-a + Math.PI / 2); sgg.translate(lx, gy + 0.06, lz); trackGeos.push(sgg)
        }
        if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(trackGeos, false); if (m) grp.add(new THREE.Mesh(m, toon(0xeae3d4))); trackGeos.forEach((x) => x.dispose()) } }
      // プール（水色の長方形＋低いコンクリ縁）。校庭の右手。
      {
        const plx = 10.5, plz = 2, pgy = heightAt(cx + plx, cz + plz) - baseY
        const water = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7), new THREE.MeshToonMaterial({ color: 0x8fc4dd, gradientMap: grad, fog: true })); water.rotateX(-Math.PI / 2)
        water.position.set(plx, pgy + 0.14, plz); grp.add(water)
        for (const e of [[0, 3.6, 4.8, 0.4], [0, -3.6, 4.8, 0.4], [2.3, 0, 0.4, 7.6], [-2.3, 0, 0.4, 7.6]]) {
          const rim = new THREE.Mesh(new THREE.BoxGeometry(e[2], 0.5, e[3]), toon(0xd8d2c4)); rim.position.set(plx + e[0], pgy + 0.22, plz + e[1]); grp.add(rim)
        }
      }
      // 桜並木（校門から校舎へ）。季節で姿が変わる（春=桜・夏=緑・秋=紅葉・冬=雪枝）。
      const schBlossom = season === 'spring' ? 0xf0bcce : season === 'autumn' ? 0xd6743a : season === 'winter' ? 0xe4eaf0 : 0x6f9a52
      for (const c of [[-6, 9], [6, 9], [-6, 4.5], [6, 4.5]]) {
        if (inFestZone(cx + c[0], cz + c[1])) continue // 校庭の祭り会場（やぐら/屋台）に重なる桜は置かない
        const gy = heightAt(cx + c[0], cz + c[1]); const sg = new THREE.Group(); sg.position.set(cx + c[0], gy, cz + c[1]); town.add(sg)
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.2, 7), toon(0x8a6a48)); tr.position.y = 1.1; tr.castShadow = true; sg.add(tr)
        const sakuraMat = toon(schBlossom)
        const sblobs = season === 'winter' ? [[0, 2.6, 0, 0.62], [-0.7, 2.4, 0.4, 0.46], [0.6, 2.5, -0.4, 0.48]] : [[0, 2.7, 0, 1.3], [-0.8, 2.4, 0.4, 0.9], [0.7, 2.5, -0.4, 0.95]]
        for (const bl of sblobs) { const bs = new THREE.Mesh(new THREE.SphereGeometry(bl[3], 8, 7), sakuraMat); bs.position.set(bl[0], bl[1], bl[2]); bs.castShadow = true; sg.add(bs) }
        colliders.push({ x: cx + c[0], z: cz + c[1], r: 0.5 })
      }
      // 国旗ポール
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), toon(0xd0d4d8)); pole.position.set(-4.5, (heightAt(cx - 4.5, cz + 2) - baseY) + 3.5, 2); grp.add(pole)
      // ジャングルジム（立方格子）
      {
        const jx = -10, jz = 8, jgy = heightAt(cx + jx, cz + jz) - baseY, barMat = toon(0xcf6a5a)
        for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.0, 0.06), barMat); v.position.set(jx + (a - 1.5) * 0.7, jgy + 1.0, jz + (b - 1.5) * 0.7); grp.add(v) }
        for (let lvl = 1; lvl <= 2; lvl++) for (let b = 0; b <= 3; b++) { const hbar = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.06, 0.06), barMat); hbar.position.set(jx, jgy + lvl * 1.0, jz + (b - 1.5) * 0.7); grp.add(hbar) }
      }
      colliders.push({ x: cx, z: cz - 7, r: 8 }) // 校舎の塊
      spawnAvoid.push({ x: cx, z: cz - 7, r: 9 })
      // 夏の夜祭り（校庭の盆踊り）＝獅子ヶ谷小学校の核の記憶。夏の夕夜・日替わりで開催。id=1
      if (festOn(1)) makeFestival(cx, cz + 6, 0.8) // 校庭の中央（校舎から前へ離す）に広めの会場＝本命の盆踊り
    }

    // ── やまゆりホーム（地域の福祉施設）。馴染みの場所。前庭の広場で夏は「サマフェス」（模擬店＋ステージ）。──
    {
      const hx = YAMAYURI.x, hz = YAMAYURI.z, baseY = heightAt(hx, hz)
      const wallMat = toon(0xe8ddcb), roofMat = toon(0x9a8a6e), winMat = toon(0x3e4c54), trimMat = toon(0xcdbfa4)
      const lit = isNight || duskAmt > 0.3
      const grp = new THREE.Group(); grp.position.set(hx, baseY, hz); town.add(grp)
      const mk = (w, h, d, x, y, z, mat, sh) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (sh) { m.castShadow = true; m.receiveShadow = true }; grp.add(m); return m }
      const bw = 13, bd = 6, bh = 7, bcz = -4 // 本棟は奥(-z)、前面(+z)を街へ向ける
      mk(bw + 0.4, 1.8, bd + 0.4, 0, -0.6, bcz, trimMat)          // 基礎（傾斜のすき間を隠す）
      mk(bw, bh, bd, 0, bh / 2, bcz, wallMat, true)               // 本体（2階建て）
      mk(bw + 0.5, 0.5, bd + 0.6, 0, bh + 0.2, bcz, roofMat)      // 陸屋根の庇
      mk(bw + 0.2, 0.28, bd + 0.2, 0, bh / 2, bcz, trimMat)       // 階の境の帯
      const fzf = bcz + bd / 2 // 前面(+z)
      for (let fl = 0; fl < 2; fl++) { mk(bw - 1.4, 1.5, 0.12, 0, 2.0 + fl * 3.0, fzf + 0.02, winMat); mk(bw - 1.0, 0.16, 0.24, 0, 1.2 + fl * 3.0, fzf + 0.05, trimMat) } // 窓の帯＋窓台（2階）
      if (lit) { // 夜は一部の部屋に暖かな灯り（福祉施設＝夜も人の気配）
        const winLit = new THREE.MeshBasicMaterial({ color: 0xf6cd84, fog: true })
        for (let i = 0; i < 6; i++) { const lw = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.95), winLit); lw.position.set(-4.4 + (i % 3) * 4.4 + (R() - 0.5) * 0.6, 2.0 + (i < 3 ? 0 : 3.0), fzf + 0.1); grp.add(lw) }
        lightPool(hx, heightAt(hx, hz + fzf + 2), hz + fzf + 2, 3.2, 0.5) // 玄関の足元の灯りだまり
      }
      mk(bw - 1.0, 0.1, 0.12, 0, 3.45, fzf + 0.45, trimMat)       // 2階のバルコニーの手すり（福祉施設らしく）
      for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), trimMat); r.position.set(-3 + i, 3.2, fzf + 0.45); grp.add(r) }
      // 玄関の車寄せ（ひさし＋柱）。前面中央。
      const pz = fzf + 1.6
      mk(4.4, 0.25, 2.6, 0, 3.05, pz - 0.5, roofMat)
      for (const px of [-1.8, 1.8]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.05, 8), trimMat); post.position.set(px, 1.5, pz + 0.6); post.castShadow = true; grp.add(post) }
      mk(2.4, 2.3, 0.1, 0, 1.15, fzf + 0.06, winMat)              // 玄関のガラス戸
      // 名板（玄関脇の縦サイン。固有のロゴは用いず素朴な施設名）
      const nc = document.createElement('canvas'); nc.width = 30; nc.height = 120; const ncx = nc.getContext('2d'); ncx.fillStyle = '#f4efe2'; ncx.fillRect(0, 0, 30, 120); ncx.fillStyle = '#3a5a78'; ncx.font = 'bold 15px serif'; ncx.textAlign = 'center'; ncx.textBaseline = 'middle'; const nm = 'やまゆりホーム'; for (let i = 0; i < nm.length; i++) ncx.fillText(nm[i], 15, 13 + i * 16)
      const ntex = new THREE.CanvasTexture(nc); const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.9, 0.08), new THREE.MeshToonMaterial({ map: ntex, gradientMap: grad, fog: true })); plate.position.set(-2.8, 1.55, pz + 0.7); grp.add(plate)
      // 前庭の広場（舗装）＝サマフェスの会場
      const yz = hz + 4, yard = new THREE.Mesh(new THREE.CircleGeometry(8.8, 26), mottleMat(0xbfb39a, 80, 0.08, [3, 3])); yard.rotation.x = -Math.PI / 2; yard.position.set(hx, heightAt(hx, yz) + 0.05, yz); yard.receiveShadow = true; town.add(yard)
      // 入口を挟む木立＋低い植栽
      tree(hx - 7.2, hz + 1, 0.9); tree(hx + 7.2, hz + 1, 0.95)
      colliders.push({ x: hx, z: hz + bcz, r: 7 }); spawnAvoid.push({ x: hx, z: hz + bcz, r: 8 })
      // サマフェス（前庭の広場で。夏の夕夜・日替わりで開催。id=2）
      if (festOn(2)) makeSummerFes(hx, hz + 6)
    }

    // ── 祭りの会場は「窓から遠い、開けた平らな場所」に限る（実機FB）。──
    // id=3(ホーム前のPLAZA_HOME) は撤去＝坂の途中×中央通り(x=0軸)の真上で、平らな円盤パッドが斜面から突き出て踊り手が宙に浮き、車が貫通する「意味不明の会場」だった。
    // id=4(入口の広場PLAZA_GATE) も同じ理由で撤去済み。
    // → 祭りは公園の南・校庭・やまゆり前庭（いずれも平らな造成広場・道路外・窓から遠い奥）でのみ開催。窓辺からは街の向こうに提灯の灯が遠く見える。

    // ── 遊園地（観覧車のまわり）。ゲート・回転木馬・旗・柵・ベンチ＝明るい賑わいの目的地。──
    {
      const fx = FUN.x, fz = FUN.z
      // 入口ゲート（アーチ＋「ゆうえんち」看板＋三角旗）。観覧車の手前(+z=街側)に。
      {
        const gz = fz + 11, gy = heightAt(fx, gz)
        const grp = new THREE.Group(); grp.position.set(fx, gy, gz); town.add(grp)
        const postMat = toon(0xe06f8a)
        for (const px of [-4.4, 4.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 5.6, 10), postMat); p.position.set(px, 2.8, 0); p.castShadow = true; grp.add(p) }
        const arch = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.42, 8, 20, Math.PI), toon(0xf2c14e)); arch.position.set(0, 5.4, 0); grp.add(arch)
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: true }) // アーチの豆電球（昼も明るく・夕夜は灯りに）
        for (let i = 1; i < 11; i++) { const a = i / 11 * Math.PI; const bb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), bulbMat); bb.position.set(Math.cos(a) * 4.4, 5.4 + Math.sin(a) * 4.4, 0.12); grp.add(bb) }
        const bc = document.createElement('canvas'); bc.width = 256; bc.height = 64; const bx2 = bc.getContext('2d')
        bx2.fillStyle = '#e8567f'; bx2.fillRect(0, 0, 256, 64); bx2.strokeStyle = '#fff3d0'; bx2.lineWidth = 4; bx2.strokeRect(3, 3, 250, 58)
        bx2.fillStyle = '#fff8e8'; bx2.font = 'bold 33px sans-serif'; bx2.textAlign = 'center'; bx2.textBaseline = 'middle'; bx2.fillText('ゆうえんち', 128, 36)
        const banner = new THREE.Mesh(new THREE.BoxGeometry(8, 1.3, 0.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc) })); banner.position.set(0, 5.7, 0.12); grp.add(banner)
        const flagCols = [0xe8567f, 0xf2c14e, 0x5aa6d0, 0x6fae8f]
        for (let i = -4; i <= 4; i++) { const fl = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 3), toon(flagCols[(i + 4) % 4])); fl.rotation.z = Math.PI / 2; fl.position.set(i * 0.95, 5.0 + Math.abs(i) * 0.04, 0); grp.add(fl) }
      }
      // メリーゴーラウンド（回転木馬）。台＋馬は回り、屋根と心柱は止まる。
      {
        const mx = fx + 9, mz = fz + 2, gy = heightAt(mx, mz)
        const outer = new THREE.Group(); outer.position.set(mx, gy, mz); town.add(outer)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 5, 10), toon(0xd9b44a)); pole.position.y = 2.6; outer.add(pole)
        const rc = document.createElement('canvas'); rc.width = 64; rc.height = 16; const rcx = rc.getContext('2d')
        for (let i = 0; i < 8; i++) { rcx.fillStyle = i % 2 ? '#e8567f' : '#fff3e0'; rcx.fillRect(i * 8, 0, 8, 16) }
        const rtex = new THREE.CanvasTexture(rc); rtex.wrapS = THREE.RepeatWrapping; rtex.repeat.set(6, 1)
        const roof = new THREE.Mesh(new THREE.ConeGeometry(4.7, 1.9, 20), new THREE.MeshToonMaterial({ map: rtex, gradientMap: grad, fog: true })); roof.position.y = 4.9; roof.castShadow = true; outer.add(roof)
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), toon(0xf2c14e)); ball.position.y = 5.95; outer.add(ball)
        if (duskAmt > 0.25) { const cbulb = new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: true }); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), cbulb); b.position.set(Math.cos(a) * 4.5, 4.0, Math.sin(a) * 4.5); outer.add(b) } } // 屋根の縁の電飾
        const spin = new THREE.Group(); outer.add(spin); carousel = spin
        const plat = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.3, 0.5, 20), toon(0xf0e6d2)); plat.position.y = 0.25; plat.receiveShadow = true; spin.add(plat)
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * 6.283, rr = 3.2
          const h = new THREE.Group(); h.position.set(Math.cos(a) * rr, 0.5, Math.sin(a) * rr); spin.add(h)
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), toon(0xd9b44a)); bar.position.y = 1.5; h.add(bar)
          const hMat = i % 2 ? toon(0xf6f1e8) : toon(0xd98f5a)
          const bodyH = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.7, 3, 6), hMat); bodyH.rotation.z = Math.PI / 2; bodyH.position.y = 1.0; h.add(bodyH)
          const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.45, 3, 6), hMat); neck.position.set(0.45, 1.35, 0); neck.rotation.z = 0.7; h.add(neck)
        }
        colliders.push({ x: mx, z: mz, r: 4.4 })
      }
      // 低い柵（遊園地の縁。街側のゲート寄りは空ける）
      const fenceMat = toon(0xd6dde0)
      { const fenceGeos = []; for (let i = 0; i < 22; i++) { const a = i / 22 * 6.283; if (Math.sin(a) > 0.45) continue; const px = fx + Math.cos(a) * (FUN.r - 1), pz = fz + Math.sin(a) * (FUN.r - 1); const gy = heightAt(px, pz); const pg = new THREE.BoxGeometry(0.12, 1.0, 0.12); pg.translate(px, gy + 0.5, pz); fenceGeos.push(pg) } if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(fenceGeos, false); if (m) town.add(new THREE.Mesh(m, fenceMat)); fenceGeos.forEach((x) => x.dispose()) } } // 遊園地の柵を1メッシュへ統合
      // ベンチ×2
      for (const bp of [[fx - 6, fz + 4, 1.2], [fx + 3, fz + 8, -0.6]]) {
        const gy = heightAt(bp[0], bp[1]); const bg = new THREE.Group(); bg.position.set(bp[0], gy, bp[1]); bg.rotation.y = bp[2]; town.add(bg)
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.46), toon(0x8a6a48)); seat.position.y = 0.46; bg.add(seat)
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.36, 0.1), toon(0x8a6a48)); back.position.set(0, 0.72, -0.2); bg.add(back)
      }
      // コーヒーカップ（回る台＋色とりどりのカップ）。台が回り、各カップも逆に回る。
      {
        const tx = fx - 9, tz = fz + 3, gy = heightAt(tx, tz)
        const outer = new THREE.Group(); outer.position.set(tx, gy, tz); town.add(outer)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.4, 18), toon(0x4a7a5e)); base.position.y = 0.2; base.receiveShadow = true; outer.add(base)
        const spin = new THREE.Group(); spin.position.y = 0.4; outer.add(spin); teacups = spin
        const cupCols = [0xd84a4a, 0xe0a838, 0x3a8ac0, 0x6fae8f]
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * 6.283, cup = new THREE.Group(); cup.position.set(Math.cos(a) * 2.2, 0, Math.sin(a) * 2.2); spin.add(cup)
          const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, 0.9, 14), toon(cupCols[i])); bowl.position.y = 0.6; bowl.castShadow = true; cup.add(bowl)
          const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 10, Math.PI), toon(cupCols[i])); handle.position.set(0.95, 0.6, 0); cup.add(handle)
        }
      }
      // スワンボートの小池（浅い水面＋石の縁＋白鳥のボート）。FUNの南側。
      {
        const sx = fx - 2, sz = fz - 8, sgy = heightAt(sx, sz), pondR = 4.2, waterY = sgy - 0.3
        const wc = document.createElement('canvas'); wc.width = wc.height = 32; const wcx = wc.getContext('2d')
        const wg = wcx.createLinearGradient(0, 0, 0, 32); wg.addColorStop(0, '#' + new THREE.Color(0x7aa6c4).lerp(skyTop, 0.4).getHexString()); wg.addColorStop(1, '#4f748e'); wcx.fillStyle = wg; wcx.fillRect(0, 0, 32, 32)
        const water = new THREE.Mesh(new THREE.CircleGeometry(pondR, 24), new THREE.MeshToonMaterial({ color: 0xffffff, map: new THREE.CanvasTexture(wc), gradientMap: grad, fog: true })); water.rotateX(-Math.PI / 2); water.position.set(sx, waterY, sz); town.add(water)
        const rimGeos = []
        for (let i = 0; i < 22; i++) { const a = i / 22 * 6.283, rr = pondR + 0.2 + (R() - 0.5) * 0.3, rx2 = sx + Math.cos(a) * rr, rz2 = sz + Math.sin(a) * rr, top = heightAt(rx2, rz2), s2 = 0.5 + R() * 0.3, seg = new THREE.BoxGeometry(s2, Math.max(0.4, top - (waterY - 0.6)), s2); seg.applyMatrix4(new THREE.Matrix4().makeTranslation(rx2, waterY - 0.3, rz2)); rimGeos.push(seg) }
        if (BufferGeometryUtils.mergeGeometries) { const rm = BufferGeometryUtils.mergeGeometries(rimGeos, false); if (rm) { const rim = new THREE.Mesh(rm, toon(0x9a958c)); rim.receiveShadow = true; town.add(rim) } }
        rimGeos.forEach((g) => g.dispose())
        for (const bp of [[sx - 1.4, sz + 0.6], [sx + 1.2, sz - 1.0], [sx + 0.2, sz + 1.5]]) {
          const sb = new THREE.Group(); sb.position.set(bp[0], waterY + 0.1, bp[1]); sb.userData = { cx: sx, cz: sz, ph: R() * 6.28, rad: Math.hypot(bp[0] - sx, bp[1] - sz) }; town.add(sb)
          const hull = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xf2f0ea)); hull.scale.set(1, 0.6, 1.3); hull.position.y = 0.1; sb.add(hull)
          const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.0, 6), toon(0xf2f0ea)); neck.position.set(0, 0.6, 0.6); neck.rotation.x = -0.5; sb.add(neck)
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), toon(0xf2f0ea)); head.position.set(0, 1.05, 0.85); sb.add(head)
          const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 5), toon(0xe0902e)); beak.position.set(0, 1.03, 1.0); beak.rotation.x = Math.PI / 2; sb.add(beak)
          swanBoats.push(sb)
        }
        colliders.push({ x: sx, z: sz, r: pondR * 0.8 }); spawnAvoid.push({ x: sx, z: sz, r: pondR + 1 })
      }
      spawnAvoid.push({ x: fx, z: fz, r: 12 })
    }

    // ── 海・港（街の東の縁が湾へ下る）。空を映す広い水面＋防波堤＋灯台＋小舟＝飛んで海まで行ける。──
    {
      // 海面（空を映す大きな水鏡。MeshToonの空グラデ＋さざ波。沖まで広く敷く）。
      const wc = document.createElement('canvas'); wc.width = wc.height = 128; const wcx = wc.getContext('2d')
      // 縦グラデをタイルすると沖から「横縞」に見える（評価指摘）→グラデを廃し平坦な海面色に。奥行きは距離フォグで出す。
      wcx.fillStyle = '#' + new THREE.Color(0x216082).lerp(skyTop, 0.05).getHexString(); wcx.fillRect(0, 0, 128, 128) // 濃いめの青を芯に（夕フォグで砂色化しない）
      for (let i = 0; i < 130; i++) { wcx.fillStyle = `rgba(255,255,255,${0.04 + R() * 0.055})`; const s = 1 + R() * 1.6; wcx.fillRect(R() * 128, R() * 128, s, s) } // さざ波＝小さな点（横長ダッシュは横縞に揃うので正方の点に）
      const wtex = new THREE.CanvasTexture(wc); wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set(13, 9); wtex.anisotropy = renderer.capabilities.getMaxAnisotropy(); seaTex = wtex // 繰り返しを減らし＋異方性フィルタ＝沖のモアレ/縞を抑える
      const seaGeo = new THREE.PlaneGeometry(1760, 1180); seaGeo.rotateX(-Math.PI / 2)
      // MeshBasic＝向きの照明に左右されず、海面の色を一定に保つ（広い面が夕日で暖色に焼けるのを防ぐ）。
      // そこへシェーダーで「動くうねり・谷の濃藍・うろこ雲のような波頭・水平線のきらめき」を重ね、ぱっと見て海と分かる水面に。
      seaUniforms = { uTime: { value: 0 }, uSky: { value: skyHorizon.clone() }, uSky2: { value: skyTop.clone() } } // uSky=空の色（地平寄り）/uSky2=天頂寄り。frameで日の傾きに追従＝夕方は海も金色に
      const seaMat = new THREE.MeshBasicMaterial({ map: wtex, fog: true })
      seaMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = seaUniforms.uTime
        sh.uniforms.uSky = seaUniforms.uSky
        sh.uniforms.uSky2 = seaUniforms.uSky2
        sh.uniforms.uGlintDir = { value: glintDir }; sh.uniforms.uGlintCol = { value: glintCol } // 太陽きらめきの道（静的）
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uSky;\nuniform vec3 uSky2;\nuniform vec3 uGlintDir;\nuniform vec3 uGlintCol;\nvarying vec3 vWPos;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            float ph = uTime;
            // 大きなうねり＋斜めのさざ波（複数周波の和＝規則的すぎない水面）
            float sw = sin(vWPos.x * 0.045 + ph * 0.7) * 0.5 + sin(vWPos.z * 0.035 - ph * 0.5) * 0.5;
            sw += 0.5 * sin((vWPos.x + vWPos.z) * 0.085 + ph * 1.1) + 0.4 * sin(vWPos.z * 0.16 - ph * 1.7);
            float crest = smoothstep(0.55, 1.5, sw);   // 波頭
            float trough = smoothstep(0.55, 1.7, -sw);  // 波の谷
            vec3 deep = vec3(0.07, 0.24, 0.40);
            vec3 shal = vec3(0.27, 0.54, 0.66);
            vec3 foam = vec3(0.82, 0.90, 0.95);
            diffuseColor.rgb = mix(diffuseColor.rgb, deep, trough * 0.55);
            diffuseColor.rgb = mix(diffuseColor.rgb, shal, crest * 0.30);
            diffuseColor.rgb += foam * crest * 0.16;
            // 空の映り込み（フレネル）＝足元は深い藍、視線が浅い遠方ほど空を映して明るむ＝塗りの板でなく「水」の手応え。
            // 波のうねりで法線を少し傾け、映り込みのエッジを揺らす（鏡面のっぺりを避ける）。
            vec3 vDir = normalize(cameraPosition - vWPos);
            float graze = 1.0 - clamp(vDir.y + sw * 0.03, 0.0, 1.0);
            float fres = pow(graze, 4.0);
            // 縦グラデ＝近く（見下ろし）は天頂の色、遠く（浅い視線）は地平の色。塗りの板でなく空を映す水面。
            vec3 refl = mix(uSky2, uSky, graze);
            diffuseColor.rgb = mix(diffuseColor.rgb, refl, fres * 0.5);
            // 太陽へ向かう、きらめきの道＝波の法線が太陽を眼へ反射する筋だけ細かく輝く（夕日の道）。小さな高輝度点＝Bloomが映え白飛びしない。
            float dSx = 0.045 * cos(vWPos.x * 0.045 + ph * 0.7) * 0.5 + 0.085 * cos((vWPos.x + vWPos.z) * 0.085 + ph * 1.1);
            float dSz = 0.035 * cos(vWPos.z * 0.035 - ph * 0.5) * 0.5 + 0.085 * cos((vWPos.x + vWPos.z) * 0.085 + ph * 1.1) + 0.16 * 0.4 * cos(vWPos.z * 0.16 - ph * 1.7);
            vec3 nW = normalize(vec3(-dSx * 3.0, 1.0, -dSz * 3.0));
            float specS = pow(max(dot(nW, normalize(vDir + uGlintDir)), 0.0), 60.0);
            float twS = 0.5 + 0.5 * sin(vWPos.x * 0.5 + vWPos.z * 0.42 + ph * 5.0);
            diffuseColor.rgb += uGlintCol * specS * twS;
          `)
      }
      const seaMesh = new THREE.Mesh(seaGeo, seaMat)
      seaMesh.position.set(0, SEA.level, -300); seaMesh.receiveShadow = true; town.add(seaMesh) // x≈-880..880・z≈-890..290 を広く覆う（Phase0で遠ざけた西=大正/東=江戸/北=戦国への長い渡りの海）
      // ── 渚（波打ち際）。東岸の汀に沿って白い波が寄せて返す＝「海を眺めに降りる」癒しの足場。汀(heightAt=SEA.level)を z沿いに辿り、砂(陸)→海へ垂れるリボンを張る。寄せ返しはシェーダー（海と同じuTimeを共有＝フレーム追加負荷ゼロ）。──
      {
        const fcols = []
        for (let z = -30; z <= 118; z += 2.5) {
          let wx = null, prev = heightAt(63, z)
          for (let x = 64; x <= 94; x += 0.7) { const y = heightAt(x, z); if (prev > SEA.level && y <= SEA.level) { wx = x - 0.35; break } prev = y }
          fcols.push(wx) // 入江/水路で汀が無い z は null（リボンを切る）
        }
        const fpos = [], fuv = [], zAt = (i) => -30 + i * 2.5
        for (let i = 0; i + 1 < fcols.length; i++) {
          const w0 = fcols[i], w1 = fcols[i + 1]
          if (w0 === null || w1 === null) continue
          const z0 = zAt(i), z1 = zAt(i + 1), a0 = (z0 + 30) / 148, a1 = (z1 + 30) / 148
          const L0 = [w0 - 3.4, heightAt(w0 - 3.4, z0) + 0.06, z0], S0 = [w0 + 2.6, SEA.level + 0.05, z0] // 陸側(砂)は地面に沿わせ、海側は海面へ
          const L1 = [w1 - 3.4, heightAt(w1 - 3.4, z1) + 0.06, z1], S1 = [w1 + 2.6, SEA.level + 0.05, z1]
          const pv = (p, ax, al) => { fpos.push(p[0], p[1], p[2]); fuv.push(ax, al) } // uv=(across:0陸..1海, along:0..1)
          pv(L0, 0, a0); pv(S0, 1, a0); pv(S1, 1, a1)
          pv(L0, 0, a0); pv(S1, 1, a1); pv(L1, 0, a1)
        }
        if (fpos.length) {
          const fg = new THREE.BufferGeometry()
          fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3))
          fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2))
          fg.computeVertexNormals()
          const nc = document.createElement('canvas'); nc.width = nc.height = 64; const ncx = nc.getContext('2d') // 泡のレース（柔らかい白斑＝のっぺり白帯を脱す）
          ncx.fillStyle = '#000'; ncx.fillRect(0, 0, 64, 64)
          for (let q = 0; q < 260; q++) { ncx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; ncx.beginPath(); ncx.arc(Math.random() * 64, Math.random() * 64, 0.6 + Math.random() * 2.2, 0, 6.2832); ncx.fill() } // 泡の見た目用ノイズ＝Math.random（種付きR()を消費せず後段の配置を乱さない）
          const ntex = new THREE.CanvasTexture(nc); ntex.wrapS = ntex.wrapT = THREE.RepeatWrapping
          const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, fog: true })
          foamMat.onBeforeCompile = (sh) => {
            sh.uniforms.uTime = seaUniforms.uTime; sh.uniforms.uNoise = { value: ntex }
            sh.vertexShader = sh.vertexShader
              .replace('#include <common>', '#include <common>\nvarying vec2 vUvF;\nvarying vec3 vWPf;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vUvF = uv;\n  vWPf = (modelMatrix * vec4(transformed,1.0)).xyz;')
            sh.fragmentShader = sh.fragmentShader
              .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform sampler2D uNoise;\nvarying vec2 vUvF;\nvarying vec3 vWPf;')
              .replace('#include <fog_fragment>', `#include <fog_fragment>
                float aw = vUvF.x;                                          // 0=陸(砂) .. 1=海。汀(heightAt=SEA.level)は概ね aw≈0.57
                float wf = 0.50 + 0.34 * sin(uTime * 0.45 - vWPf.z * 0.045); // 寄せ返しの先端（汀沿いに位相がずれ斜めに寄せる）
                float band = smoothstep(0.16, 0.0, abs(aw - wf));           // 先端の白いレース（最も明るい筋）
                float behind = smoothstep(wf - 0.02, 1.0, aw) * 0.55;       // 先端より海側＝波の面に残る泡
                float lace = texture2D(uNoise, vUvF * vec2(2.5, 8.0) + vec2(uTime * 0.03, uTime * 0.07)).r;
                float foam = clamp(band + behind, 0.0, 1.0) * (0.5 + 0.5 * lace);
                float endFade = smoothstep(0.0, 0.05, vUvF.y) * smoothstep(1.0, 0.95, vUvF.y); // リボンの z端をそっと消す
                gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.95, 0.98, 1.0), 0.85); // 白い泡（近くは白く・遠くは少し景色に溶ける）
                gl_FragColor.a *= clamp(foam, 0.0, 1.0) * 0.95 * endFade;
              `)
          }
          const foam = new THREE.Mesh(fg, foamMat); foam.renderOrder = 2; foam.frustumCulled = false; town.add(foam)
        }
        // ── 渚の小物: 流木と寄り石（汀の少し上の乾いた砂に点在＝歩いて出会う海辺の手触り）。決定的配置＋統合で軽量。──
        { const driftG = [], stoneG = [], dM = new THREE.Matrix4()
          for (let i = 0; i < fcols.length; i += 5) { // 数本おきに点在（R()を使わず i で決定的に）
            const w = fcols[i]; if (w === null) continue
            const z = zAt(i), bx = w - 3.0 - (i % 3) * 1.1, by = heightAt(bx, z) // 汀の少し上＝乾いた砂
            if (by < SEA.level + 0.3) continue
            if (i % 2 === 0) { const len = 2.0 + (i % 4) * 0.5, dg = new THREE.BoxGeometry(len, 0.28, 0.34); dM.makeRotationY(0.6 + i * 0.4).setPosition(bx, by + 0.12, z); dg.applyMatrix4(dM); driftG.push(dg) } // 流木（寝かせた細長い材）
            else { for (let s = 0; s < 3; s++) { const sg = new THREE.IcosahedronGeometry(0.26 + (s % 2) * 0.12, 0); sg.scale(1.3, 0.6, 1.1); dM.makeTranslation(bx + (s - 1) * 0.5, by + 0.1, z + (s % 2 ? 0.4 : -0.3)); sg.applyMatrix4(dM); stoneG.push(sg) } } // 寄り石（平たい石の小群）
          }
          if (BufferGeometryUtils.mergeGeometries) {
            if (driftG.length) { const m = BufferGeometryUtils.mergeGeometries(driftG, false); if (m) { const me = new THREE.Mesh(m, toon(season === 'winter' ? 0x8a8278 : 0x9a8a72)); me.castShadow = true; town.add(me) } driftG.forEach((g) => g.dispose()) }
            if (stoneG.length) { const m = BufferGeometryUtils.mergeGeometries(stoneG, false); if (m) { const me = new THREE.Mesh(m, toon(0x9a958c)); me.castShadow = true; town.add(me) } stoneG.forEach((g) => g.dispose()) }
          }
        }
      }
      // ── 海の向こうの城下町（江戸）。海を渡るとやがて霞(fog)の向こうに天守が現れる＝M1の“reveal”。──
      {
        const ex = EDO.x, ez = EDO.z, gy = heightAt(ex, ez)
        // 島の地面（heightAtに沿う土・草の地面。これが無いと建物/人が宙に浮く）。縁は海面下へ落ちて海に隠れる。
        { const isz = 330, gI = new THREE.PlaneGeometry(isz, isz, 92, 92); gI.rotateX(-Math.PI / 2); const gp = gI.attributes.position
          for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(ex + gp.getX(i), ez + gp.getZ(i)) - 0.06)
          gI.computeVertexNormals()
          // 頂点色で土／枯草／斜面の土が覗くムラ＝のっぺりした砂土を脱す（城下町なのでhomeより乾いた土寄り）。
          const snowE = season === 'winter'
          bakeGroundVColors(gI, ex, ez,
            snowE ? 0xdde3dc : season === 'autumn' ? 0x9a8a4e : season === 'spring' ? 0x86984e : 0x86864c, // 草地（乾いた緑）
            snowE ? 0xd2d8d2 : season === 'autumn' ? 0x9a8048 : 0x9a8c5a, // 乾いた地肌
            snowE ? 0xcdd2cc : 0x8a7448, 0.6) // 斜面の土
          if (season !== 'winter') beachTint(gI, 0) // 汀の砂浜（メッシュはy=0基準。冬は雪の渚なので除外）
          const em = mottleMat(0xffffff, 150, 0.1, [44, 44]); em.vertexColors = true // 反復を上げ近接で地面の細部（過拡大の平滑を脱す）
          if (em.map) { em.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); em.map.needsUpdate = true }
          const gmesh = new THREE.Mesh(gI, em); gmesh.position.set(ex, 0, ez); gmesh.receiveShadow = true; town.add(gmesh) }
        // 城下の田畑・草地（地面に緑/黄の区画を点在＝のっぺりした砂色を脱す）
        { const fieldCols = season === 'autumn' ? [0xb89a4a, 0x9a8848, 0x8a7a40] : season === 'winter' ? [0xd8dcd6, 0xc8ccc4, 0xb8b0a0] : season === 'spring' ? [0x8aa84e, 0x7a9a44, 0x9ab058] : [0x6e8a48, 0x7e9450, 0x5e7a40]
          for (let k = 0; k < 68; k++) { const a = R() * 6.28, rr = 26 + R() * 80, fx = ex + Math.cos(a) * rr, fz = ez + Math.sin(a) * rr, fy = heightAt(fx, fz); if (fy < SEA.level + 2 || edoStream(fx, fz) < 6) continue
            const fld = new THREE.Mesh(new THREE.CircleGeometry(2.8 + R() * 4.0, 7), toon(fieldCols[k % fieldCols.length])); fld.rotation.x = -Math.PI / 2; fld.rotation.z = R() * 6.28; fld.position.set(fx, fy + 0.04, fz); fld.receiveShadow = true; town.add(fld) }
          // 城下の庭木（町なかに緑を散らす＝遠景で茶色の屋根の海が単色の土饅頭に見えるのを割る・評価3）。幹＋樹冠の簡素な木を統合で軽量に。
          { const folC = season === 'autumn' ? 0xb86a32 : season === 'winter' ? 0xd2dadd : season === 'spring' ? 0xe8bcd2 : 0x5e7e42, trunkM = toon(0x5a4632), foliM = toon(folC), trGeos = [], foGeos = []
            for (let k = 0; k < 40; k++) { const a = R() * 6.28, rr = 24 + R() * 84, fx = ex + Math.cos(a) * rr, fz = ez + Math.sin(a) * rr, fy = heightAt(fx, fz); if (fy < SEA.level + 1.6 || edoStream(fx, fz) < 5) continue
              const s = 0.8 + R() * 0.5, tg = new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.5 * s, 5); tg.translate(fx, fy + 0.75 * s, fz); trGeos.push(tg)
              const fg = new THREE.IcosahedronGeometry(1.5 * s, 2); fg.scale(1, 0.94, 1); fg.translate(fx, fy + 2.1 * s, fz); foGeos.push(fg) } // det1で樹冠を丸く（統合済み＝三角形増のみ・描画コール不変）
            if (trGeos.length && BufferGeometryUtils.mergeGeometries) { const tm = BufferGeometryUtils.mergeGeometries(trGeos, false); if (tm) { const me = new THREE.Mesh(tm, trunkM); me.castShadow = true; town.add(me) } trGeos.forEach((g) => g.dispose())
              const fm = BufferGeometryUtils.mergeGeometries(foGeos, false); if (fm) { const fe = new THREE.Mesh(fm, foliM); fe.castShadow = true; town.add(fe) } foGeos.forEach((g) => g.dispose()) }
          } } // 城下〜外周の田畑（外周の地肌を埋める）＋町なかの庭木
        // 海岸の磯（島の汀に岩が点々＝海岸線のクオリティ）
        for (let k = 0; k < 26; k++) { const a = (k / 26) * 6.2832 + R() * 0.2, rr = coastR(edoLand, ex, ez, a) - 3 + R() * 6, rx = ex + Math.cos(a) * rr, rz = ez + Math.sin(a) * rr, ry = heightAt(rx, rz); const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 + R() * 1.3, 0), toon(season === 'winter' ? 0x9c9c98 : 0x837c70)); rk.position.set(rx, Math.max(SEA.level, ry) + 0.3 + R() * 0.5, rz); rk.rotation.set(R() * 3, R() * 3, R() * 3); rk.scale.y = 0.65; rk.castShadow = true; town.add(rk) }
        addCoastDetail(EDO.x, EDO.z, edoLand) // 汀の白波リボン＋流木/寄り石/浜草（homeの渚を島の閉じた海岸線へ）
        // 江戸の堀・川を「空を映す水鏡」に（海テクスチャ流用の平らな青を脱す＝谷戸/home/大正と質を揃える）。さざ波は決定的パターン＝R()列を乱さない。
        const ewc = document.createElement('canvas'); ewc.width = ewc.height = 64; const ewx = ewc.getContext('2d')
        const ewg = ewx.createLinearGradient(0, 0, 0, 64); ewg.addColorStop(0, '#' + new THREE.Color(0x6ea2c4).lerp(skyTop, 0.34).getHexString()); ewg.addColorStop(1, '#' + new THREE.Color(0x46708e).lerp(skyHorizon, 0.18).getHexString())
        ewx.fillStyle = ewg; ewx.fillRect(0, 0, 64, 64)
        const ewsg = ewx.createLinearGradient(20, 64, 44, 0); ewsg.addColorStop(0, 'rgba(255,255,255,0)'); ewsg.addColorStop(0.5, '#' + sunCol.clone().lerp(new THREE.Color(0xffffff), 0.2).getHexString()); ewsg.addColorStop(1, 'rgba(255,255,255,0)')
        ewx.globalAlpha = 0.32; ewx.fillStyle = ewsg; ewx.fillRect(0, 0, 64, 64); ewx.globalAlpha = 1
        for (let i = 0; i < 46; i++) { ewx.fillStyle = 'rgba(255,255,255,0.07)'; ewx.fillRect((i * 29) % 64, (i * 13) % 64, 1 + (i % 2), 1) } // さざ波（決定的＝乱数を消費しない）
        const ewtex = new THREE.CanvasTexture(ewc); ewtex.wrapS = ewtex.wrapT = THREE.RepeatWrapping; ewtex.repeat.set(2, 2)
        const edoWaterMat = () => freshWater(new THREE.MeshToonMaterial({ map: ewtex, gradientMap: grad, color: isNight ? 0x8a98a4 : 0xffffff, fog: true }))
        // ── 城下を蛇行する小川（平底の河床＋河川敷の草＋木の橋）＝平らな台地に水辺の自然 ──
        { const wmat = edoWaterMat()
          const grassC = season === 'winter' ? 0xb8c0b6 : season === 'autumn' ? 0x9a8a52 : 0x6e8a48
          let prev = null
          for (let s = 0; s <= 26; s++) { const edd = 24 + s * ((EDO.r - 14 - 24) / 26), ang = 1.15 + Math.sin(edd * 0.085) * 0.34, px = ex + Math.cos(ang) * edd, pz = ez + Math.sin(ang) * edd, py = heightAt(px, pz)
            if (edoLand(px, pz) < 5) break // 汀で川を止める（新しい海岸線の外＝海に水面を描かない）
            const w = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 6.6), wmat); w.rotation.x = -Math.PI / 2; if (prev) w.rotation.z = Math.atan2(pz - prev.z, px - prev.x); w.position.set(px, py + 0.28, pz); town.add(w) // 水面（広い河床に沿う）
            if (s % 2 === 0) for (const side of [-1, 1]) { const gx = px + Math.cos(ang + Math.PI / 2) * 4.4 * side, gz = pz + Math.sin(ang + Math.PI / 2) * 4.4 * side, gyy = heightAt(gx, gz); const gr = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + R() * 0.4, 0), toon(grassC)); gr.position.set(gx, gyy + 0.18, gz); gr.scale.y = 0.5; town.add(gr) } // 河川敷の草むら
            prev = { x: px, z: pz } }
          { const bang = 1.15 + Math.sin(50 * 0.085) * 0.34, bx = ex + Math.cos(bang) * 50, bz = ez + Math.sin(bang) * 50, bbank = heightAt(bx + Math.cos(bang + Math.PI / 2) * 4.5, bz + Math.sin(bang + Math.PI / 2) * 4.5)
            const br = new THREE.Mesh(new THREE.BoxGeometry(9, 0.34, 2.3), toon(0x7a6248)); br.position.set(bx, bbank + 0.5, bz); br.rotation.y = bang; br.castShadow = true; town.add(br); town.add(addOutline(br))
            for (const rl of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 0.12), toon(0x6a5440)); rail.position.set(bx + Math.cos(bang + Math.PI / 2) * 1.05 * rl, bbank + 0.95, bz + Math.sin(bang + Math.PI / 2) * 1.05 * rl); rail.rotation.y = bang; town.add(rail) } } // 木の橋＋欄干
        }
        const moat = new THREE.Mesh(new THREE.RingGeometry(12, 20, 56), edoWaterMat()); moat.rotation.x = -Math.PI / 2; moat.position.set(ex, gy + 0.12, ez); town.add(moat) // 堀（空を映す水鏡＝上から水堀と読める。やや広く）
        for (const rr of [12, 20]) { const bank = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.35, 6, 44), toon(season === 'winter' ? 0x8e8b82 : 0x847d70)); bank.rotation.x = -Math.PI / 2; bank.position.set(ex, gy + 0.22, ez); town.add(bank) } // 石垣の護岸（内外の縁）
        const baseH = 7.5
        const ishi = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 12.5, baseH, 4), stoneMat(season === 'winter' ? 0x908d84 : 0x8b8478, 5, 5)); ishi.rotation.y = Math.PI / 4; ishi.position.set(ex, gy + baseH / 2, ez); ishi.castShadow = true; ishi.receiveShadow = true; town.add(ishi); town.add(addOutline(ishi)) // 石垣（裾広がりの四角錐台・野面積みの石テクスチャ＝近接で本物の石積み）
        for (const f of [0.26, 0.52, 0.78]) { const r = 12.5 + (9.5 - 12.5) * f; const cs = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.05, r + 0.12, 0.16, 4), toon(0x6f6b62)); cs.rotation.y = Math.PI / 4; cs.position.set(ex, gy + baseH * f, ez); town.add(cs) } // 石の段（横の石組み）
        const wallC = toon(season === 'winter' ? 0xf1ede3 : 0xebe5d7), roofC = toon(season === 'winter' ? (isNight ? 0x6e7782 : 0x9aa3ab) : (isNight ? 0x29303a : 0x3a434e)) // 冬は屋根に雪化粧
        const litMat = new THREE.MeshBasicMaterial({ color: 0xf0bd72, fog: true }) // 夜に灯る障子/窓の暖色
        const winC = isNight ? litMat : toon(0x2e3138) // 連子窓（夜は灯る）
        let yb = gy + baseH, topBase = yb, topW = 3.4
        const tiers = [[7.4, 4.6], [6.3, 4.0], [5.3, 3.6], [4.3, 3.2], [3.4, 3.0]] // [壁幅, 壁高] 下から上へ
        for (let i = 0; i < tiers.length; i++) {
          const w = tiers[i][0], h = tiers[i][1], rw = (w + 1.8) * 0.72, rh = 2.2
          if (i === tiers.length - 1) { topBase = yb; topW = w }
          const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), wallC); wall.position.set(ex, yb + h / 2, ez); wall.castShadow = true; town.add(wall); town.add(addOutline(wall)) // 白漆喰の壁
          for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const nx = Math.sin(a), nz = Math.cos(a); for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.85, h * 0.4, 0.06), winC); win.position.set(ex + nx * (w / 2 + 0.04) + Math.cos(a) * s * w * 0.24, yb + h * 0.52, ez + nz * (w / 2 + 0.04) - Math.sin(a) * s * w * 0.24); win.rotation.y = a; town.add(win) } } // 連子窓（各面2つ）
          const roof = new THREE.Mesh(new THREE.ConeGeometry(rw, rh, 4), roofC); roof.rotation.y = Math.PI / 4; roof.position.set(ex, yb + h + rh / 2 - 0.15, ez); roof.castShadow = true; town.add(roof); town.add(addOutline(roof)) // 黒瓦の屋根（軒が張る）
          if (i < 3) for (const sgn of [1, -1]) { const gb = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.26, w * 0.26, 0.42, 3), wallC); gb.rotation.set(Math.PI / 2, 0, Math.PI / 2); gb.position.set(ex, yb + h + 0.5, ez + sgn * rw * 0.58); gb.castShadow = true; town.add(gb); town.add(addOutline(gb)) } // 千鳥破風（前後の妻）
          yb += h + rh - 1.0
        }
        { const br = topW / 2 + 0.45, ry0 = topBase + 1.3; for (const [ax, az, ry] of [[0, br, 0], [0, -br, 0], [br, 0, Math.PI / 2], [-br, 0, Math.PI / 2]]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(br * 2 + 0.2, 0.34, 0.1), toon(0x6a4a30)); rail.position.set(ex + ax, ry0, ez + az); rail.rotation.y = ry; town.add(rail) } } // 最上階の高欄（望楼の廻縁）
        for (const sgn of [-1, 1]) { const shachi = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.1, 6), toon(0xc8a23c)); shachi.position.set(ex + sgn * 1.3, yb + 0.2, ez); shachi.rotation.z = sgn * -0.32; town.add(shachi) } // 鯱（金）
        // ── 城下の町家（堀の外。環状に整列）。西(ang≈π)に大手門への参道を空ける ──
        const tRoof = toon(season === 'winter' ? (isNight ? 0x8a9098 : 0xb8bcc0) : (isNight ? 0x47403a : 0x6f5f4d)), tWall = machiyaMat(season === 'winter' ? 0xd9d3c5 : 0xcbc0a9) // 町家＝障子の格子窓＋格子戸の正面（夕夜は障子が行灯で灯る）
        const angGap = (a) => { let d = Math.abs(a - Math.PI); if (d > Math.PI) d = 6.2832 - d; return d } // 西の参道(ang≈π)からの角度差
        // 広大な城下町: 町家(平屋/2階)・土蔵・大店を高さ/大きさ/色を変えて密に。放射の大通りで街区を割る。メッシュ統合で軽量。
        // 屋根は街区(扇形セクタ)ごとに色をまとめ＝俯瞰の市松を脱し「瓦の町並みの塊」に。町家は街路に平行な切妻、土蔵/大店は寄棟。
        const wallA = [], wallB = [], wall3 = [], litG = [], plE = [], tmpM = new THREE.Matrix4(), rotM = new THREE.Matrix4()
        const avenues = [0.4, 1.18, 1.96, 2.74, 3.6, 4.38, 5.16, 5.94] // 放射の大通り（8本＝入り組んだ街路網に）
        const ringRoads = [40, 66, 92, 116] // 同心円の環状道路（街区を区切る・拡大した外周にもう一本）
        const bukeSpots = [[0.02, 92], [0.16, 100], [0.34, 86], [4.55, 98], [4.72, 90], [2.42, 84]] // 武家屋敷町の区画（半島や外周の新地区）[角度, 半径]
        const edoFac = [{ x: ex - 40, z: ez + 38, r: 14 }, { x: ex - 26, z: ez - 58, r: 10 }, ...bukeSpots.map(([a, r]) => ({ x: ex + Math.cos(a) * r, z: ez + Math.sin(a) * r, r: 6.5 }))] // 庭園/寺子屋/武家屋敷の区画（町家を空ける）
        const roofPalette = isNight
          ? [0x2e2f33, 0x342c24, 0x2a2520, 0x3a2c26, 0x33302c]
          : [0x717479, 0x6a5640, 0x564636, 0x7a4f3c, 0x807668] // 瓦銀鼠/茶瓦/杉皮/弁柄/灰茶
        const roofMats = roofPalette.map((c) => tileMat(c, 2, 3, true)) // 瓦の屋根テクスチャ（切妻は片面巻き→両面）
        const roofGeos = roofPalette.map(() => [])
        const nSec = 9 // 城下を9つの街区(扇形)に割り、各区で屋根の基調色をまとめる
        const gableUnit = (() => { // 切妻屋根の単位素片。ridge=ローカルX、妻行=Z、棟高=Y(0→1)
          const g = new THREE.BufferGeometry()
          const P = { a: [-0.5, 0, -0.5], b: [0.5, 0, -0.5], c: [0.5, 0, 0.5], d: [-0.5, 0, 0.5], e: [-0.5, 1, 0], f: [0.5, 1, 0] }
          const v = [], push = (...pts) => pts.forEach((p) => v.push(p[0], p[1], p[2]))
          push(P.a, P.b, P.f); push(P.a, P.f, P.e) // 背スロープ(z-)
          push(P.d, P.e, P.f); push(P.d, P.f, P.c) // 前スロープ(z+)
          push(P.a, P.e, P.d); push(P.b, P.c, P.f) // 妻壁(x∓)
          // ConeGeometry(寄棟)と統合するため index/uv 属性を揃える（非index混在だと mergeGeometries が失敗する）。UVは瓦が軒→棟へ流れるよう割付。
          g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
          const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 1] // 各頂点(18)のUV: スロープは軒0→棟1
          g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(uv), 2))
          g.setIndex([...Array(18).keys()]); g.computeVertexNormals(); return g
        })()
        for (let ring = 0; ring < 31; ring++) {
          const rr = 21 + ring * 3.1, n = Math.round(rr * 1.42) // 密に＝賑わう城下町（リング間隔を詰め、1リングの軒数を増やす）
          const onRing = ringRoads.some((rr0) => Math.abs(rr - rr0) < 2.6) // 環状道路のリングは建てない
          for (let k = 0; k < n; k++) {
            const a = (k / n) * 6.2832 + ring * 0.45
            if (angGap(a) < 0.3) continue // 大手門の参道
            let onAve = false; for (const av of avenues) { let d = Math.abs(a - av); if (d > Math.PI) d = 6.2832 - d; if (d < 0.12) { onAve = true; break } }
            if (onAve || onRing || k % 34 === 0) continue // 大通り＋環状道路＋路地の隙間（路地をさらに減らして賑わう城下町に）
            const jit = (R() - 0.5) * 1.8, hx = ex + Math.cos(a) * (rr + jit), hz = ez + Math.sin(a) * (rr + jit), hy = heightAt(hx, hz)
            if (hy < SEA.level + 1.0 || edoLand(hx, hz) < 15 || edoStream(hx, hz) < 8 || edoFac.some((f) => Math.hypot(hx - f.x, hz - f.z) < f.r)) continue // 海・渚(汀から内側へ引く)・広い川・庭園/寺子屋には建てない
            const tt = R(), two = tt < 0.44, kura = tt > 0.88, oodana = tt > 0.72 && tt <= 0.88 // 2階町家/土蔵/大店（2階を増やし高低差を出す）
            const hw = oodana ? 3.6 + R() * 1.8 : 2.1 + R() * 1.3
            const hd = oodana ? 2.8 + R() * 1.3 : kura ? hw : 1.7 + R() * 1.0
            const hh = two ? 3.0 + R() * 1.3 : kura ? 2.9 + R() * 0.7 : oodana ? 2.2 + R() * 0.5 : 1.3 + R() * 0.6
            tmpM.makeRotationY(a).setPosition(hx, hy + hh / 2, hz); const bg = new RoundedBoxGeometry(hw, hh, hd, 1, Math.min(0.16, Math.min(hw, hd) * 0.07)); if (!kura) bakeAO(bg, hh); bg.applyMatrix4(tmpM); (kura ? wallB : R() < 0.16 ? wall3 : wallA).push(bg) // 角を面取り＝低ポリの角張りを脱す
            colliders.push({ x: hx, z: hz, cos: Math.cos(a), sin: Math.sin(a), hw: hw / 2 + 0.15, hd: hd / 2 + 0.15 }) // 歩行: 町家をすり抜けない（R()非消費＝配置シード不変）
            const plg = new THREE.BoxGeometry(hw + 0.5, 0.55, hd + 0.5); tmpM.makeRotationY(a).setPosition(hx, hy + 0.18, hz); plg.applyMatrix4(tmpM); plE.push(plg) // 石の土台（接地）
            const sec = Math.floor((((a % 6.2832) + 6.2832) % 6.2832) / (6.2832 / nSec))
            let ci = (sec * 2 + (sec % 2)) % roofPalette.length; if (R() < 0.22) ci = (ci + 1) % roofPalette.length; if (kura) ci = 2 // 街区基調＋時々隣色で揺らぐ。土蔵は杉皮
            const rh = two ? 1.6 : kura ? 1.0 : oodana ? 1.3 : 1.0
            if (kura || oodana) { // 土蔵・大店は寄棟（四角錐）。軒を深く張り出す
              tmpM.makeRotationY(a + Math.PI / 4).setPosition(hx, hy + hh + rh / 2 - 0.05, hz); const rg = new THREE.ConeGeometry(Math.max(hw, hd) * 0.76, rh, 4); rg.applyMatrix4(tmpM); roofGeos[ci].push(rg)
            } else { // 町家は街路に平行な切妻（ridgeを接線方向 a+π/2 へ・庇が両側に深く出る平入り）
              const rg = gableUnit.clone(); tmpM.makeScale(hw * 1.12, rh, hd * 1.3); rotM.makeRotationY(a + Math.PI / 2); tmpM.premultiply(rotM); tmpM.setPosition(hx, hy + hh - 0.05, hz); rg.applyMatrix4(tmpM); roofGeos[ci].push(rg)
            }
            if (isNight && R() < 0.5) { tmpM.makeRotationY(a).setPosition(hx + Math.cos(a) * (hw * 0.45), hy + hh * (two ? 0.62 : 0.45), hz + Math.sin(a) * (hw * 0.45)); const lg = new THREE.BoxGeometry(0.5, 0.5, 0.12); lg.applyMatrix4(tmpM); litG.push(lg) }
          }
        }
        const wallBMat = mottleMat(season === 'winter' ? 0xeae6dc : 0xe2ddd0, 170, 0.1, [1.2, 1.2]), wall3Mat = machiyaMat(season === 'winter' ? 0xb8b0a2 : 0x9a8a70) // 土蔵=漆喰のまま/板壁の町家=格子窓の正面（夕夜は灯る）
        tWall.vertexColors = true; wall3Mat.vertexColors = true // 壁の接地AO（頂点色）を効かせる
        const plinthMat = mottleMat(season === 'winter' ? 0xbcc0c2 : 0x8c867c, 120, 0.12, [2, 1]) // 石の土台
        for (const [geos, mat] of [[wallA, tWall], [wallB, wallBMat], [wall3, wall3Mat], [plE, plinthMat], [litG, litMat]]) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = mat !== litMat; mesh.receiveShadow = mat !== litMat; town.add(mesh) } geos.forEach((g) => g.dispose()) } }
        // ── 城下の街路網（放射の大通り8本＋大手門参道＋環状道路3本）＝入り組んだ道。地形に沿う土の道。統合で軽量。 ──
        { const roadMat = mottleMat(season === 'winter' ? 0xc8ccc6 : 0x7e7050, 120, 0.1, [5, 5]), roadGeos = [], rM = new THREE.Matrix4(), rMx = new THREE.Matrix4() // 城下の土の道にムラ＝踏み固められた土の質感
          // 両端の高さで傾けた1区間（home路地segAlleyと同じ作法）＝坂で端が浮く/刺さるのを断つ。
          // h=道の種別ごとの厚み。底は地面+0.01で揃え天面だけ種別で変える＝交差の重ね置きで天面が同一高さになるZファイティングを断つ。
          const seg = (x0, z0, x1, z1, w, h = 0.16) => { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); if (len < 0.5) return; const y0 = heightAt(x0, z0), y1 = heightAt(x1, z1), py = (y0 + y1) / 2; if (py < SEA.level + 0.6 || edoLand((x0 + x1) / 2, (z0 + z1) / 2) < 20) return; const bg = new THREE.BoxGeometry(w, h, len + 0.9); rMx.makeRotationX(-Math.atan2(y1 - y0, len)).premultiply(rM.makeRotationY(Math.atan2(dx, dz))); rMx.setPosition((x0 + x1) / 2, py + 0.01 + h / 2, (z0 + z1) / 2); bg.applyMatrix4(rMx); roadGeos.push(bg) }
          const road = (x0, z0, x1, z1, w, h) => { const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 5)); for (let s = 0; s < steps; s++) seg(x0 + (x1 - x0) * s / steps, z0 + (z1 - z0) * s / steps, x0 + (x1 - x0) * (s + 1) / steps, z0 + (z1 - z0) * (s + 1) / steps, w, h) }
          for (const av of [...avenues, Math.PI]) road(ex + Math.cos(av) * 18, ez + Math.sin(av) * 18, ex + Math.cos(av) * 118, ez + Math.sin(av) * 118, av === Math.PI ? 5.2 : 4.0) // 放射の大通り（参道は太め・外周まで延伸）
          for (const rr0 of ringRoads) { let prev = null; for (let s = 0; s <= 56; s++) { const a = s / 56 * 6.2832, px = ex + Math.cos(a) * rr0, pz = ez + Math.sin(a) * rr0; if (prev) road(prev.x, prev.z, px, pz, 3.8, 0.24); prev = { x: px, z: pz } } } // 環状道路（厚み違い=大通りとの交差でZファイト無し）
          // ── 城下の路地網（同心円の細い路地＋大通りの間の放射の路地＝路地裏。建物の列の間を縫う土の細道） ──
          for (let rr0 = 24; rr0 <= 112; rr0 += 6.0) { if (ringRoads.some((r) => Math.abs(r - rr0) < 3)) continue; let prev = null; for (let s = 0; s <= 48; s++) { const a = s / 48 * 6.2832, px = ex + Math.cos(a) * rr0, pz = ez + Math.sin(a) * rr0; if (prev && angGap(a) > 0.26) road(prev.x, prev.z, px, pz, 1.7, 0.2); prev = { x: px, z: pz } } } // 同心円の路地
          for (const av of avenues) { const av2 = av + Math.PI / avenues.length; road(ex + Math.cos(av2) * 20, ez + Math.sin(av2) * 20, ex + Math.cos(av2) * 112, ez + Math.sin(av2) * 112, 1.7, 0.28) } // 放射の路地（大通りの間に）
          if (roadGeos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(roadGeos, false); if (m) { const rmesh = new THREE.Mesh(m, roadMat); rmesh.receiveShadow = true; town.add(rmesh) } roadGeos.forEach((g) => g.dispose()) }
        }
        roofGeos.forEach((geos, i) => { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, roofMats[i]); mesh.castShadow = true; mesh.receiveShadow = true; town.add(mesh) } geos.forEach((g) => g.dispose()) } })
        gableUnit.dispose()
        // 城下のランドマーク（街並みに目印を：五重塔・火の見櫓）
        { const tx = ex + Math.cos(2.2) * 48, tz = ez + Math.sin(2.2) * 48, ty = heightAt(tx, tz)
          if (ty > SEA.level + 1) {
            // 石の基壇（塔は地面に直置きせず一段高い石積みに建つ）＋裾の植栽で「裸の土に刺さる」を解消
            const danM = toon(season === 'winter' ? 0x9aa0a2 : 0x8a8278)
            const dan = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.4, 1.1, 8), danM); dan.rotation.y = Math.PI / 8; dan.position.set(tx, ty + 0.55, tz); dan.castShadow = true; dan.receiveShadow = true; town.add(dan); town.add(addOutline(dan))
            const step = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.0, 0.5, 8), danM); step.rotation.y = Math.PI / 8; step.position.set(tx, ty + 0.25, tz); step.receiveShadow = true; town.add(step) // 一段の沓脱ぎ石
            for (let g = 0; g < 6; g++) { const ga = g / 6 * 6.28 + 0.4, gx = tx + Math.cos(ga) * 5.4, gz = tz + Math.sin(ga) * 5.4, gyy = heightAt(gx, gz); if (gyy < SEA.level + 1) continue; const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), toon(season === 'autumn' ? 0xb06a30 : season === 'winter' ? 0x6e7a72 : 0x4e6e42)); sh.position.set(gx, gyy + 0.7, gz); sh.scale.y = 0.85; sh.castShadow = true; town.add(sh) } // 裾の植栽（低木）
            let py = ty + 1.1; for (let i = 0; i < 5; i++) { const w = 4.0 - i * 0.55, h = 2.1 - i * 0.1; const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), toon(season === 'winter' ? 0xe2ddd0 : 0xcabfa8)); body.position.set(tx, py + h / 2, tz); body.castShadow = true; town.add(body); const roof = new THREE.Mesh(new THREE.ConeGeometry((w + 1.5) * 0.72, 1.0, 4), tRoof); roof.rotation.y = Math.PI / 4; roof.position.set(tx, py + h + 0.4, tz); town.add(roof); town.add(addOutline(roof)); py += h + 0.7 } const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), toon(0xc8a23c)); fin.position.set(tx, py + 1.1, tz); town.add(fin) } } // 五重塔
        { const fx = ex + Math.cos(4.7) * 42, fz = ez + Math.sin(4.7) * 42, fy = heightAt(fx, fz)
          if (fy > SEA.level + 1) { for (const [ddx, ddz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 5), toon(0x5a4632)); leg.position.set(fx + ddx * 0.9, fy + 3.5, fz + ddz * 0.9); leg.rotation.set(ddz * 0.05, 0, -ddx * 0.05); town.add(leg) } const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 2.4), toon(0x6a5238)); cab.position.set(fx, fy + 7.4, fz); cab.castShadow = true; town.add(cab); town.add(addOutline(cab)); const cr = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.0, 4), tRoof); cr.rotation.y = Math.PI / 4; cr.position.set(fx, fy + 8.6, fz); town.add(cr) } } // 火の見櫓
        // ── 城下の賑わい（市場・屋台・提灯・人々）＝街に生気を ──
        const kimono = [0xb0432e, 0x3a5a7a, 0x55703f, 0xc89a34, 0x84548a, 0x5a5a5e, 0xa85a40]
        const mkPerson = (px, py, pz, col) => mkCrowdPerson(px, py, pz, col) // 人らしい体（胴＋首＋小頭＋髪）に＝こけし人形(円柱＋球)を脱す
        { const ma = Math.PI - 0.6, mr = 31, mcx = ex + Math.cos(ma) * mr, mcz = ez + Math.sin(ma) * mr, mgy = heightAt(mcx, mcz)
          if (mgy > SEA.level + 1) {
            for (let s = 0; s < 9; s++) { const a2 = (s / 9) * 6.2832, sx2 = mcx + Math.cos(a2) * 5.5, sz2 = mcz + Math.sin(a2) * 5.5, sgy = heightAt(sx2, sz2); if (sgy < SEA.level + 1) continue
              const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 1.1), toon(0x8a6a48)); counter.position.set(sx2, sgy + 0.42, sz2); counter.rotation.y = a2; counter.castShadow = true; town.add(counter)
              const awn = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 1.7), toon(s % 2 ? 0xc24a33 : 0x40608a)); awn.position.set(sx2, sgy + 1.75, sz2); awn.rotation.y = a2; town.add(awn); town.add(addOutline(awn))
              for (const pp of [-1.0, 1.0]) { const c2 = Math.cos(a2), s4 = Math.sin(a2); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 4), toon(0x5a4632)); pole.position.set(sx2 - s4 * pp, sgy + 0.9, sz2 + c2 * pp); town.add(pole) }
              mkPerson(sx2 + Math.cos(a2) * 1.6, sgy, sz2 + Math.sin(a2) * 1.6, kimono[s % kimono.length]) // 売り子
            }
            for (let s = 0; s < 9; s++) { const a2 = (s / 9) * 6.2832 + 0.35, lx = mcx + Math.cos(a2) * 4, lz = mcz + Math.sin(a2) * 4; const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8), isNight ? new THREE.MeshBasicMaterial({ color: 0xff9a4a, fog: true }) : toon(0xd8504a)); lan.position.set(lx, mgy + 3.4, lz); town.add(lan) } // 提灯（市場の上）
            for (let k = 0; k < 7; k++) mkPerson(mcx + (R() - 0.5) * 8, mgy, mcz + (R() - 0.5) * 8, kimono[k % kimono.length]) // 買い物客
          }
        }
        for (let k = 0; k < 30; k++) { const a2 = R() * 6.28, r2 = 24 + R() * 42, px = ex + Math.cos(a2) * r2, pz = ez + Math.sin(a2) * r2, py = heightAt(px, pz); if (py < SEA.level + 1) continue; mkPerson(px, py, pz, kimono[k % kimono.length]) } // 通りの人々
        for (let k = 0; k < 6; k++) { const a2 = (k / 6) * 6.28 + 0.6, r2 = 24 + R() * 16, px = ex + Math.cos(a2) * r2, pz = ez + Math.sin(a2) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue; makeCargo(px, py, pz, R() * 6.28) } // 店先の積み荷（俵/樽）
        { const yago = ['魚', '酒', '米', '茶', '薬', '呉服', '両替', '蕎麦', '飯', '宿', '油', '炭', '団子', '塩'] // 城下の店の屋号（縦書きの木の掛看板）
          for (let k = 0; k < 13; k++) { const a2 = (k / 13) * 6.28 + 0.3; if (angGap(a2) < 0.34) continue; const r2 = 22 + R() * 9, px = ex + Math.cos(a2) * r2, pz = ez + Math.sin(a2) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.2) continue
            mkSignV(px, py + 1.4, pz, a2 + Math.PI / 2 + (R() - 0.5) * 0.4, yago[k % yago.length], season === 'winter' ? 0xeae0cc : 0xe6d8b8, 0x3a2a1a) } } // 城下の店の看板
        for (const av of [0.4, 1.7, 3.0, 4.4, 5.6]) for (let j = 0; j < 3; j++) { const ang = av + (R() - 0.5) * 0.12, r0 = 24 + j * 5, r1 = 54 + R() * 8; const wg = mkWalkerFig(ex + Math.cos(ang) * r0, heightAt(ex + Math.cos(ang) * r0, ez + Math.sin(ang) * r0), ez + Math.sin(ang) * r0, kimono[(j * 2 + 1) % kimono.length], 0.7); cityWalkers.push({ g: wg, cx: ex, cz: ez, ang, r0, r1, y0: heightAt(ex + Math.cos(ang) * r0, ez + Math.sin(ang) * r0), y1: heightAt(ex + Math.cos(ang) * r1, ez + Math.sin(ang) * r1), sp: 0.05 + R() * 0.04, ph: R() * 2 }) } // 大通りを行き交う人（脚が振れる旅人・初期位置を置く＝遠方時に原点へ取り残されない）
        // ── 城下の市の床店＋犬猫＝降り立った時に出会う江戸の賑わい。 ──
        { const edoGoods = [0xc8702e, 0x7a8a3a, 0xb04030, 0xd0a850, 0x9a5a3a, 0x5a7a8a]
          for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28 + 0.3, r2 = 27 + R() * 15, px = ex + Math.cos(a) * r2, pz = ez + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue
            makeStall(px, py, pz, a + Math.PI / 2 + (R() - 0.5) * 0.4, { roof: R() < 0.5 ? 'reed' : 'cloth', roofCol: R() < 0.5 ? 0xb84a3e : 0x4a5a6a, goods: edoGoods, noren: R() < 0.5 ? 0x2a4a6a : 0x8a3a2a }) }
          for (let k = 0; k < 3; k++) { const a = R() * 6.28, r2 = 25 + R() * 16, px = ex + Math.cos(a) * r2, pz = ez + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue; mkQuad(px, py, pz, R() * 6.28, k === 0 ? 0xc8b89a : 0x4a4038, 0.6 + R() * 0.12, k === 0 ? 'dog' : 'cat') } }
        const addPine = (px, py, pz) => { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.0, 6), toon(0x6a4f38)); tr.position.set(px, py + 1.0, pz); town.add(tr); const fc = toon(season === 'autumn' ? 0x8a7a40 : 0x4e6e44); for (const [cy, cr, ch] of [[2.3, 1.7, 1.8], [3.3, 1.25, 1.55], [4.2, 0.82, 1.35]]) { const fo = new THREE.Mesh(new THREE.ConeGeometry(cr, ch, 8), fc); fo.position.set(px, py + cy, pz); fo.castShadow = true; town.add(fo) } } // 松/杉＝段重ねの円錐（層のある常緑樹）
        // 城下に木立を散らす（家々の合間・辻・空き地を緑で埋める＝home並みの緑量へ）。統合で軽量（1本ごとのドローコールを増やさない）。
        { const leafC = season === 'spring' ? 0x7faa4e : season === 'autumn' ? 0xcf8a38 : season === 'winter' ? 0xcdd6cc : 0x5a7e44
          const trunkGeos = [], coneGeos = [], leafGeos = [], edoTreeShadow = [], tmM2 = new THREE.Matrix4()
          for (let k = 0; k < 76; k++) { const a2 = R() * 6.2832, r2 = 22 + R() * 96, px = ex + Math.cos(a2) * r2, pz = ez + Math.sin(a2) * r2, py = heightAt(px, pz)
            if (py < SEA.level + 1.4 || edoStream(px, pz) < 7 || Math.hypot(px - ex, pz - ez) < 21 || edoFac.some((f) => Math.hypot(px - f.x, pz - f.z) < f.r + 1)) continue // 海/広い川/堀の内/庭園は避ける（拡大した島の外周まで緑を行き渡らせる）
            const pine = R() < 0.4, s = pine ? 1 : 0.85 + R() * 0.5
            if (rectAt(px, pz)) { buriedEraTrees++; continue } // 町家の中には生やさない（R()は全て消費済み＝配置シード不変）
            const trG = new THREE.CylinderGeometry(0.17 * s, 0.27 * s, 1.9 * s, 6); tmM2.makeTranslation(px, py + 0.95 * s, pz); trG.applyMatrix4(tmM2); trunkGeos.push(trG)
            if (pine) { for (const [cy, cr, ch] of [[2.3, 1.7, 1.8], [3.3, 1.25, 1.55], [4.2, 0.82, 1.35]]) { const fG = new THREE.ConeGeometry(cr, ch, 8); tmM2.makeTranslation(px, py + cy, pz); fG.applyMatrix4(tmM2); coneGeos.push(fG) } } // 松/杉＝段重ねの円錐（単一の尖りを脱し層のある常緑樹に。統合済みで描画コール不変）
            else { const fG = new THREE.IcosahedronGeometry(1.5 * s, 2); tmM2.makeTranslation(px, py + 2.2 * s, pz); fG.applyMatrix4(tmM2); leafGeos.push(fG) } // 雑木
            edoTreeShadow.push([px, py, pz, 1.4 * s]) }
          for (const [geos, mat] of [[trunkGeos, toon(0x6a4f38)], [coneGeos, toon(season === 'autumn' ? 0x8a7a40 : 0x4e6e44)], [leafGeos, toon(leafC)]]) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = true; mesh.receiveShadow = true; town.add(mesh) } geos.forEach((g) => g.dispose()) } }
          addContactShadows(edoTreeShadow) // 城下の木立の足元に接地影＝浮きを消す
        }
        // 大手門（西の参道。鏡柱＋冠木＋渡櫓＋築地塀＋松並木）
        { const gx = ex - 19, gz = ez, gyg = heightAt(gx, gz)
          if (gyg > SEA.level + 0.5) {
            for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.4, 0.7), toon(0x5a4632)); post.position.set(gx, gyg + 1.7, gz + s * 2.0); post.castShadow = true; town.add(post); town.add(addOutline(post)) } // 鏡柱
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 4.7), toon(0x5a4632)); lintel.position.set(gx, gyg + 3.5, gz); town.add(lintel) // 冠木
            const yagura = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 5.2), wallC); yagura.position.set(gx, gyg + 4.9, gz); yagura.castShadow = true; town.add(yagura); town.add(addOutline(yagura)) // 渡櫓
            const groof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 4), roofC); groof.rotation.y = Math.PI / 4; groof.position.set(gx, gyg + 6.5, gz); groof.scale.x = 0.55; town.add(groof); town.add(addOutline(groof)) // 門の屋根
            for (const s of [-1, 1]) { const dei = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.7, 7), toon(season === 'winter' ? 0xcfc8ba : 0xc4baa6)); dei.position.set(gx, gyg + 0.85, gz + s * 6.6); town.add(dei); town.add(addOutline(dei)); const cap = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.28, 7), roofC); cap.position.set(gx, gyg + 1.8, gz + s * 6.6); town.add(cap) } // 築地塀＋瓦の笠
            for (const s of [-1, 1]) { const lx = gx - 1.6, lz = gz + s * 2.7, ly = heightAt(lx, lz); const pole = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.45), toon(0x8a8378)); pole.position.set(lx, ly + 0.65, lz); town.add(pole); const fire = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), isNight ? litMat : toon(0xe2d3a6)); fire.position.set(lx, ly + 1.45, lz); town.add(fire); const lcap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.38, 4), toon(0x5a5048)); lcap.rotation.y = Math.PI / 4; lcap.position.set(lx, ly + 1.82, lz); town.add(lcap) } // 灯籠（夜に灯る）
            for (let k = 0; k < 5; k++) { const px = gx - 1 - k * 2.6; for (const s of [-1, 1]) { const pz = gz + s * 3.6, py = heightAt(px, pz); if (py < SEA.level + 1.0) continue; addPine(px, py, pz) } } // 参道の松並木
            const bridge = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 3.4), toon(season === 'winter' ? 0xb8b2a6 : 0x9a8a72)); bridge.position.set(ex - 15.5, gyg + 0.3, gz); bridge.castShadow = true; town.add(bridge); town.add(addOutline(bridge)) // 堀に架かる土橋（大手門→石垣の軸線）
            for (const s of [-1, 1]) for (let bx = -3; bx <= 3; bx += 2) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), toon(0x6a4a30)); post.position.set(ex - 15.5 + bx, gyg + 0.7, gz + s * 1.6); town.add(post) } // 橋の欄干
          }
        }
        // ── 参道（大手門への主通り）に提灯を連ねる（夕/夜は灯って城下の賑わい）。竿＋提灯を統合で軽量に ──
        { const av = Math.PI, perp = av + Math.PI / 2, lm = new THREE.Matrix4(), poleGeos = [], chGeos = []
          const chMat = (isNight || duskAmt > 0.18) ? new THREE.MeshToonMaterial({ color: 0xd8463a, gradientMap: grad, emissive: new THREE.Color(0xff7a44), emissiveIntensity: isNight ? 1.05 : 0.55 }) : toon(0xc8463a)
          for (let rr = 27; rr <= 110; rr += 5.5) for (const side of [-1, 1]) {
            const px = ex + Math.cos(av) * rr + Math.cos(perp) * side * 3.2, pz = ez + Math.sin(av) * rr + Math.sin(perp) * side * 3.2, py = heightAt(px, pz)
            if (py < SEA.level + 0.8) continue
            const pg = new THREE.CylinderGeometry(0.07, 0.09, 3.0, 5); lm.makeTranslation(px, py + 1.5, pz); pg.applyMatrix4(lm); poleGeos.push(pg) // 竿
            const cg = new THREE.CylinderGeometry(0.3, 0.3, 0.66, 8); lm.makeTranslation(px, py + 2.9, pz); cg.applyMatrix4(lm); chGeos.push(cg) // 提灯
          }
          if (BufferGeometryUtils.mergeGeometries) {
            const pm = BufferGeometryUtils.mergeGeometries(poleGeos, false); if (pm) town.add(new THREE.Mesh(pm, toon(0x4a3a2c))); poleGeos.forEach((g) => g.dispose())
            const cm = BufferGeometryUtils.mergeGeometries(chGeos, false); if (cm) town.add(new THREE.Mesh(cm, chMat)); chGeos.forEach((g) => g.dispose())
          }
        }
        // ── 二の丸御殿（城内の御殿。低く広がる入母屋の屋根）──
        { const palMat = toon(season === 'winter' ? 0xe8e4da : 0xe0d8c6), palRoof = toon(season === 'winter' ? (isNight ? 0x70787f : 0x9aa0a6) : (isNight ? 0x33373e : 0x49515b))
          const pa = 0.7, pcx = ex + Math.cos(pa) * 19.5, pcz = ez + Math.sin(pa) * 19.5, pgy = heightAt(pcx, pcz)
          for (const [dx, dz, ww, wd] of [[0, 0, 7, 5], [5.2, 1.0, 4, 6.5], [-3.2, 1.6, 5.5, 3.6]]) {
            const wh = 1.8, body = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), palMat); body.position.set(pcx + dx, pgy + wh / 2, pcz + dz); body.castShadow = true; town.add(body); town.add(addOutline(body))
            const md = Math.max(ww, wd), roof = new THREE.Mesh(new THREE.ConeGeometry(md * 0.62, 1.5, 4), palRoof); roof.rotation.y = Math.PI / 4; roof.scale.set(ww / md, 1, wd / md); roof.position.set(pcx + dx, pgy + wh + 0.65, pcz + dz); roof.castShadow = true; town.add(roof); town.add(addOutline(roof))
          }
          addPine(pcx + 4.5, pgy, pcz - 4); addPine(pcx - 5, pgy, pcz - 3) // 御殿前の松
        }
        // ── 船着場（島の港。木の桟橋＋係留の小舟）──
        { const da = 2.5, sdx = Math.cos(da), sdz = Math.sin(da)
          for (let r = 35; r <= 41; r += 1.5) { const px = ex + sdx * r, pz = ez + sdz * r; const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 6), toon(0x5a4632)); pile.position.set(px, SEA.level + 0.3, pz); town.add(pile) } // 杭
          const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 2.4), toon(0x6a4f38)); deck.position.set(ex + sdx * 38, SEA.level + 1.4, ez + sdz * 38); deck.rotation.y = -da; deck.castShadow = true; town.add(deck); town.add(addOutline(deck)) // 桟橋の床
          for (const off of [-2.2, 2.2]) { const bx = ex + sdx * 40 - sdz * off, bz = ez + sdz * 40 + sdx * off; const boat = new THREE.Group(); boat.position.set(bx, SEA.level + 0.15, bz); boat.rotation.y = -da; boat.userData = { ph: R() * 6.28 }; const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 1.2), toon(0x55402a)); hull.position.y = 0.1; boat.add(hull); town.add(boat); boats.push(boat) } // 係留の小舟
        }
        for (let k = 0; k < 6; k++) { const ang = R() * 6.28, rr = 26 + R() * 8, px = ex + Math.cos(ang) * rr, pz = ez + Math.sin(ang) * rr, py = heightAt(px, pz); if (py < SEA.level + 1.2) continue; addPine(px, py, pz) } // 島の松
        // ── 四季の木立（春＝桜／秋＝紅葉／冬＝雪化粧／夏＝緑。堀の外をぐるり囲む）──
        { const folC = season === 'spring' ? 0xeeb6cc : season === 'autumn' ? 0xcf7034 : season === 'winter' ? 0xdfe4e7 : 0x5c7e48
          for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.2832; if (angGap(a) < 0.5 || Math.abs(a - 0.7) < 0.5) continue; const rr = 20.5 + (k % 2) * 1.2, px = ex + Math.cos(a) * rr, pz = ez + Math.sin(a) * rr, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue; const s = 0.9 + R() * 0.3
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 1.5 * s, 6), toon(0x6a4f38)); tr.position.set(px, py + 0.75 * s, pz); town.add(tr)
            const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 0), toon(folC)); fo.position.set(px, py + 2.1 * s, pz); fo.castShadow = true; town.add(fo) } } // 四季の木立
        // ── 城下の高台の鎮守の社（拡大に合わせた地形の見どころ。朱の鳥居＋お堂＋鎮守の森） ──
        { const hx0 = ex + 42, hz0 = ez - 40, hy0 = heightAt(hx0, hz0)
          const torii = new THREE.Group(); torii.position.set(hx0, hy0, hz0 + 8); const trd = toon(season === 'winter' ? 0xb04438 : 0xc0392b)
          for (const px of [-2.2, 2.2]) { const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 5.0, 7), trd); pil.position.set(px, 2.5, 0); pil.castShadow = true; torii.add(pil) }
          torii.add(new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.6, 0.7), trd).translateY(4.9)); torii.add(new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.4, 0.5), trd).translateY(3.9)); town.add(torii); town.add(addOutline(torii))
          const hall = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), machiyaMat(0xd8cfb8)); hall.position.set(hx0, hy0 + 1.6, hz0); hall.castShadow = true; hall.receiveShadow = true; town.add(hall); town.add(addOutline(hall))
          const hroof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.2, 4), tileMat(season === 'winter' ? 0xb8bcc0 : 0x564636, 2, 2, false)); hroof.rotation.y = Math.PI / 4; hroof.position.set(hx0, hy0 + 4.3, hz0); hroof.castShadow = true; town.add(hroof); town.add(addOutline(hroof))
          for (let k = 0; k < 12; k++) { const a = R() * 6.28, rr = 8 + R() * 12, tx2 = hx0 + Math.cos(a) * rr, tz2 = hz0 + Math.sin(a) * rr, ty2 = heightAt(tx2, tz2); if (ty2 < hy0 - 4) continue; const s = 1.0 + R() * 0.5 // 鎮守の森
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 2.0 * s, 6), toon(0x6a4f38)); tr.position.set(tx2, ty2 + 1.0 * s, tz2); town.add(tr)
            const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * s, 1), toon(season === 'autumn' ? 0xb06a30 : season === 'winter' ? 0x6e7a72 : 0x4e6e42)); fo.position.set(tx2, ty2 + 2.6 * s, tz2); fo.castShadow = true; town.add(fo) }
          for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 1.4), toon(0x9a948a)); st.position.set(hx0 + (i - 5) * 1.0, heightAt(hx0 + (i - 5) * 2.4, hz0 + 8 + i * 1.6) + 0.15, hz0 + 8 + i * 1.6); town.add(st) } } // 参道の石段
        // ── 大名庭園（池＋太鼓橋＋石灯籠＋桜松）＝城下の憩いの場（公園） ──
        { const gx0 = ex - 40, gz0 = ez + 38, gy0 = heightAt(gx0, gz0)
          if (gy0 > SEA.level + 1) {
            const pond = new THREE.Mesh(new THREE.CircleGeometry(8, 22), new THREE.MeshBasicMaterial({ map: wtex, color: isNight ? 0x3a4a52 : 0x8aacba, fog: true })); pond.rotation.x = -Math.PI / 2; pond.position.set(gx0, gy0 + 0.14, gz0); town.add(pond)
            const bank = new THREE.Mesh(new THREE.TorusGeometry(8, 0.32, 6, 26), toon(0x8a8278)); bank.rotation.x = -Math.PI / 2; bank.position.set(gx0, gy0 + 0.22, gz0); town.add(bank)
            const bridge = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.3, 6, 10, Math.PI), toon(season === 'winter' ? 0xb04438 : 0xc0392b)); bridge.position.set(gx0, gy0 + 0.4, gz0); bridge.rotation.set(0, 0.6, 0); town.add(bridge); town.add(addOutline(bridge)) // 太鼓橋
            for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28, lx = gx0 + Math.cos(a) * 10, lz = gz0 + Math.sin(a) * 10, ly = heightAt(lx, lz); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.3, 6), toon(0x9a948a)); post.position.set(lx, ly + 0.65, lz); town.add(post); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.5, 6), toon(0x8a8278)); cap.position.set(lx, ly + 1.5, lz); town.add(cap) } // 石灯籠
            for (let k = 0; k < 8; k++) { const a = R() * 6.28, rr = 10 + R() * 4, px = gx0 + Math.cos(a) * rr, pz = gz0 + Math.sin(a) * rr, py = heightAt(px, pz); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), toon(0x6a4f38)); tr.position.set(px, py + 0.8, pz); town.add(tr); const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), toon(season === 'spring' ? 0xeeb6cc : season === 'autumn' ? 0xcf7034 : season === 'winter' ? 0xdfe4e7 : 0x4e6e44)); fo.position.set(px, py + 2.2, pz); fo.castShadow = true; town.add(fo) } } }
        // ── 寺子屋（手習いの学び舎＋幟）＝城下の学校 ──
        { const sx0 = ex - 26, sz0 = ez - 58, sy0 = heightAt(sx0, sz0)
          if (sy0 > SEA.level + 1) {
            const hall = new THREE.Mesh(new RoundedBoxGeometry(8, 3.0, 5.4, 1, 0.12), machiyaMat(0xd8cfb8)); hall.position.set(sx0, sy0 + 1.5, sz0); hall.castShadow = true; hall.receiveShadow = true; town.add(hall); town.add(addOutline(hall))
            const hroof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.0, 4), tileMat(season === 'winter' ? 0xb8bcc0 : 0x564636, 2, 2, false)); hroof.rotation.y = Math.PI / 4; hroof.position.set(sx0, sy0 + 4.0, sz0); hroof.castShadow = true; town.add(hroof); town.add(addOutline(hroof))
            const fence = new THREE.Mesh(new THREE.BoxGeometry(14, 1.0, 0.2), toon(0x8a6a48)); fence.position.set(sx0, sy0 + 0.5, sz0 + 6); town.add(fence) // 庭の塀
            const nob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.2), signMat('手習所', '#e6dcc4', '#3a2a1a', true)); nob.position.set(sx0 - 5.2, sy0 + 2.6, sz0 + 4); town.add(nob); const npole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 5), toon(0x6a5440)); npole.position.set(sx0 - 5.7, sy0 + 2.2, sz0 + 4); town.add(npole) } } // 幟
        // ── 城下の暮らしの作り込み（町なかの庭木・堀の小舟・井戸）＝近づくほど良い街に ──
        { const gC = season === 'spring' ? 0x7faa56 : season === 'autumn' ? 0xb88a3e : season === 'winter' ? 0xcdd6d2 : 0x5e7e46
          for (let k = 0; k < 15; k++) { const a = R() * 6.28; if (angGap(a) < 0.34) continue; const rr = 25 + R() * 36, px = ex + Math.cos(a) * rr, pz = ez + Math.sin(a) * rr, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue; const s = 0.7 + R() * 0.5 // 家々の間の庭木
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 1.3 * s, 6), toon(0x6a4f38)); tr.position.set(px, py + 0.65 * s, pz); town.add(tr)
            const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 * s, 0), toon(gC)); fo.position.set(px, py + 1.75 * s, pz); fo.castShadow = true; town.add(fo) }
          for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28 + 0.5, br = 15.8, bx = ex + Math.cos(a) * br, bz = ez + Math.sin(a) * br // 堀に浮かぶ係留の小舟
            const boat = new THREE.Group(); const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.36, 0.85), toon(0x5a4632)); hull.position.y = 0.18; boat.add(hull); const inside = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 0.55), toon(0x6e5640)); inside.position.y = 0.32; boat.add(inside)
            boat.position.set(bx, gy + 0.16, bz); boat.rotation.y = a + Math.PI / 2; boat.rotation.z = (R() - 0.5) * 0.05; town.add(boat) }
          for (const [wa, wr] of [[1.3, 30], [4.3, 27]]) { const wx = ex + Math.cos(wa) * wr, wz = ez + Math.sin(wa) * wr, wy = heightAt(wx, wz); if (wy < SEA.level + 1.5) continue // 井戸（井筒＋四本柱の小屋根）
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.9, 8), toon(0x8b8478)); ring.position.set(wx, wy + 0.45, wz); ring.castShadow = true; town.add(ring); town.add(addOutline(ring))
            for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 5), toon(0x5a4632)); post.position.set(wx + dx, wy + 1.25, wz + dz); town.add(post) }
            const wroof = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.66, 4), tRoof); wroof.rotation.y = Math.PI / 4; wroof.position.set(wx, wy + 2.4, wz); town.add(wroof); town.add(addOutline(wroof)) }
        }
        // ── 武家屋敷町（拡大した外周の新地区）。築地塀に囲まれた侍の屋敷＝長屋門＋入母屋の主屋＋庭の松。城下の格を上げる ──
        { const bWall = toon(season === 'winter' ? 0xd8d2c4 : 0xcabfa8), bRoofM = tileMat(season === 'winter' ? 0xb8bcc0 : 0x564636, 2, 2, false), bCap = toon(season === 'winter' ? 0xa8acb0 : 0x5a4e3c)
          for (const [a, rr] of bukeSpots) { const cx2 = ex + Math.cos(a) * rr, cz2 = ez + Math.sin(a) * rr, cy = heightAt(cx2, cz2); if (cy < SEA.level + 1.6) continue
            const g = new THREE.Group(); g.position.set(cx2, cy, cz2); g.rotation.y = a + Math.PI / 2; town.add(g) // 街路に正対
            for (const [lx, lz, lw, ld] of [[0, -4.7, 9.4, 0.4], [0, 4.7, 9.4, 0.4], [-4.7, 0, 0.4, 9.0], [4.7, 0, 0.4, 9.0]]) { const w = new THREE.Mesh(new THREE.BoxGeometry(lw, 1.5, ld), bWall); w.position.set(lx, 0.75, lz); w.castShadow = true; g.add(w); const cap = new THREE.Mesh(new THREE.BoxGeometry(lw + 0.2, 0.22, ld + 0.2), bCap); cap.position.set(lx, 1.6, lz); g.add(cap) } // 築地塀＋瓦の笠
            const gate = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.3, 1.3), bWall); gate.position.set(0, 1.15, -4.7); gate.castShadow = true; g.add(gate); g.add(addOutline(gate)) // 長屋門
            const groof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.0, 4), bRoofM); groof.rotation.y = Math.PI / 4; groof.scale.set(1.3, 1, 0.55); groof.position.set(0, 2.7, -4.7); g.add(groof); g.add(addOutline(groof))
            const house = new THREE.Mesh(new RoundedBoxGeometry(5.4, 2.6, 4.2, 1, 0.1), machiyaMat(season === 'winter' ? 0xd9d3c5 : 0xd2c7ad)); house.position.set(0.4, 1.3, 0.6); house.castShadow = true; house.receiveShadow = true; g.add(house); g.add(addOutline(house)) // 主屋
            const hr = new THREE.Mesh(new THREE.ConeGeometry(4.0, 1.7, 4), bRoofM); hr.rotation.y = Math.PI / 4; hr.scale.set(1, 1, 0.86); hr.position.set(0.4, 3.5, 0.6); hr.castShadow = true; g.add(hr); g.add(addOutline(hr))
            for (const sgn of [1, -1]) { const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.34, 3), bWall); ridge.rotation.set(Math.PI / 2, 0, Math.PI / 2); ridge.position.set(0.4, 3.0, 0.6 + sgn * 1.7); g.add(ridge) } // 千鳥破風
            const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 6), toon(0x6a4f38)); pt.position.set(3.0, 0.7, 3.0); g.add(pt); const pf = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.0, 7), toon(season === 'autumn' ? 0x8a6a32 : season === 'winter' ? 0xb8c0c4 : 0x46603a)); pf.position.set(3.0, 2.3, 3.0); pf.castShadow = true; g.add(pf) // 庭の松
          }
        }
      }
      // ── 海の渡りの演出（帆船・島影）。退屈な海にせず、瞑想的な“渡り”に（海鳥は海鳥のループへ）。──
      {
        const mkPine = (px, py, pz, s = 1) => { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 1.9 * s, 6), toon(0x6a4f38)); tr.position.set(px, py + 0.95 * s, pz); town.add(tr)
          // 樹冠＝段重ねの円錐（単一の尖りを脱し層のある常緑樹に）。3段を1メッシュに統合＝描画コール不変。
          const tmM = new THREE.Matrix4(), pineGeos = []
          for (const [cy, cr, ch] of [[1.7, 1.5, 1.9], [2.7, 1.06, 1.6], [3.5, 0.6, 1.35]]) { const fG = new THREE.ConeGeometry(cr * s, ch * s, 7); tmM.makeTranslation(px, py + cy * s, pz); fG.applyMatrix4(tmM); pineGeos.push(fG) }
          const fGeo = BufferGeometryUtils.mergeGeometries ? (BufferGeometryUtils.mergeGeometries(pineGeos, false) || pineGeos[0]) : pineGeos[0]
          if (fGeo !== pineGeos[0]) pineGeos.forEach((g) => g.dispose())
          const fo = new THREE.Mesh(fGeo, toon(season === 'autumn' ? 0x8a7a40 : season === 'winter' ? 0x9aa6a0 : 0x4e6e44)); fo.castShadow = true; town.add(fo) }
        const addShip = (sx, sz, ry) => { // 弁才船ふうの大きな四角帆。波にゆれる（boats配列で揺らす）
          const ship = new THREE.Group(); ship.position.set(sx, SEA.level + 0.15, sz); ship.rotation.y = ry; ship.userData = { ph: R() * 6.28 }
          const hull = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.1, 1.9), toon(0x55402a)); hull.position.y = 0.15; ship.add(hull)
          const prow = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.5), toon(0x55402a)); prow.position.set(3.0, 0.4, 0); prow.rotation.z = -0.3; ship.add(prow) // 反り上がった舳先
          const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 1.6), toon(0x6a4a30)); cabin.position.set(-1.5, 0.95, 0); ship.add(cabin)
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 5.4, 6), toon(0x4a3826)); mast.position.set(0.5, 3.0, 0); ship.add(mast)
          const sail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.7, 3.5), toon(season === 'winter' ? 0xe6e2d8 : 0xe7dec8)); sail.position.set(0.5, 3.3, 0); ship.add(sail)
          town.add(ship); boats.push(ship)
        }
        addShip(180, -52, 0.5); addShip(320, -28, -0.7); addShip(460, -56, 0.25); addShip(380, -40, -0.4) // 東(江戸)への長い渡りに帆船を散らす
        addShip(150, -200, 1.7); addShip(135, -360, -1.5); addShip(150, -500, 1.6) // 北(戦国)への渡りにも帆船
        addShip(-270, -28, 0.6); addShip(-400, -44, -0.5); addShip(-510, -30, 0.3) // 西(大正)への渡りにも蒸気船/帆船
        const addIslet = (ix, iz, scl) => { // 渡りの途中の緑豊かな小島（岩＋森＋松＝道中を退屈にしない）。木が水に浮いて見えないよう、島を大きく緑を広く。
          const my = SEA.level - 0.4
          const mound = new THREE.Mesh(new THREE.ConeGeometry(7.0 * scl, 4.4 * scl, 8), toon(0x6e6a5c)); mound.position.set(ix, my + 2.1 * scl, iz); mound.castShadow = true; town.add(mound); town.add(addOutline(mound)) // 大きく＝確かに海から立ち上がる島
          const cap = new THREE.Mesh(new THREE.ConeGeometry(6.2 * scl, 2.3 * scl, 8), toon(season === 'winter' ? 0xd8dde0 : season === 'autumn' ? 0x8a7a40 : 0x4e6e3e)); cap.position.set(ix, my + 3.9 * scl, iz); town.add(cap) // 緑の頂（広め＝緑豊か＝木の土台が読める）
          const topY = my + 4.3 * scl
          for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.2832, rr = (0.3 + R() * 0.7) * 4.6 * scl; mkPine(ix + Math.cos(a) * rr, topY - rr * 0.22, iz + Math.sin(a) * rr, (0.7 + R() * 0.5) * scl) } // 森
          for (let i = 0; i < 3; i++) { const a = R() * 6.28, rk = new THREE.Mesh(new THREE.IcosahedronGeometry((0.6 + R() * 0.6) * scl, 0), toon(0x7c766a)); rk.position.set(ix + Math.cos(a) * 4.6 * scl, my + 0.5, iz + Math.sin(a) * 4.6 * scl); rk.rotation.set(R() * 3, R() * 3, R() * 3); town.add(rk) } // 岩
        }
        addIslet(180, -38, 1.4); addIslet(300, -50, 1.0); addIslet(420, -40, 1.3); addIslet(520, -52, 1.0) // 東(江戸)への島々（唯一導線を残す渡り＝退屈にしない中継）
        // 北(戦国)・西(大正)の中継の島は撤去＝導線で位置がバレないよう、海の向こうに独立させ「偶然見つける」渡りに（実機FB）。
        // 道中の小島で羽を休める鳥（飛んで近づくと一斉に舞い立つ＝旅の途中の一瞬の生気）
        const mkIslandFlock = (cx, cz) => {
          const bmat = new THREE.MeshBasicMaterial({ color: isNight ? 0x2a3a4e : 0x3a3a40, fog: true }), birds = []
          for (let i = 0; i < 9; i++) {
            const b = new THREE.Group()
            for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.26), bmat); w.position.x = s * 0.38; w.userData.side = s; b.add(w) }
            const bx = cx + (R() - 0.5) * 8, bz = cz + (R() - 0.5) * 8, by = heightAt(bx, bz) + 0.5 + R() * 3
            b.position.set(bx, by, bz); b.userData = { ph: R() * 6.28 }; town.add(b)
            birds.push({ g: b, bx, by, bz, vx: 0, vy: 0, vz: 0 })
          }
          islandFlocks.push({ birds, cx, cz, state: 'perched', t: 0 })
        }
        mkIslandFlock(300, -50) // 東(江戸)の道中の小島の鳥（戦国/大正は島を撤去したので無し）
      }
      // ── 北の海の果ての戦国の山城（時代の異なる第2の目的地。Edoとは遠く海で隔て共視界に入れない）──
      {
        const sx = SENGOKU.x, sz = SENGOKU.z, peak = senH(sx, sz)
        // 配置は全て senH(px,pz) に載せる＝うねる稜線と完全一致で何も浮かない。coneY は中央の城郭の段用（半径だけの近似＝山頂付近は平ら）。
        const coneY = (rr) => { const v = senH(sx + rr, sz); return v > -990 ? v : SEA.level }
        // ── 山本体＝heightAt(=senH)をサンプルしたカルテシアンPlaneの地面（江戸/大正と同方式）。極座標メッシュは配置位置を覆えず家/人が宙に浮いたので置換。頂点色で谷の緑→尾根の岩。──
        {
          const isz = senR * 2.9, SUB = 150, gI = new THREE.PlaneGeometry(isz, isz, SUB, SUB); gI.rotateX(-Math.PI / 2) // 細かい格子＝住民/家がsenHと一致し浮き/めり込みを根絶
          const gp = gI.attributes.position, vcol = []
          const cBase = new THREE.Color(season === 'winter' ? 0xcfd3cf : season === 'autumn' ? 0x7a6a3c : 0x57733e) // 裾の緑（はっきりした草地＝水色に見えるのを脱す）
          const cHigh = new THREE.Color(season === 'winter' ? 0xe6eaeb : 0x867f64) // 高所の岩肌/雪
          const tmpC = new THREE.Color()
          for (let i = 0; i < gp.count; i++) {
            const wx = sx + gp.getX(i), wz = sz + gp.getZ(i)
            let y = senH(wx, wz); if (y < -990) y = SEA.floor - 1.5
            gp.setY(i, y - 0.05) // heightAt(配置)と完全一致（-0.05で家の床と僅かに重ね段差を消す）
            const hT = Math.max(0, Math.min(1, (y - 11) / 24)) // 谷底〜中腹は緑、高い尾根だけ岩/雪へ
            tmpC.copy(cBase).lerp(cHigh, hT * hT)
            const sh = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(wx * 0.11 + wz * 0.08)) // 水彩のムラ
            vcol.push(tmpC.r * sh, tmpC.g * sh, tmpC.b * sh)
          }
          gI.setAttribute('color', new THREE.Float32BufferAttribute(vcol, 3)); gI.computeVertexNormals()
          const mRep = Math.max(24, Math.round(isz / 6)) // home/江戸/大正と同じ密度の細かい草目＝近接で地面がベタ塗りに見えるのを脱す（評価アート）
          const mMat = mottleMat(0xffffff, 150, 0.1, [mRep, mRep]); mMat.vertexColors = true // 戦国の地面だけ素のtoon=テクスチャ無しで近接がのっぺりしていた→他エリアと統一
          if (mMat.map) { mMat.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); mMat.map.needsUpdate = true }
          const mtn = new THREE.Mesh(gI, mMat); mtn.position.set(sx, 0, sz); mtn.receiveShadow = true; town.add(mtn)
        }
        // ── 奥の山並み（重なり合う稜線を大気遠近で淡く。城の背後＝北と両袖に不均等に。接近路の南は海を開ける）──
        { const fogC = new THREE.Color(SEN_FOGC.getHex()), rngBase = new THREE.Color(season === 'winter' ? 0xcfd4d6 : season === 'autumn' ? 0x6a6048 : 0x55664c)
          const arcs = [[-58, -86], [-22, -104], [22, -98], [58, -84], [-90, -44], [84, -40], [-82, 8], [82, 2], [-40, -122], [36, -120], [4, -150]] // [dx,dz] 北と両袖の遠山（等間隔を避ける）
          for (let k = 0; k < arcs.length; k++) { const adx = arcs[k][0], adz = arcs[k][1], dist = Math.hypot(adx, adz), far = Math.min(1, (dist - 80) / 70)
            const mx = sx + adx, mz = sz + adz, hh = 27 + R() * 16 - far * 5, rad = 24 + R() * 16
            const col = rngBase.clone().lerp(fogC, 0.4 + far * 0.36) // 遠いほど霞の色へ＝大気遠近
            const ridge = new THREE.Mesh(new THREE.ConeGeometry(rad, hh, 6, 1), toon(col.getHex())); ridge.position.set(mx, SEA.level - 2 + hh / 2, mz); ridge.rotation.y = R() * 3; ridge.scale.x = 1.5 + R() * 0.6; town.add(ridge) // 横に広げ重ねて稜線に
          }
        }
        // ── 川（谷を南北に蛇行し、南の河口で海へ注ぐ。水辺に城下町が沿う）──
        { const rmat = freshWater(new THREE.MeshBasicMaterial({ map: seaTex || wtex, color: isNight ? 0x2c3842 : 0x52666c, fog: true })), rgeos = [], rM = new THREE.Matrix4(); let prev = null // 落ち着いた深い水色＋穏やかなきらめき（谷川の水辺）
          for (let s = 0; s <= 42; s++) { const zz = sz + 36 - s * 2.5, cl = senValley(zz), px = sx + cl, gh = senH(px, zz), py = Math.max(SEA.level - 0.1, gh) - 0.04
            if (gh > 8.5) break // 谷頭で止める（川が山へ登って見えるのを防ぐ＝水源は山の中）
            const wdt = Math.max(2.2, 5.0 - Math.max(0, gh - 1) * 0.45) // 上流ほど細る（水の主張を抑え川幅を絞る）
            if (prev) { const ddx = px - prev.x, ddz = zz - prev.z, len = Math.hypot(ddx, ddz); const bg = new THREE.PlaneGeometry(wdt, len + 1.1); bg.rotateX(-Math.PI / 2); rM.makeRotationY(Math.atan2(ddx, ddz)).setPosition((px + prev.x) / 2, (py + prev.py) / 2, (zz + prev.z) / 2); bg.applyMatrix4(rM); rgeos.push(bg) }
            prev = { x: px, z: zz, py } }
          if (rgeos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(rgeos, false); if (m) { const rmesh = new THREE.Mesh(m, rmat); town.add(rmesh) } rgeos.forEach((g) => g.dispose()) }
          // ── 石垣の護岸（川の両岸に低い石積み）。水が水路に収まり「家が水の上に浮く」印象を断つ＝城下町の川辺。統合で軽量。──
          const bankMat = mottleMat(season === 'winter' ? 0x8e8f88 : 0x6f685a, 130, 0.14, [2, 1]), bgeos = [], bM = new THREE.Matrix4(), pvb = { '-1': null, '1': null }
          for (let s = 0; s <= 42; s++) { const zz = sz + 36 - s * 2.5, cl = senValley(zz), px = sx + cl, gh = senH(px, zz); if (gh > 8.5) break
            const wdt = Math.max(2.2, 5.0 - Math.max(0, gh - 1) * 0.45), wy = Math.max(SEA.level - 0.1, gh)
            for (const side of [-1, 1]) { const exx = px + side * (wdt / 2 + 0.25), ezz = zz, key = side < 0 ? '-1' : '1', pe = pvb[key]
              if (pe) { const ddx = exx - pe.x, ddz = ezz - pe.z, len = Math.hypot(ddx, ddz); if (len > 0.3 && len < 7) { const bnkH = Math.min(2.2, Math.max(0.55, senH(exx, ezz) - wy + 0.5)); const bg = new THREE.BoxGeometry(0.55, bnkH, len + 0.35); bM.makeRotationY(Math.atan2(ddx, ddz)).setPosition((exx + pe.x) / 2, wy + bnkH / 2 - 0.18, (ezz + pe.z) / 2); bg.applyMatrix4(bM); bgeos.push(bg) } }
              pvb[key] = { x: exx, z: ezz } } }
          if (bgeos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(bgeos, false); if (m) { const bmesh = new THREE.Mesh(m, bankMat); bmesh.castShadow = true; bmesh.receiveShadow = true; town.add(bmesh) } bgeos.forEach((g) => g.dispose()) }
        }
        // ── 城は中央の急峰でなく、東尾根の中腹の平場(bluff)に建つ＝「真ん中に城が奇妙」を解消。石垣の段に天守。──
        const sWall = mottleMat(season === 'winter' ? 0x6e665c : 0x4a3f30, 150, 0.16, [1.4, 1.4]), sRoof = mottleMat(season === 'winter' ? (isNight ? 0x7a828a : 0xa8b0b6) : (isNight ? 0x232730 : 0x34383f), 150, 0.12, [1.8, 1.8]) // 黒い板張りの木目＋黒瓦の濃淡（冬は雪化粧）
        const bx = sx + senBluff.dx, bz = sz + senBluff.dz, bgY = senH(bx, bz)
        for (const [cr, ch] of [[10.5, 2.6], [7, 2.4]]) { const ku = new THREE.Mesh(new THREE.CylinderGeometry(cr - 1.2, cr, ch, 7), stoneMat(season === 'winter' ? 0x9aa0a2 : 0x8a8278, 6, 2)); ku.rotation.y = 0.3; ku.position.set(bx, bgY + ch / 2 - 0.4, bz); ku.castShadow = true; ku.receiveShadow = true; town.add(ku); town.add(addOutline(ku)) } // 石垣の段（平場の土台・野面積み）
        let yb = bgY + 4.2; const st = [[5.4, 3.4], [4.2, 2.9], [3.0, 2.5]]
        for (let i = 0; i < st.length; i++) {
          const w = st[i][0], h = st[i][1], rw = (w + 1.5) * 0.72, rh = 1.85
          const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), sWall); wall.position.set(bx, yb + h / 2, bz); wall.castShadow = true; town.add(wall); town.add(addOutline(wall))
          for (const a2 of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, h * 0.34, 0.06), toon(isNight ? 0xe8b86a : 0x20242a)); win.position.set(bx + Math.sin(a2) * (w / 2 + 0.04), yb + h * 0.55, bz + Math.cos(a2) * (w / 2 + 0.04)); win.rotation.y = a2; town.add(win) }
          const roof = new THREE.Mesh(new THREE.ConeGeometry(rw, rh, 4), sRoof); roof.rotation.y = Math.PI / 4; roof.position.set(bx, yb + h + rh / 2 - 0.15, bz); roof.castShadow = true; town.add(roof); town.add(addOutline(roof))
          yb += h + rh - 0.9
        }
        for (const sgn of [-1, 1]) { const sh = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 6), toon(0xb89038)); sh.position.set(bx + sgn * 1.1, yb + 0.15, bz); sh.rotation.z = sgn * -0.3; town.add(sh) } // 鯱
        for (const [ox, oz] of [[-7.5, 5.5], [7.0, -5.0]]) { const tx = bx + ox, tz = bz + oz, ty = senH(tx, tz); if (ty < SEA.level) continue; const tur = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.8, 2.3), sWall); tur.position.set(tx, ty + 1.4, tz); tur.castShadow = true; town.add(tur); town.add(addOutline(tur)); const tr = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.3, 4), sRoof); tr.rotation.y = Math.PI / 4; tr.position.set(tx, ty + 3.4, tz); town.add(tr) } // 隅櫓×2
        for (let k = 0; k < 6; k++) { const a = k / 6 * 6.2832, r2 = 9, fx = bx + Math.cos(a) * r2, fz = bz + Math.sin(a) * r2, fy = senH(fx, fz); if (fy < SEA.level) continue; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.0, 5), toon(0x3a2e20)); pole.position.set(fx, fy + 2.0, fz); town.add(pole); const flag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.9), toon(k % 2 ? 0xa83228 : 0x2a3a6a)); flag.position.set(fx, fy + 3.2, fz + 0.45); town.add(flag) } // 旗指物（平場の縁にぐるり）
        // ── 木柵（平場の縁の乱杭）＋篝火（夜に灯る） ──
        const palMat = toon(0x4a3a28)
        for (let k = 0; k < 26; k++) { const a = k / 26 * 6.2832, px = bx + Math.cos(a) * 9.6, pz = bz + Math.sin(a) * 9.6, py = senH(px, pz); if (py < SEA.level) continue; const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.4, 4), palMat); stake.position.set(px, py + 0.65, pz); town.add(stake) } // 木柵（乱杭）
        const ec = document.createElement('canvas'); ec.width = ec.height = 32; const ecx = ec.getContext('2d'); const eg = ecx.createRadialGradient(16, 16, 1, 16, 16, 16); eg.addColorStop(0, 'rgba(255,184,96,0.95)'); eg.addColorStop(1, 'rgba(255,150,60,0)'); ecx.fillStyle = eg; ecx.fillRect(0, 0, 32, 32); const emberTex = new THREE.CanvasTexture(ec)
        const fireMat = new THREE.MeshBasicMaterial({ color: isNight ? 0xffb24a : 0xe06a2a, fog: true })
        for (let k = 0; k < 3; k++) { const a = k / 3 * 6.2832 + 0.5, r2 = 6.6, fx = bx + Math.cos(a) * r2, fz = bz + Math.sin(a) * r2, fy = senH(fx, fz); if (fy < SEA.level) continue
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 5), toon(0x3a2e20)); post.position.set(fx, fy + 0.75, fz); town.add(post)
          const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.26, 0.34, 8), toon(0x2a2620)); bowl.position.set(fx, fy + 1.55, fz); town.add(bowl)
          const fire = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 6), fireMat); fire.position.set(fx, fy + 2.0, fz); town.add(fire)
          const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: emberTex, color: 0xff8a3a, transparent: true, opacity: isNight ? 0.8 : 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glow.position.set(fx, fy + 2.0, fz); glow.scale.set(2.6, 2.6, 1); town.add(glow); litFlicker(glow.material, 0.3, 6.2) } // 篝火（炎の揺らぎ）
        // 城下（山裾に密集する侍屋敷・町家。高さ/大きさ/色を変えて作り分け、メッシュ統合で軽く）
        const samWall = samaMat(season === 'winter' ? 0xc8c2b6 : 0xab9c84), samWall2 = samaMat(season === 'winter' ? 0xdcd8ce : 0x8a7a62), samRoof = tileMat(season === 'winter' ? (isNight ? 0x7a828a : 0xa8b0b6) : (isNight ? 0x2e2a24 : 0x46402f), 3, 2, false), samRoof2 = tileMat(isNight ? 0x383229 : 0x5a4e3a, 3, 2, false) // 侍屋敷=連子窓の板壁＋黒瓦の屋根（夕夜は連子窓が灯る）
        // 商品化レベルへ：壁の色を4種に（タン/淡い/焼杉の黒板/漆喰の白蔵）＋茅葺屋根で町並みに多様性と質感を出す。
        const samWall3 = samaMat(isNight ? 0x33302c : 0x55483a), samWall4 = mottleMat(season === 'winter' ? 0xe4ded2 : (isNight ? 0xb8b2a4 : 0xd8d0bf), 130, 0.1, [1.5, 1.5]) // 焼杉の黒板／漆喰の白壁(土蔵)
        const samRoofT = mottleMat(season === 'winter' ? 0xcfc8b6 : (isNight ? 0x3e352a : 0x6e5d44), 90, 0.18, [2, 1.4]) // 茅葺(かやぶき)の屋根
        samWall3.vertexColors = true; samWall4.vertexColors = true
        // 切妻屋根の単位（ridge=X, 妻行=Z, 棟高Y 0→1）。家を「箱＋三角帽(4角錐)」でなく稜線のある家屋に＝戦国の城下町の質感。江戸のgableUnitと同手法。
        const senGableUnit = (() => {
          const g = new THREE.BufferGeometry()
          const P = { a: [-0.5, 0, -0.5], b: [0.5, 0, -0.5], c: [0.5, 0, 0.5], d: [-0.5, 0, 0.5], e: [-0.5, 1, 0], f: [0.5, 1, 0] }
          const v = [], push = (...pts) => pts.forEach((p) => v.push(p[0], p[1], p[2]))
          push(P.a, P.b, P.f); push(P.a, P.f, P.e); push(P.d, P.e, P.f); push(P.d, P.f, P.c); push(P.a, P.e, P.d); push(P.b, P.c, P.f)
          g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
          const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
          g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(uv), 2))
          g.setIndex([...Array(18).keys()]); g.computeVertexNormals(); return g
        })()
        const sgWA = [], sgWB = [], sgWC = [], sgWD = [], sgR = [], sgR2 = [], sgRT = [], sgL = [], sgM = new THREE.Matrix4()
        // 城下町＝谷底の川沿いに、街道に沿って不規則な列で家々が並ぶ（的模様の同心円を脱す）。senHに載せ谷底〜中腹のみ。
        for (let s = 0; s < 46; s++) {
          const zz = sz + 30 - s * 2.1, cl = senValley(zz) // 谷沿いに長く（列を伸ばし賑わう城下町に）
          for (const side of [-1, 1]) {
            const ranks = 3 + ((R() * 3) | 0) // 川の両側に3〜5列（密に・不揃い）
            for (let rank = 0; rank < ranks; rank++) {
              if (R() < 0.1) continue // 抜け（空き地・辻）で不規則に（減らして密に）
              const off = 4.8 + rank * 3.3 + R() * 1.1 // 道4.8/家8/裏道11/家14…の街区が組めるよう行間を詰める
              const lo = side * off // 川中心からのローカル横位置。道（街道+4.8/東裏道+11/西道-7）の回廊には建てない＝道を塞がない
              if (Math.abs(lo - 4.8) < 2.1 || Math.abs(lo - 11) < 1.6 || Math.abs(lo + 7) < 1.6) continue
              const px = sx + cl + side * off + (R() - 0.5) * 1.6, pz = zz + (R() - 0.5) * 1.8, py = senH(px, pz)
              if (py > 18 || !senInland(px, pz, 1.6)) continue // 谷底〜中腹まで（斜面も登る城下町）。汀に接する縁は除外＝水に浮く家を根絶。高い尾根や城の平場も除く
              if (Math.hypot(px - bx, pz - bz) < 11) continue // 城の平場は空ける
              const a = (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (R() - 0.5) * 0.5 // 街道に面して列の向きが揃う
              const tt = R(), two = tt < 0.2, big = tt > 0.86
              const wpick = R(), thatch = !big && R() < 0.32 // 茅葺は小〜中の家に（大店は瓦）
              const wgeoArr = wpick < 0.4 ? sgWA : wpick < 0.6 ? sgWB : wpick < 0.82 ? sgWC : sgWD // タン/淡/焼杉/漆喰の4種
              const hw = big ? 3.0 + R() * 1.2 : 2.0 + R() * 1.0, hd = big ? 2.4 + R() * 0.9 : 1.6 + R() * 0.8
              const hh = two ? 2.6 + R() * 0.9 : big ? 2.0 + R() * 0.5 : 1.3 + R() * 0.6
              sgM.makeRotationY(a).setPosition(px, py + hh / 2, pz); const bg = new RoundedBoxGeometry(hw, hh, hd, 1, Math.min(0.16, Math.min(hw, hd) * 0.07)); bakeAO(bg, hh); bg.applyMatrix4(sgM); wgeoArr.push(bg)
              colliders.push({ x: px, z: pz, cos: Math.cos(a), sin: Math.sin(a), hw: hw / 2 + 0.15, hd: hd / 2 + 0.15 }) // 歩行: 城下の家をすり抜けない（R()非消費）
              const rh = thatch ? (two ? 1.9 : 1.4) : (two ? 1.3 : 0.85) // 茅葺は厚く高い屋根
              const rg = senGableUnit.clone(); rg.scale(hw * 1.04, rh, hd * 1.24); sgM.makeRotationY(a).setPosition(px, py + hh - 0.04, pz); rg.applyMatrix4(sgM); (thatch ? sgRT : R() < 0.4 ? sgR2 : sgR).push(rg) // 切妻の屋根（稜線で家屋に＝箱＋4角錐の三角帽を脱す）。茅葺は厚く高い
              if (isNight && R() < 0.5) { sgM.makeRotationY(a).setPosition(px - side * hw * 0.45, py + hh * (two ? 0.6 : 0.45), pz); const lg = new THREE.BoxGeometry(0.5, 0.45, 0.12); lg.applyMatrix4(sgM); sgL.push(lg) }
            }
          }
        }
        const sgLit = new THREE.MeshBasicMaterial({ color: 0xf0bd72, fog: true })
        samWall.vertexColors = true; samWall2.vertexColors = true // 壁の接地AO
        for (const [geos, mat] of [[sgWA, samWall], [sgWB, samWall2], [sgWC, samWall3], [sgWD, samWall4], [sgR, samRoof], [sgR2, samRoof2], [sgRT, samRoofT], [sgL, sgLit]]) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = mat !== sgLit; mesh.receiveShadow = mat !== sgLit; town.add(mesh) } geos.forEach((g) => g.dispose()) } } // 城下の侍屋敷（壁4種＋瓦/茅葺・夜は灯り窓）
        // ── 街道沿いの提灯（紅い掛け提灯＝賑わいと夕夜の温かい灯り）。城下町の活気。 ──
        { const poleMat = toon(0x3a2e20), chouMat = toon(isNight ? 0xd2503e : 0xc23a2e), bandMat = toon(0xeae0cc)
          const lglow = isNight ? 0.85 : 0.18 + duskAmt * 0.5 // 夜は煌々と・夕はほのか
          for (let s = 2; s < 44; s += 3) { const zz = sz + 30 - s * 2.1, cl = senValley(zz), side = (s % 6 < 3) ? 1 : -1, px = sx + cl + side * 5.6, gh = senH(px, zz)
            if (gh < SEA.level + 1.4 || gh > 14 || !senInland(px, zz, 1.4)) continue
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.4, 5), poleMat); pole.position.set(px, gh + 1.2, zz); pole.castShadow = true; town.add(pole)
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 4), poleMat); arm.rotation.z = Math.PI / 2; arm.position.set(px - side * 0.3, gh + 2.3, zz); town.add(arm)
            const cho = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.46, 10), chouMat); cho.position.set(px - side * 0.6, gh + 1.95, zz); cho.castShadow = true; town.add(cho) // 提灯本体
            for (const by of [0.15, -0.15]) { const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 10), bandMat); bd.position.set(px - side * 0.6, gh + 1.95 + by, zz); town.add(bd) } // 上下の白帯
            if (lglow > 0.05) { const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: emberTex, color: 0xffb060, transparent: true, opacity: lglow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); gl.position.set(px - side * 0.6, gh + 1.95, zz); gl.scale.set(1.5, 1.5, 1); town.add(gl); litFlicker(gl.material, 0.12, 2.6) }
            if (lglow > 0.12) lightPool(px - side * 0.6, gh, zz, 1.3, lglow * 0.5) // 足元の灯りだまり
          }
        }
        // ── 街道沿いの床店（市の屋台）＋犬猫＝降り立った時に出会う城下の賑わい。──
        { const senGoods = [0xc8702e, 0x7a8a3a, 0x9a5a3a, 0xb8a050, 0x6a7a8a, 0xa84838] // 野菜/魚/陶器/俵/反物
          for (let s = 5; s < 40; s += 5) { const zz = sz + 30 - s * 2.1, cl = senValley(zz), side = (s % 10 < 5) ? 1 : -1, px = sx + cl + side * 7.2, gh = senH(px, zz)
            if (gh < SEA.level + 1.4 || gh > 13 || !senInland(px, zz, 1.4)) continue
            makeStall(px, gh, zz, side > 0 ? -Math.PI / 2 : Math.PI / 2, { roof: R() < 0.5 ? 'reed' : 'cloth', roofCol: R() < 0.5 ? 0xa84838 : 0x4a5a3a, goods: senGoods, noren: R() < 0.5 ? 0x3a4a6a : 0x6a3a30 })
          }
          // 城下の犬猫（街道をうろつく）
          for (let k = 0; k < 3; k++) { const zz = sz + 24 - k * 8 - R() * 4, cl = senValley(zz), px = sx + cl + (R() < 0.5 ? 6 : -6) + (R() - 0.5) * 2, gh = senH(px, zz)
            if (gh < SEA.level + 1.4 || !senInland(px, zz, 1.4)) continue
            mkQuad(px, gh, zz, R() * 6.28, k === 0 ? 0xc8b89a : 0x6a5a48, 0.62 + R() * 0.12, k === 0 ? 'dog' : 'cat') }
          // 店先の積み荷（俵/樽）
          for (let s = 7; s < 38; s += 8) { const zz = sz + 30 - s * 2.1, cl = senValley(zz), side = (s % 16 < 8) ? 1 : -1, px = sx + cl + side * 7.6, gh = senH(px, zz)
            if (gh < SEA.level + 1.4 || gh > 13 || !senInland(px, zz, 1.4)) continue
            makeCargo(px, gh, zz, R() * 6.28) }
        }
        // ── 棚田（斜面の段々の水田）＝山城の城下の象徴。裸の斜面を耕地で埋め「散歩したくなる」山里に。季節で青田/黄金/雪。統合で軽量。──
        { const paddyCol = season === 'winter' ? 0xe2e6e8 : season === 'autumn' ? 0xc6a64e : season === 'spring' ? 0x8caa62 : 0x6f9a60
          const paddyMat = new THREE.MeshToonMaterial({ color: paddyCol, gradientMap: grad, fog: true }), azeMat = toon(season === 'winter' ? 0xaeb2aa : 0x6a5f48)
          const paddyGeos = [], azeGeos = [], pM = new THREE.Matrix4()
          for (let gx = -52; gx <= 52; gx += 3.8) for (let gz = -52; gz <= 52; gz += 3.8) {
            const px = sx + gx + (R() - 0.5) * 1.3, pz = sz + gz + (R() - 0.5) * 1.3, py = senH(px, pz)
            if (py > 15 || !senInland(px, pz, 1.6)) continue // 下〜中腹の斜面のみ（汀の縁は除外＝水に浮く田を根絶。高い尾根は森/岩のまま）
            const cl = senValley(pz); if (Math.abs(px - sx - cl) < 7.5) continue // 谷底の川/街道は空ける
            if (Math.hypot(px - bx, pz - bz) < 16) continue // 城の平場は空ける
            if (R() < 0.28) continue // 不揃いに（家や辻の隙間）
            const fw = 3.0 + R() * 1.3
            const fg = new THREE.BoxGeometry(fw, 0.12, fw); pM.makeTranslation(px, py + 0.05, pz); fg.applyMatrix4(pM); paddyGeos.push(fg) // 水を張った田の段（水平）
            const ag = new THREE.BoxGeometry(fw + 0.25, 0.55, 0.28); pM.makeTranslation(px, py - 0.16, pz + fw / 2); ag.applyMatrix4(pM); azeGeos.push(ag) // 畦（下側の段差の擁壁）
          }
          if (BufferGeometryUtils.mergeGeometries) {
            const pm = paddyGeos.length && BufferGeometryUtils.mergeGeometries(paddyGeos, false); if (pm) { const mesh = new THREE.Mesh(pm, paddyMat); mesh.receiveShadow = true; town.add(mesh) } paddyGeos.forEach((g) => g.dispose())
            const am = azeGeos.length && BufferGeometryUtils.mergeGeometries(azeGeos, false); if (am) { const mesh = new THREE.Mesh(am, azeMat); mesh.receiveShadow = true; mesh.castShadow = true; town.add(mesh) } azeGeos.forEach((g) => g.dispose())
          }
        }
        // ── 街道（谷底の川の東岸に沿う道）＋城の平場へ登る坂道。senHに沿わせ統合で軽量。 ──
        { const mtRoadMat = mottleMat(season === 'winter' ? 0xc2c6c2 : 0x6e6450, 100, 0.18, [2, 4]), roadGeos = [], rM = new THREE.Matrix4(), rMx = new THREE.Matrix4(); let prev = null // 土の路面（石/轍のムラ＝歩く道の質感）
          for (let s = 0; s <= 40; s++) { const zz = sz + 32 - s * 2.2, cl = senValley(zz), px = sx + cl + 4.8, gh = senH(px, zz), py = gh + 0.08 // 川の東岸の街道
            if (gh < SEA.level + 1.2 || gh > 15) { prev = null; continue } // 水際/海の上には道を敷かない（地面の高さに沿わせる）
            if (prev) { const ddx = px - prev.x, ddz = zz - prev.z, len = Math.hypot(ddx, ddz); if (len > 0.3 && len < 6) { const bg = new THREE.BoxGeometry(2.6, 0.16, len + 0.6); rMx.makeRotationX(-Math.atan2(py - prev.py, len)).premultiply(rM.makeRotationY(Math.atan2(ddx, ddz))); rMx.setPosition((px + prev.x) / 2, (py + prev.py) / 2, (zz + prev.z) / 2); bg.applyMatrix4(rMx); roadGeos.push(bg) } } // 両端の高さで傾ける＝坂で端が浮かない（segAlleyと同じ作法）
            prev = { x: px, z: zz, py } }
          // ── 城下の裏道（街道に並行する裏路地）＋横道（街道から裏へ）＝谷あいの城下の路地 ──
          const lane = (offset, w) => { let pv = null; for (let s = 0; s <= 40; s++) { const zz = sz + 32 - s * 2.2, cl = senValley(zz), px = sx + cl + offset, gh = senH(px, zz), py = gh + 0.07; if (gh < SEA.level + 1.2 || py > 15) { pv = null; continue } if (pv) { const ddx = px - pv.x, ddz = zz - pv.z, len = Math.hypot(ddx, ddz); if (len > 0.3) { const bg = new THREE.BoxGeometry(w, 0.14, len + 0.5); rMx.makeRotationX(-Math.atan2(py - pv.py, len)).premultiply(rM.makeRotationY(Math.atan2(ddx, ddz))); rMx.setPosition((px + pv.x) / 2, (py + pv.py) / 2, (zz + pv.z) / 2); bg.applyMatrix4(rMx); roadGeos.push(bg) } } pv = { x: px, z: zz, py } } }
          lane(11, 1.7); lane(-7, 1.7) // 東の裏道・西岸の道
          for (let s = 4; s <= 34; s += 6) { const zz = sz + 32 - s * 2.2, cl = senValley(zz), x0 = sx + cl + 4, x1 = sx + cl + 12, y = senH((x0 + x1) / 2, zz); if (y < SEA.level + 1.2) continue; const y0 = senH(x0, zz), y1 = senH(x1, zz), bg = new THREE.BoxGeometry(8.4, 0.14, 1.6); const m4 = new THREE.Matrix4().makeRotationZ(Math.atan2(y1 - y0, 8.4)); m4.setPosition((x0 + x1) / 2, (y0 + y1) / 2 + 0.02, zz); bg.applyMatrix4(m4); roadGeos.push(bg) } // 横道（街道→東の裏道）。両端の高さで傾け、天面を街道(+0.16)/裏道(+0.14)より低く＝交差の重ね置きZファイトを断つ
          prev = null // 街道から城の平場へ登る坂道
          const r0x = sx + senValley(bz + 12) + 4.8, r0z = bz + 12
          for (let s = 0; s <= 14; s++) { const f = s / 14, px = r0x + (bx - r0x) * f, pz = r0z + (bz + 9 - r0z) * f, py = senH(px, pz) + 0.12
            if (prev) { const ddx = px - prev.x, ddz = pz - prev.z, len = Math.hypot(ddx, ddz); if (len > 0.3) { const bg = new THREE.BoxGeometry(2.0, 0.16, len + 0.5); rMx.makeRotationX(-Math.atan2(py - prev.py, len)).premultiply(rM.makeRotationY(Math.atan2(ddx, ddz))); rMx.setPosition((px + prev.x) / 2, (py + prev.py) / 2, (pz + prev.z) / 2); bg.applyMatrix4(rMx); roadGeos.push(bg) } } // 城への坂道＝勾配が最も急な道。傾けて連ねる＝階段状の浮きを断つ
            prev = { x: px, z: pz, py } }
          if (roadGeos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(roadGeos, false); if (m) { const rmesh = new THREE.Mesh(m, mtRoadMat); rmesh.receiveShadow = true; town.add(rmesh) } roadGeos.forEach((g) => g.dispose()) }
        }
        // ── 街道沿いの松明（夕/夜に灯り、谷あいの城下に火の灯りが連なる）。江戸の参道提灯に対応する戦国の夜の灯り。 ──
        if (isNight || duskAmt > 0.18) { const torchFire = new THREE.MeshBasicMaterial({ color: isNight ? 0xffae4a : 0xe07a2a, fog: true }), tPoleMat = toon(0x3a2e20)
          for (let s = 2; s <= 38; s += 3) { const zz = sz + 32 - s * 2.2, cl = senValley(zz), px = sx + cl + 7.0, py = senH(px, zz)
            if (py < SEA.level + 0.6 || py > 14) continue
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.0, 4), tPoleMat); pole.position.set(px, py + 1.0, zz); town.add(pole)
            const fire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 6), torchFire); fire.position.set(px, py + 2.2, zz); town.add(fire)
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: emberTex, color: 0xff8a3a, transparent: true, opacity: isNight ? 0.6 : 0.26, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glow.position.set(px, py + 2.2, zz); glow.scale.set(1.8, 1.8, 1); town.add(glow); litFlicker(glow.material, 0.28, 7.4) // 松明（炎の揺らぎ）
          }
        }
        // ── 城下の市の幟旗（戦国の街道に色とりどりの幟が連なる＝市の賑わい・木立の上に覗いて城下の目印に）。決定的配置(R()非消費)＋色ごとに統合で軽量。──
        { const poleG = [], clothByCol = [[], [], []], pM = new THREE.Matrix4(), clothCols = [0xb03a30, 0x3a5a8a, 0xd8cabe] // 朱・藍・生成り
          let bi = 0
          for (let s = 4; s <= 36; s += 4) { const zz = sz + 30 - s * 2.2, cl = senValley(zz), px = sx + cl + 6.4, py = senH(px, zz)
            if (py < SEA.level + 0.8 || py > 13) continue
            const pole = new THREE.CylinderGeometry(0.05, 0.06, 3.6, 4); pM.makeTranslation(px, py + 1.8, zz); pole.applyMatrix4(pM); poleG.push(pole)
            const cloth = new THREE.BoxGeometry(0.04, 2.2, 0.5); pM.makeTranslation(px - 0.3, py + 2.7, zz); cloth.applyMatrix4(pM); clothByCol[bi % 3].push(cloth) // 幟の布（縦長）
            colliders.push({ x: px, z: zz, r: 0.4 }); bi++
          }
          if (BufferGeometryUtils.mergeGeometries) {
            if (poleG.length) { const m = BufferGeometryUtils.mergeGeometries(poleG, false); if (m) { const me = new THREE.Mesh(m, toon(0x4a3a28)); me.castShadow = true; town.add(me) } poleG.forEach((g) => g.dispose()) }
            clothByCol.forEach((arr, ci) => { if (arr.length) { const m = BufferGeometryUtils.mergeGeometries(arr, false); if (m) { const me = new THREE.Mesh(m, toon(clothCols[ci])); me.castShadow = true; town.add(me) } arr.forEach((g) => g.dispose()) } })
          }
        }
        // ── 棚田（西の尾根の谷側斜面に、等高線に沿って段々に連なる水田）。段に高さをスナップして水平な田を連ね、
        //    谷側に石の畦(擁壁)を立てる＝バラけた板でなく「階段状に揃う棚田」。夏春は水鏡、秋は刈田、冬は雪。統合で軽量。 ──
        { const isWaterSeason = season === 'summer' || season === 'spring'
          // freshWaterで空を映すフレネル反射を載せる＝不透明なベタ青の板("青三角")を脱し、homeの棚田と同じ空を映す水鏡に（評価アート①-c）。
          const padWaterMat = freshWater(new THREE.MeshBasicMaterial({ map: wtex, color: isNight ? 0x35505e : (season === 'spring' ? 0xa6c4c4 : 0x8ab0b4), fog: true })) // 水鏡（空を映す水田）
          const padGreenMat = toon(season === 'autumn' ? 0xbfa850 : season === 'winter' ? 0xdfe4e6 : 0x6f9450) // 青田/刈田/雪田
          const wallM = toon(season === 'winter' ? 0xc6c8c2 : 0x6f6552)
          const padWG = [], padGG = [], wallG = [], pM = new THREE.Matrix4()
          for (let gz = -18; gz <= 26; gz += 5.0) for (let gx = -54; gx <= -20; gx += 5.8) {
            const px = sx + gx + (R() - 0.5) * 1.0, pz = sz + gz + (R() - 0.5) * 1.0, raw = senH(px, pz)
            if (raw < SEA.level + 1.2 || raw > 20) continue // 斜面の中腹まで段々に（尾根のてっぺんは森のまま）
            const vd = Math.abs((px - sx) - senValley(pz)); if (vd < 8) continue // 谷底の川/町は避ける
            const level = Math.floor(raw / 1.4) * 1.4 + 0.6 // 段に高さをスナップ＝水平な田の面（隣接する同高の田が帯に揃う）
            const water = isWaterSeason && R() < 0.66 // 夏春は水鏡主体（時々青田）
            const pad = new THREE.BoxGeometry(6.2, 0.26, 5.4); pM.makeRotationY((R() - 0.5) * 0.16).setPosition(px, level + 0.13, pz); pad.applyMatrix4(pM); (water ? padWG : padGG).push(pad)
            const wh = Math.max(0.5, raw - level + 1.0); const wl = new THREE.BoxGeometry(6.4, wh, 0.55); pM.makeRotationY((R() - 0.5) * 0.16).setPosition(px + 3.0, level - wh / 2 + 0.26, pz); wl.applyMatrix4(pM); wallG.push(wl) // 谷側(+x)の石の畦
          }
          for (const [geos, mat, sh] of [[padWG, padWaterMat, false], [padGG, padGreenMat, true], [wallG, wallM, true]]) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.receiveShadow = true; mesh.castShadow = sh; town.add(mesh) } geos.forEach((g) => g.dispose()) } }
        }
        // ── 鳥居の参道（南の河口から谷を遡って城へ向かう朱の鳥居） ──
        { const toriiM = toon(0xb5432f)
          for (let s = 0; s < 5; s++) { const zz = sz + 26 - s * 8, cl = senValley(zz), px = sx + cl + 4.8, py = senH(px, zz)
            if (py < SEA.level + 1.2) continue // 水際/海の上には鳥居を建てない
            for (const sgn of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.0, 6), toriiM); post.position.set(px + sgn * 1.5, py + 1.5, zz); town.add(post) }
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.34, 0.3), toriiM); lintel.position.set(px, py + 3.05, zz); town.add(lintel)
            const lintel2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 0.24), toriiM); lintel2.position.set(px, py + 2.55, zz); town.add(lintel2) }
        }
        // ── 森（尾根筋の杉木立。城を囲む深い緑＝殺風景を脱す）。背の高い杉を尾根に散らす ──
        { const cedarF = season === 'winter' ? 0x6f7a72 : season === 'autumn' ? 0x4d5a3a : 0x35522f, trunkM = toon(0x46382a), folM = toon(cedarF)
          const trunkGeos = [], coneGeos = [], cedarShadow = [], nM = new THREE.Matrix4() // 杉54本を1本ごとのメッシュ(108ドローコール)から統合(2)へ＝重さの大幅削減＋段重ねで質も上げる
          for (let k = 0; k < 54; k++) { const a = R() * 6.2832, rr = 14 + R() * 60, px = sx + Math.cos(a) * rr, pz = sz + Math.sin(a) * rr, py = senH(px, pz)
            if (py < SEA.level + 2.5 || py > 30) continue // 海・谷底の町は避け、斜面〜尾根に森
            if (Math.hypot(px - bx, pz - bz) < 12) continue // 城の平場は空ける
            const vd = Math.abs((px - sx) - senValley(pz)); if (vd < 9 && py < 11) continue // 谷底の町並みは避ける
            const s = 0.85 + R() * 0.5; if (rectAt(px, pz)) { buriedEraTrees++; continue } // 城下の家の中には生やさない（R()消費済み＝配置不変）
            const trG = new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 1.5 * s, 5); nM.makeTranslation(px, py + 0.7 * s, pz); trG.applyMatrix4(nM); trunkGeos.push(trG)
            for (const [cy, cr, ch] of [[2.0, 1.55, 2.5], [3.4, 1.12, 2.1], [4.7, 0.68, 1.8]]) { const fG = new THREE.ConeGeometry(cr * s, ch * s, 6); nM.makeTranslation(px, py + cy * s, pz); fG.applyMatrix4(nM); coneGeos.push(fG) } cedarShadow.push([px, py, pz, 1.3 * s]) } // 段重ねの杉（単一の尖りを脱し背の高い常緑樹に）
          for (const [geos, mat] of [[trunkGeos, trunkM], [coneGeos, folM]]) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = true; mesh.receiveShadow = true; town.add(mesh) } geos.forEach((g) => g.dispose()) } }
          addContactShadows(cedarShadow) // 尾根の杉の足元に接地影＝斜面に浮く杉を地に着ける
        }
        // ── 山寺（西の尾根の中腹に佇む寺＝エリアの新たな見どころ）。山門→石段→本堂(入母屋)＋多宝塔＋鐘楼、杉木立に抱かれる。 ──
        { const tX = sx - 41, tZ = sz - 8, tY = senH(tX, tZ)
          if (tY > SEA.level + 2) {
            const tWall2 = toon(season === 'winter' ? 0xe2ddd0 : 0xd6cbb6), tRoof2 = toon(season === 'winter' ? (isNight ? 0x6e7782 : 0x9aa3ab) : (isNight ? 0x2e3038 : 0x3e4650)), tWood = toon(0x6a4a32)
            // 本堂（入母屋の大屋根）
            const hall = new THREE.Mesh(new RoundedBoxGeometry(8, 3.4, 6, 1, 0.1), tWall2); hall.position.set(tX, tY + 1.7, tZ); hall.castShadow = true; hall.receiveShadow = true; town.add(hall); town.add(addOutline(hall))
            const hroof = new THREE.Mesh(new THREE.ConeGeometry(6.7, 2.4, 4), tRoof2); hroof.rotation.y = Math.PI / 4; hroof.scale.set(1, 1, 0.78); hroof.position.set(tX, tY + 4.6, tZ); hroof.castShadow = true; town.add(hroof); town.add(addOutline(hroof))
            for (const sgn of [-1, 1]) { const chidori = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.4, 3), tWall2); chidori.rotation.set(Math.PI / 2, 0, Math.PI / 2); chidori.position.set(tX, tY + 3.9, tZ + sgn * 2.4); town.add(chidori) } // 千鳥破風
            // 多宝塔（二層の塔＝山寺の象徴）
            { const pX = tX - 8, pZ = tZ + 4, pY = senH(pX, pZ)
              const base = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.6, 3.0), tWall2); base.position.set(pX, pY + 1.3, pZ); base.castShadow = true; town.add(base); town.add(addOutline(base))
              const r1 = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.2, 4), tRoof2); r1.rotation.y = Math.PI / 4; r1.position.set(pX, pY + 3.1, pZ); town.add(r1); town.add(addOutline(r1))
              const dome = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), tWall2); dome.position.set(pX, pY + 3.5, pZ); town.add(dome)
              const r2 = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.4, 4), tRoof2); r2.rotation.y = Math.PI / 4; r2.position.set(pX, pY + 4.7, pZ); town.add(r2); town.add(addOutline(r2))
              const sorin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), toon(0xc8a23c)); sorin.position.set(pX, pY + 6.1, pZ); town.add(sorin) } // 相輪
            // 鐘楼（袴腰の鐘つき堂）
            { const bX = tX + 7, bZ = tZ + 3, bY = senH(bX, bZ)
              for (const [ox, oz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 2.6, 6), tWood); post.position.set(bX + ox, bY + 1.3, bZ + oz); town.add(post) }
              const broof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.5, 4), tRoof2); broof.rotation.y = Math.PI / 4; broof.position.set(bX, bY + 3.3, bZ); broof.castShadow = true; town.add(broof); town.add(addOutline(broof))
              const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 1.2, 8), toon(0x6a6258)); bell.position.set(bX, bY + 1.9, bZ); town.add(bell) }
            // 山門（参道の入口の門）＋石段（谷へ下る）
            { const gX = tX + 2, gZ = tZ + 11, gY = senH(gX, gZ)
              for (const sgn of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3.2, 6), tWood); post.position.set(gX + sgn * 1.8, gY + 1.6, gZ); town.add(post); town.add(addOutline(post)) }
              const gmon = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), tRoof2); gmon.rotation.y = Math.PI / 4; gmon.scale.set(1, 1, 0.6); gmon.position.set(gX, gY + 3.7, gZ); gmon.castShadow = true; town.add(gmon); town.add(addOutline(gmon)) }
            { const stoneM = toon(season === 'winter' ? 0xc4c8c2 : 0x9a948a); let prev = null // 山門→谷の街道へ下る石段
              const s0x = tX + 2, s0z = tZ + 12 // 山門の下から
              for (let s = 0; s <= 18; s++) { const f = s / 18, pz = s0z + 20 * f, tgX = sx + senValley(pz) + 6, px = s0x + (tgX - s0x) * f, py = senH(px, pz) + 0.1
                if (prev) { const ddx = px - prev.x, ddz = pz - prev.z, len = Math.hypot(ddx, ddz); if (len > 0.3) { const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, len + 0.5), stoneM); step.position.set((px + prev.x) / 2, (py + prev.y) / 2, (pz + prev.z) / 2); step.rotation.y = Math.atan2(ddx, ddz); town.add(step) } }
                prev = { x: px, y: py, z: pz } } }
            // 杉に囲む（寺の周りに濃い杉木立）
            { const folM2 = toon(season === 'winter' ? 0x6f7a72 : 0x33502d), trunkM2 = toon(0x46382a), tG2 = [], cG2 = [], nM2 = new THREE.Matrix4() // 寺の杉12本も統合(24→2ドローコール)＋段重ね
              for (let k = 0; k < 12; k++) { const a = k / 12 * 6.2832, rr = 9 + R() * 4, px = tX + Math.cos(a) * rr, pz = tZ + Math.sin(a) * rr, py = senH(px, pz); if (!senInland(px, pz, 1.6)) continue; const s = 1.0 + R() * 0.4; const trG = new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 1.5 * s, 5); nM2.makeTranslation(px, py + 0.7 * s, pz); trG.applyMatrix4(nM2); tG2.push(trG)
                for (const [cy, cr, ch] of [[1.9, 1.45, 2.4], [3.3, 1.05, 2.0], [4.5, 0.62, 1.7]]) { const fG = new THREE.ConeGeometry(cr * s, ch * s, 6); nM2.makeTranslation(px, py + cy * s, pz); fG.applyMatrix4(nM2); cG2.push(fG) } }
              for (const [geos, mat] of [[tG2, trunkM2], [cG2, folM2]]) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = true; town.add(mesh) } geos.forEach((g) => g.dispose()) } } }
          }
        }
        // ── 谷の霧（低くたなびく霞の帯＝「霧の谷あい」のエモさ）。柔らかな billboard を谷底に数枚。 ──
        { const mc = document.createElement('canvas'); mc.width = mc.height = 64; const mx = mc.getContext('2d'); const mg2 = mx.createRadialGradient(32, 32, 2, 32, 32, 32); mg2.addColorStop(0, 'rgba(255,255,255,0.55)'); mg2.addColorStop(0.6, 'rgba(248,250,252,0.28)'); mg2.addColorStop(1, 'rgba(248,250,252,0)'); mx.fillStyle = mg2; mx.fillRect(0, 0, 64, 64); const mistTex = new THREE.CanvasTexture(mc)
          const mistCol = isNight ? 0x9aa4b2 : season === 'autumn' ? 0xe6dccb : 0xeef2f4
          for (let s = 0; s < 6; s++) { const zz = sz + 24 - s * 8.5, cl = senValley(zz), px = sx + cl + (R() - 0.5) * 16, py = Math.max(SEA.level + 1, senH(px, zz)) + 0.6 + R() * 1.0
            const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: mistCol, transparent: true, opacity: 0.11 + R() * 0.08, depthWrite: false, fog: true })); m.position.set(px, py, zz); m.scale.set(20 + R() * 9, 5 + R() * 2.5, 1); town.add(m); senMist.push(m) } // 谷底にひくく漂う川霧（家を覆い隠さず＝俯瞰でも washy にならない）
        }
        { const sgKim = [0x6a5a3e, 0x4a4038, 0x7a4030, 0x40506a, 0x55603a, 0x5a5a5e] // 戦国の城下の人々（陣笠・素朴な色）
          for (let k = 0; k < 5; k++) { const zz = sz + 26 - R() * 52, cl = senValley(zz), px = sx + cl + (R() - 0.5) * 18, pz = zz + (R() - 0.5) * 3, py = senH(px, pz); if (py > 13 || !senInland(px, pz)) continue; mkCrowdPerson(px, py, pz, sgKim[k % sgKim.length], 0.66) } // 人らしい体に（こけし人形を脱す）。遠景の人は少なめ（作り込んだ住人placeEraを増やした）
          for (let j = 0; j < 10; j++) { const z0 = sz + 20 - j * 4.4, cl = senValley(z0); if (senH(sx + cl + 4.8, z0) < SEA.level + 1.2) continue // 街道が陸地の所だけに旅人を置く（水際/海の上を歩かせない）
            const wg = mkWalkerFig(sx + cl + 4.8, senH(sx + cl + 4.8, z0), z0, sgKim[j % sgKim.length], 0.66) // 脚が振れる旅人（歩みで脚を交互に運ぶ＝滑る蝋人形を脱す）
            // 旅人は地面の高さに沿って歩く。水際に踏み込む手前(senH<SEA.level+1)で折り返す＝海の上を歩かない。
            cityWalkers.push({ g: wg, road: true, x0: sx + cl + 4.8, z0, len: 8 + R() * 6, sp: 0.05 + R() * 0.04, ph: R() * 2, fn: (u) => { const zz = z0 - u, c2 = senValley(zz), xx = sx + c2 + 4.8, gh = senH(xx, zz); if (gh < SEA.level + 1) { const c3 = senValley(z0), x3 = sx + c3 + 4.8; return { x: x3, y: senH(x3, z0), z: z0 } } return { x: xx, y: gh, z: zz } } }) } // 街道を行き交う旅人
          const sgmei = ['酒', '鍛冶', '旅籠', '飯', '馬', '薬'] // 城下の店（質素な木の掛看板）
          for (let k = 0; k < 6; k++) { const zz = sz + 20 - k * 6, cl = senValley(zz), side = k % 2 ? 1 : -1, px = sx + cl + side * 6.5, pz = zz + (R() - 0.5) * 2, py = senH(px, pz); if (py > 12 || !senInland(px, pz)) continue; mkSignV(px, py + 1.1, pz, side > 0 ? -Math.PI / 2 : Math.PI / 2, sgmei[k], 0xcfc3a8, 0x2e2418) } } // 城下の店の看板
        { const folC = season === 'spring' ? 0xeeb6cc : season === 'autumn' ? 0xcf7034 : season === 'winter' ? 0xdfe4e7 : 0x5c7e48
          for (let k = 0; k < 9; k++) { const zz = sz + 20 - R() * 40, cl = senValley(zz), px = sx + cl + (R() - 0.5) * 22, pz = zz + (R() - 0.5) * 4, py = senH(px, pz); if (py > 12 || !senInland(px, pz, 1.6)) continue; const s = 0.8 + R() * 0.3; const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.22 * s, 1.4 * s, 5), toon(0x6a4f38)); tr.position.set(px, py + 0.7 * s, pz); town.add(tr); const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 * s, 1), toon(folC)); fo.position.set(px, py + 1.9 * s, pz); fo.castShadow = true; town.add(fo) } } // 四季の木立（桜/紅葉/雪/緑）
      }
      // ── 西の海の向こうの大正の港町（赤レンガ倉庫・時計塔・看板建築・桟橋・蒸気船・ガス灯）。海を渡るとやがて霞から現れる ──
      {
        const tx = TAISHO.x, tz = TAISHO.z, gy = heightAt(tx, tz)
        { const isz = 300, gI = new THREE.PlaneGeometry(isz, isz, 88, 88); gI.rotateX(-Math.PI / 2); const pos = gI.attributes.position // 島を南北へ伸ばしたので地面メッシュを拡大（不定形の島全体を覆う）
          for (let i = 0; i < pos.count; i++) { const lx = pos.getX(i), lz = pos.getZ(i); pos.setY(i, heightAt(tx + lx, tz + lz) - gy) }
          gI.computeVertexNormals()
          // 頂点色で土／苔草／斜面の地肌のムラ＝のっぺりした石土を脱す（港町なので緑控えめ・石土寄り）。
          const snowT = season === 'winter'
          bakeGroundVColors(gI, tx, tz,
            snowT ? 0xcfd0ca : season === 'autumn' ? 0x90884e : 0x86905a, // 苔/草地
            snowT ? 0xc9c8c2 : 0x9c948a, // 石土
            snowT ? 0xc2c2bc : 0x8a7e68, 0.72) // 斜面の地肌
          if (season !== 'winter') beachTint(gI, gy) // 汀の砂浜（冬は雪の渚なので除外）
          const tm = mottleMat(0xffffff, 150, 0.1, [46, 46]); tm.vertexColors = true // 反復を上げ近接で地面の細部（過拡大の平滑を脱す）
          if (tm.map) { tm.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); tm.map.needsUpdate = true }
          const gmesh = new THREE.Mesh(gI, tm); gmesh.position.set(tx, gy, tz); gmesh.receiveShadow = true; town.add(gmesh) } // 港町の島の地面（石畳/土）
        // ── 運河（港から内陸へ引かれた石積みの水路＋石橋）＝大正の港町の水辺 ──
        { const cz0 = tz + 17, stone = mottleMat(0x9a948a, 150, 0.12, [2, 1])
          // 運河の水面＝空を映す水鏡(MeshToon＋空グラデ＋朝日の照り返し＋さざ波)。フラットなMeshBasicの「紙」を脱す（評価指摘）。
          const ccv = document.createElement('canvas'); ccv.width = ccv.height = 64; const ccx = ccv.getContext('2d')
          const cgr = ccx.createLinearGradient(0, 0, 0, 64); cgr.addColorStop(0, '#' + new THREE.Color(0x6e9ec0).lerp(skyTop, 0.3).getHexString()); cgr.addColorStop(1, '#' + new THREE.Color(0x4a6e8a).lerp(skyHorizon, 0.16).getHexString())
          ccx.fillStyle = cgr; ccx.fillRect(0, 0, 64, 64)
          const csg = ccx.createLinearGradient(20, 64, 44, 0); csg.addColorStop(0, 'rgba(255,255,255,0)'); csg.addColorStop(0.5, '#' + sunCol.clone().lerp(new THREE.Color(0xffffff), 0.2).getHexString()); csg.addColorStop(1, 'rgba(255,255,255,0)'); ccx.globalAlpha = 0.34; ccx.fillStyle = csg; ccx.fillRect(0, 0, 64, 64); ccx.globalAlpha = 1
          for (let i = 0; i < 36; i++) { ccx.fillStyle = `rgba(255,255,255,${0.05 + R() * 0.06})`; ccx.fillRect(R() * 64, R() * 64, 1 + R() * 2, 1) }
          const canalTex = new THREE.CanvasTexture(ccv); canalTex.wrapS = canalTex.wrapT = THREE.RepeatWrapping
          const cwmat = freshWater(new THREE.MeshToonMaterial({ map: canalTex, gradientMap: grad, color: isNight ? 0x5e6f7e : 0xaccad8, fog: true })) // 青みを残す＋穏やかなきらめき（運河の水辺で映える）
          for (let cx0 = -TAISHO.r + 8; cx0 <= 28; cx0 += 5) { const px = tx + cx0, cy = heightAt(px, cz0)
            const w = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 6.4), cwmat); w.rotation.x = -Math.PI / 2; w.position.set(px, cy + 0.28, cz0); town.add(w) // 水面（広い水路＝俯瞰に水の青と反射を、地上に水辺の散歩を）
            for (const side of [-1, 1]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.2, 0.7), stone); wall.position.set(px, cy + 1.0, cz0 + 3.6 * side); wall.castShadow = true; town.add(wall) } } // 石積みの護岸
          { const bx = tx + 4, bbank = heightAt(bx, cz0 + 5.6); const br = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 9.4), stone); br.position.set(bx, bbank + 0.5, cz0); br.castShadow = true; town.add(br); town.add(addOutline(br))
            for (const rl of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 9.4), toon(0x6a6258)); rail.position.set(bx + 1.2 * rl, bbank + 1.0, cz0); town.add(rail) } } // 石橋＋欄干（広い水路に合わせて長く）
          if (season === 'summer') { // 運河沿いの紫陽花（夏・水辺の彩り）。決定的配置＋色ごとに統合で軽量。
            const ajiCols = [0x6f8ad0, 0x9a7ec8, 0xc77aa8, 0x7ab0c0], bk = ajiCols.map(() => []), lf2 = [], aM = new THREE.Matrix4()
            for (let cxa = -18; cxa <= 24; cxa += 7) { for (const sd of [-1, 1]) { const fx = tx + cxa, fz = cz0 + 4.4 * sd, fy = heightAt(fx, fz); if (fy < SEA.level + 0.8) continue // 護岸の外側・陸の上のみ
              const lg = new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(); lg.scale(1.25, 0.5, 1.25); aM.makeTranslation(fx, fy + 0.18, fz); lg.applyMatrix4(aM); lf2.push(lg) // 葉
              const ci = ((cxa | 0) + (sd > 0 ? 1 : 0)) & 3
              for (const [ox, oy, oz, s] of [[0, 0.5, 0, 0.32], [-0.26, 0.42, 0.1, 0.22], [0.24, 0.44, -0.1, 0.23]]) { const h = new THREE.IcosahedronGeometry(s, 1); aM.makeTranslation(fx + ox, fy + oy, fz + oz); h.applyMatrix4(aM); bk[(ci + (ox < 0 ? 1 : 0)) & 3].push(h) } // 花房
            } }
            if (BufferGeometryUtils.mergeGeometries) { const lm = lf2.length && BufferGeometryUtils.mergeGeometries(lf2, false); if (lm) { const me = new THREE.Mesh(lm, toon(0x4e6e3a)); me.castShadow = true; town.add(me) } bk.forEach((b2, i) => { if (b2.length) { const m = BufferGeometryUtils.mergeGeometries(b2, false); if (m) { const me2 = new THREE.Mesh(m, toon(ajiCols[i])); me2.castShadow = true; town.add(me2) } } }); lf2.concat(...bk).forEach((g) => g.dispose()) }
          }
          { // ── 大正の運河沿いの並木（銀杏並木＝大正モダンの街路樹。広い灰色の道の単調を脱す）。決定的配置＋統合で軽量。秋は黄葉。──
            const trunkG = [], leafG = [], tM = new THREE.Matrix4()
            const leafHex = season === 'autumn' ? 0xd2a23e : season === 'spring' ? 0x8aa858 : weather === 'snow' ? 0x6e7a64 : 0x6f9a52
            for (let cxa = -16; cxa <= 24; cxa += 8) { for (const sd of [-1, 1]) {
              const px = tx + cxa, pz = cz0 + 6.8 * sd, py = heightAt(px, pz)
              if (py < SEA.level + 0.8 || taishoCanal(px, pz) < 4.5) continue // 運河の水・汀は避ける
              if (rectAt(px, pz)) { buriedEraTrees++; continue } // 港町の家の中には生やさない（このループはR()非消費＝配置不変）
              const tg = new THREE.CylinderGeometry(0.16, 0.24, 3.0, 6); tM.makeTranslation(px, py + 1.5, pz); tg.applyMatrix4(tM); trunkG.push(tg)
              if (season !== 'winter') { for (const [ox, oy, oz, r] of [[0, 3.4, 0, 1.3], [-0.7, 3.0, 0.3, 0.85], [0.7, 3.1, -0.3, 0.9], [0.1, 3.9, 0.2, 0.8]]) { const lg = new THREE.IcosahedronGeometry(r, 1); tM.makeTranslation(px + ox, py + oy, pz + oz); lg.applyMatrix4(tM); leafG.push(lg) } }
              else { const lg = new THREE.IcosahedronGeometry(0.95, 1); tM.makeTranslation(px, py + 3.3, pz); lg.applyMatrix4(tM); leafG.push(lg) } // 冬は雪をかぶった樹冠
              colliders.push({ x: px, z: pz, r: 0.5 }) // 歩行で幹を抜けない
            } }
            if (BufferGeometryUtils.mergeGeometries) {
              if (trunkG.length) { const m = BufferGeometryUtils.mergeGeometries(trunkG, false); if (m) { const me = new THREE.Mesh(m, toon(0x6b4a2e)); me.castShadow = true; town.add(me) } trunkG.forEach((g) => g.dispose()) }
              if (leafG.length) { const m = BufferGeometryUtils.mergeGeometries(leafG, false); if (m) { const me = new THREE.Mesh(m, toon(leafHex)); me.castShadow = true; town.add(me) } leafG.forEach((g) => g.dispose()) }
            }
          }
          { // ── 人力車（大正モダンの賑わい。運河沿いの遊歩道に数台）。決定的配置＋材ごとに統合で軽量。──
            const darkG = [], lacqG = [], woodG = []
            const addRickshaw = (cx, cz, rot) => {
              const cy = heightAt(cx, cz); if (cy < SEA.level + 0.8) return
              const base = new THREE.Matrix4().makeRotationY(rot).setPosition(cx, cy, cz)
              const put = (geo, arr, lx, ly, lz, rx = 0, ry = 0, rz = 0) => { const g = geo.clone(); if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.applyMatrix4(new THREE.Matrix4().makeTranslation(lx, ly, lz)); g.applyMatrix4(base); arr.push(g) }
              const rim = new THREE.TorusGeometry(0.5, 0.07, 6, 16), disc = new THREE.CylinderGeometry(0.44, 0.44, 0.05, 12)
              for (const s of [-1, 1]) { put(rim, darkG, s * 0.5, 0.5, -0.1, 0, Math.PI / 2, 0); put(disc, woodG, s * 0.5, 0.5, -0.1, 0, 0, Math.PI / 2) } // 車輪（黒いリム＋木の輻）
              put(new THREE.BoxGeometry(0.92, 0.66, 0.8), lacqG, 0, 0.92, -0.15); put(new THREE.BoxGeometry(0.92, 0.5, 0.1), lacqG, 0, 1.2, -0.5) // 漆の朱の座席＋背
              put(new THREE.SphereGeometry(0.56, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), darkG, 0, 1.25, -0.3) // 黒い幌
              for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.06, 0.06, 2.4), woodG, s * 0.34, 0.62, 1.2, -0.18, 0, 0) // 梶棒（前へ伸びる木の棒）
              colliders.push({ x: cx, z: cz, r: 1.0 })
            }
            addRickshaw(tx - 9, cz0 + 5, Math.PI / 2); addRickshaw(tx + 7, cz0 + 5, -Math.PI / 2); addRickshaw(tx + 18, cz0 - 5, Math.PI / 2)
            if (BufferGeometryUtils.mergeGeometries) {
              for (const [arr, hex] of [[darkG, 0x2a221c], [lacqG, isNight ? 0x5a2420 : 0x7a2c26], [woodG, 0x8a6a44]]) {
                if (arr.length) { const m = BufferGeometryUtils.mergeGeometries(arr, false); if (m) { const me = new THREE.Mesh(m, toon(hex)); me.castShadow = true; town.add(me) } arr.forEach((g) => g.dispose()) }
              }
            }
          }
          { // ── 運河の艀(はしけ)＝大正の水運の名残。係留して静かに浮かぶ（運河沿いの賑わいを水面にも）。──
            for (const [bx, bsd] of [[tx - 4, 0.5], [tx + 14, -0.6]]) {
              const wy = heightAt(bx, cz0) + 0.28; if (wy < SEA.level + 0.8) continue // 運河の水面（運河水は地面+0.28）
              const g = new THREE.Group(); g.position.set(bx, wy, cz0 + bsd); g.rotation.y = bsd * 0.15 // 運河に沿って(x)横たわる＋わずかな角度
              const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.92), toon(0x5a4632)); hull.position.y = -0.02; hull.castShadow = true; g.add(hull) // 喫水（半ば水中）
              const well = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.58), toon(0x3a2c20)); well.position.y = 0.16; g.add(well) // 船内
              const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), toon(0x8a6a44)); pole.position.set(0.8, 0.9, 0); pole.rotation.z = 0.32; g.add(pole) // 棹
              town.add(g)
            }
          }
        }
        const brick = brickMat(season === 'winter' ? 0x8a5648 : 0x9a4f3e, 2.4, 2.2) // 赤煉瓦（イギリス積み＝近接で本物の煉瓦壁）
        const slate = mottleMat(isNight ? 0x3a3e44 : 0x586068, 160, 0.12, [2.2, 2.2]) // スレート屋根
        // 赤レンガ倉庫（港の象徴。海側に長い煉瓦倉庫が並ぶ。拡大した波止場に沿って増設）
        for (let i = 0; i < 7; i++) { const wx = tx - 58 + i * 6.0, wz = tz - 30 + (i % 2) * 3, wy = heightAt(wx, wz); if (wy < SEA.level + 1) continue
          const ww = 4.8, wd = 12, wh = 5.2 + (i % 2) * 1.0
          const body = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), brick); body.position.set(wx, wy + wh / 2, wz); body.castShadow = true; body.receiveShadow = true; town.add(body); town.add(addOutline(body))
          const roof = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.5, 0.5, wd + 0.5), slate); roof.position.set(wx, wy + wh + 0.25, wz); town.add(roof)
          for (let w = 0; w < 4; w++) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.62), isNight ? new THREE.MeshBasicMaterial({ color: 0xffdca0, fog: true }) : toon(0xe8e2d4)); win.position.set(wx - ww / 2 - 0.04, wy + 1.7, wz - wd / 2 + 1.8 + w * 2.7); town.add(win) } }
        // 港の荷（赤レンガ倉庫の海側に積まれた木箱と樽＝波止場の生活感）。決定的配置＋統合で軽量。R()不使用。
        { const crateMat = toon(0x8a6a44), barrelMat = toon(0x6e5236), crateG = [], barrelG = [], cgM = new THREE.Matrix4()
          for (let i = 0; i < 7; i++) { const wx = tx - 58 + i * 6.0, wz = tz - 30 + (i % 2) * 3, wy = heightAt(wx, wz); if (wy < SEA.level + 1) continue
            const fx = wx + 3.6, fz = wz - 3 + (i % 2) * 2.2; if (heightAt(fx, fz) < SEA.level + 0.5) continue // 倉庫の陸側の前（波止場の上のみ・海側は水なので陸側へ）
            if (i % 2 === 0) { for (const [ox, oy, oz] of [[0, 0.5, 0], [0.04, 1.45, 0.06], [-0.92, 0.5, 0.25]]) { const s = 0.92; const g2 = new THREE.BoxGeometry(s, s, s); cgM.makeRotationY(((i + ox) * 0.7) % 0.5).setPosition(fx + ox, wy + oy * 0.92, fz + oz); g2.applyMatrix4(cgM); crateG.push(g2) } } // 木箱を積む
            else { for (const ox of [-0.5, 0.5, 0]) { const br = new THREE.CylinderGeometry(0.4, 0.36, 1.0, 10); cgM.makeTranslation(fx + ox, wy + 0.5, fz + (ox === 0 ? 0.78 : 0)); br.applyMatrix4(cgM); barrelG.push(br) } } // 樽を並べる
          }
          if (BufferGeometryUtils.mergeGeometries) { const cm = crateG.length && BufferGeometryUtils.mergeGeometries(crateG, false); if (cm) { const me = new THREE.Mesh(cm, crateMat); me.castShadow = true; me.receiveShadow = true; town.add(me) } const bm = barrelG.length && BufferGeometryUtils.mergeGeometries(barrelG, false); if (bm) { const me2 = new THREE.Mesh(bm, barrelMat); me2.castShadow = true; town.add(me2) } crateG.concat(barrelG).forEach((g) => g.dispose()) }
        }
        // 時計塔（港町のランドマーク。赤煉瓦＋白い時計＋緑青の尖塔）
        { const cx2 = tx + 6, cz2 = tz - 4, cy = heightAt(cx2, cz2)
          if (cy > SEA.level + 1) { const tower = new THREE.Mesh(new THREE.BoxGeometry(4.2, 16, 4.2), brick); tower.position.set(cx2, cy + 8, cz2); tower.castShadow = true; town.add(tower); town.add(addOutline(tower))
            const band = new THREE.Mesh(new THREE.BoxGeometry(4.7, 1.1, 4.7), toon(0xe6ddc8)); band.position.set(cx2, cy + 14.4, cz2); town.add(band)
            for (const [fx2, fz2] of [[2.36, 0], [-2.36, 0], [0, 2.36], [0, -2.36]]) { const face = new THREE.Mesh(new THREE.CircleGeometry(0.72, 16), isNight ? new THREE.MeshBasicMaterial({ color: 0xfff2cc, fog: true }) : toon(0xf4efe2)); face.position.set(cx2 + fx2, cy + 14.4, cz2 + fz2); face.lookAt(cx2 + fx2 * 2, cy + 14.4, cz2 + fz2 * 2); town.add(face) }
            const spire = new THREE.Mesh(new THREE.ConeGeometry(2.7, 4.2, 6), toon(0x6fae9c)); spire.position.set(cx2, cy + 17.2, cz2); spire.castShadow = true; town.add(spire); town.add(addOutline(spire))
            const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), toon(0xc8a23c)); fin.position.set(cx2, cy + 19.8, cz2); town.add(fin) } } // 時計塔
        // 港町の家々（看板建築＝和洋折衷。煉瓦/クリームの壁＋陸屋根/寄棟。格子の町割り。メッシュ統合で軽く）
        // 壁色のパレット（大正ハイカラ＝クリーム/淡い若草/淡い黄土/淡い青鼠）。建物ごとに振り分けて単調なクリーム一色を脱す。
        const tWallPal = season === 'winter' ? [0xd8d2c4, 0xd2d6cc, 0xdcd4c0, 0xcdd2d4] : [0xcfc3ab, 0xb9c0a6, 0xd6c49a, 0xb7c1c4]
        const tWallMats = tWallPal.map((c) => { const m = facadeMat('yofu', c); m.vertexColors = true; if (duskAmt > 0.12) { m.emissiveMap = getYofuGlow(); m.emissive = new THREE.Color(isNight ? 0xffc878 : 0xffd49a); m.emissiveIntensity = 0.2 + duskAmt * (isNight ? 0.58 : 0.32) } return m }) // 接地AO（頂点色）＋夕夜は洋風窓が灯る
        // 屋根色のパレット（瓦の赤茶/いぶし茶/スレート青鼠）。俯瞰で一色だった屋根に多様さを。
        const tRoofPal = isNight ? [0x4a3832, 0x423a32, 0x3e444a] : [0x9a5642, 0x6e5a48, 0x5d666e]
        const tRoofMats = tRoofPal.map((c, i) => i < 2 ? tileMat(c, 2, 2, true) : mottleMat(c, 150, 0.12, [1.8, 1.8])) // 瓦色(赤茶/いぶし)は瓦テクスチャ＝見上げで瓦の筋が出る／青鼠スレートは平滑なまま
        const taiFac = [{ x: tx + 33, z: tz - 42, r: 14 }, { x: tx + 42, z: tz + 46, r: 13 }, { x: tx - 48, z: tz + 30, r: 12 }, { x: tx - 30, z: tz - 50, r: 10 }, { x: tx + 70, z: tz + 8, r: 9 }] // 公園/学校＋緑地の区画（建物を空け、緑と広場で密集を割る＝閉鎖感対策）
        const twBuckets = tWallPal.map(() => []), trBuckets = tRoofPal.map(() => []), twC = [], tlit = [], plT = [], tmM = new THREE.Matrix4()
        // 港町の町並み＝完全な碁盤の目の均一さを脱す: 主要街路は残しつつ、街区内は密に詰め、
        // 中心(時計塔)ほど高い看板建築、外周は低い住宅、合間に長屋（横長の連棟）を混ぜ、高さ・大きさ・向きを散らす。
        const TGRID = 4.3 // 街区の升目を広げ密集を緩める（大正の閉鎖感対策＝空も地上も呼吸できる港町へ）
        for (let gx = -94; gx <= 94; gx += TGRID) for (let gz = -78; gz <= 84; gz += TGRID) {
          const onAveX = ((gx + 760) % 19) < TGRID, onAveZ = ((gz + 760) % 19) < TGRID // 主要街路（約19間隔）は広めに空ける
          if (onAveX && onAveZ) continue
          const hx = tx + gx + (R() - 0.5) * 1.5, hz = tz + gz + (R() - 0.5) * 1.5, hy = heightAt(hx, hz)
          if (hy < SEA.level + 1.2 || taishoLand(hx, hz) < 15 || Math.hypot(hx - (tx + 6), hz - (tz - 4)) < 9 || taishoCanal(hx, hz) < 8.0 || taiFac.some((f) => Math.hypot(hx - f.x, hz - f.z) < f.r)) continue // 海/渚(汀から内側へ引く)/時計塔前の広場/運河/公園・緑地は空ける
          if (Math.abs(hz - tz) < 4.6 && Math.abs(hx - tx) < 92) continue // 大通り(路面電車の並木道)を広く空ける＝歩いて気持ちいい目抜き通り
          if ((onAveX || onAveZ) ? R() < 0.58 : R() < 0.26) continue // 街路沿いはよく空け、街区内も適度に間引く＝路地と中庭で呼吸する町並み
          const dc = Math.hypot(gx - 6, gz + 4), central = Math.max(0, 1 - dc / 42) // 時計塔＝商業中心からの近さ
          const tt = R(), tall = tt < 0.1 + central * 0.24, longya = !tall && tt > 0.62 && tt < 0.8, isBrick = R() < 0.26 + central * 0.12
          let hw, hd, hh, ang = R() < 0.5 ? 0 : Math.PI / 2
          if (longya) { hw = 2.2 + R() * 0.7; hd = 5.2 + R() * 3.0; hh = 1.9 + R() * 0.4 } // 長屋（横長の連棟）
          else if (tall) { hw = 2.5 + R() * 0.9; hd = 2.5 + R() * 0.9; hh = 4.4 + central * 2.6 + R() * 1.6 } // 看板建築（中心ほど高い）
          else { hw = 2.1 + R() * 1.3; hd = 2.1 + R() * 1.3; hh = 2.2 + central * 1.3 + R() * 1.7 } // 住宅
          tmM.makeRotationY(ang).setPosition(hx, hy + hh / 2, hz); const bg = new RoundedBoxGeometry(hw, hh, hd, 1, Math.min(0.16, Math.min(hw, hd) * 0.07)); if (!isBrick) bakeAO(bg, hh); bg.applyMatrix4(tmM); if (isBrick) twC.push(bg); else twBuckets[(R() * twBuckets.length) | 0].push(bg) // 壁色を振り分け（単調なクリーム一色を脱す）
          colliders.push({ x: hx, z: hz, cos: Math.cos(ang), sin: Math.sin(ang), hw: hw / 2 + 0.15, hd: hd / 2 + 0.15 }) // 歩行: 港町の家をすり抜けない（R()非消費）
          const plg = new THREE.BoxGeometry(hw + 0.5, 0.55, hd + 0.5); tmM.makeRotationY(ang).setPosition(hx, hy + 0.18, hz); plg.applyMatrix4(tmM); plT.push(plg) // 石の土台（接地）
          const ri = (R() * trBuckets.length) | 0 // 屋根色を振り分け
          if (tall || R() < 0.42) { const rg = new THREE.BoxGeometry(hw + 0.3, 0.4, hd + 0.3); tmM.makeRotationY(ang).setPosition(hx, hy + hh + 0.2, hz); rg.applyMatrix4(tmM); trBuckets[ri].push(rg) } // 陸屋根(洋風・看板建築)
          else { tmM.makeRotationY(ang + Math.PI / 4).setPosition(hx, hy + hh + 0.5, hz); const rg = new THREE.ConeGeometry(Math.max(hw, hd) * 0.7, 1.4, 4); rg.applyMatrix4(tmM); trBuckets[ri].push(rg) } // 寄棟
          if (isNight && R() < 0.5) { const lg = new THREE.BoxGeometry(0.12, 0.6, 0.6); tmM.makeTranslation(hx + hw / 2 + 0.02, hy + hh * 0.5, hz); lg.applyMatrix4(tmM); tlit.push(lg) }
        }
        const tlitMat = new THREE.MeshBasicMaterial({ color: 0xffd99a, fog: true })
        const plinthMatT = mottleMat(season === 'winter' ? 0xbcc0c2 : 0x908a80, 120, 0.12, [2, 1]) // 港町の石畳の土台
        const tMerge = [...twBuckets.map((g, i) => [g, tWallMats[i]]), ...trBuckets.map((g, i) => [g, tRoofMats[i]]), [twC, brick], [plT, plinthMatT], [tlit, tlitMat]]
        for (const [geos, mat] of tMerge) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = mat !== tlitMat; mesh.receiveShadow = mat !== tlitMat; town.add(mesh) } geos.forEach((g) => g.dispose()) } }
        // ── 緑で密集を割る（俯瞰の単調な屋根の海に緑の筋と面を、地上の閉鎖感を解く）。並木＋新緑地の木立＋時計塔広場の植栽。 ──
        { const tput = (px, pz, sc) => { if (heightAt(px, pz) > SEA.level + 1.1 && taishoCanal(px, pz) > 6.5) tree(px, pz, sc) }
          for (let gx = -84; gx <= 84; gx += 14) for (const sd of [-1, 1]) tput(tx + gx + (R() - 0.5) * 1.6, tz + sd * 6.4, 1.0 + R() * 0.4)     // 目抜き通りの並木
          for (const f of taiFac.slice(2)) { const nT = 3 + ((f.r / 4) | 0); for (let i = 0; i < nT; i++) { const a = R() * 6.28, rr = 2 + R() * (f.r - 3); tput(f.x + Math.cos(a) * rr, f.z + Math.sin(a) * rr, 0.9 + R() * 0.6) } } // 新緑地を木立に
          for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; tput(tx + 6 + Math.cos(a) * 7.6, tz - 4 + Math.sin(a) * 7.6, 0.85 + R() * 0.3) } // 時計塔広場をぐるりと並木
        }
        // ── 港町の街路（碁盤の目の道＝区画整理された大正の町。石畳の道）。地形に沿わせ統合で軽量。 ──
        { const paveMat = mottleMat(season === 'winter' ? 0xc4c8c6 : 0x8e8a84, 100, 0.1, [3, 1]), roadGeos = [], rM = new THREE.Matrix4(), rMx = new THREE.Matrix4()
          // 両端の高さで傾けた1区間（home路地segAlleyと同じ作法）＋h=道の種別ごとの厚み（縦×横の交差で天面が同一高さになるZファイティングを断つ。底は+0.01で揃える）
          const seg = (x0, z0, x1, z1, w, h = 0.16) => { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); if (len < 0.5) return; const px = (x0 + x1) / 2, pz = (z0 + z1) / 2, y0 = heightAt(x0, z0), y1 = heightAt(x1, z1), py = (y0 + y1) / 2; if (py < SEA.level + 0.6 || taishoCanal(px, pz) < 4 || taishoLand(px, pz) < 22) return; const bg = new THREE.BoxGeometry(w, h, len + 0.9); rMx.makeRotationX(-Math.atan2(y1 - y0, len)).premultiply(rM.makeRotationY(Math.atan2(dx, dz))); rMx.setPosition(px, py + 0.01 + h / 2, pz); bg.applyMatrix4(rMx); roadGeos.push(bg) }
          const road = (x0, z0, x1, z1, w, h) => { const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 5)); for (let s = 0; s < steps; s++) seg(x0 + (x1 - x0) * s / steps, z0 + (z1 - z0) * s / steps, x0 + (x1 - x0) * (s + 1) / steps, z0 + (z1 - z0) * (s + 1) / steps, w, h) }
          for (let n = -5; n <= 5; n++) { const gx = n * 19; if (Math.abs(gx) > TAISHO.r - 6) continue; road(tx + gx, tz - 84, tx + gx, tz + 90, 4.2) } // 縦の通り（建物の空けと一致）
          for (let mm = -4; mm <= 5; mm++) { const gz = mm * 19; if (Math.abs(gz) > TAISHO.r - 6) continue; road(tx - 96, tz + gz, tx + 96, tz + gz, 4.2, 0.22) } // 横の通り
          // 路地（主要街路の間に細い道＝区画を細かく割る路地裏。本物の港町の入り組んだ街路へ） ──
          for (let n = -5; n <= 4; n++) { const gx = n * 19 + 9.5; if (Math.abs(gx) > TAISHO.r - 6) continue; road(tx + gx, tz - 82, tx + gx, tz + 88, 1.8, 0.19) } // 縦の路地
          for (let mm = -4; mm <= 4; mm++) { const gz = mm * 19 + 9.5; if (Math.abs(gz) > TAISHO.r - 6) continue; road(tx - 94, tz + gz, tx + 94, tz + gz, 1.8, 0.25) } // 横の路地
          if (roadGeos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(roadGeos, false); if (m) { const rmesh = new THREE.Mesh(m, paveMat); rmesh.receiveShadow = true; town.add(rmesh) } roadGeos.forEach((g) => g.dispose()) }
        }
        // 桟橋（海へ突き出す木の桟橋）
        for (const po of [-34, -18]) { const px0 = tx - 46, pz0 = tz + po
          const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 2.4), toon(0x6e5640)); deck.position.set(px0 - 6, SEA.level + 0.7, pz0); deck.castShadow = true; town.add(deck)
          for (let p = 0; p < 5; p++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.4, 5), toon(0x4a3a28)); leg.position.set(px0 - 14 + p * 4, SEA.level - 0.3, pz0 + (p % 2 ? 1 : -1)); town.add(leg) } }
        // 蒸気船（黒い船体＋煙突＝大正の港。波にゆれる）
        { const ship = new THREE.Group(); ship.position.set(tx - 70, SEA.level + 0.2, tz - 24); ship.rotation.y = 0.3; ship.userData = { ph: R() * 6.28 }
          const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 2.8), toon(0x3a3a40)); hull.position.y = 0.4; ship.add(hull); const dk = new THREE.Mesh(new THREE.BoxGeometry(5, 1.0, 2.2), toon(0xc8b89a)); dk.position.set(-0.5, 1.4, 0); ship.add(dk)
          const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 2.6, 10), toon(0x9a4030)); funnel.position.set(-0.5, 3.0, 0); ship.add(funnel); town.add(ship); boats.push(ship) }
        // ── 公園（噴水＋ベンチ＋並木）＝大正のハイカラな憩いの場 ──
        { const px0 = tx + 33, pz0 = tz - 42, py0 = heightAt(px0, pz0)
          if (py0 > SEA.level + 1) {
            const plaza = new THREE.Mesh(new THREE.CircleGeometry(13, 26), mottleMat(season === 'winter' ? 0xc4c8c6 : 0x9a948a, 90, 0.1, [4, 4])); plaza.rotation.x = -Math.PI / 2; plaza.position.set(px0, py0 + 0.06, pz0); plaza.receiveShadow = true; town.add(plaza) // 石畳の広場
            const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.7, 16), toon(0xb8b2a4)); basin.position.set(px0, py0 + 0.35, pz0); town.add(basin); town.add(addOutline(basin))
            const water = new THREE.Mesh(new THREE.CircleGeometry(2.9, 16), new THREE.MeshBasicMaterial({ map: wtex, color: isNight ? 0x4a5862 : 0x9fc0d0, fog: true })); water.rotation.x = -Math.PI / 2; water.position.set(px0, py0 + 0.72, pz0); town.add(water)
            const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 2.0, 8), new THREE.MeshBasicMaterial({ color: 0xddeef4, transparent: true, opacity: 0.6, fog: true })); jet.position.set(px0, py0 + 1.7, pz0); town.add(jet) // 噴水
            for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28, bx = px0 + Math.cos(a) * 8, bz = pz0 + Math.sin(a) * 8, by = heightAt(bx, bz); const bench = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.7), toon(0x6a5a44)); bench.position.set(bx, by + 0.35, bz); bench.rotation.y = a; town.add(bench) } // ベンチ
            for (let k = 0; k < 8; k++) { const a = R() * 6.28, rr = 10 + R() * 3.5, bx = px0 + Math.cos(a) * rr, bz = pz0 + Math.sin(a) * rr, by = heightAt(bx, bz); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.8, 6), toon(0x6a4f38)); tr.position.set(bx, by + 0.9, bz); town.add(tr); const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), toon(season === 'autumn' ? 0xc88a3c : season === 'winter' ? 0xd2dad6 : 0x5e7e48)); fo.position.set(bx, by + 2.4, bz); fo.castShadow = true; town.add(fo) } } } // 並木
        // ── 学校（洋風校舎＋校庭）＝大正の学び舎 ──
        { const sx0 = tx + 42, sz0 = tz + 46, sy0 = heightAt(sx0, sz0)
          if (sy0 > SEA.level + 1) {
            const sch = new THREE.Mesh(new RoundedBoxGeometry(14, 4.6, 6, 1, 0.12), facadeMat('yofu', season === 'winter' ? 0xd6cdb8 : 0xc8bb9e)); sch.position.set(sx0, sy0 + 2.3, sz0); sch.castShadow = true; sch.receiveShadow = true; town.add(sch); town.add(addOutline(sch))
            const sroof = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.5, 6.5), tileMat(isNight ? 0x3a3030 : 0x5a4038, 3, 1, false)); sroof.position.set(sx0, sy0 + 4.85, sz0); town.add(sroof)
            const clock = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 0.4), facadeMat('yofu', 0xd0c4a8)); clock.position.set(sx0, sy0 + 5.5, sz0 - 1); town.add(clock); const cf = new THREE.Mesh(new THREE.CircleGeometry(0.6, 14), toon(0xf4efe2)); cf.position.set(sx0, sy0 + 6.2, sz0 - 1.22); town.add(cf) // 時計のある中央棟
            const yard = new THREE.Mesh(new THREE.CircleGeometry(7, 20), mottleMat(season === 'winter' ? 0xc8ccc6 : 0xa8987c, 90, 0.1, [4, 4])); yard.rotation.x = -Math.PI / 2; yard.position.set(sx0, sy0 + 0.06, sz0 + 11); yard.receiveShadow = true; town.add(yard) } } // 校庭
        // ガス灯（暖色の街灯。夜は灯る）＋人々＋並木
        { const tgc = document.createElement('canvas'); tgc.width = tgc.height = 32; const tgx = tgc.getContext('2d'); const tgg = tgx.createRadialGradient(16, 16, 1, 16, 16, 16); tgg.addColorStop(0, 'rgba(255,200,140,0.95)'); tgg.addColorStop(1, 'rgba(255,180,120,0)'); tgx.fillStyle = tgg; tgx.fillRect(0, 0, 32, 32); const tGlow = new THREE.CanvasTexture(tgc)
          for (let k = 0; k < 10; k++) { const a = R() * 6.28, r2 = 14 + R() * 40, lx = tx + Math.cos(a) * r2, lz = tz + Math.sin(a) * r2, ly = heightAt(lx, lz); if (ly < SEA.level + 1.2) continue
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.0, 6), toon(0x3a3e42)); pole.position.set(lx, ly + 1.5, lz); town.add(pole)
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), isNight ? new THREE.MeshBasicMaterial({ color: 0xffd28a, fog: true }) : toon(0xf0e4c8)); lamp.position.set(lx, ly + 3.1, lz); town.add(lamp)
            if (isNight) { const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, color: 0xffcf8a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); gl.position.set(lx, ly + 3.1, lz); gl.scale.set(2.4, 2.4, 1); town.add(gl); litFlicker(gl.material, 0.07, 1.7) } }
          // ── 運河沿いの並木道のガス灯（水辺に灯りの列＝大正の港町の灯りの散歩道）。竿/灯は統合で軽量、夜はグローを灯す ──
          { const cPoleG = [], cLampG = [], cm = new THREE.Matrix4(), canalZ = tz + 17, lampMat = isNight ? new THREE.MeshBasicMaterial({ color: 0xffd28a, fog: true }) : toon(0xf0e4c8)
            for (let cx = tx - 100; cx <= tx + 26; cx += 7) for (const side of [-1, 1]) { const lx = cx, lz = canalZ + side * 5.5, ly = heightAt(lx, lz)
              if (ly < SEA.level + 1.0) continue
              const pg = new THREE.CylinderGeometry(0.07, 0.1, 3.0, 6); cm.makeTranslation(lx, ly + 1.5, lz); pg.applyMatrix4(cm); cPoleG.push(pg)
              const lg = new THREE.SphereGeometry(0.26, 8, 8); cm.makeTranslation(lx, ly + 3.1, lz); lg.applyMatrix4(cm); cLampG.push(lg)
              if (isNight) { const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tGlow, color: 0xffcf8a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); gl.position.set(lx, ly + 3.1, lz); gl.scale.set(2.2, 2.2, 1); town.add(gl); litFlicker(gl.material, 0.07, 1.5) }
            }
            if (BufferGeometryUtils.mergeGeometries) { const pm = BufferGeometryUtils.mergeGeometries(cPoleG, false); if (pm) town.add(new THREE.Mesh(pm, toon(0x3a3e42))); cPoleG.forEach((g) => g.dispose()); const lmM = BufferGeometryUtils.mergeGeometries(cLampG, false); if (lmM) town.add(new THREE.Mesh(lmM, lampMat)); cLampG.forEach((g) => g.dispose()) }
          }
          const tKim = [0x8a3a32, 0x3a4a6a, 0x556040, 0x7a5a34, 0x6a4a5a, 0x40443a] // 大正の人々（着物＋洋装の中間色）
          for (let k = 0; k < 6; k++) { const a = R() * 6.28, r2 = 12 + R() * 44, px = tx + Math.cos(a) * r2, pz = tz + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.2) continue; mkCrowdPerson(px, py, pz, tKim[k % tKim.length], 0.72) } // 人らしい体に（こけし人形を脱す）。遠景の人は少なめ（作り込んだ住人placeEraを増やした）
          // ── 港町の市の屋台＋犬猫＝降り立った大正の賑わい。 ──
          { const taiGoods = [0xc85038, 0x6a8a9a, 0xd0a040, 0x9a5a3a, 0xb87050, 0x7a8a4a]
            for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + 0.5, r2 = 16 + R() * 22, px = tx + Math.cos(a) * r2, pz = tz + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue
              makeStall(px, py, pz, a + Math.PI / 2 + (R() - 0.5) * 0.4, { roof: 'cloth', roofCol: [0xc23a4a, 0x3a7a6a, 0xd0a040][(R() * 3) | 0], goods: taiGoods, noren: 0xd8d0c0 }) }
            for (let k = 0; k < 2; k++) { const a = R() * 6.28, r2 = 14 + R() * 20, px = tx + Math.cos(a) * r2, pz = tz + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue; mkQuad(px, py, pz, R() * 6.28, k === 0 ? 0xddd6c8 : 0x5a5a5e, 0.58 + R() * 0.12, k === 0 ? 'cat' : 'dog') } }
          // ── ガス灯（大正ロマンの象徴）＋丸ポスト＝降り立った港町の近景。夕夜は暖かく灯る。 ──
          { const gc = document.createElement('canvas'); gc.width = gc.height = 32; const gcx = gc.getContext('2d'); const gg = gcx.createRadialGradient(16, 16, 1, 16, 16, 16); gg.addColorStop(0, 'rgba(255,207,138,0.95)'); gg.addColorStop(1, 'rgba(255,200,120,0)'); gcx.fillStyle = gg; gcx.fillRect(0, 0, 32, 32); const gtex = new THREE.CanvasTexture(gc)
            const ironMat = toon(0x3a3a40), glassLit = new THREE.MeshBasicMaterial({ color: 0xffd089, fog: true }), glassDk = toon(0x46484e)
            const lampGlow = isNight ? 0.85 : duskAmt * 0.55, lampGlass = lampGlow > 0.12 ? glassLit : glassDk
            for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28 + 0.2, r2 = 11 + R() * 26, px = tx + Math.cos(a) * r2, pz = tz + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue
              const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 6), ironMat); pole.position.set(px, py + 1.6, pz); pole.castShadow = true; town.add(pole)
              const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 8), ironMat); base.position.set(px, py + 0.15, pz); town.add(base) // 台座
              const glass = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.24), lampGlass); glass.position.set(px, py + 3.12, pz); town.add(glass) // ランプ箱
              const cap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.22, 6), ironMat); cap.position.set(px, py + 3.42, pz); town.add(cap) // 笠
              if (lampGlow > 0.12) { const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, color: 0xffcf8a, transparent: true, opacity: lampGlow, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); gl.position.set(px, py + 3.12, pz); gl.scale.set(1.9, 1.9, 1); town.add(gl); litFlicker(gl.material, 0.07, 1.9); lightPool(px, py, pz, 1.7, lampGlow * 0.5) } } // 足元の灯りだまり
            const postMat = toon(0xc0392b)
            for (let k = 0; k < 2; k++) { const a = R() * 6.28, r2 = 12 + R() * 20, px = tx + Math.cos(a) * r2, pz = tz + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.5) continue
              const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.2, 12), postMat); pb.position.set(px, py + 0.6, pz); pb.castShadow = true; town.add(pb) // 丸ポストの胴
              const pc = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, 6.283, 0, Math.PI / 2), postMat); pc.position.set(px, py + 1.2, pz); town.add(pc) // 丸い頭
              const slot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.07), toon(0x241f1c)); slot.position.set(px, py + 1.0, pz + 0.17); town.add(slot) } } // 投函口
          // 大正の店の看板（横書きのホーロー/洋風看板。和洋折衷の店名）
          const tenmei = [['カフエー', 0x9a3a34], ['珈琲', 0x4a3a2a], ['寫眞館', 0x3a4a5a], ['洋食', 0xb24a3a], ['郵便局', 0xc04030], ['銀行', 0x4a5a4a], ['時計店', 0x3a4a44], ['理髪', 0x3a5a6a], ['書肆', 0x6a4a3a], ['牛乳', 0xcfc4aa], ['商會', 0x7a5a3a]]
          for (let k = 0; k < 11; k++) { const a = (k / 11) * 6.28 + 0.2, r2 = 12 + R() * 30, px = tx + Math.cos(a) * r2, pz = tz + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.4 || Math.hypot(px - (tx + 6), pz - (tz - 4)) < 6) continue
            const [nm, bg] = tenmei[k % tenmei.length]; mkSignH(px, py + 3.0, pz, a + Math.PI / 2 + (R() - 0.5) * 0.4, nm, bg, 0xf2ece0) } // 大正の店の看板
          const tfolC = season === 'spring' ? 0x88aa55 : season === 'autumn' ? 0xc88a3c : season === 'winter' ? 0xd2dad6 : 0x5e7e48
          const tTrunkG = [], tLeafG = [], tShadowG = [], tmM4 = new THREE.Matrix4() // 木立を統合＝拡大した島の全域に緑を行き渡らせつつ描画コール据え置き
          for (let k = 0; k < 58; k++) { const a = R() * 6.28, r2 = 12 + R() * 94, px = tx + Math.cos(a) * r2, pz = tz + Math.sin(a) * r2, py = heightAt(px, pz); if (py < SEA.level + 1.5 || taishoCanal(px, pz) < 7.5) continue; const s = 0.7 + R() * 0.5 // 運河の水面幅(中心線から〜6.8)より広く避ける＝幹が運河を貫通して浮くのを防ぐ（評価アート指摘）
            const trG = new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 1.4 * s, 6); tmM4.makeTranslation(px, py + 0.7 * s, pz); trG.applyMatrix4(tmM4); tTrunkG.push(trG)
            const fG = new THREE.IcosahedronGeometry(1.3 * s, 2); tmM4.makeTranslation(px, py + 1.9 * s, pz); fG.applyMatrix4(tmM4); tLeafG.push(fG); tShadowG.push([px, py, pz, 1.4 * s]) }
          for (const [geos, mat] of [[tTrunkG, toon(0x6a4f38)], [tLeafG, toon(tfolC)]]) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = true; mesh.receiveShadow = true; town.add(mesh) } geos.forEach((g) => g.dispose()) } }
          addContactShadows(tShadowG) } // 街のあちこちに木立（密度UP・統合）＋足元の接地影で浮きを消す
        // 港を見下ろす高台の洋館（大正の見どころ。クリームの壁＋マンサード屋根＋並木）
        { const mx0 = tx - 44, mz0 = tz + 42, my0 = heightAt(mx0, mz0)
          const body = new THREE.Mesh(new RoundedBoxGeometry(9, 5.0, 7, 1, 0.12), facadeMat('yofu', 0xe6ddc8)); body.position.set(mx0, my0 + 2.5, mz0); body.castShadow = true; body.receiveShadow = true; town.add(body); town.add(addOutline(body))
          const mans = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 6.4, 2.6, 4), tileMat(isNight ? 0x3a3030 : 0x5a4038, 2, 2, false)); mans.rotation.y = Math.PI / 4; mans.position.set(mx0, my0 + 6.3, mz0); mans.castShadow = true; town.add(mans); town.add(addOutline(mans)) // マンサード屋根
          const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.0, 6), toon(0x6fae9c)); spire.position.set(mx0, my0 + 8.4, mz0); town.add(spire)
          for (let k = 0; k < 8; k++) { const a = R() * 6.28, rr = 8 + R() * 8, px = mx0 + Math.cos(a) * rr, pz = mz0 + Math.sin(a) * rr, py = heightAt(px, pz); if (py < my0 - 4) continue; const s = 1.0 + R() * 0.4
            const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 1.8 * s, 6), toon(0x6a4f38)); tr.position.set(px, py + 0.9 * s, pz); town.add(tr); const fo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 2), toon(season === 'autumn' ? 0xc88a3c : season === 'winter' ? 0xd2dad6 : 0x5e7e48)); fo.position.set(px, py + 2.4 * s, pz); fo.castShadow = true; town.add(fo) } } // 高台の並木
        // ── 異人館街（東の高台＝拡大した新地区）。色とりどりの洋館＋教会。海を見下ろす丘の上のハイカラな一画 ──
        { const ijx = tx + 52, ijz = tz - 44 // 異人館の丘の中心
          const ijCols = [0xb86a52, 0xd8c49a, 0x9aafa0, 0xc8b8c4, 0xb8c2cc] // 異人館の壁色（くすんだ赤煉瓦/クリーム/淡緑/淡紫/淡青）
          for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.2832 + 0.4, rr = 7 + (k % 2) * 6, hx = ijx + Math.cos(a) * rr, hz = ijz + Math.sin(a) * rr, hy = heightAt(hx, hz); if (hy < SEA.level + 2) continue
            const hw = 4.0 + R() * 1.6, hh = 4.0 + R() * 1.6, body = new THREE.Mesh(new RoundedBoxGeometry(hw, hh, hw * 0.9, 1, 0.12), facadeMat('yofu', ijCols[k % ijCols.length])); body.position.set(hx, hy + hh / 2, hz); body.rotation.y = a; body.castShadow = true; body.receiveShadow = true; town.add(body); town.add(addOutline(body))
            const mans = new THREE.Mesh(new THREE.CylinderGeometry(hw * 0.4, hw * 0.74, 1.8, 4), tileMat(isNight ? 0x3a3030 : 0x5a4038, 2, 2, false)); mans.rotation.y = a + Math.PI / 4; mans.position.set(hx, hy + hh + 0.7, hz); mans.castShadow = true; town.add(mans); town.add(addOutline(mans)) // マンサード屋根
            if (isNight) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.06), new THREE.MeshBasicMaterial({ color: 0xffd99a, fog: true })); win.position.set(hx + Math.cos(a) * (hw / 2 + 0.04), hy + hh * 0.5, hz + Math.sin(a) * (hw / 2 + 0.04)); win.rotation.y = a; town.add(win) } }
          { const cx2 = ijx - 2, cz2 = ijz + 8, cy = heightAt(cx2, cz2) // 教会（尖塔＋十字）
            if (cy > SEA.level + 2) { const nave = new THREE.Mesh(new RoundedBoxGeometry(5, 4.6, 8, 1, 0.1), facadeMat('yofu', season === 'winter' ? 0xdcd6c8 : 0xcfc7b4)); nave.position.set(cx2, cy + 2.3, cz2); nave.castShadow = true; nave.receiveShadow = true; town.add(nave); town.add(addOutline(nave))
              const nroof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.0, 4), tileMat(isNight ? 0x33363c : 0x4a525a, 2, 2, false)); nroof.rotation.y = Math.PI / 4; nroof.scale.set(1, 1, 1.5); nroof.position.set(cx2, cy + 5.6, cz2); town.add(nroof); town.add(addOutline(nroof))
              const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 2.4), facadeMat('yofu', season === 'winter' ? 0xdcd6c8 : 0xcfc7b4)); tower.position.set(cx2, cy + 4.5, cz2 - 4.5); tower.castShadow = true; town.add(tower); town.add(addOutline(tower))
              const spire = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.4, 4), toon(0x6fae9c)); spire.rotation.y = Math.PI / 4; spire.position.set(cx2, cy + 10.7, cz2 - 4.5); spire.castShadow = true; town.add(spire); town.add(addOutline(spire))
              const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), toon(0xc8a23c)); crossV.position.set(cx2, cy + 13.0, cz2 - 4.5); town.add(crossV); const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.12), toon(0xc8a23c)); crossH.position.set(cx2, cy + 13.2, cz2 - 4.5); town.add(crossH) } }
        }
        // ── 大正の駅舎（赤煉瓦の停車場＋緑青ドーム）＋プラットホーム。路面電車の起点 ──
        { const stx = tx - 4, stz = tz + 30, sty = heightAt(stx, stz)
          if (sty > SEA.level + 1) { const depot = new THREE.Mesh(new RoundedBoxGeometry(12, 5.0, 6, 1, 0.12), brick); depot.position.set(stx, sty + 2.5, stz); depot.castShadow = true; depot.receiveShadow = true; town.add(depot); town.add(addOutline(depot))
            const droof = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.5, 6.6), slate); droof.position.set(stx, sty + 5.1, stz); town.add(droof)
            const dome2 = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x6fae9c)); dome2.position.set(stx, sty + 5.3, stz); dome2.castShadow = true; town.add(dome2) // 緑青のドーム
            const plat = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 2.4), toon(season === 'winter' ? 0xc4c8c6 : 0x9a948a)); plat.position.set(stx, sty + 0.25, stz + 6); plat.receiveShadow = true; town.add(plat) } } // プラットホーム
        // ── 路面電車（大通り z=tz を東西に走る）＝大正の生気。レール＋走る電車。 ──
        { const railM = toon(0x4a4640), railZ = tz, rx0 = tx - 68, rx1 = tx + 68 // 大通りの東西。端は内陸に収める（うねる海岸線で渚に電車が出ないよう短縮）
          for (const dz of [-0.7, 0.7]) { const rgeos = [], steps = 32 // レールは地形に沿って多分割（平らな1本棒が斜面/渚で浮くのを脱す＝走る電車heightAt追従と一致）
            for (let s = 0; s < steps; s++) { const xa = rx0 + (rx1 - rx0) * s / steps, xb = rx0 + (rx1 - rx0) * (s + 1) / steps, ya = heightAt(xa, railZ + dz), yb = heightAt(xb, railZ + dz), ln = xb - xa
              const bg = new THREE.BoxGeometry(ln + 0.05, 0.08, 0.14); const mm = new THREE.Matrix4().makeRotationZ(Math.atan2(yb - ya, ln)); mm.setPosition((xa + xb) / 2, (ya + yb) / 2 + 0.12, railZ + dz); bg.applyMatrix4(mm); rgeos.push(bg) }
            const rm = BufferGeometryUtils.mergeGeometries ? BufferGeometryUtils.mergeGeometries(rgeos, false) : null; if (rm) { town.add(new THREE.Mesh(rm, railM)); rgeos.forEach((g) => g.dispose()) } else rgeos.forEach((g) => town.add(new THREE.Mesh(g, railM))) } // レール2本（多分割を1メッシュに統合）
          const tram = new THREE.Group(); const tbody = new THREE.Mesh(new RoundedBoxGeometry(5.4, 2.4, 2.0, 1, 0.18), toon(season === 'winter' ? 0x4a6a5a : 0x2e6a52)); tbody.position.y = 1.5; tbody.castShadow = true; tram.add(tbody); tram.add(addOutline(tbody)) // 輪郭は電車の子＝一緒に動く（townに直接足すと原点に取り残される）
          const tBand = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 2.05), toon(0xe6dcc6)); tBand.position.y = 2.1; tram.add(tBand) // 窓帯
          const tRoofm = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 2.2), toon(0x3a3a36)); tRoofm.position.y = 2.85; tram.add(tRoofm)
          if (isNight) { const tw = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.4, 0.04), new THREE.MeshBasicMaterial({ color: 0xffe2a4, fog: true })); tw.position.set(0, 2.1, 1.03); tram.add(tw); const tw2 = tw.clone(); tw2.position.z = -1.03; tram.add(tw2) }
          tram.position.set(rx0, heightAt(rx0, railZ) + 0.16, railZ); town.add(tram) // 初期位置をレール始点に置く（遠方時に原点へ取り残されてhome中央に出るのを防ぐ）
          trams.push({ g: tram, x0: rx0, x1: rx1, z: railZ, sp: 7 + R() * 2, ph: R() * 100 })
        }
        for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.2832 + R() * 0.25, rr = coastR(taishoLand, tx, tz, a) - 3 + R() * 6, rx = tx + Math.cos(a) * rr, rz = tz + Math.sin(a) * rr, ry = heightAt(rx, rz); const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 + R() * 1.2, 0), toon(0x7c766a)); rk.position.set(rx, Math.max(SEA.level, ry) + 0.3, rz); rk.rotation.set(R() * 3, R() * 3, R() * 3); rk.scale.y = 0.6; town.add(rk) } // 汀の磯（うねる海岸線に沿わせる）
        addCoastDetail(TAISHO.x, TAISHO.z, taishoLand) // 汀の白波リボン＋流木/寄り石/浜草（homeの渚を島の閉じた海岸線へ）
      }
      // ── 異時代の島々を本物の島に：開発された街の外周に森のベルト＋汀の磯を巡らせ「海から唐突に街が浮かぶ」違和感を消す ──
      { const beltTrunk = [], beltLeaf = [], beltCone = [], rockGeos = [], nM = new THREE.Matrix4()
        const leafCol = season === 'spring' ? 0x7faa4e : season === 'autumn' ? 0xcf8a38 : season === 'winter' ? 0xcdd6cc : 0x4e6e44
        for (const isle of [{ x: EDO.x, z: EDO.z, r: EDO.r }, { x: SENGOKU.x, z: SENGOKU.z, r: SENGOKU.r }, { x: TAISHO.x, z: TAISHO.z, r: TAISHO.r }]) {
          const beltN = Math.round(isle.r * 3.4) // 外周の森の密度（島の大きさに比例。縁にぐるりと密な森のベルト）
          for (let i = 0; i < beltN; i++) { const a = R() * 6.2832, rr = isle.r * (0.9 + R() * 0.14), px = isle.x + Math.cos(a) * rr, pz = isle.z + Math.sin(a) * rr, py = heightAt(px, pz)
            if (py < SEA.level + 0.6 || py > 34) continue // 汀より上・外周の低い所のみ（城/山頂は森にしない）
            const pine = R() < 0.45, s = 0.8 + R() * 0.6
            const trG = new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 1.8 * s, 6); nM.makeTranslation(px, py + 0.9 * s, pz); trG.applyMatrix4(nM); beltTrunk.push(trG)
            if (pine) { for (const [cy, cr, ch] of [[2.4, 1.5, 2.3], [3.6, 1.0, 1.9]]) { const fG = new THREE.ConeGeometry(cr * s, ch * s, 7); nM.makeTranslation(px, py + cy * s, pz); fG.applyMatrix4(nM); beltCone.push(fG) } } // 松/杉＝2段の円錐（本数が多いので2段に抑え発熱配慮）
            else { const fG = new THREE.IcosahedronGeometry(1.5 * s, 2); nM.makeTranslation(px, py + 2.1 * s, pz); fG.applyMatrix4(nM); beltLeaf.push(fG) } } // 雑木
          const rockN = Math.round(isle.r * 0.5)
          for (let i = 0; i < rockN; i++) { const a = R() * 6.2832, rr = isle.r * (0.96 + R() * 0.12), px = isle.x + Math.cos(a) * rr, pz = isle.z + Math.sin(a) * rr, py = heightAt(px, pz)
            if (py > SEA.level + 2.5 || py < SEA.level - 2.5) continue // 水際の岩のみ
            const rg = new THREE.IcosahedronGeometry(0.8 + R() * 1.4, 0); nM.makeScale(1, 0.6, 1); nM.setPosition(px, Math.max(SEA.level, py) + 0.2, pz); rg.applyMatrix4(nM); rockGeos.push(rg) } // 汀の磯
        }
        if (BufferGeometryUtils.mergeGeometries) for (const [geos, mat] of [[beltTrunk, toon(0x6a4f38)], [beltCone, toon(season === 'autumn' ? 0x8a7a40 : 0x4e6e44)], [beltLeaf, toon(leafCol)], [rockGeos, toon(season === 'winter' ? 0xc8ccc8 : 0x7c766a)]]) {
          if (geos.length) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const mesh = new THREE.Mesh(m, mat); mesh.castShadow = true; mesh.receiveShadow = true; town.add(mesh) } geos.forEach((g) => g.dispose()) } }
      }
      // ── 生きもの（街/時代/季節で最適化）。蝶/蜻蛉はふわふわ舞い、犬猫馬は街に佇む＝生気と不自然さの解消 ──
      { const flyOK = season === 'spring' || season === 'summer', dartOK = (season === 'summer' || season === 'autumn') && weather !== 'rain'
        const flyCols = season === 'spring' ? [0xf6d0e0, 0xfaf0c0, 0xf2f2ee, 0xeed8a8] : [0xf2ead0, 0xe8e2c0, 0xf6e8b0, 0xeec8a0]
        const dartCol = season === 'autumn' ? 0xc2452a : 0x46665a // 秋＝赤とんぼ／夏＝青緑の蜻蛉
        for (const [cx, cz, kind] of [[0, 0, 'home'], [EDO.x, EDO.z, 'edo'], [SENGOKU.x, SENGOKU.z, 'sengoku'], [TAISHO.x, TAISHO.z, 'taisho']]) {
          if (flyOK && !isNight) for (let k = 0; k < 5; k++) { const a = R() * 6.28, r = 14 + R() * 34, px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r, py = heightAt(px, pz); if (py < SEA.level + 1) continue; mkButterfly(px, py + 1.4 + R() * 2.0, pz, flyCols[k % flyCols.length]) } // 蝶（春夏の昼・目線寄りに低く）
          // 蜻蛉（夏=水辺の青緑／秋=野山を群れる赤とんぼ）。秋は戦国の棚田の上にも舞い、現代は数を増やす＝降り立つと出会える。
          if (dartOK && (kind !== 'sengoku' || season === 'autumn')) { const dN = season === 'autumn' ? (kind === 'home' ? 7 : 4) : 3; for (let k = 0; k < dN; k++) { const a = R() * 6.28, r = 14 + R() * 24, px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r, py = heightAt(px, pz); if (py < SEA.level + 1) continue; mkDragonfly(px, py + 1.4 + R() * 0.8, pz, dartCol) } }
          const animals = kind === 'sengoku' ? [[0x5a4030, 1.1, 'horse']] : kind === 'edo' ? [[0x5a4030, 1.1, 'horse'], [0xc8c0b4, 0.55, 'dog'], [0x6a6258, 0.5, 'cat']] : kind === 'taisho' ? [[0xc8c0b4, 0.55, 'dog'], [0x4a4038, 0.5, 'cat'], [0xddd6c8, 0.55, 'cat']] : [[0xc8c0b4, 0.55, 'dog'], [0x5a5a5e, 0.5, 'cat'], [0x8a7a5a, 0.55, 'cat']] // 戦国=馬/江戸=馬犬猫/大正=犬猫/現代=犬猫
          for (const [col, sc, qk] of animals) { const a = R() * 6.28, r = 12 + R() * 26, px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r, py = heightAt(px, pz); if (py < SEA.level + 1.2) continue; mkQuad(px, py, pz, R() * 6.28, col, sc, qk) }
        }
      }
      // ── 行き先の気配（飛び立つと方角がそれとなく分かる導線）。東=城下町への澪標／北=山城への鳥居の海路 ──
      {
        for (let mx = 110; mx <= 520; mx += 30) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 14, 6), toon(0x6a4f38)); pole.position.set(mx, SEA.level + 5, -44); pole.castShadow = true; town.add(pole); const cage = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), toon(0x5a4632)); cage.position.set(mx, SEA.level + 11.5, -44); town.add(cage); town.add(addOutline(cage)); const flag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 2.0), toon(0xc24a33)); flag.position.set(mx, SEA.level + 9.4, -42.9); town.add(flag); if (isNight) { const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffcf8a, fog: true })); lamp.position.set(mx, SEA.level + 11.5, -44); town.add(lamp) } } // 澪標（東＝江戸への海路。島の汀の手前まで）
        // 北(戦国)の鳥居の海路・西(大正)の灯標の海路は撤去＝導線で位置がバレないよう独立させ「偶然見つける」渡りに（実機FB。導線は東=江戸のみ）。
        // 海路に灯る光点（東＝江戸の澪標の足元に連なり、上空からは方角を指す一筋の線として読める。戦国/大正には敷かない）
        const gc = document.createElement('canvas'); gc.width = gc.height = 48; const gcx = gc.getContext('2d'); const ggr = gcx.createRadialGradient(24, 24, 1, 24, 24, 24); ggr.addColorStop(0, 'rgba(255,255,255,0.95)'); ggr.addColorStop(1, 'rgba(255,255,255,0)'); gcx.fillStyle = ggr; gcx.fillRect(0, 0, 48, 48); const glowTex = new THREE.CanvasTexture(gc)
        const goldMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd6a0, transparent: true, opacity: isNight ? 0.82 : 0.42, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })
        for (let mx = 100; mx <= 520; mx += 13) { const sp = new THREE.Sprite(goldMat); sp.position.set(mx, SEA.level + 1.4, -44); sp.scale.set(5.4, 5.4, 1); town.add(sp) }       // 東＝江戸への海路の光点（唯一残す導線）
      }
      // ── 別世界の演出: 時代の気配（舞う粒子）＋霞の帯（くぐると世界が変わる関門）──
      {
        // 粒子用の柔らかい円テクスチャ（map無しのPointsMaterialは「四角い点」になり昼間に眼障りになる＝必ず丸くする）
        const fdc = document.createElement('canvas'); fdc.width = fdc.height = 32; const fdx = fdc.getContext('2d'); const fdg = fdx.createRadialGradient(16, 16, 0, 16, 16, 16); fdg.addColorStop(0, 'rgba(255,255,255,1)'); fdg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); fdg.addColorStop(1, 'rgba(255,255,255,0)'); fdx.fillStyle = fdg; fdx.fillRect(0, 0, 32, 32); const fxDot = new THREE.CanvasTexture(fdc)
        const mkFx = (cx, cz, count, spread, col, sz) => {
          const g = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), ph = new Float32Array(count)
          for (let i = 0; i < count; i++) { pos[i * 3] = cx + (R() - 0.5) * spread; pos[i * 3 + 1] = SEA.level + 4 + R() * 46; pos[i * 3 + 2] = cz + (R() - 0.5) * spread; ph[i] = R() * 6.28 }
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          const m = new THREE.PointsMaterial({ map: fxDot, color: col, size: sz, transparent: true, opacity: 0, depthWrite: false, fog: true, sizeAttenuation: true, blending: isNight ? THREE.AdditiveBlending : THREE.NormalBlending })
          const pts = new THREE.Points(g, m); pts.frustumCulled = false; town.add(pts)
          return { pts, g, m, ph, y0: SEA.level + 4, yH: 46 }
        }
        edoFx = mkFx(EDO.x, EDO.z, 160, 200, isNight ? 0xffe0a0 : 0xf2bcce, isNight ? 2.5 : 2.1) // 江戸: 夜=蛍/昼=桜の花びら（大きくゆっくり＝ノスタルジー）
        senFx = mkFx(SENGOKU.x, SENGOKU.z, 130, 110, isNight ? 0xffb060 : 0xcaa978, 2.0)          // 戦国: 夜=篝火の火の粉（昇る）/昼=淡い暖色の塵
        taiFx = mkFx(TAISHO.x, TAISHO.z, 150, 170, isNight ? 0xffd2a0 : 0xf0c2a4, 2.3)             // 大正: 夜=ガス灯の灯の粉/昼=潮風に舞う花びら
        const mc = document.createElement('canvas'); mc.width = mc.height = 64; const mcx = mc.getContext('2d'); const mg = mcx.createRadialGradient(32, 32, 1, 32, 32, 32); mg.addColorStop(0, 'rgba(255,255,255,0.8)'); mg.addColorStop(1, 'rgba(255,255,255,0)'); mcx.fillStyle = mg; mcx.fillRect(0, 0, 64, 64); const mistTex = new THREE.CanvasTexture(mc)
        const mistMat = new THREE.SpriteMaterial({ map: mistTex, color: 0xeef2f6, transparent: true, opacity: 0.42, depthWrite: false, fog: true })
        const band = (cx, cz, axis) => { for (let i = 0; i < 10; i++) { const o = (i - 4.5) * 11, sp = new THREE.Sprite(mistMat); axis === 'x' ? sp.position.set(cx, SEA.level + 7 + R() * 14, cz + o) : sp.position.set(cx + o, SEA.level + 7 + R() * 14, cz); sp.scale.set(30, 22, 1); town.add(sp) } }
        band(EDO.x - 129, EDO.z, 'x'); band(SENGOKU.x, SENGOKU.z + 129, 'z'); band(TAISHO.x + 129, TAISHO.z, 'x') // 江戸/戦国/大正の関門（接近路 d≈129 に漂う霧のかたまり＝くぐると別世界。中心から導出し追従）
      }
      // 防波堤（汀から海へ伸びる一本。コンクリの天端を1メッシュへ）
      const jz = -26, jStartX = 80, jEndX = 100, jetGeos = []
      for (let x = jStartX; x <= jEndX; x += 2) { const seg = new THREE.BoxGeometry(2.4, 2.0, 5.2); seg.applyMatrix4(new THREE.Matrix4().makeTranslation(x, SEA.level + 0.4, jz)); jetGeos.push(seg) }
      if (BufferGeometryUtils.mergeGeometries) { const jm = BufferGeometryUtils.mergeGeometries(jetGeos, false); if (jm) { const jetty = new THREE.Mesh(jm, toon(0x9a958c)); jetty.castShadow = true; jetty.receiveShadow = true; town.add(jetty) } }
      jetGeos.forEach((g) => g.dispose())
      // 灯台（防波堤の先端。白に紅帯・上に灯り）
      {
        const lx = jEndX, lz = jz, lan = new THREE.Group(); lan.position.set(lx, SEA.level + 1.4, lz); town.add(lan)
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 8, 14), toon(0xeae6dc)); tower.position.y = 4; tower.castShadow = true; lan.add(tower); lan.add(addOutline(tower))
        for (const by of [2.6, 5.4]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(1.28 - by * 0.06, 1.34 - by * 0.06, 1.1, 14), toon(0xc24a33)); band.position.y = by; lan.add(band) } // 紅帯
        const room = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 1.6, 12), toon(0x6a747c)); room.position.y = 8.6; lan.add(room) // 灯室
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: true })); lamp.position.y = 8.6; lan.add(lamp) // 灯り（昼も明るく夜は際立つ）
        const cap = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.0, 12), toon(0x3a4248)); cap.position.y = 9.95; lan.add(cap)
        // 光芒（夜に回る扇状の光。加算で淡く。灯室の高さで回る）
        const beam = new THREE.Group(); beam.position.y = 8.6; lan.add(beam); lightBeam = beam
        const beamOp = 0.04 + duskAmt * 0.16
        const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: beamOp, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
        for (const ang of [0, Math.PI]) { const bg = new THREE.ConeGeometry(2.2, 20, 4, 1, true); bg.rotateZ(Math.PI / 2); bg.translate(10, 0, 0); const bm = new THREE.Mesh(bg, beamMat); bm.rotation.y = ang; bm.scale.set(1, 0.25, 1); beam.add(bm) } // 横に倒した細い扇＝水面を撫でる光
        colliders.push({ x: lx, z: lz, r: 1.6 })
      }
      // 小舟（岸近くに数艘。ゆるく浮かんで揺れる）
      const boatCols = [0xc7b48a, 0xb0563f, 0x6f8aa6]
      for (const bp of [[86, -12], [91, -42], [84, -54], [95, -22]]) {
        const bg = new THREE.Group(); bg.position.set(bp[0], SEA.level + 0.15, bp[1]); bg.rotation.y = R() * 6.28; bg.userData = { ph: R() * 6.28 }; town.add(bg)
        const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.4, 4, 8), toon(boatCols[(R() * boatCols.length) | 0])); hull.rotation.x = Math.PI / 2; hull.scale.set(1, 0.5, 1); hull.position.y = 0.2; bg.add(hull)
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.9), toon(0xe6e0d4)); cabin.position.set(0, 0.5, -0.5); bg.add(cabin)
        boats.push(bg)
      }
      // 砂浜（汀の帯。海岸線に沿って砂色の敷きを置く＝丘と海の境をやわらげる。冬は雪の渚）
      const shoreXat = (z) => { let lo = SEA.coast, hi = SEA.shore + 12; for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (heightAt(m, z) > SEA.level) lo = m; else hi = m } return (lo + hi) / 2 }
      const beachMat = toon(season === 'winter' ? 0xe6ebf0 : 0xd9c79c)
      const beachGeos = []
      for (let z = 26; z > -98; z -= 2.3) { const sx = shoreXat(z); const cxb = sx - 2.0; const gy = heightAt(cxb, z); const seg = new THREE.BoxGeometry(6.0, 0.16, 2.5); seg.applyMatrix4(new THREE.Matrix4().makeTranslation(cxb, gy + 0.05, z)); beachGeos.push(seg) }
      if (BufferGeometryUtils.mergeGeometries) { const bm2 = BufferGeometryUtils.mergeGeometries(beachGeos, false); if (bm2) { const beach = new THREE.Mesh(bm2, beachMat); beach.receiveShadow = true; town.add(beach) } }
      beachGeos.forEach((g) => g.dispose())
    }

    // ── 臨海の港（埋立地の工業の岸）。倉庫・紅白の煙突・ガントリークレーン・ガスタンク・コンテナ。──
    {
      const hx = HARBOR.x, hz = HARBOR.z, padY = HARBOR.padY
      const metal = toon(0x8a939a), metal2 = toon(0xb0aaa0), frameMat = toon(0x596169), tankMat = toon(0xc6cace)
      const lit = duskAmt > 0.2 // 夕夜は工場夜景の灯り（窓・投光器・作業灯）
      const warmLight = new THREE.MeshBasicMaterial({ color: 0xffd28a, fog: true }), coolLight = new THREE.MeshBasicMaterial({ color: 0xdfeaff, fog: true }), tealLight = new THREE.MeshBasicMaterial({ color: 0x86e0d4, fog: true })
      // 埋立地の舗装（コンクリの盤）。平らな緑地でなく工業の岸に見せる。
      const padDisc = new THREE.Mesh(new THREE.CircleGeometry(HARBOR.r - 0.4, 30), toon(season === 'winter' ? 0xb8bcc0 : 0x8e8c87)); padDisc.rotateX(-Math.PI / 2); padDisc.position.set(hx, padY + 0.04, hz); padDisc.receiveShadow = true; town.add(padDisc)
      // 倉庫×2（金属の長い陸屋根＋シャッター。夕夜は窓が灯る）
      for (const w of [[-5, 3, 8, 5.5, 4.2], [-6, -5, 6.5, 4.5, 3.6]]) {
        const g = new THREE.Group(); g.position.set(hx + w[0], padY, hz + w[1]); town.add(g)
        const body = new THREE.Mesh(new THREE.BoxGeometry(w[2], w[4], w[3]), metal2); body.position.y = w[4] / 2; body.castShadow = true; body.receiveShadow = true; g.add(body)
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w[2] + 0.3, 0.4, w[3] + 0.3), metal); roof.position.y = w[4] + 0.2; roof.castShadow = true; g.add(roof)
        const door = new THREE.Mesh(new THREE.BoxGeometry(w[2] * 0.4, w[4] * 0.7, 0.12), toon(0x3a3e42)); door.position.set(0, w[4] * 0.35, w[3] / 2 + 0.07); g.add(door)
        if (lit) for (let i = 0; i < 4; i++) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.08), warmLight); win.position.set((i - 1.5) * w[2] * 0.2, w[4] * 0.62, w[3] / 2 + 0.05); g.add(win) } // 灯る窓
        colliders.push({ x: hx + w[0], z: hz + w[1], r: Math.max(w[2], w[3]) / 2 })
      }
      // 投光器（照明塔）×3＝工場夜景の主役。背の高い柱の上で煌々と灯る。
      for (const fp of [[8, 6], [-9, -7], [3, -8]]) {
        const g = new THREE.Group(); g.position.set(hx + fp[0], padY, hz + fp[1]); town.add(g)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 11, 6), frameMat); pole.position.y = 5.5; pole.castShadow = true; g.add(pole)
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 0.3), frameMat); bar.position.y = 10.9; g.add(bar)
        for (const lx of [-0.7, 0, 0.7]) { const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), lit ? coolLight : toon(0x9aa0a4)); head.position.set(lx, 10.9, 0.1); g.add(head) } // 投光ヘッド（夕夜は白く灯る）
      }
      // 煙突×2（紅白の帯・天辺に赤灯・うっすら煙）
      for (const c of [[6.5, -3.5], [4, 4.5]]) {
        const g = new THREE.Group(); g.position.set(hx + c[0], padY, hz + c[1]); town.add(g)
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 16, 12), toon(0xe8e4dc)); stack.position.y = 8; stack.castShadow = true; g.add(stack)
        for (const by of [4, 8, 12]) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.72 - by * 0.012, 0.86 - by * 0.012, 1.3, 12), toon(0xc24a33)); band.position.y = by; g.add(band) }
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5a4a, fog: true })); tip.position.y = 16.4; g.add(tip)
        const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd8dde2, transparent: true, opacity: 0.16, depthWrite: false, fog: true })
        for (let s = 0; s < 3; s++) { const pf = new THREE.Mesh(new THREE.SphereGeometry(1.0 + s * 0.5, 7, 6), smokeMat); pf.position.set(0.4 + s * 0.5, 17.5 + s * 1.8, 0.2); g.add(pf) } // たなびく煙（淡い）
        colliders.push({ x: hx + c[0], z: hz + c[1], r: 1.1 })
      }
      // ガスタンク（球形・脚付き）
      {
        const g = new THREE.Group(); g.position.set(hx - 3, padY, hz + 7); town.add(g)
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), tankMat); sphere.position.y = 4.4; sphere.castShadow = true; g.add(sphere); g.add(addOutline(sphere))
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.4, 6), frameMat); leg.position.set(Math.cos(a) * 2.4, 1.7, Math.sin(a) * 2.4); g.add(leg) }
        if (lit) for (const a of [0.5, 2.6, 4.7]) { const sl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), tealLight); sl.position.set(Math.cos(a) * 3.05, 4.4 + Math.sin(a) * 1.5, Math.sin(a) * 3.05); g.add(sl) } // 球面の保安灯（青緑）
        colliders.push({ x: hx - 3, z: hz + 7, r: 3.3 })
      }
      // ガントリークレーン（門型・水際へブームを張り出す）
      {
        const g = new THREE.Group(); g.position.set(hx + 9, padY, hz - 1); town.add(g)
        for (const lx of [-3, 3]) for (const lz of [-2, 2]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 12, 0.4), frameMat); leg.position.set(lx, 6, lz); leg.castShadow = true; g.add(leg) }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(7, 0.7, 1.0), frameMat); beam.position.set(0, 12, 0); g.add(beam)
        const boom = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 0.7), frameMat); boom.position.set(5.5, 12.7, 0); boom.castShadow = true; g.add(boom) // 海側へ張り出す
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.3), toon(0xc24a33)); cab.position.set(0, 11.1, 0); g.add(cab)
        if (lit) { for (const bx2 of [-5.5, 0, 11]) { const wl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), warmLight); wl.position.set(bx2, 12.0, 0.4); g.add(wl) } const rb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff5a4a, fog: true })); rb.position.set(0, 12.9, 0); g.add(rb) } // 作業灯＋頂部の赤灯
        // 動くトロリー＋吊りケーブル＋フック（荷役の動き）
        const trolley = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.1), toon(0x9a3f34)); trolley.position.set(5.5, 12.0, 0); g.add(trolley)
        const hcable = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1, 0.07), toon(0x33333a)); hcable.position.set(5.5, 9, 0); g.add(hcable)
        const hook = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), toon(0x46423a)); hook.position.set(5.5, 6, 0); g.add(hook)
        crane = { trolley, hcable, hook }
        colliders.push({ x: hx + 9, z: hz - 1, r: 4 })
      }
      // コンテナ（色とりどりの箱を積む）
      const contCols = [0xc24a33, 0x3a6a8a, 0x5a8a5a, 0xd0a040, 0xaa5a3a, 0x6a6a72]
      for (let i = 0; i < 9; i++) { const ox = -9 + (i % 5) * 2.6, oz = -8.5 + ((i / 5) | 0) * 2.4; const stack = 1 + ((R() * 2.4) | 0); for (let s = 0; s < stack; s++) { const ct = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.0), toon(contCols[(R() * contCols.length) | 0])); ct.position.set(hx + ox, padY + 0.6 + s * 1.25, hz + oz); ct.castShadow = true; town.add(ct) } }
      // 貨物船（岸壁に着けた一隻＝港の主役）。船体・甲板・船橋・煙突・甲板のコンテナ。
      {
        const g = new THREE.Group(); g.position.set(hx + 13, SEA.level, hz - 1); g.userData = { ph: R() * 6.28 }; town.add(g) // 船腹を岸(z方向)と平行に＝長軸z
        const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 19), toon(0x9a3f34)); hull.position.y = 1.3; hull.castShadow = true; g.add(hull)
        const deck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.6, 19.2), toon(0x4a4640)); deck.position.y = 2.8; g.add(deck)
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3, 3.6), toon(0xe6e0d4)); bridge.position.set(0, 4.5, -6.5); bridge.castShadow = true; g.add(bridge)
        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.72, 2.4, 10), toon(0xc24a33)); funnel.position.set(0, 5.2, -8.2); g.add(funnel)
        for (let i = 0; i < 5; i++) { const ct = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 2.5), toon(contCols[(R() * contCols.length) | 0])); ct.position.set(0, 3.75, 5 - i * 2.7); ct.castShadow = true; g.add(ct) }
        boats.push(g)
      }
      // タグボート（湾を行き来する曳船。小さな船体＋背の高い操舵室＋煙突）
      {
        tug = new THREE.Group(); tug.position.set(92, SEA.level + 0.2, -56); town.add(tug)
        const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 2.6, 4, 8), toon(0x2a4a6a)); hull.rotation.x = Math.PI / 2; hull.scale.set(1, 0.55, 1); hull.position.y = 0.3; tug.add(hull)
        const deck = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 3.4), toon(0x8a4030)); deck.position.y = 0.7; tug.add(deck)
        const house = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.8), toon(0xeae2d0)); house.position.set(0, 1.5, 0.2); house.castShadow = true; tug.add(house)
        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 1.0, 8), toon(0xc24a33)); funnel.position.set(0, 2.0, -1.0); tug.add(funnel)
        tug.userData = { cx: 92, cz: -56, rad: 13 }
      }
      // 連絡船（湾を大きな楕円で渡る客船。二層の甲板・窓・煙突。夜は窓が灯る）
      {
        ferry = new THREE.Group(); ferry.position.set(88, SEA.level + 0.2, -38); town.add(ferry)
        const hull = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.0, 2.8), toon(0x2f5a86)); hull.position.y = 1.0; hull.castShadow = true; ferry.add(hull)
        const hullTop = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 2.9), toon(0xeae4d6)); hullTop.position.y = 2.1; ferry.add(hullTop)
        const deck1 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.5, 2.4), toon(0xf0ece2)); deck1.position.set(-0.3, 3.1, 0); deck1.castShadow = true; ferry.add(deck1)
        const deck2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 2.1), toon(0xf0ece2)); deck2.position.set(-0.6, 4.4, 0); ferry.add(deck2)
        const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 2.0), toon(0xe2dccf)); wheelhouse.position.set(2.4, 3.0, 0); ferry.add(wheelhouse) // 船橋（前方）
        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 1.8, 10), toon(0xc24a33)); funnel.position.set(-1.4, 5.4, 0); ferry.add(funnel)
        const winMat = duskAmt > 0.2 ? new THREE.MeshBasicMaterial({ color: 0xffe6b0, fog: true }) : toon(0x39474f)
        for (const dy of [3.1, 4.4]) for (const dz of [-1.16, 1.16]) { const w = new THREE.Mesh(new THREE.BoxGeometry(dy > 4 ? 3.8 : 5.6, 0.6, 0.05), winMat); w.position.set(-0.4, dy, dz); ferry.add(w) }
        ferry.userData = { cx: 88, cz: -46, rx: 15, rz: 17 }
      }
      spawnAvoid.push({ x: hx, z: hz, r: HARBOR.r })
    }

    // ── 港の大橋（湾を渡る斜張橋）と小島。海上の目印・飛んでくぐれる。──
    {
      const BZ = ISLAND.z, A = 72, B = ISLAND.x - 2 // 橋の両端x（A=岸、B=島の手前）
      const Ay = heightAt(A, BZ) + 0.6, By = heightAt(B, BZ) + 0.6, span = B - A
      const deckY = (x) => { const t = Math.max(0, Math.min(1, (x - A) / span)); return Ay + (By - Ay) * t + Math.sin(Math.PI * t) * 7 }
      const deckMat = toon(0xc4c0b6), towerMat = toon(0xd6d0c4), cableMat = toon(0x70747a)
      const lit2 = duskAmt > 0.2, warm2 = new THREE.MeshBasicMaterial({ color: 0xffd28a, fog: true })
      // 橋桁（弧を描く床版）＋欄干（1メッシュへ）
      const deckGeos = [], railGeos = []
      for (let x = A; x <= B; x += 1.4) {
        const y = deckY(x), slope = deckY(x + 0.7) - deckY(x - 0.7)
        const seg = new THREE.BoxGeometry(1.5, 0.45, 4.4); seg.rotateZ(-Math.atan2(slope, 1.4)); seg.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, BZ)); deckGeos.push(seg)
        for (const rz of [-2.1, 2.1]) { const r = new THREE.BoxGeometry(1.5, 0.5, 0.12); r.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y + 0.5, BZ + rz)); railGeos.push(r) }
      }
      if (BufferGeometryUtils.mergeGeometries) {
        const dm = BufferGeometryUtils.mergeGeometries(deckGeos, false); if (dm) { const deck = new THREE.Mesh(dm, deckMat); deck.castShadow = true; deck.receiveShadow = true; town.add(deck) }
        const rmg = BufferGeometryUtils.mergeGeometries(railGeos, false); if (rmg) town.add(new THREE.Mesh(rmg, deckMat))
      }
      deckGeos.concat(railGeos).forEach((g) => g.dispose())
      // 主塔×2（H型・海面から立つ）＋扇状のケーブル
      for (const tx of [A + span * 0.32, A + span * 0.68]) {
        const dY = deckY(tx), topY = dY + 17, legBot = SEA.level - 1, legH = topY - legBot
        const g = new THREE.Group(); g.position.set(tx, 0, BZ); town.add(g)
        for (const lz of [-2.4, 2.4]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.72, legH, 8), towerMat); leg.position.set(0, legBot + legH / 2, lz); leg.castShadow = true; g.add(leg) }
        const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 5.4), towerMat); cross1.position.set(0, dY + 0.2, 0); g.add(cross1)
        const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 5.4), towerMat); cross2.position.set(0, topY - 3, 0); g.add(cross2)
        for (const lz of [-2.4, 2.4]) for (const dxp of [-9, -5.5, 5.5, 9]) {
          const dx2 = tx + dxp, dy2 = deckY(dx2) + 0.4, cdy = dy2 - topY, clen = Math.hypot(dxp, cdy)
          const cable = new THREE.Mesh(new THREE.BoxGeometry(clen, 0.07, 0.07), cableMat); cable.position.set(dxp / 2, (topY + dy2) / 2, lz); cable.rotation.z = Math.atan2(cdy, dxp); g.add(cable)
        }
        if (lit2) { const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff5a4a, fog: true })); beacon.position.set(0, topY + 0.4, 0); g.add(beacon) }
        colliders.push({ x: tx, z: BZ, r: 2.8 })
      }
      // 橋の灯り（夕夜、橋桁に沿って暖色の点）
      if (lit2) for (let x = A + 2; x < B; x += 4) { const lp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), warm2); lp.position.set(x, deckY(x) + 0.7, BZ + 2.1); town.add(lp) }
      // 小島の造形（盛り上がった地面＋一本松＋岩＋灯標）
      {
        const ix = ISLAND.x, iz = ISLAND.z, iy = heightAt(ix, iz)
        tree(ix, iz + 1, 1.3 + R() * 0.4) // 島の一本松
        for (const rp of [[-3, -2, 1.0], [2.5, 2, 0.8], [3.2, -3, 0.7]]) { const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(rp[2], 0), toon(0x8a857c)); rk.position.set(ix + rp[0], heightAt(ix + rp[0], iz + rp[1]) + rp[2] * 0.4, iz + rp[1]); rk.castShadow = true; town.add(rk) }
        const beaconG = new THREE.Group(); beaconG.position.set(ix - 4, iy, iz - 2); town.add(beaconG)
        const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3.4, 8), toon(0xeae6dc)); bp.position.y = 1.7; beaconG.add(bp)
        const bband = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 8), toon(0xc24a33)); bband.position.y = 2.4; beaconG.add(bband)
        const blamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: true })); blamp.position.y = 3.6; beaconG.add(blamp)
        colliders.push({ x: ix, z: iz, r: 4 }); spawnAvoid.push({ x: ix, z: iz, r: 6 })
      }
    }

    // ── 磯・岩場（南の海岸の岩礁）＋白波、そして海鳥。海辺の自然を厚く。──
    {
      const rockMat = toon(0x7a756c), rockMat2 = toon(0x8c8378)
      const foamMat = new THREE.MeshBasicMaterial({ color: 0xeef2f4, transparent: true, opacity: 0.45, depthWrite: false, fog: true })
      const rocks = [[76, -14, 1.6], [79, -17, 2.2], [81, -20, 1.4], [77, -22, 1.9], [80.5, -25, 2.4], [78, -28, 1.7], [83, -18, 1.1], [75, -26, 1.3], [82, -23, 1.5], [79.5, -31, 2.0], [74.5, -20, 1.4], [84, -22, 0.9], [76.5, -33, 1.5]]
      for (const r of rocks) {
        const rx = r[0], rz = r[1], rs = r[2], gy = heightAt(rx, rz)
        const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(rs, 0), R() < 0.5 ? rockMat : rockMat2)
        rk.position.set(rx, Math.max(gy, SEA.level) + rs * 0.25, rz); rk.rotation.set(R() * 3, R() * 3, R() * 3); rk.scale.y = 0.66 + R() * 0.4; rk.castShadow = true; rk.receiveShadow = true; town.add(rk)
        if (gy < SEA.level + 0.6) { const foam = new THREE.Mesh(new THREE.CircleGeometry(rs * 1.6, 12), foamMat); foam.rotateX(-Math.PI / 2); foam.position.set(rx, SEA.level + 0.13, rz); town.add(foam) } // 水中の岩の根の白波
        if (gy > SEA.level - 1) colliders.push({ x: rx, z: rz, r: rs * 0.8 })
      }
      // 海鳥（かもめ。湾の上をゆるく旋回し、はばたく）
      gulls = []
      // かもめ脱ローポリ＝頭/くちばし/尾を足し、平らな箱の翼を「内羽(白・水平)＋外羽(灰・上へ折る)」の2節でMシルエットに。
      // 胴/頭/尾は白1メッシュに統合・材は共有＝描画コール節約。翼はgroupで羽ばたく。
      const gullWhite = toon(0xf4f2ec), gullGray = toon(0xb6bcc6), gullBeak = toon(0xe0a23a)
      const gullBuild = () => {
        const g = new THREE.Group()
        const bGeo = new THREE.CapsuleGeometry(0.12, 0.52, 3, 6); bGeo.rotateZ(Math.PI / 2)       // 胴（長軸=x）
        const hGeo = new THREE.SphereGeometry(0.12, 7, 6); hGeo.translate(0.36, 0.03, 0)           // 頭（前=+x）
        const tGeo = new THREE.BoxGeometry(0.22, 0.04, 0.32); tGeo.translate(-0.36, 0, 0)          // 尾（後=-x）
        let body = bGeo
        if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries([bGeo.toNonIndexed(), hGeo.toNonIndexed(), tGeo.toNonIndexed()], false); if (m) body = m }
        g.add(new THREE.Mesh(body, gullWhite))
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 5), gullBeak); beak.rotation.z = -Math.PI / 2; beak.position.set(0.5, 0.02, 0); g.add(beak) // くちばし
        const wings = []
        for (const s of [1, -1]) { const wing = new THREE.Group()
          wing.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.66), gullWhite)).position.z = s * 0.42         // 内羽（水平）
          const outer = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.72), gullGray); outer.position.set(0, 0.05, s * 1.02); outer.rotation.x = -s * 0.5; wing.add(outer) // 外羽（上へ折る＝かもめのM）
          g.add(wing); wings.push(wing) }
        g.userData = { wings }
        return g
      }
      for (let i = 0; i < 6; i++) { const g = gullBuild(); Object.assign(g.userData, { cx: 88 + R() * 16, cz: -42 + (R() - 0.5) * 56, rad: 6 + R() * 10, y: SEA.level + 9 + R() * 11, sp: (R() < 0.5 ? 1 : -1) * (0.18 + R() * 0.16), ph: R() * 6.28 }); scene.add(g); gulls.push(g) }
      const mkGull = (cx, cz) => { const g = gullBuild(); Object.assign(g.userData, { cx, cz, rad: 7 + R() * 12, y: SEA.level + 12 + R() * 16, sp: (R() < 0.5 ? 1 : -1) * (0.16 + R() * 0.14), ph: R() * 6.28 }); scene.add(g); gulls.push(g) }
      for (let i = 0; i < 7; i++) mkGull(160 + R() * 360, -44 + (R() - 0.5) * 50) // 東(江戸)への長い渡りの海鳥
      for (let i = 0; i < 6; i++) mkGull(140 + (R() - 0.5) * 50, -180 - R() * 360) // 北(戦国)への渡りの海鳥
      for (let i = 0; i < 5; i++) mkGull(-260 - R() * 320, -30 + (R() - 0.5) * 50) // 西(大正)への渡りの海鳥
    }

    // ── 海釣りの桟橋（南の海へ伸びる木の桟橋）＋釣り人。静かな海辺の暮らし。──
    {
      const pz = -5, x0 = 73, x1 = 92, deckY = SEA.level + 2
      const woodMat = toon(0x9a7a52), pileMat = toon(0x6a5238), railMat = toon(0x866a48)
      const deckGeos = [], railGeos = []
      for (let x = x0; x <= x1; x += 1.1) { const seg = new THREE.BoxGeometry(1.2, 0.18, 3.0); seg.applyMatrix4(new THREE.Matrix4().makeTranslation(x, deckY, pz)); deckGeos.push(seg) }
      for (let x = x0; x <= x1; x += 2.2) for (const rz of [-1.4, 1.4]) { const post = new THREE.BoxGeometry(0.1, 0.7, 0.1); post.applyMatrix4(new THREE.Matrix4().makeTranslation(x, deckY + 0.42, pz + rz)); railGeos.push(post); const top = new THREE.BoxGeometry(2.2, 0.08, 0.08); top.applyMatrix4(new THREE.Matrix4().makeTranslation(x + 1.1, deckY + 0.78, pz + rz)); railGeos.push(top) }
      if (BufferGeometryUtils.mergeGeometries) {
        const dm = BufferGeometryUtils.mergeGeometries(deckGeos, false); if (dm) { const deck = new THREE.Mesh(dm, woodMat); deck.castShadow = true; deck.receiveShadow = true; town.add(deck) }
        const rm = BufferGeometryUtils.mergeGeometries(railGeos, false); if (rm) town.add(new THREE.Mesh(rm, railMat))
      }
      deckGeos.concat(railGeos).forEach((g) => g.dispose())
      // 杭（水中へ）
      const pileH = deckY - (SEA.level - 3)
      for (let x = x0 + 1; x <= x1; x += 3.6) for (const dz of [-1.3, 1.3]) { const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, pileH, 6), pileMat); pile.position.set(x, deckY - pileH / 2 + 0.1, pz + dz); pile.castShadow = true; town.add(pile) }
      // 釣り人×3（桟橋の先で海へ竿を垂れる）。腰掛け＋体＋頭＋竿＋バケツ。
      const skinMat = toon(0xf0c49c), rodMat = toon(0x40382c)
      for (const ap of [[87, 1.0], [89.5, -0.8], [84, 1.2]]) {
        const ax = ap[0], az = pz + ap[1], g = new THREE.Group(); g.position.set(ax, deckY + 0.18, az); town.add(g)
        const stool = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), toon(0x6a5238)); stool.position.y = 0.2; g.add(stool)
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 3, 6), toon([0x5a78a0, 0x6a8a5a, 0xb0894a][(R() * 3) | 0])); body.position.y = 0.85; body.castShadow = true; g.add(body)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), skinMat); head.position.y = 1.32; g.add(head)
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.1, 10), toon(0xcfc6a8)); hat.position.y = 1.46; g.add(hat) // 麦わら帽
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 4.2, 4), rodMat); rod.position.set(1.6, 1.6, 0); rod.rotation.z = -0.7; g.add(rod) // 海へ伸びる竿
        const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.4, 8), toon(0x9aa0a4)); bucket.position.set(-0.5, 0.2, 0.2); g.add(bucket)
      }
      spawnAvoid.push({ x: (x0 + x1) / 2, z: pz, r: 12 }) // 桟橋・海上には降りない
      // 魚が時々跳ねる（桟橋・磯のあたりの海面）＋広がる波紋。海辺の生き物の気配。
      const fishMat = toon(0xa8c0cc), rippleMat = new THREE.MeshBasicMaterial({ color: 0xeef2f4, transparent: true, opacity: 0.4, depthWrite: false, fog: true })
      for (const sp of [[89, -10], [93, -24], [87, -34], [95, -15], [91, -45]]) {
        const fish = new THREE.Group(); fish.visible = false; town.add(fish)
        const bodyF = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.66, 3, 6), fishMat); bodyF.rotation.z = Math.PI / 2; fish.add(bodyF)
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.42, 4), fishMat); tail.rotation.z = -Math.PI / 2; tail.position.x = -0.58; fish.add(tail)
        const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 5, 18), rippleMat.clone()); ripple.rotation.x = -Math.PI / 2; ripple.position.set(sp[0], SEA.level + 0.12, sp[1]); ripple.visible = false; town.add(ripple)
        fishJumps.push({ fish, ripple, x: sp[0], z: sp[1], t0: R() * 8, period: 6 + R() * 5, jumpDur: 1.1 })
      }
    }

    // ── 砂浜の海の家＋ビーチパラソル＋浮き輪。夏の海辺の賑わい。──
    {
      const bx = 71, bz = -36, by = heightAt(bx, bz) // 砂浜の上（汀の手前の乾いた砂）
      // 海の家（板の小屋＋庇＋暖簾）。海(+x)へ開く。
      const hut = new THREE.Group(); hut.position.set(bx, by, bz); town.add(hut)
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 4), toon(0xcdb185)); body.position.y = 1.3; body.castShadow = true; body.receiveShadow = true; hut.add(body)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 4.8), toon(0x9a6a4e)); roof.position.y = 2.7; roof.castShadow = true; hut.add(roof)
      const eave = new THREE.Mesh(new THREE.BoxGeometry(5, 0.18, 1.8), toon(0x9a6a4e)); eave.position.set(2.4, 2.2, 0); hut.add(eave) // 海側の庇
      for (const pz of [-1.7, 1.7]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.0, 6), toon(0x7a5a40)); post.position.set(3.0, 1.0, pz); hut.add(post) }
      // 暖簾（青の布）
      const nc = document.createElement('canvas'); nc.width = 96; nc.height = 40; const ncx = nc.getContext('2d')
      ncx.fillStyle = '#3a6a8a'; ncx.fillRect(0, 0, 96, 40); ncx.fillStyle = '#f0ece0'; ncx.font = 'bold 22px sans-serif'; ncx.textAlign = 'center'; ncx.textBaseline = 'middle'; ncx.fillText('うみのいえ', 48, 21)
      const norenTex = new THREE.CanvasTexture(nc); const noren = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 3.2), duskAmt > 0.2 ? new THREE.MeshBasicMaterial({ map: norenTex, fog: true }) : new THREE.MeshToonMaterial({ map: norenTex, gradientMap: grad, fog: true })); noren.position.set(2.4, 1.7, 0); hut.add(noren) // 昼夕=陰影付き/夜=灯る
      colliders.push({ x: bx, z: bz, r: 2.6 }); spawnAvoid.push({ x: bx, z: bz, r: 4 }) // 着地は海の家に被らない
      // ビーチパラソル＋浮き輪＋ビーチボール（冬は仕舞う）
      if (season !== 'winter') {
        const paraCols = [[0xd84a4a, 0xf0ece0], [0x3a8ac0, 0xf0ece0], [0xe0a030, 0xf0ece0]]
        for (const pp of [[74, -32], [76, -38], [73.5, -40]]) {
          const px2 = pp[0], pz2 = pp[1], pgy = heightAt(px2, pz2)
          const g = new THREE.Group(); g.position.set(px2, pgy, pz2); town.add(g)
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), toon(0xdedacc)); pole.position.y = 1.3; g.add(pole)
          const cols = paraCols[(R() * paraCols.length) | 0]
          const rc = document.createElement('canvas'); rc.width = 32; rc.height = 8; const rcx = rc.getContext('2d')
          for (let i = 0; i < 8; i++) { rcx.fillStyle = '#' + new THREE.Color(i % 2 ? cols[0] : cols[1]).getHexString(); rcx.fillRect(i * 4, 0, 4, 8) }
          const rtex = new THREE.CanvasTexture(rc); rtex.wrapS = THREE.RepeatWrapping; rtex.repeat.set(4, 1)
          const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.8, 12), new THREE.MeshToonMaterial({ map: rtex, gradientMap: grad })); top.position.y = 2.7; top.castShadow = true; g.add(top)
        }
        // 浮き輪（水面に浮かぶ・揺れる）
        const ring = new THREE.Group(); ring.position.set(80, SEA.level + 0.15, -34); ring.userData = { ph: R() * 6.28 }; town.add(ring)
        const tube = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.26, 8, 16), toon(0xe24a4a)); tube.rotation.x = Math.PI / 2; ring.add(tube)
        for (let i = 0; i < 4; i++) { const a = i / 4 * 6.283; const wseg = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.27, 8, 4, 0.8), toon(0xf0ece0)); wseg.rotation.x = Math.PI / 2; wseg.rotation.z = a; ring.add(wseg) }
        boats.push(ring) // 波で揺れる
        // ビーチボール
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), toon(0xf0c040)); ball.position.set(75, heightAt(75, -34) + 0.5, -34); ball.castShadow = true; town.add(ball)
      }
    }

    // ── 川辺の遊歩道（東岸の護岸の上を歩ける帯）。路面＋手すり＋街灯＋ベンチ＋並木。──
    {
      const px = RIVER.x + 4.0          // 東岸の遊歩道の中心（護岸の上）
      const railX = RIVER.x + 2.5       // 川側の手すり（路面の水際）
      const zTop = 18, zEnd = -86, dz = 2.2
      // 路面（地面に沿わせた敷石。1メッシュへ）
      const pathGeos = []
      for (let z = zTop; z > zEnd; z -= dz) { const gy = heightAt(px, z); const seg = new THREE.BoxGeometry(3.6, 0.12, dz + 0.1); seg.applyMatrix4(new THREE.Matrix4().makeTranslation(px, gy + 0.06, z)); pathGeos.push(seg) }
      if (BufferGeometryUtils.mergeGeometries) { const pm = BufferGeometryUtils.mergeGeometries(pathGeos, false); if (pm) { const path = new THREE.Mesh(pm, toon(0xbab2a4)); path.receiveShadow = true; town.add(path) } }
      pathGeos.forEach((g) => g.dispose())
      // 手すり（川側。親柱＋上桟を1メッシュへ）
      const railGeos = []
      for (let z = zTop; z > zEnd; z -= 2.0) { const gy = heightAt(px, z); const post = new THREE.BoxGeometry(0.1, 0.9, 0.1); post.applyMatrix4(new THREE.Matrix4().makeTranslation(railX, gy + 0.45, z)); railGeos.push(post); const top = new THREE.BoxGeometry(0.09, 0.09, 2.0); top.applyMatrix4(new THREE.Matrix4().makeTranslation(railX, gy + 0.85, z - 1.0)); railGeos.push(top) }
      if (BufferGeometryUtils.mergeGeometries) { const rm = BufferGeometryUtils.mergeGeometries(railGeos, false); if (rm) { const rail = new THREE.Mesh(rm, toon(0x8a8478)); rail.castShadow = true; town.add(rail) } }
      railGeos.forEach((g) => g.dispose())
      // 街灯（夕夜は灯る）
      const litHead = duskAmt > 0.2 ? new THREE.MeshBasicMaterial({ color: 0xffce86, fog: true }) : toon(0xb8b4a0)
      for (let z = 12; z > zEnd + 4; z -= 16) { const gy = heightAt(px + 1.3, z); const lp = new THREE.Group(); lp.position.set(px + 1.3, gy, z); town.add(lp); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), toon(0x4a4a4e)); pole.position.y = 1.7; pole.castShadow = true; lp.add(pole); const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), litHead); head.position.y = 3.5; lp.add(head) }
      // ベンチ（川を向く＝-x側を向く）
      for (let z = 4; z > zEnd + 6; z -= 22) { const gy = heightAt(px + 0.6, z); const bg = new THREE.Group(); bg.position.set(px + 0.6, gy, z); bg.rotation.y = -Math.PI / 2; town.add(bg); const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.46), toon(0x8a6a48)); seat.position.y = 0.46; seat.castShadow = true; bg.add(seat); const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 0.1), toon(0x8a6a48)); back.position.set(0, 0.72, -0.2); bg.add(back) }
      // 並木（町側の縁。川沿いの立ち木）
      for (let z = 9; z > zEnd; z -= 9) tree(px + 2.7, z, 0.8 + R() * 0.5)
    }
  }

  // ── 谷戸の中身（棚田・茅葺の横溝屋敷・屋敷林・せせらぎ・点在する農家）。谷戸のみ。 ──
  if (kind === 'yato') {
    // ── 谷の入口の田の神の祠。田畑を見守る小さな石の祠＋供えられた一輪＝里の祈りの気配（人の不在の現前）。
    //    実在の獅子ヶ谷の谷戸に、固有名を出さず情緒として。説明文は置かない（歩いて気づく）。雲海/home の痕跡を谷戸へ。
    { const fx = 8.5, fz = 6, fy = heightAt(fx, fz)
      if (fy > SEA.level + 0.3 && !blockedAt(fx, fz)) {
        const hok = new THREE.Group(); hok.position.set(fx, fy, fz); hok.rotation.y = -2.2 // 谷（棚田）の方へ向く
        const stone = toon(0x9c988e), wood = toon(0x5a4636), roofM = toon(0x6e5d44), darkM = toon(0x241c17)
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.22, 0.54), stone); base.position.y = 0.11; base.castShadow = true; hok.add(base) // 台石
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.36), wood); body.position.y = 0.45; body.castShadow = true; hok.add(body) // 祠の身舎
        const dook = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.04), darkM); dook.position.set(0, 0.42, 0.185); hok.add(dook) // 暗い内陣
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 4), roofM); roof.position.y = 0.83; roof.rotation.y = Math.PI / 4; roof.castShadow = true; hok.add(roof) // 寄棟の小屋根
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4), toon(0x5a7a3a)); stem.position.set(0.1, 0.33, 0.32); hok.add(stem)
        const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0xe8c060)); bloom.position.set(0.1, 0.45, 0.32); hok.add(bloom) // 供えられた一輪（菜の花色）
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.06, 8), stone); cup.position.set(-0.12, 0.25, 0.3); hok.add(cup) // 水を供える小さな器
        town.add(hok)
      } }
    // 棚田: 谷底に水田と青田が並ぶ。畦道は区画の隙間で表す。
    // 水鏡: 平板な水色でなく「空・地平・朝日を映す水面」に。情景の空色のグラデ＋斜めの陽の照り返し＋さざ波を
    // 描き、自発光のように明るいMeshBasicで反射の質感を出す（評価指摘: 今は空を映さない平板な板）。
    const makeWaterMirror = (sunStrength) => {
      const c = document.createElement('canvas'); c.width = c.height = 64
      const cx = c.getContext('2d')
      const top = '#' + new THREE.Color(0x6ea2c4).lerp(skyTop, 0.32).getHexString()    // 上＝空を映す水面（はっきりした水色）
      const bot = '#' + new THREE.Color(0x46708e).lerp(skyHorizon, 0.18).getHexString() // 下(手前)＝深い水
      const g = cx.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, top); g.addColorStop(1, bot)
      cx.fillStyle = g; cx.fillRect(0, 0, 64, 64)
      const sun = '#' + sunCol.clone().lerp(new THREE.Color(0xffffff), 0.2).getHexString() // 暖色の照り返し（白にしない）
      const sg = cx.createLinearGradient(22, 64, 42, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, sun); sg.addColorStop(1, 'rgba(255,255,255,0)')
      cx.globalAlpha = sunStrength; cx.fillStyle = sg; cx.fillRect(0, 0, 64, 64); cx.globalAlpha = 1
      for (let i = 0; i < 40; i++) { cx.fillStyle = `rgba(255,255,255,${0.05 + R() * 0.05})`; cx.fillRect(R() * 64, R() * 64, 1 + R() * 2, 1) } // さざ波
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping
      return new THREE.MeshToonMaterial({ color: 0xffffff, map: t, gradientMap: grad, fog: true }) // トゥーンで陰影を乗せ白飛びを防ぐ
    }
    const waterMat = freshWater(makeWaterMirror(0.34))  // 水を張った田（空を映す水鏡＋穏やかなきらめき）
    const waterSun = freshWater(makeWaterMirror(0.58))  // 朝日を照り返す明るい水面＋きらめき
    // 青田（田植え後の稲の条が整然と並ぶ緑＝俯瞰で「田んぼ」と読ませる。ベタ緑を脱す）。
    const ric = document.createElement('canvas'); ric.width = ric.height = 64
    const rix = ric.getContext('2d')
    rix.fillStyle = '#6f8a44'; rix.fillRect(0, 0, 64, 64)
    for (let y = 3; y < 64; y += 5) { // 稲の条（列）
      rix.fillStyle = 'rgba(86,108,54,0.55)'; rix.fillRect(0, y, 64, 2)       // 条の影
      rix.fillStyle = 'rgba(146,168,90,0.42)'; rix.fillRect(0, y + 2, 64, 1)  // 株の明部
    }
    for (let i = 0; i < 70; i++) { const v = 96 + ((R() * 44) | 0); rix.fillStyle = `rgba(${v},${v + 26},${(v * 0.58) | 0},0.16)`; rix.fillRect(R() * 64, R() * 64, 2, 2) } // 株のムラ
    const riceTex = new THREE.CanvasTexture(ric); riceTex.wrapS = riceTex.wrapT = THREE.RepeatWrapping; riceTex.repeat.set(2, 2)
    const riceMat = new THREE.MeshLambertMaterial({ map: riceTex }) // 青田（稲の条）
    // 畑の土（耕した畝＝土の条が並ぶ。ベタ土を脱し「耕した畑」と読ませる。稲の条と揃える）。
    const ear = document.createElement('canvas'); ear.width = ear.height = 64
    const erx = ear.getContext('2d')
    erx.fillStyle = '#9c8862'; erx.fillRect(0, 0, 64, 64)
    for (let y = 3; y < 64; y += 6) { // 畝（耕した土の条）
      erx.fillStyle = 'rgba(122,104,72,0.55)'; erx.fillRect(0, y, 64, 2)       // 畝の谷（影）
      erx.fillStyle = 'rgba(186,164,124,0.4)'; erx.fillRect(0, y + 3, 64, 1)   // 畝の頂（明）
    }
    for (let i = 0; i < 60; i++) { const v = 150 + ((R() * 40) | 0); erx.fillStyle = `rgba(${v},${(v * 0.86) | 0},${(v * 0.62) | 0},0.16)`; erx.fillRect(R() * 64, R() * 64, 2, 2) } // 土塊のムラ
    const earthTex = new THREE.CanvasTexture(ear); earthTex.wrapS = earthTex.wrapT = THREE.RepeatWrapping; earthTex.repeat.set(2, 2)
    const earthMat = new THREE.MeshLambertMaterial({ map: earthTex }) // 畑の土（耕した畝）
    // 秋＝刈田（稲刈り後の黄金の刈株が条に残る）。青田の代わりに金色の刈田を主体に（季節で中身が変わる）。
    const AUT = season === 'autumn'
    let kariMats = null
    if (AUT) {
      // 刈田を一枚の同じ材で敷くと俯瞰で「灰色の段々」に溶ける。実際の秋の谷戸は刈った時期で
      // 田ごとに金色の濃淡が違う＝パッチワーク。3種の刈田材を段ごとに替え、段々の起伏を読ませる。
      // 金はグレードで彩度が落ちて灰色化しやすいので、やや強めの金で起こす（秋の木立の暖色と調和）。
      const makeKari = (base, rowDk, rowLt, spek) => {
        const kar = document.createElement('canvas'); kar.width = kar.height = 64
        const kax = kar.getContext('2d')
        kax.fillStyle = base; kax.fillRect(0, 0, 64, 64)
        for (let y = 3; y < 64; y += 5) { // 刈株の条
          kax.fillStyle = rowDk; kax.fillRect(0, y, 64, 2)       // 条の影
          kax.fillStyle = rowLt; kax.fillRect(0, y + 2, 64, 1)   // 条の明（刈株の照り）
        }
        for (let i = 0; i < 64; i++) { const v = spek + ((R() * 40) | 0); kax.fillStyle = `rgba(${v},${(v * 0.82) | 0},${(v * 0.46) | 0},0.18)`; kax.fillRect(R() * 64, R() * 64, 2, 2) }
        const t = new THREE.CanvasTexture(kar); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2)
        return new THREE.MeshLambertMaterial({ map: t }) // 刈田（金色の刈株）
      }
      kariMats = [
        makeKari('#dcc06a', 'rgba(150,120,58,0.55)', 'rgba(244,224,158,0.5)', 188),  // 刈りたての明るい金
        makeKari('#c8a850', 'rgba(132,104,48,0.55)', 'rgba(230,206,138,0.45)', 168), // やや古い深い琥珀
        makeKari('#b8995a', 'rgba(120,96,52,0.5)', 'rgba(210,186,130,0.4)', 156),    // 刈って間もない褐色がかった田
      ]
    }
    // 春＝田植えの水鏡（水を張ったばかりの棚田が一面に空を映す）。水鏡を主体に。
    const SPR = season === 'spring'
    // 冬＝雪原の棚田（青田/刈田の代わりに雪化粧の段々田＋凍った水面）。Lambert材は雪冠(snowify)が乗らないので明示的に雪色。
    const WIN = weather === 'snow'
    const snowField = WIN ? mottleMat(0xdce6f0, 34, 0.12, [1, 1]) : null // 雪をかぶった田（淡い青の起伏の影＝段々が読める）
    const iceField = WIN ? mottleMat(0xc4d6e2, 26, 0.14, [1, 1]) : null  // 凍った水面（薄氷の青）
    for (let pz = -44; pz <= 2.5; pz += 5.6) {
      const rowR = R() // 段ごとの作付けの素＝同じ段は似た材になり「棚田が段で揃う」。市松のばらつき(散漫なタイル感)を脱す
      for (let px = -11; px <= 11; px += 5.6) {
        const jx = (R() - 0.5) * 0.5
        const gy = heightAt(px + jx, pz)
        const r = rowR * 0.64 + R() * 0.36 // 段の傾向6.4割＋区画ごとのゆらぎ＝段で揃いつつ単調にならない
        const w = 5.28 + R() * 0.28 // 区画を広げ隙間を詰める（5.6格子にほぼ接する＝割れたタイルの隙間を消す）
        // 冬=雪原主体＋凍った水面、夏=水鏡主体＋青田、秋=刈田主体＋水鏡少なめ。一部の水は陽を照り返す。
        const paddy = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, w),
          WIN
            ? (r > 0.78 ? iceField : snowField) // 冬: 雪原が主・凍った水面が点々
            : AUT
              ? (r > 0.56 ? (R() < 0.4 ? waterSun : waterMat) : (r > 0.12 ? kariMats[(R() * 3) | 0] : earthMat))
              : SPR
                ? (r > 0.16 ? (R() < 0.42 ? waterSun : waterMat) : (r > 0.08 ? riceMat : earthMat)) // 春: 田植えの水鏡が一面に
                : (r > 0.32 ? (R() < 0.32 ? waterSun : waterMat) : (r > 0.10 ? riceMat : earthMat)))
        paddy.position.set(px + jx, gy + 0.13, pz); paddy.receiveShadow = true; town.add(paddy)
      }
    }
    // 稲架掛け（はざかけ）: 刈った稲を天日に干す木の架＝秋の谷戸の風物詩。横竿に金色の稲束を掛けた
    // 水平の列＝俯瞰の窓から見下ろす視線でも「干した稲」と読める（横向きの色面＝面が立つ）。秋のみ。
    if (AUT) {
      const hzWood = toon(0x6a5a3c), hzRice = toon(0xe2c062) // 稲束は明るい金で（俯瞰でも金の横列と読める）
      const hazakake = (x, z, ang, len) => {
        const g = new THREE.Group(); g.position.set(x, heightAt(x, z), z); g.rotation.y = ang
        for (const sx of [-len / 2, len / 2]) { // 2本の脚（軽く開いて自立）
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.9, 5), hzWood)
          leg.position.set(sx, 0.9, 0); leg.rotation.z = sx < 0 ? 0.12 : -0.12; leg.castShadow = true; g.add(leg)
        }
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len + 0.5, 5), hzWood) // 横竿
        pole.rotation.z = Math.PI / 2; pole.position.y = 1.55; g.add(pole)
        const nB = Math.max(3, Math.round(len / 0.42))
        for (let i = 0; i < nB; i++) { // 金色の稲束を掛ける
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.32), hzRice)
          b.position.set(-len / 2 + 0.25 + i * (len / (nB - 0.5)), 1.2, 0); b.castShadow = true; g.add(b)
        }
        town.add(g)
      }
      for (const [hx, hz, ha, hl] of [[-5, -4, 0.15, 3.4], [4, -17, -0.25, 3.0], [-4, -31, 0.1, 3.2], [6, -39, 0.35, 2.6], [-7, -42, -0.1, 2.8]]) hazakake(hx, hz, ha, hl)
    }
    // 畦道（あぜ）: 段の境界に立つ「土手の擁壁」＝棚田の階段感の決め手。横断(段境界)は高く厚く。
    const bundMat = toon(0x8a7656)
    const azeMat = toon(0x738048) // 畦の上の草の小道（人が歩く緑の筋＝俯瞰で棚田の畦道が読める）
    const nanoMat = SPR ? toon(0xe6d044) : null // 菜の花の黄（春の畦の彩り）
    const nanoGeo = SPR ? new THREE.IcosahedronGeometry(0.3, 0) : null
    // 段の擁壁を「うねる段境界」に沿って短いセグメントで並べる＝棚田が等高線に沿って湾曲する（剛体の横縞を脱す）。
    for (let n = 1; n <= 9; n++) {
      for (let bx = -12.5; bx <= 12.5; bx += 2.5) {
        const bz = 4 + undX(bx) - 5.6 * n               // この x での段境界 z（heightAt と同じ undX で整合）
        if (bz < -46.5 || bz > 5.5) continue
        const gy = heightAt(bx, bz)
        const seg = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.15, 0.85), bundMat) // 短い擁壁（隣と重ねて連続に）
        seg.position.set(bx, gy + 0.5, bz); seg.castShadow = true; seg.receiveShadow = true; town.add(seg)
        const aze = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.14, 0.95), azeMat)  // 畦の天端の草道
        aze.position.set(bx, gy + 1.11, bz); aze.receiveShadow = true; town.add(aze)
        if (SPR) { // 春の菜の花（黄の彩り）
          const nf = new THREE.Mesh(nanoGeo, nanoMat)
          nf.position.set(bx + (R() - 0.5) * 1.6, gy + 1.3, bz + (R() - 0.5) * 0.5)
          nf.scale.set(0.7 + R() * 0.6, 0.9 + R() * 0.5, 0.7 + R() * 0.6); town.add(nf)
        }
      }
    }
    for (let bx = -13.8; bx <= 13.8; bx += 5.6) {
      const gy = heightAt(bx, -21)
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 50), bundMat) // 縦の畦（段内の仕切り＝細い）
      b.position.set(bx, gy + 0.32, -21); b.castShadow = true; b.receiveShadow = true; town.add(b)
    }
    // せせらぎ（谷の左の縁を縫う細い水の流れ。棚田と重ねず、連続した一筋に）。朝の光を映してきらめく
    // 明るい水＝棚田の水鏡と同じ質感に。共有マテリアル1枚（従来は32枚生成していた無駄を解消）。
    const brookMat = mottleMat(0xc8dce4, 28, 0.20, [1, 2]) // 流れの水（さざ波のムラで煌めき）
    for (let i = 0; i < 32; i++) {
      const z = 5 - i * 1.6, x = Math.sin(z * 0.11 + 0.4) * 1.4 - 9.0, gy = heightAt(x, z)
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.13, 1.95), brookMat)
      seg.position.set(x, gy + 0.16, z); town.add(seg)
    }
    if (season === 'summer') { // 谷戸の紫陽花（せせらぎの縁に咲く。獅子ヶ谷の梅雨〜夏の風物詩）。決定的＋色統合で軽量。
      const ajiCols = [0x6f8ad0, 0x9a7ec8, 0xc77aa8, 0x7ab0c0], bk = ajiCols.map(() => []), lf2 = [], aM = new THREE.Matrix4()
      for (let i = 1; i < 32; i += 3) { const z = 5 - i * 1.6, bxs = Math.sin(z * 0.11 + 0.4) * 1.4 - 9.0, fx = bxs - 1.0, fy = heightAt(fx, z) // せせらぎの里山側の縁
        const lg = new THREE.IcosahedronGeometry(0.5, 0).toNonIndexed(); lg.scale(1.25, 0.5, 1.25); aM.makeTranslation(fx, fy + 0.18, z); lg.applyMatrix4(aM); lf2.push(lg) // 葉
        const ci = (i + 4) & 3
        for (const [ox, oy, oz, s] of [[0, 0.5, 0, 0.32], [-0.26, 0.42, 0.1, 0.22], [0.24, 0.44, -0.1, 0.23]]) { const h = new THREE.IcosahedronGeometry(s, 1); aM.makeTranslation(fx + ox, fy + oy, z + oz); h.applyMatrix4(aM); bk[(ci + (ox < 0 ? 1 : 0)) & 3].push(h) } // 花房
      }
      if (BufferGeometryUtils.mergeGeometries) { const lm = lf2.length && BufferGeometryUtils.mergeGeometries(lf2, false); if (lm) { const me = new THREE.Mesh(lm, toon(0x4e6e3a)); me.castShadow = true; town.add(me) } bk.forEach((b2, i2) => { if (b2.length) { const m = BufferGeometryUtils.mergeGeometries(b2, false); if (m) { const me2 = new THREE.Mesh(m, toon(ajiCols[i2])); me2.castShadow = true; town.add(me2) } } }); lf2.concat(...bk).forEach((g) => g.dispose()) }
    }
    // 寄棟(よせむね)屋根のジオメトリ: 水平の大棟＋四方の勾配＋深い軒＝四角錐の「段ボール箱」を脱す（評価指摘の核心）。
    // baseW/baseD=軒の外寸(壁より広く＝深い軒), ridgeLen=大棟の長さ(<baseW), h=棟の高さ。ridge は X 軸に通る。
    const makeHipRoof = (baseW, baseD, ridgeLen, h) => {
      const hw = baseW / 2, hd = baseD / 2, hr = ridgeLen / 2
      const bFL = [-hw, 0, hd], bFR = [hw, 0, hd], bBR = [hw, 0, -hd], bBL = [-hw, 0, -hd]
      const rL = [-hr, h, 0], rR = [hr, h, 0]
      const tri = [bFL, bFR, rR, bFL, rR, rL, bBR, bBL, rL, bBR, rL, rR, bBL, bFL, rL, bFR, bBR, rR] // 前/後の勾配＋左右の寄せ
      const pos = [], uv = [], col = []
      for (const v of tri) {
        pos.push(v[0], v[1], v[2]); uv.push((v[0] / baseW + 0.5) * 2.0, 0.85 - v[1] / h * 0.8) // 茅の縦筋が勾配を下る
        const f = 0.8 + (v[1] / h) * 0.34; col.push(f, f, f) // 軒=翳り0.8→大棟=明1.14の縦グラデ（大屋根に量感を出す。vertexColors材のみ反映）
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      geo.computeVertexNormals()
      return geo
    }
    // 横溝屋敷（谷の主役）: 茅葺の寄棟主屋＋長屋門。屋敷林に抱かれる。
    {
      const fx = 0, fz = -18, fgy = heightAt(fx, fz)
      const g = new THREE.Group(); g.position.set(fx, fgy, fz); g.rotation.y = -0.16; g.scale.setScalar(1.5); town.add(g) // 谷の主役なので大きく立てる
      const body = new THREE.Mesh(new RoundedBoxGeometry(9, 3.2, 6.5, 1, 0.18), toon(0xe9e2d2)) // 主屋（白漆喰・角をわずかに面取り）
      body.position.y = 1.6; body.castShadow = true; body.receiveShadow = true; g.add(body)
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(9.1, 1.0, 6.6), toon(0x5e4d3c)); skirt.position.y = 0.5; g.add(skirt) // 下見板（腰壁）
      // 茅葺の質感（縦の茅の筋）。主屋と長屋門の屋根で共有。
      const tc = document.createElement('canvas'); tc.width = tc.height = 64
      const tcx = tc.getContext('2d'); const tb = new THREE.Color(0x564a2e) // 深い茅色（陽で起きてちょうど麦藁色に。淡い合板感を脱す）
      tcx.fillStyle = '#' + tb.getHexString(); tcx.fillRect(0, 0, 64, 64)
      // 横の茅の段（葺き重ねた束の段＝段の下に影、すぐ上に束の照り）＝合板でなく「葺いた茅」に読ませる
      for (let y = 7; y < 64; y += 12) {
        tcx.fillStyle = 'rgba(38,30,16,0.5)'; tcx.fillRect(0, y, 64, 2.6)          // 段の影
        tcx.fillStyle = 'rgba(150,128,84,0.32)'; tcx.fillRect(0, y + 2.6, 64, 1.7) // 束の照り
      }
      // 縦の茅の筋（葺きおろし）
      for (let i = 0; i < 120; i++) { const col = tb.clone().offsetHSL((R() - 0.5) * 0.02, (R() - 0.5) * 0.06, (R() - 0.5) * 0.26); tcx.strokeStyle = '#' + col.getHexString(); tcx.lineWidth = 0.5 + R() * 1.3; tcx.globalAlpha = 0.42; const lx = R() * 64; tcx.beginPath(); tcx.moveTo(lx, 0); tcx.lineTo(lx + (R() - 0.5) * 4, 64); tcx.stroke() }
      tcx.globalAlpha = 1
      const thatchTex = new THREE.CanvasTexture(tc); thatchTex.wrapS = thatchTex.wrapT = THREE.RepeatWrapping; thatchTex.repeat.set(3, 2)
      const thatchMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: thatchTex, vertexColors: true })
      // 茅葺の寄棟屋根: 水平の大棟＋四方の勾配＋深い軒。四角錐の「段ボール箱」を本物の寄棟へ作り直す（評価指摘）。
      const roof = new THREE.Mesh(makeHipRoof(10.8, 8.2, 5.6, 3.5), thatchMat)
      roof.position.y = 2.7; roof.castShadow = true; roof.receiveShadow = true; g.add(roof) // 軒を壁の上端(3.2)より下げ＝深い軒の量感
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.62, 1.25), toon(0x423a2c)); ridge.position.y = 6.2; g.add(ridge) // 大棟の押さえ（水平に長く通る）
      const gateBody = new THREE.Mesh(new RoundedBoxGeometry(7, 2.2, 2.2, 1, 0.16), toon(0xddd4c4)) // 長屋門（角をわずかに面取り）
      gateBody.position.set(0, 1.1, 5.8); gateBody.castShadow = true; g.add(gateBody)
      const gateRoof = new THREE.Mesh(makeHipRoof(8.2, 3.4, 5.0, 1.5), thatchMat)
      gateRoof.position.set(0, 2.0, 5.8); gateRoof.castShadow = true; g.add(gateRoof)
      const gateOpen = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.7, 0.3), toon(0x241f18)); gateOpen.position.set(0, 0.95, 6.95); g.add(gateOpen) // 門の通り口（陰）
      // ── 旧家の作り込み（土蔵・縁側・井戸・庭）＝実在の横溝屋敷らしい屋敷構え。群の局所座標（×1.5）。──
      const kura = new THREE.Mesh(new RoundedBoxGeometry(3.6, 3.0, 3.0, 1, 0.1), toon(0xeae3d4)); kura.position.set(-7.4, 1.5, 0.8); kura.castShadow = true; kura.receiveShadow = true; g.add(kura) // 土蔵（白漆喰）
      const kuraSkirt = new THREE.Mesh(new THREE.BoxGeometry(3.7, 1.2, 3.1), toon(0x3a4048)); kuraSkirt.position.set(-7.4, 0.6, 0.8); g.add(kuraSkirt) // 海鼠壁の腰（黒っぽい）
      const kuraRoof = new THREE.Mesh(makeHipRoof(4.4, 3.8, 2.4, 1.1), toon(season === 'winter' ? 0xb8bcc0 : 0x5a5650)); kuraRoof.position.set(-7.4, 3.0, 0.8); kuraRoof.castShadow = true; g.add(kuraRoof) // 瓦の寄棟
      const engawa = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.18, 1.3), toon(0x8a6a44)); engawa.position.set(0.4, 0.55, 3.7); engawa.castShadow = true; g.add(engawa) // 縁側（主屋の谷側の濡れ縁）
      for (const ex of [-3, 0, 3]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 5), toon(0x6a5238)); post.position.set(ex + 0.4, 0.28, 4.2); g.add(post) } // 縁の束
      { const wx = 4.6, wz = 4.4 // 井戸（石組み＋小屋根）
        const well = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.95, 8), toon(0x8a857a)); well.position.set(wx, 0.47, wz); well.castShadow = true; g.add(well)
        const wtop = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.12, 8), toon(0x241f18)); wtop.position.set(wx, 0.95, wz); g.add(wtop) // 水面の陰
        for (const px of [-0.62, 0.62]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 5), toon(0x6a5238)); pole.position.set(wx + px, 1.32, wz); g.add(pole) } // 屋根の柱
        const wroof = new THREE.Mesh(new THREE.ConeGeometry(0.92, 0.5, 4), toon(0x5a5248)); wroof.position.set(wx, 2.35, wz); wroof.rotation.y = Math.PI / 4; wroof.castShadow = true; g.add(wroof) }
      { const pineTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.5, 6), toon(0x5a4632)); pineTrunk.position.set(-3.6, 0.75, 4.7); pineTrunk.rotation.z = 0.2; pineTrunk.castShadow = true; g.add(pineTrunk) // 庭の松
        for (const [px, py, pz, s] of [[-3.9, 1.8, 4.7, 0.9], [-3.2, 1.6, 5.0, 0.7], [-3.7, 2.2, 4.5, 0.6]]) { const pf = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), toon(season === 'winter' ? 0x6a7a66 : 0x46663e)); pf.position.set(px, py, pz); pf.scale.y = 0.55; pf.castShadow = true; g.add(pf) } // 松の葉（平たい層＝手入れされた庭木）
        for (const [sx, sz, sr] of [[-1.5, 5.0, 0.42], [-2.3, 5.3, 0.3]]) { const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(sr, 0), toon(0x8a857c)); stone.position.set(sx, sr * 0.5, sz); stone.scale.y = 0.6; g.add(stone) } } // 庭石
      // 着地/歩行: 屋敷の建屋(主屋＋長屋門＋土蔵)に埋もれて降りない・歩いて入らない。groupは×1.5・回転-0.16なので世界座標で囲む。
      colliders.push({ x: fx, z: fz, r: 7.2 })                     // 主屋＋中庭
      colliders.push({ x: fx - 10.8, z: fz + 1.2, r: 3.0 })        // 土蔵(局所-7.4×1.5)
      spawnAvoid.push({ x: fx, z: fz - 2, r: 12 })                 // 着地は屋敷の前庭/谷へ
    }
    // 屋敷林（屋敷を「後ろから」抱く高木の木立）。主屋(z=-18)の手前を空け、背後と側面奥にのみ立てる。
    for (const c of [[-8, -26], [8, -25], [-6, -31], [7, -30], [0, -33], [-11, -28], [11, -27]]) tree(c[0], c[1], 1.3 + R() * 0.5)
    // 谷の斜面に点在する瓦屋根の農家（数軒。奥にも足して空の間延びを締める）
    const farmRoof = [toon(0x6a6258), toon(0x7a5e50), toon(0x5e6a5c)].map((m) => { m.vertexColors = true; return m }) // 寄棟の縦グラデで瓦屋根にも量感
    for (const c of [[-19, -8, 0.9], [20, -14, 1.0], [-22, -24, 1.1], [23, -30, 1.0], [-17, -36, 0.9], [16, -41, 0.95], [-24, -43, 1.0], [9, -45, 0.85]]) {
      const gy = heightAt(c[0], c[1])
      const fg = new THREE.Group(); fg.position.set(c[0], gy, c[1]); fg.scale.setScalar(c[2]); fg.rotation.y = (R() - 0.5) * 0.8; town.add(fg)
      const fb = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3.4), toon(0xd8cfbf)); fb.position.y = 1.2; fb.castShadow = true; fg.add(fb)
      const fr = new THREE.Mesh(makeHipRoof(5.0, 4.2, 2.2, 1.7), farmRoof[(R() * 3) | 0]); fr.position.y = 2.2; fr.castShadow = true; fg.add(fr) // 瓦の寄棟（深い軒）
      colliders.push({ x: c[0], z: c[1], r: 2.6 * c[2] }); spawnAvoid.push({ x: c[0], z: c[1], r: 3.6 * c[2] }) // 着地/歩行: 農家に埋もれない
    }
    // 子メッシュを位置指定して群に足す小ヘルパ（mesh.position は読み取り専用なので set を使う）
    const addAt = (g, mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh }
    // ── 案山子（棚田に点々と。十字の竿＋菅笠＋古着＝谷戸の農の生活） ──
    const clothCols = [toon(0x9a7a5a), toon(0x7a8a6a), toon(0x8a6a6a), toon(0xa08858)]
    for (const c of [[-6, -10], [5, -23], [-8, -33], [9, -39]]) {
      const gy = heightAt(c[0], c[1])
      const g = new THREE.Group(); g.position.set(c[0], gy + 0.2, c[1]); g.rotation.y = (R() - 0.5) * 1.2
      addAt(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.0, 5), toon(0x6a5a3c)), 0, 1.0, 0).castShadow = true // 竿
      addAt(g, new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), toon(0x6a5a3c)), 0, 1.5, 0) // 腕の横木
      addAt(g, new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.18), clothCols[(R() * clothCols.length) | 0]), 0, 1.45, 0) // 古着
      addAt(g, new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), toon(0xe8dcc0)), 0, 1.98, 0) // 頭
      addAt(g, new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.28, 10), toon(0xc8a860)), 0, 2.14, 0) // 菅笠
      town.add(g)
    }
    // ── 白鷺（水を張った田に佇む。谷戸の象徴の一点） ──
    const heronMat = toon(0xf2f2f0)
    for (const c of [[-2, -14], [7, -29], [-9, -41]]) {
      const gy = heightAt(c[0], c[1])
      const g = new THREE.Group(); g.position.set(c[0], gy + 0.18, c[1]); g.rotation.y = R() * 6.28
      addAt(g, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4), toon(0x3a3a3a)), 0, 0.3, 0) // 脚
      const body = addAt(g, new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), heronMat), 0, 0.72, 0); body.scale.set(1, 0.8, 1.7)
      const neck1 = addAt(g, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.28, 5), heronMat), 0, 0.94, 0.06); neck1.rotation.x = 0.7 // 首の付け根（前下へ）＝S字の下カーブ
      const neck2 = addAt(g, new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.34, 5), heronMat), 0, 1.14, 0.18); neck2.rotation.x = -0.2 // 立ち上がる上首＝S字
      addAt(g, new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), heronMat), 0, 1.32, 0.2) // 頭
      const beak = addAt(g, new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.2, 5), toon(0xd8b048)), 0, 1.32, 0.37); beak.rotation.x = Math.PI * 0.5 // 黄の長い嘴
      for (const s of [-1, 1]) { const wg = addAt(g, new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), heronMat), s * 0.085, 0.74, -0.04); wg.scale.set(0.45, 0.66, 1.5) } // 畳んだ翼＝白い玉でなく鳥の輪郭
      town.add(g)
    }
    // ── 谷戸の暮らしの彩り（柿の木・竹林・棚田を舞う蝶/赤とんぼ）＝故郷の谷戸の季節感と生命感 ──
    // 柿の木（暮らしの象徴。秋は橙の実が実る）。屋敷/農家のそばに数本。実は統合で軽量。
    { const kakiFruitMat = season === 'autumn' ? toon(0xe0742a) : null, fruitGeos = []
      for (const [kx, kz] of [[-13, -15], [13, -21], [-15, -31], [12, -9], [-12, -41]]) {
        const gy = heightAt(kx, kz); if (gy < SEA.level + 0.5) continue
        tree(kx, kz, 0.85 + R() * 0.3)
        if (kakiFruitMat) for (let i = 0; i < 10; i++) { const a = R() * 6.28, rr = 0.7 + R() * 0.8; const frg = new THREE.SphereGeometry(0.12, 6, 5); frg.translate(kx + Math.cos(a) * rr, gy + 2.3 + R() * 1.1, kz + Math.sin(a) * rr); fruitGeos.push(frg) }
      }
      if (fruitGeos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(fruitGeos, false); if (m) town.add(new THREE.Mesh(m, kakiFruitMat)); fruitGeos.forEach((g) => g.dispose()) }
    }
    // 竹林（里山の縁の竹藪＝獅子ヶ谷の谷戸らしさ）。東の斜面の縁に群れる。竿/葉は統合で軽量。
    { const caneMat = toon(season === 'winter' ? 0x8a9a7a : 0x6f9a52), bleafMat = toon(season === 'autumn' ? 0xaa9a48 : (season === 'winter' ? 0x8a9a82 : 0x5e8a48)), caneGeos = [], leafGeos = [], cM = new THREE.Matrix4()
      for (let i = 0; i < (LIGHT ? 9 : 16); i++) { const bx = 15 + R() * 6.5, bz = -16 - R() * 18, by = heightAt(bx, bz); if (by < SEA.level + 0.5) continue
        const h = 4.5 + R() * 2.8, tilt = (R() - 0.5) * 0.13
        const cg = new THREE.CylinderGeometry(0.05, 0.075, h, 5); cM.makeRotationZ(tilt).setPosition(bx, by + h / 2, bz); cg.applyMatrix4(cM); caneGeos.push(cg)
        const lg = new THREE.IcosahedronGeometry(0.6 + R() * 0.4, 1); lg.scale(1, 1.6, 1); lg.translate(bx + Math.sin(tilt) * h, by + h - 0.3, bz); leafGeos.push(lg) }
      if (caneGeos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(caneGeos, false); if (m) { const me = new THREE.Mesh(m, caneMat); me.castShadow = true; town.add(me) } caneGeos.forEach((g) => g.dispose())
        const lm = BufferGeometryUtils.mergeGeometries(leafGeos, false); if (lm) { const le = new THREE.Mesh(lm, bleafMat); le.castShadow = true; town.add(le) } leafGeos.forEach((g) => g.dispose()) }
    }
    // 舞う生きもの（春夏＝蝶／夏秋＝蜻蛉・秋は赤とんぼ）が棚田の上を舞う＝谷戸の生命感。
    { const flyOK = season === 'spring' || season === 'summer', dartOK = season === 'summer' || season === 'autumn'
      const flyCols = season === 'spring' ? [0xf6d0e0, 0xfaf0c0, 0xf2f2ee] : [0xf2ead0, 0xf6e8b0, 0xeec8a0]
      if (flyOK && !isNight) for (let k = 0; k < 5; k++) { const a = R() * 6.28, r = 6 + R() * 15, px = Math.cos(a) * r, pz = -16 + Math.sin(a) * r * 0.8, py = heightAt(px, pz); if (py < SEA.level + 0.5) continue; mkButterfly(px, py + 1.2 + R() * 1.3, pz, flyCols[k % flyCols.length]) }
      if (dartOK && !isNight) for (let k = 0; k < 6; k++) { const a = R() * 6.28, r = 5 + R() * 15, px = Math.cos(a) * r, pz = -16 + Math.sin(a) * r * 0.8, py = heightAt(px, pz); if (py < SEA.level + 0.5) continue; mkDragonfly(px, py + 1.2 + R() * 0.8, pz, season === 'autumn' ? 0xc2452a : 0x46665a) }
    }
    // 彼岸花（秋の畦に咲く真紅＝谷戸の秋の象徴）。茎(緑)＋花(紅)を統合で軽量。
    if (season === 'autumn' && BufferGeometryUtils.mergeGeometries) {
      const hbStem = [], hbHead = []
      for (let i = 0; i < 44; i++) { const fx = (R() - 0.5) * 26, fz = -4 - R() * 40, fy = heightAt(fx, fz); if (fy < SEA.level + 0.4) continue
        const sg = new THREE.CylinderGeometry(0.022, 0.028, 0.55, 3).toNonIndexed(); sg.translate(fx, fy + 0.27, fz); hbStem.push(sg)
        const hg = new THREE.IcosahedronGeometry(0.11, 0).toNonIndexed(); hg.scale(1, 0.55, 1); hg.translate(fx, fy + 0.55, fz); hbHead.push(hg) }
      const sm = hbStem.length && BufferGeometryUtils.mergeGeometries(hbStem, false); if (sm) town.add(new THREE.Mesh(sm, toon(0x4a6a3a))); hbStem.forEach((g) => g.dispose())
      const hm = hbHead.length && BufferGeometryUtils.mergeGeometries(hbHead, false); if (hm) town.add(new THREE.Mesh(hm, toon(0xd23a26))); hbHead.forEach((g) => g.dispose())
    }
    // 野花（春＝れんげ/夏＝白詰草が畦に咲く＝故郷の春夏の足元の彩り）。茎(緑)＋花を統合で軽量。
    if ((season === 'spring' || season === 'summer') && BufferGeometryUtils.mergeGeometries) {
      const yfStem = [], yfHead = [], yfCol = season === 'spring' ? 0xf0a6c2 : 0xf4efe2 // 春=れんげの桃／夏=白詰草の白
      for (let i = 0; i < 48; i++) { const side = R() < 0.5 ? -1 : 1, fx = side * (10 + R() * 4.5), fz = -3 - R() * 40, fy = heightAt(fx, fz); if (fy < SEA.level + 0.5) continue
        const sg = new THREE.CylinderGeometry(0.016, 0.02, 0.3, 3).toNonIndexed(); sg.translate(fx, fy + 0.15, fz); yfStem.push(sg)
        const hg = new THREE.IcosahedronGeometry(0.075 + R() * 0.04, 0).toNonIndexed(); hg.scale(1, 0.7, 1); hg.translate(fx, fy + 0.3, fz); yfHead.push(hg) }
      const sm2 = yfStem.length && BufferGeometryUtils.mergeGeometries(yfStem, false); if (sm2) town.add(new THREE.Mesh(sm2, toon(0x5e7a44))); yfStem.forEach((g) => g.dispose())
      const hm2 = yfHead.length && BufferGeometryUtils.mergeGeometries(yfHead, false); if (hm2) town.add(new THREE.Mesh(hm2, toon(yfCol))); yfHead.forEach((g) => g.dispose())
    }
    // ── 朝靄（谷戸の朝・棚田とせせらぎに低くたなびく霧の薄衣）。大きく柔らかい横長スプライトを谷底に低く敷く。
    // 谷戸の朝の情景の核。やわらかい白の薄veil＝近景の硬い造形を少し溶かし、霞(fog)と地続きの大気感を出す。冬は省略（雪で別の趣）。
    if (weather !== 'snow') {
      const mc = document.createElement('canvas'); mc.width = mc.height = 64
      const mx = mc.getContext('2d')
      const mg = mx.createRadialGradient(32, 32, 1, 32, 32, 31)
      mg.addColorStop(0, 'rgba(255,255,255,0.55)'); mg.addColorStop(0.5, 'rgba(255,255,255,0.22)'); mg.addColorStop(1, 'rgba(255,255,255,0)')
      mx.fillStyle = mg; mx.fillRect(0, 0, 64, 64)
      const mistTex = new THREE.CanvasTexture(mc)
      const mistTint = skyHorizon.clone().lerp(new THREE.Color(0xffffff), 0.55).getHex() // 朝の地平色を含む淡い白
      const nMist = LIGHT ? 5 : 8 // 重ねすぎると谷が白く霞んで主役の棚田/屋敷が読めない＝枚数と濃さを抑え、朝靄は“薄い帯”に
      for (let i = 0; i < nMist; i++) {
        const mxp = (R() - 0.5) * 24, mz = -43 + R() * 46
        const gy = heightAt(mxp, mz)
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: mistTint, transparent: true, opacity: 0.08 + R() * 0.07, depthWrite: false, fog: true }))
        spr.position.set(mxp, gy + 1.2 + R() * 1.1, mz)
        spr.scale.set(14 + R() * 10, 5.5 + R() * 3.5, 1)
        scene.add(spr)
      }
    }
  }

  // ── 祝賀のアドバルーン（赤い気球＋下がる細い垂れ幕＋係留索）。小ぶりで本物らしく。街のみ。 ──
  if (kind !== 'yato') {
    const x = 13, z = -16, gy = heightAt(x, z)
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), toon(0xb84a3e))
    balloon.position.set(x, gy + 19, z); town.add(balloon); adBalloons.push(balloon)
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.5, 0.1), toon(0xf2ede2))
    banner.position.set(x, gy + 15.5, z); town.add(banner); adBalloons.push(banner)
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 13, 4), new THREE.MeshBasicMaterial({ color: 0x666666, fog: true }))
    rope.position.set(x, gy + 12, z); town.add(rope)
  }

  // ── 熱気球（空をゆっくり漂う）。街・湾の上空に。眺めの楽しみ。街のみ。 ──
  if (kind !== 'yato') {
    balloons = []
    const stripeSets = [['#d8584a', '#f0ece0'], ['#3a8ac0', '#f0d040'], ['#e0a030', '#6fae8f']]
    const spots = [[2, -34, 30, 42], [72, -42, 18, 38]] // [cx, cz, rad, y]
    for (let i = 0; i < spots.length; i++) {
      const g = new THREE.Group()
      const cols = stripeSets[i % stripeSets.length]
      const ec = document.createElement('canvas'); ec.width = 64; ec.height = 16; const ecx = ec.getContext('2d')
      for (let s = 0; s < 16; s++) { ecx.fillStyle = s % 2 ? cols[0] : cols[1]; ecx.fillRect(s * 4, 0, 4, 16) }
      const etex = new THREE.CanvasTexture(ec); etex.wrapS = etex.wrapT = THREE.RepeatWrapping
      const envMat = new THREE.MeshToonMaterial({ map: etex, gradientMap: grad, fog: true })
      const env = new THREE.Mesh(new THREE.SphereGeometry(4, 18, 14), envMat); env.scale.y = 1.22; env.position.y = 0.5; env.castShadow = true; g.add(env)
      const neck = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 14), envMat); neck.position.y = -4.0; g.add(neck)
      const basket = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 1.5), toon(0x8a6a48)); basket.position.y = -6.6; basket.castShadow = true; g.add(basket)
      for (const cz2 of [-0.6, 0.6]) for (const cx2 of [-0.6, 0.6]) { const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 4), new THREE.MeshBasicMaterial({ color: 0x6a6258, fog: true })); cord.position.set(cx2, -5.1, cz2); g.add(cord) }
      if (duskAmt > 0.2) { const flame = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffb060, fog: true })); flame.position.y = -5.4; g.add(flame) } // バーナーの炎
      g.position.set(spots[i][0], heightAt(spots[i][0], spots[i][1]) + spots[i][3], spots[i][1])
      g.userData = { cx: spots[i][0], cz: spots[i][1], rad: spots[i][2], y: heightAt(spots[i][0], spots[i][1]) + spots[i][3], ph: i * 2.1, sp: 0.035 + i * 0.012 }
      scene.add(g); balloons.push(g)
    }
  }

  // ── 遠くの遊園地の観覧車（谷の向こうに小さく見える郷愁のランドマーク。ゆっくり回る）。街のみ。 ──
  if (kind !== 'yato') {
    const fx = -26, fz = -66, gy = heightAt(fx, fz)
    const grp = new THREE.Group()
    grp.position.set(fx, gy, fz)
    grp.rotation.y = 0.2 // ほんの少し斜め（正面すぎない佇まい）
    town.add(grp)
    const R0 = 12, hubY = 16
    const steelMat = toon(0xb0b6bc)
    // 支柱（左右のA字脚＝ハブへ集まる）＋軸＝静止の鉄骨。1メッシュへ統合（描画コール削減＝発熱対策）。
    const frameGeos = [], fM = new THREE.Matrix4()
    for (const sx of [-1, 1]) for (const dz of [-3.4, 3.4]) { const leg = new THREE.CylinderGeometry(0.32, 0.5, hubY + 1, 6); fM.makeRotationZ(sx > 0 ? 0.34 : -0.34).setPosition(sx * 3.0, hubY / 2, dz); leg.applyMatrix4(fM); frameGeos.push(leg) }
    { const axle = new THREE.CylinderGeometry(0.55, 0.55, 7.6, 8); fM.makeRotationX(Math.PI / 2).setPosition(0, hubY, 0); axle.applyMatrix4(fM); frameGeos.push(axle) }
    if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(frameGeos, false); if (m) { const me = new THREE.Mesh(m, steelMat); me.castShadow = true; grp.add(me) } frameGeos.forEach((g) => g.dispose()) }
    // 回る車輪（XY平面・Z軸回り）。二重リング＋スポーク＋ゴンドラ。リング＋スポークは車輪と一緒に回る鉄骨＝1メッシュへ統合（後段でwheelへ）。
    const wheel = new THREE.Group()
    wheel.position.set(0, hubY, 0); grp.add(wheel)
    const wheelGeos = [], wM = new THREE.Matrix4()
    for (const rr of [R0, R0 - 0.7]) wheelGeos.push(new THREE.TorusGeometry(rr, 0.17, 6, 44))
    const N = 12
    const gondMats = [toon(0xcf5a4e), toon(0xe6cf7a), toon(0x5a86b0), toon(0xe8e2d6), toon(0x6fae8f), toon(0xd98f5a)]
    const litMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, fog: true }) // 夕/夜のゴンドラの灯り
    const gondolas = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const spoke = new THREE.CylinderGeometry(0.07, 0.07, R0, 4)
      wM.makeRotationZ(a - Math.PI / 2).setPosition(Math.cos(a) * R0 / 2, Math.sin(a) * R0 / 2, 0); spoke.applyMatrix4(wM); wheelGeos.push(spoke)
      const gond = new THREE.Group()
      gond.position.set(Math.cos(a) * (R0 + 0.9), Math.sin(a) * (R0 + 0.9), 0)
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.4, 1.6), gondMats[i % gondMats.length]); gond.add(cab)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.8), gondMats[(i + 2) % gondMats.length]); roof.position.y = 0.85; gond.add(roof)
      if (!LIGHT && i % 2 === 0) { const rider = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.34, 3, 6), toon([0x5a78a0, 0xc06a6a, 0x6a8a5a][i % 3])); rider.position.set((R() - 0.5) * 0.4, -0.1, 0.3); gond.add(rider); const rh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 6), toon(0xf0c49c)); rh.position.set(rider.position.x, 0.32, 0.3); gond.add(rh) } // 乗客
      if (duskAmt > 0.25) { const lit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), litMat); lit.position.z = 0.83; gond.add(lit) }
      wheel.add(gond); gondolas.push(gond)
    }
    if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(wheelGeos, false); if (m) { const me = new THREE.Mesh(m, steelMat); me.castShadow = true; wheel.add(me) } wheelGeos.forEach((g) => g.dispose()) } // リング＋スポークを1メッシュに（車輪と一緒に回る）
    // 夕夜の電飾（リムに沿う豆電球＋ハブ＋スポークの灯り。車輪と一緒に回って瞬く）
    if (duskAmt > 0.25) {
      const bulbA = new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: true }), bulbB = new THREE.MeshBasicMaterial({ color: 0xff9a6a, fog: true }), bulbC = new THREE.MeshBasicMaterial({ color: 0x86c0e8, fog: true })
      const NB = LIGHT ? 20 : 40 // 非力端末は電飾を半分に
      // 豆電球を色ごとに1メッシュへ統合（車輪と一緒に回る。ドローコール削減）
      const gA = [], gB = [], gC = [], ball = new THREE.SphereGeometry(0.17, 6, 6)
      for (let i = 0; i < NB; i++) { const a = i / NB * 6.283; const b = ball.clone(); b.translate(Math.cos(a) * R0, Math.sin(a) * R0, 0.22); [gA, gB, gC][i % 3].push(b) }
      const hubG = new THREE.SphereGeometry(0.5, 8, 8); hubG.translate(0, 0, 0.3); gA.push(hubG)
      if (!LIGHT) { const sball = new THREE.SphereGeometry(0.12, 6, 6); for (let i = 0; i < N; i++) { const a = (i / N) * 6.283; const s = sball.clone(); s.translate(Math.cos(a) * R0 * 0.52, Math.sin(a) * R0 * 0.52, 0.22); gA.push(s) } }
      for (const [geos, mat] of [[gA, bulbA], [gB, bulbB], [gC, bulbC]]) { if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) wheel.add(new THREE.Mesh(m, mat)); geos.forEach((g) => g.dispose()) } }
    }
    ferris = { wheel, gondolas }
  }

  // ── 遠景の低ポリ山（街の奥に重なる尾根。空気遠近で淡く青み＝奥行きの錨） ──
  // 常に作り mtns に保持（実写背景が読めたら上のコールバックで消す＝画像が無ければ山が残る）。
  // 評価(美術-H2)で「七角錐の書き割り」と指摘→ 幅広く低い山を多数重ねて連続した不規則な尾根に、
  // 奥の層ほど空色へ強く青ませて大気遠近の奥行きを段階化する。
  const mtnLo = new THREE.Color(0x66765c), mtnBlue = new THREE.Color(0x94a4b2)
  for (let layer = 0; layer < 3; layer++) {
    const dist = 132 + layer * 52
    const baseY = -6 + layer * 5            // 基底を地中に沈め、上部の稜線だけ見せる（重なりが尾根になる）
    const n = 14 - layer * 2
    const col = skyHorizon.clone().lerp(layer === 0 ? mtnLo : mtnBlue, 0.46 + layer * 0.16).getHex() // 奥ほど青く淡く
    for (let i = 0; i < n; i++) {
      const ang = (i / (n - 1) - 0.5) * Math.PI * 1.3
      const x = Math.sin(ang) * dist + (R() - 0.5) * 44
      const z = -Math.cos(ang) * dist - 22
      const rad = 56 + R() * 46, h = (20 + R() * 30) * (1 - layer * 0.12) // 幅広く低い＝なだらかな山・高さを散らす
      const m = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 6), toon(col))
      m.position.set(x, baseY, z); m.rotation.y = R() * 6
      scene.add(m); mtns.push(m)
    }
  }

  // ── ふわふわの雲（白い球の塊＝立体的な積雲。底は平ら・上は盛り上がり、雲底は翳って立体に） ──
  const clouds = []
  // 雪は一面の明るい空＝トゥーンの陰影で雲底が暗く落ちると「重い灰の天井」に見える。雪天だけ陰影を持たない
  // フラット材(MeshBasic)にし、淡い白〜冷灰のやわらかな曇り空に溶かす（積雲の翳りは晴天/夜のみ）。
  const SNOWY = weather === 'snow'
  const mkCloud = (col) => SNOWY ? new THREE.MeshBasicMaterial({ color: col, fog: false }) : new THREE.MeshToonMaterial({ color: col, gradientMap: grad, fog: false })
  // 雲の色を時間帯に追従させる（昼=白／夕=暖色に染まる／夜=暗い月明かりの雲＝白い天井を脱す）。色は頂点色に焼くがシーンは時間帯ごとに別ビルドなのでビルド時にisNight/duskAmtで決めれば足りる。
  // 夜は「月明かりに浮かぶ柔らかな雲」へ。以前(0x4a5168/0x363b50)は暗すぎ＋トゥーンの陰面が更に沈み、入道雲が真っ黒の不気味な塊に見えた（実機FB）。明度を上げ淡い青灰の月夜の雲に。
  const cloudTopHex = isNight ? 0x7a82a0 : (SNOWY ? 0xf6f4f0 : new THREE.Color(0xfbfaf6).lerp(new THREE.Color(0xf3ca9c), duskAmt * 0.55).getHex()) // 夕は白→淡い夕焼け色／夜は月光の淡い青灰
  const cloudBotHex = isNight ? 0x5e6580 : (SNOWY ? 0xe6e9ee : new THREE.Color(0xe9e4dc).lerp(new THREE.Color(0xd99a6a), duskAmt * 0.5).getHex())
  const cloudMat = mkCloud(cloudTopHex)        // 陽/月の当たる雲頂（夜は暗く沈める）
  const cloudBot = mkCloud(cloudBotHex)        // 影になる雲底（夜は更に暗い）
  const cloudVC = mkCloud(0xffffff); cloudVC.vertexColors = true // 雲のパフを群ごとに1メッシュへ統合（色は頂点色で焼く）＝描画コール削減
  // 色を頂点色で焼くヘルパ（colGeoは町造形ブロック内＝この外側スコープからは見えないので別途定義）。
  const cloudCol = (geo, hex) => { const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b }; geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo }
  // 雲は高い空に置く（街を見渡す巡航高度の上）。低いと飛んで街を見渡す時に雲が邪魔になる（実機FB）。
  // 高くしても窓辺で見上げれば見え、ぐっと高く飛べば雲に分け入れる＝双方の良いとこ取り。light端末は控えめ。
  // 積雲を全世界(現代＋江戸/戦国/大正の空＋渡りの空)に散らす。地域でほのかに色を変える(戦国=冷/大正=暖)。
  const cumN = LIGHT ? 16 : 26
  for (let i = 0; i < cumN; i++) {
    const g = new THREE.Group()
    const n = 5 + ((R() * 4) | 0) // 5〜8房＝もこもこの積雲
    const region = i % 5
    let cx, cz, topMat = cloudMat
    if (region === 0) { cx = (R() - 0.5) * 260; cz = -40 - R() * 120 }                                                          // 現代の空
    else if (region === 1) { cx = EDO.x + (R() - 0.5) * 250; cz = EDO.z + (R() - 0.5) * 210 }                                    // 江戸の空
    else if (region === 2) { cx = SENGOKU.x + (R() - 0.5) * 200; cz = SENGOKU.z + (R() - 0.5) * 200; topMat = mkCloud(isNight ? 0x6c7488 : 0xdfe2ea) } // 戦国＝冷たく重い雲
    else if (region === 3) { cx = TAISHO.x + (R() - 0.5) * 220; cz = TAISHO.z + (R() - 0.5) * 200; topMat = mkCloud(isNight ? 0x8a7a82 : 0xf4e7d6) } // 大正＝暖かなセピアの雲
    else { cx = (R() - 0.5) * 940; cz = -150 - R() * 360 }                                                                       // 渡りの空（広く低く）
    const puffGeos = []
    for (let j = 0; j < n; j++) {
      const s = 4 + R() * 7, up = Math.pow(R(), 0.6) // 上ほど房が多い＝盛り上がる頂・底は平ら
      const pg = new THREE.IcosahedronGeometry(s, 2); pg.scale(1, 0.58, 1); pg.translate((R() - 0.5) * 24, up * 7, (R() - 0.5) * 11) // 分割を上げて積雲を丸く
      puffGeos.push(cloudCol(pg, (up < 0.25 ? cloudBot : topMat).color.getHex())) // 色を頂点色で焼く（雲底=翳り/雲頂=地域色）
    }
    if (puffGeos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(puffGeos, false); if (m) { const fm = cloudVC.clone(); g.add(new THREE.Mesh(m, fm)); g.userData.fadeMat = fm } puffGeos.forEach((x) => x.dispose()) } // 群内のパフを1メッシュへ統合。材は群ごとに複製＝カメラ近接フェードを群単位でかける
    g.position.set(cx, 66 + R() * 34, cz) // 積雲の基準高度を上げる(旧54→66)＝巡航帯(y30-60)の上に浮かせ「雲が地面/稜線に近く空が低い」を解消（低空滑空・歩行の空の抜けが一段広がる）。66-100で雲海(88)前後・巻雲(98+)の下に層をなす
    g.userData.x0 = cx - 150; g.userData.x1 = cx + 150 // 漂流の折返しは生まれた空の窓内。全雲一律(x>130→-130)だと江戸(x≈640)等の雲が初回フレームでhomeの空へ瞬間移動し吹き溜まる
    g.userData.fadeR0 = 20; g.userData.fadeR1 = 40; g.userData.fadeW = 1.8 // 近接フェードの半径（縦はfadeW倍で扁平）＝迫った雲は溶けて視界を塗りつぶさない
    scene.add(g); clouds.push(g)
  }
  // 巻雲（cirrus）＝高い空の薄い刷毛のような筋雲（晴天/夕。雨雪では出さない）。平たく細長く淡い＝空に高さと多様さ。
  if (!SNOWY && weather !== 'rain') {
    const ciN = LIGHT ? 6 : 11, ciMat = mkCloud(isNight ? 0x8088a0 : 0xf4f1ea)
    for (let i = 0; i < ciN; i++) {
      const g = new THREE.Group(), n = 4 + ((R() * 4) | 0), fm = ciMat.clone() // 材は群ごとに複製＝カメラ近接フェード用
      for (let j = 0; j < n; j++) { const s = 5 + R() * 9, wisp = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), fm); wisp.position.set((R() - 0.5) * 40, 0, (R() - 0.5) * 6); wisp.scale.set(1.7, 0.16, 0.5); g.add(wisp) }
      const ciX = (R() - 0.5) * 920 // R()の消費順はposition.setの引数評価順(x→y→z)と同一＝配置は不変
      g.position.set(ciX, 98 + R() * 20, -120 - R() * 340); g.rotation.y = R() * 3; scene.add(g); clouds.push(g)
      g.userData = { fadeMat: fm, x0: ciX - 170, x1: ciX + 170, fadeR0: 26, fadeR1: 52, fadeW: 3 } // 巻雲は薄く横長＝縦の重みを強く
    }
  }

  // ── 空を旅する立体感：雲海・入道雲・浮島の群島（街townのみ。谷戸は低空 yMax74 で届かないため敷かない） ──
  const SEA_Y = 88 // 雲海の基準高度（巡航 y30-60 の上・最高高度 y132 まで18-44u の見晴らし＝海原を見渡せる）
  let cloudSea = null
  let seaUni = null // 雲海のうねり/陽光シェーダーの共有uniform（frameで uTime を進める）
  const seaMats = [] // 雲海の材（高度フェードで opacity を動かす）
  const towerCenters = [] // 入道雲の中心（突き抜けの白包み判定用）
  const skyDrifters = [] // 雲海をゆっくり漂うもの（雲海のぬし・灯籠）。frameで更新
  const cloudObjs = [] // 雲海の静的要素（入道雲・島々・吊り橋）。低空では一括で非表示にして描画コールを節約
  // ── 銭湯＋夕餉の煙（昭和の街の象徴。煙突や家々から煙が立ちのぼり、ゆれて消える＝街で唯一の「生きている」動き）。frameと同じスコープで作り、townSmokeで更新。 ──
  const townSmoke = [] // 立ちのぼる煙（銭湯の煙突・夕餉の炊事）。低空（窓辺・街）で見える＝高所の雲海では隠す
  if (kind !== 'yato') {
    const bathNight = isNight || duskAmt > 0.16
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0xe8e4dc, transparent: true, opacity: 0, depthWrite: false, fog: true })
    // 煙の源を作る共通関数。各源ごとに上昇高さ・なびき・広がり・濃さを持たせる。
    const mkSmoke = (mx, my, mz, n, params) => { const g = new THREE.Group(); g.position.set(mx, my, mz)
      for (let s = 0; s < n; s++) { const pf = new THREE.Mesh(new THREE.SphereGeometry(1.0, 7, 6), smokeMat.clone()); pf.userData = { ph: s / n, spd: 0.8 + R() * 0.4 }; g.add(pf) }
      g.userData = params; town.add(g); townSmoke.push(g) }
    // 銭湯（煉瓦の高い煙突＝遠くからの目印）
    const sx = -24, sz = -34, sgy = heightAt(sx, sz)
    const bath = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 6), toon(0xcdbfa6)); body.position.y = 2.1; body.castShadow = true; bath.add(body) // 浴場の建物
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 2.6, 4), toon(0x6b6f74)); roof.rotation.y = Math.PI / 4; roof.position.y = 5.5; bath.add(roof) // 寄棟風の屋根
    const noren = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 0.12), new THREE.MeshBasicMaterial({ color: bathNight ? 0xffe0b0 : 0xb9b3c4, fog: true })); noren.position.set(0, 2.0, 3.06); bath.add(noren) // 入口の暖簾（夕夜は内から灯る）
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.86, 13, 10), toon(0x9a5a44)); ch.position.set(2.4, 10.7, -1.6); ch.castShadow = true; bath.add(ch) // 煉瓦の煙突
    bath.position.set(sx, sgy, sz); town.add(bath)
    mkSmoke(sx + 2.4, sgy + 17, sz - 1.6, 6, { rise: 12, drift: 4.5, maxSc: 2.6, op: 0.3 }) // 煙突の口から濃く高く
    // 夕餉の煙（夕暮れ以降のみ・家々の屋根から細くたなびく＝人の暮らしの気配。窓辺の主視界に散らす）
    if (bathNight) for (const [hx, hz] of [[-8, -52], [16, -44], [-34, -60], [6, -30]]) { const gy = heightAt(hx, hz); if (gy < SEA.level + 0.6) continue; mkSmoke(hx, gy + 4.2, hz, 4, { rise: 6.5, drift: 2.2, maxSc: 1.3, op: 0.14 }) } // 細く淡く
  }
  let lastCloudHi = true // 雲海の世界の表示状態（変化時だけ visible を書き換える）
  let cloudRevealMats = null // 雲海の世界の材（高度フェードで透明度を動かし、ポップでなく滲み出させる）。初回の高所フレームで収集
  let lastDeep = false // 雲海の奥深く（街が雲に隠れる高度）か。街を丸ごと隠して負荷半減
  let glory = null // ブロッケンの虹輪（雲海の上を晴れた日に飛ぶと自分の影を囲む円い虹）
  let cloudWalkInfo = null // 雲上の回遊群島（歩ける島＋吊り橋）。active生成後に active.cloudWalk へ渡す
  let rainbowArch = null // 雲海の上にかかる、くぐれる虹のアーチ
  const THERMALS = [] // 上昇気流の柱（暖かい街・丘・雲の塔・くつろぎ群島の上）。巡航中ふわっと持ち上げる＝ソアリング
  let gustT = 6 + Math.random() * 10, gustAmt = 0, gustVX = 0, gustVZ = 0, gustUp = 0 // そよ風/突風＝空気が生きている
  let chimeT = 6 // 静かな瞬間の鈴の間合い
  let chimeCount = 0, wingCount = 0 // 検証用カウンタ（鈴・羽音の発火数）
  // 雲上の歩行面の高さ＝島の上(平ら)か橋の上(端点間を補間＋たわみ)。歩ける範囲外は null。
  const cloudSurfaceY = (x, z) => {
    if (!cloudWalkInfo) return null
    for (const n of cloudWalkInfo.nodes) { if (Math.hypot(x - n.x, z - n.z) <= n.r) return n.topY }
    for (const br of cloudWalkInfo.bridges) {
      const dx = br.bx - br.ax, dz = br.bz - br.az, L2 = dx * dx + dz * dz
      const t = ((x - br.ax) * dx + (z - br.az) * dz) / L2
      if (t < 0 || t > 1) continue
      if (Math.hypot(x - (br.ax + dx * t), z - (br.az + dz * t)) <= br.halfW) return br.ay + (br.by - br.ay) * t - Math.sin(Math.PI * t) * br.sag
    }
    return null
  }
  if (kind === 'town' && BufferGeometryUtils.mergeGeometries) {
    // 雲の頂点に「陽の当たる暖白い頂 → 翳る冷たい底」の階調を焼く（法線頼みでなく確実に“雲らしい”立体陰影＝水彩調）。
    const cloudTint = (geo, y0, y1, lo, hi) => {
      const pos = geo.attributes.position, n = pos.count, arr = new Float32Array(n * 3)
      const a = new THREE.Color(lo), bC = new THREE.Color(hi), c = new THREE.Color()
      for (let i = 0; i < n; i++) { let t = (pos.getY(i) - y0) / (y1 - y0); t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t); c.copy(a).lerp(bC, t); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    }
    // 夕焼けは雲海のいちばんの見せ場＝頂を茜金、谷を青紫の影に染める（duskで補間）。夜/雪は別色なので染めない。
    const dk = (SNOWY || isNight) ? 0 : duskAmt
    const seaLowC = new THREE.Color(SNOWY ? 0xccd2dc : (isNight ? 0x6c6678 : 0xa9b4c4)).lerp(new THREE.Color(0x8e7896), dk * 0.7).getHex() // 谷の翳り（雲の底＝粒の立体感のため深めの灰青／夜は鋼青を脱し少し温かいすみれ灰／夕は青紫へ）
    const seaHighC = new THREE.Color(SNOWY ? 0xe9edf2 : (isNight ? 0xbcb6c2 : 0xeee7d6)).lerp(new THREE.Color(0xf0bf8c), dk * 0.72).getHex() // 陽/月の当たる頂（純白を避けた柔らかいクリーム＝白飛び防止／夜は冷たすぎない月銀／夕はほのか茜金へ）
    // 群島（鳥居・五重塔・御神木・茅葺き）。それぞれ違うシルエットの発見。雲海をくぼませて据える。
    const isleGrass = isNight ? 0x3a5642 : 0x6f9a5c, isleRock = isNight ? 0x484540 : 0x7b6f60
    const tn = (col) => new THREE.MeshToonMaterial({ color: col, gradientMap: grad })
    const collarMat = new THREE.MeshBasicMaterial({ color: isNight ? 0xb0b6c8 : 0xf4f3ee, transparent: true, opacity: isNight ? 0.42 : 0.62, depthWrite: false, fog: false }) // 雲の襟（島の腰に巻く薄雲）
    const isleGrassMat = mottleMat(isleGrass, 150, 0.19, [3, 3]) // 島の草頂＝水彩ムラ（ベタ塗りの平面を脱す。色斑を大きめ＝島スケールで面の変化が読める）。全島で共有＝描画コール/テクスチャを増やさない
    const isleTreeMats = (isNight ? [0x2c4632, 0x243c2c, 0x35533e] : [0x4a7a48, 0x568a50, 0x3e6a3e]).map((c) => tn(c)) // 樹冠を数色の緑で層に＝脱ローポリの奥行き（全島共有）
    const isleBarkMat = tn(isNight ? 0x3a2e26 : 0x5a4634)
    const makeFloatIsle = (r) => {
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 2.4, 22), isleGrassMat)) // 草の頂（水彩ムラ）
      const rk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.2, r * 1.0, 16), tn(isleRock)); rk.position.y = -r * 0.5; g.add(rk) // 下へ細る岩肌（先を切った台形＝針のように尖った逆円錐を脱す）
      // 雲の襟＝島の腰に薄い雲のクッションを巻き、岩の底を雲海に溶かす（とがった底が宙に浮いて見えるのを防ぐ）。1メッシュに統合＝描画コール+1のみ。
      { const collarGeos = [], nc = 5 + ((r / 7) | 0), cM = new THREE.Matrix4()
        for (let i = 0; i < nc; i++) { const a = (i / nc) * 6.283 + R() * 0.6, rr = r * (0.82 + R() * 0.28), pf = new THREE.IcosahedronGeometry(r * (0.32 + R() * 0.18), 1); pf.scale(1.25, 0.5, 1.25); cM.makeTranslation(Math.cos(a) * rr, -r * (0.08 + R() * 0.22), Math.sin(a) * rr); pf.applyMatrix4(cM); collarGeos.push(pf) }
        const cm = BufferGeometryUtils.mergeGeometries ? BufferGeometryUtils.mergeGeometries(collarGeos, false) : null; collarGeos.forEach((g2) => g2.dispose()); if (cm) g.add(new THREE.Mesh(cm, collarMat)) }
      // 草の頂にぽつぽつ低木＝平らな草地を脱し雲の島に緑の生命感（少数・島は低空で一括カリング＝発熱安全）
      const bushC = tn(isNight ? 0x2e4a36 : 0x4f7a4e), grassC = tn(isNight ? 0x32543a : 0x5f8a4e), nb = 3 + ((r / 7) | 0)
      for (let i = 0; i < nb; i++) { const a = R() * 6.28, rr = r * (0.5 + R() * 0.4), bs = 0.6 + R() * 0.9; const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(bs, 1), bushC); bush.scale.y = 0.6 + R() * 0.4; bush.position.set(Math.cos(a) * rr, 1.2 + bs * 0.4, Math.sin(a) * rr); g.add(bush) } // 大小の茂みを縁に寄せて（中央の構造物を避ける）
      { const gg = [], ng = 14 + ((r * 0.8) | 0) // 草むら＝縁〜内側まで密に（1メッシュへ統合＝瑞々しさを足しても描画+1のみ。平らな草地を脱す）
        for (let i = 0; i < ng; i++) { const a = R() * 6.28, rr = r * (0.3 + R() * 0.64), tg = new THREE.ConeGeometry(0.11, 0.42 + R() * 0.5, 4); tg.translate(Math.cos(a) * rr, 1.45, Math.sin(a) * rr); gg.push(tg) }
        if (gg.length && BufferGeometryUtils.mergeGeometries) { const gm = BufferGeometryUtils.mergeGeometries(gg, false); gg.forEach((x) => x.dispose()); if (gm) g.add(new THREE.Mesh(gm, grassC)) } }
      if (!isNight) for (let i = 0; i < nb + 2; i++) { const a = R() * 6.28, rr = r * (0.5 + R() * 0.4); const fl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), tn([0xeef0ee, 0xf0d850, 0xe6a8cc, 0xf0b8d0][(R() * 4) | 0])); fl.position.set(Math.cos(a) * rr, 1.42, Math.sin(a) * rr); g.add(fl) } // 野花の彩り（昼・縁に）
      const ntr = r > 14 ? 2 : 1 // 小さな木を外縁(r*0.78以遠＝中央の構造物の外)に。縦の緑で群島のシルエットを豊かに
      for (let i = 0; i < ntr; i++) { const a = R() * 6.28, rr = r * (0.78 + R() * 0.14), tx = Math.cos(a) * rr, tz = Math.sin(a) * rr, th = 2.4 + R() * 1.6, cy = 1.2 + th
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, th, 6), isleBarkMat); trunk.position.set(tx, 1.2 + th / 2, tz); g.add(trunk)
        for (const [dx, dy, dz, rad, ci] of [[0, 0.7, 0, 1.5 + R() * 0.6, 0], [(R() - 0.5) * 1.5, 0.05, (R() - 0.5) * 1.5, 1.05 + R() * 0.5, 1], [(R() - 0.5) * 1.2, 1.35, (R() - 0.5) * 1.0, 0.85 + R() * 0.4, 2]]) {
          const cl = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 2), isleTreeMats[ci]); cl.scale.y = 0.94; cl.position.set(tx + dx, cy + dy, tz + dz); g.add(cl) } } // 3層の樹冠（det2で丸く・色差で立体＝脱ローポリ）
      return g
    }
    const isles = []
    // 鳥居の島
    { const g = makeFloatIsle(16), toriiMat = tn(isNight ? 0x7a3026 : 0xc34a32), th = 12, tw = 8
      for (const sx of [-1, 1]) { const pi = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.64, th, 8), toriiMat); pi.position.set(sx * tw * 0.5, th * 0.5 + 1.2, 0); g.add(pi) }
      const kasa = new THREE.Mesh(new THREE.BoxGeometry(tw + 3.4, 0.95, 1.7), toriiMat); kasa.position.set(0, th + 1.4, 0); g.add(kasa)
      const nuki = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.6, 0.7, 1.1), toriiMat); nuki.position.set(0, th - 1.8, 0); g.add(nuki) // 貫
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.62, 7, 6), tn(0x5a4636)); trunk.position.set(8, 4.5, -3); g.add(trunk)
      const pine = new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 2), tn(isNight ? 0x2e4a36 : 0x47704a)); pine.position.set(8, 9, -3); pine.scale.y = 0.85; g.add(pine)
      isles.push({ x: -60, z: -440, r: 40, g }) }
    // 五重塔の島
    { const g = makeFloatIsle(15), pagMat = tn(isNight ? 0x6a4a3e : 0x9c5a44), roofMat = tn(isNight ? 0x33384a : 0x49545f)
      let py = 1
      for (let t = 0; t < 5; t++) { const w = 6.4 - t * 0.95; const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 2.0, w * 0.6), pagMat); body.position.y = py + 1.0; g.add(body); const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.82, 1.5, 4), roofMat); roof.rotation.y = Math.PI / 4; roof.position.y = py + 2.5; g.add(roof); py += 3.0 }
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 3, 6), roofMat); spire.position.y = py + 0.4; g.add(spire) // 相輪
      isles.push({ x: 95, z: -510, r: 40, g }) }
    // 御神木（大樹）の島
    { const g = makeFloatIsle(15), canMat = tn(isNight ? 0x2e4a36 : 0x4f7a4e)
      const tk = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.7, 9, 8), tn(0x5a4636)); tk.position.y = 4.4; g.add(tk)
      for (let c = 0; c < 5; c++) { const cs = 4.5 + R() * 3, cl = new THREE.Mesh(new THREE.IcosahedronGeometry(cs, 2), canMat); cl.position.set((R() - 0.5) * 7, 9.5 + (R() - 0.5) * 4, (R() - 0.5) * 7); cl.scale.y = 0.9; g.add(cl) } // 大きな樹冠
      isles.push({ x: -175, z: -500, r: 42, g }) }
    // 茅葺きの一軒家の島（故郷のぬくもり）
    { const g = makeFloatIsle(14), wallMat = tn(isNight ? 0x6a6052 : 0xd0c4a8), thatchMat = tn(isNight ? 0x4a4236 : 0x8a7a54)
      const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.0, 5), wallMat); body.position.y = 2.5; g.add(body)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 3.4, 4), thatchMat); roof.rotation.y = Math.PI / 4; roof.position.y = 5.4; g.add(roof) // 寄棟茅葺
      isles.push({ x: 10, z: -380, r: 38, g }) }
    for (const il of isles) { il.g.position.set(il.x, SEA_Y + 18, il.z); il.g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } }); scene.add(il.g); cloudObjs.push(il.g) }

    // ── 雲上の回遊できる群島：歩いて渡れる島々を吊り橋でつなぐ。降り立って佇み、橋を渡って巡る“休息の世界” ──
    const GY = 1.2 // makeFloatIsle の草の頂上面(local)
    const cwNodes = [
      { x: -20, z: -290, r: 22, topY: SEA_Y + 22, kind: 'pavilion' }, // 中心＝東屋の広場
      { x: 40, z: -298, r: 12, topY: SEA_Y + 20, kind: 'teahouse' },  // 茶屋
      { x: -62, z: -270, r: 12, topY: SEA_Y + 24, kind: 'lookout' },  // 見晴らし台
      { x: -2, z: -336, r: 11, topY: SEA_Y + 19, kind: 'shrine' },    // 小さな祠
      { x: 30, z: -256, r: 12, topY: SEA_Y + 21, kind: 'onsen' },     // 雲の温泉（露天＝湯けむり）
      { x: -84, z: -318, r: 17, topY: SEA_Y + 27, kind: 'ruin' },     // 緑に還る空の社跡（廃墟＋御神木＝静かな驚き。雲海の感情のクライマックス）
      { x: 58, z: -334, r: 15, topY: SEA_Y + 22, kind: 'paddy' },     // 空の棚田と水鏡（谷戸を空へ＝故郷の幹と直結。段々田が空/夕陽を映す）
      { x: -34, z: -366, r: 17, topY: SEA_Y + 20, kind: 'market' },   // 無人の灯籠市（売り手のいない夜店＋連なる提灯＝逢魔が時の郷愁）
      { x: -100, z: -360, r: 16, topY: SEA_Y + 25, kind: 'colonnade' }, // 眠る石像の回廊（苔むした石柱の並木＋顔のない石の番人＝安心の守り手）
      { x: 90, z: -340, r: 13, topY: SEA_Y + 19, kind: 'well' },      // 天の井戸（覗くと下界の街の灯がかすかに見える＝天と地をつなぐ縦の没入）
      { x: 120, z: -312, r: 14, topY: SEA_Y + 18, kind: 'station' },  // 空の無人駅（一本の線路が雲へ消える終着駅＝旅情と郷愁の白眉。長い橋の先・東の縁）
    ]
    const cwBridges = []
    const link = (i, j) => { const a = cwNodes[i], b = cwNodes[j]; cwBridges.push({ ax: a.x, az: a.z, ay: a.topY, bx: b.x, bz: b.z, by: b.topY, halfW: 2.4, sag: 2.6, ra: a.r - 1, rb: b.r - 1 }) }
    link(0, 1); link(0, 2); link(0, 3); link(0, 4); link(2, 5); link(1, 6); link(3, 7); link(5, 8); link(6, 9); link(9, 10) // 中心から各島へ／見晴らし台→社跡→回廊／茶屋→棚田→天の井戸→空の無人駅（東の終着）／祠→灯籠市
    const makeBridge = (br) => { // 板＋垂れる手すりロープ＋門柱の吊り橋
      const g = new THREE.Group(), dx = br.bx - br.ax, dz = br.bz - br.az, len = Math.hypot(dx, dz), px = -dz / len, pz = dx / len
      const plankMat = tn(isNight ? 0x5a4636 : 0x7a5d44), ropeMat = tn(isNight ? 0x47403a : 0x6b5a44)
      const N = Math.max(8, Math.round(len / 1.5)), ang = Math.atan2(dx, dz), surfY = (t) => br.ay + (br.by - br.ay) * t - Math.sin(Math.PI * t) * br.sag
      for (let i = 0; i <= N; i++) { const t = i / N; const plank = new THREE.Mesh(new THREE.BoxGeometry(br.halfW * 2, 0.16, 0.9), plankMat); plank.position.set(br.ax + dx * t, surfY(t), br.az + dz * t); plank.rotation.y = ang; g.add(plank) }
      for (const side of [-1, 1]) for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N
        const x0 = br.ax + dx * t0 + px * br.halfW * side, z0 = br.az + dz * t0 + pz * br.halfW * side, y0 = surfY(t0) + 1.2
        const x1 = br.ax + dx * t1 + px * br.halfW * side, z1 = br.az + dz * t1 + pz * br.halfW * side, y1 = surfY(t1) + 1.2
        const sl = Math.hypot(x1 - x0, y1 - y0, z1 - z0), rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, sl, 5), ropeMat)
        rope.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3((x1 - x0) / sl, (y1 - y0) / sl, (z1 - z0) / sl)); g.add(rope) }
      const ux = dx / len, uz = dz / len // 門柱は島の中心でなく「橋が島の縁に取り付く点」に立てる（中央に門柱が密集する不可解な束を防ぐ）
      for (const [ex, ez, ey] of [[br.ax + ux * (br.ra || 0), br.az + uz * (br.ra || 0), br.ay], [br.bx - ux * (br.rb || 0), br.bz - uz * (br.rb || 0), br.by]]) for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.6, 6), plankMat); post.position.set(ex + px * br.halfW * side, ey + 1.0, ez + pz * br.halfW * side); g.add(post) }
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } }); return g
    }
    for (const br of cwBridges) { const bg = makeBridge(br); scene.add(bg); cloudObjs.push(bg) }
    // 雲上のひと（浴衣姿の素朴な人影）。賑わいを少しだけ＝無人の静けさは保ちつつ人の気配を点々と灯す。tn材で陰影付き。
    const folkSkin = tn(isNight ? 0xae9686 : 0xe6c2a2), folkHair = tn(isNight ? 0x2a2622 : 0x352e28), folkObi = tn(isNight ? 0x6a5a3a : 0xb89a5a)
    const addFolk = (g, x, y, z, ry, robeHue, seated) => {
      const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry
      const robe = tn(robeHue), hipH = seated ? 0.34 : 0.6, topH = 0.5
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.19, seated ? 0.24 : 0.3, hipH, 8), robe); lower.position.y = hipH / 2; grp.add(lower) // 裾
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, topH, 8), robe); upper.position.y = hipH + topH / 2; grp.add(upper) // 上体
      const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.1, 8), folkObi); obi.position.y = hipH + 0.03; grp.add(obi) // 帯
      for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, topH * 0.92, 5), robe); arm.position.set(s * 0.2, hipH + topH * 0.46, 0.02); arm.rotation.z = s * 0.16; grp.add(arm) } // 腕（袖）＝瓶感を脱す
      if (seated) { const lap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.46), robe); lap.position.set(0, hipH - 0.04, 0.2); grp.add(lap) } // 膝（前へ）
      const neck = hipH + topH
      { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), robe); sh.scale.set(1.06, 0.4, 0.62); sh.position.y = neck - 0.04; grp.add(sh) } // 肩（横に張る稜線＝こけし/瓶を脱し「肩のある人」に）
      grp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.09, 6), folkSkin).translateY(neck + 0.04)) // 首＝頭が肩にめり込まず人らしい間が出る
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.122, 10, 8), folkSkin); head.position.y = neck + 0.16; head.scale.set(0.95, 1.06, 0.96); grp.add(head) // 頭は小さめ＝頭身を伸ばす（こけしの大頭を脱す）
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), folkHair); hair.scale.set(1, 0.78, 1); hair.position.set(0, neck + 0.2, -0.015); grp.add(hair)
      g.add(grp); return grp
    }
    for (const n of cwNodes) { // 各島を建てる
      const g = makeFloatIsle(n.r)
      if (n.kind === 'pavilion') {
        // 四阿（あずまや）＝雲海を座って眺める休憩所。板張りの床＋六本柱＋深い軒の八角寄棟屋根＋擬宝珠＋縁の腰掛け。
        const woodMat = tn(isNight ? 0x5a4636 : 0x6e5640), azRoof = tn(isNight ? 0x3a3f4a : 0x7a5a48), ridgeMat = tn(isNight ? 0x4a4038 : 0x66483a)
        const stoneBase = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 9.0, 0.5, 8), tn(isNight ? 0x646670 : 0xa8a294)); stoneBase.position.y = GY + 0.05; g.add(stoneBase) // 石の基壇
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(7.7, 7.7, 0.34, 8), tn(isNight ? 0x6a5240 : 0x8a6b4a)); deck.position.y = GY + 0.36; g.add(deck) // 板張りの床
        const NP = 6, pr = 6.9
        const ang = (i) => i / NP * Math.PI * 2 + Math.PI / NP
        for (let i = 0; i < NP; i++) { const a = ang(i); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 5.7, 8), woodMat); post.position.set(Math.cos(a) * pr, GY + 3.05, Math.sin(a) * pr); g.add(post) } // 六本柱
        const beamRing = new THREE.Mesh(new THREE.TorusGeometry(pr, 0.26, 6, 8), woodMat); beamRing.rotation.x = Math.PI / 2; beamRing.position.y = GY + 5.75; g.add(beamRing) // 桁（柱頭を結ぶ）
        const eave = new THREE.Mesh(new THREE.ConeGeometry(9.5, 1.2, 8), azRoof); eave.rotation.y = Math.PI / 8; eave.position.y = GY + 6.05; g.add(eave) // 深い軒先
        const azr = new THREE.Mesh(new THREE.ConeGeometry(7.7, 4.1, 8), azRoof); azr.rotation.y = Math.PI / 8; azr.position.y = GY + 7.7; g.add(azr) // 主屋根（八角寄棟）
        const ridge = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.3, 8), ridgeMat); ridge.rotation.y = Math.PI / 8; ridge.position.y = GY + 9.9; g.add(ridge) // 頂の段
        const giboshi = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), tn(isNight ? 0x7a6a4a : 0xb9a060)); giboshi.position.y = GY + 10.7; g.add(giboshi) // 擬宝珠
        // 縁の腰掛け（柱間の4辺。背もたれ無しの板＝縁側に腰かけて雲海を眺める。2辺は橋・出入りのため開ける）
        const benchMat = tn(isNight ? 0x5a4636 : 0x6e5640), br0 = 5.7
        for (const i of [0, 1, 3, 4]) { const a = (i + 0.5) / NP * Math.PI * 2 + Math.PI / NP, cx = Math.cos(a) * br0, cz = Math.sin(a) * br0
          const seat = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.32, 1.05), benchMat); seat.position.set(cx, GY + 1.05, cz); seat.rotation.y = -a - Math.PI / 2; g.add(seat)
          const tx = -Math.sin(a), tz = Math.cos(a) // 接線方向
          for (const lo of [-1.9, 1.9]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.05, 0.85), benchMat); leg.position.set(cx + tx * lo, GY + 0.52, cz + tz * lo); g.add(leg) } }
        const lantStone = tn(isNight ? 0x707280 : 0x9a948a)
        for (const [lx, lz] of [[-14, 6], [13, -7]]) {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.0, 6), lantStone); base.position.set(lx, GY + 0.5, lz); g.add(base)
          const fire = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), new THREE.MeshToonMaterial({ color: isNight ? 0xffd49a : 0xcfc8ba, gradientMap: grad, emissive: new THREE.Color(isNight ? 0xff9c4e : 0x000000), emissiveIntensity: isNight ? 1.0 : 0 })); fire.position.set(lx, GY + 1.8, lz); g.add(fire)
          const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.7, 6), lantStone); cap.position.set(lx, GY + 2.7, lz); g.add(cap)
        }
        // 雲海を眺める人＝東屋の縁に腰かけ、外（雲の海）へ顔を向けて佇む。休息の世界に人の気配を添える（東屋に人物・評価）。
        const skSit = tn(isNight ? 0xc6a886 : 0xe6c6a4), clSit = tn(isNight ? 0x55617a : 0x7a8aa0), hairSit = tn(0x2a1f18)
        const mkSitter = (bi) => {
          const a = (bi + 0.5) / NP * Math.PI * 2 + Math.PI / NP, sx = Math.cos(a) * (br0 - 0.2), sz = Math.sin(a) * (br0 - 0.2)
          const grp = new THREE.Group(); grp.position.set(sx, GY + 1.21, sz); grp.rotation.y = Math.PI / 2 - a // 前(+z)を外向き＝雲海へ顔を向ける
          const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.6), clSit); thigh.position.set(0, 0, 0.26); grp.add(thigh) // 腿（前へ）
          for (const s of [-1, 1]) { const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.62, 6), clSit); shin.position.set(s * 0.13, -0.4, 0.5); grp.add(shin) } // すね（下へ）
          const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.66, 8), clSit); torso.position.set(0, 0.42, -0.04); grp.add(torso) // 胴
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skSit); head.position.set(0, 0.92, -0.02); grp.add(head) // 頭
          const hr = new THREE.Mesh(new THREE.SphereGeometry(0.17, 9, 7, 0, 6.2832, 0, Math.PI * 0.6), hairSit); hr.position.set(0, 0.94, -0.05); grp.add(hr) // 髪
          for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.52, 5), clSit); arm.position.set(s * 0.22, 0.42, 0.06); arm.rotation.x = 0.45; grp.add(arm) } // 腕（膝の上へ）
          grp.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } }); g.add(grp)
        }
        mkSitter(0); mkSitter(3) // 向かい合わぬ二辺に二人＝静かに雲を眺める
      } else if (n.kind === 'teahouse') { // 峠の茶屋＝茅葺の小屋＋暖簾＋緋毛氈の縁台＋茶器＋軒の提灯（雲海を眺めて一服する郷愁）
        const glowT = isNight || dk > 0.2, woodT = tn(isNight ? 0x5a4636 : 0x6e5640), redT = tn(isNight ? 0x7a2e28 : 0xb2402f)
        const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3.0, 5), tn(isNight ? 0x6a6052 : 0xd8cdb2)); body.position.set(0, GY + 1.5, -1); g.add(body)
        const roof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 3.0, 4), tn(isNight ? 0x4a4236 : 0x8a7a54)); roof.rotation.y = Math.PI / 4; roof.position.set(0, GY + 4.3, -1); g.add(roof) // 茅葺の茶屋
        const noren = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 0.08), redT); noren.position.set(0, GY + 2.4, 1.55); g.add(noren) // 入口の暖簾
        const bench = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 1.2), woodT); bench.position.set(0, GY + 0.9, 3.4); g.add(bench) // 縁台
        for (const lx of [-1.6, 1.6]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.8, 1.0), woodT); leg.position.set(lx, GY + 0.4, 3.4); g.add(leg) }
        const felt = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.06, 1.3), redT); felt.position.set(0, GY + 1.13, 3.4); g.add(felt) // 緋毛氈
        for (const [tx, kind] of [[-1.3, 0], [0.2, 1], [1.3, 0]]) { // 湯のみ／急須（誰かが置いていった一服）
          if (kind === 0) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 8), tn(isNight ? 0x9a9488 : 0xe8e0d2)); cup.position.set(tx, GY + 1.27, 3.4); g.add(cup) }
          else { const pot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), tn(isNight ? 0x4a443c : 0x6a5e4e)); pot.scale.y = 0.8; pot.position.set(tx, GY + 1.33, 3.4); g.add(pot); const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 5), tn(isNight ? 0x4a443c : 0x6a5e4e)); spout.rotation.z = 0.9; spout.position.set(tx + 0.26, GY + 1.36, 3.4); g.add(spout) } }
        const lpz = 1.8, lant = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.66, 10), new THREE.MeshToonMaterial({ color: isNight ? 0xffcaa0 : 0xf0e0c0, gradientMap: grad, emissive: new THREE.Color(glowT ? 0xff8a3c : 0x000000), emissiveIntensity: glowT ? (isNight ? 1.1 : 0.5) : 0 })); lant.scale.y = 1.2; lant.position.set(2.2, GY + 3.0, lpz); g.add(lant) // 軒の提灯
        const banner = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.06), tn(isNight ? 0x8a8478 : 0xeae2d2)); banner.position.set(-3.4, GY + 2.3, 2.2); g.add(banner) // 「茶」の幟（白い布）
        const bpole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.0, 5), woodT); bpole.position.set(-3.75, GY + 2.0, 2.2); g.add(bpole)
        queueCloudFolk(g, -2.0, GY, 4.0, 0.1, isNight ? 0x33485e : 0x4a6b80)  // 縁台のそばに立ち雲海を眺める（藍の浴衣）
        queueCloudFolk(g, 2.0, GY, 4.0, -0.1, isNight ? 0x5e3a44 : 0x9a5a4a)   // もう一人（茜の浴衣）
      } else if (n.kind === 'lookout') { // 見晴らし台＝雲海へ張り出す欄干＋望遠鏡＋腰かけ＋木（「台」の実体を与え本物の展望地に）
        const woodMat = tn(isNight ? 0x5a4636 : 0x6e5640)
        const bench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 1.3), woodMat); bench.position.set(0, GY + 0.9, 1.5); g.add(bench) // 縁の腰かけ（欄干の手前へ）
        for (const lx of [-1.8, 1.8]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 1.1), woodMat); leg.position.set(lx, GY + 0.45, 1.5); g.add(leg) }
        const railZ = 7.4 // 雲海側へ張り出す欄干（手すり）
        for (let i = -2; i <= 2; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.4, 6), woodMat); p.position.set(i * 2.0, GY + 0.7, railZ); g.add(p) }
        const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8.4, 6), woodMat); topRail.rotation.z = Math.PI / 2; topRail.position.set(0, GY + 1.35, railZ); g.add(topRail)
        const midRail = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 8.4, 6), woodMat); midRail.rotation.z = Math.PI / 2; midRail.position.set(0, GY + 0.85, railZ); g.add(midRail)
        const teleStand = tn(isNight ? 0x556070 : 0x7a8a9a) // 100円双眼鏡風の望遠鏡＝雲海へ向ける（郷愁）
        const tpost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.5, 8), teleStand); tpost.position.set(2.6, GY + 0.75, 5.6); g.add(tpost)
        const tbody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 1.4, 10), teleStand); tbody.rotation.x = Math.PI / 2 - 0.5; tbody.position.set(2.6, GY + 1.65, 5.7); g.add(tbody)
        const teye = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 8), tn(0x33363c)); teye.rotation.x = Math.PI / 2 - 0.5; teye.position.set(2.6, GY + 1.36, 5.18); g.add(teye)
        const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 6, 7), tn(0x5a4636)); tk.position.set(-5, GY + 3, -4); g.add(tk)
        const can = new THREE.Mesh(new THREE.IcosahedronGeometry(4.6, 2), tn(isNight ? 0x2e4a36 : 0x4f7a4e)); can.position.set(-5, GY + 7, -4); can.scale.y = 0.85; g.add(can)
      } else if (n.kind === 'shrine') { // 小さな祠＋鳥居
        const trMat = tn(isNight ? 0x7a3026 : 0xc34a32), th = 7, tw = 5
        for (const sx of [-1, 1]) { const pi = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, th, 8), trMat); pi.position.set(sx * tw * 0.5, GY + th * 0.5, 4); g.add(pi) }
        const kasa = new THREE.Mesh(new THREE.BoxGeometry(tw + 2, 0.7, 1.2), trMat); kasa.position.set(0, GY + th + 0.3, 4); g.add(kasa)
        const hond = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 2.4), tn(isNight ? 0x5a4636 : 0x7a5d44)); hond.position.set(0, GY + 1.7, -2); g.add(hond)
        const hroof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.6, 4), tn(isNight ? 0x3a3f4a : 0x49545f)); hroof.rotation.y = Math.PI / 4; hroof.position.set(0, GY + 3.6, -2); g.add(hroof)
      } else if (n.kind === 'ruin') { // 緑に還る空の社跡＝苔むした石組みの円遺構＋倒れた鳥居の柱を、巨大な御神木が根で抱く。人はいない、風と水音だけ（IPセーフな独自意匠＝磐座/野仏/御神木）
        const stone = tn(isNight ? 0x4e4e4a : 0x8b867b), moss = tn(isNight ? 0x33473a : 0x5f7a4c), bark = tn(isNight ? 0x3a2e26 : 0x5a4634), leaf = tn(isNight ? 0x2c4634 : 0x4f7a4a)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.6, 0.7, 16), stone); base.position.y = GY + 0.35; g.add(base) // 崩れた円形の石壇（下段）
        const tier = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.6, 14), stone); tier.position.set(0.6, GY + 0.9, -0.4); g.add(tier) // 上段（少しずれて欠ける）
        for (let i = 0; i < 5; i++) { const a = R() * 6.28, rr = 3 + R() * 5; const blk = new THREE.Mesh(new THREE.BoxGeometry(0.8 + R() * 1.2, 0.5 + R() * 0.5, 0.8 + R() * 1.2), R() < 0.4 ? moss : stone); blk.position.set(Math.cos(a) * rr, GY + 0.55, Math.sin(a) * rr); blk.rotation.set(R() * 0.3, R() * 6.28, R() * 0.3); g.add(blk) } // 割れた石畳・転がる石
        const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6, 8), stone); p1.position.set(-5, GY + 3, 5); p1.rotation.z = 0.08; g.add(p1) // 立ち残った石柱
        const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6.5, 8), stone); p2.position.set(5.5, GY + 1.0, 4.2); p2.rotation.z = -1.18; p2.rotation.y = 0.3; g.add(p2) // 倒れた石柱（廃墟）
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.9, 9.5, 9), bark); trunk.position.set(1, GY + 4.6, -2); g.add(trunk) // 御神木の幹
        for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + 0.4; const root = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.55, 4.6, 6), bark); root.position.set(1 + Math.cos(a) * 1.7, GY + 1.1, -2 + Math.sin(a) * 1.7); root.rotation.set(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55); g.add(root) } // 根が石壇を抱く
        const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(6.6, 2), leaf); canopy.position.set(1, GY + 11.2, -2); canopy.scale.set(1.12, 0.92, 1.12); g.add(canopy) // 大きな樹冠
        const canopy2 = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 1), leaf); canopy2.position.set(-3, GY + 9.6, 0.5); g.add(canopy2)
        for (let i = 0; i < 5; i++) { const a = R() * 6.28, rr = R() * 7.5; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + R() * 0.7, 0), moss); m.position.set(Math.cos(a) * rr, GY + 0.78, Math.sin(a) * rr); m.scale.y = 0.5; g.add(m) } // 苔のむら
        const bibMat = tn(isNight ? 0x7a2e26 : 0xbe3b2e) // 赤いよだれかけ（地蔵／道祖神＝郷愁の直球）
        for (const [gx2, gz2] of [[-6.5, -3], [4.5, 6.5]]) { // 顔のない丸い石の番人（野仏／道祖神＝安心の守り手）
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.95, 1.6, 8), stone); body.position.set(gx2, GY + 0.8, gz2); g.add(body)
          const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), stone); head.position.set(gx2, GY + 1.9, gz2); g.add(head)
          const moc = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), moss); moc.position.set(gx2, GY + 2.28, gz2); moc.scale.y = 0.5; g.add(moc) // 頭に苔
          const bib = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.72, 0.62, 8, 1, true), bibMat); bib.position.set(gx2, GY + 1.32, gz2); g.add(bib) } // 赤いよだれかけ
        for (let k = 0; k < 4; k++) { const s = 0.42 - k * 0.07; const st = new THREE.Mesh(new THREE.CylinderGeometry(s, s * 1.12, 0.22, 6), R() < 0.5 ? moss : stone); st.position.set(-5.0, GY + 0.62 + k * 0.24, -3.7); st.rotation.y = k * 1.3; g.add(st) } // 賽の河原の積み石（誰かが積んだ小石＝人の気配）
        const glowOn = isNight || dk > 0.25, lantStone = tn(isNight ? 0x6a6660 : 0x9a948a) // 石灯籠＝夕夜に灯る暖かな目印
        const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.78, 1.0, 6), lantStone); lb.position.set(6.8, GY + 0.55, -2); g.add(lb)
        const lf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), new THREE.MeshToonMaterial({ color: isNight ? 0xffd49a : 0xcfc8ba, gradientMap: grad, emissive: new THREE.Color(glowOn ? 0xff9c4e : 0x000000), emissiveIntensity: glowOn ? (isNight ? 1.0 : 0.45) : 0 })); lf.position.set(6.8, GY + 1.6, -2); g.add(lf)
        const lc = new THREE.Mesh(new THREE.ConeGeometry(0.92, 0.6, 6), lantStone); lc.position.set(6.8, GY + 2.4, -2); g.add(lc)
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.8, 1.0), stone); lintel.position.set(-3.6, GY + 5.5, 5); lintel.rotation.z = 0.17; g.add(lintel) // 倒れかけた石の門（鳥居の名残）＝立ち柱に横石が斜めに架かる
        for (let k = 0; k < 4; k++) { const t = k / 4, ss = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.18, 7), stone); ss.position.set(9 - t * 7, GY + 0.5, 9 - t * 8); ss.rotation.y = k; g.add(ss) } // 飛び石の小径（橋から歩いてきた誰かの気配）
        const pool = new THREE.Mesh(new THREE.CircleGeometry(1.9, 18), freshWater(new THREE.MeshToonMaterial({ color: isNight ? 0x33484a : 0x86a8a0, gradientMap: grad, fog: true }))); pool.rotation.x = -Math.PI / 2; pool.position.set(-1.4, GY + 0.46, 2.4); g.add(pool) // 根元から滴る水＝空を映す静かな水鏡
        const leafG = new THREE.Group(); const leafMat = tn(isNight ? 0x4a5a3a : 0x9ab36a); leafMat.side = THREE.DoubleSide // 御神木から舞い落ちる葉（エモさの白眉＝ゆっくり舞い、根元で湧き直す）
        for (let i = 0; i < (LIGHT ? 7 : 12); i++) { const lf2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), leafMat); const lx = 1 + (R() - 0.5) * 11, lz = -2 + (R() - 0.5) * 11; lf2.position.set(lx, GY + 2 + R() * 11, lz); lf2.userData = { x0: lx, z0: lz, ph: R() * 6.28, spd: 0.5 + R() * 0.5 }; leafG.add(lf2) }
        g.add(leafG); skyDrifters.push({ o: leafG, kind: 'leaffall' })
      } else if (n.kind === 'paddy') { // 空の棚田と水鏡＝谷戸の段々田を空へ。水を張った田が空/夕陽を鏡のように映す（故郷の幹と直結・ノスタルジー）
        const mud = tn(isNight ? 0x4a4038 : 0x7a6048), ridge = tn(isNight ? 0x3a4632 : 0x5f7340)
        const padW = freshWater(new THREE.MeshToonMaterial({ color: isNight ? 0x35505e : (season === 'spring' ? 0xa6c4c4 : 0x8caaa4), gradientMap: grad, fog: true })) // 水鏡（空を映す水田・1材を全段で共有）
        const baseR2 = n.r - 1, tiers = 4, tierH = 1.05, step = (baseR2 - 4) / tiers
        const tuftGeos = []
        for (let k = 0; k < tiers; k++) {
          const rr = baseR2 - k * step, yBase = GY + k * tierH
          const floor = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr + 0.5, tierH + 0.3, 20), mud); floor.position.y = yBase + tierH / 2; g.add(floor) // 段の土台＋畦の壁
          const water = new THREE.Mesh(new THREE.CircleGeometry(rr - 0.7, 24), padW); water.rotation.x = -Math.PI / 2; water.position.y = yBase + tierH + 0.16; g.add(water) // 水を張った棚田
          const cnt = 7 - k // 稲株（畦沿いに。1メッシュへ統合）
          for (let i = 0; i < cnt; i++) { const a = i / cnt * 6.28 + k * 0.6; const tg = new THREE.ConeGeometry(0.16, 0.62, 5); tg.translate(Math.cos(a) * (rr - 1.0), yBase + tierH + 0.45, Math.sin(a) * (rr - 1.0)); tuftGeos.push(tg) }
        }
        if (tuftGeos.length && BufferGeometryUtils.mergeGeometries) { const tm = BufferGeometryUtils.mergeGeometries(tuftGeos, false); if (tm) g.add(new THREE.Mesh(tm, ridge)); tuftGeos.forEach((x) => x.dispose()) }
        // かかし（素朴な十字＋着物＋菅笠＝郷愁の田の番人）。最上段の中央に立つ。
        const scTop = GY + tiers * tierH + 0.2, scWood = tn(0x6a5a44)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.3, 5), scWood); pole.position.set(0, scTop + 1.15, 0); g.add(pole)
        const arms = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.12), scWood); arms.position.set(0, scTop + 1.6, 0); g.add(arms)
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.12), tn(isNight ? 0x6a5550 : 0xb08858)); cloth.position.set(0, scTop + 1.45, 0); g.add(cloth)
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.42, 9), tn(isNight ? 0x6a6450 : 0xc4b078)); hat.position.set(0, scTop + 2.2, 0); g.add(hat)
        // あぜに咲く野花（畦道の郷愁）。各段の縁に沿って小さな花株を点々と（1メッシュ統合）。季節で色が移る。
        const flG = []
        for (let k = 0; k < tiers; k++) { const rr = baseR2 - k * step, yT = GY + k * tierH + tierH + 0.2, cnt = 6 - (k > 1 ? 2 : 0)
          for (let i = 0; i < cnt; i++) { const a = i / cnt * 6.28 + k * 1.1 + 0.3, fr = rr - 0.25, fl = new THREE.SphereGeometry(0.14, 5, 4); fl.translate(Math.cos(a) * fr, yT, Math.sin(a) * fr); flG.push(fl)
            const stem = new THREE.CylinderGeometry(0.025, 0.025, 0.3, 4); stem.translate(Math.cos(a) * fr, yT - 0.2, Math.sin(a) * fr); flG.push(stem) } }
        if (flG.length && BufferGeometryUtils.mergeGeometries) { const fm = BufferGeometryUtils.mergeGeometries(flG, false); flG.forEach((x) => x.dispose()); if (fm) g.add(new THREE.Mesh(fm, tn(season === 'autumn' ? 0xc23b2e : (season === 'spring' ? 0xe6a6c4 : 0xe8e0d0)))) } // 秋=彼岸花の赤／春=れんげの桃／他=白い小花
      } else if (n.kind === 'market') { // 無人の灯籠市＝売り手のいない夜店が弧を描き、連なる提灯の暖かな天蓋が灯る（祭りの余韻・逢魔が時の郷愁）
        const glowOn = isNight || dk > 0.2
        const woodM = tn(isNight ? 0x4a3a2c : 0x6e5640), stallRoof = tn(isNight ? 0x6a2e2a : 0xb24a3e), stone = tn(isNight ? 0x55524c : 0x8b867b)
        const lamp = new THREE.MeshToonMaterial({ color: isNight ? 0xffcaa0 : 0xf0e0c0, gradientMap: grad, emissive: new THREE.Color(glowOn ? 0xff8a3c : 0x000000), emissiveIntensity: glowOn ? (isNight ? 1.15 : 0.5) : 0 }) // 提灯の灯り（夕夜に灯る・Bloomで滲む）。全提灯で共有
        const path = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.3, 18), stone); path.position.y = GY + 0.15; g.add(path) // 石畳の広場
        const stalls = LIGHT ? 4 : 5
        for (let s = 0; s < stalls; s++) {
          const a = (-0.62 + s / (stalls - 1) * 1.24) * Math.PI, sx = Math.cos(a) * 6.4, sz = Math.sin(a) * 6.4
          const st = new THREE.Group(); st.position.set(sx, GY, sz); st.rotation.y = Math.atan2(-sz, -sx) // 中央(広場)を向く
          const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.2), woodM); counter.position.set(0, 0.5, 0); st.add(counter) // 台
          for (const px of [-1.1, 1.1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), woodM); post.position.set(px, 1.2, 0.2); st.add(post) }
          const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 1.6), stallRoof); roof.position.set(0, 2.4, 0.1); roof.rotation.x = -0.12; st.add(roof) // 赤い庇
          const noren = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.62, 0.06), stallRoof); noren.position.set(0, 2.0, 0.86); st.add(noren) // 暖簾
          const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.58, 8), lamp); ln.position.set(1.0, 1.85, 0.66); st.add(ln) // 軒の提灯
          g.add(st)
        }
        const poles = [[-7, 2.5], [0, -6.8], [7, 2.5]] // 提灯を渡す3本の柱
        for (const [pxx, pzz] of poles) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.4, 6), woodM); pl.position.set(pxx, GY + 2.7, pzz); g.add(pl) }
        const strand = (ax, az, bx, bz) => { const N = LIGHT ? 5 : 6; for (let i = 1; i < N; i++) { const t = i / N, lx = ax + (bx - ax) * t, lz = az + (bz - az) * t, ly = GY + 5.1 - Math.sin(Math.PI * t) * 1.3; const lan = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 7), lamp); lan.scale.y = 1.25; lan.position.set(lx, ly, lz); g.add(lan) } } // カテナリに連なる提灯
        strand(-7, 2.5, 0, -6.8); strand(0, -6.8, 7, 2.5); strand(7, 2.5, -7, 2.5) // 三辺に灯りの天蓋
        // 無人の夜店の郷愁＝柱に立てかけた閉じた番傘＋誰もいない床几（人の去った気配）
        const wagasa = new THREE.Group()
        const wshaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), tn(0x5a4636)); wshaft.position.y = 1.3; wagasa.add(wshaft)
        const wpaper = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.5, 10), tn(isNight ? 0x8a3a30 : 0xc0503e)); wpaper.position.y = 1.95; wagasa.add(wpaper)
        wagasa.position.set(-6.5, GY, 2.1); wagasa.rotation.z = 0.34; g.add(wagasa)
        const shougi = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.18, 0.7), woodM); shougi.position.set(2.6, GY + 0.5, 4.6); shougi.rotation.y = -0.3; g.add(shougi) // 床几（縁台）
        for (const lx of [-0.8, 0.8]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.6), woodM); leg.position.set(2.6 + lx * Math.cos(0.3), GY + 0.25, 4.6 + lx * Math.sin(0.3)); g.add(leg) }
        const cloth2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.04), stallRoof); cloth2.position.set(2.4, GY + 0.78, 4.5); cloth2.rotation.y = -0.3; g.add(cloth2) // 床几に掛けた緋毛氈
        // ひと気を少しだけ（賑わい）＝そぞろ歩く人・店番・床几で休む人。無人の郷愁は保ちつつ祭りの温度を足す。
        queueCloudFolk(g, 7.2, GY, 0, -Math.PI / 2, isNight ? 0x4a3a2c : 0x7a5a3e)       // 中央の夜店の店番（広場を向く）
        queueCloudFolk(g, 1.4, GY, 5.0, 2.5, isNight ? 0x33485e : 0x4a6b80)              // 床几のそばで提灯を見上げる（藍の浴衣）
        queueCloudFolk(g, -1.6, GY, 1.2, 0.8, isNight ? 0x4a4030 : 0x8a6a44)             // 広場をそぞろ歩く人
        queueCloudFolk(g, 2.0, GY, -2.2, -1.9, isNight ? 0x5e3a44 : 0x9a5a4a)            // 灯りを見て回る人（茜の浴衣）
      } else if (n.kind === 'colonnade') { // 眠る石像の回廊＝苔むした石柱の並木道に顔のない石の番人が点々と座る（失われた文明の守り手・安心。IPセーフ＝野仏/磐座）。石/苔/前掛けを各1メッシュに統合
        const stoneMat = tn(isNight ? 0x4e4e4a : 0x8b867b), mossMat = tn(isNight ? 0x33473a : 0x5f7a4c), bibMat = tn(isNight ? 0x7a2e26 : 0xbe3b2e)
        const sGeo = [], mGeo = [], bGeo = []
        const pathG = new THREE.BoxGeometry(4.4, 0.3, 20); pathG.translate(0, GY + 0.15, 0); sGeo.push(pathG) // 石畳の道
        for (let i = 0; i < 6; i++) { const z = -8.5 + i * 3.4
          for (const sx of [-1, 1]) { const broken = R() < 0.35, h = broken ? 1.6 + R() * 1.4 : 5.2; const col = new THREE.CylinderGeometry(0.45, 0.55, h, 8); if (broken) col.rotateZ(sx * R() * 0.22); col.translate(sx * 3.2, GY + h / 2, z); sGeo.push(col) } // 石柱（立つ/欠ける/傾く）
          if (i % 2 === 0 && R() < 0.7) { const beam = new THREE.BoxGeometry(7.4, 0.5, 0.8); if (R() < 0.4) beam.rotateZ(0.1); beam.translate(0, GY + 5.2, z); sGeo.push(beam) } // 崩れかけた回廊の横梁
        }
        for (let i = 0; i < 5; i++) { const z = -7 + i * 3.6, sx = (i % 2 === 0 ? -1 : 1) * 2.6 // 顔のない石の番人（道の縁に座る・赤いよだれかけ・頭に苔）
          const body = new THREE.CylinderGeometry(0.55, 0.8, 1.3, 8); body.translate(sx, GY + 0.65, z); sGeo.push(body)
          const head = new THREE.SphereGeometry(0.5, 10, 8); head.translate(sx, GY + 1.55, z); sGeo.push(head)
          const cap = new THREE.IcosahedronGeometry(0.42, 0); cap.scale(1, 0.5, 1); cap.translate(sx, GY + 1.86, z); mGeo.push(cap)
          const bib = new THREE.CylinderGeometry(0.42, 0.6, 0.5, 8, 1, true); bib.translate(sx, GY + 1.1, z); bGeo.push(bib)
        }
        for (let i = 0; i < 6; i++) { const a = R() * 6.28, rr = 2 + R() * 6; const m = new THREE.IcosahedronGeometry(0.7 + R() * 0.6, 0); m.scale(1, 0.5, 1); m.translate(Math.cos(a) * rr, GY + 0.5, Math.sin(a) * rr - 2); mGeo.push(m) } // 苔のむら
        { const body = new THREE.CylinderGeometry(1.0, 1.4, 2.4, 10); body.translate(0, GY + 1.2, -10.4); sGeo.push(body) // 端に佇む大きめの石仏（回廊の主）
          const head = new THREE.SphereGeometry(0.85, 12, 10); head.translate(0, GY + 2.9, -10.4); sGeo.push(head)
          const cap = new THREE.IcosahedronGeometry(0.7, 0); cap.scale(1, 0.5, 1); cap.translate(0, GY + 3.5, -10.4); mGeo.push(cap) }
        const mergeAdd = (geos, mat) => { if (!geos.length) return; const ni = geos.map((x) => x.toNonIndexed()); geos.forEach((x) => x.dispose()); const m = BufferGeometryUtils.mergeGeometries(ni, false); if (m) g.add(new THREE.Mesh(m, mat)); ni.forEach((x) => x.dispose()) }
        mergeAdd(sGeo, stoneMat); mergeAdd(mGeo, mossMat); mergeAdd(bGeo, bibMat)
      } else if (n.kind === 'well') { // 天の井戸＝覗くと下界の街の灯がかすかに映る暗い水面。天と地をつなぐ縦の没入（独自意匠）
        const stoneMat = tn(isNight ? 0x55524c : 0x8b867b), woodM = tn(isNight ? 0x4a3a2c : 0x6e5640), glowW = isNight || dk > 0.2
        const curbOut = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 1.7, 16), stoneMat); curbOut.position.y = GY + 0.85; g.add(curbOut) // 石枠
        const curbIn = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.72, 1.8, 16, 1, true), tn(isNight ? 0x14181c : 0x2a2e34)); curbIn.position.y = GY + 0.9; g.add(curbIn) // 内側の暗がり（井戸の闇）
        const shaftDeep = new THREE.Mesh(new THREE.CylinderGeometry(1.66, 1.3, 3.0, 16, 1, true), tn(isNight ? 0x0a0d10 : 0x171c24)); shaftDeep.position.y = GY - 0.6; g.add(shaftDeep) // 下へすぼまる井戸坑＝奥行き（覗くと深い闇）
        const wellW = new THREE.Mesh(new THREE.CircleGeometry(1.66, 20), new THREE.MeshBasicMaterial({ color: isNight ? 0x0c1014 : 0x18202c, fog: false })); wellW.rotation.x = -Math.PI / 2; wellW.position.y = GY + 0.5; g.add(wellW) // 下界が覗く暗い水鏡
        // はるか下界の街の灯＝水面で揺らめいて瞬く（静的な点でなく、ゆっくり明滅する生きた光。skyDrifters['well']でuTを進める）。1ドロー・加算。
        const NL = LIGHT ? 14 : 22, lpos = new Float32Array(NL * 3), laph = new Float32Array(NL)
        for (let i = 0; i < NL; i++) { const a = R() * 6.28, rr = R() * 1.42; lpos[i * 3] = Math.cos(a) * rr; lpos[i * 3 + 1] = GY + 0.54; lpos[i * 3 + 2] = Math.sin(a) * rr; laph[i] = R() * 6.28 }
        const lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3)); lgeo.setAttribute('aph', new THREE.BufferAttribute(laph, 1))
        const lmat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
          uniforms: { uT: { value: 0 }, uOp: { value: 0 } },
          vertexShader: 'attribute float aph; varying float vtw; uniform float uT; void main(){ vtw=0.25+0.75*(0.5+0.5*sin(uT*1.7+aph)); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=2.7*(60.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }',
          fragmentShader: 'varying float vtw; uniform float uOp; void main(){ float a=smoothstep(0.5,0.0,length(gl_PointCoord-0.5)); gl_FragColor=vec4(1.0,0.79,0.62, a*vtw*uOp); }' })
        const lpts = new THREE.Points(lgeo, lmat); lpts.frustumCulled = false; g.add(lpts)
        // 水底から立ちのぼるやわらかな光の柱（天と地をつなぐ気配。夕夜に暖かく・昼はごく淡く）。井戸坑の中に収め屋根を突き抜けない。
        const colOp = isNight ? 0.23 : (dk > 0.15 ? 0.13 : 0.06)
        const shaftCol = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.3, 3.3, 16, 1, true), new THREE.MeshBasicMaterial({ color: isNight ? 0xffd0a0 : 0xfff0d8, transparent: true, opacity: colOp, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); shaftCol.position.set(0, GY + 2.1, 0); g.add(shaftCol) // 柱頭(beam GY+4)へ向け立ちのぼる光＝天と地をつなぐ気配
        // ときおり水面に広がる波紋（雫の余韻＝生命感。skyDrifters['well']でアニメ）。reveal上書きを避けるため__revBase既定でcloudRevealMatsから除外
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 20), new THREE.MeshBasicMaterial({ color: isNight ? 0x9fb6c4 : 0xbcd0d8, transparent: true, opacity: 0, depthWrite: false, fog: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, GY + 0.52, 0); ring.visible = false; ring.material.__revBase = 0; ring.userData = { life: 0 }; g.add(ring)
        skyDrifters.push({ o: lpts, kind: 'well', mat: lmat, ring, ringT: 1.5 + R() * 2.5 })
        for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 4.2, 6), woodM); post.position.set(sx * 2.0, GY + 2.1, 0); g.add(post) } // 二本柱
        const beam = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 0.3), woodM); beam.position.set(0, GY + 4.0, 0); g.add(beam)
        const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 10), woodM); pulley.rotation.z = Math.PI / 2; pulley.position.set(0, GY + 3.7, 0); g.add(pulley) // 滑車
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 5), tn(isNight ? 0x4a4038 : 0x6b5a44)); rope.position.set(0.36, GY + 2.0, 0); g.add(rope) // 滑車から井戸の闇へ垂れる縄（縦の没入を強める）
        const roof = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.4, 4), tn(isNight ? 0x4a4236 : 0x8a7a54)); roof.rotation.y = Math.PI / 4; roof.position.set(0, GY + 5.0, 0); g.add(roof) // 小屋根
        const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.5, 8), woodM); bucket.position.set(2.45, GY + 1.5, 0); g.add(bucket) // 縁の釣瓶
        const lantStone = tn(isNight ? 0x707280 : 0x9a948a), lbz = -3.4 // 傍らの石灯籠＝夕夜に灯る暖かな目印（他の島と統一）
        const lbase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.85, 6), lantStone); lbase.position.set(3.2, GY + 0.42, lbz); g.add(lbase)
        const lfire = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.85), new THREE.MeshToonMaterial({ color: isNight ? 0xffd49a : 0xcfc8ba, gradientMap: grad, emissive: new THREE.Color(glowW ? 0xff9c4e : 0x000000), emissiveIntensity: glowW ? (isNight ? 1.0 : 0.4) : 0 })); lfire.position.set(3.2, GY + 1.25, lbz); g.add(lfire)
        const lcap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.55, 6), lantStone); lcap.position.set(3.2, GY + 1.9, lbz); g.add(lcap)
        for (let i = 0; i < 5; i++) { const a = R() * 6.28, rr = 3.5 + R() * 4; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + R() * 0.5, 0), tn(isNight ? 0x33473a : 0x5f7a4c)); m.scale.y = 0.5; m.position.set(Math.cos(a) * rr, GY + 0.5, Math.sin(a) * rr); g.add(m) } // 苔のむら
      } else if (n.kind === 'station') { // 空の無人駅＝一本の線路が雲へ消える終着駅。プラットフォーム＋上屋＋ベンチ＋駅名標＋時計＋裸電球（旅情と郷愁の白眉）
        const glowS = isNight || dk > 0.2, concM = tn(isNight ? 0x585c62 : 0x9a958c), woodM = tn(isNight ? 0x5a4636 : 0x6e5640), steelM = tn(isNight ? 0x44484e : 0x7a7e84), sleepM = tn(isNight ? 0x342b24 : 0x55473a)
        // プラットフォーム（内側-x。線路は+x側＝島の縁へ走り雲へ消える）
        const plat = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 12), concM); plat.position.set(-2.5, GY + 0.3, 0); g.add(plat)
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 12), tn(isNight ? 0x8a8460 : 0xd8c878)); edge.position.set(0.05, GY + 0.63, 0); g.add(edge) // 縁の警告帯（黄）
        // 線路＝二本のレール＋枕木。プラットフォーム前(x=1)から島の縁の外(x=17)へ伸び、雲へ消える（終着の余韻）
        const railGeos = [], slGeos = []
        for (const s of [-0.72, 0.72]) { const r = new THREE.BoxGeometry(16, 0.1, 0.12); r.translate(9, GY + 0.12, s); railGeos.push(r) }
        for (let i = 0; i < 11; i++) { const sx = 1.6 + i * 1.45; const sl = new THREE.BoxGeometry(0.5, 0.12, 2.1); sl.translate(sx, GY + 0.04, 0); slGeos.push(sl) }
        if (BufferGeometryUtils.mergeGeometries) { const rm = BufferGeometryUtils.mergeGeometries(railGeos, false); if (rm) g.add(new THREE.Mesh(rm, steelM)); railGeos.forEach((x) => x.dispose()); const sm = BufferGeometryUtils.mergeGeometries(slGeos, false); if (sm) g.add(new THREE.Mesh(sm, sleepM)); slGeos.forEach((x) => x.dispose()) }
        // 上屋（プラットフォームの屋根。四本柱＋深い軒の片流れ）
        for (const [px, pz] of [[-4.2, -3.5], [-4.2, 3.5], [-0.9, -3.5], [-0.9, 3.5]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.0, 6), woodM); post.position.set(px, GY + 2.0, pz); g.add(post) }
        const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.18, 8.4), tn(isNight ? 0x4a4034 : 0x7a6448)); roof.position.set(-2.5, GY + 3.5, 0); roof.rotation.z = -0.06; g.add(roof)
        // ベンチ（線路を向いて待つ＝旅情）
        const bseat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 3.0), woodM); bseat.position.set(-3.4, GY + 1.05, 0); g.add(bseat)
        const bback = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 3.0), woodM); bback.position.set(-3.8, GY + 1.4, 0); g.add(bback)
        for (const lz of [-1.3, 1.3]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.16), woodM); leg.position.set(-3.4, GY + 0.62, lz); g.add(leg) }
        // 駅名標（無地のパネル＝特定の駅を模さない。支柱＋枠＋淡い板）
        for (const sz of [-5, 5]) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), steelM); sp.position.set(-1.0, GY + 1.5, sz); g.add(sp)
          const board = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 2.4), tn(isNight ? 0x8a9aa2 : 0xeef2f4)); board.position.set(-1.0, GY + 2.4, sz); g.add(board)
          const band = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 2.4), tn(isNight ? 0x3a5a72 : 0x4f8ab0)); band.position.set(-1.0, GY + 2.15, sz); g.add(band) } // 駅名標の下の青帯（雰囲気だけ）
        // 古い丸時計（柱＋白い文字盤＋針）
        const cpole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), steelM); cpole.position.set(-4.6, GY + 1.7, 0); g.add(cpole)
        const cface = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 16), tn(isNight ? 0xb8bcc0 : 0xf4f2ec)); cface.rotation.x = Math.PI / 2; cface.position.set(-4.6, GY + 3.5, 0.12); g.add(cface)
        for (const [len, ang, th] of [[0.36, 1.2, 0.05], [0.5, -0.6, 0.035]]) { const hand = new THREE.Mesh(new THREE.BoxGeometry(len, th, 0.04), tn(0x2a2e34)); hand.position.set(-4.6 + Math.cos(ang) * len / 2, GY + 3.5 + Math.sin(ang) * len / 2, 0.2); hand.rotation.z = ang; g.add(hand) } // 短針/長針
        // 裸電球（プラットフォームの灯り。夕夜に灯る）
        const lbulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 7), new THREE.MeshToonMaterial({ color: isNight ? 0xffe6b0 : 0xf0e8d8, gradientMap: grad, emissive: new THREE.Color(glowS ? 0xffaa50 : 0x000000), emissiveIntensity: glowS ? (isNight ? 1.2 : 0.5) : 0 })); lbulb.position.set(-1.6, GY + 3.3, -3.5); g.add(lbulb)
      } else { // onsen（雲の温泉＝岩で囲った露天の湯舟。湯けむりが立つ。湯けむりはskyDriftersで別途）
        const rockMat = tn(isNight ? 0x4a4640 : 0x6f655a), poolR = 5.5
        for (let a = 0; a < 11; a++) { const ang = a / 11 * Math.PI * 2; const rk = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 + R() * 0.6, 0), rockMat); rk.position.set(Math.cos(ang) * poolR, GY + 0.35, Math.sin(ang) * poolR); rk.scale.y = 0.7; g.add(rk) } // 湯舟の縁の岩
        const water = new THREE.Mesh(new THREE.CylinderGeometry(poolR - 0.4, poolR - 0.4, 0.3, 24), new THREE.MeshToonMaterial({ color: isNight ? 0x5e8088 : 0xaad8d6, gradientMap: grad, emissive: new THREE.Color(isNight ? 0x244442 : 0x000000), emissiveIntensity: isNight ? 0.5 : 0 })); water.position.y = GY + 0.25; g.add(water) // 温かい湯の面
        const lantStone = tn(isNight ? 0x707280 : 0x9a948a)
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.9, 6), lantStone); base.position.set(8, GY + 0.45, -3); g.add(base)
        const fire = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), new THREE.MeshToonMaterial({ color: isNight ? 0xffd49a : 0xcfc8ba, gradientMap: grad, emissive: new THREE.Color(isNight ? 0xff9c4e : 0x000000), emissiveIntensity: isNight ? 1.0 : 0 })); fire.position.set(8, GY + 1.5, -3); g.add(fire)
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.65, 6), lantStone); cap.position.set(8, GY + 2.35, -3); g.add(cap)
      }
      g.position.set(n.x, n.topY - GY, n.z); g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } }); scene.add(g); cloudObjs.push(g)
    }
    cloudWalkInfo = { nodes: cwNodes.map((n) => ({ x: n.x, z: n.z, r: n.r - 2.5, topY: n.topY, kind: n.kind })), bridges: cwBridges, minY: SEA_Y - 6 }
    // 空の渡し舟＝雲海の上を棹さす舟人が一艘でゆっくり巡る（眺めて整う中心の絵・郷愁）。skyDriftersで低空では自動的に隠れる。
    { const boat = new THREE.Group()
      const woodF = tn(isNight ? 0x4a3a2a : 0x6e553a), woodF2 = tn(isNight ? 0x5a4632 : 0x866a46)
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 4.0), woodF); hull.position.y = 0.25; boat.add(hull) // 舟底
      for (const sz of [-1, 1]) { const end = new THREE.Mesh(new THREE.ConeGeometry(0.66, 1.3, 4), woodF); end.rotation.set(sz * Math.PI / 2, Math.PI / 4, 0); end.scale.set(1, 1, 0.45); end.position.set(0, 0.28, sz * 2.3); boat.add(end) } // 舳先と艫（尖り）
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.12, 4.2), woodF2); rim.position.y = 0.5; boat.add(rim) // 舷
      queueCloudFolk(boat, 0, 0.5, -0.7, 0, isNight ? 0x46402f : 0x6e5a3c, 0.72, false) // 舟人（棹をさして立つ／舟スケール1.85に合わせ小さめ・skyDriftersで表示制御するためreveal不要）
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 4.6, 5), woodF2); pole.position.set(0.52, 1.5, -0.2); pole.rotation.x = -0.5; boat.add(pole) // 棹
      boat.position.set(56, SEA_Y + 0.4, -315); boat.scale.setScalar(1.85)
      scene.add(boat); skyDrifters.push({ o: boat, kind: 'ferry', cx: -30, cz: -315, rad: 86, ph: 0, pole, seaY: SEA_Y })
    }
    // 灯籠流し＝灯籠市の手前の雲海の水面を、紙灯籠がいくつも静かに流れる（祭りの余韻・郷愁。夕夜に灯る）。skyDriftersで低空では隠れる。
    { const glowL = isNight || dk > 0.2
      const paperMat = new THREE.MeshToonMaterial({ color: isNight ? 0xffcaa0 : 0xf2e2c2, gradientMap: grad, emissive: new THREE.Color(glowL ? 0xff8a3c : 0x000000), emissiveIntensity: glowL ? (isNight ? 1.0 : 0.45) : 0, fog: true })
      const floatMat = tn(isNight ? 0x3a2e26 : 0x5a4632)
      const toroG = new THREE.Group(), N = LIGHT ? 8 : 13
      for (let i = 0; i < N; i++) {
        const lz = new THREE.Group()
        lz.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), floatMat)).position.y = 0.06           // 木の台
        const paper = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), paperMat); paper.position.y = 0.4; lz.add(paper) // 紙の火袋
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), floatMat); cap.position.y = 0.68; lz.add(cap)   // 蓋
        const lx0 = (R() - 0.5) * 38, lz0 = (R() - 0.5) * 28; lz.position.set(lx0, 0, lz0)
        lz.userData = { ph: R() * 6.28, bob: 0.5 + R() * 0.5, x0: lx0 }
        toroG.add(lz)
      }
      toroG.position.set(-34, SEA_Y + 0.2, -346) // 灯籠市(-34,-366)の手前(南)の雲海に流す
      scene.add(toroG); skyDrifters.push({ o: toroG, kind: 'toro', drift: 0 })
    }
    // 雲の温泉の湯けむり（ふわふわ立ちのぼる白い湯気）。skyDriftersで更新＝低空では自動的に止まる。
    { const on = cwNodes[4], steam = new THREE.Group()
      const stCv = document.createElement('canvas'); stCv.width = stCv.height = 48
      const stx = stCv.getContext('2d'), stg = stx.createRadialGradient(24, 24, 0, 24, 24, 24)
      stg.addColorStop(0, 'rgba(255,255,255,0.85)'); stg.addColorStop(1, 'rgba(255,255,255,0)'); stx.fillStyle = stg; stx.fillRect(0, 0, 48, 48)
      const stTex = new THREE.CanvasTexture(stCv)
      for (let i = 0; i < (LIGHT ? 8 : 14); i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: stTex, color: isNight ? 0xd2d8dc : 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true }))
        sp.userData = { x0: (R() - 0.5) * 7, z0: (R() - 0.5) * 7, ph: R(), spd: 0.6 + R() * 0.6 }; sp.scale.set(3, 4, 1); steam.add(sp) }
      steam.position.set(on.x, on.topY + 0.4, on.z); scene.add(steam); skyDrifters.push({ o: steam, kind: 'steam' })
    }

    // 雲海＝下地の円盤（取りこぼしを埋め谷の翳りになる）＋「平たい底＋もくもくの頂」の雲塊（頂点階調で立体的な雲に）。
    // group ごと高度でフェード＝窓辺・巡航では消えて開けた空、高く昇ると現れて街が雲の下へ消える別世界。
    const cloudSeaG = new THREE.Group(); cloudSeaG.position.y = SEA_Y; cloudSeaG.visible = false
    const seaR = 500
    // 焼いた頂点階調(暖頂→冷底)が雲の陰影＝トゥーンの硬い帯やグレーの濁りを出さず、やわらかく明るい水彩の雲に。
    // さらに onBeforeCompile で「生きたうねり（低周波の波＋流れ）＋陽の差す斜面の持ち上げ・きらめき＋外周の霞溶かし」を加える。
    // 波の解析勾配から法線を作る自己完結シェーダー（geometryのnormal attributeに依存しない＝MeshBasicでも堅牢）。
    seaUni = { uTime: { value: 0 } }
    const seaSunDir = sun.position.clone().normalize()
    const seaSunCol = new THREE.Color(isNight ? 0x9fb0d8 : 0xfff2d8).lerp(new THREE.Color(0xffc070), dk)
    // 雲海に灯る暖かい光のにじみ＝谷(暗部)ほど琥珀色が灯る「街明かりが雲を染める」郷愁。夜が最強＝帰ってきた心地、朝夕は金、昼は控えめ。
    const seaWarm = new THREE.Color(isNight ? 0xffba7c : 0xffd49c)
    const seaWarmAmt = isNight ? 0.26 : (0.05 + dk * 0.18)
    const applySeaShader = (mat) => {
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = seaUni.uTime
        sh.uniforms.uSunDir = { value: seaSunDir }
        sh.uniforms.uSunCol = { value: seaSunCol }
        sh.uniforms.uSeaR = { value: seaR }
        sh.uniforms.uWarm = { value: seaWarm }; sh.uniforms.uWarmAmt = { value: seaWarmAmt }
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vSeaN; varying float vSeaC; varying float vSeaD;')
          .replace('#include <project_vertex>', '#include <project_vertex>\n  vSeaD = -mvPosition.z;') // カメラからの距離＝近接フェード用
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n  float _wx = transformed.x, _wz = transformed.z;\n  float _p1 = _wx*0.020 + uTime*0.16, _p2 = _wz*0.024 - uTime*0.12, _p3 = (_wx+_wz)*0.012 + uTime*0.08;\n  transformed.y += sin(_p1)*cos(_p2)*3.0 + sin(_p3)*1.8;\n  float _dx = 0.020*cos(_p1)*cos(_p2)*3.0 + 0.012*cos(_p3)*1.8;\n  float _dz = -0.024*sin(_p1)*sin(_p2)*3.0 + 0.012*cos(_p3)*1.8;\n  vSeaN = normalize(vec3(-_dx, 1.0, -_dz));\n  vSeaC = length((modelMatrix * vec4(transformed,1.0)).xz);')
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSeaR; uniform vec3 uWarm; uniform float uWarmAmt; varying vec3 vSeaN; varying float vSeaC; varying float vSeaD;')
          .replace('#include <dithering_fragment>', '  float _ndl = dot(normalize(vSeaN), uSunDir);\n  gl_FragColor.rgb *= (0.90 + smoothstep(-0.2, 0.7, _ndl) * 0.10);\n  gl_FragColor.rgb += uSunCol * pow(max(_ndl, 0.0), 10.0) * 0.05;\n  float _lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uWarm, uWarmAmt * (0.45 + 0.55 * (1.0 - clamp(_lum, 0.0, 1.0))));\n  gl_FragColor.a *= 1.0 - smoothstep(uSeaR*0.80, uSeaR*0.998, vSeaC);\n  gl_FragColor.a *= smoothstep(3.0, 26.0, vSeaD);\n#include <dithering_fragment>')
      }
      mat.customProgramCacheKey = () => 'cloudsea'
      return mat
    }
    const seaMat = applySeaShader(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false }))
    const discMat = applySeaShader(new THREE.MeshBasicMaterial({ color: seaLowC, transparent: true, opacity: 0, depthWrite: false, fog: false }))
    seaMats.push(seaMat, discMat)
    // 雲の切れ間＝雲海の所々に穴を開け、はるか下の地上が覗く（高さの実感＝奥行き）。下地に穴・その部分は雲塊も置かない。
    const gaps = [{ x: 15, z: -25, r: 40 }, { x: 120, z: 28, r: 44 }, { x: -135, z: -120, r: 46 }, { x: 210, z: -300, r: 44 }] // 街・東の海・西の住宅・渡りの空の上に開ける
    const seaShape = new THREE.Shape(); seaShape.absarc(0, 0, seaR, 0, Math.PI * 2, false)
    for (const gp of gaps) { const h = new THREE.Path(); h.absarc(gp.x, -gp.z, gp.r, 0, Math.PI * 2, true); seaShape.holes.push(h) } // shapeのY→world -Z（disc.rotateX(-90°)のため符号反転）
    const disc = new THREE.Mesh(new THREE.ShapeGeometry(seaShape, 64), discMat); disc.rotation.x = -Math.PI / 2; disc.position.y = -7; cloudSeaG.add(disc) // 切れ間以外を覆う下地
    const seaGeos = [], step = LIGHT ? 46 : 36
    for (let gx = -seaR; gx <= seaR; gx += step) {
      for (let gz = -seaR; gz <= seaR; gz += step) {
        if (Math.hypot(gx, gz) > seaR) continue
        if (isles.some((il) => Math.hypot(gx - il.x, gz - il.z) < il.r)) continue // 島の周りはくぼませる（雲のくぼ地に据わる）
        if (cwNodes.some((n) => Math.hypot(gx - n.x, gz - n.z) < n.r + 15)) continue // 回遊群島の島の周りはくぼませる
        if (cwBridges.some((br) => { const dx = br.bx - br.ax, dz = br.bz - br.az, L2 = dx * dx + dz * dz; let t = ((gx - br.ax) * dx + (gz - br.az) * dz) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(gx - (br.ax + dx * t), gz - (br.az + dz * t)) < br.halfW + 9 })) continue // 吊り橋の筋もくぼませる
        if (gaps.some((gp) => Math.hypot(gx - gp.x, gz - gp.z) < gp.r)) continue // 雲の切れ間（地上が覗く穴）
        const jx = gx + (R() - 0.5) * step * 0.4, jz = gz + (R() - 0.5) * step * 0.4, baseY = (R() - 0.5) * 9
        // やわらかな雲海＝大きめに重ねた広く平たい底＋低くゆるい膨らみ。個々の綿玉でなく、うねる雲の海として連続させる。
        const sB = (LIGHT ? 20 : 18) + R() * 10
        const hiJ = new THREE.Color(seaHighC).lerp(new THREE.Color(seaLowC), R() * 0.3).getHex() // 頂の明度を少し散らす＝のっぺり白を脱す（painterly）
        const gb = new THREE.IcosahedronGeometry(sB, 1); gb.scale(1.18, 0.4, 1.18); gb.translate(jx, baseY, jz); cloudTint(gb, -16, 42, seaLowC, hiJ); seaGeos.push(gb) // 広く平たい底＝隣と重なって連続面に
        const bumps = 1 + ((R() * 1.6) | 0)
        for (let bI = 0; bI < bumps; bI++) { const sBu = sB * (0.6 + R() * 0.4), bx = jx + (R() - 0.5) * sB * 0.6, bz = jz + (R() - 0.5) * sB * 0.6, by = baseY + sB * 0.22 + R() * 3; const gg = new THREE.IcosahedronGeometry(sBu, 1); gg.scale(1.1, 0.54, 1.1); gg.translate(bx, by, bz); cloudTint(gg, -16, 42, seaLowC, hiJ); seaGeos.push(gg) } // 低くゆるい膨らみ
        if (R() < 0.3) { const st = 5 + R() * 4, gt = new THREE.IcosahedronGeometry(st, 2); gt.scale(1.1, 0.64, 1.1); gt.translate(jx + (R() - 0.5) * sB * 0.5, baseY + sB * 0.38 + R() * 3, jz + (R() - 0.5) * sB * 0.5); cloudTint(gt, -16, 50, seaLowC, seaHighC); seaGeos.push(gt) } // 控えめな頂＝丸い輪郭(det2)＋頂をいちばん明るく＝雲のもくもくが空に映える(輪郭・評価)
      }
    }
    const seaMerged = BufferGeometryUtils.mergeGeometries(seaGeos, false); seaGeos.forEach((g) => g.dispose())
    if (seaMerged) cloudSeaG.add(new THREE.Mesh(seaMerged, seaMat))
    scene.add(cloudSeaG); cloudSea = cloudSeaG
    // 天上界の光芒（天使の梯子）＝雲海に常時そっと差し込む光の柱。下界の街には無い神々しさ＝差別化③。
    // skyDrifters['godshaft']で高度フェード（cloudReveal）＆カメラ追従。控えめ（ギラつかせない）・加算ビルボード7枚＝軽量。
    { const gsGrp = new THREE.Group(), gsMats = []
      const gsCv = document.createElement('canvas'); gsCv.width = 32; gsCv.height = 96; const gsx = gsCv.getContext('2d')
      for (let y = 0; y < 96; y++) { const top = 1 - y / 96, hg = gsx.createLinearGradient(0, y, 32, y); hg.addColorStop(0, 'rgba(255,240,206,0)'); hg.addColorStop(0.5, `rgba(255,240,206,${(0.3 + 0.42 * top).toFixed(3)})`); hg.addColorStop(1, 'rgba(255,240,206,0)'); gsx.fillStyle = hg; gsx.fillRect(0, y, 32, 1) }
      const gsTex = new THREE.CanvasTexture(gsCv)
      // 夜は暖色クリームの白い棒が菫色の夜空に加算で浮いてチープに見える(実機FB)→月光の淡い青紫へ寄せ・本数を減らし・幅広くばらけさせ重ねて柔らかい光芒に・不透明度を下げる。
      const NGS = LIGHT ? 4 : (isNight ? 5 : 7)
      const gsTint = isNight ? 0x8b97bc : 0xffffff // 夜=月光の淡い青紫／昼夕=暖色クリームのまま
      for (let i = 0; i < NGS; i++) { const m = new THREE.MeshBasicMaterial({ map: gsTex, color: gsTint, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); gsMats.push(m)
        const wd = (isNight ? 17 : 11) + R() * (isNight ? 15 : 7) // 夜は幅広く・ばらつかせ＝重なって柔らかい光芒に（棒の列に見せない）
        const beam = new THREE.Mesh(new THREE.PlaneGeometry(wd, 130), m); beam.position.set(-30 + (i - (NGS - 1) / 2) * (isNight ? 22 : 15) + (R() - 0.5) * 12, SEA_Y + 48, -315 + (R() - 0.5) * 50); beam.rotation.z = (i - (NGS - 1) / 2) * 0.05 + (R() - 0.5) * 0.06; gsGrp.add(beam) } // 群島(中心-30,-320)の上に立つ光の柱
      scene.add(gsGrp); skyDrifters.push({ o: gsGrp, kind: 'godshaft', mats: gsMats, opF: isNight ? 0.15 : 0.28 })
    }
    // 高層の巻雲ヴェール＝雲海のはるか上をゆっくり流れる薄い筋雲。雲海(下層)と巻雲(上層)の二層で空に奥行きを出す。
    { const ciCv = document.createElement('canvas'); ciCv.width = ciCv.height = 256
      const cictx = ciCv.getContext('2d'); cictx.clearRect(0, 0, 256, 256)
      for (let i = 0; i < 22; i++) { const cx = R() * 256, cy = R() * 256, cw = 40 + R() * 150, ch = 2 + R() * 5, ca = 0.05 + R() * 0.11
        const lg = cictx.createLinearGradient(cx, 0, cx + cw, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,' + ca.toFixed(3) + ')'); lg.addColorStop(1, 'rgba(255,255,255,0)')
        cictx.fillStyle = lg; cictx.fillRect(cx, cy, cw, ch) }
      const ciTex = new THREE.CanvasTexture(ciCv); ciTex.wrapS = ciTex.wrapT = THREE.RepeatWrapping; ciTex.repeat.set(3, 3)
      const cirrus = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.MeshBasicMaterial({ map: ciTex, color: new THREE.Color(isNight ? 0x8a93ad : 0xffffff).lerp(new THREE.Color(0xffce9c), dk * 0.5), transparent: true, opacity: 0, depthWrite: false, fog: false }))
      cirrus.rotation.x = -Math.PI / 2; cirrus.position.set(0, SEA_Y + 38, -120)
      scene.add(cirrus); skyDrifters.push({ o: cirrus, kind: 'cirrus', mat: cirrus.material })
    }
    // 入道雲＝雲海から雄大に立ち上がる積乱雲（トゥーンで陽の当たる面/翳る面が出て、もくもくの塊が立体に）。
    // 上層=陽の当たる白(cloudMat)／下層=翳る雲底(cloudBot) の2メッシュに統合。最高高度を越えて聳える＝縫って飛ぶ道標。
    const towerTop = [], towerBot = []
    const towerSpots = LIGHT ? [[-130, -250], [200, -330], [40, -560]] : [[-130, -250], [200, -330], [40, -560], [-300, -150], [340, -210], [-110, -610]]
    for (const [tx, tz] of towerSpots) {
      const baseY = SEA_Y - 14, topY = SEA_Y + (56 + R() * 30), layers = 9 + ((R() * 4) | 0) // 雲海(上面~110)から40-70u聳える
      for (let k = 0; k < layers; k++) {
        const f = k / (layers - 1)
        const rad = (30 - f * 20) * (0.8 + R() * 0.4) * (1 - 0.5 * Math.pow(Math.max(0, f - 0.7) / 0.3, 2)) // 下太く・上はもくもく細る
        const puffs = 5 + ((R() * 3) | 0)
        for (let p = 0; p < puffs; p++) {
          const s = rad * (0.62 + R() * 0.5), ang = R() * Math.PI * 2, rr = R() * rad * 0.7
          const geo = new THREE.IcosahedronGeometry(s, 1); geo.scale(1, 0.86, 1)
          geo.translate(tx + Math.cos(ang) * rr, baseY + f * (topY - baseY), tz + Math.sin(ang) * rr)
          ;(f > 0.24 ? towerTop : towerBot).push(geo)
        }
      }
      towerCenters.push({ x: tx, z: tz, yTop: topY })
    }
    const tTop = BufferGeometryUtils.mergeGeometries(towerTop, false); towerTop.forEach((g) => g.dispose())
    const tBot = BufferGeometryUtils.mergeGeometries(towerBot, false); towerBot.forEach((g) => g.dispose())
    if (tTop) { const m = new THREE.Mesh(tTop, cloudMat); scene.add(m); cloudObjs.push(m) }
    if (tBot) { const m = new THREE.Mesh(tBot, cloudBot); scene.add(m); cloudObjs.push(m) }

    // やさしい幻想：雲海のぬし＝雲を泳ぐ大きな鯨＋寄り添う子鯨。なめらかな紡錘形の体が進行波でうねって泳ぎ、
    // 背に陽/月のリム光が乗る。時々ふっと潮を吹く（生命の気配・白眉）。
    { const whaleUniforms = { uTime: { value: 0 } } // 進行波の時刻（frameで更新）。親子で共有＝同調して泳ぐ
      // 背=暗め／腹=明るめのカウンターシェード（夜は青く沈め、夕は背の高い側をわずかに茜へ）。
      const backC = new THREE.Color(isNight ? 0x4c5670 : 0x8496ab).lerp(new THREE.Color(0xd9a878), dk * 0.5)
      const bellyC = new THREE.Color(isNight ? 0x6a7691 : 0xc2cdda).lerp(new THREE.Color(0xe6c79c), dk * 0.4)
      // ── なめらかな紡錘形の体（旋盤面で一体成形＝積み球の凸凹シルエットを脱す。頭+X・尾-X） ──
      const prof = [[0.02, 20], [1.6, 18], [3.6, 15.5], [5.8, 12], [7.4, 7.5], [8.1, 2], [8.0, -3], [7.0, -9], [5.2, -14.5], [3.4, -19.5], [1.9, -24], [0.9, -28], [0.02, -30]]
      const bodyGeo = new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(Math.max(0.02, r), h)), 20)
      bodyGeo.rotateZ(-Math.PI / 2)   // 旋盤の縦軸(Y)を体の長軸(X)へ
      bodyGeo.scale(1, 0.92, 1.06)    // ほんの少し平たく・幅広に（鯨の断面）
      const parts = [bodyGeo]
      const dors = new THREE.SphereGeometry(1, 10, 8); dors.scale(3.4, 1.5, 2.4); dors.translate(-7, 7.0, 0); parts.push(dors) // 背の低い隆起
      // 尾びれ＝平たく二叉・中央に切れ込み。厚みを持たせ横から見ても紙にならない。
      const fS = new THREE.Shape(); fS.moveTo(2, 0); fS.lineTo(-1, 11); fS.lineTo(-5.5, 9.5); fS.lineTo(-1.5, 0.8); fS.lineTo(-5.5, -9.5); fS.lineTo(-1, -11); fS.closePath()
      const flu = new THREE.ExtrudeGeometry(fS, { depth: 0.7, bevelEnabled: false }); flu.translate(0, 0, -0.35); flu.rotateX(-Math.PI / 2); flu.translate(-29, 1.2, 0); parts.push(flu) // 水平に寝かせ尾柄へ
      for (const sd of [-1, 1]) { const fin = new THREE.SphereGeometry(1, 10, 6); fin.scale(7, 1.0, 3); fin.rotateZ(0.4); fin.rotateY(sd * 0.5); fin.translate(4, -1.5, sd * 8); parts.push(fin) } // 胸びれ
      const niParts = parts.map((g) => g.index ? g.toNonIndexed() : g)
      const whaleGeo = BufferGeometryUtils.mergeGeometries(niParts, false) || niParts[0]
      for (const g of parts) if (g !== whaleGeo) g.dispose()
      for (const g of niParts) if (g !== whaleGeo && !parts.includes(g)) g.dispose()
      { const pos = whaleGeo.attributes.position, n = pos.count, arr = new Float32Array(n * 3), c = new THREE.Color() // 背暗→腹明のカウンターシェードを頂点色に焼く
        for (let i = 0; i < n; i++) { let ty = (pos.getY(i) + 8) / 16; ty = Math.max(0, Math.min(1, ty)); ty = ty * ty * (3 - 2 * ty); c.copy(bellyC).lerp(backC, ty); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
        whaleGeo.setAttribute('color', new THREE.BufferAttribute(arr, 3)) }
      // 進行波で体がうねって泳ぐ＋背にリム光（既存 snowify と同じ onBeforeCompile 注入）。
      const whaleMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: grad, vertexColors: true, fog: true })
      whaleMat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = whaleUniforms.uTime
        sh.uniforms.uRimColor = { value: new THREE.Color(isNight ? 0x6f7da0 : 0xfff0d8).lerp(new THREE.Color(0xffc89c), dk) }
        sh.uniforms.uRimStr = { value: isNight ? 0.30 : 0.42 }
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vRimN; varying vec3 vRimV;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n  float _a = clamp((20.0 - transformed.x) / 50.0, 0.0, 1.0); _a *= _a;\n  transformed.y += _a * 3.4 * sin(transformed.x * 0.12 + uTime * 1.6);\n  vec4 _mv = modelViewMatrix * vec4(transformed, 1.0); vRimV = -_mv.xyz; vRimN = normalize(normalMatrix * objectNormal);')
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimStr; varying vec3 vRimN; varying vec3 vRimV;')
          .replace('#include <dithering_fragment>', '  float _rim = pow(1.0 - clamp(dot(normalize(vRimN), normalize(vRimV)), 0.0, 1.0), 2.5); gl_FragColor.rgb += uRimColor * _rim * uRimStr;\n#include <dithering_fragment>')
      }
      whaleMat.customProgramCacheKey = () => 'skywhale'
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14161c, fog: true })
      const addEyes = (g, k) => { for (const sd of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.9 * k, 8, 8), eyeMat); e.position.set(13.5 * k, 1.1 * k, sd * 5.4 * k); g.add(e) } }
      const whale = new THREE.Group()
      whale.add(new THREE.Mesh(whaleGeo, whaleMat)); addEyes(whale, 1) // 親鯨
      const calf = new THREE.Group(); calf.add(new THREE.Mesh(whaleGeo, whaleMat)); addEyes(calf, 1); calf.position.set(-26, -4, 15); calf.scale.setScalar(0.55); whale.add(calf) // 寄り添う子鯨（同じ材で同調してうねる）
      // 潮吹き（頭上に立ちのぼる白い潮の柱）。下端を基準に上へ伸びる。
      const spCv = document.createElement('canvas'); spCv.width = 32; spCv.height = 64
      const sctx = spCv.getContext('2d'), spg = sctx.createRadialGradient(16, 50, 0, 16, 38, 30)
      spg.addColorStop(0, 'rgba(255,255,255,0.92)'); spg.addColorStop(1, 'rgba(255,255,255,0)'); sctx.fillStyle = spg; sctx.fillRect(0, 0, 32, 64)
      const spout = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(spCv), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true }))
      spout.center.set(0.5, 0); spout.position.set(13, 7.5, 0); spout.scale.set(4, 7, 1); whale.add(spout)
      whale.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
      whale.scale.setScalar(1.5) // 雄大に（雲海に対し十分大きく＝遠目にも生き物と分かる）
      const wBaseY = SEA_Y + 31, wz = -210 // 雲海の上面(~110)の上を泳ぐ＝全身のシルエットが出る
      whale.position.set(-220, wBaseY, wz) // 頭(+X)を進行方向(+X)へ向けてゆっくり横切る
      scene.add(whale); skyDrifters.push({ o: whale, kind: 'whale', baseY: wBaseY, z0: wz, calf, spout, spoutT: 5, spoutA: 0, uni: whaleUniforms, diveT: 30, diveA: 0 })
    }

    // 空の灯籠（天灯）＝ゆっくり昇り漂う暖かな灯り。特に夜、雲海に灯がともる。
    const dotCv = document.createElement('canvas'); dotCv.width = dotCv.height = 64
    const dctx = dotCv.getContext('2d'), dgr = dctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    dgr.addColorStop(0, 'rgba(255,232,194,0.95)'); dgr.addColorStop(1, 'rgba(255,232,194,0)'); dctx.fillStyle = dgr; dctx.fillRect(0, 0, 64, 64)
    const dotTex = new THREE.CanvasTexture(dotCv)
    const lanternGlow = isNight || dk > 0.25 // 夜・夕は灯がともる（暖かい・懐かしい灯り）
    const lanternMat = new THREE.MeshToonMaterial({ color: isNight ? 0xffd49a : 0xeadcc0, gradientMap: grad, emissive: new THREE.Color(isNight ? 0xff9c4e : 0xe8c79a), emissiveIntensity: isNight ? 1.0 : (lanternGlow ? 0.5 : 0.28) })
    for (let i = 0; i < (LIGHT ? 10 : 18); i++) { // 増量＝雲海に灯がいくつも漂う賑わい（きらびやか）。上空は街が隠れ描画予算に余裕。
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.74, 1.9, 8), lanternMat); g.add(body)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.95, 0.5, 8), lanternMat); cap.position.y = 1.2; g.add(cap)
      let glowSprite = null
      if (lanternGlow) { glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: isNight ? 0xffba66 : 0xffc98a, transparent: true, opacity: isNight ? 0.82 : 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: true })); glowSprite.scale.set(3.6, 3.6, 1); glowSprite.position.y = 0.3; g.add(glowSprite) }
      const cx = 20 + (R() - 0.5) * 180, cz = -310 + (R() - 0.5) * 170, by = SEA_Y + 6 + R() * 46 // ゆるくまとまった群れ（天灯の放たれた一群）。少し広く散らす
      g.position.set(cx, by, cz)
      g.userData = { ph: R() * 6.28, sway: 0.6 + R() * 0.5, rise: 0.5 + R() * 0.6, baseX: cx, baseZ: cz, glow: glowSprite, glowBase: glowSprite ? glowSprite.material.opacity : 0 }
      scene.add(g); skyDrifters.push({ o: g, kind: 'lantern' })
    }
    // 天上界に漂う光の粒。夜＝蛍火のような暖色／昼夕＝magic hourの光に舞う淡い金の塵。群島の上をふわりと漂い明滅する（加算で滲む・昼夜とも）。
    { const moteG = new THREE.Group(), moteCol = isNight ? 0xffc878 : 0xf2e2b8
      for (let i = 0; i < (LIGHT ? 12 : 22); i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: moteCol, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }))
        const mx = -30 + (R() - 0.5) * 170, mz = -330 + (R() - 0.5) * 170, my = SEA_Y + 12 + R() * 30
        sp.position.set(mx, my, mz); sp.scale.setScalar(0.7 + R() * 0.6); sp.userData = { x0: mx, z0: mz, y0: my, ph: R() * 6.28 }; moteG.add(sp)
      }
      scene.add(moteG); skyDrifters.push({ o: moteG, kind: 'motes', peak: isNight ? 0.6 : 0.34 }) // 昼は控えめ（白飛び回避）
    }
    // 島々の間を流れる霧のヴェール＝群島を夢想的につなぐ薄もや（ゆっくり横切り端で戻る・昼夜とも）。
    { const wispCv = document.createElement('canvas'); wispCv.width = wispCv.height = 64
      const wctx = wispCv.getContext('2d'), wgr = wctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      wgr.addColorStop(0, 'rgba(255,255,255,0.5)'); wgr.addColorStop(1, 'rgba(255,255,255,0)'); wctx.fillStyle = wgr; wctx.fillRect(0, 0, 64, 64)
      const wispTex = new THREE.CanvasTexture(wispCv), mistG = new THREE.Group()
      for (let i = 0; i < (LIGHT ? 6 : 11); i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: wispTex, color: isNight ? 0xb8c0d0 : (dk > 0.2 ? 0xf6dcbe : 0xffffff), transparent: true, opacity: 0, depthWrite: false, fog: true })) // 夕は霧も金桃に染まる
        const mx = -40 + (R() - 0.5) * 230, mz = -330 + (R() - 0.5) * 190, my = SEA_Y + 8 + R() * 26, sc = 28 + R() * 28 // 高さ方向にも層を広げ、島々の腰から谷まで霧が漂う
        sp.position.set(mx, my, mz); sp.scale.set(sc, sc * (0.5 + R() * 0.2), 1); sp.userData = { spd: 1.2 + R() * 1.6, y0: my, ph: R() * 6.28 }; mistG.add(sp)
      }
      scene.add(mistG); skyDrifters.push({ o: mistG, kind: 'mistveil' })
    }
    // 蝶＝昼、島々の花の上をひらひら舞い羽ばたく（夏の生命の気配。夜の灯りの粒と対の昼の生命）。
    if (!isNight) {
      const bCols = [tn(0xf4f0e0), tn(0xf0d86a), tn(0xe6b0c8), tn(0xcfe0f0)]; bCols.forEach((m) => { m.side = THREE.DoubleSide }) // 白/黄/桃/淡青
      const lwGeo = new THREE.PlaneGeometry(0.5, 0.62); lwGeo.translate(-0.25, 0, 0)
      const rwGeo = new THREE.PlaneGeometry(0.5, 0.62); rwGeo.translate(0.25, 0, 0)
      const bflyG = new THREE.Group()
      for (let i = 0; i < (LIGHT ? 5 : 9); i++) {
        const b = new THREE.Group(), wm = bCols[(R() * bCols.length) | 0]
        b.add(new THREE.Mesh(lwGeo, wm)); b.add(new THREE.Mesh(rwGeo, wm))
        const bx = -30 + (R() - 0.5) * 190, bz = -330 + (R() - 0.5) * 170, by = SEA_Y + 16 + R() * 16
        b.position.set(bx, by, bz); b.userData = { x0: bx, z0: bz, y0: by, ph: R() * 6.28, spd: 0.4 + R() * 0.45 }
        bflyG.add(b)
      }
      scene.add(bflyG); skyDrifters.push({ o: bflyG, kind: 'butterfly' })
    }
    // 鶴＝群島の上をゆっくり大きく旋回して滑空する白い鳥のつがい（白い体に黒い翼端・優美な生命の気配）。
    { const cBody = tn(isNight ? 0xb8c0d0 : 0xf2f0ea), cDark = tn(isNight ? 0x5a6270 : 0x33373c)
      const buildCrane = (k) => { const g2 = new THREE.Group()
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), cBody); body.scale.set(2.4 * k, 0.95 * k, 1.0 * k); g2.add(body) // 胴(頭+x)
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5 * k, 1.6 * k, 6), cBody); tail.rotation.z = Math.PI / 2; tail.position.set(-2.6 * k, 0.1 * k, 0); g2.add(tail)
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * k, 0.22 * k, 2.2 * k, 6), cBody); neck.position.set(2.2 * k, 0.7 * k, 0); neck.rotation.z = -0.7; g2.add(neck)
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.32 * k, 8, 7), cBody); head.position.set(3.1 * k, 1.3 * k, 0); g2.add(head)
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1 * k, 0.6 * k, 5), cDark); beak.rotation.z = -Math.PI / 2; beak.position.set(3.7 * k, 1.3 * k, 0); g2.add(beak)
        const wings = []
        for (const sd of [-1, 1]) { const wp = new THREE.Group(); wp.position.set(0, 0.2 * k, sd * 0.5 * k)
          const w = new THREE.Mesh(new THREE.BoxGeometry(2.4 * k, 0.12 * k, 4.4 * k), cBody); w.position.set(0, 0, sd * 2.4 * k); wp.add(w)
          const tip = new THREE.Mesh(new THREE.BoxGeometry(1.5 * k, 0.13 * k, 1.4 * k), cDark); tip.position.set(-0.2 * k, 0, sd * 4.5 * k); wp.add(tip) // 黒い翼端
          g2.add(wp); wings.push({ wp, sd }) }
        g2.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
        return { g2, wings }
      }
      for (let i = 0; i < 2; i++) { const c = buildCrane(1.0 - i * 0.25); scene.add(c.g2); skyDrifters.push({ o: c.g2, kind: 'crane', wings: c.wings, cx: -30, cz: -320, rad: 120 + i * 18, ph: i * 1.3, hy: SEA_Y + 36 - i * 5 }) }
    }

    // ブロッケンの虹輪＝晴れた日に雲海の上を飛ぶと、自分の影を囲む円い虹が雲に映る（実在の現象＝静かな幻想）。
    // 自分の真下（反太陽点に近い）に淡い分光の輪を置き、frameで追従＋高度/昼でフェード。
    const glCv = document.createElement('canvas'); glCv.width = glCv.height = 128
    const gctx = glCv.getContext('2d'), grg = gctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grg.addColorStop(0.00, 'rgba(86,92,108,0.34)'); grg.addColorStop(0.16, 'rgba(86,92,108,0.12)') // 中心＝自分の影の翳り
    grg.addColorStop(0.30, 'rgba(255,250,235,0)')
    grg.addColorStop(0.44, 'rgba(120,150,255,0.46)'); grg.addColorStop(0.56, 'rgba(140,236,168,0.42)') // 青→緑
    grg.addColorStop(0.68, 'rgba(255,212,120,0.46)'); grg.addColorStop(0.80, 'rgba(255,122,110,0.44)') // 黄→赤
    grg.addColorStop(0.93, 'rgba(255,122,110,0)'); gctx.fillStyle = grg; gctx.fillRect(0, 0, 128, 128)
    const gloryTex = new THREE.CanvasTexture(glCv)
    glory = new THREE.Mesh(new THREE.CircleGeometry(16, 44), new THREE.MeshBasicMaterial({ map: gloryTex, transparent: true, opacity: 0, depthWrite: false, fog: false }))
    glory.rotation.x = -Math.PI / 2; glory.visible = false; scene.add(glory)

    // やさしい幻想：雲海の上にかかる大きな虹のアーチ。晴れた日に現れ、くぐると淡い分光に包まれる（実際にくぐれる夢の虹）。
    { const grp = new THREE.Group(), mats = []
      const bowFrag = 'varying float vR; uniform float uOp,uInner,uOuter,uRev,uScale; vec3 hsv(float h){ vec3 p=abs(fract(h+vec3(0.,2./3.,1./3.))*6.-3.); return clamp(p-1.,0.,1.); } void main(){ float rr=(vR-uInner)/(uOuter-uInner); float h=mix(0.78,0.0,rr); if(uRev>0.5) h=mix(0.0,0.78,rr); vec3 col=mix(vec3(1.0),hsv(h),0.58); float edge=smoothstep(0.0,0.22,rr)*(1.0-smoothstep(0.78,1.0,rr)); gl_FragColor=vec4(col, edge*uOp*uScale); }'
      const makeBow = (inner, outer, reversed, opScale) => {
        const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
          uniforms: { uOp: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer }, uRev: { value: reversed ? 1 : 0 }, uScale: { value: opScale } },
          vertexShader: 'varying float vR; void main(){ vR=length(position.xy); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ', fragmentShader: bowFrag })
        const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 120, 1, 0, Math.PI), mat); ring.frustumCulled = false; grp.add(ring); mats.push(mat)
      }
      makeBow(98, 122, false, 1.0); makeBow(132, 152, true, 0.26) // 主虹＋淡い副虹
      grp.position.set(-20, SEA_Y - 2, -360); grp.userData.mats = mats // 群島の北の空にかかる（南から北へ飛ぶと正面・くぐれる）
      scene.add(grp); rainbowArch = grp
    }
    // 鳥の渡り：V字の群れが雲海の上をゆっくり渡る。追いつくと並んで飛べる。
    // 造形は道連れと同じ共用かもめ（makeGullBird・関数宣言の巻き上げで後方定義でも呼べる）＝追いついた時の近接に耐える。
    { const flock = new THREE.Group(), wings = []
      for (let i = 0; i < (LIGHT ? 7 : 11); i++) { const bird = makeGullBird(1.7, isNight)
        bird.rotation.y = Math.PI // かもめは+z向き・この群れはローカル-zへ渡るため反転
        const row = Math.ceil(i / 2), sd = i % 2 === 0 ? 1 : -1
        bird.position.set(sd * row * 2.8, (R() - 0.5) * 0.7, row * 2.3); flock.add(bird); wings.push(...bird.userData.wings) } // V字（先頭から後ろへ広がる）
      flock.userData = { wings, baseY: SEA_Y + 32 }; flock.position.set(-320, SEA_Y + 32, -250); flock.rotation.y = -Math.PI / 2 // +Xへ渡る
      scene.add(flock); skyDrifters.push({ o: flock, kind: 'flock' })
    }
    // 雲の滝（滝雲）：雲海の縁から雲がゆっくり流れ落ちる絶景。落ちて薄れ、上から湧き直す。
    { const fall = new THREE.Group(), fallMat = new THREE.MeshBasicMaterial({ color: isNight ? 0x9aa0b4 : 0xf6f4ef, transparent: true, opacity: 0.92, depthWrite: false, fog: false })
      const topY = SEA_Y + 16, botY = SEA_Y - 54, fx = 78, fz = -232, fw = 36
      for (let i = 0; i < (LIGHT ? 24 : 42); i++) { const s = 3 + R() * 4, puff = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), fallMat)
        puff.scale.set(1, 1.5, 0.5); const x0 = fx + (R() - 0.5) * fw, z0 = fz + (R() - 0.5) * 12
        puff.position.set(x0, botY + R() * (topY - botY), z0); puff.userData = { spd: 9 + R() * 9, x0, z0, s }; fall.add(puff) }
      fall.userData = { topY, botY }; fall.visible = false; scene.add(fall); skyDrifters.push({ o: fall, kind: 'fall', mat: fallMat })
    }
    // 上昇気流＝暖かい街/丘・雲の塔・くつろぎ群島の上。巡航しながらここを通るとふわっと持ち上がる。
    THERMALS.push({ x: 0, z: -10, r: 34 }, { x: MOROOKA.x, z: MOROOKA.z, r: 28 }, { x: -20, z: -290, r: 46 })
    for (const tc of towerCenters) THERMALS.push({ x: tc.x, z: tc.z, r: 26 })
  }
  if (THERMALS.length === 0) THERMALS.push({ x: 0, z: -12, r: 26 }) // 谷戸など＝谷の上の上昇気流

  // ── 渡る鳥（はばたきながら空を弧で渡る。数羽） ──
  // 造形は道連れと同じ共用かもめ。userDataは翼参照(wings)を消さないようmergeで足す。
  const birds = []
  for (let i = 0; i < 5; i++) {
    const b = makeGullBird(1.15, isNight)
    Object.assign(b.userData, { cx: (R() - 0.5) * 40, cz: -40 - R() * 40, rad: 18 + R() * 16, yy: 30 + R() * 14, sp: 0.12 + R() * 0.08, ph: R() * 6.28 })
    scene.add(b); birds.push(b)
  }
  // かもめの共用ビルダー（道連れ・V字の行列・雲海の渡り・旋回の鳥を同じ造形に統一）。
  // 流線の胴＋起こした頭/くちばし＋平たい尾扇、かもめ特有のM字の翼(内羽=腕は水平／外羽=手は上へ折り、先端に黒い風切)。
  // 前=+z。羽ばたきは userData.wings の各groupを z回転（肩が支点）。ジオメトリ/材質は初回だけ作って全羽で共有＝軽い。
  // R()は使わない（建て順の乱数列を汚さない）。関数宣言=巻き上げで、先に走る雲海ブロックからも呼べる。
  function makeGullBird(scale = 1, night = false) {
    if (!makeGullBird.geo) {
      const cap = new THREE.CapsuleGeometry(0.095, 0.24, 4, 10); cap.rotateX(Math.PI / 2); cap.scale(1, 0.94, 1.18) // 胴（長軸=z・わずかに縦つぶし＋前後に伸ばす）
      const head = new THREE.SphereGeometry(0.10, 10, 8); head.translate(0, 0.055, 0.26)                            // 頭（前=+z・少し起こす）
      const tail = new THREE.ConeGeometry(0.10, 0.42, 6); tail.rotateX(-Math.PI / 2); tail.scale(1.7, 0.32, 1); tail.translate(0, -0.005, -0.30) // 平たく広い尾扇（後=-z）
      let bodyGeo = cap
      if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries([cap.toNonIndexed(), head.toNonIndexed(), tail.toNonIndexed()], false); if (m) bodyGeo = m }
      const beakGeo = new THREE.ConeGeometry(0.026, 0.13, 6).rotateX(Math.PI / 2) // くちばし（頭の前）
      const innerShape = new THREE.Shape()
      innerShape.moveTo(0.00, 0.11); innerShape.lineTo(0.24, 0.15); innerShape.lineTo(0.42, 0.12)   // 前縁（付け根→手首）
      innerShape.lineTo(0.42, -0.10); innerShape.lineTo(0.20, -0.13); innerShape.lineTo(0.00, -0.11); innerShape.closePath() // 後縁
      const innerGeo = new THREE.ShapeGeometry(innerShape); innerGeo.rotateX(Math.PI / 2)            // 水平に寝かせ前縁を+zへ
      const outerShape = new THREE.Shape()
      outerShape.moveTo(0.00, 0.12); outerShape.lineTo(0.22, 0.05); outerShape.lineTo(0.44, -0.03)   // 前縁（手首→尖った翼端）
      outerShape.lineTo(0.20, -0.10); outerShape.lineTo(0.00, -0.10); outerShape.closePath()          // 後縁
      const outerGeo = new THREE.ShapeGeometry(outerShape); outerGeo.rotateX(Math.PI / 2)
      const tipShape = new THREE.Shape()
      tipShape.moveTo(0.24, 0.02); tipShape.lineTo(0.44, -0.03); tipShape.lineTo(0.20, -0.09); tipShape.closePath() // 翼端の黒い風切
      const tipGeo = new THREE.ShapeGeometry(tipShape); tipGeo.rotateX(Math.PI / 2); tipGeo.translate(0, 0.006, 0)  // 外羽のわずか上=Zファイト回避
      makeGullBird.geo = { bodyGeo, beakGeo, innerGeo, outerGeo, tipGeo }
      const mkMats = (body, wing, tip, beak) => {
        const w = toon(wing); w.side = THREE.DoubleSide // 淡い灰（上面が陽に映え、下面も暗くなりすぎない）
        const tp = toon(tip); tp.side = THREE.DoubleSide // 翼端の黒い風切
        return { body: toon(body), wing: w, tip: tp, beak: toon(beak) }
      }
      makeGullBird.mats = {
        day: mkMats(0xf4f2ea, 0xd8dce2, 0x4a4d55, 0xe8a83a),   // 白×淡灰のかもめ
        night: mkMats(0xaab2c4, 0x8a92a6, 0x3a3f4e, 0x8a7048), // 夜は月明かりの淡青に沈める
      }
    }
    const G = makeGullBird.geo, M = night ? makeGullBird.mats.night : makeGullBird.mats.day
    const g = new THREE.Group(), wings = []
    g.add(new THREE.Mesh(G.bodyGeo, M.body))
    const beak = new THREE.Mesh(G.beakGeo, M.beak); beak.position.set(0, 0.05, 0.40); g.add(beak)
    for (const s of [1, -1]) { // 翼＝内羽(腕)＋外羽(手)の2節でM字。肩を支点に羽ばたく。
      const wing = new THREE.Group(); wing.position.set(s * 0.085, 0.05, 0.04)                     // 肩（羽ばたきの支点）
      wing.add(new THREE.Mesh(G.innerGeo, M.wing))                                                 // 内羽（腕・水平）
      const outer = new THREE.Group(); outer.position.set(0.42, 0, 0); outer.rotation.z = 0.26     // 手首から外羽を浅く上へ折る＝滑空の自然なM（強すぎると真横で帆に見える）
      outer.add(new THREE.Mesh(G.outerGeo, M.wing)); outer.add(new THREE.Mesh(G.tipGeo, M.tip))
      wing.add(outer)
      if (s < 0) wing.scale.x = -1                                                                  // 左翼は鏡像
      wing.userData.side = s; g.add(wing); wings.push(wing)
    }
    g.userData.wings = wings
    if (scale !== 1) g.scale.setScalar(scale)
    return g
  }
  // 飛行中、ふと一羽が並んで飛ぶ（つかの間の道連れ）。たまに現れ、少し伴走して離れていく。
  // 近接で見えるので、遠くの渡り鳥(暗いシルエット)でなく白×淡灰のかもめとして作り込む（造形は上の共用ビルダー）。
  const comp = makeGullBird()
  comp.visible = false; scene.add(comp)
  let compActive = false, compT = 0, compCool = 6, compSide = 1
  const compPhase = R() * 6.28

  // ── 走る車・歩く住民（中央の通りを行き交う）。街のみ（谷戸では作らない）。 ──
  if (kind !== 'yato') {
  const carCols = [0xb0564a, 0xe8e2d4, 0x3a5a7a, 0x9a9488, 0x4a6a4a, 0xc8b84a]
  cars = []
  const wheelMat = toon(0x18181c), glassMat = toon(0x8aa2b4)
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group()
    const col = carCols[i % carCols.length]
    // 車体・客室は面取りした箱（RoundedBox）＝丸みのある車に（低ポリの角張った箱を脱す）。
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.6, 3.4, 2, 0.24), toon(col))
    body.position.y = 0.66; body.castShadow = true; g.add(body)
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.54, 0.52, 1.8, 2, 0.2), glassMat); cabin.position.set(0, 1.12, -0.1); g.add(cabin) // 窓(水色ガラス)
    const roof = new THREE.Mesh(new RoundedBoxGeometry(1.58, 0.12, 1.55, 1, 0.06), toon(col)); roof.position.set(0, 1.42, -0.1); roof.castShadow = true; g.add(roof) // 屋根(車体色)
    for (const wx of [-0.82, 0.82]) for (const wz of [-1.05, 1.1]) { // 4輪
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12), wheelMat)
      wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.32, wz); g.add(wheel)
    }
    const dir = (i % 2 === 0) ? 1 : -1
    // テールランプ（赤・常時）
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xc23a2c, fog: true }))
    tail.position.set(0, 0.6, dir > 0 ? 1.72 : -1.72); g.add(tail)
    if (duskAmt > 0.2) { // ヘッドライト（夕/夜）
      const light = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: true }))
      light.position.set(0, 0.58, dir > 0 ? -1.72 : 1.72); g.add(light)
    }
    g.userData = { dir, lane: dir > 0 ? -1.5 : 1.5, speed: 7 + R() * 5, z: -16 + R() * 38 } // spawnも走行区間内（R()呼び出し回数は不変＝下流の配置シードを守る）
    town.add(g); cars.push(g)
  }
  // バス（街道を走る大型車。クリーム＋緑帯・夜は室内灯）。cars に混ぜて同じ流れで走る。
  for (let b = 0; b < 2; b++) {
    const g = new THREE.Group()
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.0, 2.3, 6.6, 2, 0.3), toon(0xe8e2d0)); body.position.y = 1.3; body.castShadow = true; g.add(body)
    const belt = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.42, 6.62), toon(0x4a8a5a)); belt.position.y = 0.95; g.add(belt)
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.72, 5.6), glassMat); win.position.y = 1.7; g.add(win)
    const roof = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.2, 6.4, 1, 0.1), toon(0xe8e2d0)); roof.position.y = 2.45; roof.castShadow = true; g.add(roof)
    for (const wx of [-0.95, 0.95]) for (const wz of [-2.1, 2.1]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 12), wheelMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(wx, 0.42, wz); g.add(wheel) }
    const dir = b === 0 ? 1 : -1
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: 0xc23a2c, fog: true })); tail.position.set(0, 0.8, dir > 0 ? 3.34 : -3.34); g.add(tail)
    if (duskAmt > 0.2) { const light = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: true })); light.position.set(0, 0.78, dir > 0 ? -3.34 : 3.34); g.add(light); const inl = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 5.4), new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: true })); inl.position.y = 1.7; g.add(inl) }
    g.userData = { dir, lane: dir > 0 ? -1.7 : 1.7, speed: 5 + R() * 2, z: -16 + R() * 38 } // バスも同区間（R()回数不変）
    town.add(g); cars.push(g)
  }
  // 駅前のロータリー（島・植栽）＋バス停（上屋・ベンチ・丸看板）。駅(34,-44)の手前。
  {
    const rx = 31, rz = -36, ry = heightAt(rx, rz)
    const curb = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.28, 6, 20), toon(0xb6b0a4)); curb.rotation.x = Math.PI / 2; curb.position.set(rx, ry + 0.22, rz); town.add(curb)
    const isle = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.32, 20), toon(season === 'spring' ? 0x7a9a4e : season === 'autumn' ? 0x9a8048 : 0x6e8a4e)); isle.position.set(rx, ry + 0.16, rz); isle.receiveShadow = true; town.add(isle)
    tree(rx, rz, 1.2 + R() * 0.3)
    const stopX = rx - 5.5, stopZ = rz - 1, sgy = heightAt(stopX, stopZ)
    const sg = new THREE.Group(); sg.position.set(stopX, sgy, stopZ); town.add(sg)
    const proof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.16, 1.6), toon(0x6a8a9a)); proof.position.set(0, 2.6, 0); proof.castShadow = true; sg.add(proof)
    for (const px of [-1.2, 1.2]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), toon(0x8a8680)); post.position.set(px, 1.3, -0.6); sg.add(post) }
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.4), toon(0x8a6a48)); bench.position.set(0, 0.5, -0.5); sg.add(bench)
    const signpost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), toon(0x8a8680)); signpost.position.set(1.7, 1.2, 0.5); sg.add(signpost)
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16), new THREE.MeshBasicMaterial({ color: 0xf0ece0 })); sign.rotation.x = Math.PI / 2; sign.position.set(1.7, 2.4, 0.5); sg.add(sign)
    colliders.push({ x: rx, z: rz, r: 3.2 })
  }

  // ── 歩く住民（歩道を行き交う人影）＋ランドマークの賑わい。脚・腕のある中品質に底上げ（近景=walk/低空で映える）。──
  const peepCols = [0x5a78a0, 0xc06a6a, 0x6a8a5a, 0xb0a060, 0x8a6aa0, 0xd0d0c8, 0x4a5560, 0xcf6f93, 0xd0904e]
  const pantsCols = [0x3a3a44, 0x4a4036, 0x33414e, 0x46342e, 0x55504a], hairCols = [0x2a221c, 0x1e1a16, 0x3a2e24, 0x4c3727, 0x6b5038]
  const skinCols = [0xf0c49c, 0xf6d2b0, 0xe8b489]
  const peepBodyMat = toon(0xffffff); peepBodyMat.vertexColors = true // 歩行者の静止部(胴/首/頭/髪)を1メッシュへ統合する共有材
  // ── 顔は「大きなアニメの目鼻を描いた1枚のテクスチャ」を頭前面に貼る（調査ベースの刷新：ローポリ3Dの魅力は“面に描いた目鼻”＋大きな塊＝小さな3D粒の寄せ集めより読みやすく軽い）。虹彩色×髪色でキャッシュ。住人(makeResident)と歩行者(makePeep)で共有するため両者より前に置く。
  const faceTexCache = new Map()
  const makeFaceTex = (irisHex, hairHex) => {
    const key = (irisHex >>> 0) + '|' + (hairHex >>> 0); const cc = faceTexCache.get(key); if (cc) return cc
    const S = 128, cv = document.createElement('canvas'); cv.width = S; cv.height = S; const x = cv.getContext('2d')
    const hex = (h) => '#' + (h >>> 0).toString(16).padStart(6, '0').slice(-6)
    const iris = hex(irisHex || 0x5a4632), hair = hex(hairHex || 0x2a2420), lash = '#2a221d'
    const eye = (cx) => { // 優しい瞳：黒一色をやめ温かい焦げ茶＋虹彩＋瞳孔＋大きなつや。小さめ横長で「サングラス」を脱し生命感を出す
      x.fillStyle = '#4a3a30'; x.beginPath(); x.ellipse(cx, 63, 9, 11.5, 0, 0, 7); x.fill() // 瞳の外形（焦げ茶）
      x.fillStyle = iris; x.beginPath(); x.ellipse(cx, 64.5, 6, 8, 0, 0, 7); x.fill() // 虹彩（設定色）
      x.fillStyle = '#241c17'; x.beginPath(); x.ellipse(cx, 65, 3, 4, 0, 0, 7); x.fill() // 瞳孔
      x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(cx - 2.6, 58.5, 3.4, 4.2, 0, 0, 7); x.fill() // 大きなつや＝生命感
      x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.arc(cx + 2.8, 67, 1.5, 0, 7); x.fill()
      x.strokeStyle = '#3a2c24'; x.globalAlpha = 0.5; x.lineWidth = 2.2; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - 8, 56.5); x.quadraticCurveTo(cx, 53.5, cx + 8, 56.5); x.stroke(); x.globalAlpha = 1 // 薄い上まぶた（睨まない柔らかい弧）
    }
    eye(48); eye(80) // 左右間隔を詰める（離れすぎ＝サングラス感の解消）
    x.strokeStyle = hair; x.globalAlpha = 0.42; x.lineWidth = 3; x.lineCap = 'round' // 眉＝細く短くうっすら
    x.beginPath(); x.moveTo(41, 44); x.quadraticCurveTo(48, 40.5, 55, 44); x.stroke()
    x.beginPath(); x.moveTo(73, 44); x.quadraticCurveTo(80, 40.5, 87, 44); x.stroke()
    x.globalAlpha = 1
    x.fillStyle = 'rgba(150,110,95,0.32)'; x.beginPath(); x.arc(64, 82, 2.1, 0, 7); x.fill() // 鼻＝小さな点
    x.strokeStyle = '#bd7a68'; x.lineWidth = 3.6; x.lineCap = 'round'; x.beginPath(); x.moveTo(56, 95); x.quadraticCurveTo(64, 100, 72, 95); x.stroke() // 優しい微笑み
    x.fillStyle = 'rgba(235,162,150,0.42)'; x.beginPath(); x.ellipse(34, 81, 9, 6, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(94, 81, 9, 6, 0, 0, 7); x.fill() // 頬の柔らかい赤み（目の下へ寄せる）
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; faceTexCache.set(key, tex); return tex
  }
  // 歩行者の顔（黒い点2つを脱し、住人と同じ目鼻のテクスチャを頭前面の弧へ貼る）。ジオメトリ・材は iris×髪 でキャッシュ＝描画コールは1体あたり+1のみ。
  const peepIris = [0x5a86c2, 0x5a9e60, 0xb88a3e, 0x9a6238, 0x7a5aa8]
  const peepFaceGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.26, 14, 1, true, -0.86, 1.72)
  const peepFaceMatCache = new Map()
  const peepFaceMat = (irisHex, hairHex) => { const k = (irisHex >>> 0) + '|' + (hairHex >>> 0); let m = peepFaceMatCache.get(k); if (!m) { m = new THREE.MeshToonMaterial({ map: makeFaceTex(irisHex, hairHex), gradientMap: grad, transparent: true, alphaTest: 0.42, depthWrite: false, fog: true }); peepFaceMatCache.set(k, m) } return m }
  const makePeep = () => {
    const g = new THREE.Group(), legs = [], arms = []
    // 色は先に確定（R()の消費順は従来通り: ズボン→上着→髪→肌）＝下流の決定的配置を崩さない
    const pantHex = pantsCols[(R() * pantsCols.length) | 0], topHex = peepCols[(R() * peepCols.length) | 0], hairHex = hairCols[(R() * hairCols.length) | 0], skinHex = skinCols[(R() * skinCols.length) | 0]
    const irisHex = peepIris[(Math.max(0, hairCols.indexOf(hairHex)) + 2) % peepIris.length] // 虹彩は髪色から導出＝R()を消費せず、下流の決定的配置を一切ずらさない
    const shoeHex = 0x33302b // 靴（暗い差し色）
    // 手足を1メッシュへ統合し頂点色で焼く小ヘルパー（袖＋手／すね＋靴を各1メッシュ＝描画コール不変のまま手と足を足す）。材は統合体と同じ頂点色トゥーンを共有。
    const limb = (parts) => { const gs = []; for (const [geo, hex] of parts) { const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); gs.push(geo) }
      const merged = BufferGeometryUtils.mergeGeometries ? BufferGeometryUtils.mergeGeometries(gs, false) : gs[0]; const m = new THREE.Mesh(merged || gs[0], peepBodyMat); m.castShadow = true; gs.forEach((q) => { if (q !== m.geometry) q.dispose() }); return m }
    // 脚は股関節(上端)を支点に振れるようGroup原点を股に置く。すね＋足(靴)を1メッシュへ＝棒脚を脱す。
    for (const s of [-1, 1]) { const leg = new THREE.Group(); const fo = new THREE.SphereGeometry(0.052, 8, 6).toNonIndexed(); fo.scale(1.0, 0.5, 1.7); fo.translate(0, -0.64, 0.045) // 足（前に伸ばした扁平な靴）
      const lm = limb([[new THREE.CylinderGeometry(0.08, 0.062, 0.62, 7).toNonIndexed().translate(0, -0.31, 0), pantHex], [fo, shoeHex]]); leg.add(lm); leg.position.set(s * 0.1, 0.74, 0); g.add(leg); legs.push(leg) } // 2本の脚（股支点・足つき）
    // 腕は肩支点。袖＋手を1メッシュへ＝棒腕を脱す。ほんの少し前へ／外へ＝こわばりを抜く。
    for (const s of [-1, 1]) { const arm = new THREE.Group(); const ha = new THREE.SphereGeometry(0.044, 8, 6).toNonIndexed(); ha.scale(0.92, 1.0, 0.8); ha.translate(0, -0.49, 0.012) // 手（小さく平たく）
      const am = limb([[new THREE.CylinderGeometry(0.052, 0.041, 0.46, 7).toNonIndexed().translate(0, -0.24, 0), topHex], [ha, skinHex]]); arm.add(am); arm.position.set(s * 0.2, 1.28, 0); arm.rotation.z = s * 0.11; arm.rotation.x = -0.04; g.add(arm); arms.push(arm) } // 腕（肩支点・手つき・relaxed）
    // 胴＋首＋頭＋髪＋目を頂点色で1メッシュへ統合＝歩行者1体の描画コールを 8→5 に（窓辺=発熱ホットスポットで効く。腕脚の可動は維持）。
    const bgeos = []
    const bbake = (geo, hex) => { const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); bgeos.push(geo) }
    bbake(new THREE.CylinderGeometry(0.185, 0.132, 0.62, 14).toNonIndexed().translate(0, 1.04, 0), topHex) // 胴（肩→腰のテーパー・肩を少し狭め角を丸める）
    { const sh = new THREE.SphereGeometry(0.195, 14, 8).toNonIndexed(); sh.scale(1.0, 0.42, 0.62); sh.translate(0, 1.3, 0); bbake(sh, topHex) } // 肩（横に張る稜線・少し狭め滑らかに）
    bbake(new THREE.CylinderGeometry(0.048, 0.058, 0.1, 8).toNonIndexed().translate(0, 1.37, 0), skinHex) // 首
    const hg = new THREE.SphereGeometry(0.17, 12, 10).toNonIndexed(); hg.scale(0.94, 1.06, 0.96); hg.translate(0, 1.55, 0); bbake(hg, skinHex) // 頭（小さめ＝約7頭身）
    // 髪：兜(額〜目まで覆う一枚半球)を脱し、頭頂クラウン＋うなじ＋中央分けの前髪へ＝額を見せて顔が立つ（全てベイク統合＝描画コール不変・R()不消費）
    { const crown = new THREE.SphereGeometry(0.182, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.47).toNonIndexed(); crown.scale(1.0, 1.06, 0.99); crown.translate(0, 1.556, -0.004); bbake(crown, hairHex) } // 頭頂を覆い額の手前で止める
    { const nape = new THREE.SphereGeometry(0.137, 10, 8).toNonIndexed(); nape.scale(1.04, 0.92, 0.7); nape.translate(0, 1.498, -0.092); bbake(nape, hairHex) } // 後頭部〜うなじ（後ろだけ下げる）
    for (const s of [-1, 1]) { const fr = new THREE.SphereGeometry(0.062, 8, 6).toNonIndexed(); fr.scale(1.05, 0.52, 0.44); fr.translate(s * 0.052, 1.62, 0.138); bbake(fr, hairHex) } // 中央分けの前髪（左右に分け額を出す・目にかからない高さ）
    if (BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(bgeos, false); if (m) { const body = new THREE.Mesh(m, peepBodyMat); body.castShadow = true; g.add(body) } bgeos.forEach((q) => q.dispose()) }
    const pface = new THREE.Mesh(peepFaceGeo, peepFaceMat(irisHex, hairHex)); pface.position.set(0, 1.532, 0); pface.renderOrder = 2; pface.castShadow = false; g.add(pface) // 顔＝目鼻のテクスチャ（黒い点2つを脱し「顔のある人」へ。共有ジオメトリ/材で描画コール+1のみ）
    g.scale.setScalar(0.86 + R() * 0.28) // 背丈の個体差（子供〜大人）
    // 歩き癖の個体差（描画コール不変・R()の float 範囲のみ＝配列添字は触らず安全）。全員が同じ振幅・同じ歩調で
    // 機械的に行進する“ロボット感”を崩し、一人ひとり違う歩みに＝群れが生きて見える（実機FB: まだ生きている感が足りない）。
    g.userData = { legs, arms,
      gaitAmp: 0.42 + R() * 0.34, // 歩幅（脚の振れ）: よく歩く人・のんびり歩く人
      armAmp: 0.24 + R() * 0.30,  // 腕の振り: 大きく振る人・ほとんど振らない人
      cadMul: 0.86 + R() * 0.32,  // 歩調の速さの癖（同じ移動速度でも足の運びの速さは人それぞれ）
      bob: 0.042 + R() * 0.034,   // 頭の弾みの深さ
      sway: (R() - 0.5) * 0.14,   // 左右の重心の揺れ癖（肩をわずかに振る）
      armLead: (R() - 0.5) * 0.7, // 腕と脚の位相ずれ（完全な逆位相を崩す＝生身のばらつき）
    }
    return g
  }
  peeps = []
  for (let i = 0; i < (LIGHT ? 6 : 11); i++) {
    const g = makePeep()
    const dir = (i % 2 === 0) ? 1 : -1
    Object.assign(g.userData, { dir, x: (dir > 0 ? -3.0 : 3.0) + (R() - 0.5), speed: 1.1 + R() * 0.8, z: -85 + R() * 105, ph: R() * 6.28 })
    town.add(g); peeps.push(g)
  }
  // ランドマークの賑わい（駅前・商店街・川辺・公園に人が集う。その場でゆっくり佇み・体の向きを変える）。
  const crowdSpots = [
    { x: STATION.x, z: STATION.z + STATION.r - 1.5, n: 5, rad: 3.2 }, // 駅前の広場
    { x: STATION.x, z: STATION.z - 4.6, n: 5, rad: 3.4 },             // 駅のホーム（電車を待つ人）
    { x: 0, z: -14, n: 4, rad: 2.6 },                                 // 商店街のゲート下
    { x: 0, z: -28, n: 5, rad: 3.0 },                                 // 商店街の通り（買い物客）
    { x: -45.5, z: -17, n: 3, rad: 2.4 },                             // 川辺（東岸の遊歩道）
    { x: 14, z: -19, n: 4, rad: 2.4 },                                // 公園の池のほとり
    { x: TEMPLE.x, z: TEMPLE.z + 7, n: 4, rad: 2.6 },                 // 寺の参道
    { x: SCHOOL.x, z: SCHOOL.z + 6, n: 4, rad: 3.0 },                 // 学校の校庭
    { x: FUN.x, z: FUN.z + 9, n: 5, rad: 3.0 },                       // 遊園地のゲート前
    { x: 73, z: -34, n: 3, rad: 2.6 },                                // 砂浜（海辺の人）
    { x: HARBOR.x - 2, z: HARBOR.z + 1, n: 3, rad: 3.0 },             // 港（働く人）
    { x: -47, z: -42, n: 2, rad: 2.2 },                               // 川辺の遊歩道（南寄り）
    { x: DOWNTOWN.x, z: DOWNTOWN.z + 8, n: 6, rad: 4.2 },             // 副都心の駅前広場（通勤の人波）
    { x: DOWNTOWN.x - 10, z: DOWNTOWN.z - 6, n: 4, rad: 3.2 },        // 副都心の通り
    { x: STADIUM.x, z: STADIUM.z + 18, n: 6, rad: 4.4 },             // 競技場のゲート前（観客）
  ]
  crowdCenters = crowdSpots.map((s) => ({ x: s.x, z: s.z, r: s.rad + 9 })) // 音のざわめき用（人だまりの少し広めの範囲）
  // 時代の人の街(江戸/大正)も広い人だまりとして加える＝渡って低空/地上へ降りると、その街のざわめきが満ちる。
  // 戦国は山城＝人より自然(風/沢/鴉)が主役なので加えず静けさを個性に＝「時代を渡ると音が変わる」（評価サウンド: 時代が無音の致命傷）。
  if (kind !== 'yato') crowdCenters.push({ x: EDO.x, z: EDO.z, r: 92 }, { x: TAISHO.x, z: TAISHO.z, r: 84 })
  for (const s of crowdSpots) for (let i = 0; i < (LIGHT ? Math.ceil(s.n * 0.5) : s.n); i++) {
    const g = makePeep()
    let hx = s.x + (R() - 0.5) * s.rad * 1.4, hz = s.z + (R() - 0.5) * s.rad * 1.4
    if (blockedAt(hx, hz)) { let ok = false // 人だまりの定位置が建物に入ったら近くの空きへ（食い込み防止）
      for (let st = 1.2; st <= 8 && !ok; st += 1.2) for (let a = 0; a < 12 && !ok; a++) { const nx = hx + Math.sin(a / 12 * 6.2832) * st, nz = hz - Math.cos(a / 12 * 6.2832) * st; if (!blockedAt(nx, nz)) { hx = nx; hz = nz; ok = true } }
      if (!ok && !blockedAt(s.x, s.z)) hx = s.x, hz = s.z // 中心が空いていれば中心へ
      else if (!ok) continue // 周囲が祭り等で埋まり空きが無ければ置かない（建物に食い込むより居ない方が自然）
    }
    Object.assign(g.userData, { loiter: true, hx, hz, rad: 0.3 + R() * 0.6, ph: R() * 6.28, sp: 0.3 + R() * 0.4, face: R() * 6.28 })
    g.position.set(hx, heightAt(hx, hz), hz)
    town.add(g); peeps.push(g)
  }
  // ── 作り込んだ住人（顔つき・アニメ調）。近景で映える要所に少数（猫と同じ「基本図形＋トゥーン＋顔」）。──
  const RES_SKIN = [0xf7d8bc, 0xfadcc2, 0xf2cda8, 0xf6d4b4] // 明るくミルキーな肌（トゥーンの陰側が暗く落ちるので地色は明るめが正解）
  const RES_HAIR = [0x2a221c, 0x1d1916, 0x3a2a1e, 0x4c3727, 0x6b5038, 0x2c2c32]
  const RES_TOP = [0x5a78a0, 0xbf6a6a, 0x6a8a5a, 0xb0a060, 0x8a6aa0, 0xd8d4cc, 0x495560, 0xd0904e, 0xcf6f93]
  const RES_BOT = [0x39414e, 0x4a4036, 0x2e3640, 0x55504a, 0x6a3a3a, 0x40506a]
  const RES_IRIS = [0x5a86c2, 0x5a9e60, 0xb88a3e, 0x9a6238, 0x7a5aa8] // 明るい瞳（青/緑/琥珀/茶/菫）＝白目と明るい虹彩で目を開いて見せる
  // 住人の接地影（足元に柔らかな影＝人形の浮きを消し、地に立たせる）
  const resShadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); const grd = x.createRadialGradient(24, 24, 1, 24, 24, 24); grd.addColorStop(0, 'rgba(0,0,0,0.42)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.2)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = grd; x.fillRect(0, 0, 48, 48); const t = new THREE.CanvasTexture(c); return t })()
  const resShadowMat = new THREE.MeshBasicMaterial({ map: resShadowTex, transparent: true, depthWrite: false, fog: true })
  const resShadowGeo = new THREE.PlaneGeometry(1, 1)
  const RES_OUTLINE = new THREE.MeshBasicMaterial({ color: 0x2a211c, side: THREE.BackSide, fog: true }) // セル画の黒い主線（裏面を法線方向に押し出す定番手法）
  // ── 港町の少女（一枚絵の立ち絵）。顔も体も一枚として描き、常にこちらを向く＝「顔と体が合わない/お面が浮く」が原理的に起きない。手描きの温かみで街に馴染ませる。 ──
  const drawHarborGirl2D = (x, cfg = {}) => {
    // 色は cfg から派生（陰/艶を自動生成）＝髪色・肌色・服色を変えても破綻しない＝「いろんな人」を出せる
    const hx = (c) => '#' + c.getHexString()
    const hcol = new THREE.Color(cfg.hair || 0x2b2521), scol = new THREE.Color(cfg.skin || 0xf3d4b6)
    const tcol = new THREE.Color(cfg.top || 0xf2ede2), bcol = new THREE.Color(cfg.bottom || 0x37424f)
    const hair = hx(hcol), hairSh = hx(hcol.clone().multiplyScalar(0.6)), hairHi = hx(hcol.clone().lerp(new THREE.Color(0xfff0e0), 0.3))
    const skin = hx(scol), skinSh = hx(scol.clone().multiplyScalar(0.91))
    const top = hx(tcol), topSh = hx(tcol.clone().multiplyScalar(0.91))
    const bot = hx(bcol), botSh = hx(bcol.clone().multiplyScalar(0.78)), botHi = hx(bcol.clone().lerp(new THREE.Color(0xffffff), 0.16))
    const bag = cfg.bag || '#9c7d56', bagSh = '#7e6240', line = '#3a2c24', mouthC = '#bb7567', blush = 'rgba(231,150,127,0.42)'
    x.lineJoin = 'round'; x.lineCap = 'round'
    const L = (w, c) => { x.strokeStyle = c || line; x.lineWidth = w; x.stroke() }
    const F = (c) => { x.fillStyle = c; x.fill() }
    // 後ろ髪（ボブ）
    x.beginPath(); x.moveTo(138, 96); x.bezierCurveTo(112, 150, 120, 205, 150, 232); x.bezierCurveTo(165, 246, 168, 232, 180, 232); x.bezierCurveTo(192, 232, 195, 246, 210, 232); x.bezierCurveTo(240, 205, 248, 150, 222, 96); x.bezierCurveTo(210, 52, 150, 52, 138, 96); x.closePath(); F(hair); L(4)
    x.beginPath(); x.moveTo(206, 72); x.bezierCurveTo(236, 112, 234, 182, 210, 228); x.bezierCurveTo(226, 182, 226, 120, 206, 82); x.closePath(); F(hairSh)
    // パンツ（濃紺・ハイウエストのワイド）
    x.beginPath(); x.moveTo(140, 330); x.lineTo(222, 330); x.bezierCurveTo(240, 340, 244, 430, 236, 500); x.lineTo(214, 628); x.lineTo(188, 628); x.lineTo(182, 500); x.lineTo(176, 628); x.lineTo(150, 628); x.bezierCurveTo(124, 500, 120, 410, 140, 330); x.closePath(); F(bot); L(4)
    x.beginPath(); x.moveTo(182, 332); x.lineTo(222, 330); x.bezierCurveTo(240, 340, 244, 430, 236, 500); x.lineTo(214, 628); x.lineTo(188, 628); x.lineTo(182, 500); x.closePath(); F(botSh)
    x.beginPath(); x.moveTo(138, 348); x.bezierCurveTo(130, 430, 140, 520, 156, 600); L(4, botHi)
    x.beginPath(); x.moveTo(182, 350); x.lineTo(182, 626); L(2.5)
    for (const sx of [165, 199]) { x.beginPath(); x.ellipse(sx, 636, 17, 11, 0, 0, 6.2832); F('#2c2722'); L(3) } // 靴
    // ブラウス（白・半袖）
    x.beginPath(); x.moveTo(150, 200); x.bezierCurveTo(132, 214, 126, 280, 134, 340); x.lineTo(228, 340); x.bezierCurveTo(236, 280, 230, 214, 212, 200); x.bezierCurveTo(200, 188, 162, 188, 150, 200); x.closePath(); F(top); L(4)
    x.beginPath(); x.moveTo(192, 196); x.bezierCurveTo(214, 216, 220, 286, 216, 340); x.lineTo(228, 340); x.bezierCurveTo(236, 280, 230, 214, 212, 200); x.closePath(); F(topSh)
    x.beginPath(); x.moveTo(134, 334); x.lineTo(228, 334); L(2.5)
    for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(180 + sx * 22, 200); x.lineTo(180 + sx * 28, 332); L(7, bot); L(1.5) } // 肩紐
    // 斜め掛けの鞄
    x.beginPath(); x.moveTo(150, 206); x.lineTo(238, 360); L(9, bag); L(1.5)
    x.beginPath(); x.moveTo(214, 350); x.lineTo(262, 360); x.lineTo(252, 432); x.lineTo(204, 422); x.closePath(); F(bag); L(4)
    x.beginPath(); x.moveTo(210, 372); x.lineTo(258, 382); L(2.5, bagSh)
    // 腕（半袖＋素肌の前腕＋手）
    for (const sx of [-1, 1]) {
      x.beginPath(); x.moveTo(180 + sx * 34, 200); x.bezierCurveTo(180 + sx * 62, 206, 180 + sx * 64, 244, 180 + sx * 56, 272); x.lineTo(180 + sx * 36, 268); x.bezierCurveTo(180 + sx * 32, 236, 180 + sx * 32, 214, 180 + sx * 34, 200); x.closePath(); F(top); L(3.5)
      x.beginPath(); x.moveTo(180 + sx * 56, 268); x.bezierCurveTo(180 + sx * 58, 312, 180 + sx * 52, 354, 180 + sx * 47, 388); x.bezierCurveTo(180 + sx * 40, 390, 180 + sx * 36, 388, 180 + sx * 35, 384); x.bezierCurveTo(180 + sx * 36, 340, 180 + sx * 38, 300, 180 + sx * 37, 266); x.closePath(); F(skin); L(3.5)
      x.beginPath(); x.moveTo(180 + sx * 47, 384); x.bezierCurveTo(180 + sx * 53, 396, 180 + sx * 51, 416, 180 + sx * 43, 422); x.bezierCurveTo(180 + sx * 34, 424, 180 + sx * 30, 408, 180 + sx * 33, 388); x.closePath(); F(skin); L(3)
      x.beginPath(); x.moveTo(180 + sx * 36, 410); x.quadraticCurveTo(180 + sx * 44, 414, 180 + sx * 50, 406); L(1.4, skinSh)
    }
    // 首
    x.beginPath(); x.moveTo(166, 158); x.lineTo(194, 158); x.lineTo(192, 196); x.lineTo(168, 196); x.closePath(); F(skin); L(3)
    x.beginPath(); x.moveTo(168, 176); x.quadraticCurveTo(180, 184, 192, 176); L(2, skinSh)
    // 顔
    x.beginPath(); x.moveTo(146, 108); x.bezierCurveTo(146, 142, 160, 166, 180, 166); x.bezierCurveTo(200, 166, 214, 142, 214, 108); x.bezierCurveTo(214, 72, 146, 72, 146, 108); x.closePath(); F(skin); L(4)
    // やわらかい陰影で頬・顎に丸み（光は左上から）。放射グラデで縁を溶かし“貼り付けたパッチ”を避ける。
    { const g2 = x.createRadialGradient(202, 134, 2, 202, 134, 25); g2.addColorStop(0, 'rgba(213,165,133,0.30)'); g2.addColorStop(1, 'rgba(213,165,133,0)'); x.fillStyle = g2; x.beginPath(); x.ellipse(201, 136, 16, 28, 0, 0, 6.2832); x.fill() } // 右頬〜エラの陰
    { const g2 = x.createRadialGradient(180, 163, 1, 180, 163, 20); g2.addColorStop(0, 'rgba(207,159,127,0.30)'); g2.addColorStop(1, 'rgba(207,159,127,0)'); x.fillStyle = g2; x.beginPath(); x.ellipse(180, 164, 19, 9, 0, 0, 6.2832); x.fill() } // 顎の下の陰
    { const g2 = x.createRadialGradient(159, 116, 1, 159, 116, 22); g2.addColorStop(0, 'rgba(255,247,238,0.24)'); g2.addColorStop(1, 'rgba(255,247,238,0)'); x.fillStyle = g2; x.beginPath(); x.ellipse(159, 118, 16, 22, 0, 0, 6.2832); x.fill() } // 左頬の明り（ハイライト）
    // 頬の赤み（ごく淡く＝顔から浮く陰のパッチは置かない。一枚の肌として馴染ませる）
    for (const sx of [-1, 1]) { const bg = x.createRadialGradient(180 + sx * 31, 138, 1, 180 + sx * 31, 138, 13); bg.addColorStop(0, 'rgba(232,150,128,0.32)'); bg.addColorStop(1, 'rgba(232,150,128,0)'); x.fillStyle = bg; x.beginPath(); x.ellipse(180 + sx * 31, 138, 13, 9, 0, 0, 6.2832); x.fill() }
    // 目（小さめ・やさしい）
    for (const sx of [-1, 1]) {
      const ex = 180 + sx * 13.5, ey = 124 // 中央寄せ＝目1.5個分の自然な間隔
      x.beginPath(); x.ellipse(ex, ey, 5, 6.4, 0, 0, 6.2832); F('#fbf6ef') // 白目（小）
      x.beginPath(); x.ellipse(ex, ey + 0.6, 4, 5.4, 0, 0, 6.2832); F('#43301f') // 虹彩（濃い地）
      x.beginPath(); x.ellipse(ex, ey + 2.4, 3.2, 3, 0, 0, 6.2832); F('#7c5634') // 虹彩の下＝明るく透明感
      x.beginPath(); x.ellipse(ex, ey + 1.2, 1.9, 2.9, 0, 0, 6.2832); F('#231910') // 瞳孔
      x.beginPath(); x.ellipse(ex - sx * 1.4, ey - 1.6, 1.5, 1.9, 0, 0, 6.2832); F('#ffffff') // ハイライト大
      x.beginPath(); x.ellipse(ex + sx * 1.3, ey + 2.7, 0.85, 1.0, 0, 0, 6.2832); F('rgba(255,255,255,0.6)') // 下のきらめき
      x.beginPath(); x.moveTo(ex - 6, ey - 2.6); x.quadraticCurveTo(ex, ey - 7.6, ex + 6, ey - 2); L(2.5, line) // 上まぶた（細い弧）
      x.beginPath(); x.moveTo(ex - 6.5, ey - 9.5); x.quadraticCurveTo(ex, ey - 11.5, ex + 7, ey - 9); L(1.7, hairSh) // 眉（細い）
    }
    // 鼻・口
    x.beginPath(); x.ellipse(180, 145, 5.5, 2.4, 0, 0, 6.2832); F('rgba(200,150,120,0.2)') // 鼻先の下のやわらかい陰
    x.beginPath(); x.moveTo(181, 136); x.lineTo(177, 144); L(1.5, 'rgba(150,108,84,0.5)') // 鼻（眉〜鼻／鼻〜顎を等間隔へ＝上へ寄せる）
    x.beginPath(); x.moveTo(171, 152); x.quadraticCurveTo(180, 158, 189, 152); L(2.6, mouthC) // 口
    x.beginPath(); x.moveTo(174, 153.5); x.quadraticCurveTo(180, 156, 186, 153.5); L(2.2, '#e0a48f')
    // 前髪（中央分け＋毛束、生え際を額に重ね）
    x.beginPath(); x.moveTo(140, 108)
    x.bezierCurveTo(136, 56, 224, 56, 220, 108)
    x.bezierCurveTo(213, 108, 206, 112, 197, 108)
    x.bezierCurveTo(191, 110, 188, 109, 184, 104)
    x.bezierCurveTo(181, 101, 179, 101, 176, 104)
    x.bezierCurveTo(172, 109, 169, 110, 163, 108)
    x.bezierCurveTo(154, 112, 147, 108, 140, 108); x.closePath(); F(hair); L(3) // 前髪（やわらかいフリンジ・浅い中央分け・生え際を下げ額を詰める／尖った房を排除）
    x.beginPath(); x.moveTo(180, 72); x.quadraticCurveTo(178, 88, 177, 102); L(1.5, hairSh) // 中央分けの毛流れ（ごく控えめ）
    for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(180 + sx * 38, 98); x.bezierCurveTo(180 + sx * 46, 132, 180 + sx * 40, 168, 180 + sx * 30, 178); x.bezierCurveTo(180 + sx * 36, 144, 180 + sx * 36, 116, 180 + sx * 35, 100); x.closePath(); F(hair); L(3) } // サイドの毛
    // 髪の艶（頭頂の光の帯＋細い強い艶＋サイドの毛流れ＝のっぺりを脱す）
    x.beginPath(); x.moveTo(150, 80); x.quadraticCurveTo(180, 66, 210, 80); L(5, 'rgba(122,106,94,0.45)')
    x.beginPath(); x.moveTo(158, 76); x.quadraticCurveTo(180, 67, 202, 76); L(2.4, hairHi)
    for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(180 + sx * 24, 72); x.quadraticCurveTo(180 + sx * 40, 120, 180 + sx * 30, 174); L(1.3, hairSh) }
  }
  if (/[?&]dev=1/.test(location.search)) window.__girlPNG2 = (cfgJson, faceZoom) => { const cv = document.createElement('canvas'); cv.width = 360; cv.height = 720; drawHarborGirl2D(cv.getContext('2d'), cfgJson ? JSON.parse(cfgJson) : {}); if (faceZoom) { const fc = document.createElement('canvas'); fc.width = 340; fc.height = 360; const fx = fc.getContext('2d'); fx.drawImage(cv, 114, 44, 132, 140, 0, 0, 340, 360); return fc.toDataURL() } return cv.toDataURL() } // 検証用: 立ち絵をそのままPNGに（faceZoomで顔アップ）
  // 立ち絵を板ポリのビルボードに。シーンの光色で淡く染め（MeshBasicの満光が夕景で“浮く/光る”のを防ぐ）＋fogで遠近を馴染ませる。
  const girlTint = new THREE.Color(isNight ? 0x9aa6c0 : sunCol.getHex()).multiplyScalar(isNight ? 0.5 : 0.86)
  const makeGirlStandee = (cfg) => {
    const cv = document.createElement('canvas'); cv.width = 360; cv.height = 720; drawHarborGirl2D(cv.getContext('2d'), cfg || {})
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, fog: true }); mat.color.copy(girlTint)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.1), mat); m.position.y = 1.03
    const grp = new THREE.Group(); grp.add(m)
    const sh = new THREE.Mesh(resShadowGeo, resShadowMat); sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.03, 0.04); sh.scale.set(0.5, 0.7, 1); sh.renderOrder = 1; grp.add(sh)
    grp.userData = { spr: m }; return grp
  }
  const placeGirl = (hx, hz, cfg) => { const gy = heightAt(hx, hz); if (gy < SEA.level + 0.6) return; const g = makeGirlStandee(cfg); g.position.set(hx, gy, hz); town.add(g); standees.push(g) }
  // 「いろんな人が世界にいる」＝髪/肌/服/鞄の色幅を広げてランダムに（陰/艶はdrawHarborGirl2Dが地色から自動生成）
  const GIRL_HAIR = ['#2b2521', '#33291f', '#241c18', '#4a3526', '#5e4632', '#6b4a2e']
  const GIRL_SKIN = ['#f3d4b6', '#efcaa8', '#e8bd98', '#f6dcc0']
  const GIRL_TOP = ['#f2ede2', '#eae3d2', '#dde6e2', '#ecdcd8', '#dde6d6', '#e2dcec', '#cfd8dc']
  const GIRL_BOT = ['#37424f', '#2f3a44', '#3a3530', '#4a4036', '#3d4a44', '#544a5a']
  const GIRL_BAG = ['#9c7d56', '#7e6748', '#a98c63', '#6e5a44', '#8a6a52']
  const GR = (a) => a[(R() * a.length) | 0]
  const girlCfg = () => ({ hair: GR(GIRL_HAIR), skin: GR(GIRL_SKIN), top: GR(GIRL_TOP), bottom: GR(GIRL_BOT), bag: GR(GIRL_BAG) })
  // （顔テクスチャ makeFaceTex は歩行者(makePeep)と共有するため、上方＝makePeep の前へ移設済み。）
  const makeResident = (cfg = {}) => {
    // アニメ寄りだが人に近い：自然なアーモンドの目・一体感のある体・関節（膝/肘）・接地影。約6頭身。
    const g = new THREE.Group()
    const outfit = cfg.outfit || 'modern'
    const skin = toon(cfg.skin), hairM = toon(cfg.hair), topM = toon(cfg.top), botM = toon(cfg.bottom || cfg.top), shoeM = toon(cfg.shoe || 0x33302b)
    skin.emissive = new THREE.Color(cfg.skin); skin.emissiveIntensity = 0.12 // 顔が影側でも暗く沈まないよう肌をわずかに自己発光（強いと霧/夕の中で煌々と浮くので控えめに）
    const white = toon(0xe6e0d4), dark = toon(0x2c2622), irisM = toon(cfg.iris || 0x5a4632), mouthM = toon(0xc08274), browM = toon(cfg.hair), blush = toon(0xe2a596) // 襟/白目は陰影付き(toon)＝MeshBasicの煌々とした白で霧の谷に浮かない
    const accentM = toon(cfg.accent || 0x8a6a3a) // 帯・襟・差し色
    const SP = (r, w, h) => new THREE.SphereGeometry(r, w || 16, h || 14), CY = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 16), BX = (w, h, d) => new THREE.BoxGeometry(w, h, d)
    const add = (p, geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz); m.castShadow = true; p.add(m); return m }
    // ── 一体の連続メッシュ：断面リング(楕円)を滑らかにつなぐ＝球の寄せ集めでない「一枚の体・手足」。──
    const outlineList = [] // 黒い主線を付ける主要メッシュ（シルエット）
    const loft = (rings, mat, parent, noOutline) => { const N = 14, vp = [], idx = []
      const flip = rings[rings.length - 1].y < rings[0].y // 【真因修正】リングがy降順だと面の巻きが逆＝法線が内向きになり、表面が裏面カリングされ黒い輪郭(裏面ハル)だけが残って「顔・袖・脚が真っ黒」に潰れていた。降順のときだけ面を反転し必ず外向きにする（y昇順の胴は従来通りで無改変＝無リスク）
      for (const r of rings) for (let j = 0; j < N; j++) { const a = (j / N) * Math.PI * 2; vp.push((r.x || 0) + Math.cos(a) * r.rx, r.y, (r.z || 0) + Math.sin(a) * (r.rz || r.rx)) }
      for (let i = 0; i < rings.length - 1; i++) { const a0 = i * N, a1 = (i + 1) * N; for (let j = 0; j < N; j++) { const jn = (j + 1) % N
        if (flip) idx.push(a0 + j, a0 + jn, a1 + j, a0 + jn, a1 + jn, a1 + j); else idx.push(a0 + j, a1 + j, a0 + jn, a0 + jn, a1 + j, a1 + jn) } } // 外向き
      const cap = (r, dir, base) => { const c = vp.length / 3; vp.push(r.x || 0, r.y + dir * Math.max(r.rx, r.rz || r.rx) * 0.85, r.z || 0); for (let j = 0; j < N; j++) { const jn = (j + 1) % N; const fwd = (dir > 0) !== flip; if (fwd) idx.push(base + j, base + jn, c); else idx.push(base + jn, base + j, c) } }
      cap(rings[0], -1, 0); cap(rings[rings.length - 1], 1, (rings.length - 1) * N)
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3)); geo.setIndex(idx); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); if (!noOutline) outlineList.push(m); return m }
    // 黒い主線＝メッシュの裏面を法線方向に押し出した複製。関節がズレないよう各メッシュごとに作る。
    const addOutlines = (amt) => { for (const m of outlineList) { const g2 = m.geometry.clone(); const pos = g2.attributes.position, nor = g2.attributes.normal
      for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) + nor.getX(i) * amt, pos.getY(i) + nor.getY(i) * amt, pos.getZ(i) + nor.getZ(i) * amt)
      const om = new THREE.Mesh(g2, RES_OUTLINE); om.position.copy(m.position); om.quaternion.copy(m.quaternion); om.scale.copy(m.scale); om.renderOrder = -1; m.parent.add(om) } }
    const arms = [], legs = []
    // 腕＝肩→肘→手首の滑らかな一本のテーパー（少し前へ＝自然）＋手。肩で振れる。
    const buildArms = (sleeveMat, wide) => { const asym = (Math.random() - 0.5) * 0.12; for (const s of [-1, 1]) { const armG = new THREE.Group(); armG.position.set(s * 0.15, 1.37, 0); g.add(armG) // 肩幅縮小に合わせ腕の付け根を内へ
      if (wide) loft([{ y: 0.02, rx: 0.072 }, { y: -0.18, rx: 0.08 }, { y: -0.36, rx: 0.062 }, { y: -0.47, rx: 0.045 }], sleeveMat, armG) // 着物の袖（少し細く）
      else { loft([{ y: 0.03, rx: 0.06, z: 0.004 }, { y: -0.17, rx: 0.054, z: 0.016 }, { y: -0.32, rx: 0.047, z: 0.05 }, { y: -0.47, rx: 0.04, z: 0.085 }], sleeveMat, armG, true); add(armG, SP(0.04, 12, 12), skin, 0, -0.5, 0.078, 0.66, 1.1, 0.42).rotation.z = s * 0.22 } // 腕を細く＝華奢。手は小さく平たく（ソーセージ/ミトン回避）
      armG.rotation.z = s * 0.09; armG.userData = { base: (s > 0 ? asym : -asym) }; arms.push(armG) } } // 腕を体に寄せる＝なで肩・華奢（肩の角を隠す）。左右で角度差＝非対称
    // 脚＝腰→膝→足首の滑らかな一本のテーパー＋足。股関節で振れる。
    const buildLegs = (legMat, rad) => { for (const s of [-1, 1]) { const legG = new THREE.Group(); legG.position.set(s * 0.078, 0.92, 0); g.add(legG)
      loft([{ y: 0.05, rx: rad * 1.4 }, { y: -0.2, rx: rad * 1.05 }, { y: -0.4, rx: rad * 0.85, z: 0.012 }, { y: -0.6, rx: rad * 0.68, z: 0.02 }, { y: -0.8, rx: rad * 0.58, z: 0.02 }], legMat, legG); add(legG, SP(0.05), shoeM, 0, -0.84, 0.05, 1.3, 0.5, 1.7); legs.push(legG) } } // むちっとした腿＋締まった足首＝幼い脚（デザイナー評価）。靴も小さめ
    // ── 体（衣装別。胴は一体のロフトで人体の一枚の形に）──
    if (outfit === 'kimono' || outfit === 'armor') {
      loft([{ y: 0.06, rx: 0.188, rz: 0.152 }, { y: 0.5, rx: 0.158, rz: 0.13 }, { y: 0.9, rx: 0.14, rz: 0.112 }, { y: 1.2, rx: 0.14, rz: 0.108 }, { y: 1.42, rx: 0.155, rz: 0.11 }, { y: 1.47, rx: 0.082, rz: 0.07 }], topM, g) // 着物の身頃（肩をやや狭め全体を少し細く＝華奢）
      add(g, CY(0.148, 0.142, 0.1, 18), accentM, 0, 0.9, 0) // 帯
      for (const s of [-1, 1]) add(g, BX(0.04, 0.4, 0.02), white, s * 0.038, 1.2, 0.12).rotation.z = -s * 0.3 // 襟
      for (const s of [-1, 1]) add(g, SP(0.057), shoeM, s * 0.06, 0.05, 0.05, 1.4, 0.5, 1.9) // 足
      buildArms(topM, true)
      if (outfit === 'armor') { loft([{ y: 0.86, rx: 0.172, rz: 0.144 }, { y: 1.08, rx: 0.186, rz: 0.153 }, { y: 1.3, rx: 0.172, rz: 0.144 }], botM, g) // 胴丸（胸当て）
        for (const s of [-1, 1]) add(g, SP(0.078, 12, 10), botM, s * 0.14, 1.4, 0, 1, 0.8, 0.88) } // 肩の防具（やや小さく）
    } else if (outfit === 'hakama') {
      loft([{ y: 0.9, rx: 0.14, rz: 0.114 }, { y: 1.18, rx: 0.13, rz: 0.102 }, { y: 1.42, rx: 0.148, rz: 0.104 }, { y: 1.47, rx: 0.082, rz: 0.07 }], topM, g) // 上衣（肩をやや狭め細く）
      loft([{ y: 0.06, rx: 0.205, rz: 0.156 }, { y: 0.4, rx: 0.182, rz: 0.142 }, { y: 0.78, rx: 0.155, rz: 0.124 }, { y: 0.93, rx: 0.145, rz: 0.117 }], botM, g) // 袴（下が広い・全体を少し細く）
      add(g, CY(0.15, 0.205, 0.09, 18), accentM, 0, 0.86, 0) // 帯
      for (const s of [-1, 1]) add(g, SP(0.057), shoeM, s * 0.06, 0.05, 0.05, 1.4, 0.5, 1.9)
      buildArms(topM, true)
    } else if (outfit === 'dress') {
      buildLegs(skin, 0.046) // 脚
      loft([{ y: 0.1, rx: 0.22, rz: 0.17 }, { y: 0.5, rx: 0.142, rz: 0.115 }, { y: 0.86, rx: 0.112, rz: 0.09 }, { y: 1.1, rx: 0.108, rz: 0.086 }, { y: 1.3, rx: 0.126, rz: 0.092 }, { y: 1.42, rx: 0.14, rz: 0.098 }, { y: 1.47, rx: 0.078, rz: 0.068 }], topM, g) // ワンピース（裾広がり〜くびれ〜肩の一枚。全体を細く）
      add(g, CY(0.124, 0.124, 0.05, 16), accentM, 0, 1.0, 0) // ウエスト
      buildArms(topM, false)
    } else if (outfit === 'blouse') { // 添付の模倣: 白い半袖ブラウス＋濃色ハイウエストのワイドパンツ＋肩紐
      buildLegs(botM, 0.066)
      loft([{ y: 0.74, rx: 0.12, rz: 0.098 }, { y: 0.95, rx: 0.116, rz: 0.094 }, { y: 1.1, rx: 0.112, rz: 0.09 }], botM, g) // ハイウエストのパンツ（細く）
      loft([{ y: 1.07, rx: 0.112, rz: 0.09 }, { y: 1.22, rx: 0.114, rz: 0.092 }, { y: 1.34, rx: 0.132, rz: 0.1 }, { y: 1.42, rx: 0.15, rz: 0.104 }, { y: 1.47, rx: 0.082, rz: 0.07 }], topM, g) // 白ブラウス（肩を狭めウエストを絞る＝華奢）
      for (const s of [-1, 1]) add(g, BX(0.024, 0.32, 0.025), botM, s * 0.07, 1.26, 0.095).rotation.z = s * 0.03 // 肩紐
      buildArms(topM, false)
    } else { // modern / suit
      buildLegs(botM, 0.058)
      loft([{ y: 0.74, rx: 0.122, rz: 0.098 }, { y: 0.95, rx: 0.116, rz: 0.092 }, { y: 1.07, rx: 0.112, rz: 0.09 }], botM, g) // 腰〜パンツ（細く）
      loft([{ y: 1.04, rx: 0.103, rz: 0.084 }, { y: 1.18, rx: 0.106, rz: 0.086 }, { y: 1.33, rx: 0.134, rz: 0.1 }, { y: 1.43, rx: 0.163, rz: 0.108 }, { y: 1.47, rx: 0.082, rz: 0.072 }], topM, g) // 胴（肩を0.21→0.163へ狭め・ウエストを絞りS字くびれ＝寸胴の樽を解消）
      if (outfit === 'suit') add(g, BX(0.04, 0.3, 0.02), accentM, 0, 1.24, 0.1) // ネクタイ
      buildArms(topM, false)
    }
    add(g, CY(0.044, 0.05, 0.12, 12), skin, 0, 1.46, 0) // 首（頭が肩に乗る支え＝生首が浮く錯視を防ぎ顔を小さく見せる。短め・やや太め）
    // ── 頭（小さめ＝約7頭身）＋顔（角のある輪郭：頭頂は丸く・こめかみ最大・顎へ細めて顎先を出す＝アニメの面） ──
    const headG = new THREE.Group(); headG.position.set(0, 1.6, 0); headG.scale.setScalar(0.9); g.add(headG) // 頭(顔)全体を一回り小さく（実機FB「顔が大きい」）。最終のscale/yは末尾で確定
    loft([{ y: 0.082, rx: 0.052 }, { y: 0.05, rx: 0.088, rz: 0.084 }, { y: 0.012, rx: 0.099, rz: 0.093 }, { y: -0.032, rx: 0.097, rz: 0.091 }, { y: -0.068, rx: 0.079, rz: 0.075 }, { y: -0.10, rx: 0.048, rz: 0.05 }], skin, headG) // 丸く柔らかい卵形。頭頂を下げ「目より上」を詰める＋輪郭は小さめ＝top-heavy/ミサワ解消
    for (const s of [-1, 1]) add(headG, SP(0.02), skin, s * 0.1, -0.012, 0.0, 0.7, 1, 0.7) // 耳
    // 顔＝大きなアニメの目鼻を描いたテクスチャを頭前面の薄い円筒面（頭の丸みに沿う）へ貼る。小さな3Dパーツの寄せ集めをやめ、距離でも崩れず魅力的に（調査ベースの刷新）。
    const faceTex = makeFaceTex(cfg.iris, cfg.hair)
    const faceGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.165, 16, 1, true, -0.86, 1.72)
    const faceMesh = new THREE.Mesh(faceGeo, new THREE.MeshToonMaterial({ map: faceTex, gradientMap: grad, transparent: true, alphaTest: 0.42, depthWrite: false, fog: true }))
    faceMesh.position.set(0, -0.012, 0); faceMesh.renderOrder = 2; headG.add(faceMesh)
    // ── 髪：さらさら・ふわっとした自然な毛。丸い地肌キャップ＋中央分けで左右へ流れる「平たい柔らかな房」を重ねる（毛先は丸く＝尖らせない／球のぼこぼこ・コーンのトゲを脱す）。──
    const hs = cfg.hairStyle
    const hCap = (cz, sy, sx) => add(headG, SP(0.104, 22, 18), hairM, 0, 0.014, cz, sx || 1.0, sy, 0.98) // ふわっと膨らむ地肌。顔の1.17倍→1.05倍に絞り「黒い兜で顔がデカく見える」を解消
    const fringe = (fz, drop) => { // 前髪＝中央でしっかり割り、額を見せて左右へ斜めに流す（一枚板の兜＝目に被さりサングラス化、を解消）
      for (const s of [-1, 1]) { const b = add(headG, SP(0.078, 16, 12), hairM, s * 0.05, 0.058, fz, 1.04, drop * 0.9, 0.62); b.rotation.z = s * 0.62; b.rotation.x = -0.16 } // 左右の房を離して斜め分け＝額の肌を出す
      add(headG, SP(0.038, 12, 10), hairM, 0, 0.086, fz - 0.004, 0.86, drop * 0.55, 0.48) } // 分け目の小さな山（高い位置＝額を覆わない）
    const sideHair = (sy) => { for (const s of [-1, 1]) add(headG, SP(0.04, 14, 12), hairM, s * 0.094, -0.018, 0.012, 0.66, sy, 0.82) } // 頬に沿う柔らかい横髪（張り出しを詰め顔まわりを小さく）
    if (hs === 'topknot') { add(headG, SP(0.113, 16, 14), hairM, 0, 0.012, -0.03, 1.02, 1.0, 1.0)
      add(headG, CY(0.026, 0.032, 0.07, 10), hairM, 0, 0.115, -0.012); add(headG, SP(0.04, 10, 8), skin, 0, 0.072, 0.08, 1.6, 0.5, 0.6) } // 髷＋月代(時代物)
    else if (hs === 'hat') { add(headG, SP(0.111, 14, 12), hairM, 0, 0.0, -0.032, 1.0, 0.9, 1.0) } // 笠の下
    else if (hs === 'bob') { hCap(-0.026, 0.9); fringe(0.086, 0.6)
      for (const s of [-1, 1]) add(headG, SP(0.052, 14, 12), hairM, s * 0.088, -0.05, 0.0, 0.62, 2.0, 0.9) } // 頬を包む長い横髪（張り出しを詰め顔を小さく＝ボブ）
    else if (hs === 'short') { hCap(-0.018, 0.86, 1.03); fringe(0.088, 0.5); sideHair(1.15) } // 短髪
    else { hCap(-0.026, 0.92); fringe(0.086, 0.6); sideHair(1.7)
      if ((hs | 0) === 1) add(headG, SP(0.072, 14, 12), hairM, 0, -0.05, -0.085, 1.12, 1.3, 0.95) } // たまに後ろで結った膨らみ
    // ── 帽子（hat）。headG(縮小0.88)の子＝頭と一緒に縮み正しく載る（頭を小さくしても浮かない） ──
    if (cfg.hat === 'kasa') { add(headG, CY(0.035, 0.28, 0.13, 16), toon(cfg.hatCol || 0xc6a866), 0, 0.125, 0) }
    else if (cfg.hat === 'jingasa') { add(headG, CY(0.045, 0.24, 0.08, 16), toon(cfg.hatCol || 0x4a3a2c), 0, 0.115, 0) }
    else if (cfg.hat === 'fedora') { const hm = toon(cfg.hatCol || 0x3a322a); add(headG, CY(0.155, 0.155, 0.018, 16), hm, 0, 0.092, 0); add(headG, CY(0.095, 0.105, 0.11, 14), hm, 0, 0.155, 0) }
    else if (cfg.hat === 'cap') { const hm = toon(cfg.hatCol || 0x2a2e38); add(headG, SP(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hm, 0, 0.066, 0); add(headG, BX(0.17, 0.022, 0.08), hm, 0, 0.046, 0.118) }
    // ── 小道具（prop） ──
    if (cfg.prop === 'swords') for (const [ln, yy] of [[0.56, 0.9], [0.4, 0.86]]) { const sw = add(g, CY(0.013, 0.013, ln, 6), toon(0x2a2620), -0.2, yy, -0.04); sw.rotation.z = 0.5; sw.rotation.x = -0.2 }
    else if (cfg.prop === 'spear') { add(g, CY(0.018, 0.018, 1.9, 6), toon(0x5a4632), 0.25, 0.92, -0.05); add(g, CY(0.0, 0.026, 0.15, 6), toon(0xb8bcc2), 0.25, 1.9, -0.05) }
    else if (cfg.prop === 'bundle') { add(g, SP(0.14, 12, 10), toon(cfg.accent || 0x8a6a4a), 0, 1.16, -0.18, 1, 1.1, 0.9) }
    else if (cfg.prop === 'cane') { add(g, CY(0.013, 0.013, 0.86, 6), toon(0x3a2e22), 0.25, 0.44, 0.12) }
    else if (cfg.prop === 'bag') { const bm = toon(cfg.bagCol || 0x8a7256) // 斜め掛けの鞄（添付の少女）
      const strap = add(g, BX(0.028, 0.52, 0.02), bm, 0, 1.18, 0.12); strap.rotation.z = 0.52 // たすき掛けの紐
      add(g, BX(0.17, 0.2, 0.08), bm, 0.2, 0.92, 0.07, 1, 1, 1).rotation.y = 0.1 } // 鞄本体（腰）
    addOutlines(0.009) // 体・手足・頭に黒い主線（セル画のライン）
    // ── 等身の是正（デザイナー評価: 8.5頭身は伸びすぎ→約6頭身の幼く親しみやすい比率へ）。頭は据え置き、体だけをグループ化して縦に縮める。──
    const body = new THREE.Group()
    for (const ch of g.children.slice()) { if (ch !== headG) body.add(ch) } // 頭(headG)以外＝胴/手足/首/小物/輪郭をまとめて圧縮
    g.add(body); body.scale.set(0.82, 0.72, 0.82); body.position.y = -0.06 // 横を強めに絞り「華奢」に（0.9→0.82）。縦は据え置き気味で背は低い幼児体型を保つ
    headG.scale.setScalar(0.9); headG.position.y = 1.11 // 頭をやや小さく(0.94→0.9)。細くした首の上へ座らせる（生首が浮く感を消し顔を小さく見せる）
    // 接地影（足元の柔らかな影＝人形の浮きを消して地に立たせる）
    const shadow = new THREE.Mesh(resShadowGeo, resShadowMat); shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.03, 0.02); shadow.scale.set(0.42, 0.66, 1); shadow.renderOrder = 1; g.add(shadow)
    g.scale.setScalar((cfg.scale || 1) * (0.98 + R() * 0.12))
    g.userData = { arms, legs, headG }
    return g
  }
  // ── home（現代）の住人を要所に ──
  // 歩く目線で出会う近景の住人は高品質(makeResident)で。窓辺の眺めの手前(広場)＋よく歩く通り沿いにも足し、「人の形が甘い」遠景peepでなく作り込んだ人と出会えるように。
  const residentSpots = [ { x: 0, z: -25 }, { x: STATION.x - 1.4, z: STATION.z + STATION.r - 1.2 }, { x: 13, z: -16 }, { x: -44, z: -18 }, { x: DOWNTOWN.x - 2, z: DOWNTOWN.z + 9 }, { x: 2, z: -30 }, { x: 4.5, z: 4 }, { x: -4.5, z: -12 }, { x: 7, z: -46 }, { x: -7, z: -58 } ]
  const placeResident = (hx, hz, cfg) => {
    if (blockedAt(hx, hz)) { // 配置点が建物の中なら近くの空きへ寄せる（実機FB: 住民が建物に食い込む）
      let ok = false
      for (let s = 1.2; s <= 6 && !ok; s += 1.4) for (let a = 0; a < 8 && !ok; a++) { const nx = hx + Math.sin(a / 8 * 6.2832) * s, nz = hz - Math.cos(a / 8 * 6.2832) * s; if (!blockedAt(nx, nz)) { hx = nx; hz = nz; ok = true } }
      if (!ok) return // 近くに空きが無ければ置かない（密集地で建物に埋もれるより居ない方が自然）
    }
    const g = makeResident(cfg); const gy = heightAt(hx, hz); if (gy < SEA.level + 0.6) return; g.position.set(hx, gy, hz); const u = g.userData; u.ax = hx; u.az = hz; u.tx = hx; u.tz = hz; u.face = R() * 6.28; u.ph = R() * 6.28; u.pauseT = 0.5 + R() * 4; u.moving = false; u.speed = 0.66 + R() * 0.5; u.rad = 4 + R() * 5; g.rotation.y = u.face; town.add(g); residents.push(g) }
  const RES_MODERN = ['modern', 'modern', 'suit', 'blouse']
  for (const sp of residentSpots) placeResident(sp.x + (R() - 0.5) * 1.6, sp.z + (R() - 0.5) * 1.6, { skin: RES_SKIN[(R() * RES_SKIN.length) | 0], hair: RES_HAIR[(R() * RES_HAIR.length) | 0], top: RES_TOP[(R() * RES_TOP.length) | 0], bottom: RES_BOT[(R() * RES_BOT.length) | 0], iris: RES_IRIS[(R() * RES_IRIS.length) | 0], outfit: RES_MODERN[(R() * RES_MODERN.length) | 0], hairStyle: (R() * 3) | 0 })
  // ── home の通りを行き交う人々（人の気配の密度＝降り立った街の賑わい）。歩く人(中央通り)＋佇む人(駅前/公園/副都心)。
  // 旧mkPeep2は静止した円柱＋球で「人形・生きてるか分からない」との実機FB→makePeepでアニメさせpeeps配列へ（歩く/佇む）。
  if (kind !== 'yato') {
    for (let i = 0; i < (LIGHT ? 8 : 12); i++) { const z = -84 + R() * 96, x = (R() < 0.5 ? -1 : 1) * (2.4 + R() * 1.5), py = heightAt(x, z); if (py < SEA.level + 1 || (Math.abs(z - RAIL.z) < 3 && x > RAIL.x0 - 1 && x < RAIL.x1 + 1)) continue; const g = makePeep(); const dir = x < 0 ? 1 : -1; g.position.set(x, py, z); Object.assign(g.userData, { dir, x, speed: 0.85 + R() * 0.9, z, ph: R() * 6.28 }); town.add(g); peeps.push(g) } // 中央通りを歩く（人通りの密度＝賑わい。速度に幅＝急ぐ人/そぞろ歩き）
    for (const [cx, cz, n] of [[STATION.x, STATION.z + STATION.r - 2, 4], [PARK.x, PARK.z, 3], [DOWNTOWN.x, DOWNTOWN.z, 3]]) for (let i = 0; i < n; i++) { const a = R() * 6.28, rr = 3 + R() * 6, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr, py = heightAt(x, z); if (py < SEA.level + 1.2 || x > SEA.coast || blockedAt(x, z)) continue; const g = makePeep(); g.position.set(x, py, z); Object.assign(g.userData, { loiter: true, hx: x, hz: z, rad: 0.3 + R() * 0.6, ph: R() * 6.28, sp: 0.3 + R() * 0.4, face: R() * 6.28 }); town.add(g); peeps.push(g) } } // 駅前/公園/副都心の人だかり（佇む）
  // ── 街角の野仏（お地蔵さん）。昭和の住宅地の路傍にあった祈りの点＝「誰かが手を合わせた気配」＝人の不在の現前。
  //    赤いよだれかけ・手向けの一輪・積み石。説明文は置かない（歩いて気づく人だけのもの）。雲海の野仏(IPセーフな独自意匠)をhomeへ移植。
  if (kind !== 'yato') {
    const jx = 6.4, jz = -41, jy = heightAt(jx, jz)
    if (jy > SEA.level + 0.5 && !blockedAt(jx, jz)) {
      const jizo = new THREE.Group(); jizo.position.set(jx, jy, jz); jizo.rotation.y = -0.5 // 通りの方へ少し向く
      const stone = toon(0x9c988e), moss = toon(0x6f7a44), bibCol = toon(isNight ? 0x7a2e26 : 0xbe3b2e)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 8), stone); base.position.y = 0.25; base.castShadow = true; jizo.add(base) // 台石
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.9, 10), stone); body.position.y = 0.95; body.castShadow = true; jizo.add(body) // 体（顔は描かない丸みのある石仏）
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), stone); head.position.y = 1.58; head.scale.y = 1.08; head.castShadow = true; jizo.add(head)
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 6, 0, 6.2832, 0, 1.05), moss); cap.position.y = 1.62; jizo.add(cap) // 頭にむした苔
      const bib = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.42, 10, 1, true), bibCol); bib.position.y = 1.16; jizo.add(bib) // 赤いよだれかけ
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 4), toon(0x5a7a3a)); stem.position.set(0.32, 0.66, 0.16); jizo.add(stem)
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(0xe8a0b4)); bloom.position.set(0.32, 0.83, 0.16); jizo.add(bloom) // 手向けの一輪
      for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.075 - i * 0.015, 6, 5), stone); p.position.set(-0.34, 0.56 + i * 0.1, 0.2); p.scale.y = 0.7; p.castShadow = true; jizo.add(p) } // 積み石
      town.add(jizo)
    }
  }
  // ── 縁台と置き忘れた麦わら帽子。誰かがさっきまで夕涼みしていた気配＝人の不在の現前（手ぬぐいを縁に掛けて）。
  //    野仏とは別の「人の気配」を街の別の一角に。説明文は置かない（歩いて気づく）。
  if (kind !== 'yato') {
    const bx = -6.0, bz = -6, by = heightAt(bx, bz)
    if (by > SEA.level + 0.5 && !blockedAt(bx, bz)) {
      const en = new THREE.Group(); en.position.set(bx, by, bz); en.rotation.y = 0.6
      const wood = toon(0x8a6a44), woodDk = toon(0x6a4f33)
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.46), wood); top.position.y = 0.44; top.castShadow = true; en.add(top) // 天板
      for (const sx of [-0.62, 0.62]) for (const sz of [-0.16, 0.16]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), woodDk); leg.position.set(sx, 0.21, sz); leg.castShadow = true; en.add(leg) } // 脚
      const hat = new THREE.Group(); hat.position.set(0.36, 0.5, 0.0) // 麦わら帽子（つば＋丸い冠）を置き忘れて
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.025, 16), toon(0xd0af6c)); hat.add(brim)
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, 6.2832, 0, 1.25), toon(0xc6a25e)); crown.position.y = 0.05; hat.add(crown)
      hat.children.forEach((m) => { m.castShadow = true }); en.add(hat)
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.3), toon(0x35506e)); towel.position.set(-0.52, 0.3, 0.0); en.add(towel) // 縁に掛けた藍の手ぬぐい
      town.add(en)
    }
  }
  // ── けんけんぱの白墨（チョーク）の輪。子どもがさっきまで路傍で遊んでいた跡＝今は誰もいない「人の不在の現前」。
  //    舗装に薄く描かれた○の連なり（一つ／二つ並び）と、転がした一本のチョーク。説明文は置かない（歩いて気づく＝『夏休み』の手触り）。
  if (kind !== 'yato') {
    const cx0 = 0, cz0 = 6 // 窓のすぐ前の広場（PLAZA_HOME）。開けた平地で、窓辺の眺めの手前に見える子の遊び場
    if (heightAt(cx0, cz0) > SEA.level + 0.4 && !blockedAt(cx0, cz0)) {
      const ke = new THREE.Group(); ke.position.set(cx0, 0, cz0) // 各輪は地形高さに沿わせる（緩斜面でも浮き沈みしない）
      const chalk = toon(0xd8d3c4), ring = new THREE.TorusGeometry(0.36, 0.04, 6, 20) // 退色した白墨（共有材を汚さぬよう専用色・専用ジオメトリ）
      const cell = [[0], [0], [-0.44, 0.44], [0], [-0.44, 0.44], [0], [-0.44, 0.44]] // ○／○／○○／○／○○／○／○○（けんけんぱの並び。広場に収まるよう横へ伸ばす）
      cell.forEach((dz, i) => { const x = -3 + i * 1.0; dz.forEach((z) => { const r = new THREE.Mesh(ring, chalk); r.rotation.x = Math.PI / 2; r.position.set(x, heightAt(cx0 + x, cz0 + z) + 0.02, z); ke.add(r) }) })
      const sgx = 3.6, sgz = 0.4, stub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), toon(0xeae3d0)); stub.rotation.z = Math.PI / 2; stub.rotation.y = 0.5; stub.position.set(sgx, heightAt(cx0 + sgx, cz0 + sgz) + 0.03, sgz); ke.add(stub) // 転がした白墨を一本
      town.add(ke)
    }
  }
  // ── 立てかけた捕虫網と虫かご。さっきまで虫捕りをしていた子の気配＝「人の不在の現前」。
  //    公園の縁の草地に、網を地に挿して少し傾け、足もとに虫かご。説明文は置かない（歩いて気づく＝『夏休み』の象徴）。
  if (kind !== 'yato') {
    const nx = 11, nz = -24, ny = heightAt(nx, nz)
    if (ny > SEA.level + 0.4 && !blockedAt(nx, nz)) {
      const ng = new THREE.Group(); ng.position.set(nx, ny, nz); ng.rotation.y = 0.7
      const bamboo = toon(0xc6a868), netCol = toon(0xeef0ea), kagoCol = toon(0xdfe6cf), kagoDk = toon(0x9aa884)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 1.5, 6), bamboo); pole.position.set(0, 0.72, 0); pole.rotation.z = 0.14; pole.castShadow = true; ng.add(pole) // 竹竿を地に挿して少し傾ける
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.014, 6, 16), bamboo); hoop.position.set(0.2, 1.46, 0); hoop.rotation.y = Math.PI / 2; ng.add(hoop) // 網の輪
      const bag = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.34, 12, 1, true), netCol); bag.position.set(0.2, 1.28, 0); ng.add(bag) // 網の袋（下にすぼまる）
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 12), kagoCol); body.position.set(0.42, 0.13, 0.34); body.castShadow = true; ng.add(body) // 虫かごの胴
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 6, 0, 6.2832, 0, 1.2), kagoDk); lid.position.set(0.42, 0.26, 0.34); ng.add(lid) // 丸い蓋
      const grip = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 12, Math.PI), kagoDk); grip.position.set(0.42, 0.3, 0.34); ng.add(grip) // 提げ手
      town.add(ng)
    }
  }
  // ── 港町の少女（添付の模倣）＝2D立ち絵の主人公キャラ。港・水辺・街角に。──
  for (const sp of [{ x: HARBOR.x - 3, z: HARBOR.z + 4 }, { x: 70, z: -38 }, { x: -43, z: -15 }, { x: 4, z: -27 }, { x: STATION.x + 2, z: STATION.z + STATION.r - 2 }]) placeGirl(sp.x + (R() - 0.5) * 1.4, sp.z + (R() - 0.5) * 1.4, girlCfg())
  // ── 各エリア（時代）の住人を、装い・小道具を時代に合わせて量産（近景=walk/低空で映える） ──
  const pickC = (a) => a[(R() * a.length) | 0]
  const placeEra = (cx, cz, n, factory) => { for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832 + R() * 0.6, rr = 8 + R() * 22; placeResident(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, factory()) } }
  // 江戸: 町人(着物+髷)・侍(甲冑+刀)・笠の行商
  const EDO_KIMONO = [0x3a4a5e, 0x5a4230, 0x55504a, 0x6a3a30, 0x44503a, 0x4a4a52, 0x70604a], EDO_OBI = [0x8a6a3a, 0x7a3a32, 0x55603a, 0x3a4250, 0x9a7a44]
  placeEra(EDO.x, EDO.z, 20, () => { const r = R(), skin = pickC(RES_SKIN), hair = pickC(RES_HAIR), iris = pickC(RES_IRIS)
    if (r < 0.24) return { outfit: 'armor', skin, hair, iris, hairStyle: 'topknot', top: pickC([0x3a3a44, 0x4a4038, 0x33414e]), bottom: pickC([0x55504a, 0x6a5238, 0x4a4a3a]), accent: pickC(EDO_OBI), prop: 'swords' } // 侍
    if (r < 0.46) return { outfit: 'kimono', skin, hair, iris, hairStyle: 'hat', hat: 'kasa', top: pickC(EDO_KIMONO), accent: pickC(EDO_OBI), prop: R() < 0.5 ? 'bundle' : null } // 笠の行商
    return { outfit: 'kimono', skin, hair, iris, hairStyle: r < 0.74 ? 'topknot' : 'short', top: pickC(EDO_KIMONO), accent: pickC(EDO_OBI) } }) // 町人
  // 大正: 書生(袴+学生帽)・モダンガール(洋装+ボブ)・洋装紳士(背広+中折れ帽)
  const TAI_DRESS = [0xb5677e, 0x6a8a9a, 0x9a7aa0, 0xc08a5a, 0x5a7a6a], TAI_SUIT = [0x3a3a42, 0x4a4036, 0x44484a, 0x55504a]
  placeEra(TAISHO.x, TAISHO.z, 18, () => { const r = R(), skin = pickC(RES_SKIN), hair = pickC(RES_HAIR), iris = pickC(RES_IRIS) /* 大正は住人最少(12)で寂しかった→18へ（江戸20/戦国18と揃える・評価アート） */
    if (r < 0.34) return { outfit: 'hakama', skin, hair, iris, hairStyle: 'hat', hat: 'cap', top: pickC([0x3a4250, 0x40443a, 0x4a4038]), bottom: pickC([0x2e3038, 0x35302c]), accent: 0x2a2e30 } // 書生
    if (r < 0.66) return { outfit: 'dress', skin, hair, iris, hairStyle: 'bob', top: pickC(TAI_DRESS), accent: pickC([0xf0e6d2, 0xeae0cc, 0x8a3a44]) } // モダンガール
    return { outfit: 'suit', skin, hair, iris, hairStyle: 'hat', hat: 'fedora', top: pickC(TAI_SUIT), bottom: pickC(TAI_SUIT), accent: pickC([0x7a3a32, 0x3a4a5e]), prop: R() < 0.5 ? 'cane' : null } }) // 紳士
  // 戦国: 農夫(笠+素朴な着物)・足軽(陣笠+甲冑+槍)・武者(甲冑+刀)
  const SEN_DRAB = [0x5a4c3a, 0x4a4a44, 0x44503a, 0x6a5a44, 0x504838]
  placeEra(SENGOKU.x, SENGOKU.z, 18, () => { const r = R(), skin = pickC(RES_SKIN), hair = pickC(RES_HAIR), iris = pickC(RES_IRIS)
    if (r < 0.36) return { outfit: 'armor', skin, hair, iris, hairStyle: 'hat', hat: 'jingasa', top: pickC([0x40382e, 0x3a3a34]), bottom: pickC([0x4a3a30, 0x3a4250, 0x55504a]), accent: 0x6a3a30, prop: 'spear' } // 足軽
    if (r < 0.58) return { outfit: 'armor', skin, hair, iris, hairStyle: 'topknot', top: pickC([0x3a3a40, 0x44382e]), bottom: pickC([0x6a3a30, 0x3a4a5e, 0x55503a]), accent: pickC([0x9a7a44, 0x7a3a32]), prop: 'swords' } // 武者
    return { outfit: 'kimono', skin, hair, iris, hairStyle: 'hat', hat: 'kasa', hatCol: 0xb8a060, top: pickC(SEN_DRAB), accent: pickC([0x5a4c3a, 0x4a4438]) } }) // 農夫
    // 港町の少女を home の要所にも数体（一枚絵の立ち絵＝常にこちらを向くビルボード）。
    for (const sp of [{ x: HARBOR.x - 4, z: HARBOR.z + 5 }, { x: 6, z: -26 }, { x: -42, z: -16 }, { x: HARBOR.x + 9, z: HARBOR.z - 3 }, { x: 30, z: -40 }, { x: -18, z: 24 }]) placeGirl(sp.x + (R() - 0.5) * 3, sp.z + (R() - 0.5) * 3, girlCfg())
  // ── 祭り・雲海の人物を住人と同じ高品質(makeResident)で実体化（評価FB「全エリアの全キャラを添付画像級へ」）。浴衣＝着物の身頃で。makeResident/pickCが在るこのブロック内で folkSpecs を処理する。──
  const FOLK_HAIR_STYLES = ['short', 'topknot', 'bob', 0, 1]
  const buildFolk = (top, scale) => { const r = makeResident({ outfit: 'kimono', skin: pickC(RES_SKIN), hair: pickC(RES_HAIR), iris: pickC(RES_IRIS), top, accent: pickC(FOLK_OBI), hairStyle: pickC(FOLK_HAIR_STYLES), scale }); r.traverse((o) => { if (o.isMesh) o.castShadow = false }); return r } // 祭り/雲海は密集＝影焼きを切り接地影プレーンで足元を締める
  for (const s of folkSpecs) {
    if (s.cloud) { const r = buildFolk(s.top, s.scale); r.position.set(s.x, s.y, s.z); r.rotation.y = s.ry
      r.traverse((o) => { if (o.isMesh) { o.receiveShadow = false; if (s.reveal) { if (Array.isArray(o.material)) o.material = o.material.map((m) => m.clone()); else if (o.material) o.material = o.material.clone() } } }) // 雲海の島はcloudRevealMatsで高度フェード＝共有材を汚さぬよう複製
      s.parent.add(r) }
    else { const r = buildFolk(s.top, 0.84); s.d.add(r); festDancers.push({ d: s.d, arms: r.userData.arms, ph: s.ph, y0: s.y0, cx: s.cx, cz: s.cz, rad: s.rad, ang: s.ang, amp: s.amp }) } // 祭り＝frameでfestDancersを動かす
  }
  // ── 地被（草株＋小石）を開けた地面に広く散らして「むき出しの土」を埋める＝滞在したくなる豊かさ（実機FB: 空き地が殺風景）。
    // 頂点色で1メッシュへ統合＝描画コール+1。R()依存の街生成の後に置くのでRNGずれ無し。建物/道/水際/木は避ける。LOWで半減。
    if (!SNOW) {
      const tuftGeos = []
      const coverMat = toon(0xffffff); coverMat.vertexColors = true // bakeColGeo/clutterMatはこの位置ではスコープ外＝ローカルで自己完結（什器パスの教訓）
      const bakeT = (arr, geo, hex, lx, ly, lz) => { geo.translate(lx, ly, lz); const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); arr.push(geo) }
      const gC = season === 'spring' ? [0x6f9a44, 0x82ad4e, 0x5e8a38, 0x90b25a]
        : season === 'autumn' ? [0x8c7c3e, 0x9c8a44, 0x7a6e36, 0xa8924a]
        : [0x5c7a3a, 0x6e8c46, 0x7a9850, 0x547030] // 夏（くすんだ緑の幅）
      const onRoad = (x, z) => Math.abs(x) < 4.8 && z < 26 && z > -100 // 中央通りの上は空ける
      const wet = (x, z) => (x > SEA.coast - 2 && heightAt(x, z) < SEA.level + 0.9) || Math.abs(x - RIVER.x) < RIVER.halfW + 1 // 海際・川は避ける
      const occ = (x, z) => { for (const s of spawnAvoid) if (Math.hypot(x - s.x, z - s.z) < s.r + 0.4) return true; return false }
      const oneTuft = (x, z) => {
        const y = heightAt(x, z); if (y < SEA.level + 0.55) return
        const col = gC[(R() * gC.length) | 0], nb = 3 + ((R() * 3) | 0)
        for (let k = 0; k < nb; k++) { const a = R() * 6.283, h = 0.14 + R() * 0.2, lean = 0.12 + R() * 0.22, ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05
          const bl = new THREE.CylinderGeometry(0.004, 0.02, h, 3).toNonIndexed()
          bl.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.cos(a) * lean)); bl.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.sin(a) * lean))
          bakeT(tuftGeos, bl, col, x + ox, y + 0.02 + h / 2, z + oz) } // 葉を外へ倒した草株
        if (R() < 0.14) { const s = 0.05 + R() * 0.1, st = new THREE.IcosahedronGeometry(s, 0).toNonIndexed(); st.scale(1.3, 0.6, 1.1); bakeT(tuftGeos, st, 0x8c877b, x + (R() - 0.5) * 0.4, y + s * 0.3, z + (R() - 0.5) * 0.4) } // たまに小石
      }
      const bC = season === 'spring' ? [0x5e8a3e, 0x6f9a48, 0x7aa850] : season === 'autumn' ? [0x7a7a3a, 0x8a6e38, 0x6e7a3e] : [0x4e7038, 0x5a7e40, 0x46682f] // 低木の葉
      const oneBush = (x, z) => { // 低い茂み＝丸い葉の塊を2〜3重ねた株（むき出しを視覚的に埋める。木より低くまばらに）
        const y = heightAt(x, z); if (y < SEA.level + 0.6) return
        const col = bC[(R() * bC.length) | 0], colD = new THREE.Color(col).multiplyScalar(0.78).getHex(), r0 = 0.34 + R() * 0.34, lobes = 2 + ((R() * 2) | 0)
        for (let k = 0; k < lobes; k++) { const ox = (R() - 0.5) * r0 * 1.3, oz = (R() - 0.5) * r0 * 1.3, rr = r0 * (0.7 + R() * 0.5)
          const lf = new THREE.IcosahedronGeometry(rr, 0).toNonIndexed(); lf.scale(1, 0.82, 1)
          bakeT(tuftGeos, lf, k === 0 ? colD : col, x + ox, y + rr * 0.72, z + oz) } // 下の塊は少し暗め/上は明るめ
        for (let k = 0; k < 4; k++) { const a = R() * 6.283, h = 0.12 + R() * 0.16, bx = Math.cos(a) * r0 * 0.9, bz = Math.sin(a) * r0 * 0.9; const bl = new THREE.CylinderGeometry(0.004, 0.018, h, 3).toNonIndexed(); bakeT(tuftGeos, bl, gC[(R() * gC.length) | 0], x + bx, y + 0.02 + h / 2, z + bz) } // 株元の草
      }
      // 草株: 密なクランプで「草地のパッチ」を作る（疎な単発でなく群れて生える）
      const NT = LIGHT ? 150 : 300
      for (let i = 0; i < NT; i++) {
        const cx = -125 + R() * 210, cz = -100 + R() * 135
        if (onRoad(cx, cz) || wet(cx, cz) || occ(cx, cz) || blockedAt(cx, cz)) continue
        const clump = 3 + ((R() * 4) | 0) // 1スポットに3〜6株＝草むらのまとまり
        for (let j = 0; j < clump; j++) { const ox = (R() - 0.5) * 2.0, oz = (R() - 0.5) * 2.0; if (!onRoad(cx + ox, cz + oz) && !wet(cx + ox, cz + oz) && !blockedAt(cx + ox, cz + oz)) oneTuft(cx + ox, cz + oz) }
      }
      // 低木: 開けた所にまばらに置いて空間を埋める（木立より低く・点在）
      const NB = LIGHT ? 50 : 110
      for (let i = 0; i < NB; i++) {
        const bx = -122 + R() * 204, bz = -98 + R() * 130
        if (onRoad(bx, bz) || wet(bx, bz) || occ(bx, bz) || blockedAt(bx, bz)) continue
        oneBush(bx, bz)
        spawnAvoid.push({ x: bx, z: bz, r: 1.2 }) // 後続の地被/着地が茂みに重ならないよう
      }
      // 木立(thicket): 斜面・周縁のスカスカを埋める背景の緑＝小ぶりの木の塊。統合メッシュなので描画コール増やさずに緑量を稼ぐ（実機FB: 斜面/背景が殺風景）。
      const tkCol = season === 'spring' ? [0x5e8a40, 0x6e9a4a] : season === 'autumn' ? [0x9a7a38, 0x8a6e34, 0x6e7438] : [0x47682f, 0x53743a, 0x3e5e2c]
      const oneThicket = (x, z) => {
        const y = heightAt(x, z); if (y < SEA.level + 0.7) return
        const tH = 0.7 + R() * 0.7, col = tkCol[(R() * tkCol.length) | 0], colD = new THREE.Color(col).multiplyScalar(0.76).getHex()
        const tr = new THREE.CylinderGeometry(0.06, 0.1, tH, 4).toNonIndexed(); bakeT(tuftGeos, tr, 0x5a4632, x, y + tH / 2, z) // 短い幹
        const cl = 3 + ((R() * 2) | 0)
        for (let k = 0; k < cl; k++) { const rr = 0.5 + R() * 0.4, ox = (R() - 0.5) * 0.7, oz = (R() - 0.5) * 0.7, oy = tH + rr * 0.4 + k * 0.18
          const lf = new THREE.IcosahedronGeometry(rr, 0).toNonIndexed(); lf.scale(1.05, 0.9, 1.05); bakeT(tuftGeos, lf, k === 0 ? colD : col, x + ox, y + oy, z + oz) }
      }
      const NK = LIGHT ? 26 : 56
      for (let i = 0; i < NK; i++) {
        const kx = -150 + R() * 250, kz = -130 + R() * 165 // 周縁の斜面まで広く
        if (onRoad(kx, kz) || wet(kx, kz) || occ(kx, kz) || blockedAt(kx, kz)) continue
        if (Math.hypot(kx - DOWNTOWN.x, kz - DOWNTOWN.z) < DOWNTOWN.r || Math.hypot(kx - STADIUM.x, kz - STADIUM.z) < STADIUM.r) continue // 副都心/競技場は避ける
        oneThicket(kx, kz)
        if (R() < 0.5) oneThicket(kx + (R() - 0.5) * 3, kz + (R() - 0.5) * 3) // たまに2株で茂みの塊に
        spawnAvoid.push({ x: kx, z: kz, r: 1.6 })
      }
      if (tuftGeos.length && BufferGeometryUtils.mergeGeometries) { const tm = BufferGeometryUtils.mergeGeometries(tuftGeos, false); if (tm) town.add(new THREE.Mesh(tm, coverMat)); tuftGeos.forEach((x) => x.dispose()) }
    }
    // ── 背後の丘の樹林（散在の個別木は1本=1ドローコールで疎にしか置けず丘が裸＝飛行で空虚。mergedで密な森を2メッシュに統合し丘を緑で埋める）。局所RNGで街の生成シーケンスをずらさない。──
    if (!SNOW) {
      let fseed = 0x9e3779b1 >>> 0; const fr = () => { fseed = (Math.imul(fseed, 1664525) + 1013904223) >>> 0; return fseed / 4294967296 }
      const fLeaf = [], fTrunk = [], fM = new THREE.Matrix4()
      const lc = season === 'spring' ? [0x6f9a4e, 0x82ad58, 0x5e8a44, 0xeeb6cc] : season === 'autumn' ? [0xb0843c, 0x9c6e34, 0xc89a4a, 0xcf7034] : [0x4e7038, 0x5e8244, 0x436830, 0x6a8a48]
      const bakeF = (arr, geo, hex) => { const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); arr.push(geo) }
      for (let i = 0; i < (LIGHT ? 220 : 460); i++) {
        const x = -198 + fr() * 336, z = -190 + fr() * 158, y = heightAt(x, z)
        if (y < SEA.level + 2 || (Math.abs(x) < 56 && z > -36) || blockedAt(x, z)) continue // 中央の街並みだけ避け、それを取り囲む背後・側方の丘を密な森で広く埋める（水・建物も避ける）
        const s = 1.0 + fr() * 1.1, ci = (fr() * lc.length) | 0
        const tr = new THREE.CylinderGeometry(0.09 * s, 0.16 * s, 1.6 * s, 4); fM.makeTranslation(x, y + 0.8 * s, z); tr.applyMatrix4(fM); bakeF(fTrunk, tr, season === 'winter' ? 0x6a6258 : 0x5a4632)
        const lg = new THREE.IcosahedronGeometry((1.6 + fr() * 0.7) * s, 1); lg.scale(1, 0.94, 1); fM.makeTranslation(x, y + 2.5 * s, z); lg.applyMatrix4(fM); bakeF(fLeaf, lg, season === 'winter' ? 0xdfe4e2 : lc[ci])
      }
      if (BufferGeometryUtils.mergeGeometries) {
        const tm = fTrunk.length && BufferGeometryUtils.mergeGeometries(fTrunk, false); if (tm) { const m = toon(0xffffff); m.vertexColors = true; const me = new THREE.Mesh(tm, m); me.castShadow = true; me.receiveShadow = true; town.add(me) } fTrunk.forEach((g) => g.dispose())
        const lm = fLeaf.length && BufferGeometryUtils.mergeGeometries(fLeaf, false); if (lm) { const m = toon(0xffffff); m.vertexColors = true; const me = new THREE.Mesh(lm, m); me.castShadow = true; me.receiveShadow = true; town.add(me) } fLeaf.forEach((g) => g.dispose())
      }
    }
    // ── 時代エリア(江戸/大正/戦国)の開けた地面にも草株を散らす＝homeと同じ豊かさ。距離カリングに乗せるためメッシュをエリア中心に置きジオメトリはローカルで焼く（mesh.position≒エリア中心→eraCullが拾う）。──
    if (!SNOW) {
      const eraCover = (cx, cz, rOut, n, gCols, wetFn) => {
        const geos = [], cm = toon(0xffffff); cm.vertexColors = true
        const bakeL = (geo, hex, lx, ly, lz) => { geo.translate(lx, ly, lz); const c = new THREE.Color(hex), a = new Float32Array(geo.attributes.position.count * 3); for (let q = 0; q < a.length; q += 3) { a[q] = c.r; a[q + 1] = c.g; a[q + 2] = c.b } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geos.push(geo) }
        const oneTuft = (wx, wz) => { const y = heightAt(wx, wz); if (y < SEA.level + 1) return; const col = gCols[(R() * gCols.length) | 0], colD = new THREE.Color(col).multiplyScalar(0.78).getHex(), nb = 3 + ((R() * 4) | 0)
          const mr = 0.16 + R() * 0.16; const mound = new THREE.IcosahedronGeometry(mr, 0).toNonIndexed(); mound.scale(1.4, 0.5, 1.4); bakeL(mound, colD, (wx - cx), y + mr * 0.24, (wz - cz)) // 葉の塊＝草むらの緑の量感（細い草だけだと眼の高さで見えない）
          for (let k = 0; k < nb; k++) { const a = R() * 6.283, h = 0.18 + R() * 0.24, lean = 0.12 + R() * 0.22; const bl = new THREE.CylinderGeometry(0.004, 0.022, h, 3).toNonIndexed(); bl.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.cos(a) * lean)); bakeL(bl, col, (wx - cx) + Math.cos(a) * 0.06, y + 0.02 + h / 2, (wz - cz) + Math.sin(a) * 0.06) } }
        const oneBush = (wx, wz) => { const y = heightAt(wx, wz); if (y < SEA.level + 1) return; const col = gCols[(R() * gCols.length) | 0], colD = new THREE.Color(col).multiplyScalar(0.72).getHex(), nlobe = 2 + ((R() * 3) | 0)
          for (let k = 0; k < nlobe; k++) { const rr = 0.4 + R() * 0.42, ox = (R() - 0.5) * 0.7, oz = (R() - 0.5) * 0.7; const lf = new THREE.IcosahedronGeometry(rr, 0).toNonIndexed(); lf.scale(1.1, 0.82, 1.1); bakeL(lf, k === 0 ? colD : col, (wx - cx) + ox, y + rr * 0.68, (wz - cz) + oz) } } // 低木の茂み＝眼の高さで見える緑の量感
        const flowerCols = [0xeef0ee, 0xf0d850, 0xe89ec0, 0xe8a048] // 白/黄/桃/橙の野花＝眼の高さの彩り
        const oneFlower = (wx, wz) => { const y = heightAt(wx, wz); if (y < SEA.level + 1) return; const fc = flowerCols[(R() * flowerCols.length) | 0], nf = 3 + ((R() * 4) | 0)
          for (let k = 0; k < nf; k++) { const ox = (R() - 0.5) * 0.7, oz = (R() - 0.5) * 0.7, h = 0.18 + R() * 0.14; const stem = new THREE.CylinderGeometry(0.006, 0.006, h, 3).toNonIndexed(); bakeL(stem, 0x4e6e3a, (wx - cx) + ox, y + h / 2, (wz - cz) + oz); const fl = new THREE.IcosahedronGeometry(0.045 + R() * 0.03, 0).toNonIndexed(); bakeL(fl, fc, (wx - cx) + ox, y + h + 0.02, (wz - cz) + oz) } } // 野花（小さな彩りの点）
        const treeLC = season === 'autumn' ? [0xb0843c, 0x9c6e34, 0xc89a4a] : season === 'winter' ? [0xdfe4e2, 0xd2dad6, 0xcfd6d2] : [0x4e7038, 0x5e8244, 0x436830, 0x6a8a48]
        const oneTree = (wx, wz) => { const y = heightAt(wx, wz); if (y < SEA.level + 2) return; const s = 0.95 + R() * 1.0
          const tr = new THREE.CylinderGeometry(0.09 * s, 0.15 * s, 1.5 * s, 4).toNonIndexed(); bakeL(tr, season === 'winter' ? 0x6a6258 : 0x5a4632, (wx - cx), y + 0.75 * s, (wz - cz))
          const cv = new THREE.IcosahedronGeometry((1.45 + R() * 0.6) * s, 1).toNonIndexed(); cv.scale(1, 0.92, 1); bakeL(cv, treeLC[(R() * treeLC.length) | 0], (wx - cx), y + 2.3 * s, (wz - cz)) } // 丘の木（時代エリアの背後の丘を森に）
        for (let i = 0; i < n; i++) { const a = R() * 6.28, rr = 6 + R() * (rOut - 6), wx = cx + Math.cos(a) * rr, wz = cz + Math.sin(a) * rr
          if (blockedAt(wx, wz) || (wetFn && wetFn(wx, wz)) || heightAt(wx, wz) < SEA.level + 1) continue
          const clump = 2 + ((R() * 4) | 0); for (let j = 0; j < clump; j++) { const ox = (R() - 0.5) * 2, oz = (R() - 0.5) * 2; if (!blockedAt(wx + ox, wz + oz) && !(wetFn && wetFn(wx + ox, wz + oz))) oneTuft(wx + ox, wz + oz) }
          if (R() < 0.55 && !blockedAt(wx, wz)) { oneBush(wx, wz); if (R() < 0.4) oneBush(wx + (R() - 0.5) * 3, wz + (R() - 0.5) * 3) } // 低木の茂みを群れて（緑の量感）
          if (R() < 0.3 && !blockedAt(wx, wz)) oneFlower(wx + (R() - 0.5) * 2, wz + (R() - 0.5) * 2) // 野花の彩り
          if (heightAt(wx, wz) > 9 && !blockedAt(wx, wz) && R() < 0.62) oneTree(wx, wz) } // 丘（高所）には木＝背後の丘を森に
        if (geos.length && BufferGeometryUtils.mergeGeometries) { const m = BufferGeometryUtils.mergeGeometries(geos, false); if (m) { const me = new THREE.Mesh(m, cm); me.position.set(cx, 0, cz); town.add(me) } geos.forEach((g) => g.dispose()) }
      }
      const NE = LIGHT ? 200 : 420
      eraCover(EDO.x, EDO.z, 140, LIGHT ? 250 : 520, [0x6e7a40, 0x7e8a48, 0x5e6e34, 0x8a8a50], (x, z) => edoStream(x, z) < 6) // 江戸=乾いた草（拡大した島の半島まで地被を行き渡らせる）
      eraCover(TAISHO.x, TAISHO.z, TAISHO.r, NE, [0x6e8244, 0x7a8a4c, 0x86905a], (x, z) => taishoCanal(x, z) < 3.9) // 大正=苔草（護岸±3.6の外側まで地被を寄せ運河沿いの裸帯を埋める）
      eraCover(SENGOKU.x, SENGOKU.z, SENGOKU.r, NE, [0x5c7a3a, 0x6e8c46, 0x52702f]) // 戦国=谷の緑（谷底の川は低くheightAtで除外）
    }
    // 検証用: 住人を1体、任意の向きで清潔な背景に正射影レンダして等倍PNGで返す（造形の作り込み確認に最適）。
    if (/[?&]dev=1/.test(location.search)) window.__town3dFigShot = (yaw, cfgJson, faceZoom) => {
      const cfg = cfgJson ? JSON.parse(cfgJson) : { skin: 0xf7d8bc, hair: 0x241c18, iris: 0x4a3a2c, outfit: 'blouse', top: 0xf0ece2, bottom: 0x2e3a42, hairStyle: 'bob', prop: 'bag', bagCol: 0x8a7256 }
      const fig = makeResident(cfg); fig.rotation.y = yaw || 0
      const sc = new THREE.Scene(); sc.add(new THREE.AmbientLight(0xfff6ec, 0.9))
      const dl = new THREE.DirectionalLight(0xffffff, 0.85); dl.position.set(0.3, 1, 1.3); sc.add(dl)
      const dl2 = new THREE.DirectionalLight(0xeaf0ff, 0.25); dl2.position.set(-0.7, 0.4, 0.6); sc.add(dl2); sc.add(fig)
      const W = faceZoom ? 440 : 360, H = faceZoom ? 440 : 560
      const cam = faceZoom ? new THREE.OrthographicCamera(-0.29, 0.29, 0.29, -0.29, 0.1, 12) : new THREE.OrthographicCamera(-0.62, 0.62, 0.95, -0.95, 0.1, 12)
      if (faceZoom) { cam.position.set(0, 1.13, 5); cam.lookAt(0, 1.13, 0) } else { cam.position.set(0, 0.9, 5); cam.lookAt(0, 0.9, 0) }
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: LIGHT ? 0 : 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace
      const pRT = renderer.getRenderTarget(), pA = renderer.getClearAlpha(), pC = new THREE.Color(); renderer.getClearColor(pC)
      renderer.setClearColor(0xc2ccce, 1); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam)
      const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf)
      renderer.setRenderTarget(pRT); renderer.setClearColor(pC, pA)
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d')
      const img = cx.createImageData(W, H); for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); cx.putImageData(img, 0, 0)
      sc.remove(fig); fig.traverse((o) => { if (o.geometry && o.geometry !== resShadowGeo) o.geometry.dispose(); if (o.material && o.material !== RES_OUTLINE && o.material !== resShadowMat) o.material.dispose() }); rt.dispose()
      return cv.toDataURL()
    }
  } // ← 車・住民（街のみ）ここまで

  // ── 降るもの（雪／桜の花びら）。季節・天気で空に舞う粒子。 ──
  let weatherPts = null
  if (weather === 'snow' || weather === 'petals' || weather === 'leaves') {
    const N = (weather === 'snow' ? 700 : weather === 'petals' ? 420 : 360) * (LIGHT ? 0.5 : 1) | 0 // light端末は降る粒子を半減
    const baseSpd = weather === 'snow' ? 4 : weather === 'petals' ? 2.4 : 2.0
    const pos = new Float32Array(N * 3)
    const spd = new Float32Array(N) // 個別の落下速度
    const phs = new Float32Array(N) // 横揺れ位相
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (R() - 0.5) * 200
      pos[i * 3 + 1] = R() * 80
      pos[i * 3 + 2] = -120 + R() * 170
      spd[i] = baseSpd * (0.6 + R() * 0.8)
      phs[i] = R() * 6.28
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({
      color: weather === 'snow' ? 0xfdfdff : weather === 'petals' ? 0xf2bcd0 : 0xcf7e38, // 落ち葉=暖色の橙
      size: weather === 'snow' ? 0.5 : weather === 'petals' ? 0.85 : 0.95,
      transparent: true, opacity: weather === 'snow' ? 0.92 : 0.85,
      sizeAttenuation: true, fog: true, depthWrite: false,
    })
    const pts = new THREE.Points(geo, mat)
    pts.frustumCulled = false
    scene.add(pts)
    // 落ち葉・花びらは大きく舞う（横揺れを強く）。雪はまっすぐ静かに落ちる。
    weatherPts = { pts, pos, spd, phs, N, swirl: weather === 'snow' ? 0.9 : weather === 'petals' ? 2.6 : 3.0 }
  }

  // ── 季節の降りもの（春=桜の花びら／秋=落ち葉が公園のあたりに舞う）。街のみ・天気が降りものでない時。──
  if (kind !== 'yato' && (season === 'spring' || season === 'autumn') && weather !== 'petals' && weather !== 'leaves') {
    const N = LIGHT ? 70 : 130
    const bx = PARK.x, bz = PARK.z, R0 = 18, floor = heightAt(PARK.x, PARK.z) - 0.5
    const pos = new Float32Array(N * 3), spd = new Float32Array(N), phs = new Float32Array(N)
    for (let i = 0; i < N; i++) { pos[i * 3] = bx + (R() - 0.5) * R0 * 2; pos[i * 3 + 1] = floor + R() * 20; pos[i * 3 + 2] = bz + (R() - 0.5) * R0 * 2; spd[i] = 0.7 + R() * 0.9; phs[i] = R() * 6.28 }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ color: season === 'spring' ? 0xf2bcd0 : 0xd07e2a, size: season === 'spring' ? 0.8 : 0.92, transparent: true, opacity: 0.92, sizeAttenuation: true, fog: true, depthWrite: false })
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts)
    seasonFall = { pts, pos, spd, phs, N, bx, bz, R0, floor, swirl: season === 'spring' ? 2.2 : 2.8 }
    // 歩く人に追従する近景の層（カメラ周りの箱で循環。降り立つとどこでも花びら/落ち葉が舞う＝散歩の没入）。
    const nN = LIGHT ? 34 : 60, nHX = 13, nHY = 11
    const npos = new Float32Array(nN * 3), nspd = new Float32Array(nN), nphs = new Float32Array(nN)
    for (let i = 0; i < nN; i++) { npos[i * 3] = (R() - 0.5) * nHX * 2; npos[i * 3 + 1] = R() * nHY; npos[i * 3 + 2] = (R() - 0.5) * nHX * 2; nspd[i] = 0.55 + R() * 0.8; nphs[i] = R() * 6.28 }
    const ngeo = new THREE.BufferGeometry(); ngeo.setAttribute('position', new THREE.BufferAttribute(npos, 3))
    const nmat = new THREE.PointsMaterial({ color: season === 'spring' ? 0xf4c2d6 : 0xd8813a, size: season === 'spring' ? 0.5 : 0.58, transparent: true, opacity: 0, sizeAttenuation: true, fog: true, depthWrite: false })
    const npts = new THREE.Points(ngeo, nmat); npts.frustumCulled = false; npts.visible = false; scene.add(npts)
    nearFall = { pts: npts, mat: nmat, pos: npos, spd: nspd, phs: nphs, N: nN, HX: nHX, HY: nHY, swirl: season === 'spring' ? 2.4 : 3.0 }
  }

  // ── 鯉のぼり（春。真鯉・緋鯉・子鯉が風になびく）。街のみ・春のみ。 ──
  if (kind !== 'yato' && season === 'spring') {
    koinobori = []
    const carpCols = [0x2a2a2e, 0xc23a2e, 0x3a6a8a, 0x6a8a5a] // 黒(真鯉)/赤(緋鯉)/青/緑
    for (const sp of [[-44, -22], [-12, -40], [50, -12], [10, -56], [-28, -36]]) {
      const x = sp[0], z = sp[1], gy = heightAt(x, z)
      const g = new THREE.Group(); g.position.set(x, gy, z); g.rotation.y = (R() - 0.5) * 1.2; town.add(g) // 向きを少し振る
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 9, 6), toon(0xb0aaa0)); pole.position.y = 4.5; pole.castShadow = true; g.add(pole)
      const yagu = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 10), toon(0xd9b44a)); yagu.position.y = 9.1; yagu.rotation.x = Math.PI / 2; g.add(yagu) // 矢車
      const fuki = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 1.5, 8, 1, true), toon(0xe0a838)); fuki.rotation.z = Math.PI / 2; fuki.position.set(0.85, 8.6, 0); g.add(fuki) // 吹き流し
      const sizes = [2.5, 1.9, 1.4]; let cy = 8.0
      for (let i = 0; i < 3; i++) {
        const carp = new THREE.Group(); carp.position.set(0, cy, 0); g.add(carp); koinobori.push({ grp: carp, ph: i * 0.6 + R() * 0.4 })
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.07, sizes[i], 9, 1, true), toon(carpCols[i % carpCols.length])); body.rotation.z = Math.PI / 2; body.position.x = sizes[i] / 2; body.castShadow = true; carp.add(body)
        for (const ez of [-0.16, 0.16]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), toon(0xf0ece0)); eye.position.set(0.18, 0.13, ez); carp.add(eye) }
        cy -= 0.85
      }
      colliders.push({ x, z, r: 0.5 })
    }
  }

  // ── 庭・空き地の季節の花（夏=ひまわり／秋=コスモス）。merged で軽く。街のみ。 ──
  if (kind !== 'yato' && (season === 'summer' || season === 'autumn')) {
    const isHimawari = season === 'summer'
    const stemGeos = [], headGeos = [], centerGeos = []
    for (const cl of [[-20, -10], [22, -6], [-7, -52], [42, -34], [-46, -16], [10, -40], [-34, -42], [44, -12]]) {
      const n = 3 + ((R() * 3) | 0)
      for (let i = 0; i < n; i++) {
        const fx = cl[0] + (R() - 0.5) * 4, fz = cl[1] + (R() - 0.5) * 4, fgy = heightAt(fx, fz)
        if (fx > SEA.coast || Math.abs(fx - RIVER.x) < RIVER.halfW + 1) continue // 海・川は避ける
        const h = isHimawari ? 2.0 + R() * 0.7 : 1.2 + R() * 0.5
        const sg = new THREE.CylinderGeometry(0.04, 0.06, h, 5); sg.translate(fx, fgy + h / 2, fz); stemGeos.push(sg)
        const hr = isHimawari ? 0.5 : 0.24
        const hd = new THREE.CylinderGeometry(hr, hr, 0.1, isHimawari ? 14 : 8); hd.rotateX(0.5 + (R() - 0.5) * 0.4); hd.translate(fx, fgy + h, fz); headGeos.push(hd)
        if (isHimawari) { const ct = new THREE.CylinderGeometry(0.26, 0.26, 0.12, 12); ct.rotateX(0.5); ct.translate(fx, fgy + h + 0.02, fz); centerGeos.push(ct) }
      }
    }
    if (BufferGeometryUtils.mergeGeometries) {
      const sm = stemGeos.length && BufferGeometryUtils.mergeGeometries(stemGeos, false); if (sm) town.add(new THREE.Mesh(sm, toon(0x5e8a4a)))
      const hm = headGeos.length && BufferGeometryUtils.mergeGeometries(headGeos, false); if (hm) { const heads = new THREE.Mesh(hm, toon(isHimawari ? 0xe8b830 : 0xe884a4)); heads.castShadow = true; town.add(heads) }
      const cm = centerGeos.length && BufferGeometryUtils.mergeGeometries(centerGeos, false); if (cm) town.add(new THREE.Mesh(cm, toon(0x5a4030)))
      stemGeos.concat(headGeos, centerGeos).forEach((g) => g.dispose())
    }
  }

  // ── 町並みの監査パス: 家に食い込んだ木を取り下げる（全建物コライダー登録後・幹の統合前）。 ──
  // 根元が建物の敷地（矩形コライダー）内にある木は、葉のグループを外し幹ジオメトリも統合から除外＝屋根から木が生える違和感の根絶。
  // ビルド後の後処理でR()を一切消費しない＝他の全配置は不変。treesArrとtrunkGeosは tree() で対で積まれる（添字対応）。
  for (let i = treesArr.length - 1; i >= 0; i--) { const tg2 = treesArr[i]
    if (rectAt(tg2.position.x, tg2.position.z)) {
      tg2.visible = false; if (tg2.parent) tg2.parent.remove(tg2)
      tg2.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose() })
      trunkGeos[i].dispose(); trunkGeos.splice(i, 1); treesArr.splice(i, 1)
      buriedTrees++; if (buriedSamples.length < 8) buriedSamples.push([+tg2.position.x.toFixed(1), +tg2.position.z.toFixed(1)])
    }
  }
  // 全ての木の幹を1メッシュへ統合（静止）＝ドローコールを大きく削る（葉は木ごとに揺れるので別）。
  if (trunkGeos.length && BufferGeometryUtils.mergeGeometries) {
    const tm = BufferGeometryUtils.mergeGeometries(trunkGeos, false)
    if (tm) { const trunks = new THREE.Mesh(tm, trunkMat); trunks.castShadow = true; trunks.receiveShadow = true; town.add(trunks) }
    trunkGeos.forEach((g) => g.dispose())
  }

  // ── カメラ（高台のマンション上階の窓から見下ろす）。谷戸は少し低く寄せて谷を見渡す ──
  const camera = new THREE.PerspectiveCamera(62, W / H, 0.5, 600)
  const eye = kind === 'yato'
    ? new THREE.Vector3(0, 28, 27)  // 谷戸: 少し低く・谷へ寄る（棚田と茅葺屋敷が映える）
    : new THREE.Vector3(0, 31, 30)  // 街: 高台の上階から見下ろす
  // ── FXAA（輪郭のギザギザをなめらかに）。MSAA付きの中間ターゲット→FXAA→OutputPass(色空間を正しく)。失敗時はnullで通常描画へ。──
  try {
    const [{ EffectComposer }, { RenderPass }, { ShaderPass }, { OutputPass }, { FXAAShader }, bloomMod] = await Promise.all([
      import('three/examples/jsm/postprocessing/EffectComposer.js'),
      import('three/examples/jsm/postprocessing/RenderPass.js'),
      import('three/examples/jsm/postprocessing/ShaderPass.js'),
      import('three/examples/jsm/postprocessing/OutputPass.js'),
      import('three/examples/jsm/shaders/FXAAShader.js'),
      LIGHT ? Promise.resolve(null) : import('three/examples/jsm/postprocessing/UnrealBloomPass.js').catch(() => null), // 灯りのブルーム（非力端末は読み込まず＝発熱回避）
    ])
    if (my !== token) return
    const crt = new THREE.WebGLRenderTarget(W, H, { samples: 0 }) // MSAAは切りFXAA一本化＝中間RTの多重サンプルバッファ(帯域/メモリ)を省く。輪郭はFXAAが担い実機で差はごく僅か（2026-07 発熱対策・AB検証済）
    composer = new EffectComposer(renderer, crt)
    composer.addPass(new RenderPass(scene, camera))
    fxaaPass = new ShaderPass(FXAAShader)
    composer.addPass(fxaaPass)
    // 夕夜の灯り（窓/街灯/提灯/自販機）がふわっと滲んで光るブルーム。ハーフ解像度＋高しきい値で「灯りだけ」を控えめに。昼/非力端末はstrength0で無効化＝負荷ゼロ。
    if (bloomMod && bloomMod.UnrealBloomPass) {
      // 夜=強め／はっきりした夕=ほのか／昼=ごく淡く「いちばん明るい所」だけ滲ませる（雲海のきらめき・クジラのリム光・水面・雲頂・窓灯り）。
      // 昼は高しきい値で水彩の中間調を濁さず、雪天の昼は白飛び回避でさらに弱く。
      const bs = isNight ? 0.62 : duskAmt > 0.25 ? 0.09 + duskAmt * 0.16 : (weather === 'snow' ? 0.03 : 0.05) // 昼/夕はごく控えめ（広く明るい雲面が眩しく白飛びするのを防ぐ・実機FB）
      const bThr = isNight ? 0.72 : duskAmt > 0.25 ? 0.84 : 0.90 // 昼はかなり高いしきい値＝太陽のきらめき/灯りだけ滲ませ、白い雲の面は光らせない
      const bRad = isNight ? 0.62 : 0.5
      bloomPass = new bloomMod.UnrealBloomPass(new THREE.Vector2(Math.max(64, W / 2), Math.max(64, H / 2)), bs, bRad, bThr)
      bloomWanted = bs > 0.10 // 昼(bs=0.05)/雪昼(0.03)のほぼ不可視ブルームは焚かない＝毎フレの多段ぼかしを省き発熱を下げる。夕(0.13+)/夜(0.62)の灯りの滲みは完全維持（値は離散なので0.10で綺麗に分離）
      bloomPass.enabled = bloomWanted && curQual !== 'light' // 軽やか品質では後処理ブルームを切る（発熱回避）
      composer.addPass(bloomPass)
    }
    composer.addPass(new OutputPass())
  } catch (e) { composer = null }

  // ── 室内の窓枠（3Dの壁＋窓の開口）。部屋の中から窓越しに外を覗く“本物”の手応え＝近い窓枠と遠い景色が
  //    視差で分離して動き、見回す（＝室内で頭を動かす）と窓が視界を横切り壁の側が覗く。乗り出すと退いて街へ。
  //    世界座標に固定（カメラに親子付けしない）＝カメラの平行移動/回転で枠と景色が正しくずれる。 ──
  const winRoom = new THREE.Group()
  const winRoomMats = []
  let winSashR = null, winSashX0 = 0, winSashX1 = 0 // 引き違いの可動ガラス障子（窓をあけると横へすべる）
  const winCurtains = [] // 窓辺のカーテン（窓をあけると外気でそっとそよぐ）
  let windChime = null // 夏の窓辺の風鈴（窓をあけると外気でちりんと揺れる）
  const teaSteam = [] // 急須から立ちのぼる湯気
  let winPendulum = null // 振り子柱時計（振り子が静かに揺れる）
  let winDust = null // 窓の光に舞うほこり（昼の“居る部屋”の空気感）
  let winCat = null // 窓辺の日だまりで丸くなって眠る猫（呼吸でそっと上下）
  let winRefl = null // 窓ガラスへの室内の映り込み（夕/夜ほど強い・窓をあけると消える）
  let winRainGlass = null // 雨天の窓ガラスに伝う雨粒・流れ（窓辺で“雨が降っている”手応え。下へ流れる）
  {
    // 寸法（局所座標。原点=窓の中心、カメラは局所(0,1.5,3.2)＝立って窓辺に居る）。FY床/CY天井/SX側壁/BZ奥壁/WINCY窓の中心高。
    const dWall = 3.2, owW = 2.4, owH = 1.7, FY = -1.1, CY = 3.7, SX = 4.7, BZ = 7.4, WINCY = 1.0 // 少し広い部屋に
    const RW = 2 * SX + 0.8, RD = BZ + 0.9, WT = CY + 0.3 // 室の幅/奥行/壁の上端（躯体はこれで一括スケール）
    const C = (d, n) => isNight ? n : d
    // 室内全体の時間帯の色味＝昼は素、夕ほど飴色に温まる（“いま何時か”を部屋の中から感じる）。夜は専用色のまま。
    const roomWarm = isNight ? null : new THREE.Color(0xffffff).lerp(new THREE.Color(0xffd6a2), duskAmt * 0.5)
    // 不透明＝室内が深度を書き込み、手前の壁が奥の壁/家具と「窓の外の街」を遮蔽＝隠れた街の塗り(fill)を早期Zで省く＋
    // 半透明ブレンドの全画面オーバードローをゼロに（カクつきの主因を断つ）。乗り出すとカメラが窓の開口を通って前へ
    // 出るので室内は自然に背後へ退く（フェード不要）。
    const mk = (col, map) => { const m = new THREE.MeshBasicMaterial({ color: col, map: map || null, fog: false }); if (roomWarm) m.color.multiply(roomWarm); m.vertexColors = true; winRoomMats.push(m); return m }
    // 角をわずかに面取り（街のトゥーンの丸みに合わせ、硬い箱の安っぽさを和らげる）。細い桟/薄板は面取りすると角が
    // 立ってチカチカするので平らな箱にする（しきい値を上げて家具だけ丸める）。
    const box = (w, h, d, x, y, z, mat) => { const r = Math.min(0.09, Math.min(w, h, d) * 0.3); const g = r > 0.03 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.renderOrder = 2; grad(m); winRoom.add(m); return m } // grad=窓からの採光の陰影（家具にも）。角を少し丸めて柔らかく（街の水彩トゥーンに合わせる）
    const cyl = (rt, rb, h, x, y, z, mat, seg) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat); m.position.set(x, y, z); m.renderOrder = 2; grad(m); winRoom.add(m); return m }
    const maxAniso = renderer.capabilities.getMaxAnisotropy() // 浅い角度の床テクスチャの明滅(モアレ)を抑える
    const cv = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t }
    // テクスチャ: 畳・天井板・カレンダー・障子
    // 畳: 市松に目を互い違い（縦目／横目）＋畳縁で“ちゃんとした畳の間”に。目は低コントラスト・粗めでモアレ(チカチカ)を避ける。
    const tatTex = cv(256, 256, (x) => {
      const base = C('#9a9c5e', '#3a3c2c'), hem = C('#414a2b', '#181a10'), grain = C('rgba(58,64,28,0.06)', 'rgba(8,10,5,0.08)')
      x.fillStyle = base; x.fillRect(0, 0, 256, 256)
      const cell = (cx, cy, vert) => { x.strokeStyle = grain; x.lineWidth = 2
        if (vert) { for (let gx = cx + 12; gx < cx + 122; gx += 13) { x.beginPath(); x.moveTo(gx, cy + 8); x.lineTo(gx, cy + 120); x.stroke() } }
        else { for (let gy = cy + 12; gy < cy + 122; gy += 13) { x.beginPath(); x.moveTo(cx + 8, gy); x.lineTo(cx + 120, gy); x.stroke() } } }
      cell(0, 0, false); cell(128, 0, true); cell(0, 128, true); cell(128, 128, false) // 互い違いの目（市松）
      x.strokeStyle = hem; x.lineWidth = 6
      for (const g of [0, 128, 256]) { x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 256); x.stroke(); x.beginPath(); x.moveTo(0, g); x.lineTo(256, g); x.stroke() } // 畳縁（タイル継ぎ目で連続）
    })
    tatTex.wrapS = tatTex.wrapT = THREE.RepeatWrapping; tatTex.repeat.set(3, 2.4)
    const ceilTex = cv(128, 128, (x) => { x.fillStyle = C('#4a3e2c', '#211c16'); x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(0,0,0,0.34)'; x.lineWidth = 3; for (let i = 0; i <= 128; i += 22) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke() } })
    ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(3, 3)
    const calTex = cv(64, 88, (x) => { x.fillStyle = '#efe9da'; x.fillRect(0, 0, 64, 88); x.fillStyle = '#b83c30'; x.fillRect(0, 0, 64, 20); x.fillStyle = 'rgba(70,58,46,0.55)'; for (let r = 0; r < 5; r++) for (let cc2 = 0; cc2 < 7; cc2++) x.fillRect(5 + cc2 * 8, 26 + r * 11, 5, 7) })
    // 砂壁の粒（白基調に細かな明暗の砂目＝乗算でうっすら凹凸感。のっぺりを脱す）
    const sandTex = cv(128, 128, (x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 2400; i++) { const a = 0.04 + R() * 0.07, s = 1 + R() * 1.6; x.fillStyle = R() < 0.5 ? `rgba(54,44,32,${a})` : `rgba(255,250,238,${a})`; x.fillRect(R() * 128, R() * 128, s, s) } })
    sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(2.6, 2.6)
    // 腰壁の板目（横の継ぎ目＋うっすら縦の木目）
    const plankTex = cv(64, 64, (x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64); x.strokeStyle = 'rgba(18,12,7,0.5)'; x.lineWidth = 2; for (let gy = 0; gy <= 64; gy += 16) { x.beginPath(); x.moveTo(0, gy); x.lineTo(64, gy); x.stroke() } x.strokeStyle = 'rgba(40,28,16,0.1)'; x.lineWidth = 1; for (let i = 0; i < 44; i++) { const gx = R() * 64; x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx + (R() - 0.5) * 6, 64); x.stroke() } })
    plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping; plankTex.repeat.set(9, 1.3)
    // 材（昭和の茶の間。暖色・飴色の木・砂壁・畳。夜は沈める）
    const wallMat = mk(C(0x8c7c5c, 0x2a2430), sandTex), wainsMat = mk(C(0x6a4e34, 0x221b22), plankTex) // 砂壁(粒)・腰壁(板目)
    const tatMat = mk(0xffffff, tatTex), cmat = mk(0xffffff, ceilTex)
    // 木目（横に流れるやわらかな濃淡の筋＝飴色の木の手触り。家具全般に効く）
    const woodTex = cv(64, 64, (x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 22; i++) { const y = R() * 64, a = 0.05 + R() * 0.08; x.strokeStyle = `rgba(58,38,22,${a})`; x.lineWidth = 0.6 + R() * 1.4; x.beginPath(); x.moveTo(0, y); for (let xx = 0; xx <= 64; xx += 8) x.lineTo(xx, y + Math.sin(xx * 0.2 + i) * 1.2); x.stroke() } })
    woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.repeat.set(2, 2)
    const woodMat = mk(C(0x7a5630, 0x2c241d), woodTex), woodDk = mk(C(0x4a3320, 0x1d1611))
    // 布の織り目（細かな格子＋微細なムラ＝座布団が布に見える）
    const clothTex = cv(48, 48, (x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 48, 48); x.strokeStyle = 'rgba(0,0,0,0.07)'; x.lineWidth = 1; for (let i = 0; i < 48; i += 3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 48); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(48, i); x.stroke() } for (let i = 0; i < 380; i++) { x.fillStyle = `rgba(${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},0.03)`; x.fillRect(R() * 48, R() * 48, 1.5, 1.5) } })
    clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping; clothTex.repeat.set(3, 3)
    const fabMat = mk(C(0xa8564a, 0x3a2630), clothTex), fab2 = mk(C(0x4e6a52, 0x26302a), clothTex)
    const lampMat = mk(C(0xfff0c8, 0xffdf9a)), scrollMat = mk(C(0xe8e0cc, 0x726a5c))
    const ceramMat = mk(C(0xb6c2cc, 0x3a4048)), blackMat = mk(C(0x262420, 0x14120d)), greenMat = mk(C(0x4e7446, 0x26361f))
    const tvMat = mk(C(0x7c6e5c, 0x2a2620)), screenMat = mk(C(0x1c2026, 0x0f1115)), mikanMat = mk(C(0xe8902e, 0x6a4520)), creamMat = mk(C(0xe6ddc6, 0x5c564c)), redMat = mk(C(0xc24a38, 0x52261e))
    // 室内面に頂点色の陰影（窓・灯りに近いほど明るく、奥/床際ほど暗い＝平らな箱でなく光のある3D室内）
    for (const m of [wallMat, tatMat, cmat]) m.vertexColors = true
    const grad = (m) => {
      const p = m.geometry.attributes.position, c = new Float32Array(p.count * 3)
      for (let i = 0; i < p.count; i++) {
        const lz = m.position.z + p.getZ(i), ly = m.position.y + p.getY(i)
        const near = Math.max(0, 1 - lz / (BZ + 0.4))       // 窓に近い=1／奥=0（窓からの採光）
        const lo = Math.min(1, Math.max(0, (ly - FY) / (CY - FY + 0.6))) // 床=0／天井=1
        const b = Math.max(0.4, Math.min(1.36, (0.6 + near * 0.74) * (0.86 + lo * 0.2))) // 窓際ほど明るい
        const warm = near * (isNight ? 0.25 : (0.34 + duskAmt * 0.36)) // 窓際は暖色（昼の外光・夕ほど濃い）／奥は素
        c[i * 3] = Math.min(1.5, b * (1 + warm * 0.14)); c[i * 3 + 1] = b; c[i * 3 + 2] = b * (1 - warm * 0.16)
      }
      m.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3)); return m
    }
    // ── 家具の接地影（畳に柔らかい影を敷いて“浮き”を消す＝見下ろしで効く作り込み）──
    const shadowTex = cv(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.6, 'rgba(0,0,0,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64) })
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: isNight ? 0.34 : 0.42, depthWrite: false, fog: false }); winRoomMats.push(shadowMat)
    const floorShadow = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shadowMat); m.rotation.x = -Math.PI / 2; m.position.set(x, FY + 0.016, z); m.renderOrder = 3; winRoom.add(m); return m } // 不透明な畳(renderOrder2)より後に重ねて畳を暗くする（先に描くと畳に上書きされ消える）
    // ── 躯体（床=畳／天井=竿縁／奥・両側=砂壁）。RW/RD/WTで一括スケール。 ──
    const WH = WT - FY + 0.6 // 壁の高さ
    grad(box(RW, 0.3, RD, 0, FY - 0.15, BZ / 2, tatMat))        // 床（畳）
    grad(box(RW, 0.3, RD, 0, CY, BZ / 2, cmat))                // 天井（板目）
    grad(box(RW, WH, 0.3, 0, (WT + FY) / 2, BZ, wallMat))       // 奥壁
    // 左壁。角部屋(kind:'corner')は二面採光＝左壁(開けた街側)に二つ目の窓の開口を残してパネルで囲む。枠/硝子は前窓の材ができた後で足す。
    let cornerWin = null
    if (kind === 'corner') {
      const lwz = 1.2, ow2 = 2.2, o2T = WINCY + owH / 2, o2B = WINCY - owH / 2 // 左窓: 中心z・幅(z方向)・開口の上下端（前の角寄りへ＝整理ダンスを避け、前窓と角で出会う二面採光に）
      const lz0 = BZ / 2 - RD / 2, lz1 = BZ / 2 + RD / 2, wz0 = lwz - ow2 / 2, wz1 = lwz + ow2 / 2
      grad(box(0.3, WH, wz0 - lz0, -SX, (WT + FY) / 2, (lz0 + wz0) / 2, wallMat))     // 窓の手前(z小)の壁
      grad(box(0.3, WH, lz1 - wz1, -SX, (WT + FY) / 2, (wz1 + lz1) / 2, wallMat))     // 窓の奥(z大)の壁
      grad(box(0.3, WT - o2T, ow2, -SX, (o2T + WT) / 2, lwz, wallMat))               // 窓の上の壁
      box(0.3, o2B - (FY - 0.4), ow2, -SX, (o2B + FY - 0.4) / 2, lwz, wainsMat)       // 腰壁（窓の下）
      cornerWin = { lwz, ow2, o2T, o2B }
    } else {
      grad(box(0.3, WH, RD, -SX, (WT + FY) / 2, BZ / 2, wallMat)) // 左壁（通常）
    }
    grad(box(0.3, WH, RD, SX, (WT + FY) / 2, BZ / 2, wallMat))  // 右壁
    // ── 前壁（窓のある壁）。腰壁＋上壁＋左右壁で“ちょうど開ける高さの窓”に。 ──
    const oT = WINCY + owH / 2, oB = WINCY - owH / 2 // 開口の上端/下端
    grad(box(RW, WT - oT, 0.3, 0, (oT + WT) / 2, 0, wallMat))     // 窓の上の壁
    box(RW, oB - (FY - 0.4), 0.3, 0, (oB + FY - 0.4) / 2, 0, wainsMat) // 腰壁（窓の下＝羽目板）
    grad(box((RW - owW) / 2, owH, 0.3, -(owW / 2 + (RW - owW) / 4), WINCY, 0, wallMat)) // 窓の左の壁
    grad(box((RW - owW) / 2, owH, 0.3, owW / 2 + (RW - owW) / 4, WINCY, 0, wallMat))    // 窓の右の壁
    box(owW + 0.6, 0.1, 0.22, 0, oB - 0.06, 0.28, woodMat) // 窓台（腰壁の上の見切り。室内側へ出し、下桟とは高さをずらして重ねない）
    // アルミサッシの窓枠＋引き違いの召し合わせ（団地/マンションの掃き出し窓）＋窓台
    const alMat = mk(C(0x9ea29e, 0x44484c)) // アルミサッシ（明るすぎる細桟はチカチカするので鈍い銀灰に）
    // チカチカの真因＝桟が壁の厚み(z=-0.15..0.15)に埋もれて壁面/窓台とZファイティング。
    // → 全ての桟を壁の室内面(z=0.15)より十分手前へ出す。横桟<縦桟<召し合わせ の順で前後を段付け＝角は手前の桟が確実に覆う。
    box(owW + 0.2, 0.1, 0.1, 0, oT, 0.25, alMat); box(owW + 0.2, 0.1, 0.1, 0, oB + 0.06, 0.25, alMat)             // 上下の横桟（壁より手前・窓台の上）
    box(0.1, owH + 0.2, 0.1, -owW / 2 - 0.05, WINCY, 0.29, alMat); box(0.1, owH + 0.2, 0.1, owW / 2 + 0.05, WINCY, 0.29, alMat) // 左右の縦桟（さらに手前）
    box(0.06, owH, 0.06, 0, WINCY, 0.32, alMat) // 中央の召し合わせ（最前）
    box(0.14, 0.06, 0.08, 0.1, WINCY - 0.06, 0.31, alMat) // クレセント錠
    // 引き違いのガラス障子（2枚）。閉=開口を覆う／窓をあけると右の障子が左へすべって右半分が開く（実際の窓の開閉）。
    // ガラスは“ごく淡い映り込み”だけ（景色を曇らせない）。斜めの細い光の筋を1本＋極薄の地色。端はパネルを枠の内側に隠す。
    const glassTex = cv(64, 64, (x) => { x.fillStyle = 'rgba(210,222,234,0.02)'; x.fillRect(0, 0, 64, 64); x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 3.5; x.beginPath(); x.moveTo(12, 64); x.lineTo(46, 0); x.stroke(); x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 2; x.beginPath(); x.moveTo(40, 64); x.lineTo(56, 0); x.stroke() })
    const glassMat = new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, opacity: 1, depthWrite: false, fog: false }); winRoomMats.push(glassMat)
    const lpane = new THREE.Mesh(new THREE.PlaneGeometry(owW / 2 - 0.1, owH - 0.12), glassMat); lpane.position.set(-owW / 4, WINCY, 0.18); lpane.renderOrder = 4; winRoom.add(lpane) // 左の障子（固定・壁より手前/桟より奥）
    const rpane = new THREE.Mesh(new THREE.PlaneGeometry(owW / 2 - 0.1, owH - 0.12), glassMat); rpane.position.set(owW / 4, WINCY, 0.20); rpane.renderOrder = 4; winRoom.add(rpane) // 右の障子（あけると左へ）
    winSashR = rpane; winSashX0 = owW / 4; winSashX1 = -owW / 4
    // 窓ガラスへの室内の映り込み（街と一緒に暖かい部屋の気配が硝子に映る。夕/夜ほど強く・昼はほぼ無い・窓をあけると消える）
    { const reflTex = cv(128, 128, (x) => {
        const g = x.createLinearGradient(0, 72, 0, 128); g.addColorStop(0, 'rgba(255,228,182,0)'); g.addColorStop(1, 'rgba(255,222,168,0.42)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128) // 下半分にうっすら室内の暖色
        const rg = x.createRadialGradient(94, 30, 2, 94, 30, 26); rg.addColorStop(0, 'rgba(255,242,208,0.8)'); rg.addColorStop(1, 'rgba(255,242,208,0)'); x.fillStyle = rg; x.fillRect(0, 0, 128, 128) }) // 灯りの映り込み（上右＝街の焦点を避ける）
      const reflBase = isNight ? 0.5 : duskAmt * 0.24
      const reflMat = new THREE.MeshBasicMaterial({ map: reflTex, transparent: true, opacity: reflBase, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }); winRoomMats.push(reflMat)
      const refl = new THREE.Mesh(new THREE.PlaneGeometry(owW - 0.06, owH - 0.12), reflMat); refl.position.set(0, WINCY, 0.215); refl.renderOrder = 5; winRoom.add(refl)
      winRefl = { mat: reflMat, base: reflBase } }
    // ── 雨天の窓ガラス: 伝う雨粒＋下へ流れる滴＝窓辺で「雨が降っている」手応え（仕様の核心。半透明＝街は透ける）。 ──
    if (weather === 'rain') {
      const rgTex = cv(256, 256, (x) => {
        x.fillStyle = 'rgba(204,218,228,0.045)'; x.fillRect(0, 0, 256, 256) // うっすら濡れた曇り
        for (let i = 0; i < 11; i++) { const rx = R() * 256, w = 2 + R() * 4, g = x.createLinearGradient(rx, 0, rx + w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(236,246,250,${(0.09 + R() * 0.12).toFixed(3)})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(rx, R() * 120, w, 256) } // 縦の流れ筋(runnel)
        for (let i = 0; i < 95; i++) { const dx = R() * 256, dy = R() * 256, dr = 1.6 + R() * 3.6 // 雨粒＝小さなレンズ(明るい縁＋淡い中＝屈折の手応え)
          const dg = x.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, 0, dx, dy, dr); dg.addColorStop(0, `rgba(255,255,255,${(0.32 + R() * 0.22).toFixed(3)})`); dg.addColorStop(0.55, 'rgba(184,204,216,0.12)'); dg.addColorStop(1, 'rgba(120,140,155,0)')
          x.fillStyle = dg; x.beginPath(); x.arc(dx, dy, dr, 0, 6.2832); x.fill()
          if (R() < 0.3) { const tg = x.createLinearGradient(dx, dy, dx, dy + dr * 6); tg.addColorStop(0, 'rgba(222,236,242,0.2)'); tg.addColorStop(1, 'rgba(222,236,242,0)'); x.fillStyle = tg; x.fillRect(dx - dr * 0.5, dy, dr, dr * 6) } } // 流れた尾
      })
      rgTex.wrapS = rgTex.wrapT = THREE.RepeatWrapping
      const rgMat = new THREE.MeshBasicMaterial({ map: rgTex, transparent: true, opacity: 0.62, depthWrite: false, fog: false }); winRoomMats.push(rgMat)
      const rg = new THREE.Mesh(new THREE.PlaneGeometry(owW - 0.04, owH - 0.1), rgMat); rg.position.set(0, WINCY, 0.225); rg.renderOrder = 6; winRoom.add(rg) // 障子/映り込みより手前＝ガラス面の雨
      winRainGlass = { mat: rgMat, tex: rgTex }
    }
    box(owW + 0.4, 0.13, 0.4, 0, oB - 0.06, 0.18, woodMat) // 室内側の窓台
    if (cornerWin) { // 角部屋の二つ目の窓（左壁＝開けた街側）＝アルミサッシ枠＋硝子＋窓台。二面採光で「角部屋にいる」手応え。
      const { lwz, ow2, o2T, o2B } = cornerWin, ax2 = -SX + 0.25
      box(0.1, 0.1, ow2 + 0.2, ax2, o2T, lwz, alMat); box(0.1, 0.1, ow2 + 0.2, ax2, o2B + 0.06, lwz, alMat)                                  // 上下の横桟（z方向）
      box(0.1, owH + 0.2, 0.1, ax2 + 0.04, WINCY, lwz - ow2 / 2 - 0.05, alMat); box(0.1, owH + 0.2, 0.1, ax2 + 0.04, WINCY, lwz + ow2 / 2 + 0.05, alMat) // 前後の縦桟
      box(0.06, owH, 0.06, ax2 + 0.07, WINCY, lwz, alMat)                                                                                    // 中央の召し合わせ
      const lglass = new THREE.Mesh(new THREE.PlaneGeometry(ow2 - 0.12, owH - 0.12), glassMat); lglass.rotation.y = Math.PI / 2; lglass.position.set(-SX + 0.2, WINCY, lwz); lglass.renderOrder = 4; winRoom.add(lglass) // 硝子（左壁面に平行）
      box(0.4, 0.13, ow2 + 0.4, -SX + 0.2, o2B - 0.06, lwz, woodMat) // 室内側の窓台
    }
    box(0.16, 0.12, 0.16, owW / 2 - 0.12, oB + 0.12, 0.26, greenMat) // 窓辺の小さな植木
    // ── 窓辺の一輪挿し（季節の花＝移ろう暮らし。春=桜色/夏=朝顔/秋=コスモス橙/冬=椿の紅） ──
    { const vx = 0.18, vy = oB + 0.02, vz = 0.30
      const bloomBright = ({ spring: 0xe6a6c2, summer: 0x7d8fd6, autumn: 0xd9803a, winter: 0xc23a30 })[season] || 0xe6a6c2
      const bloomDim = new THREE.Color(bloomBright).multiplyScalar(0.5).getHex()
      const flMat = mk(C(bloomBright, bloomDim)), stMat = mk(C(0x5a7a48, 0x2c3a26)), vaseMat = mk(C(0xcfd8da, 0x3a4248))
      cyl(0.036, 0.05, 0.15, vx, vy + 0.06, vz, vaseMat, 12) // 花瓶（淡い硝子）
      for (const [dx, dy, dz] of [[0, 0.2, 0], [-0.06, 0.16, 0.03], [0.07, 0.17, -0.03], [0.01, 0.13, 0.05]]) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, dy, 5), stMat); stem.position.set(vx + dx * 0.5, vy + 0.1 + dy / 2, vz + dz * 0.5); stem.rotation.z = -dx * 1.4; stem.renderOrder = 2; winRoom.add(stem)
        const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.032, 0), flMat); fl.position.set(vx + dx, vy + 0.12 + dy, vz + dz); grad(fl); fl.renderOrder = 2; winRoom.add(fl) }
    }
    // ── 窓辺の湯呑み（縁側でお茶＝“いま家でくつろいでいる”気配）。湯気は teaSteam に合流して立ちのぼる。──
    { const cupY = oB + 0.04
      cyl(0.064, 0.052, 0.016, -0.72, cupY - 0.02, 0.31, ceramMat, 14) // 受け皿
      cyl(0.05, 0.043, 0.078, -0.72, cupY + 0.03, 0.31, ceramMat, 14)  // 湯呑み
      cyl(0.064, 0.064, 0.006, -0.72, cupY + 0.07, 0.31, mk(C(0x6a8a52, 0x33422a)), 14) // お茶の面（緑）
      const stTex2 = cv(48, 48, (x) => { const g = x.createRadialGradient(24, 24, 1, 24, 24, 24); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 48, 48) })
      for (let i = 0; i < 2; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: stTex2, transparent: true, opacity: 0, depthWrite: false, fog: false })); sp.position.set(-0.72, cupY + 0.12, 0.31); sp.userData = { x0: -0.72, y0: cupY + 0.12, ph: i / 2 }; sp.renderOrder = 7; winRoom.add(sp); teaSteam.push(sp); winRoomMats.push(sp.material) } }
    // ベランダの手すり（窓の外・下＝団地の上階から街を見下ろす気配）。室内と一緒に乗り出すと退く。
    const railMat = mk(C(0xa6a298, 0x3a3e44)) // ベランダ手すり（鈍い色でチカチカ抑制）
    box(owW + 0.7, 0.08, 0.08, 0, oB + 0.62, -0.55, railMat); box(owW + 0.7, 0.08, 0.08, 0, oB + 0.04, -0.55, railMat) // 上下の手すり桟
    for (let i = -3; i <= 3; i++) box(0.05, 0.62, 0.05, i * ((owW + 0.5) / 6.2), oB + 0.33, -0.55, railMat) // 縦の手すり子
    // ── 天井から下がる和紙の照明（昭和の傘＋裸電球。明るい＝灯り） ──
    box(0.05, CY - 2.5, 0.05, 0, CY - (CY - 2.5) / 2, 2.4, woodDk) // 吊りコード
    cyl(0.42, 0.34, 0.42, 0, 2.32, 2.4, lampMat, 14)             // 和紙の傘
    box(0.5, 0.05, 0.5, 0, 2.55, 2.4, woodDk); cyl(0.09, 0.09, 0.14, 0, 2.06, 2.4, lampMat) // 傘の天板＋電球
    box(0.018, 0.42, 0.018, 0.17, 1.86, 2.4, woodDk); cyl(0.04, 0.04, 0.09, 0.17, 1.6, 2.4, lampMat) // 灯りの引き紐＋握り玉（昭和の暮らし）
    { const gTex = cv(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 1, 32, 32, 32); g.addColorStop(0, 'rgba(255,232,178,0.95)'); g.addColorStop(0.45, 'rgba(255,216,150,0.32)'); g.addColorStop(1, 'rgba(255,216,150,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64) }); const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: gTex, transparent: true, opacity: isNight ? 0.9 : 0.42, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); gl.position.set(0, 2.12, 2.4); gl.scale.set(2.4, 2.4, 1); gl.renderOrder = 6; winRoom.add(gl); winRoomMats.push(gl.material) } // 灯りの暖かいにじみ（夜ほど強い）
    if (isNight) { const pTex = cv(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 32); g.addColorStop(0, 'rgba(255,224,168,0.55)'); g.addColorStop(0.6, 'rgba(255,210,150,0.18)'); g.addColorStop(1, 'rgba(255,210,150,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64) }); const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: pTex, transparent: true, opacity: 0.6, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); pool.rotation.x = -Math.PI / 2; pool.position.set(0, FY + 0.04, 2.4); pool.renderOrder = 4; winRoom.add(pool); winRoomMats.push(pool.material) } // 夜: 灯りが畳に落とす暖かな光だまり
    if (!isNight) { // 昼/夕: 窓から差し込む光が畳に落ちる陽だまり（窓際が明るく室内へ伸びる）＝見回すと部屋に陽が射している温かさ
      const sTex = cv(96, 96, (x) => { const g = x.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, 'rgba(255,240,206,0.62)'); g.addColorStop(0.45, 'rgba(255,234,194,0.3)'); g.addColorStop(1, 'rgba(255,230,188,0)'); x.fillStyle = g; x.fillRect(0, 0, 96, 96) })
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(owW * 1.5, 3.0), new THREE.MeshBasicMaterial({ map: sTex, transparent: true, opacity: 0.3 + duskAmt * 0.22, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))
      shaft.rotation.x = -Math.PI / 2; shaft.position.set(0, FY + 0.035, 1.7); shaft.renderOrder = 4; winRoom.add(shaft); winRoomMats.push(shaft.material)
    }
    // ── 和室の骨格: 四隅の柱と壁をめぐる長押（昭和の茶の間らしい陰影） ──
    const postMat = mk(C(0x6f573c, 0x40342a)) // 飴色の柱・長押
    for (const [px, pz] of [[-SX + 0.11, 0.22], [SX - 0.11, 0.22], [-SX + 0.11, BZ - 0.22], [SX - 0.11, BZ - 0.22]]) box(0.17, WT - FY, 0.17, px, (WT + FY) / 2, pz, postMat) // 四隅の柱
    const ngY = oT + 0.5 // 長押の高さ（窓・鴨居の上）
    box(RW, 0.1, 0.06, 0, ngY, 0.05, postMat); box(RW, 0.1, 0.06, 0, ngY, BZ - 0.05, postMat) // 前後の長押
    box(0.06, 0.1, RD, -SX + 0.04, ngY, BZ / 2, postMat); box(0.06, 0.1, RD, SX - 0.04, ngY, BZ / 2, postMat) // 左右の長押
    // ── 右壁＝居間の顔: ブラウン管テレビ＋木の台＋柱時計＋カレンダー ──
    box(1.5, 0.66, 0.7, SX - 0.42, FY + 0.33, 3.0, woodMat)        // テレビ台
    box(1.04, 0.78, 0.66, SX - 0.5, FY + 1.05, 3.0, tvMat)         // テレビ筐体
    box(0.06, 0.58, 0.7, SX - 1.04, FY + 1.05, 3.0, screenMat)     // 画面（部屋側=-xを向く）
    // 画面の映り込み（曲面ガラスに窓/灯りが斜めに映る＝平坦な死んだ板を脱す）。透過テクスチャで暗い画面の上に重ねる。
    const tvReflTex = cv(64, 72, (x) => {
      const rg = x.createLinearGradient(6, 64, 44, 4); rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.46, 'rgba(190,212,224,0.2)'); rg.addColorStop(0.6, 'rgba(222,236,242,0.3)'); rg.addColorStop(0.74, 'rgba(190,212,224,0.16)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = rg; x.fillRect(0, 0, 64, 72) // 斜めの光の筋（窓の映り）
      const cg = x.createRadialGradient(20, 15, 1, 20, 15, 22); cg.addColorStop(0, `rgba(${isNight ? '255,232,180' : '228,238,244'},0.2)`); cg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = cg; x.fillRect(0, 0, 64, 72) // 上左に窓/灯りの丸い映り
      const vg = x.createRadialGradient(32, 36, 10, 32, 36, 40); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,10,14,0.35)'); x.fillStyle = vg; x.fillRect(0, 0, 64, 72) // 四隅の翳り＝曲面ガラス
    })
    const tvReflMat = new THREE.MeshBasicMaterial({ map: tvReflTex, transparent: true, depthWrite: false, fog: false }); winRoomMats.push(tvReflMat)
    { const refl = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.46), tvReflMat); refl.rotation.y = -Math.PI / 2; refl.position.set(SX - 1.07, FY + 1.05, 3.0); refl.renderOrder = 3; winRoom.add(refl) } // 画面の映り込み（-x向き）
    for (const dz of [-0.18, 0.18]) cyl(0.05, 0.05, 0.05, SX - 1.02, FY + 0.78, 3.0 + dz, woodDk, 8) // つまみ
    for (const a of [-0.5, 0.5]) { const ant = box(0.02, 0.66, 0.02, SX - 0.5, FY + 1.7, 3.0, blackMat); ant.rotation.z = a } // V字アンテナ
    box(0.34, 0.16, 0.26, SX - 0.5, FY + 1.52, 3.1, mk(C(0x8a6a5a, 0x47393e))) // テレビ上の小物
    // 昭和の振り子柱時計（右壁。振り子が静かに時を刻む）
    const clkCase = mk(C(0x6a4f34, 0x382a1c)), clkBrass = new THREE.MeshBasicMaterial({ color: C(0xc2a85e, 0x6e5e34), fog: false }); winRoomMats.push(clkBrass) // 振り子は手動メッシュ＝頂点色なしの素直な材で（黒落ち回避）
    const cwx = SX - 0.22 // 壁から室内側へ十分出す基準x（壁に埋まらないように）
    box(0.13, 0.92, 0.42, cwx, 1.5, 2.4, clkCase)                               // 時計の箱（濃い飴色）
    const cf = cyl(0.15, 0.15, 0.04, cwx - 0.085, 1.78, 2.4, creamMat, 20); cf.rotation.z = Math.PI / 2 // 文字盤（-x向き）
    box(0.02, 0.11, 0.022, cwx - 0.11, 1.81, 2.4, blackMat); box(0.02, 0.022, 0.12, cwx - 0.11, 1.78, 2.42, blackMat) // 針（短・長）
    box(0.012, 0.46, 0.32, cwx - 0.075, 1.36, 2.4, mk(C(0x241f1a, 0x120f0c)))   // 振り子室の暗がり
    const pend = new THREE.Group(); pend.position.set(cwx - 0.12, 1.6, 2.4); winRoom.add(pend) // 振り子（上端を軸に揺れる）
    const prod = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.34, 0.016), clkBrass); prod.position.y = -0.17; pend.add(prod) // 棹
    const pbob = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 16), clkBrass); pbob.rotation.z = Math.PI / 2; pbob.position.y = -0.36; pend.add(pbob) // 錘（真鍮の円盤）
    winPendulum = pend
    box(0.04, 0.7, 0.5, SX - 0.06, 0.9, 4.3, mk(0xffffff, calTex)) // カレンダー
    // ── 左壁＝暮らしの壁: 整理ダンス＋壁の額（家族写真）、奥に茶箪笥（食器棚）。団地の居間らしく。 ──
    const brass = mk(C(0xc0a060, 0x4a4030))
    box(1.3, 1.7, 0.55, -SX + 0.32, FY + 0.85, 2.6, woodMat)      // 整理ダンス（衣装箪笥）
    for (let r = 0; r < 4; r++) { box(1.18, 0.05, 0.05, -SX + 0.6, FY + 0.32 + r * 0.42, 2.6, woodDk); box(0.18, 0.05, 0.07, -SX + 0.62, FY + 0.52 + r * 0.42, 2.6, brass) } // 引き出しの段＋取っ手
    box(0.46, 0.36, 0.16, -SX + 0.42, FY + 1.95, 2.6, woodDk); box(0.38, 0.28, 0.04, -SX + 0.38, FY + 1.95, 2.6, creamMat) // ダンス上の写真立て
    box(0.05, 0.46, 0.6, -SX + 0.17, 1.72, 3.8, woodDk); box(0.03, 0.36, 0.5, -SX + 0.2, 1.72, 3.8, scrollMat) // 壁の額（家族写真）＝左壁に正しく向ける(x薄＝+x向き)・角部屋の新窓を避けたz=3.8へ（浮いた板に見えるのを解消）
    box(1.4, 1.4, 0.56, -SX + 0.33, FY + 0.7, 4.7, woodMat); box(1.1, 1.0, 0.06, -SX + 0.62, FY + 0.78, 4.7, screenMat) // 茶箪笥＋ガラス戸
    for (const dz of [-0.3, 0.0, 0.3]) box(0.16, 0.18, 0.16, -SX + 0.33, FY + 1.5, 4.7 + dz, ceramMat) // 箪笥上の器
    // ── 暮らしの小物（生活感）: 招き猫＋観葉植物 ──
    const white = mk(C(0xf1ebe0, 0xccc4b8)), redCol = mk(C(0xbe4030, 0x6e2a26)), potMat = mk(C(0xb37a52, 0x5a4030)), leaf = mk(C(0x6f8f5a, 0x3a5340))
    { const mx = SX - 1.06, mz = 2.62, my = FY + 0.66 // 招き猫（テレビ台の上）
      box(0.2, 0.05, 0.16, mx, my + 0.02, mz, redCol)                          // 赤い座布団
      box(0.17, 0.2, 0.14, mx, my + 0.13, mz, white)                           // 胴
      const mh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), white); mh.position.set(mx, my + 0.3, mz); grad(mh); mh.renderOrder = 2; winRoom.add(mh) // 頭
      for (const ex of [-0.06, 0.06]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 8), white); ear.position.set(mx + ex, my + 0.39, mz); grad(ear); ear.renderOrder = 2; winRoom.add(ear) } // 耳
      box(0.05, 0.12, 0.05, mx + 0.09, my + 0.18, mz - 0.02, white)            // 招く前足
      box(0.16, 0.04, 0.02, mx, my + 0.22, mz + 0.07, redCol)                  // 首輪
      cyl(0.045, 0.045, 0.02, mx, my + 0.15, mz + 0.08, brass, 10)             // 小判
    }
    // ── ちゃぶ台（昭和の茶の間の主役）＝低い円卓＋急須＋湯呑み＋みかんの鉢。左手前の床（猫の定位置=右と分けて据える）。陽だまりに置く。──
    { const tx = -0.72, tz = 2.25, ty = FY, topM = mk(C(0x8a6a44, 0x4a3826)), kyusu = mk(C(0x5e5446, 0x33342c)), mikan = mk(C(0xf0962e, 0x8a5018))
      cyl(0.5, 0.5, 0.05, tx, ty + 0.34, tz, topM, 22)                                    // 円い天板
      cyl(0.42, 0.46, 0.02, tx, ty + 0.305, tz, woodDk, 20)                               // 天板裏の見切り
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(0.03, 0.04, 0.32, tx + lx * 0.34, ty + 0.16, tz + lz * 0.34, woodDk, 6) // 折りたたみ脚
      cyl(0.1, 0.115, 0.12, tx - 0.13, ty + 0.42, tz - 0.02, kyusu, 14)                   // 急須の胴
      { const lid = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, 6.283, 0, 1.5), kyusu); lid.position.set(tx - 0.13, ty + 0.485, tz - 0.02); grad(lid); lid.renderOrder = 2; winRoom.add(lid) } // 蓋
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.13, 6), kyusu); sp.position.set(tx - 0.25, ty + 0.46, tz - 0.02); sp.rotation.z = 0.7; grad(sp); sp.renderOrder = 2; winRoom.add(sp) // 注ぎ口
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 6, 10, 3.4), kyusu); hd.position.set(tx - 0.005, ty + 0.46, tz - 0.02); hd.rotation.y = Math.PI / 2; grad(hd); hd.renderOrder = 2; winRoom.add(hd) // 取っ手
      for (const [cx, cz] of [[0.16, -0.16], [0.18, 0.14]]) { cyl(0.05, 0.04, 0.06, tx + cx, ty + 0.4, tz + cz, ceramMat, 12); cyl(0.044, 0.044, 0.006, tx + cx, ty + 0.43, tz + cz, mk(C(0x6a8a52, 0x33422a)), 12) } // 湯呑み2客＋お茶の面
      cyl(0.13, 0.09, 0.055, tx + 0.05, ty + 0.4, tz + 0.2, ceramMat, 16)                 // みかんの浅い鉢
      for (const [mx, mz, my] of [[-0.04, 0, 0], [0.05, 0.02, 0], [0, 0.06, 0.03], [0.02, -0.04, 0.04]]) { const mm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mikan); mm.position.set(tx + 0.05 + mx, ty + 0.45 + my, tz + 0.2 + mz); mm.scale.y = 0.92; grad(mm); mm.renderOrder = 2; winRoom.add(mm) } // みかん
      // 座布団（ちゃぶ台の脇＝さっきまで誰かが座ってお茶を飲んでいた気配）。ふっくら二段。
      const zabu = mk(C(0x9a5a4e, 0x4e2e28)), zx = tx - 0.18, zz = tz + 0.62
      const z1 = box(0.48, 0.07, 0.48, zx, ty + 0.04, zz, zabu); z1.rotation.y = 0.3
      const z2 = box(0.4, 0.05, 0.4, zx, ty + 0.095, zz, zabu); z2.rotation.y = 0.3
    }
    { const px = 1.9, pz = 0.9 // 観葉植物（窓辺の床）
      cyl(0.19, 0.14, 0.34, px, FY + 0.17, pz, potMat, 14)                     // 鉢
      for (const [dx, dy, dz, s] of [[0, 0.42, 0, 0.24], [-0.13, 0.34, 0.06, 0.18], [0.12, 0.36, -0.05, 0.19], [0.02, 0.54, -0.02, 0.16]]) { const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), leaf); lf.position.set(px + dx, FY + 0.34 + dy, pz + dz); grad(lf); lf.renderOrder = 2; winRoom.add(lf) } // 葉群
    }
    // ── 奥壁（振り返ると）: 襖（薄墨の山水）＋神棚＋黒電話 ──
    // 襖絵: 鳥の子紙に薄墨の遠山と草＝静かな山水。乗り出さず眺める奥の上質。
    const fusumaTex = cv(128, 192, (x) => {
      x.fillStyle = '#e7ddc4'; x.fillRect(0, 0, 128, 192) // 鳥の子紙
      for (const [cx, cy, w, h, a] of [[34, 96, 86, 30, 0.1], [86, 90, 96, 42, 0.15], [60, 84, 70, 54, 0.1]]) { x.fillStyle = `rgba(84,94,108,${a})`; x.beginPath(); x.moveTo(cx - w / 2, cy); x.quadraticCurveTo(cx - w * 0.18, cy - h, cx, cy - h * 0.7); x.quadraticCurveTo(cx + w * 0.2, cy - h * 1.05, cx + w / 2, cy); x.closePath(); x.fill() } // 薄墨の遠山（重なり・目線の高さ）
      x.fillStyle = 'rgba(150,160,172,0.16)'; x.beginPath(); x.arc(98, 46, 13, 0, 6.28); x.fill() // 淡い月
      x.strokeStyle = 'rgba(68,80,52,0.3)'; x.lineWidth = 1.2; for (let i = 0; i < 22; i++) { const gx = R() * 128; x.beginPath(); x.moveTo(gx, 132); x.quadraticCurveTo(gx + (R() - 0.5) * 8, 116, gx + (R() - 0.5) * 16, 100); x.stroke() } // 草（山裾）
    })
    const fusumaMat = mk(C(0xffffff, 0x7a7060), fusumaTex)
    for (let i = 0; i < 4; i++) { const fx = -3.0 + i * 2.0; box(1.94, 3.0, 0.06, fx, 0.6, BZ - 0.1, fusumaMat); box(0.08, 3.0, 0.09, fx - 0.98, 0.6, BZ - 0.12, woodMat); box(0.16, 0.24, 0.05, fx + 0.7, 0.6, BZ - 0.16, woodDk) } // 4枚の襖（襖絵）＋框＋引手
    const bclk = cyl(0.26, 0.26, 0.05, 2.0, 2.4, BZ - 0.14, creamMat, 18); bclk.rotation.x = Math.PI / 2 // 壁掛け時計（奥壁）
    box(0.02, 0.16, 0.02, 2.0, 2.45, BZ - 0.17, blackMat); box(0.13, 0.02, 0.02, 2.06, 2.4, BZ - 0.17, blackMat) // 時計の針
    box(0.5, 0.72, 0.03, -0.6, 1.4, BZ - 0.13, creamMat) // 奥壁のカレンダー/ポスター
    box(0.5, 0.7, 0.42, -2.6, FY + 0.35, BZ - 0.36, woodMat)     // 電話台
    box(0.36, 0.18, 0.3, -2.6, FY + 0.79, BZ - 0.36, blackMat); cyl(0.11, 0.11, 0.05, -2.6, FY + 0.9, BZ - 0.36, blackMat); box(0.34, 0.1, 0.12, -2.6, FY + 0.94, BZ - 0.36, blackMat) // 黒電話（台＋ダイヤル＋受話器）
    // ── 畳に座る暮らし: ちゃぶ台（丸）＋座布団＋急須・湯呑み・みかん・新聞。季節で扇風機/こたつ ──
    const tcx = 1.25, tcz = 3.7
    cyl(0.88, 0.88, 0.1, tcx, FY + 0.45, tcz, woodMat, 22)        // ちゃぶ台の天板（丸）
    for (const [dx, dz] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) box(0.08, 0.45, 0.08, tcx + dx, FY + 0.22, tcz + dz, woodDk) // 脚
    for (const [dx, dz, m] of [[0, -1.05, fabMat], [-1.05, 0.2, fab2], [0.7, 0.95, fabMat]]) box(0.74, 0.09, 0.74, tcx + dx, FY + 0.05, tcz + dz, m) // 座布団×3
    cyl(0.14, 0.17, 0.2, tcx - 0.25, FY + 0.6, tcz - 0.1, ceramMat); box(0.18, 0.05, 0.05, tcx - 0.42, FY + 0.66, tcz - 0.1, ceramMat) // 急須＋注ぎ口
    for (const dx of [0.2, 0.42]) cyl(0.07, 0.06, 0.1, tcx + dx, FY + 0.55, tcz + 0.2, ceramMat) // 湯呑み×2
    { const stTex = cv(48, 48, (x) => { const g = x.createRadialGradient(24, 24, 1, 24, 24, 24); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 48, 48) })
      for (let i = 0; i < 3; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: stTex, transparent: true, opacity: 0, depthWrite: false, fog: false })); sp.position.set(tcx - 0.2, FY + 0.7, tcz - 0.1); sp.userData = { x0: tcx - 0.2, y0: FY + 0.7, ph: i / 3 }; sp.renderOrder = 7; winRoom.add(sp); teaSteam.push(sp); winRoomMats.push(sp.material) } } // 急須から立ちのぼる湯気
    cyl(0.2, 0.18, 0.12, tcx + 0.1, FY + 0.56, tcz - 0.35, woodMat); for (let i = 0; i < 3; i++) { const mk2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mikanMat); mk2.position.set(tcx + 0.1 + (R() - 0.5) * 0.16, FY + 0.66, tcz - 0.35 + (R() - 0.5) * 0.16); grad(mk2); mk2.renderOrder = 2; winRoom.add(mk2) } // みかん籠
    box(0.34, 0.03, 0.46, tcx - 0.5, FY + 0.06, tcz + 0.7, creamMat) // たたんだ新聞
    if (season === 'winter') { box(1.95, 0.5, 1.95, tcx, FY + 0.28, tcz, fabMat) } // こたつの布団
    else if (season === 'summer') { cyl(0.04, 0.04, 1.0, -3.0, FY + 0.5, 5.2, blackMat); const fan = cyl(0.32, 0.32, 0.1, -3.0, FY + 1.0, 5.2, ceramMat, 16); fan.rotation.z = Math.PI / 2; box(0.5, 0.1, 0.5, -3.0, FY + 0.05, 5.2, blackMat) } // 扇風機（夏）
    // ── 窓辺のカーテン（ひだのある布。窓の左右。明暗の縦ひだで“ギャザーの寄った布”に） ──
    const curtMat = mk(C(0xd8cbb0, 0x4a4450)) // 上飾り（grad付きの平面）
    const ctC = (h) => { const c = new THREE.Color(h); if (roomWarm) c.multiply(roomWarm); const m = new THREE.MeshBasicMaterial({ color: c, fog: false }); winRoomMats.push(m); return m } // 子群ローカル＝素のMeshBasic（grad黒落ち回避）
    const curtLight = ctC(C(0xe0d4ba, 0x4e4a5a)), curtDark = ctC(C(0xc2b69c, 0x383442))
    for (const cs of [-1, 1]) { const cg = new THREE.Group(); cg.position.set(cs * (owW / 2 + 0.18), WINCY, 0.42) // ひだの束
      const folds = 5, fw = 0.072
      for (let f = 0; f < folds; f++) { const fold = new THREE.Mesh(new THREE.CylinderGeometry(fw * 0.62, fw * 0.62, owH + 0.34, 8), f % 2 ? curtDark : curtLight); fold.position.x = (f - (folds - 1) / 2) * fw; fold.renderOrder = 2; cg.add(fold) }
      cg.userData.cs = cs; cg.userData.x0 = cs * (owW / 2 + 0.18); winCurtains.push(cg); winRoom.add(cg) }
    box(owW + 0.7, 0.3, 0.07, 0, oT + 0.12, 0.44, curtMat) // 上飾り（バランス）
    // ── 夏＝窓辺の風鈴（吊り紐＋硝子の釣鐘＋舌＋短冊。窓をあけると外気でそっと揺れる） ──
    if (season === 'summer') {
      const wc = new THREE.Group(); wc.position.set(owW * 0.34, oT + 0.02, 0.42); winRoom.add(wc); windChime = wc
      const cordMat = mk(C(0x7a6a4e, 0x3a342a))
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.46, 5), cordMat); cord.position.y = -0.23; cord.renderOrder = 3; wc.add(cord)
      const glass = new THREE.MeshBasicMaterial({ color: isNight ? 0x86a6ae : 0xbfe2e8, transparent: true, opacity: 0.72, fog: false }); winRoomMats.push(glass)
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), glass); bell.position.y = -0.5; bell.renderOrder = 3; wc.add(bell)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.012, 6, 14), cordMat); rim.rotation.x = Math.PI / 2; rim.position.y = -0.55; rim.renderOrder = 3; wc.add(rim)
      const tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 5), cordMat); tongue.position.y = -0.6; tongue.renderOrder = 3; wc.add(tongue)
      const tanzaku = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.13), curtMat); tanzaku.position.y = -0.72; tanzaku.renderOrder = 3; wc.add(tanzaku)
    }
    // ── 窓辺の座布団＝“自分の席”。ここに座って街を眺める、家の安心の居場所。──
    { const zabuMat = mk(C(0x8f9cab, 0x353d48), clothTex), tieMat = mk(C(0x73808e, 0x2a313a)) // 落ち着いた藍鼠（布の織り）
      box(0.84, 0.12, 0.84, 0.1, FY + 0.05, 2.5, zabuMat)          // 座布団本体
      box(0.07, 0.05, 0.07, 0.1, FY + 0.12, 2.5, tieMat)          // 中央の綴じ
      for (const [dx, dz] of [[0.34, 0.34], [-0.34, 0.34], [0.34, -0.34], [-0.34, -0.34]]) box(0.05, 0.04, 0.05, 0.1 + dx, FY + 0.115, 2.5 + dz, tieMat) // 四隅の房
      const blanMat = mk(C(0xcdb48e, 0x4a4036), clothTex) // たたんだ膝掛け（生成りの暖色）＝ここで暖まれる安心
      for (let i = 0; i < 3; i++) box(0.46, 0.038, 0.5 - i * 0.05, -0.62 + i * 0.012, FY + 0.045 + i * 0.036, 2.46, blanMat) // 少しずつずらした層
      floorShadow(-0.6, 2.46, 0.62, 0.62) } // 膝掛けの接地影
    // ── 窓辺の読みかけの本（くつろぎの時間の気配。少しずれて積む） ──
    { const bx = 0.82, bz = 2.46, cols = [mk(C(0x6a7a86, 0x2c343c)), mk(C(0xb0705a, 0x42302a)), mk(C(0xcabfa2, 0x4a4438))]
      let by = FY + 0.04
      for (let i = 0; i < 3; i++) { const bk = box(0.32 - i * 0.02, 0.04, 0.23 - i * 0.015, bx + (R() - 0.5) * 0.05, by + 0.02, bz, cols[i]); bk.rotation.y = (R() - 0.5) * 0.35; by += 0.046 }
      floorShadow(bx, bz, 0.44, 0.36) }
    // ── 主な床置き家具の接地影（畳との間に柔らかい影＝浮きを消し、見下ろしで床が締まる） ──
    floorShadow(0.1, 2.5, 1.05, 1.05)       // 窓辺の座布団
    floorShadow(SX - 0.42, 3.0, 2.1, 1.4)   // テレビ台
    floorShadow(-SX + 0.4, 2.6, 1.85, 1.05) // 整理ダンス
    floorShadow(-SX + 0.4, 4.7, 1.95, 1.15) // 茶箪笥
    floorShadow(-2.6, BZ - 0.4, 1.1, 0.95)  // 電話台
    floorShadow(tcx, tcz, 2.5, 2.5)         // ちゃぶ台＋座布団
    floorShadow(1.9, 0.9, 0.8, 0.8)         // 観葉植物
    // ── 窓から差し込む光（昼）＝畳に落ちる暖かな採光。最も多く眺める“座っている景色”に光の差す向きを与える。──
    if (!isNight) {
      // 畳に落ちる窓明かり（夕ほど暖色で濃い。夜の灯りだまりの昼版）。窓桟の影を抜いて“この窓から差す光”に。
      const ltTex = cv(128, 128, (x) => {
        const g = x.createRadialGradient(64, 52, 4, 64, 64, 66); g.addColorStop(0, 'rgba(255,247,224,0.96)'); g.addColorStop(0.5, 'rgba(255,239,202,0.34)'); g.addColorStop(1, 'rgba(255,239,202,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128)
        x.globalCompositeOperation = 'destination-out'; x.filter = 'blur(2.5px)'; x.fillStyle = 'rgba(0,0,0,0.55)' // 桟の影＝光を抜く（やわらかい縞）
        for (const bx of [30, 64, 98]) x.fillRect(bx - 3.5, 0, 7, 128)  // 縦桟（左右の障子＋召し合わせ）の影
        x.fillRect(0, 56, 128, 6)                                       // 横桟（窓台）の影
        x.filter = 'none'; x.globalCompositeOperation = 'source-over'
      })
      const patchMat = new THREE.MeshBasicMaterial({ map: ltTex, color: new THREE.Color(0xfff1cc).lerp(sunCol, 0.5), transparent: true, opacity: 0.17 + duskAmt * 0.24, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }); winRoomMats.push(patchMat)
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(owW + 1.6, 2.7), patchMat); patch.rotation.x = -Math.PI / 2; patch.rotation.z = 0.1; patch.position.set(-0.2, FY + 0.05, 1.75); patch.renderOrder = 4; winRoom.add(patch) // 窓から斜めに差す向き
    }
    // ── 光に舞うほこり（窓辺の空間にゆっくり漂う微粒。昼は窓明かり・夜は灯りに浮かぶ。小さく淡く＝雪に見せない）──
    {
      const N = 46, dp = new Float32Array(N * 3), base = []
      for (let i = 0; i < N; i++) { const x0 = (R() - 0.5) * 3.1, y0 = FY + 0.45 + R() * (oT - FY - 0.3), z0 = 0.5 + R() * 2.7; dp[i * 3] = x0; dp[i * 3 + 1] = y0; dp[i * 3 + 2] = z0; base.push({ x0, y0, z0, ph: R() * 6.28, sp: 0.25 + R() * 0.4, amp: 0.05 + R() * 0.07 }) }
      const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3))
      const dCol = isNight ? new THREE.Color(0xffe0a8) : new THREE.Color(0xffeccb).lerp(sunCol, 0.5) // 夜は灯り色の微粒
      // 絵柄を持たない粒は WebGL の既定で「硬い四角」に描かれる（高精細な画面ほど四角が見える）。
      // 中心から柔らかく消える丸を1枚与えて、空気に浮かぶ埃らしい滲みにする。
      const dotTex = cv(32, 32, (x) => { const g = x.createRadialGradient(16, 16, 0.5, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.42)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32) })
      // 絵柄の縁がなだらかな分だけ見かけが淡くなるので、粒をわずかに大きく・濃くして今までの見え方に揃える
      const dmat = new THREE.PointsMaterial({ map: dotTex, color: dCol, size: 0.034, transparent: true, opacity: isNight ? 0.2 : (0.3 + duskAmt * 0.2), depthWrite: false, fog: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }); winRoomMats.push(dmat)
      const dust = new THREE.Points(dgeo, dmat); dust.frustumCulled = false; dust.renderOrder = 6; winRoom.add(dust)
      winDust = { geo: dgeo, arr: dp, base }
    }
    // ── 窓辺の日だまりで丸くなる猫（“居る部屋”の主役。顔まで作り込む）。子群ローカルは素のMeshBasic（grad黒落ち回避）。──
    {
      const tint = (h) => { const c = new THREE.Color(h); if (roomWarm) c.multiply(roomWarm); return c }
      const M = (h) => { const m = new THREE.MeshBasicMaterial({ color: tint(h), fog: false }); winRoomMats.push(m); return m }
      // 毛色のバリエーション（読み込みごとに違う猫＝キジトラ/茶トラ/サバトラ/黒/白/灰/三毛）。夜は沈める。
      const COATS = [
        { f: 0x9c8f7c, d: 0x6e6150, l: 0xb6a98f, w: 0xeae0cf, n: false }, // キジトラ
        { f: 0xc78a4c, d: 0x9a5a2c, l: 0xe2aa66, w: 0xf2e6cf, n: false }, // 茶トラ
        { f: 0x8e8c82, d: 0x585650, l: 0xa8a698, w: 0xe8e4d8, n: false }, // サバトラ
        { f: 0x3c3631, d: 0x282420, l: 0x544a40, w: 0x463f39, n: false }, // 黒猫（白少なめ）
        { f: 0xe7e1d4, d: 0xcdc5b4, l: 0xf3eee3, w: 0xf6f2ea, n: false }, // 白猫
        { f: 0x8a8a85, d: 0x605f59, l: 0xa6a69e, w: 0xe6e4dc, n: false }, // 灰
        { f: 0xeae2d2, d: 0xc88a4c, l: 0x3c3631, w: 0xf2ece0, n: true },  // 三毛（白地に茶と黒のブチ）
      ]
      const coat = COATS[(Math.random() * COATS.length) | 0], dk = (h) => new THREE.Color(h).multiplyScalar(0.7).getHex() // 読み込みごとに違う毛色（Math.randomで毎回変える＝シード固定のRと別に）
      // 毛の主要部は陰影付き(MeshToon)で「ふわっとした量感」を出す＝平塗りの塊感を脱す。目/ひげ/鼻は鮮明さのためMeshBasic(M)のまま。
      const Mt = (h) => { const m = new THREE.MeshToonMaterial({ color: tint(h), gradientMap: grad, fog: false }); winRoomMats.push(m); return m }
      const fur = Mt(isNight ? dk(coat.f) : coat.f)   // 地色（陰影付き）
      const furD = Mt(isNight ? dk(coat.d) : coat.d)  // 縞・陰
      const furL = Mt(isNight ? dk(coat.l) : coat.l)  // 背の明るみ
      const white = Mt(isNight ? dk(coat.w) : coat.w) // 胸・口先・足先
      const pink = M(isNight ? 0x7e615d : 0xd69a90)  // 鼻・耳の内
      const dark = M(isNight ? 0x231e19 : 0x3b332b)  // 閉じた目・口
      const whisk = M(isNight ? 0x9a9384 : 0xeee7d6) // ひげ
      const SP = (r, w, h) => new THREE.SphereGeometry(r, w || 16, h || 13)
      const CO = (r, h, s) => new THREE.ConeGeometry(r, h, s || 9)
      const CY = (r, h, s) => new THREE.CylinderGeometry(r, r, h, s || 6)
      const cat = new THREE.Group(); cat.position.set(0.5, FY + 0.02, 1.62); cat.rotation.y = 0.38 // 採光だまり・顔をこちらへ
      const add = (geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); m.scale.set(sx || 1, sy || 1, sz || 1); m.renderOrder = 2; cat.add(m); return m }
      // ── 胴（丸くなって伏せる。お尻が高く、手前に前足。香箱に近い）──
      const body = add(SP(0.22, 20, 16), fur, 0, 0.15, -0.04, 0, 0, 0, 1.5, 0.78, 1.22)        // 胴
      add(SP(0.18), fur, -0.2, 0.17, -0.06, 0, 0, 0, 1.0, 0.95, 1.0)                            // お尻のふくらみ
      add(SP(0.19), white, 0.08, 0.085, 0.16, 0, 0, 0, 1.2, 0.5, 0.9)                           // 胸〜お腹の白
      const paws = []; for (const px of [-0.08, 0.08]) { const pw = add(SP(0.05), white, 0.12, 0.045, 0.3, 0, 0, 0, 1.3, 0.8, 1.5); pw.position.set(0.16 + px * 0.55, 0.05, 0.27); pw.userData.y0 = 0.05; pw.userData.z0 = 0.27; paws.push(pw) } // 前足の足先（白い肉球。ふみふみ/バットで動く）
      // 前足の脚（肩→足先を結ぶテーパ脚）。丸い足先だけが伸びて見える違和感を解消＝脚全体が一緒に伸びる。足先の動きに毎フレーム追従。
      const legUp = new THREE.Vector3(0, 1, 0), legD = new THREE.Vector3()
      const legs = paws.map((pw) => { const lg = add(new THREE.CylinderGeometry(0.03, 0.046, 1, 7), fur); lg.userData.sh = new THREE.Vector3(pw.position.x, 0.135, 0.08); return lg }) // 肩の付け根（胸の前）
      const aimLegs = () => { for (let i = 0; i < legs.length; i++) { const lg = legs[i], sh = lg.userData.sh; legD.copy(paws[i].position).sub(sh); const L = Math.max(0.06, legD.length()); lg.position.copy(sh).addScaledVector(legD, 0.5); lg.scale.set(1, L, 1); lg.quaternion.setFromUnitVectors(legUp, legD.normalize()) } } // 肩→足先を結ぶ
      aimLegs()
      // 背の薄墨の縞（タビー）。胴に沿って弧を伏せ、脇腹まで垂らす。密に・少し太く＝毛柄を明瞭に（solid色ではfurD≒地色で自然に目立たない＝正しい）
      for (const sx2 of [-0.2, -0.12, -0.04, 0.04, 0.12, 0.2]) add(new THREE.TorusGeometry(0.16, 0.02, 6, 16, Math.PI * 0.72), furD, sx2, 0.18, -0.03, 0, 0, Math.PI, 1.12, 1, 1.9)
      add(SP(0.2), furL, 0, 0.27, -0.04, 0, 0, 0, 1.3, 0.4, 1.0) // 背の明るみ
      // 尻尾（胴の手前へ巻き、先が淡い）
      const tail = add(new THREE.TorusGeometry(0.15, 0.038, 8, 20, Math.PI * 1.3), fur, 0.04, 0.08, 0.2, Math.PI / 2, 0, 0.4)
      add(SP(0.045), white, 0.2, 0.08, 0.28) // 尻尾の先（淡色）
      // ── 頭（顔をこちらへ。子群＝寝返り/呼吸でいっしょに動く）──
      const headG = new THREE.Group(); headG.position.set(0.1, 0.33, 0.22); headG.rotation.set(-0.46, 0.0, 0); cat.add(headG) // 顔をこちらへ上げて（見下ろす視点でも顔が見える・正面）
      const hAdd = (geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); m.scale.set(sx || 1, sy || 1, sz || 1); m.renderOrder = 3; headG.add(m); return m }
      hAdd(SP(0.125, 18, 15), fur, 0, 0, 0, 0, 0, 0, 1.05, 0.96, 0.96)              // 頭
      for (const s of [-1, 1]) hAdd(SP(0.07), fur, s * 0.085, -0.035, 0.05, 0, 0, 0, 0.95, 0.95, 0.95) // 頬のふくらみ
      hAdd(SP(0.062), white, 0, -0.055, 0.09, 0, 0, 0, 1.25, 0.92, 0.92)            // 口先（白マズル）
      hAdd(CO(0.02, 0.022, 3), pink, 0, -0.028, 0.135, Math.PI, 0, 0)               // 鼻（ピンクの逆三角）
      hAdd(CY(0.004, 0.028), dark, 0, -0.058, 0.125)                                // 口の縦線
      for (const s of [-1, 1]) hAdd(new THREE.TorusGeometry(0.018, 0.004, 5, 9, Math.PI), dark, s * 0.02, -0.072, 0.12, 0, 0, s > 0 ? Math.PI * 0.5 : Math.PI * 1.5) // ωの口
      // 閉じた目（やさしい弧＝うとうと。眠っている間）
      const eyesClosed = []; for (const s of [-1, 1]) eyesClosed.push(hAdd(new THREE.TorusGeometry(0.03, 0.006, 6, 14, Math.PI), dark, s * 0.052, 0.016, 0.112, 0, 0, Math.PI))
      // 開いた目（目を覚ます/撫でられるとこちらを見る。初期は隠す）。黒目＋緑の虹彩＋縦瞳孔＋キャッチライト。
      const iris = M(isNight ? 0x70794a : 0xa0ae66), eyeShine = M(0xfdfdf6) // 虹彩＋キャッチライト(鮮明な白=MeshBasic)
      const eyesOpen = []; for (const s of [-1, 1]) { const eg = new THREE.Group(); eg.position.set(s * 0.056, 0.022, 0.107); eg.visible = false; headG.add(eg)
        const ball = new THREE.Mesh(SP(0.03, 14, 11), dark); ball.scale.set(1.0, 1.16, 0.62); ball.renderOrder = 3; eg.add(ball)           // 黒目（少し大きく丸く＝可愛い）
        const ir = new THREE.Mesh(SP(0.022, 12, 9), iris); ir.position.z = 0.013; ir.scale.set(0.96, 1.06, 0.6); ir.renderOrder = 3; eg.add(ir) // 緑の虹彩（大きめ）
        const pup = new THREE.Mesh(CY(0.0036, 0.03, 6), dark); pup.position.z = 0.024; pup.renderOrder = 3; eg.add(pup)                   // 縦の瞳孔
        const cl = new THREE.Mesh(SP(0.008, 8, 6), eyeShine); cl.position.set(s * 0.009, 0.018, 0.03); cl.renderOrder = 3; eg.add(cl)    // キャッチライト（うるっと）
        eyesOpen.push(eg) }
      const hit = new THREE.Mesh(SP(0.42, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0.22, 0.06); cat.add(hit) // 撫でる判定の当たり（不可視・大きめ）
      // 耳（外＝毛色／内＝ピンク。先を少し外へ）
      const ears = [], ears0 = []; for (const s of [-1, 1]) { ears.push(hAdd(CO(0.052, 0.092, 12), fur, s * 0.075, 0.115, -0.005, 0.12, 0, s * -0.2)); ears0.push(0.12); hAdd(CO(0.03, 0.055, 10), pink, s * 0.073, 0.108, 0.01, 0.12, 0, s * -0.2) }
      // 額のМ字縞（茶トラの印）
      for (const s of [-0.035, 0, 0.035]) hAdd(CY(0.005, 0.055), furD, s, 0.085, 0.05, 0.55, 0, 0)
      // ひげ（左右3本ずつ・細く）
      for (const s of [-1, 1]) for (const dy of [-0.018, 0, 0.018]) { const w = hAdd(CY(0.0018, 0.14, 4), whisk, s * 0.12, -0.03 + dy, 0.1); w.rotation.z = s * 1.45; w.rotation.y = -s * (0.2 + dy * 6) }
      const catShadow = floorShadow(0.5, 1.62, 0.78, 0.6) // 猫の接地影（移動について回る）
      // ── 毛糸玉のおもちゃ（畳の上）。タップすると猫がバットして転がる＝じゃれて遊べる。 ──
      const toyG = new THREE.Group(); const toyHome = { x: 0.0, z: 1.42 }; toyG.position.set(toyHome.x, FY + 0.075, toyHome.z) // 猫の手前左の畳（見える位置）
      const yarnCol = M(isNight ? 0x8a4a52 : 0xd6727e) // 毛糸の赤
      const yarn = new THREE.Mesh(SP(0.078, 12, 10), yarnCol); yarn.renderOrder = 2; toyG.add(yarn)
      for (let i = 0; i < 6; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.01, 4, 14), M(isNight ? 0x6e3a42 : 0xb85862)); ring.rotation.set(R() * 3, R() * 3, R() * 3); ring.renderOrder = 3; toyG.add(ring) } // 巻き目
      const toyShadow = floorShadow(toyHome.x, toyHome.z, 0.16, 0.5)
      winRoom.add(toyG)
      const toyHit = new THREE.Mesh(SP(0.16, 6, 5), new THREE.MeshBasicMaterial({ visible: false })); toyHit.position.copy(toyG.position); winRoom.add(toyHit)
      winRoom.add(cat); winCat = { g: cat, body, tail, ears, ears0, headG, eyesClosed, eyesOpen, hit, catShadow, paws, legs, aimLegs, toyG, toyHit, toyShadow, toyHome, toyVX: 0, toyVZ: 0, toyBob: 0, y0: 0.78, headX0: -0.46, headY0: 0.33, baseY: FY + 0.02, homeX: 0.5, homeZ: 1.62, tailT: 3 + R() * 5, flickT: 0, earT: 5 + R() * 6, earK: 0, settleT: 22 + R() * 30, settleP: 1, headT: 16 + R() * 24, headP: 1, alert: 0, alertTarget: 0, petAmt: 0, petActive: 0, wakeT: 26 + R() * 40, wakeHold: 0, purr: 0, relocT: 38 + R() * 50, relocP: 1, x0: 0.5, z0: 1.62, rot0: 0.38, x1: 0.5, z1: 1.62, rot1: 0.38, react: null, reactT: 0, reactDur: 1, lastReact: -1, playful: 0, lookX: 0, lookXTarget: 0, blinkT: 3 + R() * 4, blink: 0, voice: 0.82 + Math.random() * 0.42, knead: 0, kneadT: 0, sitAmt: 0, visitPhase: 0, visitT: 150 + Math.random() * 200, visitDur: 0, visitCool: 0, visitLookT: 8, petHold: 0, noticeT: 0 }
    }
    winRoom.position.set(0, eye.y - 1.5, eye.z - dWall)
    scene.add(winRoom)
  }

  active = {
    renderer, scene, camera, stage, raf: 0,
    paused: false,                // おやすみの暗転後は true＝描画ループを止める（発熱・電池配慮。setTown3dPaused）

    yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0,
    winOpen: 0, winOpenTarget: 0, // 窓をあける（ガラスが横にすべって外気が澄む）。winOpen=ease済みの実値
    winOpenP: 0,                  // 窓あけの線形進行(0..1)。これに ease-in-out をかけて winOpen にする
    lean: 0, leanTarget: 0,        // 身を乗り出す（枠を越えて前へ＝視界が広がる）。lean=ease済みの実値
    leanP: 0,                     // 乗り出しの線形進行(0..1)
    fovCur: 62,
    // ── 浮遊（空を飛ぶ）＆散策（歩く）モードの状態 ──
    flyEnabled: true,             // 立体の街・谷戸いずれも飛べる/歩ける（谷戸は谷筋に沿う狭めの箱）
    mode: 'window',               // 'window'（窓辺）| 'fly'（空を飛ぶ）| 'walk'（地上を歩く）
    flyTarget: 0,                 // 窓の外にいたい(1)/窓へ戻りたい(0)。fly/walk のどちらでも 1
    flyP: 0,                      // 窓⇄外の混ざり具合 0=窓 / 1=外（これをイージングして滑らかに出入り）
    flyPos: new THREE.Vector3(),  // 移動の中心点（“自分”）。引いたカメラはこの後ろ上から望む
    flyYaw: 0, flyPitch: 0, flyYawTarget: 0, flyPitchTarget: 0, // flyYaw=進路の向き（左スティックで旋回）／flyPitch=高さ角（右ドラッグ上下）
    cinema: 0, lastInputT: 0,      // オートシネマ: 無操作で最寄り名所をゆっくりオービット（操作で即復帰）
    arrivalSlow: 1,                // 目的地で自動減速する係数（霞の帯/城下でゆっくり）
    lookYawOff: 0, lookYawOffTarget: 0, lookDragging: false, // 見回しの横オフセット（飛行/窓辺の右ドラッグ。離すと0へ戻る）
    walkCamYaw: 0,                // 歩行のカメラの向き（右ドラッグで360°持続的に回す。進む向きは別＝flyYaw）
    turnSmooth: 0,                // 旋回入力のスムージング値（手ブレを均し、急旋回を抑える＝快適な曲がり）
    vel: new THREE.Vector3(),     // 慣性つきの速度（離すと惰性で減速＝ホバリング）
    moveX: 0, moveY: 0,           // スティック入力(-1..1)。左で動かす（横=旋回・縦=前後）。離すと0
    cruise: true,                 // スキームA: 自動巡航中か（とまる/すすむトグル）。とまる=その場でホバリング
    zoom: 1.56,                   // カメラの引き具合（ピンチ/ズームボタンで0.4=寄り〜3.0=引き）。初期値は「縮小ボタン2回ぶん」引いた値＝窓辺の既定を少し引き気味に
    zoomTarget: 1.56,             // ズームの目標値（ボタン/ピンチで設定→zoomがこれへ滑らかに追従＝確実で酔わない寄り引き）
    speedMul: 0.55,               // 飛行速度の倍率（既定はゆっくりめ。速く/遅くボタンで0.35〜1.7に調整）
    wide: false,                  // 視界を広げるモード（広角＋カメラを引いて高くから広い思案で操作）
    climb: 0,                     // 上昇/下降ボタン（+1=上昇 / -1=下降 / 0=なし。向きを変えず高さだけ変える）
    bankCur: 0,                   // 旋回バンク（ロール）の現在値（飛行の傾き）
    camPos: new THREE.Vector3(),  // 引いたカメラの実位置（遅れ追従でわずかに揺らぐ）
    camReady: false,              // camPos 初期化済みか（飛び立ち/着地でスナップ）
    landedFired: true,            // 着地の砂ぼこり/沈み込みを発火済みか（着地で false→接地で発火）
    landDustT: 0, dipT: 0,        // 砂ぼこり/カメラ沈み込みの残り時間(秒)
    winLook: new THREE.Vector3(), // 窓ビューの注視点（飛び立つ瞬間の視線引き継ぎ用に毎フレーム保持）
    dispose() {
      // シーングラフ全体の geometry/material/texture を解放（連打切替でのGPUメモリ蓄積＝コンテキストロストを防ぐ）
      try {
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose()
          const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : [])
          for (const m of mats) {
            if (!m) continue
            if (m.map && m.map !== winMapBase) m.map.dispose() // 建物ごとの窓テクスチャのクローンを解放
            if (m.emissiveMap) m.emissiveMap.dispose()
            m.dispose()
          }
        })
        winMapBase.dispose()
        for (const e of winEmis) e.dispose()
        // 樹冠フェードのクローン材（近づいた木の半透明版）は userData 上に残り scene の traverse から漏れる＝個別に解放。
        for (const tr of treesArr) { if (tr.userData && tr.userData.fadeMat) tr.userData.fadeMat.dispose() }
        grad.dispose()
      } catch (e) { /* 無視 */ }
      // 後処理(EffectComposer/Bloom/FXAA)のRenderTargetをGPUから解放（評価 技術-致命2）。
      // これを怠ると情景往復のたびにMSAA RT＋composerのrenderTarget1/2＋bloomの内部RTがGPUに残留し、
      // 低メモリ端末で数往復すると（コード全体が避けようとしている）コンテキスト枯渇/黒画面を誘発する。
      try { if (composer) { for (const p of composer.passes) { if (p && p.dispose) p.dispose() } composer.dispose() } } catch (e) { /* 無視 */ }
      // forceContextLoss() は呼ばない: 上で geometry/material/texture を解放済みなので不要で、
      // 情景往復のたびにコンテキストを強制喪失・再生成するとモバイルでコンテキスト枯渇→3D表示不能の温床になる（評価 技術-H5）。
      renderer.dispose()
    },
  }

  // 解像度/サイズを変える時は必ずここを通す＝camera.aspect も同時に更新（更新漏れが「横に伸びる」バグの元）。
  function applySize() {
    const w = stage.clientWidth, h = stage.clientHeight
    if (!w || !h) return
    lastStageW = w; lastStageH = h
    renderer.setPixelRatio(curPR); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix()
    if (composer) { composer.setPixelRatio(curPR); composer.setSize(w, h); if (fxaaPass) fxaaPass.material.uniforms.resolution.value.set(1 / (w * curPR), 1 / (h * curPR)) }
  }
  function resize() { applySize() }
  window.addEventListener('resize', resize)

  // ── 歩行（散策）の当たり判定 ── blockedAt は上方（colliders定義の直後）で定義済み＝住民配置時にも使える
  // 水際（海・川）は歩いて踏み込まない＝汀で止まる。歩行のみで使う。
  const wetAt = (x, z) => kind !== 'yato' && ((x > SEA.coast && heightAt(x, z) < SEA.level + 0.4) || Math.abs(x - RIVER.x) < RIVER.halfW)
  const tryWalk = (pos, dx, dz) => {
    const b = bound
    const nx = Math.max(-b.x, Math.min(b.xMax || b.x, pos.x + dx))
    const nz = Math.max(b.zMin, Math.min(b.zMax, pos.z + dz))
    if (!blockedAt(nx, pos.z) && !wetAt(nx, pos.z)) pos.x = nx // x方向だけ先に試す（壁/水際に沿って横へ滑る）
    if (!blockedAt(pos.x, nz) && !wetAt(pos.x, nz)) pos.z = nz // z方向だけ試す
  }
  // 着地地点が建物/樹冠の中なら、空いた近くの地点へそっと退避する（建物や木に埋もれて立たない）。
  const spawnBad = (x, z) => {
    const b = bound
    if (x < -b.x || x > (b.xMax || b.x) || z < b.zMin || z > b.zMax) return true // 箱の外には降りない
    if (kind !== 'yato') {
      if (x > SEA.coast && heightAt(x, z) < SEA.level + 0.6) return true // 海・汀には降りない（水没を防ぐ）
      if (Math.abs(x - RIVER.x) < RIVER.halfW + 1.3) return true // 川には降りない
    }
    for (const c of spawnAvoid) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < c.r * c.r) return true }
    // 走っている車・バスの上には降りない。動く物なので静的な回避リストには載せられず、降りる瞬間の位置を見て避ける
    // （実機で降り立つとバスの車体が画面の下半分を塞いだ＝2026-07-28の検収で判明）。
    for (const v of cars) { const dx = x - v.position.x, dz = z - v.position.z; if (dx * dx + dz * dz < 42) return true } // 6.5m以内は不可（バス全長7m）
    return false
  }
  // 着地点の開放度＝8方位で歩ける距離の最大。降りた所が箱詰め（密集の谷間）なら低い。
  const maxClearAt = (x, z) => { let best = 0; for (let a = 0; a < 8; a++) { const yaw = a / 8 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw); let d = 1.0; for (; d < 24; d += 1.6) { if (blockedAt(x + hx * d, z + hz * d)) break } if (d > best) best = d } return best } // 24uまで測る＝「狭いが空いてる(14)」と「本当に開けた(24)」を区別し、抜けのある着地点を選べるようにする（旧14だと閾16に届かず全て同等扱いだった）
  active.resolveSpawn = (x, z) => {
    // 「建物/水を避ける」だけでなく「歩いて出られる開けた所」を選ぶ＝降りた途端に透明の壁で詰まらない。
    // さらに、屋台/門/群衆の際に降りると一人称の前方が近接物で塞がるため、十分に開けた地点を優先する
    // （前方視界の抜けを確保＝降り立った景色を気持ちよく）。16u以上開けた所を見つけたら即採用、無ければ最も開けた所。
    // フォールバックは「最も開けた所」でなく「開けて かつ 平らな所」を選ぶ＝急斜面の縁に降りて視界が地肌で
    // 埋まり見下ろしになるのを避ける（特に谷戸＝谷底の平場へ寄せる。テレポートでなく現在地から外へ探す・実機FB）。
    let best = null, bestScore = -1e9
    const consider = (nx, nz) => {
      if (spawnBad(nx, nz)) return false
      const c = maxClearAt(nx, nz)
      // 急斜面の縁に降りると視界が斜面の地肌で埋まる（着地景色の悪化）。前後左右8u先の高低差が小さい平場を「良い着地点」とする。
      const h0 = heightAt(nx, nz); let maxRise = 0
      for (const [ox, oz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) { const dh = Math.abs(heightAt(nx + ox, nz + oz) - h0); if (dh > maxRise) maxRise = dh }
      const score = Math.min(c, 24) - maxRise * 2.2 // フォールバック優先度: 開けて(上限24)かつ平らなほど高い＝斜面の縁でなく平場を選ぶ
      if (score > bestScore) { bestScore = score; best = [nx, nz] }
      return c >= 16 && maxRise < 4.5 // 抜けがあり かつ 平場（旧6→4.5に厳しく＝斜面を避け谷底/街路の平場へ寄せる）＝即採用
    }
    if (consider(x, z)) return [x, z]
    for (let r = 1.5; r <= 28; r += 1.5) { // 抜けのある所まで少し広く探す（斜面の縁など詰まった所からも開けた景色へ寄せる）
      for (let a = 0; a < 12; a++) {
        const nx = x + Math.cos(a / 12 * 6.2832) * r, nz = z + Math.sin(a / 12 * 6.2832) * r
        if (consider(nx, nz)) return [nx, nz]
      }
    }
    return best || [x, z] // どこも条件を満たさなければ、開けて平らな度合いが最も高い所へ
  }
  // 着地時の向き：最も視界の抜ける方向を基本に、街並み(中心)の方へ顔を向ける＝壁/空き地/水面でなく
  // 景色の深い方（街路・ランドマーク）を望む。抜けの距離＋中心へ向く度合いの合算で選ぶ。
  active.openYaw = (x, z) => {
    const centers = [{ x: 0, z: -24 }, DOWNTOWN, STATION, PARK, { x: EDO.x, z: EDO.z }, { x: SENGOKU.x, z: SENGOKU.z }, { x: TAISHO.x, z: TAISHO.z }]
    let ic = centers[0], icd = 1e9
    for (const c of centers) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d > 100 && d < icd) { icd = d; ic = c } } // 自分から少し離れた最寄りの中心
    const toCenter = Math.atan2(ic.x - x, -(ic.z - z))
    const onEastBeach = kind !== 'yato' && x > SEA.coast + 4 && x < SEA.shore + 2 && heightAt(x, z) < SEA.level + 6 // 東の渚（汀の近くの砂）
    const aim = onEastBeach ? Math.PI / 2 : toCenter // 渚に降りたら海(東=+x)を正面に＝寄せ返す波打ち際を眺める。ほかは街の中心へ
    const gy0 = heightAt(x, z) // 足元の高さ（前方の上り具合の基準）
    let best = toCenter, bestScore = -1
    for (let a = 0; a < 16; a++) {
      const yaw = a / 16 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw)
      let d = 1.0
      for (; d < 34; d += 1.2) { if (blockedAt(x + hx * d, z + hz * d)) break }
      let dd = yaw - aim; dd = Math.atan2(Math.sin(dd), Math.cos(dd))
      // 急な上り斜面を正面にすると丘の地肌が画面を覆い視界が詰まる（評価指摘の着地景色の悪化）。前方が眼の高さより高く迫る方位を避ける。
      // 遠めの丘(〜22u先)も拾えるよう走査を延ばす＝丘の縁でも斜面でなく街並みの抜けへ向く。
      let rise = 0, drop = 0; for (const ad of [6, 10, 14, 18, 22]) { const gh = heightAt(x + hx * ad, z + hz * ad); if (gh - gy0 > rise) rise = gh - gy0; if (gy0 - gh > drop) drop = gy0 - gh }
      const uphill = Math.max(0, rise - 2.0) // 2mを超える上りからペナルティ（緩い起伏は許容、丘の壁は強く避ける）
      const vista = Math.min(6, Math.max(0, drop - 1.5)) // 前方が下って開ける＝坂の街を見はるかす眺め（高台の景色）。ほどよく加点
      const score = d + (1 - Math.abs(dd) / Math.PI) * 9 - uphill * 3.0 + vista * 1.0 // 抜け(最大34)＋中心(+9)−上り斜面(急なほど減点)＋下る眺め(最大+6)
      if (score > bestScore) { bestScore = score; best = yaw }
    }
    return best
  }
  active.cloudWalk = cloudWalkInfo // 雲上の回遊群島（着地判定/歩行ネットワーク）。townのみ非null

  const startT = performance.now() // THREE.Clock は非推奨→performance.now 差分で経過秒を出す（警告解消・依存削減）
  let lastT = 0
  let lastDraw = -1
  const TMP_DIR = new THREE.Vector3(), TMP_UP2 = new THREE.Vector3() // 引いたカメラのバンク計算用（毎フレーム確保しない）
  const TMP_LOOK = new THREE.Vector3() // 窓ビューの注視点（毎フレーム確保せず使い回す＝GCヒッチを生まない）

  // ── 窓枠のHTMLオーバーレイ（最前景のサッシ＋横桟＋窓台＋ガラスの映り込み＋紙目）──
  // frame() から参照するので先に生成する。あける／乗り出すで毎フレーム動かす。
  // 大気のトーン（空のほのかな光のにじみ＋周辺減光）＝シネマ調の奥行きで低ポリを格上げ。
  const atmo = document.createElement('div')
  atmo.className = 'town3d-atmo'
  stage.appendChild(atmo)
  // 情景の光で全体を一枚の空気に統一する淡いウォッシュ（局所色＝緑の木/灰の道/赤い看板を一つの光へまとめる）
  const wash = document.createElement('div')
  wash.className = 'town3d-wash'
  stage.appendChild(wash)
  const paper = document.createElement('div')
  paper.className = 'town3d-paper'
  stage.appendChild(paper)
  // 画面全体に重ねる層は、端末の実解像度ぶんの塗り仕事が層の数だけ増える（iPhoneの発熱の最大項）。
  // 効きの小さい「紙目2層め」と「縁のにじみ」は既定で作らない＝5層→3層。?fullcss=1 で従来の5層に完全復元できる（非破壊）。
  const FULLCSS = /[?&]fullcss=1/.test(location.search)
  let paper2 = null, bleed = null
  if (FULLCSS) {
    paper2 = document.createElement('div'); paper2.className = 'town3d-paper2'; stage.appendChild(paper2) // 紙目2層め（粗いにじみ）
    bleed = document.createElement('div'); bleed.className = 'town3d-bleed'; stage.appendChild(bleed) // 縁のにじみ（一枚の絵として縁取る）
  }
  const glass = document.createElement('div'); glass.className = 'town3d-glass'; stage.appendChild(glass)
  const cross = document.createElement('div'); cross.className = 'town3d-cross'; stage.appendChild(cross)
  const sill = document.createElement('div'); sill.className = 'town3d-sill'; stage.appendChild(sill)
  const frame2 = document.createElement('div')
  frame2.className = 'town3d-frame'
  stage.appendChild(frame2)
  // ── 初見の操作ヒント（着地して歩き出す時に、左=歩く/右=見まわす を左右に出してそっと消える）。──
  // 操作が分かりにくい（スティックは触れるまで出ない）ので、初回の数秒だけ案内。触れたら即消える。フレームより前に宣言（TDZ回避）。
  const ctrlHint = document.createElement('div')
  ctrlHint.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:7;opacity:0;transition:opacity .9s ease'
  stage.appendChild(ctrlHint)
  const HINT_CSS = 'font:600 13px/1.5 system-ui,-apple-system,sans-serif;color:rgba(255,255,255,.95);text-shadow:0 1px 5px rgba(0,0,0,.55);text-align:center'
  const HINT_WALK = `<div style="position:absolute;left:8%;bottom:22%;${HINT_CSS}">◉<br><span style="font-weight:500">左で歩く</span></div>` +
    `<div style="position:absolute;right:8%;bottom:22%;${HINT_CSS}">⟲<br><span style="font-weight:500">右で見まわす</span></div>`
  const HINT_FLY = `<div style="position:absolute;left:0;right:0;bottom:21%;${HINT_CSS};text-align:center">指でドラッグして空をすすむ<br><span style="font-weight:500">「すすむ／とまる」で巡航・自動で前へ</span><br><span style="font-weight:400;opacity:.8;font-size:.92em">高く昇れば雲海へ　海の向こうには、遠い季節の街が</span></div>`
  let ctrlHintT = 0
  const showCtrlHint = (kind) => { ctrlHint.innerHTML = kind === 'fly' ? HINT_FLY : HINT_WALK; ctrlHint.style.opacity = '1'; ctrlHintT = 5 } // 5秒後にそっと消える
  const hideCtrlHint = () => { if (ctrlHintT > 0) { ctrlHintT = 0; ctrlHint.style.opacity = '0' } } // 触れたら即消える
  // 室内の薄暗がり（周辺減光）。巨大box-shadowブラーは毎フレームの合成が重い→静的なradial-gradientの
  // 不透明度だけを動かす（合成が軽い＝端末が重くならない）。部屋の中ほど濃く、窓を開け/乗り出すと晴れる。
  const roomVig = document.createElement('div'); roomVig.className = 'town3d-roomvig'; stage.appendChild(roomVig)
  let clarityCur = -1
  let roomDarkCur = -1 // 室内の周辺減光の現在値（変化時だけ box-shadow を書き換える）
  let roomMatCur = -1  // 3Dの室内窓枠の不透明度の現在値（変化時だけマテリアルへ反映）
  // ── 設定（明るさ・描き込み品質）をtown3dに反映する（従来は設定が3Dに全く効かなかった＝UX評価の最重要指摘）。 ──
  // 明るさ: stageのCSSフィルタの brightness に、窓あけclarityの明るさ×ユーザ明るさを合成。描き込み: pixelRatioを即変更。
  let userBright = opts.brightness || 1
  function applyStageFilter() {
    const c = clarityCur < 0 ? 0 : clarityCur
    // 水彩グレードはここ一本に統一（canvas側の二つ目のfilterは廃止）。二重がけ時より sepia/brightness を控えめにし、
    // 澄んだ青空が黄ばむのを解消（評価アート指摘）。canvasの暖色/明度のひと匙ぶんだけ僅かに足して水彩味は保つ。
    const b = (lerp(1.04, 1.07, c) * userBright).toFixed(3)
    stage.style.filter =
      `saturate(${lerp(0.88, 0.99, c).toFixed(3)}) sepia(${lerp(0.05, 0.025, c).toFixed(3)}) brightness(${b}) contrast(0.985)`
  }
  applyStageFilter() // 起動時のユーザ明るさを即反映
  active.setBrightness = (b) => { userBright = b || 1; applyStageFilter() }
  active.setQuality = (q) => { // 描き込み変更で解像度＋灯りのブルームを即反映（影/密度は次の情景読み込みでフル反映）
    const cap = q === 'light' ? 1.2 : q === 'soft' ? 2 : 1.6 // PR_CAP(起動時)と同値に統一（標準1.6=鮮明さ優先）
    qCap = cap; prFly = false; curQual = q
    curPR = Math.min(window.devicePixelRatio || 1, cap)
    if (bloomPass) bloomPass.enabled = bloomWanted && q !== 'light' // 軽やかでは後処理ブルームも切る＝解像度に加えGPU負荷を一段下げる（眺め時の発熱対策）
    // 軽量端末では全画面の合成レイヤー(soft-light×3)を畳む＝iOSコンポジタの毎フレ合成負荷を下げる（DPRを下げても相殺されるのを防ぐ）。
    // standard以上は水彩グレードを完全維持（鮮明さ優先）。紙目(paper=乗算1枚)だけは残し手触りを保つ。
    stage.classList.toggle('town3d-stage--light', q === 'light')
    applySize() // pixelRatio＋size＋aspect をまとめて更新
  }
  stage.classList.toggle('town3d-stage--light', QUAL === 'light') // 起動時の品質を即反映（軽量端末は軽い合成で始める）
  active.setStay = (v) => { drift.stay = !!v } // 「時間をとどめる」：日の傾きのドリフトを今の時刻で凍結／解除

  // ════════════════════════════════════════════════════════════════════════
  // 「いつもと違う光景」定期イベント（ぼーっと眺めていると時々おきる小さな驚き）。
  // 多重タイムスケール: 頻繁な小イベント〜まれな大当たり（雨上がりの虹・夜の花火）。数値で調整可。
  // 各イベントは scene にメッシュを足し、寿命が尽きたら自分で取り除く（静的影は焼き済み＝影に不参加）。
  // ════════════════════════════════════════════════════════════════════════
  const fxList = []
  const addFx = (fx) => { fx.age = 0; fxList.push(fx) }
  // 材質＋そのテクスチャ(map等)を破棄。gradientMap(grad)は全トゥーン材で共有なので絶対に破棄しない。
  // 注: イベントの map/alphaMap/emissiveMap はイベント固有(共有しない)＝破棄して安全＝GPUメモリのリークを防ぐ。
  const disposeMat = (m) => { if (!m) return; for (const k of ['map', 'alphaMap', 'emissiveMap']) { const t = m[k]; if (t && t !== grad) t.dispose() } m.dispose() }
  const disposeObj = (o) => o.traverse((c) => {
    if (c.geometry) c.geometry.dispose()
    const m = c.material; if (m) { Array.isArray(m) ? m.forEach(disposeMat) : disposeMat(m) }
  })
  const delayFx = (sec, fn) => addFx({ update: (age) => { if (age >= sec) { fn(); return false } return true }, cleanup: () => {} }) // sec秒後に1回実行
  function updateFx(dt) {
    for (let i = fxList.length - 1; i >= 0; i--) {
      const fx = fxList[i]; fx.age += dt
      let keep = true
      try { keep = fx.update(fx.age, dt) !== false } catch (e) { keep = false }
      if (!keep) { try { fx.cleanup() } catch (e) { /* 無視 */ } fxList.splice(i, 1) }
    }
  }
  let rainActive = false // 雨は重複させない

  // ── 天候・催しの発生中心（アンカー）。窓辺では原点＝従来どおり。飛行/歩行中は“自分”の位置と向きを中心に。
  //    これで雨や鳥・気球・花火などが、home だけでなく移動できる範囲のどこでも自分の周りで起きる。──
  const EYEY = eye.y
  const evAnchor = () => (active && active.mode !== 'window' && (active.flyP || 0) > 0.2)
    ? { x: active.flyPos.x, y: active.flyPos.y, z: active.flyPos.z, yaw: active.flyYaw || 0, fly: true }
    : { x: 0, y: 0, z: 0, yaw: 0, fly: false }
  // ローカル(右+x・上+y・前-z)を、アンカーの位置と向きへ回してワールド座標に。飛行中は高さを自分基準へ寄せる。
  const evPos = (lx, ly, lz, a) => { const c = Math.cos(a.yaw), s = Math.sin(a.yaw); return [a.x + lx * c - lz * s, (a.fly ? a.y - EYEY : 0) + ly, a.z + lx * s + lz * c] }

  // ── 雨が通り過ぎる（晴れでも一時的に降ってやむ）。奥が少しけむり、雨上がりに虹を呼ぶ ──
  function evRain(dur = 30) {
    if (rainActive) return
    rainActive = true
    const N = 520, len = 2.6 // 雨脚の長さ。点でなく短い“筋”にして雨らしく（風で少し斜め）
    const pos = new Float32Array(N * 2 * 3) // 各雨脚＝2頂点（上端・下端）
    const head = new Float32Array(N * 3); const spd = new Float32Array(N)
    for (let i = 0; i < N; i++) { head[i * 3] = (R() - 0.5) * 210; head[i * 3 + 1] = R() * 95; head[i * 3 + 2] = -130 + R() * 190; spd[i] = 32 * (0.7 + R() * 0.6) }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.LineBasicMaterial({ color: 0xc4d4e2, transparent: true, opacity: 0, fog: true, depthWrite: false })
    const seg = new THREE.LineSegments(geo, mat); seg.frustumCulled = false; scene.add(seg)
    // ax/ay/az＝雨の塊の中心。飛行中は“自分”を中心に追従し、海でも他時代の上空でも雨に包まれる。
    const writeSeg = (ax, ay, az) => { for (let i = 0; i < N; i++) { const h = i * 3, p = i * 6; pos[p] = head[h] + ax; pos[p + 1] = head[h + 1] + ay; pos[p + 2] = head[h + 2] + az; pos[p + 3] = head[h] + ax + 0.6; pos[p + 4] = head[h + 1] + ay - len; pos[p + 5] = head[h + 2] + az } }
    const fogFar0 = scene.fog.far
    let rbDone = false
    addFx({
      update: (age, dt) => {
        const k = Math.min(1, age / 5) * Math.min(1, Math.max(0, (dur - age) / 8)) // 立ち上がり5s・終い8s
        mat.opacity = 0.6 * k
        scene.fog.far = fogFar0 * (1 - 0.16 * k) // 雨で奥がけむる
        for (let i = 0; i < N; i++) { head[i * 3 + 1] -= spd[i] * dt; head[i * 3] += 4 * dt; if (head[i * 3 + 1] < -14) { head[i * 3 + 1] = 82 + R() * 16; head[i * 3] = (R() - 0.5) * 210 } }
        const a = evAnchor(); writeSeg(a.x, a.fly ? a.y - 47 : 0, a.z); geo.attributes.position.needsUpdate = true
        if (!rbDone && age >= dur - 7) { rbDone = true; evRainbow(); evWetRoad() } // 雨上がりに虹＋濡れた路面のきらめき
        if (age >= dur) { rainActive = false; scene.fog.far = fogFar0; return false }
        return true
      },
      cleanup: () => { scene.remove(seg); geo.dispose(); mat.dispose(); scene.fog.far = fogFar0; rainActive = false },
    })
  }

  // ── 雨上がりの虹（半円アーチ。赤(外)→紫(内)を計算で。淡くフェードイン/アウト） ──
  function evRainbow() {
    // 主虹＋淡い副虹（色反転・外側）。白を多めに混ぜ、帯の縁をやわらかくして“水彩のにじみ”に＝CG臭を消す。
    const grp = new THREE.Group()
    const a = evAnchor(); const [gx, gy, gz] = evPos(0, -16, eye.z - 195, a); grp.position.set(gx, gy, gz); grp.rotation.y = -a.yaw // 街の奥・地平から立ち上がる大アーチ（飛行中は進む先の正面へ。手前に建物があれば下部が隠れる。fog:false）
    const mats = []
    const makeBow = (inner, outer, reversed, opScale) => {
      const geo = new THREE.RingGeometry(inner, outer, 120, 1, 0, Math.PI)
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
        uniforms: { uOp: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer }, uRev: { value: reversed ? 1 : 0 }, uScale: { value: opScale } },
        vertexShader: 'varying float vR; void main(){ vR=length(position.xy); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
        fragmentShader: 'varying float vR; uniform float uOp,uInner,uOuter,uRev,uScale;' +
          'vec3 hsv(float h){ vec3 p=abs(fract(h+vec3(0.,2./3.,1./3.))*6.-3.); return clamp(p-1.,0.,1.); }' +
          'void main(){ float rr=(vR-uInner)/(uOuter-uInner);' +
          'float h=mix(0.78,0.0,rr); if(uRev>0.5) h=mix(0.0,0.78,rr);' +          // 主虹:外赤内紫 / 副虹:反転
          'vec3 col=mix(vec3(1.0),hsv(h),0.58);' +                                // 白を多めに＝水彩の空気感
          'float edge=smoothstep(0.0,0.22,rr)*(1.0-smoothstep(0.78,1.0,rr));' +   // 帯の縁をやわらかく溶かす
          'gl_FragColor=vec4(col, edge*uOp*uScale); }',
      })
      const ring = new THREE.Mesh(geo, mat); ring.frustumCulled = false; grp.add(ring); mats.push(mat)
    }
    makeBow(80, 103, false, 1.0)   // 主虹
    makeBow(112, 131, true, 0.28)  // 副虹（外側・色反転・ごく淡い）
    scene.add(grp)
    const dur = 46
    addFx({
      update: (age) => { const env = 0.62 * Math.min(1, age / 7) * Math.min(1, Math.max(0, (dur - age) / 17)); for (const m of mats) m.uniforms.uOp.value = env; return age < dur },
      cleanup: () => { scene.remove(grp); disposeObj(grp) },
    })
  }

  // ── 渡り鳥の群れ（はばたきながら横切る） ──
  // 造形は道連れと同じ共用かもめ（以前は胴のない羽2枚＝浮かぶ板だった）。
  function evBirdFlock() {
    const g = new THREE.Group()
    const n = 13 + ((R() * 8) | 0); const sub = []
    for (let i = 0; i < n; i++) {
      const b = makeGullBird(1.25, isNight)
      Object.assign(b.userData, { ph: R() * 6.28, rk: Math.ceil(i / 2), sd: i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) }); g.add(b); sub.push(b)
    }
    const dir = R() < 0.5 ? 1 : -1
    // V字編隊: 先頭1羽、後方(dirの逆)へ左右(z)に開く。縦窓は横画角が狭いので枠外から入れて確実に横切らせる。
    for (const b of sub) { b.position.set(-dir * b.userData.rk * 1.7 + (R() - 0.5) * 0.5, (R() - 0.5) * 1.2, b.userData.sd * b.userData.rk * 1.5 + (R() - 0.5) * 0.5); b.rotation.y = dir * Math.PI / 2 } // かもめ(+z向き)を進行方向(ローカル±x)へ
    const a = evAnchor(); g.rotation.y = -a.yaw // 飛行中は進む先を横切らせる
    let lx = dir > 0 ? -46 : 46; const ly = 46 + R() * 18, lz = -38 - R() * 26 // 空を背に飛ばす（山に紛れず映える）
    const setPos = (bob) => { const [wx, wy, wz] = evPos(lx, ly + bob, lz, a); g.position.set(wx, wy, wz) }
    setPos(0); scene.add(g)
    addFx({
      update: (age, dt) => { lx += dir * 10 * dt; setPos(Math.sin(age * 0.5) * 0.7); for (const b of sub) { const f = Math.sin(age * 9 + b.userData.ph) * 0.5; for (const w of b.userData.wings) w.rotation.z = w.userData.side * f } return Math.abs(lx) < 50 },
      cleanup: () => { scene.remove(g) }, // かもめのジオメトリ/材質は全鳥で共有＝disposeしない（道連れ・渡りが使い続ける）
    })
    return g // 検証用（__town3dBirdFlockが現在位置を追える）。通常のイベント発火では未使用
  }

  // ── 気球がふわりと横切る（昼） ──
  function evBalloon() {
    const g = new THREE.Group()
    const hues = [0xc07a68, 0x6a8db5, 0x82a878, 0xcdb074, 0x9a82b0] // 街のくすみパレットに寄せた中間色
    const env = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 12), toon(hues[(R() * hues.length) | 0])); env.scale.y = 1.25; env.position.y = 5; g.add(env)
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), toon(0x6a4a2a)))
    // 籠から気球へ伸びる細いゴンドラロープ（低コストで本物感）
    g.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.6, 0.5, -0.6, -1.5, 2.7, -1.5, 0.6, 0.5, -0.6, 1.5, 2.7, -1.5, -0.6, 0.5, 0.6, -1.5, 2.7, 1.5, 0.6, 0.5, 0.6, 1.5, 2.7, 1.5]), 3)),
      new THREE.LineBasicMaterial({ color: 0x4a3a28, fog: true }),
    ))
    const dir = R() < 0.5 ? 1 : -1
    // 縦長の窓は横画角が狭いので、見える幅の少し外から入れてゆっくり横断させる
    const a = evAnchor(); g.rotation.y = -a.yaw // 飛行中は進む先を横切らせる
    let lx = dir > 0 ? -44 : 44, ly = 26 + R() * 16; const lz = -48 - R() * 22
    const setP = () => { const [wx, wy, wz] = evPos(lx, ly, lz, a); g.position.set(wx, wy, wz) }
    setP(); scene.add(g)
    addFx({
      update: (age, dt) => { lx += dir * 5 * dt; ly += 0.22 * dt; setP(); g.rotation.z = Math.sin(age * 0.5) * 0.05; return Math.abs(lx) < 48 },
      cleanup: () => { scene.remove(g); disposeObj(g) },
    })
  }

  // ── 流れ星（夜・ひと筋の光が尾を引いて流れる） ──
  function evShootingStar() {
    const g = new THREE.Group()
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfffbe0, fog: false, transparent: true })
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), headMat))
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 16, 8, 0]), 3)) // 速度の逆向き＝後方へ伸びる尾
    const trailMat = new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, fog: false })
    g.add(new THREE.Line(tg, trailMat))
    const a = evAnchor(); g.rotation.y = -a.yaw // 飛行中は自分の上空に流す
    let lx = 40 + R() * 40, ly = 72 + R() * 18; const lz = -90 - R() * 30
    const setP = () => { const [wx, wy, wz] = evPos(lx, ly, lz, a); g.position.set(wx, wy, wz) }
    setP(); scene.add(g)
    const vx = -33 - R() * 12, vy = -16 - R() * 7, dur = 2.4 // ゆったり長く流れて見逃さない
    addFx({
      update: (age, dt) => { lx += vx * dt; ly += vy * dt; setP(); const o = Math.min(1, age / 0.25) * Math.max(0, 1 - age / dur); headMat.opacity = o; trailMat.opacity = o * 0.85; return age < dur },
      cleanup: () => { scene.remove(g); disposeObj(g) },
    })
  }
  // たまに2〜3個が時間差で流れる＝流星群の趣（夜の頻繁バンドから呼ぶ）
  function evShootingStars() { evShootingStar(); if (R() < 0.5) delayFx(0.5 + R() * 0.7, evShootingStar); if (R() < 0.25) delayFx(1.3 + R() * 0.9, evShootingStar) }

  // ── 花火（夜・連発。色玉が開いて重力で散り、消える） ──
  function evFireworks() {
    const live = []; let bursts = 0, nextBurst = 0
    const mkBurst = () => {
      const N = 92, pos = new Float32Array(N * 3), vel = []
      const a = evAnchor(); const [cx, cy, cz] = evPos((R() - 0.5) * 60, 56 + R() * 18, -70 - R() * 30, a) // 飛行中は自分の上空に開く
      for (let i = 0; i < N; i++) { pos[i * 3] = cx; pos[i * 3 + 1] = cy; pos[i * 3 + 2] = cz; const th = R() * 6.28, ph = Math.acos(2 * R() - 1), sp = 11 + R() * 7; vel.push([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp]) }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.PointsMaterial({ color: new THREE.Color().setHSL(R(), 0.78, 0.66).getHex(), size: 1.5, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true })
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts)
      live.push({ pts, geo, mat, pos, vel, N, age: 0 })
      // 開花の“芯”＝中心の白い大玉を一瞬だけ強く（パッと開く手応え）
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([cx, cy, cz]), 3))
      const fm = new THREE.PointsMaterial({ color: 0xfff6e8, size: 7, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true })
      const fp = new THREE.Points(fg, fm); fp.frustumCulled = false; scene.add(fp)
      live.push({ pts: fp, geo: fg, mat: fm, N: 0, age: 0, flash: true })
    }
    const dur = 10
    addFx({
      update: (age, dt) => {
        nextBurst -= dt
        if (bursts < 4 && nextBurst <= 0) { mkBurst(); bursts++; nextBurst = 1.0 + R() * 1.3 }
        for (let b = live.length - 1; b >= 0; b--) {
          const B = live[b]; B.age += dt
          if (B.flash) { B.mat.opacity = Math.max(0, 1 - B.age / 0.4); if (B.age > 0.4) { scene.remove(B.pts); B.geo.dispose(); B.mat.dispose(); live.splice(b, 1) } continue }
          for (let i = 0; i < B.N; i++) { B.vel[i][1] -= 9 * dt; B.pos[i * 3] += B.vel[i][0] * dt; B.pos[i * 3 + 1] += B.vel[i][1] * dt; B.pos[i * 3 + 2] += B.vel[i][2] * dt }
          B.geo.attributes.position.needsUpdate = true; B.mat.opacity = Math.max(0, 1 - B.age / 2.5)
          if (B.age > 2.5) { scene.remove(B.pts); B.geo.dispose(); B.mat.dispose(); live.splice(b, 1) }
        }
        return age < dur || live.length > 0
      },
      cleanup: () => { for (const B of live) { scene.remove(B.pts); B.geo.dispose(); B.mat.dispose() } },
    })
  }

  // ── 花火大会のフィナーレ（波状に次々と開く＝夜のまれな大当たり） ──
  function evFireworksFinale() { evFireworks(); const waves = 5 + ((R() * 3) | 0); for (let i = 1; i < waves; i++) delayFx(i * (1.5 + R() * 1.3), evFireworks) }

  // ── 通り過ぎるもや（朝もや/宵のもや）。やわらかな靄のひとひらがゆっくり流れ、視界が淡く霞んでまた晴れる＝静かに整う空気。──
  function evMist() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(246,246,242,0.5)'); gr.addColorStop(0.5, 'rgba(240,240,236,0.2)'); gr.addColorStop(1, 'rgba(240,240,236,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const mtex = new THREE.CanvasTexture(c)
    const tint = isNight ? 0xb8c2cc : 0xf2f0ea // 夜は青白く・昼は乳白
    const wisps = []
    for (let i = 0; i < (LIGHT ? 8 : 14); i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mtex, color: tint, transparent: true, opacity: 0, depthWrite: false, fog: false })) // 前景のひとひらは霧で消さず際立たせる
      const sc = 30 + R() * 32; sp.scale.set(sc, sc * (0.42 + R() * 0.2), 1)
      sp.userData = { lx: (R() - 0.5) * 90, ly: 1.5 + R() * 16, lz: -6 - R() * 66, drift: (0.5 + R() * 0.7) * (R() < 0.5 ? 1 : -1), ph: R() * 6.28, op: 0.4 + R() * 0.2 }
      sp.frustumCulled = false; sp.renderOrder = 1; scene.add(sp); wisps.push(sp)
    }
    const dur = 54, fogN0 = scene.fog.near, fogF0 = scene.fog.far // 霧を一時的に濃く＝距離が淡く霞む（evRainと同じ絶対値方式で安全）
    addFx({
      update: (age, dt) => {
        const k = Math.min(1, age / 11) * Math.min(1, Math.max(0, (dur - age) / 17)) // ゆっくり立ち上がり/引き＝じわっと霞んでまた晴れる
        scene.fog.near = fogN0 * (1 - 0.5 * k); scene.fog.far = fogF0 * (1 - 0.4 * k)
        const a = evAnchor()
        for (const sp of wisps) { const u = sp.userData; u.lx += u.drift * dt * 2.0; if (u.lx > 64) u.lx -= 128; else if (u.lx < -64) u.lx += 128
          const [wx, wy, wz] = evPos(u.lx, u.ly + Math.sin(age * 0.28 + u.ph) * 0.7, u.lz, a); sp.position.set(wx, wy, wz); sp.material.opacity = u.op * k }
        if (age >= dur) { scene.fog.near = fogN0; scene.fog.far = fogF0; return false }
        return true
      },
      cleanup: () => { scene.fog.near = fogN0; scene.fog.far = fogF0; for (const sp of wisps) { scene.remove(sp); sp.material.dispose() } mtex.dispose() },
    })
  }

  // ── 天使の梯子（雲間から差す光芒）。やわらかな淡い光の帯が太陽の方角の空から降りる＝静かに整う特別な空。昼/夕のみ。 ──
  function evGodRays() {
    const grp = new THREE.Group(), mats = []
    const sh = new THREE.Vector3(sun.position.x, 0, sun.position.z).normalize() // 太陽の水平方向（光芒はこの方角の空に立つ）
    // 縦帯テクスチャ（横＝中央明るく端ぼかし／縦＝上明るく下フェード）＝光芒のソフトな芯
    const c = document.createElement('canvas'); c.width = 32; c.height = 96; const gx2 = c.getContext('2d')
    for (let y = 0; y < 96; y++) { const top = 1 - y / 96, hg = gx2.createLinearGradient(0, y, 32, y); hg.addColorStop(0, 'rgba(255,244,214,0)'); hg.addColorStop(0.5, `rgba(255,244,214,${(0.35 + 0.4 * top).toFixed(3)})`); hg.addColorStop(1, 'rgba(255,244,214,0)'); gx2.fillStyle = hg; gx2.fillRect(0, y, 32, 1) }
    const tex = new THREE.CanvasTexture(c)
    const N = 6
    for (let i = 0; i < N; i++) { const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); mats.push(m)
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(7 + R() * 3, 92), m); beam.position.x = (i - (N - 1) / 2) * 6.2 + (R() - 0.5) * 2; beam.rotation.z = (i - (N - 1) / 2) * 0.05; grp.add(beam) }
    scene.add(grp)
    const dur = 32, EYEY2 = EYEY
    addFx({
      update: (age) => {
        const env = 0.42 * Math.min(1, age / 8) * Math.min(1, Math.max(0, (dur - age) / 12)) // 淡く立ち上がり/引き（控えめ＝ギラつかせない）
        for (const m of mats) m.opacity = env
        const a = evAnchor(); grp.position.set(a.x, (a.fly ? a.y - EYEY2 : 0) + 46, a.z).addScaledVector(sh, 62) // 太陽の方角の空へ・自分に追従（光芒は地へ降りる）
        const cp = camera.position // 各帯をカメラへ向ける（薄板の面が正面＝光芒に見える）
        for (const beam of grp.children) { beam.getWorldPosition(TMP_DIR); beam.rotation.y = Math.atan2(cp.x - TMP_DIR.x, cp.z - TMP_DIR.z) }
        return age < dur
      },
      cleanup: () => { scene.remove(grp); disposeObj(grp); tex.dispose() },
    })
  }

  // ── 飛行機雲（高空をゆっくり横切り、白い帯が後ろへ伸びていく。日常の“あ、飛行機”の発見） ──
  function evContrail() {
    const dir = R() < 0.5 ? 1 : -1
    const g = new THREE.Group()
    const plane = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 0.5), new THREE.MeshBasicMaterial({ color: isNight ? 0x8a98ac : 0x4a5564, fog: true })) // 空を背に暗い点＝機体が見える
    g.add(plane)
    const MAXP = 130, tpos = new Float32Array(MAXP * 3)
    const tgeo = new THREE.BufferGeometry(); tgeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3))
    const tmat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: true, depthWrite: false })
    g.add(new THREE.Line(tgeo, tmat))
    const a = evAnchor(); g.position.set(a.x, a.fly ? a.y - EYEY : 0, a.z); g.rotation.y = -a.yaw; scene.add(g) // 飛行中は自分の上空を横切る（飛行機雲も自分に追従）
    plane.position.set(dir > 0 ? -48 : 48, 52 + R() * 12, -80 - R() * 32) // 見える高さの空に（高すぎると枠外に出る）
    const pts2 = []; let rec = 0
    addFx({
      update: (age, dt) => {
        plane.position.x += dir * 7 * dt
        rec -= dt
        if (rec <= 0) { rec = 0.12; pts2.push(plane.position.x, plane.position.y, plane.position.z); if (pts2.length > MAXP * 3) pts2.splice(0, 3) }
        for (let i = 0; i < pts2.length; i++) tpos[i] = pts2[i]
        tgeo.setDrawRange(0, pts2.length / 3); tgeo.attributes.position.needsUpdate = true
        tmat.opacity = 0.6 * Math.min(1, age / 3) * Math.min(1, Math.max(0, (16 - age) / 4)) // 伸びて、やがて薄れて消える
        return age < 16 && Math.abs(plane.position.x) < 54
      },
      cleanup: () => { scene.remove(g); disposeObj(g) },
    })
  }

  // ── 雲が陽を横切る翳り（全体がふっと翳って、また明るむ。最も静かな“整う”演出。昼のみ） ──
  let shadeActive = false
  function evCloudShade() {
    if (isNight || shadeActive) return
    shadeActive = true
    const i0 = sun.intensity
    addFx({
      update: (age) => { const k = Math.min(1, age / 3) * Math.min(1, Math.max(0, (10 - age) / 4)); sun.intensity = i0 * (1 - 0.38 * k); return age < 10 },
      cleanup: () => { sun.intensity = i0; shadeActive = false },
    })
  }

  // ── 宵の口（夜・一部の窓が時間差でぽっと明るむ。街に灯りが点っていく気配＝最も“整う”夜の演出） ──
  function evDuskLights() {
    if (!isNight) return
    // 灯る窓のマテリアルを scene から拾い、一部を時間差で明るませる（配列参照を持たず scene 走査で完結）
    const mats = []
    scene.traverse((o) => { const m = o.material; if (m && m.emissiveMap && m.emissiveIntensity > 0.1 && R() < 0.2) mats.push(m) })
    if (!mats.length) return
    const items = mats.map((m) => ({ m, base: m.emissiveIntensity, t0: R() * 6 }))
    const dur = 13
    addFx({
      update: (age) => {
        for (const it of items) { const a = age - it.t0; const k = a <= 0 ? 0 : Math.min(1, a / 1.6) * Math.min(1, Math.max(0, (dur - it.t0 - a) / 3)); it.m.emissiveIntensity = it.base + 0.42 * k }
        return age < dur
      },
      cleanup: () => { for (const it of items) it.m.emissiveIntensity = it.base },
    })
  }

  // ── 雨上がりの濡れた路面のきらめき（通りに空/灯りの照り返しがちらちら。雨の“第三幕”） ──
  function evWetRoad() {
    const N = 90
    const pos = new Float32Array(N * 3); const aph = new Float32Array(N)
    for (let i = 0; i < N; i++) { pos[i * 3] = (R() - 0.5) * 9; pos[i * 3 + 1] = 0.12; pos[i * 3 + 2] = 18 - R() * 112; aph[i] = R() * 6.28 }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aph', new THREE.BufferAttribute(aph, 1))
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uOp: { value: 0 }, uCol: { value: new THREE.Color(isNight ? 0xffd6a0 : 0xcfe4f2) } },
      vertexShader: 'attribute float aph; varying float vtw; uniform float uT; void main(){ vtw=0.35+0.65*(0.5+0.5*sin(uT*2.6+aph)); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=3.2*(60.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vtw; uniform vec3 uCol; uniform float uOp; void main(){ float a=smoothstep(0.5,0.0,length(gl_PointCoord-0.5)); gl_FragColor=vec4(uCol, a*vtw*uOp); }',
    })
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; town.add(pts) // town座標系（街と一緒に動く）
    const dur = 17
    addFx({
      update: (age) => { mat.uniforms.uT.value = age; mat.uniforms.uOp.value = 0.62 * Math.min(1, age / 3) * Math.min(1, Math.max(0, (dur - age) / 6)); return age < dur },
      cleanup: () => { town.remove(pts); geo.dispose(); mat.dispose() },
    })
  }

  // ── 常時の雨（雨の角部屋＝3D化）。降る雨筋＋濡れた路面の反射を常時。weather==='rain'のみ。 ──
  if (weather === 'rain') {
    const N = LIGHT ? 340 : 560, len = 3.3 // 雨脚＝筋（風で少し斜め）。端末性能に合わせ密度を落とす（実機FB: 雨が重い→画質崩壊の連鎖を断つ）。歩く雨の手応えは保つ
    const pos = new Float32Array(N * 2 * 3)
    const head = new Float32Array(N * 3); const spd = new Float32Array(N)
    for (let i = 0; i < N; i++) { head[i * 3] = (R() - 0.5) * 150; head[i * 3 + 1] = R() * 92; head[i * 3 + 2] = -100 + R() * 150; spd[i] = 34 * (0.7 + R() * 0.6) } // 範囲を絞って密度を上げる
    const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const rmat = new THREE.LineBasicMaterial({ color: 0xc8d6e4, transparent: true, opacity: 0.6, fog: true, depthWrite: false })
    const rseg = new THREE.LineSegments(rgeo, rmat); rseg.frustumCulled = false; scene.add(rseg)
    scene.fog.far *= 0.88 // 雨で奥がけむる
    // 雲海より上に出ると雨がやむ＝雲の上は晴れ。雲の層(基準面SEA_Y=88・雲頂~110)を抜ける高度帯でやわらかく消える。
    // 下界(y≦76)では満雨、雲を抜けた島の高さ(y≧108)で晴れ。窓辺/地上(非飛行)では常に降る。
    function rainAlt(a) { if (!a.fly) return 1; const t = Math.max(0, Math.min(1, (SEA_Y + 20 - a.y) / 32)); return t * t * (3 - 2 * t) }
    addFx({
      update: (age, dt) => {
        for (let i = 0; i < N; i++) { head[i * 3 + 1] -= spd[i] * dt; head[i * 3] += 4 * dt; if (head[i * 3 + 1] < -14) { head[i * 3 + 1] = 80 + R() * 16; head[i * 3] = (R() - 0.5) * 150 } }
        const a = evAnchor(), ax = a.x, ay = a.fly ? a.y - 47 : 0, az = a.z // 飛行/歩行中は“自分”を中心に雨が追従
        const ra = rainAlt(a); rmat.opacity = 0.6 * ra; rseg.visible = ra > 0.01 // 雲海の上＝雨脚を消す
        for (let i = 0; i < N; i++) { const h = i * 3, p = i * 6; pos[p] = head[h] + ax; pos[p + 1] = head[h + 1] + ay; pos[p + 2] = head[h + 2] + az; pos[p + 3] = head[h] + ax + 0.6; pos[p + 4] = head[h + 1] + ay - len; pos[p + 5] = head[h + 2] + az }
        rgeo.attributes.position.needsUpdate = true; return true
      },
      cleanup: () => { scene.remove(rseg); rgeo.dispose(); rmat.dispose() },
    })
    // 濡れた路面のきらめき（街あかりを照り返す）。自機の足元の周りに広がり、歩く所が濡れて光る＝雨の路地。
    const M = LIGHT ? 90 : 150
    const wloc = new Float32Array(M * 2) // ローカルのばらまき(x,z)＝自機を中心に追従
    const wpos = new Float32Array(M * 3); const waph = new Float32Array(M)
    for (let i = 0; i < M; i++) { wloc[i * 2] = (R() - 0.5) * 30; wloc[i * 2 + 1] = (R() - 0.5) * 34; wpos[i * 3 + 1] = 0.12; waph[i] = R() * 6.28 }
    const wgeo = new THREE.BufferGeometry(); wgeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3)); wgeo.setAttribute('aph', new THREE.BufferAttribute(waph, 1))
    const wmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uOp: { value: 0.5 }, uCol: { value: new THREE.Color(isNight ? 0xffd6a0 : 0xcfe4f2) } },
      vertexShader: 'attribute float aph; varying float vtw; uniform float uT; void main(){ vtw=0.35+0.65*(0.5+0.5*sin(uT*2.6+aph)); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=3.4*(60.0/max(1.0,-mv.z)); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying float vtw; uniform vec3 uCol; uniform float uOp; void main(){ float a=smoothstep(0.5,0.0,length(gl_PointCoord-0.5)); gl_FragColor=vec4(uCol, a*vtw*uOp); }',
    })
    const wpts = new THREE.Points(wgeo, wmat); wpts.frustumCulled = false; scene.add(wpts)
    let wLastX = 1e9, wLastZ = 1e9 // 直近に地形をサンプルした自機位置（停止中は再計算しない）
    addFx({ update: (age) => { wmat.uniforms.uT.value = age
      const a = evAnchor(); const ra = rainAlt(a); wmat.uniforms.uOp.value = 0.5 * ra; wpts.visible = ra > 0.01 // 雲海の上＝濡れた路面のきらめきも消す
      // 自機がほぼ動いていない（眺めている）間は heightAt(M回/フレーム)を省く＝雨の最大のCPU負荷を断つ。瞬きはシェーダ側のuTで続くので静止でもきらめく。
      if (Math.abs(a.x - wLastX) + Math.abs(a.z - wLastZ) > 1.2) {
        wLastX = a.x; wLastZ = a.z
        for (let i = 0; i < M; i++) { const wx = a.x + wloc[i * 2], wz = a.z + wloc[i * 2 + 1]; wpos[i * 3] = wx; wpos[i * 3 + 1] = heightAt(wx, wz) + 0.12; wpos[i * 3 + 2] = wz }
        wgeo.attributes.position.needsUpdate = true
      }
      return true
    }, cleanup: () => { scene.remove(wpts); wgeo.dispose(); wmat.dispose() } })
    // 雨の波紋（地面に当たって広がる輪＝歩く雨の足元の生命感）。自機の近くにぽつぽつ生まれ、広がって消える。
    const RIP = 16, rips = []
    for (let i = 0; i < RIP; i++) { const rg = new THREE.RingGeometry(0.42, 0.5, 16); rg.rotateX(-Math.PI / 2); const rm = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: isNight ? 0xc8dcec : 0xd6e4ee, transparent: true, opacity: 0, depthWrite: false, fog: true })); rm.visible = false; rm.userData = { t: R() * 1.6, life: 0 }; scene.add(rm); rips.push(rm) }
    addFx({ update: (age, dt) => {
      const a = evAnchor(); const ra = rainAlt(a) // 雲海の上＝波紋を生まない（既に広がり中の輪は寿命まで残す）
      for (const rm of rips) { const u = rm.userData; u.t -= dt
        if (u.t <= 0) { if (ra > 0.35) { const wx = a.x + (R() - 0.5) * 24, wz = a.z + (R() - 0.5) * 26; rm.position.set(wx, heightAt(wx, wz) + 0.06, wz); rm.scale.setScalar(0.25); rm.material.opacity = 0.5 * ra; rm.visible = true; u.life = 0 } u.t = 0.7 + R() * 1.3 }
        if (rm.visible) { u.life += dt; const f = u.life / 0.7; if (f >= 1) rm.visible = false; else { rm.scale.setScalar(0.25 + f * 1.5); rm.material.opacity = (1 - f) * 0.5 } }
      }
      return true
    }, cleanup: () => { for (const rm of rips) { scene.remove(rm); rm.geometry.dispose(); rm.material.dispose() } } })
  }

  // ── オーロラ（夜の超レア大当たり。緑〜紫のカーテンが空に揺らめき流れる。計算で描画） ──
  function evAurora() {
    const geo = new THREE.PlaneGeometry(340, 96)
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uOp: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader:
        'varying vec2 vUv; uniform float uT,uOp;' +
        'void main(){ float x=vUv.x, y=vUv.y; float t=uT*0.12; float curt=0.0;' +
        'for(int i=0;i<3;i++){ float fi=float(i); float ph=x*(7.0+fi*5.0)+t*(1.0+fi*0.5)+fi*2.1; curt+=(sin(ph)*0.5+0.5)*(0.5-fi*0.12); }' +
        'curt/=1.4; float ray=pow(curt,1.4);' +              // 縦のカーテン状の濃淡が横に流れる
        'float vfall=smoothstep(1.0,0.12,y)*smoothstep(0.0,0.18,y);' + // 上下端へやわらかく消える
        'vec3 green=vec3(0.30,1.0,0.55), violet=vec3(0.66,0.34,1.0);' +
        'vec3 col=mix(green,violet,smoothstep(0.30,0.95,y));' +        // 色はフルに保ち、濃淡はアルファで（加算でも色が出る）
        'gl_FragColor=vec4(col, ray*vfall*uOp); }',
    })
    const m = new THREE.Mesh(geo, mat); const a = evAnchor(); const [mx, my, mz] = evPos(0, 74, eye.z - 205, a); m.position.set(mx, my, mz); m.rotation.y = -a.yaw; m.frustumCulled = false; scene.add(m) // 飛行中は自分の進む先の空に懸かる
    const dur = 56
    addFx({
      update: (age) => { mat.uniforms.uT.value = age; mat.uniforms.uOp.value = 1.08 * Math.min(1, age / 10) * Math.min(1, Math.max(0, (dur - age) / 16)); return age < dur },
      cleanup: () => { scene.remove(m); geo.dispose(); mat.dispose() },
    })
  }

  // ── 季節の風物詩（春＝桜吹雪／秋＝落ち葉の舞い／冬＝粉雪の渦）。風がスッと吹き、舞い散ってまた静まる。夏は無し（夕立→虹がある）。Pointsで1ドロー。──
  function evSeasonalDrift() {
    const cfg = season === 'spring' ? { col: 0xf2c0d4, sz: 0.52, n: 140, fall: 1.1 }
      : season === 'autumn' ? { col: 0xcf7a30, sz: 0.6, n: 110, fall: 1.5 }
        : season === 'winter' ? { col: 0xeef2f8, sz: 0.34, n: 170, fall: 0.85 }
          : null
    if (!cfg) return
    const N = LIGHT ? Math.floor(cfg.n * 0.6) : cfg.n
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), seed = new Array(N)
    for (let i = 0; i < N; i++) { const lx = (R() - 0.5) * 72, ly = 2 + R() * 26, lz = -4 - R() * 60; pos[i * 3] = lx; pos[i * 3 + 1] = ly; pos[i * 3 + 2] = lz; seed[i] = { lx, ly, lz, ph: R() * 6.28, sp: 0.7 + R() * 0.8, sw: 0.6 + R() * 1.2 } }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ color: cfg.col, size: cfg.sz, transparent: true, opacity: 0, depthWrite: false, fog: true, sizeAttenuation: true })
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2; scene.add(pts)
    const dur = 26, wind = (R() < 0.5 ? 1 : -1) * (2.2 + R() * 1.0), peak = season === 'winter' ? 0.85 : 0.78
    addFx({
      update: (age, dt) => {
        const k = Math.min(1, age / 5) * Math.min(1, Math.max(0, (dur - age) / 7)) // 吹いて→静まる
        mat.opacity = peak * k
        const a = evAnchor(), c = Math.cos(a.yaw), s = Math.sin(a.yaw), ay = a.fly ? a.y - EYEY : 0, pa = geo.attributes.position
        for (let i = 0; i < N; i++) { const sd = seed[i]
          sd.lx += (wind + Math.sin(age * 0.6 + sd.ph) * sd.sw) * dt // 風＋渦の横揺れ
          sd.ly -= cfg.fall * sd.sp * dt                            // 舞い落ちる
          sd.lz += Math.cos(age * 0.5 + sd.ph * 1.3) * sd.sw * 0.5 * dt
          if (sd.ly < 0.4) sd.ly += 26                              // 落ちたら上へ（降り続ける）
          if (sd.lx > 42) sd.lx -= 84; else if (sd.lx < -42) sd.lx += 84
          pa.setXYZ(i, a.x + sd.lx * c - sd.lz * s, ay + sd.ly, a.z + sd.lx * s + sd.lz * c)
        }
        pa.needsUpdate = true
        return age < dur
      },
      cleanup: () => { scene.remove(pts); geo.dispose(); mat.dispose() },
    })
  }

  // ── 天の川（澄んだ夜空を横切る淡い星の帯）。夜にそっと現れ、しばらく懸かってまた淡く消える＝静かに整う特別な空。──
  function evMilkyWay() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d')
    g.save(); g.translate(256, 128); g.rotate(-0.34) // 斜めに横切る帯
    const bg = g.createLinearGradient(0, -64, 0, 64); bg.addColorStop(0, 'rgba(196,206,238,0)'); bg.addColorStop(0.5, 'rgba(214,222,246,0.5)'); bg.addColorStop(1, 'rgba(196,206,238,0)')
    g.fillStyle = bg; g.fillRect(-320, -64, 640, 128)
    for (let i = 0; i < 44; i++) { g.fillStyle = `rgba(222,226,250,${(0.04 + Math.random() * 0.06).toFixed(3)})`; g.beginPath(); g.arc((Math.random() - 0.5) * 580, (Math.random() - 0.5) * 76, 12 + Math.random() * 30, 0, 6.2832); g.fill() } // 帯の中の雲のような濃淡
    for (let i = 0; i < 440; i++) { const inBand = Math.random() < 0.72, bx = (Math.random() - 0.5) * (inBand ? 580 : 620), by = inBand ? (Math.random() - 0.5) * 76 : (Math.random() - 0.5) * 230, s = Math.random() * 1.5 + 0.4; g.fillStyle = `rgba(255,255,255,${(0.4 + Math.random() * 0.6).toFixed(2)})`; g.fillRect(bx, by, s, s) } // 星の粒（帯に密・周囲に疎）
    g.restore()
    const tex = new THREE.CanvasTexture(c)
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(380, 190), mat)
    const a = evAnchor(); const [mx, my, mz] = evPos(0, 72, eye.z - 212, a); m.position.set(mx, my, mz); m.rotation.y = -a.yaw; m.frustumCulled = false; scene.add(m) // 夜空の高みを横切る（飛行中は進む先の空へ）
    const dur = 64
    addFx({
      update: (age) => { mat.opacity = 0.82 * Math.min(1, age / 14) * Math.min(1, Math.max(0, (dur - age) / 18)); return age < dur }, // じわっと現れ・また淡く消える
      cleanup: () => { scene.remove(m); m.geometry.dispose(); mat.dispose(); tex.dispose() },
    })
  }

  // タイムスケール別の発火表。最初の発火は早め（眺めてすぐ何か起きる）、以降は間隔をあける。数値で調整可。
  const EV = {
    birds: { run: evBirdFlock, ok: () => !rainActive }, // 通り雨の間は鳥は飛ばさない（雨宿り＝現実忠実）
    balloon: { run: evBalloon, ok: () => !isNight && weather !== 'rain' && !rainActive }, // 気球は雨では飛ばさない（現実忠実）
    star: { run: evShootingStars, ok: () => isNight && weather !== 'rain' && weather !== 'snow' && !rainActive }, // 流れ星は雨/雪の曇天では見えない
    contrail: { run: evContrail },
    cloudShade: { run: evCloudShade, ok: () => !isNight && !shadeActive }, // 雲の翳り（昼の静かな整う演出）
    duskLights: { run: evDuskLights, ok: () => isNight }, // 宵の口（夜・窓がぽっと灯る）
    rainbowSolo: { run: evRainbow, ok: () => !rainActive }, // 雨無しの単独虹（中バンドに低確率）＝見せ場を観られる機会を増やす
    rain: { run: () => evRain(30), ok: () => !rainActive },
    fireworks: { run: evFireworks, ok: () => isNight && weather !== 'rain' && weather !== 'snow' && !rainActive }, // 花火は雨/雪では中止が現実（祭りと同じ）
    fireworksFinale: { run: evFireworksFinale, ok: () => isNight && weather !== 'rain' && weather !== 'snow' && !rainActive }, // 花火大会のフィナーレも雨天中止
    mist: { run: evMist }, // 通り過ぎるもや（朝もや/宵のもや・時間帯問わず静かに整う）
    drift: { run: evSeasonalDrift, ok: () => season !== 'summer' }, // 季節の風物詩（桜吹雪/落ち葉/粉雪）。夏は無し
    milkyway: { run: evMilkyWay, ok: () => isNight && weather !== 'rain' && weather !== 'snow' }, // 天の川（澄んだ夜空のみ）
    godRays: { run: evGodRays, ok: () => !isNight }, // 天使の梯子（雲間の光芒・昼夕）
    aurora: { run: evAurora, ok: () => isNight && weather !== 'rain' && !rainActive }, // オーロラは雨の曇天では見えない
  }
  const fxBands = [
    { next: 10 + R() * 8, min: 24, max: 42, quiet: 0.3, pool: ['birds', 'balloon', 'star', 'cloudShade', 'duskLights'] },                 // 頻繁（小さな驚き）。3割は“何も起きない素の街”の余白
    { next: 45 + R() * 35, min: 70, max: 150, pool: ['contrail', 'balloon', 'star', 'cloudShade', 'duskLights', 'rainbowSolo', 'mist', 'godRays', 'drift', 'drift', 'milkyway'] }, // 中（少し特別）＝もや/光芒/季節の風物詩/天の川
    { next: 80 + R() * 90, min: 480, max: 1500, pool: ['rain', 'fireworks', 'fireworksFinale'] },                   // まれ（大当たり＝雨→虹／花火／花火大会）
    { next: 360 + R() * 360, min: 1800, max: 3600, pool: ['aurora'] },                                              // 超レア（30〜60分に一度の“特別な空”＝オーロラ。最初は6〜12分で一度）
  ]
  // ── 今日の空模様（日替わりのシード）。その日だけ特定の現象が少し出やすい＝「今日は何か違う」再訪の動機。──
  // 実カレンダーの日付ハッシュで決定（同じ日は同じ・日が変わると変わる。festDayと同方式）。眺める頻度や静けさの設計は変えず、抽選の重みだけ僅かに傾ける。
  const SKY_MOODS = [
    ['rainbowSolo', 'cloudShade'], // 虹の生まれやすい日
    ['star', 'milkyway'],          // 星の多い夜
    ['balloon', 'birds'],          // 空のにぎわい
    ['godRays', 'mist'],           // 光と靄の日
    ['drift', 'contrail'],         // 風と季節の日
    ['aurora', 'star'],            // 特別な夜空
  ]
  const todayFavor = SKY_MOODS[(((festDay * 2654435761) ^ 0x9e3779b9) >>> 0) % SKY_MOODS.length]
  function scheduleFx(dt) {
    if (reduceMotion) return // 視差軽減では定期イベント（突発・大きな動き）を起こさない。ぼーっと眺める静けさは保つ
    // 深く眺めるほど（無操作が長いほど）発火間隔を伸ばす＝騒がしくせず静けさへ沈める（整う・評価エモ）。
    // 触れれば lastInputT が更新されて通常の頻度へ戻る。最大でも間隔は約1.8倍まで（イベントが完全に止まりはしない）。
    const idleMs = performance.now() - ((active && active.lastInputT) || 0)
    const calm = Math.min(1, Math.max(0, (idleMs - 25000) / 120000)) // 25秒以降ゆっくり、約2分強で最大
    const slow = 1 + calm * 0.8
    for (const b of fxBands) {
      b.next -= dt / slow // タイマーの減りを遅くする＝実効間隔を伸ばす（深い静けさほど発火率↓）
      if (b.next > 0) continue
      b.next = b.min + R() * (b.max - b.min)
      if (b.quiet && R() < b.quiet) continue // 何も起きない“余白”をたまに挟む（アンビエントの締まり）
      const ok = b.pool.filter((k) => { const e = EV[k]; return e && (!e.ok || e.ok()) })
      if (ok.length) {
        const weighted = ok.slice(); for (const k of todayFavor) if (ok.includes(k)) weighted.push(k) // 今日の空模様＝その日だけ出やすい（重みを倍に）
        const k = weighted[(R() * weighted.length) | 0]; EV[k].run(); onEvent(k)
        if (winCat && winRoom.visible && ({ birds: 1, balloon: 1, contrail: 1, star: 1, fireworks: 1, fireworksFinale: 1 })[k]) winCat.noticeT = 0.5 + Math.random() * 1.1 // 猫が外の気配に気づく（少し遅れて窓の外を目で追う／熟睡なら耳だけ）
      } // 画面の現象と音を同時に
    }
  }
  // 検証用フック（dev）: 任意のイベントを即時に起こす
  if (/[?&]dev=1/.test(location.search)) window.__town3dEvent = (n) => { onEvent(n); if (winCat && ({ birds: 1, balloon: 1, contrail: 1, star: 1, fireworks: 1, fireworksFinale: 1 })[n]) winCat.noticeT = 0.3; return ({ rain: () => evRain(16), rainbow: evRainbow, wetRoad: evWetRoad, birds: evBirdFlock, balloon: evBalloon, star: evShootingStars, contrail: evContrail, cloudShade: evCloudShade, duskLights: evDuskLights, fireworks: evFireworks, fireworksFinale: evFireworksFinale, mist: evMist, godRays: evGodRays, drift: evSeasonalDrift, milkyway: evMilkyWay, aurora: evAurora }[n] || (() => {}))() }

  // ── 飛行/歩行の没入オブジェクト ──
  // 自分の影が真下の地面を走る（高度＝飛んでいる手応え）。柔らかい円を地面に伏せる。
  const flyerShadow = (() => {
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s
    const g = c.getContext('2d')
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    grd.addColorStop(0, 'rgba(0,0,0,0.5)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.22)'); grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: true }))
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m
  })()
  // 着地の砂ぼこり（地面に広がって消える柔らかい輪）。飛び降りて着地した瞬間にふわっと立つ。
  const landDust = (() => {
    const s = 64, c = document.createElement('canvas'); c.width = c.height = s
    const g = c.getContext('2d')
    const grd = g.createRadialGradient(s / 2, s / 2, s * 0.12, s / 2, s / 2, s / 2)
    grd.addColorStop(0, 'rgba(228,221,208,0)'); grd.addColorStop(0.5, 'rgba(224,216,200,0.55)'); grd.addColorStop(1, 'rgba(220,212,196,0)')
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: true }))
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m
  })()
  // 高空を速く飛ぶと自分が飛行機雲を引く（後ろへ伸びる白い蒸気）。一粒ずつ薄れる加算スプライトの点群。
  const trailN = LIGHT ? 40 : 72
  const trailTex = (() => {
    const s = 48, c = document.createElement('canvas'); c.width = c.height = s
    const g = c.getContext('2d'); const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(245,248,255,0.5)'); gr.addColorStop(1, 'rgba(240,245,255,0)')
    g.fillStyle = gr; g.fillRect(0, 0, s, s); return new THREE.CanvasTexture(c)
  })()
  const trailGeo = new THREE.BufferGeometry()
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailN * 3), 3))
  trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(trailN * 3), 3)) // 各粒の濃さ(白×alpha)
  const trailMat = new THREE.PointsMaterial({ map: trailTex, size: 2.8, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true })
  const trail = new THREE.Points(trailGeo, trailMat); trail.frustumCulled = false; trail.visible = false; scene.add(trail)
  const trailAlpha = new Float32Array(trailN) // 各粒の寿命(0..1)
  let trailIdx = 0, trailAccum = 0
  let birdFlushCool = 0 // 鳥の羽音の連発抑制タイマー(秒)

  // 夕暮れ・夜は空気に光の粒が舞う（蛍/塵）。暗い空ほど見え、カメラ周辺を漂い流れる。空/地上でだけ。
  const moteN = LIGHT ? 50 : 90
  const motePos = new Float32Array(moteN * 3)
  for (let i = 0; i < moteN; i++) { motePos[i * 3] = (R() - 0.5) * 72; motePos[i * 3 + 1] = (R() - 0.5) * 46; motePos[i * 3 + 2] = (R() - 0.5) * 72 }
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3))
  const moteTex = (() => {
    const s = 32, c = document.createElement('canvas'); c.width = c.height = s
    const g = c.getContext('2d'); const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    gr.addColorStop(0, 'rgba(255,244,214,0.95)'); gr.addColorStop(0.5, 'rgba(255,236,196,0.4)'); gr.addColorStop(1, 'rgba(255,232,190,0)')
    g.fillStyle = gr; g.fillRect(0, 0, s, s); return new THREE.CanvasTexture(c)
  })()
  const moteMat = new THREE.PointsMaterial({ map: moteTex, size: 0.5, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; motes.visible = false; scene.add(motes)

  addContactShadows(homeTreeShadows) // 静的影の外に立つhome/谷戸の遠い木の足元へ接地影を一括(1メッシュ)＝浮きを消す（評価アート: 接地影が時代の木だけだった）
  // ── 時代エリアの距離カリング：遠い時代の街(±640)は海/霧で見えない。時代ごとに群へまとめ、カメラが遠い時は丸ごと
  //    非表示にして render traversal から外す＝基礎負荷(描画コール/カリング)を下げる。共視界禁止の設計なので安全。
  const eraCull = []
  if (kind !== 'yato') for (const ec of [{ c: EDO, r: 240 }, { c: SENGOKU, r: 180 }, { c: TAISHO, r: 230 }]) {
    const grp = new THREE.Group(); town.add(grp)
    const moved = []
    for (const ch of town.children) { if (ch === grp) continue; const p = ch.position; if (Math.hypot(p.x - ec.c.x, p.z - ec.c.z) < ec.r) moved.push(ch) } // 時代の島の領域内（個別の建物/木/ランドマーク）を集める
    for (const ch of moved) grp.add(ch) // 群へ移す（位置は原点群なので不変）。merged済の地物(position原点)は対象外＝常時描画のまま（数個なので軽い）
    if (moved.length) eraCull.push({ grp, cx: ec.c.x, cz: ec.c.z, r: ec.r, vis: true })
  }
  // ── 遠景ランドマークの誘い：時代エリアに地平で淡く灯る光の標(ビーコン)。飛行中に遠くから気配で誘い、近づくと消える。
  //    矢印UIでなく光の柱で「あそこへ行ってみよう」を生む（プロデューサー: 到達導線が長すぎ城下町に一度も到達せず離脱）。
  //    距離カリングされる時代の街とは別に scene へ置く＝街が霞で消えていても標だけは灯って渡りを誘う。──
  // 未訪の地だけを灯す＝既に辿り着いた時代エリアの光は淡く沈め、まだ見ぬ街へ誘いを集める（worldState.discovered）。
  const visitedAreas = new Set(Object.keys(opts.discovered || {}))
  const onDiscover = typeof opts.onDiscover === 'function' ? opts.onDiscover : () => {}
  const onTrace = typeof opts.onTrace === 'function' ? opts.onTrace : () => {}
  // ── 街のあちこちに置いた「人の気配の痕跡」を、歩いて近づくと"見つけた"として通い帳に静かに残す（死蔵された作り込みの救出＝評価パネルの核心）。
  //    座標は痕跡を置いた地点と同じ。生成ガード（陸地/未塞）を満たした痕跡だけ登録する。達成度は出さない＝そっと絵日記に一行だけ。
  const traces = []
  if (kind !== 'yato') {
    for (const t of [
      { id: 'tr-kenken', x: 0, z: 6, name: '広場で子どもらの遊んだ白い跡を見た' },
      { id: 'tr-mushi', x: 11, z: -24, name: '池のほとりの虫とり網と虫かごを見た' },
      { id: 'tr-jizo', x: 6.4, z: -41, name: '路傍のお地蔵さまに出会った' },
      { id: 'tr-engawa', x: -6, z: -6, name: '夕涼みの縁台と置き忘れの麦わら帽子を見た' },
    ]) if (heightAt(t.x, t.z) > SEA.level + 0.4 && !blockedAt(t.x, t.z)) traces.push(t)
  } else {
    traces.push({ id: 'tr-hokora', x: 8.5, z: 6, name: '棚田の畦の田の神さまの祠に出会った' }) // 谷戸の祠（棚田ブロックで生成）
  }
  const beacons = []
  if (kind !== 'yato') {
    const bc = document.createElement('canvas'); bc.width = 32; bc.height = 96; const bgx = bc.getContext('2d')
    for (let y = 0; y < 96; y++) { const a = Math.pow(1 - y / 96, 1.4) * 0.9, grd = bgx.createLinearGradient(0, y, 32, y); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, `rgba(255,248,236,${a})`); grd.addColorStop(1, 'rgba(255,255,255,0)'); bgx.fillStyle = grd; bgx.fillRect(0, y, 32, 1) } // 下ほど濃く上へ淡い光柱
    const beaconTex = new THREE.CanvasTexture(bc)
    for (const [c, tint, id] of [[EDO, 0xffd8a0, 'edo'], [SENGOKU, 0xbcc8e0, 'sengoku'], [TAISHO, 0xf0c4a4, 'taisho']]) {
      const gy = Math.max(heightAt(c.x, c.z), SEA.level)
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: beaconTex, color: tint, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }))
      m.scale.set(11, 70, 1); m.position.set(c.x, gy + 32, c.z); m.renderOrder = -0.5; m.visible = false; scene.add(m); beacons.push({ m, x: c.x, z: c.z, r: c.r || 90, id })
    }
  }

  // 高速時の速度感（風の手応え）。画面の縁がそっと締まり、視界が前へ吸い込まれる映画的なヴィネット。
  // 明るい水彩の空に“流れる白線”は埋もれて出ない／強いとゲーム臭くなるため、縁の締まりで速さを伝える。
  const speedVig = document.createElement('div'); speedVig.className = 'town3d-speedvig'; stage.appendChild(speedVig)
  veilEl = document.createElement('div'); veilEl.className = 'town3d-veil'; stage.appendChild(veilEl) // 霞の帯をくぐる白いベール
  let speedVigCur = -1
  // 雲を抜けるとき視界が白くかすむ（雲の中に入った手応え＝高度の実感）。
  const cloudHaze = document.createElement('div'); cloudHaze.className = 'town3d-cloudhaze'; stage.appendChild(cloudHaze)
  let cloudHazeCur = -1
  // 虹をくぐる時の淡い分光のベール
  const rainbowVeil = document.createElement('div'); rainbowVeil.className = 'town3d-rainbow'; stage.appendChild(rainbowVeil)
  let rbVeilCur = -1
  // 遠雷の稲光（雨/雪の夜などで cue:'thunder' に同期して空がほのかに白む）。frameで flashV を減衰し不透明度に。
  const flashEl = document.createElement('div'); flashEl.className = 'town3d-flash'; stage.appendChild(flashEl); let flashCur = -1
  // 部屋から空へ踏み出す瞬間、光がふわっと開ける（薄暗い室内→明るい外気）
  const openFlash = document.createElement('div'); openFlash.className = 'town3d-open'; stage.appendChild(openFlash)
  let openCur = -1
  // 高く昇るほど空気が冷たく淡くなる（高度の実感）。淡い寒色をうっすら被せる。
  const altTint = document.createElement('div'); altTint.className = 'town3d-alt'; stage.appendChild(altTint)
  let altTintCur = -1
  // 異時代の街に近づくと画面全体がその時代の色に染まる（別世界に入る気配）。frameで色・濃さを更新。
  const eraGrade = document.createElement('div'); eraGrade.className = 'town3d-era'; stage.appendChild(eraGrade)
  let eraGradeCur = -1, eraColCur = ''
  // とまる／すすむ トグル（飛行のときだけ・下中央）。両状態を並べ、いま「すすむ/とまる」どちらかを明示＝
  // 一語だけだと押すと何になるのか曖昧だった（評価UX: cruise両状態表示）。タップで巡航⇄ホバリングを切替。
  const cruiseBtn = document.createElement('button'); cruiseBtn.className = 'town3d-cruise'
  cruiseBtn.innerHTML = '<span class="town3d-cruise__seg" data-s="go">すすむ</span><span class="town3d-cruise__seg" data-s="stop">とまる</span>'
  cruiseBtn.setAttribute('aria-label', 'すすむ・とまるの切替')
  stage.appendChild(cruiseBtn)
  const reflectCruise = () => { cruiseBtn.classList.toggle('is-cruising', !!(active && active.cruise)) } // 巡航中=「すすむ」側を点灯／停止中=「とまる」側を点灯
  let cruiseShown = false
  // ジャンプボタン（歩行の右下）。ボタン／右側タップで跳ぶ。連打しても押すたびにフラッシュ＝押下判定が見える（実際の跳躍は接地時のみ＝二段ジャンプはしない）。
  const jumpBtn = document.createElement('button'); jumpBtn.className = 'town3d-jump'; jumpBtn.type = 'button'; jumpBtn.setAttribute('aria-label', 'ジャンプ'); jumpBtn.textContent = 'ジャンプ'; stage.appendChild(jumpBtn)
  let jumpShown = false, jumpFlashClr = null
  let stickRestShown = false // 歩行の常駐スティックを出しているか（変化時だけ class を書く）
  const flashJumpBtn = () => { jumpBtn.classList.remove('jump--press'); void jumpBtn.offsetWidth; jumpBtn.classList.add('jump--press'); if (jumpFlashClr) clearTimeout(jumpFlashClr); jumpFlashClr = setTimeout(() => jumpBtn.classList.remove('jump--press'), 180) } // 押すたびに再生（連打でも毎回光る）
  const triggerJump = () => { if (!active || active.mode !== 'walk') return; active.jumpQueued = true; flashJumpBtn(); active.lastInputT = performance.now(); active.cinema = 0 }
  jumpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); triggerJump() })
  cruiseBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation() }) // 長押しのテキスト選択/メニューを抑止
  cruiseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (!active) return
    active.cruise = !active.cruise
    reflectCruise()
  })
  // ── 低く流す（自転車のように坂を低速で滑空）。地形に沿って低高度を保ち、巡航をゆるめる＝坂の街を低く流れる第四の眺め（評価UX/F1）。──
  const lowBtn = document.createElement('button'); lowBtn.type = 'button'; lowBtn.className = 'town3d-low'
  lowBtn.textContent = '低く流す'; lowBtn.setAttribute('aria-label', '低く流す（自転車のように坂を滑空）')
  lowBtn.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 96px);z-index:6;display:none;padding:9px 17px;min-height:44px;border:none;border-radius:21px;background:rgba(28,30,38,.5);color:rgba(255,255,255,.9);font-size:13px;letter-spacing:.05em;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 2px 10px rgba(0,0,0,.22);cursor:pointer'
  stage.appendChild(lowBtn)
  const reflectLow = () => { const on = !!(active && active.lowCruise); lowBtn.style.background = on ? 'rgba(150,196,120,.62)' : 'rgba(28,30,38,.5)'; lowBtn.textContent = on ? '空へ戻す' : '低く流す' }
  lowBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation() })
  lowBtn.addEventListener('click', (e) => { e.stopPropagation(); if (!active) return; active.lowCruise = !active.lowCruise; if (active.lowCruise) active.cruise = true; reflectLow(); reflectCruise(); active.lastInputT = performance.now(); active.cinema = 0 })
  let lowShown = false

  // ── 操作トレイ（左下＝左親指の一角に飛行の補助操作を集約。バラけたボタンを一塊に） ──
  const pad = document.createElement('div'); pad.className = 'town3d-pad'; stage.appendChild(pad)
  // ── 操作レベルのゲージ（iPhoneの音量表示のように、今どのくらいの位置かを縦バーで示す）。
  // ボタンを押すと現れ、少し経つと静かに消える。淡い帯＝心地よく眺められる「おすすめ範囲」。
  // band=[下端,上端]（0..1）。set(v)で塗りの高さを更新、show()で表示してから自動で消す。
  const mkGauge = (wrap, band, labels) => {
    const g = document.createElement('div'); g.className = 'town3d-gauge'
    const bd = document.createElement('div'); bd.className = 'town3d-gauge__band'
    bd.style.bottom = (band[0] * 100).toFixed(1) + '%'; bd.style.height = ((band[1] - band[0]) * 100).toFixed(1) + '%'
    const fill = document.createElement('div'); fill.className = 'town3d-gauge__fill'
    g.appendChild(bd); g.appendChild(fill); wrap.appendChild(g)
    // 任意のラベル（高度ゲージの「地上/雲海」等＝今どこまで昇れば別世界かを可視化。UX監督B5）。インラインで自己完結（CSS変更不要）。
    if (labels) { g.style.position = g.style.position || 'relative'; for (const lb of labels) { const el = document.createElement('div'); el.textContent = lb.t; el.style.cssText = 'position:absolute;right:128%;bottom:' + (lb.at * 100).toFixed(0) + '%;transform:translateY(50%);font-size:9px;line-height:1;color:rgba(255,255,255,.66);white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.55);pointer-events:none'; g.appendChild(el) } }
    let hideT = null, cur = -1
    return {
      set(v) { v = Math.max(0, Math.min(1, v)); if (Math.abs(v - cur) < 0.004) return; cur = v; fill.style.transform = 'scaleY(' + v.toFixed(3) + ')' },
      show() { g.classList.add('gauge--show'); if (hideT) clearTimeout(hideT); hideT = setTimeout(() => g.classList.remove('gauge--show'), 1500) },
    }
  }
  // ── ズームボタン（＋寄る／−引く）。ピンチが効きにくい/不安なので、確実に効く明示ボタンを併置（地図/航空アプリ流儀）。
  // zoom は小さいほど寄り(0.4)・大きいほど引き(3.0)。＋で寄る＝zoomTargetを下げる、−で引く＝上げる。frameでzoomが滑らかに追従。
  const zoomWrap = document.createElement('div'); zoomWrap.className = 'town3d-zoom'
  const zoomIn = document.createElement('button'); zoomIn.className = 'town3d-zoom__btn'; zoomIn.textContent = '＋'; zoomIn.setAttribute('aria-label', '寄る')
  const zoomOut = document.createElement('button'); zoomOut.className = 'town3d-zoom__btn'; zoomOut.textContent = '−'; zoomOut.setAttribute('aria-label', '引く')
  zoomWrap.appendChild(zoomIn); zoomWrap.appendChild(zoomOut); pad.appendChild(zoomWrap)
  const zoomGauge = mkGauge(zoomWrap, [0.31, 0.73]) // ＋寄るで上がる。おすすめ＝寄り過ぎ/引き過ぎない中庸
  let zoomShown = false
  const nudgeZoom = (factor) => { if (!active) return; active.zoomTarget = Math.max(0.4, Math.min(3.0, active.zoomTarget * factor)); zoomGauge.show() }
  let zoomHold = null
  const stopZoomHold = () => { if (zoomHold) { clearInterval(zoomHold); zoomHold = null } }
  // ＋寄る／−引く。タップで一段、押しっぱなし(長押し)で連続ズーム、連打でも各タップが効く（確実な寄り引き）。
  for (const [btn, tap, hold] of [[zoomIn, 0.8, 0.955], [zoomOut, 1 / 0.8, 1 / 0.955]]) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation()
      try { btn.setPointerCapture(e.pointerId) } catch { /* 無視 */ }
      nudgeZoom(tap)                                    // タップで一段
      stopZoomHold()
      zoomHold = setInterval(() => nudgeZoom(hold), 55) // 長押しで滑らかに連続ズーム
    })
    const end = (e) => { if (e) e.stopPropagation(); stopZoomHold() }
    btn.addEventListener('pointerup', end)
    btn.addEventListener('pointercancel', end)
    // pointerleaveは外す（実機FB系の不具合と同根: 指が僅かにボタン端からズレると連続ズームが止まる）。setPointerCapture＋window pointerupで確実に解除。
  }
  // ── 速度ボタン（速く／遅く＝飛行速度の調整。左下。タップで一段、長押しで連続。既定はゆっくり） ──
  const speedWrap = document.createElement('div'); speedWrap.className = 'town3d-speed'
  const spUp = document.createElement('button'); spUp.className = 'town3d-speed__btn'; spUp.textContent = '速く'; spUp.setAttribute('aria-label', '速く飛ぶ')
  const spDn = document.createElement('button'); spDn.className = 'town3d-speed__btn'; spDn.textContent = '遅く'; spDn.setAttribute('aria-label', 'ゆっくり飛ぶ')
  speedWrap.appendChild(spUp); speedWrap.appendChild(spDn); pad.appendChild(speedWrap)
  const speedGauge = mkGauge(speedWrap, [0.26, 0.74]) // 速くで上がる。おすすめ＝ゆったり〜小気味よい間
  let speedShown = false
  const nudgeSpeed = (d) => { if (active) { active.speedMul = Math.max(0.35, Math.min(1.7, active.speedMul + d)); speedGauge.show() } }
  let speedHold = null
  const stopSpeedHold = () => { if (speedHold) { clearInterval(speedHold); speedHold = null } }
  for (const [btn, step] of [[spUp, 0.12], [spDn, -0.12]]) {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { btn.setPointerCapture(e.pointerId) } catch { /* 無視 */ } nudgeSpeed(step); stopSpeedHold(); speedHold = setInterval(() => nudgeSpeed(step * 0.5), 70) })
    const end = (e) => { if (e) e.stopPropagation(); stopSpeedHold() }
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end) // pointerleaveは外す（指ズレで連続変更が止まる不具合の回避・zoomと同様）
  }
  // 視界を広げるモード（広角＋引き＝広い思案で操る）。トグル式。
  const wideWrap = document.createElement('div'); wideWrap.className = 'town3d-wide'
  const wideBtn = document.createElement('button'); wideBtn.className = 'town3d-wide__btn'; wideBtn.textContent = '広く'; wideBtn.setAttribute('aria-label', '視界を広げる')
  wideWrap.appendChild(wideBtn); pad.appendChild(wideWrap)
  let wideShown = false
  wideBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (active) { active.wide = !active.wide; wideBtn.textContent = active.wide ? '標準' : '広く'; wideWrap.classList.toggle('wide--active', active.wide) } })
  // 上昇/下降（右・ズームの上）。向きを変えずに高さだけ＝毎回上を向かなくてよい。押している間だけ昇降。
  const climbWrap = document.createElement('div'); climbWrap.className = 'town3d-climb'
  const climbUp = document.createElement('button'); climbUp.className = 'town3d-climb__btn'; climbUp.textContent = '↑'; climbUp.setAttribute('aria-label', '上昇')
  const climbDn = document.createElement('button'); climbDn.className = 'town3d-climb__btn'; climbDn.textContent = '↓'; climbDn.setAttribute('aria-label', '下降')
  climbWrap.appendChild(climbUp); climbWrap.appendChild(climbDn); pad.appendChild(climbWrap)
  const altGauge = mkGauge(climbWrap, [0.12, 0.65], [{ at: 0.05, t: '地上' }, { at: 0.97, t: '雲海' }]) // ↑上昇で上がる＝今の高さ。おすすめ＝街を見渡せる低〜中空。地上/雲海ラベルで「どこまで昇れば別世界か」を示す
  let climbShown = false
  // 昇降の「押している間ずっと」の状態を保持し、frameで毎フレーム再宣言する（下の dvY 直前）。
  // ＝別の指（見回し/操舵）を置いたり離したりしても上昇/下降が切れない（実機FB: 右で角度・向きを変えると決まって上昇が止まる）。
  // climbHeld=押している向き(±1)／0=離した。climbPointerId=押している指のid（その指の pointerup だけで解除）。
  let climbHeld = 0, climbPointerId = null
  for (const [cbtn, dir] of [[climbUp, 1], [climbDn, -1]]) {
    const cstart = (e) => { e.preventDefault(); e.stopPropagation(); try { cbtn.setPointerCapture(e.pointerId) } catch { /* 無視 */ } if (active) active.climb = dir; climbHeld = dir; climbPointerId = e.pointerId; altGauge.show() }
    const cup = (e) => { if (e) e.stopPropagation(); if (active) active.climb = 0; climbHeld = 0; climbPointerId = null } // 指を離した＝解除
    // ★pointercancel では解除しない：2本目の指(見回し/操舵)を置いた瞬間にブラウザが1本目へ cancel を飛ばすことがあり、
    //   それで上昇が切れるのが実機FBの主因。押している向きは climbHeld に保持して frame で毎フレーム再宣言＝紛れて切れない。
    //   本当に指を離した時だけ cup(pointerup)/winClimbUp で解除する（touch-action:none で微動でも pointerup は確実に届く）。
    cbtn.addEventListener('pointerdown', cstart); cbtn.addEventListener('pointerup', cup)
  }
  // 保険: 昇降ボタンを握っていた指を画面のどこで離しても確実に解除（setPointerCapture失敗時の押しっぱなし防止）。
  // ただし「昇降を握っている指」だけを対象にする＝見回し/操舵の指を離しても昇降は続く（同時操作を保つ）。
  // 名前付き＝dispose で確実に外す（無名だと情景往復のたび window へ溜まる＝リスナー漏れ・評価エンジニア）。
  const winClimbUp = (e) => { if (active && e && e.pointerId === climbPointerId) { active.climb = 0; climbHeld = 0; climbPointerId = null } }
  window.addEventListener('pointerup', winClimbUp)
  // ── 補助操作の畳み込み: 既定は「すすむ/とまる＋↑↓昇降＋ズーム」のみ常駐し、補助の「速く/遅く・広く」は
  //    この⚙トグルを押した時だけ展開＝飛行時に操作子が一斉に出る"コックピット化"を解消し画面を一枚の絵に保つ（評価UX致命1）。──
  const moreBtn = document.createElement('button'); moreBtn.className = 'town3d-more'; moreBtn.textContent = '⚙'; moreBtn.setAttribute('aria-label', '速さ・視界の操作を開く'); pad.appendChild(moreBtn)
  let padShown = false // 補助トレイの表示状態(=showSpeedと同期)。⚙自体の出し入れ用
  moreBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); pad.classList.toggle('pad--open'); moreBtn.classList.toggle('more--on', pad.classList.contains('pad--open')) })

  // ── 静的な建物の毎フレーム行列再計算を止める（perf監督#243＝発熱の純損失を削る）。──
  // homeの建物本体は位置・回転・スケール不変（可視/不可視の切替のみ）＝安全に凍結できる。動く物(車/人/木/鳥/舟)や
  // 住人を含む時代エリア群は対象外。配置確定後にここで一度だけワールド行列を焼き、以後は再計算をスキップさせる。
  let frozenStatic = 0
  const _bbox = new THREE.Box3(), _bsz = new THREE.Vector3(), _bctr = new THREE.Vector3(), bldgShadowSpecs = []
  for (const b of homeBldgs) {
    b.updateMatrixWorld(true); b.traverse((o) => { o.matrixAutoUpdate = false; frozenStatic++ })
    // 静的焼き影(原点±60)の外＝飛行で俯瞰した時に地面から浮く建物に、足元の接地影デカールを敷く（アート監督 致命1）。
    if (Math.hypot(b.position.x, b.position.z) > 58) { _bbox.setFromObject(b); _bbox.getSize(_bsz); _bbox.getCenter(_bctr); const r = Math.max(_bsz.x, _bsz.z) * 0.42; if (r > 0.6 && r < 14) bldgShadowSpecs.push([_bctr.x, heightAt(_bctr.x, _bctr.z), _bctr.z, r]) }
  }
  if (bldgShadowSpecs.length) addContactShadows(bldgShadowSpecs) // 遠景建物の足元影を1メッシュへ統合＝描画コール+1で浮きを一掃

  // ── 発熱の本丸: 街の建物を「区画ごと・材質の設定ごと」に1メッシュへ統合する（描画コールの提出コストがiPhoneの発熱の主因）。──
  //    絵は変えない: 材質の色を頂点色へ焼き込み、白い材質を1つ共有するだけ（最終色は 材質色×頂点色 の掛け算なので等価）。
  //    霧の彼方の描画カリングは「1棟ごと」から「区画ごと」へ引き継ぐ。?nomerge=1 で統合を止め従来の姿に戻せる（非破壊）。
  const bldgTiles = [] // 統合後の区画メッシュ＝新しいカリング単位
  let mergeInfo = { 区画メッシュ: 0, 元メッシュ: 0 }
  if (!/[?&]nomerge=1/.test(location.search) && BufferGeometryUtils.mergeGeometries && homeBldgs.length) {
    const TILE = 36 // 区画の大きさ(m)。小さいほどカリングが効き、大きいほど描画コールが減る
    const groups = new Map(), _inv = new THREE.Matrix4(), _mm = new THREE.Matrix4()
    town.updateMatrixWorld(true); _inv.copy(town.matrixWorld).invert()
    for (const b of homeBldgs) {
      const tx = Math.round(b.position.x / TILE), tz = Math.round(b.position.z / TILE)
      b.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.material || Array.isArray(o.material)) return
        const m = o.material
        // 絵柄つき・半透明は対象外（統合すると描き順が変わり絵が変わるため）。トゥーン材質の不透明部分だけを束ねる
        mergeInfo.走査メッシュ = (mergeInfo.走査メッシュ || 0) + 1
        if (m.type !== 'MeshToonMaterial' && m.type !== 'MeshBasicMaterial') { mergeInfo['除外_' + m.type] = (mergeInfo['除外_' + m.type] || 0) + 1; return }
        if (m.alphaMap) { mergeInfo.除外_抜き = (mergeInfo.除外_抜き || 0) + 1; return }
        if (m.transparent) { mergeInfo.除外_半透明 = (mergeInfo.除外_半透明 || 0) + 1; return }
        // 絵柄は「同じテクスチャどうし」なら一緒に統合できる（別テクスチャは別の束になる）
        const sig = `${tx}|${tz}|${m.type}|${m.map ? m.map.uuid : '-'}|${m.side}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}|${m.fog ? 1 : 0}|${m.flatShading ? 1 : 0}`
        let g = groups.get(sig)
        if (!g) { g = { src: m, geos: [], olds: [], cast: o.castShadow, recv: o.receiveShadow, ro: o.renderOrder, x: tx * TILE, z: tz * TILE }; groups.set(sig, g) }
        const geo = o.geometry.clone()
        _mm.multiplyMatrices(_inv, o.matrixWorld); geo.applyMatrix4(_mm) // 区画の位置・回転を焼き込む
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && !(m.map && k === 'uv')) geo.deleteAttribute(k) // 属性を揃えないと統合できない（絵柄つきはuvを残す）
        geo.clearGroups(); geo.morphAttributes = {}
        if (!geo.attributes.normal) geo.computeVertexNormals()
        const n = geo.attributes.position.count, vc = geo.attributes.color, col = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) { col[i * 3] = (vc ? vc.getX(i) : 1) * m.color.r; col[i * 3 + 1] = (vc ? vc.getY(i) : 1) * m.color.g; col[i * 3 + 2] = (vc ? vc.getZ(i) : 1) * m.color.b }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
        g.geos.push(geo); g.olds.push(o)
      })
    }
    for (const g of groups.values()) {
      if (g.geos.length < 3) { g.geos.forEach((x) => x.dispose()); continue } // 少数は統合の得が小さいのでそのまま
      const mg = BufferGeometryUtils.mergeGeometries(g.geos, false)
      g.geos.forEach((x) => x.dispose())
      if (!mg) continue
      const mat = g.src.clone() // 材質の設定（陰影の階調・霧・冬の雪化粧）をそのまま引き継ぐ。cloneが写さない関数は手で移す
      mat.onBeforeCompile = g.src.onBeforeCompile; mat.customProgramCacheKey = g.src.customProgramCacheKey
      mat.color.set(0xffffff); mat.vertexColors = true; mat.needsUpdate = true
      const me = new THREE.Mesh(mg, mat)
      me.castShadow = g.cast; me.receiveShadow = g.recv; me.renderOrder = g.ro
      me.matrixAutoUpdate = false; me.updateMatrix()
      town.add(me); bldgTiles.push({ o: me, x: g.x, z: g.z })
      mergeInfo.区画メッシュ++; mergeInfo.元メッシュ += g.olds.length
      for (const o of g.olds) o.visible = false // 非破壊: 元のメッシュは消さず隠すだけ
    }
    // 中身が全部統合された棟は、毎フレームの走査対象から降ろす（データは homeBldgs に温存＝消していない）
    for (const b of homeBldgs) { let live = false; b.traverse((o) => { if (o.isMesh && o.visible) live = true }); if (!live) { b.userData.mergedAway = true; town.remove(b) } }
  }
  window.__town3dMerge = () => ({ ...mergeInfo, 区画: bldgTiles.length, 削減: mergeInfo.元メッシュ - mergeInfo.区画メッシュ }) // 検証用: 建物統合の効き
  for (const w of cityWalkers) if (w.g) w.g.userData.walker = true // 動く旅人は近接微揺れの対象外（自前で動くため）
  window.__town3dFrozen = () => frozenStatic // 検証用: 凍結した静的ノード数

  // ── ゲームパッド対応A（Backbone One 第2世代＝標準ゲームパッド）。navigator.getGamepads() を frame 先頭で毎フレーム読み、
  //    スティック/ボタンを既存アクションへ合流（非破壊＝タッチ操作はそのまま）。接続中はオンスクリーン操作を薄く退避し、画面に触れると数秒だけ戻す。──
  const GP = { prev: [], connected: false, reshowT: 0, moving: false }
  const PAD_DEFAULT = { A: 0, B: 1, X: 2, Y: 3, L1: 4, R1: 5, L2: 6, R2: 7, VIEW: 8 } // 標準配置のボタン番号（Bで再割当・localStorage保存）
  const loadPadMap = () => { try { const s = JSON.parse(localStorage.getItem('seasons_padmap') || 'null'); if (s && typeof s === 'object') return Object.assign({}, PAD_DEFAULT, s) } catch (_) { /* 壊れていたら既定 */ } return Object.assign({}, PAD_DEFAULT) }
  const savePadMap = () => { try { localStorage.setItem('seasons_padmap', JSON.stringify(GB)) } catch (_) { /* 保存不可でもメモリ上は有効 */ } }
  let GB = loadPadMap()
  if (!document.getElementById('town3d-pad-style')) { // 接続時にオンスクリーン操作を薄く（触ると一時再表示）
    const st = document.createElement('style'); st.id = 'town3d-pad-style'
    st.textContent = '.town3d-stage--pad .town3d-stick,.town3d-stage--pad .town3d-cruise,.town3d-stage--pad .town3d-jump,.town3d-stage--pad .town3d-low,.town3d-stage--pad .town3d-pad,.town3d-stage--pad .town3d-more{opacity:.1;pointer-events:none;transition:opacity .5s ease}.town3d-stage--touch .town3d-stick,.town3d-stage--touch .town3d-cruise,.town3d-stage--touch .town3d-jump,.town3d-stage--touch .town3d-low,.town3d-stage--touch .town3d-pad,.town3d-stage--touch .town3d-more{opacity:1 !important;pointer-events:auto !important}'
    document.head.appendChild(st)
  }
  const setPadConnected = (on) => { if (GP.connected === on) return; GP.connected = on; stage.classList.toggle('town3d-stage--pad', on); if (!on) { stage.classList.remove('town3d-stage--touch'); padPanel.style.display = 'none'; GP.capIdx = null } padCfgBtn.style.display = on ? 'block' : 'none' }
  stage.addEventListener('pointerdown', () => { if (GP.connected) { stage.classList.add('town3d-stage--touch'); GP.reshowT = performance.now() + 3000 } }, true) // 触れたら数秒だけ操作ボタンを戻す
  const pollGamepad = () => {
    if (!navigator.getGamepads || !active) return
    let gp = null; const pads = navigator.getGamepads()
    for (const p of pads) if (p && p.connected) { gp = p; break }
    if (!gp) { setPadConnected(false); return }
    setPadConnected(true)
    if (GP.reshowT && performance.now() > GP.reshowT) { GP.reshowT = 0; stage.classList.remove('town3d-stage--touch') }
    const ax = gp.axes || [], bt = gp.buttons || []
    const now = []; for (let i = 0; i < bt.length; i++) now[i] = !!(bt[i] && bt[i].pressed)
    const edge = (i) => now[i] && !GP.prev[i]
    const val = (i) => (bt[i] ? bt[i].value : 0)
    const dz = (v) => { v = v || 0; const a = Math.abs(v); return a < 0.16 ? 0 : Math.sign(v) * (a - 0.16) / 0.84 } // デッドゾーン＋再正規化
    const lx = dz(ax[0]), ly = dz(ax[1]), rx = dz(ax[2]), ry = dz(ax[3])
    if (GP.capIdx) { for (let i = 0; i < now.length; i++) if (now[i] && !GP.prev[i]) { GB[GP.capIdx] = i; savePadMap(); GP.capIdx = null; if (GP.onRemap) GP.onRemap(); break } GP.prev = now; active.lastInputT = performance.now(); return } // キーコンフィグ: 割当キャプチャ中は次に押したボタンをそのアクションへ（アクションは起こさない）
    const m = active.mode, LK = 0.024, SK = 0.02
    if (m === 'window') {
      if (rx || ry) applyTown3dLook(rx * LK, ry * LK)
      if (lx || ly) applyTown3dLook(lx * LK, ly * LK)
      setTown3dLean(now[GB.L1]) // L1押しっぱなしで身を乗り出す
      if (edge(GB.A) || edge(GB.R2)) setTown3dFly(true) // 飛び立つ
    } else if (m === 'fly') {
      if (lx || ly) applyTown3dSteer(lx * SK, ly * SK) // 左スティック＝操舵（旋回＋機首）
      if (rx || ry) applyTown3dLook(rx * LK, ry * LK)  // 右スティック＝見回し
      const up = val(GB.R2), dn = val(GB.L2); active.climb = up > 0.12 ? up : (dn > 0.12 ? -dn : 0) // R2上昇/L2下降（アナログ）
      if (edge(GB.A)) active.cruise = !active.cruise // すすむ/とまる
      if (edge(GB.B)) { active.lowCruise = !active.lowCruise; if (active.lowCruise) active.cruise = true } // 低く流す
      if (edge(GB.Y)) active.wide = !active.wide // 広く見る
      if (edge(GB.X)) setTown3dLand(true) // 着地して歩く
      if (edge(GB.R1)) nudgeZoom(0.8); if (edge(GB.L1)) nudgeZoom(1.25) // 寄る/引く
    } else if (m === 'walk') {
      if ((lx || ly) || GP.moving) { active.moveX = lx; active.moveY = ly; GP.moving = !!(lx || ly) } // 左スティック＝歩行（中立時はタッチに譲る）
      if (rx || ry) applyTown3dLook(rx * LK, ry * LK) // 右スティック＝見回し
      if (edge(GB.A)) triggerJump() // ジャンプ
      if (edge(GB.X)) setTown3dLand(false) // また飛び立つ
      if (edge(GB.R1)) nudgeZoom(0.8); if (edge(GB.L1)) nudgeZoom(1.25)
    }
    if (edge(GB.VIEW)) setTown3dFly(false) // 窓辺へ戻る（共通）
    let acted = !!(lx || ly || rx || ry)
    for (let i = 0; i < now.length; i++) if (now[i]) { acted = true; break }
    GP.prev = now
    if (acted) { active.lastInputT = performance.now(); active.cinema = 0 } // パッド操作もidle判定を解除（省電力16fpsへ落とさない）
  }
  // ── コントローラー設定（アプリ内キーコンフィグ）。接続時に「⚙コントローラー」が出る。各アクションの「変更」を押し、割り当てたいボタンを押す＝localStorage保存。──
  const padActions = [['A', 'すすむ/とまる・飛び立つ・ジャンプ'], ['R2', '上昇・飛び立つ'], ['L2', '下降'], ['B', '低く流す'], ['X', '着地/また飛び立つ'], ['Y', '広く見る'], ['R1', '寄る'], ['L1', '引く・身を乗り出す'], ['VIEW', '窓辺へ戻る']]
  const padCfgBtn = document.createElement('button'); padCfgBtn.type = 'button'; padCfgBtn.className = 'town3d-padcfg-btn'; padCfgBtn.textContent = '⚙ コントローラー'
  padCfgBtn.style.cssText = 'position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:9;display:none;padding:7px 12px;min-height:36px;border:none;border-radius:18px;background:rgba(28,30,38,.5);color:rgba(255,255,255,.9);font-size:12px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);cursor:pointer'
  stage.appendChild(padCfgBtn)
  const padPanel = document.createElement('div'); padPanel.className = 'town3d-padcfg'; padPanel.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:12;display:none;flex-direction:column;gap:6px;max-height:82%;overflow:auto;padding:16px;border-radius:16px;background:rgba(24,26,32,.93);color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.5);min-width:290px'
  stage.appendChild(padPanel)
  let padRows = []
  const refreshPadRows = () => { for (const r of padRows) { r.cur.textContent = 'ボタン ' + (GB[r.key] ?? '−'); r.btn.textContent = '変更' } }
  GP.onRemap = refreshPadRows
  const buildPadPanel = () => {
    padPanel.textContent = ''; padRows = []
    const h = document.createElement('div'); h.textContent = 'コントローラー設定'; h.style.cssText = 'font-size:15px;letter-spacing:.06em'; padPanel.appendChild(h)
    const hint = document.createElement('div'); hint.textContent = '「変更」を押し、割り当てたいボタンを押してください'; hint.style.cssText = 'font-size:11px;color:rgba(255,255,255,.6);margin-bottom:8px'; padPanel.appendChild(hint)
    for (const [key, label] of padActions) {
      const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:8px'
      const lb = document.createElement('span'); lb.textContent = label; lb.style.cssText = 'flex:1;font-size:12px'
      const cur = document.createElement('span'); cur.style.cssText = 'font-size:11px;color:rgba(255,255,255,.55);min-width:58px;text-align:right'
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '変更'; btn.style.cssText = 'padding:6px 12px;min-height:34px;border:none;border-radius:14px;background:rgba(150,196,120,.5);color:#fff;font-size:12px;cursor:pointer'
      btn.addEventListener('click', (e) => { e.stopPropagation(); refreshPadRows(); GP.capIdx = key; cur.textContent = '押して…'; btn.textContent = '待機' })
      row.appendChild(lb); row.appendChild(cur); row.appendChild(btn); padPanel.appendChild(row); padRows.push({ key, cur, btn })
    }
    const foot = document.createElement('div'); foot.style.cssText = 'display:flex;gap:8px;margin-top:10px'
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '既定に戻す'; reset.style.cssText = 'flex:1;padding:9px;min-height:42px;border:none;border-radius:14px;background:rgba(255,255,255,.14);color:#fff;font-size:12px;cursor:pointer'
    reset.addEventListener('click', (e) => { e.stopPropagation(); GB = Object.assign({}, PAD_DEFAULT); savePadMap(); GP.capIdx = null; refreshPadRows() })
    const close = document.createElement('button'); close.type = 'button'; close.textContent = '閉じる'; close.style.cssText = 'flex:1;padding:9px;min-height:42px;border:none;border-radius:14px;background:rgba(255,255,255,.14);color:#fff;font-size:12px;cursor:pointer'
    close.addEventListener('click', (e) => { e.stopPropagation(); GP.capIdx = null; padPanel.style.display = 'none' })
    foot.appendChild(reset); foot.appendChild(close); padPanel.appendChild(foot); refreshPadRows()
  }
  padCfgBtn.addEventListener('click', (e) => { e.stopPropagation(); buildPadPanel(); padPanel.style.display = 'flex' })
  if (/[?&]dev=1/.test(location.search)) window.__town3dGp = () => active ? { mode: active.mode, cruise: !!active.cruise, low: !!active.lowCruise, wide: !!active.wide, climb: +(active.climb || 0).toFixed(2), zoom: +active.zoomTarget.toFixed(2), pad: GP.connected, map: Object.assign({}, GB), cap: GP.capIdx || '' } : null // 検証用: ゲームパッドで変わる状態＋割当を読む
  function frame() {
    if (!active) return
    active.raf = requestAnimationFrame(frame)
    if (document.hidden) return // 非アクティブ（タブ切替/画面ロック）時は描画も更新も止める＝発熱・電池配慮（CLAUDE.md）
    if (active.paused) return // おやすみの暗転が完了したら描画を止める（真っ暗な裏で描き続けない）。触れて戻ると再開＝発熱・電池配慮
    if (contextLost) return // WebGLコンテキスト喪失中は描画/更新を止める（GLエラーの洪水を避ける。復帰でonContextRestoreが組み直す）
    pollGamepad() // ゲームパッド（Backbone One等）を毎rAFで読む＝スロットル早期returnの前＝60Hzで拾い、操作中はidleに落とさない
    const t = (performance.now() - startT) / 1000
    // 約30fpsへ間引く（描画と影パスを半減＝発熱を抑える）。dtはクロックから取るので動きは滑らかなまま。
    // ぼーっと眺めている長い時間は約22fpsへ落とす＝電池/発熱を抑える（dtは実クロックなので動きは滑らかなまま）。
    // 「眺めている」＝操作が3.5秒以上なく、ほぼ静止（窓辺／止まって浮かぶ／雲上や地上で休む）。雲や鯨はごく遅いので22fpsでも見た目はほぼ不変。
    // 能動的に飛んで動く時（巡航・操舵・昇降・速い移動）は30fpsを保つので滑らかさは損なわない。
    const stillNow = Math.hypot(active.vel.x, active.vel.z) < 0.8 && (active.climb || 0) === 0
    const restIdle = stillNow && (performance.now() - (active.lastInputT || 0)) > 3500
    // 「眺めている時」は描画頻度だけ約16fpsへ落とす＝発熱/電池を抑える（主用途＝長時間ぼーっと眺める）。
    // 方針=鮮明さ優先: 解像度は落とさない（静止画こそ鮮明に見たい）。動きはクロック基準なので16fpsでも滑らか。操作再開で即30fps。
    // ※以前は idle で解像度も×0.8 に落としていたが、眺める静止画がぼやけるため取りやめ（fps低下が発熱の主レバー＝それは維持）。
    if (t - lastDraw < (restIdle ? 0.06 : 0.032)) return // 眺めている時は約16fps／能動時は約30fps
    const drawDt = lastDraw < 0 ? 0.033 : t - lastDraw // 実際の描画間隔（カク付き検知）
    lastDraw = t
    const _js0 = performance.now() // 毎フレームのJS処理時間を測る（検証用・CPU負荷）
    // ── 自動品質調整：能動飛行中、描画が30fpsに間に合わない状態が続いたら解像度を一段下げて「常に滑らか」を死守。
    //    安定が長く続けば鮮やかさ(qCap)へ少しずつ戻す。ヒステリシスで頻繁な切替を防ぐ。restIdle/タブ復帰の巨大gapは無視。
    lastDDT = drawDt
    // 飛んでいる間だけ解像度の天井をひと段下げる（景色が流れるので粗さが目立たず、塗る画素が約4割減る＝発熱を直接削る）。
    // 窓辺で静かに眺める時は従来どおりの鮮明さ(1.6)。離着陸の瞬間だけ切り替えるので毎フレームの作り直しは起きない。
    const wantFly = !!(active && active.mode !== 'window' && active.flyP > 0.5)
    if (wantFly !== prFly) { prFly = wantFly; curPR = Math.min(window.devicePixelRatio || 1, prFly ? Math.min(qCap, 1.2) : qCap); applySize() }
    const effCap = prFly ? Math.min(qCap, 1.2) : qCap
    if (!restIdle && drawDt > 0.001 && drawDt < 0.4) {
      if (drawDt > 0.047) { adQLow++; adQOk = 0 } else if (drawDt < 0.038) { adQOk++; adQLow = 0 } else { if (adQLow) adQLow--; if (adQOk) adQOk-- }
      // 重い時はまず「重い後処理(ブルーム=複数回のぼかしパス)」を切る＝解像度(鮮明さ)を保ったまま大きく軽くする。次に解像度を譲る。
      // これで「重くてカクつく→解像度だけ落ちてボヤける」連鎖を断つ（実機FB: 雨/雲海が重く画質も荒い）。iPhoneはstandardティアに張り付くため、実測fpsで自浄する。
      if (adQLow >= 10 && bloomPass && bloomPass.enabled) { bloomPass.enabled = false; adQLow = 0; adQOk = 0 } // 段1: ブルームを落とす（最大の塗り負荷を削り鮮明さは保つ）
      else if (adQLow >= 16 && curPR > PR_FLOOR + 0.001) { curPR = Math.max(PR_FLOOR, curPR - 0.12); applySize(); adQLow = 0; adQOk = 0 } // 段2: 解像度を譲る
      else if (adQOk >= 40) { // 安定が続けば逆順で戻す: まず解像度、次にブルーム
        if (curPR < effCap - 0.001) { curPR = Math.min(effCap, curPR + 0.12); applySize(); adQOk = 0 }
        else if (bloomPass && bloomWanted && !bloomPass.enabled) { bloomPass.enabled = true; adQOk = 0 }
      }
    }
    const dt = Math.min(0.05, t - lastT); lastT = t
    // 時代エリアの距離カリング：群の「最も近い縁(中心距離−半径)」が霧(fog.far)の外に出たら非表示にする。
    // 固定330で切ると、大きな島(半径〜240)の中心が330でも近縁は90u＝霧の手前で鮮明なまま現れ「ポップ」した（評価エモ指摘）。
    // fog.far基準にすると、縁が霧で完全に溶けた所で切替＝見た目の瞬断が消え、近づくと霞からゆっくり立ち現れる（現代home建物と同じ方式）。
    for (const e of eraCull) { const d = Math.hypot(active.flyPos.x - e.cx, active.flyPos.z - e.cz) - e.r; const ff = scene.fog.far; const want = d < (e.vis ? ff + 30 : ff); if (want !== e.vis) { e.vis = want; e.grp.visible = want
      // 非表示の間は部分木ごと行列走査もスキップ（matrixWorldAutoUpdate=false）＝遠い時代の数千ノードの毎フレーム更新という発熱の純損失を削る。再表示時に一度だけ焼き直す
      e.grp.matrixWorldAutoUpdate = want
      if (want) e.grp.updateMatrixWorld(true)
    } }
    // 遠景ランドマークの誘い: 飛行中、遠いほど淡く灯り近づくと消える光の標＝渡りの目印（窓辺/着地では消す）。
    if (beacons.length) { const fa = active.flyP || 0, fp = active.flyPos
      for (const b of beacons) { const d = Math.hypot(fp.x - b.x, fp.z - b.z)
        if (!visitedAreas.has(b.id) && d < b.r) { visitedAreas.add(b.id); onDiscover(b.id) } // 辿り着いた＝静かに記録（次からは誘いを未訪の地へ集める）
        const seenDim = visitedAreas.has(b.id) ? 0.2 : 1 // 既に訪れた地の光は淡く沈め、まだ見ぬ街を際立たせる
        const op = fa * 0.36 * seenDim * Math.max(0, Math.min(1, (d - 70) / 120))
        b.m.visible = op > 0.012; if (b.m.visible) b.m.material.opacity = op * (0.82 + 0.18 * Math.sin(t * 0.7 + b.x * 0.01)) } } // 遠いほど灯り、近づく(70u以内)と消える＝着いたら役目を終える
    // 痕跡の発見: 歩いて近づくと初回だけ静かに通い帳へ（達成度・通知は出さない＝そっと絵日記に残るだけ＝『夏休み』の小さな発見）。
    if (traces.length && active.mode === 'walk') { const fp = active.flyPos
      for (const tr of traces) { if (visitedAreas.has(tr.id)) continue
        if (Math.hypot(fp.x - tr.x, fp.z - tr.z) < 2.8) { visitedAreas.add(tr.id); onDiscover(tr.id); onTrace(tr.name); onChime(); chimeCount++ } } } // 見つけた一拍にかすかな鈴（達成音でなく佇む時と同じ静かな鈴）
    // いまの居場所をそっと伝える（飛行/歩行中の迷子防止）。窓辺は空文字＝表示を消す。変化時だけ通知。
    { let loc = ''
      if (active.mode !== 'window') {
        if (kind === 'yato') loc = '獅子ヶ谷の谷戸'
        else { const fp = active.flyPos
          if (fp.y > SEA_Y - 16) loc = '雲海'
          else if (Math.hypot(fp.x - EDO.x, fp.z - EDO.z) < 250) loc = '江戸の城下町'
          else if (Math.hypot(fp.x - SENGOKU.x, fp.z - SENGOKU.z) < 210) loc = '戦国の城下町'
          else if (Math.hypot(fp.x - TAISHO.x, fp.z - TAISHO.z) < 250) loc = '大正の港町'
          else if (Math.hypot(fp.x, fp.z) < 155) loc = '現代の街'
          else loc = heightAt(fp.x, fp.z) < SEA.level + 0.5 ? '海の上' : 'まちはずれ'
        }
      }
      if (loc !== lastLoc) {
        // 到達の一拍: 渡りの果ての名所(江戸/戦国/大正/雲海)へ入った瞬間、澄んだ鈴がひとつ満ちる＝「着いた」の余韻（エモ: 到達の感動がゼロ）。
        // loc!==lastLoc で入域ごと1回・名所のみ(海上/まちはずれ/現代は鳴らさない)・飛行中のみ。
        if (loc && lastLoc !== loc && /城下町|港町|雲海/.test(loc) && (active.flyP || 0) > 0.5) onChime()
        lastLoc = loc; onLocation(loc)
      }
    }
    // 現代home建物の霧距離カリング：fog.farより遠い建物は完全に霧で見えない＝隠しても見た目不変で描画コール減。
    // 影は初回に全建物で焼く(autoUpdate=false)ので、影焼き後(数フレーム後)から開始。窓辺(fog.far≈132)で特に効く。
    bcFrame++
    if (bcFrame > 3 && homeBldgs.length) { const ff = scene.fog.far + 6, ff2 = ff * ff
      // 統合後は「区画ごと」に霧の彼方を隠す（区画の対角の半分＝25mぶん余裕を持たせ、端の建物が早く消えるのを防ぐ）
      if (bldgTiles.length) { const tf = (ff + 26) * (ff + 26)
        for (const t of bldgTiles) { const dx = t.x - active.flyPos.x, dz = t.z - active.flyPos.z; const vis = dx * dx + dz * dz < tf; if (t.o.visible !== vis) t.o.visible = vis } }
      for (const b of homeBldgs) { if (b.userData.mergedAway) continue; const bdx = b.position.x - active.flyPos.x, bdz = b.position.z - active.flyPos.z; const vis = bdx * bdx + bdz * bdz < ff2; if (b.visible !== vis) b.visible = vis } }
    // ステージ実寸が変わったら（飛行で枠が変わる／回転／レイアウト変化）即 aspect を直す＝「横に伸びる」を自動補正
    if (stage.clientWidth !== lastStageW || stage.clientHeight !== lastStageH) applySize()
    // 車が通りを行き交う。走行区間は建物コライダーの無い z∈[-16,22] に限定
    // （z<-22は中央通りの回廊に家が建つ区間＝レーン上を実測走査で確認済み。家側の除けを広げるとR()消費順が崩れるため車側で閉じる）
    for (const c of cars) {
      const u = c.userData
      u.z += u.dir * u.speed * dt
      if (u.z > 22) u.z = -16
      if (u.z < -16) u.z = 22
      c.position.set(u.lane, heightAt(u.lane, u.z) + 0.1, u.z)
      c.rotation.y = u.dir > 0 ? 0 : Math.PI
    }
    // 住民が歩道を歩く（少し上下に弾む）
    for (const p of peeps) {
      const u = p.userData
      if (u.frozen) continue // 検証用に凍結中（__town3dPeepPin）
      const pdx = p.position.x - active.flyPos.x, pdz = p.position.z - active.flyPos.z, pd2 = pdx * pdx + pdz * pdz
      if (!u.frozen) { const pv = pd2 < 12100; if (p.visible !== pv) p.visible = pv } // 110uより遠いpeepは描画しない＝描画コール節約（人を増やせる）
      if (pd2 > 19600) continue // 140uより遠い人は更新もしない＝他時代の上空で無駄に動かさない
      const legs = u.legs || [], arms = u.arms || []
      if (u.loiter) { // ランドマークの賑わい: 定位置の周りをゆっくり佇み歩き、体の向きを少しずつ変える
        let px = u.hx + Math.sin(t * u.sp + u.ph) * u.rad
        let pz = u.hz + Math.cos(t * u.sp * 0.8 + u.ph * 1.3) * u.rad
        if (blockedAt(px, pz)) { px = u.hx; pz = u.hz } // 揺れた先が建物なら定位置へ（食い込み防止）
        p.position.set(px, heightAt(px, pz) + Math.abs(Math.sin(t * 2.4 + u.ph)) * 0.05, pz)
        // 会話の気配（home等の人だまり）: 時々近くの人へ向き直り、しばらくそちらを向いて揺れを抑える＝「言葉を交わす」情景。
        // 見える範囲(約60u)だけ・約3秒毎に間引く近傍探索。residentの会話(be4c681)と揃えて群衆にも広げる。
        if (pd2 < 3600) {
          if (u.socialT === undefined) u.socialT = R() * 3
          u.socialT -= dt
          if (u.socialT <= 0) { u.socialT = 3 + R() * 3.4
            let best = null, bd = 10.24 // 3.2u以内の最寄りの人
            for (const o of peeps) { if (o === p || o.userData.frozen) continue; const ox = o.position.x - px, oz = o.position.z - pz, od = ox * ox + oz * oz; if (od < bd) { bd = od; best = o } }
            if (best) { u.chatFace = Math.atan2(best.position.x - px, best.position.z - pz); u.chat = 2 + R() * 2 }
          }
          if (u.chat > 0) u.chat -= dt
        }
        const chatting = u.chat > 0 && u.chatFace !== undefined
        p.rotation.y = (chatting ? u.chatFace : u.face) + Math.sin(t * 0.3 + u.ph) * (chatting ? 0.12 : 0.7) // 会話中は相手へ向き直り、見回しの揺れを抑える
        const idle = Math.sin(t * (1.2 + (u.cadMul || 1) * 0.4) + u.ph) * (0.07 + (u.armAmp || 0.3) * 0.14) // 佇み＝そっと重心を移す（深さ・速さの個体差）
        if (legs[0]) { legs[0].rotation.x = idle; legs[1].rotation.x = -idle * 0.6 } // 片脚に体重を預ける非対称＝棒立ちを脱す
        if (arms[0]) { arms[0].rotation.x = -0.05 - idle * 0.5; arms[1].rotation.x = -0.05 + idle * 0.5 } // 腕は軽く前・控えめに揺れる
        continue
      }
      u.z += u.dir * u.speed * dt
      if (u.z > 18) u.z = -52 // 本通り（商店街）の範囲を巡回＝住宅街の路地(x±3に家が建つ)へ踏み込ませない
      if (u.z < -52) u.z = 18
      // 行く手にアーケードの柱や什器があれば、少し先を見て手前から歩道幅の中で横へ寄って回り込む（throttleで負荷配慮・抜けたら元の車線へ戻る）
      if (u.baseX === undefined) { u.baseX = u.x; u.lane = u.x; u.wchk = R() * 0.25 }
      u.wchk -= dt
      if (u.wchk <= 0) { u.wchk = 0.18 + R() * 0.12
        const look = u.z + u.dir * 2.6 // 2.6u先に障害物があれば手前から避け始める
        let lane = u.baseX
        if (blockedAt(lane, look) || blockedAt(lane, u.z)) { for (const ox of [1.0, -1.0, 2.0, -2.0, 3.0, -3.0]) { if (!blockedAt(lane + ox, look) && !blockedAt(lane + ox, u.z)) { lane += ox; break } } }
        u.lane = lane
      }
      u.x += (u.lane - u.x) * Math.min(1, dt * 3.4) // 横へなめらかに寄る／戻る
      if (blockedAt(u.x, u.z)) { let snapped = false
        for (const ox of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.2, -2.2, 3.0, -3.0]) { if (!blockedAt(u.x + ox, u.z)) { u.x += ox; u.lane = u.x; snapped = true; break } } // 柱が密で寄り切れない時は最近傍の空きへ即スナップ＝貫通フレームを作らない
        if (!snapped) { u.z += u.dir * 1.4; if (u.z > 18) u.z = -52; if (u.z < -52) u.z = 18; u.x = u.baseX; u.lane = u.baseX } // それでも詰まり点(街灯+建物に挟まれ)なら一歩先へ抜ける
      }
      const cad = (6 + u.speed * 2.2) * (u.cadMul || 1), sw = Math.sin(t * cad + u.ph) // 歩調（速いほど速く運ぶ・人ごとの癖cadMul）
      p.position.set(u.x, heightAt(u.x, u.z) + Math.abs(sw) * (u.bob || 0.06), u.z) // 一歩ごとに弾む（弾みの深さも個体差）
      p.rotation.y = (u.dir > 0 ? 0 : Math.PI) + sw * (u.sway || 0) // 歩みに合わせ肩をわずかに左右へ振る癖＝生身の重心移動
      if (legs[0]) { const la = u.gaitAmp || 0.55; legs[0].rotation.x = sw * la; legs[1].rotation.x = -sw * la } // 脚を交互に（歩幅は個体差）
      if (arms[0]) { const asw = Math.sin(t * cad + u.ph + (u.armLead || 0)), aa = u.armAmp || 0.4; arms[0].rotation.x = -0.05 - asw * aa; arms[1].rotation.x = -0.05 + asw * aa } // 腕は脚とほぼ逆位相＋わずかな位相ずれ・振り幅の個体差（肘は少し前へ）
    }
    // 作り込んだ住人: エリア内をゆっくり行き交い（手足を振って歩く）、たまに佇んで見回す。
    // 近く（見える範囲）の住人だけ更新＝遠い時代エリアの人々を毎フレーム動かさない＝滑らかさを守りつつ人を増やせる。
    for (const r of residents) { const u = r.userData
      if (u.frozen) continue // 検証用に凍結中（__town3dResPin）
      const rdx = r.position.x - active.flyPos.x, rdz = r.position.z - active.flyPos.z, rd2 = rdx * rdx + rdz * rdz
      const rvis = rd2 < 12100 // 110uより遠い住人は描画しない（点でしか見えないのにメッシュ多数＝描画コール節約）
      if (r.visible !== rvis) r.visible = rvis
      if (rd2 > 19600) continue // 140uより遠い住人は更新もスキップ（再び近づく時に自然な位置にいるよう110〜140uは更新だけ続ける）
      if (u.chkT === undefined) u.chkT = R() * 0.5 // 住民ごとに位相をずらして負荷を分散
      u.chkT -= dt
      if (u.chkT <= 0) { u.chkT = 0.5 + R() * 0.4 // 押し出し判定は約0.5秒毎（blockedAtは全コライダー走査で重いため間引く）
        if (blockedAt(r.position.x, r.position.z)) { // 実機FB: 住民が建物に食い込む→近い空きへ押し出す（配置/徘徊で建物に入った時の保険）
          for (let a = 0; a < 8; a++) { const yaw = a / 8 * 6.2832, ox = Math.sin(yaw) * 0.7, oz = -Math.cos(yaw) * 0.7; if (!blockedAt(r.position.x + ox, r.position.z + oz)) { r.position.x += ox; r.position.z += oz; u.ax = r.position.x; u.az = r.position.z; break } }
          r.position.y = heightAt(r.position.x, r.position.z); u.moving = false; u.pauseT = Math.max(u.pauseT, 0.6); continue
        }
      }
      if (u.moving) {
        const dx = u.tx - r.position.x, dz = u.tz - r.position.z, d = Math.hypot(dx, dz)
        if (d < 0.28) { u.moving = false; u.pauseT = 1.5 + R() * 4 } // 着いた→ひと休み
        else {
          const step = Math.min(d, u.speed * dt), nx = r.position.x + dx / d * step, nz = r.position.z + dz / d * step
          if (blockedAt(nx, nz)) { u.moving = false; u.pauseT = 0.4 + R() * 1.4; continue } // 壁にぶつかった→止まって向き直す（建物を貫通しない）
          const ph = t * u.speed * 5.2 + u.ph, sw = Math.sin(ph)
          r.position.set(nx, heightAt(nx, nz) + Math.abs(sw) * (u.legs.length ? 0.03 : 0.014), nz) // 歩のバウンド（着物は控えめ）
          u.face = Math.atan2(dx, dz)
          for (let i = 0; i < u.legs.length; i++) u.legs[i].rotation.x = (i ? -sw : sw) * 0.5 // 脚を交互に
          for (let i = 0; i < u.arms.length; i++) u.arms[i].rotation.x = (u.arms[i].userData.base || 0) + (i ? sw : -sw) * 0.34 // 腕は逆位相
          if (u.headG) u.headG.rotation.y = Math.sin(t * 0.3 + u.ph) * 0.2
        }
      } else {
        u.pauseT -= dt
        for (let i = 0; i < u.legs.length; i++) u.legs[i].rotation.x *= Math.max(0, 1 - dt * 5)
        for (let i = 0; i < u.arms.length; i++) u.arms[i].rotation.x = (u.arms[i].userData.base || 0) - 0.05 + Math.sin(t * 1.15 + u.ph + i * 3.1) * 0.05 // 非対称＋わずかに前へ休める
        // 会話の気配（全エリア共通）: 佇んでいる間、時々近くの人へ向き直り、しばらくそちらを向いて小さくうなずく＝「言葉を交わしている」情景。
        // 見える範囲(約60u)だけ・約3秒毎に間引いて近傍探索＝負荷を抑える。u.faceを相手方向にすると本体が後段でなめらかに向き直る。
        if (rd2 < 3600) {
          if (u.socialT === undefined) u.socialT = R() * 3
          u.socialT -= dt
          if (u.socialT <= 0) { u.socialT = 2.6 + R() * 3.4
            let best = null, bd = 12.25 // 3.5u以内の最寄りの人
            for (const o of residents) { if (o === r) continue; const ox = o.position.x - r.position.x, oz = o.position.z - r.position.z, od = ox * ox + oz * oz; if (od < bd) { bd = od; best = o } }
            if (best) { u.face = Math.atan2(best.position.x - r.position.x, best.position.z - r.position.z); u.chat = 2.2 + R() * 2.2; u.pauseT = Math.max(u.pauseT, u.chat + 0.4) } // 相手へ向き直り、会話が済むまで留まる
          }
          if (u.chat > 0) u.chat -= dt
        }
        const chatting = u.chat > 0
        if (u.headG) { u.headG.rotation.y = Math.sin(t * (chatting ? 1.1 : 0.22) + u.ph) * (chatting ? 0.16 : 0.5); u.headG.position.y = 1.6 + Math.sin(t * (chatting ? 2.4 : 1.5) + u.ph) * (chatting ? 0.01 : 0.004) } // 会話中は相手へ頭を落ち着け、相槌のように小さく速くうなずく
        if (u.pauseT <= 0) { const a = R() * 6.28, rr = 1.5 + R() * u.rad, nx = u.ax + Math.cos(a) * rr, nz = u.az + Math.sin(a) * rr
          if (heightAt(nx, nz) > SEA.level + 0.6) { u.tx = nx; u.tz = nz; u.moving = true } else u.pauseT = 1 + R() * 2 }
      }
      let ddy = u.face - r.rotation.y; while (ddy > Math.PI) ddy -= 6.2832; while (ddy < -Math.PI) ddy += 6.2832
      r.rotation.y += ddy * Math.min(1, dt * 6) // 進行方向へなめらかに向き直る
    }
    // 港町の少女（一枚絵の立ち絵）は常にカメラの方を向く
    for (const sp of standees) sp.rotation.y = Math.atan2(camera.position.x - sp.position.x, camera.position.z - sp.position.z)
    // 静的な群衆の近接微揺れ（市の人だかり等が「蝋人形」に見えないよう、近くの者だけそっと向きを変え重心を移す。アート監督致命3）。
    for (const m of crowdAnim) { const u = m.userData; if (u.walker) continue
      const cdx = m.position.x - active.flyPos.x, cdz = m.position.z - active.flyPos.z; if (cdx * cdx + cdz * cdz > 2700) continue // 近く(約52u)だけ＝負荷を抑える
      m.rotation.y = u.crot + Math.sin(t * (u.cswSpd || 0.4) + u.cph) * (u.cswAmp || 0.22) // 見回し（振れ幅・速さは個体差）
      m.rotation.z = (u.cLean || 0) * (0.7 + 0.3 * Math.sin(t * 0.5 + u.cph)) // 片足重心の傾き癖＝棒立ちの同期を脱す（足元支点なので自然な立ち姿）
      m.position.y = u.cy0 + Math.abs(Math.sin(t * (u.cbobSpd || 1.3) + u.cph)) * 0.026 } // 呼吸のような弾み（速さの個体差）
    // 木がそよ風に揺れる。低空で自機が近くを過ぎると、その風圧で外側へなびく（通過の余波）。
    const wakeOn = active && active.mode === 'fly' && active.flyP > 0.5
    const wakeSpd = wakeOn ? Math.min(1, Math.hypot(active.vel.x, active.vel.z) / FLY.speed) : 0
    for (const tr of treesArr) {
      let wake = tr.userData.wake || 0
      if (wakeOn && wakeSpd > 0.1) {
        const dx = tr.position.x - active.flyPos.x, dz = tr.position.z - active.flyPos.z
        const dh = Math.hypot(dx, dz), dy = active.flyPos.y - (tr.position.y + 5)
        if (dh < 9 && dy < 12 && dy > -4) {
          const target = (1 - dh / 9) * wakeSpd * 0.4 * (dx >= 0 ? 1 : -1) // 自機の外側へ倒れる
          if (Math.abs(target) > Math.abs(wake)) wake = target
        }
      }
      wake *= 0.92; tr.userData.wake = wake // 余波はゆっくり戻る
      tr.rotation.z = tr.userData.tilt + Math.sin(t * 0.8 + tr.userData.ph) * tr.userData.amp + wake
      // 歩行で近づいた木の樹冠を半透明にフェード＝幹(統合で残る)を残して視界が抜ける。飛行/窓辺では不透明。
      const leaf = tr.children[0]
      if (leaf) {
        const walkFade = active && active.mode === 'walk' && active.flyP > 0.5
        let dc = 99
        if (walkFade) { const dxc = tr.position.x - active.flyPos.x, dzc = tr.position.z - active.flyPos.z; dc = Math.hypot(dxc, dzc) }
        if (walkFade && dc < 4.4) {
          if (!tr.userData.fadeMat) { tr.userData.origMat = leaf.material; tr.userData.fadeMat = leaf.material.clone(); tr.userData.fadeMat.transparent = true }
          if (leaf.material !== tr.userData.fadeMat) leaf.material = tr.userData.fadeMat
          const op = Math.max(0.1, Math.min(1, (dc - 1.4) / 2.6)) // 近いほど薄く（真下=ほぼ透明→4uで不透明）
          tr.userData.fadeMat.opacity = op; tr.userData.fadeMat.depthWrite = op > 0.65
        } else if (tr.userData.fadeMat && leaf.material === tr.userData.fadeMat) { leaf.material = tr.userData.origMat } // 遠ざかる/飛行で不透明に戻す
      }
    }
    // 電線のスズメ＝時々ぴょこっと跳ねて尾を振る（窓辺の微小イベント＝静止した影でなく生きた小鳥）。
    // 深い高空(town非表示)では更新を省く。十数羽ぶんの軽い計算。
    if (sparrows.length && (active.mode === 'window' || (active.flyP || 0) < 0.85)) {
      for (const sp of sparrows) {
        sp.hopT -= dt
        if (sp.hopT <= 0) { sp.hop = 1; sp.hopT = 4 + Math.random() * 11 } // 数秒おきにひと跳ね
        if (sp.hop > 0) sp.hop = Math.max(0, sp.hop - dt * 2.6)
        const hk = sp.hop > 0 ? Math.sin((1 - sp.hop) * Math.PI) : 0 // 跳ねの山(0→1→0)
        sp.g.position.y = sp.py + Math.sin(t * 0.7 + sp.ph) * 0.004 + hk * 0.05 // 呼吸の微動＋跳ねの上下
        sp.tail.rotation.x = 0.55 + Math.sin(t * 1.4 + sp.ph) * 0.05 + hk * 0.35 // 尾をひょいと上げる
        sp.g.rotation.y = sp.ry + hk * (sp.ph > 3.14 ? 0.4 : -0.4) // 跳ねると向きが少し変わる
      }
    }
    // アドバルーンがふわり揺れる
    for (const ab of adBalloons) { ab.rotation.z = Math.sin(t * 0.6) * 0.05; ab.position.x += Math.sin(t * 0.5) * 0.002 }
    // 観覧車がゆっくり回り、ゴンドラは水平を保つ
    if (ferris) {
      ferris.wheel.rotation.z += dt * 0.12
      const wr = ferris.wheel.rotation.z
      for (const g of ferris.gondolas) g.rotation.z = -wr
    }
    if (carousel) carousel.rotation.y += dt * 0.3 // メリーゴーラウンドがゆっくり回る
    if (teacups) { teacups.rotation.y += dt * 0.5; for (const cup of teacups.children) cup.rotation.y -= dt * 1.1 } // 台が回り、各カップは逆に回る
    for (const sp of steamPuffs) { const cy = (t * 0.5 + sp.ph) % 2.4, p = cy / 2.4; sp.mesh.position.y = sp.base + p * 1.7; sp.mesh.position.x = 0.4 + Math.sin(t * 1.3 + sp.ph) * 0.18; sp.mesh.material.opacity = 0.32 * Math.sin(p * Math.PI); sp.mesh.scale.setScalar(0.55 + p * 0.8) } // 屋台の湯気が立ちのぼる
    for (const d of festDancers) { const s = Math.sin(t * 1.5 + d.ph) // 盆踊り: 腕を上げ下げし、体が弾む
      if (d.cx !== undefined) { d.ang += dt * 0.12; const x = d.cx + Math.cos(d.ang) * d.rad, z = d.cz + Math.sin(d.ang) * d.rad; d.d.position.x = x; d.d.position.z = z; d.d.rotation.y = Math.atan2(d.cx - x, d.cz - z) } // 輪になって少しずつ回る（中心を向いて周回）
      const up = (d.amp || 0.5) * (0.5 + s * 0.5) // 両腕を上げ下げ（makeResident＝肩で振れる二本の腕。ampで踊り手は大きく見物客は控えめに）
      if (d.arms) { d.arms[1].rotation.z = 0.12 + up; d.arms[0].rotation.z = -(0.12 + up) }
      else if (d.arm) d.arm.rotation.z = -0.3 - s * 0.55
      d.d.position.y = d.y0 + Math.abs(s) * 0.07 * (d.amp ? Math.min(1, d.amp * 2) : 1) }
    // 犬猫馬: 尾を振り・首を傾げ・たまに数歩あるく（佇む人形にしない）。近いものだけ更新＝遠い時代の動物は止める。
    for (const q of quads) { const u = q.userData
      const qdx = q.position.x - active.flyPos.x, qdz = q.position.z - active.flyPos.z; if (qdx * qdx + qdz * qdz > 14000) continue
      if (u.tailG) u.tailG.rotation.y = Math.sin(t * 2.4 + u.ph) * 0.35 // 尾を振る
      if (u.headG) u.headG.rotation.y = Math.sin(t * 0.5 + u.ph) * 0.45 // 首を傾げて見回す
      if (u.moving) {
        const dx = u.tx - q.position.x, dz = u.tz - q.position.z, d = Math.hypot(dx, dz)
        if (d < 0.18) { u.moving = false; u.moveT = 3 + Math.random() * 7 }
        else { const step = Math.min(d, u.speed * dt), nx = q.position.x + dx / d * step, nz = q.position.z + dz / d * step
          if (blockedAt(nx, nz)) { u.moving = false; u.moveT = 2 + Math.random() * 3 }
          else { q.position.set(nx, heightAt(nx, nz), nz); u.face = Math.atan2(dx, dz); q.rotation.y = u.face; for (let li = 0; li < u.legs.length; li++) u.legs[li].rotation.x = Math.sin(t * 7 + u.ph + li * 1.6) * 0.5 } } // 脚を交互に運ぶ
      } else { u.moveT -= dt; for (const lg of u.legs) lg.rotation.x *= 0.85 // 止まると脚を戻す
        if (u.moveT <= 0) { const a = Math.random() * 6.28, rr = 1.5 + Math.random() * 3.5, nx = u.hx + Math.cos(a) * rr, nz = u.hz + Math.sin(a) * rr
          if (heightAt(nx, nz) > SEA.level + 1 && !blockedAt(nx, nz)) { u.tx = nx; u.tz = nz; u.moving = true } else u.moveT = 1.5 + Math.random() * 2 } }
    }
    for (const k of koinobori) { k.grp.rotation.y = Math.sin(t * 1.1 + k.ph) * 0.32; k.grp.rotation.z = 0.05 + Math.sin(t * 0.85 + k.ph) * 0.12 } // 鯉のぼりが風になびく
    // 干し物・布団が風にそよぐ（街が呼吸する）。竿の根元を軸にゆらし、時々ふっと強い風（突風）で大きくなびく。歩く目線/低空でのみ更新＝高空は省く。
    if (clothSway.length && (active.mode !== 'fly' || (active.flyP || 0) < 0.8)) {
      const gust = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.17 + 1.3) // 0..1 のゆるい突風の波
      for (const c of clothSway) {
        const w = (0.5 + gust * 0.9) * c.ax // 突風で振れ幅が増す
        c.g.rotation.z = Math.sin(t * (0.9 + c.ax) + c.ph) * w + Math.sin(t * 2.3 + c.ph) * 0.03 // 横揺れ（大きなうねり＋細かなはためき）
        c.g.rotation.x = Math.sin(t * 1.3 + c.ph * 1.7) * w * 0.4 // 奥行きへの揺れ
      }
    }
    // 夜の窓のテレビの青い明滅（茶の間で誰かがテレビを観ている＝在宅の気配）。明るさを不規則にちらつかせ、時々ふっと場面が変わる。
    if (tvGlow.length && (active.mode !== 'fly' || (active.flyP || 0) < 0.85)) {
      for (const tv of tvGlow) {
        const f = 0.62 + 0.38 * Math.abs(Math.sin(t * 2.3 + tv.ph) * Math.sin(t * 0.73 + tv.ph * 1.7)) + (Math.sin(t * 9.1 + tv.ph) > 0.97 ? 0.25 : 0) // ゆらぎ＋時々の場面転換のフラッシュ
        tv.mat.color.copy(tv.base).multiplyScalar(Math.min(1.2, f))
      }
    }
    for (const sb of swanBoats) { const u = sb.userData, a = t * 0.25 + u.ph; sb.position.set(u.cx + Math.cos(a) * u.rad, sb.position.y, u.cz + Math.sin(a) * u.rad); sb.rotation.y = -a + Math.PI / 2 } // スワンボートが池を漂う
    for (const b of boats) { b.position.y = SEA.level + 0.15 + Math.sin(t * 0.8 + b.userData.ph) * 0.12; b.rotation.z = Math.sin(t * 0.7 + b.userData.ph) * 0.05 } // 小舟が波に揺れる
    if (seaTex) { seaTex.offset.y = (t * 0.012) % 1; seaTex.offset.x = Math.sin(t * 0.06) * 0.01 } // 海面のさざ波がゆっくり流れる
    if (seaUniforms) seaUniforms.uTime.value = t // 海面のうねり・きらめきの位相
    freshUniforms.uTime.value = t // 川・池のきらめきの位相
    if (lightBeam) lightBeam.rotation.y = t * 0.5 // 灯台の光芒が回る
    for (const g of gulls) { const u = g.userData, a = t * u.sp + u.ph; g.position.set(u.cx + Math.cos(a) * u.rad, u.y + Math.sin(a * 2) * 0.7, u.cz + Math.sin(a) * u.rad); g.rotation.y = -a - (u.sp > 0 ? Math.PI / 2 : -Math.PI / 2); const fl = Math.sin(t * 7 + u.ph) * 0.5; if (u.wings) { u.wings[0].rotation.x = fl; u.wings[1].rotation.x = -fl } } // 海鳥が旋回しはばたく（翼=内羽+折れ外羽の2節groupを羽ばたかせる）
    for (const c of critters) {
      const dxc = c.cx - active.flyPos.x, dyc = c.cy - active.flyPos.y, dzc = c.cz - active.flyPos.z // 近い時だけ＝目線で舞い、俯瞰では消す（白い羽が点に見えるのを防ぐ・軽量）
      if (dxc * dxc + dyc * dyc + dzc * dzc > 2025) { if (c.g.visible) c.g.visible = false; continue }
      if (!c.g.visible) c.g.visible = true
      const a = t * 0.55 + c.ph // 蝶/蜻蛉がふわふわ舞う
      if (c.type === 'fly') { c.g.position.set(c.cx + Math.cos(a) * c.rad, c.cy + Math.sin(a * 1.7) * 0.7, c.cz + Math.sin(a * 0.8) * c.rad); c.g.rotation.y = a; const f = Math.sin(t * 9 + c.ph) * 1.2; c.g.children.forEach((w) => { w.rotation.y = w.userData.side * f }) }
      else { c.g.position.set(c.cx + Math.cos(a * 1.5) * c.rad, c.cy + Math.sin(a * 2.2) * 0.4, c.cz + Math.sin(a * 1.2) * c.rad); c.g.rotation.y = a * 1.5 + Math.PI / 2 } }
    if (crane) { // クレーンのトロリーが横行し、フックが上下する（荷役）
      const tx2 = 5.5 + Math.sin(t * 0.22) * 7, hy = 6.2 + Math.sin(t * 0.5) * 2.6
      crane.trolley.position.x = tx2
      crane.hook.position.set(tx2, hy, 0)
      crane.hcable.position.set(tx2, (12 + hy) / 2, 0); crane.hcable.scale.y = Math.max(0.2, 12 - hy)
    }
    if (tug) { // タグボートが湾をゆっくり巡る
      const u = tug.userData, a = t * 0.1
      const x = u.cx + Math.cos(a) * u.rad, z = u.cz + Math.sin(a) * u.rad * 0.6
      tug.position.set(x, SEA.level + 0.2 + Math.sin(t * 0.8) * 0.1, z)
      tug.rotation.y = -a + Math.PI / 2; tug.rotation.z = Math.sin(t * 0.7) * 0.04
    }
    for (const fj of fishJumps) { // 魚が放物線で跳ね、波紋が広がる
      const cy = (t - fj.t0) % fj.period
      if (cy < fj.jumpDur) { const p = cy / fj.jumpDur; fj.fish.visible = true; fj.fish.position.set(fj.x, SEA.level + Math.sin(p * Math.PI) * 2.2, fj.z); fj.fish.rotation.z = (p - 0.5) * 2.4 } else fj.fish.visible = false
      const rd = 2.2 // 波紋の寿命
      if (cy < rd) { fj.ripple.visible = true; const rp = cy / rd; fj.ripple.scale.setScalar(0.3 + rp * 3.0); fj.ripple.material.opacity = 0.45 * (1 - rp) } else fj.ripple.visible = false
    }
    for (const g of balloons) { // 熱気球が空をゆっくり漂う
      const u = g.userData, a = t * u.sp + u.ph
      g.position.set(u.cx + Math.cos(a) * u.rad, u.y + Math.sin(t * 0.25 + u.ph) * 1.6, u.cz + Math.sin(a) * u.rad * 0.7)
      g.rotation.y = a * 0.5; g.rotation.z = Math.sin(t * 0.35 + u.ph) * 0.045
    }
    if (ferry) { // 連絡船が湾を大きな楕円で渡る
      const u = ferry.userData, a = -t * 0.07 + 1.2 // タグと逆回りでゆっくり
      const x = u.cx + Math.cos(a) * u.rx, z = u.cz + Math.sin(a) * u.rz
      const x2 = u.cx + Math.cos(a + 0.02) * u.rx, z2 = u.cz + Math.sin(a + 0.02) * u.rz
      ferry.position.set(x, SEA.level + 0.2 + Math.sin(t * 0.6) * 0.08, z)
      ferry.rotation.y = Math.atan2(x2 - x, z2 - z); ferry.rotation.z = Math.sin(t * 0.5) * 0.025
    }
    for (const tr of [train, train2]) if (tr) { // 電車が線路を走る（端まで行くと反対端から再び現れる）
      const u = tr.userData
      // 各駅停車（train のみ）: 駅(x≈30)の手前で減速・停車し、しばらくして発車する
      let move = true
      if (u.stops) {
        const sX = 25 // 編成中央がホーム中央(x≈34)に来る停車位置（u.xは最後尾）
        if (!u.stopDone && u.x > sX - 7 && u.x < sX) { u.speed2 = Math.max(0, u.speed * (sX - u.x) / 7) } // 減速
        else u.speed2 = u.speed
        if (!u.stopDone && u.x >= sX - 0.3) { if (!u.stopUntil) u.stopUntil = t + 3.2; if (t < u.stopUntil) move = false; else { u.stopDone = true } } // 停車→発車
        if (u.stopDone && u.x > sX + 10) { u.stopDone = false; u.stopUntil = 0 } // 駅を出たら次の周回用にリセット
      }
      if (move) u.x += (u.stops ? (u.speed2 ?? u.speed) : u.speed) * dt
      if (u.x > RAIL.x1 + 2) { u.x = RAIL.x0 - u.len; u.stopDone = false; u.stopUntil = 0 }
      tr.position.set(u.x, 0, RAIL.z)
      for (const car of tr.children) { // レールの敷かれた範囲(x0..x1)の外に出た車両は隠す＝庭や池の上を線路なしで走る見えを断つ
        const wx = u.x + car.userData.ox
        car.position.y = heightAt(wx, RAIL.z) + 0.05
        car.visible = wx >= RAIL.x0 - 0.6 && wx <= RAIL.x1 + 0.6
      }
    }
    if (crossing && train) { // 踏切: 電車が近づくと遮断機が下り、警報灯が交互に点滅
      const active = Math.abs(train.userData.x - crossing.cx) < 13
      for (const pv of crossing.gates) { const target = active ? 0 : pv.userData.barDir * 1.45; pv.rotation.z += (target - pv.rotation.z) * Math.min(1, dt * 3) }
      const blink = Math.sin(t * 7) > 0
      for (const pair of crossing.lamps) { pair[0].material.color.setHex(active && blink ? 0xff3020 : 0x4a1410); pair[1].material.color.setHex(active && !blink ? 0xff3020 : 0x4a1410) }
    }
    // 雪／花びらが舞い降りる（横にゆらぎ、地面付近で空へ戻して循環）
    if (weatherPts) {
      const { pos, spd, phs, N, swirl } = weatherPts
      // 窓辺(室内)では雪/花びらが部屋の中に降らないよう、部屋のAABB内の粒を窓の外(町側=-z)へ送る＝畳/猫に降る違和感を断つ。
      const wm = winRoom && (active.flyP || 0) < 0.5, rcx = wm ? winRoom.position.x : 0, rcz = wm ? winRoom.position.z : 0, rcy = wm ? winRoom.position.y : 0
      for (let i = 0; i < N; i++) {
        const k = i * 3
        pos[k + 1] -= spd[i] * dt
        pos[k] += Math.sin(t * 0.6 + phs[i]) * swirl * dt
        pos[k + 2] += Math.cos(t * 0.4 + phs[i]) * swirl * 0.4 * dt
        if (pos[k + 1] < -14) { pos[k + 1] = 66 + R() * 12; pos[k] = (R() - 0.5) * 200 }
        if (wm && Math.abs(pos[k] - rcx) < 6.5 && pos[k + 2] > rcz - 1.5 && pos[k + 2] < rcz + 9 && pos[k + 1] > rcy - 2.5 && pos[k + 1] < rcy + 6) { pos[k + 2] = rcz - 8 - R() * 40 } // 室内の粒は窓の外へ
      }
      weatherPts.pts.geometry.attributes.position.needsUpdate = true
    }
    if (seasonFall) { // 季節の降りもの（公園のあたりに舞う花びら/落ち葉。範囲内で循環）
      const f = seasonFall
      for (let i = 0; i < f.N; i++) {
        const k = i * 3
        f.pos[k + 1] -= f.spd[i] * dt
        f.pos[k] += Math.sin(t * 0.7 + f.phs[i]) * f.swirl * dt
        f.pos[k + 2] += Math.cos(t * 0.5 + f.phs[i]) * f.swirl * 0.4 * dt
        if (f.pos[k + 1] < f.floor) { f.pos[k + 1] = f.floor + 18 + Math.random() * 4; f.pos[k] = f.bx + (Math.random() - 0.5) * f.R0 * 2; f.pos[k + 2] = f.bz + (Math.random() - 0.5) * f.R0 * 2 }
      }
      f.pts.geometry.attributes.position.needsUpdate = true
    }
    // （近景の舞い散り nearFall の更新は、カメラ位置 camX/camY/camZ と flyAmt/isWalk が確定する後段＝光の粒(motes)の隣で行う。
    //   ここ(宣言前)で参照すると flyAmt/isWalk/camX… が TDZ となり角部屋など nearFall を持つ情景の3D描画が丸ごと落ちていた）
    // 鳥がはばたきながら空を渡る。自機が近いと驚いて上へ逃げ、羽ばたきが大きくなる（＋羽音）。
    const flyerAloft = active && (active.mode === 'fly' || active.mode === 'walk') && active.flyP > 0.5
    birdFlushCool = Math.max(0, birdFlushCool - dt)
    for (const b of birds) {
      const u = b.userData
      const a = t * u.sp + u.ph
      const prev = u.startle || 0
      let st = prev * 0.98 // 驚きはゆっくり収まる
      if (flyerAloft) {
        const dx = b.position.x - active.flyPos.x, dy = b.position.y - active.flyPos.y, dz = b.position.z - active.flyPos.z
        const near = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (near < 15) st = Math.max(st, 1 - near / 15)
      }
      if (st > 0.4 && prev <= 0.4 && birdFlushCool <= 0) { onBirdFlush(); birdFlushCool = 1.6 } // 新たに驚いた瞬間に羽音（連発を抑制）
      u.startle = st
      b.position.set(u.cx + Math.cos(a) * u.rad, u.yy + st * 7 + Math.sin(a * 0.7) * 2.0, u.cz + Math.sin(a) * u.rad)
      b.rotation.y = -a // 弧の接線方向へ機首（かもめは+z向き。円周(cos a, sin a)の接線=(-sin a, cos a)）
      const flap = Math.sin(t * 9 + u.ph) * (0.5 + st * 0.5)
      for (const w of b.userData.wings) w.rotation.z = w.userData.side * flap // 翼だけ回す（children全走査だと胴にside=undefined→NaN回転で胴が消えていた）
    }
    // つかの間の道連れ: 飛行中にたまに一羽が現れ、横に並んで伴走し、終盤は離れていく。
    compCool = Math.max(0, compCool - dt)
    const flyingFast = active && active.mode === 'fly' && active.flyP > 0.6 && Math.hypot(active.vel.x, active.vel.z) > FLY.speed * 0.3
    if (!compActive && flyingFast && compCool <= 0 && Math.random() < dt * 0.05) {
      compActive = true; compT = 9 + Math.random() * 8; compSide = Math.random() < 0.5 ? -1 : 1
      comp.position.set(active.flyPos.x - active.vel.x * 0.3, active.flyPos.y - 1, active.flyPos.z - active.vel.z * 0.3); comp.visible = true
    }
    if (compActive) {
      compT -= dt
      const sp = Math.hypot(active.vel.x, active.vel.z) || 1
      const fx = active.vel.x / sp, fz = active.vel.z / sp, rx = -fz, rz = fx // 進む向きと右（水平）
      const peel = compT < 1.6 ? (1.6 - compT) * 5 : 0 // 終盤は外へ離れる
      const tx = active.flyPos.x + (compSide * 3.2 + peel * compSide) * rx + fx * 2.4 // 横3.2m・前2.4m＝表情が見える近さ（実機FB: 5mは遠かった）
      const ty = active.flyPos.y + 0.5 + Math.sin(t * 0.7) * 0.6 + peel * 1.0
      const tz = active.flyPos.z + (compSide * 3.2 + peel * compSide) * rz + fz * 2.4
      comp.position.x += (tx - comp.position.x) * 0.06
      comp.position.y += (ty - comp.position.y) * 0.06
      comp.position.z += (tz - comp.position.z) * 0.06
      comp.rotation.y = Math.atan2(fx, fz)
      const cflap = Math.sin(t * 6 + compPhase) * 0.5 + 0.06 // ゆっくり羽ばたき＋ごく浅い上反りの滑空（翼だけを動かす。胴/くちばしは不動）
      for (const w of comp.userData.wings) w.rotation.z = w.userData.side * cflap
      if (compT <= 0 || !active || active.mode !== 'fly') { compActive = false; comp.visible = false; compCool = 22 + Math.random() * 26 }
    }
    // 窓あけ／乗り出しの「線形進行(0..1)」を所要時間ぶんだけ目標へ一定速度で進め、ease-in-out をかける。
    // exp追従(従来)は出だしだけ急＝ease-outで戻りが不自然だった。線形進行+smoothstepなら開く時も
    // 戻る時も出だし・止まり際の両方がそっと加減速する＝ヌルヌルで酔わない窓の開閉・覗き込みになる。
    active.winOpenP = approach(active.winOpenP, active.winOpenTarget, dt / CAM.winOpenDur)
    active.leanP = approach(active.leanP, active.leanTarget, dt / CAM.leanDur)
    active.flyP = approach(active.flyP, active.flyTarget, dt / FLY.enterDur) // 空へ／窓へを所要時間で滑らかに
    const wo = easeInOut(active.winOpenP)
    const lean = easeInOut(active.leanP)
    const flyAmt = easeInOut(active.flyP) // 0=窓 / 1=空（カメラ位置・視線・画角をこの量で混ぜる）
    // 踏み出す閾: 窓を越える序盤(flyP 0→0.45)だけ立ち上がる山型。部屋から夢の空へ身を乗り出して踏み出す一瞬の身体性。
    const thr = (active.flyTarget > 0.5 && active.flyP > 0.001 && active.flyP < 0.5) ? Math.sin(Math.min(1, active.flyP / 0.45) * Math.PI) : 0
    { const openOp = thr * 0.34; if (Math.abs(openOp - openCur) > 0.015) { openCur = openOp; openFlash.style.opacity = openOp.toFixed(2) } } // 光がふわっと開ける
    // 日の傾き（ドリフト）：原色→金色を dd(0..1) で補間し直し、空(skyTop0/skyHor0)・霧(baseFogCol)・方向光の base を
    // 一括で動かす＝窓辺/飛行/歩行が同じ時刻で連動する。累積しない（毎フレーム原色から）。
    if (drift.on && !drift.stay) drift.t = Math.min(DRIFT_SECS, drift.t + dt)
    { const dd = drift.on ? drift.t / DRIFT_SECS : 0
      skyTop0.copy(SKY_TOP_O).lerp(GOLD_TOP, dd); skyHor0.copy(SKY_HOR_O).lerp(GOLD_HOR, dd); baseFogCol.copy(FOG_O).lerp(GOLD_FOG, dd)
      sun.intensity = SUN_INT_O * (1 - 0.2 * dd); sun.color.copy(SUN_COL_O).lerp(GOLD_SUN, dd) }
    // 水面が映す空も日の傾きへ追従＝夕方は海/川/運河/池も金色に染まる（評価アート/エンジニア: uSkyがmount時固定で水だけ昼のままだった）。色コピーのみで軽い。
    freshUniforms.uSky.value.copy(skyHor0); freshUniforms.uSky2.value.copy(skyTop0)
    if (seaUniforms) { seaUniforms.uSky.value.copy(skyHor0); seaUniforms.uSky2.value.copy(skyTop0) }
    { const dp = drift.on ? drift.t / DRIFT_SECS : 0; if (Math.abs(dp - lastDayPhase) > 0.03) { lastDayPhase = dp; onDayPhase(dp) } } // 音も時刻に連れ添う（夕方は外音がやわらぐ）。変化時だけ通知
    // 別世界感: 飛ぶほど霧を晴らして遠くの街を壮大に見せ、目的地に近いほどその時代の空気（色・露出）へ移す。
    if (flyAmt > 0.02) {
      active.fogTouched = true
      const fp = active.flyPos
      // リベール範囲を広げ(230)、近づくほど強く霧を晴らす(最大fog.far≈3.3倍)＝霞の向こうから街全体が早めに立ち上がる。
      // 拠点は現代から470/486・互いに618離れているので、この広い晴らしでも現代や別の時代と共視界に入らない。
      const edoP = flyAmt * Math.max(0, 1 - Math.hypot(fp.x - EDO.x, fp.z - EDO.z) / 255)
      const senP = flyAmt * Math.max(0, 1 - Math.hypot(fp.x - SENGOKU.x, fp.z - SENGOKU.z) / 255)
      const taiP = flyAmt * Math.max(0, 1 - Math.hypot(fp.x - TAISHO.x, fp.z - TAISHO.z) / 255)
      const eraMax = Math.max(edoP, senP, taiP)
      const clear = flyAmt * (0.55 + 1.9 * eraMax) // 飛ぶと少し晴れ(白いモヤの圧迫を緩める)、目的地に近いほど大きく晴れて街が広く見える
      // 実機FB「現代home上空が全体に乳白色のもやで曇る」→ home上空(時代から遠い)でだけ霧を大きく奥へ晴らして街をくっきり見せる。
      // この追加の晴らしは時代に近づくと(eraMaxが上がると)消える＝時代付近の far は従来どおりで共視界(470離れた島)は維持。
      const homeClarity = flyAmt * (1 - eraMax)
      // 霧の「始まり(near)」を大きく奥へ押し出す＝今飛んでいる近距離はくっきり見える（実機FB「飛行中に近くの海面まで白い」）。near<far を保証。
      scene.fog.near = FOG.near * (1 + clear * 3.6 + homeClarity * 1.7); scene.fog.far = Math.max(scene.fog.near + 20, FOG.far * (1 + clear) + homeClarity * 110)
      TMP_FOGC.copy(baseFogCol)
      TMP_FOGC.lerp(FLIGHT_WARM, flyAmt * 0.4) // 渡りの霧を冷たい白から懐かしい琥珀色へ＝エモい/ノスタルジックに
      if (edoP > 0.001) TMP_FOGC.lerp(EDO_FOGC, edoP * 0.56) // 近づく霞を時代の色(金茶)へ＝白い空虚でなく空気のある遠景
      if (senP > 0.001) TMP_FOGC.lerp(SEN_FOGC, senP * (isNight ? 0.72 : 0.58)) // 戦国は別世界の空気へ（昼は控えめにして washy を防ぐ・夜は冷たく薄暗く）
      if (taiP > 0.001) TMP_FOGC.lerp(TAISHO_FOGC, taiP * (isNight ? 0.58 : 0.46)) // 大正は暖かなセピアの港町の空気へ（昼は弱め＝白い乳白ピンクに溶けるのを防ぎ運河/建物のコントラストを残す）
      scene.fog.color.copy(TMP_FOGC)
      renderer.toneMappingExposure = baseExposure * (1 - edoP * 0.03 - senP * (isNight ? 0.14 : 0.07) + taiP * 0.03) // 戦国=夜は暗い山城/昼は控えめに翳らす(washy回避)・江戸=明るい城下/大正=ほの明るい港町
      // 空ドームも飛行中は黄昏の暖色へ寄せる＝世界全体が懐かしい色になり、白いモヤの孤独感でなく心地よい郷愁に。
      // 時代に着いたらその色が勝つよう、純粋な「渡りの空」は近接していない時(街色 prox が低い時)ほど強く効かせる。
      const skyWarm = flyAmt * 0.5 * (1 - 0.6 * Math.max(edoP, senP, taiP))
      skyUniTop.value.copy(skyTop0).lerp(SKY_WARM_TOP, skyWarm)
      skyUniBot.value.copy(skyHor0).lerp(SKY_WARM_BOT, skyWarm)
      // 天上界の光: 雲海（高度SEA_Y付近〜）に出ると、情景の時刻によらず常に幻想的な金桃の magic hour の空気へ寄せる＝下界の街とは明確に別世界（差別化の核）。時代に近い時は控える（時代の空気を優先）。
      const aloft = active.mode === 'walk' ? 0 : Math.max(0, Math.min(1, (active.flyPos.y - (SEA_Y - 6)) / 26)) * flyAmt * (1 - 0.7 * eraMax)
      if (aloft > 0.01) {
        TMP_FOGC.lerp(CEL_FOG, aloft * 0.5); scene.fog.color.copy(TMP_FOGC) // 雲海の空気を金桃/菫へ
        skyUniTop.value.lerp(CEL_SKY_TOP, aloft * 0.5); skyUniBot.value.lerp(CEL_SKY_BOT, aloft * 0.58) // 空ドームも天上の色へ
        renderer.toneMappingExposure *= (1 + aloft * 0.045) // ほのかに発光（白飛びを避ける微量）
      }
      // 別世界グレード: 近づいた時代の色で画面全体をそっと染める（近景まで時代の空気に＝霧だけでは出ない「入る」気配）。
      const eMax = Math.max(edoP, senP, taiP)
      const eraCol = eMax < 0.05 ? '' : (edoP >= senP && edoP >= taiP ? (isNight ? '92,76,50' : '226,170,82') : (senP >= taiP ? (isNight ? '40,52,68' : '74,102,130') : (isNight ? '78,56,66' : '216,154,122')))
      const eraOp = Math.min(0.26, eMax * 0.36) // 通常合成の控えめな色フィルム＝別世界の空気（濃すぎると安いフィルタになる）
      if (Math.abs(eraOp - eraGradeCur) > 0.02 || eraCol !== eraColCur) { eraGradeCur = eraOp; eraColCur = eraCol; if (eraCol) eraGrade.style.backgroundColor = `rgb(${eraCol})`; eraGrade.style.opacity = eraOp.toFixed(2) }
    } else {
      // 窓辺/室内: 日の傾きでドリフトした基準色をそのまま使う（毎フレーム反映＝ぼーっと眺めるうちに陽が傾く）。色のコピーだけで軽い。
      active.fogTouched = false
      scene.fog.near = FOG.near; scene.fog.far = FOG.far; scene.fog.color.copy(baseFogCol); renderer.toneMappingExposure = baseExposure
      skyUniTop.value.copy(skyTop0); skyUniBot.value.copy(skyHor0)
      if (eraGradeCur > 0.001) { eraGradeCur = 0; eraGrade.style.opacity = '0' } // 別世界グレードも解く
    }
    // 別世界の気配: 時代の粒子（江戸=桜/蛍・戦国=火の粉）と霞の帯の白いベール（関門をくぐる瞬間に白む）
    if (flyAmt > 0.02) {
      const fp = active.flyPos, dEdo = Math.hypot(fp.x - EDO.x, fp.z - EDO.z), dSen = Math.hypot(fp.x - SENGOKU.x, fp.z - SENGOKU.z), dTai = Math.hypot(fp.x - TAISHO.x, fp.z - TAISHO.z)
      const updFx = (fx, prox, fall) => { if (!fx) return; const p = fx.g.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) + fall * dt * (1.2 + (i % 5) * 0.32); if (fall < 0 && y < fx.y0) y = fx.y0 + fx.yH; else if (fall > 0 && y > fx.y0 + fx.yH) y = fx.y0; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t * 0.45 + fx.ph[i]) * dt * 0.9) } p.needsUpdate = true; fx.m.opacity = Math.min(isNight ? 0.82 : 0.34, prox * 0.95) } // 昼は淡い陽炎/塵程度（明色の粒で景色を白く濁らせない）。夜は篝火・蛍の粉として映える
      updFx(edoFx, flyAmt * Math.max(0, 1 - dEdo / 130), isNight ? 0.38 : -0.95) // 夜の蛍はゆらり昇る/昼の桜はゆっくり散る
      updFx(senFx, flyAmt * Math.max(0, 1 - dSen / 130), 1.05) // 火の粉はゆっくり昇る
      updFx(taiFx, flyAmt * Math.max(0, 1 - dTai / 130), isNight ? 0.42 : -0.7) // 大正: 夜の灯の粉は昇る/昼の花びらは散る
      // 関門(霞の帯)を儀式のようにくぐる: 帯を広げて白に包まれる間を延ばし(pk幅0.22)、その間は自動で減速。
      const pk = (p) => Math.max(0, 1 - Math.abs(p - 0.44) / 0.22)
      const veilA = Math.max(pk(flyAmt * Math.max(0, 1 - dEdo / 230)), pk(flyAmt * Math.max(0, 1 - dSen / 230)), pk(flyAmt * Math.max(0, 1 - dTai / 230)))
      if (veilEl) veilEl.style.opacity = (veilA * 0.5).toFixed(3) // 関門の白ベールは控えめに（白い圧迫感を避け、くぐる気配だけ残す）
      // 目的地で自動減速: 近づくほど・霞の帯ほどゆっくり＝行き過ぎず、街にそっと着いて巡る
      const dMin = Math.min(dEdo, dSen, dTai)
      let slow = 1
      if (dMin < 200) { const approach = Math.max(0, Math.min(1, (200 - dMin) / 120)), band = Math.max(0, 1 - Math.abs(dMin - 129) / 52); slow = Math.max(0.36, 1 - approach * 0.4 - band * 0.22) }
      active.arrivalSlow = slow
      // 城下を行き交う人（近くの城下だけ動かす＝大通り/山道をゆっくり往復し、歩みに合わせて上下）
      for (const w of cityWalkers) {
        if (w.road) { // 街道を蛇行に沿って往復する旅人（戦国の谷）
          if (Math.hypot(fp.x - w.x0, fp.z - w.z0) > 150) continue
          const tt = (t * w.sp + w.ph) % 2, f = tt < 1 ? tt : 2 - tt, p = w.fn(f * w.len)
          const ty = p.y + Math.abs(Math.sin(t * 5 + w.ph * 3)) * 0.06
          // ワープ補間: fn が水際で経路の起点へ飛ばす等の不連続でも瞬間移動せず、現在位置から滑らかに寄せる
          // （通常の小刻みな歩みは即反映＝遅延なし。初回は posed=false で素直に置く）。
          const jump = w.posed ? Math.hypot(p.x - w.g.position.x, p.z - w.g.position.z) : 0
          if (w.posed && jump > 2.5) { const k = 1 - Math.exp(-7 * dt); w.g.position.x += (p.x - w.g.position.x) * k; w.g.position.y += (ty - w.g.position.y) * k; w.g.position.z += (p.z - w.g.position.z) * k }
          else w.g.position.set(p.x, ty, p.z)
          w.posed = true
          w.g.rotation.y = tt < 1 ? 0 : Math.PI // 進む向き
          { const lgs = w.g.userData.legs; if (lgs) { const ga = Math.sin(t * 5 + w.ph * 3); lgs[0].rotation.x = ga * 0.46; lgs[1].rotation.x = -ga * 0.46 } } // 脚を交互に運ぶ（mkWalkerFig＝脚が振れる。弾みと同位相）
          continue
        }
        if (Math.hypot(fp.x - w.cx, fp.z - w.cz) > 150) continue
        const tt = (t * w.sp + w.ph) % 2, f = tt < 1 ? tt : 2 - tt, r = w.r0 + (w.r1 - w.r0) * f
        const px = w.cx + Math.cos(w.ang) * r, pz = w.cz + Math.sin(w.ang) * r
        w.g.position.set(px, w.y0 + (w.y1 - w.y0) * f + Math.abs(Math.sin(t * 5 + w.ph * 3)) * 0.06, pz); w.g.rotation.y = w.ang + (tt < 1 ? Math.PI : 0) // 歩みに合わせ上下＋進む向き
        { const lgs = w.g.userData.legs; if (lgs) { const ga = Math.sin(t * 5 + w.ph * 3); lgs[0].rotation.x = ga * 0.46; lgs[1].rotation.x = -ga * 0.46 } } // 脚を交互に運ぶ
      }
      // 戦国の谷の霧がゆっくり横へ漂う（近くを飛ぶ時だけ更新＝軽量）
      if (senMist.length && Math.hypot(fp.x - SENGOKU.x, fp.z - SENGOKU.z) < 220) for (let i = 0; i < senMist.length; i++) { const m = senMist[i]; m.position.x += Math.sin(t * 0.12 + i * 1.7) * dt * 0.6 }
      // 大正の路面電車が大通りを往復（近くを飛ぶ時だけ更新）
      if (trams.length && Math.hypot(fp.x - TAISHO.x, fp.z - TAISHO.z) < 240) for (const tm of trams) { const span = tm.x1 - tm.x0, u = ((t * tm.sp + tm.ph) % (span * 2)), fwd = u < span, x = tm.x0 + (fwd ? u : span * 2 - u); tm.g.position.set(x, heightAt(x, tm.z) + 0.16, tm.z); tm.g.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2 }
      // ── 渡りの海の鳥: 海の上を飛んでいると時々、群れがカメラの近くを横切る（長い渡りの退屈しのぎ＋海らしさ）。鳴き声も。──
      if (active.mode !== 'walk' && flyAmt > 0.6 && heightAt(fp.x, fp.z) < SEA.level + 0.5) {
        crossT += dt
        if (crossT > crossNext) {
          if (!crossFlock) { crossFlock = new THREE.Group(); crossFlock.userData.wings = []
            const bm = new THREE.MeshBasicMaterial({ color: isNight ? 0x3a4452 : 0x4a4a44, fog: true })
            for (let i = 0; i < 6; i++) { const bird = new THREE.Group(); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.32), bm); w.position.x = s * 0.5; w.userData.side = s; bird.add(w); crossFlock.userData.wings.push(w) } bird.position.set((R() - 0.5) * 6, (R() - 0.5) * 2.5, (i - 3) * 1.4); crossFlock.add(bird) }
            scene.add(crossFlock) }
          const ang = Math.atan2(active.vel.z || 0.5, active.vel.x || 0.5) + (R() < 0.5 ? 1 : -1) * 1.25 // 進行方向の斜め前から横切る
          crossFlock.position.set(fp.x + Math.cos(ang) * 42, fp.y + 3 + R() * 9, fp.z + Math.sin(ang) * 42)
          crossFlock.userData.vx = -Math.cos(ang) * 7.5; crossFlock.userData.vz = -Math.sin(ang) * 7.5
          crossFlock.rotation.y = Math.atan2(crossFlock.userData.vx, crossFlock.userData.vz)
          crossFlock.visible = true; onSeaBird(); crossT = 0; crossNext = 10 + R() * 13
        }
        if (crossFlock && crossFlock.visible) { crossFlock.position.x += crossFlock.userData.vx * dt; crossFlock.position.z += crossFlock.userData.vz * dt
          const flap = Math.sin(t * 9) * 0.55; for (const w of crossFlock.userData.wings) w.rotation.z = -w.userData.side * flap
          if (Math.hypot(crossFlock.position.x - fp.x, crossFlock.position.z - fp.z) > 75) crossFlock.visible = false }
      } else if (crossFlock) crossFlock.visible = false
      // 道中の小島の鳥: 近づくと一斉に舞い立ち、機が離れるとまた枝へ戻る
      for (const fl of islandFlocks) {
        const d = Math.hypot(fp.x - fl.cx, fp.z - fl.cz)
        if (fl.state === 'perched') {
          if (d < 34 && flyAmt > 0.5) { // 飛んで近づいた瞬間＝驚いて飛び立つ
            fl.state = 'flying'; fl.t = 0
            const aw = Math.atan2(fl.cz - fp.z, fl.cx - fp.x) // 機から島の向こう側へ逃げる
            for (const bd of fl.birds) { const a = aw + (R() - 0.5) * 1.7, sp = 7 + R() * 6; bd.vx = Math.cos(a) * sp; bd.vz = Math.sin(a) * sp; bd.vy = 4 + R() * 4 }
          }
        } else {
          fl.t += dt
          for (const bd of fl.birds) {
            bd.g.position.x += bd.vx * dt; bd.g.position.y += bd.vy * dt; bd.g.position.z += bd.vz * dt
            bd.vy = Math.max(2.0, bd.vy - 1.3 * dt) // 上昇のあと水平へ抜けて去る
            const fp2 = Math.sin(t * 12 + bd.g.userData.ph) * 0.6; bd.g.children.forEach((w) => { w.rotation.z = w.userData.side * fp2 }) // 羽ばたき
            bd.g.rotation.y = Math.atan2(bd.vx, bd.vz)
          }
          if (fl.t > 7 && d > 60) { for (const bd of fl.birds) { bd.g.position.set(bd.bx, bd.by, bd.bz); bd.vx = bd.vy = bd.vz = 0; bd.g.rotation.y = 0; bd.g.children.forEach((w) => { w.rotation.z = 0 }) } fl.state = 'perched' } // 機が去ったらまた枝で羽を休める
        }
      }
    } else if (veilEl && veilEl.style.opacity !== '0') { veilEl.style.opacity = '0'; if (edoFx) edoFx.m.opacity = 0; if (senFx) senFx.m.opacity = 0; if (taiFx) taiFx.m.opacity = 0; active.arrivalSlow = 1 }
    active.winOpen = wo; active.lean = lean // 外部参照（見回し幅の算出など）用に実値を保持
    active.zoom += (active.zoomTarget - active.zoom) * 0.16 // ズームを目標へ滑らかに追従（ボタン/ピンチ共通＝確実に効き、急変で酔わない）

    // 乗り出しを戻すと見上げの可動域も縮むので、目標ピッチも追従して下げる（上を向いたまま固まらない）
    const plim = pitchLimits(lean)
    active.pitchTarget = Math.max(-plim.dn, Math.min(plim.up, active.pitchTarget))
    // 乗り出すと横の見回し幅も壁・窓枠に遮られて縮む＝横を向いたまま乗り出しても目標が追従し、イージングでそっと正面へ戻る
    const ylim = yawLimit(lean)
    active.yawTarget = Math.max(-ylim, Math.min(ylim, active.yawTarget))
    // 見回しを目標へ滑らかに追従（イージング＝指を離しても余韻があるヌルヌルの見回し）
    active.yaw += (active.yawTarget - active.yaw) * 0.16
    active.pitch += (active.pitchTarget - active.pitch) * 0.16
    // 見回し（息づかいの微揺れ付き。細い桟/畳がチカチカするので微揺れは控えめに）
    const yaw = active.yaw + Math.sin(t * 0.2) * 0.004
    const pitch = active.pitch
    // 窓をあけると視界がふっと前へ開け(=控えめ)、乗り出すとさらに前へ・下へ寄って画角が広がる（枠を越えて街へ顔を出す）
    // 室内視差: 部屋の中（乗り出していない間）は、見回しに連れてカメラがわずかに平行移動する＝頭を動かして
    // 窓の外を覗き込む手応え（近い窓枠と遠い景色がずれて動く）。乗り出す(lean)と0になり、枠を越えて街へ顔を出す。
    const roomAmt = Math.max(0, 1 - lean)
    const ex = Math.sin(yaw) * CAM.roomParallaxX * roomAmt
    const ey = eye.y - wo * CAM.winDown - lean * CAM.leanDown + pitch * CAM.roomParallaxY * roomAmt
    const ez = eye.z - wo * CAM.winFwd - lean * CAM.leanFwd
    // 部屋の中でもズーム可（FOVで寄り引き。zoom 0.4=寄り→画角を狭めて窓の外を引き寄せる／3.0=引き）。
    const winFov = Math.max(26, Math.min(100, (CAM.fov0 + wo * CAM.winFov + lean * CAM.leanFov) * (0.55 + 0.45 * active.zoom)))
    const look = TMP_LOOK.set(
      ex + Math.sin(yaw) * 18,
      ey - 10.5 - lean * CAM.leanLook + pitch * CAM.lookPitch + Math.sin(t * 0.5) * 0.014, // 既定は見下ろし（手前の木に落ち込み過ぎない程度に）／上スワイプで空・ビル上層も仰げる
      ez - Math.cos(yaw) * 22,
    )
    active.winLook.copy(look) // 飛び立つ瞬間の視線引き継ぎ用に、窓ビューの注視点を毎フレーム保持

    // 既定は窓ビュー。浮遊/散策中(flyP>0)は、引いた三人称“浮遊カメラ”＋慣性移動＋旋回バンクを混ぜる。
    let camX = ex, camY = ey, camZ = ez, fov = winFov
    let upX = 0, upY = 1, upZ = 0
    let lookX = look.x, lookY = look.y, lookZ = look.z
    let windSpeed01 = 0 // 飛行速度の正規化(0..1)。風音の膨らみへ渡す
    let altDuck01 = 0 // 飛行高度の正規化(0..1)。高空で環境音をしぼる量へ渡す
    if (flyAmt > 0.0005 || active.flyTarget) {
      const isWalk = active.mode === 'walk'
      const prevYaw = active.flyYaw
      let dvX, dvY = 0, dvZ, cpit, spit, camYaw
      if (isWalk) {
        // 歩行＝カメラ基準ポイント＆ゴー：左スティックを倒した“画面の向き”へ素早く向き直って歩く。
        // 右ドラッグでカメラ(walkCamYaw)を360°回せる。カメラは進む向きへ緩く後ろから追従＝自然に背後へ回る。
        const mvMag = Math.min(1, Math.hypot(active.moveX, active.moveY))
        const cy = active.walkCamYaw
        if (mvMag > 0.02) {
          const stickAng = Math.atan2(active.moveX, active.moveY) // 画面基準（上=前=0／右=+）
          const moveWorld = cy + stickAng                         // カメラ基準を世界の進行方向へ
          let d = moveWorld - active.flyYaw; d = Math.atan2(Math.sin(d), Math.cos(d))
          active.flyYaw += d * Math.min(1, dt * FLY.walkFace)     // 倒した向きへキビキビ向き直る
          // カメラは「前へ歩いている時だけ」ごく緩やかに背後へ整う。横・後ろ移動では回さない＝カメラを回す権利は右手だけ（一般的な3Dの作法）。
          // 旧: 倒している間つねに1.8/sで進行方向へ追従＝左スティックを横に倒すと視界ごと約90°振り回され酔う（実機FB）。前倒し成分の二乗で横は完全に0。
          const fwd = Math.max(0, Math.cos(stickAng))
          if (!active.lookDragging && fwd > 0.01) { let cd = active.flyYaw - cy; cd = Math.atan2(Math.sin(cd), Math.cos(cd)); active.walkCamYaw = cy + cd * Math.min(1, dt * FLY.walkCamFollow * fwd * fwd * mvMag) }
        }
        active.flyPitch += (active.flyPitchTarget - active.flyPitch) * FLY.lookEase
        active.lookYawOff = 0
        cpit = Math.cos(active.flyPitch); spit = Math.sin(active.flyPitch)
        camYaw = active.walkCamYaw // カメラは見回しで回した向き（進む向きflyYawとは別＝倒した方へ歩きつつ景色は保てる）
        const throttle = mvMag
        dvX = Math.sin(active.flyYaw) * throttle * FLY.walkSpeed
        dvZ = -Math.cos(active.flyYaw) * throttle * FLY.walkSpeed
      } else {
        // オートシネマ: 無操作が続くと、最寄りの名所をゆっくりオービット（接線方向へ機首を正し低速で周回）。
        // ただ眺めるだけで街がゆっくり巡る＝「眺めて整う」。触れた瞬間に解除して操作へ戻る。
        const idleMs = performance.now() - (active.lastInputT || 0)
        let nearLM2 = 1e9; for (const lm of CINEMA_LM) { const d2 = (lm.x - active.flyPos.x) ** 2 + (lm.z - active.flyPos.z) ** 2; if (d2 < nearLM2) nearLM2 = d2 }
        // オートシネマは「とまって(ホバリング)名所の近くで眺めている時」だけ作動。巡航中(=移動・別エリアへの渡り)では出さない
        // ＝飛行中に勝手に視点が切り替わらない(実機FB: 渡りの最中に定期的に視点が真後ろ等へ回ってしまう不具合の修正)。
        const wantCinema = flyAmt > 0.9 && idleMs > 7000 && !active.cruise && nearLM2 < 175 * 175 ? 1 : 0
        active.cinema += (wantCinema - active.cinema) * Math.min(1, dt * (wantCinema ? 0.5 : 4)) // ゆっくり始まり・素早く解除
        let cineSpeed = 0
        if (active.cinema > 0.01) {
          let best = CINEMA_LM[0], bd = 1e9
          for (const lm of CINEMA_LM) { const d = (lm.x - active.flyPos.x) ** 2 + (lm.z - active.flyPos.z) ** 2; if (d < bd) { bd = d; best = lm } }
          active.cineLM = best
          const rx = active.flyPos.x - best.x, rz = active.flyPos.z - best.z, r = Math.max(28, Math.hypot(rx, rz))
          const tangYaw = Math.atan2(-rz / r, rx / r) // 名所を中心に反時計回りの接線へ機首を向ける
          let d = tangYaw - active.flyYawTarget; d = Math.atan2(Math.sin(d), Math.cos(d))
          active.flyYawTarget += d * Math.min(1, dt * 0.5) * active.cinema
          cineSpeed = FLY.cinemaSpeed * active.cinema
        }
        // 飛行＝スキームA: ドラッグで操った進路(flyYaw/flyPitch)へ機首が向き、自動でゆっくり前進（巡航）。
        // 機首の上下がそのまま上昇/下降。とまる中は前進0＝その場でホバリング。一本指・スティック/昇降ボタン無し。
        active.flyYaw += (active.flyYawTarget - active.flyYaw) * FLY.steerEase
        active.flyPitch += (active.flyPitchTarget - active.flyPitch) * FLY.steerEase
        active.lookYawOff = 0
        cpit = Math.cos(active.flyPitch); spit = Math.sin(active.flyPitch)
        camYaw = active.flyYaw
        const cruiseS = ((active.cruise ? FLY.cruiseSpeed * active.speedMul * (active.arrivalSlow || 1) : 0) + cineSpeed) * (active.lowCruise ? 0.55 : 1) // 速さは speedMul で可変＋目的地で自動減速＋シネマの周回。低空滑空はゆるめる
        // 進むのは水平方向だけ＝見下ろし/見上げの角度に関係なく一定速度で前進（見下ろしても降下しない）。
        dvX = Math.sin(active.flyYaw) * cruiseS
        if (climbHeld) active.climb = climbHeld // 昇降ボタンを押している間は毎フレーム上昇/下降を再宣言＝見回し/操舵の指を挟んでも切れない（実機FB）
        dvY = active.lowCruise ? 0 : (active.climb || 0) * FLY.climbSpeed // 高さは↑↓ボタンだけ。低空滑空中は地形追従に任せ昇降は効かせない（「空へ戻す」で解除）
        dvZ = -Math.cos(active.flyYaw) * cruiseS
        // 上昇気流＝暖かい場所・雲の塔の上は、巡航しながら通るとふわっと持ち上がる（押さなくても少し昇るソアリング）。
        let thermal = 0
        for (const th of THERMALS) { const d2 = (active.flyPos.x - th.x) ** 2 + (active.flyPos.z - th.z) ** 2; if (d2 < th.r * th.r) thermal = Math.max(thermal, 1 - Math.sqrt(d2) / th.r) }
        active.thermal = thermal
        // 低〜中空(y<54)でだけ・控えめ(0.5→0.2)に効かせる＝「押していないのに高度が上がり続ける」を防ぐ（実機FB: 戦国へ向かう航路で勝手に上昇）。
        // soaringのふわっと感は低空で残しつつ、一定高度より上では効かない＝高度はユーザーの手に。止空/手動昇降中も効かせない。
        if (active.cruise && active.climb === 0 && active.flyPos.y < 54 && !active.lowCruise) dvY += thermal * FLY.climbSpeed * 0.2
      }
      const yawV = (active.flyYaw - prevYaw) / Math.max(dt, 0.001) // 旋回角速度（バンクの素）
      const fwdX = Math.sin(camYaw) * cpit, fwdY = spit, fwdZ = -Math.cos(camYaw) * cpit // カメラの向き

      const k = 1 - Math.exp(-(isWalk ? FLY.walkAccel : FLY.moveEase) * dt) // 目標速度へ寄せる。歩行は接地した加減速（即・すっと）／飛行は浮いた慣性で滑空
      active.vel.x += (dvX - active.vel.x) * k
      active.vel.y += (dvY - active.vel.y) * k
      active.vel.z += (dvZ - active.vel.z) * k
      if (!(Math.abs(active.vel.x) + Math.abs(active.vel.y) + Math.abs(active.vel.z) < 1e5)) active.vel.set(0, 0, 0) // 安全網: 速度が異常値(NaN/Inf)に化けたら停止（遷移時の固まり防止）
      // そよ風/突風＝空気が生きている。時々ふっと押される（横＋わずかに上）。山型に立ち上がって収まる＝自然な一陣。
      active.gustEnv = 0
      if (!isWalk) {
        gustT -= dt
        if (gustT <= 0) { gustT = 11 + R() * 18; const ga = R() * 6.2832, s = 2.0 + R() * 2.6; gustVX = Math.cos(ga) * s; gustVZ = Math.sin(ga) * s; gustUp = (R() - 0.25) * 2.2; gustAmt = 1 }
        if (gustAmt > 0) { gustAmt = Math.max(0, gustAmt - dt * 0.42); const e = Math.sin(Math.min(1, gustAmt) * Math.PI); active.gustEnv = e; active.vel.x += gustVX * e * dt * 1.6; active.vel.z += gustVZ * e * dt * 1.6; active.vel.y += gustUp * e * dt * 1.6 }
      }

      const b = bound
      if (isWalk) {
        const onCl = active.onCloud
        if (onCl) { // 雲上の回遊群島＝地形の当たり判定は無視し、島＋吊り橋のネットワーク上だけ歩ける（縁から落ちない）
          const nx = active.flyPos.x + active.vel.x * dt, nz = active.flyPos.z + active.vel.z * dt
          if (cloudSurfaceY(nx, nz) != null) { active.flyPos.x = nx; active.flyPos.z = nz }
          else { if (cloudSurfaceY(nx, active.flyPos.z) != null) active.flyPos.x = nx; if (cloudSurfaceY(active.flyPos.x, nz) != null) active.flyPos.z = nz } // 縁に沿って滑る
        } else tryWalk(active.flyPos, active.vel.x * dt, active.vel.z * dt) // 当たり判定つきで水平移動
        const groundY = onCl ? (cloudSurfaceY(active.flyPos.x, active.flyPos.z) ?? active.flyPos.y - FLY.eye) : heightAt(active.flyPos.x, active.flyPos.z)
        // ── ジャンプ（重力）。jumpY=地面からの高さ。接地中にジャンプ要求があれば発射。空中の連打は二段ジャンプにしない。──
        const grounded = (active.jumpY || 0) <= 0.001
        if (active.jumpQueued) { if (grounded && active.flyP > 0.6) { active.jumpVel = FLY.jumpForce; active.jumpY = 0.0001 } active.jumpQueued = false } // 要求は1フレームで消費（連打でも溜まらない＝確実に1回ずつ判定）
        if ((active.jumpY || 0) > 0 || active.jumpVel) {
          active.jumpVel = (active.jumpVel || 0) - FLY.gravity * dt
          active.jumpY = Math.max(0, (active.jumpY || 0) + active.jumpVel * dt)
          if (active.jumpY <= 0 && active.jumpVel < 0) { active.jumpVel = 0; active.dipT = 0.28; onLand(landSurf()) } // 着地＝沈み込み＋着地音（砂ぼこりの輪は撤去：アバター不在なので何もない地面から衝撃波が広がり「見えない人が着地した」ように見えた・実機FB）
        }
        const eyeY = groundY + FLY.eye + (active.jumpY || 0)
        const ky = 1 - Math.pow(0.02, dt / FLY.landDur)
        if ((active.jumpY || 0) > 0.001) active.flyPos.y = eyeY // ジャンプ中は地面追従でなく直接（弾む手応え）
        else active.flyPos.y += (eyeY - active.flyPos.y) * ky // 接地はやわらかく・以降は面に沿う
        if (!active.landedFired && active.flyPos.y - eyeY < 0.6) { // 降り立った瞬間＝沈み込み＋着地音（砂ぼこりの輪は撤去＝上記と同理由・実機FB）
          active.landedFired = true; active.dipT = 0.42; onLand(landSurf())
        }
        // 足音: 歩いた距離を貯め、一歩ぶん進むごとに鳴らす（止まっている間は鳴らない）
        const hstep = Math.hypot(active.vel.x, active.vel.z) * dt
        active.walkDist = (active.walkDist || 0) + hstep
        active.walkPhase = ((active.walkPhase || 0) + hstep) % 4.2 // 歩みの位相（一歩2.1u）＝頭の弾み/左右の重心移ろいを足音と同期
        if (active.walkDist > 2.1) { active.walkDist = 0
          // 足元の素材で足音を変える: 谷戸=土・草／公園=草／川辺の遊歩道=木／その他=舗装。
          let surf = 'hard'
          if (weather === 'snow') surf = 'snow' // 雪は一面を覆う＝どこでも雪の踏みしめ
          else if (kind === 'yato') surf = 'grass'
          else { const fx = active.flyPos.x, fz = active.flyPos.z
            if (Math.hypot(fx - PARK.x, fz - PARK.z) < PARK.r || Math.hypot(fx - MOROOKA.x, fz - MOROOKA.z) < MOROOKA.r) surf = 'grass'
            else if (Math.abs(fx - RIVER.x) < RIVER.bankW + 1.5) surf = 'wood' }
          onFoot(surf)
        }
      } else {
        active.flyPos.x += active.vel.x * dt; active.flyPos.y += active.vel.y * dt; active.flyPos.z += active.vel.z * dt
        active.flyPos.x = Math.max(-b.x, Math.min(b.xMax || b.x, active.flyPos.x))
        active.flyPos.z = Math.max(b.zMin, Math.min(b.zMax, active.flyPos.z))
        const terr = heightAt(active.flyPos.x, active.flyPos.z), floor = terr + b.yFloor
        if (active.lowCruise) { const gh = terr + 5.5; active.flyPos.y += (gh - active.flyPos.y) * Math.min(1, dt * 1.8) } // 自転車=地形に沿って低く滑空（坂を下る目線）
        active.flyPos.y = Math.max(floor, Math.min(b.yMax, active.flyPos.y))
        const fp = active.flyPos; if (!(fp.x === fp.x && fp.y === fp.y && fp.z === fp.z && Math.abs(fp.x) < 1e5 && Math.abs(fp.y) < 1e5 && Math.abs(fp.z) < 1e5)) { fp.set(0, 36, 50); active.vel.set(0, 0, 0); active.camReady = false } // 安全網: 位置が異常値(NaN/Inf)になったら安全な空へ戻す（遷移時の固まり防止）
      }

      // 旋回バンク（飛行のみ）：旋回（左スティックの曲がり＝yawV）に応じて世界が傾く＝飛翔の手応え。
      // ただし“動いている時だけ”傾ける（ホバリングして見回すだけでは傾かない）。
      const spMag = Math.hypot(active.vel.x, active.vel.y, active.vel.z)
      const moveFactor = Math.min(1, spMag / (FLY.speed * 0.35))
      const bankTgt = isWalk ? 0 : Math.max(-FLY.bankMax, Math.min(FLY.bankMax, -yawV * FLY.bankGain * 0.28)) * moveFactor
      active.bankCur += (bankTgt - active.bankCur) * FLY.bankEase

      // 引いた三人称カメラ：focus の後ろ上から望む。ピンチのズーム(active.zoom)で引き具合を可変。後ろが建物/地面なら寄せてのめり込みを防ぐ。
      const fp = active.flyPos
      const back0 = (isWalk ? FLY.walkBack : FLY.camBack) * active.zoom * (active.wide && !isWalk ? 1.5 : 1) // 広角モードはさらに引く
      // 腰をおろす: 歩いていて立ち止まり、しばらく動かずにいると、カメラがそっと下がり視線が和らぐ＝「ただ過ごす」手触り。
      // 動き出すとすっと立ち上がる。受動的＝操作でも達成でもなく、留まれば世界がそっと応える（後段で鈴も満ちる）。
      if (isWalk && (active.flyP || 0) > 0.6) {
        const moving = Math.hypot(active.vel.x, active.vel.z) > 0.7 || active.climb !== 0
        active.stillT = moving ? 0 : (active.stillT || 0) + dt
        const tgt = active.stillT > 2.2 ? 1 : 0
        active.sitAmt = (active.sitAmt || 0) + (tgt - (active.sitAmt || 0)) * Math.min(1, dt * (tgt ? 0.7 : 3.4))
      } else { active.stillT = 0; if (active.sitAmt) active.sitAmt = Math.max(0, active.sitAmt - dt * 4) }
      const sit = isWalk ? (active.sitAmt || 0) : 0
      const upOff = (isWalk ? FLY.walkUp : FLY.camUp) * (0.5 + 0.5 * active.zoom) * (active.wide && !isWalk ? 1.35 : 1) // 引くほど少し高い位置から見渡す（広角は更に高く）
      const ahead = isWalk ? FLY.walkAhead : FLY.camAhead
      // 後方アンカーが建物にめり込む時だけ寄せる。ただし blockedAt は高さを見ない平面判定なので、上空を巡航中に
      // 後ろの建物列を跨ぐたびに寄せ判定がオンオフして“カメラが前後にドリー”＝酔いの原因になっていた。
      // 屋根より十分高い時は建物に当たらないので寄せ判定を切り、さらに寄せ距離自体をなめらかに追従させて前後酔いを断つ。
      // 飛行は当たりで寄せない＝後ろの建物列を跨ぐたびの前後ドリー(酔い)を根絶。歩行だけ寄せる（一人称で壁にめり込まぬよう）。
      const checkBlock = isWalk
      let backTgt = back0
      if (checkBlock) {
        let back = back0
        for (let tries = 0; tries < 5; tries++) {
          const tx = fp.x - fwdX * back, tz = fp.z - fwdZ * back
          if (!blockedAt(tx, tz)) break
          back *= 0.62
        }
        backTgt = back
      }
      // 構図ガード(地形): focus→後方カメラの線分が丘の尾根に潜ると、全画面が無地の地面ベタ面になる(カメラ埋没＝評価アートの最致命/全エリアで頻発)。
      // 線分に沿って地形/海面の高さをサンプルし、線が地形より下に潜る手前まで back を詰める＝丘に埋もれず常に「一枚の絵」に閉じる。飛行/歩行とも。
      { const N = 6, minB = isWalk ? 1.2 : 2.2
        for (let i = 1; i <= N; i++) { const tt = i / N
          const sx = fp.x - fwdX * backTgt * tt, sz = fp.z - fwdZ * backTgt * tt
          const sy = fp.y - fwdY * backTgt * tt + upOff * tt // 線分上の高さ（upOffは終端で最大）
          const gh = Math.max(heightAt(sx, sz), SEA.level) + (isWalk ? 1.0 : 1.4) // 地形＋余裕
          if (sy < gh) { backTgt = Math.max(minB, backTgt * (i - 1) / N); break } }
      }
      // 寄せ距離をなめらかに追従（瞬間スナップを排す＝寄せ/戻りで前後にカクつかない）
      if (!active.camReady || active.camBackCur === undefined) active.camBackCur = backTgt
      else active.camBackCur += (backTgt - active.camBackCur) * 0.1
      const back = active.camBackCur
      let dcx = fp.x - fwdX * back, dcz = fp.z - fwdZ * back
      let dcy = fp.y - fwdY * back + upOff - sit * 0.7 // 腰をおろすと目線がそっと下がる
      // 海上では海底基準だと水面より下に潜り「水中から水板を見る」変な絵になる→水面(SEA.level)を下限に。
      const camFloor = Math.max(heightAt(dcx, dcz), SEA.level) + (isWalk ? 1.35 - sit * 0.55 : 1.6) // 歩行は一人称寄り＝目線をやや低く許す（座ると更に低く）
      if (dcy < camFloor) dcy = camFloor
      if (!active.camReady) { active.camPos.set(dcx, dcy, dcz); active.camReady = true } // 飛び立ち/着地直後はスナップ
      else { const cl = isWalk ? FLY.walkCamLag : FLY.camLag; active.camPos.x += (dcx - active.camPos.x) * cl; active.camPos.y += (dcy - active.camPos.y) * cl; active.camPos.z += (dcz - active.camPos.z) * cl } // 歩行は密着＝地に足のついた手応え／飛行は緩い遅れ＝空気の流れ

      let aLookX = fp.x + fwdX * ahead, aLookY = fp.y + fwdY * ahead + Math.sin(t * 0.5) * 0.04 - sit * 0.55, aLookZ = fp.z + fwdZ * ahead // 座ると視線も少し落ちて手前の路へ和らぐ
      // オートシネマ: 接線に沿って機体は流れつつ、視線は名所の中心へ向ける＝名所を画面に保つオービット
      if (!isWalk && active.cinema > 0.01 && active.cineLM) {
        const cm = active.cinema * 0.92, lx = active.cineLM.x, lz = active.cineLM.z, ly = heightAt(lx, lz) + 15
        aLookX += (lx - aLookX) * cm; aLookY += (ly - aLookY) * cm; aLookZ += (lz - aLookZ) * cm
      }
      TMP_DIR.set(fwdX, fwdY, fwdZ); TMP_UP2.set(0, 1, 0).applyAxisAngle(TMP_DIR, active.bankCur) // バンクした上ベクトル

      camX = lerp(ex, active.camPos.x, flyAmt); camY = lerp(ey, active.camPos.y, flyAmt); camZ = lerp(ez, active.camPos.z, flyAmt)
      lookX = lerp(look.x, aLookX, flyAmt); lookY = lerp(look.y, aLookY, flyAmt); lookZ = lerp(look.z, aLookZ, flyAmt)
      upX = lerp(0, TMP_UP2.x, flyAmt); upY = lerp(1, TMP_UP2.y, flyAmt); upZ = lerp(0, TMP_UP2.z, flyAmt)
      const speedMag = Math.hypot(active.vel.x, active.vel.y, active.vel.z)
      const aloftFov = (isWalk ? FLY.walkFov : FLY.fov) + (isWalk ? Math.min(1, speedMag / FLY.walkSpeed) * 3 : Math.min(1, speedMag / FLY.speed) * FLY.fovSpeedGain) + (active.wide && !isWalk ? 26 : 0) // 歩行も進むと画角がわずかに広がる（速度の高揚を控えめに）／広角モードで視界を広げる
      fov = lerp(winFov, aloftFov, flyAmt)
      if (thr > 0.001) fov += thr * 6.5 // 踏み出す閾＝画角がふっと広がり、視界が前へ吸い込まれて開ける（窓を越えて空へ踏み出す高揚）
      if (!isWalk && active.cinema > 0.01) fov += Math.sin(t * 0.16) * 2.6 * active.cinema // オートシネマの呼吸する画角（ゆっくり広→狭）
      windSpeed01 = Math.min(1, (isWalk ? 0 : Math.min(1, speedMag / FLY.speed) + (active.thermal || 0) * 0.3 + (active.gustEnv || 0) * 0.45) * flyAmt + thr * 0.5) // 飛行の速さ＋上昇気流＋突風＋閾を越える瞬間の風の立ち上がりで風音が膨らむ

      // 浮遊感: ホバリングはゆっくり上下に漂い、速いとかすかに揺れる。歩行は頭が弾む。
      const sp01 = Math.min(1, speedMag / (isWalk ? FLY.walkSpeed : FLY.speed))
      if (isWalk) {
        // 歩いた距離で位相を進める＝足音と同期した自然な歩み（時間でなく距離なので、ゆっくり歩けば弾みもゆっくり）。
        const wp = active.walkPhase || 0
        camY += Math.abs(Math.sin(wp / 2.1 * Math.PI)) * 0.04 * sp01 * flyAmt // 一歩ごとに上下（足が地につく谷で沈む）。控えめ＝酔い配慮
        camX += Math.sin(wp / 4.2 * Math.PI) * 0.022 * sp01 * flyAmt // 二歩で左右一周＝重心の移ろい
      } else {
        // 夢の浮遊＝ホバリングほど大きくゆったり漂い（無重力に浮かぶ手触り）、速いとかすかに弾む。上昇気流ではふわっと持ち上がる手応え。
        const float = 1 - sp01 * 0.55
        camY += (Math.sin(t * 0.5) * 0.4 + Math.sin(t * 0.33 + 1.6) * 0.26) * float * flyAmt + Math.sin(t * 7.3) * 0.1 * sp01 * flyAmt + (active.thermal || 0) * 0.5 * flyAmt
        camX += (Math.sin(t * 0.42 + 0.7) * 0.28 * float + Math.sin(t * 5.1) * 0.1 * sp01) * flyAmt
      }
      // 着地の沈み込み（とんと沈んで戻る＝接地の手応え）
      if (active.dipT > 0) { active.dipT -= dt; const pp = 1 - Math.max(0, active.dipT) / 0.42; camY -= Math.sin(pp * Math.PI) * 0.6 }
      // 自分の影が真下の地面を走る（高度で大きさ・濃さが変わる＝飛んでいる手応え）
      const gY = active.onCloud ? (cloudSurfaceY(active.flyPos.x, active.flyPos.z) ?? active.flyPos.y - FLY.eye) : heightAt(active.flyPos.x, active.flyPos.z)
      const alt = Math.max(0, active.flyPos.y - gY)
      flyerShadow.visible = flyAmt > 0.5
      flyerShadow.position.set(active.flyPos.x, gY + 0.06, active.flyPos.z)
      const ssc = isWalk ? 2.1 : (2.3 + alt * 0.1)
      flyerShadow.scale.set(ssc, ssc, ssc)
      flyerShadow.material.opacity = Math.max(0, (isWalk ? 0.34 : 0.44 - alt * 0.004)) * flyAmt
      // 高速時の速度感＝画面の縁がそっと締まるヴィネット（飛行のみ・変化時だけ書き換え）
      const vig = (isWalk ? 0 : Math.min(1, speedMag / FLY.speed)) * flyAmt
      if (Math.abs(vig - speedVigCur) > 0.02) { speedVigCur = vig; speedVig.style.opacity = (vig * 0.5).toFixed(2) }
      // 雲の近接フェード＝迫った積雲/巻雲を群ごとに透明へ溶かし、不透明メッシュが視界を塗りつぶすのを根絶（実機FB「飛行中に目の前が真っ白」）。
      // 雲はfog:false＝近接フォグ(構図ガード)が効かない盲点。材のopacityを距離で落とし、遠のけば不透明へ戻す。白ベール(cumHaze)はフェード進行に連動＝「霧として抜ける」体感。
      let cumHaze = 0
      const cloudFadeOn = !isWalk && flyAmt > 0.3
      for (const c of clouds) {
        const u = c.userData, fm = u.fadeMat
        if (!fm) continue
        let f = 1
        if (cloudFadeOn) {
          const dx = c.position.x - active.flyPos.x, dy = (c.position.y - active.flyPos.y) * u.fadeW, dz = c.position.z - active.flyPos.z
          f = Math.min(1, Math.max(0, (Math.sqrt(dx * dx + dy * dy + dz * dz) - u.fadeR0) / (u.fadeR1 - u.fadeR0)))
        }
        if (f < 1) { fm.transparent = true; fm.opacity = f; c.visible = f > 0.02; if (1 - f > cumHaze) cumHaze = 1 - f }
        else if (fm.transparent) { fm.transparent = false; fm.opacity = 1; c.visible = true }
      }
      // 雲海・入道雲を突き抜けるときだけ白く包まれる手応え（高所限定＝街の一望は損なわない）。
      let seaCross = 0, towerHaze = 0
      if (cloudSea) { const dY = Math.abs(active.flyPos.y - (SEA_Y + 2)); seaCross = Math.max(0, 1 - dY / 13) } // 雲海のデッキを突き抜ける高さ(SEA_Y+2≈90)で最も白く包まれ、島の高さ(≈108-110)では晴れる＝群島が白霞に呑まれず見えるように（旧: ピーク102で島の高さが真っ白だった）
      for (const tc of towerCenters) { const dh = Math.hypot(tc.x - active.flyPos.x, tc.z - active.flyPos.z); if (dh < 18 && active.flyPos.y > SEA_Y - 16 && active.flyPos.y < tc.yTop + 4) towerHaze = Math.max(towerHaze, 1 - dh / 18) }
      const hazeOp = isWalk ? 0 : Math.min(0.6, Math.max(cumHaze * 0.22, seaCross * 0.34, towerHaze * 0.55)) * flyAmt // 雲海の白包みを 0.5→0.34 へ控えめに＝突き抜けの手応えは残しつつ群島が見える（評価: 雲海が白に呑まれて見えない）。cumHazeは近接フェード連動で0.22=溶けた雲の中は淡い霧
      if (Math.abs(hazeOp - cloudHazeCur) > 0.02) { cloudHazeCur = hazeOp; cloudHaze.style.opacity = hazeOp.toFixed(2) }
      // 雲海の出現＝高く昇るほど淡く現れ、突き抜けると街が雲の下に消える別世界（窓辺・巡航では opacity0 で開けた空）。
      if (cloudSea) {
        // デッキと目線が揃う帯(SEA_Y+2±12)では雲海を薄める＝うねる面が視界全部を特徴のない白壁で塗りつぶす白飛びを防ぐ（実機FB「目の前が真っ白」の主犯）。帯を出れば元の濃さ＝上空の別世界・島の眺めは不変
        const bandThin = 0.3 + 0.7 * Math.min(1, Math.abs(active.flyPos.y - (SEA_Y + 2)) / 12)
        const seaOp = isWalk ? 0 : Math.max(0, Math.min(1, (active.flyPos.y - 70) / 22)) * flyAmt * bandThin // y70で現れy92で満ちる（巡航では消えている）
        cloudSea.visible = seaOp > 0.02
        if (cloudSea.visible) { for (const m of seaMats) m.opacity = seaOp; if (seaUni) seaUni.uTime.value = t } // 雲海が見えている間だけ、うねりの時刻を進める

      }
      // 虹のアーチ＝晴れた日に雲海の上で現れ、くぐると淡い分光のベールに包まれる
      if (rainbowArch) {
        const ab = isWalk ? 0 : Math.max(0, Math.min(1, (active.flyPos.y - (SEA_Y - 30)) / 40))
        const op = (!isNight && !SNOWY ? 1 : 0) * ab * flyAmt * 0.6
        rainbowArch.visible = op > 0.02
        for (const m of rainbowArch.userData.mats) m.uniforms.uOp.value = op
        const dzp = Math.abs(active.flyPos.z + 360), dxy = Math.hypot(active.flyPos.x + 20, active.flyPos.y - (SEA_Y - 2)) // アーチ面(z=-360)・開口内
        const through = (op > 0.1 && dzp < 28 && dxy < 122) ? (1 - dzp / 28) * 0.6 : 0
        if (Math.abs(through - rbVeilCur) > 0.02) { rbVeilCur = through; rainbowVeil.style.opacity = through.toFixed(2) }
      }
      // 遠雷の稲光：cue:'thunder' で flashV が立ち上がり、ここで減衰＝空がふっと白む（雨/雪の夜に効く）。
      // 立ち上がりは鋭く（>0.6は素早く落ち）、余韻はゆっくり＝稲光の閃光らしさ。わずかな揺らぎで二度光りの気配。
      if (flashV > 0.001) flashV = Math.max(0, flashV - dt * (flashV > 0.6 ? 4.2 : 1.7))
      const fop = flashV * 0.42 * (0.85 + 0.15 * Math.sin(t * 47))
      if (Math.abs(fop - flashCur) > 0.004) { flashCur = fop; flashEl.style.opacity = fop.toFixed(3) }
      // ブロッケンの虹輪＝雲海の上を晴れた日に飛ぶと、自分の真下の雲に円い虹が映って追従する
      if (glory) {
        const ab = isWalk ? 0 : Math.max(0, Math.min(1, (active.flyPos.y - (SEA_Y + 8)) / 16)) // 雲海の上に出ているほど
        const gOp = (!isNight && !SNOWY ? 1 : 0) * ab * flyAmt * 0.8
        glory.visible = gOp > 0.02
        if (glory.visible) { glory.position.set(active.flyPos.x, SEA_Y + 18, active.flyPos.z); glory.material.opacity = gOp }
      }
      // 高度で空気が冷たく淡くなる（高く昇るほど淡い寒色を被せる）＋環境音をしぼる
      const altT = isWalk ? 0 : Math.max(0, Math.min(1, (active.flyPos.y - 34) / 46)) * flyAmt
      if (Math.abs(altT - altTintCur) > 0.02) { altTintCur = altT; altTint.style.opacity = (altT * 0.16).toFixed(2) }
      // 街の環境音(虫)をしぼる量 = 高度 ＋ 海の上 ＋ homeから離れた、の合成。海に出ると虫が消え、風と鳥だけになる（実機FB）。
      const overSeaT = isWalk ? 0 : (heightAt(active.flyPos.x, active.flyPos.z) < SEA.level + 0.5 ? 1 : 0) * flyAmt // 水面の上か
      const dHomeT = isWalk ? 0 : Math.min(1, Math.max(0, (Math.hypot(active.flyPos.x, active.flyPos.z) - 80) / 90)) * flyAmt // homeから離れたか
      altDuck01 = Math.max(altT, overSeaT, dHomeT)
      // 光の粒（夕夜=蛍/塵の暖かい光。昼の歩行=陽だまりに舞う埃）。カメラ周辺を漂い流れ、降り立つと足元〜目線に寄り集まる。
      const dayMote = flyAmt * (isWalk ? 0.17 : 0.045) * (1 - duskAmt * 0.5) // 昼も薄く舞う＝降り立った時に空気が生きる（歩行で濃く）
      const moteOp = Math.min(0.46, duskAmt * flyAmt * 0.4 + dayMote)
      motes.visible = moteOp > 0.012
      if (motes.visible) {
        const mp = moteGeo.attributes.position.array
        const HX = isWalk ? 17 : 36, HY = isWalk ? 9 : 24, HZ = isWalk ? 17 : 36 // 歩くと近く低く密に＝足元の空気
        for (let i = 0; i < moteN; i++) {
          mp[i * 3] += Math.sin(t * 0.3 + i) * 0.004
          mp[i * 3 + 1] += Math.cos(t * 0.22 + i * 1.3) * 0.003 + 0.004 // ゆるく昇る
          mp[i * 3 + 2] += Math.sin(t * 0.26 + i * 0.7) * 0.004
          if (mp[i * 3] - camX > HX) mp[i * 3] -= 2 * HX; else if (mp[i * 3] - camX < -HX) mp[i * 3] += 2 * HX
          if (mp[i * 3 + 1] - camY > HY) mp[i * 3 + 1] -= 2 * HY; else if (mp[i * 3 + 1] - camY < -HY) mp[i * 3 + 1] += 2 * HY
          if (mp[i * 3 + 2] - camZ > HZ) mp[i * 3 + 2] -= 2 * HZ; else if (mp[i * 3 + 2] - camZ < -HZ) mp[i * 3 + 2] += 2 * HZ
        }
        moteGeo.attributes.position.needsUpdate = true
        moteMat.opacity = moteOp
        moteMat.size = isWalk ? 0.6 : 0.5
        moteMat.color.setRGB(1, 0.99 - duskAmt * 0.07, 0.94 - duskAmt * 0.18) // 昼=淡い白／夕夜=暖色
      }
      if (nearFall) { // 歩く人に追従する近景の舞い散り（カメラ周りで循環。歩くと濃く＝桜吹雪/落ち葉の中に降り立つ）。camX/Y/Z・flyAmt・isWalk 確定後に更新。
        const op = flyAmt * (isWalk ? 0.82 : 0.16)
        nearFall.pts.visible = op > 0.02
        if (nearFall.pts.visible) {
          const f = nearFall, mp = f.pos
          for (let i = 0; i < f.N; i++) {
            const k = i * 3
            mp[k + 1] -= f.spd[i] * dt
            mp[k] += Math.sin(t * 0.7 + f.phs[i]) * f.swirl * dt
            mp[k + 2] += Math.cos(t * 0.5 + f.phs[i]) * f.swirl * 0.4 * dt
            if (mp[k] - camX > f.HX) mp[k] -= 2 * f.HX; else if (mp[k] - camX < -f.HX) mp[k] += 2 * f.HX
            if (mp[k + 2] - camZ > f.HX) mp[k + 2] -= 2 * f.HX; else if (mp[k + 2] - camZ < -f.HX) mp[k + 2] += 2 * f.HX
            if (mp[k + 1] < camY - 2.5) mp[k + 1] = camY + f.HY * 0.5 + Math.random() * 3 // 足元より下に抜けたら頭上へ
          }
          f.pts.geometry.attributes.position.needsUpdate = true
          f.mat.opacity = Math.min(0.88, op)
        }
      }
      // 高空を速く飛ぶと飛行機雲を引く（後ろへ。一定距離ごとに一粒を撒く）
      if (!isWalk && active.flyPos.y > 38 && speedMag > FLY.speed * 0.45) {
        trailAccum += speedMag * dt
        if (!(trailAccum < 1e4)) trailAccum = 0 // 安全網: 速度が異常値(NaN/Inf)でも while が無限ループ＝フリーズしないよう上限で打ち切る
        const inv = 1 / Math.max(speedMag, 0.001)
        const tarr = trailGeo.attributes.position.array
        while (trailAccum > 2.5) {
          trailAccum -= 2.5
          const k = trailIdx * 3
          tarr[k] = active.flyPos.x - active.vel.x * inv * 2.2 + (Math.random() - 0.5) * 1.2
          tarr[k + 1] = active.flyPos.y + (Math.random() - 0.5) * 0.8
          tarr[k + 2] = active.flyPos.z - active.vel.z * inv * 2.2 + (Math.random() - 0.5) * 1.2
          trailAlpha[trailIdx] = 1
          trailIdx = (trailIdx + 1) % trailN
        }
      }
    }
    // 着地の砂ぼこりが広がって薄れる
    if (active.landDustT > 0) {
      active.landDustT -= dt
      const p = 1 - Math.max(0, active.landDustT) / 0.7
      const sc = 1.4 + p * 5.5
      landDust.scale.set(sc, sc, sc)
      landDust.material.opacity = Math.max(0, 1 - p) * 0.5
      if (active.landDustT <= 0) landDust.visible = false
    }
    // 飛行機雲が後ろでゆっくり薄れていく（撒いた粒の寿命を減らし、白×濃さで描く）
    let trailAlive = false
    const carr = trailGeo.attributes.color.array
    for (let i = 0; i < trailN; i++) {
      if (trailAlpha[i] > 0) { trailAlpha[i] = Math.max(0, trailAlpha[i] - dt / 4.5); trailAlive = trailAlive || trailAlpha[i] > 0 }
      const a = trailAlpha[i] * 0.13
      carr[i * 3] = a; carr[i * 3 + 1] = a; carr[i * 3 + 2] = a
    }
    if (trail.visible || trailAlive) { trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.color.needsUpdate = true }
    trail.visible = trailAlive
    camera.up.set(upX, upY, upZ)
    camera.position.set(camX, camY, camZ)
    if (skyDome) skyDome.position.set(camX, camY, camZ) // 空ドームをカメラへ追従＝拡大世界のどこへ飛んでも空が常に周囲を覆う（黒い虚空を防ぐ）
    if (sunGlow) sunGlow.position.set(camX + sunDir.x * 470, camY + sunDir.y * 470, camZ + sunDir.z * 470) // 太陽の光輪を太陽の向きの空に追従配置
    if (sunDisk) sunDisk.position.set(camX + sunDir.x * 472, camY + sunDir.y * 472, camZ + sunDir.z * 472) // 太陽の本体（光輪の中心に重ねる）
    if (firstStar) { // 一番星: 日の傾きが0.8を越えると上空にひとつ薄く灯り、淡くまたたく＝「暮れきった一拍」
      const sd = drift.on ? Math.max(0, (drift.t / DRIFT_SECS - 0.8) / 0.2) : 0
      const op = sd * sd * 0.85 * (0.72 + 0.28 * Math.sin(t * 2.1))
      firstStar.visible = op > 0.01; if (firstStar.visible) { firstStar.material.opacity = op; firstStar.position.set(camX + 0.42 * 470, camY + 0.8 * 470, camZ - 0.45 * 470) } }
    if (starMat) starMat.uniforms.uT.value = t // 星のきらめき（twinkle）
    if (Math.abs(fov - active.fovCur) > 0.04) { active.fovCur = fov; camera.fov = fov; camera.updateProjectionMatrix() }
    camera.lookAt(lookX, lookY, lookZ)
    // とまる/すすむ ボタンは飛行のときだけ出す（歩行・窓辺では隠す）。出すときに現在の状態でラベルを合わせる。
    const showCruise = active.mode === 'fly' && active.flyP > 0.4
    if (showCruise !== cruiseShown) { cruiseShown = showCruise; cruiseBtn.classList.toggle('cruise--on', showCruise); if (showCruise) reflectCruise() }
    if (showCruise !== lowShown) { lowShown = showCruise; lowBtn.style.display = showCruise ? 'block' : 'none'; if (showCruise) reflectLow(); else if (active.lowCruise) { active.lowCruise = false; reflectLow() } } // 低く流すボタンは飛行のときだけ。飛行を抜けたら解除
    const showJump = active.mode === 'walk' && active.flyP > 0.5 // ジャンプボタンは歩行のときだけ出す
    if (showJump !== jumpShown) { jumpShown = showJump; jumpBtn.classList.toggle('jump--show', showJump) }
    // スティック常駐: 歩行で触れていない間も既定位置に淡く出す（触れたらそこへ移る）。ドラッグ中(stickId)は触れた点の表示を優先。
    const wantRest = active.mode === 'walk' && active.flyP > 0.5 && stickId === null
    if (wantRest !== stickRestShown) { stickRestShown = wantRest; if (wantRest) restStick(); else if (stickId === null) stickWrap.classList.remove('stick--on', 'stick--rest') }
    // 初見の操作ヒント: 着地して歩き出す/初めて空へ飛ぶ瞬間に出し、数秒でそっと消える（触れたら即消える）
    if (active.pendingHint) { showCtrlHint(active.pendingHint); active.pendingHint = null }
    if (ctrlHintT > 0) { ctrlHintT -= dt; if (ctrlHintT <= 0) ctrlHint.style.opacity = '0' }
    const showZoom = active.mode === 'window' || active.flyP > 0.4 // 部屋の中（窓辺）でも空/地上でもズームボタンを出す
    if (showZoom !== zoomShown) { zoomShown = showZoom; zoomWrap.classList.toggle('zoom--on', showZoom); if (!showZoom) stopZoomHold() }
    const showSpeed = active.mode === 'fly' && active.flyP > 0.4 // 速度ボタンは飛行のときだけ
    if (showSpeed !== speedShown) { speedShown = showSpeed; speedWrap.classList.toggle('speed--on', showSpeed); if (!showSpeed) stopSpeedHold() }
    if (showSpeed !== wideShown) { wideShown = showSpeed; wideWrap.classList.toggle('wide--on', showSpeed) }
    if (showSpeed !== climbShown) { climbShown = showSpeed; climbWrap.classList.toggle('climb--on', showSpeed); if (!showSpeed && active) { active.climb = 0; climbHeld = 0; climbPointerId = null } } // 飛行を出たら昇降の保持も解除（walkへ持ち越さない）
    if (showSpeed !== padShown) { padShown = showSpeed; moreBtn.classList.toggle('more--on', showSpeed); if (!showSpeed) pad.classList.remove('pad--open') } // ⚙は飛行時のみ＝飛行を出る時は補助トレイを畳んで次回また素の状態から
    onSpeed(windSpeed01) // 風音を飛行速度で膨らませる（main→audio.setFlyWind）
    onAltitude(altDuck01) // 高空で街の環境音をしぼる（main→audio.setAltitudeDuck）
    // 場所に応じた水の音の満ち引き（足元が海＝波／川・運河の近く＝せせらぎ）。飛行/歩行で外に出ている時だけ。
    { const fp = active.flyPos, outAmt = Math.max(0, Math.min(1, ((active.flyP || 0) - 0.2) / 0.4))
      const altLow = Math.max(0, Math.min(1, (34 - Math.max(0, fp.y - SEA.level)) / 34)) // 低いほど水音が近い
      // 海＝汀の外の海域ゾーン（東湾x>coast/西沖x<westCoast/各時代の島の周囲）かつ周囲が広く水。内陸の谷/川/池を「海」と誤検知しない。
      const seaward = (fp.x > SEA.coast - 12 || fp.x < SEA.westCoast + 12) ? 1 : 0
      let wet = 0; for (const [ox, oz] of [[0, 0], [13, 0], [-13, 0], [0, 13], [0, -13]]) if (heightAt(fp.x + ox, fp.z + oz) < SEA.level + 1.5) wet++
      const seaAmt = seaward * Math.max(0, Math.min(1, (wet - 1.5) / 3)) * altLow * outAmt
      let rivD = Math.min(edoStream(fp.x, fp.z), taishoCanal(fp.x, fp.z)) // 江戸の川／大正の運河（領域外は999）
      if (Math.abs(fp.x - RIVER.x) < 40 && fp.z > -130 && fp.z < 46) rivD = Math.min(rivD, Math.abs(fp.x - RIVER.x)) // 現代homeの川(x=-52)
      { const dz = fp.z - SENGOKU.z; if (Math.abs(dz) < SENGOKU.r) rivD = Math.min(rivD, Math.abs((fp.x - SENGOKU.x) - senValley(dz))) } // 戦国の谷の川
      const rivLow = Math.max(0, Math.min(1, (30 - Math.max(0, fp.y - SEA.level)) / 24)) // 川・運河は低空/地上でだけ聞こえる
      let riverAmt = Math.max(0, Math.min(1, (8 - rivD) / 8)) * rivLow * outAmt * (1 - seaAmt) // 川の近く（海の時は波を優先）。雲海の水の島でも上乗せするので let
      let crowdAmt = 0; for (const c of crowdCenters) { const d = Math.hypot(fp.x - c.x, fp.z - c.z); if (d < c.r) crowdAmt = Math.max(crowdAmt, 1 - d / c.r) } // 人だまりの近さ
      const grdLow = Math.max(0, Math.min(1, (28 - Math.max(0, fp.y - heightAt(fp.x, fp.z))) / 22)) // 地面からの高さ＝標高の高い時代エリア(江戸/大正の台地)でも降りればざわめきが満ちる
      crowdAmt *= grdLow * outAmt // 人混みは低空/地上で（賑わいの中に居る時）
      // 空間音(③-c): 音源の方角を、飛行の進行向き(flyYaw)を基準にした左右パン(-1..1)へ。飛びながら横を抜けると音が左右へ流れ、
      //  振り向く(flyYaw変化)と反対へ回る＝「その世界に居る」。基準向き＝飛行はflyYaw／窓辺は見回しyaw。
      const aOut = (active.flyP || 0) > 0.2, baseYaw = aOut ? (active.flyYaw || 0) : (active.yaw || 0)
      // 右=+。位置や向きが一瞬でも壊れた値になると定位がNaNになり、音の更新がまるごと例外で止まる
      //（実機の検収で毎フレーム例外が出ていた）。計算できない時は「正面(0)」に倒す。
      const bearingPan = (sx, sz) => { const p = Math.sin(Math.atan2(sx - fp.x, -(sz - fp.z)) - baseYaw); return Number.isFinite(p) ? p : 0 }
      // 夏祭りの囃子＝遠くでほんのり聞こえ、近づくほど大きくなる（音で会場を探す）。窓辺でも遠くの祭りが届く。
      let festAmt = 0, festPan = 0
      if (festivalSpots.length) {
        const lx2 = aOut ? fp.x : eye.x, lz2 = aOut ? fp.z : eye.z, FEST_AUDIBLE = 175; let nd = 1e9, nfs = null
        for (const fs of festivalSpots) { const d = Math.hypot(lx2 - fs.x, lz2 - fs.z); festAmt = Math.max(festAmt, Math.pow(Math.max(0, Math.min(1, (FEST_AUDIBLE - d) / FEST_AUDIBLE)), 1.7)); if (d < nd) { nd = d; nfs = fs } }
        if (aOut) festAmt *= Math.max(0, Math.min(1, (60 - Math.max(0, fp.y - SEA.level)) / 50)) // 飛行は高いほど静か（窓辺は等倍）
        if (nfs) festPan = bearingPan(nfs.x, nfs.z) // 最寄りの会場の方角へ定位
      }
      if (rainActive) festAmt = 0 // 通り雨の間は祭りの囃子をしぼる（雨が降ったら祭りは中断＝現実忠実・実機FB）
      // 駅の音＝駅に近づくと発車ベル・電車の通過音が満ちる（歩行/低空で）。谷戸には駅が無い。
      let staAmt = 0, staPan = 0
      if (kind !== 'yato') {
        const lx2 = aOut ? fp.x : eye.x, lz2 = aOut ? fp.z : eye.z, d = Math.hypot(lx2 - STATION.x, lz2 - STATION.z)
        staAmt = Math.pow(Math.max(0, Math.min(1, (78 - d) / 78)), 1.8)
        if (aOut) staAmt *= Math.max(0, Math.min(1, (40 - Math.max(0, fp.y - SEA.level)) / 36)) // 高いほど静か（ホームの音は地上で）
        staPan = bearingPan(STATION.x, STATION.z) // 駅の方角へ定位
      }
      // 雲海の島の音の気配＝灯籠市は遠い祭りの余韻(囃子・控えめ)、水のある島(棚田/社跡/温泉/天の井戸)はせせらぎ/水音。近づくと満ちる（既存の音チャンネルを再利用）。
      if ((active.flyP || 0) > 0.4 && fp.y > 52 && cloudWalkInfo) {
        for (const n of cloudWalkInfo.nodes) {
          const near = Math.max(0, 1 - Math.hypot(fp.x - n.x, fp.z - n.z) / 42)
          if (near <= 0) continue
          if (n.kind === 'market') { if (!rainActive) { festAmt = Math.max(festAmt, near * 0.5); festPan = bearingPan(n.x, n.z) } } // 無人の灯籠市＝遠い祭りの余韻
          else if (n.kind === 'paddy' || n.kind === 'ruin' || n.kind === 'onsen' || n.kind === 'well') riverAmt = Math.max(riverAmt, near * 0.42) // 水のある島＝せせらぎ/水滴
        }
      }
      onAmbience(seaAmt, riverAmt, crowdAmt, festAmt, staAmt, festPan, staPan) }
    // 夜の灯りの息づき（篝火/松明＝炎の揺らぎ・ガス灯＝穏やかな明滅）。二重サインで不規則に。
    for (const g of nightGlows) g.m.opacity = Math.max(0, g.base * (1 + g.amp * (Math.sin(t * g.sp + g.ph) * 0.6 + Math.sin(t * g.sp * 1.73 + g.ph * 1.3) * 0.4)))
    // 静かな瞬間の鈴＝雲上で休む/止空でじっと佇むと、ふと澄んだ音が満ちる（整う）。嫌われたBGMパッドの代わりの、自然で控えめな癒しの音色。
    { const calm = active.onCloud || (active.mode === 'fly' && !active.cruise && Math.hypot(active.vel.x, active.vel.z) < 1.6 && (active.flyP || 0) > 0.6 && active.flyPos.y > SEA_Y - 12) || (active.mode === 'walk' && (active.sitAmt || 0) > 0.6) // 歩いて立ち止まり腰をおろすと、ふと澄んだ鈴が満ちる
      // 実時計 t で計る（休息中は描画が間引かれ dt が頭打ちになるため、dt 積算だと鈴が遅れる）
      if (calm) { if (t >= chimeT) { chimeT = t + 8 + R() * 10; onChime(); chimeCount++ } } else chimeT = t + 4 + R() * 4 }
    // 夕暮れの街にどこからか流れるチャイム（夕方の合図＝「もうおうちへ」の郷愁）。夕夜の街(home)でだけ・初回＋ごくたまに。高空や別世界（城下町/雲海）では鳴らさない。
    if (eveChimeT < 0) eveChimeT = (kind !== 'yato' && (isNight || duskAmt > 0.36)) ? t + 11 + R() * 6 : Infinity
    else if (t >= eveChimeT) { eveChimeT = t + 240 + R() * 180; if (active.mode !== 'fly' || (active.flyP || 0) < 0.7) onEveningChime() }
    // 操作ゲージの塗りを今の値で更新（＋寄る/速く/上昇で上がる向き）。高さは見渡せる実用域(汀〜90)で正規化。
    zoomGauge.set((3.0 - active.zoomTarget) / 2.6)
    speedGauge.set((active.speedMul - 0.35) / 1.35)
    altGauge.set((active.flyPos.y - bound.yFloor) / (90 - bound.yFloor))
    if (active.climb !== 0) altGauge.show() // 昇降ボタンを押している間はゲージを出し続ける
    // BGMの下地へ「場面」を伝える（部屋/窓/飛行/歩行・速度・高度・地形・各時代の近さ）。setMusicBed側で滑らかに移す。
    {
      const fp = active.flyPos
      const eP = flyAmt * Math.max(0, 1 - Math.hypot(fp.x - EDO.x, fp.z - EDO.z) / 255) // 江戸の近さ＝和の響きが満ちる
      const sP = flyAmt * Math.max(0, 1 - Math.hypot(fp.x - SENGOKU.x, fp.z - SENGOKU.z) / 255) // 戦国の近さ＝低く翳る
      const tP = flyAmt * Math.max(0, 1 - Math.hypot(fp.x - TAISHO.x, fp.z - TAISHO.z) / 255) // 大正の近さ＝港の郷愁
      let terrain = 'land'
      if (flyAmt > 0.3) {
        if (fp.y > SEA_Y - 18) terrain = 'cloud' // 雲海の高さ＝空の上の夢見心地（不気味なマイナーでなく高く澄んだ響きへ）
        else { const gh = heightAt(fp.x, fp.z); if (gh < SEA.level - 2) terrain = 'sea'; else if (gh > 20) terrain = 'mountain' } // 海上＝開放/山上＝荘厳
      }
      onScene({ mode: active.mode, flyAmt, speed: windSpeed01, terrain, edoP: eP, senP: sP, taiP: tP, night: isNight })
    }

    // ── 3Dの室内窓枠の見え隠れ。部屋の中（窓辺）で見え、乗り出すと素早く退いて街へ。空/地上では消す。
    // 世界固定の3D枠なので、カメラの室内視差(roomParallax)＋回転で「近い枠と遠い景色が視差で分離」して、
    // 部屋の中から窓越しに外を覗く手応えになる。CSSの中央桟・窓台は3D枠と二重になるので隠す。
    const roomAmtF = Math.max(0, 1 - lean)
    // 室内は不透明（街を遮蔽してfill節約・カクつき対策）。乗り出すとカメラが窓の開口を抜けて前へ出る＝室内は背後へ退く。
    // lean>0.16で非表示＝カメラがベランダの手すり/窓枠へ達する前に室内ごと消す（貫通して見えるのを防ぐ）。空/地上でも非表示。
    const wrVis = flyAmt < 0.6 && lean < 0.16
    if (winRoom.visible !== wrVis) { winRoom.visible = wrVis; winRoom.matrixWorldAutoUpdate = wrVis; if (wrVis) winRoom.updateMatrixWorld(true) } // 飛行で隠れている間は室内(200+ノード)の行列走査ごとスキップ＝発熱削減。窓辺へ戻ったら一度だけ焼き直す
    // 帰還の儀式「ただいま」: 旅から窓辺へ戻りきった瞬間、澄んだ鈴がひとつ満ち、眠っていた猫が顔を上げてこちらを見る＝
    // 出発点でしかなかった窓が「帰る家」になる（エモ最重要: 帰る場所が無く旅が一周しない）。直前の季節/時刻はドリフトが継続＝引き継がれる。
    if (active.justReturned && flyAmt < 0.18) { active.justReturned = false; onChime()
      if (winCat) { winCat.react = 'lookback'; winCat.reactDur = 2.8; winCat.reactT = 2.8; winCat.wakeHold = Math.max(winCat.wakeHold || 0, 3.2); winCat.alert = 1; winCat.lastReact = -1 } } // 猫が「おかえり」と顔を上げる
    if (winRoom.visible && winSashR) winSashR.position.x = winSashX0 + wo * (winSashX1 - winSashX0) // 窓をあけると右の障子が左へすべって開く
    if (winRoom.visible && winRefl) winRefl.mat.opacity = winRefl.base * (1 - wo) // 窓をあけると硝子の映り込みは消える（外気が澄む）
    if (winRoom.visible && winRainGlass) { winRainGlass.tex.offset.y = (winRainGlass.tex.offset.y + dt * 0.045) % 1; winRainGlass.mat.opacity = 0.62 * (1 - wo) } // 雨粒がガラスを下へ流れる／窓をあけると消える
    if (winRoom.visible) for (const ct of winCurtains) { ct.position.x = ct.userData.x0 + Math.sin(t * 1.15 + ct.userData.cs) * 0.035 * wo; ct.position.z = 0.42 + (0.5 + 0.5 * Math.sin(t * 0.85 + ct.userData.cs * 1.7)) * 0.07 * wo } // 窓をあけると外気でカーテンがそっとそよぐ（閉=静止）
    if (winRoom.visible && windChime) windChime.rotation.z = Math.sin(t * 1.7) * (0.02 + 0.05 * wo) // 風鈴は窓をあけるとよく揺れる（閉=ごく僅か）
    if (winRoom.visible) for (const sp of teaSteam) { const p = (t * 0.16 + sp.userData.ph) % 1; sp.position.y = sp.userData.y0 + p * 0.5; sp.position.x = sp.userData.x0 + Math.sin(t * 0.7 + sp.userData.ph * 6.3) * 0.05 * p; sp.material.opacity = 0.16 * Math.sin(p * Math.PI); sp.scale.setScalar(0.1 + p * 0.16) } // 急須から湯気がゆらりと立ちのぼる
    if (winRoom.visible && winPendulum) winPendulum.rotation.x = Math.sin(t * 2.0) * 0.16 // 柱時計の振り子が静かに時を刻む
    if (winRoom.visible && winDust) { for (let i = 0; i < winDust.base.length; i++) { const b = winDust.base[i]; winDust.arr[i * 3] = b.x0 + Math.sin(t * b.sp + b.ph) * b.amp * 3; winDust.arr[i * 3 + 1] = b.y0 + Math.sin(t * b.sp * 0.7 + b.ph * 1.7) * b.amp * 4; winDust.arr[i * 3 + 2] = b.z0 + Math.cos(t * b.sp * 0.5 + b.ph) * b.amp * 3 } winDust.geo.attributes.position.needsUpdate = true } // 窓の光にほこりがゆらゆら舞う
    if (winRoom.visible && winCat) { const c = winCat // 猫: 眠る・たまに目を覚ます・撫でられると喜ぶ＝生きている気配
      // 覚醒度 alert（0=眠り/1=ぱっちり）。撫でている間=1、たまに自発的に目を覚ます。
      c.wakeT -= dt
      const rainyCat = weather === 'rain' || weather === 'snow' // 雨・雪の日は眠りがちで、起きると窓の外の雨をよく眺める（猫の現実）
      if (c.wakeT < 0 && c.wakeHold <= 0 && c.petActive < 1) { c.wakeT = (32 + R() * 52) * (rainyCat ? 1.5 : 1); c.wakeHold = 2.5 + R() * 3.5
        // 目を覚ますと、ひとりでに毛づくろい/あくび/伸び等をする（タップしなくても生きている・自発の仕草・鳴かない）
        if ((c.reactT || 0) <= 0) { const calm = c.visitPhase === 2 ? ['gaze', 'earFlick', 'yawn'] : rainyCat ? ['groom', 'gaze', 'gaze', 'gaze', 'yawn', 'earFlick'] : ['groom', 'groom', 'yawn', 'stretch', 'earFlick', 'gaze', 'gaze']; c.react = calm[(Math.random() * calm.length) | 0]; c.reactDur = c.react === 'gaze' ? 5.0 : c.react === 'groom' ? 3.4 : (c.react === 'stretch' ? 2.4 : 1.9); c.reactT = c.reactDur; if (c.react === 'gaze') c.gazeYaw = Math.PI; c.wakeHold = Math.max(c.wakeHold, c.reactDur); c.lastReact = -1 }
      } // たまにふと目を覚まし、自発的に仕草をする
      if (c.wakeHold > 0) c.wakeHold -= dt
      // ── 窓辺への“訪問”: 撫でてもらった後や気が向いた時、そばへ来て隣に座り、一緒に窓の外を眺める（「本当に横にいる」瞬間） ──
      c.visitCool = Math.max(0, c.visitCool - dt); c.visitT -= dt
      let visitGo = false // クロージャを毎フレーム作らずフラグで（GCヒッチ配慮）
      if (c.petActive >= 1 && c.petAmt > 0.8) c.petHold += dt
      else if (c.petActive < 1 && c.petHold > 0) { if (c.petHold > 3.5 && c.visitCool <= 0 && c.reactT <= 0 && Math.random() < 0.55) visitGo = true; c.petHold = 0 } // たっぷり撫でてもらうと、手が離れた後そばへ来てくれることがある
      if (c.visitT < 0 && c.visitPhase === 0) { c.visitT = 190 + R() * 240; if (c.visitCool <= 0 && c.alert < 0.3 && c.reactT <= 0 && c.petActive < 1 && Math.random() < 0.6) visitGo = true } // ごく稀に自発でも来る
      if (visitGo && c.visitPhase === 0 && c.relocP >= 1) {
        c.visitPhase = 1; c.visitCool = 150; c.relocT = 46 + R() * 60; c.g.rotation.z = 0
        c.x0 = c.g.position.x; c.z0 = c.g.position.z; c.rot0 = c.g.rotation.y
        c.x1 = 0.62; c.z1 = 1.08; c.rot1 = Math.atan2(c.x1 - c.x0, c.z1 - c.z0)
        if (Math.hypot(c.x1 - c.x0, c.z1 - c.z0) > 0.18) c.relocP = 0 // 離れていれば歩いて向かう（近ければその場で座る）
      }
      if (c.visitPhase === 1 && c.relocP >= 1) { c.visitPhase = 2; c.visitDur = 40 + R() * 50; c.visitLookT = 7 + R() * 6 } // 着いた＝隣に座る
      if (c.visitPhase === 2) {
        c.visitDur -= dt
        if (c.petActive >= 1) c.visitDur = Math.max(c.visitDur, 14) // 撫でられている間は居てくれる
        c.visitLookT -= dt
        if (c.visitLookT < 0) { c.visitLookT = 11 + R() * 10; c.lookXTarget = (Math.random() < 0.5 ? -1 : 1) * 0.85 } // 時々こちらを振り向いて目が合う
        if (c.visitDur <= 0 && c.petActive < 1) { c.visitPhase = 0; c.visitT = 190 + R() * 240; c.relocT = 6 + R() * 9 } // 満足すると、やがて日だまりへ戻っていく
      }
      // 外の気配（鳥の群れ・気球・花火など）に気づく: 浅い眠りなら顔を上げて窓の外を目で追い、深く眠っていれば耳だけぴくり
      if (c.noticeT > 0) { c.noticeT -= dt
        if (c.noticeT <= 0 && c.relocP >= 1) {
          if (c.alert < 0.25 && Math.random() < 0.45) c.earT = -0.001 // 眠ったまま耳だけ動く＝深く生きている気配
          else if ((c.reactT || 0) <= 0) { c.react = 'gaze'; c.reactDur = 4.4; c.reactT = 4.4; c.gazeYaw = Math.PI; c.wakeHold = Math.max(c.wakeHold, 4.6); c.lastReact = -1 }
        }
      }
      // たまに起き上がって伸びをし、日だまりの別の場所へ移って丸くなる（猫の現実的な“移動”）
      c.relocT -= dt
      if (c.relocT < 0 && c.relocP >= 1 && c.petActive < 1 && c.alert < 0.3) { c.relocT = 46 + R() * 60; c.relocP = 0
        c.x0 = c.g.position.x; c.z0 = c.g.position.z; c.rot0 = c.g.rotation.y; c.g.rotation.z = 0
        const ang = Math.random() * 6.28, d = 0.55 + Math.random() * 0.75
        c.x1 = Math.max(-0.35, Math.min(1.35, c.x0 + Math.cos(ang) * d)); c.z1 = Math.max(1.05, Math.min(2.35, c.z0 + Math.sin(ang) * d))
        c.rot1 = Math.atan2(c.x1 - c.x0, c.z1 - c.z0) }
      // じゃれ追い: ご機嫌な時、止まった毛糸玉へ自分から歩み寄り、着いたら打つ（relocの歩行を流用・飽きる(playful減衰)まで繰り返す）。
      if (c.chaseT === undefined) c.chaseT = 4 + R() * 4
      c.chaseT -= dt
      if (c.relocP >= 1 && c.petActive < 1 && !c.chaseToy && c.chaseT < 0 && c.playful > 0.35 && !c.visitPhase) {
        const toyRest = Math.hypot(c.toyVX, c.toyVZ) < 0.2, dToy = Math.hypot(c.toyG.position.x - c.g.position.x, c.toyG.position.z - c.g.position.z)
        if (toyRest && dToy > 0.55 && dToy < 2.4) { c.chaseT = 4 + R() * 5; c.relocP = 0; c.chaseToy = true
          c.x0 = c.g.position.x; c.z0 = c.g.position.z; c.rot0 = c.g.rotation.y; c.g.rotation.z = 0
          const ddx = c.toyG.position.x - c.x0, ddz = c.toyG.position.z - c.z0, dd = Math.hypot(ddx, ddz) || 1
          c.x1 = Math.max(-0.35, Math.min(1.35, c.x0 + ddx / dd * (dd - 0.4))); c.z1 = Math.max(1.05, Math.min(2.35, c.z0 + ddz / dd * (dd - 0.4))); c.rot1 = Math.atan2(c.x1 - c.x0, c.z1 - c.z0)
        } else c.chaseT = 4 + R() * 4 // 条件外なら近いうちに再判定
      }
      const reloc = c.relocP < 1
      c.alertTarget = (c.petActive >= 1 || c.wakeHold > 0 || reloc || c.visitPhase === 2) ? 1 : 0 // 窓辺で外を眺めている間は目を開けている
      c.alert += (c.alertTarget - c.alert) * Math.min(1, dt * 3.2)
      if (c.petActive >= 1) c.petAmt = Math.min(1, c.petAmt + dt * 0.5); else c.petAmt = Math.max(0, c.petAmt - dt * 0.5)
      // ゴロゴロ（撫でられているほど強い）。間引いて音側へ。
      const purrTarget = c.petActive >= 1 ? (0.45 + c.petAmt * 0.55) : 0
      c.purr += (purrTarget - c.purr) * Math.min(1, dt * 2.4)
      if (Math.abs(c.purr - (c.purrSent || 0)) > 0.04) { c.purrSent = c.purr; onPurr(c.purr) }
      // 目: alert>0.42 で開く（こちらを見る）／ふだんは閉じてうとうと
      const open = c.alert > 0.42; for (const e of c.eyesOpen) e.visible = open; for (const e of c.eyesClosed) e.visible = !open
      // 呼吸（撫でられると深く・ゴロゴロで微振動）
      c.body.scale.y = c.y0 * (1 + Math.sin(t * 1.5) * 0.05 + Math.sin(t * 26) * 0.006 * c.purr)
      // 頭: alertで持ち上げてこちらへ＋撫でられると気持ちよさげに首をかしげる
      c.headG.rotation.x = c.headX0 + c.alert * 0.34
      c.headG.position.y = c.headY0 + c.alert * 0.05
      c.headG.rotation.z = Math.sin(t * 1.1) * 0.05 * c.petAmt
      // 尻尾: 起きると立ち気味、撫でるとよく動く＋たまにピクッ
      c.tailT -= dt; if (c.tailT < 0) { c.tailT = (c.alert > 0.5 ? 2 : 5) + R() * 6; c.flickT = 0.7 }
      let flick = 0; if (c.flickT > 0) { c.flickT -= dt; flick = Math.sin((0.7 - c.flickT) * 16) * 0.4 * Math.max(0, c.flickT / 0.7) }
      c.tail.rotation.y = Math.sin(t * (0.55 + c.purr * 0.8)) * (0.07 + c.petAmt * 0.14) + flick
      c.tail.rotation.z = 0.4 - c.alert * 0.28
      // 耳: たまにピクッ（撫でると小刻み）
      c.earT -= dt; if (c.earT < 0) { c.earT = (c.petAmt > 0.3 ? 3 : 7) + R() * 9; c.earK = 0.45 }
      if (c.earK > 0) { c.earK -= dt; const e = Math.sin((0.45 - c.earK) * 26) * 0.22 * Math.max(0, c.earK / 0.45); c.ears[0].rotation.x = c.ears0[0] + e; c.ears[1].rotation.x = c.ears0[1] - e }
      // 寝返り（眠っている・移動していない時だけ）
      c.settleT -= dt; if (c.settleT < 0 && c.settleP >= 1 && c.alert < 0.2 && !reloc) { c.settleT = 30 + R() * 44; c.settleP = 0 }
      if (c.settleP < 1 && !reloc) { c.settleP = Math.min(1, c.settleP + dt / 3.6); c.g.rotation.z = Math.sin(c.settleP * Math.PI) * 0.12 }
      // 移動: 立ち上がり→ぐーっと伸び→とことこ歩く→新しい場所で伏せる。接地影も連れて動く。
      if (reloc) {
        c.relocP = Math.min(1, c.relocP + dt / 5.4)
        const p = c.relocP
        const mv = p < 0.24 ? 0 : p > 0.82 ? 1 : (p - 0.24) / 0.58, ease = mv * mv * (3 - 2 * mv)
        c.g.position.x = c.x0 + (c.x1 - c.x0) * ease
        c.g.position.z = c.z0 + (c.z1 - c.z0) * ease
        c.g.rotation.y = c.rot0 + (c.rot1 - c.rot0) * Math.min(1, p * 2.2)
        const stand = Math.sin(Math.min(1, p / 0.85) * Math.PI)                  // 立ち上がって着地で伏せる
        const step = (mv > 0 && mv < 1) ? Math.abs(Math.sin(p * 26)) * 0.018 : 0  // とことこ
        c.g.position.y = c.baseY + stand * 0.05 + step
        if (mv > 0 && mv < 1) for (let i = 0; i < c.paws.length; i++) { const pw = c.paws[i]; pw.position.z = pw.userData.z0 + Math.sin(p * 26 + i * Math.PI) * 0.055; pw.position.y = pw.userData.y0 + Math.max(0, Math.sin(p * 26 + i * Math.PI)) * 0.028 } // 前足も交互に運ぶ（IKが脚ごと振る＝歩様が出る）
        const st = Math.sin(Math.max(0, Math.min(1, (p - 0.04) / 0.18)) * Math.PI) // 最初のぐーっと伸び
        c.body.scale.x = 1.5 * (1 + st * 0.4 + (mv > 0 && mv < 1 ? 0.14 : 0))
        c.body.scale.z = 1.22 * (1 - st * 0.12)
        if (c.catShadow) { c.catShadow.position.x = c.g.position.x; c.catShadow.position.z = c.g.position.z }
      } else { c.body.scale.x = 1.5; c.body.scale.z = 1.22; if (Math.abs(c.g.position.y - c.baseY) > 0.0005 && c.sitAmt < 0.004) c.g.position.y = c.baseY
        if (c.reactT <= 0) for (const pw of c.paws) { pw.position.y = pw.userData.y0; pw.position.z = pw.userData.z0 } } // 歩き終わりに前足を戻す（お座り/反応はこの後で上書き）
      if (c.chaseToy && c.relocP >= 1) { c.chaseToy = false; batTheToy() } // じゃれ追い: 玉に歩み寄って着いたら打つ（向き直り＋リーチ＋玉を転がす）
      // ── 遊べる反応（タップ/触れるたびに違う仕草）＋ご機嫌の減衰＋まばたき＋頭が手を追う ──
      c.playful = Math.max(0, c.playful - dt * 0.065) // ご機嫌はゆっくり冷める（じゃれ追いが続くよう緩やかに）
      c.lookXTarget *= (1 - Math.min(1, dt * 0.6)) // 見ている方向は徐々に正面へ戻る
      c.lookX += (c.lookXTarget - c.lookX) * Math.min(1, dt * 5)
      if (c.alert > 0.2 && !reloc) c.headG.rotation.y = c.lookX * c.alert // 起きている時こちら(触れた方)を見る
      if (c.alert > 0.5) { c.blinkT -= dt; if (c.blinkT < 0) { c.blinkT = 2.6 + R() * 4; c.blink = 0.13 } } // たまにまばたき
      if (c.blink > 0) { c.blink -= dt; for (const e of c.eyesOpen) e.visible = false; for (const e of c.eyesClosed) e.visible = true }
      // ── お座り（訪問中）: 胸を起こし前脚を立て、尻尾を巻いて窓の外を眺める。前脚は足先目標をIK(aimLegs)が肩から結ぶ ──
      c.sitAmt += ((c.visitPhase === 2 ? 1 : 0) - c.sitAmt) * Math.min(1, dt * 1.7)
      if (c.sitAmt > 0.004) { const sA = c.sitAmt
        let dyw = Math.PI - c.g.rotation.y; dyw = Math.atan2(Math.sin(dyw), Math.cos(dyw))
        c.g.rotation.y += dyw * Math.min(1, dt * 2.4) * sA                 // 窓の方へゆっくり向き直る
        c.g.rotation.x = -0.5 * sA                                          // 胸を起こす（お尻は床のまま）
        c.g.position.y = c.baseY + 0.045 * sA
        for (const pw of c.paws) { pw.position.y = pw.userData.y0 + (-0.12 - pw.userData.y0) * sA; pw.position.z = pw.userData.z0 + (0.33 - pw.userData.z0) * sA } // 前脚をすっと床へ立てる
        c.headG.rotation.x = c.headX0 + c.alert * 0.34 + sA * (0.42 + Math.sin(t * 0.4) * 0.05) // 頭を起こして外を見る
        c.headG.rotation.y += Math.sin(t * 0.33) * 0.14 * sA                // ゆっくり街を見渡す（振り向きのlookXに重なる）
        c.tail.rotation.z = 0.4 - c.alert * 0.28 + sA * 0.55                // 尻尾を体に巻く
      } else if (c.g.rotation.x !== 0) c.g.rotation.x = 0
      if (c.reactT > 0 && !reloc) { c.reactT -= dt
        const p = 1 - c.reactT / c.reactDur, env = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI) // 0→1→0 の山
        switch (c.react) {
          case 'stretch': { const b = Math.sin(Math.min(1, p / 0.45) * Math.PI); c.body.scale.x = 1.5 * (1 + b * 0.5); c.body.scale.z = 1.22 * (1 - b * 0.14); c.headG.rotation.x = c.headX0 + c.alert * 0.34 + b * 0.5; c.g.position.y = c.baseY + b * 0.015; break } // ぐーっと伸び
          case 'roll': { c.g.rotation.z = Math.sin(p * Math.PI) * 0.95; c.g.position.y = c.baseY + env * 0.03; if (c.petActive >= 1) c.purr = Math.max(c.purr, 0.85); break } // ごろん（お腹を見せる）。お腹を撫でられるとゴロゴロ最大
          case 'tailUp': { c.tail.rotation.z = (0.4 - c.alert * 0.28) - env * 0.85; c.tail.rotation.y = Math.sin(t * 9) * 0.4 * env; c.g.position.y = c.baseY + env * 0.012; break } // しっぽぴん＋ご機嫌
          case 'wiggle': { c.g.rotation.z = Math.sin(p * Math.PI * 7) * 0.1 * env; c.tail.rotation.z = (0.4 - c.alert * 0.28) - env * 0.55; break } // おしりふりふり
          case 'earFlick': { const e2 = Math.sin(p * Math.PI * 6) * 0.32 * env; c.ears[0].rotation.x = c.ears0[0] + e2; c.ears[1].rotation.x = c.ears0[1] - e2; c.headG.rotation.z = Math.sin(p * Math.PI * 2) * 0.3 * env; break } // 耳ぴくぴく＋首かしげ
          case 'shake': { c.headG.rotation.y = c.lookX * c.alert + Math.sin(p * Math.PI * 8) * 0.34 * env; break } // ぶるっと頭を振る
          case 'yawn': { const yb = Math.sin(Math.min(1, p / 0.5) * Math.PI); c.headG.rotation.x = c.headX0 + c.alert * 0.34 - yb * 0.32; c.body.scale.y = c.y0 * (1 + yb * 0.08); break } // あくび
          case 'knead': { if (c.paws) for (let i = 0; i < c.paws.length; i++) { const pw = c.paws[i]; pw.position.y = pw.userData.y0 + Math.max(0, Math.sin(t * 6.5 + i * Math.PI)) * 0.055 * env } c.body.scale.y = c.y0 * (1 + Math.sin(t * 6.5) * 0.02 * env); c.purr = Math.max(c.purr, 0.5 * env); break } // ふみふみ（前足こねこね＋ご機嫌）
          case 'groom': { const g2 = Math.sin(Math.min(1, p / 0.35) * Math.PI), lk = 0.5 + 0.5 * Math.sin(p * Math.PI * 9) // 立ち上がり＋舐めるリズム
            if (c.paws && c.paws[0]) { c.paws[0].position.y = c.paws[0].userData.y0 + g2 * (0.16 + lk * 0.03); c.paws[0].position.z = c.paws[0].userData.z0 - g2 * 0.05 } // 前足を顔へ持ち上げる
            c.headG.rotation.x = c.headX0 + c.alert * 0.34 + g2 * (0.24 + lk * 0.06)  // 顔を前足へ下げ、小刻みに舐める
            c.headG.rotation.z = Math.sin(p * Math.PI * 4.5) * 0.14 * g2               // 顔を傾けて舐める
            c.tail.rotation.y = Math.sin(t * 1.2) * 0.1; break } // 毛づくろい（顔を洗う・前足を舐める）
          case 'gaze': { // 窓の外（街・空・鳥）をじっと眺める＝窓辺の猫の情緒。窓の方へ向き直り頭を上げ、ゆっくり首を振って外を見る。
            if (c.gazeYaw !== undefined) { let dy = c.gazeYaw - c.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.g.rotation.y += dy * Math.min(1, dt * 3.5) } // 窓の方へゆっくり向き直る
            const hold = Math.min(1, p / 0.2) * Math.min(1, (1 - p) / 0.16) // 立ち上がりと終いをなめらかに
            c.headG.rotation.x = c.headX0 + c.alert * 0.34 + hold * 0.52       // 頭を上げて外を見上げる（窓の外へ）
            c.headG.rotation.y = Math.sin(t * 0.5) * 0.2 * hold                // ゆっくり首を振って外を見回す（鳥や雲を目で追う）
            c.tail.rotation.y = Math.sin(t * 0.5) * 0.12                        // ゆったり尻尾
            if (c.ears) { c.ears[0].rotation.x = c.ears0[0] + Math.sin(t * 0.8) * 0.05 * hold; c.ears[1].rotation.x = c.ears0[1] + Math.sin(t * 0.8 + 1) * 0.05 * hold } // 耳が外の音へ
            break }
          case 'batToy': { // ボールの方へ向き直ってから前足を伸ばして打つ（向いてる方向だけに伸びる違和感を解消）
            if (c.batYaw !== undefined) { let dy = c.batYaw - c.g.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.g.rotation.y += dy * Math.min(1, dt * 9) } // ボールへ向き直る（最短回り）
            const bt = Math.sin(Math.max(0, Math.min(1, (p - 0.32) / 0.5)) * Math.PI) // 向き直ってから打つ（前半は向き直り）
            if (c.paws && c.paws[0]) { c.paws[0].position.z = c.paws[0].userData.z0 + bt * 0.24; c.paws[0].position.y = c.paws[0].userData.y0 + bt * 0.1 } // 前足をぐっとボールへ伸ばす
            if (c.paws && c.paws[1]) c.paws[1].position.z = c.paws[1].userData.z0 + bt * 0.09 // もう片足も少し
            c.headG.rotation.x = c.headX0 + c.alert * 0.34 + bt * 0.22; c.body.scale.x = 1.5 * (1 + bt * 0.16); c.g.position.y = c.baseY + bt * 0.02; break } // 打つ瞬間に前のめり
          default: { c.headG.rotation.x = c.headX0 + c.alert * 0.34 + Math.sin(p * Math.PI) * 0.08; break } // lookback: じっと見つめる
        }
        if (c.reactT <= 0) { c.react = null; c.g.rotation.z = 0; c.ears[0].rotation.x = c.ears0[0]; c.ears[1].rotation.x = c.ears0[1]; c.headG.rotation.z = 0; if (c.paws) for (const pw of c.paws) { pw.position.y = pw.userData.y0; pw.position.z = pw.userData.z0 } } // 反応終わり＝姿勢を戻す
      }
      if (c.aimLegs) c.aimLegs() // 前足の脚を足先に追従（伸ばすと脚全体が伸びる＝丸い足先だけが浮く違和感を解消）
      // ── 毛糸玉のおもちゃの動き（バットされると転がり、減速し、止まると定位置へそっと戻る） ──
      if (c.toyG) { const tg = c.toyG
        tg.position.x += c.toyVX * dt; tg.position.z += c.toyVZ * dt
        const fr = 1 - Math.min(1, dt * 3.0); c.toyVX *= fr; c.toyVZ *= fr // 摩擦
        tg.position.x = Math.max(-0.4, Math.min(1.62, tg.position.x)); tg.position.z = Math.max(1.08, Math.min(2.4, tg.position.z)) // 畳の中に収める
        if (Math.hypot(c.toyVX, c.toyVZ) < 0.12) { tg.position.x += (c.toyHome.x - tg.position.x) * dt * 0.35; tg.position.z += (c.toyHome.z - tg.position.z) * dt * 0.35 } // 止まったら定位置へ
        if (c.toyBob > 0) c.toyBob -= dt
        tg.position.y = c.baseY + 0.04 + Math.abs(Math.sin(t * 12)) * Math.max(0, c.toyBob) * 0.5 // ころころ弾む
        tg.rotation.x += c.toyVZ * dt * 4; tg.rotation.z -= c.toyVX * dt * 4 // 転がる
        if (c.toyHit) c.toyHit.position.set(tg.position.x, c.baseY + 0.06, tg.position.z)
        if (c.toyShadow) { c.toyShadow.position.x = tg.position.x; c.toyShadow.position.z = tg.position.z }
      } }
    // CSSの窓枠（外枠frame2・ガラスglass・中央桟cross・窓台sill）は、3Dの室内窓枠と二重像になる（窓に窓が
    // 重なるバグ）。3D枠が完全な窓を担うのでCSS窓枠は全て隠す。室内の薄暗がりroomVigと水彩オーバーレイは残す。
    glass.style.opacity = '0'
    cross.style.opacity = '0'
    frame2.style.opacity = '0'
    // 部屋の中ほど周辺を暗く（薄暗い室内から明るい窓を覗く明暗）。静的グラデの不透明度だけ動かす＝軽い。
    const roomDark = roomAmtF * (1 - wo * 0.4)
    if (Math.abs(roomDark - roomDarkCur) > 0.02) { roomDarkCur = roomDark; roomVig.style.opacity = roomDark.toFixed(2) }
    sill.style.opacity = '0'
    paper.style.opacity = (0.18 * (1 - lean * 0.6)).toFixed(3) // 紙目をやや強め水彩の手触りに（乗り出すと薄れる）
    // ガラス越しのくすみを、あけ／乗り出しに応じて晴らす（外気が澄む）。変化時だけ書き換え。
    const clarity = Math.min(1, wo * 0.6 + lean * 0.7)
    if (Math.abs(clarity - clarityCur) > 0.004) {
      clarityCur = clarity
      applyStageFilter() // clarity（窓あけ）とユーザ明るさを合成して反映
    }

    // 雲がゆっくり流れる
    for (const c of clouds) { const u = c.userData; c.position.x += 0.01; if (c.position.x > (u.x1 ?? 130)) c.position.x = u.x0 ?? -130 } // 折返しは各雲が生まれた空の窓内（一律±130だと遠方エリアの雲がhomeへ瞬間移動して吹き溜まる）
    // 雲海をゆっくり漂うもの（雲海のぬし＝鯨／空の灯籠／渡りの群れ／雲の滝）。
    // 低空（窓辺・街の巡航）では雲海の世界は霧で見えない＝隠して更新も止める＝発熱低減（見た目は不変）。
    const cloudHi = (active.flyP || 0) > 0.4 && active.flyPos.y > 52
    const cloudReveal = cloudHi ? Math.max(0, Math.min(1, (active.flyPos.y - 58) / 30)) * flyAmt : 0 // 雲海の世界の滲み出し量（y58→88）。島・漂うものを同期させてポップを廃す
    for (const d of skyDrifters) {
      if (!cloudHi) { if (d.o.visible) d.o.visible = false; continue } // 低空ではまとめて隠し、アニメも回さない
      if (d.kind !== 'fall') d.o.visible = cloudReveal > 0.25 // 漂うもの（鯨/灯籠/群れ/湯けむり）は雲海がある程度滲み出てから現れる＝空の何もない所に突然ポップしない（滝は自前の高度フェード）
      if (d.kind === 'whale') {
        if (d.uni) d.uni.uTime.value = t // 進行波で体がうねって泳ぐ（頭は静か・尾が大きくポンプ＝シェーダー）
        d.o.position.x += 2.2 * dt; if (d.o.position.x > 470) d.o.position.x = -470 // ゆっくり横切り、端で戻る
        // ごくたまに雲海へ静かに潜る（控えめ・低頻度）。頭を下げて沈み→雲にveilされながら浮き上がる弧。
        if (d.diveA > 0) { d.diveA += dt / 9; if (d.diveA >= 1) { d.diveA = 0; d.diveT = t + 50 + R() * 40 } }
        else if (t >= d.diveT) d.diveA = 0.0001
        const _dive = d.diveA > 0 ? Math.sin(d.diveA * Math.PI) * 24 : 0 // 沈んで戻る弧
        d.o.position.y = d.baseY + Math.sin(t * 0.18) * 2.4 - _dive // 雲海を上下にたゆたう＋潜り
        d.o.rotation.z = Math.sin(t * 0.18) * 0.04 + (d.diveA > 0 ? -Math.cos(d.diveA * Math.PI) * 0.2 : 0) // 横揺れ＋潜降で頭下げ/浮上で頭上げ
        if (d.calf) d.calf.position.y = -4 + Math.sin(t * 0.18 + 0.9) * 1.1 // 子鯨は親より少し遅れて上下にたゆたう
        if (d.spout) { // 時々ふっと潮を吹く（立ちのぼって細く伸び、漂い散って消える）
          if (d.spoutA > 0) { d.spoutA += dt / 1.8
            if (d.spoutA >= 1) { d.spoutA = 0; d.spout.material.opacity = 0 }
            else { const e = Math.sin(d.spoutA * Math.PI), rise = d.spoutA * d.spoutA; d.spout.material.opacity = e * 0.62; d.spout.position.set(13, 7.5 + rise * 4, 0); d.spout.scale.set(3.4 + d.spoutA * 3.2, 6 + d.spoutA * 12, 1) } } // 後半ほど上へ立ちのぼり細く高く伸びて散る
          else if (t >= d.spoutT && d.diveA === 0) { d.spoutT = t + 13 + R() * 9; d.spoutA = 0.001 } // 13〜22秒ごと（潜行中は吹かない。希少にして神々しさを上げる・アート監督B9）
        }
      } else if (d.kind === 'ferry') { // 空の渡し舟：雲海の上をゆっくり巡り、舟人が棹をさす。進行方向へ舳先を向ける。
        d.ph += dt * 0.02
        d.o.position.x = d.cx + Math.cos(d.ph) * d.rad
        d.o.position.z = d.cz + Math.sin(d.ph) * d.rad
        d.o.position.y = d.seaY + 0.3 + Math.sin(t * 0.5) * 0.22 // 雲海の上で静かにたゆたう
        d.o.rotation.y = -d.ph                                    // 進行方向へ舳先（接線）
        d.o.rotation.z = Math.sin(t * 0.5) * 0.03                 // 横揺れ
        if (d.pole) d.pole.rotation.x = -0.5 + Math.sin(t * 0.55) * 0.22 // 棹をさす
      } else if (d.kind === 'toro') { // 灯籠流し：雲海の水面をゆっくり流れ、各灯籠が静かに上下に揺れる（帯の中を回流＝端で反対側へ）
        d.drift += dt * 0.7
        for (const lz of d.o.children) {
          let wx = lz.userData.x0 + d.drift; const B = 44; wx = ((wx + B) % (2 * B) + 2 * B) % (2 * B) - B // 帯[-44,44]に回流
          lz.position.x = wx
          lz.position.y = Math.sin(t * 0.6 + lz.userData.ph) * 0.12 * lz.userData.bob // 静かに上下
          lz.rotation.y = Math.sin(t * 0.3 + lz.userData.ph) * 0.3                     // ゆらり
        }
      } else if (d.kind === 'cirrus') { // 高層の巻雲ヴェール：高度でフェードしつつ texture をゆっくり流す（雲海の上に層の奥行き）
        d.mat.opacity = cloudReveal * 0.34
        if (d.mat.map) d.mat.map.offset.x = (t * 0.004) % 1
      } else if (d.kind === 'flock') { // 渡りの群れ：ゆっくり+Xへ渡り、端で戻る。羽ばたき＋たゆたい
        d.o.position.x += 3.0 * dt; if (d.o.position.x > 360) d.o.position.x = -360
        d.o.position.y = d.o.userData.baseY + Math.sin(t * 0.22) * 1.6
        const flap = Math.sin(t * 6.5) * 0.5; for (const w of d.o.userData.wings) w.rotation.z = -w.userData.side * flap
        if (active && active.mode !== 'window' && (active.flyP || 0) > 0.6) { // 群れに近づいて飛ぶと羽音（間隔をあけて＝並走の手応え）
          const dd = Math.hypot(d.o.position.x - active.flyPos.x, d.o.position.y - active.flyPos.y, d.o.position.z - active.flyPos.z)
          if (dd < 32) { d.wingT = (d.wingT || 0) - dt; if (d.wingT <= 0) { d.wingT = 0.5 + R() * 0.3; onFlockWing(); wingCount++ } }
        }
      } else if (d.kind === 'fall') { // 雲の滝：各房が落ちて、底で薄れ、上から湧き直す
        // 雲海と同じ高度フェード＝窓辺/低空では消し、高く昇って雲海に出た時だけ見える（宙に浮く白い柱に見えるのを防ぐ）。
        const fop = active.mode === 'walk' ? 0 : Math.max(0, Math.min(1, (active.flyPos.y - 70) / 22)) * flyAmt
        d.o.visible = fop > 0.02
        if (d.o.visible) {
          d.mat.opacity = fop * 0.9
          const u = d.o.userData
          for (const pf of d.o.children) { pf.position.y -= pf.userData.spd * dt
            if (pf.position.y < u.botY) { pf.position.set(pf.userData.x0, u.topY, pf.userData.z0) }
            const f = (pf.position.y - u.botY) / (u.topY - u.botY); pf.scale.set(0.5 + f * 0.5, 1.5 * (0.4 + f * 0.6), 0.5 * (0.5 + f * 0.5)) } // 底ほど細る（薄れて消える）
        }
      } else if (d.kind === 'steam') { // 雲の温泉の湯けむり：上昇しながら揺れ・広がり・薄れ、下から湧き直す
        for (const sp of d.o.children) { const u = sp.userData
          u.ph += dt * u.spd * 0.12; if (u.ph > 1) u.ph -= 1
          const h = u.ph * 9
          sp.position.set(u.x0 + Math.sin(u.ph * 6.28 + u.x0) * 1.3, 0.4 + h, u.z0)
          sp.material.opacity = Math.sin(u.ph * Math.PI) * 0.4
          const sc = 2.6 + u.ph * 3.4; sp.scale.set(sc, sc * 1.15, 1) }
      } else if (d.kind === 'leaffall') { // 御神木から舞い落ちる葉：ゆっくり落ち、揺れ・回り、根元で上から湧き直す（島ローカル座標）
        for (const lf2 of d.o.children) { const u = lf2.userData
          lf2.position.y -= u.spd * dt
          lf2.position.x = u.x0 + Math.sin(t * 0.6 + u.ph) * 1.4
          lf2.position.z = u.z0 + Math.cos(t * 0.5 + u.ph) * 1.0
          lf2.rotation.x += dt * 1.2; lf2.rotation.z += dt * 0.8
          if (lf2.position.y < 1.7) lf2.position.y = 14.2 } // GY(1.2)+0.5で接地→GY+13で上から湧き直す（GYはbuildスコープ＝frameからは見えないため島ローカルの定数で）
      } else if (d.kind === 'motes') { // 天上界の光の粒：ふわりと漂い、明滅する。昼は控えめ(peak)・cloudRevealで滲み出す
        const mPeak = (d.peak || 0.6) * cloudReveal
        for (const sp of d.o.children) { const u = sp.userData
          sp.position.x = u.x0 + Math.sin(t * 0.3 + u.ph) * 4
          sp.position.z = u.z0 + Math.cos(t * 0.24 + u.ph) * 4
          sp.position.y = u.y0 + Math.sin(t * 0.2 + u.ph * 1.7) * 2.5 // ふわりたゆたう
          sp.material.opacity = (0.45 + 0.5 * Math.sin(t * 1.3 + u.ph)) * mPeak } // 明滅
      } else if (d.kind === 'mistveil') { // 島々の間を流れる霧のヴェール：ゆっくり横切り端で戻る・淡く漂う
        for (const sp of d.o.children) { const u = sp.userData
          sp.position.x += u.spd * dt; if (sp.position.x > 240) sp.position.x = -240
          sp.position.y = u.y0 + Math.sin(t * 0.1 + u.ph) * 2
          sp.material.opacity = cloudReveal * 0.17 }
      } else if (d.kind === 'butterfly') { // 蝶：ひらひら舞い、羽ばたく
        for (const b of d.o.children) { const u = b.userData, flap = Math.sin(t * 9 + u.ph) * 0.7
          b.children[0].rotation.z = 0.3 + flap; b.children[1].rotation.z = -(0.3 + flap)
          b.position.x = u.x0 + Math.sin(t * u.spd + u.ph) * 8
          b.position.z = u.z0 + Math.cos(t * u.spd * 0.8 + u.ph * 1.3) * 8
          b.position.y = u.y0 + Math.sin(t * 0.7 + u.ph) * 2.5 }
      } else if (d.kind === 'crane') { // 鶴：群島の上をゆっくり旋回滑空、ゆるやかに羽ばたく
        const ang = t * 0.05 + d.ph
        d.o.position.set(d.cx + Math.cos(ang) * d.rad, d.hy + Math.sin(t * 0.2 + d.ph) * 2, d.cz + Math.sin(ang) * d.rad)
        d.o.rotation.y = -ang - Math.PI / 2; d.o.rotation.z = 0.28 // 進行方向へ向き、旋回へ傾ける
        const flap = Math.sin(t * 2.0 + d.ph) * 0.5
        for (const w of d.wings) w.wp.rotation.x = -w.sd * (0.12 + flap) // ゆるやかな羽ばたき（主に滑空）
      } else if (d.kind === 'godshaft') { // 天上界の光芒：雲海に常時そっと差し込む光の柱。cloudRevealで滲み出し・カメラへ向ける（薄板が正面＝光芒に見える）
        const op = cloudReveal * (d.opF || 0.28) // 控えめ（白飛び/ギラつき回避）。夜は更に低く（月光の淡い光芒）
        for (const m of d.mats) m.opacity = op
        const cp = camera.position
        for (const beam of d.o.children) { beam.getWorldPosition(TMP_DIR); beam.rotation.y = Math.atan2(cp.x - TMP_DIR.x, cp.z - TMP_DIR.z) }
      } else if (d.kind === 'well') { // 天の井戸：下界の灯が揺らめいて瞬く＋ときおり水面に波紋が広がる（雫の余韻）
        d.mat.uniforms.uT.value = t; d.mat.uniforms.uOp.value = cloudReveal // 灯の明滅（瞬き）。雲海の滲み出しに同期して現れる
        const rg = d.ring; d.ringT -= dt
        if (d.ringT <= 0) { if (cloudReveal > 0.5) { rg.visible = true; rg.scale.setScalar(0.3); rg.material.opacity = 0.42; rg.userData.life = 0 } d.ringT = 2.6 + R() * 3.4 }
        if (rg.visible) { rg.userData.life += dt; const f = rg.userData.life / 1.7; if (f >= 1) rg.visible = false; else { rg.scale.setScalar(0.3 + f * 1.35); rg.material.opacity = (1 - f) * 0.42 } }
      } else { // 灯籠：ゆっくり昇りつつ揺れ、上端で下から湧き直す。灯はゆるく瞬く（炎のゆらめき＝懐かしい灯り）
        const u = d.o.userData
        d.o.position.y += u.rise * dt; if (d.o.position.y > SEA_Y + 58) d.o.position.y = SEA_Y + 4
        d.o.position.x = u.baseX + Math.sin(t * 0.3 + u.ph) * u.sway
        d.o.position.z = u.baseZ + Math.cos(t * 0.24 + u.ph) * u.sway
        if (u.glow) u.glow.material.opacity = u.glowBase * (0.72 + 0.28 * Math.sin(t * 1.6 + u.ph)) // ゆるい瞬き
      }
    }
    if (cloudHi !== lastCloudHi) { lastCloudHi = cloudHi; for (const o of cloudObjs) o.visible = cloudHi } // 低空では雲海の静的要素も一括で隠す（描画コール節約・見た目は霧で不変）
    // 雲海の世界（島・入道雲・吊り橋）を高度でゆっくりフェードして滲み出させる＝boolのポップを廃し、雲海(seaOp)と同期した上質な切り替わりに。
    if (cloudHi && cloudRevealMats) {
      for (const m of cloudRevealMats) m.opacity = m.__revBase * cloudReveal // y58で滲み始めy88で実体化（雲海seaOp y70→92に重なり、白い霞seaCrossが仕上げを覆う）。材の収集とtransparent切替はマウント時に済ませ済み（reveal時のリコンパイル大ヒッチを廃す）
    }
    // 雲海の奥深く（雲の層の上＝眼下の街は雲deckに隠れる高度）では街を丸ごと非表示＝「雲海＋街」の二重描画を解消し負荷を半減（雲海の重さ対策）。ヒステリシスでチラつき防止。
    const deepCloud = cloudHi && active.flyPos.y > (lastDeep ? SEA_Y + 2 : SEA_Y + 10)
    if (deepCloud !== lastDeep) { lastDeep = deepCloud; town.visible = !deepCloud }
    // 銭湯の煙：低空（窓辺・街）でだけ立ちのぼる。各房が位相をずらして上昇→広がり→薄れ、上で湧き直す＝街の生きた動き。
    for (const sm of townSmoke) {
      if (cloudHi) { if (sm.visible) sm.visible = false; continue }
      if (!sm.visible) sm.visible = true
      const sp = sm.userData // 源ごとの上昇高さ・なびき・広がり・濃さ
      for (const pf of sm.children) { const u = pf.userData
        u.ph += dt * u.spd * 0.09; if (u.ph > 1) u.ph -= 1
        pf.position.set(u.ph * sp.drift + Math.sin(u.ph * 6.0 + u.spd) * 0.8, u.ph * sp.rise, Math.cos(u.ph * 5.0 + u.spd) * 0.6) // +Xへなびきながら昇る
        pf.material.opacity = Math.sin(u.ph * Math.PI) * sp.op
        const sc = 0.7 + u.ph * sp.maxSc; pf.scale.set(sc, sc, sc) } // 昇るほど広がって薄れる
    }
    // 「いつもと違う光景」定期イベントを進め、各タイムスケールで時々起こす
    updateFx(dt)
    scheduleFx(dt)
    lastJsMs = lastJsMs * 0.9 + (performance.now() - _js0) * 0.1 // 毎フレームのJS処理時間（移動平均・検証用）
    // 飛行中も解像度は最高(qCap=1.6)のまま保つ＝景色を一望する時こそ綺麗に。輪郭のギザギザはFXAAでなめらかに（発熱をほぼ増やさず）。
    if (composer) { try { composer.render() } catch (e) { composer = null; renderer.render(scene, camera) } } else renderer.render(scene, camera)
  }
  // 初回フレームでの「可視マテリアルの一斉シェーダーコンパイル」(progs多数=数百msのヒッチ)を、
  // 描画を始める前にまとめて済ませる＝マウント直後の最初のframe()が固まらない（暗転の裏で温める）。
  // 対象は現在可視のマテリアルのみ（時代群は reveal 時に別途・本丸の段階生成は将来）。失敗しても従来どおり初回frameで遅延コンパイルされる。
  // 雲海の材を「最初から透明」にして集めておく＝初めて雲海高度に達した瞬間の transparent 切替→全雲海材の一斉リコンパイル(数百ms)を無くす。
  // この一斉リコンパイルが、上昇ボタンの長押しを iOS に pointercancel させ「雲海突入直前で1回解除」させていた実機FBの主因。直後の compile で透明版を温める。
  // 低空では cloudObjs.visible=false なので、常時透明でも低空の描画コスト（オーバードロー）は増えない。
  if (cloudObjs && cloudObjs.length) { cloudRevealMats = []; for (const o of cloudObjs) o.traverse((c) => { if (c.isMesh) { const mm = Array.isArray(c.material) ? c.material : [c.material]; for (const m of mm) { if (m && m.__revBase === undefined) { m.__revBase = (m.opacity == null ? 1 : m.opacity); m.transparent = true; m.opacity = 0; cloudRevealMats.push(m) } } } }) }
  try { renderer.compile(scene, camera) } catch { /* コンパイル先行に失敗しても描画は継続 */ }
  renderer.shadowMap.needsUpdate = true // 影を最初の描画で一度だけ焼く（以降は静的）
  frame()
  requestAnimationFrame(() => stage.classList.add('town3d-stage--in'))

  // 検証用: 見回しを外から設定（?dev=1 のサムネ/撮影で角度を指定）
  if (/[?&]dev=1/.test(location.search)) {
    window.__town3dSetView = (y, p) => { if (active) { active.yaw = active.yawTarget = y || 0; active.pitch = active.pitchTarget = p || 0 } }
    window.__town3dPaused = (on) => setTown3dPaused(!!on) // 検証用: おやすみ相当の描画停止/再開（active.pausedを立てる）
    window.__town3dBloom = (on) => { if (bloomPass) { bloomPass.enabled = !!on; return bloomPass.strength } return null } // 検証用: ブルームを強制ON/OFF（同一フレームでのAB＝アニメ差を排除）
    window.__town3dBloomInfo = () => bloomPass ? { enabled: bloomPass.enabled, strength: +bloomPass.strength.toFixed(3), wanted: bloomWanted } : null // 検証用: 現情景のブルーム状態
    window.__town3dFrame = () => renderer.info.render.frame // 検証用: 実描画したフレーム総数（停止中は増えない＝停止の確認に使う）
    window.__town3dFly = (b) => setTown3dFly(!!b) // 検証用: 空へ飛び立つ/窓へもどる
    window.__town3dLand = (b) => setTown3dLand(!!b) // 検証用: 着地して歩く/また飛び立つ
    window.__town3dMove = (x, y) => { if (active) { active.moveX = x || 0; active.moveY = y || 0 } } // 検証用: スティック入力(-1..1)。0,0で離す
    window.__town3dFaceWalk = (y) => { if (active) { active.flyYaw = active.flyYawTarget = y || 0 } } // 検証用: 歩行の向き(rad)を直接指定
    window.__town3dLook = (dx, dy) => applyTown3dLook(dx || 0, dy || 0) // 検証用: 見回しドラッグ(画面比)。歩行=横でカメラ回転/縦で上下
    window.__town3dFlash = (v) => triggerTown3dFlash(v || 0.85) // 検証用: 遠雷の稲光を手動発火
    window.__town3dEraCull = () => eraCull.map((e) => ({ n: e.grp.children.length, vis: e.vis })) // 検証用: 時代群の捕捉数・表示状態
    window.__town3dTransparent = (x, y, z, rad = 30) => { // 検証用: 指定3D点の近くの全メッシュ/スプライトを列挙（白い箱の正体特定）
      const out = []; const wp = new THREE.Vector3()
      scene.traverse((o) => { if ((o.isMesh || o.isSprite) && o.material && o.visible) { o.getWorldPosition(wp); const d = Math.hypot(wp.x - x, wp.y - y, wp.z - z); if (d < rad) { const m = o.material; out.push({ d: +d.toFixed(0), y: +wp.y.toFixed(1), op: +(m.opacity ?? 1).toFixed(2), tr: !!m.transparent, col: m.color ? '#' + m.color.getHexString() : '?', type: o.isSprite ? 'Sprite' : o.geometry.type, par: o.parent && o.parent.type }) } } })
      out.sort((a, b) => a.d - b.d); return { n: out.length, near: out.slice(0, 12) }
    }
    window.__town3dProbe = (x, z) => { // 検証用: その地点が当たり判定で塞がれているか＋近くのコライダー
      const blocked = blockedAt(x, z)
      const near = []
      for (const c of colliders) { const dx = x - c.x, dz = z - c.z; const d = Math.hypot(dx, dz); if (d < 8) near.push(c.hw !== undefined ? { rect: 1, d: +d.toFixed(1), hw: +c.hw.toFixed(1), hd: +c.hd.toFixed(1) } : { circ: 1, d: +d.toFixed(1), r: +c.r.toFixed(1) }) }
      near.sort((a, b) => a.d - b.d)
      return { blocked, near: near.slice(0, 6), nColliders: colliders.length }
    }
    window.__town3dClear = (x, z) => { // 検証用: 16方位の通行可能距離（openYawの中身）
      const out = []
      for (let a = 0; a < 16; a++) { const yaw = a / 16 * 6.2832; const hx = Math.sin(yaw), hz = -Math.cos(yaw); let d = 1.0; for (; d < 34; d += 1.2) { if (blockedAt(x + hx * d, z + hz * d)) break } out.push(+d.toFixed(1)) }
      return out
    }
    window.__town3dTreeProbe = () => { // 検証用: 最寄りの木の距離＋その樹冠の現在の透明度
      if (!active) return null
      let best = null, bd = 1e9
      for (const tr of treesArr) { const d = Math.hypot(tr.position.x - active.flyPos.x, tr.position.z - active.flyPos.z); if (d < bd) { bd = d; best = tr } }
      const leaf = best && best.children[0]
      return { dist: +bd.toFixed(2), faded: !!(best && best.userData.fadeMat && leaf.material === best.userData.fadeMat), opacity: leaf && leaf.material.transparent ? +leaf.material.opacity.toFixed(2) : 1 }
    }
    window.__town3dDraw = () => { // 検証用: 実シーンを直接描画して本当の描画コール/三角形/プログラム数を得る（composerの最終1枚でなく）
      if (!active || !active.camera) return null
      const ar = renderer.info.autoReset; renderer.info.autoReset = false; renderer.info.reset()
      renderer.render(scene, active.camera)
      const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, progs: renderer.info.programs ? renderer.info.programs.length : -1, texMem: renderer.info.memory.textures, geoMem: renderer.info.memory.geometries }
      renderer.info.autoReset = ar; return r
    }
    window.__town3dAttribute = () => { // 検証用: カテゴリを隠して描画コールの差分を測る＝各カテゴリの描画コール寄与
      if (!active || !active.camera) return null
      const ar = renderer.info.autoReset; renderer.info.autoReset = false
      const measure = () => { renderer.info.reset(); renderer.render(scene, active.camera); return renderer.info.render.calls }
      const base = measure()
      const cat = (objs) => { const vis = (objs || []).filter((o) => o && o.visible); vis.forEach((o) => { o.visible = false }); const c = measure(); vis.forEach((o) => { o.visible = true }); return base - c }
      // 特殊構造物（学校/観覧車/公園/寺/駅/展望塔/副都心）を位置で拾って寄与を測る
      const near = (cx, cz, r) => town.children.filter((c) => c.visible && Math.hypot(c.position.x - cx, c.position.z - cz) < r)
      // 輪郭線メッシュ（outlineMat）の寄与＋本数
      const outs = []; town.traverse((o) => { if (o.isMesh && o.material === outlineMat && o.visible) outs.push(o) }); const outlineN = outs.length
      const catOut = () => { outs.forEach((o) => { o.visible = false }); const c = measure(); outs.forEach((o) => { o.visible = true }); return base - c }
      const out = { base, residents: cat(residents), critters: cat(critters.map((c) => c.g)), cityWalkers: cat(cityWalkers.map((c) => c.g)), trees: cat(treesArr), clouds: cat(clouds), birds: cat(birds), skyDrifters: cat(skyDrifters.map((d) => d.o || d)), winRoom: cat([winRoom]), school: cat(near(54, -18, 9)), ferris: cat(near(-26, -66, 11)), park: cat(near(16, -27, 10)), temple: cat(near(40, -74, 12)), downtown: cat(near(-118, -56, 30)), outlines: catOut(), outlineN, townChildren: town.children.length }
      renderer.info.autoReset = ar; return out
    }
    window.__town3dMeshHisto = () => { // 検証用: town直下の各childが持つ可視メッシュ数のヒストグラム＝メッシュ(描画コール)の集中箇所
      let totalMesh = 0, totalSprite = 0, lines = 0; const perChild = []
      const countMesh = (o) => { let n = 0; o.traverse((c) => { if (c.visible && (c.isMesh || c.isPoints)) n++ }); return n }
      for (const ch of town.children) { if (!ch.visible) continue; const n = countMesh(ch); totalMesh += n; perChild.push(n) }
      scene.traverse((o) => { if (o.visible && o.isSprite) totalSprite++; if (o.visible && o.isLine) lines++ })
      perChild.sort((a, b) => b - a)
      // バケツ: 1メッシュのchild数、2-4、5-9、10+。10+の合計メッシュ数も。
      const buckets = { one: 0, few: 0, mid: 0, heavy: 0 }; let heavyMeshSum = 0
      for (const n of perChild) { if (n <= 1) buckets.one++; else if (n <= 4) buckets.few++; else if (n <= 9) buckets.mid++; else { buckets.heavy++; heavyMeshSum += n } }
      // 上位childの位置（どの構造物か特定用）
      const withPos = town.children.filter((c) => c.visible).map((c) => ({ n: countMesh(c), x: +c.position.x.toFixed(0), z: +c.position.z.toFixed(0) })).sort((a, b) => b.n - a.n).slice(0, 18)
      return { townChildren: town.children.length, totalMeshInTown: totalMesh, totalSprite, lines, buckets, heavyMeshSum, topChildren: withPos }
    }
    window.__town3dHeavy = (topN = 20) => { // 検証用: 描画コールを食っている重いchildの正体（メッシュ数・材質の内訳・位置）＝統合の当てどころ
      const rows = []
      for (const ch of town.children) {
        if (!ch.visible) continue
        const mats = new Map(); let n = 0
        ch.traverse((c) => {
          if (!c.visible || !(c.isMesh || c.isPoints)) return
          n++
          const m = c.material
          const key = !m ? '(材質なし)'
            : (m.uuid + '|' + (m.type || '') + '|' + (m.color ? m.color.getHexString() : '') + '|' + (m.transparent ? 't' : 'o') + '|' + (m.map ? 'map' : '') + '|' + (m.vertexColors ? 'vc' : ''))
          const cur = mats.get(key) || { n: 0, type: m ? m.type : '?', col: m && m.color ? '#' + m.color.getHexString() : '?', tr: !!(m && m.transparent), map: !!(m && m.map), vc: !!(m && m.vertexColors), geo: c.geometry && c.geometry.type }
          cur.n++; mats.set(key, cur)
        })
        if (n < 2) continue
        const list = [...mats.values()].sort((a, b) => b.n - a.n)
        rows.push({ n, mats: list.length, x: +ch.position.x.toFixed(0), z: +ch.position.z.toFixed(0), top: list.slice(0, 5) })
      }
      rows.sort((a, b) => b.n - a.n)
      const heavy = rows.filter((r) => r.n >= 10)
      // 街全体で「同じ材質を使う静的メッシュ」がどれだけ散っているか＝棟をまたいだ統合の伸びしろ
      const byMat = new Map()
      let staticMesh = 0, animMesh = 0
      for (const ch of town.children) {
        if (!ch.visible) continue
        const anim = ch.matrixAutoUpdate === true // 動くものは matrixAutoUpdate が生きている（統合できない）
        ch.traverse((c) => {
          if (!c.visible || !c.isMesh || !c.material) return
          if (anim) { animMesh++; return }
          staticMesh++
          const k = c.material.uuid
          const cur = byMat.get(k) || { n: 0, type: c.material.type, col: c.material.color ? '#' + c.material.color.getHexString() : '?', tr: !!c.material.transparent, vc: !!c.material.vertexColors }
          cur.n++; byMat.set(k, cur)
        })
      }
      const mats = [...byMat.values()].sort((a, b) => b.n - a.n)
      const mergeable = mats.filter((m) => m.n >= 8).reduce((s, m) => s + m.n, 0)
      return {
        townChildren: town.children.length, heavyN: heavy.length, heavyMeshSum: heavy.reduce((s, r) => s + r.n, 0), rows: rows.slice(0, topN),
        静的メッシュ: staticMesh, 動くメッシュ: animMesh, 材質の種類: mats.length,
        統合の伸びしろ: { 対象メッシュ: mergeable, 統合後: mats.filter((m) => m.n >= 8).length, 削減見込み: mergeable - mats.filter((m) => m.n >= 8).length },
        材質上位: mats.slice(0, 20),
      }
    }
    window.__town3dPoints = () => { // 検証用: 粒(Points)の材質一覧。絵柄(map/alphaMap)が無い粒は WebGL の既定で「四角」に描かれる
      const out = []
      scene.traverse((o) => { if (o.visible && o.isPoints && o.material) out.push({ n: o.geometry.attributes.position.count, size: o.material.size, 絵柄: !!(o.material.map || o.material.alphaMap), op: +(o.material.opacity ?? 1).toFixed(2), par: (o.parent && o.parent.name) || (o.parent && o.parent.type) || '' }) })
      return out
    }
    window.__town3dLoad = () => { // 検証用: 毎フレーム更新される配列の件数（CPU負荷の実体）
      const n = (a) => Array.isArray(a) ? a.length : (a && a.size) || 0
      return { jsMs: +lastJsMs.toFixed(2), residents: n(residents), critters: n(critters), cityWalkers: n(cityWalkers), birds: n(birds), skyDrifters: n(skyDrifters), balloons: n(balloons), townSmoke: n(townSmoke), senMist: n(senMist), clouds: n(clouds), trees: n(treesArr), adBalloons: n(adBalloons) }
    }
    window.__town3dHeights = (x, z) => ({ heightAt: +heightAt(x, z).toFixed(2), senH: +senH(x, z).toFixed(2), SEAlevel: SEA.level }) // 検証用: 地点の地形高・戦国地形高・海面
    window.__town3dWaterScan = (cx, cz, rad = 60, step = 4) => { // 検証用: 範囲内の水面メッシュと、その上に乗る/水没する地物を集計（水上の家の特定）
      const waters = [], wp = new THREE.Vector3()
      scene.traverse((o) => { if (o.isMesh && o.material && o.visible && o.material.map === (seaTex || null) && o.material.map) { o.getWorldPosition(wp); waters.push({ y: +wp.y.toFixed(2), type: o.geometry.type, par: o.parent && o.parent.type }) } })
      // 地形が海面下になるセルの割合
      let below = 0, tot = 0, minH = 1e9, maxH = -1e9
      for (let x = cx - rad; x <= cx + rad; x += step) for (let z = cz - rad; z <= cz + rad; z += step) { const h = heightAt(x, z); if (h < -900) continue; tot++; if (h < SEA.level + 0.2) below++; if (h < minH) minH = h; if (h > maxH) maxH = h }
      return { SEAlevel: SEA.level, nWaters: waters.length, watersY: [...new Set(waters.map(w => w.y))].slice(0, 12), terrain: { minH: +minH.toFixed(2), maxH: +maxH.toFixed(2), belowSeaPct: +(below / Math.max(1, tot) * 100).toFixed(0) } }
    }
    window.__town3dPick = (u, v) => { // 検証用: 画面座標(u,v=0..1)からレイキャストして当たったメッシュを列挙（白い四角の正体特定）
      if (!active || !active.camera) return null
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(u * 2 - 1, -(v * 2 - 1)), active.camera)
      const hits = rc.intersectObjects(scene.children, true).filter((h) => h.object.visible && h.object.material)
      return hits.slice(0, 6).map((h) => { const o = h.object, m = o.material; return { d: +h.distance.toFixed(1), y: +h.point.y.toFixed(1), col: m.color ? '#' + m.color.getHexString() : '?', op: +(m.opacity ?? 1).toFixed(2), type: o.isSprite ? 'Sprite' : o.geometry.type, par: o.parent && o.parent.type, nm: o.name || (o.parent && o.parent.name) || '' } })
    }
    window.__town3dSoundCounts = () => ({ chime: chimeCount, wing: wingCount }) // 検証用: 鈴・羽音の発火数
    window.__town3dPalProbe = () => ({ duskAmt: +duskAmt.toFixed(2), isNight, snowy: SNOWY, skyTop: '#' + skyTop.getHexString(), skyBright: +skyBright.toFixed(3) }) // 検証用: 時間帯
    window.__town3dDrift = (f) => { drift.t = DRIFT_SECS * Math.max(0, Math.min(1, f || 0)) } // 検証用: 日の傾きのドリフトを任意の進み具合(0..1)へ早送り
    window.__town3dClimb = (v) => { if (active) active.climb = v || 0 } // 検証用（旧）
    window.__town3dSit = () => +((active && active.sitAmt) || 0).toFixed(2) // 検証用: 歩行で立ち止まった「腰をおろす」量(0..1)
    window.__town3dSteer = (dx, dy) => applyTown3dSteer(dx || 0, dy || 0) // 検証用: 飛行のドラッグ操舵(画面比)。横=旋回・縦=上昇下降
    window.__town3dCruise = (b) => setTown3dCruise(!!b) // 検証用: とまる(false)/すすむ(true)
    window.__town3dLowCruise = (b) => { if (active) { active.lowCruise = !!b; if (b) active.cruise = true } } // 検証用: 低空滑空(自転車)モード
    window.__town3dZoom = (v) => { if (active) { active.zoomTarget = Math.max(0.4, Math.min(3.0, v || 1)); active.zoom = active.zoomTarget } } // 検証用: ズーム(0.4寄り〜3.0引き)
    window.__town3dClouds = () => clouds.map((c) => [+c.position.x.toFixed(1), +c.position.y.toFixed(1), +c.position.z.toFixed(1), c.userData.fadeMat ? +c.userData.fadeMat.opacity.toFixed(2) : 1]) // 検証用: 雲の位置一覧＋近接フェードの不透明度
    window.__town3dDbg = () => active && ({ // 検証用: 自機の状態（モード・速度・バンク等）
      mode: active.mode, fly: +active.flyP.toFixed(2), x: +active.flyPos.x.toFixed(1), y: +active.flyPos.y.toFixed(1), z: +active.flyPos.z.toFixed(1),
      yaw: +active.flyYaw.toFixed(2), camYaw: +(active.walkCamYaw || 0).toFixed(2), pitch: +active.flyPitch.toFixed(2),
      vel: +Math.hypot(active.vel.x, active.vel.y, active.vel.z).toFixed(2), mvX: +active.moveX.toFixed(2), mvY: +active.moveY.toFixed(2), bank: +active.bankCur.toFixed(2),
    })
    window.__town3dStats = () => { const r = renderer.info.render; let objs = 0; scene.traverse(() => objs++); return { calls: r.calls, tris: r.triangles, objs, pr: +curPR.toFixed(2), ddt: +lastDDT.toFixed(3), low: adQLow, ok: adQOk } } // 検証用: 描画コール/三角形/オブジェクト数/自動品質状態
    window.__town3dResInfo = () => residents.map((r) => ({ x: +r.position.x.toFixed(1), y: +r.position.y.toFixed(1), z: +r.position.z.toFixed(1), face: +r.rotation.y.toFixed(2) })) // 検証用: 住人の位置・向き
    window.__town3dPeepFront = (i, dist = 4, lift = 0.9) => { const p = peeps[i]; if (!p) return; const d = new THREE.Vector3(); camera.getWorldDirection(d); const t = camera.position.clone().addScaledVector(d, dist); const u = p.userData; u.loiter = true; u.hx = t.x; u.hz = t.z; u.rad = 0; u.sp = 0; u.face = Math.atan2(camera.position.x - t.x, camera.position.z - t.z); p.position.set(t.x, t.y - lift, t.z); p.rotation.y = u.face } // 検証用: 簡易peepをカメラ正面の視線上に立たせる（壺感の確認）
    window.__town3dPeepPin = (i, x, z, face = 0, yOver) => { const p = peeps[i]; if (!p) return; const u = p.userData; u.frozen = true; p.position.set(x, yOver !== undefined ? yOver : heightAt(x, z), z); p.rotation.y = face } // 検証用: 簡易peepを座標(任意y)に凍結（shotAtで接写）
    window.__town3dResPin = (i, x, z, face = 0, yOver) => { const r = residents[i]; if (!r) return; const u = r.userData; u.frozen = true; r.position.set(x, yOver !== undefined ? yOver : heightAt(x, z), z); r.rotation.y = face; u.face = face } // 検証用: 住人を座標(任意y)に凍結
    window.__town3dFolkPin = (i, x, z, face = Math.PI, y = 90) => { const f = festDancers[i]; if (!f) return; f.d.position.set(x, y, z); f.y0 = y; f.d.rotation.y = face } // 検証用: 祭りの踊り手/演者(folkBody)を上空へ（空背景で接写）
    window.__town3dFolkCount = () => festDancers.length
    window.__town3dQuadFront = (i = 0, dist = 4) => { const q = quads[i]; if (!q) return; const d = new THREE.Vector3(); camera.getWorldDirection(d); const t = camera.position.clone().addScaledVector(d, dist); const u = q.userData; u.moving = false; u.moveT = 1e9; u.hx = t.x; u.hz = t.z; q.position.set(t.x, heightAt(t.x, t.z), t.z) } // 検証用: 犬猫をカメラ正面の地面へ（造形確認）
    window.__town3dQuadPin = (i, x, z, y, face = 0) => { const q = quads[i]; if (!q) return; const u = q.userData; u.moving = false; u.moveT = 1e9; u.hx = x; u.hz = z; q.position.set(x, y !== undefined ? y : heightAt(x, z), z); q.rotation.y = face } // 検証用: 犬猫を座標(任意y)に固定（shotAtで接写）
    window.__town3dQuadCount = () => quads.length
    window.__town3dQuadDbg = (i) => { const q = quads[i]; if (!q) return null; return { x: q.position.x, y: q.position.y, z: q.position.z, vis: q.visible, sc: q.userData.sc } } // 検証用: 犬猫の現在位置/可視/スケール
    window.__town3dQuadShot = (col = 0x8a7a5a, sc = 0.7, yaw = 2.0, kind) => { // 検証用: 犬猫馬を原点に1頭だけ作り、隔離シーンで正確に接写（造形の確認）
      const g = mkQuad(0, 0, 0, yaw, col, sc, kind); town.remove(g); const qi = quads.indexOf(g); if (qi >= 0) quads.splice(qi, 1)
      const s = new THREE.Scene(); s.add(new THREE.AmbientLight(0xfff6ec, 0.9))
      const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(0.4, 1, 1.2); s.add(dl)
      const dl2 = new THREE.DirectionalLight(0xeaf0ff, 0.3); dl2.position.set(-0.7, 0.4, 0.6); s.add(dl2); s.add(g)
      const horse = (kind || (sc >= 0.9 ? 'horse' : '')) === 'horse'
      const W = 520, H = 460, cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 30), r = (horse ? 3.4 : 2.5) * sc
      cam.position.set(r, (horse ? 1.5 : 0.85) * sc, r); cam.lookAt(0, (horse ? 0.95 : 0.5) * sc, 0)
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: LIGHT ? 0 : 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace
      const pRT = renderer.getRenderTarget(), pA = renderer.getClearAlpha(), pC = new THREE.Color(); renderer.getClearColor(pC)
      renderer.setClearColor(0xc2ccce, 1); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(s, cam)
      const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); renderer.setRenderTarget(pRT); renderer.setClearColor(pC, pA)
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d')
      const img = cx.createImageData(W, H); for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); cx.putImageData(img, 0, 0)
      s.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() }); rt.dispose(); return cv.toDataURL()
    }
    window.__town3dCrowdShot = (col = 0xb0432e, sc = 0.7, yaw = 0) => { // 検証用: 群衆の一人(mkCrowdPerson)を隔離シーンで接写（顔・腕の造形確認）
      const p = mkCrowdPerson(0, 0, 0, col, sc); if (!p) return null
      town.remove(p); const ci = crowdAnim.indexOf(p); if (ci >= 0) crowdAnim.splice(ci, 1); p.rotation.y = yaw
      const s = new THREE.Scene(); s.add(new THREE.AmbientLight(0xfff6ec, 0.9))
      const dl = new THREE.DirectionalLight(0xffffff, 0.85); dl.position.set(0.3, 1, 1.3); s.add(dl)
      const dl2 = new THREE.DirectionalLight(0xeaf0ff, 0.25); dl2.position.set(-0.7, 0.4, 0.6); s.add(dl2); s.add(p)
      const W = 360, H = 560, cam = new THREE.OrthographicCamera(-0.62 * sc, 0.62 * sc, 0.95 * sc, -0.95 * sc, 0.1, 12)
      cam.position.set(0, 0.78 * sc, 5); cam.lookAt(0, 0.78 * sc, 0)
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: LIGHT ? 0 : 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace
      const pRT = renderer.getRenderTarget(), pA = renderer.getClearAlpha(), pC = new THREE.Color(); renderer.getClearColor(pC)
      renderer.setClearColor(0xc2ccce, 1); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(s, cam)
      const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); renderer.setRenderTarget(pRT); renderer.setClearColor(pC, pA)
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx2 = cv.getContext('2d')
      const img = cx2.createImageData(W, H); for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); cx2.putImageData(img, 0, 0)
      s.remove(p); p.geometry.dispose(); rt.dispose(); return cv.toDataURL()
    }
    window.__town3dCarShot = (col = 0x3a5a7a) => { // 検証用: 駐車車両(mkCar)を隔離シーンで接写（車輪/窓の確認）
      const g = mkCar(0, 0, 0, 0.5, col)
      const s = new THREE.Scene(); s.add(new THREE.AmbientLight(0xfff6ec, 0.9))
      const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(0.4, 1, 1.2); s.add(dl); s.add(g)
      const W = 560, H = 420, cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 30)
      cam.position.set(3.6, 1.8, 3.6); cam.lookAt(0, 0.7, 0)
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: LIGHT ? 0 : 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace
      const pRT = renderer.getRenderTarget(), pA = renderer.getClearAlpha(), pC = new THREE.Color(); renderer.getClearColor(pC)
      renderer.setClearColor(0xc2ccce, 1); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(s, cam)
      const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); renderer.setRenderTarget(pRT); renderer.setClearColor(pC, pA)
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d')
      const img = cx.createImageData(W, H); for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); cx.putImageData(img, 0, 0)
      s.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose() }); rt.dispose(); return cv.toDataURL()
    }
    window.__town3dResClip = () => { // 検証用: 建物コライダーに食い込んでいる住民/peepの数（実機FB「住民が建物に食い込む」の定量化）
      let resIn = 0, peepIn = 0; const bad = []
      for (const r of residents) if (blockedAt(r.position.x, r.position.z)) { resIn++; bad.push({ t: 'res', x: +r.position.x.toFixed(1), z: +r.position.z.toFixed(1) }) }
      for (const p of peeps) if (blockedAt(p.position.x, p.position.z)) { peepIn++; bad.push({ t: 'peep', x: +p.position.x.toFixed(1), z: +p.position.z.toFixed(1) }) }
      return { residents: residents.length, peeps: peeps.length, resIn, peepIn, bad: bad.slice(0, 12) }
    }
    window.__town3dResFace = (i, ya) => { if (residents[i]) { const u = residents[i].userData; residents[i].rotation.y = ya; u.face = ya; u.moving = false; u.pauseT = 999; for (const a of u.arms) a.rotation.x = 0; for (const l of u.legs) l.rotation.x = 0 } } // 検証用: 住人を止めて向きを固定（顔の確認）
    window.__town3dCatReloc = () => { if (winCat) { winCat.relocT = -1; winCat.alert = 0; winCat.wakeHold = 0; winCat.petActive = 0 } } // 検証用: 猫の移動を今すぐ起こす
    window.__town3dCatReact = (n) => { if (winCat) { winCat.react = n || 'roll'; winCat.reactDur = n === 'gaze' ? 5.0 : 2.4; winCat.reactT = winCat.reactDur; winCat.wakeHold = winCat.reactDur; winCat.alert = 1; if (n === 'gaze') winCat.gazeYaw = Math.PI; winCat.lastReact = -1 } } // 検証用: 猫の反応を手動発火
    window.__town3dCatBat = () => { batTheToy() } // 検証用: 毛糸玉をバット（転がす）
    window.__town3dJump = () => { triggerJump() } // 検証用: ジャンプ発火
    window.__town3dJumpState = () => active ? { mode: active.mode, jumpY: +(active.jumpY || 0).toFixed(2), jumpVel: +(active.jumpVel || 0).toFixed(2), y: +active.flyPos.y.toFixed(2), btnShown: jumpBtn.classList.contains('jump--show') } : null
    window.__town3dToyPos = () => winCat && winCat.toyG ? { x: +winCat.toyG.position.x.toFixed(2), y: +winCat.toyG.position.y.toFixed(2), z: +winCat.toyG.position.z.toFixed(2), vx: +winCat.toyVX.toFixed(2) } : null
    window.__town3dCatState = () => winCat ? { x: +winCat.g.position.x.toFixed(2), z: +winCat.g.position.z.toFixed(2), relocP: +winCat.relocP.toFixed(2), alert: +winCat.alert.toFixed(2), visitPhase: winCat.visitPhase, sit: +winCat.sitAmt.toFixed(2), react: winCat.react || '' } : null
    window.__town3dTownAudit = () => { // 検証用: 町並みの配置違反の監査（家に食い込む木＝取り下げ数と残数／道・線路の回廊に載る建物）
      let treeLeft = 0
      for (const tr2 of treesArr) if (rectAt(tr2.position.x, tr2.position.z)) treeLeft++
      let houseOnRoad = 0, houseOnRail = 0; const roadSamples = []
      for (const c of colliders) { if (c.hw === undefined) continue
        if (Math.abs(c.x) < 4.2 && c.z > -98 && c.z < 28) { houseOnRoad++; if (roadSamples.length < 8) roadSamples.push([+c.x.toFixed(1), +c.z.toFixed(1), +c.hw.toFixed(1), +c.hd.toFixed(1)]) }
        if (Math.abs(c.z - RAIL.z) < 2.6 && c.x > RAIL.x0 && c.x < RAIL.x1) houseOnRail++ }
      return { buriedTrees, buriedEraTrees, treeLeft, houseOnRoad, houseOnRail, trees: treesArr.length, buriedSamples, roadSamples }
    }
    window.__town3dCatVisit = () => { if (winCat) { winCat.visitCool = 0; winCat.visitT = -1; winCat.alert = 0; winCat.wakeHold = 0; winCat.reactT = 0; winCat.petActive = 0; winCat.visitPhase = 0 } } // 検証用: 窓辺への訪問を今すぐ起こす（次のvisitT判定で発火）
    window.__town3dResTo = (i, x, z) => { if (residents[i]) { const u = residents[i].userData; residents[i].position.set(x, heightAt(x, z), z); u.ax = x; u.az = z; u.tx = x; u.tz = z; u.moving = false; u.pauseT = 999 } } // 検証用: 住人を開けた場所へ移動
    window.__town3dResFront = (i, dist = 9, lift = 0.9) => { const r = residents[i]; if (!r) return; const d = new THREE.Vector3(); camera.getWorldDirection(d); const t = camera.position.clone().addScaledVector(d, dist); r.position.set(t.x, t.y - lift, t.z); const u = r.userData; u.ax = t.x; u.az = t.z; u.tx = t.x; u.tz = t.z; u.moving = false; u.pauseT = 999 } // 検証用: 3D住人をカメラ正面の視線上に立たせる（窓の遮蔽回避）
    window.__town3dGirlFront = (i, dist = 5) => { const g = standees[i]; if (!g) return; const d = new THREE.Vector3(); camera.getWorldDirection(d); const t = camera.position.clone().addScaledVector(d, dist); g.position.set(t.x, t.y - 1.0, t.z) } // 検証用: 立ち絵をカメラ正面の視線上へ
    window.__town3dGirlCount = () => standees.length
    window.__town3dShotAt = (cx, cy, cz, lx, ly, lz, fov) => { // 検証用: 任意のカメラ位置/注視点でシーンを正確に1枚撮る（飛行の三人称オフセット無し）
      const W = 640, H = 560
      const cam = new THREE.PerspectiveCamera(fov || 55, W / H, 0.1, 2200); cam.position.set(cx, cy, cz); cam.lookAt(lx, ly, lz)
      // 空ドーム/太陽光輪はアニメ毎フレームでカメラへ追従する（L7685付近）。単発撮影はそれが走らず、
      // 遠い時代エリア(原点から640)ではドーム外＝黒い虚空＋星が透けて夜のように写る。撮影前に追従位置を合わせ実機と一致させる。
      const sdP = skyDome && skyDome.position.clone(); if (skyDome) skyDome.position.set(cx, cy, cz)
      const sgP = sunGlow && sunGlow.position.clone(); if (sunGlow) sunGlow.position.set(cx + sunDir.x * 470, cy + sunDir.y * 470, cz + sunDir.z * 470)
      const sdkP = sunDisk && sunDisk.position.clone(); if (sunDisk) sunDisk.position.set(cx + sunDir.x * 472, cy + sunDir.y * 472, cz + sunDir.z * 472)
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: LIGHT ? 0 : 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace
      const pRT = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(scene, cam)
      const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); renderer.setRenderTarget(pRT)
      if (skyDome && sdP) skyDome.position.copy(sdP); if (sunGlow && sgP) sunGlow.position.copy(sgP); if (sunDisk && sdkP) sunDisk.position.copy(sdkP) // 追従位置を元へ戻す
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const img = x.createImageData(W, H)
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); x.putImageData(img, 0, 0); rt.dispose()
      return c.toDataURL()
    }
    window.__town3dGroundAt = (x, z) => heightAt(x, z) // 検証用: 地面の高さ（カメラを地中に潜らせない/正しい歩行目線に置く）
    window.__town3dRayGround = (x, z) => { const rc = new THREE.Raycaster(new THREE.Vector3(x, 220, z), new THREE.Vector3(0, -1, 0)); const meshes = []; scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry) meshes.push(o) }); const hits = rc.intersectObjects(meshes, false); return hits.slice(0, 5).map((h) => ({ y: +h.point.y.toFixed(1), v: h.object.geometry.attributes.position.count })) } // 検証用: 上から当たる全メッシュの高さ＋頂点数（地形メッシュ=多頂点/海=4頂点を識別）
    // 検証用: 浮遊の自機を任意の位置・向きへ即座に置いて撮影する（飛行視点のサムネ確認）
    window.__town3dFlyPose = (x, y, z, yaw, pitch) => {
      if (!active || !active.flyEnabled) return
      active.flyPos.set(x, y, z)
      active.flyYaw = active.flyYawTarget = yaw || 0
      active.flyPitch = active.flyPitchTarget = pitch || 0
      active.vel.set(0, 0, 0); active.bankCur = 0; active.camReady = false // 引いたカメラを新しい位置へスナップ
      if (active.mode === 'window') active.mode = 'fly'
      active.flyP = 1; active.flyTarget = 1
    }
    window.__town3dCompShot = (cx, cy, cz, lx, ly, lz, fov, dist = 6, birdYaw, flap = 0.35, sideOff = 1.2, upOff = -0.3) => { // 検証用: つかの間の道連れ(comp)をカメラ前に置いて1枚撮る（一過性で通常は撮れないため）
      const cam = new THREE.Vector3(cx, cy, cz), dir = new THREE.Vector3(lx, ly, lz).sub(cam).normalize()
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
      comp.position.copy(cam).addScaledVector(dir, dist).addScaledVector(right, sideOff).addScaledVector(new THREE.Vector3(0, 1, 0), upOff)
      comp.rotation.set(0, birdYaw === undefined ? Math.atan2(dir.x, dir.z) : birdYaw, 0)
      for (const w of comp.userData.wings) w.rotation.z = w.userData.side * flap
      comp.visible = true
      return window.__town3dShotAt(cx, cy, cz, lx, ly, lz, fov)
    }
    window.__town3dBirdFlock = () => { const g = evBirdFlock(); window.__town3dFlockPos = () => g.position.toArray() } // 検証用: V字のかもめの行列を任意発火＋現在位置を追える（追い撮り用）
  }

  // 移動スティック（ぷにコン）の見た目＝触れた場所に出る円とつまみ。空/地上でだけ現れる。
  const stickWrap = document.createElement('div'); stickWrap.className = 'town3d-stick'
  const stickBase = document.createElement('div'); stickBase.className = 'town3d-stick__base'
  const stickKnob = document.createElement('div'); stickKnob.className = 'town3d-stick__knob'
  stickBase.appendChild(stickKnob); stickWrap.appendChild(stickBase); stage.appendChild(stickWrap)

  // ── 操作: 窓辺はドラッグで見回し。空/地上は左半分=移動スティック・右半分=見回し（両手で同時可）。──
  const dom = renderer.domElement
  dom.style.touchAction = 'none' // スクロール/ピンチに操作を奪われない
  let lookId = null, lookLX = 0, lookLY = 0          // 見回し中のポインタ（歩行）
  let lookDownT = 0, lookDX0 = 0, lookDY0 = 0, lookMoved = false // 右側の「タップ(ジャンプ)」と「ドラッグ(見回し)」を見分ける
  let stickId = null, stickOX = 0, stickOY = 0       // 移動スティック中のポインタ＋発生原点（歩行）
  let steerId = null, steerLX = 0, steerLY = 0       // 飛行のドラッグ操舵中のポインタ（スキームA）
  let pettingId = null                               // 窓辺の猫を撫でているポインタ（猫に触れて始まる）
  const petRay = new THREE.Raycaster(), petNDC = new THREE.Vector2()
  const hitCat = (clientX, clientY) => { // 画面の座標が窓辺の猫に当たっているか（撫でる判定）
    if (!winCat || !winRoom.visible || !active || active.mode !== 'window') return false
    const r = stage.getBoundingClientRect()
    petNDC.x = ((clientX - r.left) / r.width) * 2 - 1; petNDC.y = -((clientY - r.top) / r.height) * 2 + 1
    petRay.setFromCamera(petNDC, camera)
    return petRay.intersectObject(winCat.hit).length > 0
  }
  const hitToy = (clientX, clientY) => { // 毛糸玉のおもちゃに当たっているか
    if (!winCat || !winCat.toyHit || !winRoom.visible || !active || active.mode !== 'window') return false
    const r = stage.getBoundingClientRect()
    petNDC.x = ((clientX - r.left) / r.width) * 2 - 1; petNDC.y = -((clientY - r.top) / r.height) * 2 + 1
    petRay.setFromCamera(petNDC, camera)
    return petRay.intersectObject(winCat.toyHit).length > 0
  }
  const batTheToy = () => { const c = winCat; if (!c) return // おもちゃをタップ＝猫がボールの方へ向き直り前足でバットして毛糸玉が転がる
    if (c.visitPhase === 2) { c.earT = -0.001; return } // 窓辺で寛いでいる間はおもちゃに付き合わない（耳だけぴくり＝猫の気まぐれ）
    // ボールの位置へ体を向ける（向いた方向＝ボール方向になり、前足が自然にボールへ届く）。離れた所なら近くへ寄ってから打つ。
    const dx = c.toyG.position.x - c.g.position.x, dz = c.toyG.position.z - c.g.position.z, d = Math.hypot(dx, dz) || 0.001
    c.batYaw = Math.atan2(dx, dz) // facing +z 基準＝この角でボールを正面に捉える
    // 毛糸玉は猫から離れる向きへ転がす（ランダムでなく一打の方向性）。少しだけ角度をブレさせる。
    const ux = dx / d, uz = dz / d, spread = (Math.random() - 0.5) * 0.7, cs = Math.cos(spread), sn = Math.sin(spread), sp = 1.3 + Math.random() * 1.0
    c.toyVX = (ux * cs - uz * sn) * sp; c.toyVZ = (ux * sn + uz * cs) * sp; c.toyBob = 0.14
    c.react = 'batToy'; c.reactDur = 1.4; c.reactT = 1.4; c.wakeHold = Math.max(c.wakeHold, 2.0); c.playful = Math.min(1, c.playful + 0.34); c.lastReact = -1
    if (Math.random() < 0.7) onMeow(c.voice * (1.0 + Math.random() * 0.1), 'short')
  }
  if (/[?&]dev=1/.test(location.search)) { window.__town3dBatToyAt = (wx, wz) => { if (!winCat) return null; winCat.toyG.position.set(wx, winCat.toyG.position.y, wz); winCat.toyHit.position.copy(winCat.toyG.position); batTheToy(); return { catX: +winCat.g.position.x.toFixed(2), catZ: +winCat.g.position.z.toFixed(2), batYaw: +winCat.batYaw.toFixed(2) } } // 検証用: 毛糸玉を指定位置へ置いて打撃を起こす
    window.__town3dCatChase = (wx, wz) => { if (!winCat) return null; if (wx !== undefined) { winCat.toyG.position.set(wx, winCat.toyG.position.y, wz); winCat.toyHit.position.copy(winCat.toyG.position) } winCat.toyVX = 0; winCat.toyVZ = 0; winCat.playful = 1; winCat.chaseT = -1; winCat.relocP = 1; winCat.chaseToy = false; return { catX: +winCat.g.position.x.toFixed(2), catZ: +winCat.g.position.z.toFixed(2), toyX: +winCat.toyG.position.x.toFixed(2), toyZ: +winCat.toyG.position.z.toFixed(2) } } // 検証用: 玉を置いて即じゃれ追いを起こす
    window.__town3dCatState2 = () => winCat ? { catX: +winCat.g.position.x.toFixed(2), catZ: +winCat.g.position.z.toFixed(2), chaseToy: !!winCat.chaseToy, relocP: +winCat.relocP.toFixed(2), react: winCat.react || '', toyX: +winCat.toyG.position.x.toFixed(2), toyZ: +winCat.toyG.position.z.toFixed(2) } : null }
  // 窓辺の猫の「遊べる反応」。タップ/触れるたびに違う仕草を返す＝撫でるだけでなく構って遊べる。
  const CAT_REACTIONS = [
    { n: 'lookback', dur: 2.4 }, // 起きてこちらをじっと見つめる
    { n: 'stretch', dur: 2.4 },  // ぐーっと伸びをする
    { n: 'roll', dur: 2.7 },     // ごろんと寝返り（お腹を見せる）
    { n: 'tailUp', dur: 2.3 },   // しっぽをぴんと立ててご機嫌
    { n: 'wiggle', dur: 1.9 },   // おしりふりふり（じゃれる前のため）
    { n: 'earFlick', dur: 1.4 }, // 耳をぴくぴく＋首をかしげる
    { n: 'shake', dur: 1.2 },    // ぶるっと頭を振る
    { n: 'yawn', dur: 2.0 },     // ふわぁとあくび
    { n: 'knead', dur: 3.2 },    // ふみふみ（前足でこねこね＝ご機嫌の極み）
    { n: 'groom', dur: 3.4 },    // 毛づくろい（前足を舐めて顔を洗う＝猫の白眉）
  ]
  const triggerCatReaction = (nx) => { const c = winCat; if (!c) return
    c.playful = Math.min(1, c.playful + 0.34) // 構うほどご機嫌＝活発に
    if (nx !== undefined) { c.lookXTarget = Math.max(-0.5, Math.min(0.5, nx)) } // 触れた方を見る
    if (c.reactT > c.reactDur * 0.4) return // 反応の出始めは上書きしない（連打で固まらない）
    let pool = CAT_REACTIONS.map((_, i) => i)
    if (c.visitPhase === 2) pool = [0, 3, 5, 6, 7] // 窓辺に座っている間は姿勢を崩さない仕草だけ（見つめる/しっぽ/耳/頭ぶる/あくび）
    else if (c.playful > 0.5) pool = pool.concat([1, 2, 3, 4]) // ご機嫌なら活発な仕草(stretch/roll/tailUp/wiggle)を重く
    let idx; let tries = 0; do { idx = pool[(Math.random() * pool.length) | 0]; tries++ } while (idx === c.lastReact && tries < 6)
    c.lastReact = idx; c.react = CAT_REACTIONS[idx].n; c.reactDur = CAT_REACTIONS[idx].dur; c.reactT = c.reactDur
    c.wakeHold = Math.max(c.wakeHold, c.reactDur) // 反応の間は起きている
    // タップ反応で鳴く（毎回でなく時々＝うるさくしない）。ご機嫌だと甘え声(短い)、ふだんは「にゃーん」。
    if (Math.random() < 0.62) onMeow(c.voice * (0.95 + Math.random() * 0.12), c.playful > 0.55 && Math.random() < 0.6 ? 'short' : 'long')
  }
  const aloftNow = () => active && (active.mode === 'fly' || active.mode === 'walk')
  const setStick = (dx, dy) => {
    let nx = dx / FLY.stickRadius, ny = -dy / FLY.stickRadius // 上方向(画面上)を前進(+)に
    let m = Math.hypot(nx, ny); if (m > 1) { nx /= m; ny /= m; m = 1 }
    // 半径方向の不感帯＝倒した向きを歪めず、しきい値からなめらかに立ち上がる（旧: 軸別の不感帯＝斜め入力で向きが飛ぶ・カクッと動き出す）
    const g = m < FLY.stickDead ? 0 : (m - FLY.stickDead) / (1 - FLY.stickDead)
    const s = m > 0 ? g / m : 0
    active.moveX = nx * s
    active.moveY = ny * s
    const kx = Math.max(-1, Math.min(1, dx / FLY.stickRadius)) * FLY.stickRadius
    const ky = Math.max(-1, Math.min(1, dy / FLY.stickRadius)) * FLY.stickRadius
    stickKnob.style.transform = `translate(${kx.toFixed(0)}px, ${ky.toFixed(0)}px)`
  }
  const showStick = (x, y) => {
    stickBase.style.left = x + 'px'; stickBase.style.top = y + 'px'
    stickWrap.classList.add('stick--on'); stickWrap.classList.remove('stick--rest'); stickKnob.style.transform = 'translate(0,0)' // 触れた点へ濃く出す
  }
  // 常駐スティック: 歩行で触れていない間も既定位置(左下)に淡く出す＝スティックの在りかが分かる。触れた瞬間そこへ移って濃くなる（puniコン）。
  const restStick = () => { stickBase.style.left = '20%'; stickBase.style.top = '74%'; stickWrap.classList.add('stick--on', 'stick--rest'); stickKnob.style.transform = 'translate(0,0)' }
  const hideStick = () => { if (active) { active.moveX = 0; active.moveY = 0 } if (active && active.mode === 'walk' && active.flyP > 0.5) restStick(); else stickWrap.classList.remove('stick--on', 'stick--rest') }
  const pointers = new Map() // 全ポインタ id->{x,y}（ピンチ＝2本指ズームの判定用）
  let pinchD0 = 0, pinchZoom0 = 1
  const onDown = (e) => {
    if (!active) return
    active.lastInputT = performance.now(); active.cinema = 0 // 触れたらオートシネマは即解除
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // 歩行は左スティック＋右視点の同時操作が要なので2本指をピンチにしない（ズームは＋/−ボタン）。飛行/窓辺は2本指＝ピンチ。
    if (pointers.size === 2 && active.mode !== 'walk') { // 2本指＝ピンチでズーム開始。単指の操舵/移動は解除する。
      const p = [...pointers.values()]
      pinchD0 = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1
      pinchZoom0 = active.zoomTarget
      steerId = null; stickId = null; hideStick()
      if (lookId !== null) { lookId = null; active.lookDragging = false }
      return
    }
    if (pointers.size > 2) return
    const rect = stage.getBoundingClientRect()
    const lx = e.clientX - rect.left
    if (active.mode === 'fly') {
      if (steerId === null) { steerId = e.pointerId; steerLX = e.clientX; steerLY = e.clientY } // 飛行＝どこをドラッグしても操舵
    } else if (active.mode === 'walk' && stickId === null && lx < rect.width * 0.5) {
      stickId = e.pointerId; stickOX = e.clientX; stickOY = e.clientY // 歩行の左半分＝スティック発生
      showStick(lx, e.clientY - rect.top); setStick(0, 0); hideCtrlHint() // 操作し始めたら案内を消す
    } else if (pettingId === null && hitToy(e.clientX, e.clientY)) {
      batTheToy() // 毛糸玉をタップ＝猫がじゃれてバット（タップで消費・ドラッグしない）
    } else if (pettingId === null && hitCat(e.clientX, e.clientY)) {
      pettingId = e.pointerId; winCat.petActive = 1 // 窓辺の猫に触れた＝撫でる（見回しでなく猫を構う）
      triggerCatReaction(petNDC.x) // 触れるたびに違う仕草で反応＝遊べる（hitCatでpetNDCが入っている）
    } else if (lookId === null) {
      lookId = e.pointerId; lookLX = e.clientX; lookLY = e.clientY // 歩行の右半分/窓辺＝見回し
      lookDownT = performance.now(); lookDX0 = e.clientX; lookDY0 = e.clientY; lookMoved = false // タップ(ジャンプ)判定の起点
      active.lookDragging = true; hideCtrlHint() // 操作し始めたら案内を消す
    }
  }
  const onMove = (e) => {
    if (!active) return
    if (pointers.has(e.pointerId)) { active.lastInputT = performance.now(); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }) }
    if (pointers.size >= 2 && active.mode !== 'walk') { // ピンチ＝ズーム（指を開く=寄り／閉じる=引き）。歩行は同時操作優先でピンチ無効。
      const p = [...pointers.values()]
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1
      active.zoomTarget = Math.max(0.4, Math.min(3.0, pinchZoom0 * (pinchD0 / d)))
      return
    }
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1
    if (e.pointerId === steerId) {
      applyTown3dSteer((e.clientX - steerLX) / w, (e.clientY - steerLY) / h) // 飛行のドラッグ操舵
      steerLX = e.clientX; steerLY = e.clientY
    } else if (e.pointerId === stickId) setStick(e.clientX - stickOX, e.clientY - stickOY)
    else if (e.pointerId === pettingId && winCat) { winCat.petActive = 1; winCat.petAmt = Math.min(1, winCat.petAmt + 0.03); const rr = stage.getBoundingClientRect(); winCat.lookXTarget = Math.max(-0.5, Math.min(0.5, ((e.clientX - rr.left) / rr.width) * 2 - 1)) } // なでる手の動きでより喜ぶ＋手の方を見る
    else if (e.pointerId === lookId) {
      if (Math.abs(e.clientX - lookDX0) > 9 || Math.abs(e.clientY - lookDY0) > 9) lookMoved = true // 一定以上動いたらドラッグ（タップでなく見回し）
      // 横は素直に（右ドラッグ＝右を向く＝マリオ等のゲームと同じ向き）。縦はそのまま（下ドラッグ＝見上げる＝景色を引き寄せる手触り・ユーザー好み）。
      applyTown3dLook((e.clientX - lookLX) / w * 1.0, (e.clientY - lookLY) / h * 1.0)
      lookLX = e.clientX; lookLY = e.clientY
    }
  }
  const onUp = (e) => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinchD0 = 0 // ピンチ終了
    if (e.pointerId === steerId) steerId = null
    if (e.pointerId === stickId) { stickId = null; hideStick() }
    if (e.pointerId === pettingId) { pettingId = null; if (winCat) winCat.petActive = 0 } // 手を離す＝撫で終わり（余韻はゆっくり冷める）
    if (e.pointerId === lookId) {
      if (active && active.mode === 'walk' && !lookMoved && (performance.now() - lookDownT) < 280) triggerJump() // 右側を素早くタップ＝ジャンプ（ドラッグは見回し）
      lookId = null; if (active) active.lookDragging = false
    }
  }
  // どんな操作（ボタンのタップ含む）でもオートシネマの無操作タイマーを更新（ボタンはstopPropagationするのでcaptureで拾う）
  const markInput = () => { if (active) { active.lastInputT = performance.now(); if (active.cinema > 0) active.cinema = 0 } }
  active.lastInputT = performance.now()
  dom.addEventListener('pointerdown', onDown)
  window.addEventListener('pointerdown', markInput, true)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  // dispose に後始末を足す
  const baseDispose = active.dispose
  active.dispose = () => {
    dom.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointerdown', markInput, true)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    window.removeEventListener('pointerup', winClimbUp) // 昇降解除の保険リスナーも外す（漏れ修正）
    window.removeEventListener('resize', resize)
    stopZoomHold(); stopSpeedHold() // 長押し連続入力のintervalが途中なら止める（dispose時の取りこぼし）
    baseDispose()
  }
}
