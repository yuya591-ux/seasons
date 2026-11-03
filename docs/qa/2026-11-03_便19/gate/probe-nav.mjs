// 便19 の調べ: 鴨川の道案内に聞いて、検査に使う所（水際・建物・橋）を探す。町の3Dの座標で出す
import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chromium', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await (await b.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' })).newPage()
await p.goto(`http://localhost:${process.env.PORT || 4971}/seasons/?dev=1`, { waitUntil: 'domcontentloaded' })
await p.locator('.gate').click().catch(() => {})
await p.waitForTimeout(800)
await p.evaluate(() => window.__applyScene('autumn-dusk-corner-room'))
await p.waitForFunction(() => window.__town3dStats && window.__town3dStats() && window.__town3dStats().frames > 3, null, { timeout: 120000 })
const r = await p.evaluate(() => {
  const A = window.__town3dNavAt, out = {}
  const b = window.__town3dNav().bound, cx = (b.xMax - b.x) / 2, cz = (b.zMin + b.zMax) / 2
  out.delta = [+cx.toFixed(1), +cz.toFixed(1)]
  // 窓の真下（0,22）からデルタへ向かう線で、最初の水
  const x0 = 0, z0 = 22, dx = cx - x0, dz = cz - z0, L = Math.hypot(dx, dz)
  for (let d = 0; d < L; d += 0.5) { const q = A(x0 + dx / L * d, z0 + dz / L * d); if (q.wet) { out.firstWet = { d, x: +(x0 + dx / L * d).toFixed(1), z: +(z0 + dz / L * d).toFixed(1) }; break } }
  // 窓の真下から 8方位で最初に当たる建物
  out.walls = []
  for (let a = 0; a < 8; a++) { const yaw = a / 8 * 6.2832, hx = Math.sin(yaw), hz = -Math.cos(yaw); for (let d = 0; d < 60; d += 0.5) { const q = A(x0 + hx * d, z0 + hz * d); if (q.blocked) { out.walls.push({ a, d }); break } } }
  // 橋の床: デルタのまわり ±400m を 4m おきに見て、橋の床がある水の所
  const decks = []
  for (let x = cx - 400; x <= cx + 400; x += 4) for (let z = cz - 400; z <= cz + 400; z += 4) { const q = A(x, z); if (q.deck !== null && q.wet) decks.push([x, z, +q.deck.toFixed(2)]) }
  out.deckN = decks.length; out.deckEx = decks.filter((_, i) => i % Math.max(1, Math.floor(decks.length / 12)) === 0).slice(0, 14)
  // 背の高い建物（地面から 15m 以上の升）の例
  const tall = []; for (let x = -120; x <= 120 && tall.length < 6; x += 6) for (let z = -120; z <= 120 && tall.length < 6; z += 6) { const q = A(x, z); if (q.blocked && q.top - q.ground > 15) tall.push([x, z, +(q.top - q.ground).toFixed(1), +q.ground.toFixed(1)]) }
  out.tall = tall
  return out
})
console.log(JSON.stringify(r))
await b.close()
