import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Euler, Matrix

# ==============================================================================
# KALIYUGHAM (18th-Century Rural Kerala) — Detailed Bullock Carts (with Palla)
# & Traditional Pallakku / Manchal Generator
# ==============================================================================
# Generates 3 richly detailed, historically authentic 18th-century Kerala
# transport vehicles with packed PBR wood/bamboo/thatch/iron/cloth textures
# and exports them as GLB to:
#   /Users/vishnuk/Documents/project/game/public/models/vehicles/*.glb
#
#   1. kerala_bullock_cart_palla.glb  — Covered Kala Vandi with arched bamboo &
#                                       palm-leaf Palla hood, 12-spoke iron-rimmed
#                                       wheels, draw-poles, cargo & hanging lamp
#   2. kerala_bullock_cart_cargo.glb  — Open farm-produce Kala Vandi loaded with
#                                       rice sacks, coconuts & woven baskets
#   3. kerala_pallakku.glb            — Traditional Kerala Pallakku / Manchal
#                                       covered palanquin with curved poles
# ==============================================================================

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/vehicles"
AUTO_EXPORT = True

# ------------------------------------------------------------------------------
# 1. Packed Organic PBR Material Library (Guaranteed glTF Texture Export)
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


def _make_packed_tex(name, col_a, col_b, pattern="wood", seed=31):
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
            if pattern == "weave":
                w1 = 0.5 + 0.5 * math.sin(u * math.pi * 24.0)
                w2 = 0.5 + 0.5 * math.sin(v * math.pi * 24.0)
                t = 0.45 * val + 0.55 * (w1 * 0.5 + w2 * 0.5)
            elif pattern == "wood":
                grain = 0.5 + 0.5 * math.sin((u * 14.0 + val * 2.2) * math.pi * 2.0)
                t = 0.58 * val + 0.42 * grain
            elif pattern == "thatch":
                reed = 0.5 + 0.5 * math.sin((u * 26.0 + val * 1.5) * math.pi * 2.0)
                t = 0.48 * val + 0.52 * reed
            else:
                t = val
            t = max(0.0, min(1.0, t))
            idx = (y * res + x) * 4
            pixels[idx] = col_a[0] + (col_b[0] - col_a[0]) * t
            pixels[idx + 1] = col_a[1] + (col_b[1] - col_a[1]) * t
            pixels[idx + 2] = col_a[2] + (col_b[2] - col_a[2]) * t
            pixels[idx + 3] = 1.0
    img.pixels.foreach_set(pixels)
    img.pack()
    return img


_SEED = 900


def make_mat(name, col_a, col_b, roughness=0.78, pattern="wood", bump_str=0.22, metallic=0.0):
    global _SEED
    _SEED += 19
    mat, nodes, links, bsdf = clear_material(name)
    mat.use_backface_culling = False
    img = _make_packed_tex(name, col_a, col_b, pattern=pattern, seed=_SEED)
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


mat_teak       = make_mat("Veh_TeakWood",    (0.11, 0.06, 0.03),  (0.24, 0.14, 0.07),  0.76, "wood",   0.26)
mat_hardwood   = make_mat("Veh_Hardwood",    (0.16, 0.10, 0.05),  (0.32, 0.21, 0.11),  0.78, "wood",   0.24)
mat_bamboo     = make_mat("Veh_Bamboo",      (0.30, 0.23, 0.10),  (0.54, 0.42, 0.19),  0.72, "wood",   0.20)
mat_palla_mat  = make_mat("Veh_PallaWeave",  (0.24, 0.18, 0.08),  (0.46, 0.36, 0.17),  0.90, "weave",  0.34)
mat_thatch     = make_mat("Veh_PalmThatch",  (0.18, 0.14, 0.06),  (0.38, 0.30, 0.13),  0.94, "thatch", 0.40)
mat_iron       = make_mat("Veh_ForgedIron",  (0.12, 0.11, 0.11),  (0.22, 0.20, 0.19),  0.48, "metal",  0.18, metallic=0.78)
mat_brass      = make_mat("Veh_Brass",       (0.68, 0.48, 0.12),  (0.90, 0.70, 0.22),  0.30, "metal",  0.10, metallic=0.84)
mat_jute       = make_mat("Veh_JuteSack",    (0.38, 0.29, 0.17),  (0.56, 0.44, 0.28),  0.92, "weave",  0.28)
mat_coir       = make_mat("Veh_CoirRope",    (0.22, 0.14, 0.06),  (0.36, 0.24, 0.11),  0.94, "weave",  0.32)
mat_crimson    = make_mat("Veh_RoyalCloth",  (0.42, 0.06, 0.06),  (0.66, 0.12, 0.10),  0.80, "weave",  0.18)
mat_coconut    = make_mat("Veh_Coconut",     (0.16, 0.34, 0.07),  (0.30, 0.46, 0.12),  0.54, "wood",   0.14)

