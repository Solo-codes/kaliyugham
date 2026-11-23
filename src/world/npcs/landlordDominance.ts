import { insideSolid, segmentClear, type Solid } from "../collision";
import type { NpcArchetype } from "./npcTypes";

/**
 * 18th-Century Kerala Landlord (Jenmi / Thampuran) Dominance & Deference Algorithm
 *
 * Models historical rural social hierarchy when a Landlord walks through the village:
 * 1. Commanding Right-of-Way:
 *    - Landlords hold the center of the lane and never step aside for pedestrians.
 * 2. Villager Give-Way ("Side Kodukkuka"):
 *    - Farmers, laborers, village women, and elders within the landlord's approach
 *      corridor (up to 8.5m ahead) clear the center of the road onto the safest dry
 *      roadside spot (strictly validated against buildings, stalls, walls & water).
 * 3. Respectful "Kai Thozhal" (Folded Hands / Anjali Mudra):
 *    - Farmers immediately put away beedis & matchboxes out of respect.
 *    - Once on the side (or already standing nearby within 6.2m), villagers stop,
 *      turn to face the passing landlord, and fold their hands (`pray` / `pray2`
 *      for Kai Thozhal, or formal `greet` for elders) until the landlord passes.
 */

export interface LandlordPresence {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
}

export interface LandlordDeferenceDecision {
  active: boolean;
  /** True when the NPC must step off the center of the road first */
  mustStepAside: boolean;
  safeX: number;
  safeZ: number;
  /** World coordinates of the landlord to face while showing respect */
  faceX: number;
  faceZ: number;
  /** Animation key to play while showing respect ("pray" | "pray2" | "greet") */
  respectAnim: "pray" | "pray2" | "greet";
  /** True if the NPC should put away smoking props immediately */
  suppressSmoking: boolean;
  /** Speed multiplier when stepping aside to make way for the landlord */
  stepAsideSpeedMul: number;
}

export interface LandlordDeferenceParams {
  npcX: number;
  npcZ: number;
  npcArchetype: NpcArchetype;
  npcSocialClass: "poor" | "middle" | "upper";
  seedIdx: number;
  landlords: readonly LandlordPresence[];
  solids: readonly Solid[];
  isBlockedWater: (x: number, z: number) => boolean;
  currentSafeSpot?: [number, number] | null;
}

