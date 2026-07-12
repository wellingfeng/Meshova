/** Lake-centred daylight metropolis with villas, parkland and a dense skyline. */
import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  cylinder,
  icosphere,
  merge,
  sphere,
  transform,
  type Mesh,
  type NamedPart,
  type PartInstanceTransform,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];
type XYZ = [number, number, number];

export interface GardenMetropolisParams {
  width: number;
  depth: number;
  lakeRadiusX: number;
  lakeRadiusZ: number;
  villaCount: number;
  treeCount: number;
  skylineCount: number;
  minTowerFloors: number;
  maxTowerFloors: number;
  floorHeight: number;
  seed: number;
}

export const GARDEN_METROPOLIS_DEFAULTS: GardenMetropolisParams = {
  width: 240,
  depth: 190,
  lakeRadiusX: 38,
  lakeRadiusZ: 25,
  villaCount: 36,
  treeCount: 420,
  skylineCount: 58,
  minTowerFloors: 10,
  maxTowerFloors: 52,
  floorHeight: 1.28,
  seed: 1783,
};

interface Group {
  label: string;
  source: Mesh;
  color: RGB;
  surface: PartSurfaceRef;
  transforms: PartInstanceTransform[];
  metadata?: Record<string, unknown>;
}

class SceneBag {
  private readonly groups = new Map<string, Group>();
  private readonly order: string[] = [];

  add(
    name: string,
    label: string,
    source: Mesh,
    color: RGB,
    surface: PartSurfaceRef,
    position: XYZ,
    scale: XYZ,
    rotation: XYZ = [0, 0, 0],
    metadata?: Record<string, unknown>,
  ): void {
    let group = this.groups.get(name);
    if (!group) {
      group = { label, source, color, surface, transforms: [], ...(metadata ? { metadata } : {}) };
      this.groups.set(name, group);
      this.order.push(name);
    }
    group.transforms.push({ position, scale, rotation });
  }

  toParts(): NamedPart[] {
    return this.order.map((name) => {
      const group = this.groups.get(name)!;
      const meshes = group.transforms.map((instance) => transform(group.source, {
        translate: vec3(...instance.position),
        scale: vec3(...(instance.scale ?? [1, 1, 1])),
        rotate: vec3(...(instance.rotation ?? [0, 0, 0])),
      }));
      return {
        name,
        label: group.label,
        mesh: merge(...meshes),
        color: group.color,
        surface: group.surface,
        renderInstances: { mesh: group.source, transforms: group.transforms },
        ...(group.metadata ? { metadata: group.metadata } : {}),
      };
    });
  }
}

interface Footprint {
  x: number;
  z: number;
  radius: number;
}

const UNIT_BOX = box(1, 1, 1);
const UNIT_DISC = cylinder(1, 1, 64, true);
const UNIT_TRUNK = cylinder(1, 1, 7, true);
const UNIT_CROWN = icosphere(1, 1);
const UNIT_LEAF = sphere(1, 7, 4);

const GRASS: RGB = [0.28, 0.52, 0.2];
const WATER: RGB = [0.08, 0.36, 0.46];
const ROAD: RGB = [0.17, 0.18, 0.18];
const PATH: RGB = [0.7, 0.67, 0.58];
const TRUNK: RGB = [0.28, 0.19, 0.11];
const GLASS: RGB = [0.15, 0.36, 0.46];

const TOWER_PALETTES: ReadonlyArray<{ color: RGB; surface: PartSurfaceRef }> = [
  { color: [0.65, 0.7, 0.72], surface: { type: "concrete", params: { color: [0.65, 0.7, 0.72], roughness: 0.68 } } },
  { color: [0.18, 0.34, 0.42], surface: { type: "glass", params: { tint: [0.18, 0.34, 0.42], roughness: 0.13 } } },
  { color: [0.48, 0.54, 0.57], surface: { type: "metal", params: { color: [0.48, 0.54, 0.57], roughness: 0.34 } } },
  { color: [0.78, 0.76, 0.68], surface: { type: "stone", params: { color: [0.78, 0.76, 0.68], roughness: 0.72 } } },
];

