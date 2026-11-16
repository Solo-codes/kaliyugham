import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceFarmDelivery,
  cartThreat,
  createFarmDelivery,
  findGatheringSpot,
  keepYielding,
  rainCoverFor,
  roadsideCandidates,
} from "../src/world/traffic.ts";
import {
  makeBananaPlant,
  makeElephantEarCover,
  makeRainUmbrella,
} from "../src/world/ruralProps.ts";
import { advanceWalker, setWalkerMotion } from "../src/world/navigation.ts";

test("pedestrians recognize an approaching cart corridor and step to a clear shoulder", () => {
  const cart = { x: 0, z: 0, dx: 0, dz: -1, moving: true };
  assert.equal(cartThreat([0, -5], cart), true);
  assert.equal(cartThreat([0, 6], cart), false);
  assert.equal(cartThreat([4, -5], cart), false);
  assert.equal(cartThreat([0, -5], { ...cart, moving: false }), false);
  const shoulders = roadsideCandidates([0, -5], cart);
  assert.equal(shoulders.length, 4);
  assert.ok(shoulders.every((point) => !cartThreat(point, cart)));
});

test("walkers stop yielding once carts pass, stop, or leave them stuck", () => {
  const cart = { x: 0, z: 0, dx: 0, dz: -1, moving: true };
  assert.equal(keepYielding([3, -4], cart, 2, 0), true);
  assert.equal(keepYielding([3, 5], cart, 2, 0), false);
  assert.equal(keepYielding([3, -4], cart, 6, 0), false);
  assert.equal(keepYielding([3, -4], cart, 2, 1.3), false);
  assert.equal(keepYielding([3, -4], { ...cart, moving: false }, 2, 0), false);
});

test("umbrellas belong only to the household; other people have leaves or no cover", () => {
  const ordinary = Array.from({ length: 12 }, (_, i) => rainCoverFor(false, i));
  assert.equal(ordinary.includes("umbrella"), false);
  assert.ok(ordinary.includes("leaf") && ordinary.includes("none"));
  assert.equal(rainCoverFor(true, 0), "umbrella");
  const cover = makeElephantEarCover();
  assert.equal(cover.visible, false);
  assert.ok(cover.children.length >= 3);
  cover.traverse((object) => {
    if (object.geometry) {
      object.geometry.computeBoundingSphere();
      assert.ok(Number.isFinite(object.geometry.boundingSphere.radius));
    }
  });
});
test("social gathering spots leave the road centre clear", () => {
  const clear = (x, z) => Math.abs(z) > 2.8 && Math.abs(x) < 10;
  for (let slot = 0; slot < 6; slot++)
    assert.ok(clear(...findGatheringSpot([0, 0], slot, clear)));
});
test("farm cart loads, travels, unloads once, returns and parks without teleporting", () => {
  const state = createFarmDelivery(),
    walker = { x: 0, z: 0, path: [], waypoint: 0 };
  const tick = (hour, delta) =>
    advanceFarmDelivery(
      state,
      walker,
      hour,
      delta,
      2,
      [0, 0],
      [8, 0],
      () => [],
    );
  tick(8, 5);
  assert.equal(state.phase, "market");
  assert.equal(state.loaded, true);
  tick(8, 1);
  assert.equal(walker.x, 2);
  const paused = { ...state };
  tick(8, 0);
  assert.deepEqual(state, paused);
  tick(8, 3);
  assert.equal(state.phase, "unloading");
  assert.equal(walker.x, 8);
  tick(8, 7);
  assert.equal(state.delivered, 1);
  assert.equal(state.loaded, false);
  assert.equal(state.phase, "return");
  tick(8, 4);
  assert.equal(state.phase, "loading");
  assert.equal(walker.x, 0);
  tick(20, 1);
  tick(20, 1);
  assert.equal(state.phase, "parked");
  tick(8, 0.1);
  assert.equal(state.phase, "loading");
  assert.equal(state.delivered, 1);
});
test("rain umbrellas and banana plants are self-contained procedural props", () => {
  const umbrella = makeRainUmbrella();
  assert.equal(umbrella.visible, false);
  assert.equal(umbrella.children.length, 3);
  const plant = makeBananaPlant(1975);
  assert.ok(plant.children.length >= 20);
  plant.traverse((object) => {
    if (object.geometry) {
      object.geometry.computeBoundingSphere();
      assert.ok(Number.isFinite(object.geometry.boundingSphere.radius));
    }
  });
});

test("yielding preserves a pedestrian destination and never runs while paused", () => {
  const walker = { x: 0, z: 0, path: [[0, -5]], waypoint: 0 };
  let passes = 0;
  setWalkerMotion({
    move: (_a, b) => b,
    detour: (_a, b) => [b],
    yield: (person, distance) => {
      passes++;
      person.x += distance;
      return {
        traveled: distance,
        directionX: 1,
        directionZ: 0,
        arrived: false,
      };
    },
  });
  try {
    advanceWalker(walker, 0);
    assert.equal(passes, 0);
    const result = advanceWalker(walker, 0.5);
    assert.equal(result.arrived, false);
    assert.equal(walker.x, 0.5);
    assert.deepEqual(walker.path, [[0, -5]]);
    assert.equal(walker.waypoint, 0);
  } finally {
    setWalkerMotion(undefined);
  }
  advanceWalker(walker, 10);
  assert.ok(Math.hypot(walker.x, walker.z + 5) < 0.03);
});
