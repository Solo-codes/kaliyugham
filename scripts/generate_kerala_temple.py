import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# ==============================================================================
# KALIYUGHAM — Authentic 18th-Century Rural Kerala Village Temple (Desa Kshetram)
# ==============================================================================
# Historically grounded in traditional Kerala Dravida / Tantrasamuchaya temple
# architecture (facing +Z in glTF / -Y in Blender so it faces the village & priest):
#   1. Stepped Granite Pradakshinam Courtyard + Coursed Red-Laterite Chuttambalam
#      enclosure wall with sloped terracotta Odu coping & Vilakkumadam lamp-lattice
#   2. Ceremonial Front Entrance Gopuram / Padippura with granite steps, carved
#      teak pillars, Odu tiled roof, Mukhappu gables & twin brass finials
#   3. Central Two-Tiered (Dwithala) Sreekovil Sanctum Sanctorum on a raised
#      granite Adishtanam with Sopanapadi steps, Surul balustrades, carved sanctum
#      doorway, glowing brass Nilavilakku lamps, two-tier steep terracotta Odu
#      pyramidal roof with 3D hip caps, clipped Kazhukol rafters & brass Kalasam
#   4. Open Pillared Namaskara Mandapam directly in front of the Sreekovil steps
#   5. Balikkal offering altar, tall brass-clad Dhwajasthambam (Kodimaram) flagstaff,
#      and multi-tiered brass Deepasthambam lamp pillar at the front entrance
#
# Exports crisp 1K PBR .glb to:
#   /Users/vishnuk/Documents/project/game/public/models/kerala_temple.glb
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


def make_glow_flame_mat():
    nm = "PBR_temple_flame"
    if nm in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[nm])
    mat = bpy.data.materials.new(nm)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (1.0, 0.72, 0.18, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.25
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (1.0, 0.58, 0.12, 1.0)
            bsdf.inputs["Emission Strength"].default_value = 3.2
    return mat


def add_pyramidal_odu_roof(col, prefix, cx, cy, z_eave, z_apex, hw, hd, mats, add_rafters=True, finial_scale=1.25):
    """Authentic Kerala steep 4-sided pyramidal terracotta Odu temple roof with 3D hip caps & brass Kalasam."""
    bm = bmesh.new()
    v_fl = bm.verts.new((cx - hw, cy - hd, z_eave))
    v_fr = bm.verts.new((cx + hw, cy - hd, z_eave))
    v_br = bm.verts.new((cx + hw, cy + hd, z_eave))
    v_bl = bm.verts.new((cx - hw, cy + hd, z_eave))
    v_top = bm.verts.new((cx, cy, z_apex))
    bm.faces.new((v_fl, v_fr, v_top))
    bm.faces.new((v_fr, v_br, v_top))
    bm.faces.new((v_br, v_bl, v_top))
    bm.faces.new((v_bl, v_fl, v_top))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(f"{prefix}_OduPyr")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(f"{prefix}_OduPyr", mesh)
    obj.data.materials.append(mats["odu"])
    sol = obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.16
    sol.offset = 1.0
    mh.link_obj(obj, col)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="Solidify")

    # 4 Sloped 3D Terracotta Hip Cap ridges meeting at the apex
    top_v = Vector((cx, cy, z_apex + 0.14))
    for hi, (sx, sy) in enumerate(((-1, -1), (1, -1), (1, 1), (-1, 1))):
        p0 = Vector((cx + sx * hw, cy + sy * hd, z_eave + 0.14))
        vec = top_v - p0
        rot = vec.normalized().to_track_quat("Z", "Y").to_euler()
        mh.add_cylinder(col, f"{prefix}_Hip_{hi}", (p0 + top_v) * 0.5, 0.10, 0.08, vec.length, 8, mats["odu"], rot_xyz=rot)

    # Perimeter teak eave fascia board (Vala)
    mh.add_box(col, f"{prefix}_FasciaF", (cx, cy - hd + 0.04, z_eave - 0.04), (hw * 2.02, 0.08, 0.14), mats["teak"])
    mh.add_box(col, f"{prefix}_FasciaB", (cx, cy + hd - 0.04, z_eave - 0.04), (hw * 2.02, 0.08, 0.14), mats["teak"])
    mh.add_box(col, f"{prefix}_FasciaL", (cx - hw + 0.04, cy, z_eave - 0.04), (0.08, hd * 2.02, 0.14), mats["teak"])
    mh.add_box(col, f"{prefix}_FasciaR", (cx + hw - 0.04, cy, z_eave - 0.04), (0.08, hd * 2.02, 0.14), mats["teak"])

    # Clipped underside Kazhukol rafters tucked strictly beneath the pyramidal shell
    if add_rafters:
        for side_i in range(4):
            for k in (-1, 0, 1):
                frac = 1.0 - abs(k) * 0.42
                if side_i == 0:  # Front (-Y)
                    p0 = Vector((cx + k * hw * 0.42, cy - hd + 0.08, z_eave - 0.12))
                    p1 = Vector((cx + k * hw * 0.42 * (1 - frac), cy - hd * (1 - frac), z_eave + (z_apex - z_eave) * frac - 0.14))
                elif side_i == 1:  # Back (+Y)
                    p0 = Vector((cx + k * hw * 0.42, cy + hd - 0.08, z_eave - 0.12))
                    p1 = Vector((cx + k * hw * 0.42 * (1 - frac), cy + hd * (1 - frac), z_eave + (z_apex - z_eave) * frac - 0.14))
                elif side_i == 2:  # Left (-X)
                    p0 = Vector((cx - hw + 0.08, cy + k * hd * 0.42, z_eave - 0.12))
                    p1 = Vector((cx - hw * (1 - frac), cy + k * hd * 0.42 * (1 - frac), z_eave + (z_apex - z_eave) * frac - 0.14))
                else:  # Right (+X)
                    p0 = Vector((cx + hw - 0.08, cy + k * hd * 0.42, z_eave - 0.12))
                    p1 = Vector((cx + hw * (1 - frac), cy + k * hd * 0.42 * (1 - frac), z_eave + (z_apex - z_eave) * frac - 0.14))
                vec = p1 - p0
                if vec.length < 0.35:
                    continue
                rot = vec.normalized().to_track_quat("Y", "Z").to_euler()
                mh.add_box(col, f"{prefix}_Raf_{side_i}_{k}", (p0 + p1) * 0.5, (0.065, vec.length, 0.08), mats["teak"], rot_xyz=rot)

    if finial_scale > 0.0:
        mh.add_brass_finial(col, f"{prefix}_Kalasam", cx, cy, z_apex + 0.18, mats, scale=finial_scale)


