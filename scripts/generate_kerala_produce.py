import bpy
import bmesh
import json
import math
import os
import random
from mathutils import Vector, Matrix

# ------------------------------------------------------------
# Config
# ------------------------------------------------------------
EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/produce"
TEX_DIR = "/Users/vishnuk/Documents/project/game/scripts/baked_textures/produce"
PHOTO_TEX_DIR = "/Users/vishnuk/Documents/project/game/scripts/textures/produce"
AUTO_BAKE = True
AUTO_EXPORT = True
BAKE_RES = 1024       # 1024x1024 per small produce item for crisp detail & fast load
BAKE_SAMPLES = 20

# Real-world 1960s-70s Kerala produce specs (1 Blender unit = 1 meter)
PRODUCE_SPECS = {
    # Fruits
    "banana_ripe":    {"category": "fruit",     "height_m": 0.18, "mass_kg": 0.15},
    "banana_bunch":   {"category": "fruit",     "height_m": 0.54, "mass_kg": 3.80},
    "coconut_tender": {"category": "fruit",     "height_m": 0.25, "mass_kg": 1.40},
    "coconut_open":   {"category": "fruit",     "height_m": 0.22, "mass_kg": 1.10},
    "jackfruit":      {"category": "fruit",     "height_m": 0.28, "mass_kg": 9.50},
    "mango":          {"category": "fruit",     "height_m": 0.12, "mass_kg": 0.32},
    "pineapple":      {"category": "fruit",     "height_m": 0.30, "mass_kg": 1.60},
    "papaya":         {"category": "fruit",     "height_m": 0.24, "mass_kg": 1.40},
    "guava":          {"category": "fruit",     "height_m": 0.085,"mass_kg": 0.18},
    # Vegetables
    "brinjal":        {"category": "vegetable", "height_m": 0.18, "mass_kg": 0.28},
    "okra":           {"category": "vegetable", "height_m": 0.14, "mass_kg": 0.03},
    "bottle_gourd":   {"category": "vegetable", "height_m": 0.36, "mass_kg": 1.20},
    "bitter_gourd":   {"category": "vegetable", "height_m": 0.20, "mass_kg": 0.18},
    "tapioca":        {"category": "vegetable", "height_m": 0.28, "mass_kg": 0.65},
    "red_onion":      {"category": "vegetable", "height_m": 0.085,"mass_kg": 0.14},
    "tomato":         {"category": "vegetable", "height_m": 0.075,"mass_kg": 0.13},
}

