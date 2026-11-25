import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Solid } from "./collision";

/**
 * 18th-Century Kerala Class-Based Houses, Grand Mana, Veettu Parisaram & Veli (വേലി) System
 * -----------------------------------------------------------------------------------------
 * High-FPS GPU-Instanced architecture:
 *   - Unique buildings (Grand Mana, Padippura, Pathayapura, ~18 class-based village houses)
 *     are placed cleanly with normalized heights.
 *   - ALL repeated Veli walls (Kayyala), woven Olaveli fences, Padavetti gates, Thulasitharas,
 *     Kinar wells, and living green Veli hedges are batched into THREE.InstancedMesh
 *     (~1 draw call per asset type, zero WebGL freeze, zero worldSolids bloat!).
 */

export interface CottageSlot {
  building: THREE.Group;
  isWorkerHut: boolean;
  index: number;
}

export interface BuildKeralaCompoundsConfig {
  scene: THREE.Scene;
  baseUrl: string;
  landlordEstate: THREE.Group;
  landlordEstateSite: readonly [number, number];
  estateRotation: number;
  cottageMeta: readonly CottageSlot[];
  terrainHeight: (x: number, z: number) => number;
  distanceToRoad: (x: number, z: number) => number;
  isWater: (x: number, z: number) => boolean;
  addSolid: (solid: Solid) => void;
  roadRoutes: readonly (readonly [number, number][])[];
  fitImportedModel: (model: THREE.Group, targetHeight: number, rotationY?: number) => THREE.Group;
}

type HouseClass = "tharavadu" | "artisan" | "farmer" | "laborer";

type InstanceTransform = {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale?: number;
};

const gltfLoader = new GLTFLoader();

/**
 * Procedural 512x512 Kerala Swept Red-Laterite Courtyard Soil (Chenmannu Muttam)
 * Generates Albedo + Sobel Tangent-Space Normal + Roughness + Organic Feathered Alpha
 * so front-of-house yards look like grainy, broom-swept Kerala laterite earth blended
 * naturally into the surrounding grass (never flat watercolor).
 */
