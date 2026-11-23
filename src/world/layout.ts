export const pondX = -42;
export const pondZ = -49;

export const riverRoutePoints: [number, number][] = [
  [-88, 24],
  [-72, 18],
  [-58, 12],
  [-45, 5],
  [-39, 2],
  [-34, -5],
  [-29, -15],
  [-24, -30],
  [-12, -45],
  [2, -62],
  [20, -75],
  [35, -86],
];

export const paddyPlots: [number, number][] = [
  [-58, 42],
  [-46, 42],
  [-34, 42],
];
// A shared level terrace supports all three flooded plots and blends into the hillside.
export const paddyTerrace = {
  center: [-46, 42] as const,
  halfWidth: 19.5,
  halfDepth: 6.5,
  feather: 3,
};
export const kalariSite: [number, number] = [30, 16];
export const teaShopSite: [number, number] = [7.2, -41.5];
export const toddyShopSite: [number, number] = [21.5, -42.5];
export const templeSite: [number, number] = [45, 17];
export function insideMarketDistrict(x: number, z: number, padding = 0) {
  return (
    x > -8 - padding &&
    x < 24 + padding &&
    z > -46 - padding &&
    z < -20 + padding
  );
}
export function insideTempleGround(x: number, z: number, padding = 0) {
  return (
    Math.abs(x - templeSite[0]) < 11 + padding &&
    z > templeSite[1] - 7 - padding &&
    z < templeSite[1] + 16 + padding
  );
}
/**
 * Authentic 18th-Century Rural Kerala Desam (Village) Spatial Zoning:
 *  - Zone 1 (Elevated East/NE Parambu — Temple, Kalari & Mana Corridor): Spacious Nair Tharavadus
 *  - Zone 2 (Central Village & Angadi Bazaar Fringe): Artisan Veedus (weavers, potters, carpenters)
 *  - Zone 3 (Western Riverside & Paddy-Field Fringe): Working-class Farmer Chalas & Laborer Kudils
 * Every house lot is spaced >= 11-14m apart so each Veettu Parisaram has a full Muttam, Veli & garden.
 */
export const requestedBuildingSites: [number, number][] = [
  // Zone 1: Nair Tharavadu Quarter (elevated ground along Temple, Kalari & Mana avenues)
  [31, -13],
  [44, -14],
  [37, -27],
  [49, -27],
  [58, -36],
  // Zone 2: Artisan Veedu Quarter (around the Angadi bazaar & eastern village lanes)
  [18, -17],
  [27, -37],
  [38, -44],
  [25, -48],
  [52, -46],
  // Zone 3: Working-Class Farmer Chala & Laborer Kudil Hamlet (western riverside & paddy approach)
  [-9, -20],
  [-17, -15],
  [-4, 13],
  [-16, 12],
  [3, 12],
];
export const landlordEstateSite: [number, number] = [74, -63];
/**
 * Authentic 18th-Century Kerala Angadi (Linear Bazaar Street along Chantha Vazhi):
 * Fresh fish closest to the river Kadavu, produce & spices lining the main street,
 * tea shop at the bazaar corner, and toddy shop set back at the shaded bazaar edge.
 */
export const marketSites: [number, number, number][] = [
  [10.5, -24.0, -0.35],  // Banana & Fruit Stall (North side of Angadi)
  [4.8, -32.2, 0.25],    // Tender Coconut Stall (South side of Angadi)
  [-4.5, -26.2, -0.42],  // Fresh Fish Stall (Riverside Kadavu entry of Angadi)
  [1.5, -23.4, 0.15],    // Vegetable & Root-Crop Shop (North side of Angadi)
  [13.8, -33.2, -0.25],  // Old Provision, Spice & Palm-Leaf Store (Bazaar heart)
  [19.8, -32.2, 0.30],   // Terracotta Pottery & Handloom Shop (East bazaar end)
];
export const harvestPalmSites: [number, number, number, number][] = [
  [15, 11, 0.94, 0.3],
  [26, 8, 1.02, -0.5],
];

// Branches from the paddy lane and reaches the forest bank on the other side.
export const bridgeRoadPoints: [number, number][] = [
  [-35, 20],
  [-43, 17],
  [-48, 13],
  [-50, 7],
  [-50, 0],
  [-48, -5],
  [-42, -10],
];

