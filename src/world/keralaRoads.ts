import * as THREE from "three";
import type { Point2 } from "./hydrology";

/**
 * 18th-Century Rural Kerala Road System (Kaliyugham)
 *
 * Photorealistic procedural road generator featuring:
 * - 6 historically authentic pre-British Kerala road types
 * - Pixel-level seamless multi-octave fBm soil, laterite gravel, rills & mud cracks (zero oval blobs)
 * - True Sobel tangent-space Normal Maps + Per-Pixel Roughness Maps
 * - Curve-aligned UVs with 3D cross-section camber, bullock-cart rut depressions & organic feathered verges
 * - Dense instanced 3D micro-detailing: verge & center-crown grass tufts, multi-scale laterite pebble
 *   clusters, fallen twigs/fronds, shallow wheel-rut puddles, laterite curbs, bamboo lane stakes,
 *   granite mile markers, Chumaduthangi load-rests, and shaded Thanneer Panthal water-pot stands.
 */

export type KeralaRoadType =
  | "peruvazhi"     // Main red-laterite bullock-cart trunk road (Peruvazhi / Mannu Vazhi)
  | "ambala_vazhi"  // Swept golden-ochre temple & manor avenue with laterite curbs (Aana Vazhi)
  | "chantha_vazhi" // Trodden market bazaar street with rough-hewn laterite flagstones
  | "idavazhi"      // Narrow barefoot village hamlet lane with rustic rubble & bamboo stakes
  | "varambu"       // Damp dark alluvial clay paddy-field bund with lush mossy shoulders
  | "kattuvazhi";   // Shaded forest & riverside earth trail with leaf litter & river stepping stones

export type KeralaRoadSpec = {
  type: KeralaRoadType;
  label: string;
  width: number;
  tileLength: number;
  lift: number;
  crown: number;
  rutDepth: number;
  edgeDrop: number;
  polygonOffsetFactor: number;
};

export const KERALA_ROAD_SPECS: Record<KeralaRoadType, KeralaRoadSpec> = {
  peruvazhi: {
    type: "peruvazhi",
    label: "Peruvazhi (Laterite Bullock-Cart Road)",
    width: 4.5,
    tileLength: 4.2,
    lift: 0.062,
    crown: 0.048,
    rutDepth: 0.036,
    edgeDrop: 0.048,
    polygonOffsetFactor: -2,
  },
  ambala_vazhi: {
    type: "ambala_vazhi",
    label: "Ambala Vazhi (Temple & Manor Avenue)",
    width: 4.1,
    tileLength: 3.9,
    lift: 0.068,
    crown: 0.04,
    rutDepth: 0.0,
    edgeDrop: 0.042,
    polygonOffsetFactor: -3,
  },
  chantha_vazhi: {
    type: "chantha_vazhi",
    label: "Chantha Vazhi (Market Bazaar Street)",
    width: 4.2,
    tileLength: 3.8,
    lift: 0.074,
    crown: 0.03,
    rutDepth: 0.016,
    edgeDrop: 0.042,
    polygonOffsetFactor: -4,
  },
  idavazhi: {
    type: "idavazhi",
    label: "Idavazhi (Village Footpath Lane)",
    width: 2.35,
    tileLength: 3.4,
    lift: 0.056,
    crown: 0.022,
    rutDepth: 0.0,
    edgeDrop: 0.04,
    polygonOffsetFactor: -1,
  },
  varambu: {
    type: "varambu",
    label: "Varambu (Paddy-Field Embankment)",
    width: 2.15,
    tileLength: 3.2,
    lift: 0.064,
    crown: 0.042,
    rutDepth: 0.0,
    edgeDrop: 0.046,
    polygonOffsetFactor: -1,
  },
  kattuvazhi: {
    type: "kattuvazhi",
    label: "Kattuvazhi (Forest & Riverbank Trail)",
    width: 2.25,
    tileLength: 3.5,
    lift: 0.054,
    crown: 0.02,
    rutDepth: 0.0,
    edgeDrop: 0.038,
    polygonOffsetFactor: -1,
  },
};

export function getKeralaRoadTypeForRoute(routeIndex: number): KeralaRoadType {
  switch (routeIndex) {
    case 0:
    case 2:
    case 14: // Dedicated Bullock-Cart Trade Bypass (Kalavandi Peruvazhi)
      return "peruvazhi";
    case 1:
    case 10:
      return "ambala_vazhi";
    case 3:
    case 4:
      return "chantha_vazhi";
    case 8:
    case 9:
      return "varambu";
    case 12:
      return "kattuvazhi";
    default:
      return "idavazhi";
  }
}

function makeSeededRand(initialSeed: number) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Fast deterministic integer hash returning [0, 1) for seamless periodic 2D noise. */
function hash2(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return (n >>> 0) / 4294967296;
}

