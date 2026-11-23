import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import {
  clearStandingPoint,
  insideSolid,
  moveBody,
  obstacleDetour,
  segmentClear,
  type Body,
  type Solid,
} from "./collision";
import type { ChumaduthangiInfo } from "./keralaRoads";
import { kalariSite } from "./layout";
import { attachClothToBone, type ClothInstance } from "./clothPhysics";
import { FARMER_MAN_BRAIN } from "./npcs/farmerBehavior";
import { VILLAGER_WOMAN_BRAIN } from "./npcs/villagerWomanBehavior";
import { ELDER_MAN_BRAIN } from "./npcs/elderManBehavior";
import { LANDLORD_BRAIN } from "./npcs/landlordBehavior";
import { KALARI_STUDENT_BRAIN } from "./npcs/kalariStudentBehavior";
import { FISHERMAN_BRAIN } from "./npcs/fishermanBehavior";
import { KALARI_GURU_BRAIN } from "./npcs/kalariGuruBehavior";
import { GUARD_BRAIN } from "./npcs/guardBehavior";
import { KARYASTHAN_BRAIN } from "./npcs/karyasthanBehavior";
import { TEMPLE_PRIEST_BRAIN } from "./npcs/templePriestBehavior";
import {
  createFishermanPaddleRig,
  createFishermanRodRig,
  updateFishermanPaddleRig,
  updateFishermanRodRig,
  type FishermanActionRig,
} from "./npcs/fishermanCastSystem";
import {
  KALARI_COMBAT_ANIM_FILES,
  applyKalariAppearanceVariant,
  attachKalariDistinctAccessories,
  createKalariCombatState,
  stepPairedKalariCombat,
  stepSoloKalariCombat,
  type KalariAppearanceVariant,
  type KalariCombatAnimKey,
  type KalariCombatState,
  type KalariTrainingRole,
} from "./npcs/kalariCombatSystem";
import {
  evaluateLandlordDeference,
  type LandlordPresence,
} from "./npcs/landlordDominance";
import {
  computePedestrianPassingBias,
  evaluateMovingObstacleYield,
} from "./npcs/npcTrafficIntelligence";
import type {
  DynamicMover,
  NpcBrainContext,
  NpcCharacterBrain,
} from "./npcs/npcTypes";

// ==============================================================================
// 1. Character Classification, Social Class & Physics Profile Architecture
//    Designed so Set #1 (farmer_man) and all future sets (women, elders,
//    fishermen, landlords, kalari students) share one realistic physics engine.
// ==============================================================================
export type NpcGender = "male" | "female";
export type NpcSocialClass = "poor" | "middle" | "upper";
export type NpcJob =
  | "paddy_farmer"
  | "vegetable_grower"
  | "village_laborer"
  | "market_farmer"
  | "temple_devotee"
  | "fisherman"
  | "kalari_guru"
  | "guard"
  | "karyasthan"
  | "temple_priest";

export interface NpcCharacterProfile {
  id: string;
  name: string;
  age: number; // years (e.g., 22..64)
  gender: NpcGender;
  job: NpcJob;
  socialClass: NpcSocialClass;
  height: number; // meters
  waypoints: [number, number][];
  partnerId?: string;
}

export interface DerivedNpcPhysics {
  walkSpeed: number; // m/s
  runSpeed: number; // m/s
  accel: number; // m/s^2 inertia
  turnRate: number; // rad/s
  slopePenalty: number; // uphill slowdown factor
  strideScale: number; // animation playback multiplier
  smokeChance: number; // probability of taking a beedi break
  prayChance: number; // probability of praying at dawn/dusk
  argueChance: number; // probability of animated market debate
  canRunInRain: boolean;
}

function derivePhysicsFromProfile(p: NpcCharacterProfile): DerivedNpcPhysics {
  // Age factor: younger adults move brisker & accelerate faster; elders move slower with heavier inertia
  const ageNorm = THREE.MathUtils.clamp((p.age - 20) / 45, 0, 1);
  const ageSpeedMul = 1.08 - ageNorm * 0.24;
  const classSpeedMul =
    p.socialClass === "upper" ? 0.88 : p.socialClass === "middle" ? 0.98 : 1.05;
  const genderMul = p.gender === "female" ? 0.94 : 1.0;

  const walkSpeed = 1.18 * ageSpeedMul * classSpeedMul * genderMul;
  const runSpeed = 2.85 * ageSpeedMul * (p.socialClass === "upper" ? 0.85 : 1.0);

  return {
    walkSpeed,
    runSpeed,
    accel: 3.4 - ageNorm * 1.1,
    turnRate: 5.8 - ageNorm * 1.6,
    slopePenalty: 1.35 + ageNorm * 0.55,
    strideScale: walkSpeed / 1.22,
    // Historically, rural Kerala male laborers/farmers frequently take short beedi breaks
    smokeChance:
      p.gender === "male"
        ? p.socialClass === "poor"
          ? 0.42
          : p.socialClass === "middle"
            ? 0.28
            : 0.08
        : 0.0,
    prayChance: p.job === "temple_devotee" ? 0.65 : p.age >= 38 ? 0.35 : 0.15,
    argueChance: p.job === "market_farmer" ? 0.36 : 0.12,
    canRunInRain: p.age < 50 && p.socialClass !== "upper",
  };
}

// ==============================================================================
// 2. All 22 Mixamo Animation Clips
// ==============================================================================
export type MixamoAnimKey =
  | "walk"
  | "run"
  | "runAlt"
  | "idle"
  | "idle2"
  | "breathIdle"
  | "talk"
  | "argue"
  | "greet"
  | "wave"
  | "work"
  | "smoke"
  | "pray"
  | "pray2"
  | "sitIdle"
  | "torchWalk"
  | "torchTurn"
  | "torchJump"
  | "jump"
  | "jumpUp"
  | "jumpDown"
  | "jumpDownAlt"
  | "jumpDownAlt2"
  | "bumpReact"
  | "fishingCast"
  | "fishingIdle"
  | "paddling"
  | "climb"
  | "climbTree"
  | "climbHang"
  | "drive"
  | "landlordWalk"
  | "caneWalk"
  | "caneIdle"
  | "torchIdle"
  | KalariCombatAnimKey;

const ANIM_FILES: Record<Exclude<MixamoAnimKey, "caneWalk" | "caneIdle" | "torchIdle" | "bumpReact" | KalariCombatAnimKey>, string> = {
  walk: "Walk.fbx",
  run: "Running.fbx",
  runAlt: "Running (1).fbx",
  idle: "Idle.fbx",
  idle2: "Idle_2.fbx",
  breathIdle: "Breathing Idle.fbx",
  talk: "Talking.fbx",
  argue: "Standing Arguing.fbx",
  greet: "Standing Greeting.fbx",
  wave: "Waving.fbx",
  work: "Picking Up.fbx",
  smoke: "Smoking.fbx",
  pray: "Praying.fbx",
  pray2: "Praying_2.fbx",
  sitIdle: "Sitting Idle.fbx",
  torchWalk: "Standing Torch Walk Forward.fbx",
  torchTurn: "Standing Torch Turn Right 180.fbx",
  torchJump: "Standing Torch Jump.fbx",
  jump: "Jump.fbx",
  jumpUp: "Jumping Up.fbx",
  jumpDown: "Jumping_down.fbx",
  jumpDownAlt: "Jumping Down.fbx",
  jumpDownAlt2: "Jumping Down-2.fbx",
  fishingCast: "Fishing Cast.fbx",
  fishingIdle: "Fishing Idle.fbx",
  paddling: "Paddling.fbx",
  climb: "Climbing_1.fbx",
  climbTree: "Climbing_tree.fbx",
  climbHang: "Freehang Climb.fbx",
  drive: "Driving.fbx",
  landlordWalk: "Walking_landlord.fbx",
};

// Optional Mixamo elder walking-stick ("Vadi kuthi nadakkuka") clips — auto-loaded if downloaded
const OPTIONAL_CANE_WALK_FILES = [
  "Iv Pole Walking.fbx",
  "Walking With Cane.fbx",
  "Old Man Walk.fbx",
  "Cane Walk.fbx",
];
const OPTIONAL_CANE_IDLE_FILES = [
  "Old Man Idle.fbx",
  "Standing With Cane.fbx",
];
const OPTIONAL_TORCH_IDLE_FILES = [
  "Standing Torch Idle 01.fbx",
  "Standing Torch Idle.fbx",
  "Torch Idle.fbx",
];

type MixamoNpcState =
  | "walk"
  | "run"
  | "idle"
  | "talk"
  | "argue"
  | "work"
  | "smoke"
  | "pray"
  | "greet"
  | "climb_approach"
  | "climb_up"
  | "sit_stone"
  | "jump_down"
  | "bump_react"
  | "kalari_train"
  | "fishing_cast";

// ==============================================================================
// 3. Realistic Volumetric Curling Smoke Particle System (Beedi Tip + Mouth Puffs)
// ==============================================================================
interface SmokePuff {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
  baseScale: number;
  maxScale: number;
  seed: number;
  baseOpacity: number;
}

class RealisticSmokeEmitter {
  private readonly puffs: SmokePuff[] = [];
  private readonly tex: THREE.CanvasTexture;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.tex = this.createSoftSmokeTexture();
  }

  private createSoftSmokeTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    // Multi-lobe organic cloud puff (looks like real curling tobacco smoke, never a hard circle!)
    const lobes = [
      [64, 64, 54, 0.42],
      [50, 56, 38, 0.28],
      [78, 60, 36, 0.26],
      [62, 76, 34, 0.24],
    ] as const;
    for (const [cx, cy, r, a] of lobes) {
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      grad.addColorStop(0, `rgba(228, 230, 236, ${a})`);
      grad.addColorStop(0.45, `rgba(205, 210, 218, ${a * 0.55})`);
      grad.addColorStop(1, "rgba(185, 192, 200, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  emit(
    worldPos: THREE.Vector3,
    kind: "tip_wisp" | "exhale_puff",
    forwardDir?: THREE.Vector3,
  ): void {
    if (this.puffs.length >= 64) return;
    const mat = new THREE.SpriteMaterial({
      map: this.tex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      color: kind === "exhale_puff" ? 0xdce1e8 : 0xcbd2dc,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(worldPos);
    const baseScale = kind === "exhale_puff" ? 0.055 : 0.022;
    sprite.scale.setScalar(baseScale);
    this.scene.add(sprite);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * (kind === "exhale_puff" ? 0.09 : 0.04),
      kind === "exhale_puff" ? 0.16 + Math.random() * 0.08 : 0.22 + Math.random() * 0.08,
      (Math.random() - 0.5) * (kind === "exhale_puff" ? 0.09 : 0.04),
    );
    if (kind === "exhale_puff" && forwardDir) {
      vel.addScaledVector(forwardDir, 0.24 + Math.random() * 0.08);
    }

    this.puffs.push({
      sprite,
      vel,
      age: 0,
      maxAge: kind === "exhale_puff" ? 2.4 + Math.random() * 0.8 : 1.7 + Math.random() * 0.7,
      baseScale,
      maxScale: kind === "exhale_puff" ? 0.34 + Math.random() * 0.12 : 0.16 + Math.random() * 0.06,
      seed: Math.random() * Math.PI * 2,
      baseOpacity: kind === "exhale_puff" ? 0.44 : 0.32,
    });
  }

  update(dt: number, elapsed: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      const t = p.age / p.maxAge;
      // Organic rising buoyancy + gentle Kerala breeze + helical curl turbulence
      const curlX = Math.sin(elapsed * 2.4 + p.seed + t * 5.0) * 0.08;
      const curlZ = Math.cos(elapsed * 2.1 + p.seed * 1.3 + t * 4.5) * 0.08;
      p.sprite.position.x += (p.vel.x * (1 - t * 0.65) + curlX + 0.05) * dt;
      p.sprite.position.y += p.vel.y * (1 - t * 0.25) * dt;
      p.sprite.position.z += (p.vel.z * (1 - t * 0.65) + curlZ) * dt;

      const s = THREE.MathUtils.lerp(p.baseScale, p.maxScale, Math.pow(t, 0.72));
      p.sprite.scale.set(s, s * (1.0 + t * 0.18), 1);

      // Smooth fade-in then long atmospheric fade-out
      const fadeIn = Math.min(1, t / 0.14);
      const fadeOut = Math.pow(1 - t, 1.35);
      p.sprite.material.opacity = p.baseOpacity * fadeIn * fadeOut;
      p.sprite.material.rotation = p.seed + t * 1.1;
    }
  }
}

// ==============================================================================
// 4. Built-in Detailed Fallback Props (Auto-Upgraded when Blender GLBs Exist!)
// ==============================================================================
interface AccessoryTemplates {
  lamp?: THREE.Group;
  beedi?: THREE.Group;
  matchbox?: THREE.Group;
}

function createFallbackNightLamp(): { group: THREE.Group; flameMat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0x8f692d, roughness: 0.45, metalness: 0.75 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x25221f, roughness: 0.6, metalness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xffe8b8,
    roughness: 0.18,
    transparent: true,
    opacity: 0.42,
  });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xffc64a,
    emissive: 0xff8a1c,
    emissiveIntensity: 4.5,
    roughness: 0.2,
  });

  // Handle at (0,0,0), lantern body hanging down along -Y
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.0045, 6, 16), iron);
  handle.position.set(0, -0.055, 0);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.038, 12), brass);
  hood.position.set(0, -0.092, 0);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.054, 12, 10), glass);
  globe.scale.set(0.92, 1.15, 0.92);
  globe.position.set(0, -0.165, 0);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), flameMat);
  flame.scale.set(0.7, 1.5, 0.7);
  flame.position.set(0, -0.172, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.068, 0.058, 14), brass);
  base.position.set(0, -0.255, 0);
  g.add(handle, hood, globe, flame, base);
  return { group: g, flameMat };
}

function createFallbackBeedi(): {
  group: THREE.Group;
  emberMat: THREE.MeshStandardMaterial;
  tipAnchor: THREE.Object3D;
} {
  const g = new THREE.Group();
  const leaf = new THREE.MeshStandardMaterial({ color: 0x735c38, roughness: 0.92 });
  const thread = new THREE.MeshStandardMaterial({ color: 0xb01a16, roughness: 0.85 });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xff4010,
    emissive: 0xff4a0a,
    emissiveIntensity: 3.5,
    roughness: 0.6,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0028, 0.068, 10), leaf);
  body.rotation.x = Math.PI * 0.5;
  body.position.set(0, 0, 0.034);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.0034, 0.0006, 6, 12), thread);
  tie.position.set(0, 0, 0.015);
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), emberMat);
  ember.position.set(0, 0, 0.070);
  const tipAnchor = new THREE.Object3D();
  tipAnchor.position.set(0, 0, 0.074);
  g.add(body, tie, ember, tipAnchor);
  return { group: g, emberMat, tipAnchor };
}

function createFallbackMatchbox(): THREE.Group {
  const g = new THREE.Group();
  const sleeve = new THREE.Mesh(
    new THREE.BoxGeometry(0.052, 0.015, 0.036),
    new THREE.MeshStandardMaterial({ color: 0xa62a1c, roughness: 0.86 }),
  );
  const label = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.016, 0.025),
    new THREE.MeshStandardMaterial({ color: 0xdcb03a, roughness: 0.84 }),
  );
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.044, 0.012, 0.032),
    new THREE.MeshStandardMaterial({ color: 0xc4a26a, roughness: 0.88 }),
  );
  tray.position.x = 0.012;
  g.add(sleeve, label, tray);
  return g;
}

/**
 * Realistic 1.04m slender Kerala elder's walking cane (Oonnuvadi / Vadi).
 * Built with origin (0, 0, 0) at the bottom brass ferrule extending upward along +Y
 * so the world-space hand-to-ground solver plants the tip flush on the soil while
 * placing the slim grip wrap dead-center in the elder's fist with the rounded knob just above.
 */
function createFallbackWalkingStick(): THREE.Group {
  const g = new THREE.Group();
  const teak = new THREE.MeshStandardMaterial({ color: 0x4b2d18, roughness: 0.78 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x2f1b0e, roughness: 0.84 });
  const gripWrap = new THREE.MeshStandardMaterial({ color: 0x6b4728, roughness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9c7634, roughness: 0.4, metalness: 0.72 });

  // Bottom brass ferrule resting on soil (y = 0 .. 0.042)
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0092, 0.0076, 0.042, 10), brass);
  ferrule.position.set(0, 0.021, 0);
  // Slender tapered seasoned teak/rattan cane shaft (y = 0.042 .. 0.995, ~1.9-2.2cm diameter)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0092, 0.955, 12), teak);
  shaft.position.set(0, 0.519, 0);
  shaft.castShadow = true;
  // Subtle handmade cane nodes along the shaft
  for (const ny of [0.28, 0.54, 0.78]) {
    const node = new THREE.Mesh(new THREE.TorusGeometry(0.0106, 0.0014, 6, 12), darkWood);
    node.rotation.x = Math.PI * 0.5;
    node.position.set(0, ny, 0);
    g.add(node);
  }
  // Slim coir/leather hand-grip wrap around y = 0.84 .. 0.96
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0122, 0.0118, 0.12, 12), gripWrap);
  grip.position.set(0, 0.90, 0);
  // Fine brass collar & smooth rounded teak palm-knob just above the fist (y = 0.985 .. 1.04)
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.0115, 0.022, 12), brass);
  collar.position.set(0, 0.985, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 12, 10), darkWood);
  knob.scale.set(1, 1.15, 1);
  knob.position.set(0, 1.015, 0);

  g.add(ferrule, shaft, grip, collar, knob);
  return g;
}

// Procedural Olakkuda umbrella & Vettila Chellam removed per user feedback.

interface ClimbableStoneSite {
  id: string;
  x: number;
  z: number;
  rot: number;
  groundY: number;
  topY: number;
  radius: number;
  halfZ: number;
  occupiedBy: string | null;
  solid: Solid;
}

// ==============================================================================
// 5. Mixamo Actor State & Helpers
// ==============================================================================
type MixamoNpcActor = {
  profile: NpcCharacterProfile;
  physics: DerivedNpcPhysics;
  brain: NpcCharacterBrain;
  root: THREE.Group;
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>>;
  activeAction?: THREE.AnimationAction;
  activeKey?: MixamoAnimKey;
  waypointIdx: number;
  subPath: [number, number][];
  subPathIdx: number;
  lastProgressX: number;
  lastProgressZ: number;
  stuckTimer: number;
  spawnCleared: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  currentSpeed: number;
  yieldTarget: [number, number] | null;
  deferenceTarget?: [number, number] | null;
  state: MixamoNpcState;
  stateTimer: number;
  partnerIdx?: number;
  hipsBone?: THREE.Bone;
  leftFootBone?: THREE.Bone;
  rightFootBone?: THREE.Bone;
  leftToeBone?: THREE.Bone;
  rightToeBone?: THREE.Bone;
  footGroundInitialized: boolean;
  rightHandBone?: THREE.Bone;
  rightPalmBone?: THREE.Bone;
  leftHandBone?: THREE.Bone;
  leftPalmBone?: THREE.Bone;
  headBone?: THREE.Bone;
  nightLampGroup: THREE.Group;
  nightLampLight?: THREE.PointLight;
  nightLampFlameMat?: THREE.MeshStandardMaterial;
  walkingStickGroup?: THREE.Group;
  beediGroup: THREE.Group;
  beediTipAnchor: THREE.Object3D;
  beediEmberMat?: THREE.MeshStandardMaterial;
  matchboxGroup: THREE.Group;
  smokeTipAccum: number;
  smokeExhaleTimer: number;
  activeStoneIdx: number | null;
  stonePhaseTimer: number;
  stonePhaseDuration: number;
  stoneEdgeX: number;
  stoneEdgeZ: number;
  stoneSitX: number;
  stoneSitZ: number;
  stoneLandX: number;
  stoneLandZ: number;
  stoneStartY: number;
  stoneCooldown: number;
  activeJumpDownClip?: MixamoAnimKey;
  bumpTimer?: number;
  bumpCooldown?: number;
  bumpAwayX?: number;
  bumpAwayZ?: number;
  bumpFaceX?: number;
  bumpFaceZ?: number;
  bumpFollowUpAnim?: MixamoAnimKey;
  kalariCombat?: KalariCombatState;
  kalariSwordProp?: THREE.Object3D;
  kalariShieldProp?: THREE.Object3D;
  kalariStaffProp?: THREE.Object3D;
  fishermanAction?: FishermanActionRig;
  escortsLandlord?: boolean;
  escortSide?: -1 | 0 | 1;
  animAccum?: number;
  lastDistToPlayer?: number;
  shadowCastEnabled?: boolean;
  shadowMeshes?: THREE.Mesh[];
  clothInstances?: ClothInstance[];
};

export type MixamoNpcSystem = {
  update: (
    delta: number,
    elapsed: number,
    playerX: number,
    playerZ: number,
    hour?: number,
    daylight?: number,
    rainIntensity?: number,
  ) => void;
  getActors: () => {
    id: string;
    name: string;
    job: NpcJob;
    socialClass: NpcSocialClass;
    x: number;
    z: number;
    visible: boolean;
  }[];
};

export interface MixamoNpcSystemConfig {
  scene: THREE.Scene;
  baseUrl: string;
  terrainHeight: (x: number, z: number) => number;
  bridgeHeightAt?: (x: number, z: number) => number | undefined;
  getWaterInfo?: (x: number, z: number) => unknown;
  getSolids?: () => readonly Solid[];
  getDynamicObstacles?: () => readonly DynamicMover[];
  chumaduthangis?: readonly ChumaduthangiInfo[];
}

function sanitizeMixamoBoneName(name: string): string {
  return name.replace(/^mixamorig\d*[:_]?/i, "mixamorig");
}

function normalizeRigBones(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj.name && /mixamorig/i.test(obj.name)) {
      obj.name = sanitizeMixamoBoneName(obj.name);
    }
  });
}

// Measured horizontal root-motion speed (raw FBX units/sec) per clip before horizontal root motion is stripped
const clipRawRootSpeedMap = new WeakMap<THREE.AnimationClip, number>();

// Calibrated real-world locomotion base speeds (m/s at timeScale=1.0 for a 1.72m character) for in-place Mixamo clips
const FALLBACK_LOCO_BASE_SPEED: Partial<Record<MixamoAnimKey, number>> = {
  walk: 1.28,
  caneWalk: 0.78,
  landlordWalk: 1.06,
  torchWalk: 1.12,
  run: 3.35,
  runAlt: 3.10,
};

