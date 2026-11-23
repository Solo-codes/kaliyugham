import bpy
import bmesh
import math
import os
import random

# ==============================================================================
# KALIYUGHAM — Detailed 18th-Century Rural Kerala NPC Accessories Generator
# ==============================================================================
# Generates 3 game-ready PBR GLB props directly into public/models/props/:
#   1. kerala_night_lamp.glb  -> Traditional brass/tin kerosene hurricane lamp
#                                (oil reservoir, glass chimney, glowing wick,
#                                 wire guard ribs, vented dome & bail handle)
#   2. kerala_beedi.glb       -> Hand-rolled Kerala tendu-leaf beedi with red
#                                cotton thread tie, charred ash & glowing ember
#   3. kerala_matchbox.glb    -> Vintage rural Kerala matchbox with red/ochre
#                                label, striker strip & open wooden match tray
#
# Usage in Blender:
#   Open this script in the Scripting tab and click Run Script (▶).
# ==============================================================================

EXPORT_DIR = "/Users/vishnuk/Documents/project/game/public/models/props"


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablock in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(datablock):
            if item.users == 0:
                datablock.remove(item)


def make_pbr_mat(name, color, roughness=0.6, metallic=0.0, emission=None, emission_strength=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0 and "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
    return mat


def make_striker_texture(name):
    """Generates a 128x128 gritty brown phosphorus matchbox striker texture."""
    img = bpy.data.images.new(name, width=128, height=128, alpha=False)
    px = [0.0] * (128 * 128 * 4)
    rng = random.Random(77)
    for i in range(128 * 128):
        g = (rng.random() - 0.5) * 0.14
        px[i * 4]     = max(0.0, min(1.0, 0.24 + g))
        px[i * 4 + 1] = max(0.0, min(1.0, 0.12 + g * 0.7))
        px[i * 4 + 2] = max(0.0, min(1.0, 0.08 + g * 0.5))
        px[i * 4 + 3] = 1.0
    img.pixels.foreach_set(px)
    img.pack()
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = img
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    return mat


def export_selected_glb(filepath, objs):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
    )
    print(f"Exported: {filepath}")


