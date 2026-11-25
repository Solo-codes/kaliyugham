import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Euler, Matrix

# ==============================================================================
# KALIYUGHAM (18th-Century Rural Kerala) — Realistic Anatomical Animals & Fish
# ==============================================================================
# Builds 15 anatomically sculpted, spine-lofted + Catmull-Clark subdivided
# rural Kerala animals, birds, and water creatures with packed organic PBR
# fur/hide/feather/scale textures + auto UVs, exported to:
#   /Users/vishnuk/Documents/project/game/public/models/animals/*.glb
#
# Articulated child mesh naming (animated by src/world/keralaAnimals.ts):
#   Body, Head, Tail, Leg_FL, Leg_FR, Leg_BL, Leg_BR, Wing_L, Wing_R, TailFin
#   Forward axis in Blender: -Y
# ==============================================================================

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/animals"
AUTO_EXPORT = True

# ------------------------------------------------------------------------------
# 1. Packed Organic PBR Material Library (Guaranteed glTF Color & Texture Export)
# ------------------------------------------------------------------------------
def clear_material(name):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (640, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (320, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nodes, links, bsdf


def _make_packed_animal_texture(name, col_a, col_b, pattern="fur", seed=19):
    img_name = f"Tex_{name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    res = 128
    img = bpy.data.images.new(img_name, width=res, height=res, alpha=False)
    r = random.Random(seed)
    g = 16
    grid = [[r.random() for _ in range(g)] for _ in range(g)]
    pixels = [0.0] * (res * res * 4)

    for y in range(res):
        v = y / res
        gy = v * g
        y0 = int(gy) % g
        y1 = (y0 + 1) % g
        fy = gy - int(gy)
        fy = fy * fy * (3.0 - 2.0 * fy)
        for x in range(res):
            u = x / res
            gx = u * g
            x0 = int(gx) % g
            x1 = (x0 + 1) % g
            fx = gx - int(gx)
            fx = fx * fx * (3.0 - 2.0 * fx)
            val = (
                (grid[y0][x0] * (1.0 - fx) + grid[y0][x1] * fx) * (1.0 - fy)
                + (grid[y1][x0] * (1.0 - fx) + grid[y1][x1] * fx) * fy
            )
            if pattern == "scales":
                band = 0.5 + 0.5 * math.sin(u * math.pi * 10.0 + val * 1.4)
                scale_dots = 0.5 + 0.5 * math.sin(v * math.pi * 24.0) * math.cos(u * math.pi * 24.0)
                t = 0.42 * val + 0.36 * band + 0.22 * scale_dots
            elif pattern == "feathers":
                streak = 0.5 + 0.5 * math.sin((u * 14.0 + v * 4.0 + val) * math.pi * 2.0)
                t = 0.55 * val + 0.45 * streak
            elif pattern == "shell":
                hex_like = 0.5 + 0.5 * math.cos(u * math.pi * 10.0) * math.cos(v * math.pi * 10.0)
                t = 0.45 * val + 0.55 * hex_like
            elif pattern == "hide":
                wrinkle = 0.5 + 0.5 * math.sin((v * 18.0 + val * 2.5) * math.pi * 2.0)
                t = 0.65 * val + 0.35 * wrinkle
            else:
                strand = 0.5 + 0.5 * math.sin((u * 22.0 + val * 1.8) * math.pi * 2.0)
                t = 0.68 * val + 0.32 * strand
            t = max(0.0, min(1.0, t))
            idx = (y * res + x) * 4
            pixels[idx] = col_a[0] + (col_b[0] - col_a[0]) * t
            pixels[idx + 1] = col_a[1] + (col_b[1] - col_a[1]) * t
            pixels[idx + 2] = col_a[2] + (col_b[2] - col_a[2]) * t
            pixels[idx + 3] = 1.0
    img.pixels.foreach_set(pixels)
    img.pack()
    return img


_SEED = 700


def make_animal_mat(name, col_a, col_b, roughness=0.72, pattern="fur", bump_str=0.22, metallic=0.0):
    global _SEED
    _SEED += 23
    mat, nodes, links, bsdf = clear_material(name)
    mat.use_backface_culling = False
    img = _make_packed_animal_texture(name, col_a, col_b, pattern=pattern, seed=_SEED)
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.location = (0, 120)
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if bump_str > 0.0:
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_str
        bump.location = (160, -120)
        links.new(tex.outputs["Color"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# Mammalian coats & hides
mat_cow_coat      = make_animal_mat("Anim_CowCoat",       (0.42, 0.24, 0.11), (0.64, 0.42, 0.22), 0.78, "fur", 0.18)
mat_cow_leg       = make_animal_mat("Anim_CowLeg",        (0.36, 0.20, 0.10), (0.54, 0.35, 0.19), 0.78, "fur", 0.16)
mat_buffalo_hide  = make_animal_mat("Anim_BuffaloHide",   (0.08, 0.08, 0.09), (0.18, 0.17, 0.19), 0.66, "hide", 0.28)
mat_goat_white    = make_animal_mat("Anim_GoatWhite",     (0.72, 0.68, 0.60), (0.88, 0.85, 0.78), 0.82, "fur", 0.20)
mat_goat_brown    = make_animal_mat("Anim_GoatBrown",     (0.28, 0.17, 0.09), (0.48, 0.32, 0.18), 0.82, "fur", 0.20)
mat_dog_tawny     = make_animal_mat("Anim_DogTawny",      (0.42, 0.25, 0.12), (0.66, 0.44, 0.22), 0.78, "fur", 0.20)
mat_elephant_hide = make_animal_mat("Anim_ElephantHide",  (0.18, 0.17, 0.16), (0.31, 0.29, 0.27), 0.88, "hide", 0.44)
mat_ivory         = make_animal_mat("Anim_Ivory",         (0.80, 0.75, 0.60), (0.95, 0.91, 0.80), 0.30, "hide", 0.05)
mat_horn          = make_animal_mat("Anim_Horn",          (0.14, 0.12, 0.10), (0.28, 0.24, 0.18), 0.48, "hide", 0.15)
mat_hoof          = make_animal_mat("Anim_Hoof",          (0.08, 0.07, 0.06), (0.15, 0.13, 0.11), 0.55, "hide", 0.12)
mat_eye_dark      = make_animal_mat("Anim_EyeDark",       (0.02, 0.02, 0.02), (0.06, 0.05, 0.04), 0.08, "hide", 0.0)
mat_nose_dark     = make_animal_mat("Anim_NoseDark",      (0.12, 0.09, 0.09), (0.22, 0.16, 0.16), 0.32, "hide", 0.08)
mat_gold_orn      = make_animal_mat("Anim_GoldOrn",       (0.74, 0.54, 0.12), (0.95, 0.76, 0.24), 0.26, "scales", 0.16, metallic=0.72)

# Birds & Squirrels
mat_rooster_red   = make_animal_mat("Anim_RoosterRed",    (0.48, 0.12, 0.04), (0.76, 0.28, 0.06), 0.64, "feathers", 0.20)
mat_rooster_tail  = make_animal_mat("Anim_RoosterTail",   (0.04, 0.12, 0.10), (0.10, 0.26, 0.20), 0.36, "feathers", 0.16, metallic=0.22)
mat_comb_red      = make_animal_mat("Anim_CombRed",       (0.70, 0.05, 0.04), (0.92, 0.12, 0.08), 0.45, "hide", 0.10)
mat_hen_brown     = make_animal_mat("Anim_HenBrown",      (0.36, 0.23, 0.11), (0.60, 0.44, 0.24), 0.72, "feathers", 0.20)
mat_beak_yellow   = make_animal_mat("Anim_BeakYellow",    (0.74, 0.54, 0.08), (0.94, 0.74, 0.18), 0.40, "hide", 0.06)
mat_peacock_blue  = make_animal_mat("Anim_PeacockBlue",   (0.03, 0.16, 0.48), (0.08, 0.40, 0.78), 0.28, "feathers", 0.16, metallic=0.35)
mat_peacock_train = make_animal_mat("Anim_PeacockTrain",  (0.05, 0.32, 0.16), (0.20, 0.58, 0.28), 0.34, "feathers", 0.22, metallic=0.28)
mat_egret_white   = make_animal_mat("Anim_EgretWhite",    (0.86, 0.86, 0.82), (0.99, 0.99, 0.96), 0.64, "feathers", 0.14)
mat_squirrel_mar  = make_animal_mat("Anim_SquirrelMar",   (0.34, 0.09, 0.05), (0.56, 0.18, 0.09), 0.76, "fur", 0.22)
mat_squirrel_crm  = make_animal_mat("Anim_SquirrelCrm",   (0.70, 0.58, 0.40), (0.88, 0.78, 0.60), 0.78, "fur", 0.20)

# Water Creatures
mat_karimeen      = make_animal_mat("Water_Karimeen",     (0.16, 0.28, 0.24), (0.54, 0.64, 0.58), 0.22, "scales", 0.18, metallic=0.38)
mat_rohu          = make_animal_mat("Water_Rohu",         (0.24, 0.32, 0.26), (0.74, 0.80, 0.76), 0.20, "scales", 0.16, metallic=0.48)
mat_fin           = make_animal_mat("Water_Fin",          (0.22, 0.30, 0.26), (0.46, 0.54, 0.48), 0.34, "feathers", 0.12)
mat_turtle_shell  = make_animal_mat("Water_TurtleShell",  (0.14, 0.20, 0.10), (0.34, 0.38, 0.20), 0.42, "shell", 0.34)
mat_turtle_skin   = make_animal_mat("Water_TurtleSkin",   (0.18, 0.24, 0.14), (0.32, 0.38, 0.22), 0.58, "hide", 0.20)
mat_frog_green    = make_animal_mat("Water_FrogGreen",    (0.14, 0.36, 0.08), (0.38, 0.58, 0.14), 0.24, "hide", 0.16)
mat_duck_plumage  = make_animal_mat("Water_DuckPlumage",  (0.32, 0.23, 0.14), (0.60, 0.50, 0.36), 0.62, "feathers", 0.18)
mat_duck_head     = make_animal_mat("Water_DuckHead",     (0.05, 0.24, 0.15), (0.14, 0.44, 0.28), 0.34, "feathers", 0.14, metallic=0.25)

# ------------------------------------------------------------------------------
# 2. Anatomical Spine-Lofting & Articulated BMesh Builders
# ------------------------------------------------------------------------------
def reset_collection(name):
    if name in bpy.data.collections:
        col = bpy.data.collections[name]
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def build_part(col, name, bm, mat, pivot=(0.0, 0.0, 0.0), smooth=True, subsurf_levels=1):
    """Finalizes a BMesh into a smooth, subdivided Blender Object with clean local pivot & UVs."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    px, py, pz = pivot
    if px != 0.0 or py != 0.0 or pz != 0.0:
        for v in bm.verts:
            v.co.x -= px
            v.co.y -= py
            v.co.z -= pz
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    obj.location = (px, py, pz)
    obj.data.materials.append(mat)
    col.objects.link(obj)

    if subsurf_levels > 0:
        mod = obj.modifiers.new("Subsurf", "SUBSURF")
        mod.levels = subsurf_levels
        mod.render_levels = subsurf_levels
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)

    # Apply tri-planar UVs on the final subdivided mesh
    bm2 = bmesh.new()
    bm2.from_mesh(obj.data)
    uv_layer = bm2.loops.layers.uv.verify()
    for f in bm2.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * 2.0, co.y * 2.0)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * 2.0, co.z * 2.0)
            else:
                loop[uv_layer].uv = (co.x * 2.0, co.z * 2.0)
    bm2.to_mesh(obj.data)
    bm2.free()

    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def add_anatomical_loft(bm, sections, segs=12):
    """
    Lofts a smooth, realistic zoological body along Y (nose at -Y, tail at +Y).
    Each section is (y, z_bottom, z_top, half_width, belly_pinch).
    """
    rings = []
    for sec in sections:
        y, zb, zt, hw = sec[0], sec[1], sec[2], sec[3]
        zc = (zb + zt) * 0.5
        hz = max(0.004, (zt - zb) * 0.5)
        ring = []
        for s in range(segs):
            ang = (s / segs) * math.pi * 2.0
            ca = math.cos(ang)
            sa = math.sin(ang)
            # Slightly flatter sides & broader back than pure circle for realistic mammal/fish cross-section
            w_mod = hw * (0.94 + 0.06 * sa)
            x = ca * w_mod
            z = zc + sa * hz
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)

    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))

    # Smoothly cap front and back with pole vertex
    y0, zb0, zt0 = sections[0][0], sections[0][1], sections[0][2]
    v_front = bm.verts.new((0.0, y0 - 0.02, (zb0 + zt0) * 0.5))
    for s in range(segs):
        sn = (s + 1) % segs
        bm.faces.new((v_front, rings[0][sn], rings[0][s]))

    y1, zb1, zt1 = sections[-1][0], sections[-1][1], sections[-1][2]
    v_back = bm.verts.new((0.0, y1 + 0.02, (zb1 + zt1) * 0.5))
    for s in range(segs):
        sn = (s + 1) % segs
        bm.faces.new((v_back, rings[-1][s], rings[-1][sn]))


def add_tube(bm, points, radii, segs=8, cap=True):
    rings = []
    prev_x = Vector((1, 0, 0))
    n = len(points)
    for i, pt in enumerate(points):
        vpt = Vector(pt)
        if i == 0:
            tan = (Vector(points[1]) - vpt).normalized()
        elif i == n - 1:
            tan = (vpt - Vector(points[-2])).normalized()
        else:
            tan = (Vector(points[i + 1]) - Vector(points[i - 1])).normalized()
        if tan.length < 1e-6:
            tan = Vector((0, 0, 1))
        x_ax = prev_x - tan * prev_x.dot(tan)
        if x_ax.length < 1e-4:
            ref = Vector((0, 1, 0)) if abs(tan.x) > 0.8 else Vector((1, 0, 0))
            x_ax = tan.cross(ref)
        x_ax.normalize()
        y_ax = tan.cross(x_ax).normalized()
        prev_x = x_ax
        r = radii[i]
        ring = [bm.verts.new(vpt + (x_ax * math.cos(s / segs * math.pi * 2) + y_ax * math.sin(s / segs * math.pi * 2)) * r) for s in range(segs)]
        rings.append(ring)
    for i in range(n - 1):
        for s in range(segs):
            sn = (s + 1) % segs
            bm.faces.new((rings[i][s], rings[i][sn], rings[i + 1][sn], rings[i + 1][s]))
    if cap and len(rings) >= 2:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def add_ellipsoid(bm, center, rx, ry, rz, segs=10, rings=7, rot=(0, 0, 0)):
    m = Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((rx, ry, rz, 1.0))
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0, matrix=m)


def add_contoured_quadruped_legs(col, specs, mat_leg, mat_foot):
    """
    Creates 4 anatomically contoured legs (muscular upper thigh/shoulder -> knee/hock ->
    slender cannon bone -> fetlock -> hoof/paw) pivoted at hip/shoulder.
    specs: list of (name, hip_x, hip_y, hip_z, r_upper, r_knee, r_ankle, hock_offset_y)
    """
    for name, lx, ly, lz, ru, rk, ra, hock_y in specs:
        bm = bmesh.new()
        pts = [
            (lx, ly, lz),
            (lx, ly + hock_y * 0.4, lz * 0.66),
            (lx, ly + hock_y, lz * 0.42),
            (lx, ly + hock_y * 0.35, lz * 0.14),
            (lx, ly - 0.01, 0.04),
        ]
        rads = [ru, ru * 0.78, rk, ra, ra * 1.05]
        add_tube(bm, pts, rads, segs=8)
        obj = build_part(col, name, bm, mat_leg, pivot=(lx, ly, lz), subsurf_levels=1)

        bm_f = bmesh.new()
        add_ellipsoid(bm_f, (lx, ly - 0.02, 0.025), ra * 1.25, ra * 1.45, 0.03, segs=8, rings=5)
        foot = build_part(col, f"{name}_Foot", bm_f, mat_foot, pivot=(lx, ly, lz), subsurf_levels=0)
        foot.parent = obj
        foot.location = (0, 0, 0)


def add_eyes_to_head(col, head_obj, pivot, eye_positions, radius=0.022):
    bm_e = bmesh.new()
    for pos in eye_positions:
        add_ellipsoid(bm_e, pos, radius, radius, radius, segs=8, rings=6)
    eyes = build_part(col, "Eyes", bm_e, mat_eye_dark, pivot=pivot, subsurf_levels=0)
    eyes.parent = head_obj
    eyes.location = (0, 0, 0)


# ------------------------------------------------------------------------------
# 3. DOMESTIC & VILLAGE ANIMALS (Anatomical Spine-Lofted)
# ------------------------------------------------------------------------------
def build_animal_kerala_cow():
    """Indigenous Kerala Vechoor / Nadan Zebu Cow — realistic bovine silhouette."""
    col = reset_collection("animal_kerala_cow")
    bm = bmesh.new()
    # Spine loft from brisket (-0.64) through zebu hump (-0.34), barrel ribcage (0.0), flank (0.36), rump (0.68)
    add_anatomical_loft(bm, [
        (-0.66, 0.66, 1.04, 0.16),  # Front chest/brisket
        (-0.48, 0.56, 1.18, 0.24),  # Shoulders + dewlap
        (-0.30, 0.58, 1.32, 0.27),  # Zebu dorsal hump peak
        (-0.08, 0.60, 1.16, 0.30),  # Deep barrel ribcage
        ( 0.20, 0.64, 1.15, 0.29),  # Mid-back
        ( 0.44, 0.68, 1.17, 0.26),  # Pelvic/hip bones
        ( 0.64, 0.76, 1.10, 0.21),  # Rounded rump
        ( 0.72, 0.84, 1.02, 0.12),  # Tail base
    ], segs=12)
    build_part(col, "Body", bm, mat_cow_coat, subsurf_levels=1)

    # Articulated Bovine Neck & Sculpted Angular Head
    pivot = (0.0, -0.58, 0.96)
    bm_h = bmesh.new()
    add_anatomical_loft(bm_h, [
        (-1.24, 0.90, 1.04, 0.068),  # Broad muzzle tip
        (-1.08, 0.92, 1.10, 0.085),  # Bridge of nose
        (-0.92, 0.90, 1.18, 0.125),  # Brow & cheeks
        (-0.78, 0.84, 1.16, 0.135),  # Upper neck
        (-0.56, 0.72, 1.10, 0.165),  # Neck base meeting shoulders
    ], segs=10)
    # Sculpted outward-sweeping bovine ears
    for sx in (-1, 1):
        add_tube(bm_h, [(sx * 0.11, -0.88, 1.12), (sx * 0.21, -0.86, 1.15), (sx * 0.26, -0.85, 1.12)], [0.036, 0.032, 0.012], segs=6)
    head_obj = build_part(col, "Head", bm_h, mat_cow_coat, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.11, -0.96, 1.10), (0.11, -0.96, 1.10)], 0.020)

    # Dark wet muzzle nose
    bm_n = bmesh.new()
    add_ellipsoid(bm_n, (0.0, -1.24, 0.96), 0.065, 0.035, 0.055, segs=8, rings=6)
    nose = build_part(col, "Nose", bm_n, mat_nose_dark, pivot=pivot, subsurf_levels=0)
    nose.parent = head_obj
    nose.location = (0, 0, 0)

    # Curved zebu horns
    bm_hn = bmesh.new()
    for sx in (-1, 1):
        add_tube(bm_hn, [(sx * 0.08, -0.88, 1.17), (sx * 0.19, -0.90, 1.28), (sx * 0.17, -0.94, 1.40)], [0.028, 0.019, 0.007], segs=6)
    horns = build_part(col, "Horns", bm_hn, mat_horn, pivot=pivot, subsurf_levels=0)
    horns.parent = head_obj
    horns.location = (0, 0, 0)

    add_contoured_quadruped_legs(col, [
        ("Leg_FL", -0.18, -0.44, 0.76, 0.095, 0.055, 0.038, -0.02),
        ("Leg_FR",  0.18, -0.44, 0.76, 0.095, 0.055, 0.038, -0.02),
        ("Leg_BL", -0.19,  0.46, 0.80, 0.105, 0.058, 0.038,  0.07),
        ("Leg_BR",  0.19,  0.46, 0.80, 0.105, 0.058, 0.038,  0.07),
    ], mat_cow_leg, mat_hoof)

    bm_t = bmesh.new()
    add_tube(bm_t, [(0, 0.70, 1.00), (0, 0.78, 0.72), (0, 0.75, 0.36)], [0.026, 0.018, 0.014], segs=6)
    add_ellipsoid(bm_t, (0, 0.75, 0.30), 0.038, 0.038, 0.08, segs=6, rings=5)
    build_part(col, "Tail", bm_t, mat_cow_coat, pivot=(0, 0.70, 1.00), subsurf_levels=0)
    return col


def build_animal_water_buffalo():
    """Kerala Eruma / Pothu — Heavy-chested dark water buffalo with swept crescent horns."""
    col = reset_collection("animal_water_buffalo")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.74, 0.68, 1.12, 0.22),
        (-0.48, 0.58, 1.28, 0.32),
        (-0.18, 0.56, 1.26, 0.37),
        ( 0.18, 0.60, 1.24, 0.36),
        ( 0.50, 0.66, 1.22, 0.31),
        ( 0.74, 0.78, 1.12, 0.20),
    ], segs=12)
    build_part(col, "Body", bm, mat_buffalo_hide, subsurf_levels=1)

    pivot = (0.0, -0.66, 1.00)
    bm_h = bmesh.new()
    add_anatomical_loft(bm_h, [
        (-1.38, 0.84, 1.00, 0.095),
        (-1.18, 0.88, 1.08, 0.115),
        (-0.98, 0.90, 1.16, 0.155),
        (-0.66, 0.78, 1.14, 0.205),
    ], segs=10)
    for sx in (-1, 1):
        add_tube(bm_h, [(sx * 0.14, -0.96, 1.06), (sx * 0.26, -0.93, 1.04)], [0.044, 0.022], segs=6)
    head_obj = build_part(col, "Head", bm_h, mat_buffalo_hide, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.13, -1.04, 1.06), (0.13, -1.04, 1.06)], 0.022)

    bm_hn = bmesh.new()
    for sx in (-1, 1):
        add_tube(
            bm_hn,
            [(sx * 0.11, -0.96, 1.14), (sx * 0.36, -0.84, 1.15), (sx * 0.44, -0.60, 1.25), (sx * 0.32, -0.48, 1.35)],
            [0.050, 0.042, 0.026, 0.010], segs=7,
        )
    horns = build_part(col, "Horns", bm_hn, mat_horn, pivot=pivot, subsurf_levels=0)
    horns.parent = head_obj
    horns.location = (0, 0, 0)

    add_contoured_quadruped_legs(col, [
        ("Leg_FL", -0.23, -0.48, 0.78, 0.115, 0.068, 0.048, -0.02),
        ("Leg_FR",  0.23, -0.48, 0.78, 0.115, 0.068, 0.048, -0.02),
        ("Leg_BL", -0.24,  0.50, 0.80, 0.125, 0.070, 0.048,  0.07),
        ("Leg_BR",  0.24,  0.50, 0.80, 0.125, 0.070, 0.048,  0.07),
    ], mat_buffalo_hide, mat_hoof)

    bm_t = bmesh.new()
    add_tube(bm_t, [(0, 0.74, 1.02), (0, 0.82, 0.70), (0, 0.79, 0.40)], [0.030, 0.020, 0.015], segs=6)
    build_part(col, "Tail", bm_t, mat_buffalo_hide, pivot=(0, 0.74, 1.02), subsurf_levels=0)
    return col


def build_animal_malabari_goat():
    """Malabari Village Goat (Aadu) — Slender lofted caprine silhouette."""
    col = reset_collection("animal_malabari_goat")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.34, 0.42, 0.62, 0.10),
        (-0.18, 0.38, 0.65, 0.145),
        ( 0.06, 0.39, 0.65, 0.155),
        ( 0.26, 0.42, 0.66, 0.14),
        ( 0.36, 0.48, 0.62, 0.09),
    ], segs=10)
    build_part(col, "Body", bm, mat_goat_white, subsurf_levels=1)

    pivot = (0.0, -0.30, 0.56)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.30, 0.56), (0, -0.44, 0.74), (0, -0.58, 0.71)], [0.085, 0.065, 0.045], segs=8)
    add_ellipsoid(bm_h, (0, -0.59, 0.62), 0.022, 0.028, 0.05, segs=6, rings=4)  # Goatee
    for sx in (-1, 1):
        add_tube(bm_h, [(sx * 0.06, -0.45, 0.76), (sx * 0.11, -0.46, 0.65)], [0.028, 0.016], segs=5)
    head_obj = build_part(col, "Head", bm_h, mat_goat_brown, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.055, -0.50, 0.74), (0.055, -0.50, 0.74)], 0.013)

    bm_hn = bmesh.new()
    for sx in (-1, 1):
        add_tube(bm_hn, [(sx * 0.035, -0.45, 0.80), (sx * 0.075, -0.39, 0.91)], [0.015, 0.006], segs=5)
    horns = build_part(col, "Horns", bm_hn, mat_horn, pivot=pivot, subsurf_levels=0)
    horns.parent = head_obj
    horns.location = (0, 0, 0)

    add_contoured_quadruped_legs(col, [
        ("Leg_FL", -0.09, -0.22, 0.46, 0.046, 0.028, 0.020, -0.01),
        ("Leg_FR",  0.09, -0.22, 0.46, 0.046, 0.028, 0.020, -0.01),
        ("Leg_BL", -0.10,  0.22, 0.47, 0.052, 0.030, 0.020,  0.04),
        ("Leg_BR",  0.10,  0.22, 0.47, 0.052, 0.030, 0.020,  0.04),
    ], mat_goat_white, mat_hoof)

    bm_t = bmesh.new()
    add_tube(bm_t, [(0, 0.35, 0.58), (0, 0.42, 0.66)], [0.022, 0.010], segs=5)
    build_part(col, "Tail", bm_t, mat_goat_brown, pivot=(0, 0.35, 0.58), subsurf_levels=0)
    return col


def build_animal_village_dog():
    """Nadan Patti — Lean athletic Kerala pariah dog with deep chest & tucked waist."""
    col = reset_collection("animal_village_dog")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.34, 0.36, 0.56, 0.095),
        (-0.18, 0.30, 0.57, 0.125),  # Deep canine chest
        ( 0.06, 0.36, 0.56, 0.100),  # Tucked waist
        ( 0.24, 0.38, 0.56, 0.115),  # Haunches
        ( 0.36, 0.42, 0.53, 0.075),
    ], segs=10)
    build_part(col, "Body", bm, mat_dog_tawny, subsurf_levels=1)

    pivot = (0.0, -0.30, 0.49)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.30, 0.49), (0, -0.44, 0.64), (0, -0.58, 0.61)], [0.082, 0.072, 0.034], segs=8)
    for sx in (-1, 1):
        add_tube(bm_h, [(sx * 0.05, -0.44, 0.70), (sx * 0.07, -0.45, 0.80)], [0.028, 0.007], segs=5)
    head_obj = build_part(col, "Head", bm_h, mat_dog_tawny, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.048, -0.49, 0.66), (0.048, -0.49, 0.66)], 0.012)

    add_contoured_quadruped_legs(col, [
        ("Leg_FL", -0.08, -0.22, 0.40, 0.044, 0.026, 0.020, -0.01),
        ("Leg_FR",  0.08, -0.22, 0.40, 0.044, 0.026, 0.020, -0.01),
        ("Leg_BL", -0.085, 0.24, 0.42, 0.052, 0.028, 0.020,  0.05),
        ("Leg_BR",  0.085, 0.24, 0.42, 0.052, 0.028, 0.020,  0.05),
    ], mat_dog_tawny, mat_squirrel_crm)

    bm_t = bmesh.new()
    add_tube(bm_t, [(0, 0.34, 0.50), (0, 0.46, 0.62), (0, 0.40, 0.74)], [0.024, 0.017, 0.008], segs=6)
    build_part(col, "Tail", bm_t, mat_dog_tawny, pivot=(0, 0.34, 0.50), subsurf_levels=0)
    return col


def build_animal_rooster():
    """Poovan Kozhi — Sleek village rooster with red comb & sickle tail."""
    col = reset_collection("animal_rooster")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.15, 0.24, 0.37, 0.075),
        (-0.04, 0.19, 0.38, 0.105),
        ( 0.08, 0.21, 0.36, 0.095),
        ( 0.18, 0.27, 0.36, 0.055),
    ], segs=10)
    build_part(col, "Body", bm, mat_rooster_red, subsurf_levels=1)

    pivot = (0.0, -0.11, 0.34)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.11, 0.34), (0, -0.15, 0.47), (0, -0.17, 0.50)], [0.052, 0.036, 0.034], segs=7)
    head_obj = build_part(col, "Head", bm_h, mat_rooster_red, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.030, -0.18, 0.50), (0.030, -0.18, 0.50)], 0.008)

    bm_c = bmesh.new()
    add_ellipsoid(bm_c, (0, -0.16, 0.56), 0.012, 0.045, 0.032, segs=6, rings=4)
    add_ellipsoid(bm_c, (0, -0.19, 0.45), 0.014, 0.018, 0.025, segs=6, rings=4)
    comb = build_part(col, "Comb", bm_c, mat_comb_red, pivot=pivot, subsurf_levels=0)
    comb.parent = head_obj
    comb.location = (0, 0, 0)

    bm_bk = bmesh.new()
    add_tube(bm_bk, [(0, -0.20, 0.49), (0, -0.26, 0.47)], [0.015, 0.003], segs=5)
    beak = build_part(col, "Beak", bm_bk, mat_beak_yellow, pivot=pivot, subsurf_levels=0)
    beak.parent = head_obj
    beak.location = (0, 0, 0)

    bm_t = bmesh.new()
    for sx in (-0.028, 0.0, 0.028):
        add_tube(bm_t, [(sx, 0.14, 0.34), (sx * 1.4, 0.25, 0.51), (sx * 1.8, 0.38, 0.43)], [0.022, 0.018, 0.006], segs=5)
    build_part(col, "Tail", bm_t, mat_rooster_tail, pivot=(0, 0.14, 0.34), subsurf_levels=0)

    for name, lx in [("Leg_FL", -0.05), ("Leg_FR", 0.05)]:
        bm_l = bmesh.new()
        add_tube(bm_l, [(lx, 0.0, 0.21), (lx, 0.015, 0.10), (lx, 0.0, 0.01)], [0.014, 0.010, 0.009], segs=5)
        build_part(col, name, bm_l, mat_beak_yellow, pivot=(lx, 0.0, 0.21), subsurf_levels=0)
    return col


def build_animal_hen():
    """Pida Kozhi — Plump speckled brown village hen."""
    col = reset_collection("animal_hen")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.14, 0.18, 0.32, 0.075),
        (-0.02, 0.15, 0.33, 0.110),
        ( 0.09, 0.17, 0.33, 0.100),
        ( 0.17, 0.23, 0.34, 0.055),
    ], segs=10)
    build_part(col, "Body", bm, mat_hen_brown, subsurf_levels=1)

    pivot = (0.0, -0.10, 0.28)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.10, 0.28), (0, -0.15, 0.39), (0, -0.16, 0.41)], [0.044, 0.032, 0.030], segs=7)
    head_obj = build_part(col, "Head", bm_h, mat_hen_brown, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.026, -0.17, 0.41), (0.026, -0.17, 0.41)], 0.007)

    bm_bk = bmesh.new()
    add_tube(bm_bk, [(0, -0.19, 0.40), (0, -0.24, 0.39)], [0.012, 0.003], segs=5)
    beak = build_part(col, "Beak", bm_bk, mat_beak_yellow, pivot=pivot, subsurf_levels=0)
    beak.parent = head_obj
    beak.location = (0, 0, 0)

    bm_t = bmesh.new()
    add_ellipsoid(bm_t, (0, 0.16, 0.30), 0.05, 0.08, 0.05, segs=7, rings=5, rot=(0.45, 0, 0))
    build_part(col, "Tail", bm_t, mat_hen_brown, pivot=(0, 0.13, 0.28), subsurf_levels=0)

    for name, lx in [("Leg_FL", -0.048), ("Leg_FR", 0.048)]:
        bm_l = bmesh.new()
        add_tube(bm_l, [(lx, 0.0, 0.17), (lx, 0.0, 0.01)], [0.011, 0.008], segs=5)
        build_part(col, name, bm_l, mat_beak_yellow, pivot=(lx, 0.0, 0.17), subsurf_levels=0)
    return col


def build_animal_temple_elephant():
    """Aana — Majestic Asian Kerala Elephant with sloped back, domed head, ivory tusks & Nettipattam."""
    col = reset_collection("animal_temple_elephant")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-1.12, 1.15, 2.38, 0.56),
        (-0.62, 0.96, 2.58, 0.76),  # High arched Asian elephant shoulders/back
        ( 0.05, 0.98, 2.56, 0.80),  # Broad barrel belly
        ( 0.68, 1.10, 2.34, 0.70),  # Sloping rump
        ( 1.24, 1.32, 2.02, 0.42),  # Hindquarters
    ], segs=14)
    build_part(col, "Body", bm, mat_elephant_hide, subsurf_levels=1)

    pivot = (0.0, -1.04, 1.98)
    bm_h = bmesh.new()
    add_ellipsoid(bm_h, (0, -1.28, 2.12), 0.48, 0.52, 0.56, segs=12, rings=8)
    # Twin Asian elephant crown domes
    for sx in (-0.18, 0.18):
        add_ellipsoid(bm_h, (sx, -1.24, 2.56), 0.24, 0.26, 0.22, segs=8, rings=6)
    # Gracefully curved muscular trunk
    add_tube(bm_h, [(0, -1.66, 1.96), (0, -1.86, 1.46), (0, -1.80, 0.92), (0, -1.66, 0.56)], [0.19, 0.145, 0.105, 0.07], segs=9)
    # Scalloped Asian elephant ears
    for sx in (-1, 1):
        add_ellipsoid(bm_h, (sx * 0.56, -1.12, 2.08), 0.08, 0.36, 0.44, segs=9, rings=6, rot=(0.1, sx * 0.26, -sx * 0.24))
    head_obj = build_part(col, "Head", bm_h, mat_elephant_hide, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.42, -1.48, 2.18), (0.42, -1.48, 2.18)], 0.042)

    bm_tu = bmesh.new()
    for sx in (-1, 1):
        add_tube(bm_tu, [(sx * 0.20, -1.58, 1.78), (sx * 0.28, -1.96, 1.56), (sx * 0.26, -2.30, 1.76)], [0.064, 0.046, 0.014], segs=7)
    tusks = build_part(col, "Tusks", bm_tu, mat_ivory, pivot=pivot, subsurf_levels=0)
    tusks.parent = head_obj
    tusks.location = (0, 0, 0)

    bm_nt = bmesh.new()
    add_ellipsoid(bm_nt, (0, -1.72, 2.22), 0.30, 0.07, 0.42, segs=10, rings=7, rot=(-0.20, 0, 0))
    nett = build_part(col, "Nettipattam", bm_nt, mat_gold_orn, pivot=pivot, subsurf_levels=0)
    nett.parent = head_obj
    nett.location = (0, 0, 0)

    add_contoured_quadruped_legs(col, [
        ("Leg_FL", -0.44, -0.74, 1.24, 0.25, 0.22, 0.20, 0.0),
        ("Leg_FR",  0.44, -0.74, 1.24, 0.25, 0.22, 0.20, 0.0),
        ("Leg_BL", -0.44,  0.76, 1.24, 0.26, 0.22, 0.20, 0.04),
        ("Leg_BR",  0.44,  0.76, 1.24, 0.26, 0.22, 0.20, 0.04),
    ], mat_elephant_hide, mat_hoof)

    bm_t = bmesh.new()
    add_tube(bm_t, [(0, 1.24, 1.62), (0, 1.36, 1.15), (0, 1.34, 0.76)], [0.05, 0.032, 0.022], segs=6)
    build_part(col, "Tail", bm_t, mat_elephant_hide, pivot=(0, 1.24, 1.62), subsurf_levels=0)
    return col


# ------------------------------------------------------------------------------
# 4. WILD FOREST BIRDS & CRITTERS (3 Species — Forest Side Only)
# ------------------------------------------------------------------------------
def build_animal_peacock():
    col = reset_collection("animal_peacock")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.22, 0.38, 0.56, 0.10),
        ( 0.00, 0.34, 0.58, 0.145),
        ( 0.22, 0.38, 0.54, 0.11),
    ], segs=10)
    build_part(col, "Body", bm, mat_peacock_blue, subsurf_levels=1)

    pivot = (0.0, -0.18, 0.52)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.18, 0.52), (0, -0.25, 0.76), (0, -0.27, 0.94)], [0.06, 0.038, 0.036], segs=8)
    add_tube(bm_h, [(0, -0.31, 0.95), (0, -0.40, 0.93)], [0.015, 0.004], segs=5)
    for cx in (-0.02, 0.0, 0.02):
        add_tube(bm_h, [(cx, -0.27, 0.98), (cx * 1.8, -0.24, 1.07)], [0.005, 0.008], segs=4)
    head_obj = build_part(col, "Head", bm_h, mat_peacock_blue, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.03, -0.30, 0.96), (0.03, -0.30, 0.96)], 0.008)

    bm_t = bmesh.new()
    add_anatomical_loft(bm_t, [
        (0.20, 0.42, 0.49, 0.09),
        (0.62, 0.30, 0.38, 0.24),
        (1.15, 0.14, 0.20, 0.30),
        (1.38, 0.08, 0.12, 0.18),
    ], segs=10)
    build_part(col, "Tail", bm_t, mat_peacock_train, pivot=(0, 0.20, 0.46), subsurf_levels=1)

    for name, lx in [("Leg_FL", -0.06), ("Leg_FR", 0.06)]:
        bm_l = bmesh.new()
        add_tube(bm_l, [(lx, 0.0, 0.36), (lx, 0.0, 0.01)], [0.015, 0.010], segs=5)
        build_part(col, name, bm_l, mat_horn, pivot=(lx, 0.0, 0.36), subsurf_levels=0)
    return col


def build_animal_malabar_squirrel():
    col = reset_collection("animal_malabar_squirrel")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.16, 0.11, 0.21, 0.055),
        ( 0.00, 0.09, 0.24, 0.082),
        ( 0.16, 0.11, 0.22, 0.072),
    ], segs=10)
    build_part(col, "Body", bm, mat_squirrel_mar, subsurf_levels=1)

    pivot = (0.0, -0.14, 0.18)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.14, 0.18), (0, -0.22, 0.22), (0, -0.27, 0.20)], [0.052, 0.052, 0.025], segs=8)
    for sx in (-1, 1):
        add_ellipsoid(bm_h, (sx * 0.042, -0.19, 0.27), 0.016, 0.016, 0.028, segs=6, rings=4)
    head_obj = build_part(col, "Head", bm_h, mat_squirrel_mar, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.042, -0.23, 0.23), (0.042, -0.23, 0.23)], 0.009)

    bm_t = bmesh.new()
    add_tube(bm_t, [(0, 0.15, 0.18), (0, 0.34, 0.30), (0, 0.46, 0.24), (0, 0.58, 0.18)], [0.042, 0.065, 0.062, 0.028], segs=8)
    build_part(col, "Tail", bm_t, mat_squirrel_crm, pivot=(0, 0.15, 0.18), subsurf_levels=1)

    add_contoured_quadruped_legs(col, [
        ("Leg_FL", -0.05, -0.10, 0.12, 0.026, 0.018, 0.012, 0.0),
        ("Leg_FR",  0.05, -0.10, 0.12, 0.026, 0.018, 0.012, 0.0),
        ("Leg_BL", -0.055, 0.10, 0.13, 0.032, 0.020, 0.012, 0.02),
        ("Leg_BR",  0.055, 0.10, 0.13, 0.032, 0.020, 0.012, 0.02),
    ], mat_squirrel_mar, mat_hoof)
    return col


def build_animal_cattle_egret():
    col = reset_collection("animal_cattle_egret")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.16, 0.41, 0.54, 0.068),
        ( 0.00, 0.38, 0.55, 0.090),
        ( 0.17, 0.42, 0.52, 0.052),
    ], segs=10)
    build_part(col, "Body", bm, mat_egret_white, subsurf_levels=1)

    pivot = (0.0, -0.14, 0.52)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.14, 0.52), (0, -0.12, 0.68), (0, -0.18, 0.80)], [0.030, 0.022, 0.026], segs=7)
    head_obj = build_part(col, "Head", bm_h, mat_egret_white, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.022, -0.20, 0.82), (0.022, -0.20, 0.82)], 0.006)

    bm_bk = bmesh.new()
    add_tube(bm_bk, [(0, -0.21, 0.81), (0, -0.35, 0.79)], [0.011, 0.002], segs=5)
    beak = build_part(col, "Beak", bm_bk, mat_beak_yellow, pivot=pivot, subsurf_levels=0)
    beak.parent = head_obj
    beak.location = (0, 0, 0)

    for name, sx in [("Wing_L", -1), ("Wing_R", 1)]:
        bm_w = bmesh.new()
        add_ellipsoid(bm_w, (sx * 0.11, 0.03, 0.47), 0.045, 0.18, 0.085, segs=8, rings=6, rot=(0, 0, sx * 0.1))
        build_part(col, name, bm_w, mat_egret_white, pivot=(sx * 0.08, -0.02, 0.49), subsurf_levels=1)

    for name, lx in [("Leg_FL", -0.042), ("Leg_FR", 0.042)]:
        bm_l = bmesh.new()
        add_tube(bm_l, [(lx, 0.0, 0.39), (lx, 0.02, 0.20), (lx, 0.0, 0.01)], [0.010, 0.007, 0.007], segs=5)
        build_part(col, name, bm_l, mat_horn, pivot=(lx, 0.0, 0.39), subsurf_levels=0)
    return col


# ------------------------------------------------------------------------------
# 5. WATER CREATURES (Hydrofoil-Lofted Real Fish, Turtle, Frog & Duck)
# ------------------------------------------------------------------------------
def build_water_karimeen_fish():
    """Karimeen (Kerala Pearl Spot) — Deep hydrofoil-lofted fish with real V-forked tail & fins."""
    col = reset_collection("water_karimeen_fish")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.20, -0.018,  0.018, 0.014),  # Mouth
        (-0.12, -0.068,  0.072, 0.038),  # Gill cover
        (-0.02, -0.098,  0.105, 0.048),  # Deep pearl-spot body
        ( 0.09, -0.072,  0.078, 0.034),  # Tapering rear
        ( 0.17, -0.026,  0.028, 0.014),  # Caudal peduncle
    ], segs=12)
    # Swept dorsal & anal fins
    add_anatomical_loft(bm, [
        (-0.08, 0.08, 0.13, 0.005),
        ( 0.04, 0.07, 0.15, 0.005),
        ( 0.13, 0.04, 0.10, 0.004),
    ], segs=6)
    add_anatomical_loft(bm, [
        (-0.02, -0.12, -0.08, 0.005),
        ( 0.09, -0.13, -0.06, 0.005),
        ( 0.14, -0.08, -0.03, 0.004),
    ], segs=6)
    body_obj = build_part(col, "Body", bm, mat_karimeen, subsurf_levels=1)
    add_eyes_to_head(col, body_obj, (0, 0, 0), [(-0.032, -0.14, 0.024), (0.032, -0.14, 0.024)], 0.012)

    # Real forked caudal tail fin (upper & lower lobes)
    bm_tf = bmesh.new()
    add_tube(bm_tf, [(0, 0.17, 0.0), (0, 0.25, 0.055), (0, 0.29, 0.082)], [0.012, 0.008, 0.004], segs=5)
    add_tube(bm_tf, [(0, 0.17, 0.0), (0, 0.25, -0.055), (0, 0.29, -0.082)], [0.012, 0.008, 0.004], segs=5)
    add_anatomical_loft(bm_tf, [(0.17, -0.025, 0.025, 0.008), (0.26, -0.075, 0.075, 0.005)], segs=6)
    build_part(col, "TailFin", bm_tf, mat_fin, pivot=(0, 0.17, 0.0), subsurf_levels=0)
    return col


def build_water_rohu_carp():
    """Koora / Rohu River Carp — Streamlined silver hydrofoil river fish."""
    col = reset_collection("water_rohu_carp")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.24, -0.016,  0.018, 0.016),
        (-0.14, -0.058,  0.062, 0.046),
        ( 0.00, -0.068,  0.074, 0.054),
        ( 0.12, -0.048,  0.052, 0.034),
        ( 0.21, -0.020,  0.022, 0.013),
    ], segs=12)
    add_anatomical_loft(bm, [
        (-0.04, 0.06, 0.13, 0.005),
        ( 0.05, 0.05, 0.11, 0.004),
    ], segs=6)
    body_obj = build_part(col, "Body", bm, mat_rohu, subsurf_levels=1)
    add_eyes_to_head(col, body_obj, (0, 0, 0), [(-0.036, -0.18, 0.020), (0.036, -0.18, 0.020)], 0.011)

    bm_tf = bmesh.new()
    add_anatomical_loft(bm_tf, [(0.21, -0.02, 0.02, 0.008), (0.31, -0.075, 0.075, 0.004)], segs=6)
    build_part(col, "TailFin", bm_tf, mat_fin, pivot=(0, 0.21, 0.0), subsurf_levels=0)
    return col


def build_water_freshwater_turtle():
    col = reset_collection("water_freshwater_turtle")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.18, 0.03, 0.08, 0.11),
        ( 0.00, 0.02, 0.15, 0.165),
        ( 0.18, 0.03, 0.09, 0.12),
    ], segs=12)
    build_part(col, "Body", bm, mat_turtle_shell, subsurf_levels=1)

    pivot = (0, -0.16, 0.07)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.16, 0.07), (0, -0.26, 0.10), (0, -0.30, 0.10)], [0.036, 0.030, 0.024], segs=7)
    head_obj = build_part(col, "Head", bm_h, mat_turtle_skin, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.024, -0.27, 0.115), (0.024, -0.27, 0.115)], 0.007)

    for name, (lx, ly) in [("Leg_FL", (-0.14, -0.10)), ("Leg_FR", (0.14, -0.10)), ("Leg_BL", (-0.13, 0.12)), ("Leg_BR", (0.13, 0.12))]:
        bm_l = bmesh.new()
        add_ellipsoid(bm_l, (lx + (0.05 if lx > 0 else -0.05), ly, 0.04), 0.062, 0.036, 0.018, segs=7, rings=5)
        build_part(col, name, bm_l, mat_turtle_skin, pivot=(lx, ly, 0.05), subsurf_levels=0)
    return col


def build_water_paddy_frog():
    col = reset_collection("water_paddy_frog")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.085, 0.04, 0.085, 0.038),
        ( 0.000, 0.02, 0.095, 0.062),
        ( 0.085, 0.02, 0.065, 0.048),
    ], segs=10)
    body_obj = build_part(col, "Body", bm, mat_frog_green, subsurf_levels=1)
    add_eyes_to_head(col, body_obj, (0, 0, 0), [(-0.032, -0.062, 0.092), (0.032, -0.062, 0.092)], 0.012)

    for name, sx in [("Leg_BL", -1), ("Leg_BR", 1)]:
        bm_l = bmesh.new()
        add_tube(bm_l, [(sx * 0.045, 0.03, 0.045), (sx * 0.085, 0.06, 0.065), (sx * 0.065, 0.02, 0.015)], [0.024, 0.020, 0.014], segs=6)
        build_part(col, name, bm_l, mat_frog_green, pivot=(sx * 0.045, 0.03, 0.045), subsurf_levels=0)
    return col


def build_water_kuttanadan_duck():
    col = reset_collection("water_kuttanadan_duck")
    bm = bmesh.new()
    add_anatomical_loft(bm, [
        (-0.20, 0.08, 0.22, 0.095),
        (-0.02, 0.04, 0.24, 0.135),
        ( 0.16, 0.09, 0.24, 0.095),
        ( 0.26, 0.17, 0.24, 0.045),
    ], segs=10)
    build_part(col, "Body", bm, mat_duck_plumage, subsurf_levels=1)

    pivot = (0, -0.17, 0.20)
    bm_h = bmesh.new()
    add_tube(bm_h, [(0, -0.17, 0.20), (0, -0.21, 0.34), (0, -0.22, 0.37)], [0.050, 0.040, 0.046], segs=8)
    head_obj = build_part(col, "Head", bm_h, mat_duck_head, pivot=pivot, subsurf_levels=1)
    add_eyes_to_head(col, head_obj, pivot, [(-0.038, -0.24, 0.38), (0.038, -0.24, 0.38)], 0.008)

    bm_bk = bmesh.new()
    add_ellipsoid(bm_bk, (0, -0.29, 0.36), 0.032, 0.055, 0.016, segs=7, rings=5)
    bill = build_part(col, "Bill", bm_bk, mat_beak_yellow, pivot=pivot, subsurf_levels=0)
    bill.parent = head_obj
    bill.location = (0, 0, 0)

    for name, sx in [("Wing_L", -1), ("Wing_R", 1)]:
        bm_w = bmesh.new()
        add_ellipsoid(bm_w, (sx * 0.12, 0.02, 0.16), 0.035, 0.16, 0.075, segs=7, rings=5)
        build_part(col, name, bm_w, mat_duck_plumage, pivot=(sx * 0.10, -0.02, 0.17), subsurf_levels=1)
    return col


# ------------------------------------------------------------------------------
# 6. Build & Export All 15 Realistic Kerala Animals & Water Creatures
# ------------------------------------------------------------------------------
BUILDERS = [
    (build_animal_kerala_cow,        (-12.0,  0.0)),
    (build_animal_water_buffalo,     ( -8.0,  0.0)),
    (build_animal_malabari_goat,     ( -4.0,  0.0)),
    (build_animal_village_dog,       ( -1.0,  0.0)),
    (build_animal_rooster,           (  2.0,  0.0)),
    (build_animal_hen,               (  4.5,  0.0)),
    (build_animal_temple_elephant,   (  9.0,  0.0)),
    (build_animal_peacock,           ( -6.0, -5.0)),
    (build_animal_malabar_squirrel,  ( -2.0, -5.0)),
    (build_animal_cattle_egret,      (  2.0, -5.0)),
    (build_water_karimeen_fish,      ( -6.0, -9.0)),
    (build_water_rohu_carp,          ( -3.0, -9.0)),
    (build_water_freshwater_turtle,  (  0.0, -9.0)),
    (build_water_paddy_frog,         (  3.0, -9.0)),
    (build_water_kuttanadan_duck,    (  6.0, -9.0)),
]

if AUTO_EXPORT:
    os.makedirs(EXPORT_DIR, exist_ok=True)

for builder_fn, (preview_x, preview_y) in BUILDERS:
    col = builder_fn()
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
        if obj.parent is None:
            obj.location.x += preview_x
            obj.location.y += preview_y

bpy.ops.object.select_all(action="DESELECT")
print(f"Done! All {len(BUILDERS)} realistic anatomical Kerala animals & fish exported to {EXPORT_DIR}.")
