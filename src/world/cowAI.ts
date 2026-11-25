import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { RiggedAnimalTemplate, WaterSample } from "./keralaAnimals";

/**
 * Dedicated Open-World Cow AI & Biomechanical Gait Engine (RDR2 / GTA-style Utility FSM)
 *
 * Designed specifically for rigged cattle (`farm_cow_animated_dairy_cattle.glb`):
 * - Uses Quaternion-Delta Skeletal Stride computed in model-space lateral axis so front
 *   AND back legs (whose rest poses are rotated ~112 deg) NEVER fold into the torso!
 * - True 4-beat bovine lateral-sequence walk cycle (BL -> FL -> BR -> FR) with knee flexion
 *   during the swing phase and natural weight-shift bob.
 * - Long, unhurried, realistic state durations (no instant sit/stand snapping):
 *     * `graze` (15-28s): Smooth 1.4s head lowering, rhythmic chewing, occasional slow grazing step
 *     * `walk_pasture` (8-16s): Smooth acceleration to a fresh grass patch, herd-aware steering
 *     * `stand_ruminate` (10-18s): Calm standing cud-chewing, glancing around, tail fly-swish
 *     * `lie_rest` (28-48s): Only during afternoon heat/night, with smooth 2.4s kneel & stand easing
 *     * `startle_trot` (3-5s): Brief brisk move away if the player sprints directly into the cow
 */

export type CowState =
  | "graze"
  | "walk_pasture"
  | "stand_ruminate"
  | "lie_rest"
  | "startle_trot";

type RiggedBone = {
  bone: THREE.Object3D;
  restQuat: THREE.Quaternion;
  /** Local-space axis corresponding to the cow's lateral pitch axis (+X in cow model space). */
  pitchAxis: THREE.Vector3;
  /** Local-space axis corresponding to the cow's yaw/sway axis (+Y in cow model space). */
  yawAxis: THREE.Vector3;
};

type CowBones = {
  spine?: RiggedBone;
  flUpper?: RiggedBone;
  flLower?: RiggedBone;
  frUpper?: RiggedBone;
  frLower?: RiggedBone;
  blUpper?: RiggedBone;
  blLower?: RiggedBone;
  brUpper?: RiggedBone;
  brLower?: RiggedBone;
  neckLower?: RiggedBone;
  neckUpper?: RiggedBone;
  head?: RiggedBone;
  tail?: RiggedBone;
};

export type CowActor = {
  group: THREE.Group;
  model: THREE.Group;
  bones: CowBones;
  mixer?: THREE.AnimationMixer;
  idleAction?: THREE.AnimationAction;
  // Spatial & movement physics
  anchorX: number;
  anchorZ: number;
  pastureRadius: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  forwardSpeed: number;
  turnRate: number;
  yaw: number;
  pitch: number;
  // Smooth animation blends (0..1)
  grazeBlend: number;
  restBlend: number;
  walkBlend: number;
  stridePhase: number;
  headLookYaw: number;
  // FSM state
  state: CowState;
  stateTimer: number;
  targetX: number;
  targetZ: number;
  grazeStepCooldown: number;
  phaseOffset: number;
  walkSpeed: number;
};

const _tmpQ = new THREE.Quaternion();
const _tmpQ2 = new THREE.Quaternion();
const _tmpMat = new THREE.Matrix4();
const _tmpInv = new THREE.Matrix4();
const _modelRight = new THREE.Vector3(1, 0, 0);
const _modelUp = new THREE.Vector3(0, 1, 0);

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Captures a bone's exact rest quaternion AND projects the cow model's lateral (+X)
 * and vertical (+Y) axes into the bone's local coordinate frame.
 * This guarantees positive pitch ALWAYS swings legs/neck cleanly in the cow's sagittal plane,
 * regardless of how Blender/Sketchfab oriented each individual bone's rest quaternion!
 */
function captureRiggedBone(
  bone: THREE.Object3D,
  modelRoot: THREE.Object3D,
): RiggedBone {
  modelRoot.updateMatrixWorld(true);
  // Transform from modelRoot space into bone's local space
  _tmpInv.copy(bone.matrixWorld).invert();
  _tmpMat.multiplyMatrices(_tmpInv, modelRoot.matrixWorld);
  const rotOnly = new THREE.Matrix3().setFromMatrix4(_tmpMat);

  const pitchAxis = _modelRight.clone().applyMatrix3(rotOnly).normalize();
  const yawAxis = _modelUp.clone().applyMatrix3(rotOnly).normalize();

  return {
    bone,
    restQuat: bone.quaternion.clone(),
    pitchAxis,
    yawAxis,
  };
}

