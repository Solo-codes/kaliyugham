import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createRoadNetwork,
  createRoadRibbonGeometry,
  createRoadSurfaceHeight,
} from "../src/world/roads.ts";
import { createTerrainGrid, flattenTerrainArea } from "../src/world/terrain.ts";
import { createWaterModel, RIVER_HALF_WIDTH } from "../src/world/hydrology.ts";
import {
  cottageDoorstep,
  placeHouseLots,
  planBackyards,
} from "../src/world/settlement.ts";
import {
  baseTerrainHeight,
  bridgeRoadPoints,
  harvestPalmSites,
  kalariSite,
  landlordEstateSite,
  marketSites,
  paddyPlots,
  paddyTerrace,
  pondX,
  pondZ,
  requestedBuildingSites,
  riverRoutePoints,
  roadRoutes,
} from "../src/world/layout.ts";

const paddyTerrain = flattenTerrainArea(
  baseTerrainHeight,
  paddyTerrace.center,
  paddyTerrace.halfWidth,
  paddyTerrace.halfDepth,
  paddyTerrace.feather,
);
const water = createWaterModel(
  riverRoutePoints,
  paddyTerrain,
  [pondX, pondZ],
  paddyPlots,
);

test("terrain sampling follows the rendered triangle mesh", () => {
  const grid = createTerrainGrid(
    190,
    128,
    flattenTerrainArea(water.terrainHeight, kalariSite, 5.5, 4.3, 2),
  );
  const geometry = new THREE.PlaneGeometry(190, 190, 128, 128);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setZ(i, grid.heights[i]);
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const [x, z] of [
    [0, 0],
    [1.38, -7.91],
    [-49.9, 7.6],
    [-41.3, -48.6],
    [65.6, -52.1],
    [20.1, 21.3],
    [-87.4, 33.2],
  ]) {
    ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
    const [hit] = ray.intersectObject(ground);
    assert.ok(hit, `no terrain hit at ${x}, ${z}`);
    assert.ok(
      Math.abs(hit.point.y - grid.heightAt(x, z)) < 0.0001,
      `surface mismatch at ${x}, ${z}`,
    );
  }
});

test("flooded rice plots are supported by a level terrace", () => {
  const ground = createTerrainGrid(
    190,
    128,
    flattenTerrainArea(water.terrainHeight, kalariSite, 5.5, 4.3, 2),
  );
  const level = paddyTerrain(...paddyTerrace.center);
  for (const [x, z] of paddyPlots) {
    for (let dx = -5.85; dx <= 5.851; dx += 0.39) {
      for (let dz = -4.95; dz <= 4.951; dz += 0.33) {
        assert.ok(
          Math.abs(ground.heightAt(x + dx, z + dz) - level) < 0.00001,
          `unsupported plot at ${x + dx}, ${z + dz}`,
        );
      }
    }
    const flooded = water.getWaterInfo(x, z);
    assert.equal(flooded?.kind, "paddy");
    assert.ok(Math.abs(flooded.surfaceY - (level + 0.06)) < 0.00001);
  }
  const [x, z] = paddyTerrace.center;
  const outerX = x + paddyTerrace.halfWidth + paddyTerrace.feather;
  assert.equal(paddyTerrain(outerX, z), baseTerrainHeight(outerX, z));
});

test("road clearance follows the curved road rather than straight control segments", () => {
  const roads = createRoadNetwork([bridgeRoadPoints]);
  const curve = roads.curves[0];
  for (let i = 0; i <= 50; i++) {
    const point = curve.getPointAt(i / 50);
    assert.ok(
      roads.distanceToRoad(point.x, point.z) < 0.06,
      `road center missed at ${i}`,
    );
  }
  assert.equal(roads.distanceToRoad(80, 80), Infinity);
});

test("generated road triangles remain above the visible terrain", () => {
  const ground = createTerrainGrid(
    190,
    128,
    flattenTerrainArea(water.terrainHeight, kalariSite, 5.5, 4.3, 2),
  );
  const height = createRoadSurfaceHeight(
    ground.heightAt,
    water.distanceToRiver,
  );
  const roads = createRoadNetwork(roadRoutes);
  const weights = [
    [1 / 3, 1 / 3, 1 / 3],
    [0.6, 0.2, 0.2],
    [0.2, 0.6, 0.2],
    [0.2, 0.2, 0.6],
  ];
  roads.curves.forEach((curve, roadIndex) => {
    for (const [width, lift] of [
      [roadIndex < 3 ? 4.6 : 2.4, 0.075],
      [roadIndex < 3 ? 3.3 : 0.9, 0.105],
    ]) {
      const geometry = createRoadRibbonGeometry(
        curve,
        width,
        0,
        lift,
        height,
        (x, z) => water.distanceToRiver(x, z) >= RIVER_HALF_WIDTH + 0.1,
      );
      const vertices = geometry.attributes.position;
      const indices = geometry.index;
      for (let i = 0; i < indices.count; i += 3) {
        const triangle = [
          indices.getX(i),
          indices.getX(i + 1),
          indices.getX(i + 2),
        ];
        for (const weight of weights) {
          let x = 0;
          let y = 0;
          let z = 0;
          for (let vertex = 0; vertex < 3; vertex++) {
            x += vertices.getX(triangle[vertex]) * weight[vertex];
            y += vertices.getY(triangle[vertex]) * weight[vertex];
            z += vertices.getZ(triangle[vertex]) * weight[vertex];
          }
          assert.ok(
            y >= ground.heightAt(x, z) - 0.001,
            `road ${roadIndex} clipped at ${x}, ${z}`,
          );
        }
      }
    }
  });
});

