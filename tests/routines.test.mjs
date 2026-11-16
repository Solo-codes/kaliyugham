import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDuty,
  advanceInspection,
  createDuty,
  createInspection,
  horseAction,
  isWorkday,
  sampleKalariDrill,
} from "../src/world/routines.ts";
import { createForestHabitat } from "../src/world/habitat.ts";
import { createWaterModel } from "../src/world/hydrology.ts";
import {
  baseTerrainHeight,
  paddyPlots,
  pondX,
  pondZ,
  riverRoutePoints,
} from "../src/world/layout.ts";

const direct = () => [];
test("workers commute home at dusk and return to the same workplace", () => {
  const duty = createDuty([0, 0], [5, 0]);
  assert.equal(advanceDuty(duty, 8, 1, 2, direct).working, true);
  const dusk = advanceDuty(duty, 19, 1, 2, direct);
  assert.equal(dusk.working, false);
  assert.equal(dusk.atHome, false);
  assert.equal(duty.walker.x, 2);
  const paused = duty.walker.x;
  advanceDuty(duty, 19, 0, 2, direct);
  assert.equal(duty.walker.x, paused);
  assert.equal(advanceDuty(duty, 19, 2, 2, direct).atHome, true);
  assert.equal(advanceDuty(duty, 6, 1, 2, direct).working, false);
  assert.equal(advanceDuty(duty, 6, 2, 2, direct).working, true);
  assert.equal(duty.walker.x, 0);
  assert.equal(isWorkday(5.9), false);
  assert.equal(isWorkday(6), true);
  assert.equal(isWorkday(18.5), false);
});
test("inspection party pauses at each property and steps by traveled distance", () => {
  const stops = [
    { position: [0, 0], lookAt: [0, 2], label: "Estate", pause: 3 },
    { position: [4, 0], lookAt: [4, 2], label: "Market", pause: 4 },
  ];
  const state = createInspection([0, 0]);
  advanceInspection(state, stops, 2, 1, direct);
  const moving = advanceInspection(state, stops, 1, 1, direct);
  assert.equal(moving.inspecting, false);
  assert.equal(moving.traveled, 1);
  assert.equal(state.stride, 5);
  advanceInspection(state, stops, 3, 1, direct);
  assert.equal(state.atStop, true);
  assert.equal(state.walker.x, 4);
  const before = state.stride;
  assert.equal(advanceInspection(state, stops, 2, 1, direct).traveled, 0);
  assert.equal(state.stride, before);
});
test("kalari partners alternate sword cuts and buckler guards", () => {
  const cutter = sampleKalariDrill(1.5);
  const defender = sampleKalariDrill(1.5, 3);
  assert.equal(cutter.cut, 1);
  assert.equal(cutter.guard, 0);
  assert.equal(defender.cut, 0);
  assert.equal(defender.guard, 1);
  for (const boundary of [0, 3, 6]) {
    assert.ok(
      Math.abs(
        sampleKalariDrill(boundary - 1e-6).sword -
          sampleKalariDrill(boundary + 1e-6).sword,
      ) < 1e-5,
    );
  }
});
test("Q summons from afar, mounts nearby and dismounts while riding", () => {
  assert.equal(horseAction(false, 10, true), "summon");
  assert.equal(horseAction(false, 2, true), "mount");
  assert.equal(horseAction(true, 0, true), "dismount");
  assert.equal(horseAction(false, 2, false), "unavailable");
});

test("all wildlife sites are in dry far-bank forest, never the rice fields", () => {
  const water = createWaterModel(
    riverRoutePoints,
    baseTerrainHeight,
    [pondX, pondZ],
    paddyPlots,
  );
  const forest = createForestHabitat(water.distanceToRiver);
  for (const [x, z] of [
    [-60, -18],
    [-69, -32],
    [-78, 8],
    [-76, 31],
    [-63, -60],
    [-79, -20],
    [-64, -8],
    [-77, -46],
    [-68, -45],
    [-74, -62],
    [-81, -6],
  ]) {
    assert.equal(forest(x, z), true, `unsafe wildlife site ${x}, ${z}`);
    assert.equal(water.getWaterInfo(x, z), undefined);
  }
  for (const [x, z] of paddyPlots) assert.equal(forest(x, z), false);
  assert.equal(forest(pondX, pondZ), false);
  assert.equal(forest(58, 12), false);
});
