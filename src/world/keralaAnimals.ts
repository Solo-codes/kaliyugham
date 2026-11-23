import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { Point2 } from "./hydrology";
import { spawnCowActor, updateCowHerd, type CowActor } from "./cowAI";

export type RiggedAnimalTemplate = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

/**
 * 18th-Century Rural Kerala Animals & Water Creatures — Behavior & Physics Engine
 *
 * Implements:
 * - Articulated quadruped & biped gait physics (diagonal leg phase, terrain slope pitch,
 *   grazing/pecking head animation, tail swish/wag, wing-flap glide hops)
 * - Species-specific AI state machines (graze, wander, rest/midday shade, curious approach,
 *   startle/flee with acceleration & drag, herd separation, daily circadian rhythm)
 * - Aquatic physics for river, pond & paddy water creatures:
 *   * Boids-style Karimeen & Rohu fish schooling + sinusoidal tail propulsion + parabolic leaps
 *   * Buoyant wave-bobbing Kuttanadan ducks with dabbling dives
 *   * Basking & paddling freshwater turtles
 *   * Parabolic gravity-arc leaping paddy & pond frogs
 */

export type LandSpecies =
  | "kerala_cow"
  | "water_buffalo"
  | "malabari_goat"
  | "village_dog"
  | "rooster"
  | "hen"
  | "peacock"
  | "malabar_squirrel"
  | "cattle_egret";

export type WaterSpecies =
  | "karimeen_fish"
  | "rohu_carp"
  | "freshwater_turtle"
  | "paddy_frog"
  | "kuttanadan_duck";

type AnimalParts = {
  head?: THREE.Object3D;
  tail?: THREE.Object3D;
  legFL?: THREE.Object3D;
  legFR?: THREE.Object3D;
  legBL?: THREE.Object3D;
  legBR?: THREE.Object3D;
  wingL?: THREE.Object3D;
  wingR?: THREE.Object3D;
  tailFin?: THREE.Object3D;
  baseHeadRotX: number;
  baseTailRotY: number;
};

type LandState = "idle" | "graze" | "wander" | "flee" | "curious" | "rest" | "hop";

type LandActor = {
  species: LandSpecies;
  group: THREE.Group;
  parts: AnimalParts;
  anchorX: number;
  anchorZ: number;
  homeRadius: number;
  x: number;
  z: number;
  yOffset: number;
  vx: number;
  vz: number;
  vy: number;
  yaw: number;
  pitch: number;
  walkSpeed: number;
  fleeSpeed: number;
  alertRadius: number;
  stridePhase: number;
  state: LandState;
  stateTimer: number;
  targetX: number;
  targetZ: number;
  phaseOffset: number;
  isBiped: boolean;
  slopeSampleDist: number;
  mixer?: THREE.AnimationMixer;
  animWalk?: THREE.AnimationAction;
  animRun?: THREE.AnimationAction;
  animIdle?: THREE.AnimationAction;
  animGraze?: THREE.AnimationAction;
  activeAction?: THREE.AnimationAction;
};

type WaterActor = {
  species: WaterSpecies;
  group: THREE.Group;
  parts: AnimalParts;
  x: number;
  z: number;
  yOffset: number;
  vx: number;
  vz: number;
  vy: number;
  yaw: number;
  depthOffset: number; // negative for underwater fish, 0 for surface ducks/turtles
  homeX: number;
  homeZ: number;
  roamRadius: number;
  baseSpeed: number;
  phase: number;
  actionTimer: number;
  isLeaping: boolean;
  isDabbling: boolean;
  dabbleTimer: number;
  waterSurfaceY: number;
};

export type KeralaAnimalSystem = {
  root: THREE.Group;
  landActors: LandActor[];
  waterActors: WaterActor[];
  cows: CowActor[];
  externalMixers: THREE.AnimationMixer[];
  distanceToRoad: (x: number, z: number) => number;
  isForbiddenZone?: (x: number, z: number) => boolean;
};

export type WaterSample = {
  surfaceY: number;
  bedY?: number;
} | null | undefined;

export type CreateKeralaAnimalSystemOptions = {
  scene: THREE.Scene;
  loadAssetTemplate: (file: string) => Promise<THREE.Group>;
  fitImportedModel: (model: THREE.Group, targetHeight: number, yawOffset?: number) => THREE.Group;
  terrainHeight: (x: number, z: number) => number;
  getWaterInfo: (x: number, z: number) => WaterSample;
  distanceToRoad: (x: number, z: number) => number;
  distanceToRiver: (x: number, z: number) => number;
  riverPoints: readonly Point2[];
  pondCenter: readonly [number, number];
  paddyPlots: readonly Point2[];
  buildingSites: readonly Point2[];
  templeSite: readonly [number, number];
  isForbiddenZone?: (x: number, z: number) => boolean;
  onTemplatesLoaded?: (templates: {
    cow?: RiggedAnimalTemplate;
    doubleOx?: RiggedAnimalTemplate;
    buffalo?: RiggedAnimalTemplate;
    hen?: RiggedAnimalTemplate;
    duck?: RiggedAnimalTemplate;
    elephant?: RiggedAnimalTemplate;
    karimeen?: RiggedAnimalTemplate;
    rohu?: RiggedAnimalTemplate;
    spawnAnimatedClone: (
      tpl: RiggedAnimalTemplate,
      targetHeight: number,
      yawOffset?: number,
      preferredClipPatterns?: string[],
      managedExternally?: boolean,
    ) => THREE.Group;
  }) => void;
};

const LAND_SPECS: Record<
  LandSpecies,
  {
    file: string;
    height: number;
    walkSpeed: number;
    fleeSpeed: number;
    alertRadius: number;
    isBiped: boolean;
    slopeDist: number;
  }
