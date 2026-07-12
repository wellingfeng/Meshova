/**
 * PCG learning suite: one scene that exercises the four practical flows from
 * UE/Houdini-style PCG, rebuilt on Meshova primitives:
 *
 * - point flow: terrain samples -> density/slope/prune -> vegetation points
 * - spline flow: road and trench centerlines -> swept ribbons/curbs
 * - instance flow: trees, sandbags, buildings copied from inspectable points
 * - environment flow: heightfield masks -> snow cover + biome-colored terrain
 */
import { field2DStats, sampleField2DBilinear, type Field2D } from "../field/index.js";
import {
  box,
  copyToPoints,
  curveLength,
  merge,
  pointAttribute,
  pointCount,
  polyline,
  pruneMasked,
  recomputeNormals,
  roadCurbs,
  roadEdgeLines,
  roadLaneLines,
  roadRibbon,
  ruleClipToCurveBand,
  ruleDensityNoise,
  ruleDensityPrune,
  ruleNormalToDensity,
  ruleScale,
  ruleScaleJitter,
  ruleSelfPruning,
  ruleSlopeFilter,
  ruleVariantByHeight,
  ruleYawJitter,
  scatterAlongCurve,
  smoothCurve,
  storePointAttribute,
  surfacePointCloud,
  transform,
  translateMesh,
  triangleCount,
  vertexCount,
  type Curve,
  type Mesh,
  type NamedPart,
  type PointCloud,
} from "../geometry/index.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/index.js";
import { buildTerrainField } from "../terrain/index.js";
import { conifer, shrub, tree } from "../vegetation/index.js";
import { buildInteriorRoom } from "./interior.js";
import { buildUrbanBuildingParts, type UrbanStyle } from "./urban-building.js";

type RGB = [number, number, number];

export type PcgFlowKind = "point" | "spline" | "instance" | "environment";

export interface PcgFlowSummary {
  readonly kind: PcgFlowKind;
  readonly name: string;
  readonly input: number;
  readonly output: number;
  readonly operators: readonly string[];
}

export interface PcgSuiteParams {
  /** Terrain width/depth. */
  size: number;
  /** Heightfield cells per side. */
  terrainResolution: number;
  /** Master terrain relief height. */
  terrainHeight: number;
  /** Raw forest candidate points before pruning. */
  forestCandidates: number;
  /** Minimum tree spacing after self-prune. */
  forestSpacing: number;
  /** Number of snow patch attempts. */
  snowPatches: number;
  /** Normalized elevation threshold for snow overlay. */
  snowLine: number;
  /** Number of urban-building archetypes placed near the road. */
  buildingCount: number;
  /** Include furnished cutaway room. */
  includeInterior: boolean;
  /** Include zig-zag military trench + sandbags. */
  includeTrench: boolean;
  /** Deterministic master seed. */
  seed: number;
}

export interface PcgSuite {
  readonly parts: NamedPart[];
  readonly flows: PcgFlowSummary[];
}

export interface PcgSuiteSummary {
  readonly partCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly flowOutputs: Record<PcgFlowKind, number>;
}

export const PCG_SUITE_DEFAULTS: PcgSuiteParams = {
  size: 72,
  terrainResolution: 72,
  terrainHeight: 3.6,
  forestCandidates: 320,
  forestSpacing: 4.2,
  snowPatches: 70,
  snowLine: 0.52,
  buildingCount: 6,
  includeInterior: true,
  includeTrench: true,
  seed: 50,
};

const ASPHALT: RGB = [0.08, 0.08, 0.09];
const CONCRETE: RGB = [0.58, 0.58, 0.55];
const ROAD_PAINT: RGB = [0.9, 0.88, 0.78];
const CURB: RGB = [0.66, 0.65, 0.6];
const SNOW: RGB = [0.88, 0.9, 0.86];
const BARK: RGB = [0.28, 0.18, 0.1];
const LEAF: RGB = [0.16, 0.36, 0.15];
const PINE: RGB = [0.1, 0.27, 0.16];
const SOIL: RGB = [0.27, 0.2, 0.13];
const SANDBAG: RGB = [0.58, 0.5, 0.34];
const WOOD: RGB = [0.36, 0.22, 0.12];

