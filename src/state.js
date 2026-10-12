// アプリの状態と保存（最後に選んだ情景＋設定を覚える程度）。
// localStorage が使えない環境でも落ちないようにする。

const KEY = 'seasons.state.v1'

// 初回だけ端末性能から初期品質を推定（非力な端末は軽く始めて第一印象の滑らかさを守る）。
// 一度でも品質を選んだ人＝保存値を尊重（ここは新規利用者のみに効く）。
// 方針=「鮮明さ優先」: capable端末は標準(鮮明)のまま始め、明確に非力な端末だけ軽量で始める。
// 重要: navigator.deviceMemory は iOS Safari では未提供（undefined）。旧コードの `mem||4 → mem<=3`
// は iOS で永遠に発火せず（4扱い）、逆に「不在＝非力」と決めつけると全iPhoneが降格して鮮明さを損なう。
// → deviceMemory は「取れた時だけ」低RAM判定に使い、不在を非力とみなさない。
// 旧型iPhone(A9/A10世代=iPhone 6s/7/SE1)等は論理コアが2で報告される＝ここで拾う。
// それ以外（熱いと感じる現行機を含む capable 端末）は標準を維持し、走行中の自動品質(curPR/renderScale)を
// 実測ベースの安全網にする（=先回りで眠くしない）。
function autoQuality() {
  try {
    const cores = navigator.hardwareConcurrency || 4
    const mem = navigator.deviceMemory // 一部ブラウザのみ（iOSは undefined）
    if (cores <= 2) return 'light' // 明確に非力（旧型スマホ）。論理コア2以下
    if (typeof mem === 'number' && mem <= 2) return 'light' // 低RAM端末（取れた時だけ・2GB以下）
    return 'standard' // 既定は標準（鮮明）。こまやか=soft は手動選択に委ねる
  } catch {
    return 'standard'
  }
}

const DEFAULTS = {
  sceneId: null, // null のときは DEFAULT_SCENE を使う
  sceneAt: 0, // 最後に情景を選んだ時刻(ms)。近いうちに開き直したら「昨日(さっき)の続き」へ戻す＝連続性（古ければ今の時刻の情景へ）
  settings: {
    rain: 0.65, // 雨脚 0..1
    brightness: 1.0, // 画面の明るさ 0.7..1.3
    quality: autoQuality(), // 'soft'(こまやか) | 'standard'(ふつう) | 'light'(軽やか)＝設定の画面の言葉に合わせる
    tilt: false, // 端末の傾きで見回す
    timeStay: false, // 時間をとどめる（時間帯の移ろいを止めて今の時刻に静止）
    muted: false,
    volume: 0.8, // 全体音量 0..1
  },
  version: 2, // 保存スキーマの版。構造を増やしたら上げて migrate() で前方互換を保つ（情景メニュー破壊の前科への備え）
  // 通い帳: 訪れた窓辺・過ごした時間・立ち会ったまれな現象を静かに記録（達成やバッジではなく、気づいたら溜まっている記録）。
  // 「回数」「順位」は意図して表に出さない＝集める強迫を生まないため。残すのは seen＝出会った順だけ。
  journal: {
    visits: {}, // { sceneId: 訪れた回数 }※互換のため残すが表示には使わない
    seen: {}, // { sceneId: 初めて出会った時刻ms }＝通い帳は「出会った順」に静かに増える
    seconds: 0, // 累計の眺めた秒数
    events: {}, // { rainbow|fireworks|star|aurora: 立ち会った回数 }※回数は表示しない（立ち会えた景色の名だけ）
    entries: [], // 絵日記の短い一行 [{ at, text }]。立ち会った景色を、その日の出来事として日付とともに静かに（達成でなく記録・最新だけ残す）
    firstAt: null, // 初めて窓辺に座った日時
  },
  // 世界の状態: 訪れた場所（時代エリア/雲海/祭り会場 等）を覚える器。
  // 「水平線の灯り（未訪の地だけ淡く灯る誘い）」など、死蔵された世界への導線に使う。達成度・到達率は出さない。
  worldState: {
    discovered: {}, // { 場所id: 初めて辿り着いた時刻ms }
    flags: {}, // 任意の小さな世界フラグ（季節の便りの既読など。今後の拡張用）
  },
}

