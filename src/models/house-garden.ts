/**
 * House-garden variants — small procedural house lots in a soft low-poly style.
 *
 * The reference video shows the useful pattern, not a one-off asset: compact
 * houses on square garden trays, with path variants, border planting, shrubs,
 * flower beds and rounded trees. This generator keeps that as a parameterized
 * recipe so the viewer can show several similar lots from one seed.
 */
import { vec2 } from "../math/vec2.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  cone,
  cylinder,
  sphere,
  icosphere,
  merge,
  transform,
  translateMesh,
  computeNormals,
  makeMesh,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export interface HouseGardenParams {
  /** Number of house/garden lots shown as a board. Keep 1 for library assets. */
  variants: number;
  /** Visual recipe index, 0..8. */
  variantIndex: number;
  /** Square lot side length. */
  lotSize: number;
  /** House footprint/height multiplier. */
  houseScale: number;
  /** Shrub, fence and planter density, 0..1. */
  gardenDensity: number;
  /** Tree count multiplier, 0..1. */
  treeDensity: number;
  /** Flower and color accent density, 0..1. */
  flowerDensity: number;
  /** Master random seed. */
  seed: number;
}

export const HOUSE_GARDEN_DEFAULTS: HouseGardenParams = {
  variants: 1,
  variantIndex: 0,
  lotSize: 5.4,
  houseScale: 1,
  gardenDensity: 0.75,
  treeDensity: 0.7,
  flowerDensity: 0.85,
  seed: 37,
};

export interface HouseGardenVariantPreset {
  id: string;
  name: string;
  params: Partial<HouseGardenParams>;
}

export const HOUSE_GARDEN_VARIANTS: HouseGardenVariantPreset[] = [
  {
    id: "house-garden-01",
    name: "房子花园 01 前庭小屋",
    params: { variantIndex: 0, lotSize: 5.2, houseScale: 0.94, gardenDensity: 0.78, treeDensity: 0.6, flowerDensity: 0.82, seed: 37 },
  },
  {
    id: "house-garden-02",
    name: "房子花园 02 折线路径",
    params: { variantIndex: 1, lotSize: 5.5, houseScale: 0.98, gardenDensity: 0.86, treeDensity: 0.76, flowerDensity: 0.72, seed: 79 },
  },
  {
    id: "house-garden-03",
    name: "房子花园 03 双层小屋",
    params: { variantIndex: 2, lotSize: 5.7, houseScale: 1.08, gardenDensity: 0.68, treeDensity: 0.66, flowerDensity: 0.78, seed: 131 },
  },
  {
    id: "house-garden-04",
    name: "房子花园 04 环形花径",
    params: { variantIndex: 3, lotSize: 5.8, houseScale: 1, gardenDensity: 0.9, treeDensity: 0.72, flowerDensity: 0.96, seed: 173 },
  },
  {
    id: "house-garden-05",
    name: "房子花园 05 花坛院落",
    params: { variantIndex: 4, lotSize: 5.3, houseScale: 0.88, gardenDensity: 0.94, treeDensity: 0.54, flowerDensity: 1, seed: 211 },
  },
  {
    id: "house-garden-06",
    name: "房子花园 06 树荫院落",
    params: { variantIndex: 5, lotSize: 5.9, houseScale: 1.02, gardenDensity: 0.76, treeDensity: 0.98, flowerDensity: 0.64, seed: 257 },
  },
  {
    id: "house-garden-07",
    name: "房子花园 07 栅栏宅地",
    params: { variantIndex: 6, lotSize: 5.6, houseScale: 0.96, gardenDensity: 1, treeDensity: 0.82, flowerDensity: 0.88, seed: 313 },
  },
  {
    id: "house-garden-08",
    name: "房子花园 08 紧凑花园",
    params: { variantIndex: 7, lotSize: 4.8, houseScale: 0.86, gardenDensity: 0.84, treeDensity: 0.52, flowerDensity: 0.92, seed: 367 },
  },
  {
    id: "house-garden-09",
    name: "房子花园 09 宽院小屋",
    params: { variantIndex: 8, lotSize: 6.2, houseScale: 1.12, gardenDensity: 0.72, treeDensity: 0.86, flowerDensity: 0.76, seed: 421 },
  },
];

