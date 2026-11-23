import bpy
import bmesh
import math
import os
from mathutils import Vector

# ==============================================================================
# KALIYUGHAM — Standalone Kerala Cloth Library Generator (Blender -> GLB)
# ==============================================================================
# Generates 8 separate, reusable, cloth-physics-ready PBR GLB files into:
#   /Users/vishnuk/Documents/project/game/public/models/cloths/
#
# Every cloth mesh includes:
#   - Evenly subdivided quad topology for smooth cloth deformation
#   - Authentic 512x512 handloom Kerala cotton / Kasavu / Kalli PBR textures
#   - Blender "Pin" Vertex Group + pre-configured Cotton Cloth modifier
#   - Exported Vertex Color "ClothPin" (COLOR_0) so Three.js clothPhysics.ts
#     anchors pinned edges (R=1.0) and flows free hems/tails (R=0.0) on GPU
#
# Usage in Blender:
#   Open this script in the Scripting tab and click Run Script (▶).
#   All 8 standalone GLB files will be exported automatically!
# ==============================================================================

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/cloths"
SAVE_BLEND_LIBRARY = True
BLEND_LIBRARY_PATH = "/Users/vishnuk/Documents/project/game/public/models/cloths/kerala_cloths_library.blend"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablock in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(datablock):
            if item.users == 0:
                datablock.remove(item)


# ------------------------------------------------------------------------------
# 1. Procedural 512x512 Handloom Kerala Cloth PBR Textures
# ------------------------------------------------------------------------------
def make_kerala_cloth_material(name: str, style: str):
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    size = 512
    img = bpy.data.images.new(f"Tex_{name}", width=size, height=size, alpha=False)
    px = [0.0] * (size * size * 4)

    for y in range(size):
        v = y / float(size - 1)
        for x in range(size):
            u = x / float(size - 1)
            # Subtle cotton handloom warp/weft grain
            weave = ((math.sin(x * 1.45) * 0.5 + math.cos(y * 1.45) * 0.5) * 0.018)
            slub = math.sin(x * 0.13 + math.sin(y * 0.07) * 2.0) * 0.008

            if style == "kasavu_cream":
                r, g, b = 0.89, 0.85, 0.74
                # Traditional golden Kasavu border + thin kara stripe near bottom hem (v < 0.16)
                if 0.04 <= v <= 0.12:
                    shimmer = 0.05 * math.sin(x * 0.9 + y * 0.5)
                    r, g, b = 0.78 + shimmer, 0.62 + shimmer * 0.8, 0.24
                elif 0.125 <= v <= 0.145 or 0.025 <= v <= 0.036:
                    r, g, b = 0.52, 0.14, 0.10
            elif style == "kasavu_royal":
                r, g, b = 0.92, 0.88, 0.78
                if 0.03 <= v <= 0.15:
                    shimmer = 0.06 * math.sin(x * 1.1 + y * 0.6)
                    r, g, b = 0.83 + shimmer, 0.66 + shimmer * 0.8, 0.22
                elif 0.155 <= v <= 0.175:
                    r, g, b = 0.58, 0.11, 0.09
            elif style == "thorthu_cream":
                r, g, b = 0.84, 0.79, 0.69
                # Subtle woven end-stripes (kalli kara) near both ends
                if v < 0.09 or v > 0.91:
                    if (int(v * 90) % 2) == 0:
                        r, g, b = 0.55, 0.20, 0.15
                elif 0.10 <= v <= 0.115 or 0.885 <= v <= 0.90:
                    r, g, b = 0.68, 0.54, 0.30
            elif style == "kalli_blue":
                # Classic Kerala handloom blue/ochre checkered Kalli Mundu
                r, g, b = 0.24, 0.34, 0.44
                cx = (x % 64) / 64.0
                cy = (y % 64) / 64.0
                if 0.44 < cx < 0.56 or 0.44 < cy < 0.56:
                    r, g, b = 0.72, 0.56, 0.30
                elif 0.18 < cx < 0.26 or 0.18 < cy < 0.26:
                    r, g, b = 0.16, 0.22, 0.30
            elif style == "sash_crimson":
                r, g, b = 0.58, 0.11, 0.09
                if u < 0.08 or u > 0.92:
                    r, g, b = 0.80, 0.62, 0.22
                elif v < 0.08:
                    r, g, b = 0.84, 0.68, 0.28
            elif style == "temple_kodi":
                # Traditional saffron-vermilion temple festival cloth with gold border
                r, g, b = 0.82, 0.24, 0.09
                if v < 0.08 or v > 0.92 or u > 0.93:
                    r, g, b = 0.88, 0.68, 0.20
                elif 0.42 < v < 0.58 and 0.22 < u < 0.68:
                    # Subtle sacred gold medallion band
                    r, g, b = 0.86, 0.56, 0.16
            elif style == "market_awning":
                # Handloom striped rust & unbleached cotton canopy
                stripe = int(u * 10) % 2
                if stripe == 0:
                    r, g, b = 0.66, 0.27, 0.17
                else:
                    r, g, b = 0.85, 0.78, 0.64
                if v < 0.07:
                    r, g, b = 0.38, 0.18, 0.12
            else:  # hanging_laundry (indigo-terracotta sari/mundu)
                r, g, b = 0.76, 0.42, 0.28
                if v < 0.12 or v > 0.88:
                    r, g, b = 0.84, 0.72, 0.44

            idx = (y * size + x) * 4
            px[idx] = max(0.0, min(1.0, r + weave + slub))
            px[idx + 1] = max(0.0, min(1.0, g + weave + slub))
            px[idx + 2] = max(0.0, min(1.0, b + weave + slub))
            px[idx + 3] = 1.0

    img.pixels.foreach_set(px)
    img.pack()

    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    tex_node = nt.nodes.new("ShaderNodeTexImage")
    tex_node.image = img
    tex_node.location = (-340, 260)
    nt.links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])

    bsdf.inputs["Roughness"].default_value = 0.88
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.28
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.18
    mat.use_backface_culling = False
    return mat


