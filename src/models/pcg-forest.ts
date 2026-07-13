import { field2DStats, sampleField2DBilinear, type Field2D } from "../field/index.js";
import {
  applyRules,
  cone,
  copyToPoints,
  cylinder,
  filterPoints,
  icosphere,
  merge,
  pointAttribute,
  pointCount,
  polyline,
  pruneMasked,
  roadRibbon,
  ruleClipToCurveBand,
  ruleDensityNoise,
  ruleDensityPrune,
  ruleNormalToDensity,
  ruleScale,
  ruleScaleJitter,
  ruleSelfPruning,
  ruleSlopeFilter,
  ruleYawJitter,
  scaleMesh,
  smoothCurve,
  storePointAttribute,
  surfacePointCloud,
  sweep,
  transform,
  translateMesh,
  type Curve,
  type Mesh,
  type NamedPart,
  type PointCloud,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import { buildTerrainField } from "../terrain/index.js";
import { foliageWindWeights } from "../vegetation/index.js";

type RGB = [number, number, number];

export interface PcgForestParams {
  size: number;
  resolution: number;
  relief: number;
  candidates: number;
  slopeMax: number;
  clumping: number;
  spacing: number;
  coniferLine: number;
  pathWidth: number;
  shrubs: number;
  rocks: number;
  deadwood: number;
  canopy: number;
  seed: number;
}

export interface PcgForestSummary {
  treeCount: number;
  shrubCount: number;
  rockCount: number;
  deadwoodCount: number;
  partCount: number;
  triangleCount: number;
}

export const PCG_FOREST_DEFAULTS: PcgForestParams = {
  size: 56,
  resolution: 72,
  relief: 5.5,
  candidates: 720,
  slopeMax: 40,
  clumping: 0.34,
  spacing: 3.1,
  coniferLine: 0.64,
  pathWidth: 2.4,
  shrubs: 0.7,
  rocks: 0.38,
  deadwood: 0.3,
  canopy: 1,
  seed: 11,
};

const BARK: RGB = [0.28, 0.16, 0.08];
const BARK_LIGHT: RGB = [0.38, 0.26, 0.15];
const LEAF_DARK: RGB = [0.08, 0.29, 0.11];
const LEAF_MID: RGB = [0.16, 0.4, 0.13];
const PINE_DARK: RGB = [0.05, 0.2, 0.12];
const PINE_LIGHT: RGB = [0.1, 0.31, 0.17];
const UNDERSTORY: RGB = [0.2, 0.42, 0.12];
const ROCK: RGB = [0.31, 0.34, 0.3];
const PATH: RGB = [0.28, 0.2, 0.12];

export function buildPcgForestParts(params: Partial<PcgForestParams> = {}): NamedPart[] {
  const p = resolveParams(params);
  const terrain = buildTerrainField({
    size: p.size,
    resolution: p.resolution,
    seed: p.seed,
    height: p.relief,
    noiseScale: 1.05,
    ridgeScale: 2.4,
    ridgeStrength: 0.28,
    islandFalloff: 0.22,
    terraceStrength: 0.03,
    iterations: 6,
    hydraulicStrength: 0.012,
    thermalStrength: 0.035,
    waterLevel: -1,
  });
  const ground = terrain.mesh;
  const path = buildForestPath(terrain.height, p.size);
  const slope = (p.slopeMax * Math.PI) / 180;
  const stats = field2DStats(terrain.height);
  const heightSpan = stats.max - stats.min || 1;

  let trees = pruneMasked()(
    applyRules(surfacePointCloud(ground, { count: p.candidates, seed: p.seed + 1 }), [
      ruleDensityNoise({
        frequency: 0.075,
        floor: 0.14 + p.clumping * 0.5,
        seed: p.seed + 2,
      }),
      ruleNormalToDensity({ startAngle: slope * 0.48, endAngle: slope, multiply: true }),
      ruleDensityPrune(p.seed + 3),
      ruleSlopeFilter({ maxSlope: slope }),
      ruleClipToCurveBand(path, { width: p.pathWidth * 0.78 + 0.7, mode: "remove" }),
      ruleSelfPruning({ radius: p.spacing }),
      ruleScale(0.92),
      ruleScaleJitter(0.3, p.seed + 4),
      ruleYawJitter(Math.PI, p.seed + 5),
    ]),
  );
  trees = storePointAttribute(trees, "variant", (ctx) => {
    const elevation = (ctx.point.y - stats.min) / heightSpan;
    const random = hash01(p.seed + 71, ctx.index);
    if (elevation >= p.coniferLine) return random < 0.7 ? 2 : 3;
    if (random < 0.44) return 0;
    if (random < 0.82) return 1;
    return 2;
  });

  const treeVariants = partitionVariants(trees, 4);
  const broadleafA = broadleafPrototype(5.1, 1, p.canopy);
  const broadleafB = broadleafPrototype(6.1, 1.12, p.canopy * 0.92);
  const coniferA = coniferPrototype(6.6, 1);
  const coniferB = coniferPrototype(8.1, 0.9);
  const treeLibrary = [broadleafA, broadleafB, coniferA, coniferB];
  const treeColors = [LEAF_MID, LEAF_DARK, PINE_LIGHT, PINE_DARK] as const;

  const placeOptions = {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: false,
  } as const;
  const parts: NamedPart[] = [
    {
      name: "forest_terrain",
      label: "森林地形",
      mesh: ground,
      colors: forestTerrainColors(terrain.height, terrain.masks.slope, terrain.masks.flow),
      surface: { type: "mossyStone", params: { seed: p.seed, scale: 3.2 } },
      metadata: {
        generator: "pcg-forest",
        treeCount: pointCount(trees),
        pathWidth: p.pathWidth,
      },
    },
    {
      name: "forest_path",
      label: "林间小径",
      mesh: roadRibbon(path, {
        halfWidth: p.pathWidth * 0.5,
        sampleDistance: 0.55,
        widthSubdivisions: 3,
        verticalOffset: 0.045,
        uvLengthScale: 2.4,
      }),
      color: PATH,
      surface: { type: "stone", params: { color: PATH, roughness: 0.98, scale: 2.6 } },
    },
  ];

  const woodMeshes: Mesh[] = [];
  for (let variant = 0; variant < treeVariants.length; variant++) {
    const cloud = treeVariants[variant]!;
    if (pointCount(cloud) === 0) continue;
    const prototype = treeLibrary[variant]!;
    woodMeshes.push(copyToPoints(cloud, prototype.wood, placeOptions));
    const foliage = copyToPoints(cloud, prototype.foliage, placeOptions);
    parts.push({
      name: `canopy_${variant + 1}`,
      label: variant < 2 ? `阔叶树冠 ${variant + 1}` : `针叶树冠 ${variant - 1}`,
      mesh: foliage,
      color: treeColors[variant]!,
      surface: {
        type: "foliage",
        params: { color: treeColors[variant]!, season: variant === 1 ? 0.12 : 0.04, translucency: 0.34 },
      },
      windWeight: foliageWindWeights(foliage, 0.45, 0.5),
    });
  }
  if (woodMeshes.length > 0) {
    parts.push({
      name: "tree_trunks",
      label: "乔木树干",
      mesh: merge(...woodMeshes),
      color: BARK,
      surface: { type: "wood", params: { color: BARK, roughness: 0.94, grainScale: 2.2 } },
    });
  }

  const shrubs = buildShrubCloud(ground, path, p, slope);
  if (pointCount(shrubs) > 0) {
    const shrubMesh = copyToPoints(shrubs, shrubPrototype(), placeOptions);
    parts.push({
      name: "understory_shrubs",
      label: "林下灌木",
      mesh: shrubMesh,
      color: UNDERSTORY,
      surface: { type: "foliage", params: { color: UNDERSTORY, translucency: 0.28 } },
      windWeight: foliageWindWeights(shrubMesh, 0.35, 0.45),
      metadata: { instanceCount: pointCount(shrubs) },
    });
  }

  const rocks = buildRockCloud(ground, path, p);
  if (pointCount(rocks) > 0) {
    parts.push({
      name: "mossy_rocks",
      label: "苔石",
      mesh: copyToPoints(rocks, [rockPrototype(0), rockPrototype(1)], {
        ...placeOptions,
        variant: pointAttribute("variant"),
      }),
      color: ROCK,
      surface: { type: "mossyStone", params: { color: ROCK, moss: 0.58, scale: 1.8 } },
      metadata: { instanceCount: pointCount(rocks) },
    });
  }

  const deadwood = buildDeadwoodCloud(ground, path, p);
  if (pointCount(deadwood) > 0) {
    parts.push({
      name: "fallen_logs",
      label: "倒木",
      mesh: copyToPoints(deadwood, fallenLogPrototype(), placeOptions),
      color: BARK_LIGHT,
      surface: { type: "wood", params: { color: BARK_LIGHT, roughness: 1 } },
      metadata: { instanceCount: pointCount(deadwood) },
    });
  }

  parts[0]!.metadata = {
    ...parts[0]!.metadata,
    shrubCount: pointCount(shrubs),
    rockCount: pointCount(rocks),
    deadwoodCount: pointCount(deadwood),
  };
  return parts;
}

export function summarizePcgForest(parts: readonly NamedPart[]): PcgForestSummary {
  const terrain = parts.find((part) => part.name === "forest_terrain");
  const metadata = terrain?.metadata ?? {};
  return {
    treeCount: numberMetadata(metadata.treeCount),
    shrubCount: numberMetadata(metadata.shrubCount),
    rockCount: numberMetadata(metadata.rockCount),
    deadwoodCount: numberMetadata(metadata.deadwoodCount),
    partCount: parts.length,
    triangleCount: parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0),
  };
}

