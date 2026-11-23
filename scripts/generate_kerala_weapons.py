import bpy
import bmesh
import math
import os
from mathutils import Vector

# ============================================================
# Kaliyugham — Realistic Pre-British Kerala Kalari Weapons
# Exports Cycles-baked 1K PBR .glb assets to:
#   /Users/vishnuk/Documents/project/game/public/models/weapons/
#   - kalari_sword.glb      (Curved Kerala Vaal steel sword)
#   - kalari_buckler.glb    (Round Paricha hide & brass buckler)
#   - kalari_kettukari.glb  (Oiled bamboo Kettukari staff for Guru)
# ============================================================
EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/weapons"
TEX_DIR = "/Users/vishnuk/Documents/project/game/scripts/baked_textures/weapons"
BAKE_RES = 1024

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

def make_pbr_mat(name, base_rgb, metallic=0.0, roughness=0.5, bump_scale=24.0, bump_strength=0.18, noise_var=0.12):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    if hasattr(mat, "blend_method"):
        mat.blend_method = "OPAQUE"
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tc = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = bump_scale
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.6
    links.new(tc.outputs["Object"], noise.inputs["Vector"])

    c_dark = tuple(max(0.0, c * (1.0 - noise_var)) for c in base_rgb)
    c_light = tuple(min(1.0, c * (1.0 + noise_var)) for c in base_rgb)
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = (*c_dark, 1.0)
    mix.inputs["B"].default_value = (*c_light, 1.0)
    links.new(noise.outputs["Fac"], mix.inputs["Factor"])

    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.samples = 8
    ao.inputs["Distance"].default_value = 0.15
    mix_ao = nodes.new("ShaderNodeMix")
    mix_ao.data_type = "RGBA"
    mix_ao.blend_type = "MULTIPLY"
    mix_ao.inputs["Factor"].default_value = 0.42
    links.new(mix.outputs["Result"], mix_ao.inputs["A"])
    links.new(ao.outputs["Color"], mix_ao.inputs["B"])
    links.new(mix_ao.outputs["Result"], bsdf.inputs["Base Color"])

    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.004
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat

def bake_and_export_weapon(col, name):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    os.makedirs(TEX_DIR, exist_ok=True)
    objs = [o for o in col.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    weapon = bpy.context.view_layer.objects.active
    weapon.name = name

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")

    alb_name = f"{name}_albedo.png"
    nrm_name = f"{name}_normal.png"
    for nm in (alb_name, nrm_name):
        if nm in bpy.data.images:
            bpy.data.images.remove(bpy.data.images[nm])
    alb_img = bpy.data.images.new(alb_name, width=BAKE_RES, height=BAKE_RES)
    alb_img.colorspace_settings.name = "sRGB"
    nrm_img = bpy.data.images.new(nrm_name, width=BAKE_RES, height=BAKE_RES)
    nrm_img.colorspace_settings.name = "Non-Color"

    def set_target(img):
        for mat in weapon.data.materials:
            if not mat or not mat.use_nodes:
                continue
            tex = next((n for n in mat.node_tree.nodes if n.name == "__BAKE__"), None)
            if not tex:
                tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
                tex.name = "__BAKE__"
            tex.image = img
            for n in mat.node_tree.nodes:
                n.select = False
            tex.select = True
            mat.node_tree.nodes.active = tex

    scene = bpy.context.scene
    prev_engine = scene.render.engine
    prev_samples = scene.cycles.samples
    prev_dir = scene.render.bake.use_pass_direct
    prev_ind = scene.render.bake.use_pass_indirect
    prev_col = scene.render.bake.use_pass_color
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = 12
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
        scene.render.bake.margin = 5
        set_target(alb_img)
        bpy.ops.object.bake(type="DIFFUSE")
        set_target(nrm_img)
        bpy.ops.object.bake(type="NORMAL")
    finally:
        scene.render.engine = prev_engine
        scene.cycles.samples = prev_samples
        scene.render.bake.use_pass_direct = prev_dir
        scene.render.bake.use_pass_indirect = prev_ind
        scene.render.bake.use_pass_color = prev_col

    alb_img.filepath_raw = os.path.join(TEX_DIR, alb_name)
    alb_img.file_format = "PNG"
    alb_img.save()
    alb_img.pack()

    nrm_img.filepath_raw = os.path.join(TEX_DIR, nrm_name)
    nrm_img.file_format = "PNG"
    nrm_img.save()
    nrm_img.pack()

    # Keep per-material metallic/roughness properties while linking the shared baked Albedo + Normal
    for mat in weapon.data.materials:
        if not mat or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        met = bsdf.inputs["Metallic"].default_value if bsdf else 0.0
        rgh = bsdf.inputs["Roughness"].default_value if bsdf else 0.5
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Metallic"].default_value = met
        bsdf.inputs["Roughness"].default_value = rgh
        alb_tex = nodes.new("ShaderNodeTexImage")
        alb_tex.image = alb_img
        nrm_tex = nodes.new("ShaderNodeTexImage")
        nrm_tex.image = nrm_img
        nrm_map = nodes.new("ShaderNodeNormalMap")
        links.new(alb_tex.outputs["Color"], bsdf.inputs["Base Color"])
        links.new(nrm_tex.outputs["Color"], nrm_map.inputs["Color"])
        links.new(nrm_map.outputs["Normal"], bsdf.inputs["Normal"])
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    bpy.ops.object.select_all(action="DESELECT")
    weapon.select_set(True)
    bpy.context.view_layer.objects.active = weapon
    out_path = os.path.join(EXPORT_DIR, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_morph=False,
        export_animations=False,
    )
    print("Exported weapon:", out_path)
    return weapon

# ------------------------------------------------------------
# 1. Kerala Vaal (Curved Kalari Steel Sword) — origin at grip
# ------------------------------------------------------------
def build_kalari_sword():
    col = reset_collection("kalari_sword")
    mat_steel = make_pbr_mat("SwordSteel", (0.68, 0.70, 0.72), metallic=0.88, roughness=0.28, bump_scale=38.0, bump_strength=0.10, noise_var=0.08)
    mat_brass = make_pbr_mat("SwordBrass", (0.76, 0.56, 0.22), metallic=0.85, roughness=0.34, bump_scale=30.0, bump_strength=0.12, noise_var=0.10)
    mat_grip  = make_pbr_mat("SwordGrip",  (0.24, 0.13, 0.08), metallic=0.0,  roughness=0.84, bump_scale=48.0, bump_strength=0.25, noise_var=0.14)

    # Curved tapering diamond-section blade along +Z (0.10m to 0.88m)
    bm = bmesh.new()
    rings = 22
    ring_verts = []
    for i in range(rings + 1):
        t = i / rings
        z = 0.09 + t * 0.78
        curve_y = -0.055 * (t ** 2.1)
        half_w = 0.024 * (1.0 - 0.15 * t) if t < 0.84 else 0.020 * ((1.0 - t) / 0.16)
        half_w = max(0.0015, half_w)
        half_th = 0.0055 * (1.0 - 0.65 * t)
        # 6-point diamond profile with central fuller ridge
        pts = [
            Vector((0.0,     curve_y - half_w,        z)),
            Vector((half_th, curve_y - half_w * 0.25, z)),
            Vector((half_th * 0.8, curve_y + half_w * 0.55, z)),
            Vector((0.0,     curve_y + half_w,        z)),
            Vector((-half_th * 0.8, curve_y + half_w * 0.55, z)),
            Vector((-half_th, curve_y - half_w * 0.25, z)),
        ]
        ring_verts.append([bm.verts.new(p) for p in pts])
    for i in range(rings):
        for j in range(6):
            jn = (j + 1) % 6
            bm.faces.new((ring_verts[i][j], ring_verts[i][jn], ring_verts[i + 1][jn], ring_verts[i + 1][j]))
    bm.faces.new(ring_verts[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m_blade = bpy.data.meshes.new("SwordBlade")
    bm.to_mesh(m_blade)
    bm.free()
    for p in m_blade.polygons:
        p.use_smooth = True
    blade_obj = bpy.data.objects.new("SwordBlade", m_blade)
    blade_obj.data.materials.append(mat_steel)
    link_obj(blade_obj, col)

    # Ornate Kerala brass guard (kaipidi) + disc pommel
    bm_g = bmesh.new()
    ret = bmesh.ops.create_cube(bm_g, size=1.0)
    for v in ret["verts"]:
        v.co = Vector((v.co.x * 0.036, v.co.y * 0.115, 0.085 + v.co.z * 0.018))
    # Pommel disc at z = -0.085
    ret_p = bmesh.ops.create_cone(bm_g, cap_ends=True, segments=18, radius1=0.028, radius2=0.022, depth=0.020)
    for v in ret_p["verts"]:
        v.co.z -= 0.085
    ret_fin = bmesh.ops.create_uvsphere(bm_g, u_segments=12, v_segments=8, radius=0.011)
    for v in ret_fin["verts"]:
        v.co.z -= 0.102
    bmesh.ops.recalc_face_normals(bm_g, faces=bm_g.faces)
    m_guard = bpy.data.meshes.new("SwordGuard")
    bm_g.to_mesh(m_guard)
    bm_g.free()
    for p in m_guard.polygons:
        p.use_smooth = True
    guard_obj = bpy.data.objects.new("SwordGuard", m_guard)
    guard_obj.data.materials.append(mat_brass)
    link_obj(guard_obj, col)

    # Cord-wrapped wooden grip (origin centered at hand z=0)
    bm_h = bmesh.new()
    ret_h = bmesh.ops.create_cone(bm_h, cap_ends=True, segments=16, radius1=0.016, radius2=0.015, depth=0.165)
    for v in ret_h["verts"]:
        ridge = 0.0014 * math.sin(v.co.z * 210.0)
        v.co.x *= 1.0 + ridge * 30.0
        v.co.y *= 1.25 + ridge * 30.0
    m_grip = bpy.data.meshes.new("SwordGripMesh")
    bm_h.to_mesh(m_grip)
    bm_h.free()
    for p in m_grip.polygons:
        p.use_smooth = True
    grip_obj = bpy.data.objects.new("SwordGripMesh", m_grip)
    grip_obj.data.materials.append(mat_grip)
    link_obj(grip_obj, col)

    return bake_and_export_weapon(col, "kalari_sword")

# ------------------------------------------------------------
# 2. Kerala Paricha (Round Leather & Brass Buckler Shield)
# ------------------------------------------------------------
def build_kalari_buckler():
    col = reset_collection("kalari_buckler")
    mat_hide  = make_pbr_mat("ParichaHide",  (0.24, 0.14, 0.08), metallic=0.05, roughness=0.72, bump_scale=28.0, bump_strength=0.22, noise_var=0.14)
    mat_brass = make_pbr_mat("ParichaBrass", (0.78, 0.58, 0.22), metallic=0.86, roughness=0.32, bump_scale=32.0, bump_strength=0.12, noise_var=0.10)

    # Domed hide shield face along -Y outward, radius 0.22m
    bm = bmesh.new()
    segs = 32
    rings = 8
    radius = 0.22
    ring_verts = []
    center_v = bm.verts.new((0.0, -0.055, 0.0))
    for ir in range(1, rings + 1):
        t = ir / rings
        r = radius * t
        dome_y = -0.055 * math.cos(t * math.pi * 0.48)
        if ir == rings:
            dome_y += 0.014  # Rolled leather rim
        ring = [bm.verts.new((math.cos(a) * r, dome_y, math.sin(a) * r)) for a in [(j / segs) * math.pi * 2.0 for j in range(segs)]]
        ring_verts.append(ring)
    for j in range(segs):
        jn = (j + 1) % segs
        bm.faces.new((center_v, ring_verts[0][jn], ring_verts[0][j]))
    for ir in range(len(ring_verts) - 1):
        for j in range(segs):
            jn = (j + 1) % segs
            bm.faces.new((ring_verts[ir][j], ring_verts[ir][jn], ring_verts[ir + 1][jn], ring_verts[ir + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m_sh = bpy.data.meshes.new("ParichaDome")
    bm.to_mesh(m_sh)
    bm.free()
    for p in m_sh.polygons:
        p.use_smooth = True
    sh_obj = bpy.data.objects.new("ParichaDome", m_sh)
    sh_obj.data.materials.append(mat_hide)
    sol = sh_obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.012
    sol.offset = 1.0
    link_obj(sh_obj, col)
    bpy.context.view_layer.objects.active = sh_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")

    # Raised central brass boss (kumbham) + 4 decorative brass studs
    bm_b = bmesh.new()
    ret = bmesh.ops.create_uvsphere(bm_b, u_segments=20, v_segments=12, radius=0.058)
    for v in ret["verts"]:
        v.co.y = v.co.y * 0.55 - 0.058
    for k in range(4):
        ang = k * math.pi * 0.5 + math.pi * 0.25
        sx, sz = math.cos(ang) * 0.135, math.sin(ang) * 0.135
        ret_s = bmesh.ops.create_uvsphere(bm_b, u_segments=10, v_segments=8, radius=0.014)
        for v in ret_s["verts"]:
            v.co = Vector((sx + v.co.x, -0.036 + v.co.y * 0.6, sz + v.co.z))
    bmesh.ops.recalc_face_normals(bm_b, faces=bm_b.faces)
    m_boss = bpy.data.meshes.new("ParichaBrass")
    bm_b.to_mesh(m_boss)
    bm_b.free()
    for p in m_boss.polygons:
        p.use_smooth = True
    boss_obj = bpy.data.objects.new("ParichaBrass", m_boss)
    boss_obj.data.materials.append(mat_brass)
    link_obj(boss_obj, col)

    return bake_and_export_weapon(col, "kalari_buckler")

# ------------------------------------------------------------
# 3. Kerala Kettukari (Oiled Bamboo Staff for Kalari Guru)
# ------------------------------------------------------------
def build_kalari_kettukari():
    col = reset_collection("kalari_kettukari")
    mat_bamboo = make_pbr_mat("KettukariBamboo", (0.48, 0.34, 0.16), metallic=0.02, roughness=0.46, bump_scale=22.0, bump_strength=0.16, noise_var=0.14)
    mat_wrap   = make_pbr_mat("KettukariWrap",   (0.46, 0.14, 0.10), metallic=0.0,  roughness=0.86, bump_scale=44.0, bump_strength=0.24, noise_var=0.10)

    bm = bmesh.new()
    rings = 32
    segs = 14
    length = 1.65
    ring_verts = []
    for i in range(rings + 1):
        t = i / rings
        z = -0.55 + t * length
        # Subtle raised bamboo nodes every ~24cm
        node_bump = 0.0028 * math.exp(-(((z * 4.2) % 1.0 - 0.5) ** 2) / 0.006)
        r = 0.0175 + node_bump
        ring_verts.append([bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)) for a in [(j / segs) * math.pi * 2.0 for j in range(segs)]])
    for i in range(rings):
        for j in range(segs):
            jn = (j + 1) % segs
            bm.faces.new((ring_verts[i][j], ring_verts[i][jn], ring_verts[i + 1][jn], ring_verts[i + 1][j]))
    bm.faces.new(ring_verts[0][::-1])
    bm.faces.new(ring_verts[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m_st = bpy.data.meshes.new("KettukariShaft")
    bm.to_mesh(m_st)
    bm.free()
    for p in m_st.polygons:
        p.use_smooth = True
    st_obj = bpy.data.objects.new("KettukariShaft", m_st)
    st_obj.data.materials.append(mat_bamboo)
    st_obj.data.materials.append(mat_wrap)
    for p in st_obj.data.polygons:
        p.material_index = 1 if -0.10 <= p.center.z <= 0.12 else 0
    link_obj(st_obj, col)

    return bake_and_export_weapon(col, "kalari_kettukari")

if __name__ == "__main__":
    w1 = build_kalari_sword()
    w1.location.x = -0.6
    w2 = build_kalari_buckler()
    w2.location.x = 0.0
    w3 = build_kalari_kettukari()
    w3.location.x = 0.6
    bpy.ops.object.select_all(action="DESELECT")
    print("Done! Exported kalari_sword.glb, kalari_buckler.glb, and kalari_kettukari.glb.")
