import sys
import importlib

# ==============================================================================
# KALIYUGHAM — 1-Click Runner for ALL 5 Photorealistic 1K PBR House & Veli Scripts
# ==============================================================================
# Runs every individual house/fence generator in sequence (~10 seconds total in
# Blender since all 10 1K PBR texture sets are already cached on disk):
#   1. Grand Mana Complex  (mana_nalukettu, mana_padippura, mana_pathayapura)
#   2. Nair Tharavadu      (tharavadu_ekasala)
#   3. Artisan Veedu       (artisan_veedu)
#   4. Farmer Chala & Kudil(farmer_chala, laborer_kudil)
#   5. Veli & Courtyard    (veli_kayyala_wall, veli_olaveli_fence, veli_gate_padavetti,
#                           prop_thulasithara, prop_kerala_kinar)
# ==============================================================================

SCRIPTS_DIR = "/Users/vishnuk/Documents/project/game/scripts"
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

import kerala_pbr_materials as kpbr
import generate_house_mana as m1
import generate_house_tharavadu as m2
import generate_house_artisan as m3
import generate_house_chala_kudil as m4
import generate_kerala_veli as m5

for mod in (kpbr, m1, m2, m3, m4, m5):
    importlib.reload(mod)

mats = kpbr.get_kerala_material_palette(force_rebake=False)

print("=== [1/5] Exporting Grand Mana Complex ===")
m1.build_mana_nalukettu(mats)
m1.build_mana_padippura(mats)
m1.build_mana_pathayapura(mats)

print("=== [2/5] Exporting Nair Tharavadu ===")
m2.build_tharavadu_ekasala(mats)

print("=== [3/5] Exporting Artisan Veedu ===")
m3.build_artisan_veedu(mats)

print("=== [4/5] Exporting Farmer Chala & Laborer Kudil ===")
m4.build_farmer_chala(mats)
m4.build_laborer_kudil(mats)

print("=== [5/5] Exporting Kerala Veli Fences & Courtyard Props ===")
m5.build_veli_kayyala(mats)
m5.build_veli_olaveli(mats)
m5.build_veli_gate(mats)
m5.build_thulasithara(mats)
m5.build_kerala_kinar(mats)

print("ALL 12 photorealistic 1K PBR Kerala house, Mana, Veli & courtyard GLBs exported!")
