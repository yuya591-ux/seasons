// 残タスクの全数棚卸し — 抽出漏れの検査と、1件ずつのコードによる裏取り
//
//   node scripts/qa-backlog.mjs --count      出所ごとの「原文の件数 / 台帳の件数 / 差」
//   node scripts/qa-backlog.mjs --list       全項目とプローブ（どこを見れば判定できるか）の一覧
//   node scripts/qa-backlog.mjs              全件の判定（未対応 / 対応済み / 不要になった / 判定不能）
//   node scripts/qa-backlog.mjs --evidence   「対応済み」の根拠（ファイル:行 と その行の中身）
//
// 判定の考え方: 「そのタスクが要求している状態がコードに入っているか」を1件ずつ機械で見る。
// 文書どうしの読み比べはしない（3日前の棚卸しが既に3件古くなっていたため）。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const P = (p) => join(ROOT, p)
const TV = 'src/engine/town3dViewer.js'

const cache = new Map()
const readLines = (rel) => {
  if (cache.has(rel)) return cache.get(rel)
  const f = P(rel)
  const v = existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/) : null
  cache.set(rel, v)
  return v
}

// ── プローブの実行 ─────────────────────────────────────────────
// kind:'grep'   file の（任意で lines の範囲の）中を re で探す。hit なら hitV、miss なら missV。
// kind:'count'  file の中の re の出現数を数え、cmp で判定する。
// kind:'git'    git コマンドの出力で判定する。
// kind:'manual' 機械では判定できない。why に理由を書く。
const runProbe = (pr) => {
  if (pr.kind === 'manual') return { verdict: '判定不能', hits: [], note: pr.why }
  if (pr.kind === 'nofile') {
    const there = existsSync(P(pr.path))
    return { verdict: there ? pr.hitV : pr.missV, hits: [], note: `${pr.path} は ${there ? '在る' : '無い'}` }
  }
  if (pr.kind === 'fs') {
    const dir = P(pr.dir)
    if (!existsSync(dir)) return { verdict: '判定不能', hits: [], note: `ディレクトリが無い: ${pr.dir}` }
    const ents = readdirSync(dir)
    const n = pr.deep
      ? ents.reduce((a, e) => a + (statSync(join(dir, e)).isDirectory() ? readdirSync(join(dir, e)).length : 1), 0)
      : ents.length
    return { verdict: pr.cmp(n) ? pr.hitV : pr.missV, hits: [], note: `${pr.dir} の${pr.deep ? '中身の総数' : '直下の数'} = ${n}${pr.against ? ` （${pr.against}）` : ''}` }
  }
  if (pr.kind === 'git') {
    let out = ''
    try { out = execSync(pr.cmd, { cwd: ROOT, encoding: 'utf8' }).trim() } catch (e) { out = `（コマンド失敗: ${e.message.split('\n')[0]}）` }
    const n = out ? out.split('\n').filter(Boolean).length : 0
    return { verdict: n > 0 ? pr.hitV : pr.missV, hits: out ? [{ line: 0, text: out.split('\n')[0], n }] : [], note: `${pr.cmd} → ${n}行` }
  }
  const src = readLines(pr.file)
  if (!src) return { verdict: '判定不能', hits: [], note: `ファイルが無い: ${pr.file}` }
  const [a, b] = pr.lines || [1, src.length]
  const re = new RegExp(pr.re)
  const hits = []
  for (let i = a - 1; i < Math.min(b, src.length); i++) {
    if (re.test(src[i])) hits.push({ line: i + 1, text: src[i].trim().slice(0, 150) })
    if (hits.length >= 4 && pr.kind !== 'count') break
  }
  if (pr.kind === 'count') {
    let n = 0
    for (let i = a - 1; i < Math.min(b, src.length); i++) if (re.test(src[i])) n++
    const ok = pr.cmp(n, src.length)
    return { verdict: ok ? pr.hitV : pr.missV, hits: hits.slice(0, 3), note: `${pr.file} の該当 ${n}件（全${src.length}行）` }
  }
  return { verdict: hits.length ? pr.hitV : pr.missV, hits, note: `${pr.file}${pr.lines ? ` の ${a}〜${b}行` : ''} を /${pr.re}/ で探した → ${hits.length ? `${hits.length}件` : '0件'}` }
}

// 略記
const g = (file, re, hitV, missV, lines) => ({ kind: 'grep', file, re, hitV, missV, lines })
const M = (why) => ({ kind: 'manual', why })