export function buildPcgSuite(params: Partial<PcgSuiteParams> = {}): PcgSuite {
  const p: PcgSuiteParams = { ...PCG_SUITE_DEFAULTS, ...params };
  const seed = Math.round(p.seed) >>> 0;
  const size = Math.max(12, p.size);
  const terrain = buildTerrainField({
    size,
    resolution: Math.max(16, Math.min(160, Math.round(p.terrainResolution))),
    seed,
    height: Math.max(0.5, p.terrainHeight),
    noiseScale: 1.05,
    ridgeStrength: 0.5,
    ridgeScale: 2.6,
    islandFalloff: 0.45,
    terraceStrength: 0.04,
    iterations: 10,
    waterLevel: -10,
  });
  const ground = makeGroundSampler(terrain.height, size);
  const parts: NamedPart[] = [
    {
      name: "terrain",
      label: "环境地形",
      mesh: terrain.mesh,
      colors: terrain.colors.slice(),
      surface: { type: "mossyStone", params: { seed } },
    },
  ];

  const roadCurve = makeRoadCurve(ground, size);
  parts.push(...buildRoadParts(roadCurve));

  const snow = buildSnowCover(terrain.height, terrain.masks.slope, ground, {
    size,
    attempts: Math.round(p.snowPatches),
    snowLine: p.snowLine,
    seed: seed + 41,
  });
  if (snow.count > 0) parts.push(snow.part);

  const forest = buildForestParts(terrain.mesh, roadCurve, {
    seed: seed + 100,
    candidates: Math.round(p.forestCandidates),
    spacing: p.forestSpacing,
    ...(p.includeTrench ? { trench: makeTrenchCurve(ground, size) } : {}),
  });
  parts.push(...forest.parts);

  const buildingParts = buildRoadsideBuildings(ground, {
    seed: seed + 200,
    count: Math.round(p.buildingCount),
    size,
  });
  parts.push(...buildingParts.parts);

  let trenchPoints = 0;
  if (p.includeTrench) {
    const trench = buildTrenchParts(makeTrenchCurve(ground, size), seed + 300);
    trenchPoints = trench.sandbagPoints;
    parts.push(...trench.parts);
  }

  if (p.includeInterior) {
    parts.push(...buildCutawayInterior(ground, size, seed + 400));
  }

  const flows: PcgFlowSummary[] = [
    {
      kind: "environment",
      name: "环境流：高度场/坡度/积雪",
      input: terrain.height.data.length,
      output: snow.count,
      operators: ["buildTerrainField", "deriveTerrainMasks", "snowLine", "slopeFilter"],
    },
    {
      kind: "spline",
      name: "样条流：道路/人行道/战壕",
      input: roadCurve.points.length + (p.includeTrench ? makeTrenchCurve(ground, size).points.length : 0),
      output: Math.round(curveLength(roadCurve) + (p.includeTrench ? curveLength(makeTrenchCurve(ground, size)) : 0)),
      operators: ["polyline", "smoothCurve", "roadRibbon", "roadCurbs", "laneLines"],
    },
    {
      kind: "point",
      name: "点流：地表候选/密度/坡度/自剪枝",
      input: forest.candidates,
      output: forest.keptTrees + forest.keptShrubs,
      operators: ["surfacePointCloud", "DensityNoise", "NormalToDensity", "SelfPruning"],
    },
    {
      kind: "instance",
      name: "实例流：树木/建筑/沙袋/室内模块",
      input: forest.keptTrees + forest.keptShrubs + buildingParts.placed + trenchPoints,
      output: parts.length,
      operators: ["copyToPoints", "variantByHeight", "transformParts", "mergeByPart"],
    },
  ];

  return { parts, flows };
}

export function buildPcgSuiteParts(params: Partial<PcgSuiteParams> = {}): NamedPart[] {
  return buildPcgSuite(params).parts;
}

export function summarizePcgSuite(suite: PcgSuite): PcgSuiteSummary {
  const flowOutputs: Record<PcgFlowKind, number> = {
    point: 0,
    spline: 0,
    instance: 0,
    environment: 0,
  };
  for (const flow of suite.flows) flowOutputs[flow.kind] += flow.output;
  return {
    partCount: suite.parts.length,
    vertexCount: suite.parts.reduce((sum, p) => sum + vertexCount(p.mesh), 0),
    triangleCount: suite.parts.reduce((sum, p) => sum + triangleCount(p.mesh), 0),
    flowOutputs,
  };
}

