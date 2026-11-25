import bpy
import bmesh
import math
import os
import random
from mathutils import Vector, Matrix

# ==============================================================================
# KALIYUGHAM — 18th-Century Pre-British Kerala Class-Based Houses, Grand Mana,
#              Veli (വേലി) Fences & Veettu Parisaram Props (Blender -> GLB)
# ==============================================================================
# Generates 12 historically authentic, richly textured GLB assets into:
#   /Users/vishnuk/Documents/project/game/public/models/houses/
#
# Social-Class Architecture (Pre-British ~1780s-1790s — NO Mangalore tiles!):
#   1. mana_nalukettu.glb     — Upper-class Landlord Grand Mana (4-wing Nalukettu
#                               with open Nadumuttam courtyard, Thulasithara,
#                               pillared Poomukham + Charupadi, 2nd-story Malika,
#                               weathered teak Marappalaka shingled roofs)
#   2. mana_padippura.glb     — Grand roofed Mana compound gateway (Padippura)
#   3. mana_pathayapura.glb   — Estate timber-and-laterite paddy granary
#   4. tharavadu_ekasala.glb  — Middle-class Nair Tharavadu / Ekasala house
#   5. artisan_veedu.glb      — Middle-lower Artisan L-shaped Idanila Veedu
#   6. farmer_chala.glb       — Working-class Farmer mud-wall & Ola-thatch Chala
#   7. laborer_kudil.glb      — Humble Laborer woven-bamboo & thatch Kudil
#   8. veli_kayyala_wall.glb  — Laterite-and-mud Kayyala boundary wall w/ Ola cap
#   9. veli_olaveli_fence.glb — Woven coconut-palm & bamboo Olaveli/Mulaveli fence
#  10. veli_gate_padavetti.glb— Rural compound bamboo-and-laterite entrance gate
#  11. prop_thulasithara.glb  — Courtyard sacred Thulasithara (Tulsi pedestal)
#  12. prop_kerala_kinar.glb  — Courtyard red-laterite Kinar well w/ pulley
#
# Usage in Blender:
#   Open this script in Blender's Scripting tab and click Run Script (▶).
# ==============================================================================

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/houses"
SAVE_BLEND_LIBRARY = True
BLEND_LIBRARY_PATH = "/Users/vishnuk/Documents/project/game/public/models/houses/kerala_houses_library.blend"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablock in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(datablock):
            if item.users == 0:
                datablock.remove(item)


# ------------------------------------------------------------------------------
# 1. Procedural 512x512 Pre-British Kerala PBR Material Library
# ------------------------------------------------------------------------------
def make_pbr_material(name: str, kind: str):
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    size = 512
    img = bpy.data.images.new(f"Tex_{name}", width=size, height=size, alpha=False)
    px = [0.0] * (size * size * 4)
    rng = random.Random(hash(kind) & 0xFFFF)

    roughness = 0.88
    metallic = 0.0

    for y in range(size):
        v = y / float(size - 1)
        for x in range(size):
            u = x / float(size - 1)
            n1 = math.sin(u * 28.0 + math.cos(v * 22.0) * 1.4) * 0.5
            n2 = math.cos(u * 61.0 - v * 53.0) * 0.5
            grain = (rng.random() - 0.5) * 0.04

            if kind == "laterite":
                # Kerala red laterite stone blocks (Vettukallu) with porous iron-rich pits
                row = int(v * 8)
                col = int((u * 4) + (0.5 if row % 2 else 0.0))
                fy = (v * 8) % 1.0
                fx = ((u * 4) + (0.5 if row % 2 else 0.0)) % 1.0
                mortar = fy < 0.06 or fx < 0.04
                if mortar:
                    r, g, b = 0.36, 0.25, 0.19
                else:
                    block_var = math.sin(row * 13.7 + col * 7.3) * 0.045
                    pit = -0.07 if ((n1 * n2) > 0.14) else 0.0
                    r = 0.48 + block_var + pit + grain
                    g = 0.21 + block_var * 0.6 + pit * 0.6 + grain * 0.7
                    b = 0.14 + block_var * 0.4 + pit * 0.4 + grain * 0.5
                roughness = 0.94

            elif kind == "lime_plaster":
                # Traditional shell-lime wash (Chunnambu) with damp monsoon weathering near bottom
                damp = max(0.0, 1.0 - v * 3.8) * 0.12
                mottle = n1 * 0.025 + n2 * 0.015
                r = 0.87 - damp * 0.8 + mottle + grain * 0.6
                g = 0.82 - damp * 0.9 + mottle + grain * 0.6
                b = 0.71 - damp * 1.1 + mottle + grain * 0.6
                roughness = 0.90

            elif kind == "mud_wall":
                # Hand-plastered terracotta/ochre mud cob wall (Cheli / Mannu)
                damp = max(0.0, 1.0 - v * 3.2) * 0.11
                smear = math.sin(u * 16.0 + v * 9.0) * 0.03
                r = 0.58 - damp + smear + grain
                g = 0.40 - damp * 0.85 + smear * 0.7 + grain * 0.8
                b = 0.26 - damp * 0.7 + smear * 0.5 + grain * 0.6
                roughness = 0.95

            elif kind == "bamboo_thatti":
                # Criss-cross woven split-bamboo wall mat (Thatti)
                strip_u = int(u * 24) % 2
                strip_v = int(v * 24) % 2
                fu = (u * 24) % 1.0
                fv = (v * 24) % 1.0
                seam = (fu < 0.09 or fv < 0.09)
                weave_hi = 0.05 if (strip_u == strip_v) else -0.04
                if seam:
                    r, g, b = 0.24, 0.17, 0.10
                else:
                    r = 0.56 + weave_hi + grain
                    g = 0.43 + weave_hi * 0.85 + grain * 0.8
                    b = 0.25 + weave_hi * 0.6 + grain * 0.6
                roughness = 0.90

            elif kind == "teak_dark":
                # Seasoned Malabar teak (Thekku) wood planks with fine dark grain
                plank = (u * 6) % 1.0
                seam = plank < 0.035
                wood_grain = math.sin(u * 90.0 + math.sin(v * 14.0) * 2.5) * 0.03
                if seam:
                    r, g, b = 0.11, 0.06, 0.03
                else:
                    r = 0.25 + wood_grain + grain * 0.6
                    g = 0.14 + wood_grain * 0.65 + grain * 0.5
                    b = 0.075 + wood_grain * 0.4 + grain * 0.4
                roughness = 0.72

            elif kind == "teak_carved":
                # Rich oiled dark rosewood/teak for Mana pillars, Charupadi, Mukhappu & doors
                wood_grain = math.sin(v * 80.0 + math.cos(u * 18.0) * 2.0) * 0.025
                r = 0.21 + wood_grain + grain * 0.5
                g = 0.11 + wood_grain * 0.6 + grain * 0.4
                b = 0.055 + wood_grain * 0.4 + grain * 0.3
                roughness = 0.62

            elif kind == "shingle_roof":
                # Authentic Traditional Kerala Terracotta Clay Odu (ഓട്) Roof Tiles!
                # Overlapping ribbed terracotta tiles with monsoon weathering & subtle dark moss patina
                row = int(v * 16)
                col = int(u * 18)
                fy = (v * 16) % 1.0
                fx = (u * 18) % 1.0
                tile_var = math.sin(row * 11.7 + col * 17.3) * 0.055
                rib_curve = math.sin(fx * math.pi) * 0.09
                overlap_shadow = -0.14 if fy < 0.16 else (0.04 if fy > 0.86 else 0.0)
                channel_shadow = -0.11 if (fx < 0.09 or fx > 0.91) else 0.0
                monsoon_patina = -0.09 if ((n1 + n2) > 0.28 and v < 0.72) else 0.0
                r = 0.56 + tile_var + rib_curve + overlap_shadow + channel_shadow + monsoon_patina + grain * 0.6
                g = 0.24 + tile_var * 0.55 + rib_curve * 0.48 + overlap_shadow * 0.5 + channel_shadow * 0.5 + monsoon_patina * 0.2 + grain * 0.4
                b = 0.14 + tile_var * 0.35 + rib_curve * 0.30 + overlap_shadow * 0.4 + channel_shadow * 0.4 + monsoon_patina * 0.3 + grain * 0.3
                roughness = 0.84

            elif kind == "ola_thatch":
                # Layered woven coconut palm-leaf thatch (Ola)
                tier = (v * 14) % 1.0
                rib = math.sin(u * 160.0 + math.sin(v * 20.0) * 3.0) * 0.045
                tier_lip = -0.09 if tier < 0.14 else 0.0
                r = 0.52 + rib + tier_lip + grain * 0.9
                g = 0.42 + rib * 0.85 + tier_lip * 0.8 + grain * 0.8
                b = 0.24 + rib * 0.55 + tier_lip * 0.6 + grain * 0.6
                roughness = 0.95

            elif kind == "granite_floor":
                # Dark grey-brown traditional Kerala granite / cow-dung-oxide floor (Chanakam)
                r = 0.26 + n1 * 0.03 + grain * 0.7
                g = 0.24 + n1 * 0.03 + grain * 0.7
                b = 0.22 + n1 * 0.025 + grain * 0.6
                roughness = 0.76

            elif kind == "brass":
                r, g, b = 0.82, 0.64, 0.24
                roughness = 0.32
                metallic = 0.88

            elif kind == "tulsi_leaf":
                r = 0.14 + n1 * 0.05 + grain * 0.6
                g = 0.38 + n1 * 0.08 + grain * 0.7
                b = 0.12 + n2 * 0.03 + grain * 0.4
                roughness = 0.78

            else:  # water_well
                r, g, b = 0.07, 0.16, 0.15
                roughness = 0.14

            idx = (y * size + x) * 4
            px[idx] = max(0.0, min(1.0, r))
            px[idx + 1] = max(0.0, min(1.0, g))
            px[idx + 2] = max(0.0, min(1.0, b))
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
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    mat.use_backface_culling = False
    return mat


