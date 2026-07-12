import { vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  buildDualGridLayer,
  cone,
  countDualGridCases,
  createDualGrid,
  cylinder,
  dualGridValue,
  icosphere,
  makeMesh,
  merge,
  recomputeNormals,
  transform,
  type DualGrid,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];
export type FarmTerrain = "grass" | "dirt" | "paving";

export interface DualGridFarmParams {
  cells: number;
  tileSize: number;
  edgeResolution: number;
  grassHeight: number;
  cropDensity: number;
  treeCount: number;
  seed: number;
}

export interface DualGridFarmSummary {
  readonly dualCells: number;
  readonly grassTransitions: number;
  readonly pavingTransitions: number;
  readonly crops: number;
  readonly trees: number;
}

export interface DualGridFarm {
  readonly parts: NamedPart[];
  readonly grid: DualGrid<FarmTerrain>;
  readonly summary: DualGridFarmSummary;
}

export const DUAL_GRID_FARM_DEFAULTS: DualGridFarmParams = {
  cells: 18,
  tileSize: 1,
  edgeResolution: 6,
  grassHeight: 0.2,
  cropDensity: 0.8,
  treeCount: 7,
  seed: 2024,
};

const DIRT: RGB = [0.48, 0.31, 0.17];
const GRASS: RGB = [0.46, 0.7, 0.29];
const GRASS_EDGE: RGB = [0.32, 0.54, 0.2];
const PAVING: RGB = [0.62, 0.6, 0.54];
const WALL: RGB = [0.91, 0.78, 0.57];
const ROOF: RGB = [0.58, 0.22, 0.13];
const WHITE: RGB = [0.92, 0.9, 0.8];
const WOOD: RGB = [0.34, 0.2, 0.1];
const LEAF: RGB = [0.28, 0.58, 0.2];
const CROP: RGB = [0.38, 0.66, 0.18];

export function buildDualGridFarm(params: Partial<DualGridFarmParams> = {}): DualGridFarm {
  const p = normalizeParams({ ...DUAL_GRID_FARM_DEFAULTS, ...params });
  const grid = buildTerrainGrid(p);
  const size = p.cells * p.tileSize;
  const grassTop = p.grassHeight;
  const pavingTop = p.grassHeight * 0.52;
  const parts: NamedPart[] = [];

  parts.push(part(
    "soil_base",
    "泥土地基",
    transform(box(size, 0.16, size), { translate: vec3(0, -0.08, 0) }),
    DIRT,
    { type: "concrete", params: { color: DIRT, roughness: 0.98 } },
  ));
  parts.push(part(
    "grass_dual_grid",
    "双网格草地",
    transform(buildDualGridLayer(grid, "grass", {
      tileSize: p.tileSize,
      topY: grassTop,
      skirtBottomY: 0,
      subdivisions: p.edgeResolution,
      smoothCorners: true,
    }), { scale: vec3(0.997, 1, 0.997) }),
    GRASS,
    { type: "stylizedFoliage", params: { color: GRASS, bands: 3, seed: p.seed } },
  ));
  parts.push(part(
    "grass_edge_shadow",
    "草地边缘阴影",
    transform(buildDualGridLayer(grid, "grass", {
      tileSize: p.tileSize,
      topY: grassTop * 0.48,
      skirtBottomY: 0,
      subdivisions: p.edgeResolution,
      threshold: 0.42,
      smoothCorners: true,
    }), { scale: vec3(1.002, 1, 1.002) }),
    GRASS_EDGE,
    { type: "stylizedFoliage", params: { color: GRASS_EDGE, bands: 2, seed: p.seed + 1 } },
  ));
  parts.push(part(
    "paving_dual_grid",
    "双网格石路",
    buildDualGridLayer(grid, "paving", {
      tileSize: p.tileSize,
      topY: pavingTop,
      skirtBottomY: 0,
      subdivisions: p.edgeResolution,
      smoothCorners: true,
    }),
    PAVING,
    { type: "concrete", params: { color: PAVING, roughness: 0.86 } },
  ));

  const houseZ = -size * 0.31;
  parts.push(...buildCottage(p, grassTop, houseZ));
  parts.push(part(
    "white_fence",
    "白色木围栏",
    buildFence(p, grassTop),
    WHITE,
    { type: "wood", params: { tone: WHITE, ringScale: 7, seed: p.seed + 2 } },
  ));

  const crops = buildCrops(p, grid);
  if (crops.meshes.length > 0) {
    parts.push(part(
      "farm_crops",
      "农田作物",
      merge(...crops.meshes),
      CROP,
      { type: "stylizedFoliage", params: { color: CROP, bands: 3, seed: p.seed + 3 } },
    ));
  }

  const trees = buildTrees(p, grassTop, houseZ);
  if (trees.trunks.length > 0) {
    parts.push(part(
      "tree_trunks",
      "果树树干",
      merge(...trees.trunks),
      WOOD,
      { type: "bark", params: { color: WOOD, scale: 8, seed: p.seed + 4 } },
    ));
    parts.push(part(
      "tree_canopies",
      "果树树冠",
      merge(...trees.canopies),
      LEAF,
      { type: "stylizedFoliage", params: { color: LEAF, bands: 3, seed: p.seed + 5 } },
    ));
  }

  const grassStats = countDualGridCases(grid, "grass");
  const pavingStats = countDualGridCases(grid, "paving");
  return {
    parts: parts.filter((candidate) => candidate.mesh.positions.length > 0),
    grid,
    summary: {
      dualCells: p.cells * p.cells,
      grassTransitions: grassStats.transitionCells,
      pavingTransitions: pavingStats.transitionCells,
      crops: crops.count,
      trees: trees.trunks.length,
    },
  };
}

