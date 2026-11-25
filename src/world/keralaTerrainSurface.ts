import * as THREE from "three";

/**
 * 18th-Century Rural Kerala Real Photogrammetry PBR Terrain, Clay & Mud Surface Engine
 *
 * Uses downloaded CC0 Poly Haven photogrammetry textures (`public/textures/kerala_terrain/`):
 * - Grass Ground (`grass_diff.jpg`, `grass_disp.jpg`): lush meadows & grazing pastures
 * - Red Laterite Soil & Stones (`laterite_diff.jpg`, `laterite_disp.jpg`): sloped hillsides & ridges
 * - Red Clay Mud (`red_clay_diff.jpg`, `red_clay_disp.jpg`, `red_clay_rough.jpg`): clay banks, bare village soil & Kalari earth
 * - Dark Alluvial Brown Mud (`brown_mud_diff.jpg`, `brown_mud_disp.jpg`, `brown_mud_rough.jpg`): low-lying wet hollows, riverbanks & paddy fields
 * - Forest Floor (`forest_floor_diff.jpg`, `forest_floor_disp.jpg`): shaded western forest leaf-litter & loam
 * - Rocky Trail (`rocky_trail_diff.jpg`, `rocky_trail_disp.jpg`): rocky upland shoulders & river edges
 */

const texLoader = new THREE.TextureLoader();

