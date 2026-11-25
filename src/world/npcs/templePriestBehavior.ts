import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #10 — 18th-Century Kerala Temple Priest (Santhikaran / Namboothiri Priest)
 *
 * Character traits:
 * - Tends the village Bhagavathy/Shiva temple courtyard, performing dawn & dusk
 *   Sandhya prayers (`pray`, `pray2`) and calm Pradakshinam circumambulation.
 * - Dignified, serene gait; never smokes beedis, never climbs resting stones,
 *   and walks calmly even in monsoon rain.
 * - Greets visiting villagers and the player with a respectful blessing (`greet`).
 */
export const TEMPLE_PRIEST_BRAIN: NpcCharacterBrain = {
  archetype: "temple_priest",
  trafficLookahead: 9.5,
  preferredSideClearance: 1.8,
  evadeSpeedMul: 0.9,
  usesWalkingStick: false,
  canClimbRestingStone: false,
  runsInHeavyRain: false,

  chooseWaypointAction(ctx, _job, _smokeChance, _prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 0.55 + ctx.seedIdx * 2.7));
    if (ctx.isPrayerHour || roll < 0.62) {
      return { action: "pray", duration: 9.5 };
    }
    if (roll < 0.82) {
      return { action: "idle", duration: 6.5 };
    }
    return { action: "talk", duration: 5.5 };
  },

  choosePlayerGreeting(_ctx, _socialClass) {
    return "greet";
  },

  chooseYieldWaitAnim(_ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return "breathIdle";
  },

  chooseWalkAnim(_ctx, carriesLamp, _running) {
    if (carriesLamp) return "torchWalk";
    return "landlordWalk";
  },

  chooseIdleAnim(ctx) {
    const slot = (ctx.seedIdx + Math.floor(ctx.elapsed * 0.08)) % 2;
    return slot === 0 ? "breathIdle" : "idle";
  },
};
