import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Euler, Matrix

# ==============================================================================
# KALIYUGHAM (18th-Century Rural Kerala) — Complete Flora & Cultivation Generator
# ==============================================================================
# Generates 22 detailed, game-ready, historically authentic rural Kerala botanical
# assets with procedural PBR materials (and optional Cycles texture baking) and
# exports them as GLB to:
#   /Users/vishnuk/Documents/project/game/public/models/flora/*.glb
#
# Categories included:
#   - 9 Trees: Coconut Palm, Arecanut Palm, Jackfruit, Mango, Banyan, Tamarind,
#              Teak Timber, Pepper-Vine Support Tree, Giant Bamboo Grove
#   - 5 Bushes: Red Hibiscus (Chembarathi), Ixora (Thechi), Sacred Tulsi,
#               Tropical Sword Fern (Pannal), Wild Roadside Scrub (Kongini)
#   - 2 Grasses: Lush Monsoon Meadow Grass, Tall Roadside Reed/Seed Grass
#   - 2 Paddy Clumps: Young Green Paddy (Pacha Nellu), Mature Golden Paddy (Nelkathir)
#   - 4 Cultivations: Plantain/Banana (Vazha), Tapioca (Kappa), Taro/Yam (Chembu),
#                     Homestead Spice & Vegetable Bed (Turmeric, Brinjal, Kanthari Chili)
# ==============================================================================

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/flora"
TEX_DIR = "/Users/vishnuk/Documents/project/game/scripts/baked_textures/flora"

# Set AUTO_BAKE = True to bake 1K Cycles Albedo/Roughness/Normal maps per asset.
# (False exports crisp vertex/material-colored PBR GLBs in ~10 seconds; True takes ~2-3 mins.)
AUTO_BAKE = False
AUTO_EXPORT = True
BAKE_RES = 1024
BAKE_SAMPLES = 16

rng = random.Random(1789)

