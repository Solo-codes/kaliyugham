import bpy
import bmesh
import math
import os
import glob

# ------------------------------------------------------------
# Config
# ------------------------------------------------------------
EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models"
TEX_DIR = "/Users/vishnuk/Documents/project/game/scripts/baked_textures"
PHOTO_TEX_DIR = "/Users/vishnuk/Documents/project/game/scripts/textures"
AUTO_BAKE = True      # Bakes shaders + Ambient Occlusion into 2K PNG PBR maps
AUTO_EXPORT = True    # Exports each shop collection as a separate .glb
BAKE_RES = 2048       # 2048x2048 for crisp close-up detail
BAKE_SAMPLES = 24     # Cycles samples per bake pass

# ------------------------------------------------------------
# 1. Pre-British 18th-Century Kerala PBR Materials (Matches House Pipeline)
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

def apply_ao(nodes, links, base_color_socket, ao_strength=0.45, ao_dist=0.45):
    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 8
    ao.inputs["Distance"].default_value = ao_dist
    links.new(base_color_socket, ao.inputs["Color"])
    return rgba_mix(nodes, links, "MULTIPLY", ao_strength, base_color_socket, ao.outputs["AO"])

def find_photo_maps(folder_key):
    folder = os.path.join(PHOTO_TEX_DIR, folder_key)
    if not os.path.isdir(folder):
        return None
    files = [
        f for f in glob.glob(os.path.join(folder, "*"))
        if os.path.splitext(f)[1].lower() in (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff")
    ]
    if not files:
        return None

    def pick(keywords):
        for kw in keywords:
            for f in files:
                if kw in os.path.basename(f).lower():
                    return f
        return None

    albedo = pick(["albedo", "diff", "col", "basecolor", "base_color"])
    if not albedo:
        return None
    return {
        "albedo": albedo,
        "roughness": pick(["rough", "rgh"]),
        "normal": pick(["nor", "nrm", "bump"]),
    }

def try_photo_material(mat_name, folder_key, tile_scale=1.2, ao_strength=0.45):
    maps = find_photo_maps(folder_key)
    if not maps:
        return None
    mat, nodes, links, bsdf = clear_material(mat_name)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (tile_scale, tile_scale, tile_scale)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])

    def load_box_tex(path, colorspace="sRGB"):
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = colorspace
        tn = nodes.new("ShaderNodeTexImage")
        tn.image = img
        tn.projection = "BOX"
        tn.projection_blend = 0.25
        links.new(mapping.outputs["Vector"], tn.inputs["Vector"])
        return tn

    tex_a = load_box_tex(maps["albedo"], "sRGB")
    links.new(apply_ao(nodes, links, tex_a.outputs["Color"], ao_strength), bsdf.inputs["Base Color"])
    if maps["roughness"]:
        tex_r = load_box_tex(maps["roughness"], "Non-Color")
        links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = 0.85
    if maps["normal"]:
        tex_n = load_box_tex(maps["normal"], "Non-Color")
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.9
        links.new(tex_n.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_laterite_material():
    photo = try_photo_material("Shop_Laterite", "laterite", 1.0, 0.50)
    if photo:
        return photo
    mat, nodes, links, bsdf = clear_material("Shop_Laterite")
    coord = nodes.new("ShaderNodeTexCoord")
    brick = nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.5
    brick.inputs["Scale"].default_value = 3.2
    brick.inputs["Mortar Size"].default_value = 0.025
    brick.inputs["Color1"].default_value = (0.31, 0.11, 0.06, 1.0)
    brick.inputs["Color2"].default_value = (0.21, 0.08, 0.05, 1.0)
    brick.inputs["Mortar"].default_value = (0.18, 0.14, 0.10, 1.0)
    links.new(coord.outputs["Object"], brick.inputs["Vector"])
    links.new(apply_ao(nodes, links, brick.outputs["Color"], 0.50), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45
    links.new(brick.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_plaster_material():
    photo = try_photo_material("Shop_Plaster", "plaster", 0.8, 0.50)
    if photo:
        return photo
    mat, nodes, links, bsdf = clear_material("Shop_Plaster")
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 4.5
    noise.inputs["Detail"].default_value = 7.0
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.30
    ramp.color_ramp.elements[0].color = (0.50, 0.41, 0.29, 1.0)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.72, 0.62, 0.47, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.50), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.89
    return mat

def make_tile_material():
    photo = try_photo_material("Shop_Tile", "tile", 1.4, 0.45)
    if photo:
        return photo
    mat, nodes, links, bsdf = clear_material("Shop_Tile")
    coord = nodes.new("ShaderNodeTexCoord")
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.wave_profile = "SAW"
    wave.inputs["Scale"].default_value = 6.5
    links.new(coord.outputs["Object"], wave.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 5.0
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.24, 0.08, 0.04, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (0.44, 0.15, 0.07, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.45), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.82
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.42
    links.new(wave.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_thatch_material():
    photo = try_photo_material("Shop_Thatch", "thatch", 1.4, 0.50)
    if photo:
        return photo
    mat, nodes, links, bsdf = clear_material("Shop_Thatch")
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 12.0, 1.0)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18.0
    noise.inputs["Detail"].default_value = 10.0
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.30
    ramp.color_ramp.elements[0].color = (0.19, 0.15, 0.06, 1.0)
    ramp.color_ramp.elements[1].position = 0.72
    ramp.color_ramp.elements[1].color = (0.37, 0.30, 0.13, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.55), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.55
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_wood_material(name, folder_key, dark_col, light_col, roughness=0.62):
    photo = try_photo_material(name, folder_key, 1.2, 0.45)
    if photo:
        return photo
    mat, nodes, links, bsdf = clear_material(name)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 6.0)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.inputs["Scale"].default_value = 5.0
    wave.inputs["Distortion"].default_value = 4.5
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (*dark_col, 1.0)
    ramp.color_ramp.elements[1].position = 0.78
    ramp.color_ramp.elements[1].color = (*light_col, 1.0)
    links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.45), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    links.new(wave.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def make_cloth_material(name, col_a, col_b):
    mat, nodes, links, bsdf = clear_material(name)
    coord = nodes.new("ShaderNodeTexCoord")
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 4.0
    links.new(coord.outputs["Object"], wave.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.48
    ramp.color_ramp.elements[0].color = (*col_a, 1.0)
    ramp.color_ramp.elements[1].position = 0.52
    ramp.color_ramp.elements[1].color = (*col_b, 1.0)
    links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    links.new(apply_ao(nodes, links, ramp.outputs["Color"], 0.40), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    return mat

def make_simple_material(name, base_color, roughness, metallic=0.0):
    mat, nodes, links, bsdf = clear_material(name)
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat

mat_laterite = make_laterite_material()
mat_plaster  = make_plaster_material()
mat_tile     = make_tile_material()
mat_thatch   = make_thatch_material()
mat_teak     = make_wood_material("Shop_Teak",   "teak",   (0.08, 0.04, 0.02), (0.18, 0.10, 0.05), 0.58)
mat_bamboo   = make_wood_material("Shop_Bamboo", "bamboo", (0.34, 0.26, 0.12), (0.54, 0.44, 0.22), 0.78)
mat_clay     = make_simple_material("Shop_Clay",      (0.42, 0.16, 0.08), 0.85)
mat_banana   = make_simple_material("Shop_Banana",    (0.76, 0.60, 0.14), 0.65)
mat_coconut  = make_simple_material("Shop_Coconut",   (0.24, 0.42, 0.14), 0.65)
mat_fish     = make_simple_material("Shop_Fish",      (0.50, 0.58, 0.60), 0.35, metallic=0.25)
mat_ember    = make_simple_material("Shop_Ember",     (0.92, 0.32, 0.05), 0.90)
mat_brass    = make_simple_material("Shop_Brass",     (0.72, 0.53, 0.18), 0.35, metallic=0.85)
mat_iron     = make_simple_material("Shop_Iron",      (0.18, 0.18, 0.19), 0.50, metallic=0.75)
mat_glass    = make_simple_material("Shop_Glass",     (0.70, 0.76, 0.72), 0.10, metallic=0.05)
mat_awning_r = make_cloth_material("Shop_Awning_Red",   (0.45, 0.14, 0.09), (0.72, 0.58, 0.34))
mat_awning_g = make_cloth_material("Shop_Awning_Green", (0.16, 0.30, 0.20), (0.72, 0.58, 0.34))
mat_awning_o = make_cloth_material("Shop_Awning_Ochre", (0.56, 0.38, 0.14), (0.72, 0.58, 0.34))

UNBAKED_MATS = {mat_brass, mat_iron, mat_glass}

# ------------------------------------------------------------
# 2. Geometry & Shop Prop Helpers
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

def add_sphere(col, name, radius, loc_xyz, mat, scale_xyz=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radius, location=loc_xyz)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale_xyz
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return link(obj, col)

def add_stepped_tile_slope(col, prefix, length_x, slope_y, center_xyz, rot_x, mat_roof, courses=4):
    c_len = slope_y / courses + 0.05
    ey_dir = math.cos(rot_x)
    ez_dir = math.sin(rot_x)
    add_box(col, f"{prefix}_Deck", (length_x, slope_y, 0.06), center_xyz, mat_roof, (rot_x, 0, 0))
    for c in range(courses):
        offset = ((c + 0.5) / courses - 0.5) * slope_y
        pos = (center_xyz[0], center_xyz[1] + ey_dir * offset, center_xyz[2] + ez_dir * offset + 0.05)
        add_box(col, f"{prefix}_Course_{c}", (length_x, c_len, 0.045), pos, mat_roof, (rot_x, 0, 0), bevel=0.005)

def add_market_stall_frame(col, awning_mat):
    """Shared pre-British wooden market stall frame (2.95 x 1.85 m, front = +Y)."""
    # Counter + heavy timber posts
    add_box(col, "Counter_Body", (2.50, 1.15, 0.84), (0, 0, 0.42), mat_teak, bevel=0.01)
    add_box(col, "Counter_Top",  (2.70, 1.28, 0.10), (0, 0, 0.89), mat_bamboo, bevel=0.01)
    for px in (-1.18, 1.18):
        for py in (-0.48, 0.48):
            add_cylinder(col, f"Post_{px}_{py}", 0.055, 2.35, (px, py, 1.175), mat_bamboo, 8)
    # Sloped cloth awning canopy + front scalloped trim
    add_box(col, "Awning_Canopy", (3.00, 1.95, 0.08), (0, 0.05, 2.38), awning_mat, (-0.12, 0, 0), bevel=0.01)
    add_box(col, "Awning_Valance", (3.00, 0.05, 0.24), (0, 0.98, 2.18), awning_mat)
    # Bamboo signboard frame above front
    add_box(col, "Sign_Board", (2.40, 0.06, 0.42), (0, 0.96, 1.95), mat_teak, bevel=0.008)

# ------------------------------------------------------------
# 3. Shop Builders (Front = +Y in Blender -> -Z in Three.js)
# ------------------------------------------------------------
def build_chaya_kada():
    col = reset_collection("chaya_kada")
    # Floor plinth + 3 walls (open front +Y)
    add_box(col, "Floor_Plinth", (5.0, 4.0, 0.16), (0, 0, 0.08), mat_laterite, bevel=0.015)
    add_box(col, "Wall_Back",    (5.0, 0.22, 2.50), (0, -1.85, 1.40), mat_plaster)
    for sx in (-2.4, 2.4):
        add_box(col, f"Wall_Side_{sx}", (0.20, 3.8, 1.10), (sx, 0, 0.70), mat_laterite)
        add_box(col, f"Wall_SideU_{sx}", (0.18, 3.76, 1.40), (sx, 0, 1.95), mat_plaster)
        add_cylinder(col, f"Front_Post_{sx}", 0.07, 2.65, (sx, 2.15, 1.45), mat_teak, 10)

    # Pre-British palm-leaf (ola) thatched roof + bamboo ridge pole (no Mangalore tiles)
    add_stepped_tile_slope(col, "Roof_Front", 5.8, 2.75, (0,  1.15, 2.85), -0.22, mat_thatch, courses=4)
    add_stepped_tile_slope(col, "Roof_Back",  5.8, 2.75, (0, -1.15, 2.85),  0.22, mat_thatch, courses=4)
    add_cylinder(col, "Roof_Ridge", 0.09, 5.86, (0, 0, 3.18), mat_bamboo, 10, (0, math.pi / 2, 0))

    # Front serving counter + clay bharani jars + brass pazham pori plate + brass tumblers
    add_box(col, "Serving_Counter", (2.90, 0.85, 1.05), (0, 1.85, 0.60), mat_teak, bevel=0.01)
    add_box(col, "Counter_Slab",    (3.05, 0.95, 0.07), (0, 1.85, 1.15), mat_bamboo, bevel=0.01)
    for j in range(3):
        jx = -1.0 + j * 0.30
        add_cylinder(col, f"Clay_Bharani_{j}", 0.11, 0.26, (jx, 1.82, 1.32), mat_clay, 12)
        add_cylinder(col, f"Jar_Lid_{j}",      0.08, 0.04, (jx, 1.82, 1.46), mat_brass, 12)
    add_cylinder(col, "Snack_Plate", 0.28, 0.025, (0.75, 1.82, 1.20), mat_brass, 14)
    for s in range(4):
        add_sphere(col, f"PazhamPori_{s}", 0.06, (0.65 + (s % 2) * 0.16, 1.75 + (s // 2) * 0.14, 1.24), mat_banana, (1.4, 0.8, 0.6))
    for g in range(3):
        add_cylinder(col, f"Brass_Tumbler_{g}", 0.045, 0.13, (-0.15 + g * 0.14, 1.92, 1.25), mat_brass, 10)

    # Wooden bench inside
    add_box(col, "Bench_Top", (3.6, 0.42, 0.07), (0, -0.50, 0.56), mat_teak, bevel=0.008)
    for bx in (-1.45, 1.45):
        add_box(col, f"Bench_Leg_{bx}", (0.10, 0.34, 0.48), (bx, -0.50, 0.30), mat_teak)

    # Brick stove (aduppu) + blackened kettle / samovar at back-left
    add_box(col, "Stove_Brick", (1.10, 0.80, 0.60), (-1.55, -1.15, 0.45), mat_laterite, bevel=0.015)
    add_sphere(col, "Stove_Embers", 0.14, (-1.55, -0.82, 0.48), mat_ember, (1.2, 0.6, 0.6))
    add_cylinder(col, "Tea_Samovar", 0.22, 0.46, (-1.55, -1.15, 0.98), mat_brass, 14)
    add_cylinder(col, "Samovar_Lid", 0.14, 0.08, (-1.55, -1.15, 1.24), mat_brass, 12)
    return col

def build_toddy_shop():
    col = reset_collection("toddy_shop")
    add_box(col, "Floor_Plinth", (5.0, 4.0, 0.16), (0, 0, 0.08), mat_laterite, bevel=0.015)
    add_box(col, "Wall_Back",    (5.0, 0.22, 2.40), (0, -1.85, 1.35), mat_plaster)
    for sx in (-2.4, 2.4):
        add_box(col, f"Wall_Side_{sx}", (0.20, 3.8, 2.35), (sx, 0, 1.32), mat_laterite)
        add_cylinder(col, f"Front_Post_{sx}", 0.07, 2.55, (sx, 2.15, 1.40), mat_bamboo, 8)

    # Palm-leaf (ola) thatched roof
    add_box(col, "Thatch_Front", (5.8, 2.8, 0.14), (0,  1.15, 2.85), mat_thatch, (-0.24, 0, 0), bevel=0.02)
    add_box(col, "Thatch_Back",  (5.8, 2.8, 0.14), (0, -1.15, 2.85), mat_thatch, ( 0.24, 0, 0), bevel=0.02)
    add_cylinder(col, "Thatch_Ridge", 0.09, 5.9, (0, 0, 3.22), mat_bamboo, 8, (0, math.pi / 2, 0))

    # Serving counter + clay toddy pots (kalams)
    add_box(col, "Counter", (2.90, 0.85, 1.05), (0, 1.85, 0.60), mat_teak, bevel=0.01)
    for p in range(3):
        px = -1.0 + p * 0.70
        add_sphere(col, f"Toddy_Pot_{p}", 0.25, (px, -1.20, 0.45), mat_clay, (1.0, 1.0, 1.35))
        add_cylinder(col, f"Pot_Neck_{p}", 0.11, 0.12, (px, -1.20, 0.78), mat_clay, 10)
    for c in range(2):
        add_cylinder(col, f"Toddy_Cup_{c}", 0.06, 0.12, (-0.3 + c * 0.5, 1.85, 1.18), mat_clay, 10)

    # Drinking bench
    add_box(col, "Bench", (3.6, 0.44, 0.08), (0, -0.40, 0.56), mat_teak)
    for bx in (-1.4, 1.4):
        add_box(col, f"Bench_Leg_{bx}", (0.12, 0.36, 0.48), (bx, -0.40, 0.30), mat_teak)
    return col

def build_market_stall_banana():
    col = reset_collection("market_stall_banana")
    add_market_stall_frame(col, mat_awning_r)
    # Woven bamboo baskets + banana bunches on counter
    for b in range(3):
        bx = -0.75 + b * 0.75
        add_cylinder(col, f"Basket_{b}", 0.26, 0.18, (bx, 0.10, 1.03), mat_bamboo, 12)
        for k in range(4):
            add_sphere(col, f"Banana_{b}_{k}", 0.055, (bx + (k - 1.5) * 0.06, 0.10, 1.14), mat_banana, (0.7, 1.8, 0.7))
    return col

def build_market_stall_coconut():
    col = reset_collection("market_stall_coconut")
    add_market_stall_frame(col, mat_awning_g)
    # Stacked tender coconuts (karikku) + wooden chopping block + machete
    for i in range(6):
        cx = -0.80 + (i % 3) * 0.45
        cy = -0.15 + (i // 3) * 0.38
        add_sphere(col, f"Karikku_{i}", 0.15, (cx, cy, 1.08), mat_coconut, (1.0, 1.0, 1.15))
    add_cylinder(col, "Chop_Block", 0.22, 0.16, (0.80, 0.05, 1.02), mat_teak, 12)
    add_box(col, "Machete_Blade", (0.28, 0.06, 0.015), (0.80, 0.08, 1.12), mat_iron, (0, 0, 0.35))
    return col

def build_market_stall_fish():
    col = reset_collection("market_stall_fish")
    add_market_stall_frame(col, mat_awning_o)
    # Wide flat bamboo fish tray + fresh silver-blue fish
    add_cylinder(col, "Fish_Tray", 0.48, 0.08, (-0.35, 0.05, 0.98), mat_bamboo, 14)
    for f in range(5):
        fx = -0.60 + (f % 3) * 0.24
        fy = -0.10 + (f // 3) * 0.24
        add_sphere(col, f"Fish_{f}", 0.06, (fx, fy, 1.05), mat_fish, (2.2, 0.7, 0.5))
    add_cylinder(col, "Fish_Basket", 0.28, 0.26, (0.70, 0.0, 1.07), mat_bamboo, 12)
    return col

def build_kalari_equipment_counter():
    col = reset_collection("kalari_equipment_counter")
    # Heavy carved teak weapon bench + rack
    add_box(col, "Bench_Top", (2.0, 0.75, 0.12), (0, 0, 0.85), mat_teak, bevel=0.01)
    for lx in (-0.82, 0.82):
        add_box(col, f"Bench_Leg_{lx}", (0.14, 0.62, 0.80), (lx, 0, 0.40), mat_teak)
    # Display props: Bamboo Bow, Iron Sword, Round Paricha Buckler Shield
    add_cylinder(col, "Display_Bow",    0.025, 1.10, (-0.60, 0.0, 1.00), mat_bamboo, 8, (math.pi / 2, 0, 0.2))
    add_box(col,      "Display_Sword",  (0.06, 0.85, 0.02), (0.0, 0.0, 0.94), mat_iron, (0, 0, 0.15))
    add_cylinder(col, "Display_Shield", 0.26, 0.05, (0.60, 0.0, 0.95), mat_teak, 16)
    add_sphere(col,   "Shield_Boss",    0.08, (0.60, 0.0, 0.99), mat_brass, (1.0, 1.0, 0.5))
    return col

# ------------------------------------------------------------
# 4. Smart UV Unwrap & 2K Cycles PBR Baking
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

# ------------------------------------------------------------
# 5. Build, Bake & Export All 6 Shops Separately
# ------------------------------------------------------------
# Note: market_stall_banana, market_stall_coconut, and market_stall_fish are built by
# scripts/generate_kerala_market_stalls.py (bamboo pillars, ola thatch, and 3D produce).
builders = [
    (build_chaya_kada,               -14.0),
    (build_toddy_shop,                -7.0),
    (build_kalari_equipment_counter,   0.0),
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
print("Done! All 6 pre-British 18th-century Kerala shops generated, baked, and exported.")
