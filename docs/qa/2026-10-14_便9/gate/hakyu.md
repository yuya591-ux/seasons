## 波及の照らし（_shared/hakyu.mjs・2026/10/14 22:40:13・702a1bb から足した行の鍵 8 個）

鍵ごとに、ほかに読む・書く所を並べた。書き出し・読み込み・はじめの案内・すべて既定に戻す・README の戻し方が、その鍵を扱っているかを右の列に書く（扱わないなら理由）。

| 鍵 | 足した所 | ほかに読む・書く所（頭の6つ） | 書き出し・読み込み・案内・既定に戻す・README |
|---|---|---|---|
| `lawn` | scripts/qa-bin6.mjs:326 | scripts/qa-bin6.mjs:190・scripts/qa-bin6.mjs:199・scripts/qa-bin6.mjs:234・scripts/qa-bin6.mjs:236・scripts/qa-bin6.mjs:237・scripts/qa-bin6.mjs:238 ほか 2 | |
| `npm` | scripts/qa-bin9-all.mjs:8 | .github/workflows/deploy.yml:27・.github/workflows/deploy.yml:28・.github/workflows/deploy.yml:32・CREDITS.md:138・README.md:50・README.md:51 ほか 62 | |
| `run` | scripts/qa-bin9-all.mjs:8 | .github/workflows/deploy.yml:21・.github/workflows/deploy.yml:27・.github/workflows/deploy.yml:28・.github/workflows/deploy.yml:31・.github/workflows/deploy.yml:32・.github/workflows/deploy.yml:39 ほか 133 | |
| `build` | scripts/qa-bin9-all.mjs:8 | .github/workflows/deploy.yml:20・.github/workflows/deploy.yml:28・.github/workflows/deploy.yml:38・README.md:52・package-lock.json:918・package-lock.json:936 ほか 85 | |
| `smoke` | scripts/qa-bin9-all.mjs:9 | .github/workflows/deploy.yml:32・package.json:10・scripts/qa-mergescenes.mjs:109・scripts/qa-smoke-dev.mjs:2・scripts/qa-smoke-dev.mjs:3・scripts/qa-smoke.mjs:3 ほか 6 | |
| `node` | scripts/qa-bin9-all.mjs:10 | .github/workflows/deploy.yml:24・.github/workflows/deploy.yml:26・.gitignore:1・README.md:56・README.md:57・package-lock.json:19 ほか 427 | |
| `win32` | scripts/qa-bin9-all.mjs:16 | package-lock.json:332・package-lock.json:334・package-lock.json:343・package-lock.json:349・package-lock.json:351・package-lock.json:360 ほか 10 | |
| `curl` | scripts/qa-bin9-mutate.mjs:31 | scripts/qa-bin6-mutate.mjs:32 | |


判定: 8個の鍵はどれも検査の台本（scripts/qa-bin6.mjs・qa-bin9-all.mjs・qa-bin9-mutate.mjs）の語。アプリの設定の鍵・保存の鍵は足していない（src の変更は leafCards の値と SF_FINE の #if だけ）ので、書き出し・読み込み・はじめの案内・既定に戻す・README の戻し方には当たらない
