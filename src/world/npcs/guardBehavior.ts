import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #8 — 18th-Century Kerala Nair Estate Guard & Landlord Escort (Akampadi / Padayali)
 *
 * Character traits:
 * - Disciplined, alert armed retainer wearing a folded ivory-gold Kasavu Mundu,
 *   crimson Kacha waist sash, deep maroon Melmundu shoulder cloth, and Nair Thalakettu headband.
 * - Escorts the Estate Landlord (Thampuran) on village rounds or patrols the Nalukettu gate.
 * - Never smokes, never climbs Chumaduthangi resting stones, never panics in rain.
 * - Maintains composed authority: gives way only to heavy bullock carts/horses, and holds
 *   an alert watchful stance when the player approaches.
 */
export const GUARD_BRAIN: NpcCharacterBrain = {
  archetype: "guard",
  trafficLookahead: 10.0,
  preferredSideClearance: 1.65,
  evadeSpeedMul: 1.08,
  usesWalkingStick: false,
  canClimbRestingStone: false,
  runsInHeavyRain: false,

  chooseWaypointAction(ctx, _job, _smokeChance, _prayChance) {
    return { action: "idle", duration: 4.5 + (ctx.seedIdx % 2) * 2.0 };
  },

  choosePlayerGreeting(_ctx, _socialClass) {
    return "idle";
  },

  chooseYieldWaitAnim(_ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return "idle";
  },

  chooseWalkAnim(_ctx, carriesLamp, running) {
    if (carriesLamp) return "torchWalk";
    if (running) return "run";
    return "landlordWalk";
  },

  chooseIdleAnim(ctx) {
    return ctx.seedIdx % 2 === 0 ? "idle" : "breathIdle";
  },
};
