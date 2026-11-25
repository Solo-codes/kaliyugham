import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# ==============================================================================
# KALIYUGHAM — House #4: Working-Class Farmer Chala & Laborer Kudil (1K PBR)
# ==============================================================================
# Exports:
#   1. /Users/vishnuk/Documents/project/game/public/models/houses/farmer_chala.glb
#   2. /Users/vishnuk/Documents/project/game/public/models/houses/laborer_kudil.glb
#
# Authentic 18th-century working-class rural Kerala homes:
#   - Farmer Chala: Compacted red laterite base + hand-packed cob/mud (Cheli) walls
#     + wooden corner posts + low front verandah (Thinna) + timber plank doorway &
#     barred windows + thick steep coconut-palm Ola thatch roof with tucked rafters.
#   - Laborer Kudil: Modest single-room cob/mud & timber hut on a raised laterite/earth
#     plinth with low shaded porch & thick steep layered palm-thatch roof.
# ==============================================================================

SCRIPTS_DIR = "/Users/vishnuk/Documents/project/game/scripts"
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import importlib
import kerala_pbr_materials as kpbr
import generate_house_mana as mh
importlib.reload(kpbr)
importlib.reload(mh)


def add_thatch_hipped_roof(col, prefix, cx, cy, z_eave, z_ridge, hw, hd, ridge_hw, mats):
    """Thick layered coconut-palm (Ola) thatch roof with properly clipped underside teak rafters."""
    bm = bmesh.new()
    v_fl = bm.verts.new((cx - hw, cy + hd, z_eave))
    v_fr = bm.verts.new((cx + hw, cy + hd, z_eave))
    v_br = bm.verts.new((cx + hw, cy - hd, z_eave))
    v_bl = bm.verts.new((cx - hw, cy - hd, z_eave))
    v_rl = bm.verts.new((cx - ridge_hw, cy, z_ridge))
    v_rr = bm.verts.new((cx + ridge_hw, cy, z_ridge))
    bm.faces.new((v_fl, v_fr, v_rr, v_rl))
    bm.faces.new((v_br, v_bl, v_rl, v_rr))
    bm.faces.new((v_bl, v_fl, v_rl))
    bm.faces.new((v_fr, v_br, v_rr))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(f"{prefix}_ThatchShell")
    bm.to_mesh(mesh)
    bm.free()
    roof_obj = bpy.data.objects.new(f"{prefix}_ThatchShell", mesh)
    roof_obj.data.materials.append(mats["thatch"])
    sol = roof_obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.24
    sol.offset = 1.0
    mh.link_obj(roof_obj, col)
    bpy.context.view_layer.objects.active = roof_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")

    # Thick woven palm ridge cap roll along the crest
    if ridge_hw > 0.05:
        mh.add_cylinder(
            col, f"{prefix}_RidgeRoll",
            (cx, cy, z_ridge + 0.22),
            0.16, 0.16, ridge_hw * 2.0 + 0.35, 10,
            mats["thatch"],
            rot_xyz=(0.0, math.pi * 0.5, 0.0),
        )

    # Clipped underside timber rafters strictly beneath the thatch shell
    n_r = max(4, int((hw * 2.0) / 0.85))
    for i in range(n_r):
        rx = cx - hw + 0.50 + (i / max(1, n_r - 1)) * (hw * 2.0 - 1.0)
        dx_c = abs(rx - cx)
        frac = 1.0 if dx_c <= ridge_hw else max(0.0, (hw - dx_c) / max(0.01, hw - ridge_hw))
        if frac < 0.22:
            continue
        for sy, tag in ((-1, "B"), (1, "F")):
            p0 = Vector((rx, cy + sy * (hd - 0.10), z_eave - 0.13))
            p1 = Vector((rx, cy + sy * (hd * (1.0 - frac)), z_eave + (z_ridge - z_eave) * frac - 0.15))
            vec = p1 - p0
            if vec.length < 0.35:
                continue
            rot = vec.normalized().to_track_quat("Y", "Z").to_euler()
            mh.add_box(col, f"{prefix}_Rafter_{i}_{tag}", (p0 + p1) * 0.5, (0.065, vec.length, 0.08), mats["teak"], rot_xyz=rot)


