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
import { parallelTransportFrames } from "./frame.js";

/** A curve is just an ordered list of points; helpers below generate them. */
export interface Curve {
  points: Vec3[];
  closed: boolean;
}

export type ControlCurveType = "polyline" | "catmull-rom" | "bezier" | "b-spline";

export type BezierHandleMode = "auto" | "aligned" | "mirrored" | "free" | "corner";

/** Relative handle vectors stored per Bezier anchor. */
export interface BezierControlHandles {
  readonly mode?: BezierHandleMode;
  readonly in?: Vec3;
  readonly out?: Vec3;
}

export interface ControlCurveOptions {
  readonly type?: ControlCurveType;
  readonly closed?: boolean;
  /** Samples generated for each control-point span. */
  readonly subdivisions?: number;
  /** Catmull-Rom tangent scale. 0 makes straight easing; 0.5 is standard. */
  readonly tension?: number;
  /** B-spline degree. Clamped to the available control points. */
  readonly degree?: number;
  /** Per-anchor Bezier handles. Missing handles use automatic tangents. */
  readonly handles?: ReadonlyArray<BezierControlHandles | undefined>;
  /** Rebuild samples at uniform arc-length spacing. */
  readonly arcLength?: boolean;
  /** Point count used by arc-length resampling. Defaults to interpolated count. */
  readonly sampleCount?: number;
  /** Target spacing used when sampleCount is omitted. */
  readonly segmentLength?: number;
}

export function polyline(points: Vec3[], closed = false): Curve {
  return { points: points.map((p) => ({ ...p })), closed };
}

/**
 * Samples editable control points into a render/build curve. The control
 * polygon stays separate from the sampled result, so viewport editing and
 * downstream geometry can use the same interpolation without baking points.
 */
export function controlCurve(
  controlPoints: ReadonlyArray<Vec3>,
  options: ControlCurveOptions = {},
): Curve {
  const points = controlPoints.map((point) => ({ ...point }));
  const closed = options.closed ?? false;
  if (points.length < 2) return { points, closed };

  const type = options.type ?? "catmull-rom";
  const subdivisions = Math.max(1, Math.floor(options.subdivisions ?? 8));
  let curve: Curve;
  if (type === "polyline") curve = { points, closed };
  else if (type === "bezier") {
    curve = sampleBezierControlCurve(points, closed, subdivisions, options.tension ?? 0.5, options.handles);
  } else if (type === "b-spline") {
    curve = sampleBSplineControlCurve(points, closed, subdivisions, options.degree ?? 3);
  } else {
    curve = sampleCatmullRomControlCurve(points, closed, subdivisions, options.tension ?? 0.5);
  }
  if (!options.arcLength || curve.points.length < 2) return curve;
  return resampleCurve(curve, {
    ...(options.sampleCount !== undefined ? { count: options.sampleCount } : {}),
    ...(options.segmentLength !== undefined ? { segmentLength: options.segmentLength } : {}),
    ...options.sampleCount === undefined && options.segmentLength === undefined ? { count: curve.points.length } : {},
  });
}

function sampleCatmullRomControlCurve(
  points: ReadonlyArray<Vec3>,
  closed: boolean,
  subdivisions: number,
  tension: number,
): Curve {
  if (points.length < 3) return { points: points.map((point) => ({ ...point })), closed };
  const out: Vec3[] = [];
  const count = points.length;
  const pointAt = (index: number): Vec3 => closed
    ? points[(index + count) % count]!
    : points[Math.max(0, Math.min(count - 1, index))]!;
  const spans = closed ? count : count - 1;

  for (let span = 0; span < spans; span++) {
    const p0 = pointAt(span - 1);
    const p1 = pointAt(span);
    const p2 = pointAt(span + 1);
    const p3 = pointAt(span + 2);
    const m1 = scale(sub(p2, p0), tension);
    const m2 = scale(sub(p3, p1), tension);
    for (let sample = 0; sample < subdivisions; sample++) {
      out.push(cubicHermite(p1, p2, m1, m2, sample / subdivisions));
    }
  }
  if (!closed) out.push({ ...points[count - 1]! });
  return { points: out, closed };
}