export const roadRoutes: [number, number][][] = [
  // 1. Main arterial laterite bullock-cart road (Mannu Vazhi)
  [
    [-8, 18],
    [-3, 10],
    [3, 1],
    [6, -9],
    [13, -19],
    [23, -26],
    [31, -30],
    [42, -31],
  ],
  // 2. Temple approach road (Aana Vazhi)
  [
    [23, -26],
    [22, -18],
    [25, -10],
    [32, -5],
    [42, -2],
    [45, 8],
  ],
  // 3. Eastern village lane
  [
    [31, -30],
    [39, -25],
    [48, -22],
    [57, -24],
    [62, -32],
  ],
  // 4. Market street & riverside Kadavu road
  [
    [13, -19],
    [8, -24],
    [2, -28],
    [-5, -31],
    [-13, -29],
    [-20, -25],
  ],
  // 5. Lower market bazaar loop (connects tea shop, toddy shop & all 6 market stores)
  [
    [2, -28],
    [6, -35],
    [13, -38],
    [20, -37],
    [27, -31],
  ],
  // 6. North-central house lane
  [
    [23, -26],
    [27, -31],
    [29, -39],
    [27, -46],
  ],
  // 7. Northeast hamlet lane
  [
    [31, -30],
    [35, -34],
    [39, -39],
    [46, -40],
  ],
  // 8. East-northeast connector
  [
    [35, -34],
    [42, -32],
    [48, -34],
    [53, -39],
  ],
  // 9. River crossing & paddy lane
  [
    [-3, 10],
    [-12, 7],
    [-21, 2],
    [-27, -5],
  ],
  // 10. Paddy field embankment road (Varambu)
  [
    [-27, -5],
    [-25, 3],
    [-27, 15],
    [-35, 20],
    [-42, 28],
  ],
  // 11. Landlord estate grand avenue
  [
    [53, -39],
    [57, -43],
    [61, -48],
    [65, -53],
    [68, -52],
  ],
  // 12. Western riverside hamlet footpath (Idavazhi)
  [
    [-13, -29],
    [-12, -21],
    [-6, -15],
    [6, -9],
  ],
  // 13. Bridge forest trail
  bridgeRoadPoints,
  // 14. Kalari entrance footpath (branching from the Temple Avenue right into the Kalari beside the Temple)
  [
    [45, 8],
    [39, 11],
    [35, 14],
  ],
  // 15. Dedicated Bullock-Cart Trade Bypass (Kalavandi Peruvazhi — Farm -> Outer Village -> Market)
  [
    [-34, 24],
    [-22, 16],
    [-10, 4],
    [0, -10],
    [10, -21],
    [18, -32],
    [28, -42],
    [40, -44],
    [52, -38],
  ],
];

/** Dedicated separate trade path exclusively for ox-driven bullock carts (Kalavandi). */
export const oxCartRoutePoints: [number, number][] = roadRoutes[14];

/**
 * Realistic 18th-Century Midland Kerala Topography:
 * - Broad sloped hillsides descending toward the central river valley
 * - Small organic laterite hillocks & mounds ("bulge areas")
 * - Natural low-lying depressions, drainage swales & wetland basins ("low areas")
 * - Domain-warped micro-undulation so meadows never look flat or geometric
 */
const KERALA_MOUNDS: readonly [number, number, number, number][] = [
  // [cx, cz, radius, heightBoost] — organic small hillocks & laterite bulges
  [44, -12, 16, 2.8],
  [60, 8, 18, 3.2],
  [24, 34, 15, 2.4],
  [-12, 42, 16, 2.2],
  [-68, -28, 19, 3.4],
  [-72, 22, 17, 2.9],
  [54, -54, 15, 2.1],
  [12, -62, 16, 2.3],
  [-20, -56, 14, 1.9],
  [36, 46, 18, 3.0],
];

const KERALA_LOWLANDS: readonly [number, number, number, number][] = [
  // [cx, cz, radius, depthDrop] — natural low-lying drainage basins & damp hollows
  [-18, -14, 14, -1.35],
  [4, 24, 13, -1.15],
  [34, 2, 12, -1.05],
  [-56, -8, 15, -1.45],
  [48, -18, 12, -0.95],
  [-32, -38, 14, -1.25],
];

export function baseTerrainHeight(x: number, z: number) {
  // Subtle domain warp breaks up repetitive sine-grid regularity
  const wx = x + Math.sin(z * 0.045) * 6.5;
  const wz = z + Math.cos(x * 0.042) * 6.5;

  // 1. Broad rolling Kerala hillside slope
  const broad =
    Math.sin(wx * 0.03 + 0.65) * 2.45 + Math.cos(wz * 0.034 - 0.45) * 2.1;
  const ridge =
    Math.sin((wx + wz) * 0.017) * 1.85 + Math.cos((wx - wz) * 0.025) * 1.25;

  // 2. Organic small mounds / laterite bulges
  let mounds = 0;
  for (let i = 0; i < KERALA_MOUNDS.length; i++) {
    const [mx, mz, mr, mh] = KERALA_MOUNDS[i];
    const d2 = (x - mx) * (x - mx) + (z - mz) * (z - mz);
    if (d2 < mr * mr * 2.6) {
      mounds += mh * Math.exp(-d2 / (2 * mr * mr * 0.45));
    }
  }

  // 3. Low-lying hollows & damp monsoon drainage basins
  let lowlands = 0;
  for (let i = 0; i < KERALA_LOWLANDS.length; i++) {
    const [lx, lz, lr, ld] = KERALA_LOWLANDS[i];
    const d2 = (x - lx) * (x - lx) + (z - lz) * (z - lz);
    if (d2 < lr * lr * 2.6) {
      lowlands += ld * Math.exp(-d2 / (2 * lr * lr * 0.48));
    }
  }

  // 4. Natural multi-frequency earth micro-undulation (gentle ruts & knolls)
  const micro =
    Math.sin(wx * 0.11 + 0.4) * Math.cos(wz * 0.095 - 0.3) * 0.48 +
    Math.sin((wx * 0.19 - wz * 0.17) + 1.2) * 0.22;

  return broad + ridge + mounds + lowlands + micro - 0.7;
}
