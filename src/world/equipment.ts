export const KALARI_GOODS = {
  bow: { label: "Bow", price: 8 },
  sword: { label: "Sword", price: 6 },
  shield: { label: "Buckler", price: 5 },
} as const;
export type EquipmentKind = keyof typeof KALARI_GOODS;
export type EquipmentBelt = {
  owned: EquipmentKind[];
  selected: EquipmentKind | "none";
  cooldown: number;
  active: number;
  uses: number;
};
export function createEquipmentBelt(): EquipmentBelt {
  return { owned: [], selected: "none", cooldown: 0, active: 0, uses: 0 };
}
export function buyEquipment(
  belt: EquipmentBelt,
  wallet: { rupees: number },
  kind: EquipmentKind,
  available: boolean,
  busy: boolean,
) {
  if (busy) return "busy";
  if (!available) return "closed";
  if (belt.owned.includes(kind)) return "owned";
  if (wallet.rupees < KALARI_GOODS[kind].price) return "no-money";
  wallet.rupees -= KALARI_GOODS[kind].price;
  belt.owned.push(kind);
  belt.selected = kind;
  return "purchased";
}
export function cycleEquipment(belt: EquipmentBelt) {
  const choices = ["none", ...belt.owned] as const;
  const next = (choices.indexOf(belt.selected) + 1) % choices.length;
  belt.selected = choices[next];
  belt.active = 0;
  return belt.selected;
}
export function useEquipment(belt: EquipmentBelt, allowed: boolean) {
  if (!allowed || belt.selected === "none" || belt.cooldown > 0) return false;
  belt.active = belt.selected === "shield" ? 1.2 : 0.65;
  belt.cooldown = belt.selected === "bow" ? 1.2 : 0.9;
  belt.uses++;
  return true;
}
export function advanceEquipment(belt: EquipmentBelt, delta: number) {
  belt.cooldown = Math.max(0, belt.cooldown - Math.max(0, delta));
  belt.active = Math.max(0, belt.active - Math.max(0, delta));
}
/** A visible animal responds by fleeing; no damage, injury, or kill state. */
export function inEquipmentReach(
  kind: EquipmentKind,
  distance: number,
  facingDot: number,
) {
  return (
    kind !== "shield" &&
    distance < (kind === "bow" ? 18 : 3.2) &&
    facingDot > (kind === "bow" ? 0.94 : 0.35)
  );
}
