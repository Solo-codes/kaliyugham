import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/**
 * KALIYUGHAM — High-Detail 1024x1024 Seamless Kerala Architectural PBR Texture Generator
 * Generates Albedo (sRGB), Tangent-Space Normal (Sobel), and Roughness PNGs for:
 *   1. kerala_laterite_stone  (Exposed coursed red laterite Vettukallu bricks + mortar + ironstone pores)
 *   2. kerala_teak_planks     (Malabar teakwood tongue-and-groove plank walls + wood grain + pegs)
 *   3. kerala_teak_wood       (Seasoned dark Malabar teak for pillars, beams, doors, Charupadi)
 *   4. kerala_odu_tiles       (Interlocking Kerala/Mangalore terracotta Odu clay roof tiles + moss)
 *   5. kerala_lime_plaster    (Weathered Chunnambu shell-lime plaster with subtle dampness & brick peek)
 *   6. kerala_granite_plinth  (Chiseled dark Kerala Karinkallu granite ashlar blocks)
 *   7. kerala_red_oxide       (Hand-troweled Kerala red-oxide verandah floor)
 *   8. kerala_palm_thatch     (Layered dried coconut-palm Ola thatch courses)
 *   9. kerala_mud_wall        (Hand-packed cob/Cheli earth wall with straw flecks)
 *  10. kerala_brass           (Antique Kerala Pichala brass)
 */

const OUT_DIR = "/Users/vishnuk/Documents/project/game/scripts/baked_textures/kerala_pbr";
const SIZE = 1024;

fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- Minimal fast RGB PNG encoder using built-in zlib ----
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tBuf, data])), 0);
  return Buffer.concat([len, tBuf, data, crcBuf]);
}
function writePngRGB(filepath, width, height, rgbData) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type 0
    rgbData.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 6 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
  fs.writeFileSync(filepath, png);
}

// ---- Seamless Periodic Noise Helpers ----
function hash2(ix, iy, seed = 0) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function tileNoise(u, v, periodX, periodY, seed = 0) {
  const x = u * periodX;
  const y = v * periodY;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % periodX) + periodX) % periodX;
  const x1 = (x0 + 1) % periodX;
  const y0 = ((iy % periodY) + periodY) % periodY;
  const y1 = (y0 + 1) % periodY;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbmTile(u, v, px, py, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let cx = px;
  let cy = py;
  for (let o = 0; o < octaves; o++) {
    sum += tileNoise(u, v, cx, cy, seed + o * 31) * amp;
    norm += amp;
    cx *= 2;
    cy *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp255 = (x) => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x));
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function savePBRSet(name, normalStrength, pixelFn) {
  const albedo = Buffer.alloc(SIZE * SIZE * 3);
  const rough = Buffer.alloc(SIZE * SIZE * 3);
  const normal = Buffer.alloc(SIZE * SIZE * 3);
  const height = new Float32Array(SIZE * SIZE);

  for (let y = 0; y < SIZE; y++) {
    const v = y / SIZE;
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const idx = y * SIZE + x;
      const p = idx * 3;
      const res = pixelFn(u, v, x, y);
      albedo[p] = clamp255(res.r);
      albedo[p + 1] = clamp255(res.g);
      albedo[p + 2] = clamp255(res.b);
      const rv = clamp255(res.rough * 255);
      rough[p] = rv;
      rough[p + 1] = rv;
      rough[p + 2] = rv;
      height[idx] = res.h;
    }
  }

  // Sobel tangent-space normal map (OpenGL +Y up convention for glTF)
  const sampleH = (sx, sy) => height[(((sy % SIZE) + SIZE) % SIZE) * SIZE + (((sx % SIZE) + SIZE) % SIZE)];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const tl = sampleH(x - 1, y - 1);
      const tc = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const ml = sampleH(x - 1, y);
      const mr = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const bc = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);
      const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
      const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
      const nx = -gx * normalStrength;
      const ny = gy * normalStrength;
      const nz = 1.0;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const p = (y * SIZE + x) * 3;
      normal[p] = clamp255((nx * inv * 0.5 + 0.5) * 255);
      normal[p + 1] = clamp255((ny * inv * 0.5 + 0.5) * 255);
      normal[p + 2] = clamp255((nz * inv * 0.5 + 0.5) * 255);
    }
  }

  writePngRGB(path.join(OUT_DIR, `${name}_albedo.png`), SIZE, SIZE, albedo);
  writePngRGB(path.join(OUT_DIR, `${name}_normal.png`), SIZE, SIZE, normal);
  writePngRGB(path.join(OUT_DIR, `${name}_roughness.png`), SIZE, SIZE, rough);
  console.log(`Generated 1K PBR set: ${name}`);
}

