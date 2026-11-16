import * as THREE from "three";

/** Tileable, locally generated detail maps: no downloaded textures or artwork. */
export function detailTexture(
  kind: "earth" | "wood" | "thatch" | "cloth" | "water",
  repeat = 1,
) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 1973;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const noise = random() - 0.5;
      const grain =
        kind === "wood"
          ? Math.sin((x * Math.PI) / 8 + Math.sin((y * Math.PI) / 32) * 0.8) *
            18
          : kind === "thatch"
            ? Math.sin((x * Math.PI) / 4) * 22 +
              Math.sin((y * Math.PI) / 16) * 8
            : kind === "cloth"
              ? (x % 4 < 2 ? 8 : -8) + (y % 4 < 2 ? 8 : -8)
              : kind === "water"
                ? Math.sin((x * Math.PI) / 32 + Math.sin((y * Math.PI) / 32)) *
                  12
                : Math.sin((x * Math.PI) / 32) *
                  Math.sin((y * Math.PI) / 32) *
                  12;
      const value = Math.round(
        215 + grain + noise * (kind === "earth" ? 44 : 18),
      );
      const offset = (y * size + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
export function makeBanana() {
  const banana = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, -0.06, 0),
    new THREE.Vector3(-0.12, 0.12, 0),
    new THREE.Vector3(0.06, 0.21, 0),
    new THREE.Vector3(0.2, 0.14, 0),
  ]);
  const peel = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 16, 0.065, 8, false),
    new THREE.MeshStandardMaterial({ color: "#d4b348", roughness: 0.68 }),
  );
  peel.castShadow = true;
  banana.add(peel);
  for (const point of [curve.getPoint(0), curve.getPoint(1)]) {
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#675039", roughness: 1 }),
    );
    tip.position.copy(point);
    banana.add(tip);
  }
  return banana;
}
export function makeDrinkingCoconut() {
  const coconut = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 20, 14),
    new THREE.MeshStandardMaterial({ color: "#7b963d", roughness: 0.8 }),
  );
  shell.scale.set(1, 1.12, 1);
  const opening = new THREE.Mesh(
    new THREE.CircleGeometry(0.09, 16),
    new THREE.MeshStandardMaterial({
      color: "#efe1c0",
      side: THREE.DoubleSide,
    }),
  );
  opening.rotation.x = -Math.PI / 2;
  opening.position.y = 0.215;
  const straw = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: "#d2bd82" }),
  );
  straw.position.set(0.03, 0.33, 0);
  straw.rotation.z = -0.2;
  coconut.add(shell, opening, straw);
  return coconut;
}
export function makeMarketFish() {
  const fish = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({
    color: "#98aaa4",
    metalness: 0.35,
    roughness: 0.38,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 10), coat);
  body.scale.set(0.6, 0.75, 2.3);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.18, 4), coat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 0.32;
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 6, 5),
    new THREE.MeshStandardMaterial({ color: "#202921" }),
  );
  eye.position.set(0.06, 0.04, -0.19);
  fish.add(body, tail, eye);
  return fish;
}
export function makeHandLight(kind: "lamp" | "leaf-torch") {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: "#5d4430",
    metalness: 0.35,
    roughness: 0.65,
  });
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: "#ffbb55",
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 8),
    flameMaterial,
  );
  flame.scale.set(0.8, 2, 0.8);
  if (kind === "lamp") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.07, 10),
      metal,
    );
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 0.2, 10),
      new THREE.MeshStandardMaterial({
        color: "#ebc897",
        transparent: true,
        opacity: 0.3,
        roughness: 0.25,
      }),
    );
    glass.position.y = 0.12;
    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.015, 5, 12, Math.PI),
      metal,
    );
    handle.position.y = 0.24;
    group.add(base, glass, handle);
    flame.position.y = 0.12;
  } else {
    for (let leaf = 0; leaf < 5; leaf++) {
      const frond = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.025, 0.58, 5),
        new THREE.MeshStandardMaterial({
          color: leaf % 2 ? "#9b753f" : "#715332",
          roughness: 1,
        }),
      );
      frond.position.set(
        Math.sin(leaf * 2) * 0.025,
        0.16,
        Math.cos(leaf * 2) * 0.025,
      );
      frond.rotation.z = (leaf - 2) * 0.035;
      group.add(frond);
    }
    flame.position.y = 0.48;
    flame.scale.set(1.5, 3.4, 1.5);
  }
  const light = new THREE.PointLight("#ffb05a", 0, 7, 2);
  light.position.copy(flame.position);
  group.add(flame);
  group.position.set(0, -0.48, -0.08);
  group.visible = false;
  return { group, flame, light, kind };
}
