// WebGL レンダラ。フルスクリーン三角形に、情景ごとのシェーダーを当てて描く。
// 情景のパレットを時間でゆっくり移ろわせ、設定（強さ・明るさ・品質）を反映する。
// 情景の render 種別が変わったらシェーダー（プログラム）を組み直す。

import { getShader } from '../shaders/index.js'
import { qualityPlan, normQuality } from '../data/quality.js'
import { hexToRgb, mixRgb } from '../util/color.js'

const BASE = import.meta.env.BASE_URL || '/'

// 解像度（端末のピクセル密度の上限）は段の表（src/data/quality.js の '2d'）で決める。レイマーチは画素数で重さが決まるため控えめに。
// 荒さは FXAA＋アンシャープで補う。重い端末は下の自動調整でさらに落とす。
// 自動調整の目安: 描画は約30ミリ秒に間引くので、ふつうの描画間隔は約33ミリ秒。戻す判定はこの目標の1.1倍未満（S20）
const TARGET_MS = 33.4

// ── 後処理アンチエイリアス（FXAA）──
// 情景はフルスクリーン三角形に手続き的に描かれるため、輪郭（step境界）がジャギる。
// 一度オフスクリーンに描いてから FXAA で全輪郭をなめらかにし、画質の荒さを抑える。
const FXAA_VS = /* glsl */ `
  attribute vec2 aPosition;
  void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`
const FXAA_FS = /* glsl */ `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform sampler2D uTex;
  uniform vec2 uResolution;
  void main() {
    vec2 inv = 1.0 / uResolution;
    vec2 uv = gl_FragCoord.xy * inv;
    vec3 rgbM  = texture2D(uTex, uv).rgb;
    vec3 rgbNW = texture2D(uTex, uv + vec2(-1.0, -1.0) * inv).rgb;
    vec3 rgbNE = texture2D(uTex, uv + vec2( 1.0, -1.0) * inv).rgb;
    vec3 rgbSW = texture2D(uTex, uv + vec2(-1.0,  1.0) * inv).rgb;
    vec3 rgbSE = texture2D(uTex, uv + vec2( 1.0,  1.0) * inv).rgb;
    vec3 luma = vec3(0.299, 0.587, 0.114);
    float lM = dot(rgbM, luma);
    float lNW = dot(rgbNW, luma), lNE = dot(rgbNE, luma);
    float lSW = dot(rgbSW, luma), lSE = dot(rgbSE, luma);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    // 平坦な領域は AA せず、ごく軽い先鋭化だけ（解像感を底上げ）
    vec3 blur4 = (rgbNW + rgbNE + rgbSW + rgbSE) * 0.25;
    if (lMax - lMin < 0.018) {
      gl_FragColor = vec4(clamp(rgbM + (rgbM - blur4) * 0.18, 0.0, 1.0), 1.0);
      return;
    }
    vec2 dir;
    dir.x = -((lNW + lNE) - (lSW + lSE));
    dir.y =  ((lNW + lSW) - (lNE + lSE));
    float reduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.125, 1.0 / 128.0);
    float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
    dir = clamp(dir * rcpMin, -8.0, 8.0) * inv;
    vec3 rA = 0.5 * (texture2D(uTex, uv + dir * (1.0 / 3.0 - 0.5)).rgb
                   + texture2D(uTex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rB = rA * 0.5 + 0.25 * (texture2D(uTex, uv + dir * -0.5).rgb
                               + texture2D(uTex, uv + dir *  0.5).rgb);
    float lB = dot(rB, luma);
    vec3 aa = (lB < lMin || lB > lMax) ? rA : rB;
    // アンシャープマスク（FXAA とソフトな手続き描画で失われた解像感を取り戻す＝くっきり）
    aa += (aa - blur4) * 0.42;
    gl_FragColor = vec4(clamp(aa, 0.0, 1.0), 1.0);
  }
`

