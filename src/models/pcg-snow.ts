import type { NamedPart } from "../geometry/export.js";
import { snowCover } from "../geometry/snow.js";
import { cleanMesh } from "../geometry/blast.js";
import { computeNormals, merge, recomputeNormals, type Mesh } from "../geometry/mesh.js";
import { plane } from "../geometry/primitives.js";
import { archetypeRock, type RockArchetype } from "../geometry/rock.js";
import { polyline, sweep } from "../geometry/curve.js";
import { transform } from "../geometry/transform.js";
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeNoise } from "../random/noise.js";

export interface PcgSnowSceneOptions {
  seed?: number;
  size?: number;
  coverage?: number;
  snowDepth?: number;
  treeHeight?: number;
}

interface ResolvedPcgSnowSceneOptions {
  seed: number;
  size: number;
  coverage: number;
  snowDepth: number;
  treeHeight: number;
}

const SOIL: [number, number, number] = [0.31, 0.23, 0.16];
const ROCK: [number, number, number] = [0.43, 0.31, 0.22];
const BARK: [number, number, number] = [0.36, 0.24, 0.14];
const SNOW: [number, number, number] = [0.94, 0.97, 1];

function resolveOptions(options: PcgSnowSceneOptions): ResolvedPcgSnowSceneOptions {
  return {
    seed: (options.seed ?? 23) >>> 0,
    size: Math.max(4, options.size ?? 8),
    coverage: Math.max(0, Math.min(1, options.coverage ?? 0.78)),
    snowDepth: Math.max(0.025, options.snowDepth ?? 0.11),
    treeHeight: Math.max(1.8, options.treeHeight ?? 4.2),
  };
}

function snowSurface(seed: number) {
  return { type: "snow", params: { color: SNOW, roughness: 0.78, scale: 2.4, seed } };
}

function makeGround(size: number, seed: number): Mesh {
  const source = plane(size, size * 0.68, 30, 20);
  const noise = makeNoise(seed);
  const halfX = size * 0.5;
  const halfZ = size * 0.34;
  const positions = source.positions.map((position) => {
    const edge = Math.min(1, Math.max(0, Math.min(
      (halfX - Math.abs(position.x)) / (size * 0.08),
      (halfZ - Math.abs(position.z)) / (size * 0.08),
    )));
    const relief = noise.noise2(position.x * 0.42, position.z * 0.42) * 0.07;
    return vec3(position.x, relief * edge - (1 - edge) * 0.09, position.z);
  });
  return recomputeNormals({
    positions,
    normals: source.normals.slice(),
    uvs: source.uvs.slice(),
    indices: source.indices.slice(),
  });
}

function minY(mesh: Mesh): number {
  let value = Infinity;
  for (const position of mesh.positions) value = Math.min(value, position.y);
  return Number.isFinite(value) ? value : 0;
}

function placeRock(
  kind: RockArchetype,
  seed: number,
  scale: Vec3,
  rotateY: number,
  position: Vec3,
): Mesh {
  const source = archetypeRock(kind, {
    seed,
    radius: 1,
    detail: 3,
    roughness: 0.2,
    flatBase: 0.3,
  });
  const shaped = transform(source, { scale, rotate: vec3(0, rotateY, 0) });
  return transform(shaped, { translate: vec3(position.x, position.y - minY(shaped), position.z) });
}

function branch(points: Vec3[], radius: number): Mesh {
  return sweep(polyline(points), {
    radius,
    sides: 8,
    caps: true,
    radiusAt: (t) => Math.max(0.16, 1 - t * 0.76),
  });
}

