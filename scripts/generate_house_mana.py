import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector

# ==============================================================================
# KALIYUGHAM — House #1: Grand Landlord Mana Complex (Photorealistic PBR)
# ==============================================================================
# Builds & exports all 3 buildings of the aristocratic 18th-century Kerala
# Namboothiri / Jenmi Mana estate with crisp 1K tiling PBR maps (Albedo +
# Normal + Roughness) and authentic architectural relief:
#   1. mana_nalukettu.glb  — Grand Nalukettu Mana with open sunken Nadumuttam
#                            inner courtyard, 2-tier granite+laterite Adishtanam,
#                            grand Poomukham verandah, lathe-turned teak pillars
#                            with Pothika capitals, angled Charupadi benches,
#                            carved Azhi windows, steep terracotta Odu (ഓട്)
#                            roofs with 3D ridge caps, exposed Kazhukol rafters,
#                            carved Mukhappu gables & brass Thazhikakudam finials.
#   2. mana_padippura.glb  — Grand arched/linteled entry gatehouse with ajar
#                            carved teak doors, timber lattice loft & Odu roof.
#   3. mana_pathayapura.glb— Two-storey granary & estate office with cantilevered
#                            teak-slat upper Ara granary & steep Odu roof.
#
# Run this script in Blender's Scripting tab!
# ==============================================================================

SCRIPTS_DIR = "/Users/vishnuk/Documents/project/game/scripts"
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import importlib
import kerala_pbr_materials as kpbr
importlib.reload(kpbr)

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/houses"


def reset_collection(name):
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def link_obj(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def add_box(col, name, center, size, mat, rot_xyz=(0.0, 0.0, 0.0), bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot_xyz
    obj.data.materials.append(mat)
    link_obj(obj, col)
    return obj


def add_cylinder(col, name, center, r1, r2, depth, segs, mat, rot_xyz=(0.0, 0.0, 0.0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r1, radius2=r2, depth=depth)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.rotation_euler = rot_xyz
    obj.data.materials.append(mat)
    link_obj(obj, col)
    return obj


def add_sphere(col, name, center, radius, scale_xyz, mat, u_seg=14, v_seg=10):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u_seg, v_segments=v_seg, radius=radius)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale_xyz[0], v.co.y * scale_xyz[1], v.co.z * scale_xyz[2]))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    obj.data.materials.append(mat)
    link_obj(obj, col)
    return obj


def add_kerala_pillar(col, prefix, x, y, z0, height, mats):
    """Authentic lathe-turned Kerala Mana teak pillar with granite plinth & double Pothika brackets."""
    add_box(col, f"{prefix}_Plinth", (x, y, z0 + 0.14), (0.36, 0.36, 0.28), mats["granite"], bevel=0.02)
    add_box(col, f"{prefix}_BaseSq", (x, y, z0 + 0.42), (0.28, 0.28, 0.28), mats["teak"], bevel=0.015)
    shaft_h = max(0.6, height - 0.86)
    shaft_mid = z0 + 0.56 + shaft_h * 0.5
    add_cylinder(col, f"{prefix}_Shaft", (x, y, shaft_mid), 0.125, 0.105, shaft_h, 14, mats["teak"])
    # Decorative turned rings along the teak shaft
    add_cylinder(col, f"{prefix}_RingLow", (x, y, z0 + 0.62), 0.145, 0.145, 0.06, 14, mats["teak"])
    add_cylinder(col, f"{prefix}_RingHi",  (x, y, z0 + height - 0.34), 0.135, 0.135, 0.06, 14, mats["teak"])
    # Stepped Kerala Pothika bracket capital
    top_z = z0 + height
    add_box(col, f"{prefix}_CapLow", (x, y, top_z - 0.22), (0.42, 0.34, 0.12), mats["teak"], bevel=0.012)
    add_box(col, f"{prefix}_CapHi",  (x, y, top_z - 0.08), (0.68, 0.38, 0.14), mats["teak"], bevel=0.015)


