import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {
  makeDetailedTree,
  makeLeafAtlas,
  makePleatedWrap,
  makeRidgeGeometry,
  makeSurfaceMaps,
  ridgePlacement,
} from "../src/world/realism.ts";

test("procedural physical surfaces have reproducible colour, bump and roughness maps", () => {
  const first = makeSurfaceMaps("soil", 4),
    second = makeSurfaceMaps("soil", 4);
  for (const key of ["map", "bumpMap", "roughnessMap"]) {
    assert.equal(first[key].image.width, 256);
    assert.equal(first[key].repeat.x, 4);
    assert.deepEqual(first[key].image.data, second[key].image.data);
    assert.ok(new Set(first[key].image.data).size > 20);
  }
});
test("leaf silhouettes replace ball canopies using batched branches and foliage", () => {
  const atlas = makeLeafAtlas();
  const data = atlas.image.data;
  let empty = 0,
    solid = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) empty++;
    else solid++;
  }
  assert.ok(empty > 0 && solid > 0);
  const tree = makeDetailedTree(
    1973,
    4,
    1.5,
    atlas,
    new THREE.MeshStandardMaterial(),
  );
  assert.equal(
    tree.children.length,
    2,
    "tree should batch branches and leaves into two draw calls",
  );
  const leaves = tree.children.find(
    (child) => child instanceof THREE.InstancedMesh,
  );
  assert.equal(leaves.count, 240);
  assert.ok(leaves.material.alphaTest > 0);
  assert.ok(
    leaves.geometry.boundingSphere === null ||
      Number.isFinite(leaves.geometry.boundingSphere.radius),
  );
});
test("natural ridges and folded clothing preserve finite geometry", () => {
  const ridge = makeRidgeGeometry(1973);
  const positions = ridge.attributes.position;
  let high = 0;
  for (let i = 0; i < positions.count; i++) {
    assert.ok(Number.isFinite(positions.getY(i)));
    high = Math.max(high, positions.getY(i));
    if (
      Math.abs(positions.getX(i)) > 0.999 ||
      Math.abs(positions.getZ(i)) > 0.999
    )
      assert.equal(positions.getY(i), 0);
  }
  assert.ok(high > 0.3);
  const wrap = makePleatedWrap(new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8));
  assert.equal(wrap.parameters.radialSegments, 32);
  assert.equal(wrap.parameters.height, 0.8);
  wrap.computeBoundingSphere();
  assert.ok(Number.isFinite(wrap.boundingSphere.radius));
});

test("decorative mountain footprints remain outside the playable estate and village", () => {
  for (let i = 0; i < 13; i++) {
    const placement = ridgePlacement((i / 13) * Math.PI * 2, 17, 160);
    const closestX = Math.max(Math.abs(placement.x) - placement.scaleX, 0);
    const closestZ = Math.max(Math.abs(placement.z) - placement.scaleZ, 0);
    assert.ok(Math.hypot(closestX, closestZ) > 110);
    assert.ok(
      Math.abs(74 - placement.x) > placement.scaleX + 16 ||
        Math.abs(-63 - placement.z) > placement.scaleZ + 16,
    );
  }
});