// ============================================================================
// 1. KERALA EXPOSED RED LATERITE BRICKS (Vettukallu)
// ============================================================================
savePBRSet("kerala_laterite_stone", 4.8, (u, v) => {
  const rows = 8;
  const cols = 4;
  const warpX = (fbmTile(u, v, 16, 16, 2, 11) - 0.5) * 0.012;
  const warpY = (fbmTile(u, v, 16, 16, 2, 23) - 0.5) * 0.012;
  const ry = ((v + warpY) * rows + rows) % rows;
  const rowIdx = Math.floor(ry);
  const fy = ry - rowIdx;
  const offset = (rowIdx % 2) * 0.5;
  const rx = ((u + warpX) * cols + offset + cols) % cols;
  const colIdx = Math.floor(rx);
  const fx = rx - colIdx;

  // Deep crisp lime-mortar seams
  const mortarY = 0.095;
  const mortarX = 0.048;
  const edgeY = smoothstep(0.0, mortarY, fy) * smoothstep(0.0, mortarY, 1.0 - fy);
  const edgeX = smoothstep(0.0, mortarX, fx) * smoothstep(0.0, mortarX, 1.0 - fx);
  const brickMask = edgeX * edgeY;

  const bSeed = hash2(colIdx, rowIdx, 71);
  const bTone = hash2(colIdx, rowIdx, 97);
  const macro = fbmTile(u, v, 8, 8, 4, 5);
  const grit = fbmTile(u, v, 32, 32, 3, 19);
  // Signature porous laterite ironstone pits
  const poreRaw = fbmTile(u, v, 48, 48, 2, 43);
  const pore = smoothstep(0.62, 0.78, poreRaw);

  // Monsoon-weathered, muted earthy Kerala red-laterite (dull ironstone umber/terracotta, never bright red)
  const mossWeather = smoothstep(0.58, 0.84, macro);
  let br = 90 + (bSeed - 0.5) * 26 + (macro - 0.5) * 18 - pore * 32 + (grit - 0.5) * 15;
  let bg = 54 + (bTone - 0.5) * 16 + (macro - 0.5) * 12 - pore * 21 + (grit - 0.5) * 10;
  let bb = 42 + (bTone - 0.5) * 12 + (macro - 0.5) * 9 - pore * 15 + (grit - 0.5) * 8;

  // Subtle monsoon dampness & olive-soot aging
  br = br * (1 - mossWeather * 0.36) + 48 * (mossWeather * 0.36);
  bg = bg * (1 - mossWeather * 0.36) + 50 * (mossWeather * 0.36);
  bb = bb * (1 - mossWeather * 0.36) + 38 * (mossWeather * 0.36);

  // Slight dark bevel shadow right near brick edges
  const edgeBevel = smoothstep(0.0, 0.16, Math.min(fy, 1 - fy)) * smoothstep(0.0, 0.08, Math.min(fx, 1 - fx));
  br *= 0.80 + 0.20 * edgeBevel;
  bg *= 0.80 + 0.20 * edgeBevel;
  bb *= 0.80 + 0.20 * edgeBevel;

  // Dusty weathered grey-khaki lime mortar in joints
  const mr = 102 + (grit - 0.5) * 18;
  const mg = 94 + (grit - 0.5) * 16;
  const mb = 82 + (grit - 0.5) * 14;

  const r = mr + (br - mr) * brickMask;
  const g = mg + (bg - mg) * brickMask;
  const b = mb + (bb - mb) * brickMask;

  const h = brickMask * (0.68 + 0.18 * edgeBevel + 0.14 * grit - 0.34 * pore) + (1 - brickMask) * (0.14 + 0.08 * grit);
  const rough = 0.84 + 0.12 * (1 - brickMask) + 0.08 * pore;
  return { r, g, b, h, rough: clamp01(rough) };
});

