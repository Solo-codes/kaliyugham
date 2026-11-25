import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #3 — Kerala Village Elder / Karanavar Behavior Brain (`elder_man`)
 *
 * Character traits:
 * - Walks with a carved Kerala teak walking stick ("Oonnuvadi" / "Vadi kuthi nadakkuka")!
 *   Automatically uses Mixamo cane/old-man walk & idle animations (`Old Man Walk.fbx` /
 *   `Walking With Cane.fbx`, `Old Man Idle.fbx`) whenever present in `anims/`.
 * - Dignified, unhurried pace; never sprints in rain and never climbs resting stones.
 * - Spots oncoming Kalavandis & horses early (12.5m lookahead), steps calmly onto the
 *   clear shoulder, turns toward the passing vehicle leaning on his stick, and waits.
 * - High devotion during dawn/dusk prayer hours and warm formal greetings.
 */
export const ELDER_MAN_BRAIN: NpcCharacterBrain = {
  archetype: "elder_man",
  trafficLookahead: 12.5,
  preferredSideClearance: 2.05,
  evadeSpeedMul: 0.96, // calm, steady step aside — elders never sprint
  usesWalkingStick: true,
  canClimbRestingStone: false,
  runsInHeavyRain: false,

  chooseWaypointAction(ctx, job, _smokeChance, prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 0.75 + ctx.seedIdx * 2.3));
    if (job === "temple_devotee" && (ctx.isPrayerHour || roll < 0.5)) {
      return { action: "pray", duration: 8.5 + (ctx.seedIdx % 2) * 2.0 };
    }
    if (ctx.isPrayerHour && roll < prayChance) {
      return { action: "pray", duration: 7.5 };
    }
    return { action: "idle", duration: 4.8 + (ctx.seedIdx % 3) * 1.5 };
  },

  choosePlayerGreeting(_ctx, _socialClass) {
    return "greet";
  },

  chooseYieldWaitAnim(ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    if (ctx.hasCaneIdleAnim) return "caneIdle";
    return "breathIdle";
  },

  chooseWalkAnim(ctx, carriesLamp, _running) {
    if (carriesLamp) return "torchWalk";
    if (ctx.hasCaneWalkAnim) return "caneWalk";
    return "walk";
  },

  chooseIdleAnim(ctx) {
    if (ctx.hasCaneIdleAnim) return "caneIdle";
    const slot = (ctx.seedIdx + Math.floor(ctx.elapsed * 0.08)) % 2;
    return slot === 0 ? "breathIdle" : "idle";
  },
};