test("village cottages remain clear of roads, reserved areas, and each other", () => {
  const roads = createRoadNetwork(roadRoutes);
  const isAllowed = (x, z) =>
    water.distanceToRiver(x, z) >= 8 &&
    paddyPlots.every(
      ([fieldX, fieldZ]) =>
        Math.abs(x - fieldX) >= 9.9 || Math.abs(z - fieldZ) >= 8.8,
    ) &&
    (Math.abs(x - kalariSite[0]) >= 9.3 ||
      Math.abs(z - kalariSite[1]) >= 8.1) &&
    harvestPalmSites.every(
      ([palmX, palmZ]) => Math.hypot(x - palmX, z - palmZ) >= 6,
    ) &&
    marketSites.every(
      ([marketX, marketZ]) => Math.hypot(x - marketX, z - marketZ) >= 6,
    ) &&
    Math.hypot(x - landlordEstateSite[0], z - landlordEstateSite[1]) >= 18;
  const lots = placeHouseLots(requestedBuildingSites, {
    distanceToRoad: roads.distanceToRoad,
    isAllowed,
  });
  assert.equal(lots.length, requestedBuildingSites.length);
  for (let i = 0; i < lots.length; i++) {
    const [x, z] = lots[i];
    assert.ok(roads.distanceToRoad(x, z) >= 6.5);
    assert.ok(isAllowed(x, z));
    for (let j = 0; j < i; j++)
      assert.ok(Math.hypot(x - lots[j][0], z - lots[j][1]) >= 8.5);
  }
});

test("chicken backyards stay behind cottages and off the roads", () => {
  const roads = createRoadNetwork(roadRoutes);
  const paddy = (x, z, padding) =>
    paddyPlots.some(
      ([a, b]) =>
        Math.abs(x - a) < 6.1 + padding && Math.abs(z - b) < 5 + padding,
    );
  const kalari = (x, z, padding) =>
    Math.abs(x - kalariSite[0]) < 5.5 + padding &&
    Math.abs(z - kalariSite[1]) < 4.3 + padding;
  const palm = (x, z, radius) =>
    harvestPalmSites.some(([a, b]) => Math.hypot(x - a, z - b) < radius);
  const lots = placeHouseLots(requestedBuildingSites, {
    distanceToRoad: roads.distanceToRoad,
    isAllowed: (x, z) =>
      water.distanceToRiver(x, z) >= 8 &&
      !paddy(x, z, 3.8) &&
      !kalari(x, z, 3.8) &&
      !palm(x, z, 6) &&
      marketSites.every(([a, b]) => Math.hypot(x - a, z - b) >= 6) &&
      Math.hypot(x - landlordEstateSite[0], z - landlordEstateSite[1]) >= 18,
  });
  const allowed = (x, z, index) =>
    roads.distanceToRoad(x, z) >= 2.8 &&
    water.distanceToRiver(x, z) >= 4.5 &&
    !paddy(x, z, 0.8) &&
    !kalari(x, z, 0.7) &&
    !palm(x, z, 2.5) &&
    marketSites.every(([a, b]) => Math.hypot(x - a, z - b) >= 2.8) &&
    lots.every(
      ([a, b], other) => other === index || Math.hypot(x - a, z - b) >= 3.6,
    );
  const plans = planBackyards(lots, roads.closestRoad, allowed);
  assert.ok(
    plans.filter((plan) => plan.hasYard).length >= 7,
    "too few safe backyards",
  );
  const homes = lots
    .map((lot, index) => cottageDoorstep(lot, plans[index].rotation))
    .filter(([x, z]) => roads.distanceToRoad(x, z) < 10);
  assert.ok(homes.length >= 8, "too few cottage entrances near a lane");
  for (const [index, plan] of plans.entries()) {
    const [doorX, doorZ] = cottageDoorstep(lots[index], plan.rotation);
    assert.ok(
      lots.every(
        ([x, z], other) =>
          other === index || Math.hypot(doorX - x, doorZ - z) >= 4,
      ),
    );
    if (!plan.hasYard) continue;
    const [houseX, houseZ] = lots[index];
    const cosine = Math.cos(plan.rotation);
    const sine = Math.sin(plan.rotation);
    for (let localX = -3.3; localX <= 3.31; localX += 0.3) {
      for (let localZ = 5.2; localZ <= 8.81; localZ += 0.3) {
        const x = houseX + localX * cosine + localZ * sine;
        const z = houseZ - localX * sine + localZ * cosine;
        assert.ok(
          allowed(x, z, index),
          `unsafe backyard ${index} at ${x}, ${z}`,
        );
      }
    }
  }
  const blocked = planBackyards(
    [[0, 0]],
    () => undefined,
    () => false,
  );
  assert.equal(blocked[0].hasYard, false);
});
