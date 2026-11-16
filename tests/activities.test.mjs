import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCoconutHarvest,
  sampleCoconutHarvest,
} from "../src/world/coconut.ts";
import { advancePaddyWork, samplePaddyWork } from "../src/world/paddyWork.ts";
import { flattenTerrainArea } from "../src/world/terrain.ts";
import { baseTerrainHeight, kalariSite } from "../src/world/layout.ts";

test("harvesters approach, climb, pick, descend and rest", () => {
  assert.equal(sampleCoconutHarvest(0).phase, "approach");
  assert.equal(sampleCoconutHarvest(8).phase, "climb");
  assert.equal(sampleCoconutHarvest(20).phase, "pick");
  assert.equal(sampleCoconutHarvest(27).phase, "descend");
  assert.equal(sampleCoconutHarvest(40).phase, "rest");
  assert.equal(sampleCoconutHarvest(46).phase, "approach");
  assert.ok(
    sampleCoconutHarvest(15).progress > sampleCoconutHarvest(8).progress,
  );
});

test("harvesters finish descending after sunset and rest until morning", () => {
  assert.equal(sampleCoconutHarvest(0, 0).phase, "approach");
  assert.equal(sampleCoconutHarvest(0, 42).phase, "rest");
  const climbing = advanceCoconutHarvest(10, 0.25, false, true);
  assert.equal(climbing.phase, "climb");
  assert.equal(climbing.time, 10.25);
  const resting = advanceCoconutHarvest(climbing.time, 60, false, true);
  assert.equal(resting.phase, "rest");
  assert.equal(resting.time, 38);
  assert.ok(resting.progress > 0.15);
  assert.deepEqual(
    advanceCoconutHarvest(resting.time, 60, false, true),
    resting,
  );
  assert.equal(advanceCoconutHarvest(resting.time, 0.5, true, true).time, 38.5);
  assert.deepEqual(
    advanceCoconutHarvest(climbing.time, 60, true, false),
    climbing,
  );
  assert.deepEqual(
    advanceCoconutHarvest(climbing.time, 0, true, true),
    climbing,
  );
});

test("rice workers plant between short walks along the same row", () => {
  assert.deepEqual(samplePaddyWork(2), {
    phase: "plant",
    rowOffset: 0,
    direction: 0,
  });
  assert.equal(samplePaddyWork(8).phase, "walk");
  assert.equal(samplePaddyWork(8).direction, 1);
  assert.equal(samplePaddyWork(12).rowOffset, 1.5);
  assert.equal(samplePaddyWork(18).direction, -1);
  for (const boundary of [6, 10, 16, 20, 24]) {
    const before = samplePaddyWork(boundary - 0.00001).rowOffset;
    const after = samplePaddyWork(boundary + 0.00001).rowOffset;
    assert.ok(Math.abs(before - after) < 0.001, `worker jumps at ${boundary}`);
  }
  for (let time = -24; time < 48; time += 0.125) {
    const sample = samplePaddyWork(time, 3.2);
    const nextCycle = samplePaddyWork(time + 24, 3.2);
    assert.ok(sample.rowOffset >= 0 && sample.rowOffset <= 1.5);
    assert.equal(sample.phase, nextCycle.phase);
    assert.equal(sample.direction, nextCycle.direction);
    assert.ok(Math.abs(sample.rowOffset - nextCycle.rowOffset) < 0.0000001);
  }
});

test("rice workers hold their place when paused or inactive", () => {
  const walking = advancePaddyWork(7, 0.5, true);
  const paused = advancePaddyWork(walking.time, 0, true);
  const night = advancePaddyWork(paused.time, 60, false);
  const reducedMotion = advancePaddyWork(night.time, 10, false);
  assert.deepEqual(paused, walking);
  assert.deepEqual(night, walking);
  assert.deepEqual(reducedMotion, walking);
  const resumed = advancePaddyWork(reducedMotion.time, 0.1, true);
  assert.ok(resumed.rowOffset > walking.rowOffset);
  assert.ok(resumed.rowOffset - walking.rowOffset < 0.04);
});

test("kalari terrain is level and blends into the surrounding hillside", () => {
  const [x, z] = kalariSite;
  const floor = flattenTerrainArea(baseTerrainHeight, kalariSite, 5.5, 4.3, 2);
  assert.equal(floor(x - 5, z - 4), floor(x + 5, z + 4));
  assert.equal(floor(x + 8, z), baseTerrainHeight(x + 8, z));
  const boundary = x + 5.5;
  assert.ok(
    Math.abs(floor(boundary - 0.001, z) - floor(boundary + 0.001, z)) < 0.001,
  );
});