def add_charupadi_bench(col, prefix, x, y, z0, length, axis, facing_sign, mats):
    """Traditional Kerala angled wooden verandah seating railing (Charupadi)."""
    if axis == "X":
        # Seat slab
        add_box(col, f"{prefix}_Seat", (x, y, z0 + 0.42), (length, 0.48, 0.08), mats["teak"], bevel=0.012)
        # Base curb
        add_box(col, f"{prefix}_Base", (x, y, z0 + 0.20), (length - 0.06, 0.38, 0.40), mats["lime"])
        # Outward-leaning carved backrest slats
        n_slats = max(3, int(length / 0.28))
        for i in range(n_slats):
            sx = x - length * 0.46 + (i / max(1, n_slats - 1)) * (length * 0.92)
            add_box(
                col, f"{prefix}_Slat_{i}",
                (sx, y + facing_sign * 0.24, z0 + 0.78),
                (0.065, 0.045, 0.72),
                mats["teak"],
                rot_xyz=(facing_sign * 0.26, 0.0, 0.0),
            )
        add_box(
            col, f"{prefix}_TopRail",
            (x, y + facing_sign * 0.34, z0 + 1.12),
            (length + 0.08, 0.12, 0.08),
            mats["teak"],
            bevel=0.015,
        )
    else:
        add_box(col, f"{prefix}_Seat", (x, y, z0 + 0.42), (0.48, length, 0.08), mats["teak"], bevel=0.012)
        add_box(col, f"{prefix}_Base", (x, y, z0 + 0.20), (0.38, length - 0.06, 0.40), mats["lime"])
        n_slats = max(3, int(length / 0.28))
        for i in range(n_slats):
            sy = y - length * 0.46 + (i / max(1, n_slats - 1)) * (length * 0.92)
            add_box(
                col, f"{prefix}_Slat_{i}",
                (x + facing_sign * 0.24, sy, z0 + 0.78),
                (0.045, 0.065, 0.72),
                mats["teak"],
                rot_xyz=(0.0, -facing_sign * 0.26, 0.0),
            )
        add_box(
            col, f"{prefix}_TopRail",
            (x + facing_sign * 0.34, y, z0 + 1.12),
            (0.12, length + 0.08, 0.08),
            mats["teak"],
            bevel=0.015,
        )


def add_kerala_window(col, prefix, center, axis, mats, w=1.05, h=1.22):
    """Recessed carved teak Kerala window with vertical wooden bars (Azhi) & projecting sill."""
    x, y, z = center
    if axis == "Y":  # Faces +/- Y
        add_box(col, f"{prefix}_Frame", (x, y, z), (w + 0.20, 0.24, h + 0.20), mats["teak"], bevel=0.012)
        add_box(col, f"{prefix}_Recess", (x, y, z), (w - 0.04, 0.10, h - 0.04), mats["granite"])
        add_box(col, f"{prefix}_Sill", (x, y, z - h * 0.5 - 0.10), (w + 0.34, 0.36, 0.10), mats["teak"], bevel=0.012)
        add_box(col, f"{prefix}_Lintel", (x, y, z + h * 0.5 + 0.12), (w + 0.38, 0.32, 0.12), mats["teak"], bevel=0.012)
        for bi in range(-2, 3):
            add_cylinder(col, f"{prefix}_Bar_{bi}", (x + bi * (w * 0.18), y, z), 0.022, 0.022, h - 0.06, 8, mats["teak"])
    else:  # Faces +/- X
        add_box(col, f"{prefix}_Frame", (x, y, z), (0.24, w + 0.20, h + 0.20), mats["teak"], bevel=0.012)
        add_box(col, f"{prefix}_Recess", (x, y, z), (0.10, w - 0.04, h - 0.04), mats["granite"])
        add_box(col, f"{prefix}_Sill", (x, y, z - h * 0.5 - 0.10), (0.36, w + 0.34, 0.10), mats["teak"], bevel=0.012)
        add_box(col, f"{prefix}_Lintel", (x, y, z + h * 0.5 + 0.12), (0.32, w + 0.38, 0.12), mats["teak"], bevel=0.012)
        for bi in range(-2, 3):
            add_cylinder(col, f"{prefix}_Bar_{bi}", (x, y + bi * (w * 0.18), z), 0.022, 0.022, h - 0.06, 8, mats["teak"])


def add_brass_finial(col, prefix, x, y, z, mats, scale=1.0):
    """Traditional Kerala brass Thazhikakudam roof finial."""
    add_cylinder(col, f"{prefix}_Base", (x, y, z + 0.08 * scale), 0.08 * scale, 0.05 * scale, 0.16 * scale, 12, mats["brass"])
    add_sphere(col, f"{prefix}_Bulb", (x, y, z + 0.22 * scale), 0.075 * scale, (1.0, 1.0, 1.3), mats["brass"])
    add_cylinder(col, f"{prefix}_Spire", (x, y, z + 0.42 * scale), 0.028 * scale, 0.005 * scale, 0.28 * scale, 10, mats["brass"])


