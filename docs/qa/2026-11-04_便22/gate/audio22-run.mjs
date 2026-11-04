// 便22: 音の確かめ（audio22.mjs）の間だけ開発用のサーバー（vite・4970）を立て、終わったら止める（全テストの間ずっと立てておくとメモリを食う＝全テストがメモリ不足で止められた）
import { spawn, spawnSync, execSync } from 'node:child_process'
const PORT = process.env.AUDIO_PORT || '4970'
const up = async () => { try { const r = await fetch(`http://localhost:${PORT}/seasons/`); return r.ok } catch { return false } }
let srv = null
if (!(await up())) { srv = spawn('npx', ['vite', '--port', PORT, '--strictPort'], { shell: true, stdio: 'ignore' }); for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 1000)) }
const r = spawnSync('node', ['docs/qa/2026-11-04_便22/gate/audio22.mjs'], { encoding: 'utf8', env: { ...process.env, AUDIO_PORT: PORT }, maxBuffer: 64 * 1024 * 1024 })
process.stdout.write((r.stdout || '') + (r.stderr || ''))
if (srv) { try { if (process.platform === 'win32') execSync(`taskkill /PID ${srv.pid} /T /F`, { stdio: 'ignore' }); else srv.kill() } catch { /* 無視 */ } }
process.exit(r.status ?? 1)