interface GroupDef {
  label: string;
  color: RGB;
  surface?: PartSurfaceRef;
}

interface Group extends GroupDef {
  meshes: Mesh[];
}

type Groups = Map<string, Group>;

interface HousePlacement {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  roofTop: number;
  doorX: number;
  doorZ: number;
}

const LOT_COLOR: RGB = [0.48, 0.66, 0.32];
const PATH_COLOR: RGB = [0.76, 0.72, 0.65];
const STONE_COLOR: RGB = [0.55, 0.52, 0.46];
const FOUNDATION_COLOR: RGB = [0.68, 0.66, 0.6];
const FENCE_COLOR: RGB = [0.82, 0.74, 0.62];
const DOOR_COLOR: RGB = [0.35, 0.22, 0.13];
const FRAME_COLOR: RGB = [0.92, 0.88, 0.78];
const GLASS_COLOR: RGB = [0.55, 0.72, 0.8];
const TRUNK_COLOR: RGB = [0.32, 0.22, 0.13];
const BED_COLOR: RGB = [0.45, 0.34, 0.22];

const WALL_COLORS: RGB[] = [
  [0.9, 0.83, 0.72],
  [0.76, 0.84, 0.78],
  [0.78, 0.83, 0.9],
  [0.9, 0.76, 0.72],
  [0.86, 0.8, 0.9],
  [0.86, 0.86, 0.76],
];

const ROOF_COLORS: RGB[] = [
  [0.44, 0.35, 0.32],
  [0.58, 0.27, 0.2],
  [0.26, 0.42, 0.39],
  [0.34, 0.42, 0.52],
  [0.52, 0.36, 0.22],
];

const FOLIAGE_COLORS: RGB[] = [
  [0.24, 0.48, 0.2],
  [0.32, 0.55, 0.22],
  [0.44, 0.62, 0.25],
  [0.22, 0.38, 0.18],
];

const FLOWER_COLORS: Array<{ name: string; label: string; color: RGB }> = [
  { name: "flowers_pink", label: "粉色花丛", color: [0.9, 0.48, 0.62] },
  { name: "flowers_yellow", label: "黄色花丛", color: [0.95, 0.78, 0.26] },
  { name: "flowers_blue", label: "蓝色花丛", color: [0.42, 0.58, 0.9] },
  { name: "flowers_white", label: "白色花丛", color: [0.94, 0.9, 0.82] },
];

const GROUPS = {
  lot_tiles: {
    label: "草坪地块",
    color: LOT_COLOR,
    surface: { type: "stylizedFoliage", params: { color: LOT_COLOR, seed: 173, bands: 3 } },
  },
  paths: {
    label: "花园步道",
    color: PATH_COLOR,
    surface: { type: "concrete", params: { color: PATH_COLOR, roughness: 0.86 } },
  },
  stones: {
    label: "踏步石块",
    color: STONE_COLOR,
    surface: { type: "stone", params: { color: STONE_COLOR, roughness: 0.9 } },
  },
  house_foundations: {
    label: "房屋基座",
    color: FOUNDATION_COLOR,
    surface: { type: "concrete", params: { color: FOUNDATION_COLOR, roughness: 0.85 } },
  },
  house_walls: {
    label: "房屋墙体",
    color: WALL_COLORS[0]!,
    surface: { type: "stylizedPlaster", params: { color: WALL_COLORS[0]!, bands: 4, seed: 8 } },
  },
  house_roofs: {
    label: "房屋屋顶",
    color: ROOF_COLORS[0]!,
    surface: { type: "stylizedRoof", params: { color: ROOF_COLORS[0]!, rows: 10, seed: 6 } },
  },
  window_frames: {
    label: "窗框",
    color: FRAME_COLOR,
    surface: { type: "wood", params: { tone: FRAME_COLOR, ringScale: 9, seed: 9 } },
  },
  windows: {
    label: "玻璃窗",
    color: GLASS_COLOR,
    surface: { type: "glass", params: { tint: GLASS_COLOR, roughness: 0.18 } },
  },
  doors: {
    label: "木门",
    color: DOOR_COLOR,
    surface: { type: "wood", params: { tone: DOOR_COLOR, ringScale: 12, seed: 10 } },
  },
  fences: {
    label: "木围栏",
    color: FENCE_COLOR,
    surface: { type: "wood", params: { tone: FENCE_COLOR, ringScale: 8, seed: 11 } },
  },
  tree_trunks: {
    label: "树干",
    color: TRUNK_COLOR,
    surface: { type: "bark", params: { color: TRUNK_COLOR, scale: 8, seed: 163 } },
  },
  tree_canopies: {
    label: "圆树冠",
    color: FOLIAGE_COLORS[0]!,
    surface: { type: "stylizedFoliage", params: { color: FOLIAGE_COLORS[0]!, bands: 3, seed: 21 } },
  },
  shrubs: {
    label: "灌木丛",
    color: FOLIAGE_COLORS[1]!,
    surface: { type: "stylizedFoliage", params: { color: FOLIAGE_COLORS[1]!, bands: 3, seed: 22 } },
  },
  flower_beds: {
    label: "花坛边界",
    color: BED_COLOR,
    surface: { type: "wood", params: { tone: BED_COLOR, ringScale: 10, seed: 12 } },
  },
} satisfies Record<string, GroupDef>;