function makeDeadTree(base: Vec3, height: number): Mesh {
  const h = height;
  const paths: Array<{ points: Vec3[]; radius: number }> = [
    { radius: h * 0.055, points: [base, vec3(base.x + 0.08, h * 0.42, base.z), vec3(base.x - 0.06, h * 0.73, base.z + 0.04), vec3(base.x + 0.14, h, base.z)] },
    { radius: h * 0.028, points: [vec3(base.x, h * 0.48, base.z), vec3(base.x - h * 0.24, h * 0.68, base.z + h * 0.04), vec3(base.x - h * 0.34, h * 0.88, base.z + h * 0.08)] },
    { radius: h * 0.024, points: [vec3(base.x - 0.03, h * 0.64, base.z), vec3(base.x + h * 0.25, h * 0.76, base.z - h * 0.06), vec3(base.x + h * 0.38, h * 0.92, base.z - h * 0.12)] },
    { radius: h * 0.018, points: [vec3(base.x + h * 0.23, h * 0.76, base.z - h * 0.06), vec3(base.x + h * 0.15, h * 0.95, base.z - h * 0.18)] },
    { radius: h * 0.017, points: [vec3(base.x - h * 0.22, h * 0.68, base.z + h * 0.04), vec3(base.x - h * 0.1, h * 0.87, base.z + h * 0.16)] },
  ];
  return merge(...paths.map((path) => branch(path.points, path.radius)));
}

export function buildPcgSnowSceneParts(options: PcgSnowSceneOptions = {}): NamedPart[] {
  const resolved = resolveOptions(options);
  const ground = makeGround(resolved.size, resolved.seed);
  const rockSpecs: Array<[RockArchetype, Vec3, number, Vec3]> = [
    ["eroded", vec3(1.15, 0.82, 0.92), -0.24, vec3(-1.25, 0.02, -0.2)],
    ["boulder", vec3(1.05, 0.96, 0.9), 0.38, vec3(1.05, 0.02, -0.05)],
    ["strata", vec3(0.76, 0.66, 0.72), -0.52, vec3(2.45, 0.01, 0.5)],
    ["slab", vec3(0.58, 0.42, 0.65), 0.22, vec3(0.2, 0.01, 1.15)],
  ];
  const rocks = rockSpecs.map(([kind, scale, yaw, position], index) =>
    placeRock(kind, resolved.seed + 101 + index * 37, scale, yaw, position),
  );
  const tree = makeDeadTree(vec3(-2.75, 0.02, 1.15), resolved.treeHeight);
  const threshold = 0.64 - resolved.coverage * 0.55;
  const breakup = 0.03 + (1 - resolved.coverage) * 0.16;
  const snowOptions = {
    normalThreshold: threshold,
    breakup,
    noiseScale: 1.15,
    thickness: resolved.snowDepth,
    offset: 0.035,
    roughness: resolved.snowDepth * 0.24,
    seed: resolved.seed + 500,
  };
  const groundSnow = snowCover(ground, {
    ...snowOptions,
    normalThreshold: -0.1,
    breakup: 0.04,
    thickness: resolved.snowDepth * 0.72,
  });
  const rockSnow = rocks.map((rock, index) => snowCover(computeNormals(cleanMesh(rock), 180), {
    ...snowOptions,
    seed: resolved.seed + 600 + index,
  }));
  const treeSnow = snowCover(computeNormals(cleanMesh(tree), 120), {
    ...snowOptions,
    normalThreshold: Math.min(0.72, threshold + 0.18),
    breakup: breakup * 0.55,
    thickness: resolved.snowDepth * 0.38,
    seed: resolved.seed + 700,
  });

  return [
    {
      name: "frozen_ground",
      label: "裸露冻土",
      mesh: ground,
      color: SOIL,
      surface: { type: "soil", params: { color: SOIL, roughness: 0.98, scale: 2.8, seed: resolved.seed } },
    },
    { name: "ground_snow", label: "雪地覆盖", mesh: groundSnow, color: SNOW, surface: snowSurface(resolved.seed + 1) },
    {
      name: "landscape_rocks",
      label: "景观岩石",
      mesh: merge(...rocks),
      color: ROCK,
      surface: { type: "stone", params: { color: ROCK, roughness: 0.94, scale: 1.8, seed: resolved.seed + 2 } },
    },
    { name: "rock_snow", label: "岩石积雪", mesh: merge(...rockSnow), color: SNOW, surface: snowSurface(resolved.seed + 3) },
    {
      name: "dead_tree",
      label: "枯树枝干",
      mesh: tree,
      color: BARK,
      surface: { type: "bark", params: { color: BARK, roughness: 0.94, scale: 2.2, seed: resolved.seed + 4 } },
    },
    { name: "branch_snow", label: "树枝积雪", mesh: treeSnow, color: SNOW, surface: snowSurface(resolved.seed + 5) },
  ];
}