# ------------------------------------------------------------------------------
# 2. BMesh Builders (Spoked Wheels, Arched Palla Canopy, Chassis & Cargo)
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


def finalize_mesh(col, name, bm, mat, loc=(0, 0, 0), rot=(0, 0, 0), smooth=True):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv_layer = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[uv_layer].uv = (co.x * 1.6, co.y * 1.6)
            elif ax >= ay:
                loop[uv_layer].uv = (co.y * 1.6, co.z * 1.6)
            else:
                loop[uv_layer].uv = (co.x * 1.6, co.z * 1.6)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for p in mesh.polygons:
            p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    col.objects.link(obj)
    return obj


def add_box(bm, center, size_xyz, rot=(0, 0, 0)):
    m = Matrix.Translation(center) @ Euler(rot, "XYZ").to_matrix().to_4x4() @ Matrix.Diagonal((size_xyz[0], size_xyz[1], size_xyz[2], 1.0))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


def add_cyl(bm, p1, p2, r1, r2=None, segs=10):
    if r2 is None:
        r2 = r1
    v1, v2 = Vector(p1), Vector(p2)
    diff = v2 - v1
    length = diff.length
    if length < 1e-5:
        return
    mid = (v1 + v2) * 0.5
    q = Vector((0, 0, 1)).rotation_difference(diff.normalized())
    m = Matrix.Translation(mid) @ q.to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=length, matrix=m)


def add_sphere(bm, center, rx, ry, rz, segs=10, rings=7):
    m = Matrix.Translation(center) @ Matrix.Diagonal((rx, ry, rz, 1.0))
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0, matrix=m)


def build_spoked_wheel(col, name, wheel_x, wheel_y, wheel_r=0.72):
    """Detailed 12-spoke Kerala bullock-cart teak wheel with forged iron tire rim & iron hub."""
    bm_wood = bmesh.new()
    bm_iron = bmesh.new()
    segs = 28
    # Wooden felloe rim (torus-like segmented wooden ring)
    rim_w = 0.085
    rim_t = 0.075
    for i in range(segs):
        a0 = (i / segs) * math.pi * 2.0
        a1 = ((i + 1) / segs) * math.pi * 2.0
        am = (a0 + a1) * 0.5
        seg_len = 2.0 * wheel_r * math.sin(math.pi / segs) * 1.04
        cy = math.cos(am) * wheel_r
        cz = math.sin(am) * wheel_r
        add_box(bm_wood, (0, cy, cz), (rim_w, seg_len, rim_t), rot=(am + math.pi * 0.5, 0, 0))
        # Forged iron outer tire band
        cy_i = math.cos(am) * (wheel_r + rim_t * 0.52)
        cz_i = math.sin(am) * (wheel_r + rim_t * 0.52)
        add_box(bm_iron, (0, cy_i, cz_i), (rim_w * 0.94, seg_len * 1.02, 0.022), rot=(am + math.pi * 0.5, 0, 0))

    # Central wooden hub + iron hubcap band
    add_cyl(bm_wood, (-0.12, 0, 0), (0.12, 0, 0), 0.125, 0.11, segs=12)
    add_cyl(bm_iron, (-0.135, 0, 0), (0.135, 0, 0), 0.055, 0.055, segs=10)

    # 12 tapered hardwood spokes
    for s in range(12):
        ang = (s / 12.0) * math.pi * 2.0
        p0 = (0, math.cos(ang) * 0.10, math.sin(ang) * 0.10)
        p1 = (0, math.cos(ang) * (wheel_r - 0.03), math.sin(ang) * (wheel_r - 0.03))
        add_cyl(bm_wood, p0, p1, 0.028, 0.021, segs=7)

    w_wood = finalize_mesh(col, f"{name}_Wood", bm_wood, mat_teak, loc=(wheel_x, wheel_y, wheel_r))
    w_iron = finalize_mesh(col, f"{name}_Iron", bm_iron, mat_iron, loc=(wheel_x, wheel_y, wheel_r))
    w_iron.parent = w_wood
    w_iron.location = (0, 0, 0)
    return w_wood


