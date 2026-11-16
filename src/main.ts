import "./style.css";
import * as THREE from "three";
import {
  bridgeHeightAt,
  createBridgeSpan,
  createWaterModel,
  findCrossing,
  RIVER_HALF_WIDTH,
} from "./world/hydrology";
import { sampleCastNet } from "./world/castNet";
import { advanceCoconutHarvest } from "./world/coconut";
import { advancePaddyWork } from "./world/paddyWork";
import {
  sampleDayNight,
  simulationDay,
  WeatherCycle,
} from "./world/environment";
import {
  baseTerrainHeight,
  harvestPalmSites,
  kalariSite,
  landlordEstateSite,
  marketSites,
  paddyPlots,
  paddyTerrace,
  pondX,
  pondZ,
  requestedBuildingSites,
  riverRoutePoints,
  roadRoutes,
  teaShopSite,
  toddyShopSite,
  templeSite,
  insideMarketDistrict,
  insideTempleGround,
} from "./world/layout";
import {
  createRoadNetwork,
  createRoadRibbonGeometry,
  createRoadSurfaceHeight,
} from "./world/roads";
import { createTerrainGrid, flattenTerrainArea } from "./world/terrain";
import {
  advanceWalker,
  createNavigationGraph,
  setWalkerMotion,
} from "./world/navigation";
import {
  cottageDoorstep,
  placeHouseLots,
  planBackyards,
} from "./world/settlement";
import type { Walker } from "./world/navigation";
import {
  advanceDuty,
  createDuty,
  createInspection,
  horseAction,
  isWorkday,
  routeTo,
  sampleKalariDrill,
} from "./world/routines";
import type { Duty, InspectionStop } from "./world/routines";
import { createForestHabitat } from "./world/habitat";
import {
  advanceFishTrading,
  createFishTrading,
  finishFood,
  FOOD,
  purchaseFood,
} from "./world/market";
import type { FishTrading, FoodKind, Shop, Wallet } from "./world/market";
import {
  detailTexture,
  makeBanana,
  makeDrinkingCoconut,
  makeHandLight,
  makeMarketFish,
} from "./world/visuals";
import {
  advanceHousehold,
  advanceNightPatrol,
  createNightPatrol,
  predatorTrails,
} from "./world/evening";
import type { HouseholdCurfew, NightPatrol } from "./world/evening";
import {
  insideGarden,
  planHomesteads,
  planVegetablePlots,
} from "./world/homesteads";
import {
  advanceEquipment,
  buyEquipment,
  createEquipmentBelt,
  cycleEquipment,
  inEquipmentReach,
  KALARI_GOODS,
  useEquipment,
} from "./world/equipment";
import type { EquipmentKind } from "./world/equipment";
import {
  makeEquipment,
  makeRabbit,
  makeSnack,
  makeTeaGlass,
  makeTeaShop,
} from "./world/newProps";
import {
  clearStandingPoint,
  insideSolid,
  moveBody,
  obstacleDetour,
  segmentClear,
} from "./world/collision";
import type { Solid, Body } from "./world/collision";
import { makeFlowers, makeTemple, templePrayerHours } from "./world/temple";
import {
  makeDetailedTree,
  makeLeafAtlas,
  makeOutdoorEnvironment,
  makePleatedWrap,
  makeRidgeGeometry,
  makeSurfaceMaps,
  ridgePlacement,
} from "./world/realism";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import {
  advanceToddy,
  drinkToddy,
  serveWageQueue,
  updateWageVisit,
  wageVisit,
} from "./world/eveningCommerce";
import type { ToddyState } from "./world/eveningCommerce";
import {
  advanceFarmDelivery,
  cartThreat,
  createFarmDelivery,
  findGatheringSpot,
  keepYielding,
  rainCoverFor,
  roadsideCandidates,
} from "./world/traffic";
import type { CartApproach, FarmDelivery } from "./world/traffic";
import {
  makeBananaPlant,
  makeHandheldLeaf,
  makeRainUmbrella,
} from "./world/ruralProps";
import {
  FestivalPercussion,
  makeFestivalOrnaments,
  sampleFestival,
  shopFacing,
} from "./world/festival";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="game-shell">
    <div id="world" aria-label="Kaliyugham 3D game world"></div>
    <div class="world-vignette" aria-hidden="true"></div>

    <header class="topbar" aria-label="Game status">
      <a class="wordmark" href="#" aria-label="കളിയുഗം — Kaliyugham home"><span class="brand-mark">✳</span> <span lang="ml">കളിയുഗം</span></a>
      <div class="hud-center"><span class="live-dot"></span><span id="region-name">KERALA COUNTRYSIDE</span><span class="hud-divider">/</span><span id="time-of-day">08:00 · Morning</span><span class="hud-divider">/</span><span id="weather-status">Clear</span></div>
      <div class="top-actions"><button id="festival-sound" class="icon-button" aria-label="Enable festival percussion" title="Festival sound on/off">♪</button><label class="graphics-label">GRAPHICS<select id="graphics-quality" aria-label="Graphics quality"><option value="high">Realistic</option><option value="balanced">Balanced</option></select></label><button id="pause-button" class="icon-button" aria-label="Pause game" title="Pause (Escape)">Ⅱ</button></div>
    </header>

    <section class="game-hud" aria-label="Field map">
      <div class="map-card glass-card">
        <div class="map-heading"><span>FIELD MAP</span><span class="map-north">N</span></div>
        <canvas id="minimap" width="180" height="180" aria-label="Nearby terrain map; the red diamond marks the kalari"></canvas>
        <div class="map-footer"><span class="map-dot"></span> <span id="fragment-count">STARLIGHT 0 / 8</span></div>
      </div>
    </section>

    <div id="interaction-prompt" class="interaction-prompt" aria-live="polite"><kbd>E</kbd> Gather starlight</div>
    <div class="market-status glass-card" aria-label="Wallet and food"><span id="wallet-status">₹20</span><span id="food-status">Visit the market · E to buy and enjoy</span></div>
    <div id="equipment-status" class="equipment-status">F · Equipment: none · R to use</div>
    <section id="shop-menu" class="shop-menu glass-card" aria-label="Shop menu" hidden>
      <h2 id="shop-title"></h2><div id="shop-options"></div><button id="close-shop">Close · E</button>
    </section>

    <section id="welcome-screen" class="welcome-screen">
      <div class="welcome-card">
        <div class="eyebrow"><span></span> AN OLD WORLD TO WANDER</div>
        <h1>Find your way<br>back to <em>wonder.</em></h1>
        <p class="welcome-copy">Follow the village lanes to the kalari, rice paddies and river. Watch coconut harvesters climb, meet people on their daily rounds, and explore as the weather and time change.</p>
        <button id="play-button" class="play-button"><span>Step into the wild</span><b>↗</b></button>
        <div class="welcome-meta"><span><i>⌁</i> NO RUSH, JUST ROAM</span><span>01 — 08 FRAGMENTS</span></div>
      </div>
      <div class="welcome-note"><span class="note-line"></span><span>THE PALM-LINED VILLAGE ROAD<br><small>KERALA COUNTRYSIDE · 1970s</small></span></div>
    </section>

    <footer class="bottom-bar">
      <div class="control-guide"><span class="control-item"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>MOVE</span></span><span class="control-separator"></span><span class="control-item"><kbd>SPACE</kbd><span>JUMP</span></span><span class="control-separator"></span><span class="control-item"><kbd>Q</kbd><span>HORSE</span></span><span class="control-item"><span class="mouse-icon">↔</span><span>DRAG TO LOOK</span></span></div>
      <div class="coordinates"><span class="coordinates-label">YOUR POSITION</span><span id="coordinates">000 · 000</span></div>
    </footer>

    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </main>
