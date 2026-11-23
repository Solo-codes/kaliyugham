import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# ==============================================================================
# KALIYUGHAM — House #2: Middle-Class Nair Tharavadu (Ekasala) — Photorealistic PBR
# ==============================================================================
# Exports:
#   /Users/vishnuk/Documents/project/game/public/models/houses/tharavadu_ekasala.glb
#
# Architectural Details:
#   - Chiseled Kerala granite (Karinkallu) + red laterite stepped plinth
#   - Exposed coursed red laterite brick (Vettukallu) main walls + carved Malabar
#     teakwood plank upper wall frieze (Thekku Ara) & corner timber framing
#   - Full front verandah (Kollayi) with polished red-oxide floor, lathe-turned
#     teak pillars with Pothika brackets & angled Charupadi seating benches
#   - Carved double teak main door (Vathil) with brass Manichitrathazhu rosette
#     + recessed shuttered Azhi windows with vertical wooden bars
#   - Steep terracotta clay Odu (ഓട്) tiled hipped-gable roof with 3D ridge &
#     hip cap tiles, exposed Kazhukol rafters, Mukhappu gable vents & brass finials
# ==============================================================================

SCRIPTS_DIR = "/Users/vishnuk/Documents/project/game/scripts"
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import importlib
import kerala_pbr_materials as kpbr
import generate_house_mana as mana_helpers
importlib.reload(kpbr)
importlib.reload(mana_helpers)

add_box = mana_helpers.add_box
add_sphere = mana_helpers.add_sphere
add_kerala_pillar = mana_helpers.add_kerala_pillar
add_charupadi_bench = mana_helpers.add_charupadi_bench
add_kerala_window = mana_helpers.add_kerala_window
add_hipped_odu_roof = mana_helpers.add_hipped_odu_roof
reset_collection = mana_helpers.reset_collection
export_collection_glb = mana_helpers.export_collection_glb