def add_nilavilakku(col, prefix, x, y, z0, mats, flame_mat, scale=1.0):
    """Traditional Kerala standing brass Nilavilakku oil lamp with warm flame."""
    mh.add_cylinder(col, f"{prefix}_Base", (x, y, z0 + 0.05 * scale), 0.18 * scale, 0.08 * scale, 0.10 * scale, 14, mats["brass"])
    mh.add_cylinder(col, f"{prefix}_Stem", (x, y, z0 + 0.50 * scale), 0.028 * scale, 0.022 * scale, 0.84 * scale, 10, mats["brass"])
    mh.add_cylinder(col, f"{prefix}_Bowl", (x, y, z0 + 0.94 * scale), 0.055 * scale, 0.145 * scale, 0.09 * scale, 14, mats["brass"])
    mh.add_cylinder(col, f"{prefix}_Top",  (x, y, z0 + 1.09 * scale), 0.032 * scale, 0.008 * scale, 0.22 * scale, 10, mats["brass"])
    mh.add_sphere(col, f"{prefix}_Flame",  (x, y - 0.09 * scale, z0 + 1.01 * scale), 0.024 * scale, (0.8, 0.8, 1.6), flame_mat, 8, 6)


def build_kerala_temple(mats):
    col = mh.reset_collection("kerala_temple")
    flame_mat = make_glow_flame_mat()

    # Note on orientation:
    # Blender -Y maps to glTF +Z (front of temple facing the village & priest at [45, 20.6]).
    CW, CD = 13.6, 13.6
    hcw, hcd = CW * 0.5, CD * 0.5

    # --------------------------------------------------------------------------
    # 1. Stepped Chiseled Granite Courtyard Platform (Pradakshinam)
    # --------------------------------------------------------------------------
    mh.add_box(col, "TempleBaseOuter", (0.0, 0.0, 0.10), (CW + 0.7, CD + 0.7, 0.20), mats["granite"], bevel=0.02)
    mh.add_box(col, "TempleYardFloor", (0.0, 0.0, 0.22), (CW, CD, 0.08), mats["granite"])

    # --------------------------------------------------------------------------
    # 2. Chuttambalam / Kshetra Madil (Coursed Red-Laterite Enclosure Wall +
    #    Terracotta Odu Coping + Traditional Wooden Vilakkumadam Lamp Lattice)
    # --------------------------------------------------------------------------
    wall_h = 1.68
    wall_t = 0.44
    wall_z = 0.24 + wall_h * 0.5

    # Back (+Y), Left (-X), Right (+X) walls
    mh.add_box(col, "MadilBack",  (0.0,  hcd - 0.22, wall_z), (CW, wall_t, wall_h), mats["laterite"])
    mh.add_box(col, "MadilLeft",  (-hcw + 0.22, 0.0, wall_z), (wall_t, CD, wall_h), mats["laterite"])
    mh.add_box(col, "MadilRight", ( hcw - 0.22, 0.0, wall_z), (wall_t, CD, wall_h), mats["laterite"])

    # Front (-Y) enclosure walls flanking the 3.4m wide central Gopuram entrance
    f_seg = (CW - 3.4) * 0.5
    for sx, tag in ((-1, "L"), (1, "R")):
        cx = sx * (1.7 + f_seg * 0.5)
        mh.add_box(col, f"MadilFront_{tag}", (cx, -hcd + 0.22, wall_z), (f_seg, wall_t, wall_h), mats["laterite"])
        # Traditional Kerala Vilakkumadam wooden lamp-lattice panel mounted on the front facade!
        mh.add_box(col, f"VilakkuPanel_{tag}", (cx, -hcd - 0.04, 1.18), (f_seg - 0.45, 0.10, 1.05), mats["teak_planks"])
        # Horizontal rows of tiny brass temple oil lamps (Chuttuvilakku) along the Vilakkumadam
        for row_i, lz in enumerate((0.88, 1.18, 1.48)):
            for col_i in range(5):
                lx = cx - (f_seg * 0.36) + (col_i / 4.0) * (f_seg * 0.72)
                mh.add_sphere(col, f"ChuttuLamp_{tag}_{row_i}_{col_i}", (lx, -hcd - 0.11, lz), 0.032, (1.1, 0.7, 0.8), mats["brass"], 8, 6)

    # Sloped terracotta Odu wall coping along the top of the perimeter enclosure walls
    mh.add_hipped_odu_roof(col, "CopingBack",  0.0,  hcd - 0.22, 1.90, 2.24, hcw + 0.15, 0.46, hcw - 0.20, mats, add_rafters=False, add_mukhappu=False)
    for sx, tag in ((-1, "L"), (1, "R")):
        cx = sx * (1.7 + f_seg * 0.5)
        mh.add_hipped_odu_roof(col, f"CopingFront_{tag}", cx, -hcd + 0.22, 1.90, 2.24, f_seg * 0.5 + 0.10, 0.46, f_seg * 0.5 - 0.22, mats, add_rafters=False, add_mukhappu=False)
    for sx, tag in ((-1, "L"), (1, "R")):
        mh.add_box(col, f"CopingSideOdu_{tag}", (sx * (hcw - 0.22), 0.0, 2.02), (0.78, CD + 0.1, 0.22), mats["odu"], bevel=0.04)

    # --------------------------------------------------------------------------
    # 3. Front Entrance Gopuram / Padippura Gatehouse (at -Y front entrance)
    # --------------------------------------------------------------------------
    gy = -hcd + 0.22
    for sx, tag in ((-1, "L"), (1, "R")):
        mh.add_kerala_pillar(col, f"GopuramPillar_{tag}", sx * 1.62, gy, 0.24, 2.95, mats)
        mh.add_box(col, f"GopuramSideBench_{tag}", (sx * 1.48, gy, 0.58), (0.65, 1.65, 0.68), mats["granite"], bevel=0.02)
    mh.add_box(col, "GopuramLintel", (0.0, gy, 3.24), (4.6, 1.55, 0.26), mats["teak"], bevel=0.02)
    mh.add_box(col, "GopuramUpperTrim", (0.0, gy, 3.55), (4.2, 1.35, 0.42), mats["teak_planks"])
    mh.add_hipped_odu_roof(
        col, "GopuramRoof",
        cx=0.0, cy=gy,
        z_eave=3.58, z_ridge=5.15,
        hw=2.85, hd=1.45,
        ridge_hw=1.45,
        mats=mats,
        add_rafters=True,
        add_mukhappu=True,
    )
    # Front granite entrance steps outside the Gopuram
    for si in range(2):
        mh.add_box(col, f"GopStep_{si}", (0.0, -hcd - 0.52 + si * 0.28, 0.08 + si * 0.10), (3.1, 0.34, 0.16), mats["granite"], bevel=0.015)

    # --------------------------------------------------------------------------
    # 4. Central Two-Tiered (Dwithala) Sreekovil Sanctum Sanctorum
    #    Positioned slightly toward the rear (+Y = +1.4) leaving room for the
    #    Namaskara Mandapam and front Pradakshinam walkway!
    # --------------------------------------------------------------------------
    sy0 = 1.45
    sw, sd = 4.6, 4.6
    s_plinth_h = 0.88

    # Stepped Chiseled Granite Adishtanam Plinth with molded cornice
    mh.add_box(col, "SreekovilPlinthLow", (0.0, sy0, 0.24 + 0.24), (sw + 0.65, sd + 0.65, 0.48), mats["granite"], bevel=0.025)
    mh.add_box(col, "SreekovilPlinthHi",  (0.0, sy0, 0.24 + 0.66), (sw + 0.25, sd + 0.25, 0.38), mats["laterite"], bevel=0.02)
    mh.add_box(col, "SreekovilPlinthCap", (0.0, sy0, 0.24 + s_plinth_h), (sw + 0.42, sd + 0.42, 0.08), mats["granite"], bevel=0.015)

    # Sopanapadi (3 Ceremonial Granite Sanctum Steps + Carved Surul Balustrades facing -Y)
    for si in range(3):
        mh.add_box(
            col, f"SopanaStep_{si}",
            (0.0, sy0 - sd * 0.5 - 0.82 + si * 0.26, 0.24 + 0.14 + si * 0.24),
            (1.65, 0.30, 0.22),
            mats["granite"],
            bevel=0.015,
        )
    for sx, tag in ((-1, "L"), (1, "R")):
        mh.add_box(col, f"SurulBal_{tag}", (sx * 0.96, sy0 - sd * 0.5 - 0.50, 0.24 + 0.52), (0.24, 1.02, 0.88), mats["granite"], bevel=0.02)
        mh.add_sphere(col, f"SurulVolute_{tag}", (sx * 0.96, sy0 - sd * 0.5 - 0.98, 0.24 + 0.34), 0.14, (0.9, 1.1, 1.1), mats["granite"], 10, 8)

    # Sreekovil Main Chamber Walls (Coursed Laterite Brick + Carved Teak Upper Frieze)
    s_wall_h = 2.55
    s_z0 = 0.24 + s_plinth_h
    mh.add_box(col, "SreekovilWallBrick", (0.0, sy0, s_z0 + 0.95), (sw - 0.15, sd - 0.15, 1.90), mats["laterite"])
    mh.add_box(col, "SreekovilWallWood",  (0.0, sy0, s_z0 + 2.22), (sw - 0.10, sd - 0.10, 0.66), mats["teak_planks"])
    mh.add_box(col, "SreekovilCornice",   (0.0, sy0, s_z0 + 1.90), (sw + 0.18, sd + 0.18, 0.12), mats["teak"], bevel=0.015)

    # Ornate Carved Sanctum Doorway (Garbhagriha Entrance facing -Y) with Brass Frame & Dwarapalaka Pilasters
    d_y = sy0 - (sd - 0.15) * 0.5 - 0.08
    mh.add_box(col, "SanctumDoorFrame",  (0.0, d_y, s_z0 + 1.05), (1.42, 0.24, 2.08), mats["teak"], bevel=0.018)
    mh.add_box(col, "SanctumDoorBrass",  (0.0, d_y - 0.08, s_z0 + 1.05), (1.22, 0.12, 1.92), mats["brass"])
    mh.add_box(col, "SanctumDoorRecess", (0.0, d_y - 0.11, s_z0 + 1.00), (0.96, 0.08, 1.78), mats["teak"])
    mh.add_box(col, "SanctumDoorLintel", (0.0, d_y - 0.06, s_z0 + 2.16), (1.88, 0.34, 0.20), mats["brass"], bevel=0.015)

    # Twin Standing Brass Nilavilakku Lamps flanking the Sopanapadi steps
    add_nilavilakku(col, "SanctumLampL", -1.48, sy0 - sd * 0.5 - 0.85, 0.26, mats, flame_mat, scale=1.05)
    add_nilavilakku(col, "SanctumLampR",  1.48, sy0 - sd * 0.5 - 0.85, 0.26, mats, flame_mat, scale=1.05)

    # Tier 1 Broad Steep Pyramidal Terracotta Odu Roof of the Sreekovil
    r1_eave = s_z0 + s_wall_h - 0.18
    r1_top = r1_eave + 1.85
    add_pyramidal_odu_roof(col, "SreekovilRoofTier1", 0.0, sy0, r1_eave, r1_top, sw * 0.5 + 1.15, sd * 0.5 + 1.15, mats, add_rafters=True, finial_scale=0.0)

    # Upper Tier (Griva neck + carved teak louver clerestory + Tier 2 steep Odu roof + tall Brass Kalasam!)
    g_z0 = r1_eave + 1.15
    g_h = 0.92
    mh.add_box(col, "SreekovilGriva", (0.0, sy0, g_z0 + g_h * 0.5), (2.45, 2.45, g_h), mats["teak_planks"], bevel=0.015)
    mh.add_box(col, "SreekovilGrivaTrim", (0.0, sy0, g_z0 + g_h), (2.65, 2.65, 0.12), mats["brass"], bevel=0.012)
    add_pyramidal_odu_roof(col, "SreekovilRoofTier2", 0.0, sy0, g_z0 + g_h - 0.05, g_z0 + g_h + 1.95, 1.95, 1.95, mats, add_rafters=True, finial_scale=1.65)

    # --------------------------------------------------------------------------
    # 5. Namaskara Mandapam (Open Square Pillared Pavilion in front of Sreekovil)
    # --------------------------------------------------------------------------
    my0 = -3.15
    mw, md = 2.85, 2.85
    mh.add_box(col, "MandapamPlinth", (0.0, my0, 0.24 + 0.24), (mw, md, 0.48), mats["granite"], bevel=0.02)
    mh.add_box(col, "MandapamFloor",  (0.0, my0, 0.24 + 0.49), (mw - 0.20, md - 0.20, 0.05), mats["oxide"])
    m_z0 = 0.24 + 0.48
    m_ph = 2.25
    for sx in (-1, 1):
        for sy in (-1, 1):
            mh.add_kerala_pillar(col, f"MandapamP_{sx}_{sy}", sx * (mw * 0.5 - 0.28), my0 + sy * (md * 0.5 - 0.28), m_z0, m_ph, mats)
    mh.add_box(col, "MandapamBeamRing", (0.0, my0, m_z0 + m_ph + 0.06), (mw - 0.2, md - 0.2, 0.18), mats["teak"])
    add_pyramidal_odu_roof(col, "MandapamRoof", 0.0, my0, m_z0 + m_ph - 0.10, m_z0 + m_ph + 1.55, mw * 0.5 + 0.72, md * 0.5 + 0.72, mats, add_rafters=True, finial_scale=0.95)

    # --------------------------------------------------------------------------
    # 6. Balikkal Altar, Tall Brass Dhwajasthambam (Kodimaram) & Deepasthambam
    # --------------------------------------------------------------------------
    # Carved granite Balikkal altar stone just inside the front entrance
    by0 = -5.15
    mh.add_box(col, "BalikkalBase", (0.0, by0, 0.24 + 0.18), (0.86, 0.86, 0.36), mats["granite"], bevel=0.02)
    mh.add_cylinder(col, "BalikkalLotus", (0.0, by0, 0.24 + 0.48), 0.28, 0.34, 0.24, 12, mats["granite"])
    mh.add_sphere(col, "BalikkalTop", (0.0, by0, 0.24 + 0.64), 0.24, (1.0, 1.0, 0.45), mats["granite"], 12, 8)

    # Tall Brass-Clad Dhwajasthambam (Kodimaram Flagstaff) outside front entrance (-Y = -8.4)
    fy0 = -8.35
    mh.add_box(col, "DhwajaBaseLow", (0.0, fy0, 0.24), (1.35, 1.35, 0.48), mats["granite"], bevel=0.02)
    mh.add_box(col, "DhwajaBaseMid", (0.0, fy0, 0.66), (0.95, 0.95, 0.38), mats["laterite"], bevel=0.018)
    mh.add_cylinder(col, "DhwajaMast", (0.0, fy0, 0.85 + 2.85), 0.145, 0.095, 5.70, 14, mats["brass"])
    # Decorative brass collar rings along the Kodimaram mast
    for rz in (1.5, 2.5, 3.5, 4.5, 5.5, 6.2):
        mh.add_cylinder(col, f"DhwajaRing_{rz:.1f}", (0.0, fy0, rz), 0.155, 0.155, 0.06, 14, mats["brass"])
    mh.add_box(col, "DhwajaTopPedestal", (0.0, fy0, 6.62), (0.42, 0.42, 0.16), mats["brass"], bevel=0.015)
    mh.add_brass_finial(col, "DhwajaFinial", 0.0, fy0, 6.72, mats, scale=0.85)

    # Multi-Tiered Brass Deepasthambam (Temple Lamp Pillar) beside the front entrance
    dx0, dy0 = 2.65, -7.85
    mh.add_box(col, "DeepaBase", (dx0, dy0, 0.20), (0.76, 0.76, 0.40), mats["granite"], bevel=0.018)
    mh.add_cylinder(col, "DeepaShaft", (dx0, dy0, 0.40 + 1.15), 0.085, 0.055, 2.30, 12, mats["brass"])
    for tier_i, (tz, tr) in enumerate(((1.25, 0.34), (1.68, 0.28), (2.08, 0.22), (2.45, 0.16))):
        mh.add_cylinder(col, f"DeepaDish_{tier_i}", (dx0, dy0, tz), tr * 0.45, tr, 0.08, 14, mats["brass"])
        mh.add_sphere(col, f"DeepaFlame_{tier_i}", (dx0, dy0 - tr * 0.72, tz + 0.08), 0.025, (0.8, 0.8, 1.5), flame_mat, 8, 6)
    mh.add_brass_finial(col, "DeepaTop", dx0, dy0, 2.68, mats, scale=0.55)

    # Apply world-space real-meter UVs, join cleanly, and export to public/models/kerala_temple.glb
    os.makedirs(EXPORT_DIR, exist_ok=True)
    objs = [o for o in col.objects if o.type == "MESH"]
    for o in objs:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        mat_name = o.data.materials[0].name if o.data.materials else ""
        if "odu" in mat_name:
            tile_m = 1.55
        elif "laterite" in mat_name or "granite" in mat_name:
            tile_m = 1.75
        elif "teak_planks" in mat_name:
            tile_m = 1.65
        else:
            tile_m = 1.8
        kpbr.apply_world_box_uvs(o, tile_meters=tile_m)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = "kerala_temple"

    bbox = [merged.matrix_world @ Vector(c) for c in merged.bound_box]
    merged.location.z -= min(v.z for v in bbox)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    out_path = os.path.join(EXPORT_DIR, "kerala_temple.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_morph=False,
        export_animations=False,
    )
    print("Exported authentic 18th-century Kerala Village Temple (1K PBR):", out_path)


if __name__ == "__main__":
    mats = kpbr.get_kerala_material_palette(force_rebake=False)
    build_kerala_temple(mats)
