/**
 * Race-track toolkit (P-track). Three curve-driven algorithms distilled from the
 * Houdini "Procedural Race Tracks" pattern — reimplemented from scratch:
 *
 *   1. bankedFrames    — parallel-transport frames rolled by local curvature so
 *                        the road surface leans into corners (Houdini Auto-Bank).
 *   2. trackSurface    — sweep a road cross-section (with optional coving skirts
 *                        that flare down to meet terrain) along a curve.
 *   3. instanceAlongCurve — resample a curve to a fixed spacing and stamp a mesh
 *                        (guard rails, cones, tyre stacks) at every step.
 *
 * All deterministic, immutable-mesh, no host globals. Frames reuse the shared
 * parallel-transport helper; instancing reuses the point-cloud / copyToPoints
 * layer so the whole thing stays inside the existing kernel.
 */
import type { Vec3 } from "../math/vec3.js";
import { add, cross, dot, length, normalize, scale, sub, vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { vec2 } from "../math/vec2.js";
import { clamp } from "../math/scalar.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, merge, recomputeNormals } from "./mesh.js";
import type { Curve } from "./curve.js";
import { resampleCurve } from "./curve.js";
import { parallelTransportFrames, rotateAroundAxis, type TransportFrame } from "./frame.js";
import { makePointCloud } from "./point-cloud.js";
import { copyToPoints } from "./instance.js";

// ---------------------------------------------------------------------------
// 1. Auto-Bank — roll frames by local signed curvature.
// ---------------------------------------------------------------------------

export interface BankedFrameOptions {
  /**
   * Bank strength: multiplies the curvature-derived lean angle. 0 = flat road,
   * ~1 = natural race-track banking, higher = arcade over-tilt. Default 1.
   */
  factor?: number;
  /** Hard cap on the bank angle in radians (safety clamp). Default 0.6 (~34°). */
  maxAngle?: number;
  /**
   * Smoothing passes over the per-point bank angle so the road doesn't snap
   * between segments. Default 2.
   */
  smooth?: number;
  /** Seed "up" reference for the first frame. Default world +Y. */
  up?: Vec3;
}

/**
 * Build frames whose normal ("up") is rolled about the tangent by an angle
 * proportional to the local signed curvature — the road banks into corners.
 *
 * Signed curvature comes from the turn direction of consecutive tangents about
 * the reference up-vector: turning left banks one way, right the other, so the
 * outer edge of the corner rises. Straights (near-zero curvature) stay flat.
 */
export function bankedFrames(curve: Curve, opts: BankedFrameOptions = {}): TransportFrame[] {
  const factor = opts.factor ?? 1;
  const maxAngle = opts.maxAngle ?? 0.6;
  const smoothPasses = Math.max(0, Math.floor(opts.smooth ?? 2));
  const upRef = normalize(opts.up ?? vec3(0, 1, 0));

  const base = parallelTransportFrames(curve.points, {
    closed: curve.closed,
    initialNormal: upRef,
  });
  const n = base.length;
  if (n < 2) return base;

  const pts = curve.points;
  const closed = curve.closed;

  // Signed curvature at each point: angle between incoming/outgoing tangents,
  // signed by which way it turns relative to the up reference, divided by the
  // local segment length (so tight turns bank harder than gentle ones).
  const bank: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
    const cur = pts[i]!;
    const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
    const tIn = sub(cur, prev);
    const tOut = sub(next, cur);
    const liIn = length(tIn), liOut = length(tOut);
    if (liIn < 1e-9 || liOut < 1e-9) continue;
    const a = scale(tIn, 1 / liIn);
    const b = scale(tOut, 1 / liOut);
    // Turn angle between the two tangents.
    const turn = Math.acos(clamp(dot(a, b), -1, 1));
    // Sign: does the turn go clockwise or counter-clockwise about the up axis?
    const sign = Math.sign(dot(cross(a, b), upRef)) || 0;
    const segLen = 0.5 * (liIn + liOut);
    // Curvature ~ turn / arc length; scaled and clamped into a bank angle.
    const curvature = segLen > 1e-6 ? turn / segLen : 0;
    bank[i] = clamp(sign * curvature * factor, -maxAngle, maxAngle);
  }

  // Smooth the bank profile so transitions are gradual (box blur, wrap-aware).
  for (let pass = 0; pass < smoothPasses; pass++) {
    const src = bank.slice();
    for (let i = 0; i < n; i++) {
      const l = src[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]!;
      const c = src[i]!;
      const r = src[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]!;
      bank[i] = (l + 2 * c + r) * 0.25;
    }
  }

  // Roll each frame's normal/binormal about its tangent by the bank angle.
  return base.map((f, i) => {
    const angle = bank[i]!;
    if (Math.abs(angle) < 1e-6) return f;
    const normal = normalize(rotateAroundAxis(f.normal, f.tangent, angle));
    const binormal = normalize(cross(f.tangent, normal));
    return { position: f.position, tangent: f.tangent, normal, binormal };
  });
}


