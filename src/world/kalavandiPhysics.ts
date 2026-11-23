import * as THREE from "three";

/**
 * Dedicated Kalavandi (18th-Century Kerala Bullock Cart) Physics Engine
 *
 * Handles:
 * 1. Lockstep Cart <-> Kala (Oxen) speed synchronization:
 *    - Realistic draft bullock cruising speed (~1.38 m/s) with smooth inertia
 *      (acceleration/braking) and terrain grade resistance (slower climbing
 *      uphill / gutters, gentler ease downhill).
 *    - Drives the rigged double_ox_walk.glb AnimationMixer in exact proportion
 *      to real ground distance traveled (zero foot sliding).
 * 2. Automatic Halt / Idle when Stopped:
 *    - Whenever the Kalavandi stops (loading, unloading, waiting, parked, or
 *      zero displacement), smoothly decelerates the oxen's walk cycle to 0
 *      and settles them into a calm standing idle (no walking in place).
 * 3. True Rolling-Without-Slipping Wheel Physics:
 *    - Measures actual wheel radius from each wheel mesh (Box3) and rotates
 *      strictly by Δθ = ds / r (zero spin when stationary).
 * 4. 6-Point Ground & Gutter ("Ghatter") Contact Solver:
 *    - Samples left wheel, right wheel, axle center, oxen hind hooves, oxen
 *      center, and oxen front hooves (including bridge decks & road crowns).
 *    - Uses YXZ Euler order to apply smooth damped pitch (rotation.x), roll
 *      (rotation.z), axle height, and pitch-compensated independent oxen
 *      grounding + oxen pitch so neither wheels nor hooves sink or float
 *      across dips, ruts, crests, and gutters.
 */

export const KALAVANDI_CRUISE_SPEED = 1.38; // m/s — authentic Kerala draft ox pace
export const KALAVANDI_LANDLORD_SPEED = 1.48; // m/s — lighter palla passenger cart
const OX_CLIP_BASE_SPEED = 1.38; // m/s corresponding to double_ox_walk.glb timeScale = 1.0

export interface KalavandiCartTarget {
  group: THREE.Group;
  wheels: THREE.Group[];
  horseLegs: THREE.Group[];
  horse: THREE.Group;
  stride: number;
  kalavandi?: KalavandiPhysicsState;
}

export interface KalavandiPhysicsState {
  currentSpeed: number;
  targetSpeed: number;
  pitch: number;
  roll: number;
  oxPitch: number;
  oxAnimRate: number;
  wheelRadius: number;
  axleLocalZ: number;
  halfTrack: number;
  oxLocalZ: number;
  oxMixer?: THREE.AnimationMixer;
  oxAction?: THREE.AnimationAction;
  oxModel?: THREE.Object3D;
  idlePhase: number;
  stopped: boolean;
}

export interface KalavandiTerrainSampler {
  terrainHeight: (x: number, z: number) => number;
  bridgeHeightAt?: (x: number, z: number) => number | undefined;
  distanceToRoad: (x: number, z: number) => number;
}

export function createKalavandiPhysicsState(
  seedPhase = 0,
): KalavandiPhysicsState {
  return {
    currentSpeed: 0,
    targetSpeed: 0,
    pitch: 0,
    roll: 0,
    oxPitch: 0,
    oxAnimRate: 0,
    wheelRadius: 0.72,
    axleLocalZ: 0.48,
    halfTrack: 0.96,
    oxLocalZ: -2.15,
    idlePhase: seedPhase,
    stopped: true,
  };
}

/**
 * Registers the rigged oxen model & its AnimationMixer/Action with a cart's
 * Kalavandi physics state so the physics engine has exclusive control over
 * ox walk speed and stopping.
 */
export function attachKalavandiOxAnimation(
  cart: KalavandiCartTarget,
  oxModel: THREE.Object3D,
  mixer?: THREE.AnimationMixer,
  action?: THREE.AnimationAction,
): void {
  if (!cart.kalavandi) {
    cart.kalavandi = createKalavandiPhysicsState(Math.random() * Math.PI * 2);
  }
  cart.kalavandi.oxModel = oxModel;
  cart.kalavandi.oxMixer = mixer;
  cart.kalavandi.oxAction = action;
  // Ensure YXZ rotation order so yaw -> pitch -> roll compose accurately in world space
  cart.group.rotation.order = "YXZ";
  cart.horse.rotation.order = "YXZ";
}

/**
 * Measures the true outer radius and track/axle geometry of the cart's wheels
 * after Blender GLB upgrade so rolling rotation Δθ = ds / r is exact.
 */
