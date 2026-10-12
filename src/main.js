// 全体の結線。器（情景データ）＋レンダラ＋音＋UI をつなぐ。

import { SCENES, DEFAULT_SCENE, pickNowScene } from './data/scenes/index.js'
import { getState, setScene, updateSettings, recordVisit, addViewSeconds, recordEvent, addJournalEntry, markDiscovered, getWorldState } from './state.js'
import { createRenderer } from './engine/renderer.js'
import { createEvents2d } from './engine/events2d.js'
import { createAudio } from './audio/audio.js'
import { buildUI } from './ui/ui.js'
import { attachLookAround } from './ui/lookAround.js'
import { createTilt, tiltAxes } from './ui/tilt.js'
// 立体の街エンジン(town3dViewer)とスプラットビューア(splatViewer)はどちらも重い（8千行超の造形コードや Three.js を含む）。
// 窓辺(2D)の起動時には読み込まず、その情景に入る瞬間だけ動的importで取り寄せる＝最初の表示を軽くする（評価エンジニア・初期チャンク削減）。
// メイン描画は素のWebGL（renderer.js）なので、これらは3D/スプラット情景に入るまで一切ダウンロードされない。
let _t3d = null // 読み込み済みの town3dViewer モジュール（未読み込みなら null）
let _splat = null // 読み込み済みの splatViewer モジュール（未読み込みなら null）
const loadTown3d = async () => (_t3d ||= await import('./engine/town3dViewer.js'))
const loadSplat = async () => (_splat ||= await import('./engine/splatViewer.js'))

const BASE = import.meta.env.BASE_URL || '/'

const canvas = document.getElementById('scene')
const fallback = document.getElementById('fallback')

const renderer = createRenderer(canvas)
if (!renderer) {
  // WebGL 非対応・初期化失敗時は静かにフォールバック。
  canvas.hidden = true
  if (fallback) fallback.hidden = false
} else {
  start()
}

// オフラインでも開ける（PWA）。本番のみ・対応ブラウザのみ。失敗は静かに無視。
// 一度訪れれば、電波が無くても・将来サーバが消えても眺められる（「自分がいなくなっても動く」）。
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // 新しい版のSWが有効化されて制御が切り替わったら、一度だけ静かに再読込する。
  // これをしないと「古い版で起動したページ」に新しいSWが途中で割り込み、古い情景レジストリ(引退した実写の窓など)と
  // 新しいチャンクが混在して情景メニューが壊れる（実機FB: 雨で遊んだ後に条件メニューが変わり実写しか選べない）。
  // 初回登録(まだ誰も制御していない)では再読込しない＝更新時だけ一回。
  const hadController = !!navigator.serviceWorker.controller
  let swReloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || swReloading) return
    swReloading = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).then((reg) => {
      if (!reg) return
      reg.update().catch(() => {}) // 起動ごとに更新確認＝新版を24時間待たずに拾う（実機の古いキャッシュからの脱出を速める）
      // アプリに戻るたびにも更新確認（PWAは閉じずに長く滞在するため）。
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}) })
    }).catch(() => {})
  })
}

function resolveScene(id) {
  return SCENES.find((s) => s.id === id && s.status === 'ready') || DEFAULT_SCENE
}