def build_farmer_chala(mats):
    col = mh.reset_collection("farmer_chala")

    W, D = 6.8, 5.4
    hw, hd = W * 0.5, D * 0.5
    plinth_h = 0.44

    # Raised Laterite Brick Plinth & Earth Verandah
    mh.add_box(col, "ChalaPlinth", (0.0, 0.0, plinth_h * 0.5), (W + 0.35, D + 0.35, plinth_h), mats["laterite"], bevel=0.02)
    mh.add_box(col, "ChalaStep", (0.0, hd + 0.32, 0.12), (1.55, 0.38, 0.24), mats["laterite"], bevel=0.015)

    # Lower Exposed Laterite Brick Base (0.85m) + Hand-Packed Mud/Cob (Cheli) Upper Walls (1.45m)
    wall_h = 2.30
    brick_h = 0.85
    mud_h = wall_h - brick_h
    body_w = W - 0.90
    body_d = D - 1.55
    body_cy = -0.48
    b_hw = body_w * 0.5
    b_front_y = body_cy + body_d * 0.5

    mh.add_box(col, "ChalaWallBrick", (0.0, body_cy, plinth_h + brick_h * 0.5), (body_w, body_d, brick_h), mats["laterite"])
    mh.add_box(col, "ChalaWallMud",   (0.0, body_cy, plinth_h + brick_h + mud_h * 0.5), (body_w - 0.04, body_d - 0.04, mud_h), mats["mud"])

    # Corner Timber Posts & Front Verandah Posts
    for sx in (-1, 1):
        for sy in (-1, 1):
            mh.add_cylinder(
                col, f"ChalaCornerPost_{sx}_{sy}",
                (sx * (b_hw + 0.02), body_cy + sy * (body_d * 0.5 + 0.02), plinth_h + wall_h * 0.5),
                0.085, 0.075, wall_h, 10, mats["teak"],
            )
    front_py = hd - 0.24
    for px in (-hw + 0.26, -0.95, 0.95, hw - 0.26):
        mh.add_cylinder(col, f"ChalaVerPost_{px:.1f}", (px, front_py, plinth_h + wall_h * 0.5), 0.08, 0.07, wall_h, 10, mats["teak"])

    # Low Mud-Plastered Front Thinna Seating Ledges flanking entrance
    for sx, tag in ((-1, "L"), (1, "R")):
        mh.add_box(col, f"ChalaThinna_{tag}", (sx * 2.05, front_py - 0.28, plinth_h + 0.24), (2.05, 0.62, 0.46), mats["laterite"], bevel=0.015)

    # Rustic Plank Doorway & Barred Wooden Windows
    door_z = plinth_h + 0.96
    mh.add_box(col, "ChalaDoorFrame", (0.0, b_front_y + 0.08, door_z), (1.16, 0.20, 1.92), mats["teak"], bevel=0.012)
    mh.add_box(col, "ChalaDoorPlank", (0.0, b_front_y + 0.11, door_z - 0.02), (1.00, 0.08, 1.80), mats["teak_planks"])

    win_z = plinth_h + 1.32
    for wx in (-1.75, 1.75):
        mh.add_kerala_window(col, f"ChalaWinF_{wx:.1f}", (wx, b_front_y + 0.08, win_z), "Y", mats, w=0.72, h=0.78)
    mh.add_kerala_window(col, "ChalaWinL", (-b_hw - 0.08, body_cy, win_z), "X", mats, w=0.70, h=0.76)
    mh.add_kerala_window(col, "ChalaWinR", ( b_hw + 0.08, body_cy, win_z), "X", mats, w=0.70, h=0.76)

    # Wall-Plate Timber Beams
    beam_z = plinth_h + wall_h + 0.06
    mh.add_box(col, "ChalaBeamF", (0.0, front_py, beam_z), (W, 0.16, 0.15), mats["teak"])
    mh.add_box(col, "ChalaBeamB", (0.0, -hd + 0.24, beam_z), (W, 0.16, 0.15), mats["teak"])

    # Steep Overhanging Coconut-Palm Ola Thatch Roof
    add_thatch_hipped_roof(
        col, "ChalaThatch",
        cx=0.0, cy=0.0,
        z_eave=plinth_h + wall_h - 0.22,
        z_ridge=plinth_h + wall_h + 2.05,
        hw=hw + 0.95, hd=hd + 0.95,
        ridge_hw=hw - 1.05,
        mats=mats,
    )

    mh.export_collection_glb(col, "farmer_chala")


def build_laborer_kudil(mats):
    col = mh.reset_collection("laborer_kudil")

    W, D = 5.2, 4.4
    hw, hd = W * 0.5, D * 0.5
    plinth_h = 0.34

    # Raised Earth/Laterite Plinth
    mh.add_box(col, "KudilPlinth", (0.0, 0.0, plinth_h * 0.5), (W + 0.30, D + 0.30, plinth_h), mats["laterite"], bevel=0.02)

    # Hand-Packed Cob/Mud (Cheli) Walls + Timber Framing
    wall_h = 2.02
    body_w = W - 0.70
    body_d = D - 1.25
    body_cy = -0.38
    b_front_y = body_cy + body_d * 0.5

    mh.add_box(col, "KudilWallMud", (0.0, body_cy, plinth_h + wall_h * 0.5), (body_w, body_d, wall_h), mats["mud"])
    mh.add_box(col, "KudilWallBase", (0.0, body_cy, plinth_h + 0.26), (body_w + 0.04, body_d + 0.04, 0.52), mats["laterite"])

    # Front Porch Timber Posts
    front_py = hd - 0.22
    for px in (-hw + 0.22, -0.78, 0.78, hw - 0.22):
        mh.add_cylinder(col, f"KudilPost_{px:.1f}", (px, front_py, plinth_h + wall_h * 0.5), 0.068, 0.06, wall_h, 8, mats["teak"])

    # Plank Door & Small Wooden Window
    door_z = plinth_h + 0.88
    mh.add_box(col, "KudilDoorFrame", (0.0, b_front_y + 0.07, door_z), (1.02, 0.18, 1.74), mats["teak"])
    mh.add_box(col, "KudilDoorPlank", (0.0, b_front_y + 0.10, door_z - 0.02), (0.88, 0.08, 1.62), mats["teak_planks"])
    mh.add_kerala_window(col, "KudilWinR", (1.32, b_front_y + 0.07, plinth_h + 1.18), "Y", mats, w=0.58, h=0.62)

    # Thick Steep Coconut-Palm Ola Thatch Roof
    add_thatch_hipped_roof(
        col, "KudilThatch",
        cx=0.0, cy=0.0,
        z_eave=plinth_h + wall_h - 0.26,
        z_ridge=plinth_h + wall_h + 1.72,
        hw=hw + 0.85, hd=hd + 0.85,
        ridge_hw=hw - 0.85,
        mats=mats,
    )

    mh.export_collection_glb(col, "laborer_kudil")


if __name__ == "__main__":
    mats = kpbr.get_kerala_material_palette(force_rebake=False)
    build_farmer_chala(mats)
    build_laborer_kudil(mats)
    print("Done! Farmer Chala & Laborer Kudil exported with 1K PBR textures.")
