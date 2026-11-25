import * as THREE from "three";

export type KalariCombatAnimKey =
  | "ginga"
  | "chapa1"
  | "chapa2"
  | "flyingKick1"
  | "flyingKick2"
  | "martelo"
  | "legSweep"
  | "macaco"
  | "fistFight"
  | "headbutt"
  | "swordDraw"
  | "swordSheathe"
  | "swordInward"
  | "swordOutward"
  | "swordFight"
  | "swordShieldKick"
  | "staffThrust"
  | "block"
  | "dodge"
  | "hitReact"
  | "takePunch"
  | "facePunchReact";

export const KALARI_COMBAT_ANIM_FILES: Record<KalariCombatAnimKey, string> = {
  ginga: "Ginga Variation 3.fbx",
  chapa1: "Chapa-Giratoria.fbx",
  chapa2: "Chapa Giratoria 2.fbx",
  flyingKick1: "Flying Kick.fbx",
  flyingKick2: "Flying Kick_2.fbx",
  martelo: "Martelo 2.fbx",
  legSweep: "Leg Sweep.fbx",
  macaco: "Macaco Side.fbx",
  fistFight: "Fist Fight B.fbx",
  headbutt: "Headbutt.fbx",
  swordDraw: "Withdrawing Sword.fbx",
  swordSheathe: "Sheathing Sword.fbx",
  swordInward: "Stable Sword Inward Slash.fbx",
  swordOutward: "Stable Sword Outward Slash.fbx",
  swordFight: "Sword Fight One.fbx",
  swordShieldKick: "Sword And Shield Kick.fbx",
  staffThrust: "Bayonet Stab.fbx",
  block: "Inward Block.fbx",
  dodge: "Esquiva 5.fbx",
  hitReact: "Hit Reaction.fbx",
  takePunch: "Taking Punch.fbx",
  facePunchReact: "Receive Punch To The Face.fbx",
};

export type KalariTrainingRole =
  | "unarmed_spar"
  | "sword_spar"
  | "solo_acrobatics"
  | "staff_drill";

export interface KalariAppearanceVariant {
  skinTint: number;
  lowerColorHex: number;
  sashColorHex: number;
  shoulderWidthMul: number;
  headbandColor?: number;
  hasKudumaBun?: boolean;
  tilakKind?: "bhasmam" | "kumkum" | "chandanam";
  wristWrapColor?: number;
}

export interface KalariCombatState {
  role: KalariTrainingRole;
  anchorX: number;
  anchorZ: number;
  homeYaw: number;
  partnerId?: string;
  isPairLeader: boolean;
  phase: "stance" | "attack" | "react_wait" | "react" | "draw" | "sheathe" | "salute";
  phaseTimer: number;
  reactionDelay: number;
  pendingReaction: KalariCombatAnimKey;
  currentMove: KalariCombatAnimKey;
  attackerTurn: boolean;
  roundCount: number;
  moveSeqIdx: number;
}

interface AttackReactionSpec {
  attack: KalariCombatAnimKey;
  reactions: KalariCombatAnimKey[];
  impactDelay: number; // seconds after attack start when defender triggers reaction
  duration: number; // total exchange window in seconds
}

const UNARMED_EXCHANGES: readonly AttackReactionSpec[] = [
  { attack: "chapa1", reactions: ["dodge", "block", "facePunchReact"], impactDelay: 0.36, duration: 1.85 },
  { attack: "fistFight", reactions: ["takePunch", "block", "hitReact"], impactDelay: 0.28, duration: 2.1 },
  { attack: "martelo", reactions: ["block", "dodge", "facePunchReact"], impactDelay: 0.34, duration: 1.75 },
  { attack: "flyingKick1", reactions: ["dodge", "hitReact", "block"], impactDelay: 0.38, duration: 1.95 },
  { attack: "legSweep", reactions: ["hitReact", "dodge"], impactDelay: 0.32, duration: 1.85 },
  { attack: "chapa2", reactions: ["block", "dodge", "hitReact"], impactDelay: 0.35, duration: 1.85 },
  { attack: "headbutt", reactions: ["facePunchReact", "hitReact"], impactDelay: 0.28, duration: 1.75 },
  { attack: "flyingKick2", reactions: ["block", "hitReact", "dodge"], impactDelay: 0.38, duration: 1.95 },
];

