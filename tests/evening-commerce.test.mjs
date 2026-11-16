import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceToddy,
  drinkToddy,
  serveWageQueue,
  updateWageVisit,
  wageVisit,
} from "../src/world/eveningCommerce.ts";
import { finishFood, purchaseFood } from "../src/world/market.ts";

test("employees queue at evening, are paid in order once, then go home", () => {
  const visits = [wageVisit(), wageVisit(), wageVisit()];
  visits.forEach((v) => updateWageVisit(v, 0, 8, true));
  visits.forEach((v) => updateWageVisit(v, 0, 17, true));
  assert.ok(visits.every((v) => v.stage === "queue"));
  const desk = { serving: null, remaining: 0, transactions: 0 };
  assert.equal(
    serveWageQueue(desk, visits, [false, true, true], 4),
    -1,
    "late arrivals must not skip the queue",
  );
  assert.equal(serveWageQueue(desk, visits, [true, true, true], 1), -1);
  const before = desk.remaining;
  serveWageQueue(desk, visits, [true, true, true], 0);
  assert.equal(desk.remaining, before);
  assert.equal(serveWageQueue(desk, visits, [true, true, true], 2), 0);
  assert.equal(visits[0].stage, "home");
  assert.equal(visits[0].paid, 1);
  assert.equal(serveWageQueue(desk, visits, [true, true, true], 3), 1);
  assert.equal(serveWageQueue(desk, visits, [true, true, true], 3), 2);
  assert.equal(serveWageQueue(desk, visits, [true, true, true], 30), -1);
  assert.equal(desk.transactions, 3);
  visits.forEach((v) => updateWageVisit(v, 0, 22, true));
  assert.ok(visits.every((v) => v.stage === "home"));
  visits.forEach((v) => updateWageVisit(v, 1, 8, true));
  assert.ok(visits.every((v) => v.stage === "working"));
});
test("toddy is purchased with stock and money rules, with a separate consumption count", () => {
  const wallet = { rupees: 5, bananasEaten: 0, coconutsDrunk: 0 };
  const shop = { kind: "toddy", stock: 2 };
  assert.equal(purchaseFood(wallet, shop, true, 2, false), "purchased");
  assert.equal(wallet.rupees, 3);
  assert.equal(shop.stock, 1);
  finishFood(wallet, "toddy");
  assert.equal(wallet.toddiesDrunk, 1);
  assert.equal(wallet.snacksEaten, undefined);
  assert.equal(purchaseFood(wallet, shop, false, 2, false), "closed");
  assert.equal(wallet.rupees, 3);
});
test("toddy effects fade, freeze on pause and excess causes a bounded nausea episode", () => {
  const state = { level: 0, nausea: 0, episodes: 0 };
  assert.equal(drinkToddy(state), "tipsy");
  assert.equal(drinkToddy(state), "tipsy");
  assert.equal(drinkToddy(state), "nausea");
  assert.equal(state.episodes, 1);
  assert.equal(state.nausea, 5);
  const before = { ...state };
  advanceToddy(state, 0);
  assert.deepEqual(state, before);
  advanceToddy(state, 6);
  assert.equal(state.nausea, 0);
  assert.ok(state.level > 0);
  advanceToddy(state, 120);
  assert.equal(state.level, 0);
});
