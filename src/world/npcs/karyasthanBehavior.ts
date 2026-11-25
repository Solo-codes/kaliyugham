import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #9 — 18th-Century Kerala Estate Manager / Steward (Karyasthan)
 *
 * Character traits:
 * - Trusted estate steward accompanying the Landlord (Thampuran Rama Varma) on village rounds.
 * - Carries the traditional dried palmyra palm-leaf umbrella (Olakkuda) in his right hand
 *   and the embossed solid-brass betel-leaf box (Vettila Chellam) in his left hand.
 * - Dressed in a neat off-white Kasavu Mundu and folded cream Thorthu/Melmundu (humbler than
 *   the Landlord's royal gold Kasavu and ornaments).
 * - Walks attentively beside the Landlord in smooth formation, never smokes, never climbs stones.
 */
export const KARYASTHAN_BRAIN: NpcCharacterBrain = {
  archetype: "karyasthan",
  trafficLookahead: 10.5,
  preferredSideClearance: 1.7,
  evadeSpeedMul: 1.0,
  usesWalkingStick: false,
  canClimbRestingStone: false,
  runsInHeavyRain: false,

  chooseWaypointAction(ctx, _job, _smokeChance, _prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 0.65 + ctx.seedIdx * 2.2));
    if (roll < 0.35) {
      return { action: "talk", duration: 5.0 };
    }
    return { action: "idle", duration: 5.0 };
  },

  choosePlayerGreeting(_ctx, _socialClass) {
    return "idle";
  },

  chooseYieldWaitAnim(_ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return "idle";
  },

  chooseWalkAnim(_ctx, carriesLamp, _running) {
    if (carriesLamp) return "torchWalk";
    return "walk";
  },

  chooseIdleAnim(ctx) {
    return ctx.seedIdx % 2 === 0 ? "idle" : "breathIdle";
  },
};