function createKeralaMuttamMaterial(): THREE.MeshStandardMaterial {
  const size = 512;
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const alpha = new Uint8Array(size * size * 4);
  const heightField = new Float32Array(size * size);

  const hash2 = (ix: number, iy: number): number => {
    const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  };
  const vNoise = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (x: number, y: number, octaves = 4): number => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += vNoise(x * freq, y * freq) * amp;
      freq *= 2.03;
      amp *= 0.5;
    }
    return sum;
  };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const dy = (v - 0.5) * 2;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const dx = (u - 0.5) * 2;
      const idx = y * size + x;
      const p = idx * 4;

      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);

      // Multi-scale laterite soil patches, fine sand grain, and scattered laterite pebbles
      const macroPatch = fbm(u * 5.2 + 3.1, v * 5.2 + 7.4, 4);
      const midGrain = fbm(u * 22.0 + 11.3, v * 22.0 + 2.7, 3);
      const fineSand = hash2(x * 1.37, y * 1.91);
      const pebbleMask = hash2(Math.floor(x / 3) * 19.3, Math.floor(y / 3) * 27.1);
      const isPebble = pebbleMask > 0.965 ? (pebbleMask - 0.965) / 0.035 : 0;

      // Traditional Kerala coconut-leaf broom (Chool) curved sweep grooves
      const sweepArc = Math.sin(dist * 46.0 + Math.sin(ang * 3.0 + macroPatch * 2.5) * 2.4) * 0.5 + 0.5;
      const sweepStrength = Math.max(0, 1.0 - dist * 1.15) * 0.22;

      // Organic irregular courtyard boundary that feathers naturally into grass
      const edgeWarp = (fbm(u * 4.5 + 9.2, v * 4.5 + 1.8, 3) - 0.5) * 0.34;
      const effDist = dist + edgeWarp;
      let mask = 1.0 - Math.max(0, Math.min(1, (effDist - 0.56) / 0.36));
      mask = mask * mask * (3 - 2 * mask);

      // Earth color: rich Kerala red-laterite (Chenmannu) + dusty ochre + darker moist patches
      const damp = Math.max(0, Math.min(1, (macroPatch - 0.38) * 1.4));
      const edgeGrassBlend = Math.max(0, Math.min(1, (effDist - 0.52) / 0.38)) * (0.45 + 0.55 * midGrain);

      let r = 136 + (macroPatch - 0.5) * 44 + (midGrain - 0.5) * 28 + (fineSand - 0.5) * 22 - damp * 20;
      let g = 86 + (macroPatch - 0.5) * 30 + (midGrain - 0.5) * 20 + (fineSand - 0.5) * 15 - damp * 15;
      let b = 54 + (macroPatch - 0.5) * 20 + (midGrain - 0.5) * 14 + (fineSand - 0.5) * 12 - damp * 10;

      // Subtle broom-groove shading
      const sweepShade = (sweepArc - 0.5) * sweepStrength * 28;
      r += sweepShade;
      g += sweepShade * 0.72;
      b += sweepShade * 0.52;

      // Darker iron-rich laterite pebbles & pale quartz sand grains
      if (isPebble > 0) {
        const darkStone = hash2(x, y) > 0.35;
        if (darkStone) {
          r -= isPebble * 48;
          g -= isPebble * 34;
          b -= isPebble * 22;
        } else {
          r += isPebble * 34;
          g += isPebble * 28;
          b += isPebble * 20;
        }
      }

      // Blend subtle olive-moss / grass tint near the feathered outer perimeter
      r = r * (1 - edgeGrassBlend * 0.42) + 74 * (edgeGrassBlend * 0.42);
      g = g * (1 - edgeGrassBlend * 0.42) + 84 * (edgeGrassBlend * 0.42);
      b = b * (1 - edgeGrassBlend * 0.42) + 42 * (edgeGrassBlend * 0.42);

      albedo[p] = Math.max(0, Math.min(255, Math.round(r)));
      albedo[p + 1] = Math.max(0, Math.min(255, Math.round(g)));
      albedo[p + 2] = Math.max(0, Math.min(255, Math.round(b)));
      albedo[p + 3] = 255;

      // Height field for crisp Sobel normal map
      heightField[idx] =
        macroPatch * 0.34 +
        midGrain * 0.32 +
        fineSand * 0.16 +
        sweepArc * sweepStrength +
        isPebble * 0.28;

      // Roughness map (matte gritty soil 0.84..0.98)
      const rVal = Math.max(205, Math.min(252, Math.round((0.88 + (1 - damp) * 0.08 + (fineSand - 0.5) * 0.06 - isPebble * 0.08) * 255)));
      rough[p] = rVal;
      rough[p + 1] = rVal;
      rough[p + 2] = rVal;
      rough[p + 3] = 255;

      const aVal = Math.max(0, Math.min(255, Math.round(mask * 255)));
      alpha[p] = aVal;
      alpha[p + 1] = aVal;
      alpha[p + 2] = aVal;
      alpha[p + 3] = 255;
    }
  }

  // Sobel tangent-space normal map from heightField
  const strength = 3.2;
  const sampleH = (sx: number, sy: number) => heightField[((sy + size) % size) * size + ((sx + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleH(x - 1, y - 1);
      const tc = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const ml = sampleH(x - 1, y);
      const mr = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const bc = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      const nx = -gx * strength;
      const ny = -gy * strength;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      const p = (y * size + x) * 4;
      normal[p] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normal[p + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normal[p + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      normal[p + 3] = 255;
    }
  }

  const makeTex = (data: Uint8Array, isColor: boolean): THREE.DataTexture => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };

  return new THREE.MeshStandardMaterial({
    map: makeTex(albedo, true),
    normalMap: makeTex(normal, false),
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: makeTex(rough, false),
    roughness: 1.0,
    metalness: 0.0,
    alphaMap: makeTex(alpha, false),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function loadHouseGlb(baseUrl: string, relPath: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      `${baseUrl}models/${relPath}`,
      (gltf) => {
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        resolve(gltf.scene);
      },
      undefined,
      reject,
    );
  });
}

/**
 * Converts a loaded GLB template into GPU-instanced meshes (1 draw call per sub-mesh)
 * normalized to `targetHeight` with its bottom resting cleanly at y = 0.
 */
function addInstancedTemplate(
  parent: THREE.Object3D,
  template: THREE.Group,
  targetHeight: number,
  transforms: readonly InstanceTransform[],
  castShadow = false,
): void {
  if (transforms.length === 0) return;

  template.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(template);
  const size = box.getSize(new THREE.Vector3());
  const baseScale = targetHeight / Math.max(size.y, 0.001);
  const offsetX = -((box.min.x + box.max.x) * 0.5) * baseScale;
  const offsetY = -box.min.y * baseScale;
  const offsetZ = -((box.min.z + box.max.z) * 0.5) * baseScale;

  const normMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(offsetX, offsetY, offsetZ),
    new THREE.Quaternion(),
    new THREE.Vector3(baseScale, baseScale, baseScale),
  );

  const subMeshes: { geom: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }[] = [];
  template.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      const g = obj.geometry.clone();
      g.applyMatrix4(obj.matrixWorld);
      g.applyMatrix4(normMatrix);
      subMeshes.push({ geom: g, mat: obj.material });
    }
  });

  const dummy = new THREE.Object3D();
  for (const { geom, mat } of subMeshes) {
    const inst = new THREE.InstancedMesh(geom, mat, transforms.length);
    inst.castShadow = castShadow;
    inst.receiveShadow = true;
    for (let i = 0; i < transforms.length; i++) {
      const t = transforms[i];
      dummy.position.set(t.x, t.y, t.z);
      dummy.rotation.set(0, t.rotY, 0);
      dummy.scale.setScalar(t.scale ?? 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    parent.add(inst);
  }
}

function classifyHouseLot(x: number, z: number, isWorkerHut: boolean, index: number): HouseClass {
  // Paddy-field worker huts & western riverside / southern wetland fringe -> Farmer Chala & Laborer Kudil
  if (isWorkerHut || x < 10) {
    return index % 2 === 0 ? "farmer" : "laborer";
  }
  // Elevated East/Northeast Parambu (Temple, Kalari & Mana corridor) -> Nair Tharavadu (Kayyala Veli + Odu roof)
  if ((x >= 30 && z >= -30) || (x >= 54 && z >= -42) || (x >= 30 && z >= 0)) {
    return "tharavadu";
  }
  // Central village & Angadi bazaar fringe -> Artisan Veedu (carpenters, potters, weavers)
  return "artisan";
}

export function buildKeralaHousesAndCompounds(config: BuildKeralaCompoundsConfig): void {
  const {
    scene,
    baseUrl,
    landlordEstate,
    landlordEstateSite,
    estateRotation,
    cottageMeta,
    terrainHeight,
    distanceToRoad,
    isWater,
    addSolid,
    roadRoutes,
    fitImportedModel,
  } = config;

  const compoundRoot = new THREE.Group();
  compoundRoot.name = "kerala_veettu_parisaram_and_veli";
  scene.add(compoundRoot);

  const cosE = Math.cos(estateRotation);
  const sinE = Math.sin(estateRotation);
  const estateToWorld = (lx: number, lz: number): [number, number] => [
    landlordEstateSite[0] + lx * cosE + lz * sinE,
    landlordEstateSite[1] - lx * sinE + lz * cosE,
  ];

  // Single instanced mesh for all swept red-earth Muttam courtyard pads (1 draw call!)
  const muttamTransforms: { x: number; y: number; z: number; rx: number; rz: number; rotY: number }[] = [];

  Promise.all([
    loadHouseGlb(baseUrl, "houses/mana_nalukettu.glb"),
    loadHouseGlb(baseUrl, "houses/mana_padippura.glb"),
    loadHouseGlb(baseUrl, "houses/mana_pathayapura.glb"),
    loadHouseGlb(baseUrl, "houses/tharavadu_ekasala.glb"),
    loadHouseGlb(baseUrl, "houses/artisan_veedu.glb"),
    loadHouseGlb(baseUrl, "houses/farmer_chala.glb"),
    loadHouseGlb(baseUrl, "houses/laborer_kudil.glb"),
    loadHouseGlb(baseUrl, "houses/veli_kayyala_wall.glb"),
    loadHouseGlb(baseUrl, "houses/veli_olaveli_fence.glb"),
    loadHouseGlb(baseUrl, "houses/veli_gate_padavetti.glb"),
    loadHouseGlb(baseUrl, "houses/prop_thulasithara.glb"),
    loadHouseGlb(baseUrl, "houses/prop_kerala_kinar.glb"),
  ])
    .then(
      ([
        manaModel,
        padippuraModel,
        pathayapuraModel,
        tharavaduModel,
        artisanModel,
        farmerModel,
        laborerModel,
        kayyalaModel,
        olaveliModel,
        gateModel,
        thulasiModel,
        kinarModel,
      ]) => {
        const kayyalaList: InstanceTransform[] = [];
        const olaveliList: InstanceTransform[] = [];
        const gateList: InstanceTransform[] = [];
        const thulasiList: InstanceTransform[] = [];
        const kinarList: InstanceTransform[] = [];
        const hedgeBushes: { x: number; y: number; z: number; scale: number; isFlower: boolean }[] = [];

        // --------------------------------------------------------------------
        // 1) GRAND LANDLORD MANA (Nalukettu + Padippura + Pathayapura + Kayyala Veli)
        // --------------------------------------------------------------------
        for (const child of [...landlordEstate.children]) {
          if (!(child instanceof THREE.PointLight)) {
            landlordEstate.remove(child);
          }
        }

        const mana = fitImportedModel(manaModel.clone(true), 9.8, Math.PI);
        mana.position.set(0, 0, -2.0);
        landlordEstate.add(mana);

        const padippura = fitImportedModel(padippuraModel.clone(true), 5.6, Math.PI);
        padippura.position.set(0, 0, 12.4);
        landlordEstate.add(padippura);

        const pathayapura = fitImportedModel(pathayapuraModel.clone(true), 5.2, -Math.PI * 0.5);
        pathayapura.position.set(11.0, 0, 5.2);
        landlordEstate.add(pathayapura);
        const [pathWx, pathWz] = estateToWorld(11.0, 5.2);
        addSolid({ x: pathWx, z: pathWz, halfX: 2.5, halfZ: 3.7, rotation: estateRotation });

        const [mtX, mtZ] = estateToWorld(-4.2, 8.8);
        thulasiList.push({ x: mtX, y: terrainHeight(mtX, mtZ) - 0.02, z: mtZ, rotY: estateRotation, scale: 1.08 });

        const [mkX, mkZ] = estateToWorld(-9.6, 4.8);
        kinarList.push({ x: mkX, y: terrainHeight(mkX, mkZ) - 0.03, z: mkZ, rotY: estateRotation + 0.4, scale: 1.05 });
        addSolid({ x: mkX, z: mkZ, halfX: 1.0, halfZ: 1.0, rotation: 0 });

        const [mmX, mmZ] = estateToWorld(0, 6.2);
        muttamTransforms.push({ x: mmX, y: terrainHeight(mmX, mmZ) + 0.035, z: mmZ, rx: 12.0, rz: 7.2, rotY: estateRotation });

        const queueEstateKayyala = (lx: number, lz: number, rotY: number) => {
          const [wx, wz] = estateToWorld(lx, lz);
          if (isWater(wx, wz)) return;
          kayyalaList.push({ x: wx, y: terrainHeight(wx, wz) - 0.04, z: wz, rotY, scale: 1.08 });
        };
        for (const lx of [-11.5, -7.5, -4.6, 4.6, 7.5, 11.5]) {
          queueEstateKayyala(lx, 12.4, estateRotation);
        }
        for (const lx of [-12, -8, -4, 0, 4, 8, 12]) {
          queueEstateKayyala(lx, -13.2, estateRotation);
        }
        for (const lz of [-11, -7, -3, 1, 5, 9]) {
          queueEstateKayyala(-13.8, lz, estateRotation + Math.PI * 0.5);
          queueEstateKayyala(14.2, lz, estateRotation + Math.PI * 0.5);
        }
        // Flowering Chethi/Ixora living hedges flanking the Mana Padippura
        for (const lx of [-4.2, 4.2, -9.2, 9.2]) {
          const [wx, wz] = estateToWorld(lx, 13.8);
          if (!isWater(wx, wz)) {
            hedgeBushes.push({ x: wx, y: terrainHeight(wx, wz), z: wz, scale: 1.25, isFlower: true });
          }
        }

        // --------------------------------------------------------------------
        // 2) CLASS-BASED VILLAGE HOUSES + VEETTU PARISARAM + VELI (വേലി) FENCES
        // --------------------------------------------------------------------
        const classTemplates: Record<HouseClass, { model: THREE.Group; height: number; pad: number; useKayyala: boolean }> = {
          tharavadu: { model: tharavaduModel, height: 6.1, pad: 6.2, useKayyala: true },
          artisan: { model: artisanModel, height: 5.05, pad: 5.3, useKayyala: false },
          farmer: { model: farmerModel, height: 4.35, pad: 4.7, useKayyala: false },
          laborer: { model: laborerModel, height: 3.65, pad: 4.1, useKayyala: false },
        };

        const queueVeli = (wx: number, wz: number, rotY: number, useKayyala: boolean) => {
          // Check center + both endpoints of the fence segment so NO fence ever encroaches on a road!
          const halfLen = useKayyala ? 2.0 : 1.8;
          const cosA = Math.cos(rotY);
          const sinA = Math.sin(rotY);
          for (const d of [-halfLen, 0, halfLen]) {
            const px = wx + cosA * d;
            const pz = wz - sinA * d;
            if (isWater(px, pz) || distanceToRoad(px, pz) < 4.2) return;
          }
          const entry: InstanceTransform = { x: wx, y: terrainHeight(wx, wz) - 0.04, z: wz, rotY };
          if (useKayyala) kayyalaList.push(entry);
          else olaveliList.push(entry);
        };

        cottageMeta.forEach(({ building, isWorkerHut, index }) => {
          const bx = building.position.x;
          const bz = building.position.z;
          const rotY = building.rotation.y;
          const hClass = classifyHouseLot(bx, bz, isWorkerHut, index);
          const spec = classTemplates[hClass];

          for (const child of [...building.children]) {
            if (!(child instanceof THREE.PointLight)) {
              building.remove(child);
            }
          }
          building.add(fitImportedModel(spec.model.clone(true), spec.height, 0));

          const cosR = Math.cos(rotY);
          const sinR = Math.sin(rotY);
          const toWorld = (lx: number, lz: number): [number, number] => [
            bx + lx * cosR + lz * sinR,
            bz - lx * sinR + lz * cosR,
          ];

          const [mx, mz] = toWorld(0, -spec.pad * 0.55);
          if (!isWater(mx, mz)) {
            muttamTransforms.push({
              x: mx,
              y: terrainHeight(mx, mz) + 0.035,
              z: mz,
              rx: spec.pad * 0.76,
              rz: spec.pad * 0.65,
              rotY,
            });
          }

          if (hClass !== "laborer") {
            const [tx, tz] = toWorld(hClass === "tharavadu" ? 3.2 : 2.6, -spec.pad * 0.85);
            if (!isWater(tx, tz) && distanceToRoad(tx, tz) > 4.0) {
              thulasiList.push({ x: tx, y: terrainHeight(tx, tz) - 0.02, z: tz, rotY });
            }
          }

          if (hClass === "tharavadu" || (hClass === "artisan" && index % 2 === 0)) {
            const [kx, kz] = toWorld(-spec.pad * 0.72, -1.2);
            if (!isWater(kx, kz) && distanceToRoad(kx, kz) > 4.2) {
              kinarList.push({ x: kx, y: terrainHeight(kx, kz) - 0.03, z: kz, rotY: rotY + 0.5 });
            }
          }

          const halfW = spec.pad + 0.8;
          const frontZ = -(spec.pad + 1.1);
          const backZ = spec.pad * 0.82;

          const [gx, gz] = toWorld(0, frontZ);
          if (!isWater(gx, gz) && distanceToRoad(gx, gz) > 4.2) {
            gateList.push({ x: gx, y: terrainHeight(gx, gz) - 0.03, z: gz, rotY });
          }
          for (const side of [-1, 1]) {
            const [fx, fz] = toWorld(side * (halfW * 0.58), frontZ);
            queueVeli(fx, fz, rotY, spec.useKayyala);
            const [hx, hz] = toWorld(side * 2.2, frontZ - 0.55);
            if (!isWater(hx, hz) && distanceToRoad(hx, hz) > 3.8) {
              hedgeBushes.push({ x: hx, y: terrainHeight(hx, hz), z: hz, scale: 0.9 + (index % 3) * 0.12, isFlower: (index + side) % 2 === 0 });
            }
          }
          for (const side of [-1, 1]) {
            for (const lz of [frontZ + 2.4, 0.2, backZ - 1.2]) {
              const [sx, sz] = toWorld(side * halfW, lz);
              queueVeli(sx, sz, rotY + Math.PI * 0.5, spec.useKayyala);
            }
          }
          for (const lx of [-halfW * 0.5, halfW * 0.5]) {
            const [rx, rz] = toWorld(lx, backZ);
            queueVeli(rx, rz, rotY, spec.useKayyala);
          }
        });

        // --------------------------------------------------------------------
        // 3) VILLAGE EDAVAZHI LANE VELI FENCES (GPU Instanced)
        // --------------------------------------------------------------------
        const edavazhiRouteIndices = [1, 2, 5, 6, 10, 11];
        for (const rIdx of edavazhiRouteIndices) {
          const pts = roadRoutes[rIdx];
          if (!pts || pts.length < 2) continue;
          const isManaAve = rIdx === 10;
          for (let i = 0; i < pts.length - 1; i++) {
            const [x0, z0] = pts[i];
            const [x1, z1] = pts[i + 1];
            const segLen = Math.hypot(x1 - x0, z1 - z0);
            const steps = Math.max(1, Math.floor(segLen / 5.4));
            const dx = (x1 - x0) / segLen;
            const dz = (z1 - z0) / segLen;
            const nx = -dz;
            const nz = dx;
            const yaw = Math.atan2(dx, dz) + Math.PI * 0.5;
            for (let s = 0; s < steps; s++) {
              const t = (s + 0.5) / steps;
              const cx = x0 + (x1 - x0) * t;
              const cz = z0 + (z1 - z0) * t;
              for (const side of [-1, 1]) {
                if (!isManaAve && (i + s + (side > 0 ? 1 : 0)) % 3 === 0) continue;
                const wx = cx + nx * side * 4.55;
                const wz = cz + nz * side * 4.55;
                if (
                  Math.hypot(wx - landlordEstateSite[0], wz - landlordEstateSite[1]) < 16 ||
                  cottageMeta.some((c) => Math.hypot(wx - c.building.position.x, wz - c.building.position.z) < 6.4)
                ) {
                  continue;
                }
                queueVeli(wx, wz, yaw, isManaAve || (rIdx === 1 && s % 2 === 0));
              }
            }
          }
        }

        // Batch ALL repeated Veli walls, fences, gates, Thulasitharas & Kinars into GPU InstancedMeshes!
        addInstancedTemplate(compoundRoot, kayyalaModel, 1.58, kayyalaList, true);
        addInstancedTemplate(compoundRoot, olaveliModel, 1.38, olaveliList, false);
        addInstancedTemplate(compoundRoot, gateModel, 1.62, gateList, false);
        addInstancedTemplate(compoundRoot, thulasiModel, 1.28, thulasiList, false);
        addInstancedTemplate(compoundRoot, kinarModel, 2.15, kinarList, true);

        // Batch ALL swept red-earth Muttam pads into 1 single InstancedMesh draw call
        // Textured 512x512 Kerala Chenmannu red-laterite soil with Normal + Roughness + Organic Feathered Alpha
        if (muttamTransforms.length > 0) {
          const muttamGeom = new THREE.PlaneGeometry(2.2, 2.2, 1, 1);
          muttamGeom.rotateX(-Math.PI * 0.5);
          const muttamMat = createKeralaMuttamMaterial();
          const muttamInst = new THREE.InstancedMesh(muttamGeom, muttamMat, muttamTransforms.length);
          muttamInst.receiveShadow = true;
          const d = new THREE.Object3D();
          muttamTransforms.forEach((m, i) => {
            d.position.set(m.x, m.y, m.z);
            d.rotation.set(0, m.rotY, 0);
            d.scale.set(m.rx, 1, m.rz);
            d.updateMatrix();
            muttamInst.setMatrixAt(i, d.matrix);
          });
          muttamInst.instanceMatrix.needsUpdate = true;
          compoundRoot.add(muttamInst);
        }

        // Batch living green Veli hedge bushes & Chethi/Ixora blooms into 2 ultra-light InstancedMeshes
        if (hedgeBushes.length > 0) {
          const bushGeom = new THREE.DodecahedronGeometry(0.55, 1);
          const greenMat = new THREE.MeshStandardMaterial({ color: "#2d5a27", roughness: 0.9 });
          const flowerMat = new THREE.MeshStandardMaterial({ color: "#b62d26", roughness: 0.85 });
          const foliageInst = new THREE.InstancedMesh(bushGeom, greenMat, hedgeBushes.length);
          foliageInst.receiveShadow = true;
          const flowerList = hedgeBushes.filter((b) => b.isFlower);
          const bloomGeom = new THREE.DodecahedronGeometry(0.18, 0);
          const bloomInst = new THREE.InstancedMesh(bloomGeom, flowerMat, Math.max(1, flowerList.length * 3));
          const d = new THREE.Object3D();
          hedgeBushes.forEach((b, i) => {
            d.position.set(b.x, b.y + 0.36 * b.scale, b.z);
            d.rotation.set(0, i * 1.1, 0);
            d.scale.set(b.scale * 1.15, b.scale * 0.82, b.scale * 1.15);
            d.updateMatrix();
            foliageInst.setMatrixAt(i, d.matrix);
          });
          let bi = 0;
          flowerList.forEach((b, i) => {
            for (const [ox, oy, oz] of [[-0.22, 0.56, 0.16], [0.24, 0.50, -0.14], [0.02, 0.66, 0.04]]) {
              d.position.set(b.x + ox * b.scale, b.y + oy * b.scale, b.z + oz * b.scale);
              d.rotation.set(i, bi, 0);
              d.scale.setScalar(b.scale);
              d.updateMatrix();
              bloomInst.setMatrixAt(bi++, d.matrix);
            }
          });
          foliageInst.instanceMatrix.needsUpdate = true;
          bloomInst.instanceMatrix.needsUpdate = true;
          compoundRoot.add(foliageInst);
          if (flowerList.length > 0) compoundRoot.add(bloomInst);
        }

        console.info(
          `Loaded GPU-instanced 18th-century Kerala Houses, Grand Mana & Veli (${kayyalaList.length} Kayyala, ${olaveliList.length} Olaveli, ${cottageMeta.length} homesteads).`,
        );
      },
    )
    .catch((err) => {
      console.warn(
        "New Kerala house/Mana/Veli GLBs not generated yet — run scripts/generate_kerala_houses.py in Blender!",
        err,
      );
    });
}
