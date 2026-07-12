import { vec2 } from "../math/vec2.js";
import {
  cross,
  dot,
  length,
  normalize,
  sub,
  vec3,
  type Vec3,
} from "../math/vec3.js";
import { fbm3, makeNoise } from "../random/noise.js";
import { makeRng } from "../random/prng.js";
import { solidify } from "../geometry/edit.js";
import type { NamedPart } from "../geometry/export.js";
import { bounds, makeMesh, type Mesh } from "../geometry/mesh.js";
import { poissonScatter } from "../geometry/scatter.js";
import { polygonizeField, type ScalarGrid } from "../geometry/remesh.js";
import { rock } from "../geometry/rock.js";
import { polyline, resampleCurve, smoothCurve } from "../geometry/curve.js";
import { transform } from "../geometry/transform.js";

export interface Ue5PcgCaveOptions {
  seed?: number;
  length?: number;
  width?: number;
  tunnelRadius?: number;
  verticalStretch?: number;
  branchCount?: number;
  irregularity?: number;
  surfaceDetail?: number;
  wallThickness?: number;
  resolution?: number;
  floorRocks?: number;
  wallRocks?: number;
  ceilingRocks?: number;
  color?: [number, number, number];
}

interface ResolvedCaveOptions extends Required<Ue5PcgCaveOptions> {}

interface CaveGridSpec {
  readonly gx: number;
  readonly gy: number;
  readonly gz: number;
  readonly origin: Vec3;
  readonly cell: number;
  readonly max: Vec3;
}

interface CaveSegment {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly radiusA: number;
  readonly radiusB: number;
}

interface CaveSurfaceBuild {
  readonly innerSurface: Mesh;
  readonly grid: CaveGridSpec;
  readonly segmentCount: number;
}

export const UE5_PCG_CAVE_DEFAULTS: Readonly<ResolvedCaveOptions> = {
  seed: 25,
  length: 28,
  width: 20,
  tunnelRadius: 2.35,
  verticalStretch: 1.22,
  branchCount: 2,
  irregularity: 0.42,
  surfaceDetail: 0.12,
  wallThickness: 0.34,
  resolution: 52,
  floorRocks: 28,
  wallRocks: 52,
  ceilingRocks: 16,
  color: [0.24, 0.21, 0.17],
};

function resolveOptions(options: Ue5PcgCaveOptions): ResolvedCaveOptions {
  return {
    seed: (options.seed ?? UE5_PCG_CAVE_DEFAULTS.seed) >>> 0,
    length: Math.max(10, options.length ?? UE5_PCG_CAVE_DEFAULTS.length),
    width: Math.max(8, options.width ?? UE5_PCG_CAVE_DEFAULTS.width),
    tunnelRadius: Math.max(0.8, options.tunnelRadius ?? UE5_PCG_CAVE_DEFAULTS.tunnelRadius),
    verticalStretch: Math.max(0.65, options.verticalStretch ?? UE5_PCG_CAVE_DEFAULTS.verticalStretch),
    branchCount: Math.max(0, Math.min(2, Math.floor(options.branchCount ?? UE5_PCG_CAVE_DEFAULTS.branchCount))),
    irregularity: Math.max(0, options.irregularity ?? UE5_PCG_CAVE_DEFAULTS.irregularity),
    surfaceDetail: Math.max(0, options.surfaceDetail ?? UE5_PCG_CAVE_DEFAULTS.surfaceDetail),
    wallThickness: Math.max(0.05, options.wallThickness ?? UE5_PCG_CAVE_DEFAULTS.wallThickness),
    resolution: Math.max(20, Math.min(80, Math.floor(options.resolution ?? UE5_PCG_CAVE_DEFAULTS.resolution))),
    floorRocks: Math.max(0, Math.floor(options.floorRocks ?? UE5_PCG_CAVE_DEFAULTS.floorRocks)),
    wallRocks: Math.max(0, Math.floor(options.wallRocks ?? UE5_PCG_CAVE_DEFAULTS.wallRocks)),
    ceilingRocks: Math.max(0, Math.floor(options.ceilingRocks ?? UE5_PCG_CAVE_DEFAULTS.ceilingRocks)),
    color: options.color ?? UE5_PCG_CAVE_DEFAULTS.color,
  };
}

