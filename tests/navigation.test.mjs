import test from "node:test";
import assert from "node:assert/strict";
import { createRoadNetwork } from "../src/world/roads.ts";
import {
  advanceWalker,
  createNavigationGraph,
} from "../src/world/navigation.ts";
import { roadRoutes } from "../src/world/layout.ts";

const roads = createRoadNetwork(roadRoutes);
const graph = createNavigationGraph(roadRoutes, roads.curves);

test("village, market, fields, bridge and kalari have connected walking routes", () => {
  const destinations = [
    [31, -30],
    [2, -28],
    [-42, 28],
    [-50, 0],
    [9, -5.7],
    [68, -52],
  ];
  for (const destination of destinations) {
    const path = graph.findPath(...destinations[0], ...destination);
    assert.ok(path.length > 0, `no path to ${destination}`);
    for (let i = 1; i < path.length; i++) {
      assert.ok(
        Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) <
          3.5,
      );
      assert.ok(roads.distanceToRoad(...path[i]) < 0.06);
    }
  }
});

test("walkers move by actual distance and stop without circling a destination", () => {
  const path = graph.findPath(31, -30, 2, -28);
  const walker = { x: path[0][0], z: path[0][1], path, waypoint: 0 };
  const initial = [walker.x, walker.z];
  assert.equal(advanceWalker(walker, 0).traveled, 0);
  assert.deepEqual([walker.x, walker.z], initial);
  let arrived = false;
  for (let step = 0; step < 1000 && !arrived; step++) {
    const movement = advanceWalker(walker, 0.25);
    assert.ok(movement.traveled <= 0.250001);
    arrived = movement.arrived;
  }
  assert.ok(arrived);
  assert.ok(
    Math.hypot(walker.x - path.at(-1)[0], walker.z - path.at(-1)[1]) < 0.001,
  );
  assert.equal(advanceWalker(walker, 10).traveled, 0);
});
