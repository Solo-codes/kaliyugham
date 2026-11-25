import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #1 — Kerala Farmer / Village Laborer Behavior Brain (`farmer_man`)
 *
 * Character traits:
 * - Brisk, practical rural gait; jogs for cover in heavy monsoon rain.
 * - Takes authentic short beedi breaks (when not raining) with curling smoke.
 * - Climbs and sits on roadside Chumaduthangi (Athani) resting stones.
 * - Steps briskly onto the roadside shoulder when a Kalavandi or horse approaches,
 *   faces it until it passes, then resumes work/errands.
 */
export const FARMER_MAN_BRAIN: NpcCharacterBrain = {
  archetype: "farmer_man",
  trafficLookahead: 9.5,
  preferredSideClearance: 1.55,
  evadeSpeedMul: 1.28,
  usesWalkingStick: false,
  canClimbRestingStone: true,
  runsInHeavyRain: true,

  chooseWaypointAction(ctx, job, smokeChance, prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 0.9 + ctx.seedIdx * 2.7));
    if (job === "paddy_farmer" || job === "vegetable_grower") {
      if (!ctx.isHeavyRain && roll < smokeChance) {
        return { action: "smoke", duration: 9.5 };
      }
      return { action: "work", duration: 6.0 + (ctx.seedIdx % 3) * 1.4 };
    }
    if (ctx.isPrayerHour && roll < prayChance) {
      return { action: "pray", duration: 7.0 };
    }
    if (!ctx.isHeavyRain && roll < smokeChance) {
      return { action: "smoke", duration: 9.0 };
    }
    return { action: "idle", duration: 3.2 + (ctx.seedIdx % 3) * 1.2 };
  },

  choosePlayerGreeting(ctx, socialClass) {
    if (ctx.distToPlayer > 2.0) return "wave";
    return socialClass === "upper" ? "greet" : "talk";
  },

  chooseYieldWaitAnim(ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return ctx.seedIdx % 2 === 0 ? "breathIdle" : "idle";
  },

  chooseWalkAnim(ctx, carriesLamp, running) {
    if (carriesLamp) return "torchWalk";
    if (running) return ctx.seedIdx % 2 === 0 ? "run" : "runAlt";
    return "walk";
  },

  chooseIdleAnim(ctx) {
    const slot = (ctx.seedIdx + Math.floor(ctx.elapsed * 0.1)) % 3;
    return slot === 0 ? "breathIdle" : slot === 1 ? "idle" : "idle2";
  },
};
