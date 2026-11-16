import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceEquipment,
  buyEquipment,
  createEquipmentBelt,
  cycleEquipment,
  inEquipmentReach,
  useEquipment,
} from "../src/world/equipment.ts";
import { finishFood, purchaseFood } from "../src/world/market.ts";
import {
  makeEquipment,
  makeRabbit,
  makeSnack,
  makeTeaGlass,
} from "../src/world/newProps.ts";
import { createWaterModel } from "../src/world/hydrology.ts";
import { createRoadNetwork } from "../src/world/roads.ts";
import { createForestHabitat } from "../src/world/habitat.ts";
import {
  baseTerrainHeight,
  paddyPlots,
  pondX,
  pondZ,
  riverRoutePoints,
  roadRoutes,
  teaShopSite,
} from "../src/world/layout.ts";

test("kalari purchases deduct once, equip the item, and F cycles only owned equipment", () => {
  const belt = createEquipmentBelt(),
    wallet = { annas: 20 };
  assert.equal(cycleEquipment(belt), "none");
  assert.equal(buyEquipment(belt, wallet, "bow", true, false), "purchased");
  assert.equal(wallet.annas, 12);
  assert.equal(belt.selected, "bow");
  assert.equal(buyEquipment(belt, wallet, "bow", true, false), "owned");
  assert.equal(wallet.annas, 12);
  assert.equal(buyEquipment(belt, wallet, "sword", true, false), "purchased");
  assert.equal(buyEquipment(belt, wallet, "shield", true, false), "purchased");
  assert.equal(wallet.annas, 1);
  assert.equal(cycleEquipment(belt), "none");
  assert.equal(cycleEquipment(belt), "bow");
  assert.equal(cycleEquipment(belt), "sword");
  assert.equal(cycleEquipment(belt), "shield");
});
test("closed, busy, and unaffordable equipment purchases do not change the belt or wallet", () => {
  const belt = createEquipmentBelt(),
    wallet = { annas: 0 };
  assert.equal(buyEquipment(belt, wallet, "bow", false, false), "closed");
  assert.equal(buyEquipment(belt, wallet, "sword", true, true), "busy");
  assert.equal(buyEquipment(belt, wallet, "shield", true, false), "no-money");
  assert.equal(wallet.annas, 0);
  assert.deepEqual(belt.owned, []);
});
test("equipment use has pause-safe cooldowns and directional non-damaging reach", () => {
  const belt = createEquipmentBelt();
  assert.equal(useEquipment(belt, true), false);
  buyEquipment(belt, { annas: 10 }, "bow", true, false);
  assert.equal(useEquipment(belt, false), false);
  assert.equal(useEquipment(belt, true), true);
  assert.equal(useEquipment(belt, true), false);
  const before = { ...belt };
  advanceEquipment(belt, 0);
  assert.deepEqual(belt, before);
  advanceEquipment(belt, 2);
  assert.equal(belt.active, 0);
  assert.equal(belt.cooldown, 0);
  assert.equal(inEquipmentReach("bow", 10, 0.98), true);
  assert.equal(inEquipmentReach("bow", 10, 0.5), false);
  assert.equal(inEquipmentReach("sword", 4, 1), false);
  assert.equal(inEquipmentReach("shield", 1, 1), false);
});
test("tea and snacks have independent costs, stock, and completion counters", () => {
  const wallet = { annas: 5, bananasEaten: 0, coconutsDrunk: 0 };
  const tea = { kind: "tea", stock: 2 },
    snack = { kind: "snack", stock: 2 };
  assert.equal(purchaseFood(wallet, tea, true, 2, false), "purchased");
  assert.equal(wallet.annas, 4);
  assert.equal(tea.stock, 1);
  finishFood(wallet, "tea");
  assert.equal(wallet.teasDrunk, 1);
  assert.equal(purchaseFood(wallet, snack, true, 2, false), "purchased");
  assert.equal(wallet.annas, 2);
  finishFood(wallet, "snack");
  assert.equal(wallet.snacksEaten, 1);
  assert.equal(wallet.bananasEaten, 0);
  assert.equal(wallet.coconutsDrunk, 0);
  assert.equal(purchaseFood(wallet, tea, false, 2, false), "closed");
});
test("tea-shop footprint is dry and off road; rabbits inhabit the far bank", () => {
  const water = createWaterModel(
    riverRoutePoints,
    baseTerrainHeight,
    [pondX, pondZ],
    paddyPlots,
  );
  const roads = createRoadNetwork(roadRoutes),
    forest = createForestHabitat(water.distanceToRiver);
  for (let x = -3.4; x <= 3.41; x += 0.4)
    for (let z = -3.2; z <= 3.21; z += 0.4) {
      const px = teaShopSite[0] + x,
        pz = teaShopSite[1] + z;
      assert.equal(water.getWaterInfo(px, pz), undefined);
      assert.ok(roads.distanceToRoad(px, pz) > 2.8);
    }
  for (const [x, z] of [
    [-62, -15],
    [-67, -29],
    [-78, 3],
  ]) {
    assert.equal(forest(x, z), true);
    assert.equal(water.getWaterInfo(x, z), undefined);
  }
  assert.equal(makeRabbit().legs.length, 4);
  for (const kind of ["bow", "sword", "shield"])
    assert.ok(makeEquipment(kind).children.length > 1);
  assert.ok(makeTeaGlass().children.length >= 2);
  assert.ok(makeSnack().children.length >= 1);
});
