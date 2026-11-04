# CREDITS — 使用素材の出典・ライセンス

このアプリで使う環境音などの素材は、ライセンスが明確なフリー素材（CC0 / パブリックドメイン最優先）
のみを使用し、出典・ライセンス・作者をここに**全数**記録する。ライセンス不明の素材は使わない。
ここに載せるのは**今同梱している素材だけ**（使わなくなって外した素材の記録は git の履歴にある。2026-11-02 便15 で
油蝉・カラス・パノラマ・スプラット・実写の窓の背景・立体の街の遠景の写真を外した）。
どの情景がどの音を使うかは情景データ（`src/data/scenes/*.js` の `sounds[].src`）が正。アプリ内の出典（`src/data/credits.js`）と
ここが食い違わないことを `scripts/qa-credits.mjs` が照らす（`npm run smoke` の中で回る）。

## 音素材

Wikimedia Commons の素材は元が Ogg Vorbis。freesound の素材（ウグイス）は 48kHz の原音から一声を切り出した物（元のファイルの形式は記録していない）。どれも iOS/Safari でも再生できるよう
**MP3 へ変換**して同梱している（CC BY 素材は「変更点：MP3へ変換／ループ用に再生制御」を明記）。

### 雨音・ヒグラシ・遠雷 — `public/audio/summer-rain-dusk/`

| レイヤー | ファイル | 作品 / 作者 | ライセンス | 出典 |
| --- | --- | --- | --- | --- |
| 雨音 | `rain.mp3` | "Rain against the window" / Cori Samuel (cori) | パブリックドメイン | https://commons.wikimedia.org/wiki/File:Rain_against_the_window.ogg |
| ヒグラシ | `higurashi.mp3` | "Tanna japonensis v01" / Σ64 | CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/ | https://commons.wikimedia.org/wiki/File:Tanna_japonensis_v01.ogg |
| 遠雷 | `thunder.mp3` | "Thunder" / Bidgee | CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/ | https://commons.wikimedia.org/wiki/File:Thunder.ogg |

- ヒグラシは実在種 *Tanna japonensis*（ヒグラシ／カナカナ）の本物の鳴き声。2011年、神奈川県川崎市で録音。
- 雷は 2007年、オーストラリア・ダーウィンで録音。
- 変更点（CC BY 素材）：Ogg→MP3 へ変換。アプリ内ではループ／ランダム間隔で再生。

### 波・カモメ — `public/audio/summer-dusk-seaside/`

| レイヤー | ファイル | 作品 / 作者 | ライセンス | 出典 |
| --- | --- | --- | --- | --- |
| 波 | `waves.mp3` | "Waves" / Dsw4 | パブリックドメイン | https://commons.wikimedia.org/wiki/File:Waves.ogg |
| カモメ | `gulls.mp3` | "Black-headed Gulls (Larus ridibundus) (W1CDR0001402 BD19)" / 録音: Lawrence Shove・提供: The British Library Board | CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/ | https://commons.wikimedia.org/wiki/File:Black-headed_Gulls_(Larus_ridibundus)_(W1CDR0001402_BD19).ogg |

- カモメは実在種 *Chroicocephalus ridibundus*（ユリカモメ）の群れの鳴き声。1971年5月、英国サフォーク州 Havergate Island の湿地で録音。
- 変更点：Ogg→MP3 へ変換し、波の上にそっと重ねてループ再生。CC BY-SA 素材は同ライセンス継承。

### かえる — `public/audio/spring-dusk-corner-room/`

| レイヤー | ファイル | 作品 / 作者 | ライセンス | 出典 |
| --- | --- | --- | --- | --- |
| かえる | `frogs.mp3` | "Froesche rieselfelder" / Guido Gerding (XN) | CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0/ | https://commons.wikimedia.org/wiki/File:Froesche_rieselfelder.ogg |

- 水辺のカエルの合唱（Wasserfrösche）。6月、ドイツ・ミュンスター近郊の Rieselfelder で録音。春の宵の田畑の気配に。
- 変更点：Ogg→MP3 へ変換しループ再生。CC BY-SA 素材は同ライセンス継承。

