# 便21 外の目（経緯を知らない見直し役）

- 見た物: `git diff da3eef4..HEAD -- src/engine/kamoTown.js src/engine/kamoPeople.js src/engine/kamoMarks.js scripts/kamo/{build,pack,fetch,kensa}.mjs scripts/kamo/bake.py`（HEAD＝42db45d。src は `git show HEAD:` で読んだ）。あわせて HEAD の public/kamo/kamo.json・public/sw.js・CREDITS.md・src/engine/kamoLife.js（変更なし）を読んだ。ビルドも検査も回していない
- 行の番号は HEAD のファイルの行
- 件数: 18 件（観点1 2件・観点2 4件・観点3 3件・観点4 6件〈観点5と重なる1件を含む〉・観点5 1件・観点6 1件・観点8 1件）。当たらない観点: 7

## 見つけた物（1件1行: 観点・ファイルと行・何が起きるか・直し方の案）

1. 観点1｜kamoTown.js 49行（loadKamo の `fetch(base + 'kamo.json')`）・203行・public/sw.js 96〜108行｜kamo のデータ（kamo.json・*.bin・lm_*.jpg）は service worker の MEDIA_CACHE（控えを先に返す・ビルドをまたいで残る）から返る。便17〜20 で鴨川を開いた端末は、出した直後の1回目に「新しい JS＋古い kamo.json（near に x0・x1・z0・z1・nx・nz が無い）」で組むことになる。四角の範囲の値には古いデータの逃げ道が無いので、NX0 などが undefined → 網・焼いた図の位置・飛べる箱が NaN になり、町が崩れるか黒い画になる（2回目に開くと直る）｜kamo の URL に版の札を付ける（kamo.json に `ver` を持たせ、`kamo.json?v=ビルドの札`・各 .bin も `?v=`）か、`meta.near.x0 === undefined` の時は「データが古い」として取り直す（`cache: 'reload'`）。sw.js で `/kamo/kamo.json` だけネット優先にするのも可
2. 観点1｜kamoTown.js 564行（`NSEG = Math.min(32, segs.length / 4)`）｜白いさざ波の線分は「堰 26＋飛び石の列 2＝28」で、上限 32 まで残り 4。堰が 5 本以上増えると、後ろに並べた飛び石の列の分から黙って切れ、飛び石の下流の白い筋が消える（エラーも検査の外れも出ない）｜飛び石の列を先に並べる・32 を超えたら console.warn と info に残す・K27 に `uNSeg === 線分の数` を足す
3. 観点2｜kamoPeople.js 75・83・84・141・142・145・188・189・194行｜毎こま new している: 歩く人1人あたり脚ごとに `new Quaternion`＋`new Vector3`（75）・`[[W.legL,1],[W.legR,-1]]` の配列、自転車ごとに `new Vector3` 2つ（83・84）、子どもごとに `new Vector3` 2つ（141・142）、`Object.values(WD)`（145）、花火の人ごとに `new Vector3` 3つと火花ごとに `new Vector3`＋`set([...])` の配列（188〜196）。夏の昼で毎こま 100 個前後のごみが出る｜関数の外に作り置きの Vector3・Quaternion（hd・fwd・off・hp・hand・tipP・dir・d）を置いて使い回し、脚の配列と `Object.values(WD)` は一度だけ作る。`pp.set([..])` は3つの代入に
4. 観点2｜kamoTown.js 408・430〜440行（川底の光の網と礫）・564〜600行（浅瀬の水）｜iPhone の段（low）で軽くしていない: 地形の全部の画素で水の深さの図を1回読み、水の下では kCaus（3回まわる sin・cos）を2回と 3×3 の礫の網（升ごとに sin 2つ）を計算する。CAUS＝0（夜・雨・雪）でも kCaus を計算して 0 を掛けている。水の画素では 28 本の線分の繰り返し＋流れの雑音で getNoise を2倍（図の読みが 4→8 回）｜CAUS＝0 の時は kCaus を差し込まない。low は礫の網を外す・線分を飛び石の列だけにする・流れの雑音を1つの位相にする。iPhone の段の描く時間を前と後で測る
5. 観点2｜kamoTown.js 153行（雲の dens）・178行｜雲は空の丸天井の全部の画素で dens を2回（日の側の陰のため）、dens 1回で fbm 2回＝1画素で fbm 4回（low でも 4 段×4 回＝雑音 16 回・sin 64 回）。窓の外の大半が空の構図では、iPhone の段の重さの元になりうる｜low は陰の dens を外す（c から作る）か、fbm を1回にする。iPhone の段の描く時間を前と後で測る
6. 観点2｜kamoPeople.js 168行（hLight）｜夏の夜（low でない時）に PointLight を1つ足すため、鴨川の舞台の MeshStandardMaterial の全部の画素で点の光の計算が1つ増える（花火の光が届くのは 14m だけなのに、町じゅうで払う）｜点の光をやめ、火花の Points の加算と、輪の地面に置く光の円（加算の板1枚）で代える
7. 観点3｜kensa.mjs 322〜338行（K27〜K32）｜K27〜K32 は `o.errs`・`o.gl`（コンソールのエラーと GL の警告）を見ていない。雲・浅瀬の水・川底の光の網・家並み・道の細かさのシェーダーが組めない（GLSL の誤り）時も、cloudMesh があり・差し替えの文字があり・データの数が足りていれば全部合格する｜この塊の open ごとに `o.errs.length === 0 && o.gl.length === 0` を合格の条件に足し、数を詳細に書く
8. 観点3｜kensa.mjs 323・325・328行（K27 の caus・K29・K32）｜K27 の `k.caus > 0` は時刻と天気から決まる定数（外し回し M1 の記録でも差し替えを外して 0.4 のまま）。K29 は詰めたデータの形の種類の数、K32 は kamo.json の名所の数で、描き方の差し替え（useKyo の `vec2 tuv = …` の置き換え・川底の光の網の置き換え）が黙って効かなくなっても落ちない。水の深さの図の上下（kUV と lmV の向き）が逆になっても落ちない｜waterRot・waterShallow と同じく、置き換えの後に「差し替えが効いたか」を onBeforeCompile の中で残し（kyoApplied・causApplied・road21Applied）、K27・K29 で見る。深さは JS の depthK と図の値が既知の水の点で合うかを見る
9. 観点3｜kensa.mjs（K27〜K32 の一覧）・mutate21.mjs｜道の細かさ（kamoroad=0）・木の樹冠と幹（kamotree=0）・通り庇だけ・夜の灯りの暈には検査も外し回しも無い。下の 10 の幹の行の不具合は、どの検査にも掛からずに通っている。なお mutate21-run.txt は見た時点で M1〜M5 の5行だけ（M6〜M10 の記録はまだ無い）｜K33 として road21 の差し替えが効いたかと `trunkMat.map.repeat.y === 2` を info に出して見る。mutate に kamoroad・kamotree を足す。M6〜M10 の結果を記録に揃える
10. 観点4・観点5｜kamoTown.js 834行（trunkMat）｜行の途中に `// 便21: 幹を暗く（明るい棒に見えた）` を置いたため、同じ行の後ろの `trunkMat.map.repeat.set(1, 2); trunkMat.normalMap.repeat.set(1, 2); …needsUpdate = true; keep(trunkMat.map); keep(trunkMat.normalMap)` が全部コメントになっている。幹の皮の模様が縦に2倍に伸び（kamotree=0 の「前の幹」も同じく変わる）、clone した2枚の図が disposables に入らず、鴨川を開き直すたびに GPU の図が残る｜コメントを行の末尾へ移すか、`;` の後で改行してから書く（メモリの「1行の途中に // を置かない」と同じ型）
11. 観点4｜kamoPeople.js 139〜142行（浅瀬の子ども）｜胴の回転（前かがみ 0.25〜0.5 rad）を足もと（原点）のまわりでかけ、脚は回していないので、かがむたびに胴の下の端が腰から前へ最大 0.4m（子どもは 0.3m）離れ、胴が脚から浮いて見える｜腰（0.86×s）を軸に回す: 位置を `w + R·(0,-0.86s,0) + (0,0.86s,0)` にしてから compose する
12. 観点4｜build.mjs 450〜455行（s＝8 の茂庵と addRoof）・kamoTown.js 323・330行（useKyo）・640行（大元宮だけ外す）・kamoMarks.js 72〜79行｜茂庵の建物（形の種類 8）は、useKyo に壁の描き方も屋根の描き方も無く、addRoof で足した寄棟の屋根（傾き 0.48・kN.y≒0.9）が「平らな屋上」の灰色の枝に入る。さらに kamoMarks が同じ点に 15m×6.2m の茂庵の箱と屋根を別に作るのに、PLATEAU の茂庵は大元宮のように外していないので、2つの建物が重なる見込み（撮った画で要確認）｜大元宮と同じく marks.moan のまわり 9〜14m の PLATEAU の建物を drop に入れるか、名所の茂庵を作らずに形の種類 8 の描き方を useKyo に足す。kyoCount のコメント（8 茂庵）も実装に合わせる
13. 観点4｜kamoTown.js 843〜845行（TREE21 の樹冠）・build.mjs 515行（クスノキ 樹高 14・幅 22）｜樹冠の中心を `h − 0.98×sc.y` にしたので、幅が高さに近い木ほど樹冠の下の端が地面より下へ出る（樹冠の形の下の端は中心から約 1.0×sc.y）。川岸の桜と柳（高さ 6・幅 9）で下の端が地面の約 1.7m 下、クスノキは下の端が約 −5m・上の端が約 18m（コメントの 14m より高い）。「棒付きの飴」を直したつもりが、地面に埋まった丸い茂みになりうる（撮った画で要確認）｜中心の高さに下限を置く（例: `max(h − 0.98·sc.y, sc.y × 1.05 + 1.2)`）か、クスノキだけ幅に合わせて sc.y を抑える
14. 観点4｜kamoLife.js 192行（`y: s[1] + 0.12`）・build.mjs（石 `waterAt + 0.12`）・kamoTown.js の新しい石の形（上の面が y＝0）｜便21 で石の上の面が置き場の高さ s[1] そのものになった（前は丸めた石で s[1]＋0.32）。渡る人の足は今も s[1]＋0.12 なので、石の上で 12cm 浮いて跳ぶ（前は 0.2m めり込んでいた）。kamoPeople の座る学生は s[1] に座るので合っている｜kamoLife の跳ぶ高さを s[1]＋0.01 にする（kamoLife の rnd の回る数は変わらない）。撮った画で確かめる
15. 観点4｜kamoTown.js 21〜25行（TIMES）｜見出しのコメントは「便17 の試作と同じ値」のまま、dusk の hemi の強さを 0.45→1.2 に変えている（environmentIntensity の方には便21 の理由が書いてある）｜dusk の行の末尾に「便21: 夕方の日の反対側の壁が沈んだので 1.2」を書く
16. 観点5｜kamoTown.js 90行（`window.__kamoScene`）・749〜752行（stoneM・concM・手すりの材）｜?dev=1 の時、鴨川を閉じた後も window が古い舞台をつかんだまま（開き直すたびに前の舞台全体が残る・検証の時だけ）。橋の材は部品が0個だと mk が先に戻り keep されない（使われないので GPU には載らず、実害は小さい）｜dispose() の中で `if (window.__kamoScene === scene) window.__kamoScene = null`。材は mk の前に keep する
17. 観点6｜build.mjs 293〜300行（町の R＝seed 1103 と森・公園の木）・fetch.mjs（OSM の範囲 rect(180)）｜kamoTown・kamoLife・kamoPeople の乱数の回る数は変えていない（木の1本ごとの R() の数は前のまま・kamoLife の飛び石の列は rnd を使わずに組む・kamoPeople は自分の rnd）。ただし build.mjs の町の R は、範囲を東へ広げて森と公園が増え（候補の数だけ R を回す）、OSM の取り方も変わったので、便20 の範囲（デルタと窓の前）の木の位置と高さまで引き直しになっている。窓から見える木の並びが便20 と変わる｜意図なら裁定記録か便の記録に1行書く。前の木を保ちたいなら、森ごとに OSM の番号から種を作る（森の並びと数に左右されない）
18. 観点8｜CREDITS.md 108〜112行（鴨川の町の表）｜便21 で CREDITS.md を直していない。「近く ±800m」（今は x −800〜1904・z −800〜904 の四角）・「建物 4,967 棟」（今は 11,953 棟）・「2.5cm 刻みの整数」（今は範囲の中心を引いて 4.5cm 刻み）・「PC と iPad は 4096・iPhone は 2048」（地形の図は横長になり縦横半分）が古い。OpenStreetMap の行の「使い方」に、今回足した名所（大学・神社・鳥居・茂庵・東屋・公園）・ベンチ・街灯・堰・水の深さが無い。新しい素材（写真・音）は増えていない（質感は前の Poly Haven の 7 種の使い回し・RoundedBoxGeometry は three.js 同梱）。外部の作品の模倣は見当たらない（名所は実在の建物を計算の形で組んだ物）｜表の 4 行を今の数と使い方に直し、アプリ内の出典も同じに揃える（CLAUDE.md の「出どころは CREDITS.md とアプリ内の出典に全数書く」）

## 当たらなかった観点

- 観点7（北寺尾・谷戸・前の角部屋 ?kamo=0）: 当たらない（差分は鴨川の部品 kamoTown・kamoPeople・kamoMarks と scripts/kamo だけで、town3dViewer・main・audio・sw.js は変えていない。TIMES の夕方の光・environmentIntensity は鴨川の舞台の中だけ。?kamo=0 は鴨川の町を組まない道で、今回の変更を通らない。K9・K11 の書き換えが使う `__town3dKamoTown` は便20 からある口）

## 観点表（~/.claude/skills/_shared/sotonome-kanten.md）の当て方

- #2 検査の弱まり＝上の 7〜9（K9・K11 の書き換えは M9・M10 で外す台本があるが、見た時点で結果の記録が無い）
- #5 識別子: 当たらない（差分・kamo.json に経緯度・本名・PC のユーザー名の道は無い。kamo.json の 135.7 はメートルの座標）
- #1 留まる帯・#3 機能の波及・#4 案の画と文・#6〜#14（報告・PDF・画・全テストの記録）: 当たらない（今回は差分だけを渡され、画面の帯・設定の鍵・案の画・報告の元・撮った画は見ていない。設定の鍵は増えていない＝外し回し用の ?kamo…=0 だけ）
