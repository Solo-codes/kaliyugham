import * as THREE from "three";

const umbrellaGeometry = (() => {
  const vertices: number[] = [],
    colours: number[] = [],
    indices: number[] = [];
  const shades = ["#887948", "#9b8b53", "#756b3f", "#a29461"].map(
    (colour) => new THREE.Color(colour),
  );
  for (let ring = 0; ring <= 5; ring++)
    for (let sector = 0; sector <= 24; sector++) {
      const radius = (ring / 5) * 0.85,
        angle = (sector / 24) * Math.PI * 2;
      vertices.push(
        Math.cos(angle) * radius,
        0.3 * (1 - (radius / 0.85) ** 2),
        Math.sin(angle) * radius,
      );
      const shade = shades[Math.floor(sector / 3) % 4];
      colours.push(shade.r, shade.g, shade.b);
      if (ring < 5 && sector < 24) {
        const a = ring * 25 + sector;
        indices.push(a, a + 25, a + 1, a + 25, a + 26, a + 1);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
})();
const umbrellaMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.95,
  side: THREE.DoubleSide,
});
const caneMaterial = new THREE.MeshStandardMaterial({
  color: "#6b5133",
  roughness: 1,
});
export function makeRainUmbrella() {
  const group = new THREE.Group();
  const canopy = new THREE.Mesh(umbrellaGeometry, umbrellaMaterial);
  canopy.position.y = 2.12;
  canopy.castShadow = true;
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 1.3, 6),
    caneMaterial,
  );
  handle.position.set(0.15, 1.48, 0);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.84, 0.012, 4, 24),
    caneMaterial,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 2.12;
  group.add(canopy, handle, rim);
  group.visible = false;
  return group;
}
/** A single broad elephant-ear (chembu) leaf, not a woven umbrella. */
export function makeElephantEarCover() {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.55);
  shape.bezierCurveTo(-0.2, -0.25, -0.85, 0.05, -0.65, 0.55);
  shape.bezierCurveTo(-0.5, 0.9, -0.08, 0.72, 0, 0.4);
  shape.bezierCurveTo(0.1, 0.75, 0.55, 0.88, 0.7, 0.5);
  shape.bezierCurveTo(0.9, 0.05, 0.22, -0.28, 0, -0.55);
  const blade = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 16),
    new THREE.MeshStandardMaterial({
      color: "#477139",
      roughness: 0.88,
      side: THREE.DoubleSide,
    }),
  );
  blade.rotation.x = -Math.PI / 2 + 0.18;
  blade.position.set(0.03, 1.98, 0);
  blade.castShadow = true;
  group.add(blade);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.02, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: "#7b974c", roughness: 1 }),
  );
  stem.position.set(0.2, 1.55, 0.18);
  stem.rotation.z = -0.2;
  group.add(stem);
  const veinMaterial = new THREE.LineBasicMaterial({ color: "#90a258" });
  for (let side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const z = -0.3 + i * 0.2;
      const vein = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0.03, 2.01, z),
          new THREE.Vector3(side * (0.3 + i * 0.05), 2.02, z - 0.14),
        ]),
        veinMaterial,
      );
      group.add(vein);
    }
  group.visible = false;
  return group;
}
export function makeHandheldLeaf() {
  const cover = makeElephantEarCover();
  // Lower stem endpoint is the palm grip; the broad leaf sits above the head.
  cover.children.forEach((child) => {
    child.position.y -= 1.1;
  });
  const stem = cover.children[1];
  stem.position.set(0, 0.45, 0);
  stem.rotation.z = 0;
  return cover;
}
export function makeBananaPlant(seed: number) {
  const plant = new THREE.Group();
  const stemMaterial = new THREE.MeshStandardMaterial({
    color: "#839254",
    roughness: 0.94,
  });
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: "#52793b",
    roughness: 0.86,
    side: THREE.DoubleSide,
  });
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.25, 2.5, 10, 8),
    stemMaterial,
  );
  stem.position.y = 1.25;
  stem.castShadow = true;
  plant.add(stem);
  for (let leaf = 0; leaf < 8; leaf++) {
    const angle = (leaf * Math.PI * 2) / 8 + seed * 0.31,
      vertices: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let segment = 0; segment <= 14; segment++) {
      const t = segment / 14,
        length = 1.8 + (leaf % 3) * 0.15;
      const width =
        Math.sin(t * Math.PI) * 0.32 * (segment % 4 === 0 ? 0.82 : 1);
      for (const side of [-1, 1]) {
        vertices.push(side * width, 0.75 * t - 1.05 * t * t, t * length);
        uv.push(side === -1 ? 0 : 1, t);
      }
      if (segment < 14) {
        const a = segment * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const frond = new THREE.Mesh(geometry, leafMaterial);
    frond.position.y = 2.1 + (leaf % 3) * 0.15;
    frond.rotation.y = angle;
    frond.castShadow = true;
    frond.receiveShadow = true;
    plant.add(frond);
  }
  const fruitMaterial = new THREE.MeshStandardMaterial({
    color: "#729044",
    roughness: 0.8,
  });
  for (let fruit = 0; fruit < 14; fruit++) {
    const banana = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.04, 0.17, 3, 7),
      fruitMaterial,
    );
    const angle = (fruit * Math.PI * 2) / 7;
    banana.position.set(
      0.3 + Math.cos(angle) * 0.13,
      1.85 - Math.floor(fruit / 7) * 0.18,
      Math.sin(angle) * 0.13,
    );
    banana.rotation.z = Math.sin(angle) * 0.4;
    plant.add(banana);
  }
  return plant;
}