### 虫の音（コオロギ） — `public/audio/autumn-dusk-corner-room/`

| レイヤー | ファイル | 作品 / 作者 | ライセンス | 出典 |
| --- | --- | --- | --- | --- |
| 虫の音 | `crickets.mp3` | "Grillo (Cricket)" / Luisalvaz | CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/ | https://commons.wikimedia.org/wiki/File:Grillo_(Cricket).ogg |

- 草むらのコオロギ（*Gryllidae*）の合唱。2014年9月、TASCAM DR-07 で録音。秋の夜長の気配に。
- 変更点：Ogg→MP3 へ変換しループ再生。CC BY-SA 素材は同ライセンス継承。

### 鈴虫 — `public/audio/kitaterao-window-3d-night/`

| レイヤー | ファイル | 作品 / 作者 | ライセンス | 出典 |
| --- | --- | --- | --- | --- |
| 鈴虫 | `suzumushi.mp3` | "Suzumushi 06z3286" / Cory (ISAKA Yoji) | CC BY-SA 3.0 — https://creativecommons.org/licenses/by-sa/3.0/ | https://commons.wikimedia.org/wiki/File:Suzumushi_06z3286.ogg |

- 鈴虫（*Meloimorpha japonica*）の澄んだ「リーンリーン」。2006年9月、兵庫・JR山陰本線 餘部駅で録音。夏の夜の鳴き交わしに。
- 変更点：Ogg→MP3 へ変換、フェード調整しループ再生。コオロギ・夜風と重ね、各々ゆっくり満ち引き（swell）させて鳴き交わし・静寂の間をつくる。元は多重ライセンス（CC BY 2.1 JP / CC BY-SA 3.0 / BSD / GFDL）から CC BY-SA 3.0 を選択。同ライセンス継承。

### ウグイス・せせらぎ — `public/audio/shishigaya-morning-yato/`

| レイヤー | ファイル | 作品 / 作者 | ライセンス | 出典 |
| --- | --- | --- | --- | --- |
| ウグイス | `uguisu.mp3` | "Japanese bush warbler (uguisu) in a city ambiance" / warukunai | CC0 (パブリックドメイン) — https://creativecommons.org/publicdomain/zero/1.0/ | https://freesound.org/people/warukunai/sounds/524526/ |
| せせらぎ | `stream.mp3` | "Flowing-water-100019" / Fg2 | パブリックドメイン | https://commons.wikimedia.org/wiki/File:Flowing-water-100019.ogg |

- ウグイスは実在種 *Horornis diphone*（ウグイス）の本物のさえずり。横浜市で録音された 48kHz の CC0 素材へ差し替え（旧 Wikimedia 素材は 11kHz と低品質だったため、高域の艶が出る高音質版へ・2026-06）。
- 変更点：ウグイスは原音(48kHz/56秒・街の生活音まじり)から、最もきれいな一声(約4.0〜6.4秒)を切り出し、ハイパスで車/風の低域を除き、旧素材と同じ音量へ整えて 44.1kHz MP3 化（ゆらぎのある間隔でそっと再生＝interval）。せせらぎはループ。CC0 は表示義務はないが出典を全数記録。

### 風 — `public/audio/winter-snow-night/`

| レイヤー | ファイル | 作品 / 作者 | ライセンス | 出典 |
| --- | --- | --- | --- | --- |
| 風 | `wind.mp3` | "Wind in Swedish pine forest at 25 mps" / W.carter | CC BY-SA 4.0 — https://creativecommons.org/licenses/by-sa/4.0/ | https://commons.wikimedia.org/wiki/File:Wind_in_Swedish_pine_forest_at_25_mps.ogg |

- 風は森を渡る風の録音。多くの情景で薄く重ねる（同じファイルを再利用。どの情景かは情景データが正）。
- 変更点：Ogg→MP3 へ変換。アプリ内ではループ再生。CC BY-SA 素材は同ライセンス継承。

## 外部AI生成画像（雨の窓の外の景色）