> = {
  kerala_cow: {
    file: "animals/farm_cow_animated_dairy_cattle.glb",
    height: 1.36,
    walkSpeed: 0.78,
    fleeSpeed: 2.0,
    alertRadius: 0,
    isBiped: false,
    slopeDist: 0.65,
  },
  water_buffalo: {
    file: "animals/animal_water_buffalo.glb",
    height: 1.44,
    walkSpeed: 0.68,
    fleeSpeed: 1.8,
    alertRadius: 0,
    isBiped: false,
    slopeDist: 0.72,
  },
  malabari_goat: {
    file: "animals/animal_malabari_goat.glb",
    height: 0.86,
    walkSpeed: 1.15,
    fleeSpeed: 3.1,
    alertRadius: 4.2,
    isBiped: false,
    slopeDist: 0.38,
  },
  village_dog: {
    file: "animals/animal_village_dog.glb",
    height: 0.76,
    walkSpeed: 1.45,
    fleeSpeed: 3.4,
    alertRadius: 6.5, // curious approach radius for dog
    isBiped: false,
    slopeDist: 0.36,
  },
  rooster: {
    file: "animals/animal_rooster.glb",
    height: 0.56,
    walkSpeed: 0.82,
    fleeSpeed: 2.75,
    alertRadius: 3.6,
    isBiped: true,
    slopeDist: 0.2,
  },
  hen: {
    file: "animals/animal_hen.glb",
    height: 0.44,
    walkSpeed: 0.72,
    fleeSpeed: 2.55,
    alertRadius: 3.8,
    isBiped: true,
    slopeDist: 0.18,
  },
  peacock: {
    file: "animals/animal_peacock.glb",
    height: 1.05,
    walkSpeed: 0.85,
    fleeSpeed: 2.8,
    alertRadius: 5.0,
    isBiped: true,
    slopeDist: 0.35,
  },
  malabar_squirrel: {
    file: "animals/animal_malabar_squirrel.glb",
    height: 0.34,
    walkSpeed: 1.7,
    fleeSpeed: 4.0,
    alertRadius: 5.5,
    isBiped: false,
    slopeDist: 0.2,
  },
  cattle_egret: {
    file: "animals/animal_cattle_egret.glb",
    height: 0.82,
    walkSpeed: 0.65,
    fleeSpeed: 3.3,
    alertRadius: 4.8,
    isBiped: true,
    slopeDist: 0.24,
  },
};

const WATER_SPECS: Record<
  WaterSpecies,
  {
    file: string;
    height: number;
    baseSpeed: number;
    depthOffset: number;
  }
> = {
  karimeen_fish: {
    file: "animals/water_karimeen_fish.glb",
    height: 0.24,
    baseSpeed: 1.15,
    depthOffset: -0.22,
  },
  rohu_carp: {
    file: "animals/water_rohu_carp.glb",
    height: 0.22,
    baseSpeed: 1.35,
    depthOffset: -0.28,
  },
  freshwater_turtle: {
    file: "animals/water_freshwater_turtle.glb",
    height: 0.22,
    baseSpeed: 0.38,
    depthOffset: -0.02,
  },
  paddy_frog: {
    file: "animals/water_paddy_frog.glb",
    height: 0.14,
    baseSpeed: 0.6,
    depthOffset: 0.01,
  },
  kuttanadan_duck: {
    file: "animals/water_kuttanadan_duck.glb",
    height: 0.42,
    baseSpeed: 0.72,
    depthOffset: -0.05,
  },
};

function findAnimalParts(root: THREE.Object3D): AnimalParts {
  const parts: AnimalParts = { baseHeadRotX: 0, baseTailRotY: 0 };
  root.traverse((obj) => {
    const raw = obj.name;
    if (!raw || raw.includes("_Foot")) return;
    const base = raw.replace(/\.?\d+$/, "");
    const low = raw.toLowerCase();
    if ((base === "Head" || low === "neck2_010" || low === "neck_011") && !parts.head) {
      parts.head = obj;
      parts.baseHeadRotX = obj.rotation.x;
    } else if ((base === "Tail" || low === "tail0_025") && !parts.tail) {
      parts.tail = obj;
      parts.baseTailRotY = obj.rotation.y;
    } else if ((base === "Leg_FL" || low === "lfl1_017") && !parts.legFL) parts.legFL = obj;
    else if ((base === "Leg_FR" || low === "lfr1_021") && !parts.legFR) parts.legFR = obj;
    else if ((base === "Leg_BL" || low === "lbl1_02") && !parts.legBL) parts.legBL = obj;
    else if ((base === "Leg_BR" || low === "lbr1_031") && !parts.legBR) parts.legBR = obj;
    else if (base === "Wing_L" && !parts.wingL) parts.wingL = obj;
    else if (base === "Wing_R" && !parts.wingR) parts.wingR = obj;
    else if (base === "TailFin" && !parts.tailFin) parts.tailFin = obj;
  });
  return parts;
}

function makeRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Asynchronously loads all 15 Blender-exported Kerala animals & water creatures from
 * `public/models/animals/*.glb` and populates pastures, village yards, temple groves,
 * paddy fields, the pond, and the river.
 */
const animalGltfLoader = new GLTFLoader();
const riggedCache = new Map<string, Promise<RiggedAnimalTemplate>>();

function loadRiggedTemplate(file: string): Promise<RiggedAnimalTemplate> {
  let p = riggedCache.get(file);
  if (!p) {
    p = new Promise<RiggedAnimalTemplate>((resolve, reject) => {
      animalGltfLoader.load(
        `${import.meta.env.BASE_URL}models/${file}`,
        (gltf) => {
          gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          resolve({ scene: gltf.scene, animations: gltf.animations ?? [] });
        },
        undefined,
        reject,
      );
    });
    riggedCache.set(file, p);
  }
  return p;
}

function findAnimClip(clips: THREE.AnimationClip[], patterns: string[]): THREE.AnimationClip | undefined {
  for (const pat of patterns) {
    const exact = clips.find((c) => c.name.toLowerCase() === pat);
    if (exact) return exact;
  }
  for (const pat of patterns) {
    const sub = clips.find((c) => c.name.toLowerCase().includes(pat));
    if (sub) return sub;
  }
  return undefined;
}

