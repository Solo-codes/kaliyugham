export type WeatherKind = "clear" | "cloudy" | "rain" | "monsoon";

const WEATHER: Record<
  WeatherKind,
  { label: string; cloud: number; rain: number; weight: number }
> = {
  clear: { label: "Clear", cloud: 0.05, rain: 0, weight: 4 },
  cloudy: { label: "Cloudy", cloud: 0.7, rain: 0, weight: 3 },
  rain: { label: "Rain", cloud: 0.9, rain: 0.55, weight: 2 },
  monsoon: { label: "Monsoon rain", cloud: 1, rain: 1, weight: 1 },
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const DAY_SECONDS = 720;
export const simulationDay = (seconds: number) =>
  Math.floor(seconds / DAY_SECONDS + 8 / 24);
/** A full Kerala day lasts twelve minutes, beginning at 8:00 in the morning. */
export function sampleDayNight(elapsedSeconds: number) {
  const hour = (((8 + (elapsedSeconds / DAY_SECONDS) * 24) % 24) + 24) % 24;
  const sunHeight = Math.sin(((hour - 6) * Math.PI) / 12);
  const daylight = smooth((sunHeight + 0.14) / 0.28);
  const twilight = (1 - smooth(Math.abs(sunHeight) / 0.28)) * 0.7;
  const minutes = Math.floor(hour * 60) % (24 * 60);
  const formatted = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const period =
    hour < 6
      ? "Night"
      : hour < 9
        ? "Morning"
        : hour < 16
          ? "Day"
          : hour < 19
            ? "Evening"
            : "Night";
  return {
    hour,
    sunHeight,
    daylight,
    twilight,
    label: `${formatted} · ${period}`,
  };
}

/** Weather changes after a random interval; intensity transitions gradually. */
export class WeatherCycle {
  private readonly random: () => number;
  private current: WeatherKind = "clear";
  private previous: WeatherKind = "clear";
  private changedAt = 0;
  private nextChange = 0;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.nextChange = this.nextDuration();
  }

  private nextDuration() {
    return 32 + this.random() * 28;
  }

  private chooseNext(): WeatherKind {
    const choices = (Object.keys(WEATHER) as WeatherKind[]).filter(
      (kind) => kind !== this.current,
    );
    const total = choices.reduce((sum, kind) => sum + WEATHER[kind].weight, 0);
    let roll = clamp01(this.random()) * total;
    for (const kind of choices) {
      roll -= WEATHER[kind].weight;
      if (roll < 0) return kind;
    }
    return choices[choices.length - 1];
  }

  sample(elapsedSeconds: number) {
    while (elapsedSeconds >= this.nextChange) {
      this.changedAt = this.nextChange;
      this.previous = this.current;
      this.current = this.chooseNext();
      this.nextChange += this.nextDuration();
    }
    const blend = smooth((elapsedSeconds - this.changedAt) / 6);
    const from = WEATHER[this.previous];
    const to = WEATHER[this.current];
    return {
      kind: this.current,
      label: to.label,
      cloud: from.cloud + (to.cloud - from.cloud) * blend,
      rain: from.rain + (to.rain - from.rain) * blend,
    };
  }
}
