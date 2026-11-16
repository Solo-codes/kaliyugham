import * as THREE from "three";
import type { Point2 } from "./hydrology";

type Segment = {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  lengthSquared: number;
  routeIndex: number;
};

export type RoadPoint = {
  x: number;
  z: number;
  distance: number;
  tangentX: number;
  tangentZ: number;
  routeIndex: number;
};

/** Index sampled Catmull–Rom roads for reliable prop placement and walking. */
export function createRoadNetwork(routes: readonly (readonly Point2[])[]) {
  const curves = routes.map(
    (route) =>
      new THREE.CatmullRomCurve3(
        route.map(([x, z]) => new THREE.Vector3(x, 0, z)),
        false,
        "catmullrom",
        0.35,
      ),
  );
  const bucketSize = 12;
  const searchRadius = 14;
  const buckets = new Map<string, Segment[]>();
  curves.forEach((curve, routeIndex) => {
    const points = curve.getSpacedPoints(
      Math.max(8, Math.ceil(curve.getLength() / 0.7)),
    );
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const segment = {
        ax: a.x,
        az: a.z,
        dx,
        dz,
        lengthSquared: dx * dx + dz * dz,
        routeIndex,
      };
      const minX = Math.floor((Math.min(a.x, b.x) - searchRadius) / bucketSize);
      const maxX = Math.floor((Math.max(a.x, b.x) + searchRadius) / bucketSize);
      const minZ = Math.floor((Math.min(a.z, b.z) - searchRadius) / bucketSize);
      const maxZ = Math.floor((Math.max(a.z, b.z) + searchRadius) / bucketSize);
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x},${z}`;
          const bucket = buckets.get(key);
          if (bucket) bucket.push(segment);
          else buckets.set(key, [segment]);
        }
      }
    }
  });

  const closestRoad = (x: number, z: number): RoadPoint | undefined => {
    const segments = buckets.get(
      `${Math.floor(x / bucketSize)},${Math.floor(z / bucketSize)}`,
    );
    if (!segments) return undefined;
    let bestSquared = searchRadius * searchRadius;
    let result: RoadPoint | undefined;
    for (const segment of segments) {
      if (segment.lengthSquared === 0) continue;
      const t = THREE.MathUtils.clamp(
        ((x - segment.ax) * segment.dx + (z - segment.az) * segment.dz) /
          segment.lengthSquared,
        0,
        1,
      );
      const pointX = segment.ax + segment.dx * t;
      const pointZ = segment.az + segment.dz * t;
      const squared = (pointX - x) ** 2 + (pointZ - z) ** 2;
      if (squared >= bestSquared) continue;
      bestSquared = squared;
      const length = Math.sqrt(segment.lengthSquared);
      result = {
        x: pointX,
        z: pointZ,
        distance: Math.sqrt(squared),
        tangentX: segment.dx / length,
        tangentZ: segment.dz / length,
        routeIndex: segment.routeIndex,
      };
    }
    return result;
  };

  return {
    curves,
    closestRoad,
    distanceToRoad: (x: number, z: number) =>
      closestRoad(x, z)?.distance ?? Infinity,
  };
}

/** Keep thin road meshes clear of sharp riverbank triangles. */
export function createRoadSurfaceHeight(
  heightAt: (x: number, z: number) => number,
  distanceToRiver: (x: number, z: number) => number,
) {
  return (x: number, z: number) => {
    const bank = THREE.MathUtils.clamp((6 - distanceToRiver(x, z)) / 1.5, 0, 1);
    return heightAt(x, z) + bank * 0.07;
  };
}

export function createRoadRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  width: number,
  offset: number,
  lift: number,
  heightAt: (x: number, z: number) => number,
  includeSegment: (x: number, z: number) => boolean,
) {
  const steps = Math.max(80, Math.ceil(curve.getLength() / 0.4));
  const across = width > 1 ? 10 : 1;
  const stride = across + 1;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const point = curve.getPointAt(i / steps);
    const tangent = curve.getTangentAt(i / steps);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    for (let column = 0; column <= across; column++) {
      const lateral = offset + width * (column / across - 0.5);
      const x = point.x + side.x * lateral;
      const z = point.z + side.z * lateral;
      vertices.push(x, heightAt(x, z) + lift, z);
      uvs.push(x / 2, z / 2);
    }
    if (i < steps && includeSegment(point.x, point.z)) {
      for (let column = 0; column < across; column++) {
        const a = i * stride + column;
        indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
