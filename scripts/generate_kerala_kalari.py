import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# ==============================================================================
# KALIYUGHAM — Authentic 18th-Century Kerala Kuzhi Kalari (1K PBR + Realistic Roof)
# ==============================================================================
# Historically grounded in traditional Nalpathirandadi (42ft x 21ft, 2:1)
# Kerala Kuzhi Kalari architecture (13.2m x 8.2m combat pit):
#   - Compacted red-earth (Chenmannu) pit floor + coursed weathered red-laterite
#     retaining walls (1K PBR) + granite thresholds & spectator parapet ledges
#   - Lathe-turned dark Malabar teak pillars with stone plinths & Pothika brackets
#   - REALISTIC 3-TIER STEPPED COCONUT-PALM (OLA) THATCH ROOF (1K PBR Albedo +
#     Normal + Roughness) with 3 overlapping physical thatch layers, shaggy drip
#     eaves, thick woven palm ridge roll, external dark bamboo wind-tie poles
#     (Pattika), mathematically clipped underside Kazhukol rafters (zero poking!),
#     carved Mukhappu gable louvers & twin antique brass Thazhikakudam finials!
#   - Sacred 7-tiered stepped Poothara altar (SW corner), Guruthara, Ganapathithara,
#     Ayudha Thara weapon rack & hanging brass Thookkuvilakku lamp.
#
# Exports crisp 1K PBR .glb to:
#   /Users/vishnuk/Documents/project/game/public/models/kalari_arena.glb
# ==============================================================================

SCRIPTS_DIR = "/Users/vishnuk/Documents/project/game/scripts"
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import importlib
import kerala_pbr_materials as kpbr
import generate_house_mana as mh
importlib.reload(kpbr)
importlib.reload(mh)

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models"


def make_simple_pbr_mat(name, rgb, roughness=0.85, emission_rgb=None, emission_str=0.0):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        if emission_rgb and "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission_rgb, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_str
    return mat


def add_thatch_tier_shell(col, name, z_eave, z_ridge, hw, hd, ridge_hw, thickness, mat):
    bm = bmesh.new()
    v_fl = bm.verts.new((-hw,  hd, z_eave))
    v_fr = bm.verts.new(( hw,  hd, z_eave))
    v_br = bm.verts.new(( hw, -hd, z_eave))
    v_bl = bm.verts.new((-hw, -hd, z_eave))
    v_rl = bm.verts.new((-ridge_hw, 0.0, z_ridge))
    v_rr = bm.verts.new(( ridge_hw, 0.0, z_ridge))
    bm.faces.new((v_fl, v_fr, v_rr, v_rl))
    bm.faces.new((v_br, v_bl, v_rl, v_rr))
    bm.faces.new((v_bl, v_fl, v_rl))
    bm.faces.new((v_fr, v_br, v_rr))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    sol = obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 1.0
    mh.link_obj(obj, col)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    return obj


