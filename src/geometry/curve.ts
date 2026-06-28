/**
 * Curve system (P12): polyline/Bezier/helix curves plus a sweep that builds a
 * tube mesh along a curve using parallel-transport frames (stable, no twist
 * flips). Enables pipes, ropes, vines, cables — a whole new model category.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, cross, normalize, length, dot } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import type { Mesh } from "./mesh.js";
import { makeMesh } from "./mesh.js";

/** A curve is just an ordered list of points; helpers below generate them. */
export interface Curve {
  points: Vec3[];
  closed: boolean;
}

export function polyline(points: Vec3[], closed = false): Curve {
  return { points: points.map((p) => ({ ...p })), closed };
}

/** Total arc length of a curve (sum of segment lengths; wraps if closed). */
export function curveLength(curve: Curve): number {
  const pts = curve.points;
  if (pts.length < 2) return 0;
  let total = 0;
  const last = curve.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    total += length(sub(pts[(i + 1) % pts.length]!, pts[i]!));
  }
  return total;
}

/**
 * Resample a curve into evenly-spaced points by arc length (Houdini `resample`).
 * This is the key pre-step for clean sweeps/extrudes: it removes uneven point
 * density so downstream tubes/profiles are uniform. Pass `count` for a fixed
 * point count, or `segmentLength` to target a real-world spacing.
 */
export function resampleCurve(
  curve: Curve,
  opts: { count?: number; segmentLength?: number } = {},
): Curve {
  const pts = curve.points;
  if (pts.length < 2) return polyline(pts, curve.closed);

  const total = curveLength(curve);
  if (total <= 0) return polyline(pts, curve.closed);

  let count = opts.count;
  if (count == null) {
    const seg = opts.segmentLength && opts.segmentLength > 0 ? opts.segmentLength : total / 16;
    count = Math.max(2, Math.round(total / seg) + (curve.closed ? 0 : 1));
  }
  count = Math.max(2, Math.floor(count));

  // Cumulative arc length at each source point.
  const span = curve.closed ? pts.length : pts.length - 1;
  const cum: number[] = [0];
  for (let i = 0; i < span; i++) {
    cum.push(cum[i]! + length(sub(pts[(i + 1) % pts.length]!, pts[i]!)));
  }

  const out: Vec3[] = [];
  const divisor = curve.closed ? count : count - 1;
  for (let i = 0; i < count; i++) {
    const target = (i / divisor) * total;
    // Find the segment containing `target`.
    let seg = 0;
    while (seg < cum.length - 1 && cum[seg + 1]! < target) seg++;
    const segLen = cum[seg + 1]! - cum[seg]!;
    const t = segLen > 1e-9 ? (target - cum[seg]!) / segLen : 0;
    const a = pts[seg % pts.length]!;
    const b = pts[(seg + 1) % pts.length]!;
    out.push(add(a, scale(sub(b, a), t)));
  }
  return polyline(out, curve.closed);
}

/** Cubic Bezier sampled into `segments` points. */
export function bezier(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  segments = 32,
): Curve {
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    pts.push(
      vec3(
        a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        a * p0.y + b * p1.y + c * p2.y + d * p3.y,
        a * p0.z + b * p1.z + c * p2.z + d * p3.z,
      ),
    );
  }
  return { points: pts, closed: false };
}

export interface HelixOptions {
  radius?: number;
  height?: number;
  turns?: number;
  segments?: number;
}

/** Helix/spiral around the Y axis. */
export function helix(opts: HelixOptions = {}): Curve {
  const radius = opts.radius ?? 0.5;
  const height = opts.height ?? 1;
  const turns = opts.turns ?? 3;
  const segments = opts.segments ?? 96;
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = t * turns * TAU;
    pts.push(vec3(Math.cos(a) * radius, t * height - height / 2, Math.sin(a) * radius));
  }
  return { points: pts, closed: false };
}

/** Catmull-Rom smoothing: resample a polyline through its points smoothly. */
export function smoothCurve(curve: Curve, subdivisions = 8): Curve {
  const p = curve.points;
  if (p.length < 3) return { points: p.map((q) => ({ ...q })), closed: curve.closed };
  const out: Vec3[] = [];
  const n = p.length;
  const get = (i: number): Vec3 => {
    if (curve.closed) return p[(i + n) % n]!;
    return p[Math.max(0, Math.min(n - 1, i))]!;
  };
  const last = curve.closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      // Catmull-Rom basis
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * ((2 * b) + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push(vec3(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y), c(p0.z, p1.z, p2.z, p3.z)));
    }
  }
  if (!curve.closed) out.push({ ...p[n - 1]! });
  return { points: out, closed: curve.closed };
}