# ------------------------------------------------------------------------------
# 1. Material Library (Rich Tropical Kerala Botanical PBR)
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
    out.location = (700, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (380, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat, nodes, links, bsdf


def _make_packed_botanical_texture(name, col_dark, col_light, stretch_z=1.0, seed=17):
    """Generates a fast, packed 128x128 organic bark/leaf/grain PNG texture for direct glTF export."""
    img_name = f"Tex_{name}"
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    res = 128
    img = bpy.data.images.new(img_name, width=res, height=res, alpha=False)
    r = random.Random(seed)
    # Build a small 16x16 tileable value grid for smooth organic mottling + directional grain
    g = 16
    grid = [[r.random() for _ in range(g)] for _ in range(g)]
    pixels = [0.0] * (res * res * 4)
    vein_freq = 6.0 if stretch_z <= 1.2 else 14.0
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

            n00 = grid[y0][x0]
            n10 = grid[y0][x1]
            n01 = grid[y1][x0]
            n11 = grid[y1][x1]
            val = (n00 * (1.0 - fx) + n10 * fx) * (1.0 - fy) + (n01 * (1.0 - fx) + n11 * fx) * fy
            # Add fine leaf veins or vertical bark striations
            if stretch_z > 1.5:
                streak = 0.5 + 0.5 * math.sin((u * vein_freq + val * 1.4) * math.pi * 2.0)
                t = 0.62 * val + 0.38 * streak
            else:
                vein = 0.5 + 0.5 * math.sin(((u - 0.5) * vein_freq + v * 3.0 + val * 0.8) * math.pi * 2.0)
                t = 0.72 * val + 0.28 * vein
            t = max(0.0, min(1.0, t))
            idx = (y * res + x) * 4
            pixels[idx]     = col_dark[0] + (col_light[0] - col_dark[0]) * t
            pixels[idx + 1] = col_dark[1] + (col_light[1] - col_dark[1]) * t
            pixels[idx + 2] = col_dark[2] + (col_light[2] - col_dark[2]) * t
            pixels[idx + 3] = 1.0
    img.pixels.foreach_set(pixels)
    img.pack()
    return img


_MAT_SEED = 100


def make_botanical_mat(
    name,
    col_dark,
    col_light,
    roughness=0.62,
    scale=9.0,
    bump_str=0.22,
    subsurf=0.0,
    stretch_z=1.0,
):
    global _MAT_SEED
    _MAT_SEED += 17
    mat, nodes, links, bsdf = clear_material(name)
    mat.use_backface_culling = False

    # Direct packed Image Texture -> Base Color so glTF ALWAYS exports full color & organic grain!
    tex_img = _make_packed_botanical_texture(name, col_dark, col_light, stretch_z=stretch_z, seed=_MAT_SEED)
    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = tex_img
    tex_node.location = (0, 120)
    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = roughness
    if subsurf > 0.0 and "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = subsurf

    if bump_str > 0.0:
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_str
        bump.location = (180, -120)
        links.new(tex_node.outputs["Color"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


# Bark & Stems
mat_palm_bark    = make_botanical_mat("Flora_PalmBark",    (0.16, 0.12, 0.09), (0.32, 0.26, 0.19), 0.90, 10.0, 0.42, 0.0, 3.5)
mat_areca_bark   = make_botanical_mat("Flora_ArecaBark",   (0.18, 0.21, 0.13), (0.34, 0.36, 0.24), 0.82, 12.0, 0.30, 0.0, 4.0)
mat_dark_bark    = make_botanical_mat("Flora_DarkBark",    (0.10, 0.07, 0.045), (0.22, 0.15, 0.10), 0.92, 8.0, 0.48, 0.0, 2.5)
mat_banyan_bark  = make_botanical_mat("Flora_BanyanBark",  (0.18, 0.15, 0.11), (0.34, 0.29, 0.22), 0.90, 9.0, 0.44, 0.0, 2.0)
mat_bamboo_culm  = make_botanical_mat("Flora_BambooCulm",  (0.16, 0.28, 0.08), (0.36, 0.44, 0.14), 0.56, 7.0, 0.14, 0.0, 0.6)
mat_banana_stem  = make_botanical_mat("Flora_BananaStem",  (0.14, 0.26, 0.07), (0.32, 0.38, 0.14), 0.62, 10.0, 0.20, 0.0, 2.0)
mat_woody_stem   = make_botanical_mat("Flora_WoodyStem",   (0.18, 0.13, 0.08), (0.32, 0.24, 0.15), 0.85, 11.0, 0.25, 0.0, 2.0)

# Foliage Greens
mat_palm_frond   = make_botanical_mat("Flora_PalmFrond",   (0.06, 0.22, 0.04), (0.16, 0.36, 0.07), 0.54, 12.0, 0.16, 0.12)
mat_leaf_deep    = make_botanical_mat("Flora_LeafDeep",    (0.04, 0.16, 0.035), (0.11, 0.28, 0.06), 0.48, 10.0, 0.14, 0.10)
mat_leaf_lush    = make_botanical_mat("Flora_LeafLush",    (0.07, 0.24, 0.045), (0.18, 0.40, 0.08), 0.50, 10.0, 0.14, 0.14)
mat_leaf_bronze  = make_botanical_mat("Flora_LeafBronze",  (0.24, 0.16, 0.05), (0.38, 0.26, 0.08), 0.52, 12.0, 0.12, 0.10)
mat_leaf_tamarind= make_botanical_mat("Flora_LeafTamarind",(0.09, 0.26, 0.06), (0.20, 0.40, 0.10), 0.58, 16.0, 0.12, 0.12)
mat_leaf_teak    = make_botanical_mat("Flora_LeafTeak",    (0.07, 0.20, 0.04), (0.17, 0.31, 0.07), 0.68, 9.0, 0.26, 0.08)
mat_leaf_tulsi   = make_botanical_mat("Flora_LeafTulsi",   (0.09, 0.22, 0.08), (0.18, 0.30, 0.12), 0.64, 14.0, 0.15, 0.10)
mat_banana_leaf  = make_botanical_mat("Flora_BananaLeaf",  (0.07, 0.27, 0.045), (0.17, 0.42, 0.08), 0.42, 12.0, 0.14, 0.18)
mat_taro_leaf    = make_botanical_mat("Flora_TaroLeaf",    (0.05, 0.22, 0.05), (0.13, 0.35, 0.09), 0.46, 10.0, 0.16, 0.14)
mat_grass_green  = make_botanical_mat("Flora_GrassGreen",  (0.08, 0.26, 0.04), (0.22, 0.44, 0.08), 0.66, 14.0, 0.10, 0.12)
mat_grass_dry    = make_botanical_mat("Flora_GrassDry",    (0.24, 0.28, 0.08), (0.48, 0.42, 0.14), 0.78, 12.0, 0.12, 0.05)
mat_paddy_green  = make_botanical_mat("Flora_PaddyGreen",  (0.10, 0.34, 0.05), (0.26, 0.52, 0.09), 0.58, 14.0, 0.10, 0.14)
mat_paddy_gold   = make_botanical_mat("Flora_PaddyGold",   (0.42, 0.34, 0.07), (0.76, 0.58, 0.14), 0.68, 18.0, 0.18, 0.06)

# Fruits, Flowers, Spices & Soil
mat_coconut_g    = make_botanical_mat("Flora_CoconutG",    (0.14, 0.34, 0.06), (0.28, 0.46, 0.10), 0.48, 9.0, 0.12)
mat_areca_nut    = make_botanical_mat("Flora_ArecaNut",    (0.56, 0.28, 0.04), (0.78, 0.46, 0.08), 0.46, 12.0, 0.10)
mat_jackfruit    = make_botanical_mat("Flora_Jackfruit",   (0.16, 0.28, 0.05), (0.34, 0.42, 0.09), 0.72, 26.0, 0.55)
mat_mango        = make_botanical_mat("Flora_Mango",       (0.72, 0.26, 0.03), (0.90, 0.62, 0.08), 0.38, 8.0, 0.06)
mat_tamarind_pod = make_botanical_mat("Flora_TamarindPod", (0.24, 0.14, 0.06), (0.38, 0.24, 0.11), 0.80, 14.0, 0.22)
mat_pepper_berry = make_botanical_mat("Flora_PepperBerry", (0.12, 0.26, 0.04), (0.48, 0.14, 0.04), 0.52, 20.0, 0.24)
mat_banana_fruit = make_botanical_mat("Flora_BananaFruit", (0.36, 0.46, 0.08), (0.76, 0.62, 0.12), 0.48, 10.0, 0.08)
mat_banana_flower= make_botanical_mat("Flora_BananaFlower",(0.28, 0.04, 0.07), (0.44, 0.08, 0.12), 0.52, 10.0, 0.14)
mat_flower_red   = make_botanical_mat("Flora_FlowerRed",   (0.68, 0.04, 0.05), (0.92, 0.12, 0.08), 0.45, 10.0, 0.08, 0.15)
mat_flower_ixora = make_botanical_mat("Flora_FlowerIxora", (0.78, 0.12, 0.03), (0.96, 0.28, 0.05), 0.48, 14.0, 0.10, 0.12)
mat_flower_yellow= make_botanical_mat("Flora_FlowerYellow",(0.76, 0.54, 0.04), (0.96, 0.76, 0.12), 0.46, 12.0, 0.08, 0.12)
mat_tulsi_spike  = make_botanical_mat("Flora_TulsiSpike",  (0.24, 0.12, 0.20), (0.38, 0.22, 0.30), 0.65, 16.0, 0.18)
mat_brinjal      = make_botanical_mat("Flora_Brinjal",     (0.14, 0.03, 0.18), (0.28, 0.06, 0.34), 0.28, 8.0, 0.06)
mat_chili_red    = make_botanical_mat("Flora_ChiliRed",    (0.66, 0.05, 0.03), (0.88, 0.12, 0.05), 0.34, 10.0, 0.06)
mat_soil_mound   = make_botanical_mat("Flora_SoilMound",   (0.20, 0.10, 0.05), (0.34, 0.18, 0.09), 0.96, 14.0, 0.45)

# ------------------------------------------------------------------------------
# 2. Collection & Organic BMesh Geometry Helpers
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


def link_mesh(col, name, bm, mat, smooth=True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Assign fast tri-planar box UVs right in bmesh so packed textures export cleanly to glTF
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * 1.4, co.y * 1.4)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * 1.4, co.z * 1.4)
            else:
                loop[uv_layer].uv = (co.x * 1.4, co.z * 1.4)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    col.objects.link(obj)
    return obj


def add_curved_tube(bm, points, radii, segs=8, ring_ridge=0.0, cap_ends=True):
    """Sweeps a tapered organic tube along a list of 3D Vector points with optional palm rings."""
    rings = []
    n_pts = len(points)
    prev_x = Vector((1, 0, 0))
    for i, pt in enumerate(points):
        if i == 0:
            tangent = (points[1] - points[0]).normalized()
        elif i == n_pts - 1:
            tangent = (points[-1] - points[-2]).normalized()
        else:
            tangent = (points[i + 1] - points[i - 1]).normalized()
        if tangent.length < 1e-6:
            tangent = Vector((0, 0, 1))

        # Parallel transport frame to prevent twisting
        x_axis = prev_x - tangent * prev_x.dot(tangent)
        if x_axis.length < 1e-4:
            ref = Vector((0, 1, 0)) if abs(tangent.x) > 0.8 else Vector((1, 0, 0))
            x_axis = tangent.cross(ref)
        x_axis.normalize()
        y_axis = tangent.cross(x_axis).normalized()
        prev_x = x_axis

        r = radii[i]
        if ring_ridge > 0.0 and i % 2 == 1:
            r *= 1.0 + ring_ridge

        ring = []
        for s in range(segs):
            ang = (s / segs) * math.pi * 2.0
            offset = (x_axis * math.cos(ang) + y_axis * math.sin(ang)) * r
            ring.append(bm.verts.new(pt + offset))
        rings.append(ring)

    for i in range(n_pts - 1):
        r0 = rings[i]
        r1 = rings[i + 1]
        for s in range(segs):
            s_next = (s + 1) % segs
            bm.faces.new((r0[s], r0[s_next], r1[s_next], r1[s]))

    if cap_ends and len(rings) >= 2:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def add_blade_quad_strip(bm, origin, direction, length, width_base, droop=0.35, segs=5, twist=0.0):
    """Creates a realistic curved, tapering leaf/grass/frond blade."""
    fwd = direction.normalized()
    up = Vector((0, 0, 1))
    side = fwd.cross(up)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    else:
        side.normalize()
    up_local = side.cross(fwd).normalized()

    rows = []
    for i in range(segs + 1):
        t = i / segs
        center = (
            origin
            + fwd * (length * t)
            + up_local * (length * (0.28 * t - droop * t * t))
        )
        # Taper smoothly to pointed tip
        w = width_base * math.sin(max(0.05, (1.0 - t) * math.pi * 0.85))
        if i == segs:
            v_tip = bm.verts.new(center)
            rows.append([v_tip])
        else:
            rot_side = (
                side * math.cos(twist * t) + up_local * math.sin(twist * t)
            ).normalized()
            vl = bm.verts.new(center - rot_side * (w * 0.5))
            vr = bm.verts.new(center + rot_side * (w * 0.5))
            rows.append([vl, vr])

    for i in range(segs):
        if len(rows[i + 1]) == 2:
            bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]))
        else:
            bm.faces.new((rows[i][0], rows[i][1], rows[i + 1][0]))


def add_pinnate_palm_frond(bm_stem, bm_leaf, base_pos, yaw, pitch, length, leaflet_pairs=16, droop=0.58):
    """Builds a realistic arching coconut/areca palm frond with central rachis and V-angled leaflets."""
    segs = 8
    pts = []
    rads = []
    dir_xy = Vector((math.cos(yaw), math.sin(yaw), 0.0))
    side_xy = Vector((-math.sin(yaw), math.cos(yaw), 0.0))

    for i in range(segs + 1):
        t = i / segs
        horiz = length * t
        vert = length * (math.sin(pitch) * t - droop * t * t)
        pts.append(base_pos + dir_xy * horiz + Vector((0, 0, vert)))
        rads.append(max(0.008, 0.036 * (1.0 - 0.82 * t)))

    add_curved_tube(bm_stem, pts, rads, segs=5, cap_ends=True)

    # Individual angled leaflets along both sides of the rachis
    for p in range(2, leaflet_pairs + 1):
        t = p / (leaflet_pairs + 0.5)
        idx_f = t * segs
        i0 = min(segs - 1, int(idx_f))
        frac = idx_f - i0
        pos = pts[i0].lerp(pts[i0 + 1], frac)
        tan = (pts[i0 + 1] - pts[i0]).normalized()

        # Leaflets longest in the middle of the frond, shorter near base and tip
        lf_len = length * (0.28 * math.sin(t * math.pi) + 0.06)
        lf_w = max(0.028, lf_len * 0.14)

        for sign in (-1.0, 1.0):
            lf_dir = (side_xy * sign * 0.82 + tan * 0.42 + Vector((0, 0, -0.22))).normalized()
            add_blade_quad_strip(bm_leaf, pos, lf_dir, lf_len, lf_w, droop=0.52, segs=3)