// ============================================================================
// 2. MALABAR TEAKWOOD PLANK WALLS (Thekku Tongue-and-Groove Planks + Pegs)
// ============================================================================
savePBRSet("kerala_teak_planks", 4.2, (u, v) => {
  const numPlanks = 8;
  const px = u * numPlanks;
  const pIdx = Math.floor(px);
  const fx = px - pIdx;

  // Crisp dark vertical V-groove seam between planks
  const groove = smoothstep(0.0, 0.055, fx) * smoothstep(0.0, 0.055, 1.0 - fx);
  const plankSeed = hash2(pIdx, 3, 131);

  // Horizontal teak rail batten & iron/brass peg studs near top/bottom
  const py = (v * 2.0) % 1.0;
  const studDist = Math.hypot((fx - 0.5) * 1.4, (py - 0.12) * 8.0);
  const isStud = smoothstep(0.24, 0.12, studDist);

  // Rich vertical Malabar teak wood grain & rings
  const grainWarp = fbmTile(u + plankSeed * 0.37, v, 8, 4, 3, 61) * 3.5;
  const rings = Math.sin((fx * 18.0 + grainWarp) * Math.PI) * 0.5 + 0.5;
  const fibers = fbmTile(u + plankSeed * 0.19, v, 64, 8, 3, 83);

  let r = 82 + (plankSeed - 0.5) * 30 + (rings - 0.5) * 28 + (fibers - 0.5) * 18;
  let g = 45 + (plankSeed - 0.5) * 18 + (rings - 0.5) * 16 + (fibers - 0.5) * 10;
  let b = 23 + (plankSeed - 0.5) * 10 + (rings - 0.5) * 9 + (fibers - 0.5) * 6;

  // Deep shadow inside vertical plank seams
  r *= 0.22 + 0.78 * groove;
  g *= 0.22 + 0.78 * groove;
  b *= 0.22 + 0.78 * groove;

  // Dark forged-iron/bronze dowel stud
  if (isStud > 0.01) {
    r = r * (1 - isStud) + 34 * isStud;
    g = g * (1 - isStud) + 28 * isStud;
    b = b * (1 - isStud) + 22 * isStud;
  }

  const h = groove * (0.65 + 0.16 * rings + 0.14 * fibers) + isStud * 0.22;
  const rough = 0.52 + 0.22 * (1 - rings) + 0.20 * (1 - groove) - isStud * 0.18;
  return { r, g, b, h, rough: clamp01(rough) };
});

// ============================================================================
// 3. SEASONED MALABAR TEAK TIMBER (Pillars, Beams, Doors, Charupadi)
// ============================================================================
savePBRSet("kerala_teak_wood", 3.2, (u, v) => {
  const warp = fbmTile(u, v, 6, 4, 3, 101) * 4.2;
  const rings = Math.sin((u * 26.0 + warp) * Math.PI) * 0.5 + 0.5;
  const fibers = fbmTile(u, v, 64, 8, 3, 107);
  const r = 74 + (rings - 0.5) * 30 + (fibers - 0.5) * 18;
  const g = 39 + (rings - 0.5) * 17 + (fibers - 0.5) * 11;
  const b = 19 + (rings - 0.5) * 9 + (fibers - 0.5) * 6;
  const h = 0.5 + 0.24 * rings + 0.22 * fibers;
  const rough = 0.46 + 0.24 * (1 - rings) + 0.10 * (1 - fibers);
  return { r, g, b, h, rough: clamp01(rough) };
});

