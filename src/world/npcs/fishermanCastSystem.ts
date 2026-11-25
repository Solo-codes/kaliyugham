import * as THREE from "three";

/**
 * 18th-Century Kerala Bamboo-Rod Fishing (Choonda) & Paddled Vallam (Thoni) Engine
 *
 * Driven directly by real Mixamo animations:
 * - `Fishing Cast.fbx` + `Fishing Idle.fbx` for riverbank bamboo-rod angling (Choonda)
 *   with a realistic tapered bamboo pole, live fishing line, bobbing palm-pith float
 *   (Pongu), and gentle nibble ripples on the river surface.
 * - `Paddling.fbx` for gliding a traditional Anjili-wood Kerala Vallam canoe smoothly
 *   along the village river with a two-handed carved wooden Thuzha paddle, wave buoyancy,
 *   and stroke-synced water ripples.
 */

export type FishermanActivityMode = "rod_fishing" | "vallam_paddling";

export interface FishermanRodRig {
  mode: "rod_fishing";
  rodGroup: THREE.Group;
  rodTipLocal: THREE.Vector3;
  line: THREE.Line;
  floatMesh: THREE.Group;
  rippleRing: THREE.Mesh;
  castTargetX: number;
  castTargetZ: number;
  cycleOffset: number;
  castDuration: number;
  idleDuration: number;
  splashAge: number;
  wasCasting: boolean;
  rightHandBone?: THREE.Bone;
  leftHandBone?: THREE.Bone;
}

export interface FishermanPaddleRig {
  mode: "vallam_paddling";
  vallamGroup: THREE.Group;
  paddleGroup: THREE.Group;
  route: readonly [number, number][];
  routeProgress: number; // continuous 0..route.length-1
  routeDir: 1 | -1;
  speed: number; // m/s along river
  yaw: number;
  phaseOffset: number;
  rightHandBone?: THREE.Bone;
  leftHandBone?: THREE.Bone;
}

export type FishermanActionRig = FishermanRodRig | FishermanPaddleRig;

const _vRight = new THREE.Vector3();
const _vLeft = new THREE.Vector3();
const _vDir = new THREE.Vector3();
const _vTip = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

function findBoneByNames(root: THREE.Object3D, names: string[]): THREE.Bone | undefined {
  let found: THREE.Bone | undefined;
  const targets = names.map((n) => n.toLowerCase());
  root.traverse((obj) => {
    if (!found && obj instanceof THREE.Bone && targets.includes(obj.name.toLowerCase())) {
      found = obj;
    }
  });
  return found;
}

/** Traditional 2.45m tapered Kerala bamboo fishing rod (Choonda), origin at butt/grip along +Y. */
function createBambooFishingRod(): { group: THREE.Group; tipLocal: THREE.Vector3 } {
  const g = new THREE.Group();
  g.name = "kerala_choonda_rod";
  const bambooMat = new THREE.MeshStandardMaterial({ color: 0x8d723a, roughness: 0.72 });
  const nodeMat = new THREE.MeshStandardMaterial({ color: 0x57431f, roughness: 0.85 });
  const wrapMat = new THREE.MeshStandardMaterial({ color: 0x4b2e19, roughness: 0.9 });

  const rodLen = 2.45;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0125, rodLen, 10), bambooMat);
  shaft.position.set(0, rodLen * 0.5 - 0.14, 0);
  shaft.castShadow = true;
  g.add(shaft);

  // Coir grip wrap at handle
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0138, 0.0135, 0.24, 10), wrapMat);
  grip.position.set(0, 0.04, 0);
  g.add(grip);

  // Authentic bamboo internode rings tapering up the rod
  for (const ny of [0.35, 0.72, 1.12, 1.54, 1.92]) {
    const r = THREE.MathUtils.lerp(0.012, 0.0045, ny / rodLen);
    const node = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0014, 6, 10), nodeMat);
    node.rotation.x = Math.PI * 0.5;
    node.position.set(0, ny, 0);
    g.add(node);
  }

  return { group: g, tipLocal: new THREE.Vector3(0, rodLen - 0.14, 0) };
}

