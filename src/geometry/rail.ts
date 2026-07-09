/**
 * Procedural railway track (P-rail): a companion to road.ts. Where a road is a
 * single flat ribbon, a railway is a *kit* of repeated parts swept / arrayed
 * along a centerline curve:
 *
 *   1. Ballast bed  — a trapezoidal prism (wide bottom, narrow top) swept along
 *      the spline. This is the crushed-stone embankment the track sits on.
 *   2. Sleepers/ties — box blocks arrayed at a fixed pitch across the track,
 *      perpendicular to the travel direction (wood/concrete).
 *   3. Rails         — two steel rails offset left/right of the centerline by
 *      half the gauge, each an I-beam-ish profile swept along the spline.
 *
 * Like road.ts everything rides a ground-aligned frame: the local right vector
 * is cross(flattened-tangent, worldUp), so sleepers stay level and rails stay
 * upright through bends. Deterministic: same centerline + params -> same mesh.
 *
 * Convention (shared with the rest of Meshova): track runs on the XZ plane,
 * +Y up. The centerline Y (plus verticalOffset) sets the top-of-ballast
 * height, and the kit stacks upward from there: ballast top -> sleeper ->
 * rail foot -> rail head.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, sub, scale, cross, normalize, length } from "../math/vec3.js";
import { vec2, type Vec2 } from "../math/vec2.js";
import { clamp } from "../math/scalar.js";
import type { Curve } from "./curve.js";
import { resampleCurve } from "./curve.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals, merge } from "./mesh.js";
import { box } from "./primitives.js";
import { transform } from "./transform.js";

const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** Standard gauge (distance between the inner faces of the two rails), metres. */
export const STANDARD_GAUGE = 1.435;

/** A sample frame along the centerline: position + ground-aligned right vector. */
interface Frame {
  center: Vec3;
  right: Vec3;
  tangent: Vec3;
  /** Arc-length distance from the start. */
  dist: number;
}

/** Cumulative arc length at each point of a polyline. */
function cumulative(points: Vec3[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1]! + length(sub(points[i]!, points[i - 1]!)));
  }
  return cum;
}

/** Flattened (XZ) tangent at point i via neighbour difference. */
function tangentAt(points: Vec3[], i: number): Vec3 {
  const n = points.length;
  const prev = points[Math.max(0, i - 1)]!;
  const next = points[Math.min(n - 1, i + 1)]!;
  const raw = sub(next, prev);
  const t = vec3(raw.x, 0, raw.z);
  if (Math.abs(t.x) < 1e-9 && Math.abs(t.z) < 1e-9) return { x: 1, y: 0, z: 0 };
  return normalize(t);
}

/**
 * Build per-point ground-aligned frames along the (densified) centerline.
 * The right vector is cross(tangent, up) so lateral offsets stay horizontal.
 */
function buildFrames(centerline: Curve, sampleDistance: number): Frame[] {
  const dense = resampleCurve(centerline, { segmentLength: Math.max(0.05, sampleDistance) });
  const pts = dense.points;
  const cum = cumulative(pts);
  const frames: Frame[] = [];
  for (let i = 0; i < pts.length; i++) {
    const tan = tangentAt(pts, i);
    const right = cross(tan, UP);
    const rl = length(right);
    frames.push({
      center: { ...pts[i]! },
      right: rl > 1e-9 ? scale(right, 1 / rl) : { x: 0, y: 0, z: 1 },
      tangent: tan,
      dist: cum[i]!,
    });
  }
  return frames;
}

/**
 * Sweep a 2D profile (x = lateral offset from centerline, y = height above the
 * frame center) along the ground-aligned frames. Unlike the generic
 * profileSweep this keeps the profile's Y strictly vertical so ballast slopes
 * and rail webs never bank on curves. Optionally caps the two open ends.
 */
function sweepGroundProfile(frames: Frame[], profile: Vec2[], caps: boolean): Mesh {
  const m = profile.length;
  const n = frames.length;
  if (n < 2 || m < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });

  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const totalDist = frames[n - 1]!.dist || 1;

  for (let i = 0; i < n; i++) {
    const f = frames[i]!;
    for (let j = 0; j < m; j++) {
      const p = profile[j]!;
      const pos = add(add(f.center, scale(f.right, p.x)), vec3(0, p.y, 0));
      positions.push(pos);
      uvs.push(vec2(f.dist / totalDist, j / (m - 1)));
    }
  }

  for (let i = 0; i < n - 1; i++) {
    const s0 = i * m;
    const s1 = (i + 1) * m;
    for (let j = 0; j < m - 1; j++) {
      const a0 = s0 + j, a1 = s0 + j + 1;
      const b0 = s1 + j, b1 = s1 + j + 1;
      indices.push(a0, a1, b1, a0, b1, b0);
    }
  }

  if (caps) {
    // Fan-cap both open ends using the profile centroid.
    capEnd(positions, uvs, indices, 0, m, false);
    capEnd(positions, uvs, indices, (n - 1) * m, m, true);
  }

  const normals = positions.map(() => vec3(0, 1, 0));
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

