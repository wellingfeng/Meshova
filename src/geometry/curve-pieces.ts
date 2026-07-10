/**
 * Curve-pieces — reverse-engineered from Houdini "project_titan" tools
 * (Tutorial_Rail, Tutorial_fence, TUT_ad_boards). The shared Houdini pattern:
 *
 *   1. resample a curve into segments (Resample SOP)
 *   2. read each segment's rest length (@restlength / measure prim length)
 *   3. classify the segment into a size bucket by length thresholds
 *      (Rail: >3m large, 1..3m medium, <1m small — an Attribute Wrangle)
 *   4. copy a piece mesh onto each segment, oriented to the tangent, and
 *      stretch it along-curve so the piece exactly fills the segment
 *      (Rail wrangle: `@scale = set(1, 1, @restlength / ch("../length"))`)
 *
 * This module provides that pipeline deterministically, decoupled from any one
 * tool: `segmentCurve` does steps 1-3, `layoutPiecesOnCurve` does step 4.
 *
 * Convention: a "piece" mesh is authored to span 1 unit along +Z (the
 * along-curve axis), centred on X/Y, resting on the curve point. The layout
 * builds an orthonormal frame {right, up, forward} at each segment and stretches
 * the piece's local +Z by (segmentLength / piece.restLength).
 */
import { vec3, add, sub, scale, cross, normalize, length, lerpVec3, type Vec3 } from "../math/vec3.js";
import type { Mat4 } from "../math/mat4.js";
import { applyMatrix } from "./transform.js";
import { merge } from "./mesh.js";
import { resampleCurve, curveLength } from "./curve.js";
import type { Curve } from "./curve.js";
import type { Mesh } from "./mesh.js";

/** One resampled segment along the curve. */
export interface CurveSegment {
  /** Segment index along the curve (0-based). */
  readonly index: number;
  /** Midpoint of the segment (piece anchor). */
  readonly center: Vec3;
  /** Segment start point. */
  readonly start: Vec3;
  /** Segment end point. */
  readonly end: Vec3;
  /** Along-curve unit tangent (start -> end). */
  readonly tangent: Vec3;
  /** Rest length of the segment (Houdini @restlength). */
  readonly restLength: number;
  /** Bucket index this segment was classified into (-1 if unbucketed). */
  readonly bucket: number;
  /** Normalised arc position of the center in [0,1]. */
  readonly t: number;
}

export interface SegmentOptions {
  /** Fixed number of segments. Overrides `segmentLength` when set. */
  count?: number;
  /**
   * Target segment length (metres). Houdini Resample "Length" mode. The curve
   * is divided into the nearest whole number of segments of this length.
   */
  segmentLength?: number;
  /**
   * Ascending length thresholds that bucket each segment by rest length.
   * A segment of rest length L gets bucket = number of thresholds it exceeds.
   * Example (Rail): [1, 3] -> <1 => 0 (small), 1..3 => 1 (medium), >3 => 2 (large).
   * Omit for a single bucket (all 0).
   */
  bucketThresholds?: ReadonlyArray<number>;
  /**
   * When false, use the curve's authored vertices directly instead of
   * resampling to equal spacing. Segments keep their natural (varying) lengths,
   * so buckets differentiate them (Fence/AdBoard place at drawn vertices).
   * Default true (Rail-style equal resample).
   */
  resample?: boolean;
  /** Up reference for frame construction (default world +Y). */
  up?: Vec3;
}

/**
 * Resample a curve into evenly spaced segments and classify each by length.
 * Mirrors Houdini Resample SOP + the Rail classification Attribute Wrangle.
 */
export function segmentCurve(curve: Curve, opts: SegmentOptions = {}): CurveSegment[] {
  const total = curveLength(curve);
  if (total <= 0) return [];

  // Resample to equal spacing (Rail) or keep authored vertices (Fence).
  let pts: ReadonlyArray<Vec3>;
  if (opts.resample === false) {
    pts = curve.points;
  } else {
    let count = opts.count;
    if (count == null) {
      const segLen = opts.segmentLength && opts.segmentLength > 0 ? opts.segmentLength : total / 12;
      count = Math.max(2, Math.round(total / segLen) + (curve.closed ? 0 : 1));
    }
    pts = resampleCurve(curve, { count }).points;
  }
  const thresholds = opts.bucketThresholds ?? [];

  const segCount = curve.closed ? pts.length : pts.length - 1;
  const segments: CurveSegment[] = [];
  let acc = 0;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const d = sub(b, a);
    const restLength = length(d);
    if (restLength <= 1e-9) continue;
    const tangent = scale(d, 1 / restLength);
    const center = scale(add(a, b), 0.5);
    let bucket = 0;
    for (const th of thresholds) if (restLength > th) bucket++;
    segments.push({
      index: segments.length,
      center,
      start: a,
      end: b,
      tangent,
      restLength,
      bucket,
      t: total > 0 ? (acc + restLength * 0.5) / total : 0,
    });
    acc += restLength;
  }
  return segments;
}

/** Orthonormal frame {right(X), up(Y), forward(Z)} from a forward tangent. */
function frameFromTangent(forward: Vec3, upRef: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
  const z = normalize(forward);
  let x = cross(upRef, z);
  if (length(x) < 1e-6) {
    // tangent parallel to up: pick an alternate reference.
    x = cross(vec3(1, 0, 0), z);
  }
  x = normalize(x);
  const y = normalize(cross(z, x));
  return { x, y, z };
}

