import type { Point2 } from "./hydrology";
import { cottageDoorstep } from "./settlement";

export type Homestead = {
  site: Point2;
  rotation: number;
  doorstep: Point2;
  lane: Point2;
};
export type GardenPlot = {
  center: Point2;
  halfWidth: number;
  halfDepth: number;
  crop: "okra" | "brinjal" | "gourd";
};
export function planHomesteads(
  anchors: readonly Point2[],
  seed: number,
  clear: (x: number, z: number) => boolean,
  nearestLane: (x: number, z: number) => Point2 | undefined,
  clearPath: (x: number, z: number) => boolean = () => true,
): Homestead[] {
  const homes: Homestead[] = [];
  const roll = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  for (const anchor of anchors) {
    for (let trial = 0; trial < 180; trial++) {
      const angle = roll() * Math.PI * 2,
        radius = 1 + roll() * 13;
      const site: Point2 = [
        anchor[0] + Math.cos(angle) * radius,
        anchor[1] + Math.sin(angle) * radius,
      ];
      const lane = nearestLane(...site);
      if (!lane || Math.hypot(lane[0] - site[0], lane[1] - site[1]) > 22)
        continue;
      if (
        homes.some(
          (home) =>
            Math.hypot(home.site[0] - site[0], home.site[1] - site[1]) < 12,
        )
      )
        continue;
      const rotation = Math.atan2(site[0] - lane[0], site[1] - lane[1]);
      const doorstep = cottageDoorstep(site, rotation);
      let safe = true;
      for (let x = -3.1; x <= 3.11 && safe; x += 0.62)
        for (let z = -3.4; z <= 3.41; z += 0.68) {
          if (
            !clear(
              site[0] + x * Math.cos(rotation) + z * Math.sin(rotation),
              site[1] - x * Math.sin(rotation) + z * Math.cos(rotation),
            )
          ) {
            safe = false;
            break;
          }
        }
      if (!safe) continue;
      if (
        homes.some((home) => {
          const dx = home.lane[0] - home.doorstep[0],
            dz = home.lane[1] - home.doorstep[1];
          const t = Math.max(
            0,
            Math.min(
              1,
              ((site[0] - home.doorstep[0]) * dx +
                (site[1] - home.doorstep[1]) * dz) /
                Math.max(0.01, dx * dx + dz * dz),
            ),
          );
          return (
            Math.hypot(
              site[0] - home.doorstep[0] - dx * t,
              site[1] - home.doorstep[1] - dz * t,
            ) < 5
          );
        })
      )
        continue;
      const length = Math.hypot(lane[0] - doorstep[0], lane[1] - doorstep[1]);
      const steps = Math.max(1, Math.ceil(length / 0.4));
      for (let step = 0; step <= steps; step++) {
        const x = doorstep[0] + ((lane[0] - doorstep[0]) * step) / steps;
        const z = doorstep[1] + ((lane[1] - doorstep[1]) * step) / steps;
        if (
          !clearPath(x, z) ||
          homes.some(
            (home) => Math.hypot(home.site[0] - x, home.site[1] - z) < 3.7,
          )
        ) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;
      homes.push({ site, rotation, doorstep, lane });
      break;
    }
  }
  return homes;
}

export function planVegetablePlots(
  anchors: readonly Point2[],
  clear: (x: number, z: number) => boolean,
): GardenPlot[] {
  const plots: GardenPlot[] = [];
  const crops = ["okra", "brinjal", "gourd"] as const;
  anchors.forEach((anchor, index) => {
    for (const shift of [0, 1.5, -1.5, 3, -3]) {
      const center: Point2 = [anchor[0] + shift, anchor[1]];
      const plot: GardenPlot = {
        center,
        halfWidth: 3.5,
        halfDepth: 2.4,
        crop: crops[index % crops.length],
      };
      let safe = true;
      for (let x = -4; x <= 4 && safe; x += 0.5)
        for (let z = -2.9; z <= 2.91; z += 0.5) {
          if (!clear(center[0] + x, center[1] + z)) {
            safe = false;
            break;
          }
        }
      if (
        !safe ||
        plots.some(
          (other) =>
            Math.abs(other.center[0] - center[0]) < 8 &&
            Math.abs(other.center[1] - center[1]) < 6,
        )
      )
        continue;
      plots.push(plot);
      break;
    }
  });
  return plots;
}

export function insideGarden(
  plots: readonly GardenPlot[],
  x: number,
  z: number,
  padding = 0,
) {
  return plots.some(
    (plot) =>
      Math.abs(x - plot.center[0]) < plot.halfWidth + padding &&
      Math.abs(z - plot.center[1]) < plot.halfDepth + padding,
  );
}