function capEnd(
  positions: Vec3[], uvs: Vec2[], indices: number[],
  base: number, m: number, flip: boolean,
): void {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < m; i++) { const p = positions[base + i]!; cx += p.x; cy += p.y; cz += p.z; }
  const inv = 1 / m;
  const c = positions.length;
  positions.push(vec3(cx * inv, cy * inv, cz * inv));
  uvs.push(vec2(0.5, 0.5));
  for (let i = 0; i < m - 1; i++) {
    const a = base + i, b = base + i + 1;
    if (flip) indices.push(c, a, b);
    else indices.push(c, b, a);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RailwayOptions {
  /** Gauge: distance between the two rails (inner faces). Default: standard 1.435m. */
  gauge?: number;
  /** Base spacing between centerline samples along the spline (arc length). */
  sampleDistance?: number;
  /** Extra Y offset applied to the whole kit (lift above terrain). */
  verticalOffset?: number;

  // --- Ballast (crushed-stone embankment) ---
  /** Top width of the ballast bed (metres). */
  ballastTopWidth?: number;
  /** Extra width added to each side at the bottom (shoulder slope run). */
  ballastShoulder?: number;
  /** Height of the ballast prism (metres). */
  ballastHeight?: number;

  // --- Sleepers / ties ---
  /** Along-track spacing (pitch) between sleeper centers (metres). */
  sleeperSpacing?: number;
  /** Sleeper length across the track (metres). Should exceed the gauge. */
  sleeperLength?: number;
  /** Sleeper width along the track (metres). */
  sleeperWidth?: number;
  /** Sleeper thickness (Y, metres). */
  sleeperHeight?: number;

  // --- Rails ---
  /** Rail head height above the sleeper top (total rail section height). */
  railHeight?: number;
  /** Rail head width (metres). */
  railHeadWidth?: number;
  /** Rail foot width (metres). */
  railFootWidth?: number;
}

interface Resolved {
  gauge: number;
  sampleDistance: number;
  verticalOffset: number;
  ballastTopWidth: number;
  ballastShoulder: number;
  ballastHeight: number;
  sleeperSpacing: number;
  sleeperLength: number;
  sleeperWidth: number;
  sleeperHeight: number;
  railHeight: number;
  railHeadWidth: number;
  railFootWidth: number;
}

function resolve(o: RailwayOptions): Resolved {
  const gauge = Math.max(0.3, o.gauge ?? STANDARD_GAUGE);
  return {
    gauge,
    sampleDistance: Math.max(0.05, o.sampleDistance ?? 1),
    verticalOffset: o.verticalOffset ?? 0,
    ballastTopWidth: Math.max(gauge + 0.4, o.ballastTopWidth ?? gauge + 1.2),
    ballastShoulder: Math.max(0, o.ballastShoulder ?? 0.9),
    ballastHeight: Math.max(0.05, o.ballastHeight ?? 0.4),
    sleeperSpacing: Math.max(0.1, o.sleeperSpacing ?? 0.6),
    sleeperLength: Math.max(gauge + 0.2, o.sleeperLength ?? gauge + 0.85),
    sleeperWidth: Math.max(0.05, o.sleeperWidth ?? 0.26),
    sleeperHeight: Math.max(0.03, o.sleeperHeight ?? 0.18),
    railHeight: Math.max(0.03, o.railHeight ?? 0.17),
    railHeadWidth: Math.max(0.02, o.railHeadWidth ?? 0.07),
    railFootWidth: Math.max(0.04, o.railFootWidth ?? 0.13),
  };
}

/**
 * Ballast bed: a trapezoidal prism swept along the centerline. Wide at the
 * bottom (topWidth + 2*shoulder), narrow at the top (topWidth), sloping inward
 * as real crushed-stone embankments do. Top sits at the centerline Y; the
 * prism drops downward by ballastHeight.
 */
export function railwayBallast(centerline: Curve, options: RailwayOptions = {}): Mesh {
  const opt = resolve(options);
  const frames = buildFrames(centerline, opt.sampleDistance);
  if (frames.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });

  const topHalf = opt.ballastTopWidth / 2;
  const botHalf = topHalf + opt.ballastShoulder;
  const yTop = opt.verticalOffset;
  const yBot = opt.verticalOffset - opt.ballastHeight;
  // Closed trapezoid profile, CCW when viewed down the +tangent axis.
  const profile: Vec2[] = [
    vec2(-botHalf, yBot),
    vec2(botHalf, yBot),
    vec2(topHalf, yTop),
    vec2(-topHalf, yTop),
    vec2(-botHalf, yBot),
  ];
  return sweepGroundProfile(frames, profile, true);
}

