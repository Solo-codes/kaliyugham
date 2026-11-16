import * as THREE from "three";

export type Point2 = readonly [number, number];
export type HeightAt = (x: number, z: number) => number;
export type WaterInfo = {
  kind: "river" | "pond" | "paddy" | "sea";
  surfaceY: number;
  depth: number;
};

export const RIVER_HALF_WIDTH = 3.7;
export const POND_RADIUS_X = 4.5 * 1.32;
export const POND_RADIUS_Z = 4.5;
const RIVER_BANK_RADIUS = 5.6;
const RIVER_DEPTH = 2.2;
const POND_DEPTH = 1.8;
const RIVER_SURFACE_OFFSET = -0.25;
const NEARBY_RIVER_RADIUS = 12;
const CELL_SIZE = 12;

type RiverSegment = {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  lengthSquared: number;
};
export type RiverSample = { x: number; z: number; distance: number };

const smoothStep = (start: number, end: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Use this same spline for the visible water, terrain carving and swim tests. */
export function createWaterModel(
  riverPoints: readonly Point2[],
  baseHeight: HeightAt,
  pondCenter: Point2,
  paddyPlots: readonly Point2[],
) {
  const river = new THREE.CatmullRomCurve3(
    riverPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "catmullrom",
    0.3,
  );
  // Short projected segments track the same curved river without per-frame spline allocations.
  const samples = river.getSpacedPoints(320);
  const buckets = new Map<string, RiverSegment[]>();
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segment: RiverSegment = {
      ax: a.x,
      az: a.z,
      dx,
      dz,
      lengthSquared: dx * dx + dz * dz,
    };
    const minX = Math.floor(
      (Math.min(a.x, b.x) - NEARBY_RIVER_RADIUS) / CELL_SIZE,
    );
    const maxX = Math.floor(
      (Math.max(a.x, b.x) + NEARBY_RIVER_RADIUS) / CELL_SIZE,
    );
    const minZ = Math.floor(
      (Math.min(a.z, b.z) - NEARBY_RIVER_RADIUS) / CELL_SIZE,
    );
    const maxZ = Math.floor(
      (Math.max(a.z, b.z) + NEARBY_RIVER_RADIUS) / CELL_SIZE,
    );
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
        const key = `${cellX},${cellZ}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.push(segment);
        else buckets.set(key, [segment]);
      }
    }
  }

  const closestRiverPoint = (x: number, z: number): RiverSample | undefined => {
    const key = `${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`;
    const segments = buckets.get(key);
    if (!segments) return undefined;
    let bestDistanceSquared = NEARBY_RIVER_RADIUS * NEARBY_RIVER_RADIUS;
    let closestX = 0;
    let closestZ = 0;
    let found = false;
    for (const segment of segments) {
      const t =
        segment.lengthSquared === 0
          ? 0
          : THREE.MathUtils.clamp(
              ((x - segment.ax) * segment.dx + (z - segment.az) * segment.dz) /
                segment.lengthSquared,
              0,
              1,
            );
      const pointX = segment.ax + segment.dx * t;
      const pointZ = segment.az + segment.dz * t;
      const distanceSquared = (x - pointX) ** 2 + (z - pointZ) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        closestX = pointX;
        closestZ = pointZ;
        found = true;
      }
    }
    return found
      ? { x: closestX, z: closestZ, distance: Math.sqrt(bestDistanceSquared) }
      : undefined;
  };

  const distanceToRiver = (x: number, z: number) =>
    closestRiverPoint(x, z)?.distance ?? Infinity;
  const riverSurface = (x: number, z: number) =>
    baseHeight(x, z) + RIVER_SURFACE_OFFSET;
  const pondSurfaceY = baseHeight(pondCenter[0], pondCenter[1]) - 0.2;
  const pondDistance = (x: number, z: number) =>
    Math.hypot(
      (x - pondCenter[0]) / POND_RADIUS_X,
      (z - pondCenter[1]) / POND_RADIUS_Z,
    );

  const terrainHeight = (x: number, z: number) => {
    let height = baseHeight(x, z);
    const riverPoint = closestRiverPoint(x, z);
    if (riverPoint && riverPoint.distance < RIVER_BANK_RADIUS) {
      const surfaceY = riverSurface(riverPoint.x, riverPoint.z);
      if (riverPoint.distance <= RIVER_HALF_WIDTH) {
        const depth =
          RIVER_DEPTH *
          (1 -
            smoothStep(
              RIVER_HALF_WIDTH * 0.55,
              RIVER_HALF_WIDTH,
              riverPoint.distance,
            ));
        height = Math.min(height, surfaceY - depth);
      } else {
        const bank = smoothStep(
          RIVER_HALF_WIDTH,
          RIVER_BANK_RADIUS,
          riverPoint.distance,
        );
        height = Math.min(height, THREE.MathUtils.lerp(surfaceY, height, bank));
      }
    }
    const distance = pondDistance(x, z);
    if (distance < 1.35) {
      if (distance <= 1) {
        const depth = POND_DEPTH * (1 - smoothStep(0.55, 1, distance));
        height = Math.min(height, pondSurfaceY - depth);
      } else {
        height = Math.min(
          height,
          THREE.MathUtils.lerp(
            pondSurfaceY,
            height,
            smoothStep(1, 1.35, distance),
          ),
        );
      }
    }
    return height;
  };

  const getWaterInfo = (x: number, z: number): WaterInfo | undefined => {
    const riverPoint = closestRiverPoint(x, z);
    if (riverPoint && riverPoint.distance < RIVER_HALF_WIDTH) {
      const surfaceY = riverSurface(riverPoint.x, riverPoint.z);
      const depth = surfaceY - terrainHeight(x, z);
      if (depth > 0.04) return { kind: "river", surfaceY, depth };
    }
    if (pondDistance(x, z) < 1) {
      const depth = pondSurfaceY - terrainHeight(x, z);
      if (depth > 0.04) return { kind: "pond", surfaceY: pondSurfaceY, depth };
    }
    for (const [fieldX, fieldZ] of paddyPlots) {
      if (Math.abs(x - fieldX) < 5.45 && Math.abs(z - fieldZ) < 4.45) {
        // The modeled flooded soil is shallow, regardless of the natural hills below the plot.
        return {
          kind: "paddy",
          surfaceY: baseHeight(fieldX, fieldZ) + 0.06,
          depth: 0.18,
        };
      }
    }
    const groundY = terrainHeight(x, z);
    if (groundY < -7.2)
      return { kind: "sea", surfaceY: -7.2, depth: -7.2 - groundY };
    return undefined;
  };

  return {
    river,
    closestRiverPoint,
    distanceToRiver,
    riverSurface,
    pondSurfaceY,
    terrainHeight,
    getWaterInfo,
  };
}

export type Crossing = {
  x: number;
  z: number;
  roadX: number;
  roadZ: number;
  riverX: number;
  riverZ: number;
};

/** Find an actual intersection of the rendered splines, not the control-point polylines. */
export function findCrossing(
  road: THREE.Curve<THREE.Vector3>,
  river: THREE.Curve<THREE.Vector3>,
): Crossing | undefined {
  const roadPoints = road.getSpacedPoints(240);
  const riverPoints = river.getSpacedPoints(320);
  for (let i = 0; i < roadPoints.length - 1; i++) {
    const a = roadPoints[i];
    const b = roadPoints[i + 1];
    const roadX = b.x - a.x;
    const roadZ = b.z - a.z;
    for (let j = 0; j < riverPoints.length - 1; j++) {
      const c = riverPoints[j];
      const d = riverPoints[j + 1];
      const riverX = d.x - c.x;
      const riverZ = d.z - c.z;
      const denominator = roadX * riverZ - roadZ * riverX;
      if (Math.abs(denominator) < 1e-8) continue;
      const qx = c.x - a.x;
      const qz = c.z - a.z;
      const alongRoad = (qx * riverZ - qz * riverX) / denominator;
      const alongRiver = (qx * roadZ - qz * roadX) / denominator;
      if (alongRoad < 0 || alongRoad > 1 || alongRiver < 0 || alongRiver > 1)
        continue;
      const roadLength = Math.hypot(roadX, roadZ);
      const riverLength = Math.hypot(riverX, riverZ);
      return {
        x: a.x + roadX * alongRoad,
        z: a.z + roadZ * alongRoad,
        roadX: roadX / roadLength,
        roadZ: roadZ / roadLength,
        riverX: riverX / riverLength,
        riverZ: riverZ / riverLength,
      };
    }
  }
  return undefined;
}

export type BridgeSpan = Crossing & {
  halfLength: number;
  halfWidth: number;
  startY: number;
  endY: number;
};

export function createBridgeSpan(
  crossing: Crossing,
  heightAt: HeightAt,
): BridgeSpan {
  const crossingSine = Math.abs(
    crossing.roadX * crossing.riverZ - crossing.roadZ * crossing.riverX,
  );
  const halfLength = (RIVER_HALF_WIDTH + 1.8) / Math.max(crossingSine, 0.35);
  return {
    ...crossing,
    halfLength,
    halfWidth: 1.35,
    startY:
      heightAt(
        crossing.x - crossing.roadX * halfLength,
        crossing.z - crossing.roadZ * halfLength,
      ) + 0.12,
    endY:
      heightAt(
        crossing.x + crossing.roadX * halfLength,
        crossing.z + crossing.roadZ * halfLength,
      ) + 0.12,
  };
}

/** Height on the walkable deck; undefined means the point is off the bridge. */
export function bridgeHeightAt(
  bridge: BridgeSpan,
  x: number,
  z: number,
): number | undefined {
  const dx = x - bridge.x;
  const dz = z - bridge.z;
  const along = dx * bridge.roadX + dz * bridge.roadZ;
  const across = -dx * bridge.roadZ + dz * bridge.roadX;
  if (
    Math.abs(along) > bridge.halfLength ||
    Math.abs(across) > bridge.halfWidth
  )
    return undefined;
  return THREE.MathUtils.lerp(
    bridge.startY,
    bridge.endY,
    (along + bridge.halfLength) / (2 * bridge.halfLength),
  );
}
