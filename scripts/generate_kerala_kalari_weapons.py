import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Matrix

# ==============================================================================
# KALIYUGHAM — Authentic 18th-Century Kerala Kalaripayattu Weapon Pack Generator
# ==============================================================================
# Generates 8 historically proportioned, PBR-textured Kerala Kalari weapons
# calibrated to a 1.72m MPFB2/Mixamo human character with exact metric lengths,
# real-world mass metadata (stored as glTF extras), and clean hand-grip origins:
#   - Origin (0, 0, 0) = Right-hand palm grip center (or Left-forearm strap for shield)
#   - Blade / shaft axis = +Y (extends forward/upward from the hand)
#   - Shield outer dome  = +Z
#
# Output directory:
#   /Users/vishnuk/Documents/project/game/public/models/weapons/*.glb
# ==============================================================================

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/weapons"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def make_pbr_material(name, base_rgb, roughness, metallic=0.0, grain_kind="wood"):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (520, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (220, 0)
    bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    res = 256
    img_name = f"Tex_{name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    img = bpy.data.images.new(img_name, width=res, height=res, alpha=False)
    px = [0.0] * (res * res * 4)
    rng = random.Random(hash(name) & 0xFFFF)
    r0, g0, b0 = base_rgb

    for y in range(res):
        v = y / res
        for x in range(res):
            u = x / res
            if grain_kind == "steel":
                delta = math.sin(v * 70.0 + math.sin(u * 18.0) * 1.4) * 0.045 + (rng.random() - 0.5) * 0.03
            elif grain_kind == "brass":
                delta = math.sin(u * 40.0 + v * 28.0) * 0.035 + (rng.random() - 0.5) * 0.025
            elif grain_kind == "leather":
                delta = math.sin(u * 55.0) * math.cos(v * 55.0) * 0.035 + (rng.random() - 0.5) * 0.04
            elif grain_kind == "coir":
                delta = math.sin((u + v * 0.6) * 110.0) * 0.055 + (rng.random() - 0.5) * 0.03
            else:  # wood / bamboo grain
                delta = math.sin(u * 48.0 + math.sin(v * 12.0) * 1.6) * 0.045 + (rng.random() - 0.5) * 0.022
            idx = (y * res + x) * 4
            px[idx] = max(0.0, min(1.0, r0 + delta))
            px[idx + 1] = max(0.0, min(1.0, g0 + delta * 0.9))
            px[idx + 2] = max(0.0, min(1.0, b0 + delta * 0.8))
            px[idx + 3] = 1.0

    img.pixels.foreach_set(px)
    img.pack()

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-80, 100)
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.14 if metallic > 0.5 else 0.22
    bump.location = (60, -110)
    links.new(tex.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def create_material_library():
    return {
        "steel": make_pbr_material("Kalari_ForgedSteel", (0.72, 0.74, 0.76), 0.28, 0.92, "steel"),
        "dark_steel": make_pbr_material("Kalari_DarkSteel", (0.34, 0.36, 0.38), 0.38, 0.86, "steel"),
        "brass": make_pbr_material("Kalari_HammeredBrass", (0.82, 0.64, 0.24), 0.30, 0.88, "brass"),
        "teak": make_pbr_material("Kalari_SeasonedTeak", (0.28, 0.16, 0.09), 0.68, 0.0, "wood"),
        "bamboo": make_pbr_material("Kalari_RattanBamboo", (0.48, 0.34, 0.17), 0.62, 0.0, "wood"),
        "rosewood": make_pbr_material("Kalari_VeettiRosewood", (0.19, 0.09, 0.06), 0.55, 0.0, "wood"),
        "leather": make_pbr_material("Kalari_BuffaloHide", (0.22, 0.14, 0.09), 0.72, 0.0, "leather"),
        "coir": make_pbr_material("Kalari_OiledCoir", (0.46, 0.33, 0.18), 0.88, 0.0, "coir"),
        "crimson_cloth": make_pbr_material("Kalari_GripCloth", (0.56, 0.09, 0.08), 0.84, 0.0, "coir"),
    }


def _smooth_mesh(obj, mat):
    for p in obj.data.polygons:
        p.use_smooth = True
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def _make_cylinder(name, r_bot, r_top, length, center_y, mat, segs=16, rot_x=math.pi * 0.5):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segs, radius=1.0, depth=length, location=(0.0, center_y, 0.0)
    )
    obj = bpy.context.active_object
    obj.name = name
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:
        t = (v.co.z + length * 0.5) / max(1e-5, length)
        r = r_bot * (1.0 - t) + r_top * t
        v.co.x *= r
        v.co.y *= r
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(rot_x, 3, "X"))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    return _smooth_mesh(obj, mat)