// ============================================================================
// 4. INTERLOCKING KERALA TERRACOTTA ODU (ഓട്) CLAY ROOF TILES
// ============================================================================
savePBRSet("kerala_odu_tiles", 5.6, (u, v) => {
  const rows = 6;   // Horizontal overlapping tile courses
  const cols = 10;  // Individual clay tiles across
  const ry = v * rows;
  const rowIdx = Math.floor(ry);
  const fy = ry - rowIdx; // 0 = top of tile, 1 = bottom overlapping lip
  const rx = u * cols;
  const colIdx = Math.floor(rx);
  const fx = rx - colIdx;

  // Classic Mangalore/Kerala Odu profile: side lock rib + central double rainwater channel
  const sideRib = smoothstep(0.0, 0.14, fx) * smoothstep(0.0, 0.14, 1.0 - fx);
  const centerFlute = Math.cos((fx - 0.5) * Math.PI * 4.0) * 0.5 + 0.5;
  const tileProfile = (1 - sideRib) * 0.95 + sideRib * (0.35 + 0.48 * centerFlute);

  // Strong horizontal overlap step shadow at the bottom lip of each row
  const lipShadow = smoothstep(0.0, 0.14, fy);
  const lipHighlight = smoothstep(0.84, 0.98, fy);

  // Per-tile kiln-fired clay color variation + monsoon moss/soot weathering
  const tVar = hash2(colIdx, rowIdx, 211);
  const tDark = hash2(colIdx, rowIdx, 223);
  const weather = fbmTile(u, v, 6, 6, 4, 229);
  const moss = smoothstep(0.62, 0.80, weather) * (0.35 + 0.65 * (1 - centerFlute));
  const fineClay = fbmTile(u, v, 48, 48, 2, 233);

  // Aged, monsoon-dulled earthy clay Odu tiles matching the game's natural atmosphere
  let r = 114 + (tVar - 0.5) * 30 - (tDark > 0.72 ? 20 : 0) + (fineClay - 0.5) * 14;
  let g = 58 + (tVar - 0.5) * 17 - (tDark > 0.72 ? 12 : 0) + (fineClay - 0.5) * 9;
  let b = 40 + (tVar - 0.5) * 12 - (tDark > 0.72 ? 8 : 0) + (fineClay - 0.5) * 6;

  // Blend monsoon dark-olive moss & soot in crevices
  r = r * (1 - moss * 0.72) + 44 * (moss * 0.72);
  g = g * (1 - moss * 0.72) + 49 * (moss * 0.72);
  b = b * (1 - moss * 0.72) + 28 * (moss * 0.72);

  // Crisp self-shadowing under each overlapping tile lip & inside tile channels
  const shade = (0.36 + 0.64 * lipShadow) * (0.74 + 0.26 * tileProfile) + lipHighlight * 0.08;
  r *= shade;
  g *= shade;
  b *= shade;

  const h = (0.35 + 0.35 * fy) * 0.55 + tileProfile * 0.45 + (fineClay - 0.5) * 0.06;
  const rough = 0.72 + 0.18 * moss + 0.10 * (1 - fineClay);
  return { r, g, b, h, rough: clamp01(rough) };
});

// ============================================================================
// 5. WEATHERED SHELL-LIME PLASTER (Chunnambu) WITH SUBTLE MONSOON PATINA
// ============================================================================
savePBRSet("kerala_lime_plaster", 2.4, (u, v) => {
  const macro = fbmTile(u, v, 4, 4, 4, 307);
  const trowel = fbmTile(u, v, 16, 12, 3, 311);
  const fine = fbmTile(u, v, 48, 48, 2, 313);
  const damp = smoothstep(0.55, 0.82, macro);

  // Subtle weathered ochre/damp patches so walls never look flat white
  let r = 206 - damp * 42 + (trowel - 0.5) * 18 + (fine - 0.5) * 12;
  let g = 193 - damp * 44 + (trowel - 0.5) * 16 + (fine - 0.5) * 11;
  let b = 166 - damp * 40 + (trowel - 0.5) * 14 + (fine - 0.5) * 9;

  const h = 0.5 + (trowel - 0.5) * 0.36 + (fine - 0.5) * 0.18;
  const rough = 0.80 + 0.14 * damp + (fine - 0.5) * 0.08;
  return { r, g, b, h, rough: clamp01(rough) };
});

// ============================================================================
// 6. CHISELED KERALA GRANITE ASHLAR PLINTH (Karinkallu)
// ============================================================================
savePBRSet("kerala_granite_plinth", 4.5, (u, v) => {
  const rows = 5;
  const cols = 3;
  const ry = v * rows;
  const rowIdx = Math.floor(ry);
  const fy = ry - rowIdx;
  const rx = (u * cols + (rowIdx % 2) * 0.5) % cols;
  const colIdx = Math.floor(rx);
  const fx = rx - colIdx;

  const stoneMask = smoothstep(0.0, 0.075, fy) * smoothstep(0.0, 0.075, 1 - fy) *
                    smoothstep(0.0, 0.045, fx) * smoothstep(0.0, 0.045, 1 - fx);
  const sVar = hash2(colIdx, rowIdx, 401);
  const speck = fbmTile(u, v, 64, 64, 3, 409);
  const chisel = fbmTile(u, v, 24, 12, 2, 419);

  const base = 76 + (sVar - 0.5) * 28 + (speck - 0.5) * 32 + (chisel - 0.5) * 16;
  const r = base * (0.35 + 0.65 * stoneMask) + 42 * (1 - stoneMask);
  const g = (base - 2) * (0.35 + 0.65 * stoneMask) + 40 * (1 - stoneMask);
  const b = (base - 6) * (0.35 + 0.65 * stoneMask) + 36 * (1 - stoneMask);
  const h = stoneMask * (0.65 + 0.22 * chisel + 0.13 * speck) + (1 - stoneMask) * 0.12;
  const rough = 0.76 + 0.18 * (1 - speck);
  return { r, g, b, h, rough: clamp01(rough) };
});

