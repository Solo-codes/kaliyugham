import type { DynamicMoverKind, NpcBrainContext, NpcCharacterBrain } from "./npcTypes";

/**
 * Set #4 — 18th-Century Kerala Estate Landlord / Jenmi Behavior Brain (`landlord`)
 *
 * Character traits:
 * - Stately, unhurried, authoritative walk (never sprints in rain, never smokes beedis,
 *   never climbs Chumaduthangi resting stones).
 * - Inspects the estate courtyard, temple entrance, village market, and kalari arena,
 *   pausing to observe or converse formally.
 * - Composed roadside give-way for bullock carts & horses (steps aside calmly with
 *   dignity and watches them pass).
 * - Formal greeting (`greet`) when the player approaches.
 */
export const LANDLORD_BRAIN: NpcCharacterBrain = {
  archetype: "landlord",
  trafficLookahead: 8.5,
  preferredSideClearance: 1.55,
  evadeSpeedMul: 0.92, // composed, unhurried step aside (only for heavy bullock carts/horses)
  usesWalkingStick: false,
  canClimbRestingStone: false,
  runsInHeavyRain: false,

  chooseWaypointAction(ctx, _job, _smokeChance, _prayChance) {
    const roll = Math.abs(Math.sin(ctx.elapsed * 0.7 + ctx.seedIdx * 2.9));
    if (roll < 0.35) {
      return { action: "talk", duration: 5.5 + (ctx.seedIdx % 2) * 1.5 };
    }
    return { action: "idle", duration: 5.0 + (ctx.seedIdx % 3) * 1.5 };
  },

  // Dominant Jenmi composure: does not wave eagerly; gives a brief dignified idle stance
  choosePlayerGreeting(_ctx, _socialClass) {
    return "idle";
  },

  chooseYieldWaitAnim(_ctx: NpcBrainContext, _moverKind: DynamicMoverKind) {
    return "idle";
  },

  chooseWalkAnim(_ctx, carriesLamp, _running) {
    if (carriesLamp) return "torchWalk";
    return "landlordWalk";
  },

  chooseIdleAnim(ctx) {
    const slot = (ctx.seedIdx + Math.floor(ctx.elapsed * 0.07)) % 2;
    return slot === 0 ? "idle" : "breathIdle";
  },
};