export function calibrateKalavandiWheels(cart: KalavandiCartTarget): void {
  if (!cart.kalavandi) {
    cart.kalavandi = createKalavandiPhysicsState();
  }
  if (cart.wheels.length === 0) return;

  cart.group.updateMatrixWorld(true);
  const invGroup = cart.group.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const localCenter = new THREE.Vector3();

  let radiusSum = 0;
  let radiusCount = 0;
  let zSum = 0;
  let maxAbsX = 0;

  for (const wheel of cart.wheels) {
    box.setFromObject(wheel);
    if (box.isEmpty()) continue;
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.y, size.z) * 0.5;
    if (r > 0.25 && r < 1.35) {
      radiusSum += r;
      radiusCount++;
    }
    box.getCenter(localCenter).applyMatrix4(invGroup);
    zSum += localCenter.z;
    maxAbsX = Math.max(maxAbsX, Math.abs(localCenter.x));
  }

  if (radiusCount > 0) {
    cart.kalavandi.wheelRadius = radiusSum / radiusCount;
    cart.kalavandi.axleLocalZ = THREE.MathUtils.clamp(
      zSum / radiusCount,
      -0.2,
      1.1,
    );
  }
  if (maxAbsX > 0.45 && maxAbsX < 1.5) {
    cart.kalavandi.halfTrack = maxAbsX;
  }
}

/**
 * Samples the exact ground/road/bridge surface height at world (x, z).
 */
function sampleSurfaceY(
  sampler: KalavandiTerrainSampler,
  x: number,
  z: number,
): number {
  const bridgeY = sampler.bridgeHeightAt?.(x, z);
  if (bridgeY !== undefined) return bridgeY + 0.015;
  const baseH = sampler.terrainHeight(x, z);
  const roadDist = sampler.distanceToRoad(x, z);
  // Match the smooth road ribbon lift so wheels & hooves ride cleanly on top of soil
  const roadLift =
    roadDist < 3.6 ? 0.068 * Math.max(0, 1 - Math.max(0, roadDist - 2.2) / 1.4) : 0.01;
  return baseH + roadLift;
}

/**
 * Computes the slope-adjusted Kalavandi travel speed (m/s) for the current frame
 * so callers can advance the path walker at the exact physical ox-pulling speed.
 */
export function computeKalavandiStepSpeed(
  cart: KalavandiCartTarget,
  baseCruiseSpeed: number,
  wantsToMove: boolean,
  dt: number,
  sampler: KalavandiTerrainSampler,
): number {
  if (!cart.kalavandi) {
    cart.kalavandi = createKalavandiPhysicsState();
  }
  const state = cart.kalavandi;

  if (!wantsToMove || dt <= 0) {
    // Smooth braking inertia when coming to a halt
    state.targetSpeed = 0;
    state.currentSpeed = THREE.MathUtils.damp(state.currentSpeed, 0, 5.5, Math.max(dt, 0.001));
    if (state.currentSpeed < 0.025) state.currentSpeed = 0;
    return state.currentSpeed;
  }

  // Sample terrain grade ahead along cart's forward vector (-Z local)
  const rotY = cart.group.rotation.y;
  const fwdX = -Math.sin(rotY);
  const fwdZ = -Math.cos(rotY);
  const wx = cart.group.position.x;
  const wz = cart.group.position.z;
  const hHere = sampleSurfaceY(sampler, wx, wz);
  const hAhead = sampleSurfaceY(sampler, wx + fwdX * 2.4, wz + fwdZ * 2.4);
  const grade = THREE.MathUtils.clamp((hAhead - hHere) / 2.4, -0.35, 0.35);

  // Uphill / climbing out of a gutter slows the oxen; gentle downhill eases slightly
  const gradeMultiplier =
    grade >= 0
      ? THREE.MathUtils.clamp(1.0 - grade * 1.15, 0.58, 1.0)
      : THREE.MathUtils.clamp(1.0 - grade * 0.32, 1.0, 1.12);

  state.targetSpeed = baseCruiseSpeed * gradeMultiplier;
  // Heavy wooden cart accelerates gradually from rest
  const accelRate = state.currentSpeed < state.targetSpeed ? 2.4 : 4.2;
  state.currentSpeed = THREE.MathUtils.damp(
    state.currentSpeed,
    state.targetSpeed,
    accelRate,
    dt,
  );
  return state.currentSpeed;
}