def add_foliage_cluster(bm, center, radius, leaf_count=18, leaf_len=0.38, leaf_w=0.22, local_rng=None):
    """Scatters overlapping angled 3D leaf cards in a natural botanical spray (no blobby spheres)."""
    r = local_rng or rng
    for _ in range(leaf_count):
        theta = r.uniform(0.0, math.pi * 2.0)
        phi = r.uniform(-0.35, 1.15)
        rad = radius * (0.25 + 0.75 * r.random())
        dir_v = Vector((
            math.cos(theta) * math.cos(phi),
            math.sin(theta) * math.cos(phi),
            math.sin(phi),
        )).normalized()
        origin = center + dir_v * (rad * 0.55)
        add_blade_quad_strip(
            bm,
            origin,
            dir_v,
            leaf_len * r.uniform(0.75, 1.25),
            leaf_w * r.uniform(0.8, 1.2),
            droop=r.uniform(0.18, 0.45),
            segs=2,
            twist=r.uniform(-0.35, 0.35),
        )


def add_ellipsoid(bm, center, rx, ry, rz, segs=10, rings=7, rot_euler=(0, 0, 0)):
    """Adds a smooth oriented ellipsoid (fruit, coconut, pod, flower center) into a BMesh."""
    mat = Matrix.Translation(center) @ Euler(rot_euler, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((rx, ry, rz, 1.0))
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0, matrix=mat)


# ------------------------------------------------------------------------------
# 3. TREE BUILDERS (9 Authentic Rural Kerala Tree Species)
# ------------------------------------------------------------------------------
def build_tree_coconut_palm():
    col = reset_collection("tree_coconut_palm")
    r = random.Random(101)
    bm_trunk = bmesh.new()
    bm_frond = bmesh.new()
    bm_nut = bmesh.new()

    # Gracefully curving ringed coconut trunk (9.2m tall)
    lean_x = 1.15
    lean_y = 0.42
    pts, rads = [], []
    steps = 22
    for i in range(steps + 1):
        t = i / steps
        z = t * 9.2
        curve = math.sin(t * math.pi * 0.75) * 0.85 + t * t * 0.35
        x = lean_x * curve
        y = lean_y * curve
        pts.append(Vector((x, y, z)))
        base_flare = 0.24 * math.exp(-t * 9.0)
        rads.append(0.17 * (1.0 - 0.35 * t) + base_flare)

    add_curved_tube(bm_trunk, pts, rads, segs=10, ring_ridge=0.09)
    crown = pts[-1]

    # 16 arching pinnate fronds in 3 natural tiers (lower drooping, mid, upper rising)
    tiers = [
        (6, -0.05, 3.25, 0.78),
        (6,  0.32, 3.05, 0.62),
        (4,  0.76, 2.45, 0.44),
    ]
    for tier_idx, (count, pitch, length, droop) in enumerate(tiers):
        for k in range(count):
            yaw = (k / count) * math.pi * 2.0 + tier_idx * 0.55 + r.uniform(-0.12, 0.12)
            add_pinnate_palm_frond(
                bm_trunk, bm_frond,
                crown + Vector((0, 0, -0.15 + tier_idx * 0.12)),
                yaw, pitch + r.uniform(-0.08, 0.08),
                length * r.uniform(0.92, 1.08),
                leaflet_pairs=15, droop=droop,
            )

    # Clusters of green Kerala coconuts nestled under the crown
    for c in range(11):
        ang = (c / 11.0) * math.pi * 2.0 + r.uniform(-0.15, 0.15)
        dist = 0.22 + (c % 2) * 0.11
        cz = crown.z - 0.32 - (c % 3) * 0.11
        add_ellipsoid(
            bm_nut,
            Vector((crown.x + math.cos(ang) * dist, crown.y + math.sin(ang) * dist, cz)),
            0.12, 0.12, 0.15, segs=8, rings=6,
            rot_euler=(r.uniform(-0.3, 0.3), r.uniform(-0.3, 0.3), ang),
        )

    link_mesh(col, "Coconut_Trunk", bm_trunk, mat_palm_bark)
    link_mesh(col, "Coconut_Fronds", bm_frond, mat_palm_frond)
    link_mesh(col, "Coconut_Cluster", bm_nut, mat_coconut_g)
    return col


def build_tree_arecanut_palm():
    col = reset_collection("tree_arecanut_palm")
    r = random.Random(102)
    bm_trunk = bmesh.new()
    bm_crown = bmesh.new()
    bm_frond = bmesh.new()
    bm_nut = bmesh.new()

    # Tall ultra-slender ringed betel-nut palm (10.2m tall)
    pts, rads = [], []
    for i in range(20):
        t = i / 19.0
        pts.append(Vector((math.sin(t * 2.1) * 0.22, math.cos(t * 1.4) * 0.12, t * 9.4)))
        rads.append(0.11 * (1.0 - 0.35 * t) + 0.07 * math.exp(-t * 10.0))
    add_curved_tube(bm_trunk, pts, rads, segs=8, ring_ridge=0.07)

    # Green glossy crownshaft (paala) at top
    top = pts[-1]
    add_curved_tube(bm_crown, [top, top + Vector((0, 0, 0.85))], [0.095, 0.08], segs=8)
    frond_base = top + Vector((0, 0, 0.82))

    # 9 compact feathery arching fronds
    for k in range(9):
        yaw = (k / 9.0) * math.pi * 2.0 + r.uniform(-0.1, 0.1)
        pitch = 0.25 + (k % 3) * 0.25
        add_pinnate_palm_frond(
            bm_crown, bm_frond, frond_base, yaw, pitch,
            1.75 + r.uniform(-0.15, 0.2), leaflet_pairs=11, droop=0.66,
        )

    # Hanging orange-gold areca nut (adakka) clusters below crownshaft
    for k in range(14):
        ang = (k / 14.0) * math.pi * 2.0
        add_ellipsoid(
            bm_nut,
            top + Vector((math.cos(ang) * 0.16, math.sin(ang) * 0.16, -0.10 - (k % 3) * 0.08)),
            0.045, 0.045, 0.06, segs=6, rings=5,
        )

    link_mesh(col, "Areca_Trunk", bm_trunk, mat_areca_bark)
    link_mesh(col, "Areca_Crownshaft", bm_crown, mat_leaf_lush)
    link_mesh(col, "Areca_Fronds", bm_frond, mat_palm_frond)
    link_mesh(col, "Areca_Nuts", bm_nut, mat_areca_nut)
    return col


