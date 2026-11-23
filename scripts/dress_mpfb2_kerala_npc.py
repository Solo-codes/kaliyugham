import bpy
import bmesh
import math
import os
import random
import re
import shutil
import sys
import zipfile
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

# ==============================================================================
# KALIYUGHAM — MPFB2 Realistic Human -> 18th-Century Kerala Outfit & Mixamo FBX
# ==============================================================================
# Workflow:
#   1. Create your realistic human in Blender using MPFB2 (New Human -> set Age,
#      Gender, Asian/Indian proportions, Skin, Eyes, Hair; keep in T-Pose).
#   2. Select the MPFB2 human body mesh in the 3D Viewport.
#   3. Change OUTFIT_PRESET below to the character role you want.
#   4. Click Run Script (▶).
#   5. Upload the exported FBX from:
#        /Users/vishnuk/Documents/project/game/mixamo_upload/<preset>.fbx
#      to https://www.mixamo.com/ (with textures embedded!) for auto-rigging
#      and motion-capture animations!
# ==============================================================================

OUTFIT_PRESET = "temple_priest"
# Available presets:
#   "farmer_man"     -> Checkered blue/ochre Kalli Mundu (folded/knee-length) + bare chest / Thorthu
#   "villager_man"   -> Checkered maroon/indigo Kalli Mundu (full length) + shoulder Thorthu
#   "fisherman"      -> Folded maroon-red Kalli Mundu (knee-length) + Thoppikuda palm-leaf hat
#   "elder_man"      -> Traditional off-white Kasavu Mundu + Melmundu shoulder shawl
#   "landlord"       -> Rich cream Kasavu Mundu with wide gold border + royal Melmundu
#   "kalari_student" -> Tightly tied martial Kalli/Kachai wrap (above knee) + red waist sash
#   "kalari_guru"    -> Senior Kalari Gurukkal: ivory-crimson Kasavu Mundu + crimson Kacha sash + Rudraksha mala
#   "guard"          -> 18th-c. Nair Estate Guard: ivory Kasavu Mundu + crimson Kacha + maroon Melmundu + Thalakettu
#   "karyasthan"     -> Landlord's Estate Manager: clean off-white Kasavu Mundu + folded cream Thorthu
#   "temple_priest"  -> 18th-c. Kerala Temple Santhikaran: ivory Kasavu Mundu + sacred Poonool thread + Rudraksha mala + Bhasmam/Chandanam tilak
#   "villager_woman" -> Fitted modest cotton blouse + pleated Kasavu Set-Mundu
#   "elder_woman"    -> Modest off-white cotton blouse + Kasavu Mundu & diagonal Neriyathu
#   "farmer_woman"   -> Earthy terracotta cotton blouse + tucked cotton Mundu

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/mixamo_upload"
AUTO_EXPORT_FBX = True

PRESETS = {
    "farmer_man":     dict(gender="M", lower="kalli_short", upper="thorthu",       pal=("kalli_blue",  "thorthu_cream")),
    "villager_man":   dict(gender="M", lower="kalli_full",  upper="thorthu",       pal=("kalli_brown", "thorthu_cream")),
    "fisherman":      dict(gender="M", lower="kalli_short", upper="headcloth",     pal=("kalli_red",   "thorthu_cream")),
    "elder_man":      dict(gender="M", lower="kasavu_full", upper="melmundu",      pal=("kasavu_cream","kasavu_cream")),
    "landlord":       dict(gender="M", lower="kasavu_full", upper="melmundu",      pal=("kasavu_royal","kasavu_royal")),
    "kalari_student": dict(gender="M", lower="kachai",      upper="sash",          pal=("kalari_black","sash_crimson")),
    "kalari_guru":    dict(gender="M", lower="kasavu_full", upper="guru_sash",     pal=("kasavu_royal","sash_crimson")),
    "guard":          dict(gender="M", lower="kasavu_short",upper="guard_gear",    pal=("kasavu_royal","sash_crimson")),
    "karyasthan":     dict(gender="M", lower="kasavu_full", upper="thorthu",       pal=("kasavu_cream","thorthu_cream")),
    "temple_priest":  dict(gender="M", lower="modular_base", upper="priest_sacred", pal=("kasavu_cream","thorthu_cream")),
    "villager_woman": dict(gender="F", lower="kasavu_full", upper="blouse_neriyathu", pal=("kasavu_cream", "blouse_maroon")),
    "elder_woman":    dict(gender="F", lower="kasavu_full", upper="blouse_neriyathu", pal=("kasavu_cream", "blouse_ivory")),
    "farmer_woman":   dict(gender="F", lower="kalli_full",  upper="blouse",           pal=("kalli_ochre",  "blouse_earth")),
}