def build_tharavadu_ekasala(mats):
    col = reset_collection("tharavadu_ekasala")

    W, D = 10.6, 8.2
    hw, hd = W * 0.5, D * 0.5
    plinth_h = 0.74

    # 1) Stepped Chiseled Granite + Red Laterite Adishtanam Plinth
    add_box(col, "TharPlinthG", (0.0, 0.0, 0.20), (W + 0.65, D + 0.65, 0.40), mats["granite"], bevel=0.025)
    add_box(col, "TharPlinthL", (0.0, 0.0, 0.56), (W + 0.22, D + 0.22, 0.34), mats["laterite"], bevel=0.02)
    add_box(col, "TharFloorOxide", (0.0, 0.0, plinth_h + 0.02), (W, D, 0.06), mats["oxide"])

    # Front Ceremonial Granite Steps (Chavittupadi) with Laterite Side Curbs
    for si in range(3):
        add_box(
            col, f"TharStep_{si}",
            (0.0, hd + 0.85 - si * 0.28, 0.12 + si * 0.22),
            (2.2, 0.32, 0.22),
            mats["granite"],
            bevel=0.015,
        )
    for sx, tag in ((-1, "L"), (1, "R")):
        add_box(col, f"TharStepCurb_{tag}", (sx * 1.24, hd + 0.54, 0.40), (0.24, 1.05, 0.72), mats["laterite"], bevel=0.018)

    # 2) Main House Walls — Exposed Red Laterite Brick (lower 2.0m) + Teakwood Plank Wall (upper 0.95m)
    #    Recessed 1.65m behind front verandah edge for a spacious shaded front Kollayi
    wall_h = 2.95
    brick_h = 1.95
    wood_h = wall_h - brick_h
    brick_z = plinth_h + brick_h * 0.5
    wood_z = plinth_h + brick_h + wood_h * 0.5

    body_w = W - 1.55
    body_d = D - 2.35
    body_cy = -0.65
    b_hw = body_w * 0.5
    b_front_y = body_cy + body_d * 0.5
    b_back_y = body_cy - body_d * 0.5

    # Exposed Coursed Laterite Brick Core + Malabar Teak Plank Upper Band + Teak Belt Molding
    add_box(col, "TharBodyBrick", (0.0, body_cy, brick_z), (body_w, body_d, brick_h), mats["laterite"])
    add_box(col, "TharBodyWood",  (0.0, body_cy, wood_z),  (body_w - 0.04, body_d - 0.04, wood_h), mats["teak_planks"])
    add_box(col, "TharBeltTrim",  (0.0, body_cy, plinth_h + brick_h), (body_w + 0.16, body_d + 0.16, 0.12), mats["teak"], bevel=0.015)

    # Corner vertical teak timber pilasters framing the brick masonry
    for sx in (-1, 1):
        for sy in (-1, 1):
            add_box(
                col, f"TharCornerPost_{sx}_{sy}",
                (sx * (b_hw + 0.02), body_cy + sy * (body_d * 0.5 + 0.02), plinth_h + wall_h * 0.5),
                (0.22, 0.22, wall_h),
                mats["teak"],
                bevel=0.015,
            )

    # 3) Carved Double Teak Entrance Doorway (Vathil) + Recessed Azhi Windows
    door_z = plinth_h + 1.15
    add_box(col, "TharDoorFrame",  (0.0, b_front_y + 0.10, door_z), (1.52, 0.24, 2.28), mats["teak"], bevel=0.018)
    add_box(col, "TharDoorLintel", (0.0, b_front_y + 0.16, plinth_h + 2.34), (1.92, 0.30, 0.18), mats["teak"], bevel=0.018)
    add_box(col, "TharDoorLeafL",  (-0.34, b_front_y + 0.14, door_z - 0.03), (0.64, 0.09, 2.08), mats["teak"], bevel=0.01)
    add_box(col, "TharDoorLeafR",  ( 0.34, b_front_y + 0.14, door_z - 0.03), (0.64, 0.09, 2.08), mats["teak"], bevel=0.01)
    add_sphere(col, "TharDoorBrass", (0.0, b_front_y + 0.20, door_z + 0.04), 0.09, (1.0, 0.35, 1.0), mats["brass"])

    win_z = plinth_h + 1.56
    for wx in (-2.75, 2.75):
        add_kerala_window(col, f"TharWinF_{wx:.1f}", (wx, b_front_y + 0.10, win_z), "Y", mats, w=0.98, h=1.12)
        add_kerala_window(col, f"TharWinB_{wx:.1f}", (wx, b_back_y - 0.10, win_z), "Y", mats, w=0.98, h=1.12)
    for wy in (-1.8, 0.6):
        add_kerala_window(col, f"TharWinL_{wy:.1f}", (-b_hw - 0.10, wy, win_z), "X", mats, w=0.92, h=1.08)
        add_kerala_window(col, f"TharWinR_{wy:.1f}", ( b_hw + 0.10, wy, win_z), "X", mats, w=0.92, h=1.08)

    # 4) Front Shaded Verandah Colonnade + Angled Charupadi Benches
    pillar_h = 2.95
    front_py = hd - 0.32
    for px in (-hw + 0.35, -2.55, -1.15, 1.15, 2.55, hw - 0.35):
        add_kerala_pillar(col, f"TharFrontP_{px:.1f}", px, front_py, plinth_h, pillar_h, mats)
    # Side verandah pillars
    for py in (-1.2, 1.4):
        add_kerala_pillar(col, f"TharLeftP_{py:.1f}",  -hw + 0.35, py, plinth_h, pillar_h, mats)
        add_kerala_pillar(col, f"TharRightP_{py:.1f}",  hw - 0.35, py, plinth_h, pillar_h, mats)

    # Angled Charupadi verandah benches flanking the front entry steps
    add_charupadi_bench(col, "TharCharuL", -3.45, front_py, plinth_h, 2.65, "X", 1, mats)
    add_charupadi_bench(col, "TharCharuR",  3.45, front_py, plinth_h, 2.65, "X", 1, mats)

    # Perimeter Teak Wall-Plate Beams (Uttaram)
    beam_z = plinth_h + pillar_h + 0.08
    add_box(col, "TharBeamF", (0.0, front_py, beam_z), (W, 0.22, 0.20), mats["teak"])
    add_box(col, "TharBeamB", (0.0, -hd + 0.32, beam_z), (W, 0.22, 0.20), mats["teak"])
    add_box(col, "TharBeamL", (-hw + 0.35, 0.0, beam_z), (0.22, D, 0.20), mats["teak"])
    add_box(col, "TharBeamR", ( hw - 0.35, 0.0, beam_z), (0.22, D, 0.20), mats["teak"])

    # 5) Steep Terracotta Clay Odu (ഓട്) Tiled Roof with 3D Ridge/Hip Caps, Exposed Rafters & Mukhappu
    add_hipped_odu_roof(
        col, "TharMainRoof",
        cx=0.0, cy=0.0,
        z_eave=plinth_h + pillar_h - 0.18,
        z_ridge=plinth_h + pillar_h + 2.75,
        hw=hw + 1.25, hd=hd + 1.25,
        ridge_hw=hw - 1.55,
        mats=mats,
        add_rafters=True,
        add_mukhappu=True,
    )

    export_collection_glb(col, "tharavadu_ekasala")


if __name__ == "__main__":
    mats = kpbr.get_kerala_material_palette(force_rebake=False)
    build_tharavadu_ekasala(mats)
    print("Done! Nair Tharavadu (tharavadu_ekasala.glb) exported with 1K PBR brick, teakwood & Odu textures.")
