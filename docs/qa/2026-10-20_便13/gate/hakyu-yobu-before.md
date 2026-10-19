## 波及の照らし・呼ぶ所の一覧（_shared/hakyu.mjs --yobu・2026/10/20 8:26:04・直すファイルの定義 399 個）

直す関数・部品ごとに、呼ぶ所を並べた。呼ぶ所の画面・場面を、直す前と後で同じ撮り方で比べた画か検査の名を右の列に書く（比べない所は理由）。

| 関数・部品 | 定義の所 | 呼ぶ所（頭の8つ） | 前後で比べた画・検査 |
|---|---|---|---|
| `triggerTown3dFlash` | src/engine/town3dViewer.js:16 | src/engine/town3dViewer.js:10779・src/main.js:89 | |
| `lerp` | src/engine/town3dViewer.js:18 | scripts/_bin11-mutate.mjs:28・scripts/_bin12-inject.js:49・src/engine/renderer.js:384・src/engine/renderer.js:385・src/engine/renderer.js:386・src/engine/renderer.js:387・src/engine/renderer.js:388・src/engine/town3dViewer.js:397 ほか 78 | |
| `easeInOut` | src/engine/town3dViewer.js:22 | src/engine/renderer.js:464・src/engine/renderer.js:465・src/engine/town3dViewer.js:25・src/engine/town3dViewer.js:9709・src/engine/town3dViewer.js:9710・src/engine/town3dViewer.js:9711 | |
| `approach` | src/engine/town3dViewer.js:26 | src/engine/renderer.js:462・src/engine/renderer.js:463・src/engine/town3dViewer.js:9706・src/engine/town3dViewer.js:9707・src/engine/town3dViewer.js:9708・src/engine/town3dViewer.js:9787 | |
| `pitchLimits` | src/engine/town3dViewer.js:100 | src/engine/town3dViewer.js:143・src/engine/town3dViewer.js:9858 | |
| `yawLimit` | src/engine/town3dViewer.js:101 | src/engine/town3dViewer.js:142・src/engine/town3dViewer.js:9861 | |
| `makeGradient` | src/engine/town3dViewer.js:105 | scripts/_bin5-vite.config.mjs:13・src/engine/town3dViewer.js:604 | |
| `isTown3dActive` | src/engine/town3dViewer.js:116 | ★ほかに呼ぶ所が無い | |
| `applyTown3dTilt` | src/engine/town3dViewer.js:121 | scripts/qa-bin2-mutants.mjs:25・src/engine/town3dViewer.js:8068・src/main.js:105・src/main.js:110 | |
| `applyTown3dLook` | src/engine/town3dViewer.js:128 | src/engine/town3dViewer.js:99・src/engine/town3dViewer.js:9183・src/engine/town3dViewer.js:9184・src/engine/town3dViewer.js:9189・src/engine/town3dViewer.js:9198・src/engine/town3dViewer.js:10778・src/engine/town3dViewer.js:11254 | |
| `applyTown3dSteer` | src/engine/town3dViewer.js:151 | src/engine/town3dViewer.js:130・src/engine/town3dViewer.js:9188・src/engine/town3dViewer.js:10959・src/engine/town3dViewer.js:11247 | |
| `setTown3dCruise` | src/engine/town3dViewer.js:159 | src/engine/town3dViewer.js:10960 | |
| `setTown3dWindowOpen` | src/engine/town3dViewer.js:164 | src/main.js:398・src/main.js:429 | |
| `setTown3dLean` | src/engine/town3dViewer.js:169 | src/engine/town3dViewer.js:9185・src/main.js:403・src/main.js:430 | |
| `setTown3dFly` | src/engine/town3dViewer.js:177 | src/engine/town3dViewer.js:251・src/engine/town3dViewer.js:9186・src/engine/town3dViewer.js:9203・src/engine/town3dViewer.js:10774・src/main.js:408・src/main.js:431 | |
| `setTown3dHint` | src/engine/town3dViewer.js:210 | src/main.js:419 | |
| `setTown3dLand` | src/engine/town3dViewer.js:217 | src/engine/town3dViewer.js:9194・src/engine/town3dViewer.js:9200・src/engine/town3dViewer.js:10775・src/main.js:412・src/main.js:432 | |
| `isTown3dFlyable` | src/engine/town3dViewer.js:256 | src/main.js:416 | |
| `setTown3dSettings` | src/engine/town3dViewer.js:261 | src/main.js:366 | |
| `setTown3dPaused` | src/engine/town3dViewer.js:270 | scripts/qa-power2.mjs:1・src/engine/town3dViewer.js:8065・src/engine/town3dViewer.js:10770・src/main.js:283・src/main.js:304 | |
| `unmountTown3d` | src/engine/town3dViewer.js:274 | src/engine/town3dViewer.js:287・src/main.js:160・src/main.js:231・src/main.js:248 | |
| `mountTown3d` | src/engine/town3dViewer.js:286 | src/main.js:184 | |
| `landSurf` | src/engine/town3dViewer.js:374 | src/engine/town3dViewer.js:9992・src/engine/town3dViewer.js:9999 | |
| `isNight0` | src/engine/town3dViewer.js:395 | src/engine/town3dViewer.js:397 | |
| `applyMist` | src/engine/town3dViewer.js:416 | src/engine/town3dViewer.js:411・src/engine/town3dViewer.js:420・src/engine/town3dViewer.js:10719・src/engine/town3dViewer.js:10955 | |
| `rgbStr` | src/engine/town3dViewer.js:502 | src/engine/town3dViewer.js:504・src/engine/town3dViewer.js:505・src/engine/town3dViewer.js:7507 | |
| `snowify` | src/engine/town3dViewer.js:612 | scripts/qa-bin6-mutate.mjs:20・scripts/qa-bin9-mutate.mjs:20・src/data/scenes/shishigaya-window-3d-snow.js:3・src/data/scenes/shishigaya-window-3d-snow.js:14・src/engine/town3dViewer.js:625・src/engine/town3dViewer.js:1202・src/engine/town3dViewer.js:1270・src/engine/town3dViewer.js:1316 ほか 7 | |
| `smokePuffTex` | src/engine/town3dViewer.js:629 | src/engine/town3dViewer.js:638 | |
| `smokePuff` | src/engine/town3dViewer.js:638 | src/engine/town3dViewer.js:5005・src/engine/town3dViewer.js:5808 | |
| `addOutline` | src/engine/town3dViewer.js:643 | src/engine/town3dViewer.js:2294・src/engine/town3dViewer.js:2295・src/engine/town3dViewer.js:2297・src/engine/town3dViewer.js:2306・src/engine/town3dViewer.js:2502・src/engine/town3dViewer.js:2889・src/engine/town3dViewer.js:3300・src/engine/town3dViewer.js:3348 ほか 65 | |
| `makeWinTex` | src/engine/town3dViewer.js:653 | src/engine/town3dViewer.js:730・src/engine/town3dViewer.js:733 | |
| `rnd` | src/engine/town3dViewer.js:661 | scripts/_bin12-inject.js:57・scripts/_bin12-inject.js:59・scripts/_bin12-inject.js:60・scripts/_bin5-inject.js:52・scripts/_bin5-inject.js:55・scripts/_bin5-inject.js:56・scripts/_bin5-inject.js:60・scripts/_bin5-inject.js:70 ほか 40 | |
| `skyBright` | src/engine/town3dViewer.js:735 | src/engine/town3dViewer.js:736・src/engine/town3dViewer.js:10954 | |
| `rng` | src/engine/town3dViewer.js:748 | src/engine/town3dViewer.js:749・src/engine/town3dViewer.js:752 | |
| `withLocalR` | src/engine/town3dViewer.js:752 | scripts/qa-bin2-mutants.mjs:56・src/engine/town3dViewer.js:749・src/engine/town3dViewer.js:3477・src/engine/town3dViewer.js:3685・src/engine/town3dViewer.js:3723・src/engine/town3dViewer.js:7248 | |
| `skyMirrorGLSL` | src/engine/town3dViewer.js:787 | scripts/qa-bin4-mutate.mjs:9・scripts/qa-bin4-mutate.mjs:10・src/engine/town3dViewer.js:827・src/engine/town3dViewer.js:836・src/engine/town3dViewer.js:3860・src/engine/town3dViewer.js:3869 | |
| `freshWater` | src/engine/town3dViewer.js:808 | scripts/_bin3-inject.js:41・scripts/_bin3-inject.js:90・scripts/qa-bin4.mjs:72・scripts/qa-bin4.mjs:176・src/engine/town3dViewer.js:838・src/engine/town3dViewer.js:2404・src/engine/town3dViewer.js:3375・src/engine/town3dViewer.js:3978 ほか 8 | |
| `litFlicker` | src/engine/town3dViewer.js:859 | src/engine/town3dViewer.js:4365・src/engine/town3dViewer.js:4423・src/engine/town3dViewer.js:4484・src/engine/town3dViewer.js:4790・src/engine/town3dViewer.js:4797・src/engine/town3dViewer.js:4817 | |
| `rebuildColGrid` | src/engine/town3dViewer.js:866 | src/engine/town3dViewer.js:879・src/engine/town3dViewer.js:892 | |
| `blockedAt` | src/engine/town3dViewer.js:878 | scripts/qa-resclip.mjs:3・src/engine/town3dViewer.js:2658・src/engine/town3dViewer.js:2689・src/engine/town3dViewer.js:5263・src/engine/town3dViewer.js:6893・src/engine/town3dViewer.js:6894・src/engine/town3dViewer.js:6895・src/engine/town3dViewer.js:7138 ほか 38 | |
| `rectAt` | src/engine/town3dViewer.js:891 | src/engine/town3dViewer.js:4133・src/engine/town3dViewer.js:4535・src/engine/town3dViewer.js:4640・src/engine/town3dViewer.js:7486・src/engine/town3dViewer.js:11051 | |
| `inFestZone` | src/engine/town3dViewer.js:928 | src/engine/town3dViewer.js:3235・src/engine/town3dViewer.js:3473・src/engine/town3dViewer.js:3666 | |
| `ellipseIn` | src/engine/town3dViewer.js:950 | src/engine/town3dViewer.js:958・src/engine/town3dViewer.js:959・src/engine/town3dViewer.js:960・src/engine/town3dViewer.js:961・src/engine/town3dViewer.js:962・src/engine/town3dViewer.js:970・src/engine/town3dViewer.js:971・src/engine/town3dViewer.js:972 ほか 1 | |
| `rboxIn` | src/engine/town3dViewer.js:951 | src/engine/town3dViewer.js:957・src/engine/town3dViewer.js:969 | |
| `coastR` | src/engine/town3dViewer.js:952 | src/engine/town3dViewer.js:1011・src/engine/town3dViewer.js:1028・src/engine/town3dViewer.js:3968・src/engine/town3dViewer.js:4874 | |
| `edoStream` | src/engine/town3dViewer.js:954 | src/engine/town3dViewer.js:1139・src/engine/town3dViewer.js:3957・src/engine/town3dViewer.js:3961・src/engine/town3dViewer.js:4051・src/engine/town3dViewer.js:4131・src/engine/town3dViewer.js:7361・src/engine/town3dViewer.js:10299 | |
| `edoLand` | src/engine/town3dViewer.js:956 | src/engine/town3dViewer.js:1128・src/engine/town3dViewer.js:3968・src/engine/town3dViewer.js:3969・src/engine/town3dViewer.js:3984・src/engine/town3dViewer.js:4051・src/engine/town3dViewer.js:4078 | |
| `taishoCanal` | src/engine/town3dViewer.js:966 | src/engine/town3dViewer.js:1161・src/engine/town3dViewer.js:4639・src/engine/town3dViewer.js:4722・src/engine/town3dViewer.js:4744・src/engine/town3dViewer.js:4752・src/engine/town3dViewer.js:4829・src/engine/town3dViewer.js:7362・src/engine/town3dViewer.js:10299 | |
| `taishoLand` | src/engine/town3dViewer.js:968 | src/engine/town3dViewer.js:1149・src/engine/town3dViewer.js:4722・src/engine/town3dViewer.js:4752・src/engine/town3dViewer.js:4874・src/engine/town3dViewer.js:4875 | |
| `coastFoamMat` | src/engine/town3dViewer.js:979 | src/engine/town3dViewer.js:1023 | |
| `addCoastDetail` | src/engine/town3dViewer.js:1006 | scripts/qa-backlog.mjs:92・scripts/qa-backlog.mjs:139・src/engine/town3dViewer.js:3969・src/engine/town3dViewer.js:4875 | |
| `addMerged` | src/engine/town3dViewer.js:1036 | src/engine/town3dViewer.js:1037・src/engine/town3dViewer.js:1038・src/engine/town3dViewer.js:1039 | |
| `senValley` | src/engine/town3dViewer.js:1045 | src/engine/town3dViewer.js:1056・src/engine/town3dViewer.js:4326・src/engine/town3dViewer.js:4334・src/engine/town3dViewer.js:4386・src/engine/town3dViewer.js:4417・src/engine/town3dViewer.js:4429・src/engine/town3dViewer.js:4434・src/engine/town3dViewer.js:4438 ほか 18 | |
| `senH` | src/engine/town3dViewer.js:1049 | src/engine/town3dViewer.js:1063・src/engine/town3dViewer.js:1066・src/engine/town3dViewer.js:1067・src/engine/town3dViewer.js:1142・src/engine/town3dViewer.js:1143・src/engine/town3dViewer.js:4290・src/engine/town3dViewer.js:4291・src/engine/town3dViewer.js:4292 ほか 43 | |
| `senInland` | src/engine/town3dViewer.js:1065 | src/engine/town3dViewer.js:4395・src/engine/town3dViewer.js:4418・src/engine/town3dViewer.js:4430・src/engine/town3dViewer.js:4435・src/engine/town3dViewer.js:4439・src/engine/town3dViewer.js:4448・src/engine/town3dViewer.js:4572・src/engine/town3dViewer.js:4584 ほか 2 | |
| `undX` | src/engine/town3dViewer.js:1083 | src/engine/town3dViewer.js:1090・src/engine/town3dViewer.js:5395 | |
| `makeMottle` | src/engine/town3dViewer.js:1168 | src/engine/town3dViewer.js:1200 | |
| `mottleMat` | src/engine/town3dViewer.js:1199 | scripts/_bin5-vite.config.mjs:16・scripts/qa-bin6-mutate.mjs:17・scripts/qa-bin9-mutate.mjs:18・src/engine/town3dViewer.js:1789・src/engine/town3dViewer.js:1819・src/engine/town3dViewer.js:1837・src/engine/town3dViewer.js:1853・src/engine/town3dViewer.js:1919 ほか 33 | |
| `bakeGroundVColors` | src/engine/town3dViewer.js:1206 | src/engine/town3dViewer.js:1220・src/engine/town3dViewer.js:3947・src/engine/town3dViewer.js:4602 | |
| `beachTint` | src/engine/town3dViewer.js:1222 | src/engine/town3dViewer.js:3951・src/engine/town3dViewer.js:4606 | |
| `makeFacade` | src/engine/town3dViewer.js:1235 | src/engine/town3dViewer.js:1270 | |
| `facadeMat` | src/engine/town3dViewer.js:1270 | src/engine/town3dViewer.js:1283・src/engine/town3dViewer.js:1293・src/engine/town3dViewer.js:4709・src/engine/town3dViewer.js:4781・src/engine/town3dViewer.js:4783・src/engine/town3dViewer.js:4836・src/engine/town3dViewer.js:4845・src/engine/town3dViewer.js:4849 ほか 1 | |
| `getMachiyaGlow` | src/engine/town3dViewer.js:1273 | src/engine/town3dViewer.js:1283 | |
| `machiyaMat` | src/engine/town3dViewer.js:1283 | src/engine/town3dViewer.js:4014・src/engine/town3dViewer.js:4070・src/engine/town3dViewer.js:4195・src/engine/town3dViewer.js:4212・src/engine/town3dViewer.js:4236 | |
| `getSamaGlow` | src/engine/town3dViewer.js:1286 | src/engine/town3dViewer.js:1293 | |
| `samaMat` | src/engine/town3dViewer.js:1293 | src/engine/town3dViewer.js:4367・src/engine/town3dViewer.js:4369 | |
| `getYofuGlow` | src/engine/town3dViewer.js:1296 | src/engine/town3dViewer.js:4709 | |
| `bakeAO` | src/engine/town3dViewer.js:1303 | src/engine/town3dViewer.js:4056・src/engine/town3dViewer.js:4403・src/engine/town3dViewer.js:4731 | |
| `makeTileTex` | src/engine/town3dViewer.js:1305 | src/engine/town3dViewer.js:1316 | |
| `tileMat` | src/engine/town3dViewer.js:1316 | src/engine/town3dViewer.js:4026・src/engine/town3dViewer.js:4196・src/engine/town3dViewer.js:4213・src/engine/town3dViewer.js:4230・src/engine/town3dViewer.js:4367・src/engine/town3dViewer.js:4712・src/engine/town3dViewer.js:4782・src/engine/town3dViewer.js:4837 ほか 2 | |
| `makeStoneTex` | src/engine/town3dViewer.js:1319 | src/engine/town3dViewer.js:1340 | |
| `stoneMat` | src/engine/town3dViewer.js:1340 | src/engine/town3dViewer.js:3294・src/engine/town3dViewer.js:3307・src/engine/town3dViewer.js:3310・src/engine/town3dViewer.js:3311・src/engine/town3dViewer.js:3313・src/engine/town3dViewer.js:3320・src/engine/town3dViewer.js:3321・src/engine/town3dViewer.js:3322 ほか 17 | |
| `makeBrickTex` | src/engine/town3dViewer.js:1343 | src/engine/town3dViewer.js:1361 | |
| `brickMat` | src/engine/town3dViewer.js:1361 | src/engine/town3dViewer.js:4682 | |
| `signMat` | src/engine/town3dViewer.js:1364 | src/engine/town3dViewer.js:1377・src/engine/town3dViewer.js:1383・src/engine/town3dViewer.js:4215 | |
| `mkSignV` | src/engine/town3dViewer.js:1375 | src/engine/town3dViewer.js:4119・src/engine/town3dViewer.js:4590 | |
| `mkSignH` | src/engine/town3dViewer.js:1382 | src/engine/town3dViewer.js:2854・src/engine/town3dViewer.js:4826 | |
| `mkButterfly` | src/engine/town3dViewer.js:1388 | src/engine/town3dViewer.js:4901・src/engine/town3dViewer.js:5560 | |
| `mkDragonfly` | src/engine/town3dViewer.js:1389 | src/engine/town3dViewer.js:4903・src/engine/town3dViewer.js:5561 | |
| `mkQuad` | src/engine/town3dViewer.js:1395 | scripts/qa-charbody.mjs:54・scripts/qa-charbody.mjs:57・scripts/qa-charbody.mjs:127・src/engine/town3dViewer.js:4125・src/engine/town3dViewer.js:4436・src/engine/town3dViewer.js:4807・src/engine/town3dViewer.js:4905・src/engine/town3dViewer.js:10990 | |
| `part` | src/engine/town3dViewer.js:1402 | src/engine/town3dViewer.js:1414・src/engine/town3dViewer.js:1415・src/engine/town3dViewer.js:1416・src/engine/town3dViewer.js:1421・src/engine/town3dViewer.js:1422・src/engine/town3dViewer.js:1424・src/engine/town3dViewer.js:1425・src/engine/town3dViewer.js:1426 ほか 22 | |
| `merge` | src/engine/town3dViewer.js:1409 | scripts/qa-merge.mjs:16・scripts/qa-merge.mjs:19・scripts/qa-mergediff.mjs:7・scripts/qa-mergescenes.mjs:12・src/engine/town3dViewer.js:1417・src/engine/town3dViewer.js:1466・src/engine/town3dViewer.js:6661 | |
| `mkLeg` | src/engine/town3dViewer.js:1411 | src/engine/town3dViewer.js:1434・src/engine/town3dViewer.js:1448・src/engine/town3dViewer.js:1464 | |
| `makeStall` | src/engine/town3dViewer.js:1472 | src/engine/town3dViewer.js:4124・src/engine/town3dViewer.js:4431・src/engine/town3dViewer.js:4806 | |
| `makeCargo` | src/engine/town3dViewer.js:1488 | src/engine/town3dViewer.js:4116・src/engine/town3dViewer.js:4440 | |
| `mkCar` | src/engine/town3dViewer.js:1500 | src/engine/town3dViewer.js:2642・src/engine/town3dViewer.js:2785・src/engine/town3dViewer.js:11021・src/engine/town3dViewer.js:11022 | |
| `lightPool` | src/engine/town3dViewer.js:1512 | src/engine/town3dViewer.js:3705・src/engine/town3dViewer.js:4424・src/engine/town3dViewer.js:4817 | |
| `addContactShadows` | src/engine/town3dViewer.js:1519 | src/engine/town3dViewer.js:4139・src/engine/town3dViewer.js:4539・src/engine/town3dViewer.js:4833・src/engine/town3dViewer.js:8893・src/engine/town3dViewer.js:9095 | |
| `festOn` | src/engine/town3dViewer.js:1533 | scripts/qa-bin2-mutants.mjs:54・scripts/qa-bin2-mutants.mjs:56・scripts/qa-bin2.mjs:308・src/engine/town3dViewer.js:3477・src/engine/town3dViewer.js:3685・src/engine/town3dViewer.js:3723 | |
| `queueCloudFolk` | src/engine/town3dViewer.js:1540 | scripts/qa-backlog.mjs:117・src/engine/town3dViewer.js:6017・src/engine/town3dViewer.js:6018・src/engine/town3dViewer.js:6122・src/engine/town3dViewer.js:6123・src/engine/town3dViewer.js:6124・src/engine/town3dViewer.js:6125・src/engine/town3dViewer.js:6223 | |
| `folkBody` | src/engine/town3dViewer.js:1542 | scripts/qa-folkpin2.mjs:1・src/engine/town3dViewer.js:10983 | |
| `mkCrowdPerson` | src/engine/town3dViewer.js:1556 | scripts/qa-backlog.mjs:104・scripts/qa-backlog.mjs:106・scripts/qa-backlog.mjs:116・scripts/qa-charbody.mjs:60・scripts/qa-charcast.mjs:103・scripts/qa-charcast.mjs:104・scripts/qa-charcast.mjs:153・scripts/qa-charcost.mjs:50 ほか 22 | |
| `bake` | src/engine/town3dViewer.js:1559 | src/engine/town3dViewer.js:1561・src/engine/town3dViewer.js:1563・src/engine/town3dViewer.js:1564・src/engine/town3dViewer.js:1565・src/engine/town3dViewer.js:1566・src/engine/town3dViewer.js:1567・src/engine/town3dViewer.js:1568・src/engine/town3dViewer.js:1569 ほか 25 | |
| `mkWalkerFig` | src/engine/town3dViewer.js:1601 | scripts/qa-diag2.mjs:57・src/engine/town3dViewer.js:4120・src/engine/town3dViewer.js:4586・src/engine/town3dViewer.js:9802 | |
| `paint` | src/engine/town3dViewer.js:1605 | scripts/qa-paint.mjs:10・src/engine/town3dViewer.js:1608・src/engine/town3dViewer.js:1609・src/engine/town3dViewer.js:1610・src/engine/town3dViewer.js:1611・src/engine/town3dViewer.js:1612・src/engine/town3dViewer.js:1613・src/engine/town3dViewer.js:1614 ほか 7 | |
| `festPad` | src/engine/town3dViewer.js:1637 | src/engine/town3dViewer.js:1645・src/engine/town3dViewer.js:1717 | |
| `makeFestival` | src/engine/town3dViewer.js:1643 | scripts/qa-bin2-mutants.mjs:56・src/engine/town3dViewer.js:3477・src/engine/town3dViewer.js:3685 | |
| `reserveFestival` | src/engine/town3dViewer.js:1706 | scripts/qa-bin2-mutants.mjs:54・src/engine/town3dViewer.js:1701・src/engine/town3dViewer.js:3477・src/engine/town3dViewer.js:3685 | |
| `reserveSummerFes` | src/engine/town3dViewer.js:1710 | src/engine/town3dViewer.js:1754・src/engine/town3dViewer.js:3723 | |
| `makeSummerFes` | src/engine/town3dViewer.js:1715 | src/engine/town3dViewer.js:3723 | |
| `colGeo` | src/engine/town3dViewer.js:1928 | src/engine/town3dViewer.js:1929・src/engine/town3dViewer.js:2007・src/engine/town3dViewer.js:2008・src/engine/town3dViewer.js:2010・src/engine/town3dViewer.js:2013・src/engine/town3dViewer.js:2014・src/engine/town3dViewer.js:2015・src/engine/town3dViewer.js:2019 ほか 13 | |
| `bakeColGeo` | src/engine/town3dViewer.js:1929 | src/engine/town3dViewer.js:1938・src/engine/town3dViewer.js:1939・src/engine/town3dViewer.js:1940・src/engine/town3dViewer.js:1942・src/engine/town3dViewer.js:1943・src/engine/town3dViewer.js:1945・src/engine/town3dViewer.js:1947・src/engine/town3dViewer.js:2730 ほか 3 | |
| `addRoofClutter` | src/engine/town3dViewer.js:1934 | src/engine/town3dViewer.js:2048・src/engine/town3dViewer.js:2080 | |
| `wallAO` | src/engine/town3dViewer.js:1952 | src/engine/town3dViewer.js:1985 | |
| `house` | src/engine/town3dViewer.js:1963 | scripts/qa-diag2.mjs:49・scripts/qa-diag2.mjs:50・scripts/qa-poly.mjs:23・scripts/qa-yato-inspect.mjs:25・src/engine/town3dViewer.js:853・src/engine/town3dViewer.js:1070・src/engine/town3dViewer.js:1990・src/engine/town3dViewer.js:1991 ほか 13 | |
| `wvi` | src/engine/town3dViewer.js:1972 | src/engine/town3dViewer.js:1973・src/engine/town3dViewer.js:1975・src/engine/town3dViewer.js:1977 | |
| `sx2` | src/engine/town3dViewer.js:2006 | src/engine/town3dViewer.js:1192・src/engine/town3dViewer.js:1265・src/engine/town3dViewer.js:1300・src/engine/town3dViewer.js:3470・src/engine/town3dViewer.js:4105・src/engine/town3dViewer.js:4106・src/engine/town3dViewer.js:4107・src/engine/town3dViewer.js:4108 ほか 2 | |
| `ahs` | src/engine/town3dViewer.js:2055 | ★ほかに呼ぶ所が無い | |
| `foot` | src/engine/town3dViewer.js:2101 | src/engine/town3dViewer.js:2105・src/engine/town3dViewer.js:3310・src/engine/town3dViewer.js:3314・src/engine/town3dViewer.js:3432・src/engine/town3dViewer.js:3436・src/engine/town3dViewer.js:9231・src/engine/town3dViewer.js:9236 | |

- 2字以下の名は数えていない: dS・a・sw・n・ri・lw・hs・hr（中の小さな関数の見込み。直すなら --funcs で名指す）

- 呼ぶ所が150を超える名は一般的すぎて並べていない: isNight（304）・toon（519）・heightAt（328）（直すなら呼ぶ所をファイルで絞って見る）