# ------------------------------------------------------------------------------
# 1. Packed 512x512 Woven Kerala Cotton / Kalli Mundu / Kasavu PBR Textures
# ------------------------------------------------------------------------------
def make_cloth_material(name, style):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (560, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (260, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    res = 512
    img_name = f"KeralaCloth_{name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    img = bpy.data.images.new(img_name, width=res, height=res, alpha=False)
    pixels = [0.0] * (res * res * 4)
    rng = random.Random(hash(style) & 0xFFFF)

    palettes = {
        "kalli_blue":    ((0.15, 0.25, 0.42), (0.76, 0.72, 0.62), (0.09, 0.14, 0.25)),
        "kalli_brown":   ((0.36, 0.19, 0.13), (0.78, 0.70, 0.56), (0.18, 0.11, 0.08)),
        "kalli_indigo":  ((0.12, 0.16, 0.28), (0.58, 0.60, 0.56), (0.06, 0.08, 0.15)),
        "kalli_red":     ((0.46, 0.11, 0.10), (0.82, 0.72, 0.56), (0.24, 0.06, 0.06)),
        "kalli_green":   ((0.11, 0.30, 0.18), (0.80, 0.76, 0.64), (0.06, 0.17, 0.10)),
        "kalli_ochre":   ((0.48, 0.31, 0.14), (0.82, 0.75, 0.60), (0.28, 0.16, 0.08)),
        "kasavu_cream":  ((0.88, 0.84, 0.74), (0.76, 0.60, 0.24), (0.56, 0.42, 0.14)),
        "kasavu_royal":  ((0.92, 0.88, 0.78), (0.85, 0.68, 0.22), (0.48, 0.12, 0.10)),
        "thorthu_cream": ((0.84, 0.79, 0.68), (0.52, 0.22, 0.16), (0.68, 0.62, 0.50)),
        "blouse_maroon": ((0.42, 0.12, 0.14), (0.56, 0.22, 0.20), (0.30, 0.08, 0.10)),
        "blouse_ivory":  ((0.86, 0.82, 0.72), (0.76, 0.64, 0.34), (0.74, 0.70, 0.60)),
        "blouse_earth":  ((0.46, 0.26, 0.18), (0.60, 0.38, 0.24), (0.34, 0.18, 0.12)),
        "kalari_black":  ((0.07, 0.07, 0.08), (0.86, 0.68, 0.20), (0.68, 0.10, 0.10)),
        "sash_crimson":  ((0.68, 0.07, 0.07), (0.84, 0.64, 0.18), (0.42, 0.04, 0.04)),
    }
    c_main, c_sec, c_acc = palettes.get(style, palettes["kasavu_cream"])
    is_kalli = style.startswith("kalli_")
    is_kasavu = style.startswith("kasavu_") or style == "kalari_black"

    for y in range(res):
        v = y / res
        for x in range(res):
            u = x / res
            weave = (math.sin(u * math.pi * 128) * math.sin(v * math.pi * 128)) * 0.025
            grain = (rng.random() - 0.5) * 0.025

            if is_kalli:
                # Bold, crisp Kerala checkered Kalli Mundu (Lungi) plaid pattern
                bx = int(u * 6) % 2
                by = int(v * 6) % 2
                stripe_x = (u * 6) % 1.0
                stripe_y = (v * 6) % 1.0
                if (bx == 0 and by == 0):
                    col = c_main
                elif (bx == 1 and by == 1):
                    col = c_sec
                else:
                    col = tuple(c_main[k] * 0.65 + c_sec[k] * 0.35 for k in range(3))
                if abs(stripe_x - 0.14) < 0.045 or abs(stripe_y - 0.14) < 0.045:
                    col = c_acc
            elif is_kasavu:
                # Handloom cream cotton with woven golden Kasavu kara border at bottom
                if 0.05 < v < 0.16:
                    col = c_sec
                    if abs(v - 0.065) < 0.012 or abs(v - 0.145) < 0.012:
                        col = c_acc
                else:
                    col = c_main
            else:
                # Handloom cotton weave with subtle border accent
                col = c_sec if (0.04 < v < 0.10) else c_main

            idx = (y * res + x) * 4
            pixels[idx]     = max(0.0, min(1.0, col[0] + weave + grain))
            pixels[idx + 1] = max(0.0, min(1.0, col[1] + weave + grain))
            pixels[idx + 2] = max(0.0, min(1.0, col[2] + weave + grain))
            pixels[idx + 3] = 1.0

    img.pixels.foreach_set(pixels)
    img.pack()

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-60, 120)
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.88
    if is_kasavu:
        bsdf.inputs["Sheen Weight"].default_value = 0.25 if "Sheen Weight" in bsdf.inputs else 0.0

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.16
    bump.location = (90, -100)
    links.new(tex.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ------------------------------------------------------------------------------
# 2. Body-Measuring & Cloth-Conforming Garment Builders
# ------------------------------------------------------------------------------
def _eval_world_verts(body_obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = body_obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    mw = body_obj.matrix_world
    pts = [mw @ v.co for v in eval_mesh.vertices]
    eval_obj.to_mesh_clear()
    return pts


def slice_body_profile(body_obj, z_frac, min_z, height):
    """Measures the evaluated MPFB2 body's exact X/Y radius & center at a given height fraction."""
    z_target = min_z + height * z_frac
    band = height * 0.025
    xs, ys = [], []
    for w in _eval_world_verts(body_obj):
        if abs(w.z - z_target) <= band:
            # Exclude A-pose/T-pose arms & hands strictly when measuring torso/waist/hips!
            if abs(w.x) < height * 0.13:
                xs.append(w.x)
                ys.append(w.y)
    if not xs:
        return 0.0, 0.0, 0.15, 0.11, z_target
    cx = (min(xs) + max(xs)) * 0.5
    cy = (min(ys) + max(ys)) * 0.5
    rx = max(0.08, (max(xs) - min(xs)) * 0.5)
    ry = max(0.07, (max(ys) - min(ys)) * 0.5)
    return cx, cy, rx, ry, z_target


def build_pleated_mundu(body_obj, min_z, height, style_mode, mat):
    """Builds an authentic Kerala-style wrapped Mundu (waist tuck roll, front overlap fold, madakki kuthal or full drape)."""
    is_full = "full" in style_mode
    is_short = "short" in style_mode
    z_top_frac = 0.585
    z_bot_frac = 0.065 if is_full else (0.335 if is_short else 0.37)

    rings = 26
    segs = 56
    bm = bmesh.new()
    vert_rings = []

    # Measure true waist and hip+glute envelope from evaluated mesh strictly inside torso (|x| < 0.13*h excludes A-pose hands!)
    _, cy_waist, rx_w, ry_w, _ = slice_body_profile(body_obj, z_top_frac, min_z, height)
    hip_xs, hip_ys = [], []
    z_hip_lo = min_z + height * 0.43
    z_hip_hi = min_z + height * 0.55
    for w in _eval_world_verts(body_obj):
        if z_hip_lo <= w.z <= z_hip_hi and abs(w.x) < height * 0.13:
            hip_xs.append(w.x)
            hip_ys.append(w.y)
    if hip_xs:
        rx_h = max(0.11, (max(hip_xs) - min(hip_xs)) * 0.5)
        y_front_h = min(hip_ys)
        y_back_h = max(hip_ys)
        cy_hip = (y_front_h + y_back_h) * 0.5
        ry_h = max(0.085, (y_back_h - y_front_h) * 0.5)
    else:
        _, cy_hip, rx_h, ry_h, _ = slice_body_profile(body_obj, 0.49, min_z, height)

    pad_w = height * 0.008
    pad_side = height * 0.016
    pad_front = height * 0.022
    pad_back = height * 0.020

    for ir in range(rings + 1):
        t = ir / rings  # 0 = bottom hem, 1 = top waist edge
        zf = z_bot_frac + (z_top_frac - z_bot_frac) * t
        z_base = min_z + height * zf

        # Straight Kerala cylinder drape (NOT a flared western A-line skirt!)
        if t > 0.68:
            u = (t - 0.68) / 0.32  # 0 at hip -> 1 at waist
            rx = (rx_h + pad_side) * (1 - u) + (rx_w + pad_w) * u
            ry_f = (ry_h + pad_front) * (1 - u) + (ry_w + pad_w) * u
            ry_b = (ry_h + pad_back) * (1 - u) + (ry_w + pad_w * 1.2) * u
            cy = cy_hip * (1 - u) + cy_waist * u
        else:
            # For folded knee-length farmer mundu (madakki kuthal), gently tuck inward at the folded lower hem
            if is_short or not is_full:
                taper = -height * 0.009 * (1.0 - t / 0.68) ** 1.4
            else:
                # Full-length Kerala mundu hangs almost straight down to the ankles
                taper = height * 0.005 * (1.0 - t / 0.68)
            rx = rx_h + pad_side + taper
            ry_f = ry_h + pad_front + taper * 0.7
            ry_b = ry_h + pad_back + taper * 0.75
            cy = cy_hip

        # Authentic rolled waist tuck (Kuthu) around the top band (t in 0.86..1.0)
        waist_roll = 0.0
        if t > 0.86:
            waist_roll = math.sin(((t - 0.86) / 0.14) * math.pi) * height * 0.0075

        ring = []
        for iseg in range(segs):
            # Start wrap around front-right (-60 deg) so we can sculpt the authentic Kerala overlapping vertical flap!
            ang = (iseg / segs) * math.pi * 2.0
            c_ang = math.cos(ang)
            s_ang = math.sin(ang)
            ry = ry_b if s_ang >= 0.0 else ry_f

            # Overlapping Kerala front-right wrap fold (Madakku / Neri) stepping subtly outward on the front
            # Front is -Y (s_ang < 0, ang ~ 3*pi/2). Step sits neatly at front-right (ang ~ 1.65*pi)
            d_wrap = (ang - 1.62 * math.pi) % (math.pi * 2.0)
            if d_wrap < 0.38 * math.pi:
                overlap = height * 0.0085 * math.sin((d_wrap / (0.38 * math.pi)) * math.pi * 0.5)
            elif d_wrap < 0.46 * math.pi:
                overlap = height * 0.0085 * (1.0 - (d_wrap - 0.38 * math.pi) / (0.08 * math.pi))
            else:
                overlap = 0.0

            # Deep, asymmetric diagonal tension creases pulling toward the front waist tuck + crisp pleats
            front_factor = max(0.0, -s_ang)
            diag_fold1 = math.sin(ang * 7.0 + (1.0 - t) * 4.2) * height * 0.0052 * (0.35 + 0.65 * front_factor)
            diag_fold2 = math.sin(ang * 13.0 - (1.0 - t) * 3.1) * height * 0.0028 * (0.4 + 0.6 * (1.0 - front_factor))
            gather = (diag_fold1 + diag_fold2) * (1.0 - t * 0.65)

            # For folded knee-length mundu (madakki kuthal), traditional upward fold curve at front-center hem
            z_lift = 0.0
            if (is_short or not is_full) and t < 0.50:
                hem_w = (1.0 - t / 0.50) ** 1.5
                z_lift = height * 0.022 * hem_w * (front_factor ** 2)

            # Folded bottom hem thickness (double-layered cloth fold on madakki kuthal)
            hem_fold = (height * 0.0065 * math.sin((t / 0.14) * math.pi)) if (not is_full and t < 0.14) else 0.0

            radial_add = waist_roll + overlap + gather + hem_fold
            x = c_ang * (rx + radial_add)
            y = cy + s_ang * (ry + radial_add)
            ring.append(bm.verts.new((x, y, z_base + z_lift)))
        vert_rings.append(ring)

    uv_layer = bm.loops.layers.uv.verify()
    for ir in range(rings):
        v0 = ir / rings
        v1 = (ir + 1) / rings
        for iseg in range(segs):
            nseg = (iseg + 1) % segs
            f = bm.faces.new((
                vert_rings[ir][iseg],
                vert_rings[ir][nseg],
                vert_rings[ir + 1][nseg],
                vert_rings[ir + 1][iseg],
            ))
            u0 = iseg / segs
            u1 = (iseg + 1) / segs
            f.loops[0][uv_layer].uv = (u0 * 2.0, v0)
            f.loops[1][uv_layer].uv = (u1 * 2.0, v0)
            f.loops[2][uv_layer].uv = (u1 * 2.0, v1)
            f.loops[3][uv_layer].uv = (u0 * 2.0, v1)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Kerala_Mundu")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True

    obj = bpy.data.objects.new("Kerala_Mundu", mesh)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)

    # Shrinkwrap the upper waist band strictly OUTSIDE_SURFACE so it hugs the waist tightly with zero gap or clipping
    vg = obj.vertex_groups.new(name="WaistFit")
    z_fit_start = min_z + height * (z_top_frac - 0.075)
    z_fit_top = min_z + height * z_top_frac
    for v in obj.data.vertices:
        if v.co.z >= z_fit_start:
            w_val = max(0.0, min(1.0, (v.co.z - z_fit_start) / max(1e-4, z_fit_top - z_fit_start)))
            vg.add([v.index], w_val * w_val, "REPLACE")

    sw = obj.modifiers.new("WaistShrink", "SHRINKWRAP")
    sw.target = body_obj
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    sw.wrap_mode = "OUTSIDE_SURFACE"
    sw.vertex_group = "WaistFit"
    sw.offset = height * 0.0065
    sm = obj.modifiers.new("MunduSmooth", "SMOOTH")
    sm.factor = 0.35
    sm.iterations = 2
    sol = obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = height * 0.0042
    sol.offset = 1.0

    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="WaistShrink")
    bpy.ops.object.modifier_apply(modifier="MunduSmooth")
    bpy.ops.object.modifier_apply(modifier="Solidify")
    obj.vertex_groups.clear()

    # ------------------------------------------------------------------
    # Detail Part 1: Sculpted 3D Rolled Kerala Waist Tuck (Kuthu Band)
    # ------------------------------------------------------------------
    bm_roll = bmesh.new()
    roll_segs = 56
    tube_segs = 10
    z_roll_c = min_z + height * (z_top_frac - 0.006)
    roll_rings = []
    for i in range(roll_segs):
        ang = (i / roll_segs) * math.pi * 2.0
        ca, sa = math.cos(ang), math.sin(ang)
        front_f = max(0.0, -sa)
        # Slightly thicker tucked cloth knots at front-left & front-right of waist
        knot_bulge = 1.0 + 0.38 * front_f * (0.5 + 0.5 * math.cos((ang - 1.5 * math.pi) * 3.0))
        r_tube = height * 0.0115 * knot_bulge
        # Center of waist roll sits just outside the waist surface
        cx_r = ca * (rx_w + height * 0.012)
        cy_r = cy_waist + sa * (ry_w + height * (0.014 if sa >= 0 else 0.013))
        t_ring = []
        for j in range(tube_segs):
            phi = (j / tube_segs) * math.pi * 2.0
            # Subtle spiral twist ridge along the rolled fabric
            twist = 1.0 + 0.14 * math.sin(ang * 10.0 + phi * 2.0)
            rad_out = math.cos(phi) * r_tube * twist
            z_off = math.sin(phi) * r_tube * 1.15 * twist
            vx = cx_r + ca * rad_out
            vy = cy_r + sa * rad_out
            vz = z_roll_c + z_off
            t_ring.append(bm_roll.verts.new((vx, vy, vz)))
        roll_rings.append(t_ring)

    uv_r = bm_roll.loops.layers.uv.verify()
    for i in range(roll_segs):
        ni = (i + 1) % roll_segs
        for j in range(tube_segs):
            nj = (j + 1) % tube_segs
            f = bm_roll.faces.new((
                roll_rings[i][j],
                roll_rings[ni][j],
                roll_rings[ni][nj],
                roll_rings[i][nj],
            ))
            f.loops[0][uv_r].uv = (i / roll_segs * 2.0, j / tube_segs * 0.18 + 0.80)
            f.loops[1][uv_r].uv = ((i + 1) / roll_segs * 2.0, j / tube_segs * 0.18 + 0.80)
            f.loops[2][uv_r].uv = ((i + 1) / roll_segs * 2.0, (j + 1) / tube_segs * 0.18 + 0.80)
            f.loops[3][uv_r].uv = (i / roll_segs * 2.0, (j + 1) / tube_segs * 0.18 + 0.80)
    bmesh.ops.recalc_face_normals(bm_roll, faces=bm_roll.faces)
    roll_mesh = bpy.data.meshes.new("Kerala_Mundu_WaistRoll")
    bm_roll.to_mesh(roll_mesh)
    bm_roll.free()
    for p in roll_mesh.polygons:
        p.use_smooth = True
    roll_obj = bpy.data.objects.new("Kerala_Mundu_WaistRoll", roll_mesh)
    roll_obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(roll_obj)

    # ------------------------------------------------------------------
    # Detail Part 2: Sculpted 3D Front Folded Overlap Flap (Madakku / Neri)
    # ------------------------------------------------------------------
    bm_flap = bmesh.new()
    f_rows = 20
    f_cols = 20
    flap_grid = []
    # For folded farmer mundu (madakki kuthal): broad layered front apron fold with deep vertical/diagonal pleats
    # For full-length mundu: vertical overlapping right-front pleated panel down to the ankle hem
    ang_start = 1.24 * math.pi if (is_short or not is_full) else 1.44 * math.pi
    ang_end = 1.82 * math.pi if (is_short or not is_full) else 1.84 * math.pi
    z_flap_top = min_z + height * (z_top_frac - 0.010)
    z_flap_bot = min_z + height * (z_bot_frac + (0.012 if (is_short or not is_full) else 0.004))

    for ir in range(f_rows + 1):
        tv = ir / f_rows  # 0 = bottom folded edge, 1 = tucked into waist roll
        z_f = z_flap_bot + (z_flap_top - z_flap_bot) * tv
        # Match hip-to-waist contour just outside the main mundu surface
        if tv > 0.65:
            u = (tv - 0.65) / 0.35
            rx_f = (rx_h + pad_side) * (1 - u) + (rx_w + pad_w) * u
            ry_fl = (ry_h + pad_front) * (1 - u) + (ry_w + pad_w) * u
            cy_f = cy_hip * (1 - u) + cy_waist * u
        else:
            rx_f = rx_h + pad_side
            ry_fl = ry_h + pad_front
            cy_f = cy_hip

        row_v = []
        for ic in range(f_cols + 1):
            tu = ic / f_cols  # 0 = left edge of flap -> 1 = right overlapping edge
            ang = ang_start + (ang_end - ang_start) * tu
            ca, sa = math.cos(ang), math.sin(ang)

            # Deep accordion cloth folds (3-4 sculpted vertical/diagonal ridges!)
            edge_fade = math.sin(tu * math.pi) ** 0.45
            pleat_count = 3.5 if (is_short or not is_full) else 2.5
            fold_wave = math.sin(tu * math.pi * 2.0 * pleat_count + (1.0 - tv) * 1.4)
            # Rounded folded pouch lift at bottom hem of madakki kuthal
            pouch = (math.sin(tv * math.pi) * height * 0.009) if (is_short or not is_full) else (height * 0.004)
            # Clear step outside main mundu layer (+0.011*h) + sculpted pleat depth (+0.0075*h)
            rad_off = height * 0.011 + pouch + fold_wave * height * 0.0072 * edge_fade * (1.0 - tv * 0.55)
            # Subtle curved hem lift on folded front flap
            z_curve = height * 0.018 * (1.0 - tv) * (math.sin(tu * math.pi) ** 1.4) if (is_short or not is_full) else 0.0

            x = ca * (rx_f + rad_off)
            y = cy_f + sa * (ry_fl + rad_off)
            row_v.append(bm_flap.verts.new((x, y, z_f + z_curve)))
        flap_grid.append(row_v)

    uv_fl = bm_flap.loops.layers.uv.verify()
    for ir in range(f_rows):
        for ic in range(f_cols):
            f = bm_flap.faces.new((
                flap_grid[ir][ic],
                flap_grid[ir][ic + 1],
                flap_grid[ir + 1][ic + 1],
                flap_grid[ir + 1][ic],
            ))
            f.loops[0][uv_fl].uv = (ic / f_cols * 0.85, ir / f_rows)
            f.loops[1][uv_fl].uv = ((ic + 1) / f_cols * 0.85, ir / f_rows)
            f.loops[2][uv_fl].uv = ((ic + 1) / f_cols * 0.85, (ir + 1) / f_rows)
            f.loops[3][uv_fl].uv = (ic / f_cols * 0.85, (ir + 1) / f_rows)

    bmesh.ops.recalc_face_normals(bm_flap, faces=bm_flap.faces)
    flap_mesh = bpy.data.meshes.new("Kerala_Mundu_FrontFlap")
    bm_flap.to_mesh(flap_mesh)
    bm_flap.free()
    for p in flap_mesh.polygons:
        p.use_smooth = True
    flap_obj = bpy.data.objects.new("Kerala_Mundu_FrontFlap", flap_mesh)
    flap_obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(flap_obj)

    sol_fl = flap_obj.modifiers.new("FlapSolid", "SOLIDIFY")
    sol_fl.thickness = height * 0.0045
    sol_fl.offset = 1.0
    bpy.context.view_layer.objects.active = flap_obj
    bpy.ops.object.modifier_apply(modifier="FlapSolid")

    # Join main mundu + sculpted waist roll + sculpted front folded flap into one clean Kerala_Mundu object
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    roll_obj.select_set(True)
    flap_obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.join()
    return obj


def _build_kalari_lower_wrap(body_obj, min_z, height, mat_lower):
    """Builds fitted knee-length separate-leg Kalari martial dhoti-pants (Uduthuketti) with gold-bordered knee hems."""
    all_pts = _eval_world_verts(body_obj)
    cx_w, cy_w, rx_w, ry_w, _ = slice_body_profile(body_obj, 0.575, min_z, height)
    parts = []

    def _build_tube(name, z_lo_f, z_hi_f, rings, segs, x_filter, v_lo, v_hi, ease):
        bm = bmesh.new()
        v_rings = []
        for ir in range(rings + 1):
            t = ir / rings
            zf = z_lo_f + (z_hi_f - z_lo_f) * t
            zt = min_z + height * zf
            band = height * 0.022
            pts = [p for p in all_pts if abs(p.z - zt) <= band and x_filter(p.x - cx_w)]
            if len(pts) >= 4:
                xs = [p.x for p in pts]
                ys = [p.y for p in pts]
                cx = (min(xs) + max(xs)) * 0.5
                cy = (min(ys) + max(ys)) * 0.5
                rx = max(height * 0.032, (max(xs) - min(xs)) * 0.5)
                ry = max(height * 0.032, (max(ys) - min(ys)) * 0.5)
            else:
                cx, cy, rx, ry = cx_w, cy_w, rx_w * 0.55, ry_w * 0.75
            ring = []
            for iseg in range(segs):
                ang = (iseg / segs) * math.pi * 2.0
                pleat = math.sin(ang * 5.0 + t * 2.5) * height * 0.0028 * (1.0 - t * 0.4)
                x = cx + math.cos(ang) * (rx + ease + pleat)
                y = cy + math.sin(ang) * (ry + ease + pleat)
                ring.append(bm.verts.new((x, y, zt)))
            v_rings.append(ring)
        uv_l = bm.loops.layers.uv.verify()
        for ir in range(rings):
            v0 = v_lo + (v_hi - v_lo) * (ir / rings)
            v1 = v_lo + (v_hi - v_lo) * ((ir + 1) / rings)
            for iseg in range(segs):
                nseg = (iseg + 1) % segs
                f = bm.faces.new((v_rings[ir][iseg], v_rings[ir][nseg], v_rings[ir + 1][nseg], v_rings[ir + 1][iseg]))
                f.loops[0][uv_l].uv = (iseg / segs, v0)
                f.loops[1][uv_l].uv = ((iseg + 1) / segs, v0)
                f.loops[2][uv_l].uv = ((iseg + 1) / segs, v1)
                f.loops[3][uv_l].uv = (iseg / segs, v1)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        for p in mesh.polygons:
            p.use_smooth = True
        obj = bpy.data.objects.new(name, mesh)
        obj.data.materials.append(mat_lower)
        bpy.context.scene.collection.objects.link(obj)
        sol = obj.modifiers.new("Solid", "SOLIDIFY")
        sol.thickness = height * 0.0044
        sol.offset = 1.0
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier="Solid")
        return obj

    # Left and right separate fitted knee-length sleeves (v=0 at knee hem aligns the woven gold/red border)
    parts.append(_build_tube("_KalariLegL", 0.265, 0.500, 14, 24, lambda dx: 0.004 < dx < height * 0.16, 0.0, 0.72, height * 0.011))
    parts.append(_build_tube("_KalariLegR", 0.265, 0.500, 14, 24, lambda dx: -height * 0.16 < dx < -0.004, 0.0, 0.72, height * 0.011))
    # Fitted upper hip wrap bridging seamlessly into the crimson Kacha waist belt
    parts.append(_build_tube("_KalariHip", 0.455, 0.585, 10, 44, lambda dx: abs(dx) < height * 0.15, 0.52, 1.0, height * 0.013))
    return _join_objects(parts, "Kerala_Kalari_Uduthuketti")