export function buildHouseGardenParts(params: Partial<HouseGardenParams> = {}): NamedPart[] {
  const p = normalizeParams({ ...HOUSE_GARDEN_DEFAULTS, ...params });
  const groups: Groups = new Map();

  const cols = Math.ceil(Math.sqrt(p.variants));
  const rows = Math.ceil(p.variants / cols);
  const spacing = p.lotSize * 1.28;
  const firstVariant = p.variantIndex;

  for (let i = 0; i < p.variants; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const origin = vec3(
      (col - (cols - 1) * 0.5) * spacing,
      0,
      (row - (rows - 1) * 0.5) * spacing,
    );
    const variantIndex = (firstVariant + i) % HOUSE_GARDEN_VARIANTS.length;
    const lotSeed = (Math.round(p.seed) + Math.imul(variantIndex + 1, 0x9e3779b9)) >>> 0;
    buildLot(groups, origin, variantIndex, makeRng(lotSeed), p);
  }

  return materialize(groups);
}

function normalizeParams(p: HouseGardenParams): HouseGardenParams {
  return {
    variants: clampInt(p.variants, 1, 9),
    variantIndex: clampInt(p.variantIndex, 0, HOUSE_GARDEN_VARIANTS.length - 1),
    lotSize: clamp(p.lotSize, 3.5, 9),
    houseScale: clamp(p.houseScale, 0.6, 1.45),
    gardenDensity: clamp(p.gardenDensity, 0, 1),
    treeDensity: clamp(p.treeDensity, 0, 1),
    flowerDensity: clamp(p.flowerDensity, 0, 1),
    seed: Math.round(p.seed),
  };
}

function buildLot(groups: Groups, origin: Vec3, index: number, rng: Rng, p: HouseGardenParams): void {
  const half = p.lotSize * 0.5;
  const kind = index % 4;

  add(groups, "lot_tiles", translateMesh(box(p.lotSize, 0.08, p.lotSize), vec3(origin.x, -0.04, origin.z)));

  const house = buildHouse(groups, origin, rng, p, kind);
  buildPaths(groups, origin, rng, p.lotSize, house, kind);

  const fenceChance = 0.3 + p.gardenDensity * 0.55;
  if (rng.next() < fenceChance) {
    buildFence(groups, origin, p.lotSize, house, rng);
  }

  buildTrees(groups, origin, rng, p, house, kind);
  buildShrubs(groups, origin, rng, p, house, kind);
  buildFlowerBeds(groups, origin, rng, p, house, kind);
  buildStones(groups, origin, rng, p.lotSize, house, kind);

  if (kind === 3 && p.gardenDensity > 0.2) {
    const bedW = p.lotSize * 0.34;
    const bedD = p.lotSize * 0.08;
    add(groups, "flower_beds", lotBox(origin, -half * 0.28, 0.035, -half * 0.28, bedW, 0.06, bedD));
    addFlowerRow(groups, origin, rng, -half * 0.28, -half * 0.28, bedW * 0.72, 0.12, Math.round(6 + p.flowerDensity * 10));
  }
}

