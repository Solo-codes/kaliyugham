export type WageVisit = {
  stage: "working" | "queue" | "home";
  day: number;
  paid: number;
};
export function wageVisit(): WageVisit {
  return { stage: "working", day: -1, paid: 0 };
}
export function updateWageVisit(
  visit: WageVisit,
  day: number,
  hour: number,
  running: boolean,
) {
  if (!running) return;
  if (hour >= 6 && hour < 17 && visit.day !== day) {
    visit.day = day;
    visit.stage = "working";
  }
  if (hour >= 17 && visit.stage === "working") visit.stage = "queue";
}
export type WageDesk = {
  serving: number | null;
  remaining: number;
  transactions: number;
};
export function serveWageQueue(
  desk: WageDesk,
  visits: readonly WageVisit[],
  arrived: readonly boolean[],
  delta: number,
) {
  if (delta <= 0) return -1;
  const first = visits.findIndex((visit) => visit.stage === "queue");
  if (first < 0 || !arrived[first]) {
    desk.serving = null;
    desk.remaining = 0;
    return -1;
  }
  if (desk.serving !== first) {
    desk.serving = first;
    desk.remaining = 3;
  }
  desk.remaining = Math.max(0, desk.remaining - delta);
  if (desk.remaining > 0) return -1;
  visits[first].stage = "home";
  visits[first].paid++;
  desk.transactions++;
  desk.serving = null;
  return first;
}
export type ToddyState = { level: number; nausea: number; episodes: number };
export function drinkToddy(state: ToddyState) {
  state.level = Math.min(4, state.level + 1);
  if (state.level >= 2.7) {
    state.nausea = 5;
    state.episodes++;
    state.level = 1.8;
    return "nausea";
  }
  return "tipsy";
}
export function advanceToddy(state: ToddyState, delta: number) {
  state.level = Math.max(0, state.level - Math.max(0, delta) / 55);
  state.nausea = Math.max(0, state.nausea - Math.max(0, delta));
}
