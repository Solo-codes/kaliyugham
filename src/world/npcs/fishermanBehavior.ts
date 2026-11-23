import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #6 — 18th-Century Kerala River & Backwater Fisherman Behavior Brain (`fisherman`)
 *
 * Character traits:
 * - Lean, weather-hardened coastal/river fisherman (Mukkuvan / Arayan) wearing a
 *   folded indigo Kalli Mundu (madakki kuthal) and tied forehead Thorthu headcloth.
 * - Patrols between the riverside Kadavu landing, riverbanks, and the village Fresh Fish Stall.
 * - Seasoned against Kerala monsoon rain (never panics or sprints for shelter in rain).
 * - Takes short riverbank beedi breaks, haggles/talks at the fish stall, and gives way
 *   cleanly to oncoming bullock carts, horses, and the village Landlord.
 */
export const FISHERMAN_BRAIN: NpcCharacterBrain = {
  archetype: "fisherman",
  trafficLookahead: 10.0,
  preferredSideClearance: 1.65,
  evadeSpeedMul: 1.24,
  usesWalkingStick: false,
  canClimbRestingStone: false,
  runsInHeavyRain: false,

  chooseWaypointAction(ctx, _job, smokeChance, prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 0.88 + ctx.seedIdx * 2.9));
    // Near the market fish stall -> lively haggling/talking or unloading catch
    const nearFishMarket = Math.hypot(ctx.x - 15, ctx.z - -29) < 8.5;
    if (nearFishMarket) {
      if (roll < 0.48) return { action: "talk", duration: 6.0 + (ctx.seedIdx % 2) * 1.6 };
      if (roll < 0.76) return { action: "argue", duration: 5.0 };
      return { action: "work", duration: 5.5 };
    }
    if (ctx.isPrayerHour && roll < prayChance) {
      return { action: "pray", duration: 6.5 };
    }
    if (!ctx.isHeavyRain && roll < smokeChance) {
      return { action: "smoke", duration: 8.5 };
    }
    if (roll < 0.72) {
      return { action: "work", duration: 6.5 + (ctx.seedIdx % 3) * 1.4 };
    }
    return { action: "idle", duration: 4.0 + (ctx.seedIdx % 2) * 1.2 };
  },

  choosePlayerGreeting(ctx, _socialClass) {
    return ctx.distToPlayer > 2.2 ? "wave" : "talk";
  },

  chooseYieldWaitAnim(ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return ctx.seedIdx % 2 === 0 ? "idle" : "breathIdle";
  },

  chooseWalkAnim(_ctx, carriesLamp, running) {
    if (carriesLamp) return "torchWalk";
    if (running) return "run";
    return "walk";
  },

  chooseIdleAnim(ctx) {
    const slot = (ctx.seedIdx + Math.floor(ctx.elapsed * 0.09)) % 3;
    return slot === 0 ? "breathIdle" : slot === 1 ? "idle" : "idle2";
  },
};
