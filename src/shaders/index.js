// シェーダー登録簿。情景の render 種別から、対応するシェーダーを引く。
// 新しい現象（雪など）を足すときは、ここに1行 import で追加する。
// 便15 #1=1: どの情景からも呼ばれていなかった6本（晴天・窓辺の下町・立体パノラマ・谷戸・屋上・実写の窓）は消した（戻す時は git の履歴から）

import * as rainGlass from './rainGlass.js'
import * as windowMountains from './windowMountains.js'
import * as windowSea from './windowSea.js'

export const SHADERS = {
  rainGlass, // 窓ガラスの雨
  windowMountains, // 窓辺の山あい
  windowSea, // 窓辺の海辺
  // 角部屋・谷戸・北寺尾は立体の街エンジン（town3dViewer.js）
}

/** render 種別からシェーダーを引く（未知なら雨ガラスにフォールバック）。 */
export function getShader(type) {
  return SHADERS[type] || SHADERS.rainGlass
}
