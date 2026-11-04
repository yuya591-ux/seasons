import fs from 'node:fs'
const h = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), m = h.snapshot.meta, NF = m.node_fields.length, EF = m.edge_fields.length
const N = h.nodes, E = h.edges, S = h.strings, nT = m.node_types[0], eT = m.edge_types[0]
const nName = (i) => S[N[i * NF + 1]], nType = (i) => nT[N[i * NF]], nEdges = (i) => N[i * NF + m.node_fields.indexOf('edge_count')]
const want = process.argv[3] || 'Scene', cnt = new Map()
const nodeCount = N.length / NF
for (let i = 0; i < nodeCount; i++) if (nType(i) === 'object') cnt.set(nName(i), (cnt.get(nName(i)) || 0) + 1)
const first0 = new Int32Array(nodeCount); { let e = 0; for (let i = 0; i < nodeCount; i++) { first0[i] = e; e += nEdges(i) * EF } }
const hasProp = (i, p) => { for (let k = 0; k < nEdges(i); k++) { const eo = first0[i] + k * EF; if (eT[E[eo]] === 'property' && S[E[eo + 1]] === p) return true } return false }
const isWant = (i) => nType(i) === 'object' && (want.startsWith('prop:') ? hasProp(i, want.slice(5)) : nName(i) === want)
let wn = 0; for (let i = 0; i < nodeCount; i++) if (isWant(i)) wn++; console.log('印', want, wn)
console.log(want, cnt.get(want) || 0, '・WebGLRenderer', cnt.get('WebGLRenderer') || 0, '・InstancedMesh', cnt.get('InstancedMesh') || 0, '・Mesh', cnt.get('Mesh') || 0)
// 根からの最短の道（弱い辺は辿らない）
const first = new Int32Array(nodeCount); { let e = 0; for (let i = 0; i < nodeCount; i++) { first[i] = e; e += nEdges(i) * EF } }
const prev = new Int32Array(nodeCount).fill(-1), pe = new Int32Array(nodeCount).fill(-1), q = [0]; prev[0] = 0
for (let h2 = 0; h2 < q.length; h2++) { const i = q[h2]; for (let k = 0; k < nEdges(i); k++) { const eo = first[i] + k * EF, t = eT[E[eo]]; if (t === 'weak' || t === 'shortcut') continue; const to = E[eo + 2] / NF; if (prev[to] >= 0) continue; prev[to] = i; pe[to] = eo; q.push(to) } }
let shown = 0
for (let i = 0; i < nodeCount && shown < 3; i++) if (isWant(i)) {
  const path = []; let c = i; while (c !== 0 && prev[c] >= 0 && path.length < 40) { const eo = pe[c], t = eT[E[eo]], en = t === 'element' || t === 'hidden' ? '[' + E[eo + 1] + ']' : S[E[eo + 1]]; path.push(`${nType(prev[c])}:${nName(prev[c]).slice(0, 40)} -(${t}:${String(en).slice(0, 30)})->`); c = prev[c] }
  console.log('--- ' + want + ' #' + shown + (prev[i] < 0 ? '（根から届かない）' : '')); console.log(path.reverse().join('\n')); shown++
}