# ------------------------------------------------------------------------------
# 2. Cloth Mesh Helpers (Pin Vertex Group + COLOR_0 + Blender Cloth Modifier)
# ------------------------------------------------------------------------------
def finalize_cloth_object(obj, mat, pin_weights, phase_weights=None):
    """
    Applies:
      1. Smooth shading & PBR handloom material
      2. Blender 'Pin' vertex group (for Blender Cloth simulation)
      3. Exported vertex color 'ClothPin' (COLOR_0) for Three.js GPU cloth physics:
         R = pin weight (1.0 = anchored, 0.0 = free)
         G = phase offset (0..1)
         B = secondary flutter weight (0..1)
      4. Pre-configured Cotton Cloth modifier (disabled on export so rest pose exports cleanly)
    """
    mesh = obj.data
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True

    # 1) Blender Vertex Group "Pin"
    vg = obj.vertex_groups.new(name="Pin")
    for idx, w in enumerate(pin_weights):
        if w > 0.001:
            vg.add([idx], float(w), "REPLACE")

    # 2) Vertex Color attribute "ClothPin" (exported as COLOR_0 in GLB)
    if hasattr(mesh, "color_attributes"):
        col_attr = mesh.color_attributes.new(
            name="ClothPin", type="BYTE_COLOR", domain="CORNER"
        )
        for poly in mesh.polygons:
            for loop_idx in poly.loop_indices:
                v_idx = mesh.loops[loop_idx].vertex_index
                pin_w = max(0.0, min(1.0, pin_weights[v_idx]))
                ph = (
                    max(0.0, min(1.0, phase_weights[v_idx]))
                    if phase_weights is not None
                    else 0.5
                )
                flutter = 1.0 - pin_w
                col_attr.data[loop_idx].color = (pin_w, ph, flutter, 1.0)

    # 3) Attach a realistic Cotton Cloth modifier for Blender artist workflow
    #    (keep show_viewport=False during GLB export so clean rest mesh is written)
    mod = obj.modifiers.new(name="KeralaCottonCloth", type="CLOTH")
    settings = mod.settings
    settings.mass = 0.24  # light handloom cotton (kg/m^2)
    settings.air_damping = 1.4
    settings.tension_stiffness = 14.0
    settings.compression_stiffness = 10.0
    settings.shear_stiffness = 12.0
    settings.bending_stiffness = 0.45
    settings.vertex_group_mass = "Pin"
    if hasattr(mod, "collision_settings"):
        mod.collision_settings.use_collision = True
        mod.collision_settings.distance_min = 0.012
    mod.show_viewport = False
    mod.show_render = False
    return obj


