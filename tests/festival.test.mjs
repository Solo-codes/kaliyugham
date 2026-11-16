import test from "node:test";
import assert from "node:assert/strict";
import {
  makeFestivalOrnaments,
  sampleFestival,
  shopFacing,
} from "../src/world/festival.ts";
import { makeHandheldLeaf } from "../src/world/ruralProps.ts";

test("utsavam decorations and gathering follow a repeatable day/hour schedule", () => {
  assert.equal(sampleFestival(0, 8).active, false);
  assert.equal(sampleFestival(0, 11).decorated, true);
  assert.equal(sampleFestival(0, 14.5).arriving, true);
  assert.equal(sampleFestival(0, 16).active, true);
  assert.equal(sampleFestival(0, 21).decorated, false);
  assert.equal(sampleFestival(1, 16).active, false);
  assert.equal(sampleFestival(2, 16).active, true);
});
test("shop local front faces the lane for every compass direction", () => {
  for (const road of [
    { x: 0, z: -5 },
    { x: 0, z: 5 },
    { x: 5, z: 0 },
    { x: -5, z: 0 },
  ]) {
    const angle = shopFacing(0, 0, road);
    const dot = (-Math.sin(angle) * road.x - Math.cos(angle) * road.z) / 5;
    assert.ok(dot > 0.999);
  }
});
test("leaf stem starts at the hand and centre elephant carries extra idol ornaments", () => {
  const cover = makeHandheldLeaf();
  const stem = cover.children[1];
  assert.equal(stem.position.x, 0);
  assert.equal(stem.rotation.z, 0);
  assert.ok(
    Math.abs(stem.position.y - stem.geometry.parameters.height / 2) < 0.00001,
  );
  const side = makeFestivalOrnaments(false),
    center = makeFestivalOrnaments(true);
  assert.ok(center.children.length > side.children.length);
  center.traverse((object) => {
    if (object.geometry) {
      object.geometry.computeBoundingSphere();
      assert.ok(Number.isFinite(object.geometry.boundingSphere.radius));
    }
  });
});
