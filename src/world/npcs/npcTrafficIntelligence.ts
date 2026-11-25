import { insideSolid, segmentClear, type Solid } from "../collision";
import type { DynamicMover, NpcYieldDecision } from "./npcTypes";

export interface TrafficEvalParams {
  npcX: number;
  npcZ: number;
  movers: readonly DynamicMover[];
  solids: readonly Solid[];
  isBlockedWater: (x: number, z: number) => boolean;
  lookaheadDist: number;
  preferredClearance: number;
  evadeSpeedMul: number;
  /** Optional previously chosen safe verge to prevent side-to-side oscillation */
  currentYieldTarget?: [number, number] | null;
}

/**
 * Predictive Moving-Object Avoidance & Give-Way ("Side Kodukkuka") Engine.
 *
 * When a moving Kalavandi (bullock cart), galloping horse, running player, or large
 * animal approaches an NPC:
 * 1. Projects the mover's velocity vector forward to compute longitudinal distance
 *    (`along`) and perpendicular corridor offset (`across`).
 * 2. If the NPC lies inside the oncoming danger corridor, evaluates candidate spots
 *    on BOTH perpendicular sides of the mover's path at multiple clearances.
 * 3. Scores each candidate strictly against static solids (buildings, walls, stalls,
 *    trees, stones), water, and clear line-of-travel so the NPC NEVER steps into an
 *    obstacle or river while giving way.
 * 4. Once the NPC reaches the safe roadside verge, instructs them to stop, face the
 *    passing vehicle/horse, and wait politely until it clears.
 */
