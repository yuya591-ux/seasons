// 使い捨て（便3・案の画）: 開発サーバー 4953 のページへ差し込む。本体のファイルは変えず、撮影用の口（__shGet）から
// 水面と霧の見た目だけをその場で差し替える。_bin3-mock.mjs が addScriptTag で読む。
(() => {
  const S = (window.__bin3 = { cam: null, pre: [], calls: [], ms: [], measure: false })

  // 描画の直前にカメラを置く（飛行の自動の動きに上書きされないように）＋映り込みを描く＋測る
  S.setup = () => {
    if (S.ready) return true
    const g = window.__shGet(); if (!g || !g.composer) return false
    const { renderer, camera, composer } = g
    const orig = composer.render.bind(composer)
    renderer.info.autoReset = false
    composer.render = (...a) => {
      const c = S.cam
      if (c) { camera.position.set(...c.p); camera.lookAt(...c.l); if (c.fov && camera.fov !== c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix() } camera.updateMatrixWorld() }
      renderer.info.reset()
      const t0 = performance.now()
      for (const f of S.pre) f()
      const r = orig(...a)
      if (S.measure) { renderer.getContext().finish(); S.ms.push(performance.now() - t0); S.calls.push(renderer.info.render.calls) }
      return r
    }
    S.ready = true
    return true
  }
  S.measureNow = async (n = 60) => {
    S.ms = []; S.calls = []; S.measure = true
    await new Promise((res) => { const tick = () => (S.ms.length >= n ? res() : requestAnimationFrame(tick)); tick() })
    S.measure = false
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
    return { ms: +med(S.ms).toFixed(2), calls: med(S.calls), n: S.ms.length }
  }

  // ── 水面 ──
  const waterMeshes = () => {
    const out = []
    window.__shGet().scene.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return
      const m = o.material
      const key = m.__b3key || (m.customProgramCacheKey && m.customProgramCacheKey())
      if (key === 'freshWater' || String(key).startsWith('freshWater')) out.push({ o, kind: 'fresh' })
      else if (o.geometry && o.geometry.parameters && o.geometry.parameters.width === 1760) out.push({ o, kind: 'sea' })
    })
    return out
  }
  S.waterBox = () => waterMeshes().filter(({ o }) => Math.abs(o.position.x) < 300).map(({ o, kind }) => { const T = window.__shGet().THREE; const bb = new T.Box3().setFromObject(o); return { kind, min: bb.min.toArray().map((v) => +v.toFixed(1)), max: bb.max.toArray().map((v) => +v.toFixed(1)) } })
  S.waterInfo = () => waterMeshes().map(({ o, kind }) => { o.updateMatrixWorld(); const p = o.getWorldPosition(new (window.__shGet().THREE.Vector3)()); return { kind, y: +p.y.toFixed(2), x: +p.x.toFixed(1), z: +p.z.toFixed(1) } })

  // 映り込みの後で光の計算の後に足す（照らされて暗くならないように＝空や街の色をそのまま映す）
  const reflGLSL = (k, useTex) => {
    const P = k === 'fresh' ? 'vWPosF' : 'vWPos'
    const SKYH = k === 'fresh' ? 'uSkyF' : 'uSky', SKYT = k === 'fresh' ? 'uSky2F' : 'uSky2'
    const amp = k === 'fresh' ? '0.10' : '0.16'
    return `
  {
    float tB = uTime; vec3 PB = ${P};
    float dxB = 0.85 * cos(PB.x * 0.85 + tB * 0.8) * 0.5 + 0.5 * cos((PB.x + PB.z) * 1.25 + tB * 1.15) + 0.18 * cos(PB.x * 2.3 - PB.z * 1.7 + tB * 1.9);
    float dzB = 0.7 * cos(PB.z * 0.7 - tB * 0.55) * 0.5 + 0.5 * cos((PB.x + PB.z) * 1.25 + tB * 1.15) - 0.13 * cos(PB.x * 2.3 - PB.z * 1.7 + tB * 1.9);
    ${k === 'sea' ? 'dxB *= 0.35; dzB *= 0.35;' : ''}
    vec3 NB = normalize(vec3(-dxB * ${amp}, 1.0, -dzB * ${amp}));
    vec3 VB = normalize(cameraPosition - PB);
    vec3 RB = reflect(-VB, NB);
    float elB = clamp(RB.y, 0.0, 1.0);
    vec3 skyB = mix(${SKYH}, ${SKYT}, smoothstep(0.0, 0.55, elB));
    vec2 cuvB = RB.xz / max(RB.y, 0.08) * 0.9 + vec2(tB * 0.01, tB * 0.004);
    float clB = 0.5 + 0.5 * sin(cuvB.x * 1.7 + sin(cuvB.y * 1.3) * 1.6) * sin(cuvB.y * 1.1 + cuvB.x * 0.4);
    float lumB = max(max(${SKYH}.r, ${SKYH}.g), ${SKYH}.b);
    skyB = mix(skyB, vec3(1.0, 0.99, 0.97) * lumB, smoothstep(0.55, 0.95, clB) * 0.35 * smoothstep(0.02, 0.25, elB));
    skyB += uGlintCol * pow(max(dot(RB, uGlintDir), 0.0), 24.0) * 0.6;
    ${useTex ? `
    vec4 rcB = uB3TexMat * vec4(PB, 1.0);
    rcB.xy += NB.xz * rcB.w * ${(S.dist ?? 0.06).toFixed(3)};
    vec3 rsB = texture2DProj(tB3Refl, rcB).rgb;
    skyB = rsB;` : ''}
    float ndvB = max(dot(NB, VB), 0.0);
    float frB = mix(0.38, 1.0, pow(1.0 - ndvB, 3.0)) * 0.9;
    vec3 baseB = outgoingLight * vec3(0.42, 0.5, 0.55); // 水の地の色を暗く（本物の水は暗いので、映りが読める）
    outgoingLight = mix(baseB, skyB, ${S.frOne ? "1.0" : "frB"});
  }
  #include <opaque_fragment>`
  }
  let reflector = null
  S.texMatW = null
  S.water = (mode, planeY) => {
    const g = window.__shGet(); const { THREE, renderer, camera, scene } = g
    S.pre = S.pre.filter((f) => !f.__water)
    const list = waterMeshes()
    for (const { o, kind } of list) {
      const m = o.material
      if (!m.__b3orig) { m.__b3orig = m.onBeforeCompile; m.__b3origKey = m.customProgramCacheKey; m.__b3key = kind === 'fresh' ? 'freshWater' : 'sea' }
      o.updateMatrixWorld()
      const wy = o.getWorldPosition(new THREE.Vector3()).y
      const onPlane = mode === 2 && planeY !== undefined && Math.abs(wy - planeY) < 0.6
      if (mode === 0) { m.onBeforeCompile = m.__b3orig; m.customProgramCacheKey = m.__b3origKey; m.needsUpdate = true; continue }
      m.onBeforeCompile = (sh, r) => {
        m.__b3orig(sh, r)
        sh.fragmentShader = sh.fragmentShader
          .replace('fresF * 0.34', 'fresF * 0.0').replace('fres * 0.5);', 'fres * 0.0);')
          .replace('#include <opaque_fragment>', reflGLSL(kind, onPlane))
        if (onPlane) {
          sh.uniforms.tB3Refl = { value: reflector.getRenderTarget().texture }
          sh.uniforms.uB3TexMat = S.texMatW
          sh.fragmentShader = 'uniform sampler2D tB3Refl;\nuniform mat4 uB3TexMat;\n' + sh.fragmentShader
        }
      }
      m.customProgramCacheKey = () => m.__b3key + '-b3-' + mode + (onPlane ? 'p' : '')
      m.needsUpdate = true
    }
    if (mode === 2 && planeY !== undefined) {
      if (!reflector) {
        const ReflMod = S.mods[3]
        const w = renderer.domElement.width, h = renderer.domElement.height
        reflector = new ReflMod.Reflector(new THREE.PlaneGeometry(10, 10), { textureWidth: Math.round(w / 2), textureHeight: Math.round(h / 2), clipBias: 0.02 })
        reflector.rotation.x = -Math.PI / 2
        S.reflector = reflector
      }
      reflector.position.y = planeY; reflector.updateMatrixWorld()
      const hideList = list.filter(({ o }) => Math.abs(o.getWorldPosition(new THREE.Vector3()).y - planeY) < 0.6).map(({ o }) => o)
      S.texMatW = S.texMatW || { value: new THREE.Matrix4() }
      const f = () => { for (const o of hideList) o.visible = false; reflector.onBeforeRender(renderer, scene, camera); for (const o of hideList) o.visible = true; S.texMatW.value.copy(reflector.material.uniforms.textureMatrix.value).multiply(reflector.matrixWorld.clone().invert()) } // 部品の変換は鏡の板の中の位置向け→世界の位置向けに直す
      f.__water = true
      S.pre.push(f)
      // 映り込みを先に作ってから水の材を組む（テクスチャの参照のため）。上の onBeforeCompile は needsUpdate の後の描画で呼ばれる
    }
    return list.length
  }

  // ── 霧（高さで濃さが変わる層を、距離の霞の手前に重ねる）。three の霧の部品を差し替えて全ての材を組み直す ──
  S.fog = (mode, prm = {}) => {
    const g = window.__shGet(); const { THREE, scene } = g
    const C = THREE.ShaderChunk
    if (!S.fogOrig) S.fogOrig = { pv: C.fog_pars_vertex, v: C.fog_vertex, pf: C.fog_pars_fragment, f: C.fog_fragment }
    const O = S.fogOrig
    if (mode === 0) { C.fog_pars_vertex = O.pv; C.fog_vertex = O.v; C.fog_pars_fragment = O.pf; C.fog_fragment = O.f }
    else {
      const f = (v) => Number(v).toFixed(4)
      const HB = f(prm.base ?? 0), HS = f(prm.scale ?? 6), DEN = f(prm.density ?? 0.015), HA = f(prm.amount ?? 0.85)
      const mc = new THREE.Color(prm.mist ?? 0xeef2f4)
      const MISTC = `vec3(${f(mc.r)}, ${f(mc.g)}, ${f(mc.b)})`
      C.fog_pars_vertex = O.pv + '\n#ifdef USE_FOG\nvarying vec3 vFogWB;\n#endif\n'
      C.fog_vertex = O.v + '\n#ifdef USE_FOG\nvFogWB = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;\n#endif\n'
      C.fog_pars_fragment = O.pf + '\n#ifdef USE_FOG\nvarying vec3 vFogWB;\n#endif\n'
      C.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  {
    vec3 PwB = vFogWB; vec3 CwB = cameraPosition;
    float LB = length(PwB - CwB);
    float dyB = PwB.y - CwB.y;
    float hcB = CwB.y - ${HB}, hpB = PwB.y - ${HB};
    float opB = abs(dyB) < 0.05 ? ${DEN} * LB * exp(-hpB / ${HS}) : ${DEN} * LB * ${HS} * (exp(-hcB / ${HS}) - exp(-hpB / ${HS})) / dyB;
    ${mode === 2 ? `float nzB = 0.35 + 1.3 * (0.5 + 0.5 * sin(PwB.x * 0.05 + sin(PwB.z * 0.07) * 1.8)) * (0.5 + 0.5 * sin(PwB.z * 0.042 - PwB.x * 0.023 + 1.3));
    opB *= nzB;` : ''}
    float hFB = (1.0 - exp(-max(opB, 0.0))) * ${HA};
    gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogColor, ${MISTC}, 0.55), hFB);
  }
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`
    }
    let n = 0
    scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) { if (m.fog) { m.needsUpdate = true; n++ } } })
    return n
  }
})()