// ---------------------------------------------------------------------------
// 2. Track surface — sweep a road cross-section with optional coving skirts.
// ---------------------------------------------------------------------------

export interface TrackSurfaceOptions {
  /** Half-width of the flat driving surface (centre to edge). Default 4. */
  width?: number;
  /**
   * Coving: length of the skirt that flares outward+down from each road edge to
   * blend into terrain. 0 disables (hard edge). Default 0.
   */
  coving?: number;
  /** How far the coving edge drops below the road plane. Default = coving. */
  covingDrop?: number;
  /** Auto-bank options; pass factor 0 for a flat (unbanked) road. */
  bank?: BankedFrameOptions;
  /** Per-t width multiplier (0..1 along curve) for pinch/widen. */
  widthAt?: (t: number) => number;
}

/**
 * Build a road-surface cross-section (in the frame's normal/binormal plane) and
 * sweep it along the curve using banked frames. The section is symmetric:
 *
 *   left coving edge — left road edge — centre — right road edge — right coving
 *
 * With `coving > 0` the outer verts flare out and drop by `covingDrop`, giving a
 * smooth skirt that can be rayed/merged onto terrain instead of floating.
 *
 * The binormal is the road's "sideways" axis and the normal is "up", so banking
 * (which rolls those two about the tangent) tilts the whole section correctly.
 */
export function trackSurface(curve: Curve, opts: TrackSurfaceOptions = {}): Mesh {
  const halfWidth = opts.width ?? 4;
  const coving = Math.max(0, opts.coving ?? 0);
  const drop = opts.covingDrop ?? coving;
  const widthAt = opts.widthAt ?? (() => 1);
  const frames = bankedFrames(curve, opts.bank ?? {});
  const n = frames.length;
  if (n < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });

  // Cross-section sample offsets along the road's sideways (u) axis, paired with
  // a vertical (up) offset. u is signed half-width fraction; the coving verts sit
  // beyond ±1 and dip down. Ordered left→right so triangles wind consistently.
  const section: { u: number; up: number }[] = coving > 0
    ? [
        { u: -1 - coving / halfWidth, up: -drop },
        { u: -1, up: 0 },
        { u: 1, up: 0 },
        { u: 1 + coving / halfWidth, up: -drop },
      ]
    : [
        { u: -1, up: 0 },
        { u: 1, up: 0 },
      ];
  const m = section.length;

  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const f = frames[i]!;
    const w = halfWidth * widthAt(i / (n - 1));
    for (let j = 0; j < m; j++) {
      const s = section[j]!;
      const off = add(scale(f.binormal, s.u * w), scale(f.normal, s.up));
      positions.push(add(f.position, off));
      normals.push(f.normal);
      uvs.push(vec2(i / (n - 1), (s.u + 1) * 0.5));
    }
  }

  const rings = curve.closed ? n : n - 1;
  for (let i = 0; i < rings; i++) {
    const s0 = (i % n) * m;
    const s1 = ((i + 1) % n) * m;
    for (let j = 0; j < m - 1; j++) {
      const a0 = s0 + j, a1 = s0 + j + 1;
      const b0 = s1 + j, b1 = s1 + j + 1;
      indices.push(a0, a1, b1, a0, b1, b0);
    }
  }

  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}


