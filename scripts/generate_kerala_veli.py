import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# ==============================================================================
# KALIYUGHAM — #5: Realistic Kerala Veli (വേലി) Fences, Gates & Courtyard Props
# ==============================================================================
# Exports all 5 crisp 1K PBR compound assets into public/models/houses/:
#   1. veli_kayyala_wall.glb  — Coursed red laterite Kayyala compound wall with
#                               granite base & sloped terracotta Odu tile coping!
#   2. veli_olaveli_fence.glb — Authentic rural Kerala Olaveli (woven coconut-palm
#                               frond fence with dark timber stakes & cross-rails)
#   3. veli_gate_padavetti.glb— Traditional Padavetti compound gateway with laterite
#                               posts, teak crossbar & small pitched Odu rain hood
#   4. prop_thulasithara.glb  — Stepped laterite & granite sacred Thulasithara altar
#   5. prop_kerala_kinar.glb  — Circular coursed red laterite Kinar well with teak
#                               pulley frame & wooden wheel
# ==============================================================================

SCRIPTS_DIR = "/Users/vishnuk/Documents/project/game/scripts"
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import importlib
import kerala_pbr_materials as kpbr
import generate_house_mana as mh
importlib.reload(kpbr)
importlib.reload(mh)


def make_tulsi_mat():
    nm = "PBR_kerala_tulsi_leaves"
    if nm in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[nm])
    mat = bpy.data.materials.new(nm)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.09, 0.27, 0.07, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.84
    return mat


def build_veli_kayyala(mats):
    col = mh.reset_collection("veli_kayyala_wall")
    L = 3.85
    # Granite foundation curb + coursed red laterite wall + angled terracotta Odu coping cap
    mh.add_box(col, "KayyalaBase", (0.0, 0.0, 0.14), (L, 0.48, 0.28), mats["granite"], bevel=0.015)
    mh.add_box(col, "KayyalaWall", (0.0, 0.0, 0.80), (L, 0.40, 1.08), mats["laterite"], bevel=0.015)
    # Corner stone piers at each end
    for sx in (-1, 1):
        mh.add_box(col, f"KayyalaPier_{sx}", (sx * (L * 0.5 - 0.14), 0.0, 0.72), (0.34, 0.50, 1.44), mats["laterite"], bevel=0.015)
        mh.add_box(col, f"KayyalaPierCap_{sx}", (sx * (L * 0.5 - 0.14), 0.0, 1.48), (0.40, 0.56, 0.08), mats["granite"], bevel=0.012)
    # Pitched terracotta Odu coping cap protecting the top of the laterite wall from monsoon rain
    mh.add_hipped_odu_roof(
        col, "KayyalaOduCap",
        cx=0.0, cy=0.0,
        z_eave=1.34, z_ridge=1.56,
        hw=L * 0.5 + 0.06, hd=0.34,
        ridge_hw=L * 0.5 - 0.12,
        mats=mats,
        add_rafters=False,
        add_mukhappu=False,
    )
    mh.export_collection_glb(col, "veli_kayyala_wall")


def build_veli_olaveli(mats):
    col = mh.reset_collection("veli_olaveli_fence")
    L = 3.60
    # Woven dried coconut-palm frond (Ola) fence panel + sturdy dark timber stakes & bamboo cross-rails
    mh.add_box(col, "OlaveliPanel", (0.0, 0.0, 0.68), (L - 0.12, 0.08, 1.24), mats["thatch"])
    # Vertical dark teak/arecanut fence stakes
    for i in range(5):
        px = -L * 0.48 + (i / 4.0) * (L * 0.96)
        mh.add_cylinder(col, f"OlaveliStake_{i}", (px, 0.0, 0.72), 0.052, 0.042, 1.44, 8, mats["teak"])
    # Horizontal clamping rails on both sides of the woven palm panel
    for rz in (0.32, 0.76, 1.18):
        mh.add_box(col, f"OlaveliRailF_{rz:.2f}", (0.0,  0.055, rz), (L, 0.035, 0.055), mats["teak"])
        mh.add_box(col, f"OlaveliRailB_{rz:.2f}", (0.0, -0.055, rz), (L, 0.035, 0.055), mats["teak"])
    mh.export_collection_glb(col, "veli_olaveli_fence")


