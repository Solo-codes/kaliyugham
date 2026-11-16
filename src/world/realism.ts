import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type SurfaceKind = "soil" | "bark" | "plaster" | "cloth" | "thatch";
const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Continuous periodic multi-scale detail rather than flat colour and repeating stripes. */
export function makeSurfaceMaps(kind: SurfaceKind, repeat = 1) {
  const size = 256,
    colour = new Uint8Array(size * size * 4),
    height = new Uint8Array(size * size * 4),
    roughness = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2,
        v = (y / size) * Math.PI * 2;
      const coarse =
        Math.sin(u * 3 + Math.sin(v * 2)) * 0.35 +
        Math.cos(v * 5 - u * 2) * 0.2 +
        Math.sin(u * 11 + v * 7) * 0.1;
      const grain =
        kind === "thatch"
          ? Math.sin(u * 58 + Math.sin(v * 8) * 0.3) * 0.42 +
            Math.cos(v * 7) * 0.1
          : kind === "bark"
            ? Math.sin(u * 26 + Math.sin(v * 3) * 1.7) * 0.25
            : kind === "cloth"
              ? ((x % 4 < 2 ? 1 : -1) + (y % 4 < 2 ? 1 : -1)) * 0.08
              : coarse;
      const noise = hash(x, y) - 0.5;
      const value = THREE.MathUtils.clamp(
        0.68 + grain * 0.22 + noise * 0.18,
        0,
        1,
      );
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        colour[offset + channel] = Math.round((0.77 + value * 0.22) * 255);
        height[offset + channel] = Math.round(value * 255);
        roughness[offset + channel] = Math.round(
          THREE.MathUtils.clamp(0.68 + noise * 0.18 + coarse * 0.15, 0, 1) *
            255,
        );
      }
      colour[offset + 3] = height[offset + 3] = roughness[offset + 3] = 255;
    }
  const texture = (data: Uint8Array) => {
    const map = new THREE.DataTexture(data, size, size);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat, repeat);
    map.generateMipmaps = true;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.needsUpdate = true;
    return map;
  };
  return {
    map: texture(colour),
    bumpMap: texture(height),
    roughnessMap: texture(roughness),
  };
}

export function makeLeafAtlas() {
  const size = 64,
    data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / (size - 1) - 0.5) * 2,
        v = y / (size - 1);
      const width = Math.pow(Math.sin(v * Math.PI), 0.8) * 0.8;
      const inside = Math.abs(u) < width;
      const vein =
        Math.abs(u) < 0.025 ||
        Math.abs(Math.sin(v * 40 + Math.abs(u) * 15)) < 0.1;
      const offset = (y * size + x) * 4,
        noise = hash(x, y) * 14;
      data[offset] = Math.round((vein ? 76 : 43) + noise);
      data[offset + 1] = Math.round((vein ? 115 : 87) + noise);
      data[offset + 2] = Math.round((vein ? 43 : 29) + noise);
      data[offset + 3] = inside ? 255 : 0;
    }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Branches and individual leaf clusters replace the spherical low-poly tree crowns. */