const SWORD_EXCHANGES: readonly AttackReactionSpec[] = [
  { attack: "swordInward", reactions: ["block", "dodge", "hitReact"], impactDelay: 0.30, duration: 1.75 },
  { attack: "swordOutward", reactions: ["block", "hitReact", "dodge"], impactDelay: 0.30, duration: 1.75 },
  { attack: "swordFight", reactions: ["block", "hitReact"], impactDelay: 0.34, duration: 2.35 },
  { attack: "swordShieldKick", reactions: ["hitReact", "block", "dodge"], impactDelay: 0.32, duration: 1.85 },
];

const SOLO_ACROBATICS_SEQ: readonly { move: KalariCombatAnimKey; duration: number }[] = [
  { move: "ginga", duration: 2.2 },
  { move: "macaco", duration: 1.9 },
  { move: "ginga", duration: 1.6 },
  { move: "flyingKick1", duration: 1.75 },
  { move: "dodge", duration: 1.55 },
  { move: "chapa1", duration: 1.7 },
  { move: "martelo", duration: 1.65 },
  { move: "legSweep", duration: 1.75 },
  { move: "chapa2", duration: 1.7 },
  { move: "flyingKick2", duration: 1.8 },
];

const STAFF_DRILL_SEQ: readonly { move: KalariCombatAnimKey; duration: number }[] = [
  { move: "ginga", duration: 2.0 },
  { move: "staffThrust", duration: 1.65 },
  { move: "block", duration: 1.4 },
  { move: "staffThrust", duration: 1.65 },
  { move: "dodge", duration: 1.5 },
  { move: "staffThrust", duration: 1.7 },
];

export function createKalariCombatState(
  role: KalariTrainingRole,
  anchorX: number,
  anchorZ: number,
  homeYaw: number,
  partnerId?: string,
  isPairLeader = true,
  seedOffset = 0,
): KalariCombatState {
  return {
    role,
    anchorX,
    anchorZ,
    homeYaw,
    partnerId,
    isPairLeader,
    phase: role === "sword_spar" ? "draw" : "stance",
    phaseTimer: role === "sword_spar" ? 1.45 : 1.2 + (seedOffset % 3) * 0.45,
    reactionDelay: 0,
    pendingReaction: "block",
    currentMove: role === "sword_spar" ? "swordDraw" : "ginga",
    attackerTurn: isPairLeader,
    roundCount: 0,
    moveSeqIdx: seedOffset,
  };
}

/**
 * Generates a woven Kerala cotton texture with a gold & crimson kara border
 * so each Kalari student can wear a distinctly colored Uduthuketti or Kacha
 * even when the base Mixamo FBX texture is near-black charcoal.
 */
function createRecoloredKalariClothTexture(
  baseHex: number,
  isLowerWrap: boolean,
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const col = new THREE.Color(baseHex);
  const r = Math.round(col.r * 255);
  const g = Math.round(col.g * 255);
  const b = Math.round(col.b * 255);

  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  // Subtle handloom cross-weave lines
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for (let y = 0; y < size; y += 4) ctx.fillRect(0, y, size, 1);
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  for (let x = 0; x < size; x += 4) ctx.fillRect(x, 0, 1, size);

  // Woven golden Kasavu kara border near the bottom hem (matches v in 0.05..0.16)
  if (isLowerWrap) {
    const yTop = Math.round(size * 0.84);
    const bandH = Math.round(size * 0.11);
    ctx.fillStyle = "#cfa43a";
    ctx.fillRect(0, yTop, size, bandH);
    ctx.fillStyle = "#9c1d18";
    ctx.fillRect(0, yTop + 1, size, 2);
    ctx.fillRect(0, yTop + bandH - 3, size, 2);
  } else {
    // Thin gold trim edge on Kacha waist belt
    ctx.fillStyle = "#d4a83e";
    ctx.fillRect(0, Math.round(size * 0.89), size, 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function sampleTextureAvgRgb(map: THREE.Texture | null): [number, number, number] | null {
  const img = map?.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!img || !("width" in img) || img.width === 0) return null;
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 8, 8);
    const data = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    return [r / (n * 255), g / (n * 255), b / (n * 255)];
  } catch {
    return null;
  }
}

/**
 * Clones materials on a Kalari student instance and applies visibly distinct
 * skin tones + freshly woven Uduthuketti / Kacha cloth textures so every student
 * is immediately recognizable.
 */