function normalizeMixamoClip(
  clip: THREE.AnimationClip,
  stripHorizontalRootMotion: boolean,
): THREE.AnimationClip {
  const cloned = clip.clone();
  for (const track of cloned.tracks) {
    const dotIdx = track.name.indexOf(".");
    if (dotIdx > 0) {
      const bonePart = track.name.slice(0, dotIdx);
      const propPart = track.name.slice(dotIdx);
      if (/mixamorig/i.test(bonePart)) {
        track.name = sanitizeMixamoBoneName(bonePart) + propPart;
      }
    }
    if (
      stripHorizontalRootMotion &&
      /mixamorigHips\.position$/i.test(track.name) &&
      track.values.length >= 3
    ) {
      const baseX = track.values[0];
      const baseZ = track.values[2];
      const lastIdx = track.values.length - 3;
      const endX = track.values[lastIdx];
      const endZ = track.values[lastIdx + 2];
      const horizTravel = Math.hypot(endX - baseX, endZ - baseZ);
      if (horizTravel > 0.05 && cloned.duration > 0.08) {
        clipRawRootSpeedMap.set(cloned, horizTravel / cloned.duration);
      }
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] = baseX;
        track.values[i + 2] = baseZ;
      }
    }
  }
  return cloned;
}

/**
 * Returns the exact natural ground speed (m/s at timeScale = 1.0) of a locomotion clip
 * for a given actor — preferring measured FBX root-motion velocity scaled to the actor,
 * and falling back to calibrated height-scaled stride velocities for in-place clips.
 */
function getClipNaturalSpeed(actor: MixamoNpcActor, key: MixamoAnimKey): number {
  const action = actor.actions[key];
  if (action) {
    const rawSpeed = clipRawRootSpeedMap.get(action.getClip());
    if (rawSpeed !== undefined) {
      const worldSpeed = rawSpeed * actor.model.scale.x;
      if (worldSpeed >= 0.35 && worldSpeed <= 6.0) {
        return worldSpeed;
      }
    }
  }
  const base = FALLBACK_LOCO_BASE_SPEED[key] ?? 1.25;
  return base * (actor.profile.height / 1.72);
}

/**
 * Plays a walking/running clip with its playback timeScale synchronized 1:1
 * to the actor's actual ground movement speed so feet plant cleanly with zero sliding.
 */
function playLocomotionAction(
  actor: MixamoNpcActor,
  key: MixamoAnimKey,
  actualSpeedMps: number,
  fadeSec = 0.28,
  fallbackIdleKey?: MixamoAnimKey,
): void {
  if (actualSpeedMps < 0.08 && fallbackIdleKey) {
    playAction(actor, fallbackIdleKey, fadeSec, 1.0);
    return;
  }
  const naturalSpeed = getClipNaturalSpeed(actor, key);
  const matchedTimeScale = THREE.MathUtils.clamp(
    actualSpeedMps / Math.max(naturalSpeed, 0.3),
    0.45,
    1.65,
  );
  playAction(actor, key, fadeSec, matchedTimeScale);
}

function tuneMixamoMaterials(model: THREE.Object3D): void {
  model.traverse((part) => {
    if (part instanceof THREE.SkinnedMesh || part instanceof THREE.Mesh) {
      part.castShadow = true;
      part.receiveShadow = true;
      part.frustumCulled = false;

      const mats = Array.isArray(part.material) ? part.material : [part.material];
      const tuned = mats.map((mat) => {
        if (!mat) return mat;
        const isGold = /gold|ornament|kadukkan|medallion|bangle|armlet/i.test(mat.name || "");
        if (mat instanceof THREE.MeshPhongMaterial) {
          const std = new THREE.MeshStandardMaterial({
            name: mat.name,
            color: isGold ? new THREE.Color(0xf2c44d) : mat.color.clone(),
            map: mat.map,
            normalMap: mat.normalMap,
            roughness: isGold ? 0.26 : 0.86,
            metalness: isGold ? 0.88 : 0.0,
            side: THREE.DoubleSide,
          });
          if (std.map) {
            std.map.colorSpace = THREE.SRGBColorSpace;
            std.map.needsUpdate = true;
          }
          mat.dispose();
          return std;
        }
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.roughness = isGold ? 0.26 : Math.max(mat.roughness, 0.82);
          mat.metalness = isGold ? 0.88 : 0.0;
          mat.side = THREE.DoubleSide;
          if (mat.map) {
            mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.map.needsUpdate = true;
          }
          mat.needsUpdate = true;
        }
        return mat;
      });
      part.material = Array.isArray(part.material) ? tuned : tuned[0];
    }
  });
}

function fitMixamoCharacter(model: THREE.Group, targetHeight: number): THREE.Group {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);
  model.position.set(
    -((box.min.x + box.max.x) * 0.5) * scale,
    -box.min.y * scale,
    -((box.min.z + box.max.z) * 0.5) * scale,
  );
  return model;
}