const VILLA_PALETTES: ReadonlyArray<{ wall: RGB; roof: RGB }> = [
  { wall: [0.82, 0.8, 0.72], roof: [0.34, 0.3, 0.27] },
  { wall: [0.72, 0.76, 0.76], roof: [0.24, 0.28, 0.3] },
  { wall: [0.74, 0.64, 0.54], roof: [0.37, 0.26, 0.2] },
  { wall: [0.86, 0.84, 0.78], roof: [0.46, 0.42, 0.36] },
];

export function buildGardenMetropolisParts(
  params: Partial<GardenMetropolisParams> = {},
): NamedPart[] {
  const p = normalizeParams({ ...GARDEN_METROPOLIS_DEFAULTS, ...params });
  const rng = makeRng(Math.round(p.seed) >>> 0);
  const bag = new SceneBag();
  addTerrainAndLake(bag, p);
  addRoads(bag, p);
  const villas = addVillas(bag, p, rng.fork());
  const towers = addSkyline(bag, p, rng.fork());
  addTrees(bag, p, rng.fork(), [...villas, ...towers]);
  addLakeIslands(bag, p, rng.fork());
  return bag.toParts();
}

function normalizeParams(p: GardenMetropolisParams): GardenMetropolisParams {
  const width = clamp(p.width, 120, 420);
  const depth = clamp(p.depth, 110, 360);
  return {
    width,
    depth,
    lakeRadiusX: clamp(p.lakeRadiusX, 12, width * 0.28),
    lakeRadiusZ: clamp(p.lakeRadiusZ, 9, depth * 0.24),
    villaCount: clampInt(p.villaCount, 6, 100),
    treeCount: clampInt(p.treeCount, 40, 1000),
    skylineCount: clampInt(p.skylineCount, 12, 140),
    minTowerFloors: clampInt(p.minTowerFloors, 4, 30),
    maxTowerFloors: clampInt(p.maxTowerFloors, Math.max(8, p.minTowerFloors), 90),
    floorHeight: clamp(p.floorHeight, 0.8, 2.2),
    seed: Math.round(p.seed),
  };
}

function addTerrainAndLake(bag: SceneBag, p: GardenMetropolisParams): void {
  bag.add("park_ground", "花园都市绿地", UNIT_BOX, GRASS, {
    type: "stylizedFoliage",
    params: { color: GRASS, bands: 4, seed: p.seed },
  }, [0, -0.28, 0], [p.width, 0.5, p.depth], [0, 0, 0], {
    layout: "lake-centred garden metropolis",
  });
  bag.add("lake_shore", "湖岸浅滩", UNIT_DISC, [0.58, 0.57, 0.45], {
    type: "stone",
    params: { color: [0.58, 0.57, 0.45], roughness: 0.88 },
  }, [0, 0.01, 4], [p.lakeRadiusX + 2.8, 0.12, p.lakeRadiusZ + 2.8]);
  bag.add("central_lake", "中央景观湖", UNIT_DISC, WATER, {
    type: "water",
    params: {
      body: "pond",
      tint: [0.12, 0.48, 0.56],
      deepColor: WATER,
      roughness: 0.12,
      waveAmplitude: 0.035,
      flowSpeed: 0.12,
      seed: p.seed + 1,
    },
  }, [0, 0.12, 4], [p.lakeRadiusX, 0.08, p.lakeRadiusZ]);
}

function addRoads(bag: SceneBag, p: GardenMetropolisParams): void {
  addEllipse(bag, "lake_ring_road", "环湖道路", ROAD, {
    type: "wetGround",
    params: { color: ROAD, roughness: 0.72, wetness: 0.08, seed: p.seed + 2 },
  }, p.lakeRadiusX + 15, p.lakeRadiusZ + 15, 4, 4.8, 0.045);
  addEllipse(bag, "lake_promenade", "环湖步道", PATH, {
    type: "concrete",
    params: { color: PATH, roughness: 0.85 },
  }, p.lakeRadiusX + 6, p.lakeRadiusZ + 6, 4, 1.7, 0.075);
  bag.add("skyline_boulevard", "天际线林荫大道", UNIT_BOX, ROAD, {
    type: "wetGround",
    params: { color: ROAD, roughness: 0.68, wetness: 0.06, seed: p.seed + 3 },
  }, [0, 0.055, -p.depth * 0.25], [p.width * 0.9, 0.11, 7.5]);
  for (const x of [-p.width * 0.34, p.width * 0.34]) {
    bag.add("park_connectors", "公园连接道路", UNIT_BOX, ROAD, {
      type: "wetGround",
      params: { color: ROAD, roughness: 0.72, wetness: 0.06, seed: p.seed + 4 },
    }, [x, 0.075, 5], [6, 0.1, p.depth * 0.78]);
  }
}