// ── 全項目 ────────────────────────────────────────────────────
// no: raw.md の通番 ／ src: 出所 ／ t: 件名 ／ w: プローブが何を見るか ／ p: プローブ
const ITEMS = [
  { no: 1, src: 'A', t: '#169 実機での本番検証（性能・発熱・操作性・読み込み）', w: '実機の温感・バッテリーはコードに現れない', p: M('iPhone実機の発熱・体感は裕也さんの手作業でしか観測できない。机上で分かるのは描画コール・解像度・エラー数まで') },
  { no: 2, src: 'A', t: '#172 音の拡充：各シーンの環境音を豊かにする（薄いシーンの補強＋CC0新規）', w: '音素材の実ファイル数', p: { kind: 'fs', dir: 'public/audio', cmp: (n) => n >= 25, hitV: '対応済み', missV: '未対応', against: '情景は全25なので、実音源のある情景の数と比べる' } },
  { no: 3, src: 'A', t: '#232 ④-d モノリス分割（安全網を張った上での段階分割）', w: 'town3dViewer.js が単一の巨大ファイルのままか', p: { kind: 'count', file: TV, re: '.', hitV: '未対応', missV: '対応済み', cmp: (n, total) => total > 5000 } },
  { no: 4, src: 'A', t: '#244 [P3] 二重WebGLコンテキスト解放（town3d中に#sceneをlose）', w: 'WEBGL_lose_context を呼ぶ箇所があるか', p: g('src/main.js', 'loseContext', '対応済み', '未対応') },
  { no: 5, src: 'A', t: '#260 B5/B6 観覧車の作り直し・建物の脱ローポリ', w: '建物LODの実装があるか（#260の中核）', p: g(TV, 'buildLOD|建物LOD|LOD段階', '対応済み', '未対応') },
  { no: 6, src: 'A', t: '#270 到達設計②: 行き先プレビュー＋渡しショートカット', w: '行き先プレビュー／ワープの導線があるか', p: g('src/main.js', '行き先|プレビュー|ショートカット', '対応済み', '未対応') },
  { no: 7, src: 'A', t: '#276 エリア磨き(戦国/大正/谷戸/雲上/江戸)', w: '「商品レベルか」は絵の主観判断', p: M('磨きの完了条件が「商品レベル」という主観。コードの有無では判定できない。2026-07-28の棚卸しで「既に商品レベル・優先度は落とす」と判断済み') },
  { no: 8, src: 'A', t: '#277 歩行の迷子解消', w: '歩行中の道しるべ・行き先表示があるか', p: g(TV, '道しるべ|walkGuide|歩行.*行き先の案内', '対応済み', '未対応') },
  { no: 9, src: 'A', t: '#279 角部屋の見回しを真の3D視差へ', w: '角部屋が3Dの街として作られているか（#259で載せ替え済みのはず）', p: { kind: 'nofile', path: 'src/scenes/cornerRoom.js', hitV: '未対応', missV: '不要になった' } },
  { no: 10, src: 'A', t: '#281 音: CC0/CC-BY実素材の導入', w: 'CREDITS.md に記録された実素材の数', p: { kind: 'fs', dir: 'public/audio', deep: true, cmp: (n) => n >= 50, hitV: '対応済み', missV: '未対応', against: '25情景ぶんの環境音を賄うには到底足りない本数' } },
  { no: 11, src: 'A', t: '#285 人物を本当に人らしく（長期戦）: 原理調査→現状診断→再設計', w: '高品質住人に脚が通っているか（B群と同一の実体）', p: g(TV, 'buildLegs\\(\\)', '対応済み', '未対応', [6796, 6812]) },
  { no: 12, src: 'A', t: '#288 Phase 5: キャラ=セル/背景=リアル寄りの描き分け', w: '画風の方針。コードの一箇所に現れない', p: M('2026-07で「キャラ=セルルック／背景=リアル寄り」は方針として確定済み（メモリ art-direction-cel-bg）。実装は各所に分散し、単一のプローブで可否を決められない') },
  { no: 13, src: 'A', t: '#305 海岸線をさらに入り組ませ／渚を砂浜に広げ／島を拡大（実機FB次第）', w: '汀のディテール（白波・流木・浜草）が入っているか', p: M('汀のディテール（白波・流木・浜草）は addCoastDetail（town3dViewer.js:928）で実装済み。ただし『さらに入り組ませる／砂浜に広げる／島を拡大』の程度は実機FB次第で、完了条件そのものが決まっていない') },

  { no: 14, src: 'B', t: '9092行のうなずきを 1.6 → 1.11 に直す（頭の浮き）', w: 'うなずきが是正前の 1.6 を書き戻していないか', p: g(TV, 'headG\\.position\\.y = 1\\.6', '未対応', '対応済み') },
  { no: 15, src: 'B', t: 'kimono/hakama/armor に buildLegs と手を通す', w: '着物・袴・甲冑の分岐で buildLegs を呼んでいるか', p: g(TV, 'buildLegs\\(\\)', '対応済み', '未対応', [6796, 6812]) },
  { no: 16, src: 'B', t: '小物を arms[i] の子へ移す（刀・槍・杖が手に付く）', w: '小物（刀/槍/杖）の親が腕になっているか', p: g(TV, 'arms\\[', '対応済み', '未対応', [6858, 6870]) },
  { no: 17, src: 'B', t: '体格の型6種＋身長の振れ幅を±14%へ', w: '体格の型を選ぶ仕組みがあるか', p: g(TV, '体格|physique|bodyType', '対応済み', '未対応', [6760, 6890]) },
  { no: 18, src: 'B', t: '江戸・戦国に女性・子供・老人を入れる（配役の入れ替え）', w: '時代エリアの factory が着物以外／女性の衣装を出すか', p: g(TV, "bob|子供|老人|娘|童", '対応済み', '未対応', [6968, 6972]) },
  { no: 19, src: 'B', t: '3Dの主人公 makeHero() を作り、歩行時に出す', w: 'makeHero という関数が存在するか', p: g(TV, 'makeHero', '対応済み', '未対応') },
  { no: 20, src: 'B', t: 'makeResident に歩き癖の個体差を移植（makePeep の6値）', w: 'makeResident の userData に歩き癖の値があるか', p: g(TV, 'gaitAmp|armAmp|cadMul', '対応済み', '未対応', [6870, 6880]) },
  { no: 21, src: 'B', t: '立ち絵の足元の0.21m浮きを直す（板の位置か影の位置）', w: '立ち絵の板の高さが 1.03 のままか', p: g(TV, 'position\\.y = 1\\.03', '未対応', '対応済み', [6740, 6760]) },
  { no: 22, src: 'B', t: '帽子の下の髪を作り分ける（33体が同じ坊主頭）', w: '帽子の下の髪に分岐があるか', p: g(TV, '帽子の下|髪型の分岐|hairKind', '対応済み', '未対応', [6840, 6870]) },
  { no: 23, src: 'B', t: '雲海の7体を島の設定に合わせる（巡礼・棚田・灯籠市・茶屋）', w: 'buildFolk が常に着物を返していないか', p: g(TV, "outfit: 'kimono'", '未対応', '対応済み', [6986, 6992]) },
  { no: 24, src: 'B', t: '群衆の背丈の段階を増やす（3段階→8段階）', w: 'mkCrowdPerson の背丈が連続値になっているか', p: g(TV, 'mkCrowdPerson\\(px, py, pz, [^)]*R\\(\\)', '対応済み', '未対応') },
  { no: 25, src: 'B', t: '立ち絵を段階的に減らす（3Dの主人公と入れ替え）', w: 'makeGirlStandee の呼び出しが残っているか', p: { kind: 'count', file: TV, re: 'makeGirlStandee', hitV: '未対応', missV: '対応済み', cmp: (n) => n >= 2 } },
  { no: 26, src: 'B', t: '時代エリアに降りたときの mkCrowdPerson / cityWalker の単価が未測定', w: '時代エリアでの単価を記録したファイルがあるか', p: g('docs/qa/2026-07-31/charcost.txt', '江戸|戦国|大正', '対応済み', '未対応') },
  { no: 27, src: 'B', t: '実機（iPhone）で測っていない。発熱の体感は別途の実機確認が要る', w: '実機の観測はコードに現れない', p: M('#169 と同じ理由。実機の温感・バッテリーは裕也さんの手作業でしか得られない') },

  { no: 28, src: 'C', t: '.topbar に z-index を与えて3Dの面より前に出す（窓をあけるが指を受け取るように）', w: '.topbar の指定に z-index があるか', p: g('src/style.css', 'z-index', '対応済み', '未対応', [860, 872]) },
  { no: 29, src: 'C', t: 'placeEra の配置半径を陸の縁に合わせる（rr = 8 + R() * 22 → 陸の縁の8割まで）', w: '配置半径が 8〜30m 固定のままか', p: g(TV, 'rr = 8 \\+ R\\(\\) \\* 22', '未対応', '対応済み') },
  { no: 30, src: 'C', t: '戦国の歩ける場所を作る（谷底の道幅を広げる／通行可能距離1mの8方位を潰す）', w: '詰まり率は実際に歩いてみないと分からない', p: M('「詰まり率63%」は当たり判定と地形の組み合わせの実測値。コードの一箇所を見ても判定できない（scripts/qa-walk 相当の再測定が要る）') },
  { no: 31, src: 'C', t: '着物の袖を体に沿わせ、手先と足元を出す（makeResident の kimono 分岐）', w: '#15 と同じ箇所', p: g(TV, 'buildLegs\\(\\)', '対応済み', '未対応', [6796, 6812]) },
  { no: 32, src: 'C', t: "谷戸に人を置く（kind !== 'yato' のゲートを人物だけ外す）", w: '人物ブロックに谷戸を外すゲートが残っているか', p: g(TV, "kind !== 'yato'", '未対応', '対応済み', [6890, 6950]) },
  { no: 33, src: 'C', t: '横持ち(900×500)のUIを直す（情景メニューのヘッダーのはみ出し・タップ44px・重なり）', w: '横持ち向けのメディアクエリがあるか', p: { kind: 'git', cmd: 'git log --since=2026-07-30 --oneline -- src/style.css', hitV: '判定不能', missV: '未対応' } },
  { no: 34, src: 'C', t: '歩行カメラを近接物で自動的に寄せる（checkBlock に樹冠・庇・人物も含める）', w: 'カメラの近接退避の対象に樹冠・庇が入っているか', p: g(TV, 'camBlock|カメラ.*手前の物|カメラ.*樹冠.*寄せ', '対応済み', '未対応') },
  { no: 35, src: 'C', t: 'mkCrowdPerson の肩の段差を消す（肩の球の半径と胴の上端を合わせる）', w: '群衆の肩まわりの造形', p: M('肩の球と胴の上端が「段差に見えるか」は絵の判断。半径の数値だけでは可否を決められない（撮って見るしかない）') },
  { no: 36, src: 'C', t: '雲海の島に人を増やす（1島あたり3〜5人）', w: '雲海の人物の体数', p: { kind: 'count', file: TV, re: 'queueCloudFolk\\(', hitV: '対応済み', missV: '未対応', cmp: (n) => n >= 12 } },
  { no: 37, src: 'C', t: '頭頂の髪の被りを広げる／髷の角度を寝かせる', w: '髪の造形（6840行台）', p: M('「地肌の楕円が出るか」は絵の判断。6840行台の髪は 2026-07-31 の評価時点で作り直し済みだが、被りの十分さは撮って見るしかない') },
  { no: 38, src: 'C', t: '樹冠に埋まる人物を取り下げる（__town3dTownAudit に人物×樹冠の判定を足す）', w: '配置監査に人物×樹冠の判定があるか', p: g(TV, '人物.*樹冠|樹冠.*人物', '対応済み', '未対応') },
  { no: 39, src: 'C', t: '中間の層を1つ足す（makePeep に顔テクスチャだけ乗せる等）', w: 'makePeep に顔のテクスチャが乗っているか', p: g(TV, 'faceTex|顔テクスチャ', '対応済み', '未対応', [6590, 6620]) },

  { no: 40, src: 'D', t: 'ほこりに丸い絵柄を1枚与える', w: 'ほこりの材質に絵柄（map）が設定されたか', p: g(TV, 'map:', '対応済み', '未対応', [7628, 7645]) },
  { no: 41, src: 'D', t: '着地地点の前方に大きな物があれば退がる／横へずらす', w: '車・駐車場が着地の回避対象に登録されているか', p: g(TV, 'spawnAvoid', '対応済み', '未対応', [2550, 2710]) },
  { no: 42, src: 'D', t: '音のNaN経路を潰す', w: '定位の値を Number.isFinite で守っているか', p: g('src/audio/audio.js', 'Number\\.isFinite\\(pan', '対応済み', '未対応') },
  { no: 43, src: 'D', t: '街の下敷き（道路・地面・地被・什器）を区画ごとに束ねる', w: '最大の塊「白＋頂点色の284個」が束ねられたか（電線・太鼓橋・電柱は実施済み）', p: g(TV, '白.*頂点色.*統合|背景の林.*統合', '対応済み', '未対応') },
  { no: 44, src: 'D', t: '観覧車（108コール）を造形の作り直しと同時に束ねる', w: '#5 と同じ（#260の中核）', p: g(TV, 'buildLOD|建物LOD|LOD段階', '対応済み', '未対応') },
  { no: 45, src: 'D', t: '実機A/Bで今回の2変更を確認し、良ければ確定', w: '実機の観測', p: M('#169 と同じ。裕也さんの手作業でしか得られない') },
  { no: 46, src: 'D', t: '窓辺のほこりが四角い（本検収#11で原因確定）', w: '#40 と同じ箇所', p: g(TV, 'map:', '対応済み', '未対応', [7628, 7645]) },
  { no: 47, src: 'D', t: '着地カメラが車の中に入る（本検収#9で原因確定）', w: '#41 と同じ箇所', p: g(TV, '車の中へ着地|駐車場は車がぎっしり', '対応済み', '未対応') },
  { no: 48, src: 'D', t: '音のNaN混入（本検収で新たに検出・199件）', w: '#42 と同じ箇所', p: g('src/audio/audio.js', 'Number\\.isFinite\\(pan', '対応済み', '未対応') },
  { no: 49, src: 'D', t: '#260 建物の脱ローポリ・観覧車の作り直し', w: '#5 と同じ', p: g(TV, 'buildLOD|建物LOD|LOD段階', '対応済み', '未対応') },
  { no: 50, src: 'D', t: '#244 二重WebGLコンテキスト解放', w: '#4 と同じ', p: g('src/main.js', 'loseContext', '対応済み', '未対応') },
  { no: 51, src: 'D', t: '#277 歩行の迷子解消', w: '#8 と同じ', p: g(TV, '道しるべ|walkGuide|歩行.*行き先の案内', '対応済み', '未対応') },
  { no: 52, src: 'D', t: '#270 行き先プレビュー＋渡しショートカット', w: '#6 と同じ', p: g('src/main.js', '行き先|プレビュー|ショートカット', '対応済み', '未対応') },
  { no: 53, src: 'D', t: '#285 人物を人らしく（進行中）', w: '#11 と同じ', p: g(TV, 'buildLegs\\(\\)', '対応済み', '未対応', [6796, 6812]) },
  { no: 54, src: 'D', t: '#172 音の拡充（進行中）', w: '#2 と同じ', p: { kind: 'fs', dir: 'public/audio', cmp: (n) => n >= 25, hitV: '対応済み', missV: '未対応', against: '情景は全25なので、実音源のある情景の数と比べる' } },
  { no: 55, src: 'D', t: '#281 CC0実素材の導入', w: '#10 と同じ', p: { kind: 'fs', dir: 'public/audio', deep: true, cmp: (n) => n >= 50, hitV: '対応済み', missV: '未対応', against: '25情景ぶんの環境音を賄うには到底足りない本数' } },
  { no: 56, src: 'D', t: '#276 エリア磨き（戦国/大正/谷戸/雲上/江戸）', w: '#7 と同じ', p: M('#7 と同じ理由（主観）') },
  { no: 57, src: 'D', t: '#305 海岸線をさらに入り組ませる', w: '#13 と同じ', p: M('汀のディテール（白波・流木・浜草）は addCoastDetail（town3dViewer.js:928）で実装済み。ただし『さらに入り組ませる／砂浜に広げる／島を拡大』の程度は実機FB次第で、完了条件そのものが決まっていない') },
  { no: 58, src: 'D', t: '#279 角部屋の真3D視差', w: '#9 と同じ', p: { kind: 'nofile', path: 'src/scenes/cornerRoom.js', hitV: '未対応', missV: '不要になった' } },
  { no: 59, src: 'D', t: '#288 キャラ=セル/背景=リアル', w: '#12 と同じ', p: M('#12 と同じ理由（方針）') },
  { no: 60, src: 'D', t: '#232 モノリス分割', w: '#3 と同じ', p: { kind: 'count', file: TV, re: '.', hitV: '未対応', missV: '対応済み', cmp: (n, total) => total > 5000 } },
  { no: 61, src: 'D', t: '#169 実機検証（進行中）', w: '#1 と同じ', p: M('#1 と同じ理由（実機）') },
  { no: 62, src: 'D', t: 'Cylinder|Basic|#2a2a30 57個（town直下・材質1つ）を統合（-56）', w: '電線・支線・引き込み線の統合が入っているか', p: g(TV, '電線.*統合|電線.*1メッシュ|wireGeos', '対応済み', '未対応') },
  { no: 63, src: 'D', t: '公園の同一材質51個を統合（-50）', w: '太鼓橋の統合が入っているか', p: g(TV, '太鼓橋.*束ねる|deckGeos', '対応済み', '未対応') },
  { no: 64, src: 'D', t: '285個の白＋頂点色の正体を確定させ、動かない分だけ束ねる（最大-280）', w: '地形・背景の林の統合が入っているか', p: g(TV, '白.*頂点色.*統合|背景の林.*統合', '対応済み', '未対応') },
  { no: 65, src: 'D', t: '窓のテクスチャを1枚の共有アトラスへ寄せる（460個が統合可能になる・-400超）', w: '窓テクスチャの共有アトラスがあるか', p: g(TV, 'アトラス|atlas', '対応済み', '未対応') },

  { no: 66, src: 'E', t: 'Step3 (a) atmo+wash だけをシェーダーへ（部分移植）— 試作したが保留', w: 'グレードのシェーダー内蔵が入っているか（検証フックの有無で見る）', p: g(TV, '__town3dGradeMode', '対応済み', '未対応') },
  { no: 67, src: 'E', t: 'Step3 (b) 全層移植を実機A/Bで確定', w: '#66 と同じ箇所', p: g(TV, '__town3dGradeMode', '対応済み', '未対応') },
  { no: 68, src: 'E', t: '夕(dusk)系での wash soft-light ズレ／atmoの微小ズレの原因を特定する（未特定）', w: '原因はブラウザの合成実装の差。コードでは判定できない', p: M('CSSの soft-light / radial-gradient のブラウザ実装とシェーダー実装の差。3度の試作でも特定できず、全情景×実機A/Bが要ると結論済み') },
  { no: 69, src: 'E', t: 'P3見送り: fps低下・長時間モード・時限の解像度降格', w: '見送りの判断が済んでいる', p: M('「fps/解像度は譲らない」は承認済みの判断。実装しないことが結論＝残タスクではない') },
  { no: 70, src: 'E', t: 'P3見送り: WebGPU移行', w: 'seasons-gpu で別途 Phase2 まで実施済み・本家は非干渉', p: M('本家 seasons には持ち込まない方針で、複製リポジトリ seasons-gpu で Phase2 まで実施し凍結中。本家の残タスクではない') },
  { no: 71, src: 'E', t: 'P3見送り: OffscreenCanvas+Worker', w: '見送りの判断が済んでいる', p: M('省電力効果が不確かとして見送り済み。実装しないことが結論') },
  { no: 72, src: 'E', t: 'P3見送り: mediump化', w: '見送りの判断が済んでいる', p: M('描画破綻のリスク対効果が悪いとして見送り済み。実装しないことが結論') },
  { no: 73, src: 'E', t: 'P3見送り: #244 2Dコンテキスト解放（発熱には効かない・優先度低のまま）', w: '#4 と同じ箇所', p: g('src/main.js', 'loseContext', '対応済み', '未対応') },
  { no: 74, src: 'E', t: '残り=建物床のグローバル統合・特殊構造物・建物LOD＝#260の大工事', w: '#5 と同じ', p: g(TV, 'buildLOD|建物LOD|LOD段階', '対応済み', '未対応') },
  { no: 75, src: 'E', t: '実機検証プロトコル（輝度50%固定・窓辺5分／home低空5分・バッテリー%と温感を記録）', w: '実機の観測', p: M('#169 と同じ。手順書は docs/qa/2026-07-28_実機確認.md に用意済みで、あとは裕也さんが実行するだけ') },

  { no: 76, src: 'F', t: '音の設定値に非有限値（NaN/Infinity）が混入する 【2026-07-30 修正済み】', w: '#42 と同じ箇所', p: g('src/audio/audio.js', 'Number\\.isFinite\\(pan', '対応済み', '未対応') },
  { no: 77, src: 'F', t: '雲海の高度帯（y≒92）で画面が白い霞にほぼ覆われる 【2026-07-30 修正済み】', w: '雲の近接フェードが入っているか', p: g(TV, '雲の近接フェード|fadeR0', '対応済み', '未対応') },
  { no: 78, src: 'F', t: '江戸の近接で地面の一枚板がカメラを割る', w: '目線の高さで撮らないと分からない絵の破綻', p: M('「画面の下半分がベタ緑になるか」はカメラ位置に依存する絵の破綻。地形の分割数や近接フォグの値を見ても、破綻するかは決まらない（撮って見るしかない）') },
  { no: 79, src: 'F', t: '__applyScene がUI側の情景状態を更新しない（検証用フックの限界）', w: '検証用フックが UI 側の状態も更新するか', p: g('src/main.js', '__applyScene', '判定不能', '判定不能') },
  { no: 80, src: 'F', t: '前回検収の未反映コミット（07-30時点で11コミット未反映）', w: 'origin/main に送っていないコミットが残っているか', p: { kind: 'git', cmd: 'git log origin/main..main --oneline', hitV: '未対応', missV: '対応済み' } },
  { no: 81, src: 'F', t: '__town3dLand(true) は窓辺からは効かない（検証用フックの限界）', w: '検証用フックが窓辺からの着地を扱うか', p: g(TV, '__town3dLand', '判定不能', '判定不能') },
  { no: 82, src: 'F', t: '前回検収の未反映コミット（07-31時点でさらに増えている）', w: '#80 と同じ', p: { kind: 'git', cmd: 'git log origin/main..main --oneline', hitV: '未対応', missV: '対応済み' } },

  { no: 83, src: 'G', t: 'GitHub Actions の非推奨警告: actions/upload-artifact@v4 が Node 20 指定で Node 24 に強制される', w: 'ワークフローが古い版のアクションを使っているか', p: g('.github/workflows/deploy.yml', 'upload-pages-artifact@v3', '未対応', '対応済み') },
  { no: 84, src: 'H', t: '建物の窓テクスチャを共有アトラス化するか（実機で発熱を確かめてから判断）', w: '#65 と同じ', p: g(TV, 'アトラス|atlas', '対応済み', '未対応') },

  // ── #2 の抽出漏れ検査で追加（出所B §6 の限界のうち、初回に落としていた2件）──
  { no: 85, src: 'B', t: 'フレーム時間は判断に使えない。判断はすべて描画コールで行った', w: '開発機のフレーム時間が不安定であること自体', p: M('測定の限界の記述であって、やるべきことではない。ただし「実機で測る」（#1/#27）に依存関係として結びつく') },
  { no: 86, src: 'B', t: '前回検収の未反映コミットが残っている。今回の評価もローカル現行版に対するもの', w: '#80 と同じ', p: { kind: 'git', cmd: 'git log origin/main..main --oneline', hitV: '未対応', missV: '対応済み' } },
]