interface GroundSampler {
  readonly size: number;
  heightAt(x: number, z: number): number;
  sample(field: Field2D, x: number, z: number): number;
}

function makeGroundSampler(height: Field2D, size: number): GroundSampler {
  const half = size * 0.5;
  const toGrid = (x: number, z: number): { gx: number; gy: number } => ({
    gx: clamp(((x + half) / size) * (height.width - 1), 0, height.width - 1),
    gy: clamp(((z + half) / size) * (height.height - 1), 0, height.height - 1),
  });
  return {
    size,
    heightAt(x, z) {
      const { gx, gy } = toGrid(x, z);
      return sampleField2DBilinear(height, gx, gy);
    },
    sample(field, x, z) {
      const { gx, gy } = toGrid(x, z);
      return sampleField2DBilinear(field, gx, gy);
    },
  };
}

function makeRoadCurve(ground: GroundSampler, size: number): Curve {
  const h = size * 0.5;
  const raw = [
    [-h * 0.88, -h * 0.72],
    [-h * 0.5, -h * 0.34],
    [-h * 0.18, -h * 0.18],
    [h * 0.18, h * 0.08],
    [h * 0.55, h * 0.35],
    [h * 0.9, h * 0.7],
  ].map(([x, z]) => vec3(x!, ground.heightAt(x!, z!) + 0.08, z!));
  return drapeCurve(ground, smoothCurve(polyline(raw), 6), 0.08);
}

function makeTrenchCurve(ground: GroundSampler, size: number): Curve {
  const h = size * 0.5;
  const raw = [
    [-h * 0.78, h * 0.18],
    [-h * 0.56, h * 0.38],
    [-h * 0.24, h * 0.3],
    [h * 0.05, h * 0.42],
    [h * 0.36, h * 0.22],
  ].map(([x, z]) => vec3(x!, ground.heightAt(x!, z!) + 0.04, z!));
  return drapeCurve(ground, smoothCurve(polyline(raw), 5), 0.04);
}

function drapeCurve(ground: GroundSampler, curve: Curve, lift: number): Curve {
  return {
    closed: curve.closed,
    points: curve.points.map((pt) => vec3(pt.x, ground.heightAt(pt.x, pt.z) + lift, pt.z)),
  };
}

function offsetCurve(curve: Curve, offset: number, lift = 0): Curve {
  const pts = curve.points;
  return {
    closed: curve.closed,
    points: pts.map((pt, i) => {
      const prev = pts[Math.max(0, i - 1)]!;
      const next = pts[Math.min(pts.length - 1, i + 1)]!;
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const right = vec3(-dz / len, 0, dx / len);
      return vec3(pt.x + right.x * offset, pt.y + lift, pt.z + right.z * offset);
    }),
  };
}

function buildRoadParts(curve: Curve): NamedPart[] {
  const halfWidth = 2.6;
  const base = {
    halfWidth,
    sampleDistance: 0.85,
    widthSubdivisions: 4,
    adaptiveCurvature: true,
    curvatureThresholdDeg: 7,
    verticalOffset: 0,
  };
  const sidewalkHalf = 0.75;
  const sidewalkOffset = halfWidth + sidewalkHalf + 0.18;
  return [
    surf("road_surface", "样条道路", roadRibbon(curve, base), ASPHALT, "concrete", { color: ASPHALT, roughness: 0.92 }),
    surf("road_curbs", "路缘石", roadCurbs(curve, { ...base, curbHeight: 0.16, curbWidth: 0.22 }), CURB, "concrete", { color: CURB }),
    surf("road_lane_lines", "车道线", roadLaneLines(curve, { ...base, verticalOffset: 0.03, lanes: 2, skipCenter: false, lineWidth: 0.12, dashLength: 2.4, gapLength: 3.2 }), ROAD_PAINT, "ceramic", { color: ROAD_PAINT }),
    surf("road_edge_lines", "道路边线", roadEdgeLines(curve, { ...base, verticalOffset: 0.03, lineWidth: 0.1, edgeInset: 0.22 }), ROAD_PAINT, "ceramic", { color: ROAD_PAINT }),
    surf("sidewalk_left", "左人行道", roadRibbon(offsetCurve(curve, -sidewalkOffset, 0.05), { ...base, halfWidth: sidewalkHalf, widthSubdivisions: 1 }), CONCRETE, "concrete", { color: CONCRETE, roughness: 0.86 }),
    surf("sidewalk_right", "右人行道", roadRibbon(offsetCurve(curve, sidewalkOffset, 0.05), { ...base, halfWidth: sidewalkHalf, widthSubdivisions: 1 }), CONCRETE, "concrete", { color: CONCRETE, roughness: 0.86 }),
  ];
}