def add_cart_chassis_and_wheels(col, wheel_r=0.72):
    """Builds the shared 18th-century Kerala Kala Vandi teak frame, axle, wheels, draw-poles & yoke."""
    bm_wood = bmesh.new()
    bm_iron = bmesh.new()
    bm_bamboo = bmesh.new()

    bed_z = wheel_r + 0.14  # ~0.86m deck height
    # Heavy axle beam + iron axle pins
    add_box(bm_wood, (0, 0.35, wheel_r), (1.78, 0.14, 0.14))
    add_cyl(bm_iron, (-0.98, 0.35, wheel_r), (0.98, 0.35, wheel_r), 0.035, 0.035, segs=8)

    # Two long teak chassis beams extending forward into twin draw-poles (reaching oxen cleanly in front!)
    for sx in (-0.64, 0.64):
        add_box(bm_wood, (sx, 0.25, bed_z - 0.06), (0.11, 2.55, 0.11))
    # Converging forward draw-poles (vandi-kambu) from cart front (y=-1.0) to yoke bar (y=-2.65)
    for sx in (-1.0, 1.0):
        add_cyl(bm_wood, (sx * 0.62, -0.95, bed_z - 0.06), (sx * 0.16, -2.65, bed_z + 0.18), 0.052, 0.042, segs=8)
    # Central bamboo shaft & carved wooden yoke bar (nukam) at y = -2.65 (sits cleanly across oxen necks!)
    add_cyl(bm_bamboo, (0, -0.95, bed_z - 0.02), (0, -2.68, bed_z + 0.19), 0.045, 0.038, segs=8)
    add_cyl(bm_wood, (-0.92, -2.65, bed_z + 0.22), (0.92, -2.65, bed_z + 0.22), 0.052, 0.052, segs=10)
    for px in (-0.72, -0.24, 0.24, 0.72):
        add_cyl(bm_wood, (px, -2.65, bed_z + 0.22), (px, -2.65, bed_z - 0.02), 0.018, 0.015, segs=6)

    # Wooden deck planks (10 individual slatted teak boards)
    for i in range(10):
        py = -0.88 + i * 0.245
        add_box(bm_wood, (0, py, bed_z + 0.03), (1.42, 0.21, 0.045))

    # Slatted bamboo & teak side guardrails
    for sx in (-0.70, 0.70):
        add_box(bm_wood, (sx, 0.25, bed_z + 0.44), (0.065, 2.35, 0.065))
        add_box(bm_wood, (sx, 0.25, bed_z + 0.24), (0.055, 2.35, 0.055))
        for py in (-0.88, -0.32, 0.24, 0.80, 1.38):
            add_box(bm_wood, (sx, py, bed_z + 0.24), (0.065, 0.065, 0.46))

    # Driver's front wooden footboard seat
    add_box(bm_wood, (0, -1.06, bed_z + 0.18), (1.36, 0.34, 0.055))

    finalize_mesh(col, "Cart_Chassis", bm_wood, mat_hardwood)
    finalize_mesh(col, "Cart_BambooShaft", bm_bamboo, mat_bamboo)
    finalize_mesh(col, "Cart_IronParts", bm_iron, mat_iron)

    # Left & Right 12-spoke wheels
    build_spoked_wheel(col, "Wheel_L", -0.88, 0.35, wheel_r)
    build_spoked_wheel(col, "Wheel_R",  0.88, 0.35, wheel_r)
    return bed_z