function resolveParams(params: Partial<PcgForestParams>): PcgForestParams {
  const p = { ...PCG_FOREST_DEFAULTS, ...params };
  return {
    size: clamp(p.size, 20, 120),
    resolution: Math.round(clamp(p.resolution, 24, 160)),
    relief: clamp(p.relief, 0.5, 20),
    candidates: Math.round(clamp(p.candidates, 0, 2400)),
    slopeMax: clamp(p.slopeMax, 10, 75),
    clumping: clamp(p.clumping, 0, 0.9),
    spacing: clamp(p.spacing, 1.2, 8),
    coniferLine: clamp(p.coniferLine, 0.1, 0.95),
    pathWidth: clamp(p.pathWidth, 0.4, 8),
    shrubs: clamp(p.shrubs, 0, 1),
    rocks: clamp(p.rocks, 0, 1),
    deadwood: clamp(p.deadwood, 0, 1),
    canopy: clamp(p.canopy, 0.45, 1.5),
    seed: Math.round(p.seed) >>> 0,
  };
}

function buildForestPath(height: Field2D, size: number): Curve {
  const half = size * 0.5;
  const raw = smoothCurve(polyline([
    vec3(-half * 0.96, 0, -half * 0.46),
    vec3(-half * 0.58, 0, -half * 0.1),
    vec3(-half * 0.18, 0, half * 0.06),
    vec3(half * 0.18, 0, -half * 0.08),
    vec3(half * 0.56, 0, half * 0.18),
    vec3(half * 0.96, 0, half * 0.52),
  ]), 7);
  return {
    closed: false,
    points: raw.points.map((point) => vec3(point.x, sampleHeight(height, size, point.x, point.z), point.z)),
  };
}

