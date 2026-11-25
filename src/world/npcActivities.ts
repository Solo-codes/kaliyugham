import * as THREE from "three";

export type NpcActivityKind =
  | "none"
  | "beedi_smoke"
  | "wipe_sweat"
  | "look_around"
  | "stretch_rest"
  | "playful_sprint";

export type BeediStage = "reach" | "strike_match" | "throw_match" | "puff" | "done";

export type NpcActivityActor = {
  host: THREE.Object3D;
  model: THREE.Group;
  archetype: string;
  isMatureMan: boolean;
  isChild: boolean;
  rightHand?: THREE.Object3D;
  leftHand?: THREE.Object3D;
  headBone?: THREE.Object3D;
  rightUpperArm?: THREE.Object3D;
  rightForearm?: THREE.Object3D;
  leftUpperArm?: THREE.Object3D;
  leftForearm?: THREE.Object3D;
  // Activity state
  active: NpcActivityKind;
  timer: number;
  duration: number;
  cooldown: number;
  // Beedi props (lazily created for mature men)
  beediGroup?: THREE.Group;
  emberMat?: THREE.MeshBasicMaterial;
  matchGroup?: THREE.Group;
  flameMesh?: THREE.Mesh;
  thrownMatch?: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number };
  smokeTimer: number;
};

type SmokePuff = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
  maxAge: number;
};

const smokeGeo = new THREE.SphereGeometry(0.032, 7, 6);
const smokeMatBase = new THREE.MeshBasicMaterial({
  color: "#d9d6cf",
  transparent: true,
  opacity: 0.48,
  depthWrite: false,
});
const beediPaperMat = new THREE.MeshStandardMaterial({ color: "#7a6345", roughness: 0.92 });
const beediThreadMat = new THREE.MeshStandardMaterial({ color: "#b53528", roughness: 0.85 });
const matchStickMat = new THREE.MeshStandardMaterial({ color: "#c9a875", roughness: 0.9 });
const matchTipMat = new THREE.MeshStandardMaterial({ color: "#7c261c", roughness: 0.8 });
const flameMat = new THREE.MeshBasicMaterial({ color: "#ff9b28" });

const activeSmokePuffs: SmokePuff[] = [];

/**
 * Finds a bone in a Three.js GLTF skeleton regardless of dot-sanitization (e.g. "wrist.R" -> "wristR").
 */
export function findRigBone(root: THREE.Object3D, candidates: string[]): THREE.Object3D | undefined {
  const lowered = candidates.map((c) => c.toLowerCase());
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (found) return;
    const n = obj.name.toLowerCase();
    for (const cand of lowered) {
      if (n === cand || n === cand.replace(".", "")) {
        found = obj;
        return;
      }
    }
  });
  if (found) return found;
  root.traverse((obj) => {
    if (found) return;
    const n = obj.name.toLowerCase();
    for (const cand of lowered) {
      const stripped = cand.replace(".", "");
      if (n.includes(stripped)) {
        found = obj;
        return;
      }
    }
  });
  return found;
}