def add_palla_canopy(col, bed_z):
    """Authentic Kerala arched woven-bamboo & palm-thatch Palla hood canopy over the bullock cart."""
    bm_palla = bmesh.new()
    bm_ribs = bmesh.new()
    bm_coir = bmesh.new()

    y_front = -0.92
    y_back = 1.48
    arch_segs = 18
    len_segs = 10
    half_w = 0.78
    arch_h = 1.12
    base_z = bed_z + 0.42

    # Build double-sided arched woven-bamboo Palla shell
    rings = []
    for iy in range(len_segs + 1):
        ty = iy / len_segs
        y = y_front + (y_back - y_front) * ty
        # Traditional Kerala Palla flares slightly wider & higher at the front overhang!
        flare = 1.0 + 0.06 * math.cos(ty * math.pi)
        ring = []
        for ia in range(arch_segs + 1):
            ang = (ia / arch_segs) * math.pi  # 0 (right) -> PI (left)
            x = math.cos(ang) * half_w * flare
            z = base_z + math.sin(ang) * arch_h * flare
            ring.append(bm_palla.verts.new((x, y, z)))
        rings.append(ring)

    for iy in range(len_segs):
        for ia in range(arch_segs):
            bm_palla.faces.new((rings[iy][ia], rings[iy][ia + 1], rings[iy + 1][ia + 1], rings[iy + 1][ia]))

    # Curved split-bamboo structural hoop ribs along the inside/outside of the Palla
    for ry in (-0.88, -0.30, 0.28, 0.86, 1.44):
        for ia in range(arch_segs):
            a0 = (ia / arch_segs) * math.pi
            a1 = ((ia + 1) / arch_segs) * math.pi
            p0 = (math.cos(a0) * (half_w + 0.025), ry, base_z + math.sin(a0) * (arch_h + 0.025))
            p1 = (math.cos(a1) * (half_w + 0.025), ry, base_z + math.sin(a1) * (arch_h + 0.025))
            add_cyl(bm_ribs, p0, p1, 0.022, 0.022, segs=6)

    # Rear half-curtain woven screen & coir tie-down ropes
    add_box(bm_coir, (0, y_back - 0.02, base_z + 0.36), (1.36, 0.03, 0.68))

    palla_obj = finalize_mesh(col, "Cart_Palla_Canopy", bm_palla, mat_palla_mat)
    # Give Palla realistic woven thickness
    sol = palla_obj.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = 0.038
    sol.offset = 0.0
    bpy.context.view_layer.objects.active = palla_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")

    finalize_mesh(col, "Cart_Palla_Ribs", bm_ribs, mat_bamboo)
    finalize_mesh(col, "Cart_Palla_BackScreen", bm_coir, mat_thatch)


def add_cart_cargo(col, bed_z, covered=True):
    """Adds authentic Kerala jute grain sacks, coconuts & hanging brass lantern."""
    bm_jute = bmesh.new()
    bm_coco = bmesh.new()
    bm_brass = bmesh.new()

    # Stacked jute rice/spice sacks inside the cart bed
    sacks = [(-0.28, 0.15, 0.22), (0.28, 0.18, 0.22), (0.0, 0.68, 0.22)]
    if not covered:
        sacks += [(-0.26, 0.72, 0.22), (0.26, 0.72, 0.22), (0.0, 0.32, 0.48)]
    for sx, sy, sz in sacks:
        add_sphere(bm_jute, (sx, sy, bed_z + sz), 0.28, 0.36, 0.19, segs=10, rings=7)

    # Pile of fresh green coconuts at the back
    for c in range(7):
        ang = (c / 7.0) * math.pi * 2.0
        add_sphere(bm_coco, (math.cos(ang) * 0.24, 1.08 + math.sin(ang) * 0.16, bed_z + 0.18), 0.11, 0.12, 0.11, segs=8, rings=6)

    # Traditional hanging brass oil lantern beneath the rear axle
    add_cyl(bm_brass, (0, 1.44, bed_z - 0.06), (0, 1.44, bed_z - 0.30), 0.065, 0.08, segs=8)

    finalize_mesh(col, "Cart_CargoSacks", bm_jute, mat_jute)
    finalize_mesh(col, "Cart_Coconuts", bm_coco, mat_coconut)
    finalize_mesh(col, "Cart_BrassLantern", bm_brass, mat_brass)