/** Smooth tileable 2D value noise with period (px, py). */
function periodicNoise(
  x: number,
  y: number,
  px: number,
  py: number,
  seed: number,
): number {
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

/** 4-octave tileable fractal Brownian motion returning [0, 1]. */
function fbmPeriodic(
  u: number,
  v: number,
  baseFreqX: number,
  baseFreqY: number,
  seed: number,
): number {
  let sum = 0;
  let amp = 0.52;
  let norm = 0;
  let fx = baseFreqX;
  let fy = baseFreqY;
  for (let oct = 0; oct < 4; oct++) {
    sum += amp * periodicNoise(u * fx, v * fy, fx, fy, seed + oct * 31);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

/** Smoothstep helper. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Converts a scalar height buffer [0..1] into a seamless tangent-space RGB Normal Map. */
function heightToNormalTexture(
  height: Float32Array,
  size: number,
  strength: number,
  wrapS: THREE.Wrapping,
): THREE.DataTexture {
  const normalData = new Uint8Array(size * size * 4);
  const sample = (x: number, y: number) => {
    const sx =
      wrapS === THREE.RepeatWrapping
        ? ((x % size) + size) % size
        : THREE.MathUtils.clamp(x, 0, size - 1);
    const sy = ((y % size) + size) % size;
    return height[sy * size + sx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      normalData[idx] = Math.round(((-dx * invLen) * 0.5 + 0.5) * 255);
      normalData[idx + 1] = Math.round(((-dy * invLen) * 0.5 + 0.5) * 255);
      normalData[idx + 2] = Math.round(((dz * invLen) * 0.5 + 0.5) * 255);
      normalData[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  tex.wrapS = wrapS;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

type RGB = [number, number, number];

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Generates photorealistic pixel-level 512x512 PBR textures (Albedo with organic alpha verge,
 * Sobel Tangent-Space Normal Map, and Per-Pixel Roughness Map) for each 18th-century Kerala road.
 */
function buildPhotorealRoadTextures(type: KeralaRoadType) {
  const size = 512;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heightBuf = new Float32Array(size * size);

  const seedMap: Record<KeralaRoadType, number> = {
    peruvazhi: 1781,
    ambala_vazhi: 1783,
    chantha_vazhi: 1785,
    idavazhi: 1787,
    varambu: 1789,
    kattuvazhi: 1791,
  };
  const seed = seedMap[type];

  // Authentic humid 18th-century Kerala monsoon-weathered dark laterite, slate-grey compacted gravel & umber earth
  const palettes: Record<
    KeralaRoadType,
    {
      dry: RGB;
      mid: RGB;
      damp: RGB;
      dust: RGB;
      verge: RGB;
      pebbleLight: RGB;
      pebbleDark: RGB;
    }
  > = {
    peruvazhi: {
      dry: [96, 72, 56],
      mid: [74, 56, 46],
      damp: [46, 38, 35],
      dust: [102, 90, 78],
      verge: [56, 68, 38],
      pebbleLight: [96, 92, 84],
      pebbleDark: [44, 40, 38],
    },
    ambala_vazhi: {
      dry: [116, 98, 78],
      mid: [92, 78, 64],
      damp: [62, 54, 48],
      dust: [124, 112, 96],
      verge: [60, 72, 40],
      pebbleLight: [108, 102, 94],
      pebbleDark: [56, 50, 46],
    },
    chantha_vazhi: {
      dry: [84, 72, 62],
      mid: [66, 58, 52],
      damp: [44, 40, 38],
      dust: [94, 86, 78],
      verge: [54, 66, 38],
      pebbleLight: [98, 94, 88],
      pebbleDark: [46, 44, 42],
    },
    idavazhi: {
      dry: [92, 70, 54],
      mid: [72, 56, 46],
      damp: [48, 39, 34],
      dust: [98, 86, 74],
      verge: [54, 68, 36],
      pebbleLight: [94, 88, 78],
      pebbleDark: [46, 42, 38],
    },
    varambu: {
      dry: [74, 68, 56],
      mid: [58, 52, 44],
      damp: [40, 38, 34],
      dust: [84, 78, 66],
      verge: [48, 68, 34],
      pebbleLight: [82, 78, 70],
      pebbleDark: [38, 36, 34],
    },
    kattuvazhi: {
      dry: [78, 64, 50],
      mid: [60, 50, 42],
      damp: [40, 36, 32],
      dust: [88, 76, 62],
      verge: [46, 64, 34],
      pebbleLight: [86, 78, 66],
      pebbleDark: [40, 38, 34],
    },
  };
  const pal = palettes[type];

  // Pre-generate irregular laterite flagstone cells for Chantha Vazhi (market street)
  const flagstones: { cx: number; cy: number; rx: number; ry: number; shade: number }[] = [];
  if (type === "chantha_vazhi") {
    const r = makeSeededRand(seed + 99);
    for (let i = 0; i < 36; i++) {
      flagstones.push({
        cx: 0.22 + r() * 0.56,
        cy: r(),
        rx: 0.032 + r() * 0.032,
        ry: 0.028 + r() * 0.034,
        shade: 0.78 + r() * 0.34,
      });
    }
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    // Organic noise-modulated road edges (seamless vertically)
    const edgeNoiseL = fbmPeriodic(0.15, v, 4, 8, seed + 201) * 0.075;
    const edgeNoiseR = fbmPeriodic(0.85, v, 4, 8, seed + 307) * 0.075;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const pIdx = idx * 4;

      // Multi-scale soil noise (macro patches, medium clods, fine grit, rain rills)
      const macro = fbmPeriodic(u, v, 6, 8, seed);
      const midN = fbmPeriodic(u, v, 18, 24, seed + 53);
      const grain = periodicNoise(u * 96, v * 96, 96, 96, seed + 109);
      const micro = hash2(x, y, seed + 151);

      // Subtle rain-washed longitudinal rills
      const rillWarp = (midN - 0.5) * 0.04;
      const rill = periodicNoise((u + rillWarp) * 28, v * 5, 28, 5, seed + 173);

      // Base soil color blending
      let col = mixRGB(pal.mid, pal.dry, smoothstep(0.32, 0.72, macro));
      col = mixRGB(col, pal.dust, smoothstep(0.62, 0.88, midN) * 0.42);
      col = mixRGB(col, pal.damp, smoothstep(0.65, 0.9, rill) * 0.22);

      let h = 0.5 + (macro - 0.5) * 0.24 + (midN - 0.5) * 0.16 + (grain - 0.5) * 0.14;
      let rough = 0.92 + (grain - 0.5) * 0.08;

      // Fine desiccation cracks in dry patches
      const crackField = Math.abs(fbmPeriodic(u, v, 24, 24, seed + 233) - 0.5);
      if (crackField < 0.016 && macro > 0.45) {
        const cDepth = 1 - crackField / 0.016;
        col = mixRGB(col, pal.damp, cDepth * 0.55);
        h -= cDepth * 0.18;
      }

      // Micro-pebble grit embedded in the laterite soil
      const pebbleNoise = periodicNoise(u * 64, v * 64, 64, 64, seed + 271);
      if (pebbleNoise > 0.81) {
        const pStrength = smoothstep(0.81, 0.94, pebbleNoise);
        const pCol = micro > 0.48 ? pal.pebbleLight : pal.pebbleDark;
        col = mixRGB(col, pCol, pStrength * 0.78);
        h += pStrength * 0.26;
        rough = Math.min(0.98, rough + 0.04);
      }

      // Road-type specific realistic surface features
      if (type === "peruvazhi") {
        // Organic wobbly bullock-cart wheel ruts (compacted dark clay + pressed ridges)
        const wobble = (fbmPeriodic(0.3, v, 2, 4, seed + 401) - 0.5) * 0.032;
        const dL = Math.abs(u - (0.31 + wobble));
        const dR = Math.abs(u - (0.69 + wobble));
        const rutDist = Math.min(dL, dR);

        if (rutDist < 0.095) {
          const rutFactor = smoothstep(0.095, 0.012, rutDist);
          col = mixRGB(col, pal.damp, rutFactor * 0.66);
          h -= rutFactor * 0.34;
          rough -= rutFactor * 0.18; // compacted clay sheen inside wheel tracks
        } else if (rutDist < 0.135) {
          // Slightly pushed-up dry dusty mud berm beside the wheel rut
          const berm = smoothstep(0.135, 0.098, rutDist);
          col = mixRGB(col, pal.dust, berm * 0.28);
          h += berm * 0.08;
        }

        // Sparse grassy-earth central crown between the bullock-cart ruts
        const centerDist = Math.abs(u - 0.5);
        if (centerDist < 0.11) {
          const grassPatch =
            smoothstep(0.11, 0.0, centerDist) * smoothstep(0.46, 0.74, midN);
          col = mixRGB(col, pal.verge, grassPatch * 0.52);
          h += grassPatch * 0.07;
        }
      } else if (type === "ambala_vazhi") {
        // Fine ceremonial broom-swept sand striations + crisp laterite edge dust
        const sweep = Math.sin(v * Math.PI * 64 + midN * 4) * 0.5 + 0.5;
        col = mixRGB(col, pal.dust, sweep * 0.1);
        h += (sweep - 0.5) * 0.04;
        const edgeTrack = Math.min(Math.abs(u - 0.14), Math.abs(u - 0.86));
        if (edgeTrack < 0.045) {
          const et = smoothstep(0.045, 0.005, edgeTrack);
          col = mixRGB(col, pal.pebbleDark, et * 0.42);
          h += et * 0.1;
        }
      } else if (type === "chantha_vazhi") {
        // Rough-hewn embedded laterite flagstones with earthy mortar gaps
        for (let s = 0; s < flagstones.length; s++) {
          const st = flagstones[s];
          let dy = Math.abs(v - st.cy);
          if (dy > 0.5) dy = 1 - dy;
          const dx = Math.abs(u - st.cx);
          if (dx > st.rx * 1.25 || dy > st.ry * 1.25) continue;
          const dist = Math.max(dx / st.rx, dy / st.ry) + (midN - 0.5) * 0.22;
          if (dist < 0.92) {
            const inner = smoothstep(0.92, 0.65, dist);
            const stoneCol: RGB = [
              124 * st.shade,
              72 * st.shade,
              48 * st.shade,
            ];
            col = mixRGB(col, stoneCol, inner * 0.82);
            h += inner * 0.24;
            rough = 0.86;
            break;
          } else if (dist < 1.08) {
            col = mixRGB(col, pal.damp, 0.45);
            h -= 0.12;
          }
        }
      } else if (type === "idavazhi") {
        // Barefoot worn sunken center track
        const cDist = Math.abs(u - 0.5 + (midN - 0.5) * 0.04);
        const worn = smoothstep(0.24, 0.02, cDist);
        col = mixRGB(col, pal.damp, worn * 0.36);
        h -= worn * 0.18;
        rough -= worn * 0.08;
      } else if (type === "varambu") {
        // Mossy grass encroaching onto narrow damp paddy bund
        const edgeDist = Math.min(u, 1 - u);
        const moss = smoothstep(0.32, 0.1, edgeDist) * smoothstep(0.32, 0.68, midN);
        col = mixRGB(col, pal.verge, moss * 0.82);
        h += moss * 0.1;
        rough -= (1 - moss) * 0.14; // damp clay sheen on footpath
      } else if (type === "kattuvazhi") {
        // Leaf-litter humus flecks on forest earth
        const leafN = periodicNoise(u * 42, v * 42, 42, 42, seed + 511);
        if (leafN > 0.78 && u > 0.12 && u < 0.88) {
          const lf = smoothstep(0.78, 0.9, leafN);
          col = mixRGB(col, [146, 102, 48], lf * 0.65);
          h += lf * 0.12;
        }
      }

      // Grassy-earth verge transition near outer edges
      const distL = u - edgeNoiseL;
      const distR = 1 - u - edgeNoiseR;
      const distEdge = Math.min(distL, distR);

      const vergeBlend = smoothstep(0.22, 0.06, distEdge) * (0.55 + 0.45 * midN);
      col = mixRGB(col, pal.verge, vergeBlend * 0.72);
      h += vergeBlend * 0.06;

      // Subtle micro-grain luminosity jitter
      const jitter = (micro - 0.5) * 14;
      colorData[pIdx] = THREE.MathUtils.clamp(Math.round(col[0] + jitter), 0, 255);
      colorData[pIdx + 1] = THREE.MathUtils.clamp(Math.round(col[1] + jitter), 0, 255);
      colorData[pIdx + 2] = THREE.MathUtils.clamp(Math.round(col[2] + jitter), 0, 255);

      // Organic noise-feathered alpha edge so the road melts seamlessly into terrain grass
      const alpha = smoothstep(0.015, 0.145, distEdge);
      colorData[pIdx + 3] = Math.round(alpha * 255);

      const rByte = THREE.MathUtils.clamp(Math.round(rough * 255), 80, 255);
      roughData[pIdx] = rByte;
      roughData[pIdx + 1] = rByte;
      roughData[pIdx + 2] = rByte;
      roughData[pIdx + 3] = 255;

      heightBuf[idx] = THREE.MathUtils.clamp(h, 0, 1);
    }
  }

  const map = new THREE.DataTexture(colorData, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;

  const normalMap = heightToNormalTexture(
    heightBuf,
    size,
    type === "chantha_vazhi" ? 4.2 : 3.2,
    THREE.ClampToEdgeWrapping,
  );
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 4;
  roughnessMap.generateMipmaps = true;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.needsUpdate = true;

  return { map, normalMap, roughnessMap };
}

/**
 * Pixel-level fBm red-laterite junction texture with radial organic alpha fade
 * and matching Sobel normal map so crossroads blend seamlessly without seams.
 */
function buildPhotorealJunctionTextures() {
  const size = 256;
  const colorData = new Uint8Array(size * size * 4);
  const heightBuf = new Float32Array(size * size);
  const seed = 1799;

  const dry: RGB = [88, 72, 60];
  const mid: RGB = [68, 56, 48];
  const damp: RGB = [44, 38, 35];

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = y * size + x;
      const pIdx = idx * 4;

      const macro = fbmPeriodic(u, v, 5, 5, seed);
      const grain = periodicNoise(u * 48, v * 48, 48, 48, seed + 41);
      const micro = hash2(x, y, seed + 79);

      let col = mixRGB(mid, dry, smoothstep(0.3, 0.72, macro));
      // Subtle weathered darkish grey gravel & compacted soil mottling
      col = mixRGB(col, [64, 62, 58], smoothstep(0.55, 0.85, macro) * 0.38);
      if (grain > 0.8) {
        col = mixRGB(col, micro > 0.5 ? [98, 86, 74] : damp, 0.55);
      }

      const dx = (u - 0.5) * 2;
      const dy = (v - 0.5) * 2;
      const dist = Math.hypot(dx, dy);
      const edgeWarp = (macro - 0.5) * 0.24;
      const alpha = 1 - smoothstep(0.45, 0.94, dist + edgeWarp);

      const jitter = (micro - 0.5) * 12;
      colorData[pIdx] = THREE.MathUtils.clamp(Math.round(col[0] + jitter), 0, 255);
      colorData[pIdx + 1] = THREE.MathUtils.clamp(Math.round(col[1] + jitter), 0, 255);
      colorData[pIdx + 2] = THREE.MathUtils.clamp(Math.round(col[2] + jitter), 0, 255);
      colorData[pIdx + 3] = Math.round(alpha * 255);

      heightBuf[idx] = THREE.MathUtils.clamp(
        0.5 + (macro - 0.5) * 0.25 + (grain - 0.5) * 0.18,
        0,
        1,
      );
    }
  }

  const map = new THREE.DataTexture(colorData, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.needsUpdate = true;

  const normalMap = heightToNormalTexture(
    heightBuf,
    size,
    2.6,
    THREE.ClampToEdgeWrapping,
  );

  return { map, normalMap };
}

/**
 * Builds a terrain-conforming road ribbon with true curve-aligned UVs
 * (`u = 0..1` across width, `v = arcLength / tileLength` along curve)
 * and subtle 3D cross-section camber + wheel-rut depression.
 */
export function createDetailedRoadGeometry(
  curve: THREE.CatmullRomCurve3,
  spec: KeralaRoadSpec,
  heightAt: (x: number, z: number) => number,
  includeSegment: (x: number, z: number) => boolean,
) {
  const totalLen = Math.max(1, curve.getLength());
  const steps = Math.max(84, Math.ceil(totalLen / 0.38));
  const across = 16;
  const stride = across + 1;

  // Pre-sample centerline points & apply a 3-pass smoothing filter so road dips & hills grade smoothly like real roads
  const centerPts: THREE.Vector3[] = [];
  const sideVecs: THREE.Vector3[] = [];
  const rawCenterY = new Float32Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pt = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    centerPts.push(pt);
    sideVecs.push(new THREE.Vector3(-tan.z, 0, tan.x).normalize());
    rawCenterY[i] = heightAt(pt.x, pt.z);
  }
  let smoothY = Float32Array.from(rawCenterY);
  for (let pass = 0; pass < 3; pass++) {
    const next = Float32Array.from(smoothY);
    for (let i = 1; i < steps; i++) {
      const i0 = Math.max(0, i - 2);
      const i1 = i - 1;
      const i3 = i + 1;
      const i4 = Math.min(steps, i + 2);
      next[i] =
        smoothY[i0] * 0.12 +
        smoothY[i1] * 0.22 +
        smoothY[i] * 0.32 +
        smoothY[i3] * 0.22 +
        smoothY[i4] * 0.12;
    }
    smoothY = next;
  }

  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let arcDist = 0;
  for (let i = 0; i <= steps; i++) {
    const point = centerPts[i];
    const side = sideVecs[i];
    if (i > 0) {
      arcDist += Math.hypot(
        point.x - centerPts[i - 1].x,
        point.z - centerPts[i - 1].z,
      );
    }
    const vCoord = arcDist / spec.tileLength;
    const roadCenterY = smoothY[i];

    for (let col = 0; col <= across; col++) {
      const u = col / across;
      const centered = u - 0.5;
      const lateral = centered * spec.width;
      const x = point.x + side.x * lateral;
      const z = point.z + side.z * lateral;

      const edgeNorm = Math.abs(centered) * 2;
      const rawGroundY = heightAt(x, z);
      // Smooth lateral grading: inner roadbed follows smoothed centerline, outer verges melt seamlessly into terrain
      const lateralBlend = smoothstep(0.32, 0.96, edgeNorm);
      const gradedBaseY = roadCenterY * (1 - lateralBlend) + rawGroundY * lateralBlend;
      // Guard against clipping under steep convex bumps while keeping dips smooth
      const baseSurfaceY = Math.max(gradedBaseY, rawGroundY - 0.015);

      const crownOffset = spec.crown * 0.72 * Math.max(0, 1 - edgeNorm * edgeNorm);
      let rutOffset = 0;
      if (spec.rutDepth > 0) {
        const rutDist = Math.min(Math.abs(u - 0.31), Math.abs(u - 0.69));
        if (rutDist < 0.095) {
          const rNorm = 1 - rutDist / 0.095;
          rutOffset = -spec.rutDepth * 0.75 * rNorm * rNorm;
        }
      }
      // Feather outer transparent skirt smoothly down into the soil so ZERO hard road edge is ever visible
      const liftFade = 1 - smoothstep(0.55, 0.95, edgeNorm);
      const edgeTuck = -0.026 * smoothstep(0.74, 1.0, edgeNorm);

      const y = baseSurfaceY + spec.lift * 0.65 * liftFade + crownOffset + rutOffset + edgeTuck;
      vertices.push(x, y, z);
      uvs.push(u, vCoord);
    }

    if (i < steps && includeSegment(point.x, point.z)) {
      for (let col = 0; col < across; col++) {
        const a = i * stride + col;
        indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Creates a multi-blade crossed grass-tuft geometry for organic roadside & center-ridge tufts. */
function createGrassTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const angle = (i / blades) * Math.PI * 2 + 0.3;
    const lean = 0.09 + (i % 2) * 0.06;
    const h = 0.22 + (i % 3) * 0.08;
    const w = 0.032;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const px = -sin * w;
    const pz = cos * w;

    // Blade triangle tapering to a natural tip
    positions.push(
      -px, 0, -pz,
      px, 0, pz,
      cos * lean, h, sin * lean,
    );
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  return geom;
}

/** Procedural weathered Kerala granite + monsoon moss PBR textures for Chumaduthangi. */
function createWeatheredGraniteTextures(): {
  map: THREE.CanvasTexture;
  normalMap: THREE.DataTexture;
} {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#6c675e";
  ctx.fillRect(0, 0, size, size);

  const heightBuf = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = fbmPeriodic(u, v, 8, 8, 1784);
      const grit = hash2(x, y, 1786);
      const chisel = Math.sin(u * Math.PI * 26 + n * 3.0) * 0.08;
      heightBuf[y * size + x] = THREE.MathUtils.clamp(
        0.5 + (n - 0.5) * 0.55 + (grit - 0.5) * 0.25 + chisel,
        0,
        1,
      );
    }
  }

  for (let i = 0; i < 3200; i++) {
    const px = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * size;
    const py = Math.abs((Math.sin(i * 78.233) * 24634.6345) % 1) * size;
    const r = 0.8 + (i % 3) * 0.7;
    ctx.fillStyle =
      i % 6 === 0
        ? "rgba(42, 39, 34, 0.55)"
        : i % 5 === 0
          ? "rgba(148, 140, 126, 0.42)"
          : "rgba(88, 82, 72, 0.4)";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 24; i++) {
    const sx = ((i * 37) % 244) + 6;
    const w = 3 + (i % 7);
    const grad = ctx.createLinearGradient(sx, 0, sx, size);
    grad.addColorStop(0, "rgba(32, 34, 28, 0.36)");
    grad.addColorStop(0.55, "rgba(38, 42, 32, 0.14)");
    grad.addColorStop(1, "rgba(38, 42, 32, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(sx, 0, w, size);
  }
  for (let i = 0; i < 36; i++) {
    const px = ((i * 61) % 236) + 10;
    const py = ((i * 29) % 100) + 6;
    const rad = 8 + (i % 14);
    const grad = ctx.createRadialGradient(px, py, 1, px, py, rad);
    grad.addColorStop(0, i % 3 === 0 ? "rgba(132, 138, 108, 0.45)" : "rgba(52, 76, 36, 0.52)");
    grad.addColorStop(1, "rgba(52, 76, 36, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.5, 1.5);
  map.needsUpdate = true;

  const normalMap = heightToNormalTexture(heightBuf, size, 3.0, THREE.RepeatWrapping);
  return { map, normalMap };
}

/** Traditional 18th-century Kerala Chumaduthangi / Athani (carved granite head-load resting stone). */
function createChumaduthangi(
  stoneMat: THREE.Material,
  mossStoneMat: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();

  // 1. Stepped weathered base plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.16, 0.78), mossStoneMat);
  plinth.position.y = 0.08;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const step = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.11, 0.58), stoneMat);
  step.position.y = 0.21;
  step.castShadow = true;
  step.receiveShadow = true;
  group.add(step);

  // 2. Two carved Kerala granite pillars (square base -> octagonal shaft -> corbelled podikai capital)
  for (const px of [-0.52, 0.52]) {
    const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), mossStoneMat);
    baseBlock.position.set(px, 0.37, 0);
    baseBlock.castShadow = true;
    baseBlock.receiveShadow = true;
    group.add(baseBlock);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.145, 0.88, 8), stoneMat);
    shaft.position.set(px, 0.9, 0);
    shaft.rotation.y = Math.PI / 8;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);

    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.28), stoneMat);
    neck.position.set(px, 1.36, 0);
    neck.castShadow = true;
    group.add(neck);

    const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.34), mossStoneMat);
    corbel.position.set(px, 1.44, 0);
    corbel.castShadow = true;
    group.add(corbel);
  }

  // 3. Thick overhanging hand-hewn granite resting slab (top surface at Y = 1.67 m)
  const slabUnder = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.08, 0.46), stoneMat);
  slabUnder.position.y = 1.52;
  slabUnder.castShadow = true;
  slabUnder.receiveShadow = true;
  group.add(slabUnder);

  const slabTop = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.12, 0.54), mossStoneMat);
  slabTop.position.y = 1.61;
  slabTop.castShadow = true;
  slabTop.receiveShadow = true;
  group.add(slabTop);

  // Grounded laterite pebbles around the plinth
  for (const [rx, rz, rs] of [
    [-0.95, 0.28, 0.1],
    [0.92, -0.26, 0.09],
    [-0.12, 0.42, 0.07],
  ]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), mossStoneMat);
    rock.scale.set(1.3, 0.55, 1.0);
    rock.position.set(rx, rs * 0.35, rz);
    rock.receiveShadow = true;
    group.add(rock);
  }

  return group;
}

