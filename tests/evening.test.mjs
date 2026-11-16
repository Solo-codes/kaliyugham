import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceHousehold,
  advanceNightPatrol,
  createNightPatrol,
  householdOutsideHours,
  predatorNightHours,
  predatorTrails,
} from "../src/world/evening.ts";
import { createInspection } from "../src/world/routines.ts";
import { createNightHabitat } from "../src/world/habitat.ts";
import { createWaterModel } from "../src/world/hydrology.ts";
import { createNavigationGraph } from "../src/world/navigation.ts";
import { createRoadNetwork } from "../src/world/roads.ts";
import {
  baseTerrainHeight,
  paddyPlots,
  pondX,
  pondZ,
  riverRoutePoints,
  roadRoutes,
} from "../src/world/layout.ts";

test("household returns through its gate without teleporting and leaves after dawn", () => {
  const journey = createInspection([0, 0]);
  const curfew = { phase: "visiting" };
  const stops = [
    { position: [0, 0], lookAt: [0, 2], label: "Market", pause: 5 },
  ];
  const tick = (hour, delta) =>
    advanceHousehold(
      curfew,
      journey,
      stops,
      hour,
      delta,
      1,
      () => [],
      [10, 0],
      [10, 4],
    );
  tick(15, 0.5);
  assert.equal(curfew.phase, "returning");
  assert.equal(journey.walker.x, 3);
  assert.equal(journey.walker.z, 0);
  const paused = JSON.stringify(journey);
  tick(20, 0);
  assert.equal(JSON.stringify(journey), paused);
  assert.equal(tick(18, 3).indoors, true);
  assert.equal(journey.walker.x, 10);
  assert.equal(journey.walker.z, 4);
  tick(23, 20);
  assert.equal(curfew.phase, "indoors");
  tick(6, 1);
  assert.equal(curfew.phase, "indoors");
  tick(7, 0.5);
  assert.equal(curfew.phase, "leaving");
  assert.equal(journey.walker.z, 1);
  tick(7, 3);
  assert.equal(curfew.phase, "visiting");
  assert.equal(journey.walker.x, 0);
  assert.equal(journey.walker.z, 0);
  assert.equal(householdOutsideHours(14.99), true);
  assert.equal(householdOutsideHours(15), false);
});

test("even the field inspection returns to the estate before night", () => {
  const roads = createRoadNetwork(roadRoutes);
  const paths = createNavigationGraph(roadRoutes, roads.curves);
  const stops = [
    { position: [-42, 28], lookAt: [-46, 42], label: "Fields", pause: 10 },
  ];
  const journey = createInspection(stops[0].position);
  const curfew = { phase: "visiting" };
  for (let elapsed = 0; elapsed < 40; elapsed += 0.04) {
    advanceHousehold(
      curfew,
      journey,
      stops,
      15 + elapsed / 10,
      0.04,
      1.35,
      paths.findPath,
      [74, -51],
      [74, -55],
    );
  }
  assert.equal(curfew.phase, "indoors");
  assert.ok(Math.hypot(journey.walker.x - 74, journey.walker.z + 55) < 0.001);
});

test("predators emerge at night, freeze while paused, and retrace their route at dawn", () => {
  const patrol = createNightPatrol([
    [0, 0],
    [10, 0],
    [10, 10],
  ]);
  assert.equal(advanceNightPatrol(patrol, 12, 1, 2).visible, false);
  const night = advanceNightPatrol(patrol, 19, 2, 2);
  assert.equal(night.visible, true);
  assert.equal(patrol.walker.x, 4);
  const paused = JSON.stringify(patrol);
  advanceNightPatrol(patrol, 19, 0, 2);
  assert.equal(JSON.stringify(patrol), paused);
  advanceNightPatrol(patrol, 19, 4, 2);
  assert.equal(patrol.walker.x, 10);
  assert.equal(patrol.walker.z, 2);
  advanceNightPatrol(patrol, 6, 0.5, 2);
  assert.equal(patrol.walker.z, 1);
  assert.equal(advanceNightPatrol(patrol, 6, 10, 2).visible, false);
  assert.equal(patrol.walker.x, 0);
  assert.equal(patrol.walker.z, 0);
  assert.equal(predatorNightHours(2), true);
  assert.equal(predatorNightHours(5.5), false);
});

test("every tiger and wolf trail stays dry and outside homes and paddies", () => {
  const water = createWaterModel(
    riverRoutePoints,
    baseTerrainHeight,
    [pondX, pondZ],
    paddyPlots,
  );
  const habitat = createNightHabitat(water.distanceToRiver);
  for (const route of predatorTrails) {
    for (let index = 1; index < route.length; index++) {
      const a = route[index - 1],
        b = route[index];
      for (let step = 0; step <= 100; step++) {
        const x = a[0] + ((b[0] - a[0]) * step) / 100;
        const z = a[1] + ((b[1] - a[1]) * step) / 100;
        assert.equal(habitat(x, z), true, `unsafe night trail at ${x}, ${z}`);
        assert.equal(water.getWaterInfo(x, z), undefined);
      }
    }
  }
  for (const point of [...paddyPlots, [74, -55], [6, -30], [pondX, pondZ]])
    assert.equal(habitat(...point), false);
});