/**
 * Full per-frame Kalavandi physics update:
 * - 6-point terrain/gutter grounding (left wheel, right wheel, axle, oxen hind/center/front)
 * - Smooth damped pitch & roll in YXZ Euler order
 * - Independent pitch-compensated oxen hoof grounding + oxen slope pitch
 * - Exact rolling-without-slipping wheel spin (Δθ = ds / wheelRadius)
 * - Lockstep oxen walk animation speed + clean halt/idle when stopped
 */
export function updateKalavandiPhysics(
  cart: KalavandiCartTarget,
  wx: number,
  wz: number,
  traveled: number,
  dt: number,
  sampler: KalavandiTerrainSampler,
  reducedMotion = false,
): void {
  if (!cart.kalavandi) {
    cart.kalavandi = createKalavandiPhysicsState();
  }
  const state = cart.kalavandi;
  cart.group.rotation.order = "YXZ";
  cart.horse.rotation.order = "YXZ";

  const safeDt = Math.min(Math.max(dt, 0), 0.05);
  const actualSpeed = safeDt > 0.0001 ? traveled / safeDt : 0;
  const isMoving = traveled > 0.0004 && actualSpeed > 0.04;
  state.stopped = !isMoving;

  if (!isMoving) {
    state.currentSpeed = THREE.MathUtils.damp(state.currentSpeed, 0, 8, Math.max(safeDt, 0.001));
    if (state.currentSpeed < 0.02) state.currentSpeed = 0;
  }

  // Forward (-Z local) and Right (+X local) horizontal basis vectors
  const rotY = cart.group.rotation.y;
  const fwdX = -Math.sin(rotY);
  const fwdZ = -Math.cos(rotY);
  const rightX = Math.cos(rotY);
  const rightZ = -Math.sin(rotY);

  // 1. Sample 6 ground contact points across axle & oxen (handles dips & gutters cleanly)
  const axleDistBack = state.axleLocalZ; // local +Z is behind origin
  const axleX = wx - fwdX * axleDistBack;
  const axleZ = wz - fwdZ * axleDistBack;

  const hWheelL = sampleSurfaceY(
    sampler,
    axleX - rightX * state.halfTrack,
    axleZ - rightZ * state.halfTrack,
  );
  const hWheelR = sampleSurfaceY(
    sampler,
    axleX + rightX * state.halfTrack,
    axleZ + rightZ * state.halfTrack,
  );
  const hAxleCenter = sampleSurfaceY(sampler, axleX, axleZ);

  const oxDistFwd = -state.oxLocalZ; // +2.15m in front of cart origin
  const oxX = wx + fwdX * oxDistFwd;
  const oxZ = wz + fwdZ * oxDistFwd;
  const hOxCenter = sampleSurfaceY(sampler, oxX, oxZ);
  const hOxFront = sampleSurfaceY(sampler, oxX + fwdX * 0.7, oxZ + fwdZ * 0.7);
  const hOxHind = sampleSurfaceY(sampler, oxX - fwdX * 0.65, oxZ - fwdZ * 0.65);

  // 2. Compute axle ground contact height (prevents rim burial over gutter crests)
  const wheelAvgY = (hWheelL + hWheelR) * 0.5;
  const wheelDipCompensation = Math.abs(hWheelR - hWheelL) * 0.08;
  const axleGroundY = Math.max(wheelAvgY, hAxleCenter - 0.03) + wheelDipCompensation;

  // 3. Compute & damp cart roll (left vs right wheel across gutter/camber)
  const trackWidth = Math.max(0.8, state.halfTrack * 2);
  const targetRoll = THREE.MathUtils.clamp(
    Math.atan2(hWheelR - hWheelL, trackWidth),
    -0.24,
    0.24,
  );
  state.roll = THREE.MathUtils.damp(state.roll, targetRoll, 7.5, Math.max(safeDt, 0.001));

  // 4. Compute & damp cart pitch (axle to oxen yoke span)
  const wheelbase = oxDistFwd + axleDistBack;
  const oxGroundY = Math.max(hOxCenter, (hOxFront + hOxHind) * 0.5);
  const targetPitch = THREE.MathUtils.clamp(
    Math.atan2(oxGroundY - axleGroundY, wheelbase),
    -0.28,
    0.28,
  );
  state.pitch = THREE.MathUtils.damp(state.pitch, targetPitch, 6.5, Math.max(safeDt, 0.001));

  // 5. Place cart root so wheels at local z = +axleLocalZ stay planted on axleGroundY
  // Under YXZ rotation: worldY(0, 0, z) = groupY - z * sin(pitch)
  const groupY = axleGroundY + state.axleLocalZ * Math.sin(state.pitch);
  cart.group.position.set(wx, groupY, wz);
  cart.group.rotation.x = state.pitch;
  cart.group.rotation.z = state.roll;

  // 6. Ground the oxen independently so hooves touch soil even over sharp dips/gutters
  // Solve groupY + horseY * cos(pitch) - oxLocalZ * sin(pitch) = oxGroundY
  const cosPitch = Math.max(0.5, Math.cos(state.pitch));
  const rawHorseY =
    (oxGroundY - groupY + state.oxLocalZ * Math.sin(state.pitch)) / cosPitch;
  const walkBob =
    isMoving && !reducedMotion
      ? Math.abs(Math.sin(cart.stride * 1.15)) * 0.018 * Math.min(1, actualSpeed / OX_CLIP_BASE_SPEED)
      : 0;
  // Clamp vertical suspension travel so oxen never detach wildly from the yoke bar
  cart.horse.position.y = THREE.MathUtils.clamp(rawHorseY, -0.45, 0.45) + walkBob;

  // Give the oxen their own local slope pitch relative to the cart frame
  const targetOxWorldPitch = THREE.MathUtils.clamp(
    Math.atan2(hOxFront - hOxHind, 1.35),
    -0.32,
    0.32,
  );
  state.oxPitch = THREE.MathUtils.damp(
    state.oxPitch,
    targetOxWorldPitch - state.pitch,
    7.5,
    Math.max(safeDt, 0.001),
  );
  cart.horse.rotation.x = state.oxPitch;
  // Counter-roll slightly so oxen stay upright on their four hooves when one cart wheel hits a rut
  cart.horse.rotation.z = -state.roll * 0.65;

  // 7. Rolling-without-slipping wheel rotation (Δθ = ds / wheelRadius)
  if (isMoving) {
    const wheelAngleDelta = traveled / Math.max(0.35, state.wheelRadius);
    for (const wheel of cart.wheels) {
      if (wheel.userData.spinAxis === "x") {
        wheel.rotateX(wheelAngleDelta);
      } else {
        wheel.rotateZ(-wheelAngleDelta);
      }
    }
  }

  // 8. Synchronize Kala (oxen) rigged walk animation to exact cart speed & stop when halted!
  const targetAnimRate = isMoving
    ? THREE.MathUtils.clamp(actualSpeed / OX_CLIP_BASE_SPEED, 0.15, 1.65)
    : 0;
  state.oxAnimRate = THREE.MathUtils.damp(
    state.oxAnimRate,
    targetAnimRate,
    isMoving ? 9.0 : 12.0,
    Math.max(safeDt, 0.001),
  );

  if (state.oxMixer) {
    if (state.oxAnimRate > 0.015) {
      state.oxMixer.update(safeDt * state.oxAnimRate);
    } else if (state.oxAction) {
      // Stopped: smoothly settle to the nearest grounded neutral stance frame (0 or half-cycle)
      const clipDur = state.oxAction.getClip().duration || 1;
      const tNorm = ((state.oxAction.time % clipDur) + clipDur) % clipDur;
      const half = clipDur * 0.5;
      const distTo0 = Math.min(tNorm, clipDur - tNorm);
      const distToHalf = Math.abs(tNorm - half);
      const targetTime = distTo0 <= distToHalf ? 0 : half;
      const diff = targetTime - tNorm;
      if (Math.abs(diff) > 0.015 && safeDt > 0) {
        const settleStep = Math.sign(diff) * Math.min(Math.abs(diff), safeDt * 0.65);
        state.oxMixer.update(settleStep);
      }
    }
  }

  // Subtle calm breathing sway when oxen are stopped (alive, not frozen statues, zero leg walking)
  if (!isMoving && !reducedMotion && state.oxModel) {
    state.idlePhase += safeDt * 1.4;
    state.oxModel.rotation.z = Math.sin(state.idlePhase) * 0.008;
  } else if (state.oxModel) {
    state.oxModel.rotation.z = THREE.MathUtils.damp(
      state.oxModel.rotation.z,
      0,
      8,
      Math.max(safeDt, 0.001),
    );
  }

  // Fallback for legacy procedural legs (if GLB hasn't loaded yet)
  if (cart.horseLegs.length > 0) {
    cart.horseLegs.forEach((leg, index) => {
      leg.rotation.x = THREE.MathUtils.damp(
        leg.rotation.x,
        isMoving ? Math.sin(cart.stride + index * Math.PI * 0.5) * 0.28 : 0,
        8,
        Math.max(safeDt, 0.001),
      );
    });
  }
}
