"""便17（鴨川の質の見本）: Blender（pip の bpy・無料・登録なし）で、地形と建物に「光の回り方」を焼き込む。

焼く物: 空いっぱいの白い光（時刻に依らない）に当てた時の、面ごとの明るさ（直に届く空の光＋まわりの面の照り返し）。
  ＝建物の足もと・路地・軒下・木の下が柔らかく暗くなり、明るい壁の照り返しが入る。太陽の光と影は実行時（three.js）に足す。
  時刻・季節で色を変える器（本体の情景のデータ）と合わせるため、色は焼かず明るさだけを焼く。
入る物: scripts/kamo/_data/geo/（scripts/kamo/build.mjs が作る・原点からのメートル）
出る物: scripts/kamo/_data/bake/（git に入れない）
  lm_terrain.png … 近くの地形の明るさ（真上から見た図・±NEAR_R m）
  lm_bldg.png    … 建物の明るさ（建物の面を図に並べた物）
  bldg_baked.bin … 建物の三角形の角ごとの 位置(3)・図の位置(2)・建物の番号(1)（float32）
  bake-log.txt
使い方: py -3.13 scripts/kamo/bake.py [解像度=4096] [光の数=96]
"""
import json
import os
import sys
import time

import bpy  # bpy を先に読む（bmesh は bpy の後でないと読めない）
import bmesh  # noqa: E402
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# 便23: KAMO_GEO=geo-u・KAMO_BAKE=bake-u で、北と南を合わせた網（merge.mjs）を焼く。北の四角と南の四角は別の図に焼く（地形 lm_terrain・lm_terrain2／建物 lm_bldg・lm_bldg2）
GEO = os.path.join(ROOT, "scripts", "kamo", "_data", os.environ.get("KAMO_GEO", "geo"))
OUT = os.path.join(ROOT, "scripts", "kamo", "_data", os.environ.get("KAMO_BAKE", "bake"))
os.makedirs(OUT, exist_ok=True)
RES = int(sys.argv[1]) if len(sys.argv) > 1 else 4096
SAMPLES = int(sys.argv[2]) if len(sys.argv) > 2 else 96
meta = json.load(open(os.path.join(GEO, "geo.json"), encoding="utf-8"))
log = []
t0 = time.time()


def say(s):
    log.append(s)
    print(s, flush=True)


# three.js の座標（x 東・y 上・z 南）→ Blender（x 東・y 北・z 上）
def to_bl(p):
    return np.stack([p[:, 0], -p[:, 2], p[:, 1]], axis=1)