function makeGridSpec(cave: ResolvedCaveOptions): CaveGridSpec {
  const cell = cave.length / cave.resolution;
  const ySpan = cave.tunnelRadius * cave.verticalStretch * 2.8 + cave.irregularity * 2;
  const gx = cave.resolution + 1;
  const gy = Math.max(8, Math.round(ySpan / cell) + 1);
  const gz = Math.max(8, Math.round(cave.width / cell) + 1);
  const origin = vec3(-cave.length * 0.5, -ySpan * 0.42, -cave.width * 0.5);
  return {
    gx,
    gy,
    gz,
    origin,
    cell,
    max: vec3(
      origin.x + (gx - 1) * cell,
      origin.y + (gy - 1) * cell,
      origin.z + (gz - 1) * cell,
    ),
  };
}

function buildSegments(cave: ResolvedCaveOptions, grid: CaveGridSpec): CaveSegment[] {
  const rng = makeRng(cave.seed + 17);
  const radiusNoise = makeNoise(cave.seed + 31);
  const zSpan = grid.max.z - grid.origin.z;
  const worldPoint = (x: number, y: number, z: number): Vec3 => vec3(
    x * cave.length,
    y * cave.tunnelRadius,
    grid.origin.z + (z + 0.5) * zSpan,
  );
  const jitter = (point: Vec3, strength = 1): Vec3 => vec3(
    point.x + rng.range(-0.028, 0.028) * cave.length * strength,
    point.y + rng.range(-0.12, 0.12) * cave.tunnelRadius * strength,
    point.z + rng.range(-0.028, 0.028) * zSpan * strength,
  );

  const junctionA = jitter(worldPoint(-0.31, 0.1, -0.18));
  const junctionB = jitter(worldPoint(0.28, -0.04, -0.2));
  const junctionC = jitter(worldPoint(-0.08, 0.08, 0.34));
  const paths: Array<{ points: Vec3[]; radiusScale: number; samples: number }> = [{
    points: [
      worldPoint(-0.5, 0, -0.02),
      junctionA,
      jitter(worldPoint(-0.12, 0.42, -0.29)),
      jitter(worldPoint(0.08, 0.16, -0.25)),
      junctionB,
      worldPoint(0.5, 0.08, 0.04),
    ],
    radiusScale: 1,
    samples: Math.max(18, Math.round(cave.resolution * 0.62)),
  }];

  if (cave.branchCount >= 1) {
    paths.push({
      points: [
        junctionA,
        jitter(worldPoint(-0.34, 0.46, 0.14)),
        junctionC,
        jitter(worldPoint(0.17, 0.22, 0.29)),
        junctionB,
      ],
      radiusScale: 0.86,
      samples: Math.max(16, Math.round(cave.resolution * 0.54)),
    });
  }
  if (cave.branchCount >= 2) {
    paths.push({
      points: [
        junctionC,
        jitter(worldPoint(-0.03, 0.3, 0.43), 0.6),
        vec3(-0.015 * cave.length, cave.tunnelRadius * 0.18, grid.max.z),
      ],
      radiusScale: 0.7,
      samples: Math.max(10, Math.round(cave.resolution * 0.28)),
    });
  }

  const segments: CaveSegment[] = [];
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const path = paths[pathIndex]!;
    const curve = resampleCurve(smoothCurve(polyline(path.points), 6), { count: path.samples });
    const radii = curve.points.map((point, index) => {
      const phase = index / Math.max(1, curve.points.length - 1);
      const variation = radiusNoise.noise3(point.x * 0.11, point.y * 0.17, point.z * 0.11);
      return cave.tunnelRadius * path.radiusScale * (0.92 + variation * 0.1 + Math.sin(phase * Math.PI * 3) * 0.04);
    });
    for (let index = 0; index < curve.points.length - 1; index++) {
      segments.push({
        a: curve.points[index]!,
        b: curve.points[index + 1]!,
        radiusA: radii[index]!,
        radiusB: radii[index + 1]!,
      });
    }
  }
  return segments;
}