interface SnowResult {
  part: NamedPart;
  count: number;
}

function buildSnowCover(
  height: Field2D,
  slope: Field2D,
  ground: GroundSampler,
  opts: { size: number; attempts: number; snowLine: number; seed: number },
): SnowResult {
  const stats = field2DStats(height);
  const span = stats.max - stats.min || 1;
  const rng = makeRng(opts.seed);
  const meshes: Mesh[] = [];
  const half = opts.size * 0.5;
  const attempts = Math.max(0, opts.attempts);
  for (let i = 0; i < attempts * 3 && meshes.length < attempts; i++) {
    const x = rng.range(-half * 0.9, half * 0.9);
    const z = rng.range(-half * 0.9, half * 0.9);
    const y = ground.heightAt(x, z);
    const elev = (y - stats.min) / span;
    const steep = ground.sample(slope, x, z);
    if (elev < opts.snowLine || steep > 0.7) continue;
    const w = rng.range(1.4, 3.2);
    const d = rng.range(1.0, 2.8);
    meshes.push(transform(box(w, 0.035, d), {
      rotate: vec3(0, rng.range(0, Math.PI), 0),
      translate: vec3(x, y + 0.06, z),
    }));
  }
  const mesh = meshes.length ? merge(...meshes) : merge();
  return {
    count: meshes.length,
    part: surf("snow_cover", "自定义积雪覆盖", mesh, SNOW, "snow", { color: SNOW, roughness: 0.78 }),
  };
}

interface ForestResult {
  parts: NamedPart[];
  candidates: number;
  keptTrees: number;
  keptShrubs: number;
}