// ── 出所ごとの原文の件数（抽出漏れの検査）──────────────────────
// 表の行を数える: 見出し行と区切り行(|---)を除いた「| 」で始まる行
const countTableRows = (rel, fromRe, toRe) => {
  const src = readLines(rel)
  if (!src) return -1
  let on = false, n = 0, seenHeader = false
  for (const ln of src) {
    if (!on && new RegExp(fromRe).test(ln)) { on = true; seenHeader = false; continue }
    if (on && toRe && new RegExp(toRe).test(ln)) break
    if (!on) continue
    if (/^\|-/.test(ln)) { seenHeader = true; continue }
    if (/^\| /.test(ln) && seenHeader) n++
  }
  return n
}
const countRe = (rel, re, fromRe, toRe) => {
  const src = readLines(rel)
  if (!src) return -1
  let on = !fromRe, n = 0
  for (const ln of src) {
    if (!on && new RegExp(fromRe).test(ln)) { on = true; continue }
    if (on && toRe && new RegExp(toRe).test(ln)) break
    if (on && new RegExp(re).test(ln)) n++
  }
  return n
}

const SOURCES = () => {
  const B5 = countTableRows('docs/qa/2026-07-31_キャラクターデザインの評価.md', '^## 5\\.', '^### ')
  const B6 = countRe('docs/qa/2026-07-31_キャラクターデザインの評価.md', '^- \\*\\*', '^## 6\\.')
  const C1 = countTableRows('docs/qa/2026-07-30_キャラと賑わいの評価.md', '^## 優先度つきアクション', '^## ')
  const D1 = countTableRows('docs/qa/2026-07-28_全体評価.md', '^## 優先度つきアクション', '^## ')
  const D2a = countTableRows('docs/qa/2026-07-28_残タスク棚卸し.md', '^## 今すぐ効く', '^## 次に効く')
  const D2b = countTableRows('docs/qa/2026-07-28_残タスク棚卸し.md', '^## 次に効く', '^## 急がない')
  const D2c = countTableRows('docs/qa/2026-07-28_残タスク棚卸し.md', '^## 急がない', '^## 本検収で')
  const D3 = countTableRows('docs/qa/2026-07-28_残タスク棚卸し.md', '^\\*\\*次にやるなら', '^4が本命')
  const EP3 = countRe('発熱対策計画_2026-07.md', '^- ', '^### P3 見送り', '^## 4\\.5')
  // 「## 追記（…）」は発見そのものではなく、その後の対処の記録。項目として数えない
  const F1 = countRe('docs/qa/2026-07-28_窓のむこう_発熱と再点検_範囲外メモ.md', '^## (?!追記)')
  const F2 = countRe('docs/qa/2026-07-30_窓のむこう_キャラと賑わい_範囲外メモ.md', '^## (?!追記)')
  const F3 = countRe('docs/qa/2026-07-31_窓のむこう_キャラクターデザイン_範囲外メモ.md', '^## (?!追記)')
  return [
    { k: 'A', name: 'タスクリスト（未完了）', n: 13, how: '転記（セッション内にありディスクに無い。pending 10・in_progress 3）' },
    { k: 'B', name: 'キャラクターデザインの評価 §5＋§6', n: B5 + B6, how: `§5の表 ${B5}行 ＋ §6の箇条書き ${B6}件` },
    { k: 'C', name: 'キャラと賑わいの評価 優先度つきアクション', n: C1, how: `表 ${C1}行` },
    { k: 'D', name: '全体評価＋残タスク棚卸し', n: D1 + D2a + D2b + D2c + D3, how: `全体評価の表 ${D1} ＋ 棚卸し3表 ${D2a}+${D2b}+${D2c} ＋ 追記「次にやるなら」 ${D3}` },
    { k: 'E', name: '発熱対策計画', n: EP3 + 5, how: `P3の箇条書き ${EP3}件 ＋ §4.5の(a)(b)とduskの未特定 3件 ＋ §4.7の残り 1件 ＋ §6のプロトコル 1件` },
    { k: 'F', name: '範囲外メモ 3本', n: F1 + F2 + F3, how: `見出し数 ${F1}+${F2}+${F3}（「## 追記」は対処の記録なので除く）` },
    { k: 'G', name: 'インフラ（デプロイのログ）', n: 1, how: '本日のデプロイの ANNOTATIONS 1件' },
    { k: 'H', name: '判断保留の調査文書', n: 1, how: '窓テクスチャ共有アトラス化の判断 1件' },
  ]
}