export interface SweepOptions {
  radius?: number;
  /** Ring resolution around the tube. */
  sides?: number;
  /** Per-point radius function (0..1 along curve) for tapering. */
  radiusAt?: (t: number) => number;
  caps?: boolean;
}

/**
 * Sweep a circular cross-section along a curve, producing a tube mesh. Uses
 * parallel-transport frames so the tube doesn't twist erratically.
 */
export function sweep(curve: Curve, opts: SweepOptions = {}): Mesh {
  const pts = curve.points;
  if (pts.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const baseRadius = opts.radius ?? 0.1;
  const sides = Math.max(3, Math.floor(opts.sides ?? 12));
  const radiusAt = opts.radiusAt ?? (() => 1);
  const caps = opts.caps ?? true;
  const n = pts.length;

  // Tangents.
  const tangents: Vec3[] = pts.map((_, i) => {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    return normalize(sub(next, prev));
  });

  // Parallel-transport an initial normal along the curve.
  let normalRef = pickPerpendicular(tangents[0]!);
  const frames: { normal: Vec3; binormal: Vec3 }[] = [];
  for (let i = 0; i < n; i++) {
    const t = tangents[i]!;
    // project normalRef onto plane perpendicular to t
    normalRef = normalize(sub(normalRef, scale(t, dot(normalRef, t))));
    if (length(normalRef) < 1e-5) normalRef = pickPerpendicular(t);
    const binormal = normalize(cross(t, normalRef));
    frames.push({ normal: normalRef, binormal });
    // rotate normalRef toward next tangent for next iteration
    if (i < n - 1) {
      const tNext = tangents[i + 1]!;
      const axis = cross(t, tNext);
      const axisLen = length(axis);
      if (axisLen > 1e-6) {
        const angle = Math.asin(Math.min(1, axisLen));
        normalRef = rotateAroundAxis(normalRef, scale(axis, 1 / axisLen), angle);
      }
    }
  }

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const center = pts[i]!;
    const frame = frames[i]!;
    const r = baseRadius * radiusAt(i / (n - 1));
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * TAU;
      const dir = add(scale(frame.normal, Math.cos(a)), scale(frame.binormal, Math.sin(a)));
      positions.push(add(center, scale(dir, r)));
      normals.push(normalize(dir));
      uvs.push(vec2(i / (n - 1), j / sides));
    }
  }

  const stride = sides + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  if (caps) {
    addCap(positions, normals, uvs, indices, pts[0]!, tangents[0]!, frames[0]!, baseRadius * radiusAt(0), sides, false);
    addCap(positions, normals, uvs, indices, pts[n - 1]!, tangents[n - 1]!, frames[n - 1]!, baseRadius * radiusAt(1), sides, true);
  }

  return makeMesh({ positions, normals, uvs, indices });
}

function pickPerpendicular(t: Vec3): Vec3 {
  const ax = Math.abs(t.x), ay = Math.abs(t.y), az = Math.abs(t.z);
  const other = ax < ay && ax < az ? vec3(1, 0, 0) : ay < az ? vec3(0, 1, 0) : vec3(0, 0, 1);
  return normalize(cross(t, other));
}

function rotateAroundAxis(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(
    add(scale(v, c), scale(cross(axis, v), s)),
    scale(axis, dot(axis, v) * (1 - c)),
  );
}

function addCap(
  positions: Vec3[], normals: Vec3[], uvs: { x: number; y: number }[], indices: number[],
  center: Vec3, tangent: Vec3, frame: { normal: Vec3; binormal: Vec3 }, r: number,
  sides: number, end: boolean,
) {
  const nrm = end ? tangent : scale(tangent, -1);
  const c = positions.length;
  positions.push({ ...center });
  normals.push(nrm);
  uvs.push(vec2(0.5, 0.5));
  const ringStart = positions.length;
  for (let j = 0; j <= sides; j++) {
    const a = (j / sides) * TAU;
    const dir = add(scale(frame.normal, Math.cos(a)), scale(frame.binormal, Math.sin(a)));
    positions.push(add(center, scale(dir, r)));
    normals.push(nrm);
    uvs.push(vec2(Math.cos(a) * 0.5 + 0.5, Math.sin(a) * 0.5 + 0.5));
  }
  for (let j = 0; j < sides; j++) {
    const a = ringStart + j;
    if (end) indices.push(c, a, a + 1);
    else indices.push(c, a + 1, a);
  }
}