# ------------------------------------------------------------------------------
# 1. Traditional Rural Kerala Hand-Held Night Lamp (Kerosene Hurricane Lantern)
#    Origin (0, 0, 0) sits right at the top handle grip so attaching to a hand
#    bone hangs the lantern naturally downward!
# ------------------------------------------------------------------------------
def build_kerala_night_lamp():
    clear_scene()
    parts = []

    mat_brass = make_pbr_mat("Lamp_AgedBrass", (0.58, 0.42, 0.18), roughness=0.42, metallic=0.82)
    mat_iron = make_pbr_mat("Lamp_DarkIron", (0.14, 0.13, 0.12), roughness=0.58, metallic=0.75)
    mat_glass = make_pbr_mat("Lamp_GlassGlobe", (0.96, 0.90, 0.76), roughness=0.14, metallic=0.0, alpha=0.38)
    mat_flame = make_pbr_mat(
        "Lamp_FlameCore",
        (1.0, 0.76, 0.28),
        roughness=0.2,
        emission=(1.0, 0.62, 0.14),
        emission_strength=6.5,
    )
    mat_wick = make_pbr_mat("Lamp_Wick", (0.16, 0.12, 0.08), roughness=0.95)

    # Lantern hangs downward from handle grip at Z = 0.0 down to base at Z = -0.30m
    # 1. Oil reservoir base (lathed profile)
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.068, depth=0.052, location=(0, 0, -0.275))
    base = bpy.context.active_object
    base.name = "Lamp_Reservoir"
    base.data.materials.append(mat_brass)
    parts.append(base)

    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.068, radius2=0.044, depth=0.026, location=(0, 0, -0.236))
    collar = bpy.context.active_object
    collar.name = "Lamp_Collar"
    collar.data.materials.append(mat_brass)
    parts.append(collar)

    # 2. Burner & cotton wick + glowing teardrop flame
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.016, depth=0.022, location=(0, 0, -0.214))
    burner = bpy.context.active_object
    burner.name = "Lamp_Burner"
    burner.data.materials.append(mat_iron)
    parts.append(burner)

    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.005, depth=0.014, location=(0, 0, -0.198))
    wick = bpy.context.active_object
    wick.name = "Lamp_Wick"
    wick.data.materials.append(mat_wick)
    parts.append(wick)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=10, radius=0.015, location=(0, 0, -0.175))
    flame = bpy.context.active_object
    flame.name = "Lamp_Flame"
    flame.scale = (0.72, 0.72, 1.55)
    flame.data.materials.append(mat_flame)
    parts.append(flame)

    # 3. Bulged glass hurricane globe
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.056, location=(0, 0, -0.165))
    globe = bpy.context.active_object
    globe.name = "Lamp_Glass"
    globe.scale = (0.94, 0.94, 1.15)
    globe.data.materials.append(mat_glass)
    parts.append(globe)

    # 4. Vented top chimney cap & heat shield
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.058, radius2=0.026, depth=0.036, location=(0, 0, -0.090))
    hood = bpy.context.active_object
    hood.name = "Lamp_Hood"
    hood.data.materials.append(mat_brass)
    parts.append(hood)

    bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.024, depth=0.024, location=(0, 0, -0.064))
    chimney = bpy.context.active_object
    chimney.name = "Lamp_Chimney"
    chimney.data.materials.append(mat_iron)
    parts.append(chimney)

    # 5. Four protective wire cage struts + side air tubes
    for i in range(4):
        ang = (i / 4.0) * math.pi * 2.0 + math.pi * 0.25
        x = math.cos(ang) * 0.062
        y = math.sin(ang) * 0.062
        bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.0032, depth=0.175, location=(x, y, -0.172))
        rib = bpy.context.active_object
        rib.name = f"Lamp_GuardRib_{i}"
        rib.data.materials.append(mat_iron)
        parts.append(rib)

    # 6. Curved bail carrying handle peaking at Z = 0.0 (hand grip point)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.058,
        minor_radius=0.0042,
        major_segments=24,
        minor_segments=8,
        location=(0, 0, -0.058),
        rotation=(math.pi * 0.5, 0, 0),
    )
    handle = bpy.context.active_object
    handle.name = "Lamp_Handle"
    handle.data.materials.append(mat_iron)
    parts.append(handle)

    for p in parts:
        for poly in p.data.polygons:
            poly.use_smooth = True

    export_selected_glb(os.path.join(EXPORT_DIR, "kerala_night_lamp.glb"), parts)


# ------------------------------------------------------------------------------
# 2. Hand-Rolled Kerala Beedi (Tendu Leaf + Red Cotton Thread + Glowing Ember)
#    Oriented along +Z from mouth end (Z = 0.0) to glowing tip (Z = 0.072m)
# ------------------------------------------------------------------------------
def build_kerala_beedi():
    clear_scene()
    parts = []

    mat_leaf = make_pbr_mat("Beedi_TenduLeaf", (0.44, 0.36, 0.22), roughness=0.92)
    mat_thread = make_pbr_mat("Beedi_RedThread", (0.68, 0.10, 0.09), roughness=0.88)
    mat_ash = make_pbr_mat("Beedi_Ash", (0.24, 0.23, 0.22), roughness=0.98)
    mat_ember = make_pbr_mat(
        "Beedi_Ember",
        (0.95, 0.24, 0.05),
        roughness=0.7,
        emission=(1.0, 0.28, 0.04),
        emission_strength=5.5,
    )

    # Tapered hand-rolled tendu leaf body (7.0 cm long, thinner at mouth end)
    bpy.ops.mesh.primitive_cone_add(
        vertices=16,
        radius1=0.0028,
        radius2=0.0046,
        depth=0.064,
        location=(0, 0, 0.032),
    )
    body = bpy.context.active_object
    body.name = "Beedi_LeafBody"
    body.data.materials.append(mat_leaf)
    parts.append(body)

    # Traditional red cotton thread tie near mouth end
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.0033,
        minor_radius=0.00055,
        major_segments=16,
        minor_segments=6,
        location=(0, 0, 0.014),
    )
    thread = bpy.context.active_object
    thread.name = "Beedi_ThreadTie"
    thread.data.materials.append(mat_thread)
    parts.append(thread)

    # Charred ash ring + glowing orange-red ember tip
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.0045, depth=0.0055, location=(0, 0, 0.066))
    ash = bpy.context.active_object
    ash.name = "Beedi_AshTip"
    ash.data.materials.append(mat_ash)
    parts.append(ash)

    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.0044, location=(0, 0, 0.070))
    ember = bpy.context.active_object
    ember.name = "Beedi_EmberGlow"
    ember.scale = (1.0, 1.0, 0.65)
    ember.data.materials.append(mat_ember)
    parts.append(ember)

    for p in parts:
        for poly in p.data.polygons:
            poly.use_smooth = True

    export_selected_glb(os.path.join(EXPORT_DIR, "kerala_beedi.glb"), parts)