def add_hipped_odu_roof(col, prefix, cx, cy, z_eave, z_ridge, hw, hd, ridge_hw, mats, add_rafters=True, add_mukhappu=True):
    """
    Steep Kerala terracotta Odu (ഓട്) hipped-gable roof with:
      - Solidified tile shell
      - 3D cylindrical ridge & hip cap tiles (Muri Odu)
      - Exposed underside teak Kazhukol rafters & fascia trim
      - Carved triangular Mukhappu wooden gable vents + brass Thazhikakudam finials
    """
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

    mesh = bpy.data.meshes.new(f"{prefix}_OduShell")
    bm.to_mesh(mesh)
    bm.free()
    roof_obj = bpy.data.objects.new(f"{prefix}_OduShell", mesh)
    roof_obj.data.materials.append(mats["odu"])
    sol = roof_obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.18
    sol.offset = 1.0
    link_obj(roof_obj, col)
    bpy.context.view_layer.objects.active = roof_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")

    # 3D Terracotta Ridge Cap (Muri Odu) along main ridge
    if ridge_hw > 0.05:
        add_cylinder(
            col, f"{prefix}_RidgeCap",
            (cx, cy, z_ridge + 0.17),
            0.14, 0.14, ridge_hw * 2.0 + 0.25, 10,
            mats["odu"],
            rot_xyz=(0.0, math.pi * 0.5, 0.0),
        )

    # 4 Sloped Hip Cap ridges connecting corners to ridge endpoints
    hips = [
        (Vector((cx - hw, cy + hd, z_eave + 0.16)), Vector((cx - ridge_hw, cy, z_ridge + 0.16))),
        (Vector((cx + hw, cy + hd, z_eave + 0.16)), Vector((cx + ridge_hw, cy, z_ridge + 0.16))),
        (Vector((cx - hw, cy - hd, z_eave + 0.16)), Vector((cx - ridge_hw, cy, z_ridge + 0.16))),
        (Vector((cx + hw, cy - hd, z_eave + 0.16)), Vector((cx + ridge_hw, cy, z_ridge + 0.16))),
    ]
    for hi, (p0, p1) in enumerate(hips):
        mid = (p0 + p1) * 0.5
        vec = p1 - p0
        length = vec.length
        q = vec.normalized().to_track_quat("Z", "Y").to_euler()
        add_cylinder(col, f"{prefix}_HipCap_{hi}", mid, 0.11, 0.11, length, 8, mats["odu"], rot_xyz=q)

    # Teak eave fascia board (Vala) framing the perimeter overhang
    add_box(col, f"{prefix}_FasciaF", (cx, cy + hd - 0.04, z_eave - 0.04), (hw * 2.02, 0.08, 0.16), mats["teak"])
    add_box(col, f"{prefix}_FasciaB", (cx, cy - hd + 0.04, z_eave - 0.04), (hw * 2.02, 0.08, 0.16), mats["teak"])
    add_box(col, f"{prefix}_FasciaL", (cx - hw + 0.04, cy, z_eave - 0.04), (0.08, hd * 2.02, 0.16), mats["teak"])
    add_box(col, f"{prefix}_FasciaR", (cx + hw - 0.04, cy, z_eave - 0.04), (0.08, hd * 2.02, 0.16), mats["teak"])

    # Exposed underside teak Kazhukol rafters — mathematically clipped to the ridge/hip line
    # and tucked 0.14m strictly underneath the roof shell so zero rafters ever poke through!
    if add_rafters:
        n_r = max(4, int((hw * 2.0) / 0.85))
        for i in range(n_r):
            rx = cx - hw + 0.55 + (i / max(1, n_r - 1)) * (hw * 2.0 - 1.1)
            dx_c = abs(rx - cx)
            if dx_c <= ridge_hw:
                frac = 1.0
            else:
                frac = max(0.0, (hw - dx_c) / max(0.01, hw - ridge_hw))
            if frac < 0.22:
                continue
            for sy, tag in ((-1, "B"), (1, "F")):
                p0 = Vector((rx, cy + sy * (hd - 0.08), z_eave - 0.13))
                p1 = Vector((rx, cy + sy * (hd * (1.0 - frac)), z_eave + (z_ridge - z_eave) * frac - 0.15))
                vec = p1 - p0
                rlen = vec.length
                if rlen < 0.35:
                    continue
                mid = (p0 + p1) * 0.5
                rot = vec.normalized().to_track_quat("Y", "Z").to_euler()
                add_box(
                    col, f"{prefix}_Rafter_{i}_{tag}",
                    mid,
                    (0.07, rlen, 0.09),
                    mats["teak"],
                    rot_xyz=rot,
                )

    # Carved Mukhappu triangular gable vents & brass finials at ridge ends
    if add_mukhappu and ridge_hw > 0.35:
        for sx, tag in ((-1, "L"), (1, "R")):
            gx = cx + sx * (ridge_hw + 0.10)
            add_box(col, f"{prefix}_Mukhappu_{tag}", (gx, cy, z_ridge - 0.24), (0.16, 0.96, 0.54), mats["teak"], bevel=0.015)
            for li in range(-2, 3):
                add_box(col, f"{prefix}_MukLouver_{tag}_{li}", (gx + sx * 0.06, cy + li * 0.16, z_ridge - 0.24), (0.06, 0.04, 0.42), mats["teak"])
            add_brass_finial(col, f"{prefix}_Finial_{tag}", cx + sx * ridge_hw, cy, z_ridge + 0.24, mats, scale=1.05)