export function createKeralaAnimalSystem(
  options: CreateKeralaAnimalSystemOptions,
): KeralaAnimalSystem {
  const root = new THREE.Group();
  root.name = "kerala_animals_and_water_creatures";
  options.scene.add(root);

  const system: KeralaAnimalSystem = {
    root,
    landActors: [],
    waterActors: [],
    cows: [],
    externalMixers: [],
    distanceToRoad: options.distanceToRoad,
    isForbiddenZone: options.isForbiddenZone,
  };

  const spawnAnimatedClone = (
    tpl: RiggedAnimalTemplate,
    targetHeight: number,
    yawOffset = 0,
    preferredClipPatterns: string[] = ["walk", "draft", "idle", "eat"],
    managedExternally = false,
  ): THREE.Group => {
    const cloned = cloneSkeleton(tpl.scene) as THREE.Group;
    const fitted = options.fitImportedModel(cloned, targetHeight, yawOffset);
    if (tpl.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(fitted);
      const clip = findAnimClip(tpl.animations, preferredClipPatterns) ?? tpl.animations[0];
      if (clip) {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        mixer.update(Math.random() * 2.5);
        fitted.userData.animAction = action;
      }
      fitted.userData.animMixer = mixer;
      if (!managedExternally) {
        system.externalMixers.push(mixer);
      }
    }
    return fitted;
  };

  const rand = makeRand(1795);
  const landEntries = Object.entries(LAND_SPECS) as [LandSpecies, (typeof LAND_SPECS)[LandSpecies]][];
  const waterEntries = Object.entries(WATER_SPECS) as [WaterSpecies, (typeof WATER_SPECS)[WaterSpecies]][];

  Promise.allSettled([
    Promise.allSettled(landEntries.map(([, s]) => loadRiggedTemplate(s.file))),
    Promise.allSettled(waterEntries.map(([, s]) => loadRiggedTemplate(s.file))),
    loadRiggedTemplate("animals/animal_temple_elephant.glb"),
    loadRiggedTemplate("animals/double_ox_walk.glb"),
    loadRiggedTemplate("animals/animal_kerala_cow.glb"),
  ]).then(([landRes, waterRes, elephantRes, doubleOxRes, fallbackCowRes]) => {
    const landTemplates = new Map<LandSpecies, RiggedAnimalTemplate>();
    if (landRes.status === "fulfilled") {
      landRes.value.forEach((r, idx) => {
        if (r.status === "fulfilled") landTemplates.set(landEntries[idx][0], r.value);
      });
    }
    if (!landTemplates.has("kerala_cow") && fallbackCowRes.status === "fulfilled") {
      landTemplates.set("kerala_cow", fallbackCowRes.value);
    }

    const waterTemplates = new Map<WaterSpecies, RiggedAnimalTemplate>();
    if (waterRes.status === "fulfilled") {
      waterRes.value.forEach((r, idx) => {
        if (r.status === "fulfilled") waterTemplates.set(waterEntries[idx][0], r.value);
      });
    }

    const elephantTpl = elephantRes.status === "fulfilled" ? elephantRes.value : undefined;
    const doubleOxTpl = doubleOxRes.status === "fulfilled" ? doubleOxRes.value : undefined;
    if (options.onTemplatesLoaded) {
      options.onTemplatesLoaded({
        cow: landTemplates.get("kerala_cow"),
        doubleOx: doubleOxTpl,
        buffalo: landTemplates.get("water_buffalo"),
        hen: landTemplates.get("hen"),
        duck: waterTemplates.get("kuttanadan_duck"),
        elephant: elephantTpl,
        karimeen: waterTemplates.get("karimeen_fish"),
        rohu: waterTemplates.get("rohu_carp"),
        spawnAnimatedClone,
      });
    }

    const spawnLand = (
      species: LandSpecies,
      x: number,
      z: number,
      homeRadius: number,
      scaleJitter = 1.0,
    ) => {
      const tpl = landTemplates.get(species);
      if (!tpl || options.isForbiddenZone?.(x, z)) return;
      const spec = LAND_SPECS[species];
      const group = new THREE.Group();
      const model = options.fitImportedModel(
        cloneSkeleton(tpl.scene) as THREE.Group,
        spec.height * scaleJitter,
        0,
      );
      group.add(model);
      const y = options.terrainHeight(x, z);
      group.position.set(x, y, z);
      const yaw = rand() * Math.PI * 2;
      group.rotation.y = yaw;
      root.add(group);

      let mixer: THREE.AnimationMixer | undefined;
      let animWalk: THREE.AnimationAction | undefined;
      let animRun: THREE.AnimationAction | undefined;
      let animIdle: THREE.AnimationAction | undefined;
      let animGraze: THREE.AnimationAction | undefined;
      let activeAction: THREE.AnimationAction | undefined;
      if (tpl.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        // Never map sit/stand idle2 as a walk or graze clip! Only pick true locomotion/graze clips.
        const walkClip = findAnimClip(tpl.animations, ["walk", "trot", "draft"]);
        const runClip = findAnimClip(tpl.animations, ["run", "gallop", "canter", "walk"]);
        const idleClip = findAnimClip(tpl.animations, ["idle1", "idle", "stand"]);
        const grazeClip = findAnimClip(tpl.animations, ["eat", "graze", "idle1"]);
        animWalk = walkClip ? mixer.clipAction(walkClip) : undefined;
        animRun = runClip ? mixer.clipAction(runClip) : undefined;
        animIdle = idleClip ? mixer.clipAction(idleClip) : undefined;
        animGraze = grazeClip ? mixer.clipAction(grazeClip) : undefined;
        [animWalk, animRun, animIdle, animGraze].forEach((act) =>
          act?.setLoop(THREE.LoopRepeat, Infinity),
        );
        activeAction = animIdle ?? animGraze ?? animWalk ?? mixer.clipAction(tpl.animations[0]);
        activeAction?.play();
        mixer.update(rand() * 2.0);
      }

      system.landActors.push({
        species,
        group,
        parts: findAnimalParts(model),
        anchorX: x,
        anchorZ: z,
        homeRadius,
        x,
        z,
        yOffset: 0,
        vx: 0,
        vz: 0,
        vy: 0,
        yaw,
        pitch: 0,
        walkSpeed: spec.walkSpeed * (0.9 + rand() * 0.2),
        fleeSpeed: spec.fleeSpeed,
        alertRadius: spec.alertRadius,
        stridePhase: rand() * Math.PI * 2,
        state: rand() > 0.4 ? "graze" : "wander",
        stateTimer: 2 + rand() * 5,
        targetX: x + (rand() - 0.5) * homeRadius,
        targetZ: z + (rand() - 0.5) * homeRadius,
        phaseOffset: rand() * 10,
        isBiped: spec.isBiped,
        slopeSampleDist: spec.slopeDist,
        mixer,
        animWalk,
        animRun,
        animIdle,
        animGraze,
        activeAction,
      });
    };

    // 1. Water Buffaloes near the pond & riverbank mud wallows
    const [pondX, pondZ] = options.pondCenter;
    for (const [bx, bz] of [
      [pondX + 8.5, pondZ + 3.2],
      [pondX + 10.2, pondZ - 2.4],
      [-22, -14],
      [-26, 26],
    ] as const) {
      spawnLand("water_buffalo", bx, bz, 7.5, 0.94 + rand() * 0.14);
    }

    // 2. Village Cows driven by dedicated RDR2/GTA-style cowAI.ts (real 4-beat walk, grazing, zero disappearing legs!)
    const cowTpl = landTemplates.get("kerala_cow");
    if (cowTpl) {
      const cowSites: readonly [number, number][] = [
        [25, -13],
        [28, -7],
        [41, -45],
        [46, -48],
        [-10, 15],
        [14, 11],
        [34, -18],
      ];
      cowSites.forEach(([cx, cz], idx) => {
        if (options.isForbiddenZone?.(cx, cz)) return;
        system.cows.push(
          spawnCowActor({
            tpl: cowTpl,
            parent: root,
            fitImportedModel: options.fitImportedModel,
            terrainHeight: options.terrainHeight,
            x: cx,
            z: cz,
            pastureRadius: 9.5,
            scaleJitter: 0.92 + rand() * 0.16,
            seed: 101 + idx * 13,
          }),
        );
      });
    }

    // 3. Malabari Village Goats browsing near cottages & roadsides
    for (let i = 0; i < Math.min(7, options.buildingSites.length); i++) {
      const [hx, hz] = options.buildingSites[(i * 2) % options.buildingSites.length];
      const ang = i * 1.9 + 0.5;
      const gx = hx + Math.cos(ang) * 5.2;
      const gz = hz + Math.sin(ang) * 5.2;
      if (!options.getWaterInfo(gx, gz) && !options.isForbiddenZone?.(gx, gz)) {
        spawnLand("malabari_goat", gx, gz, 6.5, 0.9 + rand() * 0.2);
      }
    }

    // 4. Village Dogs patrolling lanes & homesteads
    for (const [dx, dz] of [
      [18, -28],
      [33, -32],
      [3, -18],
      [40, -24],
    ] as const) {
      spawnLand("village_dog", dx, dz, 11.0, 0.92 + rand() * 0.16);
    }

    // 5. Roosters & Hens pecking around cottage courtyards
    for (let i = 0; i < Math.min(6, options.buildingSites.length); i++) {
      const [hx, hz] = options.buildingSites[i];
      const cx = hx + (rand() - 0.5) * 4.5;
      const cz = hz + (rand() - 0.5) * 4.5;
      if (options.getWaterInfo(cx, cz)) continue;
      spawnLand("rooster", cx, cz, 4.8, 0.95 + rand() * 0.12);
      spawnLand("hen", cx + 1.1, cz + 0.7, 4.5, 0.92 + rand() * 0.14);
      spawnLand("hen", cx - 0.9, cz + 1.0, 4.5, 0.92 + rand() * 0.14);
    }

    // 6. Wild Forest Peacocks — strictly on the forest side across the river (west bank, x <= -52)
    for (const [px, pz] of [
      [-54, -6],
      [-62, 6],
      [-58, -18],
      [-66, -12],
    ] as const) {
      spawnLand("peacock", px, pz, 8.5, 0.95 + rand() * 0.14);
    }

    // 7. Wild Malabar Giant Squirrels — strictly on the forest side across the river
    for (const [sx, sz] of [
      [-52, 8],
      [-58, -4],
      [-68, -22],
      [-72, 14],
    ] as const) {
      spawnLand("malabar_squirrel", sx, sz, 7.5, 0.9 + rand() * 0.2);
    }

    // 8. Cattle Egrets (Kokku) wading around flooded paddy fields & riverbank
    for (const [px, pz] of options.paddyPlots) {
      spawnLand("cattle_egret", px - 3.5, pz + 4.8, 5.5, 0.92 + rand() * 0.16);
      spawnLand("cattle_egret", px + 3.2, pz - 4.8, 5.5, 0.92 + rand() * 0.16);
    }

    // --- WATER CREATURES (River, Pond & Paddy Water) ---
    const spawnWater = (
      species: WaterSpecies,
      x: number,
      z: number,
      roamRadius: number,
      scaleJitter = 1.0,
    ) => {
      const tpl = waterTemplates.get(species);
      if (!tpl) return;
      const wInfo = options.getWaterInfo(x, z);
      const surfaceY = wInfo ? wInfo.surfaceY : options.terrainHeight(x, z) + 0.05;
      const spec = WATER_SPECS[species];
      const group = new THREE.Group();
      const model = options.fitImportedModel(cloneSkeleton(tpl.scene) as THREE.Group, spec.height * scaleJitter, 0);
      group.add(model);
      group.position.set(x, surfaceY + spec.depthOffset, z);
      const yaw = rand() * Math.PI * 2;
      group.rotation.y = yaw;
      root.add(group);

      system.waterActors.push({
        species,
        group,
        parts: findAnimalParts(model),
        x,
        z,
        yOffset: 0,
        vx: Math.sin(yaw) * spec.baseSpeed * 0.5,
        vz: Math.cos(yaw) * spec.baseSpeed * 0.5,
        vy: 0,
        yaw,
        depthOffset: spec.depthOffset,
        homeX: x,
        homeZ: z,
        roamRadius,
        baseSpeed: spec.baseSpeed * (0.85 + rand() * 0.3),
        phase: rand() * Math.PI * 2,
        actionTimer: 2 + rand() * 6,
        isLeaping: false,
        isDabbling: false,
        dabbleTimer: 0,
        waterSurfaceY: surfaceY,
      });
    };

    // 9. Schools of Karimeen & Rohu Carp swimming along the Kerala river & pond
    for (let i = 1; i < options.riverPoints.length - 1; i += 2) {
      const [rx, rz] = options.riverPoints[i];
      for (let f = 0; f < 3; f++) {
        const fx = rx + (rand() - 0.5) * 2.8;
        const fz = rz + (rand() - 0.5) * 2.8;
        if (options.getWaterInfo(fx, fz)) {
          spawnWater(f % 2 === 0 ? "karimeen_fish" : "rohu_carp", fx, fz, 7.5, 0.85 + rand() * 0.35);
        }
      }
    }
    // Pond Karimeen school
    for (let f = 0; f < 5; f++) {
      const ang = (f / 5) * Math.PI * 2;
      spawnWater("karimeen_fish", pondX + Math.cos(ang) * 2.5, pondZ + Math.sin(ang) * 2.5, 4.8, 0.85 + rand() * 0.3);
    }

    // 10. Kuttanadan Ducks paddling in flocks on the pond & river bends
    for (let d = 0; d < 4; d++) {
      const ang = (d / 4) * Math.PI * 2;
      spawnWater("kuttanadan_duck", pondX + Math.cos(ang) * 3.0, pondZ + Math.sin(ang) * 3.0, 5.2, 0.92 + rand() * 0.16);
    }
    for (const [rx, rz] of [options.riverPoints[4], options.riverPoints[6], options.riverPoints[8]]) {
      if (rx !== undefined && rz !== undefined) {
        spawnWater("kuttanadan_duck", rx, rz, 6.5, 0.92 + rand() * 0.15);
        spawnWater("kuttanadan_duck", rx + 1.2, rz - 0.9, 6.5, 0.92 + rand() * 0.15);
      }
    }

    // 11. Freshwater Turtles paddling & basking in the pond & river shallows
    spawnWater("freshwater_turtle", pondX - 3.2, pondZ + 2.4, 4.5, 0.95);
    spawnWater("freshwater_turtle", pondX + 3.4, pondZ - 2.2, 4.5, 1.05);
    if (options.riverPoints[5]) {
      spawnWater("freshwater_turtle", options.riverPoints[5][0], options.riverPoints[5][1], 5.5, 1.0);
    }

    // 12. Paddy Frogs perched along flooded paddy bunds & pond edges
    for (const [px, pz] of options.paddyPlots) {
      for (let f = 0; f < 3; f++) {
        const fx = px + (rand() - 0.5) * 9.0;
        const fz = pz + (f % 2 === 0 ? -4.5 : 4.5);
        spawnWater("paddy_frog", fx, fz, 3.2, 0.9 + rand() * 0.25);
      }
    }
    for (let f = 0; f < 3; f++) {
      const ang = f * 2.1 + 0.4;
      spawnWater("paddy_frog", pondX + Math.cos(ang) * 5.2, pondZ + Math.sin(ang) * 5.2, 3.5, 0.95 + rand() * 0.2);
    }
  });

  return system;
}

