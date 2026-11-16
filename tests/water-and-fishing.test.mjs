import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  bridgeHeightAt,
  createBridgeSpan,
  createWaterModel,
  findCrossing,
  RIVER_HALF_WIDTH,
} from "../src/world/hydrology.ts";
import { sampleCastNet } from "../src/world/castNet.ts";
import {
  baseTerrainHeight,
  bridgeRoadPoints,
  paddyPlots,
  pondX,
  pondZ,
  riverRoutePoints,
} from "../src/world/layout.ts";

const water = createWaterModel(
  riverRoutePoints,
  baseTerrainHeight,
  [pondX, pondZ],
  paddyPlots,
);
const bridgeRoad = new THREE.CatmullRomCurve3(
  bridgeRoadPoints.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  "catmullrom",
  0.35,
);

test("the visible curved river has deep swimmable water along its center", () => {
  for (const progress of [0.02, 0.2, 0.23, 0.31, 0.356, 0.4, 0.63, 0.8, 0.98]) {
    const point = water.river.getPointAt(progress);
    const sample = water.getWaterInfo(point.x, point.z);
    assert.equal(sample?.kind, "river", `no river detected at ${progress}`);
    assert.ok(sample.depth > 1.8, `river too shallow at ${progress}`);
    assert.ok(
      Math.abs(sample.surfaceY - water.riverSurface(point.x, point.z)) < 0.03,
    );
  }
});

test("river depth tapers at the bank and dry land is not water", () => {
  const center = water.river.getPointAt(0.23);
  const tangent = water.river.getTangentAt(0.23);
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const shallow = center
    .clone()
    .addScaledVector(normal, RIVER_HALF_WIDTH * 0.94);
  const outside = center.clone().addScaledVector(normal, RIVER_HALF_WIDTH + 1);
  const shallowWater = water.getWaterInfo(shallow.x, shallow.z);
  assert.ok(!shallowWater || shallowWater.depth < 0.55);
  assert.notEqual(water.getWaterInfo(outside.x, outside.z)?.kind, "river");
});

test("the pond is swimmable and paddies stay shallow", () => {
  const pond = water.getWaterInfo(pondX, pondZ);
  assert.equal(pond?.kind, "pond");
  assert.ok(pond.depth >= 1.5);
  assert.notEqual(water.getWaterInfo(pondX + 8, pondZ)?.kind, "pond");
  for (const [x, z] of paddyPlots) {
    const paddy = water.getWaterInfo(x, z);
    assert.equal(paddy?.kind, "paddy");
    assert.ok(paddy.depth > 0 && paddy.depth < 0.55);
  }
});

test("the lowland sea also reports its water depth", () => {
  const seaWorld = createWaterModel(
    [
      [100, 100],
      [120, 110],
    ],
    () => -8.4,
    [200, 200],
    [],
  );
  const sea = seaWorld.getWaterInfo(0, 0);
  assert.equal(sea?.kind, "sea");
  assert.ok(Math.abs(sea.depth - 1.2) < 0.0001);
});

test("the bridge intersects the real river and reaches dry ground on both banks", () => {
  const crossing = findCrossing(bridgeRoad, water.river);
  assert.ok(crossing, "bridge road does not intersect the river");
  const bridge = createBridgeSpan(crossing, water.terrainHeight);
  const start = {
    x: bridge.x - bridge.roadX * bridge.halfLength,
    z: bridge.z - bridge.roadZ * bridge.halfLength,
  };
  const end = {
    x: bridge.x + bridge.roadX * bridge.halfLength,
    z: bridge.z + bridge.roadZ * bridge.halfLength,
  };
  assert.ok(water.distanceToRiver(start.x, start.z) > RIVER_HALF_WIDTH);
  assert.ok(water.distanceToRiver(end.x, end.z) > RIVER_HALF_WIDTH);
  assert.notEqual(water.getWaterInfo(start.x, start.z)?.kind, "river");
  assert.notEqual(water.getWaterInfo(end.x, end.z)?.kind, "river");
  const approach = bridgeRoad.getSpacedPoints(1000);
  for (const point of [start, end]) {
    assert.ok(
      Math.min(
        ...approach.map((roadPoint) =>
          Math.hypot(point.x - roadPoint.x, point.z - roadPoint.z),
        ),
      ) < 1,
    );
  }
  assert.ok(
    (bridgeHeightAt(bridge, bridge.x, bridge.z) ?? -Infinity) >
      water.getWaterInfo(bridge.x, bridge.z).surfaceY,
  );
  assert.equal(
    bridgeHeightAt(
      bridge,
      bridge.x + bridge.roadZ * 4,
      bridge.z - bridge.roadX * 4,
    ),
    undefined,
  );
});

test("the visible river strip does not invert at bends", () => {
  const sides = [];
  for (let i = 0; i <= 220; i++) {
    const point = water.river.getPointAt(i / 220);
    const tangent = water.river.getTangentAt(i / 220);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    sides.push([
      point.clone().addScaledVector(normal, -RIVER_HALF_WIDTH),
      point.clone().addScaledVector(normal, RIVER_HALF_WIDTH),
    ]);
  }
  for (let i = 0; i < sides.length - 1; i++) {
    const [left, right] = sides[i];
    const nextLeft = sides[i + 1][0];
    const signedArea =
      (right.x - left.x) * (nextLeft.z - left.z) -
      (right.z - left.z) * (nextLeft.x - left.x);
    assert.ok(signedArea < 0, `river surface folds at segment ${i}`);
  }
});

test("Kerala cast net gathers, opens, sinks and is retrieved continuously", () => {
  const gathered = sampleCastNet(1);
  const throwing = sampleCastNet(3.1);
  const sinking = sampleCastNet(5);
  const retrieving = sampleCastNet(8);
  assert.equal(gathered.phase, "gather");
  assert.equal(throwing.phase, "throw");
  assert.equal(sinking.phase, "sink");
  assert.equal(retrieving.phase, "retrieve");
  assert.ok(throwing.outreach > 0 && throwing.outreach < 1);
  assert.ok(sinking.spread > throwing.spread && sinking.sink > 0);
  assert.ok(retrieving.outreach < sinking.outreach);
  for (const boundary of [2.4, 3.8, 6.4, 9.3, 12]) {
    const before = sampleCastNet(boundary - 0.00001);
    const after = sampleCastNet(boundary + 0.00001);
    assert.ok(Math.abs(before.outreach - after.outreach) < 0.001);
    assert.ok(Math.abs(before.spread - after.spread) < 0.001);
  }
});