export function createNpcActivityActor(
  host: THREE.Object3D,
  model: THREE.Group,
  key: string,
  seed: number,
): NpcActivityActor {
  const isMatureMan =
    key === "npc_villager_man" ||
    key === "npc_farmer_man" ||
    key === "npc_fisherman" ||
    key === "npc_elder_man";
  const isChild = key === "npc_boy" || key === "npc_girl";

  const actor: NpcActivityActor = {
    host,
    model,
    archetype: key,
    isMatureMan,
    isChild,
    rightHand: findRigBone(model, ["wrist.R", "wristR", "hand.R"]),
    leftHand: findRigBone(model, ["wrist.L", "wristL", "hand.L"]),
    headBone: findRigBone(model, ["head"]),
    rightUpperArm: findRigBone(model, ["upperarm01.R", "upperarm01R", "upperarm.R"]),
    rightForearm: findRigBone(model, ["lowerarm01.R", "lowerarm01R", "lowerarm.R"]),
    leftUpperArm: findRigBone(model, ["upperarm01.L", "upperarm01L", "upperarm.L"]),
    leftForearm: findRigBone(model, ["lowerarm01.L", "lowerarm01L", "lowerarm.L"]),
    active: "none",
    timer: 0,
    duration: 0,
    cooldown: 6 + ((seed * 7.3) % 18),
    smokeTimer: 0,
  };

  if (isMatureMan && actor.rightHand && actor.leftHand) {
    const invScale = 1 / Math.max(model.scale.x, 0.001);

    // Rolled Kerala Beedi (tendu leaf cone + red thread tie + glowing ember tip)
    const beedi = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.003, 0.068, 7), beediPaperMat);
    body.rotation.x = Math.PI / 2;
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0036, 0.0036, 0.006, 7), beediThreadMat);
    thread.rotation.x = Math.PI / 2;
    thread.position.z = -0.022;
    const emberMat = new THREE.MeshBasicMaterial({ color: "#3d2e24" });
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.0052, 6, 5), emberMat);
    ember.position.z = 0.036;
    beedi.add(body, thread, ember);
    beedi.position.set(0, 0.04, 0.02);
    beedi.scale.setScalar(invScale);
    beedi.visible = false;
    actor.rightHand.add(beedi);
    actor.beediGroup = beedi;
    actor.emberMat = emberMat;

    // Wooden matchstick + brief strike flame in left hand
    const match = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0035, 0.046), matchStickMat);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 5), matchTipMat);
    tip.position.z = 0.024;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.015, 7, 6), flameMat);
    flame.scale.set(0.7, 1.45, 0.7);
    flame.position.set(0, 0.012, 0.026);
    flame.visible = false;
    match.add(stick, tip, flame);
    match.position.set(0, 0.04, 0.02);
    match.scale.setScalar(invScale);
    match.visible = false;
    actor.leftHand.add(match);
    actor.matchGroup = match;
    actor.flameMesh = flame;
  }

  return actor;
}

/** Returns true if the NPC should pause walking while performing a stationary activity (like lighting/smoking a beedi). */
export function isNpcPausedForActivity(actor: NpcActivityActor): boolean {
  return (
    actor.active === "beedi_smoke" ||
    actor.active === "wipe_sweat" ||
    actor.active === "look_around" ||
    actor.active === "stretch_rest"
  );
}

/** Returns true if the NPC is currently in a playful sprint burst (for children). */
export function isNpcSprinting(actor: NpcActivityActor): boolean {
  return actor.active === "playful_sprint";
}

function spawnSmokePuff(scene: THREE.Scene, origin: THREE.Vector3) {
  if (activeSmokePuffs.length > 40) return;
  const mat = smokeMatBase.clone();
  const mesh = new THREE.Mesh(smokeGeo, mat);
  mesh.position.copy(origin);
  mesh.scale.setScalar(0.55);
  scene.add(mesh);
  activeSmokePuffs.push({
    mesh,
    vel: new THREE.Vector3(
      (Math.random() - 0.5) * 0.14,
      0.34 + Math.random() * 0.14,
      (Math.random() - 0.5) * 0.14,
    ),
    age: 0,
    maxAge: 2.1 + Math.random() * 0.8,
  });
}

/**
 * Advances all NPC daily realism activities (beedi lighting/throwing match/smoking, wiping sweat,
 * stretching, looking around, child sprints) and smoke/thrown-match physics.
 */