`;

const world = document.querySelector<HTMLDivElement>("#world")!;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
world.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const translatedBoards: { object: THREE.Object3D; english: string }[] = [];
const boardAnchor = (
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
) => {
  const anchor = new THREE.Object3D();
  anchor.position.set(x, y, z);
  parent.add(anchor);
  return anchor;
};
const outdoorEnvironment = makeOutdoorEnvironment(renderer);
scene.environment = outdoorEnvironment.texture;
scene.environmentIntensity = 0.35;
const skyColor = new THREE.Color("#a9c8c0");
const atmosphere = new THREE.FogExp2("#b1c8b8", 0.0065);
scene.background = skyColor;
scene.fog = atmosphere;
const camera = new THREE.PerspectiveCamera(
  54,
  window.innerWidth / window.innerHeight,
  0.1,
  260,
);
const clock = new THREE.Timer();

const hemisphere = new THREE.HemisphereLight("#d9f3e8", "#53634d", 2.2);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight("#fff0cf", 3.2);
sun.position.set(-38, 64, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -32;
sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32;
sun.shadow.camera.bottom = -32;
sun.shadow.normalBias = 0.025;
sun.shadow.bias = -0.00015;
sun.shadow.radius = 2;
scene.add(sun, sun.target);
const moonlight = new THREE.DirectionalLight("#a8bce4", 0.35);
scene.add(moonlight, moonlight.target);

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const random = seeded(52026);
const atmosphereRandom = seeded(1973);
const weatherCycle = new WeatherCycle();
const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(3.2, 14, 10),
  new THREE.MeshBasicMaterial({ color: "#f6d79d", fog: false }),
);
const moonDisc = new THREE.Mesh(
  new THREE.SphereGeometry(2.2, 14, 10),
  new THREE.MeshBasicMaterial({ color: "#dbe4e6", fog: false }),
);
scene.add(sunDisc, moonDisc);
const starsGeometry = new THREE.BufferGeometry();
const starPositions: number[] = [];
for (let i = 0; i < 160; i++) {
  const azimuth = atmosphereRandom() * Math.PI * 2;
  const elevation = 0.18 + atmosphereRandom() * 1.15;
  starPositions.push(
    Math.cos(azimuth) * Math.cos(elevation) * 145,
    Math.sin(elevation) * 145,
    Math.sin(azimuth) * Math.cos(elevation) * 145,
  );
}
starsGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(starPositions, 3),
);
const starsMaterial = new THREE.PointsMaterial({
  color: "#e5e9d8",
  size: 0.75,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  fog: false,
});
const stars = new THREE.Points(starsGeometry, starsMaterial);
scene.add(stars);

const clouds = new THREE.Group();
const cloudGeometry = new THREE.IcosahedronGeometry(1, 1);
const cloudMaterial = new THREE.MeshBasicMaterial({
  color: "#f3eee1",
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
  fog: false,
});
for (let i = 0; i < 12; i++) {
  const cloud = new THREE.Group();
  const angle = atmosphereRandom() * Math.PI * 2;
  const distance = 55 + atmosphereRandom() * 85;
  cloud.position.set(
    Math.cos(angle) * distance,
    55 + atmosphereRandom() * 30,
    Math.sin(angle) * distance,
  );
  cloud.rotation.y = atmosphereRandom() * Math.PI;
  for (let puff = -1; puff <= 1; puff++) {
    const shape = new THREE.Mesh(cloudGeometry, cloudMaterial);
    shape.position.set(puff * 3.2, Math.abs(puff) * -0.5, 0);
    shape.scale.set(
      4.2 + atmosphereRandom() * 1.2,
      1.25 + atmosphereRandom() * 0.7,
      2.4,
    );
    cloud.add(shape);
  }
  clouds.add(cloud);
}
scene.add(clouds);

const rainCount = 300;
const rainGeometry = new THREE.BufferGeometry();
const rainPositions = new Float32Array(rainCount * 6);
for (let i = 0; i < rainCount; i++) {
  rainPositions[i * 6] = (atmosphereRandom() - 0.5) * 34;
  rainPositions[i * 6 + 1] = atmosphereRandom() * 19;
  rainPositions[i * 6 + 2] = (atmosphereRandom() - 0.5) * 34;
}
rainGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(rainPositions, 3),
);
const rainMaterial = new THREE.LineBasicMaterial({
  color: "#d8e6e3",
  transparent: true,
  opacity: 0,
  depthWrite: false,
});
const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
rain.frustumCulled = false;
rain.visible = false;
scene.add(rain);
const animalSites = [
  [58, 12],
  [64, 18],
  [52, 20],
  [-46, -22],
  [-54, 40],
  [-24, 55],
  [-66, 0],
  [70, -5],
  [-70, -37],
  [21, -28],
  [-42, -49],
  [-78, -18],
  [-78, 51],
  [7, 81],
];
const isNearHarvestPalm = (x: number, z: number, radius: number) =>
  harvestPalmSites.some(
    ([palmX, palmZ]) => Math.hypot(x - palmX, z - palmZ) < radius,
  );
const isInsidePaddyReserve = (x: number, z: number, padding = 0) =>
  paddyPlots.some(
    ([fieldX, fieldZ]) =>
      Math.abs(x - fieldX) < 6.1 + padding &&
      Math.abs(z - fieldZ) < 5 + padding,
  );
const isInsideKalariReserve = (x: number, z: number, padding = 0) =>
  Math.abs(x - kalariSite[0]) < 5.5 + padding &&
  Math.abs(z - kalariSite[1]) < 4.3 + padding;
const isInsideTeaShop = (x: number, z: number, padding = 0) =>
  [teaShopSite, toddyShopSite].some(
    ([sx, sz]) =>
      Math.abs(x - sx) < 3.4 + padding && Math.abs(z - sz) < 3.2 + padding,
  );
const isInsideHeritageYard = (x: number, z: number) =>
  [
    [-43, 69],
    [65, -49],
  ].some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3);
const roadNetwork = createRoadNetwork(roadRoutes);
const { curves: roadCurves, closestRoad, distanceToRoad } = roadNetwork;
const villagePaths = createNavigationGraph(roadRoutes, roadCurves);
const paddyTerrain = flattenTerrainArea(
  baseTerrainHeight,
  paddyTerrace.center,
  paddyTerrace.halfWidth,
  paddyTerrace.halfDepth,
  paddyTerrace.feather,
);
const waterModel = createWaterModel(
  riverRoutePoints,
  paddyTerrain,
  [pondX, pondZ],
  paddyPlots,
);
const { distanceToRiver, getWaterInfo, river: riverRoute } = waterModel;
const toddyTerrain = flattenTerrainArea(
  waterModel.terrainHeight,
  toddyShopSite,
  3.4,
  3.2,
  1.5,
);
const teaTerrain = flattenTerrainArea(toddyTerrain, teaShopSite, 3.4, 3.2, 1.5);
const templeTerrain = flattenTerrainArea(teaTerrain, templeSite, 7, 7, 2);
const villageTerrain = flattenTerrainArea(
  templeTerrain,
  kalariSite,
  5.5,
  4.3,
  2,
);
const groundGrid = createTerrainGrid(190, 128, villageTerrain);
const terrainHeight = groundGrid.heightAt;
const roadSurfaceHeight = terrainHeight;
const roadMeshHeight = createRoadSurfaceHeight(terrainHeight, distanceToRiver);
const buildingSites = placeHouseLots(requestedBuildingSites, {
  distanceToRoad,
  isAllowed: (x, z) =>
    distanceToRiver(x, z) >= 8 &&
    !isInsideTeaShop(x, z, 4) &&
    !insideMarketDistrict(x, z, 4) &&
    !insideTempleGround(x, z, 4) &&
    !isInsidePaddyReserve(x, z, 3.8) &&
    !isInsideKalariReserve(x, z, 3.8) &&
    !isNearHarvestPalm(x, z, 6) &&
    marketSites.every(
      ([marketX, marketZ]) => Math.hypot(x - marketX, z - marketZ) >= 6,
    ) &&
    Math.hypot(x - landlordEstateSite[0], z - landlordEstateSite[1]) >= 18,
});
const backyardPlans = planBackyards(
  buildingSites,
  closestRoad,
  (x, z, houseIndex) =>
    distanceToRoad(x, z) >= 2.8 &&
    distanceToRiver(x, z) >= 4.5 &&
    !isInsideTeaShop(x, z, 1) &&
    !insideMarketDistrict(x, z, 1) &&
    !insideTempleGround(x, z, 1) &&
    !isInsidePaddyReserve(x, z, 0.8) &&
    !isInsideKalariReserve(x, z, 0.7) &&
    !isNearHarvestPalm(x, z, 2.5) &&
    marketSites.every(
      ([marketX, marketZ]) => Math.hypot(x - marketX, z - marketZ) >= 2.8,
    ) &&
    buildingSites.every(
      ([houseX, houseZ], index) =>
        index === houseIndex || Math.hypot(x - houseX, z - houseZ) >= 3.6,
    ),
);
const isInsideBackyardReserve = (x: number, z: number, padding = 0) =>
  buildingSites.some(([houseX, houseZ], index) => {
    if (!backyardPlans[index].hasYard) return false;
    const angle = backyardPlans[index].rotation;
    const dx = x - houseX;
    const dz = z - houseZ;
    const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
    const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
    return (
      Math.abs(localX) < 3.3 + padding &&
      localZ > 5.2 - padding &&
      localZ < 8.8 + padding
    );
  });
const fieldHomeSites: [number, number][] = [
  [-33, 63],
  [-46, 64],
  [-59, 63],
];
const vegetablePlots = planVegetablePlots(
  [
    [-58, 54],
    [-46, 54],
    [-34, 54],
  ],
  (x, z) =>
    !getWaterInfo(x, z) &&
    distanceToRoad(x, z) > 2.8 &&
    distanceToRiver(x, z) > 8 &&
    !isInsidePaddyReserve(x, z, 2) &&
    fieldHomeSites.every(([hx, hz]) => Math.hypot(x - hx, z - hz) > 4.8),
);
const scatteredHomes = planHomesteads(
  [
    [6, 24],
    [34, 12],
    [56, -7],
    [-16, 20],
    [68, -35],
    [50, -61],
  ],
  1974,
  (x, z) =>
    Math.abs(x) < 80 &&
    Math.abs(z) < 80 &&
    !getWaterInfo(x, z) &&
    distanceToRiver(x, z) > 8 &&
    distanceToRoad(x, z) > 2.8 &&
    !isInsideTeaShop(x, z, 5) &&
    !insideMarketDistrict(x, z, 5) &&
    !insideTempleGround(x, z, 5) &&
    !isInsideKalariReserve(x, z, 3) &&
    !isInsidePaddyReserve(x, z, 6) &&
    !insideGarden(vegetablePlots, x, z, 3) &&
    !isNearHarvestPalm(x, z, 6) &&
    !isInsideBackyardReserve(x, z, 2) &&
    [
      ...buildingSites,
      ...fieldHomeSites,
      landlordEstateSite,
      ...marketSites,
    ].every(
      ([hx, hz]) =>
        Math.hypot(x - hx, z - hz) > (hx === landlordEstateSite[0] ? 18 : 6),
    ),
  villagePaths.nearestPoint,
  (x, z) =>
    !getWaterInfo(x, z) &&
    !isInsideTeaShop(x, z, 1) &&
    !isInsidePaddyReserve(x, z, 1) &&
    !isInsideKalariReserve(x, z, 0.5) &&
    !isInsideBackyardReserve(x, z, 0.5) &&
    !isNearHarvestPalm(x, z, 1.5) &&
    [...buildingSites, ...fieldHomeSites].every(
      ([hx, hz]) => Math.hypot(x - hx, z - hz) > 3.6,
    ),
).slice(0, 5);
const allBuildingSites: [number, number][] = [
  ...buildingSites,
  ...fieldHomeSites,
  ...scatteredHomes.map((home) => [...home.site] as [number, number]),
  landlordEstateSite,
];
const insideNewHomesteadPath = (x: number, z: number, padding = 1.3) =>
  scatteredHomes.some((home) => {
    const dx = home.lane[0] - home.doorstep[0],
      dz = home.lane[1] - home.doorstep[1];
    const t = THREE.MathUtils.clamp(
      ((x - home.doorstep[0]) * dx + (z - home.doorstep[1]) * dz) /
        Math.max(0.01, dx * dx + dz * dz),
      0,
      1,
    );
    return (
      Math.hypot(x - home.doorstep[0] - dx * t, z - home.doorstep[1] - dz * t) <
      padding
    );
  });
const groundGeometry = new THREE.PlaneGeometry(190, 190, 128, 128);
const positions = groundGeometry.attributes.position as THREE.BufferAttribute;
const colors: number[] = [];
const low = new THREE.Color("#647650");
const mid = new THREE.Color("#839366");
const high = new THREE.Color("#738159");
for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i);
  const z = -positions.getY(i);
  const height = terrainHeight(x, z);
  positions.setZ(i, height);
  const shade = low
    .clone()
    .lerp(mid, THREE.MathUtils.clamp((height + 5) / 14, 0, 1));
  if (height > 4)
    shade.lerp(high, THREE.MathUtils.clamp((height - 4) / 7, 0, 0.55));
  const fleck = (random() - 0.5) * 0.06;
  colors.push(shade.r + fleck, shade.g + fleck, shade.b + fleck);
}
groundGeometry.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(colors, 3),
);
groundGeometry.computeVertexNormals();
const ground = new THREE.Mesh(
  groundGeometry,
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(220, 220),
  new THREE.MeshStandardMaterial({
    color: "#80b9b5",
    transparent: true,
    opacity: 0.64,
    roughness: 0.28,
    metalness: 0.04,
  }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = -7.2;
scene.add(water);

const trunkMaterial = new THREE.MeshStandardMaterial({
  color: "#715344",
  roughness: 1,
});
const leafMaterials = ["#506c50", "#688263", "#80906a", "#62785b"].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.94,
      flatShading: true,
    }),
);
const trunkGeometry = new THREE.CylinderGeometry(0.13, 0.23, 2.25, 6);
const canopyGeometry = new THREE.IcosahedronGeometry(1, 2);
const trees: THREE.Group[] = [];
for (let i = 0; i < 154; i++) {
  const x = (random() - 0.5) * 164;
  const z = (random() - 0.5) * 164;
  if (
    Math.hypot(x, z) < 10 ||
    terrainHeight(x, z) < -2.4 ||
    distanceToRoad(x, z) < 3.2 ||
    distanceToRiver(x, z) < 7 ||
    isInsidePaddyReserve(x, z, 2) ||
    isInsideKalariReserve(x, z, 2) ||
    isNearHarvestPalm(x, z, 5) ||
    isInsideBackyardReserve(x, z, 2) ||
    insideGarden(vegetablePlots, x, z, 2) ||
    insideNewHomesteadPath(x, z, 2) ||
    isInsideTeaShop(x, z, 2) ||
    isInsideHeritageYard(x, z) ||
    insideTempleGround(x, z, 2) ||
    [...allBuildingSites, ...animalSites, ...marketSites].some(
      ([siteX, siteZ]) => Math.hypot(x - siteX, z - siteZ) < 7,
    )
  )
    continue;
  const tree = new THREE.Group();
  const scale = 0.72 + random() * 0.8;
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1.03 * scale;
  trunk.scale.setScalar(scale);
  trunk.castShadow = true;
  tree.add(trunk);
  const leafMaterial =
    leafMaterials[Math.floor(random() * leafMaterials.length)];
  const layers = 2 + Math.floor(random() * 2);
  for (let layer = 0; layer < layers; layer++) {
    const crown = new THREE.Mesh(canopyGeometry, leafMaterial);
    const size = (1.2 - layer * 0.2) * scale;
    crown.position.set(
      (random() - 0.5) * 0.3,
      (2.12 + layer * 0.8) * scale,
      (random() - 0.5) * 0.3,
    );
    crown.scale.set(size, size * (0.82 + random() * 0.18), size);
    crown.rotation.set(random() * 0.4, random() * Math.PI, random() * 0.4);
    crown.castShadow = true;
    tree.add(crown);
  }
  tree.position.set(x, terrainHeight(x, z), z);
  tree.rotation.y = random() * Math.PI * 2;
  scene.add(tree);
  trees.push(tree);
}

const palmBark = new THREE.MeshStandardMaterial({
  color: "#765b3c",
  roughness: 1,
  flatShading: true,
});
const palmLeaves = [
  new THREE.MeshStandardMaterial({
    color: "#315b3c",
    roughness: 1,
    side: THREE.DoubleSide,
  }),
  new THREE.MeshStandardMaterial({
    color: "#416d43",
    roughness: 1,
    side: THREE.DoubleSide,
  }),
];
const coconutMaterial = new THREE.MeshStandardMaterial({
  color: "#70502e",
  roughness: 1,
});
const palmTrunkGeometry = new THREE.CylinderGeometry(0.17, 0.4, 11, 8, 10);
const palmTrunkPositions = palmTrunkGeometry.attributes
  .position as THREE.BufferAttribute;
for (let vertex = 0; vertex < palmTrunkPositions.count; vertex++) {
  const y = palmTrunkPositions.getY(vertex);
  const heightRatio = (y + 5.5) / 11;
  palmTrunkPositions.setX(
    vertex,
    palmTrunkPositions.getX(vertex) + 0.78 * heightRatio * heightRatio,
  );
}
palmTrunkGeometry.computeVertexNormals();

const frondVertices: number[] = [];
for (let segment = 0; segment < 22; segment++) {
  const t = (segment + 1) / 23;
  const centerY = 2.0 * t - 3.15 * t * t;
  const centerZ = 5.2 * t;
  const leafletWidth = 0.18 + Math.sin(t * Math.PI) * 0.36;
  for (const side of [-1, 1]) {
    frondVertices.push(
      0,
      centerY,
      centerZ,
      side * leafletWidth,
      centerY - 0.13,
      centerZ + 0.34,
      side * 0.08,
      centerY - 0.22,
      centerZ - 0.14,
    );
  }
}
const palmFrondGeometry = new THREE.BufferGeometry();
palmFrondGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(frondVertices, 3),
);
palmFrondGeometry.computeVertexNormals();
palmFrondGeometry.computeBoundingSphere();
const palmFronds: THREE.Group[] = [];
type CoconutPalm = {
  group: THREE.Group;
  crown: THREE.Group;
  coconuts: THREE.Mesh[];
  groundY: number;
};
const coconutPalms: CoconutPalm[] = [];
const createCoconutPalm = (
  x: number,
  z: number,
  scale: number,
  rotation: number,
) => {
  const palm = new THREE.Group();
  const trunk = new THREE.Mesh(palmTrunkGeometry, palmBark);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  palm.add(trunk);
  const crown = new THREE.Group();
  const coconuts: THREE.Mesh[] = [];
  crown.position.set(0.78, 5.15, 0);
  for (let frond = 0; frond < 9; frond++) {
    const leaf = new THREE.Mesh(
      palmFrondGeometry,
      palmLeaves[frond % palmLeaves.length],
    );
    leaf.rotation.y = (frond / 9) * Math.PI * 2;
    leaf.rotation.z = 0.12 + (frond % 3) * 0.035;
    leaf.castShadow = true;
    crown.add(leaf);
  }
  for (let nut = 0; nut < 4; nut++) {
    const angle = (nut / 4) * Math.PI * 2;
    const coconut = new THREE.Mesh(
      new THREE.SphereGeometry(0.27, 7, 6),
      coconutMaterial,
    );
    coconut.position.set(
      Math.cos(angle) * 0.35,
      -0.35 + (nut % 2) * 0.08,
      Math.sin(angle) * 0.35,
    );
    coconut.castShadow = true;
    crown.add(coconut);
    coconuts.push(coconut);
  }
  palm.add(crown);
  palm.position.set(x, terrainHeight(x, z) + 5.5 * scale, z);
  palm.rotation.y = rotation;
  palm.scale.setScalar(scale);
  scene.add(palm);
  palmFronds.push(palm);
  const palmInfo = {
    group: palm,
    crown,
    coconuts,
    groundY: terrainHeight(x, z),
  };
  coconutPalms.push(palmInfo);
  return palmInfo;
};

const harvestPalms = harvestPalmSites.map(([x, z, scale, rotation]) =>
  createCoconutPalm(x, z, scale, rotation),
);

for (let attempt = 0; attempt < 1600 && palmFronds.length < 25; attempt++) {
  const x = (random() - 0.5) * 154;
  const z = (random() - 0.5) * 154;
  const clearOfTrees = trees.every(
    (tree) => Math.hypot(tree.position.x - x, tree.position.z - z) > 4.8,
  );
  const clearOfHouses = allBuildingSites.every(
    ([houseX, houseZ]) => Math.hypot(houseX - x, houseZ - z) > 7.2,
  );
  const clearOfPens = animalSites.every(
    ([animalX, animalZ]) => Math.hypot(animalX - x, animalZ - z) > 5.5,
  );
  const clearOfPalms = palmFronds.every(
    (palm) => Math.hypot(palm.position.x - x, palm.position.z - z) > 8.5,
  );
  if (
    Math.hypot(x, z) < 18 ||
    terrainHeight(x, z) < -1.8 ||
    distanceToRoad(x, z) < 4.2 ||
    distanceToRiver(x, z) < 8 ||
    isInsidePaddyReserve(x, z, 3) ||
    isInsideKalariReserve(x, z, 3) ||
    isInsideBackyardReserve(x, z, 3) ||
    insideGarden(vegetablePlots, x, z, 3) ||
    insideNewHomesteadPath(x, z, 2) ||
    isInsideTeaShop(x, z, 3) ||
    isInsideHeritageYard(x, z) ||
    insideTempleGround(x, z, 3) ||
    !clearOfTrees ||
    !clearOfHouses ||
    !clearOfPens ||
    !clearOfPalms
  )
    continue;
  createCoconutPalm(x, z, 0.85 + random() * 0.38, random() * Math.PI * 2);
}

const saplingMaterial = new THREE.MeshStandardMaterial({
  color: "#587847",
  roughness: 1,
  flatShading: true,
});
for (let attempt = 0, planted = 0; attempt < 1200 && planted < 44; attempt++) {
  const x = (random() - 0.5) * 158;
  const z = (random() - 0.5) * 158;
  if (
    terrainHeight(x, z) < -1.5 ||
    distanceToRoad(x, z) < 2.7 ||
    distanceToRiver(x, z) < 4.5 ||
    isInsidePaddyReserve(x, z, 1) ||
    isInsideKalariReserve(x, z, 1) ||
    isNearHarvestPalm(x, z, 2.5) ||
    isInsideBackyardReserve(x, z, 1) ||
    insideGarden(vegetablePlots, x, z, 1) ||
    insideNewHomesteadPath(x, z) ||
    isInsideTeaShop(x, z, 1) ||
    isInsideHeritageYard(x, z) ||
    insideTempleGround(x, z, 1) ||
    [...allBuildingSites, ...marketSites].some(
      ([siteX, siteZ]) => Math.hypot(x - siteX, z - siteZ) < 4.5,
    )
  )
    continue;
  const sapling = new THREE.Group();
  const scale = 0.38 + random() * 0.35;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.12, 1.25, 5),
    trunkMaterial,
  );
  stem.position.y = 0.57 * scale;
  stem.scale.setScalar(scale);
  sapling.add(stem);
  const crown = new THREE.Mesh(canopyGeometry, saplingMaterial);
  crown.position.y = 1.32 * scale;
  crown.scale.set(0.75 * scale, 0.82 * scale, 0.75 * scale);
  crown.castShadow = true;
  sapling.add(crown);
  sapling.position.set(x, terrainHeight(x, z), z);
  scene.add(sapling);
  planted++;
}

const bridgeCrossing = findCrossing(roadCurves[10], riverRoute);
if (!bridgeCrossing)
  throw new Error("The bridge lane must intersect the river.");
const bridgeSpan = createBridgeSpan(bridgeCrossing, terrainHeight);
const inspectionStops: InspectionStop[] = [
  {
    position: [68, -52],
    lookAt: landlordEstateSite,
    label: "Estate accounts",
    pause: 12,
  },
  {
    position: [templeSite[0], templeSite[1] + 1],
    lookAt: [templeSite[0], templeSite[1] - 1.5],
    label: "Temple flower offering",
    pause: 14,
  },
  {
    position: [31, -30],
    lookAt: [35, -29],
    label: "Inspecting village homes",
    pause: 9,
  },
  {
    position: [2, -28],
    lookAt: [6, -30],
    label: "Checking market produce",
    pause: 14,
  },
  {
    position: [9, -5.7],
    lookAt: kalariSite,
    label: "Watching kalari practice",
    pause: 10,
  },
  {
    position: [-42, 28],
    lookAt: [-46, 42],
    label: "Inspecting rice fields",
    pause: 16,
  },
];
const landlordInspection = createInspection(inspectionStops[0].position);
const householdCurfews: HouseholdCurfew[] = Array.from({ length: 3 }, () => ({
  phase: "visiting",
}));
const estatePoint = (x: number, z: number): [number, number] => [
  landlordEstateSite[0] + x * Math.cos(-0.5) + z * Math.sin(-0.5),
  landlordEstateSite[1] - x * Math.sin(-0.5) + z * Math.cos(-0.5),
];
const estateGate: [number, number] = estatePoint(0, 13);
const estateCourtyard: [number, number] = estatePoint(0, 8);
const landlordCartRoute = new THREE.CatmullRomCurve3(
  [
    landlordEstateSite,
    [68, -52],
    [65, -53],
    [53, -39],
    [46, -40],
    [39, -39],
    [35, -34],
    [31, -30],
    [23, -26],
    [15, -29],
  ].map(([x, z]) => new THREE.Vector3(x, roadSurfaceHeight(x, z), z)),
  false,
  "catmullrom",
  0.3,
);
const makeRoadRibbon = (
  curve: THREE.CatmullRomCurve3,
  width: number,
  material: THREE.Material,
  lift: number,
  offset = 0,
) => {
  const geometry = createRoadRibbonGeometry(
    curve,
    width,
    offset,
    lift,
    roadMeshHeight,
    (x, z) => distanceToRiver(x, z) >= RIVER_HALF_WIDTH + 0.1,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
};
const shoulderMaterial = new THREE.MeshStandardMaterial({
  color: "#998263",
  roughness: 1,
  side: THREE.DoubleSide,
});
const roadMaterial = new THREE.MeshStandardMaterial({
  color: "#59432f",
  roughness: 1,
  side: THREE.DoubleSide,
});
const roadEdgeMaterial = new THREE.MeshStandardMaterial({
  color: "#403326",
  roughness: 1,
  side: THREE.DoubleSide,
});
roadCurves.forEach((curve, index) => {
  const isFootpath = index >= 3;
  const width = isFootpath ? 2.4 : 4.6;
  const trackWidth = isFootpath ? 0.9 : 3.3;
  const rutOffset = isFootpath ? 0.3 : 0.66;
  makeRoadRibbon(curve, width, shoulderMaterial, 0.075);
  makeRoadRibbon(curve, trackWidth, roadMaterial, 0.105);
  makeRoadRibbon(curve, 0.12, roadEdgeMaterial, 0.125, -rutOffset);
  makeRoadRibbon(curve, 0.12, roadEdgeMaterial, 0.125, rutOffset);
});
const sharedRoadPoints = new Map<
  string,
  { x: number; z: number; uses: number }
>();
for (const route of roadRoutes) {
  for (const [x, z] of route) {
    const key = `${x},${z}`;
    const entry = sharedRoadPoints.get(key);
    if (entry) entry.uses++;
    else sharedRoadPoints.set(key, { x, z, uses: 1 });
  }
}
const junctionMaterial = new THREE.MeshStandardMaterial({
  color: "#59432f",
  roughness: 1,
  side: THREE.DoubleSide,
});
for (const junction of sharedRoadPoints.values()) {
  if (junction.uses < 2) continue;
  const radius = junction.uses > 2 ? 2.8 : 2.25;
  const padGeometry = new THREE.RingGeometry(0.001, radius, 32, 4);
  const padPositions = padGeometry.attributes.position as THREE.BufferAttribute;
  const centerY = terrainHeight(junction.x, junction.z);
  for (let vertex = 0; vertex < padPositions.count; vertex++) {
    const x = junction.x + padPositions.getX(vertex);
    const z = junction.z - padPositions.getY(vertex);
    padPositions.setZ(vertex, terrainHeight(x, z) - centerY);
  }
  padGeometry.computeVertexNormals();
  const pad = new THREE.Mesh(padGeometry, junctionMaterial);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(junction.x, centerY + 0.135, junction.z);
  pad.receiveShadow = true;
  scene.add(pad);
}

const paddyWaterMaterial = new THREE.MeshStandardMaterial({
  color: "#78988a",
  roughness: 0.28,
  metalness: 0.04,
  transparent: true,
  opacity: 0.84,
  side: THREE.DoubleSide,
});
const paddySoilMaterial = new THREE.MeshStandardMaterial({
  color: "#554936",
  roughness: 1,
});
const paddyBundMaterial = new THREE.MeshStandardMaterial({
  color: "#867552",
  roughness: 1,
});
const riceLeafMaterials = ["#687c3e", "#7b8b45", "#8d9650"].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
);
const riceVertices: number[] = [];
for (let leaf = 0; leaf < 5; leaf++) {
  const angle = leaf * Math.PI * 0.4;
  const sideX = Math.cos(angle) * 0.055;
  const sideZ = Math.sin(angle) * 0.055;
  const leanX = Math.cos(angle) * (0.08 + (leaf % 2) * 0.04);
  const leanZ = Math.sin(angle) * (0.08 + (leaf % 2) * 0.04);
  const height = 0.42 + (leaf % 3) * 0.1;
  riceVertices.push(-sideX, 0, -sideZ, leanX, height, leanZ, sideX, 0, sideZ);
}
const riceClumpGeometry = new THREE.BufferGeometry();
riceClumpGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(riceVertices, 3),
);
riceClumpGeometry.computeVertexNormals();
riceClumpGeometry.computeBoundingSphere();
const paddyRice: THREE.InstancedMesh[] = [];
const paddyWaterLevels: number[] = [];
for (const [plotIndex, [fieldX, fieldZ]] of paddyPlots.entries()) {
  const waterY = paddyTerrain(fieldX, fieldZ) - 0.03;
  paddyWaterLevels.push(waterY);
  const soil = new THREE.Mesh(
    new THREE.BoxGeometry(11.5, 0.55, 9.5),
    paddySoilMaterial,
  );
  soil.position.set(fieldX, waterY - 0.2, fieldZ);
  soil.receiveShadow = true;
  scene.add(soil);
  const waterPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10.9, 8.9),
    paddyWaterMaterial,
  );
  waterPlane.rotation.x = -Math.PI / 2;
  waterPlane.position.set(fieldX, waterY + 0.09, fieldZ);
  scene.add(waterPlane);
  const bund = new THREE.Group();
  for (const [x, z, width, depth] of [
    [0, -4.7, 11.7, 0.5],
    [0, 4.7, 11.7, 0.5],
    [-5.6, 0, 0.5, 9.1],
    [5.6, 0, 0.5, 9.1],
  ]) {
    const bank = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.68, depth),
      paddyBundMaterial,
    );
    bank.position.set(x, 0.3, z);
    bank.castShadow = true;
    bank.receiveShadow = true;
    bund.add(bank);
  }
  bund.position.set(fieldX, waterY, fieldZ);
  scene.add(bund);

  const rice = new THREE.InstancedMesh(
    riceClumpGeometry,
    riceLeafMaterials[plotIndex % riceLeafMaterials.length],
    170,
  );
  const stalk = new THREE.Object3D();
  let stalkCount = 0;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 15; col++) {
      const x = fieldX - 4.85 + col * 0.69 + (row % 2) * 0.24;
      const z = fieldZ - 3.65 + row * 1.12;
      const scale = 0.66 + random() * 0.62;
      stalk.position.set(x, waterY + 0.12, z);
      stalk.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.08);
      stalk.scale.set(scale, scale, scale);
      stalk.updateMatrix();
      rice.setMatrixAt(stalkCount++, stalk.matrix);
    }
  }
  rice.count = stalkCount;
  rice.instanceMatrix.needsUpdate = true;
  rice.computeBoundingSphere();
  rice.castShadow = true;
  scene.add(rice);
  paddyRice.push(rice);
}

const farmerSkinMaterial = new THREE.MeshStandardMaterial({
  color: "#956b4b",
  roughness: 1,
});
const farmerHairMaterial = new THREE.MeshStandardMaterial({
  color: "#b5aa8b",
  roughness: 1,
});
const farmerClothes = [
  "#89794c",
  "#765a46",
  "#687348",
  "#9a704f",
  "#566f64",
  "#9a875e",
].map(
  (color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
);
const farmerHatMaterial = new THREE.MeshStandardMaterial({
  color: "#b59a60",
  roughness: 1,
  side: THREE.DoubleSide,
});
const farmerBasketMaterial = new THREE.MeshStandardMaterial({
  color: "#795939",
  roughness: 1,
});
const farmerMunduMaterial = new THREE.MeshStandardMaterial({
  color: "#e4d8b8",
  roughness: 1,
  flatShading: true,
});
const farmerSariMaterials = ["#a25d45", "#62765b"].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.94,
      flatShading: true,
    }),
);
type PaddyWorker = {
  group: THREE.Group;
  upperBody: THREE.Group;
  arms: THREE.Group[];
  legs: THREE.Group[];
  head: THREE.Group;
  seedlings: THREE.Mesh;
  phase: number;
  workTime: number;
  plotIndex: number;
  homeX: number;
  homeZ: number;
};
const paddyWorkers: PaddyWorker[] = [];
for (let workerIndex = 0; workerIndex < 6; workerIndex++) {
  const plotIndex = Math.floor(workerIndex / 2);
  const [fieldX, fieldZ] = paddyPlots[plotIndex];
  const group = new THREE.Group();
  const upperBody = new THREE.Group();
  upperBody.position.y = 0.57;
  group.add(upperBody);
  const isWoman = workerIndex === 2 || workerIndex === 5;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      isWoman ? 0.23 : 0.22,
      isWoman ? 0.42 : 0.48,
      3,
      7,
    ),
    isWoman ? farmerClothes[workerIndex] : farmerSkinMaterial,
  );
  body.position.set(0, (isWoman ? 0.99 : 1.06) - 0.57, 0.1);
  body.castShadow = true;
  upperBody.add(body);
  const lowerWrap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.34, isWoman ? 0.95 : 0.66, 9),
    isWoman
      ? farmerSariMaterials[workerIndex % farmerSariMaterials.length]
      : farmerMunduMaterial,
  );
  lowerWrap.position.y = isWoman ? 0.57 : 0.43;
  lowerWrap.castShadow = true;
  group.add(lowerWrap);
  if (isWoman) {
    const sariPallu = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 1.0, 0.1),
      farmerSariMaterials[workerIndex % farmerSariMaterials.length],
    );
    sariPallu.position.set(-0.2, 1.06 - 0.57, 0.2);
    sariPallu.rotation.z = -0.25;
    upperBody.add(sariPallu);
  }
  const head = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 9, 7),
    farmerSkinMaterial,
  );
  face.position.set(0, 1.36, -0.04);
  head.add(face);
  const grayHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.215, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.56),
    farmerHairMaterial,
  );
  grayHair.position.set(0, 1.44, -0.04);
  head.add(grayHair);
  if (isWoman) {
    const bun = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 7, 5),
      farmerHairMaterial,
    );
    bun.position.set(0, 1.43, 0.13);
    head.add(bun);
  } else {
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 0.25, 10),
      farmerHatMaterial,
    );
    hat.scale.y = 0.48;
    hat.position.set(0, 1.58, -0.04);
    head.add(hat);
  }
  head.position.y = -0.57;
  upperBody.add(head);
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.28, 1.16 - 0.57, -0.02);
    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.095, 0.38, 3, 6),
      isWoman ? farmerClothes[workerIndex] : farmerSkinMaterial,
    );
    sleeve.position.set(-side * 0.045, -0.23, -0.05);
    sleeve.rotation.z = side * -0.24;
    arm.add(sleeve);
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 7, 5),
      farmerSkinMaterial,
    );
    hand.position.set(-side * 0.09, -0.47, -0.12);
    arm.add(hand);
    upperBody.add(arm);
    arms.push(arm);
  }
  const seedlings = new THREE.Mesh(
    riceClumpGeometry,
    riceLeafMaterials[plotIndex % riceLeafMaterials.length],
  );
  seedlings.position.set(-0.08, -0.47, -0.12);
  seedlings.scale.setScalar(0.45);
  arms[1].add(seedlings);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.53, 0.08);
    const lowerLeg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.38, 3, 6),
      farmerSkinMaterial,
    );
    lowerLeg.position.y = -0.23;
    leg.add(lowerLeg);
    group.add(leg);
    legs.push(leg);
  }
  const seedBasket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.25, 0.3, 8),
    farmerBasketMaterial,
  );
  seedBasket.position.set(-0.4, 0.34, 0.34);
  group.add(seedBasket);
  scene.add(group);
  const homeX = fieldX + (workerIndex % 2 === 0 ? -2.35 : 2.3);
  const homeZ = fieldZ + (workerIndex % 2 === 0 ? -1.6 : 1.6);
  group.position.set(homeX, paddyWaterLevels[plotIndex], homeZ);
  paddyWorkers.push({
    group,
    upperBody,
    arms,
    legs,
    head,
    seedlings,
    phase: workerIndex * 1.37,
    workTime: 0,
    plotIndex,
    homeX,
    homeZ,
  });
}

const rockMaterial = new THREE.MeshStandardMaterial({
  color: "#8b8f79",
  roughness: 1,
  flatShading: true,
});
const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
for (let i = 0; i < 52; i++) {
  const x = (random() - 0.5) * 166;
  const z = (random() - 0.5) * 166;
  if (
    Math.hypot(x, z) < 7 ||
    terrainHeight(x, z) < -2.2 ||
    distanceToRoad(x, z) < 3.2 ||
    distanceToRiver(x, z) < 4.5 ||
    isInsidePaddyReserve(x, z, 1) ||
    isInsideKalariReserve(x, z, 1.5) ||
    isNearHarvestPalm(x, z, 2) ||
    isInsideBackyardReserve(x, z, 1) ||
    insideGarden(vegetablePlots, x, z, 1) ||
    insideNewHomesteadPath(x, z) ||
    isInsideTeaShop(x, z, 1) ||
    isInsideHeritageYard(x, z) ||
    insideTempleGround(x, z, 1) ||
    [...allBuildingSites, ...marketSites].some(
      ([siteX, siteZ]) => Math.hypot(x - siteX, z - siteZ) < 5,
    )
  )
    continue;
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  const size = 0.25 + random() * 0.8;
  rock.position.set(x, terrainHeight(x, z) + size * 0.4, z);
  rock.scale.set(size * (0.8 + random()), size * 0.7, size);
  rock.rotation.set(random() * 0.3, random() * Math.PI, random() * 0.3);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);
}

const wallMaterials = ["#806044", "#73543d", "#8c6a49", "#694d39"].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }),
);
const roofMaterials = ["#90703d", "#806238", "#9c7a46"].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }),
);
const mudCourseMaterial = new THREE.MeshStandardMaterial({
  color: "#5e4534",
  roughness: 1,
});
const thatchLineMaterial = new THREE.MeshStandardMaterial({
  color: "#c4a365",
  roughness: 1,
});
const woodMaterial = new THREE.MeshStandardMaterial({
  color: "#624832",
  roughness: 1,
});
const windowMaterial = new THREE.MeshStandardMaterial({
  color: "#382f26",
  roughness: 1,
});
const eyeMaterial = new THREE.MeshStandardMaterial({
  color: "#2c2922",
  roughness: 0.8,
});
const villageLamps: THREE.PointLight[] = [];
const lampGlass = new THREE.MeshStandardMaterial({
  color: "#f1cb85",
  emissive: "#ffab40",
  emissiveIntensity: 0,
  roughness: 0.8,
});
const cottages: THREE.Group[] = [];
const yardStructures: THREE.Group[] = [];
const createCottage = (
  x: number,
  z: number,
  index: number,
  rotation: number,
) => {
  const building = new THREE.Group();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2.45, 3.8),
    wallMaterials[index % wallMaterials.length],
  );
  wall.position.y = 1.25;
  wall.castShadow = true;
  wall.receiveShadow = true;
  building.add(wall);
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 0.42, 4.05),
    wallMaterials[index % wallMaterials.length],
  );
  foundation.position.y = 0.24;
  foundation.castShadow = true;
  building.add(foundation);

  const roofShape = new THREE.Shape();
  roofShape.moveTo(-2.28, 0);
  roofShape.lineTo(2.28, 0);
  roofShape.lineTo(2.28, 0.86);
  roofShape.lineTo(0, 2.28);
  roofShape.lineTo(-2.28, 0.86);
  roofShape.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofShape, {
    depth: 4.12,
    bevelEnabled: false,
  });
  roofGeometry.translate(0, 2.22, -2.06);
  const roof = new THREE.Mesh(
    roofGeometry,
    roofMaterials[index % roofMaterials.length],
  );
  roof.castShadow = true;
  building.add(roof);
  for (let course = 0; course < 6; course++) {
    const y = 0.5 + course * 0.32;
    const horizontalSeam = new THREE.Mesh(
      new THREE.BoxGeometry(4.08, 0.035, 0.045),
      mudCourseMaterial,
    );
    horizontalSeam.position.set(0, y, -1.93);
    building.add(horizontalSeam);
    const stagger = course % 2 ? 0.5 : 0;
    for (let joint = -2; joint <= 2; joint++) {
      const jointX = joint * 1.02 + stagger;
      if (Math.abs(jointX) > 1.98) continue;
      const verticalSeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.28, 0.05),
        mudCourseMaterial,
      );
      verticalSeam.position.set(jointX, y + 0.16, -1.93);
      building.add(verticalSeam);
    }
  }
  for (let strand = -4; strand <= 4; strand++) {
    const x = strand * 0.43;
    const straw = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 4.22, 4),
      thatchLineMaterial,
    );
    straw.rotation.x = Math.PI / 2;
    straw.position.set(x, 4.48 - Math.abs(x) * 0.62, 0);
    building.add(straw);
  }

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 1.45, 0.12),
    woodMaterial,
  );
  door.position.set(0.75, 0.73, -1.96);
  building.add(door);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 7, 5),
    woodMaterial,
  );
  knob.position.set(0.48, 0.72, -2.04);
  building.add(knob);
  for (const windowX of [-1.25, 1.25]) {
    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.74, 0.14),
      woodMaterial,
    );
    windowFrame.position.set(windowX, 1.45, -1.96);
    building.add(windowFrame);
    const windowPane = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.52, 0.16),
      windowMaterial,
    );
    windowPane.position.set(windowX, 1.45, -2.04);
    building.add(windowPane);
    const crossbar = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.56, 0.04),
      wallMaterials[index % wallMaterials.length],
    );
    crossbar.position.set(windowX, 1.45, -2.13);
    building.add(crossbar);
  }
  const porch = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.16, 1.1),
    new THREE.MeshStandardMaterial({ color: "#a1845f", roughness: 1 }),
  );
  porch.position.set(0, 0.18, -2.28);
  building.add(porch);
  for (const postX of [-1.35, 1.35]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.09, 1.8, 6),
      woodMaterial,
    );
    post.position.set(postX, 0.98, -2.62);
    building.add(post);
  }
  if (index % 3 === 0) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      lampGlass,
    );
    lamp.position.set(-1.6, 1.7, -2.12);
    building.add(lamp);
    const light = new THREE.PointLight("#ffbc70", 0, 9, 2);
    light.position.copy(lamp.position);
    building.add(light);
    villageLamps.push(light);
  }
  building.position.set(x, terrainHeight(x, z), z);
  building.rotation.y = rotation;
  scene.add(building);
  cottages.push(building);
};
for (const [index, [x, z]] of buildingSites.entries()) {
  createCottage(x, z, index, backyardPlans[index].rotation);
}
// Small earthen approaches join each scattered doorstep to its nearby lane.
for (const [index, home] of scatteredHomes.entries()) {
  createCottage(home.site[0], home.site[1], index + 30, home.rotation);
  const approach = new THREE.CatmullRomCurve3(
    [home.doorstep, home.lane].map(
      ([x, z]) => new THREE.Vector3(x, terrainHeight(x, z), z),
    ),
  );
  const path = new THREE.Mesh(
    createRoadRibbonGeometry(
      approach,
      1.1,
      0,
      0.1,
      terrainHeight,
      (x, z) => !getWaterInfo(x, z),
    ),
    roadMaterial,
  );
  path.receiveShadow = true;
  scene.add(path);
}

const landlordEstate = new THREE.Group();
const estateRotation = -0.5;
const estateWallMaterial = new THREE.MeshStandardMaterial({
  color: "#a98c65",
  roughness: 1,
});
const lateriteMaterial = new THREE.MeshStandardMaterial({
  color: "#76513e",
  roughness: 1,
  flatShading: true,
});
const oldTileMaterial = new THREE.MeshStandardMaterial({
  color: "#8c4933",
  roughness: 1,
  flatShading: true,
});
const manorWalls = new THREE.Mesh(
  new THREE.BoxGeometry(10.5, 4.1, 8.6),
  estateWallMaterial,
);
manorWalls.position.y = 2.2;
manorWalls.castShadow = true;
manorWalls.receiveShadow = true;
landlordEstate.add(manorWalls);
const manorPlinth = new THREE.Mesh(
  new THREE.BoxGeometry(11, 0.55, 9.1),
  lateriteMaterial,
);
manorPlinth.position.y = 0.28;
manorPlinth.castShadow = true;
landlordEstate.add(manorPlinth);
const manorRoofShape = new THREE.Shape();
manorRoofShape.moveTo(-5.9, 0);
manorRoofShape.lineTo(5.9, 0);
manorRoofShape.lineTo(5.9, 1.05);
manorRoofShape.lineTo(0, 3.25);
manorRoofShape.lineTo(-5.9, 1.05);
manorRoofShape.closePath();
const manorRoofGeometry = new THREE.ExtrudeGeometry(manorRoofShape, {
  depth: 9.8,
  bevelEnabled: false,
});
manorRoofGeometry.translate(0, 4.05, -4.9);
const manorRoof = new THREE.Mesh(manorRoofGeometry, oldTileMaterial);
manorRoof.castShadow = true;
landlordEstate.add(manorRoof);
for (let ridge = -5; ridge <= 5; ridge++) {
  const tileLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 9.95, 5),
    new THREE.MeshStandardMaterial({
      color: ridge % 2 ? "#a45b3e" : "#733d30",
      roughness: 1,
    }),
  );
  tileLine.rotation.x = Math.PI / 2;
  tileLine.position.set(ridge * 1.05, 4.45 + (5 - Math.abs(ridge)) * 0.34, 0);
  landlordEstate.add(tileLine);
}
const veranda = new THREE.Mesh(
  new THREE.BoxGeometry(11.9, 0.22, 2.25),
  woodMaterial,
);
veranda.position.set(0, 0.68, 5.2);
veranda.castShadow = true;
landlordEstate.add(veranda);
for (const x of [-5, -2.5, 0, 2.5, 5]) {
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.17, 3.25, 8),
    woodMaterial,
  );
  column.position.set(x, 2.28, 5.85);
  column.castShadow = true;
  landlordEstate.add(column);
}
const manorDoor = new THREE.Mesh(
  new THREE.BoxGeometry(1.35, 2.45, 0.18),
  woodMaterial,
);
manorDoor.position.set(0, 1.48, 4.37);
landlordEstate.add(manorDoor);
for (const x of [-3.35, 3.35]) {
  const shutter = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 1.15, 0.16),
    windowMaterial,
  );
  shutter.position.set(x, 2.45, 4.38);
  landlordEstate.add(shutter);
  const shutterFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 1.42, 0.12),
    woodMaterial,
  );
  shutterFrame.position.set(x, 2.45, 4.31);
  landlordEstate.add(shutterFrame);
}
const estateWall = new THREE.MeshStandardMaterial({
  color: "#977951",
  roughness: 1,
});
const rearWall = new THREE.Mesh(
  new THREE.BoxGeometry(24, 1.15, 0.4),
  estateWall,
);
rearWall.position.set(0, 0.55, -12);
landlordEstate.add(rearWall);
for (const x of [-7.5, 7.5]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(9, 1.15, 0.4), estateWall);
  wall.position.set(x, 0.55, 12);
  landlordEstate.add(wall);
}
for (const x of [-12, 12]) {
  for (const z of [-6, 6]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.15, 12),
      estateWall,
    );
    wall.position.set(x, 0.55, z);
    landlordEstate.add(wall);
  }
  const gatePost = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 2, 0.55),
    lateriteMaterial,
  );
  gatePost.position.set(x, 1, 12);
  landlordEstate.add(gatePost);
}
for (const x of [-9, -6, -3, 3, 6, 9]) {
  const fencePost = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.84, 0.18),
    woodMaterial,
  );
  fencePost.position.set(x, 0.43, 12);
  landlordEstate.add(fencePost);
}
for (const x of [-7.5, 7.5]) {
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.12, 0.14),
    woodMaterial,
  );
  rail.position.set(x, 0.68, 12);
  landlordEstate.add(rail);
}
landlordEstate.position.set(
  landlordEstateSite[0],
  terrainHeight(...landlordEstateSite),
  landlordEstateSite[1],
);
landlordEstate.rotation.y = estateRotation;
scene.add(landlordEstate);
cottages.push(landlordEstate);

const cartWood = new THREE.MeshStandardMaterial({
  color: "#775333",
  roughness: 1,
});
const cartTrim = new THREE.MeshStandardMaterial({
  color: "#a27a48",
  roughness: 0.9,
});
const marketAwning = ["#a74f37", "#d2b778", "#4f7560"].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 1 }),
);
const marketStalls: THREE.Group[] = [];
for (const [stallIndex, [x, z, rotation]] of marketSites.entries()) {
  const stall = new THREE.Group();
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, 0.84, 1.15),
    cartWood,
  );
  counter.position.y = 0.63;
  counter.castShadow = true;
  stall.add(counter);
  const counterTop = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.14, 1.28),
    cartTrim,
  );
  counterTop.position.y = 1.1;
  stall.add(counterTop);
  for (const postX of [-1.17, 1.17]) {
    for (const postZ of [-0.48, 0.48]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 2.35, 6),
        woodMaterial,
      );
      post.position.set(postX, 1.35, postZ);
      post.castShadow = true;
      stall.add(post);
    }
  }
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(2.95, 0.14, 1.85),
    marketAwning[stallIndex % marketAwning.length],
  );
  canopy.position.set(0, 2.55, 0);
  canopy.castShadow = true;
  stall.add(canopy);
  for (let stripe = -2; stripe <= 2; stripe++) {
    const awningEdge = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.3, 0.08),
      marketAwning[(stallIndex + stripe + 5) % marketAwning.length],
    );
    awningEdge.position.set(stripe * 0.48, 2.35, -0.92);
    stall.add(awningEdge);
  }
  const produceColors = ["#b95638", "#d2a746", "#708f48", "#bd7448"];
  for (let item = 0; item < 6; item++) {
    const produce = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 7, 6),
      new THREE.MeshStandardMaterial({
        color: produceColors[(item + stallIndex) % produceColors.length],
        roughness: 0.8,
      }),
    );
    produce.scale.set(1, 0.78, 0.85);
    produce.position.set(
      -0.88 + (item % 3) * 0.48,
      1.34,
      -0.27 + Math.floor(item / 3) * 0.46,
    );
    stall.add(produce);
  }
  stall.position.set(x, terrainHeight(x, z), z);
  const lane = closestRoad(x, z);
  stall.rotation.y = lane ? shopFacing(x, z, lane) : rotation;
  scene.add(stall);
  marketStalls.push(stall);
}

const wheelWood = new THREE.MeshStandardMaterial({
  color: "#60452e",
  roughness: 1,
});
const horseCoats = ["#79553b", "#a4774d", "#574438"];
type RoadVehicle = {
  group: THREE.Group;
  cargo: THREE.Mesh[];
  wheels: THREE.Group[];
  horseLegs: THREE.Group[];
  horse: THREE.Group;
  route: THREE.CatmullRomCurve3;
  start: number;
  speed: number;
  walker: Walker;
  forward: boolean;
  wait: number;
  stride: number;
  parked: boolean;
  delivery?: FarmDelivery;
  farm?: readonly [number, number];
  market?: readonly [number, number];
  produce?: THREE.Group;
};
const vehicles: RoadVehicle[] = [];
const createHorseCart = (
  route: THREE.CatmullRomCurve3,
  start: number,
  speed: number,
  clothColor: string,
  coatColor: string,
): RoadVehicle => {
  const cart = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({
    color: clothColor,
    roughness: 1,
    flatShading: true,
  });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.38, 1.9), cartWood);
  bed.position.set(0, 1.12, 0.45);
  bed.castShadow = true;
  cart.add(bed);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.1, 1.8), cartTrim);
  floor.position.set(0, 1.35, 0.45);
  cart.add(floor);
  for (const x of [-0.76, 0.76]) {
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.72, 1.82),
      cartWood,
    );
    side.position.set(x, 1.62, 0.45);
    side.castShadow = true;
    cart.add(side);
  }
  for (const z of [-0.45, 1.35]) {
    const end = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 0.72, 0.12),
      cartWood,
    );
    end.position.set(0, 1.62, z);
    cart.add(end);
  }
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.66, 0.82), cloth);
  cargo.position.set(0, 1.73, 0.42);
  cargo.rotation.y = 0.16;
  cargo.castShadow = true;
  cart.add(cargo);
  const cargoTie = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.08, 0.88),
    cartTrim,
  );
  cargoTie.position.set(0, 2.08, 0.42);
  cart.add(cargoTie);

  const wheels: THREE.Group[] = [];
  for (const x of [-0.98, 0.98]) {
    const wheel = new THREE.Group();
    wheel.position.set(x, 0.83, 0.48);
    wheel.rotation.y = Math.PI / 2;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.09, 7, 18),
      wheelWood,
    );
    wheel.add(rim);
    for (let spoke = 0; spoke < 8; spoke++) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 1.15, 0.1),
        cartTrim,
      );
      bar.rotation.z = (spoke / 8) * Math.PI;
      wheel.add(bar);
    }
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8),
      cartTrim,
    );
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    cart.add(wheel);
    wheels.push(wheel);
  }
  const horse = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({
    color: coatColor,
    roughness: 0.9,
    flatShading: true,
  });
  const maneMaterial = new THREE.MeshStandardMaterial({
    color: "#49362b",
    roughness: 1,
  });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), coat);
  torso.scale.set(0.72, 0.82, 1.48);
  torso.position.set(0, 1.12, -2.18);
  torso.castShadow = true;
  horse.add(torso);
  const neck = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.21, 0.48, 3, 7),
    coat,
  );
  neck.position.set(0, 1.48, -2.82);
  neck.rotation.x = -0.45;
  neck.castShadow = true;
  horse.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 9, 7), coat);
  head.scale.set(0.82, 1.12, 1.25);
  head.position.set(0, 1.75, -3.13);
  horse.add(head);
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#b88e70", roughness: 1 }),
  );
  muzzle.position.set(0, 1.62, -3.42);
  horse.add(muzzle);
  const mane = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.12, 0.45, 3, 5),
    maneMaterial,
  );
  mane.position.set(0, 1.62, -2.83);
  mane.rotation.x = -0.55;
  horse.add(mane);
  const ears: THREE.Mesh[] = [];
  for (const x of [-0.15, 0.15]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.3, 5), coat);
    ear.position.set(x, 2.06, -3.11);
    horse.add(ear);
    ears.push(ear);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 5),
      windowMaterial,
    );
    eye.position.set(x * 1.5, 1.83, -3.28);
    horse.add(eye);
  }
  const horseLegs: THREE.Group[] = [];
  const hoofMaterial = new THREE.MeshStandardMaterial({
    color: "#392f28",
    roughness: 1,
  });
  for (const x of [-0.27, 0.27]) {
    for (const z of [-2.64, -1.72]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.78, z);
      const shin = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.72, 0.16),
        coat,
      );
      shin.position.y = -0.35;
      leg.add(shin);
      const hoof = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.16, 0.23),
        hoofMaterial,
      );
      hoof.position.set(0, -0.72, -0.015);
      leg.add(hoof);
      horse.add(leg);
      horseLegs.push(leg);
    }
  }
  cart.add(horse);
  for (const x of [-0.56, 0.56]) {
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 2.55),
      cartWood,
    );
    shaft.position.set(x, 0.72, -1.25);
    cart.add(shaft);
    const rein = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.045, 1.2),
      cartTrim,
    );
    rein.position.set(x * 0.7, 1.22, -2.55);
    cart.add(rein);
  }
  scene.add(cart);
  const point = route.getPointAt(start);
  cart.position.set(point.x, terrainHeight(point.x, point.z), point.z);
  const vehicle: RoadVehicle = {
    group: cart,
    cargo: [cargo, cargoTie],
    wheels,
    horseLegs,
    horse,
    route,
    start,
    speed,
    walker: {
      x: point.x,
      z: point.z,
      path: route
        .getSpacedPoints(100)
        .slice(Math.floor(start * 100))
        .map((p) => [p.x, p.z] as const),
      waypoint: 0,
    },
    forward: true,
    wait: 0,
    stride: 0,
    parked: false,
  };
  vehicles.push(vehicle);
  return vehicle;
};
createHorseCart(roadCurves[0], 0.43, 0.009, "#b4874f", horseCoats[0]);
createHorseCart(roadCurves[2], 0.47, 0.007, "#8a6343", horseCoats[1]);
vehicles.forEach((vehicle, index) => {
  vehicle.delivery = createFarmDelivery();
  vehicle.farm = index === 0 ? [-42, 30.5] : [-33, 24];
  vehicle.market = index === 0 ? [0, -25.4] : [17, -25];
  vehicle.walker = {
    x: vehicle.farm[0],
    z: vehicle.farm[1],
    path: [],
    waypoint: 0,
  };
  vehicle.group.position.set(
    vehicle.farm[0],
    terrainHeight(...vehicle.farm),
    vehicle.farm[1],
  );
  vehicle.cargo.forEach((cargo) => (cargo.visible = false));
  const produce = new THREE.Group();
  vehicle.produce = produce;
  vehicle.group.add(produce);
  for (let basket = 0; basket < 4; basket++) {
    const x = basket % 2 === 0 ? -0.37 : 0.37,
      z = basket < 2 ? 0 : 0.85;
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.57, 0.35, 0.62),
      cartWood,
    );
    crate.position.set(x, 1.58, z);
    produce.add(crate);
    for (let item = 0; item < 4; item++) {
      if (basket === 0) {
        const banana = makeBanana();
        banana.scale.setScalar(0.7);
        banana.position.set(
          x + ((item % 2) - 0.5) * 0.2,
          1.83,
          z + Math.floor(item / 2) * 0.18,
        );
        produce.add(banana);
      } else {
        const vegetable = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 10, 8),
          new THREE.MeshStandardMaterial({
            color:
              basket === 1 ? "#654766" : basket === 2 ? "#779448" : "#b98640",
            roughness: 0.8,
          }),
        );
        vegetable.scale.y = basket === 2 ? 2.2 : 1;
        vegetable.position.set(
          x + ((item % 2) - 0.5) * 0.2,
          1.86,
          z + Math.floor(item / 2) * 0.18,
        );
        produce.add(vegetable);
      }
    }
  }
});
const landlordCart = createHorseCart(
  landlordCartRoute,
  0,
  0,
  "#9b7646",
  horseCoats[2],
);
landlordCart.group.visible = false;

const villagerMaterials = [
  "#a96950",
  "#647f70",
  "#9b865b",
  "#816b8c",
  "#527b82",
].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.9,
      flatShading: true,
    }),
);
const villagerSkinMaterial = new THREE.MeshStandardMaterial({
  color: "#e5b991",
  roughness: 0.9,
});
const villagerDhotiMaterial = new THREE.MeshStandardMaterial({
  color: "#e2d6b7",
  roughness: 1,
  flatShading: true,
});
const villagerSariMaterials = ["#a85e48", "#607553", "#9b7954", "#80657a"].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      flatShading: true,
    }),
);
const villagerHairMaterial = new THREE.MeshStandardMaterial({
  color: "#49372c",
  roughness: 1,
});
type VillageActivity =
  | "home"
  | "market"
  | "fields"
  | "kalari"
  | "village"
  | "temple";
const villageDestinations: {
  activity: VillageActivity;
  position: [number, number];
  pause: number;
}[] = [
  { activity: "market", position: [2, -28], pause: 11 },
  { activity: "fields", position: [-42, 28], pause: 8 },
  { activity: "kalari", position: [9, -5.7], pause: 10 },
  { activity: "village", position: [31, -30], pause: 8 },
  {
    activity: "temple",
    position: [templeSite[0], templeSite[1] + 5],
    pause: 12,
  },
];
type Villager = {
  group: THREE.Group;
  name: string;
  home: readonly [number, number];
  walker: Walker;
  destination: VillageActivity;
  destinationIndex: number;
  wait: number;
  stepPhase: number;
  speed: number;
  arms: THREE.Group[];
  legs: THREE.Group[];
  greeting: boolean;
  chatUntil?: number;
  chatPartner?: number;
  nextChat?: number;
  greetingUntil?: number;
  nextGreeting?: number;
};
const villagers: Villager[] = [];
const villagerNames = [
  "Asha",
  "Nila",
  "Ravi",
  "Balan",
  "Unni",
  "Lakshmi",
  "Kannan",
  "Meera",
  "Appu",
  "Radha",
  "Kavi",
  "Leela",
  ...scatteredHomes.flatMap((_home, index) => [
    ["Devaki", "Parvathi", "Sreedevi", "Valli", "Sumathi"][index % 5],
    ["Gopalan", "Madhavan", "Soman", "Kesavan", "Narayanan"][index % 5],
  ]),
];
const villageHomes = buildingSites
  .map((site, index) => cottageDoorstep(site, backyardPlans[index].rotation))
  .filter(([x, z]) => distanceToRoad(x, z) < 10);
for (let i = 0; i < villagerNames.length; i++) {
  const group = new THREE.Group();
  const isWoman = [0, 1, 5, 7, 9, 11].includes(i) || (i >= 12 && i % 2 === 0);
  const clothing = villagerMaterials[i % villagerMaterials.length];
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 0.53, 3, 7),
    isWoman
      ? villagerSariMaterials[i % villagerSariMaterials.length]
      : clothing,
  );
  body.position.y = 0.83;
  body.scale.y = 0.8;
  body.castShadow = true;
  group.add(body);
  const lowerWrap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.34, isWoman ? 0.95 : 0.62, 9),
    isWoman
      ? villagerSariMaterials[i % villagerSariMaterials.length]
      : villagerDhotiMaterial,
  );
  lowerWrap.position.y = isWoman ? 0.57 : 0.42;
  lowerWrap.castShadow = true;
  group.add(lowerWrap);
  if (isWoman) {
    const pallu = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 1.05, 0.1),
      villagerSariMaterials[i % villagerSariMaterials.length],
    );
    pallu.position.set(-0.2, 1.02, 0.17);
    pallu.rotation.z = -0.28;
    group.add(pallu);
    const hairBun = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 7, 5),
      villagerHairMaterial,
    );
    hairBun.position.set(0, 1.38, 0.17);
    group.add(hairBun);
  }
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 10, 8),
    villagerSkinMaterial,
  );
  head.position.y = 1.19;
  head.castShadow = true;
  group.add(head);
  for (const eyeX of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 6, 5),
      eyeMaterial,
    );
    eye.position.set(eyeX, 1.22, -0.19);
    group.add(eye);
  }
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 6, 5),
    villagerSkinMaterial,
  );
  nose.position.set(0, 1.17, -0.21);
  group.add(nose);
  if (!isWoman) {
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.26, 0.19, 8),
      new THREE.MeshStandardMaterial({
        color: i % 2 ? "#a58a61" : "#59634d",
        roughness: 1,
      }),
    );
    hat.position.y = 1.38;
    group.add(hat);
  }
  if (!isWoman) {
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.37, 0.18),
      woodMaterial,
    );
    pack.position.set(0, 0.72, 0.27);
    group.add(pack);
  }
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 1.03, -0.02);
    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.37, 3, 6),
      isWoman
        ? villagerSariMaterials[i % villagerSariMaterials.length]
        : clothing,
    );
    sleeve.position.set(-side * 0.035, -0.22, -0.025);
    sleeve.rotation.z = side * -0.12;
    arm.add(sleeve);
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 7, 5),
      villagerSkinMaterial,
    );
    hand.position.set(-side * 0.04, -0.43, -0.08);
    arm.add(hand);
    group.add(arm);
    arms.push(arm);
  }
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.44, 0.04);
    const shin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.34, 3, 6),
      isWoman
        ? villagerSariMaterials[i % villagerSariMaterials.length]
        : villagerDhotiMaterial,
    );
    shin.position.y = -0.17;
    leg.add(shin);
    const sandal = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.11, 0.31),
      woodMaterial,
    );
    sandal.position.set(0, -0.39, -0.055);
    leg.add(sandal);
    group.add(leg);
    legs.push(leg);
  }
  scene.add(group);
  const home =
    i >= 12
      ? scatteredHomes[Math.floor((i - 12) / 2)].doorstep
      : villageHomes[i % villageHomes.length];
  group.position.set(home[0], terrainHeight(home[0], home[1]), home[1]);
  villagers.push({
    group,
    name: villagerNames[i],
    home,
    walker: { x: home[0], z: home[1], path: [], waypoint: 0 },
    destination: "home",
    destinationIndex: i % villageDestinations.length,
    wait: 2 + (i % 4) * 2,
    stepPhase: i * 0.8,
    speed: 0.95 + (i % 4) * 0.13,
    arms,
    legs,
    greeting: false,
  });
}

const sendVillagerTo = (
  villager: Villager,
  activity: VillageActivity,
  position: readonly [number, number],
) => {
  const homestead = scatteredHomes.find(
    (home) => home.doorstep === villager.home,
  );
  const leavingHome =
    homestead &&
    Math.hypot(
      villager.walker.x - villager.home[0],
      villager.walker.z - villager.home[1],
    ) < 0.5;
  const start = leavingHome
    ? homestead.lane
    : [villager.walker.x, villager.walker.z];
  const target = activity === "home" && homestead ? homestead.lane : position;
  const path = villagePaths.findPath(start[0], start[1], target[0], target[1]);
  if (leavingHome) path.unshift(homestead.lane);
  if (path.length === 0) {
    villager.wait = 8;
    return;
  }
  if (activity === "home") {
    if (homestead) path.push(homestead.lane);
    path.push([
      position[0] + (villagers.indexOf(villager) % 2 === 0 ? -0.42 : 0.42),
      position[1],
    ]);
  } else {
    const slot = villagers.indexOf(villager) % 6;
    const gathering = findGatheringSpot(
      position,
      slot,
      (x, z) =>
        distanceToRoad(x, z) > 2.8 &&
        !getWaterInfo(x, z) &&
        !worldSolids.some((solid) => insideSolid(solid, x, z, 0.4)) &&
        !isInsidePaddyReserve(x, z, 0.3) &&
        villagers.every(
          (other) =>
            other === villager ||
            other.walker.path.length > 0 ||
            Math.hypot(other.walker.x - x, other.walker.z - z) > 0.75,
        ),
    );
    path.push(gathering);
  }
  villager.destination = activity;
  villager.walker.path = path;
  villager.walker.waypoint = 0;
};

const kalari = new THREE.Group();
const kalariEarth = new THREE.MeshStandardMaterial({
  color: "#944f32",
  roughness: 1,
});
const kalariLaterite = new THREE.MeshStandardMaterial({
  color: "#894b39",
  roughness: 1,
  flatShading: true,
});
const kalariThatch = new THREE.MeshStandardMaterial({
  color: "#9b804a",
  roughness: 1,
  side: THREE.DoubleSide,
});
const kalariFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(10.2, 7.6, 12, 10),
  kalariEarth,
);
kalariFloor.rotation.x = -Math.PI / 2;
kalariFloor.position.y = 0.1;
kalariFloor.receiveShadow = true;
kalari.add(kalariFloor);
for (const [x, z, width, depth] of [
  [0, -3.95, 10.8, 0.35],
  [0, 3.95, 10.8, 0.35],
  [5.2, 0, 0.35, 7.7],
  [-5.2, -2.35, 0.35, 3],
  [-5.2, 2.35, 0.35, 3],
]) {
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.48, depth),
    kalariLaterite,
  );
  edge.position.set(x, 0.22, z);
  edge.castShadow = true;
  kalari.add(edge);
}
const kalariEntrance = new THREE.Mesh(
  new THREE.BoxGeometry(1.7, 0.1, 2.2),
  kalariEarth,
);
kalariEntrance.position.set(-5.65, 0.09, 0);
kalari.add(kalariEntrance);
const kalariSignCanvas = document.createElement("canvas");
kalariSignCanvas.width = 256;
kalariSignCanvas.height = 96;
const kalariSignContext = kalariSignCanvas.getContext("2d")!;
kalariSignContext.fillStyle = "#61452d";
kalariSignContext.fillRect(0, 0, 256, 96);
kalariSignContext.strokeStyle = "#d4b989";
kalariSignContext.lineWidth = 3;
kalariSignContext.strokeRect(5, 5, 246, 86);
kalariSignContext.fillStyle = "#f2dfb6";
kalariSignContext.textAlign = "center";
kalariSignContext.textBaseline = "middle";
kalariSignContext.font = "bold 52px system-ui, sans-serif";
kalariSignContext.fillText("കളരി", 128, 50);
const kalariSignTexture = new THREE.CanvasTexture(kalariSignCanvas);
kalariSignTexture.colorSpace = THREE.SRGBColorSpace;
const kalariSign = new THREE.Mesh(
  new THREE.PlaneGeometry(1.8, 0.67),
  new THREE.MeshBasicMaterial({
    map: kalariSignTexture,
    side: THREE.DoubleSide,
  }),
);
kalariSign.position.set(-5.37, 1.5, -2.1);
kalariSign.rotation.y = -Math.PI / 2;
kalari.add(kalariSign);
translatedBoards.push({
  object: kalariSign,
  english: "Kalari — traditional martial arts school",
});
for (const [x, z] of [
  [-4.45, -3.2],
  [4.45, -3.2],
  [-4.45, 3.2],
  [4.45, 3.2],
]) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.14, 3.1, 7),
    woodMaterial,
  );
  post.position.set(x, 1.65, z);
  post.castShadow = true;
  kalari.add(post);
}
for (const [x, angle] of [
  [-1.6, -0.15],
  [1.6, 0.15],
]) {
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 7.6), kalariThatch);
  roof.rotation.set(-Math.PI / 2, 0, angle);
  roof.position.set(x, 3.27, 0);
  kalari.add(roof);
}
const trainingPost = new THREE.Mesh(
  new THREE.CylinderGeometry(0.15, 0.2, 2.2, 7),
  woodMaterial,
);
trainingPost.position.set(3.9, 1.2, 2.8);
trainingPost.castShadow = true;
kalari.add(trainingPost);
const postPad = new THREE.Mesh(
  new THREE.CylinderGeometry(0.21, 0.23, 0.75, 8),
  new THREE.MeshStandardMaterial({ color: "#ab895e", roughness: 1 }),
);
postPad.position.set(3.9, 1.45, 2.8);
kalari.add(postPad);
const lampBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.17, 0.24, 0.15, 8),
  new THREE.MeshStandardMaterial({
    color: "#80653f",
    metalness: 0.3,
    roughness: 0.7,
  }),
);
lampBase.position.set(4.5, 0.22, -3.1);
kalari.add(lampBase);
const kalariLamp = new THREE.PointLight("#ffc17d", 0, 9, 2);
kalariLamp.position.set(4.5, 0.8, -3.1);
kalari.add(kalariLamp);
villageLamps.push(kalariLamp);
kalari.position.set(kalariSite[0], terrainHeight(...kalariSite), kalariSite[1]);
scene.add(kalari);

const procession = new THREE.Group();
const nobleCloth = new THREE.MeshStandardMaterial({
  color: "#eee1bd",
  roughness: 0.9,
  flatShading: true,
});
const nobleTrim = new THREE.MeshStandardMaterial({
  color: "#aa8648",
  roughness: 0.8,
  metalness: 0.12,
});
const guardCloth = new THREE.MeshStandardMaterial({
  color: "#465b43",
  roughness: 0.95,
  flatShading: true,
});
const periodHairMaterial = new THREE.MeshStandardMaterial({
  color: "#49372c",
  roughness: 1,
});
const periodEyeMaterial = new THREE.MeshStandardMaterial({
  color: "#302820",
  roughness: 0.75,
});
const createPeriodFigure = (
  coatMaterial: THREE.Material,
  wearsDrape = false,
) => {
  const figure = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.58, 4, 8),
    coatMaterial,
  );
  torso.position.y = 0.98;
  torso.castShadow = true;
  figure.add(torso);
  const mundu = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.43, 0.8, 8),
    nobleCloth,
  );
  mundu.position.y = 0.48;
  mundu.castShadow = true;
  figure.add(mundu);
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 9, 7),
    farmerSkinMaterial,
  );
  face.position.y = 1.57;
  face.castShadow = true;
  figure.add(face);
  for (const eyeX of [-0.085, 0.085]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.027, 6, 5),
      periodEyeMaterial,
    );
    eye.position.set(eyeX, 1.61, -0.205);
    figure.add(eye);
  }
  for (const side of [-1, 1]) {
    const moustache = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 7, 5),
      periodHairMaterial,
    );
    moustache.scale.set(1.15, 0.42, 0.55);
    moustache.position.set(side * 0.07, 1.49, -0.214);
    moustache.rotation.z = side * -0.12;
    figure.add(moustache);
  }
  const turban = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 8, 6),
    wearsDrape ? guardCloth : nobleCloth,
  );
  turban.scale.set(1, 0.52, 1);
  turban.position.y = 1.77;
  figure.add(turban);
  if (wearsDrape) {
    const sash = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.92, 0.52),
      nobleTrim,
    );
    sash.position.set(0.14, 1.03, -0.02);
    sash.rotation.z = -0.38;
    figure.add(sash);
  }
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.29, 1.28, 0);
    const sleeve = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.39, 3, 6),
      coatMaterial,
    );
    sleeve.position.y = -0.24;
    sleeve.rotation.z = side * -0.12;
    arm.add(sleeve);
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 7, 5),
      farmerSkinMaterial,
    );
    hand.position.set(0, -0.48, -0.02);
    arm.add(hand);
    figure.add(arm);
    arms.push(arm);
  }
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, 0.43, 0.02);
    const lowerLeg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.095, 0.32, 3, 6),
      coatMaterial,
    );
    lowerLeg.position.y = -0.16;
    leg.add(lowerLeg);
    const foot = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.11, 0.3),
      woodMaterial,
    );
    foot.position.set(0, -0.38, -0.055);
    leg.add(foot);
    figure.add(leg);
    legs.push(leg);
  }
  return { figure, arms, legs };
};
const kalariFigures = [-2.4, 0, 2.4].map((x, index) => {
  const practitioner = createPeriodFigure(farmerSkinMaterial, false);
  practitioner.figure.position.set(x, 0.1, index === 1 ? -0.5 : 0.35);
  practitioner.figure.rotation.y = index === 2 ? -0.25 : 0.25;
  practitioner.figure.scale.setScalar(index === 1 ? 0.95 : 0.9);
  kalari.add(practitioner.figure);
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.85, 0.035),
    new THREE.MeshStandardMaterial({
      color: "#bcc5be",
      metalness: 0.65,
      roughness: 0.35,
    }),
  );
  blade.position.y = 0.45;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.16, 4),
    blade.material,
  );
  tip.position.y = 0.95;
  const hilt = new THREE.Mesh(
    new THREE.BoxGeometry(0.25, 0.05, 0.08),
    nobleTrim,
  );
  sword.add(blade, tip, hilt);
  sword.position.set(0, -0.48, -0.08);
  sword.rotation.x = -Math.PI / 2;
  practitioner.arms[1].add(sword);
  const buckler = new THREE.Group();
  const shield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.07, 16),
    new THREE.MeshStandardMaterial({
      color: "#594835",
      metalness: 0.3,
      roughness: 0.65,
    }),
  );
  shield.rotation.x = Math.PI / 2;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), nobleTrim);
  boss.scale.z = 0.55;
  boss.position.z = -0.07;
  buckler.add(shield, boss);
  buckler.position.set(0, -0.4, -0.12);
  practitioner.arms[0].add(buckler);
  practitioner.figure.rotation.y =
    index === 0 ? -Math.PI / 2 : index === 2 ? Math.PI / 2 : 0;
  return practitioner;
});
const coconutHarvesters = harvestPalms.map((palm, index) => {
  const person = createPeriodFigure(farmerSkinMaterial, false);
  person.figure.scale.setScalar(0.9);
  scene.add(person.figure);
  const carriedNut = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    coconutMaterial,
  );
  carriedNut.position.set(0, -0.48, -0.08);
  carriedNut.visible = false;
  person.arms[1].add(carriedNut);
  const groundNut = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 8, 6),
    coconutMaterial,
  );
  for (const [x, z] of [
    [0.4, 0],
    [0, 0.4],
    [0.38, 0.36],
  ]) {
    const fallen = new THREE.Mesh(groundNut.geometry, coconutMaterial);
    fallen.position.set(x, 0, z);
    groundNut.add(fallen);
  }
  groundNut.position.set(
    palm.group.position.x + 0.8,
    palm.groundY + 0.23,
    palm.group.position.z + 0.3,
  );
  groundNut.visible = false;
  scene.add(groundNut);
  person.figure.position.set(
    palm.group.position.x + 2.6,
    palm.groundY,
    palm.group.position.z + 0.35,
  );
  const sack = new THREE.Group();
  const bag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.38, 0.75, 9),
    new THREE.MeshStandardMaterial({ color: "#b29561", roughness: 1 }),
  );
  bag.position.y = 0.35;
  sack.add(bag);
  for (let nut = 0; nut < 4; nut++) {
    const coconut = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 7, 6),
      coconutMaterial,
    );
    coconut.position.set(
      (nut % 2 ? 1 : -1) * 0.13,
      0.73,
      (nut < 2 ? 1 : -1) * 0.12,
    );
    sack.add(coconut);
  }
  sack.position.set(0.45, 0.4, 0.15);
  sack.visible = false;
  person.figure.add(sack);
  // Both workers begin on the ground, with staggered starts to their routines.
  return {
    palm,
    person,
    carriedNut,
    groundNut,
    sack,
    offset: index * 2,
    workTime: 0,
    delivery: "harvest" as "harvest" | "market" | "sell" | "return" | "home",
    wait: 0,
    sold: 0,
    walker: {
      x: person.figure.position.x,
      z: person.figure.position.z,
      path: [],
      waypoint: 0,
    } as Walker,
    stride: 0,
    home: villageHomes[(index + 6) % villageHomes.length],
  };
});
const marketCoconuts = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.19, 7, 6),
  coconutMaterial,
  24,
);
marketCoconuts.count = 0;
scene.add(marketCoconuts);
let coconutSales = 0;
for (const [index, vehicle] of vehicles.entries()) {
  const driver = createPeriodFigure(
    villagerMaterials[index % villagerMaterials.length],
    false,
  );
  driver.figure.position.set(0, 1.06, -0.55);
  driver.figure.position.y = 1.35;
  driver.legs.forEach((leg) => (leg.rotation.x = -1.25));
  driver.arms.forEach((arm) => {
    arm.rotation.x = 0.8;
    arm.rotation.z *= 0.35;
  });
  vehicle.group.add(driver.figure);
}
const lordActor = createPeriodFigure(nobleCloth, true);
lordActor.figure.position.x = -0.65;
procession.add(lordActor.figure);
const landlordRider = createPeriodFigure(nobleCloth, true);
landlordRider.figure.position.set(0, 1.18, 0.48);
landlordCart.group.add(landlordRider.figure);
const guardActor = createPeriodFigure(guardCloth);
guardActor.figure.position.x = 0.3;
guardActor.arms[0].rotation.x = 0.6;
procession.add(guardActor.figure);
const escortActors: ReturnType<typeof createPeriodFigure>[] = [];
for (const [index, x] of [-0.95, 0.95].entries()) {
  const escort = createPeriodFigure(guardCloth);
  escort.figure.position.set(x, 0, 1.8);
  escort.figure.rotation.y = index === 0 ? 0.12 : -0.12;
  procession.add(escort.figure);
  escortActors.push(escort);
}
const ridingGuard = createPeriodFigure(guardCloth);
ridingGuard.figure.position.set(-0.58, 1.18, 0.52);
ridingGuard.figure.visible = false;
landlordCart.group.add(ridingGuard.figure);

const parasol = new THREE.Group();
const parasolCenter = new THREE.Vector3(-0.15, 3.62, 0.02);
const parasolStaff = new THREE.Mesh(
  new THREE.CylinderGeometry(0.045, 0.065, 2.74, 7),
  woodMaterial,
);
parasolStaff.position.set(parasolCenter.x, 2.61, parasolCenter.z);
parasol.add(parasolStaff);
const parasolRadius = 1.34;
const canopyVertices: number[] = [];
const canopyColors: number[] = [];
const canopyIndices: number[] = [];
const canopyRings = 7;
const canopySectors = 24;
const palmLeafShades = [
  new THREE.Color("#77734a"),
  new THREE.Color("#918759"),
  new THREE.Color("#666b43"),
  new THREE.Color("#a39461"),
];
for (let ring = 0; ring <= canopyRings; ring++) {
  const radius = (ring / canopyRings) * parasolRadius;
  for (let sector = 0; sector <= canopySectors; sector++) {
    const angle = (sector / canopySectors) * Math.PI * 2;
    const scallop = ring === canopyRings ? Math.cos(angle * 12) * 0.035 : 0;
    const y =
      parasolCenter.y + 0.3 * (1 - (radius / parasolRadius) ** 2) + scallop;
    canopyVertices.push(
      parasolCenter.x + Math.cos(angle) * radius,
      y,
      parasolCenter.z + Math.sin(angle) * radius,
    );
    const shade =
      palmLeafShades[
        Math.floor((sector % canopySectors) / 3) % palmLeafShades.length
      ];
    canopyColors.push(shade.r, shade.g, shade.b);
  }
}
for (let ring = 0; ring < canopyRings; ring++) {
  for (let sector = 0; sector < canopySectors; sector++) {
    const a = ring * (canopySectors + 1) + sector;
    const b = a + canopySectors + 1;
    canopyIndices.push(a, b, a + 1, b, b + 1, a + 1);
  }
}
const palmUmbrellaGeometry = new THREE.BufferGeometry();
palmUmbrellaGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(canopyVertices, 3),
);
palmUmbrellaGeometry.setAttribute(
  "color",
  new THREE.Float32BufferAttribute(canopyColors, 3),
);
palmUmbrellaGeometry.setIndex(canopyIndices);
palmUmbrellaGeometry.computeVertexNormals();
const parasolCanopy = new THREE.Mesh(
  palmUmbrellaGeometry,
  new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    side: THREE.DoubleSide,
  }),
);
parasolCanopy.castShadow = true;
parasol.add(parasolCanopy);
const parasolRim = new THREE.Mesh(
  new THREE.TorusGeometry(parasolRadius, 0.035, 5, 32),
  new THREE.MeshStandardMaterial({ color: "#66543a", roughness: 1 }),
);
parasolRim.rotation.x = Math.PI / 2;
parasolRim.position.set(parasolCenter.x, parasolCenter.y, parasolCenter.z);
parasol.add(parasolRim);
for (let ribIndex = 0; ribIndex < 16; ribIndex++) {
  const angle = (ribIndex / 16) * Math.PI * 2;
  const ribCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(parasolCenter.x, parasolCenter.y + 0.3, parasolCenter.z),
    new THREE.Vector3(
      parasolCenter.x + Math.cos(angle) * 0.68,
      parasolCenter.y + 0.22,
      parasolCenter.z + Math.sin(angle) * 0.68,
    ),
    new THREE.Vector3(
      parasolCenter.x + Math.cos(angle) * parasolRadius,
      parasolCenter.y + Math.cos(angle * 12) * 0.035,
      parasolCenter.z + Math.sin(angle) * parasolRadius,
    ),
  ]);
  const rib = new THREE.Mesh(
    new THREE.TubeGeometry(ribCurve, 8, 0.018, 4, false),
    cartTrim,
  );
  parasol.add(rib);
  const leafTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.58, 5),
    new THREE.MeshStandardMaterial({
      color: palmLeafShades[ribIndex % palmLeafShades.length],
      roughness: 1,
    }),
  );
  leafTip.position.set(
    parasolCenter.x + Math.cos(angle) * (parasolRadius - 0.12),
    parasolCenter.y - 0.15,
    parasolCenter.z + Math.sin(angle) * (parasolRadius - 0.12),
  );
  leafTip.scale.set(0.42, 1, 1.25);
  leafTip.rotation.z = -Math.PI / 2;
  leafTip.rotation.y = -angle;
  parasol.add(leafTip);
}
procession.add(parasol);
scene.add(procession);

// Estate household travels independently of the landlord's inspection party.
landlordCart.cargo.forEach((item) => (item.visible = false));
landlordCart.group.visible = true;
landlordRider.figure.visible = false;
const seatFigure = (person: ReturnType<typeof createPeriodFigure>) => {
  person.legs.forEach((leg) => (leg.rotation.x = -1.25));
  person.arms.forEach((arm) => (arm.rotation.x = 0.5));
};
for (const [index, x] of [-0.35, 0.35].entries()) {
  const relative = createPeriodFigure(
    index ? villagerSariMaterials[0] : nobleCloth,
    true,
  );
  if (index) {
    for (const child of [...relative.figure.children]) {
      if (
        child instanceof THREE.Mesh &&
        child.geometry instanceof THREE.SphereGeometry &&
        [0.075, 0.27].includes(child.geometry.parameters.radius)
      )
        relative.figure.remove(child);
      if (
        child instanceof THREE.Mesh &&
        child.geometry instanceof THREE.CylinderGeometry &&
        child.geometry.parameters.height === 0.8
      )
        child.material = villagerSariMaterials[0];
    }
    const bun = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 7, 5),
      periodHairMaterial,
    );
    bun.position.set(0, 1.73, 0.16);
    const pallu = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1, 0.1),
      villagerSariMaterials[0],
    );
    pallu.position.set(-0.22, 1.05, 0.16);
    relative.figure.add(bun, pallu);
  }
  relative.figure.position.set(x, 1.34, 0.7);
  relative.figure.scale.setScalar(0.82);
  seatFigure(relative);
  landlordCart.group.add(relative.figure);
}
const familyStops: InspectionStop[] = [
  inspectionStops[0],
  { ...inspectionStops[1], position: [templeSite[0], templeSite[1] + 5] },
  inspectionStops[3],
  inspectionStops[2],
];
const familyJourney = createInspection(familyStops[0].position);
const manchal = new THREE.Group();
const manchalSeat = new THREE.Mesh(
  new THREE.BoxGeometry(1.35, 0.24, 1.65),
  cartWood,
);
manchalSeat.position.y = 1.32;
manchal.add(manchalSeat);
for (const x of [-0.62, 0.62]) {
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 4.9),
    woodMaterial,
  );
  beam.position.set(x, 1.4, 0);
  manchal.add(beam);
  for (const z of [-0.75, 0.75]) {
    const support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 1.45, 5),
      nobleTrim,
    );
    support.position.set(x, 2.05, z);
    manchal.add(support);
  }
}
const manchalRoof = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.18, 1.95),
  nobleCloth,
);
manchalRoof.position.y = 2.8;
manchal.add(manchalRoof);
const elderRelative = createPeriodFigure(nobleCloth, true);
elderRelative.figure.position.set(0, 1.45, 0);
elderRelative.figure.scale.setScalar(0.75);
seatFigure(elderRelative);
manchal.add(elderRelative.figure);
const bearers = [-1.95, 1.95].flatMap((z) =>
  [-0.62, 0.62].map((x) => {
    const bearer = createPeriodFigure(guardCloth);
    bearer.figure.position.set(x, 0, z);
    bearer.arms.forEach((arm) => (arm.rotation.x = 1.6));
    manchal.add(bearer.figure);
    return bearer;
  }),
);
scene.add(manchal);
const manchalJourney = createInspection([65, -53]);
const manchalStops: InspectionStop[] = [
  {
    position: [65, -53],
    lookAt: landlordEstateSite,
    label: "Household visit",
    pause: 15,
  },
  { ...inspectionStops[1], position: [templeSite[0] + 2, templeSite[1] + 5] },
  inspectionStops[2],
  inspectionStops[3],
];

type AmbientAnimal = {
  group: THREE.Group;
  species:
    | "cow"
    | "deer"
    | "elephant"
    | "hen"
    | "duck"
    | "boar"
    | "tiger"
    | "monkey"
    | "wolf"
    | "rabbit";
  anchorX: number;
  anchorZ: number;
  phase: number;
  radius: number;
  speed: number;
  legs: THREE.Group[];
  head: THREE.Object3D;
  targetX: number;
  targetZ: number;
  waitUntil: number;
  surfaceY?: number;
  nightPatrol?: NightPatrol;
  startledUntil?: number;
};
const ambientAnimals: AmbientAnimal[] = [];
const isForestHabitat = createForestHabitat(distanceToRiver);
const cowCoat = new THREE.MeshStandardMaterial({
  color: "#e5ddc6",
  roughness: 1,
  flatShading: true,
});
const cowPatch = new THREE.MeshStandardMaterial({
  color: "#584336",
  roughness: 1,
  flatShading: true,
});
const deerCoat = new THREE.MeshStandardMaterial({
  color: "#906545",
  roughness: 1,
  flatShading: true,
});
const deerLight = new THREE.MeshStandardMaterial({
  color: "#d3b38a",
  roughness: 1,
});
const animalHooves = new THREE.MeshStandardMaterial({
  color: "#473a2d",
  roughness: 1,
});
const makeAnimal = (
  species: "cow" | "deer",
  x: number,
  z: number,
  index: number,
) => {
  const group = new THREE.Group();
  const legs: THREE.Group[] = [];
  const cow = species === "cow";
  const coat = cow ? cowCoat : deerCoat;
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.58, 10, 8), coat);
  torso.scale.set(cow ? 0.88 : 0.67, cow ? 0.8 : 0.76, cow ? 1.3 : 1.12);
  torso.position.y = cow ? 0.98 : 1.04;
  torso.castShadow = true;
  group.add(torso);

  if (cow) {
    for (const [px, pz, scale] of [
      [-0.42, -0.14, 1],
      [0.35, 0.42, 0.8],
      [-0.28, 0.6, 0.65],
    ] as const) {
      const patch = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 7, 5),
        cowPatch,
      );
      patch.scale.set(0.8 * scale, 0.68 * scale, 0.35 * scale);
      patch.position.set(px, 1.17, pz);
      patch.rotation.z = px * 0.4;
      group.add(patch);
    }
  }

  const neck = new THREE.Mesh(
    new THREE.CapsuleGeometry(cow ? 0.22 : 0.16, cow ? 0.22 : 0.4, 3, 7),
    coat,
  );
  neck.position.set(0, cow ? 1.12 : 1.34, cow ? -0.72 : -0.68);
  neck.rotation.x = -0.32;
  group.add(neck);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(cow ? 0.28 : 0.23, 9, 7),
    coat,
  );
  head.scale.set(0.92, 0.9, 1.2);
  head.position.set(0, cow ? 1.31 : 1.63, cow ? -0.98 : -1.02);
  head.castShadow = true;
  group.add(head);
  if (cow) {
    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#a8806b", roughness: 1 }),
    );
    muzzle.position.set(0, 1.18, -1.28);
    group.add(muzzle);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, 0.28, 5),
        new THREE.MeshStandardMaterial({ color: "#d7c6a2", roughness: 1 }),
      );
      horn.position.set(side * 0.2, 1.57, -0.92);
      horn.rotation.z = side * -0.4;
      group.add(horn);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 5), cowPatch);
      ear.scale.set(1.7, 0.55, 0.65);
      ear.position.set(side * 0.32, 1.35, -0.9);
      group.add(ear);
    }
  } else {
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.34, 5),
      deerLight,
    );
    tail.position.set(0, 1.04, 0.88);
    tail.rotation.x = -Math.PI / 2;
    group.add(tail);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.34, 5),
        deerCoat,
      );
      ear.position.set(side * 0.18, 1.94, -1.04);
      ear.rotation.z = side * -0.65;
      group.add(ear);
      const antlerStem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.06, 0.56, 5),
        deerLight,
      );
      antlerStem.position.set(side * 0.18, 2.0, -0.98);
      antlerStem.rotation.z = side * -0.22;
      group.add(antlerStem);
      for (const branch of [-1, 1]) {
        const tine = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.04, 0.27, 4),
          deerLight,
        );
        tine.position.set(
          side * (0.25 + branch * 0.07),
          2.18 + branch * 0.06,
          -0.98,
        );
        tine.rotation.z = side * (branch > 0 ? -0.75 : 0.25);
        group.add(tine);
      }
    }
  }

  for (const legX of [-0.3, 0.3]) {
    for (const legZ of [-0.56, 0.57]) {
      const leg = new THREE.Group();
      leg.position.set(legX, 0.65, legZ);
      const length = cow ? 0.62 : 0.72;
      const shin = new THREE.Mesh(
        new THREE.BoxGeometry(cow ? 0.17 : 0.12, length, cow ? 0.18 : 0.13),
        coat,
      );
      shin.position.y = -length * 0.47;
      leg.add(shin);
      const hoof = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.13, 0.22),
        animalHooves,
      );
      hoof.position.set(0, -length * 0.94, -0.015);
      leg.add(hoof);
      group.add(leg);
      legs.push(leg);
    }
  }
  scene.add(group);
  group.scale.setScalar(cow ? 0.82 : 0.72);
  const radius = cow ? 5 : 10;
  const angle = random() * Math.PI * 2;
  const distance = random() * radius;
  group.position.set(x, terrainHeight(x, z), z);
  ambientAnimals.push({
    group,
    species,
    anchorX: x,
    anchorZ: z,
    phase: index * 1.34,
    radius,
    speed: cow ? 0.72 : 1.25,
    legs,
    head,
    targetX: x + Math.cos(angle) * distance,
    targetZ: z + Math.sin(angle) * distance,
    waitUntil: 0,
  });
};
const cattleSites = animalSites.slice(0, 3);
const deerSites = [
  [-60, -18],
  [-69, -32],
  [-78, 8],
  [-76, 31],
];
cattleSites.forEach(([x, z], index) => makeAnimal("cow", x, z, index));
deerSites.forEach(([x, z], index) =>
  makeAnimal("deer", x, z, index + cattleSites.length),
);
for (const [index, site] of [
  [-63, -60],
  [-79, -20],
].entries()) {
  makeAnimal("deer", site[0], site[1], index + 18);
}

const elephantCoat = new THREE.MeshStandardMaterial({
  color: "#77796d",
  roughness: 1,
  flatShading: true,
});
const elephantEarMaterial = new THREE.MeshStandardMaterial({
  color: "#8f8c7c",
  roughness: 1,
  flatShading: true,
});
const ivoryMaterial = new THREE.MeshStandardMaterial({
  color: "#e5d7b4",
  roughness: 0.75,
});
const createElephant = (x: number, z: number, index: number) => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), elephantCoat);
  body.scale.set(1.05, 1.16, 1.55);
  body.position.set(0, 1.65, 0.05);
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 10, 8),
    elephantCoat,
  );
  skull.scale.set(0.9, 1.05, 0.88);
  skull.position.set(0, 2.2, -1.02);
  skull.castShadow = true;
  head.add(skull);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 9, 7),
      elephantEarMaterial,
    );
    ear.scale.set(0.18, 0.83, 0.68);
    ear.position.set(side * 0.75, 2.25, -0.92);
    ear.rotation.z = side * -0.12;
    head.add(ear);
    const tusk = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.72, 7),
      ivoryMaterial,
    );
    tusk.position.set(side * 0.38, 1.88, -1.58);
    tusk.rotation.x = -Math.PI * 0.34;
    tusk.rotation.z = side * 0.22;
    head.add(tusk);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 7, 5),
      eyeMaterial,
    );
    eye.position.set(side * 0.53, 2.3, -1.56);
    head.add(eye);
  }
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.02, -1.48),
    new THREE.Vector3(0, 1.62, -1.75),
    new THREE.Vector3(0.06, 1.05, -1.91),
    new THREE.Vector3(0.12, 0.72, -1.75),
  ]);
  const trunk = new THREE.Mesh(
    new THREE.TubeGeometry(trunkCurve, 12, 0.19, 7, false),
    elephantCoat,
  );
  head.add(trunk);
  group.add(head);
  const legs: THREE.Group[] = [];
  for (const legX of [-0.62, 0.62]) {
    for (const legZ of [-0.96, 0.94]) {
      const leg = new THREE.Group();
      leg.position.set(legX, 0.98, legZ);
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.35, 1.04, 8),
        elephantCoat,
      );
      column.position.y = -0.42;
      column.castShadow = true;
      leg.add(column);
      const foot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.38, 0.2, 8),
        new THREE.MeshStandardMaterial({ color: "#66675d", roughness: 1 }),
      );
      foot.position.y = -0.94;
      leg.add(foot);
      group.add(leg);
      legs.push(leg);
    }
  }
  scene.add(group);
  group.position.set(x, terrainHeight(x, z), z);
  ambientAnimals.push({
    group,
    species: "elephant",
    anchorX: x,
    anchorZ: z,
    phase: index * 2.2,
    radius: 5.5,
    speed: 0.55,
    legs,
    head,
    targetX: x + 3,
    targetZ: z + 2,
    waitUntil: 0,
  });
};
createElephant(-64, -8, 0);
createElephant(-77, -46, 1);
for (const [index, [species, x, z]] of (
  [
    ["boar", -68, -45],
    ["tiger", -74, -62],
    ["monkey", -81, -6],
    ["wolf", -76, -22],
    ["wolf", -73, -27],
  ] as const
).entries()) {
  const group = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({
    color:
      species === "tiger"
        ? "#b7833d"
        : species === "wolf"
          ? index === 3
            ? "#7e8077"
            : "#686e68"
          : species === "boar"
            ? "#625044"
            : "#8c785a",
    roughness: 1,
  });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.5, 9, 7), coat);
  torso.scale.set(0.75, 0.72, species === "monkey" ? 0.8 : 1.4);
  torso.position.y = 0.65;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(species === "boar" ? 0.3 : 0.25, 8, 6),
    coat,
  );
  head.position.set(0, 0.85, -0.65);
  group.add(head);
  if (species === "wolf") {
    torso.scale.set(0.65, 0.8, 1.4);
    const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 8), coat);
    muzzle.rotation.x = -Math.PI / 2;
    muzzle.position.set(0, 0.8, -0.96);
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      periodEyeMaterial,
    );
    nose.position.set(0, 0.8, -1.14);
    const ruff = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), coat);
    ruff.scale.set(1, 1.35, 0.9);
    ruff.position.set(0, 0.75, -0.35);
    group.add(muzzle, nose, ruff);
  }
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      species === "wolf"
        ? new THREE.ConeGeometry(0.085, 0.25, 5)
        : new THREE.SphereGeometry(0.11, 6, 5),
      coat,
    );
    ear.position.set(side * 0.2, 1.04, -0.6);
    group.add(ear);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 5),
      eyeMaterial,
    );
    eye.position.set(side * 0.16, 0.88, -0.83);
    group.add(eye);
  }
  if (species === "tiger")
    for (let stripe = 0; stripe < 6; stripe++) {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.39, 0.035, 4, 10),
        periodHairMaterial,
      );
      band.position.set(0, 0.65, -0.5 + stripe * 0.2);
      band.scale.x = 0.88;
      group.add(band);
    }
  const legs: THREE.Group[] = [];
  for (const x of [-0.23, 0.23])
    for (const z of [-0.38, 0.42]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.48, z);
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.085, 0.5, 5),
        coat,
      );
      shin.position.y = -0.23;
      leg.add(shin);
      group.add(leg);
      legs.push(leg);
    }
  const tail = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.7, 0.65),
        new THREE.Vector3(0, 0.9, 1),
        new THREE.Vector3(0.2, 0.65, 1.3),
      ]),
      8,
      0.05,
      5,
      false,
    ),
    coat,
  );
  group.add(tail);
  group.position.set(x, terrainHeight(x, z), z);
  scene.add(group);
  const trail =
    species === "tiger"
      ? predatorTrails[0]
      : species === "wolf"
        ? predatorTrails[index === 3 ? 1 : 2]
        : undefined;
  const nightPatrol = trail ? createNightPatrol(trail) : undefined;
  if (nightPatrol) group.visible = false;
  ambientAnimals.push({
    group,
    species,
    anchorX: x,
    anchorZ: z,
    phase: index * 2,
    radius: 5,
    speed: species === "wolf" ? 2 : species === "tiger" ? 1.8 : 0.7,
    legs,
    head,
    targetX: x,
    targetZ: z,
    waitUntil: 2,
    nightPatrol,
  });
}
ambientAnimals.forEach((animal) => {
  if (!["cow", "hen", "duck"].includes(animal.species)) {
    animal.targetX = animal.anchorX;
    animal.targetZ = animal.anchorZ;
  }
});
for (const [index, [x, z]] of [
  [-62, -15],
  [-67, -29],
  [-78, 3],
].entries()) {
  const rabbit = makeRabbit();
  rabbit.group.position.set(x, terrainHeight(x, z), z);
  scene.add(rabbit.group);
  ambientAnimals.push({
    ...rabbit,
    species: "rabbit",
    anchorX: x,
    anchorZ: z,
    phase: index * 0.7,
    radius: 3.5,
    speed: 0.9,
    targetX: x,
    targetZ: z,
    waitUntil: 0,
  });
}
for (let i = 0; i < 45; i++) {
  const x = -85 + random() * 31,
    z = -74 + random() * 103;
  if (!isForestHabitat(x, z) || distanceToRoad(x, z) < 3) continue;
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.34, 4, 6),
    trunkMaterial,
  );
  trunk.position.y = 2;
  const crown = new THREE.Mesh(
    canopyGeometry,
    leafMaterials[i % leafMaterials.length],
  );
  crown.position.y = 4.6;
  crown.scale.set(2.1, 2.7, 2.1);
  tree.add(trunk, crown);
  tree.position.set(x, terrainHeight(x, z), z);
  scene.add(tree);
  trees.push(tree);
}
const oxTeams = paddyPlots.map(([x, z], index) => {
  const team = new THREE.Group();
  const oxen = [-0.65, 0.65].map((offset) => {
    makeAnimal("cow", x, z, 30 + index);
    const ox = ambientAnimals.pop()!;
    team.add(ox.group);
    ox.group.position.set(offset, 0, -0.5);
    return ox;
  });
  const yoke = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.1, 0.13),
    woodMaterial,
  );
  yoke.position.set(0, 1.05, -0.7);
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, 2.5),
    woodMaterial,
  );
  shaft.position.set(0, 0.6, 0.7);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.18, 0.3),
    animalHooves,
  );
  blade.position.set(0, 0.06, 1.9);
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1, 0.08),
    woodMaterial,
  );
  handle.position.set(0, 0.55, 1.8);
  const farmer = createPeriodFigure(farmerSkinMaterial);
  farmer.figure.position.set(0.4, 0, 2.2);
  farmer.arms.forEach((arm) => (arm.rotation.x = 0.8));
  team.add(yoke, shaft, blade, handle, farmer.figure);
  scene.add(team);
  return { team, oxen, farmer, x, z, index, time: 0 };
});

const birdCoats = {
  hen: new THREE.MeshStandardMaterial({
    color: "#a95d3f",
    roughness: 1,
    flatShading: true,
  }),
  duck: new THREE.MeshStandardMaterial({
    color: "#8b9862",
    roughness: 1,
    flatShading: true,
  }),
};
const createBird = (
  species: "hen" | "duck",
  x: number,
  z: number,
  index: number,
  surfaceY?: number,
  wanderRadius = species === "hen" ? 2.8 : 3.8,
) => {
  const group = new THREE.Group();
  const coat = birdCoats[species];
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 9, 7), coat);
  body.scale.set(0.78, 0.78, 1.25);
  body.position.y = 0.48;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), coat);
  skull.position.set(0, 0.76, -0.32);
  head.add(skull);
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(species === "duck" ? 0.12 : 0.08, 0.3, 5),
    new THREE.MeshStandardMaterial({
      color: species === "duck" ? "#d99b42" : "#c9873c",
      roughness: 0.8,
    }),
  );
  beak.position.set(0, 0.7, -0.55);
  beak.rotation.x = -Math.PI / 2;
  head.add(beak);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 5),
      eyeMaterial,
    );
    eye.position.set(side * 0.12, 0.8, -0.46);
    head.add(eye);
    const wing = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 7, 5),
      species === "duck" ? deerLight : cartTrim,
    );
    wing.scale.set(0.28, 0.72, 1.15);
    wing.position.set(side * 0.27, 0.49, -0.02);
    wing.rotation.z = side * 0.25;
    group.add(wing);
  }
  if (species === "hen") {
    const comb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 6, 5),
      new THREE.MeshStandardMaterial({ color: "#ae3d32", roughness: 1 }),
    );
    comb.scale.set(0.65, 1.3, 0.65);
    comb.position.set(0, 0.97, -0.32);
    head.add(comb);
  }
  group.add(head);
  const legs: THREE.Group[] = [];
  if (species === "hen") {
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.13, 0.31, 0.05);
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.035, 0.28, 5),
        cartTrim,
      );
      shin.position.y = -0.12;
      leg.add(shin);
      group.add(leg);
      legs.push(leg);
    }
  }
  scene.add(group);
  group.scale.setScalar(species === "hen" ? 0.45 : 0.55);
  const radius = wanderRadius;
  const angle = random() * Math.PI * 2;
  const distance = random() * radius;
  group.position.set(x, surfaceY ?? terrainHeight(x, z), z);
  ambientAnimals.push({
    group,
    species,
    anchorX: x,
    anchorZ: z,
    phase: index * 0.77,
    radius,
    speed: species === "hen" ? 0.42 : 0.26,
    legs,
    head,
    targetX: x + Math.cos(angle) * distance,
    targetZ: z + Math.sin(angle) * distance,
    waitUntil: 0,
    surfaceY,
  });
};
const coopWallMaterial = new THREE.MeshStandardMaterial({
  color: "#8c6844",
  roughness: 1,
});
const coopRoofMaterial = new THREE.MeshStandardMaterial({
  color: "#9c7d4d",
  roughness: 1,
});
const yardFenceMaterial = new THREE.MeshStandardMaterial({
  color: "#745536",
  roughness: 1,
});
for (const [houseIndex, cottage] of cottages.entries()) {
  // The manor is not a cottage, and a cramped lot must not create a fence on a lane.
  if (!backyardPlans[houseIndex]?.hasYard) continue;
  const yard = new THREE.Group();
  yard.position.copy(cottage.position);
  yard.rotation.y = cottage.rotation.y;
  const cosine = Math.cos(yard.rotation.y);
  const sine = Math.sin(yard.rotation.y);
  const yardGround = (x: number, z: number) =>
    terrainHeight(
      cottage.position.x + x * cosine + z * sine,
      cottage.position.z - x * sine + z * cosine,
    ) - cottage.position.y;
  const addYardPost = (x: number, z: number) => {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, 1.05, 5),
      yardFenceMaterial,
    );
    post.position.set(x, yardGround(x, z) + 0.53, z);
    yard.add(post);
  };
  const addYardRail = (
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ) => {
    const start = new THREE.Vector3(
      startX,
      yardGround(startX, startZ) + 0.62,
      startZ,
    );
    const end = new THREE.Vector3(endX, yardGround(endX, endZ) + 0.62, endZ);
    const direction = end.clone().sub(start);
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(direction.length(), 0.09, 0.09),
      yardFenceMaterial,
    );
    rail.position.copy(start).add(end).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      direction.normalize(),
    );
    yard.add(rail);
  };
  for (const localZ of [5.8, 8.1]) {
    for (const localX of [-2.7, 2.7]) {
      addYardPost(localX, localZ);
    }
    addYardRail(-2.7, localZ, 2.7, localZ);
  }
  addYardPost(0, 8.1);
  for (const localX of [-2.7, 2.7]) {
    addYardRail(localX, 5.8, localX, 8.1);
  }
  const coopGround = yardGround(1.2, 7.25);
  const coop = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 1.05, 1.2),
    coopWallMaterial,
  );
  coop.position.set(1.2, coopGround + 0.58, 7.25);
  coop.castShadow = true;
  yard.add(coop);
  const coopRoof = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 0.66, 4),
    coopRoofMaterial,
  );
  coopRoof.scale.set(1, 0.72, 0.72);
  coopRoof.position.set(1.2, coopGround + 1.35, 7.25);
  coopRoof.rotation.y = Math.PI / 4;
  coopRoof.castShadow = true;
  yard.add(coopRoof);
  const coopDoor = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.58, 0.08),
    windowMaterial,
  );
  coopDoor.position.set(1.2, coopGround + 0.36, 6.63);
  yard.add(coopDoor);
  scene.add(yard);
  yardStructures.push(yard);
  for (let bird = 0; bird < 3; bird++) {
    const localX = -1.6 + bird * 0.7 + (random() - 0.5) * 0.15;
    const localZ = 6.95 + (random() - 0.5) * 0.4;
    const worldPosition = new THREE.Vector3(localX, 0, localZ)
      .applyQuaternion(yard.quaternion)
      .add(yard.position);
    createBird(
      "hen",
      worldPosition.x,
      worldPosition.z,
      houseIndex * 3 + bird,
      undefined,
      0.4 + random() * 0.1,
    );
  }
}
const pondY = waterModel.pondSurfaceY;
const pond = new THREE.Mesh(
  new THREE.CircleGeometry(4.5, 32),
  new THREE.MeshStandardMaterial({
    color: "#78a9a0",
    roughness: 0.32,
    metalness: 0.08,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  }),
);
pond.rotation.x = -Math.PI / 2;
pond.scale.x = 1.32;
pond.position.set(pondX, pondY, pondZ);
scene.add(pond);
const pondBank = new THREE.Mesh(
  new THREE.TorusGeometry(5.35, 0.38, 6, 36),
  new THREE.MeshStandardMaterial({ color: "#879069", roughness: 1 }),
);
pondBank.rotation.x = Math.PI / 2;
pondBank.scale.set(1.32, 1, 1);
pondBank.position.set(pondX, pondY - 0.12, pondZ);
scene.add(pondBank);
for (let i = 0; i < 4; i++)
  createBird(
    "duck",
    pondX + (random() - 0.5) * 4,
    pondZ + (random() - 0.5) * 4,
    i + 10,
    pondY + 0.08,
  );

const riverRibbon = (
  width: number,
  material: THREE.Material,
  offset = 0,
  lift = 0.07,
) => {
  const steps = 220;
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const point = riverRoute.getPointAt(step / steps);
    const tangent = riverRoute.getTangentAt(step / steps);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    for (const edge of [-1, 1]) {
      const x = point.x + side.x * (offset + width * 0.5 * edge);
      const z = point.z + side.z * (offset + width * 0.5 * edge);
      const y =
        material === riverWaterMaterial
          ? waterModel.riverSurface(point.x, point.z) + lift
          : terrainHeight(x, z) + lift;
      vertices.push(x, y, z);
      uvs.push(x / 3, z / 3);
    }
    if (step < steps) {
      const index = step * 2;
      indices.push(
        index,
        index + 1,
        index + 2,
        index + 1,
        index + 3,
        index + 2,
      );
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
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
};
const riverBankMaterial = new THREE.MeshStandardMaterial({
  color: "#827957",
  roughness: 1,
  side: THREE.DoubleSide,
});
const riverWaterMaterial = new THREE.MeshStandardMaterial({
  color: "#588b83",
  roughness: 0.2,
  metalness: 0.08,
  transparent: true,
  opacity: 0.78,
  depthWrite: false,
  side: THREE.DoubleSide,
});
riverRibbon(1.7, riverBankMaterial, -4.65, 0.025);
riverRibbon(1.7, riverBankMaterial, 4.65, 0.025);
riverRibbon(7.4, riverWaterMaterial, 0, 0);

const riverFish: {
  group: THREE.Group;
  start: number;
  speed: number;
  phase: number;
}[] = [];
const fishScales = ["#c3914e", "#758d79", "#9c7450", "#b3a172"];
for (let index = 0; index < 18; index++) {
  const fish = new THREE.Group();
  const scaleMaterial = new THREE.MeshStandardMaterial({
    color: fishScales[index % fishScales.length],
    roughness: 0.58,
    metalness: 0.12,
  });
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 8, 6),
    scaleMaterial,
  );
  body.scale.set(0.66, 0.58, 1.55);
  fish.add(body);
  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.38, 4),
    scaleMaterial,
  );
  tail.position.z = 0.42;
  tail.rotation.x = Math.PI / 2;
  fish.add(tail);
  const fin = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.28, 4),
    new THREE.MeshStandardMaterial({ color: "#c2a265", roughness: 0.75 }),
  );
  fin.position.y = 0.16;
  fish.add(fin);
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 6, 5),
    eyeMaterial,
  );
  eye.position.set(0.11, 0.035, -0.22);
  fish.add(eye);
  scene.add(fish);
  riverFish.push({
    group: fish,
    start: 0.08 + index * 0.047,
    speed: 0.002 + random() * 0.003,
    phase: index * 1.4,
  });
}

const fishingBoats: {
  group: THREE.Group;
  start: number;
  phase: number;
  fisher: THREE.Group;
  net: THREE.Group;
  rope: THREE.Line;
  castingArm: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
  dock: THREE.Vector3;
  working: boolean;
}[] = [];
const castingHand = new THREE.Vector3();
const castTarget = new THREE.Vector3(1.95, -0.08, -0.65);
const ropeEnd = new THREE.Vector3();
const riverRodMaterial = new THREE.MeshStandardMaterial({
  color: "#614b31",
  roughness: 1,
});
const fishingLineMaterial = new THREE.LineBasicMaterial({
  color: "#d2c49b",
  transparent: true,
  opacity: 0.88,
});
const fishingHookMaterial = new THREE.MeshStandardMaterial({
  color: "#b5b2a1",
  metalness: 0.65,
  roughness: 0.3,
});
const boatWoodMaterial = new THREE.MeshStandardMaterial({
  color: "#765235",
  roughness: 0.9,
});
const boatTrimMaterial = new THREE.MeshStandardMaterial({
  color: "#a27a48",
  roughness: 0.88,
});
const castNetWeightMaterial = new THREE.MeshStandardMaterial({
  color: "#6e5942",
  roughness: 1,
});
const castNetWeightGeometry = new THREE.SphereGeometry(0.055, 6, 5);
const createCastNet = () => {
  const net = new THREE.Group();
  const rings = 7;
  const sectors = 24;
  const radius = 1.18;
  const meshPositions: number[] = [];
  const meshIndices: number[] = [];
  const linePositions: number[] = [];
  const positionAt = (ring: number, sector: number) => {
    const fraction = ring / rings;
    const angle = (sector / sectors) * Math.PI * 2;
    return new THREE.Vector3(
      Math.cos(angle) * radius * fraction,
      0.55 * (1 - fraction) ** 1.3,
      Math.sin(angle) * radius * fraction,
    );
  };
  const addLine = (a: THREE.Vector3, b: THREE.Vector3) =>
    linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  for (let ring = 0; ring <= rings; ring++) {
    for (let sector = 0; sector < sectors; sector++) {
      const current = positionAt(ring, sector);
      meshPositions.push(current.x, current.y, current.z);
      if (ring > 0) addLine(current, positionAt(ring, (sector + 1) % sectors));
      if (ring < rings) {
        addLine(current, positionAt(ring + 1, sector));
        if (ring > 0)
          addLine(current, positionAt(ring + 1, (sector + 1) % sectors));
        const a = ring * sectors + sector;
        const next = ring * sectors + ((sector + 1) % sectors);
        meshIndices.push(
          a,
          a + sectors,
          next,
          next,
          a + sectors,
          next + sectors,
        );
      }
    }
  }
  const surfaceGeometry = new THREE.BufferGeometry();
  surfaceGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(meshPositions, 3),
  );
  surfaceGeometry.setIndex(meshIndices);
  surfaceGeometry.computeVertexNormals();
  const netSurface = new THREE.Mesh(
    surfaceGeometry,
    new THREE.MeshBasicMaterial({
      color: "#cfc1a1",
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  net.add(netSurface);
  const strands = new THREE.BufferGeometry();
  strands.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(linePositions, 3),
  );
  net.add(new THREE.LineSegments(strands, fishingLineMaterial));
  for (let sector = 0; sector < sectors; sector++) {
    const weight = new THREE.Mesh(castNetWeightGeometry, castNetWeightMaterial);
    weight.position.copy(positionAt(rings, sector));
    weight.scale.set(1, 0.7, 1);
    net.add(weight);
  }
  return net;
};
const createFishingBoat = (start: number, index: number) => {
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.47, 2.45, 4, 9),
    boatWoodMaterial,
  );
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(0.85, 1, 0.72);
  hull.position.y = 0.12;
  hull.castShadow = true;
  boat.add(hull);
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.16, 2.5),
    new THREE.MeshStandardMaterial({ color: "#463a2b", roughness: 1 }),
  );
  inner.position.set(0, 0.34, 0.04);
  boat.add(inner);
  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 2.8, 5),
      boatTrimMaterial,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(side * 0.34, 0.35, 0);
    boat.add(rim);
  }
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.12, 0.22),
    boatTrimMaterial,
  );
  bench.position.set(0, 0.55, 0.35);
  boat.add(bench);
  const fisherman = createPeriodFigure(farmerSkinMaterial, false);
  fisherman.figure.scale.setScalar(0.82);
  fisherman.figure.position.set(0, 0.46, 0.35);
  fisherman.arms[1].rotation.x = 0.45;
  fisherman.arms[1].rotation.z = -0.22;
  fisherman.arms[0].rotation.x = 0.22;
  boat.add(fisherman.figure);
  const net = createCastNet();
  const ropeGeometry = new THREE.BufferGeometry();
  ropeGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(13 * 3), 3),
  );
  const netRope = new THREE.Line(ropeGeometry, fishingLineMaterial);
  netRope.frustumCulled = false;
  boat.add(netRope, net);
  scene.add(boat);
  const riverPoint = riverRoute.getPointAt(start);
  const tangent = riverRoute.getTangentAt(start);
  const dock = riverPoint
    .clone()
    .add(new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(5.4));
  dock.y = terrainHeight(dock.x, dock.z);
  boat.position.set(
    riverPoint.x,
    waterModel.riverSurface(riverPoint.x, riverPoint.z) + 0.12,
    riverPoint.z,
  );
  fishingBoats.push({
    group: boat,
    start,
    phase: index * 1.8,
    fisher: fisherman.figure,
    net,
    rope: netRope,
    castingArm: fisherman.arms[1],
    legs: fisherman.legs,
    arms: fisherman.arms,
    dock,
    working: true,
  });
};
createFishingBoat(0.31, 1);
createFishingBoat(0.63, 2);

const bankFishers: THREE.Group[] = [];
const bankFisherPeople: ReturnType<typeof createPeriodFigure>[] = [];
for (const [index, progress] of [0.2, 0.73].entries()) {
  const riverPoint = riverRoute.getPointAt(progress);
  const tangent = riverRoute.getTangentAt(progress);
  const bankNormal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const bankSign = index === 0 ? 1 : -1;
  const fisherPosition = riverPoint
    .clone()
    .addScaledVector(bankNormal, bankSign * 7.6);
  const bankFisher = new THREE.Group();
  const figure = createPeriodFigure(farmerSkinMaterial, false);
  figure.figure.scale.setScalar(0.9);
  figure.figure.position.y = 0.02;
  figure.arms[1].rotation.x = 0.82;
  figure.arms[1].rotation.z = -0.16;
  figure.arms[0].rotation.x = 0.18;
  bankFisher.add(figure.figure);
  const rodStart = new THREE.Vector3(0.28, 1.38, -0.02);
  const rodEnd = new THREE.Vector3(0.85, 2.45, -2.35);
  const rodVector = rodEnd.clone().sub(rodStart);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.04, rodVector.length(), 5),
    riverRodMaterial,
  );
  rod.position.copy(rodStart).add(rodEnd).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    rodVector.normalize(),
  );
  bankFisher.add(rod);
  const hookEnd = new THREE.Vector3(1.02, 0.04, -5.2);
  bankFisher.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([rodEnd, hookEnd]),
      fishingLineMaterial,
    ),
  );
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.016, 5, 9, Math.PI * 1.35),
    fishingHookMaterial,
  );
  hook.position.copy(hookEnd);
  hook.rotation.x = Math.PI / 2;
  bankFisher.add(hook);
  const float = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 6, 5),
    new THREE.MeshStandardMaterial({ color: "#d2a34c", roughness: 0.5 }),
  );
  float.position.copy(hookEnd).setY(0.12);
  bankFisher.add(float);
  bankFisher.position.set(
    fisherPosition.x,
    terrainHeight(fisherPosition.x, fisherPosition.z),
    fisherPosition.z,
  );
  const faceRiver = riverPoint.clone().sub(fisherPosition).setY(0).normalize();
  bankFisher.rotation.y = Math.atan2(-faceRiver.x, -faceRiver.z);
  scene.add(bankFisher);
  bankFishers.push(bankFisher);
  bankFisherPeople.push(figure);
}

type WorkerActor = {
  group: THREE.Group;
  arms: THREE.Group[];
  legs: THREE.Group[];
  duty: Duty;
  working: boolean;
  workParent?: THREE.Group;
  localPosition: THREE.Vector3;
  localRotation: THREE.Euler;
  boat?: (typeof fishingBoats)[number];
  equipment?: THREE.Object3D[];
  fishTrade?: FishTrading;
  fishingSite?: readonly [number, number];
  fishBasket?: THREE.Group;
};
const workerActors: WorkerActor[] = [];
const registerWorker = (
  group: THREE.Group,
  arms: THREE.Group[],
  legs: THREE.Group[],
  work: readonly [number, number],
  home: readonly [number, number],
  workParent?: THREE.Group,
): WorkerActor => {
  const actor: WorkerActor = {
    group,
    arms,
    legs,
    duty: createDuty(work, home),
    working: true,
    workParent,
    localPosition: group.position.clone(),
    localRotation: group.rotation.clone(),
  };
  workerActors.push(actor);
  return actor;
};
fieldHomeSites.forEach(([x, z], index) =>
  createCottage(x, z, index + 20, Math.PI),
);
const paddyActors = paddyWorkers.map((worker, index) =>
  registerWorker(
    worker.group,
    worker.arms,
    worker.legs,
    [worker.homeX, worker.homeZ],
    cottageDoorstep(fieldHomeSites[Math.floor(index / 2)], Math.PI),
  ),
);
const gardenLeaf = new THREE.MeshStandardMaterial({
  color: "#436e38",
  roughness: 0.9,
});
const gardenStem = new THREE.MeshStandardMaterial({
  color: "#557c3e",
  roughness: 1,
});
const gardenSoil = new THREE.MeshStandardMaterial({
  color: "#574331",
  roughness: 1,
});
const brinjalSkin = new THREE.MeshStandardMaterial({
  color: "#663659",
  roughness: 0.45,
});
const vegetableGrowers = vegetablePlots.map((plot, index) => {
  const [x, z] = plot.center;
  const garden = new THREE.Group();
  for (let row = 0; row < 3; row++) {
    const bedZ = z - 1.6 + row * 1.6;
    const bedGeometry = new THREE.PlaneGeometry(6.8, 1.05, 24, 5);
    const vertices = bedGeometry.attributes.position;
    for (let vertex = 0; vertex < vertices.count; vertex++) {
      const px = x + vertices.getX(vertex),
        pz = bedZ - vertices.getY(vertex);
      vertices.setZ(vertex, terrainHeight(px, pz) + 0.08);
    }
    bedGeometry.computeVertexNormals();
    const bed = new THREE.Mesh(bedGeometry, gardenSoil);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(x, 0, bedZ);
    bed.receiveShadow = true;
    garden.add(bed);
    for (let plant = 0; plant < 7; plant++) {
      const px = x - 2.9 + plant * 0.95,
        pz = bedZ;
      const height =
        plot.crop === "gourd" ? 1.5 : plot.crop === "okra" ? 0.95 : 0.7;
      const crop = new THREE.Group();
      crop.position.set(px, terrainHeight(px, pz) + 0.1, pz);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.03, height, 5),
        gardenStem,
      );
      stem.position.y = height / 2;
      crop.add(stem);
      for (let leaf = 0; leaf < 5; leaf++) {
        const angle = leaf * 2.4 + plant * 0.2;
        const foliage = new THREE.Mesh(
          new THREE.SphereGeometry(0.17, 8, 6),
          gardenLeaf,
        );
        foliage.scale.set(1, 0.13, 1.5);
        foliage.position.set(
          Math.cos(angle) * 0.13,
          height * (0.3 + leaf * 0.13),
          Math.sin(angle) * 0.13,
        );
        foliage.rotation.set(0.15, angle, 0.1);
        crop.add(foliage);
      }
      const vegetable = new THREE.Mesh(
        new THREE.SphereGeometry(plot.crop === "brinjal" ? 0.1 : 0.07, 10, 8),
        plot.crop === "brinjal" ? brinjalSkin : gardenLeaf,
      );
      vegetable.scale.set(1, plot.crop === "gourd" ? 4 : 2, 1);
      vegetable.position.set(0.12, height * 0.6, -0.06);
      crop.add(vegetable);
      garden.add(crop);
    }
    if (plot.crop === "gourd") {
      for (const px of [x - 3.2, x + 3.2]) {
        const stake = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.055, 1.9, 5),
          woodMaterial,
        );
        stake.position.set(px, terrainHeight(px, bedZ) + 0.95, bedZ);
        garden.add(stake);
      }
      const start = new THREE.Vector3(
        x - 3.2,
        terrainHeight(x - 3.2, bedZ) + 1.7,
        bedZ,
      );
      const end = new THREE.Vector3(
        x + 3.2,
        terrainHeight(x + 3.2, bedZ) + 1.7,
        bedZ,
      );
      garden.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([start, end]),
          fishingLineMaterial,
        ),
      );
    }
  }
  const wateringPot = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8),
    new THREE.MeshStandardMaterial({ color: "#9b6544", roughness: 1 }),
  );
  wateringPot.position.set(
    x + 3.4,
    terrainHeight(x + 3.4, z + 2.5) + 0.2,
    z + 2.5,
  );
  garden.add(wateringPot);
  scene.add(garden);
  const grower = createPeriodFigure(farmerClothes[index], false);
  grower.figure.position.set(x, terrainHeight(x, z - 2.9), z - 2.9);
  grower.figure.rotation.y = Math.PI;
  scene.add(grower.figure);
  return registerWorker(
    grower.figure,
    grower.arms,
    grower.legs,
    [x, z - 2.9],
    cottageDoorstep(fieldHomeSites[index], Math.PI),
  );
});
const oxHandlers = oxTeams.map((ox, index) =>
  registerWorker(
    ox.farmer.figure,
    ox.farmer.arms,
    ox.farmer.legs,
    [ox.x, ox.z],
    cottageDoorstep(fieldHomeSites[index], Math.PI),
    ox.team,
  ),
);
const marketSellers = marketStalls.map((stall, index) => {
  const seller = createPeriodFigure(villagerMaterials[index], false);
  seller.figure.position.set(0, 0, 1.15);
  stall.add(seller.figure);
  const work = new THREE.Vector3(0, 0, 1.15)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), stall.rotation.y)
    .add(stall.position);
  return registerWorker(
    seller.figure,
    seller.arms,
    seller.legs,
    [work.x, work.z],
    villageHomes[(index + 2) % villageHomes.length],
    stall,
  );
});
const kalariWorkers = kalariFigures.map((person, index) => {
  const at = person.figure.getWorldPosition(new THREE.Vector3());
  return registerWorker(
    person.figure,
    person.arms,
    person.legs,
    [at.x, at.z],
    villageHomes[(index + 1) % villageHomes.length],
    kalari,
  );
});
const heritageActivities: [number, number, string, string][] = [
  [
    -43,
    69,
    "കയർ പണി",
    "Coir workers twist coconut fibre and discuss the day's pay. Unequal labour conditions are depicted, not endorsed.",
  ],
  [
    65,
    -49,
    "കൂലി കണക്ക്",
    "Harvest sacks are weighed and wages entered in a ledger. Rural hierarchies and caste exclusion are historical context, not approval of exploitation.",
  ],
];
const heritageWorkers = heritageActivities.map(([x, z, label], index) => {
  const workshop = new THREE.Group();
  workshop.position.set(x, terrainHeight(x, z), z);
  scene.add(workshop);
  const bench = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.12, 0.65),
    woodMaterial,
  );
  bench.position.set(0, 0.7, -0.6);
  workshop.add(bench);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.7, 0.08),
      woodMaterial,
    );
    leg.position.set(side * 0.55, 0.35, -0.6);
    workshop.add(leg);
  }
  if (index === 0) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.23, 0.025, 6, 16),
      woodMaterial,
    );
    wheel.position.set(0.65, 1, -0.6);
    workshop.add(wheel);
    const fibre = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.045, 6, 20),
      farmerBasketMaterial,
    );
    fibre.rotation.x = Math.PI / 2;
    fibre.position.set(-0.3, 0.8, -0.6);
    workshop.add(fibre);
    for (let strand = 0; strand < 5; strand++)
      workshop.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0.65, 1, -0.6),
            new THREE.Vector3(-0.55, 0.8, -0.65 + strand * 0.025),
          ]),
          fishingLineMaterial,
        ),
      );
  } else {
    const ledger = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.04, 0.26),
      nobleCloth,
    );
    ledger.position.set(0, 0.8, -0.6);
    workshop.add(ledger);
    for (let sack = 0; sack < 3; sack++) {
      const bag = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.3, 0.6, 10),
        farmerBasketMaterial,
      );
      bag.position.set(1.2, 0.3, -0.6 + sack * 0.65);
      workshop.add(bag);
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#51412f";
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = "#ecdbb6";
  ctx.textAlign = "center";
  ctx.font = "36px sans-serif";
  ctx.fillText(label, 256, 61);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.3),
    new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 1,
    }),
  );
  board.position.set(0, 1.3, -0.85);
  workshop.add(board);
  translatedBoards.push({
    object: board,
    english: index ? "Wage accounts" : "Coir work — coconut-fibre rope making",
  });
  const person = createPeriodFigure(index ? nobleCloth : farmerClothes[2]);
  person.figure.position.set(index ? 0 : 0.95, 0, 0.3);
  workshop.add(person.figure);
  const home = index
    ? villageHomes[1]
    : cottageDoorstep(fieldHomeSites[1], Math.PI);
  const actor = registerWorker(
    person.figure,
    person.arms,
    person.legs,
    [x + (index ? 0 : 0.95), z + 0.3],
    home,
    workshop,
  );
  return { actor, workshop, index };
});
const wageEmployees = [
  ...paddyActors,
  ...oxHandlers,
  heritageWorkers[0].actor,
].map((actor) => ({
  actor,
  visit: wageVisit(),
  work: actor.duty.work,
  slot: -1,
  stage: "working",
  leaveAt: 0,
}));
const wageDesk = {
  serving: null as number | null,
  remaining: 0,
  transactions: 0,
};
const wageClerk = heritageWorkers[1].actor;
const wageFront: readonly [number, number] = [65, -47.7];
const wageCoin = new THREE.Mesh(
  new THREE.CylinderGeometry(0.065, 0.065, 0.018, 10),
  nobleTrim,
);
wageCoin.rotation.x = Math.PI / 2;
wageCoin.position.set(0, -0.46, -0.08);
wageCoin.visible = false;
wageClerk.arms[1].add(wageCoin);
const temple = makeTemple();
temple.position.set(templeSite[0], terrainHeight(...templeSite), templeSite[1]);
scene.add(temple);
translatedBoards.push({
  object: boardAnchor(temple, 0, 1.8, 5.55),
  english: "Temple",
});
const templeWorshippers = Array.from({ length: 6 }, (_value, index) => {
  const person = createPeriodFigure(
    index % 2 ? villagerSariMaterials[1] : nobleCloth,
    false,
  );
  person.figure.position.set(
    index < 4
      ? templeSite[0] - 3 + index * 2
      : templeSite[0] + (index === 4 ? -0.7 : 0.7),
    terrainHeight(...templeSite),
    templeSite[1] + (index < 4 ? 4.8 : 0.9),
  );
  scene.add(person.figure);
  const flowers = makeFlowers();
  flowers.position.set(0, -0.44, -0.12);
  person.arms[1].add(flowers);
  const actor = registerWorker(
    person.figure,
    person.arms,
    person.legs,
    [person.figure.position.x, person.figure.position.z],
    villageHomes[(index + 4) % villageHomes.length],
  );
  return { actor, flowers };
});
const festivalDecorations = new THREE.Group();
scene.add(festivalDecorations);
festivalDecorations.visible = false;
const festivalGold = new THREE.MeshStandardMaterial({
  color: "#e3b640",
  roughness: 0.7,
});
const blossomGeometry = new THREE.SphereGeometry(0.055, 7, 5);
const blossoms = new THREE.InstancedMesh(blossomGeometry, festivalGold, 210);
const flowerTransform = new THREE.Object3D();
for (let flower = 0; flower < 210; flower++) {
  const column = flower % 70,
    row = Math.floor(flower / 70);
  const x = templeSite[0] - 5 + (column / 69) * 10,
    z = templeSite[1] + 3 + row * 4;
  flowerTransform.position.set(
    x,
    terrainHeight(x, z) + 3.3 - Math.sin((column / 69) * Math.PI) * 0.65,
    z,
  );
  flowerTransform.updateMatrix();
  blossoms.setMatrixAt(flower, flowerTransform.matrix);
}
blossoms.instanceMatrix.needsUpdate = true;
festivalDecorations.add(blossoms);
for (const side of [-1, 1])
  for (const offset of [3, 7, 11]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 3.7, 6),
      woodMaterial,
    );
    pole.position.set(
      templeSite[0] + side * 5,
      terrainHeight(templeSite[0] + side * 5, templeSite[1] + offset) + 1.85,
      templeSite[1] + offset,
    );
    festivalDecorations.add(pole);
  }
const festivalElephants = Array.from({ length: 3 }, (_value, index) => {
  const source = ambientAnimals.find(
    (animal) => animal.species === "elephant",
  )!;
  const group = source.group.clone(true);
  group.visible = true;
  group.scale.setScalar(0.78);
  group.position.set(
    templeSite[0] + (index - 1) * 3.3,
    terrainHeight(templeSite[0] + (index - 1) * 3.3, templeSite[1] + 5.2),
    templeSite[1] + 5.2,
  );
  group.rotation.y = Math.PI;
  group.add(makeFestivalOrnaments(index === 1));
  const rider = createPeriodFigure(nobleCloth);
  rider.figure.position.set(-0.2, 3.05, 0.35);
  rider.figure.scale.setScalar(0.85);
  rider.legs.forEach((leg) => (leg.rotation.x = -1.2));
  rider.arms[1].rotation.x = 1.1;
  group.add(rider.figure);
  festivalDecorations.add(group);
  return group;
});
const chendaPlayers = Array.from({ length: 5 }, (_value, index) => {
  const person = createPeriodFigure(farmerSkinMaterial);
  person.figure.position.set(
    templeSite[0] - 4 + index * 2,
    terrainHeight(templeSite[0] - 4 + index * 2, templeSite[1] + 10),
    templeSite[1] + 10,
  );
  person.figure.rotation.y = Math.PI;
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.62, 14),
    woodMaterial,
  );
  drum.position.set(0, 0.84, -0.35);
  person.figure.add(drum);
  for (const height of [0.53, 1.15]) {
    const skin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.025, 14),
      nobleCloth,
    );
    skin.position.set(0, height, -0.35);
    person.figure.add(skin);
  }
  for (const arm of person.arms) {
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.32, 5),
      woodMaterial,
    );
    stick.position.set(0, -0.55, -0.08);
    arm.add(stick);
  }
  festivalDecorations.add(person.figure);
  return person;
});
const festivalVisitors = Array.from({ length: 8 }, (_value, index) => {
  const person = createPeriodFigure(
    index % 2 ? villagerSariMaterials[index % 4] : nobleCloth,
  );
  const home = villageHomes[index % villageHomes.length];
  person.figure.position.set(home[0], terrainHeight(...home), home[1]);
  scene.add(person.figure);
  const actor = registerWorker(
    person.figure,
    person.arms,
    person.legs,
    [
      templeSite[0] - 5 + (index % 4) * 3.2,
      templeSite[1] + 13 + Math.floor(index / 4) * 1.3,
    ],
    home,
  );
  return actor;
});
const children = Array.from({ length: 8 }, (_value, index) => {
  const person = createPeriodFigure(villagerSariMaterials[index % 4]);
  person.figure.scale.setScalar(0.58 + (index % 3) * 0.035);
  // Remove adult facial hair and head-wrap from the child's procedural figure.
  for (const child of [...person.figure.children])
    if (
      child instanceof THREE.Mesh &&
      child.geometry instanceof THREE.SphereGeometry &&
      [0.075, 0.27].includes(child.geometry.parameters.radius)
    )
      person.figure.remove(child);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
    periodHairMaterial,
  );
  hair.position.set(0, 1.67, 0.02);
  person.figure.add(hair);
  const homestead =
    scatteredHomes[Math.floor(index / 2) % scatteredHomes.length];
  const home = homestead.doorstep;
  const base: readonly [number, number] = [
    home[0] + (index % 2 ? 1 : -1) * 1.1,
    home[1] + 1.6,
  ];
  person.figure.position.set(base[0], terrainHeight(...base), base[1]);
  scene.add(person.figure);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    farmerBasketMaterial,
  );
  ball.position.set(base[0], terrainHeight(...base) + 0.13, base[1]);
  scene.add(ball);
  const walker: Walker = { x: base[0], z: base[1], path: [], waypoint: 0 };
  return {
    person,
    home,
    lane: homestead.lane,
    base,
    ball,
    walker,
    goal: "home",
    stride: 0,
    wait: index * 0.25,
  };
});
const lordFlowers = makeFlowers();
lordFlowers.position.set(0, -0.44, -0.12);
lordActor.arms[1].add(lordFlowers);
lordFlowers.visible = false;
const villagerOfferings = villagers.map((person) => {
  const flowers = makeFlowers();
  flowers.position.set(0, -0.43, -0.1);
  flowers.visible = false;
  person.arms[1].add(flowers);
  return flowers;
});
const neighbourBubbles = villagers.map((_person, index) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#efe4c9";
  context.fillRect(0, 0, 256, 64);
  context.fillStyle = "#3b4834";
  context.font = "24px sans-serif";
  context.textAlign = "center";
  context.fillText(index % 2 ? "സുഖം!" : "സുഖമാണോ?", 128, 41);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const bubble = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthWrite: false }),
  );
  bubble.scale.set(1.65, 0.42, 1);
  bubble.visible = false;
  scene.add(bubble);
  return bubble;
});
templeWorshippers.slice(4).forEach(({ actor }) => {
  const drape = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.85, 0.08),
    nobleTrim,
  );
  drape.position.set(0.2, 1.05, -0.2);
  actor.group.add(drape);
});
const shops: Shop[] = [
  { kind: "banana", stock: 18 },
  { kind: "coconut-water", stock: 12 },
];
const shopGoods: THREE.Group[][] = [[], []];
const marketFarmCrates = new THREE.Group();
marketFarmCrates.position.set(-1.4, terrainHeight(-1.4, -25.4), -25.4);
scene.add(marketFarmCrates);
for (let crate = 0; crate < 3; crate++) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.35, 0.65),
    woodMaterial,
  );
  box.position.set(0, 0.18, crate * 0.75);
  marketFarmCrates.add(box);
  const bananas = makeBanana();
  bananas.position.set(0, 0.42, crate * 0.75);
  marketFarmCrates.add(bananas);
  for (let item = 0; item < 3; item++) {
    const vegetable = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      new THREE.MeshStandardMaterial({
        color: crate === 1 ? "#674568" : "#78914a",
        roughness: 0.75,
      }),
    );
    vegetable.position.set(-0.2 + item * 0.2, 0.41, crate * 0.75 + 0.12);
    vegetable.scale.y = crate === 2 ? 1.8 : 1;
    marketFarmCrates.add(vegetable);
  }
}
marketFarmCrates.visible = false;
const teaShop = makeTeaShop();
teaShop.position.set(
  teaShopSite[0],
  terrainHeight(...teaShopSite),
  teaShopSite[1],
);
const teaLane = closestRoad(...teaShopSite);
if (teaLane) teaShop.rotation.y = shopFacing(...teaShopSite, teaLane);
scene.add(teaShop);
translatedBoards.push({
  object: boardAnchor(teaShop, 0, 2.3, -2.3),
  english: "Tea shop — tea and banana fritters",
});
const teaMan = createPeriodFigure(nobleCloth);
teaMan.figure.position.set(0, 0, -0.9);
teaShop.add(teaMan.figure);
teaShop.updateWorldMatrix(true, true);
const teaWork = teaMan.figure.getWorldPosition(new THREE.Vector3());
const teaSeller = registerWorker(
  teaMan.figure,
  teaMan.arms,
  teaMan.legs,
  [teaWork.x, teaWork.z],
  villageHomes[3],
  teaShop,
);
const teaFire = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 10, 8),
  new THREE.MeshBasicMaterial({ color: "#eaa24c" }),
);
teaFire.position.set(-1.55, 0.67, 1.15);
teaFire.scale.set(0.8, 1.5, 0.8);
teaShop.add(teaFire);
shops.push({ kind: "tea", stock: 20 }, { kind: "snack", stock: 16 });
shopGoods.push([], []);
const shopLocations = [marketStalls[0], marketStalls[1], teaShop, teaShop];
const foodSellers = [marketSellers[0], marketSellers[1], teaSeller, teaSeller];
const toddyShop = makeTeaShop("toddy");
toddyShop.position.set(
  toddyShopSite[0],
  terrainHeight(...toddyShopSite),
  toddyShopSite[1],
);
scene.add(toddyShop);
translatedBoards.push({
  object: boardAnchor(toddyShop, 0, 2.3, -2.3),
  english: "Toddy shop — toddy ₹2",
});
const toddyLane = closestRoad(...toddyShopSite);
if (toddyLane) toddyShop.rotation.y = shopFacing(...toddyShopSite, toddyLane);
const toddyMan = createPeriodFigure(farmerClothes[1]);
toddyMan.figure.position.set(0, 0, -0.9);
toddyShop.add(toddyMan.figure);
toddyShop.updateWorldMatrix(true, true);
const toddyWork = toddyMan.figure.getWorldPosition(new THREE.Vector3());
const toddySeller = registerWorker(
  toddyMan.figure,
  toddyMan.arms,
  toddyMan.legs,
  [toddyWork.x, toddyWork.z],
  villageHomes[4],
  toddyShop,
);
shops.push({ kind: "toddy", stock: 20 });
shopGoods.push([]);
shopLocations.push(toddyShop);
foodSellers.push(toddySeller);
const toddyPatrons = [-0.8, 0.8].map((x, index) => {
  const person = createPeriodFigure(farmerClothes[index]);
  person.figure.position.set(x, 0.55, 0.6);
  toddyShop.add(person.figure);
  const cup = makeTeaGlass();
  cup.position.set(0, -0.44, -0.05);
  person.arms[1].add(cup);
  const actor = registerWorker(
    person.figure,
    person.arms,
    person.legs,
    [toddyShopSite[0] + x, toddyShopSite[1] + 0.6],
    villageHomes[index + 5],
    toddyShop,
  );
  return { actor, cup };
});
const equipmentCounter = new THREE.Group();
equipmentCounter.position.set(4, 0, -2.1);
kalari.add(equipmentCounter);
const equipmentBench = new THREE.Mesh(
  new THREE.BoxGeometry(1.9, 0.14, 0.7),
  woodMaterial,
);
equipmentBench.position.y = 0.85;
equipmentCounter.add(equipmentBench);
for (const [index, kind] of (["bow", "sword", "shield"] as const).entries()) {
  const prop = makeEquipment(kind);
  prop.position.set(-0.6 + index * 0.6, 1.25, 0);
  prop.scale.setScalar(0.6);
  equipmentCounter.add(prop);
}
const equipmentPerson = createPeriodFigure(farmerClothes[1]);
equipmentPerson.figure.position.set(4, 0, -1.2);
kalari.add(equipmentPerson.figure);
const equipmentPosition = new THREE.Vector3(4, 0, -2.1).add(kalari.position);
const equipmentSeller = registerWorker(
  equipmentPerson.figure,
  equipmentPerson.arms,
  equipmentPerson.legs,
  [equipmentPosition.x, equipmentPosition.z + 0.9],
  villageHomes[2],
  kalari,
);
const makeShopSign = (text: string, stall: THREE.Group) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#3b3528";
  context.fillRect(0, 0, 512, 96);
  context.fillStyle = "#ead8ac";
  context.font = "bold 30px sans-serif";
  context.textAlign = "center";
  context.fillText(text, 256, 59);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 0.5),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  sign.position.set(0, 2.05, -0.98);
  sign.rotation.y = Math.PI;
  stall.add(sign);
  const english: Record<string, string> = {
    "കളരി · ആയുധങ്ങൾ": "Kalari equipment — bow, sword and buckler",
    "പഴം · ₹1": "Banana — ₹1",
    "കരിക്കിൻ വെള്ളം · ₹2": "Tender coconut water — ₹2",
    "പുതിയ മീൻ": "Fresh fish",
  };
  translatedBoards.push({ object: sign, english: english[text] ?? text });
};
makeShopSign("കളരി · ആയുധങ്ങൾ", equipmentCounter);
marketStalls.forEach((stall, index) => {
  for (const child of [...stall.children]) {
    if (
      child instanceof THREE.Mesh &&
      child.geometry instanceof THREE.SphereGeometry &&
      child.geometry.parameters.radius === 0.16
    )
      stall.remove(child);
  }
  makeShopSign(
    index === 0
      ? "പഴം · ₹1"
      : index === 1
        ? "കരിക്കിൻ വെള്ളം · ₹2"
        : "പുതിയ മീൻ",
    stall,
  );
  if (index > 1) return;
  for (let item = 0; item < 9; item++) {
    const goods = index === 0 ? makeBanana() : makeDrinkingCoconut();
    goods.position.set(
      -0.8 + (item % 3) * 0.7,
      1.4,
      -0.4 + Math.floor(item / 3) * 0.35,
    );
    if (index === 0) goods.rotation.y = item * 0.5;
    stall.add(goods);
    shopGoods[index].push(goods);
  }
});
let fishSales = 0;
const marketFish: THREE.Group[] = [];
for (let item = 0; item < 12; item++) {
  const fish = makeMarketFish();
  fish.rotation.y = Math.PI / 2;
  fish.position.set(
    -0.85 + (item % 4) * 0.55,
    1.45,
    -0.45 + Math.floor(item / 4) * 0.32,
  );
  fish.visible = false;
  marketStalls[2].add(fish);
  marketFish.push(fish);
}
const equipFisher = (actor: WorkerActor) => {
  actor.fishTrade = createFishTrading();
  actor.fishingSite = actor.duty.work;
  const basket = new THREE.Group();
  const weave = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.22, 0.32, 12, 1, true),
    farmerBasketMaterial,
  );
  basket.add(weave);
  for (let item = 0; item < 3; item++) {
    const fish = makeMarketFish();
    fish.scale.setScalar(0.7);
    fish.rotation.y = Math.PI / 2;
    fish.position.set(0, 0.1, (item - 1) * 0.15);
    basket.add(fish);
  }
  basket.position.set(0, -0.5, -0.05);
  basket.visible = false;
  actor.arms[1].add(basket);
  actor.fishBasket = basket;
};
bankFishers.forEach((bank, index) => {
  const person = bankFisherPeople[index];
  const actor = registerWorker(
    person.figure,
    person.arms,
    person.legs,
    [bank.position.x, bank.position.z],
    villageHomes[index],
    bank,
  );
  actor.equipment = bank.children.filter((child) => child !== person.figure);
  equipFisher(actor);
});
fishingBoats.forEach((boat, index) => {
  const actor = registerWorker(
    boat.fisher,
    boat.arms,
    boat.legs,
    [boat.dock.x, boat.dock.z],
    villageHomes[index + 4],
    boat.group,
  );
  actor.boat = boat;
  equipFisher(actor);
});

const riverBridge = new THREE.Group();
const bridgeLength = bridgeSpan.halfLength * 2;
const bridgeSlope = (bridgeSpan.endY - bridgeSpan.startY) / bridgeLength;
const bridgeSlopeAngle = Math.atan(bridgeSlope);
const bridgeDeck = new THREE.Mesh(
  new THREE.BoxGeometry(bridgeLength, 0.22, bridgeSpan.halfWidth * 2),
  woodMaterial,
);
bridgeDeck.position.y = -0.11;
bridgeDeck.rotation.z = bridgeSlopeAngle;
bridgeDeck.castShadow = true;
bridgeDeck.receiveShadow = true;
riverBridge.add(bridgeDeck);
const plankCount = Math.ceil(bridgeLength / 0.55);
for (let plank = 0; plank < plankCount; plank++) {
  const x =
    -bridgeSpan.halfLength + ((plank + 0.5) * bridgeLength) / plankCount;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(
      bridgeLength / plankCount - 0.035,
      0.08,
      bridgeSpan.halfWidth * 2,
    ),
    cartTrim,
  );
  board.position.set(x, bridgeSlope * x - 0.04, 0);
  board.rotation.z = bridgeSlopeAngle;
  board.receiveShadow = true;
  riverBridge.add(board);
}
for (const side of [-1, 1]) {
  for (let postIndex = 0; postIndex <= 4; postIndex++) {
    const x = -bridgeSpan.halfLength + (postIndex * bridgeLength) / 4;
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.09, 1.1, 6),
      woodMaterial,
    );
    post.position.set(
      x,
      bridgeSlope * x + 0.48,
      side * (bridgeSpan.halfWidth - 0.1),
    );
    post.castShadow = true;
    riverBridge.add(post);
  }
  const rail = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.06,
      0.07,
      Math.hypot(bridgeLength, bridgeSpan.endY - bridgeSpan.startY),
      6,
    ),
    cartTrim,
  );
  rail.rotation.z = -Math.PI / 2 + bridgeSlopeAngle;
  rail.position.set(0, 1.02, side * (bridgeSpan.halfWidth - 0.1));
  riverBridge.add(rail);
}
riverBridge.position.set(
  bridgeSpan.x,
  (bridgeSpan.startY + bridgeSpan.endY) / 2,
  bridgeSpan.z,
);
riverBridge.rotation.y = Math.atan2(-bridgeSpan.roadZ, bridgeSpan.roadX);
scene.add(riverBridge);

const grassVertices: number[] = [];
for (let blade = 0; blade < 5; blade++) {
  const angle = (blade / 5) * Math.PI * 2;
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  const sideX = -directionZ * 0.028;
  const sideZ = directionX * 0.028;
  const baseX = directionX * 0.018;
  const baseZ = directionZ * 0.018;
  const tipX = directionX * (0.055 + (blade % 2) * 0.018);
  const tipZ = directionZ * (0.055 + (blade % 2) * 0.018);
  const height = 0.28 + (blade % 3) * 0.035;
  grassVertices.push(
    baseX - sideX,
    0,
    baseZ - sideZ,
    tipX,
    height,
    tipZ,
    baseX + sideX,
    0,
    baseZ + sideZ,
  );
}
const grassBladeGeometry = new THREE.BufferGeometry();
grassBladeGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute(grassVertices, 3),
);
grassBladeGeometry.computeVertexNormals();
grassBladeGeometry.computeBoundingSphere();
const grassMaterials = ["#718d4b", "#86984e", "#9c9b57"].map(
  (color) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
);
for (const [siteIndex, [siteX, siteZ]] of animalSites.entries()) {
  if (siteIndex >= 7 && siteIndex !== 9) continue;
  for (let colorIndex = 0; colorIndex < grassMaterials.length; colorIndex++) {
    const grass = new THREE.InstancedMesh(
      grassBladeGeometry,
      grassMaterials[colorIndex],
      48,
    );
    const transform = new THREE.Object3D();
    for (let blade = 0; blade < 48; blade++) {
      const x = siteX + (random() - 0.5) * 11;
      const z = siteZ + (random() - 0.5) * 11;
      const scale = 0.42 + random() * 0.75;
      transform.position.set(x, terrainHeight(x, z) + 0.015, z);
      transform.rotation.set(
        (random() - 0.5) * 0.24,
        random() * Math.PI,
        (random() - 0.5) * 0.24,
      );
      transform.scale.set(scale, scale, scale);
      transform.updateMatrix();
      grass.setMatrixAt(blade, transform.matrix);
    }
    grass.instanceMatrix.needsUpdate = true;
    grass.receiveShadow = true;
    scene.add(grass);
  }
}

const meadowMeshes = grassMaterials.map(
  (material) => new THREE.InstancedMesh(grassBladeGeometry, material, 6000),
);
const meadowTransform = new THREE.Object3D();
let meadowBladeCount = 0;
for (let attempt = 0; attempt < 56000 && meadowBladeCount < 18000; attempt++) {
  const x = (random() - 0.5) * 178;
  const z = (random() - 0.5) * 178;
  if (
    terrainHeight(x, z) < -1.8 ||
    distanceToRoad(x, z) < 3.3 ||
    distanceToRiver(x, z) < 5.2 ||
    isInsidePaddyReserve(x, z) ||
    isInsideKalariReserve(x, z) ||
    insideGarden(vegetablePlots, x, z, 0.6) ||
    insideNewHomesteadPath(x, z) ||
    isInsideTeaShop(x, z, 0.8) ||
    isInsideHeritageYard(x, z) ||
    insideTempleGround(x, z, 0.8)
  )
    continue;
  if (
    allBuildingSites.some(
      ([siteX, siteZ]) => Math.hypot(x - siteX, z - siteZ) < 4.8,
    )
  )
    continue;
  if (
    marketSites.some(([siteX, siteZ]) => Math.hypot(x - siteX, z - siteZ) < 3.2)
  )
    continue;
  if (Math.hypot(x - pondX, z - pondZ) < 6.4) continue;
  const scale = 0.28 + random() * 0.55;
  meadowTransform.position.set(x, terrainHeight(x, z) + 0.015, z);
  meadowTransform.rotation.set(
    (random() - 0.5) * 0.35,
    random() * Math.PI,
    (random() - 0.5) * 0.35,
  );
  meadowTransform.scale.set(scale, scale, scale);
  meadowTransform.updateMatrix();
  const mesh = meadowMeshes[meadowBladeCount % meadowMeshes.length];
  mesh.setMatrixAt(
    Math.floor(meadowBladeCount / meadowMeshes.length),
    meadowTransform.matrix,
  );
  meadowBladeCount++;
}
meadowMeshes.forEach((mesh, index) => {
  mesh.count = Math.ceil(
    Math.max(0, meadowBladeCount - index) / meadowMeshes.length,
  );
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
});

const player = new THREE.Group();
const bodyMaterial = new THREE.MeshStandardMaterial({
  color: "#bd7656",
  roughness: 0.86,
  flatShading: true,
});
const outfitMaterial = new THREE.MeshStandardMaterial({
  color: "#315b52",
  roughness: 0.93,
  flatShading: true,
});
const skinMaterial = new THREE.MeshStandardMaterial({
  color: "#e5b991",
  roughness: 0.9,
});
const hairMaterial = new THREE.MeshStandardMaterial({
  color: "#4c382d",
  roughness: 1,
});
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.34, 0.68, 4, 8),
  outfitMaterial,
);
body.position.y = 0.89;
body.castShadow = true;
player.add(body);
const head = new THREE.Mesh(
  new THREE.SphereGeometry(0.27, 12, 10),
  skinMaterial,
);
head.position.y = 1.57;
head.castShadow = true;
player.add(head);
const hair = new THREE.Mesh(
  new THREE.SphereGeometry(0.275, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.48),
  hairMaterial,
);
hair.position.set(0, 1.69, 0.015);
player.add(hair);
for (const eyeX of [-0.105, 0.105]) {
  const eye = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 7, 5),
    eyeMaterial,
  );
  eye.position.set(eyeX, 1.6, -0.247);
  player.add(eye);
}
const nose = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 7, 5),
  skinMaterial,
);
nose.scale.set(0.72, 0.78, 0.65);
nose.position.set(0, 1.52, -0.278);
player.add(nose);
const scarf = new THREE.Mesh(
  new THREE.BoxGeometry(0.54, 0.15, 0.32),
  bodyMaterial,
);
scarf.position.set(0, 1.28, 0.02);
scarf.rotation.x = -0.15;
player.add(scarf);
const playerMundu = new THREE.Mesh(
  new THREE.CylinderGeometry(0.27, 0.36, 0.7, 9),
  villagerDhotiMaterial,
);
playerMundu.position.y = 0.49;
playerMundu.castShadow = true;
player.add(playerMundu);
const backpack = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 0.5, 0.22),
  new THREE.MeshStandardMaterial({ color: "#9e8058", roughness: 1 }),
);
backpack.position.set(0, 0.99, 0.31);
backpack.castShadow = true;
player.add(backpack);
const playerLegs: THREE.Group[] = [];
for (const side of [-1, 1]) {
  const leg = new THREE.Group();
  leg.position.set(side * 0.17, 0.48, 0.02);
  const shin = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.105, 0.34, 3, 7),
    outfitMaterial,
  );
  shin.position.y = -0.17;
  leg.add(shin);
  const shoe = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.12, 0.34),
    woodMaterial,
  );
  shoe.position.set(0, -0.4, -0.07);
  leg.add(shoe);
  player.add(leg);
  playerLegs.push(leg);
}
const playerArms: THREE.Group[] = [];
for (const side of [-1, 1]) {
  const arm = new THREE.Group();
  arm.position.set(side * 0.31, 1.2, 0);
  const sleeve = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.105, 0.42, 3, 7),
    outfitMaterial,
  );
  sleeve.position.y = -0.23;
  arm.add(sleeve);
  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 7, 5),
    skinMaterial,
  );
  hand.position.set(-side * 0.02, -0.46, -0.015);
  arm.add(hand);
  player.add(arm);
  playerArms.push(arm);
}
const playerVisual = new THREE.Group();
while (player.children.length > 0) playerVisual.add(player.children[0]);
player.add(playerVisual);
scene.add(player);
const swimWake = new THREE.Group();
for (const radius of [0.48, 0.78]) {
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(radius, radius + 0.035, 32),
    new THREE.MeshBasicMaterial({
      color: "#d8ece0",
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ripple.rotation.x = -Math.PI / 2;
  swimWake.add(ripple);
}
swimWake.visible = false;
scene.add(swimWake);
const characterForward = new THREE.Vector3(0, 0, -1);
const characterTravelDirection = new THREE.Vector3();

const relicPositions = [
  [-28, -35],
  [26, -48],
  [48, -12],
  [35, 38],
  [4, 57],
  [-39, 43],
  [-55, 2],
  [-12, 15],
];
const relics: { group: THREE.Group; collected: boolean; phase: number }[] = [];
const relicMaterial = new THREE.MeshStandardMaterial({
  color: "#e6d5a4",
  emissive: "#75e7d2",
  emissiveIntensity: 1.4,
  metalness: 0.24,
  roughness: 0.25,
});
const ringMaterial = new THREE.MeshBasicMaterial({
  color: "#b5f6df",
  transparent: true,
  opacity: 0.78,
  side: THREE.DoubleSide,
});
for (const [index, [x, z]] of relicPositions.entries()) {
  const group = new THREE.Group();
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42, 0),
    relicMaterial,
  );
  crystal.rotation.z = Math.PI / 4;
  crystal.castShadow = true;
  group.add(crystal);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.018, 6, 32),
    ringMaterial,
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.17;
  group.add(halo);
  const glow = new THREE.PointLight("#86f2d4", 1.25, 7, 2);
  group.add(glow);
  group.position.set(x, terrainHeight(x, z) + 1.1, z);
  scene.add(group);
  relics.push({ group, collected: false, phase: index * 0.95 });
}

const distantHillMaterial = new THREE.MeshStandardMaterial({
  color: "#9aaf9b",
  roughness: 1,
  flatShading: true,
});
for (let i = 0; i < 13; i++) {
  const angle = (i / 13) * Math.PI * 2;
  const hill = new THREE.Mesh(makeRidgeGeometry(i + 1973), distantHillMaterial);
  const size = 10 + random() * 7;
  const distance = 160 + random() * 8;
  const placement = ridgePlacement(angle, size, distance);
  hill.position.set(placement.x, placement.y, placement.z);
  hill.scale.set(placement.scaleX, placement.scaleY, placement.scaleZ);
  scene.add(hill);
}

const playerState = {
  x: 0,
  z: 0,
  y: terrainHeight(0, 0),
  velocityY: 0,
  grounded: true,
  swimming: false,
};
const horseTemplate = createHorseCart(
  roadCurves[0],
  0,
  0,
  "#865b3e",
  "#9a683f",
);
vehicles.pop();
scene.remove(horseTemplate.group);
const playerHorse = horseTemplate.horse;
playerHorse.children.forEach((child) => (child.position.z += 2.18));
scene.add(playerHorse);
const saddle = new THREE.Mesh(
  new THREE.BoxGeometry(0.65, 0.16, 0.7),
  new THREE.MeshStandardMaterial({ color: "#563d2b", roughness: 1 }),
);
saddle.position.set(0, 1.5, 0.08);
playerHorse.add(saddle);
const horseReins = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.15, 1.65, -0.9),
    new THREE.Vector3(-0.2, 1.8, 0.1),
    new THREE.Vector3(0.2, 1.8, 0.1),
    new THREE.Vector3(0.15, 1.65, -0.9),
  ]),
  fishingLineMaterial,
);
playerHorse.add(horseReins);
playerHorse.position.set(8, terrainHeight(8, 14), 14);
const horseWalker: Walker = { x: 8, z: 14, path: [], waypoint: 0 };
let horseMode: "waiting" | "coming" | "ridden" = "waiting";
let horseStride = 0;
const carriedLights: {
  prop: ReturnType<typeof makeHandLight>;
  owner: THREE.Group;
  arm: THREE.Group;
  index: number;
}[] = [];
const attachNightLight = (
  owner: THREE.Group,
  arms: THREE.Group[],
  index: number,
) => {
  const prop = makeHandLight(index % 3 === 0 ? "leaf-torch" : "lamp");
  arms[0].add(prop.group);
  carriedLights.push({ prop, owner, arm: arms[0], index });
};
villagers.forEach((person, index) =>
  attachNightLight(person.group, person.arms, index),
);
workerActors.forEach((actor, index) =>
  attachNightLight(actor.group, actor.arms, index + 12),
);
coconutHarvesters.forEach((actor, index) =>
  attachNightLight(actor.person.figure, actor.person.arms, index + 40),
);
attachNightLight(player, playerArms, 41);
const rainUmbrellas: {
  owner: THREE.Group;
  umbrella: THREE.Group;
  kind: "umbrella" | "leaf";
  arm?: THREE.Group;
}[] = [];
let rainPersonIndex = 0;
const attachRainCover = (owner: THREE.Group, household = false) => {
  const kind = rainCoverFor(household, rainPersonIndex++);
  if (kind === "none") return;
  const arm =
    kind === "leaf"
      ? (villagers.find((v) => v.group === owner)?.arms[0] ??
        workerActors.find((a) => a.group === owner)?.arms[0] ??
        coconutHarvesters.find((a) => a.person.figure === owner)?.person
          .arms[0] ??
        (owner === player ? playerArms[0] : undefined))
      : undefined;
  const umbrella =
    kind === "umbrella" ? makeRainUmbrella() : makeHandheldLeaf();
  if (arm) {
    arm.add(umbrella);
    umbrella.position.set(0, -0.46, -0.04);
  } else owner.add(umbrella);
  rainUmbrellas.push({ owner, umbrella, kind, arm });
};
villagers.forEach((person) => attachRainCover(person.group));
workerActors.forEach((actor) => attachRainCover(actor.group));
coconutHarvesters.forEach((actor) => attachRainCover(actor.person.figure));
attachRainCover(player);
attachRainCover(lordActor.figure, true);
// Household passengers retain their cart/manchal canopy; only household walkers carry umbrellas.
const portableLightPool = Array.from({ length: 4 }, () => {
  const light = new THREE.PointLight("#ffb05a", 0, 8, 2);
  scene.add(light);
  return light;
});
const keys = new Set<string>();
let yaw = 0.22;
let pitch = 0.29;
let dragging = false;
let previousPointer = { x: 0, y: 0 };
let gameStarted = false;
let paused = false;
let foundCount = 0;
let toastTimeout = 0;
let wasSwimming = false;
let simulationTime = 0;
let lastFestivalActive = false;
const festivalPercussion = new FestivalPercussion();
document
  .querySelector("#festival-sound")!
  .addEventListener("click", async () => {
    try {
      const enabled = await festivalPercussion.toggle();
      document
        .querySelector("#festival-sound")!
        .setAttribute(
          "aria-label",
          enabled ? "Mute festival percussion" : "Enable festival percussion",
        );
    } catch {
      setToast("Audio is unavailable in this browser.");
    }
  });
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const timeLabel = document.querySelector<HTMLSpanElement>("#time-of-day")!;
const weatherLabel =
  document.querySelector<HTMLSpanElement>("#weather-status")!;
const daySky = new THREE.Color("#b8c9cf");
const nightSky = new THREE.Color("#1b2b40");
const sunsetSky = new THREE.Color("#d39879");
const stormSky = new THREE.Color("#667c7a");
const dayHorizon = new THREE.Color("#dde6ea");
const nightHorizon = new THREE.Color("#8191aa");
let lastEnvironmentLabel = "";
const updateEnvironment = (elapsed: number, delta: number) => {
  const day = sampleDayNight(elapsed);
  const weather = weatherCycle.sample(elapsed);
  const night = 1 - day.daylight;
  skyColor
    .copy(nightSky)
    .lerp(daySky, day.daylight)
    .lerp(sunsetSky, day.twilight * (1 - weather.cloud * 0.35))
    .lerp(stormSky, weather.cloud * day.daylight * 0.3);
  atmosphere.color.copy(skyColor);
  atmosphere.density = 0.0058 + weather.cloud * 0.0014 + weather.rain * 0.002;
  hemisphere.color.copy(nightHorizon).lerp(dayHorizon, day.daylight);
  hemisphere.intensity = 0.55 + day.daylight * (1.15 - weather.cloud * 0.35);
  scene.environmentIntensity = 0.04 + day.daylight * 0.3;
  const sunAngle = ((day.hour - 6) * Math.PI) / 12;
  const sunX = Math.cos(sunAngle);
  const sunY = Math.max(0.02, day.sunHeight);
  sun.target.position.set(playerState.x, playerState.y, playerState.z);
  sun.position.set(
    playerState.x + sunX * 65,
    playerState.y + sunY * 75,
    playerState.z - 35,
  );
  sun.intensity = Math.max(0, day.sunHeight) * 3.2 * (1 - weather.cloud * 0.55);
  sun.castShadow = day.sunHeight > 0.08;
  sunDisc.position.set(
    playerState.x + sunX * 120,
    playerState.y + sunY * 115,
    playerState.z - 65,
  );
  sunDisc.visible = day.sunHeight > 0.02;
  const moonAngle = ((day.hour - 18) * Math.PI) / 12;
  const moonHeight = Math.sin(moonAngle);
  moonlight.target.position.copy(sun.target.position);
  moonlight.position.set(
    playerState.x + Math.cos(moonAngle) * 60,
    playerState.y + Math.max(0.1, moonHeight) * 70,
    playerState.z + 40,
  );
  moonlight.intensity = night * 0.75 * (1 - weather.cloud * 0.35);
  moonDisc.position.set(
    playerState.x + Math.cos(moonAngle) * 110,
    playerState.y + Math.max(0, moonHeight) * 105,
    playerState.z + 65,
  );
  moonDisc.visible = night > 0.15 && moonHeight > 0;
  stars.position.set(playerState.x, playerState.y, playerState.z);
  starsMaterial.opacity = night * (1 - weather.cloud * 0.8) * 0.85;
  stars.visible = starsMaterial.opacity > 0.02;
  clouds.position.set(playerState.x, 0, playerState.z);
  cloudMaterial.color.set(night > 0.5 ? "#7d8995" : "#f3eee1");
  cloudMaterial.opacity = (0.18 + weather.cloud * 0.5) * (1 - night * 0.35);
  lampGlass.emissiveIntensity = night * 1.8;
  for (const lamp of villageLamps) lamp.intensity = night * 2.2;
  renderer.toneMappingExposure = 1.02 + day.daylight * 0.1;
  rain.visible = weather.rain > 0.03 && !reducedMotion.matches;
  if (rain.visible) {
    rain.position.set(playerState.x, playerState.y + 1, playerState.z);
    rainMaterial.opacity = Math.min(0.75, weather.rain * 0.8);
    rainGeometry.setDrawRange(0, Math.ceil(rainCount * weather.rain) * 2);
    for (let i = 0; i < rainCount; i++) {
      const offset = i * 6;
      let x = rainPositions[offset] + delta * 0.7;
      let y = rainPositions[offset + 1] - delta * (13 + (i % 5));
      if (x > 17) x -= 34;
      if (y < -1) y += 20;
      rainPositions[offset] = x;
      rainPositions[offset + 1] = y;
      rainPositions[offset + 3] = x - 0.1;
      rainPositions[offset + 4] = y - 0.55;
      rainPositions[offset + 5] = rainPositions[offset + 2];
    }
    (rainGeometry.attributes.position as THREE.BufferAttribute).needsUpdate =
      true;
  }
  const label = `${day.label}|${weather.label}`;
  if (label !== lastEnvironmentLabel) {
    timeLabel.textContent = day.label;
    weatherLabel.textContent = weather.label;
    world.dataset.time = day.label;
    world.dataset.weather = weather.kind;
    lastEnvironmentLabel = label;
  }
  return day;
};
const worldCanvas = renderer.domElement;
const interactionPrompt = document.querySelector<HTMLDivElement>(
  "#interaction-prompt",
)!;
const welcomeScreen =
  document.querySelector<HTMLDivElement>("#welcome-screen")!;
const minimap = document.querySelector<HTMLCanvasElement>("#minimap")!;
const mapContext = minimap.getContext("2d")!;
const minimapRoads = roadCurves.map((curve) => curve.getPoints(90));
const minimapRiver = riverRoute.getPoints(120);
let lastMinimapUpdate = -Infinity;
let nearbyVillager: Villager | undefined;
let lastInteractionPrompt = "";
const wallet: Wallet = {
  rupees: 20,
  bananasEaten: 0,
  coconutsDrunk: 0,
  teasDrunk: 0,
  snacksEaten: 0,
};
const equipment = createEquipmentBelt();
const heldEquipment = {
  bow: makeEquipment("bow"),
  sword: makeEquipment("sword"),
  shield: makeEquipment("shield"),
};
for (const kind of ["bow", "sword", "shield"] as const) {
  const prop = heldEquipment[kind];
  prop.position.set(0, -0.47, -0.08);
  prop.visible = false;
  if (kind === "sword") prop.rotation.x = -Math.PI / 2;
  playerArms[kind === "shield" ? 0 : 1].add(prop);
}
let openShop: "kalari" | "tea" | "toddy" | undefined;
const shopMenu = document.querySelector<HTMLElement>("#shop-menu")!;
const closeShop = () => {
  openShop = undefined;
  shopMenu.hidden = true;
};
let consuming: { kind: FoodKind; remaining: number } | undefined;
let lastShopDay = 0;
const heldBanana = makeBanana();
const heldCoconut = makeDrinkingCoconut();
const heldTea = makeTeaGlass(),
  heldSnack = makeSnack();
const heldToddy = makeTeaGlass();
heldToddy.position.set(0, -0.43, -0.06);
heldToddy.visible = false;
playerArms[1].add(heldToddy);
const toddyLiquid = heldToddy.children[1] as THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshStandardMaterial
>;
toddyLiquid.material.color.set("#dfdfbd");
const toddyState: ToddyState = { level: 0, nausea: 0, episodes: 0 };
heldBanana.position.set(0, -0.44, -0.04);
heldCoconut.position.set(0, -0.43, -0.06);
heldBanana.visible = heldCoconut.visible = false;
playerArms[1].add(heldBanana, heldCoconut);
heldTea.position.set(0, -0.43, -0.06);
heldSnack.position.set(0, -0.44, -0.04);
heldTea.visible = heldSnack.visible = false;
playerArms[1].add(heldTea, heldSnack);
const shopFront = (shop: THREE.Group) =>
  shop.localToWorld(new THREE.Vector3(0, 0, -2.1));
const nearbyTeaShop = () => {
  const p = shopFront(teaShop);
  return Math.hypot(playerState.x - p.x, playerState.z - p.z) < 3.4;
};
const nearbyToddyShop = () => {
  const p = shopFront(toddyShop);
  return Math.hypot(playerState.x - p.x, playerState.z - p.z) < 3.4;
};
const nearbyKalariShop = () =>
  Math.hypot(
    playerState.x - equipmentPosition.x,
    playerState.z - equipmentPosition.z,
  ) < 2.5;
const nearestFoodShop = () => {
  let nearest: { index: number; distance: number } | undefined;
  shops.forEach((_shop, index) => {
    if (index > 1) return;
    const stall = shopLocations[index];
    const distance = Math.hypot(
      playerState.x - stall.position.x,
      playerState.z - stall.position.z,
    );
    if (distance <= 3.4 && (!nearest || distance < nearest.distance))
      nearest = { index, distance };
  });
  return nearest;
};
const updateWallet = () => {
  document.querySelector("#wallet-status")!.textContent = `₹${wallet.rupees}`;
  world.dataset.wallet = JSON.stringify(wallet);
};

const setToast = (message: string) => {
  const toast = document.querySelector<HTMLDivElement>("#toast")!;
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(
    () => toast.classList.remove("visible"),
    2600,
  );
};
const nearestBoard = () =>
  translatedBoards
    .map((board) => ({
      board,
      position: board.object.getWorldPosition(new THREE.Vector3()),
    }))
    .map((entry) => ({
      ...entry,
      distance: Math.hypot(
        entry.position.x - playerState.x,
        entry.position.z - playerState.z,
      ),
    }))
    .filter((entry) => entry.distance < 5)
    .sort((a, b) => a.distance - b.distance)[0];
const buyNearbyFood = (foodIndex?: number) => {
  const front =
    foodIndex === undefined ? undefined : shopFront(shopLocations[foodIndex]);
  const nearby =
    foodIndex === undefined
      ? nearestFoodShop()
      : {
          index: foodIndex,
          distance: Math.hypot(
            playerState.x - front!.x,
            playerState.z - front!.z,
          ),
        };
  if (!nearby) return false;
  const shop = shops[nearby.index];
  if (horseMode === "ridden" || playerState.swimming) {
    setToast("Dismount and walk up to the counter to buy food.");
    return true;
  }
  const hour = sampleDayNight(simulationTime).hour;
  const sellerPresent =
    foodSellers[nearby.index].working &&
    foodSellers[nearby.index].group.visible &&
    (shop.kind === "toddy" ? hour >= 10 && hour < 20 : isWorkday(hour));
  const result = purchaseFood(
    wallet,
    shop,
    sellerPresent,
    nearby.distance,
    Boolean(consuming) || toddyState.nausea > 0,
  );
  if (result === "purchased") {
    consuming = { kind: shop.kind, remaining: FOOD[shop.kind].duration };
    heldBanana.visible = shop.kind === "banana";
    heldCoconut.visible = shop.kind === "coconut-water";
    heldTea.visible = shop.kind === "tea";
    heldSnack.visible = shop.kind === "snack";
    heldToddy.visible = shop.kind === "toddy";
    shopGoods[nearby.index].forEach(
      (good, index) => (good.visible = index < Math.min(9, shop.stock)),
    );
    foodSellers[nearby.index].arms[1].rotation.x = 1;
    document.querySelector("#food-status")!.textContent =
      `Enjoying ${FOOD[shop.kind].label}…`;
    updateWallet();
    setToast(
      `Bought ${FOOD[shop.kind].label} for ₹${FOOD[shop.kind].price}. Enjoy!`,
    );
  } else
    setToast(
      result === "closed"
        ? "The seller has gone home. Come back after sunrise."
        : result === "sold-out"
          ? "Sold out for today. Fresh stock arrives tomorrow."
          : result === "no-money"
            ? "Not enough rupees. Gather starlight to earn ₹5."
            : "Finish your food first.",
    );
  return true;
};
const updateEquipment = () => {
  const label =
    equipment.selected === "none"
      ? "none"
      : KALARI_GOODS[equipment.selected].label;
  document.querySelector("#equipment-status")!.textContent =
    `F · ${label} · R to use`;
  world.dataset.equipment = JSON.stringify(equipment);
};
const practiceArrows: {
  group: THREE.Group;
  direction: THREE.Vector3;
  remaining: number;
}[] = [];
const respondToEquipment = (kind: EquipmentKind) => {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
    player.quaternion,
  );
  if (kind === "bow") {
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.65, 6),
      woodMaterial,
    );
    shaft.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.1, 5),
      animalHooves,
    );
    head.rotation.x = -Math.PI / 2;
    head.position.z = -0.37;
    arrow.add(shaft, head);
    arrow.position.set(playerState.x, playerState.y + 1.35, playerState.z);
    arrow.quaternion.copy(player.quaternion);
    scene.add(arrow);
    practiceArrows.push({
      group: arrow,
      direction: forward.clone(),
      remaining: 0.9,
    });
    if (practiceArrows.length > 6) {
      const old = practiceArrows.shift()!;
      scene.remove(old.group);
      old.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
    }
  }
  if (kind === "shield") return;
  let responses = 0;
  for (const animal of ambientAnimals) {
    if (!animal.group.visible) continue;
    const dx = animal.group.position.x - playerState.x,
      dz = animal.group.position.z - playerState.z,
      distance = Math.hypot(dx, dz);
    if (
      !inEquipmentReach(
        kind,
        distance,
        (dx * forward.x + dz * forward.z) / Math.max(0.01, distance),
      )
    )
      continue;
    animal.startledUntil = simulationTime + 3;
    animal.waitUntil = simulationTime;
    if (animal.nightPatrol) {
      const patrol = animal.nightPatrol;
      if (patrol.outward) {
        patrol.walker.path = [
          ...patrol.route.slice(0, patrol.walker.waypoint + 1),
        ].reverse();
        patrol.walker.waypoint = 0;
        patrol.outward = false;
      }
      responses++;
      continue;
    }
    const wild = !["cow", "hen", "duck"].includes(animal.species);
    for (const angleOffset of [0, 0.6, -0.6, 1.2, -1.2]) {
      const angle = Math.atan2(dz, dx) + angleOffset;
      const tx = animal.group.position.x + Math.cos(angle) * 4,
        tz = animal.group.position.z + Math.sin(angle) * 4;
      let safe = true;
      for (let step = 1; step <= 8; step++) {
        const x =
            animal.group.position.x +
            ((tx - animal.group.position.x) * step) / 8,
          z =
            animal.group.position.z +
            ((tz - animal.group.position.z) * step) / 8;
        if (
          wild
            ? !isForestHabitat(x, z)
            : Boolean(getWaterInfo(x, z)) ||
              allBuildingSites.some(
                ([hx, hz]) => Math.hypot(x - hx, z - hz) < 4,
              ) ||
              isInsidePaddyReserve(x, z)
        ) {
          safe = false;
          break;
        }
      }
      if (safe) {
        animal.targetX = tx;
        animal.targetZ = tz;
        responses++;
        break;
      }
    }
  }
  world.dataset.animalResponses = String(responses);
};
const purchaseKalari = (kind: EquipmentKind) => {
  const result = buyEquipment(
    equipment,
    wallet,
    kind,
    nearbyKalariShop() &&
      equipmentSeller.working &&
      isWorkday(sampleDayNight(simulationTime).hour),
    Boolean(consuming) || horseMode === "ridden" || playerState.swimming,
  );
  if (result === "purchased") {
    updateWallet();
    updateEquipment();
    setToast(
      `${KALARI_GOODS[kind].label} purchased. F selects equipment; R uses it.`,
    );
  } else
    setToast(
      result === "owned"
        ? "You already own this equipment."
        : result === "closed"
          ? "The kalari merchant is unavailable. Visit during the day."
          : result === "no-money"
            ? "Not enough rupees. Each starlight earns ₹5."
            : "Finish your food and dismount first.",
    );
};
const showShop = (kind: "kalari" | "tea" | "toddy") => {
  openShop = kind;
  shopMenu.hidden = false;
  keys.clear();
  document.querySelector("#shop-title")!.textContent =
    kind === "toddy"
      ? "കള്ളുഷാപ്പ് · Toddy shop"
      : kind === "tea"
        ? "ചായക്കട · Chaya Kada"
        : "Kalari equipment";
  const options = document.querySelector("#shop-options")!;
  options.replaceChildren();
  const addChoice = (label: string, action: () => void) => {
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", () => {
      action();
      closeShop();
    });
    options.append(button);
  };
  if (kind === "kalari")
    for (const item of ["bow", "sword", "shield"] as const)
      addChoice(
        `${KALARI_GOODS[item].label} · ₹${KALARI_GOODS[item].price}`,
        () => purchaseKalari(item),
      );
  else if (kind === "tea") {
    addChoice("Chaya · Tea · ₹1", () => buyNearbyFood(2));
    addChoice("Pazham pori · Banana fritter · ₹2", () => buyNearbyFood(3));
  } else addChoice("Toddy · ₹2 · Temporary impairment", () => buyNearbyFood(4));
};
document.querySelector("#close-shop")!.addEventListener("click", closeShop);

const collectNearby = () => {
  const target = relics.find(
    (relic) =>
      !relic.collected &&
      Math.hypot(
        relic.group.position.x - playerState.x,
        relic.group.position.z - playerState.z,
      ) < 3.4,
  );
  if (!target) return false;
  target.collected = true;
  target.group.visible = false;
  foundCount += 1;
  wallet.rupees += 5;
  updateWallet();
  document.querySelector<HTMLSpanElement>("#fragment-count")!.textContent =
    `STARLIGHT ${foundCount} / 8`;
  setToast(
    foundCount === relics.length
      ? "The whole sky is yours again. ✦"
      : "A little more starlight found. ✦",
  );
  if (foundCount === relics.length)
    document.querySelector<HTMLDivElement>("#region-name")!.textContent =
      "STARFALL GLADE";
  return true;
};

const talkNearbyVillager = () => {
  const activity = heritageActivities.find(
    ([x, z]) => Math.hypot(playerState.x - x, playerState.z - z) < 3,
  );
  if (activity) {
    setToast(activity[3]);
    return;
  }
  const villager = villagers.find(
    (person) =>
      Math.hypot(
        person.group.position.x - playerState.x,
        person.group.position.z - playerState.z,
      ) < 2.8,
  );
  if (!villager) return;
  const places: Record<VillageActivity, string> = {
    home: "home",
    market: "the market",
    fields: "the paddy fields",
    kalari: "the kalari",
    village: "the village",
    temple: "the temple courtyard",
  };
  const greetings = [
    `${villager.name}: The old road leads all the way to the river.`,
    `${villager.name}: I am ${villager.walker.path.length ? "on my way to" : "spending some time near"} ${places[villager.destination]}.`,
    `${villager.name}: Lovely day for a wander, isn't it?`,
    `${villager.name}: The little cottages are always open to travelers.`,
  ];
  setToast(greetings[Math.floor(Math.random() * greetings.length)]);
};