def _build_kalari_waist_belt(body_obj, min_z, height, mat_belt):
    """Builds a 4-wrap crimson Kacha waist belt with front-left knot and two hanging sash tails."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(body_obj, depsgraph)
    mw = body_obj.matrix_world
    mw_inv = mw.inverted()
    cx_w, cy_w, rx_w, ry_w, _ = slice_body_profile(body_obj, 0.575, min_z, height)

    parts = []
    ring_steps = 52
    for wi, zf in enumerate((0.550, 0.571, 0.592, 0.613)):
        cxi, cyi, rxi, ryi, zi = slice_body_profile(body_obj, zf, min_z, height)
        raw = [
            Vector((
                cxi + math.cos((k / ring_steps) * math.pi * 2.0) * (rxi + height * 0.022),
                cyi + math.sin((k / ring_steps) * math.pi * 2.0) * (ryi + height * 0.022),
                zi + math.sin((k / ring_steps) * math.pi * 2.0 + wi * 0.55) * height * 0.0032,
            ))
            for k in range(ring_steps)
        ]
        proj_pts, _ = _project_ring_onto_body(raw, bvh, mw, mw_inv, height * (0.0155 + (wi % 2) * 0.0020))
        parts.append(_make_torus_tube(f"_KachaWrap_{wi}", proj_pts, height * 0.0130, mat_belt, segs=12, twist_ridges=2))

    knot_ang = 1.36 * math.pi
    knot_probe = Vector((
        cx_w + math.cos(knot_ang) * (rx_w + height * 0.03),
        cy_w + math.sin(knot_ang) * (ry_w + height * 0.03),
        min_z + height * 0.562,
    ))
    loc, norm, _, _ = bvh.find_nearest(mw_inv @ knot_probe)
    mw_rot_inv_t = mw.to_3x3().inverted().transposed()
    k_pos = (mw @ loc) if loc is not None else knot_probe
    k_norm = (mw_rot_inv_t @ norm).normalized() if norm is not None else Vector((-0.42, -0.90, 0.0))
    k_center = k_pos + k_norm * (height * 0.024)
    side_v = Vector((0.0, 0.0, 1.0)).cross(k_norm).normalized()

    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=height * 0.020, location=k_center)
    knot_obj = bpy.context.active_object
    knot_obj.scale = (1.25, 0.78, 0.92)
    bpy.ops.object.transform_apply(scale=True)
    for p in knot_obj.data.polygons:
        p.use_smooth = True
    knot_obj.data.materials.append(mat_belt)
    parts.append(knot_obj)

    for tail_idx, (x_off, drop_len, flare_x) in enumerate([(-0.012, 0.185, -0.022), (0.014, 0.155, 0.018)]):
        bm_t = bmesh.new()
        t_rows, t_cols = 12, 4
        t_grid = []
        w_top, w_bot = height * 0.016, height * 0.028
        for ir in range(t_rows + 1):
            tv = ir / t_rows
            z_t = k_center.z - drop_len * height * (1.0 - tv)
            sway = flare_x * height * ((1.0 - tv) ** 1.35) + math.sin((1.0 - tv) * math.pi) * height * 0.006
            out_n = height * (0.006 + 0.010 * (1.0 - tv))
            half_w = w_bot * (1.0 - tv) + w_top * tv
            row = []
            for ic in range(t_cols + 1):
                tu = ic / t_cols - 0.5
                p_base = k_center + side_v * (x_off * height + sway + tu * 2.0 * half_w) + k_norm * out_n
                p_base.z = z_t
                row.append(bm_t.verts.new(p_base))
            t_grid.append(row)
        uv_t = bm_t.loops.layers.uv.verify()
        for ir in range(t_rows):
            for ic in range(t_cols):
                f = bm_t.faces.new((t_grid[ir][ic], t_grid[ir][ic + 1], t_grid[ir + 1][ic + 1], t_grid[ir + 1][ic]))
                f.loops[0][uv_t].uv = (ic / t_cols, ir / t_rows)
                f.loops[1][uv_t].uv = ((ic + 1) / t_cols, ir / t_rows)
                f.loops[2][uv_t].uv = ((ic + 1) / t_cols, (ir + 1) / t_rows)
                f.loops[3][uv_t].uv = (ic / t_cols, (ir + 1) / t_rows)
        bmesh.ops.recalc_face_normals(bm_t, faces=bm_t.faces)
        t_mesh = bpy.data.meshes.new(f"_KachaTail_{tail_idx}")
        bm_t.to_mesh(t_mesh)
        bm_t.free()
        for p in t_mesh.polygons:
            p.use_smooth = True
        t_obj = bpy.data.objects.new(f"_KachaTail_{tail_idx}", t_mesh)
        t_obj.data.materials.append(mat_belt)
        bpy.context.scene.collection.objects.link(t_obj)
        t_sol = t_obj.modifiers.new("TailSolid", "SOLIDIFY")
        t_sol.thickness = height * 0.0038
        t_sol.offset = 0.0
        bpy.context.view_layer.objects.active = t_obj
        bpy.ops.object.modifier_apply(modifier="TailSolid")
        parts.append(t_obj)

    return _join_objects(parts, "Kerala_Kalari_Kacha")


def build_fitted_blouse(body_obj, min_z, height, mat):
    """Creates a clean, tailored traditional Kerala cotton blouse directly from the evaluated MPFB2 torso."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = body_obj.evaluated_get(depsgraph)
    blouse_mesh = bpy.data.meshes.new_from_object(
        eval_obj, preserve_all_data_layers=True, depsgraph=depsgraph
    )
    blouse = bpy.data.objects.new("Kerala_Blouse", blouse_mesh)
    blouse.matrix_world = body_obj.matrix_world.copy()
    bpy.context.scene.collection.objects.link(blouse)
    if blouse.data.shape_keys:
        blouse.shape_key_clear()
    blouse.modifiers.clear()

    bm = bmesh.new()
    bm.from_mesh(blouse.data)
    mw = blouse.matrix_world

    xs_torso = [(mw @ v.co).x for v in bm.verts if min_z + height * 0.6 <= (mw @ v.co).z <= min_z + height * 0.78]
    cx = (min(xs_torso) + max(xs_torso)) * 0.5 if xs_torso else 0.0
    ys_torso = [(mw @ v.co).y for v in bm.verts if min_z + height * 0.6 <= (mw @ v.co).z <= min_z + height * 0.78]
    cy = (min(ys_torso) + max(ys_torso)) * 0.5 if ys_torso else 0.0

    z_low = min_z + height * 0.585
    max_arm_x = height * 0.168  # neat above-elbow Kerala blouse half-sleeves (no jagged forearm cuts!)

    to_delete = []
    for v in bm.verts:
        w = mw @ v.co
        dx = abs(w.x - cx)
        # Full shoulder coverage up to base of neck (0.835), with a neat modest round neckline at center chest
        is_front = w.y < cy
        neck_w = height * 0.068
        if dx < neck_w:
            neck_u = 1.0 - (dx / neck_w) ** 2
            z_high = min_z + height * (0.835 - (0.052 if is_front else 0.026) * neck_u)
        else:
            z_high = min_z + height * 0.838
        if w.z < z_low or w.z > z_high or dx > max_arm_x:
            to_delete.append(v)
    bmesh.ops.delete(bm, geom=to_delete, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(blouse.data)
    bm.free()
    for p in blouse.data.polygons:
        p.use_smooth = True

    blouse.data.materials.clear()
    blouse.data.materials.append(mat)

    # Strictly OUTSIDE_SURFACE shrinkwrap with generous 8mm bust/shoulder clearance so ZERO skin pokes through!
    sw = blouse.modifiers.new("BlouseWrap", "SHRINKWRAP")
    sw.target = body_obj
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    sw.wrap_mode = "OUTSIDE_SURFACE"
    sw.offset = height * 0.0082
    sm = blouse.modifiers.new("BlouseSmooth", "SMOOTH")
    sm.factor = 0.4
    sm.iterations = 3
    sw_guard = blouse.modifiers.new("BlouseGuard", "SHRINKWRAP")
    sw_guard.target = body_obj
    sw_guard.wrap_method = "NEAREST_SURFACEPOINT"
    sw_guard.wrap_mode = "OUTSIDE_SURFACE"
    sw_guard.offset = height * 0.0075
    sol = blouse.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = height * 0.0042
    sol.offset = 1.0

    bpy.context.view_layer.objects.active = blouse
    bpy.ops.object.modifier_apply(modifier="BlouseWrap")
    bpy.ops.object.modifier_apply(modifier="BlouseSmooth")
    bpy.ops.object.modifier_apply(modifier="BlouseGuard")
    bpy.ops.object.modifier_apply(modifier="Solidify")
    return blouse


def build_shoulder_cloth(body_obj, min_z, height, mode, mat):
    """Builds a body-conformed Kerala Thorthu / Melmundu or diagonal Neriyathu drape."""
    cx_s, cy_s, rx_s, ry_s, z_sh = slice_body_profile(body_obj, 0.815, min_z, height)
    _, cy_w, rx_w, ry_w, z_wa = slice_body_profile(body_obj, 0.585, min_z, height)

    bm = bmesh.new()
    segs = 30
    cols = 8
    width = height * (0.068 if mode == "thorthu" else 0.115)
    vert_rows = []

    for i in range(segs + 1):
        t = i / segs  # 0 = right waist hem -> 0.5 = over left shoulder -> 1.0 = back hem
        ang = t * math.pi
        if mode == "neriyathu":
            # Authentic diagonal Kerala Neriyathu: starts tucked at right waist (+X), sweeps diagonally
            # across the chest up over the left shoulder (-X), and drapes down the left back
            if t < 0.5:
                u_front = t * 2.0
                x_center = cx_s + (rx_w * 0.92) * (1.0 - u_front) + (-rx_s * 0.72) * u_front
            else:
                x_center = cx_s - rx_s * 0.72
            z = z_wa + (z_sh - z_wa + height * 0.042) * math.sin(ang)
            y = cy_s - (ry_s + height * 0.075) * math.cos(ang)
        elif mode == "melmundu":
            # Traditional Kerala Elder/Landlord Melmundu: wider folded Kasavu shawl draped over left shoulder
            x_center = cx_s - rx_s * 0.50
            z_low = z_wa + height * 0.035
            z = z_low + (z_sh - z_low + height * 0.048) * math.sin(ang)
            y = cy_s - (ry_s + height * 0.068) * math.cos(ang)
        else:
            x_center = cx_s - rx_s * 0.48
            z_low = z_wa + height * 0.095
            z = z_low + (z_sh - z_low + height * 0.045) * math.sin(ang)
            y = cy_s - (ry_s + height * 0.062) * math.cos(ang)

        row = []
        for j in range(cols + 1):
            u = j / cols
            x = x_center + (u - 0.5) * width
            row.append(bm.verts.new((x, y, z)))
        vert_rows.append(row)

    uv_layer = bm.loops.layers.uv.verify()
    for i in range(segs):
        for j in range(cols):
            f = bm.faces.new((
                vert_rows[i][j],
                vert_rows[i][j + 1],
                vert_rows[i + 1][j + 1],
                vert_rows[i + 1][j],
            ))
            f.loops[0][uv_layer].uv = (j / cols, i / segs)
            f.loops[1][uv_layer].uv = ((j + 1) / cols, i / segs)
            f.loops[2][uv_layer].uv = ((j + 1) / cols, (i + 1) / segs)
            f.loops[3][uv_layer].uv = (j / cols, (i + 1) / segs)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("Kerala_ShoulderCloth")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True

    obj = bpy.data.objects.new("Kerala_ShoulderCloth", mesh)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)

    outer_offset = height * (0.0165 if mode == "neriyathu" else 0.0095)
    sw1 = obj.modifiers.new("DrapeWrap1", "SHRINKWRAP")
    sw1.target = body_obj
    sw1.wrap_method = "NEAREST_SURFACEPOINT"
    sw1.wrap_mode = "OUTSIDE_SURFACE"
    sw1.offset = outer_offset + height * 0.002

    sm = obj.modifiers.new("DrapeSmooth", "SMOOTH")
    sm.factor = 0.45
    sm.iterations = 3

    sw2 = obj.modifiers.new("DrapePushOut", "SHRINKWRAP")
    sw2.target = body_obj
    sw2.wrap_method = "NEAREST_SURFACEPOINT"
    sw2.wrap_mode = "OUTSIDE_SURFACE"
    sw2.offset = outer_offset

    sol = obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = height * 0.004
    sol.offset = 1.0

    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="DrapeWrap1")
    bpy.ops.object.modifier_apply(modifier="DrapeSmooth")
    bpy.ops.object.modifier_apply(modifier="DrapePushOut")
    bpy.ops.object.modifier_apply(modifier="Solidify")
    return obj


def _make_hair_material(name, rgb):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.72
    return mat