function sampleHeight(height: Field2D, size: number, x: number, z: number): number {
  const half = size * 0.5;
  const gx = ((x + half) / size) * (height.width - 1);
  const gy = ((z + half) / size) * (height.height - 1);
  return sampleField2DBilinear(height, gx, gy);
}

function buildShrubCloud(ground: Mesh, path: Curve, p: PcgForestParams, slope: number): PointCloud {
  if (p.shrubs <= 0) return surfacePointCloud(ground, { count: 0 });
  return pruneMasked()(
    applyRules(surfacePointCloud(ground, {
      count: Math.round(p.candidates * p.shrubs * 1.35),
      seed: p.seed + 21,
    }), [
      ruleDensityNoise({ frequency: 0.14, floor: 0.42, seed: p.seed + 22 }),
      ruleDensityPrune(p.seed + 23),
      ruleSlopeFilter({ maxSlope: slope * 0.92 }),
      ruleClipToCurveBand(path, { width: p.pathWidth * 0.62, mode: "remove" }),
      ruleSelfPruning({ radius: Math.max(0.9, p.spacing * 0.43) }),
      ruleScale(0.72),
      ruleScaleJitter(0.34, p.seed + 24),
      ruleYawJitter(Math.PI, p.seed + 25),
    ]),
  );
}

