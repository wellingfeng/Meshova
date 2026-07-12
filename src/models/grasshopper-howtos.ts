/**
 * GrasshopperHowtos-inspired recipe models.
 *
 * Clean-room Meshova rewrites of useful Grasshopper recipe families:
 * field-driven rock tiles, Voronoi pipe networks, laser-cut waffle ribs and
 * reaction-diffusion relief. No .gh/.ghx import or node-graph dependency.
 */
import {
  field2DStats,
  generateField2D,
  grayScottField2D,
  normalizeField2D,
  field2DExtrudeSDF,
  rasterToField2D,
  sampleField2DUV,
  sdfEllipsoid,
  sdfSmoothUnion,
  sdfSphere,
  sdfToScalarGrid,
  type Field2D,
  type RasterFieldSource,
  type SDF3D,
} from "../field/index.js";
import { TAU, clamp, smoothstep } from "../math/scalar.js";
import { add, scale, type Vec3, vec3 } from "../math/vec3.js";
import { makeNoise, makeRng, fbm2, worley2 } from "../random/index.js";
import type { Recipe } from "../recipes/index.js";
import {
  box,
  cylinder,
  circlePackingStats,
  makeMesh,
  marchingSquaresContours,
  merge,
  packCircles2D,
  polygonizeField,
  polyline,
  recomputeNormals,
  resampleCurve,
  ribbon,
  smoothCurve,
  sphere,
  sweep,
  transform,
  type Mesh,
  type NamedPart,
  type PartSurfaceRef,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type GrasshopperHowtosCategory =
  | "rockTile"
  | "voronoiPipe"
  | "waffle"
  | "reactionDiffusion"
  | "packing"
  | "contour"
  | "ribbon"
  | "sdfVoxel"
  | "imageField";

export interface RockTileParams {
  readonly resolution: number;
  readonly size: number;
  readonly height: number;
  readonly cells: number;
  readonly gap: number;
  readonly roughness: number;
  readonly seed: number;
}

export interface VoronoiPipeParams {
  readonly cells: number;
  readonly size: number;
  readonly radius: number;
  readonly height: number;
  readonly jitter: number;
  readonly edgeWidth: number;
  readonly seed: number;
}

export interface WafflePatternParams {
  readonly width: number;
  readonly depth: number;
  readonly slicesX: number;
  readonly slicesZ: number;
  readonly height: number;
  readonly thickness: number;
  readonly wave: number;
  readonly seed: number;
}

export interface ReactionDiffusionPlateParams {
  readonly resolution: number;
  readonly size: number;
  readonly height: number;
  readonly iterations: number;
  readonly feed: number;
  readonly kill: number;
  readonly seed: number;
}

export interface PackedCircleParams {
  readonly count: number;
  readonly width: number;
  readonly depth: number;
  readonly minRadius: number;
  readonly maxRadius: number;
  readonly padding: number;
  readonly relax: number;
  readonly height: number;
  readonly seed: number;
}

export interface LandscapeContourParams {
  readonly resolution: number;
  readonly size: number;
  readonly height: number;
  readonly levels: number;
  readonly lineRadius: number;
  readonly noiseScale: number;
  readonly seed: number;
}

export interface RibbonLoopParams {
  readonly radius: number;
  readonly width: number;
  readonly waves: number;
  readonly twist: number;
  readonly height: number;
  readonly segments: number;
  readonly seed: number;
}

export interface VoxelBunnyParams {
  readonly resolution: number;
  readonly size: number;
  readonly earLength: number;
  readonly smoothness: number;
  readonly seed: number;
}

export interface ImageFieldReliefParams {
  readonly samples: number;
  readonly size: number;
  readonly reliefHeight: number;
  readonly threshold: number;
  readonly gamma: number;
  readonly volumeResolution: number;
  readonly seed: number;
}

export interface GrasshopperHowtosShowcaseParams {
  readonly seed: number;
  readonly scale: number;
}

export interface GrasshopperHowtosSummary {
  readonly partCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly categories: Record<GrasshopperHowtosCategory, number>;
}

export const ROCK_TILE_DEFAULTS: RockTileParams = {
  resolution: 40,
  size: 3.2,
  height: 0.28,
  cells: 5,
  gap: 0.08,
  roughness: 0.42,
  seed: 11,
};

export const VORONOI_PIPE_DEFAULTS: VoronoiPipeParams = {
  cells: 5,
  size: 3.2,
  radius: 0.035,
  height: 0.18,
  jitter: 0.92,
  edgeWidth: 0.07,
  seed: 23,
};

export const WAFFLE_PATTERN_DEFAULTS: WafflePatternParams = {
  width: 3.4,
  depth: 2.6,
  slicesX: 8,
  slicesZ: 7,
  height: 1.25,
  thickness: 0.055,
  wave: 0.32,
  seed: 31,
};

export const REACTION_DIFFUSION_PLATE_DEFAULTS: ReactionDiffusionPlateParams = {
  resolution: 48,
  size: 3.0,
  height: 0.32,
  iterations: 52,
  feed: 0.035,
  kill: 0.061,
  seed: 43,
};

export const PACKED_CIRCLE_DEFAULTS: PackedCircleParams = {
  count: 64,
  width: 3.4,
  depth: 2.6,
  minRadius: 0.055,
  maxRadius: 0.18,
  padding: 0.012,
  relax: 90,
  height: 0.16,
  seed: 53,
};

export const LANDSCAPE_CONTOUR_DEFAULTS: LandscapeContourParams = {
  resolution: 52,
  size: 3.4,
  height: 0.62,
  levels: 9,
  lineRadius: 0.012,
  noiseScale: 3.1,
  seed: 61,
};

export const RIBBON_LOOP_DEFAULTS: RibbonLoopParams = {
  radius: 1.25,
  width: 0.22,
  waves: 3,
  twist: 1.1,
  height: 0.42,
  segments: 72,
  seed: 73,
};

export const VOXEL_BUNNY_DEFAULTS: VoxelBunnyParams = {
  resolution: 34,
  size: 1.1,
  earLength: 0.86,
  smoothness: 0.14,
  seed: 83,
};

export const IMAGE_FIELD_RELIEF_DEFAULTS: ImageFieldReliefParams = {
  samples: 18,
  size: 2.8,
  reliefHeight: 0.52,
  threshold: 0.42,
  gamma: 0.9,
  volumeResolution: 34,
  seed: 89,
};

export const GRASSHOPPER_HOWTOS_SHOWCASE_DEFAULTS: GrasshopperHowtosShowcaseParams = {
  seed: 70,
  scale: 1,
};

const STONE_BASE: RGB = [0.27, 0.27, 0.25];
const STONE_LIGHT: RGB = [0.56, 0.53, 0.47];
const GROUT: RGB = [0.08, 0.08, 0.075];
const PIPE: RGB = [0.62, 0.64, 0.62];
const PIPE_HOT: RGB = [0.94, 0.38, 0.15];
const PLATE: RGB = [0.11, 0.13, 0.14];
const WOOD: RGB = [0.66, 0.46, 0.24];
const WOOD_DARK: RGB = [0.32, 0.19, 0.09];
const FIELD_BLUE: RGB = [0.18, 0.44, 0.78];
const FIELD_YELLOW: RGB = [0.86, 0.72, 0.38];
const PEBBLE: RGB = [0.44, 0.43, 0.39];
const PEBBLE_DARK: RGB = [0.16, 0.15, 0.13];
const TERRAIN_LOW: RGB = [0.18, 0.33, 0.18];
const TERRAIN_HIGH: RGB = [0.62, 0.58, 0.46];
const CONTOUR_LINE: RGB = [0.93, 0.86, 0.55];
const RIBBON_SURFACE: RGB = [0.74, 0.18, 0.27];
const RIBBON_EDGE: RGB = [0.95, 0.78, 0.28];
const VOXEL_WHITE: RGB = [0.78, 0.83, 0.88];
const IMAGE_DARK: RGB = [0.08, 0.12, 0.18];
const IMAGE_LIGHT: RGB = [0.18, 0.72, 0.88];

function resolveRockTile(params: Partial<RockTileParams>): RockTileParams {
  const p = { ...ROCK_TILE_DEFAULTS, ...params };
  return {
    resolution: Math.max(8, Math.round(p.resolution)),
    size: Math.max(0.5, p.size),
    height: Math.max(0.02, p.height),
    cells: Math.max(1, Math.round(p.cells)),
    gap: clamp(p.gap, 0.005, 0.35),
    roughness: clamp(p.roughness, 0, 1),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveVoronoiPipe(params: Partial<VoronoiPipeParams>): VoronoiPipeParams {
  const p = { ...VORONOI_PIPE_DEFAULTS, ...params };
  return {
    cells: Math.max(2, Math.round(p.cells)),
    size: Math.max(0.5, p.size),
    radius: Math.max(0.004, p.radius),
    height: Math.max(0.02, p.height),
    jitter: clamp(p.jitter, 0, 1.5),
    edgeWidth: clamp(p.edgeWidth, 0.015, 0.2),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveWaffle(params: Partial<WafflePatternParams>): WafflePatternParams {
  const p = { ...WAFFLE_PATTERN_DEFAULTS, ...params };
  return {
    width: Math.max(0.5, p.width),
    depth: Math.max(0.5, p.depth),
    slicesX: Math.max(1, Math.round(p.slicesX)),
    slicesZ: Math.max(1, Math.round(p.slicesZ)),
    height: Math.max(0.1, p.height),
    thickness: Math.max(0.01, p.thickness),
    wave: clamp(p.wave, 0, 1),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveReaction(params: Partial<ReactionDiffusionPlateParams>): ReactionDiffusionPlateParams {
  const p = { ...REACTION_DIFFUSION_PLATE_DEFAULTS, ...params };
  return {
    resolution: Math.max(12, Math.round(p.resolution)),
    size: Math.max(0.5, p.size),
    height: Math.max(0.02, p.height),
    iterations: Math.max(1, Math.round(p.iterations)),
    feed: clamp(p.feed, 0.005, 0.09),
    kill: clamp(p.kill, 0.03, 0.09),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolvePacking(params: Partial<PackedCircleParams>): PackedCircleParams {
  const p = { ...PACKED_CIRCLE_DEFAULTS, ...params };
  const minRadius = Math.max(0.01, p.minRadius);
  return {
    count: Math.max(1, Math.round(p.count)),
    width: Math.max(0.5, p.width),
    depth: Math.max(0.5, p.depth),
    minRadius,
    maxRadius: Math.max(minRadius, p.maxRadius),
    padding: Math.max(0, p.padding),
    relax: Math.max(0, Math.round(p.relax)),
    height: Math.max(0.02, p.height),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveLandscapeContour(params: Partial<LandscapeContourParams>): LandscapeContourParams {
  const p = { ...LANDSCAPE_CONTOUR_DEFAULTS, ...params };
  return {
    resolution: Math.max(8, Math.round(p.resolution)),
    size: Math.max(0.8, p.size),
    height: Math.max(0.03, p.height),
    levels: Math.max(1, Math.round(p.levels)),
    lineRadius: Math.max(0.003, p.lineRadius),
    noiseScale: Math.max(0.2, p.noiseScale),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveRibbonLoop(params: Partial<RibbonLoopParams>): RibbonLoopParams {
  const p = { ...RIBBON_LOOP_DEFAULTS, ...params };
  return {
    radius: Math.max(0.2, p.radius),
    width: Math.max(0.02, p.width),
    waves: Math.max(0, Math.round(p.waves)),
    twist: p.twist,
    height: Math.max(0, p.height),
    segments: Math.max(8, Math.round(p.segments)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveVoxelBunny(params: Partial<VoxelBunnyParams>): VoxelBunnyParams {
  const p = { ...VOXEL_BUNNY_DEFAULTS, ...params };
  return {
    resolution: Math.max(16, Math.round(p.resolution)),
    size: Math.max(0.3, p.size),
    earLength: Math.max(0.25, p.earLength),
    smoothness: clamp(p.smoothness, 0.01, 0.4),
    seed: Math.round(p.seed) >>> 0,
  };
}

function resolveImageFieldRelief(params: Partial<ImageFieldReliefParams>): ImageFieldReliefParams {
  const p = { ...IMAGE_FIELD_RELIEF_DEFAULTS, ...params };
  return {
    samples: Math.max(6, Math.round(p.samples)),
    size: Math.max(0.8, p.size),
    reliefHeight: Math.max(0.05, p.reliefHeight),
    threshold: clamp(p.threshold, 0.05, 0.95),
    gamma: Math.max(0.1, p.gamma),
    volumeResolution: Math.max(16, Math.round(p.volumeResolution)),
    seed: Math.round(p.seed) >>> 0,
  };
}

function surf(
  category: GrasshopperHowtosCategory,
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  type: string,
  params: Record<string, unknown> = {},
): NamedPart {
  const surface: PartSurfaceRef = { type, params: { color, ...params } };
  return {
    name,
    label,
    mesh: recomputeNormals(mesh),
    color,
    surface,
    metadata: {
      source: "GrasshopperHowtos-inspired Meshova rewrite",
      category,
    },
  };
}

export function buildRockTileParts(params: Partial<RockTileParams> = {}): NamedPart[] {
  const p = resolveRockTile(params);
  const field = rockTileField(p);
  const tile = fieldToReliefMesh(field, p.size, p.size, p.height, 0.035);
  const colors = tile.positions.map((pos) => {
    const t = clamp((pos.y - 0.035) / Math.max(1e-6, p.height), 0, 1);
    return mixColor(GROUT, mixColor(STONE_BASE, STONE_LIGHT, t), smoothstep(0.02, 0.16, t));
  }).flat();
  const tilePart = surf("rockTile", "rock_tile_relief", "岩石瓦片浮雕", tile, STONE_BASE, "stone", {
    roughness: 0.92,
    seed: p.seed,
  });
  tilePart.colors = colors;
  tilePart.metadata = {
    ...tilePart.metadata,
    field: field2DStats(field),
  };
  const backing = transform(box(p.size * 1.01, 0.035, p.size * 1.01), {
    translate: vec3(0, 0.012, 0),
  });
  return [
    surf("rockTile", "dark_grout_backing", "深色缝隙底板", backing, GROUT, "stone", {
      roughness: 0.98,
      seed: p.seed + 1,
    }),
    tilePart,
  ];
}

export function buildVoronoiPipeParts(params: Partial<VoronoiPipeParams> = {}): NamedPart[] {
  const p = resolveVoronoiPipe(params);
  const pipeSegments = buildVoronoiPipeMeshes(p);
  const nodes = buildVoronoiNodeMeshes(p);
  const baseHeight = Math.max(0.055, p.height - p.radius);
  const base = transform(box(p.size, baseHeight, p.size), {
    translate: vec3(0, baseHeight / 2, 0),
  });
  const accent = pipeSegments.slice(0, Math.max(1, Math.ceil(pipeSegments.length * 0.08)));
  const main = pipeSegments.slice(accent.length);
  return [
    surf("voronoiPipe", "voronoi_base_plate", "Voronoi 管线底板", base, PLATE, "ceramic", {
      roughness: 0.76,
      seed: p.seed,
    }),
    surf("voronoiPipe", "voronoi_pipe_network", "Voronoi 管网", merge(...main), PIPE, "metal", {
      roughness: 0.28,
      metallic: 1,
      seed: p.seed + 1,
    }),
    surf("voronoiPipe", "voronoi_accent_route", "高亮管线片段", merge(...accent), PIPE_HOT, "emissive", {
      intensity: 0.8,
      seed: p.seed + 2,
    }),
    surf("voronoiPipe", "voronoi_pipe_nodes", "管线节点", merge(...nodes), PIPE, "metal", {
      roughness: 0.32,
      metallic: 1,
      seed: p.seed + 3,
    }),
  ];
}

export function buildWafflePatternParts(params: Partial<WafflePatternParams> = {}): NamedPart[] {
  const p = resolveWaffle(params);
  const rng = makeRng(p.seed);
  const ribsX: Mesh[] = [];
  const ribsZ: Mesh[] = [];
  const tabs: Mesh[] = [];
  const heightsX: number[] = [];
  const heightsZ: number[] = [];
  const xStep = p.width / Math.max(1, p.slicesX - 1);
  const zStep = p.depth / Math.max(1, p.slicesZ - 1);
  const noise = makeNoise(p.seed);

  for (let i = 0; i < p.slicesZ; i++) {
    const z = p.slicesZ === 1 ? 0 : -p.depth * 0.5 + i * zStep;
    const t = p.slicesZ === 1 ? 0.5 : i / (p.slicesZ - 1);
    const h = ribHeight(p.height, p.wave, t, fbm2(noise, t * 2.7, 0.3));
    heightsX.push(h);
    ribsX.push(transform(box(p.width, h, p.thickness), {
      translate: vec3(0, h * 0.5, z),
    }));
  }

  for (let i = 0; i < p.slicesX; i++) {
    const x = p.slicesX === 1 ? 0 : -p.width * 0.5 + i * xStep;
    const t = p.slicesX === 1 ? 0.5 : i / (p.slicesX - 1);
    const h = ribHeight(p.height, p.wave, t, fbm2(noise, 0.7, t * 2.3));
    heightsZ.push(h);
    ribsZ.push(transform(box(p.thickness, h, p.depth), {
      translate: vec3(x, p.thickness + h * 0.5, 0),
    }));
  }

  const tabCount = Math.min(48, p.slicesX * p.slicesZ);
  for (let i = 0; i < tabCount; i++) {
    const ix = rng.int(0, p.slicesX - 1);
    const iz = rng.int(0, p.slicesZ - 1);
    const x = p.slicesX === 1 ? 0 : -p.width * 0.5 + ix * xStep;
    const z = p.slicesZ === 1 ? 0 : -p.depth * 0.5 + iz * zStep;
    const localHeight = Math.min(heightsX[iz] ?? p.height, heightsZ[ix] ?? p.height);
    const tabHeight = Math.min(p.height * 0.18, localHeight * 0.24);
    tabs.push(transform(box(p.thickness * 1.45, tabHeight, p.thickness * 1.45), {
      translate: vec3(x, localHeight * rng.range(0.28, 0.7), z),
    }));
  }

  return [
    surf("waffle", "waffle_ribs_x", "横向切片肋板", merge(...ribsX), WOOD, "wood", {
      roughness: 0.86,
      seed: p.seed,
    }),
    surf("waffle", "waffle_ribs_z", "纵向切片肋板", merge(...ribsZ), mixColor(WOOD, WOOD_DARK, 0.35), "wood", {
      roughness: 0.86,
      seed: p.seed + 1,
    }),
    surf("waffle", "waffle_slot_marks", "卡槽标记", merge(...tabs), WOOD_DARK, "wood", {
      roughness: 0.9,
      seed: p.seed + 2,
    }),
  ];
}

export function buildReactionDiffusionPlateParts(
  params: Partial<ReactionDiffusionPlateParams> = {},
): NamedPart[] {
  const p = resolveReaction(params);
  const raw = grayScottField2D(p.resolution, p.resolution, {
    iterations: p.iterations,
    feed: p.feed,
    kill: p.kill,
    spots: 10,
    spotRadiusRange: [p.resolution * 0.025, p.resolution * 0.08],
    seed: p.seed,
  });
  const field = normalizeField2D(raw);
  const mesh = fieldToReliefMesh(field, p.size, p.size, p.height, 0.04);
  const colors = mesh.positions.map((pos) => {
    const t = clamp((pos.y - 0.04) / Math.max(1e-6, p.height), 0, 1);
    return mixColor(FIELD_YELLOW, FIELD_BLUE, smoothstep(0.08, 0.92, t));
  }).flat();
  const part = surf("reactionDiffusion", "reaction_diffusion_plate", "反应扩散纹样板", mesh, FIELD_BLUE, "ceramic", {
    roughness: 0.64,
    seed: p.seed,
  });
  part.colors = colors;
  part.metadata = {
    ...part.metadata,
    field: field2DStats(field),
  };
  return [part];
}

export function buildPackedCircleParts(params: Partial<PackedCircleParams> = {}): NamedPart[] {
  const p = resolvePacking(params);
  const rng = makeRng(p.seed);
  const circles = packCircles2D({
    count: p.count,
    width: p.width,
    height: p.depth,
    minRadius: p.minRadius,
    maxRadius: p.maxRadius,
    padding: p.padding,
    iterations: p.relax,
    seed: p.seed,
  });
  const pebbleMeshes: Mesh[] = [];
  const capMeshes: Mesh[] = [];
  for (const c of circles) {
    const h = p.height * rng.range(0.55, 1.35);
    const sx = rng.range(0.84, 1.22);
    const sz = rng.range(0.78, 1.18);
    const yaw = rng.range(0, TAU);
    const base = transform(cylinder(c.radius * 0.94, h, 14, true), {
      scale: vec3(sx, 1, sz),
      rotate: vec3(0, yaw, 0),
      translate: vec3(c.center.x, h * 0.5 + 0.04, c.center.y),
    });
    pebbleMeshes.push(base);
    capMeshes.push(transform(sphere(c.radius * 0.58, 10, 6), {
      scale: vec3(sx * 1.15, 0.32, sz * 1.15),
      rotate: vec3(0, yaw, 0),
      translate: vec3(c.center.x, h + 0.045, c.center.y),
    }));
  }
  const backing = transform(box(p.width + 0.18, 0.045, p.depth + 0.18), {
    translate: vec3(0, 0.018, 0),
  });
  const pebblePart = surf("packing", "packed_pebbles", "Packed Circle 石子", merge(...pebbleMeshes, ...capMeshes), PEBBLE, "stone", {
    roughness: 0.9,
    seed: p.seed,
  });
  pebblePart.metadata = {
    ...pebblePart.metadata,
    packing: circlePackingStats(circles, p.padding),
  };
  return [
    surf("packing", "packing_shadow_bed", "Packing 深色底板", backing, PEBBLE_DARK, "stone", {
      roughness: 0.96,
      seed: p.seed + 1,
    }),
    pebblePart,
  ];
}

export function buildLandscapeContourParts(params: Partial<LandscapeContourParams> = {}): NamedPart[] {
  const p = resolveLandscapeContour(params);
  const noise = makeNoise(p.seed);
  const field = normalizeField2D(generateField2D(p.resolution, p.resolution, (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const dome = clamp(1 - Math.hypot(dx, dy) * 1.7, 0, 1);
    const ridges = fbm2(noise, u * p.noiseScale, v * p.noiseScale, {
      octaves: 5,
      lacunarity: 2.05,
      gain: 0.5,
    }) * 0.5 + 0.5;
    return dome * 0.65 + ridges * 0.55;
  }));
  const terrain = fieldToReliefMesh(field, p.size, p.size, p.height, 0.035);
  const colors = terrain.positions.map((pos) => {
    const t = clamp((pos.y - 0.035) / Math.max(1e-6, p.height), 0, 1);
    return mixColor(TERRAIN_LOW, TERRAIN_HIGH, smoothstep(0.18, 0.92, t));
  }).flat();
  const contourMeshes: Mesh[] = [];
  let curveCount = 0;
  for (let i = 1; i <= p.levels; i++) {
    const level = i / (p.levels + 1);
    const curves = marchingSquaresContours(field, {
      level,
      width: p.size,
      depth: p.size,
      y: 0.035 + level * p.height + p.lineRadius,
    });
    curveCount += curves.length;
    for (const c of curves) {
      const sampled = resampleCurve(c, { segmentLength: p.size / 96 });
      contourMeshes.push(sweep(sampled, {
        radius: p.lineRadius,
        sides: 5,
        caps: !sampled.closed,
      }));
    }
  }
  const terrainPart = surf("contour", "contour_landscape_relief", "等高线地形浮雕", terrain, TERRAIN_LOW, "ground", {
    roughness: 0.92,
    seed: p.seed,
  });
  terrainPart.colors = colors;
  terrainPart.metadata = {
    ...terrainPart.metadata,
    field: field2DStats(field),
    contours: curveCount,
  };
  return [
    terrainPart,
    surf("contour", "contour_lines", "Marching Squares 等高线", merge(...contourMeshes), CONTOUR_LINE, "plastic", {
      roughness: 0.38,
      seed: p.seed + 1,
    }),
  ];
}

export function buildRibbonLoopParts(params: Partial<RibbonLoopParams> = {}): NamedPart[] {
  const p = resolveRibbonLoop(params);
  const phase = (p.seed % 997) * 0.01;
  const pts: Vec3[] = [];
  for (let i = 0; i < p.segments; i++) {
    const t = i / p.segments;
    const a = t * TAU;
    const wave = Math.sin(a * Math.max(1, p.waves) + phase);
    const r = p.radius * (1 + 0.08 * Math.sin(a * (p.waves + 1) + phase * 1.7));
    pts.push(vec3(Math.cos(a) * r, p.height + wave * p.height, Math.sin(a) * r));
  }
  const curve = smoothCurve(polyline(pts, true), 3);
  const surface = ribbon(curve, {
    width: p.width,
    initialNormal: vec3(0, 1, 0),
    widthAt: (t) => 0.72 + 0.28 * (Math.sin(t * TAU * (p.waves + 2) + phase) * 0.5 + 0.5),
    twistAt: (t) => p.twist * Math.sin(t * TAU * Math.max(1, p.waves) + phase * 0.5),
  });
  const edge = sweep(curve, {
    radius: p.width * 0.055,
    sides: 6,
    caps: false,
  });
  return [
    {
      ...surf("ribbon", "ribbon_loop_surface", "Ribbon Loop 曲面带", surface, RIBBON_SURFACE, "fabric", {
        roughness: 0.76,
        seed: p.seed,
      }),
      doubleSided: true,
    },
    surf("ribbon", "ribbon_loop_spine", "Ribbon Loop 边缘线", edge, RIBBON_EDGE, "plastic", {
      roughness: 0.42,
      seed: p.seed + 1,
    }),
  ];
}

export function buildVoxelBunnyParts(params: Partial<VoxelBunnyParams> = {}): NamedPart[] {
  const p = resolveVoxelBunny(params);
  const size = p.size;
  const pose = ((p.seed % 29) - 14) / 140;
  const fields: SDF3D[] = [
    sdfEllipsoid(vec3(0.56 * size, 0.72 * size, 0.44 * size), vec3(0, 0.78 * size, 0)),
    sdfEllipsoid(vec3(0.48 * size, 0.46 * size, 0.42 * size), vec3(0, 1.48 * size, 0.02 * size)),
    sdfEllipsoid(vec3(0.26 * size, 0.18 * size, 0.2 * size), vec3(0, 1.38 * size, 0.38 * size)),
    sdfEllipsoid(
      vec3(0.14 * size, p.earLength * size, 0.13 * size),
      vec3((-0.22 + pose) * size, (2.02 + p.earLength * 0.42) * size, -0.01 * size),
    ),
    sdfEllipsoid(
      vec3(0.14 * size, p.earLength * size, 0.13 * size),
      vec3((0.22 - pose) * size, (2.02 + p.earLength * 0.42) * size, -0.01 * size),
    ),
    sdfEllipsoid(vec3(0.3 * size, 0.17 * size, 0.38 * size), vec3(-0.3 * size, 0.2 * size, 0.12 * size)),
    sdfEllipsoid(vec3(0.3 * size, 0.17 * size, 0.38 * size), vec3(0.3 * size, 0.2 * size, 0.12 * size)),
    sdfSphere(0.23 * size, vec3(0, 0.72 * size, -0.47 * size)),
  ];
  let bunny = fields[0]!;
  for (let i = 1; i < fields.length; i++) bunny = sdfSmoothUnion(bunny, fields[i]!, p.smoothness * size);
  const mesh = polygonizeField(sdfToScalarGrid(bunny, {
    min: vec3(-1.0 * size, -0.1 * size, -0.9 * size),
    max: vec3(1.0 * size, (2.25 + p.earLength) * size, 0.9 * size),
    resolution: p.resolution,
  }));
  return [surf("sdfVoxel", "voxel_bunny_shell", "SDF 体素兔等值面", mesh, VOXEL_WHITE, "ceramic", {
    roughness: 0.7,
    seed: p.seed,
  })];
}

export function buildImageFieldReliefParts(
  params: Partial<ImageFieldReliefParams> = {},
  source?: RasterFieldSource,
): NamedPart[] {
  const p = resolveImageFieldRelief(params);
  const raster = source ?? makePortraitFieldSource(64, 64, p.seed);
  const field = rasterToField2D(raster, { channel: "luminance", gamma: p.gamma, multiplyAlpha: true });
  const depth = p.size;
  const volume = field2DExtrudeSDF(field, {
    width: p.size,
    depth,
    height: p.reliefHeight,
    threshold: p.threshold,
    center: vec3(0, p.reliefHeight * 0.5, 0),
  });
  const shell = polygonizeField(sdfToScalarGrid(volume, {
    min: vec3(-p.size * 0.58, -p.reliefHeight * 0.2, -depth * 0.58),
    max: vec3(p.size * 0.58, p.reliefHeight * 1.2, depth * 0.58),
    resolution: p.volumeResolution,
  }));

  const pins: Mesh[] = [];
  const cell = p.size / p.samples;
  for (let z = 0; z < p.samples; z++) {
    for (let x = 0; x < p.samples; x++) {
      const u = (x + 0.5) / p.samples;
      const v = 1 - (z + 0.5) / p.samples;
      const value = sampleField2DUV(field, u, v);
      if (value < p.threshold * 0.65) continue;
      const height = cell * 0.18 + value * p.reliefHeight * 0.72;
      pins.push(transform(box(cell * 0.7, height, cell * 0.7), {
        translate: vec3(
          (u - 0.5) * p.size,
          p.reliefHeight + height * 0.5,
          (v - 0.5) * depth,
        ),
      }));
    }
  }

  return [
    surf("imageField", "image_field_volume", "图像场挤出体", shell, IMAGE_DARK, "plastic", {
      roughness: 0.56,
      seed: p.seed,
    }),
    surf("imageField", "image_field_pins", "图像场高度针阵", merge(...pins), IMAGE_LIGHT, "metal", {
      roughness: 0.34,
      metallic: 0.72,
      seed: p.seed + 1,
    }),
  ];
}

function makePortraitFieldSource(width: number, height: number, seed: number): RasterFieldSource {
  const data = new Uint8Array(width * height * 4);
  const phase = (seed % 997) * 0.013;
  for (let y = 0; y < height; y++) {
    const v = 1 - (y + 0.5) / height;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const px = (u - 0.5) / 0.31;
      const py = (v - 0.63) / 0.34;
      const head = px * px + py * py < 1 ? 0.82 : 0;
      const shoulderY = 0.36 + 0.09 * Math.cos((u - 0.5) * Math.PI * 2);
      const shoulders = v < shoulderY && v > 0.12 && Math.abs(u - 0.5) < 0.46 ? 0.64 : 0;
      const eyeBand = Math.exp(-((v - 0.68) ** 2) * 150) * (0.1 + 0.08 * Math.cos(u * TAU * 5 + phase));
      const cheek = Math.max(0, Math.sin((u * 2.7 + v * 1.9) * TAU + phase)) * 0.08;
      const value = clamp(Math.max(head, shoulders) - eyeBand + cheek, 0, 1);
      const byte = Math.round(value * 255);
      const offset = (y * width + x) * 4;
      data[offset] = byte;
      data[offset + 1] = byte;
      data[offset + 2] = byte;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

export function buildGrasshopperHowtosShowcaseParts(
  params: Partial<GrasshopperHowtosShowcaseParams> = {},
): NamedPart[] {
  const p = { ...GRASSHOPPER_HOWTOS_SHOWCASE_DEFAULTS, ...params };
  const seed = Math.round(p.seed) >>> 0;
  const s = Math.max(0.1, p.scale);
  const groups: Array<{ prefix: string; offset: Vec3; parts: NamedPart[] }> = [
    {
      prefix: "rocktile",
      offset: vec3(-5.1 * s, 0, -2.0 * s),
      parts: buildRockTileParts({ seed: seed + 1, resolution: 28, cells: 4, size: 2.4 }),
    },
    {
      prefix: "voronoi",
      offset: vec3(-1.7 * s, 0, -2.0 * s),
      parts: buildVoronoiPipeParts({ seed: seed + 11, cells: 4, size: 2.3 }),
    },
    {
      prefix: "waffle",
      offset: vec3(1.7 * s, 0, -2.0 * s),
      parts: buildWafflePatternParts({ seed: seed + 21, width: 2.35, depth: 1.9, slicesX: 6, slicesZ: 5 }),
    },
    {
      prefix: "reaction",
      offset: vec3(5.0 * s, 0, -2.0 * s),
      parts: buildReactionDiffusionPlateParts({ seed: seed + 31, resolution: 28, iterations: 30, size: 2.3 }),
    },
    {
      prefix: "packing",
      offset: vec3(-3.4 * s, 0, 1.75 * s),
      parts: buildPackedCircleParts({ seed: seed + 41, count: 42, width: 2.5, depth: 1.9, relax: 70 }),
    },
    {
      prefix: "contour",
      offset: vec3(0, 0, 1.75 * s),
      parts: buildLandscapeContourParts({ seed: seed + 51, resolution: 34, size: 2.4, levels: 7 }),
    },
    {
      prefix: "ribbon",
      offset: vec3(3.4 * s, 0, 1.75 * s),
      parts: buildRibbonLoopParts({ seed: seed + 61, radius: 0.95, width: 0.18, segments: 54 }),
    },
    {
      prefix: "voxelbunny",
      offset: vec3(-1.7 * s, 0, 5.3 * s),
      parts: buildVoxelBunnyParts({ seed: seed + 71, resolution: 26, size: 0.72 }),
    },
    {
      prefix: "imagefield",
      offset: vec3(1.7 * s, 0, 5.3 * s),
      parts: buildImageFieldReliefParts({ seed: seed + 81, samples: 12, size: 2.1, volumeResolution: 26 }),
    },
  ];

  const out: NamedPart[] = [];
  for (const group of groups) {
    for (const part of group.parts) {
      out.push({
        ...part,
        name: `${group.prefix}_${part.name}`,
        mesh: transform(part.mesh, { scale: s, translate: group.offset }),
      });
    }
  }
  return out;
}

export function summarizeGrasshopperHowtos(parts: readonly NamedPart[]): GrasshopperHowtosSummary {
  const categories: Record<GrasshopperHowtosCategory, number> = {
    rockTile: 0,
    voronoiPipe: 0,
    waffle: 0,
    reactionDiffusion: 0,
    packing: 0,
    contour: 0,
    ribbon: 0,
    sdfVoxel: 0,
    imageField: 0,
  };
  let vertexCount = 0;
  let triangleCount = 0;
  for (const part of parts) {
    vertexCount += part.mesh.positions.length;
    triangleCount += part.mesh.indices.length / 3;
    const category = part.metadata?.category;
    if (isGrasshopperHowtosCategory(category)) categories[category]++;
  }
  return { partCount: parts.length, vertexCount, triangleCount, categories };
}

export const ROCK_TILE_RECIPE: Recipe<RockTileParams> = {
  id: "grasshopper-rock-tile",
  label: "Grasshopper 岩石瓦片",
  description: "标量场驱动的石材瓦片、缝隙和噪声浮雕。",
  defaults: ROCK_TILE_DEFAULTS,
  params: [
    { key: "resolution", label: "场分辨率", min: 8, max: 96, step: 4, default: ROCK_TILE_DEFAULTS.resolution },
    { key: "size", label: "尺寸", min: 1, max: 6, step: 0.1, default: ROCK_TILE_DEFAULTS.size },
    { key: "height", label: "浮雕高度", min: 0.02, max: 0.8, step: 0.01, default: ROCK_TILE_DEFAULTS.height },
    { key: "cells", label: "瓦片数量", min: 1, max: 10, step: 1, default: ROCK_TILE_DEFAULTS.cells },
    { key: "gap", label: "缝隙宽度", min: 0.01, max: 0.28, step: 0.01, default: ROCK_TILE_DEFAULTS.gap },
    { key: "roughness", label: "石面粗糙", min: 0, max: 1, step: 0.01, default: ROCK_TILE_DEFAULTS.roughness },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: ROCK_TILE_DEFAULTS.seed },
  ],
  build: buildRockTileParts,
};

export const VORONOI_PIPE_RECIPE: Recipe<VoronoiPipeParams> = {
  id: "grasshopper-voronoi-pipe",
  label: "Grasshopper Voronoi 管网",
  description: "Worley/Voronoi 边界场转 sweep 管线。",
  defaults: VORONOI_PIPE_DEFAULTS,
  params: [
    { key: "cells", label: "Voronoi 密度", min: 2, max: 9, step: 1, default: VORONOI_PIPE_DEFAULTS.cells },
    { key: "size", label: "尺寸", min: 1, max: 6, step: 0.1, default: VORONOI_PIPE_DEFAULTS.size },
    { key: "radius", label: "管半径", min: 0.005, max: 0.12, step: 0.005, default: VORONOI_PIPE_DEFAULTS.radius },
    { key: "height", label: "离地高度", min: 0.05, max: 0.8, step: 0.01, default: VORONOI_PIPE_DEFAULTS.height },
    { key: "jitter", label: "细胞抖动", min: 0, max: 1.5, step: 0.01, default: VORONOI_PIPE_DEFAULTS.jitter },
    { key: "edgeWidth", label: "边界宽度", min: 0.02, max: 0.18, step: 0.005, default: VORONOI_PIPE_DEFAULTS.edgeWidth },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: VORONOI_PIPE_DEFAULTS.seed },
  ],
  build: buildVoronoiPipeParts,
};

export const WAFFLE_PATTERN_RECIPE: Recipe<WafflePatternParams> = {
  id: "grasshopper-waffle-pattern",
  label: "Grasshopper Waffle 切片",
  description: "X/Z 两组切片肋板构成制造友好结构。",
  defaults: WAFFLE_PATTERN_DEFAULTS,
  params: [
    { key: "width", label: "宽度", min: 1, max: 6, step: 0.1, default: WAFFLE_PATTERN_DEFAULTS.width },
    { key: "depth", label: "深度", min: 1, max: 6, step: 0.1, default: WAFFLE_PATTERN_DEFAULTS.depth },
    { key: "slicesX", label: "纵向片数", min: 1, max: 18, step: 1, default: WAFFLE_PATTERN_DEFAULTS.slicesX },
    { key: "slicesZ", label: "横向片数", min: 1, max: 18, step: 1, default: WAFFLE_PATTERN_DEFAULTS.slicesZ },
    { key: "height", label: "高度", min: 0.2, max: 3, step: 0.05, default: WAFFLE_PATTERN_DEFAULTS.height },
    { key: "thickness", label: "板厚", min: 0.02, max: 0.2, step: 0.005, default: WAFFLE_PATTERN_DEFAULTS.thickness },
    { key: "wave", label: "轮廓波动", min: 0, max: 1, step: 0.01, default: WAFFLE_PATTERN_DEFAULTS.wave },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: WAFFLE_PATTERN_DEFAULTS.seed },
  ],
  build: buildWafflePatternParts,
};

export const REACTION_DIFFUSION_PLATE_RECIPE: Recipe<ReactionDiffusionPlateParams> = {
  id: "grasshopper-reaction-diffusion",
  label: "Grasshopper 反应扩散板",
  description: "Gray-Scott 场转程序浮雕和顶点色。",
  defaults: REACTION_DIFFUSION_PLATE_DEFAULTS,
  params: [
    { key: "resolution", label: "场分辨率", min: 12, max: 96, step: 4, default: REACTION_DIFFUSION_PLATE_DEFAULTS.resolution },
    { key: "size", label: "尺寸", min: 1, max: 6, step: 0.1, default: REACTION_DIFFUSION_PLATE_DEFAULTS.size },
    { key: "height", label: "浮雕高度", min: 0.02, max: 0.8, step: 0.01, default: REACTION_DIFFUSION_PLATE_DEFAULTS.height },
    { key: "iterations", label: "迭代次数", min: 1, max: 120, step: 1, default: REACTION_DIFFUSION_PLATE_DEFAULTS.iterations },
    { key: "feed", label: "Feed", min: 0.005, max: 0.09, step: 0.001, default: REACTION_DIFFUSION_PLATE_DEFAULTS.feed },
    { key: "kill", label: "Kill", min: 0.03, max: 0.09, step: 0.001, default: REACTION_DIFFUSION_PLATE_DEFAULTS.kill },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: REACTION_DIFFUSION_PLATE_DEFAULTS.seed },
  ],
  build: buildReactionDiffusionPlateParts,
};

export const PACKED_CIRCLE_RECIPE: Recipe<PackedCircleParams> = {
  id: "grasshopper-packed-circle",
  label: "Grasshopper Packed Circle",
  description: "圆 packing 和 relaxation 转石子/泡泡/填充图案。",
  defaults: PACKED_CIRCLE_DEFAULTS,
  params: [
    { key: "count", label: "圆数量", min: 4, max: 180, step: 1, default: PACKED_CIRCLE_DEFAULTS.count },
    { key: "width", label: "宽度", min: 1, max: 6, step: 0.1, default: PACKED_CIRCLE_DEFAULTS.width },
    { key: "depth", label: "深度", min: 1, max: 6, step: 0.1, default: PACKED_CIRCLE_DEFAULTS.depth },
    { key: "minRadius", label: "最小半径", min: 0.02, max: 0.25, step: 0.005, default: PACKED_CIRCLE_DEFAULTS.minRadius },
    { key: "maxRadius", label: "最大半径", min: 0.03, max: 0.4, step: 0.005, default: PACKED_CIRCLE_DEFAULTS.maxRadius },
    { key: "padding", label: "间隙", min: 0, max: 0.08, step: 0.002, default: PACKED_CIRCLE_DEFAULTS.padding },
    { key: "relax", label: "松弛迭代", min: 0, max: 180, step: 1, default: PACKED_CIRCLE_DEFAULTS.relax },
    { key: "height", label: "高度", min: 0.03, max: 0.5, step: 0.01, default: PACKED_CIRCLE_DEFAULTS.height },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: PACKED_CIRCLE_DEFAULTS.seed },
  ],
  build: buildPackedCircleParts,
};

export const LANDSCAPE_CONTOUR_RECIPE: Recipe<LandscapeContourParams> = {
  id: "grasshopper-landscape-contour",
  label: "Grasshopper 等高线地形",
  description: "标量高度场经 marching squares 转等高线和制造切片线。",
  defaults: LANDSCAPE_CONTOUR_DEFAULTS,
  params: [
    { key: "resolution", label: "场分辨率", min: 12, max: 96, step: 4, default: LANDSCAPE_CONTOUR_DEFAULTS.resolution },
    { key: "size", label: "尺寸", min: 1, max: 6, step: 0.1, default: LANDSCAPE_CONTOUR_DEFAULTS.size },
    { key: "height", label: "地形高度", min: 0.05, max: 1.4, step: 0.01, default: LANDSCAPE_CONTOUR_DEFAULTS.height },
    { key: "levels", label: "等高线层数", min: 1, max: 18, step: 1, default: LANDSCAPE_CONTOUR_DEFAULTS.levels },
    { key: "lineRadius", label: "线半径", min: 0.004, max: 0.05, step: 0.002, default: LANDSCAPE_CONTOUR_DEFAULTS.lineRadius },
    { key: "noiseScale", label: "地貌频率", min: 0.5, max: 8, step: 0.1, default: LANDSCAPE_CONTOUR_DEFAULTS.noiseScale },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: LANDSCAPE_CONTOUR_DEFAULTS.seed },
  ],
  build: buildLandscapeContourParts,
};

export const RIBBON_LOOP_RECIPE: Recipe<RibbonLoopParams> = {
  id: "grasshopper-ribbon-loop",
  label: "Grasshopper Ribbon Loop",
  description: "曲线 frame 生成扭转 ribbon 曲面，适合百叶、褶皱、折带。",
  defaults: RIBBON_LOOP_DEFAULTS,
  params: [
    { key: "radius", label: "环半径", min: 0.3, max: 2.5, step: 0.05, default: RIBBON_LOOP_DEFAULTS.radius },
    { key: "width", label: "带宽", min: 0.03, max: 0.6, step: 0.01, default: RIBBON_LOOP_DEFAULTS.width },
    { key: "waves", label: "波峰数", min: 0, max: 9, step: 1, default: RIBBON_LOOP_DEFAULTS.waves },
    { key: "twist", label: "扭转强度", min: -3.14, max: 3.14, step: 0.05, default: RIBBON_LOOP_DEFAULTS.twist },
    { key: "height", label: "起伏高度", min: 0, max: 1.2, step: 0.02, default: RIBBON_LOOP_DEFAULTS.height },
    { key: "segments", label: "曲线分段", min: 12, max: 160, step: 4, default: RIBBON_LOOP_DEFAULTS.segments },
    { key: "seed", label: "随机种子", min: 0, max: 999, step: 1, default: RIBBON_LOOP_DEFAULTS.seed },
  ],
  build: buildRibbonLoopParts,
};

export const VOXEL_BUNNY_RECIPE: Recipe<VoxelBunnyParams> = {
  id: "grasshopper-voxel-bunny",
  label: "Grasshopper Voxel Bunny",
  description: "函数式 SDF 组合经 Marching Cubes 生成单一可编辑体积外壳。",
  defaults: VOXEL_BUNNY_DEFAULTS,
  params: [
    { key: "resolution", label: "体素分辨率", min: 16, max: 64, step: 2, default: VOXEL_BUNNY_DEFAULTS.resolution },
    { key: "size", label: "整体尺寸", min: 0.4, max: 2, step: 0.05, default: VOXEL_BUNNY_DEFAULTS.size },
    { key: "earLength", label: "耳朵长度", min: 0.3, max: 1.4, step: 0.02, default: VOXEL_BUNNY_DEFAULTS.earLength },
    { key: "smoothness", label: "融合圆滑度", min: 0.01, max: 0.4, step: 0.01, default: VOXEL_BUNNY_DEFAULTS.smoothness },
    { key: "seed", label: "姿态种子", min: 0, max: 999, step: 1, default: VOXEL_BUNNY_DEFAULTS.seed },
  ],
  build: buildVoxelBunnyParts,
};

export const IMAGE_FIELD_RELIEF_RECIPE: Recipe<ImageFieldReliefParams> = {
  id: "grasshopper-image-field",
  label: "Grasshopper 图像场浮雕",
  description: "RGBA 图像转标量场，同时驱动阈值体积和高度针阵。",
  defaults: IMAGE_FIELD_RELIEF_DEFAULTS,
  params: [
    { key: "samples", label: "针阵采样", min: 6, max: 32, step: 1, default: IMAGE_FIELD_RELIEF_DEFAULTS.samples },
    { key: "size", label: "整体尺寸", min: 1, max: 5, step: 0.1, default: IMAGE_FIELD_RELIEF_DEFAULTS.size },
    { key: "reliefHeight", label: "浮雕高度", min: 0.08, max: 1, step: 0.02, default: IMAGE_FIELD_RELIEF_DEFAULTS.reliefHeight },
    { key: "threshold", label: "轮廓阈值", min: 0.1, max: 0.9, step: 0.01, default: IMAGE_FIELD_RELIEF_DEFAULTS.threshold },
    { key: "gamma", label: "图像场曲线", min: 0.2, max: 2.5, step: 0.05, default: IMAGE_FIELD_RELIEF_DEFAULTS.gamma },
    { key: "volumeResolution", label: "体积分辨率", min: 16, max: 64, step: 2, default: IMAGE_FIELD_RELIEF_DEFAULTS.volumeResolution },
    { key: "seed", label: "输入种子", min: 0, max: 999, step: 1, default: IMAGE_FIELD_RELIEF_DEFAULTS.seed },
  ],
  build: buildImageFieldReliefParts,
};

export const GRASSHOPPER_HOWTOS_RECIPES = [
  ROCK_TILE_RECIPE,
  VORONOI_PIPE_RECIPE,
  WAFFLE_PATTERN_RECIPE,
  REACTION_DIFFUSION_PLATE_RECIPE,
  PACKED_CIRCLE_RECIPE,
  LANDSCAPE_CONTOUR_RECIPE,
  RIBBON_LOOP_RECIPE,
  VOXEL_BUNNY_RECIPE,
  IMAGE_FIELD_RELIEF_RECIPE,
] as const;

function rockTileField(p: RockTileParams): Field2D {
  const noise = makeNoise(p.seed);
  return generateField2D(p.resolution, p.resolution, (u, v) => {
    const gx = u * p.cells;
    const gy = v * p.cells;
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const tileMask = smoothstep(p.gap * 0.8, p.gap * 1.55, edge);
    const n = (fbm2(noise, u * p.cells * 1.8, v * p.cells * 1.8, {
      octaves: 5,
      lacunarity: 2,
      gain: 0.52,
    }) + 1) * 0.5;
    const chips = 1 - smoothstep(0.0, p.gap * 1.1, edge);
    const dome = smoothstep(0, 0.38, edge) * (1 - smoothstep(0.38, 0.5, edge) * 0.18);
    return clamp(tileMask * (0.42 + n * p.roughness + dome * 0.24) - chips * 0.18, 0, 1);
  });
}

function buildVoronoiPipeMeshes(p: VoronoiPipeParams): Mesh[] {
  const samples = Math.max(16, p.cells * 8);
  const y = p.height;
  const meshes: Mesh[] = [];
  const active = new Array<boolean>((samples + 1) * (samples + 1)).fill(false);
  const index = (x: number, z: number): number => z * (samples + 1) + x;
  for (let z = 0; z <= samples; z++) {
    for (let x = 0; x <= samples; x++) {
      const u = x / samples;
      const v = z / samples;
      const w = worley2(u * p.cells, v * p.cells, p.seed, p.jitter);
      active[index(x, z)] = (w.f2 - w.f1) < p.edgeWidth;
    }
  }
  const toWorld = (x: number, z: number): Vec3 =>
    vec3((x / samples - 0.5) * p.size, y, (z / samples - 0.5) * p.size);
  for (let z = 0; z <= samples; z++) {
    for (let x = 0; x <= samples; x++) {
      if (!active[index(x, z)]) continue;
      if (x < samples && active[index(x + 1, z)]) {
        meshes.push(sweep(polyline([toWorld(x, z), toWorld(x + 1, z)]), {
          radius: p.radius,
          sides: 6,
          caps: true,
        }));
      }
      if (z < samples && active[index(x, z + 1)]) {
        meshes.push(sweep(polyline([toWorld(x, z), toWorld(x, z + 1)]), {
          radius: p.radius,
          sides: 6,
          caps: true,
        }));
      }
    }
  }
  return meshes;
}

function buildVoronoiNodeMeshes(p: VoronoiPipeParams): Mesh[] {
  const rng = makeRng(p.seed);
  const meshes: Mesh[] = [];
  const cell = p.size / p.cells;
  for (let y = 0; y < p.cells; y++) {
    for (let x = 0; x < p.cells; x++) {
      const px = (-0.5 + (x + 0.5) / p.cells) * p.size + rng.range(-0.22, 0.22) * cell * p.jitter;
      const pz = (-0.5 + (y + 0.5) / p.cells) * p.size + rng.range(-0.22, 0.22) * cell * p.jitter;
      meshes.push(transform(sphere(p.radius * 1.8, 10, 6), {
        translate: vec3(px, p.height, pz),
      }));
    }
  }
  return meshes;
}

function ribHeight(height: number, wave: number, t: number, noise: number): number {
  const s = Math.sin(t * TAU);
  return height * (0.62 + wave * 0.22 * s + wave * 0.16 * noise);
}

function fieldToReliefMesh(field: Field2D, width: number, depth: number, height: number, base: number): Mesh {
  const cols = field.width;
  const rows = field.height;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: { x: number; y: number }[] = [];
  const indices: number[] = [];
  const topIndex = (x: number, y: number): number => y * (cols + 1) + x;
  for (let y = 0; y <= rows; y++) {
    const v = y / rows;
    for (let x = 0; x <= cols; x++) {
      const u = x / cols;
      const h = base + sampleField2DUV(field, u, v) * height;
      positions.push(vec3((u - 0.5) * width, h, (v - 0.5) * depth));
      normals.push(vec3(0, 1, 0));
      uvs.push({ x: u, y: v });
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = topIndex(x, y);
      const b = topIndex(x + 1, y);
      const c = topIndex(x, y + 1);
      const d = topIndex(x + 1, y + 1);
      indices.push(a, c, b, b, c, d);
    }
  }

  const bottomStart = positions.length;
  for (let y = 0; y <= rows; y++) {
    const v = y / rows;
    for (let x = 0; x <= cols; x++) {
      const u = x / cols;
      positions.push(vec3((u - 0.5) * width, 0, (v - 0.5) * depth));
      normals.push(vec3(0, -1, 0));
      uvs.push({ x: u, y: v });
    }
  }
  const bottomIndex = (x: number, y: number): number => bottomStart + y * (cols + 1) + x;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const a = bottomIndex(x, y);
      const b = bottomIndex(x + 1, y);
      const c = bottomIndex(x, y + 1);
      const d = bottomIndex(x + 1, y + 1);
      indices.push(a, b, c, b, d, c);
    }
  }

  addReliefSide(indices, topIndex, bottomIndex, 0, 0, cols, 0, true);
  addReliefSide(indices, topIndex, bottomIndex, 0, rows, cols, rows, false);
  addReliefSide(indices, topIndex, bottomIndex, 0, 0, 0, rows, false);
  addReliefSide(indices, topIndex, bottomIndex, cols, 0, cols, rows, true);
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function addReliefSide(
  indices: number[],
  topIndex: (x: number, y: number) => number,
  bottomIndex: (x: number, y: number) => number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  flip: boolean,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i < steps; i++) {
    const ax = x0 + Math.round(((x1 - x0) * i) / steps);
    const ay = y0 + Math.round(((y1 - y0) * i) / steps);
    const bx = x0 + Math.round(((x1 - x0) * (i + 1)) / steps);
    const by = y0 + Math.round(((y1 - y0) * (i + 1)) / steps);
    const a = topIndex(ax, ay);
    const b = topIndex(bx, by);
    const c = bottomIndex(ax, ay);
    const d = bottomIndex(bx, by);
    if (flip) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  }
}

function mixColor(a: RGB, b: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

function isGrasshopperHowtosCategory(value: unknown): value is GrasshopperHowtosCategory {
  return value === "rockTile" ||
    value === "voronoiPipe" ||
    value === "waffle" ||
    value === "reactionDiffusion" ||
    value === "packing" ||
    value === "contour" ||
    value === "ribbon" ||
    value === "sdfVoxel" ||
    value === "imageField";
}