def get_materials():
    return {
        "laterite": make_pbr_material("Mat_Kerala_Laterite", "laterite"),
        "lime": make_pbr_material("Mat_Kerala_LimePlaster", "lime_plaster"),
        "mud": make_pbr_material("Mat_Kerala_MudWall", "mud_wall"),
        "thatti": make_pbr_material("Mat_Kerala_BambooThatti", "bamboo_thatti"),
        "teak": make_pbr_material("Mat_Kerala_TeakDark", "teak_dark"),
        "carved": make_pbr_material("Mat_Kerala_TeakCarved", "teak_carved"),
        "shingle": make_pbr_material("Mat_Kerala_MarappalakaRoof", "shingle_roof"),
        "ola": make_pbr_material("Mat_Kerala_OlaThatch", "ola_thatch"),
        "floor": make_pbr_material("Mat_Kerala_GraniteFloor", "granite_floor"),
        "brass": make_pbr_material("Mat_Kerala_Brass", "brass"),
        "tulsi": make_pbr_material("Mat_Kerala_TulsiLeaf", "tulsi_leaf"),
        "water": make_pbr_material("Mat_Kerala_WellWater", "water_well"),
    }


# ------------------------------------------------------------------------------
# 2. Clean BMesh Architectural Primitives (with Automatic Box UV Mapping)
# ------------------------------------------------------------------------------
class MeshBuilder:
    def __init__(self, name: str):
        self.name = name
        self.bm = bmesh.new()
        self.uv_layer = self.bm.loops.layers.uv.new("UVMap")
        self.materials = []
        self.mat_idx = {}

    def mat(self, m) -> int:
        if m.name not in self.mat_idx:
            self.mat_idx[m.name] = len(self.materials)
            self.materials.append(m)
        return self.mat_idx[m.name]

    def _assign_face_uv(self, face, uv_scale=0.5):
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in face.loops:
            co = loop.vert.co
            if az >= ax and az >= ay:
                loop[self.uv_layer].uv = (co.x * uv_scale, co.y * uv_scale)
            elif ax >= ay:
                loop[self.uv_layer].uv = (co.y * uv_scale, co.z * uv_scale)
            else:
                loop[self.uv_layer].uv = (co.x * uv_scale, co.z * uv_scale)

    def add_box(self, cx, cy, cz, sx, sy, sz, mat, uv_scale=0.5, rot_x=0.0, rot_y=0.0, rot_z=0.0):
        mi = self.mat(mat)
        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = ret["verts"]
        m_scale = Matrix.Diagonal((sx, sy, sz, 1.0))
        m_rot = Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Rotation(rot_y, 4, "Y") @ Matrix.Rotation(rot_x, 4, "X")
        m_loc = Matrix.Translation((cx, cy, cz))
        xform = m_loc @ m_rot @ m_scale
        bmesh.ops.transform(self.bm, matrix=xform, verts=verts)
        faces = set()
        for v in verts:
            for f in v.link_faces:
                faces.add(f)
        for f in faces:
            f.material_index = mi
            f.normal_update()
            self._assign_face_uv(f, uv_scale)

    def add_cylinder(self, cx, cy, z0, z1, r_bot, r_top, segs, mat, uv_scale=0.6):
        mi = self.mat(mat)
        h = max(0.01, z1 - z0)
        ret = bmesh.ops.create_cone(
            self.bm,
            cap_ends=True,
            cap_tris=False,
            segments=segs,
            radius1=r_bot,
            radius2=r_top,
            depth=h,
        )
        verts = ret["verts"]
        bmesh.ops.transform(self.bm, matrix=Matrix.Translation((cx, cy, (z0 + z1) * 0.5)), verts=verts)
        faces = set()
        for v in verts:
            for f in v.link_faces:
                faces.add(f)
        for f in faces:
            f.material_index = mi
            f.smooth = True
            f.normal_update()
            self._assign_face_uv(f, uv_scale)

    def add_pillar(self, x, y, z0, z1, radius, mats):
        """Traditional Kerala turned wooden pillar with stone base & carved lotus capital."""
        self.add_box(x, y, z0 + 0.09, radius * 2.5, radius * 2.5, 0.18, mats["laterite"], 0.8)
        self.add_cylinder(x, y, z0 + 0.18, z1 - 0.18, radius, radius * 0.84, 10, mats["carved"], 0.8)
        self.add_box(x, y, z1 - 0.09, radius * 2.7, radius * 2.7, 0.18, mats["carved"], 0.9)

    def add_hipped_roof(self, cx, cy, z_eave, w, d, ridge_h, ridge_inset_x, mat, ridge_mat=None, uv_scale=0.45):
        """
        Authentic Kerala steep hipped/gabled roof with ridge beam & Mukhappu gable ends.
        If ridge_inset_x == 0, produces a clean Kerala gable roof; >0 produces a hipped roof.
        """
        mi = self.mat(mat)
        hw, hd = w * 0.5, d * 0.5
        rx = max(0.0, hw - ridge_inset_x)
        # Outer eave corners (bottom) + top ridge points
        v0 = self.bm.verts.new((cx - hw, cy - hd, z_eave))
        v1 = self.bm.verts.new((cx + hw, cy - hd, z_eave))
        v2 = self.bm.verts.new((cx + hw, cy + hd, z_eave))
        v3 = self.bm.verts.new((cx - hw, cy + hd, z_eave))
        r0 = self.bm.verts.new((cx - rx, cy, z_eave + ridge_h))
        r1 = self.bm.verts.new((cx + rx, cy, z_eave + ridge_h))

        slope_faces = [
            (v0, v1, r1, r0),  # back slope (-Y)
            (v2, v3, r0, r1),  # front slope (+Y)
            (v1, v2, r1),      # right hip/gable (+X)
            (v3, v0, r0),      # left hip/gable (-X)
            (v3, v2, v1, v0),  # underside soffit
        ]
        for pts in slope_faces:
            try:
                f = self.bm.faces.new(pts)
                f.material_index = mi
                f.normal_update()
                self._assign_face_uv(f, uv_scale)
            except ValueError:
                pass

        # Terracotta Mootodu ridge capping + exposed dark-teak eaves rafters (Kazhukol) + fascia trim!
        if ridge_mat is not None:
            self.add_box(cx, cy, z_eave + ridge_h + 0.07, rx * 2.0 + 0.28, 0.22, 0.18, mat, 0.8)
            self.add_box(cx, cy, z_eave + ridge_h + 0.14, rx * 2.0 + 0.20, 0.12, 0.08, ridge_mat, 0.8)
            # Fascia wooden eaves trim along front & back edges
            self.add_box(cx, cy + hd - 0.05, z_eave - 0.04, w + 0.04, 0.08, 0.12, ridge_mat, 0.9)
            self.add_box(cx, cy - hd + 0.05, z_eave - 0.04, w + 0.04, 0.08, 0.12, ridge_mat, 0.9)
            # Exposed projecting wooden Kazhukol rafter tails under front & back eaves
            rafter_count = max(4, min(14, int(w / 1.15)))
            for ri in range(rafter_count):
                rx_pos = (cx - hw + 0.35) + (ri / max(1, rafter_count - 1)) * max(0.2, w - 0.70)
                self.add_box(rx_pos, cy + hd - 0.12, z_eave - 0.11, 0.07, 0.42, 0.08, ridge_mat, 1.0)
                self.add_box(rx_pos, cy - hd + 0.12, z_eave - 0.11, 0.07, 0.42, 0.08, ridge_mat, 1.0)

    def add_window_azhi(self, x, y, z, w, h, facing_axis, mats):
        """Traditional Kerala carved wooden Azhi (vertical barred lattice) window."""
        if facing_axis == "Y":
            self.add_box(x, y, z, w + 0.14, 0.12, h + 0.14, mats["carved"], 1.0)
            self.add_box(x, y, z, w - 0.04, 0.06, h - 0.04, mats["teak"], 1.0)
            bars = max(3, int(w / 0.16))
            for i in range(bars):
                bx = x - (w * 0.4) + (i / max(1, bars - 1)) * (w * 0.8)
                self.add_box(bx, y + 0.03, z, 0.035, 0.06, h - 0.06, mats["carved"], 1.2)
        else:
            self.add_box(x, y, z, 0.12, w + 0.14, h + 0.14, mats["carved"], 1.0)
            self.add_box(x, y, z, 0.06, w - 0.04, h - 0.04, mats["teak"], 1.0)
            bars = max(3, int(w / 0.16))
            for i in range(bars):
                by = y - (w * 0.4) + (i / max(1, bars - 1)) * (w * 0.8)
                self.add_box(x + 0.03, by, z, 0.06, 0.035, h - 0.06, mats["carved"], 1.2)

    def add_teak_door(self, x, y, z_floor, w, h, mats, double_studded=False):
        """Heavy carved Kerala teak entrance door (Vathil) facing +Y."""
        self.add_box(x, y, z_floor + h * 0.5, w + 0.22, 0.16, h + 0.16, mats["carved"], 0.9)
        self.add_box(x, y + 0.02, z_floor + h * 0.5, w, 0.09, h, mats["teak"], 0.9)
        if double_studded:
            # Central vertical seam + brass Kumuzhu studs
            self.add_box(x, y + 0.065, z_floor + h * 0.5, 0.04, 0.03, h - 0.08, mats["carved"], 1.0)
            for sx in (-w * 0.24, w * 0.24):
                for sz in (0.45, 1.05, 1.65):
                    self.add_box(x + sx, y + 0.075, z_floor + sz, 0.06, 0.04, 0.06, mats["brass"], 2.0)

    def add_charupadi_bench(self, x0, x1, y, z_floor, mats):
        """Built-in slatted Kerala wooden verandah seating bench (Charupadi)."""
        cx = (x0 + x1) * 0.5
        length = abs(x1 - x0)
        # Seat slab + front legs + outward-leaning backrest rails
        self.add_box(cx, y, z_floor + 0.46, length, 0.52, 0.08, mats["carved"], 0.8)
        self.add_box(cx, y - 0.12, z_floor + 0.23, length - 0.16, 0.10, 0.46, mats["laterite"], 0.8)
        self.add_box(cx, y + 0.26, z_floor + 0.76, length, 0.06, 0.58, mats["carved"], 0.8, rot_x=0.22)
        self.add_box(cx, y + 0.34, z_floor + 1.04, length + 0.06, 0.12, 0.08, mats["carved"], 0.8)

    def build(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(f"Mesh_{self.name}")
        self.bm.to_mesh(mesh)
        self.bm.free()
        for m in self.materials:
            mesh.materials.append(m)
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        return obj


# ------------------------------------------------------------------------------
# 3. Class-Based 18th-Century Kerala Houses, Grand Mana & Compound Props
# ------------------------------------------------------------------------------
def build_mana_nalukettu(mats):
    """
    1. Upper-Class Landlord Grand Mana (18th-century Olappamanna / Varikkasseri style):
       - 17.6m x 15.6m 4-wing Nalukettu quadrangle around an open sunken Nadumuttam
       - Raised 0.9m red-laterite plinth + grand front steps + pillared Poomukham w/ Charupadi
       - 2nd-story wooden Malika chamber with carved Azhi lattice gallery
       - Steep pre-British Marappalaka timber-shingled roofs + Mukhappu gables + brass finials
    """
    b = MeshBuilder("Mana_Nalukettu")
    # 1) Raised Laterite Plinth (Adithara) with open center for sunken Nadumuttam courtyard
    plinth_h = 0.90
    # South (front +Y), North (back -Y), West (-X), East (+X) plinth wings leaving 5.2m x 4.4m Nadumuttam open!
    b.add_box(0.0, 5.2, plinth_h * 0.5, 16.8, 5.2, plinth_h, mats["laterite"], 0.45)   # Front wing (+Y)
    b.add_box(0.0, -5.2, plinth_h * 0.5, 16.8, 4.6, plinth_h, mats["laterite"], 0.45)  # Back wing (-Y)
    b.add_box(-5.6, 0.0, plinth_h * 0.5, 5.6, 5.8, plinth_h, mats["laterite"], 0.45)   # West wing (-X)
    b.add_box(5.6, 0.0, plinth_h * 0.5, 5.6, 5.8, plinth_h, mats["laterite"], 0.45)    # East wing (+X)
    # Sunken Nadumuttam stone floor (0.35m above ground) + central sacred Thulasithara!
    b.add_box(0.0, 0.0, 0.18, 5.8, 5.8, 0.36, mats["floor"], 0.5)
    b.add_box(0.0, 0.0, 0.62, 1.05, 1.05, 0.55, mats["laterite"], 0.9)
    b.add_box(0.0, 0.0, 0.98, 0.82, 0.82, 0.20, mats["lime"], 0.9)
    b.add_cylinder(0.0, 0.0, 1.08, 1.48, 0.32, 0.12, 8, mats["tulsi"], 1.2)

    # Grand front entrance verandah projection (Poomukham) + broad laterite steps (+Y)
    b.add_box(0.0, 8.6, plinth_h * 0.5, 8.2, 2.2, plinth_h, mats["laterite"], 0.45)
    for step_i in range(4):
        sy = 9.85 + step_i * 0.34
        sh = plinth_h - step_i * 0.22
        b.add_box(0.0, sy, sh * 0.5, 3.4, 0.36, sh, mats["floor"], 0.6)
    # Curved laterite step balustrades
    for sx in (-1.9, 1.9):
        b.add_box(sx, 10.3, 0.55, 0.34, 1.5, 1.1, mats["laterite"], 0.6)

    # 2) Ground-Floor Lime-Washed & Teak-Trimmed 4 Wings (z = 0.90 .. 3.95)
    wall_h = 3.05
    wz = plinth_h + wall_h * 0.5
    # Front hall (set back 1.4m from front edge for full-width Chuttu Verandah)
    b.add_box(0.0, 4.4, wz, 14.4, 2.8, wall_h, mats["lime"], 0.4)
    # Back wing (Vadakkini)
    b.add_box(0.0, -5.2, wz, 15.2, 3.6, wall_h, mats["lime"], 0.4)
    # West & East wings (Padinjattini / Kizhakkini)
    b.add_box(-5.6, -0.2, wz, 4.0, 6.6, wall_h, mats["lime"], 0.4)
    b.add_box(5.6, -0.2, wz, 4.0, 6.6, wall_h, mats["lime"], 0.4)

    # Red-laterite dado trim band around exterior ground walls
    b.add_box(0.0, 5.82, plinth_h + 0.38, 14.45, 0.08, 0.76, mats["laterite"], 0.5)
    b.add_box(-7.62, -0.2, plinth_h + 0.38, 0.08, 13.6, 0.76, mats["laterite"], 0.5)
    b.add_box(7.62, -0.2, plinth_h + 0.38, 0.08, 13.6, 0.76, mats["laterite"], 0.5)

    # Grand Double Teak Entrance Door + Azhi Windows
    b.add_teak_door(0.0, 5.84, plinth_h, 1.65, 2.35, mats, double_studded=True)
    for wx in (-5.2, -2.8, 2.8, 5.2):
        b.add_window_azhi(wx, 5.84, plinth_h + 1.55, 1.15, 1.25, "Y", mats)
    for wy in (-4.8, -1.8, 1.4, 4.0):
        b.add_window_azhi(-7.62, wy, plinth_h + 1.55, 1.05, 1.20, "X", mats)
        b.add_window_azhi(7.62, wy, plinth_h + 1.55, 1.05, 1.20, "X", mats)

    # Front Verandah Pillars + Poomukham Pillars + Charupadi Benches
    for px in (-7.6, -4.8, -2.4, 2.4, 4.8, 7.6):
        b.add_pillar(px, 7.45, plinth_h, plinth_h + wall_h, 0.14, mats)
    for px in (-3.7, -1.65, 1.65, 3.7):
        b.add_pillar(px, 9.45, plinth_h, plinth_h + wall_h - 0.15, 0.15, mats)
    # Inner Nadumuttam courtyard colonnade (4 corner pillars)
    for cx_p in (-2.65, 2.65):
        for cy_p in (-2.55, 2.55):
            b.add_pillar(cx_p, cy_p, plinth_h, plinth_h + wall_h, 0.13, mats)
    b.add_charupadi_bench(-7.3, -4.9, 7.25, plinth_h, mats)
    b.add_charupadi_bench(4.9, 7.3, 7.25, plinth_h, mats)
    b.add_charupadi_bench(-3.5, -1.85, 9.20, plinth_h, mats)
    b.add_charupadi_bench(1.85, 3.5, 9.20, plinth_h, mats)

    # 3) Ground-Floor Steep Marappalaka Timber-Shingled Roofs (4 pitched wings around Nadumuttam)
    eave_z = plinth_h + wall_h - 0.15
    b.add_hipped_roof(0.0, 5.2, eave_z, 18.8, 6.2, 2.75, 1.6, mats["shingle"], mats["carved"], 0.42)
    b.add_hipped_roof(0.0, -5.2, eave_z, 18.8, 5.8, 2.75, 1.6, mats["shingle"], mats["carved"], 0.42)
    b.add_hipped_roof(-5.8, 0.0, eave_z, 6.2, 10.6, 2.65, 1.4, mats["shingle"], mats["carved"], 0.42)
    b.add_hipped_roof(5.8, 0.0, eave_z, 6.2, 10.6, 2.65, 1.4, mats["shingle"], mats["carved"], 0.42)
    # Poomukham projecting gable roof + carved wooden Mukhappu front gable + brass finial
    b.add_hipped_roof(0.0, 8.7, eave_z - 0.20, 9.4, 3.6, 2.15, 0.15, mats["shingle"], mats["carved"], 0.45)
    b.add_box(0.0, 10.45, eave_z + 0.55, 2.6, 0.14, 1.05, mats["carved"], 0.9)
    b.add_cylinder(0.0, 10.52, eave_z + 1.95, eave_z + 2.55, 0.08, 0.015, 8, mats["brass"], 1.5)

    # 4) Second-Story Malika / Machu Upper Chamber (over front-center wing, classic Varikkasseri/Olappamanna silhouette!)
    f2_z = eave_z + 1.55
    f2_h = 2.45
    b.add_box(0.0, 4.4, f2_z + f2_h * 0.5, 11.4, 4.2, f2_h, mats["lime"], 0.45)
    # Carved wooden Azhi balcony louver strip across upper front facade
    b.add_box(0.0, 6.55, f2_z + f2_h * 0.52, 10.6, 0.14, 1.55, mats["carved"], 0.9)
    for bx in (-4.4, -2.2, 0.0, 2.2, 4.4):
        b.add_window_azhi(bx, 6.62, f2_z + f2_h * 0.54, 1.25, 1.15, "Y", mats)
    # Grand Upper Malika Steep Shingled Roof + Mukhappu gables + 3 Brass Finials (Thazhikakkudam)
    top_eave = f2_z + f2_h - 0.12
    b.add_hipped_roof(0.0, 4.4, top_eave, 13.6, 6.4, 2.95, 1.4, mats["shingle"], mats["carved"], 0.42)
    for fx in (-4.8, 0.0, 4.8):
        b.add_cylinder(fx, 4.4, top_eave + 3.00, top_eave + 3.68, 0.09, 0.015, 8, mats["brass"], 1.5)

    return b.build()


def build_mana_padippura(mats):
    """2. Grand Roofed Mana Compound Entrance Gateway (Padippura, 5.8m wide, walkable center)."""
    b = MeshBuilder("Mana_Padippura")
    # Two thick laterite-and-lime gatehouse piers flanking a 2.6m wide central passageway
    for sx in (-2.05, 2.05):
        b.add_box(sx, 0.0, 0.42, 1.55, 2.6, 0.84, mats["laterite"], 0.5)
        b.add_box(sx, 0.0, 1.85, 1.40, 2.35, 2.15, mats["lime"], 0.5)
        b.add_box(sx, 0.0, 2.98, 1.52, 2.48, 0.18, mats["carved"], 0.8)
    # Wide stone threshold + inner waiting benches
    b.add_box(0.0, 0.0, 0.12, 5.8, 2.8, 0.24, mats["floor"], 0.5)
    # Heavy brass-studded double teak gates swung welcomingly open inward
    for side in (-1, 1):
        b.add_box(side * 1.18, -0.55, 1.42, 0.11, 1.25, 2.45, mats["carved"], 0.9)
        for sz in (0.65, 1.40, 2.15):
            b.add_box(side * 1.12, -0.55, sz, 0.05, 0.08, 0.08, mats["brass"], 2.0)
    # Heavy carved wooden lintel beam spanning across archway
    b.add_box(0.0, 0.0, 2.86, 5.4, 2.45, 0.28, mats["carved"], 0.7)
    # Steep iconic Kerala Padippura gable roof (Marappalaka shingles) + brass finials
    b.add_hipped_roof(0.0, 0.0, 2.92, 6.8, 3.8, 2.25, 0.45, mats["shingle"], mats["carved"], 0.45)
    for fx in (-2.6, 0.0, 2.6):
        b.add_cylinder(fx, 0.0, 5.20, 5.72, 0.075, 0.015, 8, mats["brass"], 1.5)
    return b.build()


def build_mana_pathayapura(mats):
    """3. Estate Paddy Granary & Storehouse (Pathayapura, 7.2m x 4.6m)."""
    b = MeshBuilder("Mana_Pathayapura")
    plinth_h = 0.72
    b.add_box(0.0, 0.0, plinth_h * 0.5, 7.2, 4.6, plinth_h, mats["laterite"], 0.5)
    # Heavy seasoned dark teak plank granary chamber (Ara)
    b.add_box(0.0, -0.45, plinth_h + 1.35, 6.4, 3.2, 2.70, mats["teak"], 0.55)
    # Front verandah pillars
    for px in (-3.2, -1.1, 1.1, 3.2):
        b.add_pillar(px, 1.95, plinth_h, plinth_h + 2.65, 0.11, mats)
    b.add_teak_door(0.0, 1.18, plinth_h, 1.25, 2.05, mats, double_studded=True)
    b.add_hipped_roof(0.0, 0.0, plinth_h + 2.55, 8.6, 5.9, 2.35, 1.1, mats["shingle"], mats["carved"], 0.45)
    return b.build()


def build_tharavadu_ekasala(mats):
    """
    4. Middle-Class Nair Tharavadu / Ekasala (9.8m x 7.4m):
       - Raised red-laterite plinth + lime-plastered walls w/ laterite dado
       - Shaded front Irayam verandah w/ 4 turned wooden pillars + Charupadi benches
       - Carved Azhi lattice windows, side Chayippu kitchen wing, steep Marappalaka roof
    """
    b = MeshBuilder("Tharavadu_Ekasala")
    plinth_h = 0.62
    b.add_box(0.0, 0.0, plinth_h * 0.5, 9.6, 7.0, plinth_h, mats["laterite"], 0.5)
    # Front steps (+Y)
    for si in range(3):
        b.add_box(0.0, 3.65 + si * 0.30, (plinth_h - si * 0.20) * 0.5, 2.1, 0.32, plinth_h - si * 0.20, mats["floor"], 0.6)
    # Main lime-washed block (set back for shaded front verandah)
    wall_h = 2.75
    b.add_box(0.0, -0.75, plinth_h + wall_h * 0.5, 8.4, 4.6, wall_h, mats["lime"], 0.45)
    b.add_box(0.0, 1.57, plinth_h + 0.34, 8.45, 0.06, 0.68, mats["laterite"], 0.5)
    # Side Chayippu (kitchen extension on -X)
    b.add_box(-5.1, -1.2, plinth_h * 0.5, 2.0, 3.8, plinth_h, mats["laterite"], 0.5)
    b.add_box(-5.1, -1.2, plinth_h + 1.15, 1.85, 3.4, 2.30, mats["lime"], 0.45)
    b.add_hipped_roof(-5.1, -1.2, plinth_h + 2.22, 2.8, 4.4, 1.15, 0.4, mats["shingle"], mats["carved"], 0.5)

    # Front verandah pillars & Charupadi benches
    for px in (-4.4, -1.55, 1.55, 4.4):
        b.add_pillar(px, 3.18, plinth_h, plinth_h + wall_h - 0.08, 0.115, mats)
    b.add_charupadi_bench(-4.2, -1.75, 2.96, plinth_h, mats)
    b.add_charupadi_bench(1.75, 4.2, 2.96, plinth_h, mats)

    b.add_teak_door(0.0, 1.58, plinth_h, 1.28, 2.15, mats, double_studded=True)
    for wx in (-2.7, 2.7):
        b.add_window_azhi(wx, 1.58, plinth_h + 1.42, 1.05, 1.10, "Y", mats)
    b.add_window_azhi(4.22, -0.75, plinth_h + 1.42, 1.0, 1.05, "X", mats)

    # Steep pre-British Marappalaka timber-shingled roof + Mukhappu gable finials
    eave_z = plinth_h + wall_h - 0.15
    b.add_hipped_roof(0.0, 0.0, eave_z, 11.4, 8.8, 2.85, 1.25, mats["shingle"], mats["carved"], 0.45)
    for fx in (-4.1, 4.1):
        b.add_cylinder(fx, 0.0, eave_z + 2.88, eave_z + 3.38, 0.065, 0.014, 8, mats["brass"], 1.5)
    return b.build()


def build_artisan_veedu(mats):
    """
    5. Middle-Lower / Artisan L-Shaped Idanila Veedu (8.4m x 6.8m):
       - Red laterite plinth + warm ochre mud-lime walls + shaded L-verandah
       - Thick woven coconut-leaf (Ola) steep hipped roof with deep monsoon eaves
    """
    b = MeshBuilder("Artisan_Veedu")
    plinth_h = 0.50
    b.add_box(0.0, -0.3, plinth_h * 0.5, 8.2, 5.8, plinth_h, mats["laterite"], 0.5)
    b.add_box(2.1, 2.6, plinth_h * 0.5, 4.0, 2.4, plinth_h, mats["laterite"], 0.5)
    # Main block + L-wing
    wall_h = 2.45
    b.add_box(0.0, -0.8, plinth_h + wall_h * 0.5, 7.2, 3.8, wall_h, mats["mud"], 0.5)
    b.add_box(2.1, 1.9, plinth_h + wall_h * 0.5, 3.2, 2.2, wall_h, mats["mud"], 0.5)
    # Verandah posts
    for px in (-3.8, -1.6, 0.2):
        b.add_pillar(px, 2.35, plinth_h, plinth_h + wall_h - 0.1, 0.095, mats)
    b.add_teak_door(-1.8, 1.12, plinth_h, 1.08, 1.95, mats, double_studded=False)
    b.add_window_azhi(2.1, 3.02, plinth_h + 1.32, 0.92, 0.95, "Y", mats)
    b.add_window_azhi(-3.62, -0.8, plinth_h + 1.32, 0.90, 0.95, "X", mats)
    # Steep terracotta Odu (ഓട്) tiled roofs with exposed timber rafters
    eave_z = plinth_h + wall_h - 0.18
    b.add_hipped_roof(0.0, -0.3, eave_z, 9.8, 7.2, 2.55, 1.3, mats["shingle"], mats["carved"], 0.48)
    b.add_hipped_roof(2.1, 2.2, eave_z - 0.05, 5.0, 3.8, 1.75, 0.6, mats["shingle"], mats["carved"], 0.48)
    return b.build()


def build_farmer_chala(mats):
    """
    6. Working-Class Farmer Chala (Mannu Veedu, 6.8m x 5.2m):
       - Low earthen-laterite plinth (Thara), hand-plastered terracotta cob walls (Cheli)
       - Low sweeping Ola palm-leaf thatch roof overhanging a shaded front Thinna sit-out
    """
    b = MeshBuilder("Farmer_Chala")
    plinth_h = 0.38
    b.add_box(0.0, 0.0, plinth_h * 0.5, 6.6, 5.0, plinth_h, mats["mud"], 0.55)
    wall_h = 2.18
    b.add_box(0.0, -0.55, plinth_h + wall_h * 0.5, 5.6, 3.3, wall_h, mats["mud"], 0.55)
    # Raised earthen Thinna sit-out benches flanking the doorway
    b.add_box(-1.85, 1.65, plinth_h + 0.22, 1.85, 0.95, 0.44, mats["mud"], 0.6)
    b.add_box(1.85, 1.65, plinth_h + 0.22, 1.85, 0.95, 0.44, mats["mud"], 0.6)
    # Hand-hewn wooden verandah posts
    for px in (-2.95, -0.95, 0.95, 2.95):
        b.add_cylinder(px, 2.25, plinth_h, plinth_h + wall_h - 0.22, 0.075, 0.065, 8, mats["teak"], 0.8)
    b.add_teak_door(0.0, 1.12, plinth_h, 0.96, 1.82, mats, double_studded=False)
    b.add_window_azhi(-1.85, 1.12, plinth_h + 1.22, 0.72, 0.72, "Y", mats)
    b.add_window_azhi(1.85, 1.12, plinth_h + 1.22, 0.72, 0.72, "Y", mats)
    # Sweeping low-eave Ola palm thatch roof
    b.add_hipped_roof(0.0, 0.05, plinth_h + wall_h - 0.30, 8.2, 6.4, 2.25, 1.15, mats["ola"], mats["teak"], 0.6)
    return b.build()


def build_laborer_kudil(mats):
    """
    7. Humble Rural Laborer's Kudil (4.8m x 3.9m):
       - Compact earthen Thara, lower mud wall + upper woven bamboo-mat (Thatti) walls
       - Steep rustic dried-palm Ola thatch roof with low protective eaves
    """
    b = MeshBuilder("Laborer_Kudil")
    plinth_h = 0.28
    b.add_box(0.0, 0.0, plinth_h * 0.5, 4.7, 3.8, plinth_h, mats["mud"], 0.6)
    # Lower mud half-wall + upper woven bamboo Thatti half-wall
    b.add_box(0.0, -0.35, plinth_h + 0.48, 3.9, 2.6, 0.96, mats["mud"], 0.6)
    b.add_box(0.0, -0.35, plinth_h + 1.48, 3.86, 2.56, 1.08, mats["thatti"], 0.8)
    for px in (-2.05, -0.68, 0.68, 2.05):
        b.add_cylinder(px, 1.68, plinth_h, plinth_h + 1.82, 0.062, 0.055, 7, mats["teak"], 0.8)
    b.add_teak_door(0.0, 0.97, plinth_h, 0.86, 1.66, mats, double_studded=False)
    b.add_hipped_roof(0.0, 0.05, plinth_h + 1.72, 6.1, 5.0, 1.95, 0.85, mats["ola"], mats["teak"], 0.65)
    return b.build()


# ------------------------------------------------------------------------------
# 4. Traditional 18th-Century Kerala Veli (വേലി) Fences & Veettu Parisaram Props
# ------------------------------------------------------------------------------
def build_veli_kayyala_wall(mats):
    """8. Authentic Rural Kerala Kayyala (Dry-Stacked Red-Laterite Embankment Wall + Living Green Crest)."""
    b = MeshBuilder("Veli_Kayyala_Wall")
    # Battered dry-stacked red-laterite courses (wider earthen base tapering upward)
    b.add_box(0.0, 0.0, 0.28, 4.02, 0.66, 0.56, mats["laterite"], 0.55)
    b.add_box(0.0, 0.0, 0.76, 3.98, 0.52, 0.44, mats["laterite"], 0.55)
    b.add_box(0.0, 0.0, 1.12, 3.94, 0.44, 0.30, mats["mud"], 0.6)
    # Natural living green Pachaveli / fern & shrub tufts growing atop the mossy Kayyala
    for i in range(6):
        gx = -1.65 + i * 0.66
        gy = 0.04 if (i % 2 == 0) else -0.04
        b.add_cylinder(gx, gy, 1.22, 1.56 + (i % 3) * 0.08, 0.34, 0.16, 7, mats["tulsi"], 1.1)
    return b.build()


def build_veli_olaveli_fence(mats):
    """9. Authentic Rural Kerala Mulaveli / Olaveli (Split-Bamboo Stakes, Diagonal Braces & Woven Palm Fronds)."""
    b = MeshBuilder("Veli_Olaveli_Fence")
    # 7 uneven rustic bamboo/wooden stakes (Kambu) driven into the earth
    for i in range(7):
        sx = -1.72 + i * 0.573
        h_stake = 1.32 + ((i * 3) % 4) * 0.07
        b.add_cylinder(sx, 0.0, 0.0, h_stake, 0.042, 0.032, 7, mats["teak"], 0.9)
    # 3 horizontal split-bamboo cross rails
    for rz in (0.32, 0.74, 1.14):
        b.add_box(0.0, 0.035, rz, 3.60, 0.042, 0.048, mats["teak"], 0.85)
    # Diagonal criss-cross rustic bamboo braces (authentic Mulaveli lattice)
    for dx_b in (-1.05, 0.0, 1.05):
        b.add_box(dx_b, 0.04, 0.72, 0.04, 0.04, 1.38, mats["teak"], 0.9, rot_y=0.48)
        b.add_box(dx_b, -0.04, 0.72, 0.04, 0.04, 1.38, mats["teak"], 0.9, rot_y=-0.48)
    # Woven dried coconut palm-frond (Ola) screen tied between the stakes
    b.add_box(0.0, -0.01, 0.68, 3.50, 0.055, 1.10, mats["ola"], 0.85)
    # Low living green hedge undergrowth along the base of the Veli
    for i in range(4):
        gx = -1.35 + i * 0.90
        b.add_cylinder(gx, 0.14, 0.0, 0.42 + (i % 2) * 0.10, 0.28, 0.14, 7, mats["tulsi"], 1.1)
    return b.build()


def build_veli_gate_padavetti(mats):
    """10. Traditional Compound Veli Entrance Gate (Padavetti, 2.4m wide, open walkway)."""
    b = MeshBuilder("Veli_Gate_Padavetti")
    for sx in (-1.15, 1.15):
        b.add_box(sx, 0.0, 0.78, 0.36, 0.36, 1.56, mats["laterite"], 0.7)
        b.add_box(sx, 0.0, 1.60, 0.44, 0.44, 0.10, mats["lime"], 0.8)
    # Slanted open bamboo bar resting beside the left post (so player & NPCs walk straight through)
    b.add_box(-0.92, -0.25, 0.58, 0.06, 0.06, 1.25, mats["teak"], 0.9, rot_x=0.35, rot_y=0.25)
    return b.build()


def build_prop_thulasithara(mats):
    """11. Sacred Courtyard Thulasithara (Stepped Red-Laterite & Lime Tulsi Pedestal)."""
    b = MeshBuilder("Prop_Thulasithara")
    b.add_box(0.0, 0.0, 0.14, 1.12, 1.12, 0.28, mats["laterite"], 0.9)
    b.add_box(0.0, 0.0, 0.46, 0.88, 0.88, 0.38, mats["lime"], 0.9)
    b.add_box(0.0, 0.0, 0.74, 0.98, 0.98, 0.18, mats["laterite"], 0.9)
    # Small brass lamp niche on front (+Y) face
    b.add_box(0.0, 0.46, 0.48, 0.22, 0.08, 0.24, mats["laterite"], 1.2)
    b.add_cylinder(0.0, 0.49, 0.38, 0.46, 0.045, 0.025, 8, mats["brass"], 1.5)
    # Lush green Tulsi shrub on top
    b.add_cylinder(0.0, 0.0, 0.82, 1.28, 0.34, 0.14, 9, mats["tulsi"], 1.2)
    b.add_cylinder(0.12, 0.08, 0.84, 1.18, 0.22, 0.09, 7, mats["tulsi"], 1.2)
    b.add_cylinder(-0.11, -0.06, 0.84, 1.16, 0.21, 0.09, 7, mats["tulsi"], 1.2)
    return b.build()


def build_prop_kerala_kinar(mats):
    """12. Traditional Red-Laterite Courtyard Open Well (Kinar) with Timber Pulley."""
    b = MeshBuilder("Prop_Kerala_Kinar")
    # Circular laterite well parapet ring (12 segments built as ring of blocks for real hollow well!)
    segs = 14
    r_mid = 0.72
    for i in range(segs):
        ang = (i / float(segs)) * math.pi * 2.0
        bx = math.cos(ang) * r_mid
        by = math.sin(ang) * r_mid
        b.add_box(bx, by, 0.44, 0.38, 0.24, 0.88, mats["laterite"], 0.7, rot_z=ang + math.pi * 0.5)
        b.add_box(bx, by, 0.91, 0.40, 0.28, 0.08, mats["lime"], 0.8, rot_z=ang + math.pi * 0.5)
    # Dark reflective water disk inside well
    b.add_cylinder(0.0, 0.0, 0.28, 0.32, 0.62, 0.62, 14, mats["water"], 1.0)
    # Twin seasoned teak upright posts + overhead pulley crossbeam
    for sx in (-0.78, 0.78):
        b.add_cylinder(sx, 0.0, 0.0, 2.15, 0.068, 0.058, 8, mats["teak"], 0.8)
    b.add_box(0.0, 0.0, 2.08, 1.85, 0.11, 0.12, mats["carved"], 0.8)
    # Wooden pulley wheel (Kappi) + hanging coir rope + brass water pot
    b.add_cylinder(0.0, 0.0, 1.82, 2.02, 0.12, 0.12, 10, mats["carved"], 1.0)
    b.add_cylinder(0.0, 0.0, 1.18, 1.88, 0.014, 0.014, 6, mats["ola"], 1.2)
    b.add_cylinder(0.0, 0.0, 0.96, 1.20, 0.13, 0.10, 10, mats["brass"], 1.5)
    return b.build()


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
        export_materials="EXPORT",
    )