function buildForestParts(
  groundMesh: Mesh,
  roadCurve: Curve,
  opts: { seed: number; candidates: number; spacing: number; trench?: Curve },
): ForestResult {
  const candidates = surfacePointCloud(groundMesh, {
    count: Math.max(0, opts.candidates),
    seed: opts.seed,
  });
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pt of candidates.points) {
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  const midY = minY + (maxY - minY || 1) * 0.56;

  const rules = [
    ruleClipToCurveBand(roadCurve, { width: 5.6, mode: "remove" }),
    ...(opts.trench ? [ruleClipToCurveBand(opts.trench, { width: 3.2, mode: "remove" })] : []),
    ruleDensityNoise({ frequency: 0.055, floor: 0.34, seed: opts.seed + 1 }),
    ruleNormalToDensity({
      startAngle: (16 * Math.PI) / 180,
      endAngle: (38 * Math.PI) / 180,
      multiply: true,
    }),
    ruleDensityPrune(opts.seed + 2),
    ruleSlopeFilter({ maxSlope: (42 * Math.PI) / 180 }),
    ruleSelfPruning({ radius: Math.max(0.8, opts.spacing) }),
    ruleVariantByHeight({ thresholds: [midY], variants: [0, 1] }),
    ruleScale(0.82),
    ruleScaleJitter(0.28, opts.seed + 3),
    ruleYawJitter(Math.PI, opts.seed + 4),
  ];
  const kept = pruneMasked()(applyPointRules(candidates, rules));

  const broadleaf = tree({
    seed: opts.seed + 10,
    height: 3.7,
    trunkRadius: 0.16,
    branchCount: 4,
    depth: 2,
    leafDensity: 4,
    leafSize: 0.22,
  });
  const pine = conifer({
    seed: opts.seed + 11,
    height: 4.1,
    trunkRadius: 0.12,
    whorls: 5,
    perWhorl: 4,
    needleDensity: 3,
  });
  const placeOpts = {
    variant: pointAttribute("variant"),
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: false,
  } as const;

  const woodMesh = copyToPoints(kept, [broadleaf.wood, pine.wood], placeOpts);
  const leavesMesh = copyToPoints(kept, [broadleaf.leaves, pine.leaves], placeOpts);

  const shrubCloud = pruneMasked()(applyPointRules(candidates, [
    ruleClipToCurveBand(roadCurve, { width: 4.6, mode: "remove" }),
    ruleDensityNoise({ frequency: 0.11, floor: 0.52, seed: opts.seed + 30 }),
    ruleDensityPrune(opts.seed + 31),
    ruleSlopeFilter({ maxSlope: (36 * Math.PI) / 180 }),
    ruleSelfPruning({ radius: Math.max(1.2, opts.spacing * 0.7) }),
    ruleScale(0.72),
    ruleScaleJitter(0.25, opts.seed + 32),
    ruleYawJitter(Math.PI, opts.seed + 33),
  ]));
  const bush = shrub({
    seed: opts.seed + 34,
    height: 0.9,
    stems: 4,
    leafDensity: 5,
    leafSize: 0.11,
  });
  const shrubWood = copyToPoints(shrubCloud, bush.wood, {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: false,
  });
  const shrubLeaf = copyToPoints(shrubCloud, bush.leaves, {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: false,
  });

  return {
    candidates: pointCount(candidates),
    keptTrees: pointCount(kept),
    keptShrubs: pointCount(shrubCloud),
    parts: [
      surf("forest_trunks", "森林树干", merge(woodMesh, shrubWood), BARK, "bark", { color: BARK, roughness: 0.9 }),
      surf("forest_broadleaf", "阔叶/灌木叶片", shrubLeaf, LEAF, "leaf", { color: LEAF, roughness: 0.72 }),
      surf("forest_canopy", "森林树冠", leavesMesh, PINE, "leaf", { color: PINE, roughness: 0.78 }),
    ],
  };
}

function applyPointRules(pc: PointCloud, rules: ReadonlyArray<(pc: PointCloud) => PointCloud>): PointCloud {
  let cur = pc;
  for (const rule of rules) cur = rule(cur);
  return cur;
}

interface BuildingResult {
  parts: NamedPart[];
  placed: number;
}

function buildRoadsideBuildings(
  ground: GroundSampler,
  opts: { seed: number; count: number; size: number },
): BuildingResult {
  const specs: Array<{ style: UrbanStyle; x: number; z: number; yaw: number; floors: number; width: number; depth: number }> = [
    { style: "artDeco", x: -21, z: -3, yaw: -0.35, floors: 11, width: 4.3, depth: 3.5 },
    { style: "glassTower", x: -11, z: 7, yaw: 0.18, floors: 13, width: 4.0, depth: 3.6 },
    { style: "brickWalkup", x: -1, z: 11, yaw: 0.08, floors: 5, width: 4.8, depth: 3.2 },
    { style: "modernOffice", x: 10, z: -6, yaw: -0.22, floors: 9, width: 5.1, depth: 3.6 },
    { style: "brownstone", x: 20, z: 4, yaw: 0.28, floors: 4, width: 3.2, depth: 3.8 },
    { style: "corporate", x: 26, z: -10, yaw: -0.14, floors: 12, width: 4.2, depth: 4.0 },
  ];
  const parts: NamedPart[] = [];
  const count = Math.max(0, Math.min(specs.length, opts.count));
  const scale = opts.size / PCG_SUITE_DEFAULTS.size;
  for (let i = 0; i < count; i++) {
    const s = specs[i]!;
    const x = s.x * scale;
    const z = s.z * scale;
    const y = ground.heightAt(x, z) + 0.08;
    const building = buildUrbanBuildingParts({
      style: s.style,
      floors: s.floors,
      width: s.width,
      depth: s.depth,
      seed: opts.seed + i * 17,
    });
    parts.push(...placeParts(`building_${i}`, building, vec3(x, y, z), s.yaw));
  }
  return { parts, placed: count };
}