// 旧版の保存値を現行スキーマへ寄せる（前方互換）。構造変更時はここに一段ずつ足す。
function migrate(parsed) {
  // v1→v2: 通い帳に seen（出会った順）が無い旧利用者へ、既訪の窓辺を引き継ぐ（時刻不明は firstAt に寄せる）。
  const j = parsed.journal
  if (j && j.visits && !j.seen) {
    const t = j.firstAt || Date.now()
    j.seen = {}
    for (const id of Object.keys(j.visits)) j.seen[id] = t
  }
  // v2: 絵日記 entries が無い旧利用者へ、これまでに立ち会った景色を日付なしの一行で引き継ぐ（古い記憶は朧げに）。
  if (j && j.events && !j.entries) {
    const phrase = { rainbow: '虹がでた。', star: '流れ星がながれた。', fireworks: '遠くで花火があがった。', aurora: '空に光のカーテンが揺れた。' }
    j.entries = Object.keys(j.events).filter((k) => j.events[k] > 0 && phrase[k]).map((k) => ({ at: j.firstAt || Date.now(), text: phrase[k] }))
  }
  return parsed
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULTS)
    const parsed = migrate(JSON.parse(raw))
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      version: DEFAULTS.version, // 版は常に現行へ（migrate 済み）
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      journal: {
        ...DEFAULTS.journal,
        ...(parsed.journal || {}),
        visits: { ...(parsed.journal && parsed.journal.visits) },
        seen: { ...(parsed.journal && parsed.journal.seen) },
        events: { ...(parsed.journal && parsed.journal.events) },
        entries: [...((parsed.journal && parsed.journal.entries) || [])],
      },
      worldState: {
        ...DEFAULTS.worldState,
        ...(parsed.worldState || {}),
        discovered: { ...(parsed.worldState && parsed.worldState.discovered) },
        flags: { ...(parsed.worldState && parsed.worldState.flags) },
      },
    }
  } catch {
    return structuredClone(DEFAULTS)
  }
}

const state = read()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // プライベートモード等では保存を諦める（動作は継続）
  }
}

export function getState() {
  return state
}

export function setScene(id) {
  state.sceneId = id
  state.sceneAt = Date.now() // 連続性の判定用＝最後に居た時刻
  persist()
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch)
  persist()
}

// ── 通い帳の記録（静かに溜める） ──
export function recordVisit(sceneId) {
  if (!sceneId) return
  const j = state.journal
  j.visits[sceneId] = (j.visits[sceneId] || 0) + 1
  if (!j.seen[sceneId]) j.seen[sceneId] = Date.now() // 出会った順（通い帳の並びはこれだけで決める）
  if (!j.firstAt) j.firstAt = Date.now()
  persist()
}
export function addViewSeconds(s) {
  state.journal.seconds = (state.journal.seconds || 0) + s
  persist()
}
export function recordEvent(kind) {
  if (!kind) return false
  const first = !(state.journal.events[kind] > 0) // この景色に立ち会うのが初めてか（絵日記には初回だけ静かに綴る＝連打で埋めない）
  state.journal.events[kind] = (state.journal.events[kind] || 0) + 1
  persist()
  return first
}
// 絵日記の一行を綴る（立ち会った景色を、その日の出来事として。最新40ページだけ静かに残す）。
export function addJournalEntry(text) {
  if (!text) return
  const e = state.journal.entries
  e.push({ at: Date.now(), text })
  if (e.length > 40) e.splice(0, e.length - 40)
  persist()
}

// ── 世界の状態（訪れた場所を覚える。未訪の地だけを灯す「水平線の標」に使う） ──
export function markDiscovered(id) {
  if (!id) return
  const w = state.worldState
  if (!w.discovered[id]) { w.discovered[id] = Date.now(); persist() } // 初めて辿り着いた時だけ記録（到達率や達成は出さない）
}
export function isDiscovered(id) {
  return !!(state.worldState && state.worldState.discovered && state.worldState.discovered[id])
}
export function getWorldState() {
  return state.worldState
}
