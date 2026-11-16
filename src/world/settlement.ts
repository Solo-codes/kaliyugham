import type { Point2 } from "./hydrology";

export type LotRules = {
  distanceToRoad: (x: number, z: number) => number;
  isAllowed: (x: number, z: number) => boolean;
  roadClearance?: number;
  houseSpacing?: number;
  worldLimit?: number;
};

/** Search outwards from each requested cottage; never accept an obstructed lot. */
export function placeHouseLots(
  sites: readonly Point2[],
  rules: LotRules,
): [number, number][] {
  const placed: [number, number][] = [];
  const roadClearance = rules.roadClearance ?? 6.5;
  const houseSpacing = rules.houseSpacing ?? 8.5;
  const worldLimit = rules.worldLimit ?? 82;
  for (const [siteIndex, [originX, originZ]] of sites.entries()) {
    let result: [number, number] | undefined;
    for (let radius = 0; radius <= 55 && !result; radius += 1) {
      const count =
        radius === 0
          ? 1
          : Math.max(16, Math.ceil((2 * Math.PI * radius) / 1.8));
      for (let step = 0; step < count; step++) {
        const angle = siteIndex * 1.618 + (step / count) * Math.PI * 2;
        const x = originX + Math.cos(angle) * radius;
        const z = originZ + Math.sin(angle) * radius;
        if (Math.abs(x) > worldLimit || Math.abs(z) > worldLimit) continue;
        if (
          rules.distanceToRoad(x, z) < roadClearance ||
          !rules.isAllowed(x, z)
        )
          continue;
        if (
          placed.some(
            ([otherX, otherZ]) =>
              Math.hypot(x - otherX, z - otherZ) < houseSpacing,
          )
        )
          continue;
        result = [x, z];
        break;
      }
    }
    if (!result)
      throw new Error(
        `Could not find a clear cottage lot near ${originX}, ${originZ}.`,
      );
    placed.push(result);
  }
  return placed;
}

export type BackyardPlan = { rotation: number; hasYard: boolean };

/** The cottage door and porch face local -Z; stop just beyond the porch. */
export function cottageDoorstep(
  house: Point2,
  rotation: number,
): [number, number] {
  return [
    house[0] - Math.sin(rotation) * 3.25,
    house[1] - Math.cos(rotation) * 3.25,
  ];
}

/** Face cottages toward the nearest lane and put coops behind them only when the yard is clear. */
export function planBackyards(
  houses: readonly Point2[],
  nearestRoad: (x: number, z: number) => { x: number; z: number } | undefined,
  isAllowed: (x: number, z: number, houseIndex: number) => boolean,
): BackyardPlan[] {
  const yards: Point2[] = [];
  return houses.map(([x, z], houseIndex) => {
    const road = nearestRoad(x, z);
    const facing = road
      ? Math.atan2(x - road.x, z - road.z)
      : Math.atan2(x - 23, z + 26);
    for (const offset of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      const rotation = facing + offset;
      const cosine = Math.cos(rotation);
      const sine = Math.sin(rotation);
      const center: Point2 = [x + 7 * sine, z + 7 * cosine];
      if (
        yards.some(
          ([otherX, otherZ]) =>
            Math.hypot(center[0] - otherX, center[1] - otherZ) < 5.5,
        )
      )
        continue;
      let clear = true;
      for (let localX = -3.3; localX <= 3.31 && clear; localX += 1.65) {
        for (let localZ = 5.2; localZ <= 8.81; localZ += 0.9) {
          const worldX = x + localX * cosine + localZ * sine;
          const worldZ = z - localX * sine + localZ * cosine;
          if (!isAllowed(worldX, worldZ, houseIndex)) {
            clear = false;
            break;
          }
        }
      }
      if (clear) {
        yards.push(center);
        return { rotation, hasYard: true };
      }
    }
    return { rotation: facing, hasYard: false };
  });
}