def main():
    os.makedirs(EXPORT_DIR, exist_ok=True)
    clear_scene()
    mats = get_materials()

    builders = [
        ("mana_nalukettu.glb", build_mana_nalukettu, (0.0, 0.0, 0.0)),
        ("mana_padippura.glb", build_mana_padippura, (14.0, 0.0, 0.0)),
        ("mana_pathayapura.glb", build_mana_pathayapura, (23.0, 0.0, 0.0)),
        ("tharavadu_ekasala.glb", build_tharavadu_ekasala, (0.0, 16.0, 0.0)),
        ("artisan_veedu.glb", build_artisan_veedu, (14.0, 16.0, 0.0)),
        ("farmer_chala.glb", build_farmer_chala, (25.0, 16.0, 0.0)),
        ("laborer_kudil.glb", build_laborer_kudil, (34.0, 16.0, 0.0)),
        ("veli_kayyala_wall.glb", build_veli_kayyala_wall, (0.0, 27.0, 0.0)),
        ("veli_olaveli_fence.glb", build_veli_olaveli_fence, (6.0, 27.0, 0.0)),
        ("veli_gate_padavetti.glb", build_veli_gate_padavetti, (12.0, 27.0, 0.0)),
        ("prop_thulasithara.glb", build_prop_thulasithara, (17.0, 27.0, 0.0)),
        ("prop_kerala_kinar.glb", build_prop_kerala_kinar, (21.0, 27.0, 0.0)),
    ]

    exported = []
    for filename, fn, preview_pos in builders:
        obj = fn(mats)
        obj.location = (0.0, 0.0, 0.0)
        bpy.context.view_layer.update()
        out_path = os.path.join(EXPORT_DIR, filename)
        export_single_glb(obj, out_path)
        exported.append(out_path)
        obj.location = preview_pos

    if SAVE_BLEND_LIBRARY:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND_LIBRARY_PATH)
        print(f"Saved Kerala houses library .blend -> {BLEND_LIBRARY_PATH}")

    print(f"Exported {len(exported)} 18th-century Kerala house, Mana & Veli GLBs into {EXPORT_DIR}:")
    for p in exported:
        print(f"  - {os.path.basename(p)}")


if __name__ == "__main__":
    main()