function buildHouse(groups: Groups, origin: Vec3, rng: Rng, p: HouseGardenParams, kind: number): HousePlacement {
  const lot = p.lotSize;
  const half = lot * 0.5;
  const scale = p.houseScale;
  const w = clamp(lot * scale * rng.range(0.29, 0.38), lot * 0.22, lot * 0.44);
  const d = clamp(lot * scale * rng.range(0.25, 0.34), lot * 0.2, lot * 0.4);
  const bodyH = lot * scale * (kind === 2 ? rng.range(0.23, 0.28) : rng.range(0.18, 0.23));
  const houseX = rng.range(-half * 0.16, half * 0.16);
  const houseZ = rng.range(-half * 0.08, half * 0.12);
  const baseH = Math.max(0.08, lot * 0.022);
  const hasUpper = kind === 2 || (kind !== 1 && rng.next() < 0.28);
  const wallColor = WALL_COLORS[rng.int(0, WALL_COLORS.length - 1)]!;
  const roofColor = ROOF_COLORS[rng.int(0, ROOF_COLORS.length - 1)]!;

  const foundation = lotBox(origin, houseX, baseH * 0.5, houseZ, w + 0.22, baseH, d + 0.22);
  add(groups, "house_foundations", foundation);

  addColored(groups, "house_walls", {
    label: GROUPS.house_walls.label,
    color: wallColor,
    surface: { type: "stylizedPlaster", params: { color: wallColor, bands: 4, seed: 8 + rng.int(0, 50) } },
  }, lotBox(origin, houseX, baseH + bodyH * 0.5, houseZ, w, bodyH, d));

  let topY = baseH + bodyH;
  if (hasUpper) {
    const uw = w * rng.range(0.64, 0.82);
    const ud = d * rng.range(0.66, 0.86);
    const uh = bodyH * rng.range(0.62, 0.78);
    const ux = houseX + rng.range(-w * 0.08, w * 0.08);
    const uz = houseZ + rng.range(-d * 0.06, d * 0.05);
    addColored(groups, "house_walls", {
      label: GROUPS.house_walls.label,
      color: wallColor,
      surface: { type: "stylizedPlaster", params: { color: wallColor, bands: 4, seed: 8 + rng.int(0, 50) } },
    }, lotBox(origin, ux, topY + uh * 0.5, uz, uw, uh, ud));
    topY += uh;
  }

  const roofH = clamp(lot * scale * rng.range(0.12, 0.18), 0.45, 1.1);
  const roofStyle = kind === 1 || rng.next() < 0.28 ? "hip" : "gable";
  const roof = roofStyle === "hip"
    ? localHipRoof(origin, houseX, topY, houseZ, w + 0.38, d + 0.38, roofH)
    : localGableRoof(origin, houseX, topY, houseZ, w + 0.42, d + 0.38, roofH);
  addColored(groups, "house_roofs", {
    label: GROUPS.house_roofs.label,
    color: roofColor,
    surface: { type: "stylizedRoof", params: { color: roofColor, rows: 8 + rng.int(0, 5), seed: 6 + rng.int(0, 50) } },
  }, roof);

  if (rng.next() < 0.78) {
    const chimneyX = houseX + rng.range(-w * 0.22, w * 0.22);
    const chimneyZ = houseZ - d * rng.range(0.02, 0.18);
    add(groups, "house_roofs", lotBox(origin, chimneyX, topY + roofH * 0.72, chimneyZ, 0.16, roofH * 0.65, 0.16));
  }

  const doorW = clamp(w * 0.23, 0.28, 0.46);
  const doorH = clamp(bodyH * 0.55, 0.52, 0.86);
  const doorZ = houseZ + d * 0.5 + 0.035;
  const doorY = baseH + doorH * 0.5;
  add(groups, "doors", lotBox(origin, houseX, doorY, doorZ, doorW, doorH, 0.07));

  const stepW = doorW * 1.55;
  add(groups, "stones", lotBox(origin, houseX, 0.04, doorZ + 0.18, stepW, 0.07, 0.3));

  const winCount = w > lot * 0.33 ? 2 : 1;
  const winY = baseH + bodyH * 0.62;
  for (let i = 0; i < winCount; i++) {
    const t = winCount === 1 ? 0 : (i === 0 ? -1 : 1);
    const wx = houseX + t * w * 0.26;
    addWindow(groups, origin, wx, winY, houseZ + d * 0.5 + 0.044, w * 0.16, bodyH * 0.24, 0);
  }
  if (d > lot * 0.24) {
    addWindow(groups, origin, houseX - w * 0.5 - 0.044, winY, houseZ - d * 0.04, w * 0.14, bodyH * 0.22, Math.PI / 2);
    addWindow(groups, origin, houseX + w * 0.5 + 0.044, winY, houseZ + d * 0.05, w * 0.14, bodyH * 0.22, -Math.PI / 2);
  }
  if (hasUpper) {
    addWindow(groups, origin, houseX, topY - bodyH * 0.22, houseZ + d * 0.5 + 0.046, w * 0.13, bodyH * 0.2, 0);
  }

  return {
    x: houseX,
    z: houseZ,
    width: w,
    depth: d,
    height: topY,
    roofTop: topY + roofH,
    doorX: houseX,
    doorZ,
  };
}

