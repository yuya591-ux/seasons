// 便15 F8（#1 の約束「消しても眺めは変わらない」）: 代表の眺めを撮って組で残す・2組の画素の差を数える。
//   撮る: node scripts/_bin15-same.mjs shoot <組の名>      … docs/qa/2026-11-02_便15/same/<組の名>/ に代表の眺めを撮る（_bin15-shot.mjs を順に呼ぶ）
//   比べる: node scripts/_bin15-same.mjs diff <組A> <組B>  … 眺めごとに「差が 8/255 を超える画素の割合」と「差の平均」を出す
//   撮る時は「視差効果を減らす」で時々の出来事を止め、猫の毛色を三毛（6）に名指しする（同じ種でも読み込みの間合いで乱数の順が変わり、出来事と毛色で差が出たため）
//   判定: node scripts/_bin15-same.mjs judge <前1> <前2> <後> … 前と後の差が、同じコードを2回撮った差（前1・前2）の 1.5倍＋0.2% 以下なら合格
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { chromium } from 'playwright'

const ROOT = 'docs/qa/2026-11-02_便15/same'
export const VIEWS = [
  ['iphone', 'kitaterao-window-3d', 'still'],
  ['iphone', 'kitaterao-window-3d-rain-night', 'still'],
  ['iphone', 'kitaterao-window-3d', 'open'],
  ['iphone', 'shishigaya-window-3d-snow', 'still'],
  ['iphone', 'autumn-dusk-corner-room', 'still'],
  ['iphone', 'summer-rain-dusk', 'still'],
  ['iphone', 'summer-dusk-seaside', 'still'],
  ['iphone', 'summer-morning-mountains', 'still'],
  ['pc', 'kitaterao-window-3d-snow', 'still'],
]
const nameOf = (v) => v.join('_')
const [cmd, a, b, c] = process.argv.slice(2)

if (cmd === 'shoot') {
  const out = `${ROOT}/${a}`
  fs.mkdirSync(out, { recursive: true })
  for (const v of VIEWS) {
    const r = spawnSync('node', ['scripts/_bin15-shot.mjs', ...v, nameOf(v), 'wait=9000', 'rm=1', 'coat=6'], { env: { ...process.env, QA_OUT: out }, encoding: 'utf8', shell: process.platform === 'win32' })
    console.log((r.stdout || '').trim().split('\n').slice(-1)[0], r.status === 0 ? '' : 'ERR ' + (r.stderr || '').slice(-300))
  }
  process.exit(0)
}

async function diffSets(A, B) {
  const br = await chromium.launch()
  const p = await br.newPage()
  const res = {}
  for (const v of VIEWS) {
    const n = nameOf(v)
    const fa = `${ROOT}/${A}/${n}.png`, fb = `${ROOT}/${B}/${n}.png`
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) { res[n] = null; continue }
    const da = fs.readFileSync(fa).toString('base64'), db = fs.readFileSync(fb).toString('base64')
    res[n] = await p.evaluate(async ([da, db]) => {
      const load = (d) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = 'data:image/png;base64,' + d })
      const [ia, ib] = await Promise.all([load(da), load(db)])
      const w = ia.width, h = ia.height
      const cv = new OffscreenCanvas(w, h), g = cv.getContext('2d')
      g.drawImage(ia, 0, 0); const pa = g.getImageData(0, 0, w, h).data
      g.clearRect(0, 0, w, h); g.drawImage(ib, 0, 0); const pb = g.getImageData(0, 0, w, h).data
      let over = 0, sum = 0
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]))
        sum += d; if (d > 8) over++
      }
      const n = pa.length / 4
      return { over: +(100 * over / n).toFixed(3), mean: +(sum / n).toFixed(3) }
    }, [da, db])
  }
  await br.close()
  return res
}

if (cmd === 'diff') {
  console.log(JSON.stringify(await diffSets(a, b), null, 1))
} else if (cmd === 'judge') {
  const noise = await diffSets(a, b), d = await diffSets(a, c)
  let ok = true
  const rows = []
  for (const v of VIEWS) {
    const n = nameOf(v), z = noise[n], x = d[n]
    if (!z || !x) { ok = false; rows.push(`${n}: 画が無い`); continue }
    const lim = +(z.over * 1.5 + 0.2).toFixed(3)
    const pass = x.over <= lim
    if (!pass) ok = false
    rows.push(`${n}: 同じコードの2回 ${z.over}% ／ 前と後 ${x.over}%（上限 ${lim}%）${pass ? '合格' : '不合格'}`)
  }
  console.log(rows.join('\n'))
  console.log(ok ? 'F8 合格: 消す前と後の眺めの差は、同じコードを2回撮った差の内' : 'F8 不合格')
  process.exit(ok ? 0 : 1)
}
