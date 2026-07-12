import { copyToPoints } from "../geometry/instance.js";
import { bounds, merge, recomputeNormals, type Mesh } from "../geometry/mesh.js";
import { makePointCloud, pointAttribute, surfacePointCloud } from "../geometry/point-cloud.js";
import { transform } from "../geometry/transform.js";
import type { NamedPart } from "../geometry/export.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import { shrub } from "../vegetation/index.js";
import { buildRockFormationMesh } from "./rock-formation.js";

export interface EasyCliffRockParams {
  count: number;
  height: number;
  radius: number;
  spread: number;
  blobs: number;
  crag: number;
  strata: number;
  resolution: number;
  foliageDensity: number;
  seed: number;
}

export const EASY_CLIFF_ROCK_DEFAULTS: EasyCliffRockParams = {
  count: 5,
  height: 8.5,
  radius: 1.3,
  spread: 6.5,
  blobs: 7,
  crag: 0.22,
  strata: 4,
  resolution: 32,
  foliageDensity: 0.5,
  seed: 19,
};

export function buildEasyCliffRockParts(
  params: Partial<EasyCliffRockParams> = {},
): NamedPart[] {
  const p = resolveParams(params);
  const rng = makeRng(p.seed >>> 0);
  const columns: Mesh[] = [];

  for (let index = 0; index < p.count; index++) {
    const primary = index === 0;
    const angle = primary ? 0 : rng.range(0, Math.PI * 2);
    const distance = primary ? 0 : rng.range(p.radius * 2.4, p.spread);
    const height = p.height * (primary ? 1 : rng.range(0.48, 0.92));
    const radius = p.radius * (primary ? 1 : rng.range(0.62, 1.05));
    const rawRock = buildRockFormationMesh({
      mode: "cliff",
      radius,
      height: height * 0.38,
      blobs: p.blobs,
      crag: p.crag,
      cragFrequency: rng.range(1.25, 1.9),
      strata: 0,
      resolution: p.resolution,
      chip: 0.055,
      faceCusp: 22,
      seed: (p.seed + index * 7919) >>> 0,
    });
    const rock = stratify(rawRock, p.strata);
    const rockBounds = bounds(rock);
    const rockHeight = Math.max(1e-6, rockBounds.max.y - rockBounds.min.y);
    const verticalScale = height / rockHeight;
    columns.push(transform(rock, {
      scale: vec3(rng.range(0.78, 1.12), verticalScale, rng.range(0.72, 1.08)),
      rotate: vec3(0, rng.range(-Math.PI, Math.PI), 0),
      translate: vec3(
        Math.cos(angle) * distance,
        -rockBounds.min.y * verticalScale,
        Math.sin(angle) * distance,
      ),
    }));
  }

  const cliff = merge(...columns);
  const parts: NamedPart[] = [
    {
      name: "cliff_rock",
      label: "悬崖岩柱",
      mesh: cliff,
      color: [0.38, 0.34, 0.27],
      surface: {
        type: "mossyStone",
        params: { color: [0.38, 0.34, 0.27], moss: 0.22, seed: p.seed },
      },
    },
  ];

  const foliageCount = Math.round(p.count * p.foliageDensity * 14);
  if (foliageCount <= 0) return parts;

  const candidates = surfacePointCloud(cliff, {
    count: foliageCount * 8,
    seed: p.seed + 4001,
  });
  const selected: number[] = [];
  for (let index = 0; index < candidates.points.length && selected.length < foliageCount; index++) {
    const normal = candidates.normals[index]!;
    const point = candidates.points[index]!;
    if (normal.y < 0.18 || normal.y > 0.9 || point.y < p.height * 0.08) continue;
    selected.push(index);
  }
  if (selected.length === 0) return parts;

  const foliageRng = makeRng((p.seed + 5003) >>> 0);
  const cloud = makePointCloud({
    points: selected.map((index) => candidates.points[index]!),
    normals: selected.map((index) => candidates.normals[index]!),
    attributes: {
      scale: selected.map(() => foliageRng.range(0.32, 0.68)),
      yaw: selected.map(() => foliageRng.range(-Math.PI, Math.PI)),
    },
  });
  const plant = shrub({
    seed: p.seed + 6007,
    height: 0.52,
    stems: 4,
    leafDensity: 4,
    leafSize: 0.1,
  });
  const instanceOptions = {
    scale: pointAttribute("scale", 1),
    yaw: pointAttribute("yaw", 0),
    alignToNormal: false,
  } as const;
  parts.push(
    {
      name: "cliff_brush",
      label: "崖面灌木枝干",
      mesh: copyToPoints(cloud, plant.wood, instanceOptions),
      color: [0.2, 0.13, 0.07],
      surface: { type: "wood", params: { color: [0.2, 0.13, 0.07] } },
    },
    {
      name: "cliff_foliage",
      label: "崖面植被",
      mesh: copyToPoints(cloud, plant.leaves, instanceOptions),
      color: [0.22, 0.38, 0.12],
      surface: {
        type: "foliage",
        params: { color: [0.22, 0.38, 0.12], roughness: 0.8, translucency: 0.25 },
      },
    },
  );
  return parts;
}

function resolveParams(params: Partial<EasyCliffRockParams>): EasyCliffRockParams {
  const p = { ...EASY_CLIFF_ROCK_DEFAULTS, ...params };
  return {
    count: clampInt(p.count, 1, 24),
    height: clamp(p.height, 2, 18),
    radius: clamp(p.radius, 0.5, 3.5),
    spread: clamp(p.spread, p.radius * 2.4, 24),
    blobs: clampInt(p.blobs, 3, 11),
    crag: clamp(p.crag, 0.04, 0.42),
    strata: clampInt(p.strata, 0, 7),
    resolution: clampInt(p.resolution, 20, 56),
    foliageDensity: clamp(p.foliageDensity, 0, 1),
    seed: Math.round(p.seed) >>> 0,
  };
}

function stratify(mesh: Mesh, bands: number): Mesh {
  if (bands <= 0) return mesh;
  const meshBounds = bounds(mesh);
  const span = Math.max(1e-6, meshBounds.max.y - meshBounds.min.y);
  const step = span / Math.max(2, bands * 2);
  const positions = mesh.positions.map((point) => {
    const local = (point.y - meshBounds.min.y) / step;
    const bandY = meshBounds.min.y + Math.round(local) * step;
    return vec3(point.x, point.y + (bandY - point.y) * 0.26, point.z);
  });
  return recomputeNormals({
    positions,
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices: mesh.indices.slice(),
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
