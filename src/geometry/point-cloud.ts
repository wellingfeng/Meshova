/**
 * Point cloud domain. This is the missing middle layer between selection /
 * scatter and realized meshes: points can carry id, scale, yaw, variant, masks,
 * then later drive copy-to-points or other operators.
 */
import type { Vec3 } from "../math/vec3.js";
import { add, cross, length, normalize, scale, sub, vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import type { Mesh } from "./mesh.js";

export interface PointCloud {
  readonly points: ReadonlyArray<Vec3>;
  readonly normals: ReadonlyArray<Vec3>;
  readonly attributes: Readonly<Record<string, number[]>>;
}

export interface PointCloudData {
  readonly points: ReadonlyArray<Vec3>;
  readonly normals?: ReadonlyArray<Vec3>;
  readonly attributes?: Readonly<Record<string, ReadonlyArray<number>>>;
}

export interface PointContext {
  readonly index: number;
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly attributes: Readonly<Record<string, number[]>>;
}

export type PointScalar = number | ((ctx: PointContext) => number);

export function makePointCloud(data: PointCloudData): PointCloud {
  const points = data.points.map((p) => ({ ...p }));
  const normals = data.normals
    ? data.normals.map((n) => normalize(n))
    : points.map(() => vec3(0, 1, 0));
  if (normals.length !== points.length) {
    throw new Error(`normals length ${normals.length} != points length ${points.length}`);
  }
  const attributes: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(data.attributes ?? {})) {
    if (values.length !== points.length) {
      throw new Error(`attribute "${name}" length ${values.length} != points length ${points.length}`);
    }
    attributes[name] = values.slice();
  }
  return { points, normals, attributes };
}

export function pointCount(pc: PointCloud): number {
  return pc.points.length;
}

export function pointContext(pc: PointCloud, index: number): PointContext {
  return {
    index,
    point: pc.points[index]!,
    normal: pc.normals[index]!,
    attributes: pc.attributes,
  };
}

export function evalPointScalar(field: PointScalar, ctx: PointContext): number {
  return typeof field === "function" ? field(ctx) : field;
}

export function pointAttribute(name: string, fallback = 0): PointScalar {
  return (ctx) => ctx.attributes[name]?.[ctx.index] ?? fallback;
}

export function storePointAttribute(
  pc: PointCloud,
  name: string,
  field: PointScalar,
): PointCloud {
  const values = pc.points.map((_, i) => evalPointScalar(field, pointContext(pc, i)));
  return makePointCloud({
    points: pc.points,
    normals: pc.normals,
    attributes: { ...pc.attributes, [name]: values },
  });
}

export function filterPoints(
  pc: PointCloud,
  field: PointScalar,
  threshold = 0.5,
): PointCloud {
  const keep: number[] = [];
  for (let i = 0; i < pc.points.length; i++) {
    if (evalPointScalar(field, pointContext(pc, i)) >= threshold) keep.push(i);
  }
  const attributes: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(pc.attributes)) {
    attributes[name] = keep.map((i) => values[i] ?? 0);
  }
  return makePointCloud({
    points: keep.map((i) => pc.points[i]!),
    normals: keep.map((i) => pc.normals[i]!),
    attributes,
  });
}

export interface SurfacePointCloudOptions {
  readonly count: number;
  readonly seed?: number;
}

export interface PoissonPointCloudOptions extends SurfacePointCloudOptions {
  /** Candidates per accepted point; higher = better spacing, slower. */
  readonly candidates?: number;
}

interface SurfaceSample {
  point: Vec3;
  normal: Vec3;
  triangle: number;
  u: number;
  v: number;
}

interface AreaTable {
  cumulative: Float64Array;
  total: number;
}

/** Uniform random surface samples, stored as a point cloud with id/tri/u/v attrs. */
export function surfacePointCloud(
  target: Mesh,
  opts: SurfacePointCloudOptions,
): PointCloud {
  const count = Math.max(0, Math.floor(opts.count));
  const table = buildAreaTable(target);
  if (count === 0 || table.total === 0) return makePointCloud({ points: [] });
  const rng = makeRng(opts.seed ?? 0);
  const samples: SurfaceSample[] = [];
  for (let i = 0; i < count; i++) samples.push(sampleSurface(target, table, rng));
  return pointCloudFromSurfaceSamples(samples);
}

/** Blue-noise surface samples using Mitchell best-candidate sampling. */
export function poissonPointCloud(
  target: Mesh,
  opts: PoissonPointCloudOptions,
): PointCloud {
  const count = Math.max(0, Math.floor(opts.count));
  const table = buildAreaTable(target);
  if (count === 0 || table.total === 0) return makePointCloud({ points: [] });
  const rng = makeRng(opts.seed ?? 0);
  const candidates = Math.max(1, Math.floor(opts.candidates ?? 8));
  const accepted: SurfaceSample[] = [];
  for (let i = 0; i < count; i++) {
    let best: SurfaceSample | null = null;
    let bestDist = -1;
    const tries = accepted.length === 0 ? 1 : candidates;
    for (let c = 0; c < tries; c++) {
      const cand = sampleSurface(target, table, rng);
      let minD = Infinity;
      for (const a of accepted) {
        const d = length(sub(cand.point, a.point));
        if (d < minD) minD = d;
      }
      if (minD > bestDist) {
        bestDist = minD;
        best = cand;
      }
    }
    if (best) accepted.push(best);
  }
  return pointCloudFromSurfaceSamples(accepted);
}

function buildAreaTable(target: Mesh): AreaTable {
  const triCount = target.indices.length / 3;
  const cumulative = new Float64Array(triCount);
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const a = target.positions[target.indices[t * 3]!]!;
    const b = target.positions[target.indices[t * 3 + 1]!]!;
    const c = target.positions[target.indices[t * 3 + 2]!]!;
    total += length(cross(sub(b, a), sub(c, a))) * 0.5;
    cumulative[t] = total;
  }
  return { cumulative, total };
}

function sampleSurface(target: Mesh, table: AreaTable, rng: Rng): SurfaceSample {
  const r = rng.next() * table.total;
  let lo = 0;
  let hi = table.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table.cumulative[mid]! < r) lo = mid + 1;
    else hi = mid;
  }
  const t = lo;
  const a = target.positions[target.indices[t * 3]!]!;
  const b = target.positions[target.indices[t * 3 + 1]!]!;
  const c = target.positions[target.indices[t * 3 + 2]!]!;
  let u = rng.next();
  let v = rng.next();
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  const point = add(add(a, scale(sub(b, a), u)), scale(sub(c, a), v));
  const normal = normalize(cross(sub(b, a), sub(c, a)));
  return { point, normal, triangle: t, u, v };
}

function pointCloudFromSurfaceSamples(samples: ReadonlyArray<SurfaceSample>): PointCloud {
  return makePointCloud({
    points: samples.map((s) => s.point),
    normals: samples.map((s) => s.normal),
    attributes: {
      id: samples.map((_, i) => i),
      tri: samples.map((s) => s.triangle),
      u: samples.map((s) => s.u),
      v: samples.map((s) => s.v),
    },
  });
}