function applyBoneOffset(
  rb: RiggedBone | undefined,
  pitchRad: number,
  yawRad = 0,
  useCurrentAsBase = false,
) {
  if (!rb) return;
  if (!useCurrentAsBase) {
    rb.bone.quaternion.copy(rb.restQuat);
  }
  if (Math.abs(pitchRad) > 1e-4) {
    _tmpQ.setFromAxisAngle(rb.pitchAxis, pitchRad);
    rb.bone.quaternion.multiply(_tmpQ);
  }
  if (Math.abs(yawRad) > 1e-4) {
    _tmpQ2.setFromAxisAngle(rb.yawAxis, yawRad);
    rb.bone.quaternion.multiply(_tmpQ2);
  }
}

function captureCowBones(model: THREE.Group): CowBones {
  const bones: CowBones = {};
  model.updateMatrixWorld(true);
  model.traverse((obj) => {
    const low = obj.name.toLowerCase();
    if (low === "spine_01" && !bones.spine) bones.spine = captureRiggedBone(obj, model);
    else if ((low === "lfl1_017" || low === "leg_fl") && !bones.flUpper) bones.flUpper = captureRiggedBone(obj, model);
    else if (low === "lfl2_018" && !bones.flLower) bones.flLower = captureRiggedBone(obj, model);
    else if ((low === "lfr1_021" || low === "leg_fr") && !bones.frUpper) bones.frUpper = captureRiggedBone(obj, model);
    else if (low === "lfr2_022" && !bones.frLower) bones.frLower = captureRiggedBone(obj, model);
    else if ((low === "lbl1_02" || low === "leg_bl") && !bones.blUpper) bones.blUpper = captureRiggedBone(obj, model);
    else if (low === "lbl2_03" && !bones.blLower) bones.blLower = captureRiggedBone(obj, model);
    else if ((low === "lbr1_031" || low === "leg_br") && !bones.brUpper) bones.brUpper = captureRiggedBone(obj, model);
    else if (low === "lbr2_032" && !bones.brLower) bones.brLower = captureRiggedBone(obj, model);
    else if (low === "neck2_010" && !bones.neckLower) bones.neckLower = captureRiggedBone(obj, model);
    else if (low === "neck_011" && !bones.neckUpper) bones.neckUpper = captureRiggedBone(obj, model);
    else if ((low === "head_012" || low === "head") && !bones.head) bones.head = captureRiggedBone(obj, model);
    else if ((low === "tail0_025" || low === "tail") && !bones.tail) bones.tail = captureRiggedBone(obj, model);
  });
  return bones;
}

/**
 * Spawns a single cow driven by our dedicated RDR2/GTA-style cow AI & biomechanical gait engine.
 */
export function spawnCowActor(options: {
  tpl: RiggedAnimalTemplate;
  parent: THREE.Object3D;
  fitImportedModel: (model: THREE.Group, targetHeight: number, yawOffset?: number) => THREE.Group;
  terrainHeight: (x: number, z: number) => number;
  x: number;
  z: number;
  pastureRadius: number;
  scaleJitter: number;
  seed: number;
}): CowActor {
  const { tpl, parent, fitImportedModel, terrainHeight, x, z, pastureRadius, scaleJitter, seed } = options;
  const group = new THREE.Group();
  const cloned = cloneSkeleton(tpl.scene) as THREE.Group;
  // Rotate 180 deg (Math.PI) so the dairy cow faces +Z (the exact forward walking direction!)
  const model = fitImportedModel(cloned, 1.36 * scaleJitter, Math.PI);
  model.position.y += 0.035;
  group.add(model);

  const yaw = ((seed * 2.39996) % (Math.PI * 2));
  group.position.set(x, terrainHeight(x, z), z);
  group.rotation.y = yaw;
  parent.add(group);

  // Use ONLY calm standing `idle1` (NEVER `idle2` which sits down and stands back up!)
  let mixer: THREE.AnimationMixer | undefined;
  let idleAction: THREE.AnimationAction | undefined;
  const idle1 = tpl.animations.find((c) => c.name.toLowerCase().includes("idle1"));
  if (idle1) {
    mixer = new THREE.AnimationMixer(model);
    idleAction = mixer.clipAction(idle1);
    idleAction.setLoop(THREE.LoopRepeat, Infinity);
    idleAction.play();
    mixer.update(0.01); // Evaluate rest standing pose before capturing bone axes
  }

  const bones = captureCowBones(model);
  const initialStates: CowState[] = ["graze", "walk_pasture", "stand_ruminate", "graze"];
  const initState = initialStates[seed % initialStates.length];

  return {
    group,
    model,
    bones,
    mixer,
    idleAction,
    anchorX: x,
    anchorZ: z,
    pastureRadius,
    x,
    z,
    vx: 0,
    vz: 0,
    forwardSpeed: 0,
    turnRate: 0,
    yaw,
    pitch: 0,
    grazeBlend: initState === "graze" ? 1 : 0,
    restBlend: 0,
    walkBlend: 0,
    stridePhase: (seed * 1.7) % (Math.PI * 2),
    headLookYaw: 0,
    state: initState,
    stateTimer: 10 + (seed % 7) * 2.5,
    targetX: x + Math.cos(yaw) * (pastureRadius * 0.5),
    targetZ: z + Math.sin(yaw) * (pastureRadius * 0.5),
    grazeStepCooldown: 4 + (seed % 5),
    phaseOffset: seed * 1.37,
    walkSpeed: 0.72 + (seed % 4) * 0.06,
  };
}