def build_tree_jackfruit():
    col = reset_collection("tree_jackfruit")
    r = random.Random(103)
    bm_wood = bmesh.new()
    bm_leaf = bmesh.new()
    bm_fruit = bmesh.new()

    # Sturdy fluted trunk with root buttresses
    trunk_pts = [Vector((0, 0, 0)), Vector((0.08, -0.05, 1.2)), Vector((-0.05, 0.06, 2.5)), Vector((0.02, 0.02, 3.6))]
    add_curved_tube(bm_wood, trunk_pts, [0.46, 0.34, 0.30, 0.24], segs=10)

    # 4 buttress roots gripping the soil
    for b in range(4):
        ang = b * math.pi * 0.5 + 0.3
        add_curved_tube(
            bm_wood,
            [Vector((math.cos(ang) * 0.18, math.sin(ang) * 0.18, 0.95)),
             Vector((math.cos(ang) * 0.45, math.sin(ang) * 0.45, 0.35)),
             Vector((math.cos(ang) * 0.78, math.sin(ang) * 0.78, -0.05))],
            [0.14, 0.11, 0.05], segs=6,
        )

    # 7 heavy spreading boughs + dense glossy dark-green canopy clusters
    for b in range(7):
        ang = (b / 7.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        h0 = 2.6 + (b % 3) * 0.45
        reach = 2.1 + r.uniform(0.2, 0.9)
        top_z = 4.6 + r.uniform(0.3, 1.3)
        p0 = Vector((0, 0, h0))
        p1 = Vector((math.cos(ang) * reach * 0.55, math.sin(ang) * reach * 0.55, (h0 + top_z) * 0.52))
        p2 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, top_z))
        add_curved_tube(bm_wood, [p0, p1, p2], [0.16, 0.11, 0.05], segs=7)

        # Sub-branches & lush leaf sprays
        add_foliage_cluster(bm_leaf, p2, 1.35, leaf_count=34, leaf_len=0.42, leaf_w=0.25, local_rng=r)
        add_foliage_cluster(bm_leaf, p1 + Vector((0, 0, 0.65)), 1.05, leaf_count=22, leaf_len=0.38, leaf_w=0.22, local_rng=r)

    # Crown cap foliage
    add_foliage_cluster(bm_leaf, Vector((0, 0, 6.2)), 1.65, leaf_count=40, leaf_len=0.44, leaf_w=0.26, local_rng=r)

    # Signature cauliflorous Jackfruits (Chakka) hanging directly from trunk & lower limbs!
    jack_spots = [
        Vector((0.36, 0.10, 1.95)),
        Vector((-0.32, 0.22, 2.35)),
        Vector((0.12, -0.35, 2.75)),
        Vector((0.68, 0.42, 3.10)),
        Vector((-0.58, -0.45, 3.25)),
    ]
    for jp in jack_spots:
        add_ellipsoid(bm_fruit, jp, 0.18, 0.17, 0.28, segs=10, rings=7, rot_euler=(0.12, -0.1, r.uniform(0, 3)))

    link_mesh(col, "Jackfruit_Wood", bm_wood, mat_dark_bark)
    link_mesh(col, "Jackfruit_Canopy", bm_leaf, mat_leaf_deep)
    link_mesh(col, "Jackfruit_Fruits", bm_fruit, mat_jackfruit)
    return col


def build_tree_mango():
    col = reset_collection("tree_mango")
    r = random.Random(104)
    bm_wood = bmesh.new()
    bm_leaf = bmesh.new()
    bm_shoot = bmesh.new()
    bm_mango = bmesh.new()

    trunk_pts = [Vector((0, 0, 0)), Vector((-0.08, 0.05, 1.3)), Vector((0.05, -0.04, 2.7)), Vector((0, 0, 3.5))]
    add_curved_tube(bm_wood, trunk_pts, [0.42, 0.30, 0.26, 0.20], segs=9)

    for b in range(8):
        ang = (b / 8.0) * math.pi * 2.0 + r.uniform(-0.18, 0.18)
        reach = 2.2 + r.uniform(0.1, 0.85)
        top_z = 4.4 + r.uniform(0.2, 1.4)
        p0 = Vector((0, 0, 2.5 + (b % 2) * 0.55))
        p1 = Vector((math.cos(ang) * reach * 0.55, math.sin(ang) * reach * 0.55, top_z - 0.55))
        p2 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, top_z))
        add_curved_tube(bm_wood, [p0, p1, p2], [0.14, 0.09, 0.04], segs=7)

        # Narrower lanceolate mango leaf sprays + fresh reddish-bronze new-growth tips
        add_foliage_cluster(bm_leaf, p2, 1.35, leaf_count=34, leaf_len=0.46, leaf_w=0.16, local_rng=r)
        if b % 2 == 0:
            add_foliage_cluster(bm_shoot, p2 + Vector((0, 0, 0.45)), 0.72, leaf_count=14, leaf_len=0.38, leaf_w=0.14, local_rng=r)

        # Hanging ripe golden mangoes under outer boughs
        for m in range(2):
            mp = p2 + Vector((r.uniform(-0.45, 0.45), r.uniform(-0.45, 0.45), -0.45 - m * 0.18))
            add_ellipsoid(bm_mango, mp, 0.07, 0.06, 0.095, segs=7, rings=5, rot_euler=(0.2, 0.1, r.uniform(0, 6)))

    add_foliage_cluster(bm_leaf, Vector((0, 0, 6.0)), 1.6, leaf_count=42, leaf_len=0.46, leaf_w=0.16, local_rng=r)

    link_mesh(col, "Mango_Wood", bm_wood, mat_dark_bark)
    link_mesh(col, "Mango_Canopy", bm_leaf, mat_leaf_lush)
    link_mesh(col, "Mango_NewShoots", bm_shoot, mat_leaf_bronze)
    link_mesh(col, "Mango_Fruits", bm_mango, mat_mango)
    return col


def build_tree_banyan():
    col = reset_collection("tree_banyan")
    r = random.Random(105)
    bm_wood = bmesh.new()
    bm_leaf = bmesh.new()

    # Massive gnarled sacred Aalmaram trunk
    add_curved_tube(
        bm_wood,
        [Vector((0, 0, 0)), Vector((0.12, -0.08, 1.4)), Vector((-0.08, 0.06, 2.8)), Vector((0, 0, 3.9))],
        [0.72, 0.54, 0.46, 0.36], segs=12,
    )

    # Wide sprawling horizontal limbs + iconic hanging aerial prop roots reaching the ground!
    for b in range(7):
        ang = (b / 7.0) * math.pi * 2.0 + r.uniform(-0.15, 0.15)
        reach = 3.6 + r.uniform(0.2, 0.9)
        limb_z = 3.7 + r.uniform(0.1, 0.7)
        p0 = Vector((0, 0, 2.9 + (b % 2) * 0.4))
        p1 = Vector((math.cos(ang) * reach * 0.52, math.sin(ang) * reach * 0.52, limb_z))
        p2 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, limb_z + 0.55))
        add_curved_tube(bm_wood, [p0, p1, p2], [0.24, 0.16, 0.08], segs=8)

        # Hanging aerial prop roots (some grounded, some mid-air)
        for ar in range(2):
            t_root = 0.48 + ar * 0.34
            rx = math.cos(ang) * reach * t_root + r.uniform(-0.22, 0.22)
            ry = math.sin(ang) * reach * t_root + r.uniform(-0.22, 0.22)
            rz_top = limb_z + ar * 0.15
            rz_bot = -0.05 if ar == 0 else r.uniform(0.4, 1.4)
            add_curved_tube(
                bm_wood,
                [Vector((rx, ry, rz_top)),
                 Vector((rx + r.uniform(-0.1, 0.1), ry + r.uniform(-0.1, 0.1), (rz_top + rz_bot) * 0.5)),
                 Vector((rx, ry, rz_bot))],
                [0.065 if ar == 0 else 0.032, 0.055 if ar == 0 else 0.022, 0.08 if ar == 0 else 0.012],
                segs=6,
            )

        add_foliage_cluster(bm_leaf, p2 + Vector((0, 0, 0.4)), 1.65, leaf_count=38, leaf_len=0.44, leaf_w=0.28, local_rng=r)
        add_foliage_cluster(bm_leaf, p1 + Vector((0, 0, 0.95)), 1.35, leaf_count=26, leaf_len=0.42, leaf_w=0.26, local_rng=r)

    add_foliage_cluster(bm_leaf, Vector((0, 0, 5.9)), 2.2, leaf_count=48, leaf_len=0.46, leaf_w=0.28, local_rng=r)

    link_mesh(col, "Banyan_Wood", bm_wood, mat_banyan_bark)
    link_mesh(col, "Banyan_Canopy", bm_leaf, mat_leaf_deep)
    return col