def build_kerala_hair(body_obj, min_z, height, gender, is_elder=False):
    """Builds a clean, smooth sculpted Kerala hairstyle (+ bun for women) fitted tightly to the evaluated MPFB2 skull."""
    root = body_obj.parent if (body_obj.parent and body_obj.parent.type == "ARMATURE") else body_obj
    for obj in [body_obj, *root.children, *body_obj.children]:
        if obj.type == "MESH" and "hair" in obj.name.lower() and not obj.name.startswith("Kerala_"):
            return []  # User already applied a real MPFB2 hair asset!

    hair_rgb = (0.30, 0.29, 0.28) if is_elder else (0.03, 0.022, 0.018)
    hair_mat = _make_hair_material("Mat_Kerala_Hair", hair_rgb)
    created = []

    # Measure exact evaluated skull bounds (includes female/male MPFB2 shape keys!)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = body_obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    mw = body_obj.matrix_world
    all_pts = [mw @ v.co for v in eval_mesh.vertices]
    eval_obj.to_mesh_clear()
    if not all_pts:
        return []

    max_z = max(p.z for p in all_pts)
    head_pts = [p for p in all_pts if p.z >= max_z - height * 0.095]
    if not head_pts:
        return []
    cx_h = (min(p.x for p in head_pts) + max(p.x for p in head_pts)) * 0.5
    crown_pts = [
        p for p in head_pts
        if p.z >= max_z - height * 0.068 and abs(p.x - cx_h) < height * 0.065
    ]
    if not crown_pts:
        crown_pts = head_pts

    rx_h = max(height * 0.042, (max(p.x for p in crown_pts) - min(p.x for p in crown_pts)) * 0.5)
    y_front = min(p.y for p in crown_pts)
    y_back = max(p.y for p in crown_pts)
    cy_h = (y_front + y_back) * 0.5
    ry_h = max(height * 0.048, (y_back - y_front) * 0.5)
    cz_h = max_z - height * 0.056
    rz_h = height * 0.060

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=1.0)
    to_del = []
    for v in bm.verts:
        nx, ny, nz = v.co.x, v.co.y, v.co.z
        # Natural curved hairline: forehead (-Y), framing temples on sides (|nx|), sweeping down to nape (+Y)
        if gender == "F":
            side_frame = -0.32 * (nx * nx)
            hairline_z = 0.14 * max(0.0, -ny) - 0.56 * max(0.0, ny) + side_frame - 0.04
            vol = 1.07 + 0.03 * max(0.0, nz) + 0.04 * max(0.0, ny) + 0.025 * (nx * nx)
        else:
            hairline_z = 0.25 * max(0.0, -ny) - 0.32 * max(0.0, ny) + 0.02
            vol = 1.05 + 0.025 * max(0.0, nz) + 0.02 * max(0.0, ny)
        if nz < hairline_z:
            to_del.append(v)
            continue
        x = cx_h + nx * (rx_h * vol)
        y = cy_h + ny * (ry_h * vol) + height * 0.002
        z = cz_h + nz * (rz_h * vol)
        v.co = Vector((x, y, z))
    bmesh.ops.delete(bm, geom=to_del, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    hair_mesh = bpy.data.meshes.new("Kerala_Hair")
    bm.to_mesh(hair_mesh)
    bm.free()
    for p in hair_mesh.polygons:
        p.use_smooth = True
    hair_obj = bpy.data.objects.new("Kerala_Hair", hair_mesh)
    hair_obj.data.materials.append(hair_mat)
    bpy.context.scene.collection.objects.link(hair_obj)

    sw = hair_obj.modifiers.new("HairWrap", "SHRINKWRAP")
    sw.target = body_obj
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    sw.wrap_mode = "OUTSIDE_SURFACE"
    sw.offset = height * (0.0075 if gender == "F" else 0.0045)
    sm = hair_obj.modifiers.new("HairSmooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = 4
    sol = hair_obj.modifiers.new("HairThick", "SOLIDIFY")
    sol.thickness = height * 0.0065
    sol.offset = 1.0
    bpy.context.view_layer.objects.active = hair_obj
    bpy.ops.object.modifier_apply(modifier="HairWrap")
    bpy.ops.object.modifier_apply(modifier="HairSmooth")
    bpy.ops.object.modifier_apply(modifier="HairThick")
    created.append(hair_obj)

    if gender == "F":
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=18,
            ring_count=12,
            radius=height * 0.036,
            location=(cx_h, y_back + height * 0.014, max_z - height * 0.078),
        )
        bun = bpy.context.active_object
        bun.name = "Kerala_HairBun"
        bun.scale = (1.12, 0.88, 0.88)
        bpy.ops.object.transform_apply(scale=True)
        for p in bun.data.polygons:
            p.use_smooth = True
        bun.data.materials.append(hair_mat)
        created.append(bun)

    return created


def _make_gold_material(name="Mat_Kerala_Gold"):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (480, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (200, 0)
    bsdf.inputs["Roughness"].default_value = 0.24
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 0.90
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    res = 256
    img_name = f"KeralaGold_{name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    img = bpy.data.images.new(img_name, width=res, height=res, alpha=False)
    px = [0.0] * (res * res * 4)
    rng = random.Random(2200)
    for y in range(res):
        v = y / res
        for x in range(res):
            u = x / res
            shimmer = math.sin(u * 38.0 + v * 19.0) * 0.025 + (rng.random() - 0.5) * 0.018
            idx = (y * res + x) * 4
            px[idx]     = max(0.0, min(1.0, 0.92 + shimmer))
            px[idx + 1] = max(0.0, min(1.0, 0.72 + shimmer * 0.85))
            px[idx + 2] = max(0.0, min(1.0, 0.20 + shimmer * 0.4))
            px[idx + 3] = 1.0
    img.pixels.foreach_set(px)
    img.pack()

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (-80, 80)
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def _make_ruby_material(name="Mat_Kerala_GoldRuby"):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.58, 0.03, 0.06, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.16
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.15
    return mat


def _make_torus_tube(name, ring_pts, tube_radius, mat, segs=10, twist_ridges=0, bead_wave=0.0):
    """Builds a smooth or braided/beaded closed 3D gold ring/chain along ring_pts."""
    bm = bmesh.new()
    n = len(ring_pts)
    rings = []
    for i in range(n):
        p_prev = ring_pts[(i - 1) % n]
        p_curr = ring_pts[i]
        p_next = ring_pts[(i + 1) % n]
        tang = (p_next - p_prev).normalized()
        up = Vector((0, 0, 1)) if abs(tang.z) < 0.9 else Vector((1, 0, 0))
        binorm = tang.cross(up).normalized()
        norm = binorm.cross(tang).normalized()
        bead_mul = 1.0 + bead_wave * math.sin((i / n) * math.pi * 2.0 * 32.0) if bead_wave > 0 else 1.0
        t_ring = []
        for j in range(segs):
            ang = (j / segs) * math.pi * 2.0
            ridge = 1.0 + 0.16 * math.sin(ang * twist_ridges + (i / n) * math.pi * 2.0 * 14.0) if twist_ridges > 0 else 1.0
            r_eff = tube_radius * bead_mul * ridge
            pt = p_curr + (norm * math.cos(ang) + binorm * math.sin(ang)) * r_eff
            t_ring.append(bm.verts.new(pt))
        rings.append(t_ring)
    uv_l = bm.loops.layers.uv.verify()
    for i in range(n):
        ni = (i + 1) % n
        for j in range(segs):
            nj = (j + 1) % segs
            f = bm.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj]))
            f.loops[0][uv_l].uv = (i / n, j / segs)
            f.loops[1][uv_l].uv = ((i + 1) / n, j / segs)
            f.loops[2][uv_l].uv = ((i + 1) / n, (j + 1) / segs)
            f.loops[3][uv_l].uv = (i / n, (j + 1) / segs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _project_ring_onto_body(pts, bvh, mw, mw_inv, offset):
    """Projects each centerline point onto the evaluated body surface + outward normal offset,
    smoothing 2 passes so chains drape flush with zero squashing, floating, or clipping."""
    mw_rot = mw.to_3x3()
    mw_rot_inv_t = mw_rot.inverted().transposed()
    cur = list(pts)
    for _ in range(2):
        projected = []
        for p in cur:
            loc, norm, _, _ = bvh.find_nearest(mw_inv @ p)
            if loc is not None and norm is not None:
                w_loc = mw @ loc
                w_norm = (mw_rot_inv_t @ norm).normalized()
                projected.append(w_loc + w_norm * offset)
            else:
                projected.append(p)
        # Smooth along the ring so it flows smoothly over collarbones & chest
        n = len(projected)
        cur = [
            projected[(i - 1) % n] * 0.22 + projected[i] * 0.56 + projected[(i + 1) % n] * 0.22
            for i in range(n)
        ]
    # Final exact surface seating pass
    out_pts, out_norms = [], []
    for p in cur:
        loc, norm, _, _ = bvh.find_nearest(mw_inv @ p)
        if loc is not None and norm is not None:
            w_loc = mw @ loc
            w_norm = (mw_rot_inv_t @ norm).normalized()
            out_pts.append(w_loc + w_norm * offset)
            out_norms.append(w_norm)
        else:
            out_pts.append(p)
            out_norms.append(Vector((0, -1, 0)))
    return out_pts, out_norms


def _oriented_disc(name, center, normal, radius, thickness, mat, verts=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=radius, radius2=radius * 0.92, depth=thickness)
    n_dir = normal.normalized()
    q = Vector((0, 0, 1)).rotation_difference(n_dir)
    rot_m = q.to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ rot_m, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv_l = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            lp[uv_l].uv = (0.5, 0.5)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _join_objects(objs, final_name):
    if not objs:
        return None
    if len(objs) == 1:
        objs[0].name = final_name
        return objs[0]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    res = bpy.context.active_object
    res.name = final_name
    return res


def build_landlord_gold_ornaments(body_obj, min_z, height):
    """Builds BVH-fitted, richly detailed 18th-century Kerala Jenmi 22K gold ornaments:
    1) Kasu Mala (22 embossed gold coins on chain), 2) Heavy braided Swarna Mala +
    ornate multi-layer temple Pathakkam medallion with ruby center & dangling gold beads,
    3) True 3D arm-axis Tholvala armlets with lotus crest, 4) Stacked Swarna Vala wrist
    bangles (works in both T-pose & A-pose!), and 5) BVH-seated Kadukkan ear studs."""
    gold_mat = _make_gold_material("Mat_Kerala_Gold")
    ruby_mat = _make_ruby_material("Mat_Kerala_GoldRuby")
    created = []
    all_pts = _eval_world_verts(body_obj)
    if not all_pts:
        return created

    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(body_obj, depsgraph)
    mw = body_obj.matrix_world
    mw_inv = mw.inverted()
    mw_rot_inv_t = mw.to_3x3().inverted().transposed()

    cx_n, cy_n, rx_n, ry_n, z_neck = slice_body_profile(body_obj, 0.835, min_z, height)
    _, cy_ch, rx_ch, ry_ch, _ = slice_body_profile(body_obj, 0.745, min_z, height)

    # ------------------------------------------------------------------
    # 1) Chain 1 — Authentic Kerala Kasu Mala (Gold Coin Necklace)
    # ------------------------------------------------------------------
    kasu_raw = []
    steps = 56
    for i in range(steps):
        ang = (i / steps) * math.pi * 2.0
        ca, sa = math.cos(ang), math.sin(ang)
        front_f = max(0.0, -sa)
        x = cx_n + ca * (rx_n * 1.18 + front_f * height * 0.022)
        z = z_neck + height * 0.004 - (height * 0.072) * (front_f ** 1.3)
        y = (cy_n * (1.0 - front_f) + cy_ch * front_f) + sa * ((ry_n * 1.15) * (1.0 - front_f) + (ry_ch + height * 0.015) * front_f)
        kasu_raw.append(Vector((x, y, z)))
    kasu_pts, kasu_norms = _project_ring_onto_body(kasu_raw, bvh, mw, mw_inv, height * 0.0055)
    kasu_parts = [_make_torus_tube("Kerala_KasuChain", kasu_pts, height * 0.0034, gold_mat, segs=8, bead_wave=0.14)]
    # Add 22 embossed overlapping gold coins (Kasu) along the front chest arc
    for i in range(steps):
        p = kasu_pts[i]
        n = kasu_norms[i]
        if n.y < -0.25 and (i % 2 == 0):
            coin_pos = p + n * (height * 0.0025) - Vector((0, 0, height * 0.0075))
            kasu_parts.append(_oriented_disc(f"_Kasu_{i}", coin_pos, n, height * 0.0072, height * 0.0022, gold_mat, verts=12))
    kasu_obj = _join_objects(kasu_parts, "Kerala_Gold_KasuMala")
    if kasu_obj:
        created.append(kasu_obj)

    # ------------------------------------------------------------------
    # 2) Chain 2 — Heavy Braided Swarna Mala + Multi-Layer Temple Medallion
    # ------------------------------------------------------------------
    mala_raw = []
    for i in range(steps):
        ang = (i / steps) * math.pi * 2.0
        ca, sa = math.cos(ang), math.sin(ang)
        front_f = max(0.0, -sa)
        x = cx_n + ca * (rx_n * 1.32 + front_f * height * 0.032)
        z = z_neck + height * 0.002 - (height * 0.132) * (front_f ** 1.35)
        y = (cy_n * (1.0 - front_f) + cy_ch * front_f) + sa * ((ry_n * 1.18) * (1.0 - front_f) + (ry_ch + height * 0.022) * front_f)
        mala_raw.append(Vector((x, y, z)))
    mala_pts, mala_norms = _project_ring_onto_body(mala_raw, bvh, mw, mw_inv, height * 0.0072)
    mala_parts = [_make_torus_tube("Kerala_SwarnaMala", mala_pts, height * 0.0052, gold_mat, segs=10, twist_ridges=3)]

    # Find lowest front-center point of Swarna Mala for ornate Kerala temple medallion (Pathakkam)
    med_idx = min(range(steps), key=lambda k: mala_pts[k].z if mala_norms[k].y < -0.2 else 999.0)
    med_p = mala_pts[med_idx]
    med_n = mala_norms[med_idx].normalized()
    med_c = med_p + med_n * (height * 0.004) - Vector((0, 0, height * 0.012))
    # Multi-layer medallion: outer sculpted gold disc + raised inner bezel + ruby center gem + 12 rim beads + 3 dangling drops
    mala_parts.append(_oriented_disc("_MedBase", med_c, med_n, height * 0.021, height * 0.0045, gold_mat, verts=20))
    mala_parts.append(_oriented_disc("_MedInner", med_c + med_n * (height * 0.003), med_n, height * 0.0135, height * 0.0035, gold_mat, verts=16))
    mala_parts.append(_oriented_disc("_MedRuby", med_c + med_n * (height * 0.0052), med_n, height * 0.0082, height * 0.003, ruby_mat, verts=14))
    # Orthonormal basis on medallion plane for rim beads & dangling bell drops
    up_m = Vector((0, 0, 1))
    right_m = up_m.cross(med_n).normalized()
    up_plane = med_n.cross(right_m).normalized()
    for b in range(12):
        ba = (b / 12) * math.pi * 2.0
        bp = med_c + (right_m * math.cos(ba) + up_plane * math.sin(ba)) * (height * 0.0205) + med_n * (height * 0.002)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=height * 0.0032, location=bp)
        bead = bpy.context.active_object
        bead.data.materials.append(gold_mat)
        mala_parts.append(bead)
    for dx_drop, dz_drop in [(-0.011, -0.026), (0.0, -0.030), (0.011, -0.026)]:
        dp = med_c + right_m * (height * dx_drop) + up_plane * (height * dz_drop)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=height * 0.0038, location=dp)
        drop = bpy.context.active_object
        drop.scale = (0.85, 0.85, 1.35)
        bpy.ops.object.transform_apply(scale=True)
        drop.data.materials.append(gold_mat)
        mala_parts.append(drop)
    mala_obj = _join_objects(mala_parts, "Kerala_Gold_SwarnaMala")
    if mala_obj:
        created.append(mala_obj)

    # ------------------------------------------------------------------
    # 3) Local-Bone-Axis + Narrowest-Wrist-Pinch + BVH-Hugged Armlets & Vala Bangles
    #    Automatically finds the exact wrist pinch & local forearm angle so Vala
    #    hugs the wrist tightly in both T-pose and MPFB2 A-pose!
    # ------------------------------------------------------------------
    torso_half_w = max(rx_ch, height * 0.115)
    for side_label, sign in [("L", 1.0), ("R", -1.0)]:
        arm_all = [
            p for p in all_pts
            if sign * (p.x - cx_n) > torso_half_w + height * 0.025 and p.z > min_z + height * 0.36
        ]
        if len(arm_all) < 24:
            continue
        arm_all.sort(key=lambda p: sign * (p.x - cx_n))
        p_sh = sum(arm_all[:12], Vector((0, 0, 0))) / 12.0
        p_tip = arm_all[-1]
        arm_vec = p_tip - p_sh
        arm_len = arm_vec.length
        if arm_len < height * 0.15:
            continue
        coarse_dir = arm_vec / arm_len

        def coarse_slice_info(t_frac):
            s = t_frac * arm_len
            pts = [p for p in arm_all if abs((p - p_sh).dot(coarse_dir) - s) < height * 0.015]
            if len(pts) < 6:
                return None, 999.0
            c = sum(pts, Vector((0, 0, 0))) / len(pts)
            rad = sum((p - c).length for p in pts) / len(pts)
            return c, rad

        # 1) Auto-detect exact wrist location = narrowest pinch between t = 0.62 .. 0.84
        best_wrist_t = 0.74
        best_wrist_rad = 999.0
        for step_k in range(19):
            tf = 0.62 + step_k * 0.012
            c_s, r_s = coarse_slice_info(tf)
            if c_s is not None and r_s < best_wrist_rad:
                best_wrist_rad = r_s
                best_wrist_t = tf

        # 2) Compute true LOCAL upper-arm axis & LOCAL forearm axis (handles natural elbow bend!)
        c_up1, _ = coarse_slice_info(0.14)
        c_up2, _ = coarse_slice_info(0.32)
        upper_dir = (c_up2 - c_up1).normalized() if (c_up1 and c_up2 and (c_up2 - c_up1).length > 1e-4) else coarse_dir

        c_fo1, _ = coarse_slice_info(max(0.45, best_wrist_t - 0.14))
        c_fo2, _ = coarse_slice_info(best_wrist_t)
        forearm_dir = (c_fo2 - c_fo1).normalized() if (c_fo1 and c_fo2 and (c_fo2 - c_fo1).length > 1e-4) else coarse_dir

        def fit_local_ring(center_pt, axis_dir, tube_r, band_name, twist=0, bead_w=0.0, add_crest=False):
            if center_pt is None:
                return []
            ref_up = Vector((0, 0, 1)) if abs(axis_dir.z) < 0.9 else Vector((0, 1, 0))
            u_loc = axis_dir.cross(ref_up).normalized()
            v_loc = axis_dir.cross(u_loc).normalized()
            # Measure exact skin cross-section perpendicular to the local bone axis
            slice_pts = [
                p for p in arm_all
                if abs((p - center_pt).dot(axis_dir)) < height * 0.014
                and (p - center_pt).length < height * 0.095
            ]
            if len(slice_pts) < 6:
                return []
            us = [(p - center_pt).dot(u_loc) for p in slice_pts]
            vs = [(p - center_pt).dot(v_loc) for p in slice_pts]
            uc = (min(us) + max(us)) * 0.5
            vc = (min(vs) + max(vs)) * 0.5
            true_c = center_pt + u_loc * uc + v_loc * vc
            ru = max(height * 0.012, (max(us) - min(us)) * 0.5) + tube_r + height * 0.0018
            rv = max(height * 0.012, (max(vs) - min(vs)) * 0.5) + tube_r + height * 0.0018

            # Build initial ring in exact perpendicular plane, then BVH-hug to eliminate any loose gap
            raw_pts = []
            for k in range(28):
                a = (k / 28) * math.pi * 2.0
                dir_rad = u_loc * math.cos(a) + v_loc * math.sin(a)
                probe = true_c + u_loc * (math.cos(a) * ru) + v_loc * (math.sin(a) * rv)
                loc, norm, _, _ = bvh.find_nearest(mw_inv @ probe)
                if loc is not None:
                    w_loc = mw @ loc
                    # Keep point strictly in the perpendicular plane of the bangle while matching exact skin radius
                    skin_r = max(height * 0.012, (w_loc - true_c).dot(dir_rad))
                    raw_pts.append(true_c + dir_rad * (skin_r + tube_r + height * 0.0018))
                else:
                    raw_pts.append(probe)
            # Smooth 1 pass so bangle stays a crisp rigid forged-gold ring
            n_r = len(raw_pts)
            r_pts = [
                raw_pts[(k - 1) % n_r] * 0.25 + raw_pts[k] * 0.50 + raw_pts[(k + 1) % n_r] * 0.25
                for k in range(n_r)
            ]

            parts = [_make_torus_tube(band_name, r_pts, tube_r, gold_mat, segs=10, twist_ridges=twist, bead_wave=bead_w)]
            if add_crest:
                crest_n = (-u_loc * 0.35 + v_loc * 0.94).normalized()
                if crest_n.z < 0:
                    crest_n = -crest_n
                crest_p = true_c + crest_n * (max(ru, rv) + tube_r * 0.55)
                parts.append(_oriented_disc(f"{band_name}_Crest", crest_p, crest_n, height * 0.011, height * 0.0038, gold_mat, verts=14))
                parts.append(_oriented_disc(f"{band_name}_Gem", crest_p + crest_n * (height * 0.0026), crest_n, height * 0.0052, height * 0.0024, ruby_mat, verts=12))
            return parts

        # Upper-arm Tholvala / Vanki armlet (perpendicular to local upper arm)
        c_armlet, _ = coarse_slice_info(0.24)
        armlet_parts = []
        if c_armlet is not None:
            armlet_parts.extend(fit_local_ring(c_armlet, upper_dir, height * 0.0040, f"_ArmletA_{side_label}", twist=2, add_crest=True))
            armlet_parts.extend(fit_local_ring(c_armlet + upper_dir * (height * 0.012), upper_dir, height * 0.0030, f"_ArmletB_{side_label}", bead_w=0.18))
        armlet_obj = _join_objects(armlet_parts, f"Kerala_Gold_Tholvala_{side_label}")
        if armlet_obj:
            created.append(armlet_obj)

        # Stacked Swarna Vala wrist bangles (snug right on the exact narrowest wrist pinch!)
        bangle_parts = []
        if c_fo2 is not None:
            bangle_parts.extend(fit_local_ring(c_fo2 - forearm_dir * (height * 0.006), forearm_dir, height * 0.0042, f"_BangleA_{side_label}", twist=3))
            bangle_parts.extend(fit_local_ring(c_fo2 - forearm_dir * (height * 0.019), forearm_dir, height * 0.0032, f"_BangleB_{side_label}", bead_w=0.22))
        bangle_obj = _join_objects(bangle_parts, f"Kerala_Gold_Bangles_{side_label}")
        if bangle_obj:
            created.append(bangle_obj)

    # ------------------------------------------------------------------
    # 4) BVH-Seated Traditional Kerala Gold Ear Studs (Kadukkan) + Ruby Center
    # ------------------------------------------------------------------
    max_z = max(p.z for p in all_pts)
    ear_z_lo = max_z - height * 0.082
    ear_z_hi = max_z - height * 0.056
    ear_band = [p for p in all_pts if ear_z_lo <= p.z <= ear_z_hi and abs(p.x - cx_n) > height * 0.036]
    for side_label, sign in [("L", 1.0), ("R", -1.0)]:
        side_ears = [p for p in ear_band if sign * (p.x - cx_n) > 0]
        if not side_ears:
            continue
        # Bottom-outermost point of the ear lobe
        lobe = max(side_ears, key=lambda p: sign * p.x - (p.z - ear_z_lo) * 0.6)
        loc, norm, _, _ = bvh.find_nearest(mw_inv @ lobe)
        w_pos = (mw @ loc) if loc is not None else lobe
        w_norm = (mw_rot_inv_t @ norm).normalized() if norm is not None else Vector((sign, 0, 0))
        out_dir = (Vector((sign * 0.85, -0.35, -0.15)) + w_norm * 0.4).normalized()
        stud_c = w_pos + out_dir * (height * 0.0032)
        stud_parts = [
            _oriented_disc(f"_KadukkanBase_{side_label}", stud_c, out_dir, height * 0.0068, height * 0.0032, gold_mat, verts=14),
            _oriented_disc(f"_KadukkanRuby_{side_label}", stud_c + out_dir * (height * 0.0022), out_dir, height * 0.0034, height * 0.002, ruby_mat, verts=10),
        ]
        stud_obj = _join_objects(stud_parts, f"Kerala_Gold_Kadukkan_{side_label}")
        if stud_obj:
            created.append(stud_obj)

    return created