function compile(gl, type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('シェーダーのコンパイルに失敗:', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export function createRenderer(canvas) {
  const gl =
    canvas.getContext('webgl', { antialias: false, alpha: false }) ||
    canvas.getContext('experimental-webgl')
  if (!gl) return null

  let buffer = null
  function setupBuffer() {
    buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  }
  setupBuffer()

  // ── FXAA 用のオフスクリーン（FBO＋カラーテクスチャ）と仕上げプログラム ──
  let fxaaProgram = null
  let fxaaLoc = {}
  let fxaaAttrib = -1
  let sceneAttrib = -1
  let fbo = null
  let fboTex = null
  let fboW = 0
  let fboH = 0
  let aaEnabled = true // 品質 light では負荷を避けて素通し
  function buildFxaa() {
    const vs = compile(gl, gl.VERTEX_SHADER, FXAA_VS)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FXAA_FS)
    if (!vs || !fs) return false
    const p = gl.createProgram()
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('FXAAプログラムのリンクに失敗:', gl.getProgramInfoLog(p))
      return false
    }
    fxaaProgram = p
    fxaaAttrib = gl.getAttribLocation(p, 'aPosition')
    fxaaLoc = {
      uTex: gl.getUniformLocation(p, 'uTex'),
      uResolution: gl.getUniformLocation(p, 'uResolution'),
    }
    return true
  }
  buildFxaa()
  // オフスクリーンを画面サイズに合わせて確保（サイズ変化時のみ作り直す）
  function ensureFBO(w, h) {
    if (!fxaaProgram) return
    if (!fbo) fbo = gl.createFramebuffer()
    if (!fboTex || fboW !== w || fboH !== h) {
      if (!fboTex) fboTex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, fboTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      fboW = w
      fboH = h
    }
  }

  // パノラマ写真＋深度マップ（任意）。情景が pano を持つときだけ読み込む。
  let panoTex = null
  let panoReady = 0
  let panoDepthTex = null
  let panoDepthReady = 0
  let panoKey = null
  function loadTexture(url, onReady) {
    const img = new Image()
    let tex = null
    img.onload = () => {
      tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false) // baseV=0 を画像上端に合わせる
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
      // NPOT のため CLAMP・mipmapなし（横ループはシェーダー側で fract 処理）
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      onReady(tex, img)
    }
    img.onerror = () => onReady(null)
    img.src = url
  }
  function loadPano(s) {
    const key = s && s.pano ? s.pano : null
    if (key === panoKey) return
    panoKey = key
    // 旧テクスチャを解放（GPUメモリの累積を防ぐ）
    if (panoTex) gl.deleteTexture(panoTex)
    if (panoDepthTex) gl.deleteTexture(panoDepthTex)
    panoTex = null
    panoDepthTex = null
    panoReady = 0
    panoDepthReady = 0
    if (!key) return
    // 読み込みが終わった時に、今の情景の鍵と合うものだけ貼る（素早く切り替えると前の情景の画が後から届くため・S53）。合わない画は解放する
    loadTexture(BASE + s.pano, (tex) => {
      if (key !== panoKey) { if (tex) gl.deleteTexture(tex); return }
      panoTex = tex
      panoReady = tex ? 1 : 0
    })
    if (s.panoDepth) {
      loadTexture(BASE + s.panoDepth, (tex) => {
        if (key !== panoKey) { if (tex) gl.deleteTexture(tex); return }
        panoDepthTex = tex
        panoDepthReady = tex ? 1 : 0
      })
    }
  }

  // 窓の外の背景画像（任意。Flux生成画像など）。情景が bg を持つときだけ読み込む。
  // 本番は保存済みPNGを表示するだけ＝実行時に外部APIを叩かない（外部AI生成の組み込み方針）。
  let bgTex = null
  let bgReady = 0
  let bgKey = null
  let bgTexKey = null // 今貼っている背景の画が、どの情景の鍵で読んだものか（検証用・S53）
  let bgAspect = 1 // 背景の画の縦横比（横/縦）。シェーダーが画面を覆うように切り抜くのに使う（D6）
  function loadBg(s) {
    const key = s && s.bg ? s.bg : null
    if (key === bgKey) return
    bgKey = key
    if (bgTex) gl.deleteTexture(bgTex) // 旧テクスチャを解放（GPUメモリの累積を防ぐ）
    bgTex = null
    bgTexKey = null
    bgReady = 0
    if (!key) return
    loadTexture(BASE + s.bg, (tex, img) => {
      // 前の情景の背景が後から届いたら貼らずに解放する（雨の窓どうしを素早く切り替えた時に、違う窓の外が貼られ解放もされない・S53）
      if (key !== bgKey) { if (tex) gl.deleteTexture(tex); return }
      bgTex = tex
      bgTexKey = tex ? key : null
      if (img && img.naturalHeight) bgAspect = img.naturalWidth / img.naturalHeight
      bgReady = tex ? 1 : 0
    })
  }

  let program = null
  let loc = {}
  let quality = 'standard'
  let shaderType = 'rainGlass'
  let glassMode = 0 // 窓辺シリーズのガラス現象 0=なし 1=雨 2=雪
  let foliageMode = 0 // 季節の舞い 0=なし 1=紅葉 2=花びら
  let seasonMode = 1 // 季節 0=春 1=夏 2=秋 3=冬（窓の状態＝網戸/結露の出し分け）
  let lowRiseMode = 0 // 0=通常の街 1=低層住宅地（北寺尾など坂の住宅地）
  let scene = null
  let settings = { rain: 0.65, brightness: 1.0, quality: 'standard' }
  let rafId = 0
  const startTime = performance.now()
  // 描画解像度の自動調整（重い端末ではフレーム時間を見て解像度を落とし、滑らかさを保つ）
  let renderScale = 1.0
  let simMs = 0, simOnce = 0 // 検証用: 毎回足す重さ／1回だけの詰まり（S20）
  let frameEMA = 16.7
  let lastFrame = 0
  let lastRenderTime = 0 // 約30fpsへ間引くための前回描画時刻（GPU負荷と発熱を半減）
  let adaptCooldown = 60
  // 窓を開ける（0=閉じてガラス越し, 1=開いて素通し）。トグルでなめらかに開閉。
  // 3Dの街(town3dViewer)と「体感」を統一: 線形進行を一定速度で進め smoothstep(ease-in-out)をかける。
  // 旧来の指数追従(*0.06)は出だしだけ急＝ease-outで戻りが不自然だった。全窓シーン共通の所要時間・ヌルヌル感に。
  const easeInOut = (p) => p * p * (3 - 2 * p)
  const approach = (p, target, step) => p + Math.sign(target - p) * Math.min(step, Math.abs(target - p))
  const WIN_DUR = { open: 1.15, lean: 1.5 } // 窓あけ／乗り出しの所要時間(秒)＝town3dのCAMと同値
  let windowOpen = 0
  let windowOpenTarget = 0
  let windowOpenP = 0 // 窓あけの線形進行(0..1)。これに ease-in-out をかけて windowOpen にする
  // 身を乗り出す（0=窓辺, 1=枠が消えて景色だけを180°見渡す）。開けた後の一段深いモード。
  let leanOut = 0
  let leanOutTarget = 0
  let leanOutP = 0   // 乗り出しの線形進行(0..1)
  let winPrevSec = 0 // 窓アニメ用の前フレーム時刻(秒)。経過時間でdtを取り、fpsに依らず一定速度に
  let basePanX = 2.6 // 情景ごとの基本可動域（lean-out で広げる）

  // 最後にユーザー操作があった時刻(ms)。長く無操作なら描画頻度を落として発熱/電池を抑える（眺める主用途の省電力）。
  // 解像度は落とさない＝静止画の鮮明さを守る（鮮明さ優先）。見回し/窓/傾き/情景切替で更新し、操作再開で即フルfpsへ。
  let lastInputT = (typeof performance !== 'undefined' ? performance.now() : 0)
  const markInput = () => { lastInputT = (typeof performance !== 'undefined' ? performance.now() : Date.now()) }
  // 見回し（uPan）。指の操作で目標値を動かし、毎フレームなめらかに追従させる。
  const panCur = { x: 0, y: 0 }
  const panTarget = { x: 0, y: 0 }
  const PAN_LIMIT = { x: 2.6, y: 0.46 } // 見上げ/見下ろしの可動域（上空・道路を見渡せるよう拡大）
  // 端末を傾けた時の視差バイアス（窓の効果。パノラマでのみ使用）
  const parallaxBias = { x: 0, y: 0 }
  // 遠雷フラッシュ。雷鳴に合わせて立ち上げ、毎フレーム減衰させる
  let flashLevel = 0
  // モーション過敏への配慮: 真のときは“息づかい”の揺れを止める（OS設定/設定で切替）
  let reduceMotion = false

  function buildProgram(q, type) {
    const shader = getShader(type)
    const vs = compile(gl, gl.VERTEX_SHADER, shader.vertexSource)
    const fs = compile(gl, gl.FRAGMENT_SHADER, shader.buildFragment(q))
    if (!vs || !fs) return false
    const p = gl.createProgram()
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('プログラムのリンクに失敗:', gl.getProgramInfoLog(p))
      return false
    }
    if (program) gl.deleteProgram(program)
    program = p
    gl.useProgram(program)
    const aPosition = gl.getAttribLocation(program, 'aPosition')
    sceneAttrib = aPosition
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(aPosition)
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)
    loc = {
      uResolution: gl.getUniformLocation(program, 'uResolution'),
      uTime: gl.getUniformLocation(program, 'uTime'),
      uPan: gl.getUniformLocation(program, 'uPan'),
      uParallax: gl.getUniformLocation(program, 'uParallax'),
      uReduceMotion: gl.getUniformLocation(program, 'uReduceMotion'),
      uWindowOpen: gl.getUniformLocation(program, 'uWindowOpen'),
      uLeanOut: gl.getUniformLocation(program, 'uLeanOut'),
      uSeason: gl.getUniformLocation(program, 'uSeason'),
      uLowRise: gl.getUniformLocation(program, 'uLowRise'),
      uGlass: gl.getUniformLocation(program, 'uGlass'),
      uFoliage: gl.getUniformLocation(program, 'uFoliage'),
      uFlash: gl.getUniformLocation(program, 'uFlash'),
      uPano: gl.getUniformLocation(program, 'uPano'),
      uHasPano: gl.getUniformLocation(program, 'uHasPano'),
      uBg: gl.getUniformLocation(program, 'uBg'),
      uHasBg: gl.getUniformLocation(program, 'uHasBg'),
      uBgAspect: gl.getUniformLocation(program, 'uBgAspect'),
      uDepth: gl.getUniformLocation(program, 'uDepth'),
      uHasDepth: gl.getUniformLocation(program, 'uHasDepth'),
      uIntensity: gl.getUniformLocation(program, 'uIntensity'),
      uBright: gl.getUniformLocation(program, 'uBright'),
      uSkyTop: gl.getUniformLocation(program, 'uSkyTop'),
      uSkyMid: gl.getUniformLocation(program, 'uSkyMid'),
      uHorizon: gl.getUniformLocation(program, 'uHorizon'),
      uSunGlow: gl.getUniformLocation(program, 'uSunGlow'),
      uDropTint: gl.getUniformLocation(program, 'uDropTint'),
    }
    quality = normQuality(q)
    shaderType = type
    adaptCooldown = 60 // 組み直した直後の詰まりで解像度を落とさない（S20）
    aaEnabled = q !== 'light' && !!fxaaProgram // 低品質端末では後処理を省いて軽く保つ
    return true
  }

  function resize() {
    const plan = qualityPlan('2d', quality, { dpr: window.devicePixelRatio || 1, cssW: canvas.clientWidth || 1, cssH: canvas.clientHeight || 1 })
    const dpr = plan.cap * renderScale
    // 非表示中(town3d/splat表示中はcanvasがdisplay:none＝clientWidth 0)に0サイズのFBO/ビューポートを作ると
    // INVALID_FRAMEBUFFER_OPERATION(zero size)で1フレーム黒くなる。最低1pxへクランプして回避（評価 技術-重要1）。
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  // 時間帯の移ろい（early→late）を一方向へゆっくり進める＝不可逆な「日の移ろい」。
  // 以前は sin で early↔late を往復し、夕暮れが何度も「明→暮→明」と戻って一回性が無かった（評価指摘）。
  // 中庸（従来の起動時の見え方）から始め、late まで単調に深まって止まり、二度と戻さない。
  // 「とどまる」設定で今の時刻に凍結できる。情景を変えると最初から進み直す。
  let driftStart = 0       // この情景の移ろい開始時刻（秒・renderer起動からの相対）
  let timeStay = false     // とどまる（時を止める）
  let stayK = 0.45         // とどまる時に固定する移ろい値
  let lastDriftK = 0.45    // 直近の移ろい値（とどまる切替時に凍結）
  function driftFactor(seconds) {
    if (timeStay) return stayK
    const period = (scene && scene.driftPeriod) || 360 // early→late に進む時間（既定6分・ゆるやか）
    const x = (seconds - driftStart) / period
    const s = x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3.0 - 2.0 * x) // 0→1 を一度だけ（戻らない）
    const k = 0.45 + 0.55 * s                          // 中庸→late へ単調に深まる（夕暮れの一回性）
    lastDriftK = k
    return k
  }
  function setTimeStay(on) {
    on = !!on
    if (on && !timeStay) stayK = lastDriftK // 今の時刻で凍結
    timeStay = on
  }
  if (/[?&]dev=1/.test(location.search)) window.__driftTo = (k) => { stayK = Math.max(0, Math.min(1, k)); timeStay = true } // 検証用: 移ろいを任意値で凍結

  function currentColors(seconds) {
    const pal = scene.palette
    const k = driftFactor(seconds)
    const lerp = (key) => mixRgb(hexToRgb(pal.early[key]), hexToRgb(pal.late[key]), k)
    return {
      skyTop: lerp('skyTop'),
      skyMid: lerp('skyMid'),
      horizon: lerp('horizon'),
      sunGlow: lerp('sunGlow'),
      dropTint: lerp('dropTint'),
    }
  }

  function render(now) {
    // 次フレームを先に予約し、約30fpsに間引く（アンビエントに60fpsは不要＝GPU負荷と発熱を約半減）
    rafId = requestAnimationFrame(render)
    // 通常は~33fps上限。長く無操作で「眺めている」時は約20fpsへ間引いて発熱/電池を抑える（解像度は維持＝鮮明さ優先・
    // シェーダ情景はゆっくりした動きなので20fpsでも体感は変わらない）。操作（見回し/窓/傾き/情景切替）で即33fpsへ復帰。
    const idleStill = (now - lastInputT) > 4000
    if (now - lastRenderTime < (idleStill ? 50 : 30)) return // 描画をスキップしてGPUを休ませる
    if (simMs > 0 || simOnce > 0) { const until = performance.now() + simMs + simOnce; simOnce = 0; while (performance.now() < until) { /* 検証用の重さ */ } }
    if (flashLevel > 0.001) lastInputT = now // 遠雷の発光中はフル描画を保ちたいので idle にしない
    lastRenderTime = now
    if (canvas.clientWidth < 1 || canvas.clientHeight < 1) return // 非表示中(town3d/splat表示中など)はサイズ0描画を避ける（FBO不完全エラー回避・評価 技術-重要1）
    // フレーム時間を測り、重い端末では描画解像度を自動調整（発熱を抑え滑らかさを保つ）。
    // idle間引き中(意図的に~50ms間隔)は性能信号でないので計測も自動調整もしない＝idleで誤って解像度を落とさない（鮮明さ優先）。
    if (lastFrame > 0 && !idleStill) {
      const dt = now - lastFrame
      if (dt > 0 && dt < 120) frameEMA = frameEMA * 0.9 + dt * 0.1 // 120ミリ秒以上の1回だけの詰まりは数えない（以前は 300 未満を数え、1回の詰まりで解像度が落ちたまま戻らなかった・S20）
    }
    lastFrame = now
    if (idleStill) {
      // 眺めている間は解像度の自動調整をしない（fpsだけ落とし、絵の鮮明さは保つ）
    } else if (adaptCooldown > 0) {
      adaptCooldown--
    } else if (frameEMA > 42 && renderScale > 0.5) {
      // 24fps未満が続けば解像度を落として発熱/カクつきを抑える。とても重い端末(cornerRoom等)は大きめに落とし
      // 滑らかさを優先（下限0.5）。余裕のある端末(frameEMA<42)はこの分岐に入らず常時フル解像度＝高品質は不変。
      renderScale = Math.max(0.5, renderScale - (frameEMA > 70 ? 0.15 : 0.1))
      adaptCooldown = 60
    } else if (frameEMA < TARGET_MS * 1.1 && renderScale < 1.0) { // 間引いた目標の間隔（約33ミリ秒）の1.1倍未満なら戻す（以前の 26 には間引きのせいで届かず、戻らなかった・S20）
      renderScale = Math.min(1.0, renderScale + 0.06) // 余裕があればゆっくり戻す
      adaptCooldown = 120
    }
    resize()
    const seconds = (now - startTime) / 1000
    // 見回しをなめらかに追従。残差を「動きの視差」として使う（首を振ると手前が動く）
    const gapX = panTarget.x - panCur.x
    const gapY = panTarget.y - panCur.y
    panCur.x += gapX * 0.12
    panCur.y += gapY * 0.12
    const clampP = (v) => Math.max(-0.14, Math.min(0.14, v)) // 覗き込み視差の天井（身を乗り出す手応え・3D感）
    // 情景プログラムを現用に戻し（前フレームの仕上げで FXAA が現用のため）、頂点を結び直す
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(sceneAttrib)
    gl.vertexAttribPointer(sceneAttrib, 2, gl.FLOAT, false, 0, 0)
    // アンチエイリアス時は一旦オフスクリーンへ描く
    if (aaEnabled) {
      ensureFBO(canvas.width, canvas.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    gl.uniform2f(loc.uResolution, canvas.width, canvas.height)
    gl.uniform1f(loc.uTime, seconds)
    // ごく弱い“息づかい”の揺れ。静止画ではなく、その場に居る気配を出す（窓辺シリーズで効く）。
    // モーション過敏配慮時は止める。
    const sm = reduceMotion ? 0 : 1
    const swayX = (Math.sin(seconds * 0.09) * 0.012 + Math.sin(seconds * 0.043 + 1.3) * 0.006) * sm
    const swayY = Math.sin(seconds * 0.06 + 0.7) * 0.006 * sm
    gl.uniform2f(loc.uPan, panCur.x + swayX, panCur.y + swayY)
    if (loc.uParallax) {
      gl.uniform2f(
        loc.uParallax,
        clampP(gapX * 0.09 + parallaxBias.x),
        clampP(gapY * 0.06 + parallaxBias.y),
      )
    }
    if (loc.uReduceMotion) gl.uniform1f(loc.uReduceMotion, reduceMotion ? 1 : 0)
    // 窓あけ／乗り出しを ease-in-out で開閉（town3dと同じ所要時間・出だしも止まり際もやわらか）
    const dtW = Math.min(0.05, Math.max(0, seconds - winPrevSec)); winPrevSec = seconds
    windowOpenP = approach(windowOpenP, windowOpenTarget, dtW / WIN_DUR.open)
    leanOutP = approach(leanOutP, leanOutTarget, dtW / WIN_DUR.lean)
    windowOpen = easeInOut(windowOpenP)
    leanOut = easeInOut(leanOutP)
    if (loc.uWindowOpen) gl.uniform1f(loc.uWindowOpen, windowOpen)
    if (loc.uLeanOut) gl.uniform1f(loc.uLeanOut, leanOut)
    // 乗り出すと可動域を広げて景色を180°見渡せる
    PAN_LIMIT.x = basePanX + leanOut * Math.max(0, 3.14 - basePanX)
    if (loc.uSeason) gl.uniform1f(loc.uSeason, seasonMode)
    if (loc.uLowRise) gl.uniform1f(loc.uLowRise, lowRiseMode)
    gl.uniform1f(loc.uGlass, glassMode)
    if (loc.uFoliage) gl.uniform1f(loc.uFoliage, foliageMode)
    if (loc.uFlash) gl.uniform1f(loc.uFlash, flashLevel)
    // フラッシュは素早く立ち、ゆっくり減衰（遠雷のほのかな閃光）
    if (flashLevel > 0.001) flashLevel *= 0.92
    else flashLevel = 0
    gl.uniform1f(loc.uIntensity, settings.rain)
    // パノラマ写真（あれば）をテクスチャユニット0、深度マップを1に
    if (loc.uPano) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, panoTex)
      gl.uniform1i(loc.uPano, 0)
      gl.uniform1f(loc.uHasPano, panoReady)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, panoDepthTex)
      gl.uniform1i(loc.uDepth, 1)
      gl.uniform1f(loc.uHasDepth, panoDepthReady)
    }
    // 窓の外の背景画像（あれば）をテクスチャユニット2に。屈折座標でサンプルするのはシェーダー側。
    if (loc.uBg) {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, bgTex)
      gl.uniform1i(loc.uBg, 2)
      gl.uniform1f(loc.uHasBg, bgReady)
      if (loc.uBgAspect) gl.uniform1f(loc.uBgAspect, bgAspect)
    }
    gl.uniform1f(loc.uBright, settings.brightness)
    if (scene) {
      const c = currentColors(seconds)
      gl.uniform3fv(loc.uSkyTop, c.skyTop)
      gl.uniform3fv(loc.uSkyMid, c.skyMid)
      gl.uniform3fv(loc.uHorizon, c.horizon)
      gl.uniform3fv(loc.uSunGlow, c.sunGlow)
      gl.uniform3fv(loc.uDropTint, c.dropTint)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    // 仕上げ: オフスクリーンを FXAA で画面へ（輪郭をなめらかに＝荒さ低減）
    if (aaEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(fxaaProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(fxaaAttrib)
      gl.vertexAttribPointer(fxaaAttrib, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, fboTex)
      gl.uniform1i(fxaaLoc.uTex, 0)
      gl.uniform2f(fxaaLoc.uResolution, canvas.width, canvas.height)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    // 次フレームは関数冒頭で予約済み（二重予約を避ける）
  }

  // 止めている理由（'engine'＝町の3D・スプラットを表示中／'sleep'＝おやすみの暗転が終わった）。
  // 画面の復帰（visibilitychange）や WebGL の復帰では、理由が1つも無い時だけ再開する（S34: おやすみの後に
  // ロック→解除すると、真っ暗な幕の裏で2Dが描き続けていた／町の3Dの最中に cancelSleep が2Dを再開させていた）。
  const holds = new Set()
  function play() {
    if (holds.size) return
    if (!rafId) rafId = requestAnimationFrame(render)
  }
  function pause() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }

  // バッテリー配慮: タブが隠れたら止める。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
    else play()
  })
  window.addEventListener('resize', resize)

  // ドライバ都合などでコンテキストが失われても、復帰したら作り直して描画を続ける。
  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault()
      pause()
    },
    false,
  )
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      setupBuffer()
      // 喪失でテクスチャ/FBOは無効化される。状態をリセットして作り直す。
      panoTex = null
      panoDepthTex = null
      panoReady = 0
      panoDepthReady = 0
      panoKey = null
      bgTex = null
      bgReady = 0
      bgKey = null
      fbo = null
      fboTex = null
      fboW = 0
      fboH = 0
      buildFxaa()
      if (buildProgram(quality, shaderType)) {
        if (scene) {
          loadPano(scene)
          loadBg(scene)
        }
        resize()
        play()
      }
    },
    false,
  )

  const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v))
  const glassOf = (s) => (s && s.glass === 'snow' ? 2 : s && s.glass === 'rain' ? 1 : 0)
  const foliageOf = (s) => (s && s.foliage === 'petals' ? 2 : s && s.foliage === 'leaves' ? 1 : 0)
  const seasonOf = (s) => {
    const id = (s && s.id) || ''
    return id.indexOf('spring') === 0 ? 0 : id.indexOf('autumn') === 0 ? 2 : id.indexOf('winter') === 0 ? 3 : 1
  }

  return {
    ok: true,
    // スプラット・町の3Dに切り替わる間や、おやすみの暗転の後に、シェーダー描画を一時停止／再開する。
    // reason ごとに止め、全部の理由が外れた時だけ再開する（画面の復帰で勝手に動き出さない）。
    pause(reason = 'engine') {
      holds.add(reason)
      pause()
    },
    resume(reason = 'engine') {
      holds.delete(reason)
      play()
    },
    isRunning() { return !!rafId }, // 検証用: 描画ループが回っているか
    scale() { return +renderScale.toFixed(3) }, // 検証用: 自動調整の倍率（S20）
    simStall(ms) { simOnce = ms || 0; markInput() }, // 検証用: 1回だけの詰まり
    simLoad(ms) { simMs = ms || 0; markInput() }, // 検証用: 毎回足す重さ
    poke() { markInput() }, // 検証用: 操作があったことにする（眺めているだけの間は自動調整を止める作りのため）
    bgInfo() { return { key: bgKey, texKey: bgTexKey, ready: bgReady, aspect: +bgAspect.toFixed(3) } }, // 検証用: 背景の鍵と、貼っている画の鍵
    // town3d/splat表示中は描画を止めるので、最大GPUメモリ(フルスクリーンFBOテクスチャ)を解放しメモリ圧を下げる
    // ＝iOSの「メモリ逼迫でWebGLコンテキストを失わせる」誘発を抑える（評価エンジニア: マルチコンテキスト枯渇の緩和）。
    // 通常情景へ戻ると描画ループの ensureFBO が同期で自動再作成するので安全。
    freeFBO() {
      try { if (fboTex) gl.deleteTexture(fboTex); if (fbo) gl.deleteFramebuffer(fbo) } catch { /* 無視 */ }
      fbo = null; fboTex = null; fboW = 0; fboH = 0
    },
    // 指スワイプなどから見回しの目標値を動かす（相対）
    addPan(dx, dy) {
      markInput()
      panTarget.x = clamp(panTarget.x + dx, PAN_LIMIT.x)
      panTarget.y = clamp(panTarget.y + dy, PAN_LIMIT.y)
    },
    getPan() { return { x: panTarget.x, y: panTarget.y } }, // 見回し目標の読み出し（検証/連携用）
    // 端末の傾きなどから見回しの目標値を直接決める（絶対）
    setPanTarget(x, y) {
      markInput()
      panTarget.x = clamp(x, PAN_LIMIT.x)
      panTarget.y = clamp(y, PAN_LIMIT.y)
    },
    // 端末の傾き（nx,ny は -1..1）。パノラマでは視差（覗き込み）、それ以外は見回しに使う。
    applyTilt(nx, ny) {
      markInput()
      nx = Math.max(-1, Math.min(1, nx))
      ny = Math.max(-1, Math.min(1, ny))
      if (shaderType === 'windowPano') {
        parallaxBias.x = nx * 0.05
        parallaxBias.y = ny * 0.035
      } else {
        panTarget.x = clamp(nx * PAN_LIMIT.x, PAN_LIMIT.x)
        panTarget.y = clamp(ny * PAN_LIMIT.y, PAN_LIMIT.y)
      }
    },
    clearTilt() {
      parallaxBias.x = 0
      parallaxBias.y = 0
      panTarget.x = 0
      panTarget.y = 0
    },
    // 遠雷など。空をほのかに光らせる（雷鳴の少し前に呼ぶと自然）
    triggerFlash(strength) {
      flashLevel = Math.max(flashLevel, strength != null ? strength : 0.8)
    },
    // モーション過敏への配慮（OS設定 prefers-reduced-motion 等から）
    setReduceMotion(b) {
      reduceMotion = !!b
    },
    setWindowOpen(b) {
      markInput()
      windowOpenTarget = b ? 1 : 0
      if (!b) leanOutTarget = 0 // 閉じると乗り出しも戻す
    },
    isWindowOpen() {
      return windowOpenTarget > 0.5
    },
    setLeanOut(b) {
      markInput()
      leanOutTarget = b ? 1 : 0
      if (b) windowOpenTarget = 1 // 乗り出すには開いている前提
    },
    isLeanOut() {
      return leanOutTarget > 0.5
    },
    setScene(s) {
      markInput() // 情景を切替えた直後はフルfpsで（導入の暗転明けを滑らかに）。無操作が続けば再びidleへ
      scene = s
      driftStart = (performance.now() - startTime) / 1000 // 情景ごとに時の移ろいを最初から進め直す
      if (timeStay) stayK = 0.45                           // 「とどまる」中の新情景はその情景の基準時刻で静止
      glassMode = glassOf(s)
      foliageMode = foliageOf(s)
      seasonMode = seasonOf(s)
      lowRiseMode = s && s.lowRise ? 1 : 0
      // 見回しの可動域（情景ごと）。屋上などは広げてほぼ360°見渡せる。
      basePanX = (s && s.panX) || 2.6
      loadPano(s)
      loadBg(s)
      // 情景を変えたら見回しを正面へ戻す
      panTarget.x = 0
      panTarget.y = 0
      // 現象（描画タイプ）が変わったらシェーダーを組み直す
      const type = s.render || 'rainGlass'
      if (type !== shaderType) buildProgram(quality, type)
    },
    setSettings(s) {
      // 品質が変わったらシェーダーを組み直す
      if (s.quality !== quality) buildProgram(s.quality, shaderType)
      settings = s
      setTimeStay(s.timeStay) // 「時間をとどめる」設定を反映（onに切替えた瞬間の時刻で凍結）
      resize()
    },
    start(initialScene, initialSettings) {
      scene = initialScene
      settings = initialSettings
      driftStart = (performance.now() - startTime) / 1000
      setTimeStay(initialSettings && initialSettings.timeStay)
      glassMode = glassOf(initialScene)
      foliageMode = foliageOf(initialScene)
      seasonMode = seasonOf(initialScene)
      lowRiseMode = initialScene && initialScene.lowRise ? 1 : 0
      basePanX = (initialScene && initialScene.panX) || 2.6
      loadPano(initialScene)
      loadBg(initialScene)
      if (!buildProgram(initialSettings.quality, initialScene.render || 'rainGlass')) return false
      resize()
      play()
      return true
    },
  }
}