def build_grid_cloth(
    name: str,
    mat,
    segs_u: int,
    segs_v: int,
    pos_fn,
    pin_fn,
    phase_fn=None,
):
    """Creates a clean, evenly subdivided quad cloth mesh from parametric functions."""
    mesh = bpy.data.meshes.new(f"Mesh_{name}")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    grid = []
    pin_weights = []
    phase_weights = []

    for iv in range(segs_v + 1):
        v = iv / float(segs_v)
        row = []
        for iu in range(segs_u + 1):
            u = iu / float(segs_u)
            co = pos_fn(u, v)
            vert = bm.verts.new(co)
            row.append(vert)
            pin_weights.append(pin_fn(u, v))
            phase_weights.append(phase_fn(u, v) if phase_fn else u)
        grid.append(row)

    bm.verts.ensure_lookup_table()
    for iv in range(segs_v):
        for iu in range(segs_u):
            v00 = grid[iv][iu]
            v10 = grid[iv][iu + 1]
            v11 = grid[iv + 1][iu + 1]
            v01 = grid[iv + 1][iu]
            face = bm.faces.new((v00, v10, v11, v01))
            u0 = iu / float(segs_u)
            u1 = (iu + 1) / float(segs_u)
            v0 = iv / float(segs_v)
            v1 = (iv + 1) / float(segs_v)
            uvs = ((u0, v0), (u1, v0), (u1, v1), (u0, v1))
            for loop, uv in zip(face.loops, uvs):
                loop[uv_layer].uv = uv

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()

    return finalize_cloth_object(obj, mat, pin_weights, phase_weights)


def build_cylinder_wrap_cloth(
    name: str,
    mat,
    segs_u: int,
    segs_v: int,
    radius_top: float,
    radius_bottom: float,
    length: float,
    pleat_amp: float = 0.014,
):
    """
    Creates a cylindrical pleated mundu wrap (origin at waist center, hanging down -Z).
    Top 15% waistband is pinned (R=1.0), lower hem flows freely (R=0.0).
    """
    def pos_fn(u, v):
        # v=0 at bottom hem, v=1 at waist
        angle = u * math.pi * 2.0
        rad = radius_bottom + (radius_top - radius_bottom) * v
        # Front overlap pleat + subtle natural cotton drape ripples
        pleat = pleat_amp * (1.0 - v) * (
            math.sin(angle * 7.0) * 0.55 + math.cos(angle * 11.0) * 0.35
        )
        # Slight oval cross-section matching human hips (wider in X, slimmer in Y)
        rx = (rad * 1.12 + pleat) * math.cos(angle)
        ry = (rad * 0.90 + pleat) * math.sin(angle)
        z = -(1.0 - v) * length
        return Vector((rx, ry, z))

    def pin_fn(u, v):
        if v >= 0.86:
            return 1.0
        # Smooth ease from waist down to knee/ankle
        t = max(0.0, (v - 0.15) / 0.71)
        return t * t

    return build_grid_cloth(name, mat, segs_u, segs_v, pos_fn, pin_fn, lambda u, v: u)


# ------------------------------------------------------------------------------
# 3. Eight Standalone Kerala Cloth Assets
# ------------------------------------------------------------------------------
def create_thorthu_shoulder():
    """Folded cotton Thorthu draped over a shoulder (origin at shoulder apex)."""
    mat = make_kerala_cloth_material("Mat_Thorthu_Cream", "thorthu_cream")

    def pos_fn(u, v):
        # u: width across shoulder (-0.11..+0.11m), v: 0=back tail, 0.5=shoulder top, 1=front tail
        x = (u - 0.5) * 0.22
        arc = (v - 0.5) * 2.0  # -1..+1
        # Arch smoothly over shoulder, hang down front (+Y) and back (-Y)
        if abs(arc) < 0.25:
            ang = (arc / 0.25) * (math.pi * 0.5)
            y = math.sin(ang) * 0.10
            z = math.cos(ang) * 0.045 - 0.045
        else:
            sign = 1.0 if arc > 0 else -1.0
            drop = (abs(arc) - 0.25) / 0.75
            y = sign * (0.10 + drop * 0.025)
            z = -0.045 - drop * 0.44
        # Gentle cloth fold along width
        fold = math.sin(u * math.pi * 3.0) * 0.008 * abs(arc)
        return Vector((x, y + fold, z))

    def pin_fn(u, v):
        dist = abs(v - 0.5) * 2.0
        return max(0.0, min(1.0, 1.0 - (dist / 0.55)))

    return build_grid_cloth("Cloth_Thorthu_Shoulder", mat, 10, 28, pos_fn, pin_fn)