export function applyKalariAppearanceVariant(
  model: THREE.Object3D,
  variant: KalariAppearanceVariant,
): void {
  const skinColor = new THREE.Color(variant.skinTint);
  const lowerTex = createRecoloredKalariClothTexture(variant.lowerColorHex, true);
  const sashTex = createRecoloredKalariClothTexture(variant.sashColorHex, false);

  model.traverse((part) => {
    if (!(part instanceof THREE.SkinnedMesh || part instanceof THREE.Mesh)) return;
    const mats = Array.isArray(part.material) ? part.material : [part.material];
    const cloned = mats.map((mat) => {
      if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
      const c = mat.clone();
      const name = (c.name || "").toLowerCase();
      const avg = sampleTextureAvgRgb(c.map);

      const isHair = name.includes("hair") || (avg !== null && avg[0] < 0.06 && avg[1] < 0.06 && avg[2] < 0.06);
      const isSash =
        name.includes("upper") ||
        name.includes("sash") ||
        name.includes("kacha") ||
        (avg !== null && avg[0] > 0.42 && avg[0] > avg[1] * 2.2 && avg[0] > avg[2] * 2.2);
      const isLower =
        name.includes("lower") ||
        name.includes("uduthu") ||
        name.includes("mundu") ||
        (!isHair && avg !== null && avg[0] < 0.22 && avg[1] < 0.20 && avg[2] < 0.20);
      const isSkin =
        name.includes("skin") ||
        (!isHair && !isSash && !isLower && avg !== null && avg[0] > 0.26 && avg[0] > avg[2] * 1.25);

      if (isSash) {
        c.map = sashTex;
        c.color.setHex(0xffffff);
        c.roughness = 0.86;
      } else if (isLower) {
        c.map = lowerTex;
        c.color.setHex(0xffffff);
        c.roughness = 0.88;
      } else if (isSkin) {
        c.color.multiply(skinColor);
        c.roughness = 0.54;
      }
      c.needsUpdate = true;
      return c;
    });
    part.material = Array.isArray(part.material) ? cloned : cloned[0];
  });
}

/**
 * Attaches distinctive 3D Kerala martial accessories (Thalakkettu headband,
 * Kuduma warrior topknot bun, sacred forehead tilak, and forearm cloth wraps)
 * directly to the student's head & forearm bones.
 */
export function attachKalariDistinctAccessories(
  variant: KalariAppearanceVariant,
  invModelScale: number,
  headBone?: THREE.Bone,
  leftForeArmBone?: THREE.Bone,
  rightForeArmBone?: THREE.Bone,
): void {
  if (headBone) {
    if (variant.headbandColor !== undefined) {
      const bandGroup = new THREE.Group();
      const bandMat = new THREE.MeshStandardMaterial({
        color: variant.headbandColor,
        roughness: 0.86,
      });
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.017, 8, 22), bandMat);
      band.rotation.x = Math.PI * 0.5;
      band.scale.set(0.95, 1.08, 1.15);
      bandGroup.add(band);

      // Tied cloth knot & trailing ends at the back of the head
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), bandMat);
      knot.position.set(0, -0.004, -0.105);
      bandGroup.add(knot);
      for (const side of [-1, 1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.11, 0.007), bandMat);
        tail.position.set(side * 0.016, -0.055, -0.112);
        tail.rotation.z = side * 0.22;
        tail.rotation.x = 0.18;
        bandGroup.add(tail);
      }
      bandGroup.scale.setScalar(invModelScale);
      bandGroup.position.set(0, 0.125 * invModelScale, 0.005 * invModelScale);
      headBone.add(bandGroup);
    }

    if (variant.hasKudumaBun) {
      const bunMat = new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.78 });
      const tieMat = new THREE.MeshStandardMaterial({ color: 0xb8221c, roughness: 0.85 });
      const bunGroup = new THREE.Group();
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 10), bunMat);
      bun.scale.set(1.0, 0.85, 1.05);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 6, 14), tieMat);
      tie.rotation.x = Math.PI * 0.5;
      tie.position.y = -0.018;
      bunGroup.add(bun, tie);
      bunGroup.scale.setScalar(invModelScale);
      bunGroup.position.set(0, 0.195 * invModelScale, -0.055 * invModelScale);
      headBone.add(bunGroup);
    }

    if (variant.tilakKind) {
      const tilakGroup = new THREE.Group();
      if (variant.tilakKind === "bhasmam") {
        const ashMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.92 });
        for (const dy of [-0.010, 0, 0.010]) {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.0045, 0.005), ashMat);
          stripe.position.y = dy;
          tilakGroup.add(stripe);
        }
      } else {
        const dotMat = new THREE.MeshStandardMaterial({
          color: variant.tilakKind === "kumkum" ? 0xb81814 : 0xdcb452,
          roughness: 0.75,
        });
        const mark = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 10), dotMat);
        mark.rotation.x = Math.PI * 0.5;
        mark.scale.set(0.85, 1.45, 1.0);
        tilakGroup.add(mark);
      }
      tilakGroup.scale.setScalar(invModelScale);
      tilakGroup.position.set(0, 0.112 * invModelScale, 0.104 * invModelScale);
      headBone.add(tilakGroup);
    }
  }

  if (variant.wristWrapColor !== undefined) {
    const wrapMat = new THREE.MeshStandardMaterial({
      color: variant.wristWrapColor,
      roughness: 0.88,
    });
    for (const bone of [leftForeArmBone, rightForeArmBone]) {
      if (!bone) continue;
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.085, 12), wrapMat);
      wrap.scale.setScalar(invModelScale);
      wrap.position.set(0, 0.18 * invModelScale, 0);
      bone.add(wrap);
    }
  }
}