document
  .querySelector<HTMLButtonElement>("#play-button")!
  .addEventListener("click", () => {
    gameStarted = true;
    paused = false;
    welcomeScreen.classList.add("hidden");
    document
      .querySelector<HTMLDivElement>(".game-hud")!
      .classList.add("active");
    document.querySelector<HTMLElement>(".bottom-bar")!.classList.add("active");
    setToast("Follow the lanes. The red diamond marks the kalari.");
  });

const togglePause = () => {
  if (!gameStarted) return;
  closeShop();
  paused = !paused;
  welcomeScreen.classList.toggle("hidden", !paused);
  welcomeScreen.classList.toggle("paused", paused);
  const title = welcomeScreen.querySelector("h1")!;
  const copy =
    welcomeScreen.querySelector<HTMLParagraphElement>(".welcome-copy")!;
  const playLabel =
    welcomeScreen.querySelector<HTMLSpanElement>(".play-button span")!;
  title.innerHTML = paused
    ? "Take a breath.<br><em>The wild can wait.</em>"
    : "Find your way<br>back to <em>wonder.</em>";
  copy.textContent = paused
    ? "Your little corner of the world will be right here when you are ready."
    : "Follow the village lanes to the kalari, rice paddies and river. Watch coconut harvesters climb, meet people on their daily rounds, and explore as the weather and time change.";
  playLabel.textContent = paused ? "Back to wandering" : "Step into the wild";
  paused = paused;
};
document
  .querySelector<HTMLButtonElement>("#pause-button")!
  .addEventListener("click", togglePause);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key))
    event.preventDefault();
  keys.add(key);
  if (key === "l" && !event.repeat && gameStarted && !paused) {
    const entry = nearestBoard();
    setToast(
      entry
        ? `English: ${entry.board.english}`
        : "Walk closer to a Malayalam sign, then press L.",
    );
  }
  if (
    key === "q" &&
    !event.repeat &&
    gameStarted &&
    !paused &&
    toddyState.level >= 0.3
  )
    setToast(
      "You feel unsteady. Wait until the toddy effects wear off before riding.",
    );
  if (
    key === "f" &&
    !event.repeat &&
    gameStarted &&
    !paused &&
    !consuming &&
    !openShop
  ) {
    cycleEquipment(equipment);
    updateEquipment();
  }
  if (
    key === "r" &&
    !event.repeat &&
    gameStarted &&
    !paused &&
    !openShop &&
    !consuming
  ) {
    if (
      useEquipment(equipment, !playerState.swimming && horseMode !== "ridden")
    ) {
      updateEquipment();
      setToast(
        equipment.selected === "shield"
          ? "Buckler guard raised."
          : equipment.selected === "bow"
            ? "Bow practice — animals flee without injury."
            : "Sword practice — animals flee without injury.",
      );
      if (equipment.selected !== "none") respondToEquipment(equipment.selected);
    } else if (equipment.selected === "none")
      setToast("Buy equipment at the kalari, then select it with F.");
  }
  if (key === "escape") togglePause();
  if (
    key === "q" &&
    !event.repeat &&
    gameStarted &&
    !paused &&
    !consuming &&
    !openShop &&
    toddyState.level < 0.3
  ) {
    const distance = Math.hypot(
      playerState.x - playerHorse.position.x,
      playerState.z - playerHorse.position.z,
    );
    const action = horseAction(
      horseMode === "ridden",
      distance,
      !playerState.swimming && playerState.grounded,
    );
    if (action === "dismount") {
      const sideX = Math.cos(playerHorse.rotation.y) * 1.4;
      const sideZ = -Math.sin(playerHorse.rotation.y) * 1.4;
      const options = [
        [playerState.x + sideX, playerState.z + sideZ],
        [playerState.x - sideX, playerState.z - sideZ],
      ];
      const spot = options.find(
        ([x, z]) =>
          (!getWaterInfo(x, z) ||
            bridgeHeightAt(bridgeSpan, x, z) !== undefined) &&
          !worldSolids.some((solid) => insideSolid(solid, x, z, 0.35)),
      );
      if (!spot) {
        setToast("Ride onto dry ground before dismounting.");
        return;
      }
      horseMode = "waiting";
      [playerState.x, playerState.z] = spot;
      playerState.y =
        bridgeHeightAt(bridgeSpan, ...(spot as [number, number])) ??
        terrainHeight(...(spot as [number, number]));
      setToast("Dismounted. Q calls your horse again.");
    } else if (action === "mount") {
      horseMode = "ridden";
      playerState.x = playerHorse.position.x;
      playerState.z = playerHorse.position.z;
      playerState.y = playerHorse.position.y;
      playerState.velocityY = 0;
      player.quaternion.copy(playerHorse.quaternion);
      setToast("Mounted — WASD to ride, Shift to gallop, Q to dismount.");
    } else if (action === "summon") {
      horseMode = "coming";
      horseWalker.x = playerHorse.position.x;
      horseWalker.z = playerHorse.position.z;
      routeTo(
        horseWalker,
        [playerState.x, playerState.z],
        villagePaths.findPath,
      );
      setToast("Your horse is coming along the lane. Press Q nearby to mount.");
    } else setToast("Call your horse from dry ground.");
  }
  if (key === "e" && !event.repeat && gameStarted && !paused) {
    if (openShop) closeShop();
    else if (!consuming && nearbyKalariShop()) showShop("kalari");
    else if (!consuming && nearbyTeaShop()) showShop("tea");
    else if (!consuming && nearbyToddyShop()) showShop("toddy");
    else if (!buyNearbyFood() && !consuming && !collectNearby())
      talkNearbyVillager();
  }
});
window.addEventListener("keyup", (event) =>
  keys.delete(event.key.toLowerCase()),
);
window.addEventListener("blur", () => keys.clear());
world.addEventListener("pointerdown", (event) => {
  if (!gameStarted || paused) return;
  dragging = true;
  previousPointer = { x: event.clientX, y: event.clientY };
  worldCanvas.setPointerCapture(event.pointerId);
});
world.addEventListener("pointermove", (event) => {
  if (!dragging || !gameStarted || paused) return;
  yaw -= (event.clientX - previousPointer.x) * 0.004;
  pitch = THREE.MathUtils.clamp(
    pitch + (event.clientY - previousPointer.y) * 0.003,
    -0.12,
    0.72,
  );
  previousPointer = { x: event.clientX, y: event.clientY };
});
world.addEventListener("pointerup", () => {
  dragging = false;
});
world.addEventListener("pointercancel", () => {
  dragging = false;
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    if (gameStarted && !paused) togglePause();
  }
});