export function buildDualGridFarmParts(params: Partial<DualGridFarmParams> = {}): NamedPart[] {
  return buildDualGridFarm(params).parts;
}

function buildTerrainGrid(p: DualGridFarmParams): DualGrid<FarmTerrain> {
  const sampleCount = p.cells + 1;
  const rows: FarmTerrain[][] = Array.from({ length: sampleCount }, () =>
    new Array<FarmTerrain>(sampleCount).fill("grass"));
  const center = Math.floor(p.cells / 2);
  const paint = (x0: number, z0: number, x1: number, z1: number, value: FarmTerrain): void => {
    for (let z = clampInt(z0, 0, p.cells); z <= clampInt(z1, 0, p.cells); z++) {
      for (let x = clampInt(x0, 0, p.cells); x <= clampInt(x1, 0, p.cells); x++) rows[z]![x] = value;
    }
  };

  paint(2, Math.floor(p.cells * 0.42), center - 2, p.cells - 3, "dirt");
  paint(center + 2, Math.floor(p.cells * 0.48), p.cells - 2, p.cells - 4, "dirt");
  if ((p.seed & 1) === 1) paint(2, Math.floor(p.cells * 0.25), center - 3, Math.floor(p.cells * 0.36), "dirt");
  paint(center, 3, center, p.cells, "paving");
  paint(center - 2, 3, center + 2, 4, "paving");
  paint(center - 3, Math.floor(p.cells * 0.62), center + 3, Math.floor(p.cells * 0.62), "paving");
  return createDualGrid(rows, { originX: -p.cells / 2, originZ: -p.cells / 2 });
}

