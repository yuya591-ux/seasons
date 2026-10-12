// 画面のUI。眺める邪魔をしないよう最小限・控えめ。無操作でHUDは静かに消える。
// 文言は静かで上質に。システム用語は出さない。

import { SCENES, pickNowScene } from '../data/scenes/index.js'
import { CREDIT_INTRO, CREDIT_SOUNDS, CREDIT_IMAGES, CREDIT_TOOLS, CREDIT_OUTRO } from '../data/credits.js'

const h = (tag, cls, text) => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text != null) el.textContent = text
  return el
}

export function buildUI(opts) {
  const {
    initialScene,
    settings,
    onApplyScene, // (scene) => void
    onSettings, // (patch) => void
    onAudioStart, // () => Promise<void>  最初のタップ
    onToggleMute, // (muted) => void
    onVolume, // (v) => void
    onToggleWindow, // (open) => void  窓をあける/しめる
    onToggleLean, // (lean) => void  身を乗り出す/もどる
    onToggleFly, // (fly) => void  空へ飛び立つ/窓へもどる（立体の街）
    onToggleLand, // (land) => void  飛び降りて着地して歩く/また飛び立つ（立体の街）
    isFlyable, // () => boolean  いま「空へ/おりる」を出してよいか（立体の街のとき）
    onSleepTimer, // (minutes) => void  おやすみタイマー（0=なし）
    getJournal, // () => journal  通い帳の記録（訪れた窓辺・累計時間・まれな現象）
    onShowHint, // () => void  消えた操作ヒントをもう一度出す（モードピルのタップで）
  } = opts

  const root = h('div', 'ui')
  document.body.appendChild(root)
  // 起動前は HUD/右上ボタンを隠す（半透明のゲート越しにUIが透けて散らかるのを防ぐ＝評価UX・静かな入口）。
  document.body.classList.add('pre-start')

  let currentScene = initialScene
  let intensityLabelEl = null // 設定の「強さ」スライダーの名前（情景で変わる）
  let intensityRowEl = null // 「強さ」行（town3d等では効かないので隠す＝評価UX-H4）
  // 「強さ」が効くのは uIntensity を使うシェーダー情景（雨脚・陽炎・雲など）。3Dの街と実写の窓(photoWindow)は
  // uIntensity を持たず効かない＝隠す。特に実写の窓では「明るさ」という名で出ていて全体の「明るさ」と二重で紛らわしかった（評価UX-U5）。
  const intensityApplies = (s) => s && s.render !== 'town3d' && s.render !== 'photoWindow'
  function syncIntensityRow() {
    if (intensityRowEl) intensityRowEl.style.display = intensityApplies(currentScene) ? '' : 'none'
  }

  // ── 起動ゲート（iOS自動再生対策） ──
  const gate = h('div', 'gate')
  // キーボード・支援技術でも始められるように、ボタンとして振る舞わせる
  gate.setAttribute('role', 'button')
  gate.setAttribute('tabindex', '0')
  gate.setAttribute('aria-label', '眺めて、整う。画面にふれて始める')
  gate.appendChild(h('p', 'gate__title', '眺めて、整う'))
  gate.appendChild(h('p', 'gate__lead', '画面にふれて始める'))
  // 機能予告: 立体の街では窓をあけて空へ出られる＝主役機能を起動前にそっと知らせる（評価UX/プロデューサー: 第一印象で発見されにくい）。
  if (currentScene.render === 'town3d') gate.appendChild(h('p', 'gate__teaser', '窓をあけて、空へ出られます'))
  root.appendChild(gate)
  let gateStarted = false
  async function startExperience() {
    if (gateStarted) return
    gateStarted = true
    document.body.classList.remove('pre-start') // 開始でHUD/ボタンが静かに現れる
    gate.classList.add('gate--hide')
    setTimeout(() => gate.remove(), 800)
    try {
      await onAudioStart()
    } catch {
      /* 音が出せなくても体験は続行 */
    }
    poke()
    maybeShowLookHint()
  }
  gate.addEventListener('click', startExperience)
  gate.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      startExperience()
    }
  })
  // 起動時に入口へフォーカス（キーボードでそのまま開始できる）
  requestAnimationFrame(() => gate.focus())

  // 見回せる情景（窓辺シリーズ）だけでヒントを出す
  const LOOKABLE = ['cornerRoom', 'windowTown', 'windowMountains', 'windowSea', 'windowPano', 'town3d', 'photoWindow']
  // 初回のみ: 「見回せる」ことをそっと伝える（localStorageで2回目以降は出さない）
  function maybeShowLookHint(force) {
    if (!LOOKABLE.includes(currentScene.render)) return // 見回せない情景では出さない
    if (!force) { // force=タップで「もう一度みる」＝一度きりの制限を無視して再表示（UX監督D1: 窓辺のヒントが二度と出ない問題の解消）
      try {
        if (localStorage.getItem('seasons_look_hint')) return
      } catch {
        /* localStorage不可でも続行 */
      }
    }
    const hint = h('div', 'lookhint')
    // 操作に加え、目玉の「時間の移ろい」を静かに予告＝ぼーっと眺める人が変化に気づく前に閉じないように（評価エモ）。
    hint.innerHTML = '指でなぞって見渡す　／　窓をあける<br><span class="lookhint__sub">しばらく眺めると、陽が傾きます</span>'
    root.appendChild(hint)
    requestAnimationFrame(() => hint.classList.add('lookhint--show'))
    const dismiss = () => {
      hint.classList.remove('lookhint--show')
      setTimeout(() => hint.remove(), 1400)
    }
    const timer = setTimeout(dismiss, 4600)
    // パネルを開く等で触れたら、ヒントはそっと消す（ギャラリーに被らない＝評価UX）。
    window.addEventListener('pointerdown', () => { clearTimeout(timer); dismiss() }, { once: true, passive: true })
    if (!force) {
      try {
        localStorage.setItem('seasons_look_hint', '1')
      } catch {
        /* 無視 */
      }
    }
  }

  // ── 情景名トースト（情景を替えた時だけそっと現れ、数秒で静かに消える＝常時表示の主張を抑える） ──
  const hud = h('div', 'hud')
  const sceneName = h('p', 'hud__scene', currentScene.label)
  sceneName.setAttribute('aria-live', 'polite') // 情景の切替を支援技術へ伝える
  sceneName.setAttribute('role', 'status')
  hud.appendChild(sceneName)
  root.appendChild(hud)
  // 音(♪/音量)は設定パネルへ集約。ここで生成し、設定パネル構築時に差し込む。
  const muteBtn = h('button', 'iconbtn', settings.muted ? '♪̸' : '♪')
  muteBtn.setAttribute('aria-label', '音のオン・オフ')
  const vol = h('input', 'slider slider--vol')
  vol.setAttribute('aria-label', '音量')
  vol.type = 'range'
  vol.min = '0'
  vol.max = '1'
  vol.step = '0.01'
  vol.value = String(settings.volume)
  muteBtn.addEventListener('click', () => {
    settings.muted = !settings.muted
    muteBtn.textContent = settings.muted ? '♪̸' : '♪'
    onToggleMute(settings.muted)
    poke()
  })
  vol.addEventListener('input', () => {
    onVolume(parseFloat(vol.value))
    poke()
  })
  // トースト表示（情景切替時に呼ぶ）。表示→数秒後に静かに消える。
  let sceneToastT = null
  const showSceneToast = () => {
    hud.classList.add('hud--show')
    if (sceneToastT) clearTimeout(sceneToastT)
    sceneToastT = setTimeout(() => hud.classList.remove('hud--show'), 3400)
  }
  showSceneToast() // 起動情景を一度知らせる

  // ── 右上のボタン（情景・設定を開く） ──
  const topbar = h('div', 'topbar')
  const sceneBtn = h('button', 'iconbtn', '情景')
  const setBtn = h('button', 'iconbtn', '設定')
  const photoBtn = h('button', 'iconbtn', '写真')
  photoBtn.setAttribute('aria-label', 'この眺めをとどめる（UIを消す）')
  topbar.appendChild(sceneBtn)
  topbar.appendChild(setBtn)
  topbar.appendChild(photoBtn)
  root.appendChild(topbar)
  // 写真モード: UIを一瞬で消して「この眺めをとどめる」。端末のスクリーンショットで保存できる
  // （canvasのtoDataURLだとCSSの水彩グレードが抜けて甘くなる＝端末撮影が最良。サウンド/プロデュース監督F4）。画面に触れると操作が戻る。
  photoBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    clearTimeout(idleTimer); document.body.classList.add('idle')
    const hint = h('div', 'lookhint')
    hint.innerHTML = 'そのまま、画面を保存できます<br><span class="lookhint__sub">画面に触れると操作が戻ります</span>'
    root.appendChild(hint)
    requestAnimationFrame(() => hint.classList.add('lookhint--show'))
    const fade = () => { hint.classList.remove('lookhint--show'); setTimeout(() => hint.remove(), 1200) }
    const tmr = setTimeout(fade, 2800)
    window.addEventListener('pointerdown', () => { clearTimeout(tmr); fade() }, { once: true, passive: true }) // 次に触れたら案内を消す（操作はpokeでidle解除＝UIが戻る）
  })

  // ── 窓をあける/しめる＋身を乗り出す（窓辺の情景でだけ） ──
  const WINDOW_SCENES = ['cornerRoom', 'windowTown', 'shishigaya', 'windowSea', 'windowMountains', 'kitateraoRooftop', 'town3d', 'photoWindow']
  // 主ボタンを段階化: 「次の一歩」(stageBtn)＋「もどる」(backBtn)の2つに集約。
  // 窓をあける → 乗り出す → 空へ → おりる(歩く) と一歩ずつ前進。逆はもどるで一歩ずつ。
  const stageBtn = h('button', 'iconbtn iconbtn--stage', '窓をあける') // 次の一歩（前進）
  const backBtn = h('button', 'iconbtn iconbtn--back', 'もどる')        // 一歩もどる
  topbar.insertBefore(stageBtn, sceneBtn)
  topbar.insertBefore(backBtn, sceneBtn)
  const modePill = h('button', 'modepill', '') // いまの居場所（空/地上＋エリア名）をそっと表示。タップで操作ヒントを再表示
  modePill.setAttribute('aria-label', '操作のヒントをもう一度みる')
  modePill.addEventListener('click', () => { if (aloft) { if (onShowHint) onShowHint() } else { maybeShowLookHint(true) } poke() }) // 迷ったら押すと案内が戻る（窓辺=見回し/窓あけ、空・地上=操舵ヒント）
  root.appendChild(modePill)
  // 段階表示（●○○○）: 立体の街の旅「窓をあける→乗り出す→空へ→地上」のどこまで来たかを点で示す＝stageBtnが何段あるか分かる（評価UX）。
  const stageDots = h('div', 'stagedots')
  stageDots.setAttribute('aria-hidden', 'true') // 視覚補助。意味はstageBtnのラベルが担う
  for (let i = 0; i < 4; i++) stageDots.appendChild(h('span', 'stagedots__d'))
  root.appendChild(stageDots)
  let windowIsOpen = false
  let leanIsOut = false
  let aloft = null // null=窓辺 / 'fly'=空を飛ぶ / 'walk'=地上を歩く
  let currentLoc = '' // いまの居場所（現代の街/江戸の城下町/雲海 等）＝飛行中に迷子にならない
  function isRoof() {
    return currentScene.render === 'kitateraoRooftop'
  }
  function canFly() {
    return !!(isFlyable && isFlyable())
  }
  // 屋上（開けた眺め）は「かすみを払う/戻す」、窓辺は「窓をあける/しめる」
  const openLabel = () => (isRoof() ? 'かすみを払う' : '窓をあける')
  const closeLabel = () => (isRoof() ? 'かすみへ戻す' : '窓をしめる')
  // 次の前進ステップのラベル（null=これ以上は進めない＝ボタンを隠す）
  function stageLabel() {
    if (!windowIsOpen) return openLabel()
    if (!isRoof() && !leanIsOut && !aloft) return '乗り出す'
    if (canFly() && !aloft) return '空へ'
    if (aloft === 'fly') return '地上へ' // 飛行→着地して歩く（「おりる」は窓を閉じると紛らわしい→「空へ」と対称に・評価UX）
    if (aloft === 'walk') return '空へ' // 歩行→また飛ぶ
    return null
  }
  // もどる一歩のラベル（null=もどる先がない＝隠す）
  function backLabel() {
    if (aloft) return '窓辺へ'
    if (leanIsOut) return 'もどる'
    if (windowIsOpen) return closeLabel()
    return null
  }
  // 操作ヒントは town3d エンジン側の案内（画面内のスティック/ドラッグ位置に合わせた正確な文言＝
  // 飛行「ドラッグで進む・すすむ/とまる」、歩行「左で歩く・右で見まわす」）に一本化。
  // 以前ここにあった walk-hint は「上=上昇 下=下降」と実装(高さは↑↓ボタン・縦ドラッグは見回し)に反する
  // 誤記＋二重表示だったため撤去（評価UX: 操作ヒント一本化・縦反転誤記修正）。
  function stopAloft() {
    if (aloft) { aloft = null; onToggleFly && onToggleFly(false) } // 空/地上から窓辺へ戻す
  }
  function updateWindowBtn() {
    const show = WINDOW_SCENES.includes(currentScene.render)
    if (!canFly() && (aloft === 'fly' || aloft === 'walk')) { aloft = null; onToggleFly && onToggleFly(false) } // 情景が変わったら畳む
    if (!show) {
      if (windowIsOpen) { windowIsOpen = false; onToggleWindow && onToggleWindow(false) }
      if (leanIsOut) { leanIsOut = false; onToggleLean && onToggleLean(false) }
    }
    const sl = show ? stageLabel() : null
    const bl = show ? backLabel() : null
    stageBtn.style.display = sl ? '' : 'none'; if (sl) stageBtn.textContent = sl
    backBtn.style.display = bl ? '' : 'none'; if (bl) backBtn.textContent = bl
    stageBtn.classList.toggle('is-aloft', !!aloft) // 空/地上は空色寄りの強調
    // モード表示（空/地上のときだけ、いまの居場所＝モード＋エリア名をそっと）
    const mode = aloft === 'fly' ? '空を飛ぶ' : aloft === 'walk' ? '地上を歩く' : ''
    modePill.textContent = mode + (mode && currentLoc ? '　' + currentLoc : '')
    modePill.classList.toggle('modepill--on', !!mode)
    // 段階表示（●○○○）: 空まで飛べる立体の街でだけ、旅の進み具合を点で示す。屋上/非対応情景では隠す。
    const journey = show && canFly() && !isRoof()
    stageDots.classList.toggle('stagedots--on', journey)
    if (journey) {
      const pos = aloft ? 3 : leanIsOut ? 2 : windowIsOpen ? 1 : 0 // 窓辺→窓あけ→乗り出し→空/地上
      const ds = stageDots.children
      for (let i = 0; i < ds.length; i++) ds[i].classList.toggle('is-on', i <= pos)
    }
  }
  function advance() {
    if (!windowIsOpen) { windowIsOpen = true; onToggleWindow && onToggleWindow(true) }
    else if (!isRoof() && !leanIsOut && !aloft) { leanIsOut = true; onToggleLean && onToggleLean(true) }
    else if (canFly() && !aloft) { aloft = 'fly'; windowIsOpen = true; leanIsOut = true; onToggleFly && onToggleFly(true) } // 操作案内はエンジン側ctrlHintが出す（一本化）
    else if (aloft === 'fly') { aloft = 'walk'; onToggleLand && onToggleLand(true) }
    else if (aloft === 'walk') { aloft = 'fly'; onToggleLand && onToggleLand(false) }
    updateWindowBtn()
    poke()
  }
  function regress() {
    if (aloft) stopAloft() // 空/地上→窓辺
    else if (leanIsOut) { leanIsOut = false; onToggleLean && onToggleLean(false) } // 乗り出し→窓辺
    else if (windowIsOpen) { windowIsOpen = false; onToggleWindow && onToggleWindow(false) } // 窓開→窓閉
    updateWindowBtn()
    poke()
  }
  stageBtn.addEventListener('click', advance)
  backBtn.addEventListener('click', regress)
  updateWindowBtn() // 初期表示（窓辺・屋上の情景でだけ出す）

  // ── 情景選択パネル ──
  const panelScene = buildScenePanel()
  root.appendChild(panelScene.el)
  sceneBtn.addEventListener('click', () => {
    panelScene.open()
    poke()
  })

  // ── 通い帳パネル（訪れた窓辺・過ごした時間・立ち会ったまれな現象） ──
  const panelJournal = buildJournalPanel()
  root.appendChild(panelJournal.el)

  // ── この作品について（素材の出典・ライセンス。CC BY/BY-SA素材を配信物の中で帰属する） ──
  const panelCredits = buildCreditsPanel()
  root.appendChild(panelCredits.el)

  // ── 設定パネル ──
  // おやすみの選択はこの画面の中だけで持つ（設定に書くと、ほかの保存に乗って残り、開き直すと点いているのにタイマーが動いていなかった・D8）
  let sleepSel = 0
  let syncSleepChips = () => {}
  let syncTiltChip = () => {}
  const panelSet = buildSettingsPanel()
  root.appendChild(panelSet.el)
  setBtn.addEventListener('click', () => {
    panelSet.el.classList.add('panel--open')
    const c = panelSet.el.querySelector('.panel__head .iconbtn')
    if (c) requestAnimationFrame(() => c.focus()) // 開いたらパネル内へフォーカス（キーボード操作）
    poke()
  })

  // Escape でどのパネルも閉じる（キーボード・支援技術への配慮）
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    let closed = false
    ;[panelScene.el, panelSet.el, panelJournal.el, panelCredits.el].forEach((p) => {
      if (p.classList.contains('panel--open')) {
        p.classList.remove('panel--open')
        closed = true
      }
    })
    if (closed) poke()
  })

  // ── 無操作で消えるHUD ──
  let idleTimer = 0
  function anyPanelOpen() {
    return (
      panelScene.el.classList.contains('panel--open') ||
      panelSet.el.classList.contains('panel--open')
    )
  }
  function poke() {
    document.body.classList.remove('idle')
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (!anyPanelOpen()) document.body.classList.add('idle')
    }, 3500)
  }
  ;['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, poke, { passive: true }),
  )
  poke()

  // ── 通い帳パネル：訪れた窓辺・過ごした時間・立ち会ったまれな現象を静かに振り返る（達成でなく記録） ──
  function buildJournalPanel() {
    const el = h('div', 'panel panel--journal')
    const head = h('div', 'panel__head')
    head.appendChild(h('h2', 'panel__title', '通い帳'))
    const close = h('button', 'iconbtn', '×')
    close.setAttribute('aria-label', '閉じる')
    head.appendChild(close)
    el.appendChild(head)
    const bodyEl = h('div', 'journal')
    el.appendChild(bodyEl)
    close.addEventListener('click', () => { el.classList.remove('panel--open'); poke() })
    const BASE = import.meta.env.BASE_URL || '/'
    const fmtDur = (sec) => {
      const m = Math.floor((sec || 0) / 60)
      if (m < 60) return `${m}分`
      const hh = Math.floor(m / 60); const mm = m % 60
      return mm ? `${hh}時間${mm}分` : `${hh}時間`
    }
    function render() {
      bodyEl.replaceChildren()
      const j = (getJournal && getJournal()) || { visits: {}, seen: {}, seconds: 0, events: {}, firstAt: null }
      // 並びは「出会った順」だけ（回数や順位は出さない＝集める強迫を生まないため）。
      const seenMap = (j.seen && Object.keys(j.seen).length) ? j.seen : (j.visits || {})
      const seenIds = Object.keys(seenMap).filter((id) => SCENES.some((s) => s.id === id))
      const lead = h('p', 'journal__lead')
      if (!j.firstAt || !seenIds.length) {
        lead.textContent = 'まだ記録がありません。窓辺に座ると、静かに溜まっていきます。'
      } else {
        const days = Math.max(1, Math.round((Date.now() - j.firstAt) / 86400000))
        lead.textContent = `はじめての窓辺から ${days}日。これまでに ${fmtDur(j.seconds)}、眺めました。`
      }
      bodyEl.appendChild(lead)
      if (seenIds.length) {
        const gi = (id) => SCENES.findIndex((s) => s.id === id)
        seenIds.sort((a, b) => ((seenMap[a] || 0) - (seenMap[b] || 0)) || (gi(a) - gi(b))) // 出会った順（同時刻は情景の並び順）
        const grid = h('div', 'journal__grid')
        for (const id of seenIds) {
          const sc = SCENES.find((s) => s.id === id)
          const cell = h('div', 'journal__cell')
          const sw = h('span', 'journal__thumb')
          const pal = sc.palette.early
          sw.style.backgroundImage = `url("${BASE}thumbs/${id}.jpg"), linear-gradient(165deg, ${pal.skyTop}, ${pal.horizon})`
          cell.appendChild(sw)
          cell.appendChild(h('span', 'journal__name', sc.label))
          grid.appendChild(cell)
        }
        bodyEl.appendChild(grid)
      }
      // 絵日記: 立ち会った景色を、その日の出来事として日付とともに静かに（達成でなく記録・最近のページだけ）。
      const entries = Array.isArray(j.entries) ? j.entries : []
      if (entries.length) {
        const diary = h('div', 'journal__diary')
        diary.appendChild(h('p', 'journal__diary-head', '絵日記'))
        for (const e of entries.slice(-12)) diary.appendChild(h('p', 'journal__entry', e.text)) // 最近の数ページだけ（古いものは朧げに消えてよい）
        bodyEl.appendChild(diary)
      } else {
        // 旧データの保険: entries が無くても、立ち会えた景色の名だけは静かに（回数は出さない）。
        const ev = j.events || {}
        const seenEv = [['rainbow', '虹'], ['star', '流れ星'], ['fireworks', '花火'], ['aurora', 'オーロラ']]
          .filter(([k]) => ev[k] > 0).map(([, label]) => label)
        if (seenEv.length) bodyEl.appendChild(h('p', 'journal__events', '立ち会った景色　' + seenEv.join('、')))
      }
    }
    return {
      el,
      open() { render(); el.classList.add('panel--open'); requestAnimationFrame(() => close.focus()) },
    }
  }

  // ── この作品について：素材の出典・ライセンスを配信物の中で帰属表示する（CC BY/BY-SA遵守） ──
  function buildCreditsPanel() {
    const el = h('div', 'panel panel--credits')
    const head = h('div', 'panel__head')
    head.appendChild(h('h2', 'panel__title', 'この作品について'))
    const close = h('button', 'iconbtn', '×')
    close.setAttribute('aria-label', '閉じる')
    head.appendChild(close)
    el.appendChild(head)
    const bodyEl = h('div', 'credits')
    el.appendChild(bodyEl)
    close.addEventListener('click', () => { el.classList.remove('panel--open'); poke() })

    bodyEl.appendChild(h('p', 'credits__lead', CREDIT_INTRO))
    const section = (title, items) => {
      bodyEl.appendChild(h('h3', 'credits__group', title))
      const list = h('ul', 'credits__list')
      for (const it of items) {
        const li = h('li', 'credits__item')
        li.appendChild(h('span', 'credits__note', it.note))
        const t = h('span', 'credits__title', it.title)
        li.appendChild(t)
        li.appendChild(h('span', 'credits__by', `${it.by}　／　${it.license}`))
        if (it.url) {
          const a = h('a', 'credits__link', '出典を見る')
          a.href = it.url
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          li.appendChild(a)
        }
        list.appendChild(li)
      }
      bodyEl.appendChild(list)
    }
    section('環境音', CREDIT_SOUNDS)
    section('窓の外の絵', CREDIT_IMAGES)
    section('描画・道具', CREDIT_TOOLS)
    bodyEl.appendChild(h('p', 'credits__outro', CREDIT_OUTRO))

    return {
      el,
      open() { el.classList.add('panel--open'); requestAnimationFrame(() => close.focus()) },
    }
  }

  // ── 情景パネル：実装済みの情景をカード一覧で直接選ぶ ──
  function buildScenePanel() {
    const el = h('div', 'panel panel--scene')
    const head = h('div', 'panel__head')
    head.appendChild(h('h2', 'panel__title', '情景を選ぶ'))
    const nowBtn = h('button', 'iconbtn nowbtn', 'いま')
    nowBtn.setAttribute('aria-label', '今の季節と時刻に合う窓辺')
    head.appendChild(nowBtn)
    // 通い帳を独立入口へ（設定の奥4階層から、いちばん開かれる「情景」の隣へ昇格）。
    const journalEntry = h('button', 'iconbtn nowbtn', '通い帳')
    journalEntry.setAttribute('aria-label', 'これまでの窓辺の記録（通い帳）')
    journalEntry.addEventListener('click', () => { el.classList.remove('panel--open'); panelJournal.open(); poke() })
    head.appendChild(journalEntry)
    const close = h('button', 'iconbtn', '×')
    close.setAttribute('aria-label', '閉じる')
    head.appendChild(close)
    el.appendChild(head)

    // 季節で絞り込むフィルタ（30以上の情景から「選ぶ」を助ける。器=scene.axes.season）。
    const filterBar = h('div', 'gallery-filter')
    const SEASONS = [['all', 'すべて'], ['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']]
    let activeSeason = 'all'
    const filterChips = []
    for (const [key, jlabel] of SEASONS) {
      const chip = h('button', 'chip', jlabel)
      if (key === 'all') chip.classList.add('chip--on')
      chip.addEventListener('click', () => {
        activeSeason = key
        filterChips.forEach((c) => c.el.classList.toggle('chip--on', c.key === key))
        applyFilter()
        poke()
      })
      filterChips.push({ key, el: chip })
      filterBar.appendChild(chip)
    }
    el.appendChild(filterBar)

    const gallery = h('div', 'gallery')
    el.appendChild(gallery)

    // 公開する情景だけ（実証/開発用は public:false で隠す）
    const devMode = /[?&]dev=1/.test(location.search)
    const BASE = import.meta.env.BASE_URL || '/'
    const pubScenes = SCENES.filter((s) => s.status === 'ready' && (s.public !== false || devMode))

    // ── 「場所」ごとに束ねる二階層のギャラリー（実機FB: 情景が多すぎて特徴が分からない） ──
    // 入口は「場所」の数だけ（約5〜6）。場所を開くと、その場所の季節・天気・時間ちがいの窓辺が並ぶ。
    // 情景が増えても入口は増えない＝「広がりすぎ」の見通しを取り戻す。器（データ）はそのまま非破壊。
    const PLACES = [
      { key: 'kitaterao', label: '北寺尾の坂の街', desc: '立体の坂の街を窓辺から。飛んで歩いて巡れる',
        flagship: 'kitaterao-window-3d', test: (s) => s.render === 'town3d' && s.town3dKind !== 'corner' && s.id.startsWith('kitaterao') },
      { key: 'shishigaya', label: '獅子ヶ谷の谷戸', desc: '谷あいの棚田と茅葺き、ふるさとの窓辺',
        flagship: 'shishigaya-window-3d', test: (s) => s.render === 'town3d' && s.town3dKind !== 'corner' && s.id.startsWith('shishigaya') },
      { key: 'corner', label: '高台の角部屋', desc: '二面採光の角部屋から、街を広く見渡す',
        flagship: 'autumn-dusk-corner-room', test: (s) => s.render === 'town3d' && s.town3dKind === 'corner' },
      { key: 'rain', label: '雨の窓', desc: 'ガラスをつたう雨だれ、にじむ街あかり',
        flagship: 'summer-rain-dusk', test: (s) => s.render === 'rainGlass' },
      { key: 'nature', label: '海辺と山あい', desc: '波の音、朝もやの谷。旅先の窓辺',
        flagship: 'summer-dusk-seaside', test: (s) => s.render === 'windowSea' || s.render === 'windowMountains' },
      { key: 'photo', label: '実写の窓', desc: '写真が主役の、いちばん本物に近い窓',
        flagship: 'photo-window-town', test: (s) => s.render === 'photoWindow' },
      { key: 'etc', label: 'その他の窓辺', desc: '実証・開発用', test: () => true }, // 上のどれにも入らない残り（通常は空。dev時のみ）
    ]
    // 各場所に属する情景を集める（1情景は最初に一致した場所へ）。旗艦を先頭に。
    const placedIds = new Set()
    const placeList = []
    for (const p of PLACES) {
      const scenes = pubScenes.filter((s) => !placedIds.has(s.id) && p.test(s))
      if (!scenes.length) continue
      scenes.forEach((s) => placedIds.add(s.id))
      scenes.sort((a, b) => (a.id === p.flagship ? -1 : b.id === p.flagship ? 1 : 0))
      placeList.push({ ...p, scenes })
    }

    let cards = []          // いま描画中のカード（フィルタ/現在地表示の対象）
    let level = 'places'    // 'places'=場所一覧 / 'scenes'=ある場所の中
    // カードの見た目（サムネ＋見出し＋説明）。場所カードも情景カードも同じ体裁。
    function cardEl(scene, label, desc, count) {
      const card = h('button', 'scene-card')
      const sw = h('span', 'scene-card__swatch')
      const pal = scene.palette.early
      const grad = `linear-gradient(165deg, ${pal.skyTop}, ${pal.skyMid} 55%, ${pal.horizon})`
      sw.style.backgroundImage = `url("${BASE}thumbs/${scene.id}.jpg"), ${grad}` // 実描画サムネ→無ければパレット
      const body = h('span', 'scene-card__body')
      body.appendChild(h('span', 'scene-card__label', label))
      if (count) body.appendChild(h('span', 'scene-card__count', count)) // 場所のカードの眺めの数（説明の切り詰めで消えないよう別の行に・V55）
      body.appendChild(h('span', 'scene-card__desc', desc || ''))
      card.appendChild(sw); card.appendChild(body)
      return card
    }
    // 場所一覧を描く（第一階層）。
    function renderPlaces() {
      level = 'places'; gallery.textContent = ''; cards = []
      for (const p of placeList) {
        const flag = p.scenes.find((s) => s.id === p.flagship) || p.scenes[0]
        const card = cardEl(flag, p.label, p.desc, `${p.scenes.length}つの眺め`)
        card.addEventListener('click', () => { renderScenes(p); poke() })
        gallery.appendChild(card)
        cards.push({ id: 'place:' + p.key, card, season: '', sceneIds: p.scenes.map((s) => s.id) })
      }
      applyFilter(); markCurrent()
    }
    // ある場所の中（季節・天気・時間ちがい）を描く（第二階層）。
    function renderScenes(p) {
      level = 'scenes'; gallery.textContent = ''; cards = []
      const back = h('button', 'gallery__back', `← ${p.label}をとじる`)
      back.setAttribute('aria-label', '場所の一覧へ戻る')
      back.addEventListener('click', () => { renderPlaces(); poke() })
      gallery.appendChild(back)
      for (const scene of p.scenes) {
        const card = cardEl(scene, scene.label, scene.desc || '')
        card.addEventListener('click', () => selectScene(scene))
        gallery.appendChild(card)
        cards.push({ id: scene.id, card, season: (scene.axes && scene.axes.season) || '' })
      }
      applyFilter(); markCurrent()
    }
    // 季節フィルタの適用（両階層共通）。場所カードは「その季節の眺めを持つ場所」だけ残す。
    function applyFilter() {
      cards.forEach((c) => {
        let show = true
        if (activeSeason !== 'all') {
          if (c.sceneIds) show = c.sceneIds.some((id) => { const s = pubScenes.find((x) => x.id === id); return s && s.axes && s.axes.season === activeSeason })
          else show = c.season === activeSeason
        }
        c.card.style.display = show ? '' : 'none'
      })
    }

    function markCurrent() {
      cards.forEach((c) => {
        const on = c.sceneIds ? c.sceneIds.includes(currentScene.id) : c.id === currentScene.id // 場所カードは現在地の場所を淡く点灯
        c.card.classList.toggle('scene-card--on', on)
        c.card.setAttribute('aria-pressed', String(on)) // 選択中を支援技術へ（評価 a11y）
      })
    }
    renderPlaces() // 初期表示は場所一覧

    function selectScene(scene) {
      if (scene && scene.id !== currentScene.id) {
        currentScene = scene
        sceneName.textContent = scene.label
        showSceneToast()
        if (intensityLabelEl) intensityLabelEl.textContent = scene.intensityLabel || '強さ'
        onApplyScene(scene)
        markCurrent()
        updateWindowBtn()
        syncIntensityRow() // 情景に応じて「強さ」行を出し分け
      }
      el.classList.remove('panel--open')
      poke()
    }

    nowBtn.addEventListener('click', () => selectScene(pickNowScene()))

    close.addEventListener('click', () => {
      el.classList.remove('panel--open')
      poke()
    })

    return {
      el,
      open() {
        renderPlaces() // 開くたび「場所一覧」から始める（前回途中の場所で閉じても迷子にならない）
        el.classList.add('panel--open')
        requestAnimationFrame(() => {
          close.focus({ preventScroll: true }) // 開いたらパネル内へフォーカス（スクロールはカードへ譲る）
          // いま見ている情景を含む「場所」のカードを画面内へ＝開いた瞬間に「自分の居場所」が分かる（評価UX）
          const cur = cards.find((c) => (c.sceneIds ? c.sceneIds.includes(currentScene.id) : c.id === currentScene.id))
          if (cur && cur.card.scrollIntoView) cur.card.scrollIntoView({ block: 'center', behavior: 'auto' })
        })
      },
    }
  }

  // ── 設定パネルの中身 ──
  function buildSettingsPanel() {
    const el = h('div', 'panel panel--set')
    const head = h('div', 'panel__head')
    head.appendChild(h('h2', 'panel__title', '設定'))
    const close = h('button', 'iconbtn', '×')
    head.appendChild(close)
    el.appendChild(head)

    // 設定系（眺める/操作）と閲覧系（ふりかえり）を見出しで区切る＝物置感を解消（評価UX-U4）。
    el.appendChild(h('div', 'panel__section', '眺める'))

    // 音（♪オンオフ＋音量）。常時表示のスライダーを設定へ集約＝画面はただ眺める一枚に。
    const audioSetRow = h('div', 'setrow')
    audioSetRow.appendChild(h('span', 'setrow__label', '音'))
    const audioCtrls = h('div', 'hud__audio')
    audioCtrls.appendChild(muteBtn)
    audioCtrls.appendChild(vol)
    audioSetRow.appendChild(audioCtrls)
    el.appendChild(audioSetRow)

    const intensityRow = makeSlider(
      currentScene.intensityLabel || '強さ',
      0,
      1,
      0.01,
      settings.rain,
      (v) => {
        settings.rain = v
        onSettings({ rain: v })
      },
    )
    intensityLabelEl = intensityRow.querySelector('.setrow__label')
    intensityRowEl = intensityRow
    el.appendChild(intensityRow)
    el.appendChild(
      makeSlider('明るさ', 0.7, 1.3, 0.01, settings.brightness, (v) => {
        settings.brightness = v
        onSettings({ brightness: v })
      }, true), // 中央=標準のティックを出す（向きの目安＝評価UX-H4）
    )
    syncIntensityRow() // 起動情景に応じて「強さ」行の出し分け

    const qRow = h('div', 'setrow')
    qRow.appendChild(h('span', 'setrow__label', '描き込み'))
    const qChips = h('div', 'axis__chips')
    const QUALS = [
      { id: 'soft', label: 'こまやか' },
      { id: 'standard', label: 'ふつう' },
      { id: 'light', label: '軽やか' },
    ]
    const qEls = []
    QUALS.forEach((q) => {
      const chip = h('button', 'chip', q.label)
      chip.classList.toggle('chip--on', settings.quality === q.id)
      chip.addEventListener('click', () => {
        settings.quality = q.id
        qEls.forEach((e) => e.chip.classList.toggle('chip--on', e.id === q.id))
        onSettings({ quality: q.id })
        poke()
      })
      qChips.appendChild(chip)
      qEls.push({ id: q.id, chip })
    })
    qRow.appendChild(qChips)
    el.appendChild(qRow)

    // 傾きで見回す（既定オフ）
    const tiltRow = h('div', 'setrow')
    tiltRow.appendChild(h('span', 'setrow__label', '操作'))
    const tiltChips = h('div', 'axis__chips')
    const tiltBtn = h('button', 'chip', '傾きで見回す')
    tiltBtn.classList.toggle('chip--on', settings.tilt)
    syncTiltChip = (on) => { settings.tilt = !!on; tiltBtn.classList.toggle('chip--on', !!on) }
    tiltBtn.addEventListener('click', () => {
      settings.tilt = !settings.tilt
      tiltBtn.classList.toggle('chip--on', settings.tilt)
      onSettings({ tilt: settings.tilt })
      poke()
    })
    tiltChips.appendChild(tiltBtn)
    // 全画面（対応ブラウザのみ。没入のため画面いっぱいに）
    if (document.fullscreenEnabled) {
      const fsBtn = h('button', 'chip', '全画面')
      const syncFs = () => fsBtn.classList.toggle('chip--on', !!document.fullscreenElement)
      fsBtn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else document.documentElement.requestFullscreen().catch(() => {})
        poke()
      })
      document.addEventListener('fullscreenchange', syncFs)
      tiltChips.appendChild(fsBtn)
    }
    // 時間をとどめる（既定オフ＝ゆっくり日が移ろう。オンで今の時刻に静止）
    const stayBtn = h('button', 'chip', '時間をとどめる')
    stayBtn.classList.toggle('chip--on', settings.timeStay)
    stayBtn.addEventListener('click', () => {
      settings.timeStay = !settings.timeStay
      stayBtn.classList.toggle('chip--on', settings.timeStay)
      onSettings({ timeStay: settings.timeStay })
      poke()
    })
    tiltChips.appendChild(stayBtn)
    tiltRow.appendChild(tiltChips)
    el.appendChild(tiltRow)

    // おやすみタイマー：眺めているうちに、そっと暗くなって休む
    const sleepRow = h('div', 'setrow')
    sleepRow.appendChild(h('span', 'setrow__label', 'おやすみ'))
    const sleepChips = h('div', 'axis__chips')
    const SLEEPS = [
      { m: 0, label: 'なし' },
      { m: 15, label: '15分' },
      { m: 30, label: '30分' },
      { m: 60, label: '60分' },
    ]
    const sEls = []
    SLEEPS.forEach((s) => {
      const chip = h('button', 'chip', s.label)
      chip.classList.toggle('chip--on', sleepSel === s.m)
      chip.addEventListener('click', () => {
        sleepSel = s.m
        syncSleepChips()
        onSleepTimer && onSleepTimer(s.m)
        poke()
      })
      sleepChips.appendChild(chip)
      sEls.push({ m: s.m, chip })
    })
    syncSleepChips = () => sEls.forEach((e) => e.chip.classList.toggle('chip--on', e.m === sleepSel))
    sleepRow.appendChild(sleepChips)
    el.appendChild(sleepRow)

    // ── ここから閲覧系（ふりかえり）。設定の操作とは別カテゴリなので見出しで分ける。
    el.appendChild(h('div', 'panel__section', 'ふりかえり'))

    // 通い帳：訪れた窓辺・過ごした時間・立ち会ったまれな現象を静かに振り返る
    const journalRow = h('div', 'setrow')
    journalRow.appendChild(h('span', 'setrow__label', '記録'))
    const journalChips = h('div', 'axis__chips')
    const journalBtn = h('button', 'chip', '通い帳をひらく')
    journalBtn.addEventListener('click', () => {
      el.classList.remove('panel--open') // 設定を閉じて通い帳へ
      panelJournal.open()
      poke()
    })
    journalChips.appendChild(journalBtn)
    journalRow.appendChild(journalChips)
    el.appendChild(journalRow)

    // この作品について：素材の出典・ライセンス（配信物の中で帰属表示する）
    const aboutRow = h('div', 'setrow')
    aboutRow.appendChild(h('span', 'setrow__label', '出典'))
    const aboutChips = h('div', 'axis__chips')
    const aboutBtn = h('button', 'chip', 'この作品について')
    aboutBtn.addEventListener('click', () => {
      el.classList.remove('panel--open') // 設定を閉じてクレジットへ
      panelCredits.open()
      poke()
    })
    aboutChips.appendChild(aboutBtn)
    aboutRow.appendChild(aboutChips)
    el.appendChild(aboutRow)

    close.addEventListener('click', () => {
      el.classList.remove('panel--open')
      poke()
    })
    return { el }
  }

  function makeSlider(label, min, max, step, value, onInput, centered) {
    const row = h('div', 'setrow')
    row.appendChild(h('span', 'setrow__label', label))
    const input = h('input', centered ? 'slider slider--centered' : 'slider')
    input.setAttribute('aria-label', label) // 支援技術向けのラベル（評価 a11y）
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(value)
    input.addEventListener('input', () => {
      onInput(parseFloat(input.value))
      poke()
    })
    row.appendChild(input)
    return row
  }

  return {
    setSceneLabel(text) {
      sceneName.textContent = text
      showSceneToast()
    },
    // いまの居場所（現代の街/江戸の城下町/雲海 等）をモードピルに反映＝飛行中に迷子にならない。
    setLocation(name) {
      currentLoc = name || ''
      updateWindowBtn()
    },
    // おやすみの点灯を外から合わせる（暗転が終わってタイマーを使い切ったら「なし」へ）。
    setSleep(m) {
      sleepSel = m || 0
      syncSleepChips()
    },
    // 「傾きで見回す」の点灯を外から合わせる（許可が取れなかった時に消す）。
    setTilt(on) {
      syncTiltChip(on)
    },
    // 情景を替えたら窓は閉じた状態から（ボタン表示と描画のズレを防ぐ）。通知はしない。
    resetWindow() {
      windowIsOpen = false
      leanIsOut = false
      aloft = null // 空/地上からも畳む（情景切替で残らない）
      currentLoc = ''
      updateWindowBtn()
    },
  }
}