def make_mesh(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    nf = len(faces)
    me.loops.add(nf * 3)
    me.loops.foreach_set("vertex_index", faces.astype(np.int32).ravel())
    me.polygons.add(nf)
    me.polygons.foreach_set("loop_start", np.arange(0, nf * 3, 3, dtype=np.int32))
    me.polygons.foreach_set("loop_total", np.full(nf, 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def grid_faces(n, nz=None):
    # 便21: 東西 n 点・南北 nz 点の網（nz を省くと正方形）
    nz = n if nz is None else nz
    i, j = np.arange(n - 1), np.arange(nz - 1)
    a = (i[None, :] + (j[:, None]) * n).ravel()
    b, c = a + 1, a + n
    d = c + 1
    return np.concatenate([np.stack([a, c, b], 1), np.stack([b, c, d], 1)])


def mat(name, gray):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (gray, gray, gray, 1)
    bsdf.inputs["Roughness"].default_value = 1.0
    return m


bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ── 形を読む ──
n, nzn = meta["near"]["nx"], meta["near"]["nz"]
near_p = np.fromfile(os.path.join(GEO, "near.bin"), dtype=np.float32).reshape(-1, 3)
# 便23: 焼く用の網（南の水路で下げる前）があればそれで焼く（下げた所の暗がりが上に重なる道へ映らないように）
if os.path.exists(os.path.join(GEO, "near-bake.bin")):
    near_p = np.fromfile(os.path.join(GEO, "near-bake.bin"), dtype=np.float32).reshape(-1, 3)
REG = meta["near"].get("regions")
near2 = None
if REG:
    # 便23: 網は2つの四角に外接する四角。北の四角と南の四角の所だけを、別々の網にする（和の外の升は焼かない）
    ST = meta["near"]["step"]

    def sub(rc):
        i0, i1 = round((rc["x0"] - meta["near"]["x0"]) / ST), round((rc["x1"] - meta["near"]["x0"]) / ST)
        j0, j1 = round((rc["z0"] - meta["near"]["z0"]) / ST), round((rc["z1"] - meta["near"]["z0"]) / ST)
        return near_p.reshape(nzn, n, 3)[j0 : j1 + 1, i0 : i1 + 1].reshape(-1, 3).copy(), i1 - i0 + 1, j1 - j0 + 1

    near_pA, nA_, mA_ = sub(REG["A"])
    near_pB, nB_, mB_ = sub(REG["B"])
    near = make_mesh("near", to_bl(near_pA), grid_faces(nA_, mA_))
    near2 = make_mesh("near2", to_bl(near_pB), grid_faces(nB_, mB_))
else:
    near_pA = near_p
    near = make_mesh("near", to_bl(near_p), grid_faces(n, nzn))
fn = meta["far"]["n"]
far_p = np.fromfile(os.path.join(GEO, "far.bin"), dtype=np.float32).reshape(-1, 3)
if meta["near"].get("regions"):
    # 便23: 遠くの網を、南の四角の内側（縁から 10m）で 6m 下げる（本体の addSouth と同じ。下げないと粗い遠くの網が南の地面にかぶさり、光をさえぎって図が黒くなった）
    _A, _B = meta["near"]["regions"]["A"], meta["near"]["regions"]["B"]

    def _in(rc, x, z, m=0.0):
        return (x >= rc["x0"] + m) & (x <= rc["x1"] - m) & (z >= rc["z0"] + m) & (z <= rc["z1"] - m)

    _x, _z = far_p[:, 0], far_p[:, 2]
    _c = lambda a, b: _in(_A, a, b) | _in(_B, a, b)
    _u = _c(_x - 10, _z - 10) & _c(_x + 10, _z - 10) & _c(_x - 10, _z + 10) & _c(_x + 10, _z + 10)
    far_p = far_p.copy()
    far_p[_u & ~_in(_A, _x, _z, 10.0), 1] -= 6.0
far = make_mesh("far", to_bl(far_p), grid_faces(fn))
raw = np.fromfile(os.path.join(GEO, "bldg.bin"), dtype=np.uint8)
nv, ni = meta["bldg"]["nv"], meta["bldg"]["ni"]
bpos = np.frombuffer(raw[: nv * 12].tobytes(), dtype=np.float32).reshape(-1, 3)
bidx = np.frombuffer(raw[nv * 12 : nv * 12 + ni * 4].tobytes(), dtype=np.uint32).reshape(-1, 3)
bbid = np.frombuffer(raw[nv * 12 + ni * 4 : nv * 12 + ni * 4 + nv * 2].tobytes(), dtype=np.uint16)
NBA = meta["bldg"].get("nA")


def bldg_mesh(name, mask):
    # 便23: 建物の番号で北と南に分けた三角形だけの網（使う点だけに詰める）
    f = bidx[mask]
    used = np.unique(f.ravel())
    remap = np.full(len(bpos), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    ob = make_mesh(name, to_bl(bpos[used]), remap[f])
    at = ob.data.attributes.new("bid", "INT", "POINT")
    at.data.foreach_set("value", bbid[used].astype(np.int32))
    return ob


if NBA:
    tri_bid = bbid[bidx[:, 0]]
    bldg = bldg_mesh("bldg", tri_bid < NBA)
    bldg2 = bldg_mesh("bldg2", tri_bid >= NBA)
else:
    bldg = make_mesh("bldg", to_bl(bpos), bidx)
    attr = bldg.data.attributes.new("bid", "INT", "POINT")
    attr.data.foreach_set("value", bbid.astype(np.int32))
    bldg2 = None
# 木（樹冠＝つぶした20面体を1つにまとめた物。焼く時に光をさえぎるだけ）
tr = np.fromfile(os.path.join(GEO, "trees.bin"), dtype=np.float32).reshape(-1, 6)
ico = bmesh.new()
bmesh.ops.create_icosphere(ico, subdivisions=1, radius=1.0)
iv = np.array([v.co[:] for v in ico.verts], dtype=np.float32)
if_ = np.array([[v.index for v in f.verts] for f in ico.faces], dtype=np.int64)
TV, TF = [], []
for k, (x, y, z, h, w, kind) in enumerate(tr):
    c = np.array([x, -z, y + h * 0.62], dtype=np.float32)
    TV.append(iv * np.array([w * 0.5, w * 0.5, h * 0.42], dtype=np.float32) + c)
    TF.append(if_ + k * len(iv))
trees = make_mesh("trees", np.concatenate(TV), np.concatenate(TF))
say(f"形: 近くの地形 {n}×{nzn}・遠くの地形 {fn}×{fn}・建物 {len(bidx)} 三角形・木 {len(tr)} 本（{len(TF) * len(if_)} 三角形）")

near.data.materials.append(mat("ground", 0.32))
if near2:
    near2.data.materials.append(mat("ground2", 0.32))
far.data.materials.append(mat("far", 0.25))
bldg.data.materials.append(mat("wall", 0.55))
if bldg2:
    bldg2.data.materials.append(mat("wall2", 0.55))
trees.data.materials.append(mat("leaf", 0.18))

# 建物: 1cm 以内の点をまとめてから、面の向きで島に分けて図へ並べる（光の図の位置）
def unwrap(bldg):
  for o in sc.objects:
    o.select_set(False)
  bpy.context.view_layer.objects.active = bldg
  bldg.select_set(True)
  bpy.ops.object.mode_set(mode="EDIT")
  bpy.ops.mesh.select_all(action="SELECT")
  bpy.ops.mesh.remove_doubles(threshold=0.01)
# 便21: 前は smart_project の島ごとの余白（0.0015）が島の数（10万を超える）だけ場所を取り、図の 0.7%（建物を広げた後は 0.15%）しか使っていなかった
#   （1 画素が 4.6m → 16m・屋根1枚が数画素に潰れて黒く写った）。島は余白なしで作り、並べ直す時に余白を図の 0.0005（約2画素）だけ取る
  bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
  bpy.ops.uv.select_all(action="SELECT")
  bpy.ops.uv.pack_islands(rotate=False, margin_method="FRACTION", margin=0.0005, shape_method="AABB")
  bpy.ops.object.mode_set(mode="OBJECT")
  bldg.select_set(False)
  say(f"建物の図の位置（{bldg.name}）: {len(bldg.data.vertices)} 点にまとめて島に分けた（{time.time() - t0:.0f} 秒）")


unwrap(bldg)
if bldg2:
    unwrap(bldg2)

# 地形: 真上から見た図の位置（x・y を 0〜1 に）
# 便21: 四角の範囲（x0..x1・z0..z1）。Blender の y＝北＝−z。図の縦は南の端（z1）が 0・北の端（z0）が 1
def top_uv(ob, pts, rc):
    uvl = ob.data.uv_layers.new(name="lm")
    lv = np.empty(len(ob.data.loops), dtype=np.int32)
    ob.data.loops.foreach_get("vertex_index", lv)
    co = to_bl(pts)
    NX0, NX1, NZ0, NZ1 = rc["x0"], rc["x1"], rc["z0"], rc["z1"]
    uv = np.stack([(co[lv, 0] - NX0) / (NX1 - NX0), (co[lv, 1] + NZ1) / (NZ1 - NZ0), ], 1).astype(np.float32)
    uvl.data.foreach_set("uv", uv.ravel())


RC_A = REG["A"] if REG else {k: meta["near"][k] for k in ("x0", "x1", "z0", "z1")}
top_uv(near, near_pA, RC_A)
# 地形の図は範囲の縦横の比に合わせる（横 RES・縦は比で 16 の倍数）
RES_TZ = int(round(RES * (RC_A["z1"] - RC_A["z0"]) / (RC_A["x1"] - RC_A["x0"]) / 16)) * 16
if near2:
    top_uv(near2, near_pB, REG["B"])
    # 便23: 南の四角は縦長＝縦 RES・横は比で 16 の倍数（1m あたりの画素は北の四角と同じ）
    RES_TX2 = int(round(RES * (REG["B"]["x1"] - REG["B"]["x0"]) / (REG["B"]["z1"] - REG["B"]["z0"]) / 16)) * 16

# ── 空の光（白一色・強さ 1）と、焼く道具 ──
world = bpy.data.worlds.new("sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
sc.world = world
sc.render.engine = "CYCLES"
cy = sc.cycles
cy.samples = SAMPLES
cy.max_bounces = 3
cy.diffuse_bounces = 3
dev = "CPU"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if gpus:
                for d in prefs.devices:
                    d.use = d.type == kind
                cy.device = "GPU"
                dev = f"{kind}（{gpus[0].name}）"
                break
        except Exception:
            pass
except Exception as e:
    say(f"GPU を使えない: {e}")
say(f"焼く道具: Cycles・{dev}・光の数 {SAMPLES}・照り返し 3 回・図 {RES}×{RES}")


def bake(ob, name, uv_name=None, h=None, w=None):
    W, H = (w or RES), (h or RES)
    img = bpy.data.images.new(name, W, H, float_buffer=True)
    m = ob.data.materials[0]
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    if uv_name:
        ob.data.uv_layers.active = ob.data.uv_layers[uv_name]
    for o in sc.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    t = time.time()
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=6, use_clear=True)
    px = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    v = px.reshape(H, W, 4)[:, :, 0]
    # 光の数が少ない所のざらつきを、3×3 の平均で少しならす
    pad = np.pad(v, 1, mode="edge")
    v = sum(pad[dy : dy + H, dx : dx + W] for dy in range(3) for dx in range(3)) / 9.0
    say(f"焼いた: {name}（{time.time() - t:.0f} 秒・明るさ 平均 {v[v > 0.001].mean():.3f}・1% {np.percentile(v[v > 0.001], 1):.3f}・99% {np.percentile(v[v > 0.001], 99):.3f}）")
    return v


def save_png(v, path):
    # 8 ビットの灰色（0〜1.25 を 0〜255 に。開けた地面はおよそ 1.0）。図の上下は three.js の向きへ
    g = np.clip(v / 1.25, 0, 1) ** (1 / 2.2)
    H, W = v.shape
    img = bpy.data.images.new(os.path.basename(path), W, H)
    rgba = np.ones((H, W, 4), dtype=np.float32)
    rgba[:, :, 0] = rgba[:, :, 1] = rgba[:, :, 2] = g
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


v = bake(near, "lm_terrain", "lm", RES_TZ)
save_png(v, os.path.join(OUT, "lm_terrain.png"))
v = bake(bldg, "lm_bldg", bldg.data.uv_layers[0].name)
save_png(v, os.path.join(OUT, "lm_bldg.png"))
if near2:
    v = bake(near2, "lm_terrain2", "lm", RES, RES_TX2)
    save_png(v, os.path.join(OUT, "lm_terrain2.png"))
if bldg2:
    v = bake(bldg2, "lm_bldg2", bldg2.data.uv_layers[0].name)
    save_png(v, os.path.join(OUT, "lm_bldg2.png"))

# 建物の三角形の角ごとの 位置・図の位置・建物の番号 を書き出す（three.js の向きへ戻す）。便23: 北の建物の後ろに南の建物（南の図の位置）
def export(bldg):
    me = bldg.data
    me.calc_loop_triangles()
    nl = len(me.loop_triangles)
    tri_loops = np.empty(nl * 3, dtype=np.int32)
    me.loop_triangles.foreach_get("loops", tri_loops)
    lvi = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", lvi)
    vco = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", vco)
    vco = vco.reshape(-1, 3)
    luv = np.empty(len(me.loops) * 2, dtype=np.float32)
    me.uv_layers[0].data.foreach_get("uv", luv)
    luv = luv.reshape(-1, 2)
    bid = np.empty(len(me.vertices), dtype=np.int32)
    me.attributes["bid"].data.foreach_get("value", bid)
    vi = lvi[tri_loops]
    p = vco[vi]
    return np.concatenate([np.stack([p[:, 0], p[:, 2], -p[:, 1]], 1), luv[tri_loops], bid[vi][:, None].astype(np.float32)], 1).astype(np.float32)


outA = export(bldg)
out = np.concatenate([outA, export(bldg2)]) if bldg2 else outA
out.tofile(os.path.join(OUT, "bldg_baked.bin"))
json.dump({"nvA": int(len(outA)), "nv": int(len(out)), "terrain2": [RES_TX2, RES] if near2 else None, "terrain": [RES, RES_TZ]}, open(os.path.join(OUT, "bake.json"), "w"))
say(f"建物を書き出した: 角 {len(out)}（北 {len(outA)}・{out.nbytes / 1e6:.1f}MB）・全体 {time.time() - t0:.0f} 秒")
open(os.path.join(OUT, "bake-log.txt"), "w", encoding="utf-8").write("\n".join(log) + "\n")