function buildCottage(p: DualGridFarmParams, baseY: number, z: number): NamedPart[] {
  const scale = p.tileSize;
  const width = 4.4 * scale;
  const depth = 3.2 * scale;
  const wallHeight = 2.35 * scale;
  const roofHeight = 1.25 * scale;
  const walls = transform(box(width, wallHeight, depth), {
    translate: vec3(0, baseY + wallHeight / 2, z),
  });
  const roof = transform(gablePrism(width + 0.55 * scale, depth + 0.5 * scale, roofHeight), {
    translate: vec3(0, baseY + wallHeight, z),
  });
  const door = transform(box(0.82 * scale, 1.55 * scale, 0.12 * scale), {
    translate: vec3(0, baseY + 0.78 * scale, z + depth / 2 + 0.07 * scale),
  });
  const windows = merge(...[-1, 1].map((side) => transform(box(0.72 * scale, 0.66 * scale, 0.1 * scale), {
    translate: vec3(side * width * 0.28, baseY + wallHeight * 0.58, z + depth / 2 + 0.08 * scale),
  })));
  const chimney = transform(box(0.42 * scale, 1.25 * scale, 0.42 * scale), {
    translate: vec3(width * 0.28, baseY + wallHeight + roofHeight * 0.72, z - depth * 0.12),
  });
  return [
    part("cottage_walls", "农舍墙体", walls, WALL, { type: "stylizedPlaster", params: { color: WALL, bands: 4, seed: p.seed + 6 } }),
    part("cottage_roof", "农舍屋顶", merge(roof, chimney), ROOF, { type: "stylizedRoof", params: { color: ROOF, rows: 10, seed: p.seed + 7 } }),
    part("cottage_door", "农舍木门", door, WOOD, { type: "wood", params: { tone: WOOD, ringScale: 10, seed: p.seed + 8 } }),
    part("cottage_windows", "农舍窗户", windows, [0.48, 0.72, 0.8], { type: "glass", params: { tint: [0.48, 0.72, 0.8], roughness: 0.18 } }),
  ];
}

function buildFence(p: DualGridFarmParams, baseY: number): Mesh {
  const size = p.cells * p.tileSize;
  const half = size / 2 - p.tileSize * 0.45;
  const rail = 0.1 * p.tileSize;
  const post = 0.16 * p.tileSize;
  const postHeight = 1.15 * p.tileSize;
  const gateHalf = 1.15 * p.tileSize;
  const meshes: Mesh[] = [];
  const spacing = 1.35 * p.tileSize;

  for (let x = -half; x <= half + 1e-6; x += spacing) {
    meshes.push(transform(box(post, postHeight, post), { translate: vec3(x, baseY + postHeight / 2, -half) }));
    if (Math.abs(x) > gateHalf) meshes.push(transform(box(post, postHeight, post), { translate: vec3(x, baseY + postHeight / 2, half) }));
  }
  for (let z = -half; z <= half + 1e-6; z += spacing) {
    meshes.push(transform(box(post, postHeight, post), { translate: vec3(-half, baseY + postHeight / 2, z) }));
    meshes.push(transform(box(post, postHeight, post), { translate: vec3(half, baseY + postHeight / 2, z) }));
  }
  for (const y of [0.42, 0.86]) {
    meshes.push(transform(box(size - p.tileSize * 0.9, rail, rail), { translate: vec3(0, baseY + y * p.tileSize, -half) }));
    meshes.push(transform(box(half - gateHalf, rail, rail), { translate: vec3(-(half + gateHalf) / 2, baseY + y * p.tileSize, half) }));
    meshes.push(transform(box(half - gateHalf, rail, rail), { translate: vec3((half + gateHalf) / 2, baseY + y * p.tileSize, half) }));
    meshes.push(transform(box(rail, rail, size - p.tileSize * 0.9), { translate: vec3(-half, baseY + y * p.tileSize, 0) }));
    meshes.push(transform(box(rail, rail, size - p.tileSize * 0.9), { translate: vec3(half, baseY + y * p.tileSize, 0) }));
  }
  return merge(...meshes);
}

function buildCrops(p: DualGridFarmParams, grid: DualGrid<FarmTerrain>): { meshes: Mesh[]; count: number } {
  const rng = makeRng(p.seed + 31);
  const meshes: Mesh[] = [];
  const spacing = Math.max(0.55, 1.15 - p.cropDensity * 0.45) * p.tileSize;
  const minX = grid.originX * p.tileSize + p.tileSize * 1.6;
  const maxX = (grid.originX + p.cells) * p.tileSize - p.tileSize * 1.6;
  const minZ = grid.originZ * p.tileSize + p.tileSize * 5.8;
  const maxZ = (grid.originZ + p.cells) * p.tileSize - p.tileSize * 1.8;
  let count = 0;
  for (let z = minZ; z <= maxZ; z += spacing) {
    for (let x = minX; x <= maxX; x += spacing) {
      const sampleX = clampInt(Math.round(x / p.tileSize - grid.originX), 0, grid.width - 1);
      const sampleZ = clampInt(Math.round(z / p.tileSize - grid.originZ), 0, grid.depth - 1);
      if (dualGridValue(grid, sampleX, sampleZ) !== "dirt" || rng.next() > p.cropDensity) continue;
      const height = rng.range(0.28, 0.5) * p.tileSize;
      const positionX = x + rng.range(-0.08, 0.08) * p.tileSize;
      const positionZ = z + rng.range(-0.08, 0.08) * p.tileSize;
      meshes.push(merge(
        transform(cylinder(0.045 * p.tileSize, height, 6), { translate: vec3(positionX, height / 2 + 0.02, positionZ) }),
        transform(cone(0.16 * p.tileSize, 0.3 * p.tileSize, 7), { translate: vec3(positionX, height + 0.09 * p.tileSize, positionZ) }),
      ));
      count++;
    }
  }
  return { meshes, count };
}