/** Traditional roadside Thanneer Panthal (shaded drinking-water pot rest). */
function createThanneerPanthal(
  woodMat: THREE.Material,
  thatchMat: THREE.Material,
  terracottaMat: THREE.Material,
): THREE.Group {
  const group = new THREE.Group();

  // 4 slender wooden posts supporting a tiny palm-thatch canopy
  for (const [px, pz] of [
    [-0.55, -0.4],
    [0.55, -0.4],
    [-0.55, 0.4],
    [0.55, 0.4],
  ]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.045, 1.68, 6), woodMat);
    post.position.set(px, 0.84, pz);
    post.castShadow = true;
    group.add(post);
  }

  // Sloped thatch shade roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.09, 1.15), thatchMat);
  roof.position.set(0, 1.72, 0);
  roof.rotation.x = 0.16;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Wooden shelf bench for the terracotta water pots
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.07, 0.62), woodMat);
  shelf.position.set(0, 0.56, 0);
  shelf.castShadow = true;
  shelf.receiveShadow = true;
  group.add(shelf);

  // Two earthen kudam water pots + coconut-shell ladle
  for (const [ox, scale] of [
    [-0.24, 1.0],
    [0.24, 0.82],
  ]) {
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.21 * scale, 12, 10), terracottaMat);
    pot.scale.set(1, 1.08, 1);
    pot.position.set(ox, 0.59 + 0.19 * scale, 0);
    pot.castShadow = true;
    group.add(pot);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.095 * scale, 0.022, 6, 12),
      terracottaMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(ox, 0.59 + 0.4 * scale, 0);
    group.add(rim);
  }

  return group;
}