function start() {
  const state = getState()
  // 連続性「昨日(さっき)の続き」: 直近(3時間以内)に居た情景があればそこへ戻す＝閉じて開き直しても続きから。
  // 久しぶり(=新しい日/セッション)なら「いま（今の季節・時刻）の窓辺」を開く＝今と地続きの再訪動機（pickNowSceneの日替わり巡回を保つ）。
  const CONTINUE_MS = 3 * 3600 * 1000
  const recent = state.sceneId && state.sceneAt && (Date.now() - state.sceneAt) < CONTINUE_MS
  const lastScene = recent ? SCENES.find((s) => s.id === state.sceneId && s.status === 'ready' && s.public !== false) : null
  const scene = lastScene || pickNowScene()
  const settings = state.settings

  // iPhone特有のズーム（連打＝ダブルタップ拡大／二本指のピンチ拡大）を堅牢に無効化。
  // touch-action/viewportだけではiOS Safariが拡大することがあるため、JSでも止める（アプリ内のズームはポインタ操作で別途実装）。
  document.addEventListener('gesturestart', (e) => e.preventDefault()) // iOSのピンチ拡大ジェスチャ
  document.addEventListener('gesturechange', (e) => e.preventDefault())
  let lastTouchEnd = 0
  document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTouchEnd < 350) e.preventDefault(); lastTouchEnd = n }, { passive: false }) // 連打＝ダブルタップ拡大を止める（ポインタイベントは生きるので操作・連打判定は通る）
  document.addEventListener('dblclick', (e) => e.preventDefault())

  // モーション過敏への配慮: OS設定 prefers-reduced-motion に追従して“息づかい”の揺れを止める
  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const applyReduceMotion = () => renderer.setReduceMotion(!!(mqReduce && mqReduce.matches))
  applyReduceMotion()
  if (mqReduce && mqReduce.addEventListener) mqReduce.addEventListener('change', applyReduceMotion)

  // 遠雷の音に合わせて空をほのかに光らせる（シェーダー情景＝renderer／立体の街＝town3d 両方に効かせる）
  const audio = createAudio({
    onCue: (def) => {
      if (def.cue === 'thunder') { renderer.triggerFlash(0.6); if (town3dMode) _t3d?.triggerTown3dFlash(0.6) } // 遠雷はひかえめに
    },
  })
  // シェーダー2D情景の静かな定期イベント（澄んだ夜＝流れ星／夏の宵＝蛍）。town3d/splatは各自の現象系を持つので除外。
  const events2d = createEvents2d({
    onStar: () => { if (!sleepFading) audio.playEvent('star') }, // 流れ星のきらめき音
    isLive: () => !sleepFading && !document.hidden, // おやすみ中・非表示では出さない
    reduceMotion: !!(mqReduce && mqReduce.matches),
  })
  if (/[?&]dev=1/.test(location.search)) { window.__events2d = events2d; window.__audio = audio } // dev: 流れ星の手動発火・音の高度ダック確認(__audio._dbg())
  let splatMode = false
  let town3dMode = false
  // 端末の傾き: スプラット情景は3Dの見回し、それ以外はシェーダーの視差に振り分ける
  const tilt = createTilt({
    onTilt: (nx, ny) => {
      if (splatMode) _splat?.applySplatTilt(nx, ny)
      else if (town3dMode) _t3d?.applyTown3dTilt?.(nx, ny) // 町の3Dは窓辺の見回しに足す（以前は隠れた2Dへ流れて効かなかった・S50）
      else renderer.applyTilt(nx, ny)
    },
    onDisable: () => {
      if (splatMode) _splat?.resetSplatTilt()
      _t3d?.applyTown3dTilt?.(0, 0)
      renderer.clearTilt()
    },
  })
  audio.setMuted(settings.muted)
  audio.setVolume(settings.volume)

  // シェーダー描画は非スプラット情景で起動する（スプラットは別ビューアで表示）
  const firstShaderScene = (scene.render === 'splat' || scene.render === 'town3d') ? DEFAULT_SCENE : scene
  const ok = renderer.start(firstShaderScene, settings)
  if (!ok) {
    canvas.hidden = true
    if (fallback) fallback.hidden = false
    return
  }

  // 情景切替のなめらかな暗転オーバーレイ
  const sceneFade = document.createElement('div')
  sceneFade.className = 'scene-fade'
  document.body.appendChild(sceneFade)
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  // 情景の適用。スプラット情景は3Dビューア、それ以外はシェーダー描画に振り分ける。
  // 連打切替に備え世代トークンで古い処理の状態書き換えを無効化、失敗時は通常情景へフォールバック。
  let sceneGen = 0
  async function applyScene(next, animate = true) {
    const gen = ++sceneGen
    if (animate) {
      // 情景の空色へ一瞬沈める（暗転）。切替が見えてから景色を入れ替える
      sceneFade.style.background = (next.palette && next.palette.early && next.palette.early.skyMid) || '#1a1320'
      sceneFade.style.transition = 'opacity 0.25s ease'
      sceneFade.style.opacity = '1'
      await wait(260)
      if (gen !== sceneGen) return // 連打されたら新しい切替に任せる
    }
    setScene(next.id)
    recordVisit(next.id) // 通い帳: この窓辺に座った記録
    audio.resetPlaces() // 前の町（高く飛んでいた等）が残した音の値を戻してから、新しい情景の音を立ち上げる（D7・S1）
    audio.setScene(next)
    events2d.setScene(next) // シェーダー2D情景の定期イベント（流れ星/蛍）。town3d/splatでは内部で無効化

    if (next.render !== 'town3d') audio.setMusicBed({ off: true }) // 3Dの街以外ではBGMの下地を静かに引く（3Dではエンジンのonsceneが鳴らす）
    // 情景を替えたら窓は閉じた状態から始める（ボタンと描画のズレを防ぐ）
    renderer.setWindowOpen(false)
    audio.setWindowOpen(false) // 音も閉じた（こもった）状態へ戻す
    if (ui && ui.resetWindow) ui.resetWindow()
    if (next.render === 'splat') {
      splatMode = true
      canvas.style.display = 'none'
      renderer.pause(); if (renderer.freeFBO) renderer.freeFBO() // 別エンジン描画中はメインのGPUメモリを解放（コンテキスト枯渇の緩和）
      if (town3dMode) { town3dMode = false; if (_t3d) await _t3d.unmountTown3d() }
      try {
        // 読み込み中の下地は情景の空色に（黒からの唐突な切替を避ける）
        const bg = (next.palette && next.palette.early && next.palette.early.skyMid) || null
        await (await loadSplat()).mountSplat(document.body, BASE + next.splatUrl, next.splatMode || 'orbit', bg)
        // 読み込み中に新しい情景へ切替わっていたら、何もせず譲る（後始末は新しい切替が行う＝ここで unmount すると新情景を壊す・連打レース対策）
        if (gen !== sceneGen) return
      } catch (e) {
        console.error('スプラット読み込み失敗→通常情景へ:', e)
        if (gen !== sceneGen) return // 既に次の切替が走っている＝そちらに任せる（古いエラーで新情景を壊さない）
        if (_splat) await _splat.unmountSplat()
        if (gen !== sceneGen) return
        splatMode = false
        canvas.style.display = ''
        renderer.resume()
        renderer.setScene(DEFAULT_SCENE)
      }
    } else if (next.render === 'town3d') {
      // 本物の3Dの街（Three.js）。窓から立体の街を見下ろす。
      town3dMode = true
      canvas.style.display = 'none'
      renderer.pause(); if (renderer.freeFBO) renderer.freeFBO() // 立体の街の描画中はメインのGPUメモリを解放（コンテキスト枯渇の緩和・評価エンジニア）
      if (splatMode) { splatMode = false; if (_splat) await _splat.unmountSplat() }
      try {
        await (await loadTown3d()).mountTown3d(document.body, {
          palette: (next.palette && next.palette.early) || null,
          season: (next.axes && next.axes.season) || 'summer',
          weather: next.town3dWeather || null, // 'snow' | 'petals' | 'leaves'（降るもの）
          kind: next.town3dKind || 'town', // 'town'（坂の街）| 'yato'（谷戸）
          bg3d: next.bg3d || null, // 奥に敷く実写背景（Flux生成）。遠景を写真級にする任意の格上げ層
          quality: getState().settings.quality, // 描き込み品質＝low端末の発熱/カクつきを抑える（town3dにも効かせる）
          brightness: getState().settings.brightness, // 明るさ設定を3Dにも反映
          timeStay: getState().settings.timeStay, // 「時間をとどめる」＝日の傾きのドリフトを凍結（3Dにも反映）
          reduceMotion: !!(mqReduce && mqReduce.matches), // 視差軽減: 定期イベントを止める
          onEvent: (kind) => {
            const k2 = kind === 'fireworksFinale' ? 'fireworks' : kind // 花火大会フィナーレも花火の音
            if (!sleepFading) audio.playEvent(k2) // 画面の現象に音を結ぶ（おやすみ中は鳴らさない）
            // 無音だった「空のご褒美」（虹・オーロラ・天の川）に、やわらかな鈴をそっと添える＝静かな立ち会いの一拍。
            if (!sleepFading && (kind === 'rainbowSolo' || kind === 'aurora' || kind === 'milkyway')) audio.chime()
            const rare = { rainbowSolo: 'rainbow', rain: 'rainbow', fireworks: 'fireworks', fireworksFinale: 'fireworks', aurora: 'aurora', star: 'star' }[kind]
            if (rare && recordEvent(rare)) { // 通い帳: まれな景色に立ち会った記録。初めて立ち会った時だけ、絵日記にその日の一行を綴る（連打で埋めない）
              const dt = new Date(), md = `${dt.getMonth() + 1}月${dt.getDate()}日`
              const line = { rainbow: '虹がでた。', fireworks: '遠くで花火があがった。', aurora: '空に光のカーテンが揺れた。', star: '流れ星がながれた。' }[rare]
              if (line) addJournalEntry(`${md}、${line}`)
            }
          },
          onSpeed: (v) => { if (!sleepFading) audio.setFlyWind(v) }, // 飛行速度で風音を膨らませる
          onFoot: (surf) => { if (!sleepFading) audio.footstep(surf) }, // 散策の足音（素材別＝舗装/土・草/木）
          onLand: (surf) => { if (!sleepFading) audio.land(surf) }, // 降り立つ一打（低い胴鳴り＋土埃の擦れ）
          onBirdFlush: () => { if (!sleepFading) audio.birdFlush() }, // 鳥が驚いて飛び立つ羽音
          onAltitude: (v) => audio.setAltitudeDuck(v), // 高空で街の環境音をしぼる（風だけの静けさへ）
          onAmbience: (sea, river, crowd, fest, sta, festPan, staPan) => { if (!sleepFading) audio.setAmbience(sea, river, crowd, fest, sta, festPan, staPan) }, // 場所に応じた音（海＝波／川＝せせらぎ／人だまり＝ざわめき／夏祭り＝囃子／駅＝発車ベル）が満ち引き＋祭/駅は方角へ定位（空間音）
          onScene: (c) => { if (!sleepFading) audio.setMusicBed(c) }, // 場面に応じて生成BGMの下地を静かに変える
          onSeaBird: () => { if (!sleepFading) audio.seaBird() }, // 海の上で時々かもめが鳴く
          onPurr: (v) => { if (!sleepFading) audio.setPurr(v) }, // 窓辺の猫を撫でるとゴロゴロ鳴る
          onMeow: (pitch, kind) => { if (!sleepFading) audio.meow(pitch, kind) }, // 窓辺の猫がタップ反応で鳴く（にゃーん）
          onFlockWing: () => { if (!sleepFading) audio.flockWing() }, // 渡りの群れに並走すると羽音
          onChime: () => { if (!sleepFading) audio.chime() }, // 静かな瞬間（雲上で休む/止空で佇む）にふと澄んだ鈴が満ちる
          onEveningChime: () => { if (!sleepFading) audio.eveningChime() }, // 夕暮れの街にどこからか流れるチャイム（夕方の合図＝「もうおうちへ」の郷愁）。夕夜の街でだけ・ごくたまに
          onLocation: (name) => { if (ui && ui.setLocation) ui.setLocation(name) }, // いまの居場所をモードピルに表示＝飛行中の迷子防止（評価UX-U2）
          discovered: getWorldState().discovered, // 既に辿り着いた時代エリア＝光の標を淡く沈め、未訪の地へ誘いを集める（死蔵された世界の救出）
          onDiscover: (id) => markDiscovered(id), // 飛んで辿り着いた地を静かに記録（世界に進みが刻まれる。達成度は出さない）
          onTrace: (name) => { const dt = new Date(); addJournalEntry(`${dt.getMonth() + 1}月${dt.getDate()}日、${name}。`) }, // 歩いて近づいた痕跡を、その日の一行として絵日記へ（死蔵された作り込みの救出。通知は出さずそっと残す）
          onDayPhase: (v) => { if (!sleepFading) audio.setDayPhase(v) }, // 日の傾きで外の音もそっとやわらぐ＝絵だけでなく音も時刻に連れ添う（評価エモ最優先）
          onContextRestore: () => { applyScene(next, false) }, // WebGLコンテキスト喪失（実機のバックグラウンド復帰/メモリ逼迫）から復帰したら、同じ情景を組み直して黒画面固定を防ぐ（評価 技術-致命3）
        })
        if (gen !== sceneGen) return // 新しい切替が走っている＝そちらが active を管理する。ここで unmount すると新情景を壊す（連打レース対策）
      } catch (e) {
        console.error('3Dの街 表示失敗→通常情景へ:', e)
        if (gen !== sceneGen) return // 既に次の切替が走っている＝そちらに任せる（古いエラーで新情景を壊さない）
        if (_t3d) await _t3d.unmountTown3d()
        if (gen !== sceneGen) return
        town3dMode = false
        canvas.style.display = ''
        renderer.resume()
        renderer.setScene(DEFAULT_SCENE)
      }
    } else {
      if (splatMode) {
        splatMode = false
        if (_splat) await _splat.unmountSplat()
        if (gen !== sceneGen) return
        canvas.style.display = ''
        renderer.resume()
      }
      if (town3dMode) {
        town3dMode = false
        if (_t3d) await _t3d.unmountTown3d()
        if (gen !== sceneGen) return
        canvas.style.display = ''
        renderer.resume()
      }
      if (gen !== sceneGen) return
      renderer.setScene(next)
    }
    // 暗転から静かに戻す（最新の切替のときだけ）
    if (animate && gen === sceneGen) {
      sceneFade.style.transition = 'opacity 0.6s ease'
      requestAnimationFrame(() => {
        sceneFade.style.opacity = '0'
      })
    }
  }

  // ── おやすみタイマー：眺めているうちに、そっと暗転して音が引いて休む（眺めて寝落ちる） ──
  // 触れればいつでも静かに戻る。暗転しきったら描画と音を止めてバッテリーも守る。
  const sleepOverlay = document.createElement('div')
  sleepOverlay.className = 'sleep-overlay'
  const sleepWord = document.createElement('p')
  sleepWord.className = 'sleep-word'
  sleepWord.textContent = 'おやすみなさい'
  sleepOverlay.appendChild(sleepWord)
  document.body.appendChild(sleepOverlay)
  let sleepTimer = 0
  let sleepFading = false
  function cancelSleep() {
    clearTimeout(sleepTimer)
    sleepTimer = 0
    if (sleepFading) {
      sleepFading = false
      sleepOverlay.classList.remove('sleep-overlay--on', 'sleep-overlay--done')
      renderer.resume('sleep') // おやすみで止めた分だけ外す（町の3Dの最中なら 'engine' が残り、2Dは止まったまま・S34）
      if (town3dMode) _t3d?.setTown3dPaused?.(false) // 3Dの街も描画を再開（暗転から戻る）
      const st = getState().settings
      audio.setVolume(st.volume) // 音量を戻す
      audio.setMuted(st.muted)
    }
  }
  function startSleepFade(durMs) {
    sleepFading = true
    sleepOverlay.classList.add('sleep-overlay--on') // CSSで約26秒かけて暗転
    const startVol = getState().settings.volume
    const t0 = performance.now()
    const dur = durMs || 26000 // 検証用に短くできる（__sleepNow(ms)）
    function ramp() {
      if (!sleepFading) return
      const k = Math.min(1, (performance.now() - t0) / dur)
      audio.setVolume(startVol * (1 - k)) // 音を静かに絞る
      if (k < 1) requestAnimationFrame(ramp)
      else {
        sleepOverlay.classList.add('sleep-overlay--done')
        renderer.pause('sleep') // 暗転しきったら休む（描画停止＝発熱/電池に配慮）。理由つきで止め、画面の復帰で勝手に動き出さない（S34）
        if (ui && ui.setSleep) ui.setSleep(0) // タイマーは使い切った＝設定の点灯を「なし」へ戻す（D8）
        if (town3dMode) _t3d?.setTown3dPaused?.(true) // 3Dの街も暗転の裏で止める（従来は真っ暗な裏で描き続けていた＝純損失）
        audio.setMuted(true)
      }
    }
    requestAnimationFrame(ramp)
  }
  function onSleepTimer(min) {
    cancelSleep()
    if (min > 0) sleepTimer = setTimeout(startSleepFade, min * 60000)
  }
  // 眠りの暗転中に触れたら、そっと眺めへ戻す
  ;['pointerdown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, () => { if (sleepFading) cancelSleep() }, { passive: true }),
  )

  // 初回のみ: 起動直後に景色がゆっくり一度だけ見回して正面へ戻る＝「指で動かせる／ただの静止画ではない」を
  // 体で伝える最小の所作。「視差効果を減らす」設定・見回し系でない情景・触れた瞬間は行わない/中止する。
  function maybeLookDemo() {
    try {
      if (localStorage.getItem('seasons_look_demo')) return
      localStorage.setItem('seasons_look_demo', '1')
    } catch { return }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (town3dMode || splatMode) return // 3Dの街/スプラットは別系統の見回し＝対象外
    let cancelled = false
    const cancel = () => { cancelled = true }
    window.addEventListener('pointerdown', cancel, { once: true })
    const seq = [[1.2, 0], [-1.2, 0], [0, 0]] // 右を覗く→左を覗く→正面へ（rendererの追従で滑らかに）
    let i = 0
    const step = () => {
      if (cancelled || town3dMode) { window.removeEventListener('pointerdown', cancel); return }
      renderer.setPanTarget(seq[i][0], seq[i][1])
      if (++i < seq.length) setTimeout(step, 1900)
      else window.removeEventListener('pointerdown', cancel)
    }
    setTimeout(step, 1000)
  }

  // 通い帳: 眺めている時間を静かに積む（タブ非表示/おやすみ中は数えない）
  setInterval(() => {
    if (!document.hidden && !sleepFading && audio.isStarted()) addViewSeconds(20)
  }, 20000)

  // 見回しに連動して音場が左右に動く（聴覚の没入）。シェーダー情景のみ（3Dの街/スプラットは別系統＝中央）。
  setInterval(() => {
    if (!audio.isStarted()) return
    audio.setLookPan(town3dMode || splatMode ? 0 : renderer.getPan().x)
  }, 130)

  const ui = buildUI({
    initialScene: scene,
    settings,
    onApplyScene(next) {
      applyScene(next)
    },
    onSleepTimer,
    getJournal: () => getState().journal, // 通い帳の記録（訪れた窓辺・累計時間・まれな現象）
    onSettings(patch) {
      updateSettings(patch)
      renderer.setSettings(getState().settings)
      // 3Dの街モードでは明るさ・描き込みをtown3dへ反映（シェーダーは一時停止中なので renderer.setSettings は効かない）
      if (town3dMode && (patch.brightness !== undefined || patch.quality !== undefined || patch.timeStay !== undefined)) {
        _t3d?.setTown3dSettings({ brightness: patch.brightness, quality: patch.quality, timeStay: patch.timeStay })
      }
      if (patch.tilt !== undefined) {
        if (patch.tilt) {
          tilt.enable().then((ok) => {
            if (!ok) updateSettings({ tilt: false }) // 許可拒否なら設定を戻す
          })
        } else {
          tilt.disable()
        }
      }
    },
    onAudioStart() {
      maybeLookDemo() // 初回だけ、そっと一度見回して「動かせる」ことを伝える
      // 保存された「傾きで見回す」は、このタップの中で有効にする（iOS は許可にタップが要る。以前は開き直すと点いているのに効かなかった・S50）
      if (getState().settings.tilt) {
        tilt.enable().then((ok) => { if (!ok) { updateSettings({ tilt: false }); if (ui && ui.setTilt) ui.setTilt(false) } })
      }
      return audio.start()
    },
    onToggleMute(muted) {
      updateSettings({ muted })
      audio.setMuted(muted)
    },
    onVolume(v) {
      updateSettings({ volume: v })
      audio.setVolume(v)
    },
    onToggleWindow(open) {
      if (town3dMode) _t3d?.setTown3dWindowOpen(open) // 3Dの街は窓ガラスがすべって開く
      else renderer.setWindowOpen(open)
      audio.setWindowOpen(open) // 窓をあけると外音が澄む（ガラス越しのこもり→外気＝視覚＋聴覚で「あいた」を伝える）
    },
    onToggleLean(lean) {
      if (town3dMode) _t3d?.setTown3dLean(lean) // 3Dの街はカメラが枠を越えて前へ
      else renderer.setLeanOut(lean)
      if (lean) audio.setWindowOpen(true) // 乗り出すと窓は開く＝外音もさらに澄む
    },
    onToggleFly(fly) {
      if (town3dMode) _t3d?.setTown3dFly(fly) // 立体の街は空へ飛び立ち、滑空して見渡す
      if (fly) audio.setWindowOpen(true) // 空にいる＝外気の音
    },
    onToggleLand(land) {
      if (town3dMode) _t3d?.setTown3dLand(land) // 空から飛び降りて着地し一人称で歩く／また飛び立つ
      audio.setWindowOpen(true) // 地上も外気の中
    },
    isFlyable() {
      return town3dMode && !!_t3d && _t3d.isTown3dFlyable() // 「空へ／おりる」を出してよい情景か（立体の街のとき）
    },
    onShowHint() {
      if (town3dMode) _t3d?.setTown3dHint() // モードピルをタップ＝消えた操作ヒントをもう一度出す（迷った時に・評価UX-U1）
    },
  })

  // 開発時のみ: コンソール/検証から描画を触れるようにする（遠雷フラッシュ・サムネ生成など）
  if (/[?&]dev=1/.test(location.search)) {
    window.__renderer = renderer
    window.__audio = audio // 検証用: 見回し連動の音場(getLookPan)など
    window.__applyScene = (id) => applyScene(resolveScene(id), false)
    window.__sceneIds = SCENES.filter((s) => s.public !== false && s.status === 'ready').map((s) => s.id)
    window.__town3dWindow = (b) => _t3d?.setTown3dWindowOpen(b) // 検証用: 3Dの街の窓をあける/しめる
    window.__town3dLean = (b) => _t3d?.setTown3dLean(b) // 検証用: 3Dの街で身を乗り出す/もどる
    window.__town3dFlyToggle = (b) => _t3d?.setTown3dFly(b) // 検証用: 3Dの街で空へ飛び立つ/もどる
    window.__town3dLandToggle = (b) => _t3d?.setTown3dLand(b) // 検証用: 着地して歩く/また飛び立つ
    window.__sleepNow = (ms) => startSleepFade(ms) // 検証用: おやすみの暗転を即時に起こす（ms を渡すと暗転を短く）
    window.__tiltState = () => ({ enabled: tilt.isEnabled() }) // 検証用: 傾きの見回しが効いているか
    window.__tiltAxes = tiltAxes // 検証用: 画面の向きに合わせた傾きの軸の入れ替え
    window.__lookDemo = () => maybeLookDemo() // 検証用: 初回の見回しデモを起こす（flagは呼び元で消す）
    window.__sleepState = () => ({ fading: sleepFading, on: sleepOverlay.classList.contains('sleep-overlay--on') })
  }

  // 起動時の情景を適用（暗転なし。導入は起動ゲートが担う）
  applyScene(scene, false)

  // 指スワイプで景色を見回す（窓辺シリーズで有効）
  attachLookAround(canvas, renderer)
}
