export type CoconutPhase = "approach" | "climb" | "pick" | "descend" | "rest";

/** A repeatable harvesting routine with a visible pause at the crown. */
export function sampleCoconutHarvest(time: number, offset = 0) {
  const cycle = (((time + offset) % 46) + 46) % 46;
  if (cycle < 6)
    return { phase: "approach" as CoconutPhase, progress: cycle / 6 };
  if (cycle < 18)
    return { phase: "climb" as CoconutPhase, progress: (cycle - 6) / 12 };
  if (cycle < 24)
    return { phase: "pick" as CoconutPhase, progress: (cycle - 18) / 6 };
  if (cycle < 36)
    return { phase: "descend" as CoconutPhase, progress: (cycle - 24) / 12 };
  return { phase: "rest" as CoconutPhase, progress: (cycle - 36) / 10 };
}

/** Finish an in-progress harvest after sunset, then rest until the next workday. */
export function advanceCoconutHarvest(
  time: number,
  delta: number,
  workday: boolean,
  motionEnabled: boolean,
  offset = 0,
) {
  let step = motionEnabled ? Math.max(0, delta) : 0;
  if (!workday) {
    const cycle = (((time + offset) % 46) + 46) % 46;
    // At 38 seconds the harvester has descended and set the coconut down.
    step = Math.min(step, Math.max(0, 38 - cycle));
  }
  const nextTime = time + step;
  return { time: nextTime, ...sampleCoconutHarvest(nextTime, offset) };
}