# ------------------------------------------------------------
# 1. Shared PBR Material Helpers (Realistic + AO)
# ------------------------------------------------------------
def clear_material(name):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (700, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (380, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nodes, links, bsdf

def rgba_mix(nodes, links, blend_type, factor, col_a, col_b):
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = blend_type
    mix.inputs[0].default_value = factor
    a_sock = next(s for s in mix.inputs if s.name == "A" and s.type == "RGBA")
    b_sock = next(s for s in mix.inputs if s.name == "B" and s.type == "RGBA")
    r_sock = next(s for s in mix.outputs if s.name == "Result" and s.type == "RGBA")
    links.new(col_a, a_sock)
    links.new(col_b, b_sock)
    return r_sock

def apply_ao(nodes, links, base_color_socket, ao_strength=0.45, ao_dist=0.18):
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 8
    ao.inputs["Distance"].default_value = ao_dist
    links.new(base_color_socket, ao.inputs["Color"])
    return rgba_mix(nodes, links, "MULTIPLY", ao_strength, base_color_socket, ao.outputs["AO"])

def make_produce_material(name, col_a, col_b, scale=18.0, roughness=0.48, bump_str=0.14, subsurface=0.0):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat, nodes, links, bsdf = clear_material(name)
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.65
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = (*col_a, 1.0)
    ramp.color_ramp.elements[1].position = 0.76
    ramp.color_ramp.elements[1].color = (*col_b, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.42), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    if "Subsurface Weight" in bsdf.inputs and subsurface > 0:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
    if bump_str > 0:
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_str
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def get_materials():
    return {
        "banana_ripe":   make_produce_material("Prod_Banana_Ripe",   (0.68, 0.50, 0.05), (0.88, 0.72, 0.14), 16.0, 0.46, 0.08, 0.08),
        "banana_green":  make_produce_material("Prod_Banana_Green",  (0.20, 0.36, 0.07), (0.38, 0.50, 0.12), 16.0, 0.50, 0.08),
        "coconut_g":     make_produce_material("Prod_Coconut_Green", (0.14, 0.34, 0.07), (0.28, 0.48, 0.12), 12.0, 0.50, 0.10),
        "coconut_o":     make_produce_material("Prod_Coconut_Orange",(0.66, 0.32, 0.05), (0.84, 0.48, 0.10), 12.0, 0.46, 0.10),
        "coconut_meat":  make_produce_material("Prod_Coconut_Meat",  (0.86, 0.85, 0.78), (0.94, 0.93, 0.88), 10.0, 0.38, 0.04, 0.15),
        "jackfruit":     make_produce_material("Prod_Jackfruit",     (0.16, 0.26, 0.05), (0.36, 0.42, 0.09), 34.0, 0.68, 0.65),
        "mango":         make_produce_material("Prod_Mango",         (0.76, 0.22, 0.03), (0.90, 0.62, 0.07), 10.0, 0.34, 0.04, 0.10),
        "pineapple":     make_produce_material("Prod_Pineapple",     (0.38, 0.24, 0.04), (0.68, 0.48, 0.08), 28.0, 0.60, 0.55),
        "papaya":        make_produce_material("Prod_Papaya",        (0.22, 0.38, 0.07), (0.78, 0.48, 0.07),  9.0, 0.40, 0.06, 0.08),
        "guava":         make_produce_material("Prod_Guava",         (0.26, 0.46, 0.10), (0.52, 0.64, 0.18), 14.0, 0.42, 0.06, 0.08),
        "brinjal":       make_produce_material("Prod_Brinjal",       (0.14, 0.04, 0.18), (0.28, 0.08, 0.34), 12.0, 0.24, 0.03, 0.06),
        "okra":          make_produce_material("Prod_Okra",          (0.12, 0.32, 0.06), (0.24, 0.46, 0.11), 22.0, 0.56, 0.16),
        "bottle_gourd":  make_produce_material("Prod_BottleGourd",   (0.34, 0.52, 0.20), (0.50, 0.66, 0.32), 10.0, 0.42, 0.06, 0.06),
        "bitter_gourd":  make_produce_material("Prod_BitterGourd",   (0.08, 0.22, 0.04), (0.18, 0.36, 0.08), 32.0, 0.52, 0.60),
        "tapioca":       make_produce_material("Prod_Tapioca",       (0.20, 0.12, 0.06), (0.34, 0.22, 0.12), 20.0, 0.88, 0.45),
        "red_onion":     make_produce_material("Prod_RedOnion",      (0.32, 0.07, 0.12), (0.52, 0.14, 0.20), 18.0, 0.45, 0.15),
        "tomato":        make_produce_material("Prod_Tomato",        (0.62, 0.06, 0.03), (0.82, 0.14, 0.05), 12.0, 0.22, 0.03, 0.12),
        "stem":          make_produce_material("Prod_Stem",          (0.10, 0.20, 0.05), (0.20, 0.32, 0.08), 16.0, 0.70, 0.20),
        "wood":          make_produce_material("Prod_Wood",          (0.12, 0.07, 0.03), (0.24, 0.14, 0.06), 14.0, 0.78, 0.25),
        "bamboo":        make_produce_material("Prod_Bamboo",        (0.34, 0.26, 0.10), (0.54, 0.42, 0.18), 14.0, 0.68, 0.15),
    }

# ------------------------------------------------------------
# 2. Organic BMesh Lathe & Sweep Utilities
# ------------------------------------------------------------
def link_obj(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj

def create_lathe_mesh(col, name, profile_rz, mat, segs=16, ridge_fn=None, loc=(0, 0, 0), rot=(0, 0, 0), bend_x=0.0):
    """Builds a smooth, watertight organic mesh from a (radius, z) profile."""
    bm = bmesh.new()
    rings = []
    n_prof = len(profile_rz)
    for iz, (r, z) in enumerate(profile_rz):
        t = iz / max(1, n_prof - 1)
        if r <= 0.0005:
            v = bm.verts.new((0.0, 0.0, z))
            rings.append([v])
        else:
            ring = []
            for iseg in range(segs):
                ang = (iseg / segs) * math.pi * 2.0
                rr = r * (1.0 + ridge_fn(ang, t)) if ridge_fn else r
                bx = bend_x * (t - 0.5) ** 2 * 4.0
                ring.append(bm.verts.new((math.cos(ang) * rr + bx, math.sin(ang) * rr, z)))
            rings.append(ring)

    for iz in range(n_prof - 1):
        r0 = rings[iz]
        r1 = rings[iz + 1]
        if len(r0) == 1 and len(r1) > 1:
            for iseg in range(segs):
                bm.faces.new((r0[0], r1[(iseg + 1) % segs], r1[iseg]))
        elif len(r0) > 1 and len(r1) == 1:
            for iseg in range(segs):
                bm.faces.new((r0[iseg], r0[(iseg + 1) % segs], r1[0]))
        elif len(r0) > 1 and len(r1) > 1:
            for iseg in range(segs):
                jn = (iseg + 1) % segs
                bm.faces.new((r0[iseg], r0[jn], r1[jn], r1[iseg]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    return link_obj(obj, col)

def join_and_ground(col, objects, name, mass_kg):
    """Joins parts into one clean mesh with origin at bottom-center (z=0) and stores mass_kg."""
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name

    # Shift origin to bottom-center (0, 0, min_z)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    min_z = min(v.co.z for v in obj.data.vertices)
    cx = sum(v.co.x for v in obj.data.vertices) / len(obj.data.vertices)
    cy = sum(v.co.y for v in obj.data.vertices) / len(obj.data.vertices)
    for v in obj.data.vertices:
        v.co.x -= cx
        v.co.y -= cy
        v.co.z -= min_z
    obj.location = (0.0, 0.0, 0.0)
    obj["mass_kg"] = float(mass_kg)
    return obj

# ------------------------------------------------------------
# 3. 16 Individual Kerala Fruit & Vegetable Builders
# ------------------------------------------------------------
def build_banana_ripe(col, mats, ripe=True):
    m = mats["banana_ripe"] if ripe else mats["banana_green"]
    prof = [
        (0.000, 0.000), (0.009, 0.012), (0.017, 0.045),
        (0.020, 0.090), (0.018, 0.135), (0.011, 0.165),
        (0.006, 0.180), (0.000, 0.182),
    ]
    # Subtle 5-sided banana ridge
    b = create_lathe_mesh(col, "Banana_Body", prof, m, segs=10, ridge_fn=lambda a, t: 0.06 * math.cos(5 * a), bend_x=0.032)
    return join_and_ground(col, [b], "banana_ripe" if ripe else "banana_green", 0.15)

def build_banana_bunch(col, mats):
    parts = []
    # Central stalk (thandu) hanging from top (z=0.54) to bottom (z=0.04)
    stalk_prof = [(0.0, 0.04), (0.014, 0.05), (0.019, 0.25), (0.026, 0.48), (0.028, 0.54), (0.0, 0.545)]
    parts.append(create_lathe_mesh(col, "Bunch_Stalk", stalk_prof, mats["stem"], segs=10))

    # 4 dense tiered hands (padala) of bananas hanging downward and outward
    for tier in range(4):
        tz = 0.45 - tier * 0.095
        count = 9 - tier  # 9, 8, 7, 6 bananas per hand
        for i in range(count):
            ang = (i / count) * math.pi * 2.0 + tier * 0.38
            # Outward + downward direction: +Z of banana points down (~140 deg from +Z) and radially out
            tilt = math.radians(142.0 - tier * 4.0)
            dir_vec = Vector((math.cos(ang) * math.sin(tilt), math.sin(ang) * math.sin(tilt), math.cos(tilt))).normalized()
            rot_euler = Vector((0.0, 0.0, 1.0)).rotation_difference(dir_vec).to_euler()
            prof = [(0.0, 0.0), (0.011, 0.015), (0.017, 0.055), (0.018, 0.10), (0.013, 0.145), (0.006, 0.168), (0.0, 0.172)]
            b = create_lathe_mesh(
                col, f"B_{tier}_{i}", prof, mats["banana_ripe"], segs=8,
                ridge_fn=lambda a, t: 0.06 * math.cos(5 * a), bend_x=0.022,
                loc=(math.cos(ang) * 0.024, math.sin(ang) * 0.024, tz),
                rot=rot_euler
            )
            parts.append(b)
    return join_and_ground(col, parts, "banana_bunch", 3.80)

def build_coconut_tender(col, mats, orange=False):
    m = mats["coconut_o"] if orange else mats["coconut_g"]
    prof = [
        (0.000, 0.000), (0.055, 0.018), (0.095, 0.075),
        (0.105, 0.135), (0.088, 0.195), (0.050, 0.232),
        (0.018, 0.245), (0.000, 0.248),
    ]
    body = create_lathe_mesh(col, "Karikku_Body", prof, m, segs=16, ridge_fn=lambda a, t: 0.045 * math.cos(3 * a))
    cap_prof = [(0.0, 0.236), (0.042, 0.242), (0.036, 0.254), (0.0, 0.256)]
    cap = create_lathe_mesh(col, "Karikku_Cap", cap_prof, mats["wood"], segs=9, ridge_fn=lambda a, t: 0.10 * math.cos(3 * a))
    return join_and_ground(col, [body, cap], "coconut_tender", 1.40)

def build_coconut_open(col, mats):
    prof = [
        (0.000, 0.000), (0.055, 0.018), (0.095, 0.075),
        (0.102, 0.135), (0.082, 0.175), (0.000, 0.176),
    ]
    body = create_lathe_mesh(col, "Open_Body", prof, mats["coconut_g"], segs=16, ridge_fn=lambda a, t: 0.04 * math.cos(3 * a))
    meat_prof = [(0.0, 0.172), (0.068, 0.174), (0.066, 0.184), (0.0, 0.184)]
    meat = create_lathe_mesh(col, "Open_Meat", meat_prof, mats["coconut_meat"], segs=16)
    straw_prof = [(0.0, 0.0), (0.006, 0.0), (0.006, 0.20), (0.0, 0.20)]
    straw = create_lathe_mesh(col, "Open_Straw", straw_prof, mats["bamboo"], segs=8, loc=(0.02, 0.0, 0.08), rot=(0.25, 0.15, 0.0))
    return join_and_ground(col, [body, meat, straw], "coconut_open", 1.10)

def build_jackfruit(col, mats):
    prof = [
        (0.000, 0.000), (0.085, 0.028), (0.135, 0.095),
        (0.145, 0.195), (0.130, 0.300), (0.082, 0.380),
        (0.025, 0.415), (0.000, 0.420),
    ]
    body = create_lathe_mesh(
        col, "Chakka_Body", prof, mats["jackfruit"], segs=18,
        ridge_fn=lambda a, t: 0.035 * math.sin(10 * a) * math.sin(14 * t * math.pi),
        rot=(0.0, math.pi / 2.0, 0.0)
    )
    stem_prof = [(0.0, 0.0), (0.016, 0.0), (0.014, 0.07), (0.0, 0.072)]
    stem = create_lathe_mesh(col, "Chakka_Stem", stem_prof, mats["wood"], segs=8, loc=(-0.02, 0.0, 0.14), rot=(0.0, -math.pi / 2.0, 0.0))
    return join_and_ground(col, [body, stem], "jackfruit", 9.50)

def build_mango(col, mats):
    prof = [
        (0.000, 0.000), (0.026, 0.012), (0.044, 0.042),
        (0.046, 0.076), (0.032, 0.105), (0.010, 0.118), (0.000, 0.120),
    ]
    body = create_lathe_mesh(col, "Mango_Body", prof, mats["mango"], segs=14, bend_x=0.012)
    stem_prof = [(0.0, 0.116), (0.004, 0.118), (0.004, 0.130), (0.0, 0.131)]
    stem = create_lathe_mesh(col, "Mango_Stem", stem_prof, mats["stem"], segs=6)
    return join_and_ground(col, [body, stem], "mango", 0.32)

def build_pineapple(col, mats):
    parts = []
    prof = [
        (0.000, 0.000), (0.048, 0.016), (0.076, 0.065),
        (0.078, 0.125), (0.062, 0.175), (0.025, 0.195), (0.000, 0.200),
    ]
    parts.append(create_lathe_mesh(
        col, "Pineapple_Body", prof, mats["pineapple"], segs=14,
        ridge_fn=lambda a, t: 0.04 * math.sin(8 * a + t * 12)
    ))
    for ring in range(2):
        count = 7 - ring * 2
        for i in range(count):
            ang = (i / count) * math.pi * 2.0 + ring * 0.4
            tilt = 0.55 - ring * 0.28
            l_prof = [(0.0, 0.0), (0.014, 0.02), (0.010, 0.07), (0.002, 0.11), (0.0, 0.115)]
            leaf = create_lathe_mesh(
                col, f"Pin_Leaf_{ring}_{i}", l_prof, mats["stem"], segs=6,
                loc=(math.cos(ang) * 0.018, math.sin(ang) * 0.018, 0.19 + ring * 0.015),
                rot=(math.sin(ang) * tilt, -math.cos(ang) * tilt, ang)
            )
            parts.append(leaf)
    return join_and_ground(col, parts, "pineapple", 1.60)

def build_papaya(col, mats):
    prof = [
        (0.000, 0.000), (0.042, 0.020), (0.068, 0.075),
        (0.072, 0.135), (0.056, 0.195), (0.028, 0.230), (0.000, 0.240),
    ]
    body = create_lathe_mesh(col, "Papaya_Body", prof, mats["papaya"], segs=14, ridge_fn=lambda a, t: 0.03 * math.cos(5 * a))
    return join_and_ground(col, [body], "papaya", 1.40)

def build_guava(col, mats):
    prof = [
        (0.000, 0.000), (0.028, 0.012), (0.043, 0.042),
        (0.040, 0.068), (0.018, 0.082), (0.000, 0.085),
    ]
    body = create_lathe_mesh(col, "Guava_Body", prof, mats["guava"], segs=12)
    return join_and_ground(col, [body], "guava", 0.18)

def build_brinjal(col, mats):
    prof = [
        (0.000, 0.000), (0.036, 0.016), (0.046, 0.052),
        (0.040, 0.105), (0.028, 0.145), (0.014, 0.162), (0.000, 0.165),
    ]
    body = create_lathe_mesh(col, "Brinjal_Body", prof, mats["brinjal"], segs=14)
    calyx_prof = [(0.0, 0.155), (0.032, 0.158), (0.016, 0.168), (0.005, 0.180), (0.0, 0.182)]
    calyx = create_lathe_mesh(col, "Brinjal_Calyx", calyx_prof, mats["stem"], segs=10, ridge_fn=lambda a, t: 0.22 * math.cos(5 * a) * (1 - t))
    return join_and_ground(col, [body, calyx], "brinjal", 0.28)

def build_okra(col, mats):
    prof = [
        (0.000, 0.000), (0.004, 0.025), (0.009, 0.065),
        (0.012, 0.105), (0.011, 0.130), (0.004, 0.140), (0.000, 0.142),
    ]
    body = create_lathe_mesh(col, "Okra_Body", prof, mats["okra"], segs=10, ridge_fn=lambda a, t: 0.10 * math.cos(5 * a), bend_x=0.006)
    return join_and_ground(col, [body], "okra", 0.03)

def build_bottle_gourd(col, mats):
    prof = [
        (0.000, 0.000), (0.052, 0.025), (0.068, 0.095),
        (0.058, 0.185), (0.038, 0.265), (0.026, 0.325),
        (0.012, 0.352), (0.000, 0.360),
    ]
    body = create_lathe_mesh(col, "BottleGourd_Body", prof, mats["bottle_gourd"], segs=14)
    return join_and_ground(col, [body], "bottle_gourd", 1.20)

def build_bitter_gourd(col, mats):
    prof = [
        (0.000, 0.000), (0.012, 0.020), (0.026, 0.065),
        (0.028, 0.110), (0.024, 0.155), (0.010, 0.190), (0.000, 0.200),
    ]
    body = create_lathe_mesh(
        col, "BitterGourd_Body", prof, mats["bitter_gourd"], segs=12,
        ridge_fn=lambda a, t: 0.14 * math.cos(7 * a) + 0.08 * math.sin(18 * t * math.pi)
    )
    return join_and_ground(col, [body], "bitter_gourd", 0.18)

def build_tapioca(col, mats):
    prof = [
        (0.000, 0.000), (0.015, 0.025), (0.032, 0.085),
        (0.036, 0.165), (0.030, 0.235), (0.016, 0.272), (0.000, 0.280),
    ]
    body = create_lathe_mesh(
        col, "Tapioca_Body", prof, mats["tapioca"], segs=12,
        ridge_fn=lambda a, t: 0.06 * math.sin(4 * a + t * 6),
        bend_x=0.015
    )
    return join_and_ground(col, [body], "tapioca", 0.65)

def build_red_onion(col, mats):
    prof = [
        (0.000, 0.000), (0.026, 0.012), (0.042, 0.036),
        (0.038, 0.060), (0.014, 0.078), (0.005, 0.085), (0.000, 0.086),
    ]
    body = create_lathe_mesh(col, "Onion_Body", prof, mats["red_onion"], segs=14, ridge_fn=lambda a, t: 0.025 * math.cos(10 * a))
    return join_and_ground(col, [body], "red_onion", 0.14)

def build_tomato(col, mats):
    prof = [
        (0.000, 0.000), (0.028, 0.010), (0.042, 0.035),
        (0.038, 0.058), (0.018, 0.070), (0.000, 0.072),
    ]
    body = create_lathe_mesh(col, "Tomato_Body", prof, mats["tomato"], segs=14, ridge_fn=lambda a, t: 0.04 * math.cos(5 * a))
    calyx_prof = [(0.0, 0.068), (0.018, 0.070), (0.004, 0.076), (0.0, 0.078)]
    calyx = create_lathe_mesh(col, "Tomato_Calyx", calyx_prof, mats["stem"], segs=10, ridge_fn=lambda a, t: 0.35 * math.cos(5 * a) * (1 - t))
    return join_and_ground(col, [body, calyx], "tomato", 0.13)

BUILDERS = {
    "banana_ripe":    lambda col, mats: build_banana_ripe(col, mats, True),
    "banana_bunch":   build_banana_bunch,
    "coconut_tender": lambda col, mats: build_coconut_tender(col, mats, False),
    "coconut_open":   build_coconut_open,
    "jackfruit":      build_jackfruit,
    "mango":          build_mango,
    "pineapple":      build_pineapple,
    "papaya":         build_papaya,
    "guava":          build_guava,
    "brinjal":        build_brinjal,
    "okra":           build_okra,
    "bottle_gourd":   build_bottle_gourd,
    "bitter_gourd":   build_bitter_gourd,
    "tapioca":        build_tapioca,
    "red_onion":      build_red_onion,
    "tomato":         build_tomato,
}

def build_produce(name, col, loc=(0.0, 0.0, 0.0), rot=(0.0, 0.0, 0.0), scale=1.0):
    """Public helper so other Blender scripts (shops, carts, farms) reuse the exact same produce."""
    mats = get_materials()
    obj = BUILDERS[name](col, mats)
    obj.location = loc
    obj.rotation_euler = rot
    obj.scale = (scale, scale, scale)
    return obj

# ------------------------------------------------------------
# 4. Smart UV Unwrap, 1K Cycles PBR Baking & GLB Export
# ------------------------------------------------------------
def reset_collection(name):
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col

def fresh_image(name, width, height):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    return bpy.data.images.new(name, width=width, height=height)

def unwrap_and_bake_object(obj, name):
    os.makedirs(TEX_DIR, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")

    img_albedo = fresh_image(f"{name}_albedo", BAKE_RES, BAKE_RES)
    img_rough  = fresh_image(f"{name}_roughness", BAKE_RES, BAKE_RES)
    img_normal = fresh_image(f"{name}_normal", BAKE_RES, BAKE_RES)
    img_rough.colorspace_settings.name = "Non-Color"
    img_normal.colorspace_settings.name = "Non-Color"

    used_mats = {m for m in obj.data.materials if m}
    temp_nodes = []
    for m in used_mats:
        tn = m.node_tree.nodes.new("ShaderNodeTexImage")
        tn.name = "__BAKE_TARGET__"
        m.node_tree.nodes.active = tn
        temp_nodes.append((m, tn))

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = BAKE_SAMPLES
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 4
    scene.render.bake.use_clear = True

    def run_bake(bake_type, img, filepath):
        for _m, tn in temp_nodes:
            tn.image = img
        if bake_type == "DIFFUSE":
            scene.render.bake.use_pass_direct = False
            scene.render.bake.use_pass_indirect = False
            scene.render.bake.use_pass_color = True
        bpy.ops.object.bake(type=bake_type)
        img.filepath_raw = filepath
        img.file_format = "PNG"
        img.save()
        img.pack()

    run_bake("DIFFUSE",   img_albedo, os.path.join(TEX_DIR, f"{name}_albedo.png"))
    run_bake("ROUGHNESS", img_rough,  os.path.join(TEX_DIR, f"{name}_roughness.png"))
    run_bake("NORMAL",    img_normal, os.path.join(TEX_DIR, f"{name}_normal.png"))

    for m, tn in temp_nodes:
        m.node_tree.nodes.remove(tn)

    baked_mat, nodes, links, bsdf = clear_material(f"{name}_Baked")
    uv = nodes.new("ShaderNodeTexCoord")
    for img, inp in ((img_albedo, "Base Color"), (img_rough, "Roughness")):
        tn = nodes.new("ShaderNodeTexImage")
        tn.image = img
        links.new(uv.outputs["UV"], tn.inputs["Vector"])
        links.new(tn.outputs["Color"], bsdf.inputs[inp])
    tn_n = nodes.new("ShaderNodeTexImage")
    tn_n.image = img_normal
    links.new(uv.outputs["UV"], tn_n.inputs["Vector"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.85
    links.new(tn_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    obj.data.materials.clear()
    obj.data.materials.append(baked_mat)

if __name__ == "__main__":
    if AUTO_EXPORT:
        os.makedirs(EXPORT_DIR, exist_ok=True)
        manifest_path = os.path.join(EXPORT_DIR, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(PRODUCE_SPECS, f, indent=2)

    mats = get_materials()
    for idx, (name, spec) in enumerate(PRODUCE_SPECS.items()):
        col = reset_collection(f"produce_{name}")
        obj = BUILDERS[name](col, mats)

        if AUTO_BAKE:
            print(f"Baking PBR+AO for {name}...")
            unwrap_and_bake_object(obj, name)

        if AUTO_EXPORT:
            bpy.ops.object.select_all(action="DESELECT")
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            out_path = os.path.join(EXPORT_DIR, f"{name}.glb")
            bpy.ops.export_scene.gltf(
                filepath=out_path,
                export_format="GLB",
                use_selection=True,
                export_yup=True,
                export_apply=True,
                export_morph=False,
                export_animations=False,
                export_extras=True,
            )
            print("Exported:", out_path)

        # Lay out neatly in a 4x4 grid in Blender viewport for preview
        obj.location.x = (idx % 4) * 0.65 - 1.0
        obj.location.y = (idx // 4) * 0.65 - 1.0

    bpy.ops.object.select_all(action="DESELECT")
    print("Done! All 16 Kerala fruits & vegetables generated, baked, and exported.")
