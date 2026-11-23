import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #5 — 18th-Century Kerala Kalaripayattu Student / Warrior Behavior Brain (`kalari_student`)
 *
 * Character traits:
 * - Young, athletic, agile stride; brisk reflexes when stepping aside for bullock carts
 *   or horses (`evadeSpeedMul = 1.38`).
 * - Trains at and patrols around the Kalari arena (martial stretches, stance holds,
 *   morning/evening prayers to the Kalari Poothara).
 * - Never smokes beedis; runs energetically in heavy monsoon rain; climbs roadside
 *   Chumaduthangi stones effortlessly when out on village errands.
 */
export const KALARI_STUDENT_BRAIN: NpcCharacterBrain = {
  archetype: "kalari_student",
  trafficLookahead: 9.0,
  preferredSideClearance: 1.5,
  evadeSpeedMul: 1.38,
  usesWalkingStick: false,
  canClimbRestingStone: true,
  runsInHeavyRain: true,

  chooseWaypointAction(ctx, _job, _smokeChance, prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 1.1 + ctx.seedIdx * 2.5));
    if (ctx.isPrayerHour && roll < Math.max(0.45, prayChance)) {
      return { action: "pray", duration: 6.5 };
    }
    // Martial stance / practice drills at the Kalari waypoints
    if (roll < 0.62) {
      return { action: "work", duration: 5.5 + (ctx.seedIdx % 3) * 1.2 };
    }
    return { action: "idle", duration: 3.2 + (ctx.seedIdx % 2) * 1.0 };
  },

  choosePlayerGreeting(ctx, _socialClass) {
    return ctx.distToPlayer > 2.0 ? "greet" : "talk";
  },

  chooseYieldWaitAnim(_ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return "idle";
  },

  chooseWalkAnim(ctx, carriesLamp, running) {
    if (carriesLamp) return "torchWalk";
    if (running) return ctx.seedIdx % 2 === 0 ? "run" : "runAlt";
    return "walk";
  },

  chooseIdleAnim(ctx) {
    const slot = (ctx.seedIdx + Math.floor(ctx.elapsed * 0.12)) % 2;
    return slot === 0 ? "idle" : "breathIdle";
  },
};
