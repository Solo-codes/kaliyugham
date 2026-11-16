export type HeightFunction = (x: number, z: number) => number;

/** Level an activity area while blending naturally into the surrounding terrain. */
export function flattenTerrainArea(
  source: HeightFunction,
  center: readonly [number, number],
  halfWidth: number,
  halfDepth: number,
  feather: number,
): HeightFunction {
  const floor = source(center[0], center[1]);
  return (x, z) => {
    const dx = Math.max(0, Math.abs(x - center[0]) - halfWidth);
    const dz = Math.max(0, Math.abs(z - center[1]) - halfDepth);
    const distance = Math.hypot(dx, dz);
    if (distance >= feather) return source(x, z);
    const t = Math.max(0, Math.min(1, distance / feather));
    const blend = t * t * (3 - 2 * t);
    return floor + (source(x, z) - floor) * blend;
  };
}

/** Samples the same two triangles per cell used by THREE.PlaneGeometry. */
export function createTerrainGrid(
  size: number,
  segments: number,
  source: HeightFunction,
) {
  const half = size / 2;
  const step = size / segments;
  const stride = segments + 1;
  const heights = new Float32Array(stride * stride);
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      heights[z * stride + x] = source(-half + x * step, -half + z * step);
    }
  }

  const heightAt = (x: number, z: number) => {
    if (x < -half || x > half || z < -half || z > half) return source(x, z);
    const gridX = (x + half) / step;
    const gridZ = (z + half) / step;
    const column = Math.min(segments - 1, Math.floor(gridX));
    const row = Math.min(segments - 1, Math.floor(gridZ));
    const fx = gridX - column;
    const fz = gridZ - row;
    const a = heights[row * stride + column];
    const b = heights[(row + 1) * stride + column];
    const c = heights[(row + 1) * stride + column + 1];
    const d = heights[row * stride + column + 1];
    return fx + fz <= 1
      ? a + (d - a) * fx + (b - a) * fz
      : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  };

  return { size, segments, step, heights, heightAt };
}