def _make_torus(name, major_r, minor_r, center_y, mat, segs=20):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=segs,
        minor_segments=10,
        major_radius=major_r,
        minor_radius=minor_r,
        location=(0.0, center_y, 0.0),
        rotation=(math.pi * 0.5, 0.0, 0.0),
    )
    obj = bpy.context.active_object
    obj.name = name
    return _smooth_mesh(obj, mat)


def _finalize_and_export(parts, name, filename, mass_kg, length_m, grip_type):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    weapon = bpy.context.active_object
    weapon.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # Store exact real-world weapon physics metadata in glTF extras
    weapon["kalari_mass_kg"] = float(mass_kg)
    weapon["kalari_length_m"] = float(length_m)
    weapon["kalari_grip_type"] = str(grip_type)

    os.makedirs(EXPORT_DIR, exist_ok=True)
    out_path = os.path.join(EXPORT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_apply=True,
    )
    print(f"Exported {filename}: length={length_m:.2f}m, mass={mass_kg:.2f}kg, grip={grip_type}")
    clear_scene()


# ------------------------------------------------------------------------------
# 1. Kerala Val / Churika (Curved Kalaripayattu Broadsword) — 0.86m, 0.95kg
# ------------------------------------------------------------------------------
def build_kalari_sword(mats):
    parts = []
    # Grip centered at origin (y in -0.075 .. +0.075), blade extends +Y to +0.785m
    parts.append(_make_cylinder("Grip", 0.0155, 0.0175, 0.145, 0.0, mats["crimson_cloth"], 14))
    for gy in (-0.055, -0.025, 0.005, 0.035):
        parts.append(_make_torus(f"GripRing_{gy}", 0.0175, 0.0024, gy, mats["coir"], 16))
    # Pommel cap & brass saucer guard (Kattari-style Kerala guard)
    parts.append(_make_cylinder("Pommel", 0.022, 0.016, 0.026, -0.082, mats["brass"], 16))
    parts.append(_make_cylinder("Guard", 0.044, 0.040, 0.014, 0.078, mats["brass"], 20))
    parts.append(_make_torus("GuardRim", 0.043, 0.0045, 0.078, mats["brass"], 20))

    # Forged curved broadsword blade (y = 0.085 .. 0.785m, total length 0.86m)
    bm = bmesh.new()
    segs = 22
    rings = []
    for i in range(segs + 1):
        t = i / segs
        y = 0.085 + t * 0.700
        curve_z = -0.048 * (t ** 2.15)  # Authentic slight backward curve of Kerala Val
        # Broadening leaf-tip profile before tapering sharply to point
        if t < 0.78:
            half_w = 0.019 + 0.009 * math.sin((t / 0.78) * math.pi * 0.85)
        else:
            u = (t - 0.78) / 0.22
            half_w = 0.026 * (1.0 - u ** 1.35) + 0.0012
        thick = (0.0052 * (1.0 - t * 0.58)) if t < 0.96 else 0.0010
        prof = [
            Vector((0.0, y, curve_z + half_w)),
            Vector((thick, y, curve_z + half_w * 0.35)),
            Vector((thick * 0.85, y, curve_z - half_w * 0.45)),
            Vector((0.0, y, curve_z - half_w)),
            Vector((-thick * 0.85, y, curve_z - half_w * 0.45)),
            Vector((-thick, y, curve_z + half_w * 0.35)),
        ]
        rings.append([bm.verts.new(p) for p in prof])
    for i in range(segs):
        for j in range(6):
            nj = (j + 1) % 6
            bm.faces.new((rings[i][j], rings[i][nj], rings[i + 1][nj], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Blade")
    bm.to_mesh(mesh)
    bm.free()
    blade_obj = bpy.data.objects.new("Blade", mesh)
    bpy.context.scene.collection.objects.link(blade_obj)
    parts.append(_smooth_mesh(blade_obj, mats["steel"]))

    _finalize_and_export(parts, "Kalari_Val_Sword", "kalari_sword.glb", 0.95, 0.86, "one_handed_right")


# ------------------------------------------------------------------------------
# 2. Kerala Paricha (Domed Buffalo-Hide & Brass-Studded Shield) — 0.48m, 1.35kg
# ------------------------------------------------------------------------------
def build_kalari_buckler(mats):
    parts = []
    radius = 0.24  # 0.48m diameter
    dome_h = 0.088

    # Domed buffalo-hide shield body (origin at rear forearm strap, face along +Z)
    bm = bmesh.new()
    rings_n, segs_n = 10, 28
    v_rings = []
    for ir in range(rings_n + 1):
        t = ir / rings_n
        r = max(0.004, t * radius)
        z = dome_h * math.cos(t * math.pi * 0.5)
        ring = [bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)) for a in [(k / segs_n) * math.pi * 2 for k in range(segs_n)]]
        v_rings.append(ring)
    for ir in range(rings_n):
        for k in range(segs_n):
            nk = (k + 1) % segs_n
            bm.faces.new((v_rings[ir][k], v_rings[ir + 1][k], v_rings[ir + 1][nk], v_rings[ir][nk]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    s_mesh = bpy.data.meshes.new("ParichaDome")
    bm.to_mesh(s_mesh)
    bm.free()
    dome = bpy.data.objects.new("ParichaDome", s_mesh)
    bpy.context.scene.collection.objects.link(dome)
    _smooth_mesh(dome, mats["leather"])
    sol = dome.modifiers.new("Solid", "SOLIDIFY")
    sol.thickness = 0.011
    sol.offset = -1.0
    bpy.context.view_layer.objects.active = dome
    bpy.ops.object.modifier_apply(modifier="Solid")
    parts.append(dome)

    # Forged iron/brass rim ring
    bpy.ops.mesh.primitive_torus_add(
        major_segments=32, minor_segments=10, major_radius=radius, minor_radius=0.010, location=(0, 0, 0.002)
    )
    parts.append(_smooth_mesh(bpy.context.active_object, mats["dark_steel"]))

    # Central brass umbo + 4 traditional Kottu brass bosses
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.044, location=(0, 0, dome_h + 0.004))
    umbo = bpy.context.active_object
    umbo.scale = (1.0, 1.0, 0.45)
    bpy.ops.object.transform_apply(scale=True)
    parts.append(_smooth_mesh(umbo, mats["brass"]))

    for k in range(4):
        ang = (k / 4) * math.pi * 2 + math.pi * 0.25
        bx = math.cos(ang) * (radius * 0.56)
        by = math.sin(ang) * (radius * 0.56)
        bz = dome_h * math.cos(0.56 * math.pi * 0.5) + 0.005
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.022, location=(bx, by, bz))
        boss = bpy.context.active_object
        boss.scale = (1.0, 1.0, 0.52)
        bpy.ops.object.transform_apply(scale=True)
        parts.append(_smooth_mesh(boss, mats["brass"]))

    # Rear leather forearm handle straps
    for sy in (-0.065, 0.065):
        bpy.ops.mesh.primitive_torus_add(
            major_segments=18, minor_segments=8, major_radius=0.042, minor_radius=0.008,
            location=(0, sy, 0.012), rotation=(math.pi * 0.5, 0, 0)
        )
        strap = bpy.context.active_object
        strap.scale = (1.2, 0.45, 0.6)
        bpy.ops.object.transform_apply(scale=True)
        parts.append(_smooth_mesh(strap, mats["coir"]))

    _finalize_and_export(parts, "Kalari_Paricha_Shield", "kalari_buckler.glb", 1.35, 0.48, "forearm_left")


