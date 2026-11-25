import bpy
import bmesh
import math
import os
from mathutils import Vector

# ==============================================================================
# KALIYUGHAM — Shared Photorealistic Kerala Architectural PBR Material Library
# ==============================================================================
# Generates & caches crisp 1024x1024 seamless tiling PBR texture sets
# (Albedo + Tangent-Space Normal + Roughness) via Cycles baking onto a 1:1 UV
# tile plane, so EVERY house gets ~512 px/m real-world surface detail instead of
# blurry single-atlas textures.
#
# Cached textures are stored in:
#   /Users/vishnuk/Documents/project/game/scripts/baked_textures/kerala_pbr/
# Once generated on the first house run, all subsequent house scripts reuse the
# cached 1K PBR maps in < 1 second and pack them cleanly into each exported GLB!
# ==============================================================================

TEX_CACHE_DIR = "/Users/vishnuk/Documents/project/game/scripts/baked_textures/kerala_pbr"
TILE_RES = 1024


def _clear_node_tree(mat):
    mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = "OPAQUE"
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return nodes, links, bsdf, out


def _build_procedural_shader(mat_key):
    """Builds a rich procedural Blender shader on a temporary material for Cycles baking."""
    tmp_name = f"__PROC_{mat_key}__"
    if tmp_name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[tmp_name])
    mat = bpy.data.materials.new(tmp_name)
    nodes, links, bsdf, _ = _clear_node_tree(mat)

    tc = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    links.new(tc.outputs["UV"], mapping.inputs["Vector"])

    if mat_key == "kerala_odu_tiles":
        # Authentic Kerala / Mangalore terracotta clay Odu (ഓട്) interlocking roof tiles:
        #   - Overlapping horizontal courses + corrugated vertical rainwater channels
        #   - Natural kiln-fired terracotta variation + dark monsoon soot & moss in valleys
        #   - Strong tile-channel + course-lip normal relief
        brick = nodes.new("ShaderNodeTexBrick")
        brick.offset = 0.0
        brick.inputs["Scale"].default_value = 6.0
        brick.inputs["Mortar Size"].default_value = 0.035
        brick.inputs["Mortar Smooth"].default_value = 0.35
        brick.inputs["Bias"].default_value = -0.1
        brick.inputs["Brick Width"].default_value = 0.28
        brick.inputs["Row Height"].default_value = 0.38
        brick.inputs["Color1"].default_value = (0.44, 0.145, 0.072, 1.0)
        brick.inputs["Color2"].default_value = (0.29, 0.095, 0.048, 1.0)
        brick.inputs["Mortar"].default_value = (0.09, 0.045, 0.030, 1.0)
        links.new(mapping.outputs["Vector"], brick.inputs["Vector"])

        # Vertical flute/corrugation ridges on each Mangalore/Kerala clay tile
        wave = nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.bands_direction = "X"
        wave.wave_profile = "SIN"
        wave.inputs["Scale"].default_value = 21.5
        wave.inputs["Distortion"].default_value = 0.65
        wave.inputs["Detail"].default_value = 3.0
        links.new(mapping.outputs["Vector"], wave.inputs["Vector"])

        # Horizontal lip overlap shadow between tile courses
        wave_y = nodes.new("ShaderNodeTexWave")
        wave_y.wave_type = "BANDS"
        wave_y.bands_direction = "Y"
        wave_y.wave_profile = "SAW"
        wave_y.inputs["Scale"].default_value = 7.9
        wave_y.inputs["Distortion"].default_value = 0.25
        links.new(mapping.outputs["Vector"], wave_y.inputs["Vector"])

        # Monsoon moss & kiln soot weathering blotches
        weather = nodes.new("ShaderNodeTexNoise")
        weather.inputs["Scale"].default_value = 5.5
        weather.inputs["Detail"].default_value = 8.0
        weather.inputs["Roughness"].default_value = 0.68
        links.new(mapping.outputs["Vector"], weather.inputs["Vector"])

        moss_ramp = nodes.new("ShaderNodeValToRGB")
        moss_ramp.color_ramp.elements[0].position = 0.56
        moss_ramp.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
        moss_ramp.color_ramp.elements[1].position = 0.78
        moss_ramp.color_ramp.elements[1].color = (0.58, 0.58, 0.58, 1.0)
        links.new(weather.outputs["Fac"], moss_ramp.inputs["Fac"])

        # Mix tile base with subtle dark moss/soot
        mix_moss = nodes.new("ShaderNodeMix")
        mix_moss.data_type = "RGBA"
        mix_moss.inputs["B"].default_value = (0.11, 0.13, 0.06, 1.0)
        links.new(moss_ramp.outputs["Color"], mix_moss.inputs["Factor"])
        links.new(brick.outputs["Color"], mix_moss.inputs["A"])

        # Darken flutes slightly for crisp self-shadowing
        mix_flute = nodes.new("ShaderNodeMix")
        mix_flute.data_type = "RGBA"
        mix_flute.blend_type = "MULTIPLY"
        mix_flute.inputs["Factor"].default_value = 0.34
        links.new(mix_moss.outputs["Result"], mix_flute.inputs["A"])
        links.new(wave.outputs["Color"], mix_flute.inputs["B"])
        links.new(mix_flute.outputs["Result"], bsdf.inputs["Base Color"])

        # Roughness: dry clay ~0.78, mossy/damp spots ~0.94
        r_map = nodes.new("ShaderNodeMapRange")
        r_map.inputs["From Min"].default_value = 0.0
        r_map.inputs["From Max"].default_value = 1.0
        r_map.inputs["To Min"].default_value = 0.72
        r_map.inputs["To Max"].default_value = 0.94
        links.new(weather.outputs["Fac"], r_map.inputs["Value"])
        links.new(r_map.outputs["Result"], bsdf.inputs["Roughness"])

        # Combined height: vertical tile flutes + horizontal overlap + brick mortar
        m1 = nodes.new("ShaderNodeMath")
        m1.operation = "MULTIPLY_ADD"
        m1.inputs[1].default_value = 0.52
        links.new(wave.outputs["Fac"], m1.inputs[0])
        links.new(wave_y.outputs["Fac"], m1.inputs[2])

        m2 = nodes.new("ShaderNodeMath")
        m2.operation = "MULTIPLY_ADD"
        m2.inputs[1].default_value = 0.65
        links.new(m1.outputs["Value"], m2.inputs[0])
        links.new(brick.outputs["Fac"], m2.inputs[2])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.85
        bump.inputs["Distance"].default_value = 0.045
        links.new(m2.outputs["Value"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    elif mat_key == "kerala_laterite_stone":
        # Cut Kerala red laterite (Vettukallu) ashlar blocks with porous ironstone cavities & lime mortar
        brick = nodes.new("ShaderNodeTexBrick")
        brick.offset = 0.5
        brick.inputs["Scale"].default_value = 3.2
        brick.inputs["Mortar Size"].default_value = 0.022
        brick.inputs["Mortar Smooth"].default_value = 0.25
        brick.inputs["Brick Width"].default_value = 0.62
        brick.inputs["Row Height"].default_value = 0.28
        brick.inputs["Color1"].default_value = (0.37, 0.14, 0.088, 1.0)
        brick.inputs["Color2"].default_value = (0.24, 0.092, 0.058, 1.0)
        brick.inputs["Mortar"].default_value = (0.58, 0.52, 0.42, 1.0)
        links.new(mapping.outputs["Vector"], brick.inputs["Vector"])

        pores = nodes.new("ShaderNodeTexVoronoi")
        pores.feature = "F1"
        pores.inputs["Scale"].default_value = 38.0
        links.new(mapping.outputs["Vector"], pores.inputs["Vector"])

        grit = nodes.new("ShaderNodeTexNoise")
        grit.inputs["Scale"].default_value = 14.0
        grit.inputs["Detail"].default_value = 10.0
        grit.inputs["Roughness"].default_value = 0.72
        links.new(mapping.outputs["Vector"], grit.inputs["Vector"])

        mix_c = nodes.new("ShaderNodeMix")
        mix_c.data_type = "RGBA"
        mix_c.blend_type = "MULTIPLY"
        mix_c.inputs["Factor"].default_value = 0.36
        links.new(brick.outputs["Color"], mix_c.inputs["A"])
        links.new(grit.outputs["Color"], mix_c.inputs["B"])
        links.new(mix_c.outputs["Result"], bsdf.inputs["Base Color"])

        r_map = nodes.new("ShaderNodeMapRange")
        r_map.inputs["To Min"].default_value = 0.84
        r_map.inputs["To Max"].default_value = 0.98
        links.new(grit.outputs["Fac"], r_map.inputs["Value"])
        links.new(r_map.outputs["Result"], bsdf.inputs["Roughness"])

        h1 = nodes.new("ShaderNodeMath")
        h1.operation = "MULTIPLY_ADD"
        h1.inputs[1].default_value = 0.35
        links.new(pores.outputs["Distance"], h1.inputs[0])
        links.new(grit.outputs["Fac"], h1.inputs[2])

        h2 = nodes.new("ShaderNodeMath")
        h2.operation = "MULTIPLY"
        links.new(h1.outputs["Value"], h2.inputs[0])
        links.new(brick.outputs["Fac"], h2.inputs[1])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.78
        bump.inputs["Distance"].default_value = 0.032
        links.new(h2.outputs["Value"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    elif mat_key == "kerala_lime_plaster":
        # Traditional shell-lime (Chunnambu) whitewash with trowel texture & monsoon damp mottling
        macro = nodes.new("ShaderNodeTexNoise")
        macro.inputs["Scale"].default_value = 3.8
        macro.inputs["Detail"].default_value = 6.0
        macro.inputs["Roughness"].default_value = 0.62
        links.new(mapping.outputs["Vector"], macro.inputs["Vector"])

        fine = nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = 28.0
        fine.inputs["Detail"].default_value = 9.0
        fine.inputs["Roughness"].default_value = 0.72
        links.new(mapping.outputs["Vector"], fine.inputs["Vector"])

        mix_c = nodes.new("ShaderNodeMix")
        mix_c.data_type = "RGBA"
        mix_c.inputs["A"].default_value = (0.76, 0.71, 0.60, 1.0)
        mix_c.inputs["B"].default_value = (0.58, 0.52, 0.41, 1.0)
        links.new(macro.outputs["Fac"], mix_c.inputs["Factor"])

        mix_f = nodes.new("ShaderNodeMix")
        mix_f.data_type = "RGBA"
        mix_f.inputs["B"].default_value = (0.68, 0.64, 0.54, 1.0)
        mix_f.inputs["Factor"].default_value = 0.25
        links.new(mix_c.outputs["Result"], mix_f.inputs["A"])
        links.new(mix_f.outputs["Result"], bsdf.inputs["Base Color"])

        r_map = nodes.new("ShaderNodeMapRange")
        r_map.inputs["To Min"].default_value = 0.78
        r_map.inputs["To Max"].default_value = 0.94
        links.new(fine.outputs["Fac"], r_map.inputs["Value"])
        links.new(r_map.outputs["Result"], bsdf.inputs["Roughness"])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.28
        bump.inputs["Distance"].default_value = 0.015
        links.new(fine.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    elif mat_key == "kerala_teak_wood":
        # Seasoned dark Malabar teak (Thekku) timber with rich anisotropic wood grain
        mapping.inputs["Scale"].default_value = (1.5, 9.5, 1.5)
        grain = nodes.new("ShaderNodeTexNoise")
        grain.inputs["Scale"].default_value = 6.5
        grain.inputs["Detail"].default_value = 10.0
        grain.inputs["Roughness"].default_value = 0.68
        grain.inputs["Distortion"].default_value = 1.4
        links.new(mapping.outputs["Vector"], grain.inputs["Vector"])

        rings = nodes.new("ShaderNodeTexWave")
        rings.wave_type = "BANDS"
        rings.bands_direction = "X"
        rings.inputs["Scale"].default_value = 6.0
        rings.inputs["Distortion"].default_value = 4.2
        rings.inputs["Detail"].default_value = 6.0
        links.new(mapping.outputs["Vector"], rings.inputs["Vector"])

        mix_w = nodes.new("ShaderNodeMix")
        mix_w.data_type = "RGBA"
        mix_w.inputs["A"].default_value = (0.095, 0.048, 0.024, 1.0)
        mix_w.inputs["B"].default_value = (0.20, 0.105, 0.052, 1.0)
        links.new(rings.outputs["Fac"], mix_w.inputs["Factor"])

        mix_g = nodes.new("ShaderNodeMix")
        mix_g.data_type = "RGBA"
        mix_g.blend_type = "MULTIPLY"
        mix_g.inputs["Factor"].default_value = 0.35
        links.new(mix_w.outputs["Result"], mix_g.inputs["A"])
        links.new(grain.outputs["Color"], mix_g.inputs["B"])
        links.new(mix_g.outputs["Result"], bsdf.inputs["Base Color"])

        r_map = nodes.new("ShaderNodeMapRange")
        r_map.inputs["To Min"].default_value = 0.44
        r_map.inputs["To Max"].default_value = 0.72
        links.new(grain.outputs["Fac"], r_map.inputs["Value"])
        links.new(r_map.outputs["Result"], bsdf.inputs["Roughness"])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.38
        bump.inputs["Distance"].default_value = 0.012
        links.new(grain.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    elif mat_key == "kerala_red_oxide":
        # Hand-troweled Kerala red-oxide verandah & courtyard floor
        n1 = nodes.new("ShaderNodeTexNoise")
        n1.inputs["Scale"].default_value = 5.5
        n1.inputs["Detail"].default_value = 8.0
        n1.inputs["Roughness"].default_value = 0.58
        links.new(mapping.outputs["Vector"], n1.inputs["Vector"])

        mix_c = nodes.new("ShaderNodeMix")
        mix_c.data_type = "RGBA"
        mix_c.inputs["A"].default_value = (0.34, 0.082, 0.058, 1.0)
        mix_c.inputs["B"].default_value = (0.46, 0.125, 0.088, 1.0)
        links.new(n1.outputs["Fac"], mix_c.inputs["Factor"])
        links.new(mix_c.outputs["Result"], bsdf.inputs["Base Color"])

        r_map = nodes.new("ShaderNodeMapRange")
        r_map.inputs["To Min"].default_value = 0.32
        r_map.inputs["To Max"].default_value = 0.56
        links.new(n1.outputs["Fac"], r_map.inputs["Value"])
        links.new(r_map.outputs["Result"], bsdf.inputs["Roughness"])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.12
        bump.inputs["Distance"].default_value = 0.008
        links.new(n1.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    elif mat_key == "kerala_granite_plinth":
        # Chiseled Kerala granite (Karinkallu) plinth stone blocks
        brick = nodes.new("ShaderNodeTexBrick")
        brick.offset = 0.5
        brick.inputs["Scale"].default_value = 2.6
        brick.inputs["Mortar Size"].default_value = 0.018
        brick.inputs["Brick Width"].default_value = 0.72
        brick.inputs["Row Height"].default_value = 0.32
        brick.inputs["Color1"].default_value = (0.24, 0.23, 0.21, 1.0)
        brick.inputs["Color2"].default_value = (0.16, 0.155, 0.145, 1.0)
        brick.inputs["Mortar"].default_value = (0.10, 0.095, 0.085, 1.0)
        links.new(mapping.outputs["Vector"], brick.inputs["Vector"])

        speck = nodes.new("ShaderNodeTexNoise")
        speck.inputs["Scale"].default_value = 42.0
        speck.inputs["Detail"].default_value = 10.0
        links.new(mapping.outputs["Vector"], speck.inputs["Vector"])

        mix_c = nodes.new("ShaderNodeMix")
        mix_c.data_type = "RGBA"
        mix_c.blend_type = "MULTIPLY"
        mix_c.inputs["Factor"].default_value = 0.32
        links.new(brick.outputs["Color"], mix_c.inputs["A"])
        links.new(speck.outputs["Color"], mix_c.inputs["B"])
        links.new(mix_c.outputs["Result"], bsdf.inputs["Base Color"])

        r_map = nodes.new("ShaderNodeMapRange")
        r_map.inputs["To Min"].default_value = 0.72
        r_map.inputs["To Max"].default_value = 0.92
        links.new(speck.outputs["Fac"], r_map.inputs["Value"])
        links.new(r_map.outputs["Result"], bsdf.inputs["Roughness"])

        h1 = nodes.new("ShaderNodeMath")
        h1.operation = "MULTIPLY"
        links.new(brick.outputs["Fac"], h1.inputs[0])
        links.new(speck.outputs["Fac"], h1.inputs[1])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.62
        bump.inputs["Distance"].default_value = 0.025
        links.new(h1.outputs["Value"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    elif mat_key == "kerala_palm_thatch":
        # Woven/layered dried coconut-palm (Ola) thatch strands
        mapping.inputs["Scale"].default_value = (12.0, 2.2, 1.0)
        strands = nodes.new("ShaderNodeTexNoise")
        strands.inputs["Scale"].default_value = 9.0
        strands.inputs["Detail"].default_value = 12.0
        strands.inputs["Roughness"].default_value = 0.78
        links.new(mapping.outputs["Vector"], strands.inputs["Vector"])

        courses = nodes.new("ShaderNodeTexWave")
        courses.wave_type = "BANDS"
        courses.bands_direction = "Y"
        courses.wave_profile = "SAW"
        courses.inputs["Scale"].default_value = 4.5
        courses.inputs["Distortion"].default_value = 1.6
        links.new(tc.outputs["UV"], courses.inputs["Vector"])

        mix_c = nodes.new("ShaderNodeMix")
        mix_c.data_type = "RGBA"
        mix_c.inputs["A"].default_value = (0.24, 0.175, 0.088, 1.0)
        mix_c.inputs["B"].default_value = (0.43, 0.33, 0.175, 1.0)
        links.new(strands.outputs["Fac"], mix_c.inputs["Factor"])

        mix_sh = nodes.new("ShaderNodeMix")
        mix_sh.data_type = "RGBA"
        mix_sh.blend_type = "MULTIPLY"
        mix_sh.inputs["Factor"].default_value = 0.42
        links.new(mix_c.outputs["Result"], mix_sh.inputs["A"])
        links.new(courses.outputs["Color"], mix_sh.inputs["B"])
        links.new(mix_sh.outputs["Result"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.95

        h1 = nodes.new("ShaderNodeMath")
        h1.operation = "MULTIPLY_ADD"
        h1.inputs[1].default_value = 0.55
        links.new(strands.outputs["Fac"], h1.inputs[0])
        links.new(courses.outputs["Fac"], h1.inputs[2])

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.88
        bump.inputs["Distance"].default_value = 0.04
        links.new(h1.outputs["Value"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    elif mat_key == "kerala_mud_wall":
        # Hand-packed cob/earth (Cheli) wall plaster
        n1 = nodes.new("ShaderNodeTexNoise")
        n1.inputs["Scale"].default_value = 5.0
        n1.inputs["Detail"].default_value = 9.0
        n1.inputs["Roughness"].default_value = 0.72
        links.new(mapping.outputs["Vector"], n1.inputs["Vector"])

        mix_c = nodes.new("ShaderNodeMix")
        mix_c.data_type = "RGBA"
        mix_c.inputs["A"].default_value = (0.36, 0.22, 0.13, 1.0)
        mix_c.inputs["B"].default_value = (0.50, 0.34, 0.21, 1.0)
        links.new(n1.outputs["Fac"], mix_c.inputs["Factor"])
        links.new(mix_c.outputs["Result"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.94

        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.55
        bump.inputs["Distance"].default_value = 0.025
        links.new(n1.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    else:
        # kerala_brass (antique temple/manor brass)
        n1 = nodes.new("ShaderNodeTexNoise")
        n1.inputs["Scale"].default_value = 18.0
        n1.inputs["Detail"].default_value = 6.0
        links.new(mapping.outputs["Vector"], n1.inputs["Vector"])
        mix_c = nodes.new("ShaderNodeMix")
        mix_c.data_type = "RGBA"
        mix_c.inputs["A"].default_value = (0.64, 0.45, 0.14, 1.0)
        mix_c.inputs["B"].default_value = (0.86, 0.66, 0.24, 1.0)
        links.new(n1.outputs["Fac"], mix_c.inputs["Factor"])
        links.new(mix_c.outputs["Result"], bsdf.inputs["Base Color"])
        bsdf.inputs["Metallic"].default_value = 0.88
        r_map = nodes.new("ShaderNodeMapRange")
        r_map.inputs["To Min"].default_value = 0.22
        r_map.inputs["To Max"].default_value = 0.42
        links.new(n1.outputs["Fac"], r_map.inputs["Value"])
        links.new(r_map.outputs["Result"], bsdf.inputs["Roughness"])

    return mat


def _ensure_baked_tile_textures(mat_key, force_rebake=False):
    """Cycles-bakes crisp 1024x1024 Albedo + Normal + Roughness maps once and caches them."""
    os.makedirs(TEX_CACHE_DIR, exist_ok=True)
    alb_path = os.path.join(TEX_CACHE_DIR, f"{mat_key}_albedo.png")
    nrm_path = os.path.join(TEX_CACHE_DIR, f"{mat_key}_normal.png")
    rgh_path = os.path.join(TEX_CACHE_DIR, f"{mat_key}_roughness.png")

    if not force_rebake and all(os.path.exists(p) for p in (alb_path, nrm_path, rgh_path)):
        return alb_path, nrm_path, rgh_path

    # Create temporary 2m x 2m plane with exact [0, 1] UVs
    bm = bmesh.new()
    v0 = bm.verts.new((-1.0, -1.0, 0.0))
    v1 = bm.verts.new((1.0, -1.0, 0.0))
    v2 = bm.verts.new((1.0, 1.0, 0.0))
    v3 = bm.verts.new((-1.0, 1.0, 0.0))
    f = bm.faces.new((v0, v1, v2, v3))
    uv_layer = bm.loops.layers.uv.new("UVMap")
    uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    for loop, uv in zip(f.loops, uvs):
        loop[uv_layer].uv = uv
    mesh = bpy.data.meshes.new(f"__BakePlane_{mat_key}__")
    bm.to_mesh(mesh)
    bm.free()
    plane = bpy.data.objects.new(f"__BakePlane_{mat_key}__", mesh)
    bpy.context.scene.collection.objects.link(plane)

    proc_mat = _build_procedural_shader(mat_key)
    plane.data.materials.append(proc_mat)

    def make_img(tag, colorspace):
        nm = f"__tmp_{mat_key}_{tag}__"
        if nm in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[nm])
        im = bpy.data.images.new(nm, width=TILE_RES, height=TILE_RES)
        im.colorspace_settings.name = colorspace
        return im

    alb_img = make_img("alb", "sRGB")
    nrm_img = make_img("nrm", "Non-Color")
    rgh_img = make_img("rgh", "Non-Color")

    tex_node = proc_mat.node_tree.nodes.new("ShaderNodeTexImage")
    for n in proc_mat.node_tree.nodes:
        n.select = False
    tex_node.select = True
    proc_mat.node_tree.nodes.active = tex_node

    scene = bpy.context.scene
    prev_engine = scene.render.engine
    prev_samples = scene.cycles.samples
    prev_dir = scene.render.bake.use_pass_direct
    prev_ind = scene.render.bake.use_pass_indirect
    prev_col = scene.render.bake.use_pass_color

    bpy.ops.object.select_all(action="DESELECT")
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane

    try:
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 8
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
        scene.render.bake.margin = 4

        tex_node.image = alb_img
        bpy.ops.object.bake(type="DIFFUSE")

        tex_node.image = nrm_img
        bpy.ops.object.bake(type="NORMAL")

        tex_node.image = rgh_img
        bpy.ops.object.bake(type="ROUGHNESS")
    finally:
        scene.render.engine = prev_engine
        scene.cycles.samples = prev_samples
        scene.render.bake.use_pass_direct = prev_dir
        scene.render.bake.use_pass_indirect = prev_ind
        scene.render.bake.use_pass_color = prev_col

    for img, path in ((alb_img, alb_path), (nrm_img, nrm_path), (rgh_img, rgh_path)):
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        bpy.data.images.remove(img)

    bpy.data.objects.remove(plane, do_unlink=True)
    bpy.data.meshes.remove(mesh)
    bpy.data.materials.remove(proc_mat)
    print(f"Baked 1K PBR textures for {mat_key} -> {TEX_CACHE_DIR}")
    return alb_path, nrm_path, rgh_path


def get_pbr_material(mat_key, metallic=0.0, normal_strength=1.0, force_rebake=False):
    """Returns an export-ready glTF Principled BSDF material with packed 1K Albedo + Normal + Roughness."""
    mat_name = f"PBR_{mat_key}"
    if mat_name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[mat_name])

    alb_path, nrm_path, rgh_path = _ensure_baked_tile_textures(mat_key, force_rebake=force_rebake)

    mat = bpy.data.materials.new(mat_name)
    nodes, links, bsdf, _ = _clear_node_tree(mat)
    bsdf.inputs["Metallic"].default_value = metallic

    def load_packed(path, colorspace):
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = colorspace
        try:
            img.pack()
        except Exception:
            pass
        return img

    alb_tex = nodes.new("ShaderNodeTexImage")
    alb_tex.image = load_packed(alb_path, "sRGB")
    links.new(alb_tex.outputs["Color"], bsdf.inputs["Base Color"])

    rgh_tex = nodes.new("ShaderNodeTexImage")
    rgh_tex.image = load_packed(rgh_path, "Non-Color")
    links.new(rgh_tex.outputs["Color"], bsdf.inputs["Roughness"])

    nrm_tex = nodes.new("ShaderNodeTexImage")
    nrm_tex.image = load_packed(nrm_path, "Non-Color")
    nrm_map = nodes.new("ShaderNodeNormalMap")
    nrm_map.inputs["Strength"].default_value = normal_strength
    links.new(nrm_tex.outputs["Color"], nrm_map.inputs["Color"])
    links.new(nrm_map.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def get_kerala_material_palette(force_rebake=False):
    """Builds and returns the full dictionary of photorealistic Kerala architectural PBR materials."""
    return {
        "odu":         get_pbr_material("kerala_odu_tiles",      metallic=0.0,  normal_strength=1.40, force_rebake=force_rebake),
        "laterite":    get_pbr_material("kerala_laterite_stone", metallic=0.0,  normal_strength=1.35, force_rebake=force_rebake),
        "lime":        get_pbr_material("kerala_lime_plaster",   metallic=0.0,  normal_strength=0.90, force_rebake=force_rebake),
        "teak":        get_pbr_material("kerala_teak_wood",      metallic=0.0,  normal_strength=1.10, force_rebake=force_rebake),
        "teak_planks": get_pbr_material("kerala_teak_planks",    metallic=0.0,  normal_strength=1.35, force_rebake=force_rebake),
        "oxide":       get_pbr_material("kerala_red_oxide",      metallic=0.0,  normal_strength=0.55, force_rebake=force_rebake),
        "granite":     get_pbr_material("kerala_granite_plinth", metallic=0.0,  normal_strength=1.25, force_rebake=force_rebake),
        "thatch":      get_pbr_material("kerala_palm_thatch",    metallic=0.0,  normal_strength=1.35, force_rebake=force_rebake),
        "mud":         get_pbr_material("kerala_mud_wall",       metallic=0.0,  normal_strength=1.10, force_rebake=force_rebake),
        "brass":       get_pbr_material("kerala_brass",          metallic=0.88, normal_strength=0.45, force_rebake=force_rebake),
    }


def apply_world_box_uvs(obj, tile_meters=2.0):
    """
    Assigns clean world-space triplanar/box UVs directly via bmesh so every face
    gets uniform real-world texel density (no stretched UVs, works without Edit Mode).
    Roof slopes align their V axis along the slope descent so Odu tiles run straight down!
    """
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.verify()
    inv = 1.0 / max(tile_meters, 0.1)

    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        if az >= ax and az >= ay:
            # Horizontal or sloped roof face: align U across slope, V down slope!
            if ax > 0.08 or ay > 0.08:
                # Sloped roof: slope descent vector projected onto XY
                slope_dir = Vector((n.x, n.y, 0.0))
                if slope_dir.length > 1e-4:
                    slope_dir.normalize()
                    across = Vector((-slope_dir.y, slope_dir.x, 0.0))
                    down_3d = Vector((slope_dir.x * n.z, slope_dir.y * n.z, -(slope_dir.x * n.x + slope_dir.y * n.y)))
                    down_3d.normalize()
                    for loop in f.loops:
                        co = loop.vert.co
                        loop[uv_layer].uv = (co.dot(across) * inv, co.dot(down_3d) * inv)
                    continue
            for loop in f.loops:
                co = loop.vert.co
                loop[uv_layer].uv = (co.x * inv, co.y * inv)
        elif ax >= ay:
            for loop in f.loops:
                co = loop.vert.co
                loop[uv_layer].uv = (co.y * inv, co.z * inv)
        else:
            for loop in f.loops:
                co = loop.vert.co
                loop[uv_layer].uv = (co.x * inv, co.z * inv)

    bm.to_mesh(mesh)
    bm.free()


def export_optimized_glb(filepath, image_quality=82):
    """
    Exports the currently selected object(s) as a web-optimized GLB using native
    WebP/JPEG texture compression (supported natively by Three.js GLTFLoader with
    zero extra runtime decoder) so 15-19 MB buildings shrink to ~1-2 MB!
    Safely adapts kwargs to whichever Blender 3.x/4.x version is installed.
    """
    props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kwargs = {
        "filepath": filepath,
        "export_format": "GLB",
        "use_selection": True,
        "export_yup": True,
        "export_apply": True,
        "export_morph": False,
        "export_animations": False,
    }
    if "export_image_format" in props:
        # Prefer WEBP (smallest & crispest in Three.js/Chrome/Safari), fallback to JPEG
        enum_ids = {
            e.identifier
            for e in bpy.ops.export_scene.gltf.get_rna_type().properties["export_image_format"].enum_items
        }
        if "WEBP" in enum_ids:
            kwargs["export_image_format"] = "WEBP"
        elif "JPEG" in enum_ids:
            kwargs["export_image_format"] = "JPEG"
    if "export_image_quality" in props:
        kwargs["export_image_quality"] = image_quality
    elif "export_jpeg_quality" in props:
        kwargs["export_jpeg_quality"] = image_quality
    if "export_webp_fallback" in props:
        kwargs["export_webp_fallback"] = False

    bpy.ops.export_scene.gltf(**kwargs)