function loadTerrainTex(filename: string, repeat: number, isColor: boolean): THREE.Texture {
  const tex = texLoader.load(`${import.meta.env.BASE_URL}textures/kerala_terrain/${filename}`);
  if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export type KeralaPbrTexturePack = {
  grassDiff: THREE.Texture;
  grassDisp: THREE.Texture;
  lateriteDiff: THREE.Texture;
  lateriteDisp: THREE.Texture;
  redClayDiff: THREE.Texture;
  redClayDisp: THREE.Texture;
  redClayRough: THREE.Texture;
  brownMudDiff: THREE.Texture;
  brownMudDisp: THREE.Texture;
  brownMudRough: THREE.Texture;
  forestFloorDiff: THREE.Texture;
  forestFloorDisp: THREE.Texture;
  rockyTrailDiff: THREE.Texture;
  rockyTrailDisp: THREE.Texture;
};

let cachedPack: KeralaPbrTexturePack | undefined;

export function getKeralaTerrainTextures(): KeralaPbrTexturePack {
  if (!cachedPack) {
    cachedPack = {
      grassDiff: loadTerrainTex("grass_diff.jpg", 42, true),
      grassDisp: loadTerrainTex("grass_disp.jpg", 42, false),
      lateriteDiff: loadTerrainTex("laterite_diff.jpg", 38, true),
      lateriteDisp: loadTerrainTex("laterite_disp.jpg", 38, false),
      redClayDiff: loadTerrainTex("red_clay_diff.jpg", 36, true),
      redClayDisp: loadTerrainTex("red_clay_disp.jpg", 36, false),
      redClayRough: loadTerrainTex("red_clay_rough.jpg", 36, false),
      brownMudDiff: loadTerrainTex("brown_mud_diff.jpg", 34, true),
      brownMudDisp: loadTerrainTex("brown_mud_disp.jpg", 34, false),
      brownMudRough: loadTerrainTex("brown_mud_rough.jpg", 34, false),
      forestFloorDiff: loadTerrainTex("forest_floor_diff.jpg", 38, true),
      forestFloorDisp: loadTerrainTex("forest_floor_disp.jpg", 38, false),
      rockyTrailDiff: loadTerrainTex("rocky_trail_diff.jpg", 36, true),
      rockyTrailDisp: loadTerrainTex("rocky_trail_disp.jpg", 36, false),
    };
  }
  return cachedPack;
}

/**
 * Upgrades the terrain ground mesh with a 5-biome GTA/RDR2-style world-space PBR
 * splatting shader using real Poly Haven photogrammetry textures:
 *  1. Grass Turf (flat meadows & grazing land)
 *  2. Red Laterite Soil & Stones (sloped hillsides & mound shoulders)
 *  3. Red Clay Mud (organic damp clay patches & village earth)
 *  4. Dark Wet Alluvial Brown Mud (low-lying basins, riverbanks & damp hollows)
 *  5. Forest Floor Leaf-Litter (western forest across the river)
 */
export function upgradeKeralaTerrainMaterial(
  groundMaterial: THREE.MeshStandardMaterial,
  _fallbackMap?: THREE.Texture,
  _fallbackNormal?: THREE.Texture,
) {
  const pack = getKeralaTerrainTextures();

  // Disable old pale vertex colors so real photogrammetry PBR colors shine cleanly
  groundMaterial.vertexColors = false;
  groundMaterial.color.set("#ffffff");
  groundMaterial.map = pack.grassDiff;
  groundMaterial.normalMap = null;
  groundMaterial.bumpMap = pack.grassDisp;
  groundMaterial.bumpScale = 0.085;
  groundMaterial.roughness = 0.94;
  groundMaterial.metalness = 0.0;

  groundMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uLateriteMap = { value: pack.lateriteDiff };
    shader.uniforms.uRedClayMap = { value: pack.redClayDiff };
    shader.uniforms.uBrownMudMap = { value: pack.brownMudDiff };
    shader.uniforms.uForestMap = { value: pack.forestFloorDiff };
    shader.uniforms.uRockyMap = { value: pack.rockyTrailDiff };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWorldPos;
        varying float vSlopeFactor;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 wp4 = modelMatrix * vec4(transformed, 1.0);
        vWorldPos = wp4.xyz;
        vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
        vSlopeFactor = 1.0 - clamp(wn.y, 0.0, 1.0);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uLateriteMap;
        uniform sampler2D uRedClayMap;
        uniform sampler2D uBrownMudMap;
        uniform sampler2D uForestMap;
        uniform sampler2D uRockyMap;
        varying vec3 vWorldPos;
        varying float vSlopeFactor;

        float kHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float kNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(kHash(i), kHash(i + vec2(1.0, 0.0)), f.x),
            mix(kHash(i + vec2(0.0, 1.0)), kHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float kFbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 3; i++) {
            v += a * kNoise(p);
            p *= 2.07;
            a *= 0.5;
          }
          return v;
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        // Dual-scale UVs eliminate visible tiling across the 190m Kerala landscape
        vec2 uvMain = vWorldPos.xz * 0.22;
        vec2 uvMacro = vWorldPos.xz * 0.075 + vec2(4.2, -3.1);

        vec3 grassCol = diffuseColor.rgb * vec3(0.92, 1.06, 0.84);
        vec3 lateriteCol = mix(
          texture2D(uLateriteMap, uvMain).rgb,
          texture2D(uLateriteMap, uvMacro).rgb,
          0.32
        );
        vec3 clayCol = mix(
          texture2D(uRedClayMap, uvMain * 0.95).rgb,
          texture2D(uRedClayMap, uvMacro).rgb,
          0.30
        );
        vec3 mudCol = mix(
          texture2D(uBrownMudMap, uvMain * 0.9).rgb,
          texture2D(uBrownMudMap, uvMacro).rgb,
          0.30
        );
        vec3 forestCol = mix(
          texture2D(uForestMap, uvMain).rgb,
          texture2D(uForestMap, uvMacro).rgb,
          0.35
        );
        vec3 rockyCol = texture2D(uRockyMap, uvMain * 1.1).rgb;

        float nMacro = kFbm(vWorldPos.xz * 0.038);
        float nDetail = kFbm(vWorldPos.xz * 0.16 + vec2(11.4, 6.8));

        // 1. Base meadow grass with subtle natural variation
        vec3 col = grassCol * (0.88 + 0.24 * nMacro);

        // 2. Organic red clay patches in village earth & gentle dips
        float clayMask = smoothstep(0.57, 0.77, nMacro * 0.65 + nDetail * 0.35);
        col = mix(col, clayCol, clayMask * 0.68);

        // 3. Sloped hillsides & mound shoulders expose Kerala Red Laterite Soil & Stones!
        float slopeLaterite = smoothstep(0.035, 0.16, vSlopeFactor);
        float steepRock = smoothstep(0.14, 0.30, vSlopeFactor);
        col = mix(col, lateriteCol, clamp(slopeLaterite * 0.92, 0.0, 0.95));
        col = mix(col, rockyCol, steepRock * 0.65);

        // 4. Shaded Western Forest floor leaf-litter across the river (x < -42)
        float forestMask = smoothstep(-40.0, -56.0, vWorldPos.x) * (1.0 - steepRock * 0.5);
        col = mix(col, forestCol * 0.92, forestMask * 0.85);

        // 5. Low-lying wet alluvial brown mud in hollows, riverbanks & lowland basins
        float lowMudMask = smoothstep(-0.35, -2.1, vWorldPos.y) * smoothstep(0.22, 0.72, nDetail + 0.18);
        col = mix(col, mudCol * 0.85, clamp(lowMudMask * 0.92, 0.0, 0.95));

        diffuseColor.rgb = col;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        // Low-lying wet mud & damp clay banks glisten naturally; dry slopes stay matte
        float wetLow = smoothstep(-0.55, -2.2, vWorldPos.y);
        roughnessFactor = mix(roughnessFactor, 0.34, wetLow * 0.75);`,
      );
  };
  groundMaterial.customProgramCacheKey = () => "kerala-polyhaven-5biome-splat-v1";
  groundMaterial.needsUpdate = true;
}

/**
 * Applies the downloaded Poly Haven PBR clay, mud, and rocky trail textures
 * to paddy soil, paddy bunds, riverbanks, and the red-earth Kalari floor!
 */
export function applyKeralaSurfaceTextures(targets: {
  paddySoilMaterial: THREE.MeshStandardMaterial;
  paddyBundMaterial: THREE.MeshStandardMaterial;
  riverBankMaterial: THREE.MeshStandardMaterial;
  kalariEarth: THREE.MeshStandardMaterial;
}) {
  const pack = getKeralaTerrainTextures();

  // Flooded paddy mud floor -> dark wet alluvial brown mud
  const mudSoilDiff = pack.brownMudDiff.clone();
  mudSoilDiff.repeat.set(3, 3);
  mudSoilDiff.needsUpdate = true;
  targets.paddySoilMaterial.color.set("#ffffff");
  targets.paddySoilMaterial.map = mudSoilDiff;
  targets.paddySoilMaterial.bumpMap = pack.brownMudDisp;
  targets.paddySoilMaterial.bumpScale = 0.06;
  targets.paddySoilMaterial.roughnessMap = pack.brownMudRough;
  targets.paddySoilMaterial.roughness = 0.55;
  targets.paddySoilMaterial.needsUpdate = true;

  // Raised paddy embankment bunds -> compacted red-brown Kerala clay mud
  const bundDiff = pack.redClayDiff.clone();
  bundDiff.repeat.set(4, 1);
  bundDiff.needsUpdate = true;
  targets.paddyBundMaterial.color.set("#ffffff");
  targets.paddyBundMaterial.map = bundDiff;
  targets.paddyBundMaterial.bumpMap = pack.redClayDisp;
  targets.paddyBundMaterial.bumpScale = 0.07;
  targets.paddyBundMaterial.roughnessMap = pack.redClayRough;
  targets.paddyBundMaterial.roughness = 0.86;
  targets.paddyBundMaterial.needsUpdate = true;

  // Riverbanks -> moist brown alluvial mud + stones
  const bankDiff = pack.brownMudDiff.clone();
  bankDiff.repeat.set(6, 6);
  bankDiff.needsUpdate = true;
  targets.riverBankMaterial.color.set("#ffffff");
  targets.riverBankMaterial.map = bankDiff;
  targets.riverBankMaterial.bumpMap = pack.brownMudDisp;
  targets.riverBankMaterial.bumpScale = 0.08;
  targets.riverBankMaterial.roughnessMap = pack.brownMudRough;
  targets.riverBankMaterial.roughness = 0.52;
  targets.riverBankMaterial.needsUpdate = true;

  // Kalari traditional red-earth martial arena -> rich Kerala red laterite clay
  const kalariDiff = pack.redClayDiff.clone();
  kalariDiff.repeat.set(3, 2);
  kalariDiff.needsUpdate = true;
  targets.kalariEarth.color.set("#d98b6c");
  targets.kalariEarth.map = kalariDiff;
  targets.kalariEarth.bumpMap = pack.redClayDisp;
  targets.kalariEarth.bumpScale = 0.05;
  targets.kalariEarth.roughness = 0.92;
  targets.kalariEarth.needsUpdate = true;
}
