import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Matrix

# ==============================================================================
# KALIYUGHAM — 18th-Century Kerala Fishing Vallam (Thoni) & Veesu Vala Cast Net
# ==============================================================================
# Run in Blender (Scripting -> Open -> Run Script) or headless:
#   blender --background --python scripts/generate_kerala_vallam_and_net.py
#
# Exports 3 game-ready textured GLBs directly into public/models/:
#   1. kerala_vallam.glb     — 4.8m Anjili-wood coir-stitched fishing canoe
#                              with upturned Chundu/Amaram, ribs, thwarts,
#                              wooden Thuzha paddle, bamboo Kazha pole,
#                              coiled coir rope, and Meen Kotta fish basket.
#   2. veesu_vala_held.glb   — Gathered/draped Veesu Vala cast net with
#                              hanging spindle sinkers & wrist hauling rope.
#   3. veesu_vala_spread.glb — Open circular conical Veesu Vala cast net
#                              (2.4m diameter) with radial cords, diamond mesh,
#                              48 perimeter spindle sinkers & apex haul line.
# ==============================================================================

OUT_DIR = "/Users/vishnuk/Documents/project/game/public/models"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(col):
            if item.users == 0:
                col.remove(item)


def make_packed_wood_mat(name, base_rgb, dark_rgb, roughness=0.72, seed=101, plank_lines=True):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    res = 512
    img = bpy.data.images.new(f"Tex_{name}", width=res, height=res, alpha=False)
    px = [0.0] * (res * res * 4)
    rng = random.Random(seed)
    for y in range(res):
        v = y / res
        for x in range(res):
            u = x / res
            grain = math.sin(v * 95.0 + math.sin(u * 14.0) * 1.8) * 0.5 + 0.5
            fine = math.sin(v * 260.0 + u * 22.0) * 0.04 + (rng.random() - 0.5) * 0.03
            seam = 0.0
            if plank_lines:
                p_mod = (v * 6.0) % 1.0
                if p_mod < 0.035 or p_mod > 0.965:
                    seam = -0.14
            t = max(0.0, min(1.0, grain * 0.65 + 0.2 + fine))
            idx = (y * res + x) * 4
            px[idx]     = max(0.0, min(1.0, dark_rgb[0] * (1 - t) + base_rgb[0] * t + seam))
            px[idx + 1] = max(0.0, min(1.0, dark_rgb[1] * (1 - t) + base_rgb[1] * t + seam))
            px[idx + 2] = max(0.0, min(1.0, dark_rgb[2] * (1 - t) + base_rgb[2] * t + seam))
            px[idx + 3] = 1.0
    img.pixels.foreach_set(px)
    img.pack()

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.22
    links.new(tex.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_simple_mat(name, rgba, roughness=0.8, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = metallic
    return mat


def make_net_mesh_mat(name="Mat_VeesuVala_Mesh"):
    """Alpha-cutout packed 512x512 hand-knotted tanned hemp diamond fishing net texture."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.blend_method = "CLIP" if hasattr(mat, "blend_method") else "HASHED"
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.90
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    res = 512
    img = bpy.data.images.new(f"Tex_{name}", width=res, height=res, alpha=True)
    px = [0.0] * (res * res * 4)
    cells = 22.0
    for y in range(res):
        v = y / res
        for x in range(res):
            u = x / res
            # Crisp 45-degree diamond knotted twine grid
            d1 = abs((((u + v) * cells) % 1.0) - 0.5)
            d2 = abs((((u - v) * cells) % 1.0) - 0.5)
            on_strand = (d1 > 0.415) or (d2 > 0.415)
            at_knot = (d1 > 0.38) and (d2 > 0.38)
            idx = (y * res + x) * 4
            if on_strand or at_knot:
                shade = 0.82 if at_knot else 1.0
                px[idx]     = 0.44 * shade
                px[idx + 1] = 0.33 * shade
                px[idx + 2] = 0.21 * shade
                px[idx + 3] = 1.0
            else:
                px[idx]     = 0.35
                px[idx + 1] = 0.26
                px[idx + 2] = 0.16
                px[idx + 3] = 0.0
    img.pixels.foreach_set(px)
    img.pack()

    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    return mat


def make_tube_along_points(name, pts, radius, mat, segs=8, closed=False):
    bm = bmesh.new()
    n = len(pts)
    rings = []
    for i in range(n):
        p_prev = pts[(i - 1) % n] if closed else pts[max(0, i - 1)]
        p_curr = pts[i]
        p_next = pts[(i + 1) % n] if closed else pts[min(n - 1, i + 1)]
        tang = (p_next - p_prev)
        if tang.length < 1e-6:
            tang = Vector((0, 0, 1))
        else:
            tang.normalize()
        ref = Vector((0, 0, 1)) if abs(tang.z) < 0.9 else Vector((1, 0, 0))
        binorm = tang.cross(ref).normalized()
        norm = binorm.cross(tang).normalized()
        ring = []
        for j in range(segs):
            a = (j / segs) * math.pi * 2.0
            pt = p_curr + (norm * math.cos(a) + binorm * math.sin(a)) * radius
            ring.append(bm.verts.new(pt))
        rings.append(ring)
    ring_count = n if closed else n - 1
    for i in range(ring_count):
        ni = (i + 1) % n
        for j in range(segs):
            nj = (j + 1) % segs
            bm.faces.new((rings[i][j], rings[ni][j], rings[ni][nj], rings[i][nj]))
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


def export_glb(filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
    )
    print(f"Exported: {filepath}")


# ==============================================================================
# 1. BUILD 18TH-CENTURY KERALA FISHING VALLAM (THONI / ANJILI WOOD CANOE)
# ==============================================================================
def build_kerala_vallam():
    clear_scene()

    # Materials: fish-oil-tarred dark Anjili outer hull, warm oiled Anjili interior,
    # natural coir rope lashing, weathered bamboo pole, woven Meen Kotta basket
    mat_hull_dark = make_packed_wood_mat(
        "Mat_Vallam_TarredAnjili",
        base_rgb=(0.14, 0.095, 0.065),
        dark_rgb=(0.045, 0.032, 0.025),
        roughness=0.58,
        seed=1790,
        plank_lines=True,
    )
    mat_wood_inner = make_packed_wood_mat(
        "Mat_Vallam_AnjiliWood",
        base_rgb=(0.36, 0.22, 0.12),
        dark_rgb=(0.20, 0.11, 0.06),
        roughness=0.72,
        seed=1792,
        plank_lines=True,
    )
    mat_coir = make_simple_mat("Mat_Kerala_Coir", (0.58, 0.43, 0.24, 1.0), roughness=0.92)
    mat_bamboo = make_packed_wood_mat(
        "Mat_Kerala_Bamboo",
        base_rgb=(0.64, 0.53, 0.29),
        dark_rgb=(0.45, 0.36, 0.18),
        roughness=0.66,
        seed=1795,
        plank_lines=False,
    )
    mat_basket = make_packed_wood_mat(
        "Mat_MeenKotta_Basket",
        base_rgb=(0.56, 0.41, 0.22),
        dark_rgb=(0.34, 0.23, 0.11),
        roughness=0.88,
        seed=1798,
        plank_lines=True,
    )

    # Hull dimensions (meters): Length = 4.8m (along Y), Max Beam = 0.96m (along X), Depth = 0.46m
    # Origin (0,0,0) sits at keel bottom center so it floats cleanly at waterSurfaceY
    length = 4.80
    half_len = length * 0.5
    max_half_beam = 0.48
    mid_depth = 0.46

    def hull_profile(s):
        """s in [-1, 1] from stern (-1) to bow (+1). Returns (y, half_beam, keel_z, sheer_z)."""
        y = s * half_len
        a = abs(s)
        # Slender teardrop/double-ended Kerala Vallam beam curve
        beam_factor = max(0.02, (1.0 - (a ** 2.15)) ** 0.72)
        half_b = max_half_beam * beam_factor
        # Classic curved upward rocker at keel & graceful upturned Chundu (bow) / Amaram (stern)
        rocker = 0.34 * (a ** 2.8)
        sheer_lift = 0.38 * (a ** 2.35)
        # Stern (Amaram, s < 0) rises slightly higher than bow (Chundu) like traditional Kerala Vallams
        stern_extra = 0.08 * max(0.0, -s) ** 2.6
        keel_z = rocker + stern_extra * 0.5
        sheer_z = mid_depth + sheer_lift + stern_extra
        return y, half_b, keel_z, sheer_z

    # A) Main Sculpted Hull Shell (u-shaped cross-section with gentle flare)
    n_len = 36
    n_sec = 14  # cross-section from port gunwale -> keel -> starboard gunwale
    bm = bmesh.new()
    grid = []
    for il in range(n_len + 1):
        s = -1.0 + 2.0 * (il / n_len)
        y, half_b, keel_z, sheer_z = hull_profile(s)
        row = []
        for ic in range(n_sec + 1):
            u = -1.0 + 2.0 * (ic / n_sec)  # -1 = port gunwale, 0 = keel, +1 = starboard gunwale
            au = abs(u)
            # Rounded dugout-style bilge curving smoothly up to flared gunwales
            x = math.copysign(half_b * (au ** 0.78), u)
            z = keel_z + (sheer_z - keel_z) * (au ** 1.75)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)

    uv_l = bm.loops.layers.uv.verify()
    for il in range(n_len):
        for ic in range(n_sec):
            f = bm.faces.new((
                grid[il][ic],
                grid[il + 1][ic],
                grid[il + 1][ic + 1],
                grid[il][ic + 1],
            ))
            f.loops[0][uv_l].uv = (il / n_len * 2.5, ic / n_sec)
            f.loops[1][uv_l].uv = ((il + 1) / n_len * 2.5, ic / n_sec)
            f.loops[2][uv_l].uv = ((il + 1) / n_len * 2.5, (ic + 1) / n_sec)
            f.loops[3][uv_l].uv = (il / n_len * 2.5, (ic + 1) / n_sec)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    hull_mesh = bpy.data.meshes.new("Vallam_Hull")
    bm.to_mesh(hull_mesh)
    bm.free()
    for p in hull_mesh.polygons:
        p.use_smooth = True
    hull_obj = bpy.data.objects.new("Vallam_Hull", hull_mesh)
    hull_obj.data.materials.append(mat_hull_dark)
    bpy.context.scene.collection.objects.link(hull_obj)

    sol = hull_obj.modifiers.new("HullThick", "SOLIDIFY")
    sol.thickness = 0.036
    sol.offset = -1.0
    bpy.context.view_layer.objects.active = hull_obj
    bpy.ops.object.modifier_apply(modifier="HullThick")

    # B) Heavy Gunwale Trim Rails (Port & Starboard) + Carved Upturned Stem Finials (Chundu & Amaram)
    for side in (-1.0, 1.0):
        rail_pts = []
        for il in range(n_len + 1):
            s = -1.0 + 2.0 * (il / n_len)
            y, half_b, _, sheer_z = hull_profile(s)
            rail_pts.append(Vector((side * half_b, y, sheer_z + 0.01)))
        make_tube_along_points(f"Vallam_Gunwale_{'L' if side < 0 else 'R'}", rail_pts, 0.026, mat_wood_inner, segs=8)

    # Pointed carved prow (Chundu) & stern (Amaram) stem caps
    for end_name, s_end, extra_h in [("Bow_Chundu", 1.0, 0.14), ("Stern_Amaram", -1.0, 0.20)]:
        y0, _, kz0, sz0 = hull_profile(s_end * 0.94)
        y1, _, kz1, sz1 = hull_profile(s_end)
        stem_pts = [
            Vector((0, y0, kz0 + 0.04)),
            Vector((0, y1, (kz1 + sz1) * 0.5)),
            Vector((0, y1 + s_end * 0.10, sz1 + extra_h)),
        ]
        make_tube_along_points(f"Vallam_{end_name}", stem_pts, 0.030, mat_hull_dark, segs=8)

    # C) 7 Curved Interior Wooden Ribs (Vanku) + Coir Lashing Straps
    for s_rib in (-0.68, -0.46, -0.23, 0.0, 0.23, 0.46, 0.68):
        y, half_b, keel_z, sheer_z = hull_profile(s_rib)
        rib_pts = []
        for k in range(13):
            u = -0.94 + 1.88 * (k / 12)
            au = abs(u)
            x = math.copysign((half_b - 0.032) * (au ** 0.78), u)
            z = keel_z + 0.038 + (sheer_z - keel_z - 0.05) * (au ** 1.75)
            rib_pts.append(Vector((x, y, z)))
        make_tube_along_points(f"Vallam_Rib_{s_rib:.2f}", rib_pts, 0.018, mat_wood_inner, segs=6)

    # D) Slatted Bottom Floorboards (Thazhthattu) along the middle bilge
    for slat_x in (-0.15, -0.05, 0.05, 0.15):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(slat_x, 0.0, 0.105))
        slat = bpy.context.active_object
        slat.name = f"Vallam_FloorSlat_{slat_x:.2f}"
        slat.scale = (0.075, 2.35, 0.022)
        bpy.ops.object.transform_apply(scale=True)
        slat.data.materials.append(mat_wood_inner)

    # E) 3 Transverse Wooden Rowing Bench Thwarts (Padi)
    for idx_t, s_thw in enumerate((-0.48, 0.02, 0.52)):
        y, half_b, keel_z, sheer_z = hull_profile(s_thw)
        z_seat = keel_z + (sheer_z - keel_z) * 0.66
        seat_w = (half_b * 1.82)
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, y, z_seat))
        thw = bpy.context.active_object
        thw.name = f"Vallam_Thwart_{idx_t}"
        thw.scale = (seat_w, 0.22, 0.034)
        bpy.ops.object.transform_apply(scale=True)
        thw.data.materials.append(mat_wood_inner)

    # F) Carved Anjili Wooden Paddle (Thuzha) resting along the starboard side
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.018, depth=1.55, location=(0.18, -0.15, 0.36))
    p_shaft = bpy.context.active_object
    p_shaft.name = "Vallam_Thuzha_Shaft"
    p_shaft.rotation_euler = (math.radians(84), 0.0, math.radians(-6))
    p_shaft.data.materials.append(mat_wood_inner)

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.24, -0.96, 0.28))
    p_blade = bpy.context.active_object
    p_blade.name = "Vallam_Thuzha_Blade"
    p_blade.scale = (0.14, 0.44, 0.018)
    p_blade.rotation_euler = (math.radians(-6), math.radians(15), math.radians(-6))
    bpy.ops.object.transform_apply(scale=True)
    p_blade.data.materials.append(mat_wood_inner)

    # G) Bamboo Punting Pole (Kazha) resting along the port gunwale
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.019, depth=3.45, location=(-0.24, 0.12, 0.43))
    pole = bpy.context.active_object
    pole.name = "Vallam_BambooPole_Kazha"
    pole.rotation_euler = (math.radians(88), 0.0, math.radians(3))
    pole.data.materials.append(mat_bamboo)

    # H) Coiled Coir Mooring Rope at Bow
    coil_pts = []
    for k in range(54):
        t = k / 54.0
        ang = t * math.pi * 2.0 * 3.0
        r = 0.05 + t * 0.095
        coil_pts.append(Vector((math.cos(ang) * r, 1.52 + math.sin(ang) * r, 0.34 + t * 0.045)))
    make_tube_along_points("Vallam_CoirRope", coil_pts, 0.011, mat_coir, segs=6)

    # I) Woven Bamboo Fish Basket (Meen Kotta) sitting inside mid-aft section
    bpy.ops.mesh.primitive_cone_add(
        vertices=18, radius1=0.16, radius2=0.22, depth=0.24, location=(-0.05, -0.62, 0.24)
    )
    basket = bpy.context.active_object
    basket.name = "Vallam_MeenKotta"
    for p in basket.data.polygons:
        p.use_smooth = True
    basket.data.materials.append(mat_basket)
    # Basket woven rim hoop
    rim_pts = [
        Vector((-0.05 + math.cos(k / 24 * math.pi * 2) * 0.22, -0.62 + math.sin(k / 24 * math.pi * 2) * 0.22, 0.36))
        for k in range(24)
    ]
    make_tube_along_points("Vallam_MeenKotta_Rim", rim_pts, 0.014, mat_coir, segs=6, closed=True)

    export_glb(os.path.join(OUT_DIR, "kerala_vallam.glb"))


# ==============================================================================
# 2. BUILD GATHERED / HELD VEESU VALA CAST NET (veesu_vala_held.glb)
# ==============================================================================
def build_veesu_vala_held():
    clear_scene()
    mat_twine = make_simple_mat("Mat_VeesuVala_Twine", (0.46, 0.35, 0.22, 1.0), roughness=0.92)
    mat_mesh = make_net_mesh_mat("Mat_VeesuVala_MeshHeld")
    mat_lead = make_simple_mat("Mat_VeesuVala_Sinkers", (0.24, 0.25, 0.27, 1.0), roughness=0.45, metallic=0.78)
    mat_rope = make_simple_mat("Mat_VeesuVala_HaulRope", (0.62, 0.48, 0.28, 1.0), roughness=0.92)

    # Origin (0,0,0) = hand-grip apex; net drapes downward along -Z (~0.78m long gathered bundle)
    bm = bmesh.new()
    rings = 14
    segs = 28
    v_rings = []
    for ir in range(rings + 1):
        t = ir / rings  # 0 = top grip apex, 1 = bottom weighted skirt
        z = -t * 0.76
        # Pinched at grip (0.025m), flares gently into bunched cloth folds (0.17m)
        base_r = 0.022 + 0.145 * (t ** 0.85)
        ring = []
        for iseg in range(segs):
            a = (iseg / segs) * math.pi * 2.0
            fold = math.sin(a * 7.0 + t * 2.2) * 0.024 * t
            r = max(0.015, base_r + fold)
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
        v_rings.append(ring)

    uv_l = bm.loops.layers.uv.verify()
    for ir in range(rings):
        for iseg in range(segs):
            ns = (iseg + 1) % segs
            f = bm.faces.new((v_rings[ir][iseg], v_rings[ir][ns], v_rings[ir + 1][ns], v_rings[ir + 1][iseg]))
            f.loops[0][uv_l].uv = (iseg / segs * 2.0, ir / rings * 1.6)
            f.loops[1][uv_l].uv = ((iseg + 1) / segs * 2.0, ir / rings * 1.6)
            f.loops[2][uv_l].uv = ((iseg + 1) / segs * 2.0, (ir + 1) / rings * 1.6)
            f.loops[3][uv_l].uv = (iseg / segs * 2.0, (ir + 1) / rings * 1.6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("VeesuVala_HeldBody")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    body_obj = bpy.data.objects.new("VeesuVala_HeldBody", mesh)
    body_obj.data.materials.append(mat_mesh)
    bpy.context.scene.collection.objects.link(body_obj)

    # Bottom lead/iron spindle sinkers clustered around gathered foot-rope
    for k in range(28):
        a = (k / 28.0) * math.pi * 2.0
        r = 0.165 + math.sin(a * 7.0 + 2.2) * 0.024
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=8, ring_count=6, radius=0.011, location=(math.cos(a) * r, math.sin(a) * r, -0.765)
        )
        sink = bpy.context.active_object
        sink.scale = (0.7, 0.7, 1.8)
        bpy.ops.object.transform_apply(scale=True)
        sink.data.materials.append(mat_lead)

    # Coiled wrist-loop hauling rope (Kayar) at the top grip
    loop_pts = [
        Vector((math.cos(k / 24 * math.pi * 2) * 0.065, math.sin(k / 24 * math.pi * 2) * 0.065, 0.04 + (k % 3) * 0.008))
        for k in range(24)
    ]
    make_tube_along_points("VeesuVala_WristCoil", loop_pts, 0.006, mat_rope, segs=6, closed=True)
    # Binding collar at apex
    collar_pts = [Vector((math.cos(k / 16 * math.pi * 2) * 0.026, math.sin(k / 16 * math.pi * 2) * 0.026, -0.02)) for k in range(16)]
    make_tube_along_points("VeesuVala_ApexTie", collar_pts, 0.008, mat_twine, segs=6, closed=True)

    export_glb(os.path.join(OUT_DIR, "veesu_vala_held.glb"))


# ==============================================================================
# 3. BUILD OPEN SPREAD VEESU VALA CAST NET (veesu_vala_spread.glb)
# ==============================================================================
def build_veesu_vala_spread():
    clear_scene()
    mat_mesh = make_net_mesh_mat("Mat_VeesuVala_MeshSpread")
    mat_twine = make_simple_mat("Mat_VeesuVala_Cord", (0.48, 0.36, 0.22, 1.0), roughness=0.90)
    mat_lead = make_simple_mat("Mat_VeesuVala_Sinkers", (0.24, 0.25, 0.27, 1.0), roughness=0.42, metallic=0.80)

    # Circular conical spread cast net: radius = 1.25m (2.5m diameter), dome height = 0.62m
    # Origin (0,0,0) = center of weighted bottom rim so it lands cleanly on waterSurfaceY
    radius = 1.25
    dome_h = 0.62
    rings = 14
    segs = 48

    bm = bmesh.new()
    v_rings = []
    for ir in range(rings + 1):
        t = ir / rings  # 0 = apex, 1 = outer weighted foot-rope
        r = max(0.02, radius * t)
        # Parabolic billowed cast-net canopy profile
        z = dome_h * (1.0 - (t ** 1.45))
        ring = []
        for iseg in range(segs):
            a = (iseg / segs) * math.pi * 2.0
            billow = math.sin(a * 12.0) * 0.015 * t
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z + billow)))
        v_rings.append(ring)

    uv_l = bm.loops.layers.uv.verify()
    for ir in range(rings):
        for iseg in range(segs):
            ns = (iseg + 1) % segs
            f = bm.faces.new((v_rings[ir][iseg], v_rings[ir][ns], v_rings[ir + 1][ns], v_rings[ir + 1][iseg]))
            f.loops[0][uv_l].uv = (iseg / segs * 6.0, ir / rings * 3.5)
            f.loops[1][uv_l].uv = ((iseg + 1) / segs * 6.0, ir / rings * 3.5)
            f.loops[2][uv_l].uv = ((iseg + 1) / segs * 6.0, (ir + 1) / rings * 3.5)
            f.loops[3][uv_l].uv = (iseg / segs * 6.0, (ir + 1) / rings * 3.5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("VeesuVala_Canopy")
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    canopy = bpy.data.objects.new("VeesuVala_Canopy", mesh)
    canopy.data.materials.append(mat_mesh)
    bpy.context.scene.collection.objects.link(canopy)

    # Outer weighted foot-rope (Kuralon/coir perimeter cord)
    foot_pts = [Vector((math.cos(k / 48 * math.pi * 2) * radius, math.sin(k / 48 * math.pi * 2) * radius, 0.0)) for k in range(48)]
    make_tube_along_points("VeesuVala_FootRope", foot_pts, 0.007, mat_twine, segs=6, closed=True)

    # 12 radial draw strings from apex down to the weighted perimeter
    for r_i in range(12):
        a = (r_i / 12.0) * math.pi * 2.0
        rib_pts = [
            Vector((math.cos(a) * (radius * (k / 10.0)), math.sin(a) * (radius * (k / 10.0)), dome_h * (1.0 - ((k / 10.0) ** 1.45))))
            for k in range(11)
        ]
        make_tube_along_points(f"VeesuVala_DrawCord_{r_i}", rib_pts, 0.004, mat_twine, segs=5)

    # 48 spindle lead/iron sinkers evenly spaced along the foot-rope perimeter
    for s_i in range(48):
        a = (s_i / 48.0) * math.pi * 2.0
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=8, ring_count=6, radius=0.009, location=(math.cos(a) * radius, math.sin(a) * radius, 0.0)
        )
        sink = bpy.context.active_object
        sink.rotation_euler = (0.0, math.pi * 0.5, a + math.pi * 0.5)
        sink.scale = (0.7, 0.7, 2.2)
        bpy.ops.object.transform_apply(scale=True)
        sink.data.materials.append(mat_lead)

    # Central apex tie ring + trailing hauling rope (Kayar)
    haul_pts = [
        Vector((0.0, 0.0, dome_h)),
        Vector((0.0, -0.35, dome_h + 0.14)),
        Vector((0.0, -0.85, dome_h + 0.10)),
        Vector((0.0, -1.35, dome_h - 0.04)),
    ]
    make_tube_along_points("VeesuVala_HaulLine", haul_pts, 0.006, mat_twine, segs=6)

    export_glb(os.path.join(OUT_DIR, "veesu_vala_spread.glb"))


if __name__ == "__main__":
    build_kerala_vallam()
    build_veesu_vala_held()
    build_veesu_vala_spread()
    print("All Kerala Vallam & Veesu Vala assets exported successfully!")