def build_kerala_kalari(mats):
    col = mh.reset_collection("kalari_arena")

    mat_laterite   = mats["laterite"]
    mat_granite    = mats["granite"]
    mat_red_oxide  = mats["oxide"]
    mat_lime       = mats["lime"]
    mat_teak       = mats["teak"]
    mat_teak_plank = mats["teak_planks"]
    mat_thatch     = mats["thatch"]
    mat_mud        = mats["mud"]
    mat_brass      = mats["brass"]
    mat_flower     = make_simple_pbr_mat("KalariMarigold", (0.86, 0.42, 0.06), roughness=0.82)
    mat_flame      = make_simple_pbr_mat("KalariFlame", (1.0, 0.72, 0.18), roughness=0.25, emission_rgb=(1.0, 0.56, 0.12), emission_str=3.5)

    # Spacious 18th-century Kuzhi Kalari footprint: 13.2m long (X) x 8.2m wide (Y)
    W, D = 13.2, 8.2
    hw, hd = W * 0.5, D * 0.5

    # 1) Foundation Plinth & Compacted Red-Earth (Chenmannu) Combat Pit Floor
    mh.add_box(col, "OuterPlinth", (0.0, 0.0, 0.05), (W + 0.7, D + 0.7, 0.10), mat_granite, bevel=0.02)
    mh.add_box(col, "RedEarthPitFloor", (0.0, 0.0, 0.085), (W - 0.65, D - 0.65, 0.05), mat_mud)

    # 2) Thick Coursed Weathered Laterite Retaining Walls (0.94m) + Spectator Parapets
    wall_h = 0.94
    wall_t = 0.42

    mh.add_box(col, "WallBack",     (0.0, -hd + wall_t * 0.5, wall_h * 0.5), (W, wall_t, wall_h), mat_laterite)
    mh.add_box(col, "WallBackDado", (0.0, -hd + wall_t + 0.02, wall_h * 0.48), (W - 0.8, 0.04, wall_h * 0.85), mat_red_oxide)
    mh.add_box(col, "WallBackCap",  (0.0, -hd + wall_t * 0.5, wall_h + 0.04), (W + 0.12, wall_t + 0.12, 0.08), mat_granite, bevel=0.015)

    mh.add_box(col, "WallWest",     (-hw + wall_t * 0.5, 0.0, wall_h * 0.5), (wall_t, D, wall_h), mat_laterite)
    mh.add_box(col, "WallWestDado", (-hw + wall_t + 0.02, 0.0, wall_h * 0.48), (0.04, D - 0.8, wall_h * 0.85), mat_red_oxide)
    mh.add_box(col, "WallWestCap",  (-hw + wall_t * 0.5, 0.0, wall_h + 0.04), (wall_t + 0.12, D + 0.12, 0.08), mat_granite, bevel=0.015)

    # East (+X) wall split for a 2.6m ceremonial doorway + granite steps
    e_seg = (D - 2.6) * 0.5
    for sy, tag in ((-1, "ES"), (1, "EN")):
        cy = sy * (1.3 + e_seg * 0.5)
        mh.add_box(col, f"WallEast_{tag}",    (hw - wall_t * 0.5, cy, wall_h * 0.5), (wall_t, e_seg, wall_h), mat_laterite)
        mh.add_box(col, f"WallEastCap_{tag}", (hw - wall_t * 0.5, cy, wall_h + 0.04), (wall_t + 0.12, e_seg + 0.08, 0.08), mat_granite, bevel=0.015)

    # Front (+Y) wall with wide 3.2m entrance + spectator benches (Thara)
    f_seg = (W - 3.2) * 0.5
    for sx, tag in ((-1, "FL"), (1, "FR")):
        cx = sx * (1.6 + f_seg * 0.5)
        mh.add_box(col, f"WallFront_{tag}",         (cx, hd - wall_t * 0.5, wall_h * 0.5), (f_seg, wall_t, wall_h), mat_laterite)
        mh.add_box(col, f"WallFrontCap_{tag}",      (cx, hd - wall_t * 0.5, wall_h + 0.04), (f_seg + 0.08, wall_t + 0.12, 0.08), mat_granite, bevel=0.015)
        mh.add_box(col, f"SpectatorBench_{tag}",    (cx, hd - wall_t - 0.26, 0.26), (f_seg - 0.4, 0.46, 0.42), mat_laterite)
        mh.add_box(col, f"SpectatorBenchTop_{tag}", (cx, hd - wall_t - 0.26, 0.48), (f_seg - 0.36, 0.50, 0.06), mat_granite, bevel=0.012)

    mh.add_box(col, "FrontStepOut", (0.0, hd + 0.28, 0.06), (3.3, 0.62, 0.12), mat_granite, bevel=0.015)
    mh.add_box(col, "FrontStepIn",  (0.0, hd - 0.18, 0.09), (3.1, 0.42, 0.08), mat_granite, bevel=0.012)
    mh.add_box(col, "EastStepOut",  (hw + 0.28, 0.0, 0.06), (0.62, 2.7, 0.12), mat_granite, bevel=0.015)

    # 3) Carved Malabar Teak Pillars with Stone Plinths & Pothika Brackets
    pillar_h = 3.05
    pillar_xs = [-hw + 0.40, -hw * 0.48, 0.0, hw * 0.48, hw - 0.40]
    pillar_ys = [-hd + 0.40, hd - 0.40]

    for ix, px in enumerate(pillar_xs):
        for iy, py in enumerate(pillar_ys):
            if ix == 2 and iy == 1:
                continue
            mh.add_box(col, f"PillarBase_{ix}_{iy}", (px, py, 0.52), (0.40, 0.40, 0.96), mat_laterite, bevel=0.015)
            mh.add_kerala_pillar(col, f"KalariP_{ix}_{iy}", px, py, 0.96, pillar_h - 0.96, mats)

    for sx, tag in ((-1, "West"), (1, "East")):
        mx = sx * (hw - 0.42)
        if sx == 1:
            for sy, st in ((-1, "S"), (1, "N")):
                mh.add_cylinder(col, f"DoorPost_{st}", (mx, sy * 1.32, 1.09 + (pillar_h - 1.09) * 0.5), 0.12, 0.10, pillar_h - 1.09, 10, mat_teak)
            mh.add_box(col, "EastLintel", (mx, 0.0, pillar_h - 0.22), (0.26, 2.95, 0.22), mat_teak, bevel=0.015)
        else:
            mh.add_box(col, "WestMainBase", (mx, 0.0, 0.52), (0.44, 0.44, 0.96), mat_laterite, bevel=0.015)
            mh.add_cylinder(col, "WestMainShaft", (mx, 0.0, 1.0 + (pillar_h + 2.4 - 1.0) * 0.5), 0.15, 0.12, pillar_h + 2.4 - 1.0, 12, mat_teak)

    for py, tag in ((pillar_ys[0], "Back"), (pillar_ys[1], "Front")):
        mh.add_box(col, f"WallPlate_{tag}", (0.0, py, pillar_h + 0.16), (W + 0.6, 0.24, 0.22), mat_teak)
    for ix, px in enumerate(pillar_xs):
        mh.add_box(col, f"CrossTie_{ix}", (px, 0.0, pillar_h + 0.16), (0.22, D + 0.5, 0.22), mat_teak)

    # Woven coconut-leaf privacy screens (Thatti) along back & west walls
    mh.add_box(col, "ThattiBack", (0.0, -hd + 0.22, 1.82), (W - 0.9, 0.07, 1.55), mat_thatch)
    mh.add_box(col, "ThattiWest", (-hw + 0.22, 0.0, 1.82), (0.07, D - 0.9, 1.55), mat_thatch)
    for bz in (1.35, 1.85, 2.35):
        mh.add_box(col, f"BattenBack_{bz}", (0.0, -hd + 0.28, bz), (W - 0.85, 0.05, 0.055), mat_teak)
        mh.add_box(col, f"BattenWest_{bz}", (-hw + 0.28, 0.0, bz), (0.05, D - 0.85, 0.055), mat_teak)

    # 4) REALISTIC 3-TIER STEPPED COCONUT-PALM (OLA) THATCH ROOF + WIND-TIE POLES + CLIPPED RAFTERS
    eave_z = pillar_h - 0.06
    ridge_z = pillar_h + 2.68
    roof_hw = hw + 1.45
    roof_hd = hd + 1.45
    ridge_hw = hw - 1.55

    # Tier 1 (Main full-height dense palm thatch base shell)
    add_thatch_tier_shell(col, "KalariThatchBase", eave_z, ridge_z, roof_hw, roof_hd, ridge_hw, 0.24, mat_thatch)
    # Tier 2 (Mid overlapping shaggy thatch course stepping outward by 0.14m for real layered depth!)
    t2_eave = eave_z + (ridge_z - eave_z) * 0.34
    t2_hw = roof_hw - (roof_hw - ridge_hw) * 0.28 + 0.16
    t2_hd = roof_hd * 0.68 + 0.16
    add_thatch_tier_shell(col, "KalariThatchMid", t2_eave, ridge_z + 0.07, t2_hw, t2_hd, ridge_hw, 0.18, mat_thatch)
    # Tier 3 (Upper overlapping crown thatch course)
    t3_eave = eave_z + (ridge_z - eave_z) * 0.67
    t3_hw = roof_hw - (roof_hw - ridge_hw) * 0.58 + 0.14
    t3_hd = roof_hd * 0.36 + 0.14
    add_thatch_tier_shell(col, "KalariThatchCrown", t3_eave, ridge_z + 0.14, t3_hw, t3_hd, ridge_hw, 0.16, mat_thatch)

    # Thick bundled woven palm-frond ridge roll (Kumbil) + external dark bamboo monsoon wind-tie poles (Pattika)
    mh.add_cylinder(
        col, "ThatchRidgeRoll",
        (0.0, 0.0, ridge_z + 0.30),
        0.22, 0.22, ridge_hw * 2.0 + 0.45, 12,
        mat_thatch,
        rot_xyz=(0.0, math.pi * 0.5, 0.0),
    )
    # Horizontal bamboo wind-clamp poles resting outside each thatch tier on front & back slopes
    for ti, frac in enumerate((0.22, 0.52, 0.80)):
        py_s = roof_hd * (1.0 - frac)
        pz_s = eave_z + (ridge_z - eave_z) * frac + 0.34
        pole_len = (ridge_hw + (roof_hw - ridge_hw) * (1.0 - frac)) * 1.92
        for sy, tag in ((-1, "B"), (1, "F")):
            mh.add_cylinder(
                col, f"WindPole_{ti}_{tag}",
                (0.0, sy * py_s, pz_s),
                0.042, 0.042, pole_len, 8,
                mat_teak,
                rot_xyz=(0.0, math.pi * 0.5, 0.0),
            )

    # Mathematically clipped underside teak Kazhukol rafters (zero poking through hip corners!)
    n_r = max(6, int((roof_hw * 2.0) / 0.90))
    for i in range(n_r):
        rx = -roof_hw + 0.55 + (i / max(1, n_r - 1)) * (roof_hw * 2.0 - 1.1)
        dx_c = abs(rx)
        frac = 1.0 if dx_c <= ridge_hw else max(0.0, (roof_hw - dx_c) / max(0.01, roof_hw - ridge_hw))
        if frac < 0.22:
            continue
        for sy, tag in ((-1, "B"), (1, "F")):
            p0 = Vector((rx, sy * (roof_hd - 0.10), eave_z - 0.14))
            p1 = Vector((rx, sy * (roof_hd * (1.0 - frac)), eave_z + (ridge_z - eave_z) * frac - 0.16))
            vec = p1 - p0
            if vec.length < 0.35:
                continue
            rot = vec.normalized().to_track_quat("Y", "Z").to_euler()
            mh.add_box(col, f"Rafter_{i}_{tag}", (p0 + p1) * 0.5, (0.07, vec.length, 0.085), mat_teak, rot_xyz=rot)

    # Carved Mukhappu timber gable vents & twin antique brass Thazhikakudam finials
    for sx, tag in ((-1, "W"), (1, "E")):
        gx = sx * (ridge_hw + 0.14)
        mh.add_box(col, f"MukhappuFrame_{tag}", (gx, 0.0, ridge_z - 0.18), (0.18, 0.94, 0.54), mat_teak_plank, bevel=0.015)
        mh.add_brass_finial(col, f"KalariFinial_{tag}", sx * ridge_hw, 0.0, ridge_z + 0.42, mats, scale=1.10)

    # 5) Sacred 7-Tiered Poothara Altar (SW Corner), Guruthara, Ganapathithara & Weapon Rack
    px0, py0 = -hw + 1.22, -hd + 1.22
    for tier in range(7):
        r_t = 0.88 - tier * 0.095
        h_t = 0.125
        z_t = 0.11 + tier * h_t + h_t * 0.5
        mh.add_cylinder(col, f"PootharaTier_{tier}", (px0, py0, z_t), r_t, r_t * 0.96, h_t, 12, mat_lime if tier % 2 == 0 else mat_red_oxide)
        if tier in (1, 3, 5):
            for k in range(3):
                ang = 0.18 + k * 0.60
                lx = px0 + math.cos(ang) * (r_t - 0.04)
                ly = py0 + math.sin(ang) * (r_t - 0.04)
                mh.add_cylinder(col, f"Chirathu_{tier}_{k}", (lx, ly, z_t + h_t * 0.5 + 0.015), 0.032, 0.042, 0.03, 8, mat_laterite)
                mh.add_sphere(col, f"ChirathuFlame_{tier}_{k}", (lx, ly, z_t + h_t * 0.5 + 0.048), 0.016, (0.8, 0.8, 1.5), mat_flame, 8, 6)

    top_z = 0.11 + 7 * 0.125
    mh.add_sphere(col, "PootharaKumbha", (px0, py0, top_z + 0.11), 0.12, (1.0, 1.0, 1.45), mat_lime)
    mh.add_cylinder(col, "PootharaApex", (px0, py0, top_z + 0.28), 0.045, 0.012, 0.14, 10, mat_brass)
    for k in range(8):
        a = (k / 8) * math.pi * 2
        mh.add_sphere(col, f"Garland_{k}", (px0 + math.cos(a) * 0.14, py0 + math.sin(a) * 0.14, top_z + 0.04), 0.032, (1.0, 1.0, 0.9), mat_flower, 8, 6)

    # Tall brass Nilavilakku lamp in front of Poothara
    lx, ly = px0 + 1.08, py0 + 0.78
    mh.add_cylinder(col, "NilavilakkuBase", (lx, ly, 0.15), 0.19, 0.09, 0.09, 14, mat_brass)
    mh.add_cylinder(col, "NilavilakkuStem", (lx, ly, 0.62), 0.032, 0.024, 0.88, 10, mat_brass)
    mh.add_cylinder(col, "NilavilakkuBowl", (lx, ly, 1.07), 0.065, 0.155, 0.09, 14, mat_brass)
    mh.add_cylinder(col, "NilavilakkuTop",  (lx, ly, 1.22), 0.035, 0.008, 0.22, 10, mat_brass)
    mh.add_sphere(col, "NilavilakkuFlame",  (lx + 0.11, ly + 0.06, 1.13), 0.024, (0.8, 0.8, 1.6), mat_flame, 8, 6)

    # Guruthara & Ganapathithara shrines along West wall
    gx0, gy0 = -hw + 0.95, 0.65
    mh.add_box(col, "GurutharaBase", (gx0, gy0, 0.26), (0.85, 1.35, 0.34), mat_laterite)
    mh.add_box(col, "GurutharaTop",  (gx0, gy0, 0.45), (0.90, 1.40, 0.06), mat_granite)
    mh.add_sphere(col, "KindiBody",  (gx0 + 0.12, gy0 - 0.28, 0.56), 0.085, (1.0, 1.0, 0.92), mat_brass)
    mh.add_cylinder(col, "KindiNeck",(gx0 + 0.12, gy0 - 0.28, 0.66), 0.036, 0.048, 0.08, 10, mat_brass)
    mh.add_cylinder(col, "GuruLampStem", (gx0 + 0.10, gy0 + 0.22, 0.64), 0.06, 0.018, 0.32, 10, mat_brass)
    mh.add_cylinder(col, "GuruLampBowl", (gx0 + 0.10, gy0 + 0.22, 0.81), 0.03, 0.075, 0.05, 10, mat_brass)

    mh.add_box(col, "GanapathitharaBase", (-hw + 0.95, hd - 1.15, 0.22), (0.78, 0.78, 0.26), mat_laterite)
    mh.add_box(col, "GanapathitharaTop",  (-hw + 0.95, hd - 1.15, 0.37), (0.62, 0.62, 0.06), mat_granite)
    mh.add_sphere(col, "GanapathiFlower", (-hw + 0.95, hd - 1.15, 0.44), 0.045, (1.1, 1.1, 0.8), mat_flower, 8, 6)

    # Back-wall Ayudha Thara weapon rack & hanging Thookkuvilakku lamp
    rx, ry = 1.8, -hd + 0.62
    for sx in (-1.15, 1.15):
        mh.add_box(col, f"AyudhaPost_{sx}", (rx + sx, ry, 1.05), (0.11, 0.11, 1.88), mat_teak)
    for rz in (0.68, 1.38, 1.88):
        mh.add_box(col, f"AyudhaRail_{rz}", (rx, ry, rz), (2.48, 0.09, 0.09), mat_teak)
    for k in range(6):
        mh.add_cylinder(col, f"RackKettukari_{k}", (rx - 0.82 + k * 0.33, ry + 0.07, 1.00), 0.015, 0.014, 1.80, 8, mat_teak, rot_xyz=(0.10, 0.0, 0.0))

    mh.add_cylinder(col, "HangChain",    (0.0, 0.0, ridge_z - 0.95), 0.012, 0.012, 1.95, 8, mat_brass)
    mh.add_cylinder(col, "HangLampBowl", (0.0, 0.0, ridge_z - 1.95), 0.06, 0.18, 0.10, 14, mat_brass)
    mh.add_sphere(col, "HangLampFlame",  (0.0, 0.0, ridge_z - 1.87), 0.028, (1.0, 1.0, 1.5), mat_flame, 8, 6)

    # Apply real-world scaled box/slope UVs (so palm thatch runs straight down every roof slope!) & export GLB
    os.makedirs(EXPORT_DIR, exist_ok=True)
    objs = [o for o in col.objects if o.type == "MESH"]
    for o in objs:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        mat_name = o.data.materials[0].name if o.data.materials else ""
        if "thatch" in mat_name:
            tile_m = 1.65
        elif "laterite" in mat_name or "granite" in mat_name:
            tile_m = 1.75
        else:
            tile_m = 1.6
        kpbr.apply_world_box_uvs(o, tile_meters=tile_m)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    arena = bpy.context.view_layer.objects.active
    arena.name = "kalari_arena"

    bbox = [arena.matrix_world @ Vector(c) for c in arena.bound_box]
    arena.location.z -= min(v.z for v in bbox)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    out_path = os.path.join(EXPORT_DIR, "kalari_arena.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_morph=False,
        export_animations=False,
    )
    print("Exported realistic 1K PBR Kuzhi Kalari with 3-tier stepped palm thatch roof:", out_path)


if __name__ == "__main__":
    mats = kpbr.get_kerala_material_palette(force_rebake=False)
    build_kerala_kalari(mats)
