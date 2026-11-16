import * as THREE from "three";
export const templePrayerHours = (hour: number) =>
  (hour >= 7 && hour < 10) || (hour >= 16 && hour < 18);
export function makeFlowers() {
  const flowers = new THREE.Group();
  const leaf = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 12),
    new THREE.MeshStandardMaterial({
      color: "#4c7134",
      side: THREE.DoubleSide,
    }),
  );
  leaf.rotation.x = -Math.PI / 2;
  flowers.add(leaf);
  for (let i = 0; i < 9; i++) {
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 6),
      new THREE.MeshStandardMaterial({
        color: i % 2 ? "#eadfc7" : "#e5b347",
        roughness: 0.9,
      }),
    );
    flower.position.set(
      Math.cos(i * 2.4) * 0.13,
      0.025,
      Math.sin(i * 2.4) * 0.13,
    );
    flowers.add(flower);
  }
  return flowers;
}
export function makeTemple() {
  const temple = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({
    color: "#956647",
    roughness: 1,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: "#59402d",
    roughness: 1,
  });
  const roof = new THREE.MeshStandardMaterial({
    color: "#804933",
    roughness: 1,
  });
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    temple.add(mesh);
    return mesh;
  };
  box(12, 0.16, 12, 0, 0.05, 0, stone);
  box(5, 0.15, 5, 0, 0.17, 0, wood);
  box(4.8, 2.2, 0.18, 0, 1.25, -2.3, stone);
  for (const x of [-2.3, 2.3]) {
    box(0.18, 2.2, 4.6, x, 1.25, 0, stone);
    box(1.3, 2.2, 0.18, x > 0 ? 1.65 : -1.65, 1.25, 2.3, wood);
  }
  // The central doorway remains open for the historically privileged household visitors.
  const tier = box(5.8, 0.2, 5.8, 0, 2.5, 0, roof);
  tier.rotation.y = 0;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 4), roof);
  cap.rotation.y = Math.PI / 4;
  cap.position.y = 3.35;
  temple.add(cap);
  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 8),
    new THREE.MeshStandardMaterial({ color: "#bb9b5c", metalness: 0.5 }),
  );
  finial.position.y = 4.2;
  temple.add(finial);
  box(1, 0.7, 0.6, 0, 0.6, -1.5, wood);
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.2, 0.5, 12),
    new THREE.MeshStandardMaterial({
      color: "#b19b61",
      metalness: 0.45,
      roughness: 0.5,
    }),
  );
  lamp.position.set(0, 0.5, 3.4);
  temple.add(lamp);
  const flowers = makeFlowers();
  flowers.position.set(0, 0.97, -1.5);
  temple.add(flowers);
  for (const x of [-5.3, 5.3]) box(0.2, 1.7, 0.2, x, 0.85, 5.5, wood);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#504030";
  ctx.fillRect(0, 0, 512, 112);
  ctx.fillStyle = "#ebd4a0";
  ctx.font = "bold 46px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ക്ഷേത്രം", 256, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.7),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }),
  );
  sign.position.set(0, 1.8, 5.55);
  temple.add(sign);
  return temple;
}