# ------------------------------------------------------------------------------
# 3. Main Execution: Dress Selected MPFB2 Human & Export Mixamo-Ready FBX
# ------------------------------------------------------------------------------
def _is_human_mesh(obj):
    if obj is None or obj.type != "MESH" or obj.name.startswith("Kerala_"):
        return False
    if len(obj.data.vertices) < 1500:
        return False
    mw = obj.matrix_world
    xs = [(mw @ v.co).x for v in obj.data.vertices]
    zs = [(mw @ v.co).z for v in obj.data.vertices]
    h = max(zs) - min(zs)
    w = max(xs) - min(xs)
    if h < 0.05:
        return False
    aspect = w / h
    # Human standing in T/A-pose has width/height roughly 0.25..1.45 (unlike wide floor slabs where aspect > 3)
    has_mpfb = any("mpfb" in k.lower() for k in obj.keys()) or any(
        k in obj.name.lower() for k in ("human", "basemesh", "male", "female", "body")
    )
    return (0.2 <= aspect <= 1.5) and (has_mpfb or (0.8 <= h <= 25.0))


def _find_mpfb_human():
    active = bpy.context.active_object
    if active is not None:
        if active.type == "ARMATURE":
            mesh_children = [c for c in active.children if _is_human_mesh(c)]
            if mesh_children:
                return max(mesh_children, key=lambda o: len(o.data.vertices))
        elif _is_human_mesh(active):
            return active

    # Auto-locate MPFB2 human anywhere in the scene if nothing (or another object) is selected
    candidates = [o for o in bpy.data.objects if _is_human_mesh(o)]
    if candidates:
        candidates.sort(
            key=lambda o: (
                any("mpfb" in k.lower() for k in o.keys()),
                any(k in o.name.lower() for k in ("human", "basemesh")),
                len(o.data.vertices),
            ),
            reverse=True,
        )
        return candidates[0]
    return None