# ------------------------------------------------------------------------------
# 3. Vintage Rural Kerala Matchbox (Sleeve + Striker Strip + Matchsticks)
#    Real-life dimensions: ~5.2cm x 3.6cm x 1.5cm
# ------------------------------------------------------------------------------
def build_kerala_matchbox():
    clear_scene()
    parts = []

    mat_sleeve = make_pbr_mat("Matchbox_RedOchrePaper", (0.64, 0.16, 0.10), roughness=0.86)
    mat_label = make_pbr_mat("Matchbox_YellowLabel", (0.86, 0.68, 0.22), roughness=0.84)
    mat_striker = make_striker_texture("Matchbox_Striker")
    mat_wood = make_pbr_mat("Matchbox_TrayWood", (0.76, 0.63, 0.42), roughness=0.88)
    mat_head = make_pbr_mat("Matchstick_PhosphorusHead", (0.38, 0.08, 0.06), roughness=0.72)

    # Outer paper sleeve
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    sleeve = bpy.context.active_object
    sleeve.name = "Matchbox_Sleeve"
    sleeve.scale = (0.052, 0.036, 0.015)
    sleeve.data.materials.append(mat_sleeve)
    parts.append(sleeve)

    # Top vintage ochre emblem patch
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.0078))
    label = bpy.context.active_object
    label.name = "Matchbox_Label"
    label.scale = (0.042, 0.026, 0.0008)
    label.data.materials.append(mat_label)
    parts.append(label)

    # Gritty brown phosphorus striker strips on both long sides
    for side in (-1.0, 1.0):
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, side * 0.0183, 0))
        strip = bpy.context.active_object
        strip.name = f"Matchbox_Striker_{'L' if side < 0 else 'R'}"
        strip.scale = (0.049, 0.0008, 0.012)
        strip.data.materials.append(mat_striker)
        parts.append(strip)

    # Slightly slid-open inner wooden tray + 5 visible matchsticks
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.014, 0, 0))
    tray = bpy.context.active_object
    tray.name = "Matchbox_InnerTray"
    tray.scale = (0.048, 0.032, 0.0125)
    tray.data.materials.append(mat_wood)
    parts.append(tray)

    for i in range(5):
        y_off = -0.010 + i * 0.005
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.022, y_off, 0.004))
        stick = bpy.context.active_object
        stick.name = f"Matchstick_{i}"
        stick.scale = (0.036, 0.0022, 0.0022)
        stick.data.materials.append(mat_wood)
        parts.append(stick)

        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=0.0023, location=(0.040, y_off, 0.004))
        head = bpy.context.active_object
        head.name = f"Matchstick_Head_{i}"
        head.scale = (1.35, 1.0, 1.0)
        head.data.materials.append(mat_head)
        parts.append(head)

    export_selected_glb(os.path.join(EXPORT_DIR, "kerala_matchbox.glb"), parts)


def main():
    build_kerala_night_lamp()
    build_kerala_beedi()
    build_kerala_matchbox()
    print("All 3 Kerala NPC accessory GLBs exported cleanly to:", EXPORT_DIR)


if __name__ == "__main__":
    main()