export function evaluateMovingObstacleYield(
  params: TrafficEvalParams,
): NpcYieldDecision {
  const {
    npcX,
    npcZ,
    movers,
    solids,
    isBlockedWater,
    lookaheadDist,
    preferredClearance,
    evadeSpeedMul,
    currentYieldTarget,
  } = params;

  let mostUrgent: {
    mover: DynamicMover;
    dirX: number;
    dirZ: number;
    along: number;
    across: number;
    score: number;
  } | null = null;

  for (let i = 0; i < movers.length; i++) {
    const m = movers[i];
    const speed = Math.hypot(m.vx, m.vz);
    // Only treat as an oncoming moving threat if actually moving
    const minThreatSpeed = m.kind === "kalavandi" ? 0.25 : m.kind === "horse" ? 0.6 : 1.4;
    if (speed < minThreatSpeed) continue;

    const dirX = m.vx / speed;
    const dirZ = m.vz / speed;
    const relX = npcX - m.x;
    const relZ = npcZ - m.z;

    // Longitudinal distance ahead of mover (+ = in front of mover, - = behind mover)
    const along = relX * dirX + relZ * dirZ;
    // Perpendicular signed distance (+ = mover's right side, - = mover's left side)
    const rightX = -dirZ;
    const rightZ = dirX;
    const across = relX * rightX + relZ * rightZ;

    const corridorHalfWidth = m.radius + Math.max(1.25, preferredClearance * 0.55);
    const maxLookahead =
      m.kind === "kalavandi"
        ? lookaheadDist + 2.5
        : m.kind === "horse"
          ? lookaheadDist + 3.0
          : lookaheadDist;

    // Threat corridor: from slightly behind (-2.8m while cart is still passing) up to maxLookahead ahead
    if (along < -2.8 || along > maxLookahead) continue;
    if (Math.abs(across) > corridorHalfWidth + 1.4) continue;

    // Urgency score: closer longitudinal & lateral threats win
    const ttc = Math.max(0.1, along / Math.max(speed, 0.4));
    const score = 1 / ttc + (Math.abs(across) < corridorHalfWidth ? 2.5 : 0.4);
    if (!mostUrgent || score > mostUrgent.score) {
      mostUrgent = { mover: m, dirX, dirZ, along, across, score };
    }
  }

  if (!mostUrgent) {
    return {
      active: false,
      safeX: npcX,
      safeZ: npcZ,
      atSafeVerge: false,
      faceX: npcX,
      faceZ: npcZ,
      evadeSpeedMul: 1,
    };
  }

  const { mover, dirX, dirZ, across } = mostUrgent;
  const rightX = -dirZ;
  const rightZ = dirX;
  const safeClearance = mover.radius + preferredClearance;

  // If NPC is already safely outside the passing corridor, just pause & watch it pass!
  if (Math.abs(across) >= safeClearance - 0.25) {
    return {
      active: true,
      mover,
      safeX: npcX,
      safeZ: npcZ,
      atSafeVerge: true,
      faceX: mover.x,
      faceZ: mover.z,
      evadeSpeedMul,
    };
  }

  // If we already picked a valid yield spot that is still clear, keep heading there (no jitter!)
  if (currentYieldTarget) {
    const [cx, cz] = currentYieldTarget;
    const candAcross = (cx - mover.x) * rightX + (cz - mover.z) * rightZ;
    const blocked =
      isBlockedWater(cx, cz) ||
      solids.some((s) => insideSolid(s, cx, cz, 0.52));
    if (!blocked && Math.abs(candAcross) >= safeClearance - 0.35) {
      const distToTarget = Math.hypot(cx - npcX, cz - npcZ);
      return {
        active: true,
        mover,
        safeX: cx,
        safeZ: cz,
        atSafeVerge: distToTarget < 0.42,
        faceX: mover.x,
        faceZ: mover.z,
        evadeSpeedMul,
      };
    }
  }

  // Evaluate candidate pull-off spots on BOTH sides of the mover's trajectory
  const preferredSide = across >= 0 ? 1 : -1;
  const sideOrder = [preferredSide, -preferredSide];
  const clearanceOffsets = [safeClearance, safeClearance + 0.85, safeClearance + 1.65];
  const alongShifts = [0, 1.1, -1.0];

  let bestSpot: { x: number; z: number; cost: number } | null = null;

  for (const side of sideOrder) {
    for (const latDist of clearanceOffsets) {
      for (const alongShift of alongShifts) {
        // Compute spot laterally off the mover's centerline near the NPC's longitudinal position
        const deltaAcross = side * latDist - across;
        const candX = npcX + rightX * deltaAcross + dirX * alongShift;
        const candZ = npcZ + rightZ * deltaAcross + dirZ * alongShift;

        if (isBlockedWater(candX, candZ)) continue;
        if (solids.some((s) => insideSolid(s, candX, candZ, 0.56))) continue;
        if (solids.length > 0 && !segmentClear([npcX, npcZ], [candX, candZ], solids, 0.44)) {
          continue;
        }

        const travelDist = Math.hypot(candX - npcX, candZ - npcZ);
        // Prefer closer side & shorter step, slight bonus for keeping on same side of road
        const sidePenalty = side === preferredSide ? 0 : 1.1;
        const cost = travelDist + sidePenalty;
        if (!bestSpot || cost < bestSpot.cost) {
          bestSpot = { x: candX, z: candZ, cost };
        }
      }
    }
  }

  if (bestSpot) {
    const distToSpot = Math.hypot(bestSpot.x - npcX, bestSpot.z - npcZ);
    return {
      active: true,
      mover,
      safeX: bestSpot.x,
      safeZ: bestSpot.z,
      atSafeVerge: distToSpot < 0.42,
      faceX: mover.x,
      faceZ: mover.z,
      evadeSpeedMul,
    };
  }

  // Fallback if boxed in on both sides: stop cleanly in place and face the mover
  return {
    active: true,
    mover,
    safeX: npcX,
    safeZ: npcZ,
    atSafeVerge: true,
    faceX: mover.x,
    faceZ: mover.z,
    evadeSpeedMul,
  };
}

/**
 * Computes a gentle right-hand passing angle bias when two walking NPCs approach
 * each other head-on so villagers naturally give each other shoulder room.
 */
export function computePedestrianPassingBias(
  npcX: number,
  npcZ: number,
  desiredDirX: number,
  desiredDirZ: number,
  otherNpcs: readonly { x: number; z: number; vx: number; vz: number }[],
): number {
  let bias = 0;
  for (let i = 0; i < otherNpcs.length; i++) {
    const o = otherNpcs[i];
    const dx = o.x - npcX;
    const dz = o.z - npcZ;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05 || dist > 3.2) continue;

    // Check if the other NPC is in front of us
    const ahead = (dx * desiredDirX + dz * desiredDirZ) / dist;
    if (ahead < 0.55) continue;

    // Check if they are walking roughly toward us (head-on)
    const oSpd = Math.hypot(o.vx, o.vz);
    if (oSpd > 0.2) {
      const opposing = (o.vx * desiredDirX + o.vz * desiredDirZ) / oSpd;
      if (opposing < -0.35) {
        // Steer politely to the right (+0.32 rad max)
        bias = Math.max(bias, 0.34 * (1 - dist / 3.2));
      }
    }
  }
  return bias;
}
