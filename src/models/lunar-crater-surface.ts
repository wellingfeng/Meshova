import { clamp } from "../math/scalar.js";
import { makeNoise, fbm2 } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import {
  heightfieldToMesh,
  type Heightfield,
  type NamedPart,
} from "../geometry/index.js";

export interface LunarCraterSurfaceParams {
  size: number;
  resolution: number;
  largeCraters: number;
  smallCraters: number;
  relief: number;
  rimSharpness: number;
  irregularity: number;
  roughness: number;
  seed: number;
}

export const LUNAR_CRATER_SURFACE_DEFAULTS: LunarCraterSurfaceParams = {
  size: 120,
  resolution: 160,
  largeCraters: 18,
  smallCraters: 240,
  relief: 1,
  rimSharpness: 0.72,
  irregularity: 0.14,
  roughness: 0.65,
  seed: 2025,
};

interface Crater {
  x: number;
  z: number;
  radius: number;
  depth: number;
  rimHeight: number;
  phase: number;
  lobes: number;
  irregularity: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function craterWarp(crater: Crater, angle: number): number {
  const primary = Math.sin(angle * crater.lobes + crater.phase);
  const secondary = Math.sin(angle * (crater.lobes + 4) - crater.phase * 1.71);
  const tertiary = Math.sin(angle * (crater.lobes * 2 + 3) + crater.phase * 0.43);
  return 1 + crater.irregularity * (primary * 0.58 + secondary * 0.28 + tertiary * 0.14);
}

function craterProfile(
  crater: Crater,
  distance: number,
  angle: number,
  rimSharpness: number,
): number {
  const normalized = distance / (crater.radius * craterWarp(crater, angle));
  if (normalized >= 1.72) return 0;

  const bowlEdge = 0.79;
  const bowlT = clamp(normalized / bowlEdge, 0, 1);
  const bowl = normalized < bowlEdge
    ? -crater.depth * (1 - bowlT * bowlT) * (1 - 0.16 * Math.cos(bowlT * Math.PI * 3))
    : 0;

  const rimWidth = 0.16 - clamp(rimSharpness, 0, 1) * 0.085;
  const rimDistance = (normalized - 0.86) / rimWidth;
  const rim = crater.rimHeight * Math.exp(-rimDistance * rimDistance);

  const rayCount = crater.lobes * 2 + 5;
  const ray = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(angle * rayCount + crater.phase));
  const ejecta = normalized > 0.92
    ? crater.rimHeight * 0.22 * (1 - smoothstep(0.92, 1.72, normalized)) * ray
    : 0;

  return bowl + rim + ejecta;
}

function makeCrater(
  x: number,
  z: number,
  radius: number,
  relief: number,
  irregularity: number,
  rng: ReturnType<typeof makeRng>,
  scale: number,
): Crater {
  return {
    x,
    z,
    radius,
    depth: radius * relief * rng.range(0.18, 0.27) * scale,
    rimHeight: radius * relief * rng.range(0.055, 0.09) * scale,
    phase: rng.range(0, Math.PI * 2),
    lobes: rng.int(5, 9),
    irregularity: irregularity * rng.range(0.55, 1),
  };
}

function scatterCraters(params: LunarCraterSurfaceParams, cellSize: number): Crater[] {
  const rng = makeRng(params.seed >>> 0);
  const half = params.size / 2;
  const craters: Crater[] = [];
  const largeCount = Math.max(0, Math.floor(params.largeCraters));
  const smallCount = Math.max(0, Math.floor(params.smallCraters));

  if (largeCount > 0) {
    craters.push(makeCrater(
      -params.size * 0.17,
      params.size * 0.08,
      params.size * 0.17,
      params.relief,
      params.irregularity,
      rng,
      1.08,
    ));
  }

  let attempts = 0;
  while (craters.length < largeCount && attempts < largeCount * 30) {
    attempts++;
    const radius = params.size * rng.range(0.055, 0.135) ** 1.18;
    const x = rng.range(-half * 0.92, half * 0.92);
    const z = rng.range(-half * 0.92, half * 0.92);
    const overlaps = craters.some((other) => (
      Math.hypot(x - other.x, z - other.z) < (radius + other.radius) * 0.72
    ));
    if (overlaps) continue;
    craters.push(makeCrater(
      x,
      z,
      radius,
      params.relief,
      params.irregularity,
      rng,
      1,
    ));
  }

  const minimumRadius = Math.max(cellSize * 1.35, params.size * 0.0065);
  const maximumRadius = params.size * 0.038;
  for (let index = 0; index < smallCount; index++) {
    const radius = minimumRadius * (maximumRadius / minimumRadius) ** (rng.next() ** 1.7);
    craters.push(makeCrater(
      rng.range(-half, half),
      rng.range(-half, half),
      radius,
      params.relief,
      params.irregularity * 0.7,
      rng,
      rng.range(0.95, 1.15),
    ));
  }

  return craters;
}