export function updateNpcActivities(
  actors: NpcActivityActor[],
  scene: THREE.Scene,
  terrainHeightFn: (x: number, z: number) => number,
  delta: number,
  elapsed: number,
  isNight: boolean,
) {
  const step = Math.min(delta, 0.05);

  // Update drifting beedi smoke puffs
  for (let i = activeSmokePuffs.length - 1; i >= 0; i--) {
    const p = activeSmokePuffs[i];
    p.age += step;
    if (p.age >= p.maxAge) {
      scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
      activeSmokePuffs.splice(i, 1);
      continue;
    }
    const u = p.age / p.maxAge;
    p.mesh.position.addScaledVector(p.vel, step);
    p.mesh.position.x += Math.sin(elapsed * 1.8 + i) * 0.05 * step;
    p.mesh.scale.setScalar(0.55 + u * 2.4);
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - u);
  }

  for (let i = 0; i < actors.length; i++) {
    const a = actors[i];

    // Update any thrown spent matchstick falling to the ground
    if (a.thrownMatch) {
      const tm = a.thrownMatch;
      tm.life -= step;
      tm.vel.y -= 6.8 * step;
      tm.mesh.position.addScaledVector(tm.vel, step);
      tm.mesh.rotation.x += 5.0 * step;
      tm.mesh.rotation.z += 3.5 * step;
      const groundY = terrainHeightFn(tm.mesh.position.x, tm.mesh.position.z) + 0.015;
      if (tm.mesh.position.y < groundY) {
        tm.mesh.position.y = groundY;
        tm.vel.set(0, 0, 0);
      }
      if (tm.life <= 0) {
        scene.remove(tm.mesh);
        a.thrownMatch = undefined;
      }
    }

    if (!a.host.visible || isNight) continue;

    if (a.active === "none") {
      a.cooldown -= step;
      if (a.cooldown <= 0) {
        // Trigger a character-appropriate realistic activity
        const r = Math.abs(Math.sin(elapsed * 1.7 + i * 13.37));
        if (a.isMatureMan && a.beediGroup && r < 0.48) {
          a.active = "beedi_smoke";
          a.timer = 0;
          a.duration = 11.5;
          a.smokeTimer = 0;
          a.beediGroup.visible = true;
          if (a.emberMat) a.emberMat.color.set("#3d2e24");
          if (a.matchGroup) a.matchGroup.visible = false;
          if (a.flameMesh) a.flameMesh.visible = false;
        } else if (a.isChild && r < 0.65) {
          a.active = "playful_sprint";
          a.timer = 0;
          a.duration = 4.5 + (i % 3);
        } else if (r < 0.72) {
          a.active = "wipe_sweat";
          a.timer = 0;
          a.duration = 3.2;
        } else {
          a.active = "look_around";
          a.timer = 0;
          a.duration = 4.0;
        }
      }
      continue;
    }

    a.timer += step;
    const t = a.timer;

    if (a.active === "beedi_smoke") {
      // Staged beedi smoking sequence (zero fighting arm-bone overrides — skeleton stays smooth!):
      if (t < 1.6) {
        if (a.emberMat) a.emberMat.color.set("#3d2e24");
      } else if (t < 3.6) {
        if (a.matchGroup) a.matchGroup.visible = true;
        const lit = t > 2.05;
        if (a.flameMesh) {
          a.flameMesh.visible = lit;
          if (lit) a.flameMesh.scale.setScalar(0.85 + Math.sin(elapsed * 32) * 0.22);
        }
        if (t > 2.8 && a.emberMat) a.emberMat.color.set("#ff6a1a");
      } else if (t < 4.3) {
        if (a.matchGroup && a.matchGroup.visible) {
          a.matchGroup.visible = false;
          if (a.flameMesh) a.flameMesh.visible = false;
          const worldPos = new THREE.Vector3();
          a.leftHand?.getWorldPosition(worldPos);
          const dropped = new THREE.Mesh(
            new THREE.BoxGeometry(0.005, 0.005, 0.055),
            matchStickMat,
          );
          dropped.position.copy(worldPos);
          scene.add(dropped);
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(a.host.quaternion);
          const side = new THREE.Vector3(-1, 0, 0).applyQuaternion(a.host.quaternion);
          a.thrownMatch = {
            mesh: dropped,
            vel: fwd.multiplyScalar(0.55).addScaledVector(side, 0.65).add(new THREE.Vector3(0, 0.9, 0)),
            life: 4.5,
          };
        }
      } else if (t < 10.8) {
        const puffWave = Math.sin((t - 4.3) * 2.6);
        const raising = Math.max(0, puffWave);
        if (a.emberMat) {
          a.emberMat.color.set(raising > 0.5 ? "#ff7c24" : "#b84414");
        }
        a.smokeTimer -= step;
        if (a.smokeTimer <= 0 && raising < 0.25 && a.headBone) {
          const mouthPos = new THREE.Vector3();
          a.headBone.getWorldPosition(mouthPos);
          mouthPos.y += 0.02;
          spawnSmokePuff(scene, mouthPos);
          a.smokeTimer = 0.48;
        }
      }
    } else if (a.active === "wipe_sweat") {
      if (a.headBone) a.headBone.rotation.y = Math.sin(t * 2.5) * 0.14;
    } else if (a.active === "look_around") {
      if (a.headBone) a.headBone.rotation.y = Math.sin((t / a.duration) * Math.PI * 2) * 0.36;
    }

    if (a.timer >= a.duration) {
      a.active = "none";
      a.timer = 0;
      a.cooldown = 16 + ((i * 5.7 + elapsed * 3.1) % 24);
      if (a.headBone) a.headBone.rotation.y = 0;
      if (a.beediGroup) a.beediGroup.visible = false;
      if (a.matchGroup) a.matchGroup.visible = false;
      if (a.flameMesh) a.flameMesh.visible = false;
    }
  }
}
