## 波及の照らし・呼ぶ所の一覧（_shared/hakyu.mjs --yobu・2026/11/2 23:20:18・直すファイルの定義 547 個）

直す関数・部品ごとに、呼ぶ所を並べた。呼ぶ所の画面・場面を、直す前と後で同じ撮り方で比べた画か検査の名を右の列に書く（比べない所は理由）。

| 関数・部品 | 定義の所 | 呼ぶ所（頭の8つ） | 前後で比べた画・検査 |
|---|---|---|---|
| `loadTown3d` | src/main.js:17 | src/main.js:184 | |
| `loadSplat` | src/main.js:18 | src/main.js:164 | |
| `resolveScene` | src/main.js:58 | scripts/qa-bin2-mutants.mjs:116・src/main.js:370・src/main.js:427 | |
| `start` | src/main.js:62 | scripts/qa-audio.mjs:9・scripts/qa-bin2.mjs:817・scripts/qa-catchase.mjs:14・scripts/qa-catchase.mjs:15・scripts/qa-chalk.mjs:17・scripts/qa-cpuprof.mjs:21・scripts/qa-debug-walk.mjs:86・scripts/qa-fest-audio.mjs:29 ほか 70 | |
| `applyReduceMotion` | src/main.js:82 | src/main.js:83・src/main.js:84 | |
| `firstShaderScene` | src/main.js:118 | src/main.js:119 | |
| `applyScene` | src/main.js:135 | scripts/qa-bin2-mutants.mjs:116・scripts/qa-sweep.mjs:23・scripts/qa-sweep3d.mjs:13・src/main.js:225・src/main.js:357・src/main.js:370・src/main.js:427・src/main.js:441 | |
| `cancelSleep` | src/main.js:276 | src/engine/renderer.js:533・src/main.js:311・src/main.js:316 | |
| `startSleepFade` | src/main.js:289 | src/main.js:312・src/main.js:433 | |
| `ramp` | src/main.js:295 | src/audio/audio.js:176・src/audio/audio.js:179・src/main.js:299・src/main.js:308 | |
| `onSleepTimer` | src/main.js:310 | src/main.js:359・src/ui/ui.js:28・src/ui/ui.js:751 | |
| `maybeLookDemo` | src/main.js:321 | src/main.js:382・src/main.js:436 | |
| `cancel` | src/main.js:329 | src/engine/town3dViewer.js:9159・src/main.js:330・src/main.js:334・src/main.js:337 | |
| `onApplyScene` | src/main.js:356 | src/ui/ui.js:18・src/ui/ui.js:597 | |
| `onSettings` | src/main.js:361 | src/ui/ui.js:19・src/ui/ui.js:657・src/ui/ui.js:666・src/ui/ui.js:686・src/ui/ui.js:705・src/ui/ui.js:727 | |
| `onAudioStart` | src/main.js:381 | src/ui/ui.js:20・src/ui/ui.js:67 | |
| `onToggleMute` | src/main.js:389 | src/ui/ui.js:21・src/ui/ui.js:137 | |
| `onVolume` | src/main.js:393 | src/ui/ui.js:22・src/ui/ui.js:141 | |
| `onToggleWindow` | src/main.js:397 | src/ui/ui.js:23・src/ui/ui.js:234・src/ui/ui.js:256・src/ui/ui.js:267 | |
| `onToggleLean` | src/main.js:402 | src/ui/ui.js:24・src/ui/ui.js:235・src/ui/ui.js:257・src/ui/ui.js:266 | |
| `onToggleFly` | src/main.js:407 | src/ui/ui.js:25・src/ui/ui.js:228・src/ui/ui.js:232・src/ui/ui.js:258 | |
| `onToggleLand` | src/main.js:411 | src/ui/ui.js:26・src/ui/ui.js:259・src/ui/ui.js:260 | |
| `isFlyable` | src/main.js:415 | src/ui/ui.js:27・src/ui/ui.js:202 | |
| `onShowHint` | src/main.js:418 | src/ui/ui.js:30・src/ui/ui.js:187 | |
| `buildUI` | src/ui/ui.js:14 | src/main.js:9・src/main.js:353 | |
| `intensityApplies` | src/ui/ui.js:43 | src/ui/ui.js:45 | |
| `syncIntensityRow` | src/ui/ui.js:44 | src/ui/ui.js:600・src/ui/ui.js:669 | |
| `startExperience` | src/ui/ui.js:60 | src/ui/ui.js:74・src/ui/ui.js:78 | |
| `maybeShowLookHint` | src/ui/ui.js:87 | src/ui/ui.js:72・src/ui/ui.js:187 | |
| `dismiss` | src/ui/ui.js:101 | src/ui/ui.js:105・src/ui/ui.js:107 | |
| `showSceneToast` | src/ui/ui.js:146 | src/ui/ui.js:151・src/ui/ui.js:595・src/ui/ui.js:820 | |
| `fade` | src/ui/ui.js:172 | scripts/_bin10-variants-sea.js:15・scripts/_bin10-variants-sea.js:32・scripts/qa-bin6-mutate.mjs:21・scripts/qa-cloudfade.mjs:23・scripts/verify-room.mjs:1・src/main.js:128・src/shaders/windowSea.js:146・src/shaders/windowSea.js:163 ほか 2 | |
| `isRoof` | src/ui/ui.js:198 | src/ui/ui.js:205・src/ui/ui.js:206・src/ui/ui.js:210・src/ui/ui.js:247・src/ui/ui.js:257 | |
| `canFly` | src/ui/ui.js:201 | scripts/qa-ux212.mjs:17・src/ui/ui.js:211・src/ui/ui.js:232・src/ui/ui.js:247・src/ui/ui.js:258 | |
| `openLabel` | src/ui/ui.js:205 | src/ui/ui.js:209 | |
| `closeLabel` | src/ui/ui.js:206 | src/ui/ui.js:220 | |
| `stageLabel` | src/ui/ui.js:208 | src/ui/ui.js:237 | |
| `backLabel` | src/ui/ui.js:217 | src/ui/ui.js:238 | |
| `stopAloft` | src/ui/ui.js:227 | src/ui/ui.js:265 | |
| `updateWindowBtn` | src/ui/ui.js:230 | src/ui/ui.js:261・src/ui/ui.js:268・src/ui/ui.js:273・src/ui/ui.js:599・src/ui/ui.js:825・src/ui/ui.js:842 | |
| `advance` | src/ui/ui.js:255 | src/ui/ui.js:271 | |
| `regress` | src/ui/ui.js:264 | src/ui/ui.js:272 | |
| `syncSleepChips` | src/ui/ui.js:294 | scripts/qa-bin2-mutants.mjs:19・src/ui/ui.js:750・src/ui/ui.js:757・src/ui/ui.js:830 | |
| `syncTiltChip` | src/ui/ui.js:295 | src/ui/ui.js:701・src/ui/ui.js:834 | |
| `anyPanelOpen` | src/ui/ui.js:320 | src/ui/ui.js:330 | |
| `poke` | src/ui/ui.js:326 | scripts/_bin13-shot.mjs:7・scripts/qa-bin2.mjs:412・scripts/qa-bin2.mjs:466・scripts/qa-bin2.mjs:577・scripts/qa-bin2.mjs:801・scripts/qa-bin2.mjs:840・scripts/qa-ux212.mjs:15・src/engine/renderer.js:618 ほか 29 | |
| `buildJournalPanel` | src/ui/ui.js:339 | src/ui/ui.js:284 | |
| `fmtDur` | src/ui/ui.js:351 | src/ui/ui.js:368 | |
| `render` | src/ui/ui.js:357 | scripts/_bin10-measure3d.mjs:57・scripts/_bin10-measure3d.mjs:58・scripts/_bin10-measure3d.mjs:78・scripts/_bin10-measure3d.mjs:81・scripts/_bin10-measure3d.mjs:111・scripts/_bin10-measure3d.mjs:340・scripts/_bin10-measure3d.mjs:366・scripts/_bin11-kumo-check.mjs:47 ほか 137 | |
| `seenMap` | src/ui/ui.js:361 | src/ui/ui.js:362・src/ui/ui.js:373 | |
| `buildCreditsPanel` | src/ui/ui.js:409 | src/ui/ui.js:288 | |
| `section` | src/ui/ui.js:422 | src/ui/ui.js:442・src/ui/ui.js:443・src/ui/ui.js:444 | |
| `buildScenePanel` | src/ui/ui.js:454 | src/ui/ui.js:276 | |
| `cardEl` | src/ui/ui.js:530 | scripts/qa-bin2-mutants.mjs:71・src/ui/ui.js:548・src/ui/ui.js:563 | |
| `renderPlaces` | src/ui/ui.js:544 | src/ui/ui.js:560・src/ui/ui.js:589・src/ui/ui.js:616 | |
| `renderScenes` | src/ui/ui.js:556 | src/ui/ui.js:549 | |
| `applyFilter` | src/ui/ui.js:571 | src/ui/ui.js:482・src/ui/ui.js:553・src/ui/ui.js:568 | |
| `markCurrent` | src/ui/ui.js:582 | src/ui/ui.js:553・src/ui/ui.js:568・src/ui/ui.js:598 | |
| `selectScene` | src/ui/ui.js:591 | src/ui/ui.js:564・src/ui/ui.js:606 | |
| `buildSettingsPanel` | src/ui/ui.js:629 | src/ui/ui.js:296 | |
| `syncFs` | src/ui/ui.js:712 | src/ui/ui.js:718 | |
| `makeSlider` | src/ui/ui.js:799 | src/ui/ui.js:649・src/ui/ui.js:664 | |
| `setSceneLabel` | src/ui/ui.js:818 | ★ほかに呼ぶ所が無い | |
| `setLocation` | src/ui/ui.js:823 | src/main.js:220 | |
| `setSleep` | src/ui/ui.js:828 | scripts/qa-bin2-mutants.mjs:21・src/main.js:303 | |
| `setTilt` | src/ui/ui.js:833 | src/main.js:385 | |
| `resetWindow` | src/ui/ui.js:837 | src/main.js:155 | |
| `findScene` | src/data/scenes/index.js:68 | src/data/scenes/index.js:76 | |
| `isReady` | src/data/scenes/index.js:75 | src/engine/town3dViewer.js:10847 | |
| `nowAxes` | src/data/scenes/index.js:87 | src/data/scenes/index.js:98 | |
| `pickNowScene` | src/data/scenes/index.js:97 | scripts/_shindan-1027-pick.mjs:2・scripts/_shindan-1027-pick.mjs:4・src/main.js:3・src/main.js:65・src/main.js:69・src/ui/ui.js:4・src/ui/ui.js:606 | |
| `score` | src/data/scenes/index.js:101 | src/data/scenes/index.js:115・src/data/scenes/index.js:122・src/engine/town3dViewer.js:8275・src/engine/town3dViewer.js:8276・src/engine/town3dViewer.js:8309・src/engine/town3dViewer.js:8310 | |
| `createAudio` | src/audio/audio.js:10 | src/main.js:8・src/main.js:87 | |
| `onCue` | src/audio/audio.js:11 | src/audio/audio.js:282・src/audio/audio.js:283・src/engine/events2d.js:3・src/main.js:88 | |
| `later` | src/audio/audio.js:32 | src/audio/audio.js:234・src/audio/audio.js:277 | |
| `urlOf` | src/audio/audio.js:39 | src/audio/audio.js:152 | |
| `targetVol` | src/audio/audio.js:41 | src/audio/audio.js:372・src/audio/audio.js:821 | |
| `makeSilentWavUrl` | src/audio/audio.js:52 | src/audio/audio.js:71 | |
| `unlockMediaSession` | src/audio/audio.js:67 | src/audio/audio.js:100・src/audio/audio.js:768 | |
| `resume` | src/audio/audio.js:80 | scripts/qa-bin2-mutants.mjs:33・scripts/qa-bin2.mjs:129・scripts/qa-bin2.mjs:130・src/audio/audio.js:81・src/audio/audio.js:82・src/audio/audio.js:96・src/audio/audio.js:99・src/audio/audio.js:142 ほか 7 | |
| `bindRearm` | src/audio/audio.js:92 | src/audio/audio.js:144 | |
| `rearm` | src/audio/audio.js:95 | src/audio/audio.js:104・src/audio/audio.js:107・src/audio/audio.js:108・src/audio/audio.js:109・src/audio/audio.js:141・src/audio/audio.js:763 | |
| `ensureContext` | src/audio/audio.js:112 | src/audio/audio.js:766 | |
| `loadBuffer` | src/audio/audio.js:149 | src/audio/audio.js:344 | |
| `smooth01` | src/audio/audio.js:169 | src/audio/audio.js:171・src/audio/audio.js:172 | |
| `dayFadeMul` | src/audio/audio.js:170 | src/audio/audio.js:178・src/audio/audio.js:186 | |
| `applyLayerGain` | src/audio/audio.js:176 | src/audio/audio.js:795・src/audio/audio.js:947・src/audio/audio.js:956 | |
| `startLoop` | src/audio/audio.js:181 | src/audio/audio.js:358 | |
| `initMul` | src/audio/audio.js:186 | src/audio/audio.js:187 | |
| `schedule` | src/audio/audio.js:212 | src/audio/audio.js:217・src/audio/audio.js:234・src/audio/audio.js:236・src/audio/audio.js:526・src/audio/audio.js:528・src/engine/events2d.js:52・src/engine/events2d.js:68 | |
| `playCue` | src/audio/audio.js:241 | src/audio/audio.js:285・src/audio/audio.js:362 | |
| `scheduleInterval` | src/audio/audio.js:272 | src/audio/audio.js:360 | |
| `next` | src/audio/audio.js:274 | scripts/qa-bin2-mutants.mjs:153・scripts/qa-bin2.mjs:328・scripts/qa-bin4-mutate.mjs:13・src/audio/audio.js:288・src/audio/audio.js:291・src/engine/town3dViewer.js:8892・src/engine/town3dViewer.js:8893・src/engine/town3dViewer.js:8894 ほか 25 | |
| `delay` | src/audio/audio.js:276 | src/audio/audio.js:233・src/audio/audio.js:234・src/audio/audio.js:289 | |
| `stopAllNodes` | src/audio/audio.js:295 | src/audio/audio.js:336 | |
| `playScene` | src/audio/audio.js:323 | src/audio/audio.js:780・src/audio/audio.js:814 | |
| `loops` | src/audio/audio.js:341 | scripts/qa-bin2.mjs:97・src/audio/audio.js:352・src/audio/audio.js:353・src/audio/audio.js:785 | |
| `startWind` | src/audio/audio.js:384 | src/audio/audio.js:773 | |
| `startPurr` | src/audio/audio.js:406 | src/audio/audio.js:875 | |
| `startWater` | src/audio/audio.js:424 | src/audio/audio.js:774 | |
| `startFestival` | src/audio/audio.js:478 | src/audio/audio.js:775 | |
| `taiko` | src/audio/audio.js:494 | src/audio/audio.js:521 | |
| `kane` | src/audio/audio.js:505 | src/audio/audio.js:522 | |
| `setFestival` | src/audio/audio.js:531 | scripts/qa-fest-audio.mjs:31・scripts/qa-fest-audio.mjs:33・scripts/qa-fest-audio.mjs:36・scripts/qa-fest-audio.mjs:37・src/audio/audio.js:473・src/audio/audio.js:585・src/audio/audio.js:808 | |
| `startStation` | src/audio/audio.js:543 | src/audio/audio.js:776 | |
| `trainPass` | src/audio/audio.js:553 | src/audio/audio.js:567 | |
| `tick` | src/audio/audio.js:565 | scripts/_bin3-inject.js:28・scripts/_bin5-inject.js:28・scripts/qa-bin4.mjs:58・scripts/qa-bin6.mjs:60・scripts/qa-gate-baseline.mjs:34・scripts/qa-gate-baseline.mjs:37・scripts/qa-walk5.mjs:59・scripts/qa-walk5.mjs:61 ほか 8 | |
| `setStation` | src/audio/audio.js:574 | src/audio/audio.js:539・src/audio/audio.js:586・src/audio/audio.js:810 | |
| `setAmbience` | src/audio/audio.js:584 | scripts/qa-fest-audio.mjs:31・src/audio/audio.js:420・src/audio/audio.js:454・src/audio/audio.js:774・src/audio/audio.js:797・src/audio/audio.js:806・src/main.js:212 | |
| `startMusicBed` | src/audio/audio.js:622 | src/audio/audio.js:779 | |
| `setMusicBed` | src/audio/audio.js:650 | src/audio/audio.js:644・src/audio/audio.js:779・src/audio/audio.js:804・src/engine/town3dViewer.js:10444・src/main.js:151・src/main.js:213 | |

- 2字以下の名は数えていない: bg・h・j・gi・wr（中の小さな関数の見込み。直すなら --funcs で名指す）

- 呼ぶ所が150を超える名は一般的すぎて並べていない: wait（210）・step（228）・open（167）・now（245）（直すなら呼ぶ所をファイルで絞って見る）