const drawMinimap = () => {
  const size = minimap.width;
  const center = size / 2;
  const range = 36;
  mapContext.clearRect(0, 0, size, size);
  mapContext.save();
  mapContext.beginPath();
  mapContext.arc(center, center, center - 2, 0, Math.PI * 2);
  mapContext.clip();
  mapContext.fillStyle = "#627963";
  mapContext.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 3) {
    for (let y = 0; y < size; y += 3) {
      const worldX = playerState.x + ((x - center) / center) * range;
      const worldZ = playerState.z + ((y - center) / center) * range;
      const height = terrainHeight(worldX, worldZ);
      if (height > 5.5) {
        mapContext.fillStyle = "rgba(207, 204, 160, 0.25)";
        mapContext.fillRect(x, y, 3, 3);
      } else if (height < -1.7) {
        mapContext.fillStyle = "rgba(116, 172, 164, 0.3)";
        mapContext.fillRect(x, y, 3, 3);
      }
    }
  }
  const mapPoint = (x: number, z: number) => ({
    x: center + ((x - playerState.x) / range) * center,
    y: center + ((z - playerState.z) / range) * center,
  });
  for (const [fieldX, fieldZ] of paddyPlots) {
    const topLeft = mapPoint(fieldX - 5.5, fieldZ - 4.5);
    const bottomRight = mapPoint(fieldX + 5.5, fieldZ + 4.5);
    mapContext.fillStyle = "rgba(126, 158, 133, .78)";
    mapContext.fillRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
    mapContext.strokeStyle = "rgba(191, 170, 123, .9)";
    mapContext.lineWidth = 1.5;
    mapContext.strokeRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
  }
  for (const plot of vegetablePlots) {
    const a = mapPoint(
      plot.center[0] - plot.halfWidth,
      plot.center[1] - plot.halfDepth,
    );
    const b = mapPoint(
      plot.center[0] + plot.halfWidth,
      plot.center[1] + plot.halfDepth,
    );
    mapContext.fillStyle = plot.crop === "brinjal" ? "#785b75" : "#50753d";
    mapContext.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    mapContext.strokeStyle = "#c2a477";
    mapContext.lineWidth = 1;
    mapContext.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
  const templeMark = mapPoint(...templeSite);
  mapContext.fillStyle = "#e7b867";
  mapContext.fillRect(templeMark.x - 4, templeMark.y - 4, 8, 8);
  mapContext.beginPath();
  minimapRiver.forEach((point, index) => {
    const position = mapPoint(point.x, point.z);
    if (index === 0) mapContext.moveTo(position.x, position.y);
    else mapContext.lineTo(position.x, position.y);
  });
  mapContext.strokeStyle = "rgba(112, 173, 166, .9)";
  mapContext.lineWidth = 5;
  mapContext.stroke();
  mapContext.lineCap = "round";
  mapContext.lineJoin = "round";
  for (const points of minimapRoads) {
    mapContext.beginPath();
    points.forEach((point, index) => {
      const position = mapPoint(point.x, point.z);
      if (index === 0) mapContext.moveTo(position.x, position.y);
      else mapContext.lineTo(position.x, position.y);
    });
    mapContext.strokeStyle = "rgba(146, 117, 81, .78)";
    mapContext.lineWidth = 5;
    mapContext.stroke();
    mapContext.strokeStyle = "rgba(76, 57, 39, .9)";
    mapContext.lineWidth = 2.5;
    mapContext.stroke();
  }
  for (const tree of trees) {
    const dx = ((tree.position.x - playerState.x) / range) * center;
    const dz = ((tree.position.z - playerState.z) / range) * center;
    if (Math.abs(dx) < center && Math.abs(dz) < center) {
      mapContext.fillStyle = "rgba(31, 57, 43, 0.72)";
      mapContext.beginPath();
      mapContext.arc(center + dx, center + dz, 1.8, 0, Math.PI * 2);
      mapContext.fill();
    }
  }
  for (const cottage of cottages) {
    const point = mapPoint(cottage.position.x, cottage.position.z);
    if (
      Math.abs(point.x - center) < center &&
      Math.abs(point.y - center) < center
    ) {
      const isManor = cottage === landlordEstate;
      mapContext.fillStyle = isManor ? "#e4bd72" : "#e0cfaa";
      mapContext.fillRect(
        point.x - (isManor ? 3.5 : 2.5),
        point.y - (isManor ? 3 : 2),
        isManor ? 7 : 5,
        isManor ? 6 : 4,
      );
    }
  }
  for (const stall of marketStalls) {
    const point = mapPoint(stall.position.x, stall.position.z);
    if (
      Math.abs(point.x - center) < center &&
      Math.abs(point.y - center) < center
    ) {
      mapContext.fillStyle = "#d5a856";
      mapContext.fillRect(point.x - 3, point.y - 2.5, 6, 5);
    }
  }
  const kalariPoint = mapPoint(kalariSite[0], kalariSite[1]);
  if (
    Math.abs(kalariPoint.x - center) < center &&
    Math.abs(kalariPoint.y - center) < center
  ) {
    mapContext.fillStyle = "#d4815d";
    mapContext.beginPath();
    mapContext.moveTo(kalariPoint.x, kalariPoint.y - 5);
    mapContext.lineTo(kalariPoint.x + 5, kalariPoint.y);
    mapContext.lineTo(kalariPoint.x, kalariPoint.y + 5);
    mapContext.lineTo(kalariPoint.x - 5, kalariPoint.y);
    mapContext.closePath();
    mapContext.fill();
  }
  for (const villager of villagers) {
    if (!villager.group.visible) continue;
    const point = mapPoint(
      villager.group.position.x,
      villager.group.position.z,
    );
    if (
      Math.abs(point.x - center) < center &&
      Math.abs(point.y - center) < center
    ) {
      mapContext.fillStyle = "#e9a687";
      mapContext.beginPath();
      mapContext.arc(point.x, point.y, 2, 0, Math.PI * 2);
      mapContext.fill();
    }
  }
  for (const animal of ambientAnimals) {
    if (!animal.group.visible) continue;
    const point = mapPoint(animal.group.position.x, animal.group.position.z);
    if (
      Math.abs(point.x - center) < center &&
      Math.abs(point.y - center) < center
    ) {
      mapContext.fillStyle =
        animal.species === "cow"
          ? "#e5d7b6"
          : animal.species === "elephant"
            ? "#96968a"
            : animal.species === "duck"
              ? "#d9c46d"
              : animal.species === "hen"
                ? "#d58a55"
                : "#c69a6a";
      mapContext.beginPath();
      mapContext.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
      mapContext.fill();
    }
  }
  for (const vehicle of vehicles) {
    if (!vehicle.group.visible) continue;
    const point = mapPoint(vehicle.group.position.x, vehicle.group.position.z);
    if (
      Math.abs(point.x - center) < center &&
      Math.abs(point.y - center) < center
    ) {
      mapContext.fillStyle = "#d99a70";
      mapContext.fillRect(point.x - 2.5, point.y - 1.5, 5, 3);
    }
  }
  for (const relic of relics) {
    if (relic.collected) continue;
    const dx = ((relic.group.position.x - playerState.x) / range) * center;
    const dz = ((relic.group.position.z - playerState.z) / range) * center;
    if (Math.abs(dx) < center && Math.abs(dz) < center) {
      mapContext.fillStyle = "#a8ffe1";
      mapContext.beginPath();
      mapContext.arc(center + dx, center + dz, 3, 0, Math.PI * 2);
      mapContext.fill();
    }
  }
  mapContext.translate(center, center);
  mapContext.rotate(-yaw);
  mapContext.fillStyle = "#fff4db";
  mapContext.beginPath();
  mapContext.moveTo(0, -6);
  mapContext.lineTo(4, 5);
  mapContext.lineTo(0, 3);
  mapContext.lineTo(-4, 5);
  mapContext.closePath();
  mapContext.fill();
  mapContext.restore();
};

