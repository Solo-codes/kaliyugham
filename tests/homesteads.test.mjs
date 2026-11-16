import test from "node:test";
import assert from "node:assert/strict";
import {
  insideGarden,
  planHomesteads,
  planVegetablePlots,
} from "../src/world/homesteads.ts";
import { cottageDoorstep } from "../src/world/settlement.ts";
import { createWaterModel } from "../src/world/hydrology.ts";
import { createRoadNetwork } from "../src/world/roads.ts";
import {
  baseTerrainHeight,
  paddyPlots,
  pondX,
  pondZ,
  roadRoutes,
  riverRoutePoints,
} from "../src/world/layout.ts";

test("seeded homesteads have separated footprints and real lane-facing doorsteps", () => {
  const anchors = [
    [0, 12],
    [25, 12],
    [50, 12],
  ];
  const clear = (x, z) => z > 4 && z < 26 && x > -15 && x < 68;
  const lane = (x) => [x, 0];
  const first = planHomesteads(anchors, 1974, clear, lane);
  assert.equal(first.length, 3);
  assert.deepEqual(first, planHomesteads(anchors, 1974, clear, lane));
  assert.notDeepEqual(first, planHomesteads(anchors, 1975, clear, lane));
  for (const [index, home] of first.entries()) {
    assert.deepEqual(home.doorstep, cottageDoorstep(home.site, home.rotation));
    assert.ok(
      Math.hypot(home.site[0] - home.lane[0], home.site[1] - home.lane[1]) < 22,
    );
    for (const other of first.slice(0, index))
      assert.ok(
        Math.hypot(
          other.site[0] - home.site[0],
          other.site[1] - home.site[1],
        ) >= 12,
      );
    for (let x = -3.1; x <= 3.11; x += 0.62)
      for (let z = -3.4; z <= 3.41; z += 0.68) {
        assert.ok(
          clear(
            home.site[0] +
              x * Math.cos(home.rotation) +
              z * Math.sin(home.rotation),
            home.site[1] -
              x * Math.sin(home.rotation) +
              z * Math.cos(home.rotation),
          ),
        );
      }
  }
});

test("obstructed footprints and impassable doorstep paths are not accepted", () => {
  assert.equal(
    planHomesteads(
      [[0, 12]],
      1,
      () => false,
      (x) => [x, 0],
    ).length,
    0,
  );
  assert.equal(
    planHomesteads(
      [[0, 12]],
      1,
      () => true,
      (x) => [x, 0],
      () => false,
    ).length,
    0,
  );
  assert.equal(
    planHomesteads(
      [[0, 12]],
      1,
      () => true,
      () => undefined,
    ).length,
    0,
  );
});

test("vegetables grow on dry land beside, not inside, the flooded rice plots", () => {
  const water = createWaterModel(
    riverRoutePoints,
    baseTerrainHeight,
    [pondX, pondZ],
    paddyPlots,
  );
  const roads = createRoadNetwork(roadRoutes);
  const clear = (x, z) =>
    !water.getWaterInfo(x, z) &&
    roads.distanceToRoad(x, z) > 2.8 &&
    water.distanceToRiver(x, z) > 8 &&
    !paddyPlots.some(
      ([px, pz]) => Math.abs(x - px) < 8.1 && Math.abs(z - pz) < 7,
    );
  const plots = planVegetablePlots(
    [
      [-58, 54],
      [-46, 54],
      [-34, 54],
    ],
    clear,
  );
  assert.equal(plots.length, 3);
  assert.deepEqual(
    plots.map((plot) => plot.crop),
    ["okra", "brinjal", "gourd"],
  );
  for (const plot of plots) {
    assert.equal(insideGarden(plots, ...plot.center), true);
    for (let x = -4; x <= 4; x += 0.5)
      for (let z = -2.9; z <= 2.91; z += 0.5)
        assert.ok(clear(plot.center[0] + x, plot.center[1] + z));
  }
  assert.equal(planVegetablePlots([[0, 0]], () => false).length, 0);
  assert.equal(insideGarden(plots, 0, 0), false);
});