/** Traditional carved Anjili-wood Kerala Vallam rowing paddle (Thuzha), origin at mid-shaft along +Y. */
function createKeralaThuzhaPaddle(): THREE.Group {
  const g = new THREE.Group();
  g.name = "kerala_thuzha_paddle";
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c371c, roughness: 0.72 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3b2110, roughness: 0.8 });

  // Tapered shaft: y = -0.82 (blade neck) .. +0.72 (top T-grip)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 1.52, 10), woodMat);
  shaft.position.set(0, -0.05, 0);
  shaft.castShadow = true;
  g.add(shaft);

  // Top palm grip knob
  const topKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.11, 8), darkWoodMat);
  topKnob.rotation.z = Math.PI * 0.5;
  topKnob.position.set(0, 0.71, 0);
  g.add(topKnob);

  // Broad leaf-shaped Kerala paddle blade dipping into the river (-Y end)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.48, 0.018), darkWoodMat);
  blade.position.set(0, -0.98, 0);
  blade.castShadow = true;
  g.add(blade);

  return g;
}

export function createFishermanRodRig(options: {
  scene: THREE.Scene;
  modelRoot: THREE.Object3D;
  castTargetX: number;
  castTargetZ: number;
  waterSurfaceY: number;
  cycleOffset: number;
}): FishermanRodRig {
  const { scene, modelRoot, castTargetX, castTargetZ, waterSurfaceY, cycleOffset } = options;
  const { group: rodGroup, tipLocal } = createBambooFishingRod();
  scene.add(rodGroup);

  // Fine catenary fishing line from bamboo tip to floating Pongu bobber
  const lineVerts = new Float32Array(12 * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(lineVerts, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: 0xd9d2c0, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(lineGeo, lineMat);
  line.frustumCulled = false;
  scene.add(line);

  // Traditional red-and-cream palm-pith float (Pongu)
  const floatMesh = new THREE.Group();
  const topBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xb83324, roughness: 0.6 }),
  );
  topBulb.scale.set(0.85, 1.35, 0.85);
  topBulb.position.y = 0.018;
  const botBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xe6dcc5, roughness: 0.75 }),
  );
  botBulb.position.y = -0.014;
  floatMesh.add(topBulb, botBulb);
  floatMesh.position.set(castTargetX, waterSurfaceY, castTargetZ);
  scene.add(floatMesh);

  // Translucent water ripple ring around the bobber
  const ringGeo = new THREE.RingGeometry(0.82, 1.0, 28);
  ringGeo.rotateX(-Math.PI * 0.5);
  const rippleRing = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: 0xe8f4f2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  rippleRing.position.set(castTargetX, waterSurfaceY + 0.025, castTargetZ);
  rippleRing.visible = false;
  scene.add(rippleRing);

  return {
    mode: "rod_fishing",
    rodGroup,
    rodTipLocal: tipLocal,
    line,
    floatMesh,
    rippleRing,
    castTargetX,
    castTargetZ,
    cycleOffset,
    castDuration: 2.5,
    idleDuration: 10.5,
    splashAge: 99,
    wasCasting: false,
    rightHandBone: findBoneByNames(modelRoot, ["mixamorigRightHandMiddle1", "mixamorigRightHand"]),
    leftHandBone: findBoneByNames(modelRoot, ["mixamorigLeftHandMiddle1", "mixamorigLeftHand"]),
  };
}

export function createFishermanPaddleRig(options: {
  scene: THREE.Scene;
  modelRoot: THREE.Object3D;
  vallamGroup: THREE.Group;
  route: readonly [number, number][];
  speed?: number;
  phaseOffset?: number;
}): FishermanPaddleRig {
  const { scene, modelRoot, vallamGroup, route, speed = 1.05, phaseOffset = 0 } = options;
  const paddleGroup = createKeralaThuzhaPaddle();
  scene.add(paddleGroup);

  const dx = route[1][0] - route[0][0];
  const dz = route[1][1] - route[0][1];
  const initialYaw = Math.atan2(dx, dz);

  return {
    mode: "vallam_paddling",
    vallamGroup,
    paddleGroup,
    route,
    routeProgress: 0.45,
    routeDir: 1,
    speed,
    yaw: initialYaw,
    phaseOffset,
    rightHandBone: findBoneByNames(modelRoot, ["mixamorigRightHandMiddle1", "mixamorigRightHand"]),
    leftHandBone: findBoneByNames(modelRoot, ["mixamorigLeftHandMiddle1", "mixamorigLeftHand"]),
  };
}

/**
 * Updates a riverbank bamboo-rod fisherman using `Fishing Cast.fbx` and `Fishing Idle.fbx`.
 * Returns which Mixamo animation key should be playing this frame ("fishingCast" | "fishingIdle").
 */
