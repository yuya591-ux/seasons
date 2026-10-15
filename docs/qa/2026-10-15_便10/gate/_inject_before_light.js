// 使い捨て（便10・①空と雲の案）: 撮影用の口（__shGet・__b10T）から、雲海・遠山・煙をページの中で差し替える。本体は変えない。
// window.__bin10.apply('kumo1') で案1（柔らかい雲海・起伏のある遠山・ぼけた煙）。案の名前に 'vol' があれば雲海を厚みのある雲（数歩の光の進み）にする
(() => {
  const S = () => window.__shGet && window.__shGet()
  const T = () => window.__b10T
  // 値の雑音（遠山の起伏用・決まった値）
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s) }
  const vn = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1); return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy }
  const ridged = (x, y) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 4; i++) { s += a * (1 - Math.abs(vn(x * f, y * f) * 2 - 1)); f *= 2.1; a *= 0.5 } return s }

  function mountains() {
    const { THREE } = S(); const list = T().mtns
    let tris = 0
    list.forEach((m, k) => {
      const p = m.geometry.parameters; const rad = p.radius, h = p.height
      const N = 30
      const g = new THREE.PlaneGeometry(rad * 2, rad * 2, N, N); g.rotateX(-Math.PI / 2)
      const pos = g.attributes.position, col = new Float32Array(pos.count * 3)
      const base = m.material.color.clone()
      const ox = k * 3.7, oz = k * 1.3
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i)
        const r = Math.hypot(x, z) / rad
        const prof = Math.pow(Math.max(0, 1 - r), 1.5)
        const rg = ridged(x / rad * 2.2 + ox, z / rad * 2.2 + oz) // 尾根と沢
        const y = h * (prof * (0.72 + 0.55 * rg) + (rg - 0.5) * 0.18 * prof) - h / 2 - (r > 1 ? 4 : 0)
        pos.setY(i, y)
        // 木の濃淡と沢の陰（色に焼く）。尾根は明るく、沢は深い緑へ
        const v = 0.82 + 0.3 * rg + (vn(x * 0.35 + ox, z * 0.35) - 0.5) * 0.16
        col[i * 3] = v; col[i * 3 + 1] = v * 1.02; col[i * 3 + 2] = v * 0.98
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      g.computeVertexNormals()
      const mat = new THREE.MeshLambertMaterial({ color: base, vertexColors: true })
      m.geometry.dispose(); m.geometry = g; m.material = mat
      tris += N * N * 2
    })
    return { mountains: list.length, tris }
  }

  function smoke() {
    const { THREE, scene } = S()
    const cv = document.createElement('canvas'); cv.width = cv.height = 64
    const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(cv)
    let n = 0
    const swap = (mesh) => {
      const mm = mesh.material
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: mm.color, transparent: true, opacity: mm.opacity, depthWrite: false, fog: mm.fog }))
      sp.position.copy(mesh.position); sp.scale.copy(mesh.scale).multiplyScalar(2.4); sp.userData = mesh.userData
      // 煙の更新は scale と material.opacity を書くので、Sprite でもそのまま動く（球の半径1 → 板の幅2.4 で見かけを合わせる）
      const sc = sp.scale; const orig = sc.set.bind(sc); sc.set = (a, b, c) => orig(a * 2.4, b * 2.4, c)
      const parent = mesh.parent; const i = parent.children.indexOf(mesh); parent.children[i] = sp; sp.parent = parent
      n++
    }
    for (const g of T().smoke || []) for (const c of [...g.children]) if (c.isMesh && c.geometry.type === 'SphereGeometry') swap(c)
    // 臨海の煙突の煙（球3つ）
    const harbor = []
    scene.traverse((o) => { if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.material.transparent && !o.material.depthWrite && o.material.color && o.material.color.getHex() === 0xd8dde2) harbor.push(o) })
    harbor.forEach(swap)
    return { smoke: n }
  }

  function cloudSea(vol) {
    const { THREE } = S(); const t = T(); const I = t.seaInfo
    const G = t.sea
    if (!G || !I) return { seaLayers: 0 } // 雲海の無い町（谷戸など）
    // 前の雲の塊（平たい多面体の玉の重なり）を外す。下地の円盤（切れ間の穴あき）は残す
    G.children.forEach((c) => { if (c.isMesh && c.geometry.type === 'BufferGeometry') c.visible = false })
    const uni = {
      uTime: I.seaUni.uTime, uLow: { value: new THREE.Color(I.seaLowC) }, uHigh: { value: new THREE.Color(I.seaHighC) },
      uSun: { value: I.seaSunDir.clone() }, uSunCol: { value: I.seaSunCol.clone() }, uSeaR: { value: I.seaR },
      uGaps: { value: I.gaps.map((g) => new THREE.Vector3(g.x, g.z, g.r)) }, uHaze: { value: S().scene.fog ? S().scene.fog.color.clone() : new THREE.Color(0xf0d8c0) },
    }
    const mkMat = (layer) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide })
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uni)
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
          .replace('#include <project_vertex>', '#include <project_vertex>\n  vW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vW; uniform float uTime; uniform vec3 uLow; uniform vec3 uHigh; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uSeaR; uniform vec3 uGaps[4]; uniform vec3 uHaze;
          float b10h(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
          float b10n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(b10h(i), b10h(i + vec2(1, 0)), f.x), mix(b10h(i + vec2(0, 1)), b10h(i + vec2(1, 1)), f.x), f.y); }
          float b10f(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * b10n(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
          // 雲の厚み（0..1）。大きな塊＋もこもこの縁＋ゆっくり流れる
          float b10d(vec2 xz) {
            vec2 w = vec2(uTime * 0.6, uTime * 0.25);
            float big = b10f(xz * 0.006 + w * 0.004);
            float d = 0.18 + 0.82 * smoothstep(0.22, 0.62, big); // 谷も薄い雲でつながる
            return d;
          }
          float b10gap(vec2 xz) {
            float k = 1.0;
            for (int i = 0; i < 4; i++) { float gd = length(xz - uGaps[i].xy); k *= smoothstep(uGaps[i].z * 0.7, uGaps[i].z * 1.3, gd); }
            return k;
          }
          // 雲の頂の高さ（m）＝大きなもこもこの頭・中くらいの房・細かな粒の3段の丸い盛り上がり
          float b10B(vec2 p) { return 1.0 - abs(b10n(p) * 2.0 - 1.0); }
          float b10H(vec2 xz, float d) {
            vec2 w = vec2(uTime * 0.6, uTime * 0.25);
            float h1 = sqrt(b10B(xz * 0.012 + w * 0.004));
            float h2 = sqrt(b10B(mat2(1.6, 1.2, -1.2, 1.6) * xz * 0.034 + w * 0.01));
            float h3 = b10B(mat2(1.2, -1.6, 1.6, 1.2) * xz * 0.09 + w * 0.02);
            return d * (18.0 * h1 + 7.0 * h2 + 2.0 * h3);
          }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec2 xz = vW.xz;
            float d = b10d(xz);
            float e = 1.5;
            float H = b10H(xz, d);
            float hx = b10H(xz + vec2(e, 0.0), b10d(xz + vec2(e, 0.0))) - H, hz = b10H(xz + vec2(0.0, e), b10d(xz + vec2(0.0, e))) - H;
            vec3 n = normalize(vec3(-hx / e, 1.0, -hz / e));
            float ndl = dot(n, normalize(uSun));
            float lit = smoothstep(-0.2, 0.9, ndl);
            float ao = smoothstep(3.0, 22.0, H);                           // 谷（薄い所・塊の間）は翳る
            vec3 c = mix(uLow * vec3(0.58, 0.63, 0.80), uHigh * 1.05, clamp(lit * 0.85 + ao * 0.45 - 0.30, 0.0, 1.0)); // 谷は青い陰
            c += uSunCol * pow(max(ndl, 0.0), 6.0) * 0.12;                 // 陽を受ける頂
            c += uSunCol * (1.0 - smoothstep(0.05, 0.35, d)) * 0.10;       // 薄い縁は光が透ける
            float far = length(vW.xz - cameraPosition.xz);
            c = mix(c, uHaze, smoothstep(260.0, 520.0, far) * 0.55);        // 遠くは空気に溶ける
            diffuseColor.rgb = c;
            float a = b10gap(xz);
            a *= 1.0 - smoothstep(uSeaR * 0.80, uSeaR * 0.998, length(vW.xz));
            a *= smoothstep(4.0, 30.0, length(vW - cameraPosition));
            diffuseColor.a *= a;
          }`)
      }
      mat.customProgramCacheKey = () => 'b10sea' + layer
      return mat
    }
    const add = []
    const mk = (y, layer) => { const g = new THREE.PlaneGeometry(I.seaR * 2, I.seaR * 2, 1, 1); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mkMat(layer)); m.position.y = y; m.renderOrder = 2 + layer; m.frustumCulled = false; G.add(m); t.seaMats.push(m.material); add.push(m) }
    mk(-2, 0) // 下の層（雲の本体）と上の層（厚い所だけ＝もこもこの頂）
    return { seaLayers: add.length }
  }

  window.__bin10 = {
    apply(an) {
      const out = {}
      if (!S() || !T()) return { err: '撮影用の口が無い' }
      if (/kumo/.test(an)) { Object.assign(out, cloudSea(/vol/.test(an))); Object.assign(out, mountains()); Object.assign(out, smoke()) }
      return out
    },
  }
})()