def build_tree_tamarind():
    col = reset_collection("tree_tamarind")
    r = random.Random(106)
    bm_wood = bmesh.new()
    bm_leaf = bmesh.new()
    bm_pod = bmesh.new()

    add_curved_tube(
        bm_wood,
        [Vector((0, 0, 0)), Vector((0.1, 0.08, 1.5)), Vector((-0.06, 0.04, 3.0)), Vector((0.04, -0.04, 4.1))],
        [0.44, 0.32, 0.25, 0.18], segs=9,
    )

    for b in range(7):
        ang = (b / 7.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        reach = 2.6 + r.uniform(0.2, 0.8)
        top_z = 5.0 + r.uniform(0.3, 1.4)
        p0 = Vector((0, 0, 2.9 + (b % 3) * 0.4))
        p1 = Vector((math.cos(ang) * reach * 0.55, math.sin(ang) * reach * 0.55, top_z - 0.5))
        p2 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, top_z))
        add_curved_tube(bm_wood, [p0, p1, p2], [0.14, 0.09, 0.04], segs=7)

        # Airy feathery pinnate tamarind foliage
        add_foliage_cluster(bm_leaf, p2, 1.45, leaf_count=42, leaf_len=0.38, leaf_w=0.14, local_rng=r)

        # Hanging curved brown tamarind pods
        for p in range(3):
            pp = p2 + Vector((r.uniform(-0.5, 0.5), r.uniform(-0.5, 0.5), -0.35 - p * 0.12))
            add_ellipsoid(bm_pod, pp, 0.032, 0.025, 0.11, segs=6, rings=5, rot_euler=(0.25, 0.15, r.uniform(0, 6)))

    add_foliage_cluster(bm_leaf, Vector((0, 0, 6.7)), 1.8, leaf_count=46, leaf_len=0.38, leaf_w=0.14, local_rng=r)

    link_mesh(col, "Tamarind_Wood", bm_wood, mat_banyan_bark)
    link_mesh(col, "Tamarind_Canopy", bm_leaf, mat_leaf_tamarind)
    link_mesh(col, "Tamarind_Pods", bm_pod, mat_tamarind_pod)
    return col


def build_tree_teak_timber():
    col = reset_collection("tree_teak_timber")
    r = random.Random(107)
    bm_wood = bmesh.new()
    bm_leaf = bmesh.new()

    # Tall straight Western Ghats teak trunk (8.2m)
    add_curved_tube(
        bm_wood,
        [Vector((0, 0, 0)), Vector((0.04, 0.02, 2.2)), Vector((-0.03, 0.03, 4.6)), Vector((0.02, -0.02, 6.6))],
        [0.34, 0.26, 0.20, 0.12], segs=9,
    )

    for b in range(6):
        ang = (b / 6.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        h0 = 4.6 + (b % 3) * 0.65
        reach = 1.7 + r.uniform(0.2, 0.6)
        p0 = Vector((0, 0, h0))
        p1 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, h0 + 1.15))
        add_curved_tube(bm_wood, [p0, p1], [0.10, 0.04], segs=6)
        # Signature oversized broad teak leaves
        add_foliage_cluster(bm_leaf, p1, 1.25, leaf_count=24, leaf_len=0.62, leaf_w=0.38, local_rng=r)

    add_foliage_cluster(bm_leaf, Vector((0, 0, 7.6)), 1.45, leaf_count=28, leaf_len=0.62, leaf_w=0.38, local_rng=r)

    link_mesh(col, "Teak_Trunk", bm_wood, mat_banyan_bark)
    link_mesh(col, "Teak_Canopy", bm_leaf, mat_leaf_teak)
    return col


def build_tree_pepper_vine_support():
    """Authentic 18th-century Kerala black pepper vine (Kurumulaku) climbing a live support tree."""
    col = reset_collection("tree_pepper_vine_support")
    r = random.Random(108)
    bm_wood = bmesh.new()
    bm_vine = bmesh.new()
    bm_leaf = bmesh.new()
    bm_berry = bmesh.new()

    # Support tree trunk (Murikku / Silver-oak style pole tree)
    pts = [Vector((0, 0, 0)), Vector((0.06, -0.04, 1.8)), Vector((-0.04, 0.05, 3.6)), Vector((0, 0, 5.2))]
    add_curved_tube(bm_wood, pts, [0.24, 0.19, 0.16, 0.11], segs=8)

    # Top support-tree branches
    for b in range(4):
        ang = b * math.pi * 0.5 + 0.4
        p0 = Vector((0, 0, 4.4 + (b % 2) * 0.4))
        p1 = Vector((math.cos(ang) * 1.25, math.sin(ang) * 1.25, 5.5))
        add_curved_tube(bm_wood, [p0, p1], [0.08, 0.03], segs=6)
        add_foliage_cluster(bm_leaf, p1, 0.95, leaf_count=18, leaf_len=0.36, leaf_w=0.20, local_rng=r)

    # Dense spiraling black-pepper vine wrapping tightly up the trunk (0.3m -> 4.6m)
    vine_pts, vine_rads = [], []
    steps = 36
    for i in range(steps + 1):
        t = i / steps
        ang = t * math.pi * 9.0
        z = 0.25 + t * 4.35
        rad = 0.24 * (1.0 - 0.35 * t) + 0.04
        pos = Vector((math.cos(ang) * rad, math.sin(ang) * rad, z))
        vine_pts.append(pos)
        vine_rads.append(0.025)

        # Heart-shaped pepper leaves & hanging peppercorn catkins all along the spiral
        if i % 2 == 0:
            out_dir = Vector((math.cos(ang), math.sin(ang), 0.15)).normalized()
            add_blade_quad_strip(bm_leaf, pos, out_dir, 0.28, 0.18, droop=0.35, segs=2)
            if i % 4 == 0:
                add_ellipsoid(
                    bm_berry,
                    pos + out_dir * 0.14 + Vector((0, 0, -0.10)),
                    0.022, 0.022, 0.095, segs=6, rings=5,
                )

    add_curved_tube(bm_vine, vine_pts, vine_rads, segs=5)

    link_mesh(col, "PepperSupport_Trunk", bm_wood, mat_dark_bark)
    link_mesh(col, "Pepper_Vine", bm_vine, mat_woody_stem)
    link_mesh(col, "Pepper_Leaves", bm_leaf, mat_leaf_deep)
    link_mesh(col, "Pepper_Berries", bm_berry, mat_pepper_berry)
    return col


def build_tree_bamboo_grove():
    col = reset_collection("tree_bamboo_grove")
    r = random.Random(109)
    bm_culm = bmesh.new()
    bm_leaf = bmesh.new()

    # 9 gracefully arching segmented giant bamboo culms (6.0-7.8m tall)
    for c in range(9):
        ang = (c / 9.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        base_r = 0.12 + (c % 3) * 0.16
        height = 5.8 + r.uniform(0.0, 2.0)
        lean = 1.4 + r.uniform(0.3, 1.2)
        pts, rads = [], []
        for s in range(14):
            t = s / 13.0
            rad_xy = base_r + lean * (t * t)
            pts.append(Vector((math.cos(ang) * rad_xy, math.sin(ang) * rad_xy, height * t)))
            rads.append(0.055 * (1.0 - 0.62 * t))
        add_curved_tube(bm_culm, pts, rads, segs=7, ring_ridge=0.14)

        # Feathery bamboo leaf sprays at upper nodes
        for node_idx in (8, 10, 12, 13):
            add_foliage_cluster(
                bm_leaf, pts[node_idx], 0.72,
                leaf_count=16, leaf_len=0.38, leaf_w=0.075, local_rng=r,
            )

    link_mesh(col, "Bamboo_Culms", bm_culm, mat_bamboo_culm)
    link_mesh(col, "Bamboo_Leaves", bm_leaf, mat_leaf_lush)
    return col


# ------------------------------------------------------------------------------
# 4. BUSH & SHRUB BUILDERS (5 Authentic Rural Kerala Shrubs)
# ------------------------------------------------------------------------------
def build_bush_hibiscus():
    """Chembarathi — Kerala red hibiscus hedge shrub with 5-petal flowers."""
    col = reset_collection("bush_hibiscus")
    r = random.Random(201)
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()
    bm_flower = bmesh.new()

    for b in range(7):
        ang = (b / 7.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        h = 1.05 + r.uniform(0.0, 0.45)
        reach = 0.55 + r.uniform(0.0, 0.35)
        p0 = Vector((0, 0, 0))
        p1 = Vector((math.cos(ang) * reach * 0.5, math.sin(ang) * reach * 0.5, h * 0.55))
        p2 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, h))
        add_curved_tube(bm_stem, [p0, p1, p2], [0.032, 0.022, 0.012], segs=5)
        add_foliage_cluster(bm_leaf, p2, 0.52, leaf_count=20, leaf_len=0.22, leaf_w=0.14, local_rng=r)

        # 5-petaled crimson hibiscus blossom on outer tips
        for _ in range(2):
            fc = p2 + Vector((r.uniform(-0.22, 0.22), r.uniform(-0.22, 0.22), r.uniform(-0.08, 0.16)))
            for pet in range(5):
                pang = (pet / 5.0) * math.pi * 2.0
                pdir = Vector((math.cos(pang), math.sin(pang), 0.35)).normalized()
                add_blade_quad_strip(bm_flower, fc, pdir, 0.11, 0.085, droop=0.18, segs=2)

    link_mesh(col, "Hibiscus_Stems", bm_stem, mat_woody_stem)
    link_mesh(col, "Hibiscus_Leaves", bm_leaf, mat_leaf_deep)
    link_mesh(col, "Hibiscus_Flowers", bm_flower, mat_flower_red)
    return col