function buildPaths(groups: Groups, origin: Vec3, rng: Rng, lotSize: number, house: HousePlacement, kind: number): void {
  const half = lotSize * 0.5;
  const pathW = lotSize * 0.055;
  const startZ = half - pathW * 0.7;
  const endZ = house.doorZ + pathW * 0.7;

  if (kind === 1) {
    const gateX = house.doorX > 0 ? -half * 0.22 : half * 0.22;
    const midZ = (startZ + endZ) * 0.5 + rng.range(-0.15, 0.15);
    add(groups, "paths", stripZ(origin, gateX, (startZ + midZ) * 0.5, pathW, Math.abs(startZ - midZ)));
    add(groups, "paths", stripX(origin, (gateX + house.doorX) * 0.5, midZ, Math.abs(gateX - house.doorX), pathW));
    add(groups, "paths", stripZ(origin, house.doorX, (midZ + endZ) * 0.5, pathW, Math.abs(midZ - endZ)));
    return;
  }

  if (kind === 2) {
    add(groups, "paths", stripZ(origin, house.doorX, (startZ + endZ) * 0.5, pathW, Math.abs(startZ - endZ)));
    const sideLen = lotSize * 0.35;
    const branchZ = endZ + lotSize * 0.18;
    add(groups, "paths", stripX(origin, house.doorX, branchZ, sideLen, pathW));
    return;
  }

  add(groups, "paths", stripZ(origin, house.doorX, (startZ + endZ) * 0.5, pathW, Math.abs(startZ - endZ)));

  if (kind === 3) {
    const loopW = house.width + lotSize * 0.45;
    const loopD = house.depth + lotSize * 0.36;
    const z0 = house.z + lotSize * 0.05;
    add(groups, "paths", stripX(origin, house.x, z0 - loopD * 0.5, loopW, pathW));
    add(groups, "paths", stripX(origin, house.x, z0 + loopD * 0.5, loopW, pathW));
    add(groups, "paths", stripZ(origin, house.x - loopW * 0.5, z0, pathW, loopD));
    add(groups, "paths", stripZ(origin, house.x + loopW * 0.5, z0, pathW, loopD));
  }
}

function buildFence(groups: Groups, origin: Vec3, lotSize: number, house: HousePlacement, rng: Rng): void {
  const half = lotSize * 0.5;
  const postStep = lotSize * 0.15;
  const postH = lotSize * 0.13;
  const postW = lotSize * 0.022;
  const railH = lotSize * 0.018;
  const railY = postH * 0.58;
  const open = Math.max(0.75, lotSize * 0.22);
  const railDepth = postW * 0.75;

  for (const z of [-half + 0.12, half - 0.12]) {
    if (z > 0) {
      const leftLen = half - open * 0.5 - 0.16;
      const rightLen = leftLen;
      add(groups, "fences", lotBox(origin, -half * 0.5 - open * 0.25, railY, z, leftLen, railH, railDepth));
      add(groups, "fences", lotBox(origin, half * 0.5 + open * 0.25, railY, z, rightLen, railH, railDepth));
    } else {
      add(groups, "fences", lotBox(origin, 0, railY, z, lotSize - 0.24, railH, railDepth));
    }
    for (let x = -half + 0.18; x <= half - 0.18; x += postStep) {
      if (z > 0 && Math.abs(x - house.doorX) < open * 0.55) continue;
      add(groups, "fences", lotBox(origin, x, postH * 0.5, z, postW, postH, postW));
    }
  }

  for (const x of [-half + 0.12, half - 0.12]) {
    add(groups, "fences", lotBox(origin, x, railY, 0, railDepth, railH, lotSize - 0.24));
    for (let z = -half + 0.18; z <= half - 0.18; z += postStep) {
      if (rng.next() < 0.08) continue;
      add(groups, "fences", lotBox(origin, x, postH * 0.5, z, postW, postH, postW));
    }
  }
}