function buildTrees(
  p: DualGridFarmParams,
  baseY: number,
  houseZ: number,
): { trunks: Mesh[]; canopies: Mesh[] } {
  const rng = makeRng(p.seed + 71);
  const half = p.cells * p.tileSize * 0.5;
  const trunks: Mesh[] = [];
  const canopies: Mesh[] = [];
  const candidates = [
    [-0.36, -0.23], [0.34, -0.2], [-0.39, 0.1], [0.39, 0.06],
    [-0.41, 0.34], [0.4, 0.32], [-0.2, -0.37], [0.2, -0.38],
    [-0.31, 0.39], [0.3, 0.4],
  ];
  const treeCount = clampInt(p.treeCount, 0, candidates.length);
  for (let i = 0; i < treeCount; i++) {
    const candidate = candidates[i]!;
    const x = candidate[0]! * half * 2 + rng.range(-0.25, 0.25) * p.tileSize;
    let z = candidate[1]! * half * 2 + rng.range(-0.25, 0.25) * p.tileSize;
    if (Math.abs(x) < 2.8 * p.tileSize && Math.abs(z - houseZ) < 2.4 * p.tileSize) z += 3 * p.tileSize;
    const trunkHeight = rng.range(1.25, 1.75) * p.tileSize;
    const radius = rng.range(0.75, 1.08) * p.tileSize;
    trunks.push(transform(cylinder(radius * 0.16, trunkHeight, 9), {
      translate: vec3(x, baseY + trunkHeight / 2, z),
    }));
    canopies.push(merge(
      transform(icosphere(radius, 2), { translate: vec3(x, baseY + trunkHeight + radius * 0.48, z) }),
      transform(icosphere(radius * 0.68, 1), { translate: vec3(x + radius * 0.38, baseY + trunkHeight + radius * 0.76, z - radius * 0.14) }),
    ));
  }
  return { trunks, canopies };
}

function gablePrism(width: number, depth: number, height: number): Mesh {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const positions = [
    vec3(-halfWidth, 0, -halfDepth), vec3(halfWidth, 0, -halfDepth), vec3(0, height, -halfDepth),
    vec3(-halfWidth, 0, halfDepth), vec3(halfWidth, 0, halfDepth), vec3(0, height, halfDepth),
  ];
  const normals = positions.map(() => vec3(0, 1, 0));
  const uvs = [vec2(0, 0), vec2(1, 0), vec2(0.5, 1), vec2(0, 0), vec2(1, 0), vec2(0.5, 1)];
  const indices = [
    0, 3, 5, 0, 5, 2,
    1, 2, 5, 1, 5, 4,
    0, 2, 1, 3, 4, 5,
    0, 1, 4, 0, 4, 3,
  ];
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surface: PartSurfaceRef,
): NamedPart {
  return { name, label, mesh, color, surface };
}

function normalizeParams(p: DualGridFarmParams): DualGridFarmParams {
  return {
    cells: clampInt(p.cells, 10, 32),
    tileSize: clamp(p.tileSize, 0.5, 2.5),
    edgeResolution: clampInt(p.edgeResolution, 1, 12),
    grassHeight: clamp(p.grassHeight, 0.04, 0.6),
    cropDensity: clamp(p.cropDensity, 0, 1),
    treeCount: clampInt(p.treeCount, 0, 10),
    seed: Math.round(p.seed),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
