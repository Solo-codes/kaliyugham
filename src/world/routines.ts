import { advanceWalker, type Walker } from "./navigation";
import type { Point2 } from "./hydrology";

export type PathFinder = (
  x: number,
  z: number,
  targetX: number,
  targetZ: number,
) => readonly Point2[];
export const isWorkday = (hour: number) => hour >= 6 && hour < 18.5;
export function routeTo(walker: Walker, target: Point2, findPath: PathFinder) {
  walker.path = [...findPath(walker.x, walker.z, target[0], target[1]), target];
  walker.waypoint = 0;
}
export type Duty = {
  walker: Walker;
  home: Point2;
  work: Point2;
  destination: "work" | "home";
  arrived: boolean;
  stride: number;
};
export function createDuty(work: Point2, home: Point2): Duty {
  return {
    walker: { x: work[0], z: work[1], path: [], waypoint: 0 },
    home,
    work,
    destination: "work",
    arrived: true,
    stride: 0,
  };
}
export function advanceDuty(
  duty: Duty,
  hour: number,
  delta: number,
  speed: number,
  findPath: PathFinder,
) {
  const destination = isWorkday(hour) ? "work" : "home";
  if (destination !== duty.destination) {
    duty.destination = destination;
    duty.arrived = false;
    routeTo(duty.walker, duty[destination], findPath);
  }
  const movement = advanceWalker(duty.walker, duty.arrived ? 0 : speed * delta);
  duty.stride += movement.traveled * 5;
  if (movement.arrived) duty.arrived = true;
  return {
    ...movement,
    working: duty.destination === "work" && duty.arrived,
    atHome: duty.destination === "home" && duty.arrived,
  };
}
export type InspectionStop = {
  position: Point2;
  lookAt: Point2;
  label: string;
  pause: number;
};
export type Inspection = {
  walker: Walker;
  stop: number;
  wait: number;
  stride: number;
  atStop: boolean;
};
export function createInspection(start: Point2): Inspection {
  return {
    walker: { x: start[0], z: start[1], path: [], waypoint: 0 },
    stop: 0,
    wait: 2,
    stride: 0,
    atStop: true,
  };
}
export function advanceInspection(
  state: Inspection,
  stops: readonly InspectionStop[],
  delta: number,
  speed: number,
  findPath: PathFinder,
) {
  let traveled = 0,
    directionX = 0,
    directionZ = 0;
  if (state.atStop) {
    state.wait = Math.max(0, state.wait - delta);
    if (state.wait === 0 && delta > 0) {
      state.stop = (state.stop + 1) % stops.length;
      routeTo(state.walker, stops[state.stop].position, findPath);
      state.atStop = false;
    }
  } else {
    const step = advanceWalker(state.walker, speed * delta);
    ({ traveled, directionX, directionZ } = step);
    if (step.arrived) {
      state.atStop = true;
      state.wait = stops[state.stop].pause;
    }
  }
  state.stride += traveled * 5;
  return {
    traveled,
    directionX,
    directionZ,
    inspecting: state.atStop,
    label: stops[state.stop].label,
    lookAt: stops[state.stop].lookAt,
  };
}
/** Partner drills alternate a controlled cut with a buckler guard; no combat damage. */
export function sampleKalariDrill(time: number, offset = 0) {
  const phase = (((time + offset) % 6) + 6) % 6;
  const cut = phase < 3 ? Math.sin((phase / 3) * Math.PI) : 0;
  const guard = phase >= 3 ? Math.sin(((phase - 3) / 3) * Math.PI) : 0;
  return {
    cut,
    guard,
    stance: 0.18 + cut * 0.18,
    sword: 0.65 + cut * 1.25,
    shield: 0.55 + guard * 0.7,
  };
}
export function horseAction(mounted: boolean, distance: number, safe: boolean) {
  return mounted
    ? "dismount"
    : !safe
      ? "unavailable"
      : distance <= 2.6
        ? "mount"
        : "summon";
}