# ------------------------------------------------------------------------------
# 3. Kerala Kuntham (Kalaripayattu Thrusting Spear) — 1.92m, 1.65kg
#    Origin (0, 0, 0) = rear right-hand grip (0.52m from butt end), shaft along +Y
# ------------------------------------------------------------------------------
def build_kalari_spear(mats):
    parts = []
    # Butt extends to y = -0.52m; shaft ends at y = +1.08m; spearhead extends +1.08 .. +1.40m (total 1.92m)
    parts.append(_make_cylinder("ButtCap", 0.011, 0.0145, 0.065, -0.495, mats["brass"], 14))
    parts.append(_make_cylinder("SpearShaft", 0.0142, 0.0138, 1.54, 0.305, mats["teak"], 16))
    # Twin coir grip wraps at rear hand (y=0) and front guide hand (y=+0.48m)
    parts.append(_make_cylinder("RearGrip", 0.0158, 0.0158, 0.14, 0.0, mats["coir"], 14))
    parts.append(_make_cylinder("FrontGrip", 0.0156, 0.0156, 0.14, 0.48, mats["coir"], 14))
    # Brass socket ferrule & crimson tassel collar below spearhead
    parts.append(_make_cylinder("SocketCollar", 0.016, 0.018, 0.075, 1.07, mats["brass"], 16))
    parts.append(_make_torus("TasselBand", 0.020, 0.0055, 1.03, mats["crimson_cloth"], 18))

    # Forged double-edged leaf-shaped Kuntham steel spearhead (y = 1.10 .. 1.40m)
    bm = bmesh.new()
    segs = 16
    rings = []
    for i in range(segs + 1):
        t = i / segs
        y = 1.10 + t * 0.30
        w = 0.032 * math.sin(min(1.0, (t ** 0.72)) * math.pi) + 0.0018 * (1.0 - t)
        ridge = 0.0075 * (1.0 - t * 0.75)
        prof = [
            Vector((w, y, 0.0)),
            Vector((0.0, y, ridge)),
            Vector((-w, y, 0.0)),
            Vector((0.0, y, -ridge)),
        ]
        rings.append([bm.verts.new(p) for p in prof])
    for i in range(segs):
        for j in range(4):
            nj = (j + 1) % 4
            bm.faces.new((rings[i][j], rings[i][nj], rings[i + 1][nj], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    head_mesh = bpy.data.meshes.new("SpearHead")
    bm.to_mesh(head_mesh)
    bm.free()
    head_obj = bpy.data.objects.new("SpearHead", head_mesh)
    bpy.context.scene.collection.objects.link(head_obj)
    parts.append(_smooth_mesh(head_obj, mats["steel"]))

    _finalize_and_export(parts, "Kalari_Kuntham_Spear", "kalari_spear.glb", 1.65, 1.92, "two_handed_pole")


# ------------------------------------------------------------------------------
# 4. Kerala Kettukari / Panneeru Chan Vadi (12-Span Long Staff) — 1.82m, 1.20kg
# ------------------------------------------------------------------------------
def build_kalari_kettukari(mats):
    parts = []
    # Origin (0,0,0) = rear grip (0.50m from butt), total 1.82m (y = -0.50 .. +1.32m)
    parts.append(_make_cylinder("StaffBody", 0.0145, 0.0128, 1.76, 0.41, mats["bamboo"], 16))
    parts.append(_make_cylinder("EndCapBot", 0.0135, 0.0148, 0.035, -0.485, mats["brass"], 14))
    parts.append(_make_cylinder("EndCapTop", 0.0132, 0.0120, 0.035, 1.305, mats["brass"], 14))
    for ny in (-0.28, 0.08, 0.42, 0.76, 1.08):
        parts.append(_make_torus(f"Node_{ny}", 0.0144, 0.0024, ny, mats["teak"], 16))
    parts.append(_make_cylinder("GripA", 0.0156, 0.0156, 0.14, 0.0, mats["coir"], 14))
    parts.append(_make_cylinder("GripB", 0.0150, 0.0150, 0.14, 0.48, mats["coir"], 14))

    _finalize_and_export(parts, "Kalari_Kettukari_Staff", "kalari_kettukari.glb", 1.20, 1.82, "two_handed_pole")


# ------------------------------------------------------------------------------
# 5. Kerala Cheruvadi / Muchan (Short Hardwood Fighting Stick) — 0.72m, 0.58kg
# ------------------------------------------------------------------------------
def build_kalari_kuruvadi(mats):
    parts = []
    # Origin at rear grip (y = -0.10 .. +0.62m)
    parts.append(_make_cylinder("StickShaft", 0.0140, 0.0125, 0.68, 0.26, mats["rosewood"], 16))
    parts.append(_make_cylinder("GripWrap", 0.0152, 0.0152, 0.14, 0.0, mats["coir"], 14))
    parts.append(_make_cylinder("BrassBot", 0.0135, 0.0145, 0.024, -0.092, mats["brass"], 14))
    parts.append(_make_cylinder("BrassTop", 0.0128, 0.0115, 0.024, 0.610, mats["brass"], 14))
    _finalize_and_export(parts, "Kalari_Cheruvadi_Stick", "kalari_kuruvadi.glb", 0.58, 0.72, "one_handed_right")


# ------------------------------------------------------------------------------
# 6. Kerala Kattara (Traditional Push Dagger) — 0.38m, 0.62kg
# ------------------------------------------------------------------------------
def build_kalari_kattara(mats):
    parts = []
    # Horizontal crossbars at origin (y = 0, y = +0.024) + twin sidebars + triangular blade (+0.07 .. +0.34m)
    for hy in (-0.012, 0.016):
        bar = _make_cylinder(f"Crossbar_{hy}", 0.0085, 0.0085, 0.095, hy, mats["brass"], 12, rot_x=0.0)
        bar.rotation_euler = (0.0, math.pi * 0.5, 0.0)
        bpy.context.view_layer.objects.active = bar
        bpy.ops.object.transform_apply(rotation=True)
        parts.append(bar)
    for sx in (-0.048, 0.048):
        side = _make_cylinder(f"Sidebar_{sx}", 0.007, 0.006, 0.15, 0.01, mats["dark_steel"], 10)
        side.location.x = sx
        parts.append(side)

    bm = bmesh.new()
    segs = 12
    rings = []
    for i in range(segs + 1):
        t = i / segs
        y = 0.08 + t * 0.26
        w = 0.046 * (1.0 - t * 0.96)
        thick = 0.008 * (1.0 - t * 0.80)
        rings.append([
            bm.verts.new((w, y, 0.0)),
            bm.verts.new((0.0, y, thick)),
            bm.verts.new((-w, y, 0.0)),
            bm.verts.new((0.0, y, -thick)),
        ])
    for i in range(segs):
        for j in range(4):
            nj = (j + 1) % 4
            bm.faces.new((rings[i][j], rings[i][nj], rings[i + 1][nj], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("KattaraBlade")
    bm.to_mesh(mesh)
    bm.free()
    b_obj = bpy.data.objects.new("KattaraBlade", mesh)
    bpy.context.scene.collection.objects.link(b_obj)
    parts.append(_smooth_mesh(b_obj, mats["steel"]))

    _finalize_and_export(parts, "Kalari_Kattara_Dagger", "kalari_kattara.glb", 0.62, 0.38, "one_handed_right")


# ------------------------------------------------------------------------------
# 7. Kerala Urumi (Twin-Blade Flexible Whip-Sword) — 1.45m, 0.78kg
# ------------------------------------------------------------------------------
def build_kalari_urumi(mats):
    parts = []
    parts.append(_make_cylinder("UrumiGrip", 0.015, 0.016, 0.13, 0.0, mats["crimson_cloth"], 14))
    parts.append(_make_cylinder("UrumiGuard", 0.048, 0.042, 0.014, 0.072, mats["brass"], 20))
    parts.append(_make_cylinder("UrumiPommel", 0.020, 0.016, 0.024, -0.076, mats["brass"], 14))

    # Twin flexible spring-steel ribbon blades sweeping gracefully along +Y
    for bi, phase in enumerate((-0.004, 0.004)):
        bm = bmesh.new()
        segs = 32
        rows = []
        for i in range(segs + 1):
            t = i / segs
            y = 0.08 + t * 1.37
            wave_x = math.sin(t * math.pi * 1.65) * 0.14 * (t ** 1.1) + phase
            wave_z = math.cos(t * math.pi * 1.2) * 0.045 * t
            hw = 0.0115 * (1.0 - t * 0.35)
            rows.append([bm.verts.new((wave_x, y, wave_z - hw)), bm.verts.new((wave_x, y, wave_z + hw))])
        for i in range(segs):
            bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(f"UrumiBlade_{bi}")
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(f"UrumiBlade_{bi}", mesh)
        bpy.context.scene.collection.objects.link(obj)
        _smooth_mesh(obj, mats["steel"])
        sol = obj.modifiers.new("Solid", "SOLIDIFY")
        sol.thickness = 0.0018
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier="Solid")
        parts.append(obj)

    _finalize_and_export(parts, "Kalari_Urumi_WhipSword", "kalari_urumi.glb", 0.78, 1.45, "one_handed_right")


# ------------------------------------------------------------------------------
# 8. Kerala Villu (Traditional Bamboo Recurve Bow) — 1.48m, 0.82kg
# ------------------------------------------------------------------------------
def build_kalari_bow(mats):
    parts = []
    # Origin at center leather grip (0, 0, 0), limbs span y = -0.74 .. +0.74m, curve back toward -Z
    bm = bmesh.new()
    segs = 28
    rings = []
    tip_top = Vector((0, 0.74, -0.22))
    tip_bot = Vector((0, -0.74, -0.22))
    for i in range(segs + 1):
        t = (i / segs) * 2.0 - 1.0  # -1 .. +1
        y = t * 0.74
        z = -0.22 * (t * t) + 0.03 * math.sin(abs(t) * math.pi)
        r = 0.0145 * (1.0 - 0.45 * abs(t))
        ring = []
        for k in range(10):
            a = (k / 10) * math.pi * 2
            ring.append(bm.verts.new((math.cos(a) * r * 1.15, y, z + math.sin(a) * r * 0.85)))
        rings.append(ring)
        if i == 0:
            tip_bot = Vector((0, y, z))
        elif i == segs:
            tip_top = Vector((0, y, z))
    for i in range(segs):
        for k in range(10):
            nk = (k + 1) % 10
            bm.faces.new((rings[i][k], rings[i][nk], rings[i + 1][nk], rings[i + 1][k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("BowStave")
    bm.to_mesh(mesh)
    bm.free()
    stave = bpy.data.objects.new("BowStave", mesh)
    bpy.context.scene.collection.objects.link(stave)
    parts.append(_smooth_mesh(stave, mats["bamboo"]))

    parts.append(_make_cylinder("BowGrip", 0.0175, 0.0175, 0.14, 0.0, mats["leather"], 14))

    # Taut hemp bowstring connecting top and bottom nocks
    s_len = (tip_top - tip_bot).length
    s_mid = (tip_top + tip_bot) * 0.5
    string_obj = _make_cylinder("BowString", 0.0022, 0.0022, s_len, s_mid.y, mats["coir"], 6)
    string_obj.location.z = s_mid.z
    parts.append(string_obj)

    _finalize_and_export(parts, "Kalari_Villu_Bow", "kalari_bow.glb", 0.82, 1.48, "one_handed_left")


def main():
    clear_scene()
    mats = create_material_library()
    build_kalari_sword(mats)

    mats = create_material_library()
    build_kalari_buckler(mats)

    mats = create_material_library()
    build_kalari_spear(mats)

    mats = create_material_library()
    build_kalari_kettukari(mats)

    mats = create_material_library()
    build_kalari_kuruvadi(mats)

    mats = create_material_library()
    build_kalari_kattara(mats)

    mats = create_material_library()
    build_kalari_urumi(mats)

    mats = create_material_library()
    build_kalari_bow(mats)

    print(f"All 8 Kerala Kalari weapons exported cleanly to {EXPORT_DIR}!")


if __name__ == "__main__":
    main()