function segmentDistance(point: Vec3, segment: CaveSegment, verticalStretch: number): number {
  const scaledPoint = vec3(point.x, point.y / verticalStretch, point.z);
  const scaledA = vec3(segment.a.x, segment.a.y / verticalStretch, segment.a.z);
  const scaledB = vec3(segment.b.x, segment.b.y / verticalStretch, segment.b.z);
  const ab = sub(scaledB, scaledA);
  const denominator = dot(ab, ab);
  const t = denominator > 1e-12
    ? Math.max(0, Math.min(1, dot(sub(scaledPoint, scaledA), ab) / denominator))
    : 0;
  const closest = vec3(
    scaledA.x + ab.x * t,
    scaledA.y + ab.y * t,
    scaledA.z + ab.z * t,
  );
  const radius = segment.radiusA + (segment.radiusB - segment.radiusA) * t;
  return length(sub(scaledPoint, closest)) - radius;
}

function buildInnerSurface(cave: ResolvedCaveOptions): CaveSurfaceBuild {
  const grid = makeGridSpec(cave);
  const segments = buildSegments(cave, grid);
  const coarseNoise = makeNoise(cave.seed + 101);
  const detailNoise = makeNoise(cave.seed + 211);
  const values = new Float64Array(grid.gx * grid.gy * grid.gz);
  const indexOf = (x: number, y: number, z: number): number => (z * grid.gy + y) * grid.gx + x;

  for (let z = 0; z < grid.gz; z++) {
    const pz = grid.origin.z + z * grid.cell;
    for (let y = 0; y < grid.gy; y++) {
      const py = grid.origin.y + y * grid.cell;
      for (let x = 0; x < grid.gx; x++) {
        const point = vec3(grid.origin.x + x * grid.cell, py, pz);
        let distance = Infinity;
        for (const segment of segments) {
          distance = Math.min(distance, segmentDistance(point, segment, cave.verticalStretch));
        }
        const coarse = fbm3(
          coarseNoise,
          point.x * 0.16,
          point.y * 0.2,
          point.z * 0.16,
          { octaves: 4, gain: 0.52 },
        );
        const detail = fbm3(
          detailNoise,
          point.x * 0.72,
          point.y * 0.8,
          point.z * 0.72,
          { octaves: 3, gain: 0.46 },
        );
        values[indexOf(x, y, z)] = distance + coarse * cave.irregularity + detail * cave.surfaceDetail;
      }
    }
  }

  const scalarGrid: ScalarGrid = {
    gx: grid.gx,
    gy: grid.gy,
    gz: grid.gz,
    origin: grid.origin,
    cell: grid.cell,
    values,
  };
  return {
    innerSurface: polygonizeField(scalarGrid, { iso: 0, flip: true }),
    grid,
    segmentCount: segments.length,
  };
}

function withTriplanarUV(mesh: Mesh, density: number): Mesh {
  return makeMesh({
    positions: mesh.positions.slice(),
    normals: mesh.normals.slice(),
    uvs: mesh.positions.map((point, index) => {
      const normal = mesh.normals[index]!;
      const ax = Math.abs(normal.x);
      const ay = Math.abs(normal.y);
      const az = Math.abs(normal.z);
      if (ax >= ay && ax >= az) return vec2(point.z * density, point.y * density);
      if (ay >= ax && ay >= az) return vec2(point.x * density, point.z * density);
      return vec2(point.x * density, point.y * density);
    }),
    indices: mesh.indices.slice(),
  });
}

function triangleSubset(mesh: Mesh, predicate: (normal: Vec3) => boolean): Mesh {
  const indices: number[] = [];
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const ia = mesh.indices[index]!;
    const ib = mesh.indices[index + 1]!;
    const ic = mesh.indices[index + 2]!;
    const a = mesh.positions[ia]!;
    const b = mesh.positions[ib]!;
    const c = mesh.positions[ic]!;
    const face = cross(sub(b, a), sub(c, a));
    if (length(face) > 1e-9 && predicate(normalize(face))) indices.push(ia, ib, ic);
  }
  return makeMesh({
    positions: mesh.positions.slice(),
    normals: mesh.normals.slice(),
    uvs: mesh.uvs.slice(),
    indices,
  });
}

function anchoredRock(seed: number, radius: number, stretch: Vec3): Mesh {
  const mesh = rock({
    seed,
    radius,
    detail: 1,
    lumpiness: 0.38,
    roughness: 0.14,
    stretch,
    flatBase: 0.42,
    cusp: 24,
  });
  return transform(mesh, { translate: vec3(0, -bounds(mesh).min.y, 0) });
}