const earthDetail = detailTexture("earth");
const groundDetail = detailTexture("earth", 75);
const woodDetail = detailTexture("wood", 3);
const thatchDetail = detailTexture("thatch", 7);
const clothDetail = detailTexture("cloth", 5);
const waterDetail = detailTexture("water");
const textureMaterials = (
  materials: THREE.Material[],
  texture: THREE.Texture,
  depth: number,
) => {
  materials.forEach((material) => {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    material.map = texture;
    material.bumpMap = texture;
    material.bumpScale = depth;
    material.needsUpdate = true;
  });
};
textureMaterials([ground.material], groundDetail, 0.055);
textureMaterials(
  [
    roadMaterial,
    shoulderMaterial,
    junctionMaterial,
    paddySoilMaterial,
    paddyBundMaterial,
    kalariEarth,
    ...wallMaterials,
    estateWallMaterial,
    lateriteMaterial,
  ],
  earthDetail,
  0.045,
);
textureMaterials(
  [
    woodMaterial,
    trunkMaterial,
    palmBark,
    cartWood,
    cartTrim,
    wheelWood,
    boatWoodMaterial,
    boatTrimMaterial,
    farmerBasketMaterial,
  ],
  woodDetail,
  0.025,
);
textureMaterials(
  [...roofMaterials, thatchLineMaterial, kalariThatch, farmerHatMaterial],
  thatchDetail,
  0.065,
);
textureMaterials(
  [
    ...villagerMaterials,
    ...villagerSariMaterials,
    ...farmerClothes,
    ...farmerSariMaterials,
    villagerDhotiMaterial,
    farmerMunduMaterial,
    nobleCloth,
    guardCloth,
    outfitMaterial,
  ],
  clothDetail,
  0.008,
);
riverWaterMaterial.bumpMap = waterDetail;
riverWaterMaterial.bumpScale = 0.035;
paddyWaterMaterial.bumpMap = waterDetail;
paddyWaterMaterial.bumpScale = 0.02;
const smoothGeometry = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
scene.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  materials.forEach((material) => {
    if (
      material instanceof THREE.MeshStandardMaterial &&
      material !== rockMaterial &&
      material !== lateriteMaterial
    ) {
      material.flatShading = false;
      material.needsUpdate = true;
    }
  });
  const geometry = object.geometry;
  if (
    geometry instanceof THREE.SphereGeometry &&
    geometry.parameters.radius < 1 &&
    geometry.parameters.widthSegments < 16
  ) {
    let smooth = smoothGeometry.get(geometry);
    if (!smooth) {
      const p = geometry.parameters;
      smooth = new THREE.SphereGeometry(
        p.radius,
        16,
        12,
        p.phiStart,
        p.phiLength,
        p.thetaStart,
        p.thetaLength,
      );
      smoothGeometry.set(geometry, smooth);
    }
    object.geometry = smooth;
  }
});
const skyMaterial = new THREE.ShaderMaterial({
  uniforms: {
    horizon: { value: skyColor },
    zenith: { value: new THREE.Color("#749ebc") },
  },
  vertexShader:
    "varying vec3 direction; void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader:
    "varying vec3 direction; uniform vec3 horizon; uniform vec3 zenith; void main(){ float h=max(0.0,normalize(direction).y); gl_FragColor=vec4(mix(horizon,zenith,pow(h,0.65)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  side: THREE.BackSide,
  depthWrite: false,
});
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(175, 24, 16),
  skyMaterial,
);
skyDome.renderOrder = -10;
scene.add(skyDome);
const blueZenith = new THREE.Color("#729ab6");
const applySurface = (
  materials: THREE.Material[],
  kind: "soil" | "bark" | "plaster" | "cloth" | "thatch",
  repeat: number,
  bump: number,
) => {
  const maps = makeSurfaceMaps(kind, repeat);
  Object.values(maps).forEach(
    (map) =>
      (map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())),
  );
  materials.forEach((material) => {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    Object.assign(material, maps);
    material.bumpScale = bump;
    material.needsUpdate = true;
  });
};
applySurface([ground.material], "soil", 85, 0.07);
applySurface(
  [
    roadMaterial,
    shoulderMaterial,
    junctionMaterial,
    paddySoilMaterial,
    paddyBundMaterial,
  ],
  "soil",
  1,
  0.045,
);
applySurface(
  [...wallMaterials, estateWallMaterial, lateriteMaterial, kalariLaterite],
  "plaster",
  4,
  0.04,
);
applySurface(
  [woodMaterial, palmBark, trunkMaterial, cartWood, boatWoodMaterial],
  "bark",
  3,
  0.04,
);
applySurface(
  [
    ...villagerMaterials,
    ...villagerSariMaterials,
    nobleCloth,
    guardCloth,
    outfitMaterial,
    villagerDhotiMaterial,
  ],
  "cloth",
  6,
  0.006,
);
applySurface(
  [...roofMaterials, kalariThatch, farmerHatMaterial],
  "thatch",
  3,
  0.065,
);
const groundMaterial = ground.material as THREE.MeshStandardMaterial;
groundMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nvarying vec2 earthPosition;",
    )
    .replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nearthPosition=position.xy;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nvarying vec2 earthPosition;",
    )
    .replace(
      "#include <color_fragment>",
      "#include <color_fragment>\nfloat patches=sin(earthPosition.x*0.53+sin(earthPosition.y*0.3))*cos(earthPosition.y*0.61)+sin(earthPosition.x*2.7+earthPosition.y*3.1)*0.22; diffuseColor.rgb*=0.94+patches*0.09;",
    );
};
const leafAtlas = makeLeafAtlas();
const closeToShopVegetation = (x: number, z: number) =>
  [...marketSites, teaShopSite, toddyShopSite].some(
    ([sx, sz]) => Math.hypot(x - sx, z - sz) < 6.5,
  );