function sampleBezierControlCurve(
  points: ReadonlyArray<Vec3>,
  closed: boolean,
  subdivisions: number,
  tension: number,
  authoredHandles?: ReadonlyArray<BezierControlHandles | undefined>,
): Curve {
  const handles = resolveBezierControlHandles(points, {
    closed,
    tension,
    ...(authoredHandles ? { handles: authoredHandles } : {}),
  });
  const spans = closed ? points.length : points.length - 1;
  const out: Vec3[] = [];
  for (let span = 0; span < spans; span++) {
    const next = (span + 1) % points.length;
    const p0 = points[span]!;
    const p1 = add(p0, handles[span]!.out!);
    const p3 = points[next]!;
    const p2 = add(p3, handles[next]!.in!);
    for (let sample = 0; sample < subdivisions; sample++) {
      out.push(cubicBezierPoint(p0, p1, p2, p3, sample / subdivisions));
    }
  }
  if (!closed) out.push({ ...points[points.length - 1]! });
  return { points: out, closed };
}

export function resolveBezierControlHandles(
  points: ReadonlyArray<Vec3>,
  options: Pick<ControlCurveOptions, "closed" | "tension" | "handles"> = {},
): Array<Required<BezierControlHandles>> {
  const closed = options.closed ?? false;
  const tension = options.tension ?? 0.5;
  const authored = options.handles ?? [];
  const count = points.length;
  const automatic = points.map((point, index) => {
    const previous = closed
      ? points[(index - 1 + count) % count]!
      : points[Math.max(0, index - 1)]!;
    const next = closed
      ? points[(index + 1) % count]!
      : points[Math.min(count - 1, index + 1)]!;
    const endpointScale = !closed && (index === 0 || index === count - 1) ? 2 : 1;
    const tangent = scale(sub(next, previous), tension * endpointScale / 3);
    return { mode: "auto" as const, in: scale(tangent, -1), out: tangent };
  });
  return points.map((_, index) => {
    const source = authored[index];
    const mode = source?.mode ?? "auto";
    if (mode === "auto") return automatic[index]!;
    if (mode === "corner") return { mode, in: vec3(), out: vec3() };
    let incoming = source?.in ? { ...source.in } : { ...automatic[index]!.in };
    let outgoing = source?.out ? { ...source.out } : { ...automatic[index]!.out };
    if (mode === "mirrored") {
      if (source?.out) incoming = negateVec3(outgoing);
      else outgoing = negateVec3(incoming);
    } else if (mode === "aligned") {
      if (source?.out) incoming = alignedOpposite(outgoing, length(incoming));
      else outgoing = alignedOpposite(incoming, length(outgoing));
    }
    return { mode, in: incoming, out: outgoing };
  });
}

function negateVec3(vector: Vec3): Vec3 {
  return vec3(-vector.x || 0, -vector.y || 0, -vector.z || 0);
}

function alignedOpposite(vector: Vec3, targetLength: number): Vec3 {
  const magnitude = length(vector);
  return magnitude > 1e-12 ? scale(vector, -targetLength / magnitude) : vec3();
}

function cubicBezierPoint(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return vec3(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  );
}

function sampleBSplineControlCurve(
  points: ReadonlyArray<Vec3>,
  closed: boolean,
  subdivisions: number,
  requestedDegree: number,
): Curve {
  const degree = Math.max(1, Math.min(Math.floor(requestedDegree), points.length - 1));
  const spanCount = closed ? points.length : Math.max(1, points.length - degree);
  const sampleCount = Math.max(2, spanCount * subdivisions);

  if (closed) {
    const wrapped = [...points, ...points.slice(0, degree)].map((point) => ({ ...point }));
    const knots = Array.from({ length: wrapped.length + degree + 1 }, (_, index) => index);
    const out: Vec3[] = [];
    for (let sample = 0; sample < sampleCount; sample++) {
      const t = degree + (sample / sampleCount) * points.length;
      out.push(deBoor(wrapped, knots, degree, t, Math.min(wrapped.length - 1, Math.floor(t))));
    }
    return { points: out, closed: true };
  }

  const knots = clampedUniformKnots(points.length, degree);
  const out: Vec3[] = [];
  for (let sample = 0; sample <= sampleCount; sample++) {
    const t = sample / sampleCount;
    const span = findKnotSpan(knots, points.length, degree, t);
    out.push(deBoor(points, knots, degree, t, span));
  }
  return { points: out, closed: false };
}

