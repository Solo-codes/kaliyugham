import * as THREE from "three";
import type { Point2 } from "./hydrology";

type Node = { x: number; z: number; links: { to: number; distance: number }[] };

/** Shared road control points become junctions; intermediate nodes follow the visible spline. */
export function createNavigationGraph(
  routes: readonly (readonly Point2[])[],
  curves: readonly THREE.CatmullRomCurve3[],
) {
  const nodes: Node[] = [];
  const byPosition = new Map<string, number>();
  const nodeAt = (x: number, z: number) => {
    const key = `${x.toFixed(4)},${z.toFixed(4)}`;
    const existing = byPosition.get(key);
    if (existing !== undefined) return existing;
    const id = nodes.length;
    nodes.push({ x, z, links: [] });
    byPosition.set(key, id);
    return id;
  };

  routes.forEach((route, routeIndex) => {
    let previous: number | undefined;
    const curve = curves[routeIndex];
    for (let segment = 0; segment < route.length - 1; segment++) {
      const start = route[segment];
      const end = route[segment + 1];
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 2),
      );
      for (let step = 0; step <= steps; step++) {
        if (segment > 0 && step === 0) continue;
        const point = curve.getPoint(
          (segment + step / steps) / (route.length - 1),
        );
        const current = nodeAt(point.x, point.z);
        if (previous !== undefined && previous !== current) {
          const a = nodes[previous];
          const b = nodes[current];
          const distance = Math.hypot(a.x - b.x, a.z - b.z);
          if (!a.links.some((link) => link.to === current))
            a.links.push({ to: current, distance });
          if (!b.links.some((link) => link.to === previous))
            b.links.push({ to: previous, distance });
        }
        previous = current;
      }
    }
  });

  const nearest = (x: number, z: number) => {
    let best = -1;
    let distance = Infinity;
    nodes.forEach((node, index) => {
      const d = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (d < distance) {
        best = index;
        distance = d;
      }
    });
    return best;
  };

  const findPath = (
    startX: number,
    startZ: number,
    targetX: number,
    targetZ: number,
  ): Point2[] => {
    const start = nearest(startX, startZ);
    const end = nearest(targetX, targetZ);
    if (start < 0 || end < 0) return [];
    const distances = new Float64Array(nodes.length).fill(Infinity);
    const previous = new Int32Array(nodes.length).fill(-1);
    const visited = new Uint8Array(nodes.length);
    distances[start] = 0;
    for (let iteration = 0; iteration < nodes.length; iteration++) {
      let current = -1;
      let best = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (!visited[i] && distances[i] < best) {
          best = distances[i];
          current = i;
        }
      }
      if (current < 0 || current === end) break;
      visited[current] = 1;
      for (const link of nodes[current].links) {
        const distance = distances[current] + link.distance;
        if (distance < distances[link.to]) {
          distances[link.to] = distance;
          previous[link.to] = current;
        }
      }
    }
    if (!Number.isFinite(distances[end])) return [];
    const path: Point2[] = [];
    for (let current = end; current >= 0; current = previous[current]) {
      path.push([nodes[current].x, nodes[current].z]);
      if (current === start) break;
    }
    return path.reverse();
  };

  const nearestPoint = (x: number, z: number): Point2 | undefined => {
    const index = nearest(x, z);
    return index < 0 ? undefined : [nodes[index].x, nodes[index].z];
  };

  return { findPath, nearestPoint };
}

export type Walker = {
  x: number;
  z: number;
  path: readonly Point2[];
  waypoint: number;
};
type WalkerMotion = {
  move: (start: Point2, target: Point2) => Point2;
  detour: (start: Point2, target: Point2, walker?: Walker) => Point2[];
  safePoint?: (point: Point2) => Point2;
  yield?: (
    walker: Walker,
    distance: number,
  ) =>
    | {
        traveled: number;
        directionX: number;
        directionZ: number;
        arrived: boolean;
      }
    | undefined;
};
let walkerMotion: WalkerMotion | undefined;
const checkedWaypoints = new WeakMap<Walker, string>();
const blockedDistances = new WeakMap<Walker, number>();
export function setWalkerMotion(motion: WalkerMotion | undefined) {
  walkerMotion = motion;
}

/** Advance by traveled distance, so footstep animation can match real movement. */
export function advanceWalker(walker: Walker, distance: number) {
  if (distance > 0 && walkerMotion?.yield) {
    const yielding = walkerMotion.yield(walker, distance);
    if (yielding) return yielding;
  }
  let remaining = Math.max(0, distance);
  let traveled = 0;
  let directionX = 0;
  let directionZ = 0;
  while (remaining > 0 && walker.waypoint < walker.path.length) {
    let [targetX, targetZ] = walker.path[walker.waypoint];
    if (walkerMotion?.safePoint) {
      const safe = walkerMotion.safePoint([targetX, targetZ]);
      if (safe[0] !== targetX || safe[1] !== targetZ) {
        walker.path = [
          ...walker.path.slice(0, walker.waypoint),
          safe,
          ...walker.path.slice(walker.waypoint + 1),
        ];
        [targetX, targetZ] = safe;
      }
    }
    const waypointKey = `${walker.waypoint}:${targetX.toFixed(4)},${targetZ.toFixed(4)}`;
    if (walkerMotion && checkedWaypoints.get(walker) !== waypointKey) {
      const detour = walkerMotion.detour(
        [walker.x, walker.z],
        [targetX, targetZ],
        walker,
      );
      if (detour.length > 1) {
        walker.path = [
          ...walker.path.slice(0, walker.waypoint),
          ...detour,
          ...walker.path.slice(walker.waypoint + 1),
        ];
        [targetX, targetZ] = walker.path[walker.waypoint];
      }
      checkedWaypoints.set(
        walker,
        `${walker.waypoint}:${targetX.toFixed(4)},${targetZ.toFixed(4)}`,
      );
    }
    const dx = targetX - walker.x;
    const dz = targetZ - walker.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) {
      walker.waypoint++;
      continue;
    }
    const step = Math.min(remaining, length);
    directionX = dx / length;
    directionZ = dz / length;
    const next: Point2 = walkerMotion
      ? walkerMotion.move(
          [walker.x, walker.z],
          [walker.x + directionX * step, walker.z + directionZ * step],
        )
      : [walker.x + directionX * step, walker.z + directionZ * step];
    const actual = Math.hypot(next[0] - walker.x, next[1] - walker.z);
    walker.x = next[0];
    walker.z = next[1];
    traveled += actual;
    remaining -= step;
    if (Math.hypot(targetX - walker.x, targetZ - walker.z) < 0.03)
      walker.waypoint++;
    if (actual < step * 0.5) {
      const blocked = (blockedDistances.get(walker) ?? 0) + step;
      blockedDistances.set(walker, blocked);
      if (blocked > 0.35) {
        checkedWaypoints.delete(walker);
        blockedDistances.set(walker, 0);
      }
      break;
    } else blockedDistances.set(walker, 0);
  }
  return {
    traveled,
    directionX,
    directionZ,
    arrived: walker.waypoint >= walker.path.length,
  };
}