シェーダーの現象（雨粒の屈折・曇り・きらめき）を土台に残し、「窓の外の風景・空」だけを外部の無料AIで
生成した画像で格上げする二層構成。**開発時に一度だけ生成して保存し、本番は保存画像を表示する
だけ＝実行時に外部APIを叩かない**（方針: `addon_共通方針_外部AI生成.md`）。

| 用途 | ファイル | 生成サービス / モデル | 設定 |
| --- | --- | --- | --- |
| 「夏の雨、夕暮れ」窓の外 | `public/bg/summer-rain-dusk-b.jpg` | Pollinations.AI / Flux モデル（無料） | 生成日 2026-06-16・seed 12・1280×768 |
| 「夏の雨の夜」窓の外 | `public/bg/summer-rain-night.jpg` | Pollinations.AI / Flux モデル（無料） | 生成日 2026-06-16・seed 33・1280×768 |
| 「秋の雨、夕暮れ」窓の外（雨ガラス越し・水彩寄り） | `public/bg/autumn-rain-dusk.jpg` | Pollinations.AI / Flux モデル（無料） | 生成日 2026-06-16・seed 71・縦580×1015（超解像なし＝雨で和らぐ画調を維持） |
| 「梅雨の朝、あじさい」窓の外（雨ガラス越し・水彩寄り） | `public/bg/summer-rain-morning.jpg` | Pollinations.AI / Flux モデル（無料） | 生成日 2026-06-19・seed 83・縦約580×1015（超解像なし＝雨で和らぐ画調を維持） |

- プロンプト（秋の雨、夕暮れ＝雨ガラスの水彩寄り背景）: `watercolor and soft realism blend, nostalgic Japanese countryside town in autumn at dusk, glowing amber and crimson sunset sky, distant blurred rooftops and red-orange autumn trees along the bottom, soft hazy rainy atmosphere, melancholic calm, muted dusty autumn colors, painterly bokeh, no people, no text`
- 生成サービス: Pollinations.AI（https://pollinations.ai/ ・オープンソース）。**無料の Flux モデルのみ**使用（有料モデル・課金は使わない）。生成は無料の Seed ティアのトークンで実施（鍵は `scripts/.pollinations-token`＝`.gitignore` 済でGit非公開）。
- 扱い: AIによる生成物（オリジナルの雰囲気。既存作品の固有の絵・キャラは模さない）。個人の趣味・非公開用途。手前の雨はシェーダーのまま、奥の背景としてのみ重ねる。
- 生成ツール: `scripts/gen-bg.mjs`（Flux固定・無料・トークン任意）。プロンプト定義は `scripts/bg-jobs.json`。各情景も `bgPrompt` を携帯し、季節×天気×時間帯ごとに量産しやすい形。
- dev用ライブラリ `sharp`／`playwright` は本番ビルド(Vite)に不要なため、本番の依存（dependencies）には含めない。

## 鴨川の町（角部屋の窓の外）の地図のデータ・質感の素材 — `public/kamo/`

2026-11 に角部屋の窓の外に組んだ。作る道具は `scripts/kamo/`（取る `fetch.mjs` → 組む `build.mjs` → 焼く `bake.py` → 詰める `pack.mjs`）。配る形はどれも原点（出町柳の合流）からのメートルだけで、経緯度は持たせていない（国土地理院「申請不要となる範囲の拡大について」〈令和元年〉の「経緯度等の位置座標のない成果品の作成は申請不要」に当たる）。