// ── 出力 ──────────────────────────────────────────────────────
const mode = process.argv[2] || ''

if (mode === '--count') {
  console.log('# 抽出漏れの検査（原文の件数 / 台帳の件数 / 差）\n')
  console.log('| 出所 | 名前 | 原文の件数 | 台帳の件数 | 差 | 数え方 |')
  console.log('|---|---|---|---|---|---|')
  let so = 0, st = 0
  for (const s of SOURCES()) {
    const t = ITEMS.filter((i) => i.src === s.k).length
    so += s.n; st += t
    console.log(`| ${s.k} | ${s.name} | ${s.n} | ${t} | ${t - s.n >= 0 ? '+' : ''}${t - s.n} | ${s.how} |`)
  }
  console.log(`| — | **合計** | **${so}** | **${st}** | **${st - so >= 0 ? '+' : ''}${st - so}** | |`)
  process.exit(0)
}

if (mode === '--list') {
  console.log('# 全項目とプローブ（コード上のどこを見れば判定できるか）\n')
  for (const it of ITEMS) {
    const p = it.p
    const how = p.kind === 'manual' ? '機械では判定できない' : p.kind === 'git' ? `git: ${p.cmd}` : p.kind === 'count' ? `${p.file} を /${p.re}/ で数える` : `${p.file}${p.lines ? ` の ${p.lines[0]}〜${p.lines[1]}行` : ''} を /${p.re}/ で探す`
    console.log(`${String(it.no).padStart(2)} [${it.src}] ${it.t}`)
    console.log(`     見るもの: ${it.w}`)
    console.log(`     プローブ: ${how}`)
  }
  console.log(`\n合計 ${ITEMS.length} 項目`)
  process.exit(0)
}

