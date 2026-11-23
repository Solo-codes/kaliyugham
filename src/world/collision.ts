import type { Point2 } from "./hydrology";
export type Solid = {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  rotation: number;
};
export type Body = { x: number; z: number; radius: number };
/** Find the closest standing point outside padded footprints, not an unreachable wall centre. */
export function clearStandingPoint(
  point: Point2,
  solids: readonly Solid[],
  radius = 0.36,
): Point2 {
  let result: Point2 = point;
  for (let pass = 0; pass < 12; pass++) {
    const solid = solids.find((s) => insideSolid(s, ...result, radius));
    if (!solid) return result;
    const c = Math.cos(solid.rotation),
      s = Math.sin(solid.rotation),
      dx = result[0] - solid.x,
      dz = result[1] - solid.z;
    const x = dx * c - dz * s,
      z = dx * s + dz * c,
      hx = solid.halfX + radius + 0.06,
      hz = solid.halfZ + radius + 0.06;
    const options: Point2[] = [
      [hx, z],
      [-hx, z],
      [x, hz],
      [x, -hz],
    ];
    options.sort(
      (a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z),
    );
    const next = options[0];
    result = [
      solid.x + next[0] * c + next[1] * s,
      solid.z - next[0] * s + next[1] * c,
    ];
  }
  return result;
}
export function insideSolid(solid: Solid, x: number, z: number, radius = 0) {
  const dx = x - solid.x,
    dz = z - solid.z,
    c = Math.cos(solid.rotation),
    s = Math.sin(solid.rotation);
  return (
    Math.abs(dx * c - dz * s) < solid.halfX + radius &&
    Math.abs(dx * s + dz * c) < solid.halfZ + radius
  );
}
export function segmentClear(
  a: Point2,
  b: Point2,
  solids: readonly Solid[],
  radius = 0.35,
) {
  // Slab intersection in each obstacle's local coordinates prevents tunnelling.
  return !solids.some((solid) => {
    const c = Math.cos(solid.rotation),
      s = Math.sin(solid.rotation);
    const ax = (a[0] - solid.x) * c - (a[1] - solid.z) * s,
      az = (a[0] - solid.x) * s + (a[1] - solid.z) * c;
    const bx = (b[0] - solid.x) * c - (b[1] - solid.z) * s,
      bz = (b[0] - solid.x) * s + (b[1] - solid.z) * c;
    let low = 0,
      high = 1;
    for (const [origin, direction, half] of [
      [ax, bx - ax, solid.halfX + radius],
      [az, bz - az, solid.halfZ + radius],
    ]) {
      if (Math.abs(direction) < 1e-9) {
        if (Math.abs(origin) >= half) return false;
        continue;
      }
      const t1 = (-half - origin) / direction,
        t2 = (half - origin) / direction;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
      if (low > high) return false;
    }
    return low < 1 && high > 0;
  });
}
export function moveBody(
  start: Point2,
  target: Point2,
  radius: number,
  solids: readonly Solid[],
  bodies: readonly Body[] = [],
): Point2 {
  let x = start[0],
    z = start[1];
  const distance = Math.hypot(target[0] - x, target[1] - z),
    steps = Math.max(1, Math.ceil(distance / 0.15));
  const dx = (target[0] - x) / steps,
    dz = (target[1] - z) / steps;
  const neighbours = bodies.filter(
    (body) => Math.hypot(body.x - start[0], body.z - start[1]) > 0.12,
  );
  const clear = (px: number, pz: number) =>
    !solids.some((solid) => insideSolid(solid, px, pz, radius)) &&
    neighbours.every(
      (body) =>
        Math.hypot(body.x - px, body.z - pz) >=
        Math.min(radius + body.radius, Math.hypot(body.x - x, body.z - z)) -
          0.00001,
    );
  for (let step = 0; step < steps; step++) {
    if (clear(x + dx, z + dz)) {
      x += dx;
      z += dz;
    } else if (clear(x + dx, z)) {
      x += dx;
    } else if (clear(x, z + dz)) {
      z += dz;
    }
  }
  return [x, z];
}
export function obstacleDetour(
  start: Point2,
  target: Point2,
  solids: readonly Solid[],
  radius = 0.4,
): Point2[] {
  const safeStart = clearStandingPoint(start, solids, radius + 0.02);
  const safeTarget = clearStandingPoint(target, solids, radius + 0.02);
  if (segmentClear(safeStart, safeTarget, solids, radius)) return [safeTarget];
  const nearby = solids.filter(
    (s) =>
      Math.hypot(s.x - safeStart[0], s.z - safeStart[1]) +
        Math.hypot(s.x - safeTarget[0], s.z - safeTarget[1]) <
      Math.hypot(safeTarget[0] - safeStart[0], safeTarget[1] - safeStart[1]) + 25,
  );
  const points: Point2[] = [safeStart, safeTarget];
  for (const solid of nearby)
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const lx = x * (solid.halfX + radius + 0.08),
          lz = z * (solid.halfZ + radius + 0.08),
          c = Math.cos(solid.rotation),
          s = Math.sin(solid.rotation);
        const point: Point2 = [
          solid.x + lx * c + lz * s,
          solid.z - lx * s + lz * c,
        ];
        if (
          !solids.some((other) =>
            insideSolid(other, point[0], point[1], radius),
          )
        )
          points.push(point);
      }
  const distance = points.map(() => Infinity),
    previous = points.map(() => -1),
    done = new Set<number>();
  distance[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let current = -1;
    for (let i = 0; i < points.length; i++)
      if (!done.has(i) && (current < 0 || distance[i] < distance[current]))
        current = i;
    if (current < 0 || !Number.isFinite(distance[current]) || current === 1)
      break;
    done.add(current);
    for (let i = 0; i < points.length; i++)
      if (
        !done.has(i) &&
        segmentClear(points[current], points[i], solids, radius)
      ) {
        const next =
          distance[current] +
          Math.hypot(
            points[current][0] - points[i][0],
            points[current][1] - points[i][1],
          );
        if (next < distance[i]) {
          distance[i] = next;
          previous[i] = current;
        }
      }
  }
  if (!Number.isFinite(distance[1])) return [];
  const result: Point2[] = [];
  for (let i = 1; i > 0; i = previous[i]) {
    if (i < 0) return [];
    result.push(points[i]);
  }
  return result.reverse();
}