| 何に | ファイル | 出典 | 決まり | 加工 |
| --- | --- | --- | --- | --- |
| 地形と山（~~近く ±800m~~【便21】近く 東西 -800〜1904m・南北 -800〜904m の四角＝京都大学・吉田神社・吉田山まで・遠く ±11km） | `public/kamo/terrain.bin` | 国土地理院 地理院タイル 標高タイル（基盤地図情報数値標高モデル）DEM5A・DEM10B https://maps.gsi.go.jp/development/ichiran.html ／ 川の水面の範囲は © OpenStreetMap contributors | 国土地理院コンテンツ利用規約 https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html （出典の記載・加工した旨の記載） | 「地理院タイル（標高タイル）を加工して作成」。4m・50m 間隔の網の高さにし、川の水面の内側を下げ（【便21】水際から中ほどへ 12〜42cm の浅瀬の形・水の深さの図を添えた・橋の床が入った川の中の尾根をならした）、16 ビットの整数に詰めた |
| 建物の形と高さ（~~4,967 棟~~【便21】11,953 棟） | `public/kamo/bldg.bin` | 国土交通省 Project PLATEAU 京都市 建築物モデル LOD2（2025年度・上京区・左京区） https://www.mlit.go.jp/plateau/ | PLATEAU のサイトポリシー（CC BY 4.0 と互換・出典の記載） | 段の重なりを除き、地面の高さに合わせ、~~2.5cm 刻みの整数に詰めた~~（【便21】範囲の中心を引いて 4.5cm 刻みの整数に詰めた）。部屋のある建物の所は外して、部屋のあるマンションの外壁を足した。【便21】平らな箱の低い家 8,374 棟に切妻・寄棟の屋根を足し、町家・古民家・寺社などの種類と通りに面する向きを添えた（京大の時計塔・大元宮・茂庵などは計算で作った形） |
| 川の水面・道・橋・線路・森と公園・木の点・飛び石（【便21】堰・街灯・ベンチ・鳥居・名所の囲みも） | `public/kamo/roads.bin`・`public/kamo/misc.bin` | © OpenStreetMap contributors https://www.openstreetmap.org/copyright | ODbL 1.0（出典の記載） | 道は幅をつけた帯、飛び石は石の並び、森と公園は木を散らした |
| 光の回り方（地形・建物） | `public/kamo/lm_terrain.jpg`・`public/kamo/lm_terrain_s.jpg`・`public/kamo/lm_bldg.jpg`・`public/kamo/lm_bldg_s.jpg` | 上の地形（地理院・OpenStreetMap）と建物（PLATEAU）と木（OpenStreetMap）から、Blender（https://www.blender.org/ ・pip の bpy・開発の時だけ使う道具）で焼いた自前の図 | 自前で作った図 | 灰色の JPEG（PC と iPad は 4096・iPhone は 2048） |
| 数・刻み・窓の位置・水面の高さ | `public/kamo/kamo.json` | 上のデータ（地理院・PLATEAU・OpenStreetMap）から作った | — | 経緯度は入れていない |
| 叡山電鉄の線路・出町柳駅・出町桝形商店街・河合神社・糺の森・五山の送り火の位置（便20） | `public/kamo/life.json` | © OpenStreetMap contributors https://www.openstreetmap.org/copyright（`scripts/kamo/life.mjs` に元の番号を書いた） | ODbL 1.0（出典の記載） | 原点からのメートルだけ（経緯度は入れていない）。五山の字の寸法と火床の数は、京都の案内の数（五山送り火の各保存会の公表の数・ウィキペディア「五山送り火」で確かめた）から自前で並べた。電車の車体・人・鳥の形は計算で作り、実在の車両の塗り分けは写していない |
| 質感（地面の砂利） | `public/kamo/tex/gravel_road_d.jpg`・`_n.jpg`（iPhone 向けは `_s` 付き） | Poly Haven「gravel_road」 https://polyhaven.com/a/gravel_road | CC0 https://polyhaven.com/license | 色の図と凹凸の図（1024）をそのまま。iPhone 向けは縦横を半分にした |
| 質感（河川敷の草） | `public/kamo/tex/grass_path_2_d.jpg`・`_n.jpg`（iPhone 向けは `_s` 付き） | Poly Haven「grass_path_2」 https://polyhaven.com/a/grass_path_2 | CC0 https://polyhaven.com/license | 色の図と凹凸の図（1024）をそのまま。iPhone 向けは縦横を半分にした |
| 質感（道） | `public/kamo/tex/asphalt_02_d.jpg`・`_n.jpg`（iPhone 向けは `_s` 付き） | Poly Haven「asphalt_02」 https://polyhaven.com/a/asphalt_02 | CC0 https://polyhaven.com/license | 色の図と凹凸の図（1024）をそのまま。iPhone 向けは縦横を半分にした |
| 質感（瓦屋根） | `public/kamo/tex/grey_roof_tiles_d.jpg`・`_n.jpg`（iPhone 向けは `_s` 付き） | Poly Haven「grey_roof_tiles」 https://polyhaven.com/a/grey_roof_tiles | CC0 https://polyhaven.com/license | 色の図と凹凸の図（1024）をそのまま。iPhone 向けは縦横を半分にした |
| 質感（コンクリートの壁と屋上・飛び石） | `public/kamo/tex/concrete_wall_004_d.jpg`・`_n.jpg`（iPhone 向けは `_s` 付き） | Poly Haven「concrete_wall_004」 https://polyhaven.com/a/concrete_wall_004 | CC0 https://polyhaven.com/license | 色の図と凹凸の図（1024）をそのまま。iPhone 向けは縦横を半分にした |
| 質感（しっくいの壁） | `public/kamo/tex/grey_plaster_02_d.jpg`・`_n.jpg`（iPhone 向けは `_s` 付き） | Poly Haven「grey_plaster_02」 https://polyhaven.com/a/grey_plaster_02 | CC0 https://polyhaven.com/license | 色の図と凹凸の図（1024）をそのまま。iPhone 向けは縦横を半分にした |
| 質感（木の皮（ケヤキ）） | `public/kamo/tex/japanese_zelkova_bark_d.jpg`・`_n.jpg`（iPhone 向けは `_s` 付き） | Poly Haven「japanese_zelkova_bark」 https://polyhaven.com/a/japanese_zelkova_bark | CC0 https://polyhaven.com/license | 色の図と凹凸の図（1024）をそのまま。iPhone 向けは縦横を半分にした |