export function makeDetailedTree(
  seed: number,
  height: number,
  width: number,
  leafMap: THREE.Texture,
  bark: THREE.Material,
) {
  const tree = new THREE.Group();
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const leafGeometry = new THREE.PlaneGeometry(0.42, 0.65, 1, 2);
  const leafMaterial = new THREE.MeshStandardMaterial({
    map: leafMap,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.95,
    emissive: "#19220b",
    emissiveIntensity: 0.08,
  });
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, 240);
  const dummy = new THREE.Object3D();
  let index = 0;
  const branches: THREE.BufferGeometry[] = [];
  for (let branch = 0; branch < 8; branch++) {
    const angle = (branch * Math.PI * 2) / 8 + random() * 0.3;
    const origin = new THREE.Vector3(
      0,
      height * 0.44 + random() * height * 0.16,
      0,
    );
    const end = new THREE.Vector3(
      Math.cos(angle) * width * (0.6 + random() * 0.25),
      height * (0.68 + random() * 0.25),
      Math.sin(angle) * width * (0.6 + random() * 0.25),
    );
    const curve = new THREE.CatmullRomCurve3([
      origin,
      origin
        .clone()
        .lerp(end, 0.5)
        .add(new THREE.Vector3(0, 0.15, 0)),
      end,
    ]);
    branches.push(
      new THREE.TubeGeometry(curve, 8, 0.055 * Math.min(1, width), 5, false),
    );
    for (let leaf = 0; leaf < 30; leaf++) {
      const radius = Math.cbrt(random()) * width * 0.58,
        azimuth = random() * Math.PI * 2,
        elevation = (random() - 0.5) * Math.PI;
      dummy.position.set(
        end.x + Math.cos(azimuth) * Math.cos(elevation) * radius,
        end.y + Math.sin(elevation) * radius * 0.7,
        end.z + Math.sin(azimuth) * Math.cos(elevation) * radius,
      );
      dummy.rotation.set(
        random() * Math.PI,
        random() * Math.PI * 2,
        random() * Math.PI,
      );
      dummy.scale.setScalar((0.65 + random() * 0.6) * Math.min(1, width));
      dummy.updateMatrix();
      leaves.setMatrixAt(index++, dummy.matrix);
      leaves.setColorAt(
        index - 1,
        new THREE.Color().setHSL(
          0.24 + random() * 0.035,
          0.35,
          0.58 + random() * 0.2,
        ),
      );
    }
  }
  const merged = mergeGeometries(branches);
  branches.forEach((geometry) => geometry.dispose());
  if (merged) {
    const wood = new THREE.Mesh(merged, bark);
    wood.castShadow = true;
    tree.add(wood);
  }
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  leaves.instanceMatrix.needsUpdate = true;
  leaves.computeBoundingSphere();
  tree.add(leaves);
  return tree;
}

/** Analytic sky radiance baked once into an environment map for physical materials. */
export function makeOutdoorEnvironment(renderer: THREE.WebGLRenderer) {
  const environment = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader:
      "varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:
      "varying vec3 ray;void main(){vec3 d=normalize(ray);vec3 sky=mix(vec3(0.63,0.69,0.72),vec3(0.22,0.38,0.53),max(0.0,d.y));if(d.y<0.0)sky=mix(vec3(0.18,0.20,0.12),sky,0.25);float sun=pow(max(0.0,dot(d,normalize(vec3(-0.4,0.8,-0.3)))),180.0);gl_FragColor=vec4(sky+vec3(3.0,2.7,2.0)*sun,1.0);}",
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(20, 24, 16), material);
  environment.add(sphere);
  const generator = new THREE.PMREMGenerator(renderer);
  const result = generator.fromScene(environment, 0.025, 0.1, 100);
  generator.dispose();
  sphere.geometry.dispose();
  material.dispose();
  return result;
}

export function makeRidgeGeometry(seed: number) {
  const geometry = new THREE.PlaneGeometry(2, 2, 40, 40);
  geometry.rotateX(-Math.PI / 2);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i),
      z = vertices.getZ(i);
    const edge = Math.max(0, 1 - Math.max(Math.abs(x), Math.abs(z)));
    const ridge =
      0.65 +
      Math.sin(x * 6 + seed) * 0.15 +
      Math.cos(z * 5 - seed) * 0.1 +
      Math.sin(x * 14 + z * 8 + seed) * 0.04;
    vertices.setY(i, Math.pow(edge, 0.6) * ridge);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function ridgePlacement(angle: number, size: number, distance = 160) {
  return {
    x: Math.sin(angle) * distance,
    z: Math.cos(angle) * distance,
    y: -7,
    scaleX: size * 1.8,
    scaleY: size * 1.1,
    scaleZ: size * 1.5,
  };
}

export function makePleatedWrap(source: THREE.CylinderGeometry) {
  const p = source.parameters;
  const geometry = new THREE.CylinderGeometry(
    p.radiusTop,
    p.radiusBottom,
    p.height,
    32,
    8,
    p.openEnded,
    p.thetaStart,
    p.thetaLength,
  );
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i),
      angle = Math.atan2(z, x);
    const fold =
      1 + Math.sin(angle * 16) * 0.025 + Math.sin(angle * 5 + y * 4) * 0.018;
    positions.setXYZ(i, x * fold, y, z * fold);
  }
  geometry.computeVertexNormals();
  return geometry;
}