export function buildLunarCraterHeightfield(
  options: Partial<LunarCraterSurfaceParams> = {},
): Heightfield {
  const params: LunarCraterSurfaceParams = { ...LUNAR_CRATER_SURFACE_DEFAULTS, ...options };
  const size = Math.max(8, params.size);
  const resolution = Math.max(16, Math.min(256, Math.round(params.resolution)));
  const cols = resolution + 1;
  const rows = resolution + 1;
  const cellSize = size / resolution;
  const height = new Float32Array(cols * rows);
  const baseNoise = makeNoise((params.seed + 1301) >>> 0);
  const detailNoise = makeNoise((params.seed + 7919) >>> 0);
  const half = size / 2;

  for (let row = 0; row < rows; row++) {
    const z = -half + row * cellSize;
    for (let column = 0; column < cols; column++) {
      const x = -half + column * cellSize;
      const broad = fbm2(baseNoise, x / (size * 0.34), z / (size * 0.34), { octaves: 5 });
      const grain = fbm2(detailNoise, x / 4.8, z / 4.8, { octaves: 4 });
      height[row * cols + column] = broad * params.roughness * 0.32
        + grain * params.roughness * 0.09;
    }
  }

  const craters = scatterCraters({ ...params, size, resolution }, cellSize);
  for (const crater of craters) {
    const reach = crater.radius * 1.72;
    const minColumn = Math.max(0, Math.floor((crater.x - reach + half) / cellSize));
    const maxColumn = Math.min(cols - 1, Math.ceil((crater.x + reach + half) / cellSize));
    const minRow = Math.max(0, Math.floor((crater.z - reach + half) / cellSize));
    const maxRow = Math.min(rows - 1, Math.ceil((crater.z + reach + half) / cellSize));

    for (let row = minRow; row <= maxRow; row++) {
      const z = -half + row * cellSize;
      for (let column = minColumn; column <= maxColumn; column++) {
        const x = -half + column * cellSize;
        const dx = x - crater.x;
        const dz = z - crater.z;
        const distance = Math.hypot(dx, dz);
        if (distance > reach) continue;
        const heightIndex = row * cols + column;
        height[heightIndex] = height[heightIndex]! + craterProfile(
          crater,
          distance,
          Math.atan2(dz, dx),
          params.rimSharpness,
        );
      }
    }
  }

  return { cols, rows, sizeX: size, sizeZ: size, height };
}

export function buildLunarCraterSurfaceParts(
  options: Partial<LunarCraterSurfaceParams> = {},
): NamedPart[] {
  const params: LunarCraterSurfaceParams = { ...LUNAR_CRATER_SURFACE_DEFAULTS, ...options };
  const heightfield = buildLunarCraterHeightfield(params);
  const mesh = heightfieldToMesh(heightfield, { cusp: 84 });
  const colorNoise = makeNoise((params.seed + 17713) >>> 0);
  const colors: number[] = [];

  for (let index = 0; index < mesh.positions.length; index++) {
    const position = mesh.positions[index]!;
    const normal = mesh.normals[index]!;
    const grain = fbm2(colorNoise, position.x * 0.12, position.z * 0.12, { octaves: 3 });
    const slope = 1 - clamp(normal.y, 0, 1);
    const value = clamp(0.31 + grain * 0.045 - slope * 0.12, 0.16, 0.43);
    colors.push(value, value * 0.985, value * 0.95);
  }

  return [{
    name: "lunar_surface",
    label: "月球陨石坑表面",
    mesh,
    color: [0.31, 0.3, 0.28],
    colors,
    metadata: {
      source: "Bilibili BV18QZWYBEYr",
      technique: "layered crater stamps, irregular rims, ejecta rays, multi-scale noise",
      largeCraters: Math.max(0, Math.floor(params.largeCraters)),
      smallCraters: Math.max(0, Math.floor(params.smallCraters)),
    },
  }];
}