def export_collection_glb(col, asset_name):
    """Applies clean real-world box/slope UVs per object, joins into 1 clean mesh, and exports GLB."""
    os.makedirs(EXPORT_DIR, exist_ok=True)
    objs = [o for o in col.objects if o.type == "MESH"]
    for o in objs:
        # Apply transforms before UV projection so world-space scale is exact
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        # Scale UVs per material type for crisp real-world detail
        mat_name = o.data.materials[0].name if o.data.materials else ""
        if "odu" in mat_name:
            tile_m = 1.65
        elif "laterite" in mat_name or "granite" in mat_name:
            tile_m = 2.1
        elif "teak" in mat_name:
            tile_m = 1.4
        else:
            tile_m = 2.4
        kpbr.apply_world_box_uvs(o, tile_meters=tile_m)

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = asset_name

    # Ground bottom exactly at Z = 0
    bbox = [merged.matrix_world @ Vector(c) for c in merged.bound_box]
    min_z = min(v.z for v in bbox)
    merged.location.z -= min_z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    out_path = os.path.join(EXPORT_DIR, f"{asset_name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_morph=False,
        export_animations=False,
    )
    print(f"Exported photorealistic PBR Mana asset: {out_path}")


# ==============================================================================
# 1. GRAND LANDLORD MANA (NALUKETTU) — mana_nalukettu.glb
# ==============================================================================
def build_mana_nalukettu(mats):
    col = reset_collection("mana_nalukettu")

    W, D = 15.6, 14.4
    hw, hd = W * 0.5, D * 0.5
    plinth_h = 0.96

    # 1) 2-Tier Chiseled Granite + Red Laterite Adishtanam Foundation Plinth
    add_box(col, "PlinthGraniteLow", (0.0, 0.0, 0.24), (W + 0.9, D + 0.9, 0.48), mats["granite"], bevel=0.03)
    add_box(col, "PlinthLateriteHi", (0.0, 0.0, 0.70), (W + 0.35, D + 0.35, 0.46), mats["laterite"], bevel=0.025)
    add_box(col, "PlinthTrimMolding", (0.0, 0.0, 0.95), (W + 0.50, D + 0.50, 0.08), mats["granite"], bevel=0.015)

    # Outer Perimeter Red-Oxide Verandah Floor (leaving sunken central Nadumuttam open!)
    cw, cd = 4.6, 4.2  # Open inner Nadumuttam courtyard
    add_box(col, "FloorFront", (0.0,  (hd + cd * 0.5) * 0.5, plinth_h + 0.02), (W, hd - cd * 0.5, 0.06), mats["oxide"])
    add_box(col, "FloorBack",  (0.0, -(hd + cd * 0.5) * 0.5, plinth_h + 0.02), (W, hd - cd * 0.5, 0.06), mats["oxide"])
    add_box(col, "FloorLeft",  (-(hw + cw * 0.5) * 0.5, 0.0, plinth_h + 0.02), (hw - cw * 0.5, cd, 0.06), mats["oxide"])
    add_box(col, "FloorRight", ( (hw + cw * 0.5) * 0.5, 0.0, plinth_h + 0.02), (hw - cw * 0.5, cd, 0.06), mats["oxide"])
    # Sunken Nadumuttam inner courtyard basin floor (chiseled granite rain drain)
    add_box(col, "NadumuttamBasin", (0.0, 0.0, plinth_h - 0.24), (cw + 0.2, cd + 0.2, 0.14), mats["granite"])

    # 2) Grand Front Poomukham (Protruding Reception Verandah on +Y side)
    pm_w, pm_d = 6.2, 3.2
    pm_y = hd + pm_d * 0.5
    add_box(col, "PoomukhamPlinthG", (0.0, pm_y, 0.24), (pm_w + 0.5, pm_d + 0.5, 0.48), mats["granite"], bevel=0.025)
    add_box(col, "PoomukhamPlinthL", (0.0, pm_y, 0.70), (pm_w + 0.15, pm_d + 0.15, 0.46), mats["laterite"], bevel=0.02)
    add_box(col, "PoomukhamFloor",   (0.0, pm_y, plinth_h + 0.02), (pm_w, pm_d, 0.06), mats["oxide"])

    # Front Ceremonial Granite Steps (Chavittupadi) + Carved Balustrade Side Walls
    for si in range(4):
        step_z = 0.12 + si * 0.23
        step_y = hd + pm_d + 1.05 - si * 0.30
        add_box(col, f"FrontStep_{si}", (0.0, step_y, step_z), (2.7, 0.34, 0.22), mats["granite"], bevel=0.015)
    for sx, tag in ((-1, "L"), (1, "R")):
        add_box(col, f"StepBalustrade_{tag}", (sx * 1.48, hd + pm_d + 0.62, 0.52), (0.28, 1.35, 0.92), mats["laterite"], bevel=0.02)
        add_box(col, f"StepBalCap_{tag}",     (sx * 1.48, hd + pm_d + 0.62, 1.00), (0.34, 1.42, 0.08), mats["granite"], bevel=0.015)

    # Poomukham Pillars & Flanking Angled Charupadi Benches
    pillar_h = 3.25
    for px in (-2.7, -1.35, 1.35, 2.7):
        add_kerala_pillar(col, f"PoomukhamPillar_{px:.1f}", px, hd + pm_d - 0.32, plinth_h, pillar_h, mats)
    add_charupadi_bench(col, "PoomukhamCharuL", -2.02, hd + pm_d - 0.28, plinth_h, 1.18, "X",  1, mats)
    add_charupadi_bench(col, "PoomukhamCharuR",  2.02, hd + pm_d - 0.28, plinth_h, 1.18, "X",  1, mats)
    add_charupadi_bench(col, "PoomukhamSideL",  -pm_w * 0.5 + 0.22, pm_y - 0.1, plinth_h, pm_d - 0.65, "Y", -1, mats)
    add_charupadi_bench(col, "PoomukhamSideR",   pm_w * 0.5 - 0.22, pm_y - 0.1, plinth_h, pm_d - 0.65, "Y",  1, mats)
    add_box(col, "PoomukhamBeamF", (0.0, hd + pm_d - 0.32, plinth_h + pillar_h + 0.08), (pm_w + 0.3, 0.24, 0.22), mats["teak"])

    # 3) Main 4-Wing Nalukettu Walls:
    #    Authentic exposed coursed red laterite brick (Vettukallu) lower/mid walls
    #    + carved Malabar teakwood plank paneling (Thekku Ara) upper wall band
    wall_h = 3.25
    brick_h = 1.95
    wood_h = wall_h - brick_h
    brick_z = plinth_h + brick_h * 0.5
    wood_z = plinth_h + brick_h + wood_h * 0.5
    # Inset main walls 1.35m from outer verandah edge so a full colonnaded corridor wraps around
    ww, wd = W - 2.7, D - 2.7
    whw, whd = ww * 0.5, wd * 0.5

    add_box(col, "WallFrontBrick",  (0.0,  whd, brick_z), (ww, 0.44, brick_h), mats["laterite"])
    add_box(col, "WallFrontWood",   (0.0,  whd, wood_z),  (ww - 0.04, 0.40, wood_h), mats["teak_planks"])
    add_box(col, "WallFrontBelt",   (0.0,  whd + 0.03, plinth_h + brick_h), (ww + 0.14, 0.48, 0.12), mats["teak"], bevel=0.015)

    add_box(col, "WallBackBrick",   (0.0, -whd, brick_z), (ww, 0.44, brick_h), mats["laterite"])
    add_box(col, "WallBackWood",    (0.0, -whd, wood_z),  (ww - 0.04, 0.40, wood_h), mats["teak_planks"])
    add_box(col, "WallBackBelt",    (0.0, -whd - 0.03, plinth_h + brick_h), (ww + 0.14, 0.48, 0.12), mats["teak"], bevel=0.015)

    add_box(col, "WallLeftBrick",   (-whw, 0.0, brick_z), (0.44, wd, brick_h), mats["laterite"])
    add_box(col, "WallLeftWood",    (-whw, 0.0, wood_z),  (0.40, wd - 0.04, wood_h), mats["teak_planks"])
    add_box(col, "WallLeftBelt",    (-whw - 0.03, 0.0, plinth_h + brick_h), (0.48, wd + 0.14, 0.12), mats["teak"], bevel=0.015)

    add_box(col, "WallRightBrick",  ( whw, 0.0, brick_z), (0.44, wd, brick_h), mats["laterite"])
    add_box(col, "WallRightWood",   ( whw, 0.0, wood_z),  (0.40, wd - 0.04, wood_h), mats["teak_planks"])
    add_box(col, "WallRightBelt",   ( whw + 0.03, 0.0, plinth_h + brick_h), (0.48, wd + 0.14, 0.12), mats["teak"], bevel=0.015)

    # Ornate Main Entrance Doorway (Vathil) with Manichitrathazhu Brass Lock Plate
    door_z = plinth_h + 1.24
    add_box(col, "MainDoorFrame",  (0.0, whd + 0.14, door_z), (1.78, 0.28, 2.48), mats["teak"], bevel=0.02)
    add_box(col, "MainDoorLintel", (0.0, whd + 0.22, plinth_h + 2.54), (2.25, 0.34, 0.20), mats["teak"], bevel=0.02)
    add_box(col, "MainDoorLeafL",  (-0.38, whd + 0.18, door_z - 0.04), (0.72, 0.10, 2.26), mats["teak"], bevel=0.01)
    add_box(col, "MainDoorLeafR",  ( 0.38, whd + 0.18, door_z - 0.04), (0.72, 0.10, 2.26), mats["teak"], bevel=0.01)
    # Brass decorative bosses & Manichitrathazhu central lock rosette
    add_sphere(col, "Manichitrathazhu", (0.0, whd + 0.25, door_z + 0.04), 0.11, (1.0, 0.35, 1.0), mats["brass"])
    for sx in (-0.38, 0.38):
        for bz in (door_z - 0.65, door_z + 0.55):
            add_sphere(col, f"DoorBoss_{sx}_{bz:.1f}", (sx, whd + 0.24, bz), 0.045, (1.0, 0.4, 1.0), mats["brass"])

    # Carved Shuttered Azhi Windows across Front, Back, Left & Right facades
    win_z = plinth_h + 1.72
    for wx in (-4.4, -2.2, 2.2, 4.4):
        add_kerala_window(col, f"WinFront_{wx:.1f}", (wx, whd + 0.15, win_z), "Y", mats)
        add_kerala_window(col, f"WinBack_{wx:.1f}",  (wx, -whd - 0.15, win_z), "Y", mats)
    for wy in (-3.6, 0.0, 3.6):
        add_kerala_window(col, f"WinLeft_{wy:.1f}",  (-whw - 0.15, wy, win_z), "X", mats)
        add_kerala_window(col, f"WinRight_{wy:.1f}", ( whw + 0.15, wy, win_z), "X", mats)

    # 4) Perimeter Verandah Colonnade Pillars + Inner Nadumuttam Courtyard Pillars
    for px in (-hw + 0.35, -4.6, -2.3, 2.3, 4.6, hw - 0.35):
        if abs(px) > 2.9:  # Don't overlap Poomukham entry
            add_kerala_pillar(col, f"VerFrontP_{px:.1f}", px, hd - 0.35, plinth_h, pillar_h, mats)
        add_kerala_pillar(col, f"VerBackP_{px:.1f}", px, -hd + 0.35, plinth_h, pillar_h, mats)
    for py in (-4.2, -1.4, 1.4, 4.2):
        add_kerala_pillar(col, f"VerLeftP_{py:.1f}",  -hw + 0.35, py, plinth_h, pillar_h, mats)
        add_kerala_pillar(col, f"VerRightP_{py:.1f}",  hw - 0.35, py, plinth_h, pillar_h, mats)

    # Perimeter Wall-Plate Beams (Uttaram)
    beam_z = plinth_h + pillar_h + 0.08
    add_box(col, "BeamFront", (0.0,  hd - 0.35, beam_z), (W, 0.24, 0.22), mats["teak"])
    add_box(col, "BeamBack",  (0.0, -hd + 0.35, beam_z), (W, 0.24, 0.22), mats["teak"])
    add_box(col, "BeamLeft",  (-hw + 0.35, 0.0, beam_z), (0.24, D, 0.22), mats["teak"])
    add_box(col, "BeamRight", ( hw - 0.35, 0.0, beam_z), (0.24, D, 0.22), mats["teak"])

    # Inner Nadumuttam Courtyard Colonnade (4 corners + mid-pillars)
    for cx_p in (-cw * 0.5, 0.0, cw * 0.5):
        for cy_p in (-cd * 0.5, 0.0, cd * 0.5):
            if cx_p == 0.0 and cy_p == 0.0:
                continue
            add_kerala_pillar(col, f"NaduP_{cx_p:.1f}_{cy_p:.1f}", cx_p, cy_p, plinth_h, pillar_h - 0.25, mats)

    # 5) Upper Second-Storey Timber Attic / Nilavara Clerestory (Malika)
    #    Authentic Kerala full Malabar teakwood plank walls (Thekku) with carved trim
    up_z0 = plinth_h + wall_h + 0.15
    up_h = 2.05
    up_w, up_d = 9.2, 8.2
    add_box(col, "UpperCoreTeakPlanks", (0.0, -0.4, up_z0 + up_h * 0.5), (up_w, up_d, up_h), mats["teak_planks"])
    add_box(col, "UpperTeakBeltLow", (0.0, -0.4, up_z0 + 0.12), (up_w + 0.24, up_d + 0.24, 0.14), mats["teak"], bevel=0.015)
    add_box(col, "UpperTeakBeltHi",  (0.0, -0.4, up_z0 + up_h - 0.12), (up_w + 0.24, up_d + 0.24, 0.14), mats["teak"], bevel=0.015)
    for wx in (-2.6, 0.0, 2.6):
        add_kerala_window(col, f"UpWinF_{wx:.1f}", (wx, -0.4 + up_d * 0.5 + 0.14, up_z0 + up_h * 0.54), "Y", mats, w=0.92, h=0.98)

    # 6) Multi-Tiered Steep Terracotta Odu (ഓട്) Tiled Roofs!
    # Lower sweeping verandah + 4-wing roof (deep monsoon overhangs)
    add_hipped_odu_roof(
        col, "ManaLowerRoof",
        cx=0.0, cy=0.0,
        z_eave=plinth_h + pillar_h - 0.25,
        z_ridge=up_z0 + 1.05,
        hw=hw + 1.45, hd=hd + 1.45,
        ridge_hw=hw - 2.6,
        mats=mats,
        add_rafters=True,
        add_mukhappu=False,
    )
    # Upper steep Malika crown Odu roof with ornate Mukhappu gables & brass finials
    add_hipped_odu_roof(
        col, "ManaUpperRoof",
        cx=0.0, cy=-0.4,
        z_eave=up_z0 + up_h - 0.18,
        z_ridge=up_z0 + up_h + 2.85,
        hw=up_w * 0.5 + 1.55, hd=up_d * 0.5 + 1.55,
        ridge_hw=up_w * 0.5 - 1.35,
        mats=mats,
        add_rafters=True,
        add_mukhappu=True,
    )
    # Protruding Poomukham Front Porch Odu Gable Roof with brass finial
    add_hipped_odu_roof(
        col, "ManaPoomukhamRoof",
        cx=0.0, cy=pm_y + 0.25,
        z_eave=plinth_h + pillar_h - 0.15,
        z_ridge=plinth_h + pillar_h + 1.85,
        hw=pm_w * 0.5 + 1.15, hd=pm_d * 0.5 + 1.15,
        ridge_hw=0.85,
        mats=mats,
        add_rafters=True,
        add_mukhappu=True,
    )

    export_collection_glb(col, "mana_nalukettu")


