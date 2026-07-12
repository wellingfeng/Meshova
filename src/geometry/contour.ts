/**
 * Marching squares over Field2D -> contour curves in XZ space.
 * Used for Grasshopper-style contour, laser slicing, terrain bands.
 */
import type { Field2D } from "../field/index.js";
import { sampleField2D } from "../field/index.js";
import { vec3, distance, type Vec3 } from "../math/vec3.js";
import { clamp } from "../math/scalar.js";
import { polyline, type Curve } from "./curve.js";

export interface MarchingSquaresOptions {
  readonly level: number;
  readonly width?: number;
  readonly depth?: number;
  readonly y?: number;
  readonly epsilon?: number;
}

export interface ContourSegment {
  readonly a: Vec3;
  readonly b: Vec3;
}

type EdgeId = 0 | 1 | 2 | 3;

const CASE_SEGMENTS: ReadonlyArray<ReadonlyArray<readonly [EdgeId, EdgeId]>> = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[3, 2], [0, 1]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 3], [1, 2]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[3, 0]],
  [],
];

export function marchingSquaresSegments(
  field: Field2D,
  options: MarchingSquaresOptions,
): ContourSegment[] {
  const level = options.level;
  const width = Math.max(1e-6, options.width ?? 1);
  const depth = Math.max(1e-6, options.depth ?? width);
  const y = options.y ?? 0;
  const eps = Math.max(0, options.epsilon ?? 1e-7);
  if (field.width < 2 || field.height < 2) return [];

  const segments: ContourSegment[] = [];
  for (let gy = 0; gy < field.height - 1; gy++) {
    for (let gx = 0; gx < field.width - 1; gx++) {
      const values = [
        sampleField2D(field, gx, gy),
        sampleField2D(field, gx + 1, gy),
        sampleField2D(field, gx + 1, gy + 1),
        sampleField2D(field, gx, gy + 1),
      ] as const;
      let mask = 0;
      for (let i = 0; i < 4; i++) {
        if (values[i]! >= level) mask |= 1 << i;
      }
      for (const [ea, eb] of CASE_SEGMENTS[mask]!) {
        const a = edgePoint(field, gx, gy, values, ea, level, width, depth, y);
        const b = edgePoint(field, gx, gy, values, eb, level, width, depth, y);
        if (distance(a, b) > eps) segments.push({ a, b });
      }
    }
  }
  return segments;
}

export function marchingSquaresContours(
  field: Field2D,
  options: MarchingSquaresOptions,
): Curve[] {
  const segments = marchingSquaresSegments(field, options);
  const unused = new Set<number>();
  for (let i = 0; i < segments.length; i++) unused.add(i);

  const curves: Curve[] = [];
  while (unused.size > 0) {
    const first = unused.values().next().value as number;
    unused.delete(first);
    const seed = segments[first]!;
    const points: Vec3[] = [seed.a, seed.b];
    let changed = true;
    while (changed) {
      changed = false;
      for (const idx of Array.from(unused)) {
        const s = segments[idx]!;
        const head = points[0]!;
        const tail = points[points.length - 1]!;
        if (samePoint(tail, s.a)) {
          points.push(s.b);
        } else if (samePoint(tail, s.b)) {
          points.push(s.a);
        } else if (samePoint(head, s.b)) {
          points.unshift(s.a);
        } else if (samePoint(head, s.a)) {
          points.unshift(s.b);
        } else {
          continue;
        }
        unused.delete(idx);
        changed = true;
      }
    }
    const closed = points.length > 2 && samePoint(points[0]!, points[points.length - 1]!);
    if (closed) points.pop();
    if (points.length >= 2) curves.push(polyline(points, closed));
  }
  return curves;
}

function edgePoint(
  field: Field2D,
  gx: number,
  gy: number,
  values: readonly [number, number, number, number],
  edge: EdgeId,
  level: number,
  width: number,
  depth: number,
  y: number,
): Vec3 {
  const corners: readonly [readonly [number, number], readonly [number, number]][] = [
    [[gx, gy], [gx + 1, gy]],
    [[gx + 1, gy], [gx + 1, gy + 1]],
    [[gx + 1, gy + 1], [gx, gy + 1]],
    [[gx, gy + 1], [gx, gy]],
  ];
  const ids: readonly [readonly [number, number], readonly [number, number]] = corners[edge]!;
  const valueIds = ([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ] as const)[edge]!;
  const va = values[valueIds[0]]!;
  const vb = values[valueIds[1]]!;
  const t = Math.abs(vb - va) < 1e-9 ? 0.5 : clamp((level - va) / (vb - va), 0, 1);
  const x = ids[0][0]! + (ids[1][0]! - ids[0][0]!) * t;
  const z = ids[0][1]! + (ids[1][1]! - ids[0][1]!) * t;
  return vec3(
    (x / (field.width - 1) - 0.5) * width,
    y,
    (z / (field.height - 1) - 0.5) * depth,
  );
}

function samePoint(a: Vec3, b: Vec3): boolean {
  const q = 1e5;
  return Math.round(a.x * q) === Math.round(b.x * q) &&
    Math.round(a.y * q) === Math.round(b.y * q) &&
    Math.round(a.z * q) === Math.round(b.z * q);
}