// ============================================================================
// 7. HAND-TROWELED KERALA RED-OXIDE FLOOR
// ============================================================================
savePBRSet("kerala_red_oxide", 1.4, (u, v) => {
  const n1 = fbmTile(u, v, 6, 6, 4, 503);
  const n2 = fbmTile(u, v, 24, 24, 2, 509);
  const r = 112 + (n1 - 0.5) * 26 + (n2 - 0.5) * 10;
  const g = 32 + (n1 - 0.5) * 12 + (n2 - 0.5) * 6;
  const b = 24 + (n1 - 0.5) * 8 + (n2 - 0.5) * 5;
  const h = 0.5 + (n1 - 0.5) * 0.18 + (n2 - 0.5) * 0.08;
  const rough = 0.34 + 0.18 * n1;
  return { r, g, b, h, rough: clamp01(rough) };
});

// ============================================================================
// 8. LAYERED COCONUT-PALM THATCH (Ola)
// ============================================================================
savePBRSet("kerala_palm_thatch", 5.2, (u, v) => {
  const courses = 5;
  const cy = (v * courses) % 1.0;
  const strands = fbmTile(u, v, 96, 10, 3, 601);
  const bundles = fbmTile(u, v, 24, 6, 3, 607);
  const courseShadow = smoothstep(0.0, 0.20, cy);
  const r = (118 + (strands - 0.5) * 44 + (bundles - 0.5) * 28) * (0.45 + 0.55 * courseShadow);
  const g = (92 + (strands - 0.5) * 34 + (bundles - 0.5) * 22) * (0.45 + 0.55 * courseShadow);
  const b = (48 + (strands - 0.5) * 20 + (bundles - 0.5) * 14) * (0.45 + 0.55 * courseShadow);
  const h = 0.25 + 0.45 * strands + 0.30 * cy;
  return { r, g, b, h, rough: 0.94 };
});

// ============================================================================
// 9. HAND-PACKED COB / MUD WALL (Cheli)
// ============================================================================
savePBRSet("kerala_mud_wall", 3.6, (u, v) => {
  const macro = fbmTile(u, v, 6, 6, 4, 701);
  const grit = fbmTile(u, v, 32, 32, 3, 709);
  const straw = smoothstep(0.78, 0.86, fbmTile(u, v, 48, 24, 2, 719));
  let r = 128 + (macro - 0.5) * 34 + (grit - 0.5) * 18;
  let g = 86 + (macro - 0.5) * 24 + (grit - 0.5) * 14;
  let b = 52 + (macro - 0.5) * 16 + (grit - 0.5) * 10;
  r = r * (1 - straw * 0.5) + 178 * (straw * 0.5);
  g = g * (1 - straw * 0.5) + 150 * (straw * 0.5);
  b = b * (1 - straw * 0.5) + 92 * (straw * 0.5);
  const h = 0.45 + (macro - 0.5) * 0.35 + (grit - 0.5) * 0.22 + straw * 0.08;
  return { r, g, b, h, rough: 0.93 };
});

// ============================================================================
// 10. ANTIQUE KERALA BRASS (Pichala)
// ============================================================================
savePBRSet("kerala_brass", 1.2, (u, v) => {
  const n = fbmTile(u, v, 16, 16, 3, 809);
  const r = 196 + (n - 0.5) * 32;
  const g = 148 + (n - 0.5) * 26;
  const b = 52 + (n - 0.5) * 16;
  return { r, g, b, h: 0.5 + (n - 0.5) * 0.1, rough: clamp01(0.24 + n * 0.18) };
});

console.log("All 10 1K PBR Kerala texture sets ready in:", OUT_DIR);