def build_bush_thechi_ixora():
    """Thechi (Ixora) — Traditional Kerala fiery-orange temple & courtyard shrub."""
    col = reset_collection("bush_thechi_ixora")
    r = random.Random(202)
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()
    bm_flower = bmesh.new()

    for b in range(6):
        ang = (b / 6.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        h = 0.85 + r.uniform(0.0, 0.35)
        reach = 0.45 + r.uniform(0.0, 0.25)
        p1 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, h))
        add_curved_tube(bm_stem, [Vector((0, 0, 0)), p1], [0.028, 0.014], segs=5)
        add_foliage_cluster(bm_leaf, p1, 0.46, leaf_count=22, leaf_len=0.18, leaf_w=0.10, local_rng=r)
        # Signature dome-shaped fiery red-orange Ixora flower cluster
        for _ in range(2):
            fc = p1 + Vector((r.uniform(-0.18, 0.18), r.uniform(-0.18, 0.18), 0.16))
            add_ellipsoid(bm_flower, fc, 0.09, 0.09, 0.065, segs=7, rings=5)

    link_mesh(col, "Ixora_Stems", bm_stem, mat_woody_stem)
    link_mesh(col, "Ixora_Leaves", bm_leaf, mat_leaf_deep)
    link_mesh(col, "Ixora_Flowers", bm_flower, mat_flower_ixora)
    return col


def build_bush_tulsi_plant():
    """Thulasi — Sacred courtyard basil shrub with upright purple-green flower spikes."""
    col = reset_collection("bush_tulsi_plant")
    r = random.Random(203)
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()
    bm_spike = bmesh.new()

    for b in range(8):
        ang = (b / 8.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        h = 0.58 + r.uniform(0.0, 0.24)
        reach = 0.26 + r.uniform(0.0, 0.14)
        p1 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, h))
        add_curved_tube(bm_stem, [Vector((0, 0, 0)), p1], [0.018, 0.008], segs=5)
        add_foliage_cluster(bm_leaf, p1 * 0.85, 0.26, leaf_count=16, leaf_len=0.11, leaf_w=0.065, local_rng=r)
        # Upright Tulsi manjari flower spike
        add_curved_tube(bm_spike, [p1, p1 + Vector((0, 0, 0.18))], [0.014, 0.005], segs=5)

    link_mesh(col, "Tulsi_Stems", bm_stem, mat_woody_stem)
    link_mesh(col, "Tulsi_Leaves", bm_leaf, mat_leaf_tulsi)
    link_mesh(col, "Tulsi_Spikes", bm_spike, mat_tulsi_spike)
    return col


def build_bush_tropical_fern():
    """Pannal — Arching radial rosette of Kerala sword-fern fronds."""
    col = reset_collection("bush_tropical_fern")
    r = random.Random(204)
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()

    for f in range(14):
        yaw = (f / 14.0) * math.pi * 2.0 + r.uniform(-0.14, 0.14)
        pitch = 0.35 + (f % 3) * 0.24
        length = 0.62 + r.uniform(0.0, 0.32)
        add_pinnate_palm_frond(
            bm_stem, bm_leaf, Vector((0, 0, 0.04)), yaw, pitch,
            length, leaflet_pairs=9, droop=0.58,
        )

    link_mesh(col, "Fern_Stems", bm_stem, mat_woody_stem)
    link_mesh(col, "Fern_Fronds", bm_leaf, mat_leaf_lush)
    return col


def build_bush_wild_lantana():
    """Kongini — Natural rural Kerala roadside scrub bush with bright wildflower tufts."""
    col = reset_collection("bush_wild_lantana")
    r = random.Random(205)
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()
    bm_fl_y = bmesh.new()
    bm_fl_o = bmesh.new()

    for b in range(8):
        ang = (b / 8.0) * math.pi * 2.0 + r.uniform(-0.25, 0.25)
        h = 0.72 + r.uniform(0.0, 0.38)
        reach = 0.55 + r.uniform(0.0, 0.32)
        p1 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, h))
        add_curved_tube(bm_stem, [Vector((0, 0, 0)), p1], [0.025, 0.012], segs=5)
        add_foliage_cluster(bm_leaf, p1, 0.48, leaf_count=20, leaf_len=0.16, leaf_w=0.11, local_rng=r)
        target_fl = bm_fl_y if b % 2 == 0 else bm_fl_o
        add_ellipsoid(target_fl, p1 + Vector((0, 0, 0.14)), 0.065, 0.065, 0.045, segs=6, rings=4)

    link_mesh(col, "Scrub_Stems", bm_stem, mat_woody_stem)
    link_mesh(col, "Scrub_Leaves", bm_leaf, mat_leaf_tamarind)
    link_mesh(col, "Scrub_FlowersY", bm_fl_y, mat_flower_yellow)
    link_mesh(col, "Scrub_FlowersO", bm_fl_o, mat_flower_ixora)
    return col


