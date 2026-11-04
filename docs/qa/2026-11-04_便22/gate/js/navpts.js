(async () => {
  window.__town3dFly(true); await new Promise((r) => setTimeout(r, 2600))
  const at = async (X, Y, Z) => { const e = window.__town3dKamoTown(X, Z, Y); window.__town3dFlyPose(e.x, e.y, e.z, 0, 0); await new Promise((r) => setTimeout(r, 700)); const n = window.__town3dNav(); return { X, Z, place: n.place, ground: n.ground, top: n.top, wet: n.wet, blocked: n.blocked, y: n.y, inBound: e.x >= -n.bound.x && e.x <= (n.bound.xMax || n.bound.x) && e.z >= n.bound.zMin && e.z <= n.bound.zMax } }
  const out = []
  for (const [X, Y, Z] of [[-4022, 80, -1056], [-1202, 60, 4709], [-1280, 60, 4986], [459, 30, 2914], [-200, 30, 2925], [-60, 20, 2600], [616, 60, 3488], [929, 40, 1934], [-150, 20, 2500]]) out.push(await at(X, Y, Z))
  return out
})()