- アプリ内の出典（設定 → この作品について）の「窓の外の町（鴨川）」にも同じ出典を載せている（`src/data/credits.js` の `CREDIT_MAPS`）
- OpenStreetMap から作った川・道・木・水面の範囲と高さのデータ（`public/kamo/roads.bin`・`public/kamo/misc.bin`・`public/kamo/terrain.bin`・`public/kamo/kamo.json`・便20 の `public/kamo/life.json`）は、元のデータと同じ ODbL 1.0 で提供する（LICENSE にも書いた）（作り方は `scripts/kamo/build.mjs`・`scripts/kamo/pack.mjs`）
- 実在の店の名前・看板・意匠は使っていない（建物は PLATEAU の形と高さだけ。便20 の出町桝形商店街のアーケードも、屋根と骨と提灯の形だけで、看板と文字は置いていない）
- 便20 の鴨川の町の場所（鴨川デルタと飛び石・糺の森・叡山電車・出町桝形商店街・大文字）は、森見登美彦さんの作品の舞台として知られる実在の場所。作品の人物・名前・作中の物は使っていない

## 共有の時の絵（og.jpg）

- `public/og.jpg` は、前の「実写の窓、夕暮れの町」の生成画像（Pollinations.AI / Flux＋Real-ESRGAN 超解像・上の表と同じ生成の扱い）から作った物。情景は撤去したが、共有の時の絵として今も配っている（作品名が前の「窓辺」のまま。作り直しは後の便）。Real-ESRGAN（https://github.com/xinntao/Real-ESRGAN ・BSD-3-Clause）は開発時の道具で、配る物には入れていない。

## 描画のライブラリ

- three.js（MIT・https://threejs.org/ ）— 立体の街の描画。アプリ内の出典（設定 → この作品について）にも載せている。

## 情景の一覧の小さな絵（サムネ）

- `public/thumbs/*.jpg` は、このアプリ自身の画面を撮って縮めた物（第三者の素材ではない）。撮り直しは `scripts/make-thumbs.mjs`。

## フォント

- 情景の描画は基本シェーダー計算と three.js の立体。~~写真は上の雨の窓の外の景色だけで使う。~~（【便18】下の行に改めた）
- 写真は、上の雨の窓の外の景色と、鴨川の町の質感の素材（Poly Haven・CC0）で使う。
- フォントは OS 標準（system-ui 等）のみ。同梱しない。