def create_melmundu_kasavu():
    """Wider royal Kasavu Melmundu shawl draped over shoulder & torso."""
    mat = make_kerala_cloth_material("Mat_Melmundu_Royal", "kasavu_royal")

    def pos_fn(u, v):
        x = (u - 0.5) * 0.34
        arc = (v - 0.5) * 2.0
        if abs(arc) < 0.22:
            ang = (arc / 0.22) * (math.pi * 0.5)
            y = math.sin(ang) * 0.12
            z = math.cos(ang) * 0.05 - 0.05
        else:
            sign = 1.0 if arc > 0 else -1.0
            drop = (abs(arc) - 0.22) / 0.78
            y = sign * (0.12 + drop * 0.035)
            z = -0.05 - drop * 0.58
        pleat = math.sin(u * math.pi * 5.0) * 0.011 * abs(arc)
        return Vector((x, y + pleat, z))

    def pin_fn(u, v):
        dist = abs(v - 0.5) * 2.0
        return max(0.0, min(1.0, 1.0 - (dist / 0.50)))

    return build_grid_cloth("Cloth_Melmundu_Kasavu", mat, 14, 32, pos_fn, pin_fn)


def create_kacha_sash_tail():
    """Crimson-gold Kalari / Nair Guard waist sash hanging tail (origin at waist knot)."""
    mat = make_kerala_cloth_material("Mat_Kacha_Crimson", "sash_crimson")

    def pos_fn(u, v):
        # v=1 at knot (pinned), v=0 at bottom hem (free)
        drop = 1.0 - v
        width = 0.07 + drop * 0.065  # flares slightly toward hem
        x = (u - 0.5) * width
        y = 0.02 + math.sin(drop * 2.2) * 0.018 + math.sin(u * math.pi * 3.0) * 0.006 * drop
        z = -drop * 0.48
        return Vector((x, y, z))

    def pin_fn(u, v):
        return max(0.0, min(1.0, (v - 0.72) / 0.28))

    return build_grid_cloth("Cloth_Kacha_Sash_Tail", mat, 8, 22, pos_fn, pin_fn)


def create_mundu_kasavu():
    """Full-length pleated Kasavu Mundu (origin at waist, hangs 0.92m down)."""
    mat = make_kerala_cloth_material("Mat_Mundu_Kasavu", "kasavu_cream")
    return build_cylinder_wrap_cloth(
        "Cloth_Mundu_Kasavu",
        mat,
        segs_u=36,
        segs_v=20,
        radius_top=0.175,
        radius_bottom=0.225,
        length=0.92,
        pleat_amp=0.014,
    )


def create_mundu_kalli():
    """Checkered knee-length rural Kalli Mundu (origin at waist, hangs 0.62m down)."""
    mat = make_kerala_cloth_material("Mat_Mundu_Kalli", "kalli_blue")
    return build_cylinder_wrap_cloth(
        "Cloth_Mundu_Kalli",
        mat,
        segs_u=32,
        segs_v=16,
        radius_top=0.175,
        radius_bottom=0.215,
        length=0.62,
        pleat_amp=0.012,
    )


def create_hanging_laundry():
    """Draped cotton cloth for village clotheslines (origin at top rope center)."""
    mat = make_kerala_cloth_material("Mat_Hanging_Laundry", "hanging_laundry")

    def pos_fn(u, v):
        # u: width along rope (-0.42..+0.42m), v: 0=back bottom, 0.5=rope top, 1=front bottom
        x = (u - 0.5) * 0.84
        sag = -math.sin(u * math.pi) * 0.045  # natural clothesline sag
        arc = (v - 0.5) * 2.0
        if abs(arc) < 0.12:
            ang = (arc / 0.12) * (math.pi * 0.5)
            y = math.sin(ang) * 0.022
            z = math.cos(ang) * 0.022 - 0.022 + sag
        else:
            sign = 1.0 if arc > 0 else -1.0
            drop = (abs(arc) - 0.12) / 0.88
            y = sign * (0.022 + drop * 0.015) + math.sin(u * math.pi * 4.0) * 0.018 * drop
            z = -0.022 - drop * 0.82 + sag
        return Vector((x, y, z))

    def pin_fn(u, v):
        dist = abs(v - 0.5) * 2.0
        return 1.0 if dist < 0.14 else max(0.0, 1.0 - (dist - 0.14) / 0.25)

    return build_grid_cloth("Cloth_Hanging_Laundry", mat, 18, 24, pos_fn, pin_fn)


