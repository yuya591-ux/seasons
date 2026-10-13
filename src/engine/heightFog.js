// 低く溜まる霧（高さで濃さが変わる霧の層）。three の霧の部品（ShaderChunk の fog_*）を1か所だけ差し替え、
// 距離の霞（scene.fog）の手前に「地面に近い低い所ほど濃い層」を重ねる（2026-10-13・便3 #2=2）。
// 値は MIST_A・MIST_B の2つの入れ物を全部の材で共有する（three は ShaderLib の値を材ごとに写すが、
// Float32Array は写さずに同じ物を指すので、ここを書き換えるだけで全部の材に効く＝材の組み直しは要らない）。
//   MIST_A = [溜まる高さ, 層の厚み, 濃さ, 混ざり方]  MIST_B = [霧の色 r, g, b, 流れの位置(m)]
// 混ざり方が 0 の時（町の3Dの外・値を持たない自前の材）は何もしない。
// three は町の3Dが後から読み込む（読み込みを分けるため）ので、ここでは取り込まずに受け取る。

export const MIST_A = new Float32Array(4)
export const MIST_B = new Float32Array(4)

let installed = false
export function installHeightFog(THREE) {
  if (installed) return
  installed = true
  const C = THREE.ShaderChunk
  C.fog_pars_vertex += '\n#ifdef USE_FOG\nvarying vec3 vMistW;\n#endif\n'
  // 世界の位置＝カメラの位置＋（視点の向きの逆回し）×視点から見た位置
  C.fog_vertex += '\n#ifdef USE_FOG\nvMistW = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;\n#endif\n'
  C.fog_pars_fragment += '\n#ifdef USE_FOG\nvarying vec3 vMistW;\nuniform vec4 uMistA;\nuniform vec4 uMistB;\n#endif\n'
  C.fog_fragment = `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  if ( uMistA.w > 0.0 && uMistA.y > 0.0 ) {
    // 視線に沿って「高さで薄くなる濃さ」を足し合わせる（高さが直線で変わるので式で解ける）。
    // 溜まる高さより下は厚みの0.75倍で頭打ち（海や深い谷で濃さが跳ね上がり、広い海が白く濁らないように）
    vec3 mP = vMistW;
    float mL = length( mP - cameraPosition );
    float mHc = max( cameraPosition.y - uMistA.x, - 0.75 * uMistA.y );
    float mHp = max( mP.y - uMistA.x, - 0.75 * uMistA.y );
    float mDy = mHp - mHc;
    float mOp = abs( mDy ) < 0.05
      ? uMistA.z * mL * exp( - mHp / uMistA.y )
      : uMistA.z * mL * uMistA.y * ( exp( - mHc / uMistA.y ) - exp( - mHp / uMistA.y ) ) / mDy;
    // まだらな濃淡（百数十mの大きさ）。流れの位置だけずらして、ゆっくり流す
    vec2 mQ = mP.xz + vec2( uMistB.w, uMistB.w * 0.35 );
    mOp *= 0.35 + 1.3 * ( 0.5 + 0.5 * sin( mQ.x * 0.05 + sin( mQ.y * 0.07 ) * 1.8 ) ) * ( 0.5 + 0.5 * sin( mQ.y * 0.042 - mQ.x * 0.023 + 1.3 ) );
    float mF = ( 1.0 - exp( - max( mOp, 0.0 ) ) ) * uMistA.w;
    gl_FragColor.rgb = mix( gl_FragColor.rgb, uMistB.rgb, mF );
  }
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`
  for (const k of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[k].uniforms
    if (u && u.fogColor) { u.uMistA = { value: MIST_A }; u.uMistB = { value: MIST_B } }
  }
}

/** 霧の層を消す（町の3Dを出た時）。 */
export function clearHeightFog() { MIST_A[3] = 0 }
