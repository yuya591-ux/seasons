// 便24: 情景の音の「ぶおーん」（低い唸りの盛り上がり）を数える測り。
//   情景のデータ（src/data/scenes/*.js の sounds）のうち繰り返す音（loop）を、本物と同じ音量（gain）と低音切り（hp＝2段の highpass・Q 0.6）で混ぜ、
//   窓を閉じた時（こもり＝WINDOW_CLOSED_LP〈便23 まで 900Hz・便24 から 1600Hz〉より上を落とす lowpass Q 0.5・0.4 倍）と開けた時の2通りで 150 秒を作り、
//   低い帯（120〜600Hz）の音量を 0.25 秒ごとに測る。帯の中央値より 6dB 以上高く、しかも混ぜた音全体の中央値から 10dB 以内に迫る（耳に目立つ）うえ、高い帯（1.2kHz より上）との差も中央より 2dB 以上広がる（低い帯だけが上がる＝雨脚が強まる「ざーっ」は数えない）所が 0.75 秒以上続く塊を「唸りの盛り上がり」として数える。
//   単発の音（interval・遠雷やウグイス）は数えない（遠雷はもともと低い音）。波は寄せ返しそのものが低い音の満ち引きなので数えない。
//   低音切りは本体と同じ src/data/soundFloor.js の下限を当てる（HUM_NOFLOOR=1 で当てない＝便23 までの形）
// 使い方: node scripts/qa-hum.mjs [情景の id の一部…]   出力の最後の行: 「唸りの測りの終わり: 盛り上がりが N 回より多い情景 M」
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..')
const LIMIT = Number(process.env.HUM_LIMIT || 2)
const DLIM = Number(process.env.HUM_DLIM || 2) // 150 秒の中で許す盛り上がりの回数
const SEC = 150
const pick = process.argv.slice(2)
const { floorHp, WINDOW_CLOSED_LP } = await import(pathToFileURL(path.join(ROOT, 'src/data/soundFloor.js')).href) // 本体と同じ下限の表（HUM_NOFLOOR=1 で外す＝直す前の形）
const EXEMPT = ['audio/summer-dusk-seaside/waves.mp3'] // 波は寄せ返しそのものが低い音の満ち引き（数えない）
const dir = path.join(ROOT, 'src/data/scenes')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hum-'))
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1] }

function bandRms(wav, af) {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-i', wav, '-af', `${af},asetnsamples=n=11025,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return [...(r.stderr || '').matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => Math.max(-100, parseFloat(m[1]) || -100))
}
function swells(L, allMed, Hb) {
  const m = med(L), D = L.map((v, i) => v - (Hb[i] ?? -100)), dm = med(D), ev = []; let cur = null
  L.forEach((v, i) => { if (v > m + 6 && v > allMed - 10 && D[i] > dm + DLIM) { if (!cur) cur = { s: i, e: i, pk: v }; cur.e = i; cur.pk = Math.max(cur.pk, v) } else if (cur) { ev.push(cur); cur = null } })
  if (cur) ev.push(cur)
  return { med: m, ev: ev.filter((e) => e.e - e.s + 1 >= 3) }
}

let bad = 0, n = 0
for (const f of files) {
  const sc = (await import(pathToFileURL(path.join(dir, f)).href)).default
  if (!sc || !Array.isArray(sc.sounds)) continue
  if (pick.length && !pick.some((p) => sc.id.includes(p))) continue
  const loops = sc.sounds.filter((s) => s.loop && s.src && !EXEMPT.includes(s.src))
  if (!loops.length) continue
  const args = ['-v', 'error', '-y']
  const fl = []
  loops.forEach((s, i) => {
    args.push('-stream_loop', '-1', '-i', path.join(ROOT, 'public', s.src))
    const hpv = process.env.HUM_NOFLOOR ? (s.hp || 0) : floorHp(s.src, s.hp || 0)
    const hp = hpv > 0 ? `,highpass=f=${hpv}:width_type=q:width=0.6,highpass=f=${hpv}:width_type=q:width=0.6` : ''
    fl.push(`[${i}:a]atrim=0:${SEC},aformat=sample_rates=44100:channel_layouts=mono,volume=${s.gain ?? 0.4}${hp}[s${i}]`)
  })
  const mix = `${loops.map((_, i) => `[s${i}]`).join('')}amix=inputs=${loops.length}:normalize=0:duration=longest,asplit=2[o][c0];[c0]lowpass=f=${process.env.HUM_NOFLOOR ? 900 : WINDOW_CLOSED_LP}:width_type=q:width=0.5,volume=0.4[c]`
  const wo = path.join(tmp, sc.id + '-open.wav'), wc = path.join(tmp, sc.id + '-close.wav')
  const r = spawnSync('ffmpeg', [...args, '-filter_complex', fl.join(';') + ';' + mix, '-map', '[o]', wo, '-map', '[c]', wc], { encoding: 'utf8' })
  if (r.status !== 0) { console.log(`${sc.id}: 混ぜられない ${String(r.stderr).slice(0, 300)}`); bad++; n++; continue }
  const res = {}
  for (const [k, w] of [['閉', wc], ['開', wo]]) {
    const low = bandRms(w, 'highpass=f=120,highpass=f=120,lowpass=f=600,lowpass=f=600'), all = bandRms(w, 'anull'), hb = bandRms(w, 'highpass=f=1200,highpass=f=1200')
    const sw = swells(low, med(all), hb)
    res[k] = { n: sw.ev.length, lowMed: sw.med, allMed: med(all), at: sw.ev.slice(0, 8).map((e) => `${(e.s / 4).toFixed(1)}s(+${(e.pk - sw.med).toFixed(0)}dB・${((e.e - e.s + 1) / 4).toFixed(2)}s)`) }
  }
  n++
  const ok = res['閉'].n <= LIMIT && res['開'].n <= LIMIT
  if (!ok) bad++
  console.log(`${ok ? '合格' : '不合格'} ${sc.id}: 窓を閉じた時 盛り上がり ${res['閉'].n} 回（低い帯の中央 ${res['閉'].lowMed.toFixed(1)}dB・全体 ${res['閉'].allMed.toFixed(1)}dB）${res['閉'].at.join(' ')} ／ 開けた時 ${res['開'].n} 回（低い帯 ${res['開'].lowMed.toFixed(1)}dB・全体 ${res['開'].allMed.toFixed(1)}dB）${res['開'].at.join(' ')}`)
}
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`唸りの測りの終わり: 盛り上がりが ${LIMIT} 回より多い情景 ${bad}/${n}`)
process.exit(bad ? 1 : 0)