for (let index = trees.length - 1; index >= 0; index--) {
  const tree = trees[index];
  if (
    closeToShopVegetation(tree.position.x, tree.position.z) ||
    insideTempleGround(tree.position.x, tree.position.z, 3)
  ) {
    scene.remove(tree);
    trees.splice(index, 1);
  }
}
for (let index = coconutPalms.length - 1; index >= 0; index--) {
  const palm = coconutPalms[index];
  if (
    [...marketSites, teaShopSite, toddyShopSite].some(
      ([x, z]) =>
        Math.hypot(palm.group.position.x - x, palm.group.position.z - z) < 9,
    )
  ) {
    scene.remove(palm.group);
    const frondIndex = palmFronds.indexOf(palm.group);
    if (frondIndex >= 0) palmFronds.splice(frondIndex, 1);
    coconutPalms.splice(index, 1);
  }
}
trees.forEach((tree, index) => {
  const crowns = tree.children.filter(
    (child) => child instanceof THREE.Mesh && child.geometry === canopyGeometry,
  ) as THREE.Mesh[];
  if (!crowns.length) return;
  const top = Math.max(
    ...crowns.map((crown) => crown.position.y + crown.scale.y),
  );
  const width = Math.max(...crowns.map((crown) => crown.scale.x));
  crowns.forEach((crown) => tree.remove(crown));
  tree.add(
    makeDetailedTree(
      1973 + index * 37,
      top,
      Math.max(1, width),
      leafAtlas,
      trunkMaterial,
    ),
  );
});
// Replace the remaining decorative sapling balls without changing their reserved positions.
scene.children.forEach((object, index) => {
  if (!(object instanceof THREE.Group) || trees.includes(object)) return;
  const sapling = object.children.find(
    (child) =>
      child instanceof THREE.Mesh &&
      child.geometry === canopyGeometry &&
      child.material === saplingMaterial,
  ) as THREE.Mesh | undefined;
  if (!sapling) return;
  if (
    closeToShopVegetation(object.position.x, object.position.z) ||
    insideTempleGround(object.position.x, object.position.z, 3)
  ) {
    scene.remove(object);
    return;
  }
  object.remove(sapling);
  const top = sapling.position.y + sapling.scale.y;
  object.add(
    makeDetailedTree(
      6000 + index,
      top,
      Math.max(0.3, sapling.scale.x),
      leafAtlas,
      trunkMaterial,
    ),
  );
});
const wrapMaterials = new Set<THREE.Material>([
  villagerDhotiMaterial,
  farmerMunduMaterial,
  nobleCloth,
  ...villagerSariMaterials,
  ...farmerSariMaterials,
]);
const pleatedGeometry = new Map<
  THREE.CylinderGeometry,
  THREE.CylinderGeometry
>();
scene.traverse((object) => {
  if (
    !(object instanceof THREE.Mesh) ||
    !(object.geometry instanceof THREE.CylinderGeometry) ||
    !wrapMaterials.has(object.material as THREE.Material)
  )
    return;
  if (object.geometry.parameters.height < 0.5) return;
  let geometry = pleatedGeometry.get(object.geometry);
  if (!geometry) {
    geometry = makePleatedWrap(object.geometry);
    pleatedGeometry.set(object.geometry, geometry);
  }
  object.geometry = geometry;
});
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const contactShadows = new SSAOPass(
  scene,
  camera,
  window.innerWidth,
  window.innerHeight,
  12,
);
contactShadows.kernelRadius = 0.55;
contactShadows.minDistance = 0.0001;
contactShadows.maxDistance = 0.008;
composer.addPass(contactShadows);
composer.addPass(new OutputPass());
const qualitySelect =
  document.querySelector<HTMLSelectElement>("#graphics-quality")!;
let realisticGraphics = window.innerWidth > 760;
const setGraphicsQuality = () => {
  realisticGraphics = qualitySelect.value === "high";
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, realisticGraphics ? 1.5 : 1),
  );
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  // Contact shadows are calculated at reduced resolution to bound GPU cost.
  contactShadows.setSize(
    Math.ceil(window.innerWidth * 0.65),
    Math.ceil(window.innerHeight * 0.65),
  );
  world.dataset.graphics = realisticGraphics ? "realistic" : "balanced";
};
qualitySelect.value = realisticGraphics ? "high" : "balanced";
setGraphicsQuality();
qualitySelect.addEventListener("change", setGraphicsQuality);
const dryEarthColour = roadMaterial.color.clone();
const worldSolids: Solid[] = [];
const bananaPlants: THREE.Group[] = [];
const bananaRandom = seeded(1975);
for (let attempt = 0; attempt < 1600 && bananaPlants.length < 18; attempt++) {
  const x = -28 + bananaRandom() * 99,
    z = -65 + bananaRandom() * 131;
  if (
    getWaterInfo(x, z) ||
    distanceToRoad(x, z) < 5 ||
    distanceToRiver(x, z) < 9 ||
    isInsidePaddyReserve(x, z, 3) ||
    isInsideKalariReserve(x, z, 3) ||
    insideTempleGround(x, z, 3) ||
    isInsideTeaShop(x, z, 4) ||
    insideGarden(vegetablePlots, x, z, 3) ||
    isInsideBackyardReserve(x, z, 2) ||
    insideNewHomesteadPath(x, z, 3) ||
    isInsideHeritageYard(x, z) ||
    Math.hypot(x - landlordEstateSite[0], z - landlordEstateSite[1]) < 22 ||
    marketSites.some(([mx, mz]) => Math.hypot(x - mx, z - mz) < 9) ||
    allBuildingSites.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 6) ||
    trees.some(
      (tree) => Math.hypot(x - tree.position.x, z - tree.position.z) < 3.5,
    ) ||
    bananaPlants.some(
      (plant) => Math.hypot(x - plant.position.x, z - plant.position.z) < 5,
    )
  )
    continue;
  const plant = makeBananaPlant(bananaPlants.length);
  plant.position.set(x, terrainHeight(x, z), z);
  plant.rotation.y = bananaRandom() * Math.PI * 2;
  scene.add(plant);
  bananaPlants.push(plant);
}
world.dataset.bananaPlants = String(bananaPlants.length);
const actorRoots = new Set<THREE.Object3D>([
  player,
  ...villagers.map((person) => person.group),
  ...workerActors.map((actor) => actor.group),
  ...coconutHarvesters.map((actor) => actor.person.figure),
]);
const collectSolids = (root: THREE.Object3D) => {
  root.updateWorldMatrix(true, true);
  const scan = (object: THREE.Object3D) => {
    if (actorRoots.has(object)) return;
    if (
      object instanceof THREE.Mesh &&
      object.geometry instanceof THREE.BoxGeometry
    ) {
      const bounds = new THREE.Box3().setFromObject(object),
        position = object.getWorldPosition(new THREE.Vector3());
      const groundY = terrainHeight(position.x, position.z);
      const p = object.geometry.parameters,
        scale = object.getWorldScale(new THREE.Vector3());
      if (
        bounds.max.y > groundY + 0.32 &&
        bounds.min.y < groundY + 1.05 &&
        p.height * scale.y > 0.08
      ) {
        const rotation = new THREE.Euler().setFromQuaternion(
          object.getWorldQuaternion(new THREE.Quaternion()),
          "YXZ",
        ).y;
        worldSolids.push({
          x: position.x,
          z: position.z,
          halfX: (p.width * scale.x) / 2,
          halfZ: (p.depth * scale.z) / 2,
          rotation,
        });
      }
    }
    if (
      object instanceof THREE.Mesh &&
      object.geometry instanceof THREE.CylinderGeometry
    ) {
      const bounds = new THREE.Box3().setFromObject(object),
        p = object.getWorldPosition(new THREE.Vector3()),
        geometry = object.geometry.parameters;
      if (
        geometry.height > 0.4 &&
        bounds.min.y < terrainHeight(p.x, p.z) + 1.05 &&
        bounds.max.y > terrainHeight(p.x, p.z) + 0.4
      ) {
        const scale = object.getWorldScale(new THREE.Vector3());
        const radius =
          Math.max(geometry.radiusTop, geometry.radiusBottom) *
          Math.max(scale.x, scale.z);
        worldSolids.push({
          x: p.x,
          z: p.z,
          halfX: radius,
          halfZ: radius,
          rotation: 0,
        });
      }
    }
    object.children.forEach(scan);
  };
  scan(root);
};
[
  ...cottages,
  ...yardStructures,
  ...marketStalls,
  teaShop,
  toddyShop,
  kalari,
  temple,
  ...heritageWorkers.map((activity) => activity.workshop),
].forEach(collectSolids);
trees.forEach((tree) =>
  worldSolids.push({
    x: tree.position.x,
    z: tree.position.z,
    halfX: 0.25,
    halfZ: 0.25,
    rotation: 0,
  }),
);
bananaPlants.forEach((plant) =>
  worldSolids.push({
    x: plant.position.x,
    z: plant.position.z,
    halfX: 0.23,
    halfZ: 0.23,
    rotation: 0,
  }),
);
coconutPalms.forEach((palm) =>
  worldSolids.push({
    x: palm.group.position.x,
    z: palm.group.position.z,
    halfX: 0.35,
    halfZ: 0.35,
    rotation: 0,
  }),
);
scene.children.forEach((object) => {
  if (object instanceof THREE.Mesh && object.geometry === rockGeometry)
    worldSolids.push({
      x: object.position.x,
      z: object.position.z,
      halfX: object.scale.x * 0.7,
      halfZ: object.scale.z * 0.7,
      rotation: object.rotation.y,
    });
});
children.forEach((child, index) => {
  const base = findGatheringSpot(
    child.home,
    index,
    (x, z) =>
      distanceToRoad(x, z) > 2.8 &&
      !getWaterInfo(x, z) &&
      !worldSolids.some((s) => insideSolid(s, x, z, 0.4)) &&
      segmentClear(child.home, [x, z], worldSolids, 0.32),
  );
  child.base = base;
  child.walker.x = base[0];
  child.walker.z = base[1];
  child.person.figure.position.set(base[0], terrainHeight(...base), base[1]);
});
let crowdBodies: Body[] = [];
let approachingCarts: CartApproach[] = [];
const pedestrianYields = new WeakMap<
  Walker,
  {
    cart: CartApproach;
    side: readonly [number, number];
    started: number;
    blocked: number;
    updated: number;
  }
>();
const yieldCooldown = new WeakMap<Walker, number>();
const isVehicleWalker = (walker: Walker) =>
  walker === horseWalker ||
  walker === familyJourney.walker ||
  walker === manchalJourney.walker ||
  vehicles.some((vehicle) => vehicle.walker === walker);
const pedestrianYield = (walker: Walker, distance: number) => {
  if (isVehicleWalker(walker)) return undefined;
  if (simulationTime < (yieldCooldown.get(walker) ?? 0)) return undefined;
  let waiting = pedestrianYields.get(walker);
  if (waiting) {
    const cart = approachingCarts.find((cart) => cart === waiting!.cart);
    if (
      !cart ||
      !keepYielding(
        [walker.x, walker.z],
        cart,
        simulationTime - waiting.started,
        waiting.blocked,
      )
    ) {
      pedestrianYields.delete(walker);
      yieldCooldown.set(walker, simulationTime + 2);
      return undefined;
    }
  }
  if (!waiting) {
    const cart = approachingCarts.find((cart) =>
      cartThreat([walker.x, walker.z], cart),
    );
    if (!cart) return undefined;
    const side = roadsideCandidates([walker.x, walker.z], cart).find(
      (point) =>
        !getWaterInfo(...point) &&
        !isInsidePaddyReserve(...point, 0.2) &&
        segmentClear([walker.x, walker.z], point, worldSolids, 0.32) &&
        !worldSolids.some((solid) => insideSolid(solid, ...point, 0.35)),
    );
    if (!side) {
      yieldCooldown.set(walker, simulationTime + 1);
      return undefined;
    }
    waiting = {
      cart,
      side,
      started: simulationTime,
      blocked: 0,
      updated: simulationTime,
    };
    pedestrianYields.set(walker, waiting);
  }
  const dx = waiting.side[0] - walker.x,
    dz = waiting.side[1] - walker.z,
    length = Math.hypot(dx, dz);
  const step = Math.min(length, distance * 1.6);
  const oldX = walker.x,
    oldZ = walker.z;
  if (length > 0.08) {
    const next = moveBody(
      [oldX, oldZ],
      [oldX + (dx / length) * step, oldZ + (dz / length) * step],
      0.3,
      worldSolids,
      crowdBodies.filter((body) => body.radius < 0.7),
    );
    walker.x = next[0];
    walker.z = next[1];
  }
  const frameTime = Math.max(0, simulationTime - waiting.updated);
  waiting.updated = simulationTime;
  if (
    length > 0.15 &&
    Math.hypot(walker.x - oldX, walker.z - oldZ) < step * 0.2
  )
    waiting.blocked += frameTime;
  else waiting.blocked = 0;
  return {
    traveled: Math.hypot(walker.x - oldX, walker.z - oldZ),
    directionX: length > 0.01 ? dx / length : 0,
    directionZ: length > 0.01 ? dz / length : 0,
    arrived: false,
  };
};
const cartApproachMap = new Map<Walker, CartApproach>();
const visibleActor = (group: THREE.Object3D) => {
  for (
    let object: THREE.Object3D | null = group;
    object;
    object = object.parent
  )
    if (!object.visible) return false;
  return true;
};
const snapshotCrowd = () => {
  crowdBodies = [];
  approachingCarts = [];
  const addCart = (
    walker: Walker,
    visible: boolean,
    moving: boolean,
    rotation: number,
  ) => {
    if (!visible) return;
    let cart = cartApproachMap.get(walker);
    if (!cart) {
      cart = { x: walker.x, z: walker.z, dx: 0, dz: -1, moving };
      cartApproachMap.set(walker, cart);
    }
    const target = walker.path[walker.waypoint];
    const dx = target ? target[0] - walker.x : -Math.sin(rotation),
      dz = target ? target[1] - walker.z : -Math.cos(rotation),
      length = Math.hypot(dx, dz);
    Object.assign(cart, {
      x: walker.x,
      z: walker.z,
      dx: dx / Math.max(0.001, length),
      dz: dz / Math.max(0.001, length),
      moving,
    });
    approachingCarts.push(cart);
  };
  vehicles.forEach((vehicle) =>
    addCart(
      vehicle === landlordCart ? familyJourney.walker : vehicle.walker,
      vehicle.group.visible,
      vehicle === landlordCart
        ? !familyJourney.atStop
        : vehicle.delivery
          ? vehicle.delivery.phase === "market" ||
            vehicle.delivery.phase === "return"
          : !vehicle.parked && vehicle.wait === 0,
      vehicle.group.rotation.y,
    ),
  );
  const add = (group: THREE.Object3D, radius: number) => {
    if (!visibleActor(group)) return;
    const p = group.getWorldPosition(new THREE.Vector3());
    crowdBodies.push({ x: p.x, z: p.z, radius });
  };
  villagers.forEach((v) => add(v.group, 0.28));
  workerActors.forEach((a) => add(a.group, 0.28));
  ambientAnimals.forEach((a) =>
    add(
      a.group,
      a.species === "elephant" ? 1 : a.species === "rabbit" ? 0.18 : 0.45,
    ),
  );
  coconutHarvesters.forEach((a) => add(a.person.figure, 0.28));
  [lordActor, guardActor, ...escortActors].forEach((a) => add(a.figure, 0.28));
  children.forEach((child) => add(child.person.figure, 0.18));
  festivalElephants.forEach((elephant) => {
    if (festivalDecorations.visible) add(elephant, 1);
  });
  vehicles.forEach((vehicle) => add(vehicle.group, 0.8));
  add(manchal, 0.85);
  if (horseMode !== "ridden") add(playerHorse, 0.55);
  add(player, horseMode === "ridden" ? 0.55 : 0.32);
};
const motionDetour = (
  start: readonly [number, number],
  target: readonly [number, number],
  walker?: Walker,
) => {
  const safeStart = clearStandingPoint(start, worldSolids, 0.36);
  if (Math.hypot(start[0] - safeStart[0], start[1] - safeStart[1]) > 0.015)
    return [safeStart, target];
  if (!segmentClear(start, target, worldSolids, 0.32))
    return obstacleDetour(start, target, worldSolids, 0.36);
  if (
    walker &&
    Math.hypot(start[0] - wageFront[0], start[1] - wageFront[1]) < 12 &&
    wageEmployees.some((employee) => employee.actor.duty.walker === walker)
  )
    return [target];
  const dx = target[0] - start[0],
    dz = target[1] - start[1],
    length = Math.hypot(dx, dz);
  if (length < 0.15) return [target];
  const blocking = crowdBodies.find((body) => {
    const distance = Math.hypot(body.x - start[0], body.z - start[1]);
    if (distance < 0.12 || distance > 1.8) return false;
    const projection =
      ((body.x - start[0]) * dx + (body.z - start[1]) * dz) / (length * length);
    return (
      projection > 0 &&
      projection < 1 &&
      Math.hypot(
        body.x - start[0] - dx * projection,
        body.z - start[1] - dz * projection,
      ) <
        body.radius + 0.35
    );
  });
  if (blocking)
    for (const side of [1, -1]) {
      const clearance = blocking.radius + 0.65;
      const detour: readonly [number, number] = [
        blocking.x + (dz / length) * clearance * side,
        blocking.z - (dx / length) * clearance * side,
      ];
      if (
        segmentClear(start, detour, worldSolids, 0.35) &&
        segmentClear(detour, target, worldSolids, 0.35) &&
        !getWaterInfo(...detour)
      )
        return [detour, target];
    }
  return [target];
};
setWalkerMotion({
  move: (start, target) =>
    moveBody(
      start,
      target,
      0.3,
      worldSolids,
      crowdBodies.filter(
        (body) => Math.hypot(body.x - start[0], body.z - start[1]) > 0.75,
      ),
    ),
  detour: motionDetour,
  safePoint: (point) => clearStandingPoint(point, worldSolids, 0.36),
  yield: pedestrianYield,
});

