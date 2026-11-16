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
export const kalariSite: [number, number] = [14, -5];
export const teaShopSite: [number, number] = [7, -40];
export const toddyShopSite: [number, number] = [18, -40];
export const templeSite: [number, number] = [45, 17];
export function insideMarketDistrict(x: number, z: number, padding = 0) {
  return (
    x > -5 - padding &&
    x < 22 + padding &&
    z > -46 - padding &&
    z < -22 + padding
  );
}
export function insideTempleGround(x: number, z: number, padding = 0) {
  return (
    Math.abs(x - templeSite[0]) < 11 + padding &&
    z > templeSite[1] - 7 - padding &&
    z < templeSite[1] + 16 + padding
  );
}
export const requestedBuildingSites: [number, number][] = [
  [28, -35],
  [35, -37],
  [38, -29],
  [29, -23],
  [20, -31],
  [24, -42],
  [34, -45],
  [45, -36],
  [48, -28],
  [16, -25],
];
export const landlordEstateSite: [number, number] = [74, -63];
export const marketSites: [number, number, number][] = [
  [6, -30, -0.25],
  [11, -32, 0.22],
  [15, -29, -0.5],
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
  [
    [23, -26],
    [22, -18],
    [25, -10],
    [32, -5],
    [42, -2],
  ],
  [
    [31, -30],
    [39, -25],
    [48, -22],
    [57, -24],
  ],
  [
    [13, -19],
    [8, -24],
    [2, -28],
    [-5, -31],
    [-13, -29],
    [-20, -25],
  ],
  [
    [23, -26],
    [27, -31],
    [29, -39],
    [27, -46],
  ],
  [
    [31, -30],
    [35, -34],
    [39, -39],
    [46, -40],
  ],
  [
    [35, -34],
    [42, -32],
    [48, -34],
    [53, -39],
  ],
  [
    [-3, 10],
    [-12, 7],
    [-21, 2],
    [-27, -5],
  ],
  [
    [-27, -5],
    [-25, 3],
    [-27, 15],
    [-35, 20],
    [-42, 28],
  ],
  [
    [53, -39],
    [57, -43],
    [61, -48],
    [65, -53],
    [68, -52],
  ],
  bridgeRoadPoints,
  [
    [6, -9],
    [8, -7.2],
    [9, -5.7],
  ],
];

export function baseTerrainHeight(x: number, z: number) {
  const broad =
    Math.sin(x * 0.033 + 0.7) * 2.7 + Math.cos(z * 0.038 - 0.5) * 2.3;
  const ridge = Math.sin((x + z) * 0.018) * 2 + Math.cos((x - z) * 0.026) * 1.4;
  const detail = Math.sin(x * 0.12) * Math.cos(z * 0.1) * 0.5;
  return broad + ridge + detail - 0.6;
}