function buildCutawayInterior(ground: GroundSampler, size: number, seed: number): NamedPart[] {
  const x = size * 0.26;
  const z = -size * 0.28;
  const y = ground.heightAt(x, z) + 0.12;
  const room = buildInteriorRoom({
    width: 6.0,
    depth: 4.6,
    wallHeight: 2.8,
    chairs: 4,
    shelves: 4,
    clutter: 12,
    doorOpen: 0.5,
    drawerOpen: 0.35,
    seed,
  });
  return placeParts("interior", room.parts, vec3(x, y, z), -0.32);
}

interface TrenchResult {
  parts: NamedPart[];
  sandbagPoints: number;
}

function buildTrenchParts(curve: Curve, seed: number): TrenchResult {
  const base = {
    halfWidth: 0.9,
    sampleDistance: 0.65,
    widthSubdivisions: 2,
    adaptiveCurvature: true,
    curvatureThresholdDeg: 6,
  };
  const floor = roadRibbon(curve, { ...base, verticalOffset: -0.32 });
  const berms = roadCurbs(curve, {
    ...base,
    verticalOffset: -0.18,
    curbHeight: 0.52,
    curbWidth: 0.62,
  });
  let sandPoints = scatterAlongCurve(curve, {
    spacing: 1.25,
    offset: 1.28,
    bothSides: true,
    endPadding: 0.6,
  });
  sandPoints = applyPointRules(sandPoints, [
    ruleScale(1),
    ruleScaleJitter(0.16, seed + 1),
    ruleYawJitter(0.12, seed + 2),
  ]);
  sandPoints = storePointAttribute(sandPoints, "yaw", (ctx) => {
    const yaw = ctx.attributes.yaw?.[ctx.index] ?? 0;
    return yaw + Math.PI * 0.5;
  });
  const sandbagMesh = translateMesh(box(0.72, 0.22, 0.34), vec3(0, 0.13, 0));
  const sandbags = copyToPoints(sandPoints, sandbagMesh, {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: false,
  });
  const planks = trenchPlanks(curve, seed + 3);
  return {
    sandbagPoints: pointCount(sandPoints),
    parts: [
      surf("trench_floor", "战壕底面", floor, SOIL, "soil", { color: SOIL, roughness: 0.96 }),
      surf("trench_berms", "战壕土墙", berms, SOIL, "soil", { color: SOIL, roughness: 1 }),
      surf("trench_sandbags", "沙袋", sandbags, SANDBAG, "fabric", { color: SANDBAG, roughness: 0.9 }),
      surf("trench_planks", "木板支撑", planks, WOOD, "wood", { color: WOOD, roughness: 0.82 }),
    ],
  };
}

function trenchPlanks(curve: Curve, seed: number): Mesh {
  const rng = makeRng(seed);
  const pcs = scatterAlongCurve(curve, { spacing: 3.2, offset: 0, bothSides: false, endPadding: 0.8 });
  const meshes: Mesh[] = [];
  for (let i = 0; i < pcs.points.length; i++) {
    const p = pcs.points[i]!;
    const yaw = pcs.attributes.yaw?.[i] ?? 0;
    meshes.push(transform(box(1.6, 0.08, 0.22), {
      rotate: vec3(0, yaw + Math.PI * 0.5 + rng.range(-0.08, 0.08), 0),
      translate: vec3(p.x, p.y - 0.08, p.z),
    }));
  }
  return meshes.length ? merge(...meshes) : merge();
}

function placeParts(prefix: string, source: NamedPart[], offset: Vec3, yaw: number): NamedPart[] {
  return source.map((part) => ({
    ...part,
    name: `${prefix}_${part.name}`,
    label: part.label ?? semanticLabel(prefix, part.name),
    mesh: transform(part.mesh, { rotate: vec3(0, yaw, 0), translate: offset }),
  }));
}

function semanticLabel(prefix: string, name: string): string {
  if (prefix.startsWith("building")) return `程序化建筑-${name}`;
  if (prefix === "interior") return `复杂室内-${name}`;
  return `${prefix}-${name}`;
}

function surf(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): NamedPart {
  return {
    name,
    label,
    mesh: recomputeNormals(mesh),
    color,
    surface: { type, params: { color, ...params } },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
