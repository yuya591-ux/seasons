// 便14 診断の使い捨て: 月×時刻ごとに起動時の情景を数える。本体は変えない
import { pickNowScene, SCENES } from '../src/data/scenes/index.js'
const rows = []
for (let m = 1; m <= 12; m++) { const r = []; for (const h of [7, 12, 17, 21]) { const s = pickNowScene(new Date(2026, m - 1, 15, h)); r.push(`${h}時=${s.id}(${s.axes.season})`) } rows.push(`${m}月: ` + r.join(' ')) }
console.log(rows.join('\n'))
const pub = SCENES.filter((s) => s.status === 'ready' && s.public !== false)
const t = {}; for (const s of pub) { const k = s.axes.season + '-' + s.axes.time; t[k] = (t[k] || 0) + 1 } ; console.log(JSON.stringify(t))