function buildTrees(groups: Groups, origin: Vec3, rng: Rng, p: HouseGardenParams, house: HousePlacement, kind: number): void {
  const half = p.lotSize * 0.5;
  const baseCount = kind === 0 ? 2 : kind === 1 ? 3 : 2;
  const count = Math.max(0, Math.round(baseCount + p.treeDensity * 3 - 1));
  const candidates = shuffled([
    vec2(-half * 0.72, -half * 0.66),
    vec2(half * 0.72, -half * 0.62),
    vec2(-half * 0.72, half * 0.18),
    vec2(half * 0.72, half * 0.16),
    vec2(-half * 0.3, -half * 0.72),
    vec2(half * 0.35, half * 0.66),
  ], rng);

  let placed = 0;
  for (const c of candidates) {
    if (placed >= count) break;
    const x = c.x + rng.range(-0.18, 0.18);
    const z = c.y + rng.range(-0.18, 0.18);
    if (insideHousePad(x, z, house, 0.4)) continue;
    addTree(groups, origin, rng, x, z, p.lotSize);
    placed++;
  }
}

function buildShrubs(groups: Groups, origin: Vec3, rng: Rng, p: HouseGardenParams, house: HousePlacement, kind: number): void {
  const half = p.lotSize * 0.5;
  const count = Math.round(3 + p.gardenDensity * 8);
  const lineZ = kind === 1 ? -half * 0.26 : half * 0.18;
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const along = -half * 0.58 + (i / Math.max(1, count - 1)) * half * 1.16;
    const x = side * (house.width * 0.55 + p.lotSize * rng.range(0.08, 0.2));
    const z = i % 3 === 0 ? along : lineZ + rng.range(-0.25, 0.25);
    if (insideHousePad(x, z, house, 0.22)) continue;
    const r = p.lotSize * rng.range(0.045, 0.075);
    const color = FOLIAGE_COLORS[rng.int(0, FOLIAGE_COLORS.length - 1)]!;
    const m = transform(sphere(r, 10, 8), {
      scale: vec3(rng.range(1.1, 1.6), rng.range(0.7, 1.05), rng.range(1.0, 1.45)),
      translate: vec3(origin.x + x, r * 0.7, origin.z + z),
    });
    addColored(groups, "shrubs", {
      label: GROUPS.shrubs.label,
      color,
      surface: { type: "stylizedFoliage", params: { color, bands: 3, seed: 22 + i } },
    }, m);
  }
}

function buildFlowerBeds(groups: Groups, origin: Vec3, rng: Rng, p: HouseGardenParams, house: HousePlacement, kind: number): void {
  if (p.flowerDensity <= 0) return;
  const half = p.lotSize * 0.5;
  const bedW = p.lotSize * 0.08;
  const bedLen = p.lotSize * rng.range(0.32, 0.5);
  const z = house.doorZ + p.lotSize * 0.18;
  const sideOffset = Math.max(house.width * 0.42, p.lotSize * 0.3);
  for (const sx of [-1, 1] as const) {
    const x = house.doorX + sx * sideOffset;
    if (Math.abs(x) > half - bedLen * 0.5) continue;
    add(groups, "flower_beds", lotBox(origin, x, 0.035, z, bedLen, 0.06, bedW));
    addFlowerRow(groups, origin, rng, x, z, bedLen * 0.72, bedW * 0.65, Math.round(4 + p.flowerDensity * 8));
  }

  if (kind !== 1) {
    const edgeZ = -half * 0.62;
    add(groups, "flower_beds", lotBox(origin, 0, 0.035, edgeZ, p.lotSize * 0.48, 0.06, bedW));
    addFlowerRow(groups, origin, rng, 0, edgeZ, p.lotSize * 0.4, bedW * 0.7, Math.round(5 + p.flowerDensity * 9));
  }
}