function shortestAngleDiff(current: number, target: number): number {
  let diff = (target - current + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

function playAction(
  actor: MixamoNpcActor,
  key: MixamoAnimKey,
  fadeSec = 0.35,
  timeScaleOverride?: number,
): void {
  const next = actor.actions[key] ?? actor.actions.idle ?? actor.actions.breathIdle;
  if (!next || actor.activeAction === next) {
    if (next && timeScaleOverride !== undefined) {
      next.setEffectiveTimeScale(timeScaleOverride);
    }
    return;
  }
  next.reset();
  next.enabled = true;
  next.setEffectiveWeight(1);
  next.setEffectiveTimeScale(timeScaleOverride ?? 1.0);
  if (actor.activeAction) {
    next.crossFadeFrom(actor.activeAction, fadeSec, false);
  }
  next.play();
  actor.activeAction = next;
  actor.activeKey = key;
}

function findBone(root: THREE.Object3D, exactNames: string[]): THREE.Bone | undefined {
  let found: THREE.Bone | undefined;
  const lowered = exactNames.map((n) => n.toLowerCase());
  root.traverse((obj) => {
    if (found) return;
    if (obj instanceof THREE.Bone && lowered.includes(obj.name.toLowerCase())) {
      found = obj;
    }
  });
  return found;
}

// ==============================================================================
// 6. Main Mixamo NPC System Factory
// ==============================================================================
export function createMixamoNpcSystem(config: MixamoNpcSystemConfig): MixamoNpcSystem {
  const {
    scene,
    baseUrl,
    terrainHeight,
    bridgeHeightAt,
    getWaterInfo,
    getSolids,
    getDynamicObstacles,
  } = config;
  const fbxLoader = new FBXLoader();
  const gltfLoader = new GLTFLoader();
  const actors: MixamoNpcActor[] = [];
  const smokeEmitter = new RealisticSmokeEmitter(scene);
  const tmpTipPos = new THREE.Vector3();
  const tmpHeadPos = new THREE.Vector3();
  const tmpForward = new THREE.Vector3();
  const tmpFootPos = new THREE.Vector3();
  const tmpPalmPos = new THREE.Vector3();
  const tmpLeftPalmPos = new THREE.Vector3();
  const tmpStickDir = new THREE.Vector3();
  const STICK_UP = new THREE.Vector3(0, 1, 0);

  // World-space hand-to-ground solver for the elder's wooden walking cane (Oonnuvadi / Vadi):
  // Plants the bottom brass ferrule flush on the soil while sizing the cane dynamically
  // so the slim grip sits inside the elder's right fist and the knob rests just ~7.5cm above it.
  const updateWalkingStickPose = (actor: MixamoNpcActor) => {
    const stick = actor.walkingStickGroup;
    if (!stick || !stick.visible) return;
    const gripBone = actor.rightPalmBone ?? actor.rightHandBone;
    if (!gripBone) return;

    gripBone.getWorldPosition(tmpPalmPos);
    // Slight natural forward plant (+0.04m along facing) like real vadi-kuthi walking
    const fwdX = Math.sin(actor.yaw);
    const fwdZ = Math.cos(actor.yaw);
    const tipX = tmpPalmPos.x + fwdX * 0.04;
    const tipZ = tmpPalmPos.z + fwdZ * 0.04;
    const soilY = groundYAt(tipX, tipZ) + 0.006;
    // Keep tip planted on soil; lift gently if hand rises high mid-stride
    const tipY = Math.max(soilY, tmpPalmPos.y - 0.98);

    const dx = tmpPalmPos.x - tipX;
    const dy = Math.max(0.25, tmpPalmPos.y - tipY);
    const dz = tmpPalmPos.z - tipZ;
    const handDist = Math.hypot(dx, dy, dz);
    tmpStickDir.set(dx, dy, dz).normalize();
    stick.position.set(tipX, tipY, tipZ);
    stick.quaternion.setFromUnitVectors(STICK_UP, tmpStickDir);
    // Match cane length to fist-to-ground distance + 7.5cm top knob clearance
    const scaleY = THREE.MathUtils.clamp((handDist + 0.075) / 1.04, 0.78, 1.08);
    stick.scale.set(1, scaleY, 1);
  };

  // World-space two-handed spear / Kettukari pole solver:
  // Aligns the shaft dead-center through BOTH the rear right hand and front left hand
  // so Bayonet Stab, Inward Block, and Ginga hold the spear realistically with zero drift.
  const updateKalariSpearPose = (actor: MixamoNpcActor) => {
    const spear = actor.kalariStaffProp;
    if (!spear || !spear.visible) return;
    const rearBone = actor.rightPalmBone ?? actor.rightHandBone;
    const frontBone = actor.leftPalmBone ?? actor.leftHandBone;
    if (!rearBone) return;

    rearBone.getWorldPosition(tmpPalmPos);
    if (frontBone) {
      frontBone.getWorldPosition(tmpLeftPalmPos);
      tmpStickDir.subVectors(tmpLeftPalmPos, tmpPalmPos);
      if (tmpStickDir.lengthSq() > 0.015) {
        tmpStickDir.normalize();
      } else {
        tmpStickDir.set(Math.sin(actor.yaw), 0.18, Math.cos(actor.yaw)).normalize();
      }
    } else {
      tmpStickDir.set(Math.sin(actor.yaw), 0.18, Math.cos(actor.yaw)).normalize();
    }

    spear.position.copy(tmpPalmPos);
    spear.quaternion.setFromUnitVectors(STICK_UP, tmpStickDir);
  };

  // Real-time bone-based foot grounding: keeps lowest foot/toe flush on terrain surface
  // across every Mixamo animation clip so legs never sink into the soil or float.
  const groundActorFeet = (actor: MixamoNpcActor, groundY: number, dt: number) => {
    actor.root.position.set(actor.x, groundY, actor.z);
    // Distance LOD: skip expensive double skeleton updateMatrixWorld(true) beyond 26m
    if ((actor.lastDistToPlayer ?? 0) >= 26 && actor.footGroundInitialized) {
      return;
    }
    actor.root.updateMatrixWorld(true);

    let lowestSoleY = Infinity;
    const sampleBone = (bone: THREE.Bone | undefined, soleThickness: number) => {
      if (!bone) return;
      bone.getWorldPosition(tmpFootPos);
      const soleY = tmpFootPos.y - soleThickness;
      if (soleY < lowestSoleY) lowestSoleY = soleY;
    };

    sampleBone(actor.leftToeBone, 0.026);
    sampleBone(actor.rightToeBone, 0.026);
    sampleBone(actor.leftFootBone, 0.088);
    sampleBone(actor.rightFootBone, 0.088);

    if (!Number.isFinite(lowestSoleY)) {
      updateWalkingStickPose(actor);
      updateKalariSpearPose(actor);
      return;
    }

    const targetSurfaceY = groundY + 0.016;
    const deltaY = targetSurfaceY - lowestSoleY;
    const isJumping =
      actor.activeKey === "jump" ||
      actor.activeKey === "jumpUp" ||
      actor.activeKey === "torchJump" ||
      actor.activeKey === "flyingKick1" ||
      actor.activeKey === "flyingKick2" ||
      actor.activeKey === "macaco";

    if (!actor.footGroundInitialized) {
      actor.model.position.y = THREE.MathUtils.clamp(actor.model.position.y + deltaY, -1.5, 1.5);
      actor.footGroundInitialized = true;
    } else if (deltaY > 0) {
      actor.model.position.y = THREE.MathUtils.clamp(actor.model.position.y + deltaY, -1.5, 1.5);
    } else if (!isJumping && deltaY < -0.004) {
      const settle = deltaY * Math.min(1, Math.max(dt, 0.016) * 10);
      actor.model.position.y = THREE.MathUtils.clamp(actor.model.position.y + settle, -1.5, 1.5);
    }
    actor.root.updateMatrixWorld(true);
    updateWalkingStickPose(actor);
    updateKalariSpearPose(actor);
  };

  // Locks the character's live mixamorigHips world Y to an exact target height
  // (eliminates Mixamo climb vertical root drift and sitting floating gaps).
  const setActorHipsWorldY = (
    actor: MixamoNpcActor,
    x: number,
    z: number,
    targetHipsY: number,
  ) => {
    actor.root.position.set(x, actor.root.position.y, z);
    actor.root.updateMatrixWorld(true);
    if (actor.hipsBone) {
      actor.hipsBone.getWorldPosition(tmpFootPos);
      actor.root.position.y += targetHipsY - tmpFootPos.y;
    } else {
      actor.root.position.y = targetHipsY - actor.profile.height * 0.52;
    }
    actor.root.updateMatrixWorld(true);
  };

  const groundYAt = (x: number, z: number): number => {
    const b = bridgeHeightAt?.(x, z);
    return b !== undefined ? b : terrainHeight(x, z);
  };

  const loadFbx = (url: string) =>
    new Promise<THREE.Group>((resolve, reject) => {
      fbxLoader.load(url, resolve, undefined, reject);
    });

  const loadGlbOptional = (filename: string) =>
    new Promise<THREE.Group | undefined>((resolve) => {
      gltfLoader.load(
        `${baseUrl}models/props/${filename}`,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => resolve(undefined),
      );
    });

  const loadRootModelGlbOptional = (filename: string) =>
    new Promise<THREE.Group | undefined>((resolve) => {
      gltfLoader.load(
        `${baseUrl}models/${filename}`,
        (gltf) => resolve(gltf.scene),
        undefined,
        () => resolve(undefined),
      );
    });

  const charUrl = `${baseUrl}models/npcs/mixamo/farmer_man_mixamo.fbx`;
  const animEntries = Object.entries(ANIM_FILES) as [MixamoAnimKey, string][];

  const umbrellaStones: ClimbableStoneSite[] = (config.chumaduthangis ?? []).map((c, idx) => ({
    id: `chumaduthangi_${idx + 1}`,
    x: c.x,
    z: c.z,
    rot: c.rot,
    groundY: groundYAt(c.x, c.z),
    topY: c.topY,
    radius: Math.max(c.halfX, c.halfZ),
    halfZ: c.halfZ,
    occupiedBy: null,
    solid: { x: c.x, z: c.z, halfX: c.halfX, halfZ: c.halfZ, rotation: c.rot },
  }));

  const loadOptionalClip = async (filenames: string[]): Promise<THREE.AnimationClip | undefined> => {
    for (const file of filenames) {
      try {
        const grp = await loadFbx(`${baseUrl}models/npcs/mixamo/anims/${encodeURIComponent(file)}`);
        if (grp.animations.length > 0) {
          return normalizeMixamoClip(grp.animations[0], true);
        }
      } catch {
        // Optional clip not downloaded yet — try next candidate filename
      }
    }
    return undefined;
  };

  const loadCompactOptionalClip = async (file: string): Promise<THREE.AnimationClip | undefined> => {
    try {
      const grp = await loadFbx(`${baseUrl}models/npcs/mixamo/anims/compact/${encodeURIComponent(file)}`);
      if (grp.animations.length > 0) {
        return normalizeMixamoClip(grp.animations[0], true);
      }
    } catch {
      // Optional clip not present
    }
    return undefined;
  };

  Promise.allSettled([
    loadFbx(charUrl),
    loadGlbOptional("kerala_night_lamp.glb"),
    loadGlbOptional("kerala_beedi.glb"),
    loadGlbOptional("kerala_matchbox.glb"),
    loadOptionalClip(OPTIONAL_CANE_WALK_FILES),
    loadOptionalClip(OPTIONAL_CANE_IDLE_FILES),
    loadOptionalClip(OPTIONAL_TORCH_IDLE_FILES),
    loadCompactOptionalClip("Hit Reaction.fbx"),
    ...animEntries.map(([, file]) =>
      loadFbx(`${baseUrl}models/npcs/mixamo/anims/${encodeURIComponent(file)}`),
    ),
  ]).then(([charRes, lampRes, beediRes, matchRes, caneWalkRes, caneIdleRes, torchIdleRes, bumpReactRes, ...animResults]) => {
    if (charRes.status !== "fulfilled") {
      console.warn("Mixamo farmer_man_mixamo.fbx could not be loaded:", charRes.reason);
      return;
    }

    const baseTemplate = charRes.value;
    normalizeRigBones(baseTemplate);
    tuneMixamoMaterials(baseTemplate);

    const accessories: AccessoryTemplates = {
      lamp: lampRes.status === "fulfilled" ? lampRes.value : undefined,
      beedi: beediRes.status === "fulfilled" ? beediRes.value : undefined,
      matchbox: matchRes.status === "fulfilled" ? matchRes.value : undefined,
    };

    const clips: Partial<Record<MixamoAnimKey, THREE.AnimationClip>> = {};
    animResults.forEach((res, idx) => {
      if (res.status === "fulfilled" && res.value.animations.length > 0) {
        const key = animEntries[idx][0];
        clips[key] = normalizeMixamoClip(res.value.animations[0], true);
      }
    });
    if (caneWalkRes.status === "fulfilled" && caneWalkRes.value) {
      clips.caneWalk = caneWalkRes.value;
    }
    if (caneIdleRes.status === "fulfilled" && caneIdleRes.value) {
      clips.caneIdle = caneIdleRes.value;
    }
    if (torchIdleRes.status === "fulfilled" && torchIdleRes.value) {
      clips.torchIdle = torchIdleRes.value;
    }
    if (bumpReactRes.status === "fulfilled" && bumpReactRes.value) {
      clips.bumpReact = bumpReactRes.value;
    }



    // Set #1 Profiles: 6 distinct Kerala Male Farmers classified by Age, Gender, Job & Social Class
    const farmerProfiles: NpcCharacterProfile[] = [
      {
        id: "farmer_kuttan",
        name: "Kuttan",
        age: 34,
        gender: "male",
        job: "village_laborer",
        socialClass: "poor",
        height: 1.71,
        waypoints: [
          [4.2, -5.5],
          [11.5, -14.0],
          [6.5, -24.0],
          [-2.5, -13.0],
        ],
      },
      {
        id: "farmer_raman",
        name: "Raman",
        age: 26,
        gender: "male",
        job: "village_laborer",
        socialClass: "poor",
        height: 1.69,
        waypoints: [
          [-5.0, 6.5],
          [-16.0, 14.0],
          [-26.0, 22.0],
          [-12.0, 12.0],
        ],
      },
      {
        id: "farmer_velayudhan",
        name: "Velayudhan",
        age: 42,
        gender: "male",
        job: "paddy_farmer",
        socialClass: "poor",
        height: 1.68,
        waypoints: [
          [-35.0, 31.0],
          [-41.5, 31.0],
          [-41.5, 37.5],
        ],
      },
      {
        id: "farmer_narayanan",
        name: "Narayanan",
        age: 38,
        gender: "male",
        job: "vegetable_grower",
        socialClass: "middle",
        height: 1.73,
        waypoints: [
          [-45.0, 49.5],
          [-38.5, 49.5],
          [-42.0, 46.5],
        ],
      },
      {
        id: "farmer_gopalan",
        name: "Gopalan",
        age: 47,
        gender: "male",
        job: "market_farmer",
        socialClass: "middle",
        height: 1.7,
        waypoints: [[2.8, -22.5]],
        partnerId: "farmer_madhavan",
      },
      {
        id: "farmer_madhavan",
        name: "Madhavan",
        age: 31,
        gender: "male",
        job: "market_farmer",
        socialClass: "poor",
        height: 1.67,
        waypoints: [[4.3, -22.2]],
        partnerId: "farmer_gopalan",
      },
    ];

    farmerProfiles.forEach((profile, idx) => {
      const physics = derivePhysicsFromProfile(profile);
      const cloned = cloneSkeleton(baseTemplate) as THREE.Group;
      normalizeRigBones(cloned);
      fitMixamoCharacter(cloned, profile.height);
      const invModelScale = 1 / Math.max(cloned.scale.x, 0.0001);

      const root = new THREE.Group();
      root.name = `mixamo_${profile.id}`;
      root.add(cloned);

      const [sx, sz] = profile.waypoints[0];
      root.position.set(sx, groundYAt(sx, sz), sz);
      scene.add(root);

      const mixer = new THREE.AnimationMixer(cloned);
      const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
      for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
        const act = mixer.clipAction(clip);
        act.setLoop(THREE.LoopRepeat, Infinity);
        actions[k] = act;
      }

      const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
      const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
      const headBone = findBone(cloned, ["mixamorigHead"]);
      const hipsBone = findBone(cloned, ["mixamorigHips"]);
      const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
      const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
      const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
      const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

      // 1) Attach Night Lamp prop to Right Hand (hidden during daytime, lit at dusk/night)
      const nightLampGroup = new THREE.Group();
      let nightLampFlameMat: THREE.MeshStandardMaterial | undefined;
      if (accessories.lamp) {
        const lampClone = accessories.lamp.clone(true);
        nightLampGroup.add(lampClone);
      } else {
        const fb = createFallbackNightLamp();
        nightLampGroup.add(fb.group);
        nightLampFlameMat = fb.flameMat;
      }
      nightLampGroup.scale.setScalar(invModelScale);
      nightLampGroup.position.set(0, 0.04 * invModelScale, 0.02 * invModelScale);
      nightLampGroup.visible = false;
      // Add warm flickering PointLight to the first 3 farmers so GPU light budget stays fast
      let nightLampLight: THREE.PointLight | undefined;
      if (idx < 3) {
        nightLampLight = new THREE.PointLight(0xffa94d, 0, 10.5, 2);
        nightLampLight.position.set(0, -0.17, 0);
        nightLampGroup.add(nightLampLight);
      }
      (rightHandBone ?? root).add(nightLampGroup);

      // 2) Attach Beedi prop to Right Hand + Matchbox to Left Hand (shown during Smoking state)
      const beediGroup = new THREE.Group();
      let beediEmberMat: THREE.MeshStandardMaterial | undefined;
      const beediTipAnchor = new THREE.Object3D();
      if (accessories.beedi) {
        const bClone = accessories.beedi.clone(true);
        beediGroup.add(bClone);
        beediTipAnchor.position.set(0, 0, 0.074);
        beediGroup.add(beediTipAnchor);
      } else {
        const fb = createFallbackBeedi();
        beediGroup.add(fb.group);
        beediEmberMat = fb.emberMat;
        beediTipAnchor.position.copy(fb.tipAnchor.position);
        beediGroup.add(beediTipAnchor);
      }
      beediGroup.scale.setScalar(invModelScale);
      beediGroup.position.set(0.015 * invModelScale, 0.065 * invModelScale, 0.025 * invModelScale);
      beediGroup.rotation.set(0.25, 0.4, 0.1);
      beediGroup.visible = false;
      (rightHandBone ?? root).add(beediGroup);

      const matchboxGroup = new THREE.Group();
      if (accessories.matchbox) {
        matchboxGroup.add(accessories.matchbox.clone(true));
      } else {
        matchboxGroup.add(createFallbackMatchbox());
      }
      matchboxGroup.scale.setScalar(invModelScale);
      matchboxGroup.position.set(-0.01 * invModelScale, 0.055 * invModelScale, 0.02 * invModelScale);
      matchboxGroup.visible = false;
      (leftHandBone ?? root).add(matchboxGroup);

      // Initial state tailored to job (let Kuttan start smoking near spawn briefly so player sees beedi + smoke right away!)
      const initialState: MixamoNpcState =
        idx === 0
          ? "smoke"
          : profile.job === "paddy_farmer" || profile.job === "vegetable_grower"
            ? "work"
            : profile.job === "market_farmer"
              ? idx % 2 === 0
                ? "talk"
                : "idle"
              : "walk";

      const actor: MixamoNpcActor = {
        profile,
        physics,
        brain: FARMER_MAN_BRAIN,
        root,
        model: cloned,
        mixer,
        actions,
        waypointIdx: profile.waypoints.length > 1 ? 1 : 0,
        subPath: [],
        subPathIdx: 0,
        lastProgressX: sx,
        lastProgressZ: sz,
        stuckTimer: 0,
        spawnCleared: false,
        x: sx,
        z: sz,
        vx: 0,
        vz: 0,
        yaw: idx * 0.9,
        currentSpeed: initialState === "walk" ? physics.walkSpeed : 0,
        yieldTarget: null,
        state: initialState,
        stateTimer: idx === 0 ? 11.0 : 5.0 + idx * 1.5,
        hipsBone,
        leftFootBone,
        rightFootBone,
        leftToeBone,
        rightToeBone,
        footGroundInitialized: false,
        rightHandBone,
        leftHandBone,
        headBone,
        nightLampGroup,
        nightLampLight,
        nightLampFlameMat,
        beediGroup,
        beediTipAnchor,
        beediEmberMat,
        matchboxGroup,
        smokeTipAccum: 0,
        smokeExhaleTimer: 1.6,
        activeStoneIdx: null,
        stonePhaseTimer: 0,
        stonePhaseDuration: 0,
        stoneEdgeX: sx,
        stoneEdgeZ: sz,
        stoneSitX: sx,
        stoneSitZ: sz,
        stoneLandX: sx,
        stoneLandZ: sz,
        stoneStartY: groundYAt(sx, sz),
        stoneCooldown: idx === 0 ? 0 : 8 + idx * 6,
      };

      const startAnim: MixamoAnimKey =
        initialState === "smoke"
          ? "smoke"
          : initialState === "work"
            ? "work"
            : initialState === "talk"
              ? "talk"
              : initialState === "walk"
                ? "walk"
                : "breathIdle";
      playAction(actor, startAnim, 0.01);
      if (actor.activeAction) {
        actor.activeAction.time =
          (idx * 0.73) % Math.max(0.5, actor.activeAction.getClip().duration);
      }

      actors.push(actor);
    });

    // Link market conversation partners
    actors.forEach((a) => {
      if (a.profile.partnerId) {
        const pIdx = actors.findIndex((o) => o.profile.id === a.profile.partnerId);
        if (pIdx >= 0) {
          a.partnerIdx = pIdx;
          const p = actors[pIdx];
          a.yaw = Math.atan2(p.x - a.x, p.z - a.z);
          a.root.rotation.y = a.yaw;
        }
      }
    });

    console.info(
      `Loaded Mixamo Set #1 (farmer_man_mixamo.fbx) with ${Object.keys(clips).length}/${animEntries.length} clips; spawned ${actors.length} classified Kerala farmers.`,
    );

    // Set #2 (Auto-loads as soon as public/models/npcs/mixamo/villager_woman_mixamo.fbx is exported from Mixamo!)
    const womanUrl = `${baseUrl}models/npcs/mixamo/villager_woman_mixamo.fbx`;
    loadFbx(womanUrl)
      .then((womanTemplate) => {
        normalizeRigBones(womanTemplate);
        tuneMixamoMaterials(womanTemplate);
        const womanProfiles: NpcCharacterProfile[] = [
          {
            id: "woman_lakshmi",
            name: "Lakshmi",
            age: 32,
            gender: "female",
            job: "village_laborer",
            socialClass: "middle",
            height: 1.59,
            waypoints: [
              [1.5, -16.0],
              [9.5, -20.5],
              [14.0, -14.5],
              [6.0, -11.0],
            ],
          },
          {
            id: "woman_meera",
            name: "Meera",
            age: 25,
            gender: "female",
            job: "temple_devotee",
            socialClass: "middle",
            height: 1.57,
            waypoints: [
              [-3.5, -21.0],
              [4.0, -26.0],
              [0.5, -18.0],
            ],
          },
          {
            id: "woman_devaki",
            name: "Devaki",
            age: 44,
            gender: "female",
            job: "vegetable_grower",
            socialClass: "poor",
            height: 1.56,
            waypoints: [
              [-37.5, 48.0],
              [-43.5, 48.0],
              [-40.5, 44.5],
            ],
          },
          {
            id: "woman_radha",
            name: "Radha",
            age: 29,
            gender: "female",
            job: "market_farmer",
            socialClass: "middle",
            height: 1.58,
            waypoints: [[6.2, -23.5]],
          },
        ];

        womanProfiles.forEach((profile, wIdx) => {
          const physics = derivePhysicsFromProfile(profile);
          const cloned = cloneSkeleton(womanTemplate) as THREE.Group;
          normalizeRigBones(cloned);
          fitMixamoCharacter(cloned, profile.height);
          const invModelScale = 1 / Math.max(cloned.scale.x, 0.0001);

          const root = new THREE.Group();
          root.name = `mixamo_${profile.id}`;
          root.add(cloned);

          const [sx, sz] = profile.waypoints[0];
          root.position.set(sx, groundYAt(sx, sz), sz);
          scene.add(root);

          const mixer = new THREE.AnimationMixer(cloned);
          const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
          for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
            const act = mixer.clipAction(clip);
            act.setLoop(THREE.LoopRepeat, Infinity);
            actions[k] = act;
          }

          const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
          const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
          const headBone = findBone(cloned, ["mixamorigHead"]);
          const hipsBone = findBone(cloned, ["mixamorigHips"]);
          const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
          const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
          const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
          const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

          const nightLampGroup = new THREE.Group();
          let nightLampFlameMat: THREE.MeshStandardMaterial | undefined;
          if (accessories.lamp) {
            nightLampGroup.add(accessories.lamp.clone(true));
          } else {
            const fb = createFallbackNightLamp();
            nightLampGroup.add(fb.group);
            nightLampFlameMat = fb.flameMat;
          }
          nightLampGroup.scale.setScalar(invModelScale);
          nightLampGroup.position.set(0, 0.04 * invModelScale, 0.02 * invModelScale);
          nightLampGroup.visible = false;
          (rightHandBone ?? root).add(nightLampGroup);

          const beediGroup = new THREE.Group();
          const beediTipAnchor = new THREE.Object3D();
          beediGroup.visible = false;
          const matchboxGroup = new THREE.Group();
          matchboxGroup.visible = false;

          const initialState: MixamoNpcState =
            profile.waypoints.length > 1 ? "walk" : "idle";

          const actor: MixamoNpcActor = {
            profile,
            physics,
            brain: VILLAGER_WOMAN_BRAIN,
            root,
            model: cloned,
            mixer,
            actions,
            waypointIdx: profile.waypoints.length > 1 ? 1 : 0,
            subPath: [],
            subPathIdx: 0,
            lastProgressX: sx,
            lastProgressZ: sz,
            stuckTimer: 0,
            spawnCleared: false,
            x: sx,
            z: sz,
            vx: 0,
            vz: 0,
            yaw: wIdx * 1.1,
            currentSpeed: initialState === "walk" ? physics.walkSpeed : 0,
            yieldTarget: null,
            state: initialState,
            stateTimer: 5.0 + wIdx * 1.5,
            hipsBone,
            leftFootBone,
            rightFootBone,
            leftToeBone,
            rightToeBone,
            footGroundInitialized: false,
            rightHandBone,
            leftHandBone,
            headBone,
            nightLampGroup,
            nightLampFlameMat,
            beediGroup,
            beediTipAnchor,
            matchboxGroup,
            smokeTipAccum: 0,
            smokeExhaleTimer: 99,
            activeStoneIdx: null,
            stonePhaseTimer: 0,
            stonePhaseDuration: 0,
            stoneEdgeX: sx,
            stoneEdgeZ: sz,
            stoneSitX: sx,
            stoneSitZ: sz,
            stoneLandX: sx,
            stoneLandZ: sz,
            stoneStartY: groundYAt(sx, sz),
            stoneCooldown: 9999, // Set #2 women do not climb Chumaduthangi stones
          };

          playAction(actor, initialState === "walk" ? "walk" : "breathIdle", 0.01);
          actors.push(actor);
        });
        console.info(`Loaded Mixamo Set #2 (villager_woman_mixamo.fbx); spawned ${womanProfiles.length} Kerala village women.`);
      })
      .catch(() => {
        // Set #2 FBX not exported yet — will auto-spawn as soon as villager_woman_mixamo.fbx is placed in public/models/npcs/mixamo/
      });

    // Set #3 (Auto-loads as soon as public/models/npcs/mixamo/elder_man_mixamo.fbx is exported from Mixamo!)
    const elderUrl = `${baseUrl}models/npcs/mixamo/elder_man_mixamo.fbx`;
    loadFbx(elderUrl)
      .then((elderTemplate) => {
        normalizeRigBones(elderTemplate);
        tuneMixamoMaterials(elderTemplate);
        const elderProfiles: NpcCharacterProfile[] = [
          {
            id: "elder_shankaran",
            name: "Shankaran",
            age: 62,
            gender: "male",
            job: "temple_devotee",
            socialClass: "upper",
            height: 1.67,
            waypoints: [
              [-2.0, -24.0],
              [2.5, -28.0],
              [6.5, -26.5],
              [1.0, -21.5],
            ],
          },
          {
            id: "elder_krishnan",
            name: "Krishnan",
            age: 58,
            gender: "male",
            job: "village_laborer",
            socialClass: "middle",
            height: 1.69,
            waypoints: [
              [8.0, -9.5],
              [16.5, -14.0],
              [12.0, -21.0],
              [4.5, -14.5],
            ],
          },
          {
            id: "elder_achuthan",
            name: "Achuthan",
            age: 64,
            gender: "male",
            job: "temple_devotee",
            socialClass: "middle",
            height: 1.65,
            waypoints: [
              [-10.5, 4.0],
              [-4.0, -2.5],
              [3.5, 2.0],
              [-6.0, 9.0],
            ],
          },
          {
            id: "elder_damodaran",
            name: "Damodaran",
            age: 56,
            gender: "male",
            job: "market_farmer",
            socialClass: "upper",
            height: 1.7,
            waypoints: [[5.4, -20.8]],
          },
        ];

        elderProfiles.forEach((profile, eIdx) => {
          const physics = derivePhysicsFromProfile(profile);
          const cloned = cloneSkeleton(elderTemplate) as THREE.Group;
          normalizeRigBones(cloned);
          fitMixamoCharacter(cloned, profile.height);
          const invModelScale = 1 / Math.max(cloned.scale.x, 0.0001);

          const root = new THREE.Group();
          root.name = `mixamo_${profile.id}`;
          root.add(cloned);

          const [sx, sz] = profile.waypoints[0];
          root.position.set(sx, groundYAt(sx, sz), sz);
          scene.add(root);

          const mixer = new THREE.AnimationMixer(cloned);
          const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
          for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
            const act = mixer.clipAction(clip);
            act.setLoop(THREE.LoopRepeat, Infinity);
            actions[k] = act;
          }

          const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
          const rightPalmBone = findBone(cloned, [
            "mixamorigRightHandMiddle1",
            "mixamorigRightHandIndex1",
            "mixamorigRightHand",
          ]);
          const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
          const headBone = findBone(cloned, ["mixamorigHead"]);
          const hipsBone = findBone(cloned, ["mixamorigHips"]);
          const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
          const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
          const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
          const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

          const nightLampGroup = new THREE.Group();
          let nightLampFlameMat: THREE.MeshStandardMaterial | undefined;
          if (accessories.lamp) {
            nightLampGroup.add(accessories.lamp.clone(true));
          } else {
            const fb = createFallbackNightLamp();
            nightLampGroup.add(fb.group);
            nightLampFlameMat = fb.flameMat;
          }
          nightLampGroup.scale.setScalar(invModelScale);
          nightLampGroup.position.set(0, 0.04 * invModelScale, 0.02 * invModelScale);
          nightLampGroup.visible = false;
          (rightHandBone ?? root).add(nightLampGroup);

          const beediGroup = new THREE.Group();
          let beediEmberMat: THREE.MeshStandardMaterial | undefined;
          const beediTipAnchor = new THREE.Object3D();
          if (accessories.beedi) {
            beediGroup.add(accessories.beedi.clone(true));
            beediTipAnchor.position.set(0, 0, 0.074);
            beediGroup.add(beediTipAnchor);
          } else {
            const fb = createFallbackBeedi();
            beediGroup.add(fb.group);
            beediEmberMat = fb.emberMat;
            beediTipAnchor.position.copy(fb.tipAnchor.position);
            beediGroup.add(beediTipAnchor);
          }
          beediGroup.scale.setScalar(invModelScale);
          beediGroup.position.set(0.015 * invModelScale, 0.065 * invModelScale, 0.025 * invModelScale);
          beediGroup.rotation.set(0.25, 0.4, 0.1);
          beediGroup.visible = false;
          (rightHandBone ?? root).add(beediGroup);

          const matchboxGroup = new THREE.Group();
          if (accessories.matchbox) {
            matchboxGroup.add(accessories.matchbox.clone(true));
          } else {
            matchboxGroup.add(createFallbackMatchbox());
          }
          matchboxGroup.scale.setScalar(invModelScale);
          matchboxGroup.position.set(-0.01 * invModelScale, 0.055 * invModelScale, 0.02 * invModelScale);
          matchboxGroup.visible = false;
          (leftHandBone ?? root).add(matchboxGroup);

          // Traditional 1.46m carved Kerala teak walking staff (Oonnuvadi / "Vadi kuthi nadakkuka")
          // Added in world space so the hand-to-ground solver keeps it dead-center in the fist & planted on soil
          const walkingStickGroup = createFallbackWalkingStick();
          walkingStickGroup.visible = true;
          scene.add(walkingStickGroup);

          const initialState: MixamoNpcState =
            profile.waypoints.length > 1 ? "walk" : "idle";

          const actor: MixamoNpcActor = {
            profile,
            physics,
            brain: ELDER_MAN_BRAIN,
            root,
            model: cloned,
            mixer,
            actions,
            waypointIdx: profile.waypoints.length > 1 ? 1 : 0,
            subPath: [],
            subPathIdx: 0,
            lastProgressX: sx,
            lastProgressZ: sz,
            stuckTimer: 0,
            spawnCleared: false,
            x: sx,
            z: sz,
            vx: 0,
            vz: 0,
            yaw: eIdx * 1.2,
            currentSpeed: initialState === "walk" ? physics.walkSpeed : 0,
            yieldTarget: null,
            state: initialState,
            stateTimer: 5.5 + eIdx * 1.4,
            hipsBone,
            leftFootBone,
            rightFootBone,
            leftToeBone,
            rightToeBone,
            footGroundInitialized: false,
            rightHandBone,
            rightPalmBone,
            leftHandBone,
            headBone,
            nightLampGroup,
            nightLampFlameMat,
            walkingStickGroup,
            beediGroup,
            beediTipAnchor,
            beediEmberMat,
            matchboxGroup,
            smokeTipAccum: 0,
            smokeExhaleTimer: 2.2,
            activeStoneIdx: null,
            stonePhaseTimer: 0,
            stonePhaseDuration: 0,
            stoneEdgeX: sx,
            stoneEdgeZ: sz,
            stoneSitX: sx,
            stoneSitZ: sz,
            stoneLandX: sx,
            stoneLandZ: sz,
            stoneStartY: groundYAt(sx, sz),
            stoneCooldown: 9999, // Elders do not climb Chumaduthangi stones
          };

          playAction(actor, initialState === "walk" ? "walk" : "breathIdle", 0.01);
          actors.push(actor);
        });
        console.info(`Loaded Mixamo Set #3 (elder_man_mixamo.fbx); spawned ${elderProfiles.length} Kerala village elders.`);
      })
      .catch(() => {
        // Set #3 FBX not exported yet — will auto-spawn as soon as elder_man_mixamo.fbx is placed in public/models/npcs/mixamo/
      });

    // Set #4 (Auto-loads as soon as public/models/npcs/mixamo/landlord_mixamo.fbx is exported from Mixamo!)
    const landlordUrl = `${baseUrl}models/npcs/mixamo/landlord_mixamo.fbx`;
    loadFbx(landlordUrl)
      .then((landlordTemplate) => {
        normalizeRigBones(landlordTemplate);
        tuneMixamoMaterials(landlordTemplate);
        const landlordProfiles: NpcCharacterProfile[] = [
          {
            id: "landlord_rama_varma",
            name: "Thampuran Rama Varma",
            age: 48,
            gender: "male",
            job: "temple_devotee",
            socialClass: "upper",
            height: 1.74,
            waypoints: [
              [64.0, -50.0],
              [42.0, -37.0],
              [14.0, -26.0],
              [3.5, -24.5],
              [8.5, -8.5],
            ],
          },
        ];

        landlordProfiles.forEach((profile, lIdx) => {
          const physics = derivePhysicsFromProfile(profile);
          const cloned = cloneSkeleton(landlordTemplate) as THREE.Group;
          normalizeRigBones(cloned);
          fitMixamoCharacter(cloned, profile.height);
          const invModelScale = 1 / Math.max(cloned.scale.x, 0.0001);

          const root = new THREE.Group();
          root.name = `mixamo_${profile.id}`;
          root.add(cloned);

          const [sx, sz] = profile.waypoints[0];
          root.position.set(sx, groundYAt(sx, sz), sz);
          scene.add(root);

          const mixer = new THREE.AnimationMixer(cloned);
          const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
          for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
            const act = mixer.clipAction(clip);
            act.setLoop(THREE.LoopRepeat, Infinity);
            actions[k] = act;
          }

          const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
          const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
          const headBone = findBone(cloned, ["mixamorigHead"]);
          const hipsBone = findBone(cloned, ["mixamorigHips"]);
          const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
          const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
          const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
          const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

          const nightLampGroup = new THREE.Group();
          let nightLampFlameMat: THREE.MeshStandardMaterial | undefined;
          if (accessories.lamp) {
            nightLampGroup.add(accessories.lamp.clone(true));
          } else {
            const fb = createFallbackNightLamp();
            nightLampGroup.add(fb.group);
            nightLampFlameMat = fb.flameMat;
          }
          nightLampGroup.scale.setScalar(invModelScale);
          nightLampGroup.position.set(0, 0.04 * invModelScale, 0.02 * invModelScale);
          nightLampGroup.visible = false;
          (rightHandBone ?? root).add(nightLampGroup);

          const beediGroup = new THREE.Group();
          const beediTipAnchor = new THREE.Object3D();
          beediGroup.visible = false;
          const matchboxGroup = new THREE.Group();
          matchboxGroup.visible = false;

          const actor: MixamoNpcActor = {
            profile,
            physics,
            brain: LANDLORD_BRAIN,
            root,
            model: cloned,
            mixer,
            actions,
            waypointIdx: 1,
            subPath: [],
            subPathIdx: 0,
            lastProgressX: sx,
            lastProgressZ: sz,
            stuckTimer: 0,
            spawnCleared: false,
            x: sx,
            z: sz,
            vx: 0,
            vz: 0,
            yaw: lIdx * 1.1,
            currentSpeed: physics.walkSpeed,
            yieldTarget: null,
            state: "walk",
            stateTimer: 8.0 + lIdx * 2.0,
            hipsBone,
            leftFootBone,
            rightFootBone,
            leftToeBone,
            rightToeBone,
            footGroundInitialized: false,
            rightHandBone,
            leftHandBone,
            headBone,
            nightLampGroup,
            nightLampFlameMat,
            beediGroup,
            beediTipAnchor,
            matchboxGroup,
            smokeTipAccum: 0,
            smokeExhaleTimer: 99,
            activeStoneIdx: null,
            stonePhaseTimer: 0,
            stonePhaseDuration: 0,
            stoneEdgeX: sx,
            stoneEdgeZ: sz,
            stoneSitX: sx,
            stoneSitZ: sz,
            stoneLandX: sx,
            stoneLandZ: sz,
            stoneStartY: groundYAt(sx, sz),
            stoneCooldown: 9999,
          };

          playAction(actor, actor.actions.landlordWalk ? "landlordWalk" : "walk", 0.01);
          actors.push(actor);
        });
        console.info(`Loaded Mixamo Set #4 (landlord_mixamo.fbx); spawned ${landlordProfiles.length} Kerala estate landlords.`);
      })
      .catch(() => {
        // Set #4 FBX not exported yet — will auto-spawn as soon as landlord_mixamo.fbx is placed in public/models/npcs/mixamo/
      });

    // Set #5 — Kerala Kalaripayattu Students (loads kalari_student.fbx + all 22 combat & reaction clips in anims/compact/)
    const loadKalariModel = () =>
      loadFbx(`${baseUrl}models/npcs/mixamo/kalari_student.fbx`).catch(() =>
        loadFbx(`${baseUrl}models/npcs/mixamo/kalari_student_mixamo.fbx`),
      );
    const loadWeaponOptional = (filename: string) =>
      new Promise<THREE.Group | undefined>((resolve) => {
        gltfLoader.load(
          `${baseUrl}models/weapons/${filename}`,
          (gltf) => resolve(gltf.scene),
          undefined,
          () => resolve(undefined),
        );
      });
    const combatEntries = Object.entries(KALARI_COMBAT_ANIM_FILES) as [
      KalariCombatAnimKey,
      string,
    ][];

    Promise.allSettled([
      loadKalariModel(),
      loadWeaponOptional("kalari_sword.glb"),
      loadWeaponOptional("kalari_buckler.glb"),
      loadWeaponOptional("kalari_spear.glb"),
      loadWeaponOptional("kalari_kettukari.glb"),
      ...combatEntries.map(([, file]) =>
        loadFbx(`${baseUrl}models/npcs/mixamo/anims/compact/${encodeURIComponent(file)}`),
      ),
    ]).then(([kalariRes, swordRes, bucklerRes, spearRes, staffRes, ...combatAnimResults]) => {
      if (kalariRes.status !== "fulfilled") return;

      const kalariTemplate = kalariRes.value;
      normalizeRigBones(kalariTemplate);
      tuneMixamoMaterials(kalariTemplate);

      const swordTpl = swordRes.status === "fulfilled" ? swordRes.value : undefined;
      const bucklerTpl = bucklerRes.status === "fulfilled" ? bucklerRes.value : undefined;
      const spearTpl = spearRes.status === "fulfilled" ? spearRes.value : undefined;
      const staffTpl = staffRes.status === "fulfilled" ? staffRes.value : undefined;

      const combatClips: Partial<Record<KalariCombatAnimKey, THREE.AnimationClip>> = {};
      combatAnimResults.forEach((res, idx) => {
        if (res.status === "fulfilled" && res.value.animations.length > 0) {
          const key = combatEntries[idx][0];
          combatClips[key] = normalizeMixamoClip(res.value.animations[0], true);
        }
      });

      const normalizeWeaponProp = (tpl: THREE.Group, targetLen: number): THREE.Group => {
        const clone = tpl.clone(true);
        clone.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(clone);
        const sz = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(sz.x, sz.y, sz.z, 0.001);
        const sc = targetLen / maxDim;
        clone.scale.setScalar(sc);
        clone.traverse((p) => {
          if (p instanceof THREE.Mesh) {
            p.castShadow = true;
            p.receiveShadow = true;
          }
        });
        return clone;
      };

      // Builds a 1.92m world-space Kerala Kuntham spear with origin (0,0,0) at the rear right-hand
      // grip and shaft + forged leaf spearhead extending along +Y (auto-uses kalari_spear.glb when present)
      const buildWorldKalariSpear = (): THREE.Group => {
        const root = new THREE.Group();
        if (spearTpl) {
          const model = spearTpl.clone(true);
          // Blender exports +Y forward as glTF -Z; rotate +90 deg around X so the spear tip points along +Y
          model.rotation.x = Math.PI * 0.5;
          model.traverse((p) => {
            if (p instanceof THREE.Mesh) {
              p.castShadow = true;
              p.receiveShadow = true;
            }
          });
          root.add(model);
          return root;
        }
        const teakMat = new THREE.MeshStandardMaterial({ color: 0x4b2b16, roughness: 0.72 });
        const steelMat = new THREE.MeshStandardMaterial({ color: 0xc2c8ce, roughness: 0.28, metalness: 0.9 });
        const brassMat = new THREE.MeshStandardMaterial({ color: 0xcfa03a, roughness: 0.32, metalness: 0.85 });
        const coirMat = new THREE.MeshStandardMaterial({ color: 0x7a5730, roughness: 0.9 });
        const clothMat = new THREE.MeshStandardMaterial({ color: 0x9c1816, roughness: 0.85 });

        if (staffTpl) {
          const shaft = normalizeWeaponProp(staffTpl, 1.56);
          shaft.position.set(0, 0.28, 0);
          root.add(shaft);
        } else {
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0138, 0.0144, 1.56, 12), teakMat);
          shaft.position.set(0, 0.28, 0);
          shaft.castShadow = true;
          root.add(shaft);
        }
        const buttCap = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.011, 0.065, 10), brassMat);
        buttCap.position.set(0, -0.50, 0);
        const rearGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.14, 12), coirMat);
        rearGrip.position.set(0, 0.0, 0);
        const frontGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0158, 0.14, 12), coirMat);
        frontGrip.position.set(0, 0.48, 0);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.0155, 0.075, 12), brassMat);
        collar.position.set(0, 1.07, 0);
        const tassel = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.0055, 8, 16), clothMat);
        tassel.rotation.x = Math.PI * 0.5;
        tassel.position.set(0, 1.03, 0);
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.30, 4), steelMat);
        blade.scale.set(1.0, 1.0, 0.28);
        blade.position.set(0, 1.25, 0);
        blade.castShadow = true;
        root.add(buttCap, rearGrip, frontGrip, collar, tassel, blade);
        return root;
      };

      interface KalariStudentSpec {
        profile: NpcCharacterProfile;
        role: KalariTrainingRole;
        anchor: [number, number];
        homeYaw: number;
        partnerId?: string;
        isPairLeader?: boolean;
        variant: KalariAppearanceVariant;
      }

      // 6 visibly distinct Kalari students anchored dynamically relative to kalariSite:
      const [kx0, kz0] = kalariSite;
      const kalariSpecs: KalariStudentSpec[] = [
        {
          profile: {
            id: "kalari_unni",
            name: "Unni",
            age: 22,
            gender: "male",
            job: "village_laborer",
            socialClass: "middle",
            height: 1.72,
            waypoints: [[kx0 - 2.6, kz0 + 0.9]],
            partnerId: "kalari_chandu",
          },
          role: "unarmed_spar",
          anchor: [kx0 - 2.6, kz0 + 0.9],
          homeYaw: Math.PI * 0.5,
          partnerId: "kalari_chandu",
          isPairLeader: true,
          variant: {
            skinTint: 0xffffff,
            lowerColorHex: 0x16171a, // Classic charcoal-black Uduthuketti
            sashColorHex: 0xb01616,  // Crimson Kacha
            shoulderWidthMul: 1.0,
            headbandColor: 0xa61614, // Crimson Thalakkettu headband
            tilakKind: "kumkum",
          },
        },
        {
          profile: {
            id: "kalari_chandu",
            name: "Chandu",
            age: 25,
            gender: "male",
            job: "village_laborer",
            socialClass: "middle",
            height: 1.80,
            waypoints: [[kx0 - 0.95, kz0 + 0.9]],
            partnerId: "kalari_unni",
          },
          role: "unarmed_spar",
          anchor: [kx0 - 0.95, kz0 + 0.9],
          homeYaw: -Math.PI * 0.5,
          partnerId: "kalari_unni",
          isPairLeader: false,
          variant: {
            skinTint: 0xd0b098,      // Deeper sun-bronzed skin
            lowerColorHex: 0x1c2842, // Deep indigo Uduthuketti
            sashColorHex: 0xd85a14,  // Saffron-vermilion Kacha
            shoulderWidthMul: 1.09,  // Broader powerhouse frame
            tilakKind: "bhasmam",    // 3-stripe sacred ash
            wristWrapColor: 0x9c1b16,
          },
        },
        {
          profile: {
            id: "kalari_aromal",
            name: "Aromal",
            age: 24,
            gender: "male",
            job: "temple_devotee",
            socialClass: "middle",
            height: 1.75,
            waypoints: [[kx0 + 0.55, kz0 - 1.3]],
            partnerId: "kalari_kannan",
          },
          role: "sword_spar",
          anchor: [kx0 + 0.55, kz0 - 1.3],
          homeYaw: Math.PI * 0.5,
          partnerId: "kalari_kannan",
          isPairLeader: true,
          variant: {
            skinTint: 0xffe4d0,      // Fairer warm wheatish skin
            lowerColorHex: 0xddd2b6, // Traditional off-white Kasavu martial wrap
            sashColorHex: 0x9a121c,  // Deep temple-crimson Kacha
            shoulderWidthMul: 1.02,
            hasKudumaBun: true,      // Traditional Kerala warrior topknot
            headbandColor: 0xd07818, // Saffron headband
            tilakKind: "chandanam",
          },
        },
        {
          profile: {
            id: "kalari_kannan",
            name: "Kannan",
            age: 23,
            gender: "male",
            job: "village_laborer",
            socialClass: "middle",
            height: 1.68,
            waypoints: [[kx0 + 2.35, kz0 - 1.3]],
            partnerId: "kalari_aromal",
          },
          role: "sword_spar",
          anchor: [kx0 + 2.35, kz0 - 1.3],
          homeYaw: -Math.PI * 0.5,
          partnerId: "kalari_aromal",
          isPairLeader: false,
          variant: {
            skinTint: 0xe6c8b2,
            lowerColorHex: 0x421518, // Deep temple-maroon Uduthuketti
            sashColorHex: 0xc8921e,  // Golden-ochre Kacha
            shoulderWidthMul: 0.96,  // Leaner agile duelist
            headbandColor: 0x1c2438, // Dark indigo headband
            wristWrapColor: 0x22201e,
          },
        },
        {
          profile: {
            id: "kalari_othenan",
            name: "Othenan",
            age: 21,
            gender: "male",
            job: "village_laborer",
            socialClass: "middle",
            height: 1.65,
            waypoints: [[kx0 - 2.1, kz0 - 1.5]],
          },
          role: "solo_acrobatics",
          anchor: [kx0 - 2.1, kz0 - 1.5],
          homeYaw: 0.55,
          variant: {
            skinTint: 0xf4d8c4,
            lowerColorHex: 0x223328, // Dark forest-slate Uduthuketti
            sashColorHex: 0xd43818,  // Bright vermilion Kacha
            shoulderWidthMul: 0.94,  // Nimble young acrobat
            tilakKind: "chandanam",
          },
        },
        {
          profile: {
            id: "kalari_kunjiraman",
            name: "Kunjiraman",
            age: 26,
            gender: "male",
            job: "temple_devotee",
            socialClass: "middle",
            height: 1.79,
            waypoints: [[kx0 + 1.85, kz0 + 1.45]],
          },
          role: "staff_drill",
          anchor: [kx0 + 1.85, kz0 + 1.45],
          homeYaw: Math.atan2(2.05, 1.35),
          variant: {
            skinTint: 0xc8a48c,      // Deep bronze warrior tone
            lowerColorHex: 0x4a2f18, // Earthy burnt-ochre Uduthuketti
            sashColorHex: 0x8e1214,  // Dark burgundy Kacha
            shoulderWidthMul: 1.08,
            headbandColor: 0x7c1416, // Maroon Thalakkettu
            tilakKind: "bhasmam",
            wristWrapColor: 0x5c381a,
          },
        },
      ];

      const spawnedKalari: MixamoNpcActor[] = [];

      kalariSpecs.forEach((spec, kIdx) => {
        const { profile } = spec;
        const physics = derivePhysicsFromProfile(profile);
        const cloned = cloneSkeleton(kalariTemplate) as THREE.Group;
        normalizeRigBones(cloned);
        applyKalariAppearanceVariant(cloned, spec.variant);
        fitMixamoCharacter(cloned, profile.height);
        cloned.scale.x *= spec.variant.shoulderWidthMul;
        const invModelScale = 1 / Math.max(cloned.scale.y, 0.0001);

        const root = new THREE.Group();
        root.name = `mixamo_${profile.id}`;
        root.add(cloned);

        const [sx, sz] = spec.anchor;
        root.position.set(sx, groundYAt(sx, sz), sz);
        root.rotation.y = spec.homeYaw;
        scene.add(root);

        const mixer = new THREE.AnimationMixer(cloned);
        const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
        for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
          const act = mixer.clipAction(clip);
          act.setLoop(THREE.LoopRepeat, Infinity);
          actions[k] = act;
        }
        for (const [k, clip] of Object.entries(combatClips) as [KalariCombatAnimKey, THREE.AnimationClip][]) {
          const act = mixer.clipAction(clip);
          if (k === "ginga") {
            act.setLoop(THREE.LoopRepeat, Infinity);
          } else {
            act.setLoop(THREE.LoopOnce, 1);
            act.clampWhenFinished = true;
          }
          actions[k] = act;
        }

        const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
        const rightPalmBone = findBone(cloned, [
          "mixamorigRightHandMiddle1",
          "mixamorigRightHandIndex1",
          "mixamorigRightHand",
        ]);
        const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
        const leftPalmBone = findBone(cloned, [
          "mixamorigLeftHandMiddle1",
          "mixamorigLeftHandIndex1",
          "mixamorigLeftHand",
        ]);
        const leftForeArmBone = findBone(cloned, ["mixamorigLeftForeArm", "mixamorigLeftHand"]);
        const rightForeArmBone = findBone(cloned, ["mixamorigRightForeArm", "mixamorigRightHand"]);
        const headBone = findBone(cloned, ["mixamorigHead"]);
        const hipsBone = findBone(cloned, ["mixamorigHips"]);
        const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
        const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
        const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
        const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

        // Attach distinctive 3D headbands, Kuduma hair bun, forehead tilak & forearm wraps
        attachKalariDistinctAccessories(
          spec.variant,
          invModelScale,
          headBone,
          leftForeArmBone,
          rightForeArmBone,
        );

        // Attach authentic Blender Kalari weapons to Sword & Shield sparrers and world-space Kuntham spear
        let kalariSwordProp: THREE.Object3D | undefined;
        let kalariShieldProp: THREE.Object3D | undefined;
        let kalariStaffProp: THREE.Object3D | undefined;

        if (spec.role === "sword_spar") {
          if (swordTpl && rightHandBone) {
            const holder = new THREE.Group();
            const swordMesh = swordTpl.clone(true);
            swordMesh.traverse((p) => {
              if (p instanceof THREE.Mesh) {
                p.castShadow = true;
                p.receiveShadow = true;
              }
            });
            // Blender exported +Y blade along glTF -Z; grip origin (0,0,0) sits dead-center in the fist
            holder.add(swordMesh);
            holder.scale.setScalar(invModelScale);
            holder.position.set(0.012 * invModelScale, 0.085 * invModelScale, 0.015 * invModelScale);
            holder.rotation.set(0.08, Math.PI * 0.5, 0);
            rightHandBone.add(holder);
            kalariSwordProp = holder;
          }
          if (bucklerTpl && (leftForeArmBone ?? leftHandBone)) {
            const holder = new THREE.Group();
            const shieldMesh = bucklerTpl.clone(true);
            shieldMesh.traverse((p) => {
              if (p instanceof THREE.Mesh) {
                p.castShadow = true;
                p.receiveShadow = true;
              }
            });
            // Blender exported +Z outer shield dome along glTF +Y; rotate onto outer left forearm
            holder.add(shieldMesh);
            holder.scale.setScalar(invModelScale);
            holder.position.set(-0.045 * invModelScale, 0.16 * invModelScale, 0.03 * invModelScale);
            holder.rotation.set(0, 0, Math.PI * 0.5);
            (leftForeArmBone ?? leftHandBone)!.add(holder);
            kalariShieldProp = holder;
          }
        } else if (spec.role === "staff_drill") {
          // Added in world space so updateKalariSpearPose aligns the shaft cleanly through BOTH hands!
          const spear = buildWorldKalariSpear();
          scene.add(spear);
          kalariStaffProp = spear;
        }

        const nightLampGroup = new THREE.Group();
        nightLampGroup.visible = false;
        const beediGroup = new THREE.Group();
        const beediTipAnchor = new THREE.Object3D();
        beediGroup.visible = false;
        const matchboxGroup = new THREE.Group();
        matchboxGroup.visible = false;

        const kalariCombat = createKalariCombatState(
          spec.role,
          sx,
          sz,
          spec.homeYaw,
          spec.partnerId,
          spec.isPairLeader ?? true,
          kIdx * 2,
        );

        const actor: MixamoNpcActor = {
          profile,
          physics,
          brain: KALARI_STUDENT_BRAIN,
          root,
          model: cloned,
          mixer,
          actions,
          waypointIdx: 0,
          subPath: [],
          subPathIdx: 0,
          lastProgressX: sx,
          lastProgressZ: sz,
          stuckTimer: 0,
          spawnCleared: true, // Intentionally placed inside the Kalari arena pit
          x: sx,
          z: sz,
          vx: 0,
          vz: 0,
          yaw: spec.homeYaw,
          currentSpeed: 0,
          yieldTarget: null,
          state: "kalari_train",
          stateTimer: 999,
          hipsBone,
          leftFootBone,
          rightFootBone,
          leftToeBone,
          rightToeBone,
          footGroundInitialized: false,
          rightHandBone,
          rightPalmBone,
          leftHandBone,
          leftPalmBone,
          headBone,
          nightLampGroup,
          beediGroup,
          beediTipAnchor,
          matchboxGroup,
          smokeTipAccum: 0,
          smokeExhaleTimer: 99,
          activeStoneIdx: null,
          stonePhaseTimer: 0,
          stonePhaseDuration: 0,
          stoneEdgeX: sx,
          stoneEdgeZ: sz,
          stoneSitX: sx,
          stoneSitZ: sz,
          stoneLandX: sx,
          stoneLandZ: sz,
          stoneStartY: groundYAt(sx, sz),
          stoneCooldown: 9999,
          kalariCombat,
          kalariSwordProp,
          kalariShieldProp,
          kalariStaffProp,
        };

        playAction(actor, actions.ginga ? "ginga" : "idle", 0.01);
        actors.push(actor);
        spawnedKalari.push(actor);
      });

      // Link sparring partners by index inside actors[]
      for (const ka of spawnedKalari) {
        if (ka.profile.partnerId) {
          const pIdx = actors.findIndex((o) => o.profile.id === ka.profile.partnerId);
          if (pIdx >= 0) {
            ka.partnerIdx = pIdx;
            const p = actors[pIdx];
            ka.yaw = Math.atan2(p.x - ka.x, p.z - ka.z);
            ka.root.rotation.y = ka.yaw;
          }
        }
      }

      console.info(
        `Loaded Mixamo Set #5 (kalari_student.fbx) with ${Object.keys(combatClips).length}/${combatEntries.length} combat/reaction clips; spawned ${spawnedKalari.length} distinct Kerala Kalari students.`,
      );
    });

    // ==========================================================================
    // Set #6: 18th-Century Kerala River Fishermen (Mukkuvan / Arayan)
    // Uses fisherman_mixamo.fbx + kerala_vallam.glb + Fishing Cast / Fishing Idle / Paddling
    // ==========================================================================
    const loadFishermanModel = () =>
      loadFbx(`${baseUrl}models/npcs/mixamo/fisherman_mixamo.fbx`).catch(() =>
        loadFbx(`${baseUrl}models/npcs/mixamo/fisherman.fbx`),
      );
    const waterYAt = (wx: number, wz: number): number => {
      const info = getWaterInfo?.(wx, wz) as { surfaceY?: number } | null | undefined;
      return typeof info?.surfaceY === "number" ? info.surfaceY : groundYAt(wx, wz);
    };
    Promise.allSettled([
      loadFishermanModel(),
      loadRootModelGlbOptional("kerala_vallam.glb"),
    ]).then(([fishermanRes, vallamRes]) => {
      if (fishermanRes.status !== "fulfilled") return;
      const fishermanTemplate = fishermanRes.value;
      const vallamTemplate = vallamRes.status === "fulfilled" ? vallamRes.value : undefined;
      normalizeRigBones(fishermanTemplate);
      tuneMixamoMaterials(fishermanTemplate);

      // Moor a second idle Kerala Vallam gently floating near the riverside Kadavu landing
      if (vallamTemplate) {
        const mooredVallam = vallamTemplate.clone(true);
        mooredVallam.name = "kerala_vallam_moored";
        mooredVallam.traverse((c) => {
          if (c instanceof THREE.Mesh) {
            c.castShadow = true;
            c.receiveShadow = true;
          }
        });
        const mx = -28.0;
        const mz = -16.5;
        mooredVallam.position.set(mx, waterYAt(mx, mz) - 0.14, mz);
        mooredVallam.rotation.y = 0.32;
        scene.add(mooredVallam);
      }

      // 3 distinct Kerala fishermen:
      // 0) Kochunni   — paddling a floating Kerala Vallam canoe smoothly along the village river (Paddling.fbx)
      // 1) Pappu      — bamboo-rod angling (Choonda) on the eastern riverbank (Fishing Cast.fbx + Fishing Idle.fbx)
      // 2) Thankappan — carrying fresh catch between the riverside Kadavu and the village Fish Stall
      const vallamRiverRoute: [number, number][] = [
        [-33.5, -6.5],
        [-29.2, -15.5],
        [-26.5, -23.0],
        [-23.8, -30.5],
        [-17.5, -38.5],
      ];
      const fishermanProfiles: (NpcCharacterProfile & {
        activityMode?: "vallam_paddling" | "rod_fishing";
        castTarget?: [number, number];
        cycleOffset?: number;
      })[] = [
        {
          id: "fisherman_kochunni",
          name: "Kochunni",
          age: 34,
          gender: "male",
          job: "fisherman",
          socialClass: "poor",
          height: 1.69,
          waypoints: [[-29.2, -15.5]],
          activityMode: "vallam_paddling",
          cycleOffset: 0.0,
        },
        {
          id: "fisherman_pappu",
          name: "Pappu",
          age: 46,
          gender: "male",
          job: "fisherman",
          socialClass: "poor",
          height: 1.66,
          waypoints: [[-21.2, -23.5]],
          activityMode: "rod_fishing",
          castTarget: [-25.2, -24.4],
          cycleOffset: 1.2,
        },
        {
          id: "fisherman_thankappan",
          name: "Thankappan",
          age: 28,
          gender: "male",
          job: "fisherman",
          socialClass: "poor",
          height: 1.73,
          waypoints: [
            [-19, -23],
            [-12, -21],
            [-5, -31],
            [14, -28],
            [17, -37],
            [10, -35],
            [-5, -31],
          ],
        },
      ];

      // Distinct per-fisherman appearances so the Vallam paddler, riverbank angler & market carrier never look identical
      const makeKalliCheckTexture = (
        mainHex: string,
        secHex: string,
        accHex: string,
      ): THREE.CanvasTexture => {
        const c = document.createElement("canvas");
        c.width = 256;
        c.height = 256;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = secHex;
        ctx.fillRect(0, 0, 256, 256);
        const step = 256 / 6;
        for (let r = 0; r < 6; r++) {
          for (let col = 0; col < 6; col++) {
            if (r % 2 === 0 && col % 2 === 0) {
              ctx.fillStyle = mainHex;
              ctx.fillRect(col * step, r * step, step, step);
            } else if ((r + col) % 2 === 1) {
              ctx.fillStyle = mainHex;
              ctx.globalAlpha = 0.55;
              ctx.fillRect(col * step, r * step, step, step);
              ctx.globalAlpha = 1.0;
            }
          }
        }
        ctx.fillStyle = accHex;
        for (let i = 0; i < 6; i++) {
          ctx.fillRect(i * step + step * 0.12, 0, 3, 256);
          ctx.fillRect(0, i * step + step * 0.12, 256, 3);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        return tex;
      };

      const vallamIndigoTex = makeKalliCheckTexture("#1c3a5c", "#d8d0be", "#0e2038");
      const marketGreenTex = makeKalliCheckTexture("#1f4d30", "#dcd6c2", "#102b1a");

      const fishermanVariants = [
        {
          // 0: Kochunni (Vallam Paddler) — deep coastal indigo Kalli Mundu, weathered dark palm hat,
          //    deeper sun-tanned skin, folded cream Thorthu shoulder cloth & crimson waist tie
          munduTex: vallamIndigoTex,
          skinTint: 0xd6bfa8,
          hatTint: 0xb8966a,
          hairTint: 0x1a1410,
          shoulderThorthu: true,
          waistTieColor: 0x8f1d1d,
          bankBasket: false,
        },
        {
          // 1: Pappu (Riverbank Angler) — classic maroon-red Kalli Mundu, brighter golden-straw hat,
          //    silver-streaked elder hair & woven bamboo Meen Kotta fish basket on the bank
          munduTex: null as THREE.CanvasTexture | null,
          skinTint: 0xf0e0d2,
          hatTint: 0xfff0d6,
          hairTint: 0x6b6862,
          shoulderThorthu: false,
          waistTieColor: 0,
          bankBasket: true,
        },
        {
          // 2: Thankappan (Market Fish Carrier) — bottle-green Kalli Mundu, warm bronze skin, ochre-tinted hat
          munduTex: marketGreenTex,
          skinTint: 0xffe8d6,
          hatTint: 0xe3cfab,
          hairTint: 0x18130f,
          shoulderThorthu: false,
          waistTieColor: 0xb06b22,
          bankBasket: false,
        },
      ];

      fishermanProfiles.forEach((profile, fIdx) => {
        const physics = derivePhysicsFromProfile(profile);
        const cloned = cloneSkeleton(fishermanTemplate) as THREE.Group;
        normalizeRigBones(cloned);
        fitMixamoCharacter(cloned, profile.height);
        const invModelScale = 1 / Math.max(cloned.scale.x, 0.0001);

        const variant = fishermanVariants[fIdx % fishermanVariants.length];
        cloned.traverse((obj) => {
          if (obj instanceof THREE.SkinnedMesh || obj instanceof THREE.Mesh) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            const nextMats = mats.map((m) => {
              if (!(m instanceof THREE.MeshStandardMaterial)) return m;
              const nm = (m.name || "").toLowerCase();
              const mc = m.clone();
              if (/mundu|lower|cloth/i.test(nm) && variant.munduTex) {
                mc.map = variant.munduTex;
                mc.color.setHex(0xffffff);
                mc.needsUpdate = true;
              } else if (/thoppikuda|palm|cane/i.test(nm)) {
                mc.color.multiply(new THREE.Color(variant.hatTint));
              } else if (/skin/i.test(nm)) {
                mc.color.multiply(new THREE.Color(variant.skinTint));
              } else if (/hair/i.test(nm)) {
                mc.color.setHex(variant.hairTint);
              }
              return mc;
            });
            obj.material = Array.isArray(obj.material) ? nextMats : nextMats[0];
          }
        });

        // Distinct wearable accessories for the Vallam paddler & other fishermen
        const fishermanCloths: ClothInstance[] = [];
        if (variant.shoulderThorthu) {
          const chestBone = findBone(cloned, ["mixamorigSpine2", "mixamorigLeftShoulder"]);
          if (chestBone) {
            void attachClothToBone(baseUrl, "cloth_thorthu_shoulder", chestBone, {
              position: [0.12 * invModelScale, 0.16 * invModelScale, 0.01 * invModelScale],
              rotation: [0.06, 0, -0.1],
              scale: invModelScale * 1.05,
              physics: { windAmp: 0.085, flutterFreq: 4.8, gravitySag: 0.01, dragStrength: 1.2 },
            })
              .then((ci) => fishermanCloths.push(ci))
              .catch(() => {});
          }
        }
        if (variant.waistTieColor) {
          const waistBone = findBone(cloned, ["mixamorigHips", "mixamorigSpine"]);
          if (waistBone) {
            const tie = new THREE.Mesh(
              new THREE.TorusGeometry(0.165, 0.018, 8, 20),
              new THREE.MeshStandardMaterial({ color: variant.waistTieColor, roughness: 0.88 }),
            );
            tie.scale.setScalar(invModelScale);
            tie.rotation.x = Math.PI * 0.5;
            tie.position.set(0, 0.05 * invModelScale, 0);
            waistBone.add(tie);
          }
        }

        const root = new THREE.Group();
        root.name = `mixamo_${profile.id}`;
        root.add(cloned);

        let [sx, sz] = profile.waypoints[0];
        // Guarantee riverbank anglers and walking fishermen NEVER spawn inside river water
        if (profile.activityMode === "rod_fishing" && profile.castTarget) {
          const awayX = sx - profile.castTarget[0];
          const awayZ = sz - profile.castTarget[1];
          const awayLen = Math.max(0.01, Math.hypot(awayX, awayZ));
          const nx = awayX / awayLen;
          const nz = awayZ / awayLen;
          for (let step = 0; step < 16 && getWaterInfo?.(sx, sz); step++) {
            sx += nx * 0.6;
            sz += nz * 0.6;
          }
          // Add 0.85m dry bank clearance so feet stay strictly on dry earth
          sx += nx * 0.85;
          sz += nz * 0.85;
        } else if (profile.activityMode === "vallam_paddling" && !vallamTemplate) {
          return;
        }
        const isDedicatedActivity = Boolean(profile.activityMode);
        const initialYaw = profile.castTarget
          ? Math.atan2(profile.castTarget[0] - sx, profile.castTarget[1] - sz)
          : fIdx * 1.4;
        root.position.set(
          sx,
          profile.activityMode === "vallam_paddling" ? waterYAt(sx, sz) - 0.16 : groundYAt(sx, sz),
          sz,
        );
        root.rotation.y = initialYaw;
        scene.add(root);

        const mixer = new THREE.AnimationMixer(cloned);
        const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
        for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
          const act = mixer.clipAction(clip);
          act.setLoop(THREE.LoopRepeat, Infinity);
          actions[k] = act;
        }

        const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
        const rightPalmBone = findBone(cloned, [
          "mixamorigRightHandMiddle1",
          "mixamorigRightHandIndex1",
          "mixamorigRightHand",
        ]);
        const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
        const headBone = findBone(cloned, ["mixamorigHead"]);
        const hipsBone = findBone(cloned, ["mixamorigHips"]);
        const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
        const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
        const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
        const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

        const nightLampGroup = new THREE.Group();
        let nightLampFlameMat: THREE.MeshStandardMaterial | undefined;
        if (accessories.lamp) {
          nightLampGroup.add(accessories.lamp.clone(true));
        } else {
          const fb = createFallbackNightLamp();
          nightLampGroup.add(fb.group);
          nightLampFlameMat = fb.flameMat;
        }
        nightLampGroup.scale.setScalar(invModelScale);
        nightLampGroup.position.set(0, 0.04 * invModelScale, 0.02 * invModelScale);
        nightLampGroup.visible = false;
        (rightHandBone ?? root).add(nightLampGroup);

        const beediGroup = new THREE.Group();
        let beediEmberMat: THREE.MeshStandardMaterial | undefined;
        const beediTipAnchor = new THREE.Object3D();
        if (accessories.beedi) {
          beediGroup.add(accessories.beedi.clone(true));
          beediTipAnchor.position.set(0, 0, 0.074);
          beediGroup.add(beediTipAnchor);
        } else {
          const fb = createFallbackBeedi();
          beediGroup.add(fb.group);
          beediEmberMat = fb.emberMat;
          beediTipAnchor.position.copy(fb.tipAnchor.position);
          beediGroup.add(beediTipAnchor);
        }
        beediGroup.scale.setScalar(invModelScale);
        beediGroup.position.set(0.015 * invModelScale, 0.065 * invModelScale, 0.025 * invModelScale);
        beediGroup.rotation.set(0.25, 0.4, 0.1);
        beediGroup.visible = false;
        (rightHandBone ?? root).add(beediGroup);

        const matchboxGroup = new THREE.Group();
        if (accessories.matchbox) {
          matchboxGroup.add(accessories.matchbox.clone(true));
        } else {
          matchboxGroup.add(createFallbackMatchbox());
        }
        matchboxGroup.scale.setScalar(invModelScale);
        matchboxGroup.position.set(-0.01 * invModelScale, 0.055 * invModelScale, 0.02 * invModelScale);
        matchboxGroup.visible = false;
        (leftHandBone ?? root).add(matchboxGroup);

        let fishermanAction: FishermanActionRig | undefined;
        if (profile.activityMode === "vallam_paddling" && vallamTemplate) {
          const vallamGroup = vallamTemplate.clone(true);
          vallamGroup.name = `kerala_vallam_${profile.id}`;
          vallamGroup.traverse((c) => {
            if (c instanceof THREE.Mesh) {
              c.castShadow = true;
              c.receiveShadow = true;
            }
          });
          scene.add(vallamGroup);
          fishermanAction = createFishermanPaddleRig({
            scene,
            modelRoot: cloned,
            vallamGroup,
            route: vallamRiverRoute,
            speed: 1.05,
            phaseOffset: profile.cycleOffset ?? 0,
          });
        } else if (profile.activityMode === "rod_fishing" && profile.castTarget) {
          fishermanAction = createFishermanRodRig({
            scene,
            modelRoot: cloned,
            castTargetX: profile.castTarget[0],
            castTargetZ: profile.castTarget[1],
            waterSurfaceY: waterYAt(profile.castTarget[0], profile.castTarget[1]),
            cycleOffset: profile.cycleOffset ?? 0,
          });
        }

        const actor: MixamoNpcActor = {
          profile,
          physics,
          brain: FISHERMAN_BRAIN,
          root,
          model: cloned,
          mixer,
          actions,
          waypointIdx: profile.waypoints.length > 1 ? 1 : 0,
          subPath: [],
          subPathIdx: 0,
          lastProgressX: sx,
          lastProgressZ: sz,
          stuckTimer: 0,
          spawnCleared: isDedicatedActivity,
          x: sx,
          z: sz,
          vx: 0,
          vz: 0,
          yaw: initialYaw,
          currentSpeed: isDedicatedActivity ? 0 : physics.walkSpeed,
          yieldTarget: null,
          state: isDedicatedActivity ? "fishing_cast" : "walk",
          stateTimer: isDedicatedActivity ? 999 : 12.0 + fIdx * 3.0,
          hipsBone,
          leftFootBone,
          rightFootBone,
          leftToeBone,
          rightToeBone,
          footGroundInitialized: false,
          rightHandBone,
          rightPalmBone,
          leftHandBone,
          headBone,
          nightLampGroup,
          nightLampFlameMat,
          beediGroup,
          beediTipAnchor,
          beediEmberMat,
          matchboxGroup,
          smokeTipAccum: 0,
          smokeExhaleTimer: 3.5 + fIdx * 1.1,
          activeStoneIdx: null,
          stonePhaseTimer: 0,
          stonePhaseDuration: 0,
          stoneEdgeX: sx,
          stoneEdgeZ: sz,
          stoneSitX: sx,
          stoneSitZ: sz,
          stoneLandX: sx,
          stoneLandZ: sz,
          stoneStartY: groundYAt(sx, sz),
          stoneCooldown: 9999,
          fishermanAction,
          clothInstances: fishermanCloths,
        };

        const startAnim: MixamoAnimKey =
          profile.activityMode === "vallam_paddling"
            ? (actions.paddling ? "paddling" : "sitIdle")
            : profile.activityMode === "rod_fishing"
              ? (actions.fishingIdle ? "fishingIdle" : "breathIdle")
              : "walk";
        playAction(actor, startAnim, 0.01);
        actors.push(actor);
      });
      console.info(
        `Loaded Mixamo Set #6 (fisherman) with paddled Vallam (${Boolean(vallamTemplate)}) & bamboo-rod fishing; spawned ${fishermanProfiles.length} Kerala fishermen.`,
      );
    });

    // ==========================================================================
    // Set #7: Senior Kalari Gurukkal / Asan (Master of the Kuzhi Kalari Pit)
    // Auto-loads public/models/npcs/mixamo/kalari_guru_mixamo.fbx (or kalari_guru.fbx)
    // ==========================================================================
    const loadKalariGuruModel = () =>
      loadFbx(`${baseUrl}models/npcs/mixamo/kalari_guru_mixamo.fbx`).catch(() =>
        loadFbx(`${baseUrl}models/npcs/mixamo/kalari_guru.fbx`),
      );
    loadKalariGuruModel()
      .then((guruTemplate) => {
        normalizeRigBones(guruTemplate);
        tuneMixamoMaterials(guruTemplate);

        const profile: NpcCharacterProfile = {
          id: "kalari_gurukkal_govindan",
          name: "Gurukkal Govindan Nair",
          age: 58,
          gender: "male",
          job: "kalari_guru",
          socialClass: "upper",
          height: 1.71,
          // Commands the Kuzhi Kalari from the north-center edge overlooking all 6 sparring students
          waypoints: [
            [kalariSite[0] - 0.2, kalariSite[1] - 2.2],
            [kalariSite[0] - 2.2, kalariSite[1] - 1.8],
            [kalariSite[0] + 1.8, kalariSite[1] - 1.8],
          ],
        };

        const physics = derivePhysicsFromProfile(profile);
        const cloned = cloneSkeleton(guruTemplate) as THREE.Group;
        normalizeRigBones(cloned);
        fitMixamoCharacter(cloned, profile.height);
        const invModelScale = 1 / Math.max(cloned.scale.x, 0.0001);

        const root = new THREE.Group();
        root.name = `mixamo_${profile.id}`;
        root.add(cloned);

        const [sx, sz] = profile.waypoints[0];
        root.position.set(sx, groundYAt(sx, sz), sz);
        root.rotation.y = 0.0; // Facing south (+Z) into the Kalari pit toward the sparring pairs
        scene.add(root);

        const mixer = new THREE.AnimationMixer(cloned);
        const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
        for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
          const act = mixer.clipAction(clip);
          act.setLoop(THREE.LoopRepeat, Infinity);
          actions[k] = act;
        }

        const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
        const rightPalmBone = findBone(cloned, [
          "mixamorigRightHandMiddle1",
          "mixamorigRightHandIndex1",
          "mixamorigRightHand",
        ]);
        const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
        const headBone = findBone(cloned, ["mixamorigHead"]);
        const hipsBone = findBone(cloned, ["mixamorigHips"]);
        const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
        const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
        const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
        const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

        const nightLampGroup = new THREE.Group();
        if (accessories.lamp) {
          nightLampGroup.add(accessories.lamp.clone(true));
        } else {
          nightLampGroup.add(createFallbackNightLamp().group);
        }
        nightLampGroup.scale.setScalar(invModelScale);
        nightLampGroup.visible = false;
        (rightHandBone ?? root).add(nightLampGroup);

        const beediGroup = new THREE.Group();
        const beediTipAnchor = new THREE.Object3D();
        beediGroup.visible = false;
        (rightHandBone ?? root).add(beediGroup);

        const matchboxGroup = new THREE.Group();
        matchboxGroup.visible = false;
        (leftHandBone ?? root).add(matchboxGroup);

        const actor: MixamoNpcActor = {
          profile,
          physics,
          brain: KALARI_GURU_BRAIN,
          root,
          model: cloned,
          mixer,
          actions,
          waypointIdx: 1,
          subPath: [],
          subPathIdx: 0,
          lastProgressX: sx,
          lastProgressZ: sz,
          stuckTimer: 0,
          spawnCleared: true,
          x: sx,
          z: sz,
          vx: 0,
          vz: 0,
          yaw: 0,
          currentSpeed: 0,
          yieldTarget: null,
          state: "talk",
          stateTimer: 7.5,
          hipsBone,
          leftFootBone,
          rightFootBone,
          leftToeBone,
          rightToeBone,
          footGroundInitialized: false,
          rightHandBone,
          rightPalmBone,
          leftHandBone,
          headBone,
          nightLampGroup,
          beediGroup,
          beediTipAnchor,
          matchboxGroup,
          smokeTipAccum: 0,
          smokeExhaleTimer: 99,
          activeStoneIdx: null,
          stonePhaseTimer: 0,
          stonePhaseDuration: 0,
          stoneEdgeX: sx,
          stoneEdgeZ: sz,
          stoneSitX: sx,
          stoneSitZ: sz,
          stoneLandX: sx,
          stoneLandZ: sz,
          stoneStartY: groundYAt(sx, sz),
          stoneCooldown: 9999,
        };

        playAction(actor, "talk", 0.01);
        actors.push(actor);
        console.info("Loaded Mixamo Set #7 (kalari_guru) — spawned Gurukkal Govindan Nair inside the Kuzhi Kalari.");
      })
      .catch(() => {
        // kalari_guru_mixamo.fbx not exported yet — Set #7 activates automatically once added to public/models/npcs/mixamo/
      });

    // ==========================================================================
    // Set #8: 18th-Century Kerala Nair Estate Guards & Landlord Escort (Akampadi)
    // Auto-loads public/models/npcs/mixamo/guard_mixamo.fbx (or guard.fbx)
    // ==========================================================================
    const loadGuardModel = () =>
      loadFbx(`${baseUrl}models/npcs/mixamo/guard_mixamo.fbx`).catch(() =>
        loadFbx(`${baseUrl}models/npcs/mixamo/guard.fbx`),
      );
    Promise.allSettled([
      loadGuardModel(),
      loadRootModelGlbOptional("weapons/kalari_spear_vel.glb"),
    ]).then(([guardRes, spearRes]) => {
      if (guardRes.status !== "fulfilled") return;
      const guardTemplate = guardRes.value;
      const spearTemplate = spearRes.status === "fulfilled" ? spearRes.value : undefined;
      normalizeRigBones(guardTemplate);
      tuneMixamoMaterials(guardTemplate);

      const guardProfiles: (NpcCharacterProfile & { escortsLandlord?: boolean; escortSide?: -1 | 1 })[] = [
        {
          id: "guard_madhavan",
          name: "Madhavan Nair",
          age: 36,
          gender: "male",
          job: "guard",
          socialClass: "middle",
          height: 1.75,
          escortsLandlord: true,
          escortSide: 1,
          waypoints: [
            [66, -54],
            [53, -39],
            [35, -34],
            [23, -26],
          ],
        },
        {
          id: "guard_kesavan",
          name: "Kesavan Nair",
          age: 36,
          gender: "male",
          job: "guard",
          socialClass: "middle",
          height: 1.75,
          escortsLandlord: true,
          escortSide: -1,
          waypoints: [
            [64, -55],
            [52, -40],
            [34, -35],
            [22, -27],
          ],
        },
        {
          id: "guard_shankaran",
          name: "Shankaran Nair",
          age: 38,
          gender: "male",
          job: "guard",
          socialClass: "middle",
          height: 1.75,
          waypoints: [
            [58, -44],
            [53, -39],
            [48, -40],
            [55, -42],
          ],
        },
        {
          id: "guard_krishnan",
          name: "Krishnan Nair",
          age: 38,
          gender: "male",
          job: "guard",
          socialClass: "middle",
          height: 1.75,
          waypoints: [
            [60, -47],
            [64, -53],
            [60, -54],
            [57, -49],
          ],
        },
      ];

      guardProfiles.forEach((profile) => {
        const physics = derivePhysicsFromProfile(profile);
        const cloned = cloneSkeleton(guardTemplate) as THREE.Group;
        normalizeRigBones(cloned);
        fitMixamoCharacter(cloned, profile.height);
        const invModelScale = 1 / Math.max(cloned.scale.x, 0.0001);

        const root = new THREE.Group();
        root.name = `mixamo_${profile.id}`;
        root.add(cloned);

        const [sx, sz] = profile.waypoints[0];
        root.position.set(sx, groundYAt(sx, sz), sz);
        scene.add(root);

        const mixer = new THREE.AnimationMixer(cloned);
        const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
        for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
          const act = mixer.clipAction(clip);
          act.setLoop(THREE.LoopRepeat, Infinity);
          actions[k] = act;
        }

        const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
        const rightPalmBone = findBone(cloned, [
          "mixamorigRightHandMiddle1",
          "mixamorigRightHandIndex1",
          "mixamorigRightHand",
        ]);
        const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
        const headBone = findBone(cloned, ["mixamorigHead"]);
        const hipsBone = findBone(cloned, ["mixamorigHips"]);
        const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
        const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
        const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
        const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

        // Attach ceremonial brass-tipped Kerala Vel spear upright in the Nair guard's right hand
        if (spearTemplate && rightHandBone) {
          const spear = spearTemplate.clone(true);
          const box = new THREE.Box3().setFromObject(spear);
          const szVec = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(szVec.x, szVec.y, szVec.z, 0.001);
          const targetLen = 2.05;
          spear.scale.setScalar((targetLen / maxDim) * invModelScale);
          spear.position.set(0.02 * invModelScale, 0.04 * invModelScale, 0.02 * invModelScale);
          spear.rotation.set(Math.PI * 0.45, 0, 0);
          spear.traverse((c) => {
            if (c instanceof THREE.Mesh) c.castShadow = true;
          });
          rightHandBone.add(spear);
        }

        // Attach flowing crimson Kacha sash tail to the Nair guard's hips for live GPU cloth physics
        const guardCloths: ClothInstance[] = [];
        if (hipsBone) {
          void attachClothToBone(baseUrl, "cloth_kacha_sash_tail", hipsBone, {
            position: [0.14 * invModelScale, 0.02 * invModelScale, -0.02 * invModelScale],
            rotation: [0, Math.PI * 0.35, 0],
            scale: invModelScale * 1.05,
            physics: { windAmp: 0.11, flutterFreq: 5.2, gravitySag: 0.012, dragStrength: 1.45 },
          })
            .then((ci) => guardCloths.push(ci))
            .catch(() => {});
        }

        const nightLampGroup = new THREE.Group();
        if (accessories.lamp) {
          nightLampGroup.add(accessories.lamp.clone(true));
        } else {
          nightLampGroup.add(createFallbackNightLamp().group);
        }
        nightLampGroup.scale.setScalar(invModelScale);
        nightLampGroup.visible = false;
        (leftHandBone ?? root).add(nightLampGroup);

        const beediGroup = new THREE.Group();
        const beediTipAnchor = new THREE.Object3D();
        beediGroup.visible = false;
        (rightHandBone ?? root).add(beediGroup);

        const matchboxGroup = new THREE.Group();
        matchboxGroup.visible = false;
        (leftHandBone ?? root).add(matchboxGroup);

        const actor: MixamoNpcActor = {
          profile,
          physics,
          brain: GUARD_BRAIN,
          root,
          model: cloned,
          mixer,
          actions,
          waypointIdx: 1,
          subPath: [],
          subPathIdx: 0,
          lastProgressX: sx,
          lastProgressZ: sz,
          stuckTimer: 0,
          spawnCleared: false,
          x: sx,
          z: sz,
          vx: 0,
          vz: 0,
          yaw: 0,
          currentSpeed: physics.walkSpeed,
          yieldTarget: null,
          state: "walk",
          stateTimer: 14.0,
          hipsBone,
          leftFootBone,
          rightFootBone,
          leftToeBone,
          rightToeBone,
          footGroundInitialized: false,
          rightHandBone,
          rightPalmBone,
          leftHandBone,
          headBone,
          nightLampGroup,
          beediGroup,
          beediTipAnchor,
          matchboxGroup,
          smokeTipAccum: 0,
          smokeExhaleTimer: 99,
          activeStoneIdx: null,
          stonePhaseTimer: 0,
          stonePhaseDuration: 0,
          stoneEdgeX: sx,
          stoneEdgeZ: sz,
          stoneSitX: sx,
          stoneSitZ: sz,
          stoneLandX: sx,
          stoneLandZ: sz,
          stoneStartY: groundYAt(sx, sz),
          stoneCooldown: 9999,
          escortsLandlord: profile.escortsLandlord,
          escortSide: profile.escortSide,
          clothInstances: guardCloths,
        };

        playAction(actor, "landlordWalk", 0.01);
        actors.push(actor);
      });
      console.info(`Loaded Mixamo Set #8 (guard) and spawned ${guardProfiles.length} Kerala Nair Estate Guards.`);
    });

    // ==========================================================================
    // Set #9: 18th-Century Landlord's Manager / Steward (Karyasthan)
    // Carries dried palm-leaf Olakkuda umbrella & solid-brass Vettila Chellam
    // Auto-loads public/models/npcs/mixamo/karyasthan_mixamo.fbx (or karyasthan.fbx)
    // ==========================================================================
    const loadKaryasthanModel = () =>
      loadFbx(`${baseUrl}models/npcs/mixamo/karyasthan_mixamo.fbx`).catch(() =>
        loadFbx(`${baseUrl}models/npcs/mixamo/karyasthan.fbx`),
      );
    loadKaryasthanModel()
      .then((karyasthanTemplate) => {
        normalizeRigBones(karyasthanTemplate);
        tuneMixamoMaterials(karyasthanTemplate);

        const profile: NpcCharacterProfile = {
          id: "karyasthan_sankaran",
          name: "Karyasthan Sankaran Menon",
          age: 50,
          gender: "male",
          job: "karyasthan",
          socialClass: "middle",
          height: 1.68,
          waypoints: [
            [68, -56],
            [53, -39],
            [35, -34],
            [23, -26],
          ],
        };

        const physics = derivePhysicsFromProfile(profile);
        const cloned = cloneSkeleton(karyasthanTemplate) as THREE.Group;
        normalizeRigBones(cloned);
        fitMixamoCharacter(cloned, profile.height);

        const root = new THREE.Group();
        root.name = `mixamo_${profile.id}`;
        root.add(cloned);

        const [sx, sz] = profile.waypoints[0];
        root.position.set(sx, groundYAt(sx, sz), sz);
        scene.add(root);

        const mixer = new THREE.AnimationMixer(cloned);
        const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
        for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
          const act = mixer.clipAction(clip);
          act.setLoop(THREE.LoopRepeat, Infinity);
          actions[k] = act;
        }

        const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
        const rightPalmBone = findBone(cloned, [
          "mixamorigRightHandMiddle1",
          "mixamorigRightHandIndex1",
          "mixamorigRightHand",
        ]);
        const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
        const headBone = findBone(cloned, ["mixamorigHead"]);
        const hipsBone = findBone(cloned, ["mixamorigHips"]);
        const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
        const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
        const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
        const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

        // Karyasthan walks cleanly beside the Landlord without procedural props

        const nightLampGroup = new THREE.Group();
        nightLampGroup.visible = false;
        (rightHandBone ?? root).add(nightLampGroup);
        const beediGroup = new THREE.Group();
        const beediTipAnchor = new THREE.Object3D();
        beediGroup.visible = false;
        (rightHandBone ?? root).add(beediGroup);
        const matchboxGroup = new THREE.Group();
        matchboxGroup.visible = false;
        (leftHandBone ?? root).add(matchboxGroup);

        const actor: MixamoNpcActor = {
          profile,
          physics,
          brain: KARYASTHAN_BRAIN,
          root,
          model: cloned,
          mixer,
          actions,
          waypointIdx: 1,
          subPath: [],
          subPathIdx: 0,
          lastProgressX: sx,
          lastProgressZ: sz,
          stuckTimer: 0,
          spawnCleared: false,
          x: sx,
          z: sz,
          vx: 0,
          vz: 0,
          yaw: 0,
          currentSpeed: physics.walkSpeed,
          yieldTarget: null,
          state: "walk",
          stateTimer: 14.0,
          hipsBone,
          leftFootBone,
          rightFootBone,
          leftToeBone,
          rightToeBone,
          footGroundInitialized: false,
          rightHandBone,
          rightPalmBone,
          leftHandBone,
          headBone,
          nightLampGroup,
          beediGroup,
          beediTipAnchor,
          matchboxGroup,
          smokeTipAccum: 0,
          smokeExhaleTimer: 99,
          activeStoneIdx: null,
          stonePhaseTimer: 0,
          stonePhaseDuration: 0,
          stoneEdgeX: sx,
          stoneEdgeZ: sz,
          stoneSitX: sx,
          stoneSitZ: sz,
          stoneLandX: sx,
          stoneLandZ: sz,
          stoneStartY: groundYAt(sx, sz),
          stoneCooldown: 9999,
          escortsLandlord: true,
          escortSide: 0,
        };

        playAction(actor, "walk", 0.01);
        actors.push(actor);
        console.info("Loaded Mixamo Set #9 (karyasthan) — spawned Karyasthan Sankaran Menon with Olakkuda & Vettila Chellam.");
      })
      .catch(() => {
        // karyasthan_mixamo.fbx not exported yet — Set #9 activates automatically once added to public/models/npcs/mixamo/
      });

    // ==========================================================================
    // Set #10: 18th-Century Kerala Temple Priest (Santhikaran / Namboothiri)
    // Auto-loads public/models/npcs/mixamo/temple_priest_mixamo.fbx (or temple_priest.fbx)
    // ==========================================================================
    const loadTemplePriestModel = () =>
      loadFbx(`${baseUrl}models/npcs/mixamo/temple_priest_mixamo.fbx`).catch(() =>
        loadFbx(`${baseUrl}models/npcs/mixamo/temple_priest.fbx`),
      );
    loadTemplePriestModel()
      .then((priestTemplate) => {
        normalizeRigBones(priestTemplate);
        tuneMixamoMaterials(priestTemplate);

        const profile: NpcCharacterProfile = {
          id: "temple_priest_krishnan",
          name: "Santhikaran Krishnan Namboothiri",
          age: 54,
          gender: "male",
          job: "temple_priest",
          socialClass: "upper",
          height: 1.69,
          // Village temple courtyard (templeSite = [45, 17]): sanctum front & Pradakshinam walkway
          waypoints: [
            [45.0, 20.6],
            [42.2, 22.8],
            [45.0, 25.2],
            [47.8, 22.8],
          ],
        };

        const physics = derivePhysicsFromProfile(profile);
        const cloned = cloneSkeleton(priestTemplate) as THREE.Group;
        normalizeRigBones(cloned);
        fitMixamoCharacter(cloned, profile.height);
        const invModelScale = 1 / Math.max(cloned.scale.x, 0.0001);

        const root = new THREE.Group();
        root.name = `mixamo_${profile.id}`;
        root.add(cloned);

        const [sx, sz] = profile.waypoints[0];
        root.position.set(sx, groundYAt(sx, sz), sz);
        root.rotation.y = Math.PI; // Facing north toward the sanctum
        scene.add(root);

        const mixer = new THREE.AnimationMixer(cloned);
        const actions: Partial<Record<MixamoAnimKey, THREE.AnimationAction>> = {};
        for (const [k, clip] of Object.entries(clips) as [MixamoAnimKey, THREE.AnimationClip][]) {
          const act = mixer.clipAction(clip);
          act.setLoop(THREE.LoopRepeat, Infinity);
          actions[k] = act;
        }

        const rightHandBone = findBone(cloned, ["mixamorigRightHand", "mixamorigRightHandIndex1"]);
        const rightPalmBone = findBone(cloned, [
          "mixamorigRightHandMiddle1",
          "mixamorigRightHandIndex1",
          "mixamorigRightHand",
        ]);
        const leftHandBone = findBone(cloned, ["mixamorigLeftHand", "mixamorigLeftHandIndex1"]);
        const chestBone = findBone(cloned, ["mixamorigSpine2", "mixamorigLeftShoulder"]);
        const headBone = findBone(cloned, ["mixamorigHead"]);
        const hipsBone = findBone(cloned, ["mixamorigHips"]);
        const leftFootBone = findBone(cloned, ["mixamorigLeftFoot"]);
        const rightFootBone = findBone(cloned, ["mixamorigRightFoot"]);
        const leftToeBone = findBone(cloned, ["mixamorigLeftToeBase", "mixamorigLeftToe_End"]);
        const rightToeBone = findBone(cloned, ["mixamorigRightToeBase", "mixamorigRightToe_End"]);

        // temple_priest_mixamo.fbx already wears his rigged Kasavu Mundu;
        // attach flowing Kasavu Melmundu shoulder shawl with live GPU cloth physics
        const priestCloths: ClothInstance[] = [];
        if (chestBone) {
          void attachClothToBone(baseUrl, "cloth_melmundu_kasavu", chestBone, {
            position: [0.12 * invModelScale, 0.14 * invModelScale, 0.01 * invModelScale],
            rotation: [0.05, 0, -0.08],
            scale: invModelScale * 1.0,
            physics: { windAmp: 0.095, flutterFreq: 4.4, gravitySag: 0.012, dragStrength: 1.25 },
          })
            .then((ci) => priestCloths.push(ci))
            .catch(() => {});
        }

        const nightLampGroup = new THREE.Group();
        let nightLampFlameMat: THREE.MeshStandardMaterial | undefined;
        if (accessories.lamp) {
          nightLampGroup.add(accessories.lamp.clone(true));
        } else {
          const fb = createFallbackNightLamp();
          nightLampGroup.add(fb.group);
          nightLampFlameMat = fb.flameMat;
        }
        nightLampGroup.scale.setScalar(invModelScale);
        nightLampGroup.position.set(0, 0.04 * invModelScale, 0.02 * invModelScale);
        nightLampGroup.visible = false;
        (rightHandBone ?? root).add(nightLampGroup);

        const beediGroup = new THREE.Group();
        const beediTipAnchor = new THREE.Object3D();
        beediGroup.visible = false;
        (rightHandBone ?? root).add(beediGroup);
        const matchboxGroup = new THREE.Group();
        matchboxGroup.visible = false;
        (leftHandBone ?? root).add(matchboxGroup);

        const actor: MixamoNpcActor = {
          profile,
          physics,
          brain: TEMPLE_PRIEST_BRAIN,
          root,
          model: cloned,
          mixer,
          actions,
          waypointIdx: 1,
          subPath: [],
          subPathIdx: 0,
          lastProgressX: sx,
          lastProgressZ: sz,
          stuckTimer: 0,
          spawnCleared: false,
          x: sx,
          z: sz,
          vx: 0,
          vz: 0,
          yaw: Math.PI,
          currentSpeed: 0,
          yieldTarget: null,
          state: "pray",
          stateTimer: 8.5,
          hipsBone,
          leftFootBone,
          rightFootBone,
          leftToeBone,
          rightToeBone,
          footGroundInitialized: false,
          rightHandBone,
          rightPalmBone,
          leftHandBone,
          headBone,
          nightLampGroup,
          nightLampFlameMat,
          beediGroup,
          beediTipAnchor,
          matchboxGroup,
          smokeTipAccum: 0,
          smokeExhaleTimer: 99,
          activeStoneIdx: null,
          stonePhaseTimer: 0,
          stonePhaseDuration: 0,
          stoneEdgeX: sx,
          stoneEdgeZ: sz,
          stoneSitX: sx,
          stoneSitZ: sz,
          stoneLandX: sx,
          stoneLandZ: sz,
          stoneStartY: groundYAt(sx, sz),
          stoneCooldown: 9999,
          clothInstances: priestCloths,
        };

        playAction(actor, "pray", 0.01);
        actors.push(actor);
        console.info("Loaded Mixamo Set #10 (temple_priest) — spawned Santhikaran Krishnan Namboothiri at the village temple.");
      })
      .catch(() => {
        // temple_priest_mixamo.fbx not exported yet — Set #10 activates automatically once added to public/models/npcs/mixamo/
      });
  });

  const pickIdleClip = (idx: number, elapsed: number): MixamoAnimKey => {
    const slot = (idx + Math.floor(elapsed * 0.1)) % 3;
    return slot === 0 ? "breathIdle" : slot === 1 ? "idle" : "idle2";
  };

  let prevPlayerX: number | null = null;
  let prevPlayerZ: number | null = null;

  const triggerPersonBump = (
    target: MixamoNpcActor,
    otherX: number,
    otherZ: number,
    hardBump: boolean,
  ) => {
    const bx = target.x - otherX;
    const bz = target.z - otherZ;
    const d = Math.max(0.01, Math.hypot(bx, bz));
    target.state = "bump_react";
    target.bumpTimer = 1.25;
    target.bumpCooldown = 5.2;
    target.bumpAwayX = bx / d;
    target.bumpAwayZ = bz / d;
    target.bumpFaceX = otherX;
    target.bumpFaceZ = otherZ;
    const isRoyalParty =
      target.brain.archetype === "landlord" ||
      target.brain.archetype === "guard" ||
      target.brain.archetype === "karyasthan";
    target.bumpFollowUpAnim =
      hardBump || isRoyalParty
        ? "argue"
        : target.profile.socialClass === "upper"
          ? "greet"
          : "talk";
    target.currentSpeed = 0;
    target.subPath = [];
  };

  const update = (
    delta: number,
    elapsed: number,
    playerX: number,
    playerZ: number,
    hour = 9.0,
    daylight = 1.0,
    rainIntensity = 0.0,
  ) => {
    const dt = Math.min(delta, 0.05);
    smokeEmitter.update(dt, elapsed);
    if (actors.length === 0) return;

    const playerSpeed =
      prevPlayerX !== null && prevPlayerZ !== null && dt > 0.001
        ? Math.hypot(playerX - prevPlayerX, playerZ - prevPlayerZ) / dt
        : 0;
    prevPlayerX = playerX;
    prevPlayerZ = playerZ;

    const isNight = daylight < 0.45 || hour >= 18.2 || hour < 5.8;
    const isPrayerHour = (hour >= 5.5 && hour <= 7.2) || (hour >= 17.5 && hour <= 19.0);
    const isHeavyRain = rainIntensity > 0.38;
    const baseSolids = getSolids?.() ?? [];
    const worldDynamics = getDynamicObstacles?.() ?? [];

    // Snapshot active Landlord (Jenmi) positions & velocities for village-wide dominance & Kai Thozhal
    const activeLandlords: LandlordPresence[] = [];
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (a.brain.archetype === "landlord" && a.root.visible) {
        activeLandlords.push({
          id: a.profile.id,
          x: a.x,
          z: a.z,
          vx: a.vx,
          vz: a.vz,
          yaw: a.yaw,
        });
      }
    }

    // Person-to-person collision / shoulder-bump detection between village NPCs
    const canBump = (a: MixamoNpcActor) =>
      a.root.visible &&
      a.state !== "kalari_train" &&
      a.state !== "fishing_cast" &&
      a.state !== "bump_react" &&
      a.state !== "climb_up" &&
      a.state !== "sit_stone" &&
      a.state !== "jump_down" &&
      (a.bumpCooldown ?? 0) <= 0;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (!canBump(a)) continue;
      const spdA = Math.hypot(a.vx, a.vz);
      for (let j = i + 1; j < actors.length; j++) {
        const b = actors[j];
        if (!canBump(b)) continue;
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        if (dist < 0.78) {
          const spdB = Math.hypot(b.vx, b.vz);
          if (spdA > 0.35 || spdB > 0.35) {
            const hard = spdA > 1.8 || spdB > 1.8;
            triggerPersonBump(a, b.x, b.z, hard);
            triggerPersonBump(b, a.x, a.z, hard);
            break;
          }
        }
      }
    }

    const steerAngles = [0, 0.42, -0.42, 0.85, -0.85, 1.3, -1.3, 1.8, -1.8];
    const frameSolids: Solid[] = [];
    const peerScratch: MixamoNpcActor[] = [];

    actors.forEach((actor, idx) => {
      // Reuse buffer instead of allocating a new solids array every frame
      frameSolids.length = 0;
      for (let i = 0; i < baseSolids.length; i++) frameSolids.push(baseSolids[i]);
      for (let s = 0; s < umbrellaStones.length; s++) {
        if (actor.activeStoneIdx === s) continue;
        frameSolids.push(umbrellaStones[s].solid);
      }
      const solids = frameSolids;

      const isPointBlocked = (
        px: number,
        pz: number,
        solidPad: number,
        bodies: readonly Body[],
        bodyPad: number,
      ): boolean => {
        if (Boolean(getWaterInfo?.(px, pz)) && bridgeHeightAt?.(px, pz) === undefined) return true;
        for (let i = 0; i < solids.length; i++) {
          if (insideSolid(solids[i], px, pz, solidPad)) return true;
        }
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (Math.hypot(px - b.x, pz - b.z) < b.radius + bodyPad) return true;
        }
        return false;
      };

      // One-time clearance once worldSolids is populated so no NPC starts inside a stall/tree/house
      if (!actor.spawnCleared && solids.length > 0) {
        const safe = clearStandingPoint([actor.x, actor.z], solids, 0.6);
        actor.x = safe[0];
        actor.z = safe[1];
        actor.lastProgressX = actor.x;
        actor.lastProgressZ = actor.z;
        actor.spawnCleared = true;
      }

      const distToPlayer = Math.hypot(playerX - actor.x, playerZ - actor.z);
      actor.lastDistToPlayer = distToPlayer;

      // Feed NPC movement velocity into attached GPU cloth meshes so fabric trails naturally
      if (actor.clothInstances && actor.clothInstances.length > 0 && distToPlayer < 45) {
        for (let ci = 0; ci < actor.clothInstances.length; ci++) {
          actor.clothInstances[ci].setVelocity(actor.vx, actor.vz);
        }
      }

      // 3-tier Distance Animation & Shadow LOD:
      // Near (<26m): 60Hz skinning + shadows; Mid (26-52m): 20Hz skinning, no shadows; Far (52-78m): 8Hz; >78m: paused
      if (!actor.shadowMeshes) {
        const meshes: THREE.Mesh[] = [];
        actor.root.traverse((obj) => {
          if (obj instanceof THREE.Mesh) meshes.push(obj);
        });
        actor.shadowMeshes = meshes;
        actor.shadowCastEnabled = true;
      }
      const wantShadow = distToPlayer < 28;
      if (wantShadow !== actor.shadowCastEnabled) {
        actor.shadowCastEnabled = wantShadow;
        for (let m = 0; m < actor.shadowMeshes.length; m++) {
          actor.shadowMeshes[m].castShadow = wantShadow;
        }
      }

      const accum = (actor.animAccum ?? 0) + dt;
      if (distToPlayer < 26) {
        actor.mixer.update(accum);
        actor.animAccum = 0;
      } else if (distToPlayer < 52) {
        if (accum >= 0.05) {
          actor.mixer.update(accum);
          actor.animAccum = 0;
        } else {
          actor.animAccum = accum;
        }
      } else if (distToPlayer < 78) {
        if (accum >= 0.125) {
          actor.mixer.update(accum);
          actor.animAccum = 0;
        } else {
          actor.animAccum = accum;
        }
      } else {
        actor.animAccum = Math.min(accum, 0.125);
      }

      actor.stateTimer -= dt;
      if (actor.stoneCooldown > 0) actor.stoneCooldown = Math.max(0, actor.stoneCooldown - dt);
      if ((actor.bumpCooldown ?? 0) > 0) actor.bumpCooldown = Math.max(0, (actor.bumpCooldown ?? 0) - dt);

      const onStone =
        actor.state === "climb_approach" ||
        actor.state === "climb_up" ||
        actor.state === "sit_stone" ||
        actor.state === "jump_down";

      // Player-to-NPC collision reaction when the player runs or walks briskly into an NPC
      if (
        !onStone &&
        actor.state !== "kalari_train" &&
        actor.state !== "fishing_cast" &&
        actor.state !== "bump_react" &&
        (actor.bumpCooldown ?? 0) <= 0 &&
        distToPlayer < 0.85 &&
        playerSpeed > 1.35
      ) {
        triggerPersonBump(actor, playerX, playerZ, playerSpeed > 2.6);
      }

      // 1) Night Lamp & Elder Walking Stick (Oonnuvadi) visibility
      const carriesLamp = isNight && actor.state !== "smoke" && actor.state !== "pray" && !onStone;
      actor.nightLampGroup.visible = carriesLamp;
      if (actor.walkingStickGroup) {
        actor.walkingStickGroup.visible =
          actor.brain.usesWalkingStick &&
          !carriesLamp &&
          actor.state !== "pray" &&
          actor.state !== "smoke" &&
          !onStone;
      }

      const brainCtx: NpcBrainContext = {
        x: actor.x,
        z: actor.z,
        yaw: actor.yaw,
        age: actor.profile.age,
        elapsed,
        hour,
        daylight,
        isNight,
        isPrayerHour,
        isHeavyRain,
        distToPlayer,
        hasCaneWalkAnim: Boolean(actor.actions.caneWalk),
        hasCaneIdleAnim: Boolean(actor.actions.caneIdle),
        hasPartner: actor.partnerIdx !== undefined,
        seedIdx: idx,
      };
      if (actor.nightLampLight) {
        if (carriesLamp && distToPlayer < 26) {
          const flicker = 0.88 + Math.sin(elapsed * 13.0 + idx * 2.7) * 0.08 + Math.sin(elapsed * 29.0 + idx) * 0.04;
          actor.nightLampLight.intensity = 2.4 * flicker;
        } else {
          actor.nightLampLight.intensity = 0;
        }
      }
      if (actor.nightLampFlameMat && carriesLamp) {
        actor.nightLampFlameMat.emissiveIntensity = 4.2 + Math.sin(elapsed * 16.0 + idx) * 0.9;
      }

      // 1b) Person-to-person collision / shoulder-bump reaction animation
      if (actor.state === "bump_react") {
        actor.bumpTimer = (actor.bumpTimer ?? 0) - dt;
        const remain = actor.bumpTimer;
        actor.beediGroup.visible = false;
        actor.matchboxGroup.visible = false;
        const faceYaw = Math.atan2(
          (actor.bumpFaceX ?? playerX) - actor.x,
          (actor.bumpFaceZ ?? playerZ) - actor.z,
        );
        actor.yaw += shortestAngleDiff(actor.yaw, faceYaw) * Math.min(1, dt * 10.0);
        actor.root.rotation.y = actor.yaw;

        if (remain > 0.47) {
          // Brief damped stagger-back along collision normal during Hit Reaction
          const recoilFrac = THREE.MathUtils.clamp((remain - 0.47) / 0.78, 0, 1);
          const recoilSpd = 0.85 * recoilFrac;
          const rawX = actor.x + (actor.bumpAwayX ?? 0) * recoilSpd * dt;
          const rawZ = actor.z + (actor.bumpAwayZ ?? 0) * recoilSpd * dt;
          const [nx, nz] = moveBody([actor.x, actor.z], [rawX, rawZ], 0.46, solids, []);
          if (!(Boolean(getWaterInfo?.(nx, nz)) && bridgeHeightAt?.(nx, nz) === undefined)) {
            actor.vx = (nx - actor.x) / Math.max(dt, 0.001);
            actor.vz = (nz - actor.z) / Math.max(dt, 0.001);
            actor.x = nx;
            actor.z = nz;
          }
          playAction(actor, actor.actions.bumpReact ? "bumpReact" : "argue", 0.14, 0.92);
        } else {
          actor.vx = 0;
          actor.vz = 0;
          playAction(actor, actor.bumpFollowUpAnim ?? "talk", 0.24, 1.0);
        }

        if (remain <= 0) {
          actor.state = "walk";
          actor.stateTimer = 14.0;
          actor.subPath = [];
        }
        groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
        return;
      }

      // 2) Beedi + Matchbox props & realistic volumetric curling smoke during Smoking state
      const isSmoking = actor.state === "smoke" && !isHeavyRain;
      actor.beediGroup.visible = isSmoking;
      actor.matchboxGroup.visible = isSmoking;
      if (isSmoking) {
        const puffPulse = 0.5 + 0.5 * Math.sin(elapsed * 2.1 + idx);
        if (actor.beediEmberMat) {
          actor.beediEmberMat.emissiveIntensity = 2.6 + puffPulse * 3.8;
        }
        actor.smokeTipAccum += dt;
        if (actor.smokeTipAccum >= 0.14) {
          actor.smokeTipAccum = 0;
          actor.beediTipAnchor.getWorldPosition(tmpTipPos);
          smokeEmitter.emit(tmpTipPos, "tip_wisp");
        }
        actor.smokeExhaleTimer -= dt;
        if (actor.smokeExhaleTimer <= 0) {
          actor.smokeExhaleTimer = 2.6 + ((idx * 1.1 + elapsed) % 1.4);
          if (actor.headBone) {
            actor.headBone.getWorldPosition(tmpHeadPos);
          } else {
            tmpHeadPos.set(actor.x, groundYAt(actor.x, actor.z) + actor.profile.height * 0.88, actor.z);
          }
          tmpForward.set(Math.sin(actor.yaw), 0.12, Math.cos(actor.yaw)).normalize();
          tmpHeadPos.addScaledVector(tmpForward, 0.13);
          smokeEmitter.emit(tmpHeadPos, "exhale_puff", tmpForward);
        }
      }

      // 2b) Kerala Umbrella Stone (Kudakkallu) Climb -> Sit -> Jump Down sequence (strictly 1 NPC per stone)
      if (onStone && actor.activeStoneIdx !== null && umbrellaStones[actor.activeStoneIdx]) {
        const stone = umbrellaStones[actor.activeStoneIdx];

        if (actor.state === "climb_approach") {
          const dx = actor.stoneEdgeX - actor.x;
          const dz = actor.stoneEdgeZ - actor.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.22) {
            actor.x = actor.stoneEdgeX;
            actor.z = actor.stoneEdgeZ;
            actor.yaw = Math.atan2(stone.x - actor.x, stone.z - actor.z);
            actor.root.rotation.y = actor.yaw;
            actor.root.updateMatrixWorld(true);
            // Capture exact live standing hips height so climb starts seamlessly with zero pop
            if (actor.hipsBone) {
              actor.hipsBone.getWorldPosition(tmpFootPos);
              actor.stoneStartY = tmpFootPos.y;
            } else {
              actor.stoneStartY = groundYAt(actor.x, actor.z) + actor.profile.height * 0.53;
            }
            const climbHeight = Math.max(0.4, stone.topY + 0.08 - actor.stoneStartY);
            actor.state = "climb_up";
            actor.stonePhaseTimer = 0;
            actor.stonePhaseDuration = THREE.MathUtils.clamp(1.1 + climbHeight * 0.75, 1.4, 2.2);
            playAction(actor, actor.actions.climb ? "climb" : "climbHang", 0.22, 1.0);
          } else {
            const approachSpeed = getClipNaturalSpeed(actor, "walk") * THREE.MathUtils.clamp(actor.physics.walkSpeed / 1.18, 0.85, 1.12);
            const step = Math.min(d, approachSpeed * dt);
            actor.x += (dx / d) * step;
            actor.z += (dz / d) * step;
            const actualSpeed = step / Math.max(dt, 0.001);
            const targetYaw = Math.atan2(dx, dz);
            actor.yaw += shortestAngleDiff(actor.yaw, targetYaw) * Math.min(1, dt * actor.physics.turnRate);
            actor.root.rotation.y = actor.yaw;
            playLocomotionAction(actor, "walk", actualSpeed, 0.25, actor.brain.chooseIdleAnim(brainCtx) as MixamoAnimKey);
            groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
          }
          return;
        }

        if (actor.state === "climb_up") {
          actor.stonePhaseTimer += dt;
          const t = THREE.MathUtils.clamp(actor.stonePhaseTimer / actor.stonePhaseDuration, 0, 1);
          const ease = t * t * (3 - 2 * t);
          const horizT = THREE.MathUtils.clamp((t - 0.4) / 0.6, 0, 1);
          const horizEase = horizT * horizT * (3 - 2 * horizT);
          const curX = THREE.MathUtils.lerp(actor.stoneEdgeX, actor.stoneSitX, horizEase);
          const curZ = THREE.MathUtils.lerp(actor.stoneEdgeZ, actor.stoneSitZ, horizEase);
          // Lock live mixamorigHips height from standing height to exact Chumaduthangi slab top (+0.08m)
          // This cancels any excessive vertical root motion baked inside Climbing_1.fbx!
          const targetHipsY = THREE.MathUtils.lerp(actor.stoneStartY, stone.topY + 0.08, ease);
          actor.x = curX;
          actor.z = curZ;
          actor.yaw = Math.atan2(stone.x - actor.stoneEdgeX, stone.z - actor.stoneEdgeZ);
          actor.root.rotation.y = actor.yaw;
          playAction(actor, actor.actions.climb ? "climb" : "climbHang", 0.2, 1.0);
          setActorHipsWorldY(actor, curX, curZ, targetHipsY);

          if (t >= 1) {
            actor.state = "sit_stone";
            actor.stonePhaseTimer = 0;
            actor.stonePhaseDuration = 7.5 + (idx % 3) * 1.5;
            actor.yaw = Math.atan2(actor.stoneEdgeX - stone.x, actor.stoneEdgeZ - stone.z);
            actor.root.rotation.y = actor.yaw;
            playAction(actor, "sitIdle", 0.3, 1.0);
            setActorHipsWorldY(actor, actor.stoneSitX, actor.stoneSitZ, stone.topY + 0.08);
          }
          return;
        }

        if (actor.state === "sit_stone") {
          actor.stonePhaseTimer += dt;
          const sitOutYaw = Math.atan2(actor.stoneEdgeX - stone.x, actor.stoneEdgeZ - stone.z);
          actor.yaw += shortestAngleDiff(actor.yaw, sitOutYaw) * Math.min(1, dt * 5.0);
          actor.root.rotation.y = actor.yaw;
          playAction(actor, "sitIdle", 0.3, 1.0);
          // Lock seated hips flush onto the exact Chumaduthangi top slab (zero floating space!)
          setActorHipsWorldY(actor, actor.stoneSitX, actor.stoneSitZ, stone.topY + 0.08);

          if (actor.stonePhaseTimer >= actor.stonePhaseDuration) {
            const outDx = actor.stoneEdgeX - stone.x;
            const outDz = actor.stoneEdgeZ - stone.z;
            const outLen = Math.max(0.01, Math.hypot(outDx, outDz));
            const landRawX = stone.x + (outDx / outLen) * (stone.halfZ + 1.05);
            const landRawZ = stone.z + (outDz / outLen) * (stone.halfZ + 1.05);
            const safeLand =
              baseSolids.length > 0
                ? clearStandingPoint([landRawX, landRawZ], baseSolids, 0.48)
                : ([landRawX, landRawZ] as [number, number]);
            actor.stoneLandX = safeLand[0];
            actor.stoneLandZ = safeLand[1];
            actor.stoneStartY = stone.topY + 0.08;
            actor.state = "jump_down";
            actor.stonePhaseTimer = 0;
            actor.stonePhaseDuration = 1.05;
            const jumpDownPool = (["jumpDown", "jumpDownAlt", "jumpDownAlt2"] as MixamoAnimKey[]).filter(
              (k) => Boolean(actor.actions[k]),
            );
            actor.activeJumpDownClip =
              jumpDownPool.length > 0
                ? jumpDownPool[(idx + Math.floor(elapsed * 0.25)) % jumpDownPool.length]
                : "jump";
            playAction(actor, actor.activeJumpDownClip, 0.16, 1.0);
          }
          return;
        }

        if (actor.state === "jump_down") {
          actor.stonePhaseTimer += dt;
          const t = THREE.MathUtils.clamp(actor.stonePhaseTimer / actor.stonePhaseDuration, 0, 1);
          const curX = THREE.MathUtils.lerp(actor.stoneSitX, actor.stoneLandX, t);
          const curZ = THREE.MathUtils.lerp(actor.stoneSitZ, actor.stoneLandZ, t);
          const landHipsY = groundYAt(actor.stoneLandX, actor.stoneLandZ) + actor.profile.height * 0.52;
          const linearY = THREE.MathUtils.lerp(actor.stoneStartY, landHipsY, t * t);
          const hopArc = Math.sin(t * Math.PI) * 0.26;
          actor.x = curX;
          actor.z = curZ;
          const jumpYaw = Math.atan2(actor.stoneLandX - stone.x, actor.stoneLandZ - stone.z);
          actor.yaw += shortestAngleDiff(actor.yaw, jumpYaw) * Math.min(1, dt * 8.0);
          actor.root.rotation.y = actor.yaw;
          playAction(actor, actor.activeJumpDownClip ?? (actor.actions.jumpDown ? "jumpDown" : "jump"), 0.15, 1.0);
          setActorHipsWorldY(actor, curX, curZ, linearY + hopArc);

          if (t >= 1) {
            stone.occupiedBy = null;
            actor.activeStoneIdx = null;
            actor.stoneCooldown = 55 + idx * 12;
            actor.subPath = [];
            actor.subPathIdx = 0;
            actor.lastProgressX = actor.x;
            actor.lastProgressZ = actor.z;
            actor.stuckTimer = 0;
            actor.footGroundInitialized = false;
            actor.state = "walk";
            actor.stateTimer = 14.0;
            playAction(actor, "walk", 0.28, 1.0);
            groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
          }
          return;
        }
      }

      // 2c) Predictive Moving-Object Avoidance & Give-Way ("Side Kodukkuka")
      // Detects approaching Kalavandis (bullock carts), galloping horses, or cows,
      // steps onto the safest clear roadside verge (never into buildings/trees/water),
      // stops, turns to face the passing vehicle, and waits politely until clear!
      const yieldDecision = evaluateMovingObstacleYield({
        npcX: actor.x,
        npcZ: actor.z,
        movers: worldDynamics,
        solids,
        isBlockedWater: (px, pz) =>
          Boolean(getWaterInfo?.(px, pz)) && bridgeHeightAt?.(px, pz) === undefined,
        lookaheadDist: actor.brain.trafficLookahead,
        preferredClearance: actor.brain.preferredSideClearance,
        evadeSpeedMul: actor.brain.evadeSpeedMul,
        currentYieldTarget: actor.yieldTarget,
      });

      if (yieldDecision.active && yieldDecision.mover) {
        actor.yieldTarget = [yieldDecision.safeX, yieldDecision.safeZ];
        if (!yieldDecision.atSafeVerge) {
          const ydx = yieldDecision.safeX - actor.x;
          const ydz = yieldDecision.safeZ - actor.z;
          const yd = Math.hypot(ydx, ydz);
          if (yd > 0.05) {
            const evadeRun = yieldDecision.evadeSpeedMul >= 1.3 && actor.brain.runsInHeavyRain && !carriesLamp;
            const evadeKey = actor.brain.chooseWalkAnim(brainCtx, carriesLamp, evadeRun) as MixamoAnimKey;
            const evadeNatural = getClipNaturalSpeed(actor, evadeKey);
            const evadeSpeed = evadeRun
              ? evadeNatural * 0.92
              : evadeNatural * THREE.MathUtils.clamp(yieldDecision.evadeSpeedMul, 0.85, 1.3);
            actor.currentSpeed = THREE.MathUtils.damp(actor.currentSpeed, evadeSpeed, 7, dt);
            const step = Math.min(yd, actor.currentSpeed * dt);
            const dirX = ydx / yd;
            const dirZ = ydz / yd;
            const dynamicBodies: Body[] = [...worldDynamics, { x: playerX, z: playerZ, radius: 0.72 }];
            const [nx, nz] = moveBody(
              [actor.x, actor.z],
              [actor.x + dirX * step, actor.z + dirZ * step],
              0.46,
              solids,
              dynamicBodies,
            );
            if (!(Boolean(getWaterInfo?.(nx, nz)) && bridgeHeightAt?.(nx, nz) === undefined)) {
              actor.vx = (nx - actor.x) / Math.max(dt, 0.001);
              actor.vz = (nz - actor.z) / Math.max(dt, 0.001);
              actor.x = nx;
              actor.z = nz;
            } else {
              actor.vx = 0;
              actor.vz = 0;
            }
            const evadeYaw = Math.atan2(dirX, dirZ);
            actor.yaw += shortestAngleDiff(actor.yaw, evadeYaw) * Math.min(1, dt * 8.0);
            actor.root.rotation.y = actor.yaw;
            const actualSpeed = Math.hypot(actor.vx, actor.vz);
            playLocomotionAction(actor, evadeKey, actualSpeed, 0.22, actor.brain.chooseIdleAnim(brainCtx) as MixamoAnimKey);
            groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
            return;
          }
        }
        // Reached safe roadside verge: stop, face the passing Kalavandi/horse, and wait calmly!
        actor.currentSpeed = THREE.MathUtils.damp(actor.currentSpeed, 0, 8, dt);
        actor.vx = 0;
        actor.vz = 0;
        const watchYaw = Math.atan2(yieldDecision.faceX - actor.x, yieldDecision.faceZ - actor.z);
        actor.yaw += shortestAngleDiff(actor.yaw, watchYaw) * Math.min(1, dt * 6.0);
        actor.root.rotation.y = actor.yaw;
        const waitAnim = actor.brain.chooseYieldWaitAnim(brainCtx, yieldDecision.mover.kind) as MixamoAnimKey;
        playAction(actor, waitAnim, 0.28);
        groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
        return;
      } else if (actor.yieldTarget !== null) {
        actor.yieldTarget = null;
        actor.subPath = [];
      }

      // 2d) Landlord Dominance & Villager Deference ("Side Kodukkuka" + "Kai Thozhal")
      // When a Landlord (Thampuran / Jenmi) approaches, farmers, laborers, women & elders
      // put away beedis, clear the center of the road, turn to face him, and fold hands in respect!
      // 2c2) Armed Nair Escorts march smoothly in formation flanking the Estate Landlord (Thampuran)
      if (actor.escortsLandlord && activeLandlords.length > 0) {
        const lord = activeLandlords[0];
        const lordSpeed = Math.hypot(lord.vx, lord.vz);
        const side = actor.escortSide ?? 1;
        const backDist = side === 0 ? 1.25 : 2.35;
        const latOffset = side === 0 ? 0.95 : 1.05 * side;
        const rawEscortX = lord.x - Math.sin(lord.yaw) * backDist + Math.cos(lord.yaw) * latOffset;
        const rawEscortZ = lord.z - Math.cos(lord.yaw) * backDist - Math.sin(lord.yaw) * latOffset;
        const safeEscort = solids.length > 0 ? clearStandingPoint([rawEscortX, rawEscortZ], solids, 0.54) : ([rawEscortX, rawEscortZ] as [number, number]);
        const edx = safeEscort[0] - actor.x;
        const edz = safeEscort[1] - actor.z;
        const ed = Math.hypot(edx, edz);

        // Clean hysteresis: keep marching seamlessly while Landlord walks; only halt when Landlord stops and guard is in slot
        const wasMoving = actor.currentSpeed > 0.18;
        const shouldMove = lordSpeed > 0.18 ? ed > 0.28 : (wasMoving ? ed > 0.42 : ed > 0.85);

        if (shouldMove) {
          const isFarBehind = ed > 6.5 || (actor.activeKey === "run" && ed > 3.2);
          const walkKey = (isFarBehind ? "run" : "walk") as MixamoAnimKey;
          const naturalWalk = getClipNaturalSpeed(actor, walkKey);

          // Route cleanly around tables, sacks, fences, and walls whenever direct line is obstructed
          let steerTargetX = safeEscort[0];
          let steerTargetZ = safeEscort[1];
          if (solids.length > 0 && !segmentClear([actor.x, actor.z], safeEscort, solids, 0.48)) {
            const detour = obstacleDetour([actor.x, actor.z], safeEscort, solids, 0.50);
            if (detour.length > 0) {
              steerTargetX = detour[0][0];
              steerTargetZ = detour[0][1];
            }
          }
          const sdx = steerTargetX - actor.x;
          const sdz = steerTargetZ - actor.z;
          const sd = Math.hypot(sdx, sdz);

          // Continuous formation pace controller: matches Landlord speed + gentle catch-up without start/stop jerking
          const desiredSpd = isFarBehind
            ? naturalWalk * 0.92
            : lordSpeed > 0.18
              ? THREE.MathUtils.clamp(lordSpeed + THREE.MathUtils.clamp((ed - 0.35) * 0.55, -0.25, 0.75), 0.62, naturalWalk * 1.25)
              : THREE.MathUtils.clamp(ed * 0.95, 0.65, naturalWalk * 1.05);

          actor.currentSpeed = THREE.MathUtils.damp(actor.currentSpeed, desiredSpd, 4.2, dt);

          // Full obstacle avoidance + peer/Landlord separation so guards steer smoothly around trees & stalls
          const peerBodies: Body[] = [
            ...worldDynamics,
            { x: playerX, z: playerZ, radius: 0.68 },
            { x: lord.x, z: lord.z, radius: 0.65 },
          ];
          for (let j = 0; j < actors.length; j++) {
            if (j === idx) continue;
            const other = actors[j];
            if (!other.root.visible) continue;
            if (Math.hypot(other.x - actor.x, other.z - actor.z) < 4.5) {
              peerBodies.push({ x: other.x, z: other.z, radius: 0.52 });
            }
          }

          const baseAngle = Math.atan2(sdx, sdz);
          let chosenAngle = baseAngle;
          for (const offset of steerAngles) {
            const cand = baseAngle + offset;
            const sinA = Math.sin(cand);
            const cosA = Math.cos(cand);
            const nearBlocked = isPointBlocked(actor.x + sinA * 0.68, actor.z + cosA * 0.68, 0.48, peerBodies, 0.44);
            const farBlocked = isPointBlocked(actor.x + sinA * 1.25, actor.z + cosA * 1.25, 0.48, peerBodies, 0.44);
            if (!nearBlocked && !farBlocked) {
              chosenAngle = cand;
              break;
            }
          }

          const dirX = Math.sin(chosenAngle);
          const dirZ = Math.cos(chosenAngle);
          const step = Math.min(Math.max(sd, 0.25), actor.currentSpeed * dt);
          const [nx, nz] = moveBody(
            [actor.x, actor.z],
            [actor.x + dirX * step, actor.z + dirZ * step],
            0.46,
            solids,
            peerBodies,
          );
          if (!(Boolean(getWaterInfo?.(nx, nz)) && bridgeHeightAt?.(nx, nz) === undefined)) {
            actor.vx = (nx - actor.x) / Math.max(dt, 0.001);
            actor.vz = (nz - actor.z) / Math.max(dt, 0.001);
            actor.x = nx;
            actor.z = nz;
          } else {
            actor.vx = 0;
            actor.vz = 0;
          }

          // Escort stuck recovery: if wedged against a table/fence/wall, nudge clear so they route around it
          if (Math.hypot(actor.x - actor.lastProgressX, actor.z - actor.lastProgressZ) > 0.14) {
            actor.lastProgressX = actor.x;
            actor.lastProgressZ = actor.z;
            actor.stuckTimer = 0;
          } else {
            actor.stuckTimer += dt;
            if (actor.stuckTimer > 0.75 && solids.length > 0) {
              const freed = clearStandingPoint([actor.x, actor.z], solids, 0.64);
              actor.x = freed[0];
              actor.z = freed[1];
              actor.lastProgressX = actor.x;
              actor.lastProgressZ = actor.z;
              actor.stuckTimer = 0;
            }
          }

          const actualSpeed = Math.hypot(actor.vx, actor.vz);
          const moveYaw = actualSpeed > 0.12 ? Math.atan2(actor.vx, actor.vz) : lord.yaw;
          actor.yaw += shortestAngleDiff(actor.yaw, moveYaw) * Math.min(1, dt * 5.2);
          actor.root.rotation.y = actor.yaw;
          playLocomotionAction(actor, walkKey, actualSpeed, 0.28, "breathIdle");
        } else {
          actor.currentSpeed = THREE.MathUtils.damp(actor.currentSpeed, 0, 5.5, dt);
          actor.vx = 0;
          actor.vz = 0;
          actor.stuckTimer = 0;
          actor.yaw += shortestAngleDiff(actor.yaw, lord.yaw) * Math.min(1, dt * 4.5);
          actor.root.rotation.y = actor.yaw;
          playAction(actor, "breathIdle", 0.35);
        }
        groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
        return;
      }

      const deference = evaluateLandlordDeference({
        npcX: actor.x,
        npcZ: actor.z,
        npcArchetype: actor.brain.archetype,
        npcSocialClass: actor.profile.socialClass,
        seedIdx: idx,
        landlords: activeLandlords,
        solids,
        isBlockedWater: (px, pz) =>
          Boolean(getWaterInfo?.(px, pz)) && bridgeHeightAt?.(px, pz) === undefined,
        currentSafeSpot: actor.deferenceTarget,
      });

      if (deference.active) {
        actor.deferenceTarget = [deference.safeX, deference.safeZ];
        if (deference.suppressSmoking) {
          actor.beediGroup.visible = false;
          actor.matchboxGroup.visible = false;
        }
        if (deference.mustStepAside) {
          const ddx = deference.safeX - actor.x;
          const ddz = deference.safeZ - actor.z;
          const dd = Math.hypot(ddx, ddz);
          if (dd > 0.05) {
            const walkKey = actor.brain.chooseWalkAnim(brainCtx, carriesLamp, false) as MixamoAnimKey;
            const stepSpd = getClipNaturalSpeed(actor, walkKey) * THREE.MathUtils.clamp(deference.stepAsideSpeedMul, 0.85, 1.25);
            actor.currentSpeed = THREE.MathUtils.damp(actor.currentSpeed, stepSpd, 7, dt);
            const step = Math.min(dd, actor.currentSpeed * dt);
            const dirX = ddx / dd;
            const dirZ = ddz / dd;
            const dynamicBodies: Body[] = [...worldDynamics, { x: playerX, z: playerZ, radius: 0.72 }];
            const [nx, nz] = moveBody(
              [actor.x, actor.z],
              [actor.x + dirX * step, actor.z + dirZ * step],
              0.46,
              solids,
              dynamicBodies,
            );
            if (!(Boolean(getWaterInfo?.(nx, nz)) && bridgeHeightAt?.(nx, nz) === undefined)) {
              actor.vx = (nx - actor.x) / Math.max(dt, 0.001);
              actor.vz = (nz - actor.z) / Math.max(dt, 0.001);
              actor.x = nx;
              actor.z = nz;
            } else {
              actor.vx = 0;
              actor.vz = 0;
            }
            const asideYaw = Math.atan2(dirX, dirZ);
            actor.yaw += shortestAngleDiff(actor.yaw, asideYaw) * Math.min(1, dt * 8.0);
            actor.root.rotation.y = actor.yaw;
            const actualSpeed = Math.hypot(actor.vx, actor.vz);
            playLocomotionAction(actor, walkKey, actualSpeed, 0.22, actor.brain.chooseIdleAnim(brainCtx) as MixamoAnimKey);
            groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
            return;
          }
        }
        // Reached the side: stop, face the passing Landlord, and perform Kai Thozhal (folded hands)!
        actor.currentSpeed = THREE.MathUtils.damp(actor.currentSpeed, 0, 8, dt);
        actor.vx = 0;
        actor.vz = 0;
        if (actor.walkingStickGroup && deference.respectAnim !== "greet") {
          actor.walkingStickGroup.visible = false;
        }
        const respectYaw = Math.atan2(deference.faceX - actor.x, deference.faceZ - actor.z);
        actor.yaw += shortestAngleDiff(actor.yaw, respectYaw) * Math.min(1, dt * 6.5);
        actor.root.rotation.y = actor.yaw;
        playAction(actor, deference.respectAnim, 0.28);
        groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
        return;
      } else if (actor.deferenceTarget) {
        actor.deferenceTarget = null;
        actor.subPath = [];
      }

      // 2d2) Live Kerala Bamboo-Rod Fishing (Fishing Cast / Idle) & Paddled Vallam (Paddling) (Set #6)
      if (actor.fishermanAction) {
        actor.currentSpeed = 0;
        actor.vx = 0;
        actor.vz = 0;
        actor.nightLampGroup.visible = false;
        actor.beediGroup.visible = false;
        actor.matchboxGroup.visible = false;
        const sampleWaterY = (wx: number, wz: number) => {
          const info = getWaterInfo?.(wx, wz) as { surfaceY?: number } | null | undefined;
          return typeof info?.surfaceY === "number" ? info.surfaceY : groundYAt(wx, wz);
        };
        if (actor.fishermanAction.mode === "vallam_paddling") {
          playAction(actor, actor.actions.paddling ? "paddling" : "sitIdle", 0.3, 1.0);
          const res = updateFishermanPaddleRig(actor.fishermanAction, actor.root, elapsed, dt, sampleWaterY);
          actor.x = res.x;
          actor.z = res.z;
          actor.yaw = res.yaw;
        } else {
          const castYaw = Math.atan2(
            actor.fishermanAction.castTargetX - actor.x,
            actor.fishermanAction.castTargetZ - actor.z,
          );
          actor.yaw += shortestAngleDiff(actor.yaw, castYaw) * Math.min(1, dt * 6.0);
          actor.root.rotation.y = actor.yaw;
          groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
          const rodAnim = updateFishermanRodRig(
            actor.fishermanAction,
            actor.root,
            actor.yaw,
            elapsed,
            dt,
            sampleWaterY,
          );
          playAction(
            actor,
            actor.actions[rodAnim] ? rodAnim : "breathIdle",
            0.28,
            1.0,
          );
        }
        return;
      }

      // 2e) Live Kalaripayattu Combat & Reaction Choreography (Set #5)
      if (actor.kalariCombat) {
        const kc = actor.kalariCombat;
        actor.currentSpeed = 0;
        actor.vx = 0;
        actor.vz = 0;

        if (kc.partnerId && actor.partnerIdx !== undefined && actors[actor.partnerIdx]?.kalariCombat) {
          const partner = actors[actor.partnerIdx];
          // Pair leader ticks both fighters in lockstep so attack -> reaction timing stays exact
          if (kc.isPairLeader && partner.kalariCombat) {
            const { leaderResult, followerResult } = stepPairedKalariCombat(
              kc,
              partner.kalariCombat,
              dt,
              isPrayerHour,
            );
            // Gentle martial footwork sway during Ginga stance; firmly planted during strikes/reactions
            const sway = kc.phase === "stance" ? Math.sin(elapsed * 2.1 + idx) * 0.14 : 0;
            actor.x = kc.anchorX;
            actor.z = kc.anchorZ + sway;
            partner.x = partner.kalariCombat.anchorX;
            partner.z = partner.kalariCombat.anchorZ - sway;

            const facePartnerYaw = Math.atan2(partner.x - actor.x, partner.z - actor.z);
            actor.yaw += shortestAngleDiff(actor.yaw, facePartnerYaw) * Math.min(1, dt * 8.0);
            actor.root.rotation.y = actor.yaw;
            const partnerFaceYaw = Math.atan2(actor.x - partner.x, actor.z - partner.z);
            partner.yaw += shortestAngleDiff(partner.yaw, partnerFaceYaw) * Math.min(1, dt * 8.0);
            partner.root.rotation.y = partner.yaw;

            if (actor.kalariSwordProp) actor.kalariSwordProp.visible = leaderResult.weaponsDrawn;
            if (actor.kalariShieldProp) actor.kalariShieldProp.visible = leaderResult.weaponsDrawn;
            if (partner.kalariSwordProp) partner.kalariSwordProp.visible = followerResult.weaponsDrawn;
            if (partner.kalariShieldProp) partner.kalariShieldProp.visible = followerResult.weaponsDrawn;

            playAction(actor, leaderResult.animKey, leaderResult.fadeSec, leaderResult.timeScale);
            playAction(partner, followerResult.animKey, followerResult.fadeSec, followerResult.timeScale);
          }
          groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
          return;
        }

        // Solo Meipayattu acrobatics / Kettukari staff drill student
        if (distToPlayer < 2.1) {
          const facePlayer = Math.atan2(playerX - actor.x, playerZ - actor.z);
          actor.yaw += shortestAngleDiff(actor.yaw, facePlayer) * Math.min(1, dt * 6.5);
          actor.root.rotation.y = actor.yaw;
          playAction(actor, "greet", 0.25);
          groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
          return;
        }

        const soloRes = stepSoloKalariCombat(kc, dt, isPrayerHour);
        actor.x = kc.anchorX;
        actor.z = kc.anchorZ;
        actor.yaw += shortestAngleDiff(actor.yaw, kc.homeYaw) * Math.min(1, dt * 5.0);
        actor.root.rotation.y = actor.yaw;
        if (actor.kalariStaffProp) actor.kalariStaffProp.visible = soloRes.weaponsDrawn;
        playAction(actor, soloRes.animKey, soloRes.fadeSec, soloRes.timeScale);
        groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
        return;
      }

      // 3) Player proximity greeting / waving (Landlord & his guards/Karyasthan never stop or bow to passersby)
      const isLandlordParty =
        actor.brain.archetype === "landlord" ||
        actor.brain.archetype === "guard" ||
        actor.brain.archetype === "karyasthan";
      if (!isLandlordParty && distToPlayer < 2.9 && actor.state !== "smoke" && actor.state !== "pray") {
        const targetYaw = Math.atan2(playerX - actor.x, playerZ - actor.z);
        actor.yaw += shortestAngleDiff(actor.yaw, targetYaw) * Math.min(1, dt * actor.physics.turnRate);
        actor.root.rotation.y = actor.yaw;
        actor.currentSpeed = THREE.MathUtils.damp(actor.currentSpeed, 0, 7, dt);
        actor.vx = 0;
        actor.vz = 0;
        const greetClip = actor.brain.choosePlayerGreeting(brainCtx, actor.profile.socialClass) as MixamoAnimKey;
        playAction(actor, greetClip, 0.3);
        groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
        return;
      }

      // 4) Market conversation / friendly arguing partners
      if (actor.profile.job === "market_farmer") {
        if (actor.partnerIdx !== undefined && actors[actor.partnerIdx]) {
          const p = actors[actor.partnerIdx];
          const faceYaw = Math.atan2(p.x - actor.x, p.z - actor.z);
          actor.yaw += shortestAngleDiff(actor.yaw, faceYaw) * Math.min(1, dt * 4.2);
          actor.root.rotation.y = actor.yaw;
        }
        if (actor.stateTimer <= 0) {
          const roll = Math.abs(Math.sin(elapsed * 1.7 + idx * 3.9));
          if (isPrayerHour && roll < actor.physics.prayChance) {
            actor.state = "pray";
            actor.stateTimer = 6.5;
          } else if (!isHeavyRain && roll < actor.physics.smokeChance) {
            actor.state = "smoke";
            actor.stateTimer = 9.0;
          } else if (roll < actor.physics.smokeChance + actor.physics.argueChance) {
            actor.state = "argue";
            actor.stateTimer = 5.5;
          } else {
            actor.state = actor.state === "talk" ? "idle" : "talk";
            actor.stateTimer = 5.0 + (idx % 3) * 1.3;
          }
        }
        const clip: MixamoAnimKey =
          actor.state === "smoke"
            ? "smoke"
            : actor.state === "pray"
              ? idx % 2 === 0
                ? "pray"
                : "pray2"
              : actor.state === "argue"
                ? "argue"
                : actor.state === "talk"
                  ? "talk"
                  : pickIdleClip(idx, elapsed);
        playAction(actor, clip, 0.35);
        groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
        return;
      }

      // 5) Locomotion & Physics (resting stone check, path detour around buildings/trees, feeler steering, personal space)
      if ((actor.state === "walk" || actor.state === "run") && actor.profile.waypoints.length > 1) {
        if (
          actor.brain.canClimbRestingStone &&
          actor.stoneCooldown <= 0 &&
          !carriesLamp &&
          !isHeavyRain &&
          actor.profile.age < 52 &&
          (actor.actions.climb || actor.actions.climbHang)
        ) {
          for (let s = 0; s < umbrellaStones.length; s++) {
            const st = umbrellaStones[s];
            if (st.occupiedBy !== null) continue;
            const dStone = Math.hypot(actor.x - st.x, actor.z - st.z);
            if (dStone < 3.8) {
              // Claim exclusive access to this Chumaduthangi (strictly 1 NPC at a time)
              st.occupiedBy = actor.profile.id;
              actor.activeStoneIdx = s;
              // Approach the closer of the two broad faces perpendicular to the stone bench rotation
              const nx = Math.sin(st.rot);
              const nz = Math.cos(st.rot);
              const dot = (actor.x - st.x) * nx + (actor.z - st.z) * nz;
              const side = dot >= 0 ? 1 : -1;
              actor.stoneEdgeX = st.x + nx * side * (st.halfZ + 0.34);
              actor.stoneEdgeZ = st.z + nz * side * (st.halfZ + 0.34);
              actor.stoneSitX = st.x + nx * side * 0.14;
              actor.stoneSitZ = st.z + nz * side * 0.14;
              actor.state = "climb_approach";
              actor.subPath = [];
              return;
            }
          }
        }

        const rawWp = actor.profile.waypoints[actor.waypointIdx];
        const safeWp = solids.length > 0 ? clearStandingPoint(rawWp, solids, 0.56) : rawWp;

        if (actor.subPath.length === 0) {
          const detour =
            solids.length > 0
              ? obstacleDetour([actor.x, actor.z], safeWp, solids, 0.50)
              : [safeWp];
          actor.subPath =
            detour.length > 0
              ? detour.map(([px, pz]) => [px, pz] as [number, number])
              : [[safeWp[0], safeWp[1]]];
          actor.subPathIdx = 0;
        }

        const [tx, tz] = actor.subPath[Math.min(actor.subPathIdx, actor.subPath.length - 1)];
        const dx = tx - actor.x;
        const dz = tz - actor.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.55) {
          if (actor.subPathIdx + 1 < actor.subPath.length) {
            actor.subPathIdx++;
          } else {
            actor.subPath = [];
            actor.subPathIdx = 0;
            actor.waypointIdx = (actor.waypointIdx + 1) % actor.profile.waypoints.length;
            const arrival = actor.brain.chooseWaypointAction(
              brainCtx,
              actor.profile.job,
              actor.physics.smokeChance,
              actor.physics.prayChance,
            );
            actor.state = arrival.action;
            actor.stateTimer = arrival.duration;
          }
        } else {
          const shouldRun =
            isHeavyRain &&
            actor.brain.runsInHeavyRain &&
            actor.physics.canRunInRain &&
            !carriesLamp;
          actor.state = shouldRun ? "run" : "walk";

          const dynamicBodies: Body[] = [...worldDynamics, { x: playerX, z: playerZ, radius: 0.75 }];
          for (let j = 0; j < actors.length; j++) {
            if (j === idx) continue;
            dynamicBodies.push({ x: actors[j].x, z: actors[j].z, radius: 0.62 });
          }

          // Landlord & his guards/Karyasthan command the center of the road; villagers give way to them
          let passingBias = 0;
          if (!isLandlordParty) {
            peerScratch.length = 0;
            for (let j = 0; j < actors.length; j++) {
              if (j !== idx) peerScratch.push(actors[j]);
            }
            passingBias = computePedestrianPassingBias(
              actor.x,
              actor.z,
              dx / Math.max(dist, 0.01),
              dz / Math.max(dist, 0.01),
              peerScratch,
            );
          }
          const desiredAngle = Math.atan2(dx, dz) + passingBias;
          let chosenAngle = desiredAngle;
          let foundClearAngle = false;
          for (let a = 0; a < steerAngles.length; a++) {
            const cand = desiredAngle + steerAngles[a];
            const sinA = Math.sin(cand);
            const cosA = Math.cos(cand);
            const nearBlocked = isPointBlocked(
              actor.x + sinA * 0.72,
              actor.z + cosA * 0.72,
              0.54,
              dynamicBodies,
              0.52,
            );
            const farBlocked = isPointBlocked(
              actor.x + sinA * 1.45,
              actor.z + cosA * 1.45,
              0.54,
              dynamicBodies,
              0.55,
            );
            if (!nearBlocked && !farBlocked) {
              chosenAngle = cand;
              foundClearAngle = true;
              break;
            }
          }

          if (!foundClearAngle && solids.length > 0) {
            const freshDetour = obstacleDetour([actor.x, actor.z], safeWp, solids, 0.50);
            if (freshDetour.length > 0) {
              actor.subPath = freshDetour.map(([px, pz]) => [px, pz] as [number, number]);
              actor.subPathIdx = 0;
            }
          }

          const dirX = Math.sin(chosenAngle);
          const dirZ = Math.cos(chosenAngle);

          const yNow = groundYAt(actor.x, actor.z);
          const yAhead = groundYAt(actor.x + dirX * 0.6, actor.z + dirZ * 0.6);
          const slope = (yAhead - yNow) / 0.6;
          const slopeMul =
            slope > 0
              ? 1 / (1 + slope * actor.physics.slopePenalty)
              : Math.min(1.12, 1 - slope * 0.25);

          // Select the exact walk/run clip first so ground movement speed matches the animation's real stride
          const locoClip = actor.brain.chooseWalkAnim(brainCtx, carriesLamp, shouldRun) as MixamoAnimKey;
          const naturalClipSpeed = getClipNaturalSpeed(actor, locoClip);
          const personalPaceMul = shouldRun
            ? THREE.MathUtils.clamp(actor.physics.runSpeed / 2.85, 0.82, 1.12)
            : THREE.MathUtils.clamp(actor.physics.walkSpeed / 1.18, 0.86, 1.14);
          const targetSpeed = naturalClipSpeed * personalPaceMul * slopeMul;
          actor.currentSpeed = THREE.MathUtils.damp(
            actor.currentSpeed,
            targetSpeed,
            actor.physics.accel,
            dt,
          );

          const step = Math.min(dist, actor.currentSpeed * dt);
          const rawNextX = actor.x + dirX * step;
          const rawNextZ = actor.z + dirZ * step;

          const [nx, nz] = moveBody(
            [actor.x, actor.z],
            [rawNextX, rawNextZ],
            0.46,
            solids,
            dynamicBodies,
          );

          const blockedByWater =
            Boolean(getWaterInfo?.(nx, nz)) && bridgeHeightAt?.(nx, nz) === undefined;
          if (!blockedByWater) {
            actor.vx = (nx - actor.x) / Math.max(dt, 0.001);
            actor.vz = (nz - actor.z) / Math.max(dt, 0.001);
            actor.x = nx;
            actor.z = nz;
          } else {
            actor.vx = 0;
            actor.vz = 0;
            actor.subPath = [];
            actor.waypointIdx = (actor.waypointIdx + 1) % actor.profile.waypoints.length;
          }

          if (Math.hypot(actor.x - actor.lastProgressX, actor.z - actor.lastProgressZ) > 0.14) {
            actor.lastProgressX = actor.x;
            actor.lastProgressZ = actor.z;
            actor.stuckTimer = 0;
          } else {
            actor.stuckTimer += dt;
            if (actor.stuckTimer > 0.85) {
              actor.stuckTimer = 0;
              if (solids.length > 0) {
                const freed = clearStandingPoint([actor.x, actor.z], solids, 0.62);
                actor.x = freed[0];
                actor.z = freed[1];
              }
              actor.lastProgressX = actor.x;
              actor.lastProgressZ = actor.z;
              actor.subPath = [];
              actor.waypointIdx = (actor.waypointIdx + 1) % actor.profile.waypoints.length;
            }
          }

          if (
            solids.length > 0 &&
            actor.subPath.length > 0 &&
            !segmentClear([actor.x, actor.z], [tx, tz], solids, 0.45)
          ) {
            actor.subPath = [];
          }

          const targetYaw = Math.atan2(dirX, dirZ);
          actor.yaw += shortestAngleDiff(actor.yaw, targetYaw) * Math.min(1, dt * actor.physics.turnRate);
          actor.root.rotation.y = actor.yaw;

          const actualGroundSpeed = Math.hypot(actor.vx, actor.vz);
          playLocomotionAction(
            actor,
            locoClip,
            actualGroundSpeed,
            0.3,
            actor.brain.chooseIdleAnim(brainCtx) as MixamoAnimKey,
          );
        }
      } else {
        actor.currentSpeed = THREE.MathUtils.damp(actor.currentSpeed, 0, 6, dt);
        actor.vx = 0;
        actor.vz = 0;
        if (actor.stateTimer <= 0) {
          actor.state = "walk";
          actor.stateTimer = 16.0;
          actor.subPath = [];
        }
        const idleOrActionClip: MixamoAnimKey =
          actor.state === "smoke"
            ? "smoke"
            : actor.state === "work"
              ? "work"
              : actor.state === "pray"
                ? idx % 2 === 0
                  ? "pray"
                  : "pray2"
                : (actor.brain.chooseIdleAnim(brainCtx) as MixamoAnimKey);
        playAction(actor, idleOrActionClip, 0.35);
      }

      groundActorFeet(actor, groundYAt(actor.x, actor.z), dt);
    });
  };

  return {
    update,
    getActors: () =>
      actors.map((a) => ({
        id: a.profile.id,
        name: a.profile.name,
        job: a.profile.job,
        socialClass: a.profile.socialClass,
        x: a.x,
        z: a.z,
        visible: a.root.visible,
      })),
  };
}