# ------------------------------------------------------------------------------
# 3. Vehicle Builders (3 Complete 18th-Century Kerala Vehicles)
# ------------------------------------------------------------------------------
def build_kerala_bullock_cart_palla():
    col = reset_collection("kerala_bullock_cart_palla")
    bed_z = add_cart_chassis_and_wheels(col, wheel_r=0.72)
    add_palla_canopy(col, bed_z)
    add_cart_cargo(col, bed_z, covered=True)
    return col


def build_kerala_bullock_cart_cargo():
    col = reset_collection("kerala_bullock_cart_cargo")
    bed_z = add_cart_chassis_and_wheels(col, wheel_r=0.72)
    add_cart_cargo(col, bed_z, covered=False)
    return col


def build_kerala_pallakku():
    """Traditional 18th-century Kerala Pallakku / Manchal (royal/landlord covered palanquin)."""
    col = reset_collection("kerala_pallakku")
    bm_wood = bmesh.new()
    bm_cloth = bmesh.new()
    bm_brass = bmesh.new()
    bm_bamboo = bmesh.new()

    # Carved teak carriage box
    add_box(bm_wood, (0, 0, 0.46), (1.05, 1.72, 0.12))
    for sx in (-0.49, 0.49):
        add_box(bm_wood, (sx, 0, 0.68), (0.06, 1.66, 0.34))
        for sy in (-0.78, 0.78):
            add_cyl(bm_wood, (sx, sy, 0.50), (sx, sy, 1.42), 0.032, 0.028, segs=8)

    # Arched royal crimson-cloth canopy roof with brass finials
    add_sphere(bm_cloth, (0, 0, 1.42), 0.58, 0.94, 0.24, segs=14, rings=8)
    for sx in (-0.52, 0.52):
        add_box(bm_cloth, (sx, 0, 1.12), (0.04, 1.56, 0.52))
    for sy in (-0.86, 0.86):
        add_sphere(bm_brass, (0, sy, 1.66), 0.055, 0.055, 0.08, segs=8, rings=6)

    # Long curved bamboo carrying poles extending front & back for palanquin bearers
    add_cyl(bm_bamboo, (0, -2.55, 1.06), (0, -0.82, 0.94), 0.042, 0.046, segs=8)
    add_cyl(bm_bamboo, (0,  0.82, 0.94), (0,  2.55, 1.06), 0.046, 0.042, segs=8)
    add_cyl(bm_brass,  (0, -2.56, 1.06), (0, -2.44, 1.05), 0.048, 0.048, segs=8)
    add_cyl(bm_brass,  (0,  2.44, 1.05), (0,  2.56, 1.06), 0.048, 0.048, segs=8)

    finalize_mesh(col, "Pallakku_Wood", bm_wood, mat_teak)
    finalize_mesh(col, "Pallakku_Canopy", bm_cloth, mat_crimson)
    finalize_mesh(col, "Pallakku_Brass", bm_brass, mat_brass)
    finalize_mesh(col, "Pallakku_Poles", bm_bamboo, mat_bamboo)
    return col


# ------------------------------------------------------------------------------
# 4. Build & Export All 3 Kerala Vehicles
# ------------------------------------------------------------------------------
BUILDERS = [
    (build_kerala_bullock_cart_palla, -5.0),
    (build_kerala_bullock_cart_cargo,  0.0),
    (build_kerala_pallakku,            5.0),
]

if AUTO_EXPORT:
    os.makedirs(EXPORT_DIR, exist_ok=True)

for builder_fn, preview_x in BUILDERS:
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

bpy.ops.object.select_all(action="DESELECT")
print(f"Done! All {len(BUILDERS)} Kerala bullock carts (with Palla) & Pallakku exported to {EXPORT_DIR}.")