/**
 * Sleepers/ties: box blocks arrayed at a fixed pitch along the centerline, each
 * oriented so its long axis crosses the track (along the local right vector).
 * They rest on top of the ballast. Returns one merged mesh.
 */
export function railwaySleepers(centerline: Curve, options: RailwayOptions = {}): Mesh {
  const opt = resolve(options);
  const dense = resampleCurve(centerline, { segmentLength: Math.max(0.05, opt.sampleDistance) });
  const pts = dense.points;
  if (pts.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const cum = cumulative(pts);
  const total = cum[cum.length - 1]!;

  // Unit box: length across track (x) = sleeperLength, width (z) = sleeperWidth.
  const yCenter = opt.verticalOffset + opt.sleeperHeight / 2;
  const sleepers: Mesh[] = [];

  for (let d = opt.sleeperSpacing * 0.5; d <= total - opt.sleeperSpacing * 0.25; d += opt.sleeperSpacing) {
    // Locate the segment containing distance d.
    let seg = 0;
    while (seg < cum.length - 1 && cum[seg + 1]! < d) seg++;
    const segLen = cum[seg + 1]! - cum[seg]!;
    const t = segLen > 1e-9 ? (d - cum[seg]!) / segLen : 0;
    const a = pts[seg]!;
    const b = pts[Math.min(pts.length - 1, seg + 1)]!;
    const center = add(a, scale(sub(b, a), t));
    const tan = tangentAt(pts, seg);
    // Yaw: rotate the box so its +Z (width) aligns with the travel tangent.
    const yaw = Math.atan2(tan.x, tan.z);
    const block = transform(box(opt.sleeperLength, opt.sleeperHeight, opt.sleeperWidth), {
      rotate: vec3(0, yaw, 0),
      translate: vec3(center.x, center.y + yCenter, center.z),
    });
    sleepers.push(block);
  }
  if (sleepers.length === 0) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  return merge(...sleepers);
}

/** I-beam-ish rail cross-section (foot / web / head), centered on x=0. */
function railProfile(opt: Resolved, baseY: number): Vec2[] {
  const footHalf = opt.railFootWidth / 2;
  const headHalf = opt.railHeadWidth / 2;
  const webHalf = Math.max(0.008, opt.railHeadWidth * 0.28);
  const h = opt.railHeight;
  const footH = h * 0.22;
  const headH = h * 0.28;
  const y0 = baseY;
  return [
    vec2(-footHalf, y0),
    vec2(footHalf, y0),
    vec2(footHalf, y0 + footH),
    vec2(webHalf, y0 + footH),
    vec2(webHalf, y0 + h - headH),
    vec2(headHalf, y0 + h - headH),
    vec2(headHalf, y0 + h),
    vec2(-headHalf, y0 + h),
    vec2(-webHalf, y0 + h - headH),
    vec2(-webHalf, y0 + footH),
    vec2(-footHalf, y0 + footH),
    vec2(-footHalf, y0), // close
  ];
}

/**
 * The two steel rails: an I-beam profile swept along the centerline, offset
 * left/right by half the gauge. Rails sit on top of the sleepers. Returns both
 * rails merged into one mesh.
 */
export function railwayRails(centerline: Curve, options: RailwayOptions = {}): Mesh {
  const opt = resolve(options);
  const frames = buildFrames(centerline, opt.sampleDistance);
  if (frames.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });

  const baseY = opt.verticalOffset + opt.sleeperHeight;
  const halfGauge = opt.gauge / 2 + opt.railFootWidth / 2; // gauge = inner-face distance
  const section = railProfile(opt, baseY);

  const makeRail = (side: 1 | -1): Mesh => {
    const shifted = frames.map((f) => ({
      ...f,
      center: add(f.center, scale(f.right, side * halfGauge)),
    }));
    return sweepGroundProfile(shifted, section, true);
  };
  return merge(makeRail(1), makeRail(-1));
}

/**
 * Convenience: build ballast + sleepers + rails and merge into a single mesh.
 * For separate materials (stone / wood / steel) call the three builders
 * individually and keep them as distinct parts.
 */
export function railwayTrack(centerline: Curve, options: RailwayOptions = {}): Mesh {
  return merge(
    railwayBallast(centerline, options),
    railwaySleepers(centerline, options),
    railwayRails(centerline, options),
  );
}