const results = ITEMS.map((it) => ({ it, r: runProbe(it.p) }))

if (mode === '--evidence') {
  console.log('# 「対応済み」と判定した項目の根拠\n')
  const done = results.filter((x) => x.r.verdict === '対応済み')
  for (const { it, r } of done) {
    console.log(`## #${it.no} [${it.src}] ${it.t}`)
    console.log(`判定: 対応済み ／ ${r.note}`)
    for (const h of r.hits) console.log(`  ${it.p.file || 'git'}:${h.line}  ${h.text}`)
    console.log('')
  }
  console.log(`対応済み ${done.length}件`)
  process.exit(0)
}

console.log('# 全件の判定\n')
console.log('| # | 出所 | 件名 | 判定 | 根拠 |')
console.log('|---|---|---|---|---|')
for (const { it, r } of results) {
  const ev = r.hits.length ? `${(it.p.file || 'git').replace('src/engine/', '')}:${r.hits[0].line}` : r.note.replace(/\|/g, '/').slice(0, 70)
  console.log(`| ${it.no} | ${it.src} | ${it.t.replace(/\|/g, '/').slice(0, 46)} | ${r.verdict} | ${ev} |`)
}
const tally = {}
for (const { r } of results) tally[r.verdict] = (tally[r.verdict] || 0) + 1
console.log('\n## 内訳')
for (const k of ['未対応', '対応済み', '不要になった', '判定不能']) console.log(`${k}: ${tally[k] || 0}件`)
console.log(`合計: ${results.length}件`)