function buildStones(groups: Groups, origin: Vec3, rng: Rng, lotSize: number, house: HousePlacement, kind: number): void {
  const count = kind === 1 ? 5 : 3;
  const startZ = lotSize * 0.5 - lotSize * 0.18;
  const endZ = house.doorZ + lotSize * 0.18;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const z = startZ + (endZ - startZ) * t + rng.range(-0.04, 0.04);
    const x = house.doorX + rng.range(-0.08, 0.08);
    const r = lotSize * rng.range(0.035, 0.055);
    const m = transform(icosphere(r, 0), {
      scale: vec3(1.4, 0.26, 1.0),
      rotate: vec3(0, rng.range(0, Math.PI), 0),
      translate: vec3(origin.x + x, 0.045, origin.z + z),
    });
    add(groups, "stones", m);
  }
}

function addTree(groups: Groups, origin: Vec3, rng: Rng, x: number, z: number, lotSize: number): void {
  const trunkH = lotSize * rng.range(0.17, 0.27);
  const trunkR = lotSize * rng.range(0.014, 0.022);
  add(groups, "tree_trunks", translateMesh(cylinder(trunkR, trunkH, 7, true), vec3(origin.x + x, trunkH * 0.5, origin.z + z)));

  const crownR = lotSize * rng.range(0.11, 0.17);
  const crownY = trunkH + crownR * 0.8;
  const blobs: Mesh[] = [
    transform(sphere(crownR, 12, 8), { translate: vec3(origin.x + x, crownY, origin.z + z) }),
    transform(sphere(crownR * 0.72, 10, 7), { translate: vec3(origin.x + x - crownR * 0.45, crownY + crownR * 0.16, origin.z + z + crownR * 0.25) }),
    transform(sphere(crownR * 0.66, 10, 7), { translate: vec3(origin.x + x + crownR * 0.42, crownY + crownR * 0.1, origin.z + z - crownR * 0.18) }),
  ];
  const color = FOLIAGE_COLORS[rng.int(0, FOLIAGE_COLORS.length - 1)]!;
  addColored(groups, "tree_canopies", {
    label: GROUPS.tree_canopies.label,
    color,
    surface: { type: "stylizedFoliage", params: { color, bands: 3, seed: 21 + rng.int(0, 80) } },
  }, merge(...blobs));
}

function addWindow(groups: Groups, origin: Vec3, x: number, y: number, z: number, w: number, h: number, yaw: number): void {
  const frameT = Math.max(0.025, w * 0.12);
  const depth = 0.055;
  const frame = merge(
    box(w + frameT, frameT, depth),
    translateMesh(box(w + frameT, frameT, depth), vec3(0, h, 0)),
    translateMesh(box(frameT, h + frameT, depth), vec3(-w * 0.5, h * 0.5, 0)),
    translateMesh(box(frameT, h + frameT, depth), vec3(w * 0.5, h * 0.5, 0)),
  );
  const centeredFrame = translateMesh(frame, vec3(0, -h * 0.5, 0));
  const centeredGlass = box(w * 0.78, h * 0.78, depth * 0.45);
  add(groups, "window_frames", transform(centeredFrame, { rotate: vec3(0, yaw, 0), translate: vec3(origin.x + x, y, origin.z + z) }));
  add(groups, "windows", transform(centeredGlass, {
    rotate: vec3(0, yaw, 0),
    translate: vec3(origin.x + x + Math.sin(yaw) * 0.018, y, origin.z + z + Math.cos(yaw) * 0.018),
  }));
}

function addFlowerRow(groups: Groups, origin: Vec3, rng: Rng, cx: number, cz: number, length: number, spread: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x = cx - length * 0.5 + length * t + rng.range(-0.035, 0.035);
    const z = cz + rng.range(-spread, spread);
    const spec = FLOWER_COLORS[(i + rng.int(0, FLOWER_COLORS.length - 1)) % FLOWER_COLORS.length]!;
    const stemH = 0.11 + rng.next() * 0.06;
    const flower = merge(
      translateMesh(cylinder(0.008, stemH, 5, true), vec3(origin.x + x, 0.006 + stemH * 0.5, origin.z + z)),
      translateMesh(sphere(0.045, 8, 6), vec3(origin.x + x, 0.006 + stemH + 0.035, origin.z + z)),
    );
    addColored(groups, spec.name, {
      label: spec.label,
      color: spec.color,
      surface: { type: "plastic", params: { color: spec.color, roughness: 0.65 } },
    }, flower);
  }
}

