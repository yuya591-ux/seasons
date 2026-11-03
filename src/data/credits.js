// アプリ内「この作品について（出典）」で表示する素材クレジット。
// CC BY / CC BY-SA 素材は、配信される作品の中で帰属表示する義務があるため、ここをUIから閲覧できるようにする。
// 出典の正本は CREDITS.md。本ファイルは利用者向けの要約（作者・ライセンス・出典URL）。両者を一致させること。

export const CREDIT_INTRO =
  '環境音・背景画像・地図のデータは、ライセンスが明確なフリー素材とオープンデータ（CC0／パブリックドメイン優先）のみを使っています。作者と出典をここに記します。'

// 環境音（実在の録音。MP3 へ変換して同梱）。情景データの sounds[].src で使っている素材を全部載せ、使っていない素材は載せない
// （file は同梱のファイル。scripts/qa-credits.mjs が情景データ・CREDITS.md と照らす＝スモークで回る）
export const CREDIT_SOUNDS = [
  { file: 'summer-rain-dusk/rain.mp3', title: 'Rain against the window', by: 'Cori Samuel', license: 'パブリックドメイン', url: 'https://commons.wikimedia.org/wiki/File:Rain_against_the_window.ogg', note: '雨音' },
  { file: 'summer-rain-dusk/higurashi.mp3', title: 'Tanna japonensis v01（ヒグラシ）', by: 'Σ64', license: 'CC BY 4.0', url: 'https://commons.wikimedia.org/wiki/File:Tanna_japonensis_v01.ogg', note: 'ヒグラシ' },
  { file: 'summer-rain-dusk/thunder.mp3', title: 'Thunder', by: 'Bidgee', license: 'CC BY 3.0', url: 'https://commons.wikimedia.org/wiki/File:Thunder.ogg', note: '遠雷' },
  { file: 'summer-dusk-seaside/waves.mp3', title: 'Waves', by: 'Dsw4', license: 'パブリックドメイン', url: 'https://commons.wikimedia.org/wiki/File:Waves.ogg', note: '波' },
  { file: 'summer-dusk-seaside/gulls.mp3', title: 'Black-headed Gulls（ユリカモメ）', by: 'Lawrence Shove / The British Library Board', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Black-headed_Gulls_(Larus_ridibundus)_(W1CDR0001402_BD19).ogg', note: 'カモメ' },
  { file: 'spring-dusk-corner-room/frogs.mp3', title: 'Froesche rieselfelder（カエルの合唱）', by: 'Guido Gerding (XN)', license: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:Froesche_rieselfelder.ogg', note: 'かえる' },
  { file: 'autumn-dusk-corner-room/crickets.mp3', title: 'Grillo (Cricket)', by: 'Luisalvaz', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Grillo_(Cricket).ogg', note: '虫の音' },
  { file: 'kitaterao-window-3d-night/suzumushi.mp3', title: 'Suzumushi 06z3286（スズムシ）', by: 'Cory (ISAKA Yoji)', license: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:Suzumushi_06z3286.ogg', note: '鈴虫' },
  { file: 'shishigaya-morning-yato/uguisu.mp3', title: 'Japanese bush warbler (uguisu) in a city ambiance（ウグイス）', by: 'warukunai', license: 'CC0', url: 'https://freesound.org/people/warukunai/sounds/524526/', note: 'ウグイス' },
  { file: 'shishigaya-morning-yato/stream.mp3', title: 'Flowing-water-100019', by: 'Fg2', license: 'パブリックドメイン', url: 'https://commons.wikimedia.org/wiki/File:Flowing-water-100019.ogg', note: 'せせらぎ' },
  { file: 'winter-snow-night/wind.mp3', title: 'Wind in Swedish pine forest at 25 mps', by: 'W.carter', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Wind_in_Swedish_pine_forest_at_25_mps.ogg', note: '風' },
]

// 窓の外の絵（外部AIで開発時に生成。本番は保存画像を表示するだけ＝実行時に外部APIは叩かない）
export const CREDIT_IMAGES = [
  { title: '窓の外の風景（生成画像）', by: 'Pollinations.AI / Flux（無料・オープンソース）', license: 'AI生成物', url: 'https://pollinations.ai/', note: '雨の窓の外の景色' },
]

// 角部屋の窓の外の鴨川の町（便18）。地図のデータは加工して経緯度を外した形で同梱。出典の正本は CREDITS.md（scripts/qa-credits.mjs が照らす）
export const CREDIT_MAPS = [
  { title: '地理院タイル（標高タイル）を加工して作成', by: '国土地理院', license: '国土地理院コンテンツ利用規約', url: 'https://maps.gsi.go.jp/development/ichiran.html', note: '地形と山' },
  { title: '3D都市モデル（Project PLATEAU）京都市（2025年度）建築物モデル LOD2 を加工して作成', by: '国土交通省', license: 'CC BY 4.0 互換', url: 'https://www.mlit.go.jp/plateau/', note: '建物の形と高さ' },
  { title: '川・水面・道・橋・木・飛び石', by: '© OpenStreetMap contributors', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright', note: '川と道' },
  { title: '地面・道・壁・屋根・木の皮の写真の質感（7 種）', by: 'Poly Haven', license: 'CC0', url: 'https://polyhaven.com/license', note: '質感' },
]

// 描画・道具
export const CREDIT_TOOLS = [
  { title: 'three.js', by: 'mrdoob ほか', license: 'MIT', url: 'https://threejs.org/', note: '立体の街の描画' },
]

// 作品自体の扱い（継承ライセンスの明示）
export const CREDIT_OUTRO =
  'この作品の独自部分（描画・データ・コード）は MIT ライセンスです。同梱の第三者素材は上記それぞれのライセンスに従います。CC BY-SA 素材を含むため、それらの素材は CC BY-SA を継承します。鴨川の町の川・道・木のデータ（OpenStreetMap から作った物）は ODbL 1.0 で提供します。詳細はリポジトリの CREDITS.md / LICENSE をご覧ください。'
