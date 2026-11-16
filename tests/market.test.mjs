import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceFishTrading,
  createFishTrading,
  finishFood,
  FOOD,
  purchaseFood,
} from "../src/world/market.ts";
import {
  detailTexture,
  makeBanana,
  makeDrinkingCoconut,
  makeHandLight,
} from "../src/world/visuals.ts";

test("E purchase deducts money and stock, and consumption is recorded on completion", () => {
  const wallet = { annas: 5, bananasEaten: 0, coconutsDrunk: 0 };
  const banana = { kind: "banana", stock: 2 };
  const coconut = { kind: "coconut-water", stock: 1 };
  assert.equal(purchaseFood(wallet, banana, true, 2, false), "purchased");
  assert.equal(wallet.annas, 4);
  assert.equal(banana.stock, 1);
  assert.equal(wallet.bananasEaten, 0);
  finishFood(wallet, banana.kind);
  assert.equal(wallet.bananasEaten, 1);
  assert.equal(purchaseFood(wallet, coconut, true, 2, false), "purchased");
  assert.equal(wallet.annas, 2);
  assert.equal(coconut.stock, 0);
  finishFood(wallet, coconut.kind);
  assert.equal(wallet.coconutsDrunk, 1);
  assert.ok(FOOD["coconut-water"].duration > 0);
});
test("closed, distant, busy, empty, and unaffordable purchases never alter inventory", () => {
  const wallet = { annas: 0, bananasEaten: 0, coconutsDrunk: 0 };
  const shop = { kind: "banana", stock: 1 };
  assert.equal(purchaseFood(wallet, shop, false, 1, false), "closed");
  assert.equal(purchaseFood(wallet, shop, true, 4, false), "closed");
  assert.equal(purchaseFood(wallet, shop, true, 1, true), "busy");
  assert.equal(purchaseFood(wallet, shop, true, 1, false), "no-money");
  assert.equal(shop.stock, 1);
  assert.equal(wallet.annas, 0);
  assert.equal(
    purchaseFood(wallet, { kind: "banana", stock: 0 }, true, 1, false),
    "sold-out",
  );
});
test("fishers dock before delivering, sell once, go home and resume next morning", () => {
  const trade = createFishTrading();
  advanceFishTrading(trade, 0, 8, 0.1, true, true);
  advanceFishTrading(trade, 0, 15, 0.1, false, true);
  assert.equal(trade.phase, "fishing");
  advanceFishTrading(trade, 0, 15, 0.1, true, true);
  assert.equal(trade.phase, "market");
  advanceFishTrading(trade, 0, 16, 0.1, true, false);
  assert.equal(trade.phase, "market");
  advanceFishTrading(trade, 0, 17, 0.1, true, true);
  assert.equal(trade.phase, "selling");
  const wait = trade.wait;
  advanceFishTrading(trade, 0, 17, 0, true, true);
  assert.equal(trade.wait, wait);
  assert.equal(advanceFishTrading(trade, 0, 18, 6, true, true), true);
  assert.equal(trade.phase, "home");
  assert.equal(advanceFishTrading(trade, 0, 20, 6, true, true), false);
  advanceFishTrading(trade, 1, 6, 0.1, true, true);
  assert.equal(trade.phase, "fishing");
  assert.equal(trade.delivered, false);
});
test("procedural material maps and carried props need no remote art", () => {
  const texture = detailTexture("earth", 12);
  assert.equal(texture.image.width, 128);
  assert.equal(texture.image.data.length, 128 * 128 * 4);
  assert.equal(texture.repeat.x, 12);
  assert.ok(makeBanana().children.length >= 3);
  assert.ok(makeDrinkingCoconut().children.length >= 3);
  const lamp = makeHandLight("lamp"),
    torch = makeHandLight("leaf-torch");
  assert.equal(lamp.group.visible, false);
  assert.ok(torch.flame.position.y > lamp.flame.position.y);
  assert.equal(
    lamp.light.parent,
    null,
    "portable lighting must use a bounded shared light pool",
  );
});
