import test from "node:test";
import assert from "node:assert/strict";
import {
  clearStandingPoint,
  insideSolid,
  moveBody,
  obstacleDetour,
  segmentClear,
} from "../src/world/collision.ts";
import { advanceWalker, setWalkerMotion } from "../src/world/navigation.ts";
import { makeFlowers, templePrayerHours } from "../src/world/temple.ts";
import {
  insideMarketDistrict,
  insideTempleGround,
  templeSite,
} from "../src/world/layout.ts";

const wall = { x: 0, z: 0, halfX: 1, halfZ: 2, rotation: 0 };
test("solid buildings block fast moves and diagonal movement slides along walls", () => {
  const result = moveBody([-4, 0], [4, 0], 0.3, [wall]);
  assert.ok(result[0] <= -1.3);
  const slide = moveBody([-2, -1], [0, 3], 0.3, [wall]);
  assert.equal(insideSolid(wall, ...slide, 0.3), false);
  assert.ok(slide[1] > 1);
  assert.equal(segmentClear([-4, 0], [4, 0], [wall], 0.3), false);
  assert.equal(segmentClear([-4, 4], [4, 4], [wall], 0.3), true);
});
test("rotated buildings and people/animals resist overlap", () => {
  const rotated = { ...wall, rotation: Math.PI / 4 };
  const result = moveBody([-4, 0], [4, 0], 0.3, [rotated]);
  assert.equal(insideSolid(rotated, ...result, 0.3), false);
  const crowd = moveBody(
    [0, 0],
    [5, 0],
    0.3,
    [],
    [{ x: 2, z: 0, radius: 0.5 }],
  );
  assert.ok(crowd[0] <= 1.21);
});
test("walkers change paths around a building instead of penetrating it", () => {
  const path = obstacleDetour([-4, 0], [4, 0], [wall], 0.35);
  assert.ok(path.length > 1);
  let previous = [-4, 0];
  for (const point of path) {
    assert.ok(segmentClear(previous, point, [wall], 0.35));
    previous = point;
  }
  setWalkerMotion({
    detour: (a, b) => obstacleDetour(a, b, [wall], 0.35),
    move: (a, b) => moveBody(a, b, 0.3, [wall]),
  });
  try {
    const walker = { x: -4, z: 0, path: [[4, 0]], waypoint: 0 };
    for (let i = 0; i < 200; i++) {
      advanceWalker(walker, 0.1);
      assert.equal(insideSolid(wall, walker.x, walker.z, 0.3), false);
    }
    assert.ok(Math.hypot(walker.x - 4, walker.z) < 0.04);
  } finally {
    setWalkerMotion(undefined);
  }
});
test("market stays residential-free and temple has morning/evening offering hours", () => {
  assert.equal(insideMarketDistrict(10, -32), true);
  assert.equal(insideMarketDistrict(35, -30), false);
  assert.equal(insideTempleGround(...templeSite), true);
  assert.equal(templePrayerHours(8), true);
  assert.equal(templePrayerHours(17), true);
  assert.equal(templePrayerHours(23), false);
  assert.ok(makeFlowers().children.length >= 9);
});

test("a home waypoint inside an obstacle is repaired to reachable standing ground", () => {
  const safe = clearStandingPoint([0, 0], [wall], 0.36);
  assert.equal(insideSolid(wall, ...safe, 0.36), false);
  setWalkerMotion({
    safePoint: (p) => clearStandingPoint(p, [wall], 0.36),
    detour: (a, b) => obstacleDetour(a, b, [wall], 0.36),
    move: (a, b) => moveBody(a, b, 0.3, [wall]),
  });
  try {
    const walker = { x: -4, z: 0, path: [[0, 0]], waypoint: 0 };
    for (let i = 0; i < 200; i++) advanceWalker(walker, 0.1);
    assert.equal(walker.waypoint, walker.path.length);
    assert.equal(insideSolid(wall, walker.x, walker.z, 0.3), false);
  } finally {
    setWalkerMotion(undefined);
  }
});

test("a previously checked waypoint is retried when a new blockage appears", () => {
  let block = false,
    checks = 0;
  setWalkerMotion({
    move: (a, b) => (block ? a : b),
    detour: (_a, b) => {
      checks++;
      return [b];
    },
  });
  try {
    const walker = { x: 0, z: 0, path: [[5, 0]], waypoint: 0 };
    advanceWalker(walker, 0.1);
    const first = checks;
    block = true;
    for (let i = 0; i < 10; i++) advanceWalker(walker, 0.1);
    assert.ok(checks > first, "stalled walkers must reconsider their path");
    block = false;
    advanceWalker(walker, 10);
    assert.equal(walker.waypoint, 1);
  } finally {
    setWalkerMotion(undefined);
  }
});