def create_market_awning():
    """Striped handloom market stall cloth canopy with scalloped hanging valance."""
    mat = make_kerala_cloth_material("Mat_Market_Awning", "market_awning")

    def pos_fn(u, v):
        # 2.8m wide x 1.9m deep slanted roof canopy, front 18% drops down as swaying valance
        x = (u - 0.5) * 2.8
        if v >= 0.18:
            roof_t = (v - 0.18) / 0.82  # 0=front beam, 1=back beam
            y = (roof_t - 0.5) * 1.9
            # Gentle fabric catenary sag between poles
            sag = -math.sin(u * math.pi) * math.sin(roof_t * math.pi) * 0.09
            z = roof_t * 0.36 + sag
        else:
            drop = (0.18 - v) / 0.18
            y = -0.95
            scallop = math.sin(u * math.pi * 6.0) * 0.03 * drop
            z = -drop * 0.34 + scallop
        return Vector((x, y, z))

    def pin_fn(u, v):
        # Pin along back beam (v>0.94), front beam (0.16..0.24), and side rails
        if v > 0.94 or (0.16 <= v <= 0.24):
            return 1.0
        if v > 0.24 and (u < 0.05 or u > 0.95):
            return 1.0
        if v < 0.16:
            return max(0.0, v / 0.16)
        # Center of roof canopy has slight billow freedom (pin ~0.35)
        edge_dist = min(u, 1.0 - u, (v - 0.24) / 0.70, (0.94 - v) / 0.70)
        return max(0.30, 1.0 - edge_dist * 2.2)

    return build_grid_cloth("Cloth_Market_Awning", mat, 24, 20, pos_fn, pin_fn)


def create_temple_flag():
    """Saffron-gold Kerala temple Kodi festival flag (origin at top-left pole attachment)."""
    mat = make_kerala_cloth_material("Mat_Temple_Kodi", "temple_kodi")

    def pos_fn(u, v):
        # u=0 at flagpole (pinned), u=1 at free waving tip (1.35m long x 0.72m tall)
        x = u * 1.35
        # Subtle tapered pennant profile
        half_h = 0.36 * (1.0 - u * 0.22)
        z = (v - 0.5) * 2.0 * half_h - 0.36
        # Gentle resting wave
        y = math.sin(u * math.pi * 2.0) * 0.04 * u
        return Vector((x, y, z))

    def pin_fn(u, v):
        return 1.0 if u < 0.04 else max(0.0, 1.0 - (u - 0.04) / 0.18)

    return build_grid_cloth("Cloth_Temple_Flag", mat, 24, 12, pos_fn, pin_fn)


MASTER_MIXAMO_CANDIDATES = [
    "/Users/vishnuk/Documents/project/game/public/models/npcs/mixamo/farmer_man_mixamo.fbx",
    "/Users/vishnuk/Documents/project/game/public/models/npcs/mixamo/karyasthan_mixamo.fbx",
    "/Users/vishnuk/Documents/project/game/public/models/npcs/mixamo/landlord_mixamo.fbx",
]


def export_single_glb(obj, filepath: str):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_attributes=True,
        export_materials="EXPORT",
    )


def export_skinned_cloth_glb(cloth_obj, arm_obj, filepath: str):
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    cloth_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_attributes=True,
        export_materials="EXPORT",
        export_skins=True,
        export_animations=False,
    )