export interface KalariCombatTickResult {
  animKey: KalariCombatAnimKey | "pray";
  fadeSec: number;
  timeScale: number;
  weaponsDrawn: boolean;
}

/**
 * Advances a paired Kalari sparring duo (Unarmed Verumkai or Sword-and-Shield Valum Parichayum)
 * in lockstep so every attack triggers a timed block, dodge, or hit reaction on the partner.
 */
export function stepPairedKalariCombat(
  leader: KalariCombatState,
  follower: KalariCombatState,
  dt: number,
  isPrayerHour: boolean,
): { leaderResult: KalariCombatTickResult; followerResult: KalariCombatTickResult } {
  const isSword = leader.role === "sword_spar";

  if (isPrayerHour && leader.phase === "stance" && leader.roundCount % 4 === 3) {
    leader.phase = "salute";
    follower.phase = "salute";
    leader.phaseTimer = 4.2;
    follower.phaseTimer = 4.2;
    leader.roundCount++;
  }

  leader.phaseTimer -= dt;
  follower.phaseTimer -= dt;

  if (leader.phase === "salute") {
    if (leader.phaseTimer <= 0) {
      leader.phase = isSword ? "draw" : "stance";
      follower.phase = isSword ? "draw" : "stance";
      leader.phaseTimer = isSword ? 1.4 : 1.5;
      follower.phaseTimer = leader.phaseTimer;
      leader.currentMove = isSword ? "swordDraw" : "ginga";
      follower.currentMove = leader.currentMove;
    }
    return {
      leaderResult: { animKey: "pray", fadeSec: 0.3, timeScale: 1.0, weaponsDrawn: false },
      followerResult: { animKey: "pray", fadeSec: 0.3, timeScale: 1.0, weaponsDrawn: false },
    };
  }

  if (leader.phase === "draw") {
    if (leader.phaseTimer <= 0) {
      leader.phase = "stance";
      follower.phase = "stance";
      leader.phaseTimer = 1.6;
      follower.phaseTimer = 1.6;
      leader.currentMove = "ginga";
      follower.currentMove = "ginga";
    }
    return {
      leaderResult: { animKey: "swordDraw", fadeSec: 0.2, timeScale: 1.0, weaponsDrawn: true },
      followerResult: { animKey: "swordDraw", fadeSec: 0.2, timeScale: 1.0, weaponsDrawn: true },
    };
  }

  if (leader.phase === "sheathe") {
    if (leader.phaseTimer <= 0) {
      leader.phase = "salute";
      follower.phase = "salute";
      leader.phaseTimer = 2.8;
      follower.phaseTimer = 2.8;
    }
    return {
      leaderResult: { animKey: "swordSheathe", fadeSec: 0.22, timeScale: 1.0, weaponsDrawn: true },
      followerResult: { animKey: "swordSheathe", fadeSec: 0.22, timeScale: 1.0, weaponsDrawn: true },
    };
  }

  if (leader.phase === "stance") {
    if (leader.phaseTimer <= 0) {
      // Every 6 sword exchanges, briefly sheathe & bow before starting a fresh bout
      if (isSword && leader.roundCount > 0 && leader.roundCount % 6 === 0) {
        leader.phase = "sheathe";
        follower.phase = "sheathe";
        leader.phaseTimer = 1.45;
        follower.phaseTimer = 1.45;
        leader.roundCount++;
        return {
          leaderResult: { animKey: "swordSheathe", fadeSec: 0.22, timeScale: 1.0, weaponsDrawn: true },
          followerResult: { animKey: "swordSheathe", fadeSec: 0.22, timeScale: 1.0, weaponsDrawn: true },
        };
      }

      const table = isSword ? SWORD_EXCHANGES : UNARMED_EXCHANGES;
      const spec = table[leader.moveSeqIdx % table.length];
      const reactKey = spec.reactions[(leader.moveSeqIdx + leader.roundCount) % spec.reactions.length];
      leader.moveSeqIdx++;
      leader.roundCount++;

      const attacker = leader.attackerTurn ? leader : follower;
      const defender = leader.attackerTurn ? follower : leader;

      attacker.phase = "attack";
      attacker.currentMove = spec.attack;
      attacker.phaseTimer = spec.duration;

      defender.phase = "react_wait";
      defender.reactionDelay = spec.impactDelay;
      defender.pendingReaction = reactKey;
      defender.currentMove = "ginga";
      defender.phaseTimer = spec.duration;

      // Alternate attacker & defender for the next exchange
      leader.attackerTurn = !leader.attackerTurn;
    }
    return {
      leaderResult: { animKey: "ginga", fadeSec: 0.24, timeScale: 1.0, weaponsDrawn: isSword },
      followerResult: { animKey: "ginga", fadeSec: 0.24, timeScale: 0.96, weaponsDrawn: isSword },
    };
  }

  // Active exchange: attacker executes strike, defender triggers synced reaction at impactDelay
  const resolveFighter = (f: KalariCombatState): KalariCombatTickResult => {
    if (f.phase === "react_wait") {
      f.reactionDelay -= dt;
      if (f.reactionDelay <= 0) {
        f.phase = "react";
        f.currentMove = f.pendingReaction;
      }
      return { animKey: f.currentMove, fadeSec: 0.14, timeScale: 1.0, weaponsDrawn: isSword };
    }
    return {
      animKey: f.currentMove,
      fadeSec: f.phase === "react" ? 0.14 : 0.18,
      timeScale: 1.0,
      weaponsDrawn: isSword,
    };
  };

  const leaderResult = resolveFighter(leader);
  const followerResult = resolveFighter(follower);

  // When the exchange finishes, both return smoothly to fighting stance (Ginga)
  if (leader.phaseTimer <= 0 && follower.phaseTimer <= 0) {
    leader.phase = "stance";
    follower.phase = "stance";
    const pause = 1.15 + ((leader.roundCount * 37) % 10) * 0.08;
    leader.phaseTimer = pause;
    follower.phaseTimer = pause;
    leader.currentMove = "ginga";
    follower.currentMove = "ginga";
  }

  return { leaderResult, followerResult };
}

