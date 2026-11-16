import * as THREE from "three";
import type { EquipmentKind } from "./equipment";

const timber = new THREE.MeshStandardMaterial({
  color: "#68472e",
  roughness: 0.92,
});
const iron = new THREE.MeshStandardMaterial({
  color: "#9fa7a2",
  metalness: 0.6,
  roughness: 0.45,
});
const brass = new THREE.MeshStandardMaterial({
  color: "#b29456",
  metalness: 0.45,
  roughness: 0.55,
});
export function makeEquipment(kind: EquipmentKind) {
  const prop = new THREE.Group();
  if (kind === "bow") {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.55, 0),
      new THREE.Vector3(0.24, -0.3, 0),
      new THREE.Vector3(0.29, 0, 0),
      new THREE.Vector3(0.24, 0.3, 0),
      new THREE.Vector3(0, 0.55, 0),
    ]);
    prop.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.028, 7, false),
        timber,
      ),
    );
    prop.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          curve.getPoint(0),
          curve.getPoint(1),
        ]),
        new THREE.LineBasicMaterial({ color: "#d9c79b" }),
      ),
    );
  } else if (kind === "sword") {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.85, 0.025),
      iron,
    );
    blade.position.y = 0.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.043, 0.14, 4), iron);
    tip.position.y = 0.985;
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.18, 7),
      timber,
    );
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.045, 0.06),
      brass,
    );
    guard.position.y = 0.1;
    prop.add(blade, tip, grip, guard);
  } else {
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.07, 24),
      timber,
    );
    disk.rotation.x = Math.PI / 2;
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), iron);
    boss.scale.z = 0.6;
    boss.position.z = -0.075;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.018, 6, 24),
      brass,
    );
    prop.add(disk, boss, rim);
  }
  prop.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  return prop;
}
export function makeTeaGlass() {
  const cup = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.06, 0.2, 16),
    new THREE.MeshStandardMaterial({
      color: "#d0c6ac",
      transparent: true,
      opacity: 0.45,
      roughness: 0.25,
    }),
  );
  const tea = new THREE.Mesh(
    new THREE.CylinderGeometry(0.074, 0.052, 0.14, 16),
    new THREE.MeshStandardMaterial({ color: "#bb8655", roughness: 0.4 }),
  );
  tea.position.y = -0.02;
  cup.add(glass, tea);
  return cup;
}
export function makeSnack() {
  const snack = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.065, 0.2, 4, 10),
    new THREE.MeshStandardMaterial({ color: "#b68131", roughness: 0.8 }),
  );
  snack.rotation.z = Math.PI / 2;
  const group = new THREE.Group();
  group.add(snack);
  return group;
}
export function makeRabbit() {
  const group = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({
    color: "#a49880",
    roughness: 1,
  });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), coat);
  body.scale.set(0.8, 0.85, 1.3);
  body.position.y = 0.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), coat);
  head.position.set(0, 0.38, -0.25);
  const legs: THREE.Group[] = [];
  group.add(body, head);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.036, 0.21, 4, 8),
      coat,
    );
    ear.position.set(side * 0.055, 0.64, -0.21);
    ear.rotation.z = side * -0.15;
    group.add(ear);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.019, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#2d2c24" }),
    );
    eye.position.set(side * 0.11, 0.41, -0.33);
    group.add(eye);
    for (const z of [-0.16, 0.19]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.15, z);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), coat);
      foot.scale.set(1, 0.55, 1.5);
      foot.position.y = -0.07;
      leg.add(foot);
      group.add(leg);
      legs.push(leg);
    }
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), coat);
  tail.position.set(0, 0.3, 0.33);
  group.add(tail);
  return { group, legs, head };
}
export function makeTeaShop(shopType: "tea" | "toddy" = "tea") {
  const shop = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({
    color: "#967b56",
    roughness: 1,
  });
  const roof = new THREE.MeshStandardMaterial({
    color: "#7c543c",
    roughness: 1,
  });
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material = timber,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    shop.add(mesh);
    return mesh;
  };
  box(5, 0.15, 4, 0, 0, 0, wall);
  box(5, 2.55, 0.2, 0, 1.3, 1.8, wall);
  for (const x of [-2.4, 2.4]) {
    box(0.18, 2.55, 3.8, x, 1.3, 0, wall);
    box(0.12, 2.8, 0.12, x, 1.4, -2.2);
  }
  for (const side of [-1, 1]) {
    const panel = box(5.8, 0.16, 2.6, 0, 3, side * 1.15, roof);
    panel.rotation.x = side * 0.18;
  }
  box(2.8, 0.14, 0.85, 0, 1.1, -1.9);
  box(3.6, 0.08, 0.42, 0, 0.55, 0.5);
  for (const x of [-1.5, 1.5]) box(0.12, 0.55, 0.3, x, 0.28, 0.5);
  box(1.1, 0.6, 0.8, -1.55, 0.35, 1.15, wall);
  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), iron);
  kettle.position.set(-1.55, 0.9, 1.15);
  shop.add(kettle);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 8), iron);
  spout.rotation.z = -0.9;
  spout.position.set(-1.28, 0.98, 1.15);
  shop.add(spout);
  for (let item = 0; item < 4; item++) {
    const glass = makeTeaGlass();
    glass.position.set(-0.9 + item * 0.22, 1.24, -1.85);
    shop.add(glass);
  }
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.025, 16),
    brass,
  );
  plate.position.set(0.8, 1.2, -1.85);
  shop.add(plate);
  for (let item = 0; item < 3; item++) {
    const snack = makeSnack();
    snack.position.set(0.8, 1.25, -2 + item * 0.14);
    shop.add(snack);
  }
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 640;
  signCanvas.height = 128;
  const context = signCanvas.getContext("2d")!;
  context.fillStyle = "#283b30";
  context.fillRect(0, 0, 640, 128);
  context.fillStyle = "#ead9b3";
  context.font = "bold 48px sans-serif";
  context.textAlign = "center";
  context.fillText(shopType === "tea" ? "ചായക്കട" : "കള്ളുഷാപ്പ്", 320, 58);
  context.font = "26px sans-serif";
  context.fillText(
    shopType === "tea" ? "ചായ · പഴംപൊരി" : "കള്ള് · ₹2",
    320,
    103,
  );
  if (shopType === "toddy")
    for (let jar = 0; jar < 3; jar++) {
      const pot = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 12),
        new THREE.MeshStandardMaterial({ color: "#985a3c", roughness: 0.94 }),
      );
      pot.scale.y = 1.4;
      pot.position.set(-1 + jar * 0.7, 0.4, 1.3);
      shop.add(pot);
    }
  const texture = new THREE.CanvasTexture(signCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 0.76),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  sign.position.set(0, 2.3, -2.3);
  sign.rotation.y = Math.PI;
  shop.add(sign);
  return shop;
}