def build_and_export_skinned_mundus():
    """
    RDR2 / GTA V Modular Skinned-Cloth Pipeline:
    Imports one master Mixamo FBX rig, fits 3 swappable Kerala Mundu garments
    around the master body's exact waist/hip/leg dimensions, transfers skeletal
    bone weights from the master mesh via DATA_TRANSFER, and exports each as a
    skinned GLB with mixamorig bone weights + ClothPin hem physics weights.
    """
    master_fbx = next((p for p in MASTER_MIXAMO_CANDIDATES if os.path.exists(p)), None)
    if not master_fbx:
        print("Skipping skinned Mundu exports: no master Mixamo FBX found.")
        return []

    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=master_fbx, automatic_bone_orientation=False)
    imported = [o for o in bpy.data.objects if o not in before]

    arm_obj = next((o for o in imported if o.type == "ARMATURE"), None)
    donor_meshes = [o for o in imported if o.type == "MESH" and len(o.data.vertices) > 200]
    if not arm_obj or not donor_meshes:
        print("Skipping skinned Mundu exports: master FBX lacked armature or donor mesh.")
        for o in imported:
            bpy.data.objects.remove(o, do_unlink=True)
        return []

    donor_obj = max(donor_meshes, key=lambda o: len(o.data.vertices))
    bpy.context.view_layer.update()

    # Measure donor body in world space
    mw_d = donor_obj.matrix_world
    verts_w = [mw_d @ v.co for v in donor_obj.data.vertices]
    min_z = min(p.z for p in verts_w)
    max_z = max(p.z for p in verts_w)
    height = max(0.5, max_z - min_z)

    # Locate exact Mixamo Hips bone height in world space
    hips_bone = next((b for b in arm_obj.data.bones if "hips" in b.name.lower()), None)
    if hips_bone:
        hips_w = arm_obj.matrix_world @ hips_bone.head_local
        cx, cy, hips_z = hips_w.x, hips_w.y, hips_w.z
    else:
        cx = (min(p.x for p in verts_w) + max(p.x for p in verts_w)) * 0.5
        cy = (min(p.y for p in verts_w) + max(p.y for p in verts_w)) * 0.5
        hips_z = min_z + height * 0.53

    waist_z = hips_z + height * 0.032
    full_len = max(0.4, waist_z - (min_z + height * 0.055))
    short_len = max(0.3, waist_z - (min_z + height * 0.285))

    # Measure donor hip cross-section radii so the Mundu clears thighs cleanly
    hip_slice = [p for p in verts_w if abs(p.z - hips_z) < height * 0.045]
    if hip_slice:
        rx_top = max(height * 0.095, (max(p.x for p in hip_slice) - min(p.x for p in hip_slice)) * 0.5 + height * 0.016)
        ry_top = max(height * 0.075, (max(p.y for p in hip_slice) - min(p.y for p in hip_slice)) * 0.5 + height * 0.016)
    else:
        rx_top = height * 0.115
        ry_top = height * 0.092

    specs = [
        ("cloth_mundu_kasavu_skinned.glb", "Cloth_Mundu_Kasavu_Skinned", "Mat_Mundu_Kasavu_Skinned", "kasavu_cream", full_len, 1.24, 36, 24),
        ("cloth_mundu_kalli_skinned.glb", "Cloth_Mundu_Kalli_Skinned", "Mat_Mundu_Kalli_Skinned", "kalli_blue", full_len, 1.22, 36, 24),
        ("cloth_mundu_folded_skinned.glb", "Cloth_Mundu_Folded_Skinned", "Mat_Mundu_Folded_Skinned", "kalli_blue", short_len, 1.16, 32, 18),
    ]

    exported_skinned = []
    for filename, obj_name, mat_name, style, length, flare, segs_u, segs_v in specs:
        mat = make_kerala_cloth_material(mat_name, style)
        rx_bot = rx_top * flare
        ry_bot = ry_top * flare

        def make_pos_fn(l_val, rxt, ryt, rxb, ryb):
            def pos_fn(u, v):
                ang = u * math.pi * 2.0
                rx = rxb + (rxt - rxb) * v
                ry = ryb + (ryt - ryb) * v
                pleat = 0.010 * (1.0 - v) * (math.sin(ang * 7.0) * 0.55 + math.cos(ang * 11.0) * 0.35)
                x = cx + (rx + pleat) * math.cos(ang)
                y = cy + (ry + pleat) * math.sin(ang)
                z = waist_z - (1.0 - v) * l_val
                return Vector((x, y, z))
            return pos_fn

        def pin_fn(u, v):
            # Skinned upper 65% follows leg bones strictly (pin=1.0); lower 35% hem blends smoothly into GPU wind flutter!
            if v >= 0.38:
                return 1.0
            t = max(0.0, v / 0.38)
            return t * t

        cloth_obj = build_grid_cloth(
            obj_name,
            mat,
            segs_u,
            segs_v,
            make_pos_fn(length, rx_top, ry_top, rx_bot, ry_bot),
            pin_fn,
            lambda u, v: u,
        )

        # Remove Blender Cloth modifier & Pin vgroup before Mixamo bone weight transfer
        # (Three.js GPU physics reads ClothPin from the vertex color attribute!)
        for m in list(cloth_obj.modifiers):
            cloth_obj.modifiers.remove(m)
        if "Pin" in cloth_obj.vertex_groups:
            cloth_obj.vertex_groups.remove(cloth_obj.vertex_groups["Pin"])

        # Transfer Mixamo bone weights from master body mesh -> Mundu mesh
        dt_mod = cloth_obj.modifiers.new(name="TransferMixamoWeights", type="DATA_TRANSFER")
        dt_mod.object = donor_obj
        dt_mod.use_vert_data = True
        dt_mod.data_types_verts = {"VGROUP_WEIGHTS"}
        dt_mod.vert_mapping = "POLYINTERP_NEAREST"
        bpy.ops.object.select_all(action="DESELECT")
        cloth_obj.select_set(True)
        bpy.context.view_layer.objects.active = cloth_obj
        bpy.ops.object.datalayout_transfer(modifier=dt_mod.name)
        bpy.ops.object.modifier_apply(modifier=dt_mod.name)

        # Keep clean 4-bone-per-vertex GPU skinning limits
        bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)

        # Bind cleanly to the master Mixamo Armature
        cloth_obj.parent = arm_obj
        cloth_obj.matrix_parent_inverse = arm_obj.matrix_world.inverted()
        arm_mod = cloth_obj.modifiers.new(name="Armature", type="ARMATURE")
        arm_mod.object = arm_obj
        bpy.context.view_layer.update()

        out_path = os.path.join(EXPORT_DIR, filename)
        export_skinned_cloth_glb(cloth_obj, arm_obj, out_path)
        exported_skinned.append(out_path)

        bpy.data.objects.remove(cloth_obj, do_unlink=True)

    # Clean up temporary master rig so the .blend library stays clean
    for o in imported:
        if o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)

    return exported_skinned


