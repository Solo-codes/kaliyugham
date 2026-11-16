import type { Point2 } from "./hydrology";
import { advanceWalker, type Walker } from "./navigation";
import { routeTo, type PathFinder } from "./routines";

export type CartApproach = {
  x: number;
  z: number;
  dx: number;
  dz: number;
  moving: boolean;
};
export function keepYielding(
  point: Point2,
  cart: CartApproach,
  seconds: number,
  blockedSeconds: number,
) {
  const along = (point[0] - cart.x) * cart.dx + (point[1] - cart.z) * cart.dz;
  return (
    cart.moving &&
    along > -4 &&
    Math.hypot(point[0] - cart.x, point[1] - cart.z) < 10 &&
    seconds < 6 &&
    blockedSeconds < 1.25
  );
}
export function rainCoverFor(
  household: boolean,
  index: number,
): "umbrella" | "leaf" | "none" {
  return household ? "umbrella" : index % 3 === 0 ? "none" : "leaf";
}
export function cartThreat(point: Point2, cart: CartApproach) {
  const dx = point[0] - cart.x,
    dz = point[1] - cart.z;
  const along = dx * cart.dx + dz * cart.dz,
    across = dx * cart.dz - dz * cart.dx;
  return cart.moving && along > -3.8 && along < 9 && Math.abs(across) < 2.4;
}
export function roadsideCandidates(
  point: Point2,
  cart: CartApproach,
): Point2[] {
  const across = (point[0] - cart.x) * cart.dz - (point[1] - cart.z) * cart.dx;
  const side = across >= 0 ? 1 : -1;
  return [side, -side].flatMap((sign) =>
    [2.9, 3.5].map(
      (clearance) =>
        [
          point[0] + cart.dz * (sign * clearance - across),
          point[1] - cart.dx * (sign * clearance - across),
        ] as Point2,
    ),
  );
}
export function findGatheringSpot(
  origin: Point2,
  slot: number,
  clear: (x: number, z: number) => boolean,
): Point2 {
  for (let ring = 0; ring < 8; ring++)
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2 + slot * 0.73;
      const radius = 2.8 + ring * 0.55;
      const point: Point2 = [
        origin[0] + Math.cos(angle) * radius,
        origin[1] + Math.sin(angle) * radius,
      ];
      if (clear(...point)) return point;
    }
  return origin;
}
export type FarmDelivery = {
  phase: "loading" | "market" | "unloading" | "return" | "parked";
  wait: number;
  delivered: number;
  loaded: boolean;
};
export function createFarmDelivery(): FarmDelivery {
  return { phase: "loading", wait: 5, delivered: 0, loaded: false };
}
export function advanceFarmDelivery(
  state: FarmDelivery,
  walker: Walker,
  hour: number,
  delta: number,
  speed: number,
  farm: Point2,
  market: Point2,
  path: PathFinder,
) {
  const open = hour >= 6 && hour < 18.5;
  if (
    delta > 0 &&
    !open &&
    state.phase !== "return" &&
    state.phase !== "parked"
  ) {
    state.phase = "return";
    routeTo(walker, farm, path);
  } else if (delta > 0 && open && state.phase === "parked") {
    state.phase = "loading";
    state.wait = 5;
  }
  let traveled = 0,
    directionX = 0,
    directionZ = 0;
  if (state.phase === "market" || state.phase === "return") {
    const step = advanceWalker(walker, Math.max(0, delta) * speed);
    ({ traveled, directionX, directionZ } = step);
    if (delta > 0 && step.arrived) {
      if (state.phase === "market") {
        state.phase = "unloading";
        state.wait = 7;
      } else {
        state.phase = open ? "loading" : "parked";
        state.wait = 5;
      }
    }
  } else if (
    (state.phase === "loading" || state.phase === "unloading") &&
    delta > 0
  ) {
    state.wait = Math.max(0, state.wait - delta);
    if (state.wait === 0) {
      if (state.phase === "loading") {
        state.loaded = true;
        state.phase = "market";
        routeTo(walker, market, path);
      } else {
        state.loaded = false;
        state.delivered++;
        state.phase = "return";
        routeTo(walker, farm, path);
      }
    }
  }
  return { traveled, directionX, directionZ, parked: state.phase === "parked" };
}