/**
 * Advances a solo Kalari student (Meipayattu acrobatics or Kettukari staff thrust drills).
 */
export function stepSoloKalariCombat(
  state: KalariCombatState,
  dt: number,
  isPrayerHour: boolean,
): KalariCombatTickResult {
  const isStaff = state.role === "staff_drill";
  state.phaseTimer -= dt;

  if (state.phase === "salute") {
    if (state.phaseTimer <= 0) {
      state.phase = "stance";
      state.phaseTimer = 1.6;
      state.currentMove = "ginga";
    }
    return { animKey: "pray", fadeSec: 0.3, timeScale: 1.0, weaponsDrawn: isStaff };
  }

  if (state.phaseTimer <= 0) {
    if (isPrayerHour && state.roundCount > 0 && state.roundCount % 5 === 0) {
      state.phase = "salute";
      state.phaseTimer = 4.0;
      state.roundCount++;
      return { animKey: "pray", fadeSec: 0.3, timeScale: 1.0, weaponsDrawn: isStaff };
    }
    const seq = isStaff ? STAFF_DRILL_SEQ : SOLO_ACROBATICS_SEQ;
    const item = seq[state.moveSeqIdx % seq.length];
    state.moveSeqIdx++;
    state.roundCount++;
    state.phase = item.move === "ginga" ? "stance" : "attack";
    state.currentMove = item.move;
    state.phaseTimer = item.duration;
  }

  return {
    animKey: state.currentMove,
    fadeSec: 0.2,
    timeScale: 1.0,
    weaponsDrawn: isStaff,
  };
}