function clampedUniformKnots(controlPointCount: number, degree: number): number[] {
  const knotCount = controlPointCount + degree + 1;
  const interiorCount = controlPointCount - degree - 1;
  return Array.from({ length: knotCount }, (_, index) => {
    if (index <= degree) return 0;
    if (index >= controlPointCount) return 1;
    return (index - degree) / (interiorCount + 1);
  });
}

function findKnotSpan(knots: ReadonlyArray<number>, controlPointCount: number, degree: number, t: number): number {
  if (t >= 1) return controlPointCount - 1;
  for (let span = degree; span < controlPointCount; span++) {
    if (t >= knots[span]! && t < knots[span + 1]!) return span;
  }
  return degree;
}

function deBoor(
  points: ReadonlyArray<Vec3>,
  knots: ReadonlyArray<number>,
  degree: number,
  t: number,
  span: number,
): Vec3 {
  const work = Array.from({ length: degree + 1 }, (_, index) => ({ ...points[span - degree + index]! }));
  for (let level = 1; level <= degree; level++) {
    for (let index = degree; index >= level; index--) {
      const knotIndex = span - degree + index;
      const denominator = knots[knotIndex + degree - level + 1]! - knots[knotIndex]!;
      const alpha = denominator > 1e-12 ? (t - knots[knotIndex]!) / denominator : 0;
      work[index] = lerpVec3(work[index - 1]!, work[index]!, alpha);
    }
  }
  return work[degree]!;
}

function cubicHermite(p0: Vec3, p1: Vec3, m0: Vec3, m1: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return vec3(
    p0.x * h00 + m0.x * h10 + p1.x * h01 + m1.x * h11,
    p0.y * h00 + m0.y * h10 + p1.y * h01 + m1.y * h11,
    p0.z * h00 + m0.z * h10 + p1.z * h01 + m1.z * h11,
  );
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return vec3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t,
  );
}

export type CurveAttributeInterpolation = "linear" | "smooth" | "step";

export interface CurveAttributeKey {
  readonly t: number;
  readonly value: number;
}

export interface CurveAttributeTrack {
  readonly keys: ReadonlyArray<CurveAttributeKey>;
  readonly interpolation?: CurveAttributeInterpolation;
}

export function sampleCurveAttribute(track: CurveAttributeTrack, t: number): number {
  if (track.keys.length === 0) return 0;
  const keys = [...track.keys].sort((a, b) => a.t - b.t);
  const position = Math.max(0, Math.min(1, t));
  if (position <= keys[0]!.t) return keys[0]!.value;
  if (position >= keys[keys.length - 1]!.t) return keys[keys.length - 1]!.value;
  const upper = keys.findIndex((key) => key.t >= position);
  const start = keys[upper - 1]!;
  const end = keys[upper]!;
  if (track.interpolation === "step") return start.value;
  const span = Math.max(1e-12, end.t - start.t);
  let local = (position - start.t) / span;
  if (track.interpolation === "smooth") local = local * local * (3 - 2 * local);
  return start.value + (end.value - start.value) * local;
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
  // Closed loops seal into a torus-like ring (no end caps); the frame closes
  // its seam so the tube meets itself without a twist jump.
  const caps = (opts.caps ?? true) && !curve.closed;
  const n = pts.length;

  // Rotation-minimizing frames (shared module): no twist flips, and closed
  // curves get their holonomy residual distributed for a seamless seam.
  const frames = parallelTransportFrames(pts, { closed: curve.closed });
  const tangents = frames.map((f) => f.tangent);

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  // For a closed loop we emit one extra ring that repeats point 0's frame so
  // the last segment bridges back to the start; the v coordinate spans [0,1].
  const rings = curve.closed ? n + 1 : n;
  const denom = curve.closed ? n : n - 1;
  for (let i = 0; i < rings; i++) {
    const src = curve.closed && i === n ? 0 : i;
    const center = pts[src]!;
    const frame = frames[src]!;
    const r = baseRadius * radiusAt(src / (n - 1));
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * TAU;
      const dir = add(scale(frame.normal, Math.cos(a)), scale(frame.binormal, Math.sin(a)));
      positions.push(add(center, scale(dir, r)));
      normals.push(normalize(dir));
      uvs.push(vec2(i / denom, j / sides));
    }
  }

  const stride = sides + 1;
  for (let i = 0; i < rings - 1; i++) {
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