def main():
    body = _find_mpfb_human()
    if body is None and hasattr(bpy.ops, "mpfb") and hasattr(bpy.ops.mpfb, "create_human"):
        # No human in scene yet — spawn a fresh MPFB2 T-pose human automatically!
        try:
            bpy.ops.mpfb.create_human()
            bpy.context.view_layer.update()
            body = _find_mpfb_human()
        except Exception as exc:
            print(f"Auto-create MPFB2 human skipped: {exc}")

    if body is None:
        meshes = [f"{o.name} ({len(o.data.vertices)}v)" for o in bpy.data.objects if o.type == "MESH"]
        raise RuntimeError(
            f"No MPFB2 human found in this scene (meshes present: {meshes}). "
            "In Blender, press N -> MPFB tab -> New Human -> From scratch -> click 'Create human', "
            "then run this script again!"
        )

    preset = PRESETS.get(OUTFIT_PRESET)
    if not preset:
        raise RuntimeError(f"Unknown OUTFIT_PRESET '{OUTFIT_PRESET}'. Choose from: {list(PRESETS.keys())}")

    # Remove any previously generated Kerala_* garments so re-running never duplicates clothes
    for old in list(bpy.data.objects):
        if old.name.startswith("Kerala_"):
            bpy.data.objects.remove(old, do_unlink=True)

    # 1) Morph the real MPFB2 human directly to Male (gender=1.0) or Female (gender=0.0)!
    #    MPFB2 spawns at neutral 0.5 (which looks female-leaning) unless we set macro details.
    mpfb_morphed = False
    for mod_name, mod in list(sys.modules.items()):
        if mod_name.endswith(".entities.objectproperties") and hasattr(mod, "HumanObjectProperties"):
            mpfb_root = mod_name[: -len(".entities.objectproperties")]
            ts_mod = sys.modules.get(f"{mpfb_root}.services.targetservice")
            if ts_mod and hasattr(ts_mod, "TargetService"):
                try:
                    HOP = mod.HumanObjectProperties
                    TS = ts_mod.TargetService
                    is_male = preset["gender"] == "M"
                    is_elder = ("elder" in OUTFIT_PRESET) or (OUTFIT_PRESET == "kalari_guru")
                    is_landlord = OUTFIT_PRESET == "landlord"
                    is_kalari = OUTFIT_PRESET == "kalari_student"
                    is_guru = OUTFIT_PRESET == "kalari_guru"
                    is_guard = OUTFIT_PRESET == "guard"
                    is_karyasthan = OUTFIT_PRESET == "karyasthan"
                    is_priest = OUTFIT_PRESET == "temple_priest"
                    is_fisherman = OUTFIT_PRESET == "fisherman"
                    HOP.set_value("gender", 1.0 if is_male else 0.0, entity_reference=body)
                    HOP.set_value("muscle", (0.84 if is_kalari else 0.80 if is_guard else 0.76 if is_fisherman else 0.72 if is_guru else 0.40 if is_priest else 0.46 if is_karyasthan else 0.48 if is_elder else 0.42 if is_landlord else 0.68) if is_male else (0.36 if is_elder else 0.42), entity_reference=body)
                    HOP.set_value("weight", 1.0 if is_landlord else 0.38 if is_kalari else 0.50 if is_guard else 0.48 if is_priest else 0.46 if is_karyasthan else 0.44 if is_guru else 0.42 if is_fisherman else 0.50, entity_reference=body)
                    HOP.set_value("proportions", 0.72 if is_landlord else 0.50, entity_reference=body)
                    HOP.set_value("asian", 0.65, entity_reference=body)
                    HOP.set_value("age", 0.28 if is_kalari else 0.42 if is_guard else 0.48 if is_fisherman else 0.72 if is_priest else 0.68 if is_karyasthan else 0.78 if is_guru else 0.84 if is_elder else 0.64 if is_landlord else 0.56, entity_reference=body)
                    TS.reapply_macro_details(body)
                    bpy.context.view_layer.update()
                    mpfb_morphed = True
                    print(f"Applied real MPFB2 {'Male (gender=1.0)' if is_male else 'Female (gender=0.0)'} phenotype!")
                except Exception as exc:
                    print(f"MPFB2 phenotype morph skipped: {exc}")
            break

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_body = body.evaluated_get(depsgraph)
    eval_mesh = eval_body.to_mesh()
    mw = body.matrix_world
    zs = [(mw @ v.co).z for v in eval_mesh.vertices]
    eval_body.to_mesh_clear()
    min_z, max_z = min(zs), max(zs)
    height = max(0.5, max_z - min_z)

    # Remove any old landlord belly shape key so re-running never double-bloats
    if body.data.shape_keys and "Kerala_LandlordBelly" in body.data.shape_keys.key_blocks:
        body.shape_key_remove(body.data.shape_keys.key_blocks["Kerala_LandlordBelly"])

    # 1b) Additive Shape Key for authentic prosperous Kerala Landlord (Jenmi) belly fat!
    #     Using a dedicated Shape Key guarantees it stacks cleanly ON TOP of MPFB2 macro shape keys.
    if OUTFIT_PRESET == "landlord":
        if not body.data.shape_keys:
            body.shape_key_add(name="Basis", from_mix=False)
        belly_sk = body.shape_key_add(name="Kerala_LandlordBelly", from_mix=False)
        belly_sk.value = 1.0
        mw_inv = mw.inverted()
        eval_pts = _eval_world_verts(body)
        _, cy_belly, rx_b, ry_b, _ = slice_body_profile(body, 0.61, min_z, height)
        for idx_v, w_orig in enumerate(eval_pts):
            zf = (w_orig.z - min_z) / height
            # Span lower hips (0.50) up to lower chest (0.76) so belly fat transitions naturally
            if 0.50 <= zf <= 0.76 and abs(w_orig.x) < height * 0.165:
                # Asymmetric gravity curve: peaks around lower-mid belly (zf ~ 0.60)
                u_z = (zf - 0.50) / 0.26
                tz = (math.sin(u_z * math.pi) ** 1.15) * (1.18 - 0.35 * u_z)
                tx = math.cos(min(1.0, abs(w_orig.x) / (height * 0.165)) * math.pi * 0.5)
                front_w = max(0.0, min(1.0, (cy_belly + height * 0.035 - w_orig.y) / max(0.04, ry_b + height * 0.035)))
                # Round protruding potbelly (-Y forward) + natural lower-belly gravity drop (-Z) + side love handles (+|X|)
                bulge_y = height * 0.095 * tz * (tx ** 0.85) * (0.25 + 0.75 * front_w)
                bulge_x = height * 0.026 * tz * math.sin(min(1.0, abs(w_orig.x) / (height * 0.165)) * math.pi) * (0.4 + 0.6 * front_w)
                sag_z = height * 0.014 * tz * tx * front_w * (1.0 - u_z)
                # Apply delta onto Basis coordinate of the shape key
                base_w = mw @ body.data.shape_keys.key_blocks[0].data[idx_v].co
                base_w.y -= bulge_y
                base_w.z -= sag_z
                if abs(w_orig.x) > 0.008:
                    base_w.x += math.copysign(bulge_x, w_orig.x)
                belly_sk.data[idx_v].co = mw_inv @ base_w
        body.data.update()
        bpy.context.view_layer.update()

    # 2) Ensure the MPFB2 body has the right South Indian skin map (always refresh if it's our generated KeralaSkin)
    has_custom_mpfb_skin = False
    for mat in body.data.materials:
        if mat and not mat.name.startswith("Mat_KeralaSkin_") and mat.use_nodes and mat.node_tree:
            if any(n.type == "TEX_IMAGE" and n.image for n in mat.node_tree.nodes):
                has_custom_mpfb_skin = True
                break
    if not has_custom_mpfb_skin or OUTFIT_PRESET in ("landlord", "temple_priest"):
        skin_mat_name = f"Mat_KeralaSkin_{OUTFIT_PRESET}"
        if skin_mat_name in bpy.data.materials:
            bpy.data.materials.remove(bpy.data.materials[skin_mat_name])
        skin_mat = bpy.data.materials.new(name=skin_mat_name)
        skin_mat.use_nodes = True
        snodes = skin_mat.node_tree.nodes
        slinks = skin_mat.node_tree.links
        snodes.clear()
        s_out = snodes.new("ShaderNodeOutputMaterial")
        s_bsdf = snodes.new("ShaderNodeBsdfPrincipled")
        s_bsdf.inputs["Roughness"].default_value = 0.48 if OUTFIT_PRESET == "kalari_student" else 0.66
        slinks.new(s_bsdf.outputs["BSDF"], s_out.inputs["Surface"])

        s_res = 512
        s_img_name = f"KeralaSkin_{OUTFIT_PRESET}"
        if s_img_name in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[s_img_name])
        s_img = bpy.data.images.new(s_img_name, width=s_res, height=s_res, alpha=False)
        s_px = [0.0] * (s_res * s_res * 4)
        srng = random.Random(42 + (hash(OUTFIT_PRESET) & 0xFF))
        # Fair warm Indian complexion for Namboothiri Temple Priest & Landlord; deeper sun-tanned bronze for fisherman
        if OUTFIT_PRESET == "temple_priest":
            base_r, base_g, base_b = (0.75, 0.57, 0.44)
        elif OUTFIT_PRESET == "landlord":
            base_r, base_g, base_b = (0.71, 0.53, 0.40)
        elif OUTFIT_PRESET == "fisherman":
            base_r, base_g, base_b = (0.37, 0.215, 0.135)
        elif preset["gender"] == "M":
            base_r, base_g, base_b = (0.43, 0.255, 0.16)
        else:
            base_r, base_g, base_b = (0.47, 0.285, 0.185)
        for y in range(s_res):
            v = y / s_res
            for x in range(s_res):
                u = x / s_res
                mottle = (math.sin(u * 26.0 + math.cos(v * 19.0)) * math.cos(v * 23.0)) * 0.018
                warmth = math.sin(u * 11.0 - v * 9.0) * 0.012
                pore = (srng.random() - 0.5) * 0.022
                idx = (y * s_res + x) * 4
                s_px[idx]     = max(0.0, min(1.0, base_r + mottle + warmth + pore))
                s_px[idx + 1] = max(0.0, min(1.0, base_g + mottle * 0.8 + pore * 0.85))
                s_px[idx + 2] = max(0.0, min(1.0, base_b + mottle * 0.65 - warmth * 0.4 + pore * 0.7))
                s_px[idx + 3] = 1.0
        s_img.pixels.foreach_set(s_px)
        s_img.pack()
        s_tex = snodes.new("ShaderNodeTexImage")
        s_tex.image = s_img
        slinks.new(s_tex.outputs["Color"], s_bsdf.inputs["Base Color"])
        body.data.materials.clear()
        body.data.materials.append(skin_mat)

    mat_lower = make_cloth_material(f"Mat_{OUTFIT_PRESET}_Lower", preset["pal"][0])
    mat_upper = make_cloth_material(f"Mat_{OUTFIT_PRESET}_Upper", preset["pal"][1])

    created = []
    if preset["lower"] == "kachai":
        kalari_lower = _build_kalari_lower_wrap(body, min_z, height, mat_lower)
        if kalari_lower:
            created.append(kalari_lower)
        kalari_belt = _build_kalari_waist_belt(body, min_z, height, mat_upper)
        if kalari_belt:
            created.append(kalari_belt)
    elif preset["lower"] == "modular_base":
        # RDR2-style modular base character: clean fitted modest under-wrap only
        # (full skinned Kasavu/Kalli Mundu + flowing Melmundu are bound dynamically in Three.js!)
        under_wrap = _build_kalari_lower_wrap(body, min_z, height, mat_lower)
        if under_wrap:
            created.append(under_wrap)
    else:
        created.append(build_pleated_mundu(body, min_z, height, preset["lower"], mat_lower))

    upper = preset["upper"]
    if "blouse" in upper:
        created.append(build_fitted_blouse(body, min_z, height, mat_upper))
    if "neriyathu" in upper:
        created.append(build_shoulder_cloth(body, min_z, height, "neriyathu", mat_lower))
    elif upper == "melmundu":
        created.append(build_shoulder_cloth(body, min_z, height, "melmundu", mat_upper))
    elif upper == "thorthu":
        created.append(build_shoulder_cloth(body, min_z, height, "thorthu", mat_upper))
    elif upper == "headcloth":
        # Traditional 18th-century Kerala fisherman's dried palmyra palm-leaf conical hat (Thoppikuda / Olathoppi)
        # Built with overlapping dried palm-leaf dome, 12 split-bamboo ribs, bound cane rim, apex cap & inner head-ring
        eval_h = _eval_world_verts(body)
        h_pts = [p for p in eval_h if p.z >= max_z - height * 0.085]
        if h_pts:
            cx_f = (min(p.x for p in h_pts) + max(p.x for p in h_pts)) * 0.5
            cy_f = (min(p.y for p in h_pts) + max(p.y for p in h_pts)) * 0.5
            rx_f = max(height * 0.044, (max(p.x for p in h_pts) - min(p.x for p in h_pts)) * 0.5)
            ry_f = max(height * 0.050, (max(p.y for p in h_pts) - min(p.y for p in h_pts)) * 0.5)

            # Packed 512x512 sun-dried palmyra palm-leaf PBR texture
            palm_mat_name = "Mat_Kerala_Thoppikuda_Palm"
            if palm_mat_name in bpy.data.materials:
                bpy.data.materials.remove(bpy.data.materials[palm_mat_name])
            palm_mat = bpy.data.materials.new(name=palm_mat_name)
            palm_mat.use_nodes = True
            pnodes = palm_mat.node_tree.nodes
            plinks = palm_mat.node_tree.links
            pnodes.clear()
            p_out = pnodes.new("ShaderNodeOutputMaterial")
            p_bsdf = pnodes.new("ShaderNodeBsdfPrincipled")
            p_bsdf.inputs["Roughness"].default_value = 0.86
            plinks.new(p_bsdf.outputs["BSDF"], p_out.inputs["Surface"])

            p_res = 512
            p_img_name = "KeralaThoppikuda_PalmLeaf"
            if p_img_name in bpy.data.images:
                bpy.data.images.remove(bpy.data.images[p_img_name])
            p_img = bpy.data.images.new(p_img_name, width=p_res, height=p_res, alpha=False)
            p_px = [0.0] * (p_res * p_res * 4)
            prng = random.Random(1788)
            for py in range(p_res):
                pv = py / p_res  # 0 = outer rim, 1 = apex
                for px_i in range(p_res):
                    pu = px_i / p_res  # radial angle
                    # Radial dried palmyra leaf strips + fine fibrous veins + concentric cane stitch bands
                    strip_seam = abs(((pu * 24.0) % 1.0) - 0.5)
                    seam_dark = -0.10 if strip_seam > 0.45 else 0.0
                    vein = math.sin(pu * math.pi * 192.0) * 0.025
                    ring_stitch = -0.09 if (abs(pv - 0.06) < 0.015 or abs(pv - 0.48) < 0.014 or abs(pv - 0.86) < 0.016) else 0.0
                    weather = math.sin(pu * 14.0 + pv * 9.0) * 0.03 + (prng.random() - 0.5) * 0.028
                    r_c = 0.64 + seam_dark + vein + ring_stitch + weather
                    g_c = 0.52 + seam_dark * 0.9 + vein * 0.85 + ring_stitch * 0.9 + weather * 0.85
                    b_c = 0.30 + seam_dark * 0.6 + vein * 0.5 + ring_stitch * 0.6 + weather * 0.55
                    idx_p = (py * p_res + px_i) * 4
                    p_px[idx_p]     = max(0.0, min(1.0, r_c))
                    p_px[idx_p + 1] = max(0.0, min(1.0, g_c))
                    p_px[idx_p + 2] = max(0.0, min(1.0, b_c))
                    p_px[idx_p + 3] = 1.0
            p_img.pixels.foreach_set(p_px)
            p_img.pack()
            p_tex = pnodes.new("ShaderNodeTexImage")
            p_tex.image = p_img
            plinks.new(p_tex.outputs["Color"], p_bsdf.inputs["Base Color"])

            # Seasoned split-bamboo & cane binding material
            cane_mat_name = "Mat_Kerala_Thoppikuda_Cane"
            if cane_mat_name in bpy.data.materials:
                bpy.data.materials.remove(bpy.data.materials[cane_mat_name])
            cane_mat = bpy.data.materials.new(name=cane_mat_name)
            cane_mat.use_nodes = True
            c_bsdf = cane_mat.node_tree.nodes.get("Principled BSDF")
            if c_bsdf:
                c_bsdf.inputs["Base Color"].default_value = (0.34, 0.23, 0.12, 1.0)
                c_bsdf.inputs["Roughness"].default_value = 0.78

            hat_parts = []
            # Conical palm-leaf dome: ~49cm diameter, ~18cm rise, seated just above eyebrows/ears
            hat_r_outer = height * 0.145
            hat_rise = height * 0.105
            z_rim = max_z - height * 0.034
            hat_rings = 14
            hat_segs = 48

            bm_hat = bmesh.new()
            dome_rings = []
            for ir in range(hat_rings + 1):
                t = ir / hat_rings  # 0 = outer brim, 1 = apex
                # Gentle convex Malabar Thoppikuda profile (wider flare at rim, crisp peak at apex)
                rad = max(height * 0.006, hat_r_outer * (1.0 - t))
                z_cur = z_rim + hat_rise * (t ** 0.88)
                ring_v = []
                for iseg in range(hat_segs):
                    ang = (iseg / hat_segs) * math.pi * 2.0
                    # Subtle overlapping palm-leaf fluting (24 radial segments)
                    flute = math.sin(ang * 24.0) * height * 0.0014 * (1.0 - t * 0.7)
                    # Gentle natural brim wave so it feels hand-woven, never rigid plastic
                    brim_wave = math.sin(ang * 2.0 + 0.5) * height * 0.004 * (1.0 - t)
                    vx = cx_f + math.cos(ang) * (rad + flute)
                    vy = cy_f + math.sin(ang) * (rad + flute)
                    ring_v.append(bm_hat.verts.new((vx, vy, z_cur + brim_wave)))
                dome_rings.append(ring_v)

            uv_h = bm_hat.loops.layers.uv.verify()
            for ir in range(hat_rings):
                v0 = ir / hat_rings
                v1 = (ir + 1) / hat_rings
                for iseg in range(hat_segs):
                    nseg = (iseg + 1) % hat_segs
                    f = bm_hat.faces.new((
                        dome_rings[ir][iseg],
                        dome_rings[ir][nseg],
                        dome_rings[ir + 1][nseg],
                        dome_rings[ir + 1][iseg],
                    ))
                    f.loops[0][uv_h].uv = (iseg / hat_segs, v0)
                    f.loops[1][uv_h].uv = ((iseg + 1) / hat_segs, v0)
                    f.loops[2][uv_h].uv = ((iseg + 1) / hat_segs, v1)
                    f.loops[3][uv_h].uv = (iseg / hat_segs, v1)
            bmesh.ops.recalc_face_normals(bm_hat, faces=bm_hat.faces)
            dome_mesh = bpy.data.meshes.new("_ThoppikudaDome")
            bm_hat.to_mesh(dome_mesh)
            bm_hat.free()
            for p in dome_mesh.polygons:
                p.use_smooth = True
            dome_obj = bpy.data.objects.new("_ThoppikudaDome", dome_mesh)
            dome_obj.data.materials.append(palm_mat)
            bpy.context.scene.collection.objects.link(dome_obj)
            sol_hat = dome_obj.modifiers.new("HatSolid", "SOLIDIFY")
            sol_hat.thickness = height * 0.0034
            sol_hat.offset = 0.0
            bpy.context.view_layer.objects.active = dome_obj
            bpy.ops.object.modifier_apply(modifier="HatSolid")
            hat_parts.append(dome_obj)

            # Bound outer cane rim hoop + mid-dome cane stiffening hoop
            for hoop_idx, (t_hoop, r_tube) in enumerate([(0.0, height * 0.0046), (0.48, height * 0.0026)]):
                rad_hp = hat_r_outer * (1.0 - t_hoop)
                z_hp = z_rim + hat_rise * (t_hoop ** 0.88)
                hoop_pts = [
                    Vector((
                        cx_f + math.cos((k / 48) * math.pi * 2.0) * rad_hp,
                        cy_f + math.sin((k / 48) * math.pi * 2.0) * rad_hp,
                        z_hp + math.sin((k / 48) * math.pi * 2.0 * 2.0 + 0.5) * height * 0.004 * (1.0 - t_hoop),
                    ))
                    for k in range(48)
                ]
                hat_parts.append(_make_torus_tube(f"_ThoppikudaHoop_{hoop_idx}", hoop_pts, r_tube, cane_mat, segs=8, twist_ridges=2))

            # Inner woven bamboo head-ring (Thala-valayam) seated snugly on the upper skull
            z_head_ring = max_z - height * 0.024
            head_ring_pts = [
                Vector((
                    cx_f + math.cos((k / 36) * math.pi * 2.0) * (rx_f + height * 0.008),
                    cy_f + math.sin((k / 36) * math.pi * 2.0) * (ry_f + height * 0.008),
                    z_head_ring,
                ))
                for k in range(36)
            ]
            hat_parts.append(_make_torus_tube("_ThoppikudaHeadRing", head_ring_pts, height * 0.0052, cane_mat, segs=8))

            # 12 radial split-bamboo stiffening ribs + woven cane apex cap (Mudi)
            for rib_i in range(12):
                ang = (rib_i / 12) * math.pi * 2.0
                p_bot = Vector((
                    cx_f + math.cos(ang) * hat_r_outer,
                    cy_f + math.sin(ang) * hat_r_outer,
                    z_rim + math.sin(ang * 2.0 + 0.5) * height * 0.004,
                ))
                p_top = Vector((cx_f, cy_f, z_rim + hat_rise + height * 0.002))
                rib_vec = p_top - p_bot
                rib_mid = (p_bot + p_top) * 0.5 + Vector((0, 0, height * 0.002))
                bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=height * 0.0018, depth=rib_vec.length, location=rib_mid)
                rib_obj = bpy.context.active_object
                rib_obj.rotation_mode = "QUATERNION"
                rib_obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(rib_vec.normalized())
                bpy.ops.object.transform_apply(rotation=True)
                rib_obj.data.materials.append(cane_mat)
                hat_parts.append(rib_obj)

            bpy.ops.mesh.primitive_cone_add(
                vertices=16,
                radius1=height * 0.022,
                radius2=height * 0.004,
                depth=height * 0.018,
                location=(cx_f, cy_f, z_rim + hat_rise + height * 0.006),
            )
            apex_cap = bpy.context.active_object
            for p in apex_cap.data.polygons:
                p.use_smooth = True
            apex_cap.data.materials.append(cane_mat)
            hat_parts.append(apex_cap)

            hat_obj = _join_objects(hat_parts, "Kerala_Fisherman_Thoppikuda")
            if hat_obj:
                created.append(hat_obj)
    elif upper == "guru_sash":
        # Senior Kalari Gurukkal: crimson-gold Kacha martial waist sash + sacred Rudraksha bead mala
        guru_belt = _build_kalari_waist_belt(body, min_z, height, mat_upper)
        if guru_belt:
            created.append(guru_belt)
        # Sacred Rudraksha mala: narrow neck-hugging loop with 36 individual round beads draping down center chest
        bvh_g = BVHTree.FromObject(body, depsgraph)
        mw_inv_g = mw.inverted()
        cx_gn, cy_gn, rx_gn, ry_gn, z_gn = slice_body_profile(body, 0.855, min_z, height)
        _, cy_gc, _, ry_gc, _ = slice_body_profile(body, 0.755, min_z, height)
        # Clamp strictly to true neck width so the mala never stretches out onto the shoulders!
        rx_neck = min(rx_gn, height * 0.042)
        ry_neck = min(ry_gn, height * 0.046)
        rudra_mat_name = "Mat_Kerala_Rudraksha"
        if rudra_mat_name in bpy.data.materials:
            bpy.data.materials.remove(bpy.data.materials[rudra_mat_name])
        rudra_mat = bpy.data.materials.new(name=rudra_mat_name)
        rudra_mat.use_nodes = True
        r_bsdf = rudra_mat.node_tree.nodes.get("Principled BSDF")
        if r_bsdf:
            r_bsdf.inputs["Base Color"].default_value = (0.28, 0.12, 0.05, 1.0)
            r_bsdf.inputs["Roughness"].default_value = 0.72
        mala_raw = []
        bead_count = 38
        for k in range(bead_count):
            ang = (k / bead_count) * math.pi * 2.0
            ca, sa = math.cos(ang), math.sin(ang)
            ff = max(0.0, -sa)  # 1 at front center chest, 0 at back of neck
            # Narrow U-drop down the center chest (stays strictly inside collarbones!)
            chest_taper = 1.0 - 0.18 * (ff ** 1.5)
            x = cx_gn + ca * (rx_neck * 1.15 * chest_taper)
            z = z_gn - height * 0.008 - (height * 0.135) * (ff ** 1.45)
            y = (cy_gn * (1.0 - ff) + cy_gc * ff) + sa * ((ry_neck * 1.15) * (1.0 - ff) + (ry_gc + height * 0.015) * ff)
            mala_raw.append(Vector((x, y, z)))
        mala_pts, _ = _project_ring_onto_body(mala_raw, bvh_g, mw, mw_inv_g, height * 0.0055)
        mala_parts = [_make_torus_tube("_RudraCord", mala_pts, height * 0.0016, rudra_mat, segs=6)]
        for bi, bp in enumerate(mala_pts):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=height * 0.0052, location=bp)
            bead = bpy.context.active_object
            for p in bead.data.polygons:
                p.use_smooth = True
            bead.data.materials.append(rudra_mat)
            mala_parts.append(bead)
        mala_obj = _join_objects(mala_parts, "Kerala_Gurukkal_RudrakshaMala")
        if mala_obj:
            created.append(mala_obj)
    elif upper == "guard_gear":
        # 18th-Century Kerala Nair Estate Guard (Akampadi / Padayali):
        # 1) Crimson Kacha martial waist sash
        guard_belt = _build_kalari_waist_belt(body, min_z, height, mat_upper)
        if guard_belt:
            created.append(guard_belt)
        # 2) Deep maroon Melmundu shoulder shawl draped over left shoulder
        mat_shawl = make_cloth_material("Mat_guard_Melmundu", "blouse_maroon")
        created.append(build_shoulder_cloth(body, min_z, height, "melmundu", mat_shawl))
        # 3) Traditional Nair Thalakettu (wrapped cloth authority headband with side knot)
        bvh_gd = BVHTree.FromObject(body, depsgraph)
        mw_inv_gd = mw.inverted()
        eval_gd = _eval_world_verts(body)
        gh_pts = [p for p in eval_gd if p.z >= max_z - height * 0.085]
        if gh_pts:
            cx_gd = (min(p.x for p in gh_pts) + max(p.x for p in gh_pts)) * 0.5
            cy_gd = (min(p.y for p in gh_pts) + max(p.y for p in gh_pts)) * 0.5
            rx_gd = max(height * 0.044, (max(p.x for p in gh_pts) - min(p.x for p in gh_pts)) * 0.5)
            ry_gd = max(height * 0.050, (max(p.y for p in gh_pts) - min(p.y for p in gh_pts)) * 0.5)
            z_gd = max_z - height * 0.036
            band_raw = [
                Vector((
                    cx_gd + math.cos((k / 40) * math.pi * 2.0) * (rx_gd + height * 0.015),
                    cy_gd + math.sin((k / 40) * math.pi * 2.0) * (ry_gd + height * 0.015),
                    z_gd - math.sin((k / 40) * math.pi * 2.0) * height * 0.008,
                ))
                for k in range(40)
            ]
            band_pts, _ = _project_ring_onto_body(band_raw, bvh_gd, mw, mw_inv_gd, height * 0.009)
            band_parts = [_make_torus_tube("_GuardThalakettu", band_pts, height * 0.0125, mat_upper, segs=10, twist_ridges=2)]
            knot_p = band_pts[4]
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=height * 0.015, location=knot_p)
            knot_gd = bpy.context.active_object
            knot_gd.scale = (1.15, 0.85, 0.85)
            bpy.ops.object.transform_apply(scale=True)
            for p in knot_gd.data.polygons:
                p.use_smooth = True
            knot_gd.data.materials.append(mat_upper)
            band_parts.append(knot_gd)
            tk_obj = _join_objects(band_parts, "Kerala_Guard_Thalakettu")
            if tk_obj:
                created.append(tk_obj)
    elif upper == "priest_sacred":
        # 18th-Century Kerala Temple Priest (Santhikaran / Namboothiri):
        # 1) Sacred 3-strand cotton Poonool (Yajnopavita) draped from left shoulder across chest to right waist
        bvh_p = BVHTree.FromObject(body, depsgraph)
        mw_inv_p = mw.inverted()
        cx_ps, cy_ps, rx_ps, ry_ps, z_ps = slice_body_profile(body, 0.825, min_z, height)
        cx_pc, cy_pc, rx_pc, ry_pc, z_pc = slice_body_profile(body, 0.715, min_z, height)
        cx_pw, cy_pw, rx_pw, ry_pw, z_pw = slice_body_profile(body, 0.575, min_z, height)
        poonool_mat = bpy.data.materials.new(name="Mat_Priest_Poonool")
        poonool_mat.use_nodes = True
        p_bsdf = poonool_mat.node_tree.nodes.get("Principled BSDF")
        if p_bsdf:
            p_bsdf.inputs["Base Color"].default_value = (0.93, 0.90, 0.82, 1.0)
            p_bsdf.inputs["Roughness"].default_value = 0.85
        poonool_raw = []
        p_steps = 44
        for k in range(p_steps):
            t = k / p_steps
            ang = t * math.pi * 2.0
            ca, sa = math.cos(ang), math.sin(ang)
            # Left shoulder (+X, high Z) -> front chest -> right waist (-X, low Z) -> back -> left shoulder
            frac_left = 0.5 + 0.5 * ca
            z = z_pw + (z_ps - z_pw) * frac_left + (height * 0.014) * math.sin(ang * 2.0)
            rx_here = rx_pw * (1.0 - frac_left) + rx_ps * frac_left
            ry_here = ry_pw * (1.0 - frac_left) + ry_ps * frac_left
            cy_here = cy_pw * (1.0 - frac_left) + cy_ps * frac_left
            x = cx_pc + ca * (rx_here * 0.82)
            y = cy_here + sa * (ry_here + height * 0.014)
            poonool_raw.append(Vector((x, y, z)))
        p_pts, _ = _project_ring_onto_body(poonool_raw, bvh_p, mw, mw_inv_p, height * 0.0045)
        p_parts = [
            _make_torus_tube("_PoonoolA", p_pts, height * 0.0024, poonool_mat, segs=6),
            _make_torus_tube("_PoonoolB", [p + Vector((0.0, 0.0, height * 0.0048)) for p in p_pts], height * 0.0020, poonool_mat, segs=6),
        ]
        p_obj = _join_objects(p_parts, "Kerala_Priest_Poonool")
        if p_obj:
            created.append(p_obj)

        # 2) Sacred Rudraksha bead mala draped cleanly around the neck
        cx_pn, cy_pn, rx_pn, ry_pn, z_pn = slice_body_profile(body, 0.855, min_z, height)
        rx_pneck = min(rx_pn, height * 0.042)
        ry_pneck = min(ry_pn, height * 0.046)
        rudra_mat_p = bpy.data.materials.new(name="Mat_Priest_Rudraksha")
        rudra_mat_p.use_nodes = True
        rp_bsdf = rudra_mat_p.node_tree.nodes.get("Principled BSDF")
        if rp_bsdf:
            rp_bsdf.inputs["Base Color"].default_value = (0.30, 0.13, 0.05, 1.0)
            rp_bsdf.inputs["Roughness"].default_value = 0.70
        pmala_raw = []
        for k in range(36):
            ang = (k / 36) * math.pi * 2.0
            ca, sa = math.cos(ang), math.sin(ang)
            ff = max(0.0, -sa)
            x = cx_pn + ca * (rx_pneck * 1.15 * (1.0 - 0.16 * (ff ** 1.5)))
            z = z_pn - height * 0.008 - (height * 0.125) * (ff ** 1.45)
            y = (cy_pn * (1.0 - ff) + cy_pc * ff) + sa * ((ry_pneck * 1.15) * (1.0 - ff) + (ry_pc + height * 0.015) * ff)
            pmala_raw.append(Vector((x, y, z)))
        pmala_pts, _ = _project_ring_onto_body(pmala_raw, bvh_p, mw, mw_inv_p, height * 0.0055)
        pmala_parts = [_make_torus_tube("_PriestRudraCord", pmala_pts, height * 0.0016, rudra_mat_p, segs=6)]
        for bp in pmala_pts:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=height * 0.0048, location=bp)
            bead = bpy.context.active_object
            for poly in bead.data.polygons:
                poly.use_smooth = True
            bead.data.materials.append(rudra_mat_p)
            pmala_parts.append(bead)
        pmala_obj = _join_objects(pmala_parts, "Kerala_Priest_RudrakshaMala")
        if pmala_obj:
            created.append(pmala_obj)

        # 3) Forehead 3-stripe Bhasmam (sacred white ash) + Chandanam (sandalwood) tilak
        #    Raycasted directly onto the forehead skin surface so every stripe & dot touches flush!
        eval_p = _eval_world_verts(body)
        ph_pts = [p for p in eval_p if p.z >= max_z - height * 0.085]
        if ph_pts:
            cx_ph = (min(p.x for p in ph_pts) + max(p.x for p in ph_pts)) * 0.5
            min_y_ph = min(p.y for p in ph_pts)
            z_brow = max_z - height * 0.046
            ash_mat = bpy.data.materials.new(name="Mat_Priest_Bhasmam")
            ash_mat.use_nodes = True
            ab = ash_mat.node_tree.nodes.get("Principled BSDF")
            if ab:
                ab.inputs["Base Color"].default_value = (0.94, 0.93, 0.90, 1.0)
                ab.inputs["Roughness"].default_value = 0.95
            chand_mat = bpy.data.materials.new(name="Mat_Priest_Chandanam")
            chand_mat.use_nodes = True
            cb = chand_mat.node_tree.nodes.get("Principled BSDF")
            if cb:
                cb.inputs["Base Color"].default_value = (0.86, 0.66, 0.24, 1.0)
                cb.inputs["Roughness"].default_value = 0.85

            mw_rot = mw.to_3x3()
            ray_dir_local = (mw_inv_p.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()

            def sample_forehead(wx, wz, skin_offset):
                orig_w = Vector((wx, min_y_ph - height * 0.12, wz))
                hit_loc, hit_n, _, _ = bvh_p.ray_cast(mw_inv_p @ orig_w, ray_dir_local, height * 0.35)
                if hit_loc is not None:
                    hw = mw @ hit_loc
                    nw = (mw_rot @ hit_n).normalized()
                    return hw + nw * skin_offset, nw
                return Vector((wx, min_y_ph + height * 0.008, wz)), Vector((0.0, -1.0, 0.0))

            tilak_parts = []
            half_w = height * 0.021
            for dz_i in (-1, 0, 1):
                z_line = z_brow + dz_i * height * 0.0048
                pts_line = []
                for s_i in range(9):
                    u_s = -1.0 + 2.0 * (s_i / 8.0)
                    pt_w, _ = sample_forehead(cx_ph + u_s * half_w, z_line, height * 0.0009)
                    pts_line.append(pt_w)
                # Build a thin curved ash strip hugging the exact forehead contour
                bm_s = bmesh.new()
                strip_h = height * 0.0014
                strip_d = height * 0.0010
                rings = []
                for pt in pts_line:
                    r0 = bm_s.verts.new(pt + Vector((0.0, -strip_d, -strip_h)))
                    r1 = bm_s.verts.new(pt + Vector((0.0, -strip_d,  strip_h)))
                    r2 = bm_s.verts.new(pt + Vector((0.0,  strip_d,  strip_h)))
                    r3 = bm_s.verts.new(pt + Vector((0.0,  strip_d, -strip_h)))
                    rings.append((r0, r1, r2, r3))
                for k_r in range(len(rings) - 1):
                    a0, a1, a2, a3 = rings[k_r]
                    b0, b1, b2, b3 = rings[k_r + 1]
                    bm_s.faces.new((a0, b0, b1, a1))
                    bm_s.faces.new((a1, b1, b2, a2))
                    bm_s.faces.new((a2, b2, b3, a3))
                    bm_s.faces.new((a3, b3, b0, a0))
                bmesh.ops.recalc_face_normals(bm_s, faces=bm_s.faces)
                me_s = bpy.data.meshes.new(f"_BhasmamLine_{dz_i}")
                bm_s.to_mesh(me_s)
                bm_s.free()
                ob_s = bpy.data.objects.new(f"_BhasmamLine_{dz_i}", me_s)
                bpy.context.collection.objects.link(ob_s)
                ob_s.data.materials.append(ash_mat)
                tilak_parts.append(ob_s)

            dot_w, _ = sample_forehead(cx_ph, z_brow, height * 0.0016)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=8, radius=height * 0.0038, location=dot_w)
            dot = bpy.context.active_object
            dot.scale = (1.0, 0.35, 1.15)
            bpy.ops.object.transform_apply(scale=True)
            for poly in dot.data.polygons:
                poly.use_smooth = True
            dot.data.materials.append(chand_mat)
            tilak_parts.append(dot)
            tilak_obj = _join_objects(tilak_parts, "Kerala_Priest_BhasmamTilak")
            if tilak_obj:
                created.append(tilak_obj)

    # Auto-add fitted Kerala hair (silver-grey for elders & Gurukkal, low bun for women) if no MPFB2 hair asset is attached yet
    created.extend(build_kerala_hair(body, min_z, height, preset["gender"], is_elder=("elder" in OUTFIT_PRESET or OUTFIT_PRESET == "kalari_guru" or OUTFIT_PRESET == "temple_priest")))

    # Add traditional 22K Kerala Gold Ornaments (chains, medallion, armlets, bangles, ear studs) for Landlord
    if OUTFIT_PRESET == "landlord":
        created.extend(build_landlord_gold_ornaments(body, min_z, height))

    # Parent new garments, hair & ornaments cleanly to the MPFB2 body
    for g in created:
        g.parent = body

    if AUTO_EXPORT_FBX:
        os.makedirs(EXPORT_DIR, exist_ok=True)
        bpy.context.view_layer.update()

        # Collect all visible mesh parts (body + MPFB2 eyes/hair/eyebrows/teeth + Kerala garments)
        root_obj = body.parent if (body.parent and body.parent.type == "ARMATURE") else body
        source_meshes = []

        def collect_meshes(obj):
            if obj.type == "MESH" and not obj.hide_viewport and obj.visible_get():
                source_meshes.append(obj)
            for ch in obj.children:
                collect_meshes(ch)

        collect_meshes(root_obj)

        # Bake each mesh into a completely unrigged, bone-free, weight-free duplicate
        # so Mixamo opens the 6-marker Auto-Rigger instead of failing on the MPFB2 skeleton.
        depsgraph = bpy.context.evaluated_depsgraph_get()
        temp_objs = []
        for src in source_meshes:
            eval_obj = src.evaluated_get(depsgraph)
            baked_mesh = bpy.data.meshes.new_from_object(
                eval_obj,
                preserve_all_data_layers=True,
                depsgraph=depsgraph,
            )
            tmp = bpy.data.objects.new(f"_MixamoTmp_{src.name}", baked_mesh)
            tmp.matrix_world = src.matrix_world.copy()
            tmp.parent = None
            tmp.vertex_groups.clear()
            tmp.modifiers.clear()
            # Unify UV layer name across ALL meshes (MPFB2 body + Kerala clothes + hair) BEFORE join()
            # so Blender never wipes cloth UVs to (0, 0) due to mismatched UV layer names!
            if not tmp.data.uv_layers:
                tmp.data.uv_layers.new(name="UVMap")
            else:
                tmp.data.uv_layers[0].name = "UVMap"
                tmp.data.uv_layers.active_index = 0
                while len(tmp.data.uv_layers) > 1:
                    tmp.data.uv_layers.remove(tmp.data.uv_layers[-1])
            bpy.context.scene.collection.objects.link(tmp)
            temp_objs.append(tmp)

        bpy.ops.object.select_all(action="DESELECT")
        for tmp in temp_objs:
            tmp.select_set(True)
        bpy.context.view_layer.objects.active = temp_objs[0]

        if len(temp_objs) > 1:
            bpy.ops.object.join()

        merged = bpy.context.active_object
        merged.name = f"Mixamo_{OUTFIT_PRESET}"
        merged.vertex_groups.clear()
        merged.modifiers.clear()
        merged.parent = None

        # Strip any leftover shape keys so Mixamo sees a pure static T-pose mesh
        if merged.data.shape_keys:
            merged.shape_key_clear()

        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

        # Ensure feet sit cleanly on Z = 0
        m_zs = [v.co.z for v in merged.data.vertices]
        if m_zs and abs(min(m_zs)) > 1e-4:
            merged.location.z -= min(m_zs)
            bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

        # Simplify materials on the temporary export mesh to diffuse-only Principled BSDF
        # (MPFB2 complex skin/eye node groups & bump/roughness maps trigger Mixamo's false
        # 'unable to map your existing skeleton' error even when no bones exist!)
        tmp_obj_dir = os.path.join(EXPORT_DIR, f"_tmp_{OUTFIT_PRESET}")
        if os.path.exists(tmp_obj_dir):
            shutil.rmtree(tmp_obj_dir)
        os.makedirs(tmp_obj_dir, exist_ok=True)

        temp_mats = []
        for idx, orig_mat in enumerate(list(merged.data.materials)):
            safe_name = re.sub(r"[^A-Za-z0-9_]+", "_", orig_mat.name if orig_mat else f"Mat_{idx}")
            m_clean = bpy.data.materials.new(name=f"_MixamoMat_{idx}_{safe_name}")
            m_clean.use_nodes = True
            cnodes = m_clean.node_tree.nodes
            clinks = m_clean.node_tree.links
            cnodes.clear()
            c_out = cnodes.new("ShaderNodeOutputMaterial")
            c_bsdf = cnodes.new("ShaderNodeBsdfPrincipled")
            c_bsdf.inputs["Roughness"].default_value = 0.85
            if "Metallic" in c_bsdf.inputs:
                c_bsdf.inputs["Metallic"].default_value = 0.0
            clinks.new(c_bsdf.outputs["BSDF"], c_out.inputs["Surface"])

            diffuse_img = None
            fallback_rgba = (0.42, 0.24, 0.14, 1.0)  # warm South Indian skin fallback
            if orig_mat and orig_mat.use_nodes and orig_mat.node_tree:
                nt = orig_mat.node_tree
                # 1. Check Principled BSDF Base Color link or solid color
                for n in nt.nodes:
                    if n.type == "BSDF_PRINCIPLED":
                        bc = n.inputs.get("Base Color")
                        if bc:
                            if bc.is_linked:
                                src_n = bc.links[0].from_node
                                if src_n.type == "TEX_IMAGE" and src_n.image:
                                    diffuse_img = src_n.image
                            else:
                                fallback_rgba = tuple(bc.default_value)
                        break
                # 2. Check MPFB2 custom shader group inputs (SkinColor / Color) or first image texture
                if diffuse_img is None:
                    for n in nt.nodes:
                        if n.type == "TEX_IMAGE" and n.image:
                            nm = (n.image.name + " " + n.label).lower()
                            if not any(k in nm for k in ("normal", "rough", "bump", "disp", "spec", "metal", "ao")):
                                diffuse_img = n.image
                                break
                if diffuse_img is None:
                    for n in nt.nodes:
                        if n.type == "GROUP":
                            for inp in n.inputs:
                                if inp.type == "RGBA" and any(k in inp.name.lower() for k in ("skin", "base", "color", "albedo", "diffuse")):
                                    fallback_rgba = tuple(inp.default_value)
                                    break
            elif orig_mat:
                fallback_rgba = tuple(orig_mat.diffuse_color)

            if diffuse_img is not None:
                png_name = f"{safe_name}_{idx}.png"
                png_path = os.path.join(tmp_obj_dir, png_name)
                try:
                    img_copy = diffuse_img.copy()
                    img_copy.filepath_raw = png_path
                    img_copy.file_format = "PNG"
                    img_copy.save()
                    c_tex = cnodes.new("ShaderNodeTexImage")
                    c_tex.image = img_copy
                    clinks.new(c_tex.outputs["Color"], c_bsdf.inputs["Base Color"])
                except Exception:
                    c_bsdf.inputs["Base Color"].default_value = fallback_rgba
            else:
                c_bsdf.inputs["Base Color"].default_value = fallback_rgba

            merged.data.materials[idx] = m_clean
            temp_mats.append(m_clean)

        # 1) Export Mixamo-guaranteed OBJ + MTL + PNGs ZIP bundle (OBJ cannot hold any skeleton!)
        obj_path = os.path.join(tmp_obj_dir, f"{OUTFIT_PRESET}.obj")
        mtl_path = os.path.join(tmp_obj_dir, f"{OUTFIT_PRESET}.mtl")
        zip_path = os.path.join(EXPORT_DIR, f"{OUTFIT_PRESET}_mixamo.zip")

        if hasattr(bpy.ops.wm, "obj_export"):
            valid_obj_props = {p.identifier for p in bpy.ops.wm.obj_export.get_rna_type().properties}
            obj_kwargs = {"filepath": obj_path}
            for k, v in [
                ("export_selected_objects", True),
                ("export_materials", True),
                ("export_uv", True),
                ("export_normals", True),
                ("forward_axis", "NEGATIVE_Z"),
                ("up_axis", "Y"),
                ("path_mode", "COPY"),
            ]:
                if k in valid_obj_props:
                    obj_kwargs[k] = v
            bpy.ops.wm.obj_export(**obj_kwargs)
        else:
            bpy.ops.export_scene.obj(
                filepath=obj_path,
                use_selection=True,
                use_materials=True,
                use_uvs=True,
                use_normals=True,
                axis_forward="-Z",
                axis_up="Y",
                path_mode="COPY",
            )

        # Normalize .mtl for Mixamo: relative texture names + non-white ambient (Ka 0) so textures don't wash out
        if os.path.exists(mtl_path):
            with open(mtl_path, "r", encoding="utf-8", errors="ignore") as f:
                mtl_lines = f.readlines()
            fixed_lines = []
            for line in mtl_lines:
                if line.startswith("Ka "):
                    fixed_lines.append("Ka 0.000000 0.000000 0.000000\n")
                elif line.startswith("Ks "):
                    fixed_lines.append("Ks 0.050000 0.050000 0.050000\n")
                elif line.startswith("map_Kd "):
                    raw_tex = line[len("map_Kd "):].strip()
                    tex_base = os.path.basename(raw_tex)
                    if os.path.exists(raw_tex) and not os.path.exists(os.path.join(tmp_obj_dir, tex_base)):
                        shutil.copy2(raw_tex, os.path.join(tmp_obj_dir, tex_base))
                    fixed_lines.append("Kd 1.000000 1.000000 1.000000\n")
                    fixed_lines.append(f"map_Kd {tex_base}\n")
                elif not line.startswith(("map_Bump", "bump ", "map_Ns", "map_d", "refl")):
                    fixed_lines.append(line)
            with open(mtl_path, "w", encoding="utf-8") as f:
                f.writelines(fixed_lines)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in sorted(os.listdir(tmp_obj_dir)):
                fpath = os.path.join(tmp_obj_dir, fname)
                if os.path.isfile(fpath):
                    zf.write(fpath, arcname=fname)

        # 2) Also export clean diffuse-only FBX (bake_anim=False) as backup
        out_fbx = os.path.join(EXPORT_DIR, f"{OUTFIT_PRESET}.fbx")
        bpy.ops.export_scene.fbx(
            filepath=out_fbx,
            use_selection=True,
            object_types={"MESH"},
            bake_anim=False,
            add_leaf_bones=False,
            path_mode="COPY",
            embed_textures=True,
            mesh_smooth_type="FACE",
            apply_scale_options="FBX_SCALE_ALL",
        )

        # Clean up temporary export files, mesh, and materials so the MPFB2 scene stays intact
        shutil.rmtree(tmp_obj_dir, ignore_errors=True)
        merged_mesh = merged.data
        bpy.data.objects.remove(merged, do_unlink=True)
        if merged_mesh.users == 0:
            bpy.data.meshes.remove(merged_mesh)
        for tm in temp_mats:
            if tm.users == 0:
                bpy.data.materials.remove(tm)

        bpy.ops.object.select_all(action="DESELECT")
        body.select_set(True)
        bpy.context.view_layer.objects.active = body
        print(f"Exported Mixamo ZIP (recommended): {zip_path}")
        print(f"Exported clean FBX (backup): {out_fbx}")


if __name__ == "__main__":
    main()