export function evaluateLandlordDeference(
  params: LandlordDeferenceParams,
): LandlordDeferenceDecision {
  const {
    npcX,
    npcZ,
    npcArchetype,
    npcSocialClass,
    seedIdx,
    landlords,
    solids,
    isBlockedWater,
    currentSafeSpot,
  } = params;

  // Landlord and his entourage (guards & Karyasthan) never yield or bow to others
  if (
    npcArchetype === "landlord" ||
    npcArchetype === "guard" ||
    npcArchetype === "karyasthan" ||
    landlords.length === 0
  ) {
    return {
      active: false,
      mustStepAside: false,
      safeX: npcX,
      safeZ: npcZ,
      faceX: npcX,
      faceZ: npcZ,
      respectAnim: "greet",
      suppressSmoking: false,
      stepAsideSpeedMul: 1,
    };
  }

  let closest: {
    lord: LandlordPresence;
    dirX: number;
    dirZ: number;
    along: number;
    across: number;
    dist: number;
  } | null = null;

  for (let i = 0; i < landlords.length; i++) {
    const lord = landlords[i];
    const relX = npcX - lord.x;
    const relZ = npcZ - lord.z;
    const dist = Math.hypot(relX, relZ);
    if (dist > 9.0) continue;

    const spd = Math.hypot(lord.vx, lord.vz);
    const dirX = spd > 0.15 ? lord.vx / spd : Math.sin(lord.yaw);
    const dirZ = spd > 0.15 ? lord.vz / spd : Math.cos(lord.yaw);
    const rightX = -dirZ;
    const rightZ = dirX;

    const along = relX * dirX + relZ * dirZ;
    const across = relX * rightX + relZ * rightZ;

    // Trigger zone: up to 8.5m ahead of the landlord, or within 6.2m nearby while passing
    const inFrontCorridor = along >= -2.4 && along <= 8.5 && Math.abs(across) <= 5.5;
    const closePresence = dist <= 6.2 && along >= -2.6;
    if (!inFrontCorridor && !closePresence) continue;

    if (!closest || dist < closest.dist) {
      closest = { lord, dirX, dirZ, along, across, dist };
    }
  }

  if (!closest) {
    return {
      active: false,
      mustStepAside: false,
      safeX: npcX,
      safeZ: npcZ,
      faceX: npcX,
      faceZ: npcZ,
      respectAnim: "pray",
      suppressSmoking: false,
      stepAsideSpeedMul: 1,
    };
  }

  const { lord, dirX, dirZ, across } = closest;
  const rightX = -dirZ;
  const rightZ = dirX;

  // Higher deference clearance for laborers/villagers; slightly more composed for elders
  const requiredClearance =
    npcSocialClass === "poor" ? 2.55 : npcArchetype === "elder_man" ? 2.1 : 2.35;
  const stepAsideSpeedMul =
    npcArchetype === "elder_man" ? 0.95 : npcSocialClass === "poor" ? 1.25 : 1.15;

  // Authentic Kerala Kai Thozhal (folded hands):
  // Farmers, laborers & village women fold hands (`pray` / `pray2`); elders give formal `greet` or `pray`
  const respectAnim: "pray" | "pray2" | "greet" =
    npcArchetype === "elder_man"
      ? seedIdx % 2 === 0
        ? "greet"
        : "pray"
      : seedIdx % 2 === 0
        ? "pray"
        : "pray2";

  // Already well off to the side of the landlord's path -> stand still, face him, and do Kai Thozhal!
  if (Math.abs(across) >= requiredClearance - 0.15) {
    return {
      active: true,
      mustStepAside: false,
      safeX: npcX,
      safeZ: npcZ,
      faceX: lord.x,
      faceZ: lord.z,
      respectAnim,
      suppressSmoking: true,
      stepAsideSpeedMul,
    };
  }

  // Keep previously chosen safe roadside spot if still clear (prevents jittering side-to-side)
  if (currentSafeSpot) {
    const [cx, cz] = currentSafeSpot;
    const candAcross = (cx - lord.x) * rightX + (cz - lord.z) * rightZ;
    const blocked =
      isBlockedWater(cx, cz) || solids.some((s) => insideSolid(s, cx, cz, 0.52));
    if (!blocked && Math.abs(candAcross) >= requiredClearance - 0.25) {
      const distToSpot = Math.hypot(cx - npcX, cz - npcZ);
      return {
        active: true,
        mustStepAside: distToSpot > 0.38,
        safeX: cx,
        safeZ: cz,
        faceX: lord.x,
        faceZ: lord.z,
        respectAnim,
        suppressSmoking: true,
        stepAsideSpeedMul,
      };
    }
  }

  // Evaluate both perpendicular sides of the landlord's path to find the cleanest dry verge
  const preferredSide = across >= 0 ? 1 : -1;
  const sideOrder = [preferredSide, -preferredSide];
  const clearances = [requiredClearance, requiredClearance + 0.75, requiredClearance + 1.45];
  const alongOffsets = [0, 0.9, -0.8];

  let bestSpot: { x: number; z: number; cost: number } | null = null;
  for (const side of sideOrder) {
    for (const lat of clearances) {
      for (const aOff of alongOffsets) {
        const deltaAcross = side * lat - across;
        const candX = npcX + rightX * deltaAcross + dirX * aOff;
        const candZ = npcZ + rightZ * deltaAcross + dirZ * aOff;

        if (isBlockedWater(candX, candZ)) continue;
        if (solids.some((s) => insideSolid(s, candX, candZ, 0.55))) continue;
        if (solids.length > 0 && !segmentClear([npcX, npcZ], [candX, candZ], solids, 0.42)) {
          continue;
        }

        const travel = Math.hypot(candX - npcX, candZ - npcZ);
        const cost = travel + (side === preferredSide ? 0 : 1.0);
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
      mustStepAside: distToSpot > 0.38,
      safeX: bestSpot.x,
      safeZ: bestSpot.z,
      faceX: lord.x,
      faceZ: lord.z,
      respectAnim,
      suppressSmoking: true,
      stepAsideSpeedMul,
    };
  }

  // Boxed in on both sides: stop immediately and fold hands facing the landlord
  return {
    active: true,
    mustStepAside: false,
    safeX: npcX,
    safeZ: npcZ,
    faceX: lord.x,
    faceZ: lord.z,
    respectAnim,
    suppressSmoking: true,
    stepAsideSpeedMul,
  };
}
