export type PaddyWorkPhase = "plant" | "walk";

/** Small straight movements between rice rows, separated by time spent planting. */
export function samplePaddyWork(time: number, offset = 0) {
  const cycle = (((time + offset) % 24) + 24) % 24;
  if (cycle < 6)
    return { phase: "plant" as PaddyWorkPhase, rowOffset: 0, direction: 0 };
  if (cycle < 10)
    return {
      phase: "walk" as PaddyWorkPhase,
      rowOffset: ((cycle - 6) / 4) * 1.5,
      direction: 1,
    };
  if (cycle < 16)
    return { phase: "plant" as PaddyWorkPhase, rowOffset: 1.5, direction: 0 };
  if (cycle < 20)
    return {
      phase: "walk" as PaddyWorkPhase,
      rowOffset: (1 - (cycle - 16) / 4) * 1.5,
      direction: -1,
    };
  return { phase: "plant" as PaddyWorkPhase, rowOffset: 0, direction: 0 };
}

/** Freeze the current position when work is inactive rather than restarting the cycle. */
export function advancePaddyWork(
  time: number,
  delta: number,
  active: boolean,
  offset = 0,
) {
  const nextTime = time + (active ? Math.max(0, delta) : 0);
  return { time: nextTime, ...samplePaddyWork(nextTime, offset) };
}
