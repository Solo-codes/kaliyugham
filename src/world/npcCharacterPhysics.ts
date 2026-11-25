import * as THREE from "three";

export type NpcArchetype =
  | "elder"
  | "child"
  | "landlord"
  | "farmer"
  | "villager"
  | "kalari_student"
  | "kalari_guru"
  | "guard";

export type CharacterPhysicsProfile = {
  /** Animation playback speed multiplier so elders walk unhurriedly and children move lively */
  animSpeed: number;
  /** Personal space radius (meters) used for crowd separation */
  personalRadius: number;
  /** How gently they yield to nearby NPCs/player (lower = more dignified/steady, higher = agile) */
  agility: number;
  /** Subtle idle breathing / posture sway amplitude (radians) */
  swayAmp: number;
  /** Subtle sway frequency (rad/s) */
  swayFreq: number;
  /** Natural age/role forward posture tilt (radians) */
  baseTiltX: number;
};

export const CHARACTER_PHYSICS_PROFILES: Record<NpcArchetype, CharacterPhysicsProfile> = {
  elder: {
    animSpeed: 0.62,
    personalRadius: 0.42,
    agility: 0.75,
    swayAmp: 0.018,
    swayFreq: 1.1,
    baseTiltX: 0.06,
  },
  child: {
    animSpeed: 1.28,
    personalRadius: 0.28,
    agility: 1.65,
    swayAmp: 0.032,
    swayFreq: 3.1,
    baseTiltX: 0.02,
  },
  landlord: {
    animSpeed: 0.78,
    personalRadius: 0.50,
    agility: 0.65,
    swayAmp: 0.010,
    swayFreq: 1.3,
    baseTiltX: -0.01,
  },
  farmer: {
    animSpeed: 0.96,
    personalRadius: 0.34,
    agility: 1.10,
    swayAmp: 0.016,
    swayFreq: 1.7,
    baseTiltX: 0.03,
  },
  villager: {
    animSpeed: 1.0,
    personalRadius: 0.34,
    agility: 1.15,
    swayAmp: 0.015,
    swayFreq: 1.6,
    baseTiltX: 0.01,
  },
  kalari_student: {
    animSpeed: 1.08,
    personalRadius: 0.38,
    agility: 1.40,
    swayAmp: 0.012,
    swayFreq: 2.2,
    baseTiltX: 0.02,
  },
  kalari_guru: {
    animSpeed: 0.85,
    personalRadius: 0.46,
    agility: 0.85,
    swayAmp: 0.010,
    swayFreq: 1.4,
    baseTiltX: 0.01,
  },
  guard: {
    animSpeed: 0.94,
    personalRadius: 0.42,
    agility: 0.90,
    swayAmp: 0.008,
    swayFreq: 1.5,
    baseTiltX: 0.0,
  },
};

export function archetypeFromNpcKey(key: string): NpcArchetype {
  if (key.includes("elder")) return "elder";
  if (key.includes("boy") || key.includes("girl")) return "child";
  if (key.includes("landlord")) return "landlord";
  if (key.includes("kalari_guru")) return "kalari_guru";
  if (key.includes("kalari")) return "kalari_student";
  if (key.includes("guard")) return "guard";
  if (key.includes("farmer") || key.includes("fisherman")) return "farmer";
  return "villager";
}

export type CharacterMannerismActor = {
  host: THREE.Object3D;
  archetype: NpcArchetype;
  phaseOffset: number;
  isMoving: () => boolean;
};

/**
 * Applies character-specific posture, breathing sway, and grounded mannerisms each frame.
 * Never sinks feet below the floor!
 */
export function updateCharacterMannerisms(
  actors: CharacterMannerismActor[],
  elapsed: number,
  delta: number,
) {
  const step = Math.min(delta, 0.05);
  for (const actor of actors) {
    if (!actor.host.visible) continue;
    const prof = CHARACTER_PHYSICS_PROFILES[actor.archetype];
    const moving = actor.isMoving();
    const sway = Math.sin(elapsed * prof.swayFreq + actor.phaseOffset) * prof.swayAmp;
    const targetX = prof.baseTiltX + (moving ? sway * 0.5 : sway);
    const targetZ = moving ? Math.cos(elapsed * prof.swayFreq * 1.4 + actor.phaseOffset) * prof.swayAmp * 0.65 : sway * 0.4;
    actor.host.rotation.x = THREE.MathUtils.damp(actor.host.rotation.x, targetX, 6, step);
    actor.host.rotation.z = THREE.MathUtils.damp(actor.host.rotation.z, targetZ, 6, step);
  }
}