// ---------------------------------------------------------------------------
// 3. Instance along curve — resample to fixed spacing, stamp meshes.
// ---------------------------------------------------------------------------

export interface InstanceAlongCurveOptions {
  /** Target arc-length spacing between instances. Default 2. */
  spacing?: number;
  /** Explicit instance count (overrides spacing when set). */
  count?: number;
  /**
   * Sideways offset from the centreline along the road's binormal (banked).
   * Positive = right side, negative = left. Use to line rails/cones on an edge.
   * Default 0 (on the centreline).
   */
  offset?: number;
  /** Skip this many spacing steps at each end (Houdini "Ends Offset"). Default 0. */
  endsOffset?: number;
  /** Auto-bank options so props tilt with the banked road. Default flat. */
  bank?: BankedFrameOptions;
  /** Per-instance uniform scale (t is 0..1 along curve). */
  scaleAt?: (t: number) => number;
  /** Per-instance extra yaw about the local up axis (radians). */
  yawAt?: (t: number) => number;
  /** Variant index into a mesh library (t is 0..1). Default 0. */
  variantAt?: (t: number) => number;
}

/**
 * Resample a curve to even spacing and stamp `library` meshes at each point,
 * oriented to the (optionally banked) road frame. This is the shared engine for
 * guard rails, tyre stacks, road cones, fence posts — anything repeated along a
 * track. Offsets ride the road's sideways axis so props sit on the edge, not the
 * world axis, and stay glued to the surface through banked corners.
 */
export function instanceAlongCurve(
  curve: Curve,
  library: Mesh | ReadonlyArray<Mesh>,
  opts: InstanceAlongCurveOptions = {},
): Mesh {
  const spacing = opts.spacing && opts.spacing > 0 ? opts.spacing : 2;
  const offset = opts.offset ?? 0;
  const ends = Math.max(0, Math.floor(opts.endsOffset ?? 0));

  const resampled = opts.count != null
    ? resampleCurve(curve, { count: opts.count })
    : resampleCurve(curve, { segmentLength: spacing });
  const frames = bankedFrames(resampled, opts.bank ?? {});
  const n = frames.length;
  if (n === 0) return merge();

  // Trim the ends (start/finish straights often shouldn't carry props).
  const lo = Math.min(ends, Math.floor((n - 1) / 2));
  const hi = curve.closed ? n : n - lo;
  const start = curve.closed ? 0 : lo;

  const pts: Vec3[] = [];
  const normals: Vec3[] = [];
  const scales: number[] = [];
  const yaws: number[] = [];
  const variants: number[] = [];
  for (let i = start; i < hi; i++) {
    const f = frames[i]!;
    const t = n > 1 ? i / (n - 1) : 0;
    // Offset sideways along the banked road axis, keeping props on the surface.
    pts.push(add(f.position, scale(f.binormal, offset)));
    normals.push(f.normal);
    scales.push(opts.scaleAt ? opts.scaleAt(t) : 1);
    yaws.push(opts.yawAt ? opts.yawAt(t) : 0);
    variants.push(opts.variantAt ? opts.variantAt(t) : 0);
  }
  if (pts.length === 0) return merge();

  const pc = makePointCloud({
    points: pts,
    normals,
    attributes: { __scale: scales, __yaw: yaws, __variant: variants },
  });

  return copyToPoints(pc, library, {
    alignToNormal: true,
    scale: (ctx) => ctx.attributes.__scale?.[ctx.index] ?? 1,
    yaw: (ctx) => ctx.attributes.__yaw?.[ctx.index] ?? 0,
    variant: (ctx) => ctx.attributes.__variant?.[ctx.index] ?? 0,
  });
}