export function updateFishermanRodRig(
  rig: FishermanRodRig,
  actorRoot: THREE.Group,
  actorYaw: number,
  elapsed: number,
  dt: number,
  waterSurfaceYAt: (x: number, z: number) => number,
): "fishingCast" | "fishingIdle" {
  const totalCycle = rig.castDuration + rig.idleDuration;
  const cycle = (((elapsed + rig.cycleOffset) % totalCycle) + totalCycle) % totalCycle;
  const isCasting = cycle < rig.castDuration;

  if (!isCasting && rig.wasCasting) {
    rig.splashAge = 0;
  } else {
    rig.splashAge += dt;
  }
  rig.wasCasting = isCasting;

  actorRoot.updateMatrixWorld(true);
  if (rig.rightHandBone) {
    rig.rightHandBone.getWorldPosition(_vRight);
  } else {
    _vRight.set(actorRoot.position.x, actorRoot.position.y + 1.05, actorRoot.position.z);
  }
  if (rig.leftHandBone) {
    rig.leftHandBone.getWorldPosition(_vLeft);
  } else {
    _vLeft.copy(_vRight);
  }

  // Orient the bamboo rod cleanly through the fisherman's grip out over the river
  const fwdX = Math.sin(actorYaw);
  const fwdZ = Math.cos(actorYaw);
  const castSwingPitch = isCasting
    ? Math.sin((cycle / rig.castDuration) * Math.PI) * 0.45
    : Math.sin(elapsed * 1.4 + rig.cycleOffset) * 0.03;
  _vDir.set(fwdX * 0.85, 0.52 + castSwingPitch, fwdZ * 0.85).normalize();

  rig.rodGroup.position.copy(_vRight);
  rig.rodGroup.quaternion.setFromUnitVectors(_UP, _vDir);
  rig.rodGroup.updateMatrixWorld(true);

  _vTip.copy(rig.rodTipLocal);
  rig.rodGroup.localToWorld(_vTip);

  const waterY = waterSurfaceYAt(rig.castTargetX, rig.castTargetZ);
  const nibble =
    !isCasting && Math.sin(elapsed * 2.1 + rig.cycleOffset) > 0.72
      ? Math.sin(elapsed * 14.0) * 0.035
      : Math.sin(elapsed * 2.2 + rig.cycleOffset) * 0.012;

  const castFrac = isCasting ? THREE.MathUtils.clamp(cycle / rig.castDuration, 0, 1) : 1;
  const floatX = isCasting && castFrac < 0.55
    ? _vTip.x
    : THREE.MathUtils.lerp(_vTip.x, rig.castTargetX, isCasting ? (castFrac - 0.55) / 0.45 : 1);
  const floatZ = isCasting && castFrac < 0.55
    ? _vTip.z
    : THREE.MathUtils.lerp(_vTip.z, rig.castTargetZ, isCasting ? (castFrac - 0.55) / 0.45 : 1);
  const floatY = isCasting && castFrac < 0.55
    ? _vTip.y - 0.35
    : isCasting
      ? THREE.MathUtils.lerp(_vTip.y - 0.2, waterY, (castFrac - 0.55) / 0.45) +
        Math.sin(((castFrac - 0.55) / 0.45) * Math.PI) * 0.55
      : waterY + nibble;

  rig.floatMesh.position.set(floatX, floatY, floatZ);

  // Update catenary fishing line from rod tip to bobber
  const attr = rig.line.geometry.attributes.position as THREE.BufferAttribute;
  const sagAmt = isCasting ? 0.06 : 0.14;
  for (let i = 0; i < attr.count; i++) {
    const f = i / (attr.count - 1);
    const sag = Math.sin(Math.PI * f) * sagAmt;
    attr.setXYZ(
      i,
      THREE.MathUtils.lerp(_vTip.x, floatX, f),
      THREE.MathUtils.lerp(_vTip.y, floatY, f) - sag,
      THREE.MathUtils.lerp(_vTip.z, floatZ, f),
    );
  }
  attr.needsUpdate = true;

  // Expanding splash/nibble ripple ring on the river
  const rMat = rig.rippleRing.material as THREE.MeshBasicMaterial;
  if (rig.splashAge < 1.8) {
    const k = rig.splashAge / 1.8;
    rig.rippleRing.visible = true;
    rig.rippleRing.position.set(rig.castTargetX, waterY + 0.025, rig.castTargetZ);
    const s = 0.15 + k * 0.85;
    rig.rippleRing.scale.set(s, 1, s);
    rMat.opacity = (1 - k) * (1 - k) * 0.5;
  } else if (!isCasting) {
    const pulse = (elapsed * 0.65 + rig.cycleOffset) % 1.0;
    rig.rippleRing.visible = true;
    rig.rippleRing.position.set(rig.castTargetX, waterY + 0.025, rig.castTargetZ);
    const s = 0.08 + pulse * 0.42;
    rig.rippleRing.scale.set(s, 1, s);
    rMat.opacity = (1 - pulse) * 0.24;
  } else {
    rig.rippleRing.visible = false;
  }

  return isCasting ? "fishingCast" : "fishingIdle";
}

