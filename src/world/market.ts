export type FoodKind = "banana" | "coconut-water" | "tea" | "snack" | "toddy";
export const FOOD = {
  banana: { label: "banana", price: 1, duration: 2.4 },
  "coconut-water": { label: "coconut water", price: 2, duration: 3.2 },
  tea: { label: "chaya", price: 1, duration: 3 },
  snack: { label: "pazham pori", price: 2, duration: 2.6 },
  toddy: { label: "toddy", price: 2, duration: 3 },
} as const;
export type Wallet = {
  rupees: number;
  bananasEaten: number;
  coconutsDrunk: number;
  teasDrunk?: number;
  snacksEaten?: number;
  toddiesDrunk?: number;
};
export type Shop = { kind: FoodKind; stock: number };
export function purchaseFood(
  wallet: Wallet,
  shop: Shop,
  sellerPresent: boolean,
  distance: number,
  busy: boolean,
) {
  if (busy) return "busy";
  if (!sellerPresent || distance > 3.4) return "closed";
  if (shop.stock <= 0) return "sold-out";
  if (wallet.rupees < FOOD[shop.kind].price) return "no-money";
  wallet.rupees -= FOOD[shop.kind].price;
  shop.stock--;
  return "purchased";
}
export function finishFood(wallet: Wallet, kind: FoodKind) {
  if (kind === "banana") wallet.bananasEaten++;
  else if (kind === "coconut-water") wallet.coconutsDrunk++;
  else if (kind === "tea") wallet.teasDrunk = (wallet.teasDrunk ?? 0) + 1;
  else if (kind === "snack") wallet.snacksEaten = (wallet.snacksEaten ?? 0) + 1;
  else wallet.toddiesDrunk = (wallet.toddiesDrunk ?? 0) + 1;
}
export type FishTrading = {
  phase: "fishing" | "market" | "selling" | "home";
  day: number;
  wait: number;
  delivered: boolean;
};
export function createFishTrading(): FishTrading {
  return { phase: "fishing", day: -1, wait: 0, delivered: false };
}
/** Fishers bring the afternoon catch to market, trade, then return home. */
export function advanceFishTrading(
  trade: FishTrading,
  day: number,
  hour: number,
  delta: number,
  docked: boolean,
  arrived: boolean,
) {
  if (delta <= 0) return false;
  if (hour >= 6 && hour < 15 && trade.day !== day) {
    trade.phase = "fishing";
    trade.day = day;
    trade.delivered = false;
  }
  if (trade.phase === "fishing" && hour >= 15 && hour < 21 && docked) {
    trade.phase = "market";
  } else if (trade.phase === "market" && arrived) {
    trade.phase = "selling";
    trade.wait = 6;
  } else if (trade.phase === "selling") {
    trade.wait = Math.max(0, trade.wait - delta);
    if (trade.wait === 0) {
      trade.phase = "home";
      trade.delivered = true;
      return true;
    }
  }
  return false;
}
