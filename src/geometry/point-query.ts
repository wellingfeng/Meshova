/**
 * Point-cloud query layer — Meshova's port of the CitySample RuleProcessor
 * "PointCloudQuery / SQL" idea. A PointCloud already carries arbitrary named
 * attribute columns; this module gives that data the *query* powers the UE
 * plugin gets from its SQLite store, but purely in-memory and deterministic:
 *
 *   - where      filter rows by a predicate (a WHERE clause)
 *   - selectRows pull rows out as plain records (a SELECT)
 *   - aggregate  count / sum / min / max / mean over one column
 *   - bounds     the XZ/XYZ bounding box of the live points
 *   - groupBy    bucket points by a key field into sub-clouds
 *   - partition  split into Inside/Outside by a predicate (the FILTER split
 *                that the SliceAndDice rule tree is built around)
 *   - histogram  bucket a column into N bins (density inspection)
 *
 * Everything returns new clouds/values and never mutates the input, matching the
 * immutability convention. These are the read-side companions to the write-side
 * ScatterRule chain: rules decorate, queries inspect and slice.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import {
  makePointCloud,
  pointContext,
  evalPointScalar,
  type PointCloud,
  type PointContext,
  type PointScalar,
} from "./point-cloud.js";

/** A single point exposed as a flat record: index, x/y/z, and every attribute. */
export interface PointRow {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly [attr: string]: number;
}

/** Materialize one point as a flat row (position + all attribute columns). */
export function pointRow(pc: PointCloud, index: number): PointRow {
  const p = pc.points[index]!;
  const row: Record<string, number> = { index, x: p.x, y: p.y, z: p.z };
  for (const [name, values] of Object.entries(pc.attributes)) {
    row[name] = values[index] ?? 0;
  }
  return row as PointRow;
}

/**
 * SELECT: return the kept points as flat records. Optional predicate acts as a
 * WHERE clause. Handy for the AI loop to read back "what did my scatter place".
 */
export function selectRows(
  pc: PointCloud,
  predicate?: (ctx: PointContext) => boolean,
): PointRow[] {
  const out: PointRow[] = [];
  for (let i = 0; i < pc.points.length; i++) {
    if (predicate && !predicate(pointContext(pc, i))) continue;
    out.push(pointRow(pc, i));
  }
  return out;
}

/** WHERE: keep only points passing the predicate, carrying all attributes. */
export function where(
  pc: PointCloud,
  predicate: (ctx: PointContext) => boolean,
): PointCloud {
  const keep: number[] = [];
  for (let i = 0; i < pc.points.length; i++) {
    if (predicate(pointContext(pc, i))) keep.push(i);
  }
  return gatherPoints(pc, keep);
}

/** Rebuild a cloud from a list of source indices (compacting all attributes). */
export function gatherPoints(pc: PointCloud, indices: ReadonlyArray<number>): PointCloud {
  const attributes: Record<string, number[]> = {};
  for (const [name, values] of Object.entries(pc.attributes)) {
    attributes[name] = indices.map((i) => values[i] ?? 0);
  }
  return makePointCloud({
    points: indices.map((i) => pc.points[i]!),
    normals: indices.map((i) => pc.normals[i]!),
    attributes,
  });
}

// ---------------------------------------------------------------------------
// Aggregates — reductions over one column (a scalar field or attribute name).
// ---------------------------------------------------------------------------

export interface Aggregate {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
}

/**
 * Reduce a scalar field (attribute name via pointAttribute, a constant, or a
 * (ctx)=>number) over the whole cloud. Empty clouds report zeros with +/-Inf
 * bounds collapsed to 0. This is the GROUP-less aggregate (COUNT/SUM/AVG/...).
 */
export function aggregate(pc: PointCloud, field: PointScalar): Aggregate {
  const n = pc.points.length;
  if (n === 0) return { count: 0, sum: 0, min: 0, max: 0, mean: 0 };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = evalPointScalar(field, pointContext(pc, i));
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { count: n, sum, min, max, mean: sum / n };
}

/** Axis-aligned bounds of the live points (empty cloud -> zero box at origin). */
export interface PointBounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
}

export function pointCloudBounds(pc: PointCloud): PointBounds {
  if (pc.points.length === 0) {
    return { min: vec3(0, 0, 0), max: vec3(0, 0, 0), center: vec3(0, 0, 0), size: vec3(0, 0, 0) };
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of pc.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }
  const min = vec3(minX, minY, minZ);
  const max = vec3(maxX, maxY, maxZ);
  return {
    min,
    max,
    center: vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
    size: vec3(maxX - minX, maxY - minY, maxZ - minZ),
  };
}

/**
 * GROUP BY: bucket points into sub-clouds keyed by a scalar field. The key is
 * floored to an integer (so a "variant" attribute or a rounded coordinate makes
 * a clean bucket). Returns a Map from integer key to a compacted PointCloud.
 * Insertion order of keys follows first appearance (deterministic).
 */
export function groupBy(pc: PointCloud, keyField: PointScalar): Map<number, PointCloud> {
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < pc.points.length; i++) {
    const key = Math.floor(evalPointScalar(keyField, pointContext(pc, i)));
    const b = buckets.get(key);
    if (b) b.push(i);
    else buckets.set(key, [i]);
  }
  const out = new Map<number, PointCloud>();
  for (const [key, indices] of buckets) out.set(key, gatherPoints(pc, indices));
  return out;
}

/**
 * PARTITION (the SliceAndDice FILTER split): divide the cloud into two clouds by
 * a predicate — `inside` (passes) and `outside` (fails). This is the exact shape
 * of a UPointCloudRule FILTER node, which feeds each half to a different subrule.
 */
export function partition(
  pc: PointCloud,
  predicate: (ctx: PointContext) => boolean,
): { inside: PointCloud; outside: PointCloud } {
  const inside: number[] = [];
  const outside: number[] = [];
  for (let i = 0; i < pc.points.length; i++) {
    (predicate(pointContext(pc, i)) ? inside : outside).push(i);
  }
  return { inside: gatherPoints(pc, inside), outside: gatherPoints(pc, outside) };
}

/**
 * Histogram a scalar column into `bins` equal-width buckets across its observed
 * [min,max] range. Returns bucket counts plus the range used. Useful to inspect
 * density/scale distributions in the AI feedback loop.
 */
export function histogram(
  pc: PointCloud,
  field: PointScalar,
  bins = 10,
): { counts: number[]; min: number; max: number; binWidth: number } {
  const n = Math.max(1, Math.floor(bins));
  const agg = aggregate(pc, field);
  const counts = new Array<number>(n).fill(0);
  const range = agg.max - agg.min;
  if (range <= 0) {
    counts[0] = agg.count;
    return { counts, min: agg.min, max: agg.max, binWidth: 0 };
  }
  const binWidth = range / n;
  for (let i = 0; i < pc.points.length; i++) {
    const v = evalPointScalar(field, pointContext(pc, i));
    let idx = Math.floor((v - agg.min) / binWidth);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;
    counts[idx]!++;
  }
  return { counts, min: agg.min, max: agg.max, binWidth };
}
