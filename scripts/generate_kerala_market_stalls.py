import bpy
import bmesh
import math
import os
import random
import sys
from mathutils import Vector, Euler

SCRIPTS_DIR = "/Users/vishnuk/Documents/project/game/scripts"
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)
import generate_kerala_produce as produce

# ------------------------------------------------------------
# Config
# ------------------------------------------------------------
EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models"
TEX_DIR = "/Users/vishnuk/Documents/project/game/scripts/baked_textures"
PHOTO_TEX_DIR = "/Users/vishnuk/Documents/project/game/scripts/textures"
AUTO_BAKE = True
AUTO_EXPORT = True
BAKE_RES = 2048
BAKE_SAMPLES = 24

rng = random.Random(1972)

# ------------------------------------------------------------
# 1. Old Kerala PBR Materials (2048x2048 + AO)
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

def apply_ao(nodes, links, base_color_socket, ao_strength=0.52, ao_dist=0.45):
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 8
    ao.inputs["Distance"].default_value = ao_dist
    links.new(base_color_socket, ao.inputs["Color"])
    return rgba_mix(nodes, links, "MULTIPLY", ao_strength, base_color_socket, ao.outputs["AO"])

def make_bamboo_material():
    mat, nodes, links, bsdf = clear_material("OldKerala_Bamboo")
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (4.0, 4.0, 0.8)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 8.0
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.28, 0.21, 0.09, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (0.50, 0.39, 0.17, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.55), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.72
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_palm_thatch_material():
    mat, nodes, links, bsdf = clear_material("OldKerala_OlaThatch")
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.5, 16.0, 1.5)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 14.0
    wave.inputs["Distortion"].default_value = 3.5
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 12.0
    noise.inputs["Detail"].default_value = 9.0
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    mixed = rgba_mix(nodes, links, "OVERLAY", 0.45, wave.outputs["Color"], noise.outputs["Color"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.16, 0.12, 0.05, 1.0)
    e_mid = ramp.color_ramp.elements.new(0.55)
    e_mid.color = (0.31, 0.24, 0.10, 1.0)
    ramp.color_ramp.elements[2].position = 0.85
    ramp.color_ramp.elements[2].color = (0.43, 0.34, 0.15, 1.0)
    links.new(mixed, ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.60), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.94
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.55
    links.new(mixed, bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_weathered_wood_material(name, dark_col, light_col, roughness=0.68):
    mat, nodes, links, bsdf = clear_material(name)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 7.0)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.inputs["Scale"].default_value = 5.5
    wave.inputs["Distortion"].default_value = 5.0
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = (*dark_col, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (*light_col, 1.0)
    links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.52), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    links.new(wave.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_organic_material(name, col_a, col_b, scale=8.0, roughness=0.58, bump_str=0.18, metallic=0.0):
    mat, nodes, links, bsdf = clear_material(name)
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6.0
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = (*col_a, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*col_b, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.45), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if bump_str > 0:
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_str
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_simple_material(name, base_color, roughness, metallic=0.0):
    mat, nodes, links, bsdf = clear_material(name)
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

mat_bamboo       = make_bamboo_material()
mat_thatch       = make_palm_thatch_material()
mat_teak         = make_weathered_wood_material("OldKerala_Teak",   (0.07, 0.035, 0.018), (0.17, 0.09, 0.045), 0.66)
mat_coir         = make_organic_material("OldKerala_Coir",        (0.18, 0.11, 0.05),   (0.30, 0.20, 0.09),  18.0, 0.95, 0.35)
mat_basket       = make_organic_material("OldKerala_Kooda",       (0.28, 0.19, 0.08),   (0.46, 0.34, 0.15),  14.0, 0.85, 0.30)
mat_banana_leaf  = make_organic_material("OldKerala_Vazhayila",   (0.09, 0.28, 0.06),   (0.18, 0.40, 0.10),  10.0, 0.48, 0.12)
mat_clay         = make_organic_material("OldKerala_Terracotta",  (0.36, 0.13, 0.06),   (0.50, 0.20, 0.10),   8.0, 0.85, 0.22)

# Fruit & Coconut Materials
mat_banana_ripe  = make_organic_material("Fruit_Banana_Ripe",   (0.68, 0.50, 0.06),   (0.86, 0.70, 0.14),  12.0, 0.52, 0.08)
mat_banana_green = make_organic_material("Fruit_Banana_Green",  (0.22, 0.36, 0.08),   (0.38, 0.48, 0.12),  12.0, 0.55, 0.08)
mat_jackfruit    = make_organic_material("Fruit_Jackfruit",     (0.18, 0.28, 0.06),   (0.34, 0.40, 0.10),  24.0, 0.72, 0.55)
mat_mango        = make_organic_material("Fruit_Mango",         (0.76, 0.28, 0.04),   (0.88, 0.60, 0.08),   8.0, 0.40, 0.05)
mat_pineapple    = make_organic_material("Fruit_Pineapple",     (0.42, 0.28, 0.04),   (0.66, 0.46, 0.08),  22.0, 0.65, 0.48)
mat_papaya       = make_organic_material("Fruit_Papaya",        (0.24, 0.40, 0.08),   (0.74, 0.48, 0.08),   7.0, 0.45, 0.06)
mat_guava        = make_organic_material("Fruit_Guava",         (0.28, 0.48, 0.12),   (0.50, 0.62, 0.20),  10.0, 0.48, 0.06)
mat_leaf_green   = make_organic_material("Fruit_Leaf_Green",    (0.08, 0.24, 0.05),   (0.16, 0.34, 0.08),  12.0, 0.60, 0.10)
mat_coconut_g    = make_organic_material("Coconut_Green",       (0.16, 0.34, 0.08),   (0.28, 0.46, 0.13),   9.0, 0.54, 0.10)
mat_coconut_o    = make_organic_material("Coconut_Orange",      (0.66, 0.34, 0.06),   (0.82, 0.50, 0.12),   9.0, 0.50, 0.10)
mat_coconut_meat = make_simple_material("Coconut_Meat",         (0.88, 0.86, 0.80), 0.45)
mat_fish_silver  = make_organic_material("Fish_Silver",         (0.32, 0.44, 0.52),   (0.66, 0.74, 0.78), 14.0, 0.28, 0.10, metallic=0.35)
mat_fish_slate   = make_organic_material("Fish_Slate",          (0.18, 0.24, 0.28),   (0.42, 0.50, 0.54), 12.0, 0.30, 0.12, metallic=0.25)
mat_prawn        = make_organic_material("Fish_Prawn",          (0.68, 0.34, 0.24),   (0.84, 0.52, 0.38), 16.0, 0.38, 0.08)
mat_brass        = make_simple_material("OldKerala_Brass",      (0.70, 0.50, 0.16), 0.36, metallic=0.82)
mat_iron         = make_simple_material("OldKerala_Iron",       (0.16, 0.16, 0.17), 0.48, metallic=0.80)

UNBAKED_MATS = {mat_iron, mat_brass}

# ------------------------------------------------------------
# 2. Geometry Helpers (Bamboo, Palm Leaf Thatch, Baskets, Fruits)
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

def link(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj

def add_box(col, name, size_xyz, loc_xyz, mat, rot_xyz=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc_xyz, rotation=rot_xyz)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size_xyz
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    return link(obj, col)

def add_cylinder(col, name, radius, depth, loc_xyz, mat, verts=12, rot_xyz=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc_xyz, rotation=rot_xyz)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return link(obj, col)

def add_sphere(col, name, radius, loc_xyz, mat, scale_xyz=(1, 1, 1), rot_xyz=(0, 0, 0), segs=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=radius, location=loc_xyz, rotation=rot_xyz)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale_xyz
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return link(obj, col)

def add_bamboo_pole(col, name, p1, p2, radius=0.052, add_nodes=True):
    """Creates a realistic segmented bamboo pole between two 3D points with raised node rings."""
    v1 = Vector(p1)
    v2 = Vector(p2)
    diff = v2 - v1
    length = diff.length
    mid = (v1 + v2) * 0.5
    quat = Vector((0, 0, 1)).rotation_difference(diff.normalized())
    rot = quat.to_euler()

    pole = add_cylinder(col, name, radius, length, mid, mat_bamboo, verts=10, rot_xyz=rot)
    if add_nodes and length > 0.45:
        node_count = max(1, int(length / 0.42))
        for i in range(1, node_count):
            t = i / node_count
            npos = v1.lerp(v2, t)
            add_cylinder(col, f"{name}_Node_{i}", radius * 1.15, 0.024, npos, mat_bamboo, verts=10, rot_xyz=rot)
    return pole

def add_coir_lashing(col, name, loc, radius=0.072):
    """Dark coir-rope knot tying bamboo joints together."""
    return add_sphere(col, name, radius, loc, mat_coir, scale_xyz=(1.1, 1.1, 0.9), segs=8, rings=6)

def add_bamboo_palm_roof(col, width=3.10, depth=2.15, ridge_z=2.68, eave_z=2.18):
    """Authentic 1960s-70s Kerala pitched palm-leaf (ola) roof on bamboo rafters."""
    half_w = width * 0.5
    half_d = depth * 0.5

    # Ridge bamboo beam + front/back eave purlins
    add_bamboo_pole(col, "Roof_Ridge_Bamboo", (-half_w, 0.0, ridge_z), (half_w, 0.0, ridge_z), 0.045)
    add_bamboo_pole(col, "Roof_Eave_Front",   (-half_w, half_d, eave_z), (half_w, half_d, eave_z), 0.042)
    add_bamboo_pole(col, "Roof_Eave_Back",    (-half_w, -half_d, eave_z), (half_w, -half_d, eave_z), 0.042)

    # Sloped bamboo rafters + coir lashings
    for rx in (-1.25, -0.42, 0.42, 1.25):
        add_bamboo_pole(col, f"Rafter_F_{rx:.2f}", (rx, 0.0, ridge_z), (rx, half_d + 0.08, eave_z - 0.03), 0.032, add_nodes=False)
        add_bamboo_pole(col, f"Rafter_B_{rx:.2f}", (rx, 0.0, ridge_z), (rx, -half_d - 0.08, eave_z - 0.03), 0.032, add_nodes=False)
        add_coir_lashing(col, f"Lash_R_{rx:.2f}", (rx, 0.0, ridge_z), 0.055)

    # Stepped overlapping palm-leaf (ola) thatch courses (4 courses per slope)
    slope_angle = math.atan2(ridge_z - eave_z, half_d)
    slope_len = math.hypot(half_d + 0.14, ridge_z - eave_z)
    courses = 4

    for side_label, sign_y, rot_x in (("Front", 1.0, -slope_angle), ("Back", -1.0, slope_angle)):
        for c in range(courses):
            t0 = c / courses
            t1 = (c + 1) / courses
            tm = (t0 + t1) * 0.5
            cy = sign_y * (half_d + 0.12) * (1.0 - tm)
            cz = eave_z + (ridge_z - eave_z) * tm + 0.055 + c * 0.012
            c_depth = (slope_len / courses) + 0.16

            bm = bmesh.new()
            segs_x = 18
            for ix in range(segs_x + 1):
                u = ix / segs_x
                x = -half_w + u * width
                # Organic scalloped palm-leaf edge overhang
                jagged = math.sin(u * math.pi * 11.0 + c * 1.7) * 0.045 + rng.uniform(-0.02, 0.02)
                y_bot = -c_depth * 0.5 - jagged
                y_top =  c_depth * 0.5
                v_bl = bm.verts.new((x, y_bot, -0.022))
                v_br = bm.verts.new((x, y_top,  0.022))
                v_tl = bm.verts.new((x, y_bot,  0.038))
                v_tr = bm.verts.new((x, y_top,  0.068))
                if ix > 0:
                    pass
            bm.verts.ensure_lookup_table()
            for ix in range(segs_x):
                b0 = ix * 4
                b1 = (ix + 1) * 4
                bm.faces.new((bm.verts[b0 + 2], bm.verts[b1 + 2], bm.verts[b1 + 3], bm.verts[b0 + 3]))  # top
                bm.faces.new((bm.verts[b0 + 0], bm.verts[b0 + 1], bm.verts[b1 + 1], bm.verts[b1 + 0]))  # bottom
                bm.faces.new((bm.verts[b0 + 0], bm.verts[b1 + 0], bm.verts[b1 + 2], bm.verts[b0 + 2]))  # eave edge
                bm.faces.new((bm.verts[b0 + 1], bm.verts[b0 + 3], bm.verts[b1 + 3], bm.verts[b1 + 1]))  # top edge
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            mesh = bpy.data.meshes.new(f"Ola_{side_label}_{c}")
            bm.to_mesh(mesh)
            bm.free()
            obj = bpy.data.objects.new(f"Ola_{side_label}_{c}", mesh)
            obj.location = (0.0, cy, cz)
            obj.rotation_euler = (rot_x, 0.0, 0.0)
            obj.data.materials.append(mat_thatch)
            link(obj, col)

    # Ridge cap thatch bundle
    add_cylinder(col, "Ola_Ridge_Cap", 0.095, width + 0.14, (0, 0, ridge_z + 0.09), mat_thatch, verts=10, rot_xyz=(0, math.pi / 2, 0))

def add_old_kerala_bamboo_stall_base(col):
    """Bamboo-pillared 1960s-70s Kerala wayside shop frame (footprint ~3.0 x 1.9 m, front = +Y)."""
    # Weathered teak & bamboo counter
    add_box(col, "Counter_Base", (2.48, 1.12, 0.80), (0, 0, 0.40), mat_teak, bevel=0.01)
    # Individual bamboo/wood slats on counter top
    for i in range(6):
        sy = -0.50 + i * 0.20
        add_box(col, f"Counter_Plank_{i}", (2.68, 0.18, 0.06), (0, sy, 0.85), mat_teak, bevel=0.008)
    # Front bamboo trim rail
    add_bamboo_pole(col, "Counter_Front_Rail", (-1.34, 0.60, 0.85), (1.34, 0.60, 0.85), 0.032)

    # Four main bamboo pillars + two front eave support bamboo poles + crossbeams
    pillars = [(-1.26, -0.62), (1.26, -0.62), (-1.26, 0.62), (1.26, 0.62)]
    for idx, (px, py) in enumerate(pillars):
        add_bamboo_pole(col, f"Bamboo_Pillar_{idx}", (px, py, 0.0), (px, py, 2.28), 0.056)
        add_coir_lashing(col, f"Pillar_Lash_Top_{idx}", (px, py, 2.22), 0.072)

    # Horizontal bamboo tie-beams
    add_bamboo_pole(col, "Beam_Front", (-1.38,  0.62, 2.18), (1.38,  0.62, 2.18), 0.042)
    add_bamboo_pole(col, "Beam_Back",  (-1.38, -0.62, 2.18), (1.38, -0.62, 2.18), 0.042)
    add_bamboo_pole(col, "Beam_Left",  (-1.26, -0.75, 2.22), (-1.26, 0.75, 2.22), 0.040)
    add_bamboo_pole(col, "Beam_Right", ( 1.26, -0.75, 2.22), ( 1.26, 0.75, 2.22), 0.040)

    # Diagonal bamboo braces at top corners
    for sx in (-1.0, 1.0):
        add_bamboo_pole(col, f"Brace_X_{sx}", (sx * 1.26, 0.62, 1.72), (sx * 0.75, 0.62, 2.18), 0.026, add_nodes=False)
        add_bamboo_pole(col, f"Brace_Y_{sx}", (sx * 1.26, 0.62, 1.76), (sx * 1.26, 0.12, 2.22), 0.026, add_nodes=False)

    # Palm-leaf (ola) roof
    add_bamboo_palm_roof(col, width=3.14, depth=2.16, ridge_z=2.66, eave_z=2.16)

def add_kooda_basket(col, name, loc, radius=0.25, height=0.16):
    """Woven bamboo kooda basket with rim."""
    add_cylinder(col, f"{name}_Body", radius, height, loc, mat_basket, verts=14)
    add_cylinder(col, f"{name}_Rim",  radius * 1.06, 0.032, (loc[0], loc[1], loc[2] + height * 0.45), mat_bamboo, verts=14)

def add_banana_leaf_mat(col, name, loc, size_xy=(0.55, 0.42), rot_z=0.0):
    """Fresh green vazhayila (banana leaf) liner on the counter."""
    return add_box(col, name, (size_xy[0], size_xy[1], 0.012), loc, mat_banana_leaf, (0, 0, rot_z), bevel=0.004)

# ------------------------------------------------------------
# 3. Realistic 3D Kerala Fruits & Coconuts
# ------------------------------------------------------------
def add_hanging_banana_bunch(col, name, top_loc, is_ripe=True):
    """Curved vazhakula (banana bunch) hanging from bamboo beam."""
    mat_b = mat_banana_ripe if is_ripe else mat_banana_green
    # Central stalk
    add_cylinder(col, f"{name}_Stalk", 0.024, 0.56, (top_loc[0], top_loc[1], top_loc[2] - 0.28), mat_leaf_green, verts=8)
    for tier in range(3):
        tz = top_loc[2] - 0.14 - tier * 0.14
        count = 6 - tier
        for b in range(count):
            ang = (b / count) * math.pi * 2 + tier * 0.4
            bx = top_loc[0] + math.cos(ang) * 0.075
            by = top_loc[1] + math.sin(ang) * 0.075
            add_sphere(
                col, f"{name}_T{tier}_{b}", 0.028,
                (bx, by, tz - 0.03), mat_b,
                scale_xyz=(0.85, 0.85, 2.35),
                rot_xyz=(math.sin(ang) * 0.45, -math.cos(ang) * 0.45, ang)
            )

def add_jackfruit(col, name, loc, rot_z=0.25):
    """Large bumpy Kerala chakka (jackfruit) with short woody stem."""
    add_sphere(col, name, 0.18, loc, mat_jackfruit, scale_xyz=(1.45, 0.95, 0.90), rot_xyz=(0, 0, rot_z), segs=14, rings=10)
    add_cylinder(col, f"{name}_Stem", 0.018, 0.08, (loc[0] - math.cos(rot_z) * 0.25, loc[1] - math.sin(rot_z) * 0.25, loc[2] + 0.02), mat_teak, 6, (0, math.pi / 2, rot_z))

def add_mango(col, name, loc, rot_z=0.0):
    """Curved ripe Kerala mango."""
    add_sphere(col, name, 0.052, loc, mat_mango, scale_xyz=(1.32, 0.92, 0.84), rot_xyz=(0.15, 0.2, rot_z), segs=10, rings=8)

def add_pineapple(col, name, loc):
    """Textured pineapple with spiky green crown."""
    add_sphere(col, f"{name}_Body", 0.085, loc, mat_pineapple, scale_xyz=(0.95, 0.95, 1.38), segs=12, rings=8)
    for l in range(6):
        ang = (l / 6) * math.pi * 2
        add_box(col, f"{name}_Crown_{l}", (0.022, 0.06, 0.09), (loc[0] + math.cos(ang) * 0.025, loc[1] + math.sin(ang) * 0.025, loc[2] + 0.13), mat_leaf_green, (0.35 * math.sin(ang), -0.35 * math.cos(ang), ang))

def add_papaya(col, name, loc, rot_z=0.3):
    """Elongated Kerala papaya (omakka)."""
    add_sphere(col, name, 0.075, loc, mat_papaya, scale_xyz=(1.65, 0.92, 0.88), rot_xyz=(0, 0.1, rot_z), segs=10, rings=8)

def add_guava(col, name, loc):
    """Small round green Kerala guava (perakka)."""
    add_sphere(col, name, 0.042, loc, mat_guava, scale_xyz=(1.0, 1.0, 0.95), segs=8, rings=6)

def add_karikku_coconut(col, name, loc, orange=False):
    """Tender coconut (karikku) with 3-lobed calyx cap."""
    mat_c = mat_coconut_o if orange else mat_coconut_g
    add_sphere(col, name, 0.115, loc, mat_c, scale_xyz=(1.0, 1.0, 1.18), segs=12, rings=8)
    add_cylinder(col, f"{name}_Cap", 0.045, 0.025, (loc[0], loc[1], loc[2] + 0.125), mat_teak, verts=6)

def add_open_karikku(col, name, loc):
    """Freshly chopped tender coconut with white meat rim and bamboo straw."""
    add_sphere(col, name, 0.11, loc, mat_coconut_g, scale_xyz=(1.0, 1.0, 0.92), segs=12, rings=8)
    add_cylinder(col, f"{name}_Meat", 0.072, 0.02, (loc[0], loc[1], loc[2] + 0.095), mat_coconut_meat, verts=12)
    add_cylinder(col, f"{name}_Straw", 0.008, 0.20, (loc[0] + 0.02, loc[1], loc[2] + 0.15), mat_bamboo, verts=6, rot_xyz=(0.25, 0.15, 0))

def add_fish(col, name, loc, length=0.22, rot_z=0.0, mat_body=None):
    """Realistic Kerala fish (Mathi/Ayila/Karimeen) with body, dorsal fin, and forked tail."""
    m = mat_body or mat_fish_silver
    add_sphere(col, f"{name}_Body", length * 0.22, loc, m, scale_xyz=(2.3, 0.72, 0.42), rot_xyz=(0, 0, rot_z), segs=10, rings=8)
    tx = loc[0] - math.cos(rot_z) * (length * 0.50)
    ty = loc[1] - math.sin(rot_z) * (length * 0.50)
    add_box(col, f"{name}_Tail", (length * 0.18, 0.015, length * 0.24), (tx, ty, loc[2] + 0.005), m, (0, 0, rot_z))
    add_box(col, f"{name}_Fin",  (length * 0.22, 0.012, length * 0.10), (loc[0], loc[1], loc[2] + length * 0.11), m, (0, 0, rot_z))

def add_prawn(col, name, loc, rot_z=0.0):
    """Curved Kerala chemmeen (prawn)."""
    add_sphere(col, name, 0.032, loc, mat_prawn, scale_xyz=(1.8, 0.7, 0.65), rot_xyz=(0.2, 0.0, rot_z), segs=8, rings=6)

def add_hanging_scale(col, name, top_loc):
    """Traditional 1960s-70s Kerala brass/iron hanging balance scale (thulaas)."""
    add_cylinder(col, f"{name}_Rope", 0.008, 0.36, (top_loc[0], top_loc[1], top_loc[2] - 0.18), mat_coir, 6)
    add_box(col, f"{name}_Beam", (0.44, 0.022, 0.022), (top_loc[0], top_loc[1], top_loc[2] - 0.36), mat_iron)
    for sx in (-0.20, 0.20):
        add_cylinder(col, f"{name}_Cord_{sx}", 0.005, 0.24, (top_loc[0] + sx, top_loc[1], top_loc[2] - 0.48), mat_coir, 6)
        add_cylinder(col, f"{name}_Pan_{sx}",  0.10,  0.018, (top_loc[0] + sx, top_loc[1], top_loc[2] - 0.60), mat_brass, 12)

# ------------------------------------------------------------
# 4. Builders for Fruits Shop & Coconut Water Shop
# ------------------------------------------------------------
def build_market_stall_banana():
    col = reset_collection("market_stall_banana")
    add_old_kerala_bamboo_stall_base(col)

    # Hanging banana bunches (vazhakula) from the shared produce library
    produce.build_produce("banana_bunch", col, (-0.88, 0.68, 1.62), (0, 0, 0.2))
    produce.build_produce("banana_bunch", col, ( 0.00, 0.68, 1.62), (0, 0, 1.1))
    produce.build_produce("banana_bunch", col, ( 0.88, 0.68, 1.62), (0, 0, -0.4))

    # Banana-leaf liners on counter (top z = 0.89)
    add_banana_leaf_mat(col, "Leaf_Mat_L", (-0.75, 0.05, 0.885), (0.68, 0.50), 0.08)
    add_banana_leaf_mat(col, "Leaf_Mat_M", ( 0.00, 0.02, 0.885), (0.64, 0.50), -0.05)
    add_banana_leaf_mat(col, "Leaf_Mat_R", ( 0.78, 0.05, 0.885), (0.64, 0.50), 0.04)

    # Shared produce items (bottom-grounded at z = 0.89 on counter)
    produce.build_produce("jackfruit", col, (-0.82, 0.12, 0.89), (0, 0, 0.35))
    produce.build_produce("jackfruit", col, (-0.56, -0.14, 0.89), (0, 0, -0.45))

    # Mango basket (Kooda) in center
    add_kooda_basket(col, "Mango_Basket", (0.02, 0.12, 0.96), 0.25, 0.14)
    for m in range(7):
        ang = (m / 7) * math.pi * 2
        r = 0.11 if m < 6 else 0.0
        z_off = 0.96 if m < 6 else 1.02
        produce.build_produce("mango", col, (0.02 + math.cos(ang) * r, 0.12 + math.sin(ang) * r, z_off), (0.2, 0.1, ang))

    # Papayas & Pineapples on right
    produce.build_produce("papaya",    col, (0.52, -0.16, 0.89), (1.35, 0.0, 0.25))
    produce.build_produce("papaya",    col, (0.76, -0.18, 0.89), (1.35, 0.0, -0.30))
    produce.build_produce("pineapple", col, (0.66,  0.18, 0.89), (0.0, 0.0, 0.2))
    produce.build_produce("pineapple", col, (0.94,  0.14, 0.89), (0.0, 0.0, -0.5))

    # Guava & Tomato baskets at front-center
    add_kooda_basket(col, "Guava_Basket", (-0.36, 0.30, 0.95), 0.17, 0.11)
    for g in range(5):
        ang = (g / 5) * math.pi * 2
        produce.build_produce("guava", col, (-0.36 + math.cos(ang) * 0.07, 0.30 + math.sin(ang) * 0.07, 0.96), (0, 0, ang))

    # Ground-side fruit basket
    add_kooda_basket(col, "Ground_Fruit_Basket", (-1.05, 0.88, 0.16), 0.28, 0.28)
    produce.build_produce("pineapple", col, (-1.05, 0.88, 0.22), (0, 0, 0.4))
    return col

def build_market_stall_coconut():
    col = reset_collection("market_stall_coconut")
    add_old_kerala_bamboo_stall_base(col)

    # Banana leaf mat on counter
    add_banana_leaf_mat(col, "Coconut_Leaf_Mat", (-0.32, 0.04, 0.885), (1.35, 0.72), 0.02)

    # Pyramid of Karikku (tender coconuts) from shared produce library
    base_coords = [
        (-0.85, -0.16), (-0.55, -0.18), (-0.25, -0.15),
        (-0.78,  0.14), (-0.48,  0.12), (-0.18,  0.16),
    ]
    for idx, (cx, cy) in enumerate(base_coords):
        produce.build_produce("coconut_tender", col, (cx, cy, 0.89), (0, 0, idx * 0.5))
    for idx, (cx, cy) in enumerate([(-0.68, -0.02), (-0.36, 0.00)]):
        produce.build_produce("coconut_tender", col, (cx, cy, 1.09), (0.1, 0, idx * 0.8))

    # Wooden chopping block + curved Kerala machete (vettukathi) + open karikku with straw
    add_cylinder(col, "Chop_Block", 0.22, 0.15, (0.65, 0.05, 0.955), mat_teak, verts=12)
    add_box(col, "Machete_Blade", (0.28, 0.065, 0.014), (0.65, 0.08, 1.04), mat_iron, (0, 0, 0.35))
    add_cylinder(col, "Machete_Handle", 0.018, 0.13, (0.50, 0.02, 1.04), mat_teak, 8, (0, math.pi / 2, 0.35))
    produce.build_produce("coconut_open", col, (0.28, 0.26, 0.89))

    # Hanging coconut bunch (thenga kula) from front bamboo beam
    add_cylinder(col, "Coconut_Bunch_Stalk", 0.025, 0.42, (0.98, 0.65, 1.98), mat_teak, 8)
    for k in range(4):
        ang = (k / 4) * math.pi * 2
        produce.build_produce("coconut_tender", col, (0.98 + math.cos(ang) * 0.13, 0.65 + math.sin(ang) * 0.13, 1.66), (0, 0, ang))

    # Ground-side woven basket full of extra coconuts + terracotta water pot
    add_kooda_basket(col, "Ground_Coconut_Kooda", (-1.02, 0.90, 0.18), 0.32, 0.32)
    for g in range(3):
        ang = (g / 3) * math.pi * 2
        produce.build_produce("coconut_tender", col, (-1.02 + math.cos(ang) * 0.12, 0.90 + math.sin(ang) * 0.12, 0.20), (0, 0, ang))
    add_sphere(col, "Clay_Pot_Kudam", 0.18, (1.02, 0.85, 0.18), mat_clay, (1.0, 1.0, 1.15))
    add_cylinder(col, "Clay_Pot_Neck", 0.08, 0.08, (1.02, 0.85, 0.38), mat_clay, 10)
    return col

def build_market_stall_fish():
    col = reset_collection("market_stall_fish")
    add_old_kerala_bamboo_stall_base(col)

    # Wide woven bamboo fish tray (muram) + banana leaf liner on left-center counter
    add_kooda_basket(col, "Fish_Muram_Tray", (-0.42, 0.04, 0.92), 0.48, 0.07)
    add_banana_leaf_mat(col, "Fish_Leaf_Mat", (-0.42, 0.04, 0.96), (0.68, 0.62), 0.05)
    for f in range(7):
        fx = -0.64 + (f % 3) * 0.22
        fy = -0.14 + (f // 3) * 0.16
        add_fish(col, f"Mathi_{f}", (fx, fy, 1.00), length=0.22, rot_z=0.18 + (f % 2) * 0.25, mat_body=mat_fish_silver)

    # Second banana leaf mat with larger Karimeen / Neymeen fish
    add_banana_leaf_mat(col, "BigFish_Leaf_Mat", (0.34, -0.06, 0.885), (0.56, 0.48), -0.06)
    add_fish(col, "Karimeen_1", (0.30,  0.08, 0.94), length=0.34, rot_z=0.12,  mat_body=mat_fish_slate)
    add_fish(col, "Karimeen_2", (0.36, -0.16, 0.94), length=0.32, rot_z=-0.22, mat_body=mat_fish_slate)

    # Small woven basket of Chemmeen (prawns) at front-right
    add_kooda_basket(col, "Prawn_Basket", (0.88, 0.22, 0.94), 0.18, 0.10)
    for p in range(6):
        ang = (p / 6) * math.pi * 2
        add_prawn(col, f"Prawn_{p}", (0.88 + math.cos(ang) * 0.07, 0.22 + math.sin(ang) * 0.07, 1.00), ang)

    # Wooden cutting board & fish knife (kathi) at back-right
    add_box(col, "Fish_Cut_Board", (0.36, 0.26, 0.03), (0.88, -0.22, 0.895), mat_teak, bevel=0.006)
    add_box(col, "Fish_Knife_Blade", (0.22, 0.045, 0.01), (0.90, -0.22, 0.92), mat_iron, (0, 0, -0.35))
    add_cylinder(col, "Fish_Knife_Handle", 0.015, 0.10, (0.78, -0.17, 0.92), mat_teak, 8, (0, math.pi / 2, -0.35))

    # Hanging brass balance scale (thulaas) from front bamboo beam
    add_hanging_scale(col, "Fish_Scale", (0.75, 0.65, 2.16))

    # Ground-side woven fish kooda basket + terracotta rinsing pot (kudam)
    add_kooda_basket(col, "Ground_Fish_Kooda", (-1.00, 0.88, 0.18), 0.30, 0.32)
    add_banana_leaf_mat(col, "Ground_Leaf_Cover", (-1.00, 0.88, 0.35), (0.44, 0.44), 0.3)
    add_sphere(col, "Fish_Clay_Kudam", 0.18, (1.02, 0.85, 0.18), mat_clay, (1.0, 1.0, 1.15))
    add_cylinder(col, "Fish_Clay_Neck", 0.08, 0.08, (1.02, 0.85, 0.38), mat_clay, 10)
    return col

# ------------------------------------------------------------
# 5. Smart UV Unwrap & 2K Cycles PBR Baking
# ------------------------------------------------------------
def fresh_image(name, width, height):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    return bpy.data.images.new(name, width=width, height=height)

def unwrap_and_bake_collection(col):
    os.makedirs(TEX_DIR, exist_ok=True)
    bake_objs = [
        o for o in col.objects
        if o.type == "MESH" and not (len(o.data.materials) == 1 and o.data.materials[0] in UNBAKED_MATS)
    ]
    if not bake_objs:
        return

    bpy.ops.object.select_all(action="DESELECT")
    for o in bake_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = bake_objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.015)
    bpy.ops.object.mode_set(mode="OBJECT")

    img_albedo = fresh_image(f"{col.name}_albedo", BAKE_RES, BAKE_RES)
    img_rough  = fresh_image(f"{col.name}_roughness", BAKE_RES, BAKE_RES)
    img_normal = fresh_image(f"{col.name}_normal", BAKE_RES, BAKE_RES)
    img_rough.colorspace_settings.name = "Non-Color"
    img_normal.colorspace_settings.name = "Non-Color"

    used_mats = {m for o in bake_objs for m in o.data.materials if m and m not in UNBAKED_MATS}
    temp_tex_nodes = []
    for m in used_mats:
        tn = m.node_tree.nodes.new("ShaderNodeTexImage")
        tn.name = "__BAKE_TARGET__"
        m.node_tree.nodes.active = tn
        temp_tex_nodes.append((m, tn))

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = BAKE_SAMPLES
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 4
    scene.render.bake.use_clear = True

    def run_bake(bake_type, img, filepath):
        for _m, tn in temp_tex_nodes:
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

    run_bake("DIFFUSE",   img_albedo, os.path.join(TEX_DIR, f"{col.name}_albedo.png"))
    run_bake("ROUGHNESS", img_rough,  os.path.join(TEX_DIR, f"{col.name}_roughness.png"))
    run_bake("NORMAL",    img_normal, os.path.join(TEX_DIR, f"{col.name}_normal.png"))

    for m, tn in temp_tex_nodes:
        m.node_tree.nodes.remove(tn)

    baked_mat, nodes, links, bsdf = clear_material(f"{col.name}_Baked")
    uv_coord = nodes.new("ShaderNodeTexCoord")

    tex_a = nodes.new("ShaderNodeTexImage")
    tex_a.image = img_albedo
    links.new(uv_coord.outputs["UV"], tex_a.inputs["Vector"])
    links.new(tex_a.outputs["Color"], bsdf.inputs["Base Color"])

    tex_r = nodes.new("ShaderNodeTexImage")
    tex_r.image = img_rough
    links.new(uv_coord.outputs["UV"], tex_r.inputs["Vector"])
    links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])

    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = img_normal
    links.new(uv_coord.outputs["UV"], tex_n.inputs["Vector"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.85
    links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    for o in bake_objs:
        o.data.materials.clear()
        o.data.materials.append(baked_mat)

def build_market_stall_vegetables():
    """Old Kerala Vegetable & Root-Crop Shop (Pachakkari Kada)."""
    col = reset_collection("market_stall_vegetables")
    add_old_kerala_bamboo_stall_base(col)
    add_banana_leaf_mat(col, "Veg_Leaf_Mat", (0.0, 0.02, 0.885), (2.05, 0.78), 0.01)

    # Woven bamboo trays heaped with brinjals, bottle gourds, tapioca, and pumpkins
    for bx, prod_key in [(-0.72, "brinjal"), (0.0, "bottle_gourd"), (0.72, "tapioca")]:
        add_kooda_basket(col, f"Veg_Tray_{prod_key}", (bx, 0.02, 0.93), 0.34, 0.09)
        for k in range(4):
            ang = (k / 4.0) * math.pi * 2.0
            produce.build_produce(prod_key, col, (bx + math.cos(ang) * 0.11, 0.02 + math.sin(ang) * 0.09, 0.96), (0.1, 0, ang))

    # Ground-side baskets overflowing with produce
    add_kooda_basket(col, "Ground_Veg_Kooda_L", (-1.02, 0.88, 0.18), 0.30, 0.32)
    add_kooda_basket(col, "Ground_Veg_Kooda_R", (1.02, 0.88, 0.18), 0.28, 0.30)
    return col

def build_market_stall_provisions():
    """Old 18th-Century Kerala Provision, Spice & Palm-Leaf Stationery Store (Palacharakku & Olakkada)."""
    col = reset_collection("market_stall_provisions")
    add_old_kerala_bamboo_stall_base(col)

    # Burlap spice & grain sacks on the ground beside the stall
    for idx, (sx, sy) in enumerate([(-1.02, 0.88), (-0.62, 0.92), (0.98, 0.88)]):
        add_sphere(col, f"Spice_Sack_{idx}", 0.22, (sx, sy, 0.22), mat_basket, (0.95, 0.90, 1.25))
        add_cylinder(col, f"Sack_Neck_{idx}", 0.09, 0.10, (sx, sy, 0.44), mat_basket, 10)

    # Counter display: jaggery blocks, spice bowls, brass balance scale, and stacked palm-leaf manuscripts (ola)
    for k in range(3):
        add_kooda_basket(col, f"Spice_Bowl_{k}", (-0.75 + k * 0.42, 0.02, 0.93), 0.18, 0.08)
    # Stacked palm-leaf stationery bundles (olayum ezhuthaniyum) + brass ink/oil pot
    for b in range(3):
        add_box(col, f"Palm_Ola_Bundle_{b}", (0.34, 0.08, 0.045), (0.58, -0.10 + b * 0.14, 0.91 + b * 0.015), mat_bamboo, (0, 0, 0.08 * b))
    add_cylinder(col, "Ezhuthani_Stylus", 0.008, 0.24, (0.62, 0.24, 0.90), mat_iron, 8, (0, math.pi / 2, 0.25))
    # Traditional brass balance scale (Thulass)
    add_cylinder(col, "Scale_Post", 0.018, 0.42, (0.12, -0.18, 1.09), mat_iron, 10)
    add_box(col, "Scale_Beam", (0.36, 0.018, 0.018), (0.12, -0.18, 1.28), mat_iron)
    for sx in (-0.15, 0.15):
        add_cylinder(col, f"Scale_Pan_{sx}", 0.075, 0.02, (0.12 + sx, -0.18, 1.08), mat_clay, 12)
    return col

def build_market_stall_pottery():
    """Old Kerala Terracotta Pottery & Handloom Cloth Shop (Kushava & Kaithari Kada)."""
    col = reset_collection("market_stall_pottery")
    add_old_kerala_bamboo_stall_base(col)

    # Rows of terracotta kudam water pots & wide clay cooking vessels (chatti) on counter
    for k in range(3):
        px = -0.78 + k * 0.42
        add_sphere(col, f"Counter_Kudam_{k}", 0.15, (px, -0.02, 1.03), mat_clay, (1.0, 1.0, 1.12))
        add_cylinder(col, f"Counter_Neck_{k}", 0.065, 0.07, (px, -0.02, 1.20), mat_clay, 10)
    # Folded stacks of unbleached handloom mundu cotton bolts on the right side of counter
    for s in range(4):
        add_box(col, f"Mundu_Stack_{s}", (0.42, 0.28, 0.055), (0.62, 0.04, 0.91 + s * 0.058), mat_coconut_meat, (0, 0, 0.05 * (s % 2)))
    # Large water pots on the ground in front of the stall
    for idx, (gx, gy) in enumerate([(-0.98, 0.90), (-0.52, 0.94), (0.98, 0.88)]):
        add_sphere(col, f"Ground_Kudam_{idx}", 0.21, (gx, gy, 0.21), mat_clay, (1.0, 1.0, 1.15))
        add_cylinder(col, f"Ground_Neck_{idx}", 0.085, 0.09, (gx, gy, 0.44), mat_clay, 10)
    return col

# ------------------------------------------------------------
# 6. Build, Bake & Export All 6 Market Shops
# ------------------------------------------------------------
builders = [
    (build_market_stall_banana,     -10.0),
    (build_market_stall_coconut,     -6.0),
    (build_market_stall_fish,        -2.0),
    (build_market_stall_vegetables,   2.0),
    (build_market_stall_provisions,   6.0),
    (build_market_stall_pottery,     10.0),
]

if AUTO_EXPORT:
    os.makedirs(EXPORT_DIR, exist_ok=True)

for builder_fn, preview_x in builders:
    col = builder_fn()

    if AUTO_BAKE:
        print(f"Baking 2K PBR+AO maps for {col.name}...")
        unwrap_and_bake_collection(col)

    if AUTO_EXPORT:
        bpy.ops.object.select_all(action="DESELECT")
        for obj in col.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = col.objects[0]
        out_path = os.path.join(EXPORT_DIR, f"{col.name}.glb")
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_apply=True,
            export_morph=False,
            export_animations=False,
        )
        print("Exported:", out_path)

    for obj in col.objects:
        obj.location.x += preview_x

bpy.ops.object.select_all(action="DESELECT")
print("Done! Old Kerala bamboo & palm-leaf fruit and coconut shops exported.")