/**
 * Per-frame update for all village cows:
 * - Natural unhurried Utility FSM (long grazing, slow pasture walks, cud-chewing, rare smooth resting)
 * - True 4-beat bovine lateral-sequence walk gait (BL -> FL -> BR -> FR) with knee lift
 * - Zero leg inversion / zero disappearing back legs!
 */
export function updateCowHerd(
  cows: CowActor[],
  dt: number,
  elapsed: number,
  clockHour: number,
  playerX: number,
  playerZ: number,
  playerSpeed: number,
  terrainHeight: (x: number, z: number) => number,
  getWaterInfo: (x: number, z: number) => WaterSample,
  distanceToRoad: (x: number, z: number) => number,
  isForbiddenZone?: (x: number, z: number) => boolean,
) {
  const isAfternoonHeat = clockHour >= 13.0 && clockHour <= 15.2;
  const isNight = clockHour < 5.5 || clockHour >= 20.5;

  for (let i = 0; i < cows.length; i++) {
    const c = cows[i];
    const dxP = c.x - playerX;
    const dzP = c.z - playerZ;
    const distP = Math.hypot(dxP, dzP);

    c.stateTimer -= dt;

    // 0. Sanctuary keep-out: if ever inside a forbidden zone (e.g. Kalari), immediately walk back to pasture
    if (isForbiddenZone?.(c.x, c.z)) {
      c.state = "walk_pasture";
      c.stateTimer = Math.max(c.stateTimer, 4.0);
      c.targetX = c.anchorX;
      c.targetZ = c.anchorZ;
    }

    // 1. Startle reflex ONLY if player sprints directly into the cow (calm otherwise!)
    if (distP < 2.8 && playerSpeed > 3.6 && c.state !== "startle_trot") {
      c.state = "startle_trot";
      c.stateTimer = 3.2;
      const nx = dxP / Math.max(distP, 0.05);
      const nz = dzP / Math.max(distP, 0.05);
      const tx = c.x + nx * 5.8;
      const tz = c.z + nz * 5.8;
      if (isForbiddenZone?.(tx, tz)) {
        c.targetX = c.anchorX;
        c.targetZ = c.anchorZ;
      } else {
        c.targetX = tx;
        c.targetZ = tz;
      }
    }

    // 2. Unhurried open-world state transitions (10-35s per activity, never twitchy!)
    if (c.stateTimer <= 0) {
      const r = Math.abs(Math.sin(elapsed * 0.73 + c.phaseOffset * 2.9 + i * 1.13));
      if (isNight || (isAfternoonHeat && r < 0.35)) {
        c.state = "lie_rest";
        c.stateTimer = 28 + r * 20;
      } else if (c.state === "graze") {
        // After grazing one patch for 15-28s, walk slowly to a fresh grass patch!
        c.state = r < 0.68 ? "walk_pasture" : "stand_ruminate";
        c.stateTimer = c.state === "walk_pasture" ? 10 + r * 8 : 10 + r * 8;
        if (c.state === "walk_pasture") {
          // Pick a clean grassy pasture target, preferring a natural forward arc to avoid awkward 180-deg spins
          let fallbackX = c.anchorX;
          let fallbackZ = c.anchorZ;
          for (let attempt = 0; attempt < 10; attempt++) {
            const ang = (elapsed * 0.4 + c.phaseOffset + attempt * 0.72) % (Math.PI * 2);
            const rad = c.pastureRadius * (0.35 + 0.62 * ((attempt * 29 + i * 17) % 100) / 100);
            const tx = c.anchorX + Math.cos(ang) * rad;
            const tz = c.anchorZ + Math.sin(ang) * rad;
            if (!getWaterInfo(tx, tz) && distanceToRoad(tx, tz) > 3.6 && !isForbiddenZone?.(tx, tz)) {
              fallbackX = tx;
              fallbackZ = tz;
              const toTargetYaw = Math.atan2(tx - c.x, tz - c.z);
              if (Math.abs(wrapAngle(toTargetYaw - c.yaw)) < Math.PI * 0.65 || attempt >= 7) {
                c.targetX = tx;
                c.targetZ = tz;
                break;
              }
            }
          }
          if (c.targetX === c.x && c.targetZ === c.z) {
            c.targetX = fallbackX;
            c.targetZ = fallbackZ;
          }
        }
      } else if (c.state === "walk_pasture" || c.state === "startle_trot") {
        c.state = r < 0.78 ? "graze" : "stand_ruminate";
        c.stateTimer = 15 + r * 13;
      } else {
        // From stand_ruminate or lie_rest -> resume grazing or walk to new patch
        c.state = r < 0.55 ? "graze" : "walk_pasture";
        c.stateTimer = c.state === "graze" ? 16 + r * 12 : 9 + r * 7;
        if (c.state === "walk_pasture") {
          c.targetX = c.anchorX;
          c.targetZ = c.anchorZ;
          for (let attempt = 0; attempt < 8; attempt++) {
            const ang = (elapsed * 0.6 + c.phaseOffset * 3.1 + attempt * 0.85) % (Math.PI * 2);
            const tx = c.anchorX + Math.cos(ang) * (c.pastureRadius * 0.65);
            const tz = c.anchorZ + Math.sin(ang) * (c.pastureRadius * 0.65);
            if (!getWaterInfo(tx, tz) && distanceToRoad(tx, tz) > 3.6 && !isForbiddenZone?.(tx, tz)) {
              c.targetX = tx;
              c.targetZ = tz;
              break;
            }
          }
        }
      }
    }

    // 3. Forward-Only Quadruped Ackermann Steering (ZERO crab-sliding or in-place spinning!)
    let steerX = 0;
    let steerZ = 0;
    let targetForwardSpeed = 0;
    let wantsSteer = false;

    if (c.state === "graze" && c.restBlend < 0.05) {
      c.grazeStepCooldown -= dt;
      if (c.grazeStepCooldown <= 0 && c.grazeStepCooldown > -2.2) {
        targetForwardSpeed = 0.22;
      } else if (c.grazeStepCooldown <= -2.2) {
        c.grazeStepCooldown = 5.5 + (i % 4) * 1.8;
      }
    } else if (c.state === "walk_pasture" || c.state === "startle_trot") {
      // Wait until fully stood up before walking
      if (c.restBlend < 0.1) {
        const tx = c.targetX - c.x;
        const tz = c.targetZ - c.z;
        const distT = Math.hypot(tx, tz);
        if (distT < 0.95) {
          c.state = "graze";
          c.stateTimer = 16 + (i % 4) * 3.5;
        } else {
          wantsSteer = true;
          steerX = tx / distT;
          steerZ = tz / distT;
          targetForwardSpeed = c.state === "startle_trot" ? 1.85 : c.walkSpeed;
        }
      }
    }

    // Gentle herd separation blended into steering direction (never sideways slide!)
    for (let j = 0; j < cows.length; j++) {
      if (i === j) continue;
      const o = cows[j];
      const sx = c.x - o.x;
      const sz = c.z - o.z;
      const d = Math.hypot(sx, sz);
      if (d > 0.01 && d < 2.6) {
        const push = (2.6 - d) * 0.55;
        steerX += (sx / d) * push;
        steerZ += (sz / d) * push;
        if (targetForwardSpeed > 0.05) wantsSteer = true;
      }
    }

    // Realistic limited-turn-radius bovine steering: turn smoothly ONLY while stepping forward
    let desiredTurnRate = 0;
    if (wantsSteer && Math.hypot(steerX, steerZ) > 0.05) {
      const desiredHeading = Math.atan2(steerX, steerZ);
      const angleDiff = wrapAngle(desiredHeading - c.yaw);
      const maxTurnRate = c.state === "startle_trot" ? 1.35 : 0.72; // ~41 deg/sec max natural cow arc
      desiredTurnRate = THREE.MathUtils.clamp(angleDiff * 1.35, -maxTurnRate, maxTurnRate);
      // Slow down slightly while curving through a tight arc (just like real cattle)
      const curveSlowdown = THREE.MathUtils.clamp(1 - Math.abs(angleDiff) * 0.38, 0.42, 1.0);
      targetForwardSpeed *= curveSlowdown;
    }

    c.turnRate += (desiredTurnRate - c.turnRate) * Math.min(1, 3.0 * dt);
    const accel = c.state === "startle_trot" ? 3.8 : 1.75;
    c.forwardSpeed += (targetForwardSpeed - c.forwardSpeed) * Math.min(1, accel * dt);

    // Only rotate heading proportionally to forward stepping (prevents tank-pivoting in place)
    const turnGate = THREE.MathUtils.clamp(c.forwardSpeed / 0.28, 0, 1);
    c.yaw = wrapAngle(c.yaw + c.turnRate * turnGate * dt);

    // Move STRICTLY along the cow's forward heading vector
    c.vx = Math.sin(c.yaw) * c.forwardSpeed;
    c.vz = Math.cos(c.yaw) * c.forwardSpeed;

    const nextX = c.x + c.vx * dt;
    const nextZ = c.z + c.vz * dt;
    const nextForbidden = Boolean(isForbiddenZone?.(nextX, nextZ));
    const currentlyForbidden = Boolean(isForbiddenZone?.(c.x, c.z));
    const movingCloserToAnchor =
      Math.hypot(nextX - c.anchorX, nextZ - c.anchorZ) <
      Math.hypot(c.x - c.anchorX, c.z - c.anchorZ);
    if (
      !getWaterInfo(nextX, nextZ) &&
      distanceToRoad(nextX, nextZ) > 2.6 &&
      (!nextForbidden || (currentlyForbidden && movingCloserToAnchor))
    ) {
      c.x = nextX;
      c.z = nextZ;
    } else {
      // Smoothly curve back toward pasture center instead of bouncing backward
      c.forwardSpeed *= 0.4;
      c.targetX = c.anchorX;
      c.targetZ = c.anchorZ;
    }

    const speed = c.forwardSpeed;

    // 4. Smoothly ease state blends (slow 1.4s head dip, slow 2.4s kneel/stand — ZERO instant pops!)
    const targetGraze = c.state === "graze" ? 1 : 0;
    const targetRest = c.state === "lie_rest" ? 1 : 0;
    const targetWalk = THREE.MathUtils.clamp(speed / Math.max(c.walkSpeed, 0.4), 0, 1);
    c.grazeBlend += (targetGraze - c.grazeBlend) * Math.min(1, 1.4 * dt);
    c.restBlend += (targetRest - c.restBlend) * Math.min(1, 0.55 * dt);
    c.walkBlend += (targetWalk - c.walkBlend) * Math.min(1, 4.5 * dt);

    // 5. Terrain grounding + slope pitch + smooth kneel-down drop when resting
    const fwdX = Math.sin(c.yaw) * 0.68;
    const fwdZ = Math.cos(c.yaw) * 0.68;
    const hCenter = terrainHeight(c.x, c.z);
    const hFront = terrainHeight(c.x + fwdX, c.z + fwdZ);
    const hBack = terrainHeight(c.x - fwdX, c.z - fwdZ);
    // Sample max of center & front/back midpoint so hooves never dip underground on hill crests
    const groundY = Math.max(hCenter, (hFront + hBack) * 0.5) + 0.03;
    const slopePitch = THREE.MathUtils.clamp(-Math.atan2(hFront - hBack, 1.36), -0.32, 0.32);
    c.pitch += (slopePitch - c.pitch) * Math.min(1, 4.5 * dt);

    // Smooth subtle stride bob when walking + slow eased drop when lying down
    if (speed > 0.04) {
      c.stridePhase += dt * speed * 4.6;
    }
    const walkBob = Math.abs(Math.sin(c.stridePhase)) * 0.028 * c.walkBlend;
    const kneelDrop = -0.32 * (c.restBlend * c.restBlend * (3 - 2 * c.restBlend));
    const turnRoll = -c.turnRate * 0.06 * c.walkBlend;

    c.group.position.set(c.x, groundY + walkBob + kneelDrop, c.z);
    c.group.rotation.set(c.pitch, c.yaw, Math.sin(c.stridePhase) * 0.022 * c.walkBlend + turnRoll);

    // 6. Skeletal animation: subtle calm breathing from idle1 + Quaternion-Delta 4-beat bovine gait!
    if (c.mixer) {
      c.mixer.update(dt * (0.45 + 0.25 * (1 - c.walkBlend)));
    }

    const b = c.bones;
    // 4-beat bovine lateral-sequence walk phase: BL (0), FL (0.25), BR (0.5), FR (0.75)
    const amp = (c.state === "startle_trot" ? 0.42 : 0.30) * c.walkBlend;
    const phBL = c.stridePhase;
    const phFL = c.stridePhase + Math.PI * 0.5;
    const phBR = c.stridePhase + Math.PI;
    const phFR = c.stridePhase + Math.PI * 1.5;

    // Rest fold when lying down (legs smoothly tuck under belly as restBlend goes 0 -> 1)
    const tuckFront = c.restBlend * 0.85;
    const tuckBack = c.restBlend * 0.72;

    // Apply relative Quaternion-Delta rotations around the cow's true lateral pitch axis
    // (preserves each bone's rest orientation so BACK LEGS NEVER DISAPPEAR!)
    applyBoneOffset(b.flUpper, Math.sin(phFL) * amp - tuckFront * 0.5);
    applyBoneOffset(b.flLower, Math.max(0, -Math.cos(phFL)) * amp * 0.95 + tuckFront * 1.15);

    applyBoneOffset(b.frUpper, Math.sin(phFR) * amp - tuckFront * 0.5);
    applyBoneOffset(b.frLower, Math.max(0, -Math.cos(phFR)) * amp * 0.95 + tuckFront * 1.15);

    applyBoneOffset(b.blUpper, Math.sin(phBL) * amp + tuckBack * 0.45);
    applyBoneOffset(b.blLower, -Math.max(0, -Math.cos(phBL)) * amp * 0.85 - tuckBack * 1.1);

    applyBoneOffset(b.brUpper, Math.sin(phBR) * amp + tuckBack * 0.45);
    applyBoneOffset(b.brLower, -Math.max(0, -Math.cos(phBR)) * amp * 0.85 - tuckBack * 1.1);

    // Grazing head lowering + rhythmic chewing + curious glance toward nearby player
    const chewBob = Math.sin(elapsed * 4.2 + c.phaseOffset) * 0.055 * c.grazeBlend;
    const walkHeadBob = Math.sin(c.stridePhase * 2) * 0.045 * c.walkBlend;
    const neckDip = c.grazeBlend * 0.46 + chewBob + walkHeadBob;

    // Lead turns naturally with the neck & head curving into the direction of travel
    const turnLeadYaw = THREE.MathUtils.clamp(c.turnRate * 0.52 * c.walkBlend, -0.42, 0.42);
    let targetLookYaw =
      Math.sin(elapsed * 0.45 + c.phaseOffset) * 0.14 * (1 - c.grazeBlend) + turnLeadYaw;
    if (distP < 7.5 && c.state === "stand_ruminate") {
      const angToPlayer = wrapAngle(Math.atan2(playerX - c.x, playerZ - c.z) - c.yaw);
      targetLookYaw = THREE.MathUtils.clamp(angToPlayer, -0.55, 0.55);
    }
    c.headLookYaw += (targetLookYaw - c.headLookYaw) * Math.min(1, 2.6 * dt);

    applyBoneOffset(b.spine, 0, turnLeadYaw * 0.18, true);
    applyBoneOffset(b.neckLower, neckDip * 0.55, c.headLookYaw * 0.45);
    applyBoneOffset(b.neckUpper, neckDip * 0.45, c.headLookYaw * 0.35);
    applyBoneOffset(b.head, chewBob * 1.4, c.headLookYaw * 0.25);

    // Natural tail fly-swish (periodic burst swishes, not robotic sine wave)
    const swishBurst = Math.pow(Math.max(0, Math.sin(elapsed * 0.7 + c.phaseOffset)), 6);
    const tailYaw = Math.sin(elapsed * 5.8 + c.phaseOffset) * (0.14 + swishBurst * 0.45);
    applyBoneOffset(b.tail, 0, tailYaw);
  }
}