# ==============================================================================
# 2. GRAND MANA PADIPPURA (Ceremonial Gateway) — mana_padippura.glb
# ==============================================================================
def build_mana_padippura(mats):
    col = reset_collection("mana_padippura")

    W, D = 7.4, 3.4
    pass_w = 2.6
    side_w = (W - pass_w) * 0.5

    # Granite + Laterite stepped gatehouse plinth flanking the central walkway
    for sx, tag in ((-1, "L"), (1, "R")):
        cx = sx * (pass_w * 0.5 + side_w * 0.5)
        add_box(col, f"PadiPlinthG_{tag}", (cx, 0.0, 0.22), (side_w + 0.25, D + 0.35, 0.44), mats["granite"], bevel=0.02)
        add_box(col, f"PadiWallLat_{tag}", (cx, 0.0, 1.56), (side_w, D - 0.15, 2.28), mats["laterite"], bevel=0.015)
        add_box(col, f"PadiWallWood_{tag}", (cx, 0.0, 2.96), (side_w - 0.06, D - 0.22, 0.56), mats["teak_planks"])
        # Side viewing niche window
        add_kerala_window(col, f"PadiWinF_{tag}", (cx, (D - 0.25) * 0.5 + 0.08, 2.05), "Y", mats, w=0.72, h=0.88)
        # Carved teak gate jamb pillars
        add_kerala_pillar(col, f"PadiJamb_{tag}", sx * (pass_w * 0.5 + 0.16), 0.0, 0.0, 3.25, mats)

    # Stone paving threshold through the central gateway passage
    add_box(col, "PadiThreshold", (0.0, 0.0, 0.07), (pass_w + 0.4, D + 0.9, 0.14), mats["granite"], bevel=0.015)

    # Heavy Carved Teak Lintel + Ajar Double Gate Doors with Brass Bosses
    add_box(col, "PadiLintel", (0.0, 0.0, 3.24), (W + 0.3, D - 0.2, 0.28), mats["teak"], bevel=0.02)
    add_box(col, "PadiDoorL", (-pass_w * 0.5 + 0.12, -0.58, 1.55), (0.14, 1.18, 2.75), mats["teak"], rot_xyz=(0.0, 0.0, 0.35), bevel=0.012)
    add_box(col, "PadiDoorR", ( pass_w * 0.5 - 0.12, -0.58, 1.55), (0.14, 1.18, 2.75), mats["teak"], rot_xyz=(0.0, 0.0, -0.35), bevel=0.012)

    # Upper Timber Plank Loft (Padippura Malika)
    add_box(col, "PadiUpperLoft", (0.0, 0.0, 3.76), (W - 0.6, D - 0.45, 0.85), mats["teak_planks"], bevel=0.015)

    # Steep Overhanging Terracotta Odu Tiled Roof with Mukhappu Gables & Brass Finials
    add_hipped_odu_roof(
        col, "PadiRoof",
        cx=0.0, cy=0.0,
        z_eave=3.92,
        z_ridge=6.15,
        hw=W * 0.5 + 1.35, hd=D * 0.5 + 1.35,
        ridge_hw=W * 0.5 - 1.15,
        mats=mats,
        add_rafters=True,
        add_mukhappu=True,
    )

    export_collection_glb(col, "mana_padippura")