function buildRockCloud(ground: Mesh, path: Curve, p: PcgForestParams): PointCloud {
  if (p.rocks <= 0) return surfacePointCloud(ground, { count: 0 });
  let rocks = pruneMasked()(
    applyRules(surfacePointCloud(ground, {
      count: Math.round(110 * p.rocks),
      seed: p.seed + 31,
    }), [
      ruleSlopeFilter({ maxSlope: (56 * Math.PI) / 180 }),
      ruleClipToCurveBand(path, { width: p.pathWidth * 0.45, mode: "remove" }),
      ruleSelfPruning({ radius: 3.6 }),
      ruleScale(0.75),
      ruleScaleJitter(0.42, p.seed + 32),
      ruleYawJitter(Math.PI, p.seed + 33),
    ]),
  );
  rocks = storePointAttribute(rocks, "variant", (ctx) => hash01(p.seed + 34, ctx.index) < 0.55 ? 0 : 1);
  return rocks;
}

function buildDeadwoodCloud(ground: Mesh, path: Curve, p: PcgForestParams): PointCloud {
  if (p.deadwood <= 0) return surfacePointCloud(ground, { count: 0 });
  return pruneMasked()(
    applyRules(surfacePointCloud(ground, {
      count: Math.round(26 * p.deadwood),
      seed: p.seed + 41,
    }), [
      ruleSlopeFilter({ maxSlope: (30 * Math.PI) / 180 }),
      ruleClipToCurveBand(path, { width: p.pathWidth * 0.7, mode: "remove" }),
      ruleSelfPruning({ radius: 6.5 }),
      ruleScale(0.9),
      ruleScaleJitter(0.28, p.seed + 42),
      ruleYawJitter(Math.PI, p.seed + 43),
    ]),
  );
}

function broadleafPrototype(height: number, width: number, canopyScale: number): { wood: Mesh; foliage: Mesh } {
  const trunkRadius = height * 0.043;
  const trunk = translateMesh(cylinder(trunkRadius, height * 0.78, 7, true), vec3(0, height * 0.39, 0));
  const branchY = height * 0.48;
  const branches = [
    branchMesh(vec3(0, branchY, 0), vec3(height * 0.23, height * 0.72, height * 0.08), trunkRadius * 0.48),
    branchMesh(vec3(0, branchY * 1.04, 0), vec3(-height * 0.2, height * 0.76, -height * 0.1), trunkRadius * 0.44),
    branchMesh(vec3(0, branchY * 1.12, 0), vec3(height * 0.04, height * 0.82, -height * 0.2), trunkRadius * 0.4),
  ];
  const baseRadius = height * 0.26 * width * canopyScale;
  const blob = (x: number, y: number, z: number, sx: number, sy: number, sz: number): Mesh =>
    translateMesh(scaleMesh(icosphere(baseRadius, 1), vec3(sx, sy, sz)), vec3(x, y, z));
  const foliage = merge(
    blob(0, height * 0.76, 0, 1.18, 0.92, 1.05),
    blob(-baseRadius * 0.72, height * 0.71, 0.08, 0.86, 0.78, 0.9),
    blob(baseRadius * 0.68, height * 0.73, -0.1, 0.9, 0.82, 0.86),
    blob(0.12, height * 0.91, 0.04, 0.82, 0.72, 0.78),
    blob(0.02, height * 0.68, baseRadius * 0.62, 0.82, 0.72, 0.8),
  );
  return { wood: merge(trunk, ...branches), foliage };
}