const animate = () => {
  requestAnimationFrame(animate);
  clock.update();
  const delta = paused ? 0 : Math.min(clock.getDelta(), 0.04);
  if (gameStarted) simulationTime += delta;
  const elapsed = simulationTime;
  const dayState = updateEnvironment(elapsed, delta);
  const festival = sampleFestival(simulationDay(elapsed), dayState.hour);
  if (gameStarted && delta > 0 && festival.active !== lastFestivalActive) {
    lastFestivalActive = festival.active;
    setToast(
      festival.active
        ? "ക്ഷേത്രോത്സവം · Temple utsavam has begun. Visit the gold temple marker. ♪ enables percussion."
        : "The utsavam has ended. Families are returning home.",
    );
  }
  festivalPercussion.update(
    elapsed,
    festival.active && gameStarted && !paused,
    Math.hypot(playerState.x - templeSite[0], playerState.z - templeSite[1]),
  );
  festivalDecorations.visible = festival.decorated;
  festivalElephants.forEach((elephant) => (elephant.visible = festival.active));
  chendaPlayers.forEach((person, index) => {
    person.figure.visible = festival.active;
    person.arms.forEach(
      (arm, side) =>
        (arm.rotation.x = festival.active
          ? reducedMotion.matches
            ? 1
            : 1 + Math.sin(elapsed * 9 + index * 0.8 + side * Math.PI) * 0.35
          : 0),
    );
  });
  for (const [index, child] of children.entries()) {
    const active = dayState.hour >= 6.5 && dayState.hour < 19.5;
    const goal = !active
      ? "sleep"
      : festival.active || festival.arriving
        ? "festival"
        : "home";
    const target: readonly [number, number] =
      goal === "festival"
        ? [
            templeSite[0] - 4 + (index % 4) * 2.5,
            templeSite[1] + 14 + Math.floor(index / 4),
          ]
        : goal === "sleep"
          ? child.home
          : child.base;
    if (gameStarted && delta > 0 && goal !== child.goal) {
      const leavingHome = child.goal === "home" || child.goal === "sleep";
      child.goal = goal;
      if (goal === "festival") {
        const side: readonly [number, number] = [
          templeSite[0] + 9,
          templeSite[1],
        ];
        child.walker.path = [
          ...(leavingHome ? [child.home, child.lane] : []),
          ...villagePaths.findPath(
            leavingHome ? child.lane[0] : child.walker.x,
            leavingHome ? child.lane[1] : child.walker.z,
            ...side,
          ),
          side,
          [side[0], templeSite[1] + 14],
          target,
        ];
      } else if (!leavingHome) {
        child.walker.path = [
          ...villagePaths.findPath(
            child.walker.x,
            child.walker.z,
            ...child.lane,
          ),
          child.lane,
          child.home,
          ...(goal === "home" ? [child.base] : []),
        ];
      } else child.walker.path = [target];
      child.walker.waypoint = 0;
    }
    child.wait = Math.max(0, child.wait - (gameStarted ? delta : 0));
    if (
      active &&
      child.walker.waypoint >= child.walker.path.length &&
      child.wait === 0
    ) {
      const play: readonly [number, number] = [
        target[0] + Math.sin(index + Math.floor(elapsed / 5)) * 0.6,
        target[1] + Math.cos(index + Math.floor(elapsed / 5)) * 0.6,
      ];
      if (!getWaterInfo(...play) && distanceToRoad(...play) > 2.7) {
        child.walker.path = obstacleDetour(
          [child.walker.x, child.walker.z],
          play,
          worldSolids,
          0.3,
        );
        child.walker.waypoint = 0;
      }
      child.wait = 2.5 + (index % 3);
    }
    const step = advanceWalker(child.walker, gameStarted ? delta * 1.35 : 0);
    child.stride += step.traveled * 9;
    child.person.figure.visible = active || !step.arrived;
    child.person.figure.position.set(
      child.walker.x,
      terrainHeight(child.walker.x, child.walker.z),
      child.walker.z,
    );
    if (step.traveled > 0.001)
      child.person.figure.rotation.y = Math.atan2(
        -step.directionX,
        -step.directionZ,
      );
    child.person.legs.forEach(
      (leg, side) =>
        (leg.rotation.x =
          step.traveled > 0.001
            ? Math.sin(child.stride + side * Math.PI) * 0.4
            : 0),
    );
    child.person.arms.forEach(
      (arm, side) =>
        (arm.rotation.x =
          step.traveled > 0.001
            ? Math.sin(child.stride + side * Math.PI + Math.PI) * 0.3
            : 0.3),
    );
    child.ball.visible = active && step.arrived;
    child.ball.position.set(
      child.walker.x + 0.35,
      terrainHeight(child.walker.x + 0.35, child.walker.z) + 0.13,
      child.walker.z,
    );
  }
  world.dataset.festival = JSON.stringify({
    ...festival,
    elephants: festival.active ? 3 : 0,
    drummers: festival.active ? 5 : 0,
    children: children.filter((child) => child.person.figure.visible).length,
  });
  const rainWetness = weatherCycle.sample(elapsed).rain;
  roadMaterial.roughness = 0.94 - rainWetness * 0.38;
  roadMaterial.color
    .copy(dryEarthColour)
    .multiplyScalar(1 - rainWetness * 0.18);
  snapshotCrowd();
  skyDome.position.set(playerState.x, playerState.y, playerState.z);
  skyMaterial.uniforms.zenith.value
    .copy(skyColor)
    .lerp(blueZenith, dayState.daylight * 0.55);
  if (horseMode === "coming" && gameStarted && !paused) {
    const step = advanceWalker(horseWalker, delta * 5.5);
    horseStride += step.traveled * 3.5;
    playerHorse.position.set(
      horseWalker.x,
      bridgeHeightAt(bridgeSpan, horseWalker.x, horseWalker.z) ??
        terrainHeight(horseWalker.x, horseWalker.z),
      horseWalker.z,
    );
    if (step.traveled > 0)
      playerHorse.rotation.y = Math.atan2(-step.directionX, -step.directionZ);
    if (step.arrived) {
      horseMode = "waiting";
      setToast("Your horse has arrived. Press Q to mount.");
    }
    horseTemplate.horseLegs.forEach(
      (leg, index) =>
        (leg.rotation.x = Math.sin(horseStride + index * Math.PI * 0.5) * 0.4),
    );
  }
  if (gameStarted && !paused) {
    const deckAtStart = bridgeHeightAt(
      bridgeSpan,
      playerState.x,
      playerState.z,
    );
    const standingOnBridge =
      deckAtStart !== undefined &&
      !playerState.swimming &&
      playerState.y >= deckAtStart - 0.6;
    const waterAtStart = standingOnBridge
      ? undefined
      : getWaterInfo(playerState.x, playerState.z);
    const swimmingAtStart = playerState.swimming;
    const forwardInput =
      Number(keys.has("w") || keys.has("arrowup")) -
      Number(keys.has("s") || keys.has("arrowdown"));
    const sideInput =
      Number(keys.has("d") || keys.has("arrowright")) -
      Number(keys.has("a") || keys.has("arrowleft"));
    const inputLength = Math.hypot(forwardInput, sideInput);
    if (inputLength > 0 && !consuming && !openShop && toddyState.nausea === 0) {
      // The camera sits behind the player at +Z, so forward travel follows its view direction.
      const forwardX = -Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = -Math.sin(yaw);
      const speed =
        (horseMode === "ridden"
          ? keys.has("shift")
            ? 13
            : 8
          : swimmingAtStart
            ? keys.has("shift")
              ? 3.2
              : 2.35
            : waterAtStart
              ? 3.1
              : keys.has("shift")
                ? 9
                : 5.7) *
        (1 - Math.min(0.3, toddyState.level * 0.12));
      const moveX =
        (forwardX * forwardInput + rightX * sideInput) / inputLength;
      const moveZ =
        (forwardZ * forwardInput + rightZ * sideInput) / inputLength;
      const nextX = playerState.x + moveX * speed * delta;
      const nextZ = playerState.z + moveZ * speed * delta;
      const nextWater = getWaterInfo(nextX, nextZ);
      const horseSafe =
        horseMode !== "ridden" ||
        !nextWater ||
        nextWater.depth < 0.55 ||
        bridgeHeightAt(bridgeSpan, nextX, nextZ) !== undefined;
      if (horseSafe) {
        const next = moveBody(
          [playerState.x, playerState.z],
          [nextX, nextZ],
          horseMode === "ridden" ? 0.55 : 0.32,
          worldSolids,
          crowdBodies,
        );
        playerState.x = next[0];
        playerState.z = next[1];
      }
      if (horseMode === "ridden" && horseSafe)
        horseStride += speed * delta * 3.5;
      // The character's face points along local -Z; turn that side toward the travel vector.
      characterTravelDirection.set(moveX, 0, moveZ).normalize();
      player.quaternion.setFromUnitVectors(
        characterForward,
        characterTravelDirection,
      );
      if (swimmingAtStart) {
        playerLegs.forEach((leg, index) => {
          leg.rotation.x = Math.sin(elapsed * 6 + index * Math.PI) * 0.45;
        });
        playerArms.forEach((arm, index) => {
          arm.rotation.x =
            -0.75 + Math.sin(elapsed * 4.5 + index * Math.PI) * 0.8;
          arm.rotation.z =
            (index === 0 ? 1 : -1) *
            (0.3 +
              Math.max(0, Math.sin(elapsed * 4.5 + index * Math.PI)) * 0.35);
        });
      } else {
        const step = Math.sin(elapsed * 10) * 0.38;
        playerLegs.forEach((leg, index) => {
          leg.rotation.x = Math.sin(elapsed * 10 + index * Math.PI) * 0.38;
        });
        playerArms.forEach((arm, index) => {
          arm.rotation.z = 0;
          arm.rotation.x =
            Math.sin(elapsed * 10 + index * Math.PI + Math.PI) * 0.28;
        });
        body.position.y = 0.89 + Math.abs(step) * 0.035;
      }
    } else {
      playerLegs.forEach((leg, index) => {
        const tread = swimmingAtStart
          ? Math.sin(elapsed * 5 + index * Math.PI) * 0.28
          : 0;
        leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, tread, 8, delta);
      });
      playerArms.forEach((arm, index) => {
        const tread = swimmingAtStart
          ? Math.sin(elapsed * 4 + index * Math.PI) * 0.45
          : 0;
        arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, tread, 8, delta);
        arm.rotation.z = THREE.MathUtils.damp(
          arm.rotation.z,
          swimmingAtStart ? (index === 0 ? 0.45 : -0.45) : 0,
          8,
          delta,
        );
      });
      if (!swimmingAtStart)
        body.position.y = THREE.MathUtils.damp(body.position.y, 0.89, 8, delta);
    }
    playerState.x = THREE.MathUtils.clamp(playerState.x, -88, 88);
    playerState.z = THREE.MathUtils.clamp(playerState.z, -88, 88);
    const deckY = bridgeHeightAt(bridgeSpan, playerState.x, playerState.z);
    const onBridge =
      deckY !== undefined &&
      !playerState.swimming &&
      playerState.y >= deckY - 0.6;
    const waterInfo = onBridge
      ? undefined
      : getWaterInfo(playerState.x, playerState.z);
    const terrainY = onBridge
      ? deckY
      : waterInfo?.kind === "paddy"
        ? waterInfo.surfaceY - 0.15
        : terrainHeight(playerState.x, playerState.z);
    // Use hysteresis at the bank and do not pull a jumping player down through the air.
    const deepWater = Boolean(
      waterInfo &&
      waterInfo.depth >= (playerState.swimming ? 0.35 : 0.55) &&
      playerState.y <= waterInfo.surfaceY + 1,
    );
    if (deepWater && waterInfo) {
      playerState.swimming = true;
      playerState.grounded = false;
      playerState.velocityY = 0;
      const rise = keys.has(" ") ? 0.14 : 0.4;
      const bob = reducedMotion.matches ? 0 : Math.sin(elapsed * 2.8) * 0.035;
      playerState.y = THREE.MathUtils.damp(
        playerState.y,
        waterInfo.surfaceY - rise + bob,
        4.5,
        delta,
      );
      body.position.y =
        0.89 + (reducedMotion.matches ? 0 : Math.sin(elapsed * 2.8) * 0.025);
      if (!wasSwimming)
        setToast("Deep water — swim with WASD; hold Space to rise.");
    } else {
      if (playerState.swimming) {
        playerState.y = Math.max(playerState.y, terrainY);
        playerState.velocityY = 0;
        playerState.grounded = playerState.y <= terrainY + 0.03;
      } else {
        if (
          keys.has(" ") &&
          playerState.grounded &&
          horseMode !== "ridden" &&
          !consuming &&
          !openShop
        ) {
          playerState.velocityY = 8.3;
          playerState.grounded = false;
        }
        playerState.velocityY -= 22 * delta;
        playerState.y += playerState.velocityY * delta;
        if (playerState.y <= terrainY) {
          playerState.y = terrainY;
          playerState.velocityY = 0;
          playerState.grounded = true;
        }
      }
      playerState.swimming = false;
    }
    wasSwimming = deepWater;
    playerVisual.rotation.x = THREE.MathUtils.damp(
      playerVisual.rotation.x,
      playerState.swimming ? -1.05 : 0,
      6,
      delta,
    );
    player.position.set(
      playerState.x,
      playerState.y + (horseMode === "ridden" ? 1.25 : 0),
      playerState.z,
    );
    if (horseMode === "ridden") {
      playerHorse.position.set(playerState.x, playerState.y, playerState.z);
      playerHorse.quaternion.copy(player.quaternion);
      horseWalker.x = playerState.x;
      horseWalker.z = playerState.z;
      playerLegs.forEach((leg, side) => {
        leg.rotation.x = -1.1;
        leg.rotation.z = side === 0 ? -0.32 : 0.32;
      });
      playerArms.forEach((arm) => {
        arm.rotation.x = 0.9;
        arm.rotation.z = 0;
      });
      horseTemplate.horseLegs.forEach(
        (leg, index) =>
          (leg.rotation.x =
            inputLength > 0
              ? Math.sin(horseStride + index * Math.PI * 0.5) * 0.45
              : 0),
      );
    } else {
      playerLegs.forEach((leg) => (leg.rotation.z = 0));
      if (horseMode === "waiting")
        horseTemplate.horseLegs.forEach((leg) => (leg.rotation.x = 0));
    }
    world.dataset.horse = horseMode;
    swimWake.visible = playerState.swimming && waterInfo !== undefined;
    if (swimWake.visible && waterInfo) {
      swimWake.position.set(
        playerState.x,
        waterInfo.surfaceY + 0.035,
        playerState.z,
      );
      swimWake.scale.setScalar(
        1 + (reducedMotion.matches ? 0 : Math.sin(elapsed * 2.8) * 0.08),
      );
    }
    world.dataset.movement =
      horseMode === "ridden"
        ? "riding"
        : playerState.swimming
          ? "swimming"
          : waterInfo
            ? "wading"
            : onBridge
              ? "bridge"
              : "walking";
    const nearestRelic = relics.some(
      (relic) =>
        !relic.collected &&
        Math.hypot(
          relic.group.position.x - playerState.x,
          relic.group.position.z - playerState.z,
        ) < 3.4,
    );
    nearbyVillager = villagers.find(
      (person) =>
        Math.hypot(
          person.group.position.x - playerState.x,
          person.group.position.z - playerState.z,
        ) < 2.8,
    );
    const nearHorse =
      Math.hypot(
        playerState.x - playerHorse.position.x,
        playerState.z - playerHorse.position.z,
      ) < 2.6;
    const shopNearby = nearestFoodShop();
    const shoppingPrompt = shopNearby
      ? marketSellers[shopNearby.index].working && isWorkday(dayState.hour)
        ? `<kbd>E</kbd> Buy ${FOOD[shops[shopNearby.index].kind].label} · ₹${FOOD[shops[shopNearby.index].kind].price}`
        : "Market closed · Sellers return at 06:00"
      : "";
    const specialShop = nearbyKalariShop()
      ? "<kbd>E</kbd> Kalari · Buy bow / sword / buckler"
      : nearbyTeaShop()
        ? "<kbd>E</kbd> ചായക്കട · Tea & snacks"
        : nearbyToddyShop()
          ? "<kbd>E</kbd> കള്ളുഷാപ്പ് · Toddy"
          : "";
    const nearTemple =
      Math.hypot(playerState.x - templeSite[0], playerState.z - templeSite[1]) <
      8;
    const nearHeritage = heritageActivities.some(
      ([x, z]) => Math.hypot(playerState.x - x, playerState.z - z) < 3,
    );
    const prompt = consuming
      ? `Enjoying ${FOOD[consuming.kind].label}…`
      : horseMode === "ridden"
        ? "<kbd>Q</kbd> Dismount"
        : specialShop
          ? specialShop
          : shopNearby
            ? shoppingPrompt
            : nearHorse
              ? "<kbd>Q</kbd> Mount horse"
              : playerState.swimming
                ? "<kbd>WASD</kbd> Swim <kbd>SPACE</kbd> Rise"
                : nearestRelic
                  ? "<kbd>E</kbd> Gather starlight"
                  : nearbyVillager
                    ? `<kbd>E</kbd> Talk with ${nearbyVillager.name}`
                    : nearHeritage
                      ? "<kbd>E</kbd> Talk about work and village life"
                      : nearTemple
                        ? "ക്ഷേത്രം · Temple courtyard and flower offerings"
                        : "<kbd>E</kbd> Gather starlight";
    if (prompt !== lastInteractionPrompt) {
      interactionPrompt.innerHTML = prompt;
      lastInteractionPrompt = prompt;
    }
    interactionPrompt.classList.toggle(
      "visible",
      nearHeritage ||
        nearTemple ||
        Boolean(consuming) ||
        Boolean(specialShop) ||
        Boolean(shopNearby) ||
        horseMode === "ridden" ||
        nearHorse ||
        playerState.swimming ||
        nearestRelic ||
        Boolean(nearbyVillager),
    );
    document.querySelector<HTMLSpanElement>("#coordinates")!.textContent =
      `${String(Math.round(playerState.x + 100)).padStart(3, "0")} · ${String(Math.round(playerState.z + 100)).padStart(3, "0")}`;
    if (elapsed - lastMinimapUpdate >= 0.125) {
      drawMinimap();
      lastMinimapUpdate = elapsed;
    }
  }
  const wageDay = simulationDay(elapsed);
  wageEmployees.forEach((employee) =>
    updateWageVisit(
      employee.visit,
      wageDay,
      dayState.hour,
      gameStarted && delta > 0,
    ),
  );
  const paidEmployee = serveWageQueue(
    wageDesk,
    wageEmployees.map((e) => e.visit),
    wageEmployees.map(
      (e) =>
        e.actor.duty.arrived &&
        Math.hypot(
          e.actor.duty.walker.x - wageFront[0],
          e.actor.duty.walker.z - wageFront[1],
        ) < 0.45,
    ),
    gameStarted && wageClerk.working ? delta : 0,
  );
  if (paidEmployee >= 0) wageEmployees[paidEmployee].slot = -1;
  wageCoin.visible = wageDesk.serving !== null;
  let queueSlot = 0;
  for (const actor of workerActors) {
    let workerDelta = gameStarted ? delta : 0;
    const docked =
      !actor.boat ||
      actor.boat.group.position.distanceTo(actor.boat.dock) < 0.5;
    let dutyHour = templeWorshippers.some((person) => person.actor === actor)
      ? templePrayerHours(dayState.hour)
        ? 8
        : 22
      : dayState.hour;
    if (festivalVisitors.includes(actor))
      dutyHour = festival.active || festival.arriving ? 8 : 22;
    if (actor === toddySeller)
      dutyHour = dayState.hour >= 10 && dayState.hour < 20 ? 8 : 22;
    if (toddyPatrons.some((patron) => patron.actor === actor))
      dutyHour = dayState.hour >= 15 && dayState.hour < 19.5 ? 8 : 22;
    const employee = wageEmployees.find((entry) => entry.actor === actor);
    if (employee) {
      const slot = employee.visit.stage === "queue" ? queueSlot++ : -1;
      const target =
        slot >= 0
          ? ([wageFront[0], wageFront[1] + slot * 0.9] as const)
          : employee.work;
      if (slot !== employee.slot || employee.stage !== employee.visit.stage) {
        const advancingQueue =
          employee.stage === "queue" && employee.visit.stage === "queue";
        if (employee.stage === "working" && employee.visit.stage === "queue")
          employee.leaveAt = elapsed + wageEmployees.indexOf(employee) * 2;
        actor.duty.work = target;
        employee.slot = slot;
        employee.stage = employee.visit.stage;
        actor.duty.arrived = false;
        actor.duty.destination =
          employee.visit.stage === "home" ? "home" : "work";
        const actual = actor.group.getWorldPosition(new THREE.Vector3());
        actor.duty.walker.x = actual.x;
        actor.duty.walker.z = actual.z;
        if (
          advancingQueue &&
          Math.hypot(actual.x - wageFront[0], actual.z - wageFront[1]) > 12 &&
          actor.duty.walker.waypoint < actor.duty.walker.path.length
        ) {
          actor.duty.walker.path = [
            ...actor.duty.walker.path.slice(0, -1),
            target,
          ];
        } else
          routeTo(
            actor.duty.walker,
            actor.duty[actor.duty.destination],
            advancingQueue &&
              Math.hypot(actual.x - wageFront[0], actual.z - wageFront[1]) < 12
              ? () => []
              : villagePaths.findPath,
          );
      }
      dutyHour = employee.visit.stage === "home" ? 22 : 8;
      if (employee.visit.stage === "queue" && elapsed < employee.leaveAt)
        workerDelta = 0;
    }
    if (actor === wageClerk)
      dutyHour =
        dayState.hour >= 16.5 &&
        (dayState.hour < 20.5 ||
          wageEmployees.some((employee) => employee.visit.stage === "queue"))
          ? 8
          : 22;
    if (actor.fishTrade) {
      const trade = actor.fishTrade;
      const previous = trade.phase;
      if (actor.boat && (dayState.hour >= 15 || trade.phase !== "fishing"))
        actor.boat.working = false;
      const delivered = advanceFishTrading(
        trade,
        simulationDay(elapsed),
        dayState.hour,
        workerDelta,
        docked,
        actor.duty.arrived,
      );
      if (delivered) {
        fishSales += 3;
        marketFish.forEach(
          (fish, index) =>
            (fish.visible = index < Math.min(fishSales, marketFish.length)),
        );
      }
      if (previous !== trade.phase && trade.phase !== "selling") {
        const actual = actor.group.getWorldPosition(new THREE.Vector3());
        actor.duty.walker.x = actual.x;
        actor.duty.walker.z = actual.z;
        actor.duty.work =
          trade.phase === "market"
            ? [marketSites[2][0] - 1.8, marketSites[2][1] + 0.8]
            : actor.fishingSite!;
        actor.duty.destination = trade.phase === "home" ? "home" : "work";
        actor.duty.arrived = false;
        routeTo(
          actor.duty.walker,
          actor.duty[actor.duty.destination],
          villagePaths.findPath,
        );
      }
      dutyHour =
        trade.phase === "home"
          ? 22
          : trade.phase === "market" || trade.phase === "selling"
            ? 8
            : dayState.hour;
      if (actor.fishBasket)
        actor.fishBasket.visible =
          trade.phase === "market" || trade.phase === "selling";
    }
    const offDuty = !isWorkday(dutyHour);
    const dockingForTrade =
      actor.boat && actor.fishTrade?.phase === "fishing" && dayState.hour >= 15;
    if (
      actor.boat &&
      (offDuty || dockingForTrade) &&
      actor.duty.destination === "work" &&
      !docked
    ) {
      actor.working = false;
      actor.boat.working = false;
      continue;
    }
    if (
      (offDuty ? "home" : "work") !== actor.duty.destination &&
      actor.duty.arrived
    ) {
      const actualPosition = actor.group.getWorldPosition(new THREE.Vector3());
      actor.duty.walker.x = actualPosition.x;
      actor.duty.walker.z = actualPosition.z;
    }
    const commutePath = (x: number, z: number, tx: number, tz: number) => {
      const insideShrine = (px: number, pz: number) =>
        Math.abs(px - templeSite[0]) < 2 && Math.abs(pz - templeSite[1]) < 2.2;
      const entrance: readonly [number, number] = [
        templeSite[0],
        templeSite[1] + 4,
      ];
      if (insideShrine(tx, tz))
        return [...villagePaths.findPath(x, z, ...entrance), entrance];
      if (insideShrine(x, z))
        return [entrance, ...villagePaths.findPath(...entrance, tx, tz)];
      return x < -30 && tx < -30 && z > 26 && tz > 26
        ? []
        : villagePaths.findPath(x, z, tx, tz);
    };
    const step = advanceDuty(
      actor.duty,
      dutyHour,
      workerDelta,
      2.1,
      commutePath,
    );
    actor.working =
      step.working &&
      (!actor.fishTrade || actor.fishTrade.phase === "fishing") &&
      (!employee || employee.visit.stage === "working");
    if (actor.boat)
      actor.boat.working = actor.working && !offDuty && !dockingForTrade;
    actor.equipment?.forEach((item) => (item.visible = actor.working));
    if (actor.working && actor.workParent) {
      if (actor.group.parent !== actor.workParent)
        actor.workParent.add(actor.group);
      actor.group.position.copy(actor.localPosition);
      actor.group.rotation.copy(actor.localRotation);
    } else if (!actor.working) {
      if (actor.group.parent !== scene) scene.attach(actor.group);
      actor.group.position.set(
        actor.duty.walker.x,
        bridgeHeightAt(bridgeSpan, actor.duty.walker.x, actor.duty.walker.z) ??
          terrainHeight(actor.duty.walker.x, actor.duty.walker.z),
        actor.duty.walker.z,
      );
      if (step.traveled > 0)
        actor.group.rotation.y = Math.atan2(-step.directionX, -step.directionZ);
      actor.legs.forEach(
        (leg, side) =>
          (leg.rotation.x = THREE.MathUtils.damp(
            leg.rotation.x,
            step.traveled > 0
              ? Math.sin(actor.duty.stride + side * Math.PI) * 0.4
              : 0,
            8,
            workerDelta,
          )),
      );
      actor.arms.forEach(
        (arm, side) =>
          (arm.rotation.x = THREE.MathUtils.damp(
            arm.rotation.x,
            step.traveled > 0
              ? Math.sin(actor.duty.stride + side * Math.PI + Math.PI) * 0.3
              : 0,
            8,
            workerDelta,
          )),
      );
      if (actor.fishBasket?.visible) actor.arms[1].rotation.x = 0.35;
      if (employee?.visit.stage === "queue" && step.working) {
        actor.group.rotation.y = Math.PI;
        actor.arms.forEach((arm) => (arm.rotation.x = 0.15));
      }
    }
    actor.group.visible = !step.atHome;
  }
  marketSellers.forEach((seller, index) => {
    if (seller.working)
      seller.arms[1].rotation.x =
        0.45 +
        (reducedMotion.matches ? 0 : Math.sin(elapsed * 1.3 + index) * 0.2);
  });
  teaFire.visible = teaSeller.working;
  toddyPatrons.forEach(({ actor }) => {
    if (!actor.working) return;
    actor.legs.forEach((leg) => (leg.rotation.x = -1.15));
    actor.arms[1].rotation.x =
      1.1 +
      (reducedMotion.matches ? 0 : Math.max(0, Math.sin(elapsed * 0.7)) * 0.8);
  });
  heritageWorkers.forEach(({ actor, index }) => {
    if (!actor.working) return;
    actor.arms.forEach(
      (arm, side) =>
        (arm.rotation.x = THREE.MathUtils.damp(
          arm.rotation.x,
          0.7 +
            (reducedMotion.matches
              ? 0
              : Math.sin(elapsed * (index ? 1.5 : 3) + side) * 0.18),
          5,
          delta,
        )),
    );
  });
  if (teaSeller.working) {
    teaSeller.arms[1].rotation.x = 0.5;
    teaFire.scale.y = reducedMotion.matches
      ? 1.5
      : 1.5 + Math.sin(elapsed * 7) * 0.1;
  }
  templeWorshippers.forEach(({ actor, flowers }) => {
    flowers.visible = actor.working;
    if (actor.working) {
      actor.group.rotation.y = 0;
      actor.arms.forEach((arm) => {
        arm.rotation.x = 1.15;
        arm.rotation.z = 0;
      });
    }
  });
  vegetableGrowers.forEach((grower, index) => {
    if (!grower.working) return;
    grower.group.rotation.y = Math.PI;
    grower.arms.forEach(
      (arm, side) =>
        (arm.rotation.x = THREE.MathUtils.damp(
          arm.rotation.x,
          0.55 +
            (reducedMotion.matches
              ? 0
              : Math.sin(elapsed * 1.7 + index + side) * 0.2),
          5,
          delta,
        )),
    );
  });
  world.dataset.homesteads = String(scatteredHomes.length);
  world.dataset.vegetables = vegetablePlots.map((plot) => plot.crop).join(",");
  world.dataset.workers = JSON.stringify({
    working: workerActors.filter((actor) => actor.working).length,
    home: workerActors.filter(
      (actor) => actor.duty.destination === "home" && actor.duty.arrived,
    ).length,
    commuting: workerActors.filter((actor) => !actor.duty.arrived).length,
  });
  world.dataset.wages = JSON.stringify({
    queued: wageEmployees.filter((e) => e.visit.stage === "queue").length,
    paid: wageDesk.transactions,
    serving: wageDesk.serving,
  });
  world.dataset.fishSales = String(fishSales);
  world.dataset.fishTraders = workerActors
    .filter((actor) => actor.fishTrade)
    .map((actor) => actor.fishTrade!.phase)
    .join(",");
  for (const [workerIndex, worker] of paddyWorkers.entries()) {
    const active = gameStarted && paddyActors[workerIndex].working;
    if (!paddyActors[workerIndex].working) {
      worker.seedlings.visible = false;
      worker.upperBody.rotation.x = THREE.MathUtils.damp(
        worker.upperBody.rotation.x,
        0,
        6,
        delta,
      );
      continue;
    }
    const animated = active && !reducedMotion.matches;
    const routine = advancePaddyWork(
      worker.workTime,
      delta,
      animated,
      worker.phase * 3,
    );
    worker.workTime = routine.time;
    const walking = animated && routine.phase === "walk";
    const planting = active && routine.phase === "plant";
    const workCycle = worker.workTime * 2.2 + worker.phase;
    worker.group.position.x = worker.homeX;
    worker.group.position.z = worker.homeZ + routine.rowOffset;
    paddyActors[workerIndex].duty.work = [
      worker.group.position.x,
      worker.group.position.z,
    ];
    worker.group.position.y =
      paddyWaterLevels[worker.plotIndex] +
      (walking ? Math.abs(Math.sin(workCycle * 2)) * 0.025 : 0);
    if (walking) {
      const facing = routine.direction > 0 ? Math.PI : 0;
      const turn = Math.atan2(
        Math.sin(facing - worker.group.rotation.y),
        Math.cos(facing - worker.group.rotation.y),
      );
      worker.group.rotation.y += turn * (1 - Math.exp(-5 * delta));
    }
    worker.upperBody.rotation.x = THREE.MathUtils.damp(
      worker.upperBody.rotation.x,
      planting ? -0.65 + (animated ? Math.sin(workCycle) * 0.08 : 0) : 0,
      4,
      delta,
    );
    worker.head.rotation.x = THREE.MathUtils.damp(
      worker.head.rotation.x,
      planting ? 0.06 : 0,
      4,
      delta,
    );
    worker.seedlings.visible = planting;
    worker.arms.forEach((arm, index) => {
      const reach = animated ? Math.sin(workCycle + index * Math.PI) : 0;
      arm.rotation.x = THREE.MathUtils.damp(
        arm.rotation.x,
        planting ? 0.65 + reach * 0.3 : walking ? reach * 0.28 : 0,
        4,
        delta,
      );
      arm.rotation.z = THREE.MathUtils.damp(
        arm.rotation.z,
        planting ? (index === 0 ? 1 : -1) * 0.2 : 0,
        4,
        delta,
      );
    });
    worker.legs.forEach((leg, index) => {
      const step = walking
        ? Math.sin(workCycle * 2 + index * Math.PI) * 0.35
        : 0;
      leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, step, 6, delta);
    });
  }
  for (const [index, practitioner] of kalariFigures.entries()) {
    const active = kalariWorkers[index].working && gameStarted;
    if (!kalariWorkers[index].working) continue;
    const drill = sampleKalariDrill(
      reducedMotion.matches ? 0 : elapsed,
      index === 2 ? 3 : 0,
    );
    practitioner.figure.position.y = 0.1 - (active ? drill.stance * 0.2 : 0);
    practitioner.arms.forEach((arm, side) => {
      const direction = side === 0 ? 1 : -1;
      arm.rotation.z = THREE.MathUtils.damp(
        arm.rotation.z,
        active ? direction * 0.35 : 0,
        4,
        delta,
      );
      arm.rotation.x = THREE.MathUtils.damp(
        arm.rotation.x,
        active ? (side === 1 ? drill.sword : drill.shield) : 0,
        4,
        delta,
      );
    });
    practitioner.legs.forEach((leg, side) => {
      const target = active ? (side === 0 ? drill.stance : -drill.stance) : 0;
      leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, target, 4, delta);
      leg.rotation.z = THREE.MathUtils.damp(
        leg.rotation.z,
        active ? (side === 0 ? 0.18 : -0.18) : 0,
        4,
        delta,
      );
    });
  }
  let activeClimbers = 0;
  for (const harvester of coconutHarvesters) {
    const workday = dayState.hour >= 6 && dayState.hour < 19;
    const motionEnabled = gameStarted && !reducedMotion.matches;
    if (harvester.delivery !== "harvest") {
      const moving = advanceWalker(
        harvester.walker,
        motionEnabled ? delta * 2 : 0,
      );
      harvester.stride += moving.traveled * 5;
      harvester.person.figure.position.set(
        harvester.walker.x,
        bridgeHeightAt(bridgeSpan, harvester.walker.x, harvester.walker.z) ??
          terrainHeight(harvester.walker.x, harvester.walker.z),
        harvester.walker.z,
      );
      harvester.person.figure.rotation.x = 0;
      if (moving.traveled > 0)
        harvester.person.figure.rotation.y = Math.atan2(
          -moving.directionX,
          -moving.directionZ,
        );
      harvester.person.legs.forEach(
        (leg, side) =>
          (leg.rotation.x = THREE.MathUtils.damp(
            leg.rotation.x,
            moving.traveled > 0
              ? Math.sin(harvester.stride + side * Math.PI) * 0.4
              : 0,
            8,
            delta,
          )),
      );
      harvester.person.arms.forEach(
        (arm, side) =>
          (arm.rotation.x = THREE.MathUtils.damp(
            arm.rotation.x,
            side === 1 && harvester.sack.visible
              ? -0.3
              : moving.traveled > 0
                ? Math.sin(harvester.stride + side * Math.PI) * 0.25
                : 0.5,
            8,
            delta,
          )),
      );
      if (moving.arrived && gameStarted && delta > 0) {
        if (harvester.delivery === "market") {
          harvester.delivery = "sell";
          harvester.wait = 6;
        } else if (harvester.delivery === "sell") {
          harvester.wait -= delta;
          if (harvester.wait <= 0) {
            harvester.sold++;
            coconutSales += 4;
            harvester.sack.visible = false;
            const transform = new THREE.Object3D();
            marketCoconuts.count = Math.min(24, coconutSales);
            for (let nut = 0; nut < marketCoconuts.count; nut++) {
              transform.position.set(
                6 + (nut % 4) * 0.3,
                terrainHeight(6, -30) + 0.23 + Math.floor(nut / 8) * 0.25,
                -28.7 + Math.floor((nut % 8) / 4) * 0.3,
              );
              transform.updateMatrix();
              marketCoconuts.setMatrixAt(nut, transform.matrix);
            }
            marketCoconuts.instanceMatrix.needsUpdate = true;
            marketCoconuts.computeBoundingSphere();
            harvester.delivery = workday ? "return" : "home";
            routeTo(
              harvester.walker,
              workday
                ? [
                    harvester.palm.group.position.x + 2.6,
                    harvester.palm.group.position.z + 0.35,
                  ]
                : harvester.home,
              villagePaths.findPath,
            );
          }
        } else if (harvester.delivery === "return") {
          harvester.delivery = "harvest";
          harvester.workTime = -harvester.offset;
        } else if (harvester.delivery === "home" && workday) {
          harvester.person.figure.visible = true;
          harvester.delivery = harvester.sack.visible ? "market" : "return";
          routeTo(
            harvester.walker,
            harvester.sack.visible
              ? [3, -27]
              : [
                  harvester.palm.group.position.x + 2.6,
                  harvester.palm.group.position.z + 0.35,
                ],
            villagePaths.findPath,
          );
        } else if (harvester.delivery === "home")
          harvester.person.figure.visible = false;
      }
      continue;
    }
    const routine = advanceCoconutHarvest(
      harvester.workTime,
      delta,
      workday,
      motionEnabled,
      harvester.offset,
    );
    harvester.workTime = routine.time;
    const climbing =
      routine.phase === "climb" ||
      routine.phase === "pick" ||
      routine.phase === "descend";
    const heightFraction =
      routine.phase === "climb"
        ? routine.progress
        : routine.phase === "pick"
          ? 1
          : routine.phase === "descend"
            ? 1 - routine.progress
            : 0;
    const retreat =
      routine.phase === "rest"
        ? Math.min(1, routine.progress * 2)
        : routine.phase === "approach"
          ? 1 - routine.progress
          : 0;
    const scale = harvester.palm.group.scale.x;
    const localX =
      0.28 + 0.78 * (heightFraction * 0.92) ** 2 + (retreat * 2.3) / scale;
    const localZ = 0.3;
    const cosine = Math.cos(harvester.palm.group.rotation.y);
    const sine = Math.sin(harvester.palm.group.rotation.y);
    const x =
      harvester.palm.group.position.x +
      (localX * cosine + localZ * sine) * scale;
    const z =
      harvester.palm.group.position.z +
      (-localX * sine + localZ * cosine) * scale;
    const y = terrainHeight(x, z) + heightFraction * 8.8 * scale;
    harvester.person.figure.position.set(x, y, z);
    const faceX = harvester.palm.group.position.x - x;
    const faceZ = harvester.palm.group.position.z - z;
    harvester.person.figure.rotation.y = Math.atan2(-faceX, -faceZ);
    harvester.person.figure.rotation.x = climbing ? -0.12 : 0;
    if (motionEnabled) {
      const limbCycle = harvester.workTime * 5 + harvester.offset;
      harvester.person.legs.forEach((leg, index) => {
        const step = climbing
          ? Math.sin(limbCycle + index * Math.PI) * 0.5
          : routine.phase === "approach"
            ? Math.sin(limbCycle + index * Math.PI) * 0.4
            : 0;
        leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, step, 8, delta);
        leg.rotation.z = THREE.MathUtils.damp(
          leg.rotation.z,
          climbing ? (index === 0 ? 0.4 : -0.4) : 0,
          8,
          delta,
        );
      });
      harvester.person.arms.forEach((arm, index) => {
        const target = climbing
          ? 2.3 + Math.sin(limbCycle + index * Math.PI) * 0.35
          : routine.phase === "approach"
            ? Math.sin(limbCycle + index * Math.PI + Math.PI) * 0.25
            : 0;
        arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, target, 8, delta);
        arm.rotation.z = THREE.MathUtils.damp(
          arm.rotation.z,
          climbing ? (index === 0 ? 0.32 : -0.32) : 0,
          8,
          delta,
        );
      });
    }
    const picked =
      routine.phase === "descend" ||
      (routine.phase === "pick" && routine.progress > 0.55);
    harvester.palm.coconuts.forEach(
      (nut) => (nut.visible = !picked && routine.phase !== "rest"),
    );
    harvester.carriedNut.visible = false;
    harvester.groundNut.visible = picked || routine.phase === "rest";
    const falling =
      routine.phase === "pick"
        ? Math.max(0, 1 - (routine.progress - 0.55) / 0.25)
        : 0;
    harvester.groundNut.position.y =
      harvester.palm.groundY + 0.23 + falling * 8.8 * scale;
    if (routine.phase === "rest" && routine.progress < 0.2) {
      harvester.person.figure.rotation.x =
        -0.5 * Math.sin((routine.progress / 0.2) * Math.PI);
      harvester.person.arms[1].rotation.x = 0.7;
    }
    if (routine.phase === "rest" && routine.progress >= 0.2 && motionEnabled) {
      harvester.sack.visible = true;
      harvester.groundNut.visible = false;
      harvester.walker.x = x;
      harvester.walker.z = z;
      harvester.delivery = workday ? "market" : "home";
      routeTo(
        harvester.walker,
        workday ? [3, -27] : harvester.home,
        villagePaths.findPath,
      );
    }
    if (climbing && motionEnabled) activeClimbers++;
  }
  world.dataset.climbers = String(activeClimbers);
  world.dataset.coconutSales = String(coconutSales);
  world.dataset.coconutDeliveries = coconutHarvesters
    .map((h) => h.delivery)
    .join(",");
  for (const fish of riverFish) {
    const progress = (fish.start + elapsed * fish.speed) % 1;
    const point = riverRoute.getPointAt(progress);
    const tangent = riverRoute.getTangentAt(progress);
    const leap = reducedMotion.matches
      ? 0
      : Math.pow(Math.max(0, Math.sin(elapsed * 0.82 + fish.phase)), 18) * 0.82;
    fish.group.position.set(
      point.x,
      waterModel.riverSurface(point.x, point.z) - 0.3 + leap,
      point.z,
    );
    fish.group.rotation.y =
      Math.atan2(-tangent.x, -tangent.z) +
      Math.sin(elapsed * 0.8 + fish.phase) * 0.18;
    fish.group.rotation.x = leap > 0.08 ? -0.55 : 0;
    fish.group.children[1].rotation.z =
      Math.sin(elapsed * 6 + fish.phase) *
      (reducedMotion.matches ? 0.08 : 0.35);
  }
  for (const boat of fishingBoats) {
    const progress = THREE.MathUtils.clamp(
      boat.start +
        Math.sin(elapsed * 0.09 + boat.phase) *
          (reducedMotion.matches ? 0.001 : 0.009),
      0.01,
      0.99,
    );
    const point = riverRoute.getPointAt(progress);
    const tangent = riverRoute.getTangentAt(progress);
    const boatTarget = boat.working
      ? new THREE.Vector3(
          point.x,
          waterModel.riverSurface(point.x, point.z) +
            0.12 +
            Math.sin(elapsed * 1.2 + boat.phase) *
              (reducedMotion.matches ? 0 : 0.035),
          point.z,
        )
      : boat.dock;
    const boatGap = boatTarget.clone().sub(boat.group.position);
    boat.group.position.addScaledVector(
      boatGap,
      Math.min(
        1,
        ((gameStarted ? delta : 0) * 2) / Math.max(0.001, boatGap.length()),
      ),
    );
    boat.group.rotation.y = Math.atan2(-tangent.x, -tangent.z);
    boat.group.rotation.z =
      Math.sin(elapsed * 0.7 + boat.phase) *
      (reducedMotion.matches ? 0 : 0.018);
    boat.net.visible = boat.working;
    boat.rope.visible = boat.working;
    const cast =
      reducedMotion.matches || !boat.working
        ? sampleCastNet(0)
        : sampleCastNet(elapsed, boat.phase);
    if (boat.working) {
      boat.castingArm.rotation.x = cast.arm;
      boat.fisher.rotation.z =
        cast.phase === "throw" ? -0.1 * Math.sin(cast.outreach * Math.PI) : 0;
    }
    boat.group.updateMatrixWorld(true);
    castingHand.set(0, -0.48, -0.02);
    boat.castingArm.localToWorld(castingHand);
    boat.group.worldToLocal(castingHand);
    boat.net.position.lerpVectors(castingHand, castTarget, cast.outreach);
    boat.net.position.y += cast.lift - cast.sink;
    boat.net.scale.set(cast.spread, 0.25 + 0.75 * cast.spread, cast.spread);
    ropeEnd.copy(boat.net.position);
    ropeEnd.y += 0.55 * boat.net.scale.y;
    const ropePositions = boat.rope.geometry.attributes
      .position as THREE.BufferAttribute;
    for (let segment = 0; segment < ropePositions.count; segment++) {
      const t = segment / (ropePositions.count - 1);
      const slack = Math.sin(Math.PI * t) * (0.08 + 0.28 * cast.outreach);
      ropePositions.setXYZ(
        segment,
        THREE.MathUtils.lerp(castingHand.x, ropeEnd.x, t),
        THREE.MathUtils.lerp(castingHand.y, ropeEnd.y, t) - slack,
        THREE.MathUtils.lerp(castingHand.z, ropeEnd.z, t),
      );
    }
    ropePositions.needsUpdate = true;
  }
  const actorDelta = gameStarted ? delta : 0;
  const inspection = advanceHousehold(
    householdCurfews[0],
    landlordInspection,
    inspectionStops,
    dayState.hour,
    actorDelta,
    1.35,
    villagePaths.findPath,
    estateGate,
    estateCourtyard,
  );
  procession.visible = !inspection.indoors;
  procession.position.set(
    landlordInspection.walker.x,
    terrainHeight(landlordInspection.walker.x, landlordInspection.walker.z),
    landlordInspection.walker.z,
  );
  const lordFacing = inspection.inspecting
    ? Math.atan2(
        procession.position.x - inspection.lookAt[0],
        procession.position.z - inspection.lookAt[1],
      )
    : Math.atan2(-inspection.directionX, -inspection.directionZ);
  const lordTurn = Math.atan2(
    Math.sin(lordFacing - procession.rotation.y),
    Math.cos(lordFacing - procession.rotation.y),
  );
  procession.rotation.y += lordTurn * (1 - Math.exp(-3 * actorDelta));
  const walkingLord = inspection.traveled > 0;
  const lordPraying =
    inspection.inspecting && inspection.label === "Temple flower offering";
  lordFlowers.visible = lordPraying;
  [lordActor, guardActor, ...escortActors].forEach((person, personIndex) => {
    const stride = landlordInspection.stride + personIndex * 0.5;
    person.legs.forEach(
      (leg, index) =>
        (leg.rotation.x = THREE.MathUtils.damp(
          leg.rotation.x,
          walkingLord ? Math.sin(stride + index * Math.PI) * 0.3 : 0,
          9,
          actorDelta,
        )),
    );
    person.arms.forEach((arm, index) => {
      const target =
        personIndex === 0 && lordPraying
          ? 1.1
          : walkingLord
            ? Math.sin(stride + index * Math.PI + Math.PI) * 0.2
            : personIndex === 0 && index === 1
              ? 0.7
              : personIndex === 1 && index === 0
                ? 0.6
                : 0;
      arm.rotation.x = THREE.MathUtils.damp(
        arm.rotation.x,
        target,
        5,
        actorDelta,
      );
    });
    const local = person.figure.position;
    const x =
      procession.position.x +
      local.x * Math.cos(procession.rotation.y) +
      local.z * Math.sin(procession.rotation.y);
    const z =
      procession.position.z -
      local.x * Math.sin(procession.rotation.y) +
      local.z * Math.cos(procession.rotation.y);
    local.y = terrainHeight(x, z) - procession.position.y;
  });
  world.dataset.landlord =
    inspection.phase === "visiting" && !inspection.inspecting
      ? `Walking to ${inspection.label}`
      : inspection.label;
  const family = advanceHousehold(
    householdCurfews[1],
    familyJourney,
    familyStops,
    dayState.hour,
    actorDelta,
    2.5,
    villagePaths.findPath,
    estateGate,
    estatePoint(-2, 8),
  );
  landlordCart.group.visible = !family.indoors;
  landlordCart.group.position.set(
    familyJourney.walker.x,
    terrainHeight(familyJourney.walker.x, familyJourney.walker.z),
    familyJourney.walker.z,
  );
  if (family.traveled > 0)
    landlordCart.group.rotation.y = Math.atan2(
      -family.directionX,
      -family.directionZ,
    );
  landlordCart.wheels.forEach((wheel) =>
    wheel.rotateZ(-family.traveled / 0.66),
  );
  landlordCart.horseLegs.forEach(
    (leg, index) =>
      (leg.rotation.x = THREE.MathUtils.damp(
        leg.rotation.x,
        family.traveled > 0
          ? Math.sin(familyJourney.stride + index * Math.PI * 0.5) * 0.3
          : 0,
        8,
        actorDelta,
      )),
  );
  const carried = advanceHousehold(
    householdCurfews[2],
    manchalJourney,
    manchalStops,
    dayState.hour,
    actorDelta,
    1.35,
    villagePaths.findPath,
    estateGate,
    estatePoint(2, 8),
  );
  manchal.visible = !carried.indoors;
  manchal.position.set(
    manchalJourney.walker.x,
    terrainHeight(manchalJourney.walker.x, manchalJourney.walker.z),
    manchalJourney.walker.z,
  );
  if (carried.traveled > 0)
    manchal.rotation.y = Math.atan2(-carried.directionX, -carried.directionZ);
  bearers.forEach((bearer, i) => {
    bearer.legs.forEach(
      (leg, side) =>
        (leg.rotation.x = THREE.MathUtils.damp(
          leg.rotation.x,
          carried.traveled > 0
            ? Math.sin(manchalJourney.stride + i * 0.25 + side * Math.PI) * 0.3
            : 0,
          8,
          actorDelta,
        )),
    );
    const local = bearer.figure.position;
    const x =
      manchal.position.x +
      local.x * Math.cos(manchal.rotation.y) +
      local.z * Math.sin(manchal.rotation.y);
    const z =
      manchal.position.z -
      local.x * Math.sin(manchal.rotation.y) +
      local.z * Math.cos(manchal.rotation.y);
    local.y = terrainHeight(x, z) - manchal.position.y;
  });
  procession.updateMatrixWorld(true);
  world.dataset.household = householdCurfews
    .map((curfew) => curfew.phase)
    .join(",");
  const lordPosition = new THREE.Vector3();
  lordActor.figure.getWorldPosition(lordPosition);
  const nightHours = dayState.hour >= 19.5 || dayState.hour < 5.5;
  if (
    gameStarted &&
    delta > 0 &&
    !nightHours &&
    villagers.filter((person) => elapsed < (person.chatUntil ?? 0)).length < 4
  ) {
    for (let i = 0; i < villagers.length; i++) {
      const person = villagers[i];
      if (
        person.walker.path.length ||
        !person.group.visible ||
        distanceToRoad(person.walker.x, person.walker.z) < 2.9 ||
        person.wait < 2 ||
        elapsed < (person.chatUntil ?? 0) ||
        elapsed < (person.nextChat ?? 0) ||
        pedestrianYields.has(person.walker)
      )
        continue;
      const partnerIndex = villagers.findIndex((other, j) => {
        const gap = Math.hypot(
          person.walker.x - other.walker.x,
          person.walker.z - other.walker.z,
        );
        return (
          j > i &&
          other.group.visible &&
          !other.walker.path.length &&
          distanceToRoad(other.walker.x, other.walker.z) > 2.9 &&
          other.wait > 2 &&
          elapsed >= (other.chatUntil ?? 0) &&
          elapsed >= (other.nextChat ?? 0) &&
          gap > 0.75 &&
          gap < 2.8 &&
          !pedestrianYields.has(other.walker)
        );
      });
      if (partnerIndex < 0) continue;
      const partner = villagers[partnerIndex];
      person.chatPartner = partnerIndex;
      partner.chatPartner = i;
      person.chatUntil = partner.chatUntil = elapsed + 3.5;
      person.wait = partner.wait = 3.7;
      person.nextChat = partner.nextChat = elapsed + 50;
      break; // Start at most one pair per frame; no large synchronized huddle.
    }
  }
  for (const villager of villagers) {
    const walker = villager.walker;
    if (
      villager.chatPartner !== undefined &&
      elapsed >= (villager.chatUntil ?? 0)
    ) {
      villager.chatPartner = undefined;
      villager.wait = Math.min(villager.wait, 0.2);
    }
    const gapX = walker.x - lordPosition.x;
    const gapZ = walker.z - lordPosition.z;
    const distanceToLord = Math.hypot(gapX, gapZ);
    if (
      gameStarted &&
      delta > 0 &&
      procession.visible &&
      !nightHours &&
      distanceToLord < 7.5 &&
      elapsed >= (villager.nextGreeting ?? 0)
    ) {
      villager.greetingUntil = elapsed + 2;
      villager.nextGreeting = elapsed + 35;
    }
    villager.greeting =
      gameStarted &&
      procession.visible &&
      !nightHours &&
      distanceToLord < 7.5 &&
      elapsed < (villager.greetingUntil ?? 0);
    let traveled = 0;
    let directionX = 0;
    let directionZ = 0;
    // Moving walkers yield inside advanceWalker; only idle/chatting people need a separate check.
    const givingWay =
      gameStarted &&
      delta > 0 &&
      (walker.path.length === 0 ||
        elapsed < (villager.chatUntil ?? 0) ||
        villager.greeting)
        ? pedestrianYield(walker, villager.speed * delta)
        : undefined;
    if (givingWay) {
      traveled = givingWay.traveled;
      directionX = givingWay.directionX;
      directionZ = givingWay.directionZ;
      villager.chatUntil = 0;
    } else if (villager.greeting) {
      // Step aside gradually, then pause and greet; keep the planned route for later.
      if (distanceToLord < 3.2 && distanceToLord > 0.001) {
        const step = Math.min(3.2 - distanceToLord, villager.speed * delta);
        directionX = gapX / distanceToLord;
        directionZ = gapZ / distanceToLord;
        const next = moveBody(
          [walker.x, walker.z],
          [walker.x + directionX * step, walker.z + directionZ * step],
          0.3,
          worldSolids,
          crowdBodies,
        );
        traveled = Math.hypot(next[0] - walker.x, next[1] - walker.z);
        walker.x = next[0];
        walker.z = next[1];
      }
      if (distanceToLord > 0.001) {
        const target = Math.atan2(gapX, gapZ);
        const turn = Math.atan2(
          Math.sin(target - villager.group.rotation.y),
          Math.cos(target - villager.group.rotation.y),
        );
        villager.group.rotation.y += turn * (1 - Math.exp(-7 * delta));
      }
    } else if (
      !nightHours &&
      elapsed < (villager.chatUntil ?? 0) &&
      villager.chatPartner !== undefined
    ) {
      const partner = villagers[villager.chatPartner];
      const facing = Math.atan2(
        walker.x - partner.walker.x,
        walker.z - partner.walker.z,
      );
      const turn = Math.atan2(
        Math.sin(facing - villager.group.rotation.y),
        Math.cos(facing - villager.group.rotation.y),
      );
      villager.group.rotation.y += turn * (1 - Math.exp(-4 * delta));
    } else if (gameStarted && delta > 0) {
      if (nightHours && villager.destination !== "home")
        sendVillagerTo(villager, "home", villager.home);
      if (walker.path.length > 0) {
        const movement = advanceWalker(walker, villager.speed * delta);
        traveled = movement.traveled;
        directionX = movement.directionX;
        directionZ = movement.directionZ;
        if (pedestrianYields.has(walker)) villager.chatUntil = 0;
        if (movement.arrived) {
          walker.path = [];
          walker.waypoint = 0;
          villager.wait =
            villager.destination === "home"
              ? 9
              : (villageDestinations.find(
                  (spot) => spot.activity === villager.destination,
                )?.pause ?? 8);
        }
      } else {
        if (
          !nightHours &&
          villager.destination !== "home" &&
          distanceToRoad(walker.x, walker.z) < 2.7
        ) {
          const shoulder = findGatheringSpot(
            [walker.x, walker.z],
            villagers.indexOf(villager),
            (x, z) =>
              distanceToRoad(x, z) > 2.8 &&
              !getWaterInfo(x, z) &&
              !worldSolids.some((solid) => insideSolid(solid, x, z, 0.4)),
          );
          if (distanceToRoad(...shoulder) > 2.8) {
            walker.path = [shoulder];
            walker.waypoint = 0;
          }
        }
        villager.wait -= delta;
        if (villager.wait <= 0) {
          if (nightHours) {
            villager.wait = 5;
          } else {
            const next =
              villageDestinations[
                villager.destinationIndex % villageDestinations.length
              ];
            villager.destinationIndex++;
            sendVillagerTo(villager, next.activity, next.position);
          }
        }
      }
      if (traveled > 0.00001) {
        const target = Math.atan2(-directionX, -directionZ);
        const turn = Math.atan2(
          Math.sin(target - villager.group.rotation.y),
          Math.cos(target - villager.group.rotation.y),
        );
        villager.group.rotation.y += turn * (1 - Math.exp(-8 * delta));
      }
    }
    villager.stepPhase += traveled * 6.2;
    const moving = traveled > 0.00001;
    const deck = bridgeHeightAt(bridgeSpan, walker.x, walker.z);
    const groundY = deck ?? terrainHeight(walker.x, walker.z);
    const bob =
      moving && !reducedMotion.matches
        ? Math.abs(Math.sin(villager.stepPhase)) * 0.025
        : 0;
    villager.group.position.set(walker.x, groundY + bob, walker.z);
    villager.group.visible = !(
      nightHours &&
      villager.destination === "home" &&
      walker.path.length === 0
    );
    villagerOfferings[villagers.indexOf(villager)].visible =
      villager.destination === "temple" && !moving && !nightHours;
    villager.legs.forEach((leg, index) => {
      const step = moving
        ? Math.sin(villager.stepPhase + index * Math.PI) * 0.48
        : 0;
      leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, step, 10, delta);
    });
    villager.arms.forEach((arm, index) => {
      const side = index === 0 ? 1 : -1;
      const gesture =
        !moving && villager.destination === "market" && !reducedMotion.matches
          ? 0.25 + Math.sin(elapsed * 1.4 + index * 2) * 0.14
          : 0;
      const chat =
        !nightHours &&
        elapsed < (villager.chatUntil ?? 0) &&
        !pedestrianYields.has(walker);
      const speaker =
        chat &&
        Math.floor(((villager.chatUntil ?? 0) - elapsed) / 1.5) % 2 ===
          (villagers.indexOf(villager) < (villager.chatPartner ?? 0) ? 0 : 1);
      const prayer = !moving && villager.destination === "temple";
      const swing = prayer
        ? 1.1
        : chat
          ? speaker
            ? 0.45 +
              (reducedMotion.matches ? 0 : Math.sin(elapsed * 2 + index) * 0.22)
            : 0.08
          : moving
            ? Math.sin(villager.stepPhase + index * Math.PI + Math.PI) * 0.28
            : gesture;
      arm.rotation.z = THREE.MathUtils.damp(
        arm.rotation.z,
        villager.greeting ? side * 1.05 : side * -0.12,
        4.5,
        delta,
      );
      arm.rotation.x = THREE.MathUtils.damp(
        arm.rotation.x,
        villager.greeting ? 0.58 : swing,
        4.5,
        delta,
      );
    });
  }
  world.dataset.conversations = String(
    villagers.filter(
      (person) => elapsed < (person.chatUntil ?? 0) && !nightHours,
    ).length / 2,
  );
  neighbourBubbles.forEach((bubble, index) => {
    const person = villagers[index];
    bubble.visible =
      person.group.visible &&
      !nightHours &&
      elapsed < (person.chatUntil ?? 0) &&
      !pedestrianYields.has(person.walker) &&
      Math.floor(((person.chatUntil ?? 0) - elapsed) / 1.5) % 2 ===
        (index < (person.chatPartner ?? 0) ? 0 : 1);
    bubble.position.set(
      person.group.position.x,
      person.group.position.y + 2.05,
      person.group.position.z,
    );
  });
  for (const animal of ambientAnimals) {
    if (animal.nightPatrol) {
      const patrol = animal.nightPatrol;
      const movement = advanceNightPatrol(
        patrol,
        dayState.hour,
        gameStarted && !reducedMotion.matches ? delta : 0,
        animal.speed * (elapsed < (animal.startledUntil ?? 0) ? 1.8 : 1),
      );
      animal.group.visible = movement.visible;
      animal.group.position.set(
        patrol.walker.x,
        terrainHeight(patrol.walker.x, patrol.walker.z),
        patrol.walker.z,
      );
      if (movement.traveled > 0) {
        const facing = Math.atan2(-movement.directionX, -movement.directionZ);
        const turn = Math.atan2(
          Math.sin(facing - animal.group.rotation.y),
          Math.cos(facing - animal.group.rotation.y),
        );
        animal.group.rotation.y += turn * (1 - Math.exp(-7 * delta));
      }
      animal.legs.forEach(
        (leg, index) =>
          (leg.rotation.x = THREE.MathUtils.damp(
            leg.rotation.x,
            movement.traveled > 0
              ? Math.sin(patrol.stride + index * Math.PI) * 0.32
              : 0,
            8,
            delta,
          )),
      );
      animal.head.rotation.x = THREE.MathUtils.damp(
        animal.head.rotation.x,
        0,
        4,
        delta,
      );
      continue;
    }
    const dx = animal.targetX - animal.group.position.x;
    const dz = animal.targetZ - animal.group.position.z;
    const distanceToTarget = Math.hypot(dx, dz);
    const isMoving = elapsed >= animal.waitUntil && distanceToTarget > 0.38;
    if (elapsed >= animal.waitUntil && distanceToTarget <= 0.38) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * animal.radius;
      const targetX = animal.anchorX + Math.cos(angle) * distance;
      const targetZ = animal.anchorZ + Math.sin(angle) * distance;
      const wild = !["cow", "hen", "duck"].includes(animal.species);
      const allowed = wild
        ? isForestHabitat(targetX, targetZ)
        : !insideTempleGround(targetX, targetZ, 2);
      animal.targetX = allowed ? targetX : animal.anchorX;
      animal.targetZ = allowed ? targetZ : animal.anchorZ;
      animal.waitUntil =
        elapsed + 1.2 + random() * (animal.species === "deer" ? 1.6 : 3.8);
    }
    if (isMoving) {
      const step = Math.min(
        distanceToTarget,
        animal.speed *
          delta *
          (elapsed < (animal.startledUntil ?? 0) ? 2.5 : 1),
      );
      const moveX = (dx / distanceToTarget) * step;
      const moveZ = (dz / distanceToTarget) * step;
      const next = moveBody(
        [animal.group.position.x, animal.group.position.z],
        [animal.group.position.x + moveX, animal.group.position.z + moveZ],
        animal.species === "rabbit"
          ? 0.18
          : animal.species === "elephant"
            ? 0.8
            : 0.35,
        worldSolids,
        crowdBodies,
      );
      const [x, z] = next;
      const hop =
        animal.species === "rabbit" && !reducedMotion.matches
          ? Math.abs(Math.sin(elapsed * 8 + animal.phase)) * 0.08
          : 0;
      animal.group.position.set(
        x,
        (animal.surfaceY ?? terrainHeight(x, z)) + hop,
        z,
      );
      animal.group.rotation.y = Math.atan2(-moveX, -moveZ);
    }
    animal.legs.forEach((leg, index) => {
      const gaitRate =
        animal.species === "elephant"
          ? 3.2
          : animal.species === "hen" || animal.species === "duck"
            ? 7
            : animal.species === "deer"
              ? 8
              : 5;
      const stride =
        animal.species === "elephant"
          ? 0.12
          : animal.species === "hen" || animal.species === "duck"
            ? 0.32
            : 0.24;
      const gait = isMoving
        ? Math.sin(elapsed * gaitRate + animal.phase + index * Math.PI) * stride
        : 0;
      leg.rotation.x = THREE.MathUtils.damp(leg.rotation.x, gait, 9, delta);
    });
    const grazingAngle =
      animal.species === "hen" || animal.species === "duck"
        ? 0.48
        : animal.species === "elephant"
          ? 0.24
          : -0.5;
    animal.head.rotation.x = THREE.MathUtils.damp(
      animal.head.rotation.x,
      isMoving
        ? 0
        : grazingAngle + Math.sin(elapsed * 1.7 + animal.phase) * 0.06,
      3.5,
      delta,
    );
  }
  world.dataset.predators = JSON.stringify(
    ambientAnimals
      .filter((animal) => animal.nightPatrol)
      .map((animal) => ({
        species: animal.species,
        visible: animal.group.visible,
        resting: animal.nightPatrol!.resting,
        x: animal.group.position.x,
        z: animal.group.position.z,
      })),
  );
  for (const ox of oxTeams) {
    const active =
      gameStarted && isWorkday(dayState.hour) && oxHandlers[ox.index].working;
    if (active && !reducedMotion.matches) ox.time += delta;
    const cycle = ox.time % 24;
    const forward = cycle < 12;
    const progress = forward ? cycle / 12 : (24 - cycle) / 12;
    ox.team.position.set(
      ox.x - 1.5 + progress * 3,
      paddyWaterLevels[ox.index],
      ox.z - 1,
    );
    ox.team.rotation.y = forward ? -Math.PI / 2 : Math.PI / 2;
    ox.team.visible = active;
    ox.oxen.forEach((animal) =>
      animal.legs.forEach(
        (leg, side) =>
          (leg.rotation.x =
            active && !reducedMotion.matches
              ? Math.sin(ox.time * 4 + side * Math.PI) * 0.25
              : 0),
      ),
    );
    ox.farmer.legs.forEach(
      (leg, side) =>
        (leg.rotation.x =
          active && !reducedMotion.matches
            ? Math.sin(ox.time * 4 + side * Math.PI) * 0.3
            : 0),
    );
  }
  for (const vehicle of vehicles) {
    if (vehicle === landlordCart) continue;
    const cartDelta = gameStarted ? delta : 0;
    if (vehicle.delivery && vehicle.farm && vehicle.market) {
      const wasDelivered = vehicle.delivery.delivered;
      const movement = advanceFarmDelivery(
        vehicle.delivery,
        vehicle.walker,
        dayState.hour,
        cartDelta,
        2.7,
        vehicle.farm,
        vehicle.market,
        villagePaths.findPath,
      );
      vehicle.parked = movement.parked;
      vehicle.group.visible = !movement.parked;
      vehicle.group.position.set(
        vehicle.walker.x,
        terrainHeight(vehicle.walker.x, vehicle.walker.z),
        vehicle.walker.z,
      );
      vehicle.stride += movement.traveled * 4;
      if (movement.traveled > 0) {
        const facing = Math.atan2(-movement.directionX, -movement.directionZ);
        vehicle.group.rotation.y +=
          Math.atan2(
            Math.sin(facing - vehicle.group.rotation.y),
            Math.cos(facing - vehicle.group.rotation.y),
          ) *
          (1 - Math.exp(-5 * cartDelta));
      }
      vehicle.wheels.forEach((wheel) =>
        wheel.rotateZ(-movement.traveled / 0.66),
      );
      vehicle.horseLegs.forEach(
        (leg, index) =>
          (leg.rotation.x = THREE.MathUtils.damp(
            leg.rotation.x,
            movement.traveled > 0
              ? Math.sin(vehicle.stride + index * Math.PI * 0.5) * 0.28
              : 0,
            8,
            cartDelta,
          )),
      );
      if (vehicle.produce) vehicle.produce.visible = vehicle.delivery.loaded;
      if (vehicle.delivery.delivered > wasDelivered) {
        marketFarmCrates.visible = true;
        shops[0].stock = Math.min(30, shops[0].stock + 6);
        shopGoods[0].forEach(
          (good, index) => (good.visible = index < shops[0].stock),
        );
      }
      continue;
    }
    const closing = !isWorkday(dayState.hour);
    const route = vehicle.route
      .getSpacedPoints(100)
      .map((p) => [p.x, p.z] as const);
    if (closing && vehicle.forward && cartDelta > 0) {
      let nearest = 0;
      route.forEach((p, i) => {
        if (
          Math.hypot(p[0] - vehicle.walker.x, p[1] - vehicle.walker.z) <
          Math.hypot(
            route[nearest][0] - vehicle.walker.x,
            route[nearest][1] - vehicle.walker.z,
          )
        )
          nearest = i;
      });
      vehicle.walker.path = route.slice(0, nearest + 1).reverse();
      vehicle.walker.waypoint = 0;
      vehicle.forward = false;
      vehicle.wait = 0;
    }
    if (!closing && vehicle.parked && cartDelta > 0) {
      vehicle.parked = false;
      vehicle.wait = 2;
    }
    vehicle.group.visible = !vehicle.parked;
    vehicle.wait = Math.max(0, vehicle.wait - cartDelta);
    if (
      vehicle.walker.waypoint >= vehicle.walker.path.length &&
      vehicle.wait === 0 &&
      !vehicle.parked &&
      cartDelta > 0
    ) {
      if (closing) {
        vehicle.parked = true;
        vehicle.group.visible = false;
      } else {
        vehicle.forward = !vehicle.forward;
        vehicle.walker.path = vehicle.forward ? route : [...route].reverse();
        vehicle.walker.waypoint = 0;
        vehicle.wait = 3;
      }
    }
    const movement = advanceWalker(
      vehicle.walker,
      vehicle.wait > 0 || vehicle.parked
        ? 0
        : cartDelta * Math.max(2, vehicle.speed * vehicle.route.getLength()),
    );
    vehicle.stride += movement.traveled * 4;
    vehicle.group.position.set(
      vehicle.walker.x,
      terrainHeight(vehicle.walker.x, vehicle.walker.z),
      vehicle.walker.z,
    );
    if (movement.traveled > 0) {
      const facing = Math.atan2(-movement.directionX, -movement.directionZ);
      vehicle.group.rotation.y +=
        Math.atan2(
          Math.sin(facing - vehicle.group.rotation.y),
          Math.cos(facing - vehicle.group.rotation.y),
        ) *
        (1 - Math.exp(-5 * cartDelta));
    }
    vehicle.wheels.forEach((wheel) => wheel.rotateZ(-movement.traveled / 0.66));
    vehicle.horse.position.y =
      movement.traveled > 0 && !reducedMotion.matches
        ? Math.abs(Math.sin(vehicle.stride)) * 0.025
        : 0;
    vehicle.horseLegs.forEach((leg, index) => {
      leg.rotation.x = THREE.MathUtils.damp(
        leg.rotation.x,
        movement.traveled > 0
          ? Math.sin(vehicle.stride + index * Math.PI * 0.5) * 0.28
          : 0,
        8,
        cartDelta,
      );
    });
  }
  world.dataset.carts = JSON.stringify(
    vehicles
      .filter((v) => v !== landlordCart)
      .map((v) => ({
        parked: v.parked,
        x: v.walker.x,
        z: v.walker.z,
        phase: v.delivery?.phase,
        delivered: v.delivery?.delivered,
        loaded: v.delivery?.loaded,
      })),
  );
  for (const relic of relics) {
    if (!relic.collected) {
      relic.group.position.y =
        terrainHeight(relic.group.position.x, relic.group.position.z) +
        1.1 +
        Math.sin(elapsed * 1.7 + relic.phase) * 0.16;
      relic.group.rotation.y = elapsed * 0.55 + relic.phase;
    }
  }
  const shopDay = simulationDay(simulationTime);
  if (shopDay !== lastShopDay && isWorkday(dayState.hour)) {
    lastShopDay = shopDay;
    shops[0].stock = 18;
    shops[1].stock = 12;
    shops[2].stock = 20;
    shops[3].stock = 16;
    shops[4].stock = 20;
    shopGoods.forEach((goods) =>
      goods.forEach((good) => (good.visible = true)),
    );
  }
  if (consuming && gameStarted) {
    consuming.remaining = Math.max(0, consuming.remaining - delta);
    playerArms[1].rotation.x =
      consuming.kind === "banana" || consuming.kind === "snack" ? 1.9 : 2.05;
    playerArms[1].rotation.z = -0.25;
    heldCoconut.rotation.x = -0.25;
    if (consuming.remaining === 0) {
      const kind = consuming.kind;
      finishFood(wallet, kind);
      updateWallet();
      consuming = undefined;
      heldBanana.visible =
        heldCoconut.visible =
        heldTea.visible =
        heldSnack.visible =
        heldToddy.visible =
          false;
      document.querySelector("#food-status")!.textContent =
        `Enjoyed: ${wallet.bananasEaten} banana · ${wallet.coconutsDrunk} coconut · ${wallet.teasDrunk ?? 0} tea · ${wallet.snacksEaten ?? 0} snack`;
      setToast(`${FOOD[kind].label} finished. Ready to wander.`);
      if (kind === "toddy") {
        const response = drinkToddy(toddyState);
        setToast(
          response === "nausea"
            ? "Too much toddy — you feel sick and retch. Rest while it passes."
            : "Toddy causes temporary unsteadiness. Rest before riding; more drinks can cause nausea.",
        );
      }
    }
  }
  const nightLight = 1 - dayState.daylight;
  world.dataset.templeVisitors = String(
    templeWorshippers.filter((person) => person.actor.working).length +
      (lordPraying ? 1 : 0),
  );
  const visibleLights: {
    position: THREE.Vector3;
    distance: number;
    intensity: number;
  }[] = [];
  for (const { prop, owner, arm, index } of carriedLights) {
    let visible = owner.visible;
    for (let parent = owner.parent; parent; parent = parent.parent)
      visible = visible && parent.visible;
    prop.group.visible = visible && nightLight > 0.2;
    if (!prop.group.visible) continue;
    arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, 0.5, 5, delta);
    const flicker = reducedMotion.matches
      ? 1
      : 1 + Math.sin(elapsed * 8 + index) * 0.06;
    prop.flame.scale.x = (prop.kind === "lamp" ? 0.8 : 1.5) * flicker;
    const position = prop.flame.getWorldPosition(new THREE.Vector3());
    visibleLights.push({
      position,
      distance: Math.hypot(
        position.x - playerState.x,
        position.z - playerState.z,
      ),
      intensity: nightLight * flicker * 5,
    });
  }
  visibleLights.sort((a, b) => a.distance - b.distance);
  portableLightPool.forEach((light, index) => {
    const source = visibleLights[index];
    light.intensity = source && source.distance < 25 ? source.intensity : 0;
    if (source) light.position.copy(source.position);
  });
  world.dataset.nightLights = String(visibleLights.length);
  rainUmbrellas.forEach(({ owner, umbrella, kind, arm }) => {
    const climbing = coconutHarvesters.some(
      (harvester) =>
        harvester.person.figure === owner &&
        harvester.delivery === "harvest" &&
        owner.position.y >
          terrainHeight(owner.position.x, owner.position.z) + 0.6,
    );
    const indoors = workerActors.some(
      (actor) =>
        actor.group === owner &&
        actor.working &&
        actor.workParent !== undefined,
    );
    let riding = owner === player && horseMode === "ridden";
    for (let parent = owner.parent; parent; parent = parent.parent)
      if (vehicles.some((v) => v.group === parent) || parent === manchal)
        riding = true;
    umbrella.visible =
      rainWetness > 0.12 &&
      visibleActor(owner) &&
      !climbing &&
      !indoors &&
      !riding;
    umbrella.userData.cover = kind;
    if (umbrella.visible && kind === "leaf" && arm) {
      arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, 2.1, 6, delta);
      arm.rotation.z = THREE.MathUtils.damp(arm.rotation.z, 0.15, 6, delta);
      arm.updateWorldMatrix(true, false);
      const ownerRotation = owner.getWorldQuaternion(new THREE.Quaternion());
      umbrella.quaternion.copy(
        arm
          .getWorldQuaternion(new THREE.Quaternion())
          .invert()
          .multiply(ownerRotation),
      );
    }
  });
  world.dataset.umbrellas = String(
    rainUmbrellas.filter(
      (entry) => entry.kind === "umbrella" && entry.umbrella.visible,
    ).length,
  );
  world.dataset.rainLeaves = String(
    rainUmbrellas.filter(
      (entry) => entry.kind === "leaf" && entry.umbrella.visible,
    ).length,
  );
  advanceEquipment(equipment, gameStarted ? delta : 0);
  for (const kind of ["bow", "sword", "shield"] as const)
    heldEquipment[kind].visible =
      equipment.selected === kind &&
      !consuming &&
      horseMode !== "ridden" &&
      !playerState.swimming;
  if (equipment.active > 0 && !consuming) {
    const arm = playerArms[equipment.selected === "shield" ? 0 : 1];
    arm.rotation.x =
      equipment.selected === "shield"
        ? 1.1
        : equipment.selected === "bow"
          ? 1.5
          : 1.4 + Math.sin(equipment.active * 5) * 0.5;
    arm.rotation.z = equipment.selected === "sword" ? -0.4 : 0;
  }
  for (let index = practiceArrows.length - 1; index >= 0; index--) {
    const arrow = practiceArrows[index];
    const step = gameStarted ? delta : 0;
    arrow.remaining -= step;
    arrow.group.position.addScaledVector(arrow.direction, step * 20);
    if (arrow.remaining <= 0) {
      scene.remove(arrow.group);
      arrow.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
      practiceArrows.splice(index, 1);
    }
  }
  world.dataset.equipment = JSON.stringify(equipment);
  document.querySelector("#equipment-status")!.textContent =
    `F · ${equipment.selected === "none" ? "Equipment: none" : KALARI_GOODS[equipment.selected].label} · R to use${nearestBoard() ? " · L translate board" : ""}`;
  world.dataset.rabbits = String(
    ambientAnimals.filter((a) => a.species === "rabbit").length,
  );
  if (
    openShop &&
    ((openShop === "kalari" && !nearbyKalariShop()) ||
      (openShop === "tea" && !nearbyTeaShop()) ||
      (openShop === "toddy" && !nearbyToddyShop()))
  )
    closeShop();
  const wasNauseous = toddyState.nausea > 0;
  advanceToddy(toddyState, gameStarted ? delta : 0);
  if (wasNauseous && toddyState.nausea === 0) {
    document.querySelector("#food-status")!.textContent =
      "Nausea passed · Still recovering from toddy";
  }
  world.dataset.toddy = JSON.stringify(toddyState);
  document
    .querySelector(".world-vignette")!
    .classList.toggle(
      "tipsy",
      toddyState.level > 0.3 && !reducedMotion.matches,
    );
  if (toddyState.nausea > 0) {
    playerVisual.rotation.x = 0.5;
    document.querySelector("#food-status")!.textContent =
      "Feeling sick · Resting (non-graphic retching)";
  }
  const distance = horseMode === "ridden" ? 9.5 : 7.4;
  const horizontalDistance = Math.cos(pitch) * distance;
  const desiredCamera = new THREE.Vector3(
    playerState.x + Math.sin(yaw) * horizontalDistance,
    playerState.y +
      (horseMode === "ridden" ? 3.35 : 2.1) +
      Math.sin(pitch) * distance,
    playerState.z + Math.cos(yaw) * horizontalDistance,
  );
  desiredCamera.y = Math.max(
    desiredCamera.y,
    terrainHeight(desiredCamera.x, desiredCamera.z) + 1.2,
  );
  camera.position.lerp(desiredCamera, 1 - Math.exp(-5 * delta));
  camera.lookAt(
    playerState.x,
    playerState.y + (horseMode === "ridden" ? 2.4 : 1.15),
    playerState.z,
  );
  if (!reducedMotion.matches && toddyState.level > 0.3)
    camera.rotateZ(
      Math.sin(elapsed * 1.3) * Math.min(0.025, toddyState.level * 0.012),
    );
  if (realisticGraphics) composer.render(delta);
  else renderer.render(scene, camera);
};
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  setGraphicsQuality();
});
