import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #7 — 18th-Century Kerala Kalaripayattu Master (Kalari Gurukkal / Asan)
 *
 * Character traits:
 * - Commands the Kuzhi Kalari pit from the north/west vantage near the Poothara shrine.
 * - Alternates between calling rhythmic Vaythari martial commands (`talk`, `argue`),
 *   calmly inspecting sparring pairs (`idle`, `breathIdle`), and offering dawn/dusk
 *   Poothara Vandanam prayers (`pray`).
 * - Greets the player formally (`greet`) when they step inside the Kalari pit.
 */
export const KALARI_GURU_BRAIN: NpcCharacterBrain = {
  archetype: "kalari_guru",
  trafficLookahead: 9.0,
  preferredSideClearance: 1.75,
  evadeSpeedMul: 0.95,
  usesWalkingStick: false,
  canClimbRestingStone: false,
  runsInHeavyRain: false,

  chooseWaypointAction(ctx, _job, _smokeChance, prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 0.65 + ctx.seedIdx * 2.1));
    if (ctx.isPrayerHour || roll < prayChance * 0.45) {
      return { action: "pray", duration: 7.5 };
    }
    if (roll < 0.68) {
      return { action: "talk", duration: 6.5 };
    }
    if (roll < 0.84) {
      return { action: "argue", duration: 4.5 };
    }
    return { action: "idle", duration: 5.5 };
  },

  choosePlayerGreeting(_ctx, _socialClass) {
    return "greet";
  },

  chooseYieldWaitAnim(_ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return "idle";
  },

  chooseWalkAnim(_ctx, carriesLamp, _running) {
    if (carriesLamp) return "torchWalk";
    return "landlordWalk";
  },

  chooseIdleAnim(ctx) {
    const slot = (ctx.seedIdx + Math.floor(ctx.elapsed * 0.08)) % 2;
    return slot === 0 ? "idle" : "breathIdle";
  },
};
