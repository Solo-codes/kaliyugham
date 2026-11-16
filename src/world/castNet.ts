export type CastPhase = "gather" | "throw" | "sink" | "retrieve";
export type CastNetPose = {
  phase: CastPhase;
  outreach: number;
  lift: number;
  sink: number;
  spread: number;
  arm: number;
};

const ease = (value: number) => value * value * (3 - 2 * value);

/** A circular veeshuvala opens during the throw, settles, then is drawn in. */
export function sampleCastNet(time: number, offset = 0): CastNetPose {
  const cycle = (((time + offset) % 12) + 12) % 12;
  if (cycle < 2.4 || cycle >= 9.3) {
    return {
      phase: "gather",
      outreach: 0,
      lift: 0,
      sink: 0,
      spread: 0.16,
      arm: 0.3,
    };
  }
  if (cycle < 3.8) {
    const t = (cycle - 2.4) / 1.4;
    const reach = ease(t);
    return {
      phase: "throw",
      outreach: reach,
      lift: Math.sin(Math.PI * t) * 0.8,
      sink: 0,
      spread: 0.16 + 0.84 * reach,
      arm: 0.3 + 0.45 * reach + Math.sin(Math.PI * t) * 0.9,
    };
  }
  if (cycle < 6.4) {
    const t = ease((cycle - 3.8) / 2.6);
    return {
      phase: "sink",
      outreach: 1,
      lift: 0,
      sink: t * 0.28,
      spread: 1 - t * 0.08,
      arm: 0.75,
    };
  }
  const t = ease((cycle - 6.4) / 2.9);
  return {
    phase: "retrieve",
    outreach: 1 - t,
    lift: Math.sin(Math.PI * t) * 0.16,
    sink: 0.28 * (1 - t),
    spread: 0.92 - 0.76 * t,
    arm: 0.75 - 0.45 * t,
  };
}