/**
 * Per-frame physics, autonomous AI behavior, articulated limb/head/tail/wing/fin animation,
 * and aquatic buoyancy/schooling update for all Kerala animals and water creatures.
 */
export function updateKeralaAnimalSystem(
  system: KeralaAnimalSystem,
  delta: number,
  elapsed: number,
  clockHour: number,
  playerX: number,
  playerZ: number,
  playerSpeed: number,
  terrainHeight: (x: number, z: number) => number,
  getWaterInfo: (x: number, z: number) => WaterSample,
) {
  const dt = Math.min(delta, 0.05);
  for (const extMixer of system.externalMixers) {
    extMixer.update(dt);
  }
  if (system.cows.length > 0) {
    updateCowHerd(
      system.cows,
      dt,
      elapsed,
      clockHour,
      playerX,
      playerZ,
      playerSpeed,
      terrainHeight,
      getWaterInfo,
      system.distanceToRoad,
      system.isForbiddenZone,
    );
  }
  const isHotMidday = clockHour >= 12.5 && clockHour <= 15.2;
  const isNight = clockHour < 5.5 || clockHour >= 20.5;

  // =========================================================================
  // 1. LAND ANIMALS — AI State Machine, Herd Separation & Articulated Physics
  // =========================================================================
  const land = system.landActors;
  for (let i = 0; i < land.length; i++) {
    const a = land[i];
    const dxP = a.x - playerX;
    const dzP = a.z - playerZ;
    const distP = Math.hypot(dxP, dzP);

    a.stateTimer -= dt;

    // Sanctuary keep-out: never allow land animals to linger inside the Kalari pit
    if (system.isForbiddenZone?.(a.x, a.z)) {
      a.state = "wander";
      a.targetX = a.anchorX;
      a.targetZ = a.anchorZ;
      a.stateTimer = Math.max(a.stateTimer, 2.5);
    }

    // A) Player proximity reflexes
    if (a.species === "village_dog") {
      if (distP < a.alertRadius && distP > 2.2 && !isNight && !system.isForbiddenZone?.(playerX, playerZ)) {
        const tx = playerX + (dxP / Math.max(distP, 0.1)) * 2.1;
        const tz = playerZ + (dzP / Math.max(distP, 0.1)) * 2.1;
        if (!system.isForbiddenZone?.(tx, tz)) {
          a.state = "curious";
          a.targetX = tx;
          a.targetZ = tz;
          a.stateTimer = 2.5;
        }
      } else if ((distP <= 2.2 || system.isForbiddenZone?.(playerX, playerZ)) && a.state === "curious") {
        a.state = "idle";
        a.stateTimer = 2.0;
      }
    } else if (a.alertRadius > 0 && distP < a.alertRadius + (playerSpeed > 3.5 ? 2.2 : 0)) {
      if (a.state !== "flee") {
        a.state = "flee";
        a.stateTimer = 2.4 + (i % 3) * 0.4;
        const nx = dxP / Math.max(distP, 0.05);
        const nz = dzP / Math.max(distP, 0.05);
        const fx = a.x + nx * (6.5 + (i % 4));
        const fz = a.z + nz * (6.5 + (i % 4));
        if (system.isForbiddenZone?.(fx, fz)) {
          a.targetX = a.anchorX;
          a.targetZ = a.anchorZ;
        } else {
          a.targetX = fx;
          a.targetZ = fz;
        }
        // Startled hop for chickens, goats, egrets & squirrels!
        if (a.yOffset <= 0.01 && (a.isBiped || a.species === "malabar_squirrel" || a.species === "malabari_goat")) {
          a.vy = a.species === "cattle_egret" ? 3.8 : 2.3;
        }
      }
    }

    // B) Autonomous state transitions when timer expires
    if (a.stateTimer <= 0) {
      const roll = Math.abs(Math.sin(elapsed * 1.7 + a.phaseOffset * 3.1));
      if (isNight || (isHotMidday && (a.species === "kerala_cow" || a.species === "water_buffalo" || a.species === "village_dog"))) {
        a.state = roll < 0.72 ? "rest" : "idle";
        a.stateTimer = 5 + roll * 7;
      } else if (roll < 0.42) {
        a.state = "graze";
        a.stateTimer = 3.2 + roll * 5.0;
      } else if (roll < 0.85) {
        a.state = "wander";
        a.stateTimer = 3.5 + roll * 5.5;
        a.targetX = a.anchorX;
        a.targetZ = a.anchorZ;
        for (let attempt = 0; attempt < 8; attempt++) {
          const ang = (elapsed * 0.7 + a.phaseOffset * 5.3 + attempt * 0.82) % (Math.PI * 2);
          const r = a.homeRadius * (0.25 + 0.75 * (((i * 37 + attempt * 19) % 100) / 100));
          const tx = a.anchorX + Math.cos(ang) * r;
          const tz = a.anchorZ + Math.sin(ang) * r;
          if (!system.isForbiddenZone?.(tx, tz)) {
            a.targetX = tx;
            a.targetZ = tz;
            break;
          }
        }
      } else {
        a.state = "idle";
        a.stateTimer = 2.0 + roll * 3.0;
      }
    }

    // C) Desired velocity + Herd separation
    let desiredVx = 0;
    let desiredVz = 0;
    if (a.state === "wander" || a.state === "flee" || a.state === "curious") {
      const tx = a.targetX - a.x;
      const tz = a.targetZ - a.z;
      const distT = Math.hypot(tx, tz);
      if (distT < 0.55) {
        a.state = a.species === "village_dog" ? "idle" : "graze";
        a.stateTimer = 2.5;
      } else {
        const spd = a.state === "flee" ? a.fleeSpeed : a.state === "curious" ? a.walkSpeed * 1.3 : a.walkSpeed;
        desiredVx = (tx / distT) * spd;
        desiredVz = (tz / distT) * spd;
      }
    }

    // Soft separation from neighboring land animals
    for (let j = 0; j < land.length; j++) {
      if (i === j) continue;
      const b = land[j];
      const sx = a.x - b.x;
      const sz = a.z - b.z;
      const d = Math.hypot(sx, sz);
      if (d > 0.01 && d < 1.65) {
        const push = (1.65 - d) * 1.4;
        desiredVx += (sx / d) * push;
        desiredVz += (sz / d) * push;
      }
    }

    // Acceleration & damping
    const accel = a.state === "flee" ? 7.5 : 4.2;
    a.vx += (desiredVx - a.vx) * Math.min(1, accel * dt);
    a.vz += (desiredVz - a.vz) * Math.min(1, accel * dt);

    const nextX = a.x + a.vx * dt;
    const nextZ = a.z + a.vz * dt;
    // Keep non-aquatic land animals out of deep water (buffaloes & egrets tolerate shallows) and forbidden sanctuary zones
    const waterAhead = getWaterInfo(nextX, nextZ);
    const allowWater = a.species === "water_buffalo" || a.species === "cattle_egret";
    const nextForbidden = Boolean(system.isForbiddenZone?.(nextX, nextZ));
    const currentlyForbidden = Boolean(system.isForbiddenZone?.(a.x, a.z));
    const movingCloserToAnchor =
      Math.hypot(nextX - a.anchorX, nextZ - a.anchorZ) <
      Math.hypot(a.x - a.anchorX, a.z - a.anchorZ);
    if ((!waterAhead || allowWater) && (!nextForbidden || (currentlyForbidden && movingCloserToAnchor))) {
      a.x = nextX;
      a.z = nextZ;
    } else {
      a.vx *= -0.5;
      a.vz *= -0.5;
      a.targetX = a.anchorX;
      a.targetZ = a.anchorZ;
    }

    // Vertical hop / gravity physics
    if (a.yOffset > 0 || a.vy !== 0) {
      a.vy -= 9.81 * dt;
      a.yOffset += a.vy * dt;
      if (a.yOffset <= 0) {
        a.yOffset = 0;
        a.vy = 0;
      }
    }

    // Smooth steering yaw
    const speed = Math.hypot(a.vx, a.vz);
    if (speed > 0.08) {
      const targetYaw = Math.atan2(a.vx, a.vz);
      const diff = wrapAngle(targetYaw - a.yaw);
      a.yaw += diff * Math.min(1, (a.state === "flee" ? 9.0 : 5.2) * dt);
    }

    // Terrain height & true slope pitch alignment (never sink hooves into hill crests)
    const hCenter = terrainHeight(a.x, a.z);
    const fwdX = Math.sin(a.yaw) * a.slopeSampleDist;
    const fwdZ = Math.cos(a.yaw) * a.slopeSampleDist;
    const hFront = terrainHeight(a.x + fwdX, a.z + fwdZ);
    const hBack = terrainHeight(a.x - fwdX, a.z - fwdZ);
    const groundY = Math.max(hCenter, (hFront + hBack) * 0.5) + 0.03;
    const targetPitch = THREE.MathUtils.clamp(
      -Math.atan2(hFront - hBack, a.slopeSampleDist * 2),
      -0.38,
      0.38,
    );
    a.pitch += (targetPitch - a.pitch) * Math.min(1, 6.0 * dt);

    const restDrop = a.state === "rest" ? -0.22 : 0;
    a.group.position.set(a.x, groundY + a.yOffset + restDrop, a.z);
    a.group.rotation.set(a.pitch, a.yaw, 0);

    // D) Skeletal AnimationMixer playback (for rigged Sketchfab/Blender GLBs) or articulated part fallback
    if (a.mixer) {
      const desired =
        a.state === "flee"
          ? (a.animRun ?? a.animWalk ?? a.animIdle)
          : speed > 0.08
            ? (a.animWalk ?? a.animIdle)
            : a.state === "graze"
              ? (a.animGraze ?? a.animIdle)
              : (a.animIdle ?? a.animGraze);
      if (desired && desired !== a.activeAction) {
        desired.reset().fadeIn(0.25).play();
        a.activeAction?.fadeOut(0.25);
        a.activeAction = desired;
      }
      a.mixer.update(dt * (a.state === "flee" ? 1.4 : 1.0));
    }
    const p = a.parts;
    if (speed > 0.08) {
      a.stridePhase += dt * speed * (a.isBiped ? 8.5 : 4.8);
      const swing = Math.sin(a.stridePhase) * (a.state === "flee" ? 0.58 : 0.38);
      if (p.legFL) p.legFL.rotation.x = swing;
      if (p.legFR) p.legFR.rotation.x = -swing;
      if (p.legBL) p.legBL.rotation.x = -swing;
      if (p.legBR) p.legBR.rotation.x = swing;
    } else {
      const relax = Math.min(1, 8 * dt);
      if (p.legFL) p.legFL.rotation.x *= 1 - relax;
      if (p.legFR) p.legFR.rotation.x *= 1 - relax;
      if (p.legBL) p.legBL.rotation.x *= 1 - relax;
      if (p.legBR) p.legBR.rotation.x *= 1 - relax;
    }

    // Grazing / pecking / curious head animation
    if (p.head) {
      let headPitch = p.baseHeadRotX;
      if (a.state === "graze") {
        if (a.species === "rooster" || a.species === "hen" || a.species === "cattle_egret") {
          // Sharp rhythmic pecking bursts
          const peck = Math.max(0, Math.sin(elapsed * 7.5 + a.phaseOffset));
          headPitch = p.baseHeadRotX + Math.pow(peck, 4) * 0.72;
        } else {
          // Grazing head dip + gentle chewing bob
          headPitch = p.baseHeadRotX + 0.42 + Math.sin(elapsed * 3.8 + a.phaseOffset) * 0.08;
        }
      } else if (a.state === "rest") {
        headPitch = p.baseHeadRotX + 0.25;
      } else if (speed > 0.1) {
        headPitch = p.baseHeadRotX + Math.sin(a.stridePhase * 2) * 0.06;
      }
      p.head.rotation.x += (headPitch - p.head.rotation.x) * Math.min(1, 7 * dt);
    }

    // Tail swish / dog wag / peacock display shimmer
    if (p.tail) {
      if (a.species === "village_dog" && (a.state === "curious" || distP < 5.5)) {
        p.tail.rotation.y = p.baseTailRotY + Math.sin(elapsed * 14.0 + a.phaseOffset) * 0.48;
      } else if (a.species === "peacock") {
        p.tail.rotation.y = p.baseTailRotY + Math.sin(elapsed * 2.2 + a.phaseOffset) * 0.14;
      } else {
        p.tail.rotation.y = p.baseTailRotY + Math.sin(elapsed * 3.2 + a.phaseOffset) * 0.22;
      }
    }

    // Wing flap on egret / bird airborne hops
    if (p.wingL && p.wingR) {
      const flap = a.yOffset > 0.04 ? Math.sin(elapsed * 24.0) * 0.85 : 0;
      p.wingL.rotation.z = flap;
      p.wingR.rotation.z = -flap;
    }
  }

  // =========================================================================
  // 2. WATER CREATURES — Aquatic Buoyancy, Boids Schooling & Parabolic Leaps
  // =========================================================================
  const water = system.waterActors;
  for (let i = 0; i < water.length; i++) {
    const w = water[i];
    w.actionTimer -= dt;

    if (w.species === "karimeen_fish" || w.species === "rohu_carp") {
      // Boids-style fish schooling + river containment + occasional surface leaps!
      let steerX = 0;
      let steerZ = 0;
      let neighbors = 0;
      let avgVx = 0;
      let avgVz = 0;

      for (let j = 0; j < water.length; j++) {
        if (i === j) continue;
        const o = water[j];
        if (o.species !== "karimeen_fish" && o.species !== "rohu_carp") continue;
        const dx = w.x - o.x;
        const dz = w.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01 && d < 3.6) {
          neighbors++;
          avgVx += o.vx;
          avgVz += o.vz;
          if (d < 0.85) {
            steerX += (dx / d) * (0.85 - d) * 2.2;
            steerZ += (dz / d) * (0.85 - d) * 2.2;
          }
        }
      }
      if (neighbors > 0) {
        steerX += (avgVx / neighbors - w.vx) * 0.6;
        steerZ += (avgVz / neighbors - w.vz) * 0.6;
      }

      // Gentle pull back toward river/pond home zone
      const hx = w.homeX - w.x;
      const hz = w.homeZ - w.z;
      const hd = Math.hypot(hx, hz);
      if (hd > w.roamRadius) {
        steerX += (hx / hd) * 2.4;
        steerZ += (hz / hd) * 2.4;
      }

      // Gentle wandering curve
      const wanderAng = elapsed * 0.8 + w.phase;
      steerX += Math.cos(wanderAng) * 0.45;
      steerZ += Math.sin(wanderAng) * 0.45;

      w.vx += steerX * dt;
      w.vz += steerZ * dt;
      const spd = Math.hypot(w.vx, w.vz);
      if (spd > 0.01) {
        const clamped = THREE.MathUtils.clamp(spd, w.baseSpeed * 0.6, w.baseSpeed * 1.4);
        w.vx = (w.vx / spd) * clamped;
        w.vz = (w.vz / spd) * clamped;
      }

      const nx = w.x + w.vx * dt;
      const nz = w.z + w.vz * dt;
      const nextWater = getWaterInfo(nx, nz);
      if (nextWater) {
        w.x = nx;
        w.z = nz;
        w.waterSurfaceY = nextWater.surfaceY;
      } else {
        // Turn smoothly back into water channel
        w.vx = (w.homeX - w.x) * 0.8;
        w.vz = (w.homeZ - w.z) * 0.8;
      }

      // Occasional silver fish leap above the water surface (parabolic gravity arc)
      if (!w.isLeaping && w.actionTimer <= 0) {
        w.actionTimer = 7.5 + (i % 5) * 3.1;
        if (Math.sin(elapsed + w.phase) > 0.45) {
          w.isLeaping = true;
          w.vy = 2.8 + (i % 3) * 0.45;
        }
      }
      if (w.isLeaping) {
        w.vy -= 9.81 * dt;
        w.yOffset += w.vy * dt;
        if (w.yOffset <= 0) {
          w.yOffset = 0;
          w.vy = 0;
          w.isLeaping = false;
        }
      }

      w.yaw = Math.atan2(w.vx, w.vz);
      const pitchLeap = w.isLeaping ? THREE.MathUtils.clamp(-w.vy * 0.25, -0.7, 0.7) : 0;
      w.group.position.set(w.x, w.waterSurfaceY + w.depthOffset + w.yOffset, w.z);
      w.group.rotation.set(pitchLeap, w.yaw, 0);

      // Sinusoidal tail-fin swimming propulsion
      if (w.parts.tailFin) {
        w.parts.tailFin.rotation.y = Math.sin(elapsed * 14.0 + w.phase) * 0.48;
      }
    } else if (w.species === "kuttanadan_duck" || w.species === "freshwater_turtle") {
      // Buoyant surface swimming + dabbling ducks + basking turtles
      const ang = elapsed * (w.species === "kuttanadan_duck" ? 0.38 : 0.22) + w.phase;
      const targetX = w.homeX + Math.cos(ang) * (w.roamRadius * 0.75);
      const targetZ = w.homeZ + Math.sin(ang * 1.3) * (w.roamRadius * 0.65);

      const dx = targetX - w.x;
      const dz = targetZ - w.z;
      const dist = Math.hypot(dx, dz);
      const spd = w.isDabbling ? 0.05 : w.baseSpeed;
      if (dist > 0.15) {
        w.vx += ((dx / dist) * spd - w.vx) * Math.min(1, 2.5 * dt);
        w.vz += ((dz / dist) * spd - w.vz) * Math.min(1, 2.5 * dt);
      }

      const nx = w.x + w.vx * dt;
      const nz = w.z + w.vz * dt;
      const wInfo = getWaterInfo(nx, nz);
      if (wInfo) {
        w.x = nx;
        w.z = nz;
        w.waterSurfaceY = wInfo.surfaceY;
      } else {
        w.vx *= -0.6;
        w.vz *= -0.6;
      }

      // Duck dabbling (foraging head-down dip!)
      if (w.species === "kuttanadan_duck") {
        if (!w.isDabbling && w.actionTimer <= 0) {
          w.isDabbling = true;
          w.dabbleTimer = 2.2;
          w.actionTimer = 7.0 + (i % 4) * 2.5;
        }
        if (w.isDabbling) {
          w.dabbleTimer -= dt;
          if (w.dabbleTimer <= 0) w.isDabbling = false;
        }
      }

      const swimSpeed = Math.hypot(w.vx, w.vz);
      if (swimSpeed > 0.04) {
        w.yaw += wrapAngle(Math.atan2(w.vx, w.vz) - w.yaw) * Math.min(1, 3.5 * dt);
      }
      const bob = Math.sin(elapsed * 2.8 + w.phase) * 0.028;
      const dabblePitch = w.isDabbling ? 0.68 : Math.sin(elapsed * 2.2 + w.phase) * 0.04;
      w.group.position.set(w.x, w.waterSurfaceY + w.depthOffset + bob, w.z);
      w.group.rotation.set(dabblePitch, w.yaw, Math.cos(elapsed * 2.4 + w.phase) * 0.04);

      // Turtle flipper paddle strokes
      if (w.species === "freshwater_turtle") {
        const stroke = Math.sin(elapsed * 4.5 + w.phase) * 0.42;
        if (w.parts.legFL) w.parts.legFL.rotation.y = stroke;
        if (w.parts.legFR) w.parts.legFR.rotation.y = -stroke;
        if (w.parts.legBL) w.parts.legBL.rotation.y = -stroke * 0.7;
        if (w.parts.legBR) w.parts.legBR.rotation.y = stroke * 0.7;
      }
    } else if (w.species === "paddy_frog") {
      // Paddy & pond frog: perched resting -> true parabolic gravity-arc leaps!
      const distP = Math.hypot(w.x - playerX, w.z - playerZ);
      if (!w.isLeaping && (w.actionTimer <= 0 || distP < 3.6)) {
        w.isLeaping = true;
        w.actionTimer = 3.5 + (i % 4) * 1.8;
        const jumpAng =
          distP < 3.6
            ? Math.atan2(w.x - playerX, w.z - playerZ) + (Math.sin(i) * 0.4)
            : Math.atan2(w.homeX - w.x, w.homeZ - w.z) + Math.sin(elapsed + w.phase) * 1.6;
        w.yaw = jumpAng;
        w.vx = Math.sin(jumpAng) * 1.85;
        w.vz = Math.cos(jumpAng) * 1.85;
        w.vy = 2.75 + (i % 3) * 0.35;
      }

      if (w.isLeaping) {
        w.x += w.vx * dt;
        w.z += w.vz * dt;
        w.vy -= 9.81 * dt;
        w.yOffset += w.vy * dt;
        if (w.yOffset <= 0) {
          w.yOffset = 0;
          w.vy = 0;
          w.vx = 0;
          w.vz = 0;
          w.isLeaping = false;
        }
      }

      const wInfo = getWaterInfo(w.x, w.z);
      const baseY = wInfo ? wInfo.surfaceY : terrainHeight(w.x, w.z);
      const leapPitch = w.isLeaping ? THREE.MathUtils.clamp(-w.vy * 0.22, -0.55, 0.55) : 0;
      w.group.position.set(w.x, baseY + 0.015 + w.yOffset, w.z);
      w.group.rotation.set(leapPitch, w.yaw, 0);

      // Extend hind legs mid-leap, tuck when perched
      const legExt = w.isLeaping ? 0.65 : 0;
      if (w.parts.legBL) w.parts.legBL.rotation.x = legExt;
      if (w.parts.legBR) w.parts.legBR.rotation.x = legExt;
    }
  }
}