# ------------------------------------------------------------------------------
# 5. GRASS & PADDY BUILDERS (4 Types)
# ------------------------------------------------------------------------------
def build_grass_kerala_lush():
    col = reset_collection("grass_kerala_lush")
    r = random.Random(301)
    bm = bmesh.new()
    for i in range(26):
        ang = (i / 26.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        rad = r.uniform(0.0, 0.22)
        origin = Vector((math.cos(ang) * rad, math.sin(ang) * rad, 0.0))
        d = Vector((math.cos(ang) * 0.45, math.sin(ang) * 0.45, 0.92)).normalized()
        add_blade_quad_strip(bm, origin, d, r.uniform(0.24, 0.44), r.uniform(0.026, 0.042), droop=r.uniform(0.35, 0.65), segs=3)
    link_mesh(col, "Grass_Lush", bm, mat_grass_green)
    return col


def build_grass_dry_savanna():
    col = reset_collection("grass_dry_savanna")
    r = random.Random(302)
    bm_blade = bmesh.new()
    bm_seed = bmesh.new()
    for i in range(22):
        ang = (i / 22.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        rad = r.uniform(0.0, 0.24)
        origin = Vector((math.cos(ang) * rad, math.sin(ang) * rad, 0.0))
        d = Vector((math.cos(ang) * 0.38, math.sin(ang) * 0.38, 0.94)).normalized()
        add_blade_quad_strip(bm_blade, origin, d, r.uniform(0.42, 0.72), r.uniform(0.028, 0.042), droop=r.uniform(0.45, 0.78), segs=4)
    # 5 taller golden seed stalks
    for s in range(5):
        ang = s * 1.25 + 0.3
        p0 = Vector((math.cos(ang) * 0.08, math.sin(ang) * 0.08, 0.0))
        p1 = Vector((math.cos(ang) * 0.24, math.sin(ang) * 0.24, 0.76 + r.uniform(0, 0.18)))
        add_curved_tube(bm_seed, [p0, p1], [0.008, 0.004], segs=4)
        add_ellipsoid(bm_seed, p1, 0.022, 0.022, 0.09, segs=5, rings=4)
    link_mesh(col, "Grass_DryBlades", bm_blade, mat_grass_dry)
    link_mesh(col, "Grass_SeedStalks", bm_seed, mat_paddy_gold)
    return col


def build_paddy_clump_green():
    """Pacha Nellu — Young lush green flooded rice clump."""
    col = reset_collection("paddy_clump_green")
    r = random.Random(303)
    bm = bmesh.new()
    for i in range(24):
        ang = (i / 24.0) * math.pi * 2.0 + r.uniform(-0.18, 0.18)
        rad = r.uniform(0.0, 0.08)
        origin = Vector((math.cos(ang) * rad, math.sin(ang) * rad, 0.0))
        d = Vector((math.cos(ang) * 0.32, math.sin(ang) * 0.32, 0.95)).normalized()
        add_blade_quad_strip(bm, origin, d, r.uniform(0.45, 0.68), 0.026, droop=r.uniform(0.32, 0.58), segs=4)
    link_mesh(col, "Paddy_Green", bm, mat_paddy_green)
    return col


def build_paddy_clump_golden():
    """Vilancha Nellu — Mature harvest-ready Kerala rice clump with heavy golden grain panicles."""
    col = reset_collection("paddy_clump_golden")
    r = random.Random(304)
    bm_leaf = bmesh.new()
    bm_grain = bmesh.new()
    for i in range(18):
        ang = (i / 18.0) * math.pi * 2.0 + r.uniform(-0.18, 0.18)
        rad = r.uniform(0.0, 0.09)
        origin = Vector((math.cos(ang) * rad, math.sin(ang) * rad, 0.0))
        d = Vector((math.cos(ang) * 0.36, math.sin(ang) * 0.36, 0.93)).normalized()
        add_blade_quad_strip(bm_leaf, origin, d, r.uniform(0.52, 0.72), 0.028, droop=r.uniform(0.42, 0.68), segs=4)

    # 8 drooping golden grain-heavy rice stalks (nelkathir)
    for g in range(8):
        ang = (g / 8.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
        p0 = Vector((math.cos(ang) * 0.04, math.sin(ang) * 0.04, 0.0))
        p1 = Vector((math.cos(ang) * 0.14, math.sin(ang) * 0.14, 0.58))
        p2 = Vector((math.cos(ang) * 0.28, math.sin(ang) * 0.28, 0.72 + r.uniform(0, 0.12)))
        p3 = Vector((math.cos(ang) * 0.40, math.sin(ang) * 0.40, 0.60 + r.uniform(0, 0.10)))
        add_curved_tube(bm_grain, [p0, p1, p2, p3], [0.009, 0.007, 0.006, 0.005], segs=4)
        # Golden rice panicle ear hanging at the tip
        add_ellipsoid(bm_grain, p3 + Vector((0, 0, -0.05)), 0.026, 0.026, 0.085, segs=6, rings=5, rot_euler=(0.45 * math.sin(ang), -0.45 * math.cos(ang), ang))

    link_mesh(col, "Paddy_Stalks", bm_leaf, mat_grass_dry)
    link_mesh(col, "Paddy_GoldenPanicles", bm_grain, mat_paddy_gold)
    return col


# ------------------------------------------------------------------------------
# 6. CULTIVATION BUILDERS (4 Iconic 18th-Century Kerala Crops)
# ------------------------------------------------------------------------------
def build_cultivation_banana():
    """Vazha — Detailed Kerala banana plant with broad arching leaves, fruit bunch & maroon blossom."""
    col = reset_collection("cultivation_banana")
    r = random.Random(401)
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()
    bm_fruit = bmesh.new()
    bm_flower = bmesh.new()

    # Thick overlapping fibrous pseudostem (2.2m)
    add_curved_tube(
        bm_stem,
        [Vector((0, 0, 0)), Vector((0.03, 0, 0.8)), Vector((-0.02, 0.02, 1.6)), Vector((0, 0, 2.25))],
        [0.19, 0.15, 0.12, 0.085], segs=10,
    )

    # 9 huge broad arching banana leaves (vazhayila) with raised midrib
    for l in range(9):
        yaw = (l / 9.0) * math.pi * 2.0 + r.uniform(-0.15, 0.15)
        pitch = 0.25 + (l % 3) * 0.28
        length = 1.65 + r.uniform(-0.15, 0.25)
        d = Vector((math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))).normalized()
        origin = Vector((0, 0, 1.95 + (l % 3) * 0.14))
        add_blade_quad_strip(bm_leaf, origin, d, length, 0.48, droop=0.58, segs=6, twist=r.uniform(-0.15, 0.15))

    # Hanging banana bunch (Vazhakula) + maroon blossom (Vazhappoo)
    stalk_pts = [Vector((0, 0, 2.18)), Vector((0.28, 0.12, 2.24)), Vector((0.46, 0.18, 1.92)), Vector((0.48, 0.20, 1.25))]
    add_curved_tube(bm_stem, stalk_pts, [0.04, 0.032, 0.026, 0.016], segs=6)

    for tier in range(4):
        tz = 1.90 - tier * 0.13
        for b in range(7):
            ang = (b / 7.0) * math.pi * 2.0 + tier * 0.4
            bx = 0.47 + math.cos(ang) * 0.075
            by = 0.19 + math.sin(ang) * 0.075
            add_ellipsoid(
                bm_fruit, Vector((bx, by, tz)),
                0.024, 0.024, 0.078, segs=6, rings=5,
                rot_euler=(0.45 * math.sin(ang), -0.45 * math.cos(ang), ang),
            )
    # Maroon teardrop banana flower (Vazhappoo) at bottom of stalk
    add_ellipsoid(bm_flower, Vector((0.48, 0.20, 1.16)), 0.062, 0.062, 0.13, segs=8, rings=6)

    link_mesh(col, "Banana_Pseudostem", bm_stem, mat_banana_stem)
    link_mesh(col, "Banana_Leaves", bm_leaf, mat_banana_leaf)
    link_mesh(col, "Banana_Bunch", bm_fruit, mat_banana_fruit)
    link_mesh(col, "Banana_Blossom", bm_flower, mat_banana_flower)
    return col


def build_cultivation_tapioca():
    """Kappa (Cassava / Tapioca) — Raised soil mound with knobby woody stems & palmate star leaves."""
    col = reset_collection("cultivation_tapioca")
    r = random.Random(402)
    bm_soil = bmesh.new()
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()

    # Sculpted red-laterite cultivation mound
    add_ellipsoid(bm_soil, Vector((0, 0, 0.05)), 0.46, 0.46, 0.18, segs=10, rings=6)

    # 3 upright knobby cassava stems
    for s in range(3):
        ang = (s / 3.0) * math.pi * 2.0 + 0.4
        h = 1.15 + r.uniform(0.0, 0.38)
        p0 = Vector((math.cos(ang) * 0.08, math.sin(ang) * 0.08, 0.12))
        p1 = Vector((math.cos(ang) * 0.24, math.sin(ang) * 0.24, h))
        add_curved_tube(bm_stem, [p0, p1], [0.026, 0.015], segs=6, ring_ridge=0.12)

        # Palmate 5-lobed star-like tapioca leaves radiating from top of each stem
        for cluster in range(4):
            c_ang = (cluster / 4.0) * math.pi * 2.0 + r.uniform(-0.2, 0.2)
            c_pos = p1 + Vector((math.cos(c_ang) * 0.14, math.sin(c_ang) * 0.14, -cluster * 0.06))
            for lobe in range(5):
                lang = c_ang + (lobe - 2) * 0.52
                ldir = Vector((math.cos(lang), math.sin(lang), 0.18)).normalized()
                add_blade_quad_strip(bm_leaf, c_pos, ldir, 0.24, 0.055, droop=0.35, segs=2)

    link_mesh(col, "Tapioca_Mound", bm_soil, mat_soil_mound)
    link_mesh(col, "Tapioca_Stems", bm_stem, mat_woody_stem)
    link_mesh(col, "Tapioca_Leaves", bm_leaf, mat_leaf_deep)
    return col


def build_cultivation_taro_yam():
    """Chembu / Chena (Taro & Elephant-Foot Yam) — Dark soil mound with large glossy elephant-ear leaves."""
    col = reset_collection("cultivation_taro_yam")
    r = random.Random(403)
    bm_soil = bmesh.new()
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()

    add_ellipsoid(bm_soil, Vector((0, 0, 0.04)), 0.44, 0.44, 0.16, segs=10, rings=6)

    for k in range(9):
        ang = (k / 9.0) * math.pi * 2.0 + r.uniform(-0.18, 0.18)
        h = 0.52 + r.uniform(0.0, 0.34)
        reach = 0.22 + r.uniform(0.0, 0.22)
        p0 = Vector((math.cos(ang) * 0.05, math.sin(ang) * 0.05, 0.10))
        p1 = Vector((math.cos(ang) * reach, math.sin(ang) * reach, h))
        add_curved_tube(bm_stem, [p0, p1], [0.022, 0.012], segs=5)
        # Wide heart-shaped elephant-ear leaf
        out = Vector((math.cos(ang), math.sin(ang), -0.15)).normalized()
        add_blade_quad_strip(bm_leaf, p1, out, 0.42, 0.34, droop=0.36, segs=3)

    link_mesh(col, "Taro_Mound", bm_soil, mat_soil_mound)
    link_mesh(col, "Taro_Petioles", bm_stem, mat_banana_stem)
    link_mesh(col, "Taro_Leaves", bm_leaf, mat_taro_leaf)
    return col


def build_cultivation_spices_veg():
    """Adukkala Thottam — Kerala homestead raised bed with Turmeric, Brinjal & Kanthari Chili."""
    col = reset_collection("cultivation_spices_veg")
    r = random.Random(404)
    bm_soil = bmesh.new()
    bm_stem = bmesh.new()
    bm_leaf = bmesh.new()
    bm_brinjal = bmesh.new()
    bm_chili = bmesh.new()

    # Raised rectangular red-earth garden bed (1.8m x 0.95m)
    add_ellipsoid(bm_soil, Vector((0, 0, 0.04)), 0.95, 0.52, 0.16, segs=12, rings=6)

    # Left: Turmeric / Ginger clump (pleated broad upright leaves)
    for k in range(8):
        ang = (k / 8.0) * math.pi * 2.0
        origin = Vector((-0.55 + math.cos(ang) * 0.08, math.sin(ang) * 0.08, 0.12))
        d = Vector((math.cos(ang) * 0.45, math.sin(ang) * 0.45, 0.88)).normalized()
        add_blade_quad_strip(bm_leaf, origin, d, 0.58, 0.18, droop=0.38, segs=3)

    # Center: Bushy Brinjal (Eggplant) with hanging glossy purple fruits
    p_top = Vector((0.0, 0.0, 0.62))
    add_curved_tube(bm_stem, [Vector((0, 0, 0.12)), p_top], [0.025, 0.014], segs=5)
    add_foliage_cluster(bm_leaf, p_top, 0.36, leaf_count=18, leaf_len=0.22, leaf_w=0.14, local_rng=r)
    for b in range(3):
        ang = b * 2.1 + 0.4
        add_ellipsoid(bm_brinjal, Vector((math.cos(ang) * 0.16, math.sin(ang) * 0.16, 0.38)), 0.048, 0.048, 0.095, segs=7, rings=5)

    # Right: Kanthari Chili bush with tiny bright red & green chilies
    c_top = Vector((0.55, 0.0, 0.58))
    add_curved_tube(bm_stem, [Vector((0.55, 0, 0.12)), c_top], [0.02, 0.01], segs=5)
    add_foliage_cluster(bm_leaf, c_top, 0.32, leaf_count=18, leaf_len=0.16, leaf_w=0.08, local_rng=r)
    for ch in range(6):
        ang = (ch / 6.0) * math.pi * 2.0
        add_ellipsoid(
            bm_chili,
            c_top + Vector((math.cos(ang) * 0.16, math.sin(ang) * 0.16, -0.06)),
            0.012, 0.012, 0.042, segs=5, rings=4, rot_euler=(0.3, 0.2, ang),
        )

    link_mesh(col, "Garden_SoilBed", bm_soil, mat_soil_mound)
    link_mesh(col, "Garden_Stems", bm_stem, mat_woody_stem)
    link_mesh(col, "Garden_Leaves", bm_leaf, mat_leaf_lush)
    link_mesh(col, "Garden_Brinjals", bm_brinjal, mat_brinjal)
    link_mesh(col, "Garden_Chilies", bm_chili, mat_chili_red)
    return col


# ------------------------------------------------------------------------------
# 7. Optional Cycles PBR Baking & GLB Export Pipeline
# ------------------------------------------------------------------------------
def fresh_image(name, width, height):
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    return bpy.data.images.new(name, width=width, height=height)


def unwrap_and_bake_collection(col):
    os.makedirs(TEX_DIR, exist_ok=True)
    bake_objs = [o for o in col.objects if o.type == "MESH"]
    if not bake_objs:
        return

    bpy.ops.object.select_all(action="DESELECT")
    for o in bake_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = bake_objs[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")

    img_albedo = fresh_image(f"{col.name}_albedo", BAKE_RES, BAKE_RES)
    img_rough  = fresh_image(f"{col.name}_roughness", BAKE_RES, BAKE_RES)
    img_normal = fresh_image(f"{col.name}_normal", BAKE_RES, BAKE_RES)
    img_rough.colorspace_settings.name = "Non-Color"
    img_normal.colorspace_settings.name = "Non-Color"

    used_mats = {m for o in bake_objs for m in o.data.materials if m}
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

    def run_bake(bake_type, img, path):
        for _m, tn in temp_nodes:
            tn.image = img
        if bake_type == "DIFFUSE":
            scene.render.bake.use_pass_direct = False
            scene.render.bake.use_pass_indirect = False
            scene.render.bake.use_pass_color = True
        bpy.ops.object.bake(type=bake_type)
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        img.pack()

    run_bake("DIFFUSE",   img_albedo, os.path.join(TEX_DIR, f"{col.name}_albedo.png"))
    run_bake("ROUGHNESS", img_rough,  os.path.join(TEX_DIR, f"{col.name}_roughness.png"))
    run_bake("NORMAL",    img_normal, os.path.join(TEX_DIR, f"{col.name}_normal.png"))

    for m, tn in temp_nodes:
        m.node_tree.nodes.remove(tn)

    baked_mat, nodes, links, bsdf = clear_material(f"{col.name}_Baked")
    uv = nodes.new("ShaderNodeTexCoord")
    ta = nodes.new("ShaderNodeTexImage")
    ta.image = img_albedo
    links.new(uv.outputs["UV"], ta.inputs["Vector"])
    links.new(ta.outputs["Color"], bsdf.inputs["Base Color"])

    tr = nodes.new("ShaderNodeTexImage")
    tr.image = img_rough
    links.new(uv.outputs["UV"], tr.inputs["Vector"])
    links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])

    tn_node = nodes.new("ShaderNodeTexImage")
    tn_node.image = img_normal
    links.new(uv.outputs["UV"], tn_node.inputs["Vector"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.85
    links.new(tn_node.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    for o in bake_objs:
        o.data.materials.clear()
        o.data.materials.append(baked_mat)


# ------------------------------------------------------------------------------
# 8. Build & Export All 22 Kerala Flora & Cultivation Assets
# ------------------------------------------------------------------------------
BUILDERS = [
    # Trees (row y = 0)
    (build_tree_coconut_palm,        (-24.0,  0.0)),
    (build_tree_arecanut_palm,       (-18.0,  0.0)),
    (build_tree_jackfruit,           (-12.0,  0.0)),
    (build_tree_mango,               ( -6.0,  0.0)),
    (build_tree_banyan,              (  2.0,  0.0)),
    (build_tree_tamarind,            ( 10.0,  0.0)),
    (build_tree_teak_timber,         ( 17.0,  0.0)),
    (build_tree_pepper_vine_support, ( 23.0,  0.0)),
    (build_tree_bamboo_grove,        ( 29.0,  0.0)),
    # Bushes (row y = -8)
    (build_bush_hibiscus,            (-12.0, -8.0)),
    (build_bush_thechi_ixora,        ( -8.0, -8.0)),
    (build_bush_tulsi_plant,         ( -4.0, -8.0)),
    (build_bush_tropical_fern,       (  0.0, -8.0)),
    (build_bush_wild_lantana,        (  4.0, -8.0)),
    # Grass & Paddy (row y = -13)
    (build_grass_kerala_lush,        ( -8.0, -13.0)),
    (build_grass_dry_savanna,        ( -4.0, -13.0)),
    (build_paddy_clump_green,        (  0.0, -13.0)),
    (build_paddy_clump_golden,       (  4.0, -13.0)),
    # Cultivations (row y = -18)
    (build_cultivation_banana,       ( -9.0, -18.0)),
    (build_cultivation_tapioca,      ( -3.0, -18.0)),
    (build_cultivation_taro_yam,     (  3.0, -18.0)),
    (build_cultivation_spices_veg,   (  9.0, -18.0)),
]

if AUTO_EXPORT:
    os.makedirs(EXPORT_DIR, exist_ok=True)

for builder_fn, (preview_x, preview_y) in BUILDERS:
    col = builder_fn()
    if AUTO_BAKE:
        print(f"Baking 1K PBR maps for {col.name}...")
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

    # Spread out in Blender viewport for clean visual inspection
    for obj in col.objects:
        obj.location.x += preview_x
        obj.location.y += preview_y

bpy.ops.object.select_all(action="DESELECT")
print(f"Done! All {len(BUILDERS)} rural Kerala trees, bushes, grass, paddy & cultivation models exported to {EXPORT_DIR}.")