function coniferPrototype(height: number, width: number): { wood: Mesh; foliage: Mesh } {
  const trunkRadius = height * 0.028;
  const wood = translateMesh(cylinder(trunkRadius, height, 7, true), vec3(0, height * 0.5, 0));
  const foliage = merge(
    translateMesh(cone(height * 0.28 * width, height * 0.4, 9, true), vec3(0, height * 0.32, 0)),
    translateMesh(cone(height * 0.23 * width, height * 0.38, 9, true), vec3(0, height * 0.52, 0)),
    translateMesh(cone(height * 0.17 * width, height * 0.35, 9, true), vec3(0, height * 0.71, 0)),
    translateMesh(cone(height * 0.1 * width, height * 0.28, 8, true), vec3(0, height * 0.87, 0)),
  );
  return { wood, foliage };
}

function branchMesh(start: ReturnType<typeof vec3>, end: ReturnType<typeof vec3>, radius: number): Mesh {
  const middle = vec3(
    (start.x + end.x) * 0.5,
    (start.y + end.y) * 0.5 + Math.abs(end.x - start.x) * 0.08,
    (start.z + end.z) * 0.5,
  );
  return sweep(polyline([start, middle, end]), {
    sides: 5,
    radius,
    radiusAt: (t) => 1 - t * 0.72,
    caps: true,
  });
}

function shrubPrototype(): Mesh {
  const unit = icosphere(0.58, 1);
  return merge(
    translateMesh(scaleMesh(unit, vec3(1.15, 0.85, 1)), vec3(0, 0.55, 0)),
    translateMesh(scaleMesh(unit, vec3(0.82, 0.76, 0.82)), vec3(-0.48, 0.44, 0.12)),
    translateMesh(scaleMesh(unit, vec3(0.8, 0.72, 0.86)), vec3(0.46, 0.42, -0.08)),
    translateMesh(scaleMesh(unit, vec3(0.7, 0.68, 0.74)), vec3(0.05, 0.82, 0.16)),
  );
}

function rockPrototype(variant: number): Mesh {
  const rock = icosphere(0.9, 1);
  return transform(rock, {
    scale: variant === 0 ? vec3(1.1, 0.58, 0.84) : vec3(0.78, 0.95, 1.22),
    rotate: variant === 0 ? vec3(0.08, 0.2, -0.12) : vec3(-0.15, -0.3, 0.1),
    translate: vec3(0, variant === 0 ? 0.46 : 0.66, 0),
  });
}

function fallenLogPrototype(): Mesh {
  const trunk = transform(cylinder(0.2, 3.2, 7, true), {
    rotate: vec3(0, 0, Math.PI * 0.5),
    translate: vec3(0, 0.24, 0),
  });
  const brokenBranch = transform(cylinder(0.075, 0.9, 5, true), {
    rotate: vec3(0.15, 0, -0.85),
    translate: vec3(0.4, 0.48, 0),
  });
  return merge(trunk, brokenBranch);
}

function partitionVariants(cloud: PointCloud, count: number): PointCloud[] {
  return Array.from({ length: count }, (_, variant) =>
    filterPoints(cloud, (ctx) => Math.round(ctx.attributes.variant?.[ctx.index] ?? 0) === variant ? 1 : 0),
  );
}

function hash01(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

function forestTerrainColors(height: Field2D, slope: Field2D, flow: Field2D): number[] {
  const stats = field2DStats(height);
  const span = stats.max - stats.min || 1;
  const soil: RGB = [0.16, 0.13, 0.08];
  const moss: RGB = [0.19, 0.34, 0.12];
  const fernFloor: RGB = [0.12, 0.27, 0.1];
  const stone: RGB = [0.34, 0.34, 0.29];
  const colors: number[] = [];
  for (let i = 0; i < height.data.length; i++) {
    const elevation = (height.data[i]! - stats.min) / span;
    const steepness = slope.data[i] ?? 0;
    const moisture = flow.data[i] ?? 0;
    let color = mixRgb(soil, moss, smoothstepLocal(0.08, 0.34, elevation));
    color = mixRgb(color, fernFloor, moisture * 0.45);
    color = mixRgb(color, stone, smoothstepLocal(0.42, 0.86, steepness));
    colors.push(color[0], color[1], color[2]);
  }
  return colors;
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const value = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * value,
    a[1] + (b[1] - a[1]) * value,
    a[2] + (b[2] - a[2]) * value,
  ];
}

function smoothstepLocal(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function numberMetadata(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
