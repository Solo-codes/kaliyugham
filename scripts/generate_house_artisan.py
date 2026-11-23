import bpy
import os
import sys

# ==============================================================================
# KALIYUGHAM — House #3: Traditional Kerala Artisan Veedu (Photorealistic PBR)
# ==============================================================================
# Exports:
#   /Users/vishnuk/Documents/project/game/public/models/houses/artisan_veedu.glb
#
# Architectural Details:
#   - Chiseled granite + red laterite stepped plinth
#   - Exposed coursed red laterite brick (Vettukallu) main walls + carved Malabar
#     teakwood plank upper wall band (Thekku) & corner timber pilasters
#   - Shaded front workshop verandah (Thinna) with red-oxide floor, turned teak
#     pillars with Pothika brackets & a side Charupadi bench
#   - Carved teak doorway & recessed shuttered Azhi windows
#   - Steep terracotta clay Odu (ഓട്) tiled hipped-gable roof with 3D ridge/hip
#     caps, properly clipped underside Kazhukol rafters & Mukhappu gable vents
# ==============================================================================

SCRIPTS_DIR = "/Users/vishnuk/Documents/project/game/scripts"
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import importlib
import kerala_pbr_materials as kpbr
import generate_house_mana as mh
importlib.reload(kpbr)
importlib.reload(mh)


def build_artisan_veedu(mats):
    col = mh.reset_collection("artisan_veedu")

    W, D = 8.4, 6.6
    hw, hd = W * 0.5, D * 0.5
    plinth_h = 0.60

    # 1) Granite + Laterite Plinth & Red-Oxide Verandah Floor
    mh.add_box(col, "ArtPlinthG", (0.0, 0.0, 0.16), (W + 0.55, D + 0.55, 0.32), mats["granite"], bevel=0.02)
    mh.add_box(col, "ArtPlinthL", (0.0, 0.0, 0.45), (W + 0.18, D + 0.18, 0.28), mats["laterite"], bevel=0.015)
    mh.add_box(col, "ArtFloorOx", (0.0, 0.0, plinth_h + 0.02), (W, D, 0.05), mats["oxide"])

    # Front Granite Steps
    for si in range(2):
        mh.add_box(col, f"ArtStep_{si}", (0.0, hd + 0.55 - si * 0.28, 0.14 + si * 0.24), (1.85, 0.32, 0.24), mats["granite"], bevel=0.015)

    # 2) Main House Walls — Exposed Red Laterite Brick lower + Teakwood Planks upper
    wall_h = 2.65
    brick_h = 1.78
    wood_h = wall_h - brick_h
    body_w = W - 1.15
    body_d = D - 1.95
    body_cy = -0.58
    b_hw = body_w * 0.5
    b_front_y = body_cy + body_d * 0.5
    b_back_y = body_cy - body_d * 0.5

    mh.add_box(col, "ArtBodyBrick", (0.0, body_cy, plinth_h + brick_h * 0.5), (body_w, body_d, brick_h), mats["laterite"])
    mh.add_box(col, "ArtBodyWood",  (0.0, body_cy, plinth_h + brick_h + wood_h * 0.5), (body_w - 0.04, body_d - 0.04, wood_h), mats["teak_planks"])
    mh.add_box(col, "ArtBeltTrim",  (0.0, body_cy, plinth_h + brick_h), (body_w + 0.14, body_d + 0.14, 0.10), mats["teak"], bevel=0.012)

    for sx in (-1, 1):
        for sy in (-1, 1):
            mh.add_box(
                col, f"ArtCorner_{sx}_{sy}",
                (sx * (b_hw + 0.02), body_cy + sy * (body_d * 0.5 + 0.02), plinth_h + wall_h * 0.5),
                (0.18, 0.18, wall_h),
                mats["teak"],
                bevel=0.012,
            )

    # 3) Carved Teak Doorway & Recessed Azhi Windows
    door_z = plinth_h + 1.06
    mh.add_box(col, "ArtDoorFrame",  (0.0, b_front_y + 0.09, door_z), (1.32, 0.22, 2.10), mats["teak"], bevel=0.015)
    mh.add_box(col, "ArtDoorLintel", (0.0, b_front_y + 0.14, plinth_h + 2.15), (1.68, 0.28, 0.15), mats["teak"], bevel=0.015)
    mh.add_box(col, "ArtDoorLeafL",  (-0.29, b_front_y + 0.12, door_z - 0.02), (0.56, 0.08, 1.94), mats["teak"], bevel=0.01)
    mh.add_box(col, "ArtDoorLeafR",  ( 0.29, b_front_y + 0.12, door_z - 0.02), (0.56, 0.08, 1.94), mats["teak"], bevel=0.01)

    win_z = plinth_h + 1.42
    for wx in (-2.15, 2.15):
        mh.add_kerala_window(col, f"ArtWinF_{wx:.1f}", (wx, b_front_y + 0.09, win_z), "Y", mats, w=0.86, h=0.98)
        mh.add_kerala_window(col, f"ArtWinB_{wx:.1f}", (wx, b_back_y - 0.09, win_z), "Y", mats, w=0.86, h=0.98)
    mh.add_kerala_window(col, "ArtWinL", (-b_hw - 0.09, body_cy, win_z), "X", mats, w=0.84, h=0.96)
    mh.add_kerala_window(col, "ArtWinR", ( b_hw + 0.09, body_cy, win_z), "X", mats, w=0.84, h=0.96)

    # 4) Front Workshop Verandah Pillars & Charupadi Bench
    pillar_h = 2.65
    front_py = hd - 0.28
    for px in (-hw + 0.30, -1.15, 1.15, hw - 0.30):
        mh.add_kerala_pillar(col, f"ArtFrontP_{px:.1f}", px, front_py, plinth_h, pillar_h, mats)
    mh.add_charupadi_bench(col, "ArtCharuL", -2.55, front_py, plinth_h, 2.25, "X", 1, mats)
    mh.add_charupadi_bench(col, "ArtCharuR",  2.55, front_py, plinth_h, 2.25, "X", 1, mats)

    # Wall-Plate Beams
    beam_z = plinth_h + pillar_h + 0.07
    mh.add_box(col, "ArtBeamF", (0.0, front_py, beam_z), (W, 0.20, 0.18), mats["teak"])
    mh.add_box(col, "ArtBeamB", (0.0, -hd + 0.28, beam_z), (W, 0.20, 0.18), mats["teak"])
    mh.add_box(col, "ArtBeamL", (-hw + 0.30, 0.0, beam_z), (0.20, D, 0.18), mats["teak"])
    mh.add_box(col, "ArtBeamR", ( hw - 0.30, 0.0, beam_z), (0.20, D, 0.18), mats["teak"])

    # 5) Steep Terracotta Clay Odu (ഓട്) Roof with Clipped Underside Kazhukol Rafters
    mh.add_hipped_odu_roof(
        col, "ArtMainRoof",
        cx=0.0, cy=0.0,
        z_eave=plinth_h + pillar_h - 0.16,
        z_ridge=plinth_h + pillar_h + 2.30,
        hw=hw + 1.05, hd=hd + 1.05,
        ridge_hw=hw - 1.25,
        mats=mats,
        add_rafters=True,
        add_mukhappu=True,
    )

    mh.export_collection_glb(col, "artisan_veedu")


if __name__ == "__main__":
    mats = kpbr.get_kerala_material_palette(force_rebake=False)
    build_artisan_veedu(mats)
    print("Done! Artisan Veedu (artisan_veedu.glb) exported with 1K PBR textures.")
