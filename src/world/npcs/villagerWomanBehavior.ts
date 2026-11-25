import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #2 — Kerala Village Woman Behavior Brain (`villager_woman`)
 *
 * Character traits:
 * - Graceful, steady village gait; hurries briskly in heavy monsoon rain.
 * - Early cautious roadside give-way (larger safety margin from bullock carts & horses),
 *   stepping cleanly onto the dry verge and waiting calmly until traffic passes.
 * - Never smokes or climbs Chumaduthangi stones; prays frequently at dawn & dusk near the temple,
 *   tends vegetable plots, and exchanges warm greetings with neighbors and the player.
 */
export const VILLAGER_WOMAN_BRAIN: NpcCharacterBrain = {
  archetype: "villager_woman",
  trafficLookahead: 11.5,
  preferredSideClearance: 1.95,
  evadeSpeedMul: 1.22,
  usesWalkingStick: false,
  canClimbRestingStone: false,
  runsInHeavyRain: true,

  chooseWaypointAction(ctx, job, _smokeChance, prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 0.85 + ctx.seedIdx * 3.1));
    if (job === "temple_devotee" && (ctx.isPrayerHour || roll < 0.45)) {
      return { action: "pray", duration: 7.5 + (ctx.seedIdx % 2) * 1.5 };
    }
    if (job === "vegetable_grower") {
      return { action: "work", duration: 6.5 + (ctx.seedIdx % 3) * 1.2 };
    }
    if (ctx.isPrayerHour && roll < prayChance) {
      return { action: "pray", duration: 6.5 };
    }
    return { action: "idle", duration: 3.8 + (ctx.seedIdx % 3) * 1.1 };
  },

  choosePlayerGreeting(ctx, _socialClass) {
    return ctx.distToPlayer > 2.1 ? "wave" : "greet";
  },

  chooseYieldWaitAnim(_ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return "breathIdle";
  },

  chooseWalkAnim(_ctx, carriesLamp, running) {
    if (carriesLamp) return "torchWalk";
    if (running) return "run";
    return "walk";
  },

  chooseIdleAnim(ctx) {
    const slot = (ctx.seedIdx + Math.floor(ctx.elapsed * 0.08)) % 2;
    return slot === 0 ? "breathIdle" : "idle";
  },
};