export type ChumaduthangiInfo = {
  x: number;
  z: number;
  rot: number;
  topY: number;
  halfX: number;
  halfZ: number;
};

export type KeralaRoadSystem = {
  group: THREE.Group;
  materials: Record<KeralaRoadType, THREE.MeshStandardMaterial>;
  junctionMaterial: THREE.MeshStandardMaterial;
  approachMaterial: THREE.MeshStandardMaterial;
  puddleMaterial: THREE.MeshStandardMaterial;
  baseRoughness: number;
  chumaduthangis: ChumaduthangiInfo[];
};

export type BuildKeralaRoadSystemOptions = {
  scene: THREE.Scene;
  roadRoutes: readonly (readonly Point2[])[];
  roadCurves: readonly THREE.CatmullRomCurve3[];
  roadMeshHeight: (x: number, z: number) => number;
  terrainHeight: (x: number, z: number) => number;
  distanceToRiver: (x: number, z: number) => number;
  riverHalfWidth: number;
};

/**
 * Builds the complete 18th-century Kerala road network: all 6 photorealistic PBR road types,
 * feathered intersections, dense instanced micro-detailing, and era roadside landmarks.
 */
export function buildKeralaRoadSystem(
  options: BuildKeralaRoadSystemOptions,
): KeralaRoadSystem {
  const {
    scene,
    roadRoutes,
    roadCurves,
    roadMeshHeight,
    terrainHeight,
    distanceToRiver,
    riverHalfWidth,
  } = options;

  const group = new THREE.Group();
  group.name = "kerala_18c_roads";

  // 1. Create photorealistic PBR materials (Albedo + Sobel Normal + Roughness) for all 6 road types
  const materials = {} as Record<KeralaRoadType, THREE.MeshStandardMaterial>;
  (Object.keys(KERALA_ROAD_SPECS) as KeralaRoadType[]).forEach((type) => {
    const spec = KERALA_ROAD_SPECS[type];
    const { map, normalMap, roughnessMap } = buildPhotorealRoadTextures(type);
    materials[type] = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map,
      normalMap,
      normalScale: new THREE.Vector2(
        type === "chantha_vazhi" ? 1.45 : 1.15,
        type === "chantha_vazhi" ? 1.45 : 1.15,
      ),
      roughnessMap,
      roughness: type === "varambu" ? 0.88 : 0.96,
      metalness: 0.0,
      transparent: true,
      depthWrite: true,
      alphaTest: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: spec.polygonOffsetFactor,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
  });

  // Approach lane material (for scattered homestead driveways)
  const approachTex = buildPhotorealRoadTextures("idavazhi");
  const approachMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: approachTex.map,
    normalMap: approachTex.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: approachTex.roughnessMap,
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    depthWrite: true,
    alphaTest: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });

  // 2. Build all road curves
  const includeRoadSegment = (x: number, z: number) =>
    distanceToRiver(x, z) >= riverHalfWidth + 0.12;

  roadCurves.forEach((curve, routeIndex) => {
    const type = getKeralaRoadTypeForRoute(routeIndex);
    const spec = KERALA_ROAD_SPECS[type];
    const geometry = createDetailedRoadGeometry(
      curve,
      spec,
      roadMeshHeight,
      includeRoadSegment,
    );
    const mesh = new THREE.Mesh(geometry, materials[type]);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
  });

  // 3. Seamless radial-feathered junction aprons
  const junctionTex = buildPhotorealJunctionTextures();
  const junctionMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: junctionTex.map,
    normalMap: junctionTex.normalMap,
    normalScale: new THREE.Vector2(1.0, 1.0),
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -5,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
  });

  const sharedPoints = new Map<string, { x: number; z: number; uses: number }>();
  for (const route of roadRoutes) {
    for (const [x, z] of route) {
      const key = `${x},${z}`;
      const existing = sharedPoints.get(key);
      if (existing) existing.uses++;
      else sharedPoints.set(key, { x, z, uses: 1 });
    }
  }

  for (const junction of sharedPoints.values()) {
    if (junction.uses < 2) continue;
    if (distanceToRiver(junction.x, junction.z) < riverHalfWidth + 1.5) continue;
    const radius = junction.uses > 2 ? 3.25 : 2.55;
    const padGeom = new THREE.PlaneGeometry(radius * 2, radius * 2, 14, 14);
    padGeom.rotateX(-Math.PI / 2);
    const pos = padGeom.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const wx = junction.x + pos.getX(i);
      const wz = junction.z + pos.getZ(i);
      pos.setY(i, roadMeshHeight(wx, wz) + 0.086);
    }
    padGeom.computeVertexNormals();
    const pad = new THREE.Mesh(padGeom, junctionMaterial);
    pad.position.set(junction.x, 0, junction.z);
    pad.receiveShadow = true;
    pad.renderOrder = 3;
    group.add(pad);
  }

  // 4. Dense, realistic 3D "small small detailings" (InstancedMeshes for crisp 60 FPS)
  const lateriteMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.95,
    metalness: 0.0,
  });
  const lateriteCurbMat = new THREE.MeshStandardMaterial({
    color: "#77422a",
    roughness: 0.95,
    metalness: 0.0,
  });
  const graniteMat = new THREE.MeshStandardMaterial({
    color: "#6d6a63",
    roughness: 0.88,
    metalness: 0.04,
  });
  const mossGraniteMat = new THREE.MeshStandardMaterial({
    color: "#5e6550",
    roughness: 0.92,
    metalness: 0.02,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: "#5b3e26",
    roughness: 0.94,
  });
  const thatchMat = new THREE.MeshStandardMaterial({
    color: "#8b7748",
    roughness: 0.96,
  });
  const terracottaMat = new THREE.MeshStandardMaterial({
    color: "#aa5333",
    roughness: 0.82,
  });
  const grassTuftMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const twigMat = new THREE.MeshStandardMaterial({
    color: "#6b4e30",
    roughness: 0.96,
  });
  const puddleMaterial = new THREE.MeshStandardMaterial({
    color: "#4a3322",
    roughness: 0.16,
    metalness: 0.12,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  });

  const rand = makeSeededRand(1788);
  const dummy = new THREE.Object3D();

  const curbMatrices: THREE.Matrix4[] = [];
  const pebbleItems: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  const grassItems: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  const twigMatrices: THREE.Matrix4[] = [];
  const stakeMatrices: THREE.Matrix4[] = [];
  const steppingStoneMatrices: THREE.Matrix4[] = [];
  const puddleMatrices: THREE.Matrix4[] = [];
  const mileMarkerMatrices: THREE.Matrix4[] = [];

  const pebblePalette = [
    new THREE.Color("#7d442a"),
    new THREE.Color("#63331e"),
    new THREE.Color("#965b3c"),
    new THREE.Color("#6f6a60"),
    new THREE.Color("#884e32"),
  ];
  const grassPalette = [
    new THREE.Color("#4f6c32"),
    new THREE.Color("#5d7839"),
    new THREE.Color("#6d803e"),
    new THREE.Color("#445d2a"),
    new THREE.Color("#787d40"),
  ];

  roadCurves.forEach((curve, routeIndex) => {
    const type = getKeralaRoadTypeForRoute(routeIndex);
    const spec = KERALA_ROAD_SPECS[type];
    const len = curve.getLength();

    // A) Dense multi-scale crushed laterite gravel & pebble clusters along verges
    const pebbleClusters = Math.floor(len / 1.45);
    for (let i = 1; i < pebbleClusters; i++) {
      const t = (i + (rand() - 0.5) * 0.6) / pebbleClusters;
      if (t <= 0.03 || t >= 0.97) continue;
      const pt = curve.getPointAt(t);
      if (distanceToRiver(pt.x, pt.z) < riverHalfWidth + 1.4) continue;
      const tan = curve.getTangentAt(t);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

      for (const dir of [-1, 1]) {
        if (rand() < 0.35) continue;
        const baseOff = spec.width * (0.37 + rand() * 0.16);
        const cx = pt.x + side.x * dir * baseOff;
        const cz = pt.z + side.z * dir * baseOff;

        // 2-4 tiny pebbles clustered naturally together (3-9cm, half-embedded in soil)
        const clusterCount = 2 + Math.floor(rand() * 3);
        for (let k = 0; k < clusterCount; k++) {
          const px = cx + (rand() - 0.5) * 0.45;
          const pz = cz + (rand() - 0.5) * 0.45;
          const s = 0.035 + rand() * 0.068;
          dummy.position.set(px, roadMeshHeight(px, pz) + 0.045 + s * 0.15, pz);
          dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
          dummy.scale.set(s * (1.1 + rand() * 0.5), s * 0.52, s * (0.9 + rand() * 0.4));
          dummy.updateMatrix();
          pebbleItems.push({
            matrix: dummy.matrix.clone(),
            color: pebblePalette[Math.floor(rand() * pebblePalette.length)],
          });
        }
      }
    }

    // B) Roadside verge grass tufts + sparse center-crown grass tufts on Peruvazhi
    const grassSteps = Math.floor(len / 0.85);
    for (let i = 1; i < grassSteps; i++) {
      const t = (i + (rand() - 0.5) * 0.65) / grassSteps;
      if (t <= 0.02 || t >= 0.98) continue;
      const pt = curve.getPointAt(t);
      if (distanceToRiver(pt.x, pt.z) < riverHalfWidth + 1.3) continue;
      const tan = curve.getTangentAt(t);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

      // Verges on both sides (hides any residual road-to-terrain seam organically)
      for (const dir of [-1, 1]) {
        if (rand() < 0.28) continue;
        const off = spec.width * (0.41 + rand() * 0.14);
        const gx = pt.x + side.x * dir * off;
        const gz = pt.z + side.z * dir * off;
        const gs = 0.72 + rand() * 0.85;
        dummy.position.set(gx, terrainHeight(gx, gz) + 0.02, gz);
        dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        dummy.scale.set(gs, gs * (0.85 + rand() * 0.5), gs);
        dummy.updateMatrix();
        grassItems.push({
          matrix: dummy.matrix.clone(),
          color: grassPalette[Math.floor(rand() * grassPalette.length)],
        });
      }

      // Tiny hardy grass tufts along the Peruvazhi center ridge between wheel ruts
      if (type === "peruvazhi" && rand() < 0.24) {
        const jitter = (rand() - 0.5) * 0.28;
        const gx = pt.x + side.x * jitter;
        const gz = pt.z + side.z * jitter;
        const gs = 0.42 + rand() * 0.36;
        dummy.position.set(gx, roadMeshHeight(gx, gz) + 0.08, gz);
        dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        dummy.scale.set(gs, gs * 0.7, gs);
        dummy.updateMatrix();
        grassItems.push({
          matrix: dummy.matrix.clone(),
          color: grassPalette[Math.floor(rand() * grassPalette.length)],
        });
      }
    }

    // C) Fallen dry twigs & dried coconut-frond strips along shaded edges
    const twigSteps = Math.floor(len / 2.9);
    for (let i = 1; i < twigSteps; i++) {
      const t = (i + (rand() - 0.5) * 0.5) / twigSteps;
      if (t <= 0.05 || t >= 0.95) continue;
      const pt = curve.getPointAt(t);
      if (distanceToRiver(pt.x, pt.z) < riverHalfWidth + 1.5) continue;
      const tan = curve.getTangentAt(t);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const dir = rand() > 0.5 ? 1 : -1;
      const off = spec.width * (0.34 + rand() * 0.18);
      const tx = pt.x + side.x * dir * off;
      const tz = pt.z + side.z * dir * off;
      dummy.position.set(tx, roadMeshHeight(tx, tz) + 0.065, tz);
      dummy.rotation.set(Math.PI / 2, rand() * Math.PI * 2, 0);
      dummy.scale.set(0.016 + rand() * 0.012, 0.32 + rand() * 0.45, 0.016);
      dummy.updateMatrix();
      twigMatrices.push(dummy.matrix.clone());
    }

    // D) Shallow damp mud puddles tucked inside Peruvazhi wheel ruts
    if (type === "peruvazhi") {
      const puddleCount = Math.max(2, Math.floor(len / 14));
      for (let i = 1; i <= puddleCount; i++) {
        const t = (i / (puddleCount + 1)) + (rand() - 0.5) * 0.05;
        if (t <= 0.08 || t >= 0.92) continue;
        const pt = curve.getPointAt(t);
        if (distanceToRiver(pt.x, pt.z) < riverHalfWidth + 2.5) continue;
        const tan = curve.getTangentAt(t);
        const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const rutSide = rand() > 0.5 ? 0.19 : -0.19;
        const px = pt.x + side.x * spec.width * rutSide;
        const pz = pt.z + side.z * spec.width * rutSide;
        const yaw = Math.atan2(tan.x, tan.z);
        dummy.position.set(px, roadMeshHeight(px, pz) + 0.072, pz);
        dummy.rotation.set(-Math.PI / 2, 0, -yaw);
        dummy.scale.set(0.32 + rand() * 0.18, 0.78 + rand() * 0.55, 1);
        dummy.updateMatrix();
        puddleMatrices.push(dummy.matrix.clone());
      }

      // Granite mile / boundary stones (Kal-naattu) spaced along main highway
      const markerCount = Math.floor(len / 24);
      for (let i = 1; i <= markerCount; i++) {
        const t = i / (markerCount + 1);
        const pt = curve.getPointAt(t);
        if (distanceToRiver(pt.x, pt.z) < riverHalfWidth + 3.0) continue;
        const tan = curve.getTangentAt(t);
        const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const dir = i % 2 === 0 ? 1 : -1;
        const mx = pt.x + side.x * dir * (spec.width * 0.56);
        const mz = pt.z + side.z * dir * (spec.width * 0.56);
        dummy.position.set(mx, terrainHeight(mx, mz) + 0.24, mz);
        dummy.rotation.set(
          (rand() - 0.5) * 0.12,
          Math.atan2(tan.x, tan.z) + (rand() - 0.5) * 0.2,
          (rand() - 0.5) * 0.14,
        );
        dummy.scale.set(0.18, 0.58, 0.14);
        dummy.updateMatrix();
        mileMarkerMatrices.push(dummy.matrix.clone());
      }
    }

    // E) Hand-cut laterite curb blocks along Ambala Vazhi (temple & manor roads)
    if (type === "ambala_vazhi") {
      const count = Math.floor(len / 1.9);
      for (let i = 1; i < count; i++) {
        const t = i / count;
        const pt = curve.getPointAt(t);
        if (distanceToRiver(pt.x, pt.z) < riverHalfWidth + 2.2) continue;
        const tan = curve.getTangentAt(t);
        const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const yaw = Math.atan2(tan.x, tan.z);
        for (const dir of [-1, 1]) {
          if (rand() < 0.16) continue;
          const ox = pt.x + side.x * dir * (spec.width * 0.45);
          const oz = pt.z + side.z * dir * (spec.width * 0.45);
          dummy.position.set(ox, terrainHeight(ox, oz) + 0.075, oz);
          dummy.rotation.set(
            (rand() - 0.5) * 0.08,
            yaw + (rand() - 0.5) * 0.12,
            (rand() - 0.5) * 0.08,
          );
          dummy.scale.set(
            0.2 + rand() * 0.07,
            0.16 + rand() * 0.06,
            0.66 + rand() * 0.24,
          );
          dummy.updateMatrix();
          curbMatrices.push(dummy.matrix.clone());
        }
      }
    }

    // F) Rustic weathered bamboo/wooden boundary stakes along Idavazhi hamlet lanes
    if (type === "idavazhi") {
      const stakeSteps = Math.floor(len / 4.2);
      for (let i = 1; i < stakeSteps; i++) {
        if (rand() < 0.45) continue;
        const t = i / stakeSteps;
        const pt = curve.getPointAt(t);
        if (distanceToRiver(pt.x, pt.z) < riverHalfWidth + 2.0) continue;
        const tan = curve.getTangentAt(t);
        const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const dir = rand() > 0.5 ? 1 : -1;
        const sx = pt.x + side.x * dir * (spec.width * 0.56);
        const sz = pt.z + side.z * dir * (spec.width * 0.56);
        dummy.position.set(sx, terrainHeight(sx, sz) + 0.32, sz);
        dummy.rotation.set(
          (rand() - 0.5) * 0.16,
          rand() * Math.PI,
          (rand() - 0.5) * 0.16,
        );
        dummy.scale.set(0.036, 0.72 + rand() * 0.28, 0.036);
        dummy.updateMatrix();
        stakeMatrices.push(dummy.matrix.clone());
      }
    }

    // G) Flat river-stone stepping slabs along Kattuvazhi (forest & bridge trail)
    if (type === "kattuvazhi") {
      const count = Math.floor(len / 1.35);
      for (let i = 1; i < count; i++) {
        const t = i / count;
        const pt = curve.getPointAt(t);
        if (distanceToRiver(pt.x, pt.z) < riverHalfWidth + 1.4) continue;
        if (rand() < 0.22) continue;
        const tan = curve.getTangentAt(t);
        const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const jitter = (rand() - 0.5) * 0.4;
        const ox = pt.x + side.x * jitter;
        const oz = pt.z + side.z * jitter;
        dummy.position.set(ox, roadMeshHeight(ox, oz) + 0.055, oz);
        dummy.rotation.set(0, rand() * Math.PI, 0);
        dummy.scale.set(0.4 + rand() * 0.22, 0.065, 0.32 + rand() * 0.18);
        dummy.updateMatrix();
        steppingStoneMatrices.push(dummy.matrix.clone());
      }
    }
  });

  // Commit all InstancedMeshes
  if (pebbleItems.length > 0) {
    const geom = new THREE.DodecahedronGeometry(1, 0);
    const mesh = new THREE.InstancedMesh(geom, lateriteMat, pebbleItems.length);
    mesh.receiveShadow = true;
    pebbleItems.forEach((item, idx) => {
      mesh.setMatrixAt(idx, item.matrix);
      mesh.setColorAt(idx, item.color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // Procedural roadside grass tufts removed — realistic Sketchfab grass now covers all verges & meadows.
  void grassItems;
  void grassTuftMat;
  void createGrassTuftGeometry;

  if (twigMatrices.length > 0) {
    const geom = new THREE.CylinderGeometry(0.65, 1.0, 1, 5);
    const mesh = new THREE.InstancedMesh(geom, twigMat, twigMatrices.length);
    mesh.receiveShadow = true;
    twigMatrices.forEach((m, idx) => mesh.setMatrixAt(idx, m));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  if (puddleMatrices.length > 0) {
    const geom = new THREE.CircleGeometry(0.5, 14);
    const mesh = new THREE.InstancedMesh(geom, puddleMaterial, puddleMatrices.length);
    mesh.renderOrder = 4;
    puddleMatrices.forEach((m, idx) => mesh.setMatrixAt(idx, m));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  if (curbMatrices.length > 0) {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geom, lateriteCurbMat, curbMatrices.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    curbMatrices.forEach((m, idx) => mesh.setMatrixAt(idx, m));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  if (stakeMatrices.length > 0) {
    const geom = new THREE.CylinderGeometry(0.8, 1.0, 1, 6);
    const mesh = new THREE.InstancedMesh(geom, woodMat, stakeMatrices.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    stakeMatrices.forEach((m, idx) => mesh.setMatrixAt(idx, m));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  if (mileMarkerMatrices.length > 0) {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geom, mossGraniteMat, mileMarkerMatrices.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mileMarkerMatrices.forEach((m, idx) => mesh.setMatrixAt(idx, m));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  if (steppingStoneMatrices.length > 0) {
    const geom = new THREE.CylinderGeometry(0.5, 0.55, 1, 7);
    const mesh = new THREE.InstancedMesh(geom, graniteMat, steppingStoneMatrices.length);
    mesh.receiveShadow = true;
    steppingStoneMatrices.forEach((m, idx) => mesh.setMatrixAt(idx, m));
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // 5. Landmark 18th-century roadside structures: Chumaduthangi (Athani) & Shaded Thanneer Panthal
  const weatheredGranite = createWeatheredGraniteTextures();
  const chumaduthangiStoneMat = new THREE.MeshStandardMaterial({
    color: "#c8c2b6",
    map: weatheredGranite.map,
    normalMap: weatheredGranite.normalMap,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughness: 0.9,
    metalness: 0.03,
  });
  const chumaduthangiMossMat = new THREE.MeshStandardMaterial({
    color: "#aab099",
    map: weatheredGranite.map,
    normalMap: weatheredGranite.normalMap,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughness: 0.94,
    metalness: 0.02,
  });

  const chumaduthangiSpots: { x: number; z: number; rot: number }[] = [
    { x: 10.6, z: -13.2, rot: 0.65 },
    { x: 35.8, z: -27.2, rot: 0.25 },
  ];
  const chumaduthangis: ChumaduthangiInfo[] = [];
  for (const spot of chumaduthangiSpots) {
    const gy = terrainHeight(spot.x, spot.z);
    const rest = createChumaduthangi(chumaduthangiStoneMat, chumaduthangiMossMat);
    rest.position.set(spot.x, gy - 0.04, spot.z);
    rest.rotation.y = spot.rot;
    group.add(rest);
    rest.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(rest);
    chumaduthangis.push({
      x: spot.x,
      z: spot.z,
      rot: spot.rot,
      topY: bounds.max.y,
      halfX: 0.96,
      halfZ: 0.44,
    });
  }

  const panthalSpots: { x: number; z: number; rot: number }[] = [
    { x: 15.6, z: -22.6, rot: -0.45 },
    { x: 25.4, z: -21.8, rot: 0.5 },
  ];
  for (const spot of panthalSpots) {
    const panthal = createThanneerPanthal(woodMat, thatchMat, terracottaMat);
    panthal.position.set(spot.x, terrainHeight(spot.x, spot.z) - 0.03, spot.z);
    panthal.rotation.y = spot.rot;
    group.add(panthal);
  }

  scene.add(group);

  return {
    group,
    materials,
    junctionMaterial,
    approachMaterial,
    puddleMaterial,
    baseRoughness: 0.96,
    chumaduthangis,
  };
}

/**
 * Updates all 18th-century road surfaces and wheel-rut puddles for monsoon rain wetness.
 */
export function updateKeralaRoadWeather(
  roadSystem: KeralaRoadSystem,
  rainWetness: number,
) {
  const shade = 1 - rainWetness * 0.28;
  const targetRoughness = Math.max(
    0.4,
    roadSystem.baseRoughness - rainWetness * 0.46,
  );
  for (const mat of Object.values(roadSystem.materials)) {
    mat.color.setRGB(shade, shade, shade);
    mat.roughness = targetRoughness;
  }
  roadSystem.junctionMaterial.color.setRGB(shade, shade, shade);
  roadSystem.junctionMaterial.roughness = targetRoughness;
  roadSystem.approachMaterial.color.setRGB(shade, shade, shade);
  roadSystem.approachMaterial.roughness = targetRoughness;
  roadSystem.puddleMaterial.opacity = 0.42 + rainWetness * 0.42;
}