/**
 * Build a column-major Mat4 that maps a piece's local space onto a segment:
 * local +Z stretched to fill the segment, oriented to the tangent frame,
 * translated to the anchor. `stretchZ` is the along-curve scale
 * (segmentLength / pieceRestLength in the Rail wrangle).
 */
export function segmentMatrix(
  seg: CurveSegment,
  stretchZ: number,
  opts: { up?: Vec3; scale?: Vec3; anchor?: Vec3 } = {},
): Mat4 {
  const upRef = opts.up ?? vec3(0, 1, 0);
  const s = opts.scale ?? vec3(1, 1, 1);
  const { x, y, z } = frameFromTangent(seg.tangent, upRef);
  const anchor = opts.anchor ?? seg.center;
  const sx = s.x;
  const sy = s.y;
  const sz = s.z * stretchZ;
  // Column-major (m[col*4+row]): columns are scaled basis vectors, last = anchor.
  return new Float32Array([
    x.x * sx, x.y * sx, x.z * sx, 0,
    y.x * sy, y.y * sy, y.z * sy, 0,
    z.x * sz, z.y * sz, z.z * sz, 0,
    anchor.x, anchor.y, anchor.z, 1,
  ]) as Mat4;
}

export interface LayoutOptions extends SegmentOptions {
  /**
   * Per-bucket piece meshes. Each piece must span `pieceLengths[bucket]` along
   * local +Z. The segment picks `pieces[seg.bucket]` (clamped).
   */
  pieces: ReadonlyArray<Mesh>;
  /**
   * Authored along-Z length of each piece, matching `pieces`. The Rail wrangle
   * divides restLength by this to compute the stretch. Defaults to 1 each.
   */
  pieceLengths?: ReadonlyArray<number>;
  /** Extra uniform XY scale per placement (default 1). */
  crossScale?: number;
  /**
   * If true, do NOT stretch pieces to fill; place at natural length centred on
   * the segment (Fence-style rigid posts). Default false (Rail-style stretch).
   */
  rigid?: boolean;
}

/**
 * Copy per-bucket pieces onto curve segments, oriented and stretched to fill —
 * the Houdini Rail/Fence "copy to segments" step. Returns one merged mesh.
 */
export function layoutPiecesOnCurve(curve: Curve, opts: LayoutOptions): Mesh {
  const segs = segmentCurve(curve, opts);
  if (segs.length === 0 || opts.pieces.length === 0) return merge();
  const lens = opts.pieceLengths ?? opts.pieces.map(() => 1);
  const cross = opts.crossScale ?? 1;
  const placed: Mesh[] = [];
  for (const seg of segs) {
    const bi = Math.min(seg.bucket, opts.pieces.length - 1);
    const piece = opts.pieces[bi]!;
    const pieceLen = lens[bi] ?? 1;
    const stretchZ = opts.rigid ? 1 : pieceLen > 1e-9 ? seg.restLength / pieceLen : 1;
    const matOpts: { up?: Vec3; scale?: Vec3 } = { scale: vec3(cross, cross, 1) };
    if (opts.up) matOpts.up = opts.up;
    placed.push(applyMatrix(piece, segmentMatrix(seg, stretchZ, matOpts)));
  }
  return merge(...placed);
}

export interface CatenaryOptions {
  /** Vertices along the hanging curve (>=2). Default 24. */
  segments?: number;
  /**
   * Sag depth as a fraction of the horizontal span (0 = taut straight line).
   * The Houdini cable tool solves this with a Vellum sim; we use the analytic
   * catenary shape so it is deterministic and cheap. Default 0.15.
   */
  sag?: number;
}

/**
 * Analytic catenary between two anchors — deterministic replacement for the
 * Vellum sag solve in Houdini "tutorial_cable.hda". A real hanging cable follows
 * y = a·cosh(x/a); we fit `a` from the requested sag fraction, then sample the
 * curve and add the linear endpoint interpolation back so the two ends meet the
 * anchors exactly regardless of their height difference.
 */
export function catenaryCurve(a: Vec3, b: Vec3, opts: CatenaryOptions = {}): Curve {
  const n = Math.max(2, Math.floor(opts.segments ?? 24));
  const sag = Math.max(0, opts.sag ?? 0.15);
  const span = length(sub(b, a));
  if (span < 1e-9 || sag < 1e-9) {
    // Degenerate / taut: straight line.
    const pts: Vec3[] = [];
    for (let i = 0; i < n; i++) pts.push(lerpVec3(a, b, i / (n - 1)));
    return { points: pts, closed: false };
  }
  // Fit catenary parameter from desired mid-sag = sag * span.
  const targetSag = sag * span;
  // For a symmetric catenary over span L with sag d: d = a*(cosh(L/(2a)) - 1).
  // Solve for a by bisection (monotonic in a).
  let lo = 1e-4;
  let hi = span * 100;
  const midSagOf = (aa: number) => aa * (Math.cosh(span / (2 * aa)) - 1);
  for (let it = 0; it < 60; it++) {
    const mid = 0.5 * (lo + hi);
    if (midSagOf(mid) > targetSag) lo = mid;
    else hi = mid;
  }
  const aa = 0.5 * (lo + hi);
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Linear interpolation between anchors (handles height difference).
    const base = lerpVec3(a, b, t);
    // Catenary drop, zero at both ends, max at centre.
    const x = (t - 0.5) * span;
    const drop = aa * (Math.cosh(x / aa) - Math.cosh(span / (2 * aa)));
    pts.push(vec3(base.x, base.y + drop, base.z));
  }
  return { points: pts, closed: false };
}