def main():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    clear_scene()

    builders = [
        ("cloth_thorthu_shoulder.glb", create_thorthu_shoulder, (0.0, 0.0, 0.0)),
        ("cloth_melmundu_kasavu.glb", create_melmundu_kasavu, (1.0, 0.0, 0.0)),
        ("cloth_kacha_sash_tail.glb", create_kacha_sash_tail, (2.0, 0.0, 0.0)),
        ("cloth_mundu_kasavu.glb", create_mundu_kasavu, (3.2, 0.0, 0.0)),
        ("cloth_mundu_kalli.glb", create_mundu_kalli, (4.4, 0.0, 0.0)),
        ("cloth_hanging_laundry.glb", create_hanging_laundry, (0.0, 2.2, 0.0)),
        ("cloth_market_awning.glb", create_market_awning, (2.6, 2.2, 0.0)),
        ("cloth_temple_flag.glb", create_temple_flag, (5.2, 2.2, 0.0)),
    ]

    exported = []
    for filename, fn, preview_pos in builders:
        obj = fn()
        # Export centered at world origin (0,0,0) so attachments are exact
        obj.location = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()
        out_path = os.path.join(EXPORT_DIR, filename)
        export_single_glb(obj, out_path)
        exported.append(out_path)
        # Move into neat gallery row for the .blend library preview
        obj.location = preview_pos

    # Export RDR2-style modular skinned Mundu GLBs weighted to the master Mixamo rig
    exported.extend(build_and_export_skinned_mundus())

    if SAVE_BLEND_LIBRARY:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_LIBRARY_PATH)
        print(f"Saved cloth library .blend -> {BLEND_LIBRARY_PATH}")

    print(f"Exported {len(exported)} standalone Kerala cloth GLBs into {EXPORT_DIR}:")
    for p in exported:
        print(f"  - {os.path.basename(p)}")


if __name__ == "__main__":
    main()