function addEllipse(
  bag: SceneBag,
  name: string,
  label: string,
  color: RGB,
  surface: PartSurfaceRef,
  radiusX: number,
  radiusZ: number,
  centreZ: number,
  width: number,
  y: number,
): void {
  const segments = 72;
  for (let index = 0; index < segments; index++) {
    const a0 = (index / segments) * Math.PI * 2;
    const a1 = ((index + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * radiusX;
    const z0 = centreZ + Math.sin(a0) * radiusZ;
    const x1 = Math.cos(a1) * radiusX;
    const z1 = centreZ + Math.sin(a1) * radiusZ;
    const dx = x1 - x0;
    const dz = z1 - z0;
    bag.add(name, label, UNIT_BOX, color, surface, [(x0 + x1) * 0.5, y, (z0 + z1) * 0.5], [
      Math.hypot(dx, dz) + 0.3,
      0.1,
      width,
    ], [0, -Math.atan2(dz, dx), 0]);
  }
}

function addVillas(bag: SceneBag, p: GardenMetropolisParams, rng: Rng): Footprint[] {
  const footprints: Footprint[] = [];
  let attempts = 0;
  while (footprints.length < p.villaCount && attempts < p.villaCount * 80) {
    attempts++;
    const x = rng.range(-p.width * 0.44, p.width * 0.44);
    const z = rng.range(-p.depth * 0.14, p.depth * 0.43);
    const lakeDistance = Math.hypot(x / (p.lakeRadiusX + 12), (z - 4) / (p.lakeRadiusZ + 12));
    if (lakeDistance < 1.05) continue;
    if (Math.abs(x) > p.width * 0.31 && z < -p.depth * 0.04) continue;
    const radius = rng.range(4.8, 7.2);
    if (footprints.some((other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius + 1.4)) continue;
    const lot = { x, z, radius };
    footprints.push(lot);
    addVilla(bag, p, rng.fork(), lot, footprints.length - 1);
  }
  return footprints;
}

function addVilla(bag: SceneBag, p: GardenMetropolisParams, rng: Rng, lot: Footprint, index: number): void {
  const paletteIndex = rng.int(0, VILLA_PALETTES.length - 1);
  const palette = VILLA_PALETTES[paletteIndex]!;
  const width = lot.radius * rng.range(1.05, 1.42);
  const depth = lot.radius * rng.range(0.78, 1.12);
  const height = rng.range(3.4, 5.4);
  const yaw = Math.atan2(-lot.x, 4 - lot.z);
  const wallSurface: PartSurfaceRef = {
    type: "stylizedPlaster",
    params: { color: palette.wall, bands: 4, seed: p.seed + index * 7 },
  };
  const roofSurface: PartSurfaceRef = { type: "concrete", params: { color: palette.roof, roughness: 0.78 } };
  bag.add(`villa_walls_${paletteIndex + 1}`, `湖畔住宅墙体${paletteIndex + 1}`, UNIT_BOX, palette.wall, wallSurface,
    [lot.x, height * 0.5 + 0.18, lot.z], [width, height, depth], [0, yaw, 0]);

  let roofX = lot.x;
  let roofZ = lot.z;
  let roofY = height;
  let roofWidth = width;
  let roofDepth = depth;
  if (rng.next() < 0.7) {
    const upperWidth = width * rng.range(0.48, 0.72);
    const upperDepth = depth * rng.range(0.5, 0.78);
    const upperHeight = height * rng.range(0.45, 0.7);
    const upper = localPoint(lot.x, lot.z, yaw, rng.range(-width * 0.12, width * 0.12), rng.range(-depth * 0.08, depth * 0.08));
    bag.add(`villa_walls_${paletteIndex + 1}`, `湖畔住宅墙体${paletteIndex + 1}`, UNIT_BOX, palette.wall, wallSurface,
      [upper.x, height + upperHeight * 0.5, upper.z], [upperWidth, upperHeight, upperDepth], [0, yaw, 0]);
    roofX = upper.x;
    roofZ = upper.z;
    roofY += upperHeight;
    roofWidth = upperWidth;
    roofDepth = upperDepth;
  }
  bag.add(`villa_roofs_${paletteIndex + 1}`, `住宅屋面${paletteIndex + 1}`, UNIT_BOX, palette.roof, roofSurface,
    [roofX, roofY + 0.16, roofZ], [roofWidth + 0.35, 0.28, roofDepth + 0.35], [0, yaw, 0]);

  const front = localPoint(lot.x, lot.z, yaw, 0, depth * 0.5 + 0.04);
  bag.add("villa_glazing", "住宅落地玻璃", UNIT_BOX, GLASS, {
    type: "glass",
    params: { tint: GLASS, roughness: 0.12 },
  }, [front.x, height * 0.56, front.z], [width * rng.range(0.42, 0.72), height * 0.45, 0.08], [0, yaw, 0]);
  const terrace = localPoint(lot.x, lot.z, yaw, 0, depth * 0.68);
  bag.add("villa_terraces", "住宅露台", UNIT_BOX, PATH, {
    type: "stone",
    params: { color: PATH, roughness: 0.76 },
  }, [terrace.x, 0.12, terrace.z], [width * 0.78, 0.22, depth * 0.34], [0, yaw, 0]);
}

function addSkyline(bag: SceneBag, p: GardenMetropolisParams, rng: Rng): Footprint[] {
  const footprints: Footprint[] = [];
  const columns = Math.ceil(Math.sqrt(p.skylineCount * 2.25));
  const rows = Math.ceil(p.skylineCount / columns);
  const spanX = p.width * 0.92;
  const baseZ = -p.depth * 0.29;
  const rowStep = p.depth * 0.18 / Math.max(1, rows - 1);
  let placed = 0;
  for (let row = 0; row < rows && placed < p.skylineCount; row++) {
    for (let column = 0; column < columns && placed < p.skylineCount; column++) {
      const x = -spanX * 0.5 + (column + 0.5) * (spanX / columns) + rng.range(-4, 4);
      const z = baseZ - row * rowStep + rng.range(-3, 3);
      const centreWeight = Math.pow(Math.max(0, 1 - Math.abs(x) / (spanX * 0.58)), 1.35);
      const floorT = clamp(0.18 + centreWeight * 0.78 + rng.range(-0.18, 0.16), 0, 1);
      const floors = Math.round(lerp(p.minTowerFloors, p.maxTowerFloors, floorT));
      const width = rng.range(6.5, 13.5);
      const depth = rng.range(5.5, 12);
      addTower(bag, p, rng.fork(), x, z, width, depth, floors, rng.range(-0.12, 0.12), placed);
      footprints.push({ x, z, radius: Math.max(width, depth) * 0.58 });
      placed++;
    }
  }
  return footprints;
}

function addTower(
  bag: SceneBag,
  p: GardenMetropolisParams,
  rng: Rng,
  x: number,
  z: number,
  width: number,
  depth: number,
  floors: number,
  yaw: number,
  index: number,
): void {
  const paletteIndex = rng.int(0, TOWER_PALETTES.length - 1);
  const palette = TOWER_PALETTES[paletteIndex]!;
  const height = floors * p.floorHeight;
  const podiumHeight = Math.min(6.5, height * 0.14);
  const massName = `skyline_towers_${paletteIndex + 1}`;
  const addMass = (localX: number, y: number, localZ: number, sx: number, sy: number, sz: number): void => {
    const point = localPoint(x, z, yaw, localX, localZ);
    bag.add(massName, `都市塔楼${paletteIndex + 1}`, UNIT_BOX, palette.color, palette.surface,
      [point.x, y + 0.03 + paletteIndex * 0.05, point.z], [sx * 0.65, sy, sz * 0.65], [0, yaw, 0]);
  };
  addMass(0, podiumHeight * 0.5, 0, width * 1.18, podiumHeight, depth * 1.16);

  const profile = rng.int(0, 4);
  if (profile === 0) {
    addMass(0, podiumHeight + (height - podiumHeight) * 0.5, 0, width, height - podiumHeight, depth);
  } else if (profile === 1) {
    const tierHeight = (height - podiumHeight) / 3;
    for (let tier = 0; tier < 3; tier++) {
      const inset = tier * Math.min(width, depth) * 0.1;
      addMass(0, podiumHeight + tierHeight * (tier + 0.5), 0, width - inset, tierHeight + 0.08, depth - inset);
    }
  } else if (profile === 2) {
    const segmentHeight = (height - podiumHeight) / 4;
    for (let segment = 0; segment < 4; segment++) {
      addMass((segment % 2 === 0 ? -1 : 1) * width * 0.12, podiumHeight + segmentHeight * (segment + 0.5), 0,
        width * 0.86, segmentHeight + 0.1, depth);
    }
  } else if (profile === 3) {
    addMass(-width * 0.23, podiumHeight + (height - podiumHeight) * 0.5, 0, width * 0.46, height - podiumHeight, depth);
    addMass(width * 0.23, podiumHeight + (height - podiumHeight) * 0.43, 0, width * 0.38, (height - podiumHeight) * 0.86, depth * 0.9);
  } else {
    addMass(0, podiumHeight + (height - podiumHeight) * 0.34, 0, width * 0.58, (height - podiumHeight) * 0.68, depth * 0.64);
    addMass(0, podiumHeight + (height - podiumHeight) * 0.79, 0, width * 1.04, (height - podiumHeight) * 0.34, depth * 0.92);
  }
  if (rng.next() < 0.72) {
    const crownHeight = rng.range(1.2, Math.max(1.5, Math.min(7, height * 0.12)));
    addMass(0, height + crownHeight * 0.5, 0, width * rng.range(0.28, 0.68), crownHeight, depth * rng.range(0.28, 0.68));
  }
  if (height > 44 && rng.next() < 0.3) addMass(0, height + 6, 0, 0.28, 12, 0.28);

  const bandCount = clampInt(Math.round(floors / 4), 3, 13);
  for (let band = 0; band < bandCount; band++) {
    if (rng.next() < 0.16) continue;
    const bandY = podiumHeight + (height - podiumHeight) * ((band + 1) / (bandCount + 1));
    const front = localPoint(x, z, yaw, 0, depth * 0.5 + 0.045);
    bag.add("skyline_window_bands", "高层幕墙窗带", UNIT_BOX, [0.21, 0.46, 0.58], {
      type: "glass",
      params: { tint: [0.21, 0.46, 0.58], roughness: 0.1 },
    }, [front.x, bandY, front.z], [width * 0.78, Math.max(0.18, p.floorHeight * 0.22), 0.09], [0, yaw, 0]);
  }
  if (index % 9 === 0) {
    bag.add("skyline_signature_caps", "异形塔冠", UNIT_BOX, [0.62, 0.68, 0.7], {
      type: "metal",
      params: { color: [0.62, 0.68, 0.7], roughness: 0.3 },
    }, [x, height + 1.4, z], [width * 1.28, 1.1, depth * 0.52], [0, yaw + 0.18, 0.12]);
  }
}

function addTrees(bag: SceneBag, p: GardenMetropolisParams, rng: Rng, occupied: readonly Footprint[]): void {
  let placed = 0;
  let attempts = 0;
  while (placed < p.treeCount && attempts < p.treeCount * 30) {
    attempts++;
    const x = rng.range(-p.width * 0.48, p.width * 0.48);
    const z = rng.range(-p.depth * 0.31, p.depth * 0.48);
    if (Math.hypot(x / (p.lakeRadiusX + 3), (z - 4) / (p.lakeRadiusZ + 3)) < 1) continue;
    if (occupied.some((item) => Math.hypot(x - item.x, z - item.z) < item.radius + 1.8)) continue;
    const palm = placed % 7 === 0 || rng.next() < 0.15;
    const height = palm ? rng.range(5.5, 10.5) : rng.range(3.8, 8.2);
    const trunkRadius = palm ? height * 0.045 : height * 0.07;
    bag.add("tree_trunks", "公园树干", UNIT_TRUNK, TRUNK, {
      type: "bark",
      params: { color: TRUNK, scale: 7, seed: p.seed + 5 },
    }, [x, height * 0.5, z], [trunkRadius, height, trunkRadius], [
      rng.range(-0.035, 0.035),
      rng.range(-Math.PI, Math.PI),
      rng.range(-0.035, 0.035),
    ]);
    if (palm) addPalmCrown(bag, p, rng, x, z, height);
    else addBroadleafCrown(bag, p, rng, x, z, height);
    placed++;
  }
}

function addBroadleafCrown(bag: SceneBag, p: GardenMetropolisParams, rng: Rng, x: number, z: number, height: number): void {
  const colors: RGB[] = [[0.14, 0.38, 0.11], [0.22, 0.48, 0.14], [0.34, 0.56, 0.18]];
  const colorIndex = rng.int(0, colors.length - 1);
  const color = colors[colorIndex]!;
  const radius = height * rng.range(0.28, 0.42);
  const surface: PartSurfaceRef = { type: "stylizedFoliage", params: { color, bands: 3, seed: p.seed + 20 + colorIndex } };
  bag.add(`tree_canopies_${colorIndex + 1}`, `公园阔叶树冠${colorIndex + 1}`, UNIT_CROWN, color, surface,
    [x, height, z], [radius, radius * rng.range(0.78, 1.12), radius], [0, rng.range(-Math.PI, Math.PI), 0]);
  if (rng.next() < 0.7) {
    const angle = rng.range(0, Math.PI * 2);
    bag.add(`tree_canopies_${colorIndex + 1}`, `公园阔叶树冠${colorIndex + 1}`, UNIT_CROWN, color, surface,
      [x + Math.cos(angle) * radius * 0.55, height + radius * 0.18, z + Math.sin(angle) * radius * 0.55],
      [radius * 0.62, radius * 0.58, radius * 0.66], [0, rng.range(-Math.PI, Math.PI), 0]);
  }
}

function addPalmCrown(bag: SceneBag, p: GardenMetropolisParams, rng: Rng, x: number, z: number, height: number): void {
  const color: RGB = [0.18, 0.44, 0.16];
  const leafCount = rng.int(5, 7);
  for (let leaf = 0; leaf < leafCount; leaf++) {
    const angle = (leaf / leafCount) * Math.PI * 2 + rng.range(-0.12, 0.12);
    bag.add("palm_fronds", "棕榈树冠", UNIT_LEAF, color, {
      type: "foliage",
      params: { color, roughness: 0.74, seed: p.seed + 33 },
    }, [x + Math.cos(angle) * height * 0.11, height + rng.range(-0.15, 0.24), z + Math.sin(angle) * height * 0.11],
    [height * 0.28, height * 0.035, height * 0.085], [rng.range(-0.18, 0.18), -angle, rng.range(-0.22, 0.22)]);
  }
}

function addLakeIslands(bag: SceneBag, p: GardenMetropolisParams, rng: Rng): void {
  const islands: ReadonlyArray<[number, number, number]> = [
    [-p.lakeRadiusX * 0.42, -p.lakeRadiusZ * 0.18, 2.4],
    [p.lakeRadiusX * 0.3, p.lakeRadiusZ * 0.24, 1.8],
    [p.lakeRadiusX * 0.12, -p.lakeRadiusZ * 0.46, 1.35],
  ];
  for (const [x, localZ, radius] of islands) {
    bag.add("lake_islands", "湖心绿岛", UNIT_DISC, [0.19, 0.4, 0.15], {
      type: "stylizedFoliage",
      params: { color: [0.19, 0.4, 0.15], bands: 3, seed: p.seed + 41 },
    }, [x, 0.2, 4 + localZ], [radius * rng.range(0.9, 1.25), 0.18, radius * rng.range(0.65, 1.05)],
    [0, rng.range(-Math.PI, Math.PI), 0]);
    bag.add("island_shrubs", "湖心岛灌木", UNIT_CROWN, [0.25, 0.5, 0.16], {
      type: "stylizedFoliage",
      params: { color: [0.25, 0.5, 0.16], bands: 3, seed: p.seed + 42 },
    }, [x, 1.2, 4 + localZ], [radius * 0.62, radius * 0.48, radius * 0.58],
    [0, rng.range(-Math.PI, Math.PI), 0]);
  }
}

function localPoint(x: number, z: number, yaw: number, localX: number, localZ: number): { x: number; z: number } {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return { x: x + localX * cosine + localZ * sine, z: z - localX * sine + localZ * cosine };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
