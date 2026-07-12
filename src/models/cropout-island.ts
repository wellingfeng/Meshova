import { vec2, type Vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import { makeNoise } from "../random/noise.js";
import {
  box,
  cylinder,
  icosphere,
  makeMesh,
  merge,
  recomputeNormals,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

export type CropoutIslandPreset =
  | "pasture"
  | "longshore"
  | "twin"
  | "archipelago"
  | "rocky"
  | "lush";

export interface CropoutIslandParams {
  size: number;
  islandCount: number;
  lobeCount: number;
  segments: number;
  stretch: number;
  coastWidth: number;
  terraceHeight: number;
  trees: number;
  rocks: number;
  seed: number;
}

export const CROPOUT_ISLAND_DEFAULTS: CropoutIslandParams = {
  size: 12,
  islandCount: 1,
  lobeCount: 8,
  segments: 96,
  stretch: 1.15,
  coastWidth: 0.62,
  terraceHeight: 1,
  trees: 52,
  rocks: 18,
  seed: 101,
};

export const CROPOUT_ISLAND_PRESETS: Record<CropoutIslandPreset, Partial<CropoutIslandParams>> = {
  pasture: { islandCount: 1, lobeCount: 8, stretch: 1.08, trees: 42, rocks: 12, seed: 101 },
  longshore: { islandCount: 1, lobeCount: 10, stretch: 1.75, trees: 36, rocks: 20, seed: 211 },
  twin: { islandCount: 2, lobeCount: 7, stretch: 1.2, trees: 48, rocks: 22, seed: 307 },
  archipelago: { islandCount: 4, lobeCount: 6, stretch: 1.05, trees: 56, rocks: 28, seed: 419 },
  rocky: { islandCount: 3, lobeCount: 9, stretch: 1.3, coastWidth: 0.78, terraceHeight: 1.35, trees: 20, rocks: 54, seed: 523 },
  lush: { islandCount: 2, lobeCount: 10, stretch: 1.18, coastWidth: 0.7, trees: 92, rocks: 16, seed: 631 },
};

interface IslandLobe {
  center: Vec2;
  radius: number;
}

interface IslandShape {
  center: Vec2;
  lobes: IslandLobe[];
  baseRadius: number;
  scaleX: number;
  scaleZ: number;
  rotation: number;
  noise: ReturnType<typeof makeNoise>;
}

const ROCK: RGB = [0.34, 0.25, 0.17];
const SAND: RGB = [0.79, 0.61, 0.34];
const GRASS: RGB = [0.28, 0.61, 0.18];
const FOAM: RGB = [0.62, 0.9, 0.82];
const WATER: RGB = [0.05, 0.43, 0.62];
const BARK: RGB = [0.25, 0.14, 0.07];
const LEAF: RGB = [0.18, 0.48, 0.12];
const STONE: RGB = [0.42, 0.4, 0.35];

export function buildCropoutIslandPresetParts(
  preset: CropoutIslandPreset,
  params: Partial<CropoutIslandParams> = {},
): NamedPart[] {
  return buildCropoutIslandParts({ ...CROPOUT_ISLAND_PRESETS[preset], ...params });
}

export function buildCropoutIslandParts(
  params: Partial<CropoutIslandParams> = {},
): NamedPart[] {
  const resolved = resolveParams(params);
  const rng = makeRng(resolved.seed);
  const shapes = makeIslandShapes(resolved, rng);
  const waterLevel = -0.42 * resolved.terraceHeight;
  const rockMeshes: Mesh[] = [];
  const sandMeshes: Mesh[] = [];
  const grassMeshes: Mesh[] = [];
  const foamMeshes: Mesh[] = [];

  for (const shape of shapes) {
    rockMeshes.push(makeTierMesh(
      shape,
      resolved.segments,
      -0.24 * resolved.terraceHeight,
      -0.96 * resolved.terraceHeight,
      resolved.coastWidth * 0.56,
      resolved.coastWidth * 1.42,
    ));
    sandMeshes.push(makeTierMesh(
      shape,
      resolved.segments,
      0.02,
      -0.36 * resolved.terraceHeight,
      resolved.coastWidth * 0.12,
      resolved.coastWidth * 0.82,
    ));
    grassMeshes.push(makeTierMesh(
      shape,
      resolved.segments,
      0.22 * resolved.terraceHeight,
      -0.04,
      -resolved.coastWidth * 0.16,
      resolved.coastWidth * 0.16,
    ));
    foamMeshes.push(makeTierMesh(
      shape,
      resolved.segments,
      waterLevel + 0.025,
      waterLevel - 0.015,
      resolved.coastWidth * 1.5,
      resolved.coastWidth * 1.58,
    ));
  }

  const extent = resolved.size * 1.5;
  const parts: NamedPart[] = [
    part(
      "cropout_ocean",
      "环岛海面",
      transform(box(extent, 0.08, extent), { translate: vec3(0, waterLevel - 0.04, 0) }),
      WATER,
      "water",
      {
        body: "ocean",
        tint: WATER,
        deepColor: [0.01, 0.09, 0.18],
        foamStrength: 0.45,
        waveAmplitude: 0.045,
        seed: resolved.seed + 1,
      },
    ),
    part("cropout_foam", "近岸浪花", merge(...foamMeshes), FOAM, "water", {
      body: "ocean",
      tint: FOAM,
      deepColor: [0.3, 0.68, 0.66],
      roughness: 0.22,
      waveAmplitude: 0.01,
      seed: resolved.seed + 2,
    }),
    part("cropout_bedrock", "岛屿岩层", merge(...rockMeshes), ROCK, "stone", {
      color: ROCK,
      scale: 6,
      seed: resolved.seed + 3,
    }),
    part("cropout_beach", "岛屿沙岸", merge(...sandMeshes), SAND, "sand", {
      color: SAND,
      grainScale: 8,
      seed: resolved.seed + 4,
    }),
    {
      ...part("cropout_grass", "岛屿草地", merge(...grassMeshes), GRASS, "stylizedTerrain", {
        color: GRASS,
        seed: resolved.seed + 5,
      }),
      metadata: {
        generator: "cropout-overlapping-discs",
        islandCount: shapes.length,
        pipeline: ["圆片拼接", "轮廓融合", "三层海岸", "顶面散布"],
        references: ["BV1h94y1p7zf", "BV1cN411n7Cf", "BV15QCNYdE8P"],
      },
    },
  ];

  addScatterParts(parts, shapes, resolved, rng);
  return parts;
}

function resolveParams(params: Partial<CropoutIslandParams>): CropoutIslandParams {
  const merged = { ...CROPOUT_ISLAND_DEFAULTS, ...params };
  return {
    size: Math.max(5, merged.size),
    islandCount: clampInt(merged.islandCount, 1, 6),
    lobeCount: clampInt(merged.lobeCount, 3, 16),
    segments: clampInt(merged.segments, 32, 192),
    stretch: Math.max(0.55, Math.min(2.2, merged.stretch)),
    coastWidth: Math.max(0.15, Math.min(1.6, merged.coastWidth)),
    terraceHeight: Math.max(0.4, Math.min(2.2, merged.terraceHeight)),
    trees: clampInt(merged.trees, 0, 240),
    rocks: clampInt(merged.rocks, 0, 180),
    seed: Math.round(merged.seed) >>> 0,
  };
}

function makeIslandShapes(params: CropoutIslandParams, rng: Rng): IslandShape[] {
  const count = params.islandCount;
  const layoutRadius = count === 1 ? 0 : params.size * (count === 2 ? 0.2 : 0.27);
  const baseRadius = params.size * (count === 1 ? 0.3 : count === 2 ? 0.205 : 0.13);
  const shapes: IslandShape[] = [];

  for (let islandIndex = 0; islandIndex < count; islandIndex++) {
    const layoutAngle = count === 1
      ? 0
      : islandIndex / count * Math.PI * 2 + rng.range(-0.22, 0.22);
    const layoutScale = count === 1 ? 0 : rng.range(0.78, 1.12);
    const center = vec2(
      Math.cos(layoutAngle) * layoutRadius * layoutScale,
      Math.sin(layoutAngle) * layoutRadius * layoutScale,
    );
    const localRadius = baseRadius * rng.range(0.82, 1.16);
    const lobes: IslandLobe[] = [{ center: vec2(0, 0), radius: localRadius }];
    for (let lobeIndex = 0; lobeIndex < params.lobeCount; lobeIndex++) {
      const lobeAngle = lobeIndex / params.lobeCount * Math.PI * 2 + rng.range(-0.4, 0.4);
      const distance = localRadius * rng.range(0.32, 0.7);
      lobes.push({
        center: vec2(Math.cos(lobeAngle) * distance, Math.sin(lobeAngle) * distance),
        radius: localRadius * rng.range(0.34, 0.62),
      });
    }
    const localStretch = Math.pow(params.stretch, rng.range(0.82, 1.08));
    const shapeSeed = params.seed + islandIndex * 131;
    shapes.push({
      center,
      lobes,
      baseRadius: localRadius,
      scaleX: Math.sqrt(localStretch) * (count > 2 ? rng.range(0.9, 1.08) : 1),
      scaleZ: 1 / Math.sqrt(localStretch),
      rotation: rng.range(-Math.PI, Math.PI),
      noise: makeNoise(shapeSeed),
    });
  }
  return shapes;
}

function makeTierMesh(
  shape: IslandShape,
  segments: number,
  topY: number,
  bottomY: number,
  topOffset: number,
  bottomOffset: number,
): Mesh {
  const positions = [vec3(shape.center.x, topY, shape.center.y)];
  const normals = [vec3(0, 1, 0)];
  const uvs = [vec2(0.5, 0.5)];
  const indices: number[] = [];
  const topStart = positions.length;

  for (let segmentIndex = 0; segmentIndex < segments; segmentIndex++) {
    const angle = segmentIndex / segments * Math.PI * 2;
    const point = boundaryPoint(shape, angle, topOffset);
    positions.push(vec3(point.x, topY, point.y));
    normals.push(vec3(0, 1, 0));
    uvs.push(planarUv(shape, point));
  }

  const bottomStart = positions.length;
  for (let segmentIndex = 0; segmentIndex < segments; segmentIndex++) {
    const angle = segmentIndex / segments * Math.PI * 2;
    const point = boundaryPoint(shape, angle, bottomOffset);
    positions.push(vec3(point.x, bottomY, point.y));
    normals.push(vec3(0, -1, 0));
    uvs.push(planarUv(shape, point));
  }

  const bottomCenter = positions.length;
  positions.push(vec3(shape.center.x, bottomY, shape.center.y));
  normals.push(vec3(0, -1, 0));
  uvs.push(vec2(0.5, 0.5));

  for (let segmentIndex = 0; segmentIndex < segments; segmentIndex++) {
    const nextIndex = (segmentIndex + 1) % segments;
    const topCurrent = topStart + segmentIndex;
    const topNext = topStart + nextIndex;
    const bottomCurrent = bottomStart + segmentIndex;
    const bottomNext = bottomStart + nextIndex;
    indices.push(0, topNext, topCurrent);
    indices.push(topCurrent, topNext, bottomCurrent, topNext, bottomNext, bottomCurrent);
    indices.push(bottomCenter, bottomCurrent, bottomNext);
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function boundaryPoint(shape: IslandShape, angle: number, offset: number): Vec2 {
  const radius = Math.max(shape.baseRadius * 0.18, boundaryRadius(shape, angle) + offset);
  const localX = Math.cos(angle) * radius * shape.scaleX;
  const localZ = Math.sin(angle) * radius * shape.scaleZ;
  const cosRotation = Math.cos(shape.rotation);
  const sinRotation = Math.sin(shape.rotation);
  return vec2(
    shape.center.x + localX * cosRotation - localZ * sinRotation,
    shape.center.y + localX * sinRotation + localZ * cosRotation,
  );
}

function boundaryRadius(shape: IslandShape, angle: number): number {
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  let farthest = shape.baseRadius;
  for (const lobe of shape.lobes) {
    const along = lobe.center.x * directionX + lobe.center.y * directionZ;
    const centerLengthSquared = lobe.center.x * lobe.center.x + lobe.center.y * lobe.center.y;
    const perpendicularSquared = centerLengthSquared - along * along;
    const discriminant = lobe.radius * lobe.radius - perpendicularSquared;
    if (discriminant < 0) continue;
    farthest = Math.max(farthest, along + Math.sqrt(discriminant));
  }
  const detail = shape.noise.noise2(directionX * 1.7 + 2.3, directionZ * 1.7 - 4.1);
  return farthest + detail * shape.baseRadius * 0.035;
}

function planarUv(shape: IslandShape, point: Vec2): Vec2 {
  const span = shape.baseRadius * 3.2;
  return vec2(
    0.5 + (point.x - shape.center.x) / span,
    0.5 + (point.y - shape.center.y) / span,
  );
}

function addScatterParts(
  parts: NamedPart[],
  shapes: IslandShape[],
  params: CropoutIslandParams,
  rng: Rng,
): void {
  const unit = params.size / 12;
  const trunkMeshes: Mesh[] = [];
  const canopyMeshes: Mesh[] = [];
  const rockMeshes: Mesh[] = [];
  const grassY = 0.22 * params.terraceHeight;

  for (let treeIndex = 0; treeIndex < params.trees; treeIndex++) {
    const shape = shapes[rng.int(0, shapes.length - 1)]!;
    const point = sampleTopPoint(shape, params.coastWidth * 0.72, rng);
    const scale = unit * rng.range(0.72, 1.25);
    const trunkHeight = 0.58 * scale;
    trunkMeshes.push(transform(cylinder(0.055 * scale, trunkHeight, 7, true), {
      translate: vec3(point.x, grassY + trunkHeight * 0.5, point.y),
      rotate: vec3(rng.range(-0.04, 0.04), rng.range(-Math.PI, Math.PI), rng.range(-0.04, 0.04)),
    }));
    canopyMeshes.push(transform(icosphere(0.34 * scale, 1), {
      translate: vec3(point.x, grassY + trunkHeight + 0.18 * scale, point.y),
      scale: vec3(rng.range(0.82, 1.16), rng.range(1, 1.42), rng.range(0.82, 1.16)),
      rotate: vec3(0, rng.range(-Math.PI, Math.PI), 0),
    }));
  }

  for (let rockIndex = 0; rockIndex < params.rocks; rockIndex++) {
    const shape = shapes[rng.int(0, shapes.length - 1)]!;
    const point = sampleTopPoint(shape, params.coastWidth * 0.3, rng);
    const scale = unit * rng.range(0.12, 0.34);
    rockMeshes.push(transform(icosphere(scale, 1), {
      translate: vec3(point.x, grassY + scale * 0.35, point.y),
      scale: vec3(rng.range(0.8, 1.5), rng.range(0.55, 1.05), rng.range(0.8, 1.5)),
      rotate: vec3(rng.range(-0.4, 0.4), rng.range(-Math.PI, Math.PI), rng.range(-0.4, 0.4)),
    }));
  }

  if (trunkMeshes.length > 0) {
    parts.push(part("cropout_tree_trunks", "岛上树干", merge(...trunkMeshes), BARK, "bark", {
      color: BARK,
      seed: params.seed + 11,
    }));
  }
  if (canopyMeshes.length > 0) {
    const canopy = merge(...canopyMeshes);
    parts.push({
      ...part("cropout_tree_canopies", "岛上树冠", canopy, LEAF, "leaf", {
        color: LEAF,
        seed: params.seed + 12,
      }),
      windWeight: canopy.positions.map((position) => position.y > grassY + unit * 0.45 ? 1 : 0.35),
    });
  }
  if (rockMeshes.length > 0) {
    parts.push(part("cropout_rocks", "岛上岩石", merge(...rockMeshes), STONE, "stone", {
      color: STONE,
      scale: 5,
      seed: params.seed + 13,
    }));
  }
}

function sampleTopPoint(shape: IslandShape, inset: number, rng: Rng): Vec2 {
  const angle = rng.range(0, Math.PI * 2);
  const radius = Math.max(shape.baseRadius * 0.2, boundaryRadius(shape, angle) - inset);
  const radial = Math.sqrt(rng.next()) * radius * rng.range(0.45, 0.92);
  const localX = Math.cos(angle) * radial * shape.scaleX;
  const localZ = Math.sin(angle) * radial * shape.scaleZ;
  const cosRotation = Math.cos(shape.rotation);
  const sinRotation = Math.sin(shape.rotation);
  return vec2(
    shape.center.x + localX * cosRotation - localZ * sinRotation,
    shape.center.y + localX * sinRotation + localZ * cosRotation,
  );
}

function part(
  name: string,
  label: string,
  mesh: Mesh,
  color: RGB,
  surface: string,
  surfaceParams: Record<string, unknown>,
): NamedPart {
  return {
    name,
    label,
    mesh,
    color,
    surface: { type: surface, params: surfaceParams },
  };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
