import { paddyPlots, pondX, pondZ } from "./layout";

/** Wooded west bank only; cultivated terraces, pond, and river margins are excluded. */
export function createForestHabitat(
  distanceToRiver: (x: number, z: number) => number,
) {
  return (x: number, z: number) =>
    ((x < -51 && z < 0) || (x < -72 && z < 40)) &&
    x > -88 &&
    z > -80 &&
    distanceToRiver(x, z) > 7 &&
    Math.hypot((x - pondX) / 1.32, z - pondZ) > 9 &&
    !paddyPlots.some(
      ([px, pz]) => Math.abs(x - px) < 10.1 && Math.abs(z - pz) < 9,
    );
}

/** Nocturnal visitors can reach the far-bank lane, but never cultivated or inhabited ground. */
export function createNightHabitat(
  distanceToRiver: (x: number, z: number) => number,
) {
  return (x: number, z: number) =>
    x > -88 &&
    x < -47 &&
    z > -80 &&
    z <= 1 &&
    distanceToRiver(x, z) > 5.8 &&
    Math.hypot((x - pondX) / 1.32, z - pondZ) > 9 &&
    !paddyPlots.some(
      ([px, pz]) => Math.abs(x - px) < 10.1 && Math.abs(z - pz) < 9,
    );
}