function lotBox(origin: Vec3, x: number, y: number, z: number, w: number, h: number, d: number): Mesh {
  return translateMesh(box(w, h, d), vec3(origin.x + x, y, origin.z + z));
}

function stripX(origin: Vec3, x: number, z: number, len: number, width: number): Mesh {
  return lotBox(origin, x, 0.024, z, Math.max(width, len), 0.045, width);
}

function stripZ(origin: Vec3, x: number, z: number, width: number, len: number): Mesh {
  return lotBox(origin, x, 0.024, z, width, 0.045, Math.max(width, len));
}

function localGableRoof(origin: Vec3, x: number, baseY: number, z: number, w: number, d: number, h: number): Mesh {
  return translateMesh(gableRoofMesh(w, d, baseY, h), vec3(origin.x + x, 0, origin.z + z));
}

function localHipRoof(origin: Vec3, x: number, baseY: number, z: number, w: number, d: number, h: number): Mesh {
  const r = Math.hypot(w, d) * 0.5;
  return transform(cone(r * 0.72, h, 4, true), {
    rotate: vec3(0, Math.PI / 4, 0),
    scale: vec3(w / (r * 1.02), 1, d / (r * 1.02)),
    translate: vec3(origin.x + x, baseY + h * 0.5, origin.z + z),
  });
}

function gableRoofMesh(w: number, d: number, baseY: number, h: number): Mesh {
  const hx = w * 0.5;
  const hz = d * 0.5;
  const positions = [
    vec3(-hx, baseY, -hz),
    vec3(hx, baseY, -hz),
    vec3(-hx, baseY + h, 0),
    vec3(hx, baseY + h, 0),
    vec3(-hx, baseY, hz),
    vec3(hx, baseY, hz),
  ];
  const uvs = [
    vec2(0, 0), vec2(1, 0), vec2(0, 1), vec2(1, 1), vec2(0, 0), vec2(1, 0),
  ];
  const indices = [
    0, 3, 1, 0, 2, 3,
    2, 5, 3, 2, 4, 5,
    0, 4, 2, 1, 3, 5,
    0, 1, 5, 0, 5, 4,
  ];
  return computeNormals(makeMesh({
    positions,
    normals: positions.map(() => vec3(0, 1, 0)),
    uvs,
    indices,
  }), 35);
}

function insideHousePad(x: number, z: number, house: HousePlacement, pad: number): boolean {
  return Math.abs(x - house.x) < house.width * 0.5 + pad && Math.abs(z - house.z) < house.depth * 0.5 + pad;
}

function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function add(groups: Groups, name: string, mesh: Mesh): void {
  const def = (GROUPS as Record<string, GroupDef | undefined>)[name] ?? { label: name, color: [0.8, 0.8, 0.8] as RGB };
  addColored(groups, name, def, mesh);
}

function addColored(groups: Groups, name: string, def: GroupDef, mesh: Mesh): void {
  const key = materialGroupKey(groups, name, def);
  let g = groups.get(key);
  if (!g) {
    g = { label: def.label, color: def.color, meshes: [] };
    if (def.surface) g.surface = def.surface;
    groups.set(key, g);
  }
  g.meshes.push(mesh);
}

function materialGroupKey(groups: Groups, name: string, def: GroupDef): string {
  const first = groups.get(name);
  if (!first || sameColor(first.color, def.color)) return name;
  return `${name}_${colorKey(def.color)}`;
}

function sameColor(a: RGB, b: RGB): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
}

function colorKey(color: RGB): string {
  return color.map((c) => Math.round(clamp(c, 0, 1) * 255).toString(16).padStart(2, "0")).join("");
}

function materialize(groups: Groups): NamedPart[] {
  const parts: NamedPart[] = [];
  for (const [name, group] of groups) {
    if (group.meshes.length === 0) continue;
    const part: NamedPart = {
      name,
      label: group.label,
      mesh: group.meshes.length === 1 ? group.meshes[0]! : merge(...group.meshes),
      color: group.color,
    };
    if (group.surface) part.surface = group.surface;
    parts.push(part);
  }
  return parts;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
}

function clampInt(v: number, min: number, max: number): number {
  return Math.round(clamp(v, min, max));
}
