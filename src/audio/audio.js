// 環境音のレイヤー再生。映像の作り込みに音を追いつかせるため、次を備える:
//  - 継ぎ目レスな無限ループ（同素材を末尾と先頭で重ねてクロスフェード）
//  - 情景切替のクロスフェード（master を一旦沈めて差し替え。映像の暗転と尺を合わせる）
//  - 起動時のフェードイン（静寂からそっと滲み出る）
//  - 薄いステレオ定位（レイヤーを左右へ散らし、頭の中で鳴る閉塞感を避ける）
//  - 遠雷の揺らぎ（鳴るたび音量・低域・再生速度をランダム化＝毎回違う距離の雷）
// 素材はCC0等ライセンス明確なフリー素材のみ。出典は CREDITS.md に全数記録。
// 連打切替に備え世代トークン（gen）で古い情景の読み込み・タイマー連鎖を無効化する。

export function createAudio(opts) {
  const onCue = (opts && opts.onCue) || null // 音の発火を画面に伝える（遠雷フラッシュ等）
  let ctx = null
  let master = null // 外の音のバス（→窓の防音→fadeGain）。全ての外音はここへ繋ぐ
  let fadeGain = null // 全体フェード/音量（起動/おやすみ/復帰/音量設定）。外も室内も最後にここを通る＝防音の外で効かせる
  let indoorBus = null // 室内の音（窓辺の猫）＝窓の防音を受けない。部屋の中で鳴くものはここへ繋ぐ
  let openFilter = null // 窓のあけ具合で外音を澄ませる/こもらせるローパス（閉=ガラス越し／開=外気が澄む）
  let muffleGain = null // 窓を閉じると外音の音量も下げる防音ゲイン（ローパスだけでは虫の高域が抜けて静かにならないため）
  let duskShelf = null // 日の傾き(setDayPhase)で外音の高域をそっと落とす＝夕方の空気がやわらぐ。室内の猫は通さない
  let windowOpenAmt = 0
  let layers = [] // ループ中のレイヤー {layerGain, stopped, panner, basePan}
  let layer_lfos = [] // swellレイヤーの満ち引きLFO（情景切替で停止する）
  let lookPan = 0 // 見回しに連動する音場の左右オフセット（右を向くと音は左へ＝視覚と一致）
  let timers = [] // ループ継ぎ足し・ランダム再生のタイマー
  let currentScene = null
  let muted = false
  let volume = 0.8
  let started = false
  let gen = 0

  const base = import.meta.env.BASE_URL || '/'
  const urlOf = (src) => base + src
  const now = () => ctx.currentTime
  const targetVol = () => (muted ? 0.0001 : Math.max(0.0001, volume))

  // iPhone/iPad は既定で Web Audio を着信音チャンネル（消音スイッチで黙る）に流す。
  // 無音の <audio> をループ再生してページの音声セッションを「再生(playback)」に保つと、
  // Web Audio がメディア音量（音量ボタン）側に乗り、マナーモードでも音量に応じて鳴る。
  const isIOS =
    /iP(hone|od|ad)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  let silentTag = null
  let silentUrl = null
  // 0.5秒の8bitモノラル無音WAVを生成（巨大なbase64を埋め込まず軽量に）。
  function makeSilentWavUrl() {
    const sr = 8000
    const n = Math.floor(sr * 0.5)
    const buf = new ArrayBuffer(44 + n)
    const v = new DataView(buf)
    const wr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
    wr(0, 'RIFF'); v.setUint32(4, 36 + n, true); wr(8, 'WAVE')
    wr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true) // PCM
    v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr, true)
    v.setUint16(32, 1, true); v.setUint16(34, 8, true)
    wr(36, 'data'); v.setUint32(40, n, true)
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128) // 8bit無音=128
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
  }
  // ユーザー操作の中で呼ぶ（消音スイッチ回避の鍵＝ジェスチャ起点での再生）。
  function unlockMediaSession() {
    if (!isIOS) return
    try {
      if (!silentTag) {
        silentUrl = makeSilentWavUrl()
        silentTag = document.createElement('audio')
        silentTag.src = silentUrl
        silentTag.loop = true
        silentTag.setAttribute('playsinline', '')
        silentTag.setAttribute('webkit-playsinline', '')
        silentTag.muted = false
        silentTag.volume = 1 // 中身が無音なので可聴にはならないが「再生中」と認識させる
        // 割り込み等で止められたら自動で再生し直す（消音スイッチ回避を維持）
        const resume = () => { if (started) { const q = silentTag.play(); if (q && q.catch) q.catch(() => {}) } }
        silentTag.addEventListener('pause', resume)
        silentTag.addEventListener('ended', resume)
      }
      const p = silentTag.play()
      if (p && p.catch) p.catch(() => {})
    } catch {
      /* 無視 */
    }
  }
  // 復帰時（タブ切替・割り込み後）に音脈と無音タグを起こし直す。
  let rearmBound = false
  function bindRearm() {
    if (rearmBound) return
    rearmBound = true
    const rearm = () => {
      // 'suspended' だけでなく iOS の 'interrupted'（電話/アラーム後）も起こし直す
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
      if (started) unlockMediaSession()
    }
    // バックグラウンド（ホーム画面/他アプリ切替/タブ非表示）では音を止める。復帰したら鳴り直す。
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}) } else rearm()
    })
    window.addEventListener('pagehide', () => { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}) })
    window.addEventListener('focus', rearm)
    document.addEventListener('touchend', rearm, { passive: true })
  }

  function ensureContext() {
    if (ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 1 // 外音バスは素通し（全体フェード/音量は最終段のfadeGainが持つ）
    fadeGain = ctx.createGain()
    fadeGain.gain.value = 0.0001 // 無音から始めてフェードイン（最終段＝全体の音量/フェード。防音の外で効く）
    indoorBus = ctx.createGain() // 室内の音（猫）＝防音を通さず最終段へ直結
    // 外の音: master→openFilter→muffleGain→fadeGain（窓を閉じるとガラス越しにこもり音量も落ちる防音）。
    // 室内の音: indoorBus→fadeGain（部屋の中で鳴く猫は窓の開閉に左右されず常に近く澄んで聞こえる）。
    if (ctx.createBiquadFilter) {
      duskShelf = ctx.createBiquadFilter()
      duskShelf.type = 'highshelf'; duskShelf.frequency.value = 2600; duskShelf.gain.value = 0 // 既定0=昼。日が傾くと負へ＝高域がやわらぐ
      openFilter = ctx.createBiquadFilter()
      openFilter.type = 'lowpass'
      openFilter.frequency.value = windowOpenAmt > 0.5 ? 20000 : 900 // 閉=ガラス越しに大きくこもる(虫の高域も抑える)／開=澄む
      openFilter.Q.value = 0.5
      muffleGain = ctx.createGain()
      muffleGain.gain.value = windowOpenAmt > 0.5 ? 1 : 0.4 // 閉=しっかり防音で小さく／開=外気の音が戻る
      master.connect(duskShelf).connect(openFilter).connect(muffleGain).connect(fadeGain)
    } else {
      master.connect(fadeGain)
    }
    indoorBus.connect(fadeGain)
    fadeGain.connect(ctx.destination)
    // 割り込みで running から外れたら、復帰操作時に起こし直せるよう監視
    ctx.onstatechange = () => {
      // バックグラウンド中は起こし直さない（音を止めたまま）。前面に戻ったら rearm が再開する。
      if (started && !document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
    }
    bindRearm()
  }

  const bufferCache = new Map() // src→デコード済みAudioBuffer。情景往復で同じ素材の decodeAudioData を再実行する無駄(モバイルのメインスレッドjank)を防ぐ（評価エンジニア）
  async function loadBuffer(src) {
    if (bufferCache.has(src)) return bufferCache.get(src)
    try {
      const res = await fetch(urlOf(src))
      if (!res.ok) return null
      const arr = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(arr)
      if (buf) bufferCache.set(src, buf)
      return buf
    } catch {
      return null // 素材未配置・デコード不可は無音扱い
    }
  }

  // 継ぎ目レスな無限ループ: 同じ素材を末尾と先頭で xf 秒だけ重ね、クロスフェードして繋ぐ。
  // swell=true のレイヤーは、ごくゆっくり音量が膨らみ・退き・時に静まる（虫の鳴き交わしの「間」＝
  // ずっと同じ壁の違和感を消し、静かになる瞬間をつくる）。layerGainは音場/高度しぼり用に残し、別段の swellGain で揺らす。
  // 日の傾き(dp 0..1)で虫の声をクロスフェード: 'out'=昼に満ち夕に退く(油蝉) / 'in'=夕に立ち上がる(ヒグラシ・鈴虫)。
  // 情景ごとに sounds[].dayFade でオプトイン（無指定は常時＝従来通り）。各情景は固定の瞬間なので、昼→夕にドリフトする
  // 立体の街でだけ実際に動く（夜シーン/2D窓は dp=0 のまま＝従来の音）。
  const smooth01 = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x) }
  function dayFadeMul(dayFade, dp) {
    if (dayFade === 'out') return 1 - 0.95 * smooth01((dp - 0.18) / 0.44) // 昼に満ち、夕(dp~0.62)でほぼ退く
    if (dayFade === 'in') return 0.06 + 0.94 * smooth01((dp - 0.30) / 0.62) // 夕へ向けて立ち上がる
    return 1
  }
  // レイヤー音量を baseGain × 高度しぼり × 日の傾き で合成して反映（altitude と dayPhase が同じ layerGain を取り合わないよう一本化）。
  function applyLayerGain(layer, ramp = 0.5) {
    if (!layer || layer.stopped || !ctx) return
    const tgt = Math.max(0.0001, (layer.baseGain || 0.4) * (1 - altDuckV * 0.985) * dayFadeMul(layer.dayFade, dayPhaseV))
    try { layer.layerGain.gain.setTargetAtTime(tgt, now(), ramp) } catch { /* 無視 */ }
  }
  function startLoop(buffer, gainVal, pan, myGen, swell, dayFade) {
    const dur = buffer.duration
    const xf = Math.min(0.8, dur * 0.25)
    const layerGain = ctx.createGain()
    layerGain.gain.setValueAtTime(0.0001, now())
    const initMul = (1 - altDuckV * 0.985) * dayFadeMul(dayFade, dayPhaseV) // 立ち上げ時点の高度・日の傾きを反映（夕に始めればヒグラシ寄りで入る）
    layerGain.gain.linearRampToValueAtTime(Math.max(0.0001, gainVal * initMul), now() + 1.4) // レイヤーのフェードイン
    // swell の揺らぎ段（layerGain → swellGain → panner/master）。素のレイヤーは layerGain を直結。
    let tail = layerGain
    if (swell && ctx.createOscillator) {
      const swellGain = ctx.createGain(); swellGain.gain.value = 0.6 // 平均を下げ、満ち引きの余地をつくる
      layerGain.connect(swellGain); tail = swellGain
      try {
        // 互いに割り切れない2つの遅いLFOを重ねて準ランダムな満ち引きに（機械的な周期に聞こえない）。
        const l1 = ctx.createOscillator(); l1.frequency.value = 0.035; const g1 = ctx.createGain(); g1.gain.value = 0.24; l1.connect(g1).connect(swellGain.gain); l1.start()
        const l2 = ctx.createOscillator(); l2.frequency.value = 0.052; const g2 = ctx.createGain(); g2.gain.value = 0.16; l2.connect(g2).connect(swellGain.gain); l2.start() // 合わせて約0.2〜1.0倍に満ち引き＝時に静まる
        layer_lfos.push(l1, l2)
      } catch { /* LFO非対応なら素の音量で鳴る */ }
    }
    let panner = null
    if (ctx.createStereoPanner) {
      panner = ctx.createStereoPanner()
      panner.pan.value = Math.max(-1, Math.min(1, pan + lookPan)) // 生成時点の見回しを反映
      tail.connect(panner).connect(master)
    } else {
      tail.connect(master)
    }
    const layer = { layerGain, stopped: false, panner, basePan: pan, baseGain: gainVal, dayFade: dayFade || null }
    layers.push(layer)

    let nextStart = now() + 0.05
    function schedule() {
      if (layer.stopped || myGen !== gen || !ctx) return
      const src = ctx.createBufferSource()
      src.buffer = buffer
      const g = ctx.createGain()
      // タブ非アクティブで setTimeout が間引かれ schedule が遅れても、過去時刻に入れない
      // （過去開始のプツッ/欠落を防ぐ）。少し先へ寄せて自己修復させる。
      const s = Math.max(nextStart, now() + 0.06)
      // 先頭で立ち上げ、末尾で落とす（重なり区間でクロスフェード）
      g.gain.setValueAtTime(0.0001, s)
      g.gain.linearRampToValueAtTime(1, s + xf)
      g.gain.setValueAtTime(1, s + dur - xf)
      g.gain.linearRampToValueAtTime(0.0001, s + dur)
      src.connect(g).connect(layerGain)
      try {
        src.start(s)
        src.stop(s + dur + 0.1)
      } catch {
        /* 競合時は無視 */
      }
      nextStart = s + dur - xf // 次は重なり分だけ早く始める
      const delay = Math.max(60, (nextStart - now() - 1.6) * 1000) // 余裕を持って先に予約（間引き耐性）
      const id = setTimeout(schedule, delay)
      timers.push(id)
    }
    schedule()
  }

  // 単発再生。遠雷(cue)は音量・低域・速度を大きく揺らし「毎回違う距離の雷」に。
  // 鳥のさえずり等(cueなし)は、低域フィルタを掛けず自然な高域を残し、ピッチもごく僅かだけ揺らす。
  function playCue(buffer, def) {
    const src = ctx.createBufferSource()
    src.buffer = buffer
    // 鳴くたびのピッチ揺れ。単発素材(うぐいす等)が同じ波形の反復に聞こえないよう ±3%→±7% へ広げる（評価サウンド）。
    src.playbackRate.value = def.cue ? 0.9 + Math.random() * 0.25 : 0.93 + Math.random() * 0.14
    const g = ctx.createGain()
    const baseGain = def.gain != null ? def.gain : 0.5
    g.gain.value = baseGain * (def.cue ? 0.55 + Math.random() * 0.55 : 0.7 + Math.random() * 0.5)
    let node = src.connect(g)
    if (ctx.createBiquadFilter) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      // 遠雷=600-2800Hzで距離感／うぐいす等の単発=4.5-11kHzで「近い藪/遠い藪」＝鳴くたびに高域が少し削れ反復臭が薄れる。
      lp.frequency.value = def.cue ? 600 + Math.random() * 2200 : 5800 + Math.random() * 6500
      node = node.connect(lp)
    }
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner()
      p.pan.value = (Math.random() - 0.5) * 1.2
      node.connect(p).connect(master)
    } else {
      node.connect(master)
    }
    try {
      src.start()
    } catch {
      /* 無視 */
    }
  }

  // loop:false + interval:[min,max] の音を、ランダム間隔で繰り返し鳴らす。
  function scheduleInterval(def, buffer, myGen) {
    const [min, max] = def.interval
    const next = () => {
      if (myGen !== gen) return
      const delay = (min + Math.random() * (max - min)) * 1000
      const id = setTimeout(() => {
        if (myGen !== gen) return
        // 高空（雲海の上）では単発音（遠雷・鳥）を鳴らさない＝雲を抜けたら下界の音は届かない開放感。altDuckVは高度で1へ（setAltitudeDuck）。
        if (started && ctx && altDuckV < 0.82) {
          // 稲光は音より先に届く: フラッシュを少し先行させてから雷鳴を鳴らす
          if (onCue && def.cue) onCue(def)
          const lead = onCue && def.cue ? 220 : 0
          setTimeout(() => {
            if (myGen === gen && started && ctx && altDuckV < 0.82) playCue(buffer, def)
          }, lead)
        }
        next()
      }, delay)
      timers.push(id)
    }
    next()
  }

  // ループ中の全レイヤーをフェードして畳む（情景切替時）。
  function stopAllNodes() {
    if (ctx) {
      const t = now()
      layers.forEach((l) => {
        l.stopped = true
        try {
          l.layerGain.gain.cancelScheduledValues(t)
          l.layerGain.gain.setValueAtTime(l.layerGain.gain.value, t)
          l.layerGain.gain.linearRampToValueAtTime(0.0001, t + 0.3)
          setTimeout(() => {
            try {
              l.layerGain.disconnect()
            } catch {
              /* 無視 */
            }
          }, 600)
        } catch {
          /* 無視 */
        }
      })
    }
    layers = []
    layer_lfos.forEach((o) => { try { o.stop() } catch { /* 無視 */ } })
    layer_lfos = []
    timers.forEach((id) => clearTimeout(id))
    timers = []
  }

  async function playScene(scene, crossfade) {
    currentScene = scene
    if (!started || !ctx) return
    // 情景切替: master を一旦沈めてから差し替え（映像の暗転と尺を合わせる）
    if (crossfade) {
      fadeGain.gain.cancelScheduledValues(now())
      fadeGain.gain.setValueAtTime(Math.max(0.0001, fadeGain.gain.value), now())
      fadeGain.gain.linearRampToValueAtTime(0.0001, now() + 0.25)
      await new Promise((r) => setTimeout(r, 260))
      if (!ctx) return
    }
    gen++
    const myGen = gen
    stopAllNodes()
    dayPhaseV = 0 // 新しい情景は「その瞬間」から始まる＝前の情景の夕暮れを持ち越さない（直後に onDayPhase で実態へ追従）

    const loops = (scene.sounds || []).filter((d) => d.loop !== false)
    let li = 0
    for (const def of scene.sounds || []) {
      const buffer = await loadBuffer(def.src)
      if (myGen !== gen) return // 読み込み中に別情景へ切替わった→破棄
      if (!buffer) continue
      if (def.loop !== false) {
        // 薄いステレオ定位（複数レイヤーを左右へ散らす）。pan指定があれば優先。
        const pan =
          def.pan != null
            ? def.pan
            : loops.length > 1
              ? (li / Math.max(1, loops.length - 1) - 0.5) * 0.5
              : 0
        li++
        const lgain = def.gain != null ? def.gain : 1
        // 鈴虫(16kHz素材)は高域が8kHzで切れ、48kHzの虫(crickets)と並ぶと高域落差が目立つ→控えめにし虫を主役へ（評価サウンド）。
        startLoop(buffer, /suzumushi/.test(def.src || '') ? lgain * 0.72 : lgain, pan, myGen, !!def.swell, def.dayFade)
      } else if (def.interval) {
        scheduleInterval(def, buffer, myGen)
      } else {
        playCue(buffer, def)
      }
    }
    // master を戻す（起動は長く、切替は短くフェードイン）
    fadeGain.gain.cancelScheduledValues(now())
    fadeGain.gain.setValueAtTime(Math.max(0.0001, fadeGain.gain.value), now())
    fadeGain.gain.linearRampToValueAtTime(targetVol(), now() + (crossfade ? 0.8 : 2.5))
  }

  // ── 生成的な風レイヤー（常時・素材ゼロ）。ピンクノイズ近似をゆっくり揺れるバンドパスに通し、
  // ループ素材の上にうっすら重ねて「同じ所が繰り返る」ループ感を消す（CC0原則と完全整合）。
  // master 経由なので音量/ミュート/おやすみに自動追従。値は控えめ（うっすら空気が動く程度）。
  let windNode = null
  let purrNode = null // 窓辺の猫のゴロゴロ（撫でている間だけ）
  let purrV = 0
  let flyWindV = 0 // 飛行速度に応じた風の強さ（setFlyWind）。細かな変化を無視する基準
  let altDuckV = 0 // 高度に応じた環境音のしぼり（setAltitudeDuck）。細かな変化を無視する基準
  let dayPhaseV = 0 // 日の傾き(0=情景の始まり..1=夕へ移ろい)。虫の声の交代(油蝉↔ヒグラシ)を layerGain に合成する
  function startWind() {
    if (!ctx || windNode || !ctx.createBiquadFilter) return
    const len = Math.floor(6 * ctx.sampleRate) // 2秒→6秒: ループ周期を伸ばし、静かな場面で「白ノイズの2秒周期」が知覚されるのを防ぐ（評価サウンド）
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0 // 明るめのノイズ（低音の「ぶぶぶ」を出さず、空気を切る「サー/ひゅー」寄りに）
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99 * b0 + w * 0.05; b1 = 0.96 * b1 + w * 0.08; b2 = 0.90 * b2 + w * 0.09; d[i] = (b0 * 0.3 + b1 * 0.9 + b2 * 1.25 + w * 0.16) * 0.4 }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 560; hp.Q.value = 0.5 // 低音の唸り(ぶー)を完全に断つ
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.5 // 高くて広い帯＝空気を切る「ひゅーー」の芯（速度で更に上へ。低い唸りにならない）
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0, now()) // 静止/地上は完全無音（録画のAGCで増幅されるノイズ漏れを断つ）。setFlyWindが飛行速度で膨らませる
    src.connect(hp).connect(bp).connect(g).connect(master)
    windNode = { src, g, bp, hp } // g/bp は飛行速度で風を膨らませる（setFlyWind）ために保持
    try {
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06
      const lfoG = ctx.createGain(); lfoG.gain.value = 120; lfo.connect(lfoG).connect(bp.frequency); lfo.start() // ゆるい息づき（突風・高い帯を僅かに上下＝ワウにしない）
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.083
      const lfo2G = ctx.createGain(); lfo2G.gain.value = 0.0005; lfo2.connect(lfo2G).connect(g.gain); lfo2.start() // 息づきはごく僅か（静止時に鳴らない）
    } catch { /* LFO非対応でも常時うっすらの風は鳴る */ }
    try { src.start() } catch { /* 無視 */ }
  }
  // 猫のゴロゴロ＝低めの暖色トーン＋約25Hzの震え（喉鳴り）。撫でている間だけそっと（機械音の唸りでなく猫の喉に）。
  function startPurr() {
    if (!ctx || purrNode || !ctx.createOscillator) return
    const a = ctx.createOscillator(); a.type = 'triangle'; a.frequency.value = 100
    const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.value = 150
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.4
    const pt = ctx.createGain(); pt.gain.value = 0.55                 // トレモロの土台
    const pg = ctx.createGain(); pg.gain.value = 0.0001              // 全体音量（setPurrで上下）
    a.connect(lp); b.connect(lp); lp.connect(pt).connect(pg).connect(indoorBus) // 猫は室内＝窓の防音を受けない
    try { const trem = ctx.createOscillator(); trem.type = 'sine'; trem.frequency.value = 25; const td = ctx.createGain(); td.gain.value = 0.45; trem.connect(td).connect(pt.gain); trem.start() } catch { /* 震え無しでも鳴る */ }
    try { a.start(); b.start() } catch { /* 無視 */ }
    purrNode = { pg }
  }

  // ── 場所に応じた水の音（波／川のせせらぎ）。合成（フィルタしたノイズ）＝CC0/オフライン原則と整合。
  //  海の近く・低空で「波」が、川/運河の近くで「せせらぎ」が満ちる。setAmbience(海,川) が近さで音量を上下する。
  //  未使用時は完全に 0（録音のAGCで増幅されるノイズ漏れを断つ＝以前の機械音の教訓）。低音の唸りはハイパスで断つ。
  let waterNode = null
  const waterState = { sea: 0, river: 0, crowd: 0 }
  function startWater() {
    if (!ctx || waterNode || !ctx.createBiquadFilter) return
    const len = Math.floor(6 * ctx.sampleRate) // 2秒→6秒: ループ周期を伸ばし、静かな場面で「白ノイズの2秒周期」が知覚されるのを防ぐ（評価サウンド）
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.97 * b0 + w * 0.07; b1 = 0.90 * b1 + w * 0.10; d[i] = (b0 * 0.85 + b1 * 0.7 + w * 0.2) * 0.4 }
    // 波：低めのローパス＋低音の唸りを断つハイパス。ゆっくり寄せては返すスウェル（2つのLFOで不規則に）。
    const wsrc = ctx.createBufferSource(); wsrc.buffer = buf; wsrc.loop = true
    const whp = ctx.createBiquadFilter(); whp.type = 'highpass'; whp.frequency.value = 200; whp.Q.value = 0.5
    const wlp = ctx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 640; wlp.Q.value = 0.4
    const wg = ctx.createGain(); wg.gain.value = 0.0
    wsrc.connect(whp).connect(wlp).connect(wg).connect(master)
    // せせらぎ：明るいバンドパス＋ハイパス。さらさらと一定（ごく僅かな揺らぎ）。
    const rsrc = ctx.createBufferSource(); rsrc.buffer = buf; rsrc.loop = true
    const rhp = ctx.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 900; rhp.Q.value = 0.5
    const rbp = ctx.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 2300; rbp.Q.value = 0.7
    const rg = ctx.createGain(); rg.gain.value = 0.0
    rsrc.connect(rhp).connect(rbp).connect(rg).connect(master)
    // 人混みのざわめき：人声の中域(低音の歪み無し)。スローLFOで“ざわざわ”と満ち引き。
    const csrc = ctx.createBufferSource(); csrc.buffer = buf; csrc.loop = true
    const chp = ctx.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 360; chp.Q.value = 0.5
    const cbp = ctx.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 650; cbp.Q.value = 0.8 // 人声の第1フォルマント（スローLFOで母音を揺らす）
    const cbp2 = ctx.createBiquadFilter(); cbp2.type = 'bandpass'; cbp2.frequency.value = 1150; cbp2.Q.value = 0.9 // 第2フォルマント＝二つの母音帯で「人声のざわめき」に近づける（単一帯の定常ノイズを脱す）
    const cbp2g = ctx.createGain(); cbp2g.gain.value = 0.55
    const clp = ctx.createBiquadFilter(); clp.type = 'lowpass'; clp.frequency.value = 1900
    const cSyl = ctx.createGain(); cSyl.gain.value = 0.85 // 音節リズムの土台（速いLFOで±＝話し声の粒立ち）。乗算なので無音時は漏れない
    const cg = ctx.createGain(); cg.gain.value = 0.0
    csrc.connect(chp); chp.connect(cbp).connect(clp); chp.connect(cbp2).connect(cbp2g).connect(clp); clp.connect(cSyl).connect(cg).connect(master)
    waterNode = { wg, rg, cg, wAmp: null, rAmp: null, cAmp: null }
    try { // 波のスウェル（寄せて返す）。LFOの振幅(wAmp)は setAmbience が海の近さで持たせる＝海に近いほど大きく寄せる。
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11      // 約9秒周期の大きなうねり
      const wAmp = ctx.createGain(); wAmp.gain.value = 0; lfo.connect(wAmp).connect(wg.gain); lfo.start()
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.063   // 不規則さを足す second swell
      const wAmp2 = ctx.createGain(); wAmp2.gain.value = 0; lfo2.connect(wAmp2).connect(wg.gain); lfo2.start()
      const rlfo = ctx.createOscillator(); rlfo.frequency.value = 0.21    // せせらぎのごく僅かな揺らぎ
      const rAmp = ctx.createGain(); rAmp.gain.value = 0; rlfo.connect(rAmp).connect(rg.gain); rlfo.start()
      const clfo = ctx.createOscillator(); clfo.frequency.value = 0.27    // ざわめきの満ち引き
      const cAmp = ctx.createGain(); cAmp.gain.value = 0; clfo.connect(cAmp).connect(cg.gain); clfo.start()
      const clfo2 = ctx.createOscillator(); clfo2.frequency.value = 0.16
      const cAmp2 = ctx.createGain(); cAmp2.gain.value = 0; clfo2.connect(cAmp2).connect(cg.gain); clfo2.start()
      const cfMod = ctx.createOscillator(); cfMod.frequency.value = 0.13; const cfg = ctx.createGain(); cfg.gain.value = 170; cfMod.connect(cfg).connect(cbp.frequency); cfMod.start() // 母音帯をゆっくり上下に揺らし「ざわざわ」と表情を変える（定常ノイズ脱却）
      // 音節リズム＝4〜7Hzの非整数比2つを重ね、規則的すぎない「話し声の粒立ち」を cSyl(乗算)へ。定常ノイズ→人混みへ寄せる（評価サウンド）。
      const sy1 = ctx.createOscillator(); sy1.type = 'triangle'; sy1.frequency.value = 4.3; const syg1 = ctx.createGain(); syg1.gain.value = 0.09; sy1.connect(syg1).connect(cSyl.gain); sy1.start()
      const sy2 = ctx.createOscillator(); sy2.type = 'sine'; sy2.frequency.value = 6.7; const syg2 = ctx.createGain(); syg2.gain.value = 0.06; sy2.connect(syg2).connect(cSyl.gain); sy2.start()
      waterNode.wAmp = wAmp; waterNode.wAmp2 = wAmp2; waterNode.rAmp = rAmp; waterNode.cAmp = cAmp; waterNode.cAmp2 = cAmp2
    } catch { /* LFO非対応でもベース音量で鳴る */ }
    try { wsrc.start(); rsrc.start(); csrc.start() } catch { /* 無視 */ }
  }
  //  夏祭りの囃子（遠くから届く太鼓の律動＋締太鼓＋鉦＋人のざわめき）。setFestival(近さ0..1)が音量を満ち引きさせ、
  //  遠くは brightLP で高域がこもり（太鼓の胴だけが届く）→近づくと締太鼓・鉦の刻みが立つ＝「近づくほど賑わいが満ちる」。
  //  合成の笛の旋律は「作り物のBGM」に聞こえるため撤去（実機FB）。祭りらしさは“本物の太鼓の律動”で出す。太鼓は低音をスマホで歪ませないため中域中心。
  let festNode = null
  const festState = { amt: 0 }
  function startFestival() {
    if (!ctx || festNode || !ctx.createBufferSource) return
    const fg = ctx.createGain(); fg.gain.value = 0                    // 祭り全体の音量（近さで満ち引き＝離れたら無音）
    const fPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null // 空間音: 会場の方角へ定位＝飛びながら横を抜けると囃子が左右へ流れる（評価サウンド: 音源の定位）
    if (fPan) fg.connect(fPan).connect(master); else fg.connect(master)
    const bright = ctx.createBiquadFilter(); bright.type = 'lowpass'; bright.frequency.value = 650; bright.Q.value = 0.5; bright.connect(fg) // 笛/鉦の明るさ（遠=こもる→近=澄む）
    // ざわめき（祭りの人声・常時）
    const len = Math.floor(6 * ctx.sampleRate), buf = ctx.createBuffer(1, len, ctx.sampleRate), dd = buf.getChannelData(0) // 2秒→6秒で周期感を消す（評価サウンド）
    let mb = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; mb = 0.9 * mb + w * 0.1; dd[i] = (mb * 0.8 + w * 0.2) * 0.4 }
    const msrc = ctx.createBufferSource(); msrc.buffer = buf; msrc.loop = true
    const mhp = ctx.createBiquadFilter(); mhp.type = 'highpass'; mhp.frequency.value = 380
    const mbp = ctx.createBiquadFilter(); mbp.type = 'bandpass'; mbp.frequency.value = 700; mbp.Q.value = 0.7
    const mg = ctx.createGain(); mg.gain.value = 0.42; msrc.connect(mhp).connect(mbp).connect(mg).connect(fg)
    try { msrc.start() } catch { /* 無視 */ }
    festNode = { fg, bright, pan: fPan, nextNote: ctx.currentTime + 0.12, step: 0, sched: null }
    // 太鼓の一打（中域の胴＋皮の当たり。低音はスマホで歪むので中域中心。vel=強弱でヒューマナイズ）
    const taiko = (tt, hi, vel = 1) => {
      const o = ctx.createOscillator(); o.type = 'sine'; const g = ctx.createGain(); const f0 = hi ? 300 : 176
      o.frequency.setValueAtTime(f0 * 1.8, tt); o.frequency.exponentialRampToValueAtTime(f0, tt + 0.07)
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime((hi ? 0.42 : 0.6) * vel, tt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, tt + (hi ? 0.12 : 0.24))
      o.connect(g).connect(fg); o.start(tt); o.stop(tt + 0.3)
      if (!hi) { const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f0 * 1.2, tt); o2.frequency.exponentialRampToValueAtTime(f0 * 0.64, tt + 0.1); const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, tt); g2.gain.exponentialRampToValueAtTime(0.28 * vel, tt + 0.006); g2.gain.exponentialRampToValueAtTime(0.0001, tt + 0.27); o2.connect(g2).connect(fg); o2.start(tt); o2.stop(tt + 0.32) } // 大太鼓の胴鳴り（締まった低めの倍音で重みを足す）
      const cg2 = ctx.createGain(); cg2.gain.setValueAtTime(0.09 * vel, tt); cg2.gain.exponentialRampToValueAtTime(0.0001, tt + 0.03)       // 皮の当たり＝遠くでも拍が分かる
      const cl = ctx.createBiquadFilter(); cl.type = 'bandpass'; cl.frequency.value = hi ? 1400 : 900; cl.Q.value = 0.8
      const nb = ctx.createBufferSource(); nb.buffer = buf; nb.loop = true; nb.connect(cl).connect(cg2).connect(fg); try { nb.start(tt); nb.stop(tt + 0.05) } catch { /* 無視 */ }
    }
    // 合成の笛旋律(fue)は「作り物のBGM」に聞こえたため撤去（実機FB）。祭りらしさは太鼓の律動＋鉦の刻み＋ざわめきで出す。
    const kane = (tt, vol = 0.08) => {  // 鉦（あたり鉦）＝金属質の高い点。控えめに（太鼓を主役に）。非整数倍で本物の金物寄りに
      const g = ctx.createGain(); g.gain.setValueAtTime(0.001, tt); g.gain.exponentialRampToValueAtTime(vol, tt + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12)
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600; hp.connect(g).connect(bright)
      for (const f of [2740, 3510, 4270, 5300]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.995 + Math.random() * 0.01); o.connect(hp); try { o.start(tt); o.stop(tt + 0.15) } catch { /* 無視 */ } }
    }
    // 囃子の律動（1小節=16ステップ＝4拍×16分。本物の祭り太鼓の転がるグルーヴ）。2=大太鼓 1=締太鼓 0=休。
    const STEP = 0.15, taikoPat = [2, 0, 1, 0, 1, 0, 1, 0, 2, 0, 1, 0, 1, 1, 0, 1] // 大太鼓=1拍3拍／締太鼓の刻みと終端のドコドンで踊れる律動に
    const kanePat = [0, 0, 0.08, 0, 0, 0, 0.08, 0, 0, 0, 0.08, 0, 0, 0, 0.08, 0]   // 鉦のチキ刻み（控えめ＝太鼓が主役／近づいた時だけ鳴る）
    const schedule = () => {
      if (!festNode) return
      const ahead = ctx.currentTime + 0.25
      while (festNode.nextNote < ahead) {
        if (festState.amt > 0.005) {  // 近くに祭りが無い時は音符を作らない（無駄な処理を省く）
          const s = festNode.step % 16
          const tt = festNode.nextNote + (Math.random() - 0.5) * 0.012 // 微小な間のゆらぎ＝機械的な反復を避ける（ヒューマナイズ）
          const tp = taikoPat[s], vel = 0.82 + Math.random() * 0.3
          if (tp === 2) taiko(tt, false, vel); else if (tp === 1) taiko(tt, true, vel * 0.9)
          const kp = kanePat[s]; if (kp && festState.amt > 0.35) kane(tt, kp) // 鉦は近づいた時だけ（遠くは太鼓の胴だけ届く）
        }
        festNode.nextNote += STEP; festNode.step++
      }
      festNode.sched = setTimeout(schedule, 90)
    }
    schedule()
  }
  // 祭りの近さ(0..1)で囃子を満ち引きさせる。離れたら 0（無音）。近づくほど高域が澄む。
  function setFestival(amt, pan) {
    if (!festNode) return
    const t = now(), a = Math.max(0, Math.min(1, amt || 0))
    festNode.fg.gain.setTargetAtTime(a <= 0.01 ? 0 : a * 0.2, t, 0.8) // 実機FBで音量を下げる（0.5→0.3→0.2＝もっと控えめに）
    festNode.bright.frequency.setTargetAtTime(560 + a * a * 3600, t, 0.8)   // 遠=太鼓だけがこもって届く／近=笛・鉦が際立つ
    if (festNode.pan && Number.isFinite(pan)) festNode.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, pan)), t, 0.25) // 会場の方角へ定位（振り向くと反対へ流れる）
    festState.amt = a
  }
  //  駅の音（発車ベル＋電車の通過音）。setStation(近さ0..1)が満ち引きさせ、遠いとこもり近づくと澄む。
  //  特定の発車メロディは模さず一般的な穏やかなベルの旋律。電車の通過音は中域＝スマホで歪まない。
  let staNode = null
  const staState = { amt: 0 }
  function startStation() {
    if (!ctx || staNode || !ctx.createBufferSource) return
    const sg = ctx.createGain(); sg.gain.value = 0
    const sPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null // 空間音: 駅の方角へ定位
    if (sPan) sg.connect(sPan).connect(master); else sg.connect(master)
    const bright = ctx.createBiquadFilter(); bright.type = 'lowpass'; bright.frequency.value = 700; bright.Q.value = 0.5; bright.connect(sg) // ベルの明るさ（遠=こもる→近=澄む）
    const len = Math.floor(6 * ctx.sampleRate), buf = ctx.createBuffer(1, len, ctx.sampleRate), dd = buf.getChannelData(0) // 2秒→6秒で周期感を消す（評価サウンド）
    let mb = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; mb = 0.9 * mb + w * 0.1; dd[i] = (mb * 0.8 + w * 0.2) * 0.4 }
    staNode = { sg, bright, pan: sPan, timer: null }
    // 発車ベルは「チン」が不快との実機FBで廃止（合成のベル関数ごと削除＝死蔵コードを残さない）。駅は遠い電車の通過音だけ。
    const trainPass = (tt) => {  // 電車の通過音（中域のゴーッ＋レールのカタンカタン。寄せて返す）
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 130
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 0.7
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.2, tt + 2.6); g.gain.linearRampToValueAtTime(0.0001, tt + 5.6) // 控えめに（遠い電車）
      src.connect(hp).connect(bp).connect(g).connect(sg); try { src.start(tt); src.stop(tt + 6) } catch { /* 無視 */ }
      for (let k = 0; k < 20; k++) { const ct = tt + 0.7 + k * 0.2, env = Math.sin((k / 20) * Math.PI)  // 近づき遠ざかるカタンカタン
        const cg = ctx.createGain(); cg.gain.setValueAtTime(0.001, ct); cg.gain.exponentialRampToValueAtTime(0.1 * env + 0.002, ct + 0.004); cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.06)
        const cl = ctx.createBiquadFilter(); cl.type = 'bandpass'; cl.frequency.value = 500; cl.Q.value = 0.9
        const nb = ctx.createBufferSource(); nb.buffer = buf; nb.loop = true; nb.connect(cl).connect(cg).connect(sg); try { nb.start(ct); nb.stop(ct + 0.09) } catch { /* 無視 */ } }
    }
    let beat = 0
    const tick = () => {
      if (!staNode) return
      if (staState.amt > 0.06 && beat % 3 === 0) trainPass(ctx.currentTime + 0.1)  // ベル無し＝遠い電車の通過音だけを、ごくたまに
      beat++
      staNode.timer = setTimeout(tick, 52000 + Math.random() * 36000)  // ~52-88秒ごと（電車は実質2.5〜4分に一度・控えめ）
    }
    tick()
  }
  // 駅の近さ(0..1)で発車ベル・電車の音を満ち引きさせる。離れたら 0（無音）。近づくほど澄む。
  function setStation(amt, pan) {
    if (!staNode) return
    const t = now(), a = Math.max(0, Math.min(1, amt || 0))
    staNode.sg.gain.setTargetAtTime(a <= 0.01 ? 0 : a * 0.5, t, 0.7)
    staNode.bright.frequency.setTargetAtTime(640 + a * a * 3200, t, 0.7)  // 遠=こもったベル／近=澄んだベル
    if (staNode.pan && Number.isFinite(pan)) staNode.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, pan)), t, 0.25) // 駅の方角へ定位
    staState.amt = a
  }
  // 夏の風鈴の「チリン」は実機FBで不快につき廃止（合成関数ごと削除＝死蔵コードを残さない）。風鈴の見た目は3D側に残す。
  // 海の近さ・川の近さ・人混みの近さ・夏祭り・駅(各0..1)で環境音を満ち引きさせる。完全に離れたら 0（無音＝ノイズ漏れ無し）。
  function setAmbience(sea, river, crowd, fest, sta, festPan, staPan) {
    setFestival(fest, festPan)  // 夏祭りの囃子（場所への近さで満ち引き＋会場の方角へ定位）
    setStation(sta, staPan)     // 駅の音（発車ベル＋電車の通過音＋駅の方角へ定位）
    if (!waterNode) return
    const t = now()
    const s = Math.max(0, Math.min(1, sea || 0)), r = Math.max(0, Math.min(1, river || 0)), cw = Math.max(0, Math.min(1, crowd || 0))
    waterNode.wg.gain.setTargetAtTime(s <= 0.01 ? 0 : s * 0.05, t, 1.3)        // 波のベース音量
    if (waterNode.wAmp) waterNode.wAmp.gain.setTargetAtTime(s <= 0.01 ? 0 : s * 0.03, t, 1.3)  // 寄せて返すうねりの深さ
    if (waterNode.wAmp2) waterNode.wAmp2.gain.setTargetAtTime(s <= 0.01 ? 0 : s * 0.018, t, 1.3)
    waterNode.rg.gain.setTargetAtTime(r <= 0.01 ? 0 : r * 0.04, t, 1.1)        // せせらぎ
    if (waterNode.rAmp) waterNode.rAmp.gain.setTargetAtTime(r <= 0.01 ? 0 : r * 0.012, t, 1.1)
    waterNode.cg.gain.setTargetAtTime(cw <= 0.01 ? 0 : cw * 0.028, t, 1.2)     // 人混みのざわめき（控えめ）
    if (waterNode.cAmp) waterNode.cAmp.gain.setTargetAtTime(cw <= 0.01 ? 0 : cw * 0.012, t, 1.2)
    if (waterNode.cAmp2) waterNode.cAmp2.gain.setTargetAtTime(cw <= 0.01 ? 0 : cw * 0.008, t, 1.2)
    waterState.sea = s; waterState.river = r; waterState.crowd = cw
  }

  // ── 生成的なBGMの下地（素材ゼロ・合成パッド）。CC0/オフライン原則と完全整合。
  // 【作り直しの要点（実機FB「終始ぶーぶぶぶの電子ノイズで不快」）】
  //  ・低音ドローンを廃止＝和音を中高域(165〜660Hz)へ。スマホのスピーカーは低音(80〜220Hz)を歪ませ
  //    「うなり/ぶーぶー」になる。中高域の純正弦なら柔らかいパッドとして澄んで鳴る。
  //  ・三角波をやめ全て正弦波（倍音の刺さりを排除）。ローパスも高め(柔らかいが曇らない)。
  //  ・カットオフのLFO(うねり)を廃止＝脈打つ「ワウ」感を消す。揺らぎは音量のごく微かな呼吸のみ。
  //  ・部屋では完全に無音（gain 0）＝室内は自然音だけ。空へ出てそっと滲み出る。
  // 和音は全て A マイナー・ペンタトニック（A C D E G）内＝どの場面へ移っても濁らない。
  // master 経由なので音量/ミュート/おやすみに自動追従。ピークでもごく小さく自然音を邪魔しない。
  let bedNodes = null
  const bedState = { gain: 0, cut: 1500, voice: [220, 329.6, 440] } // 今の目標値（細かな変化を無視する基準）
  // 場面ごとの和音の声部（Hz）。全て中高域の A マイナー・ペンタトニック内（低音ドローンにしない）。
  const VOICE = {
    home: [220, 329.6, 440],    // A3 E4 A4＝開いた五度。穏やかで素直な基調
    sea: [329.6, 440, 659.3],   // E4 A4 E5＝高く広い。海上の開放感
    mountain: [220, 261.6, 329.6], // A3 C4 E4＝マイナーの色。山の静けさ
    edo: [220, 293.7, 440],     // A3 D4 A4＝温かなsus。箏のような和の響き
    sengoku: [164.8, 220, 261.6], // E3 A3 C4＝やや低く翳る。戦国の張りつめた静けさ
    taisho: [261.6, 392, 523.3], // C4 G4 C5＝明るくほのかに切ない。大正の港の郷愁
    cloud: [440, 659.3, 880],    // A4 E5 A5＝高く開いた澄んだ響き。雲海の上の夢見心地（山のマイナーの翳り＝不気味を脱し、心地よい開放感へ）
  }
  function startMusicBed() {
    if (!ctx || bedNodes || !ctx.createBiquadFilter) return
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = bedState.cut; lp.Q.value = 0.3
    const bedGain = ctx.createGain(); bedGain.gain.value = 0.0001
    lp.connect(bedGain).connect(master)
    const oscs = []
    const vmix = [0.5, 0.6, 0.42] // 各声部の音量比（中声部を芯に・上声部は控えめ＝柔らかいパッド）
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.type = 'sine' // 全て正弦＝倍音の刺さりなし
      o.frequency.value = bedState.voice[i]
      o.detune.value = (i - 1) * 3 // ごく僅かなデチューン＝ゆっくりしたうねりで生命感（中高域なので濁らない）
      const og = ctx.createGain(); og.gain.value = vmix[i]
      o.connect(og).connect(lp)
      try { o.start() } catch { /* 無視 */ }
      oscs.push(o)
    }
    // ごくゆっくりした音量の呼吸（カットオフのうねりは廃止＝脈打つワウ感を出さない）。
    // 重要: 呼吸LFOの深さ(lfo2G)は「現在の音量に比例」させる＝無音時(gain≈0)は呼吸も0で完全に消える。
    // 固定深さだと無音化しても±が残り、録画のAGCで微小な正弦和音が「機械音」に増幅されてしまう（実機FB）。
    let lfo2G = null
    try {
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.05
      lfo2G = ctx.createGain(); lfo2G.gain.value = 0.0; lfo2.connect(lfo2G).connect(bedGain.gain); lfo2.start() // 深さは setMusicBed で gain*0.3 に追従（無音時は0）
    } catch { /* LFO非対応でも下地は鳴る */ }
    bedNodes = { lp, bedGain, oscs, lfo2G }
  }
  // 場面（ctx）からBGMの目標（音量・音色・和音）を決め、数秒かけて滑らかに移す。
  // ctx = { off?, mode:'window'|'fly'|'walk', flyAmt, speed, altitude, terrain:'sea'|'mountain'|'land', edoP, senP, taiP, night }
  function setMusicBed(c) {
    if (!ctx || !bedNodes) return
    const t = now()
    let gain, cut, voice
    if (!c || c.off || muted) {
      gain = 0.0001; cut = bedState.cut; voice = bedState.voice // 3Dを離れる/消音中は静かに引く
    } else {
      const fly = Math.max(0, Math.min(1, c.flyAmt || 0))
      const spd = Math.max(0, Math.min(1, c.speed || 0))
      const eMax = Math.max(c.edoP || 0, c.senP || 0, c.taiP || 0)
      // 和音の選択: 時代の近さが勝てばその時代、次に地形(海/山)、なければ基調。
      if (eMax > 0.2) voice = (c.edoP >= c.senP && c.edoP >= c.taiP) ? VOICE.edo : (c.senP >= c.taiP ? VOICE.sengoku : VOICE.taisho)
      else if (c.terrain === 'cloud') voice = VOICE.cloud // 雲海の上＝高く開いた澄んだ響き（心地よい夢見心地）
      else if (c.terrain === 'sea') voice = VOICE.sea
      else if (c.terrain === 'mountain') voice = VOICE.mountain
      else voice = VOICE.home
      // 音量: 部屋＝無音(自然音だけ)。空へ出てから fly でそっと滲み出し、速度と時代の近さで僅かに満ちる。
      // 中高域は同じ振幅でも大きく聞こえる(等ラウドネス)ので、低音時代よりピークを下げる。
      if (c.mode === 'window' && fly < 0.2) gain = 0.0001 // 部屋では鳴らさない
      else if (c.mode === 'walk') gain = 0.012 * fly
      else gain = (0.013 + spd * 0.009 + eMax * 0.012) * Math.min(1, fly * 1.3)
      gain = Math.min(0.036, gain)
      // 音色（明るさ）: 海/速度で開け、山/戦国で翳り、大正は華やぎ、夜は全体に落ち着ける。高めの帯で柔らかく。
      cut = 1400 + spd * 600 + eMax * 300
      if (voice === VOICE.cloud) cut = 2600        // 雲海＝高く澄んで開ける（柔らかく明るい・夢見心地）
      else if (voice === VOICE.sea) cut += 500
      else if (voice === VOICE.mountain) cut = 1150
      else if (voice === VOICE.sengoku) cut = 1050
      else if (voice === VOICE.taisho) cut = 2200
      else if (voice === VOICE.edo) cut = 1650
      if (c.night) cut *= 0.86
    }
    // 【実機FB2回目（2026-06-21）「空中/着地後もブーーーと鳴り続けて不快」】＝持続するシンセのパッド(正弦の和音)
    // がドローンに聞こえる。ユーザーが繰り返し嫌うため、当面は完全無音化＝自然音(風・鳥・虫・波)だけにする。
    // 【画面録画FB（2026-06-23）「録画で変な機械音」】＝0.0001でも残響＋呼吸LFOの±が録画のAGCで増幅されていた。
    // 真の0にして、呼吸LFOの深さもgainに比例(=0)させ、合成パッドを完全に止める。
    gain = (voice === VOICE.cloud) ? 0.014 * Math.min(1, (c.flyAmt || 0) * 1.3) : 0.0 // 雲海の上だけ、高く澄んだ和音をそっと添える（夢見心地）。他は完全無音のまま＝繰り返し嫌われた持続ドローンは出さない
    // 細かな変化は無視（無駄なスケジューリングを抑える）。
    if (Math.abs(gain - bedState.gain) > 0.0008) { bedState.gain = gain; try { bedNodes.bedGain.gain.setTargetAtTime(gain, t, 1.8); if (bedNodes.lfo2G) bedNodes.lfo2G.gain.setTargetAtTime(gain * 0.3, t, 1.8) } catch { /* 無視 */ } }
    if (Math.abs(cut - bedState.cut) > 24) { bedState.cut = cut; try { bedNodes.lp.frequency.setTargetAtTime(cut, t, 2.4) } catch { /* 無視 */ } }
    if (voice !== bedState.voice) {
      bedState.voice = voice
      for (let i = 0; i < 3; i++) { try { bedNodes.oscs[i].frequency.setTargetAtTime(voice[i], t, 3.6) } catch { /* 無視 */ } } // 和音はゆっくり滑らせて移す＝場面が静かに移ろう
    }
  }

  // ── イベント連動の合成音（素材ゼロ）。現実に音のある現象だけ鳴らす（花火・流れ星）。
  // 気球/飛行機雲/雲影/宵の灯り/オーロラ/虹は現実に無音なので鳴らさない。
  function boom(at, amp) {
    // 遠い花火の破裂: ノイズの胴鳴り(ローパス)＋腹に響くサブのサイン(ピッチ落ち)。光→音のずれは呼び元で付ける。
    const len = Math.floor(0.5 * ctx.sampleRate)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource(); src.buffer = buf
    const lp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null
    if (lp) { lp.type = 'lowpass'; lp.frequency.value = 380 } // 遠い＝低域中心
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(amp * 0.5, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6)
    const sub = ctx.createOscillator(); sub.type = 'sine'
    sub.frequency.setValueAtTime(150, at); sub.frequency.exponentialRampToValueAtTime(105, at + 0.5) // 44Hzの純サブは実機スピーカーで歪む→太鼓(190Hz)と同方針で100Hz超の締まったドンに（評価エンジニア）
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, at); sg.gain.linearRampToValueAtTime(amp * 0.5, at + 0.02); sg.gain.exponentialRampToValueAtTime(0.0001, at + 0.55)
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    const out = pan || master
    if (pan) { pan.pan.value = (Math.random() - 0.5) * 0.8; pan.connect(master) }
    if (lp) { src.connect(lp); lp.connect(g) } else { src.connect(g) }
    g.connect(out); sub.connect(sg); sg.connect(out)
    try { src.start(at); src.stop(at + 0.66); sub.start(at); sub.stop(at + 0.6) } catch { /* 無視 */ }
  }
  function shimmer(at) {
    // 流れ星: ごく淡い高音のきらめき（短い下降のサイン）。
    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(2300, at); o.frequency.exponentialRampToValueAtTime(1250, at + 0.7)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.03, at + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.8)
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (pan) { pan.pan.value = (Math.random() - 0.5); o.connect(g).connect(pan).connect(master) } else { o.connect(g).connect(master) }
    try { o.start(at); o.stop(at + 0.85) } catch { /* 無視 */ }
  }
  function whistle(at) {
    // 花火の打ち上げ「ヒュ〜ッ」＝細く上昇する笛。破裂の直前に鳴り、破裂で消える（サウンド監督D15）。
    if (!ctx || !ctx.createOscillator) return
    const o = ctx.createOscillator(); o.type = 'sine'
    o.frequency.setValueAtTime(540, at); o.frequency.exponentialRampToValueAtTime(1480, at + 0.3)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.017, at + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.33)
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
    if (pan) { pan.pan.value = (Math.random() - 0.5) * 0.7; o.connect(g).connect(pan).connect(master) } else o.connect(g).connect(master)
    try { o.start(at); o.stop(at + 0.36) } catch { /* 無視 */ }
  }
  function playEvent(kind) {
    if (!started || !ctx || muted) return
    const T = now() + 0.02
    if (kind === 'fireworks') {
      const shots = 2 + ((Math.random() * 3) | 0)
      for (let i = 0; i < shots; i++) { const bt = T + 0.35 + i * (0.22 + Math.random() * 0.5); whistle(bt - 0.32); boom(bt, 0.5 + Math.random() * 0.34) } // 打ち上げの笛→光→一拍おいて遠い破裂＋連発
    } else if (kind === 'star') {
      shimmer(T)
    }
  }

  return {
    /** 検証用(dev): 現在の高度ダック量と、生きているループ音の実ゲイン。雲海の上で雨/虫が無音になるか確認する。 */
    _dbg() { return { altDuck: +altDuckV.toFixed(3), loops: layers.filter((l) => !l.stopped).map((l) => +l.layerGain.gain.value.toFixed(4)) } },
    /** 最初のユーザー操作で呼ぶ。音脈を起こし、現在の情景の音を静かに立ち上げる。 */
    async start() {
      ensureContext()
      if (!ctx) return
      unlockMediaSession() // ジェスチャ起点で無音タグを再生＝iOSの消音スイッチを回避
      if (ctx.state === 'suspended') await ctx.resume()
      started = true
      startWind() // 生成的な風をそっと立ち上げる（全情景でループ感を消す）
      startWater() // 場所に応じた水の音（波/せせらぎ）の源を立ち上げる（音量0＝setAmbienceが近さで満ち引き）
      startFestival() // 夏祭りの囃子の源を立ち上げる（音量0＝祭りに近づくと満ちる。離れている間は音符を作らない）
      startStation() // 駅の音の源を立ち上げる（音量0＝駅に近づくと遠い電車の音がたまに。ベルは廃止）
      // 生成BGMの下地(合成パッド)は実機で終始「ぶー」というドローンに聞こえ、ユーザーが繰り返し強く嫌う。
      // setMusicBedで基準音量を0にしても、bedGainに繋いだ呼吸LFO(±0.004)が乗って微かに鳴り続け、窓を開けた瞬間(防音解除)に目立つ。
      // 根本対策として下地そのものを起動しない＝oscillatorを生成せずドローン源を消す。自然音(風・鳥・虫・波)だけにする。
      // （startMusicBed/setMusicBed は将来用に残すが呼ばない。bedNodesがnullのままなのでsetMusicBedは何もしない）
      if (currentScene) await playScene(currentScene, false)
      // 起動の一声＝遠い風鈴のように澄んだ鈴を一つ。「丁寧に作られている」を最初の一拍で音にする第一印象（サウンド監督G26）。
      if (!muted && ctx.createOscillator) { try { const t0 = now() + 0.4
        for (const [mul, amp, dec] of [[1, 0.025, 2.6], [2.01, 0.009, 1.7]]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880 * mul; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec); o.connect(g).connect(master); o.start(t0); o.stop(t0 + dec + 0.1) }
      } catch { /* 無音でも続行 */ } }
    },
    /** 画面の現象に音を結ぶ（花火の遠い破裂・流れ星のきらめき）。無音の現象は鳴らさない。 */
    playEvent,
    /** 3Dの街の場面（部屋/窓辺/飛び始め/巡航/速度/山/海/各時代の近さ）でBGMの下地を静かに変える。
     *  3Dを離れる時は {off:true} で静かに引く。素材ゼロの合成パッドなのでオフライン/CC0原則と整合。 */
    setMusicBed,
    /** 場所に応じた水の音（波/せせらぎ）の満ち引き。sea=海の近さ・river=川/運河の近さ・crowd=人混み・fest=夏祭りの近さ(各0..1)。 */
    setAmbience,
    /** 夏祭りの囃子の満ち引き（遠くでほんのり→近づくと大きく・澄む）。amt=最寄りの開催中の祭りへの近さ(0..1)。 */
    setFestival,
    /** 駅の音（発車ベル＋電車の通過音）の満ち引き。amt=駅への近さ(0..1)。 */
    setStation,
    /** 情景を切り替える（音もクロスフェードで差し替える）。 */
    async setScene(scene) {
      currentScene = scene
      await playScene(scene, true)
    },
    setMuted(m) {
      muted = m
      if (master) {
        fadeGain.gain.cancelScheduledValues(now())
        fadeGain.gain.setValueAtTime(Math.max(0.0001, fadeGain.gain.value), now())
        fadeGain.gain.linearRampToValueAtTime(targetVol(), now() + 0.2)
      }
    },
    setVolume(v) {
      volume = v
      if (master && !muted) {
        fadeGain.gain.cancelScheduledValues(now())
        fadeGain.gain.setValueAtTime(Math.max(0.0001, fadeGain.gain.value), now())
        fadeGain.gain.linearRampToValueAtTime(Math.max(0.0001, v), now() + 0.1)
      }
    },
    /** 窓のあけ具合(0..1)で外音のこもり/澄みをクロスフェード（閉=ガラス越し→開=外気が澄む）。 */
    setWindowOpen(open) {
      windowOpenAmt = open ? 1 : 0
      if (!openFilter || !ctx) return
      const f = open ? 20000 : 900 // 閉=ガラス越しに大きくこもる（虫の高域も抑える）／開=澄む
      try {
        openFilter.frequency.cancelScheduledValues(now())
        openFilter.frequency.setValueAtTime(openFilter.frequency.value, now())
        openFilter.frequency.exponentialRampToValueAtTime(f, now() + 0.9) // 窓のease(約1.15s)に寄り添う
      } catch {
        openFilter.frequency.value = f
      }
      if (muffleGain) { // 閉じると音量も落として「防音されている」手応えを出す（開けると外気の音が戻る）
        const g = open ? 1 : 0.4
        try {
          muffleGain.gain.cancelScheduledValues(now())
          muffleGain.gain.setValueAtTime(muffleGain.gain.value, now())
          muffleGain.gain.linearRampToValueAtTime(g, now() + 0.9)
        } catch {
          muffleGain.gain.value = g
        }
      }
    },
    /** 飛行速度(0..1)で風切り音を膨らませる。機械音(ブォー/ぶぶぶ)でなく、空気を切る自然な「ひゅーー」＝飛んでいると分かる風（BoTWの滑空のイメージ）。 */
    setFlyWind(v) {
      if (!windNode || !ctx) return
      v = Math.max(0, Math.min(1, v || 0))
      if (Math.abs(v - flyWindV) < 0.03) return // 細かな変化は無視（無駄なスケジューリングを抑える）
      flyWindV = v
      const t = now()
      const e = v * v // 加速の手応え＝速いほど一気に風が増す
      try {
        windNode.g.gain.setTargetAtTime(v < 0.06 ? 0.0 : (0.003 + e * 0.05), t, 0.4) // 静止/低速は完全無音（録画AGCのノイズ増幅を断つ）。速いほど明確に「ひゅーー」
        windNode.bp.frequency.setTargetAtTime(1500 + v * 1700, t, 0.4)   // 常に高い帯(1.5〜3.2kHz)＝低い唸りにならず空気を切る笛に
        if (windNode.hp) windNode.hp.frequency.setTargetAtTime(520 + v * 900, t, 0.4) // 速いほど低音を更に削いで澄む
      } catch { /* 無視 */ }
    },
    /** 窓辺の猫を撫でた時のゴロゴロ（0..1）。撫でているほど大きく、離すと冷める。 */
    setPurr(level) {
      if (!ctx) return
      const v = Math.max(0, Math.min(1, level || 0))
      if (Math.abs(v - purrV) < 0.03 && v > 0.001) return
      purrV = v
      if (v > 0.001 && !purrNode) startPurr()
      if (purrNode) { try { purrNode.pg.gain.setTargetAtTime(v < 0.02 ? 0.0 : v * 0.045, now(), 0.18) } catch { /* 無視 */ } } // 撫で終わりは真の無音へ（残る低音が録画AGCで増幅されるのを防ぐ）
    },
    /** 猫の鳴き声「にゃーん」＝基音のグライド(me→ow)＋フォルマントの母音。素材ゼロの合成。タップ反応で鳴く。 */
    meow(pitch, kind) {
      if (!ctx || !ctx.createOscillator) return
      try {
        const t = now(), base = 360 * (pitch || 1)
        const osc = ctx.createOscillator(); osc.type = 'sawtooth' // 声帯の基音（倍音豊か）
        if (kind === 'short') { // 「にゃっ」短い甘え声
          osc.frequency.setValueAtTime(base * 1.05, t); osc.frequency.linearRampToValueAtTime(base * 1.3, t + 0.05); osc.frequency.linearRampToValueAtTime(base * 1.0, t + 0.16)
        } else { // 「にゃーん」上がって下がる
          osc.frequency.setValueAtTime(base * 0.9, t); osc.frequency.linearRampToValueAtTime(base * 1.5, t + 0.09); osc.frequency.linearRampToValueAtTime(base * 0.85, t + 0.42)
        }
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4 // 口の開き（母音フォルマント）
        bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(1500, t + 0.1); bp.frequency.linearRampToValueAtTime(720, t + 0.42)
        const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.Q.value = 3 // 第2フォルマント（鼻にかかる）＝時間で動かし母音の表情を出す（固定だと電子音っぽい）
        bp2.frequency.setValueAtTime(1750, t); bp2.frequency.linearRampToValueAtTime(2800, t + 0.1); bp2.frequency.linearRampToValueAtTime(2050, t + 0.42)
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t)
        const dur = kind === 'short' ? 0.22 : 0.55, peak = 0.055
        g.gain.linearRampToValueAtTime(peak, t + 0.05); g.gain.setTargetAtTime(0.0001, t + dur * 0.5, dur * 0.28)
        osc.connect(bp); bp.connect(bp2); bp2.connect(g); g.connect(indoorBus) // 猫は室内＝窓の防音を受けない
        // ビブラート＝鳴くたびに速さ/深さを変え、二つの非整数比の周期を重ねて「規則的すぎる電子ビブラート」を脱す（生体の揺らぎ）
        try { const vr = 17 + Math.random() * 9
          const vib = ctx.createOscillator(); vib.frequency.value = vr; const vg = ctx.createGain(); vg.gain.value = base * (0.038 + Math.random() * 0.02); vib.connect(vg).connect(osc.frequency); vib.start(t); vib.stop(t + dur + 0.1)
          const vib2 = ctx.createOscillator(); vib2.frequency.value = vr * 0.43; const vg2 = ctx.createGain(); vg2.gain.value = base * 0.016; vib2.connect(vg2).connect(osc.frequency); vib2.start(t); vib2.stop(t + dur + 0.1) } catch { /* 震え無しでも鳴る */ }
        osc.start(t); osc.stop(t + dur + 0.1)
      } catch { /* 無視 */ }
    },
    /** 散策の足音（地上を歩くときだけ・ごく控えめ）。素材別に質感を変える＝舗装/土・草/木の遊歩道。 */
    footstep(surf) {
      if (!ctx) return
      const t = now()
      // 素材ごとの音色: 舗装=やや硬く明るい / 土・草=柔らかく低い / 木=乾いて少し響く
      const s = surf === 'grass' ? { f: 420, fr: 130, gain: 0.04, dec: 0.10 }
        : surf === 'wood' ? { f: 660, fr: 220, gain: 0.05, dec: 0.16 }
        : surf === 'snow' ? { f: 540, fr: 170, gain: 0.036, dec: 0.085 } // 雪=やわらかく低く・短く・静か（踏みしめのキュッ）
        : { f: 700, fr: 240, gain: 0.055, dec: 0.12 } // hard(舗装・既定)
      const len = Math.floor((surf === 'wood' ? 0.11 : 0.09) * ctx.sampleRate)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2) // 短い減衰ノイズ
      const src = ctx.createBufferSource(); src.buffer = buf
      const lp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null
      const g = ctx.createGain(); g.gain.setValueAtTime(s.gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + s.dec)
      if (lp) { lp.type = 'lowpass'; lp.frequency.value = s.f + Math.random() * s.fr; src.connect(lp).connect(g).connect(master) } // こもった足音
      else src.connect(g).connect(master)
      try { src.start(t); src.stop(t + s.dec + 0.02) } catch { /* 無視 */ }
    },
    /** 着地音（飛行/ジャンプから降り立つ一打＝足音より低く重い「ドスッ」＋土埃の擦れ）。surfで土/草/雪/舗装の質感。 */
    land(surf) {
      if (!ctx || muted) return
      const t = now()
      const sub = ctx.createOscillator(); sub.type = 'sine' // 腹に響く低い胴鳴り（短くピッチが落ちる）
      sub.frequency.setValueAtTime(155, t); sub.frequency.exponentialRampToValueAtTime(72, t + 0.18)
      const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.07, t + 0.012); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      sub.connect(sg).connect(master)
      const len = Math.floor(0.16 * ctx.sampleRate), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0) // 土埃の擦れ（短い減衰ノイズ）
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2)
      const src = ctx.createBufferSource(); src.buffer = buf
      const lp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null
      const g = ctx.createGain(); g.gain.setValueAtTime(surf === 'grass' || surf === 'snow' ? 0.05 : 0.062, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
      if (lp) { lp.type = 'lowpass'; lp.frequency.value = surf === 'grass' ? 430 : surf === 'snow' ? 360 : 640; src.connect(lp).connect(g).connect(master) } else src.connect(g).connect(master)
      try { sub.start(t); sub.stop(t + 0.24); src.start(t); src.stop(t + 0.18) } catch { /* 無視 */ }
    },
    /** 街の環境音(虫/街音)をしぼる。v=しぼり量(0..1)。高空＋海上＋homeから離れた量を engine が合成して渡す。
     *  海に出ると虫の音がほぼ消える＝「海の上は風と鳥だけ」。風(生成)は別系統なので残る。 */
    setAltitudeDuck(v) {
      if (!ctx) return
      v = Math.max(0, Math.min(1, v || 0))
      if (Math.abs(v - altDuckV) < 0.03) return
      altDuckV = v
      for (const l of layers) applyLayerGain(l) // 高度しぼり＋日の傾きを合成して反映（雲海の上・海上ではほぼ無音＝風だけ）
    },
    /** 日の傾き(0=昼..1=夕方)で外の音をそっとやわらげる＝絵だけでなく音も時刻に連れ添う(評価エモ最優先)。室内の猫は不変。 */
    setDayPhase(v) {
      if (!ctx) return
      v = Math.max(0, Math.min(1, v || 0))
      if (duskShelf) { try { duskShelf.gain.setTargetAtTime(-v * 5.0, now(), 1.2) } catch { /* 無視 */ } } // 高域を最大-5dB＝夕方の空気がやわらぐ（虫や鳥の刺さりが和らぐ）
      if (Math.abs(v - dayPhaseV) < 0.02) return
      dayPhaseV = v
      for (const l of layers) applyLayerGain(l, 1.2) // 虫の声の交代(油蝉↔ヒグラシ)はゆっくり(1.2s)＝唐突に切り替わらない
    },
    /** 鳥が驚いて飛び立つ羽音（近づくと数回の柔らかい羽ばたき）。ごく控えめに。 */
    birdFlush() {
      if (!ctx) return
      const t0 = now()
      for (let f = 0; f < 3; f++) { // 数回の羽ばたき
        const at = t0 + f * 0.085 + Math.random() * 0.02
        const len = Math.floor(0.05 * ctx.sampleRate)
        const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5)
        const src = ctx.createBufferSource(); src.buffer = buf
        const bp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null
        const g = ctx.createGain(); g.gain.setValueAtTime(0.04, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07)
        if (bp) { bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 500; bp.Q.value = 0.6; src.connect(bp).connect(g).connect(master) }
        else src.connect(g).connect(master)
        try { src.start(at); src.stop(at + 0.08) } catch { /* 無視 */ }
      }
    },
    /** 海鳥(かもめ)の遠い鳴き声。海の上で時々＝海らしさと、長い渡りの退屈しのぎ。数声の下降する笛のような声。 */
    seaBird() {
      if (!ctx || muted) return
      const t0 = now() + 0.02, cries = 1 + ((Math.random() * 2) | 0)
      for (let c = 0; c < cries; c++) {
        const at = t0 + c * (0.22 + Math.random() * 0.18), f0 = 850 + Math.random() * 520
        const o = ctx.createOscillator(); o.type = 'sawtooth'
        o.frequency.setValueAtTime(f0, at); o.frequency.linearRampToValueAtTime(f0 * 0.62, at + 0.18 + Math.random() * 0.1) // 下降する鳴き
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.045, at + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.32)
        let node = o
        if (ctx.createBiquadFilter) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1; node = o.connect(bp) } // 笛らしく
        if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.3; node.connect(g).connect(pan).connect(master) } else node.connect(g).connect(master)
        // 声のよろめき＝単純な鋸歯グライドの「シンセの鳥」を脱す。鳴くたびに揺れの速さ/深さを変える。
        try { const vib = ctx.createOscillator(); vib.type = 'sine'; vib.frequency.value = 9 + Math.random() * 7; const vg = ctx.createGain(); vg.gain.value = f0 * (0.025 + Math.random() * 0.02); vib.connect(vg).connect(o.frequency); vib.start(at); vib.stop(at + 0.4) } catch { /* 揺れ無しでも鳴る */ }
        // 終端の「カスレ」＝喉の擦れ。ごく短いノイズを声と同じ帯域へ少しだけ。生体感。
        try { const nl = Math.floor(0.07 * ctx.sampleRate), nb = ctx.createBuffer(1, nl, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nl)
          const ns = ctx.createBufferSource(); ns.buffer = nb; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.8; const ng = ctx.createGain(); ng.gain.value = 0.018; ns.connect(nf).connect(ng).connect(master); ns.start(at + 0.2); ns.stop(at + 0.28) } catch { /* 無視 */ }
        try { o.start(at); o.stop(at + 0.38) } catch { /* 無視 */ }
      }
    },
    /** 渡りの群れに並走したときの羽音（大きな鳥のゆったりした羽ばたきの空気＝かもめより低く柔らかく）。 */
    flockWing() {
      if (!ctx || muted) return
      const t0 = now()
      for (let f = 0; f < 2; f++) { // ゆったり2打
        const at = t0 + f * 0.14 + Math.random() * 0.03
        const len = Math.floor(0.07 * ctx.sampleRate)
        const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0)
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4)
        const src = ctx.createBufferSource(); src.buffer = buf
        const bp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null
        const g = ctx.createGain(); g.gain.setValueAtTime(0.02, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.11)
        if (bp) { bp.type = 'bandpass'; bp.frequency.value = 480 + Math.random() * 240; bp.Q.value = 0.7; src.connect(bp).connect(g) } else src.connect(g) // 低めの帯＝大きな翼の風切り
        if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 0.8; g.connect(pan).connect(master) } else g.connect(master)
        try { src.start(at); src.stop(at + 0.13) } catch { /* 無視 */ }
      }
    },
    /** 静かな瞬間の鈴（雲上で休む/止空で佇むとき、ふと澄んだ音が満ちる＝整う）。高く澄んだ正弦＋倍音の長い余韻、A短ペンタの音。 */
    chime() {
      if (!ctx || muted || !ctx.createOscillator) return
      const t0 = now() + 0.02
      const notes = [659.3, 880, 987.8, 1318.5] // E5 A5 B5 E6（鈴のように高く澄む・どの場面でも濁らない）
      const f0 = notes[(Math.random() * notes.length) | 0]
      for (const [mul, amp, dec] of [[1, 0.034, 2.8], [2.01, 0.013, 1.9], [3.0, 0.007, 1.2]]) { // 基音＋倍音で鈴の澄んだ響き
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * mul
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec)
        let node = o.connect(g)
        if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 0.5; node.connect(pan).connect(master) } else node.connect(master)
        try { o.start(t0); o.stop(t0 + dec + 0.1) } catch { /* 無視 */ }
      }
    },
    /** 夕暮れの街にどこからか流れる和音のチャイム（防災無線の夕方の合図を思わせる＝「もう夕方、おうちへ」の郷愁）。
     *  既存曲は模さず、やわらかな下降の鐘の独自フレーズ。拡声器越しのように少しこもらせ遠くから届く。夕夜の街でだけ・ごくたまに鳴る。 */
    eveningChime() {
      if (!ctx || muted || !ctx.createOscillator) return
      const t0 = now() + 0.05
      const phrase = [587.3, 493.9, 440.0, 587.3, 392.0] // D5 B4 A4 D5 G4（独自の下降フレーズ＝特定の曲を模さない）
      const lp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null // 拡声器越しのこもり（遠さ）
      if (lp) { lp.type = 'lowpass'; lp.frequency.value = 2000; lp.Q.value = 0.5 }
      const busOut = lp || master; if (lp) lp.connect(master)
      phrase.forEach((f, i) => {
        const at = t0 + i * 0.62 // ゆったり間をおいて一音ずつ
        for (const [mul, amp, dec] of [[1, 0.03, 2.4], [2.0, 0.011, 1.6], [3.01, 0.005, 1.0]]) { // 基音＋倍音で鐘の響き
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(amp, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + dec)
          o.connect(g).connect(busOut)
          try { o.start(at); o.stop(at + dec + 0.1) } catch { /* 無視 */ }
        }
      })
    },
    /** 見回しの角度(yaw)で音場を左右に動かす（右を向くと音は左へ＝視覚と一致）。聴覚にも窓の外の広がりを。 */
    setLookPan(yaw) {
      lookPan = Math.max(-0.45, Math.min(0.45, -(yaw || 0) * 0.16))
      if (!ctx) return
      const t = now()
      for (const l of layers) {
        if (!l.panner || l.stopped) continue
        const target = Math.max(-1, Math.min(1, l.basePan + lookPan))
        try { l.panner.pan.setTargetAtTime(target, t, 0.12) } catch { l.panner.pan.value = target } // なめらかに移す（クリック音を避ける）
      }
    },
    getLookPan() { return lookPan }, // 検証/連携用
    getDebug() { return { state: ctx ? ctx.state : 'none', bedReady: !!bedNodes, bedGain: bedState.gain, bedCut: bedState.cut, bedVoice: bedState.voice.join('/'), water: !!waterNode, sea: +waterState.sea.toFixed(2), river: +waterState.river.toFixed(2), crowd: +waterState.crowd.toFixed(2), fest: +festState.amt.toFixed(2), sta: +staState.amt.toFixed(2) } }, // 検証用: BGM下地＋水音/ざわめき/祭り囃子/駅の状態
    isStarted() {
      return started
    },
  }
}