def build_veli_gate(mats):
    col = mh.reset_collection("veli_gate_padavetti")
    W = 1.95
    # Twin coursed red laterite gate pillars with granite caps
    for sx, tag in ((-1, "L"), (1, "R")):
        px = sx * (W * 0.5)
        mh.add_box(col, f"GateBase_{tag}", (px, 0.0, 0.14), (0.46, 0.46, 0.28), mats["granite"], bevel=0.015)
        mh.add_box(col, f"GatePillar_{tag}", (px, 0.0, 0.88), (0.38, 0.38, 1.24), mats["laterite"], bevel=0.015)
        mh.add_box(col, f"GateCap_{tag}", (px, 0.0, 1.54), (0.44, 0.44, 0.08), mats["granite"], bevel=0.012)
    # Stone threshold step
    mh.add_box(col, "GateStep", (0.0, 0.0, 0.06), (W - 0.15, 0.56, 0.12), mats["granite"], bevel=0.012)
    # Traditional removable wooden gate crossbar (Padavetti) + side ajar half-wicket
    mh.add_cylinder(col, "GateBarLow", (0.0, 0.0, 0.42), 0.032, 0.032, W - 0.2, 8, mats["teak"], rot_xyz=(0.0, math.pi * 0.5, 0.0))
    mh.add_box(col, "GateLintel", (0.0, 0.0, 1.66), (W + 0.52, 0.32, 0.14), mats["teak"], bevel=0.012)
    mh.export_collection_glb(col, "veli_gate_padavetti")


def build_thulasithara(mats):
    col = mh.reset_collection("prop_thulasithara")
    tulsi_mat = make_tulsi_mat()
    # Stepped sacred Kerala Thulasithara altar in granite + red laterite + carved cornice
    mh.add_box(col, "ThulasiBase",   (0.0, 0.0, 0.12), (1.12, 1.12, 0.24), mats["granite"], bevel=0.018)
    mh.add_box(col, "ThulasiMid",    (0.0, 0.0, 0.50), (0.86, 0.86, 0.54), mats["laterite"], bevel=0.015)
    mh.add_box(col, "ThulasiCornice",(0.0, 0.0, 0.82), (0.98, 0.98, 0.10), mats["granite"], bevel=0.015)
    mh.add_box(col, "ThulasiLampNiche", (0.0, 0.45, 0.52), (0.22, 0.10, 0.24), mats["brass"])
    # Lush Tulsi plant clusters on top
    for ox, oy, oz, rad in (
        (0.0, 0.0, 1.05, 0.24),
        (-0.15, 0.12, 0.98, 0.16),
        (0.16, -0.10, 0.99, 0.17),
        (0.04, 0.16, 1.12, 0.14),
    ):
        mh.add_sphere(col, f"TulsiBush_{ox:.2f}_{oy:.2f}", (ox, oy, oz), rad, (1.05, 1.05, 0.92), tulsi_mat, 10, 8)
    mh.export_collection_glb(col, "prop_thulasithara")


def build_kerala_kinar(mats):
    col = mh.reset_collection("prop_kerala_kinar")
    # Circular coursed red laterite well parapet + granite rim + teak pulley frame
    mh.add_cylinder(col, "KinarBase", (0.0, 0.0, 0.12), 1.05, 1.02, 0.24, 18, mats["granite"])
    mh.add_cylinder(col, "KinarWall", (0.0, 0.0, 0.58), 0.92, 0.90, 0.72, 18, mats["laterite"])
    mh.add_cylinder(col, "KinarRim",  (0.0, 0.0, 0.98), 0.98, 0.98, 0.10, 18, mats["granite"])
    # Twin carved teak pulley posts + crossbeam + wooden pulley wheel
    for sx, tag in ((-1, "L"), (1, "R")):
        mh.add_box(col, f"KinarPost_{tag}", (sx * 0.82, 0.0, 1.56), (0.14, 0.14, 1.28), mats["teak"], bevel=0.012)
    mh.add_box(col, "KinarCrossBeam", (0.0, 0.0, 2.18), (1.96, 0.16, 0.14), mats["teak"], bevel=0.012)
    mh.add_cylinder(col, "KinarPulley", (0.0, 0.0, 2.02), 0.16, 0.16, 0.08, 14, mats["teak"], rot_xyz=(0.0, math.pi * 0.5, 0.0))
    mh.add_cylinder(col, "KinarRope", (0.0, 0.0, 1.48), 0.015, 0.015, 1.05, 8, mats["thatch"])
    mh.export_collection_glb(col, "prop_kerala_kinar")


if __name__ == "__main__":
    mats = kpbr.get_kerala_material_palette(force_rebake=False)
    build_veli_kayyala(mats)
    build_veli_olaveli(mats)
    build_veli_gate(mats)
    build_thulasithara(mats)
    build_kerala_kinar(mats)
    print("Done! All 5 Kerala Veli fences & courtyard props exported with 1K PBR textures.")
