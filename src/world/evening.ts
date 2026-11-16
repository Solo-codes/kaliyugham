import { advanceWalker, type Walker } from "./navigation";
import {
  advanceInspection,
  routeTo,
  type Inspection,
  type InspectionStop,
  type PathFinder,
} from "./routines";
import type { Point2 } from "./hydrology";

export type HouseholdCurfew = {
  phase: "visiting" | "returning" | "indoors" | "leaving";
};
export const householdOutsideHours = (hour: number) => hour >= 7 && hour < 15;
export const predatorNightHours = (hour: number) => hour >= 19 || hour < 5.5;

/** Leave inspections in the afternoon so the household is indoors before darkness. */
export function advanceHousehold(
  curfew: HouseholdCurfew,
  journey: Inspection,
  stops: readonly InspectionStop[],
  hour: number,
  delta: number,
  pace: number,
  findPath: PathFinder,
  gate: Point2,
  courtyard: Point2,
) {
  if (delta > 0) {
    if (
      !householdOutsideHours(hour) &&
      (curfew.phase === "visiting" || curfew.phase === "leaving")
    ) {
      curfew.phase = "returning";
      routeTo(journey.walker, gate, findPath);
      journey.walker.path = [...journey.walker.path, courtyard];
    } else if (householdOutsideHours(hour) && curfew.phase === "indoors") {
      curfew.phase = "leaving";
      const exitPath = findPath(
        gate[0],
        gate[1],
        stops[0].position[0],
        stops[0].position[1],
      );
      journey.walker.path = [gate, ...exitPath, stops[0].position];
      journey.walker.waypoint = 0;
      journey.stop = 0;
    }
  }
  if (curfew.phase === "visiting") {
    return {
      ...advanceInspection(journey, stops, delta, pace, findPath),
      indoors: false,
      phase: curfew.phase,
    };
  }
  const movement = advanceWalker(
    journey.walker,
    curfew.phase === "indoors" ? 0 : delta * Math.max(6, pace),
  );
  journey.stride += movement.traveled * 5;
  if (delta > 0 && movement.arrived) {
    if (curfew.phase === "returning") curfew.phase = "indoors";
    else if (curfew.phase === "leaving") {
      curfew.phase = "visiting";
      journey.atStop = true;
      journey.wait = stops[0].pause;
    }
  }
  return {
    ...movement,
    inspecting: false,
    lookAt: courtyard,
    label:
      curfew.phase === "indoors"
        ? "At home in the estate"
        : curfew.phase === "returning"
          ? "Returning to the estate"
          : "Leaving the estate",
    indoors: curfew.phase === "indoors",
    phase: curfew.phase,
  };
}

export type NightPatrol = {
  walker: Walker;
  route: readonly Point2[];
  outward: boolean;
  resting: boolean;
  stride: number;
};
export function createNightPatrol(route: readonly Point2[]): NightPatrol {
  return {
    walker: { x: route[0][0], z: route[0][1], path: [], waypoint: 0 },
    route,
    outward: true,
    resting: true,
    stride: 0,
  };
}
/** Travel from a den to the far-bank lane at night and retrace the same dry path at dawn. */
export function advanceNightPatrol(
  patrol: NightPatrol,
  hour: number,
  delta: number,
  pace: number,
) {
  const night = predatorNightHours(hour);
  if (delta > 0 && night && patrol.resting) {
    patrol.resting = false;
    patrol.outward = true;
    patrol.walker.path = patrol.route.slice(1);
    patrol.walker.waypoint = 0;
  } else if (delta > 0 && !night && !patrol.resting && patrol.outward) {
    const visited = patrol.route.slice(0, patrol.walker.waypoint + 1);
    patrol.walker.path = [...visited].reverse();
    patrol.walker.waypoint = 0;
    patrol.outward = false;
  }
  const movement = advanceWalker(
    patrol.walker,
    patrol.resting ? 0 : Math.max(0, delta) * pace,
  );
  patrol.stride += movement.traveled * 5;
  if (delta > 0 && movement.arrived && !patrol.resting) {
    if (!night) patrol.resting = true;
    else {
      patrol.outward = !patrol.outward;
      patrol.walker.path = patrol.outward
        ? patrol.route.slice(1)
        : [...patrol.route].reverse().slice(1);
      patrol.walker.waypoint = 0;
    }
  }
  return {
    ...movement,
    visible: night || !patrol.resting,
    resting: patrol.resting,
    night,
  };
}

export const predatorTrails: readonly (readonly Point2[])[] = [
  [
    [-74, -62],
    [-69, -45],
    [-63, -30],
    [-56, -18],
    [-50, -9],
    [-50, 0],
  ],
  [
    [-76, -22],
    [-67, -20],
    [-59, -17],
    [-52, -12],
    [-50, -4],
    [-50, 0],
  ],
  [
    [-73, -27],
    [-67, -23],
    [-60, -20],
    [-54, -14],
    [-50, -8],
    [-50, -2],
  ],
];
