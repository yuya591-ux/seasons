"""便17（鴨川の質の見本）: Blender（pip の bpy・無料・登録なし）で、地形と建物に「光の回り方」を焼き込む。

焼く物: 空いっぱいの白い光（時刻に依らない）に当てた時の、面ごとの明るさ（直に届く空の光＋まわりの面の照り返し）。
  ＝建物の足もと・路地・軒下・木の下が柔らかく暗くなり、明るい壁の照り返しが入る。太陽の光と影は実行時（three.js）に足す。
  時刻・季節で色を変える器（本体の情景のデータ）と合わせるため、色は焼かず明るさだけを焼く。
入る物: scripts/_bin17-data/geo/（_bin17-build.mjs が作る・原点からのメートル）
出る物: scripts/_bin17-data/bake/（git に入れない）
  lm_terrain.png … 近くの地形の明るさ（真上から見た図・±NEAR_R m）
  lm_bldg.png    … 建物の明るさ（建物の面を図に並べた物）
  bldg_baked.bin … 建物の三角形の角ごとの 位置(3)・図の位置(2)・建物の番号(1)（float32）
  bake-log.txt
使い方: py -3.13 scripts/_bin17-bake.py [解像度=4096] [光の数=96]
"""
import json
import os
import sys
import time

import bpy  # bpy を先に読む（bmesh は bpy の後でないと読めない）
import bmesh  # noqa: E402
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GEO = os.path.join(ROOT, "scripts", "_bin17-data", "geo")
OUT = os.path.join(ROOT, "scripts", "_bin17-data", "bake")
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


def grid_faces(n):
    i = np.arange(n - 1)
    a = (i[None, :] + (i[:, None]) * n).ravel()
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
n = meta["near"]["n"]
near_p = np.fromfile(os.path.join(GEO, "near.bin"), dtype=np.float32).reshape(-1, 3)
near = make_mesh("near", to_bl(near_p), grid_faces(n))
fn = meta["far"]["n"]
far_p = np.fromfile(os.path.join(GEO, "far.bin"), dtype=np.float32).reshape(-1, 3)
far = make_mesh("far", to_bl(far_p), grid_faces(fn))
raw = np.fromfile(os.path.join(GEO, "bldg.bin"), dtype=np.uint8)
nv, ni = meta["bldg"]["nv"], meta["bldg"]["ni"]
bpos = np.frombuffer(raw[: nv * 12].tobytes(), dtype=np.float32).reshape(-1, 3)
bidx = np.frombuffer(raw[nv * 12 : nv * 12 + ni * 4].tobytes(), dtype=np.uint32).reshape(-1, 3)
bbid = np.frombuffer(raw[nv * 12 + ni * 4 : nv * 12 + ni * 4 + nv * 2].tobytes(), dtype=np.uint16)
bldg = make_mesh("bldg", to_bl(bpos), bidx)
attr = bldg.data.attributes.new("bid", "INT", "POINT")
attr.data.foreach_set("value", bbid.astype(np.int32))
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
say(f"形: 近くの地形 {n}×{n}・遠くの地形 {fn}×{fn}・建物 {len(bidx)} 三角形・木 {len(tr)} 本（{len(TF) * len(if_)} 三角形）")

near.data.materials.append(mat("ground", 0.32))
far.data.materials.append(mat("far", 0.25))
bldg.data.materials.append(mat("wall", 0.55))
trees.data.materials.append(mat("leaf", 0.18))

# 建物: 1cm 以内の点をまとめてから、面の向きで島に分けて図へ並べる（光の図の位置）
bpy.context.view_layer.objects.active = bldg
bldg.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=0.01)
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.0015, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
bpy.ops.object.mode_set(mode="OBJECT")
bldg.select_set(False)
say(f"建物の図の位置: {len(bldg.data.vertices)} 点にまとめて島に分けた（{time.time() - t0:.0f} 秒）")

# 地形: 真上から見た図の位置（x・y を 0〜1 に）
uvl = near.data.uv_layers.new(name="lm")
lv = np.empty(len(near.data.loops), dtype=np.int32)
near.data.loops.foreach_get("vertex_index", lv)
co = to_bl(near_p)
R = meta["near"]["R"]
uv = np.stack([(co[lv, 0] + R) / (2 * R), (co[lv, 1] + R) / (2 * R)], 1).astype(np.float32)
uvl.data.foreach_set("uv", uv.ravel())

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


def bake(ob, name, uv_name=None):
    img = bpy.data.images.new(name, RES, RES, float_buffer=True)
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
    px = np.empty(RES * RES * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    v = px.reshape(RES, RES, 4)[:, :, 0]
    # 光の数が少ない所のざらつきを、3×3 の平均で少しならす
    pad = np.pad(v, 1, mode="edge")
    v = sum(pad[dy : dy + RES, dx : dx + RES] for dy in range(3) for dx in range(3)) / 9.0
    say(f"焼いた: {name}（{time.time() - t:.0f} 秒・明るさ 平均 {v[v > 0.001].mean():.3f}・1% {np.percentile(v[v > 0.001], 1):.3f}・99% {np.percentile(v[v > 0.001], 99):.3f}）")
    return v


def save_png(v, path):
    # 8 ビットの灰色（0〜1.25 を 0〜255 に。開けた地面はおよそ 1.0）。図の上下は three.js の向きへ
    g = np.clip(v / 1.25, 0, 1) ** (1 / 2.2)
    img = bpy.data.images.new(os.path.basename(path), RES, RES)
    rgba = np.ones((RES, RES, 4), dtype=np.float32)
    rgba[:, :, 0] = rgba[:, :, 1] = rgba[:, :, 2] = g
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


v = bake(near, "lm_terrain", "lm")
save_png(v, os.path.join(OUT, "lm_terrain.png"))
v = bake(bldg, "lm_bldg", bldg.data.uv_layers[0].name)
save_png(v, os.path.join(OUT, "lm_bldg.png"))

# 建物の三角形の角ごとの 位置・図の位置・建物の番号 を書き出す（three.js の向きへ戻す）
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
out = np.concatenate([np.stack([p[:, 0], p[:, 2], -p[:, 1]], 1), luv[tri_loops], bid[vi][:, None].astype(np.float32)], 1).astype(np.float32)
out.tofile(os.path.join(OUT, "bldg_baked.bin"))
say(f"建物を書き出した: 角 {len(out)}（{out.nbytes / 1e6:.1f}MB）・全体 {time.time() - t0:.0f} 秒")
open(os.path.join(OUT, "bake-log.txt"), "w", encoding="utf-8").write("\n".join(log) + "\n")