export function buildUe5PcgCaveMesh(options: Ue5PcgCaveOptions = {}): Mesh {
  const cave = resolveOptions(options);
  const surface = buildInnerSurface(cave).innerSurface;
  return withTriplanarUV(solidify(surface, { thickness: cave.wallThickness, offset: 0 }), 0.38);
}

export function buildUe5PcgCaveParts(options: Ue5PcgCaveOptions = {}): NamedPart[] {
  const cave = resolveOptions(options);
  const built = buildInnerSurface(cave);
  const shell = withTriplanarUV(
    solidify(built.innerSurface, { thickness: cave.wallThickness, offset: 0 }),
    0.38,
  );
  const floor = triangleSubset(built.innerSurface, (normal) => normal.y > 0.48);
  const ceiling = triangleSubset(built.innerSurface, (normal) => normal.y < -0.42);
  const walls = triangleSubset(built.innerSurface, (normal) => normal.y >= -0.48 && normal.y <= 0.52);
  const parts: NamedPart[] = [{
    name: "caveShell",
    label: "洞穴岩壁",
    mesh: shell,
    color: cave.color,
    surface: { type: "stone", params: { color: cave.color, roughness: 0.97, scale: 2.4 } },
    metadata: {
      generator: "ue5-pcg-cave",
      sourceVideo: "BV1e9bazqE25",
      method: "spline-network-sdf-marching-cubes-solidify",
      branchCount: cave.branchCount,
      segmentCount: built.segmentCount,
    },
  }];

  if (cave.floorRocks > 0 && floor.indices.length > 0) {
    parts.push({
      name: "floorRocks",
      label: "洞底碎岩",
      mesh: poissonScatter(
        floor,
        anchoredRock(cave.seed + 401, cave.tunnelRadius * 0.24, vec3(1.2, 0.42, 0.95)),
        {
          count: cave.floorRocks,
          seed: cave.seed + 402,
          candidates: 8,
          scaleRange: [0.45, 1.25],
          randomYaw: true,
          alignToNormal: true,
        },
      ),
      color: [cave.color[0] * 0.82, cave.color[1] * 0.84, cave.color[2] * 0.86],
      surface: { type: "stone", params: { color: cave.color, roughness: 0.98, scale: 2.1 } },
      metadata: { generator: "pcg-surface-scatter", instanceCount: cave.floorRocks },
    });
  }
  if (cave.wallRocks > 0 && walls.indices.length > 0) {
    parts.push({
      name: "wallRocks",
      label: "洞壁岩块",
      mesh: poissonScatter(
        walls,
        anchoredRock(cave.seed + 501, cave.tunnelRadius * 0.2, vec3(1.15, 0.3, 0.86)),
        {
          count: cave.wallRocks,
          seed: cave.seed + 502,
          candidates: 7,
          scaleRange: [0.38, 1.08],
          randomYaw: true,
          alignToNormal: true,
        },
      ),
      color: [cave.color[0] * 0.9, cave.color[1] * 0.91, cave.color[2] * 0.92],
      surface: { type: "stone", params: { color: cave.color, roughness: 0.97, scale: 2.3 } },
      metadata: { generator: "pcg-surface-scatter", instanceCount: cave.wallRocks },
    });
  }
  if (cave.ceilingRocks > 0 && ceiling.indices.length > 0) {
    parts.push({
      name: "ceilingRocks",
      label: "顶部垂岩",
      mesh: poissonScatter(
        ceiling,
        anchoredRock(cave.seed + 601, cave.tunnelRadius * 0.18, vec3(0.62, 1.55, 0.62)),
        {
          count: cave.ceilingRocks,
          seed: cave.seed + 602,
          candidates: 8,
          scaleRange: [0.45, 1.18],
          randomYaw: true,
          alignToNormal: true,
        },
      ),
      color: [cave.color[0] * 0.76, cave.color[1] * 0.78, cave.color[2] * 0.8],
      surface: { type: "stone", params: { color: cave.color, roughness: 0.98, scale: 2 } },
      metadata: { generator: "pcg-surface-scatter", instanceCount: cave.ceilingRocks },
    });
  }
  return parts;
}
