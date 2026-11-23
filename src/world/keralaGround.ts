import * as THREE from "three";

/**
 * Photorealistic 512x512 seamless Kerala Tropical Meadow Ground PBR Texture
 * (layered monsoon grass blades, clover/moss patches, subtle red-laterite earth
 * peeking through, dry thatch flecks, and a true Sobel tangent-space Normal Map).
 */

function hash2(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

function periodicNoise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const ix0 = ((x0 % px) + px) % px;
  const iy0 = ((y0 % py) + py) % py;
  const ix1 = (ix0 + 1) % px;
  const iy1 = (iy0 + 1) % py;

  const a = hash2(ix0, iy0, seed);
  const b = hash2(ix1, iy0, seed);
  const c = hash2(ix0, iy1, seed);
  const d = hash2(ix1, iy1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(u: number, v: number, fx: number, fy: number, seed: number): number {
  let sum = 0;
  let amp = 0.52;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += amp * periodicNoise(u * fx, v * fy, fx, fy, seed + o * 37);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

type RGB = [number, number, number];
function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function createKeralaMeadowGroundTextures(repeat = 46) {
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const heightBuf = new Float32Array(size * size);
  const normalData = new Uint8Array(size * size * 4);

  // Authentic monsoon-lush Kerala ground palette (modulated by terrain vertexColors)
  const lushGrass: RGB = [132, 166, 92];
  const deepMoss: RGB = [88, 122, 64];
  const sunlitTip: RGB = [164, 184, 102];
  const dryThatch: RGB = [156, 138, 86];
  const lateriteSoil: RGB = [128, 88, 56];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const p = idx * 4;

      const macro = fbm(u, v, 5, 5, 211);
      const clump = fbm(u, v, 16, 16, 409);
      const bladeA = periodicNoise(u * 64 + clump * 2.5, v * 28, 64, 28, 613);
      const bladeB = periodicNoise(u * 28, v * 64 + clump * 2.5, 28, 64, 733);
      const micro = hash2(x, y, 919);

      let col = mixRGB(deepMoss, lushGrass, smoothstep(0.28, 0.72, macro));
      const tuft = (bladeA + bladeB) * 0.5;
      col = mixRGB(col, sunlitTip, smoothstep(0.56, 0.86, tuft) * 0.55);

      // Dry golden grass flecks
      if (clump > 0.7) {
        col = mixRGB(col, dryThatch, smoothstep(0.7, 0.9, clump) * 0.42);
      }
      // Subtle red-laterite soil peeking through thin patches
      if (macro < 0.3 && clump < 0.42) {
        const bare = smoothstep(0.3, 0.14, macro) * smoothstep(0.42, 0.24, clump);
        col = mixRGB(col, lateriteSoil, bare * 0.55);
      }

      const jitter = (micro - 0.5) * 14;
      colorData[p] = THREE.MathUtils.clamp(Math.round(col[0] + jitter), 0, 255);
      colorData[p + 1] = THREE.MathUtils.clamp(Math.round(col[1] + jitter), 0, 255);
      colorData[p + 2] = THREE.MathUtils.clamp(Math.round(col[2] + jitter), 0, 255);
      colorData[p + 3] = 255;

      heightBuf[idx] = THREE.MathUtils.clamp(
        0.4 + tuft * 0.42 + (clump - 0.5) * 0.22 + (micro - 0.5) * 0.14,
        0,
        1,
      );
    }
  }

  // Sobel tangent-space normal map from turf heightfield
  const sample = (x: number, y: number) =>
    heightBuf[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const strength = 2.8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        (sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1) -
          (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1))) *
        strength;
      const dy =
        (sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1) -
          (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1))) *
        strength;
      const invLen = 1.0 / Math.hypot(dx, dy, 1.0);
      const p = (y * size + x) * 4;
      normalData[p] = Math.round(((-dx * invLen) * 0.5 + 0.5) * 255);
      normalData[p + 1] = Math.round(((-dy * invLen) * 0.5 + 0.5) * 255);
      normalData[p + 2] = Math.round(((1.0 * invLen) * 0.5 + 0.5) * 255);
      normalData[p + 3] = 255;
    }
  }

  const map = new THREE.DataTexture(colorData, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = 8;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;

  const normalMap = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeat, repeat);
  normalMap.anisotropy = 8;
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.needsUpdate = true;

  return { map, normalMap };
}