/**
 * Glides the Kerala Vallam smoothly along its river route in sync with `Paddling.fbx`,
 * seating the fisherman on the canoe thwart and aligning his wooden Thuzha paddle through both hands.
 */
export function updateFishermanPaddleRig(
  rig: FishermanPaddleRig,
  actorRoot: THREE.Group,
  elapsed: number,
  dt: number,
  waterSurfaceYAt: (x: number, z: number) => number,
): { x: number; z: number; yaw: number } {
  const maxIdx = rig.route.length - 1;
  const segIdx = THREE.MathUtils.clamp(Math.floor(rig.routeProgress), 0, maxIdx - 1);
  const p0 = rig.route[segIdx];
  const p1 = rig.route[segIdx + 1];
  const segLen = Math.max(0.5, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));

  // Subtle realistic paddle-stroke forward surge
  const strokeSurge = 0.85 + 0.25 * Math.max(0, Math.sin(elapsed * 2.8 + rig.phaseOffset));
  rig.routeProgress += (rig.routeDir * rig.speed * strokeSurge * dt) / segLen;

  if (rig.routeProgress >= maxIdx) {
    rig.routeProgress = maxIdx;
    rig.routeDir = -1;
  } else if (rig.routeProgress <= 0) {
    rig.routeProgress = 0;
    rig.routeDir = 1;
  }

  const curSeg = THREE.MathUtils.clamp(Math.floor(rig.routeProgress), 0, maxIdx - 1);
  const t = rig.routeProgress - curSeg;
  const a = rig.route[curSeg];
  const b = rig.route[curSeg + 1];
  const x = THREE.MathUtils.lerp(a[0], b[0], t);
  const z = THREE.MathUtils.lerp(a[1], b[1], t);

  const dirX = (b[0] - a[0]) * rig.routeDir;
  const dirZ = (b[1] - a[1]) * rig.routeDir;
  const targetYaw = Math.atan2(dirX, dirZ);
  let diff = (targetYaw - rig.yaw + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  diff -= Math.PI;
  rig.yaw += diff * Math.min(1, dt * 1.8);

  const wy = waterSurfaceYAt(x, z);
  const waveBob = Math.sin(elapsed * 1.6 + rig.phaseOffset) * 0.024;
  const strokeRoll = Math.sin(elapsed * 2.8 + rig.phaseOffset) * 0.032;
  const wavePitch = Math.cos(elapsed * 1.1 + rig.phaseOffset) * 0.015;

  rig.vallamGroup.position.set(x, wy - 0.14 + waveBob, z);
  rig.vallamGroup.rotation.set(wavePitch, rig.yaw, strokeRoll);

  // Position paddler slightly aft on the Vallam's wooden bench thwart facing forward
  const backX = -Math.sin(rig.yaw) * 0.45;
  const backZ = -Math.cos(rig.yaw) * 0.45;
  actorRoot.position.set(x + backX, wy - 0.16 + waveBob, z + backZ);
  actorRoot.rotation.set(0, rig.yaw, strokeRoll * 0.6);
  actorRoot.updateMatrixWorld(true);

  // Two-handed wooden Thuzha paddle solver (shaft runs dead-center through both hands!)
  if (rig.rightHandBone && rig.leftHandBone) {
    rig.rightHandBone.getWorldPosition(_vRight);
    rig.leftHandBone.getWorldPosition(_vLeft);
    // Point +Y from lower hand toward upper hand so blade (-Y) dips down into the river!
    if (_vRight.y >= _vLeft.y) {
      _vDir.subVectors(_vRight, _vLeft);
    } else {
      _vDir.subVectors(_vLeft, _vRight);
    }
    if (_vDir.lengthSq() > 0.01) {
      _vDir.normalize();
      rig.paddleGroup.position.lerpVectors(_vRight, _vLeft, 0.5);
      rig.paddleGroup.quaternion.setFromUnitVectors(_UP, _vDir);
      rig.paddleGroup.visible = true;
    }
  } else {
    rig.paddleGroup.visible = false;
  }

  return { x: x + backX, z: z + backZ, yaw: rig.yaw };
}