# ==============================================================================
# 3. MANA PATHAYAPURA (Two-Storey Granary & Estate Office) — mana_pathayapura.glb
# ==============================================================================
def build_mana_pathayapura(mats):
    col = reset_collection("mana_pathayapura")

    W, D = 7.6, 5.2
    plinth_h = 0.68

    # Stepped Granite + Laterite Plinth
    add_box(col, "PathPlinthG", (0.0, 0.0, 0.18), (W + 0.5, D + 0.5, 0.36), mats["granite"], bevel=0.02)
    add_box(col, "PathPlinthL", (0.0, 0.0, 0.52), (W + 0.15, D + 0.15, 0.34), mats["laterite"], bevel=0.015)

    # Ground-Floor Exposed Red Laterite Brick Walls with Front Verandah
    gf_h = 2.45
    add_box(col, "PathGFWalls", (0.0, -0.45, plinth_h + gf_h * 0.5), (W - 0.5, D - 1.4, gf_h), mats["laterite"])
    add_box(col, "PathVerFloor", (0.0, D * 0.5 - 0.55, plinth_h + 0.02), (W, 1.15, 0.06), mats["oxide"])
    for px in (-W * 0.5 + 0.35, -1.35, 1.35, W * 0.5 - 0.35):
        add_kerala_pillar(col, f"PathPillar_{px:.1f}", px, D * 0.5 - 0.32, plinth_h, gf_h, mats)

    # Heavy Double Granary Teak Doors
    add_box(col, "PathDoor", (0.0, D * 0.5 - 1.12, plinth_h + 1.08), (1.55, 0.22, 2.15), mats["teak"], bevel=0.015)

    # Cantilevered Upper Timber Granary (Ara) with Vertical Malabar Teak Planks
    up_z0 = plinth_h + gf_h + 0.10
    up_h = 1.65
    add_box(col, "PathUpperBand", (0.0, 0.0, up_z0 + up_h * 0.5), (W + 0.35, D + 0.30, up_h), mats["teak_planks"], bevel=0.015)
    for wx in (-2.2, 0.0, 2.2):
        add_kerala_window(col, f"PathUpWin_{wx:.1f}", (wx, D * 0.5 + 0.18, up_z0 + up_h * 0.52), "Y", mats, w=0.82, h=0.82)

    # Steep Terracotta Odu Tiled Roof
    add_hipped_odu_roof(
        col, "PathRoof",
        cx=0.0, cy=0.0,
        z_eave=up_z0 + up_h - 0.12,
        z_ridge=up_z0 + up_h + 2.35,
        hw=W * 0.5 + 1.25, hd=D * 0.5 + 1.25,
        ridge_hw=W * 0.5 - 1.10,
        mats=mats,
        add_rafters=True,
        add_mukhappu=True,
    )

    export_collection_glb(col, "mana_pathayapura")


if __name__ == "__main__":
    print("Building 1K PBR Kerala material palette...")
    mats = kpbr.get_kerala_material_palette(force_rebake=False)
    build_mana_nalukettu(mats)
    build_mana_padippura(mats)
    build_mana_pathayapura(mats)
    print("Done! Grand Mana (Nalukettu + Padippura + Pathayapura) exported with 1K PBR textures.")
